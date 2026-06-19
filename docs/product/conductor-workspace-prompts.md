# Conductor Workspace Prompts

Use separate Conductor chats/workspaces for implementation. Keep each workspace scoped to one ownership lane.

Every workspace should start by reading:

- `AGENTS.md`
- `docs/product/README.md`
- `docs/product/canvas-platform-prd.md`
- `docs/product/harness-skill-library-runtime.md`
- `docs/product/imported-skill-runtime-map.md`

## Workspace 0: Architect / Integrator

Purpose:

Own sequencing, review, and integration across implementation workspaces.

Prompt:

```text
You are the Architect / Integrator for Builder v1.

Read:
- AGENTS.md
- docs/product/README.md
- docs/product/canvas-platform-prd.md
- docs/product/harness-skill-library-runtime.md
- docs/product/imported-skill-runtime-map.md

Your job is to keep implementation aligned to the first wedge:
Skill Registry + Automation Bridge + Run Ledger + Canvas Run Card.

Do not implement unrelated features. Review diffs from other workspaces for boundary violations, missing CLI/API parity, contract drift, and scope creep into Daytona, Orgo, SaaS auth, billing, or full growth automation.
```

## Workspace 1: Contracts + Data Model

Purpose:

Define shared DTOs before UI/backend implementation spreads.

Ownership:

- `packages/contracts/src/api/`
- contract exports
- focused contract tests

Prompt:

```text
Implement Phase 0 from docs/product/canvas-platform-prd.md.

Read:
- AGENTS.md
- packages/AGENTS.md
- docs/product/README.md
- docs/product/canvas-platform-prd.md
- docs/product/harness-skill-library-runtime.md
- docs/product/imported-skill-runtime-map.md

Own only shared pure TypeScript contracts. Add DTOs/types for:
- SkillDefinition
- PlaybookDefinition
- HarnessProcess
- BuilderRun
- BuilderRunEvent
- CanvasGraph / CanvasEntity / CanvasEdge if missing or incomplete
- Approval
- ProviderCredential

Keep packages/contracts pure: no Next.js, Express, Node fs/process, browser APIs, SQLite, daemon internals, or sidecar dependencies.

Do not implement UI, daemon routes, Mastra, Daytona, Orgo, or SaaS auth.

Before finishing, run the package-scoped typecheck or the narrowest validation available, and report exact files changed.
```

## Workspace 2: Skill Registry + Automation Bridge

Purpose:

Make markdown skills pullable by the agent/harness and referenceable from existing Open Design automations.

Ownership:

- daemon skill loading and registry surfaces
- `/api/skills` list/show/import if needed
- `/api/routines` bridge to `skillId` / `context.skillIds`
- `od skills ...`
- `od automation ...` compatibility

Prompt:

```text
Implement Phase 1 from docs/product/canvas-platform-prd.md.

Read:
- AGENTS.md
- apps/AGENTS.md
- packages/AGENTS.md
- docs/product/README.md
- docs/product/canvas-platform-prd.md
- docs/product/harness-skill-library-runtime.md
- docs/product/imported-skill-runtime-map.md
- docs/product/harness-skills/README.md

Goal:
Imported markdown skills must appear in a Skill Registry and be referenceable by Open Design automations/routines.

Use the imported skill bodies in:
- docs/product/harness-skills/skills/

Required behavior:
- list/show imported skills
- parse basic metadata from markdown title, Description, Tag, URL, and body
- report CSV-only missing skills: publish-readiness and seo-aeo-strategy-system
- allow routines to reference primary skillId and context.skillIds
- resolve referenced skill markdown when preparing a routine/harness run
- preserve existing /api/routines and od automation behavior

Do not implement canvas UI, Mastra execution, Daytona, Orgo, SaaS auth, billing, or full growth automation.

You are not alone in the codebase. Do not revert unrelated changes. Keep your write scope tight and report exact files changed.
```

## Workspace 3: Canvas Run UI

Purpose:

Show skill-backed work on the canvas.

Ownership:

- `apps/web` canvas/card UI
- Skill Card
- Process Card
- Run Card
- basic run event timeline/replay UI

Prompt:

```text
Implement the Canvas Run UI part of the first wedge from docs/product/canvas-platform-prd.md.

Read:
- AGENTS.md
- apps/AGENTS.md
- docs/product/README.md
- docs/product/canvas-platform-prd.md
- docs/product/harness-skill-library-runtime.md
- docs/product/imported-skill-runtime-map.md

Goal:
The canvas should make skill-backed automations visible.

Build only the UI/card surface needed for:
- Skill Card
- Process Card
- Run Card
- basic run timeline/replay
- status, autonomy, last run, next run, approval state placeholders

Do not implement backend routes, contracts, Mastra, Daytona, Orgo, SaaS auth, billing, or full growth automation.

Use existing app/web component and CSS ownership rules. Reuse shared primitives from @open-design/components when available. Keep UI dense and operational, not marketing-styled.

You are not alone in the codebase. Do not revert unrelated changes. Keep your write scope tight and report exact files changed.
```

