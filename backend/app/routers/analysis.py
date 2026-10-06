from __future__ import annotations

from fastapi import APIRouter

from ..schemas.analysis import CollectionAnalysisRequest, CollectionAnalysisResponse
from ..services.collection_analysis import gemini_collection_analysis

router = APIRouter()


@router.post("/api/analyze/collection", response_model=CollectionAnalysisResponse)
async def analyze_collection(request: CollectionAnalysisRequest):
    return await gemini_collection_analysis(request)
