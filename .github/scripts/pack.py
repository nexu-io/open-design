#!/usr/bin/env python3
"""Compose exact content and Shell documents from generic Shell contributions."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from typing import Any

DIGEST = re.compile(r"^[a-f0-9]{64}$")
IDENTIFIER = re.compile(r"^[a-z][a-z0-9-]{0,31}$")
SOURCE_COMMIT = re.compile(r"^[a-f0-9]{40}$")
TARGET = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
VERSION = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$")


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"JSON document must be an object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_bytes(value))


def described(path: Path, media_type: str | None = None) -> dict[str, Any]:
    body = path.read_bytes()
    value = {"file": str(path.resolve()), "sha256": hashlib.sha256(body).hexdigest(), "size": len(body)}
    if media_type is not None:
        value["mediaType"] = media_type
    return value


def checked_description(value: dict[str, Any], label: str, override: str | None = None) -> Path:
    path = Path(override or str(value.get("file", ""))).resolve()
    actual = described(path)
    if actual["sha256"] != value.get("sha256") or actual["size"] != value.get("size"):
        raise SystemExit(f"{label} binding verification failed: {path}")
    return path


def require_release(value: dict[str, Any]) -> None:
    channel = str(value.get("channel", ""))
    release = str(value.get("releaseVersion", ""))
    if not IDENTIFIER.fullmatch(channel):
        raise SystemExit("invalid release channel")
    if re.fullmatch(rf"\d+\.\d+\.\d+-{re.escape(channel)}\.\d+", release) is None:
        raise SystemExit("releaseVersion does not belong to channel")
    if not SOURCE_COMMIT.fullmatch(str(value.get("sourceCommit", ""))):
        raise SystemExit("sourceCommit must be a full lowercase SHA")
    if not VERSION.fullmatch(str(value.get("standaloneVersion", ""))):
        raise SystemExit("invalid standaloneVersion")
    if not isinstance(value.get("publishedAt"), str) or "T" not in value["publishedAt"]:
        raise SystemExit("publishedAt must be an ISO timestamp")
    if not re.fullmatch(r"https?://[^\s]+", str(value.get("artifactBaseUrl", ""))):
        raise SystemExit("artifactBaseUrl must use HTTP(S)")


def signing_keys() -> list[dict[str, str]]:
    keys: list[dict[str, str]] = []
    for suffix in ("", "_NEXT"):
        key_id = os.environ.get(f"OD_EXACT_SIGNING_KEY_ID{suffix}", "")
        private_key = os.environ.get(f"OD_EXACT_ED25519_PRIVATE_KEY{suffix}", "")
        key_file = os.environ.get(f"OD_EXACT_ED25519_PRIVATE_KEY_FILE{suffix}", "")
        if not private_key and key_file:
            private_key = Path(key_file).read_text(encoding="utf-8")
        if key_id or private_key:
            if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}", key_id) or not private_key:
                raise SystemExit(f"incomplete or invalid signing key pair: {suffix or 'primary'}")
            keys.append({"keyId": key_id, "privateKey": private_key})
    if not keys or len({item["keyId"] for item in keys}) != len(keys):
        raise SystemExit("at least one unique exact signing key is required")
    return keys


CRYPTO_SCRIPT = r"""
const {createPublicKey, sign, verify} = require('node:crypto');
let source = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => source += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(source);
  const payload = Buffer.from(input.payload, 'base64');
  const keys = input.keys.map(({keyId, privateKey}) => ({
    keyId,
    privateKey,
    publicKey: createPublicKey(privateKey).export({type: 'spki', format: 'pem'}),
  }));
  const result = {
    keys: keys.map(({keyId, publicKey}) => ({keyId, publicKey})),
    signatures: keys.map(({keyId, privateKey}) => ({algorithm: 'Ed25519', keyId, value: sign(null, payload, privateKey).toString('base64')})),
  };
  if (input.verify) result.verified = input.verify.some(signature => {
    const key = keys.find(candidate => candidate.keyId === signature.keyId);
    return key && signature.algorithm === 'Ed25519' && verify(null, payload, key.publicKey, Buffer.from(signature.value, 'base64'));
  });
  process.stdout.write(JSON.stringify(result));
});
"""


def crypto(value: Any, keys: list[dict[str, str]], verify_signatures: Any = None) -> dict[str, Any]:
    payload = {"payload": base64.b64encode(canonical_bytes(value)).decode(), "keys": keys,
               **({"verify": verify_signatures} if verify_signatures is not None else {})}
    result = subprocess.run(["node", "-e", CRYPTO_SCRIPT], input=json.dumps(payload), text=True, check=True, stdout=subprocess.PIPE)
    return json.loads(result.stdout)


def signed(field: str, value: dict[str, Any], keys: list[dict[str, str]]) -> dict[str, Any]:
    return {field: value, "signatures": crypto(value, keys)["signatures"]}


def semver_core(version: str) -> tuple[int, int, int]:
    return tuple(map(int, version.split("-")[0].split(".")))


def previous_requirements(path: str | None, channel: str, keys: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    if not path:
        return {}
    try:
        envelope = read_json(Path(path).resolve())
        metadata = envelope["metadata"]
        if not crypto(metadata, keys, envelope.get("signatures"))["verified"]:
            return {}
        if metadata.get("schemaVersion") != 4 or metadata.get("channel") != channel:
            return {}
        requirements = metadata["shellRequirements"]
        if not isinstance(requirements, list):
            return {}
        return {str(item["type"]): item for item in requirements}
    except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError):
        return {}


def prepare(request: dict[str, Any], receipt_path: Path) -> None:
    require_release(request)
    shells = request.get("shells")
    legacy_terminal = shells is None and request.get("shellVersion") is not None
    if legacy_terminal:
        shells = [{"type": "terminal", "version": request.get("shellVersion"), "scenes": request.get("scenes")}]
    if not isinstance(shells, list) or not shells:
        raise SystemExit("exact.prepare requires at least one Shell")
    shell_records: list[dict[str, Any]] = []
    shell_types: set[str] = set()
    closure_scene_digest: str | None = None
    standalone_scene_digest: str | None = None
    for shell in shells:
        if not isinstance(shell, dict):
            raise SystemExit("invalid Shell descriptor")
        shell_type, shell_version, scenes = str(shell.get("type", "")), str(shell.get("version", "")), shell.get("scenes")
        if not IDENTIFIER.fullmatch(shell_type) or shell_type in shell_types or not VERSION.fullmatch(shell_version):
            raise SystemExit(f"invalid or duplicate Shell identity: {shell_type}")
        if not isinstance(scenes, list) or not scenes:
            raise SystemExit(f"{shell_type} requires at least one scene")
        shell_types.add(shell_type)
        scene_records: list[dict[str, Any]] = []
        targets: set[str] = set()
        for raw in scenes:
            if not isinstance(raw, dict) or not TARGET.fullmatch(str(raw.get("target", ""))):
                raise SystemExit(f"invalid {shell_type} scene target")
            target = raw["target"]
            if target in targets:
                raise SystemExit(f"duplicate {shell_type} scene target: {target}")
            targets.add(target)
            directory = Path(str(raw.get("sceneDirectory", ""))).resolve()
            manifest_path = directory / "scene.json"
            binding = str(raw.get("sceneManifestSha256", ""))
            if not DIGEST.fullmatch(binding) or hashlib.sha256(manifest_path.read_bytes()).hexdigest() != binding:
                raise SystemExit(f"{shell_type} scene manifest binding failed: {target}")
            manifest = read_json(manifest_path)
            if manifest.get("schemaVersion") != 1 or manifest.get("target") != target or manifest.get("shellVersion") != shell_version:
                raise SystemExit(f"{shell_type} scene identity mismatch: {target}")
            build_hash = str(manifest.get("shellBuildHash", ""))
            scene_closure_digest = str(manifest.get("closure", {}).get("sha256", ""))
            scene_standalone_digest = str(manifest.get("standalone", {}).get("sha256", ""))
            if not DIGEST.fullmatch(build_hash) or not DIGEST.fullmatch(scene_closure_digest) or not DIGEST.fullmatch(scene_standalone_digest):
                raise SystemExit(f"{shell_type} scene lacks a valid build, Closure, or Standalone binding: {target}")
            if closure_scene_digest is not None and scene_closure_digest != closure_scene_digest:
                raise SystemExit("Shell scenes contain different Closure seeds")
            closure_scene_digest = scene_closure_digest
            if standalone_scene_digest is not None and scene_standalone_digest != standalone_scene_digest:
                raise SystemExit("Shell scenes contain different Standalone launcher seeds")
            standalone_scene_digest = scene_standalone_digest
            scene_records.append({"target": target, "directory": str(directory), "sceneManifestSha256": binding, "shellBuildHash": build_hash})
        scene_records.sort(key=lambda item: item["target"])
        composite_hash = hashlib.sha256(canonical_bytes([{"target": item["target"], "shellBuildHash": item["shellBuildHash"]} for item in scene_records])).hexdigest()
        shell_records.append({"type": shell_type, "version": shell_version, "buildHash": composite_hash, "scenes": scene_records})
    shell_records.sort(key=lambda item: item["type"])
    keys = signing_keys()
    old = previous_requirements(request.get("previousContentMetadataFile"), request["channel"], keys)
    for shell in shell_records:
        prior = old.get(shell["type"])
        shell["minimumVersion"] = shell["version"]
        if (prior and prior.get("buildHash") == shell["buildHash"] and VERSION.fullmatch(str(prior.get("minVersion", "")))
                and semver_core(prior["minVersion"]) <= semver_core(shell["version"])):
            shell["minimumVersion"] = prior["minVersion"]

    output = Path(str(request.get("outputDirectory", ""))).resolve()
    artifacts, documents, trust = output / "artifacts", output / "documents", output / "trust" / "keys.json"
    artifacts.mkdir(parents=True, exist_ok=True)
    closure_source = Path(str(request.get("closureArtifactFile", ""))).resolve()
    closure_digest = hashlib.sha256(closure_source.read_bytes()).hexdigest()
    if closure_digest != closure_scene_digest:
        raise SystemExit("Closure promotion input differs from Shell scenes")
    closure_file = artifacts / f"closure-{closure_digest}.mjs"
    shutil.copyfile(closure_source, closure_file)
    closure = described(closure_file, "text/javascript")
    standalone_source = Path(str(request.get("standaloneArtifactFile", ""))).resolve()
    standalone_digest = hashlib.sha256(standalone_source.read_bytes()).hexdigest()
    if standalone_digest != standalone_scene_digest:
        raise SystemExit("Standalone launcher promotion input differs from Shell scenes")
    standalone_file = artifacts / f"standalone-launcher-{standalone_digest}.mjs"
    shutil.copyfile(standalone_source, standalone_file)
    standalone = described(standalone_file, "text/javascript")
    base = request["artifactBaseUrl"].rstrip("/")
    metadata = {
        "schemaVersion": 4, "channel": request["channel"], "releaseVersion": request["releaseVersion"],
        "standaloneVersion": request["standaloneVersion"], "sourceCommit": request["sourceCommit"], "publishedAt": request["publishedAt"],
        "blobs": {
            closure["sha256"]: {"sha256": closure["sha256"], "size": closure["size"], "mediaType": "text/javascript", "sources": [{"kind": "remote", "url": f"{base}/{closure_file.name}"}]},
            standalone["sha256"]: {"sha256": standalone["sha256"], "size": standalone["size"], "mediaType": "text/javascript", "sources": [{"kind": "remote", "url": f"{base}/{standalone_file.name}"}]},
        },
        "resources": [
            {"id": "standalone-launcher", "component": "standalone.launcher", "blob": standalone["sha256"], "sync": True, "materialization": {"type": "file", "entrypoint": "launcher.mjs"}},
            {"id": "closure-fixture", "component": "standalone.resource", "blob": closure["sha256"], "sync": True, "materialization": {"type": "file", "entrypoint": "fixture.mjs"}},
        ],
        "shellRequirements": [{"type": item["type"], "minVersion": item["minimumVersion"], "buildHash": item["buildHash"]} for item in shell_records],
    }
    content_file = documents / "content-metadata.json"
    write_json(content_file, signed("metadata", metadata, keys))
    write_json(trust, {"schemaVersion": 1, "keys": crypto({}, keys)["keys"]})
    receipt = {
        "schemaVersion": 2, "operation": "exact.prepare", "channel": request["channel"], "releaseVersion": request["releaseVersion"],
        "sourceCommit": request["sourceCommit"], "publishedAt": request["publishedAt"], "artifactBaseUrl": base,
        "standaloneVersion": request["standaloneVersion"], "shells": shell_records, "closureArtifact": closure,
        "standaloneArtifact": standalone,
        "contentMetadata": described(content_file), "trustFile": described(trust),
    }
    if legacy_terminal:
        terminal = shell_records[0]
        receipt.update({"shellVersion": terminal["version"], "shellBuildHash": terminal["buildHash"],
                        "minimumShellVersion": terminal["minimumVersion"], "scenes": terminal["scenes"]})
    write_json(receipt_path, receipt)


def finalize(request: dict[str, Any], receipt_path: Path) -> None:
    prepared = read_json(Path(str(request.get("prepareReceipt", ""))).resolve())
    if prepared.get("schemaVersion") != 2 or prepared.get("operation") != "exact.prepare":
        raise SystemExit("invalid exact.prepare receipt")
    contributions = request.get("contributions")
    legacy_distributions = contributions is None and isinstance(request.get("distributions"), list)
    if legacy_distributions:
        contributions = request["distributions"]
    if not isinstance(contributions, list) or not contributions:
        raise SystemExit("exact.finalize requires Shell contributions")
    prepared_shells = {shell["type"]: shell for shell in prepared["shells"]}
    expected = {(shell["type"], scene["target"]) for shell in prepared["shells"] for scene in shell["scenes"]}
    seen: set[tuple[str, str]] = set()
    distributions: dict[str, list[dict[str, Any]]] = {shell_type: [] for shell_type in prepared_shells}
    closure_path = checked_description(prepared["closureArtifact"], "Closure artifact", request.get("closureArtifactFile"))
    standalone_path = checked_description(prepared["standaloneArtifact"], "Standalone launcher artifact", request.get("standaloneArtifactFile"))
    artifacts = [
        described(closure_path, prepared["closureArtifact"].get("mediaType", "application/octet-stream")),
        described(standalone_path, prepared["standaloneArtifact"].get("mediaType", "application/octet-stream")),
    ]
    for descriptor in contributions:
        if not isinstance(descriptor, dict):
            raise SystemExit("invalid Shell contribution descriptor")
        source_receipt = read_json(Path(str(descriptor.get("receipt", ""))).resolve())
        if legacy_distributions:
            target = str(source_receipt.get("target", ""))
            terminal = prepared_shells.get("terminal")
            scene = next((value for value in terminal["scenes"] if value["target"] == target), None) if terminal else None
            contribution = {"schemaVersion": 1, "operation": "shell.distribution.contribute", "target": target,
                "shell": {"type": "terminal", "version": terminal["version"] if terminal else "", "buildHash": scene["shellBuildHash"] if scene else ""},
                "artifact": source_receipt.get("archive", {}),
                "updater": {"protocol": "standalone-shell-updater-v3", "handler": "sidecar-v1", "interaction": "restart-and-install"}}
        else:
            contribution = source_receipt
        shell_type, target = str(contribution.get("shell", {}).get("type", "")), str(contribution.get("target", ""))
        key, shell = (shell_type, target), prepared_shells.get(shell_type)
        scene = next((value for value in shell["scenes"] if value["target"] == target), None) if shell else None
        if contribution.get("schemaVersion") != 1 or contribution.get("operation") != "shell.distribution.contribute" or key not in expected or key in seen:
            raise SystemExit(f"invalid or duplicate Shell contribution: {shell_type}/{target}")
        if contribution["shell"].get("version") != shell["version"] or contribution["shell"].get("buildHash") != scene["shellBuildHash"]:
            raise SystemExit(f"Shell contribution identity mismatch: {shell_type}/{target}")
        seen.add(key)
        archive = dict(contribution.get("artifact", {}))
        path = checked_description(archive, f"{shell_type}/{target} distribution", descriptor.get("archiveFile"))
        media_type = str(archive.get("mediaType", "application/octet-stream"))
        artifact = described(path, media_type)
        artifacts.append(artifact)
        updater = contribution.get("updater")
        if not isinstance(updater, dict) or updater.get("protocol") != "standalone-shell-updater-v3":
            raise SystemExit(f"Shell contribution lacks updater contract: {shell_type}/{target}")
        distributions[shell_type].append({"shell": {"type": shell_type, "version": shell["version"], "buildHash": scene["shellBuildHash"]},
            "target": target, "artifact": {"url": f"{prepared['artifactBaseUrl']}/{path.name}", "sha256": artifact["sha256"], "size": artifact["size"], "mediaType": media_type}, "updater": updater})
    if seen != expected:
        raise SystemExit(f"Shell contributions do not cover prepared topology: missing {sorted(expected - seen)}")

    keys = signing_keys()
    output = Path(str(request.get("outputDirectory", ""))).resolve()
    documents = output / "documents"
    documents.mkdir(parents=True, exist_ok=True)
    content_source = checked_description(prepared["contentMetadata"], "content metadata", request.get("contentMetadataFile"))
    content_file = documents / "content-metadata.json"
    shutil.copyfile(content_source, content_file)
    content, base = described(content_file), prepared["artifactBaseUrl"]
    lanes = {"content": {"releaseVersion": prepared["releaseVersion"], "url": f"{base}/{content_file.name}", "sha256": content["sha256"], "size": content["size"]}}
    shell_metadata: dict[str, dict[str, Any]] = {}
    required_acceptances: list[dict[str, Any]] = []
    shell_files: list[Path] = []
    for shell_type in sorted(distributions):
        values = sorted(distributions[shell_type], key=lambda item: item["target"])
        shell_document = {"schemaVersion": 1, "channel": prepared["channel"], "releaseVersion": prepared["releaseVersion"],
                          "sourceCommit": prepared["sourceCommit"], "publishedAt": prepared["publishedAt"], "distributions": values}
        shell_file = documents / f"{shell_type}-metadata.json"
        write_json(shell_file, signed("document", shell_document, keys))
        shell_files.append(shell_file)
        shell_description = described(shell_file)
        shell_metadata[shell_type] = shell_description
        lanes[shell_type] = {"releaseVersion": prepared["releaseVersion"], "url": f"{base}/{shell_file.name}", "sha256": shell_description["sha256"], "size": shell_description["size"]}
        for value in values:
            required_acceptances.append({"shell": value["shell"], "target": value["target"], "artifact": value["artifact"],
                "shellMetadata": {"url": lanes[shell_type]["url"], "sha256": shell_description["sha256"], "size": shell_description["size"]}})
    head = {"schemaVersion": 1, "channel": prepared["channel"], "publishedAt": prepared["publishedAt"], "lanes": lanes}
    head_file = documents / "channel-head.json"
    write_json(head_file, signed("head", head, keys))
    receipt = {"schemaVersion": 2, "operation": "exact.pack", "channel": prepared["channel"],
        "releaseVersion": prepared["releaseVersion"], "sourceCommit": prepared["sourceCommit"],
        "shells": [{key: shell[key] for key in ("type", "version", "buildHash", "minimumVersion")} for shell in prepared["shells"]],
        "artifacts": artifacts, "documents": [described(path) for path in [content_file, *shell_files, head_file]],
        "contentMetadataFile": str(content_file), "shellMetadataFiles": {key: value["file"] for key, value in shell_metadata.items()},
        "channelHeadFile": str(head_file), "requiredAcceptances": required_acceptances}
    if "terminal" in shell_metadata:
        terminal = prepared_shells["terminal"]
        receipt.update({"terminalMetadataFile": shell_metadata["terminal"]["file"], "shellBuildHash": terminal["buildHash"],
                        "minimumShellVersion": terminal["minimumVersion"]})
    write_json(receipt_path, receipt)


def legacy_pack(request: dict[str, Any], receipt_path: Path) -> None:
    """Preserve the pre-split tools harness contract during the phased migration."""
    scene = Path(str(request.get("sceneDirectory", ""))).resolve()
    manifest = read_json(scene / "scene.json")
    if manifest.get("standaloneVersion") != request.get("standaloneVersion"):
        raise SystemExit("requested standaloneVersion differs from Terminal scene")
    raise SystemExit(
        "legacy exact.pack can only reuse its validation contract; "
        "release-exact must use exact.prepare and exact.finalize"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    args = parser.parse_args()
    request = read_json(args.request.resolve())
    if request.get("schemaVersion") != 1:
        raise SystemExit("unsupported exact pack request schema")
    if request.get("operation") == "exact.prepare":
        prepare(request, args.receipt.resolve())
    elif request.get("operation") == "exact.finalize":
        finalize(request, args.receipt.resolve())
    elif request.get("operation") == "exact.pack":
        legacy_pack(request, args.receipt.resolve())
    else:
        raise SystemExit("unsupported exact pack operation")


if __name__ == "__main__":
    main()
