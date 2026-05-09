# Trading Terminal Design System

> Category: Developer Tools
> Financial data interfaces. Dense, precise, unapologetically dark. Every pixel carries data weight.

## 1. Visual Theme & Atmosphere

A **black terminal canvas** (`#000000`) with **market green** (`#00D26A`) and **alert red** (`#FF4757`) as the primary data signals. The aesthetic is borrowed from Bloomberg Terminal, Reuters Eikon, and professional trading desks — zero decoration, maximum information density, every color has a financial meaning.

| Element | Hex | Role |
|---------|-----|------|
| Background | `#000000` | Pure black canvas |
| Surface | `#0D0D0D` | Elevated panels |
| Surface Hover | `#1A1A1A` | Interactive surface hover |
| Border | `#2A2A2A` | Panel dividers |
| Gain | `#00D26A` | Price up, positive values |
| Loss | `#FF4757` | Price down, negative values |
| Neutral | `#808086` | Unchanged, secondary data |
| Text Primary | `#FFFFFF` | High-contrast primary text |
| Text Secondary | `#AAAAAA` | Labels, metadata |

*"If you need more than 3 words to explain a color in a trading UI, something is wrong."*

### Use Cases

Trading Terminal is purpose-built for:
- **Financial dashboards** — portfolio trackers, market scanners, equity screens
- **Crypto trading interfaces** — real-time price tickers, order books, trade history
- **Analytics platforms** — quantitative data feeds, economic indicators
- **Any high-density, real-time data display** where color directly maps to value change

### Prior Art

Bloomberg Terminal, Reuters Eikon, Refinitiv Eikon, and TradingView share a common visual language born from decades of trading floor constraints: black background (reduces eye strain during 16-hour sessions), green/red for gain/loss (universal financial convention), monospace numerals (alignment matters when scanning columns of prices).

## 2. Color

### Surface Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#000000` | Page canvas, primary depth |
| Surface | `#0D0D0D` | Panels, cards |
| Surface Hover | `#1A1A1A` | Interactive surface hover |
| Border | `#2A2A2A` | Panel dividers, grid lines |
| Border Accent | `#3A3A3A` | Active panel highlight |

### Data Palette (market signals)

All data colors on `#0D0D0D` pass WCAG AA (minimum 4.5:1).

| Token | Hex | Usage |
|-------|-----|-------|
| Gain | `#00D26A` | Positive price movement, profitable positions |
| Gain Muted | `#00D26A26` | Gain background tint, positive change badges |
| Loss | `#FF4757` | Negative price movement, losing positions |
| Loss Muted | `#FF475726` | Loss background tint, negative change badges |
| Neutral | `#808086` | Unchanged, flat, no change |
| Warning | `#FFB800` | Margin alerts, approaching limits |

### Text Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#FFFFFF` | Readable at distance, primary content |
| Secondary | `#AAAAAA` | Labels, descriptors |
| Tertiary | `#828282` | Timestamps, grid labels |

### Token Definitions

```css
:root {
  --color-bg: #000000;
  --color-surface: #0D0D0D;
  --color-surface-hover: #1A1A1A;
  --color-border: #2A2A2A;
  --color-border-accent: #3A3A3A;
  --color-gain: #00D26A;
  --color-gain-muted: rgba(0, 210, 106, 0.15);
  --color-loss: #FF4757;
  --color-loss-muted: rgba(255, 71, 87, 0.15);
  --color-neutral: #808086;
  --color-warning: #FFB800;
  --color-text: #FFFFFF;
  --color-text-secondary: #AAAAAA;
  --color-text-tertiary: #828282;
}
```

### Dark Mode

Dark mode is the native mode. Trading terminals run exclusively on dark backgrounds — eye strain over long market hours is the primary constraint. No light mode variant.

```css
[data-theme="dark"] {
  --color-bg: #000000;
  --color-surface: #0D0D0D;
  --color-surface-hover: #1A1A1A;
  --color-border: #2A2A2A;
  --color-text: #FFFFFF;
  --color-text-secondary: #AAAAAA;
}
```

## 3. Typography

### Font Stack

```css
/* Monospace for all numeric data — alignment is everything */
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

/* Sans-serif for labels, navigation, prose */
--font-sans: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
```

### Type Scale

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Ticker Price | 20px | 700 | 1.0 | JetBrains Mono |
| Data Value | 16px | 600 | 1.0 | JetBrains Mono |
| Data Unit | 12px | 400 | 1.0 | JetBrains Mono |
| H1 | 16px | 600 | 1.2 | IBM Plex Sans |
| H2 | 13px | 600 | 1.2 | IBM Plex Sans, uppercase |
| Body | 13px | 400 | 1.4 | IBM Plex Sans |
| Caption | 11px | 400 | 1.4 | IBM Plex Sans |
| Badge | 10px | 600 | 1.0 | IBM Plex Sans, uppercase |

**Font labels for catalog extraction:**

```
Display: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
Body: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

## 4. Spacing

4px baseline grid for maximum density. Trading interfaces waste no space — compact panels, tight gutters.

```css
:root {
  --space-1: 2px;   --space-2: 4px;   --space-3: 8px;   --space-4: 12px;
  --space-5: 16px;  --space-6: 20px;  --space-8: 24px;  --space-10: 32px;
  --space-12: 48px;
}
```

## 5. Layout & Composition

### Grid System

12-column grid, 2px gutters. Ultra-dense information layout with minimal padding.

```css
/* Standard panel — spans 3, 4, or 6 columns */
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: var(--space-3);
}

