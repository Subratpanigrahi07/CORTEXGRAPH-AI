"""
Analytics Service — graph analytics using Neo4j GDS with NetworkX fallback.

Metrics computed:
- PageRank — most influential/central entities
- Betweenness Centrality — bridge entities connecting clusters
- Community Detection (Louvain) — auto-cluster into topic groups
- Basic stats — node/edge counts by type, growth over time

Results cached in Redis (TTL 10 min).
"""

from typing import Optional
from app.schema import (
    AnalyticsOverview, CentralityResult, CentralityEntry,
    CommunitiesResult, CommunityEntry,
)
from app.db.neo4j_client import get_neo4j_client
from app.db.redis_client import get_redis_client
from app.config import get_settings


class AnalyticsService:
    """Graph analytics via Neo4j GDS with NetworkX fallback."""

    def __init__(self):
        self.settings = get_settings()
        self._gds_available = None

    def _check_gds(self) -> bool:
        """Check if Neo4j GDS plugin is available."""
        if self._gds_available is not None:
            return self._gds_available

        try:
            neo4j = get_neo4j_client()
            neo4j.run_cypher("RETURN gds.version() AS version")
            self._gds_available = True
        except Exception:
            self._gds_available = False
            print("[AnalyticsService] GDS not available — using NetworkX fallback")

        return self._gds_available

    # ── Overview Stats ────────────────────────────────────

    def get_overview(self) -> AnalyticsOverview:
        """Get basic graph statistics."""
        # Check cache first
        redis = self._get_redis()
        if redis:
            cached = redis.get_cached_analytics("overview")
            if cached:
                return AnalyticsOverview(**cached)

        neo4j = get_neo4j_client()

        entities_by_type = neo4j.get_entity_count_by_type()
        relationships_by_type = neo4j.get_relationship_count_by_type()
        doc_count = neo4j.get_document_count()

        total_entities = sum(entities_by_type.values())
        total_relationships = sum(relationships_by_type.values())

        from datetime import datetime
        overview = AnalyticsOverview(
            total_entities=total_entities,
            total_relationships=total_relationships,
            entities_by_type=entities_by_type,
            relationships_by_type=relationships_by_type,
            documents_indexed=doc_count,
            last_updated=datetime.utcnow().isoformat(),
        )

        # Cache
        if redis:
            redis.cache_analytics("overview", overview.model_dump(), ttl=self.settings.analytics_cache_ttl)

        return overview

    # ── PageRank ──────────────────────────────────────────

    def get_pagerank(self, top_n: int = 10) -> CentralityResult:
        """Get top-N entities by PageRank."""
        redis = self._get_redis()
        cache_key = f"pagerank_{top_n}"
        if redis:
            cached = redis.get_cached_analytics(cache_key)
            if cached:
                return CentralityResult(**cached)

        if self._check_gds():
            result = self._pagerank_gds(top_n)
        else:
            result = self._pagerank_networkx(top_n)

        if redis:
            redis.cache_analytics(cache_key, result.model_dump(), ttl=self.settings.analytics_cache_ttl)

        return result

    def _pagerank_gds(self, top_n: int) -> CentralityResult:
        """PageRank using Neo4j GDS."""
        neo4j = get_neo4j_client()

        # Project the graph
        try:
            neo4j.run_cypher("CALL gds.graph.drop('knowledgeGraph', false)")
        except Exception:
            pass

        try:
            neo4j.run_cypher("""
                CALL gds.graph.project('knowledgeGraph', 'Entity', '*')
            """)

            results = neo4j.run_cypher(f"""
                CALL gds.pageRank.stream('knowledgeGraph')
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).name AS entity,
                       gds.util.asNode(nodeId).type AS type,
                       gds.util.asNode(nodeId).id AS entity_id,
                       score
                ORDER BY score DESC
                LIMIT {top_n}
            """)

            entries = [
                CentralityEntry(
                    entity_name=r.get("entity", ""),
                    entity_type=r.get("type", ""),
                    score=r.get("score", 0.0),
                    entity_id=r.get("entity_id", ""),
                )
                for r in results
            ]

            return CentralityResult(algorithm="PageRank (GDS)", entries=entries)

        except Exception as e:
            print(f"[AnalyticsService] GDS PageRank failed: {e}")
            return self._pagerank_networkx(top_n)

    def _pagerank_networkx(self, top_n: int) -> CentralityResult:
        """PageRank fallback using NetworkX."""
        import networkx as nx

        G = self._build_networkx_graph()
        if not G.nodes():
            return CentralityResult(algorithm="PageRank (NetworkX)", entries=[])

        scores = nx.pagerank(G, alpha=0.85)
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_n]

        entries = [
            CentralityEntry(
                entity_name=G.nodes[node_id].get("name", node_id),
                entity_type=G.nodes[node_id].get("type", ""),
                score=score,
                entity_id=node_id,
            )
            for node_id, score in sorted_scores
        ]

        return CentralityResult(algorithm="PageRank (NetworkX)", entries=entries)

    # ── Betweenness Centrality ────────────────────────────

    def get_betweenness(self, top_n: int = 10) -> CentralityResult:
        """Get top-N bridge entities by betweenness centrality."""
        redis = self._get_redis()
        cache_key = f"betweenness_{top_n}"
        if redis:
            cached = redis.get_cached_analytics(cache_key)
            if cached:
                return CentralityResult(**cached)

        if self._check_gds():
            result = self._betweenness_gds(top_n)
        else:
            result = self._betweenness_networkx(top_n)

        if redis:
            redis.cache_analytics(cache_key, result.model_dump(), ttl=self.settings.analytics_cache_ttl)

        return result

    def _betweenness_gds(self, top_n: int) -> CentralityResult:
        """Betweenness centrality using Neo4j GDS."""
        neo4j = get_neo4j_client()
        try:
            results = neo4j.run_cypher(f"""
                CALL gds.betweenness.stream('knowledgeGraph')
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).name AS entity,
                       gds.util.asNode(nodeId).type AS type,
                       gds.util.asNode(nodeId).id AS entity_id,
                       score
                ORDER BY score DESC
                LIMIT {top_n}
            """)

            entries = [
                CentralityEntry(
                    entity_name=r.get("entity", ""),
                    entity_type=r.get("type", ""),
                    score=r.get("score", 0.0),
                    entity_id=r.get("entity_id", ""),
                )
                for r in results
            ]

            return CentralityResult(algorithm="Betweenness Centrality (GDS)", entries=entries)

        except Exception as e:
            print(f"[AnalyticsService] GDS Betweenness failed: {e}")
            return self._betweenness_networkx(top_n)

    def _betweenness_networkx(self, top_n: int) -> CentralityResult:
        """Betweenness centrality fallback using NetworkX."""
        import networkx as nx

        G = self._build_networkx_graph()
        if not G.nodes():
            return CentralityResult(algorithm="Betweenness Centrality (NetworkX)", entries=[])

        scores = nx.betweenness_centrality(G)
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_n]

        entries = [
            CentralityEntry(
                entity_name=G.nodes[node_id].get("name", node_id),
                entity_type=G.nodes[node_id].get("type", ""),
                score=score,
                entity_id=node_id,
            )
            for node_id, score in sorted_scores
        ]

        return CentralityResult(algorithm="Betweenness Centrality (NetworkX)", entries=entries)

    # ── Community Detection (Louvain) ─────────────────────

    def get_communities(self) -> CommunitiesResult:
        """Detect communities using Louvain algorithm."""
        redis = self._get_redis()
        if redis:
            cached = redis.get_cached_analytics("communities")
            if cached:
                return CommunitiesResult(**cached)

        if self._check_gds():
            result = self._communities_gds()
        else:
            result = self._communities_networkx()

        if redis:
            redis.cache_analytics("communities", result.model_dump(), ttl=self.settings.analytics_cache_ttl)

        return result

    def _communities_gds(self) -> CommunitiesResult:
        """Louvain community detection using Neo4j GDS."""
        neo4j = get_neo4j_client()
        try:
            results = neo4j.run_cypher("""
                CALL gds.louvain.stream('knowledgeGraph')
                YIELD nodeId, communityId
                RETURN communityId,
                       collect(gds.util.asNode(nodeId).name) AS members
                ORDER BY size(collect(gds.util.asNode(nodeId).name)) DESC
            """)

            communities = [
                CommunityEntry(
                    community_id=r.get("communityId", 0),
                    entities=r.get("members", []),
                    size=len(r.get("members", [])),
                )
                for r in results
            ]

            return CommunitiesResult(
                total_communities=len(communities),
                communities=communities,
            )

        except Exception as e:
            print(f"[AnalyticsService] GDS Louvain failed: {e}")
            return self._communities_networkx()

    def _communities_networkx(self) -> CommunitiesResult:
        """Louvain community detection fallback using NetworkX."""
        import networkx as nx

        G = self._build_networkx_graph()
        if not G.nodes():
            return CommunitiesResult(total_communities=0, communities=[])

        try:
            from networkx.algorithms.community import louvain_communities
            partition = louvain_communities(G, seed=42)
        except ImportError:
            # Fallback to connected components if louvain not available
            partition = list(nx.connected_components(G.to_undirected()))

        communities = []
        for i, community_nodes in enumerate(partition):
            members = [G.nodes[n].get("name", n) for n in community_nodes]
            communities.append(CommunityEntry(
                community_id=i,
                entities=members,
                size=len(members),
            ))

        # Sort by size descending
        communities.sort(key=lambda c: c.size, reverse=True)

        return CommunitiesResult(
            total_communities=len(communities),
            communities=communities,
        )

    # ── Internal Helpers ──────────────────────────────────

    def _build_networkx_graph(self):
        """Build a NetworkX graph from Neo4j for fallback analytics."""
        import networkx as nx

        neo4j = get_neo4j_client()
        G = nx.DiGraph()

        # Get all entities
        entities = neo4j.run_cypher(
            "MATCH (e:Entity) RETURN e.id AS id, e.name AS name, e.type AS type"
        )
        for e in entities:
            G.add_node(e["id"], name=e.get("name", e["id"]), type=e.get("type", ""))

        # Get all relationships (excluding internal ones)
        rels = neo4j.run_cypher("""
            MATCH (a:Entity)-[r]->(b:Entity)
            WHERE NOT type(r) IN ['EXTRACTED_FROM', 'INVOLVES']
            RETURN a.id AS source, b.id AS target, type(r) AS type
        """)
        for r in rels:
            G.add_edge(r["source"], r["target"], type=r.get("type", ""))

        return G

    def _get_redis(self) -> Optional[object]:
        """Get Redis client, or None if unavailable."""
        try:
            return get_redis_client()
        except Exception:
            return None
