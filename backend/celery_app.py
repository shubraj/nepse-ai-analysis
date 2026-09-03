"""Celery app and beat schedule."""

from celery import Celery
from celery.schedules import crontab

from config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND

app = Celery(
    "merolagani",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["tasks"],
)

app.conf.update(
    timezone="Asia/Kathmandu",
    enable_utc=False,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
)

app.conf.beat_schedule = {
    "sync-and-analyze-all-companies": {
        "task": "tasks.run_all_companies_sync",
        "schedule": crontab(hour=0, minute=0),
    },
    "sync-news": {
        "task": "tasks.sync_news",
        "schedule": crontab(minute=0, hour="*/6"),
    },
}
