"""
Contradiction routes — list open contradictions and resolve them.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from app.services.contradiction_service import ContradictionService

router = APIRouter(prefix="/contradictions", tags=["contradictions"])


class ResolveRequest(BaseModel):
    resolution: Literal["kept_a", "kept_b", "kept_both"]


@router.get("")
def get_contradictions():
    """List all open contradictions."""
    try:
        service = ContradictionService()
        contradictions = service.get_open_contradictions()
        return {"contradictions": contradictions, "count": len(contradictions)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch contradictions: {str(e)}")


@router.post("/{contradiction_id}/resolve")
def resolve_contradiction(contradiction_id: str, request: ResolveRequest):
    """Resolve a contradiction: keep A, keep B, or keep both."""
    try:
        service = ContradictionService()
        success = service.resolve(contradiction_id, request.resolution)

        if success:
            return {
                "status": "resolved",
                "contradiction_id": contradiction_id,
                "resolution": request.resolution,
            }
        else:
            raise HTTPException(status_code=500, detail="Resolution failed")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resolution failed: {str(e)}")
