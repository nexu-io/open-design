# langfuse-trace

Capability-barrel module for Langfuse telemetry delivery. Handles the full
pipeline from reading sink configuration through building structured payloads
to posting them to Langfuse or a relay endpoint, with consent gating
throughout.

## What changed (refactor history)

The 2,073-line flat `langfuse-trace.ts` was split into `langfuse-trace/` with
a `core/` foundation kernel + concern subdirectories, each with a barrel.
Public export surface is byte-for-byte the same 34 names (8 values + 26
types). Pure structural move — no behavior changes. Function bodies moved
byte-identically.

## Why this shape (architecture reasoning)

The module is organized as a foundation kernel plus four concern layers.
Dependency arrows flow in one direction; no cycles exist.

- **`core/`** — Foundation kernel: `types.ts` (26 shared interfaces/types),
  `constants.ts` (byte caps, timeouts, retries, base URL), `redact.ts`
  (privacy redaction for prompts and tool I/O), `primitives.ts` (pure
  helpers: int parsers, truncation). Imports no sibling subdirectory;
  everything else may import `core/` directly.

- **`config/`** — Resolves telemetry sink configuration and delivery state
  from environment variables (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
  `LANGFUSE_BASE_URL`, relay vars) and from caller-supplied opts. Produces
  `TelemetrySinkConfig` and `LangfuseDeliveryState`.

- **`payload/`** — Builds the Langfuse ingestion batch objects: token cost
  (`cost.ts`), wall-clock timing (`timing.ts`), diagnostic annotations
  (`diagnostics.ts`), run/message/artifact summaries (`summaries.ts`),
  feedback score payloads (`feedback.ts`), and the main trace payload
  assembler (`trace-payload.ts`). Depends on `config/` because
  `buildTracePayload` calls `deriveLangfuseDeliveryState` and
  `readTelemetrySinkConfig` to embed delivery metadata in the trace.

- **`delivery/`** — Network layer: `batch-transport.ts` POSTs a batch to
  Langfuse or a relay endpoint with configurable retries and per-event-error
  handling. No business logic — pure HTTP transport.

- **`reporting/`** — Orchestration entrypoints (`reportRunCompleted`,
  `reportRunFeedback`): gate on consent prefs, build the payload, enforce
  the hard byte cap (`HARD_BATCH_MAX_BYTES`), and call `delivery/`. Depends
  on `config/`, `payload/`, and `delivery/`.

Acyclic non-foundation dependency edges:

| From | To | Reason |
|---|---|---|
| `payload/` | `config/` | `buildTracePayload` embeds delivery state |
| `reporting/` | `config/` | consent gate + config resolution |
| `reporting/` | `payload/` | calls `buildTracePayload` / `buildFeedbackPayload` |
| `reporting/` | `delivery/` | calls `postLangfuseBatch` / `postRelayBatch` |

## Import conventions

- **External code** must import exclusively from the root barrel
  (`langfuse-trace/index.ts` or the package path that resolves to it). Never
  import from a subdirectory file directly.
- **Within the module**, every subdirectory may import from `core/` directly.
  Cross-subdirectory imports follow the declared edges above and go through
  the sibling's barrel (`../config/index.js`), never through a sibling's
  internal file.
- **A subdirectory must never import the root barrel** — doing so would
  create a cycle.
- **The root barrel uses explicit named re-exports only** — `export { X }
  from '...'` and `export type { X } from '...'`. Never `export *`.
- **Tests** are exempt from the barrel guard by design (test files import
  internal helpers directly when needed), but public-surface tests still
  import via the root barrel.

## Known limitations & staged migration

The capability-barrel guard (`scripts/check-barrel-imports.ts` and
`CAPABILITY_BARREL_DOMAINS`) does **not** yet exist on the target branch
(`main`), so this module's domain registration is deferred to a follow-up
once the guard infrastructure lands. The full island structure — `core/` +
concern subdirectories, `@module` docblocks, per-export JSDoc, and this
README — is present now; only the guard-registry entry is deferred.

When registered, the domain entry will be:

```ts
{
  name: 'langfuse-trace',
  root: 'apps/daemon/src/langfuse-trace',
  subdirs: ['core', 'config', 'payload', 'delivery', 'reporting'],
  foundation: 'core',
  allowedEdges: [
    ['payload', 'config'],
    ['reporting', 'config'],
    ['reporting', 'payload'],
    ['reporting', 'delivery'],
  ],
}
```

## Directory structure

```
langfuse-trace/
├── index.ts                 Root barrel — the only public import point
├── README.md                This file
├── core/
│   ├── index.ts             Core barrel (re-exports all four files below)
│   ├── types.ts             All 26 shared interfaces and type aliases
│   ├── constants.ts         Byte caps, timeouts, retries, base URL
│   ├── redact.ts            Privacy redaction for prompts and tool I/O
│   └── primitives.ts        Pure helpers: int parsers, string truncation
├── config/
│   ├── index.ts             Config barrel
│   └── sink-config.ts       Env-var resolution → TelemetrySinkConfig + delivery state
├── payload/
│   ├── index.ts             Payload barrel
│   ├── cost.ts              Token cost computation
│   ├── timing.ts            Wall-clock and per-phase timing
│   ├── diagnostics.ts       Diagnostic annotation objects
│   ├── summaries.ts         Run / message / artifact summary builders
│   ├── feedback.ts          Feedback score payload builder
│   └── trace-payload.ts     Main Langfuse trace batch assembler
├── delivery/
│   ├── index.ts             Delivery barrel
│   └── batch-transport.ts   HTTP POST to Langfuse or relay, with retries
└── reporting/
    ├── index.ts             Reporting barrel
    └── report.ts            Consent-gated orchestration: reportRunCompleted, reportRunFeedback
```

## Types

All 26 shared types live in `core/types.ts` and are re-exported through the
root barrel. They cover:

- **Sink config / delivery state** — `LangfuseConfig`, `TelemetrySinkConfig`,
  `LangfuseDeliveryState`, `LangfuseDeliveryStatus`, `LangfuseDropReason`
- **Run / message / artifact summaries** — `RunSummary`, `MessageSummary`,
  `ArtifactSummary`, `EventsSummary`, `ToolCallSummary`, `AgentEventSummary`,
  `TraceObjectSummary`
- **Object manifests** — `TraceSafeObjectManifestBase`,
  `AttachmentManifestEntry`, `ArtifactManifestEntry`,
  `InputTextSnapshotManifestEntry`, plus the five manifest enum types
  (`ObjectManifestCompleteness`, `ObjectManifestStatus`,
  `ObjectManifestSensitivity`, `ObjectManifestAccessScope`,
  `ObjectManifestRetentionPolicy`)
- **Report contexts** — `ReportContext`, `ReportRunOpts`,
  `FeedbackReportContext`, `TurnInfo`, `RuntimeInfo`
