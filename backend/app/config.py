from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Required — pydantic-settings raises ValidationError at startup if any are missing
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    TAVILY_API_KEY: str
    GOOGLE_API_KEY: str      # required — primary LLM provider
    AI_MODEL: str            # required — primary model name (Gemini model)
    # Optional — fallback when Gemini quota is exhausted
    GROQ_API_KEY: Optional[str] = None
    FALLBACK_AI_MODEL: Optional[str] = None
    # CORS — required; comma-separated list of allowed origins (e.g. http://localhost:3000)
    CORS_ORIGINS: list[str]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


# Module-level singleton — every other module imports this
settings = Settings()
