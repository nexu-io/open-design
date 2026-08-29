# Maintainability Roadmap

## Purpose

This document captures the maintainability risks in the current `apps/web` + `apps/daemon` architecture and the recommended optimization path.

The architectural boundary stays unchanged:

- `apps/web`: Next.js frontend and thin BFF/proxy layer.
- `apps/daemon`: local runtime/backend for SQLite, daemon-managed filesystem state, AI agent CLI processes, and SSE streaming. This roadmap MUST NOT define daemon data paths; read root [`AGENTS.md`](../../AGENTS.md) → **Daemon data directory contract** before documenting storage.

The first-principles maintainability goals are:

- **Understandability**: engineers can locate behavior quickly and reason about data flow.
- **Changeability**: common changes can be made with bounded blast radius.
- **Verifiability**: contracts, tests, and types catch regressions early.
- **Isolation**: high-risk capabilities are contained behind explicit boundaries.
- **Recoverability**: failures produce actionable state, logs, and cleanup behavior.

## Priority Scale

| Priority | Meaning |
|---|---|
| P0 | Blocks safe evolution or creates high-risk runtime/security failure modes. |
| P1 | Major maintainability risk that increases regression and debugging cost. |
| P2 | Medium-term risk that affects reliability, portability, or architecture clarity. |
| P3 | Supporting documentation/process improvement. |

## Risk List and Optimization Plan

