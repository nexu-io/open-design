# Studio365 NovaDash Integration Change Request

## Summary

This change request captures the Studio365 integration requirements for NovaDash, focusing on a local-first handoff workflow powered by Hermes and the Studio365 COO persona.

## Goals

- Add a Studio365-specific workflow layer in NovaDash for:
  - SEO content generation
  - Short-form video brief creation
  - B2B agency outreach
- Keep the dashboard lightweight by using handoff commands rather than running heavy native tasks directly.
- Surface Hermes memory context from `H:\Workspace\Studio365-Knowledge`.
- Show queue state from `H:\Workspace\studio365_ops\chalam.db`.
- Use `run-handoff.ps1` as the handoff execution protocol for large operations.

## Requested UI/flow updates

1. Add a `Studio365` workflow view in NovaDash with cards for `SEO Content`, `Video Brief`, and `Agency Outreach`.
2. Add a `Handoff` panel where users confirm output targets and trigger `Run Handoff`.
3. Add a `Hermes Memory` panel exposing the active Obsidian context.
4. Add a `Queue Status` panel with SQLite queue details and cooling delay metadata.
5. Treat the dashboard as a command generator / handoff orchestrator, not a script executor.

## Acceptance criteria

- `docs/spec.md` includes explicit Studio365 UI/flow details.
- `docs/studio365-hermes-integration-notes.md` documents the local-first storage and handoff protocol.
- A new change request file exists describing the NovaDash integration requirements.
- The branch `studio365/setup` contains all related changes and is pushed to the fork.
- A PR is created against `nexu-io/open-design` with this branch.

## Notes

The external spec at `C:\Users\bigz_\Documents\Codex\2026-05-16\hatch-pet-c-users-bigz-codex\standalone-dashboard\docs\obsidian-dashboard-spec.md` was reviewed for context but is not part of this repo.
