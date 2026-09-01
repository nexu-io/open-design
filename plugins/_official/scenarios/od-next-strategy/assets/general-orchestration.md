# OD Next General Orchestration v2.0.0

## Contract ownership

Open Design owns the V2 schemas, durable task-chain state, applied content
identity, selected Agent, and native session. The Agent prepares contract
content and executes Build work; it does not invent runtime records or treat
natural-language claims as structured capability facts. The Agent supplies
complete, validatable content and performs the actual Preflight checks; the
formal protocol objects are still created, validated, persisted, and
re-injected by Open Design. Below, "form, freeze, or update" describes content
preparation only — never substitute prose claims for the actual results of the
schema, the RunManifest, or Preflight.

The Resolved Task Profile owns the goal, audience and context, input
references, constraints, canonical deliverable, required deliverables, Design
Spec, Build Requirements, assumptions, risks, and task-specific fields. The
Full Plan owns ordered steps, readiness artifacts, execution mode, and Build
Packages. The RunManifest binds the selected Agent, capability snapshot,
inputs, production routes, and the two Preflight results.

This Skill does not define the main Agent's identity, permissions, or security
boundaries (those follow the Core Strategy). It does not define task-specific
field enums, the Artifact Contract, the Quality Contract, default
deliverables, complex-split boundaries, or quality priorities (those follow
the current TaskProfileVersion and the current task-type profile). It does not
choose or replace the user-selected Agent and does not dictate a Child's
internal context, skill-loading location, or implementation.

## Protocol objects and semantic boundaries

- `TaskProfileSchema` defines the field groups and slot rules shared across
  task types.
- `TaskProfileVersion` is the single versioned authority for the current task
  type's field semantics, dependency rules, Artifact Contract, and Quality
  Contract. Its Artifact Contract defines only allowed values, defaults, and
  validation rules; its Quality Contract defines how the baseline quality
  rules that generation must satisfy are instantiated.
- The resolved Task Profile is this task's requirements contract: what to
  build, what to protect, what to deliver, and what completion is measured
  against. A user-authorized contract update revises it (or the Direct Edit
  versioned minimal change contract) without overwriting historical versions.
- The canonical deliverable is the single source of truth for the current
  Run; derived and variant deliverables must declare their dependency on it
  or on other upstream deliverables. The Resolved Profile or the Direct Edit
  minimal change contract stores this Run's canonical deliverable id, and the
  RunManifest binds its id and version.
- The `RunManifest` is the version-binding and decision snapshot: the current
  request, the user-selected Agent, actual input references, baseline
  artifact versions, the capability snapshot, execution decisions, production
  routes, Build Packages, and the two Preflight results.
- The run state Open Design records captures this Run's execution state and
  actual history; it never rewrites the Task Profile in reverse.
- The `Design Spec` is the set of visual decisions frozen for this Run —
  palette, type family and size scale, spacing rhythm, corner radii and
  shadows, icon family, motion durations — written into the Task Profile's
  design-direction field. When the task configuration specifies visual style,
  information density, or motion intensity, the Design Spec must agree with
  it. It is held by the Resolved Profile, version-bound by the RunManifest,
  and is the shared constraint for Build and derived deliverables. When a
  Design Spec already exists, read and continue it; update it only through a
  user-authorized contract update on an explicit user change — never reinvent
  it just because a new generation round started.
- The `Resolved Requirement Set` is this Run's stable set of requirement ids:
  for Full Plan it comes from the Resolved Profile; for Direct Edit it comes
  from the baseline Profile, or from a versioned minimal change contract
  validated by the TaskProfileVersion.
- The completion standards reference only requirement IDs from the Resolved
  Requirement Set, and serve as the standards Build must satisfy in one pass
  while writing source. They are not a post-delivery inspection tool, and
  they must not add, remove, or rewrite requirement standards.

Task Profile slots may carry internal metadata: `required` (hard, conditional,
optional), `source` (user, asset, project, artifact, inferred, default),
`mutability` (locked, editable), `missing_policy` (extract, infer, default,
ask, block), and `stage_visibility`.

The Resolver must distinguish confirmed, inferred, defaulted, missing, and
conflicted. Internal metadata need not be shown to the user item by item, but
inferences, defaults, conflicts, risks, and locked requirements must stay
recognizable in the resolved Task Profile.

## The ship-on-write boundary (non-negotiable)

Writing the primary HTML deliverable to disk IS the delivery. Never perform
any post-generation action on a generated artifact for the purpose of quality
checking:

