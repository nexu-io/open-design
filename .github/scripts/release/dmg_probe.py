#!/usr/bin/env python3
"""Trace and replay the exact dmgbuild invocation in a diagnostic beta run."""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path


def prepare(pack_root: Path, trace_dir: Path, github_env: Path) -> None:
    trace_dir.mkdir(parents=True, exist_ok=True)
    javascript = r"""
const { createRequire } = require('node:module');
const { readFileSync, realpathSync } = require('node:fs');
const { join } = require('node:path');
const requireBuilder = createRequire(realpathSync(join(process.argv[1], 'node_modules/electron-builder/package.json')));
const dmgUtilSource = readFileSync(requireBuilder.resolve('dmg-builder/out/dmgUtil'), 'utf8');
if (!dmgUtilSource.includes('1664972f9cc2d6e8fce3b63e42cd30078aff602669c5856939c4519921200433') ||
    !dmgUtilSource.includes('CUSTOM_DMGBUILD_PATH')) {
  throw new Error('dmg-builder vendor contract changed; review diagnostic wrapper before running');
}
const { downloadBuilderToolset } = requireBuilder('app-builder-lib/out/util/electronGet');
downloadBuilderToolset({
  releaseName: 'dmg-builder@1.2.5',
  filenameWithExt: 'dmgbuild-bundle-x86_64-75c8a6c.tar.gz',
  checksums: { 'dmgbuild-bundle-x86_64-75c8a6c.tar.gz': '1664972f9cc2d6e8fce3b63e42cd30078aff602669c5856939c4519921200433' },
}).then(path => process.stdout.write(path + '\n')).catch(error => { console.error(error); process.exitCode = 1; });
"""
    result = subprocess.run(
        ["node", "-e", javascript, str(pack_root.resolve())],
        check=False, capture_output=True, text=True, timeout=120,
    )
    if result.returncode:
        raise RuntimeError(f"failed to prepare dmgbuild vendor: {result.stderr.strip()}")
    vendor_root = Path(result.stdout.strip().splitlines()[-1]).resolve()
    if not (vendor_root / "dmgbuild").is_file() or not (vendor_root / "python/bin/python3").is_file():
        raise RuntimeError(f"invalid dmgbuild bundle: {vendor_root}")
    wrapper = trace_dir / "dmgbuild-traced"
    wrapper.write_text(
        '#!/usr/bin/env bash\n'
        'set -euo pipefail\n'
        'export PYTHONPATH="$OD_DMG_VENDOR_ROOT/python/lib"\n'
        'exec "$OD_DMG_VENDOR_ROOT/python/bin/python3" "$OD_DMG_TRACE_SCRIPT" trace "$@"\n',
        encoding="utf-8",
    )
    wrapper.chmod(0o755)
    with github_env.open("a", encoding="utf-8") as stream:
        for key, value in {
            "CUSTOM_DMGBUILD_PATH": wrapper,
            "OD_DMG_VENDOR_ROOT": vendor_root,
            "OD_DMG_TRACE_SCRIPT": Path(__file__).resolve(),
            "OD_DMG_TRACE_DIR": trace_dir.resolve(),
            "OD_DMG_TRACE_TAG": "primary",
            "OD_DMG_STACK_PROBE": "1",
        }.items():
            stream.write(f"{key}={value}\n")
    print(f"[dmg-probe] verified vendor bundle at {vendor_root}")


