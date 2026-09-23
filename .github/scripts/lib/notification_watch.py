"""Single-writer progressive release observer, independent of product execution."""
from __future__ import annotations

import json
import io
import os
import re
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

from lib.feishu import AppClient
from lib.notification_cards import PLATFORM_LABELS, changelog_lines, render_progress, terminal, undiscovered

BUILD_JOBS = dict(mac_arm64="Build prerelease mac arm64", mac_x64="Build prerelease mac intel x64", win_x64="Build prerelease win x64", linux_x64="Build prerelease linux x64")
SMOKE_JOBS = dict(mac_arm64="Smoke prerelease mac arm64", mac_x64="Smoke prerelease mac intel x64", win_x64="Smoke prerelease win x64", linux_x64="Smoke prerelease linux x64")
TEST_JOBS = [
    ("functional_e2e", "P0 Functional E2E", ("P0 Functional E2E", "UI P0"), "test_functional_e2e"),
    ("e2e_vitest", "E2E Vitest", ("E2E Vitest",), "test_e2e_vitest"),
    ("daemon_unit_tests", "Daemon 单测（4 分片）", ("Daemon tests",), "test_daemon_unit_tests"),
    ("verify", "Verify build（typecheck + guard）", ("Verify build",), "test_verify"),
]


def matches(name, needle):
    return name == needle or name.endswith(" / " + needle) or name.startswith(needle + " / ") or " / " + needle + " / " in name


def family_matches(name, prefixes):
    parts = [re.sub(r"^\[test\]\s+(?:beta|prerelease)\s+", "", part) for part in name.split(" / ")]
    return any(part.startswith(prefix) for part in parts for prefix in prefixes)


def status_of(job):
    status, conclusion = job.get("status"), job.get("conclusion")
    if status in {"queued", "waiting", "pending", "requested"}:
        return "pending"
    if status == "in_progress" or not conclusion:
        return "running"
    return "success" if conclusion in {"success", "neutral"} else conclusion if conclusion in {"skipped", "cancelled"} else "failure"


