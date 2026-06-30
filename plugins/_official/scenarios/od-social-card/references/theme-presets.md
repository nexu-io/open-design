# Theme Presets

Use one theme for one image package. Do not mix palettes across pages unless the user explicitly asks for a deliberate multi-chapter system.

## Editorial Magazine x E-ink Palettes

These are adapted from the Guizang PPT electronic-magazine mode for static Rednote and WeChat images.

### Ink Classic

Use for business commentary, AI essays, product thinking, and neutral editorial posts.

```css
:root {
  --paper: #f3f0e8;
  --paper-2: #ebe6da;
  --ink: #0a0a0b;
  --muted: #68625a;
  --line: rgba(10,10,11,.22);
  --accent: #111111;
  --accent-soft: #d8d2c6;
}
```

### Indigo Porcelain

Use for technology, research, data, AI infrastructure, and calm analytical writing.

```css
:root {
  --paper: #f2f4f5;
  --paper-2: #e5ebef;
  --ink: #0a1f3d;
  --muted: #5f6d78;
  --line: rgba(10,31,61,.20);
  --accent: #315d93;
  --accent-soft: #d7e1ec;
}
```

### Forest Ink

Use for hiking, outdoor, nature, sustainability, personal field notes, and grounded lifestyle posts.

```css
:root {
  --paper: #f5f1e8;
  --paper-2: #e8dfcf;
  --ink: #16251b;
  --muted: #5d665d;
  --line: rgba(22,37,27,.22);
  --accent: #2e6b4f;
  --accent-soft: #d4dfd2;
}
```

### Kraft Paper

Use for memory, craft, personal essays, old objects, creator notes, and warm low-tech topics.

```css
:root {
  --paper: #eedfc7;
  --paper-2: #dfc9a8;
  --ink: #2a1e13;
  --muted: #755f49;
  --line: rgba(42,30,19,.24);
  --accent: #9b5a2e;
  --accent-soft: #d5b58f;
}
```

### Dune

Use for design, object studies, portfolio-like covers, gallery tone, and restrained aesthetic posts.

```css
:root {
  --paper: #f0e6d2;
  --paper-2: #ded0b7;
  --ink: #1f1a14;
  --muted: #6f6557;
  --line: rgba(31,26,20,.22);
  --accent: #8f7650;
  --accent-soft: #d4c2a4;
}
```

### Midnight Ink

The **only** official dark Editorial palette. Use for game key art, night photography, cinematic covers, dark-themed cultural pieces — content whose source imagery is already dark and would be diminished by paper backgrounds. Do not improvise other dark palettes; if Midnight Ink does not fit, pick a different mode (Editorial dark is not a universal switch).

```css
:root {
  --paper: #0e0d0c;
  --paper-2: #1a1714;
  --ink: #ece2cf;
  --muted: #9a8c75;
  --line: rgba(236,226,207,.22);
  --accent: #d4a04a;
  --accent-soft: #3a2a14;
}
```

Midnight Ink **must** also override two background layers — light-paper math does not carry over:

```css
[data-theme="midnight-ink"] .grain {
  opacity: .26;
  mix-blend-mode: screen;
  background-image: radial-gradient(rgba(255,244,214,.10) 1px, transparent 1px);
}
[data-theme="midnight-ink"] .paper-wash {
  background:
    radial-gradient(80% 50% at 28% 16%, rgba(212,160,74,.12), transparent 64%),
    radial-gradient(70% 60% at 80% 86%, rgba(60,40,20,.20), transparent 72%),
    linear-gradient(180deg, rgba(236,226,207,.02), rgba(0,0,0,.32));
}
[data-theme="midnight-ink"] .frame-img {
  background: #18120f;
  box-shadow: 0 0 0 1px rgba(236,226,207,.10);
}
```

The seed `template-editorial-card.html` ships these overrides — just switch `data-theme` and they apply automatically.

Magazine palette rules:

- Use `--paper` as the main background and `--ink` as primary type.
- Use `--accent` sparingly: section marker, page number, pull quote rule, or one highlighted phrase.
- `--paper-2` can support photo wells, issue strips, or checklist bands.
- Light palettes (the first five): do not turn into beige-on-beige. Maintain real contrast.
- Midnight Ink: do not stack opaque cards or fills on the page. Dark Editorial relies on photo bleeds + warm gilt accent for hierarchy, not background blocks.

## Swiss International Palettes

These are adapted from the Guizang PPT Swiss mode.

### IKB Blue

Default for AI, technology, product updates, design, and engineering topics.

```css
:root {
  --paper: #fafaf8;
  --ink: #0a0a0a;
  --grey-1: #f0f0ee;
  --grey-2: #d4d4d2;
  --grey-3: #737373;
  --accent: #002FA7;
  --accent-on: #ffffff;
}
```

### Lemon Yellow

Use for young, consumer, active, retail, sporty, or playful information.

```css
:root {
  --paper: #fafaf8;
  --ink: #0a0a0a;
  --grey-1: #f0f0ee;
  --grey-2: #d4d4d2;
  --grey-3: #737373;
  --accent: #FFD500;
  --accent-on: #0a0a0a;
}
```

### Lemon Green

Use for ecology, future, emerging tech, health, and highlighter-like contemporary topics.

```css
:root {
  --paper: #fafaf8;
  --ink: #0a0a0a;
  --grey-1: #f0f0ee;
  --grey-2: #d4d4d2;
  --grey-3: #737373;
  --accent: #C5E803;
  --accent-on: #0a0a0a;
}
```

### Safety Orange

Use for industrial, warning, urgency, risk, decision points, and sharp corrections.

```css
:root {
  --paper: #fafaf8;
  --ink: #0a0a0a;
  --grey-1: #f0f0ee;
  --grey-2: #d4d4d2;
  --grey-3: #737373;
  --accent: #FF6B35;
  --accent-on: #ffffff;
}
```

Swiss palette rules:

- Use exactly one `--accent`.
- Do not use gradients, shadows, glass, or mixed accent colors.
- If the accent is yellow or green, text on accent must use `--accent-on: #0a0a0a`.
- Prefer pure blocks, hairline rules, and grid rhythm.
