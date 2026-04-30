---
id: 20260430-implement-maintainability-w2-w3
name: Implement Maintainability W2 W3
status: researched
created: '2026-04-30'
---

## Overview

### Problem Statement

`apps/web` and `apps/daemon` need the next maintainability-roadmap workstreams implemented: W2 and W3 from `specs/current/maintainability-roadmap.md`. This spec targets a full project migration to TypeScript as the end state; the implementation plan can still use incremental steps so each step is easy to validate.

### Goals

- Implement W2: define shared API, SSE, and error contracts covering R2, R7, and R8.
- Implement W3 as a full TypeScript migration for project-owned JavaScript entrypoints, modules, scripts, tests, and reporters, covering R1 and related maintainability risk across the repository.
- Provide shared request/response types, an SSE event union, and an error model that can be imported by both web and daemon code.
- Configure TypeScript so all migrated project code is checked consistently, with migration steps ordered for safe verification.

### Scope

- Create or update the shared contract layer for web/daemon request, response, error, and SSE event types.
- Add TypeScript configuration and package/script integration needed to migrate daemon, repository scripts, and test support code to TypeScript.
- Keep the existing architecture boundary from the roadmap: `apps/web` remains the Next.js frontend and thin BFF/proxy layer; `apps/daemon` remains the local runtime/backend.

### Constraints

- W2 depends on the completed W1 ownership and capability boundaries.
- W3 should build on W2 for highest-value shared types.
- Runtime validation, server modularization, process/task manager work, and broader daemon test pyramid work belong to later roadmap workstreams.

### Success Criteria

- Web and daemon can import the same contract types.
- Project-owned source, scripts, tests, and reporters have a TypeScript migration path with a typed end state.
- Typecheck covers the shared contracts, web, daemon, scripts, and test support code included in this spec.
- The new contracts explicitly cover HTTP payloads, SSE events, and the unified error model.

## Research

### Existing System

