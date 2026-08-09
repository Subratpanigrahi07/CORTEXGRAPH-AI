"""
Pipeline tasks — Celery tasks for the multi-agent ingestion pipeline.
"""

from app.celery_app import celery_app


@celery_app.task(name="app.tasks.pipeline.test_task", bind=True)
def test_task(self, a: int, b: int) -> int:
    """Trivial test task to verify Celery + Redis round-trip."""
    return a + b


@celery_app.task(
    name="app.tasks.pipeline.run_agent_pipeline",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def run_agent_pipeline(self, document_id: str, chunks: list[str], filename: str):
    """
    Full agent pipeline for a document:
    Extraction → Verification → Entity Resolution → Graph Builder → Neo4j

    This is the main orchestration task triggered on document upload.
    """
    from app.agents.orchestrator import run_pipeline

    try:
        self.update_state(state="EXTRACTING", meta={"step": "extraction", "document_id": document_id})

        result = run_pipeline(
            document_id=document_id,
            chunks=chunks,
            filename=filename,
            task=self,
        )

        return {
            "status": "completed",
            "document_id": document_id,
            "entities_created": result.get("entities_created", 0),
            "relationships_created": result.get("relationships_created", 0),
            "entities_merged": result.get("entities_merged", 0),
            "contradictions_found": result.get("contradictions_found", 0),
            "merge_suggestions": result.get("merge_suggestions", 0),
        }

    except Exception as exc:
        self.update_state(state="FAILED", meta={"error": str(exc), "document_id": document_id})
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.pipeline.reindex_document",
    bind=True,
    max_retries=1,
)
def reindex_document(self, document_id: str):
    """
    Incremental re-index: diff chunk hashes, only process changed/new chunks.
    Triggered manually via "Re-sync" button or automatically on re-upload.
    """
    from app.services.document_service import DocumentService

    try:
        self.update_state(state="DIFFING", meta={"document_id": document_id})
        doc_service = DocumentService()
        result = doc_service.reindex(document_id, task=self)
        return result
    except Exception as exc:
        raise self.retry(exc=exc)
