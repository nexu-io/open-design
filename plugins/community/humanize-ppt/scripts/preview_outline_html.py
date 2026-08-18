#!/usr/bin/env python3
"""Humanize PPT v0.9.0 — 演讲大纲预览 (audience state-transfer map).

Reads a `slide_plan.json` (schema: contracts/slide-plan.schema.json) and
writes a **single-file, zero-dependency HTML page**: one row per slide —
slide id → the state the audience walks in with → what the page intends
to do → the state they walk out with — plus a one-line "state arc"
summary at the top.

This is a QA artifact, not a deck. It exists so a human can eyeball the
audience state arc *before* the downstream skill renders, and so the
post-render QA loop has a reference for "what was each page supposed to
do to the audience".

Standalone on purpose: it does not import humanize_ppt_v2, takes only a
slide_plan.json as input, and emits one HTML file. Zero pip deps.

Usage:

    python3 scripts/preview_outline_html.py \
      --slide-plan <out>/slide_plan.json \
      --out <out>/preview-outline.html \
      --title "Deck title"
"""

import argparse
import html as html_mod
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

VERSION = "0.9.0"

# Audience state per AST role: (label, state the audience LEAVES the page in).
# The state a page is ENTERED in is the previous page's leave-state; the
# deck-level initial/desired states match write_contracts() in
# humanize_ppt_v2.py ("信息分散，缺少可讲路径" → "形成清晰判断，并能执行下一步").
DECK_INITIAL_STATE = "信息分散，缺少可讲路径"
DECK_DESIRED_STATE = "形成清晰判断，并能执行下一步"

ROLE_LABELS = {
    "hook": "钩子",
    "context": "背景",
    "tension": "张力",
    "method": "方法",
    "proof": "证据",
    "takeaway": "收束",
}

ROLE_LEAVE_STATE = {
    "hook": "注意力被抓住，愿意继续听",
    "context": "共享背景成立，知道为什么是现在",
    "tension": "意识到旧理解有缺口，想要答案",
    "method": "看到一条可执行的路径",
    "proof": "相信路径真实有效，不是口号",
    "takeaway": "带走一句可复述的判断，知道下一步",
}


def load_plan(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("slides"), list):
        data = data["slides"]
    if not isinstance(data, list) or not data:
        raise ValueError("slide_plan must be a non-empty JSON array of slides")
    return data


def state_rows(plan):
    """Chain per-slide enter/leave audience states from the role sequence."""
    rows = []
    enter = DECK_INITIAL_STATE
    for slide in plan:
        role = slide.get("role", "slide")
        leave = ROLE_LEAVE_STATE.get(role, enter)
        rows.append({
            "slide_id": slide.get("slide_id", "?"),
            "role": role,
            "role_label": ROLE_LABELS.get(role, role),
            "title": slide.get("title", ""),
            "message": slide.get("message", ""),
            "speaker_intent": slide.get("speaker_intent", ""),
            "enter": enter,
            "leave": leave,
        })
        enter = leave
    return rows


def state_arc(rows):
    """Top-line summary: initial state → role beats (deduped) → desired state."""
    beats = []
    for r in rows:
        label = r["role_label"]
        if not beats or beats[-1][0] != label:
            beats.append([label, 1])
        else:
            beats[-1][1] += 1
    return beats


def esc(value):
    return html_mod.escape(str(value or ""), quote=True)


def render_html(title, plan_path, rows, beats):
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    arc_chips = [
        f'<span class="chip chip-state">{esc(DECK_INITIAL_STATE)}</span>'
    ]
    for label, count in beats:
        suffix = f" ×{count}" if count > 1 else ""
        arc_chips.append('<span class="arrow">→</span>')
        arc_chips.append(f'<span class="chip chip-role">{esc(label)}{suffix}</span>')
    arc_chips.append('<span class="arrow">→</span>')
    arc_chips.append(f'<span class="chip chip-state chip-goal">{esc(DECK_DESIRED_STATE)}</span>')

    row_html = []
    for r in rows:
        row_html.append(f"""
      <div class="row">
        <div class="cell cell-id"><span class="sid">{esc(r['slide_id'])}</span><span class="role">{esc(r['role_label'])}</span></div>
        <div class="cell cell-state">{esc(r['enter'])}</div>
        <div class="cell cell-arrow">→</div>
        <div class="cell cell-intent">
          <div class="slide-title">{esc(r['title'])}</div>
          <div class="intent">{esc(r['speaker_intent'])}</div>
        </div>
        <div class="cell cell-arrow">→</div>
        <div class="cell cell-state cell-leave">{esc(r['leave'])}</div>
      </div>""")

    return f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} · 演讲 QA 大纲</title>
