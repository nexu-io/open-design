# Skywalker Design System

> AI-driven Web3 portfolio system. Personal portfolio of **Christian Wu** — fusing NFT marketplace interaction patterns, an AI assistant panel, and MCP tool integration UI to showcase UI/UX, AI workflow, and Web3 product capabilities.

Project codename: **Skywalker**.
Aesthetic: developer-tool meets Web3 dashboard meets premium portfolio. High contrast, precise typography, controlled glow, no neon-cyberpunk excess.

---

## Index

```
.
├── README.md                    ← you are here
├── SKILL.md                     ← Claude-Code-compatible skill manifest
├── colors_and_type.css          ← all design tokens (light + dark)
├── assets/                      ← logos, icons, brand marks
├── fonts/                       ← (Google CDN — no local files)
├── preview/                     ← design-system review cards (HTML)
└── ui_kits/
    └── skywalker/               ← portfolio UI kit
        ├── index.html           ← clickable 8-screen prototype
        └── *.jsx                ← components
```

---

## Sources & references (read-only)

The following Figma files were attached as inspiration. They are **reference only** — nothing is copied verbatim and brand names are anonymised.

1. **Code+UI** (`Code+UI - Partial file saved 2026-5-10.fig`) — primary visual direction. Provided the developer-tool dashboard structure, neutral / palette / spacing / shadow systems, button + card vocabularies, and Inter-led typography scale.
2. **Dash NFT Marketplace** (`Dash NFT Marketplace by Kijiji Hub (Community).fig`) — referenced only for Web3 information architecture (collection grids, asset detail pages, wallet flows).
3. **MCP Apps for Claude** (`MCP Apps for Claude (Community).fig`) — referenced only for AI-assistant patterns: chat panel, prompt composer, tool-call status, MCP integration cards.

The user uploaded SVG logos:
- `Skywalker-logo-icon.svg`, `Skywalker-logo-wordmark.svg` — product mark
- `christianwu-logo.svg`, `christianwu-black.svg`, `christianwu-white.svg` — personal mark

---

## CONTENT FUNDAMENTALS

**Voice.** First-person singular but understated — "I design", "I ship", not "we". Reads like a senior IC writing release notes, not a marketer. Confidence comes from specificity (numbers, dates, tool names), never from adjectives.

**Tone.** Calm, precise, slightly technical. Lower-case in chrome (nav, button labels, captions) and Title Case in headings. Periods are optional in caption-grade UI text. Avoid exclamation marks entirely.

**Casing.**
- `lowercase mono` for system / tool labels: `wallet · 0xa3…f9`, `tool: figma_export`, `model: claude-sonnet-4.5`
- `Title Case` for section headers and project names: `Selected Work`, `Skywalker MCP Suite`
- `SENTENCE case` for body copy.

**Pronouns.** "I" for the portfolio author. "You" only in the AI-assistant surface ("Ask me what I've shipped"). Never "we".

**Numbers and units.** Use the actual figure: `2.4k commits`, `12 case studies`, `0.42 ETH`, never "lots of" or "thousands".

**Emoji.** Not used. Iconography is geometric line/solid SVG.

**Examples.**

- Empty state: `no projects match. try clearing filters or asking the assistant.`
- Tool call: `→ figma.export · 1 frame · 1.2s`
- Hero subhead: `Designer–engineer building AI-native interfaces and on-chain product surfaces.`
- Wallet status: `connected · arbitrum · 0xa3…f9`

---

## VISUAL FOUNDATIONS

**Color.** Dark is canonical (`--bg-canvas: #050507`); light is supported and equally tuned. Accent is **Christian Wu Blue** `#0500FF` (logo source). Secondary accent is **cyan** `#56D6FF`, used only for AI-state highlights and focus rings on dark. The neutral scale (`--n-10 … --n-900`) does 90% of the work.

