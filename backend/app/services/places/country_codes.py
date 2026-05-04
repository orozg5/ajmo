"""Country name → ISO-3166-1 alpha-2 codes + rough bbox for post-geocode validation.

Intentionally small/hand-curated. Covers the top ~30 travel destinations. Extend
as users report miss-geocodes. Unknown destinations fall back to "no biasing" —
the geocode still runs, just without country filtering.
"""
from __future__ import annotations

# Alias forms keep the lookup forgiving: users type "USA" or "United States" or "us".
COUNTRY_NAME_TO_CODE: dict[str, str] = {
    "united states": "us",
    "united states of america": "us",
    "usa": "us",
    "us": "us",
    "america": "us",
    "united kingdom": "gb",
    "uk": "gb",
    "great britain": "gb",
    "england": "gb",
    "scotland": "gb",
    "wales": "gb",
    "france": "fr",
    "germany": "de",
    "spain": "es",
    "italy": "it",
    "portugal": "pt",
    "netherlands": "nl",
    "holland": "nl",
    "belgium": "be",
    "switzerland": "ch",
    "austria": "at",
    "czech republic": "cz",
    "czechia": "cz",
    "poland": "pl",
    "hungary": "hu",
    "greece": "gr",
    "croatia": "hr",
    "ireland": "ie",
    "denmark": "dk",
    "sweden": "se",
    "norway": "no",
    "finland": "fi",
    "iceland": "is",
    "turkey": "tr",
    "japan": "jp",
    "china": "cn",
    "south korea": "kr",
    "korea": "kr",
    "thailand": "th",
    "vietnam": "vn",
    "singapore": "sg",
    "malaysia": "my",
    "indonesia": "id",
    "india": "in",
    "australia": "au",
    "new zealand": "nz",
    "canada": "ca",
    "mexico": "mx",
    "brazil": "br",
    "argentina": "ar",
    "chile": "cl",
    "peru": "pe",
    "colombia": "co",
    "south africa": "za",
    "morocco": "ma",
    "egypt": "eg",
    "uae": "ae",
    "united arab emirates": "ae",
    "israel": "il",
}


# (min_lng, min_lat, max_lng, max_lat). Numbers are conservative — real country
# shapes have holes/exclaves but we only need "outside by a lot" detection.
COUNTRY_BBOX: dict[str, tuple[float, float, float, float]] = {
    "us": (-125.0, 24.0, -66.5, 49.5),
    "gb": (-8.7, 49.8, 1.9, 60.9),
    "fr": (-5.5, 41.3, 9.7, 51.1),
    "de": (5.8, 47.2, 15.1, 55.1),
    "es": (-9.4, 35.9, 4.4, 43.9),
    "it": (6.6, 35.4, 18.6, 47.1),
    "pt": (-9.6, 36.9, -6.1, 42.2),
    "nl": (3.3, 50.7, 7.2, 53.6),
    "be": (2.5, 49.4, 6.4, 51.6),
    "ch": (5.9, 45.8, 10.5, 47.9),
    "at": (9.5, 46.3, 17.2, 49.1),
    "cz": (12.0, 48.5, 18.9, 51.1),
    "pl": (14.1, 49.0, 24.2, 54.9),
    "hu": (16.1, 45.7, 22.9, 48.6),
    "gr": (19.3, 34.8, 28.3, 41.8),
    "hr": (13.3, 42.3, 19.5, 46.6),
    "ie": (-10.6, 51.4, -6.0, 55.4),
    "dk": (8.0, 54.5, 15.2, 57.8),
    "se": (10.9, 55.3, 24.2, 69.1),
    "no": (4.4, 58.0, 31.2, 71.2),
    "fi": (20.5, 59.8, 31.6, 70.1),
    "is": (-24.6, 63.3, -13.5, 66.6),
    "tr": (26.0, 36.0, 45.0, 42.1),
    "jp": (122.9, 24.0, 146.0, 45.6),
    "cn": (73.5, 18.2, 134.8, 53.6),
    "kr": (125.1, 33.1, 131.0, 38.6),
    "th": (97.3, 5.6, 105.7, 20.5),
    "vn": (102.1, 8.4, 109.5, 23.4),
    "sg": (103.6, 1.2, 104.0, 1.5),
    "my": (99.6, 0.9, 119.3, 7.4),
    "id": (95.0, -11.0, 141.0, 6.1),
    "in": (68.2, 6.7, 97.4, 35.7),
    "au": (112.9, -43.7, 153.7, -10.7),
    "nz": (166.4, -47.3, 178.6, -34.4),
    "ca": (-141.0, 41.7, -52.6, 83.2),
    "mx": (-117.1, 14.5, -86.7, 32.7),
    "br": (-74.0, -33.8, -34.8, 5.3),
    "ar": (-73.6, -55.1, -53.6, -21.8),
    "cl": (-76.0, -56.0, -66.4, -17.5),
    "pe": (-81.4, -18.4, -68.7, -0.0),
    "co": (-79.0, -4.3, -66.9, 12.5),
    "za": (16.5, -34.9, 32.9, -22.1),
    "ma": (-13.2, 21.4, -1.0, 35.9),
    "eg": (24.7, 22.0, 36.9, 31.7),
    "ae": (51.4, 22.6, 56.4, 26.1),
    "il": (34.2, 29.5, 35.9, 33.3),
}


def resolve_country_code(destination: str) -> str | None:
    """Pull an ISO-2 country code out of a free-text destination.

    Accepts "Manhattan, USA", "Paris, France", "Kyoto, Japan". Returns None
    when no country token is recognised.
    """
    if not destination:
        return None
    tokens = [t.strip().lower() for t in destination.split(",") if t.strip()]
    for token in reversed(tokens):
        code = COUNTRY_NAME_TO_CODE.get(token)
        if code:
            return code
    return None


def coord_in_country_bbox(lat: float, lng: float, country_code: str) -> bool:
    """True if (lat, lng) sits inside the rough bbox for country_code.

    Unknown country codes return True — we only reject when we *know* the coord
    is outside. Better to accept a slightly off pin than drop a correct one.
    """
    bbox = COUNTRY_BBOX.get(country_code.lower())
    if bbox is None:
        return True
    min_lng, min_lat, max_lng, max_lat = bbox
    return min_lng <= lng <= max_lng and min_lat <= lat <= max_lat
