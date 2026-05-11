"""Shared primitives for web image providers.

This module is the single home for everything that all four providers
(Openverse / Wikimedia / Pexels / Pixabay) need:

- License tier classification (the central abstraction of this module)
- Search request / asset candidate dataclasses
- Query simplification for keyword-based image APIs
- Candidate scoring
- Attribution text builder
- Small helpers (orientation, json path, etc.)

Provider-specific code (API URLs, payload shape, parse_results) lives in
the corresponding provider_<name>.py module and only imports from here.
"""

from __future__ import annotations

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("This is an internal helper module used by image_search.py and the four web image providers.")
    raise SystemExit(0)

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Project-wide constants
# ---------------------------------------------------------------------------

USER_AGENT = "PPTMaster/1.0 (https://github.com/hugohe3/ppt-master)"


# ---------------------------------------------------------------------------
# License tier classification
# ---------------------------------------------------------------------------
#
# Every accepted candidate is classified into exactly one of two tiers:
#
#   "no-attribution"        -> No on-slide credit needed (CC0, PD, Pexels,
#                              Pixabay). Default search target.
#   "attribution-required"  -> CC BY / CC BY-SA. Executor must add an
#                              inline credit text element on the slide.
#
# Anything else (CC BY-NC, CC BY-ND, all-rights-reserved, unknown) returns
# None and the candidate is rejected outright.

LICENSE_TIER_NO_ATTRIBUTION = "no-attribution"
LICENSE_TIER_ATTRIBUTION_REQUIRED = "attribution-required"

# Tokens that mark a license as "no attribution required".
NO_ATTRIBUTION_TOKENS: tuple[str, ...] = (
    "cc0",
    "public domain",
    "publicdomain",
    "creativecommons.org/publicdomain/",
    "pexels license",
    "pixabay content license",
    "pixabay license",
)

# Tokens that mark a license as "attribution required".
ATTRIBUTION_REQUIRED_TOKENS: tuple[str, ...] = (
    "cc by",
    "cc-by",
    "by-sa",
    "by sa",
    "creativecommons.org/licenses/by/",
    "creativecommons.org/licenses/by-sa/",
)

# Tokens that disqualify a candidate entirely.
REJECTED_TOKENS: tuple[str, ...] = (
    "by-nc",
    "by nc",
    "noncommercial",
    "non-commercial",
    "by-nd",
    "by nd",
    "no derivatives",
    "noderivatives",
    "all rights reserved",
)


# Canonical display forms for license names. Different providers report
# the same license with different capitalization (Openverse: "cc0",
# Wikimedia: "Public domain"); the Executor renders these as on-slide
# text, so a normalized form prevents inconsistent credits.
_LICENSE_NAME_CANON: dict[str, str] = {
    "cc0": "CC0",
    "cc 0": "CC0",
    "public domain": "Public Domain",
    "publicdomain": "Public Domain",
    "pdm": "Public Domain",
    "pexels license": "Pexels License",
    "pixabay content license": "Pixabay Content License",
    "pixabay license": "Pixabay Content License",
}

# CC license short-name pattern used to canonicalize "cc by 4.0" → "CC BY 4.0".
_CC_PATTERN = re.compile(
    r"^\s*cc[\s-]+(by(?:[\s-]+(?:sa|nc|nd))*)\s*([0-9.]*)\s*$",
    re.IGNORECASE,
)


def normalize_license_name(name: str) -> str:
    """Return a canonical display form for a license name.

    Maps common aliases to a consistent capitalization so the on-slide
    credit text written by the Executor is uniform across providers.
    Unknown inputs are returned trimmed but otherwise unchanged.
    """
    if not name:
        return ""
    key = name.strip().lower()
    if not key:
        return ""

    if key in _LICENSE_NAME_CANON:
        return _LICENSE_NAME_CANON[key]

    cc_match = _CC_PATTERN.match(key)
    if cc_match:
        suffix_raw, version = cc_match.group(1), cc_match.group(2)
        suffix = suffix_raw.replace(" ", "-").upper()
        return f"CC {suffix} {version}".strip()

    return name.strip()


def classify_license(
    license_name: str,
    license_url: str = "",
    provider: str = "",
) -> Optional[str]:
    """Classify a license string into one of the two tiers, or reject it.

    Returns:
        ``"no-attribution"`` / ``"attribution-required"`` / ``None``.

    The provider hint lets us treat Pexels and Pixabay's own licenses as
    ``no-attribution`` even when the upstream API only returns a short
    label like ``"Pexels"``.
    """
    text = " ".join(
        part.strip().lower()
        for part in (license_name or "", license_url or "")
        if part
    )
    provider_key = (provider or "").strip().lower()

    if not text and not provider_key:
        return None

    if any(token in text for token in REJECTED_TOKENS):
        return None

    if any(token in text for token in NO_ATTRIBUTION_TOKENS):
        return LICENSE_TIER_NO_ATTRIBUTION

    # Provider-default fallback: pexels / pixabay items often arrive with a
    # bare "Pexels" / "Pixabay" license string. Their site-wide license is
    # "free for commercial use, no attribution required".
    #
    # Guard: require the license text to actually mention the provider name,
    # so an empty / missing license field never silently passes as no-attribution.
    if (
        provider_key in {"pexels", "pixabay"}
        and provider_key in text
        and not any(token in text for token in ATTRIBUTION_REQUIRED_TOKENS)
    ):
        return LICENSE_TIER_NO_ATTRIBUTION

    if any(token in text for token in ATTRIBUTION_REQUIRED_TOKENS):
        return LICENSE_TIER_ATTRIBUTION_REQUIRED

    return None  # unknown license -> reject


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ImageSearchRequest:
    """A single image search intent passed to a provider."""

    query: str
    purpose: str = ""
    orientation: str = ""  # "landscape" / "portrait" / "square" / ""
    min_width: int = 0
    min_height: int = 0
    filename: str = ""
    slide: str = ""


