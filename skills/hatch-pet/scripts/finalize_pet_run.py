#!/usr/bin/env python3
"""Finalize a Codex pet run after all imagegen jobs are complete."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageOps


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("+ " + " ".join(command))
    return subprocess.run(command, check=check, text=True)


def load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def default_generated_images_root() -> Path:
    return default_codex_home() / "generated_images"


def default_codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or "~/.codex").expanduser().resolve()


def manifest_path(raw: object, *, run_dir: Path, field: str, job_id: str) -> Path:
    if not isinstance(raw, str) or not raw:
        raise SystemExit(f"job {job_id} has no {field}")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = run_dir / path
    return path.resolve()


def validate_hash(job: dict[str, object], *, source: Path, output: Path, job_id: str) -> None:
    expected_hash = job.get("source_sha256")
    if not isinstance(expected_hash, str) or not expected_hash:
        raise SystemExit(
            f"job {job_id} is missing source_sha256; ingest visual outputs with "
            "record_imagegen_result.py instead of editing imagegen-jobs.json"
        )
    if not source.is_file():
        raise SystemExit(f"job {job_id} source image no longer exists: {source}")
    if not output.is_file():
        raise SystemExit(f"job {job_id} decoded output is missing: {output}")
    source_hash = file_sha256(source)
    output_hash = file_sha256(output)
    if source_hash != expected_hash:
        raise SystemExit(f"job {job_id} source image hash does not match imagegen-jobs.json")
    if output_hash != expected_hash:
        raise SystemExit(
            f"job {job_id} decoded output does not match its recorded source image; "
            "do not rewrite decoded visual outputs locally"
        )


def validate_mirror_hash(job: dict[str, object], *, source: Path, output: Path, job_id: str) -> None:
    if job_id != "running-left":
        raise SystemExit(f"job {job_id} may not use deterministic mirror provenance")
    if job.get("derived_from") != "running-right":
        raise SystemExit("running-left mirror job must derive from running-right")
    decision = job.get("mirror_decision")
    if not isinstance(decision, dict) or decision.get("approved") is not True:
        raise SystemExit(
            "running-left mirror job is missing an approved mirror_decision; "
            "use derive_running_left_from_running_right.py after visual review"
        )

    expected_source_hash = job.get("source_sha256")
    expected_output_hash = job.get("output_sha256")
    if not isinstance(expected_source_hash, str) or not expected_source_hash:
        raise SystemExit("running-left mirror job is missing source_sha256")
    if not isinstance(expected_output_hash, str) or not expected_output_hash:
        raise SystemExit("running-left mirror job is missing output_sha256")
    if not source.is_file():
        raise SystemExit(f"running-left mirror source image no longer exists: {source}")
    if not output.is_file():
        raise SystemExit(f"running-left mirrored output is missing: {output}")
    if source.name != "running-right.png" or source.parent.name != "decoded":
        raise SystemExit("running-left mirror source must be decoded/running-right.png")
    if output.name != "running-left.png" or output.parent.name != "decoded":
        raise SystemExit("running-left mirror output must be decoded/running-left.png")
    if file_sha256(source) != expected_source_hash:
        raise SystemExit("running-left mirror source hash does not match imagegen-jobs.json")
    if file_sha256(output) != expected_output_hash:
        raise SystemExit(
            "running-left mirrored output hash does not match imagegen-jobs.json; "
            "rerun derive_running_left_from_running_right.py"
        )
    with Image.open(source) as source_image, Image.open(output) as output_image:
        expected = ImageOps.mirror(source_image.convert("RGBA"))
        actual = output_image.convert("RGBA")
        if expected.size != actual.size or expected.tobytes() != actual.tobytes():
            raise SystemExit(
                "running-left mirrored output is not an exact horizontal mirror of running-right"
            )


def validate_completed_job_source(
    job: dict[str, object],
    *,
    run_dir: Path,
    allow_synthetic_test_sources: bool,
) -> None:
    job_id = str(job.get("id") or "")
    source = manifest_path(job.get("source_path"), run_dir=run_dir, field="source_path", job_id=job_id)
    output = manifest_path(job.get("output_path"), run_dir=run_dir, field="output_path", job_id=job_id)

    blocked_flags = [
        flag
        for flag in ("deterministic_pet_row", "cute_raster_row", "local_raster_row")
        if job.get(flag)
    ]
    if blocked_flags:
        raise SystemExit(
            f"job {job_id} was marked as a local/synthetic row ({', '.join(blocked_flags)}); "
            "regenerate it with $imagegen"
        )

    if job.get("synthetic_test_source"):
        if not allow_synthetic_test_sources:
            raise SystemExit(
                f"job {job_id} uses a synthetic test source; rerun with real $imagegen output"
            )
        validate_hash(job, source=source, output=output, job_id=job_id)
        return

    if job.get("secondary_fallback"):
        if job.get("source_provenance") != "secondary-fallback-image-api":
            raise SystemExit(f"job {job_id} has invalid secondary fallback provenance")
        validate_hash(job, source=source, output=output, job_id=job_id)
        return

    if job.get("source_provenance") == "deterministic-mirror":
        validate_mirror_hash(job, source=source, output=output, job_id=job_id)
        return

    if job.get("source_provenance") != "built-in-imagegen":
        raise SystemExit(
            f"job {job_id} was not recorded as a built-in $imagegen output; "
            "use record_imagegen_result.py with the selected $CODEX_HOME/generated_images/.../ig_*.png file"
        )
    if is_relative_to(source, run_dir):
        raise SystemExit(
            f"job {job_id} source image is inside the pet run directory; "
            "do not use locally generated row artifacts as visual sources"
        )
    generated_root = default_generated_images_root()
    if not is_relative_to(source, generated_root) or not source.name.startswith("ig_"):
        raise SystemExit(
            f"job {job_id} source image is not a built-in $imagegen output under "
            f"{generated_root}/.../ig_*.png"
        )
    validate_hash(job, source=source, output=output, job_id=job_id)


def require_complete_jobs(run_dir: Path, *, allow_synthetic_test_sources: bool) -> None:
    manifest_path = run_dir / "imagegen-jobs.json"
    manifest = load_json(manifest_path)
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list):
        raise SystemExit("invalid imagegen-jobs.json: jobs must be a list")
    incomplete = [
        str(job.get("id"))
        for job in jobs
        if isinstance(job, dict) and job.get("status", "pending") != "complete"
    ]
    if incomplete:
        raise SystemExit(
            "imagegen jobs are not complete; run pet_job_status.py and finish: "
            + ", ".join(incomplete)
        )
    for job in jobs:
        if isinstance(job, dict):
            validate_completed_job_source(
                job,
                run_dir=run_dir,
                allow_synthetic_test_sources=allow_synthetic_test_sources,
            )


def review_failures(review: dict[str, object]) -> list[str]:
    rows = review.get("rows")
    if not isinstance(rows, list):
        return ["review did not contain row-level results"]
    failures = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        errors = row.get("errors")
        if isinstance(errors, list) and errors:
            failures.append(f"{row.get('state')}: {'; '.join(str(error) for error in errors)}")
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--allow-slot-extraction", action="store_true")
    parser.add_argument("--skip-videos", action="store_true")
    parser.add_argument("--skip-package", action="store_true")
    parser.add_argument(
        "--package-dir",
        default="",
        help="Exact pet package directory. Defaults to ${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>.",
    )
    parser.add_argument("--ffmpeg", default="")
    parser.add_argument("--allow-synthetic-test-sources", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    scripts_dir = Path(__file__).resolve().parent
    run_dir = Path(args.run_dir).expanduser().resolve()
    request = load_json(run_dir / "pet_request.json")
    pet_id = str(request.get("pet_id") or "")
    display_name = str(request.get("display_name") or "")
    description = str(request.get("description") or "")
    if not pet_id or not display_name or not description:
        raise SystemExit("pet_request.json is missing pet_id, display_name, or description")

    require_complete_jobs(
        run_dir,
        allow_synthetic_test_sources=args.allow_synthetic_test_sources,
    )

    final_dir = run_dir / "final"
    qa_dir = run_dir / "qa"
    final_dir.mkdir(parents=True, exist_ok=True)
    qa_dir.mkdir(parents=True, exist_ok=True)

    run(
        [
            sys.executable,
            str(scripts_dir / "extract_strip_frames.py"),
            "--decoded-dir",
            str(run_dir / "decoded"),
            "--output-dir",
            str(run_dir / "frames"),
            "--states",
            "all",
            "--method",
            "auto",
        ]
    )

    review_path = qa_dir / "review.json"
    inspect_command = [
        sys.executable,
        str(scripts_dir / "inspect_frames.py"),
        "--frames-root",
        str(run_dir / "frames"),
        "--json-out",
        str(review_path),
    ]
    if not args.allow_slot_extraction:
        inspect_command.append("--require-components")
    run(inspect_command, check=False)
    review = load_json(review_path)
    if not review.get("ok"):
        failures = review_failures(review)
        print(
            json.dumps(
                {
                    "ok": False,
                    "review": str(review_path),
                    "repair_hint": "Run queue_pet_repairs.py, regenerate the reopened row jobs with $imagegen, then finalize again.",
                    "failures": failures,
                },
                indent=2,
            )
        )
        raise SystemExit(1)

    run(
        [
            sys.executable,
            str(scripts_dir / "compose_atlas.py"),
            "--frames-root",
            str(run_dir / "frames"),
            "--output",
            str(final_dir / "spritesheet.png"),
            "--webp-output",
            str(final_dir / "spritesheet.webp"),
        ]
    )
    run(
        [
            sys.executable,
            str(scripts_dir / "validate_atlas.py"),
            str(final_dir / "spritesheet.webp"),
            "--json-out",
            str(final_dir / "validation.json"),
        ]
    )
    run(
        [
            sys.executable,
            str(scripts_dir / "make_contact_sheet.py"),
            str(final_dir / "spritesheet.webp"),
            "--output",
            str(qa_dir / "contact-sheet.png"),
        ]
    )

    if not args.skip_videos:
        video_command = [
            sys.executable,
            str(scripts_dir / "render_animation_videos.py"),
            str(final_dir / "spritesheet.webp"),
            "--output-dir",
            str(qa_dir / "videos"),
        ]
        if args.ffmpeg:
            video_command.extend(["--ffmpeg", args.ffmpeg])
        run(video_command)

    if not args.skip_package:
        package_command = [
            sys.executable,
            str(scripts_dir / "package_custom_pet.py"),
            "--pet-name",
            pet_id,
            "--display-name",
            display_name,
            "--description",
            description,
            "--spritesheet",
            str(final_dir / "spritesheet.webp"),
            "--force",
        ]
        if args.package_dir:
            package_command.extend(["--output-dir", str(Path(args.package_dir).expanduser().resolve())])
        run(package_command)

    package_dir = None
    if not args.skip_package:
        package_dir = (
            Path(args.package_dir).expanduser().resolve()
            if args.package_dir
            else default_codex_home() / "pets" / pet_id
        )

    summary = {
        "ok": True,
        "run_dir": str(run_dir),
        "spritesheet": str(final_dir / "spritesheet.webp"),
        "validation": str(final_dir / "validation.json"),
        "contact_sheet": str(qa_dir / "contact-sheet.png"),
        "review": str(review_path),
        "videos": None if args.skip_videos else str(qa_dir / "videos"),
        "package": None if package_dir is None else str(package_dir),
    }
    summary_path = qa_dir / "run-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
