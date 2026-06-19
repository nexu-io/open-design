# Formalized PRD and Implementation Plan

## Product

Canvas-native AI website and web-app operating platform.

## Status

Authoritative planning document for the next implementation phase.

This document merges and supersedes the working PRDs in `.context/plans/` for day-to-day implementation planning. The older documents remain source material and decision history.

## Source Documents Merged

- `.context/plans/ploy-tech-stack-integration-blueprint.md`
- `.context/plans/ploy-canvas-platform-technical-design-prd.md`
- `.context/plans/ploy-canvas-platform-prd-best-version-review.md`
- `.context/plans/harness-skill-library-runtime-prd.md`
- `.context/harness_skills/README.md`
- `.context/harness_skills/skill-runtime-map.md`
- `.context/ploy_context/README.md`

## CEO Review Conclusion

The best version is not a Ploy clone with a canvas bolted on.

The best version is:

> A living website operating room where every website has agents, previews, computers, analytics, playbooks, deployment state, and background work visible on an infinite canvas.

The winning wedge is narrower than the full platform:

```text
URL -> Canvas -> Astro Preview -> Agent Run -> Approved Improvement
```

After that works, expand into:

```text
Embedded Computers -> Hosted Workspaces -> Growth Automation -> SaaS Control Plane
```

This is a selective expansion strategy: preserve the ambitious product surface, but sequence the build around the first moment that proves the product is real.

## One-Line Promise

Launch a living website workspace where AI agents design, build, test, publish, analyze, and improve your site while every action stays visible on an infinite canvas.

## Product Thesis

Businesses do not need another blank website builder. They need an autonomous website team that keeps working after the site is launched.

The canvas is the trust layer. It makes hidden AI work visible:

- what the agent is doing
- which skills it loaded
- which files changed
- what preview is live
- what needs approval
- which scheduled process is running
- which computer is active
- what the latest analytics insight means
- what will happen next

The product should feel less like chat and more like an operating room for a business website.

## Product Boundaries

### Own

- canvas-native project state
- website/web-app design workflow
- skill library and playbook runtime
- always-on harness processes
- run ledger and replay
- previews, deploys, analytics, computers, approvals
- provider abstraction and BYO credentials

### Do Not Own

- raw model provider abstraction beyond what the chosen agent framework needs
- provider UIs as product surface
- full Figma replacement
- generic hosted IDE
- generic CRM
- generic email platform

## Core Architecture Decision

```text
Open Design + tldraw = product surface and local kernel
Mastra = agent/workflow/harness executor
Open Design Skill Registry = source of truth for skill markdown
Open Design Automations = first scheduler/process control surface
Astro = generated website/web-app runtime
Daytona = hosted workspace/sandbox provider
Orgo = literal embedded project computer provider
Builder contracts = normalized state and event boundary
Canvas = user-facing operational graph
```

## Non-Negotiable Boundaries

- Skills live in the Skill Registry, not only inside automations.
- Automations/routines schedule and trigger skill-backed processes.
- Mastra executes authorized work but does not own product state.
- Raw Mastra event shapes do not leak into `apps/web`.
- Daytona and Orgo calls do not run from the browser.
- Provider credentials stay server-side.
- Every user-facing capability needs UI and `od` CLI parity.
- tldraw is the spatial document, not the only canonical backend state.
- Imported website HTML is untrusted input.
- Publishing, outreach sends, destructive edits, paid compute, DNS, and credential connections require explicit approval policies.

## Target Users

### Founder / Operator

Wants the site built and improved without managing designers, developers, SEO consultants, analytics, and outreach separately.

### Growth / Marketing Lead

Wants playbooks that turn traffic, search opportunities, visitors, and campaigns into approved website changes and outreach drafts.

### Designer / Design Engineer

Wants spatial control over brand, pages, sections, components, variants, preview, and implementation quality.

### Technical Power User

Wants direct access to files, terminals, providers, deploys, and embedded computers without leaving the project.

## Core Product Loop

```text
Understand
  -> Build
  -> Preview
  -> Review
  -> Publish
  -> Measure
  -> Improve
```

