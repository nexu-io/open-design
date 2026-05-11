---
description: Generate per-slide narration audio with AI-recommended voice selection, then optionally re-export PPTX with embedded audio
---

# Generate Audio Workflow

> Standalone post-export step. Run when the user asks for "生成音频" / "录制旁白" / "narrated PPT" / "video export with voice", or proactively offer it after a deck is exported. Produces one audio file per slide via `edge-tts` by default, or a cloud TTS provider (`elevenlabs` / `minimax` / `qwen` / `cosyvoice`) when the user chooses high-quality narration or a cloned voice, then optionally re-exports the PPTX with the audio embedded and per-slide auto-advance timings.

This workflow is **independent**: it reads `notes/*.md` and queries the selected TTS voice catalog — no upstream conversation context required. Safe to invoke in a fresh session.

## When to Run

- `notes/total.md` exists and has been split into per-page files at `notes/*.md` (post-processing Step 7.1 done).
- Default mode: `edge-tts` is installed (`python3 -m pip install edge-tts`).
- High-quality cloud mode: provider API key is set before use:
  - ElevenLabs: `ELEVENLABS_API_KEY`
  - MiniMax: `MINIMAX_API_KEY`
  - Qwen: `QWEN_API_KEY` or `DASHSCOPE_API_KEY`
  - CosyVoice: `COSYVOICE_API_KEY` or `DASHSCOPE_API_KEY`
  - Keys may live in the current process environment or the first `.env` found in this order: current working directory, clone repo root, `~/.ppt-master/.env`
- The deck is in a single dominant language (mixed-language decks: pick the dominant one — the AI uses judgment, not a heuristic).

If `notes/*.md` are missing, run `total_md_split.py <project_path>` first.

---

## Step 1: Determine the deck's language

The AI already knows the deck's language from writing the notes. No detection script needed.

- Identify the primary language from the notes content: `zh` / `en` / `ja` / `ko` / etc.
- For mixed-language decks (e.g. Chinese with English technical terms), pick the language the audience will hear most of.
- For Chinese specifically: pick the locale based on context — `zh-CN` (mainland mandarin, default), `zh-TW` (Taiwanese mandarin), or `zh-HK` (Cantonese). Ask the user only if the project context doesn't make it clear.

---

## Step 2: Choose audio backend and pull the voice catalog

Default to **edge** unless the user explicitly asks for a cloud provider / higher-quality cloud narration / a cloned voice.

**edge backend**:

```bash
python3 skills/ppt-master/scripts/notes_to_audio.py --list-voices --locale <locale>
```

**ElevenLabs backend**:

```bash
python3 skills/ppt-master/scripts/notes_to_audio.py --provider elevenlabs --list-voices
```

**Cloud providers using explicit voice IDs/names**:

```bash
python3 skills/ppt-master/scripts/notes_to_audio.py --provider minimax --list-voices
python3 skills/ppt-master/scripts/notes_to_audio.py --provider qwen --list-voices
python3 skills/ppt-master/scripts/notes_to_audio.py --provider cosyvoice --list-voices
```

The output is a flat list of all available voices for the selected provider. From this list, the AI picks **3–6 candidates** to recommend, applying these rules:

- **Cover both genders** when both exist for the locale.
- **For edge**: prefer `COMMON_VOICES`-listed voices (curated set inside `notes_to_audio.py`) when the locale has them — they are battle-tested.
- **For ElevenLabs**: prefer voices already present in the user's account; if the user provides a specific `voice_id`, do not override it.
- **For MiniMax / Qwen / CosyVoice**: if the user provides a cloned `voice_id`, use it directly. Do not attempt voice cloning inside the narration workflow.
- **Match the deck's tone** — pick the strongest recommendation based on style:
  - Consultant / data-driven / 财报 → 稳重男声（如 `zh-CN-YunjianNeural`）or 清晰女声（如 `zh-CN-XiaoxiaoNeural`）
  - General / 教学 / 产品介绍 → 明亮女声 / 年轻男声（如 `zh-CN-XiaoyiNeural` / `zh-CN-YunxiNeural`）
  - 发布会 / 播报 → 播报感男声（如 `zh-CN-YunyangNeural`）
  - English consultant deck → `en-US-GuyNeural` (steady) or `en-US-JennyNeural` (clear)
  - Japanese / Korean → pick from `ja-JP-*` / `ko-KR-*` neural voices, mark gender + tone

For each candidate, write a **one-line Chinese description** covering: 性别 · 调性 · 适用场景。For cloud providers, include the voice name/ID exactly as it must be passed to `--voice-id`.

---

## Step 3: One-shot user interaction (mandatory)

