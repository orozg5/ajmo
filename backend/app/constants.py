"""Shared constants for the Ajmo backend."""

VALID_ITEM_TYPES: frozenset[str] = frozenset(
    {"attraction", "restaurant", "hotel", "transport", "activity", "note"}
)


def validate_item_type(v: str) -> str:
    if v not in VALID_ITEM_TYPES:
        raise ValueError(f"item_type must be one of {sorted(VALID_ITEM_TYPES)}")
    return v
