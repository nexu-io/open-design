# Guizang Production Brief Orchestrator (v0.6.4)

This is the canonical contract for the Guizang production brief. It is
the human + agent-facing specification of what `guizang-production-prompt.md`
must contain and what it must not contain. v0.6.4 makes this the entire
deliverable of Humanize PPT for the Chinese PPT path.

## The boundary

```
Humanize PPT  ──→  guizang-production-prompt.md  ──→  guizang-ppt-skill (renders natively)
                          │
                          └── Humanize does NOT open, copy, or post-process
                              the rendered HTML. The downstream skill owns
                              the rendered output end-to-end.
```

What Humanize owns:

- AST outline (`deck_brief.md`, `ast_outline.md`, `slide_plan.json`)
- Per-page media decision (`slide_plan.json.media`, `asset_manifest.md`, `video_slots.json`)
- Speaker intent semantic source (`speaker_intent.md`)
- The production brief (`guizang-production-prompt.md`)
- The post-render QA loop (`--qa-from` mode, see `references/qa-failure-modes.md`)

What Humanize does NOT own:

- The rendered HTML — that is `guizang-ppt-skill`'s.
- Layout / template / animation internals — those are `guizang-ppt-skill`'s.
- Speaker notes, presenter shell, deploy — those are `guizang-ppt-skill`'s.
- Visual style decisions beyond what `style_brief.md` records.

## Why this boundary

Every previous "adapter" attempt at Humanize (V0.1–V0.6.3) tried to imitate
guizang's renderer: copy the template, inject `<!-- SLIDES_HERE -->`,
add a `postMessage` bridge, render a fake `outputs/guizang/index.html`.
This broke every time Guizang's template changed:

- `function go(n)` renamed or removed
- `[必填] 替换为 PPT 标题 · Deck Title` wording changed
- `data-anim` field added or repurposed
- WebGL hero background needed `.slide.hero.light { background: transparent }`
- New layout IDs registered

The fix is to not imitate. v0.6.4 emits a brief and stops. When Guizang
updates, the brief writer needs zero changes; only the next agent's
behavior changes.

## The brief contract — what `guizang-production-prompt.md` must contain

The brief writer in `scripts/humanize_ppt_v2.py` (function
`write_guizang_production_brief`) guarantees the following sections.
Do not remove or rename them; the next agent reads by section.

1. **Top-of-file quote block** — explicit hand-off: Humanize stops here,
   the next agent must follow `guizang-ppt-skill/SKILL.md`, no template
   reimplementation, no post-process.
2. **Deck** — title, source path, language, style (A or B), slide count.
3. **Style files** — concrete paths into the installed guizang skill
   (e.g. `assets/template.html` for Style A,
   `assets/template-swiss.html` for Style B). The next agent must use
   exactly these, not invent new ones.
4. **Hard rules** — read `SKILL.md` first, pick layouts from the
   registered set, preserve animation hooks, run the validator, do not
   post-process in Humanize.
5. **Inputs already produced by Humanize** — the list of files the next
   agent can read directly (deck_brief.md, ast_outline.md, slide_plan.json,
   speaker_intent.md, asset_manifest.md, video_slots.json, style_brief.md).
6. **Per-page media decisions (Humanize-owned)** — derived from
   `slide_plan.json.media`, rendered as a one-line-per-slide list. The
   downstream skill produces the actual materials in its own format.
7. **Known-good checkpoint (read-only reference)** — pointer to
   `examples/03-codex-guizang-native-ink-classic/index.html` so the
   next agent knows what "Style A quality" looks like.
8. **Style N QA gates** — per-style pass conditions. Style A gates
   include `canvas#bg-dark`, `canvas#bg-light`, `body.low-power` off,
   `.slide.hero.light,.slide.hero.dark { background: transparent }`,
   `data-anim` / `data-animate` marker count. Style B gates include
   the Swiss validator exit code, Sxx marker count, registered set
   check, no invented IDs.
9. **Hand-off** — the next agent writes its output to its own convention
   (e.g. `outputs/guizang-rendered/index.html`). Do NOT write to
   `outputs/guizang/` — that path is reserved for legacy Humanize
   adapter code that no longer exists in v0.6.4.

## What the brief must NOT contain

- Guizang template internals (e.g. `<!-- SLIDES_HERE -->` markers,
  `function go(n)` assumptions, `[必填] 替换为 PPT 标题 · Deck Title`
  text). The next agent substitutes these via the downstream skill's
  own substitution pass.
- Humanize-owned `postMessage` bridges or `?slide=` URL parameters.
  The next agent emits the downstream skill's own navigation.
- Layout class definitions invented by Humanize. The next agent picks
  from `references/layouts.md` (Style A) or `references/layouts-swiss.md`
  (Style B) — registered sets only.

## How the QA loop uses the brief

After the downstream skill renders, run:

```bash
python3 scripts/humanize_ppt.py \
  --qa-from <rendered.html> \
  --out <same out dir as the brief run> \
  --renderer guizang \
  --guizang-style <A or B> \
  --max-qa-iterations 3
```

The QA loop reads `slide_plan.json` from the same out dir, scans the
rendered HTML against the failure modes in `references/qa-failure-modes.md`,
and writes `qa_report.md` + `fix_prompt.md` + `qa_iteration.json`.

The fix prompt is what the next agent (running the downstream skill)
reads to re-render. It is a downstream-skill-actionable list, not a
Humanize-side patch. The downstream skill applies the fix; Humanize
verifies the next iteration.

After 3 iterations with remaining fail findings, the loop flips to
`needs-human`. The next call short-circuits with a stderr message
until a human re-renders the deck and clears the loop.

## See also

- `references/qa-failure-modes.md` — the failure mode catalog the QA loop scans for.
- `docs/versions/v0.6.4-guizang-production-brief-orchestrator.md` — v0.6.4 release notes.
- `examples/03-codex-guizang-native-ink-classic/index.html` — the verified known-good Style A sample.
