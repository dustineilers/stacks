from __future__ import annotations

import json

from fastapi import HTTPException

from ..gemini_client import generate_structured, get_gemini_client
from ..schemas.pairing import Pairing, PairingRequest, PairingResponse
from ..schemas.search import SearchRecipe

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

    payload = await generate_structured(
        client,
        prompt,
        PAIRING_RESPONSE_SCHEMA,
        temperature=0.5,
        error_context="Pairing search failed",
    )

    valid_ids = {r.id for r in request.recipes}
    pairings = [
        Pairing(**item) for item in payload.get("pairings", [])
        if isinstance(item, dict) and item.get("recipe_id") in valid_ids
    ]

    return PairingResponse(success=True, anchor_name=payload.get("anchor_name", anchor.name), pairings=pairings)
