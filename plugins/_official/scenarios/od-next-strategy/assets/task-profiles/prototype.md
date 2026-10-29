# OD Next Prototype Task Profile v3.1.9

> Rollout: active

Task routing, clarification, Build, and the ship-on-write boundary follow the
general orchestration Skill. Use profile fields and delivery requirements as design guidance in the
readable plan; do not serialize them into a machine contract.

## Applicability

Apply this profile only to the parts of the current request that call for this
kind of deliverable. The Core instruction order applies: explicit user scope
and format outrank these defaults. An independent media or document request
does not require this profile's HTML source, page structure, or export workflow.
Keep the normal HTML requirements when building the corresponding prototype,
deck, marketing layout, or HyperFrames composition. Do not add a wrapper merely
because this profile is loaded.

## Profile fields

Resolve product surface and target device, audience, primary flow, required
screens and interactions, fidelity, baseline artifact, content locks, brand
references, and required output format. Put the resolved palette, type scale,
spacing, component language, icon family, interaction states, and motion rules
in the shared Design Spec.

Never silently omit a missing field: decide per the general orchestration
Skill whether to enter the clarification stage, or convert the gap into an
explicit assumption with its risk disclosed in prose. When fidelity is
wireframe or low-fi, content and interaction-state requirements downgrade to
structural sketches and the visual-direction rules below do not apply; when
fidelity is unspecified, default to high fidelity.

Quality focus: information hierarchy, interaction clarity, flow completeness,
visual consistency, responsive behavior, and reference adherence.

## Artifact contract

For prototype work, deliver editable HTML source with a stable runnable
entry. Prefer root `index.html` for a new prototype, or preserve the existing
entry when editing one. This requirement does not apply to independent media
files requested within a prototype project. Required deliverables
name the source entry and any user-requested derived package. Buttons,
navigation, forms, and primary controls implement the declared flow rather
than acting as decoration.

The default delivery is a prototype that opens, runs, and remains editable:
core flows genuinely work end-to-end from the entry point, and buttons,
navigation, and key controls are never mere decoration.

While composing source, keep DOM lookup cardinality explicit: `querySelector`
returns one element or null; `querySelectorAll` returns a collection. Do not
iterate a single-element lookup or mix the return types of selector helpers.
An initialization error must not leave seeded content and controls unbound.
When toggling `hidden`, preserve the native hidden-state rule shipped in
`layout.css`, including its `until-found` exception. Component flex/grid display
rules must not reveal hidden dialogs, validation messages, or empty states.
Keep native dialogs without `open` invisible even when their component class
uses flex or grid; opening and closing must preserve the native dialog state.
Keep untouched and successfully reset forms free of error messages; show a
field error only after the user validates an invalid value. Results and their
empty state must never appear at the same time.
Keep handler, label, and validation-feedback selectors consistent with the IDs
actually rendered in the markup. Do not derive feedback IDs by mixing input
and field naming schemes. Optional feedback nodes must be null-safe; a missing
message element must not throw or block an otherwise valid state update.
For controls inserted or replaced by a renderer, delegate events from a stable
ancestor or bind after insertion. An initialization-time lookup cannot bind a
detail or cart action that does not exist yet. Reopening a view must retain a
working handler without accumulating duplicate actions.

Writing the primary HTML deliverable to disk IS the delivery: no opening, no
previewing, no walkthroughs, no second pass of any kind after the write. Meet
the quality floor below in one pass, while writing the source. Report
completed when the required deliverables exist and match the contract;
disclose any residual quality risks in the prose summary — they do not change
the outcome.

## Build Requirements

Global priority follows the Core System Prompt; this profile establishes no
ordering of its own. Where upper-level instructions and contracts are silent:
modification tasks continue the confirmed brand, design system, and existing
design language; user references apply only within their designated scope;
and this profile's defaults fill only what is left unspecified.

### Hold a clear design direction

