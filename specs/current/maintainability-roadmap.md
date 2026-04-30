# Maintainability Roadmap

## Purpose

This document captures the maintainability risks in the current `apps/web` + `apps/daemon` architecture and the recommended optimization path.

The architectural boundary stays unchanged:

- `apps/web`: Next.js frontend and thin BFF/proxy layer.
- `apps/daemon`: local runtime/backend for SQLite, `.od` filesystem state, AI agent CLI processes, and SSE streaming.

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
| R1 | P0 | Daemon lacks TypeScript type checking. | `apps/daemon` is mostly JavaScript while handling API payloads, SQLite rows, filesystem paths, child processes, and SSE events. | API payloads, DB rows, agent events, and task states can drift silently; refactors are riskier. | Add gradual TypeScript support with `allowJs`; write new daemon modules in `.ts`; first type API payloads, SSE events, task lifecycle, DB rows, and agent definitions. |
| R2 | P0 | Web/daemon API contract is implicit. | `apps/web` calls daemon through `/api/*` rewrites; web has TypeScript types, daemon returns manually shaped JSON. | Field mismatches surface at runtime; API evolution is fragile. | Create `packages/api-contract` or an equivalent shared contract layer for request, response, error, and SSE event types. |
| R3 | P0 | Runtime validation is incomplete at the daemon boundary. | Daemon requests can trigger local filesystem access, SQLite writes, and `child_process.spawn()`. | Type correctness alone cannot protect against malformed runtime input, path traversal, invalid agent IDs, or unsafe args. | Add schema validation at HTTP boundaries with Zod/TypeBox; centralize validation for workspace paths, task IDs, agent IDs, models, reasoning options, uploaded files, and command arguments. |
| R4 | P0 | Local capability security boundary needs explicit rules. | Daemon owns high-permission capabilities: local files, `.od`, project workspaces, agent CLIs, and logs. | Unsafe path handling, broad command execution, token leakage, and unintended workspace access become possible failure modes. | Treat daemon as a capability server: bind to localhost, use workspace/path allowlists, normalize and jail paths, allowlist agent commands, and redact sensitive output. |
| R5 | P0 | Agent process lifecycle needs a first-class manager. | `/api/chat` spawns multiple agent runtimes and streams output to the frontend. | Zombie processes, cancellation gaps, orphaned tasks, inconsistent exit handling, and concurrent process conflicts. | Introduce a process/task manager with task state machine, cancellation, timeout, cleanup, exit code capture, signal handling, and concurrency limits. |
| R6 | P1 | `server.ts` is too monolithic. | `apps/daemon/src/server.ts` contains many routes plus orchestration, filesystem logic, streaming, uploads, and artifact handling. | Harder to understand, test, and change; unrelated edits share the same file and increase regression risk. | Split into thin routes plus services/adapters: `routes/`, `services/`, `agents/`, `db/`, `fs/`, `streams/`, `artifacts/`. |
| R7 | P1 | Error handling is inconsistent. | Handlers commonly use local `try/catch` and return ad hoc JSON errors. | UI receives inconsistent failures; logs lose context; task state can stall after partial failures. | Define a unified error model with `code`, `message`, `details`, `retryable`, and `requestId/taskId`; add centralized Express error middleware and adapter-level error mapping. |
| R8 | P1 | SSE protocol is under-specified. | Daemon manually writes `text/event-stream` events for agent output and status. | Frontend parsing is fragile; disconnect, heartbeat, terminal events, and error semantics can drift. | Version the SSE event contract and define canonical events such as `task.started`, `task.output`, `task.error`, `task.completed`, `task.cancelled`, and `heartbeat`. |
| R9 | P1 | SQLite schema and migration lifecycle need stronger guarantees. | `apps/daemon/src/db.ts` owns local `better-sqlite3` tables and migrations. | Local user data upgrades can fail unpredictably; schema drift is hard to diagnose and recover. | Add explicit migration table, ordered forward migrations, startup migration checks, schema version logging, backup-before-migrate strategy, and migration tests. |
| R10 | P1 | Test coverage is thin around daemon behavior. | Existing daemon tests focus on stream parsing and artifact manifest behavior; HTTP/DB/spawn flows have limited coverage. | Changes are validated by manual testing; regressions in filesystem, SQLite, SSE, or agent mocks can ship. | Build layered tests: shared contract tests, route integration tests, service unit tests, SQLite migration tests, SSE parser tests, and agent mock integration tests. |
| R11 | P1 | Logging and observability are insufficient for local runtime debugging. | Agent execution involves long-lived tasks, subprocess output, filesystem state, and frontend SSE consumption. | User issues are hard to reproduce; failures lack correlated context. | Add structured logs with `requestId`, `taskId`, `agentId`, `workspace`, exit code, and duration; separate app logs from agent output; redact secrets. |
| R12 | P2 | Configuration, port, and health behavior can become fragile. | Web proxies `/api/*` to daemon; dev startup coordinates Next.js and daemon ports. | Port conflicts, daemon-not-ready states, and mismatched environment variables can break startup or distribution. | Centralize config resolution; expose `/health`; add daemon readiness checks; make port selection and UI fallback deterministic. |
| R13 | P2 | Cross-platform behavior is a recurring risk. | Daemon uses filesystem paths, SQLite native bindings, shell/process behavior, and signals. | macOS, Linux, and Windows/WSL can differ in path normalization, quoting, permissions, and process termination. | Use Node path APIs consistently, avoid shell string composition, isolate platform-specific process logic, and add CI coverage for supported platforms. |
| R14 | P2 | Framework migration can distract from core maintainability issues. | Current complexity is concentrated in FS/spawn/SSE/SQLite and module boundaries. | A framework rewrite can consume time while preserving the risky domain logic. | Keep Express for now; revisit Fastify only after TS, contracts, validation, tests, and modularization are in place and Express becomes a clear limiter. |
| R15 | P2 | Web/daemon boundary can erode over time. | Next.js has BFF capability and daemon has backend capability; future edits may blur ownership. | High-permission local runtime logic may leak into `apps/web`; deployment and security assumptions become unclear. | Document and enforce ownership: web handles UI/BFF/proxy; daemon owns local runtime capabilities; shared code contains contracts and pure logic only. |
| R16 | P3 | Operational documentation is incomplete. | Local-first daemon behavior depends on ports, `.od`, agent CLIs, runtime logs, and recovery flows. | Onboarding and support costs rise; troubleshooting relies on oral knowledge. | Document daemon architecture, API/SSE contract, task lifecycle, `.od` data layout, agent dependency checks, and common recovery procedures. |

