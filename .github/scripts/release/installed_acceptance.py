#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def verified_file(root: Path, value: dict, label: str) -> dict:
    path = root / str(value.get("file", ""))
    body = path.read_bytes()
    if hashlib.sha256(body).hexdigest() != value.get("sha256") or len(body) != value.get("size"):
        raise SystemExit(f"installed Electron {label} binding mismatch")
    return {"file": path.name, "sha256": value["sha256"], "size": value["size"]}


def verified_hot_generation(args, channel: str, release_version: str) -> dict:
    if args.standalone_state is None or args.standalone_generations_root is None:
        raise SystemExit("Electron hot acceptance requires Standalone generation state")
    state = read_json(args.standalone_state)
    generation_id = state.get("active")
    if (state.get("schemaVersion") != 4 or not isinstance(generation_id, str)
            or state.get("lastHealthy") != generation_id or state.get("prepared") is not None
            or state.get("activationIntent") is not None or state.get("activationAttempt") is not None):
        raise SystemExit("Electron hot acceptance found an unsettled Standalone generation")
    generation_path = args.standalone_generations_root / f"{generation_id}.json"
    generation = read_json(generation_path)
    if (generation.get("schemaVersion") != 4 or generation.get("id") != generation_id
            or generation.get("channel") != channel or generation.get("releaseVersion") != release_version):
        raise SystemExit("Electron hot acceptance did not activate the candidate Standalone generation")
    return {
        "generationId": generation_id,
        "generationSha256": hashlib.sha256(generation_path.read_bytes()).hexdigest(),
        "stateSha256": hashlib.sha256(args.standalone_state.read_bytes()).hexdigest(),
    }


def electron_proof(args, published: dict, required: dict) -> dict:
    installation_path = args.installed_root / "standalone-installation.json"
    installation = read_json(installation_path)
    if (installation.get("schemaVersion") != 1 or installation.get("channel") != published["channel"]
            or installation.get("target") != required["target"]):
        raise SystemExit("installed Electron release identity mismatch")
    hot_update = None
    if args.hot_acceptance_receipt is None:
        if installation.get("releaseVersion") != published["releaseVersion"]:
            raise SystemExit("installed Electron release identity mismatch")
    else:
        hot_update = read_json(args.hot_acceptance_receipt)
        results = hot_update.get("results", [])
        if (hot_update.get("schemaVersion") != 1 or hot_update.get("operation") != "electron.cdp.contract.invoked"
                or len(results) != 4 or any(not isinstance(result, dict) for result in results)):
            raise SystemExit("Electron CDP hot acceptance receipt is invalid")
        before, checked, applied, after = results
        applied_closure = applied.get("lines", {}).get("closure", {}) if isinstance(applied, dict) else {}
        if (checked.get("lines", {}).get("closure", {}).get("state") != "ready"
                or checked.get("lines", {}).get("closure", {}).get("candidateVersion") != published["releaseVersion"]
                or (applied.get("outcome") != "context-destroyed" and applied_closure.get("state") != "current")
                or before.get("lines", {}).get("shell", {}).get("currentVersion") != after.get("lines", {}).get("shell", {}).get("currentVersion")
                or after.get("lines", {}).get("shell", {}).get("state") == "applying"):
            raise SystemExit("Electron CDP did not prove an isolated Closure hot update")
        hot_generation = verified_hot_generation(args, published["channel"], published["releaseVersion"])
    files = {
        "host": verified_file(args.installed_root, installation.get("host", {}), "host"),
        "supervisor": verified_file(args.installed_root, installation.get("supervisor", {}), "supervisor"),
        "content": verified_file(args.installed_root, installation.get("content", {}), "content"),
        "trust": verified_file(args.installed_root, installation.get("trust", {}), "trust"),
        "seeds": [verified_file(args.installed_root, value, f"seed {index}") for index, value in enumerate(installation.get("seeds", []))],
    }
    if args.runtime_log is None:
        raise SystemExit("installed Electron acceptance requires its runtime log")
    attempts = {}
    for line in args.runtime_log.read_text(encoding="utf-8-sig").splitlines():
        event = json.loads(line)
        attempts.setdefault(event.get("attemptId"), []).append(event.get("event"))
    committed = next(((attempt_id, events) for attempt_id, events in attempts.items()
                      if "startup.committed" in events and "shutdown.complete" in events and "startup.failed" not in events), None)
    if committed is None:
        raise SystemExit("installed Electron headless startup did not commit and shut down cleanly")
    runtime = {"outcome": "ready", "attemptId": committed[0], "events": committed[1]}
    return {
        "shell": required["shell"],
        "target": installation["target"],
        "proof": {
            "installationSha256": hashlib.sha256(installation_path.read_bytes()).hexdigest(),
            "files": files,
            "runtime": runtime,
            "baselineReleaseVersion": installation["releaseVersion"],
            **({} if hot_update is None else {"hotUpdate": {
                "releaseVersion": published["releaseVersion"],
                "receiptSha256": hashlib.sha256(args.hot_acceptance_receipt.read_bytes()).hexdigest(),
                "discoveryUrl": hot_update["discoveryUrl"],
                **hot_generation,
            }}),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--installed-root", type=Path, required=True)
    parser.add_argument("--shell-type", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--runtime-log", type=Path)
    parser.add_argument("--hot-acceptance-receipt", type=Path)
    parser.add_argument("--standalone-state", type=Path)
    parser.add_argument("--standalone-generations-root", type=Path)
    args = parser.parse_args()

    published = read_json(args.root / "published" / "publish-receipt.json")
    required = read_json(args.root / "required-acceptance.json")
    shell = required["shell"]
    if args.shell_type == "electron":
        credential = {
            "schemaVersion": 1, "operation": "exact.acceptance", "status": "accepted",
            "channel": published["channel"], "releaseVersion": published["releaseVersion"], "sourceCommit": published["sourceCommit"],
            "shell": shell, "target": required["target"], "artifact": required["artifact"], "shellMetadata": required["shellMetadata"],
            "installIdentity": required["installIdentity"],
            "platformTrust": required["platformTrust"],
            "updater": required["updater"],
            "installed": electron_proof(args, published, required),
        }
        destination = args.root / "acceptance"
        destination.mkdir(exist_ok=True)
        destination.joinpath(f"{args.shell_type}-{args.target}.json").write_text(json.dumps(credential, sort_keys=True, separators=(",", ":")) + "\n")
        return

    proof = read_json(args.root / "installed-proof.json")
    manifest_path = args.installed_root / "install-manifest.json"
    manifest = read_json(manifest_path)
    sidecar_digest = (args.installed_root / "install-manifest.sha256").read_text().split()[0]
    manifest_digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    runtime = {operation: read_json(args.root / f"runtime-{operation}.json") for operation in ("start", "status", "stop")}

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
        "updater": required["updater"],
        "installed": {"shell": manifest["shell"], "target": manifest["target"], "proof": proof, "runtime": runtime},
    }
    destination = args.root / "acceptance"
    destination.mkdir(exist_ok=True)
    destination.joinpath(f"{args.shell_type}-{args.target}.json").write_text(json.dumps(credential, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
