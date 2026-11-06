#!/usr/bin/env python3
"""Validate stable release identity and plan idempotent GHCR reconciliation.

The workflow owns transport (curl/docker). This helper owns the fail-closed
business rules so they can be tested without network or registry access.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
SHA = re.compile(r"^[0-9a-f]{40}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
REQUIRED_PLATFORMS = ("linux/amd64", "linux/arm64")


class ContractError(ValueError):
    pass


def fail(message: str) -> None:
    raise ContractError(message)


def load_object(path: str, label: str) -> dict[str, Any]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"{label} is not readable JSON: {error}")
    if not isinstance(value, dict):
        fail(f"{label} must be a JSON object")
    return value


def text(record: dict[str, Any], key: str, label: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value:
        fail(f"{label}.{key} must be a non-empty string")
    return value


def positive_int(record: dict[str, Any], key: str, label: str) -> int:
    value = record.get(key)
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        fail(f"{label}.{key} must be a positive integer")
    return value


def parse_version(value: str, label: str) -> tuple[int, int, int]:
    match = SEMVER.fullmatch(value)
    if match is None:
        fail(f"{label} must be x.y.z; got {value!r}")
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def metadata_identity(
    metadata: dict[str, Any],
    *,
    repository: str,
    requested_version: str,
    allow_version_mismatch: bool,
    origin_run_id: str,
    origin_run_attempt: str,
) -> dict[str, str]:
    parse_version(requested_version, "requested release version")
    if metadata.get("channel") != "stable":
        fail(f"metadata.channel must be stable; got {metadata.get('channel')!r}")
    if metadata.get("releaseState") != "complete":
        fail(f"metadata.releaseState must be complete; got {metadata.get('releaseState')!r}")
    if metadata.get("dryRun") is not False:
        fail("metadata.dryRun must be false")

    stable_version = text(metadata, "stableVersion", "metadata")
    release_version = text(metadata, "releaseVersion", "metadata")
    parse_version(stable_version, "metadata.stableVersion")
    if release_version != stable_version:
        fail(
            "metadata.releaseVersion must equal metadata.stableVersion; "
            f"got {release_version!r} and {stable_version!r}"
        )
    is_target_version = stable_version == requested_version
    if not is_target_version and not allow_version_mismatch:
        fail(
            f"metadata stable version {stable_version!r} does not match requested "
            f"version {requested_version!r}"
        )

    version_tag = text(metadata, "versionTag", "metadata")
    expected_tag = f"open-design-v{stable_version}"
    if version_tag != expected_tag:
        fail(f"metadata.versionTag must be {expected_tag!r}; got {version_tag!r}")

    github = metadata.get("github")
    if not isinstance(github, dict):
        fail("metadata.github must be an object")
    actual_repository = text(github, "repository", "metadata.github")
    if actual_repository != repository:
        fail(
            f"metadata.github.repository must be {repository!r}; "
            f"got {actual_repository!r}"
        )
    workflow = text(github, "workflow", "metadata.github")
    if workflow != "release-stable":
        fail(f"metadata.github.workflow must be 'release-stable'; got {workflow!r}")
    commit = text(github, "commit", "metadata.github")
    if SHA.fullmatch(commit) is None:
        fail(f"metadata.github.commit must be a full lowercase SHA; got {commit!r}")
    branch = text(github, "branch", "metadata.github")
    expected_branch = f"release/v{stable_version}"
    if branch != expected_branch:
        fail(f"metadata.github.branch must be {expected_branch!r}; got {branch!r}")
    run_id = positive_int(github, "runId", "metadata.github")
    run_attempt = positive_int(github, "runAttempt", "metadata.github")

    if origin_run_id and str(run_id) != origin_run_id:
        fail(
            f"metadata.github.runId {run_id} does not match dispatch origin "
            f"run id {origin_run_id}"
        )
    if origin_run_attempt and str(run_attempt) != origin_run_attempt:
        fail(
            f"metadata.github.runAttempt {run_attempt} does not match dispatch origin "
            f"run attempt {origin_run_attempt}"
        )

    r2 = metadata.get("r2")
    if not isinstance(r2, dict):
        fail("metadata.r2 must be an object")
    version_metadata_url = text(r2, "versionMetadataUrl", "metadata.r2")
    expected_prefix = f"stable/versions/{stable_version}"
    if r2.get("versionPrefix") != expected_prefix:
        fail(
            f"metadata.r2.versionPrefix must be {expected_prefix!r}; "
            f"got {r2.get('versionPrefix')!r}"
        )
    if not version_metadata_url.endswith(f"/{expected_prefix}/metadata.json"):
        fail("metadata.r2.versionMetadataUrl does not match the stable version prefix")

    return {
        "branch": branch,
        "commit": commit,
        "is_target_version": str(is_target_version).lower(),
        "release_run_attempt": str(run_attempt),
        "release_run_id": str(run_id),
        "release_version": stable_version,
        "version_metadata_url": version_metadata_url,
        "version_tag": version_tag,
    }


def image_identity(inspection: dict[str, Any]) -> dict[str, Any]:
    manifest = inspection.get("manifest")
    images = inspection.get("image")
    if not isinstance(manifest, dict) or not isinstance(images, dict):
        fail("docker inspection must contain manifest and image objects")
    digest = manifest.get("digest")
    if not isinstance(digest, str) or DIGEST.fullmatch(digest) is None:
        fail("docker inspection manifest.digest must be a sha256 digest")

    identities: list[tuple[str, str]] = []
    present: list[str] = []
    for platform in REQUIRED_PLATFORMS:
        image = images.get(platform)
        if image is None:
            continue
        if not isinstance(image, dict):
            fail(f"docker inspection image[{platform!r}] must be an object")
        config = image.get("config")
        labels = config.get("Labels") if isinstance(config, dict) else None
        if not isinstance(labels, dict):
            fail(f"docker image {platform} has no inspectable OCI labels")
        revision = labels.get("org.opencontainers.image.revision")
        version = labels.get("org.opencontainers.image.version")
        if not isinstance(revision, str) or SHA.fullmatch(revision) is None:
            fail(f"docker image {platform} has an invalid OCI revision label")
        if not isinstance(version, str) or SEMVER.fullmatch(version) is None:
            fail(f"docker image {platform} has an invalid OCI version label")
        identities.append((revision, version))
        present.append(platform)

    if not identities:
        fail("docker image contains none of the required linux platforms")
    if len(set(identities)) != 1:
        fail("docker image platforms disagree on OCI revision/version identity")
    revision, version = identities[0]
    return {
        "digest": digest,
        "platforms": present,
        "revision": revision,
        "version": version,
    }


def version_image_state(
    inspection: dict[str, Any], *, expected_revision: str, expected_version: str
) -> dict[str, str]:
    identity = image_identity(inspection)
    if identity["revision"] != expected_revision or identity["version"] != expected_version:
        fail(
            "existing version tag identity conflict: "
            f"found {identity['version']}@{identity['revision']}, expected "
            f"{expected_version}@{expected_revision}"
        )
    missing = [platform for platform in REQUIRED_PLATFORMS if platform not in identity["platforms"]]
    state = "repair" if missing else "complete"
    return {
        "digest": str(identity["digest"]),
        "missing_platforms": ",".join(missing),
        "state": state,
    }


def latest_action(
    inspection: dict[str, Any], *, target_digest: str, target_version: str
) -> dict[str, str]:
    if DIGEST.fullmatch(target_digest) is None:
        fail("target digest must be a sha256 digest")
    target = parse_version(target_version, "target version")
    identity = image_identity(inspection)
    current = parse_version(str(identity["version"]), "current latest image version")
    if identity["digest"] == target_digest:
        action = "noop"
    elif current > target:
        action = "skip-newer"
    elif current <= target:
        action = "promote"
    else:  # pragma: no cover - tuple comparison is total
        fail("unable to compare latest image versions")
    return {
        "action": action,
        "current_digest": str(identity["digest"]),
        "current_version": str(identity["version"]),
    }


def write_outputs(values: dict[str, str], path: str) -> None:
    for key, value in values.items():
        if "\n" in value or "\r" in value:
            fail(f"output {key} contains a newline")
    rendered = "".join(f"{key}={value}\n" for key, value in values.items())
    if path:
        with Path(path).open("a", encoding="utf-8") as handle:
            handle.write(rendered)
    else:
        sys.stdout.write(rendered)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)

    resolve = commands.add_parser("resolve")
    resolve.add_argument("--metadata", required=True)
    resolve.add_argument("--repository", required=True)
    resolve.add_argument("--release-version", required=True)
    resolve.add_argument("--origin-run-id", default="")
    resolve.add_argument("--origin-run-attempt", default="")
    resolve.add_argument("--allow-version-mismatch", action="store_true")
    resolve.add_argument("--github-output", default="")

    image = commands.add_parser("image-state")
    image.add_argument("--inspection", required=True)
    image.add_argument("--expected-revision", required=True)
    image.add_argument("--expected-version", required=True)
    image.add_argument("--github-output", default="")

    latest = commands.add_parser("latest-action")
    latest.add_argument("--inspection", required=True)
    latest.add_argument("--target-digest", required=True)
    latest.add_argument("--target-version", required=True)
    latest.add_argument("--github-output", default="")

    commands.add_parser("self-check")
    return root


def self_check() -> None:
    inspection = {
        "manifest": {"digest": f"sha256:{'a' * 64}"},
        "image": {
            platform: {
                "config": {
                    "Labels": {
                        "org.opencontainers.image.revision": "a" * 40,
                        "org.opencontainers.image.version": "1.2.3",
                    }
                }
            }
            for platform in REQUIRED_PLATFORMS
        },
    }
    result = version_image_state(
        inspection, expected_revision="a" * 40, expected_version="1.2.3"
    )
    if result["state"] != "complete":
        fail("self-check did not converge a complete image")


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "resolve":
            result = metadata_identity(
                load_object(args.metadata, "stable metadata"),
                repository=args.repository,
                requested_version=args.release_version,
                allow_version_mismatch=args.allow_version_mismatch,
                origin_run_id=args.origin_run_id,
                origin_run_attempt=args.origin_run_attempt,
            )
            write_outputs(result, args.github_output)
        elif args.command == "image-state":
            result = version_image_state(
                load_object(args.inspection, "docker inspection"),
                expected_revision=args.expected_revision,
                expected_version=args.expected_version,
            )
            write_outputs(result, args.github_output)
        elif args.command == "latest-action":
            result = latest_action(
                load_object(args.inspection, "latest docker inspection"),
                target_digest=args.target_digest,
                target_version=args.target_version,
            )
            write_outputs(result, args.github_output)
        elif args.command == "self-check":
            self_check()
            print("stable docker contract self-check passed")
        else:  # pragma: no cover
            fail(f"unsupported command: {args.command}")
    except ContractError as error:
        print(f"stable-docker: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
