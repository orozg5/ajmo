"""Pydantic models for itinerary day and item endpoints."""
from __future__ import annotations

from pydantic import BaseModel, field_validator

from app.constants import VALID_ITEM_TYPES


# ── Request models ─────────────────────────────────────────────────────────────


class PlanDayCreate(BaseModel):
    day_number: int | None = None  # auto-assigned as max + 1 if omitted
    date: str | None = None


class PlanItemCreate(BaseModel):
    item_type: str
    title: str
    notes: str | None = None
    location: str | None = None
    start_time: str | None = None
    sort_order: int | None = None
    ai_data: dict | None = None
    destination_id: str | None = None

    @field_validator("item_type")
    @classmethod
    def validate_item_type(cls, v: str) -> str:
        if v not in VALID_ITEM_TYPES:
            raise ValueError(f"item_type must be one of {sorted(VALID_ITEM_TYPES)}")
        return v


class PlanItemNotesUpdate(BaseModel):
    notes: str | None = None


# ── Response models ────────────────────────────────────────────────────────────


class PlanItemResponse(BaseModel):
    id: str
    plan_id: str
    day_id: str
    item_type: str
    title: str
    notes: str | None = None
    location: str | None = None
    start_time: str | None = None
    sort_order: int | None = None
    ai_data: dict | None = None
    destination_id: str | None = None


class PlanDayWithItemsResponse(BaseModel):
    id: str
    plan_id: str
    day_number: int
    date: str | None = None
    title: str | None = None
    items: list[PlanItemResponse]
