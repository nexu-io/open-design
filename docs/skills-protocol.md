# Skills Protocol

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`skills-contributing.md`](skills-contributing.md) · [`architecture.md`](architecture.md) · [`agent-adapters.md`](agent-adapters.md) · [`modes.md`](modes.md)

> Want to ship a skill upstream rather than read the protocol spec? See [`skills-contributing.md`](skills-contributing.md) — quick start, merge bar, PR template, common rejections. This file is the **what** (frontmatter grammar, discovery rules, mode semantics); that file is the **how** (clone to merged PR).

A **Skill** is an atomic functional capability in OD. A **design template** is a rendering-catalogue entry. Both use Claude Code's `SKILL.md` convention as their portable instruction format and may add `od:` metadata, but they have different ownership and APIs: functional skills live in `skills/` and `/api/skills`; rendering templates live in `design-templates/` and `/api/design-templates`.

> **Compatibility promise:** A bundle that contains `SKILL.md` remains readable by agents that support the Agent Skills format. Installation and catalogue placement are separate concerns: the bundled guizang integration is maintained under `design-templates/guizang-ppt/`, while external distribution normally uses the plugin system.

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
zh_name: "杂志风网页 PPT"
en_name: "Magazine Web PPT"
description: |
  Magazine-style horizontal-swipe web deck.
  Trigger keywords: 杂志风 PPT, magazine deck, swipe slides.
zh_description: "杂志风横向翻页网页 PPT。"
en_description: |
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
  mode: deck                        # prototype | deck | template | design-system | image | video | audio
  surface: web                      # web | image | video | audio
  scenario: marketing               # gallery/filter hint
  category: presentations           # free-form lowercase filter slug
  preview:
    type: html                      # registry preview hint
  example_prompt: "Create a magazine-style web deck from my content."
  example_prompt_i18n:
    zh-CN: "用杂志风网页 PPT 模板把我的内容做成横向翻页 deck。"
  design_system:
    requires: true                  # compose the complete active design-system context
  craft:                            # universal, brand-agnostic craft references
    requires: [typography, color, anti-ai-slop]
  critique:
    policy: opt-in                  # required | opt-in | opt-out
