# Humanize PPT

Public preview docs. The current public preview shows the tuned Skill sharing deck plus the stable Chinese and English Hermes Agent Mastery routes.

- Showcase: `showcase/skill-share/`
- Codex Guizang black-white showcase: `showcase/codex-guizang-black-white/`
- Hermes Agent Mastery presenter: `showcase/hermes-agent-mastery/presenter/`
- Hermes Agent Mastery PPT: `showcase/hermes-agent-mastery/ppt/`
- Hermes Agent Mastery English presenter: `showcase/hermes-agent-mastery/en/presenter/`
- Hermes Agent Mastery English PPT: `showcase/hermes-agent-mastery/en/ppt/`
- PPT Master native Chinese Showcase: `showcase/ppt-master-native/zh/`
- PPT Master native English Showcase: `showcase/ppt-master-native/en/`
- Routes: Chinese HTML uses `guizang-ppt-skill`; English HTML uses `beautiful-html-templates / frontend-slides`; native editable PPTX in both languages uses `ppt-master`.

## Full annotated reference index

Moved from `SKILL.md` (which keeps only the runtime-critical shortlist).

### Core contracts & specs

- `../references/guizang-production-brief-orchestrator.md` — v0.6.4 canonical brief specification. The human + agent-facing contract for what `<renderer>-production-prompt.md` must contain and what it must not contain.
- `../SPEC.md` — engine technical specification: boundary, CLI surface (mode-check order), data flow, output contract, the v0.9 style gallery, the presentation checkup, the per-page media model, and the renderer registry. The authoritative "what the engine does and guarantees" reference.
- `../references/qa-failure-modes.md` (+ English mirror `../references/qa-failure-modes.en.md`) — failure mode catalog for the presentation checkup (演讲体检): a renderer-agnostic failure-class layer plus guizang-specific modes, each with what the audience would see. Human-readable; the code-side source of truth is `FAILURE_MODES` in `../scripts/humanize_ppt_v2.py`. Includes the WebGL-hero static-screenshot capture trap as a "static scan can't catch yet" class.
- `../references/style-gallery-spec.md` — v0.9 spec for the `--style-gallery` cover-style gate: candidates, cover-only commands, the zero-dependency picker, re-injection, and the WebGL screenshot warning.
- `../references/renderer-guidance.md` — per-renderer recommended paths (Chinese / English / native PPTX) and the known-good checkpoint rules.
- `../references/renderer-verification.md` — per-renderer verification evidence behind the SKILL.md frontmatter one-liners.

### Renderer adapters & evidence

- `../adapters/ppt-master-bridge-notes.md` — native PPTX route boundary, semantic/media/notes mapping, raw-template routing, and OOXML checkup contract.
- `showcase/ppt-master-native/verification-2026-07-10.md` — real PPT Master export and Humanize PPTX checkup evidence.
- `showcase/ppt-master-native/verification-2026-07-14.md` — paired Chinese/English PPT Master exports, rendered previews, native-editability evidence, and Humanize checkup results.
- `../references/guizang-material-qa.md` — Guizang downstream workflow, material production rules, Swiss visual QA checklist, and failure patterns learned from a full Humanize PPT → guizang deck pass. **Caveat:** these rules apply to the rendered HTML, not to the Humanize brief.
- `../references/guizang-presenter-deploy.md` — Default Chinese PPT production path: guizang stable deck, material QA, presenter shell, and static deploy checks. **Caveat:** these rules apply to the rendered HTML, not to the Humanize brief.
- `../references/beautiful-preview-first-adapter.md` — Durable adapter pattern for connecting `beautiful-html-templates`: version boundary, template selection, real title-slide previews, manifests, QA, and pitfalls. (Historical; v0.6.4 hands template selection to the downstream skill.)
- `../references/selected-template-full-deck-adapter.md` — Durable adapter pattern for V0.4 selected-template full deck generation: required artifacts, routing, QA, and TDD coverage. (Historical.)
- `../references/presenter-export-adapter.md` — Durable adapter pattern for adding V0.5-style presenter shell and export package after a final deck exists. (Historical; v0.6.4 hands presenter/export to the downstream skill.)

### Helper scripts

- `../scripts/preview_outline_html.py` — outline preview: renders the audience state-transfer map (one zero-dependency single-file HTML; per-slide enter-state → intent → leave-state rows plus a state-arc summary) from `slide_plan.json`. Real sample: `../examples/04-preview-outline-ai-tool-update/`.
- `../scripts/record_demo_gif.py` — records the style gallery + outline preview (the two zero-dependency working drafts) into one demo GIF (requires playwright + ffmpeg). The gallery covers are downstream-rendered; `--covers-dir` overlays real covers before recording.
- `smoke-test.md` — No-dependency smoke check for validating the stable entrypoint on machines without pytest.

### Positioning & packaging

- `../references/agent-teams-public-preview.md` — Agent Teams architecture, specialist-agent command protocol, public preview release loop, and README split convention. (Historical; v0.6.4 collapses the Agent Teams model into a brief + QA loop.)
- `../references/humanize-ppt-public-writing.md` — Public-facing positioning and article/script patterns: Humanize PPT as brief orchestrator, not a fixed 4-Skill bundle.
- `../references/workbuddy-team-packaging-and-video-materials.md` — WorkBuddy/CodeBuddy team upload zip structure, validation script, scenario rules shape, and the Remotion/HyperFrames-as-material-producers pitfall.

### Version notes

- `versions/v1.1.0-ppt-master.md` — release notes for native PPTX routing, raw-template fill, and OOXML checkup.
- `versions/v0.9.0-style-gallery.md` — the cover-style gallery gate, the WebGL static-screenshot failure class, the English failure-mode mirror, SPEC.md, and the README/GIF-slot work.
- `versions/v0.8.0-presentation-checkup.md` — why the QA loop was renamed to presentation checkup, the hot-pluggable route framing, the plain-language usage rewrite, and the verified English checkup run.
- `versions/v0.7.0-render-qa-inspector.md` — why the positioning moved to render-QA inspector, English-path support levels, and the outline preview artifact.
- `versions/v0.6.4-guizang-production-brief-orchestrator.md` — what changed, lessons, boundaries, known-good checkpoint, QA loop cap.
- `versions/v0.6.3-english-style-gallery.md` — theme-first gate, five visible style candidates, and selected-style continuation.
- `versions/v0.6.2-guizang-presenter-deploy.md` — Chinese default path, `postMessage` presenter shell, and public static showcase.
- `versions/v0.6.1-guizang-material-qa.md` — downstream artifact recording, Remotion-as-material, SVG-safe Chinese diagrams, and visual review rules.
- `versions/v0.5-presenter-export-adapter.md` — `--presenter-adapter`, `--export-adapter`, output artifacts, and boundaries.
- `versions/v0.4-selected-template-full-deck.md` — `--selected-template`, selected deck output, manifests, QA, and current boundaries.
- `versions/v0.2-router-edition.md` through `versions/v0.6.3-english-style-gallery.md` — historical version notes, kept for context.
- `plans/2026-05-25-release-readiness-checklist.md` — V0.6 release-readiness checklist and release-note draft.
