# Page Transitions & Per-Element Animations

PPT Master's exported PPTX supports **page transitions** (slide-to-slide) and **per-element entrance animations** (within a slide). Both are controlled by `svg_to_pptx.py` CLI flags and ship as real OOXML — they animate inside PowerPoint and Keynote, no embedded video.

## Defaults

| Layer | Default | Why |
|---|---|---|
| Page transition | `fade`, 0.4s | Calm baseline that suits most decks |
| Per-element animation | `mixed` effect + `after-previous` trigger, 0.4s duration + 0.5s stagger | Groups cascade in automatically on slide entry — zero interaction, with a measured pace for typical content decks |

To regenerate a deck with different settings, rerun `svg_to_pptx.py` against the same `svg_output/` (or `svg_final/`) — no need to rerun the LLM. To turn per-element animation off entirely, pass `-a none`.

## Page Transitions

```bash
# Pick a different effect
python3 skills/ppt-master/scripts/svg_to_pptx.py <project> -t push --transition-duration 0.6

# Disable
python3 skills/ppt-master/scripts/svg_to_pptx.py <project> -t none

# Auto-advance every 5 seconds (kiosk-style playback)
python3 skills/ppt-master/scripts/svg_to_pptx.py <project> --auto-advance 5
```

Available effects: `fade`, `push`, `wipe`, `split`, `strips`, `cover`, `random`.

Flags:

- `-t/--transition` — effect name, or `none` to disable. Default: `fade`.
- `--transition-duration` — seconds, default `0.4`.
- `--auto-advance` — seconds; omit for presenter-controlled advance.

## Per-Element Animations

Enabled by default (`mixed` effect + `after-previous` trigger). Three Start modes are available — these mirror PowerPoint's animation-pane "Start" dropdown:

- **`on-click`** — entering a slide → first click reveals the first semantic group; each subsequent click reveals the next group in z-order. Suits live presentations where the speaker paces reveals.
- **`with-previous`** — all groups start together on slide entry, playing their entrance animation in parallel. Stagger ignored.
- **`after-previous`** (default) — first group fires on slide entry, subsequent groups cascade after the previous one finishes, with `--animation-stagger` extra spacing. Suits kiosk playback, recorded walkthroughs, or anyone who wants visual flow without clicking.

```bash
# Default behavior (no flags needed): mixed effect + after-previous cascade
python3 skills/ppt-master/scripts/svg_to_pptx.py <project>

# Disable per-element animation entirely
python3 skills/ppt-master/scripts/svg_to_pptx.py <project> -a none

# Use a single effect (still cascades via the default after-previous trigger)
python3 skills/ppt-master/scripts/svg_to_pptx.py <project> --animation fade

# Switch to on-click for live presentations (presenter controls pacing)
python3 skills/ppt-master/scripts/svg_to_pptx.py <project> --animation-trigger on-click

# Custom pacing
python3 skills/ppt-master/scripts/svg_to_pptx.py <project> --animation mixed \
        --animation-stagger 0.7 --animation-duration 0.5

# All groups animate in unison on slide entry
python3 skills/ppt-master/scripts/svg_to_pptx.py <project> --animation-trigger with-previous
```

22 single effects: `appear`, `fade`, `fly`, `cut`, `zoom`, `wipe`, `split`, `blinds`, `checkerboard`, `dissolve`, `random_bars`, `peek`, `wheel`, `box`, `circle`, `diamond`, `plus`, `strips`, `wedge`, `stretch`, `expand`, `swivel`. Plus two auto-vary modes:

- `mixed` — deterministic. The first animated group on each slide uses `fade`; later groups cycle through a curated visible-effect pool across the deck.
- `random` — samples from the same pool.

The pool excludes `appear` because it has no visible motion.

Flags:

- `-a/--animation` — effect name, `mixed`, `random`, or `none`. Default: `mixed`.
- `--animation-trigger` — Start mode (matches PowerPoint): `on-click`, `with-previous`, or `after-previous` (default).
- `--animation-duration` — per-element entrance seconds, default `0.4`.
- `--animation-stagger` — gap between elements in `after-previous` mode (seconds, default `0.5`). Ignored otherwise.

## Anchor Logic — Top-Level `<g id="...">`

Per-element animations are anchored on **top-level `<g id="...">` content groups** in the SVG (e.g. `<g id="cover-title">`, `<g id="card-1">`). One group = one click reveal.

Aim for **3–8 content groups per slide**. This is also the granularity PowerPoint uses for group-select / group-move, so it improves editing ergonomics regardless of animation.

**Chrome groups skip the cascade automatically.** Top-level groups that look like page chrome (background, header/footer, decorations, watermark, page number) are excluded from the click sequence and appear together with the slide. Detection is done on the `id`: after splitting on `-` and `_`, if any token matches `background` / `bg` / `decoration` / `decorations` / `decor` / `header` / `footer` / `chrome` / `watermark` / `pagenumber` / `pagenum`, the group is treated as chrome. Examples that auto-skip: `<g id="background">`, `<g id="bg-texture">`, `<g id="cover-footer">`, `<g id="p03-header">`, `<g id="bottom-decor">`, `<g id="watermark">`. Examples that still animate: `<g id="card-1">`, `<g id="cover-title">`, `<g id="step-discover">`. Don't strip the `<g>` wrapper to avoid animation — keep it (PowerPoint group-select needs it) and just name it appropriately.

**Fallback for flat SVGs** (no top-level `<g>` wrappers, only raw `<rect>` / `<text>` / `<path>` at the root):

- ≤ 8 visible top-level primitives → each becomes one anchor (capped to avoid 70+ atom cascades on dense pages).
- > 8 → animation is skipped on that slide. The slide still renders, just without entrance animation.

Executors should wrap logical sections in `<g id>` regardless of whether you plan to animate. The Executor reference (`skills/ppt-master/references/shared-standards.md`) requires it.

## Limitations

- **Native shapes mode only.** Per-element animation needs editable shape anchors. `--only legacy` produces one image per slide and has no element granularity to animate; that mode is unaffected by `-a/--animation` and only honors `-t/--transition`.
- **Office version drift on element animations.** Effects use the `<p:animEffect filter=...>` path (vs. `presetID` lookup tables) to stay stable across Office versions. Most filters render identically in PowerPoint 2016+; older Office may downgrade some filters to plain Appear.
- **PNG fallback (compat mode) is for visual rendering only.** Transitions and animations live in the slide XML, not in the PNG, so disabling compat mode does not affect either layer.

## Quick Reference

| Goal | Command |
|---|---|
| Disable transitions | `-t none` |
| Change transition effect | `-t push` (or any from the list above) |
| Slower transition | `--transition-duration 0.8` |
| Auto-play | `--auto-advance 5` |
| Disable element animation | `-a none` |
| Switch to on-click trigger | `--animation-trigger on-click` |
| Use a single effect instead of mixed | `--animation fade` |
| All groups animate together | `--animation-trigger with-previous` |
| Slower per-element reveal | `--animation-duration 0.5` |
| Wider gap in after-previous | `--animation-stagger 0.7` |

See also: [`scripts/docs/svg-pipeline.md`](../scripts/docs/svg-pipeline.md) for the full `svg_to_pptx.py` reference.
