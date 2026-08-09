"""
CortexGraph AI Backend — Phase 2
FastAPI application with multi-agent pipeline, entity resolution,
contradiction detection, and graph analytics.
"""

import os
import hashlib
import uuid
import json
import urllib.request
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from dotenv import load_dotenv

# Load environment variables from .env if present
env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(env_file)
load_dotenv()

from app.schema import KnowledgeGraph
from app.extractor import GraphExtractor
from app.rag import GraphRAGEngine
from app.ingest import parse_file_content, chunk_text

# Phase 2 route modules (safely imported for standalone runtime)
try:
    from app.routes.pipeline import router as pipeline_router
except Exception as e:
    print(f"[Warning] Could not import pipeline_router: {e}")
    pipeline_router = None

try:
    from app.routes.entities import router as entities_router
except Exception as e:
    print(f"[Warning] Could not import entities_router: {e}")
    entities_router = None

try:
    from app.routes.contradictions import router as contradictions_router
except Exception as e:
    print(f"[Warning] Could not import contradictions_router: {e}")
    contradictions_router = None

try:
    from app.routes.analytics import router as analytics_router
except Exception as e:
    print(f"[Warning] Could not import analytics_router: {e}")
    analytics_router = None


# ── Lifespan: startup/shutdown ────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    print("[Startup] FastAPI service starting...")
    yield
    print("[Shutdown] FastAPI service shutting down.")



# ── Initialize FastAPI App ────────────────────────────
app = FastAPI(
    title="CortexGraph AI Backend",
    description="FastAPI service for autonomous knowledge management — "
                "multi-agent extraction, verification, entity resolution, "
                "contradiction detection, and graph analytics.",
    version="2.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend web application integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production to frontend domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Phase 2 route modules ───────────────────
if pipeline_router:
    app.include_router(pipeline_router, prefix="/api")
if entities_router:
    app.include_router(entities_router, prefix="/api")
if contradictions_router:
    app.include_router(contradictions_router, prefix="/api")
if analytics_router:
    app.include_router(analytics_router, prefix="/api")


# ── Request/Response Schemas ─────────────────────────
class ExtractionRequest(BaseModel):
    text: str = Field(description="The unstructured text to extract graph information from.")
    instruction: Optional[str] = Field(default=None, description="Custom guidelines for the extraction process.")
    model: Optional[str] = Field(default=None, description="Requested LLM model (e.g. gemini-1.5-flash or groq/llama-3.3-70b-versatile).")

class ChatHistoryItem(BaseModel):
    sender: str
    text: str

class ChatRequest(BaseModel):
    query: str = Field(description="User question to answer.")
    history: Optional[List[ChatHistoryItem]] = Field(default=[], description="Previous conversation turn history.")
    graph: Optional[KnowledgeGraph] = Field(default=None, description="Extracted graph context.")
    context_text: Optional[str] = Field(default=None, description="Raw text context from PDF/document.")
    model: Optional[str] = Field(default=None, description="Selected AI model.")

class ChatResponse(BaseModel):
    answer: str
    activated_nodes: List[str]
    intent: Optional[str] = None
    telemetry: Optional[dict] = None
    explanation: Optional[dict] = None

class DocumentUploadResponse(BaseModel):
    filename: str
    text: str
    graph: KnowledgeGraph
    document_id: Optional[str] = None
    pipeline_job_id: Optional[str] = None

class STTResponse(BaseModel):
    text: str
    engine: str


# ── Global Services (lazy init) ──────────────────────
extractor = None
rag_engine = None

def get_extractor():
    global extractor
    if extractor is None:
        try:
            extractor = GraphExtractor()
        except ValueError:
            raise HTTPException(
                status_code=500,
                detail="Gemini API Key is not configured. Please check your environment variables."
            )
    return extractor

def get_rag_engine():
    global rag_engine
    if rag_engine is None:
        try:
            rag_engine = GraphRAGEngine()
        except ValueError:
            raise HTTPException(
                status_code=500,
                detail="Gemini API Key is not configured for RAG engine. Check environment variables."
            )
    return rag_engine


# ═══════════════════════════════════════════════════════
# Phase 1 Endpoints (preserved for backward compatibility)
# ═══════════════════════════════════════════════════════

@app.get("/health")
def health_check():
    """Health check with Phase 2 infrastructure status."""
    status = {
        "status": "healthy",
        "version": "2.0.0",
        "api_key_configured": bool(os.getenv("GEMINI_API_KEY")),
        "neo4j_configured": bool(os.getenv("NEO4J_URI")),
    }

    # Check Neo4j connectivity
    try:
        from app.db.neo4j_client import get_neo4j_client
        status["neo4j_connected"] = get_neo4j_client().verify_connectivity()
    except Exception:
        status["neo4j_connected"] = False

    # Check Redis connectivity
    try:
        from app.db.redis_client import get_redis_client
        status["redis_connected"] = get_redis_client().ping()
    except Exception:
        status["redis_connected"] = False

    # Check Celery
    try:
        from app.celery_app import celery_app
        inspect = celery_app.control.inspect()
        active = inspect.active()
        status["celery_workers"] = len(active) if active else 0
    except Exception:
        status["celery_workers"] = 0

    return status


@app.post("/api/extract", response_model=KnowledgeGraph)
def extract_graph(request: ExtractionRequest):
    """Phase 1/2 extraction endpoint with Gemini and Groq model support."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")

    ext = get_extractor()
    try:
        if request.model and ("groq" in request.model.lower() or "llama" in request.model.lower() or "mixtral" in request.model.lower() or "gemma" in request.model.lower()):
            try:
                return ext._extract_with_groq(request.text, model_name=request.model, user_instruction=request.instruction)
            except Exception as groq_err:
                print(f"[Extract] Groq model extraction failed ({groq_err}), falling back to Gemini")

        graph_data = ext.extract(request.text, user_instruction=request.instruction)
        return graph_data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred during knowledge graph extraction: {str(e)}"
        )


@app.post("/api/chat", response_model=ChatResponse)
def chat_with_graph(request: ChatRequest):
    """Phase 1/2 intent-aware chat endpoint with Groq & Gemini model support."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Question query cannot be empty.")

    history_dicts = [h.model_dump() for h in request.history] if request.history else []
    engine = get_rag_engine()
    try:
        result = engine.answer_query(
            query=request.query,
            history=history_dicts,
            graph=request.graph,
            context_text=request.context_text,
            model_override=request.model
        )

        # Only generate detailed provenance explanations for Knowledge Base & Hybrid queries
        explanation = None
        if result.intent in ("KNOWLEDGE_BASE_QUERY", "HYBRID_QUERY"):
            try:
                from app.agents.explanation import ExplanationAgent
                explainer = ExplanationAgent()
                explanation = explainer.explain(
                    query=request.query,
                    answer=result.answer,
                    activated_nodes=result.activated_nodes,
                    context_text=request.context_text,
                )
            except Exception as e:
                print(f"[Chat] Explanation agent warning: {e}")

        return ChatResponse(
            answer=result.answer,
            activated_nodes=result.activated_nodes,
            intent=result.intent,
            telemetry=result.telemetry,
            explanation=explanation,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred during Graph RAG query execution: {str(e)}"
        )


