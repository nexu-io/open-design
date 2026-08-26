#!/usr/bin/env python3
"""Orchestrate Terminal scene build/reuse and owner-controlled promotion."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

CHANNELS = {"betahyx", "previewhyx"}
TARGETS = {"darwin-arm64", "win32-x64"}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def run_terminal(request: Path, receipt: Path) -> None:
    run(["pnpm", "--filter", "@open-design/terminal", "exact:pack", "--", "--request", str(request), "--receipt", str(receipt)])


def signing_keys() -> list[tuple[str, str]]:
    keys = []
    for suffix in ("", "_NEXT"):
        key_id = os.environ.get(f"OD_EXACT_SIGNING_KEY_ID{suffix}")
        key = os.environ.get(f"OD_EXACT_ED25519_PRIVATE_KEY{suffix}")
        key_file = os.environ.get(f"OD_EXACT_ED25519_PRIVATE_KEY_FILE{suffix}")
        if not key and key_file:
            key = Path(key_file).read_text(encoding="utf-8")
        if key_id or key:
            if not key_id or not key:
                raise SystemExit(f"incomplete signing key pair: {suffix or 'primary'}")
            keys.append((key_id, key))
    if not keys:
        raise SystemExit("at least one exact signing key is required")
    return keys


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    args = parser.parse_args()
    request = read_json(args.request.resolve())
    if request.get("schemaVersion") != 1 or request.get("operation") != "exact.pack":
        raise SystemExit("unsupported exact pack request")
    channel = request.get("channel")
    if channel not in CHANNELS:
        raise SystemExit("channel must be betahyx or previewhyx")
    release_version = request.get("releaseVersion", "")
    if re.fullmatch(rf"\d+\.\d+\.\d+-{channel}\.\d+", release_version) is None:
        raise SystemExit("releaseVersion does not belong to the requested channel")
    source_commit = request.get("sourceCommit", "")
    if re.fullmatch(r"[a-f0-9]{40}", source_commit) is None:
        raise SystemExit("sourceCommit must be a full 40-character SHA")
    targets = request.get("targets")
    if not isinstance(targets, list) or {item.get("target") for item in targets} != TARGETS:
        raise SystemExit("targets must contain exactly darwin-arm64 and win32-x64")

    output = Path(request["outputDirectory"]).resolve()
    scene = Path(request["sceneDirectory"]).resolve()
    contracts = output / ".contracts"
    contracts.mkdir(parents=True, exist_ok=True)
    scene_reused = (scene / "scene.json").is_file()

    if not scene_reused:
        run(["pnpm", "--filter", "@open-design/closure", "build"])
        closure_package = read_json(Path("apps/closure/package.json"))
        scene_request = contracts / "terminal-scene-build-request.json"
        scene_receipt = contracts / "terminal-scene-build-receipt.json"
        write_json(scene_request, {
            "schemaVersion": 1,
            "operation": "terminal.scene.build",
            "standaloneVersion": request["standaloneVersion"],
            "closureVersion": closure_package["version"],
            "closureArtifactFile": str(Path("apps/closure/dist/fixture.mjs").resolve()),
            "targets": targets,
            "sceneDirectory": str(scene),
        })
        run_terminal(scene_request, scene_receipt)

    scene_manifest = read_json(scene / "scene.json")
    if scene_manifest.get("standaloneVersion") != request.get("standaloneVersion"):
        raise SystemExit("requested standaloneVersion differs from Terminal scene")

    temporary_files: list[Path] = []
    try:
        signers = []
        for key_id, key in signing_keys():
            handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
            with handle:
                handle.write(key)
            path = Path(handle.name)
            temporary_files.append(path)
            signers.append({"keyId": key_id, "privateKeyFile": str(path)})
        promote_request = contracts / "terminal-scene-promote-request.json"
        promote_receipt = contracts / "terminal-scene-promote-receipt.json"
        write_json(promote_request, {
            "schemaVersion": 1,
            "operation": "terminal.scene.promote",
            "sceneDirectory": str(scene),
            "sourceCommit": source_commit,
            "channel": channel,
            "releaseVersion": release_version,
            "publishedAt": request["publishedAt"],
            "artifactBaseUrl": request["artifactBaseUrl"].rstrip("/"),
            "outputDirectory": str(output),
            "signers": signers,
        })
        run_terminal(promote_request, promote_receipt)
    finally:
        for path in temporary_files:
            path.unlink(missing_ok=True)

    promoted = read_json(promote_receipt)
    write_json(args.receipt.resolve(), {
        "schemaVersion": 1,
        "operation": "exact.pack",
        "channel": channel,
        "releaseVersion": release_version,
        "sourceCommit": source_commit,
        "sceneDirectory": str(scene),
        "sceneDigest": promoted["sceneDigest"],
        "sceneReused": scene_reused,
        "artifacts": promoted["artifacts"],
        "documents": promoted["documents"],
        "closureMetadataFile": promoted["closureMetadataFile"],
        "terminalMetadataFile": promoted["terminalMetadataFile"],
        "channelHeadFile": promoted["channelHeadFile"],
    })


if __name__ == "__main__":
    main()
