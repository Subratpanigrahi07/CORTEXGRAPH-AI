"""
Analytics routes — graph statistics, centrality metrics, community detection.
"""

from fastapi import APIRouter, HTTPException
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
def get_overview():
    """Get basic graph statistics: node/edge counts, growth."""
    try:
        service = AnalyticsService()
        overview = service.get_overview()
        return overview.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics overview failed: {str(e)}")


@router.get("/centrality")
def get_centrality(algorithm: str = "pagerank", top_n: int = 10):
    """
    Get top-N entities by centrality metric.
    algorithm: "pagerank" or "betweenness"
    """
    try:
        service = AnalyticsService()

        if algorithm == "pagerank":
            result = service.get_pagerank(top_n=top_n)
        elif algorithm == "betweenness":
            result = service.get_betweenness(top_n=top_n)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown algorithm: {algorithm}. Use 'pagerank' or 'betweenness'.")

        return result.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Centrality computation failed: {str(e)}")


@router.get("/communities")
def get_communities():
    """Get Louvain community detection results."""
    try:
        service = AnalyticsService()
        result = service.get_communities()
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Community detection failed: {str(e)}")
