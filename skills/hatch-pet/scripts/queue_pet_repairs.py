#!/usr/bin/env python3
"""Reopen failed Codex pet row jobs after frame QA."""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


def load_json(path: Path) -> dict[str, object]:
    if not path.exists():
        raise SystemExit(f"file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def rows_to_repair(
    review: dict[str, object], *, repair_on_warnings: bool
) -> list[dict[str, object]]:
    rows = review.get("rows")
    if not isinstance(rows, list):
        raise SystemExit("review does not contain row-level results")

    repairs: list[dict[str, object]] = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("state"), str):
            continue
        errors = row.get("errors") if isinstance(row.get("errors"), list) else []
        warnings = row.get("warnings") if isinstance(row.get("warnings"), list) else []
        if errors or (repair_on_warnings and warnings):
            repairs.append(
                {
                    "state": row["state"],
                    "reason": "; ".join(str(item) for item in [*errors, *warnings])
                    or "the row did not pass visual QA",
                }
            )
    return repairs


def append_repair_note(run_dir: Path, state: str, attempt: int, reason: str) -> None:
    prompt_path = run_dir / "prompts" / "rows" / f"{state}.md"
    if not prompt_path.exists():
        raise SystemExit(f"row prompt not found: {prompt_path}")
    existing = prompt_path.read_text(encoding="utf-8")
    note = f"""

Repair attempt {attempt}:
- The previous `{state}` strip failed QA: {reason}
- Regenerate the entire row, not just one pose.
- Fill every requested frame slot with one complete centered full-body pet pose.
- Keep large gaps of pure chroma key only between slots; do not leave a requested slot empty.
- Avoid pose overlap, clipping, edge slivers, extra partial sprites, and detached fragments from neighboring poses.
- Use the canonical base image and any original references listed in `imagegen-jobs.json` as grounding inputs.
- Do not redesign the pet. Keep the exact same head shape, face design, markings, body proportions, palette, outline weight, materials, and props as the approved base pet.
- If the contact sheet shows identity drift, repair only this row while preserving the canonical base identity.
"""
    prompt_path.write_text(existing.rstrip() + note.rstrip() + "\n", encoding="utf-8")


def job_list(manifest: dict[str, object]) -> list[dict[str, object]]:
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list):
        raise SystemExit("invalid imagegen-jobs.json: jobs must be a list")
    return [job for job in jobs if isinstance(job, dict)]


def next_archive_path(archive_dir: Path, state: str, attempt: int, suffix: str) -> Path:
    candidate = archive_dir / f"{state}-attempt-{attempt}-previous{suffix}"
    if not candidate.exists():
        return candidate
    counter = 2
    while True:
        candidate = archive_dir / f"{state}-attempt-{attempt}-previous-{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def archive_decoded_output(run_dir: Path, job: dict[str, object], state: str, attempt: int) -> str | None:
    output_raw = job.get("output_path")
    output = (
        run_dir / output_raw
        if isinstance(output_raw, str) and output_raw
        else run_dir / "decoded" / f"{state}.png"
    )
    if not output.exists():
        return None
    archive_dir = run_dir / "decoded" / "repair-archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archived = next_archive_path(archive_dir, state, attempt, output.suffix or ".png")
    shutil.move(str(output), archived)
    return str(archived.relative_to(run_dir))


def queue_repair(manifest: dict[str, object], run_dir: Path, state: str, reason: str) -> dict[str, object]:
    for job in job_list(manifest):
        if job.get("id") != state:
            continue
        attempt = int(job.get("repair_attempt", 0)) + 1
        archived_output = archive_decoded_output(run_dir, job, state, attempt)
        job["status"] = "pending"
        job["repair_attempt"] = attempt
        job["repair_reason"] = reason
        job["queued_at"] = datetime.now(timezone.utc).isoformat()
        if archived_output is not None:
            previous_outputs = job.setdefault("previous_outputs", [])
            if not isinstance(previous_outputs, list):
                previous_outputs = []
                job["previous_outputs"] = previous_outputs
            previous_outputs.append(
                {
                    "attempt": attempt,
                    "path": archived_output,
                    "archived_at": job["queued_at"],
                }
            )
        for key in [
            "source_path",
            "source_provenance",
            "source_sha256",
            "output_sha256",
            "completed_at",
            "metadata",
            "synthetic_test_source",
            "secondary_fallback",
            "derived_from",
            "mirror_decision",
        ]:
            job.pop(key, None)
        result: dict[str, object] = {"attempt": attempt}
        if archived_output is not None:
            result["archived_output"] = archived_output
        return result
    raise SystemExit(f"unknown row job id: {state}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--review", default="")
    parser.add_argument("--repair-on-warnings", action="store_true")
    args = parser.parse_args()

    run_dir = Path(args.run_dir).expanduser().resolve()
    review_path = (
        Path(args.review).expanduser().resolve()
        if args.review
        else run_dir / "qa" / "review.json"
    )
    manifest_path = run_dir / "imagegen-jobs.json"
    review = load_json(review_path)
    manifest = load_json(manifest_path)

    repairs = rows_to_repair(review, repair_on_warnings=args.repair_on_warnings)
    queued: list[dict[str, object]] = []
    for repair in repairs:
        state = str(repair["state"])
        reason = str(repair["reason"])
        queued_repair = queue_repair(manifest, run_dir, state, reason)
        attempt = int(queued_repair["attempt"])
        append_repair_note(run_dir, state, attempt, reason)
        queued.append({"state": state, "reason": reason, **queued_repair})

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "queued": queued}, indent=2))


if __name__ == "__main__":
    main()
