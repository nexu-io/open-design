#!/usr/bin/env python3
"""Web image search CLI.

Sister tool to ``image_gen.py``: instead of generating an image from a
prompt, this searches openly-licensed image providers and downloads a
single best match.

Workflow:
    1. Build an :class:`ImageSearchRequest` from CLI args.
    2. Quality-first license search:
       - Default: ask each provider for ``all`` allowed matches (CC0,
         Public Domain, Pexels, Pixabay, CC BY, CC BY-SA), pick the
         highest-scoring downloadable candidate, and record whether it
         needs attribution.
       - Strict mode: when ``--strict-no-attribution`` is set, ask only
         for ``no-attribution-only`` matches and fail if none can be
         downloaded.
    3. Download the chosen image into ``--output``.
    4. Append a record to ``image_sources.json`` (the single source of
       truth for downstream credit rendering).

Examples:
    # Default: zero-config, quality-first across allowed licenses
    python3 scripts/image_search.py "offshore wind farm" \
        --filename cover_bg.jpg --slide 01_cover \
        --orientation landscape -o projects/demo/images

    # Strict mode: refuse anything that would require attribution
    python3 scripts/image_search.py "abstract gradient" \
        --filename hero.jpg --strict-no-attribution \
        -o projects/demo/images

    # Pin a specific provider (useful when an API key is set)
    python3 scripts/image_search.py "executive meeting" \
        --filename team.jpg --provider pexels \
        --orientation landscape -o projects/demo/images
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

# Make sibling modules importable when this script is invoked directly.
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from config import load_prefixed_env_file  # noqa: E402
from image_backends.backend_common import download_image  # noqa: E402
from image_sources.provider_common import (  # noqa: E402
    AssetCandidate,
    ImageSearchRequest,
    USER_AGENT,
    build_attribution_text,
    ensure_json_parent,
    score_candidate,
)


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

PROVIDER_MODULES: dict[str, str] = {
    "openverse": "image_sources.provider_openverse",
    "wikimedia": "image_sources.provider_wikimedia",
    "pexels": "image_sources.provider_pexels",
    "pixabay": "image_sources.provider_pixabay",
}

# Providers that work without configuration. ``image_search.py`` defaults
# to these so a fresh clone can search immediately.
ZERO_CONFIG_PROVIDERS: tuple[str, ...] = ("openverse", "wikimedia")
KEYED_PROVIDERS: tuple[str, ...] = ("pexels", "pixabay")
ALL_PROVIDERS: tuple[str, ...] = ZERO_CONFIG_PROVIDERS + KEYED_PROVIDERS

ORIENTATION_CHOICES = ("any", "landscape", "portrait", "square")


# ---------------------------------------------------------------------------
# .env loading
# ---------------------------------------------------------------------------


def _load_search_env_file() -> None:
    """Load image-search keys from the shared PPT Master .env locations."""
    load_prefixed_env_file(("PEXELS_", "PIXABAY_"))


# ---------------------------------------------------------------------------
# Provider dispatch
# ---------------------------------------------------------------------------


def _load_provider(name: str):
    return importlib.import_module(PROVIDER_MODULES[name])


def _is_keyed_provider_unconfigured(provider_name: str, exc: Exception) -> bool:
    """Treat 'API key missing' as a non-fatal skip so the default provider
    chain can keep going."""
    if provider_name not in KEYED_PROVIDERS:
        return False
    return "API_KEY" in str(exc)


def _try_provider(
    name: str,
    request: ImageSearchRequest,
    license_tier_filter: str,
) -> Optional[list[AssetCandidate]]:
    """Run one provider; print and swallow recoverable errors, return None
    so the dispatcher can try the next provider."""
    try:
        module = _load_provider(name)
        return module.search(request, license_tier_filter=license_tier_filter)
    except RuntimeError as exc:
        if _is_keyed_provider_unconfigured(name, exc):
            print(
                f"  [{name}] skipped: {exc}",
                file=sys.stderr,
            )
        else:
            print(f"  [{name}] error: {exc}", file=sys.stderr)
        return None
    except (requests.RequestException, ValueError) as exc:
        print(f"  [{name}] error: {exc}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Post-download quality validation
# ---------------------------------------------------------------------------

_MIN_DOWNLOAD_PIXELS = 800 * 600  # reject anything below ~480K px


def _validate_downloaded_quality(path: Path) -> bool:
    """Reject images that are too small after download.

    Upstream metadata can be inaccurate (e.g. Openverse aggregates rawpixel
    which only exposes a preview). This function checks what was actually
    written to disk and rejects thumbnails / previews.
    """
    try:
        from PIL import Image  # type: ignore
    except ImportError:
        return True  # can't check without Pillow; assume OK
    try:
        with Image.open(path) as im:
            w, h = im.size
            if w * h < _MIN_DOWNLOAD_PIXELS:
                print(
                    f"    rejected: downloaded image too small "
                    f"({w}x{h} = {w*h:,} px < {_MIN_DOWNLOAD_PIXELS:,} px minimum)",
                    file=sys.stderr,
                )
                return False
            return True
    except (OSError, ValueError):
        return True  # unreadable image; let downstream handle it


def _save_candidates_pool(
    ranked: list[tuple[float, str, AssetCandidate]],
    output_dir: Path,
    stem: str,
    selected_filename: str,
    max_candidates: int = 8,
) -> None:
    """Download top-N candidates into ``candidates/<stem>/`` and write
    a ``candidates.json`` manifest for manual review."""
    cand_dir = output_dir / "candidates" / stem
    cand_dir.mkdir(parents=True, exist_ok=True)

    pool: list[dict] = []
    idx = 0
    for score, provider_name, candidate in ranked:
        if idx >= max_candidates:
            break
        suffix = Path(candidate.download_url.split("?")[0]).suffix or ".jpg"
        cand_filename = f"candidate_{idx + 1:02d}{suffix}"
        cand_path = cand_dir / cand_filename
        try:
            download_image(
                candidate.download_url,
                str(cand_path),
                headers={"User-Agent": USER_AGENT},
            )
            if not _validate_downloaded_quality(cand_path):
                cand_path.unlink(missing_ok=True)
                continue
        except (requests.RequestException, OSError, RuntimeError, ValueError):
            continue
        idx += 1
        actual_dim = _measure_actual_image(cand_path)
        pool.append({
            "rank": idx,
            "score": round(score, 2),
            "filename": cand_filename,
            "provider": provider_name,
            "title": candidate.title,
            "author": candidate.author,
            "source_page_url": candidate.source_page_url,
            "download_url": candidate.download_url,
            "license_name": candidate.license_name,
            "license_url": candidate.license_url,
            "license_tier": candidate.license_tier,
            "attribution_required": candidate.license_tier == "attribution-required",
            "width": actual_dim[0] if actual_dim else candidate.width,
            "height": actual_dim[1] if actual_dim else candidate.height,
        })

    if pool:
        meta = {
            "target_filename": selected_filename,
            "selected": pool[0]["filename"],
            "searched_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "candidates": pool,
        }
        meta_path = cand_dir / "candidates.json"
        meta_path.write_text(
            json.dumps(meta, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"  candidates: {cand_dir}/ ({len(pool)} saved)", file=sys.stderr)


def search_and_download(
    providers: list[str],
    request: ImageSearchRequest,
    *,
    output_path: Path,
    strict_no_attribution: bool,
    save_candidates: bool = True,
    max_candidates: int = 8,
) -> tuple[Optional[AssetCandidate], Optional[str], Optional[str]]:
    """Find a candidate AND successfully download it.

    When ``save_candidates`` is True (default), the top-N candidates are
    also saved to ``candidates/<stem>/`` for manual review.

    Returns ``(candidate, provider_name, stage)`` for the successfully
    downloaded image, or ``(None, None, None)`` if every combination
    failed.
    """
    license_filters: list[str] = (
        ["no-attribution-only"] if strict_no_attribution else ["all"]
    )

    for stage in license_filters:
        ranked: list[tuple[float, str, AssetCandidate]] = []
        for provider_name in providers:
            print(f"  -> trying {provider_name} ({stage}) ...", file=sys.stderr)
            candidates = _try_provider(provider_name, request, stage)
            if not candidates:
                continue

            provider_ranked = [
                (score_candidate(c, request), provider_name, c) for c in candidates
            ]
            provider_ranked = [
                item for item in provider_ranked if item[0] != float("-inf")
            ]
            if not provider_ranked:
                print(
                    f"    no candidate matched the query; trying next provider/stage",
                    file=sys.stderr,
                )
                continue
            ranked.extend(provider_ranked)

        sorted_ranked = sorted(ranked, key=lambda item: item[0], reverse=True)

        # --- Save candidate pool (before picking the winner) ---
        if save_candidates and sorted_ranked:
            stem = Path(output_path).stem
            _save_candidates_pool(
                sorted_ranked, output_path.parent, stem, output_path.name,
                max_candidates=max_candidates,
            )

        # --- Pick the best downloadable candidate ---
        for _score, provider_name, candidate in sorted_ranked:
            # If candidates were already saved, the file may already
            # exist in the candidates dir — but we still need the
            # primary copy at output_path.
            try:
                download_image(
                    candidate.download_url,
                    str(output_path),
                    headers={"User-Agent": USER_AGENT},
                )
                if not _validate_downloaded_quality(output_path):
                    output_path.unlink(missing_ok=True)
                    continue
                return candidate, provider_name, stage
            except (requests.RequestException, OSError, RuntimeError, ValueError) as exc:
                print(
                    f"    download failed for {candidate.title!r}: {exc}",
                    file=sys.stderr,
                )
                continue

    return None, None, None


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def default_manifest_path(output_dir: str) -> Path:
    return Path(output_dir) / "image_sources.json"


def _measure_actual_image(path: Path) -> Optional[tuple[int, int]]:
    """Return ``(width, height)`` of the file actually saved at ``path``.

    Upstream metadata (``candidate.width``/``height``) describes the
    original image on the provider's server, which may differ from what
    we are allowed to download — for example, second-tier sources
    aggregated by Openverse (rawpixel etc.) often only expose a
    1024px-wide preview. The Executor needs to know what is actually on
    disk for layout purposes; this function provides that ground truth.

    Returns ``None`` if Pillow is unavailable or the file is unreadable.
    """
    try:
        from PIL import Image  # type: ignore
    except ImportError:
        return None
    try:
        with Image.open(path) as im:
            return int(im.width), int(im.height)
    except (OSError, ValueError):
        return None


def _candidate_to_manifest_item(
    candidate: AssetCandidate,
    args: argparse.Namespace,
    *,
    provider_name: str,
    stage: str,
    actual_dimensions: Optional[tuple[int, int]] = None,
) -> dict:
    """Build the manifest entry.

    ``width`` / ``height`` reflect the file actually saved to disk
    (measured by Pillow after download). The upstream-claimed dimensions
    are only kept under ``metadata_dimensions`` when they disagree with
    reality, which is the only case where this distinction matters.
    """
    if actual_dimensions is not None:
        width, height = actual_dimensions
    else:
        width, height = candidate.width, candidate.height

    item = {
        "filename": args.filename,
        "slide": args.slide,
        "purpose": args.purpose,
        "search_query": args.query,
        "orientation": args.orientation,
        "provider": provider_name,
        "stage": stage,
        "title": candidate.title,
        "author": candidate.author,
        "source_page_url": candidate.source_page_url,
        "download_url": candidate.download_url,
        "license_name": candidate.license_name,
        "license_url": candidate.license_url,
        "license_tier": candidate.license_tier,
        "attribution_required": candidate.license_tier == "attribution-required",
        "width": width,
        "height": height,
        "attribution_text": build_attribution_text(args.filename, candidate),
        "status": "sourced",
    }

    # Only carry upstream-claimed dimensions when they differ — this flags
    # cases where the provider returned a preview rather than the original.
    if (
        actual_dimensions is not None
        and candidate.width
        and candidate.height
        and (candidate.width, candidate.height) != actual_dimensions
    ):
        item["metadata_dimensions"] = {
            "width": candidate.width,
            "height": candidate.height,
            "note": "upstream-reported size; actual downloaded file is smaller (likely a preview)",
        }

    return item


def _read_existing_manifest(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(
            f"  warning: existing manifest at {path} is unreadable, "
            f"starting fresh ({exc})",
            file=sys.stderr,
        )
        return {}


def write_sources_manifest(path: Path, item: dict) -> Path:
    """Append ``item`` to the manifest at ``path``, replacing any prior
    entry that targets the same filename."""
    manifest_path = ensure_json_parent(path)
    payload = _read_existing_manifest(manifest_path)

    items: list[dict] = list(payload.get("items") or [])
    items = [i for i in items if i.get("filename") != item["filename"]]
    items.append(item)

    payload["items"] = items
    payload["generated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload.setdefault(
        "license_verification",
        "provider metadata used; manual review recommended for external delivery",
    )

    manifest_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return manifest_path


# ---------------------------------------------------------------------------
# Promote: replace primary image with a candidate
# ---------------------------------------------------------------------------


def promote_candidate(
    output_dir: Path,
    target_filename: str,
    candidate_filename: str,
    manifest_path: Optional[Path] = None,
) -> int:
    """Replace the primary image with a candidate from the pool.

    Steps:
        1. Copy ``candidates/<stem>/<candidate_filename>`` → ``<target_filename>``
        2. Update ``candidates.json`` selected field
        3. Update ``image_sources.json`` with the candidate's metadata
    """
    import shutil

    stem = Path(target_filename).stem
    cand_dir = output_dir / "candidates" / stem
    cand_meta_path = cand_dir / "candidates.json"

    if not cand_meta_path.exists():
        print(f"Error: {cand_meta_path} not found.", file=sys.stderr)
        return 1

    meta = json.loads(cand_meta_path.read_text(encoding="utf-8"))
    candidates = meta.get("candidates", [])

    entry = next((c for c in candidates if c["filename"] == candidate_filename), None)
    if entry is None:
        names = [c["filename"] for c in candidates]
        print(
            f"Error: '{candidate_filename}' not found. Available: {', '.join(names)}",
            file=sys.stderr,
        )
        return 1

    src_path = cand_dir / candidate_filename
    dst_path = output_dir / target_filename
    if not src_path.exists():
        print(f"Error: {src_path} does not exist on disk.", file=sys.stderr)
        return 1

    shutil.copy2(str(src_path), str(dst_path))
    print(f"  promoted: {candidate_filename} → {target_filename}", file=sys.stderr)

    # Update candidates.json
    meta["selected"] = candidate_filename
    cand_meta_path.write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )

    # Update image_sources.json
    mpath = manifest_path or default_manifest_path(str(output_dir))
    actual_dim = _measure_actual_image(dst_path)
    w = actual_dim[0] if actual_dim else entry.get("width", 0)
    h = actual_dim[1] if actual_dim else entry.get("height", 0)

    manifest = _read_existing_manifest(mpath)
    items: list[dict] = list(manifest.get("items") or [])
    for item in items:
        if item.get("filename") == target_filename:
            item["provider"] = entry["provider"]
            item["title"] = entry["title"]
            item["author"] = entry["author"]
            item["source_page_url"] = entry["source_page_url"]
            item["download_url"] = entry["download_url"]
            item["license_name"] = entry["license_name"]
            item["license_url"] = entry.get("license_url", "")
            item["license_tier"] = entry["license_tier"]
            item["attribution_required"] = entry.get("attribution_required", False)
            item["width"] = w
            item["height"] = h
            item.pop("metadata_dimensions", None)
            item["status"] = "promoted"
            break
    manifest["items"] = items
    manifest["generated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    mpath.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"  manifest updated: {mpath}", file=sys.stderr)
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Search openly-licensed web images and download a single best match. "
            "Sister to image_gen.py."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("query", help="Search query (2-5 keywords work best).")
    parser.add_argument(
        "--filename",
        required=True,
        help="Local filename for the chosen image (e.g. cover_bg.jpg).",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=".",
        help="Output directory. Manifest defaults to <output>/image_sources.json.",
    )
    parser.add_argument(
        "--provider",
        choices=ALL_PROVIDERS,
        default=None,
        help=(
            "Pin one provider. Default: try zero-config providers (openverse, "
            "wikimedia) plus any keyed provider whose API key is set."
        ),
    )
    parser.add_argument(
        "--orientation",
        choices=ORIENTATION_CHOICES,
        default="any",
        help="Preferred orientation.",
    )
    parser.add_argument(
        "--purpose",
        default="",
        help="Purpose tag stored in the manifest (e.g. background, hero, side).",
    )
    parser.add_argument(
        "--slide",
        default="",
        help="Slide identifier the image belongs to (e.g. 01_cover).",
    )
    parser.add_argument(
        "--strict-no-attribution",
        action="store_true",
        help=(
            "Refuse CC BY / CC BY-SA results. If no attribution-free match is "
            "downloadable, exit non-zero."
        ),
    )
    parser.add_argument(
        "--min-width",
        type=int,
        default=1200,
        help="Minimum acceptable image width in pixels (default: 1200).",
    )
    parser.add_argument(
        "--min-height",
        type=int,
        default=800,
        help="Minimum acceptable image height in pixels (default: 800).",
    )
    parser.add_argument(
        "--manifest",
        default=None,
        help="Override manifest path. Defaults to <output>/image_sources.json.",
    )
    parser.add_argument(
        "--no-candidates",
        action="store_true",
        help="Disable candidate pool saving (only download the best match).",
    )
    parser.add_argument(
        "--max-candidates",
        type=int,
        default=8,
        help="Max number of candidates to save (default: 8).",
    )
    parser.add_argument(
        "--promote",
        default=None,
        metavar="CANDIDATE_FILE",
        help=(
            "Promote a candidate to replace the primary image. "
            "Example: --promote candidate_03.jpg --filename 05_wulong.jpg -o images/"
        ),
    )
    return parser


def _default_provider_chain() -> list[str]:
    """Keyed high-quality providers first; zero-config providers as fallback.
    This is the search order when ``--provider`` is unset."""
    chain: list[str] = []
    if os.environ.get("PEXELS_API_KEY"):
        chain.append("pexels")
    if os.environ.get("PIXABAY_API_KEY"):
        chain.append("pixabay")
    chain.extend(ZERO_CONFIG_PROVIDERS)
    return chain


def main(argv: Optional[list[str]] = None) -> int:
    _load_search_env_file()

    parser = build_parser()
    args = parser.parse_args(argv)

    output_dir = Path(args.output)

    # --- Promote mode ---
    if args.promote:
        return promote_candidate(
            output_dir,
            args.filename,
            args.promote,
            manifest_path=Path(args.manifest) if args.manifest else None,
        )

    # --- Search mode ---
    request = ImageSearchRequest(
        query=args.query,
        purpose=args.purpose,
        orientation="" if args.orientation == "any" else args.orientation,
        filename=args.filename,
        slide=args.slide,
        min_width=args.min_width,
        min_height=args.min_height,
    )

    providers = [args.provider] if args.provider else _default_provider_chain()

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / args.filename

    print(f"Searching providers: {', '.join(providers)}", file=sys.stderr)
    candidate, provider_name, stage = search_and_download(
        providers,
        request,
        output_path=output_path,
        strict_no_attribution=args.strict_no_attribution,
        save_candidates=not args.no_candidates,
        max_candidates=args.max_candidates,
    )

    if candidate is None:
        print(
            "No acceptable candidates could be downloaded across all "
            "providers/filters. Try a shorter query, use default attribution "
            "mode if strict mode is enabled, or set an API key for a keyed provider.",
            file=sys.stderr,
        )
        return 1

    print(
        f"  picked: {candidate.title!r} from {provider_name} "
        f"({candidate.license_name or 'no license string'}, "
        f"{candidate.license_tier})",
        file=sys.stderr,
    )

    # Measure what was actually written to disk; upstream metadata can be
    # off (e.g. Openverse aggregates rawpixel which only exposes previews).
    actual_dimensions = _measure_actual_image(output_path)
    if (
        actual_dimensions is not None
        and candidate.width
        and candidate.height
        and actual_dimensions[0] * actual_dimensions[1]
        < 0.5 * candidate.width * candidate.height
    ):
        print(
            f"\n[!] Downloaded image is much smaller than upstream metadata "
            f"({actual_dimensions[0]}x{actual_dimensions[1]} vs "
            f"{candidate.width}x{candidate.height}). The provider likely "
            f"only exposes a preview here. Layout based on the manifest's "
            f"width/height will be accurate; the metadata_dimensions field "
            f"is preserved for reference.",
            file=sys.stderr,
        )

    item = _candidate_to_manifest_item(
        candidate,
        args,
        provider_name=provider_name,
        stage=stage,
        actual_dimensions=actual_dimensions,
    )
    manifest_path = Path(args.manifest) if args.manifest else default_manifest_path(args.output)
    write_sources_manifest(manifest_path, item)
    print(f"  manifest: {manifest_path}", file=sys.stderr)

    if candidate.license_tier == "attribution-required":
        print(
            "\n[!] This image requires on-slide attribution. "
            "Executor should add a small credit element to the slide using "
            "the 'attribution_text' field in the manifest.",
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
