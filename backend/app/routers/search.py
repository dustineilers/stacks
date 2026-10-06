from __future__ import annotations

import asyncio
import os

from fastapi import APIRouter

from ..config import GEMINI_MODEL
from ..schemas.search import RecipeSearchRequest, RecipeSearchResponse
from ..services.catalog_search import gemini_recipe_search
from ..services.web_search import serpapi_recipe_search

router = APIRouter()


@router.post("/api/search/recipes", response_model=RecipeSearchResponse)
async def search_recipes(request: RecipeSearchRequest):
    catalog_names = [r.name for r in request.recipes]

    # Run the AI-powered cookbook search and Google recipe search in parallel.
    # Web search is allowed to fail independently so a SerpApi problem does not
    # take down the user's local cookbook search.
    catalog_task = gemini_recipe_search(request)
    web_task = serpapi_recipe_search(request.query, catalog_names, limit=10)

    catalog_response, web_result = await asyncio.gather(
        catalog_task,
        web_task,
        return_exceptions=True,
    )

    if isinstance(catalog_response, Exception):
        raise catalog_response

    if isinstance(web_result, Exception):
        print(f"[Web Search Error] SerpApi recipe search failed: {web_result}")
        web_results = []
    else:
        web_results = web_result

    catalog_response.web_results = web_results
    return catalog_response


@router.get("/api/search/status")
async def search_status():
    return {
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "serpapi_configured": bool(os.getenv("SERPAPI_API_KEY")),
        "model": GEMINI_MODEL,
    }