def trace(argv: list[str]) -> None:
    import dmgbuild.__main__ as command_line
    import dmgbuild.core as core

    trace_dir = Path(os.environ["OD_DMG_TRACE_DIR"])
    tag = os.environ.get("OD_DMG_TRACE_TAG", "primary")
    trace_file = trace_dir / "phases.jsonl"

    def emit(kind: str, name: str, **extra: object) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "monotonicNs": time.monotonic_ns(),
            "tag": tag,
            "kind": kind,
            "name": name,
            **extra,
        }
        with trace_file.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, separators=(",", ":")) + "\n")
        print(f"[dmg-probe] tag={tag} kind={kind} name={name} {extra}", file=sys.stderr, flush=True)

    def callback(info: dict[str, object]) -> None:
        name = str(info.get("operation", info.get("command", "unknown")))
        emit(str(info.get("type", "event")), name, **{key: info[key] for key in ("ret", "size") if key in info})

    def timed_subprocess(method: str) -> object:
        original = getattr(core.subprocess, method)

        def run(command: list[str] | tuple[str, ...], *args: object, **kwargs: object) -> int:
            name = Path(command[0]).name
            emit("subprocess::start", name, method=method)
            started = time.monotonic_ns()
            try:
                result = original(command, *args, **kwargs)
            except BaseException:
                emit("subprocess::failed", name, method=method,
                     durationMs=round((time.monotonic_ns() - started) / 1_000_000))
                raise
            emit("subprocess::finished", name, method=method, exitCode=result,
                 durationMs=round((time.monotonic_ns() - started) / 1_000_000))
            return result

        return run

    original_build = command_line.build_dmg

    def traced_build(*args: object, **kwargs: object) -> object:
        return original_build(*args, callback=callback, **kwargs)

    if tag == "primary":
        settings_index = argv.index("-s") + 1
        if Path(argv[settings_index]).resolve() != (trace_dir / "settings.json").resolve():
            shutil.copyfile(argv[settings_index], trace_dir / "settings.json")
        (trace_dir / "invocation.json").write_text(
            json.dumps({"volume": argv[-2], "output": argv[-1]}) + "\n", encoding="utf-8",
        )
        if os.environ.get("OD_DMG_PREFLIGHT") == "1":
            settings = json.loads((trace_dir / "settings.json").read_text(encoding="utf-8"))
            source_app = Path(settings["contents"][0]["path"])
            if not source_app.is_dir():
                raise ValueError(f"DMG source app is missing: {source_app}")
            plain_copy = trace_dir / "preflight-regular.app"
            for name, command in (
                ("source-read", ["tar", "-cf", "/dev/null", "-C", str(source_app.parent), source_app.name]),
                ("regular-copy", ["/usr/bin/ditto", str(source_app), str(plain_copy)]),
            ):
                started = time.monotonic()
                try:
                    result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
                    outcome = {"exitCode": result.returncode, "stderr": result.stderr[-500:]}
                except subprocess.TimeoutExpired:
                    outcome = {"error": "timeout"}
                finally:
                    duration_ms = round((time.monotonic() - started) * 1000)
                    if name == "regular-copy":
                        shutil.rmtree(plain_copy, ignore_errors=True)
                record = {"name": name, "timestamp": datetime.now(timezone.utc).isoformat(),
                          "durationMs": duration_ms, **outcome}
                with (trace_dir / "preflight.jsonl").open("a", encoding="utf-8") as stream:
                    stream.write(json.dumps(record) + "\n")
                print(f"[dmg-probe] preflight {record}", file=sys.stderr, flush=True)
                if outcome.get("error") or outcome.get("exitCode"):
                    break
    core.subprocess.call = timed_subprocess("call")
    core.subprocess.check_call = timed_subprocess("check_call")
    command_line.build_dmg = traced_build
    sys.argv = ["dmgbuild", *argv]
    fs_usage = None
    fs_output = None
    fs_error = None
    if tag == "primary" and os.environ.get("OD_DMG_FS_USAGE") == "1":
        fs_output = (trace_dir / "fs-usage.log").open("w", encoding="utf-8")
        fs_error = (trace_dir / "fs-usage.stderr.log").open("w", encoding="utf-8")
        try:
            fs_usage = subprocess.Popen(
                ["sudo", "-n", "fs_usage", "-w", "-f", "filesys", "-t", "180", "ditto", "diskimages-helper"],
                stdout=fs_output, stderr=fs_error,
            )
        except OSError as error:
            fs_error.write(f"failed to start fs_usage: {error}\n")
    try:
        command_line.main()
    finally:
        if fs_usage is not None and fs_usage.poll() is None:
            fs_usage.send_signal(signal.SIGINT)
            try:
                fs_usage.wait(timeout=5)
            except subprocess.TimeoutExpired:
                fs_usage.terminate()
                try:
                    fs_usage.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    fs_usage.kill()
                    fs_usage.wait()
        if fs_output is not None:
            fs_output.close()
        if fs_error is not None:
            fs_error.close()


def validate_replay(output: Path, source_app: Path, expected_filesystem: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="od-dmg-replay-") as mount_root:
        mount_point = Path(mount_root) / "volume"
        mount_point.mkdir()
        attached = False
        try:
            subprocess.run(
                ["hdiutil", "attach", str(output), "-nobrowse", "-readonly", "-mountpoint", str(mount_point)],
                check=True, capture_output=True, text=True, timeout=60,
            )
            attached = True
            candidate_app = mount_point / source_app.name
            if not candidate_app.is_dir():
                raise ValueError(f"replay image is missing {source_app.name}")
            info = subprocess.run(
                ["diskutil", "info", str(mount_point)], check=True, capture_output=True, text=True, timeout=30,
            ).stdout
            filesystem_line = next(
                (line.split(":", 1)[1].strip() for line in info.splitlines() if "File System Personality:" in line),
                "unknown",
            )
            if expected_filesystem == "APFS" and filesystem_line != "APFS":
                raise ValueError(f"expected APFS replay image, got {filesystem_line}")
            if expected_filesystem == "HFS+" and "HFS" not in filesystem_line:
                raise ValueError(f"expected HFS+ replay image, got {filesystem_line}")
            subprocess.run(
                ["codesign", "--verify", "--deep", "--strict", str(candidate_app)],
                check=True, capture_output=True, text=True, timeout=120,
            )
            stapler = subprocess.run(
                ["xcrun", "stapler", "validate", str(candidate_app)],
                check=False, capture_output=True, text=True, timeout=120,
            )
            if stapler.returncode:
                raise RuntimeError(f"stapler validation failed: {stapler.stderr[-500:]}")
            file_count = sum(1 for path in candidate_app.rglob("*") if path.is_file() or path.is_symlink())
            source_file_count = sum(1 for path in source_app.rglob("*") if path.is_file() or path.is_symlink())
            if file_count != source_file_count:
                raise ValueError(f"replay image file count changed: source={source_file_count}, image={file_count}")
            return {"filesystem": filesystem_line, "fileCount": file_count, "codesign": "valid", "stapler": "valid"}
        finally:
            if attached:
                subprocess.run(
                    ["hdiutil", "detach", str(mount_point), "-quiet"],
                    check=False, capture_output=True, text=True, timeout=30,
                )


