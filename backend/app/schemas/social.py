"""Pydantic models for social endpoints — friends, plan members, invites,
comments, reactions, ratings, activity."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

PlanRole = Literal["viewer", "editor", "owner"]
InvitableRole = Literal["viewer", "editor"]
FriendshipStatus = Literal["pending", "accepted", "rejected"]
ReactionKind = Literal["like", "dislike", "love", "bookmark"]


class ProfileSummary(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


class FriendshipResponse(BaseModel):
    id: str
    requester_id: str
    addressee_id: str
    status: FriendshipStatus
    created_at: str
    other: ProfileSummary


class FriendRequestCreate(BaseModel):
    username: str = Field(..., min_length=1)


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


class CommentResponse(BaseModel):
    id: str
    plan_id: str
    plan_item_id: str | None = None
    parent_id: str | None = None
    author_id: str | None = None
    body: str
    created_at: str
    updated_at: str
    deleted_at: str | None = None
    author: ProfileSummary | None = None


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    plan_item_id: str | None = None
    parent_id: str | None = None


class CommentUpdate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class ReactionResponse(BaseModel):
    plan_item_id: str
    user_id: str
    kind: ReactionKind
    created_at: str


class ReactionCreate(BaseModel):
    kind: ReactionKind


class RatingResponse(BaseModel):
    plan_item_id: str
    user_id: str
    stars: int = Field(..., ge=1, le=5)
    created_at: str
    updated_at: str


class RatingUpsert(BaseModel):
    stars: int = Field(..., ge=1, le=5)


class ActivityResponse(BaseModel):
    id: str
    plan_id: str
    actor_id: str | None = None
    kind: str
    payload: dict[str, Any] | None = None
    created_at: str
    actor: ProfileSummary | None = None
