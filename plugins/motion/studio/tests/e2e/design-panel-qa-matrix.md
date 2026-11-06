# Design Panel QA Matrix

Campaign artifact for `docs/plans/2026-07-02-001-fix-studio-design-panel-inputs-plan.md`.
Environment: published CLI `hyperframes@0.7.26`, embedded mode (`npx hyperframes preview`
in a scaffolded `warm-grain` project outside the repo), Chrome via agent-browser.

## Step 0: demo-failure reproduction (baseline, pre-fix)

Reproduced. The demo symptom ("font size does nothing") is real, deterministic, and its
root cause is the **selection layer**, not the persist pipeline.

### S0.1 Master view: click on visible text selects the invisible top overlay

- Action: click the "Hyperframes" H1 (from `compositions/intro.html`, embedded in `index.html`).
- Selected instead: `.grain-texture` (`hf-0qtj`, label "Grain Texture"), the full-canvas grain
  overlay on `data-track-index="100"`, even though its parent `#grain-overlay-comp` has
  `pointer-events: none`.
- Panel then shows generic values (Size 16px) and a Text section with an empty Content field
  for a div that contains no text.
- Committing Size 72px:
  - signal a (disk): `index.html` changed, `<div style="font-size: 72px" ... class="grain-texture">`
  - signal b (HTTP): `POST /file-mutations/patch-element/index.html` 200, `matched:true, changed:true`
  - signal c (console/telemetry): nothing
- Visible effect: none (the styled element is an invisible overlay). This alone explains the
  demo: every click lands on the overlay, every edit applies to it.
- Bucket: **selection/hit-testing** (new bucket; persist pipeline healthy in this leg).

### S0.2 Sub-composition view: hover finds the element, click cannot select it

- Setup: open `intro` in the sidebar (Master > intro breadcrumb), scrub to t=2s where the
  title card is visible.
- Hover over the H1: teal highlight appears (hit-testing sees the element).
- Click (real mouse down/up at the text): no selection API call, no panel, no console error.
  Reproduced with element-ref clicks and coordinate clicks.
- Bucket: **selection click-to-commit in sub-composition view**.

### S0.3 Stale selection target carried across composition switch

- After selecting `.grain-texture` in Master and switching the canvas to `compositions/intro.html`,
  a subsequent click re-emitted the old target: `probe-element/compositions%2Fintro.html` with
  `{hfId: hf-0qtj, selector: .grain-texture}` (an element that does not exist in intro.html),
  followed by a selection PUT labeled "Grain Texture" with `sourceFile: compositions/intro.html`,
  then `selection: null`.
- If a patch had been committed in that state it would have written to the wrong file or
  silently no-oped (`matched:false`).
- Bucket: **selection state lifecycle across composition switches**.

### S0.4 Double-click on canvas element clears selection

- Double-click on the H1 in Master view: `PUT /selection {selection: null}`. No drill-down into
  the sub-composition, no text editing mode. Users double-click text instinctively.
- Bucket: **selection UX** (candidate: intentional-but-hostile; confirm with maintainers).

### Working in this leg

- Persist pipeline end-to-end (patch-element → linkedom mutation → disk write → 200 with
  `matched/changed`): healthy for the (wrong) selected element.
- Hover highlighting in both views.
- Panel rendering, section expansion, input commit on Enter.

### Instrumentation notes for the full matrix

- Fetch shim on `window.fetch` in the top document captures patch/probe/selection traffic
  (studio app runs in the top document; composition renders in a shadow-DOM iframe).
- Element-ref clicks work for selection in Master view; sub-composition view needs
  coordinate clicks (`mouse move/down/up`) and still fails to select (S0.2).
- Seek-slider `fill` does not move the playhead; use Play/pause or timeline clicks to scrub.
- GSAP warning noise in console: `GSAP target #a-roll not found` (from the warm-grain
  captions comp; unrelated).

## Selection-layer fixes: embedded-mode re-verification (post-fix)

