"""Pixabay provider.

Requires ``PIXABAY_API_KEY`` in the environment. Pixabay's Content License
allows commercial use without attribution, so all returned candidates are
classified as ``no-attribution``.

API docs: https://pixabay.com/api/docs/
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


API_URL = "https://pixabay.com/api/"
DEFAULT_PAGE_SIZE = 20
DEFAULT_TIMEOUT = 30

# Pixabay uses ``horizontal`` / ``vertical`` rather than landscape/portrait,
# and has no ``square`` value (it falls back to ``all``).
_ORIENTATION_MAP = {
    "landscape": "horizontal",
    "portrait": "vertical",
}


def _require_api_key() -> str:
    key = (os.environ.get("PIXABAY_API_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "PIXABAY_API_KEY is not set. Add it to your environment or .env file. "
            "Get one at https://pixabay.com/api/docs/"
        )
    return key


def parse_results(payload: dict) -> list[AssetCandidate]:
    """Translate a Pixabay response into candidates."""
    candidates: list[AssetCandidate] = []
    for item in payload.get("hits", []) or []:
        download_url = (
            item.get("largeImageURL")
            or item.get("webformatURL")
            or item.get("previewURL")
            or ""
        ).strip()
        if not download_url:
            continue

        candidates.append(
            AssetCandidate(
                provider="pixabay",
                title=(item.get("tags") or "").strip() or "Pixabay image",
                asset_id=str(item.get("id") or ""),
                source_page_url=(item.get("pageURL") or "").strip(),
                license_name=normalize_license_name("Pixabay Content License"),
                license_url="https://pixabay.com/service/license-summary/",
                license_tier=LICENSE_TIER_NO_ATTRIBUTION,
                width=int(item.get("imageWidth") or 0),
                height=int(item.get("imageHeight") or 0),
                download_url=download_url,
                author=(item.get("user") or "").strip(),
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
    """Search Pixabay for candidates.

    Pixabay images are uniformly ``no-attribution``, so the ``"all"`` filter
    behaves identically to ``"no-attribution-only"``.
    """
    if license_tier_filter not in {"no-attribution-only", "all"}:
        raise ValueError(f"unsupported license_tier_filter: {license_tier_filter!r}")

    api_key = _require_api_key()
    orientation = (request.orientation or "").strip().lower()

    for query in build_query_progression(request.query):
        params: dict[str, str | int] = {
            "key": api_key,
            "q": query,
            "image_type": "photo",
            "per_page": page_size,
            "safesearch": "true",
        }
        if orientation in _ORIENTATION_MAP:
            params["orientation"] = _ORIENTATION_MAP[orientation]

        response = requests.get(
            API_URL,
            params=params,
            headers={
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
