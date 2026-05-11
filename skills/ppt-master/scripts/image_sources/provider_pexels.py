"""Pexels provider.

Requires ``PEXELS_API_KEY`` in the environment. Pexels's site-wide license
allows commercial use without attribution, so all returned candidates are
classified as ``no-attribution``.

API docs: https://www.pexels.com/api/documentation/
"""

from __future__ import annotations

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    raise SystemExit(0)

import os

import requests

from image_sources.provider_common import (
    AssetCandidate,
    ImageSearchRequest,
    LICENSE_TIER_NO_ATTRIBUTION,
    USER_AGENT,
    build_query_progression,
    normalize_license_name,
)


API_URL = "https://api.pexels.com/v1/search"
DEFAULT_PAGE_SIZE = 20
DEFAULT_TIMEOUT = 30

_ORIENTATION_MAP = {
    "landscape": "landscape",
    "portrait": "portrait",
    "square": "square",
}


def _require_api_key() -> str:
    key = (os.environ.get("PEXELS_API_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "PEXELS_API_KEY is not set. Add it to your environment or .env file. "
            "Get one at https://www.pexels.com/api/"
        )
    return key


def parse_results(payload: dict) -> list[AssetCandidate]:
    """Translate a Pexels response into candidates."""
    candidates: list[AssetCandidate] = []
    for item in payload.get("photos", []) or []:
        src = item.get("src") or {}
        download_url = (src.get("original") or src.get("large2x") or src.get("large") or "").strip()
        if not download_url:
            continue

        candidates.append(
            AssetCandidate(
                provider="pexels",
                title=(item.get("alt") or "").strip() or "Pexels photo",
                asset_id=str(item.get("id") or ""),
                source_page_url=(item.get("url") or "").strip(),
                license_name=normalize_license_name("Pexels License"),
                license_url="https://www.pexels.com/license/",
                license_tier=LICENSE_TIER_NO_ATTRIBUTION,
                width=int(item.get("width") or 0),
                height=int(item.get("height") or 0),
                download_url=download_url,
                author=(item.get("photographer") or "").strip(),
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
    """Search Pexels for candidates.

    Pexels images are uniformly ``no-attribution``, so the ``"all"`` filter
    behaves identically to ``"no-attribution-only"``. Both are accepted to
    keep the dispatcher simple.
    """
    if license_tier_filter not in {"no-attribution-only", "all"}:
        raise ValueError(f"unsupported license_tier_filter: {license_tier_filter!r}")

    api_key = _require_api_key()
    orientation = (request.orientation or "").strip().lower()

    for query in build_query_progression(request.query):
        params: dict[str, str | int] = {
            "query": query,
            "per_page": page_size,
            "size": "large",
        }
        if orientation in _ORIENTATION_MAP:
            params["orientation"] = _ORIENTATION_MAP[orientation]

        response = requests.get(
            API_URL,
            params=params,
            headers={
                "Authorization": api_key,
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
            },
            timeout=timeout,
        )
        response.raise_for_status()
        candidates = parse_results(response.json())
        if candidates:
            return candidates

    return []