- Form one unified visual direction from the product's goals, users, usage
  context, and reference assets; in new artifacts, type, color, spacing,
  corner radii, graphics, and motion must all serve a single product
  character.
- When modifying a baseline artifact, continue its design language first and
  preserve existing routes, component conventions, and authorized scope;
  unless the user explicitly asks, never casually redo or accidentally alter
  locked content, user-specified assets, or unrelated regions.
- **Anti-cliché rules:** apply the core anti-cliché defaults strictly — no
  warm beige / cream page grounds by default, no stock UI faces as display
  type, no purple-gradient washes. Additionally avoid gradients, glass
  effects, neon glows, oversized corner radii, and decorative card stacking
  that have no business justification; and never ship product artifacts that
  expose designer or presenter controls — viewport selectors, platform
  toggles, demo panels, and generated-design metadata are not app UI.
- **Style-direction inference examples:** government / exam-prep products lean
  calm, credible low-saturation blue-greens with restrained detail; tools /
  productivity lean neutral high-contrast minimalism; children / education
  lean bright rounded shapes with an illustrated feel. Without a brand, pick
  by scenario and vocalize the choice in one sentence.

When task configuration provides the following values, execute them and
record them in the Design Spec:

- **Visual style** sets the palette's character, the type pairing, and
  corner-radius and shadow intensity; the chosen style never exempts the
  anti-cliché rules above.
- **Information density** sets the spacing tier: relaxed 24–96px, standard
  16–64px, compact 8–32px; compact never means shrinking type sizes or
  flattening the whitespace hierarchy.
- **Motion intensity** sets the motion scope: restrained does state feedback
  only; standard adds transitions and list entrances; rich may use
  scroll-driven and multi-element choreography. All three tiers stay within
  the baseline duration limits and must support reduced-motion.

### Build a clear information hierarchy

- Make the page's goal, main content, and primary action visible at first
  glance.
- Build hierarchy with type size, weight, color, whitespace, alignment,
  contrast, and position — never with borders, cards, or decoration alone.
- Keep complex pages to a stable reading order and stable visual anchors.

### Design complete interaction states

- Give key actions clear clickable affordances and result feedback, and
  handle default, hover, focus, selected, loading, empty, success, failure,
  and disabled states wherever the declared flow needs them.
- Modals, menus, drawers, and page transitions have explicit enter, exit, and
  return paths.
- Prefer a native `<dialog>` with `showModal()` for modal forms. Place initial
  focus after the dialog is visible, not while an entrance animation hides it.
  On every close path, return focus to a live control: after rebuilding a list,
  find the new trigger by its stable item ID; if that item is no longer visible,
  focus the primary action rather than a detached node.
- Inline actions that rebuild or move an item also restore focus to the newly
  rendered equivalent control, with a visible fallback if a filter removes it.
- Drive button-based view changes and success redirects from local state and
  invoke the view renderer directly. Do not depend on assigning `location.hash`
  or native document navigation to update the view in a sandbox. URL metadata
  is optional; a rejected URL update must not block navigation, committed
  results, or a return path that preserves the user's filters.
- Commit each local mutation to the same state that renders the interface;
  derive lists, filtered results, totals, availability, and chart labels from
  that committed state before showing success. Saving a copied list alone
  must not leave the visible list or its summary stale.
  Refresh every mounted view of changed values, including a review page behind
  a drawer or editor, and invalidate confirmations based on older values.
  Closing an editor must not reveal a stale review; final confirmation uses
  the same current values that the user sees in that review.
- Derive status wording from the same values as the displayed totals. Distinguish
  no records, zero net, positive net, and negative net; zero must not be called
  a positive balance or growth. Empty periods show an honest empty state,
  without stale chart segments or invented percentages.
- Hot-search suggestions and typed searches use the same matching rules.
  A visible suggestion must find its intended existing content, including
  when the suggestion abbreviates a longer title. Clearing search restores
  the applicable list and filters.
