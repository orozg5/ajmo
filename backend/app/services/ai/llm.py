import json
import logging
import re

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_ollama import ChatOllama

from app.config import settings

logger = logging.getLogger(__name__)

PROVIDER_LIST = [p.strip() for p in settings.AI_PROVIDER_CHAIN.split(",")]


def strip_markdown_fences(text: str) -> str:
    """Strip ```json ... ``` or ``` ... ``` wrappers the LLM may add."""
    pattern = r"^```(?:json)?\s*\n?(.*?)\n?```\s*$"
    match = re.search(pattern, text.strip(), re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()


def is_quota_error(exc: Exception) -> bool:
    msg = str(exc).upper()
    return (
        "429" in msg
        or "503" in msg
        or "RESOURCE_EXHAUSTED" in msg
        or "RATE_LIMIT" in msg
        or "QUOTA" in msg
    )


def parse_llm_json(raw: str) -> dict:
    """Strip markdown fences and parse JSON from LLM output.

    Raises ValueError if no valid JSON object can be extracted.
    """
    clean = strip_markdown_fences(raw)
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", clean, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError as exc:
                logger.error("LLM returned unparseable JSON. Raw: %s", raw)
                raise ValueError(f"LLM response could not be parsed as JSON: {exc}") from exc
        logger.error("LLM returned no JSON object. Raw: %s", raw)
        raise ValueError("LLM response contained no JSON object")


def build_llm(provider: str, temperature: float):
    """Return the appropriate LangChain chat model for the given provider."""
    provider = provider.lower()
    if provider == "ollama":
        return ChatOllama(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            temperature=temperature,
        )
    elif provider == "gemini":
        return ChatGoogleGenerativeAI(
            model=settings.AI_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=temperature,
            max_retries=0,
        )
    elif provider == "groq":
        if not settings.GROQ_API_KEY or not settings.FALLBACK_AI_MODEL:
            raise RuntimeError("Groq requested but GROQ_API_KEY or FALLBACK_AI_MODEL is not set")
        return ChatGroq(
            model=settings.FALLBACK_AI_MODEL,
            groq_api_key=settings.GROQ_API_KEY,
            temperature=temperature,
        )
    else:
        raise ValueError(f"Unknown AI provider: {provider}")


async def call_llm_with_fallback(
    prompt: str,
    temperature: float,
    model_state: dict | None = None,
) -> str:
    """Try each provider in AI_PROVIDER_CHAIN in order. Fall back on any exception.

    model_state is an optional shared dict {"provider": str}. After a successful
    call the used provider is stored so subsequent calls in the same request
    can skip ahead in the chain.
    """
    tried = []
    start_idx = 0

    if model_state is not None and model_state.get("provider"):
        try:
            start_idx = PROVIDER_LIST.index(model_state["provider"])
        except ValueError:
            start_idx = 0

    for provider in PROVIDER_LIST[start_idx:]:
        tried.append(provider)
        try:
            llm = build_llm(provider, temperature)
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            if model_state is not None:
                model_state["provider"] = provider
            return response.content
        except Exception as exc:
            logger.warning(
                "Provider %s failed (%s: %s) — trying next provider",
                provider,
                type(exc).__name__,
                str(exc)[:100],
            )
            continue

    raise RuntimeError(f"All AI providers failed: {tried}")
