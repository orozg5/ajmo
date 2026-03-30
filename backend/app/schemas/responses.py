"""Pydantic response models for all API endpoints.

Route handlers declare these as their return type annotation so FastAPI
generates correct OpenAPI schemas and validates outgoing data.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel


# ── Enrichment ────────────────────────────────────────────────────────────────


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


# ── Places ────────────────────────────────────────────────────────────────────


class PlaceSuggestionResponse(BaseModel):
    slug: str
    item_type: str
    name: str
    destination: str
    description: Optional[str] = None
    location: Optional[str] = None
    image_url: Optional[str] = None


# ── Plans ─────────────────────────────────────────────────────────────────────


class PlanResponse(BaseModel):
    id: str
    owner_id: str
    title: str
    description: Optional[str] = None
    destination: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    is_public: bool
    cover_image_url: Optional[str] = None
    yjs_state: None = None  # never expose binary CRDT to API consumers
    created_at: str


# ── Itinerary ─────────────────────────────────────────────────────────────────


class PlanItemResponse(BaseModel):
    id: str
    plan_id: str
    day_id: str
    item_type: str
    title: str
    notes: Optional[str] = None
    location: Optional[str] = None
    start_time: Optional[str] = None
    estimated_cost: Optional[float] = None
    sort_order: Optional[int] = None
    ai_data: Optional[dict] = None


class PlanDayWithItemsResponse(BaseModel):
    id: str
    plan_id: str
    day_number: int
    date: Optional[str] = None
    title: Optional[str] = None
    items: list[PlanItemResponse]
