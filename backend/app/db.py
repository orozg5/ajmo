"""Supabase client singleton for the Ajmo backend.

All services import get_supabase_client() from here.
Never call create_client() directly in service files.
"""
from supabase import Client, create_client

from app.config import settings

supabase_client: Client | None = None


def get_supabase_client() -> Client:
    """Return a cached Supabase client (service_role — bypasses RLS)."""
    global supabase_client
    if supabase_client is None:
        supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return supabase_client
