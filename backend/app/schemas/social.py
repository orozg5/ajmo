"""Pydantic models for social endpoints — friends, plan members, invites."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PlanRole = Literal["viewer", "editor", "owner"]
InvitableRole = Literal["viewer", "editor"]
FriendshipStatus = Literal["pending", "accepted", "rejected"]


class ProfileSummary(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


# ── Friendships ──────────────────────────────────────────────────────────────


class FriendshipResponse(BaseModel):
    id: str
    requester_id: str
    addressee_id: str
    status: FriendshipStatus
    created_at: str
    # The other party from the current user's perspective. The frontend renders
    # this without needing to know which side the user is on.
    other: ProfileSummary


class FriendRequestCreate(BaseModel):
    username: str = Field(..., min_length=1)


# ── Plan members ─────────────────────────────────────────────────────────────


class PlanMemberResponse(BaseModel):
    plan_id: str
    user_id: str
    role: PlanRole
    joined_at: str
    profile: ProfileSummary


class PlanMemberUpdate(BaseModel):
    role: PlanRole


class PlanMemberCreate(BaseModel):
    user_id: str
    role: InvitableRole = "viewer"


# ── Plan invites ─────────────────────────────────────────────────────────────


class PlanInviteResponse(BaseModel):
    id: str
    plan_id: str
    token: str
    role: PlanRole
    expires_at: str | None = None
    max_uses: int | None = None
    uses: int
    created_by: str | None = None
    created_at: str


class PlanInviteCreate(BaseModel):
    role: InvitableRole = "viewer"
    expires_in_hours: int | None = Field(None, ge=1, le=24 * 365)
    max_uses: int | None = Field(None, ge=1)


class InviteAcceptResponse(BaseModel):
    plan_id: str
    role: PlanRole
