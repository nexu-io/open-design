#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--installed-root", type=Path, required=True)
    parser.add_argument("--shell-type", required=True)
    parser.add_argument("--target", required=True)
    args = parser.parse_args()

    published = read_json(args.root / "published" / "publish-receipt.json")
    required = read_json(args.root / "required-acceptance.json")
    proof = read_json(args.root / "installed-proof.json")
    manifest_path = args.installed_root / "install-manifest.json"
    manifest = read_json(manifest_path)
    sidecar_digest = (args.installed_root / "install-manifest.sha256").read_text().split()[0]
    manifest_digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    runtime = {operation: read_json(args.root / f"runtime-{operation}.json") for operation in ("start", "status", "stop")}

    shell = required["shell"]
    if manifest.get("target") != required["target"] or manifest.get("shell") != shell:
        raise SystemExit("installed Shell manifest does not bind the published contribution")
    if manifest_digest != sidecar_digest:
        raise SystemExit("installed Shell manifest digest mismatch")
    if proof.get("outcome") != "ready":
        raise SystemExit("installed Shell probe did not complete")

    started, status, stopped = (runtime[operation].get("result", {}) for operation in ("start", "status", "stop"))
    if any(runtime[operation].get("outcome") != "ready" for operation in runtime):
        raise SystemExit("installed Shell lifecycle did not complete")
    if started.get("state") != "running" or started.get("references") != 1 or not isinstance(started.get("attachmentCapability"), str):
        raise SystemExit("installed Shell did not establish an attached generation")
    if status.get("state") != "running" or status.get("generationId") != started.get("generationId") or status.get("bindingDigest") != started.get("bindingDigest"):
        raise SystemExit("installed Shell status lost its exact generation binding")
    if status.get("sidecar", {}).get("generationPid") != started.get("sidecar", {}).get("generationPid") or status.get("sidecar", {}).get("status") != "ready":
        raise SystemExit("installed Shell status lost its Sidecar generation")
    if stopped.get("state") != "stopped" or stopped.get("sidecar", {}).get("remainingPids") != []:
        raise SystemExit("installed Shell did not stop its lifecycle and physical Sidecar")

    credential = {
        "schemaVersion": 1, "operation": "exact.acceptance", "status": "accepted",
        "channel": published["channel"], "releaseVersion": published["releaseVersion"], "sourceCommit": published["sourceCommit"],
        "shell": shell, "target": required["target"], "artifact": required["artifact"], "shellMetadata": required["shellMetadata"],
        "installed": {"shell": manifest["shell"], "target": manifest["target"], "proof": proof, "runtime": runtime},
    }
    destination = args.root / "acceptance"
    destination.mkdir()
    destination.joinpath(f"{args.shell_type}-{args.target}.json").write_text(json.dumps(credential, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
