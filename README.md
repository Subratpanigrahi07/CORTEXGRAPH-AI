# 🧠 CortexGraph AI

> **Enterprise Autonomous Knowledge Graph & GraphRAG Platform**

CortexGraph AI is a state-of-the-art enterprise solution combining hybrid **GraphRAG (Retrieval-Augmented Generation)**, **Autonomous Knowledge Graph Extraction**, and **Multi-Agent Orchestration**. Built with FastAPI, React + TypeScript, Neo4j, Celery, and Google Gemini, CortexGraph transforms unstructured documents into rich, queryable knowledge graphs with automated entity resolution, graph analytics, and real-time visualization.

---

## ✨ Key Features

- 🔍 **Hybrid GraphRAG Search**: Combines Neo4j graph traversal with ChromaDB vector search for multi-hop semantic reasoning and precise context retrieval.
- ⚡ **Autonomous Ingestion Pipeline**: Asynchronous background document parsing (PDF, DOCX, TXT) powered by Celery & Redis.
- 🤝 **Dynamic Entity Resolution**: Automated entity deduplication and merge suggestions using vector embeddings (`sentence-transformers`), fuzzy matching (`rapidfuzz`), and FAISS indexing.
- 🌐 **Interactive Graph Studio**: High-performance force-directed 2D/3D knowledge graph visualizer with custom node filtering, cluster layouts, and detail inspector panels.
- 📊 **Advanced Graph Analytics**: Real-time network metrics including PageRank, Degree Centrality, Betweenness, and Louvain Community Detection powered by Neo4j GDS & NetworkX.
- 🤖 **Multi-Agent Orchestration**: LangGraph-driven routing for entity extraction, relationship scoring, and contradiction detection.
- ⚠️ **Contradiction Sweeper**: Automated detection and resolution interface for conflicting relationship claims across different document sources.

---

## 🏗️ Architecture

```
                                  ┌───────────────────────────┐
                                  │   React + Vite Frontend   │
                                  └─────────────┬─────────────┘
                                                │ REST / WS
                                                ▼
                                  ┌───────────────────────────┐
                                  │    FastAPI Gateway API    │
                                  └──────┬──────────────┬─────┘
                                         │              │
                   ┌─────────────────────┘              └─────────────────────┐
                   ▼                                                          ▼
    ┌───────────────────────────┐                              ┌───────────────────────────┐
    │  Celery Workers & Beat    │                              │     GraphRAG & Agents     │
    └──────────────┬────────────┘                              └─────────────┬─────────────┘
                   │                                                         │
   ┌───────────────┴───────────────┐                        ┌────────────────┴───────────────┐
   ▼                               ▼                        ▼                                ▼
┌───────┐                     ┌────────┐              ┌───────────┐                    ┌───────────┐
│ Redis │                     │ Neo4j  │              │ ChromaDB  │                    │ Google    │
│Broker │                     │Graph DB│              │VectorStore│                    │ Gemini    │
└───────┘                     └────────┘              └───────────┘                    └───────────┘
```

---

## 🛠️ Tech Stack

### **Backend & AI Engine**
- **Framework**: Python 3.10+, FastAPI, Uvicorn
- **LLM & Agents**: Google Gemini 2.0 (`google-genai`), LangChain, LangGraph
- **Database**: Neo4j 5+ (Graph DB with APOC & Graph Data Science plugins)
- **Vector Storage**: ChromaDB
- **Task Queue & Async Processing**: Celery, Redis
- **Entity Resolution & Analytics**: `sentence-transformers`, `rapidfuzz`, NetworkX

### **Frontend & Interface**
- **Framework**: React 18, TypeScript, Vite
- **Styling**: Modern CSS design system (Dark mode, glassmorphism, responsive components)
- **Graph Engine**: Interactive Canvas / Force Graph Visualization
- **Icons & UI Components**: Lucide React, Custom Layout Systems

---

## 🚀 Quick Start (Docker Compose)

The easiest way to start CortexGraph AI is via Docker Compose:

### 1. Prerequisites
- [Docker Engine](https://docs.docker.com/get-docker/) & Docker Compose
- Google Gemini API Key

### 2. Configure Environment
Create a `.env` file inside the `backend/` directory:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add your API keys:
```env
GEMINI_API_KEY=your_google_gemini_api_key_here
NEO4J_URI=bolt://neo4j:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
REDIS_URL=redis://redis:6379/0
```

### 3. Launch Services
Start all containers (Redis, Neo4j, FastAPI API, Celery Worker, Celery Beat):

```bash
docker-compose up -d --build
```

- **FastAPI API Documentation**: http://localhost:8000/docs
- **Neo4j Browser UI**: http://localhost:7474 (Credentials: `neo4j` / `password`)

---

## 💻 Local Development Setup

### **1. Backend Setup**

```bash
cd backend

# Create virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run FastAPI development server
uvicorn app.main:app --reload --port 8000
```

### **2. Frontend Setup**

```bash
cd frontend

# Install packages
npm install

# Start Vite development server
npm run dev
```

The frontend application will be running at `http://localhost:5173`.

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
├── docker-compose.yml         # Full-stack container orchestration
└── README.md
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to open issues or submit Pull Requests to improve features, graph algorithms, or UI visuals.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
