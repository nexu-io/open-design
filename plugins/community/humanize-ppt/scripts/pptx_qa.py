#!/usr/bin/env python3
"""Static OOXML checks for PPT Master output.

The checker intentionally uses only the Python standard library. It validates
the package and the Humanize-owned semantic contract without rewriting the
downstream PPTX. Visual collision/overflow remains PPT Master's browser review
gate because those failures require a rendered slide, not XML inspection.
"""

from __future__ import annotations

import posixpath
import re
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


PML = "http://schemas.openxmlformats.org/presentationml/2006/main"
DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"

NS = {"p": PML, "a": DRAWING, "r": REL, "pr": PACKAGE_REL}

PLACEHOLDER_RE = re.compile(
    r"(?:\[必填[^\]]*\]|\b(?:lorem\s+ipsum|todo|tbd)\b|SLIDES_HERE)",
    re.IGNORECASE,
)


def _finding(
    check_id: str,
    severity: str,
    evidence: str,
    pages: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": check_id,
        "severity": severity,
        "evidence": evidence,
        "pages": pages or [],
    }


def _read_xml(zf: zipfile.ZipFile, name: str) -> ET.Element:
    return ET.fromstring(zf.read(name))


def _relationship_path(part_name: str) -> str:
    directory, filename = posixpath.split(part_name)
    return posixpath.join(directory, "_rels", f"{filename}.rels")


def _relationships(zf: zipfile.ZipFile, part_name: str) -> dict[str, dict[str, str]]:
    rels_name = _relationship_path(part_name)
    if rels_name not in zf.namelist():
        return {}
    root = _read_xml(zf, rels_name)
    relationships: dict[str, dict[str, str]] = {}
    for rel in root.findall("pr:Relationship", NS):
        rel_id = rel.attrib.get("Id")
        if rel_id:
            relationships[rel_id] = dict(rel.attrib)
    return relationships


def _resolve_target(source_part: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(source_part), target))


def _ordered_slide_parts(zf: zipfile.ZipFile) -> list[str]:
    presentation = "ppt/presentation.xml"
    root = _read_xml(zf, presentation)
    rels = _relationships(zf, presentation)
    parts: list[str] = []
    for slide_id in root.findall(".//p:sldIdLst/p:sldId", NS):
        rel_id = slide_id.attrib.get(f"{{{REL}}}id")
        rel = rels.get(rel_id or "", {})
        target = rel.get("Target")
        if not target:
            raise ValueError(f"slide relationship is missing for {rel_id or 'unknown id'}")
        resolved = _resolve_target(presentation, target)
        if resolved not in zf.namelist():
            raise ValueError(f"slide part is missing: {resolved}")
        parts.append(resolved)
    return parts


def _text(root: ET.Element) -> str:
    return " ".join(
        (node.text or "").strip()
        for node in root.findall(".//a:t", NS)
        if (node.text or "").strip()
    )


def _tokens(value: str) -> set[str]:
    return {
        token.lower()
        for token in re.findall(r"[A-Za-z0-9]+|[\u3400-\u9fff]", value)
        if token.strip()
    }


def _semantic_match(actual: str, expected_values: list[str]) -> bool:
    actual_compact = re.sub(r"\W+", "", actual, flags=re.UNICODE).lower()
    actual_tokens = _tokens(actual)
    for expected in expected_values:
        expected_compact = re.sub(r"\W+", "", str(expected), flags=re.UNICODE).lower()
        if not expected_compact:
            continue
        if expected_compact in actual_compact or actual_compact in expected_compact:
            return True
        expected_tokens = _tokens(expected)
        if expected_tokens:
            overlap = len(actual_tokens & expected_tokens) / max(
                1, min(len(actual_tokens), len(expected_tokens))
            )
            if overlap >= 0.5:
                return True
    return False


def _meaningful_note(text: str) -> bool:
    compact = re.sub(r"[\W\d_]+", "", text, flags=re.UNICODE)
    return len(compact) >= 4


