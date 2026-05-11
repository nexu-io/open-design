#!/usr/bin/env python3
"""
PPT Master - Batch Project Validation Tool

Checks the structural integrity and compliance of multiple projects at once.

Usage:
    python3 scripts/batch_validate.py examples
    python3 scripts/batch_validate.py projects
    python3 scripts/batch_validate.py --all
    python3 scripts/batch_validate.py examples projects
"""

import sys
from collections import defaultdict
from pathlib import Path

try:
    from project_utils import (
        find_all_projects,
        get_project_info,
        validate_project_structure,
        validate_svg_viewbox,
        CANVAS_FORMATS
    )
except ImportError:
    print("Error: Unable to import project_utils module")
    print("Please ensure project_utils.py is in the same directory")
    sys.exit(1)


class BatchValidator:
    """Batch validator"""

    def __init__(self):
        self.results: list[dict[str, object]] = []
        self.summary = {
            'total': 0,
            'valid': 0,
            'has_errors': 0,
            'has_warnings': 0,
            'missing_readme': 0,
            'missing_spec': 0,
            'svg_issues': 0
        }

    def validate_directory(self, directory: str, recursive: bool = False) -> list[dict[str, object]]:
        """
        Validate all projects in a directory

        Args:
            directory: Directory path
            recursive: Whether to recursively search subdirectories

        Returns:
            List of validation results
        """
        dir_path = Path(directory)
        if not dir_path.exists():
            print(f"[ERROR] Directory does not exist: {directory}")
            return []

        print(f"\n[SCAN] Scanning directory: {directory}")
        print("=" * 80)

        projects = find_all_projects(directory)

        if not projects:
            print(f"[WARN] No projects found")
            return []

        print(f"Found {len(projects)} project(s)\n")

        for project_path in projects:
            self.validate_project(str(project_path))

        return self.results

    def validate_project(self, project_path: str) -> dict[str, object]:
        """
        Validate a single project

        Args:
            project_path: Project path

        Returns:
            Validation result dictionary
        """
        self.summary['total'] += 1

        # Get project info
        info = get_project_info(project_path)

        # Validate project structure
        is_valid, errors, warnings = validate_project_structure(project_path)

        # Validate SVG viewBox
        svg_warnings = []
        if info['svg_files']:
            project_path_obj = Path(project_path)
            svg_files = [project_path_obj / 'svg_output' /
                         f for f in info['svg_files']]
            svg_warnings = validate_svg_viewbox(svg_files, info['format'])

        # Aggregate results
        result = {
            'path': project_path,
            'name': info['name'],
            'format': info['format_name'],
            'date': info['date_formatted'],
            'svg_count': info['svg_count'],
            'is_valid': is_valid,
            'errors': errors,
            'warnings': warnings + svg_warnings,
            'has_readme': info['has_readme'],
            'has_spec': info['has_spec']
        }

        self.results.append(result)

        # Update statistics
        if is_valid and not warnings and not svg_warnings:
            self.summary['valid'] += 1
            status = "[OK]"
        elif errors:
            self.summary['has_errors'] += 1
            status = "[ERROR]"
        else:
            self.summary['has_warnings'] += 1
            status = "[WARN]"

        if not info['has_readme']:
            self.summary['missing_readme'] += 1
        if not info['has_spec']:
            self.summary['missing_spec'] += 1
        if svg_warnings:
            self.summary['svg_issues'] += 1

        # Print result
        print(f"{status} {info['name']}")
        print(f"   Path: {project_path}")
        print(
            f"   Format: {info['format_name']} | SVG: {info['svg_count']} file(s) | Date: {info['date_formatted']}")

        if errors:
            print(f"   [ERROR] Errors ({len(errors)}):")
            for error in errors:
                print(f"      - {error}")

        if warnings or svg_warnings:
            all_warnings = warnings + svg_warnings
            print(f"   [WARN] Warnings ({len(all_warnings)}):")
            for warning in all_warnings[:3]:  # Only show first 3 warnings
                print(f"      - {warning}")
            if len(all_warnings) > 3:
                print(f"      ... and {len(all_warnings) - 3} more warning(s)")

        print()

        return result

    def print_summary(self) -> None:
        """Print a summary of validation results."""
        print("\n" + "=" * 80)
        print("[Summary] Validation Summary")
        print("=" * 80)

        print(f"\nTotal projects: {self.summary['total']}")
        print(
            f"  [OK] Fully valid: {self.summary['valid']} ({self._percentage(self.summary['valid'])}%)")
        print(
            f"  [WARN] With warnings: {self.summary['has_warnings']} ({self._percentage(self.summary['has_warnings'])}%)")
        print(
            f"  [ERROR] With errors: {self.summary['has_errors']} ({self._percentage(self.summary['has_errors'])}%)")

        print(f"\nCommon issues:")
        print(f"  Missing README.md: {self.summary['missing_readme']} project(s)")
        print(f"  Missing design spec: {self.summary['missing_spec']} project(s)")
        print(f"  SVG format issues: {self.summary['svg_issues']} project(s)")

        # Group statistics by format
        format_stats = defaultdict(int)
        for result in self.results:
            format_stats[result['format']] += 1

        if format_stats:
            print(f"\nCanvas format distribution:")
            for fmt, count in sorted(format_stats.items(), key=lambda x: x[1], reverse=True):
                print(f"  {fmt}: {count} project(s)")

        # Provide fix suggestions
        if self.summary['has_errors'] > 0 or self.summary['has_warnings'] > 0:
            print(f"\n[TIP] Fix suggestions:")

            if self.summary['missing_readme'] > 0:
                print(f"  1. Create documentation for projects missing README")
                print(
                    f"     Reference: examples/google_annual_report_ppt169_20251116/README.md")

            if self.summary['svg_issues'] > 0:
                print(f"  2. Check and fix SVG viewBox settings")
                print(f"     Ensure consistency with canvas format")

            if self.summary['missing_spec'] > 0:
                print(f"  3. Add design specification files")

    def _percentage(self, count: int) -> int:
        """Calculate percentage"""
        if self.summary['total'] == 0:
            return 0
        return int(count / self.summary['total'] * 100)

    def export_report(self, output_file: str = 'validation_report.txt') -> None:
        """
        Export validation report to file

        Args:
            output_file: Output file path
        """
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("PPT Master Project Validation Report\n")
            f.write("=" * 80 + "\n\n")

            for result in self.results:
                status = "[OK] Valid" if result['is_valid'] and not result['warnings'] else \
                    "[ERROR] Error" if result['errors'] else "[WARN] Warning"

                f.write(f"{status} - {result['name']}\n")
                f.write(f"Path: {result['path']}\n")
                f.write(
                    f"Format: {result['format']} | SVG: {result['svg_count']} file(s)\n")

                if result['errors']:
                    f.write(f"\nErrors:\n")
                    for error in result['errors']:
                        f.write(f"  - {error}\n")

                if result['warnings']:
                    f.write(f"\nWarnings:\n")
                    for warning in result['warnings']:
                        f.write(f"  - {warning}\n")

                f.write("\n" + "-" * 80 + "\n\n")

            # Write summary
            f.write("\n" + "=" * 80 + "\n")
            f.write("Validation Summary\n")
            f.write("=" * 80 + "\n\n")
            f.write(f"Total projects: {self.summary['total']}\n")
            f.write(f"Fully valid: {self.summary['valid']}\n")
            f.write(f"With warnings: {self.summary['has_warnings']}\n")
            f.write(f"With errors: {self.summary['has_errors']}\n")

        print(f"\n[REPORT] Validation report exported: {output_file}")


