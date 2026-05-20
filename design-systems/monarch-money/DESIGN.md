# Design System Inspired by Monarch Money

> Category: Personal Finance & Budgeting
> Navy authority + warm coral alert. Money-data dense, expandable category accordions, emoji icon system.

## 1. Visual Theme & Atmosphere

Monarch's design language is what you get when "you're going to budget like an adult" meets "but we won't punish you for it." A deep navy band (`#1A3158`) sits at the top of every screen carrying month-context ("February 2024") and a calendar icon — the navy is gravitas, the authority of a fiduciary tool. Directly below it sits a warm coral alert strip (`#E8748A`) showing your over-budget status in plain language ("Left to budget · –$50"). The coral is unapologetic — when you're red, you see red, but it's a friendly red, not a bank-website-shame red.

The body is light, airy, expandable. Categories live in accordion cards (Auto & Transport, Bills & Utilities, Income, Business) with budget + remaining columns. Each category opens to reveal sub-line-items with **emoji prefix icons** — 🚗 for transport, 🌴 for vacation, 🍽 for restaurants, 💰 for income, 🎁 for gifts. This is rare and intentional: Monarch lets emojis carry icon duty because they read instantly across cultures and add levity to the otherwise rigorous task of seeing where every dollar goes.

The bottom navigation is a hard-six: Dashboard / Accounts / Transactions / Cash Flow / Budget / Recurring. Six tabs is heavy by iOS standards but right for the use case — money tracking is information-architecture-first. The active tab uses navy ink with a filled icon variant; inactive tabs use a softer ink.

**Key characteristics:**
- Navy header band `#1A3158` with month-picker and calendar icon
- Coral alert strip `#E8748A` for over-budget warnings (always white text)
- Emoji icons (🚗 🍽 🌴 💰 🎁) as the line-item prefix system
- 6-tab bottom navigation; active in navy 600, inactive in soft slate 400
- Light gray section banding `#F1F2F4` to visually separate category groups
- Money inline-edit: tap a `$0` cell, it becomes a focused input with the same dimensions (no modal)
- Remaining column uses a soft tonic green chip `#DCEFE3` when under budget, soft coral `#FCDCE0` when over

## 2. Color Palette

- **Monarch Navy** (`#1A3158`): Header band, active nav, primary ink for headings.
- **Navy Deep** (`#0F1F3C`): Pressed/active state, focused-input borders.
- **Coral Alert** (`#E8748A`): Over-budget strip, "Left to budget" callout.
- **Coral Soft** (`#FCDCE0`): "Over by" remaining chip.
- **Mint Soft** (`#DCEFE3`): "Under by" remaining chip, success states.
- **Mint Strong** (`#1F8B5C`): Positive value text.
- **Ink** (`#0E1A2E`): Body, money values.
- **Subhead** (`#3F4A5B`): Section labels.
- **Muted** (`#7E8694`): Inactive nav, helper text, "0" placeholder.
- **Border** (`#D8DCE3`): 1px around budget cells.
- **Section Banding** (`#F1F2F4`): Faint banding between expanded categories.
- **Card** (`#FFFFFF`): Default surface.

## 3. Typography

- **Hero (month)** 17/600 navy — "February 2024" centered in header band, white-on-navy
- **Category** 17/700 ink — "Income", "Auto & Transport"
- **Section header** 13/600 muted caps — "Expenses", "Income", "Contributions"
- **Budget cell digit** 17/600 ink — "$0", "$1,250"
- **Remaining chip** 13/700 mint or coral
- **Sub-item label** 16/500 ink — "Paychecks", "Restaurants & Bars"
- **Nav label** 11/500 muted, 600 navy when active
- **Alert strip** 17/700 white — "Left to budget · –$50"

## 4. Components

### Header Band
- Navy `#1A3158` full-bleed, 88px tall including status bar pad
- Three columns: back-arrow (left), centered month-picker (tap to switch), calendar icon (right)
- 1px dark divider at bottom (`rgba(0,0,0,0.10)`)

### Coral Alert Strip
- Full-bleed under header, 48px tall, coral fill `#E8748A`
- Left text: "Left to budget" + info icon, white 17/700
- Right text: signed dollar amount, white 17/700, monospaced numerals

### Category Accordion
- White card, 1px border `#D8DCE3`, 12px radius
- 16px padding, three columns: chevron + label (left), Budget cell, Remaining cell (right-aligned)
- Sub-items appear under the parent when expanded, indented 24px with emoji + label + amount input + remaining chip

### Budget Cell (editable)
- 80px wide, 36px tall, 1px border `#D8DCE3`, 6px radius
- Right-aligned amount in 17/600 ink
- On focus: 2px navy border, no fill change
- Empty: "$0" in muted gray

### Remaining Chip
- 80px wide, 36px tall, 999 radius
- Mint-soft fill if positive (`#DCEFE3` bg + `#1F8B5C` text)
- Coral-soft fill if negative (`#FCDCE0` bg + `#A6332C` text)
- Disabled gray fill if not applicable

### Section Header
- Light gray banding `#F1F2F4`, 36px tall, 16px horizontal padding
- "Expenses" / "Income" / "Contributions" in 13/600 caps muted
- Right side has "Budget" / "Remaining" column labels in 12/600 muted

### Bottom Navigation (6 tabs)
- White fill, 1px top border `#D8DCE3`, 72px height + safe area
- Six tabs: Dashboard / Accounts / Transactions / Cash Flow / Budget / Recurring
- Active: filled navy icon + 11/600 navy label
- Inactive: outlined slate icon + 11/500 muted label

### "Show N unbudgeted" link
- Eye icon + "Show 6 unbudgeted" in 13/400 muted, inline within accordion
- Tap expands sub-items in 200ms accordion animation

## 5. Motion

- Accordion expand: 220ms ease-out, grid `0fr → 1fr` row pattern
- Tab switch: 180ms color fade, no movement
- Inline-edit focus: 120ms border color
- Alert strip: subtle 1.5s fade-in on initial load if user is over-budget, never animates after

## 6. Anti-Patterns

- No bar charts in the navigation chrome
- No gradient on the coral alert strip — flat is the point
- No "$1,500.00" full-zero formatting — Monarch uses "$1,500" rounded
- No more than 6 bottom tabs
- No replacing emojis with line icons — the emojis are intentional

## 7. When To Pick

Personal-finance trackers, budget apps, fiduciary dashboards, expense categorization, savings goals. The navy-coral pairing reads as "responsible adult, not your enemy." Six-tab bottom nav signals "information-rich utility."
