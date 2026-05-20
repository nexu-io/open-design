# Studio365 Hermes Integration Notes

## Summary of the Hermes Studio365 plan

- Hermes acts as the COO of Studio365, prioritizing revenue-generating workflows with a local-first, zero-cost bias.
- Core workflows include SEO content generation, short-form video briefing, and B2B AI agency outreach.
- Runtime constraints:
  - Local-first storage and tools whenever possible.
  - Target host RAM 8GB-16GB.
  - Concurrency limited to 1.
  - 800ms cooling delay between SQLite queue reads.
- Storage:
  - Obsidian vault: `H:\Workspace\Studio365-Knowledge`
  - SQLite queue: `H:\Workspace\studio365_ops\chalam.db`
  - Audit log: `H:\Workspace\docs\run_log.csv`
  - Secrets: `E:\FINAL\Secrets`
- Handoff protocol uses `run-handoff.ps1` for heavy tasks and handoff commands.

## Model and workflow guidelines

- Prefer `ollama/gemma3:1b` for background queue processing and log summarization.
- For OpenRouter free models such as `owl-alpha`, disable `thinking_config` and fallback to plain pipe-separated text if redaction breaks JSON.
- Keep workload light in the dashboard and favor handoff commands for native heavy operations.

## Dashboard implications

- NovaDash should be able to surface workflow handoff actions for:
  - Markdown publishing to Netlify
  - Video render brief creation and export
  - Agency outreach pitch drafting and delivery
- These should be represented in the UI as explicit task/handoff steps rather than running large native scripts in the dashboard itself.

## External spec note

- An external spec file was reviewed at:
  `C:\Users\bigz_\Documents\Codex\2026-05-16\hatch-pet-c-users-bigz-codex\standalone-dashboard\docs\obsidian-dashboard-spec.md`
- That file is outside this Git repository and was used for analysis only.
