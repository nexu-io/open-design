"""Alibaba Qwen TTS backend for narration audio generation."""

from __future__ import annotations

import os
from pathlib import Path

from tts_backends.backend_common import download_audio, post_json, read_api_key


DEFAULT_ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
DEFAULT_MODEL = "qwen3-tts-flash"


def output_extension() -> str:
    return ".wav"


def read_qwen_api_key(env_name: str | None = None) -> str:
    if env_name:
        return read_api_key(env_name, label="Qwen/DashScope")
    return read_api_key("QWEN_API_KEY", "DASHSCOPE_API_KEY", label="Qwen/DashScope")


def resolve_url(base_url: str | None = None) -> str:
    base = (base_url or os.environ.get("QWEN_TTS_BASE_URL") or DEFAULT_ENDPOINT).rstrip("/")
    if base.endswith("/generation"):
        return base
    return base + "/api/v1/services/aigc/multimodal-generation/generation"


def generate(
    text: str,
    output_path: Path,
    *,
    api_key: str,
    voice_id: str,
    model: str,
    language_type: str,
    instructions: str | None,
    optimize_instructions: bool | None,
    base_url: str | None,
) -> None:
    input_payload: dict[str, object] = {
        "text": text,
        "voice": voice_id,
    }
    if language_type:
        input_payload["language_type"] = language_type
    if instructions:
        input_payload["instructions"] = instructions
    if optimize_instructions is not None:
        input_payload["optimize_instructions"] = optimize_instructions

    data = post_json(
        resolve_url(base_url),
        headers={"Authorization": f"Bearer {api_key}"},
        payload={
            "model": model,
            "input": input_payload,
        },
        timeout=180,
    )
    audio = (data.get("output") or {}).get("audio") or {}
    audio_url = audio.get("url")
    if not audio_url:
        raise RuntimeError(f"Qwen TTS response missing audio URL: {data}")
    download_audio(audio_url, output_path)


def print_voices() -> None:
    print("Qwen TTS voices are selected by voice.")
    print("Use a system voice name or a cloned voice from Qwen voice cloning.")
    print("Example system voice from Alibaba Cloud docs: Cherry")

