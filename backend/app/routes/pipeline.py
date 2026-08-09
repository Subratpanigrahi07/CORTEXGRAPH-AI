"""
Pipeline API routes — trigger and monitor the agent pipeline.
"""

from fastapi import APIRouter, HTTPException
from celery.result import AsyncResult
from app.celery_app import celery_app
from app.db.redis_client import get_redis_client

router = APIRouter(prefix="/agents/pipeline", tags=["pipeline"])


@router.post("/run/{document_id}")
def run_pipeline(document_id: str, chunks: list[str] = None, filename: str = "manual"):
    """
    Manually trigger the full agent pipeline for a document.
    If chunks aren't provided, attempts to re-process from stored data.
    """
    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="Chunks must be provided. Upload a document via /api/upload instead."
        )

    from app.tasks.pipeline import run_agent_pipeline
    task = run_agent_pipeline.delay(document_id, chunks, filename)

    return {
        "job_id": task.id,
        "status": "queued",
        "document_id": document_id,
    }


@router.get("/status/{job_id}")
def get_pipeline_status(job_id: str):
    """Get the status of a pipeline execution."""
    # Try Celery first
    task_result = AsyncResult(job_id, app=celery_app)

    status = {
        "job_id": job_id,
        "celery_state": task_result.state,
    }

    if task_result.state == "SUCCESS":
        status["overall_status"] = "completed"
        status["result"] = task_result.result
    elif task_result.state == "FAILURE":
        status["overall_status"] = "failed"
        status["error"] = str(task_result.info)
    elif task_result.state in ("EXTRACTING", "VERIFYING", "RESOLVING", "BUILDING"):
        status["overall_status"] = "running"
        status["current_step"] = task_result.state.lower()
        if task_result.info and isinstance(task_result.info, dict):
            status["detail"] = task_result.info.get("detail", "")
    elif task_result.state == "PENDING":
        status["overall_status"] = "pending"
    else:
        status["overall_status"] = "running"

    # Also check Redis for detailed step-by-step status
    try:
        redis = get_redis_client()
        redis_status = redis.get_pipeline_status(f"doc:{job_id}")
        if redis_status:
            status["steps"] = redis_status.get("steps", [])
    except Exception:
        pass

    return status
