# Contributing a Skill

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`skills-protocol.md`](skills-protocol.md) · [`architecture.md`](architecture.md) · [`modes.md`](modes.md)

> Want to read the protocol spec instead? See [`skills-protocol.md`](skills-protocol.md). This file is the **how-to** for shipping a skill upstream — what to write, how to run it locally, what we'll send back at review.

A skill is the most leverage you can ship into Open Design without writing framework code. One folder, one Markdown file with frontmatter, a hand-built example, and the picker shows it. This guide walks you through the path from `git clone` to merged PR, plus the bar we hold skill PRs to and the patterns that get bounced.

If you only have ten seconds, the picture is:

> **Drop a folder under `skills/`, restart the daemon, your skill shows up in the picker. The whole rest of this doc is about making that folder good enough to merge.**

---

## 1. Ship a skill in 30 minutes — the happy path

```bash
# 1. Fork & clone
git clone git@github.com:<your-username>/open-design.git
cd open-design
git checkout -b skill/<your-skill-name>

# 2. Bootstrap (Node 24, pnpm 10.33.x)
corepack enable
pnpm install

# 3. Copy the closest existing skill as a starting point
cp -r skills/dating-web skills/<your-skill-name>
# Edit skills/<your-skill-name>/SKILL.md — change name, description, triggers,
# rewrite the workflow body, replace example.html with your own hand-built sample.

# 4. Run the dev loop and verify the picker
pnpm tools-dev run web
# Open the URL it prints (typically http://127.0.0.1:5173).
# Switch to the mode you set in od.mode — see "Skill modes" below for the
# full list (Prototype / Deck / Template / Design system / Image / Video / Audio).
# Your skill's name should appear in the picker. Click it, send the example_prompt.

# 5. Open a PR
git add skills/<your-skill-name>
git commit -m "skills: add <your-skill-name>"
git push -u origin skill/<your-skill-name>
gh pr create --title "skills: add <your-skill-name>" --body "..."
```

That's the whole loop. The next sections explain each step in depth and tell you what we look at when the PR lands in review.

---

## 2. What a skill IS, and what it isn't

A skill is a **recipe for producing one kind of artifact**. Not a feature, not an integration, not a marketing page.

**Yes:**
- "A 6–10 page investor pitch deck with editorial typography" → deck-skill
- "A single-screen consumer dashboard with stats, charts, and a community ticker" → prototype-skill
- "A populated copy of our PM-spec template with the brief filled in" → template-skill
- "A `DESIGN.md` for the Linear brand sampled from their site" → design-system-skill
- "A 9:16 short-form video reel from a script + b-roll prompts" → video-skill
- "A square poster from a one-line brief" → image-skill
- "A 30-second jingle from a mood description" → audio-skill

**No:**
- A wrapper around a third-party API (Stripe, Alipay, Slack API, GitHub API). That's a feature; submit it via the agent / daemon path, not as a skill.
- A model loader, vendor SDK bundle, or "BYOK for `<provider>`". OD's bet is "your existing CLI is enough."
- A brand-promotion bundle for a sponsor or product launch. Skills are reusable artifact recipes, not campaigns.
- A duplicate of an existing skill with marginal differentiation. Before opening, search `skills/` and read the descriptions of the closest 2–3 — if you can't articulate the differentiator in one sentence, fold your work into the existing skill instead.
- A skill whose only output is a screenshot or a video. The artifact has to be something the agent generates from a prompt, not a static asset shipped in `assets/`.