- W2 covers the implicit web/daemon API contract, inconsistent error handling, and under-specified SSE protocol; the roadmap's W3 text names daemon TypeScript support as the original output. Source: `specs/current/maintainability-roadmap.md:57-58`
- W1 defines the shared boundary as pure JavaScript or TypeScript usable by both web and daemon, with API DTO types, runtime schemas, task states, SSE event names, and error codes as allowed shared contents. Source: `specs/current/architecture-boundaries.md:41-56`
- `apps/web` communicates with daemon-owned capabilities through API DTOs and streaming events, while privileged local filesystem, SQLite, agent CLI, task lifecycle, logs, and artifacts stay daemon-owned. Source: `specs/current/architecture-boundaries.md:13-40`
- The workspace currently has no `packages/*` workspace entries; `pnpm-workspace.yaml` includes `apps/*` and `e2e` only. Source: `pnpm-workspace.yaml:1-3`
- No shared package currently exists under `packages/*`. Source: file search `packages/*/package.json`
- Root scripts run daemon, web, build, tests, and typecheck through pnpm filters; root `typecheck` currently targets only `@open-design/web`. Source: `package.json:12-25`
- Dev-mode web rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to the local daemon origin; the config notes that `/api/chat` SSE streams through the rewrite. Source: `apps/web/next.config.ts:35-44`
- Web-side daemon chat types live in `apps/web/src/providers/daemon.ts`: `DaemonStreamOptions` sends `agentId`, `history`, `systemPrompt`, `projectId`, `attachments`, `model`, and `reasoning`. Source: `apps/web/src/providers/daemon.ts:19-38`
- The web chat client posts `/api/chat` with JSON fields `agentId`, `systemPrompt`, `message`, `projectId`, `attachments`, `model`, and `reasoning`. Source: `apps/web/src/providers/daemon.ts:57-77`
- The daemon `/api/chat` handler reads the same request fields from `req.body`, validates agent and message ad hoc, and returns HTTP 400 JSON errors for invalid agent, missing binary, or missing message. Source: `apps/daemon/server.js:868-884`
- Web-side `AgentEvent` currently models UI events as `status`, `text`, `thinking`, `tool_use`, `tool_result`, `usage`, and `raw`. Source: `apps/web/src/types.ts:32-39`
- Daemon SSE setup for `/api/chat` writes `text/event-stream` frames with `event: <name>` and JSON `data`, using events such as `start`, `agent`, `stdout`, `stderr`, `error`, and `end`. Source: `apps/daemon/server.js:1035-1044`, `apps/daemon/server.js:1087-1095`, `apps/daemon/server.js:1136-1180`
- The web SSE parser consumes frame separators, parses event/data fields, maps `stdout` to text, buffers `stderr`, translates `agent` payloads, handles `start`, treats `error` as terminal, and reads `end` exit code. Source: `apps/web/src/providers/daemon.ts:85-151`
- Web translation accepts daemon `agent` payload types `status`, `text_delta`, `thinking_delta`, `thinking_start`, `tool_use`, `tool_result`, `usage`, and `raw`; unknown payloads are ignored. Source: `apps/web/src/providers/daemon.ts:178-228`
- Agent JSON event parsing emits normalized events such as `status`, `text_delta`, `tool_use`, `tool_result`, `usage`, and `raw`; OpenCode error payloads currently become a `raw` event with embedded error text. Source: `apps/daemon/json-event-stream.js:35-91`
- The daemon API proxy has a separate SSE endpoint at `/api/proxy/stream` with request fields `baseUrl`, `apiKey`, `model`, `systemPrompt`, and `messages`, and returns `start`, `delta`, `error`, and `end` SSE events. Source: `apps/daemon/server.js:1188-1192`, `apps/daemon/server.js:1241-1250`, `apps/daemon/server.js:1262-1275`, `apps/daemon/server.js:1291-1303`
- HTTP error responses are ad hoc: project routes often return `{ error: string }`, upload errors return `{ code, error }`, and preview errors derive status plus `{ error }`. Source: `apps/daemon/server.js:200-205`, `apps/daemon/server.js:147-177`, `apps/daemon/server.js:755-763`
- Project CRUD and conversation/message routes shape common response envelopes such as `{ projects }`, `{ project, conversationId }`, `{ project }`, `{ conversations }`, `{ conversation }`, and `{ messages }`. Source: `apps/daemon/server.js:200-269`, `apps/daemon/server.js:325-424`
- File routes shape common response envelopes such as `{ files }`, `{ file }`, and `{ ok: true }`, while raw file routes return binary data. Source: `apps/daemon/server.js:725-752`, `apps/daemon/server.js:776-833`, `apps/daemon/server.js:840-864`
- `apps/daemon/projects.js` owns project file DTO construction with fields `name`, `path`, `type`, `size`, `mtime`, `kind`, `mime`, `artifactKind`, and `artifactManifest`. Source: `apps/daemon/projects.js:30-70`
- Web application types already include daemon-adjacent DTOs such as `AgentInfo`, `ProjectFileKind`, `ProjectFile`, `Project`, and chat attachment/message/event types in `apps/web/src/types.ts`. Source: `apps/web/src/types.ts:41-101`, `apps/web/src/types.ts:150-160`
- `apps/web` has TypeScript configured with `strict`, `noUncheckedIndexedAccess`, `allowJs`, `noEmit`, and a `typecheck` script using `tsc -b --noEmit`. Source: `apps/web/tsconfig.json:2-23`, `apps/web/package.json:6-10`
- `apps/daemon` is ESM, starts with `node cli.js`, tests with `vitest run -c vitest.config.ts`, and currently has no `typecheck` script. Source: `apps/daemon/package.json:1-23`
- The daemon test config is TypeScript and includes `**/*.test.{ts,tsx,js,mjs,cjs}` under a Node test environment. Source: `apps/daemon/vitest.config.ts:1-8`
- `apps/daemon` currently contains JavaScript and MJS project code alongside TypeScript test/config files: `cli.js`, `server.js`, `db.js`, `agents.js`, stream parsers, project/design-system helpers, artifact helpers, `json-event-stream.test.mjs`, `artifact-manifest.test.ts`, and `vitest.config.ts`. Source: file search `apps/daemon/**/*.{js,mjs,cjs,ts,tsx}`
- `apps/web` source and config files are TypeScript/TSX, including `next.config.ts`, `app/**/*.tsx`, `src/**/*.ts`, `src/**/*.tsx`, and `vitest.config.ts`. Source: file search `apps/web/**/*.{js,mjs,cjs,ts,tsx}`
- `e2e` is mixed: Playwright and Vitest config/tests are TypeScript, while runtime/support scripts and reporters include `.mjs` and `.cjs` files. Source: `e2e/package.json:6-12`, `e2e/playwright.config.ts:1-58`, `e2e/vitest.config.ts:1-12`, file search `e2e/**/*.{js,mjs,cjs,ts,tsx}`
- Root scripts are currently MJS files: `scripts/resolve-dev-ports.mjs`, `scripts/dev-all.mjs`, and `scripts/sync-design-systems.mjs`. Source: file search `scripts/**/*.{js,mjs,cjs,ts,tsx}`

