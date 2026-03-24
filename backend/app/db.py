"""Supabase client singleton for the Ajmo backend.

All services import get_supabase_client() from here.
Never call create_client() directly in service files.
"""
from typing import Optional

from supabase import Client, create_client

from app.config import settings

_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """Return a cached Supabase client (service_role — bypasses RLS)."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _supabase_client
