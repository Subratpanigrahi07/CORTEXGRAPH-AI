"""
Centralized configuration for CortexGraph Phase 2.
All environment variables are loaded and validated here.
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ── LLM APIs ──
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")

    # ── Neo4j ──
    neo4j_uri: str = Field(default="bolt://localhost:7687", alias="NEO4J_URI")
    neo4j_username: str = Field(default="neo4j", alias="NEO4J_USERNAME")
    neo4j_password: str = Field(default="password", alias="NEO4J_PASSWORD")

    # ── Redis ──
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # ── Celery ──
    celery_broker_url: str = Field(default="redis://localhost:6379/0", alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(default="redis://localhost:6379/1", alias="CELERY_RESULT_BACKEND")

    # ── ChromaDB ──
    chroma_db_path: str = Field(default="./chroma_db", alias="CHROMA_DB_PATH")
    entity_index_path: str = Field(default="./entity_index", alias="ENTITY_INDEX_PATH")

    # ── Entity Resolution Thresholds ──
    er_auto_merge_threshold: float = 0.92
    er_review_threshold: float = 0.75

    # ── Analytics Cache ──
    analytics_cache_ttl: int = 600  # 10 minutes in seconds

    # ── Sentence Transformer Model ──
    sentence_transformer_model: str = "all-MiniLM-L6-v2"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
