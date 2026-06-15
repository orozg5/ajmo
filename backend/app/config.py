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
    OLLAMA_BASE_URL: str
    OLLAMA_MODEL: str
    OLLAMA_KEEP_ALIVE: str
    OLLAMA_NUM_CTX: int
    OLLAMA_REASONING: bool
    OLLAMA_REPEAT_PENALTY: float
    GEOCODER_USER_AGENT: str
    PEXELS_API_KEY: str
    CORS_ORIGINS: list[str]
    COLLAB_SHARED_SECRET: str
    YJS_IDLE_MS: int

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()


def chain_for_feature(feature: str) -> list[str]:
    """Reads settings.AI_PROVIDER_CHAIN_<FEATURE>; raises ValueError on unknown feature names — no global fallback."""
    attr = f"AI_PROVIDER_CHAIN_{feature.upper()}"
    raw = getattr(settings, attr, None)
    if raw is None:
        raise ValueError(f"Unknown AI feature: {feature}")
    return [p.strip().lower() for p in raw.split(",") if p.strip()]
