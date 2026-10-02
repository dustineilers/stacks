from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel, Field, HttpUrl
from dotenv import load_dotenv

try:
    from google import genai
    from google.genai import types
except ImportError:  # Optional until Gemini search is used.
    genai = None
    types = None

load_dotenv()

app = FastAPI(
    title="Stacks Recipe Import API",
    version="1.2.0",
    description="Imports recipes from URLs and provides AI-powered cookbook search plus Google recipe discovery.",
)

# Tighten this to your Stacks frontend origin in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# --- Models for Recipe Import ---

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


# --- Models for Recipe Search ---

class SearchIngredient(BaseModel):
    raw: str | None = None
    name: str | None = None
    qty: str | None = None
    unit: str | None = None
    note: str | None = None
    category: str | None = None


class SearchRecipe(BaseModel):
    id: str
    name: str
    ingredients: list[str | SearchIngredient] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    cookbook: str | None = None
    rating: float | None = None
    times_cooked: int | None = None
    last_cooked: str | None = None


class RecipeSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=5000)
    recipes: list[SearchRecipe] = Field(min_length=1, max_length=5000)
    limit: int = Field(default=8, ge=1, le=30)


class SearchResult(BaseModel):
    recipe_id: str
    reason: str


class WebSearchResult(BaseModel):
    title: str
    url: str
    description: str
    source: str | None = None
    thumbnail: str


class RecipeSearchResponse(BaseModel):
    success: bool
    query: str
    results: list[SearchResult]
    web_results: list[WebSearchResult] = Field(default_factory=list)


# --- Gemini Configurations ---

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
SERPAPI_URL = "https://serpapi.com/search"

SEARCH_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "recipe_id": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["recipe_id", "reason"],
            },
        }
    },
    "required": ["results"],
}


def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini search is not configured. Set GEMINI_API_KEY in your environment.",
        )
    if genai is None:
        raise HTTPException(
            status_code=503,
            detail="Gemini support is not installed. Run: pip install google-genai",
        )
    return genai.Client(api_key=api_key)


def get_serpapi_key() -> str:
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Web recipe search is not configured. Set SERPAPI_API_KEY in your environment.",
        )
    return api_key


# --- Catalog Search Logic ---

def build_search_prompt(query: str, recipes: list[SearchRecipe], limit: int) -> str:
    catalog = []
    for recipe in recipes:
        catalog.append({
            "id": recipe.id,
            "name": recipe.name,
            "ingredients": recipe.ingredients,
            "tags": recipe.tags,
            "description": recipe.description,
            "cookbook": recipe.cookbook,
            "rating": recipe.rating,
            "times_cooked": recipe.times_cooked,
            "last_cooked": recipe.last_cooked,
        })

    return f"""You are the semantic search and recommendation engine for a personal cookbook app called Stacks.

The user is asking:
{query}

Below is the complete recipe catalog available to choose from.

{json.dumps(catalog, ensure_ascii=False)}

Find up to {limit} recipes that best satisfy the user's request.

Use judgment rather than literal keyword matching. The user may ask for concepts such as:
- autumn, summer, cozy, refreshing, comforting, bright, hearty, light
- impressive, easy, weeknight, project, date night
- something similar to a cuisine, trip, memory, ingredient, or style
- something they have not cooked recently
- something that fits a mood or occasion

Infer these concepts from recipe names, ingredients, tags, descriptions, cookbooks, cooking history, and the overall character of the dish. For example, a recipe does NOT need an 'autumn' tag to be a good autumn recipe. But do not invent ingredients or recipe facts that are not present in the catalog.

Prefer genuinely relevant matches over filling the requested number. If only 3 recipes are strong matches, return 3.

Return the selected recipe IDs and a short, natural explanation of why each recipe fits the user's request. The recipe_id must exactly match an ID in the catalog.
"""


