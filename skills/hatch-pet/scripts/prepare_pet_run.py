#!/usr/bin/env python3
"""Create a Codex pet run folder, prompts, and imagegen job manifest."""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from PIL import ImageDraw

ATLAS = {"columns": 8, "rows": 9, "cell_width": 192, "cell_height": 208}
ATLAS["width"] = ATLAS["columns"] * ATLAS["cell_width"]
ATLAS["height"] = ATLAS["rows"] * ATLAS["cell_height"]

ROWS = [
    ("idle", 0, 6, "neutral breathing/blinking loop"),
    ("running-right", 1, 8, "rightward locomotion loop"),
    ("running-left", 2, 8, "leftward locomotion loop"),
    ("waving", 3, 4, "greeting gesture with raised wave and return"),
    ("jumping", 4, 5, "anticipation, lift, peak, descent, settle"),
    ("failed", 5, 8, "sad, failed, or deflated reaction"),
    ("waiting", 6, 6, "patient waiting loop with small motion"),
    ("running", 7, 6, "generic in-place running loop"),
    ("review", 8, 6, "focused inspecting or review loop"),
]

TRANSPARENCY_ARTIFACT_RULES = [
    "Prefer pose, expression, and silhouette changes over decorative effects.",
    "Effects are allowed only when they are state-relevant, opaque, hard-edged, pixel-style, fully inside the same frame slot, and physically touching or overlapping the pet silhouette.",
    "Allowed attached effects can include a tear touching the face, a small smoke puff touching the pet or prop, or tiny stars overlapping the pet during a failed/dizzy reaction.",
    "Do not draw detached effects: floating stars, loose sparkles, floating punctuation, floating icons, falling tear drops, separated smoke clouds, loose dust, disconnected outline bits, or stray pixels.",
    "Do not draw wave marks, motion arcs, speed lines, action streaks, afterimages, blur, smears, halos, glows, auras, floor patches, cast shadows, contact shadows, drop shadows, oval floor shadows, landing marks, or impact bursts.",
    "Do not include text, labels, frame numbers, visible grids, guide marks, speech bubbles, thought bubbles, UI panels, code snippets, scenery, checkerboard transparency, white backgrounds, or black backgrounds.",
    "Do not use the chroma-key color or chroma-key-adjacent colors in the pet, prop, effects, highlights, shadows, or outlines.",
    "Reject any pose that is cropped, overlaps another pose, crosses into a neighboring frame slot, or creates a separate disconnected component that is not attached to the pet.",
]

STATE_REQUIREMENTS = {
    "waving": [
        "Show the greeting through paw pose only: paw down, paw raised, paw tilted, paw returning.",
        "Do not draw wave marks, motion arcs, lines, sparkles, symbols, or floating effects around the paw.",
    ],
    "jumping": [
        "Show the jump through pose and vertical body position only: anticipation, lift, airborne peak, descent, settle.",
        "Do not draw ground shadows, contact shadows, drop shadows, oval shadows, landing marks, dust, smears, bounce pads, or motion marks under the pet.",
        "Keep the background outside the pet perfectly flat chroma key with no darker key-colored patches.",
    ],
    "failed": [
        "Show failure through slumped pose, drooping ears/limbs, closed or sad eyes, and lower body position.",
        "Tears, small smoke puffs, or tiny stars are allowed only if attached to or overlapping the pet silhouette and kept inside the same frame slot.",
        "Do not draw red X marks, floating symbols, detached stars, separated smoke clouds, falling tear drops, dust, or other loose effects.",
    ],
    "review": [
        "Show review through lean, blink, narrowed eyes, head tilt, or paw position.",
        "Do not add magnifying glasses, papers, code, UI, punctuation, symbols, or other new props unless they already exist in the base pet identity.",
    ],
    "running-right": [
        "Show locomotion through body, limb, and prop movement only.",
        "Do not draw speed lines, dust clouds, floor shadows, motion trails, or detached motion effects.",
    ],
    "running-left": [
        "Show locomotion through body, limb, and prop movement only.",
        "Do not draw speed lines, dust clouds, floor shadows, motion trails, or detached motion effects.",
    ],
    "running": [
        "Show in-place running through body, limb, and prop movement only.",
        "Do not draw speed lines, dust clouds, floor shadows, motion trails, or detached motion effects.",
    ],
}

