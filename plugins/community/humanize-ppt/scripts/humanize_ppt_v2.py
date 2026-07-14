#!/usr/bin/env python3
import argparse
import html
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from .pptx_qa import inspect_pptx
except ImportError:  # Stable scripts/humanize_ppt.py entrypoint imports this as a top-level module.
    from pptx_qa import inspect_pptx

SKILL_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = SKILL_ROOT / "registry" / "renderer_registry.json"
VERSION = "1.1.0"
BEAUTIFUL_REPO_URL = "https://github.com/zarazhangrui/beautiful-html-templates.git"
DEFAULT_ZH_PREVIEW_COUNT = 3
DEFAULT_EN_PREVIEW_COUNT = 5

ROLE_ARC = [
    ("hook", "抓住注意力：先把观众从信息疲劳里拉出来。"),
    ("context", "建立共同背景：说明为什么现在要听这件事。"),
    ("tension", "制造认知张力：指出旧理解和真实问题之间的差距。"),
    ("method", "给出方法：把复杂信息变成可执行路径。"),
    ("proof", "给出证据：用案例、步骤或指标证明它不是口号。"),
    ("takeaway", "收束行动：让观众带走一句可复述的方法。"),
]

BANNED_VISIBLE_PATTERNS = ["思考过程", "推理过程", "作为AI", "作为一个AI", "我将", "首先我需要"]

# ---------------------------------------------------------------------------
# v0.9: style gallery — the cover-style gate that precedes the outline.
#
# Humanize never renders. The gallery is a *spec*: for each candidate style
# Humanize emits a cover-only render command (downstream renders ONLY S01 →
# outputs/style-gallery/<id>/cover.{html,png}) plus a zero-dependency
# style_gallery.html that stitches the rendered covers for the human to pick
# from. After picking, the human re-runs the printed re-injection command,
# which carries the chosen style into the normal outline → brief flow.
#
# Each candidate carries `cli`: the exact renderer/style args to graft onto
# the next run. ≥4 per renderer so --gallery-count (min 4) is always satisfiable.
# Guizang candidates span both tracks (Style A themes + Style B accent) so the
# four covers are visually distinct, not four shades of one look.
STYLE_GALLERY_CANDIDATES = {
    "guizang": [
        {
            "id": "guizang-ink-classic",
            "label": "墨水经典 / Ink Classic",
            "description": "Style A · WebGL 水墨封面 · 已验证的 known-good 基线（examples/03）",
            "cli": {"--renderer": "guizang", "--guizang-style": "A", "--guizang-theme": "ink-classic"},
        },
        {
            "id": "guizang-kraft-paper",
            "label": "牛皮纸 / Kraft Paper",
            "description": "Style A · 暖棕纸质调 · 适合手作 / 复古 / 温度感选题",
            "cli": {"--renderer": "guizang", "--guizang-style": "A", "--guizang-theme": "kraft-paper"},
        },
        {
            "id": "guizang-indigo-porcelain",
            "label": "靛蓝瓷 / Indigo Porcelain",
            "description": "Style A · 蓝灰瓷面调 · 沉静、东方、适合品牌 / 文化选题",
            "cli": {"--renderer": "guizang", "--guizang-style": "A", "--guizang-theme": "indigo-porcelain"},
        },
        {
            "id": "guizang-swiss-ikb",
            "label": "瑞士国际 · 克莱因蓝 / Swiss · IKB",
            "description": "Style B · 16 栏网格 + 单一饱和强调色 · 静态稳定、不依赖 WebGL",
            "cli": {"--renderer": "guizang", "--guizang-style": "B", "--guizang-accent": "ikb"},
        },
    ],
    "frontend-slides": [
        {
            "id": "frontend-editorial-serif",
            "label": "编辑杂志 / Editorial Serif",
            "description": "衬线标题 + 大留白 · 长文转述、观点型选题",
            "cli": {"--renderer": "frontend-slides", "--style-direction": "editorial-serif"},
        },
        {
            "id": "frontend-techno-grid",
            "label": "科技网格 / Techno Grid",
            "description": "等宽字 + 暗色网格 + 强调色 · 产品 / 数据 / 工程选题",
            "cli": {"--renderer": "frontend-slides", "--style-direction": "techno-grid"},
        },
        {
            "id": "frontend-soft-gradient",
            "label": "柔和渐变 / Soft Gradient",
            "description": "渐变背景 + 圆角卡片 · 消费、品牌、温度感选题",
            "cli": {"--renderer": "frontend-slides", "--style-direction": "soft-gradient"},
        },
        {
            "id": "frontend-mono-contrast",
            "label": "黑白高反差 / Mono Contrast",
            "description": "纯黑白 + 超大字号 · 宣言、keynote、强观点开场",
            "cli": {"--renderer": "frontend-slides", "--style-direction": "mono-contrast"},
        },
    ],
    "beautiful-html-templates": [
        {
            "id": "beautiful-template-1",
            "label": "候选模板 1 / Template Slot 1",
            "description": "由 beautiful-html-templates 的原生模板库填充（占位 slug，下游选定真实模板）",
            "cli": {"--renderer": "beautiful-html-templates", "--selected-template": "slot-1"},
        },
        {
            "id": "beautiful-template-2",
            "label": "候选模板 2 / Template Slot 2",
            "description": "由 beautiful-html-templates 的原生模板库填充（占位 slug，下游选定真实模板）",
            "cli": {"--renderer": "beautiful-html-templates", "--selected-template": "slot-2"},
        },
        {
            "id": "beautiful-template-3",
            "label": "候选模板 3 / Template Slot 3",
            "description": "由 beautiful-html-templates 的原生模板库填充（占位 slug，下游选定真实模板）",
            "cli": {"--renderer": "beautiful-html-templates", "--selected-template": "slot-3"},
        },
        {
            "id": "beautiful-template-4",
            "label": "候选模板 4 / Template Slot 4",
            "description": "由 beautiful-html-templates 的原生模板库填充（占位 slug，下游选定真实模板）",
            "cli": {"--renderer": "beautiful-html-templates", "--selected-template": "slot-4"},
        },
    ],
}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_registry():
    if REGISTRY_PATH.exists():
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return {"version": VERSION, "renderers": []}


def expand_user_path(value):
    return Path(value).expanduser()


def read_source(source):
    path = Path(source).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"source not found: {path}")
    if path.suffix.lower() in {".ppt", ".pptx"}:
        return path, f"PPTX source: {path.name}\n", []
    text = path.read_text(encoding="utf-8", errors="replace")
    return path, text, markdown_segments(text)


def strip_md(line):
    line = re.sub(r"^#{1,6}\s*", "", line.strip())
    line = re.sub(r"^[-*+]\s+", "", line)
    line = re.sub(r"^\d+[.)]\s+", "", line)
    line = re.sub(r"[`*_>\[\]]", "", line)
    return line.strip()


def markdown_segments(text):
    segments = []
    current_title = None
    buffer = []

    def flush():
        nonlocal current_title, buffer
        body = " ".join(strip_md(x) for x in buffer if strip_md(x))
        if current_title or body:
            segments.append({"title": current_title or first_sentence(body), "body": body})
        current_title = None
        buffer = []

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if re.match(r"^#{1,3}\s+", line):
            flush()
            current_title = strip_md(line)
        else:
            buffer.append(line)
    flush()

    if not segments:
        lines = [strip_md(x) for x in text.splitlines() if strip_md(x)]
        for i in range(0, min(len(lines), 12), 2):
            body = " ".join(lines[i : i + 2])
            segments.append({"title": first_sentence(body), "body": body})
    return [s for s in segments if s.get("title") or s.get("body")]


def first_sentence(text, fallback="未命名要点"):
    text = " ".join(text.split())
    if not text:
        return fallback
    parts = re.split(r"(?<=[。！？.!?])\s+|[。！？!?]", text)
    title = parts[0].strip() if parts else text
    return title[:42] or fallback