## Optimization Dependencies

The optimization work should proceed in dependency order. Some items can run in parallel once their prerequisites are stable.

| Workstream | Status | Optimization | Covers | Depends on | Output |
|---|---|---|---|---|---|
| W1 | Completed | Confirm architecture and capability boundaries | R4, R15 | — | Written ownership rules for web, daemon, shared contracts, and dangerous local capabilities. See `specs/current/architecture-boundaries.md`. |
| W2 | Planned | Define API, SSE, and error contracts | R2, R7, R8 | W1 | Shared request/response types, SSE event union, and error model. |
| W3 | Planned | Add gradual TypeScript support | R1 | W2 for highest-value shared types | Daemon TS config, `allowJs`, typed new modules, typed contracts imported by web and daemon. |
| W4 | Planned | Add runtime validation at daemon boundaries | R3, R4 | W2 | Schemas for HTTP requests, paths, agents, models, uploads, task IDs, and command args. |
| W5 | Planned | Modularize `server.js` | R6 | W2, W3, W4 | Thin route handlers plus services/adapters for agents, DB, FS, streams, and artifacts. |
| W6 | Planned | Introduce agent process/task manager | R5, R8, R11 | W2, W5 | Task state machine, cancellation, timeout, cleanup, exit handling, and concurrency controls. |
| W7 | Planned | Strengthen SQLite migrations | R9 | W5 or a clear DB adapter boundary | Migration table, ordered migrations, startup checks, backup strategy, migration tests. |
| W8 | Planned | Build the daemon test pyramid | R10 | W2, W4, W5 | Contract tests, route integration tests, service unit tests, migration tests, SSE tests, and mocked agent-process tests. |
| W9 | Planned | Add structured logs and observability | R11 | W2, W6 | Correlated request/task logs, sanitized agent output, durations, exit status, and diagnostic context. |
| W10 | Planned | Harden config, port, and readiness behavior | R12 | W1 | Centralized config, `/health`, readiness checks, deterministic port behavior. |
| W11 | Planned | Harden cross-platform behavior | R13 | W4, W6, W5 | Platform-specific process handling, path normalization rules, supported-platform CI. |
| W12 | Planned | Revisit HTTP framework choice | R14 | W2, W3, W4, W5, W8 | Evidence-based decision on whether Express remains adequate or Fastify provides clear net value. |
| W13 | Planned | Complete operational documentation | R16 | W1 through W11 as sections stabilize | Current-state docs, runbooks, troubleshooting guides, and recovery procedures. |

## Recommended Execution Order

```text
Phase 1: W1 -> W2 -> W3 -> W4
Phase 2: W5 -> W6 -> W7 -> W8
Phase 3: W9 -> W10 -> W11 -> W13
Phase 4: W12
```

The core principle is to reduce risk before changing framework foundations: establish contracts, types, validation, and module boundaries first; then evaluate whether Express remains the right transport layer.