async def gemini_recipe_search(request: RecipeSearchRequest) -> RecipeSearchResponse:
    client = get_gemini_client()
    prompt = build_search_prompt(request.query, request.recipes, request.limit)

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": SEARCH_RESPONSE_SCHEMA,
                "temperature": 0.2,
            },
        )
        payload = json.loads(response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini search failed: {exc}") from exc

    valid_ids = {recipe.id for recipe in request.recipes}
    seen: set[str] = set()
    results: list[SearchResult] = []

    for item in payload.get("results", []):
        recipe_id = item.get("recipe_id")
        reason = clean_text(item.get("reason"))
        if recipe_id not in valid_ids or recipe_id in seen or not reason:
            continue
        seen.add(recipe_id)
        results.append(SearchResult(recipe_id=recipe_id, reason=reason))
        if len(results) >= request.limit:
            break

    return RecipeSearchResponse(success=True, query=request.query, results=results)


# --- Web Recipe Search via SerpApi ---

async def serpapi_recipe_search(
    query: str,
    catalog_names: list[str],
    limit: int = 10,
) -> list[WebSearchResult]:
    """Search Google's recipe results through SerpApi using several
    high-quality recipe sites, then combine and deduplicate the results.
    """
    api_key = get_serpapi_key()

    recipe_sites = [
        "nyt",
        "serious eats",
        "allrecipes",
    ]

    params_list = [
        {
            "engine": "google",
            "q": f"{query} recipes {site}",
            "api_key": api_key,
            "hl": "en",
        }
        for site in recipe_sites
    ]

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            responses = await asyncio.gather(
                *[
                    client.get(SERPAPI_URL, params=params)
                    for params in params_list
                ]
            )

            for response in responses:
                response.raise_for_status()

            payloads = [response.json() for response in responses]

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"SerpApi search failed with HTTP {exc.response.status_code}.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach SerpApi: {exc}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="SerpApi returned invalid JSON.",
        ) from exc

    for payload in payloads:
        if payload.get("error"):
            raise HTTPException(
                status_code=502,
                detail=f"SerpApi search failed: {payload['error']}",
            )

    # Normalize cookbook names for duplicate checking.
    catalog_normalized = {
        re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
        for name in catalog_names
        if name
    }

    web_items: list[WebSearchResult] = []
    seen_urls: set[str] = set()

    # Process results from all three searches.
    for payload in payloads:
        for item in payload.get("recipes_results", []):
            if not isinstance(item, dict):
                continue

            title = clean_text(item.get("title"))
            url = clean_text(item.get("link"))
            source = clean_text(item.get("source")) or "Web Recipe"
            thumbnail = clean_text(item.get("thumbnail"))

            if not title or not url or url in seen_urls:
                continue

            normalized_title = re.sub(
                r"[^a-z0-9]+",
                " ",
                title.lower(),
            ).strip()

            if normalized_title in catalog_normalized:
                continue

            seen_urls.add(url)

            ingredients = item.get("ingredients")
            total_time = clean_text(item.get("total_time"))
            rating = item.get("rating")
            reviews = item.get("reviews")

            details: list[str] = []

            if total_time:
                details.append(total_time)

            if rating is not None:
                rating_text = f"{rating}★"

                if reviews is not None:
                    if isinstance(reviews, int):
                        rating_text += f" ({reviews:,} reviews)"
                    else:
                        rating_text += f" ({reviews} reviews)"

                details.append(rating_text)

            if isinstance(ingredients, list) and ingredients:
                details.append(f"{len(ingredients)} ingredients")

            description = (
                " · ".join(details)
                or f"Recipe found on {source}."
            )

            web_items.append(
                WebSearchResult(
                    title=title,
                    url=url,
                    description=description,
                    source=source,
                    thumbnail=thumbnail
                )
            )

    return web_items[:limit]

# --- Endpoints ---

