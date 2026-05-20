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

## Architecture review and plan alignment

### 1. Recommended production architecture

This architecture is aligned with the Studio365 goal of becoming a business control center with:
- Web app for team operations
- n8n automation for workflow orchestration
- multi-role AI agents (Planner / Creator / Reviewer)
- cost control using free/open-source models first

The current Studio365 plan already maps to this:
- `Studio365-Knowledge` Vault is the source of truth for memory and RAG
- `studio365_ops` holds queue state and run logs for automation visibility
- `run-handoff.ps1` and NovaDash handoff panels implement the command-center pattern
- `ollama` and `gemma3` support the free-first AI runtime strategy

### 2. Recommended module structure

A. Command Center
- Dashboard should show KPI/status, agent health, and throughput
- A handoff-first workflow card model is already present in `docs/spec.md`

B. Workforce
- Kanban lifecycle should be backed by the ticket queue and task state
- Hermes Workers and Business Brain are represented by the Vault + queue design

C. Creative Suite
- Content Lab and Strategy Hub are natural extensions of the current NovaDash handoff concept
- Prompt Vault should be treated as a versioned prompt library that agents can reuse

D. Infrastructure
- OS/graph/log layer is the study of the agent lifecycle and queue execution policy
- n8n should orchestrate intake, planning, working, review, and publish flows
- a Test Harness / DoD gate is essential for safe handoff and review loops

### 3. Free-first AI agent strategy

This is a strong fit for the Studio365 operating model.
- Default: local OSS models via `ollama` or equivalent
- Use rule-based tools, cached RAG, and prompt validation to reduce model calls
- Fallback: paid/high-quality API only when confidence is low or specific quality is required
- Add limit controls for token budget, request rate, daily caps, and auto-downgrade

### 4. Recommended n8n MVP workflows

The plan should include these core pipelines:
- Intake -> Ticket creation
- Planning agent generates subtasks, estimates, DoD draft
- Working agent calls RAG/prompt tools and returns draft output
- Review gate human-in-the-loop validation with feedback to planning/working
- Publish/archive with asset export, knowledge persistence, and metrics capture

### 5. Key data model fit

The current Studio365 task schema and queue design already support:
- tickets + workflow state + owner/priority
- agents + model profile + limits
- workflows with n8n IDs and versioning
- knowledge docs for RAG source tracking
- prompt library metadata and audit logs for runs

### 6. UX recommendations

Align UI with the Studio365 brand by using:
- dark dashboard with neon accents
- clear status cards for Online / Busy / Blocked / Failed
- AI Action Panel and Audit Trail on every workspace screen

### 7. Roadmap fit

The proposed phases are consistent with current work:
- Phase 1: MVP dashboard, ticket/Kanban, n8n intake/planning/working, prompt vault
- Phase 2: pilot with RAG, cost guardrails, review gates, analytics
- Phase 3: autonomous orchestration, retry/reroute, A/B prompt optimization

### 8. KPIs and governance

Recommended KPIs match the Studio365 ops focus:
- lead time per ticket
- first-pass approval rate
- cost per output
- agent success/retry ratio
- human intervention rate
- content performance uplift

### 9. Security and compliance

The Studio365 operating model should enforce:
- RBAC and tenant isolation
- secret management with no hardcoded keys
- PII masking before model calls
- audit log for all agent actions
- data retention and consent tracking
- license checks for models, fonts, and tools
