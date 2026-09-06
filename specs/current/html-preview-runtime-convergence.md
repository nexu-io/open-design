# HTML preview runtime convergence

Status: active implementation plan  
Owner surface: `apps/web` FileViewer, `apps/daemon` project raw routes, preview runtime contracts  
Initial convergence PR: #7353

## Why this plan exists

HTML preview behavior accumulated several transports and recovery mechanisms:

- daemon-backed real URLs;
- `srcDoc` for host-injected interactive bridges;
- Blob/bootstrap transport for Electron navigation stability;
- powered real URLs for Worker, WASM, WebGL, and related capabilities;
- retained/pooled iframes, `about:blank` parking, transport generations, and reload recovery.

Each mechanism solved a real incident, but the combined state machine lets view changes,
capability changes, document updates, and navigation recovery affect one another. That is
the source of repeated white screens, reload flashes, stale frames, lost relative assets,
and difficult-to-prove recovery behavior.

This plan records the intended end state so follow-up work converges on one architecture
instead of adding another transport-specific fallback.

## End-state invariants

1. One settled file version is represented by one real daemon URL document.
2. View changes and capability changes never navigate that document.
3. Only a file-version change, explicit reload, eviction, or terminal recovery may navigate.
4. Every daemon-served HTML document receives one small bootstrap through bounded-memory
   streaming injection. File size does not disable bridges.
5. Navigation policy is classified at most once per exact file version and cached by the
   daemon. Opening, activating, or switching back to an unchanged file does not rescan it.
6. The daemon is the sole source of truth for passive guard detection and sandbox profile.
   The web client must not infer whole-file properties from a source prefix.
7. Relative CSS, JavaScript, JSX, fonts, media, `srcset`, dynamic imports, and nested paths
   resolve from the real file URL/scoped preview base; they are not host-inlined.
8. Interactive capabilities are negotiated over `postMessage`; enabling or disabling Deck,
   comment, inspect, edit, draw, snapshot, or observability does not replace the iframe.
9. A same-file last-good version may cover only the short transport handoff. Exact Runtime
   readiness and host presentation-state acknowledgement promote the requested version;
   visual appearance never decides which file version is current.
10. Recovery is navigation-token scoped, bounded, observable, and cannot loop indefinitely.
11. Inactive files are retained by an explicit LRU policy, not by transport-specific parking.

## Target state machines

### Document lifecycle

```text
COLD
  -> LOADING(url, version)
  -> READY(version)

READY(version)
  -> SUSPENDED                 view/file/project becomes inactive
  -> UPDATING(nextVersion)     file contents change
  -> COLD                      LRU eviction

SUSPENDED
  -> READY(version)            activation; no navigation
  -> UPDATING(nextVersion)     file changes while retained
  -> COLD                      LRU eviction

UPDATING(nextVersion)
  -> READY(nextVersion)        exact Runtime + DOM + presentation state; atomic swap
  -> FAILED(nextVersion)       bounded recovery exhausted; stop exposing previousVersion

FAILED(nextVersion)
  -> LOADING                   explicit retry or a newer file version
```

The previous browsing context may remain parked inside the bounded LRU while recovery is
possible, but it is hidden, removed from keyboard navigation, and cannot receive product
commands. Keeping it in memory is an implementation optimization, not permission to show
stale output as if it were the requested file version.

`Preview` to `Code`, file-tab changes, and project-tab changes only move between
`READY` and `SUSPENDED`. They must not set the document URL to `about:blank`.
Suspension may move a retained iframe between visible and parked hosts only with
the browser's state-preserving `Element.moveBefore()` operation. Reparenting an
already-loaded iframe with `appendChild()` destroys its browsing context in
Chromium, starts another document request, and loses authored JS, scroll, and
Deck state even though the DOM node itself is reused. First attachment may use
`appendChild()`; an older browser without `moveBefore()` receives the previous
best-effort behavior and must never become the packaged Electron baseline.

### Capability lifecycle

