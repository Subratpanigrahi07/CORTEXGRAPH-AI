"""
Contradiction Service — detects and manages knowledge conflicts.

Two detection layers:
1. Structural pass (Cypher, cheap, always-on) — finds conflicting relationships
2. Semantic pass (Gemini, candidates only) — classifies as TRUE_CONTRADICTION,
   COMPLEMENTARY_FACTS, or AMBIGUOUS

Resolution is human-in-the-loop: contradictions surface to a review panel
with actions to keep A, keep B, or keep both.
"""

import json
import time
import uuid
from typing import Optional
from app.schema import Contradiction, CONTRADICTION_CLASS
from app.db.neo4j_client import get_neo4j_client
from app.db.redis_client import get_redis_client
from app.config import get_settings


class ContradictionService:
    """Detects and manages knowledge conflicts in the graph."""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gemini_api_key
        self.client = None
        if self.api_key:
            try:
                from google import genai
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[ContradictionService] Gemini client init warning: {e}")

    def detect_all(self) -> list[Contradiction]:
        """
        Run full contradiction detection: structural pass + semantic classification.
        Returns list of detected contradictions.
        """
        neo4j = get_neo4j_client()

        # Step 1: Structural pass (Cypher)
        structural_candidates = neo4j.find_structural_contradictions()
        print(f"[ContradictionService] Structural pass found {len(structural_candidates)} candidates")

        contradictions = []
        seen_pairs = set()

        for candidate in structural_candidates:
            entity_name = candidate.get("entity", "")
            target_1 = candidate.get("target_1", "")
            target_2 = candidate.get("target_2", "")
            rel_type = candidate.get("relationship_type", "")

            # Deduplicate symmetric pairs
            pair_key = tuple(sorted([target_1, target_2]) + [rel_type])
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            # Step 2: Semantic classification (LLM)
            classification = self._classify_contradiction(
                entity_name=entity_name,
                target_1=target_1,
                target_2=target_2,
                rel_type=rel_type,
                doc_1=candidate.get("doc_1", ""),
                doc_2=candidate.get("doc_2", ""),
            )

            # Only surface TRUE_CONTRADICTION to the user
            if classification == "TRUE_CONTRADICTION":
                contradiction = Contradiction(
                    entity_a_name=target_1,
                    entity_b_name=target_2,
                    relationship_type=f"{entity_name} → {rel_type}",
                    source_doc_a=candidate.get("doc_1", "unknown"),
                    source_doc_b=candidate.get("doc_2", "unknown"),
                    source_span_a=f"{entity_name} {rel_type} {target_1}",
                    source_span_b=f"{entity_name} {rel_type} {target_2}",
                    classification=classification,
                )
                contradictions.append(contradiction)

                # Store in Neo4j
                try:
                    neo4j.create_contradiction(
                        contradiction_id=contradiction.id,
                        entity_a_name=target_1,
                        entity_b_name=target_2,
                        relationship_type=f"{entity_name} → {rel_type}",
                        source_doc_a=candidate.get("doc_1", "unknown"),
                        source_doc_b=candidate.get("doc_2", "unknown"),
                        source_span_a=f"{entity_name} {rel_type} {target_1}",
                        source_span_b=f"{entity_name} {rel_type} {target_2}",
                    )
                except Exception as e:
                    print(f"[ContradictionService] Failed to store contradiction: {e}")

        print(f"[ContradictionService] {len(contradictions)} true contradictions detected")
        return contradictions

    def _classify_contradiction(
        self,
        entity_name: str,
        target_1: str,
        target_2: str,
        rel_type: str,
        doc_1: str,
        doc_2: str,
    ) -> str:
        """
        Use Gemini to classify whether a structural conflict is a true
        contradiction, complementary facts, or ambiguous.
        """
        if not self.client:
            # Without LLM, default to TRUE_CONTRADICTION for safety
            return "TRUE_CONTRADICTION"

        from google.genai import types

        prompt = (
            f"Two knowledge graph relationships appear to conflict:\n\n"
            f"Fact A: '{entity_name}' {rel_type} '{target_1}' (from document: {doc_1})\n"
            f"Fact B: '{entity_name}' {rel_type} '{target_2}' (from document: {doc_2})\n\n"
            f"Classify this as one of:\n"
            f"- TRUE_CONTRADICTION: The facts genuinely conflict and cannot both be true\n"
            f"- COMPLEMENTARY_FACTS: Both facts can be true (e.g. multiple affiliations over time)\n"
            f"- AMBIGUOUS: Not enough information to determine\n\n"
            f"Respond with ONLY one of: TRUE_CONTRADICTION, COMPLEMENTARY_FACTS, AMBIGUOUS"
        )

        models = ["gemini-2.5-flash-lite", "gemini-2.0-flash"]
        for model_name in models:
            try:
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.0),
                )
                text = response.text.strip().upper()
                if "TRUE_CONTRADICTION" in text:
                    return "TRUE_CONTRADICTION"
                elif "COMPLEMENTARY" in text:
                    return "COMPLEMENTARY_FACTS"
                else:
                    return "AMBIGUOUS"
            except Exception as e:
                print(f"[ContradictionService] Classification failed with '{model_name}': {e}")
                continue

        return "AMBIGUOUS"

    def get_open_contradictions(self) -> list[dict]:
        """Get all open contradictions from Neo4j."""
        neo4j = get_neo4j_client()
        results = neo4j.get_open_contradictions()
        return [r.get("contradiction", r) for r in results]

    def resolve(self, contradiction_id: str, resolution: str) -> bool:
        """
        Resolve a contradiction.
        resolution: "kept_a" | "kept_b" | "kept_both"
        """
        neo4j = get_neo4j_client()
        try:
            neo4j.resolve_contradiction(contradiction_id, resolution)
            return True
        except Exception as e:
            print(f"[ContradictionService] Resolution failed: {e}")
            return False
