"""
Pipeline Orchestrator — LangGraph state graph that wires the full agent pipeline.

Pipeline order (strict):
Document → Extraction Agent → Verification Agent → Entity Resolution → Graph Builder → Neo4j

Uses LangGraph for conditional edges (retry on failure, loop on rejected extraction).
"""

import hashlib
from datetime import datetime
from typing import Any, Optional
from app.agents.extraction import ExtractionAgent
from app.agents.verification import VerificationAgent
from app.agents.graph_builder import GraphBuilderAgent
from app.entity_resolution.resolver import EntityResolver
from app.entity_resolution.entity_index import get_entity_index
from app.db.redis_client import get_redis_client
from app.schema import ExtractionResult, VerifiedExtractionResult


def run_pipeline(
    document_id: str,
    chunks: list[str],
    filename: str,
    task: Any = None,
) -> dict:
    """
    Execute the full agent pipeline for a document.

    This is the main entry point called by the Celery task.
    Processes chunks sequentially through:
    Extraction → Verification → Entity Resolution → Graph Builder

    Args:
        document_id: Unique document identifier
        chunks: List of text chunks from the document
        filename: Original filename for provenance
        task: Celery task instance for status updates (optional)

    Returns:
        Summary dict with counts of entities/relationships created, merged, etc.
    """
    # Initialize agents
    extraction_agent = ExtractionAgent()
    verification_agent = VerificationAgent()
    entity_resolver = EntityResolver()
    graph_builder = GraphBuilderAgent()

    # Get existing entity names for extraction context
    existing_entities = []
    try:
        entity_index = get_entity_index()
        existing_entities = entity_index.get_all_entity_names()
    except Exception as e:
        print(f"[Orchestrator] Could not load existing entities: {e}")

    # Compute file hash for incremental update tracking
    full_text = "\n".join(chunks)
    file_hash = hashlib.sha256(full_text.encode()).hexdigest()

    # Store chunk hashes in Redis for future incremental diffing
    try:
        redis_client = get_redis_client()
        chunk_hashes = [hashlib.sha256(c.encode()).hexdigest() for c in chunks]
        redis_client.store_document_hashes(document_id, file_hash, chunk_hashes)

        # Store pipeline status
        redis_client.store_pipeline_status(f"doc:{document_id}", {
            "document_id": document_id,
            "overall_status": "running",
            "started_at": datetime.utcnow().isoformat(),
            "steps": [],
        })
    except Exception as e:
        print(f"[Orchestrator] Redis unavailable for hash/status storage: {e}")
        redis_client = None

    # Aggregate results across all chunks
    totals = {
        "entities_created": 0,
        "relationships_created": 0,
        "entities_merged": 0,
        "contradictions_found": 0,
        "merge_suggestions": 0,
        "chunks_processed": 0,
        "chunks_total": len(chunks),
    }

    for i, chunk in enumerate(chunks):
        chunk_num = i + 1
        print(f"[Orchestrator] Processing chunk {chunk_num}/{len(chunks)} for document '{filename}'")

        # ── Step 1: Extraction ──
        _update_status(task, redis_client, document_id, "EXTRACTING", f"Chunk {chunk_num}/{len(chunks)}")

        try:
            extraction_result = extraction_agent.extract(
                text_chunk=chunk,
                document_id=document_id,
                existing_entities=existing_entities,
            )
        except Exception as e:
            print(f"[Orchestrator] Extraction failed for chunk {chunk_num}: {e}")
            continue

        if not extraction_result.entities and not extraction_result.relationships:
            print(f"[Orchestrator] No entities/relationships found in chunk {chunk_num}, skipping")
            continue

        print(f"[Orchestrator] Extracted {len(extraction_result.entities)} entities, "
              f"{len(extraction_result.relationships)} relationships from chunk {chunk_num}")

        # ── Step 2: Verification (MANDATORY — never skip) ──
        _update_status(task, redis_client, document_id, "VERIFYING", f"Chunk {chunk_num}/{len(chunks)}")

        try:
            verified_result = verification_agent.verify(extraction_result)
        except Exception as e:
            print(f"[Orchestrator] Verification failed for chunk {chunk_num}: {e}")
            # On verification failure, skip this chunk entirely — never write unverified data
            continue

        print(f"[Orchestrator] Verified: {len(verified_result.entities)} entities, "
              f"{len(verified_result.relationships)} relationships passed. "
              f"{len(verified_result.dropped_items)} dropped, "
              f"{len(verified_result.contradictions_flagged)} contradictions flagged.")

        # ── Step 3: Entity Resolution ──
        _update_status(task, redis_client, document_id, "RESOLVING", f"Chunk {chunk_num}/{len(chunks)}")

        try:
            resolution_result = entity_resolver.resolve(verified_result)
        except Exception as e:
            print(f"[Orchestrator] Entity resolution failed for chunk {chunk_num}: {e}")
            # On ER failure, pass verified entities through directly (no dedup, but still verified)
            resolution_result = None

        if resolution_result:
            # Update the verified result with resolved entities
            verified_result.entities = resolution_result.resolved_entities
            totals["entities_merged"] += len(resolution_result.auto_merged)
            totals["merge_suggestions"] += len(resolution_result.merge_suggestions)

            # Update existing entities list for next chunk's extraction context
            for entity in resolution_result.new_entities:
                if entity.name not in existing_entities:
                    existing_entities.append(entity.name)

        # ── Step 4: Graph Builder (writes to Neo4j) ──
        _update_status(task, redis_client, document_id, "BUILDING", f"Chunk {chunk_num}/{len(chunks)}")

        try:
            build_result = graph_builder.build(
                verified_result=verified_result,
                document_id=document_id,
                filename=filename,
                file_hash=file_hash,
            )
            totals["entities_created"] += build_result.get("entities_created", 0)
            totals["relationships_created"] += build_result.get("relationships_created", 0)
            totals["contradictions_found"] += build_result.get("contradictions_found", 0)
        except Exception as e:
            print(f"[Orchestrator] Graph build failed for chunk {chunk_num}: {e}")
            continue

        totals["chunks_processed"] += 1

    # ── Pipeline Complete ──
    _update_status(task, redis_client, document_id, "COMPLETED", "Pipeline finished")

    if redis_client:
        try:
            redis_client.store_pipeline_status(f"doc:{document_id}", {
                "document_id": document_id,
                "overall_status": "completed",
                "completed_at": datetime.utcnow().isoformat(),
                "result": totals,
            })
        except Exception:
            pass

    print(f"[Orchestrator] Pipeline complete for '{filename}': {totals}")
    return totals


def _update_status(task, redis_client, document_id: str, state: str, detail: str):
    """Update pipeline status in both Celery and Redis."""
    if task:
        try:
            task.update_state(state=state, meta={"step": state.lower(), "detail": detail, "document_id": document_id})
        except Exception:
            pass

    if redis_client:
        try:
            status = redis_client.get_pipeline_status(f"doc:{document_id}") or {}
            steps = status.get("steps", [])
            steps.append({
                "step": state,
                "detail": detail,
                "timestamp": datetime.utcnow().isoformat(),
            })
            status["steps"] = steps
            status["overall_status"] = "running"
            redis_client.store_pipeline_status(f"doc:{document_id}", status)
        except Exception:
            pass