<style>
  :root {{
    --ink: #0a0a0b;
    --paper: #f1efea;
    --line: #d8d3c8;
    --muted: #6b6457;
    --accent: #b4452e;
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
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--accent);
    text-transform: uppercase;
    margin-bottom: 12px;
  }}
  h1 {{ font-size: clamp(22px, 3.4vw, 34px); font-weight: 700; margin-bottom: 8px; }}
  .meta {{
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 28px;
  }}
  .arc {{
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 16px 20px;
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    background: rgba(255, 255, 255, 0.55);
    margin-bottom: 36px;
  }}
  .chip {{
    font-size: 13px;
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: #fff;
    white-space: nowrap;
  }}
  .chip-role {{ font-weight: 700; }}
  .chip-state {{ color: var(--muted); }}
  .chip-goal {{ color: var(--accent); border-color: var(--accent); font-weight: 700; }}
  .arrow {{ color: var(--accent); font-weight: 700; }}
  .grid-head, .row {{
    display: grid;
    grid-template-columns: 88px 1fr 24px 1.4fr 24px 1fr;
    gap: 12px;
    align-items: center;
  }}
  .grid-head {{
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--muted);
    text-transform: uppercase;
    padding: 0 4px 10px;
    border-bottom: 2px solid var(--ink);
  }}
  .row {{ padding: 16px 4px; border-bottom: 1px solid var(--line); }}
  .cell-id {{ display: flex; flex-direction: column; gap: 2px; }}
  .sid {{ font-family: "SF Mono", ui-monospace, monospace; font-weight: 700; font-size: 15px; }}
  .role {{ font-size: 12px; color: var(--accent); font-weight: 700; }}
  .cell-state {{ font-size: 13px; color: var(--muted); }}
  .cell-leave {{ color: var(--ink); }}
  .cell-arrow {{ color: var(--accent); font-weight: 700; text-align: center; }}
  .slide-title {{ font-weight: 700; font-size: 15px; }}
  .intent {{ font-size: 13px; color: var(--muted); margin-top: 2px; }}
  footer {{
    margin-top: 32px;
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 11px;
    color: var(--muted);
  }}
  @media (max-width: 760px) {{
    .grid-head {{ display: none; }}
    .row {{ grid-template-columns: 1fr; gap: 4px; }}
    .cell-arrow {{ text-align: left; }}
  }}
</style>
</head>
<body>
  <div class="kicker">Humanize PPT · 演讲 QA 大纲 · Audience State-Transfer Map</div>
  <h1>{esc(title)}</h1>
  <div class="meta">slides: {len(rows)} · plan: {esc(plan_path)} · generated: {esc(generated)} · v{VERSION}</div>

  <div class="arc">{''.join(arc_chips)}</div>

  <div class="grid-head">
    <div>页</div><div>观众进入状态</div><div></div><div>本页意图</div><div></div><div>观众离开状态</div>
  </div>
{''.join(row_html)}

  <footer>
    零依赖单文件 · scripts/preview_outline_html.py 生成 · 这是 QA 大纲，不是 deck —— Humanize 不渲染 PPT，渲染归下游 skill。
  </footer>
</body>
</html>
"""


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Humanize PPT v0.9.0 — render a zero-dependency audience state-transfer map from slide_plan.json"
    )
    ap.add_argument("--slide-plan", required=True, help="Path to slide_plan.json (array of slides).")
    ap.add_argument("--out", required=True, help="Path of the single-file HTML to write.")
    ap.add_argument("--title", default=None, help="Deck title. Defaults to the first slide's title.")
    args = ap.parse_args(argv)

    plan_path = Path(args.slide_plan).expanduser()
    if not plan_path.exists():
        sys.stderr.write(f"--slide-plan not found: {plan_path}\n")
        return 2
    try:
        plan = load_plan(plan_path)
    except (ValueError, json.JSONDecodeError) as exc:
        sys.stderr.write(f"invalid slide_plan: {exc}\n")
        return 2

    title = args.title or plan[0].get("title") or "Untitled deck"
    rows = state_rows(plan)
    beats = state_arc(rows)
    document = render_html(title, str(plan_path), rows, beats)

    out_path = Path(args.out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(document, encoding="utf-8")

    print(json.dumps(
        {"ok": True, "slides": len(rows), "out": str(out_path), "version": VERSION},
        ensure_ascii=False, indent=2,
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
