from __future__ import annotations

from pydantic import BaseModel, Field


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