- Screen captures, rendering, render review, or frame extraction.
- Opening or previewing the artifact: web viewers, headless runtimes
  (Playwright, Puppeteer, etc.), simulators, or players.
- Running validation scripts, tests, or format checks against a generated
  artifact.
- Validating export results after exporting.
- Spawning acceptance Children or performing formal acceptance of any kind.
- Any fix round initiated on the basis of the checks above.

Allowed actions, for boundary clarity: reading an existing artifact's source
to continue editing it, and probing its technical form and design language,
are Build inputs and outside this section's scope; routine code reading and
modification during Build writing are Build itself. What is forbidden is any
action taken after the artifact hits disk whose purpose is checking quality,
confirming the result, or collecting evidence.

Quality is not guaranteed by post-generation checks but by generation-time
discipline: every quality requirement in the Task Profile, Design Spec,
completion standards, and task-type profile must be satisfied in one pass,
while writing the source.

## Identify the input stage

Use the stage supplied by Open Design:

- `request`: the user raises a new design or change requirement; choose and
  lock the route for the new logical task.
- `clarification`: questions were asked last turn; merge the user's one
  allowed answer round into the Full Plan.
- `contract_repair`: serialize the frozen plan once into the required shape.
- `production`: execute the frozen Full Plan in the continued native session.

Only `request` chooses a route. Later stages preserve the route and any locked
execution mode:

- `clarification` stays on the Full Plan route — process the answer, rerun the
  affected Preflight work, and freeze.
- `production` reuses the existing resolved Task Profile, Full Plan, and
  RunManifest decision snapshot; it does not re-plan or ask again.

A task chain means one `request` plus its subsequent `clarification`,
`contract_repair`, and `production` turns.

## Direct Edit

Direct Edit and Full Plan describe planning routes, not artifact lifecycle
operations. Create, continue, edit, repair, and replicate tasks are each
routed on their own change scope and risk. Decide exactly once per `request`;
the decision holds for the whole task chain.

Direct Edit is eligible only when ALL of the following hold:

- An editable baseline artifact already exists.
- The user is asking for an explicit, local adjustment.
- The change does not alter the task scope, the core narrative, the core
  design direction, the canonical deliverable's identity / format / source of
  truth, or the main deliverable contract. An ordinary content version update
  does not count as a canonical-identity change.
- The affected scope and dependencies can be reliably bounded.
- The change can be completed without redoing the overall solution.

Enter Full Plan when any of the following holds:

- Creating an artifact from scratch.
- A full redesign or large-scale refactor.
- Changing the core narrative, information architecture, design direction,
  the canonical deliverable's identity / format / source of truth, the
  production route, or the main deliverable contract.
- The work needs to split into multiple Build Packages to complete reliably.
- The affected scope cannot be reliably bounded, or editing in place carries
  obvious whole-artifact rework risk.
- User clarification is needed before the change target or authorized scope
  can be safely bounded.
- Direct Edit eligibility cannot be safely confirmed.

Direct Edit completes within the current request turn: no resolved Task
Profile, no Full Plan, and no clarification round. Ambiguities that are local
and reversible are resolved by conservative assumption and disclosed at
delivery. Before Build:

1. Bind the baseline profile reference, the TaskProfileVersion, and the
   baseline artifact reference. When no usable resolved Profile exists,
   resolve at minimum a versioned minimal change contract covering the
   authorized scope, the canonical and affected deliverables, editability,
   the production route, and completion standards, and form a Resolved
   Requirement Set with stable ids. If that cannot be resolved safely, lock
   Full Plan instead — this is a route correction before Build, not a
   mid-execution switch: continue this turn on the Full Plan route and report
   the routing truthfully.
2. Record in the versioned minimal change contract: the baseline version, the
   authorized change scope, content that must be protected, the expected
   result, affected regions and dependencies, and risk flags. Probe the
   baseline artifact's technical form and existing design language first and
   continue them; never assume an unconfirmed default.
3. Complete Intake Preflight and the Execution Preflight relevant to this
   change, and form the RunManifest.
4. Lock route `direct_edit` and execution mode `simple`.

The main Agent then modifies only the user-authorized scope and completes the
Build, keeping affected regions and dependent regions consistent as part of
the writing itself. The change is delivered the moment it is written; no
post-generation check, acceptance, or fix action follows. Direct Edit always
uses simple mode and never starts Build Children.

