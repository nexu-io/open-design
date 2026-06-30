#!/usr/bin/env python3
"""
Style-driven SVG diagram generator.

Usage:
  python3 generate-from-template.py <template-type> <output-path> [data-json]

This generator intentionally does more than "fill a template".
It encodes the visual language from the documented style guides so the output
tracks the showcase quality more closely than the previous generic renderer.
"""

from __future__ import annotations

import copy
import json
import math
import os
import re
import sys
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from xml.sax.saxutils import escape

Point = Tuple[float, float]
Bounds = Tuple[float, float, float, float]

SCRIPT_DIR = os.path.dirname(__file__)
TEMPLATE_DIR = os.path.join(SCRIPT_DIR, "..", "templates")
DEFAULT_VIEWBOX = {
    "architecture": (960, 600),
    "data-flow": (960, 600),
    "flowchart": (960, 640),
    "sequence": (960, 700),
    "comparison": (960, 620),
    "timeline": (960, 520),
    "mind-map": (960, 620),
    "agent": (960, 700),
    "memory": (960, 720),
    "use-case": (960, 600),
    "class": (960, 700),
    "state-machine": (960, 620),
    "er-diagram": (960, 680),
    "network-topology": (960, 620),
}

FLOW_ALIASES = {
    "main": "control",
    "api": "control",
    "control": "control",
    "write": "write",
    "read": "read",
    "data": "data",
    "async": "async",
    "feedback": "feedback",
    "neutral": "neutral",
}

MARKER_IDS = {
    "control": "arrowA",
    "write": "arrowB",
    "read": "arrowC",
    "data": "arrowE",
    "async": "arrowF",
    "feedback": "arrowG",
    "neutral": "arrowH",
}

STYLE_PROFILES: Dict[int, Dict[str, object]] = {
    1: {
        "name": "Flat Icon",
        "font_family": "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif",
        "background": "#ffffff",
        "shadow": True,
        "title_align": "center",
        "title_fill": "#111827",
        "title_size": 30,
        "subtitle_fill": "#6b7280",
        "subtitle_size": 14,
        "node_fill": "#ffffff",
        "node_stroke": "#d1d5db",
        "node_radius": 10,
        "node_shadow": "url(#shadowSoft)",
        "section_fill": "none",
        "section_stroke": "#dbe5f1",
        "section_dash": "6 5",
        "section_label_fill": "#2563eb",
        "section_sub_fill": "#94a3b8",
        "title_divider": False,
        "section_upper": True,
        "arrow_width": 2.4,
        "arrow_colors": {
            "control": "#7c3aed",
            "write": "#10b981",
            "read": "#2563eb",
            "data": "#f97316",
            "async": "#7c3aed",
            "feedback": "#ef4444",
            "neutral": "#6b7280",
        },
        "arrow_label_bg": "#ffffff",
        "arrow_label_opacity": 0.94,
        "arrow_label_fill": "#6b7280",
        "type_label_fill": "#9ca3af",
        "type_label_size": 12,
        "text_primary": "#111827",
        "text_secondary": "#6b7280",
        "text_muted": "#94a3b8",
        "legend_fill": "#6b7280",
    },
    2: {
        "name": "Dark Terminal",
        "font_family": "'SF Mono', 'Fira Code', Menlo, 'Microsoft YaHei', 'SimHei', monospace",
        "background": "#0f172a",
        "shadow": False,
        "title_align": "center",
        "title_fill": "#e2e8f0",
        "title_size": 30,
        "subtitle_fill": "#94a3b8",
        "subtitle_size": 14,
        "node_fill": "#111827",
        "node_stroke": "#334155",
        "node_radius": 10,
        "node_shadow": "",
        "section_fill": "rgba(15,23,42,0.28)",
        "section_stroke": "#334155",
        "section_dash": "7 6",
        "section_label_fill": "#38bdf8",
        "section_sub_fill": "#64748b",
        "title_divider": False,
        "section_upper": True,
        "arrow_width": 2.3,
        "arrow_colors": {
            "control": "#a855f7",
            "write": "#22c55e",
            "read": "#38bdf8",
            "data": "#fb7185",
            "async": "#f59e0b",
            "feedback": "#f97316",
            "neutral": "#94a3b8",
        },
        "arrow_label_bg": "#0f172a",
        "arrow_label_opacity": 0.92,
        "arrow_label_fill": "#cbd5e1",
        "type_label_fill": "#64748b",
        "type_label_size": 12,
        "text_primary": "#e2e8f0",
        "text_secondary": "#94a3b8",
        "text_muted": "#64748b",
        "legend_fill": "#94a3b8",
    },
    3: {
        "name": "Blueprint",
        "font_family": "'SF Mono', 'Fira Code', Menlo, 'Microsoft YaHei', 'SimHei', monospace",
        "background": "#082f49",
        "shadow": False,
        "title_align": "center",
        "title_fill": "#e0f2fe",
        "title_size": 30,
        "subtitle_fill": "#7dd3fc",
        "subtitle_size": 14,
        "node_fill": "#0b3b5e",
        "node_stroke": "#67e8f9",
        "node_radius": 8,
        "node_shadow": "",
        "section_fill": "none",
        "section_stroke": "#0ea5e9",
        "section_dash": "6 4",
        "section_label_fill": "#67e8f9",
        "section_sub_fill": "#7dd3fc",
        "title_divider": False,
        "section_upper": True,
        "arrow_width": 2.1,
        "arrow_colors": {
            "control": "#67e8f9",
            "write": "#22d3ee",
            "read": "#38bdf8",
            "data": "#fde047",
            "async": "#c084fc",
            "feedback": "#fb7185",
            "neutral": "#bae6fd",
        },
        "arrow_label_bg": "#082f49",
        "arrow_label_opacity": 0.9,
        "arrow_label_fill": "#e0f2fe",
        "type_label_fill": "#7dd3fc",
        "type_label_size": 11,
        "text_primary": "#e0f2fe",
        "text_secondary": "#bae6fd",
        "text_muted": "#7dd3fc",
        "legend_fill": "#bae6fd",
    },
    4: {
        "name": "Notion Clean",
        "font_family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif",
        "background": "#ffffff",
        "shadow": False,
        "title_align": "left",
        "title_fill": "#111827",
        "title_size": 18,
        "subtitle_fill": "#9ca3af",
        "subtitle_size": 13,
        "node_fill": "#f9fafb",
        "node_stroke": "#e5e7eb",
        "node_radius": 4,
        "node_shadow": "",
        "section_fill": "none",
        "section_stroke": "#e5e7eb",
        "section_dash": "",
        "section_label_fill": "#9ca3af",
        "section_sub_fill": "#d1d5db",
        "title_divider": True,
        "section_upper": True,
        "arrow_width": 1.8,
        "arrow_colors": {
            "control": "#3b82f6",
            "write": "#3b82f6",
            "read": "#3b82f6",
            "data": "#3b82f6",
            "async": "#9ca3af",
            "feedback": "#9ca3af",
            "neutral": "#d1d5db",
        },
        "arrow_label_bg": "#ffffff",
        "arrow_label_opacity": 0.96,
        "arrow_label_fill": "#6b7280",
        "type_label_fill": "#9ca3af",
        "type_label_size": 11,
        "text_primary": "#111827",
        "text_secondary": "#374151",
        "text_muted": "#9ca3af",
        "legend_fill": "#6b7280",
    },
    5: {
        "name": "Glassmorphism",
        "font_family": "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif",
        "background": "#0f172a",
        "shadow": True,
        "title_align": "center",
        "title_fill": "#f8fafc",
        "title_size": 30,
        "subtitle_fill": "#cbd5e1",
        "subtitle_size": 14,
        "node_fill": "rgba(255,255,255,0.12)",
        "node_stroke": "rgba(255,255,255,0.28)",
        "node_radius": 18,
        "node_shadow": "url(#shadowGlass)",
        "section_fill": "rgba(255,255,255,0.05)",
        "section_stroke": "rgba(255,255,255,0.18)",
        "section_dash": "7 6",
        "section_label_fill": "#e2e8f0",
        "section_sub_fill": "#94a3b8",
        "title_divider": False,
        "section_upper": True,
        "arrow_width": 2.2,
        "arrow_colors": {
            "control": "#c084fc",
            "write": "#34d399",
            "read": "#60a5fa",
            "data": "#fb923c",
            "async": "#f472b6",
            "feedback": "#f59e0b",
            "neutral": "#cbd5e1",
        },
        "arrow_label_bg": "rgba(15,23,42,0.7)",
        "arrow_label_opacity": 1,
        "arrow_label_fill": "#e2e8f0",
        "type_label_fill": "#cbd5e1",
        "type_label_size": 12,
        "text_primary": "#f8fafc",
        "text_secondary": "#cbd5e1",
        "text_muted": "#94a3b8",
        "legend_fill": "#cbd5e1",
    },
    6: {
        "name": "Claude Official",
        "font_family": "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif",
        "background": "#f8f6f3",
        "shadow": False,
        "title_align": "left",
        "title_fill": "#141413",
        "title_size": 24,
        "subtitle_fill": "#8f8a80",
        "subtitle_size": 13,
        "node_fill": "#fffcf7",
        "node_stroke": "#d9d0c3",
        "node_radius": 10,
        "node_shadow": "",
        "section_fill": "none",
        "section_stroke": "#ded8cf",
        "section_dash": "5 4",
        "section_label_fill": "#8b7355",
        "section_sub_fill": "#b4aba0",
        "title_divider": True,
        "section_upper": True,
        "arrow_width": 2.0,
        "arrow_colors": {
            "control": "#d97757",
            "write": "#7b8b5c",
            "read": "#8c6f5a",
            "data": "#b45309",
            "async": "#9a6fb0",
            "feedback": "#d97757",
            "neutral": "#8f8a80",
        },
        "arrow_label_bg": "#f8f6f3",
        "arrow_label_opacity": 0.96,
        "arrow_label_fill": "#6b6257",
        "type_label_fill": "#a29a8f",
        "type_label_size": 11,
        "text_primary": "#141413",
        "text_secondary": "#6b6257",
        "text_muted": "#a29a8f",
        "legend_fill": "#6b6257",
    },
    7: {
        "name": "OpenAI",
        "font_family": "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif",
        "background": "#ffffff",
        "shadow": False,
        "title_align": "left",
        "title_fill": "#0f172a",
        "title_size": 24,
        "subtitle_fill": "#64748b",
        "subtitle_size": 13,
        "node_fill": "#ffffff",
        "node_stroke": "#dce5e3",
        "node_radius": 14,
        "node_shadow": "",
        "section_fill": "none",
        "section_stroke": "#e2e8f0",
        "section_dash": "5 4",
        "section_label_fill": "#10a37f",
        "section_sub_fill": "#94a3b8",
        "title_divider": True,
        "section_upper": True,
        "arrow_width": 2.0,
        "arrow_colors": {
            "control": "#10a37f",
            "write": "#0f766e",
            "read": "#0891b2",
            "data": "#f59e0b",
            "async": "#64748b",
            "feedback": "#10a37f",
            "neutral": "#94a3b8",
        },
        "arrow_label_bg": "#ffffff",
        "arrow_label_opacity": 0.96,
        "arrow_label_fill": "#475569",
        "type_label_fill": "#94a3b8",
        "type_label_size": 11,
        "text_primary": "#0f172a",
        "text_secondary": "#475569",
        "text_muted": "#94a3b8",
        "legend_fill": "#475569",
    },
}