---
```

### 2.1 What OD uses each field for

| Field | Used by |
|---|---|
| `zh_name` / `en_name` | localized picker title; falls back to `name` |
| `zh_description` / `en_description` | localized picker description; falls back to `description` |
| `od.mode` | registry classification and creation-surface filtering |
| `od.surface` | web/image/video/audio surface filtering; defaults from media mode or to `web` |
| `od.platform` | optional desktop/mobile gallery hint |
| `od.scenario` / `od.category` | scenario and category filter hints |
| `od.preview.type` | picking the right iframe renderer |
| `od.example_prompt` | English fallback starter prompt used by picker CTA |
| `od.example_prompt_i18n` | localized starter prompt map (for example `zh-CN`) |
| `od.design_system.requires` | whether to compose the active design-system package into the prompt |
| `od.craft.requires` | which brand-agnostic `craft/<slug>.md` references to inject between design-system context and the skill body |
| `od.default_for`, `od.featured` | creation defaults and gallery ordering hints |
| `od.fidelity`, `od.speaker_notes`, `od.animations` | optional fast-create defaults for matching template kinds |
| `od.critique.policy` | per-skill Critique Theater override (`required`, `opt-in`, or `opt-out`) |

Older bundles may also carry fields such as `od.inputs`, `od.parameters`,
`od.outputs`, or `od.capabilities_required`. The skill registry preserves the
portable `SKILL.md` body but does not use those fields to render forms, sliders,
choose output files, or gate an agent. The Agent-Skill-to-plugin adapter can
translate or retain some of that metadata; plugin behavior is specified in
[`plugins-spec.md`](plugins-spec.md), not by this registry protocol.

### 2.2 If a skill omits `od:` entirely

Defaults:
- `mode`: inferred from description and body, falling back to `prototype`
- `surface`: the media mode for image/video/audio entries, otherwise `web`
- `preview.type`: `html`
- `design_system.requires`: `true`; author `false` explicitly for bundles that
  must not receive brand context
- `example_prompt`: the first sentence of `description`, capped for the picker
- `scenario`: inferred from description/body, falling back to `general`

The goal: **zero-config compatibility** for existing Claude Code skills.

## 3. Skill discovery & precedence

The daemon keeps functional skills and rendering templates in separate
registries:

| Registry | Roots, highest priority first | API |
|---|---|---|
| Functional skills | user-managed skills, then bundled `skills/` | `/api/skills` |
| Design templates | user-managed templates, then bundled `design-templates/` | `/api/design-templates` |

The user-managed roots derive from the resolved daemon data root; this file
intentionally does not restate a concrete path. A duplicate frontmatter `name`
in the first root shadows the bundled entry without deleting it. Each listing
request rescans its roots, so local changes appear without a watcher, `SIGHUP`,
or daemon restart. Chat-time lookup spans both registries so projects saved
against a design-template id continue to compose its instructions.

### Runtime resource staging

Open Design does not distribute an active bundle by symlinking it into every
agent's global configuration. Before a project run, the daemon makes a real
copy of every active skill/template with side files under the project's
`.od-skills/` alias. The prompt preamble advertises that CWD-relative copy and
an absolute fallback. This keeps references and assets reachable across
agents, including filesystems where symlink or cross-device rename semantics
differ. A local library installation may itself be represented by a managed
link, but that storage detail is separate from per-run staging.

## 4. Registry modes

The daemon normalizes `od.mode` to one of seven values. These values classify both functional skills and design-template bundles; they are not the same thing as the six New Project tabs described in [`modes.md`](modes.md).

### 4.1 `prototype`

- **Purpose:** single-screen interactive prototype.
- **Preview:** `html` or `jsx`.
- **Primary output:** `index.html` or `Prototype.jsx`.
- **Typical workflow:** clarify brief → resolve design tokens → write component tree → write file.
- **Example templates:** interface and responsive-flow bundles under `design-templates/`.

### 4.2 `deck`

- **Purpose:** multi-slide presentation.
- **Preview:** `html` (single-file deck with in-page navigation).
- **Primary output:** `index.html`.
- **Secondary output:** `slides.json` (for PPTX export).
- **Typical workflow:** clarify topic + slide count → pick theme → populate slides from layout catalog → self-check against quality rubric.
- **Reference implementation:** the bundled [`design-templates/guizang-ppt/`](../design-templates/guizang-ppt/) integration.

### 4.3 `template`

- **Purpose:** start from a pre-built artifact; agent only personalizes content, doesn't design from scratch.
- **Preview:** inherits from the template bundle (`html` typically).
- **Primary output:** a populated copy of the template.
- **Typical workflow:** copy `assets/template/` to artifact dir → replace content placeholders → optionally tweak tokens to match design system.
- **Why separate from `prototype`:** it starts from a pre-built shape rather than a blank artifact.

### 4.4 `design-system`

- **Purpose:** classify a functional workflow that creates, extracts, audits,
  or transforms design-system material.
- **Output:** defined by the skill. A portable workflow may emit only
  `DESIGN.md`; current Open Design import/create flows build a package with
  `manifest.json`, `DESIGN.md`, `tokens.css`, and optional rich resources.
- **Schema:** no fixed nine headings. Repository packages require substantive
  coverage and keep prose synchronized with the token contract; see
  [`design-systems/README.md`](../design-systems/README.md).

### 4.5 `image`, `video`, and `audio`

- **Purpose:** classify media-generation instruction bundles for the Media creation surface.
- **Surface:** defaults to the matching media kind unless `od.surface` overrides it.
- **Inputs:** provider/model controls and media-specific metadata are owned by the Media UI and shared contracts.
- **Design system:** media bundles normally opt out because prompt templates, rather than interface tokens, drive these provider-backed generations.

## 5. The DESIGN.md as skill context

Any bundle may declare whether it consumes the active design system. Interface,
deck, and template bundles commonly opt in; media bundles commonly opt out.
When enabled, the daemon composes the available package material directly into
the system prompt, in this order:

1. package-specific `USAGE.md` guidance (or the default usage contract);
2. the complete `DESIGN.md` body;
3. import-mode guidance, when declared;
4. `tokens.css`;
5. a compact component manifest, or `components.html` when no manifest can be
   produced;
6. a manifest-derived index of rich files that the agent may pull on demand;
7. craft references; then
8. the active skill/template body.

Design systems are not copied into the run CWD, section-pruned through
`od.design_system.sections`, or substituted through a
`{{ design_system }}` variable. Missing rich files preserve compatibility with
legacy `DESIGN.md`-only folders. The historical nine-heading upstream sample
remains useful as an interoperability example at
[`docs/examples/DESIGN.sample.md`](examples/DESIGN.sample.md), but it is not
the current repository package schema.

## 5.5 Craft references (`craft/`)

Some craft knowledge is **universal** — true regardless of brand. ALL CAPS always needs ≥0.06em letter-spacing; `var(--accent)` should appear at most 2 times per screen; `#6366f1` is always the AI-default tell. These rules don't belong in any one `DESIGN.md` because they apply across every brand.

