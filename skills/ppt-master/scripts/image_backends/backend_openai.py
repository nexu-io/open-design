#!/usr/bin/env python3
"""
OpenAI Compatible Image Generation Backend

Generates images via OpenAI-compatible APIs (OpenAI, local models like Qwen-Image, etc.).
Used by image_gen.py as a backend module.

Configuration keys:
  OPENAI_API_KEY   (required) API key
  OPENAI_BASE_URL  (optional) Custom API endpoint (e.g. http://127.0.0.1:3000/v1)
  OPENAI_MODEL     (optional) Model name (default: gpt-image-2)
  OPENAI_OUTPUT_FORMAT       (optional) png, jpeg, or webp for GPT image models
  OPENAI_OUTPUT_COMPRESSION  (optional) 0-100, only for jpeg/webp GPT image output
  OPENAI_BACKGROUND          (optional) auto or opaque for gpt-image-2
  OPENAI_MODERATION          (optional) auto or low for GPT image models

Dependencies:
  pip install openai Pillow
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend openai")
    raise SystemExit(0)

import base64
import os
import time
import threading
from collections.abc import Mapping

from openai import OpenAI
from image_backends.backend_common import (
    MAX_RETRIES,
    download_image,
    is_rate_limit_error,
    normalize_image_size,
    resolve_output_path,
    retry_delay,
    save_image_bytes,
)


# ╔══════════════════════════════════════════════════════════════════╗
# ║  Constants                                                      ║
# ╚══════════════════════════════════════════════════════════════════╝

# Aspect ratio -> DALL-E 3 / legacy compatible size mapping.
# Unknown OpenAI-compatible models use this table to preserve old behavior.
LEGACY_COMPAT_ASPECT_RATIO_TO_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
    "3:2":  "1536x1024",
    "2:3":  "1024x1536",
    "4:3":  "1536x1024",   # closest available
    "3:4":  "1024x1536",   # closest available
    "4:5":  "1024x1024",   # fallback to square
    "5:4":  "1024x1024",   # fallback to square
    "21:9": "1792x1024",   # closest wide format
}

# GPT Image 1/1.5/mini officially support only square, landscape, portrait, or auto.
GPT_IMAGE_LEGACY_ASPECT_RATIO_TO_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1536x1024",
    "9:16": "1024x1536",
    "3:2":  "1536x1024",
    "2:3":  "1024x1536",
    "4:3":  "1536x1024",
    "3:4":  "1024x1536",
    "4:5":  "1024x1536",
    "5:4":  "1536x1024",
    "21:9": "1536x1024",
}

# GPT Image 2 supports flexible sizes when both edges are multiples of 16,
# the edge ratio is <= 3:1, and the total pixels are within model limits.
GPT_IMAGE_2_SIZES = {
    "512px": {
        "1:1": "1024x1024", "16:9": "1280x720", "9:16": "720x1280",
        "3:2": "1248x832", "2:3": "832x1248", "4:3": "1024x768",
        "3:4": "768x1024", "4:5": "896x1120", "5:4": "1120x896",
        "21:9": "1280x544",
    },
    "1K": {
        "1:1": "1024x1024", "16:9": "1280x720", "9:16": "720x1280",
        "3:2": "1248x832", "2:3": "832x1248", "4:3": "1024x768",
        "3:4": "768x1024", "4:5": "896x1120", "5:4": "1120x896",
        "21:9": "1280x544",
    },
    "2K": {
        "1:1": "2048x2048", "16:9": "2048x1152", "9:16": "1152x2048",
        "3:2": "2016x1344", "2:3": "1344x2016", "4:3": "1920x1440",
        "3:4": "1440x1920", "4:5": "1600x2000", "5:4": "2000x1600",
        "21:9": "2560x1088",
    },
    "4K": {
        "1:1": "2880x2880", "16:9": "3840x2160", "9:16": "2160x3840",
        "3:2": "3520x2352", "2:3": "2352x3520", "4:3": "3264x2448",
        "3:4": "2448x3264", "4:5": "2560x3200", "5:4": "3200x2560",
        "21:9": "3840x1648",
    },
}

DALL_E_2_SIZE_BY_IMAGE_SIZE = {
    "512px": "512x512",
    "1K": "1024x1024",
    "2K": "1024x1024",
    "4K": "1024x1024",
}

VALID_ASPECT_RATIOS = list(LEGACY_COMPAT_ASPECT_RATIO_TO_SIZE.keys())

# image_size -> quality mapping
IMAGE_SIZE_TO_QUALITY = {
    "512px": "low",
    "1K":    "medium",
    "2K":    "high",
    "4K":    "high",
}

DEFAULT_MODEL = "gpt-image-2"

GPT_IMAGE_2_MIN_PIXELS = 655_360
GPT_IMAGE_2_MAX_PIXELS = 8_294_400
GPT_IMAGE_2_MAX_EDGE = 3840
GPT_IMAGE_2_MAX_RATIO = 3

GPT_IMAGE_OUTPUT_FORMATS = {"png", "jpeg", "webp"}
GPT_IMAGE_OUTPUT_EXTENSIONS = {
    "png": ".png",
    "jpeg": ".jpg",
    "webp": ".webp",
}
GPT_IMAGE_BACKGROUNDS = {"auto", "opaque", "transparent"}
GPT_IMAGE_MODERATION_VALUES = {"auto", "low"}


def _field(value, name: str):
    """Read a response field from either an SDK object or a dict."""
    if isinstance(value, Mapping):
        return value.get(name)
    return getattr(value, name, None)


def _normalized_model(model: str) -> str:
    return (model or "").strip().lower()


def _is_gpt_image_model(model: str) -> bool:
    return _normalized_model(model).startswith("gpt-image-")


def _is_gpt_image_2(model: str) -> bool:
    return _normalized_model(model).startswith("gpt-image-2")


def _is_dall_e_2(model: str) -> bool:
    return _normalized_model(model) == "dall-e-2"


def _parse_size(size: str) -> tuple[int, int]:
    try:
        width_s, height_s = size.lower().split("x", 1)
        return int(width_s), int(height_s)
    except Exception as exc:
        raise ValueError(f"Invalid image size '{size}'. Expected WIDTHxHEIGHT.") from exc


def _validate_gpt_image_2_size(size: str) -> None:
    width, height = _parse_size(size)
    total_pixels = width * height
    long_edge = max(width, height)
    short_edge = min(width, height)

    errors = []
    if long_edge > GPT_IMAGE_2_MAX_EDGE:
        errors.append(f"max edge {long_edge}px exceeds {GPT_IMAGE_2_MAX_EDGE}px")
    if width % 16 != 0 or height % 16 != 0:
        errors.append("both edges must be multiples of 16px")
    if long_edge / short_edge > GPT_IMAGE_2_MAX_RATIO:
        errors.append("long:short edge ratio must not exceed 3:1")
    if not (GPT_IMAGE_2_MIN_PIXELS <= total_pixels <= GPT_IMAGE_2_MAX_PIXELS):
        errors.append(
            f"total pixels {total_pixels:,} must be between "
            f"{GPT_IMAGE_2_MIN_PIXELS:,} and {GPT_IMAGE_2_MAX_PIXELS:,}"
        )
    if errors:
        raise ValueError(f"Invalid gpt-image-2 size '{size}': {', '.join(errors)}")


def _select_size(model: str, aspect_ratio: str, image_size: str) -> str:
    """Select a model-compatible size while preserving legacy fallbacks."""
    if _is_gpt_image_2(model):
        size = GPT_IMAGE_2_SIZES[image_size][aspect_ratio]
        _validate_gpt_image_2_size(size)
        return size
    if _is_gpt_image_model(model):
        return GPT_IMAGE_LEGACY_ASPECT_RATIO_TO_SIZE[aspect_ratio]
    if _is_dall_e_2(model):
        return DALL_E_2_SIZE_BY_IMAGE_SIZE[image_size]
    return LEGACY_COMPAT_ASPECT_RATIO_TO_SIZE[aspect_ratio]


def _supports_response_format(model: str) -> bool:
    """GPT Image models always return base64; DALL-E/compatible models may need this."""
    return not _is_gpt_image_model(model)


def _read_env_choice(name: str, allowed: set[str]) -> str | None:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return None
    normalized = value.strip().lower()
    if normalized not in allowed:
        allowed_list = ", ".join(sorted(allowed))
        raise ValueError(f"Invalid {name}='{value}'. Supported: {allowed_list}")
    return normalized


def _read_env_int(name: str, minimum: int, maximum: int) -> int | None:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return None
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValueError(f"Invalid {name}='{value}'. Expected integer {minimum}-{maximum}.") from exc
    if not (minimum <= parsed <= maximum):
        raise ValueError(f"Invalid {name}={parsed}. Expected integer {minimum}-{maximum}.")
    return parsed


def _gpt_image_options(model: str) -> tuple[dict, str]:
    """Read optional GPT Image request parameters from environment."""
    output_format = _read_env_choice("OPENAI_OUTPUT_FORMAT", GPT_IMAGE_OUTPUT_FORMATS)
    output_ext = GPT_IMAGE_OUTPUT_EXTENSIONS[output_format] if output_format else ".png"
    options = {}
    if output_format:
        options["output_format"] = output_format

    output_compression = _read_env_int("OPENAI_OUTPUT_COMPRESSION", 0, 100)
    if output_compression is not None:
        if output_format not in {"jpeg", "webp"}:
            raise ValueError(
                "OPENAI_OUTPUT_COMPRESSION is only supported when "
                "OPENAI_OUTPUT_FORMAT is jpeg or webp."
            )
        options["output_compression"] = output_compression

    background = _read_env_choice("OPENAI_BACKGROUND", GPT_IMAGE_BACKGROUNDS)
    if background:
        if _is_gpt_image_2(model) and background == "transparent":
            raise ValueError("gpt-image-2 does not support OPENAI_BACKGROUND=transparent.")
        options["background"] = background

    moderation = _read_env_choice("OPENAI_MODERATION", GPT_IMAGE_MODERATION_VALUES)
    if moderation:
        options["moderation"] = moderation

    return options, output_ext


# ╔══════════════════════════════════════════════════════════════════╗
# ║  Image Generation                                               ║
# ╚══════════════════════════════════════════════════════════════════╝

def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = None) -> str:
    """
    Image generation via OpenAI-compatible API.

    Maps aspect_ratio to OpenAI's size parameter, and image_size to quality.

    Returns:
        Path of the saved image file

    Raises:
        RuntimeError: When generation fails
    """
    client = OpenAI(api_key=api_key, base_url=base_url)

    # Map parameters
    size = _select_size(model, aspect_ratio, image_size)
    quality = IMAGE_SIZE_TO_QUALITY.get(image_size, "auto")
    output_ext = ".png"
    request = {
        "prompt": prompt,
        "model": model,
        "size": size,
        "quality": quality,
        "n": 1,
    }
    if _is_gpt_image_model(model):
        gpt_options, output_ext = _gpt_image_options(model)
        request.update(gpt_options)
    elif _supports_response_format(model):
        request["response_format"] = "b64_json"

    mode_label = f"Proxy: {base_url}" if base_url else "OpenAI API"
    print(f"[OpenAI - {mode_label}]")
    print(f"  Model:        {model}")
    print(f"  Prompt:       {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print(f"  Size:         {size} (from aspect_ratio={aspect_ratio})")
    print(f"  Quality:      {quality} (from image_size={image_size})")
    if request.get("output_format"):
        print(f"  Format:       {request['output_format']}")
    if request.get("output_compression") is not None:
        print(f"  Compression:  {request['output_compression']}")
    if request.get("background"):
        print(f"  Background:   {request['background']}")
    if request.get("moderation"):
        print(f"  Moderation:   {request['moderation']}")
    print()

    start_time = time.time()
    print(f"  [..] Generating...", end="", flush=True)

    # Heartbeat thread
    heartbeat_stop = threading.Event()

    def _heartbeat():
        while not heartbeat_stop.is_set():
            heartbeat_stop.wait(5)
            if not heartbeat_stop.is_set():
                elapsed = time.time() - start_time
                print(f" {elapsed:.0f}s...", end="", flush=True)

    hb_thread = threading.Thread(target=_heartbeat, daemon=True)
    hb_thread.start()

    try:
        resp = client.images.generate(**request)
    finally:
        heartbeat_stop.set()
        hb_thread.join(timeout=1)

    elapsed = time.time() - start_time
    print(f"\n  [DONE] Image generated ({elapsed:.1f}s)")

    data = _field(resp, "data") if resp is not None else None
    if data:
        path = resolve_output_path(prompt, output_dir, filename, output_ext)
        first_image = data[0]
        b64_json = _field(first_image, "b64_json")
        image_url = _field(first_image, "url")
        if b64_json:
            image_data = base64.b64decode(b64_json)
            return save_image_bytes(image_data, path)
        if image_url:
            return download_image(image_url, path)

    raise RuntimeError("No image was generated. The server may have refused the request.")


# ╔══════════════════════════════════════════════════════════════════╗
# ║  Public Entry Point                                             ║
# ╚══════════════════════════════════════════════════════════════════╝

def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """
    OpenAI-compatible image generation with automatic retry.

    Reads credentials from the current process environment or a `.env` file:
      OPENAI_API_KEY
      OPENAI_BASE_URL
      OPENAI_MODEL (optional override)

    Args:
        prompt: Prompt text
        aspect_ratio: Aspect ratio, mapped to OpenAI size
        image_size: Image size, mapped to OpenAI quality
        output_dir: Output directory
        filename: Output filename (without extension)
        model: Model name (default: gpt-image-2)
        max_retries: Maximum number of retries

    Returns:
        Path of the saved image file
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("OPENAI_BASE_URL")

    if not api_key:
        raise ValueError(
            "No API key found. Set OPENAI_API_KEY in the current environment or a .env file."
        )

    if model is None:
        model = os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL

    image_size = normalize_image_size(image_size)

    if aspect_ratio not in LEGACY_COMPAT_ASPECT_RATIO_TO_SIZE:
        supported = list(LEGACY_COMPAT_ASPECT_RATIO_TO_SIZE.keys())
        raise ValueError(
            f"Unsupported aspect ratio '{aspect_ratio}' for OpenAI backend. "
            f"Supported: {supported}"
        )

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return _generate_image(api_key, prompt,
                                   aspect_ratio, image_size, output_dir,
                                   filename, model, base_url)
        except Exception as e:
            last_error = e
            if attempt < max_retries and is_rate_limit_error(e):
                delay = retry_delay(attempt, rate_limited=True)
                print(f"\n  [WARN] Rate limit hit (attempt {attempt + 1}/{max_retries + 1}). "
                      f"Waiting {delay}s before retry...")
                time.sleep(delay)
            elif attempt < max_retries:
                delay = retry_delay(attempt, rate_limited=False)
                print(f"\n  [WARN] Error (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                      f"Retrying in {delay}s...")
                time.sleep(delay)
            else:
                break

    raise RuntimeError(f"Failed after {max_retries + 1} attempts. Last error: {last_error}")
