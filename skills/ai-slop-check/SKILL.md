---
name: "Ai Slop Check"
description: "Claude design system prompt skill for Ai Slop Check"
triggers:
  - "claude ai slop check"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# AI Slop Check: Detect and Fix Generic AI Aesthetics

Review the current design for the visual tropes that signal "AI-generated template," and fix any found. These patterns read as default, not intentional — a design that looks like a hundred other AI outputs fails to look like the user's design.

Each rule is **positive-first**: the default to reach for, then the patterns to detect and replace. At write-time, bias toward the default; at review-time, scan for the detection patterns.

## Phase 1: Identify the surface

Review the HTML/CSS file the user just edited or asked about; otherwise files modified this session; if unclear, ask. Read the file and skim referenced CSS, tokens, and component files so you can resolve actual values.

## Phase 2: Single-pass review

Apply each rule below in a single pass — these patterns are obvious enough that parallel dispatch is overkill. Report every detection, including uncertain or low-severity ones, with a confidence and severity estimate. Coverage is the job at this stage; filtering happens in Phase 3 or in `polish-pass` aggregation.

### 1. Gradients — flat or subtle, on-tone

**Default:** flat color from the design system, or a subtle on-tone two-stop gradient. Flat is almost always stronger.

**Detect & replace:** rainbow / 3+ color gradients; saturated purple-to-pink, orange-to-pink, or other "trendy" blends on heroes, buttons, or large surfaces; gradient overlays on imagery that don't improve legibility or hierarchy.

### 2. Emoji — functional or brand-driven only

**Default:** no emoji, unless the brand uses them in existing materials, the emoji is functional (status indicator, category marker), or the user asked.

**Detect & remove:** emoji prepending headlines, buttons, or list items (`🚀 Get Started`); repeated emoji filler (`🎉🎉🎉`); emoji bullets without meaning. If the layout relied on the emoji's visual weight, use a real icon (Feather, Material, Phosphor, Heroicons) or better typographic hierarchy.

### 3. Cards — shadow, thin border, or background separation

**Default:** subtle shadow, thin all-around border, or background separation. Reserve `border-left: 4px solid` for semantic emphasis (callouts, alerts, status).

**Detect & replace:** `border-radius: 12px` + `border-left: 4px solid` used as the *default* card style — this combination reads as "default SaaS template." Keep the left border only when it carries that semantic meaning, or when it comes from an existing design system you're matching.

### 4. Imagery — real, licensed, or honest placeholder

**Default, in order:** real photography (Unsplash, brand assets); professional illustration; honest placeholder — striped background with monospace label like `product shot (1200×800)`. A placeholder beats a bad illustration: it signals "asset needed" without pretending to be final.

**Detect & replace:** custom SVG illustrations of people, scenes, or concepts not drawn by a skilled illustrator; "AI-style" character art (giant heads, flat-color blobs, identical posing); placeholder-quality decoration presented as final.

### 5. Type — fonts chosen with intent

**Default:** a font matched to the brand's tone or the medium. With no brand, suggest 2–3 alternatives matching the design's tone (geometric, humanist, modern, classical) and let the user pick.

**Detect & question** bare use of Inter, Roboto, Arial, Fraunces, or bare system stacks as silent defaults. Keep them only if the brand specifies them or the user confirmed. Don't silently swap one generic for another.

### 6. Color — subtly toned whites and blacks

**Default:** whites and blacks toned to the palette — warm `#FFFAF0`/`#2D2118`, cool `#F5F7FA`/`#1F2937`, neutral `#FAFAFA`/`#1A1A1A`.

**Detect & replace:** exact `#FFFFFF` background with exact `#000000` text — harsh, cold, and unfinished.

### 7. Color values — trace to a token or harmonious palette

**Default:** every color traces to a design token, brand variable, or `oklch()`-derived palette (use `oklch()` to keep lightness and chroma consistent when building from scratch).

**Detect & consolidate:** colors that don't trace anywhere — five slightly different blues across one file means colors were invented inline.

### 8. Spacing — snap to a 4px or 8px scale

**Default:** spacing tokens (`--space-xs: 4px` through `--space-2xl: 64px`); multiples of 4 or 8 feel intentional.

**Detect & replace:** off-scale values (`padding: 7px 15px`, `margin: 18px`, `gap: 13px`) — they feel chaotic.

### 9. The editorial-warm house style — deliberate or absent

**Default:** an aesthetic direction chosen for the brief (see `frontend-aesthetic-direction`). The warm-editorial look is legitimate for editorial, hospitality, and portfolio work — when it traces to a brand or an explicitly committed direction.

**Detect & question** the combination, absent a brand reason: cream / warm off-white backgrounds in the `#F4F1EA` family; serif display faces as silent defaults (Georgia, Playfair Display, Fraunces); italic word-accents in headlines; terracotta / amber accents. Any one can be deliberate. All together — especially on a dashboard, dev tool, fintech, healthcare, or enterprise surface — is the default-template look, today's equivalent of the purple gradient. Replace with the committed direction, or flag for the user if none exists.

## Phase 3: Fix and summarize

Apply fixes directly. Where multiple options are reasonable (e.g., which non-Inter font), pick the most defensible default and note it so the user can override. Summarize: tropes found by category, fixes applied, open questions for the user.
