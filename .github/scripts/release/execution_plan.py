#!/usr/bin/env python3
"""Resolve the compact release-beta intent into one frozen execution Plan."""

from __future__ import annotations

import json
import os
import sys
from typing import Any


PROFILES = {"publish", "build", "validate", "mac-x64-dmg-probe"}
TARGETS = ("mac_arm64", "mac_x64", "win_x64")
TARGET_ALIASES = {target: target for target in TARGETS} | {
    "mac-arm64": "mac_arm64",
    "mac-x64": "mac_x64",
    "win-x64": "win_x64",
}

PLATFORM_FIELDS = {
    "mac_arm64": {
        "signMode": {"no", "sign-only", "notarize"},
        "smokeMode": {"skip", "core", "full"},
        "target": {"dmg", "all"},
        "updateMetadataUrl": str,
        "updateTargetVersion": str,
    },
    "mac_x64": {
        "signMode": {"no", "sign-only", "notarize"},
        "smokeMode": {"skip", "core", "full"},
        "target": {"dmg", "all"},
        "dmgProbe": bool,
        "dmgPreflight": bool,
    },
    "win_x64": {
        "signMode": {"off", "on"},
        "smokeMode": {"skip", "core", "full"},
        "target": {"nsis", "all", "zip", "dir"},
        "updateMetadataUrl": str,
        "updateTargetVersion": str,
    },
}


def compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def fail(message: str) -> None:
    raise ValueError(message)


def parse_bool(value: str, name: str) -> bool:
    if value == "true":
        return True
    if value == "false":
        return False
    fail(f"{name} must be true or false")


def parse_targets(profile: str, raw: str) -> set[str]:
    defaults = {
        "publish": set(TARGETS),
        "build": set(TARGETS),
        "validate": set(),
        "mac-x64-dmg-probe": {"mac_x64"},
    }
    normalized = raw.strip().lower()
    if normalized in {"", "default"}:
        return defaults[profile]
    if normalized == "all":
        selected = set(TARGETS)
    elif normalized == "none":
        selected = set()
    else:
        selected = set()
        for item in normalized.split(","):
            item = item.strip()
            if item not in TARGET_ALIASES:
                fail(f"unsupported release target: {item or '<empty>'}")
            selected.add(TARGET_ALIASES[item])
    if profile == "validate" and selected:
        fail("validate profile does not accept native targets")
    if profile.startswith("mac-x64-") and selected != {"mac_x64"}:
        fail(f"{profile} requires targets=mac_x64 (or default)")
    return selected


def default_platforms() -> dict[str, dict[str, Any]]:
    return {
        "mac_arm64": {
            "enabled": False,
            "signMode": "notarize",
            "smokeMode": "core",
            "target": "all",
            "updateMetadataUrl": "",
            "updateTargetVersion": "",
        },
        "mac_x64": {
            "enabled": False,
            "signMode": "notarize",
            "smokeMode": "core",
            "target": "all",
            "dmgProbe": False,
            "dmgPreflight": False,
        },
        "win_x64": {
            "enabled": False,
            "signMode": "off",
            "smokeMode": "core",
            "target": "all",
            "updateMetadataUrl": "",
            "updateTargetVersion": "",
        },
    }


def apply_overrides(plan: dict[str, Any], raw: str) -> None:
    if not raw.strip():
        return
    try:
        overrides = json.loads(raw)
    except json.JSONDecodeError as error:
        fail(f"plan_overrides must be valid JSON: {error.msg}")
    if not isinstance(overrides, dict) or set(overrides) - {"release", "platforms"}:
        fail("plan_overrides allows only release and platforms objects")

    release = overrides.get("release", {})
    if not isinstance(release, dict) or set(release) - {"macCompression"}:
        fail("plan_overrides.release allows only macCompression")
    if "macCompression" in release:
        if release["macCompression"] not in {"normal", "store"}:
            fail("macCompression must be normal or store")
        plan["release"]["macCompression"] = release["macCompression"]

    platforms = overrides.get("platforms", {})
    if not isinstance(platforms, dict) or set(platforms) - set(TARGETS):
        fail("plan_overrides.platforms contains an unknown platform")
    for platform, values in platforms.items():
        if not isinstance(values, dict) or set(values) - set(PLATFORM_FIELDS[platform]):
            fail(f"plan_overrides.platforms.{platform} contains an unknown field")
        for field, value in values.items():
            contract = PLATFORM_FIELDS[platform][field]
            valid = type(value) is contract if isinstance(contract, type) else value in contract
            if not valid:
                fail(f"invalid {platform}.{field}: {value!r}")
            plan["platforms"][platform][field] = value


def source_requested(requests: dict[str, Any], batch: str) -> bool:
    value = requests.get(batch, {})
    return isinstance(value, dict) and any(
        isinstance(request, dict) and request.get("operation") == "build"
        for request in value.values()
    )


