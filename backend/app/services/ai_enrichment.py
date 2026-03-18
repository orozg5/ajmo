import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from supabase import Client, create_client
from tavily import AsyncTavilyClient

from app.config import settings

logger = logging.getLogger(__name__)

# ── Supabase singleton ────────────────────────────────────────────────────────

_supabase_client: Optional[Client] = None


def _get_supabase_client() -> Client:
    """Return a cached Supabase client (service_role — bypasses RLS)."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _supabase_client


# ── Helpers ───────────────────────────────────────────────────────────────────


def build_cache_key(attraction: str, destination: str) -> str:
    """
    Generate a deterministic slug used as the primary key in ai_attraction_cache.
    ("Eiffel Tower", "Paris") → "eiffel-tower-paris"
    """
    raw = f"{attraction} {destination}".lower()
    # Replace any run of non-alphanumeric characters with a single hyphen
    slug = re.sub(r"[^a-z0-9]+", "-", raw)
    return slug.strip("-")


def _strip_markdown_fences(text: str) -> str:
    """Strip ```json ... ``` or ``` ... ``` wrappers the LLM may add."""
    pattern = r"^```(?:json)?\s*\n?(.*?)\n?```\s*$"
    match = re.search(pattern, text.strip(), re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()


# ── Cache layer ───────────────────────────────────────────────────────────────


async def get_cached_attraction(cache_key: str) -> Optional[dict]:
    """
    Return cached data for cache_key if found and not yet expired.
    Uses server-side gt("expires_at") filter so expired rows are skipped cleanly.
    """
    sb = _get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    result = (
        sb.table("ai_attraction_cache")
        .select("data")
        .eq("cache_key", cache_key)
        .gt("expires_at", now_iso)
        .execute()
    )

    if result.data:
        return result.data[0]["data"]
    return None


async def store_attraction_cache(cache_key: str, data: dict) -> None:
    """Upsert enriched data into ai_attraction_cache with a 24-hour TTL."""
    sb = _get_supabase_client()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=24)

    sb.table("ai_attraction_cache").upsert(
        {
            "cache_key": cache_key,
            "data": data,
            "fetched_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }
    ).execute()


# ── Tavily search ─────────────────────────────────────────────────────────────


async def search_attraction(attraction: str, destination: str) -> str:
    """
    Search Tavily for live web data about the attraction.
    Returns a single string of concatenated result snippets for the LLM.
    Raises RuntimeError if no results are returned (guards against empty LLM prompt).
    """
    client = AsyncTavilyClient(api_key=settings.TAVILY_API_KEY)
    query = f"{attraction} {destination} opening hours price address tips"

    response = await client.search(
        query=query,
        search_depth="basic",
        max_results=5,
        include_answer=True,
    )

    results = response.get("results", [])
    if not results:
        raise RuntimeError(f"Tavily returned no results for: {query!r}")

    # Build context: prepend Tavily's own synthesized answer first, then raw snippets
    context_parts: list[str] = []
    if response.get("answer"):
        context_parts.append(response["answer"])
    for r in results:
        if r.get("content"):
            context_parts.append(r["content"])

    return "\n\n".join(context_parts)


# ── LLM enrichment ────────────────────────────────────────────────────────────

_ENRICHMENT_PROMPT = """\
You are a travel information assistant.
Based on the search results below, extract structured information about this attraction.

Attraction: {attraction}
Destination: {destination}

Search results:
{search_context}

Respond with ONLY a valid JSON object (no markdown, no explanation) with exactly these keys:
{{
  "title": "official name of the attraction",
  "description": "2-3 sentence description",
  "address": "full street address or null",
  "opening_hours": "human-readable hours string or null",
  "price": "price range or admission cost string or null",
  "rating": "rating out of 5 as a float or null",
  "image_url": "URL to a representative image or null",
  "tips": ["practical visitor tip 1", "practical visitor tip 2"]
}}
Use null for any field you cannot determine. tips must be a JSON array of strings."""

_REQUIRED_KEYS = {"title", "description", "address", "opening_hours", "price", "rating", "image_url", "tips"}


async def enrich_with_llm(attraction: str, destination: str, search_context: str) -> dict:
    """
    Pass Tavily context to Gemini and extract structured attraction data.
    The model is read from AI_MODEL env var, making it swappable via config.
    """
    # Instantiate the LLM; model and key come from settings — never hardcoded
    llm = ChatGoogleGenerativeAI(
        model=settings.AI_MODEL,
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0,  # deterministic output for structured extraction
    )

    prompt = _ENRICHMENT_PROMPT.format(
        attraction=attraction,
        destination=destination,
        search_context=search_context,
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    raw_text: str = response.content

    # Step 1: strip any markdown fences the model may add despite instructions
    clean_text = _strip_markdown_fences(raw_text)

    # Step 2: attempt JSON parse
    try:
        parsed = json.loads(clean_text)
    except json.JSONDecodeError:
        # Fallback: find the first {...} block anywhere in the response
        match = re.search(r"\{.*\}", clean_text, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group())
            except json.JSONDecodeError as exc:
                logger.error("LLM returned unparseable JSON. Raw: %s", raw_text)
                raise ValueError(f"LLM response could not be parsed as JSON: {exc}") from exc
        else:
            logger.error("LLM returned no JSON object. Raw: %s", raw_text)
            raise ValueError("LLM response contained no JSON object")

    # Ensure all expected keys exist (fill missing optional ones with None)
    for key in _REQUIRED_KEYS:
        parsed.setdefault(key, None)

    return parsed


# ── Orchestrator ──────────────────────────────────────────────────────────────


async def get_attraction_data(attraction: str, destination: str) -> dict:
    """
    Full enrichment pipeline — the only function route handlers should call.

    1. Build a deterministic cache key slug
    2. Return cached data if available and not expired (TTL 24 h)
    3. Search Tavily for live web context
    4. Extract structured JSON via Gemini LLM
    5. Store result in cache (failure is non-fatal — logged as warning)
    6. Return the structured data
    """
    # Step 1: deterministic cache key
    cache_key = build_cache_key(attraction, destination)
    print(cache_key)

    # Step 2: cache check
    cached = await get_cached_attraction(cache_key)
    print(cached)
    if cached is not None:
        logger.info("Cache hit: %s", cache_key)
        return cached

    logger.info("Cache miss: %s — fetching live data", cache_key)

    # Step 3: Tavily web search
    search_context = await search_attraction(attraction, destination)
    print(search_context)

    # Step 4: LLM enrichment
    data = await enrich_with_llm(attraction, destination, search_context)
    print(data)

    # Step 5: store in cache — don't let a write failure break the response
    try:
        await store_attraction_cache(cache_key, data)
    except Exception as exc:
        logger.warning("Cache write failed for key %s: %s", cache_key, exc)

    # Step 6: return enriched data
    return data
