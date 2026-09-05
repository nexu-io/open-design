#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

from lib.github import GitHubError, append_outputs, event_payload, unique_run_artifact

SCHEMA_VERSION = 1
KINDS = {"comment", "autofix", "report", "convergence"}
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
    filename = (
        "body.md"
        if kind == "comment"
        else "patch.diff"
        if kind == "autofix"
        else "candidate.json"
        if kind == "convergence"
        else "request.json"
    )
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


def validate_convergence(entry_dir: Path) -> dict[str, Any]:
    metadata = load_metadata(entry_dir / "metadata.json")
    expected = {
        "schema_version",
        "kind",
        "id",
        "repository_id",
        "repository",
        "workflow",
        "policy",
        "event",
        "run_id",
        "run_attempt",
        "head_sha",
        "base_sha",
        "tree_sha",
    }
    if set(metadata) != expected:
        fail("Convergence metadata fields differ")
    if metadata.get("schema_version") != SCHEMA_VERSION or metadata.get("kind") != "convergence":
        fail(f"Invalid convergence metadata contract: {entry_dir}")
    handoff_id = require_slug(require_text(metadata.get("id"), "id"), "id")
    if entry_dir.name not in {handoff_id, artifact_name("convergence", handoff_id)}:
        fail(f"Metadata id {handoff_id!r} does not match directory {entry_dir.name!r}")
    event = require_text(metadata.get("event"), "event")
    if event not in {"pull_request", "merge_group", "workflow_dispatch"}:
        fail(f"Unsupported convergence event: {event!r}")
    candidate_path = entry_dir / "candidate.json"
    if not candidate_path.is_file():
        fail(f"Missing convergence candidate: {candidate_path}")
    candidate = load_metadata(candidate_path)
    links = {
        "repositoryId": require_int(metadata.get("repository_id"), "repository_id"),
        "repository": require_text(metadata.get("repository"), "repository"),
        "workflow": require_slug(require_text(metadata.get("workflow"), "workflow"), "workflow"),
        "policy": require_slug(require_text(metadata.get("policy"), "policy"), "policy"),
    }
    for field, value in links.items():
        if candidate.get(field) != value:
            fail(f"Convergence candidate {field} does not match metadata")
    provenance = candidate.get("provenance")
    if not isinstance(provenance, dict):
        fail("Convergence candidate provenance must be an object")
    normalized = {
        "schema_version": SCHEMA_VERSION,
        "kind": "convergence",
        "id": handoff_id,
        "repository_id": links["repositoryId"],
        "repository": links["repository"],
        "workflow": links["workflow"],
        "policy": links["policy"],
        "event": event,
        "run_id": require_int(metadata.get("run_id"), "run_id"),
        "run_attempt": require_int(metadata.get("run_attempt"), "run_attempt"),
        "head_sha": require_sha(metadata.get("head_sha"), "head_sha"),
        "base_sha": require_sha(metadata.get("base_sha"), "base_sha"),
        "tree_sha": require_sha(metadata.get("tree_sha"), "tree_sha"),
        "candidate_path": str(candidate_path),
        "path": str(entry_dir),
    }
    provenance_links = {
        "event": normalized["event"],
        "runId": normalized["run_id"],
        "runAttempt": normalized["run_attempt"],
        "headSha": normalized["head_sha"],
        "baseSha": normalized["base_sha"],
        "treeSha": normalized["tree_sha"],
    }
    for field, value in provenance_links.items():
        if provenance.get(field) != value:
            fail(f"Convergence candidate provenance {field} does not match metadata")
    return normalized


def validate_entry(kind: str, entry_dir: Path) -> dict[str, Any]:
    kind = require_kind(kind)
    if kind == "comment":
        return validate_comment(entry_dir)
    if kind == "autofix":
        return validate_autofix(entry_dir)
    if kind == "convergence":
        return validate_convergence(entry_dir)
    return validate_report(entry_dir)


