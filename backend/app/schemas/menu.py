from __future__ import annotations

from pydantic import BaseModel, Field

from .search import SearchRecipe


class MenuSlotContext(BaseModel):
    """A slot the menu has already settled on (filled or locked), given to
    the model as context so new suggestions stay coherent with the rest of
    the menu."""
    course: str
    name: str


class EmptySlot(BaseModel):
    slot_id: str
    course: str


class FillSlotsRequest(BaseModel):
    context: str = Field(min_length=1, max_length=5000)
    recipes: list[SearchRecipe] = Field(min_length=1, max_length=5000)
    filled_slots: list[MenuSlotContext] = Field(default_factory=list)
    empty_slots: list[EmptySlot] = Field(min_length=1, max_length=50)


class SlotFill(BaseModel):
    slot_id: str
    recipe_id: str | None = None
    name: str
    reason: str
    in_collection: bool


class FillSlotsResponse(BaseModel):
    success: bool
    fills: list[SlotFill]
