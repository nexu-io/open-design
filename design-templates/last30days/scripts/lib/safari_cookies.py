"""
Safari binary cookie extractor for macOS.

Parses ~/Library/Cookies/Cookies.binarycookies (unencrypted binary format)
using only stdlib. Zero pip dependencies.

Reference: github.com/mdegrazia/Safari-Binary-Cookie-Parser
"""

from __future__ import annotations

import io
import struct
import sys
from pathlib import Path

# Mac epoch: 2001-01-01 00:00:00 UTC (not used for filtering, but documented)
_MAC_EPOCH_OFFSET = 978307200  # seconds between Unix epoch and Mac epoch

_MAGIC = b"cook"


def _read_null_terminated(data: bytes, offset: int) -> str:
    """Read a null-terminated string from data starting at offset."""
    end = data.find(b"\x00", offset)
    if end == -1:
        end = len(data)
    return data[offset:end].decode("utf-8", errors="replace")


def _parse_cookie_record(data: bytes) -> dict | None:
    """Parse a single cookie record. Returns dict with url, name, value, path or None."""
    if len(data) < 44:
        return None
    try:
        (size,) = struct.unpack("<I", data[0:4])
        # flags at offset 4 (4 bytes, little-endian) — not needed for extraction
        (url_offset,) = struct.unpack("<I", data[16:20])
        (name_offset,) = struct.unpack("<I", data[20:24])
        (path_offset,) = struct.unpack("<I", data[24:28])
        (value_offset,) = struct.unpack("<I", data[28:32])
        # expiry at offset 40 (8-byte double, little-endian) — not needed for filtering
        # creation at offset 48 (8-byte double, little-endian) — not needed

        url = _read_null_terminated(data, url_offset)
        name = _read_null_terminated(data, name_offset)
        path = _read_null_terminated(data, path_offset)
        value = _read_null_terminated(data, value_offset)

        return {"url": url, "name": name, "value": value, "path": path}
    except (struct.error, IndexError, UnicodeDecodeError):
        return None


def _parse_page(page_data: bytes) -> list[dict]:
    """Parse a single page of cookies. Returns list of cookie dicts."""
    cookies = []
    if len(page_data) < 8:
        return cookies

    # Page header: 4 bytes (always 00 00 01 00), then 4-byte LE cookie count
    try:
        (num_cookies,) = struct.unpack("<I", page_data[4:8])
    except struct.error:
        return cookies

    # Sanity check
    if num_cookies > 10000:
        return cookies

    # Cookie offsets: array of 4-byte LE uint32 starting at offset 8
    offsets_end = 8 + num_cookies * 4
    if offsets_end > len(page_data):
        return cookies

    for i in range(num_cookies):
        off_start = 8 + i * 4
        try:
            (cookie_offset,) = struct.unpack("<I", page_data[off_start : off_start + 4])
        except struct.error:
            continue

        if cookie_offset >= len(page_data):
            continue

        cookie_data = page_data[cookie_offset:]
        record = _parse_cookie_record(cookie_data)
        if record:
            cookies.append(record)

    return cookies


def extract_safari_cookies_macos(
    domain: str, cookie_names: list[str]
) -> dict[str, str] | None:
    """
    Extract cookies from Safari on macOS.

    Args:
        domain: Domain to match (substring match, e.g. "x.com")
        cookie_names: List of cookie names to extract (e.g. ["auth_token", "ct0"])

    Returns:
        Dict mapping cookie name to value for found cookies, or None on failure.
    """
    if sys.platform != "darwin":
        return None

    cookie_path = Path.home() / "Library" / "Cookies" / "Cookies.binarycookies"

    try:
        raw = cookie_path.read_bytes()
    except FileNotFoundError:
        return None
    except PermissionError:
        print(
            "[safari] Permission denied reading Cookies.binarycookies. "
            "Enable Full Disk Access for Terminal in System Settings > "
            "Privacy & Security > Full Disk Access.",
            file=sys.stderr,
        )
        return None
    except OSError:
        return None

    return _parse_binary_cookies(raw, domain, cookie_names)


def _parse_binary_cookies(
    raw: bytes, domain: str, cookie_names: list[str]
) -> dict[str, str] | None:
    """Parse raw binary cookie data. Separated for testability."""
    if len(raw) < 8:
        return None

    # Validate magic
    if raw[:4] != _MAGIC:
        return None

    try:
        (num_pages,) = struct.unpack(">I", raw[4:8])
    except struct.error:
        return None

    if num_pages > 100000:
        return None

    # Read page sizes (big-endian uint32 array)
    page_sizes_end = 8 + num_pages * 4
    if page_sizes_end > len(raw):
        return None

    page_sizes = []
    for i in range(num_pages):
        off = 8 + i * 4
        try:
            (ps,) = struct.unpack(">I", raw[off : off + 4])
            page_sizes.append(ps)
        except struct.error:
            return None

    # Parse each page
    names_set = set(cookie_names)
    result: dict[str, str] = {}
    offset = page_sizes_end

    for ps in page_sizes:
        if offset + ps > len(raw):
            break
        page_data = raw[offset : offset + ps]
        cookies = _parse_page(page_data)
        for c in cookies:
            # Substring match on domain (handles leading dots like ".x.com")
            if domain in c["url"] and c["name"] in names_set:
                result[c["name"]] = c["value"]
        offset += ps

    if not result:
        return None

    return result
