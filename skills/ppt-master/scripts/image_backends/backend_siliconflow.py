#!/usr/bin/env python3
"""
SiliconFlow image generation backend.

Configuration keys:
  SILICONFLOW_API_KEY   (required)
  SILICONFLOW_BASE_URL  (optional)
  SILICONFLOW_MODEL     (optional)
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend siliconflow")
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


DEFAULT_ENDPOINT = "https://api.siliconflow.cn/v1/images/generations"
DEFAULT_MODEL = "Qwen/Qwen-Image"

ASPECT_RATIO_SIZE_MAP = {
    "512px": {
        "1:1": "1024x1024",
        "2:3": "1056x1584",
        "3:2": "1584x1056",
        "3:4": "1140x1472",
        "4:3": "1472x1140",
        "4:5": "1140x1425",
        "5:4": "1425x1140",
        "9:16": "928x1664",
        "16:9": "1664x928",
    },
    "1K": {
        "1:1": "1328x1328",
        "2:3": "1056x1584",
        "3:2": "1584x1056",
        "3:4": "1140x1472",
        "4:3": "1472x1140",
        "4:5": "1140x1425",
        "5:4": "1425x1140",
        "9:16": "928x1664",
        "16:9": "1664x928",
    },
    "2K": {
        "1:1": "2048x2048",
        "2:3": "1536x2048",
        "3:2": "2048x1536",
        "3:4": "1536x2048",
        "4:3": "2048x1536",
        "4:5": "1638x2048",
        "5:4": "2048x1638",
        "9:16": "1152x2048",
        "16:9": "2048x1152",
    },
    "4K": {
        "1:1": "2048x2048",
        "2:3": "1536x2048",
        "3:2": "2048x1536",
        "3:4": "1536x2048",
        "4:3": "2048x1536",
        "4:5": "1638x2048",
        "5:4": "2048x1638",
        "9:16": "1152x2048",
        "16:9": "2048x1152",
    },
}


def _resolve_url(base_url: str) -> str:
    """Resolve the SiliconFlow generation endpoint."""
    base = base_url.rstrip("/")
    if base.endswith("/images/generations"):
        return base
    return base + "/v1/images/generations"


def _resolve_size(aspect_ratio: str, image_size: str) -> str:
    """Resolve the target resolution for a ratio and logical size preset."""
    normalized = normalize_image_size(image_size)
    size = (ASPECT_RATIO_SIZE_MAP.get(normalized) or {}).get(aspect_ratio)
    if not size:
        supported = sorted(ASPECT_RATIO_SIZE_MAP["1K"])
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for SiliconFlow backend. "
            f"Supported: {supported}"
        )
    return size


def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = DEFAULT_ENDPOINT) -> str:
    """Generate one image with the SiliconFlow backend."""
    size = _resolve_size(aspect_ratio, image_size)
    url = _resolve_url(base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "prompt": prompt,
        "image_size": size,
    }

    print("[SiliconFlow]")
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
        raise http_error(response, "SiliconFlow image generation")

    data = response.json()
    images = data.get("images") or []
    image_url = images[0].get("url") if images else None
    if not image_url:
        raise RuntimeError(f"SiliconFlow response missing image URL: {data}")

    path = resolve_output_path(prompt, output_dir, filename, ".png")
    return download_image(image_url, path)


def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """Generate an image with retries using the SiliconFlow backend."""
    api_key = require_api_key(
        "SILICONFLOW_API_KEY",
        message="No API key found. Set SILICONFLOW_API_KEY in the current environment or a .env file.",
    )
    base_url = os.environ.get("SILICONFLOW_BASE_URL") or DEFAULT_ENDPOINT
    resolved_model = model or os.environ.get("SILICONFLOW_MODEL") or DEFAULT_MODEL

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
