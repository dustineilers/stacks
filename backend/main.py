from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl, Field


app = FastAPI(
    title="Stacks Recipe Import API",
    version="1.0.0",
    description="Imports Schema.org Recipe JSON-LD from recipe URLs.",
)

# Tighten this to your Stacks frontend origin in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_HTML_BYTES = 10 * 1024 * 1024
TIMEOUT = httpx.Timeout(20.0, connect=10.0)

USER_AGENT = (
    "StacksRecipeImporter/1.0 "
    "(recipe metadata importer; +https://schema.org/Recipe)"
)


class ImportRequest(BaseModel):
    url: HttpUrl


class Ingredient(BaseModel):
    raw: str
    quantity: str | None = None
    unit: str | None = None
    name: str | None = None
    note: str | None = None


class Instruction(BaseModel):
    step: int
    text: str
    name: str | None = None


class Recipe(BaseModel):
    name: str
    author: str | None = None
    description: str | None = None
    image: str | None = None
    source_url: str
    publisher: str | None = None
    yield_text: str | None = None
    prep_time: str | None = None
    cook_time: str | None = None
    total_time: str | None = None
    cuisine: str | None = None
    category: str | None = None
    keywords: list[str] = Field(default_factory=list)
    ingredients: list[Ingredient] = Field(default_factory=list)
    instructions: list[Instruction] = Field(default_factory=list)
    nutrition: dict[str, Any] | None = None


class ImportResponse(BaseModel):
    success: bool
    source: str
    source_url: str
    recipe: Recipe


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = re.sub(r"\s+", " ", value).strip()
        return value or None
    return str(value).strip() or None


def first_text(value: Any) -> str | None:
    """Turn common Schema.org Person/Organization/string forms into text."""
    if isinstance(value, str):
        return clean_text(value)
    if isinstance(value, dict):
        return clean_text(value.get("name") or value.get("value"))
    if isinstance(value, list):
        for item in value:
            result = first_text(item)
            if result:
                return result
    return None


def find_recipe_objects(value: Any) -> list[dict[str, Any]]:
    """Recursively find every object whose @type contains Recipe."""
    found: list[dict[str, Any]] = []

    if isinstance(value, dict):
        type_value = value.get("@type")
        types = type_value if isinstance(type_value, list) else [type_value]
        if any(isinstance(t, str) and t.lower().endswith("recipe") for t in types):
            found.append(value)

        for child in value.values():
            found.extend(find_recipe_objects(child))

    elif isinstance(value, list):
        for child in value:
            found.extend(find_recipe_objects(child))

    return found


