"""
Document Service — handles document hashing, incremental update diffing,
and re-indexing.

On upload: compute SHA-256 per document and per chunk.
On re-upload: diff chunk hashes → only changed/new chunks enter the pipeline.
Removed chunks get facts flagged, not deleted.
"""

import hashlib
from typing import Optional
from app.ingest import parse_file_content, chunk_text
from app.db.redis_client import get_redis_client
from app.db.neo4j_client import get_neo4j_client


class DocumentService:
    """Manages document lifecycle, hashing, and incremental updates."""

    def __init__(self):
        self.redis = get_redis_client()

    @staticmethod
    def compute_hash(content: str) -> str:
        """Compute SHA-256 hash of content."""
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    @staticmethod
    def compute_document_hash(content: bytes) -> str:
        """Compute SHA-256 hash of raw document bytes."""
        return hashlib.sha256(content).hexdigest()

    def diff_chunks(
        self,
        document_id: str,
        new_chunks: list[str],
    ) -> dict:
        """
        Diff new chunks against stored hashes.

        Returns:
            {
                "is_new": bool,          # True if document has never been indexed
                "unchanged": list[int],  # Indices of unchanged chunks
                "changed": list[int],    # Indices of chunks that changed
                "added": list[int],      # Indices of new chunks
                "removed": list[str],    # Hashes of chunks that no longer exist
            }
        """
        stored = self.redis.get_document_hashes(document_id)

        if not stored:
            return {
                "is_new": True,
                "unchanged": [],
                "changed": [],
                "added": list(range(len(new_chunks))),
                "removed": [],
            }

        old_hashes = stored.get("chunk_hashes", [])
        new_hashes = [self.compute_hash(c) for c in new_chunks]

        old_set = set(old_hashes)
        new_set = set(new_hashes)

        unchanged = []
        changed = []
        added = []

        for i, h in enumerate(new_hashes):
            if h in old_set:
                unchanged.append(i)
            else:
                # Could be a changed or new chunk
                if i < len(old_hashes):
                    changed.append(i)
                else:
                    added.append(i)

        # Chunks that existed before but aren't in the new version
        removed = [h for h in old_hashes if h not in new_set]

        return {
            "is_new": False,
            "unchanged": unchanged,
            "changed": changed,
            "added": added,
            "removed": removed,
        }

    def get_chunks_to_process(
        self,
        document_id: str,
        all_chunks: list[str],
    ) -> list[str]:
        """
        Returns only the chunks that need processing (changed + added).
        For a new document, returns all chunks.
        """
        diff = self.diff_chunks(document_id, all_chunks)

        if diff["is_new"]:
            return all_chunks

        indices_to_process = diff["changed"] + diff["added"]
        return [all_chunks[i] for i in sorted(indices_to_process)]

    def store_hashes(self, document_id: str, content: str, chunks: list[str]) -> None:
        """Store document and chunk hashes after successful processing."""
        file_hash = self.compute_hash(content)
        chunk_hashes = [self.compute_hash(c) for c in chunks]
        self.redis.store_document_hashes(document_id, file_hash, chunk_hashes)

    def flag_removed_facts(self, document_id: str, removed_hashes: list[str]) -> None:
        """
        Flag facts associated with removed chunks rather than deleting them.
        Another document might still corroborate them.
        """
        if not removed_hashes:
            return

        try:
            neo4j = get_neo4j_client()
            # Flag entities from this document that may be affected
            neo4j.run_cypher(
                """
                MATCH (e:Entity)-[:EXTRACTED_FROM]->(d:Document {id: $doc_id})
                SET e.flagged = true,
                    e.flag_reason = 'Source chunk removed during re-index'
                """,
                {"doc_id": document_id},
            )
        except Exception as e:
            print(f"[DocumentService] Failed to flag removed facts: {e}")

    def reindex(self, document_id: str, task=None) -> dict:
        """
        Full re-index of a document. Called by the reindex_document Celery task.
        """
        from app.tasks.pipeline import run_agent_pipeline

        try:
            neo4j = get_neo4j_client()
            # Get the stored document info
            results = neo4j.run_cypher(
                "MATCH (d:Document {id: $id}) RETURN d.filename AS filename",
                {"id": document_id},
            )
            if not results:
                return {"status": "error", "message": f"Document {document_id} not found in graph"}

            filename = results[0].get("filename", "unknown")

            # We would need the raw text stored somewhere to re-chunk
            # For now, this is a manual trigger that requires re-upload
            return {
                "status": "needs_reupload",
                "message": f"Document '{filename}' needs to be re-uploaded for re-indexing",
                "document_id": document_id,
            }

        except Exception as e:
            return {"status": "error", "message": str(e)}
