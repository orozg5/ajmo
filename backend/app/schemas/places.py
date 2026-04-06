"""Pydantic models for places and autocomplete endpoints."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


# ── Response models ────────────────────────────────────────────────────────────


class PlaceSuggestionResponse(BaseModel):
    slug: str
    item_type: str
    name: str
    destination: str
    description: Optional[str] = None
    location: Optional[str] = None
    image_url: Optional[str] = None