@dataclass
class AssetCandidate:
    """One ranked candidate returned by a provider's parse_results."""

    provider: str
    title: str
    asset_id: str = ""
    source_page_url: str = ""
    license_name: str = ""
    license_url: str = ""
    license_tier: str = ""  # one of LICENSE_TIER_* constants
    width: int = 0
    height: int = 0
    download_url: str = ""
    author: str = ""
    raw: Any = field(default=None)


# ---------------------------------------------------------------------------
# Query simplification
# ---------------------------------------------------------------------------
#
# Web image APIs do keyword matching against image metadata, not semantic
# search. Long, descriptive queries with brand names, HEX codes, and
# composition notes return zero results. We progressively trim the query
# down to the most concrete nouns.

_NOISE_WORDS = frozenset({
    # Brand / product names
    "claude", "openai", "gpt", "gemini", "copilot", "chatgpt", "midjourney",
    "stable", "diffusion", "dall-e", "cursor", "anthropic", "microsoft",
    "google", "apple", "meta", "nvidia", "tesla",
    # Generic filler
    "using", "with", "from", "that", "this", "have", "been", "will",
    "into", "more", "also", "very", "some", "than", "them", "other",
})

# Words that look generic but are actually useful when they ARE the
# subject of the deck (e.g. a deck about AI). We only drop them when
# there are still other concrete nouns left.
_SOFT_NOISE_WORDS = frozenset({
    "ai", "code", "software", "system", "digital", "platform", "solution",
    "application", "interface", "framework", "algorithm", "api", "sdk",
    "assistant", "tool", "service", "technology", "tech", "program",
    # Visual-quality / usage terms. These are helpful in the full provider
    # query, but should not consume the 3-4 keyword fallback budget or
    # dominate relevance scoring over the real subject.
    "professional", "editorial", "commercial", "premium", "stock",
    "photo", "photograph", "photography", "image", "picture", "visual",
    "background", "hero", "cover", "banner", "wallpaper",
    "high", "quality", "resolution", "sharp", "clean", "cinematic",
    "dramatic", "lighting", "light", "modern", "natural", "visible",
})

_TOKEN_STRIP_CHARS = ".,;:!?\"'()[]{}，。；：！？、"


def simplify_query(query: str, max_words: int = 4) -> str:
    """Trim a verbose query into a short keyword phrase.

    Strategy:
      1. Strip HEX color codes and parenthetical asides.
      2. Drop hard-noise words (brand names, generic filler).
      3. Drop soft-noise words ONLY if concrete nouns remain.
      4. If the result would be empty, return the original query
         (fail-open: better an over-broad search than zero results).
      5. Cap at ``max_words`` words.
    """
    cleaned = re.sub(r"#[0-9a-fA-F]{3,8}", "", query)
    cleaned = re.sub(r"\([^)]*\)", "", cleaned)
    words = [w.strip(_TOKEN_STRIP_CHARS) for w in cleaned.split()]
    words = [w for w in words if len(w) > 2]

    after_hard = [w for w in words if w.lower() not in _NOISE_WORDS]
    after_soft = [w for w in after_hard if w.lower() not in _SOFT_NOISE_WORDS]

    # Only drop soft-noise if there are still concrete nouns left.
    filtered = after_soft if after_soft else after_hard

    if not filtered:
        # Everything got filtered. Fail open: return the original query.
        return query.strip()

    return " ".join(filtered[:max_words])


