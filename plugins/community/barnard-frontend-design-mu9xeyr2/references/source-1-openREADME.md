# Barnard frontend design

New, isolated destination for the requested Open Design frontend. The existing
`frontend/` remains the product application.

## Status

Preparation only. No frontend has been generated or tested in this folder yet.

- Reviewed the repository's product intent, upload-driven instructions, security
  boundaries and current-state record on 2026-09-20.
- Registered installed Open Design 0.22.2 with Codex and verified the registration
  using `codex mcp get open-design --json`.
- This task could not load the newly registered MCP tools. A new Codex task is
  required by the Open Design workflow.
- Mobbin screen search returned: “Mobbin MCP requires a paid plan.” No reference
  screens were returned or inspected, and no Mobbin-derived design is claimed.

## Design documents

- [INTENT.md](INTENT.md): purpose, audiences, scope, invariants and success criteria.
- [DESIGN.md](DESIGN.md): navigation, surface contracts, flows and required states.
- [STYLE.md](STYLE.md): visual tokens, typography, layout and component grammar.

These three documents supersede the initial [DESIGN_BRIEF.md](DESIGN_BRIEF.md).
They align with the existing UI contract and account for ADR 0042's implemented
research-comparison presentation. They are specifications, not a confirmed Open
Design brief or a generated frontend.

## Continue

In a new Codex task in this repository:

> Use Open Design and Mobbin to design Barnard's frontend in `frontend-design/`.
> Read `frontend-design/INTENT.md`, `frontend-design/DESIGN.md`,
> `frontend-design/STYLE.md` and the current repository instructions.
> Open Design is registered. Complete its brief workflow, generate the frontend,
> save the source in this folder, and verify the actual result. If Mobbin remains
> unavailable, report that limitation without inventing references.

Open Design Cloud is the skill's default execution mode and uses the user's
Open Design Cloud account and credits. No cloud generation was started.
