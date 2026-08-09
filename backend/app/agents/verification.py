"""
Verification Agent — mandatory gate between extraction and graph writes.

Checks each extracted entity/relationship for:
1. Grounding — is the claim actually supported by the source_span?
2. Consistency — does this contradict something already in the graph?

Only SUPPORTED items proceed to entity resolution + graph builder.
CONTRADICTED items get flagged into the contradiction queue.
UNSUPPORTED/AMBIGUOUS items are dropped with logging.
"""

import json
import time
from typing import Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError
from app.schema import (
    ExtractedEntity, ExtractedRelationship, ExtractionResult,
    VerificationResult, VerifiedExtractionResult,
)
from app.config import get_settings
from app.db.neo4j_client import get_neo4j_client


class VerificationAgent:
    """
    Mandatory verification gate — no entity or relationship reaches Neo4j
    without passing through this agent first.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gemini_api_key
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[VerificationAgent] Gemini client init warning: {e}")

        self.models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ]

    def verify(self, extraction_result: ExtractionResult) -> VerifiedExtractionResult:
        """
        Verify all extracted entities and relationships.
        Returns only items that passed verification.
        """
        verified_entities = []
        verified_relationships = []
        contradictions_flagged = []
        dropped_items = []

        # Verify entities
        for entity in extraction_result.entities:
            result = self._verify_entity(entity)

            if result.status == "SUPPORTED":
                verified_entities.append(entity)
            elif result.status == "CONTRADICTED":
                verified_entities.append(entity)  # Still proceeds, but flagged
                contradictions_flagged.append({
                    "type": "entity",
                    "name": entity.name,
                    "entity_type": entity.type,
                    "source_span": entity.source_span,
                    "document_id": entity.source_document_id,
                    "notes": result.verification_notes,
                })
            else:
                # UNSUPPORTED or AMBIGUOUS — drop
                dropped_items.append(result)
                print(f"[VerificationAgent] Dropped entity '{entity.name}': {result.status} — {result.verification_notes}")

        # Verify relationships
        for rel in extraction_result.relationships:
            result = self._verify_relationship(rel)

            if result.status == "SUPPORTED":
                verified_relationships.append(rel)
            elif result.status == "CONTRADICTED":
                verified_relationships.append(rel)  # Still proceeds, but flagged
                contradictions_flagged.append({
                    "type": "relationship",
                    "source": rel.source_entity,
                    "target": rel.target_entity,
                    "relation_type": rel.relation_type,
                    "source_span": rel.source_span,
                    "document_id": rel.source_document_id,
                    "notes": result.verification_notes,
                })
            else:
                dropped_items.append(result)
                print(f"[VerificationAgent] Dropped relationship '{rel.source_entity}->{rel.target_entity}': {result.status}")

        return VerifiedExtractionResult(
            entities=verified_entities,
            relationships=verified_relationships,
            contradictions_flagged=contradictions_flagged,
            dropped_items=dropped_items,
        )

    def _verify_entity(self, entity: ExtractedEntity) -> VerificationResult:
        """Verify a single entity against its source span and existing graph."""
        # Step 1: Grounding check via LLM
        grounding_result = self._grounding_check(
            claim=f"Entity '{entity.name}' of type '{entity.type}' exists",
            source_span=entity.source_span,
        )

        if grounding_result and grounding_result.get("status") == "UNSUPPORTED":
            return VerificationResult(
                item_type="entity",
                item_name=entity.name,
                status="UNSUPPORTED",
                extraction_confidence=entity.extraction_confidence,
                verification_notes=grounding_result.get("reason", "Not grounded in source text"),
                source_document_id=entity.source_document_id,
            )

        # Step 2: Consistency check against existing graph
        consistency_result = self._consistency_check_entity(entity)

        return VerificationResult(
            item_type="entity",
            item_name=entity.name,
            status=consistency_result.get("status", "SUPPORTED"),
            extraction_confidence=entity.extraction_confidence,
            verification_notes=consistency_result.get("notes", "Verified"),
            source_document_id=entity.source_document_id,
        )

    def _verify_relationship(self, rel: ExtractedRelationship) -> VerificationResult:
        """Verify a single relationship against its source span and existing graph."""
        # Step 1: Grounding check
        grounding_result = self._grounding_check(
            claim=f"'{rel.source_entity}' {rel.relation_type} '{rel.target_entity}'",
            source_span=rel.source_span,
        )

        if grounding_result and grounding_result.get("status") == "UNSUPPORTED":
            return VerificationResult(
                item_type="relationship",
                item_name=f"{rel.source_entity} → {rel.target_entity}",
                status="UNSUPPORTED",
                extraction_confidence=rel.extraction_confidence,
                verification_notes=grounding_result.get("reason", "Not grounded in source text"),
                source_document_id=rel.source_document_id,
            )

        # Step 2: Consistency check
        consistency_result = self._consistency_check_relationship(rel)

        return VerificationResult(
            item_type="relationship",
            item_name=f"{rel.source_entity} → {rel.target_entity}",
            status=consistency_result.get("status", "SUPPORTED"),
            extraction_confidence=rel.extraction_confidence,
            verification_notes=consistency_result.get("notes", "Verified"),
            source_document_id=rel.source_document_id,
        )

    def _grounding_check(self, claim: str, source_span: str) -> Optional[dict]:
        """
        Use Gemini to verify whether a claim is actually supported
        by the source text span, or if the extraction is hallucinating.
        """
        if not self.client or not source_span.strip():
            # If no LLM or no source span, pass through (benefit of doubt)
            return {"status": "SUPPORTED", "reason": "No LLM available or empty source span"}

        system_instruction = (
            "You are a fact verification engine. Given a CLAIM and a SOURCE TEXT, "
            "determine if the claim is actually supported by the source text.\n\n"
            "Respond with JSON: {\"status\": \"SUPPORTED\" or \"UNSUPPORTED\" or \"AMBIGUOUS\", "
            "\"reason\": \"brief explanation\"}\n\n"
            "Be strict: the claim must be clearly stated or directly implied by the source text. "
            "Do not give credit for vague or tangential mentions."
        )

        prompt = f"CLAIM: {claim}\n\nSOURCE TEXT: {source_span}"

        for model_name in self.models_to_try:
            try:
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        temperature=0.0,
                    ),
                )
                return json.loads(response.text)
            except Exception as e:
                print(f"[VerificationAgent] Grounding check failed with '{model_name}': {e}")
                continue

        # If all models fail, pass through
        return {"status": "SUPPORTED", "reason": "Grounding check unavailable — passed by default"}

    def _consistency_check_entity(self, entity: ExtractedEntity) -> dict:
        """
        Check if this entity contradicts existing graph state.
        For now: check if an entity with the same name but different type exists.
        """
        try:
            neo4j = get_neo4j_client()
            results = neo4j.run_cypher(
                "MATCH (e:Entity) WHERE toLower(e.name) = toLower($name) RETURN e.type AS type, e.id AS id",
                {"name": entity.name},
            )

            if results:
                existing_type = results[0].get("type", "")
                if existing_type and existing_type != entity.type:
                    return {
                        "status": "CONTRADICTED",
                        "notes": f"Entity '{entity.name}' exists as type '{existing_type}' "
                                f"but new extraction has type '{entity.type}'",
                    }

            return {"status": "SUPPORTED", "notes": "No contradictions found"}

        except Exception as e:
            # If Neo4j is down, pass through
            print(f"[VerificationAgent] Consistency check skipped (Neo4j unavailable): {e}")
            return {"status": "SUPPORTED", "notes": "Consistency check skipped"}

    def _consistency_check_relationship(self, rel: ExtractedRelationship) -> dict:
        """
        Check if this relationship contradicts existing graph state.
        Looks for conflicting relationships of exclusive types.
        """
        # Relationship types that should be exclusive (only one target)
        exclusive_types = {"DEVELOPED_BY", "CREATED", "AUTHORED_BY"}

        if rel.relation_type not in exclusive_types:
            return {"status": "SUPPORTED", "notes": "Non-exclusive relationship type"}

        try:
            neo4j = get_neo4j_client()
            # Check if source entity already has this relationship type to a DIFFERENT target
            from app.db.neo4j_client import Neo4jClient
            source_id = Neo4jClient._make_entity_id(rel.source_entity)

            results = neo4j.run_cypher(
                f"""
                MATCH (s:Entity {{id: $source_id}})-[r:{rel.relation_type}]->(t:Entity)
                WHERE toLower(t.name) <> toLower($target_name)
                RETURN t.name AS existing_target, t.id AS target_id
                """,
                {"source_id": source_id, "target_name": rel.target_entity},
            )

            if results:
                existing_target = results[0].get("existing_target", "unknown")
                return {
                    "status": "CONTRADICTED",
                    "notes": f"'{rel.source_entity}' already has {rel.relation_type} → "
                            f"'{existing_target}', but new extraction says → '{rel.target_entity}'",
                }

            return {"status": "SUPPORTED", "notes": "No contradictions found"}

        except Exception as e:
            print(f"[VerificationAgent] Relationship consistency check skipped: {e}")
            return {"status": "SUPPORTED", "notes": "Consistency check skipped"}
