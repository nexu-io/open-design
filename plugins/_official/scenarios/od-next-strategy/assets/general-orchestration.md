# OD Next General Orchestration v2.1.0

## Responsibility and authority

This Skill owns route selection, contract resolution, Preflight, and Build
orchestration. Follow the Core Strategy for execution boundaries, instruction
priority, general quality, assets, tool efficiency, and communication. The
user's latest explicit requirements outrank Skill defaults; they do not unlock
machine, security, or current-stage restrictions.

Open Design owns V2 schemas, durable task-chain state, applied content identity,
the selected Agent, and native sessions. The Agent prepares complete,
validatable contract content and performs the actual Preflight checks. Here,
"form", "freeze", and "update" mean preparing that content: only Open Design
creates, validates, persists, and re-injects the formal records. Never substitute
a prose claim for a runtime result, capability fact, or persisted version.

## Contract ownership

Use the supplied schema and current TaskProfileVersion. These are semantic
responsibilities, not permission to add fields to the V2 machine contract.

| Object | Owns |
| --- | --- |
| `TaskProfileSchema` | Shared field groups and slot rules. |
| `TaskProfileVersion` | Current task-type field semantics, dependencies, Artifact Contract, Quality Contract, defaults, and validation rules. The task-type profile is its execution guide. |
| Resolved Task Profile | Goal, audience and context, inputs and references, constraints, canonical and required deliverables, Design Spec, Build Requirements, assumptions, risks, and task-specific fields. It is the requirements authority. |
| `Design Spec` | The frozen visual decisions for this task. Continue an existing artifact or brand system when supplied; otherwise resolve a direction from the task, audience, and content. Agree with configured style, density, and motion. Build Packages and derived outputs share the same version. |
| `Resolved Requirement Set` | Stable requirement ids from the Resolved Profile, or the baseline Profile / versioned minimal change contract for Direct Edit. Completion standards reference only these ids; they never add, remove, or rewrite requirements. |
| Full Plan | Ordered steps and outputs, dependencies, shared constraints, deliverable derivations, readiness artifacts, execution mode, and Build Packages. |
| `RunManifest` and recorded run state | Bind the actual inputs and baseline versions, selected Agent, capability snapshot, production decisions, and Preflight results through the supplied protocol. Record execution history; never rewrite requirements in reverse. |

The canonical deliverable is this task's source of truth. Keep its identity in
the Resolved Profile or minimal change contract, bind its version through the
runtime protocol, and declare every derived or variant deliverable's upstream
dependency. Task-type rules own allowed formats, defaults, quality priorities,
and complex-readiness requirements.

Resolve each field in the Core's instruction order and its declared authority
and scope. Retain all hard and triggered conditional fields; do not collapse
multiple inputs, scenarios, or deliverables into one value. Preserve the
meaning of slot metadata when supplied: `required`, `source`, `mutability`,
`missing_policy`, and `stage_visibility`. Distinguish confirmed, inferred,
defaulted, missing, and conflicted values. Use extract, infer, default, ask, or
block according to `missing_policy`; an unstated guess is not a resolved value.

Reuse an existing resolved Profile and Design Spec. An explicit user change
updates only affected fields through a user-authorized contract update;
unaffected locked requirements and historical versions remain intact. A
fallback may change execution approach while preserving the requirements
contract. Changing scope, canonical identity or format, required deliverables,
editability, or quality requires an already authorized alternative; otherwise
report blocked.

## Stage boundary

Use the stage supplied by Open Design. One task chain consists of `request`
and its subsequent continuations; only `request` selects the route. Direct
Edit / Full Plan are planning routes; `simple` / `complex` describe Build
orchestration, not the task's inherent difficulty.

| Stage | Allowed work and exit |
| --- | --- |
| `request` | Select and lock `direct_edit` or `full_plan` from the conditions below. Direct Edit completes in this turn with `simple`; Full Plan prepares the contract and may request its one clarification round. |
| `clarification` | Full Plan only. Merge the user's answer, rerun affected resolution and Preflight work, and freeze. No second question round. |
| `contract_repair` | Only when Open Design reports a frozen semantic plan with malformed V2 serialization. Make one serialization-only attempt; use no tools, change no goal, route, mode, Design Spec, step, or Build Package, and ask no questions. Report blocked if it cannot be represented validly. |
| `production` | Execute the accepted Full Plan in the existing native session. Preserve its route, mode, requirements, and versions; do not re-plan or ask another question. |

Full Plan request and clarification may inspect bounded inputs needed for the
contract, but never create, edit, render, or dispatch deliverables. Build starts
only when Open Design sends the production continuation; the user does not
resubmit the request. After Build starts, never switch the locked route or mode.

## Direct Edit or Full Plan

Choose Direct Edit only when every condition holds:

