#!/usr/bin/env python3
"""
幻象 MotionGraphic — Gemini TTS 旁白生成器

调用 Gemini 3.1 Flash TTS Preview API，根据字幕 JSON 逐条生成旁白音频。
支持男声/女声切换，自动合并为单个文件，输出 Base64 编码版本和时长映射。

环境变量：
  GEMINI_API_KEY — Gemini API 密钥（必需）

用法：
  python3 tts-generate.py \
    --subtitles subtitles.json \
    --voice male \
    --style documentary \
    --output-dir ./phantom-output/audio/
"""

import argparse
import base64
import json
import os
import struct
import sys
import wave
from pathlib import Path

try:
    import requests
except ImportError:
    print("❌ 需要 requests 库：pip install requests")
    sys.exit(1)


# ── 声音配置 ──────────────────────────────────────────────────────
VOICE_MAP = {
    "male": {
        "voice_name": "Charon",
        "prompt_prefix": "你现在是央视顶级科学纪录片的男解说。请用你特有的知识渊博、娓娓道来(Informative)的嗓音，以首席科学家般严谨、厚重且充满智慧的语气朗读以下文本。注意短句之间的沉稳停顿：\n\n",
    },
    "female": {
        "voice_name": "Erinome",
        "prompt_prefix": "你现在是国家级电视台的知性女主持人。请保持极其清晰(Clear)的咬字，用端庄、优雅、动听的语调朗读以下文本。展现出东方美学的大气与从容：\n\n",
    },
}

STYLE_PROMPTS = {
    "documentary": "以纪录片解说的方式，语速适中、沉稳有力地",
    "educational": "以科普教育的方式，生动有趣、娓娓道来地",
    "passionate": "以充满感染力的演讲方式，激情澎湃地",
}

API_URL = "https://generativelanguage.googleapis.com/v1alpha/models/gemini-3.1-flash-tts-preview:generateContent"
SAMPLE_RATE = 24000  # Gemini TTS 输出采样率


def get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        print("❌ 未设置 GEMINI_API_KEY 环境变量")
        sys.exit(1)
    return key


def get_wav_duration(filepath: str) -> float:
    with wave.open(filepath, "r") as wf:
        return wf.getnframes() / float(wf.getframerate())


def generate_single_tts(
    text: str,
    output_path: str,
    voice: str,
    style: str,
    api_key: str,
) -> float:
    """生成单条 TTS 音频，返回时长（秒）。"""
    cfg = VOICE_MAP[voice]
    style_hint = STYLE_PROMPTS.get(style, STYLE_PROMPTS["documentary"])
    prompt = f"{style_hint}{cfg['prompt_prefix']}{text}"

    data = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "audioConfig": {
                "voice": cfg["voice_name"],
                "audioEncoding": "PCM_48000"
            }
        },
    }

    url = f"{API_URL}?key={api_key}"
    resp = requests.post(url, json=data, headers={"Content-Type": "application/json"})
    resp.raise_for_status()

    result = resp.json()
    part = result["candidates"][0]["content"]["parts"][0]
    raw_pcm = base64.b64decode(part["inlineData"]["data"])

    # 写入原速 WAV
    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(raw_pcm)

    return get_wav_duration(output_path)


def merge_wav_files(wav_paths: list, output_path: str) -> float:
    """合并多个 WAV 文件为一个。"""
    all_frames = b""
    for p in wav_paths:
        with wave.open(p, "rb") as wf:
            all_frames += wf.readframes(wf.getnframes())

    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(all_frames)

    return get_wav_duration(output_path)


def wav_to_base64(filepath: str) -> str:
    with open(filepath, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def main():
    parser = argparse.ArgumentParser(description="幻象 MotionGraphic TTS 生成器")
    parser.add_argument("--subtitles", required=True, help="字幕 JSON 文件路径")
    parser.add_argument("--voice", choices=["male", "female"], default="male",
                        help="声音性别（默认 male）")
    parser.add_argument("--style", choices=["documentary", "educational", "passionate"],
                        default="documentary", help="解说风格（默认 documentary）")
    parser.add_argument("--output-dir", default="./phantom-output/audio/",
                        help="输出目录（默认 ./phantom-output/audio/）")
    args = parser.parse_args()

    api_key = get_api_key()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 读取字幕
    with open(args.subtitles, "r", encoding="utf-8") as f:
        sub_data = json.load(f)

    entries = sub_data.get("subtitles", {}).get("entries", [])
    if not entries:
        print("❌ 字幕文件中没有找到 entries")
        sys.exit(1)

    print(f"🎙️ 开始生成 TTS 旁白（{VOICE_MAP[args.voice]['voice_name']}，{args.style} 风格，1.0x 标准语速）")
    print(f"   共 {len(entries)} 条字幕\n")

    wav_paths = []
    timings = []
    current_time = 3.0  # 前 3 秒淡入偏移

    for i, entry in enumerate(entries):
        text = entry.get("text_cn", entry.get("text", ""))
        if not text.strip():
            continue

        wav_path = str(output_dir / f"tts_{i:03d}.wav")
        print(f"  [{i+1}/{len(entries)}] 生成：{text[:30]}...")

        try:
            duration = generate_single_tts(text, wav_path, args.voice, args.style, api_key)
        except Exception as e:
            print(f"  ❌ 生成失败：{e}")
            sys.exit(1)

        print(f"    → {wav_path} ({duration:.2f}s)")

        timings.append({
            "index": i,
            "text_cn": entry.get("text_cn", ""),
            "text_en": entry.get("text_en", ""),
            "start": round(current_time, 3),
            "end": round(current_time + duration, 3),
            "duration": round(duration, 3),
            "audio_file": f"tts_{i:03d}.wav",
        })

        wav_paths.append(wav_path)
        current_time += duration

    # 合并所有 WAV
    merged_path = str(output_dir / "merged_tts.wav")
    total_duration = merge_wav_files(wav_paths, merged_path)
    print(f"\n✅ 合并完成：{merged_path} (总时长 {total_duration:.2f}s)")

    # 生成 Base64 版本
    b64_path = str(output_dir / "merged_tts_b64.txt")
    b64_data = wav_to_base64(merged_path)
    with open(b64_path, "w") as f:
        f.write(b64_data)
    print(f"✅ Base64 编码：{b64_path}")

    # 输出时长映射
    timings_output = {
        "voice": args.voice,
        "voice_name": VOICE_MAP[args.voice]["voice_name"],
        "style": args.style,
        "speed": 1.0,
        "total_tts_duration": round(total_duration, 3),
        "total_animation_duration": round(3 + total_duration + 3, 3),
        "fade_in_seconds": 3,
        "fade_out_seconds": 3,
        "entries": timings,
    }

    timings_path = str(output_dir / "timings.json")
    with open(timings_path, "w", encoding="utf-8") as f:
        json.dump(timings_output, f, ensure_ascii=False, indent=2)
    print(f"✅ 时长映射：{timings_path}")

    print(f"\n🎬 总动画时长：3(淡入) + {total_duration:.2f}(TTS) + 3(淡出) = {3 + total_duration + 3:.2f}s")


if __name__ == "__main__":
    main()
