"""Pydantic models for places and autocomplete endpoints."""
from __future__ import annotations

from pydantic import BaseModel


class PlaceSuggestionResponse(BaseModel):
    slug: str
    item_type: str
    name: str
    destination: str
    description: str | None = None
    location: str | None = None
    image_url: str | None = None
