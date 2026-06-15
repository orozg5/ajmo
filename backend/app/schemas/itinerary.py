"""Pydantic models for itinerary day and item endpoints."""
from __future__ import annotations

from pydantic import BaseModel, field_validator

from app.constants import validate_item_type


class PlanDayCreate(BaseModel):
    day_number: int | None = None
    date: str | None = None


class PlanItemCreate(BaseModel):
    item_type: str
    title: str
    notes: str | None = None
    location: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    duration_minutes: int | None = None
    sort_key: str | None = None
    sort_order: int | None = None
    place_id: str | None = None
    ai_data: dict | None = None
    destination_id: str | None = None

    @field_validator("item_type")
    @classmethod
    def check_item_type(cls, v: str) -> str:
        return validate_item_type(v)


class PlanItemNotesUpdate(BaseModel):
    notes: str | None = None


class PlanItemReorderEntry(BaseModel):
    id: str
    sort_key: str
    day_id: str
    destination_id: str | None = None


class PlanItemsReorderRequest(BaseModel):
    items: list[PlanItemReorderEntry]


class PlanDayUpdate(BaseModel):
    title: str | None = None
    notes: str | None = None


class PlanHotelCreate(BaseModel):
    place_id: str | None = None
    destination_id: str | None = None
    check_in_day_number: int
    check_out_day_number: int
    check_in_time: str | None = None
    check_out_time: str | None = None
    notes: str | None = None
    sort_key: str | None = None


class PlanHotelUpdate(BaseModel):
    place_id: str | None = None
    destination_id: str | None = None
    check_in_day_number: int | None = None
    check_out_day_number: int | None = None
    check_in_time: str | None = None
    check_out_time: str | None = None
    notes: str | None = None
    sort_key: str | None = None


class PlanItemResponse(BaseModel):
    id: str
    plan_id: str
    day_id: str
    item_type: str
    title: str
    notes: str | None = None
    location: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    duration_minutes: int | None = None
    sort_key: str | None = None
    sort_order: int | None = None
    place_id: str | None = None
    ai_data: dict | None = None
    destination_id: str | None = None


class PlanDayWithItemsResponse(BaseModel):
    id: str
    plan_id: str
    day_number: int
    date: str | None = None
    title: str | None = None
    notes: str | None = None
    items: list[PlanItemResponse]


class PlanHotelResponse(BaseModel):
    id: str
    plan_id: str
    place_id: str | None = None
    destination_id: str | None = None
    check_in_day_number: int
    check_out_day_number: int
    check_in_time: str | None = None
    check_out_time: str | None = None
    notes: str | None = None
    sort_key: str | None = None
    created_at: str | None = None
    place_name: str | None = None
    place_image_url: str | None = None
    place_description: str | None = None
    place_location: str | None = None
    place_check_in_time: str | None = None
    place_price_range: str | None = None
    place_lat: float | None = None
    place_lng: float | None = None
