import json
import logging
import re

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq

from app.config import settings

logger = logging.getLogger(__name__)


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


async def call_llm_with_fallback(
    prompt: str,
    temperature: float,
    model_state: dict | None = None,
) -> str:
    """Invoke the primary LLM (Gemini) and fall back to Groq on quota errors.

    model_state is an optional shared dict {"use_fallback": bool}. When Gemini
    fails with a quota error the flag is set to True so subsequent calls in the
    same request skip Gemini entirely and go straight to Groq.

    Returns the raw text content of the response.
    """
    groq_available = bool(settings.GROQ_API_KEY and settings.FALLBACK_AI_MODEL)
    skip_primary = model_state is not None and model_state.get("use_fallback", False)

    if not skip_primary:
        llm = ChatGoogleGenerativeAI(
            model=settings.AI_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=temperature,
            max_retries=0,  # fail fast — our fallback handles retries
        )
        try:
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            return response.content
        except Exception as exc:
            if is_quota_error(exc) and groq_available:
                logger.warning("Gemini unavailable (%s) — retrying with Groq fallback", type(exc).__name__)
                if model_state is not None:
                    model_state["use_fallback"] = True
            else:
                raise

    if not groq_available:
        raise RuntimeError("Gemini failed and no Groq fallback is configured")

    fallback_llm = ChatGroq(
        model=settings.FALLBACK_AI_MODEL,
        groq_api_key=settings.GROQ_API_KEY,
        temperature=temperature,
    )
    response = await fallback_llm.ainvoke([HumanMessage(content=prompt)])
    return response.content
