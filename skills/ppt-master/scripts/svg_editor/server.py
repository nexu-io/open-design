#!/usr/bin/env python3
"""
PPT Master - SVG Editor Server

Flask backend for the SVG annotation editor.
Serves the web UI and provides API endpoints for reading/writing SVG annotations.

Usage:
    python3 scripts/svg_editor/server.py <project_dir>

Examples:
    python3 scripts/svg_editor/server.py projects/my-project
    python3 scripts/svg_editor/server.py projects/my-project --port 8080

Dependencies:
    flask>=3.0.0
"""

import argparse
import os
import re
import sys
import threading
import time
import webbrowser
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

from flask import Flask, jsonify, request, send_from_directory

# Local — sys.path injection for sibling module (code-style.md §3)
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

_FINALIZE_DIR = _SCRIPTS_DIR.parent / 'svg_finalize'
if str(_FINALIZE_DIR) not in sys.path:
    sys.path.insert(0, str(_FINALIZE_DIR))

from annotations import (  # noqa: E402
    assign_temp_ids,
    parse_annotations,
    set_annotation,
    remove_annotation,
)
from embed_icons import (  # noqa: E402
    parse_use_element,
    resolve_icon_path,
    extract_paths_from_icon,
    generate_icon_group,
)

_ICONS_DIR = _SCRIPTS_DIR.parent.parent / 'templates' / 'icons'
_USE_ICON_PATTERN = re.compile(r'<use\s+[^>]*data-icon="[^"]*"[^>]*/>')


def _inline_icons(content: str) -> str:
    """Replace <use data-icon="..."/> with rendered <g> for browser preview.

    Preserves the original <use>'s id on the produced <g> so editor element
    targeting (and AI-side annotation lookups against svg_output) stays consistent.
    """
    matches = list(_USE_ICON_PATTERN.finditer(content))
    if not matches:
        return content
    new_content = content
    for match in reversed(matches):
        use_str = match.group(0)
        try:
            attrs = parse_use_element(use_str)
            icon_name = attrs.get('icon')
            if not icon_name:
                continue
            icon_path, _ = resolve_icon_path(str(icon_name), _ICONS_DIR)
            color = str(attrs.get('fill', '#000000'))
            elements, style, base_size = extract_paths_from_icon(icon_path, color)
        except Exception:
            continue
        if not elements:
            continue
        replacement = generate_icon_group(attrs, elements, style, base_size)
        id_match = re.search(r'\bid="([^"]+)"', use_str)
        if id_match:
            replacement = replacement.replace(
                '<g ', f'<g id="{id_match.group(1)}" data-icon="{icon_name}" ', 1,
            )
        new_content = new_content[:match.start()] + replacement + new_content[match.end():]
    return new_content