@app.post("/api/search/recipes", response_model=RecipeSearchResponse)
async def search_recipes(request: RecipeSearchRequest):
    catalog_names = [r.name for r in request.recipes]

    # Run the AI-powered cookbook search and Google recipe search in parallel.
    # Web search is allowed to fail independently so a SerpApi problem does not
    # take down the user's local cookbook search.
    catalog_task = gemini_recipe_search(request)
    web_task = serpapi_recipe_search(request.query, catalog_names, limit=10)

    catalog_response, web_result = await asyncio.gather(
        catalog_task,
        web_task,
        return_exceptions=True,
    )

    if isinstance(catalog_response, Exception):
        raise catalog_response

    if isinstance(web_result, Exception):
        print(f"[Web Search Error] SerpApi recipe search failed: {web_result}")
        web_results = []
    else:
        web_results = web_result

    catalog_response.web_results = web_results
    return catalog_response


@app.get("/api/search/status")
async def search_status():
    return {
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "serpapi_configured": bool(os.getenv("SERPAPI_API_KEY")),
        "model": GEMINI_MODEL,
    }


# --- Helpers & HTML Parser Logic ---

def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = re.sub(r"\s+", " ", value).strip()
        return value or None
    return str(value).strip() or None


def first_text(value: Any) -> str | None:
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
    found: list[dict[str, Any]] = []

    if isinstance(value, dict):
        type_value = value.get("@type")
        types_list = type_value if isinstance(type_value, list) else [type_value]
        if any(isinstance(t, str) and t.lower().endswith("recipe") for t in types_list):
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

        raw = raw.strip().replace("\u2028", " ").replace("\u2029", " ")

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
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


def normalize_ingredients(value: Any) -> list[Ingredient]:
    if value is None:
        return []

    if isinstance(value, dict):
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

            nested = item.get("item")
            if nested is not None:
                result.extend(normalize_ingredients(nested))

    return result


def flatten_instruction(value: Any) -> list[tuple[str | None, str]]:
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
        types_list = typ if isinstance(typ, list) else [typ]

        if any(t == "HowToSection" for t in types_list if isinstance(t, str)):
            section_name = clean_text(value.get("name"))
            section_steps = value.get("itemListElement") or value.get("step")
            for _, text in flatten_instruction(section_steps):
                output.append((section_name, text))
            return output

        if any(t == "HowToStep" for t in types_list if isinstance(t, str)):
            text = clean_text(value.get("text") or value.get("name"))
            if text:
                output.append((clean_text(value.get("name")), text))
            return output

        text = clean_text(value.get("text") or value.get("name"))
        if text:
            output.append((None, text))

    return output


def choose_best_recipe(recipes: list[dict[str, Any]]) -> dict[str, Any]:
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

# ============================================================================
# New models — add these alongside your other search models
# ============================================================================

class CookbookSummary(BaseModel):
    id: str
    title: str
    author: str | None = None
    cuisine: str | None = None
    status: str | None = None
    recipe_count: int = 0


class AnalysisRecipe(BaseModel):
    id: str
    name: str
    cookbook: str | None = None
    tags: list[str] = Field(default_factory=list)
    ingredient_names: list[str] = Field(default_factory=list)
    rating: float | None = None
    times_cooked: int = 0
    favorite: bool = False
    want_to_try: bool = False


class CollectionAnalysisRequest(BaseModel):
    cookbooks: list[CookbookSummary] = Field(default_factory=list)
    recipes: list[AnalysisRecipe] = Field(min_length=1, max_length=5000)


class CoverageItem(BaseModel):
    name: str
    status: str  # "strong" | "some" | "missing"
    note: str


class RecipeSuggestion(BaseModel):
    name: str
    cuisine: str | None = None
    reason: str


class BookRecommendation(BaseModel):
    title: str
    author: str | None = None
    reason: str
    fills_gap: str


class CollectionAnalysisResponse(BaseModel):
    success: bool
    summary: str
    cuisines: list[CoverageItem]
    meal_types: list[CoverageItem]
    techniques: list[CoverageItem]
    recipe_suggestions: list[RecipeSuggestion]
    book_recommendations: list[BookRecommendation]