def detect_language(text):
    cjk = len(re.findall(r"[\u4e00-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    return "zh" if cjk >= latin * 0.25 else "en"


def infer_audience(text, language):
    lower = text.lower()
    if any(k in lower for k in ["agent", "skill", "ai", "模型", "工具", "ppt"]):
        return "对AI工具、PPT生产、Agent工作流感兴趣的内容创作者、产品人和独立开发者。" if language == "zh" else "Creators, product builders, and independent developers interested in AI tools and agent workflows."
    return "需要快速理解主题、形成判断并采取下一步行动的听众。" if language == "zh" else "An audience that needs to understand the topic, form judgment, and take action."


def build_slide_plan(title, text, segments, renderer_hint):
    if not segments:
        segments = [{"title": title, "body": text.strip() or title}]
    selected = segments[: max(5, min(8, len(segments)))]
    while len(selected) < 5:
        selected.append(selected[-1])

    plan = []
    for i, item in enumerate(selected[:8], 1):
        role, intent = ROLE_ARC[min(i - 1, len(ROLE_ARC) - 1)]
        body = item.get("body") or item.get("title") or title
        message = first_sentence(body, fallback=item.get("title") or title)
        visible = [message]
        detail = body.replace(message, "", 1).strip(" 。，,.；;")
        if detail:
            visible.append(detail[:110])
        media = decide_media(role, title if i == 1 else (item.get("title") or message), message, visible, slide_id=f"S{i:02d}")
        plan.append(
            {
                "slide_id": f"S{i:02d}",
                "role": role,
                "title": title if i == 1 else (item.get("title") or message)[:48],
                "message": message[:120],
                "visible_content": visible[:3],
                "speaker_intent": intent,
                "media": media,
                "layout_hint": layout_hint_for_role(role),
                "recommended_renderer": renderer_hint,
            }
        )
    return plan


# Per-role media decision. Humanize makes the call; downstream skills
# produce the actual material in their native format.
ROLE_MEDIA_POLICY = {
    "hook": {
        "image":   {"needed": True,  "kind": "gpt-photo"},
        "diagram": {"needed": False, "kind": "none"},
        "video":   {"needed": False, "kind": "none"},
    },
    "context": {
        "image":   {"needed": False, "kind": "none"},
        "diagram": {"needed": True,  "kind": "svg-html"},
        "video":   {"needed": False, "kind": "none"},
    },
    "tension": {
        "image":   {"needed": True,  "kind": "svg-html"},
        "diagram": {"needed": False, "kind": "none"},
        "video":   {"needed": False, "kind": "none"},
    },
    "method": {
        "image":   {"needed": False, "kind": "none"},
        "diagram": {"needed": True,  "kind": "svg-html"},
        "video":   {"needed": True,  "kind": "remotion-clip", "duration_s": 10},
    },
    "proof": {
        "image":   {"needed": True,  "kind": "screenshot"},
        "diagram": {"needed": True,  "kind": "svg-html"},
        "video":   {"needed": True,  "kind": "remotion-clip", "duration_s": 8},
    },
    "takeaway": {
        "image":   {"needed": True,  "kind": "svg-html"},
        "diagram": {"needed": False, "kind": "none"},
        "video":   {"needed": False, "kind": "none"},
    },
}

ROLE_LAYOUT_HINT = {
    "hook":     "S01-cover-hero",
    "context":  "S04-context-system",
    "tension":  "S06-tension-comparison",
    "method":   "S07-process-21x9",
    "proof":    "S12-proof-metrics",
    "takeaway": "S22-takeaway",
}


def layout_hint_for_role(role):
    return ROLE_LAYOUT_HINT.get(role)


def decide_media(role, title, message, visible_content, slide_id=None):
    """Per-page media decision.

    Returns a dict shaped like the `media` field in slide-plan.schema.json.
    The downstream skill reads this and produces materials in its native
    format. Humanize never renders them.

    v0.6.7: when slide_id is provided, machine-actionable fields are
    populated so a downstream media subagent can find the target file
    and know what to generate:
      - asset_path: where the file should land
      - prompt_hint: what the image / diagram / video should depict
      - aspect_ratio: image / video aspect
      - max_size_kb: image size budget
    """
    base = {
        "image":   {"needed": False, "kind": "none"},
        "diagram": {"needed": False, "kind": "none"},
        "video":   {"needed": False, "kind": "none"},
    }
    policy = ROLE_MEDIA_POLICY.get(role)
    if not policy:
        return base

    text = " ".join([title or "", message or "", " ".join(visible_content or [])]).lower()
    for key in ("image", "diagram", "video"):
        entry = dict(policy.get(key) or {"needed": False, "kind": "none"})
        if entry.get("needed"):
            entry["purpose"] = media_purpose(role, key, text)
            entry["slot"] = media_slot(role, key)
            # v0.6.7: machine-actionable fields for the media subagent
            if slide_id:
                sid_lower = slide_id.lower()
                ext = media_extension(entry.get("kind", ""))
                entry["asset_path"] = f"assets/{sid_lower}-{key}.{ext}"
            entry["prompt_hint"] = media_prompt_hint(role, key, title, message, text)
            if key in ("image", "video"):
                entry.setdefault("aspect_ratio", "16:9")
                if key == "image":
                    entry.setdefault("max_size_kb", 200)
        base[key] = entry
    return base


def media_extension(kind):
    return {
        "gpt-photo": "png",
        "svg-html": "svg",
        "screenshot": "png",
        "html-table": "html",
        "remotion-clip": "mp4",
        "hyperframes": "mp4",
    }.get(kind, "bin")


def media_prompt_hint(role, kind, title, message, text):
    """v0.6.7: human-readable prompt for the image / diagram / video model.

    Combines the slide's title + message into a single prompt the
    downstream subagent can hand to GPT-Image / SVG writer / Remotion.
    """
    parts = []
    if title:
        parts.append(f"Slide title: {title}")
    if message:
        parts.append(f"Slide message: {message}")
    role_hint = {
        "hook":     "Open the deck. Set emotional anchor.",
        "context":  "Establish common ground. Show system / scope.",
        "tension":  "Highlight the gap or contradiction.",
        "method":   "Walk through the process / decision tree.",
        "proof":    "Show evidence: real UI, screenshots, before/after.",
        "takeaway": "Close the deck. Reinforce the judgment.",
    }.get(role, "")
    if role_hint:
        parts.append(f"Page role: {role_hint}")
    kind_hint = {
        "image":   "Image: must be visually anchored, no Chinese text in the image (Chinese labels go in the slide layout).",
        "diagram": "Diagram: render as inline SVG or HTML table, deterministic, no text overflow.",
        "video":   "Short loop clip (8-12s), deterministic motion, no narration.",
    }.get(kind, "")
    if kind_hint:
        parts.append(f"Asset guidance: {kind_hint}")
    return " | ".join(parts)


def media_purpose(role, kind, text):
    if kind == "image":
        if role == "hook":
            return "Set emotional anchor for the opening page"
        if role == "tension":
            return "Show before/after or contradiction visually"
        if role == "proof":
            return "Screenshot evidence of the real UI or result"
        if role == "takeaway":
            return "Visual summary that reinforces the closing judgment"
    if kind == "diagram":
        if role == "context":
            return "Show the system relationship or scope"
        if role == "method":
            return "Diagram the process / decision tree / flow"
        if role == "proof":
            return "Diagram the comparison or supporting structure"
    if kind == "video":
        if role == "method":
            return "8-12s process clip that walks through the method"
        if role == "proof":
            return "Short before/after or result clip"
    return ""


def media_slot(role, kind):
    if kind == "image":
        return f"{role}-image-16x9"
    if kind == "diagram":
        return f"{role}-diagram-21x9"
    if kind == "video":
        return f"{role}-video-16x9"
    return f"{role}-{kind}"


def write_contracts(out, title, source_path, text, plan, language):
    audience = infer_audience(text, language)
    tension = "资料很多，但能让观众听懂、记住、复述的路径不清晰。" if language == "zh" else "There is too much material and not enough audience-ready narrative path."
    goal = f"把《{title}》整理成可讲、可生成、可交付的PPT生产契约。" if language == "zh" else f"Turn '{title}' into a presentation-ready production contract."
    out.mkdir(parents=True, exist_ok=True)
    (out / "deck_brief.md").write_text(
        f"""# Deck Brief

## Title
{title}

## Source
{source_path}

## Deck Goal
{goal}

## Audience
{audience}

## Initial State
听众知道一些零散信息，但缺少清晰判断和行动路径。

## Desired State
听众能复述核心判断，理解为什么现在要做，并知道下一步怎么执行。

## Core Tension
{tension}

## Success Criteria
- 观众能用一句话说出这份PPT的核心判断。
- 每页只承担一个状态转移任务。
- 下游渲染器不直接吞原始素材，只消费Humanize PPT契约。
""",
        encoding="utf-8",
    )
    (out / "ast_outline.md").write_text(
        "# AST Outline\n\n"
        f"## Audience\n{audience}\n\n"
        "## State\n- Initial: 信息分散，缺少可讲路径。\n- Desired: 形成清晰判断，并能执行下一步。\n\n"
        "## Transfer\n"
        + "\n".join([f"- {p['slide_id']} / {p['role']}: {p['speaker_intent']}" for p in plan])
        + "\n",
        encoding="utf-8",
    )
    (out / "slide_plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "speaker_intent.md").write_text(
        "\n".join(
            [
                f"## {p['slide_id']} {p['title']}\n\n- Intent: {p['speaker_intent']}\n- Say: {p['message']}\n- Avoid: 不要把模型草稿、推理过程或工具清单直接放到页面上。\n"
                for p in plan
            ]
        ),
        encoding="utf-8",
    )
    asset_rows = []
    for p in plan:
        media = p.get("media") or {}
        for kind, key in (("image", "image"), ("diagram", "diagram"), ("video", "video")):
            entry = media.get(key) or {}
            if not entry.get("needed"):
                continue
            asset_rows.append(
                f"| asset-{p['slide_id'].lower()}-{key} | {p['slide_id']} | {entry.get('kind', '?')} | {entry.get('purpose', '')} | pending |"
            )
    (out / "asset_manifest.md").write_text(
        "# Asset Manifest\n\n"
        "Each row is a Humanize-owned media decision. The downstream skill "
        "produces the material in its own native format.\n\n"
        "| asset_id | slide_id | type | purpose | status |\n"
        "|---|---|---|---|---|\n"
        + "\n".join(asset_rows)
        + "\n",
        encoding="utf-8",
    )
    video_slots = []
    for idx, p in enumerate(plan, 1):
        video = (p.get("media") or {}).get("video") or {}
        if not video.get("needed"):
            continue
        video_slots.append(
            {
                "video_id": f"V{idx:02d}",
                "slide_id": p["slide_id"],
                "kind": video.get("kind", "remotion-clip"),
                "purpose": video.get("purpose", ""),
                "duration_seconds": int(video.get("duration_s", 10)),
                "aspect_ratio": "16:9",
                "slot": video.get("slot", f"{p['role']}-video-16x9"),
                "fallback_static": f"asset-{p['slide_id'].lower()}-diagram",
            }
        )
    (out / "video_slots.json").write_text(json.dumps(video_slots, ensure_ascii=False, indent=2), encoding="utf-8")


def choose_routes(args, source_path, text, language):
    requested = args.renderer
    suffix = source_path.suffix.lower()
    if getattr(args, "ppt_master_template", None):
        primary = "ppt-master"
        reason = "用户提供 raw .pptx template，按 PPT Master template-fill-pptx 路由原生填充。"
    elif requested != "auto":
        primary = requested
        reason = f"用户指定 renderer={requested}。"
    elif suffix in {".ppt", ".pptx"}:
        primary = "frontend-slides"
        reason = "输入是PPT/PPTX，优先走转换路径。"
    elif getattr(args, "selected_template", None):
        primary = "beautiful-html-templates"
        reason = f"用户指定 selected_template={args.selected_template}，用选中 Beautiful 模板生成完整 deck。"
    elif args.style_mode == "preview-first":
        primary = "beautiful-html-templates"
        reason = "用户选择 preview-first，优先进入可视化风格探索。"
    elif args.style_mode == "presenter-first" or args.presenter:
        primary = "html-ppt"
        reason = "用户需要演讲者模式，优先走html-ppt。"
    elif language == "zh":
        primary = "guizang"
        reason = "中文内容且未指定风格探索，优先走guizang稳定路径。"
    else:
        primary = "beautiful-html-templates"
        reason = "英文或跨风格内容，先定主题并生成至少5个风格候选，再进入成稿。"

    routes = [
        {
            "id": primary,
            "stage": "produce",
            "purpose": "根据Humanize PPT契约生成主deck或候选预览。",
            "reason": reason,
            "command_file": f"commands/{primary}-agent.md" if primary != "beautiful-html-templates" else "commands/beautiful-agent.md",
            "status": "planned",
        }
    ]
    if args.presenter and primary not in {"html-ppt", "ppt-master"}:
        routes.append(
            {
                "id": "html-ppt",
                "stage": "complete",
                "purpose": "在最终deck确定后增加演讲者模式和speaker notes。",
                "reason": "presenter=True。",
                "command_file": "commands/html-ppt-agent.md",
                "status": "planned",
            }
        )
    if getattr(args, "presenter_adapter", False):
        routes.append(
            {
                "id": "presenter-adapter",
                "stage": "complete",
                "purpose": "为最终deck生成独立 presenter shell 和逐页 speaker notes。",
                "reason": "presenter_adapter=True。",
                "command_file": "commands/presenter-adapter-agent.md",
                "status": "planned",
            }
        )
    if getattr(args, "export_adapter", False):
        export_purpose = (
            "由 PPT Master 原生 export + render manifest 接管；不再生成 HTML/PDF export package。"
            if primary == "ppt-master"
            else "为最终deck生成可移植导出包和 PDF 导出脚本。"
        )
        routes.append(
            {
                "id": "export-adapter",
                "stage": "complete",
                "purpose": export_purpose,
                "reason": (
                    "export_adapter=True；PPT Master 路线由其原生 exporter 接管。"
                    if primary == "ppt-master"
                    else "export_adapter=True。"
                ),
                "command_file": "commands/export-adapter-agent.md",
                "status": "planned",
            }
        )
    routes.append(
        {
            "id": "qa",
            "stage": "control",
            "purpose": "检查契约、路径、人感、AI草稿痕迹和交付完整性。",
            "reason": "所有Humanize PPT运行必须经过QA。",
            "command_file": "commands/qa-agent.md",
            "status": "planned",
        }
    )
    return primary, routes


def resolve_preview_count(language, requested=None):
    if language == "zh":
        return max(1, requested if requested is not None else DEFAULT_ZH_PREVIEW_COUNT)
    baseline = DEFAULT_EN_PREVIEW_COUNT
    return max(baseline, requested if requested is not None else baseline)


def renderer_by_id(registry):
    return {item["id"]: item for item in registry.get("renderers", [])}


def simple_tokens(*values):
    text = " ".join(str(v or "") for v in values).lower()
    tokens = set(re.findall(r"[a-z0-9][a-z0-9-]{1,}|[\u4e00-\u9fff]{2,}", text))
    aliases = {
        "ai": {"agent", "agents", "developer", "tools", "workflow", "product", "launch"},
        "agent": {"ai", "developer", "workflow", "tools"},
        "ppt": {"presentation", "deck", "slides"},
        "工具": {"ai", "tools", "workflow"},
        "产品": {"product", "launch"},
        "发布": {"launch", "product"},
        "分享": {"talk", "presentation", "deck"},
    }
    expanded = set(tokens)
    for token in list(tokens):
        expanded.update(aliases.get(token, set()))
    return expanded


def infer_preview_brief(title, text, language, occasion=None, mood=None):
    inferred_occasion = occasion
    inferred_mood = mood
    lower = text.lower()
    if not inferred_occasion:
        if any(k in lower for k in ["ai", "agent", "skill", "工具", "模型", "工作流"]):
            inferred_occasion = "AI workflow product demo, developer tools, creator presentation"
        else:
            inferred_occasion = "research synthesis, product narrative, presentation"
    if not inferred_mood:
        inferred_mood = "confident editorial modern design-led practical" if language == "zh" else "confident editorial modern design-led"
    return {
        "title": title,
        "occasion": inferred_occasion,
        "mood": inferred_mood,
    }


def template_search_text(template):
    fields = [
        template.get("slug"),
        template.get("name"),
        template.get("tagline"),
        template.get("best_for"),
        template.get("avoid_for"),
        template.get("formality"),
        template.get("density"),
        template.get("scheme"),
        " ".join(template.get("mood", [])),
        " ".join(template.get("occasion", [])),
        " ".join(template.get("tone", [])),
    ]
    return " ".join(str(x or "") for x in fields)


def score_template(template, title, text, occasion, mood):
    wanted = simple_tokens(title, text, occasion, mood)
    mood_tokens = simple_tokens(" ".join(template.get("mood", [])), " ".join(template.get("tone", [])))
    occasion_tokens = simple_tokens(" ".join(template.get("occasion", [])), template.get("best_for", ""))
    all_tokens = simple_tokens(template_search_text(template))
    score = 0
    score += 5 * len(wanted & mood_tokens)
    score += 3 * len(wanted & occasion_tokens)
    score += len(wanted & all_tokens)
    if template.get("density") in {"medium", "high"}:
        score += 2
    if template.get("formality") in {"medium", "medium-high", "high"}:
        score += 1
    return score


def select_beautiful_templates(repo_path, title, text, language, occasion=None, mood=None, count=3):
    repo = Path(repo_path).expanduser()
    index_path = repo / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    brief = infer_preview_brief(title, text, language, occasion, mood)
    scored = []
    for template in index.get("templates", []):
        slug = template.get("slug")
        if not slug or not (repo / "templates" / slug / "template.html").exists():
            continue
        score = score_template(template, title, text, brief["occasion"], brief["mood"])
        scored.append((score, template))
    scored.sort(key=lambda item: (-item[0], item[1].get("slug", "")))

    selected = []
    seen_schemes = set()
    for score, template in scored:
        if len(selected) >= count:
            break
        scheme = template.get("scheme")
        if len(selected) < 2 or scheme not in seen_schemes or len(scored) <= count:
            selected.append((score, template))
            seen_schemes.add(scheme)
    for score, template in scored:
        if len(selected) >= count:
            break
        if template.get("slug") not in {item[1].get("slug") for item in selected}:
            selected.append((score, template))

    results = []
    for score, template in selected[:count]:
        reason = f"匹配 occasion=`{brief['occasion']}`，mood=`{brief['mood']}`；{template.get('tagline', template.get('best_for', ''))}"
        results.append(
            {
                "slug": template["slug"],
                "name": template.get("name", template["slug"]),
                "tagline": template.get("tagline", ""),
                "score": score,
                "reason": reason,
                "mood": template.get("mood", []),
                "tone": template.get("tone", []),
                "scheme": template.get("scheme"),
                "density": template.get("density"),
                "slide_count": template.get("slide_count"),
            }
        )
    return results


def find_beautiful_repo(value=None, auto_clone=True):
    if value:
        path = Path(value).expanduser()
        return path if (path / "index.json").exists() else None
    candidates = [
        Path.home() / ".agents/skills/beautiful-html-templates",
        Path.home() / ".hermes/skills/beautiful-html-templates",
        Path.home() / ".cache/humanize-ppt/beautiful-html-templates",
        Path("/tmp/beautiful-html-templates"),
    ]
    for candidate in candidates:
        if (candidate / "index.json").exists():
            return candidate
    if auto_clone:
        cache = Path.home() / ".cache/humanize-ppt/beautiful-html-templates"
        cache.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(
                ["git", "clone", "--depth", "1", BEAUTIFUL_REPO_URL, str(cache)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            return None
        if (cache / "index.json").exists():
            return cache
    return None


def title_html(title):
    raw = " ".join(title.split())
    if len(raw) > 18 and not re.search(r"\s", raw):
        parts = [x for x in re.split(r"([，、：:—-])", raw) if x]
        lines, current = [], ""
        for part in parts:
            if len(current + part) > 14 and current:
                lines.append(current.strip("，、：:—- "))
                current = part
            else:
                current += part
        if current:
            lines.append(current.strip("，、：:—- "))
    else:
        words = raw.split()
        if len(words) > 4:
            mid = max(2, len(words) // 2)
            lines = [" ".join(words[:mid]), " ".join(words[mid:])]
        else:
            lines = [raw]
    return "<br />".join(html.escape(x) for x in lines if x) or html.escape(title)


def first_cover_section(document):
    match = re.search(r"<section\b[\s\S]*?</section>", document, flags=re.IGNORECASE)
    return match.group(0) if match else ""


def customize_cover_section(section, title, subtitle, kicker):
    if not section:
        return f"<section class=\"slide s-cover\"><h1>{title_html(title)}</h1><p>{html.escape(subtitle)}</p></section>"
    updated = re.sub(
        r"(<h1\b[^>]*>)[\s\S]*?(</h1>)",
        lambda m: m.group(1) + title_html(title) + m.group(2),
        section,
        count=1,
        flags=re.IGNORECASE,
    )
    subtitle_html = html.escape(subtitle)
    if re.search(r"<p\b", updated, flags=re.IGNORECASE):
        updated = re.sub(
            r"(<p\b[^>]*>)[\s\S]*?(</p>)",
            lambda m: m.group(1) + subtitle_html + m.group(2),
            updated,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        updated = re.sub(r"(</h1>)", r"\1\n<p>" + subtitle_html + "</p>", updated, count=1, flags=re.IGNORECASE)
    updated = re.sub(
        r"(<div\b[^>]*class=[\"'][^\"']*(?:kicker|eyebrow|label)[^\"']*[\"'][^>]*>)[\s\S]*?(</div>)",
        lambda m: m.group(1) + html.escape(kicker) + m.group(2),
        updated,
        count=1,
        flags=re.IGNORECASE,
    )
    updated = re.sub(r"01\s*/\s*\d+", "01 / 01", updated, count=1)
    return updated


def keep_first_section_only(document, section):
    if re.search(r"<deck-stage\b", document, flags=re.IGNORECASE):
        return re.sub(
            r"(<deck-stage\b[^>]*>)[\s\S]*?(</deck-stage>)",
            lambda m: m.group(1) + "\n" + section + "\n" + m.group(2),
            document,
            count=1,
            flags=re.IGNORECASE,
        )
    if re.search(r"<div\b[^>]*id=[\"']deck[\"']", document, flags=re.IGNORECASE):
        return re.sub(
            r"(<div\b[^>]*id=[\"']deck[\"'][^>]*>)[\s\S]*?(</div>)",
            lambda m: m.group(1) + "\n" + section + "\n" + m.group(2),
            document,
            count=1,
            flags=re.IGNORECASE,
        )
    return re.sub(r"<body\b([^>]*)>[\s\S]*?</body>", lambda m: f"<body{m.group(1)}>\n{section}\n</body>", document, count=1, flags=re.IGNORECASE)


def copy_preview_assets(repo, template_dir, preview_dir):
    for src in template_dir.iterdir():
        if src.name == "template.html":
            continue
        dst = preview_dir / src.name
        if src.is_dir():
            shutil.copytree(src, dst, dirs_exist_ok=True)
        elif src.is_file():
            shutil.copy2(src, dst)
    runtime = repo / "runtime" / "deck-stage.js"
    if runtime.exists() and not (preview_dir / "deck-stage.js").exists():
        shutil.copy2(runtime, preview_dir / "deck-stage.js")


def write_beautiful_gallery(previews_dir, previews):
    cards = []
    for item in previews:
        rel = Path(item["path"]).relative_to(previews_dir)
        cards.append(
            f"""<article><h2>{html.escape(item['name'])}</h2><p>{html.escape(item['reason'])}</p><iframe src=\"{html.escape(str(rel))}\"></iframe></article>"""
        )
    doc = f"""<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Beautiful Preview Gallery</title><style>body{{margin:0;background:#111;color:#f7f1e8;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}}main{{padding:32px;display:grid;gap:28px}}article{{border:1px solid rgba(255,255,255,.18);border-radius:18px;padding:20px;background:#181818}}h1{{font-size:40px}}h2{{margin:.2em 0}}p{{color:#cfc7b8}}iframe{{width:100%;aspect-ratio:16/9;border:0;border-radius:12px;background:#000}}</style></head><body><main><h1>Humanize PPT · Beautiful Preview-First</h1>{''.join(cards)}</main></body></html>"""
    gallery = previews_dir / "index.html"
    gallery.write_text(doc, encoding="utf-8")
    return gallery


def write_beautiful_previews(out, title, text, plan, repo_path, language, occasion=None, mood=None, count=3):
    repo = Path(repo_path).expanduser() if repo_path else None
    if not repo or not (repo / "index.json").exists():
        return {
            "status": "missing-library",
            "message": "beautiful-html-templates index.json not found. Pass --beautiful-repo or allow auto clone.",
            "previews": [],
        }
    target = out / "outputs" / "beautiful"
    previews_dir = target / "previews"
    previews_dir.mkdir(parents=True, exist_ok=True)
    selected = select_beautiful_templates(repo, title, text, language, occasion, mood, count=count)
    subtitle = plan[0].get("message") if plan else first_sentence(text, fallback="Humanize PPT preview")
    previews = []
    for idx, item in enumerate(selected, 1):
        slug = item["slug"]
        template_dir = repo / "templates" / slug
        preview_dir = previews_dir / f"{idx:02d}-{slug}"
        preview_dir.mkdir(parents=True, exist_ok=True)
        copy_preview_assets(repo, template_dir, preview_dir)
        document = (template_dir / "template.html").read_text(encoding="utf-8", errors="replace")
        section = customize_cover_section(
            first_cover_section(document),
            title=title,
            subtitle=subtitle,
            kicker="Humanize PPT · Preview-First",
        )
        preview_doc = keep_first_section_only(document, section)
        preview_doc = re.sub(r"<title>[\s\S]*?</title>", f"<title>{html.escape(title)} · {html.escape(item['name'])}</title>", preview_doc, count=1, flags=re.IGNORECASE)
        preview_path = preview_dir / "index.html"
        preview_path.write_text(preview_doc, encoding="utf-8")
        previews.append({**item, "path": str(preview_path)})
    gallery = write_beautiful_gallery(previews_dir, previews)
    manifest = {
        "version": VERSION,
        "generated_at": now_iso(),
        "repo": str(repo),
        "title": title,
        "language": language,
        "occasion": occasion,
        "mood": mood,
        "preview_count": len(previews),
        "requested_preview_count": count,
        "gallery": str(gallery),
        "previews": previews,
    }
    (target / "preview_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    report = ["# Beautiful Render Report", "", "- status: rendered", f"- repo: {repo}", f"- gallery: {gallery}", "", "## Candidates"]
    report.extend([f"- {i}. {item['name']} (`{item['slug']}`): {item['path']}" for i, item in enumerate(previews, 1)])
    (target / "render_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    return {"status": "rendered", "gallery": str(gallery), "previews": previews, "manifest": str(target / "preview_manifest.json"), "report": str(target / "render_report.md")}


def beautiful_slide_section(slide, idx, total, deck_title):
    title = slide.get("title") or deck_title
    message = slide.get("message") or title
    bullets = [x for x in slide.get("visible_content", []) if x and x != message]
    role = slide.get("role", "slide")
    intent = slide.get("speaker_intent", "")
    if idx == 1:
        return f"""<section class=\"slide s-cover humanize-slide humanize-cover\">
  <div class=\"kicker\">Humanize PPT · Selected Template Full Deck</div>
  <h1>{title_html(deck_title)}</h1>
  <p>{html.escape(message)}</p>
  <div class=\"pagenum\">{idx:02d} / {total:02d}</div>
</section>"""
    bullet_html = "".join(f"<li>{html.escape(item)}</li>" for item in bullets[:4])
    if not bullet_html:
        bullet_html = f"<li>{html.escape(message)}</li>"
    return f"""<section class=\"slide humanize-slide\">
  <div class=\"kicker\">{html.escape(role).upper()} · {idx:02d} / {total:02d}</div>
  <h2>{html.escape(title)}</h2>
  <p>{html.escape(message)}</p>
  <ul>{bullet_html}</ul>
  <div class=\"speaker-note\">Speaker intent: {html.escape(intent)}</div>
  <div class=\"pagenum\">{idx:02d} / {total:02d}</div>
</section>"""


def inject_deck_sections(document, sections):
    joined = "\n".join(sections)
    if re.search(r"<deck-stage\b", document, flags=re.IGNORECASE):
        return re.sub(
            r"(<deck-stage\b[^>]*>)[\s\S]*?(</deck-stage>)",
            lambda m: m.group(1) + "\n" + joined + "\n" + m.group(2),
            document,
            count=1,
            flags=re.IGNORECASE,
        )
    if re.search(r"<div\b[^>]*id=[\"']deck[\"']", document, flags=re.IGNORECASE):
        return re.sub(
            r"(<div\b[^>]*id=[\"']deck[\"'][^>]*>)[\s\S]*?(</div>)",
            lambda m: m.group(1) + "\n" + joined + "\n" + m.group(2),
            document,
            count=1,
            flags=re.IGNORECASE,
        )
    return re.sub(r"<body\b([^>]*)>[\s\S]*?</body>", lambda m: f"<body{m.group(1)}>\n{joined}\n</body>", document, count=1, flags=re.IGNORECASE)


def add_selected_deck_controls(document):
    controls = """<script>
(() => {
  const slides = [...document.querySelectorAll('.slide')];
  let index = 0;
  function show(next) {
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach((slide, i) => {
      slide.style.display = i === index ? '' : 'none';
      slide.setAttribute('aria-hidden', i === index ? 'false' : 'true');
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === ' ') show(index + 1);
    if (event.key === 'ArrowLeft') show(index - 1);
  });
  show(0);
})();
</script>"""
    if "querySelectorAll('.slide')" in document:
        return document
    return re.sub(r"</body>", controls + "\n</body>", document, count=1, flags=re.IGNORECASE)


def write_beautiful_selected_deck(out, title, plan, repo_path, selected_template):
    repo = Path(repo_path).expanduser() if repo_path else None
    if not repo or not (repo / "index.json").exists():
        return {
            "status": "missing-library",
            "message": "beautiful-html-templates index.json not found. Pass --beautiful-repo or allow auto clone.",
        }
    template_dir = repo / "templates" / selected_template
    template_path = template_dir / "template.html"
    if not template_path.exists():
        return {
            "status": "missing-template",
            "message": f"beautiful-html-templates template not found: {selected_template}",
        }

    target = out / "outputs" / "beautiful"
    selected_dir = target / "selected"
    selected_dir.mkdir(parents=True, exist_ok=True)
    copy_preview_assets(repo, template_dir, selected_dir)

    safe_plan = plan or [{"title": title, "message": title, "visible_content": [title], "role": "hook", "speaker_intent": "Introduce the deck."}]
    total = len(safe_plan)
    sections = [beautiful_slide_section(slide, idx, total, title) for idx, slide in enumerate(safe_plan, 1)]
    document = template_path.read_text(encoding="utf-8", errors="replace")
    deck_doc = inject_deck_sections(document, sections)
    deck_doc = add_selected_deck_controls(deck_doc)
    deck_doc = re.sub(r"<title>[\s\S]*?</title>", f"<title>{html.escape(title)} · {html.escape(selected_template)}</title>", deck_doc, count=1, flags=re.IGNORECASE)

    deck_path = selected_dir / "index.html"
    deck_path.write_text(deck_doc, encoding="utf-8")
    manifest = {
        "version": VERSION,
        "generated_at": now_iso(),
        "repo": str(repo),
        "title": title,
        "selected_template": selected_template,
        "deck": str(deck_path),
        "slide_count": total,
    }
    (target / "selected_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    report = [
        "# Beautiful Render Report",
        "",
        "- status: rendered",
        "- mode: selected-template-full-deck",
        f"- template: {selected_template}",
        f"- output: {deck_path}",
        f"- slides: {total}",
    ]
    (target / "render_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    return {"status": "rendered", "template": selected_template, "deck": str(deck_path), "manifest": str(target / "selected_manifest.json"), "report": str(target / "render_report.md")}


def speaker_script(slide):
    parts = [slide.get("speaker_intent", ""), slide.get("message", "")]
    parts.extend(slide.get("visible_content", [])[:3])
    return "\n".join(str(x) for x in parts if x)


def relative_href(from_dir, target):
    return os.path.relpath(Path(target).resolve(), Path(from_dir).resolve()).replace(os.sep, "/")


def write_presenter_shell(out, title, plan, deck_path=None):
    target = out / "outputs" / "presenter"
    target.mkdir(parents=True, exist_ok=True)
    deck = Path(deck_path).expanduser() if deck_path else None
    deck_exists = bool(deck and deck.exists())
    deck_href = relative_href(target, deck) if deck_exists else ""
    safe_plan = plan or [{"slide_id": "S01", "title": title, "message": title, "speaker_intent": "Introduce the deck."}]
    notes = [
        {
            "slide_id": slide.get("slide_id", f"S{idx:02d}"),
            "title": slide.get("title") or title,
            "message": slide.get("message") or "",
            "script": speaker_script(slide),
        }
        for idx, slide in enumerate(safe_plan, 1)
    ]
    notes_json = json.dumps(notes, ensure_ascii=False)
    deck_panel = (
        f'<iframe id="deckFrame" src="{html.escape(deck_href)}?slide=1" title="Rendered deck preview"></iframe>'
        if deck_exists else
        '<div class="standalone-card"><div class="slide-id" id="stageSlideId"></div><h2 id="stageTitle"></h2><p id="stageMessage"></p></div>'
    )
    doc = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} · Presenter Shell</title><style>
:root{{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--panel2:#0f1724;--line:rgba(255,255,255,.12);--text:#f0f6fc;--muted:#8b949e;--accent:#58a6ff;--hot:#f2cc60}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;height:100vh;overflow:hidden}}
main{{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(360px,.95fr);gap:0;height:100vh}}
.stage{{background:linear-gradient(135deg,#05070b,#111827);display:grid;place-items:center;padding:22px;border-right:1px solid var(--line)}}
iframe{{width:100%;aspect-ratio:16/9;border:0;border-radius:14px;background:#000;box-shadow:0 24px 80px rgba(0,0,0,.5)}}
.standalone-card{{width:min(82vw,900px);aspect-ratio:16/9;border:1px solid var(--line);border-radius:18px;background:radial-gradient(circle at 80% 20%,rgba(88,166,255,.18),transparent 34%),var(--panel);display:flex;flex-direction:column;justify-content:flex-end;padding:44px;box-shadow:0 24px 80px rgba(0,0,0,.45)}}
.slide-id,.kicker{{font:700 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}}h1,h2,p{{margin:0}}h1{{font-size:28px;line-height:1.15}}h2{{font-size:clamp(34px,5vw,74px);line-height:1.02;max-width:12ch}}.standalone-card p{{margin-top:18px;font-size:20px;line-height:1.5;color:var(--muted);max-width:56ch}}
aside{{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:16px;padding:22px;background:var(--panel)}}
.top{{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}}.timer{{font:800 42px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hot)}}
.cards{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}.card{{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--panel2);min-width:0}}.label{{font:700 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}}strong{{font-size:18px;line-height:1.35}}
.script{{overflow:auto;white-space:pre-wrap;font-size:21px;line-height:1.55;border:1px solid var(--line);border-radius:12px;padding:18px;background:#0b1220}}
.outline{{display:grid;gap:6px;max-height:18vh;overflow:auto}}.outline button{{text-align:left;border:0;border-radius:8px;padding:8px 10px;background:transparent;color:var(--muted);cursor:pointer}}.outline button.active{{background:rgba(88,166,255,.14);color:var(--text)}}
.nav{{display:flex;align-items:center;gap:10px;flex-wrap:wrap}}button{{border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:#1f6feb;color:white;font-weight:800;cursor:pointer}}button.secondary{{background:transparent;color:var(--text)}}.hint{{color:var(--muted);font-size:12px;margin-left:auto}}
body.script-mode main{{grid-template-columns:0 1fr}}body.script-mode .stage{{display:none}}body.script-mode aside{{padding:32px 11vw}}body.script-mode .script{{font-size:30px}}
@media(max-width:900px){{main{{grid-template-columns:1fr;grid-template-rows:42vh 58vh}}aside{{border-top:1px solid var(--line)}}.timer{{font-size:30px}}}}
</style></head><body><main><section class="stage">{deck_panel}</section><aside><div class="top"><div><div class="kicker">Humanize PPT · Presenter Shell</div><h1>{html.escape(title)}</h1></div><div class="timer" id="timer">00:00</div></div><div class="cards"><div class="card"><div class="label">CURRENT</div><strong id="current"></strong></div><div class="card"><div class="label">NEXT</div><strong id="next"></strong></div></div><div class="script" id="script"></div><div><div class="outline" id="outline"></div><div class="nav"><button id="prev" class="secondary">←</button><button id="nextBtn">→</button><button id="toggle" class="secondary">S</button><button id="reset" class="secondary">Reset</button><span id="counter"></span><span class="hint">Shortcuts: S / ← / →</span></div></div></aside></main><script>
const notes = {notes_json};
let idx = 0;
let start = Date.now();
const deckFrame = document.getElementById('deckFrame');
function two(n){{ return String(n).padStart(2,'0'); }}
function tick(){{ const s = Math.floor((Date.now() - start) / 1000); document.getElementById('timer').textContent = `${{two(Math.floor(s / 60))}}:${{two(s % 60)}}`; }}
setInterval(tick, 500); tick();
function sendDeck(){{ if(deckFrame && deckFrame.contentWindow) deckFrame.contentWindow.postMessage({{type:'presenter-goto', index:idx}}, '*'); }}
function itemLabel(item){{ return item ? `${{item.slide_id}} · ${{item.title}}` : 'END'; }}
function renderOutline(){{ const root = document.getElementById('outline'); root.innerHTML = ''; notes.forEach((n,i)=>{{ const b=document.createElement('button'); b.textContent=itemLabel(n); b.className=i===idx?'active':''; b.onclick=()=>go(i); root.appendChild(b); }}); }}
function render(){{
  const item = notes[idx] || notes[0];
  const next = notes[idx + 1];
  document.getElementById('current').textContent = itemLabel(item);
  document.getElementById('next').textContent = itemLabel(next);
  document.getElementById('script').textContent = item ? item.script : '';
  document.getElementById('counter').textContent = `${{idx + 1}} / ${{notes.length}}`;
  const sid = document.getElementById('stageSlideId'); if(sid) sid.textContent = item ? item.slide_id : '';
  const st = document.getElementById('stageTitle'); if(st) st.textContent = item ? item.title : '';
  const sm = document.getElementById('stageMessage'); if(sm) sm.textContent = item ? item.message : '';
  renderOutline(); sendDeck();
}}
function go(n){{ idx = Math.max(0, Math.min(notes.length - 1, n)); render(); }}
document.getElementById('prev').onclick = () => go(idx - 1);
document.getElementById('nextBtn').onclick = () => go(idx + 1);
document.getElementById('toggle').onclick = () => document.body.classList.toggle('script-mode');
document.getElementById('reset').onclick = () => {{ start = Date.now(); tick(); }};
document.addEventListener('keydown', e => {{ if(e.key === 'ArrowRight') go(idx + 1); if(e.key === 'ArrowLeft') go(idx - 1); if(e.key.toLowerCase() === 's') document.body.classList.toggle('script-mode'); }});
if(deckFrame) deckFrame.addEventListener('load', sendDeck);
render();
</script></body></html>"""
    presenter_shell = target / "presenter-shell.html"
    presenter_shell.write_text(doc, encoding="utf-8")
    manifest = {
        "version": VERSION,
        "generated_at": now_iso(),
        "title": title,
        "deck": str(deck) if deck_exists else None,
        "presenter_shell": str(presenter_shell),
        "slide_count": len(safe_plan),
        "notes": notes,
        "standalone": not deck_exists,
    }
    (target / "presenter_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (target / "render_report.md").write_text(
        f"# Presenter Shell Report\n\n- status: rendered\n- mode: {'deck-linked' if deck_exists else 'standalone'}\n- presenter_shell: {presenter_shell}\n- slides: {len(safe_plan)}\n",
        encoding="utf-8",
    )
    return {
        "status": "rendered",
        "presenter_shell": str(presenter_shell),
        "manifest": str(target / "presenter_manifest.json"),
        "report": str(target / "render_report.md"),
        "standalone": not deck_exists,
    }


def write_presenter_adapter(out, title, plan, deck_path):
    deck = Path(deck_path).expanduser() if deck_path else None
    if not deck or not deck.exists():
        shell_result = write_presenter_shell(out, title, plan, None)
        shell_result["presenter"] = shell_result["presenter_shell"]
        shell_result["message"] = f"standalone presenter shell rendered without deck: {deck_path}"
        return shell_result

    target = out / "outputs" / "presenter"
    target.mkdir(parents=True, exist_ok=True)
    shell_result = write_presenter_shell(out, title, plan, deck)
    deck_href = relative_href(target, deck)
    safe_plan = plan or [{"slide_id": "S01", "title": title, "message": title, "speaker_intent": "Introduce the deck."}]
    notes = [
        {
            "slide_id": slide.get("slide_id", f"S{idx:02d}"),
            "title": slide.get("title") or title,
            "message": slide.get("message") or "",
            "script": speaker_script(slide),
        }
        for idx, slide in enumerate(safe_plan, 1)
    ]
    notes_json = json.dumps(notes, ensure_ascii=False)
    doc = f"""<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{html.escape(title)} · Presenter</title><style>
body{{margin:0;background:#0f1117;color:#f5efe3;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;height:100vh;overflow:hidden}}
main{{display:grid;grid-template-columns:minmax(0,2fr) minmax(340px,1fr);height:100vh}}
.stage{{background:#050507;display:grid;place-items:center;padding:18px}}
iframe{{width:100%;aspect-ratio:16/9;border:0;border-radius:16px;background:#000;box-shadow:0 20px 80px rgba(0,0,0,.45)}}
aside{{border-left:1px solid rgba(255,255,255,.12);padding:22px;display:grid;grid-template-rows:auto auto 1fr auto;gap:16px;background:#171923}}
.kicker{{letter-spacing:.12em;color:#e5b65b;font-size:12px;text-transform:uppercase}}h1{{margin:.1em 0;font-size:28px}}.cards{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}.card{{border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px;background:rgba(255,255,255,.05)}}.label{{font-size:11px;color:#9aa3b2;letter-spacing:.12em}}#script{{white-space:pre-wrap;font-size:20px;line-height:1.55;overflow:auto}}button{{border:0;border-radius:12px;padding:12px 16px;background:#e5b65b;color:#111;font-weight:700}}.nav{{display:flex;gap:10px;align-items:center}}
</style></head><body><main><section class=\"stage\"><iframe id=\"deck\" src=\"{html.escape(deck_href)}?slide=1\"></iframe></section><aside><div><div class=\"kicker\">Humanize PPT · Presenter Adapter</div><h1>{html.escape(title)}</h1></div><div class=\"cards\"><div class=\"card\"><div class=\"label\">CURRENT</div><strong id=\"current\"></strong></div><div class=\"card\"><div class=\"label\">NEXT</div><strong id=\"next\"></strong></div></div><div class=\"card\"><div class=\"label\">SCRIPT</div><div id=\"script\"></div></div><div class=\"nav\"><button id=\"prev\">← Prev</button><button id=\"nextBtn\">Next →</button><span id=\"counter\"></span></div></aside></main><script>
const notes = {notes_json};
let idx = 0;
const deck = document.getElementById('deck');
const deckBase = deck.getAttribute('src').replace(/\\?.*$/, '');
function deckUrl(index) {{
  return `${{deckBase}}?slide=${{index + 1}}`;
}}
function syncDeck() {{
  if(deck.contentWindow) {{
    deck.contentWindow.postMessage({{type:'presenter-goto', index:idx}}, '*');
    deck.contentWindow.postMessage({{type:'preview-goto', idx}}, '*');
  }}
}}
function render() {{
  const item = notes[idx] || notes[0];
  const next = notes[idx + 1];
  document.getElementById('current').textContent = item ? `${{item.slide_id}} · ${{item.title}}` : '';
  document.getElementById('next').textContent = next ? `${{next.slide_id}} · ${{next.title}}` : 'END';
  document.getElementById('script').textContent = item ? item.script : '';
  document.getElementById('counter').textContent = `${{idx + 1}} / ${{notes.length}}`;
  syncDeck();
}}
function go(next) {{
  idx = Math.max(0, Math.min(notes.length - 1, next));
  const target = deckUrl(idx);
  if(!deck.src.endsWith(`slide=${{idx + 1}}`)) deck.src = target;
  render();
}}
document.getElementById('prev').onclick = () => go(idx - 1);
document.getElementById('nextBtn').onclick = () => go(idx + 1);
document.addEventListener('keydown', e => {{ if (e.key === 'ArrowRight') go(idx + 1); if (e.key === 'ArrowLeft') go(idx - 1); }});
deck.addEventListener('load', syncDeck);
render();
</script></body></html>"""
    presenter = target / "index.html"
    presenter.write_text(doc, encoding="utf-8")
    manifest = {
        "version": VERSION,
        "generated_at": now_iso(),
        "title": title,
        "deck": str(deck),
        "presenter": str(presenter),
        "presenter_shell": shell_result.get("presenter_shell"),
        "slide_count": len(safe_plan),
        "notes": notes,
    }
    (target / "presenter_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (target / "render_report.md").write_text(f"# Presenter Adapter Report\n\n- status: rendered\n- deck: {deck}\n- presenter: {presenter}\n- presenter_shell: {shell_result.get('presenter_shell')}\n- slides: {len(safe_plan)}\n", encoding="utf-8")
    return {"status": "rendered", "presenter": str(presenter), "presenter_shell": shell_result.get("presenter_shell"), "manifest": str(target / "presenter_manifest.json"), "report": str(target / "render_report.md")}


def export_script_text():
    return """#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HTML="${1:-$HERE/package/index.html}"
OUT="${2:-$HERE/deck.pdf}"
python3 - "$HTML" "$OUT" <<'PY'
import asyncio, sys
from pathlib import Path

html_path = Path(sys.argv[1]).resolve()
out_path = Path(sys.argv[2]).resolve()

async def main():
    try:
        from playwright.async_api import async_playwright
    except Exception:
        raise SystemExit("Missing playwright. Run: python3 -m pip install playwright && python3 -m playwright install chromium")
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await page.goto(html_path.as_uri(), wait_until="networkidle")
        await page.pdf(path=str(out_path), width="1920px", height="1080px", print_background=True)
        await browser.close()

asyncio.run(main())
print(out_path)
PY
"""


def write_export_adapter(out, title, deck_path, slide_count):
    deck = Path(deck_path).expanduser() if deck_path else None
    if not deck or not deck.exists():
        return {"status": "missing-deck", "message": f"deck not found: {deck_path}"}

    target = out / "outputs" / "export"
    package = target / "package"
    if package.exists():
        shutil.rmtree(package)
    target.mkdir(parents=True, exist_ok=True)
    shutil.copytree(deck.parent, package)

    script = target / "export_pdf.sh"
    script.write_text(export_script_text(), encoding="utf-8")
    script.chmod(0o755)
    readme = target / "README.md"
    readme.write_text(
        f"""# Export Package

- Source deck: `{deck}`
- Portable HTML: `outputs/export/package/index.html`
- PDF command: `bash outputs/export/export_pdf.sh outputs/export/package/index.html outputs/export/deck.pdf`

Notes:
- PDF export uses Playwright Chromium.
- Animations and keyboard navigation become static PDF pages.
""",
        encoding="utf-8",
    )
    manifest = {
        "version": VERSION,
        "generated_at": now_iso(),
        "title": title,
        "deck": str(deck),
        "package": str(package),
        "html": str(package / "index.html"),
        "export_script": str(script),
        "slide_count": slide_count,
    }
    (target / "export_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (target / "render_report.md").write_text(f"# Export Adapter Report\n\n- status: packaged\n- package: {package}\n- script: {script}\n- slides: {slide_count}\n", encoding="utf-8")
    return {"status": "packaged", "package": str(package), "manifest": str(target / "export_manifest.json"), "script": str(script), "report": str(target / "render_report.md")}


def write_router_plan(out, title, source_path, primary, routes, registry):
    known = renderer_by_id(registry)
    enriched = []
    for route in routes:
        info = known.get(route["id"], {})
        merged = dict(route)
        merged.update(
            {
                "display_name": info.get("display_name", route["id"]),
                "skill_name": info.get("skill_name", route["id"]),
                "expected_inputs": info.get("inputs", []),
                "expected_outputs": info.get("outputs", []),
            }
        )
        enriched.append(merged)
    plan = {
        "version": VERSION,
        "generated_at": now_iso(),
        "title": title,
        "source": str(source_path),
        "primary_renderer": primary,
        "routes": enriched,
    }
    (out / "router_plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    return plan


def command_text(route, out):
    rid = route["id"]
    output_map = {
        "guizang": "guizang-rendered",
        "beautiful-html-templates": "beautiful-rendered",
        "frontend-slides": "frontend-slides-rendered",
        "ppt-master": "ppt-master-rendered",
        "presenter-adapter": "presenter",
        "export-adapter": "export",
    }
    output_dir = f"outputs/{output_map.get(rid, rid)}"
    if rid == "qa":
        output_dir = "outputs/qa"

    # For downstream renderer agents, the primary input is the production
    # prompt that Humanize already wrote — not the raw AST files directly.
    if rid == "guizang":
        preamble = (
            f"You are the downstream rendering agent for this deck.\n"
            f"Your entry point is the production prompt Humanize already wrote:\n"
            f"  {out}/guizang-production-prompt.md\n\n"
            f"Read that file first. It tells you which skill to load, which style/theme\n"
            f"to use, and where to write your output. The AST files below are supporting\n"
            f"context — the production prompt is the authoritative contract.\n"
        )
    elif rid in ("frontend-slides", "beautiful-html-templates", "ppt-master"):
        prompt_file = f"{rid}-production-prompt.md"
        preamble = (
            f"You are the downstream rendering agent for this deck.\n"
            f"Your entry point is the production prompt Humanize already wrote:\n"
            f"  {out}/{prompt_file}\n\n"
            f"Read that file first. The AST files below are supporting context.\n"
        )
    else:
        preamble = (
            f"You are the {route.get('display_name', rid)} specialist agent.\n"
            f"Load skill: {route.get('skill_name', rid)}\n"
        )

    read_list = "\n".join(f"- {name}" for name in route.get("expected_inputs", [])) or "- deck_brief.md\n- slide_plan.json"
    return f"""# {route.get('display_name', rid)} Command

{preamble}
Input directory: {out}

Supporting files:
{read_list}

Task:
{route['purpose']}

Write outputs to:
{out / output_dir}

Do not:
- rewrite the AST goal
- consume raw source unless this command explicitly says so
- change another agent's outputs
- invent missing assets without marking them as generated or placeholder
- put model thinking process or draft notes on visible slides

Return:
- output paths
- renderer/template/style decisions
- known issues
- verification result
"""


def write_commands(out, router_plan):
    commands = out / "commands"
    commands.mkdir(exist_ok=True)
    for route in router_plan["routes"]:
        name = route["command_file"].split("/")[-1]
        (commands / name).write_text(command_text(route, out), encoding="utf-8")


# v0.6.4: Humanize PPT no longer imitates the Guizang renderer.
# It stops at the production brief; guizang-ppt-skill renders natively.
# See references/guizang-production-brief-orchestrator.md for the boundary contract.


# ---------------------------------------------------------------------------
# QA failure mode catalog (Lane C)
# ---------------------------------------------------------------------------
# v0.6.5: install self-check for downstream skills.
# ---------------------------------------------------------------------------

DOWNSTREAM_SKILL_PATHS = {
    "guizang-ppt-skill": [
        Path.home() / ".agents" / "skills" / "guizang-ppt-skill" / "SKILL.md",
        Path.home() / ".hermes" / "skills" / "guizang-ppt-skill" / "SKILL.md",
    ],
    "frontend-slides": [
        Path.home() / ".agents" / "skills" / "frontend-slides" / "SKILL.md",
        Path.home() / ".hermes" / "skills" / "frontend-slides" / "SKILL.md",
    ],
    "beautiful-html-templates": [
        Path.home() / ".agents" / "skills" / "beautiful-html-templates" / "SKILL.md",
        Path.home() / ".hermes" / "skills" / "beautiful-html-templates" / "SKILL.md",
    ],
    "ppt-master": [
        Path.home() / ".agents" / "skills" / "ppt-master" / "SKILL.md",
        Path.home() / ".codex" / "skills" / "ppt-master" / "SKILL.md",
        Path.home() / "projects" / "ppt-master" / "skills" / "ppt-master" / "SKILL.md",
    ],
}


def check_downstream_install(skill_name, skip=False, extra_paths=None):
    """Return (installed: bool, path: Path|None). If not installed and not
    skipped, print a stderr warning with the install command. Never fatal —
    the brief is still written and the next agent is told to install.
    """
    paths = [Path(p).expanduser() for p in (extra_paths or [])]
    paths.extend(DOWNSTREAM_SKILL_PATHS.get(skill_name, []))
    for p in paths:
        if p.exists():
            return True, p
    if not skip:
        sys.stderr.write(
            f"\n[humanize-ppt v{VERSION}] WARNING: {skill_name} not detected at any known path:\n"
            f"  - " + "\n  - ".join(str(p) for p in paths) + "\n"
            f"  The brief still ships, but the next agent must install {skill_name} before rendering.\n"
            f"  Install: see the skill's GitHub README, or use the agent's skill install command.\n"
            f"  To suppress this warning, pass --skip-install-check.\n\n"
        )
    return False, None


# ---------------------------------------------------------------------------
# Single source of truth for the conversational QA loop. The human-readable
# reference is references/qa-failure-modes.md; ids must match exactly.

REGISTERED_SWISS_LAYOUTS = {f"S{n:02d}" for n in range(1, 23)}  # S01..S22

FAILURE_MODES = {
    "placeholder-residue": {
        # v0.8.0: renderer-agnostic. "any" means the rule applies to every
        # renderer the presentation checkup (演讲体检) is pointed at, not just
        # guizang. The audience symptom is the same everywhere: visible
        # lorem/TODO/[必填] text on a live slide.
        "scope": ["any"],
        "severity_default": "fail",
        "description": "Template placeholders like [必填], SLIDES_HERE, lorem ipsum, TODO, or TBD leaked into the rendered HTML.",
        "check": "check_placeholder_residue",
    },
    "low-power-default": {
        "scope": ["guizang"],
        "severity_default": "fail",
        "description": "body.low-power is active by default, suppressing animation.",
        "check": "check_low_power_default",
    },
    "webgl-canvas-missing": {
        "scope": ["guizang-style-a"],
        "severity_default": "fail",
        "description": "Dual WebGL canvas (canvas#bg-dark and canvas#bg-light) is absent.",
        "check": "check_webgl_canvas_missing",
    },
    "data-anim-thin": {
        "scope": ["guizang-style-a"],
        "severity_default": "fail",
        "description": "data-anim / data-animate markers are too few to drive a watchable deck.",
        "check": "check_data_anim_thin",
    },
    "swiss-sxx-count-mismatch": {
        "scope": ["guizang-style-b"],
        "severity_default": "fail",
        "description": "data-layout=Sxx marker count does not match slide_plan.json slide count.",
        "check": "check_swiss_sxx_count_mismatch",
    },
    "swiss-sxx-invented-id": {
        "scope": ["guizang-style-b"],
        "severity_default": "fail",
        "description": "A data-layout=Sxx value is not in the registered S01..S22 set.",
        "check": "check_swiss_sxx_invented_id",
    },
    "swiss-low-diversity": {
        "scope": ["guizang-style-b"],
        "severity_default": "warn",
        "description": "Fewer than 60% unique Sxx values for the deck length.",
        "check": "check_swiss_low_diversity",
    },
    "english-horizontal-overflow": {
        "scope": ["frontend-slides", "beautiful-html-templates"],
        "severity_default": "fail",
        "description": "English renderer output opts into horizontal scrolling or over-wide viewport units.",
        "check": "check_english_horizontal_overflow",
    },
    "english-low-contrast": {
        "scope": ["frontend-slides", "beautiful-html-templates"],
        "severity_default": "fail",
        "description": "An English slide rule sets foreground and background colors with insufficient contrast.",
        "check": "check_english_low_contrast",
    },
    "english-hyphenation-noise": {
        "scope": ["frontend-slides", "beautiful-html-templates"],
        "severity_default": "warn",
        "description": "English renderer output uses noisy forced hyphenation or break-all wrapping.",
        "check": "check_english_hyphenation_noise",
    },
    "english-font-contract-missing": {
        "scope": ["frontend-slides", "beautiful-html-templates"],
        "severity_default": "fail",
        "description": "English renderer output lacks a distinctive font contract and risks falling back to system serif/sans.",
        "check": "check_english_font_contract_missing",
    },
    "english-image-alt-missing": {
        "scope": ["frontend-slides", "beautiful-html-templates"],
        "severity_default": "fail",
        "description": "Rendered English deck contains image tags with missing or empty alt text.",
        "check": "check_english_image_alt_missing",
    },
    "pptx-package-invalid": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "The PPTX is not a readable OOXML package or required package parts are missing.",
        "artifact": "pptx",
    },
    "pptx-slide-count-mismatch": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "The native PPTX slide count differs from Humanize slide_plan.json.",
        "artifact": "pptx",
    },
    "pptx-placeholder-residue": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "Template or draft placeholders remain in native slide text.",
        "artifact": "pptx",
    },
    "pptx-slide-empty": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "A native slide contains no editable visible text.",
        "artifact": "pptx",
    },
    "pptx-flattened-slide": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "A slide contains no editable shape, group, table, or chart object.",
        "artifact": "pptx",
    },
    "pptx-missing-speaker-notes": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "Speaker notes are absent for one or more Humanize-planned pages.",
        "artifact": "pptx",
    },
    "pptx-speaker-intent-drift": {
        "scope": ["ppt-master"],
        "severity_default": "warn",
        "description": "Native speaker notes have weak overlap with Humanize speaker_intent.",
        "artifact": "pptx",
    },
    "pptx-ast-content-drift": {
        "scope": ["ppt-master"],
        "severity_default": "warn",
        "description": "Native slide text has weak overlap with the corresponding Humanize AST page.",
        "artifact": "pptx",
    },
    "pptx-broken-relationship": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "A slide relationship points to a missing or invalid OOXML part.",
        "artifact": "pptx",
    },
    "pptx-transition-missing": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "A requested native slide transition is missing.",
        "artifact": "pptx",
    },
    "pptx-native-object-missing": {
        "scope": ["ppt-master"],
        "severity_default": "fail",
        "description": "A table page requested as a native object was flattened or omitted.",
        "artifact": "pptx",
    },
}


def _finding(check_id, severity, evidence, pages=None):
    return {
        "id": check_id,
        "severity": severity,
        "evidence": evidence,
        "pages": pages or [],
    }


def check_placeholder_residue(html, plan, ctx):
    findings = []
    if "[必填]" in html:
        findings.append(_finding(
            "placeholder-residue", "fail",
            "Rendered HTML still contains [必填] template residue.",
        ))
    if "SLIDES_HERE" in html:
        findings.append(_finding(
            "placeholder-residue", "fail",
            "Rendered HTML still contains SLIDES_HERE marker.",
        ))
    # v0.8.0: renderer-agnostic residue markers. What the audience would
    # see: literal "lorem ipsum" / "TODO" / "TBD" text on a live slide.
    generic_markers = [
        (r"lorem\s+ipsum", "lorem ipsum filler text"),
        (r"\bTODO\b", "a TODO marker"),
        (r"\bTBD\b", "a TBD marker"),
    ]
    for pattern, label in generic_markers:
        if re.search(pattern, html, flags=re.IGNORECASE if "lorem" in pattern else 0):
            findings.append(_finding(
                "placeholder-residue", "fail",
                f"Rendered HTML still contains {label}.",
            ))
    return findings


def check_low_power_default(html, plan, ctx):
    findings = []
    body_match = re.search(r"<body\b[^>]*class=[\"']([^\"']*)[\"']", html, flags=re.IGNORECASE)
    if body_match and "low-power" in (body_match.group(1) or "").split():
        findings.append(_finding(
            "low-power-default", "fail",
            f"body has class='{body_match.group(1)}'; low-power must not be a default.",
        ))
    return findings


def check_webgl_canvas_missing(html, plan, ctx):
    findings = []
    missing = []
    if 'id="bg-dark"' not in html and "id='bg-dark'" not in html:
        missing.append("canvas#bg-dark")
    if 'id="bg-light"' not in html and "id='bg-light'" not in html:
        missing.append("canvas#bg-light")
    if missing:
        findings.append(_finding(
            "webgl-canvas-missing", "fail",
            f"Style A requires {', '.join(missing)} for the WebGL hero background.",
        ))
    return findings


def check_data_anim_thin(html, plan, ctx):
    findings = []
    count = len(re.findall(r"\bdata-anim(?:ate)?\b", html))
    if count < 3:
        findings.append(_finding(
            "data-anim-thin", "fail",
            f"Only {count} data-anim/data-animate markers. Need at least 3 (Ink Classic has 86).",
        ))
    elif count < 10:
        findings.append(_finding(
            "data-anim-thin", "warn",
            f"Only {count} data-anim markers. Soft warning; Ink Classic has 86.",
        ))
    return findings


def check_swiss_sxx_count_mismatch(html, plan, ctx):
    findings = []
    markers = re.findall(r'data-layout=[\"\'](S\d{2})[\"\']', html)
    expected = len(plan)
    if len(markers) != expected:
        findings.append(_finding(
            "swiss-sxx-count-mismatch", "fail",
            f"Found {len(markers)} data-layout=Sxx markers; slide_plan has {expected} slides.",
        ))
    return findings


def check_swiss_sxx_invented_id(html, plan, ctx):
    findings = []
    markers = re.findall(r'data-layout=[\"\'](S\d{2})[\"\']', html)
    invented = sorted({m for m in markers if m not in REGISTERED_SWISS_LAYOUTS})
    if invented:
        findings.append(_finding(
            "swiss-sxx-invented-id", "fail",
            f"Invented non-registered Sxx values: {', '.join(invented)}. Registered set is S01..S22.",
            pages=[],
        ))
    return findings


def check_swiss_low_diversity(html, plan, ctx):
    findings = []
    markers = re.findall(r'data-layout=[\"\'](S\d{2})[\"\']', html)
    if not markers:
        return findings
    unique = len(set(markers))
    expected = len(plan)
    floor = max(3, int(expected * 0.6))
    if unique < 3:
        findings.append(_finding(
            "swiss-low-diversity", "fail",
            f"Only {unique} unique Sxx values; minimum is 3.",
        ))
    elif unique < floor:
        findings.append(_finding(
            "swiss-low-diversity", "warn",
            f"Only {unique} unique Sxx values; soft floor is {floor} (60% of {expected} slides).",
        ))
    return findings


def _strip_css_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)


def _hex_to_rgb(value):
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        return None
    try:
        return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None


def _rel_luminance(rgb):
    def channel(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast_ratio(fg, bg):
    l1 = _rel_luminance(fg)
    l2 = _rel_luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def _css_rules(html):
    css = "\n".join(re.findall(r"<style\b[^>]*>(.*?)</style>", html, flags=re.DOTALL | re.IGNORECASE))
    css = _strip_css_comments(css)
    return re.findall(r"([^{}]+)\{([^{}]+)\}", css)


def _decl_value(decls, prop):
    m = re.search(rf"(?:^|;)\s*{re.escape(prop)}\s*:\s*([^;]+)", decls, flags=re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _first_hex(value):
    m = re.search(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b", value or "")
    return m.group(0) if m else None


def check_english_horizontal_overflow(html, plan, ctx):
    findings = []
    css = _strip_css_comments("\n".join(re.findall(r"<style\b[^>]*>(.*?)</style>", html, flags=re.DOTALL | re.IGNORECASE)))
    compact = re.sub(r"\s+", " ", css)
    if re.search(r"overflow-x\s*:\s*(auto|scroll|visible)\b", compact, flags=re.IGNORECASE):
        findings.append(_finding(
            "english-horizontal-overflow", "fail",
            "CSS enables horizontal overflow via overflow-x:auto/scroll/visible; English decks must lock or fit the viewport.",
        ))
    for prop, value in re.findall(r"\b(width|min-width)\s*:\s*([0-9.]+)vw\b", compact, flags=re.IGNORECASE):
        if float(value) > 100:
            findings.append(_finding(
                "english-horizontal-overflow", "fail",
                f"CSS sets {prop}:{value}vw, which can create horizontal scroll.",
            ))
            break
    return findings


def check_english_low_contrast(html, plan, ctx):
    findings = []
    for selector, decls in _css_rules(html):
        fg_hex = _first_hex(_decl_value(decls, "color"))
        bg_hex = _first_hex(_decl_value(decls, "background-color") or _decl_value(decls, "background"))
        if not fg_hex or not bg_hex:
            continue
        fg = _hex_to_rgb(fg_hex)
        bg = _hex_to_rgb(bg_hex)
        if not fg or not bg:
            continue
        ratio = _contrast_ratio(fg, bg)
        if ratio < 3.0:
            clean_selector = " ".join(selector.split())[:80]
            findings.append(_finding(
                "english-low-contrast", "fail",
                f"Rule `{clean_selector}` has contrast ratio {ratio:.2f}:1 ({fg_hex} on {bg_hex}); minimum is 3.0:1 for slide text.",
            ))
            break
    return findings


def check_english_hyphenation_noise(html, plan, ctx):
    findings = []
    css = _strip_css_comments("\n".join(re.findall(r"<style\b[^>]*>(.*?)</style>", html, flags=re.DOTALL | re.IGNORECASE)))
    noisy = []
    if re.search(r"\bhyphens\s*:\s*auto\b", css, flags=re.IGNORECASE):
        noisy.append("hyphens:auto")
    if re.search(r"\bword-break\s*:\s*break-all\b", css, flags=re.IGNORECASE):
        noisy.append("word-break:break-all")
    if re.search(r"\boverflow-wrap\s*:\s*anywhere\b", css, flags=re.IGNORECASE):
        noisy.append("overflow-wrap:anywhere")
    if noisy:
        findings.append(_finding(
            "english-hyphenation-noise", "warn",
            "Noisy English wrapping detected: " + ", ".join(noisy) + ". Prefer balanced manual line breaks or overflow-wrap:break-word for long technical terms.",
        ))
    return findings


def check_english_font_contract_missing(html, plan, ctx):
    findings = []
    has_font_source = bool(re.search(r"fonts\.googleapis\.com|@font-face", html, flags=re.IGNORECASE))
    families = re.findall(r"font-family\s*:\s*([^;}{]+)", html, flags=re.IGNORECASE)
    joined = " ".join(families)
    distinctive = re.search(
        r"JetBrains|Space\s+Grotesk|Noto|IBM\s+Plex|Playfair|Source\s+Serif|Inter|Roboto|Manrope|Montserrat|Poppins|Satoshi",
        joined,
        flags=re.IGNORECASE,
    )
    if not has_font_source and not distinctive:
        findings.append(_finding(
            "english-font-contract-missing", "fail",
            "No web font/@font-face or distinctive font-family contract found; output may fall back to generic system serif/sans.",
        ))
    return findings


def check_english_image_alt_missing(html, plan, ctx):
    findings = []
    bad = []
    for i, tag in enumerate(re.findall(r"<img\b[^>]*>", html, flags=re.IGNORECASE), 1):
        alt = re.search(r"\balt\s*=\s*([\"'])(.*?)\1", tag, flags=re.IGNORECASE | re.DOTALL)
        if not alt or not alt.group(2).strip():
            bad.append(f"img#{i}")
    if bad:
        findings.append(_finding(
            "english-image-alt-missing", "fail",
            "Image tags missing non-empty alt text: " + ", ".join(bad) + ".",
        ))
    return findings


_CHECK_FUNCTIONS = {
    "check_placeholder_residue": check_placeholder_residue,
    "check_low_power_default": check_low_power_default,
    "check_webgl_canvas_missing": check_webgl_canvas_missing,
    "check_data_anim_thin": check_data_anim_thin,
    "check_swiss_sxx_count_mismatch": check_swiss_sxx_count_mismatch,
    "check_swiss_sxx_invented_id": check_swiss_sxx_invented_id,
    "check_swiss_low_diversity": check_swiss_low_diversity,
    "check_english_horizontal_overflow": check_english_horizontal_overflow,
    "check_english_low_contrast": check_english_low_contrast,
    "check_english_hyphenation_noise": check_english_hyphenation_noise,
    "check_english_font_contract_missing": check_english_font_contract_missing,
    "check_english_image_alt_missing": check_english_image_alt_missing,
}


def failure_modes_for(renderer, style=None):
    """Return the failure modes that apply to (renderer, style).

    Scope "any" is renderer-agnostic (v0.8.0): the mode runs no matter
    which downstream renderer produced the HTML.
    """
    target = renderer if not style else f"{renderer}-style-{style.lower()}"
    out = {}
    for mode_id, meta in FAILURE_MODES.items():
        if "any" in meta["scope"] or target in meta["scope"] or renderer in meta["scope"]:
            out[mode_id] = meta
    return out


def run_checks(html, plan, modes):
    """Run each mode's check and return a list of findings."""
    ctx = {"html_len": len(html), "slide_count": len(plan)}
    findings = []
    for mode_id, meta in modes.items():
        fn = _CHECK_FUNCTIONS.get(meta["check"])
        if not fn:
            continue
        for f in fn(html, plan, ctx):
            findings.append(f)
    return findings


# ---------------------------------------------------------------------------
# QA iteration files
# ---------------------------------------------------------------------------


def _qa_dir(out):
    d = out / "outputs" / "qa"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _read_iteration(out):
    p = _qa_dir(out) / "qa_iteration.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return None


def _write_iteration(out, data):
    p = _qa_dir(out) / "qa_iteration.json"
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_qa_report(out, iteration, findings, status, max_iterations):
    qa = _qa_dir(out)
    fail_count = sum(1 for f in findings if f["severity"] == "fail")
    warn_count = sum(1 for f in findings if f["severity"] == "warn")
    lines = [
        "# QA Report",
        "",
        f"- iteration: {iteration} / {max_iterations}",
        f"- status: {status}",
        f"- fail: {fail_count}",
        f"- warn: {warn_count}",
        "",
        "## Findings",
        "",
    ]
    if not findings:
        lines.append("No findings. Deck is clean.")
    else:
        for f in findings:
            lines.append(f"### `{f['id']}` — {f['severity']}")
            lines.append("")
            lines.append(f"- evidence: {f['evidence']}")
            if f.get("pages"):
                lines.append(f"- pages: {', '.join(f['pages'])}")
            lines.append("")
    (qa / "qa_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_fix_prompt(out, iteration, unresolved, rendered_path, style, renderer="guizang", artifact_kind="html"):
    qa = _qa_dir(out)
    if not unresolved:
        (qa / "fix_prompt.md").write_text(
            "# Fix Prompt\n\nNo open findings. Convergence reached.\n",
            encoding="utf-8",
        )
        return
    lines = [
        "# Fix Prompt",
        "",
        f"> Round {iteration}. Apply the following to the rendered {artifact_kind.upper()}",
        f"> at `{rendered_path}` via the downstream skill's native re-render.",
        f"> Do not post-process in Humanize.",
        "",
        "## Style",
        f"- renderer: {renderer}",
        f"- style: {style}",
        "",
        "## Fix instructions (one per finding)",
        "",
    ]
    fix_specs = {
        "placeholder-residue": "Remove all placeholder residue from live slides: substitute [必填] placeholders, remove the <!-- SLIDES_HERE --> marker, and replace any lorem ipsum / TODO / TBD filler with finished content. The downstream skill's own substitution pass must run end-to-end.",
        "low-power-default": "Remove `low-power` from the body class. Animation must play on first load.",
        "webgl-canvas-missing": "Add both `canvas#bg-dark` and `canvas#bg-light` so the Style A WebGL hero background can render.",
        "data-anim-thin": "Add more `data-anim` / `data-animate` markers across non-cover pages. Aim for 10+ (Ink Classic has 86).",
        "swiss-sxx-count-mismatch": "Make the number of `data-layout=\"Sxx\"` markers equal to the slide count in slide_plan.json. Re-emit from the downstream skill.",
        "swiss-sxx-invented-id": "Replace the invented Sxx values with registered S01..S22 layout IDs from `references/layouts-swiss.md`.",
        "swiss-low-diversity": "Diversify the Swiss layouts. Pick a different registered Sxx per slide where possible. Floor is 60% unique values.",
        "pptx-package-invalid": "Return to PPT Master's owning project, fix the broken export inputs, then rerun its canonical export command. Do not repair the OOXML zip by hand.",
        "pptx-slide-count-mismatch": "Make the PPT Master project page roster match `slide_plan.json`, regenerate the affected SVG/fill plan, and export again.",
        "pptx-placeholder-residue": "Replace all template and draft placeholders in PPT Master's author source (`svg_output/` or `fill_plan.json`), then rerun the native export.",
        "pptx-slide-empty": "Restore the Humanize page message as editable text in PPT Master's author source and export again.",
        "pptx-flattened-slide": "Regenerate the page through PPT Master's native SVG-to-PPTX or template-fill route so it contains editable DrawingML objects instead of a flat slide image.",
        "pptx-missing-speaker-notes": "Map every page in `speaker_intent.md` to PPT Master's `notes/total.md` or template-fill `slides[].notes`, then re-export with notes enabled.",
        "pptx-speaker-intent-drift": "Revise the PPT Master notes source so the Humanize speaker intent remains explicit for each flagged page.",
        "pptx-ast-content-drift": "Compare the flagged page with `slide_plan.json`; restore the intended message/state transfer while keeping PPT Master in control of layout.",
        "pptx-broken-relationship": "Regenerate the PPTX from the owning PPT Master project so all media, notes, chart, and slide relationships are packaged by its exporter.",
        "pptx-transition-missing": "Re-export from PPT Master with the requested `-t` transition flag; do not patch transitions in Humanize.",
        "pptx-native-object-missing": "Add the required data-pptx-native table/chart marker in PPT Master's SVG author source and re-export with `--native-objects`.",
    }
    for f in unresolved:
        spec = fix_specs.get(f["id"], f["evidence"])
        lines.append(f"### `{f['id']}` ({f['severity']})")
        lines.append("")
        lines.append(f"- evidence: {f['evidence']}")
        if f.get("pages"):
            lines.append(f"- pages: {', '.join(f['pages'])}")
        lines.append(f"- fix: {spec}")
        lines.append("")
    (qa / "fix_prompt.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_qa_mode(args):
    """Post-render QA loop. Reads rendered HTML or native PPTX,
    scans for failure modes,
    writes qa_report.md and fix_prompt.md, tracks iteration.
    """
    rendered = Path(args.qa_from).expanduser().resolve()
    if not rendered.exists():
        sys.stderr.write(f"--qa-from path not found: {rendered}\n")
        return 2

    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    artifact_kind = "pptx" if rendered.suffix.lower() == ".pptx" else "html"
    if artifact_kind == "pptx":
        renderer = args.renderer if args.renderer != "auto" else "ppt-master"
        if renderer != "ppt-master":
            sys.stderr.write("PPTX QA requires --renderer ppt-master (or --renderer auto).\n")
            return 2
        style = "native-pptx"
    else:
        renderer = args.renderer if args.renderer != "auto" else "guizang"
        style = (getattr(args, "guizang_style", None) or "A").upper()
    max_iter = max(1, int(getattr(args, "max_qa_iterations", 3) or 3))

    plan_path = out / "slide_plan.json"
    plan = []
    if plan_path.exists():
        try:
            plan = json.loads(plan_path.read_text(encoding="utf-8"))
        except Exception:
            plan = []

    prev = _read_iteration(out)
    iteration = (prev["iteration"] + 1) if prev else 1

    if prev and prev.get("status") == "needs-human":
        # Cap already reached last round. Don't re-loop.
        sys.stderr.write(
            f"qa loop already at needs-human (round {prev['iteration']}). "
            f"Re-render via the downstream skill, then run --qa-from again.\n"
        )
        return 0

    if iteration > max_iter:
        # Should not normally hit here because we set needs-human on the
        # last real round, but guard anyway.
        _write_iteration(out, {
            "iteration": iteration,
            "status": "needs-human",
            "max_iterations": max_iter,
            "renderer": renderer,
            "style": style,
            "unresolved": [],
            "history": (prev or {}).get("history", []),
        })
        sys.stderr.write(f"qa cap reached ({max_iter} rounds). Status: needs-human.\n")
        return 0

    modes = failure_modes_for(renderer, style=style)
    if artifact_kind == "pptx":
        inspection = inspect_pptx(
            rendered,
            plan,
            require_notes=True,
            require_transition=getattr(args, "ppt_master_transition", "fade") != "none",
            require_native_objects=bool(getattr(args, "ppt_master_native_objects", False)),
            allowed_ids=set(modes),
        )
        findings = inspection["findings"]
    else:
        html_text = rendered.read_text(encoding="utf-8", errors="replace")
        findings = run_checks(html_text, plan, modes)
    fail_findings = [f for f in findings if f["severity"] == "fail"]
    warn_findings = [f for f in findings if f["severity"] == "warn"]

    resolved = []
    unresolved_failures = list(fail_findings)
    if prev:
        prev_unresolved_ids = {f["id"] for f in prev.get("unresolved", [])}
        resolved = [fid for fid in prev_unresolved_ids if fid not in {f["id"] for f in fail_findings}]
        # If the previous round had un-resolved failures, those carry forward
        # even if the new check doesn't re-trigger them — treat them as
        # still-open.
        carry_over = [f for f in prev.get("unresolved", []) if f["id"] in {f["id"] for f in fail_findings}]
        unresolved_failures = carry_over + [f for f in fail_findings if f not in carry_over]

    converged = not unresolved_failures
    is_last = iteration >= max_iter
    if converged:
        status = "pass"
    elif is_last:
        status = "needs-human"
    else:
        status = "iterate"

    _write_qa_report(out, iteration, findings, status, max_iter)
    _write_fix_prompt(
        out,
        iteration,
        unresolved_failures,
        rendered,
        style,
        renderer=renderer,
        artifact_kind=artifact_kind,
    )

    history = list((prev or {}).get("history", []))
    history.append({
        "iteration": iteration,
        "status": status,
        "fail_count": len(fail_findings),
        "warn_count": len(warn_findings),
        "unresolved_ids": sorted({f["id"] for f in unresolved_failures}),
        "resolved_ids": sorted(resolved),
    })
    _write_iteration(out, {
        "iteration": iteration,
        "status": status,
        "max_iterations": max_iter,
        "renderer": renderer,
        "style": style,
        "artifact_kind": artifact_kind,
        "unresolved": unresolved_failures,
        "history": history,
    })

    print(json.dumps(
        {
            "iteration": iteration,
            "max_iterations": max_iter,
            "status": status,
            "artifact_kind": artifact_kind,
            "fail": len(fail_findings),
            "warn": len(warn_findings),
            "qa_report": str(out / "outputs" / "qa" / "qa_report.md"),
            "fix_prompt": str(out / "outputs" / "qa" / "fix_prompt.md"),
            "iteration_file": str(out / "outputs" / "qa" / "qa_iteration.json"),
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


def _format_per_page_media_block(plan):
    """v0.6.7: shared per-page media section for all 3 brief writers.

    Lists the per-page media decision (kind + duration) and surfaces
    the machine-actionable fields (asset_path + prompt_hint) for any
    media slot with `needed: true`. The downstream media subagent
    reads this section to find the target file paths and the
    image / video / SVG-generation prompts. Without asset_path a slot
    is a label, not a task (v0.6.5 gap).
    """
    media_lines = []
    for p in plan:
        slide_id = p.get("slide_id", "")
        media = p.get("media") or {}
        image = media.get("image") or {}
        diagram = media.get("diagram") or {}
        video = media.get("video") or {}
        bits = []
        if image.get("needed"):
            bits.append(f"image={image.get('kind', 'unspecified')}")
        if diagram.get("needed"):
            bits.append(f"diagram={diagram.get('kind', 'svg-html')}")
        if video.get("needed"):
            bits.append(f"video={video.get('kind', 'remotion-clip')} ({video.get('duration_s', '?')}s)")
        if not bits:
            bits.append("no media")
        media_lines.append(f"- {slide_id} {p.get('title', '')} — {', '.join(bits)}")
        for key in ("image", "diagram", "video"):
            entry = media.get(key) or {}
            if entry.get("needed") and entry.get("asset_path"):
                media_lines.append(f"  - {key}.asset_path: `{entry['asset_path']}`")
                if entry.get("prompt_hint"):
                    media_lines.append(f"  - {key}.prompt_hint: {entry['prompt_hint']}")
    return "\n".join(media_lines) if media_lines else "- (no slide-level media decisions in this plan)"


def _media_production_guidance(language="zh"):
    """v0.9: tell the downstream media subagent which generator to call for
    each media kind. The slide_plan already carries asset_path + prompt_hint
    per slot (machine-actionable). This block maps each `kind` to a concrete
    skill so the subagent can execute, not guess. Generators are hot-pluggable
    recommendations, not a lock-in.
    """
    return """\
## Media production (visual enhancement)

Each media slot above ships `asset_path` (where to write) and `prompt_hint`
(what to generate). Produce the asset, then reference it from the rendered
slide. Recommended generators (hot-pluggable — swap for any equivalent skill):

- **image** (`gpt-photo`): preferred — `baoyu-image-gen` driving the local
  Codex CLI (`--provider codex-cli`, uses the logged-in Codex/ChatGPT
  subscription, no `OPENAI_API_KEY` needed). Alternatives: `imagegen` /
  `imagen` / `nanobanana-ppt` (these need their own API key). Feed
  `prompt_hint`, honor `aspect_ratio` and `max_size_kb`, write to `asset_path`.
  Use synthesized images for atmospheric / conceptual / hero visuals; keep
  precise-text or data figures as deterministic SVG (image models garble
  exact labels and numbers).
- **image** (`screenshot`): capture the real UI / result; do not synthesize.
- **diagram** (`svg-html` / `html-table`): render as deterministic inline SVG
  or HTML from `prompt_hint`. No external call, no text overflow. This is the
  right choice for data, metrics, process steps, and any precise-label figure.
- **video** (`remotion-clip`): default to `remotion-video-production` (it
  orchestrates the pipeline) paired with `remotion-best-practices` (avoids
  unstable Remotion patterns — misused CSS/Tailwind animation, wrong asset
  paths); add `remotion-video-toolkit` only for complex work (captions,
  charts, 3D, batch templates). Build a deterministic loop of `duration_s`
  seconds (no narration), render to `asset_path` (mp4).
- **video** (`hyperframes`): use the HyperFrames pipeline for the clip.

Rule: an asset slot with `asset_path` is an executable task. A slot without
one is a label only — do not invent paths. Humanize decides *what* and
*where* (the per-page media plan); the downstream skill produces the file and
renders the deck. Humanize orchestrates the presentation; it does not own the
template that paints the final slide.
"""


def write_guizang_production_brief(out, title, plan, source, language, style="A", theme=None, accent=None):
    """Write only the Guizang production brief. No HTML is produced here.

    The next agent must read `guizang-ppt-skill/SKILL.md` and render natively.
    Humanize never opens the Guizang template, never injects sections, and
    never post-processes the rendered HTML.
    """
    style = (style or "A").upper()
    if style not in {"A", "B"}:
        style = "A"

    # v0.6.5: 9 combinations = Style A (5 fixed themes) + Style B (4 accent colors).
    # Style A themes cannot be customized — pick from the 5 presets.
    # Style B accents are single-color overlays on the Swiss template.
    style_a_themes = {
        "ink-classic":      "Ink Classic (墨水经典) — the verified known-good baseline at examples/03-codex-guizang-native-ink-classic/",
        "indigo-porcelain": "Indigo Porcelain (靛蓝瓷) — blue-grey porcelain palette",
        "forest-ink":       "Forest Ink (森林墨) — green-on-cream palette",
        "kraft-paper":      "Kraft Paper (牛皮纸) — warm brown paper palette",
        "dune":             "Dune (沙丘) — sand-and-shadow palette",
    }
    style_b_accents = {
        "ikb":             "Klein Blue (IKB) — International Klein Blue, the most-cited Swiss reference",
        "lemon-yellow":    "Lemon Yellow — high-contrast pop accent on Swiss grid",
        "lemon-green":     "Lemon Green — fresh accent for tech/data topics",
        "safety-orange":   "Safety Orange — warning-construction energy, for tension / call-to-action slides",
    }

    if style == "A":
        theme_key = (theme or "ink-classic").lower()
        if theme_key not in style_a_themes:
            theme_key = "ink-classic"
        style_table = {
            "template": "assets/template.html",
            "layouts": "references/layouts.md",
            "themes": "references/themes.md",
            "theme_preset": theme_key,
            "theme_label": style_a_themes[theme_key],
            "validator": "guizang's own Style A visual QA checklist (see references/guizang-material-qa.md)",
            "lock": "(none — Style A is the flexible track)",
        }
    else:
        accent_key = (accent or "ikb").lower()
        if accent_key not in style_b_accents:
            accent_key = "ikb"
        style_table = {
            "template": "assets/template-swiss.html",
            "layouts": "references/layouts-swiss.md",
            "themes": "references/themes-swiss.md",
            "accent": accent_key,
            "accent_label": style_b_accents[accent_key],
            "validator": "scripts/validate-swiss-deck.mjs",
            "lock": "references/swiss-layout-lock.md",
        }

    inputs_block = "\n".join(
        f"- `{name}`"
        for name in [
            "deck_brief.md",
            "ast_outline.md",
            "slide_plan.json",
            "speaker_intent.md",
            "asset_manifest.md",
            "video_slots.json",
            "style_brief.md",
        ]
    )

    media_block = _format_per_page_media_block(plan)
    media_guidance = _media_production_guidance(language)

    style_a_qa = """\
- no `[必填]` template residue
- no `<!-- SLIDES_HERE -->` marker residue
- `canvas#bg-dark` exists
- `canvas#bg-light` exists
- `body.low-power` is not active by default
- `.slide.hero.light,.slide.hero.dark { background: transparent }` is applied so the WebGL hero canvas is visible
- meaningful `data-anim` / `data-animate` markers are present
- at least 3 `data-anim` occurrences per non-cover page (Ink Classic checkpoint has 86)"""

    style_b_qa = """\
- `scripts/validate-swiss-deck.mjs` exits with code 0
- every slide has a registered `data-layout="Sxx"` marker
- `data-layout` count equals slide count
- at least 6 unique Swiss layouts for a 7-8 page deck (higher for longer decks)
- no invented, non-registered layout IDs
- no inserted SVG/image/video frame clips, overlaps, or hugs the slide edge
- inserted materials do not repeat the slide title"""

    prompt = f"""# Guizang Production Prompt

> Humanize PPT stops here. The next agent must follow
> `~/.agents/skills/guizang-ppt-skill/SKILL.md` end to end.
> Do not reimplement Guizang inside Humanize. Do not import the
> Guizang template into Humanize. Do not post-process the rendered HTML
> with Humanize-owned bridges — Guizang owns its own navigation.

## Deck

- Title: {title}
- Source: {source}
- Language: {language}
- Style: {style}
{('- Theme preset: ' + style_table.get('theme_preset', '') + ' (' + style_table.get('theme_label', '') + ')') if style == 'A' else ''}
{('- Accent color: ' + style_table.get('accent', '') + ' (' + style_table.get('accent_label', '') + ')') if style == 'B' else ''}
- Slides: {len(plan)}

## Style files (use the ones for Style {style})

- template: `{style_table['template']}`
- layouts: `{style_table['layouts']}`
- themes: `{style_table['themes']}`
- lock: {style_table['lock']}
- validator: `{style_table['validator']}`
{("- Apply theme preset: `" + style_table.get('theme_preset', '') + "` from references/themes.md") if style == 'A' else ''}
{("- Apply accent color: `" + style_table.get('accent', '') + "` from references/themes-swiss.md") if style == 'B' else ''}

## Hard rules

- Read `guizang-ppt-skill/SKILL.md` before any rendering. Do not skip it.
- Pick every page's layout from the registered set in
  `{style_table['layouts']}`. Do not invent layout classes.
- Preserve Guizang's animation hooks (`data-anim` / `data-animate`),
  Motion One loading, and the WebGL dual canvas where Style A applies.
- This prompt requires `guizang-ppt-skill` to be installed at
  `~/.agents/skills/guizang-ppt-skill/`. If it is not, the next agent
  must install it before rendering. The brief still ships.
- Run the validator above before reporting complete.
- Do not modify or post-process the rendered HTML in Humanize.
- The HTML that ends up on disk is produced by `guizang-ppt-skill`,
  not by Humanize.

## Inputs already produced by Humanize

{inputs_block}

## Per-page media decisions (Humanize-owned)

{media_block}

{media_guidance}
## Known-good checkpoint (read-only reference)

- `examples/03-codex-guizang-native-ink-classic/index.html`
  (Style A, Ink Classic, 10 slides, hero WebGL background, 86 `data-anim`
  occurrences). Open it to see the bar for Style A quality.

## Style {style} QA gates (must all pass)

{style_a_qa if style == 'A' else style_b_qa}

## Hand-off

The next agent writes its output to its own convention
(e.g. `outputs/guizang-rendered/index.html`). Do not write to
`outputs/guizang/` — that is reserved for legacy Humanize adapter paths
and is no longer used in v0.6.4.
"""

    (out / "guizang-production-prompt.md").write_text(prompt, encoding="utf-8")
    return {
        "status": "brief-written",
        "prompt": str(out / "guizang-production-prompt.md"),
        "style": style,
        "slides": len(plan),
    }


def write_frontend_slides_production_brief(out, title, plan, source, language):
    """Write only the frontend-slides production brief. No HTML is produced.

    Skeleton: the next agent must follow
    `~/.agents/skills/frontend-slides/SKILL.md` and use its own native
    pipeline (PPTX → HTML conversion, viewport-safe HTML deck, deploy).
    Humanize never opens the frontend-slides template.
    """
    inputs_block = "\n".join(
        f"- `{name}`"
        for name in [
            "deck_brief.md",
            "ast_outline.md",
            "slide_plan.json",
            "speaker_intent.md",
            "asset_manifest.md",
            "video_slots.json",
            "style_brief.md",
        ]
    )
    media_block = _format_per_page_media_block(plan)
    media_guidance = _media_production_guidance(language)

    prompt = f"""# Frontend Slides Production Prompt

> Humanize PPT stops here. The next agent must follow
> `~/.agents/skills/frontend-slides/SKILL.md` end to end.
> Do not reimplement the renderer inside Humanize.

## Deck

- Title: {title}
- Source: {source}
- Language: {language}
- Slides: {len(plan)}

## Hard rules

- Read `frontend-slides/SKILL.md` first. Use its native PPTX→HTML
  conversion, viewport-safe deck, and Vercel deploy path.
- Use the registered layouts / templates that skill ships with. Do not
  invent layout classes.
- Do not post-process the rendered HTML in Humanize. Frontend-slides
  owns its own navigation, presenter shell, and deploy step.

## Inputs already produced by Humanize

{inputs_block}

## Per-page media decisions (Humanize-owned)

{media_block}

{media_guidance}
## Hand-off

The next agent writes its output to its own convention
(e.g. `outputs/frontend-slides-rendered/index.html`).
"""

    (out / "frontend-slides-production-prompt.md").write_text(prompt, encoding="utf-8")
    return {
        "status": "brief-written",
        "prompt": str(out / "frontend-slides-production-prompt.md"),
        "slides": len(plan),
    }


def write_beautiful_html_templates_production_brief(out, title, plan, source, language):
    """Write only the beautiful-html-templates production brief. No HTML produced.

    Skeleton: the next agent must follow
    `~/.agents/skills/beautiful-html-templates/SKILL.md` and use its own
    native template selection + full-deck rendering.
    Humanize never copies templates or injects sections.
    """
    inputs_block = "\n".join(
        f"- `{name}`"
        for name in [
            "deck_brief.md",
            "ast_outline.md",
            "slide_plan.json",
            "speaker_intent.md",
            "asset_manifest.md",
            "video_slots.json",
            "style_brief.md",
        ]
    )
    media_block = _format_per_page_media_block(plan)
    media_guidance = _media_production_guidance(language)

    prompt = f"""# Beautiful HTML Templates Production Prompt

> Humanize PPT stops here. The next agent must follow
> `~/.agents/skills/beautiful-html-templates/SKILL.md` end to end.
> Do not reimplement the renderer inside Humanize.

## Deck

- Title: {title}
- Source: {source}
- Language: {language}
- Slides: {len(plan)}

## Hard rules

- Read `beautiful-html-templates/SKILL.md` first. Use its native
  template selection, preview gallery, and selected-template full-deck
  generation.
- Do not copy templates or inject custom sections into Humanize.
  Beautiful owns the rendered HTML end-to-end.

## Inputs already produced by Humanize

{inputs_block}

## Per-page media decisions (Humanize-owned)

{media_block}

{media_guidance}
## Hand-off

The next agent writes its output to its own convention
(e.g. `outputs/beautiful-rendered/index.html`).
"""

    (out / "beautiful-html-templates-production-prompt.md").write_text(prompt, encoding="utf-8")
    return {
        "status": "brief-written",
        "prompt": str(out / "beautiful-html-templates-production-prompt.md"),
        "slides": len(plan),
    }


def _safe_project_slug(value):
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value or "").strip()).strip("-._").lower()
    return slug[:64] or "humanize-ppt"


def resolve_ppt_master_python(requested=None):
    """Return a verified Python >=3.10 executable for current PPT Master."""
    candidates = (
        [str(requested)]
        if requested
        else ["python3.13", "python3.12", "python3.11", "python3.10", sys.executable, "python3"]
    )

    checked = set()
    for candidate in candidates:
        resolved = shutil.which(candidate) if not Path(candidate).expanduser().exists() else str(Path(candidate).expanduser().resolve())
        if not resolved or resolved in checked:
            continue
        checked.add(resolved)
        try:
            result = subprocess.run(
                [
                    resolved,
                    "-c",
                    "import sys; print('.'.join(map(str, sys.version_info[:3]))); raise SystemExit(0 if sys.version_info >= (3, 10) else 1)",
                ],
                text=True,
                capture_output=True,
            )
        except OSError:
            continue
        if result.returncode == 0:
            return resolved, result.stdout.strip()

    if requested:
        raise ValueError(f"--ppt-master-python must be Python 3.10 or newer: {requested}")
    return "python3", "unverified"


def write_ppt_master_source(out, title, plan, source, language):
    """Write a self-contained semantic source for PPT Master's Strategist.

    PPT Master still owns design_spec/spec_lock and every native rendering
    decision. This file freezes Humanize's page story, notes intent, and media
    requirements so the downstream Strategist does not restart from raw source.
    """
    source_path = Path(source).expanduser().resolve()
    lines = [
        "# Humanize PPT → PPT Master Source Contract",
        "",
        f"- Title: {title}",
        f"- Language: {language}",
        f"- Original source: `{source_path}`",
        f"- Planned slides: {len(plan)}",
        "",
        "## Story authority",
        "",
        "Humanize owns the audience-state-transfer story. Preserve this page order, page count,",
        "message, and speaker intent unless the user explicitly changes them at PPT Master's",
        "mandatory confirmation gate. PPT Master owns visual design, layout, SVG authoring,",
        "native PowerPoint objects, transitions, and export.",
        "",
        "## Media mapping",
        "",
        "- `gpt-photo` maps to a PPT Master `Acquire Via: ai` image row unless the asset already exists.",
        "- `screenshot` maps to a user/web factual image; never synthesize a fake UI.",
        "- `svg-html` and `html-table` remain deterministic SVG/native table work, not generated pictures.",
        "- Remotion/HyperFrames slots are intent records. PPT Master may represent them with native",
        "  PowerPoint motion, a static keyframe, or a narrated/video-export route; it must report the",
        "  chosen fallback because PPT Master does not embed arbitrary Humanize MP4 slots by default.",
        "",
        "## Per-slide contract",
        "",
    ]
    for slide in plan:
        lines.extend(
            [
                f"### {slide.get('slide_id')} · {slide.get('title', '')}",
                "",
                f"- Role: `{slide.get('role', '')}`",
                f"- Message: {slide.get('message', '')}",
                f"- Speaker intent: {slide.get('speaker_intent', '')}",
                f"- Layout hint (non-binding): `{slide.get('layout_hint') or 'PPT Master decides'}`",
                "- Visible content:",
            ]
        )
        visible = slide.get("visible_content") or []
        lines.extend(f"  - {item}" for item in visible)
        media = slide.get("media") or {}
        lines.append("- Media:")
        any_media = False
        for media_type in ("image", "diagram", "video"):
            item = media.get(media_type) or {}
            if not item.get("needed"):
                continue
            any_media = True
            lines.append(
                f"  - {media_type}: kind=`{item.get('kind', '')}`; "
                f"asset_path=`{item.get('asset_path') or ''}`; purpose={item.get('purpose', '')}"
            )
            if item.get("prompt_hint"):
                lines.append(f"    - prompt_hint: {item['prompt_hint']}")
        if not any_media:
            lines.append("  - none")
        lines.append("")

    canonical = out / "ppt-master-source.md"
    canonical.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    handoff = out / "outputs" / "ppt-master-handoff"
    handoff.mkdir(parents=True, exist_ok=True)
    staged_source = handoff / "ppt-master-source.md"
    shutil.copyfile(canonical, staged_source)

    staged_original = None
    if source_path.exists() and source_path.is_file():
        staged_original = handoff / f"original-source{source_path.suffix.lower()}"
        shutil.copy2(source_path, staged_original)

    return canonical, staged_source, staged_original


def write_ppt_master_production_brief(
    out,
    title,
    plan,
    source,
    language,
    *,
    template=None,
    canvas_format="ppt169",
    project_name=None,
    visual_style=None,
    native_objects=False,
    transition="fade",
    animation="none",
    animation_trigger="after-previous",
    visual_review=False,
    repo_hint=None,
    native_presenter=False,
    python_executable=None,
):
    """Write the native PPT Master production hand-off and staged source."""
    source = Path(source).expanduser().resolve()
    canonical, staged_source, staged_original = write_ppt_master_source(
        out, title, plan, source, language
    )
    project_slug = _safe_project_slug(project_name or f"humanize-{Path(out).name}")
    project_base = out / "outputs" / "ppt-master-projects"
    rendered_dir = out / "outputs" / "ppt-master-rendered"
    humanize_entrypoint = SKILL_ROOT / "scripts" / "humanize_ppt.py"
    route = "template-fill-pptx" if template else "main-svg-pipeline"
    ppt_python, ppt_python_version = resolve_ppt_master_python(python_executable)
    if ppt_python_version == "unverified":
        sys.stderr.write(
            f"[humanize-ppt v{VERSION}] WARNING: no Python >=3.10 interpreter was detected for PPT Master; "
            "the brief uses python3 but the downstream preflight must pass before project creation.\n"
        )

    install_candidates = []
    if repo_hint:
        install_candidates.append(str(Path(repo_hint).expanduser().resolve() / "skills" / "ppt-master"))
    install_candidates.extend(
        [
            "~/.agents/skills/ppt-master",
            "~/.codex/skills/ppt-master",
            "~/projects/ppt-master/skills/ppt-master",
        ]
    )
    install_lines = "\n".join(
        f"  {index}. `{path}`" for index, path in enumerate(install_candidates, 1)
    )
    staged_inputs = [f'"{staged_source}"']
    if staged_original:
        staged_inputs.append(f'"{staged_original}"')
    staged_inputs_command = (" " + chr(92) + "\n  ").join(staged_inputs)

    route_commands = ""
    route_rules = ""
    if template:
        template_path = Path(template).expanduser().resolve()
        route_commands = f"""\
```bash
\"$PPT_MASTER_PYTHON\" \"$PPT_MASTER_SKILL_DIR/scripts/project_manager.py\" init \"{project_slug}\" --format {canvas_format} --dir \"{project_base}\"
# Capture the printed project path as <project_path>, then copy (never move) the user template and Humanize source:
\"$PPT_MASTER_PYTHON\" \"$PPT_MASTER_SKILL_DIR/scripts/project_manager.py\" import-sources \"<project_path>\" \\
  \"{template_path}\" \"{canonical}\" --copy
```
"""
        route_rules = """\
- Follow `workflows/template-fill-pptx.md`, not the SVG pipeline.
- Treat the raw PPTX as a native slide library. Select/reuse/reorder layouts to fit the Humanize story.
- Build `analysis/fill_plan.json` with `status: draft`; stop for its required page-sequence review.
- Map every Humanize `speaker_intent` to `slides[].notes` before apply/validate.
- Preserve and edit native tables/charts already present in the selected template slides; the main SVG pipeline's `--native-objects` flag does not apply here.
- Template-fill v1 preserves existing object animation XML but does not add or retime object animations. Treat requested object-animation changes as a separately approved direct-PPTX task.
- Template-fill v1 cannot replace images. Keep the template image, choose another layout, or report `Needs-Manual`; never claim that a Humanize image asset was inserted.
- Run the workflow's apply, validate, and read-back gates. Do not convert this raw template through SVG.
"""
    else:
        route_commands = f"""\
```bash
\"$PPT_MASTER_PYTHON\" \"$PPT_MASTER_SKILL_DIR/scripts/project_manager.py\" init \"{project_slug}\" --format {canvas_format} --dir \"{project_base}\"
# Capture the printed project path as <project_path>. These files are disposable handoff copies, so the main-pipeline --move rule is safe:
\"$PPT_MASTER_PYTHON\" \"$PPT_MASTER_SKILL_DIR/scripts/project_manager.py\" import-sources \"<project_path>\" \\
  {staged_inputs_command} --move
```
"""
        route_rules = """\
- Follow PPT Master's `SKILL.md` Steps 1–7 in strict serial order.
- Do not skip or auto-answer the mandatory three-stage Strategist confirmation. Humanize's plan is the story recommendation; the user's confirmed PPT Master values win.
- Read `ppt-master-source.md` as the content contract. Preserve its page order/count unless the user changes them at the confirmation gate.
- Generate pages sequentially in the current main agent; obey PPT Master's no-subagent/no-batch SVG rules.
- Map `speaker_intent` into `notes/total.md` one-to-one before export.
"""

    if template:
        export_flag_text = f"--transition {transition}"
        export_instruction = (
            "Apply the confirmed fill plan with "
            f"`{export_flag_text}` in addition to the workflow's required command shape. "
            "Do not pass main-pipeline `-a` or `--native-objects` flags."
        )
    else:
        export_flags = [f"-t {transition}"]
        if animation != "none":
            export_flags.extend([f"-a {animation}", f"--animation-trigger {animation_trigger}"])
        if native_objects:
            export_flags.append("--native-objects")
        export_flag_text = " ".join(export_flags)
        export_instruction = (
            f"Export with `{export_flag_text}` in addition to the workflow's required command shape."
        )
    if template:
        visual_review_text = (
            "PPT Master's optional `workflows/visual-review.md` targets SVG projects and does not run on template-fill. "
            "The user requested visual review, so render the final PPTX through an office consumer, inspect every page, and record this route boundary in the manifest."
            if visual_review
            else "Do not auto-run PPT Master's SVG-only optional visual-review workflow on template-fill."
        )
    else:
        visual_review_text = (
            "Run `workflows/visual-review.md` after SVG quality check and before post-processing; the user explicitly opted in."
            if visual_review
            else "Do not auto-run PPT Master's optional visual-review workflow."
        )

    prompt = f"""# PPT Master Production Prompt

> Humanize PPT stops at the semantic contract. PPT Master owns the native PowerPoint project and must follow its own authorities end to end. Do not reimplement PPT Master in Humanize and do not patch the exported OOXML in Humanize.

## Resolve PPT Master

Set `PPT_MASTER_SKILL_DIR` to the first existing directory below:

{install_lines}

If using the cloned repository, read its `AGENTS.md` first. In every install shape, read `$PPT_MASTER_SKILL_DIR/SKILL.md` completely before creating or changing a PPT project.

Use the verified interpreter below for every PPT Master script:

```bash
PPT_MASTER_PYTHON={shlex.quote(ppt_python)}
\"$PPT_MASTER_PYTHON\" -c 'import sys; assert sys.version_info >= (3, 10), sys.version'
```

Detected version: `{ppt_python_version}`.

## Resolved route

- Route: `{route}`
- Canvas: `{canvas_format}`
- Humanize slides: {len(plan)}
- Recommended visual style: `{visual_style or 'PPT Master Strategist recommends; user confirms'}`
- Native table/chart objects: `{str(bool(native_objects)).lower()}`
- Page transition: `{transition}`
- Object animation: `{animation}`
- Animation trigger: `{animation_trigger}`
- Native presenter requested: `{str(bool(native_presenter)).lower()}` (speaker notes feed PowerPoint Presenter View; no HTML renderer is added)
- Raw PPTX template: `{str(Path(template).expanduser().resolve()) if template else 'none'}`

## Inputs

- Canonical Humanize source contract: `{canonical}`
- Humanize AST support files: `deck_brief.md`, `ast_outline.md`, `slide_plan.json`, `speaker_intent.md`, `asset_manifest.md`, `video_slots.json`, `style_brief.md`
- Original source: `{source}`

## Initialize

{route_commands}
## Route rules

{route_rules}
- Humanize media paths are intent/target records. PPT Master must remap them into its own `images/`, `design_spec.md §VIII`, native SVG, or an explicit reported fallback; never leave a broken external path in the PPTX.
- {visual_review_text}

## Native export

- Run PPT Master's own quality/validation gates before export.
- {export_instruction}
- Keep PPT Master's project export as the source of truth, then place a byte-identical copy at `{rendered_dir / 'deck.pptx'}`.
- Write `{rendered_dir / 'render_manifest.json'}` with the PPT Master commit/version, project path, canonical export path, copied deck path, route, export flags, and validation results.

## Humanize presentation checkup

After the native deck exists, run:

```bash
\"$PPT_MASTER_PYTHON\" \"{humanize_entrypoint}\" --qa-from \"{rendered_dir / 'deck.pptx'}\" --out \"{out}\" --renderer ppt-master --ppt-master-transition {transition}{' --ppt-master-native-objects' if native_objects else ''} --max-qa-iterations 3
```

Humanize checks OOXML package integrity, page count, editable objects, placeholders, speaker notes, AST drift, relationships, transitions, and requested native objects. Apply `fix_prompt.md` in PPT Master's author source and re-export; never repair the deck by post-processing it inside Humanize.
"""

    prompt_path = out / "ppt-master-production-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    return {
        "status": "brief-written",
        "prompt": str(prompt_path),
        "source_contract": str(canonical),
        "staged_source": str(staged_source),
        "staged_original": str(staged_original) if staged_original else None,
        "route": route,
        "python": ppt_python,
        "python_version": ppt_python_version,
        "slides": len(plan),
    }


def write_qa(out, plan, render_issues=None):
    qa = out / "outputs" / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    required = [
        "deck_brief.md",
        "ast_outline.md",
        "slide_plan.json",
        "speaker_intent.md",
        "asset_manifest.md",
        "video_slots.json",
        "router_plan.json",
        "run_manifest.json",
    ]
    checks = []
    for name in required:
        checks.append((name, (out / name).exists()))
    visible_text = "\n".join("\n".join(p.get("visible_content", [])) for p in plan)
    banned = [x for x in BANNED_VISIBLE_PATTERNS if x in visible_text]
    checks.append(("visible_slide_text_has_no_ai_draft_markers", not banned))
    missing = [name for name, ok in checks if not ok]
    render_issues = render_issues or []
    missing.extend(render_issues)
    report = ["# QA Report", "", f"- status: {'pass' if not missing else 'needs-fix'}", "", "## Checks"]
    report.extend([f"- [{'x' if ok else ' '}] {name}" for name, ok in checks])
    report.extend([f"- [ ] {issue}" for issue in render_issues])
    if banned:
        report.extend(["", "## Banned visible markers", *[f"- {x}" for x in banned]])
    (qa / "qa_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    (qa / "fix_list.md").write_text("# Fix List\n\n" + ("No blocking issues.\n" if not missing else "\n".join(f"- Fix {x}" for x in missing) + "\n"), encoding="utf-8")
    return not missing


def write_manifest(out, title, source_path, primary, routes, qa_passed):
    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file())
    manifest = {
        "version": VERSION,
        "generated_at": now_iso(),
        "title": title,
        "source": str(source_path),
        "primary_renderer": primary,
        "routes": routes,
        "qa_status": "pass" if qa_passed else "needs-fix",
        "files": files,
    }
    (out / "run_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    final_dir = out / "outputs" / "qa"
    final_dir.mkdir(parents=True, exist_ok=True)
    (final_dir / "final_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def write_style_brief(out, primary, language, preview_count=None):
    if primary == "ppt-master":
        route_rule = "PPT Master 使用自己的三阶段确认页锁定视觉系统；Humanize 不复制其模板或绕过确认门。"
    elif language == "zh":
        route_rule = "中文默认走 guizang 稳定成稿；用户显式要求时再进入 preview-first。"
    else:
        route_rule = f"英文默认先定主题，再生成至少 {preview_count or DEFAULT_EN_PREVIEW_COUNT} 个风格候选；选中风格后才进入完整 deck、presenter 和 deploy。"
    style = {
        "version": VERSION,
        "primary_renderer": primary,
        "language": language,
        "style_mode": (
            "downstream-confirmation"
            if primary == "ppt-master"
            else ("stable-first" if primary == "guizang" else "preview-first")
        ),
        "rule": "先保留AST叙事，再选择视觉系统；不要把推荐Skill清单写成产品边界。",
        "route_rule": route_rule,
        "preview_count": preview_count,
    }
    (out / "style_brief.md").write_text(
        "# Style Brief\n\n"
        f"- primary_renderer: `{primary}`\n"
        f"- language: `{language}`\n"
        f"- style_mode: `{style['style_mode']}`\n"
        f"- preview_count: `{preview_count}`\n"
        f"- route_rule: {route_rule}\n"
        f"- principle: {style['rule']}\n",
        encoding="utf-8",
    )
    return style


def copy_registry_snapshot(out):
    target = out / "renderer_registry.json"
    if REGISTRY_PATH.exists():
        shutil.copyfile(REGISTRY_PATH, target)


def parse_args():
    ap = argparse.ArgumentParser(
        description=f"Humanize PPT v{VERSION} — AST outline director + media plan + HTML/PPTX brief orchestrator + presentation checkup"
    )
    ap.add_argument("--source", default=None, help="Source markdown / PPTX. Required for brief mode.")
    ap.add_argument("--out", required=True, help="Output directory.")
    ap.add_argument("--title", default=None, help="Deck title. Required for brief mode.")
    ap.add_argument("--qa-from", default=None, help="Path to a rendered HTML deck or native PPTX. Switches to QA mode. Mutually exclusive with --source.")
    ap.add_argument("--max-qa-iterations", type=int, default=3, help="Max QA rounds before status flips to needs-human. Default 3.")
    ap.add_argument("--renderer", default="auto", choices=["auto", "guizang", "beautiful-html-templates", "html-ppt", "frontend-slides", "ppt-master"])
    ap.add_argument("--style-mode", default="stable-first", choices=["stable-first", "preview-first", "presenter-first"])
    ap.add_argument("--selected-template", default=None, help="Beautiful template slug to render as a full deck after preview selection.")
    ap.add_argument("--presenter-adapter", action="store_true", help="Generate outputs/presenter/index.html for speaker notes and presenter control.")
    ap.add_argument("--export-adapter", action="store_true", help="Generate outputs/export package and export_pdf.sh for PDF export.")
    ap.add_argument("--occasion", default=None, help="Optional occasion hint for beautiful-html-templates selection.")
    ap.add_argument("--mood", default=None, help="Optional mood/vibe hint for beautiful-html-templates selection.")
    ap.add_argument("--preview-count", type=int, default=None, help="Number of beautiful-html-templates previews to render. English runs are floored at 5.")
    ap.add_argument("--beautiful-repo", default=None, help="Path to zarazhangrui/beautiful-html-templates. Auto-detected if omitted.")
    ap.add_argument("--no-beautiful-auto-clone", action="store_true", help="Do not auto-clone beautiful-html-templates into ~/.cache/humanize-ppt.")
    ap.add_argument("--presenter", action="store_true", help="Request a presenter-capable downstream. PPT Master uses embedded notes + native PowerPoint Presenter View.")
    ap.add_argument("--no-render", action="store_true", help="Only write contracts, router plan, commands, and manifest.")
    ap.add_argument("--guizang-style", default=None, choices=["A", "B"], help="Guizang style (A = flexible, B = Swiss locked). Defaults to A.")
    ap.add_argument(
        "--guizang-theme",
        default=None,
        choices=["ink-classic", "indigo-porcelain", "forest-ink", "kraft-paper", "dune"],
        help="Style A theme preset. Required when --guizang-style=A. v0.6.5: 5 built-in presets, no custom colors.",
    )
    ap.add_argument(
        "--guizang-accent",
        default=None,
        choices=["ikb", "lemon-yellow", "lemon-green", "safety-orange"],
        help="Style B accent color. Required when --guizang-style=B. v0.6.5: pick 1 of 4.",
    )
    ap.add_argument(
        "--research-md",
        default=None,
        help="Path to a pre-existing research document (e.g. hv-analysis output) to use as the brief source instead of --source.",
    )
    ap.add_argument(
        "--skip-install-check",
        action="store_true",
        help="Skip the guizang-ppt-skill (or relevant downstream skill) install self-check warning.",
    )
    ap.add_argument(
        "--preview-outline",
        action="store_true",
        help="v0.6.6: write outline-preview.md (human-readable AST slice) and stop. Re-run with --confirm-outline after review.",
    )
    ap.add_argument(
        "--confirm-outline",
        action="store_true",
        help="v0.6.6: read outline-preview.md (from a prior --preview-outline run) and resume the brief write. Refuses if outline is missing or source mtime is newer.",
    )
    ap.add_argument(
        "--style-gallery",
        action="store_true",
        help="v0.9: the cover-style gate before the outline. Emits >=4 cover-only render commands + a zero-dependency style_gallery.html picker, then stops. Pick a cover, then run the printed re-injection command.",
    )
    ap.add_argument(
        "--gallery-count",
        type=int,
        default=4,
        help="v0.9: number of style-gallery candidates. Minimum (and default) 4; capped at the candidates defined for the renderer.",
    )
    ap.add_argument(
        "--ppt-master-template",
        default=None,
        help="Raw .pptx template. Forces PPT Master's native template-fill-pptx route; never enters the SVG template route.",
    )
    ap.add_argument("--ppt-master-repo", default=None, help="Optional PPT Master clone root containing skills/ppt-master/SKILL.md.")
    ap.add_argument("--ppt-master-python", default=None, help="Python >=3.10 executable for PPT Master. Auto-detected when omitted.")
    ap.add_argument("--ppt-master-format", default="ppt169", help="PPT Master canvas id (default: ppt169).")
    ap.add_argument("--ppt-master-project-name", default=None, help="Optional PPT Master project slug.")
    ap.add_argument("--ppt-master-visual-style", default=None, help="Initial PPT Master visual-style recommendation; its confirmation UI remains authoritative.")
    ap.add_argument("--ppt-master-native-objects", action="store_true", help="Request native editable table/chart objects and verify planned table pages in PPTX QA.")
    ap.add_argument(
        "--ppt-master-transition",
        default="fade",
        choices=["fade", "push", "wipe", "split", "strips", "cover", "random", "none"],
        help="Native PPT Master page transition (default: fade). PPTX QA verifies it unless set to none.",
    )
    ap.add_argument(
        "--ppt-master-animation",
        default="none",
        help="PPT Master object animation: none, auto, mixed, or a supported explicit effect.",
    )
    ap.add_argument(
        "--ppt-master-animation-trigger",
        default="after-previous",
        choices=["on-click", "with-previous", "after-previous"],
        help="PPT Master object animation trigger.",
    )
    ap.add_argument(
        "--ppt-master-visual-review",
        action="store_true",
        help="Request per-page visual review. Main SVG projects use PPT Master's optional workflow; template-fill uses a final office-render inspection.",
    )
    return ap.parse_args()


# ---------------------------------------------------------------------------
# v0.6.6: --preview-outline / --confirm-outline review-checkpoint pair.
# Spec: references/preview-outline-spec.md
# ---------------------------------------------------------------------------


def _format_outline_preview(title, plan, source_path, language, style, theme, accent):
    """Render the human-readable outline-preview.md content."""
    n = len(plan)
    role_counts = {}
    for p in plan:
        role_counts[p.get("role", "slide")] = role_counts.get(p.get("role", "slide"), 0) + 1
    arc = " · ".join(f"{k} {v}" for k, v in role_counts.items())

    lines = [
        "# Outline preview",
        "",
        "> AST slice: " + arc,
        f"> Source: {source_path}",
        f"> Renderer: guizang · Style: {style}" + (f" · Theme: {theme}" if style == "A" else f" · Accent: {accent}"),
        f"> Slides: {n}",
        f"> Title: {title}",
        "",
    ]
    for p in plan:
        title_chars = len([c for c in p.get("title", "") if "一" <= c <= "鿿"])
        body_chars = sum(len([c for c in v if "一" <= c <= "鿿"]) for v in p.get("visible_content", []))
        lines.append(f"## {p.get('slide_id', '?')} · {p.get('role', 'slide')}")
        lines.append(f"Title ({title_chars} 中文字): {p.get('title', '')}")
        lines.append(f"Body ({body_chars} 中文字):")
        for v in p.get("visible_content", []):
            lines.append(f"  - {v}")
        if p.get("speaker_intent"):
            lines.append(f"Speaker intent: {p['speaker_intent']}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Per-page media decisions (Humanize-owned)")
    lines.append("")
    for p in plan:
        m = p.get("media") or {}
        bits = []
        for kind in ("image", "diagram", "video"):
            entry = m.get(kind) or {}
            if entry.get("needed"):
                kind_label = entry.get("kind", "?")
                if kind == "video":
                    kind_label = f"{kind_label} ({entry.get('duration_s', '?')}s)"
                # v0.6.7: surface the machine-actionable asset_path so the
                # media task is visible at the review checkpoint, not just a label.
                asset_path = entry.get("asset_path")
                if asset_path:
                    bits.append(f"{kind}={kind_label} → `{asset_path}`")
                else:
                    bits.append(f"{kind}={kind_label}")
        if not bits:
            bits.append("no media")
        lines.append(f"- {p.get('slide_id', '?')} {p.get('role', '?')}: {', '.join(bits)}")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Review checklist")
    lines.append("")
    lines.append("- [ ] Title counts fit the layout slot (≤ 15 中文字 for cover/headline)")
    lines.append("- [ ] All visible_content ≥ 30 中文字 (no empty pages)")
    lines.append("- [ ] No banned substrings (Khazix, methodology, attribution) in any body")
    lines.append("- [ ] 7 concepts (Agent / Tool / Function calling / MCP / Skill / Rules / Hook / Subagent) all present if relevant")
    lines.append("- [ ] Per-page media decisions make sense for the page role")
    lines.append("")
    lines.append("When reviewed, re-run with `--confirm-outline` to write the production prompt.")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# v0.9: --style-gallery — the cover-style gate that precedes the outline.
# Spec: references/style-gallery-spec.md
# ---------------------------------------------------------------------------


def _style_gallery_base_command(args, source_path):
    """The base re-run command (source/out/title) every re-injection extends.

    Uses the stable entrypoint `scripts/humanize_ppt.py`. The candidate's
    `cli` dict is appended to carry the chosen renderer + style forward into
    the normal outline → brief flow.
    """
    base = ["python3", "scripts/humanize_ppt.py"]
    if getattr(args, "research_md", None):
        base += ["--research-md", str(source_path)]
    else:
        base += ["--source", str(source_path)]
    base += ["--out", str(Path(args.out).expanduser().resolve())]
    base += ["--title", args.title or ""]
    return base


def _reinjection_command(base_command, candidate):
    """Full shell command to run AFTER a candidate cover is chosen.

    base_command + the candidate's renderer/style args. The result resumes
    the normal flow (add --preview-outline yourself if you want the review
    checkpoint). Quoted for copy-paste safety.
    """
    parts = list(base_command)
    for flag, value in candidate["cli"].items():
        parts += [flag, value]
    return " ".join(shlex.quote(p) for p in parts)


def _style_gallery_cover_command_md(candidate, cover_slide, title, source_path, reinjection_cmd):
    """Per-candidate cover-only render command for the downstream skill.

    The downstream skill renders ONLY the cover (S01) in this style and writes
    outputs/style-gallery/<id>/cover.{html,png}. Humanize never renders it.
    """
    renderer = candidate["cli"].get("--renderer", "guizang")
    out_dir = f"outputs/style-gallery/{candidate['id']}"
    cover_lines = "\n".join(f"  - {line}" for line in cover_slide.get("visible_content", []))
    style_args = " ".join(
        f"{flag} {value}" for flag, value in candidate["cli"].items() if flag != "--renderer"
    )
    # v0.9 + #5: WebGL hero covers do not survive a static PNG screenshot
    # (the canvas paints after load → blank capture). Style A guizang covers
    # use the WebGL hero, so the PNG can come back blank even when the live
    # cover is correct. Tell the renderer to prefer a live cover.html and to
    # treat a <20KB PNG as a failed capture, not an empty cover.
    webgl_warning = ""
    if candidate["cli"].get("--guizang-style") == "A":
        webgl_warning = (
            "\n## ⚠️ WebGL 封面静态截图陷阱\n\n"
            "本候选是 Style A，封面用 WebGL hero canvas。**静态 PNG 截图会捕获到空白**"
            "（canvas 在加载后才绘制，截图早于绘制）。\n\n"
            "- 以 `cover.html`（活页）为准，`cover.png` 仅作缩略。\n"
            "- 截图前等待 canvas 完成首帧（或截屏延迟 ≥1.5s）。\n"
            "- 若 `cover.png` < 20KB，判定为截图失败而非空封面，重截或只交活页。\n"
        )

    return f"""# 风格画廊候选 · {candidate['label']}

> Humanize 出 spec / command，**不自渲**。本命令只渲染封面（S01）一页，供人挑风格。
> 下游 skill：`{renderer}`。

## 任务

只渲染**封面一页**（S01，hook），用下面的风格，然后写到：

- `{out_dir}/cover.html` —— 活页封面（首选交付物）
- `{out_dir}/cover.png` —— 封面缩略图（用于 style_gallery.html 缩略，可选）

不要渲染整套 deck。这是选风格的门，不是成稿。

## 风格

- 渲染器：`{renderer}`
- 风格参数：`{style_args or '(默认)'}`

## 封面内容（来自 slide_plan S01）

- 标题：{title}
{cover_lines or '  - (无可见正文)'}
{webgl_warning}
## 选定本风格后

挑中这张封面后，回灌以下命令把该风格带进正常的大纲 → brief 流程：

```bash
{reinjection_cmd}
```

（想先过大纲审查门，自行追加 `--preview-outline`。）
"""


def _render_style_gallery_html(title, primary, candidates, source_path, base_command):
    """Zero-dependency single-file assembler that stitches candidate covers.

    Each card embeds the candidate's cover.html via a relative-path iframe.
    Honest about pending state: a card whose cover is not yet rendered shows
    blank — the caption says so rather than faking a thumbnail (宁空不摆拍).
    """
    generated = now_iso()
    cards = []
    for c in candidates:
        cover_rel = f"outputs/style-gallery/{c['id']}/cover.html"
        cmd_rel = f"commands/style-gallery/{c['id']}.md"
        reinjection = _reinjection_command(base_command, c)
        cards.append(f"""
      <article class="card">
        <div class="frame">
          <iframe src="{esc_html(cover_rel)}" title="{esc_html(c['label'])}" loading="lazy"></iframe>
        </div>
        <div class="card-body">
          <div class="card-id">{esc_html(c['id'])}</div>
          <h2>{esc_html(c['label'])}</h2>
          <p class="desc">{esc_html(c['description'])}</p>
          <p class="cover-note">封面 = <code>{esc_html(cmd_rel)}</code> 的渲染产物（上方空白 = 尚未渲染，或 WebGL hero 静态截图陷阱）</p>
          <div class="cmd-label">选定后回灌命令</div>
          <pre class="cmd">{esc_html(reinjection)}</pre>
        </div>
      </article>""")

    return f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc_html(title)} · 风格画廊</title>
<style>
  :root {{
    --ink: #0a0a0b;
    --paper: #f1efea;
    --line: #d8d3c8;
    --muted: #6b6457;
    --accent: #b4452e;
    --card: #fff;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: var(--paper);
    color: var(--ink);
    font-family: "Songti SC", "Noto Serif SC", Georgia, serif;
    padding: 48px clamp(24px, 6vw, 96px);
    line-height: 1.6;
  }}
  .kicker {{
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 12px; letter-spacing: 0.18em; color: var(--accent);
    text-transform: uppercase; margin-bottom: 12px;
  }}
  h1 {{ font-size: clamp(22px, 3.4vw, 34px); font-weight: 700; margin-bottom: 8px; }}
  .meta {{
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 12px; color: var(--muted); margin-bottom: 28px;
  }}
  .grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 24px;
  }}
  .card {{
    border: 1px solid var(--line);
    background: var(--card);
    display: flex; flex-direction: column;
  }}
  .frame {{
    position: relative;
    aspect-ratio: 16 / 9;
    background: #e7e2d8;
    overflow: hidden;
    border-bottom: 1px solid var(--line);
  }}
  .frame iframe {{
    width: 177.78%; height: 177.78%;
    transform: scale(0.5625); transform-origin: top left;
    border: 0;
  }}
  .card-body {{ padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 6px; }}
  .cover-note {{
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 10px; color: var(--muted); margin-top: 4px;
  }}
  .cover-note code {{ color: var(--accent); }}
  .card-id {{
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 11px; color: var(--accent); letter-spacing: 0.08em;
  }}
  .card h2 {{ font-size: 18px; font-weight: 700; }}
  .desc {{ font-size: 13px; color: var(--muted); }}
  .cmd-label {{
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--muted); margin-top: 8px;
  }}
  .cmd {{
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 11px; color: var(--ink);
    background: var(--paper); border: 1px solid var(--line);
    padding: 10px 12px; white-space: pre-wrap; word-break: break-all;
  }}
  footer {{
    margin-top: 36px;
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 11px; color: var(--muted);
  }}
</style>
</head>
<body>
  <div class="kicker">Humanize PPT · 风格画廊 · Cover Style Gallery</div>
  <h1>{esc_html(title)}</h1>
  <div class="meta">renderer: {esc_html(primary)} · candidates: {len(candidates)} · source: {esc_html(source_path)} · generated: {esc_html(generated)} · v{VERSION}</div>

  <div class="grid">{''.join(cards)}</div>

  <footer>
    零依赖单文件 · 每张封面由下游 skill 真渲（commands/style-gallery/&lt;id&gt;.md）· Humanize 只出 spec / command，不渲染 PPT。<br>
    封面空白 = 该候选尚未渲染，或 WebGL hero 静态截图陷阱（以活页 cover.html 为准）。
  </footer>
</body>
</html>
"""


def esc_html(value):
    """Local HTML escaper (the module imports `html`)."""
    return html.escape(str(value if value is not None else ""), quote=True)


def run_ppt_master_style_gate_mode(args, source_path, language):
    """Delegate style choice to PPT Master's mandatory visual Confirm UI.

    PPT Master already owns a staged style catalog with real previews. Emitting
    four fake Humanize cover projects would duplicate that system and violate
    its serial confirmation contract, so this renderer uses a native gate.
    """
    out = Path(args.out).expanduser().resolve()
    command = _style_gallery_base_command(args, source_path)
    command += ["--renderer", "ppt-master"]
    if getattr(args, "ppt_master_template", None):
        command += ["--ppt-master-template", str(Path(args.ppt_master_template).expanduser().resolve())]
    if getattr(args, "ppt_master_repo", None):
        command += ["--ppt-master-repo", str(Path(args.ppt_master_repo).expanduser().resolve())]
    if getattr(args, "ppt_master_python", None):
        command += ["--ppt-master-python", args.ppt_master_python]
    command += ["--ppt-master-format", getattr(args, "ppt_master_format", "ppt169")]
    if getattr(args, "ppt_master_project_name", None):
        command += ["--ppt-master-project-name", args.ppt_master_project_name]
    if getattr(args, "ppt_master_visual_style", None):
        command += ["--ppt-master-visual-style", args.ppt_master_visual_style]
    command += ["--ppt-master-transition", getattr(args, "ppt_master_transition", "fade")]
    command += ["--ppt-master-animation", getattr(args, "ppt_master_animation", "none")]
    command += [
        "--ppt-master-animation-trigger",
        getattr(args, "ppt_master_animation_trigger", "after-previous"),
    ]
    if getattr(args, "ppt_master_native_objects", False):
        command.append("--ppt-master-native-objects")
    if getattr(args, "ppt_master_visual_review", False):
        command.append("--ppt-master-visual-review")
    if getattr(args, "skip_install_check", False):
        command.append("--skip-install-check")
    reinjection = " ".join(shlex.quote(part) for part in command)

    command_dir = out / "commands" / "style-gallery"
    command_dir.mkdir(parents=True, exist_ok=True)
    command_path = command_dir / "ppt-master-confirm-ui.md"
    command_path.write_text(
        f"""# PPT Master Native Style Gate

PPT Master owns style selection through its mandatory three-stage Strategist Confirm UI. Humanize must not duplicate its catalog or render speculative covers before that gate.

Run the normal Humanize brief command:

```bash
{reinjection}
```

Then hand `ppt-master-production-prompt.md` to the downstream agent. It must open PPT Master's Stage 1 direction page, where `visual_style` options have native preview SVGs. The user's confirmed value is authoritative; continue through Stage 2 and Stage 3 before any slide generation.
""",
        encoding="utf-8",
    )
    plan = {
        "version": VERSION,
        "generated_at": now_iso(),
        "title": args.title,
        "source": str(source_path),
        "language": language,
        "primary_renderer": "ppt-master",
        "mode": "downstream-confirm-ui",
        "picker": None,
        "command_file": "commands/style-gallery/ppt-master-confirm-ui.md",
        "candidate_source": "PPT Master Stage 1 visual_style catalog and native preview SVGs",
        "reinjection_command": reinjection,
        "next_step": "Run reinjection_command, then use PPT Master's mandatory three-stage Confirm UI.",
    }
    plan_path = out / "style_gallery_plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(
        {
            "ok": True,
            "stopped_at": "ppt-master-style-gate",
            "primary_renderer": "ppt-master",
            "gallery_plan": str(plan_path),
            "command_file": str(command_path),
            "next_step": plan["next_step"],
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


def run_style_gallery_mode(args):
    """--style-gallery: emit ≥4 cover-style candidates and a picker, then stop.

    The gate before the outline. Writes per-candidate cover-only render
    commands, a zero-dependency style_gallery.html picker, and
    style_gallery_plan.json. No outline, no brief, no QA. Humanize never
    renders the covers — downstream does, one cover each.
    """
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    try:
        if getattr(args, "research_md", None):
            research_path = Path(args.research_md).expanduser().resolve()
            if not research_path.exists():
                sys.stderr.write(f"--research-md path not found: {research_path}\n")
                return 2
            source_path, text, segments = read_source(str(research_path))
        else:
            if not args.source:
                sys.stderr.write("--source (or --research-md) is required for --style-gallery\n")
                return 2
            source_path = Path(args.source).expanduser().resolve()
            if not source_path.exists():
                sys.stderr.write(f"--source path not found: {source_path}\n")
                return 2
            source_path, text, segments = read_source(str(source_path))
    except FileNotFoundError as e:
        sys.stderr.write(f"Source not found: {e}\n")
        return 2

    language = detect_language(text)
    primary, _routes = choose_routes(args, source_path, text, language)

    if primary == "ppt-master":
        return run_ppt_master_style_gate_mode(args, source_path, language)

    pool = STYLE_GALLERY_CANDIDATES.get(primary)
    if not pool:
        sys.stderr.write(
            f"--style-gallery has no candidate set for renderer '{primary}'. "
            f"Supported: {', '.join(sorted(STYLE_GALLERY_CANDIDATES))}. "
            f"Pass --renderer to one of those.\n"
        )
        return 2

    # Minimum 4 covers (the architecture decision). --gallery-count can ask
    # for more, capped at the candidates defined for this renderer.
    requested = max(4, getattr(args, "gallery_count", None) or 4)
    count = min(requested, len(pool))
    candidates = pool[:count]

    plan = build_slide_plan(args.title, text, segments, primary)
    cover_slide = plan[0] if plan else {"title": args.title, "visible_content": []}

    base_command = _style_gallery_base_command(args, source_path)

    cmd_dir = out / "commands" / "style-gallery"
    cmd_dir.mkdir(parents=True, exist_ok=True)
    plan_entries = []
    for c in candidates:
        (out / "outputs" / "style-gallery" / c["id"]).mkdir(parents=True, exist_ok=True)
        reinjection = _reinjection_command(base_command, c)
        cmd_md = _style_gallery_cover_command_md(
            c, cover_slide, args.title, source_path, reinjection
        )
        (cmd_dir / f"{c['id']}.md").write_text(cmd_md, encoding="utf-8")
        plan_entries.append({
            "id": c["id"],
            "label": c["label"],
            "description": c["description"],
            "cli": c["cli"],
            "command_file": f"commands/style-gallery/{c['id']}.md",
            "cover_html": f"outputs/style-gallery/{c['id']}/cover.html",
            "cover_png": f"outputs/style-gallery/{c['id']}/cover.png",
            "reinjection_command": reinjection,
        })

    gallery_html = _render_style_gallery_html(
        args.title, primary, candidates, str(source_path), base_command
    )
    gallery_path = out / "style_gallery.html"
    gallery_path.write_text(gallery_html, encoding="utf-8")

    gallery_plan = {
        "version": VERSION,
        "generated_at": now_iso(),
        "title": args.title,
        "source": str(source_path),
        "language": language,
        "primary_renderer": primary,
        "gallery_count": len(candidates),
        "picker": "style_gallery.html",
        "candidates": plan_entries,
        "next_step": (
            "Render each cover via its command in commands/style-gallery/, open "
            "style_gallery.html to pick, then run the chosen candidate's "
            "reinjection_command to resume the outline → brief flow."
        ),
    }
    plan_path = out / "style_gallery_plan.json"
    plan_path.write_text(
        json.dumps(gallery_plan, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps(
        {
            "ok": True,
            "stopped_at": "style-gallery",
            "primary_renderer": primary,
            "gallery_count": len(candidates),
            "picker": str(gallery_path),
            "gallery_plan": str(plan_path),
            "candidates": [c["id"] for c in candidates],
            "next_step": (
                "Render each cover (commands/style-gallery/<id>.md), open "
                "style_gallery.html, pick one, then run its reinjection_command."
            ),
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


def run_preview_outline_mode(args):
    """--preview-outline: write outline-preview.md and stop. No brief, no QA."""
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    try:
        if getattr(args, "research_md", None):
            research_path = Path(args.research_md).expanduser().resolve()
            if not research_path.exists():
                sys.stderr.write(f"--research-md path not found: {research_path}\n")
                return 2
            source_path, text, segments = read_source(str(research_path))
        else:
            if not args.source:
                sys.stderr.write("--source (or --research-md) is required for --preview-outline\n")
                return 2
            source_path = Path(args.source).expanduser().resolve()
            if not source_path.exists():
                sys.stderr.write(f"--source path not found: {source_path}\n")
                return 2
            source_path, text, segments = read_source(str(source_path))
    except FileNotFoundError as e:
        sys.stderr.write(f"Source not found: {e}\n")
        return 2
    language = detect_language(text)
    plan = build_slide_plan(args.title, text, segments, args.renderer)

    style = getattr(args, "guizang_style", None) or "A"
    theme = getattr(args, "guizang_theme", None)
    accent = getattr(args, "guizang_accent", None)

    outline_md = _format_outline_preview(
        title=args.title,
        plan=plan,
        source_path=source_path,
        language=language,
        style=style,
        theme=theme,
        accent=accent,
    )
    outline_path = out / "outline-preview.md"
    outline_path.write_text(outline_md, encoding="utf-8")

    print(json.dumps(
        {
            "ok": True,
            "stopped_at": "preview-outline",
            "outline_path": str(outline_path),
            "slide_count": len(plan),
            "next_step": "Review outline-preview.md. Re-run with --confirm-outline to write the production prompt.",
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


def run_confirm_outline_mode(args):
    """--confirm-outline: read outline-preview.md and validate freshness.

    Writes preview-confirmed.json with the confirmation timestamp.
    The brief is then written by re-running without --confirm-outline.
    """
    out = Path(args.out).expanduser().resolve()
    outline_path = out / "outline-preview.md"
    if not outline_path.exists():
        sys.stderr.write(
            f"outline-preview.md not found at {outline_path}. "
            f"Re-run with --preview-outline first.\n"
        )
        return 2

    # Mtime check: source must not be newer than the outline
    if getattr(args, "research_md", None):
        source_path = Path(args.research_md).expanduser().resolve()
    else:
        source_path = Path(args.source).expanduser().resolve()
    if not source_path.exists():
        sys.stderr.write(f"Source not found: {source_path}\n")
        return 2
    if source_path.stat().st_mtime > outline_path.stat().st_mtime:
        sys.stderr.write(
            f"Source {source_path} was modified after outline-preview.md was written. "
            f"Re-run with --preview-outline to refresh.\n"
        )
        return 2

    confirmed_marker = out / "preview-confirmed.json"
    confirmed_marker.write_text(json.dumps(
        {
            "confirmed_at": now_iso(),
            "outline_path": str(outline_path),
            "source_path": str(source_path),
            "next_step": "Re-run the same command WITHOUT --confirm-outline to write the production prompt.",
        },
        ensure_ascii=False,
        indent=2,
    ), encoding="utf-8")

    print(json.dumps(
        {
            "ok": True,
            "stopped_at": "confirm-outline",
            "outline_path": str(outline_path),
            "confirmed_marker": str(confirmed_marker),
            "next_step": "Re-run the same command WITHOUT --confirm-outline to write the production prompt.",
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


def main():
    args = parse_args()

    if args.qa_from:
        return run_qa_mode(args)

    if args.ppt_master_template:
        template_path = Path(args.ppt_master_template).expanduser().resolve()
        if args.renderer not in {"auto", "ppt-master"}:
            sys.stderr.write("--ppt-master-template conflicts with a non-PPT-Master --renderer.\n")
            return 2
        if not template_path.exists() or not template_path.is_file() or template_path.suffix.lower() != ".pptx":
            sys.stderr.write(f"--ppt-master-template must point to an existing .pptx file: {template_path}\n")
            return 2
        args.ppt_master_template = str(template_path)

    if args.ppt_master_repo:
        repo_path = Path(args.ppt_master_repo).expanduser().resolve()
        if not (repo_path / "skills" / "ppt-master" / "SKILL.md").exists():
            sys.stderr.write(
                f"--ppt-master-repo must contain skills/ppt-master/SKILL.md: {repo_path}\n"
            )
            return 2
        args.ppt_master_repo = str(repo_path)

    if args.ppt_master_python:
        try:
            args.ppt_master_python, _ = resolve_ppt_master_python(args.ppt_master_python)
        except ValueError as exc:
            sys.stderr.write(f"{exc}\n")
            return 2

    if not (args.title and (args.source or getattr(args, "research_md", None))):
        sys.stderr.write(
            "--title plus (--source or --research-md) are required for brief mode, "
            "or pass --qa-from for QA mode\n"
        )
        return 2

    # v0.9: --style-gallery is the cover-style gate that precedes the outline.
    # It emits cover-style candidates + a picker, then stops. Checked first so
    # it wins over --preview-outline (you pick a style, then preview the outline).
    if getattr(args, "style_gallery", False):
        return run_style_gallery_mode(args)

    # v0.6.6: --preview-outline writes outline-preview.md and stops.
    # The user reviews the outline, then re-runs with --confirm-outline.
    if getattr(args, "preview_outline", False) and not getattr(args, "confirm_outline", False):
        return run_preview_outline_mode(args)

    # v0.6.6: --confirm-outline reads outline-preview.md and resumes the
    # brief write. Refuses if outline is missing or stale.
    if getattr(args, "confirm_outline", False):
        if getattr(args, "preview_outline", False):
            sys.stderr.write("--preview-outline and --confirm-outline are mutually exclusive\n")
            return 2
        return run_confirm_outline_mode(args)

    out = Path(args.out).expanduser().resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    # v0.6.5: if --research-md is provided, it takes priority over --source.
    # The HV research document becomes the authoritative source. The brief
    # writer does not re-parse raw material.
    if getattr(args, "research_md", None):
        research_path = Path(args.research_md).expanduser().resolve()
        if not research_path.exists():
            sys.stderr.write(f"--research-md path not found: {research_path}\n")
            return 2
        source_path, text, segments = read_source(str(research_path))
    else:
        source_path, text, segments = read_source(args.source)
    language = detect_language(text)
    preview_count = resolve_preview_count(language, args.preview_count)
    registry = load_registry()
    primary, routes = choose_routes(args, source_path, text, language)
    if primary == "beautiful-html-templates" and not args.selected_template:
        for route in routes:
            if route["id"] == "beautiful-html-templates":
                route["style_gate"] = "theme-first"
                route["preview_count"] = preview_count
    plan = build_slide_plan(args.title, text, segments, primary)

    write_contracts(out, args.title, source_path, text, plan, language)
    write_style_brief(out, primary, language, preview_count=preview_count)
    copy_registry_snapshot(out)
    router_plan = write_router_plan(out, args.title, source_path, primary, routes, registry)
    write_commands(out, router_plan)

    rendered = None
    render_issues = []
    # v0.6.4: Humanize PPT no longer imitates any downstream renderer.
    # It writes a production brief; the named skill renders natively.
    if not args.no_render:
        if primary == "guizang":
            # v0.6.5: 9 combos = Style A (5 themes) + Style B (4 accents).
            # Mutex: A requires --guizang-theme, B requires --guizang-accent.
            style = getattr(args, "guizang_style", None) or "A"
            theme = getattr(args, "guizang_theme", None)
            accent = getattr(args, "guizang_accent", None)
            if style == "A" and not theme:
                sys.stderr.write(
                    f"[humanize-ppt v{VERSION}] --guizang-style=A requires --guizang-theme. "
                    "Choose one of: ink-classic, indigo-porcelain, forest-ink, kraft-paper, dune. "
                    "Defaulting to ink-classic.\n"
                )
                theme = "ink-classic"
            if style == "B" and not accent:
                sys.stderr.write(
                    f"[humanize-ppt v{VERSION}] --guizang-style=B requires --guizang-accent. "
                    "Choose one of: ikb, lemon-yellow, lemon-green, safety-orange. "
                    "Defaulting to ikb.\n"
                )
                accent = "ikb"
            if style == "A" and accent:
                sys.stderr.write(
                    f"[humanize-ppt v{VERSION}] --guizang-style=A ignores --guizang-accent={accent}.\n"
                )
            if style == "B" and theme:
                sys.stderr.write(
                    f"[humanize-ppt v{VERSION}] --guizang-style=B ignores --guizang-theme={theme}.\n"
                )
            # v0.6.5: install self-check. Warn-only; the brief still ships.
            check_downstream_install(
                "guizang-ppt-skill",
                skip=getattr(args, "skip_install_check", False),
            )
            brief_result = write_guizang_production_brief(
                out,
                title=args.title,
                plan=plan,
                source=source_path,
                language=language,
                style=style,
                theme=theme,
                accent=accent,
            )
            for route in router_plan["routes"]:
                if route["id"] == "guizang":
                    route["status"] = brief_result["status"]
                    route["actual_output"] = brief_result["prompt"]
                    if style == "A":
                        route["theme"] = theme
                    else:
                        route["accent"] = accent
        elif primary == "frontend-slides":
            check_downstream_install(
                "frontend-slides",
                skip=getattr(args, "skip_install_check", False),
            )
            brief_result = write_frontend_slides_production_brief(
                out,
                title=args.title,
                plan=plan,
                source=source_path,
                language=language,
            )
            for route in router_plan["routes"]:
                if route["id"] == "frontend-slides":
                    route["status"] = brief_result["status"]
                    route["actual_output"] = brief_result["prompt"]
        elif primary == "beautiful-html-templates":
            check_downstream_install(
                "beautiful-html-templates",
                skip=getattr(args, "skip_install_check", False),
            )
            brief_result = write_beautiful_html_templates_production_brief(
                out,
                title=args.title,
                plan=plan,
                source=source_path,
                language=language,
            )
            for route in router_plan["routes"]:
                if route["id"] == "beautiful-html-templates":
                    route["status"] = brief_result["status"]
                    route["actual_output"] = brief_result["prompt"]
                    route["style_gate"] = "theme-first"
                    route["preview_count"] = preview_count
        elif primary == "ppt-master":
            extra_paths = []
            if args.ppt_master_repo:
                extra_paths.append(
                    Path(args.ppt_master_repo) / "skills" / "ppt-master" / "SKILL.md"
                )
            check_downstream_install(
                "ppt-master",
                skip=getattr(args, "skip_install_check", False),
                extra_paths=extra_paths,
            )
            brief_result = write_ppt_master_production_brief(
                out,
                title=args.title,
                plan=plan,
                source=source_path,
                language=language,
                template=args.ppt_master_template,
                canvas_format=args.ppt_master_format,
                project_name=args.ppt_master_project_name,
                visual_style=args.ppt_master_visual_style,
                native_objects=args.ppt_master_native_objects,
                transition=args.ppt_master_transition,
                animation=args.ppt_master_animation,
                animation_trigger=args.ppt_master_animation_trigger,
                visual_review=args.ppt_master_visual_review,
                repo_hint=args.ppt_master_repo,
                native_presenter=args.presenter,
                python_executable=args.ppt_master_python,
            )
            for route in router_plan["routes"]:
                if route["id"] == "ppt-master":
                    route["status"] = brief_result["status"]
                    route["actual_output"] = brief_result["prompt"]
                    route["source_contract"] = brief_result["source_contract"]
                    route["ppt_master_route"] = brief_result["route"]
                    route["native_objects"] = args.ppt_master_native_objects
                    route["transition"] = args.ppt_master_transition
                    route["native_presenter"] = bool(args.presenter)
                    route["python"] = brief_result["python"]
                    route["python_version"] = brief_result["python_version"]

    final_deck = None  # v0.6.4: Humanize does not own a rendered deck anymore.

    if args.presenter_adapter:
        presenter_result = write_presenter_adapter(out, args.title, plan, final_deck)
        if presenter_result.get("status") != "rendered" and not any("presenter adapter:" in issue for issue in render_issues):
            render_issues.append(f"presenter adapter: {presenter_result.get('status')} — {presenter_result.get('message')}")
        for route in router_plan["routes"]:
            if route["id"] == "presenter-adapter":
                route["status"] = presenter_result.get("status")
                route["actual_output"] = presenter_result.get("presenter")
                route["presenter_shell"] = presenter_result.get("presenter_shell")
                route["manifest"] = presenter_result.get("manifest")

    if args.export_adapter:
        if primary == "ppt-master":
            export_result = {
                "status": "delegated",
                "package": str(out / "outputs" / "ppt-master-rendered" / "deck.pptx"),
                "manifest": str(out / "outputs" / "ppt-master-rendered" / "render_manifest.json"),
                "message": "PPT Master owns native PPTX export; Humanize does not create an HTML/PDF export package.",
            }
        elif final_deck and final_deck.exists():
            export_result = write_export_adapter(out, args.title, final_deck, len(plan))
        else:
            export_result = {"status": "missing-deck", "message": "export adapter requires a rendered final deck; use --selected-template or a renderer that emits outputs/<renderer>/index.html."}
            render_issues.append(f"export adapter: {export_result['status']} — {export_result['message']}")
        if export_result.get("status") not in {"packaged", "delegated"} and not any("export adapter:" in issue for issue in render_issues):
            render_issues.append(f"export adapter: {export_result.get('status')} — {export_result.get('message')}")
        for route in router_plan["routes"]:
            if route["id"] == "export-adapter":
                route["status"] = export_result.get("status")
                route["actual_output"] = export_result.get("package")
                route["manifest"] = export_result.get("manifest")

    (out / "router_plan.json").write_text(json.dumps(router_plan, ensure_ascii=False, indent=2), encoding="utf-8")
    write_manifest(out, args.title, source_path, primary, router_plan["routes"], qa_passed=False)
    qa_passed = write_qa(out, plan, render_issues=render_issues)
    for route in router_plan["routes"]:
        if route["id"] == "qa":
            route["status"] = "pass" if qa_passed else "needs-fix"
            route["actual_output"] = str(out / "outputs" / "qa" / "qa_report.md")
    (out / "router_plan.json").write_text(json.dumps(router_plan, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest = write_manifest(out, args.title, source_path, primary, router_plan["routes"], qa_passed=qa_passed)
    print(
        json.dumps(
            {
                "ok": qa_passed,
                "version": VERSION,
                "out": str(out),
                "primary_renderer": primary,
                "router_plan": str(out / "router_plan.json"),
                "run_manifest": str(out / "run_manifest.json"),
                "rendered": str(rendered) if rendered else None,
                "qa_report": str(out / "outputs" / "qa" / "qa_report.md"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
