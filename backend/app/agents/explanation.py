"""
Explanation Agent — query-time agent that enriches Graph RAG answers.

Given a Graph RAG answer, produces:
- Which documents contributed
- Which graph path(s) were traversed
- How many independent sources agree

Wraps the existing Phase 1 Graph RAG QA output.
Uses a cheaper/faster model since it's synthesis work, not extraction.
"""

import json
import time
from typing import Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError
from app.config import get_settings
from app.db.neo4j_client import get_neo4j_client


class ExplanationAgent:
    """Enriches Graph RAG answers with provenance and path explanations."""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gemini_api_key
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[ExplanationAgent] Gemini client init warning: {e}")

        # Models to try for explanation synthesis
        self.models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-2.5-pro",
        ]

    def explain(
        self,
        query: str,
        answer: str,
        activated_nodes: list[str],
        context_text: Optional[str] = None,
    ) -> dict:
        """
        Generate an explanation of how the answer was derived.

        Returns:
            {
                "explanation": str,
                "sources": [{"document_id": str, "relevance": str}],
                "graph_paths": [str],
                "source_agreement": int,
                "confidence_summary": str,
            }
        """
        # Gather provenance from Neo4j
        neo4j = None
        source_documents = []
        graph_paths = []

        try:
            neo4j = get_neo4j_client()

            # Find source documents for activated entities
            for node_id in activated_nodes[:10]:  # Limit to top 10
                results = neo4j.run_cypher(
                    """
                    MATCH (e:Entity {id: $id})-[:EXTRACTED_FROM]->(d:Document)
                    RETURN d.filename AS filename, d.id AS doc_id
                    """,
                    {"id": node_id},
                )
                for r in results:
                    if r not in source_documents:
                        source_documents.append(r)

            # Find paths between activated nodes
            if len(activated_nodes) >= 2:
                for i in range(min(len(activated_nodes) - 1, 3)):
                    results = neo4j.run_cypher(
                        """
                        MATCH path = shortestPath(
                            (a:Entity {id: $id_a})-[*..4]-(b:Entity {id: $id_b})
                        )
                        RETURN [n IN nodes(path) | n.name] AS path_nodes,
                               [r IN relationships(path) | type(r)] AS path_rels
                        """,
                        {"id_a": activated_nodes[i], "id_b": activated_nodes[i + 1]},
                    )
                    for r in results:
                        nodes = r.get("path_nodes", [])
                        rels = r.get("path_rels", [])
                        if nodes:
                            path_str = " → ".join(
                                f"{nodes[j]} -[{rels[j]}]→" if j < len(rels) else nodes[j]
                                for j in range(len(nodes))
                            )
                            graph_paths.append(path_str)

        except Exception as e:
            print(f"[ExplanationAgent] Neo4j query failed: {e}")

        # Generate natural language explanation
        explanation = self._generate_explanation(
            query=query,
            answer=answer,
            source_documents=source_documents,
            graph_paths=graph_paths,
        )

        return {
            "explanation": explanation,
            "sources": [
                {"document_id": s.get("doc_id", ""), "filename": s.get("filename", "")}
                for s in source_documents
            ],
            "graph_paths": graph_paths,
            "source_agreement": len(source_documents),
            "confidence_summary": (
                "High confidence — multiple independent sources"
                if len(source_documents) >= 2
                else "Single source — verify independently"
                if len(source_documents) == 1
                else "No source documents linked — based on graph structure"
            ),
        }

    def _generate_explanation(
        self,
        query: str,
        answer: str,
        source_documents: list[dict],
        graph_paths: list[str],
    ) -> str:
        """Generate a natural language explanation of how the answer was derived."""
        if not self.client:
            return self._fallback_explanation(source_documents, graph_paths)

        sources_str = ", ".join(s.get("filename", "unknown") for s in source_documents) or "none"
        paths_str = "; ".join(graph_paths[:3]) or "none"

        prompt = (
            f"Question: {query}\n"
            f"Answer: {answer}\n"
            f"Source documents: {sources_str}\n"
            f"Graph paths traversed: {paths_str}\n\n"
            "In 2-3 sentences, explain how this answer was derived from the sources and graph paths. "
            "Be concise and factual."
        )

        for model_name in self.models_to_try:
            try:
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.2),
                )
                return response.text.strip()
            except Exception as e:
                print(f"[ExplanationAgent] Model '{model_name}' failed: {e}")
                continue

        return self._fallback_explanation(source_documents, graph_paths)

    def _fallback_explanation(self, source_documents: list[dict], graph_paths: list[str]) -> str:
        """Simple template-based explanation when LLM is unavailable."""
        parts = []
        if source_documents:
            filenames = [s.get("filename", "unknown") for s in source_documents]
            parts.append(f"This answer draws from {len(source_documents)} source document(s): {', '.join(filenames)}.")
        if graph_paths:
            parts.append(f"The knowledge graph path(s) traversed: {'; '.join(graph_paths[:2])}.")
        if not parts:
            parts.append("This answer was synthesized from the knowledge graph structure.")
        return " ".join(parts)