```text
BOOTSTRAP_CONNECTING
  -> CONNECTED
  -> CONNECTED { deck, comment, inspect, edit, draw, snapshot, observability }
```

Capability sets are idempotent host messages. The iframe bootstrap installs or activates
the requested modules in its own DOM environment and acknowledges the resulting set.
Capability transitions are independent of the document lifecycle.

### Retention lifecycle

Each preview session is keyed by `(workspace, project, file)` and has one of:

- `ACTIVE`: visible and interactive;
- `SUSPENDED`: mounted, hidden, and immediately reusable;
- `EVICTED`: unmounted because the LRU budget was exceeded.

Temporary standby frames used for version replacement do not count as durable sessions and
must be retired immediately after the swap or failed attempt.

## Preview policy and server response model

Do not conflate navigation-policy classification with response-time streaming injection.
They have different timing and caching requirements.

### Per-version navigation policy

Some behavior must be known before an iframe navigation begins: powered previews need their
origin, response headers, and sandbox profile before author code executes, while storage,
focus, and redirect protection must be installed before startup scripts can trigger the
behavior being guarded. The daemon therefore classifies each exact file version at most once
and caches a small policy record:

```ts
interface PreviewPolicy {
  documentVersion: string;
  sandboxProfile: 'normal' | 'powered';
  guards: {
    storage: boolean;
    focus: boolean;
    redirect: boolean;
  };
}
```

Newly written files should be classified in the background when their version lands. Old
files may pay one first-open classification. Requests for the same version share one
in-flight classification, and only a file-version change invalidates the cached policy.
Deck, Tweaks, comment, inspect, edit, draw, snapshot, and observability are runtime
capabilities, not navigation policy, and must not appear in this classifier.

### Response-time streaming processing

After policy is available, the daemon begins the real document response. It scans only far
enough to find a parser-safe insertion point, emits the universal bootstrap before authored
startup code, and continues piping the source. If resource normalization remains necessary,
it is fused with that stream rather than implemented as another read-to-EOF pass.

The preferred final resource model is a project-scoped preview origin whose `/` maps to the
authorized project root. That lets `./support.js`, `../img/a.png`, `/assets/app.css`, external
CSS `url(...)`, modules, fonts, and media resolve through normal browser URL semantics without
host inlining or executable-source rewriting. The exact origin shape must work in browser
development and packaged Electron and preserve normal versus powered isolation.

The browser loads all authored subresources normally. The daemon must not buffer the whole
document or inline project assets merely to install a bridge. The current 96 KiB routing
prefix is not a correctness boundary in this model and should be removed once the universal
runtime owns every capability.

## Universal runtime protocol

The host and iframe use a versioned, document-fenced handshake. Every message carries a
`sessionId` and `documentVersion`, so a retained, hidden, standby, evicted, or previous-version
frame cannot affect the active preview.

```text
iframe -> host: od:preview:hello
  { protocolVersion, sessionId, documentVersion, availableCapabilities }

host -> iframe: od:preview:set-capabilities
  { protocolVersion, sessionId, documentVersion, enabledCapabilities }

iframe -> host: od:preview:capabilities-applied
iframe -> host: od:preview:ready
host -> iframe: od:preview:presentation-state-barrier
iframe -> host: od:preview:presentation-state-applied
```

The bootstrap discovers and installs Deck, comment, inspect, edit, draw, snapshot,
observability, palette, and Tweaks modules inside the one real-URL document. Capability
changes are idempotent and never navigate the iframe.

## Migration phases

### Phase 1 — large-file real URL and passive guards

Initial PR: #7353.

- Stream bridge/bootstrap injection for HTML above the former buffering limit.
- Preserve range, HEAD, scoped preview-base, and authorization behavior.
- Keep relative external CSS/JS/JSX on real URLs.
- Make daemon scan results authoritative for powered mode and passive guards, including
  signals after the web routing prefix.
- Retain existing interactive `srcDoc` behavior until equivalent URL capabilities exist.

