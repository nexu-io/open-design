"""Pure release-card rendering. No product imports or network operations."""
from __future__ import annotations

import math

PLATFORM_LABELS = {"mac_arm64": "macOS (Apple Silicon)", "mac_x64": "macOS (Intel)", "win_x64": "Windows", "linux_x64": "Linux"}
GLYPH = dict(pending="⏳", running="⏳", success="✅", failure="❌", cancelled="⚠️", skipped="⚪️", never_started="🚨", unknown="⏳")
BUILD_TEXT = dict(pending="排队中", running="构建中", success="已发布", failure="构建失败", cancelled="已取消", skipped="本次未构建", never_started="未触发", unknown="状态未知")
CHECK_TEXT = dict(pending="排队中", running="运行中", success="通过", failure="未通过", cancelled="已取消", skipped="未运行", never_started="未触发（应运行，但没有被调起）", unknown="状态未知")


def terminal(status):
    return status in {"success", "failure", "cancelled", "skipped", "never_started"}


def undiscovered(found, completed, expired):
    return "skipped" if completed else "pending" if found or not expired else "never_started"


def text(content):
    return {"tag": "div", "text": {"tag": "lark_md", "content": content}}


def card(title, color, elements):
    return {"config": {"wide_screen_mode": True}, "header": {"template": color, "title": {"tag": "plain_text", "content": title}}, "elements": elements}


def note(content):
    return {"tag": "note", "elements": [{"tag": "lark_md", "content": content}]}


def downloads(items):
    ready = [(label, url) for label, url in items if url]
    return ([{"tag": "hr"}, {"tag": "action", "actions": [
        {"tag": "button", "text": {"tag": "plain_text", "content": f"下载 {label}"}, "type": "primary" if i == 0 else "default", "url": url}
        for i, (label, url) in enumerate(ready)]}] if ready else [])


def fields(branch, commit, repo):
    values = []
    if branch:
        values.append({"is_short": True, "text": {"tag": "lark_md", "content": f"**分支**\n{branch}"}})
    if commit:
        link = f"[`{commit[:7]}`](https://github.com/{repo}/commit/{commit})" if repo else f"`{commit[:7]}`"
        values.append({"is_short": True, "text": {"tag": "lark_md", "content": f"**提交**\n{link}"}})
    return values


def changelog_lines(raw):
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    return {"lines": lines[:30], "total": len(lines), "truncated": len(lines) > 30}


def changelog(state, *, compact=False):
    channel, changes = state["channelLabel"], state["changelog"]
    if not state["previousCommit"]:
        return f"首个 {channel} 包{',' if compact else '，'}无上个版本可对比。"
    if not changes["lines"]:
        return f"与上个 {channel} 包之间没有新增提交。"
    result = "\n".join("- " + line for line in changes["lines"])
    if changes["truncated"]:
        left, right = ("(", ")") if compact else ("（", "）")
        result += f"\n- …还有 {changes['total'] - len(changes['lines'])} 条提交{left}共 {changes['total']} 条{right}"
    return result


def duration(ms):
    seconds = max(0, math.floor(ms / 1000 + .5))
    h, m, s = seconds // 3600, seconds // 60 % 60, seconds % 60
    return f"{h}h{m:02}m{s:02}s" if h else f"{m}m{s:02}s" if m else f"{s}s"


def elapsed(ms):
    minutes = max(0, math.floor(ms / 60000))
    return "<1m" if minutes < 1 else f"{minutes}m" if minutes < 60 else f"{minutes // 60}h{minutes % 60:02}m"


def lane_duration(status, timing, now):
    start, end = timing.get("startedAt"), timing.get("completedAt")
    if status in {"pending", "unknown", "skipped", "never_started"} or start is None:
        return ""
    if status == "running":
        return "已用 " + elapsed(now - start)
    return "" if end is None else "用时 " + duration(end - start)


def render_progress(state):
    platforms, tests = state["platforms"], state["tests"]
    published = any(p["build"] == "success" for p in platforms)
    expected = [p for p in platforms if p["build"] != "skipped"]
    all_failed = bool(expected) and all(terminal(p["build"]) and p["build"] != "success" for p in expected)
    statuses = [value for p in platforms for value in (p["build"], p["smoke"])] + [t["status"] for t in tests]
    failures, missing = sum(s in {"failure", "cancelled"} for s in statuses), statuses.count("never_started")
    name = f"Open Design {state['channelLabel']} {state['version']}"
    if not published:
        color = "red" if all_failed or state["timedOut"] else "blue"
        title = f"🚨 {name} · 全部平台构建失败" if all_failed else f"🚨 {name} · 等待产物超时" if state["timedOut"] else f"🚀 {name} · 构建中"
    else:
        color = "orange" if failures or missing else "green" if state["finished"] and not state["timedOut"] else "blue"
        suffix = f"{failures} 项未通过、{missing} 项未触发" if failures and missing else f"{failures} 项未通过" if failures else f"{missing} 项未触发" if missing else ""
        title = f"⚠️ {name} · {suffix}" if suffix else f"🚀 {name} · 进行中" if not state["finished"] or state["timedOut"] else f"🚀 {name}"
    identity = fields(state["branch"], state["commit"], state["repo"])
    elements = [{"tag": "div", "fields": identity}] if identity else []
    rows = []
    for p in platforms:
        timing = lane_duration(p["build"], p["timing"], state["now"])
        rows.append(f"{GLYPH[p['build']]} {p['label']} · {BUILD_TEXT[p['build']]}" + (f" · {timing}" if timing else ""))
    elements.append(text("**平台产物**\n" + "\n".join(rows)))
    checks = [(t["label"], t["status"]) for t in tests] if state["expectTests"] else []
    if state["expectSmoke"]:
        checks += [(p["label"] + " packaged smoke", p["smoke"]) for p in platforms if p["smoke"] != "skipped"]
    if checks:
        elements.append(text("**验证**（不阻塞发布）\n" + "\n".join(f"{GLYPH[s]} {label} · {CHECK_TEXT[s]}" for label, s in checks)))
    elements.append(text(f"**自上个 {state['channelLabel']} 新增提交**\n" + changelog(state)))
    if state["timedOut"]:
        elements.append(text("**注意**\n看板任务已达到时间上限，上面的状态可能不是最终结果；点下方链接看运行本身。"))
    elements += downloads((p["label"], p["downloadUrl"]) for p in platforms)
    footer = []
    if state["runCreatedAt"] is not None:
        footer.append("本轮总耗时 " + duration(state["publishCompletedAt"] - state["runCreatedAt"]) if state["publishCompletedAt"] is not None else "本轮已用 " + elapsed(state["now"] - state["runCreatedAt"]))
    footer += [f"[{label}]({state[key]})" for label, key in [("打包运行", "originRunUrl"), ("代码测试", "testsRunUrl"), ("包 smoke", "smokeRunUrl")] if state[key]]
    if footer:
        elements.append(note(" · ".join(footer)))
    return card(title, color, elements)
