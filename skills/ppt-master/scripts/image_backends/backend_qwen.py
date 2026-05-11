#!/usr/bin/env python3
"""
Alibaba Cloud Qwen image generation backend.

Configuration keys:
  QWEN_API_KEY / DASHSCOPE_API_KEY   (required)
  QWEN_BASE_URL                      (optional)
  QWEN_MODEL                         (optional)
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend qwen")
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


DEFAULT_ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
DEFAULT_MODEL = "qwen-image-2.0-pro"

ASPECT_RATIO_SIZE_MAP = {
    "512px": {
        "1:1": "1024*1024",
        "2:3": "768*1152",
        "3:2": "1152*768",
        "3:4": "864*1152",
        "4:3": "1152*864",
        "4:5": "896*1120",
        "5:4": "1120*896",
        "9:16": "720*1280",
        "16:9": "1280*720",
        "21:9": "1344*576",
    },
    "1K": {
        "1:1": "1536*1536",
        "2:3": "1024*1536",
        "3:2": "1536*1024",
        "3:4": "1152*1536",
        "4:3": "1536*1152",
        "4:5": "1216*1536",
        "5:4": "1536*1216",
        "9:16": "896*1600",
        "16:9": "1600*896",
        "21:9": "1792*768",
    },
    "2K": {
        "1:1": "2048*2048",
        "2:3": "1536*2048",
        "3:2": "2048*1536",
        "3:4": "1728*2368",
        "4:3": "2368*1728",
        "4:5": "1792*2240",
        "5:4": "2240*1792",
        "9:16": "1536*2688",
        "16:9": "2688*1536",
        "21:9": "2688*1152",
    },
    "4K": {
        "1:1": "2048*2048",
        "2:3": "1536*2048",
        "3:2": "2048*1536",
        "3:4": "1728*2368",
        "4:3": "2368*1728",
        "4:5": "1792*2240",
        "5:4": "2240*1792",
        "9:16": "1536*2688",
        "16:9": "2688*1536",
        "21:9": "2688*1152",
    },
}


def _resolve_url(base_url: str) -> str:
    """Resolve the Qwen generation endpoint."""
    base = base_url.rstrip("/")
    if base.endswith("/generation"):
        return base
    return base + "/api/v1/services/aigc/multimodal-generation/generation"


def _resolve_size(aspect_ratio: str, image_size: str) -> str:
    """Resolve the target resolution for a ratio and logical size preset."""
    normalized = normalize_image_size(image_size)
    size = (ASPECT_RATIO_SIZE_MAP.get(normalized) or {}).get(aspect_ratio)
    if not size:
        supported = sorted(ASPECT_RATIO_SIZE_MAP["1K"])
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for Qwen backend. "
            f"Supported: {supported}"
        )
    return size


def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = DEFAULT_ENDPOINT) -> str:
    """Generate one image with the Qwen backend."""
    size = _resolve_size(aspect_ratio, image_size)
    url = _resolve_url(base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": prompt}],
                }
            ]
        },
        "parameters": {
            "size": size,
            "prompt_extend": True,
            "watermark": False,
        },
    }

    print("[Alibaba Qwen Image]")
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
        raise http_error(response, "Qwen image generation")

    data = response.json()
    choices = ((data.get("output") or {}).get("choices") or [])
    contents = (((choices[0] if choices else {}).get("message") or {}).get("content") or [])
    image_url = contents[0].get("image") if contents else None
    if not image_url:
        raise RuntimeError(f"Qwen response missing image URL: {data}")

    path = resolve_output_path(prompt, output_dir, filename, ".png")
    return download_image(image_url, path)


def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """Generate an image with retries using the Qwen backend."""
    api_key = require_api_key(
        "QWEN_API_KEY",
        "DASHSCOPE_API_KEY",
        message="No API key found. Set QWEN_API_KEY or DASHSCOPE_API_KEY in the current environment or a .env file.",
    )
    base_url = os.environ.get("QWEN_BASE_URL") or DEFAULT_ENDPOINT
    resolved_model = model or os.environ.get("QWEN_MODEL") or DEFAULT_MODEL

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
