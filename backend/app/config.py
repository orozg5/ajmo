from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str | None = None
    TAVILY_API_KEY: str
    GOOGLE_API_KEY: str
    AI_MODEL: str
    GROQ_API_KEY: str
    FALLBACK_AI_MODEL: str
    AI_PROVIDER_CHAIN_ENRICH: str
    AI_PROVIDER_CHAIN_SUGGESTIONS: str
    AI_PROVIDER_CHAIN_TRANSPORT: str
    OLLAMA_BASE_URL: str
    OLLAMA_MODEL: str
    OLLAMA_KEEP_ALIVE: str
    OLLAMA_NUM_CTX: int
    OLLAMA_REASONING: bool
    GEOCODER_PRIMARY: Literal["photon", "nominatim"]
    GEOCODER_FALLBACK: Literal["photon", "nominatim", ""]
    GEOCODER_USER_AGENT: str
    CORS_ORIGINS: list[str]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()


def chain_for_feature(feature: str) -> list[str]:
    """Resolve the provider chain for a given AI feature.

    Reads settings.AI_PROVIDER_CHAIN_<FEATURE>. Raises ValueError on unknown
    feature names. No global fallback — each feature's chain env is required.
    """
    attr = f"AI_PROVIDER_CHAIN_{feature.upper()}"
    raw = getattr(settings, attr, None)
    if raw is None:
        raise ValueError(f"Unknown AI feature: {feature}")
    return [p.strip().lower() for p in raw.split(",") if p.strip()]
