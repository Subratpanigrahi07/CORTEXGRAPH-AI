"""
Entity routes — merge suggestion review panel API.
"""

from fastapi import APIRouter, HTTPException
from app.db.redis_client import get_redis_client
from app.db.neo4j_client import get_neo4j_client, Neo4jClient

router = APIRouter(prefix="/entities", tags=["entities"])


@router.get("/merge-suggestions")
def get_merge_suggestions(status: str = "pending"):
    """Get pending merge suggestions for human review."""
    try:
        redis = get_redis_client()
        suggestions = redis.get_merge_suggestions(status=status)
        return {"suggestions": suggestions, "count": len(suggestions)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch merge suggestions: {str(e)}")


@router.post("/merge-suggestions/{suggestion_id}/approve")
def approve_merge(suggestion_id: str):
    """Approve a merge suggestion — performs the actual entity merge."""
    try:
        redis = get_redis_client()
        suggestion = redis.get_merge_suggestion(suggestion_id)

        if not suggestion:
            raise HTTPException(status_code=404, detail="Merge suggestion not found")

        if suggestion.get("status") != "pending":
            raise HTTPException(status_code=400, detail=f"Suggestion is already {suggestion.get('status')}")

        # Perform the merge in Neo4j
        neo4j = get_neo4j_client()
        candidate_id = Neo4jClient._make_entity_id(suggestion["candidate_name"])
        canonical_id = suggestion["canonical_id"]

        success = neo4j.merge_entities_apoc(
            canonical_id=canonical_id,
            duplicate_id=candidate_id,
            dup_name=suggestion["candidate_name"],
        )

        if success:
            redis.update_merge_suggestion_status(suggestion_id, "approved")
            return {
                "status": "approved",
                "merged": f"{suggestion['candidate_name']} → {suggestion['canonical_name']}",
            }
        else:
            raise HTTPException(status_code=500, detail="Neo4j merge operation failed")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Merge approval failed: {str(e)}")


@router.post("/merge-suggestions/{suggestion_id}/reject")
def reject_merge(suggestion_id: str):
    """Reject a merge suggestion — entities remain separate."""
    try:
        redis = get_redis_client()
        suggestion = redis.get_merge_suggestion(suggestion_id)

        if not suggestion:
            raise HTTPException(status_code=404, detail="Merge suggestion not found")

        redis.update_merge_suggestion_status(suggestion_id, "rejected")
        return {"status": "rejected", "suggestion_id": suggestion_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Merge rejection failed: {str(e)}")