DIGITAL_PET_STYLE = (
    "Codex digital pet sprite style: pixel-art-adjacent low-resolution mascot sprite, "
    "compact chibi proportions, chunky whole-body silhouette, thick dark 1-2 px outline, "
    "visible stepped/pixel edges, limited palette, flat cel shading with at most one "
    "small highlight and one shadow step, simple readable face, tiny limbs, and no "
    "detail that disappears at 192x208. Avoid polished illustration, painterly "
    "rendering, anime key art, 3D render, vector app-icon polish, glossy lighting, "
    "soft gradients, realistic fur or material texture, anti-aliased high-detail "
    "edges, and complex tiny accessories."
)

CHROMA_KEY_CANDIDATES = [
    ("magenta", "#FF00FF"),
    ("cyan", "#00FFFF"),
    ("yellow", "#FFFF00"),
    ("blue", "#0000FF"),
    ("orange", "#FF7F00"),
    ("green", "#00FF00"),
]

DEFAULT_PET_NAME = "Sprout"
CANONICAL_BASE_PATH = "references/canonical-base.png"
LAYOUT_GUIDE_DIR = "references/layout-guides"
LAYOUT_GUIDE_SAFE_MARGIN_X = 18
LAYOUT_GUIDE_SAFE_MARGIN_Y = 16


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value.strip("-")


def display_from_slug(value: str) -> str:
    words = [word for word in re.split(r"[^a-zA-Z0-9]+", value.strip()) if word]
    return " ".join(word.capitalize() for word in words)


def concept_words(value: str) -> list[str]:
    stop_words = {
        "a",
        "an",
        "and",
        "app",
        "based",
        "codex",
        "compact",
        "digital",
        "for",
        "from",
        "in",
        "of",
        "on",
        "pet",
        "ready",
        "small",
        "the",
        "to",
        "with",
    }
    words = [
        word.lower()
        for word in re.findall(r"[a-zA-Z0-9]+", value)
        if word.lower() not in stop_words
    ]
    return words


def infer_name(args: argparse.Namespace, reference_paths: list[Path]) -> str:
    for raw_value in [args.display_name, args.pet_name]:
        value = raw_value.strip()
        if value:
            return value

    if args.pet_id.strip():
        display = display_from_slug(args.pet_id)
        if display:
            return display

    for raw_value in [args.pet_notes, args.description]:
        words = concept_words(raw_value)
        if words:
            return words[0].capitalize()

    for path in reference_paths:
        display = display_from_slug(path.stem)
        if display:
            return display

    return DEFAULT_PET_NAME


def sentence(value: str) -> str:
    value = " ".join(value.strip().split())
    if not value:
        return value
    if value[-1] not in ".!?":
        value += "."
    return value


def infer_description(args: argparse.Namespace, reference_paths: list[Path]) -> str:
    if args.description.strip():
        return sentence(args.description)
    if args.pet_notes.strip():
        return sentence(f"A compact Codex digital pet: {args.pet_notes}")
    if reference_paths:
        return "A compact Codex digital pet based on the provided reference image."
    return "A compact original Codex digital pet ready for animation."


def infer_pet_notes(args: argparse.Namespace, reference_paths: list[Path]) -> str:
    if args.pet_notes.strip():
        return args.pet_notes.strip()
    if args.description.strip():
        return args.description.strip().rstrip(".")
    if reference_paths:
        return "the pet shown in the reference image(s)"
    return "a compact original Codex digital pet"


def default_output_dir(pet_id: str) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return Path.cwd() / "output" / "hatch-pet" / f"{pet_id}-{timestamp}"


def rel(path: Path, root: Path) -> str:
    return str(path.resolve().relative_to(root.resolve()))


