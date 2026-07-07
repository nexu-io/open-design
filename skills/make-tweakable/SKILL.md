---
name: "Make Tweakable"
description: "Claude design system prompt skill for Make Tweakable"
triggers:
  - "claude make tweakable"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Make Tweakable: Add In-Design Tweak Controls

Add a floating control panel to a finished design that lets the user adjust selected aspects live — colors, fonts, spacing, copy, layout variants, feature flags. Use this when the user wants to "play with options," "see different versions," or compare visual choices. **One file, many variants** — no v1.html / v2.html / v3.html scatter.

## Phase 1: Identify what should be tweakable

Confirm with the user — or propose and check — which aspects to expose: color (primary, accent, background tone), typography (family, base size, scale ratio), density (tight / normal / loose), layout variant, component variants (filled/ghost buttons, card treatment), copy (headline, subhead, CTA text), feature flags (show/hide sections).

**Keep the tweak surface small** — 3–8 controls. A few meaningful axes to explore, not a Figma clone. If the user didn't ask for tweaks but the design has obvious axes of variation, add 1–2 by default to surface interesting possibilities.

## Phase 2: Design the tweak panel

The panel lives inside the prototype, floating (typically bottom-right), semi-transparent with a subtle border, titled **"Tweaks"** to match the toolbar toggle. Use the right control per value type: color picker for colors; dropdown or button group for fonts and variants; slider with sensible min/max for numbers; toggle for booleans; text input for copy. Keep controls compact — a narrow stacked column beats a sprawling panel.

## Phase 3: Wire up the live updates

Use CSS custom properties for visual tokens so everything referencing them updates:

```js
document.documentElement.style.setProperty('--tweak-primary', newColor);
```

For non-CSS values (copy, layout variants, feature flags), use JS state with re-render or DOM manipulation.

## Phase 4: Implement the host protocol

The host environment exposes a toolbar toggle for the tweak panel. **Order matters** — if you announce availability before the listener exists, the host's activate message lands on nothing and the toggle silently does nothing:

1. **Register a `message` listener on `window` first:**
   - `{type: '__activate_edit_mode'}` → show the Tweaks panel
   - `{type: '__deactivate_edit_mode'}` → hide it
2. **Then announce availability:**
   ```js
   window.parent.postMessage({type: '__edit_mode_available'}, '*')
   ```
3. **When a value changes, persist it** by posting back (partial updates are fine — only included keys are merged):
   ```js
   window.parent.postMessage({type: '__edit_mode_set_keys', edits: {primaryColor: '#FF6600'}}, '*')
   ```

## Phase 5: Persist defaults on disk

Wrap tweakable defaults in comment markers so the host can rewrite them:

```js
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primaryColor": "#D97757",
  "fontSize": 16,
  "dark": false
}/*EDITMODE-END*/;
```

The block between markers **must be valid JSON** (double-quoted keys and strings), and there must be exactly one such block, inside an inline `<script>` in the root HTML file. The host merges edits into it and writes the file back, so changes survive reload.

## Phase 6: Hide the controls when off

With Tweaks toggled off, the panel is entirely hidden — not dimmed, not collapsed to a corner. This is non-negotiable: any visible edit-mode chrome makes the design look unfinished.

## Phase 7: Verify and summarize

In the preview: toggle the panel on/off via the toolbar; change each tweak and confirm it updates live; reload and confirm values persist; check the design reads as a finished artifact with the panel off.

Summarize: tweaks exposed and their value types, defaults, tweaks considered but excluded (and why), whether the set covers the user's exploration axes.
