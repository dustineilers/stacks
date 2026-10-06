from __future__ import annotations

from pydantic import BaseModel, Field


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
