#!/usr/bin/env python3
"""
Black Forest Labs FLUX image generation backend.

Configuration keys:
  BFL_API_KEY   (required)
  BFL_BASE_URL  (optional)
  BFL_MODEL     (optional)
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend bfl")
    raise SystemExit(0)

import os
import time

import requests

from image_backends.backend_common import (
    MAX_RETRIES,
    download_image,
    http_error,
    is_rate_limit_error,
    poll_json,
    require_api_key,
    resolve_output_path,
    retry_delay,
)


VALID_ASPECT_RATIOS = [
    "1:1", "2:3", "3:2", "3:4", "4:3",
    "4:5", "5:4", "9:16", "16:9", "21:9",
]

DEFAULT_BASE_URL = "https://api.bfl.ai"
DEFAULT_MODEL = "flux-pro-1.1-ultra"

MODEL_ENDPOINTS = {
    "flux-pro-1.1": "/v1/flux-pro-1.1",
    "flux-pro-1.1-ultra": "/v1/flux-pro-1.1-ultra",
    "flux-dev": "/v1/flux-dev",
}

ASPECT_RATIO_TO_DIMENSIONS = {
    "1:1": (1024, 1024),
    "2:3": (1024, 1536),
    "3:2": (1536, 1024),
    "3:4": (1024, 1365),
    "4:3": (1365, 1024),
    "4:5": (1024, 1280),
    "5:4": (1280, 1024),
    "9:16": (1024, 1820),
    "16:9": (1820, 1024),
    "21:9": (2048, 878),
}


def _submit_request(url: str, headers: dict, payload: dict) -> dict:
    """Submit a BFL generation request and return the JSON response."""
    response = requests.post(url, headers=headers, json=payload, timeout=180)
    if response.status_code != 200:
        raise http_error(response, "BFL generation request")
    return response.json()


def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = DEFAULT_BASE_URL) -> str:
    """Generate one image with the Black Forest Labs backend."""
    del image_size  # BFL quality is primarily controlled by model choice.

    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for BFL backend. "
            f"Supported: {VALID_ASPECT_RATIOS}"
        )

    normalized_model = model.strip().lower()
    endpoint = MODEL_ENDPOINTS.get(normalized_model)
    if not endpoint:
        supported = sorted(MODEL_ENDPOINTS)
        raise ValueError(f"Unsupported BFL model '{model}'. Supported: {supported}")

    headers = {
        "x-key": api_key,
        "accept": "application/json",
        "Content-Type": "application/json",
    }

    payload = {
        "prompt": prompt,
        "prompt_upsampling": False,
        "output_format": "png",
    }

    if normalized_model.endswith("-ultra"):
        payload["aspect_ratio"] = aspect_ratio
        payload["raw"] = False
    else:
        width, height = ASPECT_RATIO_TO_DIMENSIONS[aspect_ratio]
        payload["width"] = width
        payload["height"] = height

    url = base_url.rstrip("/") + endpoint

    print("[Black Forest Labs]")
    print(f"  Model:        {normalized_model}")
    print(f"  Prompt:       {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print(f"  Aspect Ratio: {aspect_ratio}")
    print()
    print("  [..] Submitting request...", end="", flush=True)
    start = time.time()
    request_payload = _submit_request(url, headers, payload)
    elapsed = time.time() - start
    print(f"\n  [DONE] Request accepted ({elapsed:.1f}s)")

    polling_url = request_payload.get("polling_url")
    if not polling_url:
        raise RuntimeError(f"BFL response missing polling_url: {request_payload}")

    print("  [..] Polling result...")
    result_payload = poll_json(
        polling_url,
        {"x-key": api_key, "accept": "application/json"},
        status_label="status",
        ready_values=["Ready"],
        failed_values=["Error", "Failed", "Request Moderated", "Content Moderated"],
    )

    image_url = ((result_payload.get("result") or {}).get("sample"))
    if not image_url:
        raise RuntimeError(f"BFL result missing sample URL: {result_payload}")

    path = resolve_output_path(prompt, output_dir, filename, ".png")
    return download_image(image_url, path)


def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """Generate an image with retries using the BFL backend."""
    api_key = require_api_key(
        "BFL_API_KEY",
        message="No API key found. Set BFL_API_KEY in the current environment or a .env file.",
    )
    base_url = os.environ.get("BFL_BASE_URL") or DEFAULT_BASE_URL
    resolved_model = model or os.environ.get("BFL_MODEL") or DEFAULT_MODEL

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
