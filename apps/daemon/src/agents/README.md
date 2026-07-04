# agents

Daemon module for Open Design's agent-interaction domain: connection testing
(BYOK provider APIs and Local CLI adapters), bring-your-own-key media tools,
agent session capture and resume invalidation, and user-facing presentation of
a running agent, all over a shared SSRF asset-URL guard in `core/`.

---

## What changed (refactor history)

The module was originally a set of flat files in `apps/daemon/src/` alongside
`server.ts`, `agents.ts`, `acp.ts`, and `pi-rpc.ts`. As the surface grew the
flat layout gave no signal about dependency direction — any file could import
any other, so cross-cutting coupling could accrete silently.

The refactor used a strangler-fig pattern — **no logic changes, only structural
moves** — followed by machine enforcement:

1. Created `core/`, `connection/`, `byok/`, `session/`, and `presentation/`
   subdirectories.
2. Extracted `asset-url-guard.ts` from `connectionTest.ts` into `core/` (the
   one shared primitive both `connection/` and `byok/` depend on).
3. Moved each flat source file to the subdirectory matching its concern.
4. Fixed relative import paths broken by the moves.
5. Added `@module` docblocks to each file for LLM/reader context.
6. Added per-subdirectory barrel `index.ts` files and made the root `index.ts`
   re-export only from those subdir barrels using explicit named re-exports
   (53 names, identical to the pre-refactor public surface).
7. Registered the domain in `scripts/check-barrel-imports.ts`
   (`CAPABILITY_BARREL_DOMAINS`) with `foundation: 'core'` and
   `allowedEdges: []`.

The public API surface (`index.ts` exports) is unchanged — external consumers
see no difference.

---

## Why this shape (architecture reasoning)

**Pure star topology (`allowedEdges: []`).** Every subdir may import `core/`;
no subdir imports another. This was the natural structure: `connection/` and
`byok/` both need the SSRF guard (extracted to `core/`), but neither needs
anything the other produces. Forcing a cross-sibling edge would be a smell
indicating a shared primitive missed `core/`.

**The flat-kernel decision (acp / pi-rpc / agents.ts).** Three files were
deliberately left flat and are NOT members of the barrel:

- `acp.ts` — ACP JSON-RPC protocol adapter used by `connection-test.ts` and
  several runtime definitions.
- `pi-rpc.ts` — Pi RPC protocol adapter (same consumers).
- `agents.ts` — a re-export facade over `runtimes/*` (the agent-def registry).

Pulling them into the barrel would create a **`runtimes → agents barrel →
connection-test → agents.ts → runtimes/registry → runtimes/defs/* →
runtimes/defs/shared → acp/pi-rpc`** import cycle. Leaving them flat as shared
kernel breaks the cycle and avoids an `agents.ts` vs `agents/` naming collision
at the same level. The guard registers `allowedEdges: []` to enforce that
subdirs never reach those flat files through the barrel root; they import them
directly as daemon-level kernel.

**Machine-enforced via `scripts/check-barrel-imports.ts`.** The pure-star
topology is enforced by the guard (run by `pnpm guard`). A would-be cross-sibling
edge is a smell — relocate the shared piece to `core/` instead. Enforcement means
the topology cannot silently rot as the module grows.

---

## Import conventions

These conventions are **machine-enforced** by `scripts/check-barrel-imports.ts`
(part of `pnpm guard`); the domain's `foundation` and `allowedEdges` are declared
in that file's `CAPABILITY_BARREL_DOMAINS` registry.

- All relative imports use `.js` extensions (Node ESM).
- **`core/` is the foundation kernel.** Any subdirectory may import it directly
  (`'../core/index.js'`); `core/` itself imports no sibling.
- **There are no declared cross-sibling edges (`allowedEdges: []`).** A
  subdirectory must not import another subdirectory's barrel. If two subdirs
  need the same primitive, move it to `core/`.
- **A subdirectory must not import the domain root barrel** (`'../index.js'`);
  reach `core/` directly instead.
- **The domain root barrel uses explicit named re-exports**, never `export *` —
  the public surface must be enumerable and free of silent name collisions.
- **External daemon code imports from `'./agents/index.js'`** — never from a
  subdirectory path directly.
- **Tests are exempt, by design.** The guard scans only `src/`; files under
  `apps/daemon/tests/` may white-box import subdir internals.

---

## Known limitations & staged migration

- **`core/` membership is "imports nothing", not "a shared concern".** Today
  `core/` holds only `asset-url-guard.ts`. If a second SSRF utility is added
  that `byok/` and `connection/` both need, it belongs in `core/`; if it is
  genuinely daemon-wide (used outside the agents barrel), it should move to a
  daemon-level shared location instead.
- **`connection/` groups three distinct concerns under "connection testing":**
  provider smoke tests, Copilot stream parsing, and Claude CLI failure
  diagnostics. `connection-test.ts` (~2,500 lines) mixes proxy-agent
  construction, per-protocol wire shapes, child spawn / lifecycle, and result
  classification. It is a candidate for a later split into focused files; the
  structural pass deliberately deferred logic changes.
