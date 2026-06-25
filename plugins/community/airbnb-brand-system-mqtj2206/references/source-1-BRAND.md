# Airbnb Brand System

## Visual Theme
Airbnb's visual identity is built around **warm minimalism with a single decisive pop of pink**. The design language is airy, spacious, and human-scaled — never cluttered, never corporate. White backgrounds provide a clean canvas for rich photography and the iconic Rausch pink accent.

The system is intentionally restrained: one background (white), one surface (light grey), one accent color used sparingly. The power is in photography, typography, and generous whitespace — not ornamentation.

## Logo Usage
- **Primary**: The Airbnb wordmark (`logos/wordmark.svg`) — a custom-lettered logotype in `#FF385C` Rausch pink
- **Symbol**: The Bélo mark (`logos/belo.svg`) — an abstract "A" that also represents a heart, a location pin, and a person with arms raised. Used as favicon, app icon, and standalone brand mark
- **Clear space**: At minimum the height of the Bélo symbol around all sides
- **Minimum size**: 102×32px for wordmark; 30×32px for Bélo alone
- **Background**: Always on white or light surfaces. Reverse on dark photography with sufficient contrast

## Color Roles

| Role | Hex | Name | Usage |
|------|-----|------|-------|
| Background | `#FFFFFF` | White | Page backgrounds |
| Surface | `#F7F7F7` | Light Grey | Cards, sections, hover states |
| Foreground | `#222222` | Ink | Primary text, primary borders |
| Muted | `#6A6A6A` | Stone | Secondary text, captions |
| Border | `#DDDDDD` | Hairline | Dividers, disabled states |
| Accent | `#FF385C` | Rausch | CTAs, brand marks, hero moments |
| Accent Secondary | `#E00B41` | Product Rausch | Primary CTA hover/active states |

**Gradient (Rausch):** `linear-gradient(to right, #E61E4D 0%, #E31C5F 50%, #D70466 100%)` — use for hero CTAs, brand marks, and featured moments only. Never as a page or section background.

**Key rule**: The Rausch pink is a seasoning, not a sauce. One pink element per screen is usually enough. Never flood a page with pink backgrounds or gradients.

## Typography

Airbnb uses **Airbnb Cereal VF** — a proprietary geometric sans-serif custom-designed by Dalton Maag. It's warm, clean, and highly readable at all sizes. The licensed commercial fallback is **Circular**. For web projects without Cereal licensing, **Inter** is the closest Google Font substitute.

### Type Scale
- **Display**: 600 weight, sizes from 2.5rem (40px) to 4.5rem (72px), letter-spacing: -0.02em
- **Headlines**: 600 weight, 1.125rem–2rem (18–32px)
- **Body**: 400–500 weight, 0.875rem–1.125rem (14–18px)
- **Captions**: 400 weight, 0.75rem (12px)
- **Legal/Micro**: 400 weight, 0.625rem (10px)

### Font Stack
```css
font-family: 'Airbnb Cereal VF', 'Circular', -apple-system, BlinkMacSystemFont, 'Roboto', 'Helvetica Neue', sans-serif;
```

Chinese text stacks: `'PingFang SC', 'Airbnb Cereal VF', ...`

## Voice & Tone

**Essence**: Warm, inviting, human-scale. Airbnb speaks like a well-traveled friend who wants you to have an amazing trip — knowledgeable but never pretentious, encouraging but never pushy.

**Four messaging pillars**:
1. **Belong Anywhere** — every stay feels like home
2. **Unique Stays** — real homes and experiences, not hotel rooms
3. **Hosted by Locals** — authentic connection to place and people
4. **For Everyone** — inclusive, accessible, global community

**Do**: Use warm, conversational language. Say "home" not "property." Say "host" not "owner." Celebrate the unique and the personal. Be global in outlook, local in detail.

**Don't**: Use hotel-industry language. Be corporate or formal. Over-promise or use hyperbole. Generic travel marketing speak.

## Imagery

Airbnb photography is the soul of the brand. Images are:
- **Real**: Actual homes and hosts, not models or staged sets
- **Natural**: Daylight, soft shadows, no flash
- **Warm**: Slightly desaturated earth tones with subtle warmth
- **Human**: Candid moments, real interactions, lived-in spaces
- **Aspirational yet attainable**: Beautiful but believable

