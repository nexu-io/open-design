#!/usr/bin/env python3
"""
Shared helpers for image generation backends.
"""

import sys

if __name__ == "__main__" and any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
    print(__doc__)
    print("This is an internal helper module used by image_gen.py backends.")
    raise SystemExit(0)

import io
import os
import time

import requests

try:
    from PIL import Image as PILImage
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


MAX_RETRIES = 3
RETRY_BASE_DELAY = 10
RETRY_BACKOFF = 2


def resolve_output_path(prompt: str, output_dir: str = None,
                        filename: str = None, ext: str = ".png") -> str:
    """Compute the final output file path based on parameters."""
    if filename:
        file_name = os.path.splitext(filename)[0]
    else:
        safe = "".join(c for c in prompt if c.isalnum() or c in (" ", "_")).rstrip()
        safe = safe.replace(" ", "_").lower()[:30]
        file_name = safe or "generated_image"

    full_name = f"{file_name}{ext}"
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        return os.path.join(output_dir, full_name)
    return full_name


CONTENT_TYPE_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
}

EXT_TO_PIL_FORMAT = {
    ".png": "PNG",
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".webp": "WEBP",
    ".gif": "GIF",
    ".bmp": "BMP",
    ".tiff": "TIFF",
    ".tif": "TIFF",
}


def detect_image_extension(image_bytes: bytes, content_type: str = None) -> str | None:
    """Best-effort detection of the real image format."""
    if content_type:
        clean_type = content_type.split(";", 1)[0].strip().lower()
        if clean_type in CONTENT_TYPE_TO_EXT:
            return CONTENT_TYPE_TO_EXT[clean_type]

    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if image_bytes.startswith(b"GIF87a") or image_bytes.startswith(b"GIF89a"):
        return ".gif"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return ".webp"
    if image_bytes.startswith(b"BM"):
        return ".bmp"
    if image_bytes.startswith((b"II*\x00", b"MM\x00*")):
        return ".tiff"
    return None


def _normalize_extension(ext: str) -> str:
    """Normalize equivalent image extensions to a canonical form."""
    ext = ext.lower()
    if ext == ".jpeg":
        return ".jpg"
    if ext == ".tif":
        return ".tiff"
    return ext


def save_image_bytes(image_bytes: bytes, path: str, content_type: str = None) -> str:
    """
    Save image bytes to disk while keeping the file extension and the real bytes aligned.

    If the target extension differs from the actual bytes, transcode through Pillow when
    available. Otherwise fail loudly instead of writing a misleading file.
    """
    target_ext = _normalize_extension(os.path.splitext(path)[1])
    actual_ext = _normalize_extension(detect_image_extension(image_bytes, content_type) or "")

    if not target_ext:
        raise ValueError(f"Output path must include an image extension: {path}")

    if actual_ext and target_ext == actual_ext:
        with open(path, "wb") as f:
            f.write(image_bytes)
        print(f"  File saved to: {path}")
        report_resolution(path)
        return path

    if not HAS_PIL:
        actual_label = actual_ext or "unknown"
        raise RuntimeError(
            f"Image format mismatch for {path}: target extension is {target_ext}, "
            f"but the actual image bytes are {actual_label}. "
            "Install Pillow to enable automatic format conversion."
        )

    target_format = EXT_TO_PIL_FORMAT.get(target_ext)
    if not target_format:
        raise ValueError(f"Unsupported output image extension: {target_ext}")

    image = PILImage.open(io.BytesIO(image_bytes))
    if target_format == "JPEG" and image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGB")
    image.save(path, format=target_format)

    if actual_ext and actual_ext != target_ext:
        print(f"  Converted:    {actual_ext} -> {target_ext}")
    print(f"  File saved to: {path}")
    report_resolution(path)
    return path


def report_resolution(path: str) -> None:
    """Try to report image resolution using PIL."""
    if HAS_PIL:
        try:
            img = PILImage.open(path)
            print(f"  Resolution:   {img.size[0]}x{img.size[1]}")
        except Exception:
            pass


def normalize_image_size(image_size: str) -> str:
    """Normalize image size input to standard format."""
    s = image_size.strip()
    upper = s.upper()
    if upper in ("1K", "2K", "4K"):
        return upper
    if upper in ("512PX", "512"):
        return "512px"
    return s


def is_rate_limit_error(exc: Exception) -> bool:
    """Check whether the exception appears to be rate limiting."""
    err_str = str(exc).lower()
    return (
        "429" in err_str
        or "rate" in err_str
        or "quota" in err_str
        or "resource_exhausted" in err_str
    )


def retry_delay(attempt: int, rate_limited: bool) -> int:
    """Return the retry delay for a given attempt."""
    if rate_limited:
        return RETRY_BASE_DELAY * (RETRY_BACKOFF ** attempt)
    return 5


def download_image(url: str, path: str, headers: dict = None, timeout: int = 180) -> str:
    """Download an image URL and save it to disk."""
    response = requests.get(url, headers=headers or {}, timeout=timeout)
    response.raise_for_status()
    return save_image_bytes(
        response.content,
        path,
        content_type=response.headers.get("Content-Type"),
    )


def require_api_key(*candidates: str, message: str) -> str:
    """Return the first non-empty env var from candidates or raise."""
    for name in candidates:
        value = os.environ.get(name)
        if value:
            return value
    raise ValueError(message)


def http_error(response: requests.Response, label: str) -> RuntimeError:
    """Convert an HTTP response into a readable RuntimeError."""
    body = response.text.strip()
    if len(body) > 500:
        body = body[:500] + "..."
    return RuntimeError(f"{label} failed ({response.status_code}): {body}")


def poll_json(
    url: str,
    headers: dict[str, str],
    *,
    interval_seconds: float = 2.0,
    timeout_seconds: int = 300,
    status_label: str = "status",
    ready_values: list[str] | None = None,
    failed_values: list[str] | None = None,
) -> dict:
    """Poll a JSON endpoint until it reports a ready or failed status."""
    ready = {value.lower() for value in (ready_values or ["ready", "success", "succeeded"])}
    failed = {value.lower() for value in (failed_values or ["error", "failed", "fail"])}

    start = time.time()
    while True:
        response = requests.get(url, headers=headers, timeout=180)
        response.raise_for_status()
        payload = response.json()
        raw_status = str(payload.get(status_label, "")).strip()
        status = raw_status.lower()

        if raw_status:
            print(f"  Status:       {raw_status}")

        if status in ready:
            return payload

        if status in failed:
            raise RuntimeError(f"Remote generation failed: {payload}")

        if time.time() - start > timeout_seconds:
            raise RuntimeError(
                f"Timed out after {timeout_seconds}s while polling {url}"
            )

        time.sleep(interval_seconds)
