# Automations Self-Evolution Plan

## Purpose

Automations should become the product-wide loop that lets Open Design improve
itself over time: ingest sources, distill durable memory, crystallize reusable
skills, extract and refine design systems, and feed compact context back into
future agent runs.

This is not a replacement for design templates, skills, connectors, memory, or
Orbit. It is the orchestration layer that composes them into a self-evolving
design agent.

## External patterns

| Reference | Pattern to borrow | Boundary |
|---|---|---|
| [OpenHuman](https://github.com/tinyhumansai/openhuman) | Connector auto-fetch into a memory tree, local editable knowledge, chunking, and optional token compression before LLM use. | Keep OD design-focused and local-first; do not copy its subscription/model-router product shape. |
| [Hermes Agent](https://github.com/nousresearch/hermes-agent) | Closed learning loop: persistent memory, agent-created skills from experience, skill improvement during use, scheduled automations, and explicit compression commands. | Do not replace the user's agent loop or turn OD into a general messaging gateway. |
| [Multica](https://github.com/multica-ai/multica) | Managed agents, agent-scoped skills, workspace/local skill imports, and skill attachment as a team-level capability. | Do not turn OD into an issue board; use the skill attachment pattern for design work. |
| [GenericAgent](https://github.com/lsdefine/GenericAgent) | After solving a new task, crystallize the execution path into a reusable skill tree and recall it for similar tasks with a smaller context window. | Do not grant broad uncontrolled desktop authority; OD keeps daemon and connector capability gates. |

## Product thesis

Open Design becomes a self-evolving design agent when every useful run can
promote durable knowledge into one of four trees:

1. **Memory tree** - user, project, source, connector, and artifact knowledge
   stored as editable Markdown nodes with summaries and provenance.
2. **Skill tree** - reusable procedures extracted from successful runs,
   imported skill packs, or connector workflows.
3. **Design-system tree** - `DESIGN.md` variants extracted from brand sources,
   generated artifacts, screenshots, Figma/GitHub/Notion sources, and user edits.
4. **Automation template tree** - repeatable recipes that wire triggers,
   ingestion, transforms, review gates, and output sinks.

Automations is the user-facing way to start, schedule, review, and refine those
loops. A routine, Orbit digest, live-artifact refresh, connector import, skill
crystallizer, or design-system extractor is an automation template, not a
separate product island.

## System model

```
source event
  -> ingestion adapter
  -> canonical content packet
  -> compression / redaction / chunking
  -> classifier
  -> evolution proposal
  -> human or policy gate
  -> memory tree | skill tree | design-system tree | automation template tree
  -> agent context resolver
  -> future run
```

### Source events

Supported source events should share one ingestion contract:

- User upload: Markdown, PDF text, images, zip/folder, exported design assets.
- URL or repo: GitHub repo/path, docs URL, design-system source, skill pack.
- Connector pull: GitHub, Notion, Slack, Drive, Calendar, Figma-like sources as
  connector coverage expands.
- Product event: chat transcript, generated artifact, critique result,
  live-artifact refresh, Orbit digest, successful automation run.
- Manual edit: user changes a memory node, skill, design system, or template.

### Canonical content packet

Every ingested item becomes a packet with:

- `id`, `sourceKind`, `sourceRef`, `title`, `capturedAt`, `provenance`.
- `bodyMarkdown` after HTML/PDF/source canonicalization.
- `attachments[]` for files that should remain outside the prompt.
- `sensitivity` and `capabilityHints` for connector and secret boundaries.
- `tokenStats` before and after compression.
- `candidateSinks`: memory, skill, design system, automation template.

The packet should be inspectable in UI and available to `od automation`.

## Automation templates

An automation template is a typed recipe, not only a prompt:

```ts
interface AutomationTemplate {
  id: string;
  title: string;
  purpose: string;
  triggerKinds: Array<'manual' | 'schedule' | 'connector' | 'project-event'>;
  sourceKinds: Array<'upload' | 'url' | 'repo' | 'connector' | 'artifact' | 'chat'>;
  stages: AutomationStage[];
  outputSinks: Array<'memory' | 'skill' | 'design-system' | 'automation-template' | 'artifact'>;
  reviewPolicy: 'always' | 'trusted-source' | 'auto-apply';
  tokenCompression: 'off' | 'balanced' | 'aggressive';
}
```

Initial templates:

| Template | Trigger | Output |
|---|---|---|
| Ingest source into memory tree | Manual, connector, schedule | Memory nodes + summaries. |
| Extract design system | Upload, URL, repo, artifact | Draft `DESIGN.md`, tokens preview, project binding proposal. |
| Crystallize successful run into skill | Project event, manual | Draft `SKILL.md` with examples, files, and test prompts. |
| Connector digest to design context | Schedule, connector | Memory updates, artifact inputs, follow-up tasks. |
| Compress project context | Manual, schedule | Rewritten compact nodes and token-budget report. |
| Promote artifact style | Manual, critique result | Design-system variant extracted from a strong artifact. |
| Improve existing skill | Project event | Patch proposal for an existing skill after repeated successful use. |

## Memory upgrade

The current memory surface is a flat Markdown store plus an editable index. The
self-evolution target is a tree that remains file-based and editable:

```
memory/
  MEMORY.md
  user/
  projects/<project-id>/
  connectors/<connector-id>/<account-or-source>/
  artifacts/<project-id>/<artifact-id>/
  design-systems/<slug>/
  skills/<slug>/
  summaries/
```

Required capabilities:

- Tree API and UI for browsing, moving, editing, deleting, and merging nodes.
- Each node has provenance back to source packets and automation runs.
- Agent context resolver reads the tree and chooses only task-relevant nodes.
- Per-project and per-agent memory scopes.
- Conflict handling when an automation proposes edits to a manually edited node.
- Import/export as plain Markdown for review and backup.

## Agent consumption

Every agent run should receive a resolved context bundle:

1. Active design system tokens and relevant `DESIGN.md` sections.
2. Selected memory tree nodes with provenance trimmed out unless needed.
3. Active skill bodies and any skill-tree proposals accepted by the user.
4. Connector tool access scoped through daemon token grants.
5. Compression report when token compression changed the input.

The resolver must be deterministic enough to test. A green automation run is not
sufficient if the resulting memory, skill, or design-system content is never
available to the next agent run.

## Token compression

Token compression is opt-in per automation template and per project:

- `off` - preserve full canonical Markdown.
- `balanced` - strip boilerplate, convert HTML to Markdown, summarize large
  repeats, keep named entities, links, code fences, and design tokens.
- `aggressive` - produce compact retrieval chunks for high-volume connectors.

The UI must show before/after token estimates and a diffable summary. The CLI
must expose the same controls so scheduled and connector-driven flows can run
headlessly.

## Design-system evolution

Design-system evolution is the product-specific center of gravity:

- Extract a draft `DESIGN.md` from brand docs, screenshots, repos, Figma-like
  connectors, websites, and strong generated artifacts.
- Keep variants as branches in the design-system tree instead of overwriting the
  active system blindly.
- Run validation against the existing `DESIGN.md` schema and preview renderer.
- Promote a variant only after review, or under an explicit trusted automation.
- Feed recurring critique failures back into design-system anti-patterns,
  component rules, or token choices.

This keeps OD positioned as a self-evolving design agent rather than a generic
personal assistant.

## UI and CLI closure

Every user-facing capability must land in both surfaces:

| Capability | Web UI | CLI |
|---|---|---|
| List templates | Automations template picker | `od automation template list --json` |
| Run ingestion | Automations "Ingest source" panel | `od automation source ingest --source-kind <kind> --body-file <path|-> --json` |
| Inspect source packets | Recent ingestions list | `od automation source list/get --json` |
| Review proposals | Review drawer with diff and apply/reject | `od automation proposal list/apply/reject --json` |
| Edit memory tree | Settings -> Memory tree | `od memory tree ... --json` |
| Manage token compression | Ingestion compression selector | `od automation source ingest --compression off|balanced|aggressive --json` |
| Promote design system | Evolution proposal apply action | `od automation proposal apply <proposal> --json` |
| Crystallize skill | Evolution proposal apply action | `od automation proposal apply <proposal> --json` |

## Implementation phases

### Phase 0 - Spec and contracts

- Add contract types for automation templates, source packets, evolution
  proposals, memory tree nodes, and compression reports.
- Decide whether existing `/api/routines` becomes an implementation detail under
  `/api/automations` or remains a compatibility alias.
- Add fixtures that prove memory, skill, and design-system proposals can be
  represented without running an LLM.

### Phase 1 - Memory tree MVP

- Replace flat memory listing with tree-aware list/detail/update endpoints.
- Keep the current file-backed Markdown store; add an index layer rather than a
  hidden opaque database.
- Inject selected tree nodes into daemon and BYOK/API-mode agent prompts.
- Add `od memory tree list/view/edit/move` and matching Settings UI.

Initial concrete surface:

- `GET /api/memory/tree` returns derived folder and entry nodes from the
  Markdown-backed memory store.
- `PATCH /api/memory/tree/:id` edits entry-node metadata/body/type while folder
  nodes remain derived from entry buckets.
- `od memory tree list/view/edit/move` mirrors the Settings memory-tree view so
  external agents can inspect and maintain the same prompt-consumed memory.

### Phase 2 - Automation template registry

- Introduce built-in templates for ingestion, connector digest, memory upkeep,
  design-system extraction, skill crystallization, and context compression.
- Add proposal storage and review status.
- Update the existing Automations page and `od automation` commands to present
  templates, not only schedule forms.

Initial concrete surface:

- `/api/automation-proposals` stores reviewable evolution proposals.
- `/api/automation-proposals/:id/apply` and `/reject` provide the review gate.
- `od automation proposal list/get/apply/reject` mirrors the UI review path.
- Memory-node proposals can apply into the Memory tree. Design-system proposals
  can write reviewed `DESIGN.md` drafts under the user design-system root, and
  skill proposals can write reviewed `SKILL.md` drafts under the user skill
  root.

### Phase 2.5 - Source ingestion closed loop

- `POST /api/automation-ingestions` canonicalizes pasted or connector-sourced
  Markdown into a stored source packet.
- `GET /api/automation-source-packets` and `/:id` expose packet provenance for
  UI and headless consumers.
- `od automation source ingest/list/get` mirrors the Automations source panel.
- Ingestion creates reviewable memory, design-system, and skill proposals from
  the selected template, with optional off/balanced/aggressive token compression
  and before/after token reports.

### Phase 3 - Design-system and skill crystallization

- Add design-system extraction as the first high-value self-evolution flow.
- Add skill crystallization from a completed run with a generated `SKILL.md`,
  examples, provenance, and test prompts.
- Require human review before writing to bundled/user skill or design-system
  roots; accepted proposals write only to user-owned runtime roots.

### Phase 4 - Connector-driven evolution

- Let trusted connector schedules create source packets.
- Map connector source categories to default templates.
- Persist connector provenance so a user can trace which source updated which
  memory, skill, or design-system node.

### Phase 5 - Compression and quality loops

- Add balanced/aggressive compression implementations and reports.
- Feed critique/design-jury outcomes back into memory and design-system
  proposals.
- Add rollback and stale-node detection.

## Acceptance checklist

- Fast ingestion can accept upload, URL/repo, connector, artifact, and chat
  sources into one packet shape.
- Memory is a tree, editable by humans, and consumed by agents.
- Automations expose templates for ingestion, memory upkeep, skill
  crystallization, connector digest, design-system extraction, and compression.
- Connector-driven runs can create reviewable self-evolution proposals.
- Token compression is optional, visible, and available in UI and CLI.
- Successful runs can become skill proposals.
- Brand/source/artifact content can become design-system proposals.
- UI and CLI use the same daemon APIs and contracts.
- Review gates, provenance, and rollback exist before any trusted auto-apply
  mode is enabled.
