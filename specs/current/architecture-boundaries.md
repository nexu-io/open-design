# Architecture Boundaries

## Purpose

This document defines the architectural boundaries for the local Open Design app. These boundaries are architectural constraints; some enforcement details can be implemented later through the relevant roadmap workstreams.

## Product Shape

Open Design is a local-first application. The near-term Electron version is a shell around the same `apps/web` and `apps/daemon` architecture.

Electron does not introduce a separate privileged application layer. The web layer and daemon keep the same responsibilities in browser and Electron modes.

## Web Boundary

`apps/web` owns UI, presentation state, and thin BFF/proxy behavior.

`apps/web` must not directly access local privileged capabilities:

- `.od` state
- SQLite storage
- workspace filesystem reads or writes
- agent CLI processes
- task process lifecycle
- local logs and artifacts

The web layer communicates with daemon-owned capabilities through API DTOs and streaming events.

## Daemon Boundary

`apps/daemon` is the sole local capability server. It owns privileged local runtime behavior:

- `.od` state
- SQLite storage, schema, migrations, and storage layout
- workspace filesystem access
- agent CLI invocation
- task lifecycle and process cleanup
- logs, artifacts, and diagnostic state

Daemon capabilities should be isolated behind internal modules such as `db`, `fs`, `agents`, `tasks`, `logs`, and `artifacts`.

## Shared Boundary

Shared code must be pure JavaScript or TypeScript that can run in both web and daemon contexts.

Shared code may contain:

- API DTO types
- runtime schemas such as Zod or TypeBox schemas
- domain constants
- task states
- SSE event names
- error codes
- pure helper functions
- path-related logical string helpers

Shared code must not depend on framework or environment-specific APIs such as Next.js, Express, Node filesystem/process APIs, browser-only APIs, SQLite, or daemon internals.

## API DTO Boundary

The web layer should understand API DTOs, not daemon implementation details.

API DTOs should prefer workspace-scoped logical or relative paths. Machine absolute paths should remain daemon-internal. Enforcement can be implemented later through a workspace path resolver and runtime validation layer.

SQLite schema names, table structure, migration details, and storage layout are daemon-private. The web layer sees API DTOs for display and interaction.

## Workspace Boundary

The current architecture can assume one active workspace. Workspace root selection should come from explicit user choice or an explicit startup parameter.

Daemon filesystem access should be scoped to the active workspace root. Path normalization and root containment checks should be implemented in the daemon path resolver and validation layer.

Precise implementation priority for workspace enforcement can be deferred, but the boundary direction is fixed: web does not construct privileged filesystem paths, and daemon owns path resolution.

## Agent Command Boundary

Users cannot provide free-form shell commands for daemon execution.

Agent invocations should use controlled command templates and argument construction. User-provided content may enter prompts, files, or configuration fields, while command structure remains daemon-controlled.

Plugin or custom-agent command extension is outside the current scope.

## Security Baseline

The app is local-first. Daemon should bind locally, and local API authentication can be deferred.

Daemon output should redact sensitive values by default, including tokens, API keys, environment secrets, and Authorization-like headers.

## Task Lifecycle Boundary

Daemon owns the full task lifecycle. The web layer may create, subscribe to, query, and request cancellation for tasks through API DTOs and events.

Tasks belong to a workspace and an agent. Terminal states are:

- `succeeded`
- `failed`
- `cancelled`
- `interrupted`

The web layer requests cancellation; daemon determines final task state and owns cleanup. Detailed concurrency, timeout, scheduling, and recovery policies can be defined in the process manager workstream.

## Deferred Policy Details

The following policy details can be finalized in later workstreams:

- multiple workspace support
- workspace registry location
- artifact, cache, and log directory layout
- Electron workspace picker behavior
- task concurrency limits
- timeout defaults
- queueing strategy
- restart recovery behavior
- process-tree cleanup strategy

These deferred choices should preserve the boundaries in this document.
