# Design System Inspired by Perplexity AI

> Category: AI & LLM
> Conversational AI search engine. Deep-dark canvas, sharp typography, single violet accent, dense information hierarchy.

## 1. Visual Theme & Atmosphere

Perplexity reads like a research terminal: unhurried, precise, and confident. The dark surface is not decorative — it reduces visual noise so citations, sources, and answers can breathe. There is no gradient hero, no animated blob, no hero illustration. The chrome disappears and the content leads. Light mode exists but the dark variant is the brand-defining surface.

Core atmosphere words: **grounded, sharp, credible, quiet**. Every layout decision serves legibility over aesthetics.

## 2. Color

All values are sampled from Perplexity's production interface and marketing site (May 2025).

### Dark surface (default)

| Token | Hex | OKLch | Role |
|---|---|---|---|
| `--bg-base` | `#0f0f10` | `oklch(8% 0.004 280)` | Page background |
| `--bg-surface` | `#19191a` | `oklch(12% 0.004 280)` | Card / sidebar surface |
| `--bg-elevated` | `#232325` | `oklch(16% 0.005 280)` | Tooltip, popover, hover state |
| `--border` | `#2e2e30` | `oklch(21% 0.005 280)` | Divider, input border |
| `--text-primary` | `#f0f0f0` | `oklch(95% 0 0)` | Body copy, headings |
| `--text-secondary` | `#9b9b9b` | `oklch(64% 0 0)` | Meta, captions, labels |
| `--text-tertiary` | `#5c5c5e` | `oklch(42% 0 0)` | Placeholder, disabled |
| `--accent` | `#a855f7` | `oklch(62% 0.22 307)` | Primary CTA, focus ring, active tab |
| `--accent-hover` | `#c084fc` | `oklch(72% 0.20 307)` | Hover state on accent |
| `--accent-subtle` | `#3b1f5e` | `oklch(22% 0.14 307)` | Accent tint background |
| `--success` | `#22c55e` | `oklch(72% 0.19 145)` | Verified source badge |
| `--warning` | `#f59e0b` | `oklch(74% 0.17 72)` | Caution |
| `--error` | `#ef4444` | `oklch(63% 0.21 27)` | Error state |

### Light surface

| Token | Hex | Role |
|---|---|---|
| `--bg-base` | `#ffffff` | Page background |
| `--bg-surface` | `#f8f8f8` | Card surface |
| `--bg-elevated` | `#f0f0f0` | Hover / elevated |
| `--border` | `#e0e0e0` | Divider |
| `--text-primary` | `#0f0f10` | Body copy |
| `--text-secondary` | `#5c5c5e` | Meta |
| `--accent` | `#7c3aed` |  Primary CTA, focus ring, active tab |

### Usage rules

- Accent (`#a855f7`) is reserved for a single interactive element per view — the primary action. Do not use it decoratively.
- Never use white text on the accent color in body copy; reserve that combination for buttons and badges only.
- Backgrounds stack in exactly three levels: base → surface → elevated. Do not invent a fourth.

## 3. Typography

Perplexity uses a system-default sans-serif stack for UI elements and a clean geometric monospace for code blocks. No custom display face is licensed for third-party use.

### Families

| Role | Family | Fallback |
|---|---|---|
| UI / body | `"Inter"` | `ui-sans-serif, system-ui, -apple-system, sans-serif` |
| Code / citations | `"JetBrains Mono"` | `ui-monospace, "Cascadia Code", monospace` |
| Numeric data | `"Inter"` with tabular nums | feature: `tnum`, `ss01` |

### Scale

| Label | Size | Line height | Weight | Usage |
|---|---|---|---|---|
| `display` | 2rem / 32px | 1.2 | 600 | Page title, hero answer headline |
| `heading-l` | 1.375rem / 22px | 1.3 | 600 | Section heading |
| `heading-m` | 1.125rem / 18px | 1.4 | 600 | Sub-section heading |
| `body` | 0.9375rem / 15px | 1.65 | 400 | Primary reading copy |
| `body-sm` | 0.8125rem / 13px | 1.55 | 400 | Secondary, meta |
| `caption` | 0.6875rem / 11px | 1.4 | 400 | Source labels, timestamps |
| `code` | 0.875rem / 14px | 1.6 | 400 | Inline code, citations |

