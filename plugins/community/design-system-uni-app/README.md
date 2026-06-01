# uni-app Design System

A design system reconstructed from **uni-app**, DCloud's open-source framework for
building cross-platform apps from a single Vue.js codebase. This folder captures
uni-app's visual language — colors, type, icon font, spacing, and the WeUI-flavored
component idiom — plus a high-fidelity recreation of the **Hello uni-app** showcase app.

> **What uni-app is.** Developers write `Vue` syntax once; the uni-app compiler ships
> it to Mini-Programs (WeChat / Alipay / Baidu / ByteDance / QQ / Kuaishou / DingTalk /
> RedBook), native Apps (iOS / Android), and H5. It is maintained by DCloud, the makers
> of HBuilderX. The framework's built-in components (`<button>`, `<switch>`, `<input>`,
> `<navigator>`…) define a consistent UI language across every target platform — and that
> language is what this design system documents.

---

## Sources

Everything here was lifted directly from source code (not screenshots). The reader is
**encouraged to explore these repositories** to build richer, more accurate designs:

| Source | What was used |
|---|---|
| **github.com/dcloudio/uni-app** @ `uni-app-vue2-release` | Built-in component CSS — the canonical token source. Key files: `src/core/view/components/{button,switch,icon,input}/index.vue`. The `icon/index.vue` embeds the WeUI icon font; `button/index.vue` holds the full button color/state matrix. |
| **github.com/dcloudio/hello-uniapp** @ `master` | The official showcase app. `common/uni.css` (25 KB) is the master stylesheet — lists, cards, badges, forms, grids, the full `uniicons` glyph map. `pages.json` defines the app chrome (nav bar, tab bar, colors). `static/` holds the logo, tab-bar PNG icons, and `uni.ttf` icon font. |
| **uniapp.dcloud.io** | Official docs & component reference (referenced for naming/casing). |

No Figma was provided. No slide template was provided (so `slides/` is intentionally absent).
**Fonts:** uni-app ships **no brand text font** — it relies on each platform's system stack.
The only bundled webfont is the `uniicons` icon font (`fonts/uni.ttf`), copied in verbatim.
No Google-Fonts substitution was needed.

---

## Product context

uni-app's "product" from a design standpoint is its **component library** — the set of
built-in elements every uni-app project renders identically across 14 platforms. The
reference implementation of that library in use is the **Hello uni-app** demo app, a
mobile showcase organized into four bottom tabs:

1. **内置组件 (Built-in Components)** — view, scroll-view, swiper, text, button, checkbox, input, picker, slider, switch, image, video, map, canvas…
2. **接口 (API)** — interactive demos: action sheet, modal, toast, loading, network, storage, scan, location…
3. **扩展组件 (Extended Components / uni-ui)** — badge, card, list, collapse, steps, rate, segmented-control, search-bar, swipe-action, fab…
4. **模板 (Template)** — composed real-world screens: nav-bar variants, list-to-detail, swiper video feed, charts.

The home screen is an **accordion list** of component categories; tapping a category
expands a sub-list of demo pages, each opened via the native nav stack. This is the
surface the UI kit in `ui_kits/hello-uniapp/` recreates.

---

## CONTENT FUNDAMENTALS

uni-app's product copy is **bilingual at heart but Simplified-Chinese first** (it is a
Chinese developer ecosystem). Tone is **practical, terse, engineer-to-engineer** — no
marketing fluff in the components themselves.

- **Casing:** Component & demo titles are lowercase English technical names (`button`,
  `scroll-view`, `picker-view`) shown verbatim — these are API identifiers, not prose.
  Section headers and labels are Chinese (`视图容器` = "View Containers", `表单组件` =
  "Form Components", `基础内容` = "Basic Content").
- **Button labels describe role + state**, e.g. `页面主操作 Normal` ("Page primary action"),
  `页面次要操作 Disabled` ("Page secondary action"), `警告类操作` ("Warning action"). Copy
  names the *function*, not a cute verb.
- **Voice:** Instructional and direct. Marketing pages use second person ("一次开发，多端覆盖"
  — "develop once, cover every platform") and confident superlatives backed by numbers
  ("月活超 10 亿" — "1B+ MAU"). The FAQ even answers itself plainly: *"good question."*
- **Pronouns:** Docs address the developer as 开发者 ("the developer") or "you"; the
  framework refers to itself as `uni-app` (always lowercase, hyphenated, in backticks in docs).
- **Numbers as proof:** Copy leans on hard stats (800万 HBuilderX installs, 数千款 plugins)
  rather than adjectives.