Environment: locally built CLI (commit with selection fixes), embedded mode, fixture copied
to a scratch dir outside the repo.

- Click on empty canvas over the invisible full-canvas overlay: selection resolves to
  **null** (previously: selected the overlay). S0.1 fixed for real pointer input.
- Click on visible fixture text (`#qa-headline`): selects the H1 itself; panel shows real
  values (Size 48px, weight 700, content "Static Headline") instead of overlay defaults.
- Font size commit 96px: `patch-element` 200 `matched:true, changed:true`; disk gains
  `<h1 style="font-size: 96px" ...>`; preview renders 96px. The demo scenario works.
- Note for future automation: `agent-browser click @ref` on an element whose DOM box is
  off-viewport can land on the sidebar "Select off-canvas element" helper buttons and
  select programmatically, bypassing hit-testing. Use coordinate clicks on visible pixels
  for selection tests.

## Full matrix (post selection + U3 fixes, embedded mode, locally built CLI)

Instrument: scripted agent-browser runner (`matrix-runner.mjs`, session scratchpad) + interactive
follow-ups. Signals per cell: patch/gsap-mutation HTTP response, disk content, computed style,
reload survival.

### Selection (click on canvas, Inspector enabled)

| Archetype               | Result                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Static text (h1)        | selects the element itself                                                                        |
| Multi-span child (span) | selects the span itself                                                                           |
| GSAP-tweened box        | selects the element                                                                               |
| Keyframed box           | selects the element                                                                               |
| Image                   | selects the element (canEditStyles true)                                                          |
| Shape div               | selects the element                                                                               |
| Video                   | selects the element (visible only inside its clip window; hidden outside, correctly unselectable) |
| Runtime caption word    | falls back to the parent host (runtime nodes cannot persist; by design)                           |
| Sub-composition child   | selects the child with sourceFile pointing at the sub-composition file                            |

### Inputs (all persist to disk with matched:true/changed:true and survive reload)

- Text on h1: size, content, weight, line-height, letter-spacing, align, case, style. Span-self
  size also works.
- Layout on shape: W, H, rotation persist as `tl.set(...)` in the GSAP script (designed manual-edit
  path); z-index persists inline.
- 3D: rotationX persists via the `gsap-mutations` endpoint (ok:true, changed:true).
- GSAP-tweened element: Layout X persists as `gsap.set("#qa-tween-box", { x: 40 })` appended to the
  script. Works; note: a load-time `gsap.set` on an element that also has an x tween is semantically
  debatable (starting value shifts) — flag for maintainers, not a broken input.
- Timing: start persists as `data-start="0.20"` (normalized to 2 decimals).
- Video section (titled "Video", not "Media"): volume slider persists `data-volume="0.8"`;
  object-fit select persists `object-fit: cover`.
- Transparency: opacity range persists `opacity: 0.8`; blend select persists
  `mix-blend-mode: multiply`.
- Radius text input persists `border-radius: 24px`; Effects blur range persists `blur(4px)`;
  Clip overflow select persists `overflow: hidden`.
- Sub-composition child: Text size persists to `compositions/qa-sub.html` (`font-size: 48px`).

### Confirmed bugs

- **U4 child text-field escaping** (persist-level, confirmed by the headless harness test
  "documents U4 bug: child text-field style persists as escaped markup"): editing a child field of
  a multi-field element serializes markup into a `text-content` op that the server escapes.

### Notes and paper cuts (not input bugs)

- Inspector defaults OFF on a fresh embedded-mode load; canvas clicks silently do nothing until it
  is toggled on. Zero feedback for the user in that state.
- Fill color picker: opens with a hex input reflecting the current color; persist path verified
  green by the headless harness (fill style op); scripted popup commit was flaky (focus-sensitive
  popup), verified manually instead.
- Color grading section appears for img/video elements.
- Automation notes: media/timing cells must run with the playhead inside the clip window (a
  data-start edit hides the element at t=0, which is correct but confuses naive re-runs); commit
  fires on Enter/blur only when the draft differs from the last value.
