# Form validation craft rules

Universal rules for form validation lifecycle, error wiring beyond the
accessibility baseline, and the schema-as-contract layer that makes
the same validation work on the server and the client. The active
`DESIGN.md` decides how the field looks; this file decides *when* the
field tells the user it's wrong, *how* the error reaches assistive
tech, and *where* the rule lives.

> Grounded in primary sources: WHATWG HTML Living Standard
> (Constraint Validation section under "Form control infrastructure"),
> CSS Selectors L4 (`:user-invalid`), WCAG 2.2 SC 3.3.x
> Understanding pages, ARIA APG forms patterns, Standard Schema spec
> (`@standard-schema/spec`), Baymard 2024 inline-validation research
> checkout-UX benchmark, WebAIM Million 2026 forms findings.

## Prior art and scope

Existing OSS forms guidance for AI agents pins to one layer at a time
— `szilu/ux-designer-skill` is UX-opinion grade with no spec anchors,
`Community-Access/accessibility-agents/forms-specialist` is
WCAG-anchored but AT-only and doesn't reach the platform validity
layer or the schema contract. This file connects the four layers a
real form spans: **WHATWG Constraint Validation as the platform
floor, validation timing as a state machine on the input, WCAG 3.3.x
as the announcement and recovery contract, schema as the cross-stack
truth.** A11y wiring lives next door in `accessibility-baseline.md`
(label + describedby + invalid + `role="alert"` for inline errors);
this file picks up where that ends.

## The input state machine

Every input passes through these states. The names trace back to RHF /
Formik vocabulary on web; the *shape* applies regardless of stack.
Drive error chrome off the state, not off raw `:invalid` or
focus/blur booleans.

| State | Meaning | UI |
|---|---|---|
| `pristine` | User has not interacted | No error chrome, no green check |
| `dirty` | User has typed but not committed (still focused) | No error chrome yet |
| `touched` | User has blurred at least once after editing | Field-level constraint runs |
| `invalid-after-touched` | Constraint failed after blur | Show error, link via `aria-describedby` |
| `invalid-after-submit` | Submit attempted, field still invalid | Same plus focus management to summary or first invalid field |
| `recovering` | User editing an already-invalid field | Re-validate on `input`, not on next blur |
| `submitting` | Action in flight | Disable submit, announce status via a polite live region |
| `server-error` | Server returned an error for this field | Use server's message text; treat as `invalid-after-submit` |

Decision rule that collapses validation-timing debates: errors appear
on transition into `invalid-after-touched`, clear on transition out
of any invalid state, and never appear from `pristine` or plain
`dirty`. CSS `:user-invalid` matches the `invalid-after-touched` /
`invalid-after-submit` states for free.

## Validation timing

Baymard's checkout-UX benchmark (2024-01-09 inline-validation article):
**31% of sites have no inline validation, and most of the rest fire
too early.** The participant quote that anchors the research: *"Why
are you telling me my email address is wrong, I haven't had a chance
to fill it all out yet?"* Premature firing is the loudest UX failure
in this space.

The four rules:

1. **First blur after edit** runs the field-level constraint. Not on focus, not on first keystroke, not on every keystroke.
2. **Once a field is invalid, switch to `input`-event re-validation** so the error clears the moment input becomes valid. Don't make the user blur again to dismiss it.
3. **On submit**, run the schema parse. Move focus to the error summary at the top of the form (a heading-led container with `tabindex="-1"`, no `role="alert"` — see the wiring section), or to the first invalid field if no summary exists. Don't move focus on every keystroke.
4. **Async checks** split into two paths. *Background preflight* (uniqueness while typing, address lookup) debounces 250-500 ms, announces via a polite live region, and never gates typing or keeps the submit button disabled indefinitely. *Authoritative server validation on submit* is different: the submit path must await the server's response and surface field errors from it, since the server is the truth. Don't conflate the two — the rule is "don't let a slow background check freeze the form," not "don't ever wait for the server."