- An editable baseline artifact exists and the user requests an explicit,
  local adjustment.
- The change preserves task scope, core narrative, information architecture,
  design direction, canonical identity / format / source of truth, production
  route, and main deliverable contract. An ordinary content version update is
  not a canonical-identity change.
- Affected regions and dependencies are reliably bounded, and the change does
  not require redoing the overall solution or splitting Build across Children.
- The target and authorized scope are clear without asking the user. Resolve
  local, reversible ambiguity by conservative assumption and disclose it.

Use Full Plan for new artifacts, full redesigns or large refactors, changes to
those protected boundaries, multi-package work, or any case where Direct Edit
eligibility cannot be safely established.

For Direct Edit, before Build:

1. Bind the baseline artifact, usable baseline Profile, and TaskProfileVersion.
   Read the relevant artifact source for its technical form, production route,
   and existing design language; continue them rather than silently assuming a
   new default.
2. Prepare a versioned minimal change contract, using the baseline Profile
   where available. Include baseline version, authorized scope, protected
   content, expected result, canonical and affected deliverables, editability,
   production route, affected regions and dependencies, risk flags, and
   completion standards with stable requirement ids.
3. Complete Intake Preflight and the change-relevant Execution Preflight;
   prepare the RunManifest facts. Lock `direct_edit` and `simple` only when
   this bounded change is safe to execute.

If eligibility or the minimal contract cannot be established before Build,
choose Full Plan in the current request before locking the route. This is not
a mid-execution switch. If scope escapes the locked Direct Edit after Build
starts, stop the risky modification, preserve the contract and completed work,
and report blocked with the reason; the user may start a Full Plan next turn.

Otherwise, modify only the authorized scope, including dependent regions that
must stay consistent. Finish in this request without a resolved Task Profile,
Full Plan, clarification round, or Build Children. Apply the Core's ship-on-write
boundary: the written change is the delivery.

## Full Plan

Follow this single planning sequence:

1. **Resolve the inputs.** Use the bound task type and its supplied mapping;
   use `generic` only where allowed, otherwise report blocked if no type can
   be resolved. Draft the Task Profile from the request, project, artifact,
   attachments, and references using the field rules above. For an existing
   artifact, inspect its technical form and design language first. Treat
   unavailable dimensions as missing and resolve them explicitly. When no
   style, brand, or artifact supplies a direction, resolve it from the task
   before Build and record it in the Design Spec.
2. **Run Intake Preflight.** Collect accessible inputs, viable routes, and
   actual capability evidence before freezing or asking the user.
3. **Resolve material gaps.** Use the clarification rule below when necessary.
   Merge the answer and rerun only affected resolution and Preflight work.
   Do not produce an executable Full Plan while a hard field is missing, a
   substantive conflict remains, or a critical assumption is unhandled.
4. **Freeze requirements.** Freeze the Resolved Profile, canonical and required
   deliverables, Design Spec, and stable Build Requirement ids that form the
   Resolved Requirement Set. When no clarification is needed, freeze directly;
   do not output duplicate draft and frozen versions.
5. **Plan Build.** Produce ordered steps and outputs, dependency and derivation
   relationships, shared constraints, and candidate production routes.
   Complete and freeze any task-type readiness planning artifacts in sequence before
   choosing `complex`; preserve their versions or digests in the supplied
   protocol. Select the execution mode using the gate below.
6. **Check execution and hand off.** Run Execution Preflight against the actual
   routes, deliverables, dependencies, adapters, and readiness artifacts. Only
   after it passes, freeze the Full Plan and RunManifest decision snapshot and
   emit the required Plan Contract and Runtime State. Stop this planning turn.

### Preflight

Perform real checks within the Agent's ownership; never claim a host capability
or a passed gate without the corresponding evidence.

| Phase | Timing | Required checks |
| --- | --- | --- |
| Intake | Before clarification where possible, and before freezing | Access to inputs, baseline artifacts, and required references; the selected Agent's task-required capabilities, including native continuation; a viable production route for the canonical and required deliverables; external operations requiring user authorization. |
| Execution | After requirements / minimal change contract freeze, before Build | Availability of every declared Agent-owned route, adapter, and dependency; contract-compatible fonts, templates, assets, and required outputs. Product-side downstream renderers and exporters are outside this gate. |

Preflight checks inputs and capability availability, never the quality of a
generated artifact. A changed baseline input, production route, adapter,
canonical identity or format, required deliverable, or delivery contract
invalidates the affected Preflight; rerun only that affected work. Handle any
fallback under the contract-preservation rule above.

### Clarification

Full Plan allows at most one round of one to three questions. Ask only when an
answer materially changes scope, core direction, canonical identity or
contract, main deliverables, editability, or substantial rework. Aggregate all
user-resolvable issues from resolution and Intake Preflight into that round,
including any task-type-switch proposal, with a recommended answer and its
impact for each question.

