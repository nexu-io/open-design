# Design System Inspired by Microsoft Outlook (iOS)

> Category: Productivity & Communication
> Email, calendar, contacts — corporate-trust blue, content-first, calm hierarchy.

## 1. Visual Theme & Atmosphere

Outlook iOS is a textbook example of "trust through restraint." The header is a deep cobalt blue band (`#1F62B0`) that anchors every primary surface; everything beneath it is pure white with a tightly tuned grayscale text hierarchy. The system never reaches for accent flourishes — the only chromatic punctuation is the same brand blue used for active states, links, and the unread dot, plus a single red (`#D13438`) reserved for destructive or draft warnings.

The brand voice is corporate-mature but never sterile. Avatars are deterministically colored from a six-tone set (terracotta, sage, lilac, brown, cobalt, pink) — bright enough to break up dense inbox lists, muted enough to read as professional. Action chips and quick-reply suggestions live in a soft light-blue tint (`#E5F0FB`) that connects back to the brand color without screaming. Shadows are barely present: a single low-elevation 8% black shadow under the floating compose pill and the bottom-sheet action menu, nothing else.

Typography is hierarchy-driven, not size-driven. The "Inbox" / "Work" headline at 28pt bold white-on-blue sets the tonal anchor. From there, sender names step down to 17pt semibold, subject lines to 16pt semibold, preview text to 15pt regular gray, and metadata (timestamps, section labels like "Yesterday" / "This Week") to 13pt regular in mutedGray. The leading is generous (~1.4-1.5), so dense list views still breathe.

**Key Characteristics:**
- Cobalt header band (`#1F62B0`) — every primary surface starts with this color
- Pure white page background (`#FFFFFF`); never off-white, never gray
- Single-accent system: header blue doubles as link, active-state, focus, and brand
- Six-color avatar palette deterministically hashed by first letter
- Two-pane bottom navigation: Email / Calendar / Apps — exactly three, never more
- Focused / Other segmented control sits inside the header, white-on-blue active
- Floating dual-icon compose pill (pencil + new) — never a single FAB
- Action-sheet pattern: white pill card sliding up from bottom with blue "Cancel"
- Quick-reply chips in light-blue fill (`#E5F0FB`) with brand-blue text
- One destructive red (`#D13438`) reserved for "Draft" markers and trash icons
- Shadows are atmospheric, not architectural — single layer at 8% black
- No emojis in chrome; iconography exclusively monoline SF Symbols-style

## 2. Color Palette & Roles

### Brand
- **Outlook Blue** (`#1F62B0`): Primary brand color. Header bg, active tab labels, links, unread dot, brand-blue text on chips, focus rings. Saturated cobalt — slightly cooler than Office's marketing blue.
- **Brand Blue Dark** (`#155092`): Pressed/hover state, Focused-tab pill background within the header.
- **Brand Blue Light** (`#E5F0FB`): Light-blue tint for quick-reply chips, action-row hover, sub-card highlights.

### Surfaces
- **Page Surface** (`#FFFFFF`): Default canvas. No tints, no warmth.
- **Surface Sunken** (`#F3F2F1`): Used inside action sheets and section dividers when separation is needed; never on the main inbox list.
- **Header Surface** (`#1F62B0`): The cobalt band itself, full-bleed under the status bar.

### Text
- **Ink** (`#1C1C1E`): Primary body and sender names. Near-black, not pure black, for readable density.
- **Subhead** (`#3A3939`): Subject lines and email body in detail view.
- **Muted** (`#605E5C`): Preview text, timestamps, section labels ("Yesterday", "This Week", "Last Month").
- **Disabled** (`#A19F9D`): Empty-state copy, disabled controls.
- **Ink Inverse** (`#FFFFFF`): Text on the cobalt header band.

### Status & Destructive
- **Draft Red** (`#D13438`): Reserved for the "Draft" label and trash icon. Never used for marketing or persuasion.
- **Success** (`#107C10`): Read receipts, send-confirmation toasts. Used sparingly.
- **Warning** (`#FFB900`): Calendar event conflicts.

### Avatar Palette (deterministic by initial)
- Terracotta (`#D4844C`), Sage (`#5BAA68`), Lilac (`#A36ECC`), Brown (`#A66D4D`), Cobalt (`#5089C6`), Pink (`#D879B3`).
- A function hashes the initial to one of six; the same person always gets the same color across the app.

### Borders & Dividers
- **Divider** (`#EDEBE9`): Between list rows, between cards.
- **Border** (`#DFDDDB`): Around input fields, around the search bar.
- **Focus Ring** (`#1F62B0`): 2px solid, no offset, for keyboard focus.

## 3. Typography

The default stack is San Francisco on iOS (`-apple-system`), with Segoe UI as the brand fallback for cross-platform contexts.

| Token | Size | Weight | Line | Letter | Use |
|---|---|---|---|---|---|
| `text-title` | 28px | 700 | 32px | -0.4px | Top inbox title ("Inbox", "Work"), white-on-blue |
| `text-headline` | 22px | 700 | 28px | -0.3px | Mailbox/folder names in side menus |
| `text-sender` | 17px | 600 | 22px | -0.2px | Sender name in list rows |
| `text-subject` | 16px | 600 | 22px | -0.1px | Subject line; switches to 500 when read |
| `text-body` | 15px | 400 | 22px | 0 | Preview text, email body |
| `text-meta` | 13px | 400 | 18px | 0.05px | Timestamps, section labels, captions |
| `text-button` | 16px | 600 | 20px | 0 | Action sheet, CTAs, chip text |
| `text-chip` | 14px | 600 | 18px | 0 | Quick-reply chip text |