@app.post("/api/upload", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """
    Phase 2 upload — parses document, returns immediate graph for UI,
    AND triggers the async agent pipeline via Celery.
    """
    try:
        content = await file.read()
        extracted_text = parse_file_content(file.filename, content)

        if not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail=f"No readable text could be extracted from {file.filename}."
            )

        # Generate document ID from content hash
        document_id = hashlib.sha256(content).hexdigest()[:16]

        # Phase 1 behavior: immediate extraction for the UI
        ext = get_extractor()
        graph_data = ext.extract(extracted_text[:4000])

        # Phase 2: chunk the document and trigger async pipeline
        chunks = chunk_text(extracted_text)
        pipeline_job_id = None

        try:
            from app.tasks.pipeline import run_agent_pipeline
            task = run_agent_pipeline.delay(document_id, chunks, file.filename)
            pipeline_job_id = task.id
            print(f"[Upload] Async pipeline triggered: job_id={task.id}, doc_id={document_id}")
        except Exception as e:
            print(f"[Upload] Celery task dispatch failed (pipeline will not run): {e}")

        return DocumentUploadResponse(
            filename=file.filename,
            text=extracted_text,
            graph=graph_data,
            document_id=document_id,
            pipeline_job_id=pipeline_job_id,
        )
    except HTTPException as e:
        raise e
@app.post("/api/stt", response_model=STTResponse)
async def speech_to_text(file: UploadFile = File(...)):
    """
    Online Speech-to-Text API.
    Converts uploaded microphone audio into transcribed text via Groq Whisper or Gemini.
    API keys remain strictly on the backend.
    """
    if not file:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty audio recording received.")

    groq_key = os.getenv("GROQ_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    # 1. Try Groq Whisper API (whisper-large-v3-turbo)
    if groq_key:
        try:
            url = "https://api.groq.com/openai/v1/audio/transcriptions"
            boundary = "----WebKitFormBoundaryCortexGraphSTT"
            filename = file.filename or "recording.webm"
            mime_type = file.content_type or "audio/webm"

            body = []
            body.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-large-v3-turbo\r\n".encode("utf-8"))
            body.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {mime_type}\r\n\r\n".encode("utf-8"))
            body.append(content)
            body.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))

            payload = b"".join(body)
            headers = {
                "Authorization": f"Bearer {groq_key}",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Content-Type": f"multipart/form-data; boundary={boundary}"
            }
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=25) as res:
                res_data = json.loads(res.read().decode("utf-8"))
                transcription = res_data.get("text", "").strip()
                print(f"[STT] Groq Whisper transcribed: '{transcription}'")
                return STTResponse(text=transcription, engine="Groq Whisper v3 Turbo")
        except Exception as e:
            print(f"[STT] Groq Whisper warning: {e}. Trying Gemini audio fallback...")

    # 2. Try Gemini Multimodal Audio Fallback
    if gemini_key:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=gemini_key)
            mime_type = file.content_type or "audio/webm"
            res = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=content, mime_type=mime_type),
                    "Transcribe this speech recording accurately. Output ONLY the exact transcribed text words. Do not add intro/outro or explanations."
                ]
            )
            transcription = res.text.strip()
            if transcription:
                print(f"[STT] Gemini Audio transcribed: '{transcription}'")
                return STTResponse(text=transcription, engine="Gemini Multimodal Audio")
        except Exception as e:
            print(f"[STT] Gemini Audio error: {e}")

    raise HTTPException(status_code=500, detail="Online speech-to-text API service is unavailable. Please check backend API keys.")


if __name__ == "__main__":
    import uvicorn
    # Allow running directly via python app/main.py
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
