#!/usr/bin/env python3
"""PPT Master project management helpers.

Usage:
    python3 scripts/project_manager.py init <project_name> [--format ppt169] [--dir projects]
    python3 scripts/project_manager.py import-sources <project_path> <source1> [<source2> ...] [--move | --copy]
    python3 scripts/project_manager.py validate <project_path>
    python3 scripts/project_manager.py info <project_path>
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

try:
    from project_utils import (
        CANVAS_FORMATS,
        get_project_info as get_project_info_common,
        normalize_canvas_format,
        validate_project_structure,
        validate_svg_viewbox,
    )
except ImportError:
    tools_dir = Path(__file__).resolve().parent
    if str(tools_dir) not in sys.path:
        sys.path.insert(0, str(tools_dir))
    from project_utils import (  # type: ignore
        CANVAS_FORMATS,
        get_project_info as get_project_info_common,
        normalize_canvas_format,
        validate_project_structure,
        validate_svg_viewbox,
    )

TOOLS_DIR = Path(__file__).resolve().parent
SKILL_DIR = TOOLS_DIR.parent
REPO_ROOT = SKILL_DIR.parent.parent
SOURCE_DIRNAME = "sources"
TEXT_SOURCE_SUFFIXES = {".md", ".markdown", ".txt"}
TABLE_TEXT_SUFFIXES = {".csv", ".tsv"}
PDF_SUFFIXES = {".pdf"}
PRESENTATION_SUFFIXES = {".pptx", ".pptm", ".ppsx", ".ppsm", ".potx", ".potm"}
EXCEL_SUFFIXES = {".xlsx", ".xlsm"}
LEGACY_EXCEL_SUFFIXES = {".xls"}
DOC_SUFFIXES = {
    ".docx", ".doc", ".odt", ".rtf",          # Office documents
    ".epub",                                    # eBooks
    ".html", ".htm",                            # Web pages
    ".tex", ".latex", ".rst", ".org",           # Academic / technical
    ".ipynb", ".typ",                           # Notebooks / Typst
}
WECHAT_HOST_KEYWORDS = ("mp.weixin.qq.com", "weixin.qq.com")


def _curl_cffi_available() -> bool:
    """Return whether curl_cffi is importable (enables Python TLS impersonation)."""
    try:
        import curl_cffi  # noqa: F401
        return True
    except ImportError:
        return False


def is_url(value: str) -> bool:
    """Return whether a string looks like an HTTP(S) URL."""
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def sanitize_name(value: str) -> str:
    """Sanitize a user-facing name into a filesystem-safe token."""
    safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in value.strip())
    safe = safe.strip("._")
    while "__" in safe:
        safe = safe.replace("__", "_")
    return safe[:120] or "source"


def derive_url_basename(url: str) -> str:
    """Derive a stable base filename from a URL."""
    parsed = urlparse(url)
    parts = [sanitize_name(parsed.netloc)]
    if parsed.path and parsed.path != "/":
        path_part = sanitize_name(parsed.path.strip("/").replace("/", "_"))
        if path_part:
            parts.append(path_part)
    return "_".join(part for part in parts if part) or "web_source"


def is_within_path(path: Path, parent: Path) -> bool:
    """Return whether `path` resolves inside `parent`."""
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


class ProjectManager:
    """Create, inspect, validate, and populate project folders."""

    CANVAS_FORMATS = CANVAS_FORMATS

    def __init__(self, base_dir: str = "projects") -> None:
        self.base_dir = Path(base_dir)

    def init_project(
        self,
        project_name: str,
        canvas_format: str = "ppt169",
        base_dir: str | None = None,
    ) -> str:
        base_path = Path(base_dir) if base_dir else self.base_dir

        normalized_format = normalize_canvas_format(canvas_format)
        if normalized_format not in self.CANVAS_FORMATS:
            available = ", ".join(sorted(self.CANVAS_FORMATS.keys()))
            raise ValueError(
                f"Unsupported canvas format: {canvas_format} "
                f"(available: {available}; common alias: xhs -> xiaohongshu)"
            )

        date_str = datetime.now().strftime("%Y%m%d")
        project_dir_name = f"{project_name}_{normalized_format}_{date_str}"
        project_path = base_path / project_dir_name

        if project_path.exists():
            raise FileExistsError(f"Project directory already exists: {project_path}")

        for rel_path in (
            "svg_output",
            "svg_final",
            "images",
            "notes",
            "templates",
            SOURCE_DIRNAME,
            "exports",
        ):
            (project_path / rel_path).mkdir(parents=True, exist_ok=True)

        canvas_info = self.CANVAS_FORMATS[normalized_format]
        readme_path = project_path / "README.md"
        readme_path.write_text(
            (
                f"# {project_name}\n\n"
                f"- Canvas format: {normalized_format}\n"
                f"- Created: {date_str}\n\n"
                "## Directories\n\n"
                "- `svg_output/`: raw SVG output\n"
                "- `svg_final/`: finalized SVG output\n"
                "- `images/`: presentation assets\n"
                "- `notes/`: speaker notes\n"
                "- `templates/`: project templates\n"
                "- `sources/`: source materials and normalized markdown\n"
                "- `exports/`: main native pptx (timestamped)\n"
                "- `backup/<timestamp>/`: SVG snapshot pptx + svg_output/ archive (auto-created on export; safe to delete old timestamps)\n"
            ),
            encoding="utf-8",
        )

        print(f"Project created: {project_path}")
        print(f"Canvas: {canvas_info['name']} ({canvas_info['dimensions']})")
        return str(project_path)

    def _source_dir(self, project_path: Path) -> Path:
        sources_dir = project_path / SOURCE_DIRNAME
        sources_dir.mkdir(parents=True, exist_ok=True)
        return sources_dir

    def _ensure_unique_path(self, path: Path) -> Path:
        if not path.exists():
            return path

        suffix = path.suffix
        stem = path.stem
        counter = 2
        while True:
            candidate = path.with_name(f"{stem}_{counter}{suffix}")
            if not candidate.exists():
                return candidate
            counter += 1

    def _copy_or_move_file(self, source: Path, destination: Path, move: bool) -> Path:
        try:
            if source.resolve() == destination.resolve():
                return destination
        except FileNotFoundError:
            pass

        destination = self._ensure_unique_path(destination)
        if move:
            shutil.move(str(source), str(destination))
        else:
            shutil.copy2(source, destination)
        return destination

    def _copy_or_move_tree(self, source: Path, destination: Path, move: bool) -> Path:
        try:
            if source.resolve() == destination.resolve():
                return destination
        except FileNotFoundError:
            pass

        destination = self._ensure_unique_path(destination)
        if move:
            shutil.move(str(source), str(destination))
        else:
            shutil.copytree(source, destination)
        return destination

    def _run_tool(self, args: list[str]) -> None:
        try:
            result = subprocess.run(
                args,
                cwd=REPO_ROOT,
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        except FileNotFoundError as exc:
            raise RuntimeError(f"Missing executable: {args[0]}") from exc
        except subprocess.CalledProcessError as exc:
            details = (exc.stderr or exc.stdout or "").strip()
            raise RuntimeError(details or "tool execution failed") from exc

        if result.stdout.strip():
            print(result.stdout.strip())

    def _import_pdf(self, pdf_path: Path, markdown_path: Path) -> None:
        self._run_tool(
            [
                sys.executable,
                str(TOOLS_DIR / "source_to_md" / "pdf_to_md.py"),
                str(pdf_path),
                "-o",
                str(markdown_path),
            ]
        )

    def _import_doc(self, doc_path: Path, markdown_path: Path) -> None:
        self._run_tool(
            [
                sys.executable,
                str(TOOLS_DIR / "source_to_md" / "doc_to_md.py"),
                str(doc_path),
                "-o",
                str(markdown_path),
            ]
        )

    def _import_presentation(self, presentation_path: Path, markdown_path: Path) -> None:
        self._run_tool(
            [
                sys.executable,
                str(TOOLS_DIR / "source_to_md" / "ppt_to_md.py"),
                str(presentation_path),
                "-o",
                str(markdown_path),
            ]
        )

    def _import_excel(self, excel_path: Path, markdown_path: Path) -> None:
        self._run_tool(
            [
                sys.executable,
                str(TOOLS_DIR / "source_to_md" / "excel_to_md.py"),
                str(excel_path),
                "-o",
                str(markdown_path),
            ]
        )

    def _import_url(self, url: str, markdown_path: Path) -> None:
        # Prefer web_to_md.py: it uses curl_cffi internally when available,
        # which handles WeChat and other TLS-fingerprint-blocked sites.
        # Fall back to the Node.js version only when the URL is known to
        # require TLS impersonation AND curl_cffi isn't installed.
        host = urlparse(url).netloc.lower()
        is_tls_sensitive = any(keyword in host for keyword in WECHAT_HOST_KEYWORDS)

        if is_tls_sensitive and not _curl_cffi_available() and shutil.which("node"):
            command = ["node", str(TOOLS_DIR / "source_to_md" / "web_to_md.cjs"),
                       url, "-o", str(markdown_path)]
        else:
            command = [
                sys.executable,
                str(TOOLS_DIR / "source_to_md" / "web_to_md.py"),
                url,
                "-o",
                str(markdown_path),
            ]
        self._run_tool(command)

    def _archive_url_record(self, sources_dir: Path, url: str) -> Path:
        file_path = self._ensure_unique_path(sources_dir / f"{derive_url_basename(url)}.url.txt")
        file_path.write_text(
            f"URL: {url}\nImported: {datetime.now().isoformat(timespec='seconds')}\n",
            encoding="utf-8",
        )
        return file_path

    def _normalize_text_source(self, source_path: Path, sources_dir: Path) -> Path:
        target = self._ensure_unique_path(sources_dir / f"{source_path.stem}.md")
        content = source_path.read_text(encoding="utf-8", errors="replace")
        target.write_text(content, encoding="utf-8")
        return target

    def _canonicalize_markdown_content(self, content: str) -> str:
        canonical = content.replace("\r\n", "\n")
        canonical = re.sub(r"(?m)^(\s*Crawled:\s+).*$", r"\1__IGNORED__", canonical)
        canonical = re.sub(r"(?m)^(\s*Imported:\s+).*$", r"\1__IGNORED__", canonical)
        canonical = re.sub(r"([^\s\]()/]+_files)/", "__ASSET_DIR__/", canonical)
        return canonical.strip()

    def _find_equivalent_markdown(self, source_path: Path, sources_dir: Path) -> Path | None:
        source_content = source_path.read_text(encoding="utf-8", errors="replace")
        canonical_source = self._canonicalize_markdown_content(source_content)

        for existing in sorted(sources_dir.iterdir()):
            if existing.suffix.lower() not in {".md", ".markdown"}:
                continue
            try:
                if existing.resolve() == source_path.resolve():
                    continue
            except FileNotFoundError:
                pass

            existing_content = existing.read_text(encoding="utf-8", errors="replace")
            if self._canonicalize_markdown_content(existing_content) == canonical_source:
                return existing

        return None

    def _companion_asset_dir(self, source_path: Path) -> Path | None:
        candidate = source_path.with_name(f"{source_path.stem}_files")
        if candidate.exists() and candidate.is_dir():
            return candidate
        return None

    def _rewrite_markdown_asset_refs(
        self,
        markdown_path: Path,
        original_asset_dirname: str,
        imported_asset_dirname: str,
    ) -> None:
        if original_asset_dirname == imported_asset_dirname:
            return

        content = markdown_path.read_text(encoding="utf-8", errors="replace")
        updated = content.replace(f"{original_asset_dirname}/", f"{imported_asset_dirname}/")
        if updated != content:
            markdown_path.write_text(updated, encoding="utf-8")

    def _import_markdown_with_assets(
        self,
        source_path: Path,
        sources_dir: Path,
        move: bool,
    ) -> tuple[Path, Path | None, str | None]:
        archived_markdown = self._copy_or_move_file(
            source_path,
            sources_dir / source_path.name,
            move=move,
        )

        asset_dir = self._companion_asset_dir(source_path)
        if asset_dir is None:
            return archived_markdown, None, None

        imported_asset_dir = self._copy_or_move_tree(
            asset_dir,
            sources_dir / f"{archived_markdown.stem}_files",
            move=move,
        )
        self._rewrite_markdown_asset_refs(
            archived_markdown,
            original_asset_dirname=asset_dir.name,
            imported_asset_dirname=imported_asset_dir.name,
        )

        note = None
        if archived_markdown.stem != source_path.stem:
            note = (
                f"{source_path}: renamed imported markdown to {archived_markdown.name} "
                f"and rewrote asset references to {imported_asset_dir.name}/"
            )
        return archived_markdown, imported_asset_dir, note

    def import_sources(
        self,
        project_path: str,
        source_items: list[str],
        move: bool = False,
        copy: bool = False,
    ) -> dict[str, list[str]]:
        if move and copy:
            raise ValueError("--move and --copy are mutually exclusive")
        project_dir = Path(project_path)
        if not project_dir.exists() or not project_dir.is_dir():
            raise FileNotFoundError(f"Project directory not found: {project_dir}")
        if not source_items:
            raise ValueError("At least one source path or URL is required")

        sources_dir = self._source_dir(project_dir)
        summary: dict[str, list[str]] = {
            "archived": [],
            "markdown": [],
            "assets": [],
            "notes": [],
            "skipped": [],
        }
        explicit_markdown_stems = {
            Path(item).stem
            for item in source_items
            if not is_url(item)
            and Path(item).exists()
            and Path(item).is_file()
            and Path(item).suffix.lower() in {".md", ".markdown"}
        }

        for item in source_items:
            if is_url(item):
                archived = self._archive_url_record(sources_dir, item)
                markdown_path = self._ensure_unique_path(
                    sources_dir / f"{derive_url_basename(item)}.md"
                )
                try:
                    self._import_url(item, markdown_path)
                except Exception as exc:  # pragma: no cover - summary path
                    summary["skipped"].append(f"{item}: {exc}")
                    continue

                summary["archived"].append(str(archived))
                summary["markdown"].append(str(markdown_path))
                continue

            source_path = Path(item)
            if not source_path.exists():
                summary["skipped"].append(f"{item}: path not found")
                continue
            if source_path.is_dir():
                summary["skipped"].append(f"{item}: directories are not supported")
                continue

            if copy:
                effective_move = False
            elif move:
                effective_move = True
            elif is_within_path(source_path, REPO_ROOT):
                effective_move = True
                print(
                    f"note: {source_path} is inside the ppt-master repo; moved "
                    f"(not copied) to avoid accidental commit. Pass --copy to override.",
                    file=sys.stderr,
                )
            else:
                effective_move = False
            suffix = source_path.suffix.lower()

            if suffix in {".md", ".markdown"}:
                duplicate_markdown = self._find_equivalent_markdown(source_path, sources_dir)
                if duplicate_markdown is not None:
                    summary["markdown"].append(str(duplicate_markdown))
                    summary["notes"].append(
                        f"{item}: skipped duplicate markdown import because equivalent content already exists as {duplicate_markdown.name}"
                    )
                    continue

                archived_markdown, asset_dir, note = self._import_markdown_with_assets(
                    source_path,
                    sources_dir,
                    move=effective_move,
                )
                summary["archived"].append(str(archived_markdown))
                summary["markdown"].append(str(archived_markdown))
                if asset_dir is not None:
                    summary["assets"].append(str(asset_dir))
                if note:
                    summary["notes"].append(note)
                continue

            archived_path = self._copy_or_move_file(
                source_path,
                sources_dir / source_path.name,
                move=effective_move,
            )
            summary["archived"].append(str(archived_path))

            if suffix in PDF_SUFFIXES:
                canonical_markdown_path = sources_dir / f"{archived_path.stem}.md"
                if archived_path.stem in explicit_markdown_stems:
                    summary["notes"].append(
                        f"{item}: skipped PDF auto-conversion because a same-stem Markdown source was provided"
                    )
                    continue
                if canonical_markdown_path.exists():
                    summary["markdown"].append(str(canonical_markdown_path))
                    summary["notes"].append(
                        f"{item}: skipped PDF auto-conversion because {canonical_markdown_path.name} already exists"
                    )
                    continue
                markdown_path = canonical_markdown_path
                try:
                    self._import_pdf(archived_path, markdown_path)
                    summary["markdown"].append(str(markdown_path))
                except Exception as exc:  # pragma: no cover - summary path
                    summary["skipped"].append(f"{item}: PDF conversion failed ({exc})")
            elif suffix in PRESENTATION_SUFFIXES:
                canonical_markdown_path = sources_dir / f"{archived_path.stem}.md"
                if archived_path.stem in explicit_markdown_stems:
                    summary["notes"].append(
                        f"{item}: skipped presentation auto-conversion because a same-stem Markdown source was provided"
                    )
                    continue
                if canonical_markdown_path.exists():
                    summary["markdown"].append(str(canonical_markdown_path))
                    summary["notes"].append(
                        f"{item}: skipped presentation auto-conversion because {canonical_markdown_path.name} already exists"
                    )
                    continue
                markdown_path = canonical_markdown_path
                try:
                    self._import_presentation(archived_path, markdown_path)
                    summary["markdown"].append(str(markdown_path))
                except Exception as exc:  # pragma: no cover - summary path
                    summary["skipped"].append(f"{item}: presentation conversion failed ({exc})")
            elif suffix in EXCEL_SUFFIXES:
                canonical_markdown_path = sources_dir / f"{archived_path.stem}.md"
                if archived_path.stem in explicit_markdown_stems:
                    summary["notes"].append(
                        f"{item}: skipped Excel auto-conversion because a same-stem Markdown source was provided"
                    )
                    continue
                if canonical_markdown_path.exists():
                    summary["markdown"].append(str(canonical_markdown_path))
                    summary["notes"].append(
                        f"{item}: skipped Excel auto-conversion because {canonical_markdown_path.name} already exists"
                    )
                    continue
                markdown_path = canonical_markdown_path
                try:
                    self._import_excel(archived_path, markdown_path)
                    summary["markdown"].append(str(markdown_path))
                except Exception as exc:  # pragma: no cover - summary path
                    summary["skipped"].append(f"{item}: Excel conversion failed ({exc})")
            elif suffix in LEGACY_EXCEL_SUFFIXES:
                summary["notes"].append(
                    f"{item}: archived only; legacy .xls is not converted automatically. "
                    "Resave as .xlsx to generate Markdown."
                )
            elif suffix in TABLE_TEXT_SUFFIXES:
                summary["notes"].append(
                    f"{item}: archived as a plain-text table source; no Markdown conversion needed"
                )
            elif suffix in DOC_SUFFIXES:
                canonical_markdown_path = sources_dir / f"{archived_path.stem}.md"
                if archived_path.stem in explicit_markdown_stems:
                    summary["notes"].append(
                        f"{item}: skipped document auto-conversion because a same-stem Markdown source was provided"
                    )
                    continue
                if canonical_markdown_path.exists():
                    summary["markdown"].append(str(canonical_markdown_path))
                    summary["notes"].append(
                        f"{item}: skipped document auto-conversion because {canonical_markdown_path.name} already exists"
                    )
                    continue
                markdown_path = canonical_markdown_path
                try:
                    self._import_doc(archived_path, markdown_path)
                    summary["markdown"].append(str(markdown_path))
                except Exception as exc:  # pragma: no cover - summary path
                    summary["skipped"].append(f"{item}: document conversion failed ({exc})")
            elif suffix == ".txt":
                markdown_path = self._normalize_text_source(archived_path, sources_dir)
                summary["markdown"].append(str(markdown_path))
            else:
                summary["notes"].append(f"{item}: archived only, no automatic conversion")

        return summary

    def validate_project(self, project_path: str) -> tuple[bool, list[str], list[str]]:
        project_path_obj = Path(project_path)
        is_valid, errors, warnings = validate_project_structure(str(project_path_obj))

        if project_path_obj.exists() and project_path_obj.is_dir():
            info = get_project_info_common(str(project_path_obj))
            if info.get("svg_files"):
                svg_files = [project_path_obj / "svg_output" / name for name in info["svg_files"]]
                expected_format = info.get("format")
                if expected_format == "unknown":
                    expected_format = None
                warnings.extend(validate_svg_viewbox(svg_files, expected_format))

        return is_valid, errors, warnings

    def get_project_info(self, project_path: str) -> dict[str, object]:
        shared = get_project_info_common(project_path)
        return {
            "name": shared.get("name", Path(project_path).name),
            "path": shared.get("path", str(project_path)),
            "exists": shared.get("exists", False),
            "svg_count": shared.get("svg_count", 0),
            "has_spec": shared.get("has_spec", False),
            "has_source": shared.get("has_source", False),
            "source_count": shared.get("source_count", 0),
            "canvas_format": shared.get("format_name", "Unknown"),
            "create_date": shared.get("date_formatted", "Unknown"),
        }


def print_usage() -> None:
    """Print CLI usage information from the module docstring."""
    print(__doc__)


def parse_init_args(argv: list[str]) -> tuple[str, str, str]:
    """Parse arguments for the `init` subcommand."""
    if len(argv) < 3:
        raise ValueError("Project name is required")

    project_name = argv[2]
    canvas_format = "ppt169"
    base_dir = "projects"

    i = 3
    while i < len(argv):
        if argv[i] == "--format" and i + 1 < len(argv):
            canvas_format = argv[i + 1]
            i += 2
        elif argv[i] == "--dir" and i + 1 < len(argv):
            base_dir = argv[i + 1]
            i += 2
        else:
            i += 1

    return project_name, canvas_format, base_dir


def parse_import_args(argv: list[str]) -> tuple[str, list[str], bool, bool]:
    """Parse arguments for the `import-sources` subcommand."""
    if len(argv) < 4:
        raise ValueError("Project path and at least one source are required")

    project_path = argv[2]
    move = False
    copy = False
    sources: list[str] = []

    for arg in argv[3:]:
        if arg == "--move":
            move = True
        elif arg == "--copy":
            copy = True
        else:
            sources.append(arg)

    if move and copy:
        raise ValueError("--move and --copy are mutually exclusive")

    return project_path, sources, move, copy


def main() -> None:
    """Run the CLI entry point."""
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)

    command = sys.argv[1]
    if command in {"-h", "--help", "help"}:
        print_usage()
        sys.exit(0)

    manager = ProjectManager()

    try:
        if command == "init":
            project_name, canvas_format, base_dir = parse_init_args(sys.argv)
            project_path = manager.init_project(project_name, canvas_format, base_dir=base_dir)
            print(f"[OK] Project initialized: {project_path}")
            print("Next:")
            print("1. Put source files into sources/ (or use import-sources)")
            print("2. Save your design spec to the project root")
            print("3. Generate SVG files into svg_output/")
            return

        if command == "import-sources":
            project_path, sources, move, copy = parse_import_args(sys.argv)
            summary = manager.import_sources(project_path, sources, move=move, copy=copy)
            print(f"[OK] Imported sources into: {project_path}")
            if summary["archived"]:
                print("\nArchived originals / URL records:")
                for item in summary["archived"]:
                    print(f"  - {item}")
            if summary["markdown"]:
                print("\nNormalized markdown:")
                for item in summary["markdown"]:
                    print(f"  - {item}")
            if summary["assets"]:
                print("\nImported asset directories:")
                for item in summary["assets"]:
                    print(f"  - {item}")
            if summary["notes"]:
                print("\nNotes:")
                for item in summary["notes"]:
                    print(f"  - {item}")
            if summary["skipped"]:
                print("\nSkipped:")
                for item in summary["skipped"]:
                    print(f"  - {item}")
            return

        if command == "validate":
            if len(sys.argv) < 3:
                raise ValueError("Project path is required")

            project_path = sys.argv[2]
            is_valid, errors, warnings = manager.validate_project(project_path)

            print(f"\nProject validation: {project_path}")
            print("=" * 60)

            if errors:
                print("\n[ERROR]")
                for error in errors:
                    print(f"  - {error}")

            if warnings:
                print("\n[WARN]")
                for warning in warnings:
                    print(f"  - {warning}")

            if is_valid and not warnings:
                print("\n[OK] Project structure is complete.")
            elif is_valid:
                print("\n[OK] Project structure is valid, with warnings.")
            else:
                print("\n[ERROR] Project structure is invalid.")
                sys.exit(1)
            return

        if command == "info":
            if len(sys.argv) < 3:
                raise ValueError("Project path is required")

            project_path = sys.argv[2]
            info = manager.get_project_info(project_path)

            print(f"\nProject info: {info['name']}")
            print("=" * 60)
            print(f"Path: {info['path']}")
            print(f"Exists: {'Yes' if info['exists'] else 'No'}")
            print(f"SVG files: {info['svg_count']}")
            print(f"Design spec: {'Yes' if info['has_spec'] else 'No'}")
            print(f"Source materials: {'Yes' if info['has_source'] else 'No'}")
            print(f"Source count: {info['source_count']}")
            print(f"Canvas format: {info['canvas_format']}")
            print(f"Created: {info['create_date']}")
            return

        raise ValueError(f"Unknown command: {command}")
    except Exception as exc:
        print(f"[ERROR] {exc}")
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    main()
