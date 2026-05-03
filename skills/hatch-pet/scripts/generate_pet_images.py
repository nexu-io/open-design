#!/usr/bin/env python3
"""Secondary image generation fallback for Codex pet base art and row strips."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ALL_STATES = [
    "idle",
    "running-right",
    "running-left",
    "waving",
    "jumping",
    "failed",
    "waiting",
    "running",
    "review",
]
CANONICAL_BASE_PATH = "references/canonical-base.png"


def parse_states(raw: str) -> list[str]:
    if raw.strip().lower() == "all":
        return ALL_STATES
    states = [item.strip() for item in raw.split(",") if item.strip()]
    unknown = sorted(set(states) - set(ALL_STATES))
    if unknown:
        raise SystemExit(f"unknown state(s): {', '.join(unknown)}")
    return states


def load_manifest(run_dir: Path) -> dict[str, object]:
    path = run_dir / "imagegen-jobs.json"
    if not path.exists():
        raise SystemExit(f"job manifest not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def manifest_jobs(manifest: dict[str, object]) -> list[dict[str, object]]:
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list):
        raise SystemExit("invalid imagegen-jobs.json: jobs must be a list")
    return [job for job in jobs if isinstance(job, dict)]


def select_jobs(
    manifest: dict[str, object],
    *,
    states: list[str],
    skip_base: bool,
    job_ids: list[str],
) -> list[dict[str, object]]:
    selected_ids = set(job_ids)
    if not selected_ids:
        if not skip_base:
            selected_ids.add("base")
        selected_ids.update(states)
    selected = [job for job in manifest_jobs(manifest) if job.get("id") in selected_ids]
    missing = selected_ids - {str(job.get("id")) for job in selected}
    if missing:
        raise SystemExit(f"unknown job id(s): {', '.join(sorted(missing))}")
    return selected


def run_image_edit(
    *,
    model: str,
    prompt_file: Path,
    image_paths: list[Path],
    output_json: Path,
    size: str,
    api_key: str,
) -> dict[str, object]:
    output_json.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "curl",
        "-sS",
        "-X",
        "POST",
        "https://api.openai.com/v1/images/edits",
        "-H",
        f"Authorization: Bearer {api_key}",
        "-F",
        f"model={model}",
    ]
    for image_path in image_paths:
        command.extend(["-F", f"image[]=@{image_path}"])
    command.extend(
        [
            "-F",
            f"prompt=<{prompt_file}",
            "-F",
            f"size={size}",
            "-F",
            "output_format=png",
            "-o",
            str(output_json),
        ]
    )
    subprocess.run(command, check=True)
    response = json.loads(output_json.read_text(encoding="utf-8"))
    if response.get("error"):
        raise SystemExit(json.dumps(response["error"], indent=2))
    return response


def run_image_generation(
    *,
    model: str,
    prompt_file: Path,
    output_json: Path,
    size: str,
    api_key: str,
) -> dict[str, object]:
    output_json.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "curl",
        "-sS",
        "-X",
        "POST",
        "https://api.openai.com/v1/images/generations",
        "-H",
        f"Authorization: Bearer {api_key}",
        "-F",
        f"model={model}",
        "-F",
        f"prompt=<{prompt_file}",
        "-F",
        f"size={size}",
        "-F",
        "output_format=png",
        "-o",
        str(output_json),
    ]
    subprocess.run(command, check=True)
    response = json.loads(output_json.read_text(encoding="utf-8"))
    if response.get("error"):
        raise SystemExit(json.dumps(response["error"], indent=2))
    return response


def decode_response(response: dict[str, object], output_image: Path) -> None:
    data = response.get("data")
    if not isinstance(data, list) or not data:
        raise SystemExit("image API response did not contain data[0]")
    first = data[0]
    if not isinstance(first, dict) or not isinstance(first.get("b64_json"), str):
        raise SystemExit("image API response did not contain data[0].b64_json")
    output_image.parent.mkdir(parents=True, exist_ok=True)
    output_image.write_bytes(base64.b64decode(first["b64_json"]))


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def complete_job(job: dict[str, object], output_path: Path) -> None:
    job["status"] = "complete"
    job["source_path"] = str(output_path)
    job["source_provenance"] = "secondary-fallback-image-api"
    job["source_sha256"] = file_sha256(output_path)
    job["output_sha256"] = file_sha256(output_path)
    job["completed_at"] = datetime.now(timezone.utc).isoformat()
    job["secondary_fallback"] = True
    for key in [
        "last_error",
        "synthetic_test_source",
        "derived_from",
        "mirror_decision",
        "repair_reason",
        "queued_at",
    ]:
        job.pop(key, None)


def write_canonical_base(
    run_dir: Path, manifest: dict[str, object], output_image: Path
) -> None:
    canonical = run_dir / CANONICAL_BASE_PATH
    canonical.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(output_image, canonical)
    reference = {
        "path": CANONICAL_BASE_PATH,
        "source_job": "base",
        "sha256": file_sha256(canonical),
    }
    manifest["canonical_identity_reference"] = reference
    request_path = run_dir / "pet_request.json"
    if request_path.exists():
        request = json.loads(request_path.read_text(encoding="utf-8"))
        request["canonical_identity_reference"] = reference
        request_path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")


def path_list(run_dir: Path, job: dict[str, object]) -> list[Path]:
    inputs = job.get("input_images")
    if not isinstance(inputs, list):
        raise SystemExit(f"job {job.get('id')} has invalid input_images")
    paths = []
    for item in inputs:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise SystemExit(f"job {job.get('id')} has invalid input image entry")
        path = run_dir / item["path"]
        if not path.is_file():
            raise SystemExit(f"input image for job {job.get('id')} not found: {path}")
        paths.append(path)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--model", default="gpt-image-2")
    parser.add_argument("--size", default="1024x1024")
    parser.add_argument("--states", default="all")
    parser.add_argument("--job-id", action="append", default=[])
    parser.add_argument("--skip-base", action="store_true")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is not set")

    run_dir = Path(args.run_dir).expanduser().resolve()
    manifest_path = run_dir / "imagegen-jobs.json"
    manifest = load_manifest(run_dir)
    jobs = select_jobs(
        manifest,
        states=parse_states(args.states),
        skip_base=args.skip_base,
        job_ids=args.job_id,
    )
    raw_dir = run_dir / "raw"

    completed = []
    for job in jobs:
        job_id = str(job.get("id"))
        prompt_raw = job.get("prompt_file")
        output_raw = job.get("output_path")
        if not isinstance(prompt_raw, str) or not isinstance(output_raw, str):
            raise SystemExit(f"job {job_id} is missing prompt_file or output_path")
        prompt_file = run_dir / prompt_raw
        output_image = run_dir / output_raw
        print(f"Generating {job_id} with secondary fallback")
        image_paths = path_list(run_dir, job)
        if image_paths:
            response = run_image_edit(
                model=args.model,
                prompt_file=prompt_file,
                image_paths=image_paths,
                output_json=raw_dir / f"{job_id}.response.json",
                size=args.size,
                api_key=api_key,
            )
        else:
            response = run_image_generation(
                model=args.model,
                prompt_file=prompt_file,
                output_json=raw_dir / f"{job_id}.response.json",
                size=args.size,
                api_key=api_key,
            )
        decode_response(response, output_image)
        complete_job(job, output_image)
        if job_id == "base":
            job["canonical_reference_path"] = CANONICAL_BASE_PATH
            write_canonical_base(run_dir, manifest, output_image)
        completed.append({"job_id": job_id, "output": str(output_image)})

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "completed": completed}, indent=2))


if __name__ == "__main__":
    main()