- **Emoji:** **Not used** in product UI or component copy. (Some repo READMEs use one or
  two, but the interface itself is emoji-free.) Do not introduce emoji into uni-app designs.
- **Vibe:** Utilitarian, trustworthy, "it just works across every platform." Think
  developer tool, not consumer brand. Restraint over delight.

---

## VISUAL FOUNDATIONS

uni-app's look is the **WeUI / WeChat Mini-Program idiom** — the de-facto visual standard
for Chinese mobile. It is flat, iOS-influenced, and quiet.

- **Color.** Anchored on **iOS system blue `#007aff`** as the single action/primary color
  (primary buttons, switch-on, active tab, links, focus). Brand identity lives in the
  **green logo `#2b9939`** but green is *not* a UI color — the interface is blue+grey.
  Status colors follow WeUI: success `#4cd964`/`#09bb07`, warning `#f0ad4e`/`#ffbe00`,
  danger `#dd524d`/`#f76260`/warn-button `#e64340`, purple `#8a6de9`. Everything else is a
  **cool grey scale** (`#f8f8f8` page → `#f7f7f7` dividers → `#c8c7cc` hairlines → `#8f8f94`
  captions → `#333` body → `#000` titles).
- **Type.** **No custom font** — the native system stack (`-apple-system`, `Helvetica Neue`,
  `PingFang SC`, `Microsoft YaHei`…). Authored in **rpx** (responsive px; 750rpx = viewport
  width). Headings are bold (700) at 80/60/48/36rpx; body is 28–30rpx; captions 24rpx in grey.
- **Backgrounds.** Solid flat fills only. Page = `#f8f8f8`, content surfaces = white.
  **No gradients, no photographic hero backgrounds, no textures, no patterns.** Imagery is
  user content (product photos, avatars) framed in plain rounded boxes — never decorative.
- **Borders & dividers.** The signature detail: **1px iOS hairlines** drawn with
  `::after { height:1px; transform: scaleY(.5) }` in `#c8c7cc`, inset to the content's left
  edge in lists. Hairlines — not shadows — do the structural work. List dividers stop short
  on the left to align under the text.
- **Shadows / elevation.** Near-zero. The interface is deliberately flat. The *only* stock
  shadow is the **switch knob** (`0 1px 3px rgba(0,0,0,.4)`). Cards are flat white with a
  hairline, not raised. Use shadow only for genuinely floating layers (popups, action sheets).
- **Corner radius.** Restrained: **5px** buttons/tags, **3px** checkboxes, **4px (8rpx)**
  cards, **16px** switch track, fully-round (`100px`) badges and avatars. No big pill cards.
- **Hover / press.** Touch-first. Press states **darken the fill** (default button
  `#f8f8f8`→`#dedede`; primary `#007aff`→`#0062cc`) or drop text to **60% opacity**. List
  cells flash `#eee` on press (`-hover` classes). No scale/bounce on press.
- **Disabled.** Primary buttons go to **60% of their color** (`rgba(0,122,255,.6)`); default
  buttons fade text to `rgba(0,0,0,.3)`. Universal, consistent.
- **Animation.** Minimal and functional. Switch knob slides `transform .3s`; switch track
  color cross-fades `.1s`. Page transitions are the platform-native slide-in-from-right of
  the nav stack. **No decorative motion, no easing flourishes.** Fades/slides, never bounces.
- **Transparency & blur.** Used sparsely — transparent nav bars over hero images
  (`titleNView: transparent`), and opacity for press/disabled states. No frosted-glass blur
  as a default motif.
- **Layout rules.** Mobile-first, single column, **15px (30rpx) page gutter**. App chrome is
  **fixed**: a top nav bar (44px, blue in App / `#f1f1f1` in H5) and a bottom tab bar (4 tabs,
  active = blue). Content scrolls between them. On wide H5, content caps at **1190px** and a
  left/top window can appear (desktop split layout). Full-width edge-to-edge lists and forms.
- **Imagery vibe.** Neutral and literal — real product/UI screenshots and avatars, true-color
  (not warm/cool graded, not B&W, no grain). The aesthetic is *clarity*, not mood.

---

## ICONOGRAPHY

uni-app bundles its **own icon font, `uniicons` (`fonts/uni.ttf`)** — this is the primary
icon system and you should use it rather than substituting another set.