Every phase should have a canvas object, run event trail, or approval state.

## First Magic Moment

1. User enters a business URL.
2. Agent researches company, audience, existing site, and market.
3. Canvas opens with:
   - Site Card
   - Page Card
   - Design System Card
   - Preview Card
   - Agent Run Card
   - Suggested Playbook Cards
4. Agent creates or imports an Astro homepage.
5. Preview is live.
6. Agent proposes one concrete improvement.
7. User approves.
8. Preview changes.
9. Run replay shows what happened.

This must work before expanding into the full growth engine.

## Second Magic Moment

1. User clicks "Launch computer."
2. A live Orgo computer appears as a canvas object.
3. User watches the agent use the computer.
4. User can take control, switch to read-only, or hand control back.
5. Computer session links to the run, files, preview, and outputs.

This proves the platform can operate real software, not just generate text or code.

## Information Architecture

### Primary Canvas Clusters For V1

1. Site cluster
2. Agent/run cluster
3. Preview/deploy cluster
4. Skill/process cluster

Computer cluster is introduced immediately after the first wedge works.

### Project Object Hierarchy

```text
Project
  -> Surfaces
      -> Marketing Site
      -> Landing Page
      -> Content Hub
      -> Web App Surface
      -> Internal Tool
  -> Site
      -> Pages
      -> Components
      -> Design System
      -> Preview
      -> Deploy
  -> Agents
      -> Runs
      -> Skills
      -> Playbooks
      -> Processes
      -> Approvals
  -> Computers
      -> Live VM
      -> Sessions
      -> Agent Handoffs
  -> Growth
      -> Analytics
      -> Visitors
      -> Insights
      -> Recommendations
  -> Providers
      -> Credentials
      -> Quotas
      -> Health
```

## Canonical V1 Canvas Cards

Ship only these first:

- Site Card
- Page Card
- Preview Card
- Run Card
- Agent Card
- Skill Card
- Playbook Card
- Process Card
- Approval Card
- Provider Card

Computer Card ships in the second wedge.

## Design Direction

### Aesthetic

Dense operational canvas.

This is a professional command surface, not a playful whiteboard or marketing landing page. It should be calm, precise, inspectable, and suited for daily repeated use.

### Layout

```text
Top Bar
  project, environment, deploy status, active agents, provider health

Left Rail
  create object, playbooks, skills, files, computers, integrations

Canvas
  site cluster, run cluster, preview cluster, skill/process cluster

Right Inspector
  selected object details, actions, history, policy, settings

Bottom Activity Strip
  current runs, approvals, background processes, errors
```

### UI Rules

- Canvas stays central.
- Chat is important but not the center of gravity.
- Cards should be compact and stable.
- Live activity should be visible but quiet.
- Do not pin every event to canvas; only meaningful outputs become cards.
- Run timelines hold detail.
- Every visible automation must show autonomy, schedule, last run, next run, and failure state.

## Generated Website Runtime

Generated websites and web-app surfaces use the Ploy-style runtime unless the user explicitly chooses otherwise:

- Astro 6
- React 19 islands/components
- Tailwind v4 with theme tokens in `src/styles/globals.css`
- Vite HMR
- thin Astro route shells
- visual work in `.tsx`
- SSR for dynamic content collections
- prerender for small fixed routes
- sitemap and robots support
- reverse-proxy sitemap mirroring for imported sites
- forms
- analytics injection
- Cloudflare Workers deploy target first

## Skill Library And Ploybook Runtime

The user's `.md` files are core product assets.

They are not just prompt snippets and they should not live only as automation prompt text.

```text
Markdown skill file
  -> Skill Registry
  -> Playbook Registry
  -> Harness Process
  -> Mastra run
  -> Builder RunEvents
  -> Canvas outputs
```

### Current Imported Skill Batch

Located in `.context/harness_skills/`.

Imported markdown skills:

- `aeo-comparison-pages`
- `analyze-web-traffic`
- `build-content-page`
- `company-swarm`
- `create-homepage`
- `email-icp-visitors`
- `gsc-keyword-optimization`
- `optimize-above-the-fold`

