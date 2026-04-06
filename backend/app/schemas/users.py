"""Pydantic models for user preferences endpoints."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


# ── Request models ─────────────────────────────────────────────────────────────


class UserPreferencesUpdate(BaseModel):
    user_id: str
    interest_tags: Optional[list[str]] = None
    dietary: Optional[list[str]] = None
    budget: Optional[str] = None
    custom_notes: Optional[str] = None


# ── Response models ────────────────────────────────────────────────────────────


class UserPreferencesResponse(BaseModel):
    user_id: str
    interest_tags: Optional[list[str]] = None
    dietary: Optional[list[str]] = None
    budget: Optional[str] = None
    custom_notes: Optional[str] = None
