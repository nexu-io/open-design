#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
KINDS = {"comment", "autofix", "report"}
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def fail(message: str) -> None:
    raise SystemExit(message)


def require_slug(value: str, label: str) -> str:
    if not SLUG_RE.fullmatch(value):
        fail(f"Invalid {label}: {value!r}")
    return value


def require_kind(kind: str) -> str:
    if kind not in KINDS:
        fail(f"Invalid handoff kind: {kind!r}")
    return kind


def artifact_name(kind: str, handoff_id: str) -> str:
    return f"handoff-{require_kind(kind)}-{require_slug(handoff_id, 'handoff id')}"


def artifact_pattern(kind: str) -> str:
    return f"handoff-{require_kind(kind)}-*"


def handoff_dir(root: Path, kind: str, handoff_id: str) -> Path:
    return root / "handoff" / require_kind(kind) / require_slug(handoff_id, "handoff id")


def metadata_path(root: Path, kind: str, handoff_id: str) -> Path:
    return handoff_dir(root, kind, handoff_id) / "metadata.json"


def payload_path(root: Path, kind: str, handoff_id: str) -> Path:
    kind = require_kind(kind)
    filename = "body.md" if kind == "comment" else "patch.diff" if kind == "autofix" else "request.json"
    return handoff_dir(root, kind, handoff_id) / filename


def load_metadata(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"Invalid JSON in {path}: {error}")
    if not isinstance(data, dict):
        fail(f"Metadata must be an object: {path}")
    return data


def require_int(value: Any, label: str) -> int:
    if isinstance(value, bool):
        fail(f"{label} must be an integer")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str) and value.isdigit():
        number = int(value)
    else:
        fail(f"{label} must be an integer")
    if number <= 0:
        fail(f"{label} must be positive")
    return number


def require_sha(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA_RE.fullmatch(value):
        fail(f"{label} must be a 40-character lowercase hex SHA")
    return value


def require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{label} must be a non-empty string")
    return value


def require_relative_path(value: Any, label: str) -> str:
    path = require_text(value, label)
    candidate = Path(path)
    if candidate.is_absolute() or ".." in candidate.parts:
        fail(f"{label} must be a repository-relative path without '..': {path!r}")
    return path


def validate_common(entry_dir: Path, expected_kind: str) -> dict[str, Any]:
    data = load_metadata(entry_dir / "metadata.json")
    if data.get("schema_version") != SCHEMA_VERSION:
        fail(f"Unsupported schema_version in {entry_dir}")
    kind = data.get("kind")
    if kind != expected_kind:
        fail(f"Expected kind {expected_kind!r}, got {kind!r} in {entry_dir}")
    handoff_id = require_slug(require_text(data.get("id"), "id"), "id")
    allowed_directory_names = {handoff_id, artifact_name(expected_kind, handoff_id)}
    if entry_dir.name not in allowed_directory_names:
        fail(f"Metadata id {handoff_id!r} does not match directory {entry_dir.name!r}")
    normalized: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "kind": kind,
        "id": handoff_id,
        "pr_number": require_int(data.get("pr_number"), "pr_number"),
        "head_sha": require_sha(data.get("head_sha"), "head_sha"),
        "base_sha": require_sha(data.get("base_sha"), "base_sha"),
        "run_id": require_int(data.get("run_id"), "run_id"),
        "path": str(entry_dir),
    }
    return normalized


def validate_comment(entry_dir: Path) -> dict[str, Any]:
    normalized = validate_common(entry_dir, "comment")
    body_path = entry_dir / "body.md"
    if not body_path.is_file():
        fail(f"Missing comment body: {body_path}")
    marker = require_text(load_metadata(entry_dir / "metadata.json").get("marker"), "marker")
    body = body_path.read_text(encoding="utf-8")
    if marker not in body:
        fail(f"Comment marker is not present in body: {entry_dir}")
    normalized.update({"marker": marker, "body_path": str(body_path)})
    return normalized


def validate_autofix(entry_dir: Path) -> dict[str, Any]:
    metadata = load_metadata(entry_dir / "metadata.json")
    normalized = validate_common(entry_dir, "autofix")
    patch_path = entry_dir / "patch.diff"
    if not patch_path.is_file():
        fail(f"Missing autofix patch: {patch_path}")
    allowed_paths = metadata.get("allowed_paths")
    if not isinstance(allowed_paths, list) or not allowed_paths:
        fail("allowed_paths must be a non-empty list")
    normalized.update(
        {
            "allowed_paths": [require_relative_path(item, "allowed_paths item") for item in allowed_paths],
            "commit_message": require_text(metadata.get("commit_message"), "commit_message"),
            "patch_path": str(patch_path),
        }
    )
    return normalized


def require_artifact_pattern(value: Any, label: str) -> str:
    pattern = require_text(value, label)
    if "/" in pattern or ".." in pattern:
        fail(f"{label} must be an artifact name pattern, not a path: {pattern!r}")
    return pattern


def validate_report(entry_dir: Path) -> dict[str, Any]:
    metadata = load_metadata(entry_dir / "metadata.json")
    normalized = validate_common(entry_dir, "report")
    normalized.update(
        {
            "report_type": require_slug(require_text(metadata.get("report_type"), "report_type"), "report_type"),
            "artifact_pattern": require_artifact_pattern(metadata.get("artifact_pattern"), "artifact_pattern"),
            "output_comment_id": require_slug(require_text(metadata.get("output_comment_id"), "output_comment_id"), "output_comment_id"),
            "marker": require_text(metadata.get("marker"), "marker"),
        }
    )
    return normalized