### Rules

- Line length: 55–70 characters for body copy. Wider than 80 chars in dense reading layouts breaks comprehension.
- Inter is loaded from Google Fonts or self-hosted; do not use Helvetica or Arial as a substitute — the weight rendering differs.
- Bold (700) is used for answer headings only, never for emphasis within body paragraphs; use color change or size for inline emphasis.

## 4. Spacing & Grid

Perplexity uses an **8px base unit** throughout.

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Icon gap, tight label padding |
| `--space-2` | 8px | Inline padding, small element gap |
| `--space-3` | 12px | Component internal padding |
| `--space-4` | 16px | Card padding, section gap |
| `--space-5` | 24px | Between-component spacing |
| `--space-6` | 32px | Section divider gap |
| `--space-7` | 48px | Page-level vertical rhythm |
| `--space-8` | 64px | Hero / above-fold padding |

### Layout grid

- **Max content width:** 720px for the answer column (reading context); 1100px for the full-page shell.
- **Sidebar:** 280px fixed; collapses under 900px viewport.
- **Columns:** 12-column, 16px gutter.
- Mobile: single column, 16px side margin.

### Border radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Inline badge, tag |
| `--radius-md` | 8px | Input field, card |
| `--radius-lg` | 12px | Modal, popover |
| `--radius-xl` | 16px | Bottom sheet, floating panel |
| `--radius-full` | 9999px | Pill button, avatar |

## 5. Layout & Composition

### The answer-first pattern

The primary layout is a centered single-column answer, flanked by a source sidebar on the right. Nothing competes for attention above the fold. The question appears as a `heading-l` immediately followed by the answer body — no hero image, no decorative element.

### Source cards

Sources appear as compact horizontal chips (favicon + domain + excerpt) stacked below the answer or in a right rail. Each chip has:
- `--bg-surface` background
- `--border` 1px stroke
- `--radius-md` corners
- Favicon 16×16, clipped to circle
- Domain text in `body-sm`, secondary color
- Hover: `--bg-elevated`, no transition (instant)

### Search bar

- Full-width, `--bg-surface` fill, `--border` 1px stroke, `--radius-xl`
- Inner padding: 14px horizontal, 12px vertical
- Placeholder in `--text-tertiary`
- Focus: `--accent` 2px outline, no box-shadow
- Submit icon: right-aligned, accent color on focus

### Iconography

16×16 and 20×20 only. Stroke-based, 1.5px stroke weight, square caps, miter joins. Never fill-based icons in the UI chrome. Heroicons (MIT) is the closest open-source match.

## 6. Components

### Primary button

```css
background: var(--accent);
color: #fff;
border-radius: var(--radius-md);
padding: 10px 20px;
font-size: 0.9375rem;
font-weight: 500;
border: none;
cursor: pointer;
transition: background 120ms ease;

&:hover { background: var(--accent-hover); }
&:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
&:disabled { opacity: 0.4; cursor: not-allowed; }
```

### Ghost button

```css
background: transparent;
color: var(--text-primary);
border: 1px solid var(--border);
border-radius: var(--radius-md);
padding: 9px 20px;

&:hover { background: var(--bg-elevated); }
```

### Source badge

```css
display: inline-flex;
align-items: center;
gap: 6px;
background: var(--bg-surface);
border: 1px solid var(--border);
border-radius: var(--radius-sm);
padding: 3px 8px;
font-size: 0.6875rem;
color: var(--text-secondary);
```

### Answer card

```css
background: var(--bg-surface);
border: 1px solid var(--border);
border-radius: var(--radius-lg);
padding: var(--space-5);
```

No drop shadow. Elevation is communicated through border contrast, not shadow.

