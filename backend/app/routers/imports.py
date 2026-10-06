from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas.recipe import ImportRequest, ImportResponse
from ..services.recipe_parser import choose_best_recipe, fetch_html, normalize_recipe, parse_json_ld

router = APIRouter()


@router.post("/api/import/recipe", response_model=ImportResponse)
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
