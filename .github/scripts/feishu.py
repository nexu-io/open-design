"""Release notifications: observe receipts, never authorize release or cache reuse."""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

from lib.github import api_json, append_summary, download_artifact, run_artifacts, unique_artifact


def decode_bot(value):
    if not value.strip():
        return None
    try:
        parts = json.loads(value)
        if not isinstance(parts, list) or len(parts) != 3 or parts[0] != "v1" or not all(isinstance(x, str) for x in parts):
            raise ValueError()
        url = urllib.parse.urlsplit(parts[1])
        if (url.scheme != "https" or url.hostname not in {"open.feishu.cn", "open.larksuite.com"}
                or url.username or url.password or url.query or url.fragment or url.port not in {None, 443}
                or not re.fullmatch(r"/open-apis/bot/v2/hook/[A-Za-z0-9_-]+", url.path)):
            raise ValueError()
        return parts[1], parts[2]
    except (ValueError, TypeError):
        raise ValueError('Invalid Feishu bot; expected ["v1","https://.../hook/...","sign-secret"]') from None


def signed_envelope(card, secret, timestamp=None):
    envelope = {"msg_type": "interactive", "card": card}
    if secret:
        timestamp = str(int(time.time()) if timestamp is None else timestamp)
        signature = hmac.new(f"{timestamp}\n{secret}".encode(), b"", hashlib.sha256).digest()
        envelope.update(timestamp=timestamp, sign=base64.b64encode(signature).decode())
    return envelope


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def send(card, bot, *, sleep=time.sleep, opener=None):
    opener = opener or urllib.request.build_opener(NoRedirect())
    for attempt in range(4):
        request = urllib.request.Request(bot[0], data=json.dumps(signed_envelope(card, bot[1])).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
        retry = False
        try:
            with opener.open(request, timeout=15) as response:
                result = json.load(response)
            code = result.get("code", result.get("StatusCode"))
            if code == 0:
                return
            retry = code == 9499
        except urllib.error.HTTPError as error:
            retry = error.code == 429 or error.code >= 500
        except (OSError, urllib.error.URLError):
            retry = True
        except (ValueError, AttributeError):
            pass
        if not retry or attempt == 3:
            # Neither webhook paths nor server responses are safe log material.
            raise RuntimeError("Feishu delivery failed (response details redacted)") from None
        sleep(2 ** attempt)


def read_evidence(repository, run_id, declarations, warnings):
    """Only small, explicitly named JSON members; never extract artifact trees."""
    evidence = {}
    try:
        inventory = run_artifacts(repository, run_id)
    except Exception:
        warnings.append("Artifact inventory unavailable")
        return evidence
    with tempfile.TemporaryDirectory(prefix="release-notify-") as directory:
        for name, members in declarations:
            try:
                artifact = unique_artifact(inventory, name)
                if not artifact or artifact.get("size_in_bytes", 0) > 10 * 1024 * 1024:
                    raise ValueError("missing or oversized artifact")
                path = Path(directory) / "evidence.zip"
                download_artifact(repository, artifact["id"], path)
                with zipfile.ZipFile(path) as archive:
                    for member in members:
                        matches = [entry for entry in archive.infolist() if entry.filename == member]
                        if len(matches) != 1 or matches[0].file_size > 1024 * 1024:
                            continue
                        value = json.loads(archive.read(matches[0]))
                        if isinstance(value, dict):
                            evidence[member] = value
            except Exception:
                warnings.append(f"Evidence unavailable: {name}")
    return evidence


def elapsed(start, end):
    if not start or not end:
        return "—"
    seconds = max(0, int((datetime.fromisoformat(end.replace("Z", "+00:00"))
                          - datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds()))
    return f"{seconds // 60}m {seconds % 60}s"


def build_report(channel, version, commit, evidence, jobs, results, context, warnings):
    def bound(name, operation):
        value = evidence.get(name, {})
        return (value.get("operation") == operation and value.get("channel") == channel
                and value.get("releaseVersion") == version and value.get("sourceCommit") == commit)

    published = bound("publish-receipt.json", "exact.publish")
    activated = bound("activate-receipt.json", "exact.activate")
    state = "activated" if activated else "published" if published else "unconfirmed"
    lines = [f"发布状态：{ {'activated': '已激活', 'published': '已发布，激活未确认', 'unconfirmed': '未确认'}[state]}",
             f"分支：{context['branch']} · 提交：{commit[:10]}",
             f"触发人：{context['actor']} · 执行轮次：{context['attempt']}",
             "运行结果：" + ", ".join(f"{name}={result['result']}" for name, result in results.items())]
    plan = evidence.get("summary.json", {})
    if plan.get("operation") == "workflow.plan.summary":
        workloads = plan.get("workloads", [])
        lines.append(f"Plan：{sum(w.get('hit') is True for w in workloads)}/{len(workloads)} 命中")
        lines.extend(f"执行：{w['name']} ({w['reason']})" for w in workloads if w.get("run"))
    else:
        lines.append("Plan：摘要不可用")
    for job in jobs:
        if job.get("status") != "completed":
            continue
        lines.append(f"{job['name']}：{job.get('conclusion')} · {elapsed(job.get('started_at'), job.get('completed_at'))}")
        for step in job.get("steps", []):
            if step.get("conclusion") in {"failure", "timed_out", "cancelled"}:
                lines.append(f"  失败步骤：{step['name']} · {job.get('html_url', '')}")
    lines.extend(f"变更：{message}" for message in context.get("changes", []))
    lines.extend(f"提示：{warning}" for warning in warnings)
    links = [{"tag": "button", "text": {"tag": "plain_text", "content": "查看运行"}, "url": context["run_url"]}]
    if published:
        for item in evidence["publish-receipt.json"].get("requiredAcceptances", []):
            url = item.get("artifact", {}).get("url", "")
            parsed = urllib.parse.urlsplit(url)
            if parsed.scheme == "https" and parsed.netloc and not parsed.username and not parsed.password:
                links.append({"tag": "button", "text": {"tag": "plain_text", "content": f"{item['shell']['type']} {item['target']}"}, "url": url})
    success = activated and all(value.get("result") in {"success", "skipped"} for value in results.values())
    card = {"config": {"wide_screen_mode": True}, "header": {
        "template": "green" if success else "orange" if published or activated else "red",
        "title": {"tag": "plain_text", "content": f"{channel} {version}"}},
        "elements": [{"tag": "div", "text": {"tag": "plain_text", "content": "\n".join(lines)[:24000]}},
                     {"tag": "action", "actions": links}]}
    return {"schemaVersion": 1, "operation": "release.notification.report", "state": state, "card": card, "warnings": warnings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--channel", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--plan-artifact", required=True)
    parser.add_argument("--publication-artifact", required=True)
    parser.add_argument("--activation-artifact", required=True)
    parser.add_argument("--baseline-artifact")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"stable|prerelease|[a-z]{3,10}", args.channel) or not re.fullmatch(r"[a-f0-9]{40}", args.commit):
        parser.error("Invalid channel or source SHA")
    repository = os.environ["GITHUB_REPOSITORY"]
    run_id, attempt = int(os.environ["GITHUB_RUN_ID"]), int(os.environ["GITHUB_RUN_ATTEMPT"])
    warnings = []
    declarations = [
        (args.plan_artifact, ["summary.json"]),
        (args.publication_artifact, ["publish-receipt.json"]),
        (args.activation_artifact, ["activate-receipt.json"]),
    ]
    if args.baseline_artifact:
        declarations.append((args.baseline_artifact, ["accepted-baseline.json"]))
    evidence = read_evidence(repository, run_id, declarations, warnings)
    changes = []
    baseline = evidence.get("accepted-baseline.json", {})
    previous = baseline.get("sourceCommit", "") if baseline.get("channel") == args.channel else ""
    try:
        if re.fullmatch(r"[a-f0-9]{40}", previous):
            comparison = api_json(f"/repos/{repository}/compare/{previous}...{args.commit}?per_page=100")
            changes = [commit["commit"]["message"].splitlines()[0] for commit in comparison["commits"][-15:]]
        else:
            commit = api_json(f"/repos/{repository}/commits/{args.commit}")
            changes = [commit["commit"]["message"].splitlines()[0]]
    except Exception:
        warnings.append("Changelog unavailable")
    jobs = []
    try:
        page = 1
        while True:
            batch = api_json(f"/repos/{repository}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100&page={page}")["jobs"]
            jobs.extend(batch)
            if len(batch) < 100:
                break
            page += 1
    except Exception:
        warnings.append("Job timing/details unavailable")
    report = build_report(args.channel, args.version, args.commit, evidence, jobs,
                          json.loads(os.environ.get("RELEASE_JOB_RESULTS", "{}")), {
                              "branch": os.environ.get("GITHUB_REF_NAME", ""),
                              "actor": os.environ.get("GITHUB_TRIGGERING_ACTOR", os.environ.get("GITHUB_ACTOR", "")),
                              "attempt": attempt,
                              "changes": changes,
                              "run_url": f"https://github.com/{repository}/actions/runs/{run_id}/attempts/{attempt}",
                          }, warnings)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    append_summary("### Release notification\n\n" + report["card"]["elements"][0]["text"]["content"])
    bot = decode_bot(os.environ.get("RELEASE_FEISHU_BOT", ""))
    if bot:
        send(report["card"], bot)
        append_summary("\nFeishu: delivered")
    else:
        append_summary("\nFeishu: not configured; report retained")


if __name__ == "__main__":
    main()