**Third option: ship as an external skill bundle.** If your workflow is genuinely a recipe (not a daemon feature) but is too vendor-specific or audience-narrow to land in-tree, the skills protocol supports user-global skills via `~/.claude/skills/` (see [`skills-protocol.md` §3](skills-protocol.md#3-skill-discovery--precedence)). Publishing your bundle as a standalone repo lets users `git clone` or `od skill add` it without us taking on the maintenance surface. This is the right path for payment-provider workflows, regional marketplace integrations, in-house design systems, and similar — not a rejection, just a different distribution channel.

If you're not sure your idea fits, **open a discussion first** ([github.com/nexu-io/open-design/discussions](https://github.com/nexu-io/open-design/discussions)) — we'd rather spend 5 minutes redirecting than have you build the wrong thing for a week.

---

## 3. Skill anatomy — the minimum

```text
skills/<your-skill>/
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

The first three keys (`name`, `description`, `triggers`) are the [Claude Code base spec](https://docs.anthropic.com/en/docs/claude-code/skills) — your skill works in plain Claude Code with just these. Everything under `od:` is OD-specific and optional, but **`od.mode`** decides which group the skill shows up under.

```yaml
---
name: your-skill
description: |
  One paragraph. The agent reads this verbatim to decide if the user's
  brief matches. Be concrete: surface, audience, what's in the artifact,
  what's not.
triggers:
  - "your trigger phrase"
  - "another phrase"
  - "中文触发词"

od:
  mode: prototype           # prototype | deck | template | design-system | image | video | audio
  platform: desktop         # desktop | mobile
  scenario: marketing       # free-form tag for grouping in the picker
  featured: 1               # any positive integer surfaces under "Showcase examples"
  preview:
    type: html              # html | jsx | pptx | markdown
    entry: index.html
  design_system:
    requires: true          # does the skill read the active DESIGN.md?
    sections: [color, typography, layout, components]
  example_prompt: "A copy-pastable prompt that nicely shows what this skill does."
---

# Your Skill

Free-form Markdown describing the workflow the agent should follow.
Numbered steps work well. Lift the format from skills/dating-web/SKILL.md
or skills/guizang-ppt/SKILL.md.
```

Full grammar — typed inputs, slider parameters (`od.parameters`), capability gating (`od.capabilities_required`), `od.craft.requires` for cross-brand craft references — lives in [`skills-protocol.md`](skills-protocol.md). You don't need any of those to ship v1.

---

## 4. Running it locally

You need exactly four commands once your tree is set up.

```bash
# 1. Bootstrap (only the first time, or after pulling main with manifest changes)
corepack enable
pnpm install

# 2. Run the daemon + web
pnpm tools-dev run web
# Note the URL it prints — usually http://127.0.0.1:5173 for web,
# http://127.0.0.1:7456 for daemon.

# 3. After editing SKILL.md, refresh the picker — the daemon re-scans skills/
#    on every /api/skills request, so reopening the picker (or refreshing the
#    web tab) picks up your edit without a restart. If frontmatter parsing
#    fails or the new skill never shows up, restart pnpm tools-dev run web
#    and check the daemon stderr for the parse error.

# 4. Verify your skill end-to-end:
#    - Switch to the mode you set in od.mode (Prototype / Deck / Template /
#      Design system / Image / Video / Audio)
#    - Find your skill in the picker
#    - Click it, paste the example_prompt
#    - Watch the artifact stream into .od/artifacts/<run-id>/
#    - Verify preview iframe renders correctly
#    - Verify export (PPTX / PDF) works if the mode supports it
```

If the picker doesn't show your skill, check the daemon stderr — the most common cause is a YAML syntax error in frontmatter. The daemon logs the parse error with the offending line.

You don't need any agent CLI on your `PATH` to develop a skill — the daemon falls back to the **Anthropic API · BYOK** path, which is the fastest dev loop anyway. Set your key in Settings once and reuse across runs.

---

## 5. The merge bar — checklist before you open the PR

We hold skill PRs to a higher bar than feature PRs because skills are the user-facing surface. Every item below is something a reviewer will check, so save the round-trip and check it yourself first.

### Content

- [ ] **`example.html` is hand-built.** Opens straight from disk, looks like something a designer would actually deliver. No lorem ipsum, no `<svg><rect/></svg>` placeholder hero. If you can't build the example yourself, the skill probably isn't ready.
- [ ] **No AI slop in the example.** No purple gradients, no generic emoji icons (📊 💡 🚀), no rounded card with a left-border accent, no Inter as a *display* face, no invented stats ("10× faster", "users save 4 hours/week"). Read the **Anti-AI-slop machinery** section of the README for the full list.
- [ ] **Honest placeholders.** When the agent doesn't have a real number, the skill body should instruct it to write `—` or a labelled grey block, not fabricate one.
- [ ] **`references/checklist.md` exists** with at least P0 gates (the rules the agent has to pass before emitting `<artifact>`). Lift the format from [`skills/guizang-ppt/references/checklist.md`](../skills/guizang-ppt/references/checklist.md) or [`skills/web-prototype/references/checklist.md`](../skills/web-prototype/references/checklist.md).
- [ ] **`example_prompt` actually works.** Run it locally end-to-end before submitting. If you wouldn't paste this prompt in front of a stranger to demo the skill, rewrite it.
- [ ] **Triggers are concrete.** "design something cool" is not a trigger. "investor pitch deck", "saas landing page", "约会应用" are.

### Shape

- [ ] **Single self-contained folder + the i18n fallback line.** Everything the skill needs lives under `skills/<your-skill>/`. The **only** outside edit is adding your skill id to the `*_SKILL_IDS_WITH_EN_FALLBACK` arrays — see "i18n coverage" below. No edits to `apps/daemon/`, `packages/`, `tools/`, etc. in the same PR.
- [ ] **No CDN imports** beyond what other skills already use. If you need a new font CDN, GSAP, three.js, etc., raise it in your PR description.
- [ ] **No images larger than ~250 KB.** If your example genuinely needs a hero photo, run it through an optimizer first. No raw PNG screenshots.
- [ ] **No fonts you didn't license.** System font stack is always safe; Google Fonts and Adobe Fonts free tier are also safe; anything else needs a license file in `references/`.
- [ ] **Slug is ASCII, kebab-case.** `your-skill-name`, not `YourSkillName` or `your_skill_name` or `你的技能`.

### i18n coverage (every skill, not just featured)

The `e2e/tests/localized-content.test.ts` test enforces that every directory under `skills/` with a `SKILL.md` is represented in the localized content metadata for de / ru / fr — otherwise CI fails on the `skills display copy` assertion.

For a non-featured skill, the cheap path is to declare your id falls back to English:

- [ ] **Add your skill id to all three `*_SKILL_IDS_WITH_EN_FALLBACK` arrays** in `apps/web/src/i18n/content.ts` (DE), `apps/web/src/i18n/content.fr.ts` (FR), and `apps/web/src/i18n/content.ru.ts` (RU). Just the bare id on its own line, sorted alphabetically — **no `TODO:` comment**, no inline note. The fallback marker IS the note.
- [ ] **Run `pnpm --filter @open-design/web test`** locally before pushing. The localized-content test catches missing entries; failing it earns a "please add the fallback line" comment.

### Featured skills (optional path)

If you set `od.featured: 1`, also:

- [ ] **Add a screenshot** at `docs/screenshots/skills/<skill>.png`. PNG, ~1024×640 retina, captured from the real `example.html` at zoomed-out browser scale.
- [ ] **Replace the fallback id with full localized display copy** in `content.ts` (DE), `content.fr.ts` (FR), `content.ru.ts` (RU) — title, summary, scenario tag. The featured row in the picker uses this copy; the bare fallback path renders English everywhere.

### Forking

If you fork an existing skill (e.g. start from `dating-web` and remix into `recruiting-web`), keep the original LICENSE and authorship in `references/` and call it out in the PR description.

---

## 6. PR description template

Copy-paste this into your PR body and fill it in. Reviewers spend 80% of their first pass checking this template.

```markdown
## Skill: <name>

**Mode:** prototype | deck | template | design-system | image | video | audio
**Platform:** desktop | mobile
**Surface:** one sentence on what artifact this produces

## What it produces
- Brief description of the artifact shape (sections, layout, expected content density)
- Link to the `example.html` rendered output (if you've put it on a gist or pages)

## Triggers
List the trigger phrases. Pick ones you'd actually expect a user to type.

## Why this isn't covered by an existing skill
Search `skills/` first. Name the closest 2 and explain in one sentence each why
they don't cover this case. If you can't, fold into the existing skill instead.

## Validation
- [ ] Ran `pnpm tools-dev run web` and verified the skill appears in the picker
- [ ] Sent the `example_prompt` end-to-end and confirmed the artifact rendered
- [ ] Verified export works (PPTX / PDF / etc.) if the mode supports it
- [ ] Ran `pnpm typecheck`
- [ ] Added the skill id to all three `*_SKILL_IDS_WITH_EN_FALLBACK` arrays (or full localized copy if featured) — **required for every skill**
- [ ] Ran `pnpm --filter @open-design/web test` and the `localized-content` suite is green

## Screenshot
(Required if `od.featured` is set. Otherwise nice-to-have.)

## Forked from
(Only if applicable. Name the source skill and the LICENSE you preserved.)
```

---

## 7. Common reasons we close skill PRs

So you don't waste a week. Each pattern below has been the close reason on a recent PR — saving the next person from running into the same wall.

- **Sponsor / promo / brand-campaign content.** A skill named "Phantom Motion V8.0 Engine" with a `sponsor-qrcode.png` in `assets/` and marketing copy in the README — that's an ad, not a contribution. We close on sight.
- **Vendor API integration packaged as a skill.** Payment provider integration, marketplace API, vendor SDK wrappers — even when the workflow is real, this is a feature, not a skill. Open it as a daemon PR with proper API contract changes in `packages/contracts`.
- **Duplicate of an existing skill with marginal differentiation.** "Add Trading Terminal X" when "Trading Terminal Y" already exists is a fork-or-fold-in decision, not a new skill PR. Be explicit about the differentiator in the description.
- **Wider repo edits in the same PR.** A skill PR that also bumps `package.json`, modifies `types.ts`, regenerates locale files, or touches `apps/daemon/` is two PRs at minimum. Skill PRs land fast because they're small — keep them small.
- **Stale rebase artefacts.** If your `types.ts` grows by 1000+ lines while you're just adding Turkish, that's a rebase gone wrong, not an i18n addition. Reset the file from main and only touch what you intentionally changed.
- **Lorem ipsum in `example.html`.** The example is the marketing material for the skill. If it has placeholder text, it tells reviewers the skill isn't ready.
- **AI-slop visuals.** Purple-to-pink gradients, hero with three colored squiggles, `Inter` at 64px in a card, `border-l-4 border-violet-500` accent — the README's anti-slop list exists for a reason. We bounce on first pass.
- **Triggers that won't fire.** "creative project", "modern design", "beautiful page" don't disambiguate; they fire for everything. Triggers should be specific enough that the planner knows when to *not* pick your skill.

---

## 8. References

### Skills to imitate

Pick the closest one to your idea and read its `SKILL.md` body before writing your own.

- **Visual showcase, single-screen prototype:** [`skills/dating-web/`](../skills/dating-web/), [`skills/digital-eguide/`](../skills/digital-eguide/)
- **Multi-frame mobile flow:** [`skills/mobile-onboarding/`](../skills/mobile-onboarding/), [`skills/gamified-app/`](../skills/gamified-app/)
- **Document / template (no design system required):** [`skills/pm-spec/`](../skills/pm-spec/), [`skills/weekly-update/`](../skills/weekly-update/)
- **Deck mode:** [`skills/guizang-ppt/`](../skills/guizang-ppt/) (bundled verbatim from [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill)) and [`skills/simple-deck/`](../skills/simple-deck/)
- **Media skills (image / video / audio):** [`skills/image-poster/`](../skills/image-poster/), [`skills/video-shortform/`](../skills/video-shortform/), [`skills/audio-jingle/`](../skills/audio-jingle/)

### Spec & supporting docs

- [`skills-protocol.md`](skills-protocol.md) — full frontmatter grammar, discovery & precedence rules, mode semantics, craft references, testing primitives
- [`architecture.md`](architecture.md) — daemon ↔ web ↔ skill registry data flow
- [`modes.md`](modes.md) — what Prototype / Deck / Template / Design system actually mean to the runtime
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — code style, commit conventions, "what we don't accept" for the broader project

### Upstream

- [Claude Code `SKILL.md` convention](https://docs.anthropic.com/en/docs/claude-code/skills) — the base format
- [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) — upstream registry for product design systems (most `design-systems/` PRs belong here, not here)
- [Anti-AI-slop checklist](../README.md) — section in the main README; lift the rules into your `references/checklist.md`

---

## License

By contributing a skill, you agree your contribution is licensed under the [Apache-2.0 License](../LICENSE) of this repository, with the exception of files inside [`skills/guizang-ppt/`](../skills/guizang-ppt/), which retain their original MIT license and authorship attribution to [op7418](https://github.com/op7418).