- **`uniicons` font** (`fonts/uni.ttf`): ~120 glyphs covering UI essentials — `back \e471`,
  `forward \e470`, `arrowdown \e581`, `arrowup \e580`, `search \e466`, `close \e404`,
  `clear \e434`, `star \e408` / `star-filled \e438`, `plus \e409`, `gear \e502`, `home \e500`,
  `info \e504`, `chat \e263`, `location \e303`, `camera \e301`, `scan \e612`, `more \e537`,
  contacts, media, social (weixin/weibo/qq) and more. Full map is in `colors_and_type.css`
  comments and `ui_kits/hello-uniapp/uniicons.css`. Apply with `class="uni-icon"` +
  `font-family: uniicons` and the glyph as content. The list chevron (`›`) is `\e583`.
- **The other built-in font: WeUI status icons.** uni-app's `<icon>` component embeds a
  separate base64 WeUI font with `success`, `info`, `warn`, `waiting`, `circle`, `cancel`,
  `download`, `search`, `clear` — colored by status (success/info = `#007aff`/`#10aeff`,
  warn = `#ffbe00`, cancel = `#f43530`). Used for form validation & toasts.
- **Tab-bar icons are PNGs** (`assets/tab-*.png`), supplied as normal/active pairs — the
  classic Mini-Program pattern of raster tab icons rather than font glyphs.
- **Unicode / emoji:** Unicode arrows appear via the icon font, not raw chars. **Emoji are
  not used.**
- **Substitution policy:** Don't substitute. The `uniicons` font is bundled here; use it. If
  a glyph is genuinely missing, the closest match in stroke weight is a thin-line set
  (e.g. Lucide), but flag any such substitution.

---

## Index / Manifest

Root files:

| File | What it is |
|---|---|
| `open-design.json` | Public Open Design plugin manifest for publishing this package as `design-system-uni-app`. |
| `DESIGN.md` | Canonical design-system rules. Start here when generating new screens, prototypes, or component examples. |
| `README.md` | This document — source context, product background, foundations, iconography, manifest. |
| `NOTICE.md` | Upstream source attribution and package policy for public distribution. |
| `colors_and_type.css` | All design tokens as CSS custom properties (colors, type scale, spacing, radius, elevation) + semantic primitives + `@font-face` for the icon font. Import this first. |
| `SKILL.md` | Agent-Skill front-matter so this system can be used directly in Claude Code. |
| `fonts/uni.ttf` | The `uniicons` icon font. |
| `assets/` | `logo.png` (green U lettermark) + tab-bar icon PNGs (normal/active pairs). |
| `preview/` | Small HTML specimen cards rendered in the Design System tab (type, color, spacing, components, brand). |
| `ui_kits/hello-uniapp/` | High-fidelity interactive recreation of the Hello uni-app showcase app. See its own `README.md`. |

UI kits:

- **`ui_kits/hello-uniapp/`** — the showcase mobile app: nav bar + tab bar chrome, the
  component-category accordion home, and live component demos (buttons, switches, lists,
  cells, badges, cards, action sheet, toast). Open `index.html`.

Preview cards:

| File | Coverage |
|---|---|
| `preview/brand-logo.html` | Logo mark and brand-green usage boundary. |
| `preview/brand-tabbar.html` | Preserved tab-bar PNG active/inactive icon pairs. |
| `preview/brand-icons.html` | `uniicons` glyph rules, state-color examples, tab-bar asset matrix, full specimen sheet. |
| `preview/color-action.html` | Primary action, pressed, disabled, and warn button colors. |
| `preview/color-grey.html` | Page, divider, line, surface, and disabled grey scale. |
| `preview/color-status.html` | Success, info, warning, danger, royal, and link semantics. |
| `preview/color-text.html` | Title, body, secondary, placeholder, inverse text colors. |
| `preview/type-stack.html` | Native system font stack and icon font. |
| `preview/type-headings.html` | Heading scale from H1 through H6. |
| `preview/type-body.html` | Body, secondary, caption, link, and ellipsis text primitives. |
| `preview/spacing.html` | rpx-derived spacing and standard 15px gutter. |
| `preview/radius.html` | Checkbox, button, card, switch, and pill radius tokens. |
| `preview/hairline.html` | iOS-style 0.5px hairline construction. |
| `preview/elevation.html` | Flat elevation rules, switch knob shadow, popup shadow. |
| `preview/comp-buttons.html` | Default, primary, warn, loading, and disabled button states. |
| `preview/comp-buttons-plain.html` | Plain / outline button variants. |
| `preview/comp-input.html` | Input group, placeholder, and row divider styling. |
| `preview/comp-switch.html` | Switch track, knob, on/off states. |
| `preview/comp-list.html` | Hairline-divided cell/list navigation pattern. |
| `preview/comp-card.html` | Flat card shell with hairline header/body/footer structure. |
| `preview/comp-badges.html` | Count, dot, and semantic badges. |
