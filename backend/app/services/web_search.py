from __future__ import annotations

import asyncio
import re

import httpx
from fastapi import HTTPException

from ..http_client import DEFAULT_TIMEOUT
from ..schemas.search import WebSearchResult
from ..serpapi_client import SERPAPI_URL, get_serpapi_key
from ..utils.text import clean_text


async def serpapi_recipe_search(
    query: str,
    catalog_names: list[str],
    limit: int = 10,
) -> list[WebSearchResult]:
    """Search Google's recipe results through SerpApi using several
    high-quality recipe sites, then combine and deduplicate the results.
    """
    api_key = get_serpapi_key()

    recipe_sites = [
        "nyt",
        "serious eats",
        "allrecipes",
    ]

    params_list = [
        {
            "engine": "google",
            "q": f"{query} recipes {site}",
            "api_key": api_key,
            "hl": "en",
        }
        for site in recipe_sites
    ]

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            responses = await asyncio.gather(
                *[
                    client.get(SERPAPI_URL, params=params)
                    for params in params_list
                ]
            )

            for response in responses:
                response.raise_for_status()

            payloads = [response.json() for response in responses]

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"SerpApi search failed with HTTP {exc.response.status_code}.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach SerpApi: {exc}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="SerpApi returned invalid JSON.",
        ) from exc

    for payload in payloads:
        if payload.get("error"):
            raise HTTPException(
                status_code=502,
                detail=f"SerpApi search failed: {payload['error']}",
            )

    # Normalize cookbook names for duplicate checking.
    catalog_normalized = {
        re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
        for name in catalog_names
        if name
    }

    web_items: list[WebSearchResult] = []
    seen_urls: set[str] = set()

    # Process results from all three searches.
    for payload in payloads:
        for item in payload.get("recipes_results", []):
            if not isinstance(item, dict):
                continue

            title = clean_text(item.get("title"))
            url = clean_text(item.get("link"))
            source = clean_text(item.get("source")) or "Web Recipe"
            thumbnail = clean_text(item.get("thumbnail"))

            if not title or not url or url in seen_urls:
                continue

            normalized_title = re.sub(
                r"[^a-z0-9]+",
                " ",
                title.lower(),
            ).strip()

            if normalized_title in catalog_normalized:
                continue

            seen_urls.add(url)

            ingredients = item.get("ingredients")
            total_time = clean_text(item.get("total_time"))
            rating = item.get("rating")
            reviews = item.get("reviews")

            details: list[str] = []

            if total_time:
                details.append(total_time)

            if rating is not None:
                rating_text = f"{rating}★"

                if reviews is not None:
                    if isinstance(reviews, int):
                        rating_text += f" ({reviews:,} reviews)"
                    else:
                        rating_text += f" ({reviews} reviews)"

                details.append(rating_text)

            if isinstance(ingredients, list) and ingredients:
                details.append(f"{len(ingredients)} ingredients")

            description = (
                " · ".join(details)
                or f"Recipe found on {source}."
            )

            web_items.append(
                WebSearchResult(
                    title=title,
                    url=url,
                    description=description,
                    source=source,
                    thumbnail=thumbnail
                )
            )

    return web_items[:limit]
