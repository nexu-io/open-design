import base64
import json
import os
import urllib.error
import urllib.request
import wave
from contextlib import closing
from pathlib import Path


MODEL = "gemini-3.1-flash-tts-preview"
VOICE_NAME = "Charon"
SAMPLE_RATE = 24000
URL = f"https://generativelanguage.googleapis.com/v1alpha/models/{MODEL}:generateContent"
OUT_DIR = Path(__file__).resolve().parent / "assets"
MANIFEST_PATH = OUT_DIR / "tts_manifest.json"

CLIPS = [
    {
        "id": "voice1",
        "start": 3.0,
        "text": "钱学森穿过旧金山冷雾。",
        "style": "deep, calm, prestigious Chinese male documentary narration",
    },
    {
        "id": "voice2",
        "start": 10.0,
        "text": "中国导弹自此重写坐标。",
        "style": "deep, restrained Chinese male narration with historical gravity",
    },
    {
        "id": "voice3",
        "start": 20.0,
        "text": "火箭点火，弹体跃出地平。",
        "style": "deep, precise Chinese male narration with controlled momentum",
    },
    {
        "id": "voice4",
        "start": 29.0,
        "text": "弹道抬升，越过太平洋弧面。",
        "style": "deep, cinematic Chinese male narration with scientific clarity",
    },
    {
        "id": "voice5",
        "start": 40.0,
        "text": "再入大气，热障沿弹体燃亮。",
        "style": "deep, tense Chinese male narration with restrained intensity",
    },
    {
        "id": "voice6",
        "start": 49.0,
        "text": "目标锁定，落点逼近百米。",
        "style": "deep, conclusive Chinese male narration with exact cadence",
    },
]


def build_prompt(text: str, style: str) -> str:
    return (
        "你现在是央视顶级科学纪录片的男解说。请用你特有的知识渊博、娓娓道来(Informative)的嗓音，"
        "以首席科学家般严谨、厚重且充满智慧的语气朗读以下文本。注意短句之间的沉稳停顿：\n\n"
        f"「 {text} 」"
    )

def build_payload(prompt: str) -> dict:
    return {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": VOICE_NAME,
                    }
                }
            },
        },
    }


def extract_audio_bytes(response_data: dict) -> bytes:
    candidates = response_data.get("candidates", [])
    if not candidates:
        raise ValueError(f"Gemini TTS returned no candidates: {response_data}")

    parts = candidates[0].get("content", {}).get("parts", [])
    if not parts:
        raise ValueError(f"Gemini TTS returned no content parts: {response_data}")

    inline_data = parts[0].get("inlineData") or parts[0].get("inline_data")
    if not inline_data or not inline_data.get("data"):
        raise ValueError(f"Gemini TTS returned no inline audio data: {response_data}")

    return base64.b64decode(inline_data["data"])


def get_duration_seconds(wave_path: Path) -> float:
    with closing(wave.open(str(wave_path), "rb")) as wave_file:
        return wave_file.getnframes() / float(wave_file.getframerate())


def synthesize_clip(api_key: str, clip: dict) -> dict:
    prompt = build_prompt(clip["text"], clip["style"])
    payload = build_payload(prompt)
    request = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"TTS request failed for {clip['id']}: {error_body}") from error

    pcm_data = extract_audio_bytes(response_data)
    output_path = OUT_DIR / f"{clip['id']}.wav"
    with wave.open(str(output_path), "wb") as wave_file:
        wave_file.setnchannels(1)
        wave_file.setsampwidth(2)
        wave_file.setframerate(SAMPLE_RATE)
        wave_file.writeframes(pcm_data)

    duration = round(get_duration_seconds(output_path), 3)
    print(f"Wrote {output_path.name} ({duration}s)")
    return {
        "id": clip["id"],
        "file": output_path.name,
        "start": clip["start"],
        "duration": duration,
        "text": clip["text"],
    }


def main() -> None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "model": MODEL,
        "voice": VOICE_NAME,
        "sampleRate": SAMPLE_RATE,
        "clips": [synthesize_clip(api_key, clip) for clip in CLIPS],
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {MANIFEST_PATH.name}")


if __name__ == "__main__":
    main()