- Prototype actions must work inside the product's sandboxed preview without
  native form submission or navigation. For local add/save actions use a
  `type="button"` click handler and an Enter key handler that invoke the same
  local update; do not depend only on a form submit event. Keep an in-memory
  fallback when localStorage is unavailable, and do not promise persistence
  in a preview that blocks storage. Do not weaken the host sandbox.
- Use semantic controls, visible keyboard focus, accessible names, useful alt
  text, non-color status cues, and reduced-motion behavior.
- Motion exists only to explain state change, hierarchy, or the result of an
  action — never as purposeless decoration.

### Fit the real usage environment

- Mobile: prioritize touch reach, one-handed use, content scrolling, and
  system safe areas; tap targets no smaller than 44×44pt, with ≥8px between
  adjacent targets.
- Web applications: prioritize varying window widths, content reflow, and
  keyboard-and-mouse operation; give clickable elements a pointer cursor and
  hover feedback.
- Landing pages: establish a clear narrative order that surfaces the core
  value and the primary call to action early.
- Responsive layouts organize breakpoints at 375 / 768 / 1024 / 1440,
  reorganizing content rather than scaling the whole page; adapt at each
  breakpoint without hiding essential actions or breaking reading order;
  mobile never scrolls horizontally and never disables zoom.
- Fixed headers, bottom bars, and floating controls reserve matching padding
  for the content they cover.

### Handheld device shell

When the target device is a phone — the brief names iPhone / iOS, Android, or
a mobile / 手机 app without naming a platform — the prototype ships inside the
bundled handset shell, never a hand-drawn approximation of one. Open Design
stages the shells at `.od-frames/` in the project directory and, when it
resolved the platform, names the selected shell in the `device-frame` context
fact and quotes its source in `device-frame-shell`.

| Brief names | Shell |
|---|---|
| iPhone, iOS, SwiftUI, UIKit, App Store | `.od-frames/iphone.html` |
| Android, Material, Pixel, Galaxy, HarmonyOS, APK | `.od-frames/android.html` |
| A phone / mobile app with no platform named | `.od-frames/neutral.html` |
| Web app, landing page, responsive site, desktop app, tablet | no shell — the page is the product |

- Use the selected shell's markup and CSS as the document skeleton and put
  the product inside the `APP CONTENT START` / `APP CONTENT END` slot; the
  app mounts in `.phone-content` and nowhere else.
- Keep the shell's `--phone-*` declarations in a separate `:root` block from
  product tokens. Preserve the bundled `var(--phone-*, fallback)` values in
  the shell CSS: replacing product tokens must never collapse the handset's
  width, height, bezel, or safe areas. Do not depend on the preview host to
  supply these values.
- Start a new handheld output by copying the entire selected shell file to the
  requested HTML entry, then replace its APP CONTENT slot and add scoped product
  styles and behavior. Do not reconstruct the shell from memory or copy only
  its body: its head styles, safe-area variables, system chrome, and responsive
  fallback are required together. Keep them intact when adding layout.css.
- One handset persists across the whole prototype. Screen navigation and hash
  routes swap the content inside the screen; a new handset per route appears
  only when the user asks for a side-by-side board.
- Keep the shell's hardware and system chrome intact: metallic bezel, outer
  radius deeper than the screen radius, side keys, the platform's camera
  treatment, SVG status glyphs with a clock, and the home indicator as the
  last visible system element. A `border: 1px solid` + `border-radius: 24px`
  card is not a phone.
- The app scrolls inside `.phone-content` while the handset stays fixed, and
  content honors `--phone-safe-top` / `--phone-safe-bottom` so nothing sits
  under the status bar or the home indicator.
- The shell is presentation, not a design system: it sets no typography,
  palette, spacing, components, or navigation for the app. Never put an
  Android app in the iPhone shell or the reverse.
- Sheets, dialogs, toasts, and scrims mount inside the shell's screen, often
  outside the app's own wrapper, so the product's design tokens live on
  `:root` — never on an inner wrapper where an overlay cannot inherit them.
