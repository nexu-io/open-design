# Harness Skill Library Runtime PRD

## Purpose

Define how the user's `.md` agent-training files become a first-class skill library inside the Builder harness.

This fills the missing layer between "Ploybooks" and the actual runtime:

- Ploybooks are not just prompts.
- Skills are not just docs.
- They are harness-level runnable process definitions that agents can load, execute, schedule, monitor, replay, and improve.

The system should support:

- user-initiated playbook runs
- background scheduled runs
- watchdog runs
- event-triggered runs
- long-running processes
- 24/7 project agents
- markdown skill packs that train agents

## Core Concept

The platform has three related but distinct concepts:

```text
Skill
  reusable agent expertise, usually authored as markdown

Playbook
  a repeatable workflow composed from skills, tools, policies, and expected outputs

Process
  a live or scheduled harness run of a playbook/agent task against a project
```

Ploy calls many of these "Ploybooks." In Builder, the better model is:

```text
.md skill files
  -> Skill Registry
  -> Playbook Registry
  -> Mastra agents/workflows/tools
  -> BuilderHarness run/process
  -> RunEvent ledger
  -> Canvas objects
```

## Skill File Model

The user's `.md` files should become importable skill definitions.

Recommended file shape:

```md
---
id: website-seo-setup
name: Website SEO Setup
version: 1.0.0
category: seo
agents:
  - growth-agent
  - site-builder-agent
triggers:
  manual: true
  schedule: "0 9 * * 1"
  events:
    - page.created
    - deploy.completed
autonomy: stage
tools:
  - web.extract
  - filesystem.read
  - filesystem.write
  - preview.smoke
  - seo.audit
outputs:
  - seo_audit
  - file_diff
  - recommendation_cards
approvals:
  - publish
  - destructive_file_change
---

# Mission

Train the agent to set up technical SEO for a generated Astro website.

## Procedure

...

## Quality Bar

...

## Failure Modes

...
```

The frontmatter is machine-readable policy. The body is agent instruction.

## Registry Types

### SkillDefinition

```ts
interface SkillDefinition {
  id: string
  name: string
  version: string
  category: SkillCategory
  sourcePath: string
  body: string
  agents: AgentKind[]
  triggers: SkillTriggers
  autonomy: AutonomyLevel
  tools: ToolId[]
  outputs: OutputKind[]
  approvals: ApprovalPolicy[]
  safety: SkillSafetyPolicy
}
```

### PlaybookDefinition

```ts
interface PlaybookDefinition {
  id: string
  name: string
  version: string
  description: string
  skillIds: string[]
  workflowId: string
  inputSchema: unknown
  outputSchema: unknown
  defaultAgent: AgentKind
  defaultAutonomy: AutonomyLevel
  triggers: ProcessTrigger[]
}
```

### HarnessProcess

```ts
interface HarnessProcess {
  id: string
  projectId: string
  playbookId?: string
  skillIds: string[]
  agentId: string
  status: 'queued' | 'running' | 'waiting_for_approval' | 'sleeping' | 'failed' | 'completed' | 'cancelled'
  trigger: ProcessTrigger
  autonomy: AutonomyLevel
  schedule?: string
  watchdog?: WatchdogPolicy
  startedAt?: string
  lastHeartbeatAt?: string
  nextRunAt?: string
  runId: string
}
```

## Trigger Model

Skills/playbooks can run in four ways.

### 1. Manual

User launches from:

- canvas card
- command palette
- chat
- CLI
- selected object action

Example:

```text
Run "SEO Setup" on selected Site Card.
```

### 2. Scheduled

Cron-style or interval trigger.

Examples:

- weekly SEO scan
- daily analytics review
- hourly uptime check
- monthly content refresh

### 3. Watchdog

A watchdog is an always-on process that checks project health and acts only when a condition is met.

Examples:

- preview is down
- deploy failed
- form submissions broke
- traffic dropped
- sitemap invalid
- no agent heartbeat
- Daytona sandbox stale
- Orgo computer stuck

### 4. Event-Triggered

Runs when a platform event occurs.

Examples:

- `page.created`
- `file.changed`
- `preview.failed`
- `deploy.completed`
- `analytics.threshold_crossed`
- `visitor.high_intent_seen`
- `computer.session_started`

## Autonomy Levels

Every skill and process must declare an autonomy level.

```text
observe
  analyze only, no file changes

draft
  produce proposed changes, do not apply

stage
  apply to workspace/preview, require approval before publish

publish
  publish only after explicit approval

autopublish
  publish automatically within a narrow allowlist
```

The scheduler must never elevate autonomy. A scheduled run can only use the autonomy allowed by the skill, project, tenant, and user policy.

## Mastra Integration

