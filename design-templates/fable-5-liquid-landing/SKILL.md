---
name: fable-5-liquid-landing
zh_name: "Fable 5 液态玻璃落地页"
en_name: "Fable 5 Liquid Glass Landing"
description: |
  Cinematic single-page landing for AI product launches: full-screen looping video hero,
  liquid-glass UI, Instrument Serif display type, marquee showcase, partner grid, and
  scroll-driven blur reveals. Use when building a premium dark marketing site for
  frontier models, developer tools, or design-forward SaaS — especially Claude Fable 5
  style product pages with copy-prompt and model-ID pills.
triggers:
  - "fable 5 landing page"
  - "liquid glass landing"
  - "cinematic ai product page"
  - "built for the curious landing"
  - "model launch landing page"
  - "Fable 5 落地页"
  - "液态玻璃官网"
od:
  mode: template
  surface: web
  platform: desktop
  scenario: marketing
  featured: 42
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  outputs:
    primary: index.html
    secondary:
      - example.html
  example_prompt: |
    Build a cinematic single-page landing for Claude Fable 5 using the liquid-glass
    template: full-screen video hero, Instrument Serif headlines, marquee showcase of
    community demos, partners grid with Open Design featured, timeline of launch tweets,
    and pricing cards. Keep the monochrome palette and sandbox-safe copy buttons.
  example_prompt_i18n:
    zh-CN: |
      用「Fable 5 液态玻璃落地页」模板做一个 Claude Fable 5 产品介绍站：全屏视频 Hero、Instrument Serif 大标题、案例滚动墙、合作方网格、推特时间线和定价卡片。保持黑白电影感与液态玻璃 UI。
  capabilities_required:
    - file_write
---

# Fable 5 Liquid Glass Landing

Produce a premium dark single-page marketing site with liquid-glass chrome, a
full-screen looping video hero, and scroll-driven sections. The bundled
`example.html` is a self-contained preview demo; `assets/template.html` is the
customizable HTML seed agents copy to `index.html`.

## Resource map

```text
design-templates/fable-5-liquid-landing/
├── SKILL.md
├── example.html              # self-contained preview demo
├── open-design.png           # Open Design logo asset
├── assets/
│   └── template.html         # seed → copy to index.html
└── references/
    └── checklist.md
```

## Workflow

1. Read the user brief: product name, headline, model ID (if any), hero video URL,
   stat cards, showcase items, partners, and pricing.
2. **Fast path (HTML seed):** Copy `assets/template.html` to `index.html`. Replace
   `{{PLACEHOLDER}}` tokens and section copy. Rewrite `#seed-data` as valid JSON;
   set `sitePrompt` with `JSON.stringify(prompt)` — never splice raw prompt text into
   `<script>` or HTML attributes. Keep liquid-glass CSS and FadingVideo logic intact.
3. **Full path (React):** Scaffold Vite + React 18 + TypeScript + Tailwind 3 +
   framer-motion + lucide-react. Reuse the design tokens from `example.html` /
   `assets/template.html` and ship with `base: './'` and CDN video URLs. Do not
   commit bundled `.js` into `design-templates/` — Open Design guard rejects residual
   JavaScript in the repo.
4. Preserve interaction patterns:
   - `FadingVideo`: rAF crossfade (500ms), manual loop, no CSS opacity transitions
   - `SpotlightCard`: mouse-following radial highlight + hover lift
   - Showcase: dual-row infinite marquee, pause on hover
   - Hero seam: bottom gradient into black sections
5. Open Design integration: feature Open Design in navbar CTA, partners hero card,
   and footer credit when relevant.
6. Sandbox safety: wrap `navigator.clipboard` in try/catch; no `localStorage`,
   `confirm`, `alert`, or `window.open`.
7. Validate against `references/checklist.md` before emitting.

## Design tokens (do not drift)

- Display font: Instrument Serif (italic headings)
- Body: system sans stack
- Palette: `#000` base, white text, `white/70` secondary, `white/40` dividers only
- `.liquid-glass`: `rgba(255,255,255,0.01)` + `backdrop-filter: blur(4px)` +
  inset highlight + `::before` gradient border via mask-composite
- Section backdrops: faint graph grid + soft white glow blob + optional watermark word

## Output contract

One orientation sentence, then:

```xml
<artifact identifier="fable-5-liquid-landing" type="text/html" title="Fable 5 Liquid Glass Landing">
<!doctype html>
<html>...</html>
</artifact>
```
