"""Pydantic models for user preferences endpoints."""
from __future__ import annotations

from pydantic import BaseModel


# ── Request models ─────────────────────────────────────────────────────────────


class UserPreferencesUpdate(BaseModel):
    interest_tags: list[str] | None = None
    dietary: list[str] | None = None
    budget: str | None = None
    custom_notes: str | None = None


# ── Response models ────────────────────────────────────────────────────────────


class UserPreferencesResponse(BaseModel):
    user_id: str
    interest_tags: list[str] | None = None
    dietary: list[str] | None = None
    budget: str | None = None
    custom_notes: str | None = None
