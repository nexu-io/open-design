#!/usr/bin/env python3
"""
幻象 MotionGraphic — 背景音乐生成器 v2.0

优先级策略：
1. Google Lyria (lyria-3-pro-preview) — 顶级画质、顶级音质
2. MiniMax (music-2.6) — 高性能备选
3. 静默音频 — 最后的安全保障机制

用法：
  python3 bgm-generate.py --topic "主题" --duration 60 --output-dir ./output/
"""

import argparse, base64, json, os, sys, time
from pathlib import Path

try:
    import requests
except ImportError:
    print("❌ pip install requests"); sys.exit(1)

# ── API 配置 ──
MINIMAX_URL = "https://api.minimax.io/v1/music_generation"
MINIMAX_QUERY_URL = "https://api.minimax.io/v1/query/music_generation"
GOOGLE_LYRIA_URL = "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent"

# ── 调性映射 ──
MOOD_MAP = {
    "epic":       ("Epic cinematic orchestral, grand sweeping strings, powerful brass, dramatic percussion, Hans Zimmer style, no vocals, instrumental only", "史诗电影配乐"),
    "tech":       ("Modern electronic ambient, futuristic synth pads, subtle glitch textures, cyberpunk atmosphere, minimal techno, no vocals, instrumental only", "未来电子氛围"),
    "nature":     ("Organic ambient soundscape, gentle piano melody, soft strings, nature-inspired, flowing water, peaceful, no vocals, instrumental only", "自然钢琴氛围"),
    "warm":       ("Warm acoustic melody, gentle guitar, soft piano chords, cozy atmosphere, feel-good vibes, no vocals, instrumental only", "温暖原声旋律"),
    "mysterious": ("Dark ambient mystery, deep bass drones, ethereal pads, sparse piano, cosmic atmosphere, tension building, no vocals, instrumental only, strong flying rhythm, high impact epic cinematic beat", "暗黑神秘宇宙，强烈的飞行节奏与史诗般的冲击力"),
    "energetic":  ("Upbeat electronic dance, driving synth bass, energetic drums, bright melodies, motivational, no vocals, instrumental only", "活力电子节拍"),
    "elegant":    ("Classical elegant composition, refined piano, chamber strings, sophisticated harmony, timeless beauty, no vocals, instrumental only", "古典优雅钢琴"),
}

# ── 主题→调性自动匹配 ──
TOPIC_RULES = [
    (["科技","AI","人工智能","编程","算法","代码","网络","计算机"], "tech"),
    (["宇宙","黑洞","星系","量子","物理","天文","大爆炸","行星","太阳"], "mysterious"),
    (["自然","生物","生态","海洋","森林","地球"], "nature"),
    (["生活","美食","旅行","时尚","美妆","治愈"], "warm"),
    (["历史","文明","战争","帝国","史诗"], "epic"),
    (["游戏","运动","音乐","舞蹈","激情"], "energetic"),
    (["艺术","设计","建筑","哲学","文学"], "elegant"),
]

def auto_mood(topic):
    for kws, mood in TOPIC_RULES:
        if any(k in topic for k in kws):
            return mood
    return "epic"

def gen_silent_wav(dur, path):
    import wave
    sr = 44100
    frames = int(sr * dur)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(b"\x00\x00" * frames)

def call_google_lyria(prompt, duration, api_key):
    """调用 Google Lyria (lyria-3-pro-preview)"""
    print(f"  📡 尝试 Google Lyria (lyria-3-pro-preview)...")
    url = f"{GOOGLE_LYRIA_URL}?key={api_key}"
    
    # 构造请求
    full_prompt = f"Create a {int(duration)} second {prompt}"
    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"]
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
        ]
    }
    
    resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=300)
    resp.raise_for_status()
    data = resp.json()
    
    if "candidates" not in data or not data["candidates"]:
        msg = data.get("error", {}).get("message", "Unknown Error")
        raise Exception(f"Google Lyria 无候选项: {msg}")
    
    cand = data["candidates"][0]
    if "content" not in cand:
        reason = cand.get("finishReason", "Unknown")
        raise Exception(f"Google Lyria 未生成内容 (原因: {reason})")
        
    part = cand["content"]["parts"][0]
    if "inlineData" in part:
        return base64.b64decode(part["inlineData"]["data"])
    
    raise Exception(f"Google Lyria 响应中未找到音频数据")

