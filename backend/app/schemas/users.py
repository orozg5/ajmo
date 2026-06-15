"""Pydantic models for user preferences + profile endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field


class UserPreferencesUpdate(BaseModel):
    interest_tags: list[str] | None = None
    dietary: list[str] | None = None
    budget: str | None = None
    custom_notes: str | None = None


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=80)
    avatar_url: str | None = None
    bio: str | None = Field(None, max_length=400)


class UserPreferencesResponse(BaseModel):
    user_id: str
    interest_tags: list[str] | None = None
    dietary: list[str] | None = None
    budget: str | None = None
    custom_notes: str | None = None


class ProfileResponse(BaseModel):
    id: str
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
