"""Regression tests for path-traversal checks in generate_pet_images.py."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from generate_pet_images import path_list  # noqa: E402

TRAVERSAL_PATHS = [
    "../outside.png",
    "../../etc/passwd",
    "../sibling/secret.png",
    "subdir/../../outside.png",
]


def _job(image_path: str) -> dict:
    return {"id": "test-job", "input_images": [{"path": image_path}]}


def _make_manifest(run_dir: Path, jobs: list[dict]) -> None:
    manifest = {"jobs": jobs}
    (run_dir / "imagegen-jobs.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )


def _run_main(run_dir: Path, job_id: str) -> None:
    import generate_pet_images as gpi

    sys.argv = [
        "generate_pet_images.py",
        "--run-dir", str(run_dir),
        "--job-id", job_id,
    ]
    os.environ.setdefault("OPENAI_API_KEY", "test-key")
    gpi.main()


class TestPathListTraversalRejection(unittest.TestCase):
    """path_list must raise SystemExit for any input_images path that escapes run_dir."""

    def test_rejects_traversal_in_input_images(self) -> None:
        for bad_path in TRAVERSAL_PATHS:
            with self.subTest(bad_path=bad_path):
                with tempfile.TemporaryDirectory() as tmp:
                    tmp_path = Path(tmp).resolve()
                    job = _job(bad_path)
                    with self.assertRaisesRegex(SystemExit, "path traversal detected in input_images"):
                        path_list(tmp_path, job)

    def test_accepts_safe_path_when_file_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp).resolve()
            image = tmp_path / "images" / "pet.png"
            image.parent.mkdir(parents=True)
            image.write_bytes(b"\x89PNG\r\n")
            job = _job("images/pet.png")
            result = path_list(tmp_path, job)
            self.assertEqual(result, [image.resolve()])

    def test_rejects_missing_safe_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp).resolve()
            job = _job("images/missing.png")
            with self.assertRaisesRegex(SystemExit, "not found"):
                path_list(tmp_path, job)


class TestMainJobTraversalRejection(unittest.TestCase):
    """main() must raise SystemExit before any I/O or API call for traversal paths."""

    def test_rejects_traversal_in_prompt_file(self) -> None:
        for bad_prompt in TRAVERSAL_PATHS:
            with self.subTest(bad_prompt=bad_prompt):
                with tempfile.TemporaryDirectory() as tmp:
                    tmp_path = Path(tmp)
                    _make_manifest(tmp_path, [
                        {
                            "id": "j1",
                            "prompt_file": bad_prompt,
                            "output_path": "out/frame.png",
                            "input_images": [],
                        }
                    ])
                    with self.assertRaisesRegex(SystemExit, "path traversal detected in prompt_file"):
                        _run_main(tmp_path, "j1")

    def test_rejects_traversal_in_output_path(self) -> None:
        for bad_output in TRAVERSAL_PATHS:
            with self.subTest(bad_output=bad_output):
                with tempfile.TemporaryDirectory() as tmp:
                    tmp_path = Path(tmp)
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
                    with self.assertRaisesRegex(SystemExit, "path traversal detected in output_path"):
                        _run_main(tmp_path, "j2")

    def test_rejects_traversal_in_input_images_via_main(self) -> None:
        for bad_img in TRAVERSAL_PATHS:
            with self.subTest(bad_img=bad_img):
                with tempfile.TemporaryDirectory() as tmp:
                    tmp_path = Path(tmp)
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
                    with self.assertRaisesRegex(SystemExit, "path traversal detected in input_images"):
                        _run_main(tmp_path, "j3")


if __name__ == "__main__":
    unittest.main()
