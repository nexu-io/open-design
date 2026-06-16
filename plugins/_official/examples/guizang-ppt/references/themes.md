# Theme Color Presets

5 carefully tuned color palettes that keep the "editorial magazine × electronic ink" aesthetic from collapsing. **Custom colors are not allowed: a wrong color pairing makes the visuals ugly in an instant**; pick only from the presets below.

---

## How to use

1. Ask the user which one to pick (or recommend one based on the content)
2. Open the `<style>` block of `assets/template.html`
3. Find the `:root{` block at the top
4. **Replace as a whole** the lines marked with the "theme color" comment: `--ink` / `--ink-rgb` / `--paper` / `--paper-rgb` / `--paper-tint` / `--ink-tint`
5. All other CSS flows through `var(--...)`, no other changes needed

---

## 🖋 Ink Classic (Monocle default)

**Fits**: general talks, commercial launches, tech products, the safe default for any scenario.
**Tone**: pure ink black + warm off-white, the strongest magazine feel, Monocle / Apricot / A Book Apart style.

```css
--ink:#0a0a0b;
--ink-rgb:10,10,11;
--paper:#f1efea;
--paper-rgb:241,239,234;
--paper-tint:#e8e5de;
--ink-tint:#18181a;
```

---

## 🌊 Indigo Porcelain

**Fits**: tech/research/data talks, engineering culture, deep content, technical keynotes.
**Tone**: deep indigo + porcelain white, calm, rational, with depth, like an academic journal or blue-and-white porcelain.

```css
--ink:#0a1f3d;
--ink-rgb:10,31,61;
--paper:#f1f3f5;
--paper-rgb:241,243,245;
--paper-tint:#e4e8ec;
--ink-tint:#152a4a;
```

---

## 🌿 Forest Ink

**Fits**: nature/sustainability/culture/non-fiction content, outdoor brands, environmental themes.
**Tone**: deep forest green + ivory, steady, with breathing room, like the old *National Geographic*.

```css
--ink:#1a2e1f;
--ink-rgb:26,46,31;
--paper:#f5f1e8;
--paper-rgb:245,241,232;
--paper-tint:#ece7da;
--ink-tint:#253d2c;
```

---

## 🍂 Kraft Paper

**Fits**: nostalgic/humanist/reading/history/literary talks, indie magazines, handmade brands.
**Tone**: deep brown + warm beige, like a kraft envelope or an old notebook, warm and aged.

```css
--ink:#2a1e13;
--ink-rgb:42,30,19;
--paper:#eedfc7;
--paper-rgb:238,223,199;
--paper-tint:#e0d0b6;
--ink-tint:#3a2a1d;
```

---

## 🌙 Dune

**Fits**: art/design/creative/fashion talks, gallery booklets, aesthetics-first private salons.
**Tone**: charcoal gray + sand, restrained, premium, neutral, like a desert dusk or an architectural design portfolio.

```css
--ink:#1f1a14;
--ink-rgb:31,26,20;
--paper:#f0e6d2;
--paper-rgb:240,230,210;
--paper-tint:#e3d7bf;
--ink-tint:#2d2620;
```

---

## Recommendation reference

| If it's... | Recommended theme |
|---|---|
| don't know what to pick / first time | 🖋 Ink Classic |
| AI / tech / product launch | 🌊 Indigo Porcelain |
| content / industry observation / culture | 🌿 Forest Ink |
| book reviews / lifestyle / humanist | 🍂 Kraft Paper |
| design / art / brand | 🌙 Dune |

---

## Switching principles

- **A deck uses only one theme**, don't change colors midway
- The WebGL shader's default primary colors (titanium dispersion / silver flow) suit all 5 presets (tested as acceptable)
- The `currentColor`-driven border / icon automatically adapts to the section's text color, no extra tuning needed
- After picking a theme, the `<title>` text and `chrome` copy can reinforce that theme's semantics (e.g. Kraft Paper paired with something like "Vol.03 · 秋")

## ❌ What not to do

- ❌ **No mixing** (e.g. take `ink` from Ink Classic and `paper` from Dune): it clashes completely
- ❌ **Don't let the user pass any random hex value**: gently decline and show the 5 presets to pick from
- ❌ **Don't directly change colors elsewhere in template.html**: every scattered rgba flows through var, so changing `:root` in one place is enough

After picking a theme, tell the user in the skill conversation: "Using 🖋 Ink Classic / 🌊 Indigo Porcelain ..." and note it in the deck's project record, to keep it consistent across later iterations.
