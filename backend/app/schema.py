"""
Pydantic schemas for CortexGraph.

Phase 1 schemas (Entity, Relationship, KnowledgeGraph) are preserved for backward
compatibility. Phase 2 adds typed extraction/verification models, merge suggestions,
contradictions, and analytics response schemas.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from datetime import datetime
import uuid


# ═══════════════════════════════════════════════════════════════════
# Phase 1 Schemas (preserved — used by existing frontend + RAG)
# ═══════════════════════════════════════════════════════════════════

class Property(BaseModel):
    key: str = Field(description="The property name or key (e.g. 'role', 'version', 'description', 'year')")
    value: str = Field(description="The property value")


class Entity(BaseModel):
    id: str = Field(description="A unique, lowercase identifier for the entity (e.g. 'subrat', 'cortexgraph_ai', 'react')")
    name: str = Field(description="The formal or natural-language name of the entity")
    type: str = Field(description="The semantic category of the entity (e.g. 'Person', 'Project', 'Technology', 'Database', 'Company', 'Concept')")
    properties: List[Property] = Field(default_factory=list, description="Additional metadata or properties of the entity")


class Relationship(BaseModel):
    source: str = Field(description="The unique 'id' of the source entity")
    target: str = Field(description="The unique 'id' of the target entity")
    type: str = Field(description="The type of relationship in UPPERCASE_WITH_UNDERSCORES (e.g. 'DEVELOPED', 'BUILT_WITH', 'INTEGRATES_WITH', 'USES', 'MEMBER_OF')")
    properties: List[Property] = Field(default_factory=list, description="Metadata or attributes of the relationship")


class KnowledgeGraph(BaseModel):
    entities: List[Entity] = Field(description="The list of extracted nodes/entities")
    relationships: List[Relationship] = Field(description="The list of extracted edges/relationships connecting the entities")


# ═══════════════════════════════════════════════════════════════════
# Phase 2 — Fixed Ontology
# ═══════════════════════════════════════════════════════════════════

ENTITY_TYPE = Literal[
    "PERSON", "ORGANIZATION", "TECHNOLOGY", "PROJECT",
    "CONCEPT", "EVENT", "DATASET", "PAPER"
]

RELATIONSHIP_TYPE = Literal[
    "USES", "CREATED", "DEVELOPED_BY", "RELATED_TO",
    "TRAINED_ON", "BELONGS_TO", "AUTHORED_BY"
]

VERIFICATION_STATUS = Literal["SUPPORTED", "UNSUPPORTED", "CONTRADICTED", "AMBIGUOUS"]
CONTRADICTION_CLASS = Literal["TRUE_CONTRADICTION", "COMPLEMENTARY_FACTS", "AMBIGUOUS"]


# ═══════════════════════════════════════════════════════════════════
# Phase 2 — Extraction Agent Output
# ═══════════════════════════════════════════════════════════════════

class ExtractedEntity(BaseModel):
    """Output from the Extraction Agent for a single entity."""
    name: str = Field(description="The canonical name of the entity")
    type: ENTITY_TYPE = Field(description="Entity type from the fixed ontology")
    aliases: List[str] = Field(default_factory=list, description="Known alternative names/spellings")
    extraction_confidence: float = Field(
        ge=0.0, le=1.0,
        description="Soft signal for sorting/display — NOT a calibrated probability"
    )
    source_document_id: str = Field(description="ID of the source document")
    source_span: str = Field(description="The exact text span that supports this extraction")


class ExtractedRelationship(BaseModel):
    """Output from the Extraction Agent for a single relationship."""
    source_entity: str = Field(description="Name of the source entity")
    target_entity: str = Field(description="Name of the target entity")
    relation_type: RELATIONSHIP_TYPE = Field(description="Relationship type from the fixed ontology")
    extraction_confidence: float = Field(
        ge=0.0, le=1.0,
        description="Soft signal for sorting/display — NOT a calibrated probability"
    )
    source_document_id: str = Field(description="ID of the source document")
    source_span: str = Field(description="The exact text span that supports this relationship")


class ExtractionResult(BaseModel):
    """Combined output from the Extraction Agent for a single chunk."""
    entities: List[ExtractedEntity] = Field(default_factory=list)
    relationships: List[ExtractedRelationship] = Field(default_factory=list)
    type_mismatches: List[str] = Field(
        default_factory=list,
        description="Log of items that didn't fit the ontology and were mapped to closest type"
    )


# ═══════════════════════════════════════════════════════════════════
# Phase 2 — Verification Agent Output
# ═══════════════════════════════════════════════════════════════════

class VerificationResult(BaseModel):
    """Output from the Verification Agent for a single item."""
    item_type: Literal["entity", "relationship"] = Field(description="Whether this verifies an entity or relationship")
    item_name: str = Field(description="Name/description of the verified item")
    status: VERIFICATION_STATUS = Field(description="Verification verdict — gates graph writes")
    extraction_confidence: float = Field(ge=0.0, le=1.0)
    verification_notes: str = Field(default="", description="Explanation of the verification decision")
    source_document_id: str = Field(default="")


class VerifiedExtractionResult(BaseModel):
    """Items that passed verification, ready for entity resolution + graph write."""
    entities: List[ExtractedEntity] = Field(default_factory=list)
    relationships: List[ExtractedRelationship] = Field(default_factory=list)
    contradictions_flagged: List[dict] = Field(
        default_factory=list,
        description="Items with CONTRADICTED status — sent to contradiction queue"
    )
    dropped_items: List[VerificationResult] = Field(
        default_factory=list,
        description="Items with UNSUPPORTED/AMBIGUOUS status — logged for review"
    )


# ═══════════════════════════════════════════════════════════════════
# Phase 2 — Entity Resolution
# ═══════════════════════════════════════════════════════════════════

class MergeSuggestion(BaseModel):
    """A pending entity merge for human review."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_name: str
    candidate_type: ENTITY_TYPE
    canonical_id: str
    canonical_name: str
    similarity_score: float = Field(ge=0.0, le=1.0)
    string_similarity: float = Field(ge=0.0, le=1.0, default=0.0)
    embedding_similarity: float = Field(ge=0.0, le=1.0, default=0.0)
    neighbor_overlap: float = Field(ge=0.0, le=1.0, default=0.0)
    status: Literal["pending", "approved", "rejected"] = "pending"
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class EntityResolutionResult(BaseModel):
    """Output from the Entity Resolution step."""
    resolved_entities: List[ExtractedEntity] = Field(
        default_factory=list,
        description="Entities ready for graph write (new or auto-merged)"
    )
    auto_merged: List[dict] = Field(
        default_factory=list,
        description="Entities that were auto-merged into existing canonical nodes"
    )
    merge_suggestions: List[MergeSuggestion] = Field(
        default_factory=list,
        description="Entities in the review zone (0.75–0.92) queued for human approval"
    )
    new_entities: List[ExtractedEntity] = Field(
        default_factory=list,
        description="Brand new entities (score < 0.75)"
    )


