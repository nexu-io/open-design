# RED-Inspired Lifestyle Discovery Design System

> Category: Social Commerce & Lifestyle
> Image-first discovery, warm white surfaces, compact type, rounded cards, and one confident red accent.

## 1. Visual Theme & Atmosphere

This system is modeled on a lifestyle discovery feed: real people, real objects,
real rooms, real outfits, real trips, and the small details users save for later.
The interface should feel like a quiet picture frame around user-generated
content. White surfaces, low-noise controls, compact typography, and restrained
chrome let photos provide most of the color.

The brand red is the only saturated UI color. It appears on active tabs, primary
actions, favorite states, and high-priority highlights. Everything else is soft
black, white, translucent gray, or content-driven color from imagery.

## 2. Key Characteristics

- Image-first masonry feed where variable card height is part of the look.
- Brand red as a singular accent, never paired with another saturated UI color.
- Near-white canvas with clean white cards and very low shadow.
- Rounded cards at 12-16px and pill buttons at 9999px radius.
- Compact type scale: dense, social, and mobile-native.
- Conversational copy written in second person.
- User photos carry the emotional tone; UI elements stay quiet.

## 3. Color Palette

### Brand

- **Brand Red** (`#FF2442`): primary accent, active tab, favorite state, primary CTA.
- **Component Red** (`#FF2E4D`): slightly softer button and active-bar variant.

### Surface

- **Surface** (`#FFFFFF`): cards, sheets, modals.
- **Canvas** (`#F5F5F5`): page background behind cards.
- **Subtle Surface** (`#FAFAFA`): quiet information backgrounds.
- **Fill 1** (`rgba(48,48,52,0.05)`): light hover and dividers.
- **Fill 2** (`rgba(48,48,52,0.10)`): disabled controls and secondary surfaces.
- **Fill 3** (`rgba(48,48,52,0.20)`): pressed states.
- **Separator** (`rgba(0,0,0,0.08)`): hairline borders.

### Text

- **Title** (`rgba(0,0,0,0.80)`): headings and primary text.
- **Paragraph** (`rgba(0,0,0,0.62)`): body and secondary copy.
- **Description** (`rgba(0,0,0,0.45)`): captions and helper text.
- **Disabled** (`rgba(0,0,0,0.27)`): disabled and placeholder text.

### Semantic

- **Success** (`#02B940`): rare, mostly system feedback.
- **Warning** (`#FF7D03`): rare, mostly system feedback.
- **Info** (`#3D8AF5`): rare, mostly system feedback.
- **Link** (`#133667`): deep navy text link.
- **Danger**: reuse brand red instead of introducing a separate danger hue.

## 4. Typography

- **Primary:** `PingFang SC`, `Noto Sans CJK SC`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `Arial`, sans-serif.
- **Number:** `RED Number`, `DIN Alternate`, tabular-numeral fallback.

### Scale

| Role | Size | Weight | Line Height |
| --- | ---: | ---: | ---: |
| Page heading | 28-32px | 600 | 1.25 |
| Section heading | 18-22px | 600 | 1.32 |
| Card title | 14-16px | 500-600 | 1.35 |
| Body | 14-16px | 400 | 1.45 |
| Caption | 12-13px | 400 | 1.4 |
| Metadata | 11-12px | 400-500 | 1.35 |

Keep tracking at `0`. Avoid thin weights at mobile body sizes.

## 5. Components

### Feed Card

- White card on `#F5F5F5` canvas.
- 12-16px radius.
- No visible shadow by default.
- Image flush to the top edge.
- Title below image, one or two lines.
- Footer with circular avatar, creator name, favorite icon, and count.

### Follow Button

| State | Background | Label | Text | Radius |
| --- | --- | --- | --- | --- |
| Not following | `#FF2442` | `Follow` | white | pill |
| Following | `rgba(48,48,52,0.10)` | `Following` | `rgba(0,0,0,0.45)` | pill |
| Mutual | `rgba(48,48,52,0.10)` | `Mutual` | `rgba(0,0,0,0.62)` | pill |

### Search Bar

- Height: 36-40px.
- Radius: 9999px.
- Background: `#F5F5F5`.
- Placeholder text uses description color.
- Search hotspot badges may use a red-to-orange gradient, but only for that
  specialized trending-search treatment.

### Tabs

- Text-only tabs with a 2px underline bar.
- Active tab uses brand red.
- Do not use filled pill backgrounds for primary navigation tabs.

### Bottom Sheet

- Mobile-first secondary action surface.
- 16px top-only radius.
- Drag handle centered at top.
- Scrim provides separation; use minimal shadow.

## 6. Layout

### Masonry Feed

| Viewport | Columns | Gap |
| --- | ---: | ---: |
| Mobile | 2 | 8-10px |
| Tablet | 3 | 10px |
| Small desktop | 4 | 10px |
| Desktop | 5 | 10px |

Use JavaScript-positioned masonry or a proven masonry layout engine when image
heights are unknown. Do not force every card to the same height.

### Profile

- Banner or top visual area.
- Circular avatar, 80-96px on profile hero.
- Follow button near the identity block.
- Stats use tabular numbers.
- Tab strip below: Notes, Saved, Liked.

### Creator Console

- Standard left navigation at 200-240px.
- Content width near 1000-1100px.
- Stat cards use white surfaces and spacing, not colored left-border accents.

## 7. Do

- Use brand red as the only saturated UI accent.
- Let user images carry the color.
- Use translucent fills for hover, disabled, and pressed states.
- Keep card shadows almost invisible.
- Write in a conversational second-person voice.
- Keep tab labels plain with underline active state.
- Default to bottom sheets for mobile secondary actions.

## 8. Do Not

- Do not use purple, deep blue, black-gold, or enterprise SaaS palettes.
- Do not fill whole heroes with brand red.
- Do not add heavy shadows, glassmorphism, neumorphism, blobs, or abstract network art.
- Do not create equal-height masonry cards.
- Do not add left-border accent stripes to feed cards.
- Do not write logo-wall enterprise social proof.
- Do not use stock business photography.

## 9. Implementation Tokens

```css
:root {
  --red: #ff2442;
  --red-button: #ff2e4d;
  --canvas: #f5f5f5;
  --surface: #ffffff;
  --title: rgba(0, 0, 0, .80);
  --paragraph: rgba(0, 0, 0, .62);
  --description: rgba(0, 0, 0, .45);
  --fill-1: rgba(48, 48, 52, .05);
  --fill-2: rgba(48, 48, 52, .10);
  --fill-3: rgba(48, 48, 52, .20);
  --separator: rgba(0, 0, 0, .08);
  --radius-card: 14px;
  --radius-pill: 9999px;
}
```