CSV inventory includes two skills not yet imported as markdown:

- `publish-readiness`
- `seo-aeo-strategy-system`

### Runtime Defaults

- `observe`: analyze and recommend.
- `draft`: create drafts/reports/plans, no applied changes.
- `stage`: apply to workspace/preview, no publish.
- `publish`: publish only after explicit approval.
- `autopublish`: not enabled for initial product.

### Open Design Automations Bridge

Open Design already has the first scheduler surface:

- Web UI: `/automations`
- API: `/api/routines`
- CLI: `od automation ...`
- Contract: `packages/contracts/src/api/routines.ts`

Use it this way:

```text
Skill markdown lives in Skill Registry.
Routine references skill ids and schedule policy.
BuilderHarness loads referenced skills at run time.
Mastra executes the agent/workflow/tool path.
RunEvents stream back to Builder and canvas.
```

Current Open Design routine fields already align:

- `Routine.prompt` -> process goal
- `Routine.schedule` -> schedule trigger
- `Routine.skillId` -> primary skill
- `Routine.context.skillIds` -> extra skills
- `Routine.agentId` -> target agent
- `RoutineRun` -> run instance

## Harness Processes

### Trigger Types

- manual: user starts it
- scheduled: cron/interval starts it
- watchdog: condition starts it
- event-triggered: platform event starts it

### Initial Manual Playbooks

- Create Homepage
- Build Content Page
- Optimize Above The Fold
- AEO Comparison Pages
- GSC Keyword Optimization
- Analyze Web Traffic
- Email ICP Visitors
- Company Swarm

### Initial Scheduled Processes

- Weekly traffic analysis, `observe`
- Weekly GSC keyword scan, `stage`
- Weekly/monthly AEO target discovery, `draft`
- Daily ICP visitor email queue, `draft`

### Initial Watchdogs

- CTA engagement weak on high-traffic landing page -> Optimize Above The Fold
- High impressions / low CTR -> GSC Keyword Optimization
- Traffic drop/spike -> Analyze Web Traffic
- Pre-production deploy or crawl anomaly -> Publish Readiness, pending markdown body

## Mastra Harness

Mastra should be behind `BuilderHarness`, not exposed as the product surface.

### Core Agents

- `site-builder-agent`
- `growth-agent`
- `design-agent`
- `qa-agent`
- `analytics-agent`
- `computer-agent`
- `routing-agent`

### BuilderHarness Interface

```ts
interface BuilderHarness {
  init(input: HarnessInit): Promise<HarnessSession>
  runPlaybook(input: PlaybookRunInput): Promise<RunHandle>
  runAgentTask(input: AgentTaskInput): Promise<RunHandle>
  runProcess(input: HarnessProcessInput): Promise<RunHandle>
  subscribe(runId: string, listener: RunEventListener): Unsubscribe
  cancel(runId: string): Promise<void>
  replay(runId: string): Promise<RunReplay>
}
```

### Event Boundary

Raw Mastra streams become normalized Builder events:

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
- `process.heartbeat`
- `process.completed`
- `process.failed`

## Orgo Computer Model

Orgo is literal embedded compute.

V1 policy:

- browser never receives Orgo API keys
- backend issues short-lived view/control sessions
- computer display appears as a canvas card/frame
- user/agent control mode is explicit
- every computer session links to a run

Control modes:

- `view_only`
- `user_control`
- `agent_control`
- `shared_control`
- `locked`

## Provider Wallet

BYO subscriptions should become a product feature, not just a backend detail.

Provider Cards should show:

- connected status
- scopes
- last used
- quota/limits when available
- agents/playbooks using it
- failures
- required approvals

Initial providers:

- model provider
- Daytona
- Orgo
- Cloudflare
- Google Search Console
- analytics
- Gmail/CRM

## Core Data Contracts

Implement these in `packages/contracts` before large UI work:

