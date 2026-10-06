from __future__ import annotations

import json

from ..gemini_client import generate_structured, get_gemini_client
from ..schemas.analysis import (
    AnalysisRecipe,
    CollectionAnalysisRequest,
    CollectionAnalysisResponse,
    CookbookSummary,
)

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

    payload = await generate_structured(
        client,
        prompt,
        ANALYSIS_RESPONSE_SCHEMA,
        temperature=0.4,
        error_context="Collection analysis failed",
    )

    return CollectionAnalysisResponse(success=True, **payload)
