"""Tests for owner-scoped PATCH plan and date-range day reconciliation."""
from __future__ import annotations

import uuid
from typing import Any

import pytest

from app.services.plans import crud, days
from app.services.plans.days import DateShrinkBlocked, sync_days


# ── In-memory Supabase fake ─────────────────────────────────────────────────


class FakeResult:
    def __init__(self, data: list[dict]):
        self.data = data


class FakeQuery:
    def __init__(self, db: "FakeSupabase", table_name: str):
        self.db = db
        self.table_name = table_name
        self.filters: list[tuple] = []
        self.action: tuple | None = None
        self.payload: Any = None
        self.order_col: str | None = None
        self.order_desc: bool = False
        self.embed_items: bool = False

    def select(self, cols: str, *_args: Any, **_kwargs: Any) -> "FakeQuery":
        self.action = ("select", cols)
        if "plan_items(" in cols:
            self.embed_items = True
        return self

    def update(self, payload: dict) -> "FakeQuery":
        self.action = ("update",)
        self.payload = payload
        return self

    def insert(self, payload: dict | list[dict]) -> "FakeQuery":
        self.action = ("insert",)
        self.payload = payload if isinstance(payload, list) else [payload]
        return self

    def delete(self) -> "FakeQuery":
        self.action = ("delete",)
        return self

    def eq(self, col: str, val: Any) -> "FakeQuery":
        self.filters.append(("eq", col, val))
        return self

    def neq(self, col: str, val: Any) -> "FakeQuery":
        self.filters.append(("neq", col, val))
        return self

    def in_(self, col: str, vals: list[Any]) -> "FakeQuery":
        self.filters.append(("in", col, list(vals)))
        return self

    def order(self, col: str, desc: bool = False) -> "FakeQuery":
        self.order_col = col
        self.order_desc = desc
        return self

    def limit(self, _n: int) -> "FakeQuery":
        return self

    def matches(self, row: dict) -> bool:
        for kind, col, val in self.filters:
            if kind == "eq" and row.get(col) != val:
                return False
            if kind == "neq" and row.get(col) == val:
                return False
            if kind == "in" and row.get(col) not in val:
                return False
        return True

    def execute(self) -> FakeResult:
        rows = self.db.tables.setdefault(self.table_name, [])
        if not self.action:
            return FakeResult([])
        kind = self.action[0]

        if kind == "select":
            filtered = [r for r in rows if self.matches(r)]
            if self.order_col is not None:
                filtered = sorted(
                    filtered,
                    key=lambda r: (r.get(self.order_col) is None, r.get(self.order_col) or 0),
                    reverse=self.order_desc,
                )
            if self.embed_items and self.table_name == "plan_days":
                items = self.db.tables.setdefault("plan_items", [])
                filtered = [
                    {**r, "plan_items": [dict(i) for i in items if i.get("day_id") == r.get("id")]}
                    for r in filtered
                ]
            return FakeResult([dict(r) for r in filtered])

        if kind == "update":
            updated: list[dict] = []
            for row in rows:
                if self.matches(row):
                    row.update(self.payload)
                    updated.append(dict(row))
            return FakeResult(updated)

        if kind == "insert":
            inserted: list[dict] = []
            for entry in self.payload:
                new_row = dict(entry)
                new_row.setdefault("id", str(uuid.uuid4()))
                rows.append(new_row)
                inserted.append(dict(new_row))
            return FakeResult(inserted)

        if kind == "delete":
            keep: list[dict] = []
            removed: list[dict] = []
            for row in rows:
                if self.matches(row):
                    removed.append(dict(row))
                else:
                    keep.append(row)
            self.db.tables[self.table_name] = keep
            return FakeResult(removed)

        return FakeResult([])


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {
            "plans": [],
            "plan_days": [],
            "plan_items": [],
        }

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> FakeSupabase:
    db = FakeSupabase()
    monkeypatch.setattr(crud, "get_supabase_client", lambda: db)
    monkeypatch.setattr(days, "get_supabase_client", lambda: db)
    return db


def seed_plan(
    db: FakeSupabase,
    plan_id: str = "plan-1",
    owner_id: str = "owner-1",
    date_from: str | None = None,
    date_to: str | None = None,
) -> None:
    db.tables["plans"].append({
        "id": plan_id,
        "owner_id": owner_id,
        "title": "Trip",
        "description": None,
        "date_from": date_from,
        "date_to": date_to,
        "visibility": "private",
        "cover_image_path": None,
        "cover_image_url": None,
    })


def seed_day(
    db: FakeSupabase,
    plan_id: str,
    day_number: int,
    date_iso: str | None,
    day_id: str | None = None,
) -> str:
    new_id = day_id or f"day-{day_number}"
    db.tables["plan_days"].append({
        "id": new_id,
        "plan_id": plan_id,
        "day_number": day_number,
        "date": date_iso,
        "title": None,
        "notes": None,
    })
    return new_id


def seed_item(db: FakeSupabase, plan_id: str, day_id: str) -> None:
    db.tables["plan_items"].append({
        "id": str(uuid.uuid4()),
        "plan_id": plan_id,
        "day_id": day_id,
    })


# ── sync_days ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_days_open_ended_is_noop(fake_db: FakeSupabase):
    seed_day(fake_db, "plan-1", 1, None)
    result = await sync_days("plan-1", None, None)
    assert len(result) == 1
    assert result[0]["date"] is None
    assert len(fake_db.tables["plan_days"]) == 1