def inspect_pptx(
    pptx_path: str | Path,
    plan: list[dict[str, Any]] | None = None,
    *,
    require_notes: bool = True,
    require_transition: bool = True,
    require_native_objects: bool = False,
    allowed_ids: set[str] | None = None,
) -> dict[str, Any]:
    """Inspect a PPTX and return Humanize-compatible findings plus stats."""

    path = Path(pptx_path)
    plan = plan or []
    findings: list[dict[str, Any]] = []

    def add(
        check_id: str,
        severity: str,
        evidence: str,
        pages: list[str] | None = None,
    ) -> None:
        if allowed_ids is None or check_id in allowed_ids:
            findings.append(_finding(check_id, severity, evidence, pages))

    try:
        with zipfile.ZipFile(path) as zf:
            corrupt_member = zf.testzip()
            if corrupt_member:
                add("pptx-package-invalid", "fail", f"CRC check failed for {corrupt_member}.")
                return {"findings": findings, "stats": {"slide_count": 0}}

            names = set(zf.namelist())
            required_parts = {"[Content_Types].xml", "ppt/presentation.xml"}
            missing_parts = sorted(required_parts - names)
            if missing_parts:
                add("pptx-package-invalid", "fail", f"Required OOXML parts missing: {', '.join(missing_parts)}.")
                return {"findings": findings, "stats": {"slide_count": 0}}

            content_types_bytes = zf.read("[Content_Types].xml")
            try:
                content_types_root = ET.fromstring(content_types_bytes)
            except ET.ParseError as exc:
                add("pptx-package-invalid", "fail", f"[Content_Types].xml cannot be parsed: {exc}.")
                return {"findings": findings, "stats": {"slide_count": 0}}
            if content_types_root.tag != f"{{{CONTENT_TYPES}}}Types":
                add(
                    "pptx-package-invalid",
                    "fail",
                    "[Content_Types].xml has an unexpected root namespace.",
                )
                return {"findings": findings, "stats": {"slide_count": 0}}
            if re.search(rb"<[A-Za-z_][\w.-]*:Types\b", content_types_bytes):
                add(
                    "pptx-package-invalid",
                    "fail",
                    "[Content_Types].xml uses a prefixed root namespace; this package shape is rejected by LibreOffice. Emit the content-types namespace as the default namespace.",
                )

            try:
                slide_parts = _ordered_slide_parts(zf)
            except (ET.ParseError, KeyError, ValueError) as exc:
                add("pptx-package-invalid", "fail", f"Presentation relationships cannot be parsed: {exc}.")
                return {"findings": findings, "stats": {"slide_count": 0}}

            if len(slide_parts) != len(plan) and plan:
                add(
                    "pptx-slide-count-mismatch",
                    "fail",
                    f"PPTX has {len(slide_parts)} slides; slide_plan.json requires {len(plan)}.",
                )

            placeholder_pages: list[str] = []
            empty_pages: list[str] = []
            flattened_pages: list[str] = []
            missing_note_pages: list[str] = []
            note_drift_pages: list[str] = []
            content_drift_pages: list[str] = []
            broken_relationship_pages: list[str] = []
            missing_transition_pages: list[str] = []
            missing_native_pages: list[str] = []
            notes_count = 0
            editable_shape_count = 0
            native_object_count = 0

            for index, slide_part in enumerate(slide_parts):
                page = str(
                    (plan[index] if index < len(plan) else {}).get("slide_id")
                    or f"S{index + 1:02d}"
                )
                if slide_part not in names:
                    broken_relationship_pages.append(page)
                    continue
                try:
                    slide_root = _read_xml(zf, slide_part)
                except ET.ParseError:
                    broken_relationship_pages.append(page)
                    continue

                slide_text = _text(slide_root)
                if PLACEHOLDER_RE.search(slide_text):
                    placeholder_pages.append(page)
                if not slide_text.strip():
                    empty_pages.append(page)

                editable = (
                    len(slide_root.findall(".//p:sp", NS))
                    + len(slide_root.findall(".//p:grpSp", NS))
                    + len(slide_root.findall(".//p:graphicFrame", NS))
                )
                editable_shape_count += editable
                if editable == 0:
                    flattened_pages.append(page)

                if require_transition and slide_root.find(".//p:transition", NS) is None:
                    missing_transition_pages.append(page)

                graphic_data = slide_root.findall(".//a:graphicData", NS)
                native_on_page = sum(
                    1
                    for node in graphic_data
                    if node.attrib.get("uri", "").endswith(("/chart", "/table"))
                )
                native_object_count += native_on_page
                plan_entry = plan[index] if index < len(plan) else {}
                diagram = ((plan_entry.get("media") or {}).get("diagram") or {})
                expects_native = diagram.get("needed") and diagram.get("kind") == "html-table"
                if require_native_objects and expects_native and native_on_page == 0:
                    missing_native_pages.append(page)

                expected_values = [
                    str(plan_entry.get("title") or ""),
                    str(plan_entry.get("message") or ""),
                    *[str(item) for item in (plan_entry.get("visible_content") or [])],
                ]
                has_expected_content = any(value.strip() for value in expected_values)
                if has_expected_content and slide_text and not _semantic_match(slide_text, expected_values):
                    content_drift_pages.append(page)

                try:
                    rels = _relationships(zf, slide_part)
                except ET.ParseError:
                    broken_relationship_pages.append(page)
                    rels = {}
                notes_parts: list[str] = []
                for rel in rels.values():
                    if rel.get("TargetMode") == "External":
                        continue
                    target = rel.get("Target")
                    if not target:
                        continue
                    resolved = _resolve_target(slide_part, target)
                    if resolved not in names:
                        broken_relationship_pages.append(page)
                    if rel.get("Type", "").endswith("/notesSlide"):
                        notes_parts.append(resolved)

                note_text = ""
                for notes_part in notes_parts:
                    if notes_part not in names:
                        continue
                    try:
                        note_text = f"{note_text} {_text(_read_xml(zf, notes_part))}".strip()
                    except ET.ParseError:
                        broken_relationship_pages.append(page)
                if _meaningful_note(note_text):
                    notes_count += 1
                elif require_notes:
                    missing_note_pages.append(page)

                speaker_intent = str(plan_entry.get("speaker_intent") or "")
                if (
                    speaker_intent
                    and note_text
                    and not _semantic_match(note_text, [speaker_intent])
                ):
                    note_drift_pages.append(page)

            if placeholder_pages:
                add(
                    "pptx-placeholder-residue",
                    "fail",
                    "Template or draft placeholders remain in slide text.",
                    sorted(set(placeholder_pages)),
                )
            if empty_pages:
                add(
                    "pptx-slide-empty",
                    "fail",
                    "Slides contain no editable visible text.",
                    sorted(set(empty_pages)),
                )
            if flattened_pages:
                add(
                    "pptx-flattened-slide",
                    "fail",
                    "Slides contain no editable shape, group, table, or chart object.",
                    sorted(set(flattened_pages)),
                )
            if missing_note_pages:
                add(
                    "pptx-missing-speaker-notes",
                    "fail",
                    "Speaker notes are missing or empty for planned slides.",
                    sorted(set(missing_note_pages)),
                )
            if note_drift_pages:
                add(
                    "pptx-speaker-intent-drift",
                    "warn",
                    "Speaker notes do not visibly preserve the Humanize speaker intent.",
                    sorted(set(note_drift_pages)),
                )
            if content_drift_pages:
                add(
                    "pptx-ast-content-drift",
                    "warn",
                    "Slide text has weak lexical overlap with the corresponding Humanize AST page.",
                    sorted(set(content_drift_pages)),
                )
            if broken_relationship_pages:
                add(
                    "pptx-broken-relationship",
                    "fail",
                    "One or more slide relationships point to missing or invalid OOXML parts.",
                    sorted(set(broken_relationship_pages)),
                )
            if missing_transition_pages:
                add(
                    "pptx-transition-missing",
                    "fail",
                    "Expected native slide transitions are missing.",
                    sorted(set(missing_transition_pages)),
                )
            if missing_native_pages:
                add(
                    "pptx-native-object-missing",
                    "fail",
                    "A planned table page was not exported as a native table/chart object.",
                    sorted(set(missing_native_pages)),
                )

            return {
                "findings": findings,
                "stats": {
                    "slide_count": len(slide_parts),
                    "notes_count": notes_count,
                    "editable_shape_count": editable_shape_count,
                    "native_object_count": native_object_count,
                },
            }
    except (zipfile.BadZipFile, OSError) as exc:
        add("pptx-package-invalid", "fail", f"Cannot open PPTX package: {exc}.")
        return {"findings": findings, "stats": {"slide_count": 0}}
