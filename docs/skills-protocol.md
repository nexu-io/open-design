# Skills Protocol

**Parent:** [`spec.md`](spec.md)
**Siblings:** [`architecture.md`](architecture.md), [`agent-adapters.md`](agent-adapters.md), [`modes.md`](modes.md)

Open Design skills are portable design-generation recipes. A skill packages
trigger phrases, workflow instructions, optional assets, and optional reference
material so the app can route a brief to the right production flow.

## 1. Skill Folder Shape

```text
skill-name/
  SKILL.md
  assets/
  references/
```

- `SKILL.md` is the manifest and workflow instruction file.
- `assets/` contains templates, images, boilerplate, and other files the skill
  can copy into a generated artifact.
- `references/` contains supporting guidance such as layouts, components,
  themes, and quality checklists.

## 2. Manifest

Each `SKILL.md` starts with YAML front matter:

```yaml
---
name: magazine-web-ppt
description: |
  Create an editorial web-based slide deck with magazine typography,
  horizontal navigation, and export-friendly HTML.
triggers:
  - "deck"
  - "presentation"
  - "slides"
od:
  mode: deck
  platform: desktop
  scenario: presentation
  preview:
    type: html
    entry: assets/template.html
  design_system:
    requires: false
---
```

The body is free-form Markdown that describes the workflow the agent should
follow. Numbered steps, constraints, quality checks, and output contracts are
preferred.

## 3. Required Fields

- `name`: stable slug used by the registry.
- `description`: concise explanation of what the skill produces.
- `triggers`: short English phrases that indicate when to use the skill.
- `od.mode`: broad output type such as `prototype`, `deck`, `design-system`, or
  `document`.
- `od.preview.type`: `html`, `jsx`, `markdown`, or another preview adapter.

## 4. Optional Fields

- `od.platform`: `desktop`, `mobile`, `web`, `print`, or similar.
- `od.scenario`: broad job category such as `marketing`, `operations`, or
  `presentation`.
- `od.featured`: numeric ranking for featured skills.
- `od.upstream`: source repository or inspiration link.
- `od.preview.entry`: file to open for preview.
- `od.design_system.requires`: whether a `DESIGN.md` context is required.
- `od.design_system.sections`: design-system sections the skill expects.
- `example_prompt`: a sample English prompt for the launcher UI.

## 5. Registry Behavior

The registry reads every `SKILL.md`, normalizes its manifest, and exposes the
skill to the launcher. If an `od:` block is missing, the app can infer basic
defaults from the body and assets:

- HTML assets imply `preview.type: html`.
- Deck, slide, and presentation language imply `mode: deck`.
- Single-page app or prototype language implies `mode: prototype`.
- Missing design-system metadata defaults to `requires: false`.

## 6. Routing

Routing should prefer explicit user intent over fuzzy matching. The router uses:

1. Exact workflow selection from the UI.
2. Trigger phrases in `SKILL.md`.
3. Semantic fit between the brief and the skill description.
4. Optional scenario or platform filters.

When multiple skills match, show the best few choices instead of silently
guessing.

## 7. Design-System Injection

Skills that need a visual system can consume the active `DESIGN.md` in two
ways:

1. The app injects the design-system text into the agent context.
2. The file is available in the working directory for direct reading.

Skills should use the supplied colors, typography, spacing, component rules, and
layout conventions instead of inventing unrelated styling.

## 8. Install Commands

Future CLI shape:

```bash
od skills install https://github.com/example/magazine-web-ppt
od skills link ./skills/magazine-web-ppt
od skills list
od skills remove magazine-web-ppt
```

Install should copy or link the skill, update the registry, and make it
available to all configured agent adapters.

## 9. Worked Example

When `magazine-web-ppt` is installed:

1. The registry indexes `SKILL.md`.
2. The launcher shows it as a deck workflow.
3. The user chooses the skill and writes an English brief.
4. The agent reads the workflow, copies `assets/template.html`, fills the deck,
   and checks it against the skill's references.
5. The preview adapter opens the generated HTML.
6. Export can print to PDF or convert slide pages into PPTX when a structured
   slide manifest is available.

## 10. Minimal Skill Example

```text
landing-page/
  SKILL.md
  assets/
    base.html
```

`SKILL.md`:

```yaml
---
name: landing-page
description: Create a focused product landing page.
triggers:
  - "landing page"
  - "homepage"
  - "product page"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  preview:
    type: html
    entry: assets/base.html
---
```

The workflow should clarify the offer, audience, proof, CTA, and visual tone;
then produce a complete HTML artifact with responsive states and a self-check.

## 11. Skill Quality Checklist

- Trigger phrases are English-only and specific.
- The workflow produces a concrete artifact, not just advice.
- Required assets exist and open correctly.
- The output contract is clear.
- Design-system requirements are declared.
- The skill includes self-checks for layout, accessibility, and responsive
  behavior.
- Example prompts are realistic and professional.
