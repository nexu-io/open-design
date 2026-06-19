# Harness Skills

Imported source material for the Builder harness skill library.

These files are the user's initial Ploybook-style `.md` training files. They are raw source assets for the future Skill Registry. Do not treat them as already-normalized runtime definitions. The next implementation step is to parse each file into a `SkillDefinition` with frontmatter, policy, tools, triggers, autonomy, approvals, and expected outputs.

## Folder Layout

- `skills/` - imported markdown skill/playbook bodies with stable slug filenames.
- `inventory/skills.csv` - Ploy skill inventory export.
- `inventory/skills-all.csv` - alternate inventory export with the same rows and different column ordering.
- `skill-runtime-map.md` - Builder-specific mapping from imported skill to harness runtime behavior.

## Imported Markdown Skills

- `skills/aeo-comparison-pages-narrow-concession.md`
- `skills/analyze-web-traffic-and-visitor-engagement.md`
- `skills/build-a-content-page.md`
- `skills/company-swarm-account-based-outreach.md`
- `skills/create-a-homepage-from-scratch.md`
- `skills/email-icp-website-visitors.md`
- `skills/gsc-keyword-optimization.md`
- `skills/optimize-above-the-fold-content.md`

## Inventory Rows Without Markdown Bodies In This Batch

The CSV inventory includes these skills, but their full markdown bodies were not attached in this import batch:

- `Publish Readiness - Take a Ploy Site Live on a Custom Domain`
- `SEO & AEO Strategy System - APTK Framework, Keyword Research, Content Optimization`

When those `.md` files arrive, add them under `skills/` and update `skill-runtime-map.md`.

## Runtime Rule

The intended runtime path is:

```text
Markdown skill file
  -> Skill Registry
  -> Playbook Registry
  -> BuilderHarness process
  -> Mastra agent/workflow/tools
  -> RunEvent ledger
  -> Canvas cards
```

Open Design `/automations` maps to the process/scheduler layer, not the canonical storage layer for skill bodies:

```text
Skill markdown lives in Skill Registry.
Automation/routine references skill ids.
BuilderHarness loads referenced skill markdown when a run starts.
Mastra executes the agent/workflow/tool path.
```

In current Open Design terms, use `/api/routines` / `od automation` as the first execution surface because routines already support `prompt`, `schedule`, `skillId`, `agentId`, and `context.skillIds`.

Each imported skill should eventually become:

- a Skill Card
- zero or more Playbook Cards
- optional scheduled/watchdog Process Cards
- replayable Run Cards for each execution

## Safety Rule

Outbound, publishing, credentialed integrations, destructive file operations, and paid compute actions require explicit approval policy before execution.