## Workspace 4: Astro Preview Loop

Start implementation only after Workspaces 1-3 produce a working first wedge.
It is safe to start earlier as a discovery/spec lane if it does not change product contracts, daemon routes, shared runtime behavior, or UI surfaces.

Purpose:

Generate a real Astro preview from a skill-backed run.

Prompt:

```text
You own the Astro Preview Loop lane for Builder v1.

Read:
- AGENTS.md
- docs/product/README.md
- docs/product/canvas-platform-prd.md
- docs/product/harness-skill-library-runtime.md
- docs/product/imported-skill-runtime-map.md
- .context/integration-notes.md if it exists

Important sequencing:
Do not implement the full Astro loop until Contracts + Data Model, Skill Registry + Automation Bridge, and Canvas Run UI are structurally stable.

You may begin now only as a discovery/spec spike. If you start before the first wedge lands, produce:
- a short implementation design in .context/astro-preview-loop-notes.md
- the exact daemon/API/CLI seams needed after the first wedge
- the minimal files likely to change later
- risks around project storage, preview startup, smoke testing, and generated-site security

Use current docs before installing, scaffolding, or wiring Astro.

Preferred path is Context7:
1. npx ctx7@latest library Astro "<current user task>"
2. npx ctx7@latest docs <selected astro library id> "<current user task>"

If Context7 is quota-blocked, use Exa against official docs only and cite the URLs in your notes. Start with:
- https://docs.astro.build/en/getting-started/
- https://docs.astro.build/en/reference/routing-reference/
- https://docs.astro.build/en/basics/astro-pages/
- https://docs.astro.build/en/guides/integrations-guide/react/
- https://tailwindcss.com/docs/installation/framework-guides/astro

Target later implementation:
A skill-backed run can generate an Astro homepage into a project workspace, start a local preview, smoke-test it, and expose a Preview Card linked to the Run Card.

Expected later runtime direction:
- Astro 6
- React 19 islands/components
- Tailwind v4 tokens in src/styles/globals.css
- thin Astro route shells
- visual work in .tsx
- sitemap/robots support
- preview smoke checks before any approval/publish flow

Do not implement Daytona, Orgo, SaaS auth, billing, full growth automation, or full Mastra execution.
```

## Workspace 5: Mastra Harness

Start implementation only after Skill Registry + Run Ledger shape is clear.
It is safe to start earlier as a discovery/spec lane if it does not install dependencies, change product contracts, or expose framework-specific events to the web app.

Purpose:

Replace mock/local harness execution with a Mastra-backed `BuilderHarness`.

Prompt:

```text
You own the Mastra Harness lane for Builder v1.

Read:
- AGENTS.md
- docs/product/README.md
- docs/product/canvas-platform-prd.md
- docs/product/harness-skill-library-runtime.md
- docs/product/imported-skill-runtime-map.md
- .context/integration-notes.md if it exists

Important sequencing:
Do not implement the full Mastra-backed harness until Contracts + Data Model and Skill Registry + Automation Bridge are structurally stable.

You may begin now only as a discovery/spec spike. If you start before the first wedge lands, produce:
- a short implementation design in .context/mastra-harness-notes.md
- a proposed BuilderHarness adapter boundary
- a mapping from Mastra events/tools/workflows to normalized BuilderRunEvents
- a list of dependency/package changes that should wait for integrator approval
- risks around scheduler ownership, memory, credentials, streaming, and background work

Use current docs before installing, scaffolding, or wiring dependencies.

Preferred path is Context7:
1. npx ctx7@latest library Mastra "<current user task>"
2. npx ctx7@latest docs <selected mastra library id> "<current user task>"

If Context7 is quota-blocked, use Exa against official docs only and cite the URLs in your notes. Start with:
- https://mastra.ai/docs
- https://mastra.ai/docs/agents/overview
- https://mastra.ai/docs/agents/using-tools
- https://mastra.ai/docs/agents/background-tasks
- https://mastra.ai/docs/workflows/agents-and-tools

Target later implementation:
Implement a narrow BuilderHarness provider that can load one imported markdown skill, run one simple workflow/agent path, and emit normalized BuilderRunEvents.

Non-negotiable boundary:
Builder owns project state, scheduler policy, approval policy, credential access, run ledger, and canvas outputs. Mastra executes authorized work behind BuilderHarness.

Do not expose raw Mastra events to apps/web. Do not build Daytona, Orgo, SaaS auth, billing, or full growth automation.
```
