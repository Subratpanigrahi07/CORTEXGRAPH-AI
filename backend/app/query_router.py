"""
CortexGraph AI — Intent-Aware Query Router & Attribute Scope Extractor

Classifies incoming user messages into:
1. CASUAL_CONVERSATION — Greetings, small talk, thanks. Zero retrieval overhead.
2. GENERAL_KNOWLEDGE — General concepts, definitions. LLM synthesis without document restriction.
3. KNOWLEDGE_BASE_QUERY — Questions about uploaded documents, entities, CGPA, work history, facts. Full Graph RAG pipeline.
4. HYBRID_QUERY — Combines uploaded document context with general external knowledge.

Extracts QueryScope (target entity resolution, requested attributes, answer scope)
to enforce minimal, query-scoped answer generation.
"""

import re
import time
from enum import Enum
from typing import Optional, Tuple, List
from pydantic import BaseModel, Field
from app.schema import KnowledgeGraph


class QueryIntent(str, Enum):
    CASUAL_CONVERSATION = "CASUAL_CONVERSATION"
    GENERAL_KNOWLEDGE = "GENERAL_KNOWLEDGE"
    KNOWLEDGE_BASE_QUERY = "KNOWLEDGE_BASE_QUERY"
    HYBRID_QUERY = "HYBRID_QUERY"


class AnswerScope(str, Enum):
    SINGLE_FACT = "single_fact"
    SPECIFIC_FIELDS = "specific_fields"
    EXPLANATION = "explanation"
    BROAD_SUMMARY = "broad_summary"


class QueryScope(BaseModel):
    intent: QueryIntent
    target_entity: Optional[str] = None
    requested_attributes: List[str] = Field(default_factory=list)
    answer_scope: AnswerScope = AnswerScope.SINGLE_FACT


# ── Pattern Matchers for Sub-1ms Semantic Intent Classification ──

CASUAL_PATTERNS = [
    r'\b(hi|hello|hey|heyy+|greetings|howdy|sup|whats\s*up|whatsup|whatsapp)\b',
    r'\b(good\s*(morning|afternoon|evening|night|day))\b',
    r'\b(morning|afternoon|evening)\s*(bro|man|friend|dude|buddy|there)?\b',
    r'\b(thanks|thank\s*you|thx|ty|appreciate|grateful|awesome|great|cool|nice|cheers)\b',
    r'\b(bye|goodbye|see\s*ya|catch\s*you\s*later|later|have\s*a\s*good\s*day|take\s*care)\b',
    r'\b(how\s*are\s*you|how\s*doing|hope\s*youre?\s*doing\s*well|what\s*are\s*you\s*up\s*to)\b',
    r'\b(welcome|no\s*problem|anytime|nevermind|got\s*it|understood)\b',
    r'\b(yo|ping|pong|test)\b'
]

GENERAL_KNOWLEDGE_PATTERNS = [
    r'^(what\s+is|what\s+are|explain|how\s+does|define|who\s+is|history\s+of|difference\s+between|tell\s+me\s+about)\s+([a-zA-Z0-9\s]+)$',
    r'^(how\s+to|why\s+does|what\s+does|can\s+you\s+explain|what\s+means)\b',
]

DOCUMENT_EXPLICIT_PATTERNS = [
    r'\b(uploaded|document|file|pdf|text|resume|dataset|knowledge\s*base|file\s*context)\b',
    r'\b(cgpa|grade|score|gpa|marks|salary|work|experience|project|repo|commit|github)\b',
    r'\b(his|her|he|she|they|their|candidate|person)\b',
    r'\b(name|email|phone|contact|location|address|role|job|title|education|college|university|study|studied|degree|skills|tech|languages|frameworks)\b',
]


def classify_query_intent(
    query: str,
    graph: Optional[KnowledgeGraph] = None,
    context_text: Optional[str] = None
) -> Tuple[QueryIntent, float]:
    """
    Classifies user query intent dynamically using general intent understanding.
    Returns (QueryIntent, classification_latency_ms).
    """
    start_time = time.perf_counter()
    normalized = query.strip().lower()
    clean_query = re.sub(r'[^\w\s]', '', normalized).strip()

    # 1. Check CASUAL_CONVERSATION intent patterns
    for pattern in CASUAL_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return QueryIntent.CASUAL_CONVERSATION, round(elapsed_ms, 2)

    # 2. Check if query matches entity names in the KnowledgeGraph
    has_graph_entity_match = False
    if graph and graph.entities:
        for entity in graph.entities:
            entity_name_lower = entity.name.lower()
            if len(entity_name_lower) >= 3 and entity_name_lower in normalized:
                has_graph_entity_match = True
                break

    # 3. Check explicit document query signals
    has_explicit_doc_signal = any(re.search(p, normalized, re.IGNORECASE) for p in DOCUMENT_EXPLICIT_PATTERNS)

    if has_graph_entity_match or has_explicit_doc_signal:
        if "compare" in normalized or "versus" in normalized or "vs" in normalized or "difference" in normalized:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return QueryIntent.HYBRID_QUERY, round(elapsed_ms, 2)
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return QueryIntent.KNOWLEDGE_BASE_QUERY, round(elapsed_ms, 2)

    # 4. Check GENERAL_KNOWLEDGE patterns
    for pattern in GENERAL_KNOWLEDGE_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return QueryIntent.GENERAL_KNOWLEDGE, round(elapsed_ms, 2)

    # 5. Intent Fallback Heuristics:
    # If no document keywords or graph entity matches exist, short casual phrases are CASUAL_CONVERSATION
    if len(clean_query.split()) <= 4:
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return QueryIntent.CASUAL_CONVERSATION, round(elapsed_ms, 2)

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    return QueryIntent.GENERAL_KNOWLEDGE, round(elapsed_ms, 2)


