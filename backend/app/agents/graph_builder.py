"""
Graph Builder Agent — writes verified, resolved entities and relationships to Neo4j.

This is the ONLY component that writes to Neo4j. It receives items that have
passed through Extraction → Verification → Entity Resolution.

All writes use MERGE for idempotency — a restarted Celery worker never
duplicates graph state.
"""

from datetime import datetime
from app.schema import ExtractedEntity, ExtractedRelationship, VerifiedExtractionResult
from app.db.neo4j_client import get_neo4j_client


class GraphBuilderAgent:
    """
    Writes verified, resolved entities and relationships to Neo4j.
    The final step of the agent pipeline before data reaches persistent storage.
    """

    def __init__(self):
        self.neo4j = get_neo4j_client()

    def build(
        self,
        verified_result: VerifiedExtractionResult,
        document_id: str,
        filename: str,
        file_hash: str = "",
    ) -> dict:
        """
        Write all verified entities and relationships to Neo4j.

        Returns a summary of what was created/updated.
        """
        # Step 1: Ensure the Document node exists
        self.neo4j.merge_document(
            document_id=document_id,
            filename=filename,
            file_hash=file_hash,
        )

        entities_created = 0
        relationships_created = 0

        # Step 2: Write all verified entities
        for entity in verified_result.entities:
            try:
                self.neo4j.merge_entity(
                    name=entity.name,
                    entity_type=entity.type,
                    aliases=entity.aliases,
                    extraction_confidence=entity.extraction_confidence,
                    source_document_id=document_id,
                )
                entities_created += 1
            except Exception as e:
                print(f"[GraphBuilder] Failed to merge entity '{entity.name}': {e}")

        # Step 3: Write all verified relationships
        for rel in verified_result.relationships:
            try:
                # Ensure both endpoint entities exist before creating the relationship
                self.neo4j.merge_entity(
                    name=rel.source_entity,
                    entity_type="CONCEPT",  # Fallback type if not already created
                    source_document_id=document_id,
                )
                self.neo4j.merge_entity(
                    name=rel.target_entity,
                    entity_type="CONCEPT",
                    source_document_id=document_id,
                )

                self.neo4j.merge_relationship(
                    source_name=rel.source_entity,
                    target_name=rel.target_entity,
                    relation_type=rel.relation_type,
                    extraction_confidence=rel.extraction_confidence,
                    verification_status="SUPPORTED",
                    source_document_id=document_id,
                )
                relationships_created += 1
            except Exception as e:
                print(f"[GraphBuilder] Failed to merge relationship '{rel.source_entity}→{rel.target_entity}': {e}")

        # Step 4: Create Contradiction nodes for flagged items
        contradictions_created = 0
        for contradiction in verified_result.contradictions_flagged:
            try:
                import uuid
                self.neo4j.create_contradiction(
                    contradiction_id=str(uuid.uuid4()),
                    entity_a_name=contradiction.get("name", contradiction.get("source", "")),
                    entity_b_name=contradiction.get("name", contradiction.get("target", "")),
                    relationship_type=contradiction.get("relation_type", contradiction.get("entity_type", "")),
                    source_doc_a=contradiction.get("document_id", ""),
                    source_doc_b="existing_graph",
                    source_span_a=contradiction.get("source_span", ""),
                    source_span_b=contradiction.get("notes", ""),
                )
                contradictions_created += 1
            except Exception as e:
                print(f"[GraphBuilder] Failed to create contradiction node: {e}")

        result = {
            "entities_created": entities_created,
            "relationships_created": relationships_created,
            "contradictions_found": contradictions_created,
            "dropped_items": len(verified_result.dropped_items),
        }

        print(f"[GraphBuilder] Completed: {result}")
        return result
