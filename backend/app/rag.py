"""
CortexGraph AI — Graph RAG Reasoning Engine v2.0
Supports Intent-Aware Query Routing, Query-Scoped Minimal Answering, Groq LPU acceleration,
Gemini fallback, and detailed latency telemetry.
"""

import os
import re
import time
import json
import urllib.request
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from google.genai.errors import APIError
from app.schema import KnowledgeGraph
from app.query_router import classify_query_intent, extract_query_scope, QueryIntent, QueryScope, AnswerScope


class RAGAnswerSchema(BaseModel):
    answer: str = Field(description="Strictly query-scoped natural response.")
    activated_nodes: List[str] = Field(default=[], description="List of entity IDs (lowercase underscores) activated for graph visualization.")
    intent: Optional[str] = Field(default=None, exclude=True)
    telemetry: Optional[Dict[str, float]] = Field(default=None, exclude=True)


def _smart_casual_fallback(prompt: str) -> str:
    low = prompt.strip().lower()
    if "morning" in low:
        return "Good morning! Hope you're having a great start to your day. How can I help you today?"
    if "evening" in low:
        return "Good evening! Hope your day went well. How can I assist you?"
    if "afternoon" in low:
        return "Good afternoon! How can I help you today?"
    if any(w in low for w in ["thanks", "thank", "thx", "appreciate", "grateful"]):
        return "You're very welcome! Let me know if you need anything else."
    if any(w in low for w in ["bye", "goodbye", "later", "catch you", "see ya"]):
        return "Take care! Catch you later."
    if any(w in low for w in ["how are you", "doing well", "whats up", "sup", "how doing"]):
        return "Doing great, thanks for asking! How can I help you today?"
    if any(w in low for w in ["hi", "hello", "hey", "greetings", "yo"]):
        return "Hey there! How's it going?"
    return "Glad to chat! What's on your mind today?"