**Subjects**: Interior architecture, distinctive spaces, hosts and guests, local experiences, landscape exteriors, cozy details.

**Treatment**: Soft natural lighting, shallow depth of field for intimate interiors, wide establishing shots for exteriors. Color grading toward warm neutrals with subtle pink/magenta undertones in brand contexts.

**Never**: Harsh flash, over-saturation, sterile hotel photography, generic stock, HDR effects.

## Component Stylings

### Buttons
- Primary: Rausch pink background (`#FF385C` or gradient), white text, 12px border-radius
- Secondary: White background, `#222222` border, dark text
- Ghost: No background/border, `#222222` text
- Hover: Slightly darker (`#E00B41` for primary, `#F7F7F7` bg for secondary)

### Cards
- Background: White `#FFFFFF` with 1px `#DDDDDD` border or subtle shadow
- Border-radius: 12px (medium), 16px (large cards), 28px (hero cards)
- Shadows: Multi-layer with low opacity:
  - Elevation 1: `0px 2px 4px rgba(0,0,0,0.16)`
  - Elevation 2: `0px 2px 6px rgba(0,0,0,0.04), 0px 4px 8px rgba(0,0,0,0.10)`
  - Elevation 3: `0px 8px 24px rgba(0,0,0,0.10)`

### Navigation
- Background: Frosted glass — `rgba(250,250,250,0.72)` with `backdrop-filter: blur(24px) saturate(1.6)`
- Search bar: White pill with subtle shadow, large border-radius

### Inputs
- Border: `#DDDDDD` default, `#222222` focus
- Border-radius: 8px
- Background: White

## Layout & Spacing

- **Grid**: 8px baseline
- **Spacing scale**: 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80px
- **Page padding**: 24–80px depending on viewport
- **Max content width**: Variable — Airbnb uses fluid layouts, not fixed containers
- **Section spacing**: Generous (48–80px between sections)

## Depth & Motion

### Shadows
Five elevation levels from subtle card lift to modal overlay:
- `elevation0`: Inset hairline (form fields)
- `elevation1`: Subtle card lift
- `elevation2-3`: Floating cards, dropdowns
- `elevation4-5`: Modals, overlays

### Motion
- **Standard**: `cubic-bezier(0.2, 0, 0, 1)` — 584ms — for most transitions
- **Enter**: `cubic-bezier(0.1, 0.9, 0.2, 1)` — for appearing elements
- **Exit**: `cubic-bezier(0.4, 0, 1, 1)` — for disappearing elements
- Spring curves available for bouncy interactions (fast/medium/slow variants)

## Dos & Don'ts

### Do
- ✅ Use Rausch pink sparingly — one accent per screen
- ✅ Let photography be the hero — images should be large and immersive
- ✅ Keep backgrounds white or very light grey
- ✅ Use generous whitespace — breathing room is part of the aesthetic
- ✅ Pair bold display typography (600 weight) with restrained body text
- ✅ Use the Bélo symbol with adequate clear space
- ✅ Apply subtle shadows with low opacity — never heavy drop shadows

### Don't
- ❌ Never use pink as a page or section background
- ❌ Don't add cream, beige, or peach page washes
- ❌ Don't use heavy shadows or excessive depth effects
- ❌ Don't overcrowd — Airbnb design breathes
- ❌ Don't use generic hotel/travel stock photography
- ❌ Don't pair icons with every heading
- ❌ Don't use purple, violet, or indigo accents — the brand is pink/red
- ❌ Don't use Inter or Roboto as display faces — Cereal/Circular or Inter is for body only

## Agent Prompt Guide

When generating Airbnb-branded designs:
1. Start with `#FFFFFF` background and `#F7F7F7` surfaces
2. Use `#222222` for all primary text — never pure black
3. Add `#FF385C` Rausch pink only to the most important CTA or brand element
4. Set type in the Cereal stack (falling back to Inter/Circular/sans-serif)
5. Let photography carry the emotional weight — use large, immersive images
6. Keep layouts spacious with the 8px grid
7. Apply 12px border-radius to cards and interactive elements
8. Use frosted glass for sticky navigation
9. Voice: warm, human, inviting — like a friend recommending a trip
10. Remember: restraint over ornament. Airbnb's power is in what it omits.
