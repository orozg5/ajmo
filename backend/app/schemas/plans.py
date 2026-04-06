"""Pydantic models for plan CRUD endpoints."""
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


# ── Request models ─────────────────────────────────────────────────────────────


class PlanCreate(BaseModel):
    owner_id: str = Field(..., description="UUID of the plan owner")
    title: str = Field(..., min_length=1, description="Plan title")
    description: Optional[str] = None
    destination: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    is_public: bool = False
    cover_image_url: Optional[str] = None


class PlanUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    destination: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    is_public: Optional[bool] = None
    cover_image_url: Optional[str] = None


# ── Response models ────────────────────────────────────────────────────────────


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