def image_metadata(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        return {
            "path": str(path),
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "format": image.format,
        }


def draw_dashed_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    *,
    fill: str,
    dash: int = 8,
    gap: int = 6,
) -> None:
    x1, y1 = start
    x2, y2 = end
    if x1 == x2:
        step = dash + gap
        for y in range(min(y1, y2), max(y1, y2), step):
            draw.line((x1, y, x2, min(y + dash, max(y1, y2))), fill=fill)
        return
    if y1 == y2:
        step = dash + gap
        for x in range(min(x1, x2), max(x1, x2), step):
            draw.line((x, y1, min(x + dash, max(x1, x2)), y2), fill=fill)
        return
    raise ValueError("draw_dashed_line only supports horizontal or vertical lines")


def create_layout_guide(path: Path, state: str, frames: int) -> dict[str, object]:
    width = frames * ATLAS["cell_width"]
    height = ATLAS["cell_height"]
    cell_width = ATLAS["cell_width"]
    image = Image.new("RGB", (width, height), "#f7f7f7")
    draw = ImageDraw.Draw(image)

    for index in range(frames):
        left = index * cell_width
        right = left + cell_width - 1
        draw.rectangle((left, 0, right, height - 1), outline="#111111", width=2)

        safe_left = left + LAYOUT_GUIDE_SAFE_MARGIN_X
        safe_top = LAYOUT_GUIDE_SAFE_MARGIN_Y
        safe_right = right - LAYOUT_GUIDE_SAFE_MARGIN_X
        safe_bottom = height - 1 - LAYOUT_GUIDE_SAFE_MARGIN_Y
        draw.rectangle(
            (safe_left, safe_top, safe_right, safe_bottom),
            outline="#2f80ed",
            width=2,
        )

        center_x = left + cell_width // 2
        center_y = height // 2
        draw_dashed_line(
            draw,
            (center_x, safe_top),
            (center_x, safe_bottom),
            fill="#b8b8b8",
        )
        draw_dashed_line(
            draw,
            (safe_left, center_y),
            (safe_right, center_y),
            fill="#b8b8b8",
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)
    return {
        "state": state,
        "path": str(path),
        "width": width,
        "height": height,
        "frames": frames,
        "cell_width": ATLAS["cell_width"],
        "cell_height": ATLAS["cell_height"],
        "safe_margin_x": LAYOUT_GUIDE_SAFE_MARGIN_X,
        "safe_margin_y": LAYOUT_GUIDE_SAFE_MARGIN_Y,
        "usage": "layout guide input only; do not copy visible guide lines into generated sprite strips",
    }


def create_layout_guides(run_dir: Path) -> list[dict[str, object]]:
    guide_dir = run_dir / LAYOUT_GUIDE_DIR
    return [
        create_layout_guide(guide_dir / f"{state}.png", state, frames)
        for state, _row, frames, _purpose in ROWS
    ]


def parse_hex_color(value: str) -> tuple[int, int, int]:
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise SystemExit(f"invalid chroma key color: {value}; expected #RRGGBB")
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"


def color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def sampled_reference_pixels(paths: list[Path]) -> list[tuple[int, int, int]]:
    pixels: list[tuple[int, int, int]] = []
    for path in paths:
        with Image.open(path) as opened:
            image = opened.convert("RGBA")
            image.thumbnail((128, 128), Image.Resampling.LANCZOS)
            data = image.tobytes()
            for index in range(0, len(data), 4):
                red, green, blue, alpha = data[index : index + 4]
                if alpha <= 16:
                    continue
                pixels.append((red, green, blue))

    non_background = [
        pixel
        for pixel in pixels
        if not (pixel[0] > 244 and pixel[1] > 244 and pixel[2] > 244)
    ]
    return non_background or pixels


