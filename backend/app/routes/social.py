"""Routes for friendships, plan members, plan invites, comments, reactions,
ratings, activity, and the invite redeem endpoint.

Routers exported from this file (different URL prefixes):

- friends_router         → /social/...
- plan_members_router    → /plans/{plan_id}/members
- plan_invites_router    → /plans/{plan_id}/invites
- plan_comments_router   → /plans/{plan_id}/comments
- plan_reactions_router  → /plans/{plan_id}/reactions and /plans/{plan_id}/items/{item_id}/reactions
- plan_ratings_router    → /plans/{plan_id}/ratings   and /plans/{plan_id}/items/{item_id}/rating
- plan_activity_router   → /plans/{plan_id}/activity
- invite_router          → /invite/{token}/accept
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth import get_current_user
from app.schemas.social import (
    ActivityResponse,
    CommentCreate,
    CommentResponse,
    CommentUpdate,
    FriendRequestCreate,
    FriendshipResponse,
    InviteAcceptResponse,
    PlanInviteCreate,
    PlanInviteResponse,
    PlanMemberCreate,
    PlanMemberResponse,
    PlanMemberUpdate,
    ProfileSummary,
    RatingResponse,
    RatingUpsert,
    ReactionCreate,
    ReactionKind,
    ReactionResponse,
)
from app.services.social.activity import list_activity
from app.services.social.comments import (
    create_comment,
    delete_comment,
    list_comments,
    update_comment,
)
from app.services.social.friends import (
    cancel_outgoing,
    list_accepted,
    list_incoming,
    list_outgoing,
    remove_friend,
    respond_to_request,
    send_request,
)
from app.services.social.invites import (
    accept_invite,
    create_invite,
    list_invites,
    revoke_invite,
)
from app.services.social.members import (
    add_member_by_owner,
    get_role,
    list_members,
    remove_member,
    update_member_role,
)
from app.services.social.ratings import (
    delete_rating,
    list_plan_ratings,
    upsert_rating,
)
from app.services.social.reactions import (
    add_reaction,
    list_plan_reactions,
    remove_reaction,
)
from app.services.users.search import search_profiles

logger = logging.getLogger(__name__)

friends_router = APIRouter(prefix="/social", tags=["social"])
plan_members_router = APIRouter(prefix="/plans", tags=["social"])
plan_invites_router = APIRouter(prefix="/plans", tags=["social"])
plan_comments_router = APIRouter(prefix="/plans", tags=["social"])
plan_reactions_router = APIRouter(prefix="/plans", tags=["social"])
plan_ratings_router = APIRouter(prefix="/plans", tags=["social"])
plan_activity_router = APIRouter(prefix="/plans", tags=["social"])
invite_router = APIRouter(prefix="/invite", tags=["social"])


# ── Friend search ────────────────────────────────────────────────────────────


@friends_router.get("/users/search")
async def search_users_route(
    q: str = Query(..., min_length=1, max_length=64),
    current_user: str = Depends(get_current_user),
) -> list[ProfileSummary]:
    try:
        return await search_profiles(q, current_user)
    except Exception:
        logger.exception("Failed to search profiles for query %r", q)
        raise HTTPException(status_code=500, detail="Failed to search users")


# ── Friendships ──────────────────────────────────────────────────────────────


@friends_router.get("/friends")
async def list_friends_route(
    current_user: str = Depends(get_current_user),
) -> list[FriendshipResponse]:
    try:
        return await list_accepted(current_user)
    except Exception:
        logger.exception("Failed to list friends for user %s", current_user)
        raise HTTPException(status_code=500, detail="Failed to list friends")


@friends_router.get("/friends/incoming")
async def list_incoming_route(
    current_user: str = Depends(get_current_user),
) -> list[FriendshipResponse]:
    try:
        return await list_incoming(current_user)
    except Exception:
        logger.exception("Failed to list incoming requests for user %s", current_user)
        raise HTTPException(status_code=500, detail="Failed to list requests")


@friends_router.get("/friends/outgoing")
async def list_outgoing_route(
    current_user: str = Depends(get_current_user),
) -> list[FriendshipResponse]:
    try:
        return await list_outgoing(current_user)
    except Exception:
        logger.exception("Failed to list outgoing requests for user %s", current_user)
        raise HTTPException(status_code=500, detail="Failed to list requests")


@friends_router.post("/friends/request", status_code=201)
async def send_friend_request_route(
    body: FriendRequestCreate,
    current_user: str = Depends(get_current_user),
) -> FriendshipResponse:
    try:
        return await send_request(current_user, body.username)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception:
        logger.exception("Failed to send friend request from %s", current_user)
        raise HTTPException(status_code=500, detail="Failed to send request")


@friends_router.post("/friends/accept/{request_id}")
async def accept_friend_route(
    request_id: str,
    current_user: str = Depends(get_current_user),
) -> FriendshipResponse:
    try:
        return await respond_to_request(current_user, request_id, accept=True)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to accept friend request %s", request_id)
        raise HTTPException(status_code=500, detail="Failed to accept request")


@friends_router.post("/friends/reject/{request_id}")
async def reject_friend_route(
    request_id: str,
    current_user: str = Depends(get_current_user),
) -> FriendshipResponse:
    try:
        return await respond_to_request(current_user, request_id, accept=False)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to reject friend request %s", request_id)
        raise HTTPException(status_code=500, detail="Failed to reject request")


@friends_router.delete("/friends/requests/{request_id}", status_code=204)
async def cancel_friend_request_route(
    request_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    try:
        await cancel_outgoing(current_user, request_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to cancel friend request %s", request_id)
        raise HTTPException(status_code=500, detail="Failed to cancel request")


@friends_router.delete("/friends/{user_id}", status_code=204)
async def unfriend_route(
    user_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    try:
        await remove_friend(current_user, user_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to remove friend %s", user_id)
        raise HTTPException(status_code=500, detail="Failed to remove friend")


# ── Plan members ─────────────────────────────────────────────────────────────


@plan_members_router.get("/{plan_id}/members")
async def list_plan_members_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[PlanMemberResponse]:
    try:
        return await list_members(plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to list members of plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to list members")


class MyRoleResponse(BaseModel):
    role: Literal["viewer", "editor", "owner"]


@plan_members_router.get("/{plan_id}/role")
async def my_role_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> MyRoleResponse:
    role = await get_role(plan_id, current_user)
    if role is None:
        raise HTTPException(status_code=403, detail="No access")
    return MyRoleResponse(role=role)


@plan_members_router.post("/{plan_id}/members", status_code=201)
async def add_plan_member_route(
    plan_id: str,
    body: PlanMemberCreate,
    current_user: str = Depends(get_current_user),
) -> PlanMemberResponse:
    try:
        return await add_member_by_owner(plan_id, current_user, body.user_id, body.role)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Failed to add member to plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to add member")


@plan_members_router.patch("/{plan_id}/members/{user_id}")
async def update_member_role_route(
    plan_id: str,
    user_id: str,
    body: PlanMemberUpdate,
    current_user: str = Depends(get_current_user),
) -> PlanMemberResponse:
    try:
        return await update_member_role(plan_id, current_user, user_id, body.role)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to update role for user %s on plan %s", user_id, plan_id)
        raise HTTPException(status_code=500, detail="Failed to update role")


@plan_members_router.delete("/{plan_id}/members/{user_id}", status_code=204)
async def remove_member_route(
    plan_id: str,
    user_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    try:
        await remove_member(plan_id, current_user, user_id)
        return Response(status_code=204)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to remove user %s from plan %s", user_id, plan_id)
        raise HTTPException(status_code=500, detail="Failed to remove member")


# ── Plan invites ─────────────────────────────────────────────────────────────


@plan_invites_router.get("/{plan_id}/invites")
async def list_invites_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[PlanInviteResponse]:
    try:
        return await list_invites(plan_id, current_user)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to list invites for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to list invites")


@plan_invites_router.post("/{plan_id}/invites", status_code=201)
async def create_invite_route(
    plan_id: str,
    body: PlanInviteCreate,
    current_user: str = Depends(get_current_user),
) -> PlanInviteResponse:
    try:
        return await create_invite(
            plan_id,
            current_user,
            body.role,
            body.expires_in_hours,
            body.max_uses,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Failed to create invite for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to create invite")


@plan_invites_router.delete("/{plan_id}/invites/{invite_id}", status_code=204)
async def revoke_invite_route(
    plan_id: str,
    invite_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    try:
        await revoke_invite(plan_id, invite_id, current_user)
        return Response(status_code=204)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to revoke invite %s on plan %s", invite_id, plan_id)
        raise HTTPException(status_code=500, detail="Failed to revoke invite")


# ── Invite redemption ────────────────────────────────────────────────────────


@invite_router.post("/{token}/accept")
async def accept_invite_route(
    token: str,
    current_user: str = Depends(get_current_user),
) -> InviteAcceptResponse:
    try:
        return await accept_invite(token, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to accept invite %s", token)
        raise HTTPException(status_code=500, detail="Failed to accept invite")


# ── Plan comments ────────────────────────────────────────────────────────────


@plan_comments_router.get("/{plan_id}/comments")
async def list_comments_route(
    plan_id: str,
    plan_item_id: str | None = Query(None),
    current_user: str = Depends(get_current_user),
) -> list[CommentResponse]:
    try:
        return await list_comments(plan_id, current_user, plan_item_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to list comments for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to list comments")


@plan_comments_router.post("/{plan_id}/comments", status_code=201)
async def create_comment_route(
    plan_id: str,
    body: CommentCreate,
    current_user: str = Depends(get_current_user),
) -> CommentResponse:
    try:
        return await create_comment(
            plan_id,
            current_user,
            body.body,
            body.plan_item_id,
            body.parent_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Failed to create comment on plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to create comment")


@plan_comments_router.patch("/{plan_id}/comments/{comment_id}")
async def update_comment_route(
    plan_id: str,
    comment_id: str,
    body: CommentUpdate,
    current_user: str = Depends(get_current_user),
) -> CommentResponse:
    try:
        return await update_comment(plan_id, current_user, comment_id, body.body)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to update comment %s on plan %s", comment_id, plan_id)
        raise HTTPException(status_code=500, detail="Failed to update comment")


@plan_comments_router.delete("/{plan_id}/comments/{comment_id}", status_code=204)
async def delete_comment_route(
    plan_id: str,
    comment_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    try:
        await delete_comment(plan_id, current_user, comment_id)
        return Response(status_code=204)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to delete comment %s on plan %s", comment_id, plan_id)
        raise HTTPException(status_code=500, detail="Failed to delete comment")


# ── Plan-item reactions ──────────────────────────────────────────────────────


@plan_reactions_router.get("/{plan_id}/reactions")
async def list_reactions_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[ReactionResponse]:
    try:
        return await list_plan_reactions(plan_id, current_user)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception:
        logger.exception("Failed to list reactions for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to list reactions")


@plan_reactions_router.post(
    "/{plan_id}/items/{item_id}/reactions", status_code=201
)
async def add_reaction_route(
    plan_id: str,
    item_id: str,
    body: ReactionCreate,
    current_user: str = Depends(get_current_user),
) -> ReactionResponse:
    try:
        return await add_reaction(plan_id, current_user, item_id, body.kind)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Failed to add reaction on item %s in plan %s", item_id, plan_id)
        raise HTTPException(status_code=500, detail="Failed to add reaction")


@plan_reactions_router.delete(
    "/{plan_id}/items/{item_id}/reactions/{kind}", status_code=204
)
async def remove_reaction_route(
    plan_id: str,
    item_id: str,
    kind: ReactionKind,
    current_user: str = Depends(get_current_user),
) -> Response:
    try:
        await remove_reaction(plan_id, current_user, item_id, kind)
        return Response(status_code=204)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception(
            "Failed to remove reaction %s on item %s in plan %s", kind, item_id, plan_id
        )
        raise HTTPException(status_code=500, detail="Failed to remove reaction")


# ── Plan-item ratings ────────────────────────────────────────────────────────


@plan_ratings_router.get("/{plan_id}/ratings")
async def list_ratings_route(
    plan_id: str,
    current_user: str = Depends(get_current_user),
) -> list[RatingResponse]:
    try:
        return await list_plan_ratings(plan_id, current_user)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception:
        logger.exception("Failed to list ratings for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to list ratings")


@plan_ratings_router.put("/{plan_id}/items/{item_id}/rating")
async def upsert_rating_route(
    plan_id: str,
    item_id: str,
    body: RatingUpsert,
    current_user: str = Depends(get_current_user),
) -> RatingResponse:
    try:
        return await upsert_rating(plan_id, current_user, item_id, body.stars)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Failed to set rating on item %s in plan %s", item_id, plan_id)
        raise HTTPException(status_code=500, detail="Failed to set rating")


@plan_ratings_router.delete(
    "/{plan_id}/items/{item_id}/rating", status_code=204
)
async def delete_rating_route(
    plan_id: str,
    item_id: str,
    current_user: str = Depends(get_current_user),
) -> Response:
    try:
        await delete_rating(plan_id, current_user, item_id)
        return Response(status_code=204)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to delete rating on item %s in plan %s", item_id, plan_id)
        raise HTTPException(status_code=500, detail="Failed to delete rating")


# ── Plan activity feed ───────────────────────────────────────────────────────


@plan_activity_router.get("/{plan_id}/activity")
async def list_activity_route(
    plan_id: str,
    limit: int = Query(50, ge=1, le=200),
    before: str | None = Query(None),
    current_user: str = Depends(get_current_user),
) -> list[ActivityResponse]:
    role = await get_role(plan_id, current_user)
    if role is None:
        raise HTTPException(status_code=403, detail="Not a member of this plan")
    try:
        return await list_activity(plan_id, limit=limit, before=before)
    except Exception:
        logger.exception("Failed to list activity for plan %s", plan_id)
        raise HTTPException(status_code=500, detail="Failed to list activity")