# ============================================================================
# Response schema for Gemini's structured output — same pattern as
# SEARCH_RESPONSE_SCHEMA, just a bigger shape
# ============================================================================

_COVERAGE_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "status": {"type": "string", "enum": ["strong", "some", "missing"]},
        "note": {"type": "string"},
    },
    "required": ["name", "status", "note"],
}

ANALYSIS_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "cuisines": {"type": "array", "items": _COVERAGE_ITEM_SCHEMA},
        "meal_types": {"type": "array", "items": _COVERAGE_ITEM_SCHEMA},
        "techniques": {"type": "array", "items": _COVERAGE_ITEM_SCHEMA},
        "recipe_suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "cuisine": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["name", "reason"],
            },
        },
        "book_recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "author": {"type": "string"},
                    "reason": {"type": "string"},
                    "fills_gap": {"type": "string"},
                },
                "required": ["title", "reason", "fills_gap"],
            },
        },
    },
    "required": ["summary", "cuisines", "meal_types", "techniques", "recipe_suggestions", "book_recommendations"],
}


# ============================================================================
# Prompt + endpoint — add near your other search logic
# ============================================================================

def build_analysis_prompt(cookbooks: list[CookbookSummary], recipes: list[AnalysisRecipe]) -> str:
    cookbook_catalog = [
        {
            "title": b.title,
            "author": b.author,
            "cuisine": b.cuisine,
            "status": b.status,
            "recipe_count": b.recipe_count,
        }
        for b in cookbooks
    ]
    recipe_catalog = [
        {
            "name": r.name,
            "cookbook": r.cookbook,
            "tags": r.tags,
            "rating": r.rating,
            "favorite": r.favorite,
            "want_to_try": r.want_to_try,
        }
        for r in recipes
    ]

    return f"""You are analyzing a home cook's entire personal recipe collection to find real
gaps in coverage — the goal is to inform what to cook next, what to learn, and
what cookbooks would genuinely round out this specific collection.

COOKBOOKS ({len(cookbook_catalog)}):
{json.dumps(cookbook_catalog, ensure_ascii=False)}

RECIPES ({len(recipe_catalog)}):
{json.dumps(recipe_catalog, ensure_ascii=False)}

Analyze the collection across three dimensions, inferring from recipe names,
ingredients, tags, and cookbook cuisines — don't rely only on explicit tags:

1. CUISINES — major world cuisines represented, lightly represented, or absent
   (e.g. Mexican, West African, Vietnamese, Levantine, Sichuan, Nordic, etc.)
2. MEAL TYPES — breakfast, weeknight dinners, baking/desserts, snacks/appetizers,
   sauces & condiments, breads, preserving/fermentation, etc.
3. TECHNIQUES — braising, fermentation, knife-heavy prep, grilling/live fire,
   pastry, bread baking, pickling, sauce work, etc.

For each dimension, return several coverage items with a status of "strong"
(well represented), "some" (present but thin), or "missing" (essentially
absent) — mention only dimensions that are genuinely notable, not padding
for the sake of a count. Each note should be a short, specific observation
grounded in what's actually in the collection (name real recipes/cookbooks
from the data where relevant).

Then:
- Suggest 5-8 SPECIFIC recipes (real, well-known dishes, not vague ideas) that
  would meaningfully fill the biggest gaps — prioritize recipes that build on
  techniques or ingredients this cook already seems comfortable with, as a
  natural next step, not a total departure.
- Recommend 3-5 REAL, specific cookbooks (actual published titles and authors)
  that would fill the most significant gaps — explain what gap each book
  fills and why it fits this particular collection's character, not just its
  cuisine label.

Also write a short (2-3 sentence) summary of this cook's overall style and
the single most interesting gap in their collection.

Return ONLY JSON matching the required schema. Be specific and grounded in
the actual data — do not invent tags, ingredients, or recipes that aren't
implied by what's provided."""


