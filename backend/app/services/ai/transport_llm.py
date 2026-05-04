"""LLM prompt/call/assembly for transport suggestions.

Given pair dicts from `transport_pairs`, build a compact prompt, call the
structured-output LLM, and assemble the flat LLM response into
pair-enriched suggestion dicts ready for the HTTP layer.
"""
import asyncio
import logging

from app.services.ai.llm import call_structured, stream_structured
from app.services.ai.schemas import TransportResponse

logger = logging.getLogger(__name__)


def build_transport_prompt(pairs: list[dict]) -> str:
    """Compact pair-oriented prompt. Scope noted per pair; schema enforces bounds."""
    lines = []
    for i, pair in enumerate(pairs):
        src = pair["source_item"].get("title", "?")
        dst = pair["destination_item"].get("title", "?")
        src_loc = pair.get("source_resolved_location", "")
        dst_loc = pair.get("destination_resolved_location", "")
        scope = pair.get("scope", "same_day")
        lines.append(f"{i}|{scope}|{src}@{src_loc}|{dst}@{dst_loc}")

    pairs_str = "\n".join(lines)
    return (
        "For each pair below, return EXACTLY 2 transport options.\n"
        "Rules:\n"
        "- same_day: walk, metro, bus, tram, Uber/Bolt/Lyft.\n"
        "- same_day_cross_city/cross_city: only flight, intercity train, intercity bus.\n"
        "- Each option: specific name + one_line (<=60 chars) with duration + rough price.\n\n"
        f"{pairs_str}"
    )


async def call_llm_for_transport(pairs: list[dict]) -> list[dict]:
    """Run one LLM call per pair in parallel. Overrides pair_index per pair.

    Per-pair parallelism: N small calls beat one large call for wall-clock
    latency on structured outputs. Each call returns options with pair_index=0
    (single pair in prompt); we overwrite it with the outer loop's index so
    assemble_one() can find the pair context.
    """
    if not pairs:
        return []

    async def one(idx: int, pair: dict) -> list[dict] | None:
        try:
            prompt = build_transport_prompt([pair])
            response: TransportResponse = await call_structured(
                "transport", TransportResponse, prompt, temperature=0.0, max_tokens=180,
            )
            results: list[dict] = []
            for s in response.suggestions:
                dumped = s.model_dump()
                dumped["pair_index"] = idx
                results.append(dumped)
            return results
        except Exception:
            logger.exception("Pair %d transport lookup failed", idx)
            return None

    results = await asyncio.gather(*[one(i, p) for i, p in enumerate(pairs)])
    flat: list[dict] = []
    for r in results:
        if r:
            flat.extend(r)
    return flat


def assemble_one(pairs: list[dict], llm_sug: dict) -> dict | None:
    """Assemble one LLM TransportSuggestion dict into a pair-enriched suggestion."""
    pair_idx = llm_sug.get("pair_index")
    if not isinstance(pair_idx, int) or pair_idx < 0 or pair_idx >= len(pairs):
        return None
    options = llm_sug.get("options") or []
    if not isinstance(options, list) or not options:
        return None
    pair = pairs[pair_idx]
    src = pair["source_item"]
    dst = pair["destination_item"]
    return {
        "source_item_id": src.get("id"),
        "source_item_title": src.get("title"),
        "source_item_location": pair["source_resolved_location"],
        "destination_item_id": dst.get("id"),
        "destination_item_title": dst.get("title"),
        "destination_item_location": pair["destination_resolved_location"],
        "scope": pair.get("scope", "same_day"),
        "source_day_number": pair.get("source_day_number"),
        "destination_day_number": pair.get("destination_day_number"),
        "source_city": pair.get("source_city"),
        "destination_city": pair.get("destination_city"),
        "source_country": pair.get("source_country"),
        "destination_country": pair.get("destination_country"),
        "options": options,
    }


def assemble_suggestions(pairs: list[dict], llm_results: list[dict]) -> list[dict]:
    """Pair LLM results with pair context. pair_index ≥ len(pairs) is dropped."""
    suggestions = []
    for llm_sug in llm_results:
        assembled = assemble_one(pairs, llm_sug)
        if assembled is not None:
            suggestions.append(assembled)
    return suggestions


async def stream_transport_for_pairs(pairs: list[dict]):
    """Stream LLM transport output, yield assembled suggestion dicts per pair."""
    prompt = build_transport_prompt(pairs)
    emitted_indices: set[int] = set()
    last: TransportResponse | None = None

    async for partial in stream_structured(
        "transport", TransportResponse, prompt, temperature=0.0, max_tokens=180,
    ):
        last = partial
        sugs = partial.suggestions or []
        for idx in range(max(0, len(sugs) - 1)):
            if idx in emitted_indices:
                continue
            assembled = assemble_one(pairs, sugs[idx].model_dump())
            if assembled is not None:
                emitted_indices.add(idx)
                yield assembled

    if last is not None:
        sugs = last.suggestions or []
        for idx in range(len(sugs)):
            if idx in emitted_indices:
                continue
            assembled = assemble_one(pairs, sugs[idx].model_dump())
            if assembled is not None:
                emitted_indices.add(idx)
                yield assembled