OD ships these as a separate packaged resource tree:

```
craft/
├── README.md
├── accessibility-baseline.md
├── animation-discipline.md
├── anti-ai-slop.md
├── color.md
├── form-validation.md
├── laws-of-ux.md
├── rtl-and-bidi.md
├── state-coverage.md
├── typography.md
├── typography-hierarchy.md
└── typography-hierarchy-editorial.md
```

A skill opts in by listing the slugs it needs:

```yaml
od:
  craft:
    requires: [typography, color, anti-ai-slop]
```

Resolution at compose time:

1. `apps/daemon/src/skills.ts` reads `od.craft.requires` from front-matter and surfaces it on the skill record.
2. `apps/daemon/src/craft.ts` reads each `<slug>.md` from `CRAFT_DIR`. Runtime
   loading remains tolerant of absent files for compatibility.
3. `apps/daemon/src/prompts/system.ts` injects the concatenated craft body **between** the active DESIGN.md and the skill body. Brand tokens in DESIGN.md win on conflict; craft rules cover everything DESIGN.md does not override.

Repository authoring is stricter than runtime loading: `pnpm lint:craft` and
`pnpm guard` reject invalid or unresolved references unless the slug is
explicitly listed in `craft/FUTURE_SECTIONS.md`. See
[`craft/README.md`](../craft/README.md) for the canonical list.

The split keeps DESIGN.md authors free of universal-craft duplication and keeps craft authors free of brand-specific drift.

## 6. Skill inspection and distribution

```sh
od skills list
# → id and display label for entries returned by /api/skills

od skills show <id>
# → the daemon's JSON representation of one skill
```

The current `od skills` surface is read-only; it does not ship `add` or
`remove` subcommands. Installable marketplace bundles use `od plugin`, while
repository-owned functional skills and rendering templates live under
`skills/` and `design-templates/` respectively. Do not document a concrete
daemon-managed install path here; the root `AGENTS.md` **Daemon data directory
contract** is the only path authority.

## 7. Worked example — running the bundled guizang deck template

The upstream-inspired bundle ships at
[`design-templates/guizang-ppt/`](../design-templates/guizang-ppt/) with its
license preserved and Open Design metadata applied:

1. The daemon lists it through `/api/design-templates`, independently of the
   functional `/api/skills` registry.
2. The user opens the Deck creation tab and selects the guizang template from
   the rendering catalogue.
3. Open Design stores the selected template id as the project's primary
   `skillId`. The daemon's combined skill-like resolver loads that template's
   `SKILL.md` and resources; it does not also inject the Deck tab's default
   functional skill.
4. The agent follows the template workflow, writes the deck files into the
   project workspace, and performs its checklist before final handoff.
5. File writes stream into the UI, `index.html` becomes previewable, and the
   deck export surfaces consume the produced project files.

The protocol intentionally does not define the workspace's concrete path; read
the root `AGENTS.md` **Daemon data directory contract** before changing or
documenting artifact storage.

## 8. Writing a rendering template — minimal example

```
design-templates/saas-landing/
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
  surface: web
  scenario: marketing
  preview:
    type: html
  design_system:
    requires: true
  craft:
    requires: [typography, color, anti-ai-slop, accessibility-baseline]
---

# Workflow

1. Apply the active design-system context supplied above this skill.
2. Copy `.od-skills/saas-landing/assets/base.html` to `index.html` in the project workspace.
3. Fill sections: hero, features (3–6), social proof, pricing, CTA, footer.
4. Inline all CSS. Use system font stack as fallback if DESIGN.md typography fails to load.
5. Write `index.html`. Done.
```

## 9. Testing skills

There is no `od skills test` command and no runtime contract for a
`tests/basic.prompt` tree. Repository-owned entries are checked by the root
guard, localized-content coverage, registry tests, and any focused tests for
their assets or prompt behavior. Run at least `pnpm guard` and
`pnpm typecheck`, plus the package-scoped checks appropriate to the files
changed. Plugin bundles have their own validation and doctor surfaces.

## 10. Open questions

- **Skill provenance.** Functional skills do not currently have a standalone
  install command. External distribution should use the plugin trust and
  provenance model rather than inventing an unverified `od skills add` flow.
- **Skill composition.** Can a prototype-mode instruction bundle invoke a
  deck-mode bundle for a sub-artifact? The current registries treat them as
  leaf-level inputs; composition requires an explicit orchestration contract.
- **Richer skill inputs.** Typed apply-time inputs and deferred parameters now
  belong to the plugin manifest contract. A future skill-native form should
  reuse that contract rather than reviving a second slider schema.
