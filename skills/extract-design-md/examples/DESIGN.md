---
name: Alpine Peak
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#5c5f61'
  on-secondary: '#ffffff'
  secondary-container: '#e0e3e5'
  on-secondary-container: '#626567'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#161c22'
  on-tertiary-container: '#7e848c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#e0e3e5'
  secondary-fixed-dim: '#c4c7c9'
  on-secondary-fixed: '#191c1e'
  on-secondary-fixed-variant: '#444749'
  tertiary-fixed: '#dde3eb'
  tertiary-fixed-dim: '#c1c7cf'
  on-tertiary-fixed: '#161c22'
  on-tertiary-fixed-variant: '#41474e'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-bold:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  label-caps:
    fontFamily: Lexend
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  stat-lg:
    fontFamily: Lexend
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 40px
---

## Brand & Style

The brand personality is high-performance, sophisticated, and dependable. It is
designed for the modern skier who demands clarity and precision in harsh
environments. The visual language evokes the crystalline beauty of a mountain
peak while prioritizing the rugged utility required for outdoor navigation.

The design system utilizes **Glassmorphism** to achieve a "frozen" aesthetic,
mimicking the properties of ice and packed snow. This is paired with a
**High-Contrast** philosophy to ensure that critical data—like trail status and
weather alerts—remains legible under intense mountain sunlight or the
low-visibility conditions of a snowstorm.

## Colors

The palette is anchored by **Deep Peak Blue**, a dark navy that provides a
grounding contrast for white text and maps. **Powder White** serves as the
primary canvas, ensuring the interface feels airy and cold.

**Safety Orange** is reserved strictly for primary calls to action, hazard
warnings, and emergency trail closures, ensuring immediate eye-tracking.
**Electric Blue** (the info status) is used for weather updates and general
interactivity. For trail difficulty levels, standard industry colors (Green,
Blue, Black) are used but rendered with high-saturation values to pop against
the white backgrounds.

## Typography

The typography system uses **Inter** for core functional text and body copy due
to its exceptional x-height and legibility at small sizes. **Lexend** is
introduced for labels and statistics; its hyper-readable, athletic character
suits the "active" nature of skiing data like speed and vertical drop.

To combat outdoor glare, font weights are generally heavier than standard web
applications. Display styles use tight tracking and heavy weights to create a
sense of strength. Labels always utilize high-contrast coloring against their
backgrounds.

## Layout & Spacing

This design system uses a **Fluid Grid** model with generous safe areas.
Elements are spaced using a strict 4px/8px baseline rhythm to maintain a
disciplined, professional appearance.

Touch targets are intentionally oversized (minimum 48x48px) to accommodate users
wearing gloves. Padding within cards and containers is kept spacious (`lg` or
`xl`) to prevent the interface from feeling cluttered when displaying complex
trail data.

## Elevation & Depth

Depth is conveyed through **Glassmorphism** and backdrop filters rather than
traditional heavy shadows. Surfaces use a hierarchy of transparency:

1.  **Base Layer:** Solid 'Powder White' or 'Deep Peak Blue'.
2.  **Middle Layer (Cards/Modals):** 70% opacity white with a 20px backdrop blur
    and a thin 1px 'Ice' border (white at 40% opacity).
3.  **Top Layer (Floating Actions):** 90% opacity with a subtle 4px ambient
    shadow to separate the element from the blurred background.

This creates a "stacked ice" effect that maintains visual clarity while giving
the UI a premium, modern feel.

## Shapes

The shape language is defined by modern, organic **rounded corners**. This
softens the high-contrast color palette and makes the app feel approachable.

Interactive elements like buttons and chips utilize `rounded-lg` (1rem) or
`rounded-xl` (1.5rem) to suggest a tactile, "pebble" feel. Large containers like
map overlays use 1rem corners, while small status indicators for trail
difficulty may use pill shapes for instant recognition.

## Components

### Buttons

Primary buttons use a solid 'Safety Orange' or 'Deep Peak Blue' fill with white
text. High-contrast outlines are used for secondary actions. All buttons must
feature a minimum height of 52px for gloved-hand accessibility.

### Cards & Modals

Cards utilize the glassmorphism effect—semi-transparent backgrounds with a 1px
white border. This ensures that map imagery or photos underneath remain slightly
visible, maintaining the "frozen" aesthetic.

### Trail Status Chips

Pill-shaped indicators with high-saturation icons. Green (Easy), Blue
(Intermediate), Black (Expert), and Double Black (Extreme). These must include
text labels alongside icons to ensure accessibility for colorblind users.

### Input Fields

Fields feature a 'Cloud Gray' background with a thick bottom border that
transforms into 'Electric Blue' on focus. Labels are always visible above the
field to ensure the user doesn't lose context in bright environments.

### Weather Widgets

Bold, thick-stroke iconography (minimum 2pt stroke) to represent sun, snow, or
wind. These icons should be large and accompanied by 'Lexend' typography for
temperature and wind speed.