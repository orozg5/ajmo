"""Pydantic models for storage signed-upload endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field


class PlanCoverSignedRequest(BaseModel):
    filename: str | None = Field(None, description="Original filename (used to infer extension)")


class UserAvatarSignedRequest(BaseModel):
    filename: str | None = Field(None, description="Original filename (used to infer extension)")


class SignedUploadResponse(BaseModel):
    bucket: str
    path: str
    signed_url: str
    token: str | None = None
    public_url: str
