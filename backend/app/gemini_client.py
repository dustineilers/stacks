from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from fastapi import HTTPException

try:
    from google import genai
except ImportError:  # Optional until Gemini search is used.
    genai = None

from .config import GEMINI_MODEL


def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini search is not configured. Set GEMINI_API_KEY in your environment.",
        )
    if genai is None:
        raise HTTPException(
            status_code=503,
            detail="Gemini support is not installed. Run: pip install google-genai",
        )
    return genai.Client(api_key=api_key)


async def generate_structured(
    client: Any,
    prompt: str,
    schema: dict[str, Any],
    *,
    temperature: float,
    error_context: str,
) -> dict[str, Any]:
    """Call Gemini for structured JSON output and parse the response.

    Shared by every Gemini-backed feature (catalog search, collection
    analysis, pairing, menu planning) so each one only needs its own
    prompt builder and schema.
    """
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": schema,
                "temperature": temperature,
            },
        )
        return json.loads(response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{error_context}: {exc}") from exc
