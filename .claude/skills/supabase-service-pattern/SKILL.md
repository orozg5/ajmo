---
name: supabase-service-pattern
description: >
  Use this skill whenever adding a new backend domain to the Ajmo FastAPI app —
  any time a new resource or feature needs a Supabase service file and a FastAPI
  route file. Triggers include: "add a new route", "create a service for X",
  "build the backend for Y", "I need CRUD for Z", or any request that involves
  writing a new /backend/app/services/*.py or /backend/app/routes/*.py file.
  Always use this skill before writing any backend code — it defines the exact
  boilerplate, conventions, and checklist the project requires.
---

# Supabase Service Pattern — Ajmo Backend

This skill captures the exact pattern for all backend domain files in the Ajmo
FastAPI project. Every new resource (plans, users, friends, etc.) follows this
structure without deviation.

---

## Project layout reminder

```
backend/
  app/
    routes/           ← one file per domain, thin handlers only
    services/         ← one file per domain, all business logic here
    schemas/
      responses.py    ← Pydantic response models for all routes
    config.py         ← pydantic_settings.BaseSettings, reads .env automatically
    constants.py      ← shared constants (VALID_ITEM_TYPES, etc.)
    db.py             ← Supabase client singleton — import get_supabase_client() from here
    __init__.py
  main.py             ← registers all routers, configures logging
  .env                ← never commit; contains SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
```

---

## config.py pattern (already exists — never recreate)

```python
# backend/app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    TAVILY_API_KEY: str
    GOOGLE_API_KEY: str
    AI_MODEL: str  # required — always set in .env, never hardcoded

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

settings = Settings()
```

---

## db.py pattern (already exists — never recreate)

```python
# backend/app/db.py
from app.db import get_supabase_client
```

Import `get_supabase_client()` from `app.db` in every service file.
Never call `create_client()` directly in service files.

---

## Service file pattern

`/backend/app/services/{domain}.py`

```python
import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


async def create_{resource}(data: dict) -> dict:
    supabase = get_supabase_client()
    result = supabase.table("{table_name}").insert(data).execute()
    if not result.data:
        raise ValueError("Failed to create {resource}")
    return result.data[0]


async def get_{resource}(resource_id: str) -> dict:
    supabase = get_supabase_client()
    result = (
        supabase.table("{table_name}")
        .select("*")
        .eq("id", resource_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise ValueError(f"{Resource} {resource_id!r} not found")
    return result.data[0]


async def list_{resource}s(owner_id: str) -> list[dict]:
    supabase = get_supabase_client()
    result = (
        supabase.table("{table_name}")
        .select("*")
        .eq("owner_id", owner_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


async def update_{resource}(resource_id: str, updates: dict) -> dict:
    supabase = get_supabase_client()
    result = (
        supabase.table("{table_name}")
        .update(updates)
        .eq("id", resource_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"{Resource} {resource_id!r} not found")
    return result.data[0]


async def delete_{resource}(resource_id: str) -> None:
    supabase = get_supabase_client()
    result = supabase.table("{table_name}").delete().eq("id", resource_id).execute()
    if not result.data:
        raise ValueError(f"{Resource} {resource_id!r} not found")
```

**Rules:**

- Import `get_supabase_client()` from `app.db` — never call `create_client()` directly
- Use `.limit(1).execute()` for single-row fetches — NOT `.maybe_single()` (supabase-py returns
  `None` for the entire result object on no match with `maybe_single`, not just `.data`)
- Raise `ValueError` on not-found — route handlers catch it and convert to 404
- All functions are `async def` even though supabase-py calls are synchronous
- Never return raw Supabase response objects — always return `.data` or `.data[0]`
- `model_dump(mode="json")` required on Pydantic date fields before passing to supabase-py

---

## Add a response model to schemas/responses.py

Before writing the route, add a Pydantic model to `/backend/app/schemas/responses.py`:

```python
class {Resource}Response(BaseModel):
    id: str
    owner_id: str
    # ... all fields matching the DB table
    created_at: str
```

---

## Route file pattern

`/backend/app/routes/{domain}.py`

```python
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.schemas.responses import {Resource}Response
from app.services.{domain} import (
    create_{resource},
    get_{resource},
    list_{resource}s,
    update_{resource},
    delete_{resource},
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/{resources}", tags=["{Resources}"])


class {Resource}Create(BaseModel):
    # define required fields matching DB schema
    # never include: id, created_at (auto-generated by Supabase)
    # never include: yjs_state (managed by y-websocket only)
    pass


class {Resource}Update(BaseModel):
    # all fields Optional for partial updates
    pass


@router.post("", status_code=201)
async def create_{resource}_route(body: {Resource}Create) -> {Resource}Response:
    try:
        return await create_{resource}(body.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error creating {resource}")
        raise HTTPException(status_code=500, detail="Failed to create {resource}")


@router.get("/{resource_id}")
async def get_{resource}_route(resource_id: str) -> {Resource}Response:
    try:
        return await get_{resource}(resource_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error fetching {resource} %s", resource_id)
        raise HTTPException(status_code=500, detail="Failed to fetch {resource}")


@router.get("")
async def list_{resource}s_route(
    owner_id: str = Query(..., description="UUID of the owner"),
) -> list[{Resource}Response]:
    try:
        return await list_{resource}s(owner_id)
    except Exception:
        logger.exception("Unexpected error listing {resource}s for owner %s", owner_id)
        raise HTTPException(status_code=500, detail="Failed to list {resource}s")


@router.patch("/{resource_id}")
async def update_{resource}_route(resource_id: str, body: {Resource}Update) -> {Resource}Response:
    try:
        return await update_{resource}(resource_id, body.model_dump(mode="json", exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error updating {resource} %s", resource_id)
        raise HTTPException(status_code=500, detail="Failed to update {resource}")


@router.delete("/{resource_id}", status_code=204)
async def delete_{resource}_route(resource_id: str) -> Response:
    try:
        await delete_{resource}(resource_id)
        return Response(status_code=204)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error deleting {resource} %s", resource_id)
        raise HTTPException(status_code=500, detail="Failed to delete {resource}")
```

**Rules:**

- Routes are thin — no business logic, only call service functions and handle HTTP concerns
- All route handlers must declare a typed return annotation using a model from `app/schemas/responses.py`
- Always use `model_dump(mode="json")` (not `model_dump()`) — required for date fields
- Use `model_dump(mode="json", exclude_none=True)` on updates so partial patches work correctly
- Pydantic models for all request bodies — never accept raw `dict` from requests
- ValueError from services → 404; generic Exception → 500 with `logger.exception`

---

## Registering the router in main.py

```python
# main.py — add to existing imports and registration block
from app.routes.{domain} import router as {domain}_router

app.include_router({domain}_router)
```

---

## backend/CLAUDE.md update checklist

After a new service+route pair is complete and tested, update `backend/CLAUDE.md`:

1. Add the new route(s) under **Current working features**
2. List the two new files created (`routes/{domain}.py`, `services/{domain}.py`)
3. Note any non-obvious field constraints (e.g. "never modify yjs_state directly")

---

## What NOT to do

- Never call `create_client()` directly in service files — use `get_supabase_client()` from `app.db`
- Never use `.maybe_single()` — use `.limit(1).execute()` instead
- Never put Supabase calls directly in route handlers
- Never recreate `config.py` or `db.py` — import from them
- Never hardcode `SUPABASE_URL`, key values, or model names
- Never touch `plans.yjs_state` from any service — only y-websocket writes it
- Never modify RLS policies without flagging it to the user first
- Never return bare `dict` from route handlers — always use a typed response model
