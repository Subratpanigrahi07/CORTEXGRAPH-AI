"""
Extraction Agent — Phase 2 agent that extracts entities and relationships
from document chunks using the fixed ontology.

Wraps the existing Phase 1 Gemini extraction logic but outputs typed
ExtractedEntity/ExtractedRelationship with source_span and confidence.
"""

import os
import re
import time
import json
from typing import Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError
from app.schema import (
    ExtractedEntity, ExtractedRelationship, ExtractionResult,
    ENTITY_TYPE, RELATIONSHIP_TYPE,
)
from app.config import get_settings


# Valid ontology types for validation
VALID_ENTITY_TYPES = {"PERSON", "ORGANIZATION", "TECHNOLOGY", "PROJECT", "CONCEPT", "EVENT", "DATASET", "PAPER"}
VALID_RELATIONSHIP_TYPES = {"USES", "CREATED", "DEVELOPED_BY", "RELATED_TO", "TRAINED_ON", "BELONGS_TO", "AUTHORED_BY"}

# Mapping heuristics for when extraction produces off-ontology types
TYPE_MAPPING = {
    "COMPANY": "ORGANIZATION",
    "INSTITUTION": "ORGANIZATION",
    "UNIVERSITY": "ORGANIZATION",
    "FRAMEWORK": "TECHNOLOGY",
    "LIBRARY": "TECHNOLOGY",
    "TOOL": "TECHNOLOGY",
    "SOFTWARE": "TECHNOLOGY",
    "LANGUAGE": "TECHNOLOGY",
    "DATABASE": "TECHNOLOGY",
    "MODEL": "TECHNOLOGY",
    "ALGORITHM": "CONCEPT",
    "METHOD": "CONCEPT",
    "THEORY": "CONCEPT",
    "IDEA": "CONCEPT",
    "PRINCIPLE": "CONCEPT",
    "PLACE": "CONCEPT",
    "LOCATION": "CONCEPT",
    "CONFERENCE": "EVENT",
    "WORKSHOP": "EVENT",
    "MEETING": "EVENT",
    "ARTICLE": "PAPER",
    "PUBLICATION": "PAPER",
    "REPORT": "PAPER",
    "BOOK": "PAPER",
}

REL_TYPE_MAPPING = {
    "DEVELOPED": "DEVELOPED_BY",
    "BUILT_WITH": "USES",
    "BUILT_BY": "DEVELOPED_BY",
    "INTEGRATES": "USES",
    "INTEGRATES_WITH": "USES",
    "WORKS_WITH": "USES",
    "DEPENDS_ON": "USES",
    "CONTAINS": "BELONGS_TO",
    "PART_OF": "BELONGS_TO",
    "MEMBER_OF": "BELONGS_TO",
    "PUBLISHED": "AUTHORED_BY",
    "WROTE": "AUTHORED_BY",
    "CONNECTS_TO": "RELATED_TO",
    "ANALYZES": "USES",
}


