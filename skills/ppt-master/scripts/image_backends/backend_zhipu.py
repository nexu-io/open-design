#!/usr/bin/env python3
"""
Zhipu GLM-Image generation backend.

Configuration keys:
  ZHIPU_API_KEY / BIGMODEL_API_KEY   (required)
  ZHIPU_BASE_URL                     (optional)
  ZHIPU_MODEL                        (optional)
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend zhipu")
    raise SystemExit(0)

import os
import time

import requests

from image_backends.backend_common import (
    MAX_RETRIES,
    download_image,
    http_error,
    is_rate_limit_error,
    normalize_image_size,
    require_api_key,
    resolve_output_path,
    retry_delay,
)


DEFAULT_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/images/generations"
DEFAULT_MODEL = "glm-image"

ASPECT_RATIO_SIZE_MAP = {
    "512px": {
        "1:1": "1024x1024",
        "2:3": "768x1152",
        "3:2": "1152x768",
        "3:4": "864x1152",
        "4:3": "1152x864",
        "4:5": "1024x1280",
        "5:4": "1280x1024",
        "9:16": "720x1440",
        "16:9": "1440x720",
        "21:9": "1536x640",
    },
    "1K": {
        "1:1": "1280x1280",
        "2:3": "960x1440",
        "3:2": "1440x960",
        "3:4": "1024x1365",
        "4:3": "1365x1024",
        "4:5": "1024x1280",
        "5:4": "1280x1024",
        "9:16": "768x1344",
        "16:9": "1344x768",
        "21:9": "1536x640",
    },
    "2K": {
        "1:1": "1440x1440",
        "2:3": "1152x1728",
        "3:2": "1728x1152",
        "3:4": "1152x1536",
        "4:3": "1536x1152",
        "4:5": "1280x1600",
        "5:4": "1600x1280",
        "9:16": "720x1440",
        "16:9": "1440x720",
        "21:9": "1792x768",
    },
    "4K": {
        "1:1": "1440x1440",
        "2:3": "1152x1728",
        "3:2": "1728x1152",
        "3:4": "1152x1536",
        "4:3": "1536x1152",
        "4:5": "1280x1600",
        "5:4": "1600x1280",
        "9:16": "720x1440",
        "16:9": "1440x720",
        "21:9": "1792x768",
    },
}


def _resolve_url(base_url: str) -> str:
    """Resolve the Zhipu generation endpoint."""
    base = base_url.rstrip("/")
    if base.endswith("/images/generations"):
        return base
    return base + "/api/paas/v4/images/generations"


def _resolve_size(aspect_ratio: str, image_size: str) -> str:
    """Resolve the target resolution for a ratio and logical size preset."""
    normalized = normalize_image_size(image_size)
    size = (ASPECT_RATIO_SIZE_MAP.get(normalized) or {}).get(aspect_ratio)
    if not size:
        supported = sorted(ASPECT_RATIO_SIZE_MAP["1K"])
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for Zhipu backend. "
            f"Supported: {supported}"
        )
    return size


def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = DEFAULT_ENDPOINT) -> str:
    """Generate one image with the Zhipu backend."""
    size = _resolve_size(aspect_ratio, image_size)
    url = _resolve_url(base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "prompt": prompt,
        "size": size,
    }

    print("[Zhipu GLM-Image]")
    print(f"  Model:        {model}")
    print(f"  Prompt:       {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print(f"  Aspect Ratio: {aspect_ratio}")
    print(f"  Resolution:   {size}")
    print()
    print("  [..] Generating...", end="", flush=True)
    start = time.time()
    response = requests.post(url, headers=headers, json=payload, timeout=300)
    elapsed = time.time() - start
    print(f"\n  [DONE] Response received ({elapsed:.1f}s)")

    if response.status_code != 200:
        raise http_error(response, "Zhipu image generation")

    data = response.json()
    items = data.get("data") or []
    image_url = items[0].get("url") if items else None
    if not image_url:
        raise RuntimeError(f"Zhipu response missing image URL: {data}")

    path = resolve_output_path(prompt, output_dir, filename, ".png")
    return download_image(image_url, path)


def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """Generate an image with retries using the Zhipu backend."""
    api_key = require_api_key(
        "ZHIPU_API_KEY",
        "BIGMODEL_API_KEY",
        message="No API key found. Set ZHIPU_API_KEY or BIGMODEL_API_KEY in the current environment or a .env file.",
    )
    base_url = os.environ.get("ZHIPU_BASE_URL") or DEFAULT_ENDPOINT
    resolved_model = model or os.environ.get("ZHIPU_MODEL") or DEFAULT_MODEL

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
