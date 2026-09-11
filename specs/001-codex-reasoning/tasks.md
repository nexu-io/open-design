# Tasks

## Setup and foundations

- [x] T001 Document spec, clarification, research, contracts and plan in this directory.
- [x] T002 Add red catalogue/forwarding tests in apps/daemon/tests/runtimes/reasoning.test.ts.
- [x] T003 Extend DTOs in packages/contracts/src/api/{registry,chat}.ts and runtime types.

## US1 — Dynamic capabilities

- [x] T004 Parse reasoning metadata in apps/daemon/src/runtimes/defs/codex.ts.
- [x] T005 Test and implement model-aware selectors in apps/web/src/components and web-local helpers.

## US2 — Valid selections

- [x] T006 Implement preference reconciliation in apps/web/src/App.tsx and SettingsDialog.tsx.
- [x] T007 Test/implement shared daemon reasoning validation and selected-runtime discovery.
- [x] T008 Wire validation into server.ts and routes/chat.ts; extend compatibility clamp.

## US3 — External execution

- [x] T009 Test/implement od run reasoning with existing prompt-file and redesign semantics in apps/daemon/src/cli.ts.
- [x] T010 Test/implement MCP capability discovery and run forwarding in apps/daemon/src/mcp.ts.

## Validation and closure

- [x] T011 Run HTTP/child-boundary and visible UI acceptance; save evidence.
- [x] T012 Run guard/typecheck and affected tests/builds; document results and final analysis.

Dependencies: T001 → T002 → T003 → T004; T005/T006 and T007/T008 depend on
T003/T004; T009/T010 depend on shared contracts; T011/T012 follow all implementation.
Tests precede their implementation. Independent daemon/web checks may execute in
parallel; source edits remain sequential. Deliver the whole feature, not a partial MVP.
