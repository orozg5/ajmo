import logging
import re
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
    image_url: str | None = Field(default=None, description="Direct URL to a representative image.")

    opening_hours: str | None = None
    price_range: str | None = None
    tips: list[str] | None = None

    cuisine: str | None = None
    reservation_tips: str | None = None

    amenities: list[str] | None = None
    check_in_time: str | None = None
    booking_tips: str | None = None

    schedule: str | None = None

    duration: str | None = None

    categories: list[str] | None = None


# ── Suggestions ──────────────────────────────────────────────────────────────


class SuggestionItem(BaseModel):
    name: str
    item_type: Literal["attraction", "restaurant", "hotel", "transport", "activity"]
    destination_city: str | None = None
    one_line: str | None = Field(default=None, max_length=60)
    price_hint: str | None = None


class SuggestionsResponse(BaseModel):
    suggestions: list[SuggestionItem]


# ── Transport ────────────────────────────────────────────────────────────────


class LlmTransportOption(BaseModel):
    name: str = Field(
        description=(
            "Specific mode and operator, e.g. 'Amtrak Northeast Regional', 'Flight', "
            "'Walk', 'Metro Line 1', 'Uber'."
        )
    )
    one_line: str = Field(
        max_length=60,
        description="Duration + cost summary, e.g. '3h 30min · ~$89 · Direct'.",
    )
    price_hint: str | None = Field(default=None, description="Rough cost: '~$89', 'Free', '€€'.")


# Word-boundary anchors so "city bus" doesn't false-match inside "intercity bus".
INTERCITY_FORBIDDEN_PATTERN = re.compile(
    r"\b(?:walk|metro|city bus|rideshare|uber|lyft|bolt|tram)\b",
    re.IGNORECASE,
)


class TransportSuggestion(BaseModel):
    pair_index: int
    scope: Literal["same_day", "same_day_cross_city", "cross_city"]
    options: list[LlmTransportOption] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def filter_incompatible_options(self) -> "TransportSuggestion":
        """Drop intra-city modes from cross-city scopes instead of failing the whole response.

        The LLM occasionally picks local rideshare brands (Bolt/Uber/Lyft) for intercity
        pairs. Stripping them preserves the valid options and lets the rest of the
        suggestions reach the client.
        """
        if self.scope in {"cross_city", "same_day_cross_city"}:
            original_count = len(self.options)
            self.options = [
                opt for opt in self.options
                if not INTERCITY_FORBIDDEN_PATTERN.search(opt.name)
            ]
            dropped = original_count - len(self.options)
            if dropped > 0:
                logger.warning(
                    "Filtered %d intra-city option(s) from scope=%s suggestion",
                    dropped, self.scope,
                )
        return self


class TransportResponse(BaseModel):
    suggestions: list[TransportSuggestion]