### Available Approaches

- **Add a new shared workspace package**: create a workspace package for contracts and add it to the pnpm workspace so both `apps/web` and `apps/daemon` can import pure shared TypeScript. This matches the roadmap output of a shared contract layer and the W1 shared-boundary rules. Source: `specs/current/maintainability-roadmap.md:57-58`, `specs/current/architecture-boundaries.md:41-56`, `pnpm-workspace.yaml:1-3`
- **Keep shared contracts inside an existing app**: moving contract types under `apps/web` would reuse the current location of many UI-adjacent types, but W1 says shared code should contain pure DTOs and avoid framework or environment-specific APIs. Source: `apps/web/src/types.ts:32-101`, `specs/current/architecture-boundaries.md:41-56`
- **Start with type-only contracts**: W2 can define request/response, SSE event, and error model types first, while runtime schemas remain in the later W4 workstream. Source: `specs/current/maintainability-roadmap.md:57-60`
- **Migrate repository code to a typed end state in phases**: W3 can add TypeScript configs and package scripts first, then convert daemon modules, root scripts, and e2e support files in bounded batches while running typecheck/test verification after each batch. Source: `apps/daemon/package.json:9-13`, `apps/daemon/vitest.config.ts:1-8`, `e2e/package.json:6-12`, file search `apps/daemon/**/*.{js,mjs,cjs,ts,tsx}`, file search `scripts/**/*.{js,mjs,cjs,ts,tsx}`
- **Broaden root typecheck**: root `typecheck` currently targets only web, so full project TypeScript verification requires daemon, shared package, scripts, and e2e/support coverage. Source: `package.json:23`, `apps/daemon/package.json:9-13`, `e2e/package.json:6-12`

### Constraints & Dependencies

- W2 depends on completed W1 ownership boundaries, and W3 depends on W2 for the highest-value shared types. Source: `specs/current/maintainability-roadmap.md:56-58`
- Runtime validation for HTTP inputs, paths, agents, models, uploads, task IDs, and command args is W4 scope, so research for W2/W3 should capture type boundaries without implementing full validation policy yet. Source: `specs/current/maintainability-roadmap.md:59`
- Shared code must stay free of Next.js, Express, Node filesystem/process APIs, browser APIs, SQLite, and daemon internals. Source: `specs/current/architecture-boundaries.md:41-56`
- API DTOs should prefer workspace-scoped logical or relative paths; machine absolute paths should remain daemon-internal. Source: `specs/current/architecture-boundaries.md:58-64`
- The `/api/chat` stream currently includes daemon-internal `cwd` in the `start` SSE event. Source: `apps/daemon/server.js:1087-1095`
- Current daemon SSE lifecycle has no heartbeat or version field in emitted events. Source: `apps/daemon/server.js:1035-1044`, `apps/daemon/server.js:1087-1180`
- Current error responses and SSE errors do not use a unified model with `code`, `message`, `details`, `retryable`, and `requestId/taskId`. Source: `apps/daemon/server.js:147-177`, `apps/daemon/server.js:200-205`, `apps/daemon/server.js:868-884`, `apps/daemon/server.js:1170-1180`
- Daemon package devDependencies currently include `vitest` only; TypeScript and Node/Express type packages are available in web but not daemon. Source: `apps/daemon/package.json:21-23`, `apps/web/package.json:19-24`
- Full-project TypeScript migration includes CommonJS/MJS operational edges such as Playwright reporter loading and Node test/script execution. Source: `e2e/playwright.config.ts:22-37`, `e2e/package.json:8-12`, `package.json:14-15`

