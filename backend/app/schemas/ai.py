"""Pydantic models for AI enrichment and suggestion endpoints."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.constants import VALID_ITEM_TYPES


# ── Request models ─────────────────────────────────────────────────────────────


class EnrichRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Name of the item")
    destination: str = Field(..., min_length=1, description="City or country")
    item_type: str = Field(..., description="One of: attraction, restaurant, hotel, transport, activity")

    @field_validator("item_type")
    @classmethod
    def validate_item_type(cls, v: str) -> str:
        if v not in VALID_ITEM_TYPES:
            raise ValueError(f"item_type must be one of {sorted(VALID_ITEM_TYPES)}")
        return v


class EnrichBatchRequest(BaseModel):
    items: list[EnrichRequest] = Field(..., min_length=1, max_length=5)


class SuggestionsRequest(BaseModel):
    plan_id: str = Field(..., description="UUID of the plan")
    user_id: str = Field(..., description="UUID of the user (for preferences lookup)")
    force_refresh: bool = Field(False, description="Skip cache and generate fresh suggestions")
    exclude_names: list[str] = Field(default_factory=list, description="Names already shown or added")


class NextSuggestionRequest(BaseModel):
    plan_id: str = Field(..., description="UUID of the plan")
    user_id: str = Field(..., description="UUID of the user (for preferences lookup)")
    exclude_names: list[str] = Field(default_factory=list, description="Names already shown or added")


# ── Response models ────────────────────────────────────────────────────────────


class EnrichedItemResponse(BaseModel):
    # Stable fields (always present after enrichment)
    canonical_name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    image_url: Optional[str] = None

    # Per-type fresh fields — all optional so one model covers all five types
    opening_hours: Optional[str] = None
    price_range: Optional[str] = None
    tips: Optional[list[str]] = None
    cuisine: Optional[str] = None
    reservation_tips: Optional[str] = None
    amenities: Optional[list[str]] = None
    check_in_time: Optional[str] = None
    booking_tips: Optional[str] = None
    schedule: Optional[str] = None
    duration: Optional[str] = None


class AiSuggestionItem(BaseModel):
    name: str
    item_type: str
    one_line: Optional[str] = None
    price_hint: Optional[str] = None
    cached: bool = False
    slug: Optional[str] = None


class AiSuggestionsResponse(BaseModel):
    suggestions: list[AiSuggestionItem]
