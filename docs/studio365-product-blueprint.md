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

## 4) Free-First + Limit-Aware AI Strategy

Waterfall routing for each ticket:
- Local OSS model first.
- Free-tier cloud model A.
- Free-tier cloud model B.
- Human fallback.

Fallback triggers:
- quota exceeded.
- timeout.
- quality below threshold.
- policy conflict.

Cost guardrails:
- daily token budget per workspace.
- request cap per agent per hour.
- auto-downgrade model near limits.
- cache repeated outputs where safe.

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

## Recommended next step for this repo
- Keep the current `open-design` Studio365 starter pack focused on the MVP path above.
- Use `infra/docker-compose.yml` for a local stack, and make `n8n` the workflow bridge.
- Add one end-to-end workflow: intake → planning → creation → review → done.
- Track every run with `run_id` and every resource with `lock_key`.