/* Market data strip — full width */
.market-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-2);
}
```

### Panel Structure

```css
/* .panel base styles are defined in the Grid System section above. */

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-secondary);
}
```

## 6. Components

### Price Badge

```css
/* Positive change — green */
.badge-gain {
  background: var(--color-gain-muted);
  color: var(--color-gain);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 6px;
  border-radius: 2px;
}

/* Negative change — red */
.badge-loss {
  background: var(--color-loss-muted);
  color: var(--color-loss);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 6px;
  border-radius: 2px;
}

/* Unchanged — gray */
.badge-neutral {
  background: rgba(107, 109, 118, 0.15);
  color: var(--color-neutral);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 6px;
  border-radius: 2px;
}
```

### Ticker Row

```css
/* Single instrument row in a watchlist */
.ticker-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.ticker-row:last-child { border-bottom: none; }
.ticker-row:hover { background: var(--color-surface-hover); }

.ticker-symbol {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  min-width: 60px;
}

.ticker-price {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  min-width: 80px;
  text-align: right;
}

.ticker-change {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  min-width: 70px;
  text-align: right;
}

.ticker-change.gain { color: var(--color-gain); }
.ticker-change.loss { color: var(--color-loss); }
.ticker-change.neutral { color: var(--color-neutral); }

.ticker-volume {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-secondary);
  min-width: 70px;
  text-align: right;
}
```

### Price Display

```css
/* Large price callout */
.price-display {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.0;
  letter-spacing: -0.02em;
}

.price-display.gain { color: var(--color-gain); }
.price-display.loss { color: var(--color-loss); }
```

### Line Chart

```css
/* Sparkline for price history */
.price-chart {
  height: 32px;
  display: flex;
  align-items: flex-end;
  gap: 1px;
}

.price-chart-bar {
  flex: 1;
  background: var(--color-gain);
  border-radius: 1px 1px 0 0;
  min-width: 2px;
}

.price-chart-bar.loss { background: var(--color-loss); }

@media (prefers-reduced-motion: reduce) {
  .price-chart-bar { transition: none; }
}
```

### Order Book

```css
/* Bid/ask depth display */
.order-book {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.order-book-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-2);
  padding: 2px 0;
}

.order-book-row.bid .order-book-price { color: var(--color-gain); }
.order-book-row.ask .order-book-price { color: var(--color-loss); }

.order-book-price { color: var(--color-text); }
.order-book-size { color: var(--color-text-secondary); text-align: right; }
.order-book-total { color: var(--color-text-tertiary); text-align: right; }
```

### Alert Banner

```css
/* Market alert — margin warning */
.alert-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: rgba(255, 184, 0, 0.1);
  border: 1px solid rgba(255, 184, 0, 0.4);
  border-left: 3px solid var(--color-warning);
  padding: var(--space-2) var(--space-3);
}

.alert-banner-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-warning);
}
```

### Watchlist Panel

```css
/* Compact instrument list */
.watchlist {
  display: flex;
  flex-direction: column;
}
```

## 7. Motion & Interaction

| Interaction | Duration | Easing | Effect |
|-------------|----------|--------|--------|
| Price flash | 600ms | ease-out | Background flash on value update (green/red) |
| Panel hover | 100ms | ease-in | Border brightens to accent |
| Row highlight | 80ms | ease-in | Background shifts to surface-hover |
| Chart draw | 400ms | ease-out | Bar height transition |

```css
:root {
  --transition-fast: 80ms ease-in;
  --transition-base: 100ms ease-in;
  --transition-flash: 600ms ease-out;
}
```

### prefers-reduced-motion

Price flash animations are disabled. Chart bars render at final height immediately.

```css
@media (prefers-reduced-motion: reduce) {
  .price-chart-bar { transition: none; }
}
```

## 8. Voice & Brand

### Iconography

Minimal iconography — only Lucide icons (stroke weight 1.5px, 14px default) for actionable controls. No decorative icons. Every visual element must carry financial data or indicate an interactive control.

### Tone

- **Precise**: Numbers are the language. No marketing language.
- **Dense**: Every row has meaning. No decorative whitespace.
- **Immediate**: Color is the first signal — green/red is processed before the number is read.

### Visual Signals

Color carries financial meaning, not aesthetic preference:
- **Green (`#00D26A`)** = price up, position profitable, bid side
- **Red (`#FF4757`)** = price down, position losing, ask side
- **Gray (`#808086`)** = unchanged, flat, neutral
- **Amber (`#FFB800`)** = warning, approaching limit, attention required

## 9. Anti-patterns

- Do not use green/red for anything other than gain/loss signals — color carries financial meaning
- Do not use rounded corners > 2px — trading interfaces are functional, not friendly
- Do not use proportional fonts for any numeric data — alignment of decimal points matters
- Do not animate non-data elements — motion is reserved for value changes
- Do not use light mode — extended screen time is the operating constraint
- Do not use decorative colors — every hue must indicate market state or interactive state
- Do not use tertiary text color for critical data — only timestamps and grid labels