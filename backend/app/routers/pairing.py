from __future__ import annotations

from fastapi import APIRouter

from ..schemas.pairing import PairingRequest, PairingResponse
from ..services.pairing import gemini_pairing

router = APIRouter()


@router.post("/api/pair/recipe", response_model=PairingResponse)
async def pair_recipe(request: PairingRequest):
    return await gemini_pairing(request)