def validate_entry(kind: str, entry_dir: Path) -> dict[str, Any]:
    kind = require_kind(kind)
    if kind == "comment":
        return validate_comment(entry_dir)
    if kind == "autofix":
        return validate_autofix(entry_dir)
    return validate_report(entry_dir)



def candidate_entry_dirs(root: Path, kind: str) -> list[Path]:
    kind = require_kind(kind)
    seen: set[Path] = set()
    entries: list[Path] = []
    for metadata in root.rglob("metadata.json"):
        entry = metadata.parent
        data = load_metadata(metadata)
        if data.get("kind") != kind:
            continue
        parts = entry.parts
        accepted = (
            len(parts) >= 3
            and parts[-3] == "handoff"
            and parts[-2] == kind
            and SLUG_RE.fullmatch(parts[-1]) is not None
        ) or (
            len(parts) >= 2
            and parts[-2] == kind
            and SLUG_RE.fullmatch(parts[-1]) is not None
        ) or SLUG_RE.fullmatch(parts[-1]) is not None
        resolved = entry.resolve()
        if accepted and resolved not in seen:
            seen.add(resolved)
            entries.append(entry)
    return sorted(entries, key=lambda path: str(path))


def emit_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, sort_keys=True))


def self_check() -> None:
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        comment = handoff_dir(root, "comment", "visual-pr-app")
        comment.mkdir(parents=True)
        marker = "<!-- visual-comment:app -->"
        (comment / "body.md").write_text(f"{marker}\nVisual report\n", encoding="utf-8")
        (comment / "metadata.json").write_text(
            json.dumps(
                {
                    "schema_version": SCHEMA_VERSION,
                    "kind": "comment",
                    "id": "visual-pr-app",
                    "pr_number": 12,
                    "head_sha": "a" * 40,
                    "base_sha": "b" * 40,
                    "run_id": 34,
                    "marker": marker,
                }
            ),
            encoding="utf-8",
        )
        autofix = handoff_dir(root, "autofix", "nix-pnpm-deps")
        autofix.mkdir(parents=True)
        (autofix / "patch.diff").write_text("diff --git a/nix/pnpm-deps.nix b/nix/pnpm-deps.nix\n", encoding="utf-8")
        (autofix / "metadata.json").write_text(
            json.dumps(
                {
                    "schema_version": SCHEMA_VERSION,
                    "kind": "autofix",
                    "id": "nix-pnpm-deps",
                    "pr_number": 12,
                    "head_sha": "a" * 40,
                    "base_sha": "b" * 40,
                    "run_id": 34,
                    "allowed_paths": ["nix/pnpm-deps.nix"],
                    "commit_message": "chore(nix): refresh pnpm deps hash",
                }
            ),
            encoding="utf-8",
        )
        report = handoff_dir(root, "report", "visual-pr")
        report.mkdir(parents=True)
        (report / "metadata.json").write_text(
            json.dumps(
                {
                    "schema_version": SCHEMA_VERSION,
                    "kind": "report",
                    "id": "visual-pr",
                    "pr_number": 12,
                    "head_sha": "a" * 40,
                    "base_sha": "b" * 40,
                    "run_id": 34,
                    "report_type": "visual-pr",
                    "artifact_pattern": "visual-pr-capture-12-34-*",
                    "output_comment_id": "visual-pr-report",
                    "marker": "<!-- visual-regression-bot -->",
                }
            ),
            encoding="utf-8",
        )
        assert artifact_name("comment", "visual-pr-app") == "handoff-comment-visual-pr-app"
        assert artifact_pattern("autofix") == "handoff-autofix-*"
        assert artifact_name("report", "visual-pr") == "handoff-report-visual-pr"
        assert validate_entry("comment", comment)["marker"] == marker
        assert validate_entry("autofix", autofix)["allowed_paths"] == ["nix/pnpm-deps.nix"]
        assert validate_entry("report", report)["artifact_pattern"] == "visual-pr-capture-12-34-*"
        assert len(candidate_entry_dirs(root, "comment")) == 1
        assert len(candidate_entry_dirs(root, "autofix")) == 1
        assert len(candidate_entry_dirs(root, "report")) == 1
    print("handoff self-check passed")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage GitHub Actions handoff artifact names, paths, and contracts.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for command in ["artifact-name", "dir", "metadata-path", "payload-path"]:
        item = subparsers.add_parser(command)
        item.add_argument("kind", choices=sorted(KINDS))
        item.add_argument("id")
        item.add_argument("--root", default=".")

    pattern = subparsers.add_parser("artifact-pattern")
    pattern.add_argument("kind", choices=sorted(KINDS))

    validate = subparsers.add_parser("validate")
    validate.add_argument("kind", choices=sorted(KINDS))
    validate.add_argument("entry_dir")

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("kind", choices=sorted(KINDS))
    list_parser.add_argument("root")

    subparsers.add_parser("self-check")

    args = parser.parse_args()
    if args.command == "artifact-name":
        print(artifact_name(args.kind, args.id))
    elif args.command == "artifact-pattern":
        print(artifact_pattern(args.kind))
    elif args.command == "dir":
        print(handoff_dir(Path(args.root), args.kind, args.id))
    elif args.command == "metadata-path":
        print(metadata_path(Path(args.root), args.kind, args.id))
    elif args.command == "payload-path":
        print(payload_path(Path(args.root), args.kind, args.id))
    elif args.command == "validate":
        emit_json(validate_entry(args.kind, Path(args.entry_dir)))
    elif args.command == "list":
        for entry in candidate_entry_dirs(Path(args.root), args.kind):
            emit_json(validate_entry(args.kind, entry))
    elif args.command == "self-check":
        self_check()


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(1)