Route lock: never switch between Direct Edit and Full Plan mid-execution. If
eligibility fails before Build begins, lock Full Plan instead. If scope
escapes the locked Direct Edit after Build begins:

- Do not widen the change scope on your own.
- Stop the risky modification.
- Preserve the minimal change contract, the completed portion, and the
  blocking reason.
- Report blocked with the preserved work facts and suggest the user relaunch
  next turn as a Full Plan.

## Full Plan

For a Full Plan request, proceed in this order:

1. Resolve the task type from explicit project metadata and mapping. Use
   `generic` or report blocked when the task type cannot be identified.
2. Draft the Task Profile from the request, project, baseline artifact,
   attachments, and brand references, per the drafting rules below. Mark
   assumptions and conflicts.
3. Run Intake Preflight for input access, route support, selected Agent
   native continuation, task-profile availability, and resolvable
   dependencies.
4. Ask one clarification round only when the answer changes task scope,
   direction, canonical deliverable, main outputs, editability, or
   substantial rework. Use one to three questions with recommended defaults,
   per the aggregation rules below.
5. Merge the answer, rerun only affected resolution and Preflight work, and
   do not ask again.
6. Freeze the Task Profile, Design Spec, and stable Build Requirement ids,
   and form the Resolved Requirement Set.
7. Produce ordered Full Plan steps and versioned readiness artifacts.
8. Choose simple by default. Choose complex only when at least two
   independent Build Packages have frozen shared constraints, native Child
   support has structured verified evidence, parallelism materially helps,
   and integration risk is bounded.
9. Run Execution Preflight for every declared production route, dependency,
   input, renderer, exporter, template, and required output owned by the
   Agent.
10. Emit a strict Plan Contract and Runtime State for Open Design to parse.

The request and clarification turns stop after this planning output. They may
inspect bounded references needed by the contract, but must not mutate or
dispatch deliverables. Open Design starts Build by continuing the same native
session into `production`; the user does not resubmit the request.

### Drafting the Task Profile

When an artifact already exists, first probe the artifact itself for its
technical form, production route, and existing design language (palette,
type, spacing, component and icon style), and use that as the Design Spec
baseline. Treat unprobeable dimensions as missing — ask, mark as an
assumption, or fall back to the baseline default. Never continue on an
unconfirmed assumed default; a silent assumption skews every decision after
it.

When the user has not specified a visual style and there is no brand guideline
or existing artifact to continue, never skip the direction decision and start
writing: first infer a reasonable, self-consistently explainable style
direction from the task scenario, target audience, and content temperament
(color mood, type personality, information density, decorative weight), write
it into the Design Spec, and vocalize the chosen direction in one sentence of
prose so the user can redirect cheaply. Direction selection serves one goal —
the artifact meets scenario expectations at first glance. The Design baseline
owns the quality floor; the direction decision owns the first impression.

The draft makes the scope and authority of assets and references explicit,
and includes at least:

- The task goal.
- Usage context and target audience.
- Inputs, assets, and references.
- Constraints that must be honored and preserved.
- The canonical artifact and expected deliverables.
- The Design Spec: continued from the existing artifact, from brand
  guidelines, or newly built on the baseline.
- Confirmed information.
- Reasonable assumptions.
- Missing items, conflicts, and uncertainties.

The draft must retain every hard field and every triggered conditional field
of the current TaskProfileVersion. Never silently collapse multiple inputs,
scenarios, or deliverables into one value.

If a resolved Task Profile already exists, build a user-authorized contract
update and an updated draft on top of it; do not re-derive from scratch.
Locked fields change only after the user explicitly changes them through a
contract update.

### Resolver

1. Merge the shared schema with the current TaskProfileVersion.
2. Collect candidate values in the Core Strategy's instruction order.
3. Keep locked values; form a user-authorized contract update when the user
   explicitly changes one.
4. Resolve multi-source information by each field's declared authority,
   scope, and conflict rules.
5. Execute extract, infer, default, ask, or block per `missing_policy`.
6. Output the Resolved Profile, preserving inferences, defaults, conflicts,
   and risks.

When a hard field is missing, a substantive conflict exists, or a critical
assumption is unhandled, an executable Full Plan must not be produced.

### Two-phase Preflight

Intake Preflight completes as much as possible before the single
clarification round and before freezing:

- Are the inputs, current artifacts, and required references accessible?
- Does the user-selected Agent meet the capabilities the current
  TaskProfileVersion declares as required, including native continuation
  support?
- Do the canonical artifact and required deliverables have a viable
  production route?
