# OD Next Prototype Task Profile v2.4.0

> Rollout: active

The Core System Prompt owns instruction priority, shared visual goals, asset
authenticity, communication, and the ship-on-write boundary. The general
orchestration Skill owns task routing, clarification, and Build. Profile field
semantics, required-field rules, and the artifact contract bind to the V2
machine contract at the recorded taskProfileVersion.

## Profile fields

Resolve audience, primary flow, required screens and interactions, fidelity,
baseline artifact, content locks, brand references, and required output format.
Record the resolved palette, type scale, spacing, component language, icon
family, interaction states, and motion rules in the existing Design Spec.
Apply configured visual style, information density, and motion. Continue the
baseline's routes and design language within the authorized change scope.

Resolve product form, viewport, and frame independently from the full request,
artifacts, and conversation. Store these fields at `taskSpecific.presentation`
in the existing Plan; for Direct Edit, use the existing minimal change contract.
Add no extra machine block, classification call, or frame-confirmation round.

| Field | Values |
|---|---|
| `productSurface` | `website`, `web-app`, `mobile-app`, `desktop-app`, `tablet-app` |
| `viewport` | `responsive`, `phone`, `desktop`, `tablet` |
| `deviceFrame` | `none`, `ios`, `android`, `mobile-neutral` |
| `frameSource` | `none`, `mobile-app-default`, `user-request`, `existing-artifact` |

Viewport and device words do not determine product form or frame. Select the
frame by the rules below; `deviceFrame: none` requires `frameSource: none`.

Resolve missing fields through the general orchestration Skill's clarification
or explicit-assumption rules; do not silently omit them. Default to high
fidelity when unspecified. For wireframe or low-fi, content and interaction
states may be structural sketches at the agreed fidelity.

## Artifact contract

Deliver editable prototype source with a stable runnable entry. Open Design
resolves a root `index.html`, then a single root-level html file, then a single
file matching the project kind. If none resolves, the canonical deliverable is
invalid. Required deliverables name the source entry and any user-requested
derived package.

Implement the declared primary flow from that entry: buttons, navigation,
forms, and key controls produce their intended behavior. Keep product UI free
of generated-design metadata, viewport selectors, platform toggles, and demo
panels unless the user requested those controls as part of the product.

## Interaction and state continuity

- Make the current location, available actions, and action results clear.
  Implement the states the declared flow needs, including selected, loading,
  empty, success, failure, and disabled states where applicable.
- Keep names, values, selections, and status consistent across screens. Back
  navigation restores the relevant input and scroll position instead of
  silently resetting the flow. Menus, dialogs, and drawers have clear close
  and return paths.
- Forms keep input labels visible and identify required fields. Feedback explains what
  happened and how to proceed; field errors identify the problem and remedy
  without discarding valid input. Destructive actions require confirmation.
- Use semantic controls with accessible names, visible keyboard focus, and a
  logical focus order. Touch actions do not depend on hover. Motion helps
  explain state changes and respects reduced-motion preferences.

## Responsive behavior

Fit the resolved viewport and actual content. Responsive outputs cover 375px
through wide screens; choose breakpoints where content needs to reflow rather
than scaling the whole page. Preserve reading order, readable text, reachable
primary actions, and usable controls as the layout changes. Phone layouts
avoid horizontal page scrolling and keep zoom available.

Fixed headers, bottom bars, and floating controls reserve the space they
occupy. Content and focused inputs remain reachable while scrolling; async
content has reserved space so loading does not displace an action mid-use.

## Layout primitives and content

Open Design stages `.od-frames/layout.css` and quotes it in the
`layout-primitives` context fact. Put the whole block into the document's own
`<style>` as its first rule set: `@layer od-layout` comes first so product CSS
can override it. Keep the `OD-LAYOUT-PRIMITIVES v1` marker comments. Use the
supplied primitives for applicable layout structures; they set structure,
wrapping, overflow, and ratios, not the product's visual language.

- Authored interface copy remains readable in full. When a heading, tagline,
  label, or explanation does not fit, adapt the layout or revise unlocked
  copy without changing its meaning; do not hide it with truncation or clamping.
- Preserve supplied content and raw data. Data text may use `.od-truncate` or
  `.od-clamp-2/3` in summaries, lists, or cards when the full value remains
  reachable through expansion or a detail view. A `title` tooltip alone is
  not a mobile access path. Confirmation, order, and detail views show the
  relevant values in full.
- Prices, times, quantities, availability, status, primary action labels, and
  errors stay fully readable. Allow wrapping where needed while keeping
  inseparable values, such as a number and its unit, together.

## Handheld device shell

Choose in this order, updating affected fields through the existing contract
update while retaining unrelated requirements:

1. Explicit no-frame request: `deviceFrame: none`.
2. Explicit frame request: the requested frame with `frameSource: user-request`.
   A website in an iPhone demonstration remains `productSurface: website`.
3. Existing artifact: preserve its frame with `frameSource: existing-artifact`
   (or `none` when unframed) only if neither product form nor presentation is
   requested to change.
4. New or changed `mobile-app`: default to its iOS/Android frame, or
   `mobile-neutral` without a single specified phone platform, with
   `frameSource: mobile-app-default`; this source is exclusive to `mobile-app`.
5. Other new or changed product forms: `deviceFrame: none`, including websites
   with mobile adaptation or iPhone/Android browser targets. Changing a mobile
   app into a website removes its default frame without another no-frame request.

Production uses the accepted Plan's selection; resource availability alone
selects nothing. With `none`, add no handset markup. Open Design stages shell
resources at `.od-frames/`. When introducing or replacing a frame, its path
must appear in the provided `availableShells` catalog. If unavailable, preserve
the existing artifact and report the missing path as blocked; do not substitute
a different frame or read an unlisted file with the same name. Otherwise use
the corresponding bundled shell:

| `deviceFrame` | Shell |
|---|---|
| `ios` | `.od-frames/iphone.html` |
| `android` | `.od-frames/android.html` |
| `mobile-neutral` | `.od-frames/neutral.html` |

The following rules apply only when a frame is selected:

- Preserve an `existing-artifact` shell. When introducing or replacing a frame,
  have the existing Build write step read and copy the resource programmatically,
  fill `APP CONTENT START` / `APP CONTENT END`, and add product styles/scripts.
  Do not print fixed HTML into model context or add a separate source-read call.
  Assemble in memory or scratch, then write the primary deliverable once; keep
  the resource unchanged and mount product content only in `.phone-content`.
- One handset persists across the whole prototype. Screen navigation and hash
  routes swap the content inside the screen; a new handset per route appears
  only when the user asks for a side-by-side board.
- Preserve the shell's hardware and system chrome. The app scrolls inside
  `.phone-content` while the handset stays fixed; content honors
  `--phone-safe-top` / `--phone-safe-bottom` so nothing sits under system chrome.
- The shell is presentation, not a design system: it sets no typography,
  palette, spacing, components, or navigation for the product. Its platform
  follows the frozen presentation choice, not incidental device words.
- Sheets, dialogs, toasts, and scrims mount inside the shell's screen, often
  outside the app's own wrapper, so product design tokens live on `:root`
  where overlays can inherit them.
- Keep the shell's narrow-viewport fallback: below 480px the handset chrome
  collapses and the screen fills the viewport.

## Build Packages

Use simple mode for a cohesive flow that benefits from one context. Complex
mode may split only when the general orchestration Skill's independent-output
conditions are met, and only along independently deliverable feature loops,
roles, or device surfaces after navigation, content locks, and the Design
Spec are frozen. Do not split one interaction loop across Children.
