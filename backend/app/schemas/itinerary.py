"""Pydantic models for itinerary day and item endpoints."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


# ── Request models ─────────────────────────────────────────────────────────────


class PlanDayCreate(BaseModel):
    day_number: Optional[int] = None  # auto-assigned as max + 1 if omitted
    date: Optional[str] = None


class PlanItemCreate(BaseModel):
    item_type: str
    title: str
    notes: Optional[str] = None
    location: Optional[str] = None
    start_time: Optional[str] = None
    estimated_cost: Optional[float] = None
    sort_order: Optional[int] = None
    ai_data: Optional[dict] = None


class PlanItemNotesUpdate(BaseModel):
    notes: Optional[str] = None


# ── Response models ────────────────────────────────────────────────────────────


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