def create_app(project_dir: str, idle_timeout: int = 900) -> Flask:
    """Create and configure the Flask app for a given project directory."""
    project_path = Path(project_dir).resolve()
    svg_dir = project_path / 'svg_output'
    images_dir = project_path / 'images'

    app = Flask(__name__, static_folder='static', static_url_path='/static')
    app.config['PROJECT_PATH'] = project_path
    app.config['SVG_DIR'] = svg_dir

    # In-memory annotation store: {filename: {element_id: annotation_text}}
    app.config['ANNOTATIONS'] = {}

    # Idle timeout: auto-shutdown if no one connects within idle_timeout seconds
    app.config['LAST_REQUEST_TIME'] = time.time()

    @app.before_request
    def _update_activity():
        app.config['LAST_REQUEST_TIME'] = time.time()

    def _idle_watchdog():
        while True:
            time.sleep(10)
            elapsed = time.time() - app.config['LAST_REQUEST_TIME']
            if elapsed > idle_timeout:
                print(f"SVG Editor idle for {idle_timeout}s, shutting down.")
                # os._exit: Flask dev server has no clean shutdown mechanism;
                # data is safe because idle timeout only fires when no requests are in flight.
                os._exit(0)

    watchdog = threading.Thread(target=_idle_watchdog, daemon=True)
    watchdog.start()

    @app.route('/api/shutdown', methods=['POST'])
    def shutdown():
        def _stop():
            time.sleep(0.5)  # Let HTTP response flush before killing the process
            print("SVG Editor shutting down (user saved annotations).")
            # os._exit: save-all already wrote to disk; 0.5s delay ensures response is sent.
            os._exit(0)
        threading.Thread(target=_stop, daemon=True).start()
        return jsonify({'status': 'ok'})

    @app.route('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    @app.route('/images/<path:filename>')
    def serve_image(filename: str):
        """Serve images referenced by SVGs as `../images/*.png`.

        Resolution against an absolute images_dir + relative_to() check is the
        authoritative path-traversal guard.
        """
        if not images_dir.exists():
            return jsonify({'error': 'images directory not found'}), 404
        target = (images_dir / filename).resolve()
        try:
            target.relative_to(images_dir.resolve())
        except ValueError:
            return jsonify({'error': 'invalid path'}), 400
        if not target.exists() or not target.is_file():
            return jsonify({'error': 'not found'}), 404
        return send_from_directory(str(images_dir), filename)

    @app.route('/api/slides')
    def get_slides():
        svg_dir = app.config['SVG_DIR']
        if not svg_dir.exists():
            return jsonify({'slides': []})

        annotations = app.config['ANNOTATIONS']
        slides = []
        for svg_file in sorted(svg_dir.glob('*.svg')):
            has_disk_anns = False
            try:
                tree = ET.parse(str(svg_file))
                for elem in tree.getroot().iter():
                    if elem.get('data-edit-target') == 'true':
                        has_disk_anns = True
                        break
            except ET.ParseError:
                pass

            has_mem_anns = svg_file.name in annotations and len(annotations[svg_file.name]) > 0

            slides.append({
                'name': svg_file.name,
                'annotated': has_disk_anns or has_mem_anns,
                'annotation_count': len(annotations.get(svg_file.name, {})),
            })

        return jsonify({'slides': slides})

    def _safe_svg_path(name: str):
        """Validate slide name and return safe path. Returns None if invalid.

        The early string checks reject obvious bad inputs; the resolve()+startswith()
        check is the authoritative path traversal guard.
        """
        if '/' in name or '\\' in name or '..' in name:
            return None
        svg_file = (svg_dir / name).resolve()
        if not str(svg_file).startswith(str(svg_dir.resolve())):
            return None
        return svg_file

    @app.route('/api/slide/<name>')
    def get_slide(name: str):
        svg_file = _safe_svg_path(name)
        if svg_file is None:
            return jsonify({'error': 'Invalid slide name'}), 400
        if not svg_file.exists():
            return jsonify({'error': 'Slide not found'}), 404

        try:
            tree = ET.parse(str(svg_file))
            root = tree.getroot()
        except ET.ParseError as e:
            return jsonify({'error': f'Failed to parse SVG: {e}'}), 500

        assign_temp_ids(root)

        disk_annotations = parse_annotations(root)

        mem_annotations = app.config['ANNOTATIONS'].get(name, {})
        merged = {}
        for ann in disk_annotations:
            merged[ann['element_id']] = ann['annotation']
        merged.update(mem_annotations)

        annotations_list = []
        for elem in root.iter():
            eid = elem.get('id')
            if eid and eid in merged:
                tag = elem.tag
                if '}' in tag:
                    tag = tag.split('}', 1)[1]
                annotations_list.append({
                    'element_id': eid,
                    'tag': tag,
                    'annotation': merged[eid],
                })

        content = ET.tostring(root, encoding='unicode', xml_declaration=False)
        # Inline <use data-icon> placeholders so the browser can render icons.
        content = _inline_icons(content)

        return jsonify({
            'name': name,
            'content': content,
            'annotations': annotations_list,
        })

    @app.route('/api/slide/<name>/annotate', methods=['POST'])
    def post_annotate(name: str):
        data = request.get_json()
        if not data or 'element_id' not in data or 'annotation' not in data:
            return jsonify({'error': 'Missing element_id or annotation'}), 400

        element_id = data['element_id']
        annotation = data['annotation']

        if not isinstance(element_id, str) or not isinstance(annotation, str):
            return jsonify({'error': 'element_id and annotation must be strings'}), 400

        if len(element_id) > 200:
            return jsonify({'error': 'element_id too long (max 200 chars)'}), 400

        if len(annotation) > 10000:
            return jsonify({'error': 'Annotation too long (max 10000 chars)'}), 400

        if name not in app.config['ANNOTATIONS']:
            app.config['ANNOTATIONS'][name] = {}

        app.config['ANNOTATIONS'][name][element_id] = annotation

        return jsonify({
            'status': 'ok',
            'annotations_count': len(app.config['ANNOTATIONS'][name]),
        })

    @app.route('/api/slide/<name>/annotate/<element_id>', methods=['DELETE'])
    def delete_annotate(name: str, element_id: str):
        annotations = app.config['ANNOTATIONS']
        if name in annotations and element_id in annotations[name]:
            del annotations[name][element_id]

        return jsonify({
            'status': 'ok',
            'annotations_count': len(annotations.get(name, {})),
        })

    @app.route('/api/save-all', methods=['POST'])
    def save_all():
        annotations = app.config['ANNOTATIONS']
        svg_dir = app.config['SVG_DIR']
        modified = []

        for filename, anns in annotations.items():
            if not anns:
                continue

            svg_file = _safe_svg_path(filename)
            if svg_file is None or not svg_file.exists():
                continue

            try:
                tree = ET.parse(str(svg_file))
                root = tree.getroot()
            except ET.ParseError:
                continue

            assign_temp_ids(root)

            # Clear all existing annotations from the file before writing current state
            for elem in root.iter():
                elem.attrib.pop('data-edit-target', None)
                elem.attrib.pop('data-edit-annotation', None)

            for element_id, annotation_text in anns.items():
                set_annotation(root, element_id, annotation_text)

            # Strip transient _edit_N ids from elements that are NOT user-annotated.
            # Only annotated elements need to keep their id so the AI can locate them
            # via check_annotations.py; the rest are pollution.
            annotated_ids = set(anns.keys())
            for elem in root.iter():
                eid = elem.get('id', '')
                if eid.startswith('_edit_') and eid not in annotated_ids:
                    elem.attrib.pop('id', None)

            tree.write(str(svg_file), encoding='UTF-8', xml_declaration=True)
            modified.append(filename)

        app.config['ANNOTATIONS'] = {}

        return jsonify({'status': 'ok', 'files_modified': modified})

    return app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='PPT Master SVG Editor',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('project_dir', help='Path to project directory (contains svg_output/)')
    parser.add_argument('--port', type=int, default=5050, help='Port to listen on (default: 5050)')
    parser.add_argument('--no-browser', action='store_true', help='Do not auto-open browser')
    parser.add_argument('--timeout', type=int, default=900, help='Idle timeout in seconds (default: 900 = 15min)')
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    project_path = Path(args.project_dir).resolve()
    if not (project_path / 'svg_output').exists():
        print(f"Error: {project_path / 'svg_output'} does not exist", file=sys.stderr)
        return 1

    app = create_app(str(project_path), idle_timeout=args.timeout)

    url = f'http://localhost:{args.port}'
    if not args.no_browser:
        webbrowser.open(url)

    print(f"SVG Editor running at {url}")
    print(f"Project: {project_path}")
    app.run(host='127.0.0.1', port=args.port, debug=False)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
