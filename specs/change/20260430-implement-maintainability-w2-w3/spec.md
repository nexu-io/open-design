---
id: "20260430-implement-maintainability-w2-w3"
name: "Implement Maintainability W2 W3"
status: new
created: "2026-04-30"
---

## Overview

### Problem Statement

`apps/web` and `apps/daemon` need the next maintainability-roadmap workstreams implemented: W2 and W3 from `specs/current/maintainability-roadmap.md`.

### Goals

- Implement W2: define shared API, SSE, and error contracts covering R2, R7, and R8.
- Implement W3: add gradual TypeScript support for `apps/daemon` covering R1.
- Provide shared request/response types, an SSE event union, and an error model that can be imported by both web and daemon code.
- Configure daemon TypeScript with `allowJs` so existing JavaScript can be typed gradually while new modules can be written in TypeScript.

### Scope

- Create or update the shared contract layer for web/daemon request, response, error, and SSE event types.
- Add daemon TypeScript configuration and integration needed for gradual adoption.
- Keep the existing architecture boundary from the roadmap: `apps/web` remains the Next.js frontend and thin BFF/proxy layer; `apps/daemon` remains the local runtime/backend.

### Constraints

- W2 depends on the completed W1 ownership and capability boundaries.
- W3 should build on W2 for highest-value shared types.
- Runtime validation, server modularization, process/task manager work, and broader daemon test pyramid work belong to later roadmap workstreams.

### Success Criteria

- Web and daemon can import the same contract types.
- Daemon has a TypeScript configuration that supports gradual migration with `allowJs`.
- The new contracts explicitly cover HTTP payloads, SSE events, and the unified error model.

## Research

<!-- What have we found out? What are the alternatives considered? -->

## Design

<!-- Technical approach, architecture decisions, and test strategy. Each design decision should cite a fact source. -->

## Plan

<!-- Optional: Step breakdown for complex features that need multiple implementation steps.
     Decided during Design. Checked off during Implement.
     Keep this section compact and step-based.
     Use markdown checkboxes for all step and substep items, for example:
     - [ ] Step 1: Foo
       - [ ] Substep 1.1 Implement: Foo foundation
       - [ ] Substep 1.2 Implement: Foo integration
       - [ ] Substep 1.3 Implement: Foo edge handling
       - [ ] Substep 1.4 Verify: Foo automated coverage
       - [ ] Substep 1.5 Verify: Foo manual workflow
     - [ ] Step 2: Bar
       - [ ] Substep 2.1 Implement: Bar
       - [ ] Substep 2.2 Verify: Bar
     - [ ] Step 3: Baz
       - [ ] Substep 3.1 Implement: Baz
       - [ ] Substep 3.2 Verify: Baz
     Use a capability-based step breakdown with reviewable, meaningful increments.
     Good boundaries align with one user-visible workflow, one subsystem/integration boundary, one migration/rollout step, or one stabilization milestone.
     Each step must include small, independent substeps for implementation and immediate testing/verification.
     Within each step, list implementation substeps before verification substeps.
     The final step may focus on overall testing/verification, edge cases, regression coverage, and coverage improvements.
     A step is complete only when relevant tests pass.
     Size steps so one coding agent can implement + validate in a single session.
     Write each substep as one small, independent task. -->

## Notes

<!-- Optional sections — add what's relevant. -->

### Implementation

<!-- Files created/modified, decisions made during coding, deviations from design -->

### Verification

<!-- How the feature was verified: tests written, manual testing steps, results -->
