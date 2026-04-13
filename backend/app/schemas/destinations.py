"""Pydantic schemas for plan destination endpoints."""
from __future__ import annotations

from pydantic import BaseModel


# ── Request models ─────────────────────────────────────────────────────────────


class DestinationCreate(BaseModel):
    country: str
    city: str
    sort_order: int = 0
    day_numbers: list[int] = []


# ── Response models ────────────────────────────────────────────────────────────


class DestinationResponse(BaseModel):
    id: str
    plan_id: str
    country: str
    city: str
    sort_order: int
    days: list[int]
    created_at: str