def call_minimax(prompt, api_key, group_id):
    """调用 MiniMax music-2.6"""
    print(f"  📡 尝试 MiniMax music-2.6 (备选)...")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload = {
        "model": "music-2.6",
        "prompt": prompt,
        "lyrics": "",
        "is_instrumental": True,
        "audio_setting": {"sample_rate": 44100, "bitrate": 256000, "format": "mp3"}
    }
    url = f"{MINIMAX_URL}?GroupId={group_id}" if group_id else MINIMAX_URL
    resp = requests.post(url, json=payload, headers=headers, timeout=300)
    resp.raise_for_status()
    result = resp.json()

    base_resp = result.get("base_resp", {})
    if base_resp.get("status_code", 0) != 0:
        raise Exception(f"MiniMax API 错误: {base_resp.get('status_msg')}")

    audio_data = result.get("data", {})
    audio_hex = audio_data.get("audio", "")
    if isinstance(audio_hex, str) and len(audio_hex) > 100:
        return bytes.fromhex(audio_hex)

    task_id = result.get("task_id") or audio_data.get("task_id")
    if task_id:
        return poll_minimax_task(task_id, api_key, group_id)

    raise Exception("无法解析 MiniMax 响应")

def poll_minimax_task(task_id, api_key, group_id):
    """轮询 MiniMax 异步任务"""
    headers = {"Authorization": f"Bearer {api_key}"}
    url = f"{MINIMAX_QUERY_URL}?task_id={task_id}"
    if group_id:
        url += f"&GroupId={group_id}"
        
    print(f"  ⏳ 轮询 MiniMax 任务 {task_id}...")
    for _ in range(60):
        time.sleep(5)
        resp = requests.get(url, headers=headers, timeout=30)
        data = resp.json()
        status = data.get("status") or data.get("data", {}).get("status", "")
        if status.lower() in ("success", "completed"):
            audio_url = data.get("data", {}).get("audio", {}).get("audio_url") or data.get("audio_file")
            if audio_url:
                return requests.get(audio_url).content
        elif status.lower() in ("failed", "error"):
            raise Exception("MiniMax 任务失败")
        print("    MiniMax 轮询中...")
    raise Exception("MiniMax 任务超时")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--topic", required=True)
    p.add_argument("--mood", default="auto")
    p.add_argument("--duration", type=float, required=True)
    p.add_argument("--output-dir", default="./phantom-output/audio/")
    a = p.parse_args()

    out = Path(a.output_dir); out.mkdir(parents=True, exist_ok=True)
    mood = a.mood if a.mood != "auto" else auto_mood(a.topic)
    prompt_text, cn_hint = MOOD_MAP[mood]

    print(f"🎵 幻象 BGM 生成器 v2.0")
    print(f"   主题: {a.topic} | 调性: {cn_hint} | 时长: {a.duration}s")

    prompt = f"{prompt_text}, background music for a documentary about {a.topic}, professional studio quality"
    
    google_key = os.environ.get("GEMINI_API_KEY")
    minimax_key = os.environ.get("MINIMAX_API_KEY")
    minimax_group = os.environ.get("MINIMAX_GROUP_ID")
    
    bgm_path = out / "bgm.mp3"
    audio_bytes = None

    # 1. 尝试 Lyria
    if google_key:
        try:
            audio_bytes = call_google_lyria(prompt, a.duration, google_key)
            print("✅ Google Lyria 生成成功")
        except Exception as e:
            print(f"⚠️ Google Lyria 失败: {e}")

    # 2. 尝试 MiniMax
    if not audio_bytes and minimax_key:
        try:
            audio_bytes = call_minimax(prompt, minimax_key, minimax_group)
            print("✅ MiniMax 生成成功")
        except Exception as e:
            print(f"⚠️ MiniMax 失败: {e}")

    # 3. 落地
    if audio_bytes:
        with open(bgm_path, "wb") as f:
            f.write(audio_bytes)
        print(f"✅ BGM 已就位: {bgm_path.name}")
    else:
        bgm_path = out / "bgm.wav"
        gen_silent_wav(a.duration, str(bgm_path))
        print("❌ 已回退至静默音频")

    with open(out / "bgm_b64.txt", "w") as f:
        f.write(base64.b64encode(audio_bytes if audio_bytes else b"").decode())
    
    meta = {"topic": a.topic, "mood": mood, "duration": a.duration, "file": bgm_path.name}
    with open(out / "bgm_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
