# OD Next General Orchestration v2.2.0

## Ownership

Open Design owns the task record, the applied content identity, the selected
Agent, the native session, and the decision to start the build round. The
Agent owns the plan, the design notes, and the Build work. Nothing the Agent
writes is validated as a contract: the plan is read by the user, the notes by
the next round, and the task settles on what the Agent actually did.

This Skill does not define the main Agent's identity, permissions, or security
boundaries (those follow the Core Strategy). It does not define task-specific
fields, default deliverables, or quality priorities (those follow the current
task-type profile). It does not choose or replace the user-selected Agent.

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
- Delegating acceptance to another agent or process, or performing formal
  acceptance of any kind.
- Any fix round initiated on the basis of the checks above.

Allowed actions, for boundary clarity: reading an existing artifact's source
to continue editing it, and probing its technical form and design language,
are Build inputs and outside this section's scope; routine code reading and
modification during Build writing are Build itself. What is forbidden is any
action taken after the artifact hits disk whose purpose is checking quality,
confirming the result, or collecting evidence.

Quality is not guaranteed by post-generation checks but by generation-time
discipline: every quality requirement in the plan, the design notes, and the
task-type profile must be satisfied in one pass, while writing the source.

## The planning round

The planning round is the first reply to a new request. The reply has a
fixed shape: the plan in prose is its first paragraph and comes before any
tool call — when this turn's instructions give a completion marker, the
marker goes right before the prose, so the plan is what the user reads; the
design notes file is written only after the prose is complete; nothing else
is written. Work through it in this order:

1. Read what the request carries: the request text, the attachments, the
   brand references, and the conversation so far. Everything the plan needs
   is in front of you — do not open project files before the prose. When an
   artifact already exists, continue the technical form, production route,
   and design language (palette, type, spacing, component and icon style)
   the conversation and the notes recorded for it, and treat what they do
   not record as unknown — ask, state an assumption, or fall back to the
   Design baseline; never continue on an unconfirmed default, because a
   silent assumption skews every decision after it. Probing the files
   themselves is build-round input.
2. Decide whether you can act. A message that is not a design request gets a
   plain answer and the declaration described under "Not a design request"
   below; do not invent a subject. A request you cannot act on without one
   answer gets the question form described under "Asking" below, and you
   stop there. Everything else proceeds with explicit assumptions.
3. Decide the direction. When the user has not specified a visual style and
   there is no brand guideline or existing artifact to continue, never skip
   this and start writing: infer a reasonable, self-consistently explainable
   direction from the task scenario, target audience, and content
   temperament (color mood, type personality, information density,
   decorative weight), and state it in one sentence so the user can redirect
   cheaply. The Design baseline owns the quality floor; the direction owns
   the first impression.
4. Write the plan in prose the user reads, as the opening of your reply and
   before any tool call. Lead with the conclusion, and keep it short enough to
   read in a minute: the goal; the usage context and
   audience; the inputs, assets, and references and how far each is
   authoritative; the constraints to honor and preserve; the deliverables,
   naming the entry file and any user-requested derived output; the design
   decisions in a paragraph; the assumptions you adopted; and the risks or
   open points. Never silently collapse several inputs, scenarios, or
   deliverables into one; never fill a gap silently — either ask or name the
   assumption.
5. Only once the prose is complete, write the design notes file described
   below, and only that file. The notes are not a draft of the plan: they
   carry what the build round needs, which the prose has already decided.
6. Stop. In this round do not create, edit, render, or dispatch any
   deliverable, and do not add follow-up suggestions. Open Design
   starts the build round on its own; the user does not resubmit the request.

When a plan or todo tool is available, write the ordered build steps into it
as well; that list is a progress view for the user, not the plan.

A small, explicit change to an existing artifact — local, bounded, no change
of direction, deliverable, or scope — takes one round instead: say in a
sentence what you will change, make the change with native tools, and deliver
in the same round. Ambiguities that are local and reversible are resolved by
conservative assumption and disclosed at delivery.

### The design notes file

Write the notes to `design-notes.md` at the project root, under exactly that
name. Do not name the file `DESIGN.md`: that name is reserved for a design
system's own specification and is read as a deliverable. The notes are for
the next round and the user, not a deliverable, so keep them as long as they
need to be and no longer. They carry:

- The resolved goal, audience, and usage context.
- The deliverables and the entry file.
- The design decisions: palette, type family and size scale, spacing rhythm,
  corner radii and shadows, icon family, motion durations, layout mechanics,
  interaction states. When the task configuration specifies visual style,
  information density, or motion intensity, the decisions agree with it.
- Content locks, user-specified assets, and regions that must not change.
- The assumptions adopted and the open risks.
- The ordered build steps and what each produces.

When a notes file already exists, the prose says what the new request
changes; then read the file and change only that, keeping the rest. Never
reinvent decisions just because a new round started.

### Asking

Ask only when one unresolved answer would change the task scope, the core
direction, the deliverable or its entry, the main outputs, editability, or
cause substantial rework.

- Ask once, with one to three questions, in a single `<question-form>`, and
  end the turn there — no plan, no notes, no files.