| ID | Priority | Risk | Evidence | Impact | Optimization Plan |
|---|---:|---|---|---|---|
| R1 | P0 | Daemon TypeScript enforcement still has suppression gaps. | `apps/daemon` typechecks, but `@ts-nocheck` remains in high-risk core modules (`server.ts`, `agents.ts`, `projects.ts`, `runtimes/runs.ts`, `cli.ts`), newer brand/memory modules, and several tests. | Payload, DB row, process, and event changes inside suppressed modules can bypass the guarantees reported by package typecheck. | Keep TypeScript as the source default, prevent new suppressions, remove existing suppressions owner-by-owner, and route shared API/SSE/error shapes through `packages/contracts`. |
| R2 | P0 | Shared web/daemon contracts need complete adoption. | `packages/contracts` now owns shared API DTOs, error shapes, and SSE unions consumed by both runtimes, while some legacy daemon handlers still shape JSON locally. | New or legacy endpoints that bypass the package can still drift from web and CLI consumers at runtime. | Extend `packages/contracts` before changing shared wire shapes, use the daemon HTTP response helpers at route boundaries, and add contract-focused tests for every migrated endpoint. |
| R3 | P0 | Runtime validation is incomplete at the daemon boundary. | Daemon requests can trigger local filesystem access, SQLite writes, and `child_process.spawn()`. | Type correctness alone cannot protect against malformed runtime input, path traversal, invalid agent IDs, or unsafe args. | Add schema validation at HTTP boundaries with Zod/TypeBox; centralize validation for workspace paths, task IDs, agent IDs, models, reasoning options, uploaded files, and command arguments. |
| R4 | P0 | Local capability security boundary needs explicit rules. | Daemon owns high-permission capabilities: local files, daemon-managed storage, project workspaces, agent CLIs, and logs. | Unsafe path handling, broad command execution, token leakage, and unintended workspace access become possible failure modes. | Treat daemon as a capability server: bind to localhost, use workspace/path allowlists, normalize and jail paths, allowlist agent commands, and redact sensitive output. |
| R5 | P0 | Agent process lifecycle needs a first-class manager. | `/api/chat` spawns multiple agent runtimes and streams output to the frontend. | Zombie processes, cancellation gaps, orphaned tasks, inconsistent exit handling, and concurrent process conflicts. | Introduce a process/task manager with task state machine, cancellation, timeout, cleanup, exit code capture, signal handling, and concurrency limits. |
| R6 | P1 | `server.ts` remains oversized after partial modularization. | Many domain registrars now live under `apps/daemon/src/routes/` and shared HTTP primitives under `apps/daemon/src/http/`, but `server.ts` still owns substantial legacy routes and run orchestration alongside composition. | Unrelated changes can still collide in the composition root, and large lifecycle paths remain difficult to isolate in tests. | Continue extracting touched domains into narrow route registrars and services while keeping `server.ts` as the composition root; avoid a broad mechanical rewrite. |
| R7 | P1 | Error handling is only partially centralized. | `packages/contracts/src/errors.ts` and `apps/daemon/src/http/` provide typed errors and response adapters, while legacy handlers still contain local `try/catch` blocks and ad hoc JSON failures. | Consumers can still receive inconsistent status/envelope semantics, and local catches can lose context or leave partial state. | Migrate touched routes to the shared error/response boundary, preserve named recovery paths, and add adapter-level mappings for domain failures. |
| R8 | P1 | Versioned SSE contracts need consistent end-to-end use. | `packages/contracts` now defines versioned chat/proxy SSE unions and the critique event union, but legacy producers and consumers can still emit or parse locally shaped events. | A bypass can reintroduce disconnect, terminal-event, replay, and error-semantic drift despite the shared types. | Keep canonical event names/payloads in contracts, route producers and consumers through typed helpers, and pin replay/disconnect/terminal semantics with contract tests. |
| R9 | P1 | SQLite schema and migration lifecycle need stronger guarantees. | `apps/daemon/src/db.ts` owns local `better-sqlite3` tables and migrations. | Local user data upgrades can fail unpredictably; schema drift is hard to diagnose and recover. | Add explicit migration table, ordered forward migrations, startup migration checks, schema version logging, backup-before-migrate strategy, and migration tests. |
| R10 | P1 | Broad daemon coverage is not yet organized as an explicit test pyramid. | `apps/daemon/tests/` now covers routes, DB behavior, agents, SSE, critique, media, connectors, config, and filesystem boundaries, but layer ownership and some lifecycle/migration gaps remain uneven. | Large suites can still hide which boundary failed, while unmodeled migration or process-lifecycle paths retain regression risk. | Make the layers explicit: shared contract tests, route integration suites, service units, migration tests, canonical SSE tests, and mocked process-lifecycle tests. |
| R11 | P1 | Logging and observability are insufficient for local runtime debugging. | Agent execution involves long-lived tasks, subprocess output, filesystem state, and frontend SSE consumption. | User issues are hard to reproduce; failures lack correlated context. | Add structured logs with `requestId`, `taskId`, `agentId`, `workspace`, exit code, and duration; separate app logs from agent output; redact secrets. |
| R12 | P2 | Configuration, port, and readiness behavior remains only partially centralized. | Web proxies `/api/*` to the daemon, tools-dev coordinates the two listeners, and `GET /api/health` exposes basic process health but not full dependency readiness. | Port conflicts, daemon-not-ready states, and mismatched environment variables can still break startup or distribution. | Centralize config resolution, enrich health with readiness checks, and make port selection plus UI fallback deterministic. |
| R13 | P2 | Cross-platform behavior is a recurring risk. | Daemon uses filesystem paths, SQLite native bindings, shell/process behavior, and signals. | macOS, Linux, and Windows/WSL can differ in path normalization, quoting, permissions, and process termination. | Use Node path APIs consistently, avoid shell string composition, isolate platform-specific process logic, and add CI coverage for supported platforms. |
| R14 | P2 | Framework migration can distract from core maintainability issues. | Current complexity is concentrated in FS/spawn/SSE/SQLite and module boundaries. | A framework rewrite can consume time while preserving the risky domain logic. | Keep Express for now; revisit Fastify only after TS, contracts, validation, tests, and modularization are in place and Express becomes a clear limiter. |
| R15 | P2 | Web/daemon boundary can erode over time. | Next.js has BFF capability and daemon has backend capability; future edits may blur ownership. | High-permission local runtime logic may leak into `apps/web`; deployment and security assumptions become unclear. | Document and enforce ownership: web handles UI/BFF/proxy; daemon owns local runtime capabilities; shared code contains contracts and pure logic only. |
| R16 | P3 | Operational documentation is incomplete. | Local-first daemon behavior depends on ports, daemon-managed storage, agent CLIs, runtime logs, and recovery flows. | Onboarding and support costs rise; troubleshooting relies on oral knowledge. | Document daemon architecture, API/SSE contract, task lifecycle, storage contract index, agent dependency checks, and common recovery procedures. |

## Optimization Dependencies

The optimization work should proceed in dependency order. Some items can run in parallel once their prerequisites are stable.