@dataclass
class Node:
    node_id: str
    kind: str
    shape: str
    data: Dict[str, object]
    bounds: Bounds
    cx: float
    cy: float


def style_value(style: Dict[str, object], key: str) -> object:
    return style[key]


def to_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_text(value: object) -> str:
    return escape(str(value)) if value is not None else ""


# Style 8 is AI-authored: the AI reads references/style-8-dark-luxury.md and hand-crafts
# the SVG directly. It cannot be driven by this template generator.
_AI_AUTHORED_STYLES: Dict[int, str] = {8: "Style 8 (Dark Luxury)"}
_AI_AUTHORED_ALIASES: set = {"dark luxury", "dark-luxury"}
_AI_AUTHORED_MSG = (
    "{name} is an AI-authored style and cannot be used with generate-from-template.py. "
    "Load references/style-8-dark-luxury.md for the full spec and hand-craft the SVG directly."
)


def parse_style(raw: object) -> Tuple[int, Dict[str, object]]:
    if raw is None:
        index = 1
    elif isinstance(raw, int):
        index = raw
    else:
        text = str(raw).strip().lower()
        if text.isdigit():
            index = int(text)
        else:
            if text in _AI_AUTHORED_ALIASES:
                raise ValueError(_AI_AUTHORED_MSG.format(name=_AI_AUTHORED_STYLES[8]))
            names = {profile["name"].lower(): key for key, profile in STYLE_PROFILES.items()}
            index = names.get(text, 1)
    if index in _AI_AUTHORED_STYLES:
        raise ValueError(_AI_AUTHORED_MSG.format(name=_AI_AUTHORED_STYLES[index]))
    if index not in STYLE_PROFILES:
        raise ValueError(f"Unsupported style: {raw}")
    return index, copy.deepcopy(STYLE_PROFILES[index])


