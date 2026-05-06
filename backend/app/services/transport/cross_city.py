"""Cross-city transport orchestrator — multi-source, no LLM.

For each (source → destination) pair, fan out five lookups in parallel:

| Mode    | Source                        | Skip when          |
|---------|-------------------------------|--------------------|
| drive   | OSRM driving                  | haversine > 1500 km|
| train   | Transitous (RAIL family)      | (always tried)     |
| bus     | Transitous (BUS, COACH)       | haversine > 1500 km|
| ferry   | Transitous (FERRY)            | (always tried)     |
| flight  | haversine + cruise estimator  | haversine <  200 km|

Sentinel items (cities with no real items, hence no place_id) carry no
coordinates; the orchestrator geocodes the city name via Nominatim as a
fallback. If both endpoints fail to resolve to coordinates, the pair is
dropped with a warning.

No fallback chain across modes: a missing train option does not get filled
in by guesswork. This matches the project rule that one trusted source per
field beats a degraded fallback.
"""
from __future__ import annotations

import asyncio
import logging

from app.services.places.geocoding import geocode_with_validation
from app.services.transit.directions import (
    TransitDirectionsResult,
    get_transit_directions,
)
from app.services.transport.flight_estimator import (
    estimate_flight,
    haversine_meters,
)
from app.services.transport.osrm import OsrmDrivingResult, get_driving_route

logger = logging.getLogger(__name__)


MAX_DRIVE_BUS_KM = 1500.0

TRAIN_MODES = ["HIGH_SPEED_RAIL", "LONG_DISTANCE", "REGIONAL_RAIL", "RAIL"]
BUS_MODES = ["BUS", "COACH"]
FERRY_MODES = ["FERRY"]


COUNTRY_NAME_TO_CODE: dict[str, str] = {
    "croatia": "hr", "germany": "de", "france": "fr", "italy": "it",
    "spain": "es", "portugal": "pt", "netherlands": "nl", "belgium": "be",
    "austria": "at", "switzerland": "ch", "czech republic": "cz", "czechia": "cz",
    "poland": "pl", "hungary": "hu", "slovakia": "sk", "slovenia": "si",
    "denmark": "dk", "sweden": "se", "norway": "no", "finland": "fi",
    "ireland": "ie", "united kingdom": "gb", "uk": "gb", "greece": "gr",
    "turkey": "tr", "romania": "ro", "bulgaria": "bg", "serbia": "rs",
    "bosnia and herzegovina": "ba", "montenegro": "me", "albania": "al",
    "north macedonia": "mk", "ukraine": "ua",
    "united states": "us", "usa": "us", "canada": "ca", "mexico": "mx",
    "brazil": "br", "argentina": "ar", "japan": "jp", "china": "cn",
    "india": "in", "australia": "au", "new zealand": "nz",
}


def country_to_code(country: str | None) -> str | None:
    """Best-effort ISO 3166-1 alpha-2 code from a country name string."""
    if not country:
        return None
    return COUNTRY_NAME_TO_CODE.get(country.strip().lower())


async def resolve_pair_coordinates(
    pair: dict,
) -> tuple[float, float, float, float] | None:
    """Resolve source/destination lat-lng, geocoding cities when items lack coords.

    Returns None if either endpoint cannot be resolved — the pair is then dropped.
    """
    src_lat = pair.get("source_lat")
    src_lng = pair.get("source_lng")
    dst_lat = pair.get("destination_lat")
    dst_lng = pair.get("destination_lng")

    if src_lat is None or src_lng is None:
        city = pair.get("source_city")
        country = pair.get("source_country")
        if city:
            query = f"{city}, {country}" if country else city
            geocoded = await geocode_with_validation(query, country_code=country_to_code(country))
            if geocoded is not None:
                src_lat, src_lng = geocoded.lat, geocoded.lng

    if dst_lat is None or dst_lng is None:
        city = pair.get("destination_city")
        country = pair.get("destination_country")
        if city:
            query = f"{city}, {country}" if country else city
            geocoded = await geocode_with_validation(query, country_code=country_to_code(country))
            if geocoded is not None:
                dst_lat, dst_lng = geocoded.lat, geocoded.lng

    if src_lat is None or src_lng is None or dst_lat is None or dst_lng is None:
        logger.info(
            "Cross-city pair %s→%s dropped: could not resolve coordinates",
            pair.get("source_city"), pair.get("destination_city"),
        )
        return None

    return float(src_lat), float(src_lng), float(dst_lat), float(dst_lng)


def drive_to_option(result: OsrmDrivingResult | None) -> dict | None:
    if result is None:
        return None
    return {
        "mode": "drive",
        "name": "Drive",
        "duration_seconds": result.duration_seconds,
        "distance_meters": result.distance_meters,
        "is_estimate": False,
        "transit_summary": None,
        "geometry": result.geometry,
    }


def transit_to_option(
    mode: str,
    name: str,
    result: TransitDirectionsResult | None,
) -> dict | None:
    if result is None:
        return None
    return {
        "mode": mode,
        "name": name,
        "duration_seconds": result.duration_seconds,
        "distance_meters": result.distance_meters,
        "is_estimate": False,
        "transit_summary": result.transit_summary,
        "geometry": result.geometry,
    }


