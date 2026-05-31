# AWS theme reference (extracted from AWS Architecture Icons Deck, Release 22, 2025-07-31)

## Color tokens — these are the only colors allowed

| Token | Hex | Role |
|---|---|---|
| `--squid-ink` | `#232F3E` | Dark brand background |
| `--smile-orange` | `#ED7100` | Primary accent — Compute / Containers / Blockchain / Media |
| `--galaxy-purple` | `#8C4FFF` | Analytics / Games / Networking / Serverless |
| `--nebula` | `#C925D1` | Database / Developer Tools / Satellite |
| `--mars-red` | `#DD344C` | Security / Business Apps / Front-End Web |
| `--cosmos-pink` | `#E7157B` | App Integration / Management & Governance |
| `--endor-green` | `#7AA116` | Storage / IoT / Cloud Financial Management |
| `--orbit-turquoise` | `#01A88D` | AI/ML / End User Computing / Migration |
| `--light-gray` | `#7D8998` | Borders, dividers |
| `--white` | `#FFFFFF` | Light-mode background, dark-mode text |
| `--black` | `#000000` | Light-mode text |
| `--arrow-on-dark` | `#9BA7B6` | Connector lines on dark backgrounds |

**Do not improvise additional hex values.** If you need a tint, use `color-mix()` against the `--squid-ink` background, never invent a new hex.

## Theme modes

- **Dark mode (default for in-person)** — `background: #232F3E`, `color: #FFFFFF`. Diagram arrows use `#9BA7B6`.
- **Light mode (default for web/PDF)** — `background: #FFFFFF`, `color: #000000`. Diagram arrows use `#232F3E` or `#7D8998`.

## Typography

| Role | Font | Size | Weight |
|---|---|---|---|
| Display (Cover headline) | Amazon Ember Display | clamp(56px, 6vw, 88px) | 700 |
| Headline (slide title) | Amazon Ember Display | 36–44px | 700 |
| Subhead | Amazon Ember Bold | ≤ ½ headline size, ≥ 22px | 700 |
| Body | Amazon Ember Light | 16–22px | 300 |
| Caption | Amazon Ember | 12–14px | 400 |
| Diagram label | **Arial 12pt** (12px+ on screen) | 12pt | 400/700 |
| Code | Consolas / Monaco / Menlo | 16–18px | 400 |
| Session code / kicker | Amazon Ember Bold uppercase | 14px | 700 |

Fallback stack used in the framework (Amazon Ember is not freely licensed for web — system fallbacks reproduce the geometric humanist proportions):

```css
--font-display: 'Amazon Ember Display', 'Amazon Ember', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
--font-body:    'Amazon Ember', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
--font-mono:    Consolas, Monaco, Menlo, 'Courier Prime', ui-monospace, monospace;
--font-diagram: Arial, 'Helvetica Neue', sans-serif;
```

### Type rules

- Headlines: sentence case, ≤ 8 words, ≤ 3 lines.
- Body copy: left-aligned, max 15 words per line.
- No more than 10 consecutive bold words anywhere in the deck.
- Subheads ≤ ½ the headline point size.
- Mono font is reserved for code / IDs / hashes — never as body.

## Layout rules

- 16:9 widescreen. Canvas is `1920 × 1080` exactly.
- Margins: left/right `0.75"` ≈ 108px, top `1.2"` ≈ 173px, bottom safe band `0.6"` ≈ 86px reserved for the orange accent bar / footer.
- Content area: `11.8"` × `5.5"` ≈ `1700 × 792` px inside the safe zone.
- Architecture diagrams: full-bleed or near-full-bleed; diagram occupies most of the slide area below the title.
- Two-column slides: 6/6 split or 7/5 split. Left column = visual, right column = bullets.
- Tables: header row `#ED7100`, alternating data rows `#2A3A4E` and `#1E2C3E` (dark) or `#FFFFFF` and `#F3F4F6` (light), 0.5pt cell borders.
- The cover slide always has an orange accent bar (`8px tall`) flush with the bottom edge.

## Visual elements

- Architecture connectors: Open Arrow Size 4, 2pt line weight, `#9BA7B6` on dark / `#7D8998` on light.
- Group containers (VPCs, subnets, accounts, regions): rounded corner `8px`, 1pt border in the matching service category color, fill at 12% alpha of that color, `0.05"` nested buffer between containers.
- Service icons: AWS provides them at fixed sizes (most are 64×64, 48×48, or 40×40). **Never crop, flip, rotate, recolor, or reshape.** When an actual icon asset isn't available in this project, render a labelled square in the service-category color as a stand-in.
- Status pills: 28px tall, `border-radius: 14px`, padding `4px 12px`, 12px Amazon Ember Bold uppercase. Success = `--endor-green`, Warning = `--smile-orange`, Danger = `--mars-red`, Info = `--orbit-turquoise`.

## Anti-patterns (do not ship)

- Aggressive purple/violet gradient backgrounds.
- Squid Ink with a "blue" tint (people accidentally pick `#1F2937` — that is Tailwind slate, not AWS Squid Ink).
- Smile Orange used as a body text color (it is an accent only).
- Mixing service category colors arbitrarily (each color encodes a category — only use Galaxy Purple to signal Analytics, not just because you needed a second color).
- Drop shadows on architecture icons.
- Rounded cards with a left-border accent (that is Stripe / Linear, not AWS).
- Emoji as feature icons.
