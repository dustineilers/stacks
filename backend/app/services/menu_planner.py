from __future__ import annotations

import json

from ..gemini_client import generate_structured, get_gemini_client
from ..schemas.menu import EmptySlot, FillSlotsRequest, FillSlotsResponse, MenuSlotContext, SlotFill
from ..schemas.search import SearchRecipe

FILL_SLOTS_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "fills": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "slot_id": {"type": "string"},
                    "recipe_id": {"type": "string"},
                    "name": {"type": "string"},
                    "reason": {"type": "string"},
                    "in_collection": {"type": "boolean"},
                },
                "required": ["slot_id", "name", "reason", "in_collection"],
            },
        },
    },
    "required": ["fills"],
}


def build_fill_slots_prompt(
    context: str,
    recipes: list[SearchRecipe],
    filled_slots: list[MenuSlotContext],
    empty_slots: list[EmptySlot],
) -> str:
    catalog = [
        {
            "id": r.id, "name": r.name, "ingredients": r.ingredients, "tags": r.tags,
            "description": r.description, "cookbook": r.cookbook, "rating": r.rating,
        }
        for r in recipes
    ]

    return f"""You are filling in the empty courses of a home cook's menu, drawing
primarily from their OWN recipe collection across every cookbook they own.

THE OCCASION, IN THEIR OWN WORDS:
{context}

COURSES ALREADY SET FOR THIS MENU (keep new picks coherent with these —
balance richness, avoid repeating a dominant ingredient or technique unless
intentional, and consider the cuisine and mood they establish):
{json.dumps([{"course": s.course, "name": s.name} for s in filled_slots], ensure_ascii=False)}

EMPTY COURSES TO FILL:
{json.dumps([{"slot_id": s.slot_id, "course": s.course} for s in empty_slots], ensure_ascii=False)}

THEIR COLLECTION ({len(catalog)} recipes):
{json.dumps(catalog, ensure_ascii=False)}

For each empty course listed above, pick ONE dish that genuinely fits that
course, this occasion, and the rest of the menu. Strongly prefer a recipe
from their own collection — set recipe_id to its exact id and in_collection
to true when you do. Only if nothing in the collection is a real fit for a
given course, suggest a specific, real, well-known dish by name, omit
recipe_id, and set in_collection to false.

Return exactly one fill per empty course listed, using its exact slot_id.

Return ONLY JSON matching the schema."""


async def gemini_fill_slots(request: FillSlotsRequest) -> FillSlotsResponse:
    client = get_gemini_client()
    prompt = build_fill_slots_prompt(request.context, request.recipes, request.filled_slots, request.empty_slots)

    payload = await generate_structured(
        client,
        prompt,
        FILL_SLOTS_RESPONSE_SCHEMA,
        temperature=0.5,
        error_context="Menu slot suggestions failed",
    )

    valid_ids = {r.id for r in request.recipes}
    valid_slot_ids = {s.slot_id for s in request.empty_slots}
    fills: list[SlotFill] = []
    seen_slots: set[str] = set()

    for item in payload.get("fills", []):
        if not isinstance(item, dict):
            continue
        slot_id = item.get("slot_id")
        if slot_id not in valid_slot_ids or slot_id in seen_slots:
            continue

        recipe_id = item.get("recipe_id")
        if recipe_id and recipe_id not in valid_ids:
            recipe_id = None
        in_collection = bool(item.get("in_collection")) and recipe_id is not None

        seen_slots.add(slot_id)
        fills.append(SlotFill(
            slot_id=slot_id,
            recipe_id=recipe_id,
            name=item.get("name", ""),
            reason=item.get("reason", ""),
            in_collection=in_collection,
        ))

    return FillSlotsResponse(success=True, fills=fills)