| Workstream | Status | Optimization | Covers | Depends on | Output |
|---|---|---|---|---|---|
| W1 | Completed | Confirm architecture and capability boundaries | R4, R15 | — | Written ownership rules for web, daemon, shared contracts, and dangerous local capabilities. See `specs/current/architecture-boundaries.md`. |
| W2 | Completed | Define API, SSE, and error contracts | R2, R7, R8 | W1 | `packages/contracts` now provides shared request/response types, SSE event unions, and error model helpers consumed by web and daemon. |
| W3 | Partial | Migrate project-owned code to TypeScript | R1 | W2 for highest-value shared types | TypeScript is the project-owned source default and the daemon package typechecks, but suppressions remain in core runtime files, newer brand/memory modules, and some tests. Remove them in owner-sized slices, then run `pnpm --filter @open-design/daemon typecheck`, `pnpm typecheck`, and `pnpm guard`. |
| W4 | Planned | Add runtime validation at daemon boundaries | R3, R4 | W2 | Schemas for HTTP requests, paths, agents, models, uploads, task IDs, and command args. |
| W5 | Partial | Modularize `server.ts` | R6 | W2, W3, W4 | Domain registrars, typed route dependencies, and shared HTTP helpers now live under `apps/daemon/src/routes/`, `server-context.ts`, `route-context-contract.ts`, and `apps/daemon/src/http/`. Remaining work is to extract substantial legacy route/orchestration blocks from `server.ts` without mixing broad moves with behavior changes. |
| W6 | Partial | Introduce agent process/task manager | R5, R8, R11 | W2, W5 | `apps/daemon/src/runtimes/runs.ts` now provides an in-memory chat run service with run states, event replay, SSE streaming, cancellation, waiting, terminal cleanup, and exit metadata; critique also has an in-process run registry for interrupts. Remaining work is a unified agent process manager with explicit concurrency limits, stronger timeout/cleanup policy, and consistent lifecycle ownership across agent surfaces. |
| W7 | Planned | Strengthen SQLite migrations | R9 | W5 or a clear DB adapter boundary | Migration table, ordered migrations, startup checks, backup strategy, migration tests. |
| W8 | Partial | Build the daemon test pyramid | R10 | W2, W4, W5 | Daemon now has broad Vitest coverage under `apps/daemon/tests/`, including route, agent, DB, SSE, critique, live-artifact, connector, config, and filesystem behavior. Remaining work is to make the layers explicit: shared contract tests, route integration suites, service unit tests, migration tests, canonical SSE protocol tests, and mocked agent-process lifecycle tests. |
| W9 | Planned | Add structured logs and observability | R11 | W2, W6 | Correlated request/task logs, sanitized agent output, durations, exit status, and diagnostic context. |
| W10 | Partial | Harden config, port, and readiness behavior | R12 | W1 | Daemon exposes `GET /api/health` with basic `{ ok, version }` health data. Remaining work is centralized config resolution, richer readiness checks, deterministic port behavior, and UI-visible daemon-not-ready handling. |
| W11 | Partial | Harden cross-platform behavior | R13 | W4, W6, W5 | Some process and path hardening exists, including shared platform command invocation and Windows command-line budget checks for agent CLIs. Remaining work is to formalize platform-specific process handling, path normalization rules, and supported-platform CI coverage. |
| W12 | Planned | Revisit HTTP framework choice | R14 | W2, W3, W4, W5, W8 | Evidence-based decision on whether Express remains adequate or Fastify provides clear net value. |
| W13 | Partial | Complete operational documentation | R16 | W1 through W11 as sections stabilize | Boundary and ownership documentation exists in `AGENTS.md`, `apps/AGENTS.md`, `packages/AGENTS.md`, and `specs/current/architecture-boundaries.md`. Remaining work is current-state daemon docs, API/SSE lifecycle docs, runbooks, troubleshooting guides, and recovery procedures. |

## Recommended Execution Order

```text
Phase 1: W1 -> W2 -> W3 -> W4
Phase 2: W5 -> W6 -> W7 -> W8
Phase 3: W9 -> W10 -> W11 -> W13
Phase 4: W12
```

The core principle is to reduce risk before changing framework foundations: establish contracts, types, validation, and module boundaries first; then evaluate whether Express remains the right transport layer.
