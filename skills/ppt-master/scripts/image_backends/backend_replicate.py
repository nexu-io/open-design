#!/usr/bin/env python3
"""
Replicate image generation backend.

Configuration keys:
  REPLICATE_API_KEY / REPLICATE_API_TOKEN   (required)
  REPLICATE_BASE_URL                        (optional)
  REPLICATE_MODEL                           (optional)
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend replicate")
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


VALID_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "3:4", "4:3", "3:2", "2:3", "4:5", "5:4", "21:9"]
DEFAULT_BASE_URL = "https://api.replicate.com/v1"
DEFAULT_MODEL = "black-forest-labs/flux-1.1-pro"


def _split_model(model: str) -> tuple[str, str]:
    """Split a Replicate model reference into owner and name."""
    parts = [part for part in model.strip().split("/") if part]
    if len(parts) != 2:
        raise ValueError(
            f"Replicate model must be in 'owner/name' format, got '{model}'."
        )
    return parts[0], parts[1]


def _extract_output_url(payload: dict) -> str | None:
    """Extract an output URL from a Replicate prediction payload."""
    output = payload.get("output")
    if isinstance(output, str):
        return output
    if isinstance(output, list) and output:
        first = output[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("url")
    if isinstance(output, dict):
        return output.get("url")
    return None


def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = DEFAULT_BASE_URL) -> str:
    """Generate one image with the Replicate backend."""
    del image_size

    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for Replicate backend. "
            f"Supported: {VALID_ASPECT_RATIOS}"
        )

    owner, name = _split_model(model)
    url = f"{base_url.rstrip('/')}/models/{owner}/{name}/predictions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Prefer": "wait=60",
    }

    payload = {
        "input": {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "output_format": "png",
        }
    }

    print("[Replicate]")
    print(f"  Model:        {model}")
    print(f"  Prompt:       {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print(f"  Aspect Ratio: {aspect_ratio}")
    print()
    print("  [..] Generating...", end="", flush=True)
    start = time.time()
    response = requests.post(url, headers=headers, json=payload, timeout=180)
    elapsed = time.time() - start
    print(f"\n  [DONE] Initial response received ({elapsed:.1f}s)")

    if response.status_code not in (200, 201):
        raise http_error(response, "Replicate generation request")

    data = response.json()
    status = str(data.get("status", "")).lower()
    if status != "succeeded":
        poll_url = ((data.get("urls") or {}).get("get"))
        if not poll_url:
            prediction_id = data.get("id")
            if prediction_id:
                poll_url = f"{base_url.rstrip('/')}/predictions/{prediction_id}"
        if not poll_url:
            raise RuntimeError(f"Replicate response missing poll URL: {data}")

        print("  [..] Polling result...")
        data = poll_json(
            poll_url,
            {"Authorization": f"Bearer {api_key}"},
            status_label="status",
            ready_values=["succeeded"],
            failed_values=["failed", "canceled"],
        )

    image_url = _extract_output_url(data)
    if not image_url:
        raise RuntimeError(f"Replicate response missing output URL: {data}")

    path = resolve_output_path(prompt, output_dir, filename, ".png")
    return download_image(image_url, path)


def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """Generate an image with retries using the Replicate backend."""
    api_key = require_api_key(
        "REPLICATE_API_KEY",
        "REPLICATE_API_TOKEN",
        message="No API key found. Set REPLICATE_API_KEY or REPLICATE_API_TOKEN in the current environment or a .env file.",
    )
    base_url = os.environ.get("REPLICATE_BASE_URL") or DEFAULT_BASE_URL
    resolved_model = model or os.environ.get("REPLICATE_MODEL") or DEFAULT_MODEL

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
