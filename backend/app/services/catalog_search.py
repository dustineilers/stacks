from __future__ import annotations

import json

from ..gemini_client import generate_structured, get_gemini_client
from ..schemas.search import RecipeSearchRequest, RecipeSearchResponse, SearchRecipe, SearchResult
from ..utils.text import clean_text

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

    payload = await generate_structured(
        client,
        prompt,
        SEARCH_RESPONSE_SCHEMA,
        temperature=0.2,
        error_context="Gemini search failed",
    )

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
