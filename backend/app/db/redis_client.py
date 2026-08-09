"""
Redis client for CortexGraph Phase 2.
Used for: document hash cache, merge suggestion storage, analytics cache.
"""

import json
from typing import Any, Optional
import redis
from app.config import get_settings


class RedisClient:
    """Redis client wrapper for CortexGraph."""

    _instance: Optional["RedisClient"] = None

    def __init__(self):
        settings = get_settings()
        self.client = redis.from_url(settings.redis_url, decode_responses=True)

    @classmethod
    def get_instance(cls) -> "RedisClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def ping(self) -> bool:
        try:
            return self.client.ping()
        except Exception:
            return False

    # ── Document Hash Cache ───────────────────────────────

    def store_document_hashes(self, document_id: str, file_hash: str, chunk_hashes: list[str]) -> None:
        """Store document and chunk hashes for incremental update diffing."""
        key = f"doc:{document_id}"
        self.client.hset(key, mapping={
            "file_hash": file_hash,
            "chunk_hashes": json.dumps(chunk_hashes),
        })

    def get_document_hashes(self, document_id: str) -> Optional[dict]:
        """Retrieve stored hashes for a document."""
        key = f"doc:{document_id}"
        data = self.client.hgetall(key)
        if not data:
            return None
        return {
            "file_hash": data.get("file_hash", ""),
            "chunk_hashes": json.loads(data.get("chunk_hashes", "[]")),
        }

    def delete_document_hashes(self, document_id: str) -> None:
        """Remove hash cache for a document."""
        self.client.delete(f"doc:{document_id}")

    # ── Merge Suggestions ─────────────────────────────────

    def store_merge_suggestion(self, suggestion: dict) -> None:
        """Store a merge suggestion for human review."""
        key = f"merge:{suggestion['id']}"
        self.client.set(key, json.dumps(suggestion))
        # Also add to the index set
        self.client.sadd("merge_suggestions", suggestion["id"])

    def get_merge_suggestions(self, status: str = "pending") -> list[dict]:
        """Get all merge suggestions with given status."""
        suggestion_ids = self.client.smembers("merge_suggestions")
        suggestions = []
        for sid in suggestion_ids:
            data = self.client.get(f"merge:{sid}")
            if data:
                suggestion = json.loads(data)
                if suggestion.get("status") == status:
                    suggestions.append(suggestion)
        return sorted(suggestions, key=lambda s: s.get("similarity_score", 0), reverse=True)

    def get_merge_suggestion(self, suggestion_id: str) -> Optional[dict]:
        """Get a single merge suggestion by ID."""
        data = self.client.get(f"merge:{suggestion_id}")
        return json.loads(data) if data else None

    def update_merge_suggestion_status(self, suggestion_id: str, status: str) -> bool:
        """Update the status of a merge suggestion."""
        data = self.client.get(f"merge:{suggestion_id}")
        if not data:
            return False
        suggestion = json.loads(data)
        suggestion["status"] = status
        self.client.set(f"merge:{suggestion_id}", json.dumps(suggestion))
        return True

    # ── Analytics Cache ───────────────────────────────────

    def cache_analytics(self, key: str, data: Any, ttl: int = 600) -> None:
        """Cache analytics results with TTL."""
        self.client.setex(f"analytics:{key}", ttl, json.dumps(data))

    def get_cached_analytics(self, key: str) -> Optional[Any]:
        """Retrieve cached analytics results."""
        data = self.client.get(f"analytics:{key}")
        return json.loads(data) if data else None

    # ── Pipeline Status ───────────────────────────────────

    def store_pipeline_status(self, job_id: str, status: dict) -> None:
        """Store pipeline execution status."""
        self.client.setex(f"pipeline:{job_id}", 3600, json.dumps(status))

    def get_pipeline_status(self, job_id: str) -> Optional[dict]:
        """Retrieve pipeline status."""
        data = self.client.get(f"pipeline:{job_id}")
        return json.loads(data) if data else None


def get_redis_client() -> RedisClient:
    """Get the singleton Redis client instance."""
    return RedisClient.get_instance()
