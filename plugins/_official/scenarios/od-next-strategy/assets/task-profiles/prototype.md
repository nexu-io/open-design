# OD Next Prototype Task Profile v2.1.0

> Rollout: active

Task routing, clarification, Build, and the ship-on-write boundary follow the
general orchestration Skill. Profile field semantics, required-field rules,
and the artifact contract bind to the V2 machine contract at the recorded
taskProfileVersion; this file is the prototype projection of that contract.

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

The canonical deliverable is editable prototype source with a stable runnable
entry. Open Design resolves that entry by looking for a root `index.html`,
then a single root-level html file, then a single file matching the project
kind; a delivery in which none of those resolves is rejected as an invalid
canonical deliverable, so lay the files out accordingly. Required deliverables
name the source entry and any user-requested derived package. Buttons,
navigation, forms, and primary controls implement the declared flow rather
than acting as decoration.

The default delivery is a prototype that opens, runs, and remains editable:
core flows genuinely work end-to-end from the entry point, and buttons,
navigation, and key controls are never mere decoration.

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
- Keep the shell's narrow-viewport fallback (below 480px the handset chrome
  collapses and the screen fills the viewport) so the artifact still meets
  the 375px rule above.

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
- Never fabricate brand facts, feature promises, or business data the user
  has not provided or confirmed.
- **Imagery:** real entities appearing in the interface (book covers,
  products, brand marks, real places) use real images obtained via
  search/fetch and localized into the project; never fabricate them with
  image generation. For illustrative and atmospheric imagery, prefer fetched
  real photography; image generation is the fallback, spent only on the key
  visual surfaces.
- **Demo content defaults to real referents:** sample data in a prototype
  defaults to real, well-known entities with their real fetched images — a
  bookshelf shows real books with real covers; a music app shows real albums
  with real art. Fictional stand-ins are the exception: use them only when
  the user asks for fictional content or licensing forbids real assets, and
  disclose the substitution in the delivery notes. Do not de-realize demo
  content to avoid the fetch.

### Quality floor

Meet the following in one pass, while writing the source:

- Font references resolve; layout carries no overflow or clipping risk;
  alignment structure is complete.
- Image geometry holds: containers for localized images take their ratio from
  the measured intrinsic dimensions and render the full frame; cover-cropping
  is reserved for decorative backdrops, and no content-bearing image is
  cropped or distorted.
- Layout mechanics hold: sibling content regions (pills, cards, text blocks)
  never overlap and flow content stays in normal flow, while intentional
  fixed or sticky chrome (headers, bottom bars) reserves matching padding for
  the content it covers; a stat numeral and its unit (e.g. 82%) render on one
  line inside an auto-sized or clamp()-sized container, never squeezed into a
  fixed box; track-style elements such as progress bars declare block-level
  display before receiving dimensions.
- Every step of the core flow is genuinely implemented; buttons, navigation,
  and key controls are bound to real behavior, not decoration.
- Responsive breakpoints cover 375px and wide screens; no horizontal
  scrolling; fixed bars reserve padding for the content they cover.
- Pick colors for ≥4.5:1 body-text-to-background contrast; pick dark-mode
  colors independently.
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
