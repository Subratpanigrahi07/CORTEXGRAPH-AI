import os
import re
import time
import json
import urllib.request
from typing import List, Set
from google import genai
from google.genai import types
from google.genai.errors import APIError
from app.schema import KnowledgeGraph, Entity, Relationship, Property

class GraphExtractor:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[GraphExtractor] Genai client init warning: {e}")
                self.client = None
        else:
            self.client = None
            
        self.models_to_try = [
            'gemini-1.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-pro',
        ]

    def _extract_with_groq(self, text_chunk: str, model_name: str = "llama-3.3-70b-versatile", user_instruction: str = None) -> KnowledgeGraph:
        """Extracts knowledge graph using Groq LPU API endpoint."""
        api_key = self.groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("Groq API key not configured.")

        # Clean model name
        model = model_name.replace("groq/", "")

        system_instruction = (
            "You are an advanced knowledge graph extraction engine.\n"
            "Respond ONLY with a valid JSON object matching this structure:\n"
            "{\n"
            '  "entities": [{"id": "string", "name": "string", "type": "string", "properties": [{"key": "string", "value": "string"}]}],\n'
            '  "relationships": [{"source": "string", "target": "string", "type": "string", "properties": [{"key": "string", "value": "string"}]}]\n'
            "}\n"
            "Entity types should be one of: PERSON, ORGANIZATION, TECHNOLOGY, PROJECT, CONCEPT, EVENT, DATASET, PAPER.\n"
            "Relationship types should be descriptive verbs in UPPERCASE_WITH_UNDERSCORES.\n"
            "Ensure 'source' and 'target' in relationships match entity 'id' values exactly."
        )

        if user_instruction:
            system_instruction += f"\n\nAdditional Guidance:\n{user_instruction}"

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": f"Extract knowledge graph from text:\n\n{text_chunk}"}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
            "max_tokens": 4096
        }

        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as response:
            res_body = json.loads(response.read().decode("utf-8"))
            content = res_body["choices"][0]["message"]["content"]
            data_dict = json.loads(content)
            
            # Sanitize IDs to lowercase
            entities = []
            for e in data_dict.get("entities", []):
                e["id"] = e.get("id", e.get("name", "")).lower().replace(" ", "_")
                entities.append(Entity(**e))
                
            relationships = []
            for r in data_dict.get("relationships", []):
                r["source"] = r.get("source", "").lower().replace(" ", "_")
                r["target"] = r.get("target", "").lower().replace(" ", "_")
                relationships.append(Relationship(**r))
                
            return KnowledgeGraph(entities=entities, relationships=relationships)

    def extract(self, text_chunk: str, user_instruction: str = None) -> KnowledgeGraph:
        """
        Extracts a Knowledge Graph (entities & relationships) from a chunk of text.
        Includes automatic retries with fallback models and local rule-based fallback if API quota (429) is exceeded.
        """
        if not self.client:
            return self._fallback_extract(text_chunk)

        base_instruction = (
            "You are an advanced knowledge graph construction engine.\n"
            "Your task is to read the provided text chunk and extract a highly accurate network of entities and relationships.\n\n"
            "Rules:\n"
            "1. Extract core concepts, people, companies, tools, frameworks, and datasets as entities.\n"
            "2. Define relationships using precise, descriptive verbs in UPPERCASE_WITH_UNDERSCORES (e.g. 'CREATED', 'WORKS_AT', 'BUILT_WITH', 'INTEGRATES').\n"
            "3. Ensure the 'source' and 'target' fields in relationships exactly match the lowercase 'id' of one of the extracted entities.\n"
            "4. Normalize entity IDs: convert them to lowercase and replace spaces or special characters with underscores (e.g., 'CortexGraph AI' becomes 'cortexgraph_ai').\n"
            "5. Populate 'properties' with any rich facts found in the text (e.g. descriptions, roles, versions, dates)."
        )

        system_instruction = base_instruction
        if user_instruction:
            system_instruction += f"\n\nAdditional User Guidance:\n{user_instruction}"

        prompt = f"Extract all entities and relationships from the following text block:\n\n{text_chunk}"

        last_exception = None

        for model_name in self.models_to_try:
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    response = self.client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            response_mime_type="application/json",
                            response_schema=KnowledgeGraph,
                            temperature=0.1,
                        )
                    )
                    return KnowledgeGraph.model_validate_json(response.text)

                except (APIError, Exception) as e:
                    last_exception = e
                    err_str = str(e)
                    print(f"[GraphExtractor] Error with model '{model_name}' (attempt {attempt + 1}/{max_retries}): {err_str}")
                    
                    is_overloaded = "503" in err_str or "UNAVAILABLE" in err_str or "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                    
                    if is_overloaded and attempt < max_retries - 1:
                        time.sleep(1.0)
                    else:
                        break

        print(f"[GraphExtractor] All API models failed ({last_exception}). Engaging Local Graph Extraction fallback...")
        return self._fallback_extract(text_chunk)

    def _fallback_extract(self, text: str) -> KnowledgeGraph:
        """
        Local heuristic fallback for knowledge graph extraction when API rate limit (429) occurs.
        Generates a rich, interconnected graph network.
        """
        known_techs = {"react", "fastapi", "neo4j", "chromadb", "gemini", "python", "javascript", "typescript", "vector_db", "sql", "ai"}
        
        raw_words = re.findall(r'\b[A-Z][a-zA-Z0-9_\-\.]*(?:\s+[A-Z][a-zA-Z0-9_\-\.]*)*\b', text)
        
        entities: List[Entity] = []
        relationships: List[Relationship] = []
        seen_ids: Set[str] = set()

        def clean_id(val: str) -> str:
            return re.sub(r'[^a-z0-9_]', '', val.lower().strip().replace(' ', '_'))

        candidates = list(dict.fromkeys(raw_words))
        hub_id = None

        for item in candidates:
            if len(item) < 2 or item in ["The", "A", "An", "In", "On", "It", "Is", "And", "Or", "For", "With", "System"]:
                continue
            
            ent_id = clean_id(item)
            if not ent_id or ent_id in seen_ids:
                continue

            seen_ids.add(ent_id)
            
            norm = item.lower()
            if any(t in norm for t in known_techs) or "api" in norm or "db" in norm:
                ent_type = "Technology"
            elif norm in ["subrat", "user", "john", "alex", "author", "creator", "developer"]:
                ent_type = "Person"
            elif "graph" in norm or "cortex" in norm or "rag" in norm or "ai" in norm:
                ent_type = "Project"
                if not hub_id:
                    hub_id = ent_id
            else:
                ent_type = "Concept"

            entities.append(Entity(
                id=ent_id,
                name=item,
                type=ent_type,
                properties=[Property(key="mode", value="local_extracted")]
            ))

        if not hub_id:
            if entities:
                hub_id = entities[0].id
            else:
                hub_id = "cortexgraph_ai"
                entities.append(Entity(id=hub_id, name="CortexGraph AI", type="Project", properties=[]))

        # Build interconnected web relationships (Hub & Spoke + Tech Mesh)
        for e in entities:
            if e.id == hub_id:
                continue
            
            rel_type = "BUILT_WITH" if e.type == "Technology" else ("DEVELOPED" if e.type == "Person" else "INTEGRATES")
            if e.type == "Person":
                relationships.append(Relationship(source=e.id, target=hub_id, type="DEVELOPED", properties=[]))
            else:
                relationships.append(Relationship(source=hub_id, target=e.id, type=rel_type, properties=[]))

        # Add cross-connections between technologies / concepts
        tech_entities = [e.id for e in entities if e.id != hub_id]
        for i in range(len(tech_entities) - 1):
            relationships.append(Relationship(
                source=tech_entities[i],
                target=tech_entities[i+1],
                type="CONNECTS_TO",
                properties=[]
            ))

        return KnowledgeGraph(entities=entities, relationships=relationships)