def write_convergence(root: Path, handoff_id: str, candidate: dict[str, Any]) -> Path:
    provenance = candidate.get("provenance")
    if not isinstance(provenance, dict):
        fail("Convergence candidate provenance must be an object")
    entry = handoff_dir(root, "convergence", handoff_id)
    entry.mkdir(parents=True, exist_ok=False)
    metadata = {
        "schema_version": SCHEMA_VERSION,
        "kind": "convergence",
        "id": require_slug(handoff_id, "handoff id"),
        "repository_id": candidate.get("repositoryId"),
        "repository": candidate.get("repository"),
        "workflow": candidate.get("workflow"),
        "policy": candidate.get("policy"),
        "event": provenance.get("event"),
        "run_id": provenance.get("runId"),
        "run_attempt": provenance.get("runAttempt"),
        "head_sha": provenance.get("headSha"),
        "base_sha": provenance.get("baseSha"),
        "tree_sha": provenance.get("treeSha"),
    }
    (entry / "candidate.json").write_text(
        json.dumps(candidate, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (entry / "metadata.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    validate_convergence(entry)
    return entry


def resolve_run_artifact(kind: str, handoff_id: str, run_id: int, repository: str) -> None:
    name = artifact_name(kind, handoff_id)
    artifact = unique_run_artifact(repository, run_id, name)
    append_outputs({"found": str(artifact is not None).lower(), "name": name if artifact else ""})



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
        autofix = handoff_dir(root, "autofix", "example-generated-fix")
        autofix.mkdir(parents=True)
        (autofix / "patch.diff").write_text(
            "diff --git a/generated/example.txt b/generated/example.txt\n",
            encoding="utf-8",
        )
        (autofix / "metadata.json").write_text(
            json.dumps(
                {
                    "schema_version": SCHEMA_VERSION,
                    "kind": "autofix",
                    "id": "example-generated-fix",
                    "pr_number": 12,
                    "head_sha": "a" * 40,
                    "base_sha": "b" * 40,
                    "run_id": 34,
                    "allowed_paths": ["generated/example.txt"],
                    "commit_message": "chore: apply generated autofix",
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
        candidate = {
            "repositoryId": 56,
            "repository": "nexu-io/open-design",
            "workflow": "ci",
            "policy": "ci-v1",
            "provenance": {
                "event": "pull_request",
                "runId": 34,
                "runAttempt": 1,
                "headSha": "a" * 40,
                "baseSha": "b" * 40,
                "treeSha": "c" * 40,
            },
        }
        convergence = write_convergence(root, "ci-results", candidate)
        assert artifact_name("comment", "visual-pr-app") == "handoff-comment-visual-pr-app"
        assert artifact_pattern("autofix") == "handoff-autofix-*"
        assert artifact_name("report", "visual-pr") == "handoff-report-visual-pr"
        assert artifact_name("convergence", "ci-results") == "handoff-convergence-ci-results"
        assert validate_entry("comment", comment)["marker"] == marker
        assert validate_entry("autofix", autofix)["allowed_paths"] == ["generated/example.txt"]
        assert validate_entry("report", report)["artifact_pattern"] == "visual-pr-capture-12-34-*"
        assert validate_entry("convergence", convergence)["policy"] == "ci-v1"
        assert len(candidate_entry_dirs(root, "comment")) == 1
        assert len(candidate_entry_dirs(root, "autofix")) == 1
        assert len(candidate_entry_dirs(root, "report")) == 1
        assert len(candidate_entry_dirs(root, "convergence")) == 1
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

    resolve = subparsers.add_parser("resolve-run-artifact")
    resolve.add_argument("kind", choices=sorted(KINDS))
    resolve.add_argument("id")
    resolve.add_argument("--run-id", type=int)
    resolve.add_argument("--repository")

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
    elif args.command == "resolve-run-artifact":
        run_id = args.run_id
        if run_id is None:
            workflow_run = event_payload().get("workflow_run")
            if isinstance(workflow_run, dict) and isinstance(workflow_run.get("id"), int):
                run_id = workflow_run["id"]
            else:
                run_id = int(os.environ.get("GITHUB_RUN_ID", "0"))
        repository = args.repository or os.environ.get("GITHUB_REPOSITORY", "")
        if run_id is None or run_id <= 0 or not repository:
            fail("run id and repository are required to resolve a handoff artifact")
        resolve_run_artifact(args.kind, args.id, run_id, repository)
    elif args.command == "self-check":
        self_check()


if __name__ == "__main__":
    try:
        main()
    except (BrokenPipeError, GitHubError) as error:
        if isinstance(error, GitHubError):
            print(f"handoff error: {error}", file=sys.stderr)
        sys.exit(1)