def epoch(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000
    except (ValueError, AttributeError):
        return None


def timing(job):
    return {"startedAt": epoch((job or {}).get("started_at")), "completedAt": epoch((job or {}).get("completed_at"))}


def rollup(statuses):
    if not statuses:
        return "unknown"
    for status in ["failure", "cancelled", "running", "pending"]:
        if status in statuses:
            return status
    return "skipped" if all(s == "skipped" for s in statuses) else "unknown" if "unknown" in statuses else "success"


class Observer:
    def __init__(self, *, env=os.environ, now=lambda: time.time() * 1000, opener=urllib.request.urlopen):
        self.env, self.now, self.opener = env, now, opener
        self.repo, self.origin, self.version = self.required("GITHUB_REPOSITORY"), self.required("ORIGIN_RUN_ID"), self.required("VERSION")
        self.token = self.get("GH_TOKEN") or self.required("GITHUB_TOKEN")
        self.started = now()
        self.grace = self.number("CARD_DISCOVERY_GRACE_MS", 20 * 60 * 1000)
        self.expect_tests, self.expect_smoke = self.boolean("EXPECT_TESTS"), self.boolean("EXPECT_SMOKE")
        self.validation_location = self.get("VALIDATION_LOCATION", "split")
        if self.validation_location not in {"split", "origin"}:
            raise ValueError(f"unsupported VALIDATION_LOCATION: {self.validation_location}")
        self.verified = set()
        self.plan_hits = None
        self.current = dict(originJobs=[], originRun=None, publish="pending", publishCompletedAt=None, testsRun=None, testsJobs=[], smokeRun=None, smokeJobs=[], publishSucceededAt=None, runCreatedAt=None)

    def get(self, name, default=""):
        return self.env.get(name) or default

    def required(self, name):
        value = self.get(name)
        if not value:
            raise ValueError(f"{name} is required")
        return value

    def number(self, name, default):
        try:
            value = int(self.get(name))
            return value if value > 0 else default
        except ValueError:
            return default

    def boolean(self, name):
        return self.get(name, "true").lower() in {"true", "1", "yes"}

    def github(self, path):
        request = urllib.request.Request(self.get("GITHUB_API_URL", "https://api.github.com").rstrip("/") + path,
            headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {self.token}", "X-GitHub-Api-Version": "2022-11-28"})
        with self.opener(request, timeout=20) as response:
            return json.load(response)

    def github_bytes(self, url):
        request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {self.token}", "X-GitHub-Api-Version": "2022-11-28"})
        with self.opener(request, timeout=20) as response:
            return response.read()

    def load_plan_hits(self, attempt):
        if self.plan_hits is not None:
            return self.plan_hits
        name = f"prerelease-convergence-plan-{self.origin}-{attempt}"
        body = self.github(f"/repos/{self.repo}/actions/runs/{self.origin}/artifacts?name={urllib.parse.quote(name)}&per_page=10")
        artifact = next((item for item in body.get("artifacts", []) if item.get("name") == name and not item.get("expired")), None)
        if artifact is None:
            return None
        archive = self.github_bytes(artifact["archive_download_url"])
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            pending = json.loads(bundle.read("pending-convergence.json"))
        self.plan_hits = {key: bool(value.get("resultHit")) for key, value in pending.get("workloads", {}).items()}
        return self.plan_hits

    def jobs(self, run):
        jobs = []
        for page in range(1, 6):
            batch = self.github(f"/repos/{self.repo}/actions/runs/{run}/jobs?per_page=100&page={page}&filter=latest").get("jobs", [])
            jobs += batch
            if len(batch) < 100:
                break
        return jobs

    def dispatched(self, workflow):
        body = self.github(f"/repos/{self.repo}/actions/workflows/{urllib.parse.quote(workflow, safe='')}/runs?event=workflow_dispatch&per_page=40")
        for run in body.get("workflow_runs", []):
            if f"origin-run {self.origin}" in str(run.get("name", "")):
                return {"id": str(run["id"]), "url": run.get("html_url", ""), "completed": run.get("status") == "completed",
                        "fingerprint": "|".join(str(run.get(key) or "") for key in ["status", "conclusion", "run_attempt", "updated_at"])}
        return None

    def refresh(self, workflow, previous, jobs):
        run = self.dispatched(workflow) or previous
        if run is None or (run == previous and run["completed"]):
            return run, jobs
        return run, self.jobs(run["id"])

    def collect(self):
        before = self.current
        created = before["runCreatedAt"]
        origin_run = before["originRun"]
        try:
            origin_run = self.github(f"/repos/{self.repo}/actions/runs/{self.origin}")
            created = created or epoch(origin_run.get("created_at")) or epoch(origin_run.get("run_started_at"))
            if self.validation_location == "origin":
                self.load_plan_hits(origin_run.get("run_attempt", 1))
        except (OSError, ValueError, KeyError, zipfile.BadZipFile):
            pass
        jobs = self.jobs(self.origin)
        publish_job = next((j for j in jobs if matches(j.get("name", ""), "Publish prerelease release")), None)
        publish = status_of(publish_job) if publish_job else "pending"
        tests, test_jobs = before["testsRun"], before["testsJobs"]
        smoke, smoke_jobs = before["smokeRun"], before["smokeJobs"]
        if self.validation_location == "origin":
            run_ref = {"id": self.origin, "url": origin_run.get("html_url", "") if origin_run else "", "completed": bool(origin_run and origin_run.get("status") == "completed")}
            tests, test_jobs = run_ref, jobs
            smoke, smoke_jobs = run_ref, jobs
        else:
            if self.expect_tests:
                tests, test_jobs = self.refresh(self.get("TESTS_WORKFLOW_FILE", "release-prerelease-tests.yml"), tests, test_jobs)
            if self.expect_smoke and publish == "success":
                smoke, smoke_jobs = self.refresh(self.get("SMOKE_WORKFLOW_FILE", "release-prerelease-smoke.yml"), smoke, smoke_jobs)
        self.current = dict(originJobs=jobs, originRun=origin_run, publish=publish, publishCompletedAt=timing(publish_job)["completedAt"] if terminal(publish) else None,
            testsRun=tests, testsJobs=test_jobs, smokeRun=smoke, smokeJobs=smoke_jobs, runCreatedAt=created,
            publishSucceededAt=before["publishSucceededAt"] if before["publishSucceededAt"] is not None else self.now() if publish == "success" else None)

    def download(self, key):
        origin = self.get("RELEASE_PUBLIC_ORIGIN").rstrip("/")
        if not origin:
            return ""
        basename = dict(mac_arm64="mac-arm64.dmg", mac_x64="mac-x64.dmg", win_x64="win-x64-setup.exe", linux_x64="linux-x64.AppImage")[key]
        url = f"{origin}/{self.get('RELEASE_CHANNEL', 'prerelease')}/versions/{self.version}/open-design-{self.version}-{basename}"
        if url not in self.verified:
            try:
                with self.opener(urllib.request.Request(url, method="HEAD"), timeout=15):
                    self.verified.add(url)
            except (OSError, ValueError):
                return ""
        return url

    def state(self, timed_out):
        w, now = self.current, self.now()
        test_expired = w["testsRun"] is None and now - self.started > self.grace
        smoke_expired = w["smokeRun"] is None and w["publishSucceededAt"] is not None and now - w["publishSucceededAt"] > self.grace
        platforms, tests = [], []
        platform_keys = ["mac_arm64", "mac_x64", "win_x64"]
        if self.validation_location == "split" and any(matches(j.get("name", ""), BUILD_JOBS["linux_x64"]) for j in w["originJobs"]):
            platform_keys.append("linux_x64")
        for key in platform_keys:
            label = PLATFORM_LABELS[key]
            job = next((j for j in w["originJobs"] if matches(j.get("name", ""), BUILD_JOBS[key])), None)
            build = status_of(job) if job else "skipped"
            smoke = "skipped"
            if self.expect_smoke and build == "success" and key != "linux_x64":
                smoke_job = next((j for j in w["smokeJobs"] if matches(j.get("name", ""), SMOKE_JOBS[key])), None)
                if smoke_job:
                    smoke = status_of(smoke_job)
                elif w["smokeRun"] or w["publish"] == "success":
                    smoke = "never_started" if self.validation_location == "origin" and bool((w["smokeRun"] or {}).get("completed")) else undiscovered(w["smokeRun"] is not None, bool((w["smokeRun"] or {}).get("completed")), smoke_expired)
            platforms.append(dict(key=key, label=label, build=build, smoke=smoke, timing=timing(job), downloadUrl=self.download(key) if build == "success" else ""))
        for key, label, prefixes, workload in TEST_JOBS:
            family = [j for j in w["testsJobs"] if family_matches(j.get("name", ""), prefixes)]
            cached = self.validation_location == "origin" and bool((self.plan_hits or {}).get(workload))
            status = "skipped" if not self.expect_tests else rollup([status_of(j) for j in family]) if family else "success" if cached else "never_started" if self.validation_location == "origin" and bool((w["testsRun"] or {}).get("completed")) else undiscovered(w["testsRun"] is not None, bool((w["testsRun"] or {}).get("completed")), test_expired)
            tests.append(dict(key=key, label=label, status=status))
        origin_done = all(terminal(p["build"]) for p in platforms) and terminal(w["publish"])
        tests_done = not self.expect_tests or (test_expired if w["testsRun"] is None else all(terminal(t["status"]) for t in tests))
        smoke_done = not self.expect_smoke or (terminal(w["publish"]) if w["publish"] != "success" else smoke_expired if w["smokeRun"] is None else all(terminal(p["smoke"]) for p in platforms))
        try:
            changes = Path(self.get("CHANGELOG_FILE")).read_text(encoding="utf-8")
        except OSError:
            changes = ""
        return dict(channelLabel=self.get("CHANNEL_LABEL", "Prerelease"), version=self.version, branch=self.get("BRANCH"), commit=self.get("COMMIT"), previousCommit=self.get("PREVIOUS_COMMIT"), repo=self.repo,
            originRunUrl=f"{self.get('GITHUB_SERVER_URL', 'https://github.com').rstrip('/')}/{self.repo}/actions/runs/{self.origin}", testsRunUrl=(w["testsRun"] or {}).get("url", ""), smokeRunUrl=(w["smokeRun"] or {}).get("url", ""),
            platforms=platforms, tests=tests, expectTests=self.expect_tests, expectSmoke=self.expect_smoke, finished=origin_done and tests_done and smoke_done, timedOut=timed_out, now=now,
            runCreatedAt=w["runCreatedAt"], publishCompletedAt=w["publishCompletedAt"], changelog=changelog_lines(changes))


def watch(*, observer=None, client=None, sleep=time.sleep):
    observer = observer or Observer()
    client = client or AppClient(observer.required("FEISHU_APP_ID"), observer.required("FEISHU_APP_SECRET"))
    chat_id = observer.required("FEISHU_RELEASE_CHAT_ID")
    timeout, interval = observer.number("CARD_TIMEOUT_MS", 140 * 60 * 1000), observer.number("CARD_POLL_INTERVAL_MS", 30000)
    message_id, last_rendered, delivered = None, "", False
    while True:
        timed_out = observer.now() - observer.started > timeout
        try:
            observer.collect()
        except (OSError, ValueError, KeyError, TypeError):
            print("::warning::card poll failed; retaining the previous observation")
        state = observer.state(timed_out)
        card = render_progress(state)
        rendered = json.dumps(card, ensure_ascii=False)
        if rendered != last_rendered:
            try:
                if message_id is None:
                    message_id = client.send_card(chat_id, card)
                else:
                    client.patch_card(message_id, card)
                last_rendered, delivered = rendered, True
            except (OSError, RuntimeError, ValueError):
                print("::warning::card delivery failed; retrying on the next observation")
                delivered = False
        if state["finished"] or timed_out:
            if delivered and observer.get("GITHUB_OUTPUT"):
                with open(observer.get("GITHUB_OUTPUT"), "a", encoding="utf-8") as stream:
                    stream.write("card_delivered=true\n")
            elif not delivered:
                print("::warning::final card was not delivered; fallback takes over")
            if timed_out and not state["finished"]:
                print("::warning::card observer reached its time limit")
            return
        sleep(interval / 1000)