class GraphRAGEngine:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[GraphRAGEngine] Gemini client init warning: {e}")

        self.models_to_try = [
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-2.5-pro',
        ]

    def answer_query(
        self,
        query: str,
        graph: Optional[KnowledgeGraph] = None,
        context_text: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
        model_override: Optional[str] = None
    ) -> RAGAnswerSchema:
        """
        Main query entry point with Memory-Aware Routing, Query-Scoped Answering & Latency Telemetry.
        """
        request_start = time.perf_counter()

        # ── Step 1: Intent Classification & Scope Extraction with Memory History ──
        intent, intent_ms = classify_query_intent(query, graph, context_text)
        scope = extract_query_scope(query, intent, graph, context_text, history)
        print(f"[QueryRouter] Query: '{query}' -> Intent: {intent.value}, Scope: {scope.answer_scope.value}, Target: {scope.target_entity}, Attrs: {scope.requested_attributes}")

        # ── Step 2: Check Memory Fast-Path Lookup ──
        from app.query_router import resolve_memory_fast_path
        fast_memory_answer = resolve_memory_fast_path(query, history, scope)
        if fast_memory_answer:
            total_ms = round((time.perf_counter() - request_start) * 1000, 2)
            print(f"[MemoryEngine] Fast memory hit for query '{query}' -> '{fast_memory_answer}' ({total_ms}ms)")
            return RAGAnswerSchema(
                answer=fast_memory_answer,
                activated_nodes=[],
                intent=intent.value,
                telemetry={
                    "intent_classification_ms": intent_ms,
                    "vector_retrieval_ms": 0.0,
                    "graph_retrieval_ms": 0.0,
                    "llm_generation_ms": 0.0,
                    "total_request_ms": total_ms,
                }
            )

        # ── Step 3: Route by Intent ──

        # Intent 1: CASUAL_CONVERSATION
        if intent == QueryIntent.CASUAL_CONVERSATION:
            return self._handle_casual_conversation(query, history, intent_ms, request_start, model_override)

        # Intent 2: GENERAL_KNOWLEDGE
        if intent == QueryIntent.GENERAL_KNOWLEDGE:
            return self._handle_general_knowledge(query, scope, intent_ms, request_start, model_override)

        # Intent 3 & 4: KNOWLEDGE_BASE_QUERY & HYBRID_QUERY (Memory-Aware Graph RAG)
        return self._handle_knowledge_base_query(query, history, scope, graph, context_text, intent, intent_ms, request_start, model_override)

    # ── Casual Handler ──────────────────────────────────────────
    def _handle_casual_conversation(
        self,
        query: str,
        history: Optional[List[Dict[str, str]]],
        intent_ms: float,
        request_start: float,
        model_override: Optional[str] = None
    ) -> RAGAnswerSchema:
        llm_start = time.perf_counter()
        
        history_str = ""
        if history:
            turns = [f"{str(item.get('sender', 'user')).capitalize()}: {str(item.get('text', ''))}" for item in history[-6:]]
            history_str = "=== CONVERSATION HISTORY ===\n" + "\n".join(turns) + "\n\n"

        system_instruction = (
            "You are CortexGraph AI, a smart, friendly, and natural conversational companion.\n"
            "The user is engaging in casual conversation (greetings, thanks, farewells, small talk, check-ins, or casual remarks).\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. Respond naturally, authentically, and concisely based on the user's specific greeting or remark.\n"
            "2. Use the conversation history to maintain context for casual follow-ups.\n"
            "3. NEVER output generic static boilerplate like 'I\\'m here to help! What would you like to know...'.\n"
            "4. Match the user's tone (warm, polite, casual, friendly).\n"
            "5. Do NOT perform document search or cite knowledge base metadata for casual talk."
        )

        prompt = f"{history_str}User: {query}"
        answer = self._generate_llm_text(prompt, system_instruction, model_override)
        llm_ms = round((time.perf_counter() - llm_start) * 1000, 2)
        total_ms = round((time.perf_counter() - request_start) * 1000, 2)

        return RAGAnswerSchema(
            answer=answer,
            activated_nodes=[],
            intent=QueryIntent.CASUAL_CONVERSATION.value,
            telemetry={
                "intent_classification_ms": intent_ms,
                "vector_retrieval_ms": 0.0,
                "graph_retrieval_ms": 0.0,
                "llm_generation_ms": llm_ms,
                "total_request_ms": total_ms,
            }
        )

    # ── General Knowledge Handler ────────────────────────────────
    def _handle_general_knowledge(
        self,
        query: str,
        scope: QueryScope,
        intent_ms: float,
        request_start: float,
        model_override: Optional[str] = None
    ) -> RAGAnswerSchema:
        llm_start = time.perf_counter()

        system_instruction = (
            "You are CortexGraph AI, an intelligent knowledge assistant.\n"
            "Answer the user's question accurately using general knowledge.\n"
            "STRICT RULE: Answer only what was asked. Do not add unrequested background information."
        )

        answer = self._generate_llm_text(query, system_instruction, model_override)
        llm_ms = round((time.perf_counter() - llm_start) * 1000, 2)
        total_ms = round((time.perf_counter() - request_start) * 1000, 2)

        return RAGAnswerSchema(
            answer=answer,
            activated_nodes=[],
            intent=QueryIntent.GENERAL_KNOWLEDGE.value,
            telemetry={
                "intent_classification_ms": intent_ms,
                "vector_retrieval_ms": 0.0,
                "graph_retrieval_ms": 0.0,
                "llm_generation_ms": llm_ms,
                "total_request_ms": total_ms,
            }
        )

    # ── Knowledge Base Handler (Strict Query-Scoped RAG) ──────────
    def _handle_knowledge_base_query(
        self,
        query: str,
        history: Optional[List[Dict[str, str]]],
        scope: QueryScope,
        graph: Optional[KnowledgeGraph],
        context_text: Optional[str],
        intent: QueryIntent,
        intent_ms: float,
        request_start: float,
        model_override: Optional[str] = None
    ) -> RAGAnswerSchema:
        vec_start = time.perf_counter()
        document_context = context_text.strip() if context_text else ""
        vec_ms = round((time.perf_counter() - vec_start) * 1000, 2)

        graph_start = time.perf_counter()
        graph_summary = ""
        activated_candidates = []
        if graph and graph.entities:
            entities_str = ", ".join([f"{e.name} ({e.type}, ID: {e.id})" for e in graph.entities])
            rels_str = ", ".join([f"{r.source} --[{r.type}]--> {r.target}" for r in graph.relationships])
            graph_summary = f"Extracted Entities:\n{entities_str}\n\nExtracted Relationships:\n{rels_str}\n"
            
            query_lower = query.lower()
            for e in graph.entities:
                if e.name.lower() in query_lower or e.id in query_lower:
                    activated_candidates.append(e.id)
        graph_ms = round((time.perf_counter() - graph_start) * 1000, 2)

        llm_start = time.perf_counter()

        history_str = ""
        if history:
            turns = []
            for item in history[-6:]:
                sender = str(item.get("sender", "user")).capitalize()
                txt = str(item.get("text", ""))
                turns.append(f"{sender}: {txt}")
            history_str = "=== CONVERSATION HISTORY ===\n" + "\n".join(turns) + "\n\n"

        system_instruction = (
            "You are Cortical Assistant, an expert Graph RAG reasoning intelligence.\n"
            "Your task is to answer the user's question with STRICT QUERY SCOPING.\n\n"
            f"=== STRICT ANSWER SCOPE RULE ===\n"
            f"Target Entity: {scope.target_entity or 'Unspecified'}\n"
            f"Requested Attributes: {scope.requested_attributes}\n"
            f"Answer Scope Strategy: {scope.answer_scope.value}\n\n"
            "CRITICAL RULES:\n"
            "1. Answer ONLY the user's question. Do NOT provide additional fields or unrequested resume/contact information.\n"
            "2. Use the Conversation History to resolve pronouns ('he', 'his', 'it', 'that', 'the number', 'last 4').\n"
            "3. If the user asks a simple fact question (e.g. 'What\\'s his name?', 'What\\'s his email?', 'What are the last 4?'), output ONLY the requested fact (e.g. 'Arjun Mehta', 'arjun.mehta.dev@gmail.com', '3210').\n"
            "4. Do NOT add prefixes like 'According to the document...', 'Based on the knowledge graph...', or raw document dumps.\n"
            "5. If the user asks for multiple specific fields (e.g. 'What\\'s his name and email?'), output ONLY those requested fields.\n"
            "6. Only provide a broad summary when the user explicitly asks for 'everything' or a full summary.\n"
            "7. Identify all entity IDs directly relevant to your answer and include them in 'activated_nodes'."
        )

        prompt = (
            f"{history_str}"
            f"=== DOCUMENT CONTEXT ===\n{document_context or 'No document text uploaded.'}\n\n"
            f"=== KNOWLEDGE GRAPH SCHEMA ===\n{graph_summary or 'No knowledge graph loaded.'}\n\n"
            f"=== USER QUESTION ===\n{query}"
        )

        answer = ""
        activated_nodes = activated_candidates

        try:
            if model_override and ("groq" in model_override.lower() or "llama" in model_override.lower()):
                res_json = self._generate_groq_json(prompt, system_instruction, model_override)
                answer = res_json.get("answer", "")
                activated_nodes = res_json.get("activated_nodes", activated_candidates)
            elif self.client:
                res_obj = self._generate_gemini_schema(prompt, system_instruction, model_override)
                answer = res_obj.answer
                activated_nodes = res_obj.activated_nodes or activated_candidates
            else:
                answer = self._fallback_scoped_answer(query, scope, graph, context_text)
        except Exception as e:
            print(f"[GraphRAGEngine] Structured RAG generation warning ({e}). Using robust scoped fallback...")
            answer = self._fallback_scoped_answer(query, scope, graph, context_text)

        llm_ms = round((time.perf_counter() - llm_start) * 1000, 2)
        total_ms = round((time.perf_counter() - request_start) * 1000, 2)

        return RAGAnswerSchema(
            answer=answer,
            activated_nodes=list(set(activated_nodes)),
            intent=intent.value,
            telemetry={
                "intent_classification_ms": intent_ms,
                "vector_retrieval_ms": vec_ms,
                "graph_retrieval_ms": graph_ms,
                "llm_generation_ms": llm_ms,
                "total_request_ms": total_ms,
            }
        )

    # ── LLM Helper Methods ──────────────────────────────────────

    def _generate_llm_text(self, prompt: str, system_instruction: str, model_override: Optional[str] = None) -> str:
        api_key_groq = self.groq_api_key or os.getenv("GROQ_API_KEY")
        
        if (model_override and ("groq" in model_override.lower() or "llama" in model_override.lower())) or (api_key_groq and not self.client):
            try:
                model = (model_override or "llama-3.3-70b-versatile").replace("groq/", "")
                return self._call_groq_text(prompt, system_instruction, model, api_key_groq)
            except Exception as e:
                print(f"[GraphRAGEngine] Groq text call warning: {e}")

        if self.client:
            for model_name in self.models_to_try:
                try:
                    res = self.client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.2,
                        )
                    )
                    return res.text.strip()
                except Exception as e:
                    print(f"[GraphRAGEngine] Gemini model '{model_name}' text error: {e}")

        return _smart_casual_fallback(prompt)

    def _call_groq_text(self, prompt: str, system_instruction: str, model: str, api_key: str) -> str:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 1024
        }
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"].strip()

    def _generate_groq_json(self, prompt: str, system_instruction: str, model_override: str) -> dict:
        api_key = self.groq_api_key or os.getenv("GROQ_API_KEY")
        model = model_override.replace("groq/", "")
        
        json_sys = system_instruction + "\nRespond ONLY with a JSON object: {\"answer\": \"string\", \"activated_nodes\": [\"string\"]}"
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": json_sys},
                {"role": "user", "content": prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
            "max_tokens": 2048
        }
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.loads(res.read().decode("utf-8"))
            return json.loads(data["choices"][0]["message"]["content"])

    def _generate_gemini_schema(self, prompt: str, system_instruction: str, model_override: Optional[str]) -> RAGAnswerSchema:
        models = [model_override] if model_override and not "groq" in model_override.lower() else self.models_to_try
        
        for m in models:
            try:
                res = self.client.models.generate_content(
                    model=m,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_schema=RAGAnswerSchema,
                        temperature=0.1,
                    )
                )
                return RAGAnswerSchema.model_validate_json(res.text)
            except Exception as e:
                print(f"[GraphRAGEngine] Gemini model '{m}' schema error: {e}")

        raise ValueError("All Gemini schema calls failed")

    def _fallback_scoped_answer(
        self,
        query: str,
        scope: QueryScope,
        graph: Optional[KnowledgeGraph],
        context_text: Optional[str]
    ) -> str:
        """
        Robust query-scoped fallback when API endpoints are unreachable.
        Extracts ONLY the actual value associated with requested attributes.
        Never returns field names, internal metadata, or generic boilerplate.
        """
        text = context_text or ""
        attrs = scope.requested_attributes
        extracted_parts = []

        # 1. Professional Summary
        if "professional_summary" in attrs:
            sum_match = re.search(r'Professional Summary:\s*([^\n]+)|Summary:\s*([^\n]+)|Profile:\s*([^\n]+)', text, re.IGNORECASE)
            if sum_match:
                val = (sum_match.group(1) or sum_match.group(2) or sum_match.group(3)).strip()
                extracted_parts.append(f"Professional Summary: {val}" if len(attrs) > 1 else val)

        # 2. Name query
        if "name" in attrs:
            val = None
            name_match = re.search(r'Name:\s*([^\n]+)', text, re.IGNORECASE)
            if name_match:
                val = name_match.group(1).strip()
            elif scope.target_entity and scope.target_entity.lower() != "name":
                val = scope.target_entity
            elif graph and graph.entities:
                persons = [e.name for e in graph.entities if e.type.upper() == "PERSON"]
                if persons:
                    val = persons[0]
            if val:
                extracted_parts.append(f"Name: {val}" if len(attrs) > 1 else val)

        # 3. Email query
        if "email" in attrs:
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
            if email_match:
                val = email_match.group(0).strip()
                extracted_parts.append(f"Email: {val}" if len(attrs) > 1 else val)

        # 4. Phone query
        if "phone" in attrs:
            phone_match = re.search(r'\+?\d[\d\-\s]{8,}\d', text)
            if phone_match:
                val = phone_match.group(0).strip()
                extracted_parts.append(f"Phone: {val}" if len(attrs) > 1 else val)

        # 5. Location query
        if "location" in attrs:
            loc_match = re.search(r'Location:\s*([^\n]+)', text, re.IGNORECASE)
            if loc_match:
                val = loc_match.group(1).strip()
                extracted_parts.append(f"Location: {val}" if len(attrs) > 1 else val)

        # 6. Work & Role query
        if "work_and_role" in attrs:
            role_match = re.search(r'Target Role:\s*([^\n]+)|Experience:\s*([^\n]+)|Role:\s*([^\n]+)', text, re.IGNORECASE)
            if role_match:
                val = (role_match.group(1) or role_match.group(2) or role_match.group(3)).strip()
                extracted_parts.append(f"Role: {val}" if len(attrs) > 1 else val)
            elif "google" in text.lower():
                extracted_parts.append("Google")

        # 7. CGPA query
        if "cgpa" in attrs:
            cgpa_match = re.search(r'CGPA:\s*([^\n\)]+)', text, re.IGNORECASE)
            if cgpa_match:
                val = cgpa_match.group(1).strip()
            else:
                cgpa_match2 = re.search(r'\b\d\.\d/\d+\b|\b\d\.\d\b', text)
                val = cgpa_match2.group(0).strip() if cgpa_match2 else None
            if val:
                extracted_parts.append(f"CGPA: {val}" if len(attrs) > 1 else val)

        # 8. Education query (FULL value)
        if "education" in attrs:
            edu_match = re.search(r'Education:\s*([^\n]+)', text, re.IGNORECASE)
            if edu_match:
                val = edu_match.group(1).strip()
            else:
                edu_match2 = re.search(r'([^\n]*(?:B\.?\s*Tech|M\.?\s*Tech|Bachelor|Master|Degree|IIT|NIT)[^\n]*)', text, re.IGNORECASE)
                val = edu_match2.group(1).strip() if edu_match2 else None
            if val:
                extracted_parts.append(f"Education: {val}" if len(attrs) > 1 else val)

        # 9. Technologies & Skills
        if "technologies_and_skills" in attrs:
            tech_match = re.search(r'Languages\s*&\s*Frameworks:\s*([^\n]+)|Skills:\s*([^\n]+)|Technologies:\s*([^\n]+)', text, re.IGNORECASE)
            if tech_match:
                val = (tech_match.group(1) or tech_match.group(2) or tech_match.group(3)).strip()
                extracted_parts.append(f"Skills: {val}" if len(attrs) > 1 else val)

        if extracted_parts:
            return "\n".join(extracted_parts) if len(attrs) > 1 else extracted_parts[0]

        # Default minimal fallback
        if text.strip():
            lines = [l.strip() for l in text.split('\n') if l.strip() and not l.startswith("#")]
            if lines:
                return lines[0]

        return "I couldn't find that specific detail in your uploaded document."
