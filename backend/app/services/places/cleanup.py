import asyncio
import logging
from datetime import datetime, timezone

from app.db import get_supabase_client

logger = logging.getLogger(__name__)

_CLEANUP_INTERVAL_HOURS = 6


async def _delete_expired_cache_rows() -> None:
    supabase = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("ai_attraction_cache")
        .delete()
        .lt("expires_at", now_iso)
        .execute()
    )
    count = len(result.data) if result.data else 0
    logger.info("Cache cleanup: deleted %d expired ai_attraction_cache rows", count)


async def _run_cleanup_loop() -> None:
    while True:
        await _delete_expired_cache_rows()
        await asyncio.sleep(_CLEANUP_INTERVAL_HOURS * 3600)


async def start_cache_cleanup() -> None:
    """Register as a FastAPI startup handler to run cache cleanup in the background."""
    asyncio.create_task(_run_cleanup_loop())
