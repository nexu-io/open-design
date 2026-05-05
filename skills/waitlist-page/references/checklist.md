# Checklist — Waitlist Page

## P0 — Must pass before emitting <artifact>

- [ ] Page has exactly one primary CTA (the email field + submit button)
- [ ] No hero gradient that spans more than 20% of the viewport height
- [ ] Email input has visible label or meaningful placeholder — not just "Email"
- [ ] No invented social proof numbers (e.g., "10,000 people waiting")
- [ ] Countdown timer (if present) uses real `Date` target from `Date.now()`, not hardcoded string
- [ ] Page is readable and functional at 375px viewport without horizontal scroll
- [ ] No generic emoji icons used as decorative elements
- [ ] Typography uses at most two font families (display + body)

## P1 — Should pass for quality submission

- [ ] Hero section is visually distinct and above-the-fold
- [ ] Email submit button has hover/active state
- [ ] Form validation provides clear feedback on error
- [ ] Countdown timer updates in real-time (if present)
- [ ] Page passes all accessibility checks (color contrast, semantic HTML)

## Anti-slop gates

- [ ] No purple gradients on hero or background
- [ ] No generic emoji (🚀 ✨ 💡) used as icons
- [ ] No rounded card with left-border accent as primary layout
- [ ] No Inter used as display/headline face
- [ ] No invented statistics or social proof numbers
- [ ] Font pairing is distinctive and appropriate
- [ ] Copy is honest and specific to the product