# ═══════════════════════════════════════════════════════════════════
# Phase 2 — Contradiction Detection
# ═══════════════════════════════════════════════════════════════════

class Contradiction(BaseModel):
    """A detected knowledge conflict between two sources."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_a_name: str
    entity_b_name: str
    relationship_type: str
    source_doc_a: str
    source_doc_b: str
    source_span_a: str
    source_span_b: str
    classification: Optional[CONTRADICTION_CLASS] = None
    status: Literal["open", "resolved"] = "open"
    resolution: Optional[Literal["kept_a", "kept_b", "kept_both"]] = None
    detected_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    resolved_at: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════
# Phase 2 — Analytics Response Schemas
# ═══════════════════════════════════════════════════════════════════

class AnalyticsOverview(BaseModel):
    """Basic graph statistics."""
    total_entities: int = 0
    total_relationships: int = 0
    entities_by_type: dict = Field(default_factory=dict)
    relationships_by_type: dict = Field(default_factory=dict)
    documents_indexed: int = 0
    last_updated: Optional[str] = None


class CentralityEntry(BaseModel):
    """A single entity's centrality score."""
    entity_name: str
    entity_type: str
    score: float
    entity_id: str = ""


class CentralityResult(BaseModel):
    """Top-N centrality results."""
    algorithm: str
    entries: List[CentralityEntry] = Field(default_factory=list)


class CommunityEntry(BaseModel):
    """A detected community/cluster."""
    community_id: int
    entities: List[str] = Field(default_factory=list)
    size: int = 0


class CommunitiesResult(BaseModel):
    """Louvain community detection results."""
    total_communities: int = 0
    communities: List[CommunityEntry] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════
# Phase 2 — Pipeline Status
# ═══════════════════════════════════════════════════════════════════

class PipelineStepStatus(BaseModel):
    """Status of a single pipeline step."""
    step: str
    status: Literal["pending", "running", "completed", "failed", "skipped"]
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    details: Optional[str] = None


class PipelineStatus(BaseModel):
    """Overall pipeline status for a document."""
    document_id: str
    job_id: str
    overall_status: Literal["pending", "running", "completed", "failed"]
    steps: List[PipelineStepStatus] = Field(default_factory=list)
    result: Optional[dict] = None
