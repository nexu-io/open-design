# 0001. Centralize daemon startup

## Status

Accepted

## Context

The `od` CLI serves two different roles: it can start the local daemon, and it can act as a thin client for commands such as `od media generate`. Client commands should talk to an already-running daemon and should not evaluate daemon startup code.

Previously, `apps/daemon/src/cli.ts` statically imported `server.ts`. Because ES modules execute top-level code during import, client-only commands also evaluated daemon startup globals, including daemon data directory resolution. A bad runtime data directory could therefore fail media generation before the CLI even sent its HTTP request. Current daemon data-path rules live only in root [`AGENTS.md`](../../AGENTS.md) → **Daemon data directory contract**; this ADR MUST NOT restate them.

The daemon sidecar also started the server directly, so startup behavior was split between the human CLI path and the sidecar path.

## Decision

Introduce a shared daemon startup orchestrator used by both human CLI daemon mode and daemon sidecar startup.

`server.ts` remains the low-level server construction primitive. The startup orchestrator owns product startup concerns such as parsing daemon CLI options, invoking `startServer({ returnServer: true })`, shared HTTP shutdown, optional browser opening, and signal handling for CLI daemon mode.

Client-only CLI commands must not import `server.ts`.

## Alternatives considered

- CLI-only lazy import: this fixes the immediate media failure, but leaves daemon startup behavior duplicated between CLI and sidecar paths.
- Keep sidecar directly calling `startServer`: this preserves the old split ownership and makes future startup changes easier to apply inconsistently.
- Extract all server runtime context from `server.ts`: this is a stronger boundary, but broader than needed for the current bug and can be done later if more top-level startup side effects leak.

## Consequences

Client commands can fail only on their own client concerns or daemon responses, not on daemon startup filesystem checks. CLI and sidecar startup now share the same server start/stop mechanics, while route tests can continue using `startServer` directly.
