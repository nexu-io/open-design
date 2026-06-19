# Product Planning Docs

Start here for Builder v1 / Refined Craft product implementation.

## Authoritative Docs

- `canvas-platform-prd.md` - formal merged PRD and implementation plan.
- `harness-skill-library-runtime.md` - detailed runtime model for markdown skills, playbooks, automations, schedules, watchdogs, and Mastra execution.
- `imported-skill-runtime-map.md` - mapping from the imported Ploybook-style skills into Builder agents, triggers, autonomy levels, tools, outputs, and approval gates.
- `harness-skills/` - imported markdown skill bodies and CSV inventory.
- `conductor-workspace-prompts.md` - copy/paste briefs for separate Conductor chats/workspaces.

## Current Build Wedge

Build this first:

```text
Skill Registry + Automation Bridge + Run Ledger + Canvas Run Card
```

Then:

```text
Astro Preview Loop + Mastra Harness + Scheduled Processes
```

Do not start Daytona, Orgo, SaaS auth, billing, or full growth automation until the first wedge is implemented and reviewable.

## Core Boundary

```text
Open Design + tldraw = product surface and local kernel
Mastra = agent/workflow/harness executor
Open Design Skill Registry = source of truth for skill markdown
Open Design Automations = first scheduler/process control surface
Astro = generated website/web-app runtime
Daytona = hosted sandbox provider
Orgo = embedded project computer provider
Canvas = visible operational graph
```
