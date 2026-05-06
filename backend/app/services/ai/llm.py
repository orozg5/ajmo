import logging
from collections.abc import AsyncIterator
from typing import TypeVar

from langchain_core.output_parsers import PydanticOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_ollama import ChatOllama
from pydantic import BaseModel

from app.config import chain_for_feature, settings

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)


def is_quota_error(exc: Exception) -> bool:
    msg = str(exc).upper()
    return (
        "429" in msg
        or "503" in msg
        or "RESOURCE_EXHAUSTED" in msg
        or "RATE_LIMIT" in msg
        or "QUOTA" in msg
    )


def build_llm(provider: str, temperature: float, max_tokens: int):
    """Return a LangChain chat model for the given provider, tuned for speed.

    Ollama receives dev-tuning kwargs (num_predict, num_ctx, keep_alive,
    reasoning) sourced from settings. Gemini and Groq receive provider-native
    token caps.
    """
    provider = provider.lower()
    if provider == "ollama":
        return ChatOllama(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            temperature=temperature,
            num_predict=max_tokens,
            num_ctx=settings.OLLAMA_NUM_CTX,
            keep_alive=settings.OLLAMA_KEEP_ALIVE,
            reasoning=settings.OLLAMA_REASONING,
            repeat_penalty=settings.OLLAMA_REPEAT_PENALTY,
        )
    if provider == "gemini":
        # Gemini 2.5 series spends "thinking" tokens against max_output_tokens
        # before the final answer is emitted, which truncated structured-output
        # JSON mid-field at our cap. We don't need reasoning for fact-extraction
        # from search results, so disable it — also makes responses faster.
        return ChatGoogleGenerativeAI(
            model=settings.AI_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=temperature,
            max_output_tokens=max_tokens,
            max_retries=0,
            thinking_budget=0,
        )
    if provider == "groq":
        if not settings.GROQ_API_KEY or not settings.FALLBACK_AI_MODEL:
            raise RuntimeError("Groq requested but GROQ_API_KEY or FALLBACK_AI_MODEL is not set")
        return ChatGroq(
            model=settings.FALLBACK_AI_MODEL,
            groq_api_key=settings.GROQ_API_KEY,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    raise ValueError(f"Unknown AI provider: {provider}")


def bind_structured(llm, provider: str, schema: type[ModelT], prompt: str):
    """Return (structured_llm, effective_prompt) tuned to the provider.

    Ollama's JSON-schema grammar constraint (method='json_schema') is unreliable
    for several model families (e.g. Nemotron_h): the model ignores the bound
    schema and emits YAML-like prose, and the downstream Pydantic parser then
    raises OutputParserException. The simpler format='json' constraint
    (method='json_mode') is honored across all families, so we use it for
    Ollama and append PydanticOutputParser.get_format_instructions() to the
    prompt so the model still knows the required shape. Gemini/Groq use
    tool-calling by default, which is reliable — leave them alone.
    """
    if provider == "ollama":
        parser = PydanticOutputParser(pydantic_object=schema)
        effective_prompt = f"{prompt}\n\n{parser.get_format_instructions()}"
        return llm.with_structured_output(schema, method="json_mode"), effective_prompt
    return llm.with_structured_output(schema), prompt


async def call_structured(
    feature: str,
    schema: type[ModelT],
    prompt: str,
    temperature: float,
    max_tokens: int,
    *,
    provider_override: str | None = None,
) -> ModelT:
    """Invoke an LLM with structured output for a given feature.

    Walks the provider chain for `feature`. Returns a validated `schema`
    instance. Falls back to the next provider only on quota errors. Validation
    errors (Pydantic ValidationError) and other structural problems propagate
    immediately — masking them would hide schema mismatches.

    `provider_override` bypasses the feature chain and pins one provider — used
    by callers that need an explicit cloud-LLM retry when the chained provider
    succeeds technically but produces unusable output (e.g. a small local model
    regurgitating excluded names in suggestions).
    """
    chain = [provider_override] if provider_override else chain_for_feature(feature)
    tried: list[str] = []

    for provider in chain:
        tried.append(provider)
        try:
            llm = build_llm(provider, temperature, max_tokens)
            structured_llm, effective_prompt = bind_structured(llm, provider, schema, prompt)
            result = await structured_llm.ainvoke(effective_prompt)
            return result
        except Exception as exc:
            if is_quota_error(exc):
                logger.warning(
                    "Provider %s hit quota for feature=%s — trying next", provider, feature
                )
                continue
            logger.exception("Provider %s failed for feature=%s", provider, feature)
            raise

    raise RuntimeError(f"All AI providers failed for feature={feature}: {tried}")


async def stream_structured(
    feature: str,
    schema: type[ModelT],
    prompt: str,
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[ModelT]:
    """Async-iterate partial Pydantic instances as the LLM streams.

    Uses the first provider in the feature's chain. Mid-stream provider fallback
    is not supported — a stream is committed to its provider once begun.
    The final yielded value is the complete result. Callers that need true
    streaming should diff successive partials; callers that want a blocking
    return should keep the last yielded value.
    """
    chain = chain_for_feature(feature)
    provider = chain[0]
    llm = build_llm(provider, temperature, max_tokens)
    structured_llm, effective_prompt = bind_structured(llm, provider, schema, prompt)
    async for chunk in structured_llm.astream(effective_prompt):
        yield chunk
