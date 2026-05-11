"""ElevenLabs backend for narration audio generation."""

from __future__ import annotations

import json
from pathlib import Path
from urllib import error, request

from tts_backends.backend_common import read_api_key


API_BASE = "https://api.elevenlabs.io/v1"


def read_elevenlabs_api_key(env_name: str) -> str:
    return read_api_key(env_name, label="ElevenLabs")


def output_extension(output_format: str) -> str:
    codec = output_format.split("_", 1)[0].lower()
    if codec in {"mp3", "wav"}:
        return f".{codec}"
    raise RuntimeError(
        f"Unsupported ElevenLabs output format for PPT narration: {output_format}. "
        "Use an mp3_* or wav_* format."
    )


def _read_http_error(exc: error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace")
    except Exception:
        body = ""
    return f"HTTP {exc.code}: {body or exc.reason}"


def generate(
    text: str,
    output_path: Path,
    *,
    api_key: str,
    voice_id: str,
    model: str,
    output_format: str,
    stability: float | None,
    similarity_boost: float | None,
    style: float | None,
    speaker_boost: bool | None,
) -> None:
    payload: dict[str, object] = {
        "text": text,
        "model_id": model,
    }

    voice_settings: dict[str, object] = {}
    if stability is not None:
        voice_settings["stability"] = stability
    if similarity_boost is not None:
        voice_settings["similarity_boost"] = similarity_boost
    if style is not None:
        voice_settings["style"] = style
    if speaker_boost is not None:
        voice_settings["use_speaker_boost"] = speaker_boost
    if voice_settings:
        payload["voice_settings"] = voice_settings

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    url = f"{API_BASE}/text-to-speech/{voice_id}?output_format={output_format}"
    req = request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "xi-api-key": api_key,
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=120) as response:
            output_path.write_bytes(response.read())
    except error.HTTPError as exc:
        raise RuntimeError(_read_http_error(exc)) from exc
    except error.URLError as exc:
        raise RuntimeError(f"ElevenLabs request failed: {exc.reason}") from exc


def print_voices(api_key: str) -> None:
    req = request.Request(
        f"{API_BASE}/voices",
        headers={"xi-api-key": api_key},
        method="GET",
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        raise RuntimeError(_read_http_error(exc)) from exc
    except error.URLError as exc:
        raise RuntimeError(f"ElevenLabs request failed: {exc.reason}") from exc

    print("ElevenLabs voices:")
    print("Voice ID                 Name                           Category")
    print("-----------------------  -----------------------------  ----------")
    for item in data.get("voices", []):
        voice_id = item.get("voice_id", "")
        name = item.get("name", "")
        category = item.get("category", "")
        print(f"{voice_id:<23} {name:<29} {category}")
