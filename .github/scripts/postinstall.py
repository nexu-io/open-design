#!/usr/bin/env python3

"""Produce and consume frozen workspace-initialization plans for workflows."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
from typing import Any

from lib.postinstall_plan import (
    PLAN_SCHEMA_VERSION,
    canonical_json,
    plan_digest,
    resolve_plan,
)

SCHEMA_VERSION = PLAN_SCHEMA_VERSION


def load_object(path: Path, label: str) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


def repository_root() -> Path:
    return Path(__file__).resolve().parents[2]


def append_outputs(values: dict[str, str]) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")


def create_plan(args: argparse.Namespace) -> dict[str, Any]:
    root = repository_root()
    def load_repository_json(path: str) -> dict[str, Any]:
        configured = args.config if path == ".github/config/postinstall.json" else root / path
        return load_object(configured, path)

    canonical = resolve_plan(args.intent, load_repository_json)
    install_profile = canonical["installProfile"]
    requested = canonical["requestedTargets"]
    resolved = canonical["resolvedTargets"]
    requirements = canonical["requirements"]
    cache_tools = args.cache_tools == "true"
    plan: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "id": f"{os.environ.get('GITHUB_WORKFLOW', 'workflow')}/{os.environ.get('GITHUB_JOB', 'job')}/{args.intent}",
        "intent": args.intent,
        "installProfile": install_profile,
        "cacheTools": cache_tools,
        "requestedTargets": requested,
        "resolvedTargets": resolved,
        "requirements": requirements,
        "entries": {
            "dependencies": {
                "materializeDomToPptx": requirements["materializeDomToPptx"],
                "probeNativeDependencies": requirements["probeNativeDependencies"],
                "resolvedTargets": [],
                "concurrency": args.concurrency,
            },
            "build": {
                "materializeDomToPptx": False,
                "probeNativeDependencies": False,
                "resolvedTargets": resolved,
                "concurrency": args.concurrency,
            },
            "all": {
                "materializeDomToPptx": requirements["materializeDomToPptx"],
                "probeNativeDependencies": requirements["probeNativeDependencies"],
                "resolvedTargets": resolved,
                "concurrency": args.concurrency,
            },
        },
    }
    plan["digest"] = plan_digest(canonical)
    return plan


def plan_command(args: argparse.Namespace) -> int:
    plan = create_plan(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    append_outputs({
        "path": str(args.output),
        "json": canonical_json(plan),
        "digest": plan["digest"],
        "install-profile": plan["installProfile"],
    })
    print(canonical_json(plan))
    return 0


def load_receipts(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    receipts: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError("postinstall receipt line must be an object")
        receipts.append(value)
    return receipts


def consume_command(args: argparse.Namespace) -> int:
    plan = load_object(args.plan, "postinstall plan")
    canonical = {key: plan.get(key) for key in (
        "schemaVersion", "installProfile", "requestedTargets", "resolvedTargets", "requirements",
    )}
    if plan.get("schemaVersion") != SCHEMA_VERSION or plan.get("digest") != plan_digest(canonical):
        raise ValueError("postinstall plan digest is invalid")
    receipts = load_receipts(args.receipts)
    for receipt in receipts:
        if receipt.get("schemaVersion") != SCHEMA_VERSION:
            raise ValueError("postinstall receipt has an unsupported schemaVersion")
        if receipt.get("planId") != plan.get("id") or receipt.get("planDigest") != plan.get("digest"):
            raise ValueError("postinstall receipt does not belong to the frozen plan")
        if receipt.get("status") != "success":
            raise ValueError("postinstall receipt did not succeed")

    profile = plan["installProfile"]
    cache_tools = bool(plan["cacheTools"])
    expected_entries = ["build"] if profile != "workspace" else (["dependencies"] if cache_tools else ["all"])
    receipt_entries = {receipt.get("entry") for receipt in receipts}
    missing = [entry for entry in expected_entries if entry not in receipt_entries]
    if missing:
        raise ValueError(f"postinstall receipts are missing required entries: {missing}")

    build_receipt = next((receipt for receipt in receipts if receipt.get("entry") in {"build", "all"}), None)
    restored_targets: list[str] = []
    executed_targets: list[str] = []
    if cache_tools and args.tools_cache_hit == "true":
        restored_targets = list(plan["resolvedTargets"])
    else:
        if build_receipt is None:
            raise ValueError("postinstall build receipt is required when the tool closure was not restored")
        executed_targets = build_receipt.get("executedTargets", [])
        if executed_targets != plan["resolvedTargets"]:
            raise ValueError("postinstall executed targets differ from the frozen plan")

    result = {
        "schemaVersion": SCHEMA_VERSION,
        "planId": plan["id"],
        "planDigest": plan["digest"],
        "intent": plan["intent"],
        "installProfile": profile,
        "requiredTargets": plan["resolvedTargets"],
        "executedTargets": executed_targets,
        "restoredTargets": restored_targets,
        "status": "success",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    append_outputs({"json": canonical_json(result), "path": str(args.output)})
    print(canonical_json(result))
    return 0


def validate_command(args: argparse.Namespace) -> int:
    root = repository_root()
    config = load_object(args.config, "postinstall workflow config")
    intents = config.get("intents", {})
    if not isinstance(intents, dict) or not intents:
        raise ValueError("postinstall workflow config requires intents")
    for intent in intents:
        namespace = argparse.Namespace(
            cache_tools="false", concurrency=1, config=args.config, intent=intent,
        )
        create_plan(namespace)
    targets = config.get("targets", [])
    describe_environment = {
        key: value for key, value in os.environ.items()
        if not key.startswith("OPEN_DESIGN_POSTINSTALL_")
    }
    described = json.loads(subprocess.check_output(
        ["node", "scripts/postinstall.mjs", "describe"], cwd=root, env=describe_environment, text=True,
    ))
    if described != targets:
        raise ValueError("postinstall workflow targets differ from consumer capabilities")
    print(canonical_json({"schemaVersion": SCHEMA_VERSION, "intents": sorted(intents), "targets": targets}))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Produce and consume workflow postinstall plans.")
    parser.add_argument("--config", type=Path, default=repository_root() / ".github/config/postinstall.json")
    commands = parser.add_subparsers(dest="command", required=True)
    plan = commands.add_parser("plan")
    plan.add_argument("--intent", required=True)
    plan.add_argument("--cache-tools", choices=["true", "false"], default="false")
    plan.add_argument("--concurrency", type=int, default=1)
    plan.add_argument("--output", type=Path, required=True)
    consume = commands.add_parser("consume")
    consume.add_argument("--plan", type=Path, required=True)
    consume.add_argument("--receipts", type=Path, required=True)
    consume.add_argument("--tools-cache-hit", choices=["true", "false"], default="false")
    consume.add_argument("--output", type=Path, required=True)
    commands.add_parser("validate")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "plan":
        if args.concurrency < 1:
            raise ValueError("postinstall concurrency must be positive")
        return plan_command(args)
    if args.command == "consume":
        return consume_command(args)
    return validate_command(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as error:
        print(f"postinstall plan error: {error}", file=os.sys.stderr)
        raise SystemExit(2)