Unread rows render sender + subject at weight 600. Read rows step down sender to 600 (unchanged) but subject to 500 — subtle weight drop is the only visual cue, no color change.

## 4. Component Stylings

### List Rows (Inbox)
- 72px height, 16px horizontal padding
- Leading: 40px circle avatar with single-letter monogram, white text on the deterministic avatar color
- Title row: sender (17px / 600) + timestamp right-aligned (13px / muted)
- Subject row: 16px / 500-600 depending on read state, single line, ellipsis-clipped
- Preview row: 15px / 400 / muted, two-line clamp
- Unread indicator: 6px solid brand-blue circle, 8px left of avatar
- Divider: 1px `#EDEBE9` between rows, full-bleed except under avatar

### Bottom Navigation
- Three tabs: Email / Calendar / Apps — never four
- 56px height + 34px safe area
- Active tab: 24px icon filled in brand blue, label in brand blue
- Inactive tabs: 24px icon outlined in `#605E5C`, label in `#605E5C`
- No badge dots unless an unread tally is being conveyed

### Focused / Other Segmented Control
- Sits inside the cobalt header band, below the title
- Pill shape (999 radius), 36px height, two segments
- Active segment: white fill with `#155092` text (brand-blue dark)
- Inactive segment: transparent fill with white text
- Tap target extends 12px outside the visible pill

### Compose Floating Pill
- Dual-icon container at bottom-right, 8px above the bottom nav
- White fill, 56px height, 12px corner radius, soft shadow (`0 4px 16px rgba(0,0,0,0.08)`)
- Two icons inside, 28px tap area each: pencil (reply-from-anywhere) + new-message square
- No FAB-style accent fill; the pill stays neutral and lets the icon color carry meaning

### Action Sheet
- White rounded card sliding up from bottom, 16px top-left and top-right radii
- Backdrop: 50% black overlay
- Action rows: 56px tall, leading icon (24px, neutral gray) + label (17px / 400 / ink)
- Cancel row: separate floating card 8px below the action card, brand-blue text, semibold

### Quick Reply Chips
- Pill (999 radius), 12px horizontal / 8px vertical padding
- Background `#E5F0FB`, text `#1F62B0`, weight 600
- Sit in a horizontal scroller above the reply composer; never wrap

### Compose Toolbar (bottom of New Message)
- Pill container (999 radius), white fill, soft shadow
- 7 inline tools: attachment, camera, draw, ABC formatter, file, send-later, overflow
- Each tool: 28x28 tap area, monoline icon in `#3A3939`
- Send action sits separately in the header, top-right, as a paper-plane icon in brand blue

### Inputs (New Message: To/Cc/Bcc/Subject)
- 56px height each, 16px horizontal padding, 1px bottom divider
- Label left-aligned (To:, Cc:, Subject:) at 15px / muted
- Filled-recipient chips inline: light-gray pill with email + remove (×); red highlight when contact unknown

## 5. Hero & Empty States

- The inbox header is the system's hero — full cobalt bleed, white title at 28px bold, white avatar monogram on the left, three icon actions (notifications, search, filter/sort) on the right
- Empty inbox: 200x200 illustration in the Outlook line-art style (envelope + leaf or coffee mug); no bouncing chevrons, no "Scroll to discover"
- Empty folder: short, declarative copy ("No messages here"), single secondary CTA in brand-blue text

## 6. Motion Intent

- Cubic-bezier (`0.4, 0.0, 0.2, 1`) — Microsoft Fluent's standard motion curve
- Action-sheet enter: 200ms slide up + 150ms backdrop fade; exit reverses at 140ms
- Tab switch: 180ms fade-cross of content; bottom nav itself never animates
- List row read-state transitions: 120ms color step (no length animation)
- Compose pill subtly scales 0.96 on press, returns 1.0 over 80ms
- No perpetual loops, no shimmer, no "alive" idle animation — Outlook is calm by design

## 7. Anti-Patterns (Banned)

- No purple/violet accents — Outlook is single-blue
- No gradient text, no neon glows, no oversaturated chrome
- No 3-column grids for primary content
- No emojis in iconography (the avatar's monogram is the closest thing)
- No "Elevate", "Seamless", "Unleash" copy
- No fake round numbers ("$1,500", "100% match") — use organic data ("$1,492.75", "8.4 GB used")
- No animated FABs that bounce on idle
- No dark-on-cobalt buttons in the header — only white-on-cobalt or cobalt-on-white

## 8. When To Pick This System

Use Outlook iOS as the design anchor when:
- The product handles **dense information lists** (email, cases, tasks, deadlines)
- Trust + corporate-mature voice matters more than playful brand personality
- The user is a **professional doing focused work**, not a consumer browsing
- You want a **single dominant brand color** that does heavy structural lifting
- The form factor is **content-first**: lists, threads, structured records

Avoid when the product needs editorial expression, photographic hero, or a multi-accent palette (use editorial / linear-app / stripe instead).