Mastra should run this through agents, workflows, and background tools.

Relevant Mastra patterns from current docs:

- agents can expose workflows as callable tools.
- tools can be enabled as background tasks with timeouts.
- Mastra supports scheduler-style dispatch for deferred work.
- agents can use memory, but Builder remains canonical state.

Recommended mapping:

```text
Skill markdown body
  -> agent instructions/context

Playbook
  -> Mastra workflow

Skill tools
  -> Mastra tools backed by Open Design/Daytona/Orgo/provider adapters

Scheduled/watchdog process
  -> Builder scheduler enqueues a BuilderHarness run

BuilderHarness
  -> calls Mastra agent/workflow

Mastra stream/tool events
  -> normalized Builder RunEvents
```

Do not let Mastra own the scheduler or project policy alone. Builder should own:

- tenant/project permissions
- autonomy policy
- credential access
- schedule definitions
- watchdog definitions
- run ledger
- canvas outputs

Mastra executes the work once Builder authorizes and starts it.

## Open Design Automations Bridge

Open Design already has a useful primitive for this layer:

- Web UI: `/automations`
- API: `/api/routines`
- CLI: `od automation ...`
- Contract: `packages/contracts/src/api/routines.ts`

Current routine records already include:

- `prompt`
- `schedule`
- `target`
- `skillId`
- `agentId`
- `context.skillIds`
- `context.pluginIds`
- run history

That means Open Design automations should become the first scheduler/control surface for Builder harness processes.

Important boundary:

```text
Markdown skill files
  live in Skill Registry

Automations / routines
  reference skills by id and schedule/process policy

Mastra / BuilderHarness
  loads the referenced skill bodies at run time
```

Do not store the only copy of a skill as a routine prompt. A routine prompt can summarize the job, but the reusable agent training belongs in the skill library.

### Proposed Mapping

| Open Design Today | Builder Harness Meaning |
| --- | --- |
| `Routine` | `HarnessProcess` |
| `Routine.prompt` | process goal / run prompt |
| `Routine.schedule` | scheduled trigger |
| `Routine.skillId` | primary skill |
| `Routine.context.skillIds` | additional skills loaded into agent context |
| `Routine.agentId` | target Mastra/agent adapter |
| `RoutineRun` | run instance |
| `od automation run` | manual process trigger |
| `runs/:runId/crystallize` | promote a successful run into reviewed skill/memory proposals |

### Skill Pull Flow

At run time:

```text
Routine fires
  -> BuilderHarness receives process request
  -> SkillRegistry resolves skillId/context.skillIds
  -> Markdown bodies + metadata become agent context
  -> Mastra routes to correct agent/workflow/tools
  -> RunEvents stream back to Builder/Open Design
  -> Canvas cards update
```

The agent should be able to ask the harness for skills by:

- id
- category
- trigger
- project surface
- selected canvas object
- required tool family

Example internal API shape:

```ts
interface SkillRegistry {
  list(input?: SkillListInput): Promise<SkillSummary[]>
  get(id: string): Promise<SkillDefinition>
  resolveForRun(input: SkillResolutionInput): Promise<ResolvedSkillContext>
}
```

### Automations UI Direction

The existing `/automations` page can be reused initially, but Builder should eventually show a richer version:

- Skill picker
- Playbook picker
- schedule editor
- watchdog condition editor
- autonomy level selector
- approval policy preview
- provider/credential requirements
- canvas output settings

The first implementation can use `Routine.skillId` and `Routine.context.skillIds` directly. Later, add first-class `processes`, `watchdogs`, and `playbooks` if routines become too narrow.

## Scheduler / Watchdog Runtime

The platform needs a small runtime service:

```text
HarnessScheduler
  -> scans enabled schedules
  -> checks watchdog conditions
  -> responds to event triggers
  -> enqueues process runs
  -> enforces autonomy/approval policy
  -> records RunEvents
```

Initial implementation can be simple:

- database table for schedules/processes
- periodic daemon tick
- mock queue/local worker
- idempotency keys
- run lock per project/process

Later implementation can move to:

- Temporal
- BullMQ
- Cloudflare Queues
- managed workflow engine

The important contract is not the queue vendor. It is the process model.

## Skill Library UI

The skill library should be visible in the product.

Surfaces:

- Skill Library panel
- Playbook cards on canvas
- Agent cards showing loaded skills
- Process cards showing active schedules/watchdogs
- Project automation settings

Each skill card should show:

- name
- category
- version
- enabled agents
- allowed tools
- autonomy level
- triggers
- last run
- next run
- failure count
- outputs

## Canvas Objects

Harness-level automation should become canvas objects.

### Skill Card

Represents reusable expertise from an `.md` file.