async def gemini_collection_analysis(request: CollectionAnalysisRequest) -> CollectionAnalysisResponse:
    client = get_gemini_client()
    prompt = build_analysis_prompt(request.cookbooks, request.recipes)

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": ANALYSIS_RESPONSE_SCHEMA,
                "temperature": 0.4,
            },
        )
        payload = json.loads(response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Collection analysis failed: {exc}") from exc

    return CollectionAnalysisResponse(success=True, **payload)


@app.post("/api/analyze/collection", response_model=CollectionAnalysisResponse)
async def analyze_collection(request: CollectionAnalysisRequest):
    return await gemini_collection_analysis(request)

# ============================================================================
# New models — add alongside your other search/analysis models
# ============================================================================

class PairingRequest(BaseModel):
    anchor_recipe_id: str
    recipes: list[SearchRecipe] = Field(min_length=1, max_length=5000)


class Pairing(BaseModel):
    recipe_id: str
    name: str
    role: str       # freeform: "Side dish", "Drink pairing", "Dessert", etc.
    reason: str


class PairingResponse(BaseModel):
    success: bool
    anchor_name: str
    pairings: list[Pairing]


class MenuPlanRequest(BaseModel):
    occasion: str = Field(min_length=1, max_length=5000)
    recipes: list[SearchRecipe] = Field(min_length=1, max_length=5000)


class MenuCourse(BaseModel):
    course: str
    recipe_id: str | None = None
    name: str
    reason: str
    in_collection: bool


class MenuPlanResponse(BaseModel):
    success: bool
    theme: str
    courses: list[MenuCourse]


# ============================================================================
# Response schemas for Gemini structured output
# ============================================================================

PAIRING_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "anchor_name": {"type": "string"},
        "pairings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "recipe_id": {"type": "string"},
                    "name": {"type": "string"},
                    "role": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["recipe_id", "name", "role", "reason"],
            },
        },
    },
    "required": ["anchor_name", "pairings"],
}

MENU_PLAN_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "theme": {"type": "string"},
        "courses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "course": {"type": "string"},
                    "recipe_id": {"type": "string"},
                    "name": {"type": "string"},
                    "reason": {"type": "string"},
                    "in_collection": {"type": "boolean"},
                },
                "required": ["course", "name", "reason", "in_collection"],
            },
        },
    },
    "required": ["theme", "courses"],
}


# ============================================================================
# Pairing: prompt + endpoint
# ============================================================================

def build_pairing_prompt(anchor: SearchRecipe, recipes: list[SearchRecipe]) -> str:
    catalog = [
        {
            "id": r.id, "name": r.name, "ingredients": r.ingredients, "tags": r.tags,
            "description": r.description, "cookbook": r.cookbook, "rating": r.rating,
        }
        for r in recipes if r.id != anchor.id
    ]

    return f"""You are a menu-pairing expert for a personal cookbook app called Stacks.

    The cook is looking at this recipe and wants to know what else from their
    OWN collection — across every cookbook they own, not just the same book —
    would make a genuinely great meal alongside it.

    ANCHOR RECIPE:
    {json.dumps({"name": anchor.name, "ingredients": anchor.ingredients, "tags": anchor.tags, "description": anchor.description, "cookbook": anchor.cookbook}, ensure_ascii=False)}

    REST OF THE COLLECTION ({len(catalog)} recipes):
    {json.dumps(catalog, ensure_ascii=False)}

    Pick 3 to 6 recipes that would genuinely pair well with the anchor recipe —
    think about flavor balance, texture contrast, richness/lightness, shared or
    complementary cuisine, and what role each plays (starter, side, sauce,
    drink, dessert, bread, etc.). A good pairing set does NOT need to cover
    every course — only recommend recipes that are a real fit, not filler.
    Be sure to not pair main courses with other main courses and try to reccomend 
    main courses when only a side is selected.

    Prioritize most logical pairings or dishes from the same cuisines.
    The recipe_id must exactly match an id from the collection
    above (never the anchor's own id).

    Return ONLY JSON matching the schema."""


