#!/usr/bin/env python3
"""
Stability AI image generation backend.

Configuration keys:
  STABILITY_API_KEY   (required)
  STABILITY_BASE_URL  (optional)
  STABILITY_MODEL     (optional)
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend stability")
    raise SystemExit(0)

import os
import time

import requests

from image_backends.backend_common import (
    MAX_RETRIES,
    http_error,
    is_rate_limit_error,
    report_resolution,
    require_api_key,
    resolve_output_path,
    retry_delay,
)


VALID_ASPECT_RATIOS = [
    "1:1", "2:3", "3:2", "3:4", "4:3",
    "4:5", "5:4", "9:16", "16:9", "21:9",
]

DEFAULT_BASE_URL = "https://api.stability.ai"
DEFAULT_MODEL = "stable-image-core"

MODEL_ENDPOINTS = {
    "core": "/v2beta/stable-image/generate/core",
    "stable-image-core": "/v2beta/stable-image/generate/core",
    "ultra": "/v2beta/stable-image/generate/ultra",
    "stable-image-ultra": "/v2beta/stable-image/generate/ultra",
}


def _resolve_endpoint(model: str, image_size: str, base_url: str) -> tuple[str, str]:
    """Resolve the Stability model alias and endpoint URL."""
    resolved_model = model or DEFAULT_MODEL
    if not model and image_size.upper() in ("2K", "4K"):
        resolved_model = "stable-image-ultra"

    normalized_model = resolved_model.lower()
    endpoint = MODEL_ENDPOINTS.get(normalized_model)
    if not endpoint:
        supported = sorted(MODEL_ENDPOINTS)
        raise ValueError(
            f"Unsupported Stability model '{resolved_model}'. Supported aliases: {supported}"
        )
    return normalized_model, base_url.rstrip("/") + endpoint


def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = DEFAULT_BASE_URL) -> str:
    """Generate one image with the Stability backend."""
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for Stability backend. "
            f"Supported: {VALID_ASPECT_RATIOS}"
        )

    resolved_model, url = _resolve_endpoint(model, image_size, base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "image/*",
    }
    data = {
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "output_format": "png",
    }

    print("[Stability AI]")
    print(f"  Model:        {resolved_model}")
    print(f"  Prompt:       {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print(f"  Aspect Ratio: {aspect_ratio}")
    print(f"  Preset Size:  {image_size}")
    print()
    print("  [..] Generating...", end="", flush=True)
    start = time.time()

    response = requests.post(url, headers=headers, data=data, timeout=300)
    elapsed = time.time() - start
    print(f"\n  [DONE] Response received ({elapsed:.1f}s)")

    if response.status_code != 200:
        raise http_error(response, "Stability generation")

    path = resolve_output_path(prompt, output_dir, filename, ".png")
    with open(path, "wb") as f:
        f.write(response.content)
    print(f"  File saved to: {path}")
    report_resolution(path)
    return path


def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """Generate an image with retries using the Stability backend."""
    api_key = require_api_key(
        "STABILITY_API_KEY",
        message="No API key found. Set STABILITY_API_KEY in the current environment or a .env file.",
    )
    base_url = os.environ.get("STABILITY_BASE_URL") or DEFAULT_BASE_URL
    resolved_model = model or os.environ.get("STABILITY_MODEL") or DEFAULT_MODEL

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