**Type.** `Inter` for everything except code (`JetBrains Mono`). Display sizes use `Inter Light` 80px to feel editorial. Body uses `Regular`/`Medium`. Numbers and identifiers (wallet, tx hash, percentages, file paths) use mono **always** — this is a developer-tool tell.

**Spacing.** 4-pt grid. Generous whitespace at the page level (`--sp-12: 80px` between sections), tight inside cards (`--sp-5: 16px` padding, `--sp-3: 8px` gaps). Density is allowed in dashboard rows but never crowded.

**Backgrounds.** No photographic full-bleed. Allowed:
- Solid `--bg-canvas`
- Subtle 32-px grid overlay (`.sw-grid-bg`) at 4% opacity
- Subtle dot grid (`.sw-dotgrid-bg`) for hero
- Single conic-gradient *glow* behind hero / NFT detail (cyan→pink→blue→violet, 20% opacity, mix-blend-mode: screen)
- No noise textures unless inside an NFT artwork tile.

**Imagery.** Cool-leaning. NFT artworks render at 4:5 or 1:1, slight inner shadow. Project case-study cover shots are mocked as device frames or browser chromes, never lifestyle photography.

**Animation.** Restrained. `var(--ease-out)` 200ms for hovers. No bounces. The only animated element is a slow conic-gradient rotation on the hero glow (12s linear). Tool-call rows fade-in upward 4px on stream.

**Hover.** Surfaces lift via `--shadow-lg`. Buttons get `--shadow-glow` (1px ring + 8/40 blur). Text links underline on hover only — never default underlined.

**Press.** 0.96 scale + faster ease (`--d-fast`). No color change.

**Borders.** Default is `1px solid var(--border-default)` (10% white on dark). Focus uses `--border-focus`. Strong borders (18%) are reserved for primary surfaces.

**Shadows.** Five-tier elevation (`xs → xl`) plus `--shadow-glow` for the rare hero / primary CTA. On dark, shadows are subtle pixel-shifts more than diffused blur. `--shadow-inner` adds a single highlight pixel on top edges of glass.

**Transparency / blur.** Used for:
- Top nav (`backdrop-filter: blur(20px)` over canvas)
- Modal scrim
- Glass-style buttons (`rgba(0,0,0,0.6)` + 20px blur)
Avoid blur elsewhere — it dilutes precision.

**Corner radius.** `--r-md: 8px` is the default. `--r-xl: 14px` for cards. `--r-3xl: 24px` for hero panels and modals. `--r-pill` for tags / wallet badges.

**Cards.** Border-only on dark (no shadow), `--bg-elevated` background, `--r-xl` corners, internal padding `--sp-7: 24px`. Hover adds `--shadow-lg`. Cards never have left-border accent stripes.

**Layout rules.** Sidebar width 240px (collapses to 64px). Top bar 56px. Content max-width 1280px centred. Detail panels open as right-rail drawers (480px) on desktop, full-screen on mobile.

---

## ICONOGRAPHY

The brand uses **Lucide** (CDN: `lucide-static`) at `1.5px` stroke weight, `20px × 20px` default size. Lucide is a clean line-icon family that pairs well with Inter and matches the developer-tool aesthetic of the source material.

For brand marks, see `assets/`:
- `logo-icon.svg` — Skywalker icon (geometric chevron form)
- `logo-wordmark.svg` — full Skywalker wordmark
- `christianwu-mark.svg` — Christian Wu personal monogram (blue `#0500FF`)
- `christianwu-black.svg` / `christianwu-white.svg` — solid-square versions for tile / favicon use

No emoji, no unicode-as-icons. Currency icons use Lucide's geometric coin/diamond glyphs — not real chain logos — to avoid trademark issues.

---

## Index → other files

- `colors_and_type.css` — every token (CSS vars). Import this once.
- `preview/*.html` — review cards for the Design System tab.
- `ui_kits/skywalker/index.html` — interactive prototype: Landing → Dashboard → Collection → NFT Detail → AI Assistant → MCP Apps → Wallet → Case Study.
- `SKILL.md` — Claude Skill manifest.