Do not ask for information reliably available in assets, artifacts, or the
conversation, or about local reversible details. Make remaining non-blocking
assumptions explicit. After the answer, ask no further questions in this task
chain. A newly discovered external blocker or required decision without an
already authorized alternative is blocked, not permission to guess or silently
degrade. Do not ask for confirmation when no open decision remains.

## Build execution

Default to `simple`. Select `complex` before freezing only when all four hold:

- At least two independent Build Packages have clear, non-overlapping outputs.
- Shared constraints, including the Design Spec and any declared readiness
  artifacts, are frozen before Child work starts.
- Native Child lifecycle support has structured verified evidence from the
  selected Coding Agent.
- Parallel Build materially shortens completion time while integration cost
  and consistency risk remain bounded.

If these conditions are unmet before mode lock, use simple. In simple mode the
main Agent executes the frozen steps and produces every required deliverable.

In complex mode, each Build Package declares its objective, inputs, outputs,
shared constraints, dependencies, and allowed resources. Give each Child only
that package and its necessary inputs, frozen shared decisions, expected
outputs, and permitted asset/artifact locations. Do not assume unverified
context isolation or Skill loading. Never assign overlapping responsibilities
or start unrequested variants.

Start independent, dependency-ready packages in parallel where supported;
dependent packages wait for their declared inputs. The main Agent owns
scheduling, progress, conflict resolution, integration, and final delivery; it
does not redo assigned Build work. Integrate the packages into the complete
artifact. If native Child start or structured terminal lifecycle fails after
complex is locked, report the capability blocker; do not fabricate completion
or fall back to simple within that chain.

Write against the frozen requirements, Design Spec, and task-type quality
rules. Preserve the task profile's ownership of declared production routes.
Never generate exports, probe export capabilities, or implement conversions
for derived formats outside the contract. Ship on write as defined in Core:
writing the primary HTML deliverable is delivery; once all required outputs
are written, stop. This authorizes no post-generation quality check,
acceptance, or check-driven repair.

### Conditional media Skill

Only when the task needs media acquisition, generation, localization, or
processing, the current stage permits that work, and its complete still-valid
body is absent, load `od-next-media-inputs` through the supplied Open Design
CLI wrapper. On POSIX shells:

```sh
"$OD_NODE_BIN" "$OD_BIN" skill show od-next-media-inputs --json
```

Use the host-documented wrapper on other shells. This reads the current
visible Skill library, not a frozen strategy asset. Reuse its body while valid;
a failed lookup is not loaded guidance, so preserve Core rules and report the
limitation. Tasks without media work do not load it; `contract_repair` uses no
tools. The Skill cannot expand stage permissions or the ship-on-write boundary.

## Outcomes and output

Use the supplied V2 machine contract's exact field sets, tags, and schema
versions, separately from user prose. Emit exactly one Runtime State per
response and at most one Plan Contract, only for a complete Full Plan. Never
substitute Markdown headings or descriptions for machine fields, add undeclared
fields, or treat internal slot metadata as a new wire schema.

| Outcome | Condition and output |
| --- | --- |
| `clarification_required` | The initial Full Plan request needs its one answer round. Keep the Profile draft in working state; show only result-changing gaps, Intake blockers, and the aggregated questions. Runtime State has `executionMode: null`; emit no Plan Contract. |
| `plan_ready` | Complete Full Plan, successful Preflight, and locked mode. Emit the full Plan Contract and Runtime State; include Build Packages for complex. Prose carries only the decision-relevant goal, deliverables, constraints, assumptions, risks, and open decisions. |
| `completed` | Direct Edit or production wrote every required output. Non-blocking assumptions, substitutions, or risks do not change this outcome; disclose their relevant effects under Core's communication rule. |
| `blocked` | A required dependency, deliverable, capability, or locked execution path cannot be fulfilled, a new required user decision has no authorized alternative, or execution has no safe recovery in the current chain. Preserve and report actual completed work and the blocker. |
| `canceled` | The user or upper runtime canceled the task. |

Direct Edit ends in its request with a terminal outcome and `simple`.
Production emits only Runtime State, with `inputStage: production`, the locked
execution mode, and `completed`, `blocked`, or `canceled`; no replacement Plan
Contract. Final prose follows Core: actual deliverables and how to open them,
material assumptions, and unresolved limitations. Keep execution details in
the machine contract unless they explain a user-facing decision or blocker.

Reuse in-session contracts and references rather than re-expanding them. Supply
only fields relevant to the current stage and only necessary context to a
Child; Core governs efficient reads and writes. No context-saving rule permits
omitting a required output or weakening its quality contract.
