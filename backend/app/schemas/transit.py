"""Pydantic models for transit (public-transport) and OSRM routing endpoints."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TransitDirectionsRequest(BaseModel):
    src_lat: float = Field(..., ge=-90, le=90)
    src_lng: float = Field(..., ge=-180, le=180)
    dst_lat: float = Field(..., ge=-90, le=90)
    dst_lng: float = Field(..., ge=-180, le=180)


class TransitDirectionsResponse(BaseModel):
    distance_meters: int
    duration_seconds: int
    transit_summary: str
    geometry: list[list[float]]


class OsrmRouteRequest(BaseModel):
    profile: Literal["foot", "bike", "driving"]
    src_lat: float = Field(..., ge=-90, le=90)
    src_lng: float = Field(..., ge=-180, le=180)
    dst_lat: float = Field(..., ge=-90, le=90)
    dst_lng: float = Field(..., ge=-180, le=180)


class OsrmRouteResponse(BaseModel):
    distance_meters: int
    duration_seconds: int
    geometry: list[list[float]]
