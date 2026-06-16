---
name: lingyan-wechat-mp
description: |
  A multi-screen WeChat Mini Program UI prototype for an AI-powered Chinese
  text creation tool. Covers blessing generation, couplet pairing, poem
  composition, and diss writing — with modern Chinese editorial design language
  (Noto Serif SC, cinnabar red accent, newspaper masthead typography).
  Use when the brief asks for a "WeChat mini program", "AI writing tool",
  "Chinese text generation app", "blessing generator", "couplet app",
  or "poem writing app".
triggers:
  - "wechat mini program"
  - "微信小程序"
  - "AI writing"
  - "AI 写作"
  - "blessing generator"
  - "祝福语"
  - "couplet"
  - "对联"
  - "poem app"
  - "古诗"
  - "diss"
  - "怼人"
  - "中文创作"
od:
  mode: prototype
  platform: mobile
  scenario: personal
  preview:
    type: html
    entry: examples/home.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [state-coverage, animation-discipline]
  example_prompt: "Design a WeChat Mini Program for AI-powered Chinese text creation — blessing generation, couplet pairing, poem composition, and playful diss writing. Modern Chinese editorial style with cinnabar red accent."
---

# LingYan WeChat Mini Program Skill

Produce a multi-screen WeChat Mini Program prototype with modern Chinese editorial design language.

## Design System — Direction B (Modern Chinese Editorial)

### Tokens

```css
:root {
  --bg: #faf9f7;          /* rice-paper off-white */
  --surface: #ffffff;      /* card / overlay surface */
  --surface-2: #f2f0ec;   /* pressed / secondary surface */
  --fg: #1a1814;           /* primary text, warm-black */
  --fg-2: #4a4640;         /* secondary text */
  --muted: #96908a;        /* helper text, metadata */
  --divider: #e4e0da;      /* borders, separators */
  --accent: #c0392b;       /* cinnabar red — sole chromatic accent */
  --accent-lt: #fdf0ee;    /* light accent background */
  --serif: "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif;
  --sans: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif;
}
```

### Visual Language Rules

1. **Masthead header** — 3px top rule + 1px bottom rule (newspaper double-rule). Brand name in Noto Serif SC 20px semibold, left-aligned.
2. **Cinnabar red budget** — ≤ 3 accent touchpoints per screen (eyebrow badge, tab active state, hero kicker).
3. **Corner radius** — 2px universal (square, editorial). No pill shapes except chips.
4. **Line weight hierarchy** — 3px (masthead top) → 1.5px (tab bar top) → 1px (section rules) → 0.5px (card internal dividers).
5. **Typography** — Noto Serif SC for display/headings, system sans for body. Font-weight cap: 600 (no 700/bold).
6. **Iconography** — Single CJK characters in square frames replace traditional SVG icons (e.g. 「祝」「联」「诗」「怼」).
7. **Card language** — White cards on rice-paper background, top-border accent only on featured cards, no left-border stripes.

### Forbidden (anti-AI-slop)

- No blue-purple gradients
- No emoji icons
- No left-border colored stripe cards
- No pill-shaped buttons (except chips)
- No dark/spooky backgrounds
- No Inter/Roboto as display face
- No invented metrics

## Workflow

1. **Read the design system tokens above.** Bind them to `:root` before any layout work.
2. **Plan screens** from the brief. The standard LingYan screen set:
   - `splash.html` — rice-paper entry with brand wordmark + progress bar
   - `home.html` — masthead + hero headline + featured card (AI blessing) + 2-col minor cards + quick chips + tab bar
   - `blessing.html` / `blessing-result.html` — scene selection → AI-generated blessing with feedback thumbs
   - `diss.html` / `diss-result.html` — target/tone selection → generated diss with feedback thumbs
   - `couplet.html` / `couplet-result.html` — game mode: AI gives upper line, user responds, AI scores
   - `poem.html` / `poem-result-v2.html` — theme/form selection → vertical poem display with critique
   - `login.html` — masthead + benefit list (Chinese numerals) + WeChat login button
   - `profile.html` / `profile-no-login.html` — square avatar + stats + quick-entry hanzi blocks
   - `favorites.html` / `history.html` — badge-typed card lists with search
   - `points-center.html` — balance hero + daily check-in + rules + transaction history
3. **Each screen is its own HTML file.** Do not combine into one scrolling page.
4. **Tab bar** — 5 tabs: 首页 / 创作 / 收藏 / 历史 / 我的. Active tab uses `--accent` color.
5. **Result pages** — include a large faint watermark character (「福」「怼」「诗」「联」) at card bottom-right, opacity 0.04–0.06, as brand imprint for screenshots.
6. **Feedback mechanism** — thumbs up/down only on AI-dominant generation pages (blessing, diss). Not on co-creation pages (poem, couplet).
7. **Animations** — breathing pulse `cubic-bezier(0.45, 0, 0.55, 1)` for loading states; `scale(0.97)` active press on cards; `will-change: transform` on animated elements.

## Output

A folder of HTML files, one per screen, with an `index.html` showcase that embeds all screens as scaled iframes in a gallery layout.