def replay(
    trace_dir: Path,
    count: int,
    filesystem_control: bool,
) -> None:
    if count < 1 or count > 3:
        raise ValueError("replay count must be between 1 and 3")
    invocation = json.loads((trace_dir / "invocation.json").read_text(encoding="utf-8"))
    wrapper = trace_dir / "dmgbuild-traced"
    settings = trace_dir / "settings.json"
    phase_records = [json.loads(line) for line in (trace_dir / "phases.jsonl").read_text(encoding="utf-8").splitlines()]
    original_size = next(
        record["size"] for record in phase_records
        if record["tag"] == "primary" and record["name"] == "size::calculate"
        and record["kind"] == "operation::finished"
    )
    if not isinstance(original_size, str) or not original_size.endswith("K"):
        raise ValueError(f"unexpected dmgbuild image size: {original_size}")
    expanded_settings = trace_dir / "expanded-settings.json"
    expanded = json.loads(settings.read_text(encoding="utf-8"))
    expanded["size"] = f"{math.ceil(float(original_size[:-1]) * 1.2)}K"
    expanded_settings.write_text(json.dumps(expanded) + "\n", encoding="utf-8")
    source_app = Path(expanded["contents"][0]["path"])
    if filesystem_control:
        if count != 3:
            raise ValueError("filesystem control requires exactly 3 replays")
        variants = (("hfs", "HFS+"), ("apfs", "APFS"), ("hfs", "HFS+"))
    else:
        variants = tuple(("expanded" if number == 1 else "original", "") for number in range(1, count + 1))
    for number, (variant, filesystem) in enumerate(variants, start=1):
        output = trace_dir / f"replay-{number}.dmg"
        replay_settings = expanded_settings if variant == "expanded" else settings
        if filesystem_control:
            controlled = {**json.loads(settings.read_text(encoding="utf-8")), "size": original_size,
                          "filesystem": filesystem}
            replay_settings = trace_dir / f"replay-{number}-{variant}-settings.json"
            replay_settings.write_text(json.dumps(controlled) + "\n", encoding="utf-8")
        environment = {**os.environ, "OD_DMG_TRACE_TAG": f"replay-{number}-{variant}"}
        started = time.monotonic()
        try:
            subprocess.run([str(wrapper), "-s", str(replay_settings), invocation["volume"], str(output)],
                           env=environment, check=True, timeout=240)
            build_duration_ms = round((time.monotonic() - started) * 1000)
            validation_started = time.monotonic()
            validation = validate_replay(output, source_app, filesystem) if filesystem_control else {}
            record = {
                "replay": number,
                "variant": variant,
                "configuredFilesystem": filesystem or None,
                "size": json.loads(replay_settings.read_text(encoding="utf-8"))["size"],
                "buildDurationMs": build_duration_ms,
                "validationDurationMs": round((time.monotonic() - validation_started) * 1000),
                **validation,
            }
            with (trace_dir / "replay-results.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(record, separators=(",", ":")) + "\n")
            print(f"[dmg-probe] {record}", flush=True)
        finally:
            output.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--pack-root", type=Path, required=True)
    prepare_parser.add_argument("--trace-dir", type=Path, required=True)
    prepare_parser.add_argument("--github-env", type=Path, required=True)
    replay_parser = subparsers.add_parser("replay")
    replay_parser.add_argument("--trace-dir", type=Path, required=True)
    replay_parser.add_argument("--count", type=int, default=2)
    replay_parser.add_argument("--filesystem-control", action="store_true")
    subparsers.add_parser("trace")
    args, remainder = parser.parse_known_args()
    if args.command == "prepare":
        if remainder:
            parser.error(f"unexpected arguments: {remainder}")
        prepare(args.pack_root, args.trace_dir, args.github_env)
    elif args.command == "replay":
        if remainder:
            parser.error(f"unexpected arguments: {remainder}")
        replay(args.trace_dir, args.count, args.filesystem_control)
    else:
        trace(remainder)


if __name__ == "__main__":
    main()
