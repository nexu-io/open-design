#!/usr/bin/env python3
"""Internal helper: extract lightweight template assets and style metadata from a PPTX file.

This helper is intentionally limited in scope:
- extract reusable media assets
- summarize slide size, theme colors, and fonts
- infer common background assets through slide/layout/master inheritance
- produce a compact manifest for downstream template reconstruction

It does NOT try to convert arbitrary PPTX shapes into SVG templates.

Output contract (single source of truth):
    <workspace>/manifest.json   — all factual metadata (theme, assets, slides, layouts, masters)
    <workspace>/summary.md      — short human-readable digest derived from manifest.json
    <workspace>/assets/         — extracted reusable image assets

This module is a pure library. The CLI entry point lives in
``pptx_template_import.py`` at the scripts root.
"""

from __future__ import annotations

import json
import posixpath
import re
import shutil
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

EMU_PER_INCH = 914400

SLIDE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
LAYOUT_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
MASTER_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
THEME_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"

THANKS_KEYWORDS = ("thank", "thanks", "q&a", "qa", "contact", "致谢", "谢谢", "感谢", "答疑", "联系方式")
TOC_KEYWORDS = ("agenda", "contents", "content", "outline", "目录", "议程", "目录页")
CHAPTER_KEYWORDS = ("chapter", "part", "section", "章节", "部分")


@dataclass
class SlideRecord:
    index: int
    name: str
    slide_path: str
    layout_path: str | None
    master_path: str | None
    background_asset: str | None
    background_source: str | None
    image_assets: list[str]
    text_samples: list[str]
    text_count: int
    shape_count: int
    page_type: str
    svg_file: str
    flat_svg_file: str


