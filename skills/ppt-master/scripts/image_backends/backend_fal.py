#!/usr/bin/env python3
"""
fal.ai image generation backend.

Configuration keys:
  FAL_KEY / FAL_API_KEY   (required)
  FAL_BASE_URL            (optional)
  FAL_MODEL               (optional)
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend fal")
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


VALID_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "3:4", "4:3"]
DEFAULT_ENDPOINT = "https://fal.run"
DEFAULT_MODEL = "fal-ai/imagen3/fast"


def _resolve_url(base_url: str, model: str) -> str:
    """Resolve the full fal endpoint URL for a model."""
    base = base_url.rstrip("/")
    if base.endswith(model):
        return base
    return f"{base}/{model}"


def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = DEFAULT_ENDPOINT) -> str:
    """Generate one image with the fal.ai backend."""
    del image_size

    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for fal backend. "
            f"Supported: {VALID_ASPECT_RATIOS}"
        )

    url = _resolve_url(base_url, model)
    headers = {
        "Authorization": f"Key {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "num_images": 1,
    }

    print("[fal.ai]")
    print(f"  Model:        {model}")
    print(f"  Prompt:       {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print(f"  Aspect Ratio: {aspect_ratio}")
    print()
    print("  [..] Generating...", end="", flush=True)
    start = time.time()
    response = requests.post(url, headers=headers, json=payload, timeout=300)
    elapsed = time.time() - start
    print(f"\n  [DONE] Response received ({elapsed:.1f}s)")

    if response.status_code != 200:
        raise http_error(response, "fal image generation")

    data = response.json()
    images = data.get("images") or []
    image_url = images[0].get("url") if images else None
    if not image_url:
        raise RuntimeError(f"fal response missing image URL: {data}")

    path = resolve_output_path(prompt, output_dir, filename, ".png")
    return download_image(image_url, path)


def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """Generate an image with retries using the fal.ai backend."""
    api_key = require_api_key(
        "FAL_KEY",
        "FAL_API_KEY",
        message="No API key found. Set FAL_KEY or FAL_API_KEY in the current environment or a .env file.",
    )
    base_url = os.environ.get("FAL_BASE_URL") or DEFAULT_ENDPOINT
    resolved_model = model or os.environ.get("FAL_MODEL") or DEFAULT_MODEL

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
