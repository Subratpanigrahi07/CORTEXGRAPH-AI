<div align="center">

# 🧠 CortexGraph AI

### Enterprise Autonomous Knowledge Graph & GraphRAG Platform

*Transform unstructured documents into rich, queryable knowledge graphs — with automated entity resolution, multi-agent orchestration, graph analytics, and real-time visualization.*

<br>

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Neo4j](https://img.shields.io/badge/Neo4j-008CC1?style=for-the-badge&logo=neo4j&logoColor=white)](https://neo4j.com)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](#-contributing)
![Status](https://img.shields.io/badge/status-active_development-orange?style=flat-square)

<br>

[**Live Demo**](#) &nbsp;•&nbsp; [**API Docs**](#-api-reference) &nbsp;•&nbsp; [**Architecture**](#%EF%B8%8F-architecture) &nbsp;•&nbsp; [**Quick Start**](#-quick-start-docker-compose) &nbsp;•&nbsp; [**Roadmap**](#%EF%B8%8F-roadmap)

</div>

---

## 📖 Overview

Traditional RAG retrieves flat chunks of text and hopes the LLM connects the dots. **CortexGraph AI** does more: every document is autonomously parsed into a structured knowledge graph of entities and typed relationships, stored in **Neo4j**, and made searchable both semantically (**ChromaDB**) and structurally (multi-hop graph traversal).

A **LangGraph-orchestrated multi-agent pipeline** extracts, verifies, and deduplicates entities before they ever reach the graph — so the knowledge base stays clean as it grows, instead of accumulating duplicate nodes and unverified claims the way a naive LLM-extraction pipeline would.

```
   Subrat ──DEVELOPED──▶ CortexGraph AI ──USES──▶ Neo4j
                               │
                             USES
                               ▼
                          ChromaDB
```

---
📸 Screenshots

1. **upload.png** — Document upload & async ingestion interface
2. **graph.png** — Interactive Neo4j force-directed graph visualization
3. **extraction.png** — Entity & relationship extraction details with confidence scores
4. **qa.png** — GraphRAG Q&A response showing sources, entities involved, and graph path
5. **analytics.png** — Graph analytics dashboard (PageRank rankings, community detection, centrality metrics)

| Upload & Ingestion | Interactive Graph | Entity Extraction |
![Uploading Screenshot 2026-08-09 161330.png…]() 


## ✨ Key Features

| | |
|---|---|
| 🔍 **Hybrid GraphRAG Search** | Combines Neo4j graph traversal with ChromaDB vector search for multi-hop semantic reasoning and precise, explainable context retrieval. |
| ⚡ **Autonomous Ingestion Pipeline** | Asynchronous background document parsing (PDF, DOCX, TXT) powered by Celery & Redis — uploads never block the API. |
| 🤝 **Dynamic Entity Resolution** | Deduplicates entities like `Subrat` / `Subrat Panigrahi` / `S. Panigrahi` using `sentence-transformers` embeddings, `rapidfuzz` fuzzy matching, and FAISS indexing, with human-reviewable merge suggestions. |
| 🌐 **Interactive Graph Studio** | High-performance force-directed 2D/3D knowledge graph visualizer with node filtering, cluster layouts, and a detail inspector panel. |
| 📊 **Advanced Graph Analytics** | Real-time network metrics — PageRank, Degree Centrality, Betweenness, and Louvain Community Detection — powered by Neo4j GDS & NetworkX. |
| 🤖 **Multi-Agent Orchestration** | LangGraph-driven routing across dedicated agents for entity extraction, relationship scoring, and contradiction detection. |
| ⚠️ **Contradiction Sweeper** | Automatically flags conflicting relationship claims sourced from different documents and surfaces them for resolution. |

---

## 🏗️ Architecture

```
                                  ┌───────────────────────────┐
                                  │   React + Vite Frontend    │
                                  └─────────────┬───────────────┘
                                                 │ REST / WS
                                                 ▼
                                  ┌───────────────────────────┐
                                  │    FastAPI Gateway API     │
                                  └──────┬──────────────┬───────┘
                                         │              │
                   ┌─────────────────────┘              └─────────────────────┐
                   ▼                                                          ▼
    ┌───────────────────────────┐                              ┌───────────────────────────┐
    │   Celery Workers & Beat    │                              │     GraphRAG & Agents      │
    └──────────────┬──────────────┘                              └─────────────┬───────────────┘
                   │                                                          │
   ┌───────────────┴───────────────┐                        ┌─────────────────┴───────────────┐
   ▼                               ▼                        ▼                                  ▼
┌───────┐                     ┌────────┐              ┌───────────┐                      ┌───────────┐
│ Redis │                     │ Neo4j  │              │ ChromaDB  │                      │  Google   │
│Broker │                     │Graph DB│              │VectorStore│                      │  Gemini   │
└───────┘                     └────────┘              └───────────┘                      └───────────┘
```

**Query flow:** a question is embedded and matched against ChromaDB → matched entities seed a multi-hop traversal in Neo4j → combined vector + graph context is passed to Gemini for synthesis → the response returns with source documents, involved entities, and the exact graph path traversed.

**Ingestion flow:** an uploaded document is queued via Celery/Redis → the Extraction agent identifies entities/relationships → the Entity Resolution stage checks for duplicates against the existing graph → verified, deduplicated data is written to Neo4j, with embeddings persisted to ChromaDB.

---

## 🛠️ Tech Stack

<table>
<tr>
<td valign="top" width="50%">

### Backend & AI Engine
- **Framework** — Python 3.10+, FastAPI, Uvicorn
- **LLM & Agents** — Google Gemini 2.0 (`google-genai`), LangChain, LangGraph
- **Graph Database** — Neo4j 5+ (APOC + Graph Data Science plugins)
- **Vector Storage** — ChromaDB
- **Task Queue** — Celery, Redis
- **Entity Resolution & Analytics** — `sentence-transformers`, `rapidfuzz`, FAISS, NetworkX

</td>
<td valign="top" width="50%">

### Frontend & Interface
- **Framework** — React 18, TypeScript, Vite
- **Styling** — Custom design system (dark mode, glassmorphism, responsive)
- **Graph Engine** — Interactive Canvas / force-directed graph visualization
- **UI Components** — Lucide React, custom layout system

### Infra
- **Containerization** — Docker & Docker Compose
- **Deployment** — Vercel (frontend) · Railway / Render (backend + DBs)

</td>
</tr>
</table>

---

## 🚀 Quick Start (Docker Compose)

The fastest way to run the full stack locally.

**Prerequisites:** [Docker Engine](https://docs.docker.com/get-docker/) & Docker Compose, a Google Gemini API key.

**1. Configure environment**
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
GEMINI_API_KEY=your_google_gemini_api_key_here
NEO4J_URI=bolt://neo4j:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
REDIS_URL=redis://redis:6379/0
```

**2. Launch all services** (Redis, Neo4j, FastAPI API, Celery Worker, Celery Beat)
```bash
docker-compose up -d --build
```

| Service | URL |
|---|---|
| FastAPI Swagger docs | http://localhost:8000/docs |
| Neo4j Browser | http://localhost:7474 (`neo4j` / `password`) |
| Frontend (if included in compose) | http://localhost:5173 |

---

## 💻 Local Development Setup

<details>
<summary><strong>Backend setup</strong></summary>

```bash
cd backend

python -m venv venv
# Windows
.\venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```
</details>

<details>
<summary><strong>Frontend setup</strong></summary>

```bash
cd frontend
npm install
npm run dev
```
Runs at `http://localhost:5173`.
</details>

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/documents/upload` | Upload a document for async processing |
| `GET` | `/documents` | List all uploaded documents and their status |
| `GET` | `/graph/entities` | List extracted entities |
| `GET` | `/graph/entities/{id}` | Get an entity with its relationships |
| `GET` | `/graph/search?q=` | Search entities by name/alias |
| `GET` | `/analytics/centrality` | PageRank / betweenness centrality rankings |
| `GET` | `/analytics/communities` | Louvain community clusters |
| `GET` | `/entities/merge-suggestions` | Pending entity-resolution merge candidates |
| `GET` | `/contradictions` | Open contradictions flagged across sources |
| `POST` | `/query` | Ask a question — returns a GraphRAG answer with sources & graph path |

<details>
<summary><strong>Example — <code>POST /query</code></strong></summary>

**Request**
```json
{
  "question": "What technologies does CortexGraph use and who built it?"
}
```

**Response**
```json
{
  "answer": "CortexGraph AI was developed by Subrat and uses Neo4j for graph storage and ChromaDB for vector search...",
  "sources": [
    { "document": "cortexgraph_overview.pdf", "chunk_id": "c_0042" }
  ],
  "entities_involved": ["Subrat", "CortexGraph AI", "Neo4j", "ChromaDB"],
  "graph_path": [
    "Subrat -[DEVELOPED]-> CortexGraph AI",
    "CortexGraph AI -[USES]-> Neo4j",
    "CortexGraph AI -[USES]-> ChromaDB"
  ]
}
```

Full interactive API documentation is available at `/docs` (Swagger UI) once the backend is running.
</details>

---

## 📁 Repository Structure

```
CORTEXGRAPH-AI/
├── backend/
│   ├── app/
│   │   ├── agents/            # LangGraph agent definitions & nodes
│   │   ├── db/                # Neo4j & ChromaDB connection managers
│   │   ├── entity_resolution/ # Vector & fuzzy entity resolution logic
│   │   ├── routes/            # FastAPI endpoint routers
│   │   ├── services/          # Business logic services
│   │   ├── tasks/             # Celery async background tasks
│   │   ├── celery_app.py      # Celery task configuration
│   │   ├── extractor.py       # Graph entity & relation extractor
│   │   ├── main.py            # FastAPI entry point
│   │   ├── query_router.py    # Hybrid GraphRAG router
│   │   ├── rag.py             # Retrieval-augmented generation engine
│   │   └── schema.py          # Pydantic data schemas
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/        # Graph Visualizer, Analytics, Dashboards
│   │   ├── App.tsx            # Main application hub
│   │   └── index.css          # Core design system & theme tokens
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml          # Full-stack container orchestration
└── README.md
```

---

## 🗺️ Roadmap

- [x] **v1.0** — Multi-document ingestion, entity/relationship extraction, Neo4j + ChromaDB, interactive Graph Studio, explainable GraphRAG Q&A
- [x] **v2.0** — Multi-agent extraction pipeline (Extraction → Verification → Entity Resolution → Graph Builder), dynamic entity resolution, contradiction sweeper, graph analytics (PageRank, Louvain communities) via Neo4j GDS
- [ ] **v2.1** — Event-driven architecture (Kafka), live agent activity monitoring, temporal fact versioning
- [ ] **v3.0** — Self-evolving ontology, autonomous knowledge-gap discovery, advanced multi-hop reasoning

---

## 🤝 Contributing

Contributions are welcome — please open an issue to discuss significant changes before submitting a PR.

```bash
git checkout -b feature/your-feature
git commit -m "Add: your feature"
git push origin feature/your-feature
```


## 👤 Author

**Subrat Panigrahi**
B.Tech CSE (AI/ML), GIET University
[GitHub](https://github.com/Subratpanigrahi07) · [LinkedIn](https://www.linkedin.com/in/subrat-panigrahi-1b9333325?utm_source=share_via&utm_content=profile&utm_medium=member_android)

---

<div align="center">
<sub>Built with a focus on <strong>explainability</strong> — every answer CortexGraph gives can be traced back to its source document and graph path.</sub>
</div>
