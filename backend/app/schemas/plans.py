"""Pydantic models for plan CRUD endpoints."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


# ── Request models ─────────────────────────────────────────────────────────────


class PlanCreate(BaseModel):
    owner_id: str = Field(..., description="UUID of the plan owner")
    title: str = Field(..., min_length=1, description="Plan title")
    description: str | None = None
    destination: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    is_public: bool = False
    cover_image_url: str | None = None


class PlanUpdate(BaseModel):
    title: str | None = Field(None, min_length=1)
    description: str | None = None
    destination: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    is_public: bool | None = None
    cover_image_url: str | None = None


# ── Response models ────────────────────────────────────────────────────────────


class PlanResponse(BaseModel):
    id: str
    owner_id: str
    title: str
    description: str | None = None
    destination: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    is_public: bool
    cover_image_url: str | None = None
    yjs_state: None = None  # never expose binary CRDT to API consumers
    created_at: str
