"""
Entity Resolver — deduplicates entities using embedding similarity,
string similarity, and graph neighbor overlap.

Resolution pipeline:
1. Blocking: embed name+type, query entity index for top-5 same-type matches
2. Scoring: weighted combination of embedding, string, and neighbor similarity
3. Decision: auto-merge (>0.92), human review (0.75–0.92), or new entity (<0.75)
"""

import re
import uuid
from typing import Optional
from rapidfuzz import fuzz
from app.schema import (
    ExtractedEntity, ExtractedRelationship,
    VerifiedExtractionResult, EntityResolutionResult, MergeSuggestion,
)
from app.entity_resolution.entity_index import get_entity_index
from app.db.neo4j_client import get_neo4j_client, Neo4jClient
from app.db.redis_client import get_redis_client
from app.config import get_settings


class EntityResolver:
    """
    Resolves duplicate entities:
    'Subrat', 'Subrat Panigrahi', 'S. Panigrahi' → one canonical node.
    """

    def __init__(self):
        self.settings = get_settings()
        self.auto_merge_threshold = self.settings.er_auto_merge_threshold
        self.review_threshold = self.settings.er_review_threshold

        # Scoring weights
        self.w_embedding = 0.40
        self.w_string = 0.35
        self.w_neighbor = 0.25

    def resolve(self, verified_result: VerifiedExtractionResult) -> EntityResolutionResult:
        """
        Resolve all entities from a verified extraction result.
        Returns entities ready for graph write, plus merge suggestions.
        """
        entity_index = get_entity_index()
        neo4j = None
        redis_client = None

        try:
            neo4j = get_neo4j_client()
        except Exception:
            print("[EntityResolver] Neo4j unavailable — skipping neighbor overlap")

        try:
            redis_client = get_redis_client()
        except Exception:
            print("[EntityResolver] Redis unavailable — merge suggestions won't be queued")

        resolved_entities = []
        auto_merged = []
        merge_suggestions = []
        new_entities = []

        for entity in verified_result.entities:
            resolution = self._resolve_single_entity(
                entity=entity,
                entity_index=entity_index,
                neo4j=neo4j,
            )

            if resolution["action"] == "auto_merge":
                auto_merged.append(resolution)
                # Perform the merge in Neo4j
                if neo4j:
                    canonical_id = resolution["canonical_id"]
                    dup_id = Neo4jClient._make_entity_id(entity.name)
                    neo4j.merge_entities_apoc(canonical_id, dup_id, entity.name)

                # Update entity index with alias
                try:
                    existing_aliases = resolution.get("existing_aliases", [])
                    existing_aliases.append(entity.name)
                    entity_index.add_entity(
                        canonical_id=resolution["canonical_id"],
                        name=resolution["canonical_name"],
                        entity_type=entity.type,
                        aliases=existing_aliases,
                    )
                except Exception as e:
                    print(f"[EntityResolver] Failed to update index alias: {e}")

            elif resolution["action"] == "review":
                suggestion = MergeSuggestion(
                    candidate_name=entity.name,
                    candidate_type=entity.type,
                    canonical_id=resolution["canonical_id"],
                    canonical_name=resolution["canonical_name"],
                    similarity_score=resolution["score"],
                    string_similarity=resolution["string_score"],
                    embedding_similarity=resolution["embedding_score"],
                    neighbor_overlap=resolution["neighbor_score"],
                )
                merge_suggestions.append(suggestion)

                # Store in Redis for the frontend panel
                if redis_client:
                    redis_client.store_merge_suggestion(suggestion.model_dump())

                # Still add the entity as new (pending review)
                resolved_entities.append(entity)
                new_entities.append(entity)
                self._add_to_index(entity_index, entity)

            else:  # new entity
                resolved_entities.append(entity)
                new_entities.append(entity)
                self._add_to_index(entity_index, entity)

        return EntityResolutionResult(
            resolved_entities=resolved_entities,
            auto_merged=auto_merged,
            merge_suggestions=merge_suggestions,
            new_entities=new_entities,
        )

    def _resolve_single_entity(
        self,
        entity: ExtractedEntity,
        entity_index,
        neo4j: Optional[Neo4jClient],
    ) -> dict:
        """
        Resolve a single entity against the index.
        Returns {action: "auto_merge"|"review"|"new", score, ...}
        """
        # Step 1: Blocking — query top-5 same-type entities from index
        candidates = entity_index.query_similar(
            name=entity.name,
            entity_type=entity.type,
            top_k=5,
        )

        if not candidates:
            return {"action": "new", "score": 0.0}

        best_match = None
        best_score = 0.0
        best_scores = {"embedding": 0.0, "string": 0.0, "neighbor": 0.0}

        for candidate in candidates:
            # Don't match against yourself
            candidate_id = candidate["canonical_id"]
            candidate_name = candidate["entity_name"]
            candidate_aliases = candidate.get("aliases", [])

            # Step 2: Scoring
            # (a) Embedding cosine similarity (already computed by ChromaDB)
            embedding_score = candidate.get("embedding_similarity", 0.0)

            # (b) String similarity — best match across name and aliases
            all_names = [candidate_name] + candidate_aliases
            string_scores = [
                fuzz.token_sort_ratio(entity.name.lower(), n.lower()) / 100.0
                for n in all_names if n
            ]
            string_score = max(string_scores) if string_scores else 0.0

            # Also check entity aliases against candidate
            for alias in entity.aliases:
                alias_scores = [
                    fuzz.token_sort_ratio(alias.lower(), n.lower()) / 100.0
                    for n in all_names if n
                ]
                if alias_scores:
                    string_score = max(string_score, max(alias_scores))

            # (c) Shared-neighbor overlap in graph
            neighbor_score = 0.0
            if neo4j:
                try:
                    candidate_neighbors = set(neo4j.get_entity_neighbors(candidate_id))
                    entity_id = Neo4jClient._make_entity_id(entity.name)
                    entity_neighbors = set(neo4j.get_entity_neighbors(entity_id))

                    if candidate_neighbors or entity_neighbors:
                        overlap = len(candidate_neighbors & entity_neighbors)
                        union = len(candidate_neighbors | entity_neighbors)
                        neighbor_score = overlap / union if union > 0 else 0.0
                except Exception:
                    pass

            # Weighted combination
            combined_score = (
                self.w_embedding * embedding_score
                + self.w_string * string_score
                + self.w_neighbor * neighbor_score
            )

            if combined_score > best_score:
                best_score = combined_score
                best_scores = {
                    "embedding": embedding_score,
                    "string": string_score,
                    "neighbor": neighbor_score,
                }
                best_match = candidate

        if not best_match:
            return {"action": "new", "score": 0.0}

        # Step 3: Decision
        if best_score > self.auto_merge_threshold:
            return {
                "action": "auto_merge",
                "score": best_score,
                "canonical_id": best_match["canonical_id"],
                "canonical_name": best_match["entity_name"],
                "existing_aliases": best_match.get("aliases", []),
                "embedding_score": best_scores["embedding"],
                "string_score": best_scores["string"],
                "neighbor_score": best_scores["neighbor"],
            }
        elif best_score > self.review_threshold:
            return {
                "action": "review",
                "score": best_score,
                "canonical_id": best_match["canonical_id"],
                "canonical_name": best_match["entity_name"],
                "embedding_score": best_scores["embedding"],
                "string_score": best_scores["string"],
                "neighbor_score": best_scores["neighbor"],
            }
        else:
            return {"action": "new", "score": best_score}

    def _add_to_index(self, entity_index, entity: ExtractedEntity) -> None:
        """Add a new entity to the resolution index."""
        canonical_id = Neo4jClient._make_entity_id(entity.name)
        try:
            entity_index.add_entity(
                canonical_id=canonical_id,
                name=entity.name,
                entity_type=entity.type,
                aliases=entity.aliases,
            )
        except Exception as e:
            print(f"[EntityResolver] Failed to add '{entity.name}' to index: {e}")
