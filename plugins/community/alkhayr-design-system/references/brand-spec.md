# Alkhayr — Brand Spec (extracted)

Source: `~/projects/alkhayr/assets/alkhayr.jpeg` (logo, pixel-sampled) +
`~/projects/alkhayr/assets/alkhayr_design_system.html` (v1 draft, DEC-002 open)
+ drafted site copy (`about-alkhayr.md`). Colors verified by computation, not memory.

## Tokens

| Role | Token | Value (OKLch) | Hex |
|---|---|---|---|
| `--bg` | Paper | `oklch(98.8% 0.007 89)` | `#FDFBF6` |
| `--surface` | Card | `oklch(100% 0 0)` | `#FFFFFF` |
| `--fg` | Deep Green ink | `oklch(31.4% 0.062 169)` | `#013B2C` |
| `--muted` | Ink soft | `oklch(51.2% 0.023 164)` | `#5B6B63` |
| `--border` | Line | `oklch(89.4% 0.028 93)` | `#E2DCC8` |
| `--accent` | Sprig Green | `oklch(50.7% 0.110 148)` | `#31763F` |

Supporting: `--gold: oklch(69.3% 0.111 82) / #BF9543` (reserved secondary),
`--gold-ink: #8A6A2A` (4.86:1 on Paper — text-safe gold), `--deep: oklch(23.4% 0.042 168) / #04241A` (dark sections), `--paper-2: #F3EEE1`.

Dark theme: bg `#0B1512`, surface `#101B16`, fg `#E9EFE9`, muted `#9FB0A8`,
border `#26362E`, accent `#5FAE6F`, gold `#D9B65A` (8.5:1 on deep).

## Contrast gates (measured)

- Deep green on Paper **12.2:1** ✓ body. Ink-soft on Paper **5.45:1** ✓ body.
- Sprig on Paper **5.35:1** ✓ text/links. White on Sprig **5.54:1** ✓ CTA.
- Paper on Ground-deep **16:1** ✓. Gold on Ground-deep **5.97:1** ✓.
- Gold `#BF9543` on Paper **2.67:1** ✗ — never text on light; use `--gold-ink`.

## Type

- One family: `'Bricolage Grotesque', -apple-system, 'Segoe UI', system-ui, sans-serif`
  (variable 200–800 + optical-size axis 12–96 via Google Fonts). Weight carries the hierarchy —
  800 display, 700 headings, 400 body, 500 upright for quotes. The family has **no italic axis** —
  never synthesize oblique; quotes stay upright. Tight tracking −0.01…−0.02em ≥32px.
- Mono (hex/figures only): `ui-monospace, 'SF Mono', Menlo, monospace`.
- Arabic (if ever real copy): Amiri / Noto Naskh — never mimic the logotype.
- Eyebrows: uppercase sans, `letter-spacing: 0.12–0.14em` (native to the wordmark).

## Posture rules

1. Hairline borders + whitespace do the work; shadows only on hover/floating nav.
2. Radii: 8px controls, 12–20px cards, pill badges; the pointed mihrab arch is
   the one special shape (image masks, dividers) — use sparingly.
3. Accent budget: sprig is the only action color (≤2 visible uses/screen);
   gold is a reserve — borders, eyebrows on dark, the arch outline, never fills
   for primary actions.
4. Weight carries trust moments (headlines, Hadith, tagline at 800); regular weights
   carry anything operational (donation steps, bank details, forms at 400/600).
5. Imagery documents the real hostel project; honest placeholders until real
   photos exist — never NGO stock.
