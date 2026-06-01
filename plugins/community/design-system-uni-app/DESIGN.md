# uni-app Design System Rules

This is the canonical design-system source for the imported `uni-app Design System.zip`.
Use it before `README.md`, preview cards, or the Hello uni-app UI kit when creating new
screens, prototypes, documentation, or component examples.

## Product Position

uni-app is DCloud's cross-platform Vue framework. Its interface language is not a
marketing-site brand system; it is the practical mobile component idiom used by
Hello uni-app, built-in uni-app components, and WeUI-style Mini Program surfaces.

Design posture:

- Mobile-first developer utility.
- Simplified-Chinese first, with API names kept as lowercase English identifiers.
- Terse, instructional, engineer-to-engineer copy.
- Flat system UI with high recognizability across App, H5, and Mini Program targets.

## Source Of Truth

Use these files in this order:

1. `colors_and_type.css` for tokens, primitives, icon font, component color states.
2. `ui_kits/hello-uniapp/kit.css` for composed app chrome and interactive component behavior.
3. `ui_kits/hello-uniapp/uniicons.css` for glyph classes and the embedded `uniicons` font.
4. `assets/` and `fonts/` for preserved source assets.
5. `preview/*.html` for small specimen cards and gallery tiles.

Do not replace source assets with redrawn, optimized, generated, or third-party substitutes.

## Color System

The UI is blue and grey. The green logo is brand identity, not the general action color.

Core tokens:

- Primary/action: `#007aff`
- Primary pressed: `#0062cc`
- Primary disabled: `rgba(0,122,255,.6)`
- Brand logo green: `#2b9939`
- Page background: `#f8f8f8`
- Card/list surface: `#ffffff`
- Section divider fill: `#f7f7f7`
- Hairline divider: `#c8c7cc`
- Body text: `#333333`
- Strong title text: `#000000`
- Secondary text: `#8f8f94`
- Placeholder text: `#b2b2b2`

Status tokens:

- Success: `#4cd964` and `#09bb07`
- Info: `#10aeff`
- Warning: `#f0ad4e` and `#ffbe00`
- Danger: `#dd524d`, `#f76260`, and warn-button `#e64340`
- Royal/purple: `#8a6de9`
- WeChat inline link: `#576b95`

Rules:

- Use `#007aff` for primary buttons, active tabs, switches, links, focus, and selected state.
- Reserve `#2b9939` for the uni-app logo or brand mark context only.
- Do not create warm beige, peach, brown, or decorative gradient page backgrounds.
- Do not make monochrome-grey prototypes when an action or status state is present.
- Use status colors only when the UI communicates state, validation, warnings, or counts.

## Typography

uni-app ships no brand text font. Use native system fonts.

Font stack:

```css
-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica,
"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI",
Roboto, Arial, sans-serif
```

Scale:

- H1: `40px`, weight `700`
- H2: `30px`, weight `700`
- H3: `24px`, weight `700`
- H4: `18px`, weight `700`
- Body: `15px`, line-height `1.6`
- List cell / nav title: `17px`
- Secondary: `13px`
- Caption: `12px`
- Button: `18px`
- Mini button: `13px`

Rules:

- Keep API names lowercase and literal: `button`, `scroll-view`, `picker-view`.
- Chinese labels should remain practical and direct: `视图容器`, `表单组件`, `基础内容`.
- Do not introduce decorative display fonts.
- Do not use emoji in product UI.

## Layout And Chrome

Base mobile contract:

- Standard canvas: 375px logical width, mobile-first.
- Page gutter: `15px` / `30rpx`.
- Fixed app chrome: top nav bar and bottom tab bar.
- App nav bar: `44px`, blue `#007aff`, white title.
- H5 nav bar: light `#f1f1f1`, black title.
- Bottom tab bar: 4 tabs, background `#f8f8f8`, inactive `#7a7e83`, active `#007aff`.
- Content scrolls between nav and tab bar.

Wide H5:

- Cap content at `1190px`.
- Use split layout only when the product surface needs a left/top window.
- Do not simply stretch mobile lists into wide empty rows.

## Borders, Radius, Elevation

Structure comes from hairlines, not shadows.

Radii:

- Checkbox: `3px`
- Button/tag/chip: `5px`
- Card: `4px`
- Switch track: `16px`
- Badge/avatar: `100px`