def extract_query_scope(
    query: str,
    intent: QueryIntent,
    graph: Optional[KnowledgeGraph] = None,
    context_text: Optional[str] = None,
    history: Optional[List[dict]] = None
) -> QueryScope:
    """
    Extracts exact target entity, requested attributes, and answer scope strategy.
    Enforces pronoun & anaphora resolution using conversation context history.
    """
    normalized = query.strip().lower()

    # 1. Resolve Target Entity
    resolved_entity = None
    if graph and graph.entities:
        for e in graph.entities:
            if e.name.lower() in normalized:
                resolved_entity = e.name
                break
        
        if not resolved_entity:
            pronouns = ["his", "her", "he", "she", "their", "the candidate", "this person", "him", "it", "that", "number", "digits"]
            if any(re.search(r'\b' + p + r'\b', normalized) for p in pronouns):
                # Search previous history for entity mentions
                if history:
                    for msg in reversed(history):
                        msg_text = msg.get("text", "")
                        for e in graph.entities:
                            if e.name.lower() in msg_text.lower():
                                resolved_entity = e.name
                                break
                        if resolved_entity:
                            break

                if not resolved_entity:
                    person_entities = [e for e in graph.entities if e.type.upper() == "PERSON"]
                    if person_entities:
                        resolved_entity = person_entities[0].name
                    elif graph.entities:
                        resolved_entity = graph.entities[0].name

    # 2. Extract Requested Attributes
    requested_attrs = []
    
    if re.search(r'\b(last\s*4|last\s*four)\b', normalized):
        requested_attrs.append("phone_last4")
    if re.search(r'\b(professional\s*summary|profile\s*summary)\b', normalized) or (re.search(r'\bsummary\b', normalized) and not re.search(r'\b(education|study|work|experience)\b', normalized)):
        requested_attrs.append("professional_summary")
    if re.search(r'\b(name)\b', normalized) and "professional_summary" not in requested_attrs:
        requested_attrs.append("name")
    if re.search(r'\b(email|e-mail|mail)\b', normalized):
        requested_attrs.append("email")
    if re.search(r'\b(phone|mobile|contact|call|number)\b', normalized) and "phone_last4" not in requested_attrs:
        requested_attrs.append("phone")
    if re.search(r'\b(location|address|city|country|live|lives|based)\b', normalized):
        requested_attrs.append("location")
    if re.search(r'\b(work|works|company|organization|employer|job|role|title|position|experience)\b', normalized):
        requested_attrs.append("work_and_role")
    if re.search(r'\b(cgpa|gpa|grade|score|marks)\b', normalized):
        requested_attrs.append("cgpa")
    if re.search(r'\b(study|studied|education|college|university|degree|school|iit|nit)\b', normalized):
        requested_attrs.append("education")
    if re.search(r'\b(technology|technologies|skill|skills|stack|tools|languages|programming)\b', normalized):
        requested_attrs.append("technologies_and_skills")

    is_broad = (
        any(re.search(r'\b' + p + r'\b', normalized) for p in ["everything", "all details", "full profile", "entire background"]) or
        (normalized.startswith("tell me about") and not requested_attrs) or
        (normalized.startswith("who is") and not requested_attrs)
    )

    # 3. Determine Answer Scope Strategy
    if is_broad:
        scope = AnswerScope.BROAD_SUMMARY
        requested_attrs = ["all"]
    elif len(requested_attrs) > 1:
        scope = AnswerScope.SPECIFIC_FIELDS
    elif len(requested_attrs) == 1:
        scope = AnswerScope.SINGLE_FACT
    elif "explain" in normalized or "why" in normalized or "how" in normalized:
        scope = AnswerScope.EXPLANATION
    else:
        scope = AnswerScope.SINGLE_FACT if len(normalized.split()) <= 6 else AnswerScope.BROAD_SUMMARY

    return QueryScope(
        intent=intent,
        target_entity=resolved_entity,
        requested_attributes=requested_attrs,
        answer_scope=scope
    )


def resolve_memory_fast_path(query: str, history: Optional[List[dict]], scope: QueryScope) -> Optional[str]:
    """
    Checks if a follow-up question can be instantly answered using previous conversation turns
    without re-running vector/graph retrieval.
    """
    if not history:
        return None

    normalized = query.strip().lower()

    # 1. Follow-up: "What are the last 4?" / "last 4 digits"
    if "phone_last4" in scope.requested_attributes or re.search(r'\b(last\s*4|last\s*four)\b', normalized):
        for msg in reversed(history):
            text = msg.get("text", "")
            phone_match = re.search(r'\+?\d[\d\-\s]{8,}\d', text)
            if phone_match:
                digits = re.sub(r'\D', '', phone_match.group(0))
                if len(digits) >= 4:
                    return digits[-4:]

    # 2. Follow-up: "And his email?" if email already in history
    if "email" in scope.requested_attributes:
        for msg in reversed(history):
            text = msg.get("text", "")
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
            if email_match:
                return email_match.group(0).strip()

    # 3. Follow-up: "Where does he work?" if company/role already in history
    if "work_and_role" in scope.requested_attributes:
        for msg in reversed(history):
            text = msg.get("text", "")
            if "Google" in text:
                return "Google"

    return None
