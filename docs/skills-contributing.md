# Contributing a Design Template

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`skills-protocol.md`](skills-protocol.md) · [`architecture.md`](architecture.md) · [`modes.md`](modes.md)

> Want to read the shared `SKILL.md` protocol instead? See [`skills-protocol.md`](skills-protocol.md). This file is the **how-to** for shipping a rendering template upstream — what to write, how to run it locally, and what we'll send back at review.

A design template is the most leverage you can ship into Open Design without writing framework code. One folder, one Markdown file with frontmatter, a hand-built example, and the Templates gallery shows it. This guide covers rendering templates (`prototype`, `deck`, `template`, `image`, `video`, and `audio`). Functional skills that do work on user input belong in [`skills/`](../skills/); read [`design-templates/AGENTS.md`](../design-templates/AGENTS.md) for the ownership rule.

If you only have ten seconds, the picture is:

> **Drop a folder under `design-templates/`, then refresh the Templates gallery. The daemon scans the directory on the next `/api/design-templates` request, so no restart is required. The rest of this doc is about making that folder good enough to merge.**

---

## 1. Ship a design template in 30 minutes — the happy path

```bash
# 1. Fork & clone
git clone git@github.com:<your-username>/open-design.git
cd open-design
git checkout -b template/<your-template-name>

# 2. Bootstrap (Node 24, pnpm 10.33.x)
corepack enable
pnpm install

# 3. Copy the closest existing template as a starting point
cp -r design-templates/dating-web design-templates/<your-template-name>
# Edit design-templates/<your-template-name>/SKILL.md — change name, description, triggers,
# rewrite the workflow body, replace example.html with your own hand-built sample.

# 4. Run the dev loop and verify the picker
pnpm tools-dev run web
# Open the web URL it prints.
# Switch to the mode you set in od.mode — see the mode list below for the
# full list (Prototype / Deck / Template / Image / Video / Audio).
# Your template's name should appear in the gallery. Click it and send the example_prompt.

# 5. Open a PR
git add design-templates/<your-template-name>
git commit -m "feat(templates): add <your-template-name>"
git push -u origin template/<your-template-name>
gh pr create --title "feat(templates): add <your-template-name>" --body "..."
```

That's the whole loop. The next sections explain each step in depth and tell you what we look at when the PR lands in review.

---

## 2. What a design template is, and what it isn't

A design template is a **packaged shape for producing one kind of artifact**. It is not a feature, integration, or marketing campaign.

**Yes:**
- "A 6–10 page investor pitch deck with editorial typography" → deck template
- "A single-screen consumer dashboard with stats, charts, and a community ticker" → prototype template
- "A populated copy of our PM-spec template with the brief filled in" → template mode
- "A 9:16 short-form video reel from a script + b-roll prompts" → video template
- "A square poster from a one-line brief" → image template
- "A 30-second jingle from a mood description" → audio template

**No:**
- A wrapper around a third-party API (Stripe, Alipay, Slack API, GitHub API). That's a feature; submit it via the agent / daemon path, not as a design template.
- A model loader, vendor SDK bundle, or "BYOK for `<provider>`". OD's bet is "your existing CLI is enough."
- A brand-promotion bundle for a sponsor or product launch. Design templates are reusable artifact recipes, not campaigns.
- A duplicate of an existing template with marginal differentiation. Before opening, search `design-templates/` and read the descriptions of the closest 2–3 — if you can't articulate the differentiator in one sentence, fold your work into the existing template instead.
- A template whose only output is a static screenshot or pre-rendered video. The artifact has to be generated from a prompt, not merely shipped in `assets/`.

**Third option: ship an external plugin bundle.** If your workflow is genuinely a recipe (not a daemon feature) but is too vendor-specific or audience-narrow to land in-tree, publish a portable `SKILL.md` bundle with an `open-design.json` manifest and distribute it through the plugin workflow. The current `od skills` CLI is read-only; installation belongs to `od plugin`, not the retired `od skill add` shape. This is the right path for payment-provider workflows, regional marketplace integrations, in-house design systems, and similar — not a rejection, just a different distribution channel.

If you're not sure your idea fits, **open a discussion first** ([github.com/nexu-io/open-design/discussions](https://github.com/nexu-io/open-design/discussions)) — we'd rather spend 5 minutes redirecting than have you build the wrong thing for a week.

---

## 3. Design-template anatomy — the minimum

