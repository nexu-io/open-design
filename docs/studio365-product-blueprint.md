# Studio365 Product Blueprint

This document captures the Studio365 MVP design for a practical, launchable command center that runs on free/OSS-first tooling with fallback controls.

## 0) Vision
Studio365 = Autonomous Business Orchestration Platform

A unified platform that transforms business work into tickets and runs them through AI + automation pipelines from planning to delivery, with humans approving key decision points.

## 1) Product Blueprint

### A. Command Center

1) Dashboard
- KPI overview: Open Tickets, Throughput, SLA, Agent Health.
- Workforce stats: tasks per agent, online status, blocked work.
- Business intelligence: output trends, cost vs quality, approval velocity.
- Quick actions: New Ticket, Generate Content, Request Summary.

2) Viral Studio
- Trend discovery for TikTok / IG / YT.
- One-click content brief generation.
- Auto-queue briefs into the workforce.

### B. Workforce System

1) Kanban Lifecycle
- Backlog → Planning → Working → Review → Done.
- Enforce state transitions through ticket events and queue locks.

2) Hermes Workers (Agent Registry)
- Hermes-Planner: split work, estimate effort, define DoD.
- Hermes-Creator: generate content, scripts, headlines.
- Hermes-Reviewer: validate quality, policy, style.

3) Business Brain (RAG)
- Fetch knowledge from docs, drive, slack, CRM.
- Store brand voice and communication rules.
- Use RAG context in planning, creation, and review.

### C. Creative Suite
- Content Lab: template selection, customization, generation.
- Strategy Hub: idea generator, headline master.
- Prompt Vault: versioned hooks, scripts, headlines, hashtags.

### D. Infrastructure Layer
- Studio365 OS view: flow, logs, queue state, lock status.
- n8n automation: workflow bridge, not the source of truth.
- Test harness: DoD and validation before review/publish.

## 2) Design System
- Body: IBM Plex Sans Thai.
- Heading / button: Prompt.
- Theme: dark command center with blue/purple accents.

UX rules:
- Every critical action must show status clearly: pending / running / blocked / failed.
- Every AI output must be traceable with a run_id.

## 3) Architecture

Recommended stack for the MVP:
- Frontend: Next.js + Tailwind + shadcn/ui.
- Backend: FastAPI.
- DB: PostgreSQL + pgvector.
- Queue: Redis.
- Automation: n8n.
- Local LLM fallback: Ollama.
- Storage: S3-compatible object store.
- Observability: logs, metrics, run audit.

### Layered architecture analysis

#### Client Layer
- Next.js + Tailwind + shadcn/ui is the right choice for a Command Center UX.
- Add these MVP panels early:
  - Event timeline panel for agent decisions and run history.
  - Cost meter per workflow.
  - Approval inbox for pending human gates.

#### API & Logic Layer
- FastAPI is appropriate for AI orchestration and agent coordination.
- Separate the orchestrator service from simple CRUD API routes.
- Add a central policy engine that validates every model/tool call before execution.
- Enforce idempotency keys to avoid duplicate ticket or agent runs.

#### Automation Layer (n8n)
- n8n should remain a workflow bridge, not the system of record.
- Enforce:
  - n8n may not write source-of-truth data directly outside of the API layer, except for migration or maintenance jobs.
  - Every webhook must use signature verification.

#### Data & Memory Layer
- PostgreSQL + pgvector provides the canonical truth and RAG vector store.
- Redis should serve queue state and transient cache only.
- Add explicit tables for:
  - `runs`
  - `run_steps`
  - `approvals`
  - `policy_violations`
- Separate artifact storage into:
  - `artifacts-public`
  - `artifacts-private`

#### AI Runtime Layer
- Local 1st with Ollama, plus external APIs.
- Introduce a Model Router layer that chooses model/tool based on:
  - budget remaining
  - latency SLA
  - task criticality
  - privacy class

#### Source-of-Truth Boundary
- Primary truth belongs in the database.
- n8n orchestrates flow and invokes APIs but does not own ticket state.
- Cache is transient and may be invalidated freely; it is not authoritative.
- All writes that affect ticket state, approvals, artifacts, or policy signals must pass through the API service.

## 4) Free-First + Limit-Aware AI Strategy

Waterfall routing for each ticket:
- Local OSS model first.
- Free-tier external model A.
- Free-tier external model B.
- Human review queue.

Fallback triggers:
- quota_exceeded.
- timeout_ms > threshold.
- quality_score < threshold.
- policy_blocked.

Each routed attempt must log:
- run_id
- selected_model
- fallback_reason
- token_in
- token_out
- latency_ms
- quality_score
- final_status

Cost guardrails:
- workspace daily budget.
- agent hourly budget.
- per-task max token.
- emergency kill-switch.
- auto-downgrade model when nearing limits.
- reuse cached outputs where safe.