- **`byok/byok-tools.ts` (~1,700 lines) was left intact.** It mixes SenseAudio
  and AIHubMix tool definitions, executor functions, and polling loops. Splitting
  by provider (`senseaudio-tools.ts` / `aihubmix-tools.ts`) is a natural follow-up.
- **`allowedEdges: []` is simple today but intentional.** At five subdirs a pure
  star is the right primitive — every new edge would be a one-line reviewable
  diff. Past ~8 subdirs the pairs list can get dense; see the design-systems
  README for guidance on an optional `layers: string[][]` extension.

---

## Directory structure

```
agents/
├── index.ts              Main public barrel — 53 named re-exports, no export *
├── core/                 SSRF asset-URL guard shared by connection/ and byok/
├── connection/           Connection testing, proxy helpers, stream handlers
├── byok/                 BYOK provider media tools (image / speech / video)
├── session/              Agent session capture and resume invalidation
└── presentation/         User-facing agent label and stderr visibility filter
```

### `core/`

Foundation kernel. Imports nothing from sibling subdirectories. Every other
subdir may import it freely.

| File | What it does |
|---|---|
| `asset-url-guard.ts` | SSRF guard for upstream-controlled asset URLs: `validateBaseUrl`, `validateBaseUrlResolved` (DNS-resolving), `assertExternalAssetUrl`, `assertAndFetchExternalAsset`; types `DnsLookupAddress`, `DnsLookupFn` |

### `connection/`

Connection testing for the Settings dialog: provider (BYOK API) smoke tests and
Local CLI adapter probes. Also owns the Copilot stream parser and the Claude CLI
failure diagnostics used by those probes.

| File | What it does |
|---|---|
| `connection-test.ts` | `testProviderConnection` (BYOK API smoke test), `testAgentConnection` (Local CLI smoke test), plus shared proxy/redaction/timeout helpers: `proxyDispatcherRequestInit`, `redactSecrets`, `mergeNoProxyWithLoopbackDefaults`, `resolveConnectionTestTimeoutMs`, `isSmokeOkReply`, `createAgentSink` |
| `copilot-stream.ts` | `createCopilotStreamHandler` — translates Copilot `--output-format json` JSONL events into the UI-friendly event shape |
| `claude-diagnostics.ts` | `diagnoseClaudeCliFailure` — matches a failed Claude CLI spawn against known failure patterns and returns an actionable `ClaudeCliDiagnostic` |

### `byok/`

Bring-your-own-key provider media tools injected into BYOK chat sessions (SenseAudio
and AIHubMix image / speech / video). Routes upstream download URLs through `core/`'s
SSRF guard.

| File | What it does |
|---|---|
| `byok-tools.ts` | OpenAI-compatible tool definitions (`BYOK_SENSEAUDIO_TOOLS`, `BYOK_AIHUBMIX_TOOLS`), model allowlist constants and guards (`isSenseAudioImageModel`, `isAIHubMixImageModel`, `isAIHubMixVideoModel`, `isAIHubMixSpeechModel`), and executor functions (`executeGenerateImage`, `executeGenerateSpeech`, `executeGenerateVideo`, `executeAIHubMixGenerateImage`, `executeAIHubMixGenerateSpeech`, `executeAIHubMixGenerateVideo`) |

### `session/`

Agent session capture and resume-invalidation logic: decides whether a prior
upstream CLI session (Claude / Codex / OpenCode / AMR) can be safely resumed,
and persists or clears captured session state in the daemon DB.

| File | What it does |
|---|---|
| `agent-session-resume.ts` | `resolveAgentResumeContext`, `evaluateResumeInvalidation`, `persistCapturedAgentSession`, `hashStableInstructions`, `computeIncludeStable`; resume-failure detectors for each CLI family (`isClaudeResumeFailure`, `isCodexResumeFailure`, `isOpencodeResumeFailure`, `isAmrResumeFailure`, `isAgentResumeFailure`) |

### `presentation/`

How a running agent is surfaced to the user: the human-readable label shown in
chat status and diagnostics, and the stderr filter that decides which subprocess
lines reach persisted/user-visible surfaces.

| File | What it does |
|---|---|
| `user-facing-agent-label.ts` | `userFacingAgentLabel` — derives a safe display name from the agent id and resolved binary path, never leaking full executable paths |
| `amr-stderr-filter.ts` | `createAgentStderrVisibilityFilter` — suppresses known AMR/Vela bootstrap noise from stderr; transparent pass-through for all other agents |

---

## Types

Shared TypeScript types and interfaces are co-located with their owner file and
re-exported through the domain root barrel. There is no separate `types.ts`
because each concern's types are tightly coupled to its implementation:

- `DnsLookupAddress`, `DnsLookupFn` — `core/asset-url-guard.ts`
- `ClaudeCliDiagnosticInput`, `ClaudeCliDiagnostic` — `connection/claude-diagnostics.ts`
- `BYOKToolContext`, `ImageToolResult` — `byok/byok-tools.ts`
- `AgentResumeContext`, `CapturedAgentSessionResult`, `ResumeInvalidationReason` — `session/agent-session-resume.ts`

Types that are purely local to one file (internal helpers, private state shapes)
stay in that file and are not exported from the barrel.
