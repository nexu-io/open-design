"""Shared helpers for TTS backends."""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib import error, request


def read_api_key(*env_names: str, label: str) -> str:
    for env_name in env_names:
        api_key = os.environ.get(env_name, "").strip()
        if api_key:
            return api_key
    joined = " or ".join(env_names)
    raise RuntimeError(f"Missing {label} API key. Set {joined}=<key>.")


def read_http_error(exc: error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace")
    except Exception:
        body = ""
    return f"HTTP {exc.code}: {body or exc.reason}"


def post_json(url: str, *, headers: dict[str, str], payload: dict, timeout: int = 120) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            **headers,
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        raise RuntimeError(read_http_error(exc)) from exc
    except error.URLError as exc:
        raise RuntimeError(f"HTTP request failed: {exc.reason}") from exc


def get_bytes(url: str, *, timeout: int = 180) -> bytes:
    req = request.Request(url, method="GET")
    try:
        with request.urlopen(req, timeout=timeout) as response:
            return response.read()
    except error.HTTPError as exc:
        raise RuntimeError(read_http_error(exc)) from exc
    except error.URLError as exc:
        raise RuntimeError(f"Audio download failed: {exc.reason}") from exc


def download_audio(url: str, output_path: Path) -> None:
    output_path.write_bytes(get_bytes(url))


def extension_from_format(audio_format: str) -> str:
    normalized = audio_format.strip().lower()
    if normalized in {"mp3", "wav", "flac", "pcm", "opus"}:
        return f".{normalized}"
    raise RuntimeError(f"Unsupported audio format for PPT narration: {audio_format}")