def summarize_part_record(
    *,
    part_path: str | None,
    root: ET.Element | None,
    rels: dict[str, dict[str, str]],
    copied_assets: dict[str, str],
    used_by_slides: list[int],
    parent_path: str | None = None,
    theme_path: str | None = None,
    svg_file: str | None = None,
    theme: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not part_path:
        return None

    bg_asset = detect_background_asset(root, rels)
    image_targets = extract_image_targets(root, rels)
    return {
        "path": part_path,
        "name": PurePosixPath(part_path).name,
        "svgFile": svg_file,
        "parentPath": parent_path,
        "themePath": theme_path,
        "theme": theme,
        "backgroundAsset": copied_assets.get(bg_asset, PurePosixPath(bg_asset).name if bg_asset else None),
        "imageAssets": [copied_assets.get(target, PurePosixPath(target).name) for target in image_targets],
        "placeholders": extract_placeholders(root),
        "textSamples": extract_text_samples(root),
        "textCount": len(root.findall(".//a:t", NS)) if root is not None else 0,
        "shapeCount": count_slide_shapes(root),
        "usedBySlides": used_by_slides,
    }


def normalize_part(path: str, base: str | None = None) -> str:
    if base:
        path = str(PurePosixPath(base).parent.joinpath(path))
    path = path.replace("\\", "/")
    normalized = posixpath.normpath(path)
    if normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")


def rels_path_for(part_path: str) -> str:
    part = PurePosixPath(part_path)
    return str(part.parent / "_rels" / f"{part.name}.rels")


def load_xml_from_zip(zf: zipfile.ZipFile, part_path: str) -> ET.Element | None:
    try:
        with zf.open(part_path) as fh:
            return ET.parse(fh).getroot()
    except KeyError:
        return None
    except ET.ParseError:
        return None


def parse_relationships(zf: zipfile.ZipFile, part_path: str) -> dict[str, dict[str, str]]:
    rels_root = load_xml_from_zip(zf, rels_path_for(part_path))
    if rels_root is None:
        return {}

    rels: dict[str, dict[str, str]] = {}
    for rel in rels_root.findall("rel:Relationship", NS):
        rel_id = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        rel_type = rel.attrib.get("Type")
        if not rel_id or not target or not rel_type:
            continue
        rels[rel_id] = {
            "type": rel_type,
            "target": normalize_part(target, part_path),
        }
    return rels


def emu_to_pixels(value: int) -> int:
    # PowerPoint uses 96 dpi; enough for summary output.
    return int(round(value / EMU_PER_INCH * 96))


def sanitize_filename(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return value.strip("._") or "asset"


def part_svg_filename(role: str, seq: int, part_path: str) -> str:
    stem = PurePosixPath(part_path).stem
    safe_stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_") or role
    return f"{role}_{seq:02d}_{safe_stem}.svg"


def slide_svg_filename(index: int) -> str:
    return f"slide_{index:02d}.svg"


def resolve_first_rel(
    rels: dict[str, dict[str, str]],
    rel_type: str,
) -> str | None:
    for rel in rels.values():
        if rel["type"] == rel_type:
            return rel["target"]
    return None


def parse_xfrm_record(sp: ET.Element) -> dict[str, int] | None:
    xfrm = sp.find("p:spPr/a:xfrm", NS)
    if xfrm is None:
        return None
    off = xfrm.find("a:off", NS)
    ext = xfrm.find("a:ext", NS)
    if off is None or ext is None:
        return None
    try:
        x = int(off.attrib.get("x", "0"))
        y = int(off.attrib.get("y", "0"))
        w = int(ext.attrib.get("cx", "0"))
        h = int(ext.attrib.get("cy", "0"))
    except ValueError:
        return None
    return {
        "x": emu_to_pixels(x),
        "y": emu_to_pixels(y),
        "width": emu_to_pixels(w),
        "height": emu_to_pixels(h),
    }


def extract_placeholders(root: ET.Element | None) -> list[dict[str, Any]]:
    if root is None:
        return []
    placeholders: list[dict[str, Any]] = []
    for sp in root.findall(".//p:sp", NS):
        ph = sp.find("p:nvSpPr/p:nvPr/p:ph", NS)
        if ph is None:
            continue
        record: dict[str, Any] = {
            "type": ph.attrib.get("type"),
            "idx": ph.attrib.get("idx"),
            "size": ph.attrib.get("sz"),
            "orient": ph.attrib.get("orient"),
            "geometry": parse_xfrm_record(sp),
            "textSamples": extract_text_samples(sp, limit=2),
        }
        style = extract_placeholder_text_style(sp)
        if style:
            record["textStyle"] = style
        placeholders.append(record)
    return placeholders


def extract_placeholder_text_style(sp: ET.Element) -> dict[str, Any]:
    style: dict[str, Any] = {}
    rpr = sp.find(".//a:rPr", NS) or sp.find(".//a:endParaRPr", NS)
    if rpr is None:
        return style
    if rpr.attrib.get("sz"):
        try:
            style["fontSizePx"] = round(int(rpr.attrib["sz"]) / 75, 2)
        except ValueError:
            pass
    if rpr.attrib.get("b") == "1":
        style["bold"] = True
    if rpr.attrib.get("i") == "1":
        style["italic"] = True
    latin = rpr.find("a:latin", NS)
    ea = rpr.find("a:ea", NS)
    if latin is not None and latin.attrib.get("typeface"):
        style["latinFont"] = latin.attrib["typeface"]
    if ea is not None and ea.attrib.get("typeface"):
        style["eastAsiaFont"] = ea.attrib["typeface"]
    color = rpr.find("a:solidFill/a:srgbClr", NS)
    if color is not None and color.attrib.get("val"):
        style["fill"] = f"#{color.attrib['val']}"
    return style


def extract_text_samples(root: ET.Element | None, limit: int = 6) -> list[str]:
    if root is None:
        return []
    samples: list[str] = []
    for node in root.findall(".//a:t", NS):
        text = (node.text or "").strip()
        if not text:
            continue
        samples.append(text)
        if len(samples) >= limit:
            break
    return samples


def extract_image_targets(root: ET.Element | None, rels: dict[str, dict[str, str]]) -> list[str]:
    if root is None:
        return []
    targets: list[str] = []
    seen: set[str] = set()
    for blip in root.findall(".//a:blip", NS):
        rel_id = blip.attrib.get(f"{{{NS['r']}}}embed")
        if not rel_id:
            continue
        rel = rels.get(rel_id)
        if not rel or rel["type"] != IMAGE_REL:
            continue
        target = rel["target"]
        if target in seen:
            continue
        seen.add(target)
        targets.append(target)
    return targets


def detect_background_asset(root: ET.Element | None, rels: dict[str, dict[str, str]]) -> str | None:
    if root is None:
        return None

    bg = root.find("p:cSld/p:bg", NS)
    if bg is None:
        bg = root.find("p:bg", NS)
    if bg is None:
        return None

    blip = bg.find(".//a:blip", NS)
    if blip is None:
        return None

    rel_id = blip.attrib.get(f"{{{NS['r']}}}embed")
    if not rel_id:
        return None
    rel = rels.get(rel_id)
    if not rel or rel["type"] != IMAGE_REL:
        return None
    return rel["target"]


def count_slide_shapes(root: ET.Element | None) -> int:
    if root is None:
        return 0
    sp_tree = root.find("p:cSld/p:spTree", NS)
    if sp_tree is None:
        return 0
    return len(list(sp_tree))


def classify_slide(index: int, total: int, texts: list[str], image_count: int, shape_count: int) -> str:
    joined = " ".join(texts).lower()
    if any(keyword in joined for keyword in THANKS_KEYWORDS):
        return "ending_candidate"
    if any(keyword in joined for keyword in TOC_KEYWORDS):
        return "toc_candidate"
    if any(keyword in joined for keyword in CHAPTER_KEYWORDS):
        return "chapter_candidate"
    if index == 1 and image_count <= 3:
        return "cover_candidate"
    if index == total and len(texts) <= 6:
        return "ending_candidate"
    if len(texts) <= 3 and shape_count <= 12:
        return "chapter_candidate"
    return "content_candidate"


def parse_theme(root: ET.Element | None) -> dict[str, Any]:
    if root is None:
        return {"colors": {}, "fonts": {}}

    colors: dict[str, str] = {}
    clr_scheme = root.find(".//a:clrScheme", NS)
    if clr_scheme is not None:
        for child in list(clr_scheme):
            if not isinstance(child.tag, str):
                continue
            name = child.tag.split("}", 1)[-1]
            srgb = child.find("a:srgbClr", NS)
            sys_clr = child.find("a:sysClr", NS)
            if srgb is not None and "val" in srgb.attrib:
                colors[name] = f"#{srgb.attrib['val']}"
            elif sys_clr is not None:
                last = sys_clr.attrib.get("lastClr")
                if last:
                    colors[name] = f"#{last}"

    fonts: dict[str, str] = {}
    font_scheme = root.find(".//a:fontScheme", NS)
    if font_scheme is not None:
        major = font_scheme.find("a:majorFont", NS)
        minor = font_scheme.find("a:minorFont", NS)
        if major is not None:
            latin = major.find("a:latin", NS)
            if latin is not None and latin.attrib.get("typeface"):
                fonts["majorLatin"] = latin.attrib["typeface"]
        if minor is not None:
            latin = minor.find("a:latin", NS)
            if latin is not None and latin.attrib.get("typeface"):
                fonts["minorLatin"] = latin.attrib["typeface"]
            ea = minor.find("a:ea", NS)
            if ea is not None and ea.attrib.get("typeface"):
                fonts["minorEastAsia"] = ea.attrib["typeface"]

    return {"colors": colors, "fonts": fonts}


def choose_common_assets(asset_usage: Counter[str]) -> list[str]:
    common = [asset for asset, count in asset_usage.items() if count > 1]
    return sorted(common)


def write_summary(output_path: Path, manifest: dict[str, Any]) -> None:
    """Render a short human digest derived from manifest.json.

    This intentionally stays terse: every fact already lives in manifest.json.
    The digest exists only so a reviewer can scan the workspace at a glance
    without parsing JSON.
    """
    source_name = manifest["source"]["name"]
    slide_size = manifest["slideSize"]
    theme = manifest["theme"]
    slides = manifest["slides"]
    layouts = manifest.get("layouts", [])
    masters = manifest.get("masters", [])
    common_assets = manifest["assets"]["commonAssets"]
    page_type_map = manifest.get("pageTypeCandidates", {})

    lines: list[str] = [
        f"# Template Import Summary — {source_name}",
        "",
        "All facts are stored in `manifest.json`; this digest is for quick scanning only.",
        "",
        "## Canvas",
        f"- Size: {slide_size['width_px']} × {slide_size['height_px']} px",
        f"- Theme colors: {', '.join(sorted(theme['colors'].keys())) or 'none detected'}",
        f"- Theme fonts: {', '.join(f'{k}={v}' for k, v in theme['fonts'].items()) or 'none detected'}",
        "",
        "## Inventory",
        f"- Slides: {len(slides)}",
        f"- Layouts (unique): {len(layouts)}",
        f"- Masters (unique): {len(masters)}",
        f"- Reusable assets (used by ≥2 parts): {len(common_assets)}",
        "",
        "## Page-Type Candidates",
    ]
    if page_type_map:
        for ptype, indexes in page_type_map.items():
            lines.append(f"- {ptype}: slides {', '.join(str(i) for i in indexes)}")
    else:
        lines.append("- (none classified)")

    lines.extend(["", "## Layout Reuse"])
    if layouts:
        for layout in layouts:
            users = layout.get("usedBySlides", [])
            users_str = ", ".join(str(i) for i in users) if users else "n/a"
            lines.append(f"- {layout['name']} → slides {users_str}")
    else:
        lines.append("- (none)")

    lines.extend(["", "## Master Reuse"])
    if masters:
        for master in masters:
            users = master.get("usedBySlides", [])
            users_str = ", ".join(str(i) for i in users) if users else "n/a"
            lines.append(f"- {master['name']} → slides {users_str}")
    else:
        lines.append("- (none)")

    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_manifest(pptx_path: Path, output_dir: Path) -> dict[str, Any]:
    with zipfile.ZipFile(pptx_path, "r") as zf:
        presentation_root = load_xml_from_zip(zf, "ppt/presentation.xml")
        if presentation_root is None:
            raise RuntimeError("Invalid PPTX: missing ppt/presentation.xml")

        slide_size = {"width_emu": 0, "height_emu": 0, "width_px": 0, "height_px": 0}
        sld_sz = presentation_root.find("p:sldSz", NS)
        if sld_sz is not None:
            width_emu = int(sld_sz.attrib.get("cx", "0"))
            height_emu = int(sld_sz.attrib.get("cy", "0"))
            slide_size = {
                "width_emu": width_emu,
                "height_emu": height_emu,
                "width_px": emu_to_pixels(width_emu),
                "height_px": emu_to_pixels(height_emu),
            }

        presentation_rels = parse_relationships(zf, "ppt/presentation.xml")
        slide_parts: list[str] = []
        for sld_id in presentation_root.findall("p:sldIdLst/p:sldId", NS):
            rel_id = sld_id.attrib.get(f"{{{NS['r']}}}id")
            rel = presentation_rels.get(rel_id or "")
            if rel and rel["type"] == SLIDE_REL:
                slide_parts.append(rel["target"])

        master_parts: list[str] = []
        for master_id in presentation_root.findall("p:sldMasterIdLst/p:sldMasterId", NS):
            rel_id = master_id.attrib.get(f"{{{NS['r']}}}id")
            rel = presentation_rels.get(rel_id or "")
            if rel and rel["type"] == MASTER_REL and rel["target"] not in master_parts:
                master_parts.append(rel["target"])

        master_roots: dict[str, ET.Element | None] = {}
        master_rels_map: dict[str, dict[str, dict[str, str]]] = {}
        master_theme_path: dict[str, str | None] = {}
        layout_parts: list[str] = []
        layout_parent: dict[str, str | None] = {}
        for master_path in master_parts:
            master_root = load_xml_from_zip(zf, master_path)
            master_rels = parse_relationships(zf, master_path)
            master_roots[master_path] = master_root
            master_rels_map[master_path] = master_rels
            master_theme_path[master_path] = resolve_first_rel(master_rels, THEME_REL)
            if master_root is None:
                continue
            for layout_id in master_root.findall("p:sldLayoutIdLst/p:sldLayoutId", NS):
                rel_id = layout_id.attrib.get(f"{{{NS['r']}}}id")
                rel = master_rels.get(rel_id or "")
                if not rel or rel["type"] != LAYOUT_REL:
                    continue
                layout_path = rel["target"]
                if layout_path not in layout_parent:
                    layout_parent[layout_path] = master_path
                    layout_parts.append(layout_path)

        asset_dir = output_dir / "assets"
        if asset_dir.exists():
            shutil.rmtree(asset_dir)
        asset_dir.mkdir(parents=True, exist_ok=True)

        copied_assets: dict[str, str] = {}
        for info in zf.infolist():
            if not info.filename.startswith("ppt/media/") or info.is_dir():
                continue
            original_name = PurePosixPath(info.filename).name
            safe_name = sanitize_filename(original_name)
            destination = asset_dir / safe_name
            stem = destination.stem
            suffix = destination.suffix
            counter = 2
            while destination.exists():
                destination = asset_dir / f"{stem}_{counter}{suffix}"
                counter += 1
            with zf.open(info.filename) as src, open(destination, "wb") as dst:
                shutil.copyfileobj(src, dst)
            copied_assets[info.filename] = destination.name

        slide_records: list[SlideRecord] = []
        asset_usage: Counter[str] = Counter()
        layout_usage: defaultdict[str, list[int]] = defaultdict(list)
        master_usage: defaultdict[str, list[int]] = defaultdict(list)
        layout_cache: dict[str, dict[str, Any]] = {}
        master_cache: dict[str, dict[str, Any]] = {}

        theme_summary = {"colors": {}, "fonts": {}}

        for index, slide_path in enumerate(slide_parts, 1):
            slide_root = load_xml_from_zip(zf, slide_path)
            slide_rels = parse_relationships(zf, slide_path)

            layout_path = None
            for rel in slide_rels.values():
                if rel["type"] == LAYOUT_REL:
                    layout_path = rel["target"]
                    break

            layout_root = load_xml_from_zip(zf, layout_path) if layout_path else None
            layout_rels = parse_relationships(zf, layout_path) if layout_path else {}

            master_path = None
            for rel in layout_rels.values():
                if rel["type"] == MASTER_REL:
                    master_path = rel["target"]
                    break

            master_root = load_xml_from_zip(zf, master_path) if master_path else None
            master_rels = parse_relationships(zf, master_path) if master_path else {}

            theme_path = None
            for rel in master_rels.values():
                if rel["type"] == THEME_REL:
                    theme_path = rel["target"]
                    break
            if theme_path and not theme_summary["colors"] and not theme_summary["fonts"]:
                theme_summary = parse_theme(load_xml_from_zip(zf, theme_path))

            bg_asset = None
            bg_source = None
            for label, root, rels in (
                ("slide", slide_root, slide_rels),
                ("layout", layout_root, layout_rels),
                ("master", master_root, master_rels),
            ):
                candidate = detect_background_asset(root, rels)
                if candidate:
                    bg_asset = candidate
                    bg_source = label
                    break

            image_targets = extract_image_targets(slide_root, slide_rels)
            texts = extract_text_samples(slide_root)
            shape_count = count_slide_shapes(slide_root)
            page_type = classify_slide(index, len(slide_parts), texts, len(image_targets), shape_count)

            resolved_bg = copied_assets.get(bg_asset, PurePosixPath(bg_asset).name if bg_asset else None)
            resolved_images = [
                copied_assets.get(target, PurePosixPath(target).name)
                for target in image_targets
            ]

            if resolved_bg:
                asset_usage[resolved_bg] += 1
            for asset_name in resolved_images:
                asset_usage[asset_name] += 1

            if layout_path:
                if layout_path not in layout_parent:
                    layout_parent[layout_path] = master_path
                    layout_parts.append(layout_path)
                layout_usage[layout_path].append(index)
                if layout_path not in layout_cache:
                    layout_cache[layout_path] = {
                        "root": layout_root,
                        "rels": layout_rels,
                        "master_path": master_path,
                    }
            if master_path:
                if master_path not in master_parts:
                    master_parts.append(master_path)
                    master_roots[master_path] = master_root
                    master_rels_map[master_path] = master_rels
                    master_theme_path[master_path] = theme_path
                master_usage[master_path].append(index)
                if master_path not in master_cache:
                    master_cache[master_path] = {
                        "root": master_root,
                        "rels": master_rels,
                        "theme_path": theme_path,
                    }

            slide_records.append(
                SlideRecord(
                    index=index,
                    name=PurePosixPath(slide_path).name,
                    slide_path=slide_path,
                    layout_path=layout_path,
                    master_path=master_path,
                    background_asset=resolved_bg,
                    background_source=bg_source,
                    image_assets=resolved_images,
                    text_samples=texts,
                    text_count=len(texts),
                    shape_count=shape_count,
                    page_type=page_type,
                    svg_file=slide_svg_filename(index),
                    flat_svg_file=slide_svg_filename(index),
                )
            )

        for layout_path in layout_parts:
            if layout_path in layout_cache:
                continue
            layout_root = load_xml_from_zip(zf, layout_path)
            layout_rels = parse_relationships(zf, layout_path)
            layout_cache[layout_path] = {
                "root": layout_root,
                "rels": layout_rels,
                "master_path": layout_parent.get(layout_path),
            }

        for master_path in master_parts:
            if master_path in master_cache:
                continue
            master_cache[master_path] = {
                "root": master_roots.get(master_path),
                "rels": master_rels_map.get(master_path, {}),
                "theme_path": master_theme_path.get(master_path),
            }

        page_type_map: dict[str, list[int]] = defaultdict(list)
        for slide in slide_records:
            page_type_map[slide.page_type].append(slide.index)

        layout_records = [
            summarize_part_record(
                part_path=layout_path,
                root=layout_cache[layout_path]["root"],
                rels=layout_cache[layout_path]["rels"],
                copied_assets=copied_assets,
                used_by_slides=layout_usage[layout_path],
                parent_path=layout_cache[layout_path]["master_path"],
                svg_file=part_svg_filename("layout", seq, layout_path),
            )
            for seq, layout_path in enumerate(layout_parts, start=1)
            if layout_path in layout_cache
        ]
        master_records = [
            summarize_part_record(
                part_path=master_path,
                root=master_cache[master_path]["root"],
                rels=master_cache[master_path]["rels"],
                copied_assets=copied_assets,
                used_by_slides=master_usage[master_path],
                theme_path=master_cache[master_path]["theme_path"],
                svg_file=part_svg_filename("master", seq, master_path),
                theme=parse_theme(load_xml_from_zip(zf, master_cache[master_path]["theme_path"]))
                if master_cache[master_path]["theme_path"] else {"colors": {}, "fonts": {}},
            )
            for seq, master_path in enumerate(master_parts, start=1)
            if master_path in master_cache
        ]
        layouts_top = [item for item in layout_records if item]
        masters_top = [item for item in master_records if item]

        layout_by_path = {item["path"]: item for item in layouts_top}
        master_by_path = {item["path"]: item for item in masters_top}
        asset_usage = Counter()
        for slide in slide_records:
            per_slide_assets: set[str] = set(slide.image_assets)
            if slide.background_asset:
                per_slide_assets.add(slide.background_asset)
            layout_record = layout_by_path.get(slide.layout_path or "")
            if layout_record:
                if layout_record.get("backgroundAsset"):
                    per_slide_assets.add(layout_record["backgroundAsset"])
                per_slide_assets.update(layout_record.get("imageAssets", []))
            master_record = master_by_path.get(slide.master_path or "")
            if master_record:
                if master_record.get("backgroundAsset"):
                    per_slide_assets.add(master_record["backgroundAsset"])
                per_slide_assets.update(master_record.get("imageAssets", []))
            for asset in per_slide_assets:
                if asset:
                    asset_usage[asset] += 1

        common_assets = choose_common_assets(asset_usage)
        if not theme_summary["colors"] and not theme_summary["fonts"] and masters_top:
            theme_summary = masters_top[0].get("theme") or {"colors": {}, "fonts": {}}

        manifest = {
            "source": {
                "pptx": str(pptx_path),
                "name": pptx_path.name,
            },
            "slideSize": slide_size,
            "theme": theme_summary,
            "assets": {
                "exportDir": "assets",
                "commonAssets": common_assets,
                "allAssets": sorted(copied_assets.values()),
                "assetMap": copied_assets,
            },
            "pageTypeCandidates": dict(sorted(page_type_map.items())),
            "layouts": layouts_top,
            "masters": masters_top,
            "slides": [
                {
                    "index": slide.index,
                    "name": slide.name,
                    "svgFile": slide.svg_file,
                    "flatSvgFile": slide.flat_svg_file,
                    "slidePath": slide.slide_path,
                    "layoutPath": slide.layout_path,
                    "masterPath": slide.master_path,
                    "backgroundAsset": slide.background_asset,
                    "backgroundSource": slide.background_source,
                    "imageAssets": slide.image_assets,
                    "textSamples": slide.text_samples,
                    "textCount": slide.text_count,
                    "shapeCount": slide.shape_count,
                    "pageType": slide.page_type,
                }
                for slide in slide_records
            ],
        }

        write_summary(output_dir / "summary.md", manifest)
        return manifest
