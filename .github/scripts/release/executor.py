#!/usr/bin/env python3
"""Restore one verified platform executor without preparing the JS workspace."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import posixpath
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


MAX_PRODUCT_BYTES = 1024 * 1024 * 1024
MAX_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024
MAX_ENTRIES = 100_000
PROTOCOL = "open-design-release-executor-v1"
PROGRESS_INTERVAL_SECONDS = 15


def log_progress(message: str, **fields: object) -> None:
    details = " ".join(f"{key}={value}" for key, value in fields.items())
    print(f"[release-executor] {message}{' ' + details if details else ''}", file=sys.stderr, flush=True)


class DownloadProgress:
    def __init__(self, attempt: int) -> None:
        self.attempt = attempt
        self.started = time.monotonic()
        self.received = 0
        self.expected: int | None = None
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self.report_until_stopped, daemon=True)

    def __enter__(self) -> DownloadProgress:
        log_progress("download:start", attempt=self.attempt)
        self.thread.start()
        return self

    def __exit__(self, _type: object, _value: object, _traceback: object) -> None:
        self.stopped.set()
        self.thread.join()
        self.report("download:stop")

    def report_until_stopped(self) -> None:
        while not self.stopped.wait(PROGRESS_INTERVAL_SECONDS):
            self.report("download:heartbeat")

    def report(self, event: str) -> None:
        elapsed = max(time.monotonic() - self.started, 0.001)
        log_progress(
            event,
            attempt=self.attempt,
            elapsedSeconds=round(elapsed, 1),
            receivedMiB=round(self.received / (1024 * 1024), 1),
            expectedMiB=round(self.expected / (1024 * 1024), 1) if self.expected is not None else "unknown",
            averageMiBPerSecond=round(self.received / (1024 * 1024) / elapsed, 2),
        )


def fail(message: str) -> None:
    raise ValueError(message)


def host_identity() -> tuple[str, str]:
    system = {"darwin": "darwin", "linux": "linux", "win32": "win32"}.get(sys.platform)
    machine = platform.machine().lower()
    arch = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64", "amd64": "x64"}.get(machine)
    if system is None or arch is None:
        fail(f"unsupported executor host: {sys.platform}/{machine}")
    return system, arch


def safe_member(name: str) -> PurePosixPath:
    path = PurePosixPath(name.rstrip("/"))
    if not name or name.startswith(("/", "\\")) or "\\" in name or ".." in path.parts:
        fail(f"unsafe executor archive entry: {name!r}")
    return path


def extract_executor(product: Path, destination: Path) -> dict[str, object]:
    if destination.exists() or destination.is_symlink():
        fail(f"executor destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".release-executor-", dir=destination.parent) as temporary:
        temporary_root = Path(temporary)
        archive = temporary_root / "workspace.tar.gz"
        with zipfile.ZipFile(product, "r") as product_zip:
            members = [entry for entry in product_zip.infolist() if not entry.is_dir()]
            if len(members) != 1 or members[0].filename != "workspace.tar.gz":
                fail("executor product must contain only workspace.tar.gz")
            if members[0].file_size > MAX_PRODUCT_BYTES:
                fail("executor product payload exceeds 1 GiB")
            with product_zip.open(members[0], "r") as source, archive.open("xb") as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)

        stage = temporary_root / "executor"
        stage.mkdir()
        links: list[tuple[Path, str]] = []
        with tarfile.open(archive, "r:gz") as executor_tar:
            members = executor_tar.getmembers()
            if len(members) > MAX_ENTRIES or sum(member.size for member in members) > MAX_EXPANDED_BYTES:
                fail("executor archive exceeds extraction limits")
            seen: set[str] = set()
            for member in members:
                relative = safe_member(member.name)
                normalized = relative.as_posix()
                if normalized in seen:
                    fail(f"duplicate executor archive entry: {normalized}")
                seen.add(normalized)
                target = stage.joinpath(*relative.parts)
                if member.issym():
                    target_name = member.linkname
                    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(normalized), target_name))
                    if not target_name or target_name.startswith(("/", "\\")) or "\\" in target_name or resolved == ".." or resolved.startswith("../"):
                        fail(f"executor archive link escapes its root: {normalized}")
                    links.append((target, normalized))
                    continue
                if not member.isfile() and not member.isdir():
                    fail(f"executor archive entry is not a regular file: {normalized}")
        subprocess.run(["tar", "-xzf", str(archive), "-C", str(stage)], check=True)
        for target, normalized in links:
            canonical = target.resolve(strict=True)
            if not canonical.is_relative_to(stage.resolve()):
                fail(f"executor archive link escapes its root: {normalized}")

        manifest_path = stage / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        host_platform, host_arch = host_identity()
        expected_entries = {"pack": "pack/dist/index.mjs", "release": "release/dist/index.mjs"}
        if manifest != {
            "arch": host_arch,
            "entries": expected_entries,
            "platform": host_platform,
            "protocol": PROTOCOL,
            "schemaVersion": 1,
        }:
            fail("executor manifest differs from the current host contract")
        required = [
            *expected_entries.values(),
            "pack/node_modules/pnpm/bin/pnpm.cjs",
            "pack/node_modules/esbuild/bin/esbuild",
        ]
        if any(not (stage / entry).is_file() for entry in required):
            fail("executor product is missing a required entry")
        os.rename(stage, destination)
    return manifest


def download(url: str, sha256: str, destination: Path, timeout: float) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        fail("executor URL must be a public HTTPS object address")
    if len(sha256) != 64 or any(character not in "0123456789abcdef" for character in sha256):
        fail("executor SHA-256 is invalid")
    request = urllib.request.Request(url, headers={"User-Agent": "open-design-release-executor/1"})
    for attempt in range(2):
        try:
            digest = hashlib.sha256()
            with DownloadProgress(attempt + 1) as progress:
                with urllib.request.urlopen(request, timeout=timeout) as source, destination.open("xb") as target:
                    if source.status != 200:
                        raise OSError(f"unexpected executor response status: {source.status}")
                    length = source.headers.get("Content-Length")
                    if length is not None and length.isdigit():
                        progress.expected = int(length)
                    log_progress("download:connected", attempt=attempt + 1, status=source.status, expectedBytes=length or "unknown")
                    while chunk := source.read(1024 * 1024):
                        progress.received += len(chunk)
                        if progress.received > MAX_PRODUCT_BYTES:
                            fail("executor product exceeds 1 GiB")
                        digest.update(chunk)
                        target.write(chunk)
            if digest.hexdigest() != sha256:
                fail("executor product digest mismatch")
            log_progress("download:verified", attempt=attempt + 1, bytes=progress.received)
            return
        except urllib.error.HTTPError as error:
            destination.unlink(missing_ok=True)
            log_progress("download:http-error", attempt=attempt + 1, status=error.code)
            if attempt or error.code not in {408, 429, 500, 502, 503, 504}:
                raise
        except (TimeoutError, ConnectionError, urllib.error.URLError) as error:
            destination.unlink(missing_ok=True)
            log_progress("download:network-error", attempt=attempt + 1, error=type(error).__name__)
            if attempt:
                raise


def append_environment(destination: Path) -> None:
    environment = os.environ.get("GITHUB_ENV")
    if not environment:
        return
    values = {
        "RELEASE_EXECUTOR_ROOT": str(destination),
        "npm_execpath": str(destination / "pack/node_modules/pnpm/bin/pnpm.cjs"),
    }
    if any("\n" in value or "\r" in value for value in values.values()):
        fail("executor environment contains a line break")
    with Path(environment).open("a", encoding="utf-8") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")


def restore(args: argparse.Namespace) -> int:
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="release-executor-download-", dir=output.parent) as temporary:
        product = Path(temporary) / "product.zip"
        download(args.url, args.sha256, product, args.timeout)
        extraction_started = time.monotonic()
        log_progress("extract:start", productBytes=product.stat().st_size)
        manifest = extract_executor(product, output)
        log_progress("extract:done", elapsedSeconds=round(time.monotonic() - extraction_started, 1))
    append_environment(output)
    log_progress("restore:done", elapsedSeconds=round(time.monotonic() - started, 1))
    print(json.dumps({"manifest": manifest, "output": str(output)}, sort_keys=True))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    command = subparsers.add_parser("restore")
    command.add_argument("--url", required=True)
    command.add_argument("--sha256", required=True)
    command.add_argument("--output", required=True, type=Path)
    command.add_argument("--timeout", default=60.0, type=float)
    args = parser.parse_args()
    if args.command == "restore":
        return restore(args)
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, zipfile.BadZipFile, tarfile.TarError, json.JSONDecodeError) as error:
        print(f"release-executor: {error}", file=sys.stderr)
        raise SystemExit(2)
