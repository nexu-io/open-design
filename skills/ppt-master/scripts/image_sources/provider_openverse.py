"""Openverse provider.

Zero-config (no API key required). Indexes openly licensed images across
Wikimedia, Flickr, museums, and other sources.

API docs: https://api.openverse.org/v1/
"""

from __future__ import annotations

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    raise SystemExit(0)

import requests

from image_sources.provider_common import (
    AssetCandidate,
    ImageSearchRequest,
    USER_AGENT,
    build_query_progression,
    classify_license,
    normalize_license_name,
)


API_URL = "https://api.openverse.org/v1/images/"
DEFAULT_PAGE_SIZE = 20
DEFAULT_TIMEOUT = 30

# Map our orientation vocabulary to Openverse's ``aspect_ratio`` parameter.
_ASPECT_MAP = {"landscape": "wide", "portrait": "tall", "square": "square"}

# Openverse license param values. ``cc0,pdm`` covers our "no-attribution" tier;
# adding ``by,by-sa`` opens the "attribution-required" tier.
_LICENSE_PARAM = {
    "no-attribution-only": "cc0,pdm",
    "all": "by,by-sa,cc0,pdm",
}


def parse_results(payload: dict) -> list[AssetCandidate]:
    """Translate an Openverse search payload into a list of candidates."""
    candidates: list[AssetCandidate] = []
    for item in payload.get("results", []) or []:
        license_name = (item.get("license") or "").strip()
        license_url = (item.get("license_url") or "").strip()
        tier = classify_license(license_name, license_url, provider="openverse")
        if not tier:
            continue

        download_url = (item.get("url") or item.get("thumbnail") or "").strip()
        if not download_url:
            continue

        candidates.append(
            AssetCandidate(
                provider="openverse",
                title=(item.get("title") or "").strip() or "Untitled",
                asset_id=str(item.get("id") or ""),
                source_page_url=(
                    item.get("foreign_landing_url") or item.get("detail_url") or ""
                ).strip(),
                license_name=normalize_license_name(license_name),
                license_url=license_url,
                license_tier=tier,
                width=int(item.get("width") or 0),
                height=int(item.get("height") or 0),
                download_url=download_url,
                author=(item.get("creator") or "").strip(),
                raw=item,
            )
        )
    return candidates


def search(
    request: ImageSearchRequest,
    *,
    license_tier_filter: str = "no-attribution-only",
    page_size: int = DEFAULT_PAGE_SIZE,
    timeout: int = DEFAULT_TIMEOUT,
) -> list[AssetCandidate]:
    """Search Openverse for candidates matching ``request``.

    ``license_tier_filter`` is one of ``"no-attribution-only"`` or ``"all"``.
    Returns the candidates from the first non-empty query in the
    progression — caller is responsible for picking the best one via
    ``score_candidate``.
    """
    if license_tier_filter not in _LICENSE_PARAM:
        raise ValueError(f"unsupported license_tier_filter: {license_tier_filter!r}")

    orientation = (request.orientation or "").strip().lower()

    for query in build_query_progression(request.query):
        params: dict[str, str | int] = {
            "q": query,
            "page_size": page_size,
            "license": _LICENSE_PARAM[license_tier_filter],
            "size": "large",
        }
        if orientation in _ASPECT_MAP:
            params["aspect_ratio"] = _ASPECT_MAP[orientation]

        response = requests.get(
            API_URL,
            params=params,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=timeout,
        )
        response.raise_for_status()
        candidates = parse_results(response.json())
        if candidates:
            return candidates

    return []