- Are there external operations that need user authorization?

Execution Preflight completes after the resolved Task Profile (or the Direct
Edit minimal change contract) freezes and before Build:

- Is every declared production route, adapter, and dependency the Agent owns
  under the current task contract available?
- Do fonts, templates, and assets satisfy the current contract? Product-side
  downstream renderers and exporters are outside the Agent's Execution
  Preflight.

Preflight is the deterministic capability gate before Build. It checks input
and capability availability only; it never opens, renders, or examines any
generated artifact. When a baseline input changes unexpectedly, or the
production route, adapter, canonical deliverable identity or format, required
deliverables, or delivery contract changes, the affected Preflight is
immediately void and must rerun.

### The clarification round

Ask only when the answer would change the task scope, the core direction, the
canonical deliverable's identity or contract, the main deliverables,
editability, or cause substantial rework.

- At most one round, with one to three questions.
- Before asking, aggregate every user-resolvable issue from the Resolver and
  Intake Preflight into that single round.
- Give each question a recommended answer and briefly state its impact.
- Never ask for information reliably extractable from existing assets,
  artifacts, or the conversation.
- Never ask about details that are local and reversible.
- Fold any task-type-switch proposal into the same round, alongside the other
  aggregated questions.

After the answer arrives, rerun only the affected resolution and Preflight
work, and do not ask again. A fallback may change only the execution
approach; a fallback that would change the requirements contract must use an
alternative the user has already confirmed — otherwise report blocked. Never
degrade silently.

### Freezing the plan

When no clarification is needed, freeze the draft directly. Never output a
draft and a frozen version with duplicated content side by side.

The route closes in this order:

1. Freeze the Resolved Profile first — including this Run's canonical
   deliverable id, required deliverables, the final completion-standard
   requirement ids, and the Design Spec — and form the Resolved Requirement
   Set.
2. Produce the draft Full Plan, candidate production routes, and the
   readiness planning artifacts the task type declares.
3. Once readiness is satisfied, resolve the execution mode: `simple` or
   `complex`.
4. Run Execution Preflight against the actual routes, deliverables, adapters,
   and readiness artifacts.
5. Only after Preflight passes, freeze the Full Plan and the RunManifest
   decision snapshot. A contract-equivalent fallback may update the execution
   approach; a fallback that changes the requirements contract must already
   have user confirmation — otherwise report blocked.

The resolved Task Profile keeps the drafting field structure and makes
explicit: the task type and TaskProfileVersion, the constraint relationships
of inputs and references, the locked scope, the canonical artifact and
deliverable contract, task-type-specific fields, the inferences and defaults
adopted, and known risks and unresolved conflicts.

The Full Plan includes at least:

- The execution mode: `simple` or `complex`.
- Ordered execution steps and each step's outputs.
- Dependencies.
- Shared constraints to preserve.
- Required deliverables and their derivation relationships.
- The completion standards. They reference only requirement IDs from the
  Resolved Requirement Set, as the standards Build writing must satisfy;
  they must not add, remove, or rewrite requirement standards, and are not
  used for post-delivery inspection.

`simple` / `complex` describes Build orchestration only. It does not replace
Direct Edit / Full Plan and does not describe the task's inherent complexity.

The current TaskProfileVersion may declare complex-readiness requirements.
Before choosing `complex`, serially produce and freeze those planning
artifacts and the Design Spec, and write their versions or digests into the
RunManifest. When readiness is unmet, only `simple` may be chosen — Build
Children must never each guess at the shared constraints.

### Choosing the execution mode

Default to `simple`. Choose `complex` only when ALL of the following hold:

- The work splits into at least two independent Build Packages with clear
  boundaries that can produce output independently.
- The shared constraints can be frozen up front.
- Native Child lifecycle support has structured verified evidence.
- Parallel Build meaningfully shortens completion time, and the integration
  cost and consistency risk are bounded.

Each complex Build Package declares its objective, inputs, outputs, shared
constraints, dependencies, allowed resources, and a boundary that avoids
duplicating another package. Independent packages may run in parallel;
dependent packages wait for their declared inputs.

The RunManifest decision snapshot records at least: the user-selected Agent,
the Profile and baseline artifact versions, actual input references, the
capability snapshot, the execution mode, each production route and its target
deliverables, readiness artifact versions, and the Preflight results.

## Contract repair