```text
design-templates/<your-template>/
├── SKILL.md                    # required — frontmatter + workflow
├── example.html                # required if od.preview.type is html or jsx — the hand-built sample
├── assets/                     # optional but typical — seed files the skill copies into the artifact
│   └── template.html
└── references/                 # optional — knowledge files the agent reads during planning
    ├── checklist.md            # required for merge — P0 gates the agent must pass
    ├── layouts.md
    └── components.md
```

### `SKILL.md` frontmatter cheat sheet

The first three keys (`name`, `description`, `triggers`) are the [Claude Code base spec](https://docs.anthropic.com/en/docs/claude-code/skills) — the bundle remains readable as a plain agent skill. Everything under `od:` is OD-specific and optional, but **`od.mode`** decides which gallery surface indexes the template.

```yaml
---
name: your-template
description: |
  One paragraph. The agent reads this verbatim to decide if the user's
  brief matches. Be concrete: surface, audience, what's in the artifact,
  what's not.
triggers:
  - "your trigger phrase"
  - "another phrase"
  - "中文触发词"

od:
  mode: prototype           # prototype | deck | template | image | video | audio
  platform: desktop         # desktop | mobile
  scenario: marketing       # free-form tag for grouping in the picker
  featured: 1               # any positive integer surfaces under "Showcase examples"
  preview:
    type: html              # html | jsx | pptx | markdown
  design_system:
    requires: true          # does the template read the active DESIGN.md?
  craft:
    requires: [typography, color, anti-ai-slop]
  example_prompt: "A copy-pastable prompt that nicely shows what this template does."
---

# Your Design Template

Free-form Markdown describing the workflow the agent should follow.
Numbered steps work well. Lift the format from design-templates/dating-web/SKILL.md
or design-templates/guizang-ppt/SKILL.md.
```

Full active grammar (`od.mode`, `od.surface`, `od.craft.requires`, `od.critique.policy`, gallery hints, and more) lives in [`skills-protocol.md`](skills-protocol.md). Older portable fields such as `od.inputs`, `od.parameters`, and `od.capabilities_required` may still appear in external bundles but are not consumed by the skill/template registry.

---

## 4. Running it locally

You need exactly four commands once your tree is set up.

```bash
# 1. Bootstrap (only the first time, or after pulling main with manifest changes)
corepack enable
pnpm install

# 2. Run the daemon + web
pnpm tools-dev run web
# Note the web and daemon URLs it prints. tools-dev allocates ports dynamically
# unless you pass explicit --web-port / --daemon-port values.

# 3. After editing SKILL.md, refresh the gallery — the daemon re-scans
#    design-templates/ on every /api/design-templates request, so reopening
#    the gallery (or refreshing the web tab) picks up your edit without a
#    restart. If parsing fails or the template never appears, read the daemon
#    stderr, fix the reported parse error, and refresh again.

# 4. Verify your template end-to-end:
#    - Switch to the mode you set in od.mode (Prototype / Deck / Template /
#      Image / Video / Audio)
#    - Find your template in the Templates gallery
#    - Click it, paste the example_prompt
#    - Verify the handoff for the run's execution profile:
#      * filesystem: canonical project file(s) appear in the files panel and
#        preview, followed by a short ordinary-text summary; no source-code
#        <artifact> block is emitted.
#      * text_artifact: with no filesystem tools, one complete standalone
#        <artifact> block is the canonical result and must not claim file writes.
#      This guide MUST NOT define daemon data paths; read the root AGENTS.md
#      section "Daemon data directory contract" before changing or documenting
#      artifact storage.
#    - Verify preview iframe renders correctly
#    - Verify export (PPTX / PDF) works if the mode supports it
```

If the gallery doesn't show your template, check the daemon stderr — the most common cause is a YAML syntax error in frontmatter. The daemon logs the parse error with the offending line.

You don't need any agent CLI on your `PATH` to develop a template — configure a supported local CLI or BYOK runtime in Settings and reuse it across runs.

---

## 5. The merge bar — checklist before you open the PR

We hold design-template PRs to a high bar because templates are user-facing output. Every item below is something a reviewer will check.

### Content

- [ ] **`example.html` is hand-built.** Opens straight from disk, looks like something a designer would actually deliver. No lorem ipsum, no `<svg><rect/></svg>` placeholder hero. If you can't build the example yourself, the template probably isn't ready.
- [ ] **No AI slop in the example.** No purple gradients, no generic emoji icons (📊 💡 🚀), no rounded card with a left-border accent, no Inter as a *display* face, no invented stats ("10× faster", "users save 4 hours/week"). Read the **Anti-AI-slop machinery** section of the README for the full list.
- [ ] **Honest placeholders.** When the agent doesn't have a real number, the template body should instruct it to write `—` or a labelled grey block, not fabricate one.
- [ ] **`references/checklist.md` exists** with at least P0 gates (the rules the agent has to pass before the canonical filesystem or `text_artifact` handoff). Lift the format from [`design-templates/guizang-ppt/references/checklist.md`](../design-templates/guizang-ppt/references/checklist.md) or [`design-templates/web-prototype/references/checklist.md`](../design-templates/web-prototype/references/checklist.md).
- [ ] **`example_prompt` actually works.** Run it locally end-to-end before submitting. If you wouldn't paste this prompt in front of a stranger to demo the template, rewrite it.
- [ ] **Triggers are concrete.** "design something cool" is not a trigger. "investor pitch deck", "saas landing page", "约会应用" are.

### Shape

- [ ] **Single self-contained folder + discoverable English display copy.** Everything the template needs lives under `design-templates/<your-template>/`. The folder's `SKILL.md` must include the English display fields consumed by the gallery — see "i18n coverage" below. No edits to `apps/daemon/`, `packages/`, `tools/`, etc. in the same PR.
- [ ] **No CDN imports** beyond what other templates already use. If you need a new font CDN, GSAP, three.js, etc., raise it in your PR description.
- [ ] **No images larger than ~250 KB.** If your example genuinely needs a hero photo, run it through an optimizer first. No raw PNG screenshots.
- [ ] **No fonts you didn't license.** System font stack is always safe; Google Fonts and Adobe Fonts free tier are also safe; anything else needs a license file in `references/`.
- [ ] **Slug is ASCII, kebab-case.** `your-template-name`, not `YourTemplateName` or `your_template_name` or `你的模板`.

### i18n coverage (every template, not just featured)

The `e2e/tests/localized-content.test.ts` test enforces that every directory under both `skills/` and `design-templates/` with a `SKILL.md` is discoverable and displayable for de / ru / fr. Locales use translated copy when present and otherwise derive the runtime fallback from the English source fields in `SKILL.md`.

For a non-featured template, the cheap path is to keep the source metadata complete:

- [ ] **Ensure `SKILL.md` has complete English display copy**: title/name, description, example prompt, and any picker metadata required by the skill schema. The localized runtime uses these fields as the fallback display path.
- [ ] **Use optional localized display fields when useful**: `en_name` / `zh_name`, `en_description` / `zh_description`, and `od.example_prompt_i18n.<locale>`. Keep `description` and `od.example_prompt` in English because those are the fallback fields for every locale without localized copy.
- [ ] **Run `pnpm --filter @open-design/web test` and `pnpm --filter @open-design/e2e test tests/localized-content.test.ts`** locally before pushing. These suites catch undisplayable discovered resources and verify localized fallback behavior.

### Featured templates (optional path)

If you set `od.featured: 1`, also:

- [ ] **Add a screenshot** at `docs/screenshots/skills/<template>.png`. PNG, ~1024×640 retina, captured from the real `example.html` at zoomed-out browser scale.
- [ ] **Optionally add full localized display copy** in `content.ts` (DE), `content.fr.ts` (FR), `content.ru.ts` (RU) — title, summary, scenario tag. The featured row in the picker uses this copy when present; the default fallback path renders English everywhere.

### Forking

If you fork an existing template (e.g. start from `dating-web` and remix into `recruiting-web`), keep the original LICENSE and authorship in `references/` and call it out in the PR description.

---

## 6. PR description template

Copy-paste this into your PR body and fill it in. Reviewers spend 80% of their first pass checking this template.

```markdown
## Design template: <name>

**Mode:** prototype | deck | template | image | video | audio
**Platform:** desktop | mobile
**Surface:** one sentence on what artifact this produces

## What it produces
- Brief description of the artifact shape (sections, layout, expected content density)
- Link to the `example.html` rendered output (if you've put it on a gist or pages)

## Triggers
List the trigger phrases. Pick ones you'd actually expect a user to type.

## Why this isn't covered by an existing template
Search `design-templates/` first. Name the closest 2 and explain in one sentence each why
they don't cover this case. If you can't, fold into the existing template instead.

## Validation
- [ ] Ran `pnpm tools-dev run web` and verified the template appears in the gallery
- [ ] Sent the `example_prompt` end-to-end and confirmed the canonical filesystem or `text_artifact` handoff rendered
- [ ] Verified export works (PPTX / PDF / etc.) if the mode supports it
- [ ] Ran `pnpm typecheck`
- [ ] Verified `SKILL.md` has complete English display copy for localized fallback — **required for every template**
- [ ] Ran `pnpm --filter @open-design/web test` and `pnpm --filter @open-design/e2e test tests/localized-content.test.ts`; localized-content coverage is green

## Screenshot
(Required if `od.featured` is set. Otherwise nice-to-have.)

## Forked from
(Only if applicable. Name the source template and the LICENSE you preserved.)
```

---

## 7. Common reasons we close design-template PRs

So you don't waste a week. Each pattern below has been the close reason on a recent PR — saving the next person from running into the same wall.

- **Sponsor / promo / brand-campaign content.** A template named "Phantom Motion V8.0 Engine" with a `sponsor-qrcode.png` in `assets/` and marketing copy in the README — that's an ad, not a contribution. We close on sight.
- **Vendor API integration packaged as a template.** Payment provider integration, marketplace API, vendor SDK wrappers — even when the workflow is real, this is a feature, not a design template. Open it as a daemon PR with proper API contract changes in `packages/contracts`.
- **Duplicate of an existing template with marginal differentiation.** "Add Trading Terminal X" when "Trading Terminal Y" already exists is a fork-or-fold-in decision, not a new template PR. Be explicit about the differentiator in the description.
- **Wider repo edits in the same PR.** A template PR that also bumps `package.json`, modifies `types.ts`, regenerates locale files, or touches `apps/daemon/` is two PRs at minimum. Template PRs land fast because they're small — keep them small.
- **Stale rebase artefacts.** If your `types.ts` grows by 1000+ lines while you're just adding Turkish, that's a rebase gone wrong, not an i18n addition. Reset the file from main and only touch what you intentionally changed.
- **Lorem ipsum in `example.html`.** The example is the marketing material for the template. If it has placeholder text, it tells reviewers the template isn't ready.
- **AI-slop visuals.** Purple-to-pink gradients, hero with three colored squiggles, `Inter` at 64px in a card, `border-l-4 border-violet-500` accent — the README's anti-slop list exists for a reason. We bounce on first pass.
- **Triggers that won't fire.** "creative project", "modern design", "beautiful page" don't disambiguate; they fire for everything. Triggers should be specific enough that the planner knows when to *not* pick your skill.

---

## 8. References

### Design templates to imitate

Pick the closest one to your idea and read its `SKILL.md` body before writing your own.

- **Visual showcase, single-screen prototype:** [`design-templates/dating-web/`](../design-templates/dating-web/), [`design-templates/digital-eguide/`](../design-templates/digital-eguide/)
- **Multi-frame mobile flow:** [`design-templates/mobile-onboarding/`](../design-templates/mobile-onboarding/), [`design-templates/gamified-app/`](../design-templates/gamified-app/)
- **Document / template (no design system required):** [`design-templates/pm-spec/`](../design-templates/pm-spec/), [`design-templates/weekly-update/`](../design-templates/weekly-update/)
- **Deck mode:** [`design-templates/guizang-ppt/`](../design-templates/guizang-ppt/) (bundled verbatim from [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill)) and [`design-templates/simple-deck/`](../design-templates/simple-deck/)
- **Media templates (image / video / audio):** [`design-templates/image-poster/`](../design-templates/image-poster/), [`design-templates/video-shortform/`](../design-templates/video-shortform/), [`design-templates/audio-jingle/`](../design-templates/audio-jingle/)

### Spec & supporting docs

- [`skills-protocol.md`](skills-protocol.md) — full frontmatter grammar, discovery & precedence rules, mode semantics, craft references, testing primitives
- [`architecture.md`](architecture.md) — daemon ↔ web ↔ skill registry data flow
- [`modes.md`](modes.md) — what the Prototype / Deck / Template / Image / Video / Audio template modes mean to the runtime
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — code style, commit conventions, "what we don't accept" for the broader project

### Upstream

- [Claude Code `SKILL.md` convention](https://docs.anthropic.com/en/docs/claude-code/skills) — the base format
- [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) — upstream registry for product design systems (most `design-systems/` PRs belong here, not here)
- [Anti-AI-slop checklist](../README.md) — section in the main README; lift the rules into your `references/checklist.md`

---

## License

By contributing a design template, you agree your contribution is licensed under the [Apache-2.0 License](../LICENSE) of this repository, with the exception of files inside [`design-templates/guizang-ppt/`](../design-templates/guizang-ppt/), which retain their original MIT license and authorship attribution to [op7418](https://github.com/op7418).
