# telemetry

Prompt-stack and environment telemetry for the daemon, organized as a
machine-enforced **capability-barrel** module. External runtime code imports
only the root barrel (`./index.ts`); the `check-barrel-imports` guard
(`scripts/check-barrel-imports.ts`, run by `pnpm guard`) fails CI on any import
that reaches past it.

This module was refactored from two flat files —
`apps/daemon/src/prompt-telemetry.ts` and
`apps/daemon/src/telemetry-environment.ts` — into a `core/` foundation plus two
concern subdirectories, following the proven `apps/daemon/src/design-systems`
reference (#5088 / #5087).

## What changed (refactor history)

1. Created `telemetry/core/` and moved the shared prompt-stack **types**
   (`PromptTelemetrySectionKind`, `PromptTelemetryInputSection`,
   `PromptTelemetrySection`, `PromptStackTelemetry`,
   `StructuredPromptStackInput`) into `core/types.ts`, the public constants
   (`PROMPT_STACK_REDACTION_VERSION`, `PROMPT_STACK_PATH_MARKER`) into
   `core/constants.ts`, and the environment resolver
   (`readTelemetryEnvironment`, formerly `telemetry-environment.ts`) into
   `core/environment.ts`.
2. Moved the redaction primitives (`redactLocalPaths` and the domain-internal
   `redactPromptText` / `sanitizeSectionContent`, plus the path regexes and the
   tool-token stripper) into `redaction/redaction.ts`.
3. Moved the prompt-stack assembly and its projections
   (`buildPromptStackTelemetry`, `promptStackWithoutContent`,
   `structuredPromptStackInput`, `buildPromptStackFlatMetadata`, and all the
   private hashing/metadata-summary/budget helpers) into `builder/builder.ts`.
4. Added a barrel `index.ts` to each subdirectory and an explicit-named-export
   root barrel reproducing the exact prior public surface (13 names).
5. Rewrote every external importer (`server.ts`, `langfuse-trace.ts`,
   `langfuse-bridge.ts`, `analytics.ts`, and the three telemetry test files) to
   import from the root barrel.
6. Registered the `telemetry` domain in `CAPABILITY_BARREL_DOMAINS`.

Function bodies were moved byte-for-byte — no behavior change.

## Why this shape (architecture reasoning)

The two original files had no enforced boundary: any daemon file could reach
either directly, so public-vs-internal API was indistinguishable and a future
cycle could form silently. The domain is small but high fan-in (imported by
`server.ts`, both Langfuse modules, and `analytics.ts`), which is exactly the
case where an unenforced surface rots fastest.

- **`core/` is the foundation kernel.** It holds the shared vocabulary (types),
  the protocol constants, and the standalone environment resolver — the pieces
  many callers need that depend on nothing else in the module. Every subdir may
  import `core/` directly; `core/` imports no sibling.
- **`redaction/`** owns scrubbing local paths and secrets out of prompt content
  before anything is hashed or captured. It is isolated because it is the
  security-critical layer and is exercised on its own (`redactLocalPaths` is
  public and directly unit-tested).
- **`builder/`** owns the actual prompt-stack assembly: fingerprinting,
  byte-budget allocation, and the content-free / structured / flat projections.
  It reaches `redaction/` for content sanitization along the **single declared
  edge** `builder → redaction`. There is no reverse edge — redaction never needs
  the builder — so the graph is a trivial DAG.

## Import conventions

The enforced rules for this module (a subset of the general capability-barrel
rules — see `apps/daemon/src/design-systems/README.md` for the full rationale):

- **Foundation:** `core/`. Any subdir may import it directly by any path.
- **Declared edges:** `builder → redaction` only, routed through the sibling
  barrel (`../redaction/index.js`). Every other cross-subdir import is a
  violation.
- **Barrel-only:** external runtime code imports the root barrel
  (`telemetry/index.js`); it must never reach a subdir file directly.
- **No root-barrel-from-subdir:** a subdir must not import `../index.js`.
- **Explicit named re-exports:** the root barrel enumerates its exports (no
  `export *`), so the public surface stays reviewable.
- **Tests are exempt by design.** The guard scans runtime code only. Tests may
  white-box internal helpers, but a test covering a *public-surface* symbol
  still imports it through the root barrel (as the three telemetry test files
  now do).

## Known limitations & staged migration

- `redactPromptText` and `sanitizeSectionContent` are exported from
  `redaction/index.ts` purely so the `builder` sibling can consume them through
  the barrel; they are **domain-internal**, not part of the root barrel's public
  surface. This is the intended way to share across a declared edge.
- `readTelemetryEnvironment` reads process env directly. It lives in `core/`
  because it is dependency-free and shared, even though it is a different
  concern from prompt-stack telemetry; splitting it into its own subdir would be
  over-structuring a single 20-line function. If more environment/config
  resolution accretes here, promoting it to its own `environment/` concern is
  the natural next step.
- The HTTP layer for telemetry (`apps/daemon/src/routes/telemetry.ts`) is the
  routes domain, **not** part of this module, and is intentionally untouched.

## Directory structure

```
telemetry/
  index.ts          Root barrel — the module's public API (explicit named re-exports).
  core/             Foundation kernel: shared types, constants, environment resolver.
    types.ts        Prompt-stack telemetry type vocabulary.
    constants.ts    Redaction protocol version + local-path marker.
    environment.ts  readTelemetryEnvironment — env-driven telemetry environment label.
    index.ts
  redaction/        Path/secret scrubbing applied before hashing or capture.
    redaction.ts    redactLocalPaths (public) + domain-internal sanitizers.
    index.ts
  builder/          Prompt-stack assembly + projections.
    builder.ts      buildPromptStackTelemetry and its content-free/structured/flat projections.
    index.ts
```

## Types

All shared types live in `core/types.ts`:

- `PromptTelemetrySectionKind` — the enumerated section kinds a prompt stack can contain.
- `PromptTelemetryInputSection` — a raw section handed to the builder.
- `PromptTelemetrySection` — a measured, fingerprinted section in the output payload.
- `PromptStackTelemetry` — the canonical assembled payload.
- `StructuredPromptStackInput` — the wire shape ingested by the trace pipeline.

`MutablePromptTelemetrySection` is a builder-private working type and stays in
`builder/builder.ts`, off the public surface.
