import os

from dotenv import load_dotenv

# Load .env from the backend root (where uvicorn is launched from)
load_dotenv()


class Settings:
    # Required — raise KeyError at startup if any are missing
    SUPABASE_URL: str = os.environ["SUPABASE_URL"]
    SUPABASE_SERVICE_ROLE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    TAVILY_API_KEY: str = os.environ["TAVILY_API_KEY"]
    GOOGLE_API_KEY: str = os.environ["GOOGLE_API_KEY"]

    # Configurable — defaults to gemini-2.0-flash if not set
    AI_MODEL: str = os.getenv("AI_MODEL", "gemini-2.0-flash")


# Module-level singleton — every other module imports this
settings = Settings()