def parse_template_viewbox(template_type: str) -> Tuple[float, float]:
    template_path = os.path.join(TEMPLATE_DIR, f"{template_type}.svg")
    if os.path.exists(template_path):
        content = open(template_path, "r", encoding="utf-8").read()
        match = re.search(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"', content)
        if match:
            return float(match.group(1)), float(match.group(2))
    return DEFAULT_VIEWBOX.get(template_type, (960, 600))


def render_defs(style_index: int, style: Dict[str, object]) -> str:
    marker_size = "8" if style_index == 4 else "10"
    marker_height = "6" if style_index == 4 else "7"
    ref_x = "7" if style_index == 4 else "9"
    ref_y = "3" if style_index == 4 else "3.5"
    color_map = style_value(style, "arrow_colors")
    marker_lines = []
    for key, color in color_map.items():
        marker_id = MARKER_IDS.get(key, "arrowA")
        marker_lines.append(
            f'    <marker id="{marker_id}" markerWidth="{marker_size}" markerHeight="{marker_height}" '
            f'refX="{ref_x}" refY="{ref_y}" orient="auto">'
        )
        if style_index == 4:
            marker_lines.append(f'      <polygon points="0 0, 8 3, 0 6" fill="{color}"/>')
        else:
            marker_lines.append(f'      <polygon points="0 0, 10 3.5, 0 7" fill="{color}"/>')
        marker_lines.append("    </marker>")

    filters = []
    if style_value(style, "shadow"):
        filters.extend(
            [
                '    <filter id="shadowSoft" x="-20%" y="-20%" width="140%" height="160%">',
                '      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.12"/>',
                "    </filter>",
                '    <filter id="shadowGlass" x="-20%" y="-20%" width="140%" height="160%">',
                '      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#020617" flood-opacity="0.28"/>',
                "    </filter>",
            ]
        )

    if style_index == 3:
        filters.extend(
            [
                '    <pattern id="blueprintGrid" width="32" height="32" patternUnits="userSpaceOnUse">',
                '      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#0ea5e9" stroke-opacity="0.12" stroke-width="1"/>',
                "    </pattern>",
            ]
        )
    if style_index == 2:
        filters.extend(
            [
                '    <linearGradient id="terminalGradient" x1="0%" y1="0%" x2="100%" y2="100%">',
                '      <stop offset="0%" stop-color="#0f0f1a"/>',
                '      <stop offset="100%" stop-color="#1a1a2e"/>',
                "    </linearGradient>",
                '    <filter id="glowBlue" x="-30%" y="-30%" width="160%" height="160%">',
                '      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#3b82f6" flood-opacity="0.65"/>',
                "    </filter>",
                '    <filter id="glowPurple" x="-30%" y="-30%" width="160%" height="160%">',
                '      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#a855f7" flood-opacity="0.72"/>',
                "    </filter>",
                '    <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">',
                '      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#22c55e" flood-opacity="0.62"/>',
                "    </filter>",
                '    <filter id="glowOrange" x="-30%" y="-30%" width="160%" height="160%">',
                '      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#f97316" flood-opacity="0.62"/>',
                "    </filter>",
            ]
        )

    styles = [
        f"    text {{ font-family: {style_value(style, 'font_family')}; }}",
        f"    .title {{ font-size: {style_value(style, 'title_size')}px; font-weight: 700; fill: {style_value(style, 'title_fill')}; }}",
        f"    .subtitle {{ font-size: {style_value(style, 'subtitle_size')}px; font-weight: 500; fill: {style_value(style, 'subtitle_fill')}; }}",
        f"    .section {{ font-size: 13px; font-weight: 700; fill: {style_value(style, 'section_label_fill')}; letter-spacing: 1.4px; }}",
        f"    .section-sub {{ font-size: 12px; font-weight: 500; fill: {style_value(style, 'section_sub_fill')}; }}",
        f"    .node-title {{ font-size: 18px; font-weight: 700; fill: {style_value(style, 'text_primary')}; }}",
        f"    .node-sub {{ font-size: 12px; font-weight: 500; fill: {style_value(style, 'text_secondary')}; }}",
        f"    .node-type {{ font-size: {style_value(style, 'type_label_size')}px; font-weight: 700; fill: {style_value(style, 'type_label_fill')}; letter-spacing: 0.08em; }}",
        f"    .arrow-label {{ font-size: 12px; font-weight: 600; fill: {style_value(style, 'arrow_label_fill')}; }}",
        f"    .legend {{ font-size: 12px; font-weight: 500; fill: {style_value(style, 'legend_fill')}; }}",
        f"    .footnote {{ font-size: 12px; font-weight: 500; fill: {style_value(style, 'text_muted')}; }}",
    ]
    return "\n".join(
        ["  <defs>"] + marker_lines + filters + ["    <style>"] + styles + ["    </style>", "  </defs>"]
    )


def render_canvas(style_index: int, style: Dict[str, object], width: float, height: float) -> str:
    background = str(style_value(style, "background"))
    if style_index == 2:
        parts = [f'  <rect width="{width}" height="{height}" fill="url(#terminalGradient)"/>']
    else:
        parts = [f'  <rect width="{width}" height="{height}" fill="{background}"/>']

    return "\n".join(parts)


def title_position(style: Dict[str, object], width: float) -> Tuple[float, str]:
    if style_value(style, "title_align") == "left":
        return 48.0, "start"
    return width / 2.0, "middle"


def render_title_block(style: Dict[str, object], data: Dict[str, object], width: float) -> Tuple[str, float]:
    title = normalize_text(data.get("title", "Diagram"))
    subtitle = normalize_text(data.get("subtitle", ""))
    x, anchor = title_position(style, width)
    if anchor == "middle":
        parts = [f'  <text x="{x}" y="56" text-anchor="{anchor}" class="title">{title}</text>']
        cursor_y = 82
        if subtitle:
            parts.append(f'  <text x="{x}" y="{cursor_y}" text-anchor="{anchor}" class="subtitle">{subtitle}</text>')
            cursor_y += 24
        return "\n".join(parts), cursor_y + 10

    parts = [f'  <text x="{x}" y="48" text-anchor="{anchor}" class="title">{title}</text>']
    cursor_y = 72
    if subtitle:
        parts.append(f'  <text x="{x}" y="{cursor_y}" text-anchor="{anchor}" class="subtitle">{subtitle}</text>')
        cursor_y += 18
    if style_value(style, "title_divider"):
        parts.append(
            f'  <line x1="48" y1="{cursor_y + 10}" x2="{width - 48}" y2="{cursor_y + 10}" '
            f'stroke="{style_value(style, "section_stroke")}" stroke-width="1"/>'
        )
        cursor_y += 26
    return "\n".join(parts), cursor_y + 8


def render_window_controls(data: Dict[str, object], style_index: int, width: float) -> str:
    controls = data.get("window_controls")
    if not controls:
        return ""
    if controls is True:
        controls = ["#ef4444", "#f59e0b", "#10b981"]
    if style_index != 2:
        return ""
    cursor_x = 20.0
    lines = []
    for color in controls:
        lines.append(f'  <circle cx="{cursor_x}" cy="20" r="5.5" fill="{color}"/>')
        cursor_x += 18
    return "\n".join(lines)


def render_header_meta(data: Dict[str, object], style: Dict[str, object], width: float) -> str:
    meta_left = normalize_text(data.get("meta_left", ""))
    meta_center = normalize_text(data.get("meta_center", ""))
    meta_right = normalize_text(data.get("meta_right", ""))
    if not any([meta_left, meta_center, meta_right]):
        return ""
    fill = str(data.get("meta_fill", style_value(style, "text_muted")))
    size = to_float(data.get("meta_size", 11))
    lines = []
    if meta_left:
        lines.append(f'  <text x="28" y="24" font-size="{size}" font-weight="600" fill="{fill}">{meta_left}</text>')
    if meta_center:
        lines.append(f'  <text x="{width / 2}" y="24" text-anchor="middle" font-size="{size}" font-weight="600" fill="{fill}">{meta_center}</text>')
    if meta_right:
        lines.append(f'  <text x="{width - 28}" y="24" text-anchor="end" font-size="{size}" font-weight="600" fill="{fill}">{meta_right}</text>')
    return "\n".join(lines)


def render_blueprint_title_block(
    data: Dict[str, object],
    style: Dict[str, object],
    style_index: int,
    width: float,
    height: float,
) -> Tuple[str, Optional[Bounds]]:
    if style_index != 3:
        return "", None
    block = data.get("blueprint_title_block")
    if not block:
        return "", None
    block_width = to_float(block.get("width", 256))
    block_height = to_float(block.get("height", 92))
    x = to_float(block.get("x", width - block_width - 28))
    y = to_float(block.get("y", height - block_height - 18))
    title = normalize_text(block.get("title", data.get("title", "")))
    subtitle = normalize_text(block.get("subtitle", "SYSTEM ARCHITECTURE"))
    left_caption = normalize_text(block.get("left_caption", "REV: 1.0"))
    center_caption = normalize_text(block.get("center_caption", "AUTO-GENERATED"))
    right_caption = normalize_text(block.get("right_caption", "DWG: ARCH-001"))
    stroke = str(block.get("stroke", style_value(style, "section_stroke")))
    fill = str(block.get("fill", "#0b3552"))
    title_fill = str(block.get("title_fill", style_value(style, "text_primary")))
    sub_fill = str(block.get("subtitle_fill", style_value(style, "section_label_fill")))
    muted_fill = str(block.get("muted_fill", style_value(style, "text_muted")))
    lines = [
        f'  <rect x="{x}" y="{y}" width="{block_width}" height="{block_height}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>',
        f'  <line x1="{x}" y1="{y + 18}" x2="{x + block_width}" y2="{y + 18}" stroke="{stroke}" stroke-width="1"/>',
        f'  <line x1="{x}" y1="{y + 54}" x2="{x + block_width}" y2="{y + 54}" stroke="{stroke}" stroke-width="1"/>',
        f'  <text x="{x + block_width / 2}" y="{y + 13}" text-anchor="middle" font-size="10" font-weight="600" fill="{muted_fill}">{subtitle}</text>',
        f'  <text x="{x + block_width / 2}" y="{y + 42}" text-anchor="middle" font-size="18" font-weight="700" fill="{title_fill}">{title}</text>',
        f'  <text x="{x + 12}" y="{y + 75}" font-size="9.5" font-weight="600" fill="{muted_fill}">{left_caption}</text>',
        f'  <text x="{x + block_width / 2}" y="{y + 75}" text-anchor="middle" font-size="9.5" font-weight="600" fill="{sub_fill}">{center_caption}</text>',
        f'  <text x="{x + block_width - 12}" y="{y + 75}" text-anchor="end" font-size="9.5" font-weight="600" fill="{muted_fill}">{right_caption}</text>',
    ]
    return "\n".join(lines), rectangle_bounds(x - 6, y - 6, block_width + 12, block_height + 12)


def infer_shape(kind: str) -> str:
    mapping = {
        "rect": "rect",
        "double_rect": "rect",
        "cylinder": "rect",
        "document": "rect",
        "folder": "rect",
        "terminal": "rect",
        "hexagon": "rect",
        "circle_cluster": "cluster",
        "user_avatar": "rect",
        "bot": "rect",
        "speech": "rect",
        "icon_box": "rect",
    }
    return mapping.get(kind, "rect")


def node_bounds(data: Dict[str, object]) -> Bounds:
    kind = str(data.get("kind", data.get("shape", "rect")))
    x = to_float(data.get("x"))
    y = to_float(data.get("y"))
    if kind == "circle":
        r = to_float(data.get("r", 50))
        return (x - r, y - r, x + r, y + r)
    width = to_float(data.get("width", 180))
    height = to_float(data.get("height", 76))
    return (x, y, x + width, y + height)


def normalize_node(node_data: Dict[str, object], fallback_id: str) -> Node:
    kind = str(node_data.get("kind", node_data.get("shape", "rect")))
    bounds = node_bounds(node_data)
    left, top, right, bottom = bounds
    return Node(
        node_id=str(node_data.get("id", fallback_id)),
        kind=kind,
        shape=infer_shape(kind),
        data=node_data,
        bounds=bounds,
        cx=(left + right) / 2,
        cy=(top + bottom) / 2,
    )


def anchor_on_side(node: Node, side: str) -> Point:
    left, top, right, bottom = node.bounds
    cx, cy = node.cx, node.cy
    side = side.lower()
    if side == "left":
        return (left, cy)
    if side == "right":
        return (right, cy)
    if side == "top":
        return (cx, top)
    if side == "bottom":
        return (cx, bottom)
    if side == "top-left":
        return (left, top)
    if side == "top-right":
        return (right, top)
    if side == "bottom-left":
        return (left, bottom)
    if side == "bottom-right":
        return (right, bottom)
    return (cx, cy)


def anchor_point(node: Node, toward: Point, port: Optional[str] = None) -> Point:
    if port:
        return anchor_on_side(node, port)
    left, top, right, bottom = node.bounds
    dx = toward[0] - node.cx
    dy = toward[1] - node.cy
    width = right - left
    height = bottom - top
    if abs(dx) * height >= abs(dy) * width:
        return (right, node.cy) if dx >= 0 else (left, node.cy)
    return (node.cx, bottom) if dy >= 0 else (node.cx, top)


def expand_bounds(bounds: Bounds, padding: float) -> Bounds:
    left, top, right, bottom = bounds
    return (left - padding, top - padding, right + padding, bottom + padding)


def segment_hits_bounds(p1: Point, p2: Point, bounds: Bounds) -> bool:
    x1, y1 = p1
    x2, y2 = p2
    left, top, right, bottom = bounds
    eps = 1e-6

    if abs(y1 - y2) < eps:
        y = y1
        if not (top + eps < y < bottom - eps):
            return False
        seg_left = min(x1, x2)
        seg_right = max(x1, x2)
        overlap_left = max(seg_left, left)
        overlap_right = min(seg_right, right)
        if overlap_right - overlap_left <= eps:
            return False
        if abs(overlap_left - x1) < eps and abs(overlap_right - x1) < eps:
            return False
        if abs(overlap_left - x2) < eps and abs(overlap_right - x2) < eps:
            return False
        return True

    if abs(x1 - x2) < eps:
        x = x1
        if not (left + eps < x < right - eps):
            return False
        seg_top = min(y1, y2)
        seg_bottom = max(y1, y2)
        overlap_top = max(seg_top, top)
        overlap_bottom = min(seg_bottom, bottom)
        if overlap_bottom - overlap_top <= eps:
            return False
        if abs(overlap_top - y1) < eps and abs(overlap_bottom - y1) < eps:
            return False
        if abs(overlap_top - y2) < eps and abs(overlap_bottom - y2) < eps:
            return False
        return True

    return False


def segment_axis(p1: Point, p2: Point) -> str:
    if abs(p1[1] - p2[1]) < 1e-6:
        return "horizontal"
    if abs(p1[0] - p2[0]) < 1e-6:
        return "vertical"
    return "other"


def port_axis(port: Optional[str]) -> Optional[str]:
    if not port:
        return None
    port = port.lower()
    if port in {"left", "right"}:
        return "horizontal"
    if port in {"top", "bottom"}:
        return "vertical"
    return None


def offset_point(point: Point, port: Optional[str], distance: float) -> Point:
    if not port:
        return point
    x, y = point
    port = port.lower()
    if port == "left":
        return (x - distance, y)
    if port == "right":
        return (x + distance, y)
    if port == "top":
        return (x, y - distance)
    if port == "bottom":
        return (x, y + distance)
    return point


def route_length(points: Sequence[Point]) -> float:
    return sum(abs(x1 - x2) + abs(y1 - y2) for (x1, y1), (x2, y2) in zip(points, points[1:]))


def route_uses_lane(points: Sequence[Point], value: float, axis: str, tolerance: float = 1.0) -> bool:
    if axis == "x":
        return any(abs(x - value) <= tolerance for x, _ in points)
    return any(abs(y - value) <= tolerance for _, y in points)


def collision_count(points: Sequence[Point], obstacles: Sequence[Bounds]) -> int:
    """Count how many (segment, obstacle) pairs collide."""
    return sum(
        1
        for p1, p2 in zip(points, points[1:])
        for obs in obstacles
        if segment_hits_bounds(p1, p2, obs)
    )


def route_is_orthogonal(points: Sequence[Point]) -> bool:
    return all(segment_axis(p1, p2) != "other" for p1, p2 in zip(points, points[1:]))


def route_score(
    points: Sequence[Point],
    hint_x: Sequence[float],
    hint_y: Sequence[float],
    source_port: Optional[str],
    target_port: Optional[str],
) -> float:
    length = route_length(points)
    bends = max(0, len(points) - 2)
    score = length + bends * 22
    if len(points) >= 2 and source_port:
        first_axis = segment_axis(points[0], points[1])
        if first_axis != port_axis(source_port):
            score += 180
    if len(points) >= 2 and target_port:
        last_axis = segment_axis(points[-2], points[-1])
        if last_axis != port_axis(target_port):
            score += 180
    for lane in hint_x:
        score -= 28 if route_uses_lane(points, lane, "x") else 0
    for lane in hint_y:
        score -= 28 if route_uses_lane(points, lane, "y") else 0
    return score


def simplify_points(points: Sequence[Point]) -> List[Point]:
    simplified: List[Point] = []
    for x, y in points:
        pt = (round(x, 2), round(y, 2))
        if simplified and pt == simplified[-1]:
            continue
        simplified.append(pt)

    collapsed: List[Point] = []
    for point in simplified:
        if len(collapsed) < 2:
            collapsed.append(point)
            continue
        x0, y0 = collapsed[-2]
        x1, y1 = collapsed[-1]
        x2, y2 = point
        if (x0 == x1 == x2) or (y0 == y1 == y2):
            collapsed[-1] = point
        else:
            collapsed.append(point)
    return collapsed


def route_collides(points: Sequence[Point], obstacles: Sequence[Bounds]) -> bool:
    return collision_count(points, obstacles) > 0


def build_orthogonal_route(
    start: Point,
    end: Point,
    obstacles: Sequence[Bounds],
    arrow_data: Dict[str, object],
) -> List[Point]:
    if arrow_data.get("route_points"):
        raw_points = [tuple(point) for point in arrow_data["route_points"]]
        return simplify_points([start] + [(float(x), float(y)) for x, y in raw_points] + [end])

    sx, sy = start
    ex, ey = end
    routing_padding = to_float(arrow_data.get("routing_padding", 24))
    port_clearance = to_float(arrow_data.get("port_clearance", max(18, routing_padding * 0.85)))
    source_port = str(arrow_data.get("source_port", "")).strip().lower() or None
    target_port = str(arrow_data.get("target_port", "")).strip().lower() or None
    inner_start = offset_point(start, source_port, port_clearance)
    inner_end = offset_point(end, target_port, port_clearance)
    ssx, ssy = inner_start
    eex, eey = inner_end
    expanded = [expand_bounds(bounds, routing_padding) for bounds in obstacles]
    hint_x = [to_float(value) for value in arrow_data.get("corridor_x", [])]
    hint_y = [to_float(value) for value in arrow_data.get("corridor_y", [])]
    lane_x = sorted({ssx, eex, round((ssx + eex) / 2, 2), *hint_x, *[b[0] for b in expanded], *[b[2] for b in expanded]})
    lane_y = sorted({ssy, eey, round((ssy + eey) / 2, 2), *hint_y, *[b[1] for b in expanded], *[b[3] for b in expanded]})
    if expanded:
        left_rail = min(b[0] for b in expanded) - 24
        right_rail = max(b[2] for b in expanded) + 24
        top_rail = min(b[1] for b in expanded) - 24
        bottom_rail = max(b[3] for b in expanded) + 24
    else:
        left_rail = min(ssx, eex) - 48
        right_rail = max(ssx, eex) + 48
        top_rail = min(ssy, eey) - 48
        bottom_rail = max(ssy, eey) + 48

    candidates = [
        [start, inner_start, inner_end, end],
        [start, inner_start, (eex, ssy), inner_end, end],
        [start, inner_start, (ssx, eey), inner_end, end],
        [start, inner_start, ((ssx + eex) / 2, ssy), ((ssx + eex) / 2, eey), inner_end, end],
        [start, inner_start, (ssx, (ssy + eey) / 2), (eex, (ssy + eey) / 2), inner_end, end],
        [start, inner_start, (left_rail, ssy), (left_rail, eey), inner_end, end],
        [start, inner_start, (right_rail, ssy), (right_rail, eey), inner_end, end],
        [start, inner_start, (ssx, top_rail), (eex, top_rail), inner_end, end],
        [start, inner_start, (ssx, bottom_rail), (eex, bottom_rail), inner_end, end],
    ]
    for x in lane_x:
        candidates.append([start, inner_start, (x, ssy), (x, eey), inner_end, end])
    for y in lane_y:
        candidates.append([start, inner_start, (ssx, y), (eex, y), inner_end, end])
    for x in hint_x:
        for y in hint_y:
            candidates.append([start, inner_start, (x, ssy), (x, y), (eex, y), inner_end, end])

    default_route = simplify_points([start, inner_start, (eex, ssy), inner_end, end])
    default_coll = collision_count(default_route, expanded)
    default_raw_coll = collision_count(default_route, obstacles)
    default_length = route_length(default_route)
    best_route: Optional[List[Point]] = None
    best_score = float("inf")
    best_fallback: Optional[List[Point]] = None
    best_fb_coll = float("inf")
    best_fb_score = float("inf")
    for candidate in candidates:
        simplified = simplify_points(candidate)
        coll = collision_count(simplified, expanded)
        score = route_score(simplified, hint_x, hint_y, source_port, target_port)
        if coll == 0:
            if score < best_score:
                best_score = score
                best_route = simplified
        elif route_is_orthogonal(simplified):
            length = route_length(simplified)
            raw_coll = collision_count(simplified, obstacles)
            if (
                coll < default_coll
                and raw_coll <= default_raw_coll
                and length <= default_length
                and (coll < best_fb_coll or (coll == best_fb_coll and score < best_fb_score))
            ):
                best_fb_coll = coll
                best_fb_score = score
                best_fallback = simplified

    if best_route is not None:
        return best_route
    if best_fallback is not None:
        return best_fallback
    return default_route


def choose_label_position(points: Sequence[Point]) -> Point:
    segments = list(zip(points, points[1:]))
    if not segments:
        return points[0]
    best = max(segments, key=lambda seg: abs(seg[0][0] - seg[1][0]) + abs(seg[0][1] - seg[1][1]))
    return ((best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2)


def color_for_flow(style: Dict[str, object], arrow_data: Dict[str, object]) -> str:
    if arrow_data.get("color"):
        return str(arrow_data["color"])
    flow = FLOW_ALIASES.get(str(arrow_data.get("flow", "control")).lower(), "control")
    return str(style_value(style, "arrow_colors")[flow])


def marker_for_color(style: Dict[str, object], color: str, arrow_data: Dict[str, object]) -> str:
    if arrow_data.get("marker"):
        return f"url(#{arrow_data['marker']})"
    colors = style_value(style, "arrow_colors")
    for name, token in colors.items():
        if token == color:
            return f"url(#{MARKER_IDS.get(name, 'arrowA')})"
    return "url(#arrowA)"


def render_label_badge(x: float, y: float, text: str, style: Dict[str, object], label_style: str = "offset") -> str:
    width = max(36, len(text) * 7 + 14)
    parts: List[str] = []
    if label_style == "badge":
        bg = style_value(style, "arrow_label_bg")
        opacity = style_value(style, "arrow_label_opacity")
        parts.append(f'  <rect x="{round(x - width / 2, 2)}" y="{round(y - 10, 2)}" width="{width}" height="20" rx="6" fill="{bg}" opacity="{opacity}"/>')
    parts.append(f'  <text x="{round(x, 2)}" y="{round(y + 4, 2)}" text-anchor="middle" class="arrow-label">{normalize_text(text)}</text>')
    return "\n".join(parts)


def rectangle_bounds(x: float, y: float, width: float, height: float) -> Bounds:
    return (x, y, x + width, y + height)


def bounds_intersect(a: Bounds, b: Bounds, padding: float = 0.0) -> bool:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    return not (
        ax2 + padding <= bx1
        or bx2 + padding <= ax1
        or ay2 + padding <= by1
        or by2 + padding <= ay1
    )


def estimate_label_bounds(x: float, y: float, text: str) -> Bounds:
    width = max(36, len(text) * 7 + 14)
    return rectangle_bounds(x - width / 2, y - 10, width, 20)


def section_header_text(container: Dict[str, object], style: Dict[str, object]) -> str:
    if container.get("header_text"):
        text = str(container.get("header_text", ""))
    else:
        label = str(container.get("label", ""))
        prefix = str(container.get("header_prefix", "")).strip()
        separator = str(container.get("header_separator", " // " if prefix else ""))
        text = f"{prefix}{separator}{label}" if prefix else label
    if style_value(style, "section_upper") and not container.get("preserve_case"):
        text = text.upper()
    return text


def render_section(container: Dict[str, object], style: Dict[str, object]) -> str:
    x = to_float(container["x"])
    y = to_float(container["y"])
    width = to_float(container["width"])
    height = to_float(container["height"])
    rx = to_float(container.get("rx", 16 if style_value(style, "name") != "Notion Clean" else 4))
    fill = str(container.get("fill", style_value(style, "section_fill")))
    stroke = str(container.get("stroke", style_value(style, "section_stroke")))
    dash = str(container.get("stroke_dasharray", style_value(style, "section_dash")))
    label = section_header_text(container, style)
    subtitle = str(container.get("subtitle", ""))
    side_label = str(container.get("side_label", "")).strip()
    side_label_fill = str(container.get("side_label_fill", style_value(style, "text_secondary")))
    side_label_size = to_float(container.get("side_label_size", 14))
    side_label_weight = str(container.get("side_label_weight", "600"))
    side_label_anchor = str(container.get("side_label_anchor", "end"))
    lines = [f'  <rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="1.4"']
    if dash:
        lines[-1] += f' stroke-dasharray="{dash}"'
    lines[-1] += "/>"
    if label:
        lines.append(f'  <text x="{x + 18}" y="{y + 24}" class="section">{normalize_text(label)}</text>')
    if subtitle:
        lines.append(f'  <text x="{x + 18}" y="{y + 44}" class="section-sub">{normalize_text(subtitle)}</text>')
    if side_label:
        side_x = to_float(container.get("side_label_x", max(28, x - 18)))
        side_y = to_float(container.get("side_label_y", y + height / 2))
        lines.append(
            f'  <text x="{side_x}" y="{side_y}" text-anchor="{side_label_anchor}" dominant-baseline="middle" '
            f'font-size="{side_label_size}" font-weight="{side_label_weight}" fill="{side_label_fill}">{normalize_text(side_label)}</text>'
        )
    return "\n".join(lines)


def container_header_bounds(container: Dict[str, object]) -> Optional[Bounds]:
    label = str(container.get("header_text", "") or container.get("label", "")).strip()
    subtitle = str(container.get("subtitle", "")).strip()
    if not label and not subtitle:
        return None
    x = to_float(container["x"])
    y = to_float(container["y"])
    width = to_float(container["width"])
    header_height = to_float(container.get("header_height", 54 if subtitle else 30))
    return rectangle_bounds(x + 6, y + 6, width - 12, header_height)


def label_position_candidates(points: Sequence[Point]) -> List[Point]:
    segments = list(zip(points, points[1:]))
    if not segments:
        return [points[0]]
    ranked_segments = sorted(
        segments,
        key=lambda seg: abs(seg[0][0] - seg[1][0]) + abs(seg[0][1] - seg[1][1]),
        reverse=True,
    )
    candidates: List[Point] = []
    for (x1, y1), (x2, y2) in ranked_segments:
        length = abs(x1 - x2) + abs(y1 - y2)
        if length < 34:
            continue
        mx = (x1 + x2) / 2
        my = (y1 + y2) / 2
        if abs(y1 - y2) < 1e-6:
            candidates.extend([(mx, my - 16), (mx, my + 16), (mx, my - 28), (mx, my + 28), (mx, my)])
        elif abs(x1 - x2) < 1e-6:
            candidates.extend([(mx - 18, my), (mx + 18, my), (mx - 30, my), (mx + 30, my), (mx, my)])
        else:
            candidates.extend([(mx, my - 16), (mx, my + 16), (mx, my)])
    return candidates or [choose_label_position(points)]


def choose_label_position_avoiding(points: Sequence[Point], text: str, occupied: Sequence[Bounds]) -> Point:
    for candidate in label_position_candidates(points):
        label_box = estimate_label_bounds(candidate[0], candidate[1], text)
        if not any(bounds_intersect(label_box, other, 4) for other in occupied):
            return candidate
    return choose_label_position(points)


def legend_layout(data: Dict[str, object], legend: Sequence[Dict[str, object]], width: float, height: float) -> Optional[Tuple[float, float, Bounds]]:
    if not legend:
        return None
    x = to_float(data.get("legend_x", 42))
    y = to_float(data.get("legend_y", height - (len(legend) * 22 + 34)))
    position = str(data.get("legend_position", "bottom-left"))
    max_label = max((len(str(item.get("label", ""))) for item in legend), default=12)
    block_width = 40 + max_label * 7 + 12
    block_height = len(legend) * 22 + 6
    if position == "bottom-right":
        x = to_float(data.get("legend_x", width - block_width - 42))
    elif position == "top-right":
        x = to_float(data.get("legend_x", width - block_width - 42))
        y = to_float(data.get("legend_y", 96))
    elif position == "top-left":
        x = to_float(data.get("legend_x", 42))
        y = to_float(data.get("legend_y", 96))
    return (x, y, rectangle_bounds(x - 4, y - 10, block_width + 8, block_height + 12))


def footer_layout(data: Dict[str, object], width: float, height: float) -> Optional[Tuple[float, float, Bounds]]:
    text = str(data.get("footer", "")).strip()
    if not text:
        return None
    footer_width = max(140, len(text) * 7)
    x = to_float(data.get("footer_x", 42))
    y = to_float(data.get("footer_y", height - 16))
    position = str(data.get("footer_position", "bottom-left"))
    if position == "bottom-right":
        x = to_float(data.get("footer_x", width - footer_width - 42))
    return (x, y, rectangle_bounds(x, y - 12, footer_width, 16))


def render_tags(node: Dict[str, object], x: float, y: float, style: Dict[str, object]) -> List[str]:
    tags = node.get("tags", [])
    if not tags:
        return []
    cursor_x = x
    lines = []
    for tag in tags:
        label = normalize_text(tag.get("label", ""))
        width = max(62, len(str(tag.get("label", ""))) * 8 + 18)
        fill = tag.get("fill", "#eff6ff")
        stroke = tag.get("stroke", "#bfdbfe")
        text_fill = tag.get("text_fill", style_value(style, "arrow_colors")["read"])
        lines.append(
            f'  <rect x="{cursor_x}" y="{y}" width="{width}" height="16" rx="3" fill="{fill}" stroke="{stroke}" stroke-width="1"/>'
        )
        lines.append(
            f'  <text x="{cursor_x + width / 2}" y="{y + 11.5}" text-anchor="middle" font-size="11" font-weight="500" fill="{text_fill}">{label}</text>'
        )
        cursor_x += width + 8
    return lines


def render_rect_node(node: Dict[str, object], style: Dict[str, object], kind: str) -> str:
    x = to_float(node["x"])
    y = to_float(node["y"])
    width = to_float(node.get("width", 180))
    height = to_float(node.get("height", 76))
    rx = to_float(node.get("rx", style_value(style, "node_radius")))
    fill = str(node.get("fill", style_value(style, "node_fill")))
    stroke = str(node.get("stroke", style_value(style, "node_stroke")))
    stroke_width = to_float(node.get("stroke_width", 2.0 if kind != "rect" else 1.8))
    filter_attr = ""
    node_shadow = node.get("filter")
    if node_shadow:
        filter_attr = f' filter="url(#{node_shadow})"'
    elif node.get("glow"):
        glow_name = str(node.get("glow"))
        glow_map = {
            "blue": "glowBlue",
            "purple": "glowPurple",
            "green": "glowGreen",
            "orange": "glowOrange",
        }
        if glow_name in glow_map:
            filter_attr = f' filter="url(#{glow_map[glow_name]})"'
    elif style_value(style, "node_shadow"):
        if not node.get("flat", False):
            filter_attr = f' filter="{style_value(style, "node_shadow")}"'
    title = normalize_text(node.get("label", ""))
    subtitle = normalize_text(node.get("sublabel", ""))
    type_label = normalize_text(node.get("type_label", ""))
    accent_fill = node.get("accent_fill")
    lines = []

    if kind == "double_rect":
        lines.append(
            f'  <rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"{filter_attr}/>'
        )
        lines.append(
            f'  <rect x="{x + 6}" y="{y + 6}" width="{width - 12}" height="{height - 12}" rx="{max(rx - 3, 4)}" fill="none" stroke="{stroke}" stroke-width="1.2" opacity="0.65"/>'
        )
    elif kind == "terminal":
        lines.append(
            f'  <rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"{filter_attr}/>'
        )
        lines.append(
            f'  <rect x="{x}" y="{y}" width="{width}" height="18" rx="{rx}" fill="{node.get("header_fill", "#1f2937")}" opacity="0.95"/>'
        )
        header_colors = node.get("header_dots", ["#ef4444", "#f59e0b", "#10b981"])
        for idx, color in enumerate(header_colors):
            lines.append(f'  <circle cx="{x + 16 + idx * 14}" cy="{y + 9}" r="4" fill="{color}"/>')
        lines.append(
            f'  <text x="{x + 18}" y="{y + 44}" font-size="28" font-weight="700" fill="{node.get("prompt_fill", "#10b981")}">$</text>'
        )
        lines.append(
            f'  <text x="{x + 38}" y="{y + 44}" font-size="22" font-weight="500" fill="{style_value(style, "text_secondary")}">_</text>'
        )
    elif kind == "document":
        fold = min(18, width * 0.18, height * 0.22)
        path = (
            f"M {x} {y} L {x + width - fold} {y} L {x + width} {y + fold} "
            f"L {x + width} {y + height} L {x} {y + height} Z"
        )
        lines.append(
            f'  <path d="{path}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"{filter_attr}/>'
        )
        lines.append(
            f'  <path d="M {x + width - fold} {y} L {x + width - fold} {y + fold} L {x + width} {y + fold}" fill="none" stroke="{stroke}" stroke-width="{stroke_width}"/>'
        )
        for idx in range(4):
            line_y = y + 26 + idx * 14
            lines.append(
                f'  <line x1="{x + 18}" y1="{line_y}" x2="{x + width - 28}" y2="{line_y}" stroke="{node.get("line_stroke", "#c4b5fd")}" stroke-width="1.2"/>'
            )
    elif kind == "folder":
        tab_w = min(54, width * 0.34)
        tab_h = 18
        path = (
            f"M {x} {y + tab_h} L {x + tab_w * 0.4} {y + tab_h} L {x + tab_w * 0.58} {y} "
            f"L {x + tab_w} {y} L {x + width} {y} L {x + width} {y + height} L {x} {y + height} Z"
        )
        lines.append(
            f'  <path d="{path}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"{filter_attr}/>'
        )
        for idx in range(3):
            line_y = y + 42 + idx * 14
            lines.append(
                f'  <line x1="{x + 22}" y1="{line_y}" x2="{x + width - 22}" y2="{line_y}" stroke="{node.get("line_stroke", stroke)}" stroke-opacity="0.35" stroke-width="1.2"/>'
            )
    elif kind == "hexagon":
        inset = 22
        path = (
            f"M {x + inset} {y} L {x + width - inset} {y} L {x + width} {y + height / 2} "
            f"L {x + width - inset} {y + height} L {x + inset} {y + height} L {x} {y + height / 2} Z"
        )
        lines.append(f'  <path d="{path}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"{filter_attr}/>')
    elif kind == "speech":
        tail = 18
        path = (
            f"M {x + rx} {y} L {x + width - rx} {y} Q {x + width} {y} {x + width} {y + rx} "
            f"L {x + width} {y + height - rx} Q {x + width} {y + height} {x + width - rx} {y + height} "
            f"L {x + 26} {y + height} L {x + 12} {y + height + tail} L {x + 16} {y + height} "
            f"L {x + rx} {y + height} Q {x} {y + height} {x} {y + height - rx} "
            f"L {x} {y + rx} Q {x} {y} {x + rx} {y} Z"
        )
        lines.append(f'  <path d="{path}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"{filter_attr}/>')
    else:
        lines.append(
            f'  <rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"{filter_attr}/>'
        )

    if accent_fill and kind == "icon_box":
        lines.append(
            f'  <rect x="{x + 12}" y="{y + 12}" width="{width - 24}" height="{height - 24}" rx="{max(rx - 4, 4)}" fill="{accent_fill}" opacity="0.9"/>'
        )

    if kind == "user_avatar":
        circle_fill = node.get("icon_fill", "#dbeafe")
        icon_stroke = node.get("icon_stroke", stroke)
        cx = x + 26
        cy = y + height / 2
        lines.append(f'  <circle cx="{cx}" cy="{cy}" r="18" fill="{circle_fill}" stroke="{icon_stroke}" stroke-width="1.6"/>')
        lines.append(f'  <circle cx="{cx}" cy="{cy - 6}" r="5" fill="{icon_stroke}"/>')
        lines.append(f'  <path d="M {cx - 10} {cy + 11} Q {cx} {cy + 2} {cx + 10} {cy + 11}" fill="none" stroke="{icon_stroke}" stroke-width="2"/>')

    if kind == "bot":
        cx = x + width / 2
        cy = y + height / 2 + 2
        body_fill = node.get("body_fill", "#1e293b")
        accent = node.get("accent_fill", "#34d399")
        lines.append(f'  <rect x="{cx - 42}" y="{cy - 32}" width="84" height="84" rx="18" fill="{body_fill}" stroke="#334155" stroke-width="1.8"{filter_attr}/>')
        lines.append(f'  <rect x="{cx - 26}" y="{cy - 16}" width="52" height="22" rx="6" fill="#0f172a" stroke="#475569" stroke-width="1.2"/>')
        lines.append(f'  <circle cx="{cx - 12}" cy="{cy - 5}" r="5" fill="{accent}"/>')
        lines.append(f'  <circle cx="{cx + 12}" cy="{cy - 5}" r="5" fill="{accent}"/>')
        lines.append(f'  <rect x="{cx - 14}" y="{cy + 14}" width="28" height="6" rx="3" fill="#334155"/>')
        lines.append(f'  <line x1="{cx}" y1="{cy - 36}" x2="{cx}" y2="{cy - 50}" stroke="{accent}" stroke-width="3"/>')
        lines.append(f'  <circle cx="{cx}" cy="{cy - 54}" r="5" fill="{accent}"/>')

    if kind == "circle_cluster":
        r = min(width, height) / 4.0
        centers = [(x + width * 0.36, y + height * 0.56), (x + width * 0.58, y + height * 0.45), (x + width * 0.74, y + height * 0.58)]
        for cx, cy in centers:
            lines.append(f'  <circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>')

    type_offset = y + 18 if kind not in {"terminal", "bot"} else y + 18
    title_y = y + height / 2 - (4 if type_label and kind not in {"terminal", "bot"} else 0)
    if kind in {"document", "folder"}:
        title_y = y + height + 26
    elif kind == "circle_cluster":
        title_y = y + height / 2 + 8
    elif kind == "bot":
        title_y = y + height + 22
    elif kind == "user_avatar":
        title_y = y + height / 2 + 6

    if type_label:
        lines.append(f'  <text x="{x + (54 if kind == "user_avatar" else width / 2)}" y="{type_offset}" text-anchor="middle" class="node-type">{type_label}</text>')
        title_y += 10 if kind not in {"document", "folder", "circle_cluster", "bot"} else 0

    title_x = x + width / 2
    text_anchor = "middle"
    if kind == "user_avatar":
        title_x = x + 64
        text_anchor = "start"
    if kind == "terminal":
        title_y = y + height - 14
    if kind == "bot":
        title_x = x + width / 2
        text_anchor = "middle"
    lines.append(f'  <text x="{title_x}" y="{title_y}" text-anchor="{text_anchor}" class="node-title">{title}</text>')

    if subtitle:
        sub_y = title_y + 22
        if kind == "document":
            sub_y = y + height + 44
            title_y = y + height + 24
        if kind == "folder":
            sub_y = y + height + 44
        if kind == "circle_cluster":
            sub_y = y + height / 2 + 28
        if kind == "bot":
            sub_y = y + height + 42
        if kind == "terminal":
            sub_y = y + height + 20
        if kind == "user_avatar":
            sub_y = title_y + 22
        lines.append(f'  <text x="{title_x}" y="{sub_y}" text-anchor="{text_anchor}" class="node-sub">{subtitle}</text>')

    tag_lines = []
    if node.get("tags"):
        tag_x = x + 18
        tag_y = y + height - 20
        if kind in {"document", "folder", "circle_cluster", "bot", "terminal"}:
            tag_y = y + height + 52
        tag_lines = render_tags(node, tag_x, tag_y, style)
    lines.extend(tag_lines)

    return "\n".join(lines)


def render_node(node: Dict[str, object], style: Dict[str, object]) -> str:
    kind = str(node.get("kind", node.get("shape", "rect")))
    if kind == "cylinder":
        x = to_float(node["x"])
        y = to_float(node["y"])
        width = to_float(node.get("width", 160))
        height = to_float(node.get("height", 120))
        rx = width / 2
        ry = min(18, height / 8)
        fill = str(node.get("fill", "#ecfdf5"))
        stroke = str(node.get("stroke", "#10b981"))
        stroke_width = to_float(node.get("stroke_width", 2.2))
        label = normalize_text(node.get("label", ""))
        subtitle = normalize_text(node.get("sublabel", ""))
        lines = [
            f'  <ellipse cx="{x + width / 2}" cy="{y + ry}" rx="{rx / 2}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>',
            f'  <rect x="{x}" y="{y + ry}" width="{width}" height="{height - 2 * ry}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>',
            f'  <ellipse cx="{x + width / 2}" cy="{y + height - ry}" rx="{rx / 2}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>',
            f'  <ellipse cx="{x + width / 2}" cy="{y + height * 0.38}" rx="{rx / 2}" ry="{ry}" fill="none" stroke="{stroke}" stroke-opacity="0.45" stroke-width="1.2"/>',
            f'  <ellipse cx="{x + width / 2}" cy="{y + height * 0.6}" rx="{rx / 2}" ry="{ry}" fill="none" stroke="{stroke}" stroke-opacity="0.25" stroke-width="1.2"/>',
            f'  <text x="{x + width / 2}" y="{y + height / 2 - 6}" text-anchor="middle" class="node-title">{label}</text>',
        ]
        if subtitle:
            lines.append(f'  <text x="{x + width / 2}" y="{y + height / 2 + 18}" text-anchor="middle" class="node-sub">{subtitle}</text>')
        return "\n".join(lines)
    return render_rect_node(node, style, kind)


def render_arrow(
    arrow: Dict[str, object],
    style: Dict[str, object],
    node_map: Dict[str, Node],
    route_obstacles: Sequence[Bounds],
    label_obstacles: Sequence[Bounds],
) -> Tuple[str, str, Optional[Bounds]]:
    start_hint = (to_float(arrow.get("x1")), to_float(arrow.get("y1")))
    end_hint = (to_float(arrow.get("x2")), to_float(arrow.get("y2")))
    source_node = node_map.get(str(arrow.get("source"))) if arrow.get("source") else None
    target_node = node_map.get(str(arrow.get("target"))) if arrow.get("target") else None
    source_port = arrow.get("source_port")
    target_port = arrow.get("target_port")

    if source_node is not None:
        toward = end_hint if target_node is None else (target_node.cx, target_node.cy)
        start = anchor_point(source_node, toward, str(source_port) if source_port else None)
    else:
        start = start_hint

    if target_node is not None:
        toward = start_hint if source_node is None else (source_node.cx, source_node.cy)
        end = anchor_point(target_node, toward, str(target_port) if target_port else None)
    else:
        end = end_hint

    obstacles = list(route_obstacles)
    if source_node is not None:
        obstacles = [bounds for bounds in obstacles if bounds != source_node.bounds]
    if target_node is not None:
        obstacles = [bounds for bounds in obstacles if bounds != target_node.bounds]

    route = build_orthogonal_route(start, end, obstacles, arrow)
    path_d = "M " + " L ".join(f"{round(x, 2)},{round(y, 2)}" for x, y in route)
    color = color_for_flow(style, arrow)
    width = to_float(arrow.get("stroke_width", style_value(style, "arrow_width")))
    dash = arrow.get("stroke_dasharray")
    if dash is None and arrow.get("dashed"):
        dash = "6,4"
    marker = marker_for_color(style, color, arrow)
    path = f'  <path d="{path_d}" fill="none" stroke="{color}" stroke-width="{width}" marker-end="{marker}"'
    if dash:
        path += f' stroke-dasharray="{dash}"'
    if arrow.get("opacity") is not None:
        path += f' opacity="{arrow["opacity"]}"'
    path += "/>"
    label_svg = ""
    label_bounds = None

    label = str(arrow.get("label", "")).strip()
    if label:
        label_x, label_y = choose_label_position_avoiding(route, label, label_obstacles)
        label_x += to_float(arrow.get("label_dx", 0))
        label_y += to_float(arrow.get("label_dy", -4))
        label_svg = render_label_badge(label_x, label_y, label, style, label_style=str(arrow.get("label_style", "badge")))
        label_bounds = estimate_label_bounds(label_x, label_y, label)
    return path, label_svg, label_bounds


def render_legend(
    legend: Sequence[Dict[str, object]],
    style: Dict[str, object],
    width: float,
    height: float,
    data: Dict[str, object],
) -> str:
    layout = legend_layout(data, legend, width, height)
    if not layout:
        return ""
    legend_x, legend_y, _ = layout
    lines = []
    for idx, item in enumerate(legend):
        y = legend_y + idx * 22
        color = item.get("color")
        if not color:
            color = style_value(style, "arrow_colors")[FLOW_ALIASES.get(str(item.get("flow", "control")).lower(), "control")]
        marker = marker_for_color(style, str(color), {"flow": item.get("flow", "control")})
        lines.append(f'  <line x1="{legend_x}" y1="{y}" x2="{legend_x + 30}" y2="{y}" stroke="{color}" stroke-width="{style_value(style, "arrow_width")}" marker-end="{marker}"/>')
        lines.append(f'  <text x="{legend_x + 40}" y="{y + 4}" class="legend">{normalize_text(item.get("label", ""))}</text>')
    if data.get("legend_box"):
        max_label = max((len(str(item.get("label", ""))) for item in legend), default=12)
        block_width = 40 + max_label * 7 + 12
        block_height = len(legend) * 22 + 6
        bg = data.get("legend_box_fill", style_value(style, "arrow_label_bg"))
        opacity = data.get("legend_box_opacity", 0.88)
        lines.insert(0, f'  <rect x="{legend_x - 10}" y="{legend_y - 14}" width="{block_width + 20}" height="{block_height + 18}" rx="10" fill="{bg}" opacity="{opacity}"/>')
    return "\n".join(lines)


def render_footer(data: Dict[str, object], style: Dict[str, object], width: float, height: float) -> str:
    layout = footer_layout(data, width, height)
    if not layout:
        return ""
    x, y, _ = layout
    text = str(data.get("footer", "")).strip()
    return f'  <text x="{x}" y="{y}" class="footnote">{normalize_text(text)}</text>'


def build_svg(template_type: str, data: Dict[str, object]) -> str:
    style_index, style = parse_style(data.get("style"))
    if data.get("style_overrides"):
        style.update(data["style_overrides"])
    width, height = parse_template_viewbox(template_type)
    width = to_float(data.get("width", width))
    height = to_float(data.get("height", height))
    if data.get("viewBox"):
        match = re.match(r"0 0 ([0-9.]+) ([0-9.]+)", str(data["viewBox"]))
        if match:
            width = float(match.group(1))
            height = float(match.group(2))

    containers = data.get("containers", [])
    nodes_data = data.get("nodes", [])
    arrows_data = data.get("arrows", [])
    legend = data.get("legend", [])

    defs = render_defs(style_index, style)
    canvas = render_canvas(style_index, style, width, height)
    title_block, content_start_y = render_title_block(style, data, width)
    window_controls = render_window_controls(data, style_index, width)
    header_meta = render_header_meta(data, style, width)

    # Assign auto_place y before building node maps so arrows route correctly
    for node_data in nodes_data:
        if "y" not in node_data and node_data.get("auto_place"):
            node_data["y"] = content_start_y + to_float(node_data.get("offset_y", 0))

    normalized_nodes = [normalize_node(node, f"node-{idx}") for idx, node in enumerate(nodes_data)]
    node_map = {node.node_id: node for node in normalized_nodes}

    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {int(width)} {int(height)}" width="{int(width)}" height="{int(height)}">']
    lines.append(defs)
    lines.append(canvas)
    if window_controls:
        lines.append(window_controls)
    if header_meta:
        lines.append(header_meta)
    lines.append(title_block)

    if containers:
        for container in containers:
            lines.append(render_section(container, style))

    section_obstacles = [bounds for container in containers if (bounds := container_header_bounds(container)) is not None]
    legend_reserved = legend_layout(data, legend, width, height)
    footer_reserved = footer_layout(data, width, height)
    blueprint_block_svg, blueprint_block_bounds = render_blueprint_title_block(data, style, style_index, width, height)
    reserved_bounds = list(section_obstacles)
    if legend_reserved:
        reserved_bounds.append(legend_reserved[2])
    if footer_reserved:
        reserved_bounds.append(footer_reserved[2])
    if blueprint_block_bounds:
        reserved_bounds.append(blueprint_block_bounds)

    arrow_paths: List[str] = []
    arrow_labels: List[str] = []
    node_obstacles = [node.bounds for node in normalized_nodes]
    route_obstacles = node_obstacles + reserved_bounds
    label_obstacles = node_obstacles + reserved_bounds
    for arrow in arrows_data:
        path_svg, label_svg, label_bounds = render_arrow(arrow, style, node_map, route_obstacles, label_obstacles)
        arrow_paths.append(path_svg)
        if label_svg:
            arrow_labels.append(label_svg)
        if label_bounds:
            label_obstacles.append(label_bounds)

    lines.extend(path for path in arrow_paths if path)

    for node_data in nodes_data:
        lines.append(render_node(node_data, style))

    lines.extend(label for label in arrow_labels if label)

    legend_svg = render_legend(legend, style, width, height, data)
    if legend_svg:
        lines.append(legend_svg)

    if blueprint_block_svg:
        lines.append(blueprint_block_svg)

    footer_svg = render_footer(data, style, width, height)
    if footer_svg:
        lines.append(footer_svg)

    lines.append("</svg>")
    return "\n".join(line for line in lines if line)


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python3 generate-from-template.py <template-type> <output-path> [data-json]")
        sys.exit(1)

    template_type = sys.argv[1]
    output_path = sys.argv[2]

    try:
        if len(sys.argv) > 3:
            data = json.loads(sys.argv[3])
        else:
            data = json.load(sys.stdin)
        svg_content = build_svg(template_type, data)
        with open(output_path, "w", encoding="utf-8") as handle:
            handle.write(svg_content)
        print(f"✓ SVG generated: {output_path}")
    except FileNotFoundError as exc:
        print(f"Error: {exc}")
        sys.exit(1)
    except json.JSONDecodeError as exc:
        print(f"Error: Invalid JSON: {exc}")
        sys.exit(1)
    except ValueError as exc:
        print(f"Error: {exc}")
        sys.exit(1)
    except Exception as exc:  # pragma: no cover
        print(f"Unexpected error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
