# Design System Inspired by WeChat

> Category: Social & Messaging
> WeChat's design language — green-dominant, chat-first, minimal chrome, utilitarian beauty.

## 1. Visual Theme & Atmosphere

WeChat (微信) is the connective tissue of daily life for over 1.3 billion users. Its design philosophy is "utilitarian minimalism" — every pixel earns its place by serving communication. Where Xiaohongshu is magazine-beautiful and Instagram is curated-grid, WeChat is chat-urgent and function-dense. The green brand color (`#07C160`) is the only saturated color on an otherwise near-white canvas. UI chrome is near-invisible; the conversation is the product.

Key characteristics:
- **Brand green** (`#07C160`) as the only saturated accent — headers, buttons, active states, QR scanners
- **Near-white canvas** (`#F5F5F5` for cards, `#FFFFFF` for chat bubbles, `#FAFAFA` for backgrounds)
- **Chat-bubble paradigm** — messages as the primary UI element, not cards or feed items
- **Dense but scannable** — more text per screen than Western apps, justified by Chinese reading habits
- **QR code as first-class citizen** — Scan, Share, Pay all flow through QR
- **Miniprograms** extend the OS-like layer within the app
- Voice notes, red packets, and stickers are cultural signatures

## 2. Color Palette & Roles

All values sampled from WeChat production UI (version 8.0+).

### Primary Brand
- **Brand Green** (`#07C160`): primary CTAs, header backgrounds, active tabs, send button, QR scanner frame
- **Green Hover** (`#06AD56`): pressed/active state of brand green
- **Green Light** (`#E8F8ED`): subtle green tint for notification badges, success states

### Neutrals
- **Surface White** (`#FFFFFF`): chat bubbles (outgoing), input fields, modals
- **Card Background** (`#F5F5F5`): chat bubbles (incoming), list items, discovery feed
- **Page Background** (`#EEEEEE`): page backgrounds behind cards
- **Dark Text** (`#191919`): primary text, message content
- **Secondary Text** (`#888888`): timestamps, metadata, secondary labels
- **Tertiary Text** (`#B2B2B2`): placeholder text, disabled states
- **Separator** (`#E5E5E5`): list dividers, hairline borders
- **Dark Separator** (`rgba(0,0,0,0.1)`): subtle dividers in dark mode

### Semantic Colors
- **Red Packet Gold** (`#F5A623`): gift/red packet accents — cultural special case
- **WeChat Red** (`#E64340`): error, danger, delete actions (not brand green)
- **Link Blue** (`#576B95`): hyperlinks within chat messages
- **Notification Red** (`#FA5151`): unread badge, WeChat Out call duration

### Dark Mode
- **Surface** (`#1E1E1E`): chat background
- **Card** (`#2C2C2E`): incoming bubbles
- **Outgoing Bubble** (`#07C160`): green maintained in dark mode
- **Text** (`#E5E5E5`): primary text
- **Secondary** (`#8A8A8A`): timestamps, metadata

## 3. Typography Rules

### Font Family
```
/* Chinese */
PingFang SC, -apple-system, 'Helvetica Neue', 'Microsoft YaHei', sans-serif

/* Numbers / Counts */
'WeChat Number', 'PingFang SC', sans-serif

/* Fallback for 'WeChat Number' — use tabular nums */
font-variant-numeric: tabular-nums;
```

### Hierarchy
| Element | Size | Weight | Line-height | Color |
|---|---|---|---|---|
| Chat message body | 16px | 400 | 22px | #191919 |
| Timestamp | 12px | 400 | 16px | #888888 |
| Contact name | 17px | 500 | 24px | #191919 |
| Official account title | 15px | 600 | 20px | #576B95 |
| Button label | 17px | 500 | 24px | #FFFFFF (on green) |
| Input text | 16px | 400 | 22px | #191919 |
| Placeholder | 16px | 400 | 22px | #B2B2B2 |
| Tab label | 10px | 500 | 14px | #888888 (inactive) / #07C160 (active) |

### Principles
- **No display-hero type** — no 32px+ headings in chat context
- **Compact line-height** — 1.3–1.4 for Chinese body text to maintain density
- **Timestamps are small and gray** — they recede, not compete
- **Numbers use tabular alignment** — like counts, message times

## 4. Component Stylings

### Chat Bubbles

**Incoming (others)**
- Background: `#F5F5F5`
- Border-radius: `8px 8px 8px 2px`
- Padding: `10px 14px`
- Max-width: `70%` of viewport
- Avatar: 40px circle, left-aligned, 8px gap to bubble

**Outgoing (self)**
- Background: `#95EC69` (light green, slightly lighter than brand `#07C160`)
- Border-radius: `8px 8px 2px 8px`
- Padding: `10px 14px`
- Max-width: `70%`
- Avatar: 40px circle, right-aligned

**Note:** WeChat's outgoing green is `#95EC69`, not brand green `#07C160`. This is a well-known divergence — brand green is used for headers/buttons, while chat bubbles use the lighter green for visual distinction.

### Send Button
- Background: `#07C160`
- Text: `#FFFFFF`, 16px, weight 500
- Border-radius: `4px`
- Padding: `10px 20px`
- Pressed: `#06AD56`

### Tab Bar (Main Navigation)
- 4 tabs: Chats, Contacts, Discover, Me
- Icon: 24px, inactive `#888888`, active `#07C160`
- Label: 10px below icon
- Active indicator: green dot (4px) above icon for active tab
- Background: `#FAFAFA` with top border `#E5E5E5`

