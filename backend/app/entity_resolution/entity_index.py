"""
Entity Index — manages the dedicated ChromaDB collection for entity resolution.

This is physically and conceptually separate from document semantic search.
ChromaDB stays scoped to document embeddings for retrieval (Phase 1).
This index is purely for entity deduplication.

Fields per entry: entity_name, entity_type, aliases[], embedding, canonical_id
Embeddings: Sentence Transformers (all-MiniLM-L6-v2), NOT Gemini.
"""

import os
from typing import Optional
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import get_settings


class EntityIndex:
    """
    Dedicated entity-resolution index backed by a separate ChromaDB collection.
    Uses Sentence Transformers for embeddings (high-volume, low-stakes — no LLM budget).
    """

    _instance: Optional["EntityIndex"] = None
    _embedding_model = None

    def __init__(self):
        settings = get_settings()

        # Separate ChromaDB instance/path for entity resolution
        self.chroma_client = chromadb.PersistentClient(
            path=settings.entity_index_path,
            settings=ChromaSettings(anonymized_telemetry=False),
        )

        self.collection = self.chroma_client.get_or_create_collection(
            name="entity_index",
            metadata={"description": "Entity resolution index for CortexGraph Phase 2"},
        )

        # Lazy-load the embedding model
        self._model_name = settings.sentence_transformer_model

    @classmethod
    def get_instance(cls) -> "EntityIndex":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_embedding_model(self):
        """Lazy-load Sentence Transformer model."""
        if EntityIndex._embedding_model is None:
            from sentence_transformers import SentenceTransformer
            EntityIndex._embedding_model = SentenceTransformer(self._model_name)
        return EntityIndex._embedding_model

    def _embed(self, text: str) -> list[float]:
        """Generate embedding for a text string."""
        model = self._get_embedding_model()
        embedding = model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    def add_entity(
        self,
        canonical_id: str,
        name: str,
        entity_type: str,
        aliases: list[str] = None,
    ) -> None:
        """Add or update an entity in the index."""
        # Combine name + type for richer embedding
        text_to_embed = f"{name} ({entity_type})"
        embedding = self._embed(text_to_embed)

        metadata = {
            "entity_name": name,
            "entity_type": entity_type,
            "aliases": ",".join(aliases or []),
            "canonical_id": canonical_id,
        }

        self.collection.upsert(
            ids=[canonical_id],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[text_to_embed],
        )

    def query_similar(
        self,
        name: str,
        entity_type: str,
        top_k: int = 5,
    ) -> list[dict]:
        """
        Query for the top-k most similar entities of the same type.
        Returns list of {canonical_id, entity_name, entity_type, aliases, distance}.
        """
        text_to_embed = f"{name} ({entity_type})"
        embedding = self._embed(text_to_embed)

        # Filter by same entity type for blocking
        where_filter = {"entity_type": entity_type}

        try:
            results = self.collection.query(
                query_embeddings=[embedding],
                n_results=top_k,
                where=where_filter,
                include=["metadatas", "distances", "documents"],
            )
        except Exception:
            # If filter fails (e.g. no entities of this type yet), query without filter
            try:
                results = self.collection.query(
                    query_embeddings=[embedding],
                    n_results=top_k,
                    include=["metadatas", "distances", "documents"],
                )
            except Exception:
                return []

        entries = []
        if results and results.get("ids") and results["ids"][0]:
            for i, cid in enumerate(results["ids"][0]):
                meta = results["metadatas"][0][i] if results.get("metadatas") else {}
                distance = results["distances"][0][i] if results.get("distances") else 1.0
                # ChromaDB returns L2 distance; convert to similarity (0-1 range)
                similarity = max(0.0, 1.0 - (distance / 2.0))

                entries.append({
                    "canonical_id": cid,
                    "entity_name": meta.get("entity_name", ""),
                    "entity_type": meta.get("entity_type", ""),
                    "aliases": meta.get("aliases", "").split(",") if meta.get("aliases") else [],
                    "embedding_similarity": similarity,
                    "distance": distance,
                })

        return entries

    def remove_entity(self, canonical_id: str) -> None:
        """Remove an entity from the index."""
        try:
            self.collection.delete(ids=[canonical_id])
        except Exception:
            pass

    def get_all_entity_names(self) -> list[str]:
        """Get all entity names in the index (for context in extraction)."""
        try:
            results = self.collection.get(include=["metadatas"])
            if results and results.get("metadatas"):
                return [m.get("entity_name", "") for m in results["metadatas"] if m.get("entity_name")]
            return []
        except Exception:
            return []

    def count(self) -> int:
        """Count entities in the index."""
        return self.collection.count()


def get_entity_index() -> EntityIndex:
    """Get the singleton EntityIndex instance."""
    return EntityIndex.get_instance()
