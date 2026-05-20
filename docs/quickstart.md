# Studio365 Quickstart

This quickstart file captures the practical, lean approach for the current Studio365 MVP.

See `docs/studio365-product-blueprint.md` for the full Studio365 product blueprint, roadmap, and MVP scope.

For local machine bootstrap, use `docs/studio365-local-bootstrap.md` and the CSV tracker in `infra/bootstrap/`.

## TL;DR

Use this approach:
- Keep the old guidance but narrow it to 6 key principles:
  - free-first
  - secrets separated from code
  - approval before destructive action
  - dashboard-first
  - single controller (human/system central coordination)
  - queue + lock to prevent overlapping work
- Use actual paths based on the current machine:
  - Workspace root: `H:\Workspace`
  - Studio365 project: `H:\Workspace\Studio365`
  - Private Vault: `E:\FINAL\Secrets`
- Do not force a full migration to `H:\MySystem` immediately.
- Build a compatible layout first and migrate later if needed.
- Use Waterfall Fallback with free-tier limits:
  - call free tools first
  - on quota or failure, switch automatically to the next layer
  - always log the fallback reason

## What to keep from the old design

### ✅ Keep
- Free-first / no credit card: excellent for MVP and cost risk management
- Secrets isolation: store secrets outside repo
- inspect-first + classify-first: reduces accidental destructive actions
- approval-before-delete: essential for safe automation
- dashboard-first: keeps work and team control visible
- n8n not source of truth: DB must be the primary source of truth

### ⚠️ Reduce intensity
- Very long 25-prompt lists are useful conceptually but heavy for launch
- Enforcing a large canonical tree from day one risks delaying delivery
- A broad tool universe makes decisions harder and maintenance costlier

## Lean redesign for current use

### A) Canonical paths

Use current reality instead of `H:\MySystem`:
- Workspace root: `H:\Workspace`
- Studio365 project: `H:\Workspace\Studio365`
- Private Vault: `E:\FINAL\Secrets`

Recommended minimal structure:

```
H:\Workspace\Studio365
  apps\
  services\
  infra\
  docs\
  scripts\
  artifacts\
  blackboard\
    runs\
    queue\
    locks\
  system\
    references\
```

Store only redacted metadata in `system/references`.

### B) Secret governance

Real secrets stay at `E:\FINAL\Secrets\...`.
A lightweight inventory file belongs at:
- `H:\Workspace\Studio365\system\references\secret_inventory.json`

Inventory fields:
- alias
- provider
- owner
- last_checked
- rotation_due
- risk_level

Do not:
- commit secrets to git
- send secrets to Telegram/Sheet/RAG
- print full secrets in logs

### C) Minimal tool strategy

Reduce tools to 5 core groups:
- Controller: Antigravity or a central dashboard
- Builder: Codex/Claude (pick one primary)
- Automation: n8n
- Local AI fallback: Ollama
- Knowledge + DB: Postgres (+pgvector) + Google Sheet for monitoring

## Waterfall fallback policy

### 3.1 Planning / reasoning waterfall
- Local model (Ollama)
- Free-tier API A
- Free-tier API B
- Human review queue

Trigger fallback on:
- quota exceeded
- timeout > threshold
- quality score below threshold
- policy violation

### 3.2 Content generation waterfall
- Prompt Vault template + local model
- Free external model
- Lightweight rewrite model
- Human review before final approval

### 3.3 Automation / execution waterfall
- direct API call
- n8n workflow
- script wrapper with manual assistance
- human intervention

## Guardrails

Required controls:
- run_id for every task
- lock_key for every scope (ticket/resource/workflow)
- single writer per scope
- approval gate before delete/overwrite/publish
- budget guard:
  - daily token cap per workspace
  - per-agent run cap
  - automatic fallback near budget limit

## Dashboard-first but light

Start with one page only.
Minimum widgets:
- Queue now
- Current phase per ticket
- Agent health
- Approval pending
- Cost today (% budget)
- Fallback events

Minimum actions:
- Submit task
- Approve / deny
- Retry
- Mark blocked
- Requeue with reason

## Not needed right now

Do not do these yet:
- onboard every tool from the doc
- full cloud multi-provider support
- full intelligence feed from day one
- migrate all legacy folders at once

## 14-day plan

### Day 1–2
- create structure under `H:\Workspace\Studio365`
- establish vault policy at `E:\FINAL\Secrets`

### Day 3–5
- ticket lifecycle, Kanban, API
- run_id / lock_key and audit events

### Day 6–8
- n8n intake/planning/working workflows
- approval gate

### Day 9–10
- waterfall fallback logic
- budget limiter

### Day 11–12
- dashboard metrics and fallback monitor

### Day 13–14
- UAT, hardening, operations playbook

## Decision summary

Use the old document as policy source, not execution script.
Focus on:
- `H:\Workspace\Studio365`
- `E:\FINAL\Secrets`
- lean core: Kanban, n8n, approval, fallback, budget guard
- Waterfall free-tier routing as standard for every agent

## Today
- Confirm one MVP use case, such as short video script generation.
- Use stack: Next.js + FastAPI + n8n + PostgreSQL.
- Define Ticket DoD clearly before automating.
- Build one full workflow and validate it from intake to done.