def choose_chroma_key(reference_paths: list[Path], requested: str) -> dict[str, object]:
    if requested.lower() != "auto":
        rgb = parse_hex_color(requested)
        return {
            "hex": rgb_to_hex(rgb),
            "rgb": list(rgb),
            "name": "user-selected",
            "selection": "manual",
        }

    pixels = sampled_reference_pixels(reference_paths)
    if not pixels:
        rgb = parse_hex_color("#FF00FF")
        return {
            "hex": "#FF00FF",
            "rgb": list(rgb),
            "name": "magenta",
            "selection": "fallback",
        }

    scored: list[tuple[float, int, str, tuple[int, int, int]]] = []
    for preference_index, (name, hex_color) in enumerate(CHROMA_KEY_CANDIDATES):
        rgb = parse_hex_color(hex_color)
        distances = sorted(color_distance(rgb, pixel) for pixel in pixels)
        percentile_index = max(0, min(len(distances) - 1, int(len(distances) * 0.01)))
        scored.append((distances[percentile_index], -preference_index, name, rgb))

    score, _preference, name, rgb = max(scored)
    return {
        "hex": rgb_to_hex(rgb),
        "rgb": list(rgb),
        "name": name,
        "selection": "auto",
        "score": round(score, 2),
    }


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def resolved_style_notes(raw_style_notes: str) -> str:
    raw_style_notes = raw_style_notes.strip()
    if not raw_style_notes:
        return DIGITAL_PET_STYLE
    return f"{DIGITAL_PET_STYLE} Additional user style notes: {raw_style_notes}."


def base_pet_prompt(args: argparse.Namespace) -> str:
    pet_notes = args.pet_notes or "the pet shown in the reference image(s)"
    style_notes = resolved_style_notes(args.style_notes)
    chroma_key = args.chroma_key["hex"]
    chroma_name = args.chroma_key["name"]
    return f"""Create a single clean reference sprite for a Codex app digital pet named {args.display_name}.

Pet: {pet_notes}.
Style contract: {style_notes}

Use this prompt as an authoritative sprite-production spec. Do not expand it into a polished illustration, painterly character image, anime key art, 3D render, vector mascot, glossy app icon, realistic animal portrait, or marketing artwork.

Output one centered full-body pet sprite pose only, on a perfectly flat pure {chroma_name} {chroma_key} chroma-key background. The pet must be fully visible, readable as a tiny digital pet, and suitable for animation into a 192x208 sprite cell. Do not include scenery, text, labels, borders, checkerboard transparency, detached effects, shadows, glows, or extra props not present in the reference unless explicitly requested. Do not use {chroma_key}, pure {chroma_name}, or colors close to that chroma key in the pet, prop, highlights, or effects."""


def row_prompt(
    args: argparse.Namespace, state: str, row: int, frames: int, purpose: str
) -> str:
    pet_notes = args.pet_notes or "the same pet from the approved base reference"
    style_notes = resolved_style_notes(args.style_notes)
    chroma_key = args.chroma_key["hex"]
    chroma_name = args.chroma_key["name"]
    state_requirements = STATE_REQUIREMENTS.get(state, [])
    state_requirement_text = ""
    if state_requirements:
        state_requirement_text = "\n\nState-specific requirements:\n" + "\n".join(
            f"- {requirement}" for requirement in state_requirements
        )
    transparency_artifact_text = "\n".join(
        f"- {requirement}" for requirement in TRANSPARENCY_ARTIFACT_RULES
    )
    return f"""Create a single horizontal sprite strip for the Codex app digital pet `{args.pet_id}` in the state `{state}`.

Use the attached reference image(s) for pet identity and the attached base pet image as the canonical design. Use the attached layout guide image only for frame count, slot spacing, centering, and safe padding. Simplify any high-resolution reference details into the Codex digital pet sprite style. Do not simply copy the still reference pose. Generate distinct animation poses that create a readable cycle.

Identity lock:
- Do not redesign the pet. Only change pose/action for the `{state}` animation.
- Preserve the exact head shape, ear/horn/limb shape, face design, markings, palette, outline weight, body proportions, prop design, and overall silhouette from the canonical base pet.
- Keep every frame recognizably the same individual pet, not a related variant.
- If the pet has a prop or accessory, preserve its size, side, palette, and attachment style unless the row action requires a small pose-only adjustment.
- Prefer a subtler animation over any change that mutates the pet identity.

Output exactly {frames} separate animation frames arranged left-to-right in one single row. Each frame must show the same pet: {pet_notes}.

Style contract: {style_notes}

Use this prompt as an authoritative sprite-production spec. Do not expand it into a polished illustration, painterly character image, anime key art, 3D render, vector mascot, glossy app icon, realistic animal portrait, or marketing artwork.

Animation action: {purpose}.
{state_requirement_text}

Transparency and artifact rules:
{transparency_artifact_text}

Layout requirements:
- Exactly {frames} full-body frames, left to right, in one horizontal row.
- The attached layout guide shows the {frames} frame boxes and inner safe area for this row. Follow its slot count, spacing, centering, and padding.
- Do not reproduce the layout guide itself: no visible boxes, guide lines, center marks, labels, guide colors, or guide background may appear in the output.
- Treat the image as {frames} equal-width invisible frame slots. Fill every slot: each requested slot must contain exactly one complete full-body pose.
- Spread the {frames} poses evenly across the whole image width. Do not leave any requested slot blank or create large empty gaps between poses.
- Center one complete pose in each slot. No pose may cross into the neighboring slot.
- Use a perfectly flat pure {chroma_name} {chroma_key} chroma-key background across the whole image.
- Do not draw visible grid lines, borders, labels, numbers, text, watermarks, or checkerboard transparency.
- Do not include scenery or a background environment.
- Keep the rendering sprite-like: chunky silhouette, dark pixel-style outline, limited palette, flat shading, minimal tiny detail.
- Do not use {chroma_key}, pure {chroma_name}, or colors close to that chroma key in the pet, props, highlights, shadows, motion marks, dust, landing marks, or effects.
- Do not draw shadows, glows, smears, dust, or landing marks using darker/lighter versions of the chroma-key color.
- Keep every frame self-contained with safe padding. No pet body part should be clipped by the frame slot.
- Avoid motion blur. Use clear pose changes readable at 192x208.
- Preserve the same silhouette, face, proportions, palette, material, and props across every frame."""