- Keep the shell's narrow-viewport fallback (below 480px the handset chrome
  collapses and the screen fills the viewport) so the artifact still meets
  the 375px rule above.

### Variable-length text and stacked information

Open Design stages `.od-frames/layout.css` beside the handset shells and
quotes it in the `layout-primitives` context fact. It is structure only —
display, flex/grid, overflow, wrapping, ratio, and opt-in icon geometry — and
sets no palette, type, spacing scale, or component look. Put the whole block
into the document's own `<style>` as its first rule set (`@layer od-layout`
must come first so the product's ordinary layout CSS wins). Its native hidden
and closed-dialog rules deliberately take precedence over component display
declarations; keep those rules intact along with the
`OD-LAYOUT-PRIMITIVES v1` marker comments, and compose the shapes below from it
instead of re-deriving them per card, row, tile, or chip.

Preserve `[hidden]:not([hidden="until-found" i]) { display: none !important; }`
from the bundled block. Use `hidden` for inactive screens, empty states,
dialogs, and scrims; remove it only when showing that element. Component
`display: flex/grid` must not make a hidden element visible. For exit
animations, animate with a state class before setting `hidden`; do not override
the hidden rule. Keep `hidden="until-found"` available for browser find-in-page.

Two kinds of text, two treatments:

- Authored copy — headings, taglines, chip labels, button labels, tile and
  section titles — is written to a length budget and never truncated or
  clamped: chip ≤ 4 汉字; tile name ≤ 5 汉字 at ≥ 14px; tagline over media 1–2
  lines of ≤ 12 汉字; button label one line. When copy does not fit, shorten
  the copy or change the container; a slogan with an ellipsis is not a design.
- Data text — names, addresses, descriptions, reviews, anything from the
  user's data — may truncate (`.od-truncate`) in lists, chips, and rails, or
  clamp (`.od-clamp-2/3`) in cards; in confirmation, order, and detail screens
  it wraps in full. A truncated value stays reachable by tap (expand, sheet, or
  the detail screen) — `title` alone is not a mobile path.
- Never truncated, clamped, or wrapped: prices, times, quantities,
  availability and status, the primary action label, errors.

| Content | Container | Shape |
|---|---|---|
| Numeral + caption | stat strip, hero stats | `.od-stat` — numeral above, caption below, each its own block |
| Label + helper text | settings row, form row | `.od-row > .od-field.od-fill + control.od-fixed`; helper is a block under the label, ≤ 2 lines |
| Weekday + day + availability | date rail cell | `.od-cell` — three blocks; sold-out dims the whole cell and keeps its text (约满 / 余 2) |
| Commerce / service card | list row, 2–3 column tile | `.od-tile > .od-media + body`: name ≤ 5 汉字 one line; selling points as ≤ 3 tag chips, not a 2-line description; price `¥98起` (起 smaller, attached) in `.od-nowrap`, on the name line or lower-right — never wrapped. Media: bare `.od-media` keeps the photo's full frame (product shots, covers, artwork); only a deliberately uniform tile crop sets `--od-ratio` **and** adds `.od-media-cover` together |
| Chip rail | filter bar | `.od-rail` — the next chip peeks at the edge; chips ≤ 4 汉字; anything longer is a list row |
| Screen chrome | top bar / content / bottom bar | `.od-screen > header + .od-scroll + footer` — bars take their own space, the middle scrolls, no height constant reused as padding; a translucent overlay bar is an explicit choice with `backdrop-filter` and the hero as first child |
| Centring placeholder in a bar | top bar | `.od-spacer` sized like the opposite control — never an empty button |
| Rarely needed explanation (fees, terms) | beside a label or price | a ≥ 44px ⓘ control that opens a sheet on tap (hover only under `@media (hover: hover)`); selling points and guarantees are chips or a guarantee row, not hidden detail |

