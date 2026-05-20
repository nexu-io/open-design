# Design System Inspired by Professional Case Trackers (Deel · Docusign · ClickUp pattern)

> Category: Professional Services & B2B SaaS
> Case / agreement / task tracking. Deep indigo hero band, monochrome ink stats, generous white space, single-color action buttons.

## 1. Visual Theme & Atmosphere

The case-tracker archetype is what happens when professional-services SaaS grows up. The visual language alternates between two surfaces: a deep indigo or violet header band that anchors brand and identity, and a generous off-white canvas below where the real work — agreements, cases, tasks — lives in airy, well-spaced cards. The header carries one promotional callout per session ("Upgrade your account") with a small illustrated lockup; everything below is utilitarian.

Stats are the second hero. A two-card "Action Required / Waiting for Others" row sits directly under the welcome line, each card holding a single oversized digit (40px+, weight 800, deep ink) above a 14px label. The ratio of digit-to-label is what sells the gravitas — these are not vanity metrics, they are blocking-work counts.

Action language is direct: "Take a tour" / "Check visa eligibility" / "Use Template" — verbs in the imperative, with primary buttons rendered as solid charcoal pills and secondary as filled gray. The brand color shows up almost exclusively as a circular FAB at the bottom-center for "New" actions, never as button fill in the body content. List rows ("Agreement activity", "Tasks Due This Week") use the same compact two-line pattern: title in 16/600, metadata in 13/400 muted, right-aligned timestamp.

**Key characteristics:**
- Deep indigo or violet hero band (`#3C1A78` to `#4F2BA1` range) covers ~25% of the viewport at the top, then white canvas below
- Charcoal black (`#1F1F2A`) for primary CTAs — never the brand color in body
- Brand color reserved for: bottom FAB (round, 56px), small accent dots, link text
- Stat cards: huge digit + small caps label; no background tint, just outline + soft shadow
- List rows: leading icon tile (40x40, 8px radius, tinted), 2-line text, right meta + chevron
- Imperatives only — no marketing copy in product chrome
- Single illustrated lockup per header card (purple violet, isometric, never photographic)
- Bottom navigation is 3 tabs max: Home / Work / Add — the Add is a centered round FAB

## 2. Color Palette & Roles

### Brand
- **Royal Violet** (`#4F2BA1`): Hero band base, FAB fill, primary link text. Saturated, confident.
- **Violet Deep** (`#2E1A6D`): Header band gradient stop on the right; press states.
- **Violet Tint** (`#EFE7FF`): Quiet badge backgrounds, "Sponsored" pills.

### Surfaces
- **Canvas** (`#FAFAF7`): Page background. Warm, paper-feeling off-white.
- **Card** (`#FFFFFF`): All elevated surfaces.
- **Surface Sunken** (`#F2F1EA`): Faint section separators, search-input fill.

### Ink
- **Ink** (`#1F1F2A`): Headings, stat digits, primary CTA fill, body.
- **Subhead** (`#3E3E4A`): Subtitles, agreement subjects.
- **Muted** (`#6B6B7A`): Timestamps, status pills, metadata.
- **Disabled** (`#A6A6B0`): Empty-state copy.

### Status
- **Success** (`#1F8B5C`): "Signed", "Complete" pills.
- **Warning** (`#C77400`): "Overdue", "Action Required" highlights.
- **Danger** (`#A6332C`): "Declined" markers.

### Borders
- **Divider** (`#E8E6E0`): 1px between list rows.
- **Border** (`#D3D1C9`): Around stat cards and input fields.

## 3. Typography

| Token | Size | Weight | Use |
|---|---|---|---|
| `text-hero-promo` | 22 | 700 | "Upgrade Your Account" in hero band, white-on-violet |
| `text-welcome` | 32 | 800 | "Welcome" / "People" page heading |
| `text-stat-digit` | 48 | 800 | "1" / "12 cases" — large stat numbers |
| `text-stat-label` | 14 | 600 | "Action Required" — caps not required |
| `text-row-title` | 16 | 600 | List row primary line |
| `text-row-meta` | 13 | 400 | Right-aligned timestamps, "From: …" |
| `text-section` | 17 | 700 | "Agreement activity", "Tasks Due This Week" |
| `text-btn` | 15 | 600 | Button labels |

Tracking is neutral throughout — no aggressive `-0.6em` display tightening. The text is meant to be read, not admired.

## 4. Component Stylings

### Hero Band
- Full-bleed top band, 180-220px tall, violet gradient (`#3C1A78 → #5C2FB8` left-to-right)
- Holds: welcome lockup (32px white title), one promo card with illustrated lockup (envelope + leaf + sparkles), small caps subtitle
- No bottom border; the canvas color bleeds in via soft shadow `0 6px 20px rgba(60, 26, 120, 0.12)`

### Stat Cards (paired)
- Two cards side-by-side, equal width, 16px gap, 20px corner radius
- White fill, 1px border, soft shadow `0 4px 12px rgba(0,0,0,0.04)`
- Inside: digit (48/800/ink) over label (14/600/subhead), 24px top padding, 20px bottom

### List Rows (Activity)
- 72px row height, 16px padding
- Leading 40x40 rounded-8 tile with tinted icon (violet-soft for agreement, amber-soft for warning)
- Two-line text: title (16/600/ink), subtitle "From: <name>" (13/400/muted)
- Right meta: timestamp (13/400/muted), chevron (16px, muted)
- 1px `#E8E6E0` divider, full-bleed except under tile

### Primary Button
- 52px tall, 16px radius, charcoal `#1F1F2A` fill, white text 15/600
- Hover: slight lift `translateY(-1px)`, press: `scale(0.98)`

### Secondary Button
- Same shape, `#F2F1EA` fill, charcoal text

### FAB
- 56x56 round, brand violet fill, white "+" icon, centered in bottom nav
- Soft glow shadow `0 8px 24px rgba(79, 43, 161, 0.30)`

### Bottom Navigation
- 3 tabs: Home / Work (centered FAB) / Agreements (or Inbox)
- 80px height including safe area, white fill, 1px top border

### Tab Pills (top of "People")
- Pill shape, 999 radius, 36px height, ghost-style: outline `#D3D1C9`, label `#3E3E4A`
- Active: filled `#1F1F2A`, white label

## 5. Motion

- Cubic-bezier (`0.4, 0, 0.2, 1`)
- Card lift on press: 80ms scale
- Tab switch: 200ms fade-cross
- FAB press: 120ms scale + 200ms expanding action sheet
- No infinite loops or shimmer — case work is calm

## 6. Anti-Patterns

- No body-content buttons in brand violet (only FAB + links)
- No three-equal-stat cards (always pairs)
- No emoji avatars
- No 5-tab bottom navigation
- No glossy gradients on stat digits

## 7. When To Pick

Use when the product is **a B2B workflow tool**: contract management, case tracking, agreement signing, immigration files, employee onboarding, vendor management. The voice is professional-mature with a single splash of brand color reserved for the action that creates new work.