def build_query_progression(query: str) -> list[str]:
    """Return a list of progressively simpler queries to try in order.

    Stops as soon as one of them yields candidates upstream. Duplicates
    are dropped while preserving order.
    """
    seen: set[str] = set()
    out: list[str] = []
    for candidate in (
        query,
        simplify_query(query, max_words=4),
        simplify_query(query, max_words=3),
        simplify_query(query, max_words=2),
        simplify_query(query, max_words=1),
    ):
        candidate = candidate.strip()
        if candidate and candidate not in seen:
            seen.add(candidate)
            out.append(candidate)
    return out


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def normalize_orientation(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        return "unknown"
    if width > height:
        return "landscape"
    if height > width:
        return "portrait"
    return "square"


def _query_tokens(query: str) -> list[str]:
    """Extract ASCII keyword tokens from a query for relevance scoring.

    Uses the same noise-word filtering as ``simplify_query`` so the
    relevance signal lines up with the keywords we actually search by.
    Non-ASCII tokens (CJK etc.) are dropped — image metadata is mostly
    English even on multi-language providers, so substring matching CJK
    against an English title is unreliable. When this leaves no tokens,
    ``compute_relevance`` falls back to neutral (1.0) and lets the other
    score dimensions decide.
    """
    cleaned = re.sub(r"#[0-9a-fA-F]{3,8}", "", query.lower())
    cleaned = re.sub(r"\([^)]*\)", "", cleaned)
    words = [w.strip(_TOKEN_STRIP_CHARS) for w in cleaned.split()]
    words = [w for w in words if len(w) > 2 and w.isascii()]
    if not words:
        return []
    after_hard = [w for w in words if w not in _NOISE_WORDS]
    after_soft = [w for w in after_hard if w not in _SOFT_NOISE_WORDS]
    return after_soft if after_soft else after_hard


def _candidate_text(candidate: AssetCandidate) -> str:
    """Concatenate the candidate's matchable metadata fields for scoring."""
    return " ".join(filter(None, (candidate.title, candidate.author))).lower()


def compute_relevance(candidate: AssetCandidate, query: str) -> float:
    """Fraction of query tokens that appear in the candidate's metadata.

    Range ``[0.0, 1.0]``. Returns ``1.0`` (neutral) when the query has no
    ASCII tokens to match — this lets non-English queries fall through
    to license / size scoring without being unfairly rejected.
    """
    tokens = _query_tokens(query)
    if not tokens:
        return 1.0
    text = _candidate_text(candidate)
    if not text:
        return 0.0
    hits = sum(1 for t in tokens if t in text)
    return hits / len(tokens)


def score_candidate(candidate: AssetCandidate, request: ImageSearchRequest) -> float:
    """Score a candidate against a request. Higher is better; -inf rejects.

    Relevance dominates: a candidate whose metadata shares no query
    tokens is rejected outright, so size / license / orientation cannot
    rescue an irrelevant image from a permissive provider.
    """
    if not candidate.license_tier:
        return float("-inf")

    relevance = compute_relevance(candidate, request.query)
    if relevance == 0.0:
        return float("-inf")

    score = relevance * 10000.0

    # Penalize infrastructure/transit metadata if the user didn't explicitly ask for it.
    # This prevents high-res subway station photos from outranking actual tourist landmarks.
    text = _candidate_text(candidate)
    query_lower = request.query.lower()
    infra_terms = ["station", "subway", "metro", "rail", "transit", "airport", "bus", "地铁", "站", "轨道"]
    
    if not any(t in query_lower for t in infra_terms):
        if any(t in text for t in infra_terms):
            score -= 5000.0

    candidate_orientation = normalize_orientation(candidate.width, candidate.height)
    requested = (request.orientation or "").strip().lower()
    if requested:
        if candidate_orientation == requested:
            score += 1000.0
        else:
            score -= 250.0

    if request.min_width and candidate.width < request.min_width:
        score -= 500.0
    if request.min_height and candidate.height < request.min_height:
        score -= 500.0

    # Larger images score higher, capped to avoid runaway dominance.
    pixel_score = max(candidate.width, 0) * max(candidate.height, 0) / 1000.0
    score += min(pixel_score, 5000.0)
    return score


# ---------------------------------------------------------------------------
# Attribution text
# ---------------------------------------------------------------------------


PROVIDER_DISPLAY_NAMES: dict[str, str] = {
    "openverse": "Openverse",
    "wikimedia": "Wikimedia Commons",
    "pexels": "Pexels",
    "pixabay": "Pixabay",
}


def build_attribution_text(filename: str, candidate: AssetCandidate) -> str:
    """Render the canonical attribution string for the manifest.

    Format:
        ``filename — "title" by author, via Provider, license: name (url)``

    Empty fields are gracefully omitted. The text is intended for use by
    the Executor when generating in-SVG credit elements; it is not meant
    to be machine-parsed downstream.
    """
    provider_name = PROVIDER_DISPLAY_NAMES.get(
        candidate.provider, candidate.provider or "unknown"
    )

    parts: list[str] = [filename or candidate.download_url or "image"]
    middle: list[str] = []
    if candidate.title:
        middle.append(f'"{candidate.title}"')
    if candidate.author:
        middle.append(f"by {candidate.author}")
    middle.append(f"via {provider_name}")
    parts.append(" ".join(middle))

    license_part = candidate.license_name or candidate.license_url
    if license_part:
        if candidate.license_url and candidate.license_name:
            license_part = f"{candidate.license_name} ({candidate.license_url})"
        parts.append(f"license: {license_part}")

    return " — ".join(parts)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def ensure_json_parent(path: str | Path) -> Path:
    """Make sure the parent directory of ``path`` exists; return as Path."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p
