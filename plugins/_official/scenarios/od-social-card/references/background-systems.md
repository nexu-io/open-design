# Background Systems

The original Guizang PPT electronic-magazine mode uses WebGL fluid, contour, ink, and chromatic atmosphere. Static Rednote/WeChat images should preserve that feeling when the style mode is Editorial Magazine x E-ink.

Do not reduce this mode to a flat beige page with a faint grid. Do not add visible grid, dot-matrix, or drafting-paper patterns to the background.

## Layer Model

Use 3-5 layers:

1. Paper base from `theme-presets.md`.
2. Procedural paper grain.
3. Ink wash, contour field, or WebGL fluid canvas.
4. Optional hairline structure as content dividers only, not as a page-wide background grid.
5. Content layer.

Recommended CSS order:

```html
<section class="poster magazine hero">
  <canvas class="mag-bg" data-bg="ink-flow"></canvas>
  <div class="grain"></div>
  <div class="ink-vignette"></div>
  <div class="content">...</div>
</section>
```

```css
.poster { position: relative; overflow: hidden; background: var(--paper); }
.mag-bg { position:absolute; inset:0; width:100%; height:100%; z-index:0; opacity:.34; }
.poster.hero .mag-bg { opacity:.62; }
.grain {
  position:absolute; inset:0; z-index:1; pointer-events:none;
  opacity:.12; mix-blend-mode:multiply;
  background:
    linear-gradient(112deg, rgba(0,0,0,.035), transparent 26%, rgba(255,255,255,.16) 52%, transparent 82%),
    radial-gradient(circle at 18% 22%, rgba(var(--ink-rgb),.05), transparent 38%),
    radial-gradient(circle at 78% 84%, rgba(var(--accent-rgb),.045), transparent 42%);
}
.ink-vignette {
  position:absolute; inset:0; z-index:2; pointer-events:none;
  background:
    radial-gradient(circle at 18% 12%, rgba(var(--ink-rgb),.10), transparent 34%),
    radial-gradient(circle at 82% 80%, rgba(var(--accent-rgb),.10), transparent 38%);
}
.content { position:relative; z-index:3; }
```

## When To Show WebGL

Use stronger visible atmosphere for:

- Cover.
- Chapter/divider.
- Pull quote.
- Sparse thesis page.
- Closing page.

Use subtle atmosphere for:

- Screenshot pages.
- Dense ledgers.
- Checklists.
- Product evidence pages.

If screenshots are the main evidence, the background should support them rather than compete with them.

## WebGL Helper

The skill includes `assets/magazine-bg-webgl.js`, a small helper for a deterministic ink-flow background:

```html
<canvas class="mag-bg" data-seed="workbuddy"></canvas>
<script src="assets/magazine-bg-webgl.js"></script>
<script>
  document.querySelectorAll(".mag-bg").forEach((canvas, i) => {
    MagazineBg.mount(canvas, {
      ink: [26, 46, 31],
      paper: [245, 241, 232],
      accent: [46, 107, 79],
      strength: canvas.closest(".hero") ? 0.62 : 0.28,
      frozenTime: 2.4 + i * 0.37
    });
  });
</script>
```

For screenshot exports, prefer `frozenTime` so repeated renders look stable.

## 2D Fallback

If WebGL fails, create a 2D canvas with:

- Large radial ink wash.
- Several translucent contour arcs.
- Soft paper noise or uneven ink wash.
- Theme color at very low opacity.

The output should still feel like an editorial background, not a plain fill.

## Do Not

- Do not use bright gradients.
- Do not use page-wide grid, dot-matrix, graph-paper, or drafting-paper backgrounds.
- Do not use decorative blobs or circles with no relationship to the layout.
- Do not place strong background marks behind body text.
- Do not let WebGL obscure screenshots or small captions.
- Do not animate the final image sequence unless the task is video.
