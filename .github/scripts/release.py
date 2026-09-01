#!/usr/bin/env python3
"""Publish exact receipts: immutable objects, readback, then monotonic latest CAS."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request

CHANNELS = {"betahyx", "previewhyx"}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")


def request(url: str, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None):
    request_headers = dict(headers or {})
    token = os.environ.get("OD_EXACT_RELEASE_TOKEN")
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        return urllib.request.urlopen(req)
    except urllib.error.HTTPError as error:
        return error


def put_immutable(url: str, body: bytes, content_type: str) -> str:
    response = request(url, "PUT", body, {"If-None-Match": "*", "Content-Type": content_type, "Cache-Control": "public, max-age=31536000, immutable"})
    if response.status == 412:
        current = request(url)
        if current.status != 200 or current.read() != body:
            raise SystemExit(f"immutable object collision: {url}")
        return current.headers.get("ETag", "")
    if response.status != 200:
        raise SystemExit(f"immutable upload failed ({response.status}): {url}")
    return response.headers.get("ETag", "")


def release_number(version: str, channel: str) -> tuple[tuple[int, int, int], int]:
    match = re.fullmatch(rf"(\d+)\.(\d+)\.(\d+)-{channel}\.(\d+)", version)
    if match is None:
        raise SystemExit("invalid counted release version")
    return ((int(match[1]), int(match[2]), int(match[3])), int(match[4]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    args = parser.parse_args()
    publish = read_json(args.request.resolve())
    if publish.get("schemaVersion") != 1 or publish.get("operation") != "exact.release":
        raise SystemExit("unsupported exact release request")
    pack = read_json(Path(publish["packReceipt"]).resolve())
    channel = pack.get("channel")
    if channel not in CHANNELS:
        raise SystemExit("release channel must be betahyx or previewhyx")
    endpoint = publish["endpointUrl"].rstrip("/")
    bucket = publish["bucket"].strip("/")
    prefix = f"{endpoint}/{bucket}/{channel}"
    version = pack["releaseVersion"]
    uploaded: list[dict] = []
    for artifact in pack["artifacts"]:
        path = Path(artifact["file"]).resolve()
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != artifact["sha256"] or len(body) != artifact["size"]:
            raise SystemExit(f"pack receipt verification failed: {path}")
        url = f"{prefix}/{version}/{path.name}"
        etag = put_immutable(url, body, "application/octet-stream")
        uploaded.append({"url": url, "etag": etag, "sha256": artifact["sha256"]})

    documents = []
    for document in pack["documents"]:
        path = Path(document["file"]).resolve()
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != document["sha256"] or len(body) != document["size"]:
            raise SystemExit(f"document receipt verification failed: {path}")
        url = f"{prefix}/{version}/{path.name}"
        etag = put_immutable(url, body, "application/json; charset=utf-8")
        readback = request(url)
        if readback.status != 200 or readback.read() != body:
            raise SystemExit(f"exact document readback failed: {url}")
        documents.append({"url": url, "etag": etag, "sha256": document["sha256"]})

    head_path = Path(pack["channelHeadFile"]).resolve()
    head_body = head_path.read_bytes()
    latest_url = f"{prefix}/latest/channel-head.json"
    current = request(latest_url)
    headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60"}
    if current.status == 404:
        headers["If-None-Match"] = "*"
    elif current.status == 200:
        current_body = current.read()
        if current_body == head_body:
            latest_etag = current.headers.get("ETag", "")
            write_json(args.receipt.resolve(), {"schemaVersion": 1, "operation": "exact.release", "channel": channel, "releaseVersion": version, "latestChannelHeadUrl": latest_url, "latestChannelHeadEtag": latest_etag, "documents": documents, "artifacts": uploaded, "replayed": True})
            return
        current_head = json.loads(current_body)["head"]
        incoming_head = json.loads(head_body)["head"]
        advanced = False
        for lane in ("closure", "terminal"):
            current_version = current_head["lanes"][lane]["releaseVersion"]
            incoming_version = incoming_head["lanes"][lane]["releaseVersion"]
            order = release_number(incoming_version, channel) > release_number(current_version, channel)
            if release_number(incoming_version, channel) < release_number(current_version, channel):
                raise SystemExit(f"{lane} lane would move backward: {current_version} -> {incoming_version}")
            advanced = advanced or order
        if not advanced:
            raise SystemExit("channel head CAS would not advance either lane")
        headers["If-Match"] = current.headers.get("ETag", "")
    else:
        raise SystemExit(f"latest inspection failed ({current.status})")
    promoted = request(latest_url, "PUT", head_body, headers)
    if promoted.status != 200:
        raise SystemExit(f"latest CAS failed ({promoted.status})")
    write_json(args.receipt.resolve(), {"schemaVersion": 1, "operation": "exact.release", "channel": channel, "releaseVersion": version, "latestChannelHeadUrl": latest_url, "latestChannelHeadEtag": promoted.headers.get("ETag", ""), "documents": documents, "artifacts": uploaded, "replayed": False})


if __name__ == "__main__":
    main()