Everywhere: one piece of information is one block-level line — sibling
`<span>`s never carry two pieces, inside a `<button>` included; `width`,
`height`, `min-height` go only on elements already declared block or flex; a
number and its unit, a price and 起, a date and its weekday sit in
`.od-nowrap`; short CJK labels use `.od-keep` with `<wbr>` at the phrase
boundary (精油洗护`<wbr>`SPA) so a break never lands inside a word;
pointer-only styles live under `@media (hover: hover)`. An `<img>` keeps its
`width`/`height` attributes for layout stability and `.od-media` sizes it —
never a CSS height on the image. A card, tile, or row built on `<a>` sets its
own `color` and `text-decoration: none`; browser-default link styling never
reaches product UI.

### Render charts as real graphics

- Keep SVG drawing elements inside an actual `<svg viewBox="...">` root. When constructing them from JavaScript, use `document.createElementNS('http://www.w3.org/2000/svg', ...)` or insert SVG markup into an existing SVG root; never inject bare `path`, `line`, or `text` elements into an HTML `div`.
- Give the chart a visible viewport and explicit dimensions. Keep plotted marks, axes, and labels within that viewport at the intended screen sizes; an empty chart container is not a rendered chart.

### Bound functional icon geometry

A `viewBox` defines internal coordinates; it does not set rendered size.
Treat functional inline SVGs as one component contract before writing markup:

- Every producer for UI glyphs — an `icon()` helper or direct inline markup —
  emits `<svg class="od-icon" ...>`; never emit a bare `<svg>` that relies on
  `viewBox` alone for layout geometry.
- Copy the staged `.od-icon` primitive into the artifact. Its default size is
  `1em`; set `--od-icon-size` on the icon or a semantic modifier when another
  size is needed. The icon owns this geometry — never scatter sizing across
  parent selectors such as `.menu-item svg` or `.card-meta svg`.
- Apply this opt-in contract to UI glyphs such as menu checks, location pins,
  arrows, status marks, and control icons. Content SVGs — charts, plans,
  diagrams, logos, maps, and illustrations — keep their own explicit geometry;
  never size them through `.od-icon` or a global `svg` rule.
- Classify by the role the SVG plays on the page, not by its canvas size and
  not by whether it carries a `viewBox`. A logo stays a content SVG even
  inside a button or a nav bar; a deliberately large UI glyph stays functional
  and takes its size from `--od-icon-size`.

### Keep dynamic structure and data separate

For dynamic UI, prefer separating DOM structure from data. Use `textContent`
for plain text and DOM properties or `setAttribute` for attributes. When
generating HTML, prefer template literals with `${...}` for complex fragments
instead of long concatenation chains with nested quote delimiters; escape data
for its insertion context. Reuse a render function for repeated fragments only
when their structure and meaning match. Keep simple code simple; do not add
abstractions solely to follow this guidance.

### Design usable forms and feedback

- Every input has a persistently visible label — never a placeholder standing
  in for one; required fields are clearly marked.
- Error messages appear next to the offending field and explain the cause and
  the remedy — never just "invalid input"; with multiple errors, give a
  summary at the top that links to each field.
- Validate on blur, not on every keystroke; show a loading state during
  submission and success or failure feedback when it ends.
- Reveal complex options progressively instead of dumping every field on the
  first screen; keep high-frequency actions prominent, keep dangerous actions
  visually distinct, and require a confirmation step before destructive
  actions.
- Empty states explain why they are empty and what to do next — never a blank
  screen.

### Organize predictable navigation

- Bottom navigation holds at most 5 items, icons paired with text labels; the
  current location has an obvious selected state.
- Never mix bottom navigation, a sidebar, and top tabs at the same level;
  prefer a sidebar on large screens and bottom or top navigation on small
  ones.
- Back behavior is predictable: returning to the previous level restores
  scroll position and entered content — never a silent jump back to the home
  page.
- Modals and drawers have an explicit way to close; never use a modal to
  carry primary-flow navigation.