def print_usage() -> None:
    """Print CLI usage information."""
    print("PPT Master - Batch Project Validation Tool\n")
    print("Usage:")
    print("  python3 scripts/batch_validate.py <directory>")
    print("  python3 scripts/batch_validate.py <dir1> <dir2> ...")
    print("  python3 scripts/batch_validate.py --all")
    print("\nExamples:")
    print("  python3 scripts/batch_validate.py examples")
    print("  python3 scripts/batch_validate.py projects")
    print("  python3 scripts/batch_validate.py examples projects")
    print("  python3 scripts/batch_validate.py --all")


def main() -> None:
    """Run the CLI entry point."""
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(0)

    if sys.argv[1] in {"-h", "--help", "help"}:
        print_usage()
        sys.exit(0)

    validator = BatchValidator()

    # Process arguments
    if '--all' in sys.argv:
        directories = ['examples', 'projects']
    else:
        directories = [arg for arg in sys.argv[1:] if not arg.startswith('--')]

    # Validate each directory
    for directory in directories:
        if Path(directory).exists():
            validator.validate_directory(directory)
        else:
            print(f"[WARN] Skipping non-existent directory: {directory}\n")

    # Print summary
    validator.print_summary()

    # Export report (if specified)
    if '--export' in sys.argv:
        output_file = 'validation_report.txt'
        if '--output' in sys.argv:
            idx = sys.argv.index('--output')
            if idx + 1 < len(sys.argv):
                output_file = sys.argv[idx + 1]
        validator.export_report(output_file)

    # Return exit code
    if validator.summary['has_errors'] > 0:
        sys.exit(1)
    elif validator.summary['has_warnings'] > 0:
        sys.exit(2)
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()
