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
    - name: bg_hex
      type: string
      pattern: "^[0-9A-Fa-f]{6}$"
      required: true
    - name: fg_hex
      type: string
      pattern: "^[0-9A-Fa-f]{6}$"
      required: true
    - name: accent_hex
      type: string
      pattern: "^[0-9A-Fa-f]{6}$"
      required: true
    - name: deco_hex
      type: string
      pattern: "^[0-9A-Fa-f]{6}$"
      required: true
    - name: stripe_hex
      type: string
      pattern: "^[0-9A-Fa-f]{6}$"
      required: true
    - name: border_expression
      type: string
      description: "CSS color expression for input borders (e.g., 'rgba(100,50,30,0.38)' or 'color-mix(in srgb, var(--fg) 38%, transparent)'). Must be valid CSS."
      required: true
    - name: success_hex
      type: string
      pattern: "^[0-9A-Fa-f]{6}$"
      required: true
    - name: btn_label_expression
      type: string
      description: "CSS color expression for button label text (e.g., 'rgba(255,255,255,1)' or '#fff'). Ensure WCAG AA contrast."
      required: true
    - name: ticker_bg_expression
      type: string
      description: "CSS color expression for ticker background (e.g., 'rgba(0,0,0,0.9)'). Must be valid CSS."
      required: true
    - name: ticker_fg_expression
      type: string
      description: "CSS color expression for ticker text (e.g., 'rgba(255,255,255,0.9)'). Ensure contrast."
      required: true
    - name: deco_stroke_expression
      type: string
      description: "CSS color expression for SVG strokes (e.g., 'rgba(0,0,0,0.12)'). Typically a muted foreground or neutral."
      required: true
    - name: logo_shadow_expression
      type: string
      description: "CSS color expression for logo container shadow (e.g., 'rgba(0,0,0,0.08)'). Typically a subtle foreground shade."
      required: true
    - name: display_font_url
      type: string
      description: "Display font name with spaces encoded as '+' (e.g., 'Syne', 'DM+Sans'). Used in Google Fonts URL."
      required: true
    - name: display_font_css
      type: string
      description: "Display font name as it appears in CSS (e.g., 'Syne', 'DM Sans'). Already quoted if needed; no extra quotes in template."
      required: true
    - name: body_font_url
      type: string
      description: "Body font name with spaces encoded as '+' (e.g., 'DM+Sans', 'IBM+Plex+Serif'). Used in Google Fonts URL."
      required: true
    - name: body_font_css
      type: string
      description: "Body font name as it appears in CSS (e.g., 'DM Sans', 'IBM Plex Serif'). Already quoted if needed; no extra quotes in template."
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
   - **Token mapping rules** — Color tokens in the template are full CSS expressions (not simple hex values):
     - `--bg`, `--fg`, `--accent`, `--deco`, `--deco-stripe` / `{{*_HEX}}`: simple six-digit hex colors from DESIGN.md (e.g., `#{{BG_HEX}}` becomes `#FDE8DF`).
     - `--input-border` / `{{BORDER_EXPRESSION}}`: full CSS expression for input border color, typically `rgba(...)` or `color-mix(...)` with opacity to soften the foreground (e.g., `rgba(196, 169, 154, 0.38)` or `color-mix(in srgb, var(--fg) 38%, transparent)`). Must be valid CSS; no `#` prefix.
     - `--success` / `{{SUCCESS_HEX}}`: an explicit semantic success token from DESIGN.md if present; otherwise `#2D6A4F` is the allowed fallback (only hardcoded hex exception).
     - `--btn-label` / `{{BTN_LABEL_EXPRESSION}}`: full CSS expression for button text color (e.g., `#1A1410` or `rgba(255,255,255,1)`). Validate WCAG AA contrast against button background.
     - `--ticker-bg` / `{{TICKER_BG_EXPRESSION}}`: full CSS expression for ticker background (e.g., `rgba(0, 0, 0, 0.9)`). Must be valid CSS.
     - `--ticker-fg` / `{{TICKER_FG_EXPRESSION}}`: full CSS expression for ticker text (e.g., `rgba(255, 255, 255, 0.9)`). Validate WCAG AA contrast.
     - `--deco-stroke` / `{{DECO_STROKE_EXPRESSION}}`: full CSS expression for SVG decoration strokes (e.g., `rgba(0, 0, 0, 0.12)`). Typically muted foreground or neutral with opacity 12–15%.
     - `--logo-shadow` / `{{LOGO_SHADOW_EXPRESSION}}`: full CSS expression for logo container shadow (e.g., `rgba(0, 0, 0, 0.08)`). Typically a subtle foreground shade with low opacity for depth.
     - Never ask the user for hex values when derivation is possible.
8. **Responsive scaling**. Test at 375px, 768px, 1440px. Mobile: form stacks to single column, logo shrinks to 40px, decoration compresses. No horizontal scrolling. All text remains readable. Desktop: centered layout, comfortable whitespace.
9. **Emit clean HTML**. Single file, CSS inlined, SVG for graphics. Use semantic tags. Mark interactive elements with `data-od-id` (headline, form, logo, ticker, grid, etc.) so agents can customize without parsing.
   - **Token escaping rules** — apply before inserting any user-supplied value:
     - Text tokens (`{{PRODUCT_NAME}}`, `{{TAGLINE}}`): HTML-escape `<`, `>`, `&`, `"`, `'` before inserting into HTML text nodes or attribute values.
     - Hex color tokens (`{{*_HEX}}`): validate each matches `/^[0-9A-Fa-f]{6}$/`; reject and ask the user if they don't match.
     - CSS expression tokens (`{{BORDER_EXPRESSION}}`, `{{BTN_LABEL_EXPRESSION}}`, `{{TICKER_BG_EXPRESSION}}`, `{{TICKER_FG_EXPRESSION}}`, `{{DECO_STROKE_EXPRESSION}}`, `{{LOGO_SHADOW_EXPRESSION}}`): validate they are valid CSS values (no bare strings, no unescaped quotes); do not wrap in `#` or extra quotes.
     - Font name tokens (`{{DISPLAY_FONT_CSS}}`, `{{BODY_FONT_CSS}}`): these should be CSS font-family values, already quoted if they contain spaces (e.g., `'DM Sans'`, `Syne`). Do NOT add extra quotes in the template—they are inserted as-is into the `font-family` declaration.
     - Font URL tokens (`{{DISPLAY_FONT_URL}}`, `{{BODY_FONT_URL}}`): spaces must be encoded as `+` for the Google Fonts URL (e.g., `DM+Sans`); validate the URL is well-formed before insertion.
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
