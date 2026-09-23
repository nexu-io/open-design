#!/usr/bin/env python3
"""Execute a declared release-beta test row without embedding shell in its matrix."""

import os
import subprocess
import sys


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def context() -> tuple[str, str, str]:
    kind = os.environ.get("TEST_KIND", "")
    shard = os.environ.get("TEST_SHARD", "")
    group = os.environ.get("TEST_GROUP", "")
    if kind not in {"web", "daemon", "e2e", "verify", "ui"}:
        raise ValueError(f"unsupported release test kind: {kind}")
    if kind in {"web", "daemon"}:
        count = 2 if kind == "web" else 4
        if shard not in {str(index) for index in range(1, count + 1)} or group:
            raise ValueError(f"invalid {kind} test shard or group")
    elif kind == "ui":
        if not group or shard:
            raise ValueError("UI release test requires a group and no shard")
    elif shard or group:
        raise ValueError(f"{kind} release test cannot select a shard or group")
    return kind, shard, group


def prepare(kind: str) -> None:
    if os.environ.get("TEST_SHARED") == "true":
        sources = os.environ.get("WORKSPACE_SOURCES")
        scratch = os.environ.get("RUNNER_TEMP")
        if not sources or not scratch:
            raise ValueError("shared release test requires resolved sources and runner temp")
        run("pnpm", "exec", "tools-pack", "workspace", "import", "javascript", "--sources", sources,
            "--scratch", f"{scratch}/shared-javascript", "--json")
    else:
        filters = {
            "web": ["@open-design/web^..."],
            "daemon": ["@open-design/daemon^..."],
            "verify": ["@open-design/daemon^...", "@open-design/desktop^..."],
            "e2e": ["@open-design/daemon^...", "@open-design/desktop^...", "@open-design/web^..."],
            "ui": ["@open-design/daemon^...", "@open-design/desktop^...", "@open-design/web^..."],
        }[kind]
        args = ["pnpm"]
        for item in filters:
            args.extend(("--filter", item))
        run(*args, "--workspace-concurrency=4", "--if-present", "run", "build")
        if kind in {"verify", "e2e", "ui"}:
            run("pnpm", "--filter", "@open-design/daemon", "build")
            run("pnpm", "--filter", "@open-design/desktop", "build")
    if kind in {"web", "e2e", "ui"}:
        run("pnpm", "--filter", "@open-design/web", "build:sidecar")


def execute(kind: str, shard: str, group: str) -> None:
    if kind == "web":
        run("pnpm", "--filter", "@open-design/web", "exec", "vitest", "run", "-c", "vitest.config.ts",
            "--maxWorkers=2", f"--shard={shard}/2")
    elif kind == "daemon":
        run("pnpm", "--filter", "@open-design/daemon", "exec", "vitest", "run", "-c", "vitest.config.ts",
            f"--shard={shard}/4")
    elif kind == "e2e":
        run("pnpm", "--filter", "@open-design/e2e", "test")
    elif kind == "verify":
        run("pnpm", "-r", "--workspace-concurrency=4", "--if-present", "run", "typecheck")
        run("pnpm", "guard")
    else:
        run("pnpm", "-C", "e2e", "exec", "tsx", "scripts/playwright.ts", "run-ui-group", group)


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "run", "extra"}:
        raise ValueError("usage: test_unit.py prepare|run|extra")
    kind, shard, group = context()
    if sys.argv[1] == "prepare":
        prepare(kind)
    elif sys.argv[1] == "run":
        execute(kind, shard, group)
    elif kind == "ui" and group == "project-runtime":
        run("pnpm", "-C", "e2e", "exec", "tsx", "scripts/playwright.ts", "run-ui-group", "critical-extras")
    else:
        raise ValueError("critical extras are only declared for project-runtime")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"release test unit failed: {error}", file=sys.stderr)
        raise SystemExit(2) from error