Exit gate: packaged Electron tests cover small and >2 MiB HTML, late guard signals,
`support.js`, many relative JSX files, relative CSS/media, file-tab/view/project switching,
and no unbounded recovery.

### Phase 2 — policy index, scoped origin, and universal URL bootstrap

- Introduce a per-file-version PreviewPolicy cache with in-flight deduplication and exact
  invalidation on file changes.
- Prove a project-scoped normal/powered preview origin in browser development and packaged
  Electron, including Team authorization, expiry, root-relative assets, and cross-project
  denial.
- Define a versioned bootstrap handshake and capability-set contract in
  `packages/contracts`.
- Move Deck, comment/selection, inspect, edit, palette/tweaks, draw, snapshot, and
  observability activation into the URL-loaded document.
- Run DOM annotation and bridge installation inside the iframe; the daemon does not need a
  full DOM parser for those capabilities.
- Keep source patching, authorization, persistence, and history in the host/daemon.

Exit gate: every existing interactive behavior has red/green parity tests against its
current product behavior, including slide sidebar retention and edit-without-reload.

### Phase 3 — PreviewSession and atomic version replacement

- Introduce a session owner keyed by `(workspace, project, file)`.
- Make Preview/Code and tab switches visibility-only operations.
- Introduce an explicit LRU budget for suspended sessions.
- Load changed versions in a temporary standby frame and swap after exact Runtime ready plus
  presentation-state acknowledgement. During that bounded handoff the previous version may
  remain visible; if recovery is exhausted, replace it with an explicit unavailable/retry
  state instead of leaving stale output interactive. Authored blank/error output is still the
  current version once the exact Runtime handshake completes.
- Scope failure/retry state to a navigation token and cap retries.

Exit gate: high-frequency switches, edits during inactivity, project switching, and agent
file rewrites preserve the latest version without flashes, stale content, scroll loss, or
toolbar churn.

### Phase 4 — remove legacy transports

- Remove Blob/bootstrap main-preview transport.
- Remove `srcDoc` as a settled-file preview transport.
- Remove transport activation generations and `about:blank` parking.
- Remove web-side whole-file guard heuristics and asset-inlining/rewrite pipelines that only
  exist for Blob/srcDoc.
- Remove the 96 KiB routing prefix as a correctness input. If a prefix read remains, it may
  only power non-critical metadata or UX hints.
- Remove per-generation reload latches and transport-specific white-screen recovery branches.
- Update `docs/architecture.md` only after the old path is deleted and the new invariants are
  enforced by tests.

## Required regression matrix

Every phase must keep focused unit/integration tests and packaged Electron coverage for:

- first project open; project switch away/back; personal and team projects;
- Preview/Code switching and rapid file-tab switching;
- small HTML and large HTML well beyond 2 MiB;
- relative and nested CSS, JavaScript, modules, JSX/Babel, fonts, images, `srcset`, media,
  dynamic imports, and `support.js`;
- Deck sidebar/direct-page navigation, notes, keyboard controls, and cover sizing;
- comment selection, inspect, draw, snapshot/export, palette/tweaks, and manual editing;
- edit persistence, agent rewrites, file-watch bursts, undo/redo, and scroll preservation;
- powered Worker/WASM/WebGL previews;
- focus, storage, redirects, malformed tags, authored `<base>`, CSP, and sandbox behavior;
- slow subresources, aborted/stale navigation, retries, LRU eviction, and process restart;
- diagnostics and PostHog signals without artifact source or DOM text.

## Non-goals and rollout rules

- Do not turn every passive guard on globally; focus and redirect guards intentionally alter
  authored behavior and must follow daemon policy.
- Do not combine Phase 2 or Phase 3 with an unrelated user-facing feature.
- Do not delete an old transport until every capability it owns has parity coverage on the
  URL path.
- Do not treat browser-only tests as sufficient. Each migration phase requires a packaged
  Electron build installed and exercised with real multi-file artifacts.
- Do not add another transport fallback to fix an isolated incident. If a failure cannot be
  represented in these state machines, update this plan before implementing it.
