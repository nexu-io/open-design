# CSS Transition Recipes

14 CSS transition patterns. Each includes CSS, HTML hooks, and JS orchestration where needed. All read from a shared `:root` custom properties block.

## Contents

- [Custom properties](#custom-properties)
- [Container morph](#container-morph)
- [Card resize](#card-resize)
- [Panel reveal](#panel-reveal)
- [Notification badge](#notification-badge)
- [Icon swap](#icon-swap)
- [Menu dropdown](#menu-dropdown)
- [Modal dialog](#modal-dialog)
- [Text state swap](#text-state-swap)
- [Page side-by-side slides](#page-side-by-side-slides)
- [Number pop-in](#number-pop-in)
- [Odometer digit roll](#odometer-digit-roll)
- [Avatar group hover](#avatar-group-hover)
- [Success celebration](#success-celebration)
- [Error state shake](#error-state-shake)

---

## Custom properties

Add this `:root` block once to your global stylesheet; every recipe reads these names.

```css
:root {
  /* Container morph */
  --morph-open-dur: 580ms;
  --morph-close-dur: 300ms;
  --morph-open-ease: linear(0, 0.45, 0.78, 1, 1.17, 1.21, 1.18, 1.12, 1.05, 1.02, 1);
  --morph-close-ease: cubic-bezier(0.32, 0.72, 0, 1);
  --morph-content-dur: 140ms;
  --morph-content-blur: 3px;

  /* Card resize */
  --resize-dur: 300ms;
  --resize-ease: cubic-bezier(0.22, 1, 0.36, 1);

  /* Odometer digit roll */
  --odo-dur: 260ms;
  --odo-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --odo-dir: 1; /* 1 = value increased, -1 = decreased */

  /* Number pop-in */
  --digit-dur: 500ms;
  --digit-dist: 12px;
  --digit-stagger: 70ms;
  --digit-blur: 6px;
  --digit-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --digit-dir-x: 0;
  --digit-dir-y: 1;

  /* Notification badge */
  --badge-slide-dur: 260ms;
  --badge-pop-dur: 500ms;
  --badge-blur: 2px;
  --badge-offset-x: -8px;
  --badge-offset-y: 12px;
  --badge-ease: cubic-bezier(0.22, 1, 0.36, 1);

  /* Text state swap */
  --text-swap-dur: 150ms;
  --text-swap-y: 4px;
  --text-swap-blur: 2px;
  --text-swap-ease: ease-in-out;

  /* Menu dropdown */
  --dropdown-open-dur: 250ms;
  --dropdown-close-dur: 150ms;
  --dropdown-pre-scale: 0.96;
  --dropdown-ease: cubic-bezier(0.22, 1, 0.36, 1);

  /* Modal dialog */
  --modal-open-dur: 250ms;
  --modal-close-dur: 150ms;
  --modal-scale: 0.96;
  --modal-ease: cubic-bezier(0.22, 1, 0.36, 1);

  /* Panel reveal */
  --panel-open-dur: 400ms;
  --panel-close-dur: 350ms;
  --panel-translate-y: 12px;
  --panel-blur: 4px;
  --panel-ease: cubic-bezier(0.22, 1, 0.36, 1);

  /* Page side-by-side */
  --page-dur: 200ms;
  --page-dist: 8px;
  --page-blur: 3px;
  --page-stagger: 60ms;
  --page-exit-enabled: 1;
  --page-ease: cubic-bezier(0.22, 1, 0.36, 1);

  /* Icon swap */
  --icon-swap-dur: 200ms;
  --icon-swap-blur: 2px;
  --icon-swap-start-scale: 0.25;
  --icon-swap-ease: ease-in-out;

  /* Success celebration */
  --success-opacity-dur: 550ms;
  --success-rotate-dur: 550ms;
  --success-bob-dur: 550ms;
  --success-blur-dur: 400ms;
  --success-path-dur: 550ms;
  --success-path-delay: 80ms;
  --success-rotate-from: 80deg;
  --success-rotate-to: 0deg;
  --success-bob-y: 40px;
  --success-blur-from: 10px;
  --success-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --success-bob-ease: cubic-bezier(0.34, 3.85, 0.64, 1);

  /* Avatar group hover */
  --avatar-lift: -4px;
  --avatar-dur: 320ms;
  --avatar-scale: 1.05;
  --avatar-falloff: 0.45;
  --avatar-ease-in: cubic-bezier(0.22, 1, 0.36, 1);
  --avatar-ease-out: cubic-bezier(0.34, 3.85, 0.64, 1);

  /* Error state shake */
  --shake-dist: 4px;
  --shake-overshoot: 2px;
  --shake-dur-1: 80ms;
  --shake-dur-2: 80ms;
  --shake-dur-3: 60ms;
  --shake-ease: cubic-bezier(0.36, 0.07, 0.19, 0.97);
  --shake-revert-dur: 200ms;
  --shake-hold: 1200ms;
}
```

---

## Container morph

The trigger *becomes* the surface. A button, chip, or pill grows in place into the search field, form, menu, or confirmation it summons, keeping one continuous background and border-radius throughout. No new element appears, so there is nothing for the eye to re-find.

Use this over Menu dropdown or Modal dialog whenever the trigger and the surface can share a shape. Use Card resize instead when the container already exists and only its dimensions change.

Three things happen at once, and the order matters:

| Phase | What | Timing |
|---|---|---|
| 1 | Old content fades and blurs out | `0` to `--morph-content-dur` |
| 2 | Container tweens to the new box | full `--morph-open-dur` |
| 3 | New content fades and blurs in | starts at `--morph-content-dur` |

Measure the target box before animating: a plain `width: auto` has nothing to interpolate towards. Where `interpolate-size: allow-keywords` is supported you can transition to `auto` and drop the measure step, so check support for your targets before choosing.

```html
<div class="t-morph" data-open="false">
  <div class="t-morph-face" data-face="closed"><button>Notify me</button></div>
  <div class="t-morph-face" data-face="open">
    <input placeholder="Email" /><button>Notify me</button>
  </div>
</div>
```

```css
.t-morph {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  transition: width var(--morph-close-dur) var(--morph-close-ease),
              height var(--morph-close-dur) var(--morph-close-ease);
  will-change: width, height;
}
.t-morph[data-open="true"] {
  transition-duration: var(--morph-open-dur);
  transition-timing-function: var(--morph-open-ease);
}

/* Faces stack, so the container never sees both in flow. */
.t-morph-face {
  transition: opacity var(--morph-content-dur) ease,
              filter var(--morph-content-dur) ease;
}
.t-morph-face[data-face="open"] { position: absolute; inset: 0; }

.t-morph[data-open="false"] [data-face="open"],
.t-morph[data-open="true"] [data-face="closed"] {
  opacity: 0;
  filter: blur(var(--morph-content-blur));
  pointer-events: none;
}

/* Incoming content waits for the box to be most of the way there. */
.t-morph[data-open="true"] [data-face="open"],
.t-morph[data-open="false"] [data-face="closed"] {
  transition-delay: var(--morph-content-dur);
}
```

**JS, measure then toggle:**

```js
function morph(el, open) {
  const face = el.querySelector(`[data-face="${open ? "open" : "closed"}"]`);
  // Measure the target face off-flow, at its natural size.
  const prev = face.style.cssText;
  Object.assign(face.style, { position: "absolute", visibility: "hidden", width: "max-content" });
  const { width, height } = face.getBoundingClientRect();
  face.style.cssText = prev;

  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.dataset.open = String(open);
}
```

**Measured reference.** Tracking a real implementation frame by frame at 60fps: the open reached **121% of its travel** at 284ms (a container **9.8% wider** than its resting width), then settled over a further 300ms. The close reached a ~2% undershoot in 185ms and was visually at rest by 300ms. Expansion was symmetric about the trigger's centre, not anchored to an edge.

`--morph-open-ease` is that overshoot transcribed as a `linear()` curve, so `--morph-open-dur` covers the whole settle even though the morph reads as finished around 300ms. The equivalent spring is `{ stiffness: 155, damping: 11, mass: 1 }` (damping ratio 0.44); the close fits `{ stiffness: 620, damping: 36 }`, near enough to critically damped that the bezier above is indistinguishable. Prefer the spring form when the morph must survive interruption. `spring-animations.md` § Asymmetric spring character covers why only the open bounces.

---

## Card resize

Tween a container's width or height when its layout state changes (compact/expanded card, collapsing panel, list row toggling detail). CSS only, no JS.

```html
<div class="t-resize">Content</div>
```

```css
.t-resize {
  transition: width var(--resize-dur) var(--resize-ease),
              height var(--resize-dur) var(--resize-ease);
  will-change: width, height;
  overflow: hidden;
}
```

Toggle dimensions with a state class or inline style; the transition handles the tween.

---

## Panel reveal

Slide a panel into an existing container with cross-blur. CSS only, toggle `data-open`.


```html
<div class="t-panel" data-open="false">Panel content</div>
```

```css
.t-panel {
  opacity: 0;
  transform: translateY(var(--panel-translate-y));
  filter: blur(var(--panel-blur));
  transition: opacity var(--panel-open-dur) var(--panel-ease),
              transform var(--panel-open-dur) var(--panel-ease),
              filter var(--panel-open-dur) var(--panel-ease);
}
.t-panel[data-open="true"] {
  opacity: 1;
  transform: translateY(0);
  filter: blur(0);
}
.t-panel[data-open="false"] {
  transition-duration: var(--panel-close-dur);
}
```

**Drawer variant.** A drawer that enters from a screen edge uses the move curve and a percentage translate, so one rule fits any height:

```css
.drawer {
  transform: translateY(100%);
  transition: transform 240ms cubic-bezier(0.25, 1, 0.5, 1);
}
.drawer[data-open="true"] {
  transform: translateY(0);
}
```

```tsx
<motion.aside
  initial={{ transform: "translate3d(100%, 0, 0)" }}
  animate={{ transform: "translate3d(0, 0, 0)" }}
  exit={{ transform: "translate3d(100%, 0, 0)" }}
  transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
/>
```

---

## Notification badge

Slide a small badge onto a trigger (button, icon) and pop the dot; the trigger stays put. CSS only, toggle `data-open`.

```html
<button style="position: relative">
  Inbox
  <span class="t-badge" data-open="false">
    <span class="t-badge-dot"></span>
  </span>
</button>
```

```css
.t-badge {
  position: absolute;
  opacity: 0;
  transform: translate(var(--badge-offset-x), var(--badge-offset-y));
  filter: blur(var(--badge-blur));
  transition: opacity var(--badge-slide-dur) var(--badge-ease),
              transform var(--badge-slide-dur) var(--badge-ease),
              filter var(--badge-slide-dur) var(--badge-ease);
}
.t-badge[data-open="true"] {
  opacity: 1;
  transform: translate(0, 0);
  filter: blur(0);
}
.t-badge-dot {
  display: block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: currentColor;
  transform: scale(0);
  transition: transform var(--badge-pop-dur) var(--badge-ease);
}
.t-badge[data-open="true"] .t-badge-dot {
  transform: scale(1);
  transition-delay: calc(var(--badge-slide-dur) * 0.5);
}
```

---

## Icon swap

Cross-fade two icons in one slot (hamburger/close, play/pause). CSS grid stacks both. Toggle `data-state`.

See also: `contextual-animations.md` § Contextual icon swaps for the Motion/AnimatePresence approach.

```html
<span class="t-icon-swap" data-state="a">
  <span class="t-icon" data-icon="a">☰</span>
  <span class="t-icon" data-icon="b">✕</span>
</span>
```

```css
.t-icon-swap {
  display: inline-grid;
}
.t-icon {
  grid-area: 1 / 1;
  opacity: 0;
  transform: scale(var(--icon-swap-start-scale));
  filter: blur(var(--icon-swap-blur));
  transition: opacity var(--icon-swap-dur) var(--icon-swap-ease),
              transform var(--icon-swap-dur) var(--icon-swap-ease),
              filter var(--icon-swap-dur) var(--icon-swap-ease);
}
.t-icon-swap[data-state="a"] [data-icon="a"],
.t-icon-swap[data-state="b"] [data-icon="b"] {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
}
```

---

## Menu dropdown

Origin-aware dropdown with open/close animations. JS handles close-state cleanup.


```html
<div class="t-dropdown" data-origin="top-left">
  Menu content
</div>
```

```css
.t-dropdown {
  opacity: 0;
  transform: scale(var(--dropdown-pre-scale));
  transition: opacity var(--dropdown-open-dur) var(--dropdown-ease),
              transform var(--dropdown-open-dur) var(--dropdown-ease);
}
.t-dropdown.is-open {
  opacity: 1;
  transform: scale(1);
}
.t-dropdown.is-closing {
  opacity: 0;
  transform: scale(0.99);
  transition-duration: var(--dropdown-close-dur);
}

.t-dropdown[data-origin="top-left"]     { transform-origin: top left; }
.t-dropdown[data-origin="top-center"]   { transform-origin: top center; }
.t-dropdown[data-origin="top-right"]    { transform-origin: top right; }
.t-dropdown[data-origin="bottom-left"]  { transform-origin: bottom left; }
.t-dropdown[data-origin="bottom-center"]{ transform-origin: bottom center; }
.t-dropdown[data-origin="bottom-right"] { transform-origin: bottom right; }
```

**JS, close with cleanup:**

```js
function closeDropdown(el) {
  el.classList.add("is-closing");
  el.classList.remove("is-open");
  const dur = parseFloat(getComputedStyle(el).getPropertyValue("--dropdown-close-dur"));
  setTimeout(() => el.classList.remove("is-closing"), dur);
}
```

**Component libraries.** Base UI exposes the trigger-relative origin as `--transform-origin` (Radix: `--radix-popover-content-transform-origin`); use it instead of the `data-origin` table. Where only a side attribute exists, map it:

```css
.popover { transform-origin: var(--transform-origin); }
.popover[data-side="top"]    { transform-origin: bottom center; }
.popover[data-side="bottom"] { transform-origin: top center; }
.popover[data-side="left"]   { transform-origin: center right; }
.popover[data-side="right"]  { transform-origin: center left; }
```

Start from `scale(0.92)` or higher, never `scale(0)`: nothing appears from nothing.

**Tooltips** reuse this shape at 125ms `ease-out` from `scale(0.97)`. Delay the first appearance 300-500ms to prevent accidental activation; once one tooltip in a group is open, the next opens instantly:

```css
.tooltip {
  transition: transform 125ms ease-out, opacity 125ms ease-out;
  transform-origin: var(--transform-origin);
}
.tooltip[data-starting-style],
.tooltip[data-ending-style] {
  opacity: 0;
  transform: scale(0.97);
}
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

---

## Modal dialog

Scale-up modal with softer scale-down on close. Class-based state. Modals keep `transform-origin: center`: they are app-level state, not anchored to a trigger.

```html
<div class="t-modal" role="dialog">Modal content</div>
```

```css
.t-modal {
  opacity: 0;
  transform: scale(var(--modal-scale));
  transform-origin: center;
  transition: opacity var(--modal-open-dur) var(--modal-ease),
              transform var(--modal-open-dur) var(--modal-ease);
}
.t-modal.is-open {
  opacity: 1;
  transform: scale(1);
}
.t-modal.is-closing {
  opacity: 0;
  transform: scale(var(--modal-scale));
  transition-duration: var(--modal-close-dur);
}
```

**JS, close with cleanup:**

```js
function closeModal(el) {
  el.classList.add("is-closing");
  el.classList.remove("is-open");
  const dur = parseFloat(getComputedStyle(el).getPropertyValue("--modal-close-dur"));
  setTimeout(() => el.classList.remove("is-closing"), dur);
}
```

**Entry without JavaScript.** `@starting-style` animates the first render, so a modal that mounts open needs no class toggle:

```css
.modal {
  opacity: 1;
  transform: scale(1);
  transition: opacity 250ms cubic-bezier(0.22, 1, 0.36, 1),
              transform 250ms cubic-bezier(0.22, 1, 0.36, 1);

  @starting-style {
    opacity: 0;
    transform: scale(0.95);
  }
}
```

`@starting-style` has been Baseline since August 2024, so the `data-mounted` attribute pattern is a fallback for older browsers, not the default. Add it only when the support matrix includes them.

---

## Text state swap

Swap text in place with a blurred vertical transition ("Processing..." → "Done"). JS coordinates the three phases.

```html
<span class="t-text-swap">Processing...</span>
```

```css
.t-text-swap {
  display: inline-block;
  transition: opacity var(--text-swap-dur) var(--text-swap-ease),
              transform var(--text-swap-dur) var(--text-swap-ease),
              filter var(--text-swap-dur) var(--text-swap-ease);
}
.t-text-swap.is-exit {
  opacity: 0;
  transform: translateY(calc(-1 * var(--text-swap-y)));
  filter: blur(var(--text-swap-blur));
}
.t-text-swap.is-enter-start {
  opacity: 0;
  transform: translateY(var(--text-swap-y));
  filter: blur(var(--text-swap-blur));
}
```

**JS, three-phase orchestration:**

```js
function swapText(el, newText) {
  const dur = parseFloat(getComputedStyle(el).getPropertyValue("--text-swap-dur"));
  el.classList.add("is-exit");
  setTimeout(() => {
    el.textContent = newText;
    el.classList.remove("is-exit");
    el.classList.add("is-enter-start");
    void el.offsetWidth; // force reflow
    el.classList.remove("is-enter-start");
  }, dur);
}
```

---

## Page side-by-side slides

Slide between two adjacent pages (list/detail, wizard steps). Page 1 exits left, page 2 enters right.

See also: `component-patterns.md` § Step form navigation for the Motion/AnimatePresence approach with direction variants.

```html
<div class="t-page-slide" data-page="1">
  <section data-page-id="1">Page 1</section>
  <section data-page-id="2">Page 2</section>
</div>
```

```css
.t-page-slide {
  display: grid;
  overflow: hidden;
}
.t-page-slide > * {
  grid-area: 1 / 1;
  transition: opacity var(--page-dur) var(--page-ease),
              transform var(--page-dur) var(--page-ease),
              filter var(--page-dur) var(--page-ease);
}

/* Page 1 active */
.t-page-slide[data-page="1"] [data-page-id="1"] {
  opacity: 1; transform: translateX(0); filter: blur(0);
}
.t-page-slide[data-page="1"] [data-page-id="2"] {
  opacity: 0;
  transform: translateX(var(--page-dist));
  filter: blur(var(--page-blur));
}

/* Page 2 active */
.t-page-slide[data-page="2"] [data-page-id="2"] {
  opacity: 1; transform: translateX(0); filter: blur(0);
}
.t-page-slide[data-page="2"] [data-page-id="1"] {
  opacity: 0;
  transform: translateX(calc(-1 * var(--page-dist)));
  filter: blur(var(--page-blur));
}
```

**JS, switch page:**

```js
slider.setAttribute("data-page", String(n));
```

Set `--page-exit-enabled: 0` for fade-only, no slide (useful on initial load).

---

## Number pop-in

Re-enter digits with directional blur on number update (counters, prices, balances). Each digit animates individually with optional stagger.

```html
<span class="t-digits">
  <span class="t-digit">1</span>
  <span class="t-digit">2</span>
  <span class="t-digit" data-stagger="1">3</span>
  <span class="t-digit" data-stagger="2">4</span>
</span>
```

```css
.t-digits {
  display: inline-flex;
}

@keyframes digit-enter {
  from {
    opacity: 0;
    transform: translate(
      calc(var(--digit-dir-x) * var(--digit-dist)),
      calc(var(--digit-dir-y) * var(--digit-dist))
    );
    filter: blur(var(--digit-blur));
  }
}

.t-digit {
  display: inline-block;
  animation: digit-enter var(--digit-dur) var(--digit-ease) both;
}
.t-digit[data-stagger="1"] { animation-delay: var(--digit-stagger); }
.t-digit[data-stagger="2"] { animation-delay: calc(var(--digit-stagger) * 2); }
```

**JS, replay on update:**

```js
function updateDigits(container, newValue) {
  container.classList.remove("is-animating");
  container.innerHTML = String(newValue)
    .split("")
    .map((d, i, arr) => {
      const stagger = i >= arr.length - 2 ? ` data-stagger="${arr.length - 1 - i}"` : "";
      return `<span class="t-digit"${stagger}>${d}</span>`;
    })
    .join("");
  void container.offsetWidth; // force reflow
  container.classList.add("is-animating");
}
```

---

## Odometer digit roll

Roll each changed digit vertically, in the direction the value moved: up for an increase, down for a decrease. Use this over Number pop-in when the number is being *driven* by the user (steppers, sliders, scrubbers, quantity controls), where direction is the feedback. Keep pop-in for values that arrive on their own, where there is no direction to convey.

Two rules keep it readable. Only re-render the digits that actually changed, or a 199 to 200 tick rolls all three and reads as noise. And set `font-variant-numeric: tabular-nums`, or the row re-flows on every tick and the roll turns into a jitter.

```html
<span class="t-odo" style="--odo-dir: 1">
  <span class="t-odo-slot"><span class="t-odo-digit">4</span></span>
  <span class="t-odo-slot"><span class="t-odo-digit" data-rolling>1</span></span>
</span>
```

```css
.t-odo {
  display: inline-flex;
  font-variant-numeric: tabular-nums;
}
.t-odo-slot {
  display: inline-block;
  overflow: hidden;      /* the window the digit rolls through */
  height: 1em;
  line-height: 1em;
}

@keyframes odo-roll {
  from {
    transform: translateY(calc(var(--odo-dir) * 1em));
    opacity: 0;
  }
}

.t-odo-digit[data-rolling] {
  display: block;
  animation: odo-roll var(--odo-dur) var(--odo-ease) both;
}
```

**JS, roll only what changed:**

```js
function setOdometer(el, next, prev) {
  el.style.setProperty("--odo-dir", next > prev ? 1 : -1);
  const a = String(prev).padStart(String(next).length, " ");
  const b = String(next);
  el.innerHTML = [...b]
    .map((d, i) => {
      const rolling = d !== a[i] ? " data-rolling" : "";
      return `<span class="t-odo-slot"><span class="t-odo-digit"${rolling}>${d}</span></span>`;
    })
    .join("");
}
```

The outgoing digit is dropped rather than animated out. At 260ms with the slot clipping, the eye reads the incoming digit as having pushed the old one away; animating both doubles the work for no visible gain.

---

## Avatar group hover

Distance-falloff lift on a horizontal stack. Hovered item lifts and scales; neighbors lift less with distance. Bouncy spring on leave.

```html
<div class="t-avatar-group">
  <div class="t-avatar">A</div>
  <div class="t-avatar">B</div>
  <div class="t-avatar">C</div>
</div>
```

```css
.t-avatar-group {
  display: flex;
  gap: 4px;
}
.t-avatar {
  transition: transform var(--avatar-dur) var(--avatar-ease-in);
}
```

**JS, distance-based lift:**

Set `transition-timing-function` inline *before* writing CSS variables. The browser applies whatever timing function is current when the property changes, giving smooth ease-in on hover and bouncy ease-out on return without separate declarations.

```js
const group = document.querySelector(".t-avatar-group");
const items = [...group.querySelectorAll(".t-avatar")];
const lift = parseFloat(getComputedStyle(group).getPropertyValue("--avatar-lift"));
const scale = parseFloat(getComputedStyle(group).getPropertyValue("--avatar-scale"));
const falloff = parseFloat(getComputedStyle(group).getPropertyValue("--avatar-falloff"));

group.addEventListener("mouseenter", (e) => {
  const target = e.target.closest(".t-avatar");
  if (!target) return;
  const idx = items.indexOf(target);
  items.forEach((item, i) => {
    const dist = Math.abs(i - idx);
    item.style.transitionTimingFunction = "var(--avatar-ease-in)";
    if (dist === 0) {
      item.style.transform = `translateY(${lift}px) scale(${scale})`;
    } else {
      const y = lift * Math.pow(falloff, dist);
      item.style.transform = `translateY(${y}px)`;
    }
  });
}, true);

group.addEventListener("mouseleave", () => {
  items.forEach((item) => {
    item.style.transitionTimingFunction = "var(--avatar-ease-out)";
    item.style.transform = "";
  });
});
```

---

## Success celebration

Multi-layered success: fade, rotation, blur reduction, Y-bob with overshoot, optional SVG stroke draw. Toggle `data-state` to `"in"`.

```html
<div class="t-success" data-state="out">
  <svg><path class="t-success-path" d="..." /></svg>
</div>
```

```css
.t-success {
  opacity: 0;
  transform: rotate(var(--success-rotate-from)) translateY(var(--success-bob-y));
  filter: blur(var(--success-blur-from));
}

@keyframes success-in {
  0% {
    opacity: 0;
    transform: rotate(var(--success-rotate-from)) translateY(var(--success-bob-y));
    filter: blur(var(--success-blur-from));
  }
  100% {
    opacity: 1;
    transform: rotate(var(--success-rotate-to)) translateY(0);
    filter: blur(0);
  }
}

.t-success[data-state="in"] {
  animation: success-in var(--success-opacity-dur) var(--success-ease) forwards;
}

.t-success-path {
  stroke-dashoffset: var(--path-length);
  stroke-dasharray: var(--path-length);
  transition: stroke-dashoffset var(--success-path-dur) var(--success-ease);
  transition-delay: var(--success-path-delay);
}
.t-success[data-state="in"] .t-success-path {
  stroke-dashoffset: 0;
}
```

**JS, set path length and replay:**

Never hardcode `stroke-dasharray`. Use `getTotalLength()` to measure the actual path.

```js
function playSuccess(el) {
  const path = el.querySelector(".t-success-path");
  if (path) {
    const len = path.getTotalLength();
    el.style.setProperty("--path-length", len);
  }
  el.setAttribute("data-state", "out");
  void el.offsetWidth; // force reflow to restart keyframes
  el.setAttribute("data-state", "in");
}
```

---

## Error state shake

Per-segment shake with auto-reverting error border. Three classes: `.is-error` on wrapper and input, `.is-shaking` on input only.

```html
<div class="t-error-wrap">
  <input class="t-error-input" />
  <p class="t-error-msg">Invalid email</p>
</div>
```

```css
@keyframes shake {
  0%   { transform: translateX(0); }
  25%  { transform: translateX(var(--shake-dist)); }
  50%  { transform: translateX(calc(-1 * var(--shake-overshoot))); }
  75%  { transform: translateX(calc(var(--shake-dist) * 0.5)); }
  100% { transform: translateX(0); }
}

.t-error-input {
  transition: border-color var(--shake-revert-dur) ease;
}
.t-error-input.is-error {
  border-color: var(--color-error, #ef4444);
}
.t-error-input.is-shaking {
  animation: shake
    calc(var(--shake-dur-1) + var(--shake-dur-2) + var(--shake-dur-3))
    var(--shake-ease);
}

.t-error-msg {
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 150ms ease, transform 150ms ease;
}
.t-error-wrap.is-error .t-error-msg {
  opacity: 1;
  transform: translateY(0);
}
```

**JS, trigger and auto-revert:**

Keep `.is-error` and `.is-shaking` separate. `.is-shaking` controls only the shake animation, removed on `animationend`. `.is-error` controls the border colour and message visibility, auto-reverting after the hold duration.

```js
function triggerError(wrap, input) {
  wrap.classList.add("is-error");
  input.classList.add("is-error", "is-shaking");

  input.addEventListener("animationend", () => {
    input.classList.remove("is-shaking");
  }, { once: true });

  const hold = parseFloat(getComputedStyle(wrap).getPropertyValue("--shake-hold"));
  setTimeout(() => {
    wrap.classList.remove("is-error");
    input.classList.remove("is-error");
  }, hold);
}
```
