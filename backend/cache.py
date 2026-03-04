"""Redis cache for API responses."""

import json
import logging
from typing import Any

from config import CACHE_KEY_PREFIX, CACHE_REDIS_URL, CACHE_TTL_SECONDS

logger = logging.getLogger(__name__)

_redis = None


def _client():
    global _redis
    if _redis is None:
        try:
            import redis
            _redis = redis.from_url(CACHE_REDIS_URL, decode_responses=True)
            _redis.ping()
        except Exception as e:
            logger.warning("Redis cache unavailable: %s", e)
            _redis = False
    return _redis if _redis else None


def _key(*parts: str) -> str:
    return CACHE_KEY_PREFIX + ":".join(parts)


def get(key: str) -> Any | None:
    """Return cached value or None."""
    client = _client()
    if not client:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.debug("Cache get error %s: %s", key, e)
        return None


def set(key: str, value: Any, ttl: int | None = None) -> None:
    """Store value with TTL. No-op if Redis unavailable."""
    client = _client()
    if not client:
        return
    ttl = ttl if ttl is not None else CACHE_TTL_SECONDS
    try:
        client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.debug("Cache set error %s: %s", key, e)


def delete(key: str) -> None:
    """Remove one key."""
    client = _client()
    if client:
        try:
            client.delete(key)
        except Exception:
            pass


def delete_pattern(pattern: str) -> None:
    """Remove keys matching pattern."""
    client = _client()
    if not client:
        return
    try:
        keys = list(client.scan_iter(match=pattern, count=500))
        if keys:
            client.delete(*keys)
    except Exception as e:
        logger.debug("Cache delete_pattern error %s: %s", pattern, e)


def invalidate_all() -> None:
    """Remove all API cache keys (call after sync)."""
    pattern = f"{CACHE_KEY_PREFIX}*"
    client = _client()
    if not client:
        return
    try:
        keys = list(client.scan_iter(match=pattern, count=500))
        if keys:
            client.delete(*keys)
            logger.info("Cache invalidated: %d keys removed", len(keys))
    except Exception as e:
        logger.warning("Cache invalidate_all error: %s", e)