async def gemini_pairing(request: PairingRequest) -> PairingResponse:
    anchor = next((r for r in request.recipes if r.id == request.anchor_recipe_id), None)
    if anchor is None:
        raise HTTPException(status_code=400, detail="anchor_recipe_id not found in the provided recipes.")

    client = get_gemini_client()
    prompt = build_pairing_prompt(anchor, request.recipes)

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": PAIRING_RESPONSE_SCHEMA,
                "temperature": 0.5,
            },
        )
        payload = json.loads(response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Pairing search failed: {exc}") from exc

    valid_ids = {r.id for r in request.recipes}
    pairings = [
        Pairing(**item) for item in payload.get("pairings", [])
        if isinstance(item, dict) and item.get("recipe_id") in valid_ids
    ]

    return PairingResponse(success=True, anchor_name=payload.get("anchor_name", anchor.name), pairings=pairings)


@app.post("/api/pair/recipe", response_model=PairingResponse)
async def pair_recipe(request: PairingRequest):
    return await gemini_pairing(request)


# ============================================================================
# Menu planning: prompt + endpoint
# ============================================================================

def build_menu_prompt(occasion: str, recipes: list[SearchRecipe]) -> str:
    catalog = [
        {
            "id": r.id, "name": r.name, "ingredients": r.ingredients, "tags": r.tags,
            "description": r.description, "cookbook": r.cookbook, "rating": r.rating,
        }
        for r in recipes
    ]

    return f"""You are planning a full menu for a home cook, drawing primarily from
their OWN recipe collection across every cookbook they own.

THE OCCASION, IN THEIR OWN WORDS:
{occasion}

THEIR COLLECTION ({len(catalog)} recipes):
{json.dumps(catalog, ensure_ascii=False)}

Design a coherent menu for this occasion — decide which courses actually
make sense for it (a casual lunch doesn't need five courses; a dinner party
plausibly wants a starter, a drink, an entree, a side, and a dessert — use
judgment based on what the occasion actually calls for).

For each course, prefer a recipe from their collection that genuinely fits
—consider the season, the mood, and how the whole menu balances together
(don't pick five heavy dishes, don't repeat a dominant ingredient across
courses unless intentional). Set in_collection to true and recipe_id to the
exact matching id when you use one of their recipes.

If their collection has no good fit for a course you believe the occasion
needs, you may suggest a course anyway with in_collection set to false,
recipe_id omitted, and name/reason describing what would work — but prefer
using their own collection whenever it's a genuine fit.

Also write a short (1-2 sentence) "theme" describing the overall menu concept
and why it works as a whole.

Return ONLY JSON matching the schema."""


async def gemini_menu_plan(request: MenuPlanRequest) -> MenuPlanResponse:
    client = get_gemini_client()
    prompt = build_menu_prompt(request.occasion, request.recipes)

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": MENU_PLAN_RESPONSE_SCHEMA,
                "temperature": 0.5,
            },
        )
        payload = json.loads(response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Menu planning failed: {exc}") from exc

    valid_ids = {r.id for r in request.recipes}
    courses = []
    for item in payload.get("courses", []):
        if not isinstance(item, dict):
            continue
        recipe_id = item.get("recipe_id")
        if recipe_id and recipe_id not in valid_ids:
            recipe_id = None
            item["in_collection"] = False
        courses.append(MenuCourse(
            course=item.get("course", ""),
            recipe_id=recipe_id,
            name=item.get("name", ""),
            reason=item.get("reason", ""),
            in_collection=bool(item.get("in_collection")) and recipe_id is not None,
        ))

    return MenuPlanResponse(success=True, theme=payload.get("theme", ""), courses=courses)


@app.post("/api/menu/plan", response_model=MenuPlanResponse)
async def plan_menu(request: MenuPlanRequest):
    return await gemini_menu_plan(request)