## 5) Data Model (MVP)
- workspaces, users, roles.
- tickets, ticket_events.
- agents, agent_runs.
- prompt_templates.
- knowledge_docs, knowledge_chunks.
- approvals, artifacts.

## 6) Core Workflows

WF-01: Task Intake
- Form / chat → normalize → create ticket → notify.

WF-02: Planning
- Ticket in Planning → RAG context → planner output tasks + DoD.

WF-03: Working
- Creator generates draft → validation → attach artifact.

WF-04: Review Gate
- Human approve / deny → feedback loop.

WF-05: Done & Learn
- Archive output → writeback to Prompt Vault + knowledge repository.

## 7) Governance & Safety
- inspect-first / classify-first.
- approval-before-delete / publish.
- single writer per scope.
- run_id + lock_key for every task.
- no secrets in logs, prompts, or dashboard.
- RBAC + audit trail.

## 8) Troubleshooting Playbook
- Font fails: fallback to a local font stack.
- Agent offline: check queue, model endpoint, API key reference.
- Ticket blocked: inspect dependency graph and permissions.
- Workflow fail: open run trace and replay from failure point.

## 9) Roadmap

Phase 1 (2–4 weeks) — MVP
- Dashboard + Kanban + ticket CRUD.
- Planner / Creator / Reviewer basic flows.
- n8n workflows 01–04.
- Prompt Vault v1.
- Cost limiter + approval gate.

Phase 2 (4–8 weeks) — Pilot
- RAG connectors.
- Brand voice enforcement.
- business analytics.
- real test harness.

Phase 3 (8–12 weeks) — Autonomous
- multi-agent collaboration.
- self-healing workflows.
- optimization loop from real outputs.

## 10) What to do today
- Confirm one MVP use case: e.g. short video script production.
- Lock stack decision: Next.js + FastAPI + n8n + Postgres.
- Define ticket Definition of Done clearly.
- Build one workflow end-to-end and validate it.

## 11) Main gaps to fill before the next phase

### A) Cost control is not yet systematized
- Implement 4 cost layers:
  - workspace daily budget.
  - agent hourly budget.
  - per-task max token cap.
  - emergency kill-switch.

### B) Safety and compliance are not formal enough
- Enforce:
  - approval-before-publish/delete.
  - secret redaction middleware for prompts/logs.
  - blocked tools list for unauthorized external actions.

### C) Multi-agent collision risk
- Use `lock_key` per ticket/resource.
- Ensure single writer per ticket stage.
- Add retry with exponential backoff and a dead-letter queue for failed runs.

### D) RAG quality risk
- Define ingestion policy:
  - normalize → chunk → embed → quality score → publish.
- Track knowledge freshness with `valid_until`.

## 12) Production-minded free-tier waterfall spec

Routing priority:
- Local OSS model (Ollama).
- Free-tier external A.
- Free-tier external B.
- Human review queue.

Fallback trigger list:
- quota_exceeded.
- timeout_ms > threshold.
- quality_score < threshold.
- policy_blocked.

Logged fields for every run:
- run_id
- selected_model
- fallback_reason
- token_in
- token_out
- latency_ms
- quality_score
- final_status

## 13) Open questions and recommendations

Q1: Hosting Local vs Cloud VPS?
- Start local first, move to cloud in Stage 2.
- Local is faster for dev and lower cost.
- Cloud is appropriate once workflow stability is proven.

Q2: CrewAI vs LangGraph?
- Recommend CrewAI for MVP to move faster and keep the team aligned.
- Consider LangGraph when state graph needs become more complex.

Q3: Clerk vs Auth.js?
- Recommend Auth.js for self-hosted, free-first setups.
- Clerk is easy to set up, but may create long-term vendor dependency.

## 14) Non-functional requirements to lock in now
- API p95 latency target.
- Agent success rate target.
- Maximum approval turnaround time.
- MTTR when workflows fail.
- Cost per completed ticket.
- Security target: zero secret leak incidents.

## 15) Revised roadmap

Phase 1A (Core Ops)
- Ticket lifecycle + approvals + audit.
- Planner / Creator / Reviewer basic flows.
- Cost limiter + fallback router.

Phase 1B (Automation & RAG)
- n8n integration.
- Knowledge ingestion + retrieval.
- Prompt Vault scoring loop.

Phase 1C (Reliability)
- observability dashboard.
- dead-letter + replay.
- policy violation reporting.

## 16) Decisions to confirm before the next coding round
- Choose Auth.js or Clerk.
- Choose CrewAI or LangGraph.
- Set a daily token budget per workspace.
- Define approval rules for publish/delete.
- Pick the first use case (e.g. TikTok script pipeline).

## Recommended next step for this repo
- Keep the current `open-design` Studio365 starter pack focused on the MVP path above.
- Use `infra/docker-compose.yml` for a local stack, and make `n8n` the workflow bridge.
- Add one end-to-end workflow: intake → planning → creation → review → done.
- Track every run with `run_id` and every resource with `lock_key`.
