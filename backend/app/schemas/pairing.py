from __future__ import annotations

from pydantic import BaseModel, Field

from .search import SearchRecipe


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