def make_jobs(
    run_dir: Path, copied_refs: list[dict[str, object]]
) -> list[dict[str, object]]:
    reference_inputs = [
        {"path": rel(Path(str(ref["copied_path"])), run_dir), "role": "pet reference"}
        for ref in copied_refs
    ]
    identity_reference_paths = [CANONICAL_BASE_PATH, "decoded/base.png"]
    jobs: list[dict[str, object]] = [
        {
            "id": "base",
            "kind": "base-pet",
            "status": "pending",
            "prompt_file": "prompts/base-pet.md",
            "input_images": reference_inputs,
            "output_path": "decoded/base.png",
            "depends_on": [],
            "generation_skill": "$imagegen",
            "requires_grounded_generation": bool(reference_inputs),
            "allow_prompt_only_generation": not reference_inputs,
            "recording_owner": "parent",
        }
    ]
    for state, _row, frames, _purpose in ROWS:
        depends_on = ["base"]
        extra_inputs: list[dict[str, str]] = []
        mirror_policy: dict[str, object] = {}
        if state == "running-left":
            depends_on.append("running-right")
            extra_inputs.append(
                {
                    "path": "decoded/running-right.png",
                    "role": "rightward gait reference for leftward row decision",
                }
            )
            mirror_policy = {
                "may_derive_from": "running-right",
                "derivation": "horizontal-mirror",
                "requires_explicit_approval": True,
                "fallback_generation_skill": "$imagegen",
            }
        jobs.append(
            {
                "id": state,
                "kind": "row-strip",
                "status": "pending",
                "prompt_file": f"prompts/rows/{state}.md",
                "input_images": [
                    *reference_inputs,
                    {
                        "path": f"{LAYOUT_GUIDE_DIR}/{state}.png",
                        "role": f"layout guide for {frames} frame slots; use for spacing only, do not copy guide lines",
                    },
                    {
                        "path": CANONICAL_BASE_PATH,
                        "role": "canonical identity reference",
                    },
                    {"path": "decoded/base.png", "role": "approved base pet"},
                    *extra_inputs,
                ],
                "output_path": f"decoded/{state}.png",
                "depends_on": depends_on,
                "generation_skill": "$imagegen",
                "requires_grounded_generation": True,
                "allow_prompt_only_generation": False,
                "identity_reference_paths": identity_reference_paths,
                "parallelizable_after": depends_on,
                "mirror_policy": mirror_policy,
                "recording_owner": "parent",
            }
        )
    return jobs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pet-name",
        default="",
        help="User-facing pet name. Ask the user for this when practical; otherwise choose a short appropriate name.",
    )
    parser.add_argument(
        "--pet-id",
        default="",
        help="Stable pet folder/id slug. Defaults to the slugified pet name.",
    )
    parser.add_argument(
        "--display-name",
        default="",
        help="Display label. Defaults to the pet name.",
    )
    parser.add_argument("--description", default="")
    parser.add_argument("--reference", action="append", default=[])
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--pet-notes", default="")
    parser.add_argument("--style-notes", default="")
    parser.add_argument(
        "--chroma-key",
        default="auto",
        help="Chroma key as #RRGGBB, or auto to choose a safe key from reference colors.",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    raw_reference_paths = [
        Path(raw_path).expanduser().resolve() for raw_path in args.reference
    ]

    args.display_name = infer_name(args, raw_reference_paths)
    args.pet_name = (args.pet_name or args.display_name).strip()
    args.description = infer_description(args, raw_reference_paths)
    args.pet_notes = infer_pet_notes(args, raw_reference_paths)
    args.pet_id = slugify(args.pet_id or args.pet_name or args.display_name)
    if not args.pet_id:
        raise SystemExit("pet id must contain at least one letter or digit")

    run_dir = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else default_output_dir(args.pet_id).resolve()
    )
    if run_dir.exists() and any(run_dir.iterdir()) and not args.force:
        raise SystemExit(
            f"{run_dir} already exists and is not empty; pass --force to reuse it"
        )
    run_dir.mkdir(parents=True, exist_ok=True)

    ref_dir = run_dir / "references"
    prompt_dir = run_dir / "prompts"
    row_prompt_dir = prompt_dir / "rows"
    for directory in [
        ref_dir,
        prompt_dir,
        row_prompt_dir,
        run_dir / "decoded",
        run_dir / "qa",
    ]:
        directory.mkdir(parents=True, exist_ok=True)

    copied_refs: list[dict[str, object]] = []
    copied_ref_paths: list[Path] = []
    for index, source in enumerate(raw_reference_paths, start=1):
        if not source.is_file():
            raise SystemExit(f"reference not found: {source}")
        suffix = source.suffix.lower() or ".png"
        copied = ref_dir / f"reference-{index:02d}{suffix}"
        shutil.copy2(source, copied)
        meta = image_metadata(copied)
        meta["source_path"] = str(source)
        meta["copied_path"] = str(copied)
        copied_refs.append(meta)
        copied_ref_paths.append(copied)

    args.chroma_key = choose_chroma_key(copied_ref_paths, args.chroma_key)
    layout_guides = create_layout_guides(run_dir)

    request = {
        "pet_id": args.pet_id,
        "display_name": args.display_name,
        "description": args.description,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "atlas": ATLAS,
        "rows": [
            {"state": state, "row": row, "frames": frames, "purpose": purpose}
            for state, row, frames, purpose in ROWS
        ],
        "layout_guides": [
            {**guide, "path": rel(Path(str(guide["path"])), run_dir)}
            for guide in layout_guides
        ],
        "references": copied_refs,
        "chroma_key": args.chroma_key,
        "pet_notes": args.pet_notes,
        "style_notes": args.style_notes,
        "house_style": DIGITAL_PET_STYLE,
        "primary_generation_skill": "$imagegen",
    }
    (run_dir / "pet_request.json").write_text(
        json.dumps(request, indent=2) + "\n", encoding="utf-8"
    )

    write_text(prompt_dir / "base-pet.md", base_pet_prompt(args))
    for state, row, frames, purpose in ROWS:
        write_text(
            row_prompt_dir / f"{state}.md",
            row_prompt(args, state, row, frames, purpose),
        )

    jobs = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "run_dir": str(run_dir),
        "primary_generation_skill": "$imagegen",
        "jobs": make_jobs(run_dir, copied_refs),
    }
    (run_dir / "imagegen-jobs.json").write_text(
        json.dumps(jobs, indent=2) + "\n", encoding="utf-8"
    )

    print(
        json.dumps(
            {
                "ok": True,
                "run_dir": str(run_dir),
                "request": str(run_dir / "pet_request.json"),
                "jobs": str(run_dir / "imagegen-jobs.json"),
                "ready_jobs": ["base"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
