"""Release notification control plane; Python stdlib only, independent of builds."""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from lib.feishu import send_webhook
from lib.notification_cards import card, changelog, changelog_lines, downloads, fields, note, text


def env(name, default=""):
    return os.environ.get(name) or default


def required(name):
    value = env(name)
    if not value:
        raise ValueError(f"{name} is required")
    return value


def output(key, value):
    path = env("GITHUB_OUTPUT")
    if path:
        delimiter = "notify-" + uuid.uuid4().hex
        with open(path, "a", encoding="utf-8") as stream:
            stream.write(f"{key}<<{delimiter}\n{value}\n{delimiter}\n")


def read_changelog():
    try:
        return changelog_lines(Path(required("CHANGELOG_FILE")).read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return changelog_lines("")


def notice_card():
    elements = [text(required("NOTICE_BODY"))]
    if env("RUN_URL"):
        elements.append(note(f"[GitHub Actions run]({env('RUN_URL')})"))
    return card(required("NOTICE_TITLE"), env("NOTICE_TEMPLATE", "orange"), elements)


def release_card():
    channel, version = env("CHANNEL_LABEL", "Prerelease"), required("VERSION")
    published = bool(env("VERSION_METADATA_URL")) or env("BUILD_STATE", "success") == "success"
    failures = [label for key, label in [("MAC_ARM64_SMOKE_RESULT", "macOS arm64 smoke 失败"), ("WIN_X64_SMOKE_RESULT", "Windows x64 smoke 失败")] if published and env(key) == "failure"]
    partial = env("RELEASE_STATE", "complete") == "partial"
    identity = fields(env("BRANCH"), env("COMMIT"), env("REPO"))
    identity += [{"is_short": True, "text": {"tag": "lark_md", "content": f"**{label}**\n{value}"}} for label, value in [("渠道", channel), ("触发", env("STREAM_LABEL", "构建"))]]
    elements = [{"tag": "div", "fields": identity}]
    if failures:
        elements.append(text("**Smoke 告警**\n" + "\n".join("- " + value for value in failures) + "\n\n产物已继续发布，可通过下方链接下载。"))
    if partial:
        elements.append(text(f"**渠道状态**\n产物已发布并可下载，但未更新 {channel} latest。" + ("\n\n" + env("RELEASE_NOTE") if env("RELEASE_NOTE") else "")))
    changes = changelog({"channelLabel": channel, "previousCommit": env("PREVIOUS_COMMIT"), "changelog": read_changelog()}, compact=True)
    elements.append(text(f"**自上个 {channel} 新增提交**\n{changes}"))
    elements += downloads((label, env(key)) for label, key in [("macOS (Apple Silicon)", "MAC_ARM64_URL"), ("macOS (Intel)", "MAC_INTEL_URL"), ("Windows", "WIN_URL"), ("Linux", "LINUX_URL")])
    if env("RUN_URL"):
        elements.append(note(f"[GitHub Actions run]({env('RUN_URL')})"))
    title = f"Open Design {channel} {version}"
    title = f"⚠️ {title} · 未更新 {channel} latest" if partial else f"⚠️ {title} · {'、'.join(failures)}" if failures else f"🚀 {title}"
    return card(title, "orange" if failures or partial else "blue" if published else "red", elements)


def public_probe(url):
    if not url:
        return "skipped"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=15):
            return "found"
    except urllib.error.HTTPError as error:
        return "missing" if error.code in {403, 404} else "error"
    except (OSError, ValueError):
        return "error"


