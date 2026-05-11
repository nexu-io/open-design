#!/usr/bin/env python3
"""
PPT Master - Image Orientation Management Tool

Provides visual image orientation filtering, fix code generation,
and batch image rotation functionality.

Usage:
    python3 scripts/rotate_images.py gen <images_directory>
    python3 scripts/rotate_images.py fix <fixes.json>
    python3 scripts/rotate_images.py auto <images_directory>
"""


import os
import sys
import json
import re
from pathlib import Path
from typing import List, Dict, Union, Any, Optional
from PIL import Image, ExifTags


ORIENTATION_TAG_ID = 274  # 0x0112

class ImageRotator:
    """Image orientation manager"""

    def __init__(self):
        """Initialize the manager"""
        pass

    @staticmethod
    def _repo_root() -> Path:
        # scripts/rotate_images.py -> skills/ppt-master/
        return Path(__file__).resolve().parent.parent

    @staticmethod
    def _normalize_task_path(path_str: str) -> str:
        p = (path_str or "").strip()
        if not p:
            return p

        # common copy/paste artifacts
        p = re.sub(r"^file:(?:///?)+", "", p, flags=re.IGNORECASE)
        p = p.replace("\\", "/")
        p = re.sub(r"^\\./", "", p)
        return p

    @staticmethod
    def _natural_sort_key(s: Union[str, Path]) -> List[Union[int, str]]:
        """Natural sort key generator"""
        return [int(text) if text.isdigit() else text.lower()
                for text in re.split(r'(\d+)', str(s))]

    def _save_in_place(
        self,
        img: Image.Image,
        file_path: Path,
        src_format: Optional[str],
        *,
        exif_bytes: Optional[bytes] = None,
        icc_profile: Optional[bytes] = None,
    ) -> None:
        fmt = (src_format or "").upper()

        save_kwargs: Dict[str, Any] = {}
        if icc_profile:
            save_kwargs["icc_profile"] = icc_profile
        if exif_bytes:
            save_kwargs["exif"] = exif_bytes

        # Avoid passing unsupported params to formats (e.g. PNG doesn't take `quality`).
        if fmt in {"JPEG", "JPG"}:
            save_kwargs["quality"] = 95
            # keep it simple; avoid Pillow-version-specific kwargs like optimize/subsampling
            if img.mode not in {"RGB", "L"}:
                img = img.convert("RGB")
        elif fmt == "WEBP":
            save_kwargs["quality"] = 95

        try:
            img.save(file_path, **save_kwargs)
        except TypeError:
            # Fallback: drop metadata kwargs that some formats/plugins may reject.
            save_kwargs.pop("exif", None)
            save_kwargs.pop("icc_profile", None)
            img.save(file_path, **save_kwargs)

    def auto_fix_exif(self, target_dir: Union[str, Path]) -> int:
        """Auto-fix EXIF orientation for all images in the directory

        Args:
            target_dir: Target directory

        Returns:
            Number of images fixed
        """
        target_path = Path(target_dir)
        if not target_path.exists():
            return 0

        print(f"[AUTO] Checking EXIF orientation information...")
        fixed_count = 0
        valid_exts = {'.jpg', '.jpeg', '.webp'} # PNG typically does not carry rotation EXIF

        # Pre-collect file list to avoid issues caused by modifying during iteration
        files = [f for f in target_path.iterdir() if f.is_file() and f.suffix.lower() in valid_exts]

        for f in files:
            if self._fix_single_exif(f):
                fixed_count += 1

        if fixed_count > 0:
            print(f"[OK] Auto-fixed EXIF orientation for {fixed_count} image(s)")
        else:
            print(f"[INFO] No images requiring EXIF correction found")

        return fixed_count

    def generate_html_tool(self, target_dir: str, output_filename: str = "image_orientation_tool.html") -> str:
        """Generate the image filtering HTML tool

        Automatically performs EXIF correction before generating.
        """
        target_path = Path(target_dir).resolve()
        repo_root = self._repo_root()

        if not target_path.exists():
            raise FileNotFoundError(f"Directory not found: {target_path}")

        # 1. Perform automatic EXIF correction first
        self.auto_fix_exif(target_path)

        # 2. Generate HTML
        # Tool is generated in the parent directory (projects/)
        project_root = target_path.parent
        html_output_path = project_root / output_filename

        # Collect images
        images = []
        valid_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}

        print(f"[SCAN] Scanning directory to generate webpage: {target_path}")

        files = sorted(target_path.iterdir(), key=lambda p: self._natural_sort_key(p.name))

        for f in files:
            if f.is_file() and f.suffix.lower() in valid_exts:
                try:
                    # src is used for HTML display, keep path relative to the HTML file (e.g. "images/1.jpg")
                    src_rel_path = f.relative_to(project_root).as_posix()

                    # path is used for JSON data, using path relative to the working directory (usually repo root)
                    # e.g. "projects/Name/images/1.jpg"
                    # We assume the script is run from the repo root, or target_path is already absolute
                    # The safest approach is to compute a path relative to the repo root (avoids CWD changes making fixes.json unusable)
                    try:
                        repo_rel_path = f.relative_to(repo_root).as_posix()
                    except ValueError:
                        # If the file is not under CWD, fall back to absolute path
                        repo_rel_path = str(f.resolve())

                    images.append({'src': src_rel_path, 'path': repo_rel_path})
                except ValueError:
                    print(f"[WARN] Warning: {f.name} cannot compute relative path, skipped")
                    continue

        if not images:
            raise ValueError("No image files found")

        json_data = json.dumps(images)

        # Embed HTML template
        html_content = self._get_html_template().replace('__IMAGES__', json_data)

        with open(html_output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        return str(html_output_path)

    def apply_fixes(self, json_source: Union[str, List[Dict]]) -> Dict[str, int]:
        """Apply image rotation fixes"""
        tasks = []
        json_file_dir: Optional[Path] = None

        # Parse input
        if isinstance(json_source, str):
            if json_source.endswith('.json') or os.path.exists(json_source):
                json_file_dir = Path(json_source).resolve().parent
                with open(json_source, 'r', encoding='utf-8') as f:
                    tasks = json.load(f)
            else:
                try:
                    tasks = json.loads(json_source)
                except json.JSONDecodeError:
                    raise ValueError("Invalid input: not a file path nor a valid JSON string")
        elif isinstance(json_source, list):
            tasks = json_source

        print(f"[WORK] Starting {len(tasks)} manual rotation task(s)...")
        print("=" * 60)

        cwd = Path(os.getcwd())
        repo_root = self._repo_root()
        stats = {'total': len(tasks), 'success': 0}

        for task in tasks:
            rel_path = self._normalize_task_path(task.get('path', ''))
            rotation = task.get('rotation')

            if not rel_path or rotation is None:
                continue

            # Absolute paths should stay absolute; repo-relative paths should resolve from repo root.
            target_file = Path(rel_path)
            if not target_file.is_absolute():
                # Prefer repo root (stable); also allow CWD and fixes.json location as fallbacks.
                candidates = [
                    repo_root / rel_path,
                    cwd / rel_path,
                ]
                if json_file_dir:
                    candidates.append(json_file_dir / rel_path)

                # Compatibility with legacy logic / bare filenames (try finding under the projects directory)
                candidates.append(repo_root / 'projects' / rel_path)
                candidates.append(cwd / 'projects' / rel_path)
                if json_file_dir:
                    candidates.append(json_file_dir / 'projects' / rel_path)

                target_file = next((c for c in candidates if c.exists()), candidates[0])

            if not target_file.exists():
                print(f"[SKIP] File not found: {rel_path}")
                continue

            try:
                self._rotate_single_image(target_file, rotation)
                print(f"[OK] {target_file.name} rotated {rotation} degrees")
                stats['success'] += 1
            except Exception as e:
                print(f"[ERROR] {target_file.name}: {e}")

        return stats

    def _fix_single_exif(self, file_path: Path) -> bool:
        """Check and fix EXIF orientation for a single image"""
        try:
            fixed_img: Optional[Image.Image] = None
            exif_bytes: Optional[bytes] = None
            icc_profile: Optional[bytes] = None
            src_format: Optional[str] = None

            with Image.open(file_path) as img:
                exif = img.getexif()
                orientation = exif.get(ORIENTATION_TAG_ID, 1) if exif else None

                if not orientation or orientation == 1:
                    return False

                print(f"  [EXIF] Fixing: {file_path.name} (Orientation={orientation})")

                # Apply rotation
                fixed_img = self._apply_exif_orientation(img, orientation)
                fixed_img.load()

                # Remove the specific Orientation tag, keep other EXIF data
                if exif:
                    exif[ORIENTATION_TAG_ID] = 1
                    exif_bytes = exif.tobytes()

                icc_profile = img.info.get('icc_profile')
                src_format = img.format

            # Must save after the original file is closed (Windows requirement)
            if fixed_img is None:
                return False

            self._save_in_place(
                fixed_img,
                file_path,
                src_format,
                exif_bytes=exif_bytes,
                icc_profile=icc_profile,
            )
            return True
        except Exception as e:
            print(f"  [WARN] Failed to read EXIF for {file_path.name}: {e}")
            return False

    def _get_exif_orientation(self, img: Image.Image) -> Optional[int]:
        """Get the Orientation value"""
        try:
            exif = img._getexif()
            if exif:
                for tag, value in exif.items():
                    if ExifTags.TAGS.get(tag) == 'Orientation':
                        return value
        except Exception:
            pass
        return None

    def _apply_exif_orientation(self, img: Image.Image, orientation: int) -> Image.Image:
        """Rotate image according to the Orientation value"""
        T = getattr(Image, "Transpose", Image)
        if orientation == 2:
            return img.transpose(T.FLIP_LEFT_RIGHT)
        if orientation == 3:
            return img.transpose(T.ROTATE_180)
        if orientation == 4:
            return img.transpose(T.FLIP_TOP_BOTTOM)
        if orientation == 5:
            return img.transpose(T.TRANSPOSE)
        if orientation == 6:
            return img.transpose(T.ROTATE_270)
        if orientation == 7:
            return img.transpose(T.TRANSVERSE)
        if orientation == 8:
            return img.transpose(T.ROTATE_90)
        return img

    def _rotate_single_image(self, file_path: Path, rotation_deg: int):
        """Manually rotate a single image"""
        T = getattr(Image, "Transpose", Image)
        with Image.open(file_path) as img:
            ccw_angle = (360 - int(rotation_deg)) % 360
            if ccw_angle == 0:
                return

            if ccw_angle == 90:
                rotated = img.transpose(T.ROTATE_90)
            elif ccw_angle == 180:
                rotated = img.transpose(T.ROTATE_180)
            elif ccw_angle == 270:
                rotated = img.transpose(T.ROTATE_270)
            else:
                rotated = img.rotate(ccw_angle, expand=True)

            rotated.load()

            exif = img.getexif()
            exif_bytes: Optional[bytes] = None
            if exif:
                exif[ORIENTATION_TAG_ID] = 1
                exif_bytes = exif.tobytes()

            icc_profile = img.info.get('icc_profile')
            src_format = img.format

        self._save_in_place(
            rotated,
            file_path,
            src_format,
            exif_bytes=exif_bytes,
            icc_profile=icc_profile,
        )

    def _get_html_template(self) -> str:
        """Get HTML template content"""
        return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Image Orientation Tool</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f0f2f5; color: #333; }
        .header {
            position: sticky; top: 0; background: rgba(255,255,255,0.95); padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08); z-index: 100;
            border-radius: 12px; margin-bottom: 20px;
            backdrop-filter: blur(10px);
            display: flex; justify-content: space-between; align-items: center;
        }
        h2 { margin: 0; font-size: 1.5rem; color: #1a1a1a; }
        .instructions { color: #666; margin-top: 5px; font-size: 0.9rem; }

        .grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 15px;
        }
        .card {
            background: white; border-radius: 12px; overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05); text-align: center;
            cursor: pointer; transition: all 0.2s ease;
            position: relative; border: 2px solid transparent;
        }
        .card:hover { transform: translateY(-4px); box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
        .card.modified { border-color: #007bff; background: #f8fbff; }

        .img-wrapper {
            height: 180px; width: 100%; display: flex; align-items: center; justify-content: center;
            background: #e9ecef; overflow: hidden; position: relative;
        }
        img {
            max-width: 100%; max-height: 100%; object-fit: contain;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .info { padding: 10px; font-size: 11px; color: #555; word-break: break-all; border-top: 1px solid #eee; }

        .badge {
            position: absolute; top: 10px; right: 10px;
            background: #007bff; color: white; padding: 4px 8px;
            border-radius: 20px; font-size: 11px; font-weight: bold;
            opacity: 0; transform: scale(0.8); transition: all 0.2s;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .card.modified .badge { opacity: 1; transform: scale(1); }

        .btn {
            background: #007bff; color: white; border: none; padding: 10px 24px;
            border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s;
        }
        .btn:hover { background: #0056b3; }

        #output-modal {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;
        }
        .modal-content {
            background: white; padding: 30px; border-radius: 16px; width: 80%; max-width: 600px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        textarea {
            width: 100%; height: 200px; padding: 10px; border: 1px solid #ddd; border-radius: 8px;
            font-family: inherit; resize: vertical; margin: 15px 0;
            background: #f8f9fa;
        }
    </style>
</head>
<body>

<div class="header">
    <div>
        <h2>Image Orientation Fix</h2>
        <div class="instructions">Click an image to rotate (90 -> 180 -> 270 -> 0). Natural order sorting.</div>
    </div>
    <button class="btn" onclick="showCode()">Generate Fix Code</button>
</div>

<div class="grid" id="grid"></div>

<div id="output-modal" onclick="if(event.target===this)this.style.display='none'">
    <div class="modal-content">
        <h3>Copy the code below</h3>
        <p style="color:#666; font-size: 0.9em;">Copy this JSON content and send it to the AI assistant, or save it as 'fixes.json'.</p>
        <textarea id="output-area" readonly></textarea>
        <div style="text-align: right;">
            <button class="btn" onclick="document.getElementById('output-modal').style.display='none'">Close</button>
        </div>
    </div>
</div>

<script>
    const images = __IMAGES__;
    const grid = document.getElementById('grid');

    images.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-rotation', 0);
        // use stable path for the data attribute
        card.setAttribute('data-path', item.path);

        const filename = item.src.split('/').pop();

        card.innerHTML = `
            <div class="img-wrapper">
                <img src="${item.src}" alt="${filename}" loading="lazy">
                <div class="badge">0°</div>
            </div>
            <div class="info">${filename}</div>
        `;

        card.onclick = function() {
            let rot = parseInt(this.getAttribute('data-rotation'));
            rot = (rot + 90) % 360;
            this.setAttribute('data-rotation', rot);

            const img = this.querySelector('img');
            img.style.transform = `rotate(${rot}deg)`;

            const badge = this.querySelector('.badge');
            badge.innerText = rot + '°';

            if (rot > 0) {
                this.classList.add('modified');
            } else {
                this.classList.remove('modified');
            }
        };

        grid.appendChild(card);
    });

    function showCode() {
        const tasks = [];
        document.querySelectorAll('.card').forEach(card => {
            const rot = parseInt(card.getAttribute('data-rotation'));
            if (rot > 0) {
                tasks.push({
                    path: card.getAttribute('data-path'),
                    rotation: rot
                });
            }
        });

        const jsonStr = JSON.stringify(tasks, null, 2);
        const modal = document.getElementById('output-modal');
        const area = document.getElementById('output-area');

        modal.style.display = 'flex';
        area.value = jsonStr;
        area.select();
        try { document.execCommand('copy'); } catch(e){}
    }
</script>
</body>
</html>
"""

def main() -> None:
    """Run the CLI entry point."""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    if command in {"-h", "--help", "help"}:
        print(__doc__)
        sys.exit(0)

    rotator = ImageRotator()

    if command == 'gen':
        if len(sys.argv) < 3:
            print("[ERROR] Error: images directory path is required")
            print("Usage: python3 scripts/rotate_images.py gen <images_directory>")
            sys.exit(1)

        target_dir = sys.argv[2]
        try:
            output_path = rotator.generate_html_tool(target_dir)
            print(f"[OK] HTML tool created: {output_path}")
            print(f"[LINK] Open in browser: file:///{Path(output_path).as_posix()}")
        except Exception as e:
            print(f"[ERROR] Generation failed: {e}")
            sys.exit(1)

    elif command == 'fix':
        if len(sys.argv) < 3:
            print("[ERROR] Error: fixes.json path is required")
            print("Usage: python3 scripts/rotate_images.py fix <fixes.json>")
            sys.exit(1)

        json_file = sys.argv[2]
        try:
            stats = rotator.apply_fixes(json_file)
            print(f"\n[DONE] Processing complete: {stats['success']} succeeded / {stats['total']} total")
        except Exception as e:
            print(f"[ERROR] Execution failed: {e}")
            sys.exit(1)

    elif command == 'auto':
        if len(sys.argv) < 3:
            print("[ERROR] Error: images directory path is required")
            print("Usage: python3 scripts/rotate_images.py auto <images_directory>")
            sys.exit(1)

        target_dir = sys.argv[2]
        try:
            # Only perform automatic EXIF fix
            count = rotator.auto_fix_exif(Path(target_dir))
            if count == 0:
                print("[INFO] No images requiring automatic fix found")
        except Exception as e:
            print(f"[ERROR] Automatic fix failed: {e}")
            sys.exit(1)

    else:
        print(f"[ERROR] Error: unknown command '{command}'")
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    main()
