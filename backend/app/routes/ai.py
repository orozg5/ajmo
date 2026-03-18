import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.ai_enrichment import get_attraction_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class AttractionRequest(BaseModel):
    attraction: str = Field(..., min_length=1, description="Name of the attraction")
    destination: str = Field(..., min_length=1, description="City or country")


@router.post("/attraction")
async def enrich_attraction(body: AttractionRequest) -> dict:
    """
    Enrich an attraction with live AI-generated data.
    Checks the 24-hour cache first; falls back to Tavily + Gemini on a miss.
    Auth will be added in a future iteration.
    """
    try:
        return await get_attraction_data(body.attraction, body.destination)
    except RuntimeError as exc:
        # Tavily returned no results
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        # LLM returned unparseable JSON
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error in enrichment pipeline")
        raise HTTPException(status_code=500, detail="Enrichment pipeline failed")
