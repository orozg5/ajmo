from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Required — pydantic-settings raises ValidationError at startup if any are missing
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    TAVILY_API_KEY: str
    GOOGLE_API_KEY: str
    AI_MODEL: str  # required — always set in .env, never hardcoded

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


# Module-level singleton — every other module imports this
settings = Settings()
