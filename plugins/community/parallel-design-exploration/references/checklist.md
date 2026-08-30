# Parallel Exploration Review Checklist

Background documentation for reviewing a persistent options-canvas run.

The checklist focuses on protocol stability and comparison quality rather than a particular product style or writing format.

## A. Context and baseline

- [ ] The available design context was inspected before alternatives were generated.
- [ ] A trustworthy current state appears as `0 · Baseline` when one can be established.
- [ ] Greenfield or insufficient-context work begins cleanly with Turn 1.
- [ ] Baseline evidence and design lineage are represented as separate concepts.

## B. Divergence

- [ ] The turn contains several rendered sibling alternatives.
- [ ] A user-specified option count is respected.
- [ ] Siblings differ on consequential dimensions relevant to the design question.
- [ ] The alternatives are developed far enough for the design itself to be judged.
- [ ] Convergence remains user-directed.

## C. Primary artifact identity

- [ ] The exploration session has one primary visible artifact.
- [ ] The first generation establishes a stable subject-derived filename or host-required entry path.
- [ ] Follow-up turns resolve and update that same primary artifact.
- [ ] Supporting files, when useful, remain secondary to the visible exploration history.

## D. Visible document protocol

- [ ] `main.pde-canvas` owns the complete visible exploration document.
- [ ] Its direct visible state children are ordered newest-first.
- [ ] The optional baseline is the oldest visible state.
- [ ] Every turn has `id="tN"` and matching `data-turn="N"`.
- [ ] Every option has a stable DOM `id` and matching `data-option`.
- [ ] Visible references to existing design-state ids navigate to their anchors.

## E. State mutation and history

- [ ] The newest turn is added before earlier states.
- [ ] Every previously delivered state retains its identity and visible design content.
- [ ] Previously delivered states keep the same rendering meaning after new CSS, JavaScript, data, or layout code is added.
- [ ] Follow-up requests that riff on earlier work produce new descendants rather than silently re-authoring the source state.
- [ ] Direct changes to a historical state correspond to an explicit request to correct or replace that state.
- [ ] Descendant options expose meaningful lineage when they branch from earlier work.

## F. Option clarity

For each option:

- [ ] The stable id and concise direction name are visible.
- [ ] The design is rendered rather than represented only by prose.
- [ ] Local explanation appears only when it materially improves understanding.
- [ ] `data-parent` reflects intentional lineage when a primary parent exists.

## G. Canvas substrate

- [ ] The canonical canvas chrome is visually subordinate to the rendered options.
- [ ] Turn labels and state ids remain compact and consistent.
- [ ] Siblings use a wrapping spatial row rather than a fixed responsive column system.
- [ ] Option containers behave as spatial containers; the rendered design is the artifact surface.
- [ ] Artifact widths follow the content being shown so different design formats can share the same canvas protocol.
- [ ] Individual options retain freedom to use the visual language appropriate to the brief.

## H. Progressive authoring

When the host supports live preview refreshes:

- [ ] The existing primary artifact is reused for follow-up work.
- [ ] The new turn shell appears in canonical position before the turn is fully complete when practical.
- [ ] Sibling options can take shape through coherent incremental updates.
- [ ] Incremental updates preserve previously delivered states.

For final-write hosts, the same artifact and state mutation semantics apply without progressive preview.

## Final test

The exploration succeeds if the user can truthfully say:

> I can see the current state when one exists, compare several real options at once, navigate to any referenced state by id, ask for another riff, and watch the same exploration artifact grow without losing or rewriting the states I already saw.