### List Items (Chat List, Contact List)
- Height: 64–72px
- Avatar: 48–56px, left-aligned, 16px margin
- Title: contact/group name, 17px, weight 500, #191919
- Preview: last message, 14px, #888888, single line with ellipsis
- Timestamp: top-right, 12px, #888888
- Unread badge: red circle `#FA5151`, white text, min 16px diameter
- Divider: 1px #E5E5E5, inset 72px from left (after avatar)

### Input Field (Message Composer)
- Background: `#F5F5F5`
- Border-radius: `8px`
- Min-height: 36px, max-height: 96px (auto-expand)
- Padding: `8px 12px`
- Placeholder: #B2B2B2
- Focus: `#F5F5F5` background maintained, no visible border change

### Moments (Discover Feed)
- White card background `#FFFFFF`
- Author row: 48px avatar + name + timestamp
- Content: text + optional images (9-grid layout)
- Image grid: 3-column masonry, 4px gap, border-radius `4px`
- Like/comment bar: bottom, `#888888` icons, 14px labels

## 5. Layout Principles

### Spacing System (8pt grid)
Base unit 8px. Common stops: `4 / 8 / 12 / 16 / 20 / 24 / 32`.

### Chat Screen Layout
```
+------------------------+
| Header (green bar)     |  48px, #07C160
| Back | Title | More    |
+------------------------+
|                         |
| Message List            |  flex-grow, scrollable
| [Avatar] [Bubble]       |
|        [Bubble] [Avatar] |
|                         |
+------------------------+
| Input Bar              |  56px min
| [Voice][Text Input][+][Send]
+------------------------+
```

### Chat List Layout
```
+------------------------+
| Search Bar              |  52px
+------------------------+
| [Avatar] Name           |
|         Preview  Time    |
| ---------------------- |  divider
| [Avatar] Name           |
|         Preview  Time    |
| ---------------------- |
| ...                    |
+------------------------+
```

### Main Tab Navigation
```
+------------------------+
|                        |
|    Content Area        |
|                        |
+------------------------+
|  [Chat] [Contact] [D] [Me]  |  Tab bar, 56px, #FAFAFA
+------------------------+
```

### Responsive Behavior
- **Phone (< 375px)**: single column, compact avatars (40px)
- **Phone (375–414px)**: standard layout, 48px avatars
- **Tablet**: wider bubbles (max 60%), side-by-side chat list + conversation

## 6. Depth & Elevation

Two levels only:
- **Flat (0)**: default — all chat bubbles, list items, tabs
- **Modal (1)**: image viewer, video player, full-screen modals — centered with `rgba(0,0,0,0.6)` scrim

**No drop shadows on standard UI.** Depth comes from:
1. Background color contrast (`#F5F5F5` vs `#FFFFFF`)
2. Border-radius differentiation
3. Green accent for active/primary elements

## 7. Do's and Don'ts

### Do
- Use WeChat green (`#07C160`) for primary CTAs, headers, active tabs
- Use the lighter chat green (`#95EC69`) for outgoing message bubbles only
- Use the 8px grid for spacing
- Show avatars on both sides of chat bubbles
- Use small gray timestamps that recede
- Keep the input bar anchored to bottom
- Use the 4-tab navigation structure for main app flows

### Don't
- Don't use brand green for incoming message bubbles
- Don't use rounded rectangles for list item avatars — use perfect circles
- Don't use Inter, Helvetica, or Roboto as Chinese display faces — PingFang SC first
- Don't create elaborate hero headers in chat context
- Don't use gradients on message bubbles
- Don't use modal sheets for simple confirmations — use inline alerts
- Don't invent a different green — #07C160 for brand, #95EC69 for outgoing bubbles

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Layout |
|---|---|---|
| Small Phone | < 375px | Compact, 40px avatars |
| Standard Phone | 375–414px | Default, 48px avatars |
| Large Phone | > 414px | Wider bubbles, same structure |
| Tablet | >= 768px | Side-by-side chat list + conversation |

### Chat Screen
- Bubbles max-width: 70% on phone, 60% on tablet
- Avatar size: 40px on small phone, 48px standard
- Input bar height: 56px minimum

## 9. Agent Prompt Guide

### Quick Color Reference
- Brand Green (CTAs/Headers): `#07C160`
- Outgoing Bubble: `#95EC69`
- Incoming Bubble: `#F5F5F5`
- Page Background: `#EEEEEE`
- Surface White: `#FFFFFF`
- Dark Text: `#191919`
- Secondary Text: `#888888`
- Link Blue: `#576B95`
- Error Red: `#E64340`

### Quick Type Reference
- Family: `PingFang SC, -apple-system, 'Helvetica Neue', 'Microsoft YaHei', sans-serif`
- Chat message: 16px, weight 400, line-height 22px
- Timestamp: 12px, weight 400, line-height 16px, color #888888
- Button label: 17px, weight 500, color #FFFFFF on green
- Tab label: 10px, weight 500, #07C160 (active) / #888888 (inactive)

### Component One-Liners
- Send button: `background: #07C160; color: #FFF; border-radius: 4px; padding: 10px 20px;`
- Outgoing bubble: `background: #95EC69; border-radius: 8px 8px 2px 8px; padding: 10px 14px;`
- Incoming bubble: `background: #F5F5F5; border-radius: 8px 8px 8px 2px; padding: 10px 14px;`
- Chat list item: `height: 72px; avatar 48px; divider inset 72px from left`
- Tab bar icon: `24px; inactive #888888; active #07C160; label 10px below`
- Header: `background: #07C160; height: 48px; color: #FFFFFF;`
