#!/usr/bin/env python3
"""
Gemini Image Generation Backend

Generates images via the Google GenAI API (Gemini).
Used by image_gen.py as a backend module.

Configuration keys:
  GEMINI_API_KEY   (required)
  GEMINI_BASE_URL  (optional) Custom API endpoint for proxy services
  GEMINI_MODEL     (optional) Override default model

Dependencies:
  pip install google-genai Pillow
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("Use via: python3 skills/ppt-master/scripts/image_gen.py \"prompt\" --backend gemini")
    raise SystemExit(0)

import os
import time
import threading
from google import genai
from google.genai import types
from image_backends.backend_common import (
    MAX_RETRIES,
    is_rate_limit_error,
    normalize_image_size,
    resolve_output_path,
    retry_delay,
    save_image_bytes,
)


# ╔══════════════════════════════���═══════════════════════════════════╗
# ║  Constants                                                      ║
# ╚═══════════��═════════════════════════════��════════════════════════╝

VALID_ASPECT_RATIOS = [
    "1:1", "1:4", "1:8",
    "2:3", "3:2", "3:4", "4:1", "4:3",
    "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"
]

VALID_IMAGE_SIZES = ["512px", "1K", "2K", "4K"]

DEFAULT_MODEL = "gemini-3.1-flash-image-preview"


# ╔══════���═══════════════════════════════════════════════��═══════════╗
# ║  Image Generation                                               ║
# ╚══════════════════════════════════════════════════════════════════╝

def _generate_image(api_key: str, prompt: str,
                    aspect_ratio: str = "1:1", image_size: str = "1K",
                    output_dir: str = None, filename: str = None,
                    model: str = DEFAULT_MODEL, base_url: str = None) -> str:
    """
    Image generation via Gemini API (streaming).

    Returns:
        Path of the saved image file

    Raises:
        RuntimeError: When generation fails
    """
    if base_url:
        client = genai.Client(api_key=api_key, http_options={'base_url': base_url})
    else:
        client = genai.Client(api_key=api_key)

    config_kwargs = {
        "response_modalities": ["IMAGE"],
        "image_config": types.ImageConfig(
            aspect_ratio=aspect_ratio,
            image_size=image_size,
        ),
    }
    if "flash" in model.lower():
        config_kwargs["thinking_config"] = types.ThinkingConfig(
            thinking_level="MINIMAL",
        )
    config = types.GenerateContentConfig(**config_kwargs)

    mode_label = "Proxy Mode" if base_url else "Official Mode"
    print(f"[Gemini - {mode_label}]")
    if base_url:
        print(f"  Base URL:     {base_url}")
    print(f"  Model:        {model}")
    print(f"  Prompt:       {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print(f"  Aspect Ratio: {aspect_ratio}")
    print(f"  Image Size:   {image_size}")
    print()

    start_time = time.time()
    print(f"  [..] Generating...", end="", flush=True)

    heartbeat_stop = threading.Event()

    def _heartbeat():
        while not heartbeat_stop.is_set():
            heartbeat_stop.wait(5)
            if not heartbeat_stop.is_set():
                elapsed = time.time() - start_time
                print(f" {elapsed:.0f}s...", end="", flush=True)

    hb_thread = threading.Thread(target=_heartbeat, daemon=True)
    hb_thread.start()

    last_image_data = None
    chunk_count = 0
    total_bytes = 0

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=[prompt],
        config=config,
    ):
        elapsed = time.time() - start_time

        if chunk.parts is None:
            continue

        for part in chunk.parts:
            if part.text is not None:
                print(f"\n  Model says: {part.text}", end="", flush=True)
            elif part.inline_data is not None:
                chunk_count += 1
                data_size = len(part.inline_data.data) if part.inline_data.data else 0
                total_bytes += data_size
                size_str = f"{data_size / 1024:.0f}KB" if data_size < 1048576 else f"{data_size / 1048576:.1f}MB"
                print(f"\n  [OK] Chunk #{chunk_count} received ({size_str}, {elapsed:.1f}s)", end="", flush=True)
                last_image_data = part

    heartbeat_stop.set()
    hb_thread.join(timeout=1)

    elapsed = time.time() - start_time
    print(f"\n  [DONE] Stream complete ({elapsed:.1f}s, {chunk_count} chunk(s), {total_bytes / 1024:.0f}KB total)")

    if last_image_data is not None and last_image_data.inline_data is not None:
        if chunk_count > 1:
            print(f"  Keeping the final chunk (highest quality).")
        path = resolve_output_path(prompt, output_dir, filename, ".png")
        return save_image_bytes(
            last_image_data.inline_data.data,
            path,
            content_type=getattr(last_image_data.inline_data, "mime_type", None),
        )

    raise RuntimeError("No image was generated. The server may have refused the request.")


# ╔���═══════════════════════════════════���═════════════════════════════╗
# ║  Public Entry Point                                             ║
# ╚═════════════���═══════════════════════════���════════════════════════╝

def generate(prompt: str,
             aspect_ratio: str = "1:1", image_size: str = "1K",
             output_dir: str = None, filename: str = None,
             model: str = None, max_retries: int = MAX_RETRIES) -> str:
    """
    Gemini image generation with automatic retry.

    Reads credentials from the current process environment or a `.env` file:
      GEMINI_API_KEY
      GEMINI_BASE_URL
      GEMINI_MODEL (optional override)

    Args:
        prompt: Prompt text
        aspect_ratio: Aspect ratio (e.g. "16:9", "1:1")
        image_size: Image size ("512px", "1K", "2K", "4K", case-insensitive)
        output_dir: Output directory
        filename: Output filename (without extension)
        model: Model name (default: gemini-3.1-flash-image-preview)
        max_retries: Maximum number of retries

    Returns:
        Path of the saved image file
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    base_url = os.environ.get("GEMINI_BASE_URL")

    if not api_key:
        raise ValueError(
            "No API key found. Set GEMINI_API_KEY in the current environment or a .env file."
        )

    if model is None:
        model = os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL

    image_size = normalize_image_size(image_size)

    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise ValueError(f"Invalid aspect ratio '{aspect_ratio}'. Valid: {VALID_ASPECT_RATIOS}")

    if image_size not in VALID_IMAGE_SIZES:
        raise ValueError(f"Invalid image size '{image_size}'. Valid: {VALID_IMAGE_SIZES}")

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