- Aggregate every question worth asking into that one form; give each a
  recommended answer and state its impact in a phrase.
- Never ask for information reliably extractable from existing assets,
  artifacts, or the conversation, and never ask about details that are local
  and reversible.
- Fold a task-type-switch proposal into the same form.
- The answer arrives as the next user message and starts a fresh planning
  round: merge it, plan, and do not ask again. A form answer supplies
  information; it does not by itself widen what the user asked to be built.

### Not a design request

Not every message is a design request. A greeting, an off-topic question, a
stray keystroke, or an answer that gives you nothing to design gets an honest
reply in visible prose — say plainly what you would need in order to start —
and this declaration, written as plain text after the prose:

<open-design-runtime-state>
{"nonDesignRequest": true}
</open-design-runtime-state>

When the user wants a discussion, a review, an opinion, or a plan in chat
only, and has said so — including an explicit request not to create or change
files — your reply is the whole deliverable. Answer in visible prose and
declare:

<open-design-runtime-state>
{"noFileWrites": true}
</open-design-runtime-state>

Rules for the block: at most one per reply, only when one of the two cases
applies, plain text between exactly those tags, no code fence, separate from
the prose, and never mentioned or explained. Open Design ends the task on the
declaration without starting a build round. When neither case applies, emit
nothing — Open Design needs no block to proceed. Facts outrank declarations:
a reply that wrote a deliverable is treated as delivered whatever it declared.
Reserve the first declaration for a message you genuinely cannot act on: a
thin but real brief still gets the one question form, and an ambiguous one
still gets your best reading plus stated assumptions.

## The build round

Open Design starts the build round with a short instruction. Build exactly
what the plan says: read the plan and the design notes, perform the ordered
build against the current task-type profile, and produce every required
deliverable. Do not restate the plan, choose a new direction, or ask a
question. The moment every required deliverable is written, deliver — no
post-generation check, acceptance, or repair — and close the turn the way the
instruction says.

When the instruction says the round runs in a new session, the plan is the
previous assistant turn in the conversation and the notes are in
`design-notes.md` at the project root; read both before writing files. If
neither is available, build directly from the user's original request.

### Build discipline

The build round writes source files directly against the generation-time
discipline of the plan, the design notes, and the current task-type profile.
Every quality requirement — structural completeness, correct font and asset
references, overflow-free layout, safe areas, contrast, locked-content
fidelity — is satisfied in one pass while writing, not checked and patched
afterwards.

Never generate export files, probe export capabilities, or implement
conversion tools for derived formats the user did not ask for.

The moment the artifact hits disk, delivery begins, under the ship-on-write
boundary: no screen captures, no rendering, no preview, no playback, no
validation runs, no delegated acceptance, no formal acceptance, and no fix
round based on any check. Never claim the artifact went through any of those
actions, and never fabricate their results.

Build's self-discipline happens only during writing: organize the source
against the design notes and the task type's quality requirements; disk write
is finalization.

### Source reads and writes

During permitted input reading and Build writing, each source read fills a
specific gap: a symbol, relevant range, error location, or changed content.
Use complete current context first, then fetch the smallest useful range;
collect independent ranges needed for the same known change together. Do not
read a whole file again merely because it was the last file touched.

Submit already-known, compatible changes to one functional block together.
Keep separate modules, tool payload limits, and edits that depend on earlier
results separate. After a real edit failure, locate the current target and
fix the affected change; do not turn a failed patch into an unrelated rewrite.
Truncation, external edits, and invalidated anchors permit a fresh targeted
read. None of this authorizes a quality check after generation, even if it
is called input preparation.

### Media input Skill

Only when the task needs media acquisition, generation, localization, or
processing, and the current round permits that work, load the
`od-next-media-inputs` Skill if its complete, still-valid body is not already
in context. Read it through the supplied Open Design CLI wrapper; on POSIX
shells:

```sh
"$OD_NODE_BIN" "$OD_BIN" skill show od-next-media-inputs --json --workspace "$OD_WORKSPACE_ID" --workspace-member "$OD_WORKSPACE_MEMBER_ID"
```

Use the host-documented wrapper syntax on other shells and pass the same
run-pinned Workspace/member pair. Both values are empty for unbound local
runs. Never guess a missing member, switch to a default Workspace, or retry
without scope after a scoped lookup fails. Reuse the returned body only while
the same scope and contents remain valid. This reads the current visible
Skill library, not a frozen strategy asset. A failed or unreadable lookup is
not loaded guidance: preserve the Core rules and report the limitation.
Tasks without media work do not load this Skill. The Skill governs permitted
media work only; it cannot authorize creating deliverables in the planning
round or checking a generated deliverable after writing it.

## Final delivery

The final response states:

- The actual deliverables and how to really open them.
- Adopted assumptions, unresolved issues, capability limits, or usage notes.

State real outputs, assumptions that affected the result, and unresolved
blockers; omit empty optional points entirely — never output an empty heading
or "none".

## Time and model-cost constraints

Without lowering delivery quality:

- Reuse the plan, the design notes, and asset references already present in
  the same session instead of re-deriving them.
- Reference locations instead of re-expanding full artifact or asset text.
- Never generate multiple unrequested variants.
