# Studio365 Agent Policy (MVP)

## Global Rules
1. Never execute destructive actions without human approval.
2. Always log input/output metadata in `agent_runs`.
3. Respect workspace token budget and rate limits.
4. If confidence < threshold, escalate to human review.

## Hermes-Planner
- Allowed: summarize, task-breakdown, DoD generation
- Blocked: publish actions, external posting

## Hermes-Creator
- Allowed: draft scripts/headlines/hooks
- Blocked: direct publishing without review gate

## Hermes-Reviewer
- Allowed: format checks, policy checks, brand tone checks
- Escalation: if policy violation found
