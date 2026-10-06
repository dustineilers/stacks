from __future__ import annotations

import os

from fastapi import HTTPException

SERPAPI_URL = "https://serpapi.com/search"


def get_serpapi_key() -> str:
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Web recipe search is not configured. Set SERPAPI_API_KEY in your environment.",
        )
    return api_key
