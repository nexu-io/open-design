# Hello uni-app — UI Kit

A high-fidelity, interactive recreation of the **Hello uni-app** showcase app — the
official demo that DCloud ships to demonstrate uni-app's built-in components and APIs.
It reproduces the WeUI/uni-app mobile idiom faithfully: blue nav bar, four-tab bottom
bar, hairline-divided lists, and the canonical built-in components.

> Source of truth: `dcloudio/hello-uniapp` (`common/uni.css`, `pages.json`,
> `pages/component/*`, `static/`) and `dcloudio/uni-app`'s built-in component styles.
> Every color, radius, and divider here is lifted from that code — not approximated.

## Run it
Open `index.html`. It boots into the **内置组件 (Built-in Components)** tab.

## What's interactive
- **Bottom tab bar** — switch between 内置组件 / 接口 / 扩展组件 / 模板 (raster icons, active = blue).
- **内置组件** — accordion of component categories; tap a leaf (e.g. `button`, `switch`,
  `slider`, `input`, `radio`, `checkbox`, `progress`, `text`) to push a live demo page with
  a back button. Form controls are fully interactive.
- **接口** — tap rows to fire real overlays: **ActionSheet** (slide-up), **Modal**
  (confirm/cancel), **Toast** (success / loading spinner). Auto-dismiss.
- **扩展组件** — uni-ui specimens: badges (pill / count / dot), tags, card, steps, notice bar.
- **模板** — composed real screens: a Settings list (switches, nav cells with values) and a
  media list, wired to modals/toasts.

## Files
| File | Role |
|---|---|
| `index.html` | Entry — loads React 18 + Babel, the icon font, and the JSX modules. |
| `kit.css` | All component styles (tokens mirror the root `colors_and_type.css`). |
| `uniicons.css` | The bundled `uniicons` icon font (embedded data-URI) + glyph classes. |
| `chrome.jsx` | `Device`, `StatusBar`, `NavBar`, `TabBar`. |
| `primitives.jsx` | `Button`, `Switch`, `Checkbox`, `Radio`, `Slider`, `Badge`, `List`, `Cell`, `Card`, `Progress`. |
| `overlays.jsx` | `ActionSheet`, `Modal`, `Toast`. |
| `demos.jsx` | Built-in component demo pages (button, switch, radio, …). |
| `pages.jsx` | Tab pages: accordion home, API actions, extended components, templates. |
| `app.jsx` | Routing, nav stack, overlay manager. |
| `tab-*.png` | Tab-bar icons (normal/active pairs). |

## Notes & fidelity
- Components are **cosmetic recreations** — they reproduce look & interaction, not uni-app's
  real cross-compilation. They're meant to be lifted into mockups, not shipped.
- The nav bar uses the **App** style (blue `#007aff`, white title). uni-app's H5 target uses
  a light bar (`#f1f1f1`, black title) — pass `h5` to `<NavBar>` for that variant.
- Components without a built recreation (e.g. `map`, `canvas`, `video`) open a labeled
  placeholder rather than a fake — by design, we don't invent UI that isn't in the source.