### Key References

- `specs/current/maintainability-roadmap.md:57-58` - W2/W3 outputs and dependency relationship.
- `specs/current/architecture-boundaries.md:41-56` - allowed shared contract contents and shared-code restrictions.
- `apps/web/next.config.ts:35-44` - dev proxy boundary for web-to-daemon API and SSE.
- `apps/web/src/providers/daemon.ts:19-38` - web-side `/api/chat` request options.
- `apps/web/src/providers/daemon.ts:85-151` - web-side SSE frame handling.
- `apps/web/src/providers/daemon.ts:178-228` - web-side daemon agent event translation.
- `apps/web/src/types.ts:32-39` - current UI `AgentEvent` union.
- `apps/daemon/server.js:868-884` - daemon `/api/chat` request field handling and ad hoc HTTP errors.
- `apps/daemon/server.js:1035-1044` - daemon SSE frame writer.
- `apps/daemon/server.js:1087-1180` - daemon `/api/chat` start/agent/stdout/stderr/error/end lifecycle.
- `apps/daemon/server.js:1188-1303` - daemon API proxy stream request and SSE events.
- `apps/daemon/json-event-stream.js:35-91` - normalized agent JSON event output.
- `apps/daemon/package.json:9-23` - daemon scripts and dependencies.
- `apps/web/tsconfig.json:2-23` - web TypeScript baseline.
- `e2e/package.json:6-12` - e2e test scripts that currently execute TS config plus MJS runtime support.
- `pnpm-workspace.yaml:1-3` - current workspace package globs.

## Design

<!-- Technical approach, architecture decisions, and test strategy. Each design decision should cite a fact source. -->

## Plan

<!-- Optional: Step breakdown for complex features that need multiple implementation steps.
     Decided during Design. Checked off during Implement.
     Keep this section compact and step-based.
     Use markdown checkboxes for all step and substep items, for example:
     - [ ] Step 1: Foo
       - [ ] Substep 1.1 Implement: Foo foundation
       - [ ] Substep 1.2 Implement: Foo integration
       - [ ] Substep 1.3 Implement: Foo edge handling
       - [ ] Substep 1.4 Verify: Foo automated coverage
       - [ ] Substep 1.5 Verify: Foo manual workflow
     - [ ] Step 2: Bar
       - [ ] Substep 2.1 Implement: Bar
       - [ ] Substep 2.2 Verify: Bar
     - [ ] Step 3: Baz
       - [ ] Substep 3.1 Implement: Baz
       - [ ] Substep 3.2 Verify: Baz
     Use a capability-based step breakdown with reviewable, meaningful increments.
     Good boundaries align with one user-visible workflow, one subsystem/integration boundary, one migration/rollout step, or one stabilization milestone.
     Each step must include small, independent substeps for implementation and immediate testing/verification.
     Within each step, list implementation substeps before verification substeps.
     The final step may focus on overall testing/verification, edge cases, regression coverage, and coverage improvements.
     A step is complete only when relevant tests pass.
     Size steps so one coding agent can implement + validate in a single session.
     Write each substep as one small, independent task. -->

## Notes

<!-- Optional sections — add what's relevant. -->

### Implementation

<!-- Files created/modified, decisions made during coding, deviations from design -->

### Verification

<!-- How the feature was verified: tests written, manual testing steps, results -->