def parse_json_ld(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    recipes: list[dict[str, Any]] = []

    for script in soup.find_all("script", attrs={"type": re.compile(r"application/ld\+json", re.I)}):
        raw = script.string or script.get_text()
        if not raw or not raw.strip():
            continue

        # JSON-LD is sometimes HTML-escaped or contains harmless whitespace.
        raw = raw.strip().replace("\u2028", " ").replace("\u2029", " ")

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # A few publishers wrap JSON in comments; try the inner object.
            match = re.search(r"(\{.*\}|\[.*\])", raw, re.DOTALL)
            if not match:
                continue
            try:
                data = json.loads(match.group(1))
            except json.JSONDecodeError:
                continue

        recipes.extend(find_recipe_objects(data))

    return recipes


def normalize_keywords(value: Any) -> list[str]:
    if isinstance(value, list):
        return [x for x in (clean_text(v) for v in value) if x]
    text = clean_text(value)
    if not text:
        return []

    # Most publishers use comma-separated keywords.
    return [x.strip() for x in re.split(r"\s*,\s*", text) if x.strip()]


def normalize_image(value: Any, base_url: str) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("url") or value.get("contentUrl")
    value = clean_text(value)
    return urljoin(base_url, value) if value else None


def normalize_author(value: Any) -> str | None:
    return first_text(value)


def normalize_ingredients(value: Any) -> list[Ingredient]:
    if value is None:
        return []

    if isinstance(value, dict):
        # ItemList / @list wrappers.
        if isinstance(value.get("itemListElement"), list):
            value = value["itemListElement"]
        elif isinstance(value.get("@list"), list):
            value = value["@list"]
        else:
            value = [value]

    if not isinstance(value, list):
        value = [value]

    result: list[Ingredient] = []

    for item in value:
        if isinstance(item, str):
            raw = clean_text(item)
            if raw:
                result.append(parse_ingredient(raw))
            continue

        if isinstance(item, dict):
            # Schema.org PropertyValue.
            if item.get("@type") == "PropertyValue" or "value" in item:
                name = clean_text(item.get("name"))
                quantity = clean_text(item.get("value"))
                unit = clean_text(item.get("unitText") or item.get("unitCode"))
                raw = " ".join(x for x in [quantity, unit, name] if x)
                if raw:
                    result.append(
                        Ingredient(
                            raw=raw,
                            quantity=quantity,
                            unit=unit,
                            name=name,
                        )
                    )
                continue

            # ItemList entries may wrap the actual ingredient.
            nested = item.get("item")
            if nested is not None:
                result.extend(normalize_ingredients(nested))

    return result


# This is intentionally conservative. Keep the original raw ingredient so
# Stacks can improve parsing later without losing publisher wording.
UNIT_PATTERN = (
    r"tsp|teaspoons?|tbsp|tablespoons?|"
    r"cups?|pints?|quarts?|gallons?|"
    r"oz|ounces?|lb|pounds?|"
    r"grams?|g|kilograms?|kg|"
    r"ml|milliliters?|liters?|l|"
    r"cloves?|slices?|pieces?|cans?|packages?|"
    r"bunches?|heads?|stalks?|sprigs?|"
    r"pinches?|dashes?"
)

INGREDIENT_RE = re.compile(
    rf"^\s*(?P<qty>\d+(?:[./]\d+)?(?:\s+\d+/\d+)?|"
    rf"\d+\s*[-–]\s*\d+|"
    rf"(?:[¼½¾⅓⅔⅛⅜⅝⅞]))"
    rf"(?:\s+(?P<unit>{UNIT_PATTERN}))?"
    rf"(?:\s+of)?\s+(?P<name>.+?)\s*$",
    re.I,
)


def parse_ingredient(raw: str) -> Ingredient:
    match = INGREDIENT_RE.match(raw)
    if not match:
        return Ingredient(raw=raw, name=raw)

    quantity = clean_text(match.group("qty"))
    unit = clean_text(match.group("unit"))
    name = clean_text(match.group("name"))

    return Ingredient(
        raw=raw,
        quantity=quantity,
        unit=unit,
        name=name,
    )


def flatten_instruction(value: Any) -> list[tuple[str | None, str]]:
    """
    Supports:
      - string
      - HowToStep
      - HowToSection
      - ItemList
      - @list
    """
    output: list[tuple[str | None, str]] = []

    if value is None:
        return output

    if isinstance(value, str):
        text = clean_text(value)
        if text:
            output.append((None, text))
        return output

    if isinstance(value, list):
        for item in value:
            output.extend(flatten_instruction(item))
        return output

    if isinstance(value, dict):
        if isinstance(value.get("@list"), list):
            return flatten_instruction(value["@list"])

        if isinstance(value.get("itemListElement"), list):
            return flatten_instruction(value["itemListElement"])

        typ = value.get("@type")
        types = typ if isinstance(typ, list) else [typ]

        # Sections contain steps.
        if any(t == "HowToSection" for t in types if isinstance(t, str)):
            section_name = clean_text(value.get("name"))
            section_steps = value.get("itemListElement") or value.get("step")
            for _, text in flatten_instruction(section_steps):
                output.append((section_name, text))
            return output

        if any(t == "HowToStep" for t in types if isinstance(t, str)):
            text = clean_text(value.get("text") or value.get("name"))
            if text:
                output.append((clean_text(value.get("name")), text))
            return output

        # Generic object fallback.
        text = clean_text(value.get("text") or value.get("name"))
        if text:
            output.append((None, text))

    return output


def choose_best_recipe(recipes: list[dict[str, Any]]) -> dict[str, Any]:
    # Prefer recipes with both ingredients and instructions.
    return max(
        recipes,
        key=lambda r: (
            bool(r.get("recipeIngredient")),
            bool(r.get("recipeInstructions")),
            len(r.get("recipeIngredient") or []),
            len(r.get("recipeInstructions") or []),
            bool(r.get("name")),
        ),
    )


def normalize_recipe(data: dict[str, Any], source_url: str) -> Recipe:
    raw_instructions = flatten_instruction(data.get("recipeInstructions"))
    instructions = [
        Instruction(step=i, name=name, text=text)
        for i, (name, text) in enumerate(raw_instructions, start=1)
    ]

    publisher = first_text(data.get("publisher"))
    author = normalize_author(data.get("author"))

    return Recipe(
        name=clean_text(data.get("name")) or "Untitled Recipe",
        author=author,
        description=clean_text(data.get("description")),
        image=normalize_image(data.get("image"), source_url),
        source_url=source_url,
        publisher=publisher,
        yield_text=first_text(data.get("recipeYield")),
        prep_time=clean_text(data.get("prepTime")),
        cook_time=clean_text(data.get("cookTime")),
        total_time=clean_text(data.get("totalTime")),
        cuisine=clean_text(data.get("recipeCuisine")),
        category=clean_text(data.get("recipeCategory")),
        keywords=normalize_keywords(data.get("keywords")),
        ingredients=normalize_ingredients(data.get("recipeIngredient")),
        instructions=instructions,
        nutrition=data.get("nutrition") if isinstance(data.get("nutrition"), dict) else None,
    )


async def fetch_html(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(400, "URL must use http or https.")

    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        follow_redirects=True,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    ) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                502,
                f"Source returned HTTP {exc.response.status_code}. "
                "The recipe may require authentication or may not expose recipe data to this request.",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"Could not fetch source URL: {exc}") from exc

        content_type = response.headers.get("content-type", "")
        if "html" not in content_type.lower():
            raise HTTPException(415, "The URL did not return an HTML page.")

        content = response.content
        if len(content) > MAX_HTML_BYTES:
            raise HTTPException(413, "Source page is too large.")

        return content.decode(response.encoding or "utf-8", errors="replace")


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/api/import/recipe", response_model=ImportResponse)
async def import_recipe(request: ImportRequest):
    source_url = str(request.url)

    html = await fetch_html(source_url)
    recipes = parse_json_ld(html)

    if not recipes:
        raise HTTPException(
            422,
            "No Schema.org Recipe JSON-LD was found on this page. "
            "The source may use another format or require authorized access.",
        )

    recipe_data = choose_best_recipe(recipes)
    recipe = normalize_recipe(recipe_data, source_url)

    if not recipe.name or (
        not recipe.ingredients and not recipe.instructions
    ):
        raise HTTPException(
            422,
            "A Recipe object was found, but it did not contain usable "
            "ingredient or instruction data.",
        )

    return ImportResponse(
        success=True,
        source=recipe.publisher or "Recipe website",
        source_url=source_url,
        recipe=recipe,
    )
