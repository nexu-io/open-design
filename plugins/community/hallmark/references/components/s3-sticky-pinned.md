### S3 · Sticky pinned
Heading remains in viewport while content scrolls beneath. Orientation aid.
*Use when:* the section is dense and the user benefits from always seeing where they are.
*Don't confuse with:* S1 Left-margin (which doesn't move).

```html
<header class="head-sticky">
  <p class="num-label">02</p>
  <h2>…</h2>
</header>
```
```css
/* If the page has a sticky top nav, offset by its height so the sticky
   head docks BENEATH it instead of bleeding over (slop-test gate 68).
   Use --z-sticky (in-page) so the nav's --z-sticky-nav out-paints it. */
.head-sticky { position: sticky; top: var(--banner-height, 0px); background: var(--color-paper); padding-block: var(--space-sm); border-bottom: 1px solid var(--color-ink); z-index: var(--z-sticky); }
```

**Sticky pairing rule:** if the page emits a sticky `<header>` / `<nav>` / `.banner` (anything with `position: sticky; top: 0`), you MUST also declare `--banner-height` (a px value matching the nav's height) and `--z-sticky-nav` (≥ 1 above `--z-sticky`) in `tokens.css`. The S3 recipe above pulls both. Without those tokens the section head paints over the nav during scroll — see slop-test gate 68.
