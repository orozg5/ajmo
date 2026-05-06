"""Shared test setup.

Sets all required env vars BEFORE `app.config` is imported anywhere. The
`Settings()` instance in `app/config.py` is constructed at import time and
will raise if any required field is missing.
"""
import os

os.environ.setdefault("SUPABASE_URL", "http://test-supabase")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("TAVILY_API_KEY", "test-tavily")
os.environ.setdefault("GOOGLE_API_KEY", "test-google")
os.environ.setdefault("AI_MODEL", "test-gemini-model")
os.environ.setdefault("GROQ_API_KEY", "test-groq")
os.environ.setdefault("FALLBACK_AI_MODEL", "test-groq-model")
os.environ.setdefault("AI_PROVIDER_CHAIN_ENRICH", "ollama")
os.environ.setdefault("AI_PROVIDER_CHAIN_SUGGESTIONS", "ollama")
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")
os.environ.setdefault("OLLAMA_MODEL", "test-ollama-model")
os.environ.setdefault("OLLAMA_KEEP_ALIVE", "30m")
os.environ.setdefault("OLLAMA_NUM_CTX", "4096")
os.environ.setdefault("OLLAMA_REASONING", "false")
os.environ.setdefault("OLLAMA_REPEAT_PENALTY", "1.15")
os.environ.setdefault("GEOCODER_USER_AGENT", "ajmo-test/contact@example.com")
os.environ.setdefault("PEXELS_API_KEY", "test-pexels")
os.environ.setdefault("CORS_ORIGINS", "[]")


def make_item(
    item_id: str | None,
    title: str,
    destination_id: str | None,
    sort_order: int = 0,
    item_type: str = "attraction",
    ai_data: dict | None = None,
) -> dict:
    return {
        "id": item_id,
        "title": title,
        "destination_id": destination_id,
        "sort_order": sort_order,
        "item_type": item_type,
        "ai_data": ai_data,
        "location": None,
    }


def make_day(day_id: str, day_number: int, items: list[dict]) -> dict:
    return {"id": day_id, "day_number": day_number, "items": list(items)}


def make_destination(
    dest_id: str,
    city: str,
    country: str,
    days: list[int] | None = None,
    sort_order: int = 0,
) -> dict:
    return {
        "id": dest_id,
        "city": city,
        "country": country,
        "days": list(days or []),
        "sort_order": sort_order,
    }
