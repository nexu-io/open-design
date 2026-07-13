#!/usr/bin/env python3
"""Conditionally derive running-left by mirroring the approved running-right strip."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps


def load_manifest(run_dir: Path) -> dict[str, object]:
    path = run_dir / "imagegen-jobs.json"
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


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def manifest_relative(path: Path, run_dir: Path) -> str:
    return str(path.resolve().relative_to(run_dir.resolve()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument(
        "--confirm-appropriate-mirror",
        action="store_true",
        help="Required after visually confirming the rightward strip can be mirrored without identity/prop issues.",
    )
    parser.add_argument(
        "--decision-note",
        required=True,
        help="Short note explaining why mirroring is acceptable for this pet.",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if not args.confirm_appropriate_mirror:
        raise SystemExit("refusing to mirror without --confirm-appropriate-mirror")
    if not args.decision_note.strip():
        raise SystemExit("--decision-note must explain why mirroring is appropriate")

    run_dir = Path(args.run_dir).expanduser().resolve()
    manifest_path = run_dir / "imagegen-jobs.json"
    manifest = load_manifest(run_dir)
    right_job = find_job(manifest, "running-right")
    left_job = find_job(manifest, "running-left")

    if right_job.get("status") != "complete":
        raise SystemExit("running-right must be complete before deriving running-left")
    mirror_policy = left_job.get("mirror_policy")
    if not isinstance(mirror_policy, dict) or mirror_policy.get("may_derive_from") != "running-right":
        raise SystemExit("running-left is not configured for conditional mirroring")

    source = run_dir / "decoded" / "running-right.png"
    output = run_dir / "decoded" / "running-left.png"
    if not source.is_file():
        raise SystemExit(f"running-right decoded strip not found: {source}")
    if output.exists() and not args.force:
        raise SystemExit(f"{output} already exists; pass --force to replace it")

    output.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        mirrored = ImageOps.mirror(image.convert("RGBA"))
        mirrored.save(output)

    left_job["status"] = "complete"
    left_job["source_path"] = manifest_relative(source, run_dir)
    left_job["source_provenance"] = "deterministic-mirror"
    left_job["derived_from"] = "running-right"
    left_job["source_sha256"] = file_sha256(source)
    left_job["output_sha256"] = file_sha256(output)
    left_job["completed_at"] = datetime.now(timezone.utc).isoformat()
    left_job["metadata"] = image_metadata(output)
    left_job["mirror_decision"] = {
        "approved": True,
        "approved_at": left_job["completed_at"],
        "note": args.decision_note.strip(),
    }
    for key in [
        "last_error",
        "secondary_fallback",
        "synthetic_test_source",
        "repair_reason",
        "queued_at",
    ]:
        left_job.pop(key, None)

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "job_id": "running-left",
                "derived_from": "running-right",
                "output": str(output),
                "decision_note": args.decision_note.strip(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
