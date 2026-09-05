# HTML preview runtime convergence — implementation handoff

> Local handoff only. Do not commit or push this file unless the user explicitly
> asks for it later.

Status: main document converged; three srcdoc surfaces still unmigrated; observability, packaged matrix and PR merge remain  
Date: 2026-09-02  
Worktree: `/Users/elian/Documents/open-design-worktrees/streaming-html-preview-bridge`  
Branch: `fix/streaming-html-preview-bridge`  
PR: [#7353](https://github.com/nexu-io/open-design/pull/7353)  
Current recorded HEAD: `2e717e0cda fix(preview): initialize prewarm snapshots lazily` (== PR head, worktree clean)

### 2026-09-02 takeover checkpoint — verified ground truth

This checkpoint was produced by re-measuring the branch, not by reading the
sections below. Where it disagrees with any earlier checkpoint, this one wins.

Verified by running the suite and reading the bindings on `2e717e0cda`:

- **The legacy FileViewer suite migration is DONE.** The full `@open-design/web`
  suite is green: 686 files, 7153 passed, 1 expected fail, 11 skipped, 287s.
  The earlier "monolithic FileViewer suite still contains legacy srcdoc/Blob
  expectations, do not push" note described `fbc2a8affa`; 24 commits have landed
  and been pushed since, and the branch is in sync with the PR head.
- **Remaining item 2 was mis-scoped as cleanup. It is not.** The main document
  transport did converge — `artifact-preview-transport-stack` routes through
  `previewRuntimeNavigation` on the real URL. But `srcDoc` is still a LIVE
  transport on three product surfaces that never had a url-load branch at all:

  | Site | Surface | srcdoc condition | url-load branch |
  |---|---|---|---|
  | `FileViewer.tsx:4015` | artifact version-history panel preview | `srcDoc ?` | none |
  | `FileViewer.tsx:7194` | React module/component preview | `mode === 'preview'` | none |
  | `FileViewer.tsx:18140` | in-tab fullscreen presentation | `effectiveDeck` | only for non-deck |
  | `FileViewer.tsx:17725` | redirect-loop blocked notice | `redirectLoopBlocked` | n/a — local `sandbox=""` error page, correctly stays srcdoc |

  `useUrlLoadPreview` is `mode === 'preview'`, and presentation is only entered
  from preview, so `effectiveDeck || !useUrlLoadPreview` reduces to
  `effectiveDeck`: **Deck/PPT presents over srcdoc, plain HTML presents over the
  real URL.** `presentationSrcDoc` calls `buildSrcdoc(deckVisualSource, ...)`
  and carries only `initialSlideIndex` across, so entering presentation mints a
  new document and drops the JS heap, Canvas/WebGL contexts, timers, closures
  and authored interaction state.

  That is pain point 1 from the Dev Design reproduced verbatim, with the entry
  point moved from "enter edit mode" to "enter fullscreen presentation". PPT is
  explicitly inside the stated refactor scope. The whole suite stays green
  because each of these surfaces still ships its own srcdoc tests.

  Do not read "delete the legacy implementation" as a deletion task. The
  `buildSrcdoc` pipeline cannot be removed until these three surfaces are
  migrated, because they are its only remaining real consumers.

**User decision 2026-09-02: migrate all three surfaces.** Version-history
preview, React module preview and Deck presentation all move onto the real-URL
runtime; only then does the `buildSrcdoc` pipeline get deleted. Lead each
surface with a red spec proving the current state loss before wiring it to the
runtime.

**New scope added 2026-09-02: preview observability.** Dev Design section 6
specifies eight phases (navigation start, bootstrap handshake, capability
applied, first visible paint, version promotion, last-good retention, recovery
attempt, cache eviction) and six headline metrics (cold-open visible time, warm
switch recovered within 100 ms, non-content-update navigation ratio with target
0, promotion success rate, last-good retention rate, recovery exhaustion rate),
under a hard privacy boundary: no HTML, DOM text, screenshots, file paths,
resource URLs or project titles reach PostHog. None of this is implemented —
the branch ships `preview_white_screen`, `preview_resource_error`,
`preview_runtime_error` and friends, but no phase timing at all. The deliverable
is those events plus a dashboard covering preview health and quality.

Note that first-visible-paint stays a **reported phase** even though it was
removed as a promotion gate; and "promotion success rate" must be redefined
against the current gate (exact runtime identity, capability acknowledgement,
DOM readiness, presentation-state acknowledgement).

Four places where the Feishu Dev Design still disagrees with the branch and must
be edited once the code settles:

1. Target design still shows `promoteAfterVisiblePaint()`.
2. It promises a version-level rollback switch; the code has a hardcoded
   `previewRuntimeConvergenceActive = true`.
3. Preview Lab progress says 54 tests / 1,000 real samples pending credentials;
   it is 89 tests / 500 real samples calibrated.
4. Section 6.3 states the implementation baseline is latest `main` with staged
   feature flags, and that **experimental branches are for reproduction and test
   extraction only, not the final merge branch** — yet #7353 is that branch and
   is now 131 files, +23,547 / −13,059. Raise before merging.


### 2026-09-02 scope: what "converge srcdoc thoroughly" actually covers

Surveyed every `buildSrcdoc` consumer in `apps/web/src`, not just the ones
inside `FileViewer.tsx`. The scope is five surfaces, not three.

**In scope — these carry the document the user is looking at, and must move to
the one real URL:**

| Site | Surface | State |
|---|---|---|
| `FileViewer.tsx:18140` | Deck fullscreen presentation | red spec landed, see below |
| `FileViewer.tsx:4015` | artifact version-history panel preview | to do |
| `FileViewer.tsx:7194` | React module/component preview | to do |
| `PreviewModal.tsx:454` | preview modal | to do |
| `FileWorkspace.tsx:7552` | design-system file preview | to do — and still performs whole-page relative-asset inlining, the exact mechanism the Dev Design retires |

**Out of scope — srcdoc is the correct transport here and must stay:**
`DeckThumbnailRail` (per-slide thumbnails), `DesignFilesPanel` (HTML page
thumbnails), `DesignKitView` (`kit.showcaseHtml` cards), `ExamplesTab` (example
cards), `runtime/exports.ts` (offscreen PPTX/PDF/image export rendering).
Rewriting these onto real URLs would be a regression: a thumbnail rail would
issue a dozen real navigations per screen.

So "thorough" is not "delete every srcdoc". State it as an invariant that can be
guarded instead:

> **srcdoc may only carry offscreen renders and thumbnails. The document the
> user is looking at always stays on its one real URL.**

Land that as a guard test once the five surfaces are migrated, so a future
preview surface cannot quietly reintroduce a second transport.

### Red spec landed 2026-09-02

`apps/web/tests/components/FileViewer.deck-present-runtime-convergence.test.tsx`

Corrected after building the probe properly: **presentation is broken for plain
HTML too, not only for decks.** A first attempt asserted only on the transport
marker and reported plain HTML as healthy. It is not. `.present-overlay` is
portaled to `<body>` as a fixed full-window layer while the `.viewer` beneath
stays mounted, and the overlay renders its OWN `<iframe>`. So the running
document survives underneath and a second one is created on top:

- deck -> `srcDoc={presentationSrcDoc}`, i.e. `buildSrcdoc(deckVisualSource, ...)`
  rebuilt from source, carrying only `initialSlideIndex`
- plain HTML -> `src={activePreviewSrcUrl}`, better but still a fresh navigation
  in a fresh element, marked `url-load` rather than the runtime's `runtime-url`

Either way the JS heap, Canvas/WebGL contexts, timers and closures are dropped.

The spec now asserts the real contract — the overlay frame must BE the live
runtime frame — against three inputs:

- control: the live document resolves and is `runtime-url` — **passes**, so the
  probe is proven able to see the defect
- plain HTML presentation — **red**
- deck presentation — **red**

Note how the first attempt failed: the whole file went red including the
control, because the test never installed
`installFileViewerPreviewRuntimeHarness()` and the selector matched nothing.
That harness also renames `preview-runtime-frame-current` to the legacy
`artifact-preview-frame`, so tests must select the latter. Without the control
case this would have been reported as "two surfaces broken" on the strength of
a selector that never matched anything.

The fix is not to point the overlay at the real URL. It is to relocate the live
frame with the pool's existing `moveIframeElement` / `Element.moveBefore()`
path, and move it back on exit — the same mechanism already validated on
Electron 41 / Chrome 146. Deck presentation chrome (hidden deck UI, click
navigation, initial slide) becomes a capability applied to the existing runtime,
not a second transport.

### SDK extraction — the boundary already exists, half of it is already drawn

`@open-design/preview-runtime` (v0.20.3, private) exists and currently exports
only the **injected** side: `srcdoc`, `manual-edit`, `manual-edit-source`,
`font-stylesheet`. The **host** side named in the Dev Design module diagram —
`PreviewSession`, `PreviewSessionFrames`, `PreviewRuntimeTransport`,
`RetentionPool`, `HtmlPreviewPolicyIndex` — is still inside
`apps/web/src/components`, entangled with a 20,243-line `FileViewer.tsx`.

Ordering constraint: extracting the SDK before convergence completes would
package all three transports and ship them to other applications. After
convergence the extraction is close to a move, because converging these surfaces
is itself the act of lifting those modules out of `FileViewer`. Treat the SDK as
a consequence of finishing this work, not as separate project.

### 2026-09-01 recovery checkpoint and remaining work

The authoritative product branch is clean apart from this deliberately
untracked handoff. It is ahead of the last published PR head; do not push until
the FileViewer migration and final packaged matrix are green. Product entry
points already opt into the retained real-URL runtime. The focused Runtime,
daemon, desktop, typecheck, guard, and real relative-resource Playwright suites
pass; the monolithic FileViewer suite still contains legacy srcdoc/Blob
expectations that must be migrated before the branch is safe to push.

Positive-paint has been removed from Runtime promotion. Exact Runtime identity,
capability acknowledgement, DOM readiness, and presentation-state
acknowledgement are the correctness gate; visual blank/paint is observability
only. Exhausted replacement recovery now shows an explicit unavailable/retry
state instead of keeping stale content interactive. Cross-project switches no
longer evict the previous project's pooled Runtime; the bounded global LRU owns
ordinary suspension while explicit invalidation/deletion owns hard eviction.
Parking and restoring a connected iframe now uses `Element.moveBefore()` rather
than `appendChild()`. Electron 41 / Chrome 146 validation proved the difference:
`appendChild()` issued a second request and replaced `contentWindow`, while
`moveBefore()` retained the exact request count, load count, window instance,
and authored state. Home navigation no longer hard-evicts an otherwise valid
Runtime.

Preview Lab confirms Preview/Code and file-tab round trips at zero navigation
and zero blank interval. Project A -> Home -> B -> Home -> A also retains the
exact frame, window, session, document version, and authored state with zero
document request/load, but the target preview is not visible for 191–235 ms
after its search item is selected. The 100 ms warm-blank gate remains red. Do
not widen it or immediately reveal potentially stale output; first distinguish
normal project-shell loading from an avoidable retained-frame opacity delay.

Sections dated before this 2026-09-01 checkpoint are implementation history.
Where they mention visible-paint promotion, retaining stale output after a
failed replacement, or `appendChild()` reattachment, this checkpoint and the
tracked convergence design supersede them.

The remaining work is ordered by correctness dependency:

1. **Migrate the legacy FileViewer suite.** The product now uses the exact
   Runtime identity, capability acknowledgement, DOM readiness, and
   presentation-state acknowledgement as its promotion gate. Visual paint is
   observability only: authored blank or broken output must become current and
   must never be hidden behind a prior good version. Replace obsolete
   artifact-preview-frame/srcdoc/Blob assertions without skipping product
   behavior tests.
2. **Legacy implementation deletion.** Remove the settled-file srcdoc/Blob bootstrap,
   `about:blank` parking, URL-versus-srcdoc transport selection, generation and
   activation probes, reload recovery latches, dual iframe stack, and the
   asset-inlining/rewrite pipeline that exists only for that transport. Preserve
   rolling compatibility with an older daemon without reintroducing a second
   product document runtime.
3. **Full behavior parity.** Re-run focused red/green coverage for Deck direct
   navigation/sidebar/notes/shortcuts, manual edit/save/re-entry/scroll,
   comment/inspect/draw/snapshot, relative resources, Powered Preview, Team
   authorization, agent/external file updates, standby failure, LRU eviction,
   and high-frequency Preview/Code/file/project switching.
4. **Exact packaged Electron acceptance.** Build and install the exact final
   head, remove/replace obsolete build output, and run the Dev Design matrix.
   Required evidence includes no user-visible blank interval, no UI-only
   navigation, atomic version replacement with explicit failure, stable warm
   switching, correct capability state, and privacy-safe diagnostics.
5. **PR closure.** Reply to and resolve the review threads with the fixing
   commits, push only after local validation, re-request the engaged
   reviewer, then drive CI/review/merge queue until #7353 merges.
6. **Preview Lab release assurance.** PR #1 is green and mergeable but still
   requires a non-author approval. Continue full-catalog date-seeded rotation,
   then add the L2 FileViewer adapter and L3 installed-build baseline-versus-
   candidate lane. Do not describe L0/L1 corpus results as product-runtime
   proof, and do not enable a release blocker before the lane is complete and
   privacy-reviewed.

Two isolated agents are assigned to (1)/(2) and (6). The root agent owns
integration, architecture review, the packaged Electron matrix, and PR merge.

### 2026-08-30 product-default and cold-handoff checkpoint

The terminal real-URL runtime is now enabled explicitly at both real product
entry points (`ProjectView` and `DesignSystemFlow`) without a build-time feature
environment variable. `FileWorkspace` keeps its default-off legacy path only
as a temporary comparator for focused tests and Phase 4 deletion. Red/green
caller contract tests prevent either product entry from silently falling back.

The bounded three-viewer LRU now understands versioned terminal keep-alive
keys. Its red test parked `project\0index.html\0scope\0v1`, attempted logical
`index.html` eviction, and observed the iframe survive; the green implementation
parses the logical file segment separately from runtime identity. A production
Electron run then opened four HTML files and confirmed exactly three main
preview iframes remained, with the evicted file absent from both the workspace
and global pool.

That packaged run exposed the last cross-file blank interval: reopening an
evicted file hid the previous viewer before the new scoped document promoted.
The resulting state model now separates:

- **active** — the logical file allowed to receive bridge traffic, shortcuts,
  edit/comment/Deck state, focus, and user input;
- **presented** — the one last-good viewer/iframe allowed to remain painted.

During a cold revisit, the previous viewer is presented but inert and inactive;
the target loads as an active-but-unpresented transparent standby. Exact fenced
`visible-paint` promotion swaps both the outer viewer and iframe presentation
in one React commit. A red/green four-file test locks the outer surface,
toolbar, inertness, and inner iframe `data-od-active` state before and after the
handoff. Legacy comparator behavior is explicitly excluded from this path.

Fresh no-environment-variable production DMG validation of exact HEAD ran in
namespace `preview-terminal-cold-handoff-presented`:

- cold `deck.html -> index.html` rematerialization promoted at about 112 ms;
  19 samples at 4 ms cadence always found exactly one visible iframe and one
  presented viewer, with no loading cover or blank/double-painted sample;
- 20 warmed `plain.html <-> index.html` switches took 18–31 ms, all with
  `bad=[]` and the same three bounded iframe nodes/URLs;
- Preview -> Code -> Preview retained the exact iframe node and scoped URL;
- daemon-authoritative Deck, a 2.30 MiB HTML document, relative CSS/SVG, and an
  external relative `support.js` all rendered in packaged Electron;
- logs contained no `ERR_ABORTED`, `about:srcdoc`, preview timeout, Bad Request,
  or uncaught/unhandled error. Startup-only inspect socket and Chromium cache
  warnings were unrelated to preview navigation.

Final validation at this checkpoint: 685 Web test files passed, 7,239 tests
passed, one expected failure and 11 skips; `pnpm guard`, Web typecheck, all 95
FileWorkspace tests, and all 17 PreviewSessionFrames/PreviewRuntimeTransport
tests passed. The installed validation client is intentionally left running;
its screenshot is `/private/tmp/preview-terminal-cold-handoff-presented.png`.

### 2026-08-30 daemon-policy fast path checkpoint

The converged FileViewer no longer waits for the Web client's source-text
request or 96 KiB routing sample before minting the real preview navigation.
The daemon's exact per-version policy now also carries Deck classification;
the Web uses source heuristics only as rolling-upgrade fallback for an older
daemon. A red FileViewer test holds the source request unresolved and proves
the real URL transport still mounts.

A fresh production DMG was built, installed, and exercised under the isolated
`preview-policy-fastpath` namespace. Packaged Electron passed:

- relative CSS, SVG, and external `support.js` in one multi-file artifact;
- 43 relative external `text/babel` JSX files on the Powered scoped origin;
- a 2.30 MiB HTML artifact, visible without a host loading cover;
- daemon-authoritative Deck detection and direct page 1 to page 5 state update
  in 14 ms;
- 20 sequential switches across five HTML tabs while retaining exactly one
  stable iframe DOM node and URL per file; after first load, observed switches
  were 54–146 ms;
- ten Preview/Code round trips without replacing the iframe or changing it to
  `about:blank`.

The 43-JSX artifact's first activation took about 3.1 s because its authored
HTML loaded Babel from the public unpkg CDN. Subsequent activations reused the
same iframe and took about 66 ms. This is authored network startup, not a host
source-scan wait.

The source-text dependency was also blocked deliberately in the packaged app:
`/text-preview/slow-large.html` remained unresolved while the real URL iframe
became active in 678 ms with no host loading cover. An active-file overwrite
was sampled every 4 ms; the old revision remained visible until the new scope
promoted at 746 ms, with `zeroVisible = 0` and `multipleVisible = 0`.

The next checkpoint prewarms the exact versioned daemon policy immediately
after successful JSON or multipart HTML writes. The background request shares
the same in-flight/LRU entry as foreground navigation, does not delay the write
response, swallows background failure, and leaves the failed entry retryable.
Red/green policy-index coverage locks both non-blocking behavior and retry after
failure. A rebuilt and reinstalled packaged Electron app then passed a 2.30 MiB
active-file update: the write returned in 26 ms, the replacement atomically
promoted after 631 ms, and 161 four-millisecond samples observed no interval
without exactly one active visible frame. The resulting document rendered its
relative stylesheet, SVG, and external `support.js` correctly.

Agent and external-editor writes now enter the same fast path. Chokidar reports
the stable absolute file path plus exact size/mtime identity to its internal
subscriber before the public SSE event is sent. The production server shares
one policy index between the file-event route and all preview routes, so the
scan started by a direct filesystem change is the same in-flight/cache entry a
subsequent navigation consumes. Non-HTML and unlink events do not scan; watcher
adapters that omit stats retain a contained resolver fallback. The watcher
identity test was observed red before implementation and green afterward.
A newly rebuilt/reinstalled production DMG then received a direct filesystem
mtime change to the active 2.30 MiB HTML file (no HTTP write path). The scoped
URL changed and atomically promoted after 933 ms; 226 four-millisecond samples
reported `zeroActive = 0` and `multiActive = 0`, confirming that the watcher
path both reaches live refresh and preserves the last-good frame throughout.

Scope acquisition and document-policy mapping are now separate React layers.
A fallback-policy change no longer requests another scope or restarts its
renewal lifecycle; red/green hook coverage observed the prior 1 -> 2 mint
regression. New daemons with an exact `previewPolicy` navigate and paint the
real URL before Web starts a non-critical source-text read. Old daemons without
that field fail closed until local source classification is ready, so a
Powered/Babel document cannot first execute under the normal profile. Exact
daemon Deck policy also forces the later full-source path required by the
thumbnail rail and speaker notes.

Packaged validation of the first version exposed a second redundancy: one
unchanged 2.30 MiB file could receive several global file-list refresh
generations and mint three byte-identical scopes. The terminal revision key now
matches the daemon document identity (`size:mtime`) plus explicit user Reload,
rather than including the catalog/SSE reconciliation counter. Its red test
observed three preview-url requests and the green test one; real mtime/size
changes still stage and atomically promote a replacement. The complete Web
FileViewer/session/frame/transport set is green at 346 tests.

The terminal path no longer performs the legacy 96 KiB routing-preview read
after the real iframe becomes visible. A new daemon's exact whole-document
policy remains the only navigation classifier; after first paint FileViewer
hydrates host-owned Code/export/edit/Deck tooling from one full-source read.
This avoids the former sample-then-full double read and removes the 96 KiB
state from the terminal decision graph. The bounded sample remains only for
the default legacy transport and an old-daemon rolling fallback. Red/green
FileViewer coverage proves a 3 MiB passive artifact paints first, never calls
`/text-preview`, reads `/raw` exactly once, and reuses those bytes when the
user switches to Code. The related Web runtime set is green at 365 tests.

### 2026-08-29 impact review: PR #7592

At `0ac1466fcc`, PR #7592 is open, mergeable, CI-green, and awaiting review. It
is a release-oriented repair of the existing URL/srcDoc dual-iframe
handoff. It directly overlaps the legacy `FileViewer`, srcDoc runtime, daemon
URL-selection bridge, preview CSS, and their tests. It does not supersede the
single-real-URL convergence architecture, and it still leaves URL bridge
injection disabled for HTML above `PREVIEW_URL_GUARD_MAX_HTML_BYTES` (2 MiB).
This branch already includes current `main` at `df84ae5b9e`, does not depend on
#7592, and should not absorb its document-cloning/handoff/remount model.

Absorb these results after #7592 settles:

- keep a newly loading standby iframe layout- and paint-eligible with
  `opacity: 0`, `pointer-events: none`, and explicit stacking instead of
  `visibility: hidden`; this should remove the need to recover a compositor
  surface only after promotion;
- retain the no-op SSE-ready file reconciliation rule: an unchanged file
  snapshot must not bump the preview generation or navigate the iframe;
- reuse its real-artifact corpus/auditor machinery, but change the terminal
  oracle from URL-vs-srcDoc screenshot parity to legacy-vs-terminal behavior
  and interaction parity;
- retain the fragment/quirks, empty-target, runtime-rendered edit, and file
  navigation fixtures as migration acceptance coverage.

Do not carry these mechanisms into the terminal runtime:

- frozen `body.innerHTML` cloning from URL to srcDoc;
- URL/srcDoc handoff visibility latches and restore acknowledgements;
- remounting the Blob/srcDoc shell to obtain a fresh JavaScript realm.

Those mechanisms are necessarily lossy for node-bound event listeners,
Canvas/WebGL pixels, JavaScript closures, and large dynamic bodies. Even though
the current CI run is green, that validates the tactical legacy repair rather
than making dual-document cloning a safe terminal model. Keep corrected #7592
behavior isolated to the legacy comparator until that stack is deleted.

### Convergence work after the original PR head

The branch now contains reviewable Phase 2 checkpoints:

- versioned Preview Runtime wire contract and document fencing;
- one per-file-version PreviewPolicy cache with in-flight dedup and settled LRU;
- full-file powered/passive policy classification shared by `text-preview` and
  real navigation, removing one duplicate scan;
- project-scoped origins `n-<scope>.localhost` and `p-<scope>.localhost` whose
  `/` maps to the authorized project root;
- strict host/port parsing, scoped-origin API denial, normal versus Powered
  response profiles, Team workspace authority recovery, and unknown-scope 404;
- optional `ProjectPreviewUrlResponse.scopedOrigin` fields for rolling-upgrade
  compatibility while old clients continue using the legacy `url` field;
- a universal runtime bootstrap that emits versioned hello, ready, and
  visible-paint events and fences capability commands by session and document
  version;
- migrated scroll/measurement, selection, snapshot, observability, Tweaks,
  palette, and Deck modules;
- a shared `@open-design/preview-runtime` package that owns the exact existing
  manual-edit and srcdoc/Deck bridge builders rather than maintaining daemon
  copies;
- full-file, bounded-memory Deck source facts, including cross-chunk inline
  message/keyboard/hash navigation, real `deck-stage` markup, framework marker,
  and stage-fallback requirements;
- an explicitly requested `odPreviewRuntime=deck` path on the isolated scoped
  origin for both buffered and >2 MiB streamed HTML. FileViewer still does not
  select it;
- streamed manual-edit source identities and the exact shared edit runtime for
  both buffered and >2 MiB documents, while retaining byte ranges for assets
  and untransformed files;
- a pure Web `PreviewSession` state machine that keeps the last-good document,
  stages one standby, promotes only an exactly fenced visible-paint signal,
  discards failed replacements without disturbing current content, negotiates
  capabilities across current and standby, and suspends without URL mutation;
- an exact runtime `probe` handshake so an already-loaded LRU iframe can
  re-announce hello/ready/paint after its React host remounts, without a new
  navigation;
- an isolated retained-frame adapter with explicit cross-origin target-to-frame
  mapping, per-project/file session reset, versioned pool keys, transparent and
  inert paintable standby, last-good promotion, stale-version eviction, and
  visibility-only suspension;
- promotion gated on both exact capability acknowledgement and visible paint,
  including explicit empty-capability commands and rejection of stale applied
  state when the desired interaction mode changes during standby loading;
- a pure FileViewer-state-to-runtime-capability mapping which preserves the
  existing dormant selection/edit/Tweaks contract and only enables interactive
  modes when the matching viewer state is active;
- an authorization- and revision-fenced scoped-navigation cache with concurrent
  request deduplication, settled LRU, in-place near-expiry renewal, replacement
  minting only after renewal failure, expired-mint rejection, and epoch fencing
  so `clear()` cannot be undone by a stale async completion;
- a deterministic scoped-navigation mapper which keeps interactive modes out of
  the URL and selects only normal/powered policy, passive guards, and Deck;
- a React navigation hook which retains last-good during same-file revision
  replacement, fails closed across project/file/authorization changes, renews
  scopes without navigation, and retries transient renewal failures while the
  visible document remains mounted;
- pooled iframe ref changes no longer park and reattach the DOM node. Stable
  React keys preserve the same frame during standby-to-current promotion, and
  the adapter now reports exact per-frame capability acknowledgements for safe
  legacy mode replay;
- legacy comment/edit/live-style/inspect/observability replay now goes through
  one target-explicit pure helper. Existing transports preserve their exact
  unconditional message order, while the converged runtime can fence payloads
  to the capabilities acknowledged by that specific document;
- an isolated terminal transport now composes viewer capability derivation,
  exact per-frame acknowledgement, retained-frame lifecycle, and mode replay.
  Focused tests prove comment-mode changes, edit enablement/live styles, and
  suspension do not change the real URL or replace the browsing context;
- capability-fenced promotion also restores host-owned active comment target,
  unsaved Inspect overrides, and the exact cached Deck slide on a replacement
  document before it becomes current;
- FileViewer has an internal convergence switch that routes a fully classified,
  settled document through the retained real-URL transport. Both real product
  entries now opt in explicitly; the default-off legacy comparator remains only
  for focused regression comparison and later deletion;
- the harness does not mint from stale retained source classification or from
  in-memory agent/edit HTML. When minting pauses for the same owner, it retains
  the already verified document instead of showing a loader or stale disk
  bytes;
- FileViewer-level coverage now proves exact capability acknowledgement and
  visible-paint promotion, then opens Comment mode without changing the frame
  node or URL. The same test proves an in-memory streaming update neither
  mints another scope nor removes the last-good frame.
- FileViewer-level parity now also covers screenshot-to-chat, Preview/Code and
  workspace suspension, Comment target source fencing, manual text and live
  style persistence, edit exit/re-entry, Draw capability activation, Team
  authority gating, bounded ERR_ABORTED standby replacement, redirect-loop
  terminal eviction/reload, and same-version liveHtml retention without
  changing the current frame URL.
- The retained-frame pool now exposes exact-frame eviction for terminal
  failures. Redirect-loop signals are accepted only from the active runtime
  frame; recovery creates a fresh browsing context at the same real URL.
- Session/pool tests prove project/file switch-away-and-back reuses the exact
  browsing context after a fresh fenced handshake, while the LRU evicts only
  the least-recently-used suspended frame at the configured retention limit.
- Initial scoped-navigation mint failures now leave the loading state, present
  a localized explicit-retry surface, and recover without inventing another
  transport. Renewal failures still retain and expose the last-good document.
- `preview-url` now carries the daemon's cached per-version navigation policy;
  new clients prefer that authority for normal/powered origin and passive
  guards while retaining host classification only as an old-daemon fallback.
- The selected sandbox profile is part of each session document. During a
  normal-to-powered (or reverse) version replacement, last-good and standby
  frames keep their own exact sandbox/allow attributes until atomic promotion.
- A mounted, active standby now has a five-second runtime-handshake deadline.
  Initial attempts show the localized first-load cover and end in an explicit
  retry state instead of permanent white/loading; retry replaces only the
  browsing context at the same scoped URL. Replacement timeouts evict only the
  failed standby and leave last-good visible. Suspended previews do not spend
  the deadline.
- FileWorkspace threads the terminal harness through an explicit prop. Product
  entry points pass it unconditionally, with no build-time environment gate;
  its integration tests prove repeated file-tab switching preserves exact
  iframe nodes, URLs, scopes, and mint counts without `about:blank`.
- Cached scoped documents can complete before React's passive host message
  listener attaches. `PreviewSession.probe()` now repeats the idempotent exact
  lifecycle handshake after the receive path is live, closing that race
  without navigating or replacing the retained frame.
- The universal bootstrap captures native animation/timer schedulers before
  author scripts run and bounds the foreground double-animation-frame paint
  proof with a 250 ms forced-layout fallback. This prevents a background
  packaged Electron window from timing out a complete standby when Chromium
  pauses child-frame animation callbacks.
- External `text/babel` scripts are classified as Powered preview because
  Babel standalone fetches them with same-origin XHR. Ordinary relative
  `support.js` remains on the narrower normal origin.

Latest focused validation includes daemon scanner/runtime/origin/project-file
tests, Web Deck/srcdoc/edit/controller/session tests, and package/app typechecks. It covers direct
Deck page-5 jumps without intermediate pages, 64 KiB read boundaries, inert
comment/template/script-string markup, support.js/CSS/43 relative Babel JSX
resources, >2 MiB streamed Deck documents, large-file manual-edit identities,
last-good/standby atomic promotion, stale-window rejection, capability
negotiation, and navigation-free suspension. Chrome headless also reached
`*.localhost` successfully while the test server was bound only to
`127.0.0.1`. FileViewer selects the new origin only through its default-off
convergence harness.

The latest checkpoint also passed the complete 349-test Web FileViewer,
session/frame, navigation, and runtime integration set, the focused legacy FileViewer edit,
replacement-live-style and URL-comment-mode regressions, and the Web package
typecheck.

### 2026-08-29 packaged Electron evidence

A fresh production DMG was built, installed, and started with the terminal
feature flag under the isolated `preview-runtime-opacity-standby` namespace.
The real app, not a browser-only harness, passed:

- relative CSS, `support.js`, and SVG resources;
- root-relative CSS, JavaScript, and SVG resources;
- 43 external relative JSX files through the Powered scoped origin;
- a streamed HTML document larger than 2 MiB with relative CSS and JavaScript;
- Preview/Code without iframe URL or node replacement;
- 20 rapid Alpha/Beta file-tab round trips in 11–33 ms while preserving the
  exact two iframe nodes and URLs;
- manual text editing on the >2 MiB document, save, exit, re-entry with the
  saved value, and file-tab switch away/back on the same retained iframe;
- an agent-style active-file overwrite sampled every 4 ms: 177 samples,
  `zeroVisible = 0`, exactly one visible active frame throughout, old content
  visible through 741 ms, and the new revision visible from 748 ms;
- real Deck bootstrap and five-page discovery, followed by a direct page-1 to
  page-5 click whose captured state sequence contained only page 5 (no visible
  or semantic traversal through pages 2–4);
- screenshot capture through the runtime bridge into a real chat attachment,
  followed by local attachment removal without sending a message.

The packaged run also reproduced a real race that unit tests had missed: a
cached standby emitted hello/ready/paint before the host listener existed and
timed out after five seconds. The post-listener exact `probe()` was first added
as a red test and then verified in a rebuilt/reinstalled package. The final
gate run passed root `pnpm guard`, root `pnpm typecheck`, 352 Web FileViewer /
session / frame / navigation / runtime tests, 28 daemon bootstrap/stream tests,
446 contracts tests, and 6 preview-runtime tests.

The first Deck package run exposed another promotion-order race: the Deck
module synchronously reported its five-page state while still standby, which
active-frame source fencing correctly ignored; after promotion the toolbar
therefore stayed on its default 1/1. The terminal transport now sends a
read-only `od:slide-state-probe` after the exact frame becomes current. It does
not replay `go`, so it cannot double-drive authored navigation. Red/green
FileViewer coverage and a bridge-level no-navigation test lock this behavior;
the rebuilt package reports 5/5 and preserves direct page jumps.

## 1. User intent and non-negotiable product constraints

The user no longer wants another incremental patch on top of the accumulated
`srcDoc` / Blob / URL-load recovery state machine. If PR #7353 continues, it
should converge on the final architecture described below.

The following are product red lines:

1. A settled HTML artifact must display. A recovery mechanism that sacrifices
   Deck controls, editing, comments, selection, export, or current in-memory
   content is not acceptable.
2. Preview/Code switches, file-tab switches, and project switches must be
   visibility/state changes, not document navigations.
3. Agent file edits must update the preview promptly without exposing an empty
   document, stale content, or repeated refresh flashes.
4. Deck/PPT behavior must remain unchanged: direct page selection, sidebar,
   thumbnails, keyboard navigation, notes, current page, Present, and export.
5. Manual editing must remain live and durable: text/style edits, save timing,
   scroll position, undo/history, exit/re-entry, and app close must not regress.
6. Relative and root-relative CSS, JavaScript, JSX, fonts, images, `srcset`,
   media, modules, dynamic imports, and `support.js` must resolve naturally.
7. Browser-only validation is insufficient. A packaged Electron build must be
   installed and exercised with real artifacts before merge.
8. Do not add another permanent fallback transport. The desired end state is
   one real-URL document model.

The user has explicitly paused the push-to-merge path while this architecture
is reconsidered. Do not merge #7353 merely because its current CI becomes
green.

## 2. Current PR state

At the recorded HEAD, the PR contains approximately 1,690 added lines and 132
deleted lines across 18 files. Its important commits are:

- `20f65f2e8a` — stream bridges into large HTML files.
- `a1b14b1554` — recover aborted URL frames.
- `9b7777e1b9` — parse self-closing raw-text tags.
- `3e0d44c33a` — accept same-document paint signals.
- `bc2a4d6eb1` — scan body redirects in streamed HTML.
- `4fc8cb9752` — carry full-file passive guard hints to the web host.

Current implementation characteristics:

- HTML above the former buffering threshold can receive daemon bridge
  injection through a constant-memory streaming path.
- `text-preview` returns a 96 KiB source prefix plus daemon-produced passive
  guard metadata.
- The web client still uses that prefix for Deck, Tweaks, root-relative asset,
  and remaining srcDoc-only routing decisions.
- URL-load and srcDoc transports remain mounted together and are switched by a
  large collection of effects, refs, transport generations, probes, recovery
  latches, and `about:blank` parking behavior.
- The work fixes important large-file cases, but it is still Phase 1 of the old
  migration plan, not the desired final runtime.

Validation already run successfully at `4fc8cb9752`:

- contracts: 49 files / 440 tests.
- daemon scanner and project-file-range tests: 69 tests.
- FileViewer full suite: 315 tests.
- web, daemon, and contracts typechecks.
- root `pnpm guard` and root `pnpm typecheck`.
- `git diff --check`.
- packaged Electron build with the deterministic relative CSS/JS fixture.

Do not discard the tests added by this PR. They are useful acceptance coverage
for the final implementation even if the current product implementation is
replaced.

## 3. Why the current 96 KiB/full-scan model is transitional

The 96 KiB prefix is not a file-size limit. It is currently a routing sample.
It no longer decides passive sandbox/focus/redirect guard presence, but it
still participates in deciding whether the host must fetch the whole document
and use srcDoc for:

- Deck detection;
- Tweaks detection;
- root-relative project assets;
- other srcDoc-only interactive capabilities.

The current large-file request can read the same bytes several times:

1. read the 96 KiB prefix;
2. run powered-preview detection (up to 128 MiB);
3. run the passive-guard whole-file scan;
4. scan again on the raw preview route to find the injection point/policy;
5. finally stream the file to Chromium.

The powered and passive scans run concurrently, so wall time is not a simple
sum, but the I/O volume is still excessive. A synthetic warm-cache benchmark of
the current scanner on the local Mac measured approximately:

| File size | One scanner pass |
| --- | ---: |
| 2 MiB | 6.7 ms |
| 20 MiB | 68.8 ms |
| 100 MiB | 313.6 ms |

The scanner itself is constant-memory and reasonably fast. Repeating it and
blocking first paint on repeated scans is the problem.

## 4. Final answer on scanning

The final architecture may still inspect bytes, but it must not perform a
fresh full-file pre-scan on every open or tab switch.

There are two distinct operations:

### 4.1 Per-version policy classification

Every file version is classified at most once and the result is cached by an
exact content/version identity:

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

This classification is needed because some policy must be known before the
navigation begins:

- powered preview requires response headers and a different sandbox/origin
  profile before document execution;
- storage/focus/redirect protection must be installed before authored startup
  scripts run.

New and agent-modified files should be classified in the background when the
new version lands. Old data may pay one first-open scan. Concurrent requests
for the same version must share one in-flight classification. File/version
changes invalidate exactly one cache entry.

Deck, Tweaks, editing, comments, inspect, draw, snapshot, and observability are
not navigation policy. They must not be part of this classifier.

### 4.2 Response-time streaming processing

The daemon finds a parser-safe head insertion point, emits the universal
bootstrap, and then continues piping the source. It may process bytes as they
are delivered, but must not read to EOF before emitting the first response
bytes merely to choose a transport.

The 96 KiB correctness split disappears. At most, a small prefix may remain
for non-critical metadata or UX hints.

## 5. Target architecture

### 5.1 One real URL document per settled file version

```text
file version appears
  -> classify PreviewPolicy once and cache it

open preview
  -> choose normal or powered real URL
  -> daemon streams a universal bootstrap into the document
  -> iframe reports capabilities
  -> host enables required capabilities
  -> iframe confirms DOM readiness and presentation state
  -> host reveals it

Preview <-> Code / file tab / project tab
  -> READY <-> SUSPENDED
  -> state-preserving move/visibility only; no URL change and no navigation

agent or manual edit creates a new file version
  -> load a temporary standby frame
  -> wait for exact Runtime, capability, DOM, and presentation acknowledgements
  -> atomically replace the previous version
  -> show explicit failure after bounded recovery; never pass stale output off as current
```

### 5.2 Versioned runtime protocol

Define protocol types in `packages/contracts` without putting browser or Node
implementation code into that pure package.

Minimum messages:

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

Every message must be fenced by `sessionId` and `documentVersion`. Host receive
filters must reject hidden, evicted, standby, previous-file, and previous-
version windows.

### 5.3 Universal bootstrap

The bootstrap executes inside the artifact iframe before authored startup
scripts. It owns:

- handshake and protocol fencing;
- capability discovery;
- bridge module installation and idempotent activation;
- DOM readiness and presentation-state acknowledgement;
- passive policy installation;
- DOM-local annotation needed by editing/selection after that capability is
  explicitly enabled.

Interactive modules should be migrated in this order:

1. observability, scroll, content measurement, snapshot;
2. comment selection and draw;
3. Tweaks and palette;
4. Deck navigation/state/notes;
5. manual edit and source identity.

Do not simply concatenate the existing approximately 4,000-line `srcdoc.ts`
into one string and call that the runtime. Extract modules with explicit
install/enable/disable lifecycles and idempotency tests.

### 5.4 Project-scoped preview origin

The preferred final resource model is a scope-specific preview origin rather
than rewriting or inlining user assets. Conceptually:

```text
normal profile:  http://n-<scope>.localhost:<daemon>/path/to/index.html
powered profile: http://p-<scope>.localhost:<daemon>/path/to/index.html
```

The exact URL shape is an implementation decision and must work in browser
development, normal desktop, and packaged Electron. The daemon validates the
scope and maps `/` to the scoped project root, so both relative and
root-relative resources resolve naturally:

```text
./support.js   -> sibling file
../img/a.png   -> parent-relative file
/assets/a.css  -> current project root
```

This avoids host-side asset inlining and the script-corruption class fixed in
#6932. It also isolates preview storage/origin state by preview scope.

Before committing to the hostname shape, prove:

- loopback hostname resolution on macOS, Windows, and Linux;
- Team project scope renewal and expiry;
- normal versus powered response headers;
- cache identity and authorization;
- authored CSP and authored `<base>` behavior;
- no access from one scoped preview origin to another project.

If scoped origins are not viable, the fallback must be a parser-safe streaming
resource rewriter for HTML and CSS. Do not return to full-document buffering or
regex rewriting of executable script ranges.

### 5.5 PreviewSession ownership

Move document lifecycle out of the monolithic FileViewer effect graph.

```ts
type PreviewSessionState =
  | 'cold'
  | 'loading'
  | 'ready'
  | 'suspended'
  | 'updating'
  | 'failed';
```

One durable session is keyed by `(workspace, project, file)`. It owns:

- active document version and iframe;
- capability state;
- scroll, Deck, and edit state;
- standby replacement frame;
- bounded failure/retry state.

An explicit LRU retains a bounded number of suspended sessions. `about:blank`
parking is not an LRU policy and must be removed. Temporary standby frames do
not count as durable sessions and are removed immediately after success or
failure.

## 6. Concrete treatment of the current #7353 changes

### Keep

- bounded-memory streaming primitives;
- parser-safe insertion-point tests;
- Range/HEAD/ETag/authorization coverage;
- relative CSS/JS/JSX/support.js fixtures;
- visible-paint and privacy-safe diagnostics;
- packaged Electron reproduction fixtures;
- all red tests that express user-visible behavior.

### Refactor

- `scanHtmlHeadForStreamingInjection` into a reusable per-version policy/index
  path plus a response-time bounded head injector;
- `poweredPreview` and `passiveGuards` into one cached `PreviewPolicy`;
- current URL bridge strings into modular universal-bootstrap capabilities;
- pooled iframe ownership into an explicit PreviewSession/LRU owner.

### Delete before final merge

- `HTML_ROUTING_TEXT_PREVIEW_LIMIT` as a correctness boundary;
- `passiveGuards` routing state in FileViewer;
- `shouldUrlLoadHtmlPreview` URL/srcDoc transport selection;
- Blob/srcdoc main-preview bootstrap transport;
- transport generations and activation probes;
- per-generation recovery latches;
- `about:blank` parking on Preview/Code and tab changes;
- the dual URL/srcdoc transport stack;
- web-side CSS/JS asset inlining and its compensating rewrite pipeline;
- automatic reload-based `ERR_ABORTED` recovery once stable real-URL sessions
  make it unreachable.

Keep `ERR_ABORTED` observability after deleting recovery so regressions remain
detectable.

## 7. Recommended commit/checkpoint sequence

Even if #7353 remains the final PR to `main`, implement it as reviewable,
revertible checkpoints:

1. `refactor(preview): define runtime protocol`
2. `feat(daemon): index preview policy per file version`
3. `feat(preview): serve project-scoped preview origins`
4. `feat(preview): install universal URL bootstrap`
5. `feat(preview): migrate passive and selection bridges`
6. `feat(preview): migrate deck and tweaks bridges`
7. `feat(preview): migrate manual edit bridge`
8. `refactor(preview): own documents through preview sessions`
9. `refactor(preview): remove srcdoc and blob transports`
10. `test(preview): lock packaged Electron parity matrix`

A single unstructured giant commit is not acceptable. If GitHub review becomes
unmanageable, use stacked PRs targeting the terminal branch, but do not expose
an additional permanent product transport or merge an unvalidated partial
default path.

## 8. Regression risks and hard gates

| Surface | Main regression risks | Required gate |
| --- | --- | --- |
| Deck/PPT | sidebar disappears, direct page click becomes sequential, keyboard/state/notes diverge | existing Deck tests plus packaged direct-page/notes/Present run |
| Manual edit | DOM/source identity drift, delayed text, style-only flush, reload, scroll reset, data loss on close | red/green edit persistence and packaged edit/re-entry/app-close run |
| Comment/inspect/draw | messages target hidden iframe, coordinate/zoom mismatch, stale selection, failed snapshot | session-fenced protocol tests and packaged annotation/export run |
| Agent file updates | half-written document, stale frame wins, repeated refresh, inactive tab never updates | file-watch burst tests plus standby atomic-swap run |
| Resources | support.js/JSX/CSS/fonts/images/modules/root paths fail | real multi-file fixtures in browser and packaged Electron |
| Powered preview | Worker/WASM/SAB/WebGL fails or normal artifacts receive a larger trust surface | normal/powered isolation and header tests |
| Team projects | scope expiry, missing auth, cross-project leakage | Team scope issue/renew/deny tests |
| Lifecycle | Preview/Code/tab/project switch navigates or flashes | navigation-count assertions and high-frequency packaged switching |
| LRU | memory grows without bound or active edit session is evicted | deterministic LRU tests and active-session pinning |
| Old projects | old templates, authored base/CSP, old edit IDs fail | representative legacy fixture set |

## 9. Required packaged Electron matrix

Before switching the default path and again before deleting the old path:

- first project open and project switch away/back;
- Preview/Code rapid switching;
- two and many HTML file tabs, including inactive agent rewrites;
- small HTML, 2.7 MiB, 20 MiB, and malformed-tag fixtures;
- `support.js`, many relative JSX files, CSS imports, nested modules, fonts,
  images, `srcset`, media, dynamic imports, and root-relative assets;
- direct Deck page selection, sidebar, notes, keyboard, Present, thumbnail and
  export parity;
- comment, inspect, draw, snapshot, palette/Tweaks, manual edit, persistence,
  re-entry, scroll preservation, and app close;
- normal and powered Worker/WASM/WebGL previews;
- slow subresources, aborted/stale navigation, last-good retention, explicit
  retry, LRU eviction, and process restart;
- diagnostics/PostHog output without artifact source or DOM text.

Packaged testing must use a freshly built and installed app for the exact
commit under test. Stop the previous namespaced app and remove obsolete build
outputs after the replacement build is confirmed.

## 10. Immediate continuation

1. Extract the exact existing mode-replay payloads from FileViewer into a
   target-explicit helper. Invoke it only after `PreviewSessionFrames` reports
   exact capability application for that frame; never route through a mutable
   global active-frame ref during standby negotiation.
2. Build the terminal transport behind focused red/green FileViewer tests. Do
   not select it in product code until mode replay, Deck, editing, annotation,
   snapshots, relative assets, Team auth, live updates, and lifecycle parity
   are covered.
3. Keep #7353's existing real-user fixtures and tests green. Do not delete the
   legacy path until every capability has parity coverage and the packaged
   Electron matrix passes.

## 11. Relevant source landmarks

- `apps/web/src/components/FileViewer.tsx`
  - `HTML_ROUTING_TEXT_PREVIEW_LIMIT`
  - `previewTextNeedsFullSourceForSafeInline`
  - `shouldDeferPassivePreviewSource`
  - `useUrlLoadPreview`
  - srcdoc transport generation/recovery block
  - iframe transport stack near the bottom of the component
- `apps/web/src/components/file-viewer-render-mode.ts`
  - current URL/srcDoc decision and remaining disqualifiers
- `apps/web/src/components/IframeKeepAlivePool.tsx`
  - current pooling and `about:blank` parking behavior
- `apps/web/src/runtime/srcdoc.ts`
  - current bridge implementations to migrate, not blindly concatenate
- `apps/daemon/src/http/html-stream-injection.ts`
  - current bounded-memory scanner and response stream primitives
- `apps/daemon/src/routes/project/index.ts`
  - `detectPoweredPreviewHint`
  - `text-preview` route
  - raw/powered HTML routes
  - `buildStreamingUrlPreviewBridgeInjection`
- `packages/contracts/src/api/files.ts`
  - current powered/passive metadata contracts
- `packages/contracts/src/runtime/preview-guards.ts`
  - shared passive-policy heuristics
- `specs/current/html-preview-runtime-convergence.md`
  - existing committed migration plan; revise before implementation

## 12. Final acceptance statement

The work is complete only when a settled file version has one real daemon URL
document; capability and view changes do not navigate it; file-version updates
swap atomically after an exact Runtime handshake and presentation-state
acknowledgement; suspended sessions follow an explicit LRU; and the
Blob/srcdoc/generation/about:blank recovery architecture has been deleted
without product-behavior regressions. Visual-paint sampling remains read-only
observability: it may report a white screen, but it must never promote, retain,
discard, reload, or otherwise mutate a preview session.

The retained-frame design also needs a separate lifecycle follow-up. A
state-preserving `moveBefore()` keeps authored JavaScript, timers, WebAudio and
focus alive while the iframe is hidden. Focus must be released immediately in
this PR. Audible media and background CPU/network policy need an explicit,
tested Runtime lifecycle protocol; do not globally freeze arbitrary authored
JavaScript or silently claim that `PreviewSession.setSuspended()` already does
so.

Retained preview authorization must also be partitioned by
`workspaceAccountGeneration`, not only by the serialized workspace/member
identity. The current permission refresh is fail-closed before the viewer is
mounted, so no cross-account visible leak has been reproduced. However, a new
login cycle that resolves to the same workspace identity can reuse the prior
scope cache and parked Runtime. The follow-up must put the captured account
generation into the authorization key (before the navigation cache and iframe
pool keys are derived), prove that a new generation mints a new scope, and
optionally evict old-generation parked runtimes if logout is required to stop
their background execution immediately.

---

### 2026-09-02 decisions and surface outcomes

**Design-system section preview — converged, and it was dead code.**
`DesignSystemInlinePreview` now loads the file's own URL; the whole
relative-asset inlining pipeline it depended on (~325 lines, 16 functions) is
deleted. Verified separately: `renderReviewCard` is defined at
`FileWorkspace.tsx:5226` and **never called**, on this branch and on
`origin/main`, so the surface is currently unreachable in the product. The specs
pin the transport, not reachability. Open product question left alone: whether
to delete the ~200 further lines of orphaned review UI.

**Preview observability — contract and timing layer delivered, not yet wired.**
8-phase event contract in `packages/contracts/src/runtime/preview-phase-events.ts`,
pure `PreviewPhaseTelemetry` in `apps/web/src/runtime/preview-phase-telemetry.ts`,
17 tests, dashboard aggregation spec in
`specs/current/preview-observability-dashboard.md`. Nothing is wired into a
component yet — that is deliberate, wiring waits until the surfaces settle.

The privacy boundary is structural rather than a denylist: no free-text field
kind exists in the contract, and payloads are built by allowlist rather than
copied. This matters concretely — on the rolling-upgrade path
`apps/web/src/providers/registry.ts` mints `documentVersion` as
`` `legacy:${name}` ``, i.e. the file path itself, so a payload that copied
identity verbatim would have shipped user file paths to PostHog on day one.
Identity is hashed instead; the stated cost is that preview rows cannot join to
`project_id`, which none of the six metrics needs.

**Fullscreen presentation — host-side approach settled.**
Do not mount a second `PooledIframe` in the overlay to "move" the frame there.
`pool.release(key)` parks the frame and does **not** notify other mounted hosts
holding the same key, so exiting presentation would leave the main preview
blank. Instead the overlay stops owning an iframe at all, and the existing
`.artifact-preview-transport-stack` (which already holds the live runtime
frames, `position: absolute; inset: 0`) is promoted to fullscreen. The overlay
keeps only the exit affordance. Deck presentation chrome then arrives as a
runtime bridge message rather than a rebuilt document.

Note this will need `FileViewer.present-exit-affordance.test.tsx` updated: it
currently focuses `overlay().querySelector('iframe')`. The contract it protects
— the exit control keeps working when focus is inside the sandboxed preview —
is preserved; only the frame's location changes.

**React component preview — kept on srcdoc, and a real defect found.**
`buildReactComponentSrcdoc` (`apps/web/src/runtime/react-component.ts`)
synthesizes a harness from `.tsx` source: it rewrites imports/exports **with
regular expressions**, then loads React 18, ReactDOM and `@babel/standalone`
**from `unpkg.com`**, transforms in the browser and `eval`s the result. There is
no file on disk to serve, so it is not a transport-convergence target.

But it has no offline fallback — `if (!window.React || !window.ReactDOM ||
!window.Babel) showError('React preview runtime failed to load.')`. In the
packaged client offline, or behind a corporate firewall, this surface is
guaranteed to fail. The Preview Lab 500-sample real-corpus run already shows
this failure class: 8 of its 12 white screens were `external-network-required`.

Correction to an earlier reading of the second consumer: `exports.ts:830` is
**not** offscreen rendering. `exportReactComponentAsHtml` downloads a standalone
`.html` the user opens outside Open Design, where a CDN reference is the correct
choice. So the two consumers have genuinely opposite requirements and should be
served by one builder with a `runtime: 'local' | 'cdn'` parameter, not by
copying the builder into the daemon.

The fragile part is the regex module rewriting, not Babel. `esbuild` is already
used across this repo and understands module syntax; moving the transform there
would remove both the regex rewriting and the browser-side Babel. Not yet
decided.

**Version-history preview — converging, daemon route in progress.**
Decided: add a daemon route that serves a historical version as a real document
so its relative JS/CSS/images/fonts resolve natively. Today
`fetchProjectFileVersion` (`registry.ts:2871`) returns JSON content that the web
feeds to `buildSrcdoc` (`FileViewer.tsx:4015`), so an old version renders
without its relative assets — a user comparing versions sees a broken old
version that was fine at the time.

**PR #7353 is process-blocked, not code-blocked.** CI on `2e717e0cda` is fully
green (28 success, 4 skipped, 0 failures). 25 of 26 review threads are resolved;
the one remaining was two hardcoded millisecond timeouts this PR introduced in
`e2e/ui/workspace-multi-client-collab.test.ts`, now on `T.short`. The
`CHANGES_REQUESTED` sits on `e7ff157c08`, four days and many commits stale, and
its three blockers are all fixed in current code. The reviewer has exhausted the
PR's 3 `REQUEST_CHANGES` allowance and can now only leave `COMMENT`, which never
clears `CHANGES_REQUESTED`. Nothing in the code can lift it — it needs an
approve or a maintainer dismissal.

---

### 2026-09-02 presentation converged, and what it cost to get right

`d0bd4a2ae7`. The overlay no longer owns a frame; the preview is promoted in
place by `.viewer.is-tab-present` (fixed, inset 0, z-index 1050, black) and the
overlay becomes a transparent chrome layer at 1060 whose children opt back into
pointer events. Zero DOM movement, so the browsing context is not merely
preserved by `moveBefore` — it is never touched.

**The trap that nearly shipped a black screen.** `presentOverlayRef.current
.requestFullscreen()` made the overlay the fullscreen element, and a browser
renders only that element's subtree. Moving the frame out without changing the
fullscreen target would have presented an empty black layer. Fullscreen is now
requested on `document.documentElement`, because the promoted preview lives in
`.viewer` while the overlay is portaled to `<body>` and the root is their only
common ancestor.

**Two effects deleted, not ported.** Forwarding host slide moves into the
overlay, and adopting the moves the overlay made on its own, existed solely
because presentation was a separate document. The presented frame is now the
active preview frame, so ordinary slide driving and the main `od:slide-state`
listener already cover both directions. Convergence should reduce this code, and
here it did.

**Deck chrome and click-to-advance** now arrive as a runtime message to the
injected presentation bridge (`odPreviewBridge=presentation`, added to
`BASE_PREVIEW_BRIDGE_QUERY` so it ships inert on every settled document —
requesting it at present time would change the URL, which is the navigation being
removed). The bridge reports navigation *intent*; the host decides which slide
comes next, because that depends on the authored deck's own protocol, which the
daemon detects and the host drives.

Verification: three specs (one control proving the probe resolves), red →
green → **implementation reverted, both presentation cases red again, control
still green** → restored. `FileViewer.present-exit-affordance.test.tsx` was
updated rather than weakened: it now installs the runtime harness and focuses
the real runtime frame, so it exercises the converged path. Five neighbouring
files, 14 tests green; `--filter web typecheck` clean.

**Known limit:** jsdom cannot verify that the bridge actually hides deck chrome
or that clicks advance slides. That needs a real browser and is the first thing
to check in the end-to-end pass.

### Merge state on `fix/streaming-html-preview-bridge`

Merged locally, nothing pushed: `feat/deck-presentation-bridge`,
`fix/design-system-preview-converge`, `fix/preview-modal-runtime-converge`. After
the merge: 20 narrow tests across the five converged surfaces green,
`--filter web typecheck` clean, contracts dist rebuilt.

Still outstanding: the version-history daemon route and its FileViewer wiring;
observability wiring plus dashboard queries; the React component preview's CDN
dependency; and the end-to-end pass, which has never produced a verifiable
artifact against the real product — Preview Lab's L2 lane is exercised in CI
against a hand-written fake product shell, not the real one.

---

### 2026-09-02 version history converged — all five surfaces done

`5166f0573d` (web) on top of `feat/version-document-real-url` (daemon). The
panel points its frame at `/api/projects/:id/version-preview/:versionId/<relPath>`
with the project-relative path last, so the browser resolves that version's own
siblings natively — no `<base>`, no minted scope. Readiness moved from comparing
srcdoc strings to comparing the loaded URL, and the surface's local srcdoc
builder is deleted rather than left as a second way to render the same thing.

It requests the passive guards only (`sandbox`, `redirect`, `focus`). A
historical version is read-only — never edited, commented, presented or measured
— so it has no business negotiating the interactive capability set.

Red → green → **falsified** (frame swapped back to a `srcdoc` attribute: the
transport case went red, the control stayed green) → restored. 18 tests across
four version/presentation files green; `--filter web typecheck` clean.

**The asymmetry the daemon route documents, restated because it will surprise
someone:** the addressed document is the captured version byte-exact, but its
subresources are the files on disk *now*. Version history is only ever captured
for HTML, so "the assets as they were" do not exist to serve — that is not a
trade-off that was taken, it is an option that does not exist. A version whose
stylesheet was later deleted still looks wrong. A secondary HTML reference
(`<iframe src="./other.html">`) inside a historical version returns
`VERSION_NOT_FOUND` rather than falling back to current bytes, so "this is that
version" can never silently degrade into "this is roughly that version".

### Surface scoreboard

| Surface | State |
|---|---|
| Main document preview | converged before this session |
| Fullscreen presentation (deck + plain HTML) | converged |
| Design-system section preview | converged; its inlining pipeline was dead code and is gone |
| PreviewModal (skill examples, plugin previews) | converged, with the daemon bridge gap it exposed fixed |
| Version-history preview | converged |
| React component preview | **stays on srcdoc** — synthesized harness, no file to serve. Separate real defect: unpkg CDN with no offline fallback. Research in flight. |
| Thumbnails, showcase cards, offscreen export | srcdoc by design — do not "converge" these |

Deliberately not converged, each with a recorded reason: deck views inside
PreviewModal (catalogue routes mint no preview session), design-system
showcase/tokens (a host-side read-generation fence has no representation in a
document URL), and the scoped-preview-origin path's presentation capability
(belongs in the capability negotiation, not the bridge allowlist).

---

### 2026-09-02 pause point — read this first when resuming

Everything below is committed on `fix/streaming-html-preview-bridge`, local only,
nothing pushed. Merged in from their own branches: deck presentation bridge,
design-system preview, PreviewModal, version-history route, phase telemetry,
first visible paint.

**Landed since the last section**

- **React component preview compiles with a real parser.** The four regex
  rewriters are gone; `react-component.ts` went 231 → ~130 lines. Measured on
  the previous implementation, not guessed: a string literal containing
  `export default function` had its contents edited and emitted `typeof
  function`, a syntax error that killed the preview outright, and `export * from
  './x'` survived verbatim into a classic script, also a syntax error. Sucrase
  parses instead and runs in the host, so the document no longer downloads a
  compiler and the compiled source is inlined into a `<script>` rather than
  eval'd (real line numbers in stack traces). Unresolvable modules are named in
  the error instead of vanishing.
- Sucrase's CLI dependency on `commander@4` took the pnpm hoist root and broke
  the `dsh-runtime` build by making `@deepseek-ai/dsh-cmdline` resolve the wrong
  major. Pinned via `pnpm.overrides` (`sucrase>commander`), alongside the
  thirteen overrides already there. An `.npmrc` `hoist-pattern` fix was tried
  first and rejected — it forces a full purge and reinstall of all 30 workspace
  projects.
- **Compile errors are caught in the host.** Moving compilation out of the
  sandbox moved where a syntax error lands; unhandled it would throw inside
  FileViewer's render path and take the viewer down over a typo. The spec
  covering it went red before the fix was added.
- **Phase anchor wired in FileViewer.** Nothing the runtime components emit
  reaches the sink without it, and that failure mode is invisible: the dashboard
  reads as a preview nobody opened rather than as half-wired instrumentation.
- **First visible paint reports from the bridge.** Host wiring is NOT done —
  see below.

**Measured costs, so nobody re-litigates them from intuition**

Sucrase compile, host side: ~0.08 ms/KB, linear. 6 KB → 1.3 ms, 59 KB → 5.2 ms,
236 KB → 17.8 ms, 951 KB → 79 ms. Peak heap ≈ 130× source size, transient
(16 KB → 4.5 MB, 135 KB → 18 MB). 500-level nested JSX compiles in 1.8 ms with
no stack overflow. The existing `source.length > 100_000` deferral corresponds
to ~8 ms, comfortably inside a frame. Recompiles are bounded by `file.mtime`
changes, not renders — the effect is keyed on `[source, …]` and the fetch on
`[…, file.mtime, …]`. There is no compile cache, so an mtime bump with identical
content recompiles; at ~1 ms for real components that has not been worth fixing.

Net against the previous design: the host pays 1–5 ms, and the sandbox stops
downloading 3 MB of `@babel/standalone` and stops compiling in-page.

**Immediate next steps**

1. **Host wiring for first visible paint.** The bridge reports on its own message
   type `od:preview-first-paint` (deliberately not an observability event — that
   channel's catch-all would publish a fabricated `client_preview_runtime_error`
   per healthy preview). Listen on the active frame, filter with
   `ev.source === iframeRef.current?.contentWindow`, then
   `recordPreviewPhase(identity, 'first_visible_paint', previewFirstPaintPhaseDetail(msg))`.
   An optional `token` on the host-state message you already post is echoed back
   as `attach_token` and buys exact attach attribution plus a fresh measurement
   on warm re-attach.
2. **Offline React delivery** — approach recorded in
   `apps/web/tests/runtime/react-component-transform.test.ts` next to the todo.
3. **Fullscreen presentation in a real browser.** Still unverified: jsdom cannot
   see whether the bridge actually hides deck chrome or whether clicks advance
   slides, and the L2 matrix has no presentation gate (verified against
   `open-design-l2-gates.ts`). An agent was mid-way through adding one and was
   stopped; check `git worktree list` for a `od-lab-present` worktree before
   starting that work again.
4. **L2 cold-start false failure — root-caused and fixed in the harness**
   (`od-lab-present` commit `882bd71`). Running the three cases cold, the first
   one reported `fileTabPreserved` and `projectRoundTripPreserved` false while
   `previewCodePreserved` — the one round trip that never navigates — came back
   true.

   The frame instance really did change. The harness's reading of that was what
   was wrong. `documentKeepAliveKey` keys a retained frame on
   `project \0 file \0 <identity> \0 attempt:<n>`, and `navigationRetryToken`
   is part of that key (`PreviewSessionFrames.tsx:229-236`, bumped at
   `FileViewer.tsx:11518` on a standby navigation failure). When the runtime
   gives a failed navigation its one clean retry, the next attach is a different
   pool entry *by design* and `promote()` evicts the old one. A cold start is
   exactly when a navigation is slow enough to fail and be retried, so the
   harness converted a successful self-heal into a reported product defect.

   Two hypotheses were killed statically on the way, both worth not re-running:
   pool eviction is LRU **by count** (`maxEntries = 5`), not time-based, so a
   slow run does not age anything out; and `initial.instance` was not null,
   since `previewCodePreserved` shares that same guard and was true.

   The fix replaces the three booleans with a four-state verdict —
   `preserved` / `lost` / `reprovisioned` / `unbaselined`. Only `lost` (same
   identity, same attempt, different frame) fails; `unbaselined` also fails,
   because a missing measurement must never read as a passing one. The attempt
   needs no new instrumentation: `previewSessionNavigationAttemptUrl` already
   stamps `odPreviewAttempt=<session>.<n>` onto the document URL. Falsified
   three ways, each branch independently red. 20/20 green, `tsc --noEmit` 0.

   **Still open:** which navigation actually retried on the observed cold run is
   not established — only the mechanism. That needs one live cold run to
   confirm, and it is the first thing to check when a runtime is next started.
   Adjacent and deliberately not fixed there: `projectRetention.frameReused` /
   `sessionReused` / `documentVersionReused` compare identity the same way and
   share the blind spot. They are diagnostic-only — never asserted by the gate —
   so they cannot manufacture a failure, but they read misleadingly after a
   retry.

## Live verification, 2026-09-04

**The cold-start failure was NOT the retry mechanism. My earlier diagnosis in
item 4 above was wrong about the cause.** Reproduced it live and the harness
now reports what it saw: `expectedText: false` with `nonWhite: true`, a
completed handshake, and no recovery after a further 30 s. The frame inventory
named the culprit — the page had drifted to
`/projects/<p>/conversations/<cid>/files/lru-6.html` while the measurement
waited for `index.html`. The server log shows only two page requests, so the
app navigated itself there client-side.

Root cause, verified in code:

* `ProjectView.tsx:4319-4360` — the route-sync effect has no `routeFileName`
  guard at all. On first commit `openTabsState.active` is null, so it navigates
  with `fileName: null` and **strips the file out of the URL**.
* `ProjectView.tsx:3741` — the auto-select guard is `if (routeFileName) return`,
  and `routeFileName` is the *live* URL segment the step above just destroyed.
* `selectPrimaryProjectFile` (`:12222-12230`) ranks every plain HTML file the
  same and breaks the tie on newest `mtime`, so it lands on the last-created
  file. Then `:3753` → `:4345` writes that file back into the URL and it
  self-reinforces.

**This is user-reachable, and sharing a link is the exact vulnerable case:**
cached tab state is keyed per workspace identity, so a teammate opening a
shared deep link has none, and gets sent to a different file. No test covers
it, and `ProjectView.tabs-navigation.test.tsx` mocks `navigate`, so the
URL→`routeFileName` feedback loop cannot occur there — the existing suite is
structurally unable to catch it. A red spec must drive the real `navigate`.

**A version update performs three real document navigations** where the
contract is one (`navigationKinds: ['real-url','real-url','real-url']`,
consistent across every case and every run). Not blank parks — three real
reloads per save.

This is a **regression introduced by this branch**, not a pre-existing defect.
At the merge base (`a8ec5784eb`) none of the machinery exists:
`PreviewSessionFrames.tsx`, `preview-session-navigation.ts`,
`use-project-preview-session-navigation.ts`, `preview-version-remint.ts`,
`project-preview-navigation-cache.ts` are all new, and
`fileContentRefreshKey` / `previewRuntimeRevisionKey` /
`previewRuntimeNavigationRetryToken` / `previewRuntimeScopeRetryToken` have
zero occurrences in `apps/web/src` there. The old transport was a `?v=<mtime>`
cache-bust on a single iframe with no scope-minting step. The convergence work
introduced both the one-navigation contract and the thing that violates it.

The governing invariant: one navigation per distinct
`(sessionId, documentVersion, attempt)`. `project-preview-navigation-cache.ts`
passes `revisionKey` to the cache but **not** to `#mint` (`:111`), so every
distinct `revisionKey` is a guaranteed miss → a fresh `preview-url` mint → a
new `sessionId` → one real navigation. Nothing dedupes "the bytes did not
change". So the question is only how many distinct `revisionKey` values one
save produces.

Eliminated: both `previewRuntimeNavigationRetryToken` sites are unreachable
from a save (`:11518` needs an Electron host navigation failure and is fenced
once per generation; `:15002` is the toolbar Reload button). And the file-list
refresh commit is genuinely atomic (`ProjectView.tsx:3590-3601` commits the
list and both witnesses in one `setState`), so the staged-arrival theory for
`size`/`mtime`/`fileContentRefreshKey` is falsified *within* a refresh.

Two candidates remain, and **one was tested and disproven live**:

* *Wildcard amplification (DISPROVEN).* A save also writes the version blob and
  manifest under `.file-versions/`, which is inside the watch root and filtered
  at none of the watcher, SSE (`routes/project/index.ts:5499` sends every event
  unfiltered) or web layers — and each event bumps a project-wide wildcard key
  (`ProjectView.tsx:4087-4092`) that every open preview folds in via `Math.max`
  (`FileWorkspace.tsx:3396-3401`). Structurally exact. **But adding
  `.file-versions` to `IGNORED_PROJECT_DIR_NAMES` left the live count at 3.**
  The unit test went green and the symptom did not move, so the change was
  reverted rather than shipped as an unvalidated "fix".
* *Bounded VERSION_CHANGED remint (now the leading candidate).* The mint races
  the write, the daemon serves the 409 version-changed document
  (`routes/project/index.ts:6214-6224`), and `onStandbyVersionChanged`
  (`FileViewer.tsx:17938-17959`) spends its budget twice.
  `PREVIEW_VERSION_AUTOMATIC_REMINT_LIMIT = 2`, so 1 + 2 = exactly 3, and it
  explains why the count is *invariant* across cases and runs where an
  event-timing race would vary.

**The discriminator, and it needs no new instrumentation:**
`FileViewer.tsx:10004-10012` already stamps each attach with a `trigger`
(`initial_open` / `content_version_change` / `recovery` / `file_tab_change` /
`scope_reminted`). Read the `trigger` on the three `preview_attach` phase rows
from one save: two `recovery` rows confirm the remint loop. Those rows go to
the consent-gated analytics channel, not the console, so reading them needs a
telemetry sink — that is the one remaining step.

No test pins this. `FileViewer.test.tsx:9977` bounds `/preview-url` calls at 2
but bumps both witnesses in a single rerender, and the e2e witness
(`workspace-multi-client-collab.test.ts:730`) counts *promotions*, not
navigations, so superseded navigations are invisible to it.

**Deck presentation bridge — fixed and verified** (commit `050724c326`). It was
never delivered on the converged transport: built as a URL-negotiated bridge,
which works on `/raw` and `/powered` — the paths this refactor moved off. The
scoped URL carries only the passive guards, on purpose ("Interactive Deck
support is negotiated after navigation; it must never become part of the
document URL"), so `odPreviewBridge=presentation` was requested and never
arrived. Not a regression: `deck-presentation.ts` does not exist at the merge
base; the bridge is new on this branch and was never wired up.

It is now installed with the rest of the runtime next to `observability`, which
is safe by construction — the bridge only registers a listener at parse time and
does nothing until the host negotiates, and the host already posted
`od:deck-presentation`. Both ends existed; only the middle was missing. Putting
the switch in the URL would have been the wrong fix: a URL change is a
navigation, so it would reload the very document presenting must keep alive.
Live: `bridgeReady` / `acknowledged` / `receiptAgreesWithDocument` /
`hiddenWhilePresenting` all false -> true, `restoredAfterExit` true, and
document navigations still 0.

**Click-to-advance was never broken.** `forwardAdvanced: false` was the fixture:
two slides, with the deck parked on slide one before the click test, so the
forward click asked it to advance past its own end. With three slides the same
product code advances correctly.

**Backward stepping oscillated — root-caused and fixed** (`2fbc93abf0`).
Clicking back during a deck presentation bounced the slide forward again and
settled wrong, about one time in three.

A presented deck has more than one voice: the authored document reports its
slide, and so does the injected deck runtime module. Instrumenting every writer
showed both answering a single `go` and disagreeing while the move was still in
flight. The host adopted whichever arrived last, that value feeds
`deckSlideIndex`, and the transport replays `deckSlideIndex` — so a stale answer
became a fresh intent and closed a loop:

    goToSlide:2, replay:2, goToSlide:1, replay:1,
    replay:2, replay:1, replay:2, replay:1, ...   (up to 59 writes, unbounded)

Fix: a report is authoritative only once it agrees with what the host last
asked for; until then the host is mid-move and a disagreeing report is a stale
voice. The intent expires after 1.5s, so a deck that clamps the index or never
answers cannot freeze host state — a tie-breaker, not a lock
(`apps/web/src/runtime/deck-slide-intent.ts`, pure and separately specced
because the wiring is not reachable from jsdom).

    before   5 pass / 3 fail over 8 runs,  11-59 deck writes per run
    after    7 pass / 0 fail over 8 runs,  exactly 2 writes per run

The write count collapsing to 2 is the evidence that matters: the loop is gone,
not sampled at a luckier moment.

**Three theories died on the live product before this one survived** — worth
recording, because each looked right on the code: the speaker-notes popup
(disproven twice; the oscillation is identical with `window.open` neutralised),
a stale closure over `activeDeckSlideIndex`, and a stale `modeStateRef` in the
transport (assigned during render, never stale). Earlier in the same session
`.file-versions` watcher events and the automatic remint budget died the same
way. Code review alone has now been wrong five times on this surface; the write
trace settled it in one run.

**Click-to-advance was never broken.** `forwardAdvanced: false` was the fixture:
two slides, with the deck parked on the last one before the click test, so the
forward click asked it to advance past its own end.

**Deep-link fix cherry-picked onto this branch** (`f0798938f0`, also standalone
on `fix/project-file-deeplink-autoselect`). Not cosmetic for the lane: before
it, four of six L2 runs aborted because the app drifted off the requested file.
After it, zero.

**The two stale FileViewer specs are fixed** (`801bb6cd56`). Both asserted the
pre-convergence layout where the overlay owned an iframe. Neither invariant was
stale, only the element: downloads are now checked on the promoted frame's own
sandbox (which does carry `allow-downloads` — verified against the product
first, because had it not, the spec would have been reporting a real
regression), and the Escape-forwarding spec now selects
`iframe[data-od-active="true"]` rather than the viewer's inert second frame.
363 of 363 FileViewer tests pass.

## Automated coverage, and what it found (2026-09-05)

**The L2 matrix is fully executed for the first time.** `edit-save-reenter` and
`comment-inspect-selection` were the last two pending entries; both are now
driven entirely through product surfaces, and both were proven against a real
defect before being marked automated. The fail-closed mechanism is kept and
separately tested, so a scenario added later can still declare itself pending
and block the lane.

`edit-save-reenter` was verified by re-introducing the one line that cleared
the persisted-document latch:

    defect present   saved true · navigations 2 · scroll 240 -> 0 · reprovisioned
    fix present      saved true · navigations 0 · scroll 240 -> 240 · preserved

**Corpus results so far** (real artifacts, through the whole product path):

    40 templates    39 rendered · 0 white · 1 harness error
    165 templates  164 rendered · 0 white · 1 harness error

56 of the 165 declare relative references that do not resolve, and every one of
them still rendered — so a missing sibling is not by itself a black screen. The
deck that did go black earlier was missing the specific script that drives its
layout, which is a narrower failure than "missing asset" and worth keeping
straight when triaging.

The one harness error in both runs is the same daemon 500 on uploading a
legitimate sibling file (`./assets/template.html`), counted as "not measured"
rather than as a product failure.

**A corpus runner now pushes real artifacts through the real product**
(`od-lab-present/src/run-open-design-corpus.ts`). First run: 40 templates
nobody wrote for a test — decks, landing pages, dashboards, animation, canvas,
real sibling resource graphs — 39 rendered, 0 white, 1 harness error. Shape
coverage went from 3 to 39 in one run. Artifact source is pluggable: a local
directory needs no credentials, the R2 corpus needs Langfuse metadata that only
CI holds.

**Corpus patrol context.** The 50k-sample patrol measures artifacts WITHOUT the
product (`page.goto` against an isolated origin; the workflow never checks out
open-design). It is not a before/after for this branch. It also never ran on a
schedule because `private-preview-patrol.yml` lives only on
`feat/main-preview-patrol` — a `schedule:` trigger fires only from the default
branch, so the cron could never have run regardless of
`PREVIEW_PATROL_ENABLED`. Enabling that variable alone does nothing until the
workflow is merged to main.

### Found by automation and fixed: the presentation black flash

Entering presentation flashed black for ~350 ms on roughly one attempt in six.
The gates showed `navigationCount: 0`, `frameLoads: 0` and `continuity:
preserved` throughout, so nothing reloaded — the flash was pure compositing.

`.viewer.is-tab-present .viewer-body` changed layout (`position: fixed; inset:
0`) and painted `background: #000` in the same rule, so the opaque ground
composited before the document repainted into its new box. Proven, not
reasoned: making the ground transparent removed the flash in six runs out of
six, and the probe was reverted before designing the fix.

The ground is not decoration — a slide whose aspect ratio does not fill the
window needs it for letterbox bars — so it is delayed rather than dropped.
`runtime/presentation-backdrop.ts` decides when it may paint, and
`.is-present-settled` carries it a frame after promotion.

Leaving is the mirror image and needed its own half: `closeInTabPresentation`
dropped both classes together, so the ground was still opaque when the layout
returned to normal. Fixing only entry left a ~337 ms flash on exit, visible in
the very next eight-run batch. The ground is now dropped before the layout
change.

This one is worth noting for how it was found. Every step — the 1-in-6 rate,
the CSS rule, the proof, and the second half nobody would have predicted — came
from measurement. Nothing in it came from reading the code and reasoning, which
on this surface produced seven wrong causes earlier in the same session.

### The blank flash has one root cause, and only its amplifier is fixed

Measured across every transition the lane exercises, all with `navigationCount:
0` and `frameLoads: 0` — the document is never replaced:

    entering presentation   ~1 in 6    ~350 ms
    leaving presentation    ~1 in 6    ~340 ms
    file-tab round trip     occasional ~339 ms
    project round trip      occasional ~1353 ms
    LRU restoration         occasional ~317 ms

Nothing reloads. The preview frame is relocated to a new host with
`moveBefore()`, which preserves the browsing context but still forces the
browser to recomposite, and for a frame or more the new box is empty. Every
transition above relocates the frame, which is why the same signature appears
in all of them.

**Fixed: the amplifier.** Presentation additionally painted an opaque black
ground on the element whose layout was changing
(`.viewer.is-tab-present .viewer-body`), so the empty frame read as solid
black. The ground now lives on `.present-backdrop`, its own fixed layer whose
box never changes, mounted with the presentation and faded in once the document
has painted. Three full rounds, nine case-transitions, 0 ms.

That fix took four attempts, and the first three are worth not repeating:
delaying the ground by one frame fixed entry only; dropping it before the
layout in the same handler did nothing, because React batches both state
updates into one commit; two `requestAnimationFrame`s survived eight
deck-only runs and then flashed on the very next FULL run, where deck is the
third case and the browser is busier. All three were attempts to TIME the
ground against a reflow, which is a bet that loses whenever load changes. The
fourth removes the possibility instead of lowering its odds.

**Not fixed: the relocation flash itself.** Without an opaque ground the empty
frame shows the page background rather than black, so it is less visible but
still measurable — that is what the file-tab, project and LRU numbers above
are. Fixing it properly means changing what the frame shows while it is being
relocated (holding a paint snapshot across the move, or delaying the host swap
until the destination has painted), which touches every preview path in the
product. That is an architectural decision, not a patch, and five separate
one-off timing fixes would repeat exactly the mistake documented above.

Recommendation: treat it as one item, decide the approach deliberately, and
keep the per-transition blank budget in the lane as the regression witness —
it is what surfaced this in the first place.

### Found by automation, not fixed

* **A save re-navigates other open files' previews.** `own=1,
  foreign=['lru-5.html','lru-6.html']`, and the edit gate shows the same
  collateral, so editor saves are affected too, not just plain file writes.
  Needs the product decision on narrowing the wildcard by changed-file type.
* **The entry nav rail's credits menu covers the viewer toolbar.** It opens on
  hover, so resting the pointer on the left rail makes Edit and Comment
  unclickable — `span.entry-nav-rail__menu-credits-plan` and
  `div.entry-nav-rail__menu-credits-head` were both caught intercepting real
  clicks. The lab moves the pointer away rather than force-clicking, so a
  genuine overlap stays visible.
* **Uploading a legitimate sibling file can 500.** `./assets/template.html`
  was rejected by the daemon during a corpus run. Not investigated.
* **Manual Edit save is intermittently lost** (roughly one run in six). The
  driver confirms the edit reached the document before leaving edit mode, so
  the loss happens after. A disk-side witness (`savedContentPersisted`) was
  added to separate "the write never landed" from "it landed and the view
  reverted"; measurement in progress.

### Method note

Building these gates produced three wrong controls in a row, each of which
reported a product failure that did not exist: `.first()` resolved a hidden
per-tab copy of the toolbar; the document was checked before the panel draft
had been committed; the panel's own Save was never clicked. Together with the
six wrong causes earlier in the session, the pattern is consistent enough to
state plainly: **a new gate's first red is more likely to be the gate than the
product.** Every gate here therefore carries a control that fails loudly when
it measured nothing, and `unavailableReason` is never counted as a product
verdict.

The same rule applied to a blank-interval failure: the fixture had grown a
2200px painted block, which lengthened every re-attach repaint. Raising the
budget would have turned the observation off, so the paint cost was removed
instead (`min-height` costs layout, not pixels) and the interval returned to
0 ms across four runs while scroll stayed observable.

## Where this stands for handoff

Green on this branch: `pnpm guard` 0, web typecheck 0, daemon typecheck 0,
daemon build 0, 363/363 FileViewer, 22/22 lab adapter. L2 passes fail-closed
per case (`ordinary-html`, `relative-support-assets`, `deck-runtime`).

Not done, in the order I would pick them up:

1. **Collateral preview refresh — needs a product decision, not code.** A save
   re-navigates other open files' retained previews: measured
   `own=1, foreign=['lru-5.html','lru-6.html']` for a single save. Cause is the
   project-wide content-refresh wildcard (`ProjectView.tsx:4087-4092`, folded in
   via `Math.max` in `FileWorkspace.tsx:3396-3401`) plus `evictProject` on every
   file event. The wildcard is deliberate and defensible: a changed asset can be
   a dependency of any open page and real dependency analysis is not feasible
   (dynamic `import()`, `fetch`, CSS `url()`, JS-built URLs). The cheap split
   that needs no analysis is by *type* of the changed file — keep the wildcard
   for assets, scope an HTML file's own change to itself. The codebase already
   draws that line for `add` events. Residual risk is narrow and nameable: page
   A iframes page B, B changes, A does not refresh. Do not ship this without the
   call being made.
2. **Fullscreen entry is still unverified**, not broken. The CDP-driven context
   cannot be granted fullscreen at all (a direct
   `documentElement.requestFullscreen()` with a user gesture fails
   `TypeError: not granted`), so this needs a hand-driven browser. Everything
   around it is verified: overlay layering, chrome hiding, exit, and zero
   navigations.
3. **`edit-save-reenter` and `comment-inspect-selection`** remain the two
   pending L2 matrix gates.

Method note worth keeping: on this surface, reading the code has now produced
five confident wrong causes (`.file-versions` watcher events, the automatic
remint budget, the speaker-notes popup, a stale `activeDeckSlideIndex` closure,
a stale `modeStateRef`). Every one survived review and died on the live product.
What actually resolved things each time was making the harness say what it
saw — frame inventory, navigation identities, per-writer traces. Instrument
first.

**Presentation gate — now passes live** (`od-lab-present` 647891f). Three
Tier-1 defects were fixed statically first, which is why the first live run was
usable: no settle between the version write and the presentation baseline; the
three identity equalities carrying the same blind spot the round-trip verdicts
had just fixed; and `frameLoads` counting inert standby/`about:blank` events.
Live result: `presentationEnter`/`presentationExit` both `navigationCount: 0`,
`documentRequests: 0`, `frameLoads: 0`, `continuity: preserved`.

**Real-browser pass — the convergence claim holds.** Driving actual Chrome
through the Present menu, across two full round trips: `sameNode`,
`sameBrowsingContext` (`contentWindow` identity), `sessionUnchanged`,
`srcUnchanged` all true; the overlay is transparent `pointer-events:none` at
z-1060 over the promoted preview at z-1050 on black; toolbar `display:none`;
exit control present; overlay owns no iframe and the preview iframe count never
left 1; zero new first-paint beacons on the first round trip.

**Fullscreen entry remains UNVERIFIED — not broken.** The Fullscreen menu item
left `document.fullscreenElement` null even under a real trusted click. The
control settles it: a direct `document.documentElement.requestFullscreen()`
with a user gesture also fails with `TypeError: not granted`, so this
CDP-driven context cannot enter fullscreen at all. Nothing about the product is
established here either way; it needs a hand-driven browser.

**Convergence sweep — every remaining `srcDoc` in `apps/web/src` is accounted
for.** Swept after the five FileViewer surfaces landed, so "did we actually get
all of it" has an answer rather than a memory:

* *Live preview documents* — converged. The only `srcDoc` left in a live
  preview path is `preview-modal-transport.ts`, and it is already URL-first with
  two **typed** fallback reasons: `no-document-url` (the caller holds HTML and
  no URL that serves it) and `deck-runtime-unavailable`. The second names a real
  upstream blocker — the catalogue preview routes (skills / plugins / design
  systems) do not mint preview sessions yet, and deck paging is a capability
  negotiated after navigation — so it is a tracked dependency, not an oversight.
  `PREVIEW_MODAL_BRIDGE_TOKENS` is pinned to exact parity with what
  `buildSrcdoc` installs, so the transport swap can neither smuggle in nor drop
  runtime behavior.
* *Thumbnails, covers and showcases* — `DeckThumbnailRail`, `DeckSlideThumbnail`,
  `DesignFilesPanel`, `RecentProjectsStrip`, `DesignKitView`, `ExamplesTab`,
  `CommunityTemplatePreview`. These are off-screen, non-interactive renders that
  own no live state, which the transport module's own docstring explicitly
  sanctions. They are **not** convergence debt and should not be migrated.

**End-to-end status.** L2 ran against the real product for the first time — the
CI lane exercises a hand-written fake product shell, so this was the first
verifiable artifact from the real one. Warm: three cases, zero failures,
`capabilityAcknowledged` / `runtimeWitnessPassed` / `intermediateLoadsPassed`
true throughout, and frame/session/documentVersion all reused across a project
round trip. Two matrix entries remain pending upstream:
`edit-save-reenter` and `comment-inspect-selection`.

**PR #7353 is still process-blocked, not code-blocked.** CI green on the last
checked head, 25 of 26 threads resolved, and the `CHANGES_REQUESTED` sits on a
stale commit whose three blockers are all fixed. The reviewer has exhausted the
PR's REQUEST_CHANGES allowance and can only leave COMMENT, which never clears
it. Nothing in the code can lift it.

---

## What one save is allowed to disturb — resolved (2026-09-05)

Item 1 above is closed, and the answer turned out to be bigger than the
wildcard. The wildcard was a symptom.

**What was actually happening.** Saving one HTML file re-navigated the retained
previews of every other open document. `OD_L2_TRACE_NAVIGATION=1` (new, in
`od-lab-present`) shows why the count alone was never enough to say: the
reloaded documents came back with an **unchanged content hash and a brand-new
preview session**, so they were reloaded by bookkeeping, not by content.

One user-visible save reaches the file watcher as three writes, and only one of
them is user content:

| write | what it is | old effect |
| --- | --- | --- |
| `.file-versions/<hash>/manifest.json` and the snapshot | daemon version history | project-wide refresh |
| `<name>.artifact.json` | generated metadata for one artifact | project-wide refresh |
| the document | user content | project-wide refresh |

Each of those advanced the project wildcard, so a single save minted a new
document identity for every open preview — three times over.

**The fix, in three layers.**

1. `apps/daemon/src/project-watchers.ts` no longer surfaces changes inside the
   daemon's reserved bookkeeping directories, and it sources that set from
   `RESERVED_PROJECT_FILE_SEGMENTS` in `projects.ts` — the same set the write
   API already refuses user writes into — so the two cannot drift apart.
2. `artifactManifestSubjectPath` (`apps/web/src/artifacts/manifest.ts`)
   attributes a `<name>.artifact.json` change to the document it describes.
3. `handleProjectEvent` scopes an HTML document's own **edit** to itself.
   Appearing and disappearing files keep the project wildcard, because a
   reference that just started or stopped resolving leaves an open page showing
   real breakage that only a reload repairs — and `ProjectView.pendingPrompt`
   already had a spec pinning exactly that for a nested HTML dependency being
   added. The retained-frame pool follows the same rule, so a scoped change no
   longer evicts parked browsing contexts that did not change.

**Result, live:** every transition in the matrix now reports
`foreignNavigationPaths: []`, including the save and the Manual Edit round trip.
`assertEditRoundTrip` gates on it, so it cannot silently come back.

**Residual risk, narrow and nameable:** page A embeds page B, B is edited, and A
keeps showing the previous B until anything else in the project changes or A is
reloaded by hand.

### Two harness faults that were reporting product defects

Both were found by running the full matrix rather than one case at a time.

* **`deck-runtime` selection and Manual Edit reported "no selection target".**
  The fixture's `#edit-target` lived only on slide one, and the presentation
  round trip leaves the deck on a later slide — so the harness was clicking
  something legitimately off screen and blaming the product. Every slide now
  carries its own target, the selector takes the visible one, and the round trip
  refuses to report a product result when the target is not visible.
* **The scroll gate failed every deck.** It required a scroll position greater
  than zero, and a deck is one viewport-high slide at a time — genuinely
  unscrollable. Applicability is measured now instead of assumed.

Baseline discipline mattered here: both symptoms reproduced with this branch's
web changes reverted, which is what separated them from the fan-out work.

### Still open

**`deck-runtime` Manual Edit exit provisions the same document twice.**
`ownNavigationCount: 2`, both navigations carrying the *same* documentVersion
(`sha256:5ab5079…`) 130 ms apart with different session ids. Ordinary HTML is
`0` on the same path, so this is specific to the deck route, and it is a double
provision rather than a content change. Not diagnosed further; the trace flag
above is the tool for it.

**`./` project file paths** returned 500 on write until `427ee934fc`. Found by
scaling the corpus from 165 to 400 real artifacts — the design-system `DESIGN.md`
files reference siblings as `./name`, which no synthetic fixture did. Verified by
re-running the same 400 artifacts: 12 harness errors → 0, 400/400 rendered.

### Method note, extended

The five wrong causes from reading code are now eight — add the `.file-versions`
watcher events (right family, wrong member), a project-wide source-snapshot
invalidation, and the legacy `filesRefreshKey` re-navigation. All three were
disproven by disabling them one at a time against the live product and watching
the symptom survive. What found the real cause was recording the *inputs* to
scope minting per file and watching `content-refresh:0` become
`content-refresh:1` on a file nobody touched.
