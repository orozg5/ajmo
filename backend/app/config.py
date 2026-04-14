from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    TAVILY_API_KEY: str
    GOOGLE_API_KEY: str
    AI_MODEL: str
    GROQ_API_KEY: str | None = None
    FALLBACK_AI_MODEL: str | None = None
    AI_PROVIDER_CHAIN: str = "ollama,gemini,groq"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "nemotron-3-nano:4b"
    CORS_ORIGINS: list[str]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


# Module-level singleton — every other module imports this
settings = Settings()