Hairlines:

- Use `#c8c7cc`.
- Prefer pseudo-element hairlines with `height: 1px` and `transform: scaleY(.5)`.
- In lists, inset dividers to the content left edge, usually `15px` or `16px`.

Elevation:

- Default cards are flat white with hairline borders.
- The only stock shadow is the switch knob: `0 1px 3px rgba(0,0,0,.4)`.
- Use popup/action-sheet shadow only for genuinely floating layers.

Avoid:

- Raised marketing cards.
- Decorative shadows.
- Large-radius pill cards.
- Nested card stacks.

## Components

Buttons:

- Default fill `#f8f8f8`, pressed `#dedede`, text `#000000`.
- Primary fill `#007aff`, pressed `#0062cc`, white text.
- Warn fill `#e64340`, pressed `#ce3c39`, white text.
- Disabled primary uses `rgba(0,122,255,.6)`.
- Plain buttons are outline/text treatments, not filled cards.

Lists and cells:

- White list surfaces on `#f8f8f8` pages.
- Cells are at least `48px` tall.
- Press state flashes `#eee`.
- Navigation cells use right chevron from `uniicons` or matching thin chevron.

Forms:

- Inputs sit in flat list groups.
- Placeholder color is `#b2b2b2`.
- Validation should use WeUI/uni-app status color semantics.

Switches:

- Off track `#dfdfdf`, on track `#007aff`.
- Knob is white with the canonical knob shadow.
- Transition: transform around `.3s`, color around `.1s` to `.15s`.

Badges:

- Use fully rounded badges for counts, dots, and status labels.
- Use status colors only for real state.

Overlays:

- Action sheets slide from the bottom.
- Modals are centered, direct, and sparse.
- Toasts are dark translucent blocks with status glyphs or loading spinner.

## Iconography

Primary icon system:

- Use bundled `fonts/uni.ttf` and `ui_kits/hello-uniapp/uniicons.css`.
- Apply icons with `font-family: "uniicons"` or the provided `uni-icon` helpers.
- Common glyphs include back, forward, search, close, clear, star, plus, gear, home,
  info, chat, location, camera, scan, more, contact, media, and social glyphs.

Tab bar:

- Use the preserved PNG pairs in `assets/tab-*.png`.
- Normal and active states are separate raster files.
- Do not replace tab icons with a generic icon set.

Substitution policy:

- Do not substitute icons by default.
- If a glyph is missing, choose the closest thin-line symbol and document the substitution.
- Do not use emoji as icons.

## Motion And Interaction

Motion is functional only.

- Switch knob slide: `transform .3s`.
- Track color cross-fade: `.1s` to `.15s`.
- Page transitions should feel native: right-to-left push, back pop, fade/slide overlays.
- Press states use darker fill or 60% opacity.
- No bounce, no decorative scroll reveals, no animated gradients.

## Imagery

Use literal product imagery only:

- UI screenshots.
- App avatars and user content.
- Preserved logo and tab bar assets.
- Labeled placeholders when no source media exists.

Do not use stock photography, atmospheric hero images, hand-drawn scenes, grain, or
decorative background patterns.

## Content Rules

- Product UI is Simplified-Chinese first.
- Keep technical identifiers exactly as source names.
- Explain by role and state, not personality.
- Use real source metrics only when they exist.
- When information is unknown, use a short honest placeholder instead of inventing content.

Examples:

- Good: `页面主操作 Normal`
- Good: `表单组件`
- Good: `button`
- Avoid: `Launch faster with magical components`
- Avoid emoji, invented performance claims, and filler feature labels.

## Implementation Checklist

Before shipping a uni-app design artifact:

- Import or mirror `colors_and_type.css` tokens.
- Use system font stack only.
- Use `#007aff` as the primary UI action color.
- Preserve `assets/` and `fonts/` files byte-for-byte.
- Use `uniicons` and tab PNG pairs instead of substitutes.
- Keep pages flat: hairlines, white surfaces, grey page background.
- Use correct radii: 3/4/5/16/100px depending on component.
- Include real touch states: pressed, disabled, selected, loading where relevant.
- Avoid emoji, gradients, decorative motion, stock imagery, and fake metrics.