def resolve(inputs: dict[str, str], requests: dict[str, Any], contribution: bool) -> dict[str, Any]:
    profile = inputs.get("profile", "publish")
    if profile not in PROFILES:
        fail(f"unsupported release profile: {profile}")
    targets = parse_targets(profile, inputs.get("targets", "default"))
    amr_profile = inputs.get("amr_profile", "prod") or "prod"
    if amr_profile not in {"prod", "test", "feature-test"}:
        fail(f"unsupported AMR profile: {amr_profile}")

    publish = profile == "publish"
    plan: dict[str, Any] = {
        "schemaVersion": 1,
        "profile": profile,
        "release": {
            "publish": publish,
            "promote": parse_bool(inputs.get("promote", "true"), "promote"),
            "force": parse_bool(inputs.get("force", "false"), "force"),
            "ref": inputs.get("ref", ""),
            "releaseVersion": inputs.get("release_version", ""),
            "amrProfile": amr_profile,
            "macCompression": "store",
        },
        "platforms": default_platforms(),
        "jobs": {},
    }
    for target in TARGETS:
        plan["platforms"][target]["enabled"] = target in targets

    if profile == "validate":
        for platform in plan["platforms"].values():
            platform["smokeMode"] = "skip"
    elif profile == "mac-x64-dmg-probe":
        plan["platforms"]["mac_x64"].update({"smokeMode": "skip", "dmgProbe": True, "dmgPreflight": True})

    apply_overrides(plan, inputs.get("plan_overrides", ""))

    if publish and not targets:
        fail("publish profile requires at least one native target")
    if (
        publish
        and plan["platforms"]["win_x64"]["enabled"]
        and plan["platforms"]["win_x64"]["target"] not in {"nsis", "all"}
    ):
        fail("publishing win_x64 requires target nsis or all")
    if not publish and plan["release"]["promote"]:
        plan["release"]["promote"] = False

    jobs: dict[str, bool] = {}
    for target in TARGETS:
        enabled = plan["platforms"][target]["enabled"]
        jobs[f"source_{target}"] = contribution and enabled and source_requested(requests, f"source_{target}")
        jobs[f"build_{target}"] = enabled
        jobs[f"smoke_{target}"] = (
            publish and plan["release"]["promote"] and enabled
            and plan["platforms"][target]["smokeMode"] == "core"
        )
    jobs["test"] = not profile.startswith("mac-x64-")
    jobs["publish"] = publish and plan["release"]["promote"]
    plan["jobs"] = jobs
    return plan


def github_output(plan: dict[str, Any]) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        fail("GITHUB_OUTPUT is required")
    outputs = {"execution_plan": compact(plan)} | {
        f"run_{job}": str(enabled).lower() for job, enabled in plan["jobs"].items()
    }
    with open(path, "a", encoding="utf-8") as output:
        for key, value in outputs.items():
            output.write(f"{key}={value}\n")
    plan_path = os.environ.get("RELEASE_EXECUTION_PLAN_PATH")
    if plan_path:
        with open(plan_path, "w", encoding="utf-8") as output:
            json.dump(plan, output, ensure_ascii=False, indent=2, sort_keys=True)
            output.write("\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            output.write("## Release execution Plan\n\n")
            output.write(f"- profile: `{plan['profile']}`\n")
            output.write(f"- publish: `{str(plan['release']['publish']).lower()}`\n")
            targets = ", ".join(target for target in TARGETS if plan["platforms"][target]["enabled"])
            jobs = ", ".join(job for job, enabled in plan["jobs"].items() if enabled)
            output.write(f"- targets: `{targets or 'none'}`\n")
            output.write(f"- scheduled jobs: `{jobs or 'tests only'}`\n")
            output.write("\n<details><summary>Frozen execution Plan</summary>\n\n```json\n")
            output.write(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True))
            output.write("\n```\n</details>\n")


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] != "github-output":
        fail("usage: execution_plan.py github-output")
    raw_inputs = os.environ.get("RELEASE_INPUTS_JSON", "{}")
    raw_requests = os.environ.get("RELEASE_REQUESTS_JSON", "{}")
    inputs = json.loads(raw_inputs)
    requests = json.loads(raw_requests)
    if not isinstance(inputs, dict) or not all(
        isinstance(key, str) and isinstance(value, (str, bool))
        for key, value in inputs.items()
    ):
        fail("RELEASE_INPUTS_JSON must be an object of scalar workflow inputs")
    if not isinstance(requests, dict):
        fail("RELEASE_REQUESTS_JSON must be an object")
    normalized = {key: str(value).lower() if isinstance(value, bool) else value for key, value in inputs.items()}
    contribution = parse_bool(os.environ.get("RELEASE_CONTRIBUTION", "false"), "RELEASE_CONTRIBUTION")
    github_output(resolve(normalized, requests, contribution))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, json.JSONDecodeError) as error:
        print(f"release execution Plan failed: {error}", file=sys.stderr)
        raise SystemExit(2) from error