async def maybe_get_drive(
    src_lat: float, src_lng: float, dst_lat: float, dst_lng: float, distance_km: float,
) -> dict | None:
    if distance_km > MAX_DRIVE_BUS_KM:
        return None
    return drive_to_option(await get_driving_route(src_lat, src_lng, dst_lat, dst_lng))


async def maybe_get_train(
    src_lat: float, src_lng: float, dst_lat: float, dst_lng: float,
) -> dict | None:
    return transit_to_option("train", "Train", await get_transit_directions(
        src_lat, src_lng, dst_lat, dst_lng, transit_modes=TRAIN_MODES, num_itineraries=1,
    ))


async def maybe_get_bus(
    src_lat: float, src_lng: float, dst_lat: float, dst_lng: float, distance_km: float,
) -> dict | None:
    if distance_km > MAX_DRIVE_BUS_KM:
        return None
    return transit_to_option("bus", "Bus", await get_transit_directions(
        src_lat, src_lng, dst_lat, dst_lng, transit_modes=BUS_MODES, num_itineraries=1,
    ))


async def maybe_get_ferry(
    src_lat: float, src_lng: float, dst_lat: float, dst_lng: float,
) -> dict | None:
    return transit_to_option("ferry", "Ferry", await get_transit_directions(
        src_lat, src_lng, dst_lat, dst_lng, transit_modes=FERRY_MODES, num_itineraries=1,
    ))


def maybe_get_flight(
    src_lat: float, src_lng: float, dst_lat: float, dst_lng: float,
) -> dict | None:
    return estimate_flight(src_lat, src_lng, dst_lat, dst_lng)


async def options_for_pair(pair: dict) -> list[dict]:
    """Resolve all five modes for one pair in parallel and return non-None options."""
    coords = await resolve_pair_coordinates(pair)
    if coords is None:
        return []
    src_lat, src_lng, dst_lat, dst_lng = coords

    distance_km = haversine_meters(src_lat, src_lng, dst_lat, dst_lng) / 1000.0

    drive, train, bus, ferry = await asyncio.gather(
        maybe_get_drive(src_lat, src_lng, dst_lat, dst_lng, distance_km),
        maybe_get_train(src_lat, src_lng, dst_lat, dst_lng),
        maybe_get_bus(src_lat, src_lng, dst_lat, dst_lng, distance_km),
        maybe_get_ferry(src_lat, src_lng, dst_lat, dst_lng),
    )
    flight = maybe_get_flight(src_lat, src_lng, dst_lat, dst_lng)

    return [opt for opt in (drive, train, bus, ferry, flight) if opt is not None]


def assemble_suggestion(pair: dict, options: list[dict]) -> dict:
    """Wrap options in the same suggestion-dict shape the existing route returns.

    Caller decides whether to skip empty-option suggestions; we still emit them
    if requested so the UI can render an explicit "no options found" row.
    """
    src = pair["source_item"]
    dst = pair["destination_item"]
    return {
        "source_item_id": src.get("id"),
        "source_item_title": src.get("title"),
        "source_item_location": pair.get("source_resolved_location"),
        "source_destination_id": src.get("destination_id"),
        "destination_item_id": dst.get("id"),
        "destination_item_title": dst.get("title"),
        "destination_item_location": pair.get("destination_resolved_location"),
        "destination_destination_id": dst.get("destination_id"),
        "scope": pair.get("scope", "cross_city"),
        "source_day_number": pair.get("source_day_number"),
        "destination_day_number": pair.get("destination_day_number"),
        "source_city": pair.get("source_city"),
        "destination_city": pair.get("destination_city"),
        "source_country": pair.get("source_country"),
        "destination_country": pair.get("destination_country"),
        "options": options,
    }


async def generate_options_for_pairs(pairs: list[dict]) -> list[dict]:
    """Per-pair parallel resolution. Empty-options suggestions are dropped."""
    if not pairs:
        return []

    async def one(pair: dict) -> dict | None:
        try:
            options = await options_for_pair(pair)
        except Exception:
            logger.exception(
                "Cross-city resolution failed for %s→%s",
                pair.get("source_city"), pair.get("destination_city"),
            )
            return None
        if not options:
            return None
        return assemble_suggestion(pair, options)

    results = await asyncio.gather(*[one(p) for p in pairs])
    return [r for r in results if r is not None]


async def stream_options_for_pairs(pairs: list[dict]):
    """Yield assembled suggestions as each pair finishes its API fan-out."""
    if not pairs:
        return

    async def one(pair: dict) -> tuple[dict, list[dict]]:
        try:
            options = await options_for_pair(pair)
        except Exception:
            logger.exception(
                "Cross-city resolution failed for %s→%s",
                pair.get("source_city"), pair.get("destination_city"),
            )
            options = []
        return pair, options

    tasks: list[asyncio.Task[tuple[dict, list[dict]]]] = [
        asyncio.create_task(one(p)) for p in pairs
    ]
    for coro in asyncio.as_completed(tasks):
        pair, options = await coro
        if not options:
            continue
        yield assemble_suggestion(pair, options)