- `CanvasGraph`
- `CanvasEntity`
- `CanvasEdge`
- `BuilderRun`
- `BuilderRunEvent`
- `SkillDefinition`
- `PlaybookDefinition`
- `HarnessProcess`
- `WorkspaceProvider`
- `ComputerProvider`
- `ProviderCredential`
- `Approval`

Contracts stay pure TypeScript.

## API Surface

Every capability needs daemon API and CLI parity.

### Skill Registry

- `GET /api/skills`
- `GET /api/skills/:id`
- `POST /api/skills/import`
- `POST /api/skills/:id/validate`

CLI:

- `od skills list --json`
- `od skills show <id> --json`
- `od skills import --path <path> --json`

### Harness Processes

Short-term: use `/api/routines`.

Long-term:

- `GET /api/processes`
- `POST /api/processes`
- `POST /api/processes/:id/run`
- `PATCH /api/processes/:id`
- `GET /api/processes/:id/runs`

CLI:

- `od automation ...` first
- later `od process ...` if routines become too narrow

### Canvas

- `GET /api/projects/:id/canvas`
- `PUT /api/projects/:id/canvas`
- `POST /api/projects/:id/canvas/entities`
- `POST /api/projects/:id/canvas/link`

### Runs

- `POST /api/projects/:id/runs`
- `GET /api/runs/:id/events`
- `GET /api/runs/:id/replay`
- `POST /api/runs/:id/cancel`

## Implementation Plan

### Phase 0: Formalize Contracts

Goal: establish the product state boundary.

Build:

- contract DTOs for canvas, runs, skills, playbooks, processes, approvals, providers
- mock provider types
- normalized run event union
- ADR documenting source-of-truth boundaries

Acceptance:

- contract package typechecks
- no web imports daemon internals
- all new surfaces have planned CLI/API parity

### Phase 1: Skill Registry And Automation Bridge

Goal: make imported `.md` skills pullable by agents.

Build:

- static skill loader for `.context/harness_skills/skills` or project `skills/`
- parser for title, description, tags, URL, body
- normalized `SkillDefinition`
- use `Routine.skillId` and `Routine.context.skillIds`
- API/CLI list/show
- skill validation report

Acceptance:

- imported 8 skills appear in registry
- missing 2 inventory skills are reported as incomplete
- routine can reference a skill id
- run preparation resolves skill markdown into harness context

### Phase 2: Canvas Run Skeleton

Goal: prove the trust layer.

Build:

- persistent tldraw canvas per project
- Site Card
- Run Card
- Skill Card
- Process Card
- run ledger API
- mock `BuilderHarness`

Acceptance:

- user can create project
- canvas persists after reload
- manual process creates run events
- Run Card replays events

### Phase 3: Astro Preview Loop

Goal: prove real website output.

Build:

- generated Astro template
- local workspace provider
- file write tool
- preview card
- preview smoke check
- first "Create Homepage" manual flow using mock/initial harness

Acceptance:

- homepage generated into workspace
- Astro preview starts
- preview card appears on canvas
- file diff and preview check are visible in run replay

### Phase 4: Mastra BuilderHarness

Goal: replace mock execution with real agent/workflow execution.

Build:

- add Mastra dependency in daemon/service boundary
- implement `BuilderHarness`
- routing agent
- site-builder-agent
- growth-agent
- workflow-as-tool registration
- event normalizer
- golden traces

Acceptance:

- `create-homepage` and `optimize-above-the-fold` run through Mastra
- UI sees only Builder run events
- harness replay works deterministically with mocks

### Phase 5: Rich Automations And 24/7 Processes

Goal: turn skills into always-on processes.

Build:

- schedule editor using existing `/automations`
- skill picker
- autonomy selector
- approval policy preview
- process heartbeat
- watchdog condition model
- first scheduled traffic analysis

Acceptance:

- user schedules a skill-backed process
- scheduler runs it without user present
- process card shows next run, last run, status, autonomy
- watchdog triggers only when its condition matches

### Phase 6: Orgo Embedded Computer Prototype

Goal: prove visible project compute.

Build:

- `ComputerProvider` contract
- Orgo provider adapter
- short-lived view session API
- Computer Card
- view/control modes
- run-linked computer session