### Input / search field

```css
background: var(--bg-surface);
border: 1px solid var(--border);
border-radius: var(--radius-xl);
padding: 12px 16px;
font-size: 0.9375rem;
color: var(--text-primary);
outline: none;

&:focus { border-color: var(--accent); }
```

### Tab bar

Tabs use `--text-secondary` by default. Active tab: `--text-primary` + 2px bottom border in `--accent`. No background highlight on the active tab.

### Skeleton loader

```css
background: linear-gradient(
  90deg,
  var(--bg-elevated) 25%,
  var(--bg-surface)  50%,
  var(--bg-elevated) 75%
);
background-size: 400% 100%;
animation: skeleton-shimmer 1.4s ease infinite;
border-radius: var(--radius-sm);
```

## 7. Motion & Interaction

Perplexity's interactions are nearly imperceptible — the brand is anti-animation. Every transition exists to prevent jarring state jumps, not to delight.

| Action | Duration | Easing |
|---|---|---|
| Hover state change | 120ms | `ease` |
| Panel / sidebar open | 160ms | `ease-out` |
| Modal appear | 200ms | `ease-out` |
| Skeleton shimmer | 1400ms | `ease` infinite |
| Accordion expand | 180ms | `ease-in-out` |

Rules:
- No spring physics, no bounce, no overshoot.
- `prefers-reduced-motion: reduce` → all transitions collapse to 0ms instant.
- No entrance animations for content — the answer appears immediately, not with a fade-in sequence.
- The streaming answer text appears character-by-character via the model stream, not via CSS animation.

## 8. Voice & Brand

### Tone

- **Precise:** Say the thing directly. No throat-clearing ("Great question!"), no filler phrases.
- **Cited:** Every factual claim is attributed. Hedging language ("according to", "reportedly") is preferred over assertions.
- **Neutral:** No personality performance. Perplexity is a tool, not a friend. The interface does not compliment the user.
- **Dense:** Short paragraphs, numbered lists for steps, bullet lists for options. Wall-of-text answers are a bug.

### UI copy patterns

| Context | Pattern |
|---|---|
| Empty state | `Ask anything.` — no emoji, no exclamation mark |
| Loading | `Searching…` — ellipsis, no spinner label |
| Error | `Something went wrong. Try again.` — direct, no apology |
| Success | No toast — the result is the confirmation |
| CTA | `Search`, `Ask`, `Summarize` — verb-only, no "Click to …" |

### What Perplexity is not

- Not playful (no winking emoji, no casual slang in UI copy)
- Not enterprise-formal (no "leverage", no "synergy")
- Not a news outlet (no editorial headlines, no opinionated framing)

## 9. Anti-patterns

These patterns are inconsistent with the Perplexity visual language and should be avoided in any artifact using this design system.

- **Gradient backgrounds.** `--bg-base` is a flat near-black. No hero gradients, no mesh gradients, no color blobs.
- **Drop shadows.** Elevation is expressed through background color steps (`base → surface → elevated`), never box-shadow.
- **Colorful icons.** All UI icons are monochrome at `--text-secondary`. No multi-color icon sets.
- **Rounded pill cards.** Cards use `--radius-lg` (12px), not full-pill radii. Pill shapes are reserved for tags and avatars only.
- **Decorative illustration.** No isometric 3D, no blob characters, no abstract art in the UI chrome. If an image is shown, it is a source thumbnail or user-uploaded content.
- **Accent overuse.** Purple (`--accent`) appears once per view: the primary button or the active focus state. Using it for headings, dividers, or backgrounds breaks the hierarchy.
- **Modal overload.** Perplexity resolves choices inline (inline pickers, inline follow-ups) rather than spawning a blocking modal dialog.
- **Capitalized section labels.** Section labels are sentence case, not ALL CAPS or Title Case.
- **Inter at display size as a display face.** Inter at 2rem+ looks thin. Use weight 600, not 700, for display headings, and never stretch or condense it.
