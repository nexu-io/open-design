# agent-protocol

Daemon module providing the ACP and pi RPC subprocess protocol adapters used to drive external AI agent CLIs from the Open Design daemon.

---

## What changed (refactor history)

The module was originally two flat source files alongside a shared helper:

- `acp.ts` (~1,744 lines) — the ACP (Agent Control Protocol) adapter, covering session setup, JSON-line streaming, model detection, and MCP server forwarding.
- `pi-rpc.ts` (~684 lines) — the pi `--mode rpc` adapter, covering prompt delivery, event mapping, session-file capture, and image forwarding.

Both files imported `createJsonLineStream` from the same JSON-line transport helper. The flat layout made the dependency between pi-rpc and acp invisible, and any file could reach into the other's internals.

The refactor used a strangler-fig pattern — **no logic changes, only structural moves**:

1. Created `core/`, `acp/`, and `pi-rpc/` subdirectories.
2. Moved `createJsonLineStream` into `core/json-line-stream.ts` — the one primitive shared by both adapters.
3. Split `acp.ts` into eight concern files under `acp/`: `types.ts`, `constants.ts`, `json.ts`, `models.ts`, `rpc.ts`, `session-params.ts`, `session.ts`, `updates.ts`.
4. Split `pi-rpc.ts` into four concern files under `pi-rpc/`: `internal.ts`, `events.ts`, `models.ts`, `session.ts`.
5. Added per-subdirectory barrel `index.ts` files with `@module` docblocks.
6. Made the root `index.ts` re-export only from those subdir barrels, preserving the exact prior public surface (10 names).
7. Added `@module` docblocks and per-export JSDoc to every file.

The public API surface (`index.ts` exports) is unchanged — external consumers see no difference.

---

## Why this shape (architecture reasoning)

Moving `createJsonLineStream` into `core/` dissolved the former `pi-rpc → acp` import edge that existed in the flat layout. The result is a pure star topology:

```
core/  ←  acp/
core/  ←  pi-rpc/
```

Neither `acp/` nor `pi-rpc/` imports the other. The declared `allowedEdges` for this domain is `[]` — no cross-concern imports are permitted at all. Any future shared primitive must land in `core/` rather than creating a lateral edge.

This layout was chosen for the same reason as the `design-systems` reference implementation: *structure without enforcement is cosmetic*. The guard registration is intentionally deferred (see "Known limitations" below), but the full documented structure is in place so the registration is a single-line addition once the infra lands on `main`.

---

## Import conventions

- All relative imports use `.js` extensions (Node ESM).
- **`core/` is the foundation kernel.** Both `acp/` and `pi-rpc/` may import from `core/` directly (`'../core/index.js'` or a `'../core/<file>.js'` path); `core/` itself imports no sibling.
- **`acp/` and `pi-rpc/` must not import each other.** Cross-concern imports go only through the root barrel (`'../index.js'`), which is itself off-limits to the concern subdirs (it re-exports all of them and would create a cycle). If a new shared primitive is needed, add it to `core/`.
- **The root barrel uses explicit named re-exports** — never `export *` — so the public surface is enumerable and free of silent name collisions.
- **External daemon code imports from `'./agent-protocol/index.js'`** (or the subpath equivalent) — never from a subdirectory path directly.

The 10 names on the public surface, in barrel order:

```
createJsonLineStream      // core/
AcpMcpServerInput         // acp/ (type)
ModelOption               // acp/ (type)
buildAcpSessionNewParams  // acp/
normalizeModels           // acp/
detectAcpModels           // acp/
attachAcpSession          // acp/
mapPiRpcEvent             // pi-rpc/
attachPiRpcSession        // pi-rpc/
parsePiModels             // pi-rpc/
```

---

## Known limitations and staged migration

**Guard registration is intentionally deferred.** The `check-barrel-imports.ts` guard infra (`CAPABILITY_BARREL_DOMAINS` registry, `pnpm guard` wiring) is not yet on `main`. The full capability-barrel structure — `core/` + concern subdirs, `@module` docblocks, per-export JSDoc, this README — is in place. The `CAPABILITY_BARREL_DOMAINS` entry lands in a follow-up once the guard infra merges.

**`core/` currently contains one file.** `json-line-stream.ts` is the only member. A single-file `core/` is justified here: it is the shared transport primitive that both adapters depend on, and the subdir makes the dependency direction explicit without requiring a comment to explain it.

---

## Directory structure

```
agent-protocol/
├── index.ts            Root barrel — named re-exports from core/, acp/, and pi-rpc/
├── core/
│   ├── index.ts        core/ barrel
│   └── json-line-stream.ts  createJsonLineStream: shared JSON-line transport
├── acp/
│   ├── index.ts        acp/ barrel
│   ├── types.ts        Shared ACP types and interfaces
│   ├── constants.ts    Protocol constants (method names, timeouts)
│   ├── json.ts         JSON-line parsing helpers for ACP stdout
│   ├── models.ts       normalizeModels, detectAcpModels
│   ├── rpc.ts          Low-level RPC send/receive helpers
│   ├── session-params.ts  buildAcpSessionNewParams
│   ├── session.ts      attachAcpSession: session lifecycle
│   └── updates.ts      ACP update-event handling
└── pi-rpc/
    ├── index.ts        pi-rpc/ barrel
    ├── internal.ts     Shared primitives: JsonRecord, SendAgentEvent, TokenUsage, guards
    ├── events.ts       mapPiRpcEvent: pure pi RPC → daemon event mapper
    ├── models.ts       parsePiModels: `pi --list-models` parser
    └── session.ts      attachPiRpcSession: session lifecycle, image forwarding, abort
```

---

## Consumers

| Consumer | What it imports |
|---|---|
| `runtimes/defs/shared.ts` | `detectAcpModels`, `parsePiModels` |
| `connectionTest.ts` | `attachAcpSession` |
| `server.ts` | `attachAcpSession`, `attachPiRpcSession` |
