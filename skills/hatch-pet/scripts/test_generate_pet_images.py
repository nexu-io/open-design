"""Regression tests for path-traversal checks in generate_pet_images.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Insert the scripts directory onto sys.path so the module can be imported
# without a package install.
_SCRIPTS_DIR = Path(__file__).parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from generate_pet_images import path_list  # noqa: E402


# ---------------------------------------------------------------------------
# path_list – input_images traversal checks
# ---------------------------------------------------------------------------

TRAVERSAL_PATHS = [
    "../outside.png",
    "../../etc/passwd",
    "../sibling/secret.png",
    "subdir/../../outside.png",
]

SAFE_PATHS = [
    "images/pet.png",
    "subdir/frame.png",
]


def _job(image_path: str) -> dict:
    return {"id": "test-job", "input_images": [{"path": image_path}]}


class TestPathListTraversalRejection:
    """path_list must raise SystemExit for any input_images path that escapes run_dir."""

    @pytest.mark.parametrize("bad_path", TRAVERSAL_PATHS)
    def test_rejects_traversal_in_input_images(self, tmp_path: Path, bad_path: str) -> None:
        job = _job(bad_path)
        with pytest.raises(SystemExit, match="path traversal detected in input_images"):
            path_list(tmp_path, job)

    def test_accepts_safe_path_when_file_exists(self, tmp_path: Path) -> None:
        image = tmp_path / "images" / "pet.png"
        image.parent.mkdir(parents=True)
        image.write_bytes(b"\x89PNG\r\n")
        job = _job("images/pet.png")
        result = path_list(tmp_path, job)
        assert result == [image.resolve()]

    def test_rejects_missing_safe_path(self, tmp_path: Path) -> None:
        job = _job("images/missing.png")
        with pytest.raises(SystemExit, match="not found"):
            path_list(tmp_path, job)


# ---------------------------------------------------------------------------
# main() job-processing – prompt_file and output_path traversal checks
# ---------------------------------------------------------------------------

def _make_manifest(run_dir: Path, jobs: list[dict]) -> None:
    manifest = {"jobs": jobs}
    (run_dir / "imagegen-jobs.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )


def _run_main(run_dir: Path, job_id: str) -> None:
    """Import and invoke main() with minimal args, capturing SystemExit."""
    import generate_pet_images as gpi

    sys.argv = [
        "generate_pet_images.py",
        "--run-dir", str(run_dir),
        "--job-id", job_id,
    ]
    import os
    os.environ.setdefault("OPENAI_API_KEY", "test-key")
    gpi.main()


class TestMainJobTraversalRejection:
    """main() must raise SystemExit before any I/O or API call for traversal paths."""

    @pytest.mark.parametrize("bad_prompt", TRAVERSAL_PATHS)
    def test_rejects_traversal_in_prompt_file(self, tmp_path: Path, bad_prompt: str) -> None:
        _make_manifest(tmp_path, [
            {
                "id": "j1",
                "prompt_file": bad_prompt,
                "output_path": "out/frame.png",
                "input_images": [],
            }
        ])
        with pytest.raises(SystemExit, match="path traversal detected in prompt_file"):
            _run_main(tmp_path, "j1")

    @pytest.mark.parametrize("bad_output", TRAVERSAL_PATHS)
    def test_rejects_traversal_in_output_path(self, tmp_path: Path, bad_output: str) -> None:
        prompt = tmp_path / "prompt.txt"
        prompt.write_text("draw a pet", encoding="utf-8")
        _make_manifest(tmp_path, [
            {
                "id": "j2",
                "prompt_file": "prompt.txt",
                "output_path": bad_output,
                "input_images": [],
            }
        ])
        with pytest.raises(SystemExit, match="path traversal detected in output_path"):
            _run_main(tmp_path, "j2")

    @pytest.mark.parametrize("bad_img", TRAVERSAL_PATHS)
    def test_rejects_traversal_in_input_images_via_main(
        self, tmp_path: Path, bad_img: str
    ) -> None:
        prompt = tmp_path / "prompt.txt"
        prompt.write_text("draw a pet", encoding="utf-8")
        _make_manifest(tmp_path, [
            {
                "id": "j3",
                "prompt_file": "prompt.txt",
                "output_path": "out/frame.png",
                "input_images": [{"path": bad_img}],
            }
        ])
        with pytest.raises(SystemExit, match="path traversal detected in input_images"):
            _run_main(tmp_path, "j3")
