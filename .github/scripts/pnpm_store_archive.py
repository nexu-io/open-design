#!/usr/bin/env python3
"""Pack pnpm's reusable content store without tar's small-file overhead."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path


VERSION = "26.03"
VERSION_TOKEN = "2603"
RELEASE_URL = f"https://github.com/ip7z/7zip/releases/download/{VERSION}"
ASSETS = {
    ("Darwin", "arm64"): (
        "7z2603-mac.tar.xz",
        "5ca87677072c59f5602e5c49baa27d4694bacd2259b4e507f0094249d4281480",
    ),
    ("Darwin", "x86_64"): (
        "7z2603-mac.tar.xz",
        "5ca87677072c59f5602e5c49baa27d4694bacd2259b4e507f0094249d4281480",
    ),
    ("Linux", "aarch64"): (
        "7z2603-linux-arm64.tar.xz",
        "2389ba20e4d8295e8709c20b6263b69bd1ec4972fe38a04ad7a1badbf595b996",
    ),
    ("Linux", "x86_64"): (
        "7z2603-linux-x64.tar.xz",
        "dc99eff5008f1ab79bd7084c68513701547a808a89502bf4133683535ab3c695",
    ),
}


def _run(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, **kwargs)


def _seven_zip_version(binary: Path) -> str | None:
    try:
        result = subprocess.run(
            [str(binary)], check=False, text=True, capture_output=True, timeout=15
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    match = re.search(r"7-Zip.*?([0-9]{2}\.[0-9]{2})", result.stdout + result.stderr)
    return match.group(1) if match else None


def _installed_candidates() -> list[Path]:
    candidates = [Path(found) for name in ("7zz", "7z") if (found := shutil.which(name))]
    if os.name == "nt":
        for root_name in ("ProgramFiles", "ProgramFiles(x86)"):
            if root := os.environ.get(root_name):
                candidates.append(Path(root) / "7-Zip" / "7z.exe")
    return candidates


def _download(url: str, destination: Path, expected_sha256: str) -> None:
    digest = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=60) as response, destination.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    actual = digest.hexdigest()
    if actual != expected_sha256:
        destination.unlink(missing_ok=True)
        raise RuntimeError(f"7-Zip archive checksum mismatch: expected {expected_sha256}, got {actual}")


def _bootstrap_unix(tool_dir: Path) -> Path:
    key = (platform.system(), platform.machine().lower())
    if key not in ASSETS:
        raise RuntimeError(f"unsupported 7-Zip host: {key[0]} {key[1]}")
    asset, digest = ASSETS[key]
    tool_dir.mkdir(parents=True, exist_ok=True)
    binary = tool_dir / "7zz"
    if _seven_zip_version(binary) == VERSION:
        return binary

    with tempfile.TemporaryDirectory(prefix="open-design-7zip-") as temporary:
        archive = Path(temporary) / asset
        _download(f"{RELEASE_URL}/{asset}", archive, digest)
        with tarfile.open(archive, "r:xz") as bundle:
            member = bundle.getmember("7zz")
            source = bundle.extractfile(member)
            if source is None:
                raise RuntimeError(f"{asset} does not contain 7zz")
            with binary.open("wb") as output:
                shutil.copyfileobj(source, output)
    binary.chmod(binary.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return binary


def bootstrap(tool_dir: Path) -> Path:
    for candidate in _installed_candidates():
        if _seven_zip_version(candidate) == VERSION:
            return candidate.resolve()
    if os.name == "nt":
        raise RuntimeError(
            f"7-Zip {VERSION} is required; the Windows runner image does not provide it"
        )
    binary = _bootstrap_unix(tool_dir)
    if _seven_zip_version(binary) != VERSION:
        raise RuntimeError(f"downloaded 7-Zip binary is not version {VERSION}")
    return binary.resolve()


def _reusable_roots(store: Path) -> list[Path]:
    versions = [store] if re.fullmatch(r"v[0-9]+", store.name) else [
        path for path in store.glob("v*") if path.is_dir()
    ]
    roots = sorted(
        path
        for version in versions
        for name in ("files", "index")
        if (path := version / name).is_dir()
    )
    if not roots or not any(path.name == "files" for path in roots):
        raise RuntimeError(f"pnpm content store is empty: {store}")
    return roots


def _append_timing(
    path: Path | None,
    operation: str,
    duration_ms: int,
    status: str,
    measurements: dict[str, int] | None = None,
) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as output:
        entry = {
            "operation": "pnpm-store-archive",
            "phase": "cache",
            "target": operation,
            "status": status,
            "durationMs": duration_ms,
        }
        entry.update(measurements or {})
        output.write(json.dumps(entry, separators=(",", ":")) + "\n")


def pack(store: Path, archive: Path, binary: Path, timing_path: Path | None) -> None:
    roots = _reusable_roots(store)
    archive.parent.mkdir(parents=True, exist_ok=True)
    archive.unlink(missing_ok=True)
    relative_roots = [str(root.relative_to(store)) for root in roots]
    started = time.monotonic()
    status = "failed"
    try:
        _run(
            [
                str(binary),
                "a",
                "-t7z",
                "-mx=1",
                "-mmt=on",
                "-bd",
                str(archive),
                *relative_roots,
            ],
            cwd=store,
        )
        _run([str(binary), "t", "-bd", str(archive)], stdout=subprocess.DEVNULL)
        status = "built"
    finally:
        _append_timing(
            timing_path,
            "pack",
            round((time.monotonic() - started) * 1000),
            status,
            {
                "archiveBytes": archive.stat().st_size if archive.is_file() else 0,
                "reusableRoots": len(roots),
            },
        )


def unpack(store: Path, archive: Path, binary: Path, timing_path: Path | None) -> None:
    if not archive.is_file():
        raise RuntimeError(f"pnpm store archive does not exist: {archive}")
    if any(store.glob("v*/files")):
        raise RuntimeError(f"refusing to unpack over an existing pnpm content store: {store}")
    store.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    status = "failed"
    try:
        # Extraction performs the same per-block CRC validation as `7zz t`.
        # Testing first would read and decompress the complete archive twice on
        # every warm cache hit.
        _run([str(binary), "x", "-y", "-bd", f"-o{store}", str(archive)])
        _reusable_roots(store)
        status = "restored"
    finally:
        _append_timing(
            timing_path,
            "unpack",
            round((time.monotonic() - started) * 1000),
            status,
            {"archiveBytes": archive.stat().st_size},
        )


def _path(value: str | None) -> Path | None:
    return Path(value).expanduser().resolve() if value else None


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    bootstrap_parser = subparsers.add_parser("bootstrap")
    bootstrap_parser.add_argument("--tool-dir", required=True)
    bootstrap_parser.add_argument("--github-output")
    bootstrap_parser.add_argument("--timing-path")

    for command in ("pack", "unpack"):
        command_parser = subparsers.add_parser(command)
        command_parser.add_argument("--store", required=True)
        command_parser.add_argument("--archive", required=True)
        command_parser.add_argument("--seven-zip", required=True)
        command_parser.add_argument("--timing-path")

    arguments = parser.parse_args()
    if arguments.command == "bootstrap":
        started = time.monotonic()
        status = "failed"
        timing_path = _path(arguments.timing_path)
        try:
            binary = bootstrap(Path(arguments.tool_dir).expanduser().resolve())
            status = "ready"
        finally:
            _append_timing(
                timing_path,
                "bootstrap",
                round((time.monotonic() - started) * 1000),
                status,
            )
        archive_path = Path.home() / ".cache" / "open-design" / "pnpm-store-archives" / "store-v1.7z"
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        values = {
            "archive-path": str(archive_path),
            "path": str(binary),
            "version": VERSION_TOKEN,
        }
        if arguments.github_output:
            with Path(arguments.github_output).open("a", encoding="utf-8") as output:
                for key, value in values.items():
                    output.write(f"{key}={value}\n")
        print(json.dumps(values, separators=(",", ":")))
        return 0

    store = Path(arguments.store).expanduser().resolve()
    archive = Path(arguments.archive).expanduser().resolve()
    binary = Path(arguments.seven_zip).expanduser().resolve()
    timing_path = _path(arguments.timing_path)
    if _seven_zip_version(binary) != VERSION:
        raise RuntimeError(f"expected 7-Zip {VERSION}: {binary}")
    if arguments.command == "pack":
        pack(store, archive, binary, timing_path)
    else:
        unpack(store, archive, binary, timing_path)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"pnpm-store-archive: {error}", file=sys.stderr)
        raise SystemExit(1)