Acceptance:

- user launches computer from project
- live computer appears inside app
- agent/user control mode is visible
- no Orgo API key reaches browser

### Phase 7: Daytona Hosted Workspace

Goal: move from local proof to hosted execution.

Build:

- Daytona workspace provider
- create/start/stop/heartbeat
- preview proxy
- terminal/file command bridge
- Sandbox Card

Acceptance:

- project can run in Daytona
- preview URL is visible
- sandbox health is visible on canvas
- local provider remains usable

### Phase 8: Growth Automation

Goal: prove the living website team.

Build:

- GSC Keyword Optimization
- Analyze Web Traffic
- AEO Comparison Pages target discovery
- Email ICP Visitors as draft-only
- Company Swarm as draft-only
- recommendation cards

Acceptance:

- scheduled growth process produces recommendations
- recommended edits can be staged, reviewed, and approved
- outreach never auto-sends
- all outputs are linked to runs and canvas cards

### Phase 9: SaaS Control Plane

Goal: prepare hosted multi-tenant product.

Build:

- tenant/org/user model
- provider credential vault
- billing-ready provider wallet
- object storage
- hosted database
- project ownership
- audit log

Acceptance:

- provider credentials are encrypted server-side
- project resources are tenant-scoped
- BYO provider status is visible
- local-first Open Design path still works

## Validation Strategy

For every phase:

- focused contract tests
- daemon API tests
- CLI parity tests
- one UI path check
- run ledger replay check
- security check for secrets and approvals

Harness-specific:

- golden traces for each skill-backed playbook
- mock tool providers for GSC, analytics, visitors, Gmail, Orgo, Daytona
- snapshot normalized run events
- assert raw provider/Mastra events do not leak to web UI

## Success Metrics

Activation:

- time from URL entry to first live preview
- percent of projects with first approved improvement
- percent of users who run one playbook

Engagement:

- weekly active projects with background process runs
- scheduled processes per project
- canvas cards interacted with per project
- computer sessions launched per active project

Quality:

- preview smoke pass rate
- publish success rate
- rollback rate
- agent change approval rate
- failed process recovery rate

Business:

- connected domains
- published websites
- connected provider accounts
- growth recommendations accepted
- visitor/outreach drafts created

## Risks And Mitigations

### Too Broad Too Early

Mitigation: first wedge is URL -> Canvas -> Astro Preview -> Agent Run -> Approved Improvement.

### Canvas Becomes A Junk Drawer

Mitigation: events stay in timelines; only meaningful outputs become pinned cards.

### Always-On Agents Feel Unsafe

Mitigation: autonomy levels, approval gates, visible process cards, rollback.

### Provider Stack Feels Fragile

Mitigation: provider abstractions, mock providers, health cards, golden traces.

### Skills Become Unmanageable

Mitigation: file-based registry, frontmatter validation, versions, source paths, skill cards, process cards.

## Immediate Next Build Slice

Build this first:

```text
Skill Registry + Automation Bridge + Run Ledger + Canvas Run Card
```

Then:

```text
Astro Preview Loop + Mastra Harness + Scheduled Processes
```

This sequence connects the user's markdown skills to actual runnable, replayable, visible platform behavior before adding hosted infrastructure.

## Open Questions

- Should committed skills live in repo `skills/` immediately, or stay in `.context/harness_skills` until registry code exists?
- Should Builder add a first-class `processes` table, or extend Open Design `routines` first?
- Should the first canvas be inside existing Open Design app shell or a dedicated Builder workspace route?
- Which hosted database/realtime layer should back SaaS mode?
- Should Orgo display use `orgo-vnc` directly or a backend-proxied noVNC route?
- What is the final product name?

## Decision Summary

The product should be built as a canvas-native autonomous website operating platform.

The first implementation should not start with all providers. It should start by making skills executable, runs replayable, and canvas state visible.

If we can prove that a markdown skill can become a scheduled/triggered Mastra-backed process whose work appears on the canvas and changes a real Astro preview, the rest of the platform has a solid foundation.
