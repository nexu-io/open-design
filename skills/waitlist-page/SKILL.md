---
name: waitlist-page
description: |
  Minimal pre-launch landing with email capture, brand logo, and optional decorative layer.
  Reads DESIGN.md for colors, typography, and layout rules.
  Best for: product launches, beta signups, early access programs, indie projects.
triggers:
  - "waitlist page"
  - "coming soon page"
  - "pre-launch landing page"
  - "email capture page"
  - "launch page"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  featured: 1
  preview:
    type: html
    entry: example.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  inputs:
    - name: product_name
      type: string
      required: true
    - name: tagline
      type: string
      required: true
  outputs:
    primary: index.html
  capabilities_required:
    - file_write
  example_prompt: "Make a waitlist page for a design tool — clean, minimal, with a custom logo and one call-to-action."
---

# Waitlist Page Skill

Pre-launch pages are your first handshake with future users. This skill builds a focused, honest entrance: your brand identity, what you're making, one clear path to join the early list. No artificial scarcity, no fake countdown, no inflation tactics—just a clean, mobile-first vessel for genuine interest.

## Workflow

1. **Load the brand identity** — Read `DESIGN.md` for the color system, font pairing, and spatial rules. This is your foundation. A waitlist page lives or dies by consistency with the brand it represents. If `DESIGN.md` is missing, ask the user to provide one before you proceed.
2. **Split the viewport into zones**: Upper (hero: 50–65%), Lower (decoration: 35–50%). The upper zone is working real estate—logo, headline, form. The lower zone is visual cushion—color, pattern, subtle animation. Both matter; neither dominates.
3. **Anchor the logo**. Position it absolute, top-left, 20–24px from edges. Enclose it in a circle or badge using the brand's accent color. Add the product name beside it with a separator dot. This becomes the user's visual anchor—a guarantee this is a real brand, not a placeholder.
4. **Write the headline** as a simple sentence: `product_name` + short phrase. Examples: "Meridian is coming soon", "Figma for music is almost here", "Cal is launching". Use the display typeface. Aim for one line on desktop, two on mobile. Readability beats cleverness.
5. **Add one supporting line**. The tagline input—short, specific. No corporate buzzwords. Example: "A design tool that learns your style." If you have room, add 1–2 clarifying sentences. Keep it to 3 lines total.
6. **Build the form**. Two fields: First Name (optional, no `required` attribute), Work Email (required). A "Join Waitlist" button. Do not add `novalidate`; rely on native browser validation plus a JavaScript guard (`if (!form.checkValidity()) { form.reportValidity(); return; }`) before showing the success state. On successful submission, hide the form and show a thank-you message (`role="status"` or `aria-live="polite"`) so screen readers announce it: "You're on the list. We'll be in touch." Use the body typeface. Make the button the only dark/emphasized element—it's the whole point.
7. **Decorate below the fold** (optional but recommended):
   - Coil or wavy line to separate zones (suggests movement, transition)
   - Thin accent stripe of a secondary brand color
   - Simple geometric pattern: perspective grid, radiating lines, or subtle lattice (suggests depth, forward momentum)
   - Animated ticker at the bottom—repeating text like "COMING SOON" + markers (✦). Subtle, behind-the-scenes energy.
   - All colors from DESIGN.md; no invented hex values.
   - **Token mapping rules** — when the template requires tokens not present in DESIGN.md, derive them rather than inventing values:
     - `--input-border` / `BORDER_HEX`: foreground color at 35–40% opacity (`color-mix(in srgb, var(--fg) 38%, transparent)`).
     - `--success` / `SUCCESS_HEX`: use an explicit semantic success token from DESIGN.md if present; otherwise `#2D6A4F` is the allowed fallback (it is the only hardcoded hex permitted in a generated page).
     - `--deco-stripe` / `STRIPE_HEX`: a secondary brand accent from DESIGN.md; if only one accent exists, use it at full opacity.
     - `--deco` / `DECO_HEX`: a tint/shade of the primary accent or background from DESIGN.md.
     - Never ask the user for hex values when derivation is possible.
8. **Responsive scaling**. Test at 375px, 768px, 1440px. Mobile: form stacks to single column, logo shrinks to 40px, decoration compresses. No horizontal scrolling. All text remains readable. Desktop: centered layout, comfortable whitespace.
9. **Emit clean HTML**. Single file, CSS inlined, SVG for graphics. Use semantic tags. Mark interactive elements with `data-od-id` (headline, form, logo, ticker, grid, etc.) so agents can customize without parsing.
   - **Token escaping rules** — apply before inserting any user-supplied value:
     - Text tokens (`{{PRODUCT_NAME}}`, `{{TAGLINE}}`): HTML-escape `<`, `>`, `&`, `"`, `'` before inserting into HTML text nodes or attribute values.
     - CSS variable tokens (`BG_HEX`, `FG_HEX`, etc.): validate each matches `/^[0-9A-Fa-f]{6}$/`; reject and ask the user if they don't match.
     - Font name tokens (`DISPLAY_FONT`, `BODY_FONT`): URL-encode spaces as `+` in the Google Fonts URL; CSS-quote names containing spaces (`'DM Sans'`).
     - Never reflect raw user input into `<script>` blocks or event-handler attributes.

## Quality gates

- **Single CTA**: Email form is the only interactive element. No nav, no secondary buttons, no social links.
- **Logo placement**: Fixed top-left, matches DESIGN.md accent color, scales down on mobile (50px → 40px).
- **Color consistency**: Every color from DESIGN.md palette. No custom hex values invented.
- **Content integrity**: Headline and copy tie directly to `product_name` and `tagline` inputs—no filler copy.
- **Mobile fit**: No horizontal scroll at 375px. The email input and submit button are fully visible (no clipping) at 375×667 and 390×844. Any vertical overflow is scrollable, not hidden. Do not set `overflow: hidden` on `body` if it clips the form on short screens.
- **No anti-patterns**: No emoji, no countdown timer, no fake social proof, no lorem ipsum.
- **Typographic discipline**: Display + body fonts only (2-font rule). Consistent sizing across sections.
- **Decoration restraint**: Lower zone enhances without distraction. Opacity, subtle strokes, muted animation.

## Output

Emit the artifact between tags:

```
<artifact identifier="waitlist-id" type="text/html" title="Coming Soon — {{PRODUCT_NAME}}">
<!doctype html>
<html>
...
</html>
</artifact>
```

One line of description above the artifact; nothing below.