- Navigation stays in the same place across pages; it does not move with page
  type.

### Control perceived performance

- Declare image width/height or aspect ratio, and reserve space for async
  content so nothing shifts after it loads.
- Waits over 300ms get a skeleton screen or progress indicator — never a long
  blank or a bare spinner.
- Lists longer than 50 items paginate, virtualize, or load in batches.
- Animate only transform and opacity; never touch width, height, top, or
  left.

### Use real, consistent content

- Prefer user-provided copy, images, brand assets, and real data.
- Without real data, use plausible example content consistent with the
  business — never meaningless placeholder text; keep names, dates, numbers,
  and states consistent.
- Images, icons, and illustrations match the content's meaning and keep a
  unified style.
- Match localized images to their visible subjects: do not relabel an unrelated image as the requested place or object. If an exact image is unavailable, use a clearly disclosed neutral placeholder rather than a misleading photograph. User-approved placeholders still distinguish the kinds of objects shown.
- Never fabricate brand facts, feature promises, or business data the user
  has not provided or confirmed.
- **Imagery:** follow the Core imagery-by-type rule for every image in the
  interface, localized into the project.
- **Demo content defaults to real referents:** sample data in a prototype
  defaults to real, well-known entities with their real fetched images — a
  bookshelf shows real books with real covers; a music app shows real albums
  with real art. Fictional stand-ins are the exception: use them only when
  the user asks for fictional content or licensing forbids real assets, and
  disclose the substitution in the delivery notes. Do not de-realize demo
  content to avoid the fetch. How generic categories such as dishes are
  sourced is decided by the Core imagery rule, not by this default.

### Quality floor

Meet the following in one pass, while writing the source:

- Font references resolve; layout carries no overflow or clipping risk;
  alignment structure is complete.
- Image geometry holds: containers for localized images take their ratio from
  the measured intrinsic dimensions and render the full frame; cover-cropping
  is reserved for decorative backdrops, and no content-bearing image is
  cropped or distorted.
- Functional icon geometry holds: every inline SVG UI glyph carries `.od-icon`
  at its producer, takes size from `--od-icon-size`, and never depends on a
  parent-context or global `svg` sizing rule; content SVGs stay outside this
  primitive.
- Layout mechanics hold through the staged primitives: every stacked-text
  box, truncation, chip rail, and screen bar is composed from the
  `layout-primitives` classes per the text treatment table above; sibling
  content regions never overlap, flow content stays in normal flow, and
  nothing reuses a chrome height constant as content padding.
- Every step of the core flow is genuinely implemented; buttons, navigation,
  and key controls are bound to real behavior, not decoration.
- Responsive breakpoints cover 375px and wide screens; no horizontal
  scrolling; fixed bars reserve padding for the content they cover.
- Pick colors for ≥4.5:1 body-text-to-background contrast; pick dark-mode
  colors independently.
- Set both foreground and background on primary controls, including hover,
  focus, and disabled states; inherited body text must not disappear into a
  dark action fill. Keep supporting text readable in inverse-color sections.
- Primary interactions are keyboard-reachable, with focus styles and focus
  order explicitly defined in the source.
- Locked content, user-specified assets, and non-target regions stay
  untouched — no incidental edits.

## Build Packages

Use simple mode for a cohesive flow that benefits from one context. Complex
mode may split only when the general orchestration Skill's independent-output
conditions are met, and only along independently deliverable feature loops,
roles, or device surfaces after navigation, content locks, and the Design
Spec are frozen. Do not split one interaction loop across Children.

## Discovery scope

Apply these requirements only to this output. Reuse the complete same-version Skill already in context; read it when absent. Companion deliverables follow their own Skills. Keep the requested output scope and ordinary prose plan; no machine contract is required.

For handheld prototypes, use the appropriate existing shell in .od-frames/ (iphone.html, android.html, neutral.html) and read .od-frames/layout.css for layout primitives. Preserve existing artifacts and user-edited shells.
