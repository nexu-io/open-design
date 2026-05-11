"""Wikimedia Commons provider.

Zero-config (no API key required). Strong on educational, scientific,
geographic, and historical imagery; weaker on contemporary stock-style
photography and people.

Uses the MediaWiki API's ``generator=search`` mode to combine fulltext
search with imageinfo/extmetadata in a single round trip.

API docs: https://www.mediawiki.org/wiki/API:Search
"""

from __future__ import annotations

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    raise SystemExit(0)

import html
import re

import requests

from image_sources.provider_common import (
    AssetCandidate,
    ImageSearchRequest,
    USER_AGENT,
    build_query_progression,
    classify_license,
    normalize_license_name,
    normalize_orientation,
)


API_URL = "https://commons.wikimedia.org/w/api.php"
DEFAULT_SEARCH_LIMIT = 20
DEFAULT_TIMEOUT = 30

# File extensions we are willing to embed in a deck. SVG/GIF/audio etc. are
# excluded — Wikimedia returns these freely from a generic search.
_ACCEPTED_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"})

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_html(value: str) -> str:
    """Wikimedia's extmetadata fields contain inline HTML markup. Flatten it."""
    if not value:
        return ""
    text = html.unescape(str(value))
    text = _TAG_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text)
    return text.strip()


def _ext_value(extmetadata: dict, key: str) -> str:
    """Pull ``extmetadata[key].value`` and strip HTML."""
    entry = extmetadata.get(key) or {}
    if isinstance(entry, dict):
        return _strip_html(entry.get("value", ""))
    return _strip_html(entry)


def _accept_extension(title: str) -> bool:
    """Drop non-image files (svg/gif/audio/video) by extension."""
    lower = (title or "").lower()
    return any(lower.endswith(ext) for ext in _ACCEPTED_EXTENSIONS)


def _page_label(title: str) -> str:
    """``File:Some_image.jpg`` → ``Some_image.jpg``."""
    clean = _strip_html(title)
    if clean.lower().startswith("file:"):
        return clean.split(":", 1)[1].strip()
    return clean


def parse_results(payload: dict) -> list[AssetCandidate]:
    """Translate a MediaWiki ``query`` payload into a list of candidates."""
    candidates: list[AssetCandidate] = []
    pages = ((payload.get("query") or {}).get("pages") or {})

    for page in pages.values():
        title = page.get("title") or ""
        if not _accept_extension(title):
            continue

        info_list = page.get("imageinfo") or []
        if not info_list:
            continue
        info = info_list[0]
        extmetadata = info.get("extmetadata") or {}

        license_name = (
            _ext_value(extmetadata, "LicenseShortName")
            or _ext_value(extmetadata, "License")
        )
        license_url = _ext_value(extmetadata, "LicenseUrl")
        tier = classify_license(license_name, license_url, provider="wikimedia")
        if not tier:
            continue

        download_url = (info.get("url") or "").strip()
        if not download_url:
            continue

        candidates.append(
            AssetCandidate(
                provider="wikimedia",
                title=_page_label(title) or "Untitled",
                asset_id=str(page.get("pageid") or ""),
                source_page_url=(info.get("descriptionurl") or "").strip(),
                license_name=normalize_license_name(license_name),
                license_url=license_url,
                license_tier=tier,
                width=int(info.get("width") or 0),
                height=int(info.get("height") or 0),
                download_url=download_url,
                author=_ext_value(extmetadata, "Artist"),
                raw=page,
            )
        )

    return candidates


def _filter_by_orientation(
    candidates: list[AssetCandidate], orientation: str
) -> list[AssetCandidate]:
    """Wikimedia API has no orientation parameter; filter client-side."""
    if not orientation or orientation == "any":
        return candidates
    matching = [
        c for c in candidates if normalize_orientation(c.width, c.height) == orientation
    ]
    # Fall back to the unfiltered list if orientation pruning leaves nothing —
    # better an off-orientation match than no image at all.
    return matching or candidates


def search(
    request: ImageSearchRequest,
    *,
    license_tier_filter: str = "no-attribution-only",
    search_limit: int = DEFAULT_SEARCH_LIMIT,
    timeout: int = DEFAULT_TIMEOUT,
) -> list[AssetCandidate]:
    """Search Wikimedia Commons for candidates.

    Wikimedia returns license info via ``extmetadata`` rather than as a
    request parameter, so the ``license_tier_filter`` does its work in
    ``parse_results`` (and is honored implicitly because tier classification
    happens there). Returning candidates from the first non-empty query.
    """
    if license_tier_filter not in {"no-attribution-only", "all"}:
        raise ValueError(f"unsupported license_tier_filter: {license_tier_filter!r}")

    orientation = (request.orientation or "").strip().lower()

    for query in build_query_progression(request.query):
        params = {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrnamespace": "6",  # File: namespace
            "gsrsearch": f"{query} filetype:bitmap",
            "gsrlimit": search_limit,
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata|mime",
            "iiextmetadatafilter": (
                "LicenseShortName|License|LicenseUrl|Artist"
            ),
        }

        response = requests.get(
            API_URL,
            params=params,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=timeout,
        )
        response.raise_for_status()
        all_candidates = parse_results(response.json())

        if license_tier_filter == "no-attribution-only":
            all_candidates = [
                c for c in all_candidates if c.license_tier == "no-attribution"
            ]

        all_candidates = _filter_by_orientation(all_candidates, orientation)
        if all_candidates:
            return all_candidates

    return []
