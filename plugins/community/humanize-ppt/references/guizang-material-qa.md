# Guizang Material QA

> **v0.6.4 caveat:** these rules apply to the rendered HTML, not to the
> Humanize PPT production brief. The brief tells the next agent to follow
> `guizang-ppt-skill/SKILL.md`; the material QA is then run by the downstream
> skill or by Humanize's `--qa-from` loop against the rendered output
> (`references/qa-failure-modes.md`). Humanize does not produce or
> post-process the rendered HTML. See
> `docs/versions/v0.6.4-guizang-production-brief-orchestrator.md`.

Use this reference when Humanize PPT routes a deck to `guizang-ppt-skill`, especially for Chinese Swiss-style decks that need inserted diagrams, screenshots, generated images, or Remotion clips.

## Position

Humanize PPT remains the outline director and route owner. Guizang is the downstream renderer for stable Chinese HTML PPT production. Material generation is a separate pass after the first guizang deck exists.

Recommended route:

```text
raw material
→ Humanize PPT AST contract
→ guizang-ppt-skill HTML deck
→ material production pass
→ visual QA pass
→ presenter/export/deploy
```

Do not describe a guizang deck as complete just because `index.html` exists. A produced deck needs visual QA after materials are inserted.

## Material Selection

Choose materials by page need:

- If a page feels empty, first decide what is missing: proof, process, system relationship, comparison, screenshot evidence, or emotional anchor.
- Use Remotion for short timed process clips, transition fragments, before/after motion, or explanatory sequences.
- Use deterministic SVG/HTML diagrams for Chinese text-heavy information graphics, exact labels, Swiss grid alignment, and content that must be inspectable.
- Use GPT image generation for non-textual photos, mood images, visual metaphors, or concept art where exact text is not critical.
- Use screenshot framing when preserving a real UI or source image matters more than redesigning it.

Remotion, GPT images, and SVG diagrams are materials inside PPT pages. They should not replace the page with an empty embedded player or duplicate the page title.

## Guizang Swiss QA Checklist

Before reporting completion, check:

1. `guizang-ppt-skill` validator passes for Swiss decks.
2. Every slide has a registered `data-layout`.
3. Referenced class names exist in the copied template CSS. Do not trust layout docs alone; verify the actual template.
4. No page has unresolved placeholders such as `[必填]`.
5. Text inside inserted SVG/image/video frames has its own safe area and does not clip, overlap, or hug the edge.
6. Inserted materials do not repeat the outer PPT title. The page owns the title; the material should carry the diagram, process, proof, or evidence.
7. Long Chinese labels are either shortened, split into lines, or moved into HTML text outside the image.
8. Video slots have a purpose, duration, source path, and fallback explanation in the manifest.
9. The final `material_manifest.json` records all generated or inserted assets.
10. The downstream route is reflected in `router_plan.json` / `run_manifest.json` when the workflow is being packaged as a Humanize PPT run.

## Failure Patterns

### Undefined layout classes

If a page uses a class from a reference document but the copied template CSS does not define it, the page may collapse into plain vertical text. Fix by switching to classes verified in the actual template, such as `grid-6`, `card-fill`, `card-accent`, `sub-card`, or the registered Sxx skeleton.

### Text clipped inside SVG

SVG text can look correct in isolation but clip once scaled into a deck frame. Increase the containing rectangle, reduce text size, move baselines inward, and keep connector lines away from labels.

### Material repeats the slide title

If the outer slide title says the concept, the inserted SVG or Remotion clip should not repeat the same large title. Keep only metadata, process nodes, diagrams, or proof inside the material.

### Over-empty statement pages

Swiss whitespace is useful, but a statement page can look unfinished when it carries only one sentence and no structural anchor. Add a compact right-side stack, comparison, or supporting proof when the slide needs to be taught rather than merely declared.

### Image generation with Chinese text

GPT image generation can be useful for visual concepts, but exact Chinese labels are fragile. Prefer SVG/HTML for Chinese system diagrams, flow charts, and QA-sensitive labels. Use GPT images for non-textual visual support unless the user explicitly accepts text risk.

## Manifest Pattern

For materialized guizang runs, write a small manifest:

```json
{
  "source_workflow": "Humanize PPT AST contract -> guizang-ppt-skill deck -> material production pass",
  "style": "Swiss Internationalism / IKB",
  "assets": [
    {
      "slide": 3,
      "file": "ppt/videos/03-entry-loop.mp4",
      "type": "remotion-process-video",
      "slot": "remotion-entry-loop-16x9",
      "purpose": "Explain the entry loop without repeating the slide title"
    },
    {
      "slide": 6,
      "file": "ppt/images/06-context-system.svg",
      "type": "deterministic-svg-diagram",
      "slot": "s14-context-21x9",
      "purpose": "Show how project/task/personal context enters Hermes"
    }
  ]
}
```

Keep generated run artifacts out of the public repo unless they are curated demo assets.
