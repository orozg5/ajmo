"""Pydantic models for plan CRUD endpoints."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

PlanVisibility = Literal["private", "link", "friends", "public"]


class PlanCreate(BaseModel):
    owner_id: str | None = Field(None, description="UUID of the plan owner; injected from JWT by the route handler")
    title: str = Field(..., min_length=1, description="Plan title")
    description: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    visibility: PlanVisibility = "private"
    cover_image_path: str | None = None
    cover_image_url: str | None = None


class PlanUpdate(BaseModel):
    title: str | None = Field(None, min_length=1)
    description: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    visibility: PlanVisibility | None = None
    cover_image_path: str | None = None
    cover_image_url: str | None = None


class DestinationSummary(BaseModel):
    id: str
    city: str
    country: str
    sort_order: int


class PlanResponse(BaseModel):
    id: str
    owner_id: str
    title: str
    description: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    visibility: PlanVisibility
    cover_image_path: str | None = None
    cover_image_url: str | None = None
    yjs_state: None = None
    created_at: str
    destinations: list[DestinationSummary] | None = None