Send a single message to the user that asks all three questions at once and provides a recommended value for each. Do NOT split into multiple rounds.

**Cloned-voice fast path**: if the user mentioned a cloned voice / 克隆音色 / 复刻音色 / "my own voice" along with a `voice_id`, skip the voice-recommendation list — set the provider to whichever the user named (`elevenlabs` / `minimax` / `qwen` / `cosyvoice`), pin the `voice_id` they gave you, and only confirm rate + embed-or-not.

**Message template** (Chinese; translate to user's chat language if different):

> 检测到 notes 主语言为 **<语言>**（locale: `<locale>`）。基于 deck 调性（<风格>），我推荐以下配置：
>
> **生成模式**：⭐ 推荐 `<edge|elevenlabs|minimax|qwen|cosyvoice>`（理由：<一句话，如"无需配置，稳定生成"或"用户要求高质量云端音色">）。
>
> **音色**：
> - **[1] <ShortName>** — <性别·调性·适用场景> ⭐ **推荐**
> - [2] <ShortName> — <性别·调性·适用场景>
> - [3] <ShortName> — <性别·调性·适用场景>
> - [4] <ShortName> — <性别·调性·适用场景>
> - [5] <ShortName> — <性别·调性·适用场景>
> - 也可直接输入清单中的其他 ShortName。
>
> **语速/风格参数**：⭐ 推荐 `<rate or provider defaults>`（理由：<一句话，如"页均 2–3 句，正常语速听感最稳"或"ElevenLabs 默认 voice settings 保留音色原始表现最稳">）。
>
> **生成完是否重新导出嵌入音频的 PPTX**：⭐ 推荐 **是**（一次到位，自动按音频时长设页面停留）。
>
> 直接回"好"用全部推荐值，或告诉我想改的部分（如"音色 2，语速 -5%"或"用 MiniMax 的 voice_id xxx"）。

**Recommended-value rules**:
- 生成模式：默认 `edge`；当用户明确追求高质量云端音色或提供 cloud voice ID 时，按用户指定选 `elevenlabs` / `minimax` / `qwen` / `cosyvoice`。
- 音色：从 Step 2 候选里挑最贴合 deck 调性的那一个。
- 语速：edge 默认 `+0%`；notes 字数密集（页均 >4 句长句）建议 `-5%`；notes 简短紧凑建议 `+5%`；超出此范围需说明理由。Cloud providers 默认用 provider defaults，除非用户明确要调速或改风格。
- 嵌入：默认推荐"是"；除非用户已有定制 PPTX 不希望覆盖。

---

## Step 4: Execute (no further interaction)

Run sequentially — do NOT bundle:

```bash
# 1A. Generate audio with edge (default)
python3 skills/ppt-master/scripts/notes_to_audio.py <project_path> \
  --voice <chosen-ShortName> --rate <chosen-rate>

# 1B. Or generate audio with ElevenLabs
python3 skills/ppt-master/scripts/notes_to_audio.py <project_path> \
  --provider elevenlabs --voice-id <chosen-voice-id> \
  --elevenlabs-model eleven_multilingual_v2

# 1C. Or generate audio with MiniMax
# Defaults to the China endpoint; set MINIMAX_TTS_BASE_URL=https://api.minimax.io/v1/t2a_v2 for overseas access.
python3 skills/ppt-master/scripts/notes_to_audio.py <project_path> \
  --provider minimax --voice-id <chosen-voice-id> \
  --minimax-model speech-2.8-hd

# 1D. Or generate audio with Qwen TTS
python3 skills/ppt-master/scripts/notes_to_audio.py <project_path> \
  --provider qwen --voice-id <chosen-voice> \
  --qwen-model qwen3-tts-flash --qwen-language-type Chinese

# 1E. Or generate audio with CosyVoice
python3 skills/ppt-master/scripts/notes_to_audio.py <project_path> \
  --provider cosyvoice --voice-id <chosen-voice> \
  --cosyvoice-model cosyvoice-v3-flash

# 2. (If user kept embedding) Re-export PPTX with audio embedded
python3 skills/ppt-master/scripts/svg_to_pptx.py <project_path> \
  --recorded-narration audio
```

If `notes_to_audio.py` errors with a missing dependency or missing provider API key, fix the prerequisite and re-run — do NOT swallow the error.

---

## Step 5: Completion report

Output one summary block listing:

- Number of audio files generated and their location (`<project_path>/audio/*`).
- The provider, voice, and rate/settings actually used.
- (If embedded) the new narrated PPTX path under `<project_path>/exports/`.
- (If skipped embedding) one-line hint on how to embed later: `python3 skills/ppt-master/scripts/svg_to_pptx.py <project_path> --recorded-narration audio`.