def pipeline_progress():
    if env("PIPELINE_PROGRESS") in {"running", "finished"}:
        return env("PIPELINE_PROGRESS")
    token = env("GH_TOKEN") or env("GITHUB_TOKEN")
    if not token or not env("GITHUB_REPOSITORY") or not env("ORIGIN_RUN_ID"):
        return "unknown"
    request = urllib.request.Request(f"{env('GITHUB_API_URL', 'https://api.github.com').rstrip('/')}/repos/{env('GITHUB_REPOSITORY')}/actions/runs/{env('ORIGIN_RUN_ID')}", headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return "finished" if json.load(response).get("status") == "completed" else "running"
    except (OSError, ValueError):
        return "unknown"


def fallback():
    stage = required("STAGE")
    if stage == "dispatch":
        silence = None if env("CARD_DISPATCHED").lower() == "true" else "never-dispatched"
    elif stage == "watch":
        silence = "watcher-not-completed" if env("CARD_JOB_RESULT") != "success" else None if env("CARD_DELIVERED").lower() == "true" else "card-not-delivered"
    else:
        raise ValueError("STAGE must be dispatch or watch")
    if silence is None:
        output("reason", "card-lane-healthy")
        output("alert", "false")
        return
    version, channel = env("VERSION"), env("CHANNEL_LABEL", "Prerelease")
    declared = env("VERSION_METADATA_URL")
    origin = env("RELEASE_PUBLIC_ORIGIN").rstrip("/")
    url = declared or (f"{origin}/{env('RELEASE_CHANNEL', 'prerelease')}/versions/{version}/metadata.json" if origin and version else "")
    probe = "found" if declared else public_probe(url)
    publication = "published" if probe == "found" else "absent" if probe == "missing" else "unknown"
    pipeline = "finished" if publication == "published" else pipeline_progress()
    if publication == "published":
        publication_line = "✅ 已发布，包在 R2 上可以下载" + (f" — {url}" if url else "")
    elif publication == "unknown":
        publication_line = "❓ 未知，本条消息发出时无法确认 version metadata" + (f"，请自行核对 {url}" if url else "")
    else:
        publication_line = "⏳ 尚未发布，打包流水线仍在进行" if pipeline == "running" else "❌ 未发布，打包流水线已结束且 version metadata 不存在" if pipeline == "finished" else "❌ 未发布，本条消息发出时 version metadata 不存在"
        if url:
            publication_line += f"；发布后 version metadata 会出现在 {url}"
    silence_text = {"never-dispatched": "进度卡片工作流从未被调起，本次发布没有任何卡片。", "watcher-not-completed": "进度卡片 job 未正常结束，卡片可能缺失，或停在中间状态不再更新。", "card-not-delivered": "进度卡片 job 正常结束，但卡片从未送进群——应用机器人凭证失效或被移出群的典型症状。"}
    def marked(value, missing="未确定"):
        return f"`{value}`" if value else missing
    lines = [f"{channel} 的飞书进度卡片这次没有正常送达。本条是兜底告警，走自定义机器人 webhook 发出，和卡片用的应用机器人不是同一套凭证。", "",
             f"**版本**: {marked(version, '未确定（流水线未产出版本号）')}", f"**分支 / 提交**: {marked(env('BRANCH'))} @ {marked(env('COMMIT')[:10])}",
             f"**发包状态**: {publication_line}", f"**卡片链路**: {silence_text[silence]}"]
    if env("LANE_SUMMARY"):
        lines.append(f"**各 job 结果**: {env('LANE_SUMMARY')}")
    lines += ["", "**去哪看**"]
    lines += [f"- {label}: {env(key)}" for label, key in [("打包流水线", "ORIGIN_RUN_URL"), ("进度卡片 run", "CARD_RUN_URL")] if env(key)]
    # alert is last: a partial output append cannot authorize an empty notice.
    for key, value in {"reason": silence, "title": f"🚨 {channel} 进度卡片失联" + (f" · {version}" if version else ""), "template": "orange" if publication == "published" else "red", "body": "\n".join(lines), "run_url": env("ORIGIN_RUN_URL") or env("CARD_RUN_URL"), "alert": "true"}.items():
        output(key, value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["release", "notice", "fallback", "watch"])
    parser.add_argument("--dry-run", action="store_true", help="Render a card locally without sending it")
    args = parser.parse_args()
    if args.command == "watch":
        from lib.notification_watch import watch
        if args.dry_run:
            parser.error("watch is tested through injected transports, not a live dry run")
        watch()
    elif args.command == "fallback":
        fallback()
    else:
        payload = release_card() if args.command == "release" else notice_card()
        if args.dry_run:
            print(json.dumps(payload, ensure_ascii=False))
        else:
            send_webhook(payload)


if __name__ == "__main__":
    main()
