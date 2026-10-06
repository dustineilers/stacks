from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, HttpUrl


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
