"""
Periodic Tasks — Celery Beat scheduled tasks for background processing.

- detect_contradictions: runs structural + semantic pass every 15 minutes
- recompute_analytics: refreshes cached analytics every 10 minutes
"""

from app.celery_app import celery_app


@celery_app.task(name="app.tasks.periodic.detect_contradictions")
def detect_contradictions():
    """Periodic contradiction detection sweep."""
    try:
        from app.services.contradiction_service import ContradictionService
        service = ContradictionService()
        contradictions = service.detect_all()
        return {
            "status": "completed",
            "contradictions_found": len(contradictions),
        }
    except Exception as e:
        print(f"[Periodic] Contradiction detection failed: {e}")
        return {"status": "error", "message": str(e)}


@celery_app.task(name="app.tasks.periodic.recompute_analytics")
def recompute_analytics():
    """Periodic analytics recomputation."""
    try:
        from app.services.analytics_service import AnalyticsService
        service = AnalyticsService()

        # Force recompute by bypassing cache
        overview = service.get_overview()
        pagerank = service.get_pagerank(top_n=20)
        betweenness = service.get_betweenness(top_n=20)
        communities = service.get_communities()

        return {
            "status": "completed",
            "total_entities": overview.total_entities,
            "total_relationships": overview.total_relationships,
            "communities": communities.total_communities,
        }
    except Exception as e:
        print(f"[Periodic] Analytics recomputation failed: {e}")
        return {"status": "error", "message": str(e)}
