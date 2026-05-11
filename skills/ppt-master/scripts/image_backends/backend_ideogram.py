#!/usr/bin/env python3
"""
Ideogram image generation backend.

Configuration keys:
  IDEOGRAM_API_KEY   (required)
  IDEOGRAM_BASE_URL  (optional)
  IDEOGRAM_MODEL     (optional)
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend ideogram")
    raise SystemExit(0)

import os
import time

import requests

from image_backends.backend_common import (
    MAX_RETRIES,
    download_image,
    http_error,
    is_rate_limit_error,
    require_api_key,
    resolve_output_path,
    retry_delay,
)


ASPECT_RATIO_MAP = {
    "1:1": "1x1",
    "1:4": "1x4",
    "2:3": "2x3",
    "3:2": "3x2",
    "3:4": "3x4",
    "4:1": "4x1",
    "4:3": "4x3",
    "4:5": "4x5",
    "5:4": "5x4",
    "9:16": "9x16",
    "16:9": "16x9",
    "21:9": "21x9",
}

DEFAULT_BASE_URL = "https://api.ideogram.ai"
DEFAULT_MODEL = "ideogram-v3"
MODEL_ALIASES = {"ideogram-v3", "v3"}

IMAGE_SIZE_TO_SPEED = {
    "512px": "TURBO",
    "1K": "DEFAULT",
    "2K": "QUALITY",
    "4K": "QUALITY",
}


def _resolve_url(base_url: str) -> str:
    """Resolve the Ideogram generation endpoint."""
    base = base_url.rstrip("/")
    if base.endswith("/generate"):
        return base
    return base + "/v1/ideogram-v3/generate"


def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = DEFAULT_BASE_URL) -> str:
    """Generate one image with the Ideogram backend."""
    normalized_model = model.strip().lower()
    if normalized_model not in MODEL_ALIASES:
        raise ValueError(
            f"Unsupported Ideogram model '{model}'. Supported: {sorted(MODEL_ALIASES)}"
        )

    mapped_ratio = ASPECT_RATIO_MAP.get(aspect_ratio)
    if not mapped_ratio:
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for Ideogram backend. "
            f"Supported: {sorted(ASPECT_RATIO_MAP)}"
        )

    rendering_speed = IMAGE_SIZE_TO_SPEED.get(image_size, "DEFAULT")
    url = _resolve_url(base_url)
    headers = {"Api-Key": api_key}
    files = {
        "prompt": (None, prompt),
        "aspect_ratio": (None, mapped_ratio),
        "rendering_speed": (None, rendering_speed),
    }

    print("[Ideogram]")
    print(f"  Model:        {normalized_model}")
    print(f"  Prompt:       {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print(f"  Aspect Ratio: {aspect_ratio} -> {mapped_ratio}")
    print(f"  Render Speed: {rendering_speed}")
    print()
    print("  [..] Generating...", end="", flush=True)
    start = time.time()
    response = requests.post(url, headers=headers, files=files, timeout=300)
    elapsed = time.time() - start
    print(f"\n  [DONE] Response received ({elapsed:.1f}s)")

    if response.status_code != 200:
        raise http_error(response, "Ideogram generation")

    payload = response.json()
    data = payload.get("data") or []
    image_url = data[0].get("url") if data else None
    if not image_url:
        raise RuntimeError(f"Ideogram response missing image URL: {payload}")

    path = resolve_output_path(prompt, output_dir, filename, ".png")
    return download_image(image_url, path)


def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """Generate an image with retries using the Ideogram backend."""
    api_key = require_api_key(
        "IDEOGRAM_API_KEY",
        message="No API key found. Set IDEOGRAM_API_KEY in the current environment or a .env file.",
    )
    base_url = os.environ.get("IDEOGRAM_BASE_URL") or DEFAULT_BASE_URL
    resolved_model = model or os.environ.get("IDEOGRAM_MODEL") or DEFAULT_MODEL

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return _generate_image(
                api_key=api_key,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                image_size=image_size,
                output_dir=output_dir,
                filename=filename,
                model=resolved_model,
                base_url=base_url,
            )
        except Exception as exc:
            last_error = exc
            if attempt >= max_retries:
                break
            limited = is_rate_limit_error(exc)
            delay = retry_delay(attempt, rate_limited=limited)
            label = "Rate limit hit" if limited else f"Error: {exc}"
            print(f"\n  [WARN] {label}. Retrying in {delay}s...")
            time.sleep(delay)

    raise RuntimeError(f"Failed after {max_retries + 1} attempts. Last error: {last_error}")
