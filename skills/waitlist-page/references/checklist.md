# Checklist — Waitlist Page

## P0 — Must pass before emitting `<artifact>`

- [ ] Page has exactly one primary CTA (the email field + submit button)
- [ ] No hero gradient that spans more than 20% of the viewport height
- [ ] Email input has a visible label or meaningful placeholder — not just "Email"
- [ ] No invented social proof numbers (e.g., "10,000 people waiting")
- [ ] **No countdown timer present** — countdown timers are an explicit anti-pattern for this skill (see SKILL.md §Quality gates)
- [ ] No horizontal scroll at 375px viewport
- [ ] No generic emoji icons used as decorative elements
- [ ] Typography uses at most two font families (display + body)
- [ ] First name field has no `required` attribute
- [ ] Work email field has `type="email"` and `required`
- [ ] Form does **not** use `novalidate`; JS guard calls `checkValidity()` before showing success state
- [ ] Success message uses `role="status"` or `aria-live="polite"` so screen readers announce it
- [ ] All color values derived from DESIGN.md; only allowed hardcoded exception is `#2D6A4F` for `--success`
- [ ] All user-supplied text tokens are HTML-escaped; hex tokens match `/^[0-9A-Fa-f]{6}$/`; font name tokens are URL-encoded in the Google Fonts URL; `{{LOGO_MARK}}` is escaped text initials or strictly sanitized inline SVG (no scripts/events)

## P1 — Should pass for quality submission

- [ ] Hero section is visually distinct and above-the-fold
- [ ] Email submit button has hover and active states
- [ ] Form validation provides clear inline feedback on error (native `reportValidity()` is acceptable)
- [ ] Page is scrollable (not clipped) at 375×667 and 390×844; CTA visible without scroll at those sizes
- [ ] Ticker animation is paused or removed under `prefers-reduced-motion: reduce`
- [ ] All interactive elements have visible focus styles (not just `outline: none`)
- [ ] Keyboard: Tab reaches each form field and the submit button; Enter submits the form
- [ ] Color contrast of body text on background meets WCAG AA (≥ 4.5:1)
- [ ] Color contrast of button label on button background meets WCAG AA (≥ 4.5:1)
- [ ] Logo alt text or `aria-label` present if logo is an `<img>` or meaningful SVG
- [ ] Ticker ribbon has `aria-hidden="true"` (decorative, not meaningful content)
- [ ] `<html lang="">` attribute is set to the correct language code

## P2 — Nice-to-have polish

- [ ] Google Fonts loaded with `display=swap` to avoid FOIT
- [ ] Form inputs have matching `autocomplete` attributes (`given-name`, `email`)
- [ ] Subtle micro-animation on button hover (scale or opacity only — no layout shift)
- [ ] Decoration zone does not cover or overlap the form at any viewport width
- [ ] Page title is `{{PRODUCT_NAME}} — Coming Soon`, not a generic placeholder
