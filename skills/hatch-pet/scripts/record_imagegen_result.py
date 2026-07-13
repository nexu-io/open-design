#!/usr/bin/env python3
"""Record a selected $imagegen output for a Codex pet generation job."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

CANONICAL_BASE_PATH = "references/canonical-base.png"


def load_jobs(path: Path) -> dict[str, object]:
    if not path.exists():
        raise SystemExit(f"job manifest not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def job_list(manifest: dict[str, object]) -> list[dict[str, object]]:
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list):
        raise SystemExit("invalid imagegen-jobs.json: jobs must be a list")
    return [job for job in jobs if isinstance(job, dict)]


def find_job(manifest: dict[str, object], job_id: str) -> dict[str, object]:
    for job in job_list(manifest):
        if job.get("id") == job_id:
            return job
    raise SystemExit(f"unknown job id: {job_id}")


def image_metadata(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        return {
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "format": image.format,
        }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def manifest_relative(path: Path, run_dir: Path) -> str:
    return str(path.resolve().relative_to(run_dir.resolve()))


def completed_job_ids(manifest: dict[str, object]) -> set[str]:
    return {
        str(job["id"])
        for job in job_list(manifest)
        if job.get("status") == "complete" and isinstance(job.get("id"), str)
    }


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def default_generated_images_root() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME") or "~/.codex").expanduser().resolve()
    return codex_home / "generated_images"


def validate_source_path(
    *,
    source: Path,
    run_dir: Path,
    allow_synthetic_test_source: bool,
) -> str:
    if allow_synthetic_test_source:
        return "synthetic-test"
    if is_relative_to(source, run_dir):
        raise SystemExit(
            "source image is inside the pet run directory; record the original "
            "$imagegen output from $CODEX_HOME/generated_images/.../ig_*.png instead"
        )
    generated_root = default_generated_images_root()
    if not is_relative_to(source, generated_root) or not source.name.startswith("ig_"):
        raise SystemExit(
            "source image does not look like a built-in $imagegen output; expected "
            f"{generated_root}/.../ig_*.png. Do not ingest locally drawn or "
            "post-processed row strips as visual job outputs."
        )
    return "built-in-imagegen"


def validate_required_grounding(job: dict[str, object], run_dir: Path) -> None:
    if job.get("allow_prompt_only_generation") is not False:
        return
    inputs = job.get("input_images")
    if not isinstance(inputs, list) or not inputs:
        raise SystemExit(
            f"job {job.get('id')} does not list input_images; grounded row jobs must attach references"
        )
    missing = []
    for item in inputs:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise SystemExit(f"job {job.get('id')} has an invalid input image entry")
        path = run_dir / item["path"]
        if not path.is_file():
            missing.append(str(path))
    if missing:
        raise SystemExit(
            f"job {job.get('id')} is missing required grounding image(s): "
            + ", ".join(missing)
        )


def update_base_canonical_reference(
    *,
    run_dir: Path,
    output: Path,
    manifest: dict[str, object],
    job: dict[str, object],
    metadata: dict[str, object],
) -> None:
    if job.get("id") != "base":
        return

    canonical = run_dir / CANONICAL_BASE_PATH
    canonical.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(output, canonical)
    canonical_sha = file_sha256(canonical)
    reference = {
        "path": manifest_relative(canonical, run_dir),
        "source_job": "base",
        "sha256": canonical_sha,
        "metadata": metadata,
    }
    job["canonical_reference_path"] = reference["path"]
    manifest["canonical_identity_reference"] = reference

    request_path = run_dir / "pet_request.json"
    if request_path.exists():
        request = json.loads(request_path.read_text(encoding="utf-8"))
        request["canonical_identity_reference"] = reference
        request_path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--allow-synthetic-test-source", action="store_true", help=argparse.SUPPRESS
    )
    args = parser.parse_args()

    run_dir = Path(args.run_dir).expanduser().resolve()
    source = Path(args.source).expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"source image not found: {source}")
    source_provenance = validate_source_path(
        source=source,
        run_dir=run_dir,
        allow_synthetic_test_source=args.allow_synthetic_test_source,
    )

    manifest_path = run_dir / "imagegen-jobs.json"
    manifest = load_jobs(manifest_path)
    job = find_job(manifest, args.job_id)

    missing_deps = [
        dep
        for dep in job.get("depends_on", [])
        if isinstance(dep, str) and dep not in completed_job_ids(manifest)
    ]
    if missing_deps:
        raise SystemExit(
            f"job {args.job_id} is not ready; missing dependency result(s): {', '.join(missing_deps)}"
        )
    validate_required_grounding(job, run_dir)

    output_raw = job.get("output_path")
    if not isinstance(output_raw, str):
        raise SystemExit(f"job {args.job_id} has no output_path")
    output = run_dir / output_raw
    if output.exists() and not args.force:
        raise SystemExit(f"{output} already exists; pass --force to replace it")

    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, output)
    metadata = image_metadata(output)

    job["status"] = "complete"
    job["source_path"] = str(source)
    job["source_provenance"] = source_provenance
    job["source_sha256"] = file_sha256(source)
    job["output_sha256"] = file_sha256(output)
    if source_provenance == "synthetic-test":
        job["synthetic_test_source"] = True
    else:
        job.pop("synthetic_test_source", None)
    job["completed_at"] = datetime.now(timezone.utc).isoformat()
    job["metadata"] = metadata
    for key in [
        "last_error",
        "secondary_fallback",
        "derived_from",
        "mirror_decision",
        "repair_reason",
        "queued_at",
    ]:
        job.pop(key, None)
    update_base_canonical_reference(
        run_dir=run_dir,
        output=output,
        manifest=manifest,
        job=job,
        metadata=metadata,
    )

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "job_id": args.job_id,
                "output": str(output),
                "metadata": metadata,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
