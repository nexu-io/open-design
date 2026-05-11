"""MiniMax T2A backend for narration audio generation."""

from __future__ import annotations

import binascii
import os
from pathlib import Path

from tts_backends.backend_common import extension_from_format, post_json, read_api_key


DEFAULT_ENDPOINT = "https://api.minimaxi.com/v1/t2a_v2"
DEFAULT_MODEL = "speech-2.8-hd"

# International fallback: set MINIMAX_TTS_BASE_URL=https://api.minimax.io if needed.


def output_extension(audio_format: str) -> str:
    return extension_from_format(audio_format)


def read_minimax_api_key(env_name: str) -> str:
    return read_api_key(env_name, label="MiniMax")


def resolve_url(base_url: str | None = None) -> str:
    base = (base_url or os.environ.get("MINIMAX_TTS_BASE_URL") or DEFAULT_ENDPOINT).rstrip("/")
    if base.endswith("/t2a_v2"):
        return base
    if base.endswith("/v1"):
        return base + "/t2a_v2"
    return base + "/v1/t2a_v2"


def generate(
    text: str,
    output_path: Path,
    *,
    api_key: str,
    voice_id: str,
    model: str,
    audio_format: str,
    sample_rate: int,
    bitrate: int,
    channel: int,
    speed: float,
    volume: float,
    pitch: int,
    language_boost: str,
    base_url: str | None,
) -> None:
    payload = {
        "model": model,
        "text": text,
        "stream": False,
        "language_boost": language_boost,
        "output_format": "hex",
        "voice_setting": {
            "voice_id": voice_id,
            "speed": speed,
            "vol": volume,
            "pitch": pitch,
        },
        "audio_setting": {
            "sample_rate": sample_rate,
            "bitrate": bitrate,
            "format": audio_format,
            "channel": channel,
        },
    }
    data = post_json(
        resolve_url(base_url),
        headers={"Authorization": f"Bearer {api_key}"},
        payload=payload,
        timeout=180,
    )
    base_resp = data.get("base_resp") or {}
    if base_resp.get("status_code") not in (None, 0, "0"):
        raise RuntimeError(f"MiniMax TTS failed: {data}")

    audio_hex = (data.get("data") or {}).get("audio")
    if not audio_hex:
        raise RuntimeError(f"MiniMax response missing audio data: {data}")
    try:
        output_path.write_bytes(binascii.unhexlify(audio_hex))
    except (binascii.Error, ValueError) as exc:
        raise RuntimeError("MiniMax response audio is not valid hex data") from exc


def print_voices() -> None:
    print("MiniMax TTS voices are selected by voice_id.")
    print("Use a system voice ID or a cloned voice_id from MiniMax Voice Clone.")
    print("Example domestic system voice from MiniMax docs: male-qn-qingse")