Use the `contract_repair` stage only when Open Design reports that the semantic
plan is frozen but its V2 serialization is malformed. Make one serialization
attempt. Do not call tools, reconsider the task, change the goal, add or remove
steps, alter route or execution mode, or ask the user. If a valid representation
cannot be produced, report blocked.

## Production

In simple mode, the main Agent reads the frozen Task Profile, Design Spec,
Full Plan, and RunManifest, performs the ordered Build against the current
task-type profile, and produces every required deliverable. The moment every
required deliverable is written, deliver — no post-generation check,
acceptance, or repair.

In complex mode, the main Agent starts native Child work for dependency-ready
Build Packages. Each Child receives only its package, necessary inputs, frozen
shared constraints (including the Design Spec), dependencies, expected
outputs, and allowed resources — the asset and artifact locations it may
read. Independent packages may run in parallel; dependent packages run in
dependency order. The main Agent owns scheduling, progress, conflicts,
integration, and final delivery; it does not redo already assigned Build
work. Integrate into the complete artifact; the moment every required
deliverable is written, deliver. A locked complex task reports blocked if
native Child start or structured terminal lifecycle fails — never fake
completed parallel orchestration; return the capability blocker explicitly.

Production never selects a different route or execution mode, never creates a
replacement semantic plan, and never asks another question.

### Build discipline

The Build stage writes source files directly against the generation-time
discipline of the resolved Task Profile, Full Plan, Design Spec, completion
standards, and current task-type profile. Every quality requirement —
structural completeness, correct font and asset references, overflow-free
layout, safe areas, contrast, locked-content fidelity — is satisfied in one
pass while writing, not checked and patched afterwards.

Never generate export files, probe export capabilities, or implement
conversion tools for derived formats outside the contract.

The moment the artifact hits disk, delivery begins, under the ship-on-write
boundary: no screen captures, no rendering, no preview, no playback, no
validation runs, no acceptance Children, no formal acceptance, and no fix
round based on any check. Never claim the artifact went through any of those
actions, and never fabricate their results.

Build's self-discipline happens only during writing: organize the source
against the completion standards and the task type's quality requirements;
disk write is finalization.

## Outcome

Use exactly one logical outcome — these five terms are the only outcome
vocabulary:

- `clarification_required` after the initial Full Plan request needs its one
  answer round;
- `plan_ready` when a valid Full Plan and locked execution mode can continue;
- `completed` when Direct Edit or Production produced all required outputs —
  assumptions, asset substitutions, and other non-blocking risks do not
  change the outcome; disclose them in the prose summary;
- `blocked` when a required dependency or locked execution path cannot
  finish, a required deliverable is missing, a new user decision or external
  capability is needed, or execution failed with no safe recovery path in
  the current task chain;
- `canceled` when the task was canceled by the user or an upper runtime.

## Output requirements

### When the outcome is clarification_required

- The prose contains only: a brief account of the inferences, defaults, and
  conflicts that would change the result; Intake Preflight blockers; and the
  one to three aggregated questions with recommended answers.
- The Task Profile draft stays in internal working state — not expanded in
  prose, and no machine-contract block is output.
- Retain every hard field and triggered conditional field of the current
  TaskProfileVersion.

### When the outcome is plan_ready

- Emit the complete Task Profile, Full Plan, and completion standards in the
  hidden structured blocks the V2 machine contract specifies; machine
  structures must never rely on Markdown headings or natural-language field
  names for parsing.
- The user-facing prose carries only the decision-relevant summary: goal,
  required deliverables, key result-changing constraints, inferences or
  defaults, risks, and open decisions. When there are no open decisions, do
  not ask the user for confirmation.
- The Run's execution mode, production routes, and Preflight results stay in
  the machine contract; they enter the decision summary only when they would
  change the user's outcome.
- Under `complex`, attach the Build Packages in the machine contract.

### Final delivery

- The actual deliverables and how to really open them.
- The final outcome.
- Adopted assumptions, unresolved issues, capability limits, or usage notes.

The user summary states real outputs, assumptions that affected the result,
and unresolved blockers without displaying machine structures. Omit empty
optional subsections entirely; never output an empty heading or "none".

## Time and model-cost constraints

Without lowering delivery quality:

- Reuse the Profile, contract updates, the Full Plan, the RunManifest, and
  asset references already present in the same session.
- Project only the fields visible to the current stage; reference locations
  instead of re-expanding full artifact or asset text.
- Give Children only what they need; never start Build Children with
  overlapping responsibilities, and never generate multiple unrequested
  variants in parallel.
