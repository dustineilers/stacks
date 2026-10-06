from __future__ import annotations

from fastapi import APIRouter

from ..schemas.menu import FillSlotsRequest, FillSlotsResponse
from ..services.menu_planner import gemini_fill_slots

router = APIRouter()


@router.post("/api/menu/fill-slots", response_model=FillSlotsResponse)
async def fill_menu_slots(request: FillSlotsRequest):
    return await gemini_fill_slots(request)
