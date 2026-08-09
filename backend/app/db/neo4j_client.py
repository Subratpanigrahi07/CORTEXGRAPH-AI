"""
Neo4j client for CortexGraph Phase 2.
All graph reads/writes go through this module.
Uses MERGE throughout for idempotent writes.
"""

import os
import re
from datetime import datetime
from typing import Any, Optional
from neo4j import GraphDatabase
from app.config import get_settings


class Neo4jClient:
    """Thread-safe Neo4j driver wrapper with connection pooling."""

    _instance: Optional["Neo4jClient"] = None

    def __init__(self):
        settings = get_settings()
        self.driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_username, settings.neo4j_password),
        )

    @classmethod
    def get_instance(cls) -> "Neo4jClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def close(self):
        if self.driver:
            self.driver.close()

    def verify_connectivity(self) -> bool:
        try:
            self.driver.verify_connectivity()
            return True
        except Exception:
            return False

    def run_cypher(self, query: str, parameters: dict = None) -> list[dict]:
        """Execute a Cypher query and return list of record dicts."""
        with self.driver.session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]

    # ── Schema Setup ──────────────────────────────────────

    def setup_schema(self):
        """Create constraints and indexes on startup."""
        constraints = [
            "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
            "CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
            "CREATE CONSTRAINT contradiction_id IF NOT EXISTS FOR (c:Contradiction) REQUIRE c.id IS UNIQUE",
        ]
        indexes = [
            "CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name)",
            "CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type)",
            "CREATE INDEX document_filename IF NOT EXISTS FOR (d:Document) ON (d.filename)",
        ]
        with self.driver.session() as session:
            for stmt in constraints + indexes:
                try:
                    session.run(stmt)
                except Exception as e:
                    print(f"[Neo4j] Schema statement skipped: {e}")

    # ── Entity Operations ─────────────────────────────────

    @staticmethod
    def _make_entity_id(name: str) -> str:
        """Generate a deterministic entity ID from name."""
        return re.sub(r"[^a-z0-9_]", "", name.lower().strip().replace(" ", "_"))

    def merge_entity(
        self,
        name: str,
        entity_type: str,
        aliases: list[str] = None,
        extraction_confidence: float = 0.0,
        source_document_id: str = "",
        properties: dict = None,
    ) -> str:
        """MERGE an entity node. Returns the entity ID."""
        entity_id = self._make_entity_id(name)
        now = datetime.utcnow().isoformat()

        query = """
        MERGE (e:Entity {id: $id})
        ON CREATE SET
            e.name = $name,
            e.type = $type,
            e.aliases = $aliases,
            e.extraction_confidence = $confidence,
            e.created_at = $now,
            e.updated_at = $now
        ON MATCH SET
            e.updated_at = $now,
            e.extraction_confidence = CASE
                WHEN $confidence > e.extraction_confidence THEN $confidence
                ELSE e.extraction_confidence
            END
        RETURN e.id AS id
        """

        params = {
            "id": entity_id,
            "name": name,
            "type": entity_type,
            "aliases": aliases or [],
            "confidence": extraction_confidence,
            "now": now,
        }

        results = self.run_cypher(query, params)

        # Link to source document if provided
        if source_document_id:
            self.run_cypher(
                """
                MATCH (e:Entity {id: $entity_id})
                MATCH (d:Document {id: $doc_id})
                MERGE (e)-[:EXTRACTED_FROM]->(d)
                """,
                {"entity_id": entity_id, "doc_id": source_document_id},
            )

        return entity_id

    def merge_relationship(
        self,
        source_name: str,
        target_name: str,
        relation_type: str,
        extraction_confidence: float = 0.0,
        verification_status: str = "SUPPORTED",
        source_document_id: str = "",
    ) -> None:
        """MERGE a relationship between two entities."""
        source_id = self._make_entity_id(source_name)
        target_id = self._make_entity_id(target_name)
        now = datetime.utcnow().isoformat()

        # Dynamic relationship type via APOC or pattern matching
        # Using a parameterized approach that works without APOC
        query = f"""
        MATCH (s:Entity {{id: $source_id}})
        MATCH (t:Entity {{id: $target_id}})
        MERGE (s)-[r:{relation_type}]->(t)
        ON CREATE SET
            r.extraction_confidence = $confidence,
            r.verification_status = $v_status,
            r.source_document_id = $doc_id,
            r.created_at = $now
        ON MATCH SET
            r.extraction_confidence = CASE
                WHEN $confidence > r.extraction_confidence THEN $confidence
                ELSE r.extraction_confidence
            END,
            r.updated_at = $now
        """

        self.run_cypher(query, {
            "source_id": source_id,
            "target_id": target_id,
            "confidence": extraction_confidence,
            "v_status": verification_status,
            "doc_id": source_document_id,
            "now": now,
        })

    # ── Document Operations ───────────────────────────────

    def merge_document(
        self,
        document_id: str,
        filename: str,
        file_hash: str,
    ) -> None:
        """MERGE a document node."""
        now = datetime.utcnow().isoformat()
        self.run_cypher(
            """
            MERGE (d:Document {id: $id})
            ON CREATE SET
                d.filename = $filename,
                d.hash = $hash,
                d.uploaded_at = $now,
                d.last_indexed_at = $now
            ON MATCH SET
                d.hash = $hash,
                d.last_indexed_at = $now
            """,
            {"id": document_id, "filename": filename, "hash": file_hash, "now": now},
        )

    # ── Entity Merge (for entity resolution) ──────────────

    def merge_entities_apoc(self, canonical_id: str, duplicate_id: str, dup_name: str) -> bool:
        """
        Merge duplicate entity into canonical using APOC.
        Falls back to manual merge if APOC is not available.
        """
        try:
            self.run_cypher(
                """
                MATCH (dup:Entity {id: $dupId}), (canon:Entity {id: $canonId})
                CALL apoc.refactor.mergeNodes([canon, dup], {
                    properties: "combine",
                    mergeRels: true
                }) YIELD node
                SET node.aliases = coalesce(node.aliases, []) + $dupName
                RETURN node
                """,
                {"dupId": duplicate_id, "canonId": canonical_id, "dupName": dup_name},
            )
            return True
        except Exception as e:
            print(f"[Neo4j] APOC merge failed ({e}), using manual merge fallback")
            return self._manual_merge(canonical_id, duplicate_id, dup_name)

    def _manual_merge(self, canonical_id: str, duplicate_id: str, dup_name: str) -> bool:
        """Manual entity merge without APOC — transfers relationships and deletes duplicate."""
        try:
            # Add alias
            self.run_cypher(
                """
                MATCH (canon:Entity {id: $canonId})
                SET canon.aliases = coalesce(canon.aliases, []) + $dupName
                """,
                {"canonId": canonical_id, "dupName": dup_name},
            )
            # Transfer incoming relationships
            self.run_cypher(
                """
                MATCH (dup:Entity {id: $dupId})<-[r]-(other)
                WHERE other.id <> $canonId
                WITH other, type(r) AS relType, properties(r) AS relProps, dup
                MATCH (canon:Entity {id: $canonId})
                CALL {
                    WITH other, canon, relType, relProps
                    WITH other, canon, relType, relProps
                    CREATE (other)-[newR:RELATED_TO]->(canon)
                    SET newR = relProps
                }
                """,
                {"dupId": duplicate_id, "canonId": canonical_id},
            )
            # Transfer outgoing relationships
            self.run_cypher(
                """
                MATCH (dup:Entity {id: $dupId})-[r]->(other)
                WHERE other.id <> $canonId
                WITH other, type(r) AS relType, properties(r) AS relProps, dup
                MATCH (canon:Entity {id: $canonId})
                CALL {
                    WITH other, canon, relType, relProps
                    WITH other, canon, relType, relProps
                    CREATE (canon)-[newR:RELATED_TO]->(other)
                    SET newR = relProps
                }
                """,
                {"dupId": duplicate_id, "canonId": canonical_id},
            )
            # Delete duplicate
            self.run_cypher(
                "MATCH (dup:Entity {id: $dupId}) DETACH DELETE dup",
                {"dupId": duplicate_id},
            )
            return True
        except Exception as e:
            print(f"[Neo4j] Manual merge also failed: {e}")
            return False

    # ── Contradiction Operations ──────────────────────────

    def create_contradiction(
        self,
        contradiction_id: str,
        entity_a_name: str,
        entity_b_name: str,
        relationship_type: str,
        source_doc_a: str,
        source_doc_b: str,
        source_span_a: str,
        source_span_b: str,
    ) -> None:
        """Create a Contradiction node linked to involved entities."""
        now = datetime.utcnow().isoformat()
        self.run_cypher(
            """
            MERGE (c:Contradiction {id: $id})
            ON CREATE SET
                c.entity_a_name = $ea,
                c.entity_b_name = $eb,
                c.relationship_type = $rel_type,
                c.source_doc_a = $doc_a,
                c.source_doc_b = $doc_b,
                c.source_span_a = $span_a,
                c.source_span_b = $span_b,
                c.status = 'open',
                c.detected_at = $now
            """,
            {
                "id": contradiction_id,
                "ea": entity_a_name, "eb": entity_b_name,
                "rel_type": relationship_type,
                "doc_a": source_doc_a, "doc_b": source_doc_b,
                "span_a": source_span_a, "span_b": source_span_b,
                "now": now,
            },
        )
        # Link to involved entities
        for name in [entity_a_name, entity_b_name]:
            eid = self._make_entity_id(name)
            self.run_cypher(
                """
                MATCH (c:Contradiction {id: $cid})
                MATCH (e:Entity {id: $eid})
                MERGE (c)-[:INVOLVES]->(e)
                """,
                {"cid": contradiction_id, "eid": eid},
            )

    def resolve_contradiction(self, contradiction_id: str, resolution: str) -> None:
        """Mark a contradiction as resolved."""
        now = datetime.utcnow().isoformat()
        self.run_cypher(
            """
            MATCH (c:Contradiction {id: $id})
            SET c.status = 'resolved',
                c.resolution = $resolution,
                c.resolved_at = $now
            """,
            {"id": contradiction_id, "resolution": resolution, "now": now},
        )

    # ── Query Helpers ─────────────────────────────────────

    def get_entity_neighbors(self, entity_id: str) -> list[str]:
        """Get IDs of all entities directly connected to the given entity."""
        results = self.run_cypher(
            """
            MATCH (e:Entity {id: $id})--(neighbor:Entity)
            RETURN DISTINCT neighbor.id AS neighbor_id
            """,
            {"id": entity_id},
        )
        return [r["neighbor_id"] for r in results]

    def get_all_entities(self) -> list[dict]:
        """Get all entity nodes."""
        return self.run_cypher("MATCH (e:Entity) RETURN e {.*} AS entity")

    def get_entity_count_by_type(self) -> dict:
        """Count entities grouped by type."""
        results = self.run_cypher(
            "MATCH (e:Entity) RETURN e.type AS type, count(e) AS count"
        )
        return {r["type"]: r["count"] for r in results}

    def get_relationship_count_by_type(self) -> dict:
        """Count relationships grouped by type."""
        results = self.run_cypher(
            """
            MATCH ()-[r]->()
            WHERE NOT type(r) IN ['EXTRACTED_FROM', 'INVOLVES']
            RETURN type(r) AS type, count(r) AS count
            """
        )
        return {r["type"]: r["count"] for r in results}

    def get_open_contradictions(self) -> list[dict]:
        """Get all open (unresolved) contradictions."""
        return self.run_cypher(
            "MATCH (c:Contradiction {status: 'open'}) RETURN c {.*} AS contradiction ORDER BY c.detected_at DESC"
        )

    def get_document_count(self) -> int:
        """Count indexed documents."""
        results = self.run_cypher("MATCH (d:Document) RETURN count(d) AS count")
        return results[0]["count"] if results else 0

    def find_structural_contradictions(self) -> list[dict]:
        """
        Structural contradiction detection —
        find entities with conflicting relationships of the same type.
        """
        return self.run_cypher(
            """
            MATCH (a:Entity)-[r1]->(b1:Entity), (a)-[r2]->(b2:Entity)
            WHERE type(r1) = type(r2) AND b1 <> b2
              AND NOT type(r1) IN ['RELATED_TO', 'EXTRACTED_FROM', 'INVOLVES']
            RETURN a.name AS entity,
                   a.id AS entity_id,
                   type(r1) AS relationship_type,
                   b1.name AS target_1,
                   b1.id AS target_1_id,
                   b2.name AS target_2,
                   b2.id AS target_2_id,
                   r1.source_document_id AS doc_1,
                   r2.source_document_id AS doc_2,
                   r1.extraction_confidence AS confidence_1,
                   r2.extraction_confidence AS confidence_2
            """
        )


def get_neo4j_client() -> Neo4jClient:
    """Get the singleton Neo4j client instance."""
    return Neo4jClient.get_instance()