class ExtractionAgent:
    """
    Extracts entities and relationships from document chunks using Gemini,
    constrained to the fixed Phase 2 ontology.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gemini_api_key
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[ExtractionAgent] Gemini client init warning: {e}")

        self.models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-2.5-flash-lite",
        ]

    def extract(
        self,
        text_chunk: str,
        document_id: str,
        existing_entities: list[str] = None,
    ) -> ExtractionResult:
        """
        Extract entities and relationships from a text chunk.

        Args:
            text_chunk: The raw text to extract from.
            document_id: ID of the source document for provenance.
            existing_entities: Names of entities already in the graph,
                             to encourage name reuse over inventing new ones.
        """
        if not self.client:
            return self._fallback_extract(text_chunk, document_id)

        # Build context about existing entities
        existing_context = ""
        if existing_entities:
            existing_context = (
                "\n\nIMPORTANT — These entities already exist in our knowledge graph. "
                "If you encounter the same or similar entities in the text, REUSE these exact names "
                f"instead of inventing new ones:\n{', '.join(existing_entities[:50])}\n"
            )

        system_instruction = (
            "You are a precise knowledge graph extraction engine.\n\n"
            "TASK: Extract entities and relationships from the provided text.\n\n"
            "ENTITY TYPES (use ONLY these):\n"
            "PERSON, ORGANIZATION, TECHNOLOGY, PROJECT, CONCEPT, EVENT, DATASET, PAPER\n\n"
            "RELATIONSHIP TYPES (use ONLY these):\n"
            "USES, CREATED, DEVELOPED_BY, RELATED_TO, TRAINED_ON, BELONGS_TO, AUTHORED_BY\n\n"
            "RULES:\n"
            "1. Extract only entities and relationships clearly stated or strongly implied in the text.\n"
            "2. For each entity, include the exact text span that mentions it in 'source_span'.\n"
            "3. For each relationship, include the exact text span that supports it in 'source_span'.\n"
            "4. Set extraction_confidence between 0.0 and 1.0 based on how explicit the text is.\n"
            "5. If something doesn't fit the allowed types, map it to the closest one.\n"
            "6. Include known aliases (abbreviations, alternative names) for entities.\n"
            "7. Do NOT hallucinate entities or relationships not supported by the text.\n"
            f"{existing_context}"
        )

        # Use the Pydantic schema for structured output
        extraction_schema = {
            "type": "object",
            "properties": {
                "entities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "type": {"type": "string", "enum": list(VALID_ENTITY_TYPES)},
                            "aliases": {"type": "array", "items": {"type": "string"}},
                            "extraction_confidence": {"type": "number"},
                            "source_span": {"type": "string"},
                        },
                        "required": ["name", "type", "extraction_confidence", "source_span"],
                    },
                },
                "relationships": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "source_entity": {"type": "string"},
                            "target_entity": {"type": "string"},
                            "relation_type": {"type": "string", "enum": list(VALID_RELATIONSHIP_TYPES)},
                            "extraction_confidence": {"type": "number"},
                            "source_span": {"type": "string"},
                        },
                        "required": ["source_entity", "target_entity", "relation_type", "extraction_confidence", "source_span"],
                    },
                },
            },
            "required": ["entities", "relationships"],
        }

        prompt = f"Extract all entities and relationships from the following text:\n\n{text_chunk}"

        last_exception = None
        for model_name in self.models_to_try:
            for attempt in range(2):
                try:
                    response = self.client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            response_mime_type="application/json",
                            response_schema=extraction_schema,
                            temperature=0.1,
                        ),
                    )
                    return self._parse_response(response.text, document_id)
                except (APIError, Exception) as e:
                    last_exception = e
                    err_str = str(e)
                    print(f"[ExtractionAgent] Error with '{model_name}' (attempt {attempt + 1}): {err_str}")
                    is_overloaded = any(code in err_str for code in ["503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED"])
                    if is_overloaded and attempt < 1:
                        time.sleep(1.0)
                    else:
                        break

        print(f"[ExtractionAgent] All models failed ({last_exception}). Using fallback extraction.")
        return self._fallback_extract(text_chunk, document_id)

    def _parse_response(self, response_text: str, document_id: str) -> ExtractionResult:
        """Parse Gemini JSON response into typed ExtractionResult."""
        try:
            data = json.loads(response_text)
        except json.JSONDecodeError:
            return ExtractionResult()

        entities = []
        relationships = []
        type_mismatches = []

        for raw_entity in data.get("entities", []):
            entity_type = raw_entity.get("type", "CONCEPT").upper()

            # Map off-ontology types
            if entity_type not in VALID_ENTITY_TYPES:
                mapped = TYPE_MAPPING.get(entity_type, "CONCEPT")
                type_mismatches.append(f"{raw_entity.get('name', '?')}: {entity_type} → {mapped}")
                entity_type = mapped

            entities.append(ExtractedEntity(
                name=raw_entity.get("name", ""),
                type=entity_type,
                aliases=raw_entity.get("aliases", []),
                extraction_confidence=max(0.0, min(1.0, raw_entity.get("extraction_confidence", 0.5))),
                source_document_id=document_id,
                source_span=raw_entity.get("source_span", ""),
            ))

        for raw_rel in data.get("relationships", []):
            rel_type = raw_rel.get("relation_type", "RELATED_TO").upper()

            if rel_type not in VALID_RELATIONSHIP_TYPES:
                mapped = REL_TYPE_MAPPING.get(rel_type, "RELATED_TO")
                type_mismatches.append(f"Rel {rel_type} → {mapped}")
                rel_type = mapped

            relationships.append(ExtractedRelationship(
                source_entity=raw_rel.get("source_entity", ""),
                target_entity=raw_rel.get("target_entity", ""),
                relation_type=rel_type,
                extraction_confidence=max(0.0, min(1.0, raw_rel.get("extraction_confidence", 0.5))),
                source_document_id=document_id,
                source_span=raw_rel.get("source_span", ""),
            ))

        if type_mismatches:
            print(f"[ExtractionAgent] Type mismatches logged: {type_mismatches}")

        return ExtractionResult(
            entities=entities,
            relationships=relationships,
            type_mismatches=type_mismatches,
        )

    def _fallback_extract(self, text: str, document_id: str) -> ExtractionResult:
        """
        Local heuristic fallback for extraction when API is unavailable.
        Enhanced from Phase 1 to output typed Phase 2 schemas.
        """
        known_techs = {"react", "fastapi", "neo4j", "chromadb", "gemini", "python",
                       "javascript", "typescript", "langchain", "celery", "redis",
                       "docker", "kubernetes", "tensorflow", "pytorch"}

        raw_words = re.findall(r'\b[A-Z][a-zA-Z0-9_\-\.]*(?:\s+[A-Z][a-zA-Z0-9_\-\.]*)*\b', text)
        stop_words = {"The", "A", "An", "In", "On", "It", "Is", "And", "Or", "For", "With", "System", "This", "That"}

        entities = []
        seen_names = set()

        for item in raw_words:
            if len(item) < 2 or item in stop_words:
                continue
            name = item.strip()
            if name.lower() in seen_names:
                continue
            seen_names.add(name.lower())

            norm = name.lower()
            if any(t in norm for t in known_techs) or "api" in norm or "db" in norm:
                etype = "TECHNOLOGY"
            elif norm in {"subrat", "user", "john", "alex", "author", "creator", "developer"}:
                etype = "PERSON"
            elif "graph" in norm or "cortex" in norm or "rag" in norm:
                etype = "PROJECT"
            else:
                etype = "CONCEPT"

            # Find source span — first sentence containing this entity
            sentences = text.split(".")
            span = ""
            for s in sentences:
                if name.lower() in s.lower():
                    span = s.strip()[:200]
                    break

            entities.append(ExtractedEntity(
                name=name,
                type=etype,
                aliases=[],
                extraction_confidence=0.5,
                source_document_id=document_id,
                source_span=span,
            ))

        # Build relationships from co-occurrence in sentences
        relationships = []
        sentences = [s.strip() for s in text.split(".") if s.strip()]
        for sentence in sentences:
            found_in_sentence = []
            for e in entities:
                if e.name.lower() in sentence.lower():
                    found_in_sentence.append(e)

            for i in range(len(found_in_sentence)):
                for j in range(i + 1, len(found_in_sentence)):
                    s_lower = sentence.lower()
                    if "develop" in s_lower or "create" in s_lower or "build" in s_lower:
                        rel_type = "CREATED"
                    elif "use" in s_lower or "built" in s_lower:
                        rel_type = "USES"
                    else:
                        rel_type = "RELATED_TO"

                    relationships.append(ExtractedRelationship(
                        source_entity=found_in_sentence[i].name,
                        target_entity=found_in_sentence[j].name,
                        relation_type=rel_type,
                        extraction_confidence=0.4,
                        source_document_id=document_id,
                        source_span=sentence[:200],
                    ))

        return ExtractionResult(entities=entities, relationships=relationships)
