import logging
from typing import Literal

from pydantic import BaseModel, Field, model_validator

logger = logging.getLogger(__name__)


# ── Enrichment ───────────────────────────────────────────────────────────────


class EnrichmentResponse(BaseModel):
    """Structured output for /ai/enrich. All per-type volatile fields are optional."""

    canonical_name: str = Field(
        description="Official full name of this place (e.g. 'Hilton Paris Opera' not 'Hilton')."
    )
    description: str = Field(description="Short traveler-facing description.")
    location: str = Field(
        description=(
            "Specific street address with number OR precise named area within the city. "
            "Never just a city name."
        )
    )

    opening_hours: str | None = None
    price_range: str | None = None
    tips: list[str] | None = Field(default=None, max_length=10)

    cuisine: str | None = None
    reservation_tips: str | None = None

    amenities: list[str] | None = Field(default=None, max_length=10)
    check_in_time: str | None = None
    booking_tips: str | None = None

    schedule: str | None = None

    duration: str | None = None

    categories: list[str] | None = Field(default=None, max_length=10)


# ── Suggestions ──────────────────────────────────────────────────────────────


SUGGESTION_ITEM_TYPES = ("attraction", "restaurant", "activity")


class SuggestionItem(BaseModel):
    name: str
    item_type: Literal["attraction", "restaurant", "activity"]
    destination_city: str | None = None
    one_line: str | None = None
    price_hint: str | None = None


class SuggestionsResponse(BaseModel):
    suggestions: list[SuggestionItem]

    @model_validator(mode="before")
    @classmethod
    def drop_unsupported_types(cls, values):
        """Filter hotel/transport before per-item validation.

        The strip only shows attractions, restaurants, activities — hotels and
        transport have their own dedicated UX. If the LLM (especially a small
        local model) volunteers a hotel anyway, drop it silently rather than
        failing the whole batch.
        """
        if isinstance(values, dict):
            raw = values.get("suggestions") or []
            values["suggestions"] = [
                item for item in raw
                if isinstance(item, dict) and item.get("item_type") in SUGGESTION_ITEM_TYPES
            ]
        return values


