#!/usr/bin/env python3
"""Publish immutable exact objects and activate accepted channel heads."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request
from typing import Any

IDENTIFIER = re.compile(r"^[a-z][a-z0-9-]{0,31}$")


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"JSON document must be an object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")


def http(url: str, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None):
    request_headers = dict(headers or {})
    token = os.environ.get("OD_EXACT_RELEASE_TOKEN")
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    value = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        return urllib.request.urlopen(value, timeout=30)
    except urllib.error.HTTPError as error:
        return error


def put_immutable(url: str, body: bytes, content_type: str) -> tuple[str, bool]:
    response = http(url, "PUT", body, {"If-None-Match": "*", "Content-Type": content_type,
                                       "Cache-Control": "public, max-age=31536000, immutable"})
    if response.status == 412:
        current = http(url)
        if current.status != 200 or current.read() != body:
            raise SystemExit(f"immutable object collision: {url}")
        return current.headers.get("ETag", ""), True
    if response.status not in {200, 201}:
        raise SystemExit(f"immutable upload failed ({response.status}): {url}")
    return response.headers.get("ETag", ""), False


def release_number(version: str, channel: str) -> tuple[int, int, int, int]:
    match = re.fullmatch(rf"(\d+)\.(\d+)\.(\d+)-{re.escape(channel)}\.(\d+)", version)
    if match is None:
        raise SystemExit("invalid counted release version")
    return tuple(int(match[index]) for index in range(1, 5))


def validate_lane_transition(current_lanes: dict[str, Any], incoming_lanes: dict[str, Any], channel: str) -> None:
    removed = set(current_lanes) - set(incoming_lanes)
    if removed:
        raise SystemExit(f"channel head would remove lanes: {sorted(removed)}")
    advanced = bool(set(incoming_lanes) - set(current_lanes))
    for lane in sorted(current_lanes):
        old, new = current_lanes[lane]["releaseVersion"], incoming_lanes[lane]["releaseVersion"]
        if release_number(new, channel) < release_number(old, channel):
            raise SystemExit(f"{lane} lane would move backward: {old} -> {new}")
        advanced = advanced or release_number(new, channel) > release_number(old, channel)
    if not advanced:
        raise SystemExit("channel head CAS would not advance or add any lane")


def verified_file(value: dict[str, Any], label: str) -> Path:
    path = Path(str(value.get("file", ""))).resolve()
    body = path.read_bytes()
    if hashlib.sha256(body).hexdigest() != value.get("sha256") or len(body) != value.get("size"):
        raise SystemExit(f"{label} receipt verification failed: {path}")
    return path


def storage(request: dict[str, Any]) -> tuple[str, str]:
    endpoint = str(request.get("endpointUrl", "")).rstrip("/")
    bucket = str(request.get("bucket", "")).strip("/")
    if not re.fullmatch(r"https?://[^\s]+", endpoint) or not bucket or "/" in bucket:
        raise SystemExit("invalid exact release storage endpoint or bucket")
    return endpoint, bucket


def publish(request: dict[str, Any], receipt_path: Path) -> None:
    pack = read_json(Path(str(request.get("packReceipt", ""))).resolve())
    if pack.get("schemaVersion") != 2 or pack.get("operation") != "exact.pack":
        raise SystemExit("invalid exact pack receipt")
    channel, version = str(pack.get("channel", "")), str(pack.get("releaseVersion", ""))
    if not IDENTIFIER.fullmatch(channel):
        raise SystemExit("invalid release channel")
    release_number(version, channel)
    endpoint, bucket = storage(request)
    prefix = f"{endpoint}/{bucket}/{channel}/{version}"
    objects: list[dict[str, Any]] = []
    names: set[str] = set()
    all_replayed = True
    for kind in ("artifacts", "documents"):
        for value in pack[kind]:
            path = verified_file(value, kind[:-1])
            if path.name in names:
                raise SystemExit(f"duplicate exact object name: {path.name}")
            names.add(path.name)
            body = path.read_bytes()
            url = f"{prefix}/{path.name}"
            content_type = value.get("mediaType", "application/octet-stream") if kind == "artifacts" else "application/json; charset=utf-8"
            etag, replayed = put_immutable(url, body, content_type)
            all_replayed = all_replayed and replayed
            if kind == "documents":
                readback = http(url)
                if readback.status != 200 or readback.read() != body:
                    raise SystemExit(f"exact document readback failed: {url}")
            objects.append({"kind": kind[:-1], "name": path.name, "url": url, "etag": etag,
                            "sha256": value["sha256"], "size": value["size"]})
    public_by_name = {item["name"]: item for item in objects}
    required = []
    for acceptance in pack["requiredAcceptances"]:
        archive_name = Path(acceptance["artifact"]["url"]).name
        metadata_name = Path(acceptance["shellMetadata"]["url"]).name
        archive, metadata = public_by_name.get(archive_name), public_by_name.get(metadata_name)
        if archive is None or metadata is None:
            raise SystemExit("required acceptance is not backed by published objects")
        required.append({**acceptance, "artifact": {**acceptance["artifact"], "url": archive["url"]},
                         "shellMetadata": {**acceptance["shellMetadata"], "url": metadata["url"]}})
    head_path = verified_file(next(value for value in pack["documents"] if Path(value["file"]).resolve() == Path(pack["channelHeadFile"]).resolve()), "channel head")
    write_json(receipt_path, {
        "schemaVersion": 1, "operation": "exact.publish", "channel": channel, "releaseVersion": version,
        "sourceCommit": pack["sourceCommit"], "latestChannelHeadUrl": f"{endpoint}/{bucket}/{channel}/latest/channel-head.json",
        "channelHead": {**next(item for item in objects if item["name"] == head_path.name), "file": str(head_path)},
        "objects": objects, "requiredAcceptances": required, "replayed": all_replayed,
    })


def validate_acceptances(published: dict[str, Any], paths: Any) -> list[dict[str, Any]]:
    if not isinstance(paths, list):
        raise SystemExit("exact.activate requires acceptanceCredentials")
    credentials = [read_json(Path(str(path)).resolve()) for path in paths]
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for credential in credentials:
        shell = credential.get("shell", {})
        key = (str(shell.get("type", "")), str(credential.get("target", "")))
        if credential.get("schemaVersion") != 1 or credential.get("operation") != "exact.acceptance" or credential.get("status") != "accepted" or key in by_key:
            raise SystemExit(f"invalid or duplicate acceptance credential: {key[0]}/{key[1]}")
        by_key[key] = credential
    required_keys = {(item["shell"]["type"], item["target"]) for item in published["requiredAcceptances"]}
    if set(by_key) != required_keys:
        raise SystemExit(f"acceptance topology mismatch: required={sorted(required_keys)} actual={sorted(by_key)}")
    for expected in published["requiredAcceptances"]:
        credential = by_key[(expected["shell"]["type"], expected["target"])]
        for field in ("channel", "releaseVersion", "sourceCommit"):
            if credential.get(field) != published[field]:
                raise SystemExit(f"acceptance {field} binding mismatch")
        if credential.get("shell") != expected["shell"] or credential.get("artifact") != expected["artifact"] or credential.get("shellMetadata") != expected["shellMetadata"]:
            raise SystemExit("acceptance artifact or Shell binding mismatch")
        installed = credential.get("installed")
        if not isinstance(installed, dict) or installed.get("shell") != expected["shell"] or installed.get("target") != expected["target"]:
            raise SystemExit("acceptance lacks installed Shell proof")
    return credentials


def activate(request: dict[str, Any], receipt_path: Path) -> None:
    published = read_json(Path(str(request.get("publishReceipt", ""))).resolve())
    if published.get("schemaVersion") != 1 or published.get("operation") != "exact.publish":
        raise SystemExit("invalid exact.publish receipt")
    validate_acceptances(published, request.get("acceptanceCredentials"))
    head = published["channelHead"]
    head_path = verified_file(head, "published channel head")
    head_body = head_path.read_bytes()
    incoming_head = json.loads(head_body)["head"]
    channel = published["channel"]
    latest_url = published["latestChannelHeadUrl"]
    current = http(latest_url)
    headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60"}
    replayed = False
    if current.status == 404:
        headers["If-None-Match"] = "*"
    elif current.status == 200:
        current_body = current.read()
        if current_body == head_body:
            replayed = True
        else:
            current_head = json.loads(current_body)["head"]
            current_lanes, incoming_lanes = current_head.get("lanes", {}), incoming_head.get("lanes", {})
            validate_lane_transition(current_lanes, incoming_lanes, channel)
            etag = current.headers.get("ETag", "")
            if not etag:
                raise SystemExit("latest channel head lacks an ETag for CAS")
            headers["If-Match"] = etag
    else:
        raise SystemExit(f"latest inspection failed ({current.status})")
    if replayed:
        latest_etag = current.headers.get("ETag", "")
    else:
        promoted = http(latest_url, "PUT", head_body, headers)
        if promoted.status not in {200, 201}:
            raise SystemExit(f"latest CAS failed ({promoted.status})")
        latest_etag = promoted.headers.get("ETag", "")
    write_json(receipt_path, {"schemaVersion": 1, "operation": "exact.activate", "channel": channel,
        "releaseVersion": published["releaseVersion"], "sourceCommit": published["sourceCommit"],
        "latestChannelHeadUrl": latest_url, "latestChannelHeadEtag": latest_etag, "replayed": replayed})


def legacy_release(request: dict[str, Any], receipt_path: Path) -> None:
    """Keep the pre-split local harness working; trusted workflows must not use this operation."""
    pack = read_json(Path(str(request.get("packReceipt", ""))).resolve())
    if pack.get("schemaVersion") != 2 or pack.get("operation") != "exact.pack":
        legacy_release_v1(request, pack, receipt_path)
        return
    scratch = receipt_path.parent / f".{receipt_path.stem}-compat"
    publish_receipt = scratch / "publish.json"
    publish({**request, "operation": "exact.publish"}, publish_receipt)
    published = read_json(publish_receipt)
    credentials: list[str] = []
    for index, required in enumerate(published["requiredAcceptances"]):
        path = scratch / f"acceptance-{index}.json"
        write_json(path, {"schemaVersion": 1, "operation": "exact.acceptance", "status": "accepted",
            "channel": published["channel"], "releaseVersion": published["releaseVersion"], "sourceCommit": published["sourceCommit"],
            "shell": required["shell"], "target": required["target"], "artifact": required["artifact"],
            "shellMetadata": required["shellMetadata"], "installed": {"shell": required["shell"], "target": required["target"]}})
        credentials.append(str(path))
    activation_receipt = scratch / "activation.json"
    activate({"publishReceipt": str(publish_receipt), "acceptanceCredentials": credentials}, activation_receipt)
    result = read_json(activation_receipt)
    result["operation"] = "exact.release"
    result["artifacts"] = [item for item in published["objects"] if item["kind"] == "artifact"]
    result["documents"] = [item for item in published["objects"] if item["kind"] == "document"]
    write_json(receipt_path, result)


def legacy_release_v1(request: dict[str, Any], pack: dict[str, Any], receipt_path: Path) -> None:
    """Publish the old monolithic receipt without teaching the new protocol about it."""
    channel, version = str(pack.get("channel", "")), str(pack.get("releaseVersion", ""))
    if not IDENTIFIER.fullmatch(channel):
        raise SystemExit("invalid release channel")
    release_number(version, channel)
    endpoint, bucket = storage(request)
    prefix = f"{endpoint}/{bucket}/{channel}"
    uploaded: list[dict[str, Any]] = []
    all_replayed = True
    for kind in ("artifacts", "documents"):
        values = pack.get(kind)
        if not isinstance(values, list):
            raise SystemExit(f"legacy pack receipt lacks {kind}")
        for value in values:
            path = verified_file(value, kind[:-1])
            body = path.read_bytes()
            content_type = "application/json; charset=utf-8" if kind == "documents" else value.get("mediaType", "application/octet-stream")
            url = f"{prefix}/{version}/{path.name}"
            etag, replayed = put_immutable(url, body, content_type)
            all_replayed = all_replayed and replayed
            if kind == "documents":
                readback = http(url)
                if readback.status != 200 or readback.read() != body:
                    raise SystemExit(f"exact document readback failed: {url}")
            uploaded.append({"kind": kind[:-1], "url": url, "etag": etag, "sha256": value["sha256"]})

    head_path = Path(str(pack.get("channelHeadFile", ""))).resolve()
    head_body = head_path.read_bytes()
    latest_url = f"{prefix}/latest/channel-head.json"
    current = http(latest_url)
    headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60"}
    replayed = False
    if current.status == 404:
        headers["If-None-Match"] = "*"
    elif current.status == 200:
        current_body = current.read()
        if current_body == head_body:
            replayed = True
        else:
            current_head = json.loads(current_body)["head"]
            incoming_head = json.loads(head_body)["head"]
            validate_lane_transition(current_head.get("lanes", {}), incoming_head.get("lanes", {}), channel)
            etag = current.headers.get("ETag", "")
            if not etag:
                raise SystemExit("latest channel head lacks an ETag for CAS")
            headers["If-Match"] = etag
    else:
        raise SystemExit(f"latest inspection failed ({current.status})")
    if replayed:
        latest_etag = current.headers.get("ETag", "")
    else:
        promoted = http(latest_url, "PUT", head_body, headers)
        if promoted.status not in {200, 201}:
            raise SystemExit(f"latest CAS failed ({promoted.status})")
        latest_etag = promoted.headers.get("ETag", "")
    write_json(receipt_path, {
        "schemaVersion": 1, "operation": "exact.release", "channel": channel, "releaseVersion": version,
        "latestChannelHeadUrl": latest_url, "latestChannelHeadEtag": latest_etag,
        "documents": [item for item in uploaded if item["kind"] == "document"],
        "artifacts": [item for item in uploaded if item["kind"] == "artifact"], "replayed": replayed and all_replayed,
    })


def self_check() -> None:
    version = lambda number: {"releaseVersion": f"0.1.0-somechan.{number}"}
    validate_lane_transition({"content": version(1), "terminal": version(1)},
                             {"content": version(2), "terminal": version(2), "electron": version(2)}, "somechan")
    rejected = 0
    for current, incoming in (
        ({"content": version(2), "terminal": version(2)}, {"content": version(3)}),
        ({"content": version(2)}, {"content": version(1)}),
        ({"content": version(2)}, {"content": version(2)}),
    ):
        try:
            validate_lane_transition(current, incoming, "somechan")
        except SystemExit:
            rejected += 1
    if rejected != 3:
        raise SystemExit("exact release lane self-check failed")
    print("exact release lane transition self-check passed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        if args.request is not None or args.receipt is not None:
            raise SystemExit("--self-check does not accept request or receipt")
        self_check()
        return
    if args.request is None or args.receipt is None:
        raise SystemExit("--request and --receipt are required")
    request = read_json(args.request.resolve())
    if request.get("schemaVersion") != 1:
        raise SystemExit("unsupported exact release request schema")
    if request.get("operation") == "exact.publish":
        publish(request, args.receipt.resolve())
    elif request.get("operation") == "exact.activate":
        activate(request, args.receipt.resolve())
    elif request.get("operation") == "exact.release":
        legacy_release(request, args.receipt.resolve())
    else:
        raise SystemExit("unsupported exact release operation")


if __name__ == "__main__":
    main()