### Playbook Card

Represents a runnable workflow.

### Process Card

Represents an active schedule/watchdog/background process.

### Run Card

Represents one execution instance.

### Watchdog Card

Represents a condition monitor.

Example:

```text
Weekly SEO Watchdog
  uses: website-seo-setup.md
  agent: growth-agent
  autonomy: stage
  next run: Monday 9:00
  last output: 3 recommendations
```

## Process Lifecycle

```text
registered
  -> enabled
  -> queued
  -> running
  -> waiting_for_approval
  -> completed
```

Failure path:

```text
running
  -> failed
  -> retry_scheduled
  -> running
```

Watchdog path:

```text
sleeping
  -> condition_detected
  -> queued
  -> running
  -> resolved
  -> sleeping
```

## Run Event Requirements

Every process emits normalized events:

- `process.started`
- `skill.loaded`
- `workflow.started`
- `tool.started`
- `tool.completed`
- `file.changed`
- `preview.checked`
- `computer.started`
- `approval.requested`
- `approval.resolved`
- `canvas.output_pinned`
- `process.completed`
- `process.failed`
- `process.heartbeat`

The UI should never need to understand raw Mastra events.

## Storage

Add tables/entities for:

- `skills`
- `skill_versions`
- `playbooks`
- `playbook_versions`
- `processes`
- `process_schedules`
- `process_watchdogs`
- `process_runs`
- `run_events`
- `approvals`

## Initial Skill Categories

Use the Ploy notes as seed categories, but name them for Builder:

- Website Build
- SEO & AEO
- Content
- Design
- Publish
- Analytics
- Visitors & Outreach
- Computer Operations
- QA
- Integrations

## Initial Skills To Import

The user's `.md` files should be sorted into the registry as soon as available.

Initial expected examples:

- `website-seo-setup.md`
- `website-blog-setup.md`
- `publish-readiness.md`
- `aeo-comparison-pages.md`
- `site-clone.md`
- `analytics-review.md`
- `visitor-outreach.md`
- `computer-browser-audit.md`
- `astro-react-code.md`
- `design-system-extract.md`

## Current Imported Skill Batch

The first batch has been imported to `.context/harness_skills/`.

Read these before implementing the skill registry or playbook runtime:

- `.context/harness_skills/README.md`
- `.context/harness_skills/skill-runtime-map.md`
- `.context/harness_skills/inventory/skills.csv`
- `.context/harness_skills/inventory/skills-all.csv`
- `.context/harness_skills/skills/`

Current imported markdown skills:

- `aeo-comparison-pages-narrow-concession.md`
- `analyze-web-traffic-and-visitor-engagement.md`
- `build-a-content-page.md`
- `company-swarm-account-based-outreach.md`
- `create-a-homepage-from-scratch.md`
- `email-icp-website-visitors.md`
- `gsc-keyword-optimization.md`
- `optimize-above-the-fold-content.md`

The CSV inventory also lists two skills whose markdown bodies are not in the first import batch:

- `Publish Readiness - Take a Ploy Site Live on a Custom Domain`
- `SEO & AEO Strategy System - APTK Framework, Keyword Research, Content Optimization`

## MVP Scope

### MVP 1: Static Skill Registry

- read `.md` skill files from a project/repo folder
- parse frontmatter
- show skills in UI/CLI
- expose skill metadata to `BuilderHarness`

### MVP 2: Manual Playbook Runs

- user launches a playbook from canvas
- harness loads skill markdown
- Mastra agent runs workflow
- run events stream to run card

### MVP 3: Scheduled Processes

- enable/disable schedule
- cron/interval support
- scheduler enqueues process
- process emits heartbeat and run events

### MVP 4: Watchdogs

- define condition checks
- preview/deploy/analytics watchdogs
- trigger only when condition matches
- pin outcome to canvas

### MVP 5: Skill Authoring

- create/edit skill `.md`
- validate frontmatter
- run skill eval/golden trace
- version skills
- promote skill to tenant/global library

## Acceptance Criteria

- A markdown skill can be imported and shown as a Skill Card.
- A playbook can reference one or more skills.
- A user can run a playbook manually.
- A schedule can run the same playbook automatically.
- A watchdog can trigger only when a condition is met.
- Every run is replayable.
- Every run has an autonomy policy.
- Every output can be pinned to the canvas.
- Background processes can run while the user is away.
- The browser never receives provider secrets.

## Best First Slice

Build this first:

```text
Skill Registry -> Manual Playbook Run -> Run Ledger -> Canvas Run Card
```

Then:

```text
Scheduled Process -> Watchdog Process -> Skill Authoring UI
```

This is the right bridge between the user's markdown agent-training files and the always-on platform.