CSS gets you most of timing rule 1 for free: style off `:user-invalid`
not `:invalid`. The `:user-invalid` selector is Baseline Newly
available 2023 (Chrome 119, Firefox 88, Safari 16.5; Firefox shipped
the prefixed `:-moz-ui-invalid` years earlier and unprefixed in v88)
and matches only after the user has either submitted the form or
blurred the field with bad input.

## Constraint Validation API as the platform floor

Native HTML constraints are not an alternative to JS validation; they
are the substrate the rest of the layers run on. They survive JS
failure, they integrate with autofill, and they are what
`reportValidity()` and screen-reader native announcements key off.

```html
<input type="email" name="email" required>
```

Use these declaratively for every field that has them: `required`,
`type` (email, url, number, tel), `pattern`, `min`/`max`,
`minlength`/`maxlength`, `step`. Cross-field rules and dynamic
constraints go through `setCustomValidity()` on both `input` and
`change` events — autofill flows historically fired one without the
other on some browsers, so listening on both is the cheap defense.

Rules of the API:

- **Empty string clears `setCustomValidity`.** Not `null`, not no-arg.
- **`form.requestSubmit()` honors validation; `form.submit()` skips it.** Never call the second.
- `disabled` controls are barred from validation and not submitted. The HTML spec says `readonly` is also barred, but `readonly` only has defined behavior on `<input>` and `<textarea>` — implementations diverge for `<select readonly>` and `<button readonly>` ([whatwg/html#11841](https://github.com/whatwg/html/issues/11841)). For non-input controls where the value must still submit, the safe pattern is `disabled` plus a same-named hidden `<input>` carrying the value, or rendering the non-editable text alongside a hidden `<input>`. `aria-readonly` alone is not enough — a `<select>` or custom widget tagged `aria-readonly="true"` is still interactable, so the visible control can drift while the hidden input ships a stale or different value. If you do use `aria-readonly`, you must also block the interaction or keep both values in sync.
- `inputmode` is a virtual-keyboard hint, **not** validation. `<input type="text" inputmode="numeric" pattern="[0-9]*">` is the Baymard-recommended shape for ZIPs / OTPs / card numbers; `pattern="[0-9]*"` is the historical iOS-Safari trigger for the numeric keypad on top of `inputmode`. `type="number"` adds spinners, strips leading zeros, applies locale-decimal handling, and varies field width across browsers — wrong for any of these.

## Error wiring beyond the baseline

The default error pattern in `accessibility-baseline.md` (`<label>` +
`aria-describedby` + `aria-invalid` + `role="alert"`) covers WCAG
3.3.1 / 3.3.2. Three additions matter for real forms:

**Adaptive error messages.** Baymard 2023: 98% of audited sites use
generic catch-all errors ("Provide a valid phone number") rather than
the specific subrule that fired ("Phone number is too short"). The
back end already knows the subrule; surfacing it cuts re-submit
attempts. Ship 4-7 distinct messages per high-traffic complex field
(email, phone, card, postal code). The scale of the problem matches
WebAIM Million 2026: missing form-input labels appear on **51% of
the top 1M home pages** (input-level rate **33.1%** of all 6.9M
inputs sampled) — labels and error messages are the categories
trending sideways or worse year-over-year while overall a11y errors
drop.

**Error summary at the top, on submit only.** Long forms benefit from
a summary list of in-page anchor links to invalid fields, focused on
submit:

```html
<div id="form-errors" tabindex="-1">
  <h2>2 problems</h2>
  <ul>
    <li><a href="#email">Email is required</a></li>
    <li><a href="#dob">Date of birth must be in the past</a></li>
  </ul>
</div>
```

The container is heading-led with `tabindex="-1"` so JS can move
focus to it on submit (render the summary into the DOM, *then*
`.focus()` it; a `hidden` element can't take focus). It does **not**
carry `role="alert"` because combining a moved-focus target with an
alert role causes double-announcement: alert fires on insertion,
focus fires the accessible name + role. Reserve `role="alert"` for
inline per-field errors that appear without focus moving — that's
the canonical baseline pattern in `accessibility-baseline.md`. WCAG
technique G139 covers the summary; not required, high-value for long
forms.

**Preserve user input on error.** Baymard 2024: 34% of audited
checkouts wipe the credit-card field when an unrelated error reloads
the page. Direct cause of abandonment. Either field-level-validate
non-sensitive fields first, or split the payment step. PCI-wise,
persisting card values across an error reload is fine via tokenized
hosted iframes; never store raw PAN in your own session.

## Schema as the cross-stack contract

Validation expressed once, consumed everywhere. The 2026 React shape
— `useActionState` + Server Actions + Conform (which added Standard
Schema support during the v1.x line) + a Zod 4 / Valibot / ArkType
schema — is the most-cited concrete instance: one schema,
server-authoritative, validator hot-swappable via the `~standard`
interface. The same architecture works in TanStack Form, oRPC, Hono
validator middleware, Nuxt UForm, and any other consumer that reads
`~standard`.

```ts
const Signup = z.object({
  email: z.email(),                  // Zod 4 top-level form
  password: z.string().min(12),
});
// Same schema parses on the Server Action and on the Conform client.
```

Three rules that survive across stacks:

- **Server is the truth, client is the optimization.** Same schema runs in both. Returning `{ errors }` from the action (not throwing) is what feeds back into `useActionState`'s state slot — throwing routes to the Error Boundary and loses the form data.
- **Standard Schema is the contract, not Zod.** A form library that ships per-validator resolver shims (`zodResolver`, `valibotResolver`, etc.) is yesterday's stack. Accept any `~standard`-compliant validator.
- **`novalidate` on `<form>` does not mean "skip validation".** It means "let the form library repaint errors instead of the browser's bubble." But the trade-off is real: a literal server-rendered `<form novalidate>` disables the browser's submit-blocking and native validation UI **even when JS is unavailable**, which loses the no-JS constraint-validation floor. Pick one of two patterns. **A:** render `<form>` without `novalidate` server-side and have the form library set `form.noValidate = true` after hydration — the no-JS user keeps the browser's native validation, the JS user gets the library's chrome. **B:** ship `novalidate` from the start only when the submit path reaches server validation without JS (Server Action, classic POST handler) so the no-JS user is still protected by the server. Either way, keep `required` / `pattern` / `type` attributes — they survive JS failure and integrate with autofill. (HTML attribute is lowercase `novalidate`; the IDL property on the form element is `noValidate`.)

## WCAG 3.3.x beyond Error Identification

`accessibility-baseline.md` covers 3.3.1 (Error ID), 3.3.2 (Labels),
and 3.3.7 (Redundant Entry). The rest of 3.3 binds harder on
transactional forms:

- **3.3.3 Error Suggestion (AA):** when the fix is determinable, suggest it in text. Adaptive errors satisfy this. "Date must be MM/DD/YYYY. You entered 5-3-26. Did you mean 05/03/2026?"
- **3.3.4 Error Prevention — Legal, Financial, Data (AA):** for any submission with legal / financial / data-modifying consequence, provide one of: reversibility, server-side check + correction step, or a confirm-summary screen before commit.
- **3.3.8 Accessible Authentication (AA, WCAG 2.2):** auth steps must not require a cognitive function test (remember a password, transcribe a code, recognize images) without an alternative. CAPTCHAs are the canonical thing this SC restricts; only object-recognition or personal-content variants escape via the narrow exceptions, and not all CAPTCHAs do. Practical floor: never block paste on password / verification-code fields, support password managers, accept verification-code paste from a clipboard.
- **3.3.9 Accessible Authentication, No Exception (AAA):** removes even the object-recognition / personal-content exceptions. Aspirational; flag if a project commits to it.

## Native mobile parity

Web validation primitives don't auto-translate. Each platform has its
own validity machinery and its own AT path. Skills that emit web-only
artifacts can skim this section; it's the entry point for skills
that ship to mobile (mobile-onboarding, mobile-app, etc.).

| Platform | Validity primitive | Error announcement |
|---|---|---|
| iOS UIKit | Hand-rolled state on the view controller; `UITextField` doesn't carry a built-in invalid flag | `UIAccessibility.post(notification: .announcement, argument: "Email is required")` |
| iOS SwiftUI | `TextField` + `@State`-driven validation; no built-in `Form`-level validity API as of iOS 18 | `AccessibilityNotification.Announcement("…").post()` (iOS 17+) |
| Android Compose | `OutlinedTextField(isError = true, supportingText = { Text("…") })` — `isError` wires the AT error semantic for you | `Modifier.semantics { liveRegion = LiveRegionMode.Polite }` on the supporting-text node, or `LocalView.current.announceForAccessibility(message)` |
| Flutter | `TextFormField(validator: (v) => …)` inside a `Form`, `formKey.currentState!.validate()` | `SemanticsService.announce(message, Directionality.of(context))` — never hardcode `TextDirection.ltr`; pull ambient direction so Arabic / Hebrew / Persian flows announce correctly |
| React Native | Hand-rolled per field; no platform validity flag | `accessibilityLiveRegion="polite"` on the error node (Android) + `AccessibilityInfo.announceForAccessibility(...)` (iOS) |

Two parity rules that catch most AI-generated mobile forms:

- **Use the platform's native validation flag — and pair it with the platform's error-message semantic where one exists.** On Compose, `isError = true` is the right boolean state for the field visuals and AT error-state cue, but it does *not* carry the localized error message. Pair it with `Modifier.semantics { error(message) }` so accessibility services get the actual text — the same string you render in `supportingText`. The trap is duplication: a hand-rolled `Modifier.semantics { error("Email is required") }` next to a different supporting-text string desyncs. Source `error()` from the same state field as `supportingText` so they stay in sync.
- **Don't mirror web ARIA into mobile semantics.** `aria-describedby` on a SwiftUI `TextField` is a no-op. Use the platform announcement primitive (`AccessibilityNotification.Announcement` on SwiftUI, `UIAccessibility.post` on UIKit, `announceForAccessibility` on Android, `SemanticsService.announce` on Flutter) for state-change events that need to reach the screen reader.

## Common mistakes (lint these)

- Styling off `input:invalid` instead of `input:user-invalid`. Red borders on page load is the loudest "this validation was added without testing" signal.
- Validating on every keystroke. Hostile; fires before the user has finished typing.
- Generic catch-all error messages ("Invalid input") when the back end already knows which subrule fired. Baymard 2023 found 98% of audited sites do this — the most-cited preventable validation failure in their corpus.
- Throwing from a Server Action on validation failure. Routes to the Error Boundary and loses the form data. Return `{ errors }` instead.
- `role="alert"` on the error-summary container that focus moves to. Double-announces. Reserve `role="alert"` for inline per-field errors that appear without focus moving.
- `aria-busy="true"` on the submit button while submitting. `aria-busy` is for stale containers; for buttons use `disabled` plus a polite live-region status message.
- Email-confirm fields ("retype your email"). 3.3.7 redundant entry — exceptions are essential / security / no-longer-valid, not "we want to catch typos." Allow paste and validate the single field instead.
- Per-validator resolver shims (`zodResolver`, `valibotResolver`) on a 2026 stack. Accept Standard Schema's `~standard` interface and the validator becomes swappable.
- Wiping the credit-card field when an unrelated field errors. Baymard 2024: 34% of audited e-commerce sites; direct abandonment cause.
- `setCustomValidity(null)` to clear an error. Pass empty string; `null` does not clear.
- Mirroring web ARIA onto SwiftUI / Compose / Flutter. Each platform has its own validity API; `aria-*` attributes don't reach the mobile AT path.
