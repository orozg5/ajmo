"""Pydantic models for AI enrichment and suggestion endpoints."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.constants import validate_item_type


# ── Request models ─────────────────────────────────────────────────────────────


class EnrichRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Name of the item")
    destination: str = Field(..., min_length=1, max_length=120, description="City or country")
    item_type: str = Field(..., description="One of: attraction, restaurant, hotel, transport, activity")

    @field_validator("item_type")
    @classmethod
    def check_item_type(cls, v: str) -> str:
        return validate_item_type(v)


class EnrichBatchRequest(BaseModel):
    items: list[EnrichRequest] = Field(..., min_length=1, max_length=5)


class SuggestionsRequest(BaseModel):
    plan_id: str = Field(..., description="UUID of the plan")
    force_refresh: bool = Field(False, description="Skip cache and generate fresh suggestions")
    exclude_names: list[str] = Field(default_factory=list, description="Names already shown or added")


class NextSuggestionRequest(BaseModel):
    plan_id: str = Field(..., description="UUID of the plan")
    exclude_names: list[str] = Field(default_factory=list, description="Names already shown or added")
    exclude_slugs: list[str] = Field(
        default_factory=list,
        description="Canonical slugs already shown — guards against alias collisions",
    )


class CrossCityTransportRequest(BaseModel):
    plan_id: str = Field(..., description="UUID of the plan")


TransportMode = Literal["drive", "train", "bus", "ferry", "flight"]


class TransportOption(BaseModel):
    """A single cross-city transport option resolved from a real routing source.

    `is_estimate=True` means the duration came from the haversine + cruise-speed
    estimator (flight only); the UI shows an explicit "estimate" chip in that case.
    `transit_summary` is a short carrier label like "ICE 100 + Bus 232" that
    Transitous attaches to train/bus/ferry results.
    """
    mode: TransportMode
    name: str
    duration_seconds: int | None = None
    distance_meters: int | None = None
    is_estimate: bool = False
    transit_summary: str | None = None
    geometry: list[list[float]] | None = None


class TransportSuggestionItem(BaseModel):
    source_item_id: str | None = None
    source_item_title: str | None = None
    source_item_location: str | None = None
    source_destination_id: str | None = None
    destination_item_id: str | None = None
    destination_item_title: str | None = None
    destination_item_location: str | None = None
    destination_destination_id: str | None = None
    scope: str | None = None
    source_day_number: int | None = None
    destination_day_number: int | None = None
    source_city: str | None = None
    destination_city: str | None = None
    source_country: str | None = None
    destination_country: str | None = None
    options: list[TransportOption] = Field(default_factory=list)


class TransportSuggestionsResponse(BaseModel):
    suggestions: list[TransportSuggestionItem]


# ── Response models ────────────────────────────────────────────────────────────


class EnrichedItemResponse(BaseModel):
    # Stable fields (always present after enrichment)
    place_id: str | None = None
    canonical_name: str | None = None
    description: str | None = None
    location: str | None = None
    image_url: str | None = None
    lat: float | None = None
    lng: float | None = None
    timezone: str | None = None
    categories: list[str] | None = None

    # Per-type fresh fields — all optional so one model covers all five types
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


class AiSuggestionItemResponse(BaseModel):
    name: str
    item_type: str
    one_line: str | None = None
    price_hint: str | None = None
    cached: bool = False
    slug: str | None = None
    destination_city: str | None = None
    enriched: EnrichedItemResponse | None = None


class AiSuggestionsResponse(BaseModel):
    suggestions: list[AiSuggestionItemResponse]