@pytest.mark.asyncio
async def test_sync_days_extends_range(fake_db: FakeSupabase):
    seed_day(fake_db, "plan-1", 1, "2026-06-01")
    seed_day(fake_db, "plan-1", 2, "2026-06-02")

    result = await sync_days("plan-1", "2026-06-01", "2026-06-04")

    assert [row["date"] for row in result] == [
        "2026-06-01",
        "2026-06-02",
        "2026-06-03",
        "2026-06-04",
    ]
    assert [row["day_number"] for row in result] == [1, 2, 3, 4]
    assert len(fake_db.tables["plan_days"]) == 4


@pytest.mark.asyncio
async def test_sync_days_shrinks_empty_tail(fake_db: FakeSupabase):
    seed_day(fake_db, "plan-1", 1, "2026-06-01")
    seed_day(fake_db, "plan-1", 2, "2026-06-02")
    seed_day(fake_db, "plan-1", 3, "2026-06-03")
    seed_day(fake_db, "plan-1", 4, "2026-06-04")

    result = await sync_days("plan-1", "2026-06-01", "2026-06-02")

    assert [row["date"] for row in result] == ["2026-06-01", "2026-06-02"]
    assert [row["day_number"] for row in result] == [1, 2]
    assert len(fake_db.tables["plan_days"]) == 2


@pytest.mark.asyncio
async def test_sync_days_blocks_when_items_would_be_dropped(fake_db: FakeSupabase):
    seed_day(fake_db, "plan-1", 1, "2026-06-01", day_id="day-1")
    day_two = seed_day(fake_db, "plan-1", 2, "2026-06-02", day_id="day-2")
    day_three = seed_day(fake_db, "plan-1", 3, "2026-06-03", day_id="day-3")
    seed_item(fake_db, "plan-1", day_three)

    with pytest.raises(DateShrinkBlocked) as exc:
        await sync_days("plan-1", "2026-06-01", "2026-06-02")
    assert "2026-06-03" in str(exc.value)

    # No mutation when blocked
    assert len(fake_db.tables["plan_days"]) == 3
    assert any(row["id"] == day_two for row in fake_db.tables["plan_days"])


@pytest.mark.asyncio
async def test_sync_days_shifts_window(fake_db: FakeSupabase):
    seed_day(fake_db, "plan-1", 1, "2026-06-01")
    seed_day(fake_db, "plan-1", 2, "2026-06-02")
    seed_day(fake_db, "plan-1", 3, "2026-06-03")

    result = await sync_days("plan-1", "2026-06-02", "2026-06-04")

    assert [row["date"] for row in result] == [
        "2026-06-02",
        "2026-06-03",
        "2026-06-04",
    ]
    assert [row["day_number"] for row in result] == [1, 2, 3]


@pytest.mark.asyncio
async def test_sync_days_replaces_undated_when_empty(fake_db: FakeSupabase):
    seed_day(fake_db, "plan-1", 1, None)
    result = await sync_days("plan-1", "2026-06-01", "2026-06-02")

    assert [row["date"] for row in result] == ["2026-06-01", "2026-06-02"]
    assert all(row["date"] is not None for row in fake_db.tables["plan_days"])


@pytest.mark.asyncio
async def test_sync_days_blocks_replacing_undated_with_items(fake_db: FakeSupabase):
    day_id = seed_day(fake_db, "plan-1", 1, None, day_id="day-1")
    seed_item(fake_db, "plan-1", day_id)

    with pytest.raises(DateShrinkBlocked):
        await sync_days("plan-1", "2026-06-01", "2026-06-02")


# ── update_plan owner-auth + partial-date composition ───────────────────────


@pytest.mark.asyncio
async def test_update_plan_non_owner_returns_value_error(
    fake_db: FakeSupabase, monkeypatch: pytest.MonkeyPatch
):
    seed_plan(fake_db, owner_id="owner-1")

    async def fail(*_a, **_k):
        raise AssertionError("sync_days must not run when ownership check fails")

    monkeypatch.setattr(crud, "sync_days", fail)

    with pytest.raises(ValueError):
        await crud.update_plan("plan-1", "intruder", {"title": "hijacked"})

    assert fake_db.tables["plans"][0]["title"] == "Trip"


@pytest.mark.asyncio
async def test_update_plan_owner_can_patch_title(fake_db: FakeSupabase):
    seed_plan(fake_db)

    result = await crud.update_plan("plan-1", "owner-1", {"title": "New title"})

    assert result["title"] == "New title"
    assert fake_db.tables["plans"][0]["title"] == "New title"


@pytest.mark.asyncio
async def test_update_plan_partial_date_composes_with_current(
    fake_db: FakeSupabase, monkeypatch: pytest.MonkeyPatch
):
    seed_plan(fake_db, date_from="2026-06-01", date_to="2026-06-03")

    captured: dict = {}

    async def capture(plan_id, date_from, date_to):
        captured["plan_id"] = plan_id
        captured["date_from"] = date_from
        captured["date_to"] = date_to
        return []

    monkeypatch.setattr(crud, "sync_days", capture)

    await crud.update_plan("plan-1", "owner-1", {"date_to": "2026-06-05"})

    assert captured == {
        "plan_id": "plan-1",
        "date_from": "2026-06-01",
        "date_to": "2026-06-05",
    }


@pytest.mark.asyncio
async def test_update_plan_no_date_keys_skips_sync(
    fake_db: FakeSupabase, monkeypatch: pytest.MonkeyPatch
):
    seed_plan(fake_db)
    called = False

    async def should_not_run(*_a, **_k):
        nonlocal called
        called = True
        return []

    monkeypatch.setattr(crud, "sync_days", should_not_run)

    await crud.update_plan("plan-1", "owner-1", {"description": "hello"})

    assert called is False
    assert fake_db.tables["plans"][0]["description"] == "hello"
