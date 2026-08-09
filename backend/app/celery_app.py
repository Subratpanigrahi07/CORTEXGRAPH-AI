"""
Celery application configuration for CortexGraph Phase 2.
Broker: Redis. Result backend: Redis.
"""

from celery import Celery
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "cortexgraph",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task tracking
    task_track_started=True,
    result_extended=True,

    # Task routing
    task_routes={
        "app.tasks.pipeline.*": {"queue": "pipeline"},
        "app.tasks.periodic.*": {"queue": "periodic"},
    },

    # Default queue for unrouted tasks
    task_default_queue="default",

    # Beat schedule (periodic tasks)
    beat_schedule={
        "detect-contradictions-every-15min": {
            "task": "app.tasks.periodic.detect_contradictions",
            "schedule": 900.0,  # 15 minutes
        },
        "recompute-analytics-every-10min": {
            "task": "app.tasks.periodic.recompute_analytics",
            "schedule": 600.0,  # 10 minutes
        },
    },

    # Worker settings
    worker_prefetch_multiplier=1,  # Don't prefetch — agent tasks are heavy
    task_acks_late=True,           # Ack after completion for crash safety
)

# Auto-discover tasks in these modules
celery_app.autodiscover_tasks(["app.tasks"])
