# Skills Protocol

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`agent-adapters.md`](agent-adapters.md) · [`modes.md`](modes.md)

A **Skill** is the atomic unit of design capability in OD. We adopt Claude Code's `SKILL.md` convention verbatim as the base format, then add optional fields for design-specific features (preview type, input schema, slider parameters). A skill written for plain Claude Code runs in OD. An OD skill that doesn't use our extensions runs in plain Claude Code.

> **Compatibility promise:** A skill like [`guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) works in OD **without modification**. It just drops into `~/.claude/skills/` and OD discovers it.

---

## 1. Base format (unchanged from Claude Code)

Every skill is a directory containing at minimum a `SKILL.md`:

```
<skill-root>/
├── SKILL.md              # manifest + workflow instructions
├── assets/               # templates, images, boilerplate the skill writes
│   └── …
└── references/           # knowledge files the skill reads during planning
    ├── components.md
    ├── layouts.md
    └── …
```

`SKILL.md` front-matter (YAML):

```yaml
---
name: magazine-web-ppt
description: |
  Magazine-style horizontal-swipe web deck.
  Trigger keywords: 杂志风 PPT, magazine deck, swipe slides.
triggers:
  - "magazine deck"
  - "杂志风 PPT"
  - "horizontal swipe presentation"
---
```

Body is free-form Markdown that describes the workflow the agent should follow — typically a numbered step list plus principles. This is what [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) does.

**OD reads all of this as-is.** No changes required.

## 2. OD extensions (optional)

Skills can declare additional front-matter fields to unlock OD-specific UI. All fields are optional; absent fields fall back to sensible defaults.

```yaml
---
name: magazine-web-ppt
description: …
triggers: […]

# --- OD extensions below this line ---

od:
  mode: deck                        # one of: prototype | deck | template | design-system
  preview:
    type: html                      # html | jsx | pptx | markdown
    entry: index.html               # relative path produced by the skill
    reload: debounce-100            # how the preview refreshes
  design_system:
    requires: true                  # this skill reads the active DESIGN.md
    sections: [color, typography]   # which sections it actually uses (for prompt pruning)
  craft:                            # universal, brand-agnostic craft references
    requires: [typography, color, anti-ai-slop]
  inputs:                           # typed inputs the user can fill in the UI
    - name: title
      type: string
      required: true
    - name: slide_count
      type: integer
      default: 8
      min: 4
      max: 20
    - name: theme
      type: enum
      values: [editorial, minimal, brutalist, dark-glass, warm]
      default: editorial
  parameters:                       # live-tweakable sliders after first generation
    - name: accent_hue
      type: hue                     # hue | spacing | font-scale | opacity
      default: 18
      range: [0, 360]
    - name: section_spacing
      type: spacing
      default: 48
      range: [16, 128]
  outputs:
    primary: index.html
    secondary: [slides.json]        # for PPTX export
  capabilities_required:
    - surgical_edit                 # comment mode needs this
    - file_write
---
```

### 2.1 What OD uses each field for

| Field | Used by |
|---|---|
| `od.mode` | routing (which mode picker the skill shows up under) |
| `od.preview.type` | picking the right iframe renderer |
| `od.design_system.requires` | whether to inject `DESIGN.md` |
| `od.design_system.sections` | pruning the injected DESIGN.md to relevant sections only (token savings) |
| `od.craft.requires` | which brand-agnostic `craft/<slug>.md` references to inject (e.g. `typography`, `color`, `anti-ai-slop`); injected between DESIGN.md and the skill body |
| `od.inputs` | rendering a typed form in the sidebar instead of only free-text |
| `od.parameters` | rendering live sliders that re-prompt on change |
| `od.outputs.primary` | which file the iframe loads |
| `od.outputs.secondary` | which files export pipelines read (e.g. `slides.json` for PPTX) |
| `od.capabilities_required` | gating: if the active agent lacks surgical edit, comment mode is disabled for this skill |

### 2.2 If a skill omits `od:` entirely

Defaults:
- `mode`: inferred from name/description (best-effort keyword match) or "prototype"
- `preview.type`: sniff for `*.html` → html, `*.jsx` → jsx, else "markdown"
- `preview.entry`: first file matching the sniffed type
- `design_system.requires`: true if the skill body mentions "design system" or "DESIGN.md"
- `inputs`, `parameters`: none (free-text prompt only)

The goal: **zero-config compatibility** for existing Claude Code skills.

## 3. Skill discovery & precedence

The daemon's skill registry scans three locations:

| Location | Priority | Purpose |
|---|---|---|
| `./.claude/skills/` | 1 (highest) | project-private skills, not committed |
| `./skills/` | 2 | project-committed skills |
| `~/.claude/skills/` | 3 | user-global skills |

Conflicts by `name` resolve to the higher-priority version. All locations are watched with `chokidar` in dev and re-scanned on `SIGHUP` in production.

### Symlink strategy (borrowed from [cc-switch](https://github.com/farion1231/cc-switch))

`cc-switch` maintains a central skill dir at `~/.cc-switch/skills/` and symlinks it into each agent's expected location (`~/.claude/skills/`, `~/.codex/skills/`, etc.). OD can opt into the same model:

```
~/.open-design/skills/
    magazine-web-ppt/      (canonical location)
~/.claude/skills/
    magazine-web-ppt → ~/.open-design/skills/magazine-web-ppt
~/.codex/skills/
    magazine-web-ppt → ~/.open-design/skills/magazine-web-ppt
```

One install → every agent sees the skill. This is optional; users who only use one agent don't need it.

## 4. Skill types (by mode)

Each mode expects a slightly different skill shape. The required outputs and expected workflow differ.

### 4.1 `prototype-skill`

- **Purpose:** single-screen interactive prototype.
- **Preview:** `html` or `jsx`.
- **Primary output:** `index.html` or `Prototype.jsx`.
- **Typical workflow:** clarify brief → resolve design tokens → write component tree → write file.
- **Example skills:** `saas-landing`, `dashboard`, `login-flow`, `empty-states`.

### 4.2 `deck-skill`

- **Purpose:** multi-slide presentation.
- **Preview:** `html` (single-file deck with in-page navigation).
- **Primary output:** `index.html`.
- **Secondary output:** `slides.json` (for PPTX export).
- **Typical workflow:** clarify topic + slide count → pick theme → populate slides from layout catalog → self-check against quality rubric.
- **Reference implementation:** [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) — fork this for v1.

### 4.3 `template-skill`

- **Purpose:** start from a pre-built artifact; agent only personalizes content, doesn't design from scratch.
- **Preview:** inherits from the template bundle (`html` typically).
- **Primary output:** a populated copy of the template.
- **Typical workflow:** copy `assets/template/` to artifact dir → replace content placeholders → optionally tweak tokens to match design system.
- **Why separate from `prototype-skill`:** much faster (no design decisions), higher-quality floor, worse ceiling.

### 4.4 `design-system-skill`

- **Purpose:** produce a `DESIGN.md` from inputs (brand brief, screenshot, URL).
- **Preview:** `markdown` (render the resulting DESIGN.md with a sample-components preview).
- **Primary output:** `DESIGN.md`.
- **Typical workflow:** analyze input → draft 9 sections per awesome-claude-design schema → generate sample component preview → finalize.
- **Post-run:** OD prompts the user to set this DESIGN.md as the project's active design system.

## 5. The DESIGN.md as skill context

Every non–design-system skill (modes 1–3) can consume the active `DESIGN.md`. OD injects it as:

1. **System-prompt prefix** (required sections only, per `od.design_system.sections`).
2. **File available in CWD** named `DESIGN.md` — skills can `Read` it directly via their agent.
3. **Template variable** `{{ design_system }}` if the skill body references it in Mustache-style.

The 9-section DESIGN.md format is **not invented by OD**; it's the [awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design) convention, reproduced here for convenience:

```markdown
# <Brand Name>

## Visual Theme & Atmosphere
## Color Palette & Roles
## Typography Rules
## Component Stylings
## Layout Principles
## Depth & Elevation
## Do's and Don'ts
## Responsive Behavior
## Agent Prompt Guide
```

Full schema and examples: [`schemas/design-system.md`](schemas/design-system.md) and [`examples/DESIGN.sample.md`](examples/DESIGN.sample.md) (TODO).

## 5.5 Craft references (`craft/`)

Some craft knowledge is **universal** — true regardless of brand. ALL CAPS always needs ≥0.06em letter-spacing; `var(--accent)` should appear at most 2 times per screen; `#6366f1` is always the AI-default tell. These rules don't belong in any one `DESIGN.md` because they apply across every brand.

OD ships these as a third axis at `<projectRoot>/craft/`:

```
craft/
├── README.md
├── typography.md
├── color.md
└── anti-ai-slop.md
```

A skill opts in by listing the slugs it needs:

```yaml
od:
  craft:
    requires: [typography, color, anti-ai-slop]
```

Resolution at compose time:

1. `apps/daemon/src/skills.ts` reads `od.craft.requires` from front-matter and surfaces it on the skill record.
2. `apps/daemon/src/craft.ts` reads each `<slug>.md` from `CRAFT_DIR`. Missing files are dropped silently — a skill can forward-reference `craft/motion.md` before we ship it. See [`craft/README.md`](../craft/README.md) for the canonical slug list and the rationale behind the silent-fallback choice.
3. `apps/daemon/src/prompts/system.ts` injects the concatenated craft body **between** the active DESIGN.md and the skill body. Brand tokens in DESIGN.md win on conflict; craft rules cover everything DESIGN.md does not override.

The split keeps DESIGN.md authors free of universal-craft duplication and keeps craft authors free of brand-specific drift.

## 6. Skill installation

```sh
od skill add https://github.com/op7418/guizang-ppt-skill
# → clones into ~/.open-design/skills/magazine-web-ppt
# → symlinks into ~/.claude/skills/ (and any other active agent dirs)
# → re-indexes registry

od skill add ./path/to/my-skill
# → symlinks local dir (no copy) into skills registry

od skill list
# → table: name, mode, source, agent compatibility

od skill remove <name>
# → unlinks; does not delete the source
```

## 7. Worked example — running `guizang-ppt-skill` under OD

The skill is unchanged. Here's the full path:

1. User: `od skill add https://github.com/op7418/guizang-ppt-skill`
2. Registry indexes it. No `od:` block in front-matter → defaults applied:
   - `mode`: inferred from body mentioning "PPT" → `deck`.
   - `preview.type`: sniffed from `assets/template.html` → `html`.
   - `preview.entry`: `index.html` (convention).
   - `design_system.requires`: false (skill body doesn't mention DESIGN.md).
3. User switches to `deck` mode in the web UI; skill appears in the skill picker.
4. User types "给我做一份杂志风 8 页投资人 PPT".
5. Daemon dispatches to active agent (Claude Code) with:
   - system message: skill's `SKILL.md` body
   - cwd: `./.od/artifacts/2026-04-24-pitch-deck/`
   - files already placed in cwd: `template.html` (from skill's `assets/`)
6. Agent runs its 6-step workflow (clarify → copy template → populate → self-check → preview → refine).
7. OD streams the agent's tool calls as UI events; artifact dir grows.
8. Agent signals done; daemon sets preview iframe to `index.html`.
9. User clicks "Export PPTX" — export pipeline notices the skill has no `slides.json` output (the upstream skill doesn't produce one). OD falls back to "print to PDF then page-to-slide PPTX," which is uglier but works. This is a known limitation documented per-skill.

## 8. Writing a new skill — minimal example

```
saas-landing-skill/
├── SKILL.md
└── assets/
    └── base.html
```

```markdown
---
name: saas-landing
description: |
  Produce a single-page SaaS landing with hero, features, social proof, pricing, CTA.
  Trigger: "saas landing", "marketing page", "product landing".
triggers:
  - "saas landing"
  - "marketing page"
od:
  mode: prototype
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  inputs:
    - name: product_name
      type: string
      required: true
    - name: tagline
      type: string
      required: true
    - name: has_pricing
      type: boolean
      default: true
  parameters:
    - name: hero_density
      type: spacing
      default: 96
      range: [48, 200]
---

# Workflow

1. Read DESIGN.md from cwd. Adopt its color/typography/layout rules.
2. Copy `assets/base.html` to `index.html` in cwd.
3. Fill sections: hero, features (3–6), social proof, pricing (if `has_pricing`), CTA, footer.
4. Inline all CSS. Use system font stack as fallback if DESIGN.md typography fails to load.
5. Respect `hero_density` parameter as the hero section's vertical padding in px.
6. Write `index.html`. Done.
```

## 9. Testing skills

A skill ships with optional test inputs that OD uses for CI:

```
<skill-root>/
└── tests/
    ├── basic.prompt
    ├── basic.expected.manifest.json   # assertions: files produced, preview.type, etc.
    └── basic.expected.regex.txt       # text regex assertions against the primary output
```

`od skill test <name>` runs the skill against each case using a cheap model (e.g. Haiku 4.5) and asserts on the manifest + regex. Low-fidelity but catches structural regressions.

## 10. Open questions

- **Skill signing.** Can we verify a skill hasn't been tampered with between publish and install? Simplest answer: `od skill add` records the git commit SHA; reinstall-on-update warns on signature change. Deferred to v1.
- **Skill composition.** Can a `prototype-skill` call a `deck-skill` for a sub-artifact? Not in v1; skills are leaf-level. Composition would require a meta-skill concept, which is speculative.
- **Parameter stability.** When sliders change, should the agent re-plan or just re-render? Lean: re-render (fast path), with an "also re-plan" button for larger changes.
