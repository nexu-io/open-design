# Design System Inspired by Slack

> Category: Productivity & SaaS
> Workplace communication platform. Aubergine-primary, multi-accent logo palette, light surfaces with dark sidebar, warm and approachable.

## 1. Visual Theme & Atmosphere

Slack's identity is built around the idea that work should feel human and even a little fun. The canonical surface is **light** — white content areas with a deep aubergine (`#4A154B`) sidebar — the inverse of dark-first tools. This contrast is intentional: the sidebar is a calm, always-present navigation anchor, while the content area is bright and open.

The logo palette — blue, green, yellow, red — appears primarily in the hashtag icon and marketing contexts, not scattered through the UI. In the product itself, Slack uses a restrained, professional color system with aubergine as the sole brand anchor.

**Key Characteristics:**
- Light-first content surfaces: white `#FFFFFF` and near-white `#F8F8F8`
- Deep aubergine `#4A154B` sidebar — the brand's most recognizable UI element
- Four logo accent colors (blue, green, yellow, red) used sparingly as highlights only
- Larsseit for headings (marketing), system sans-serif for UI
- Rounded but not cartoonish: 4–8px radius on most components
- Dense but breathable: compact message rows with clear thread hierarchy
- Warm and conversational tone — emojis, reactions, and illustrations are first-class

---

## 2. Color Palette & Roles

### Brand Primary
| Token | Hex | Role |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Sidebar background, primary brand color |
| `--color-aubergine-dark` | `#350d36` | Hover states on aubergine surfaces |
| `--color-aubergine-light` | `#611f69` | Active item highlight in sidebar |

### Logo Accent Colors (use sparingly — highlights, icons, marketing only)
| Token | Hex | Name | Role |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Sky Blue | Channel icons, links, info states |
| `--color-green` | `#2EB67D` | Teal Green | Online status, success states |
| `--color-yellow` | `#ECB22E` | Gold | Away status, warnings, highlights |
| `--color-red` | `#E01E5A` | Ruby | Notifications, errors, mentions badge |

### Surface & Background
| Token | Hex | Role |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Main message area, modals |
| `--bg-secondary` | `#F8F8F8` | Thread panels, secondary surfaces |
| `--bg-tertiary` | `#F1F1F1` | Input backgrounds, hover states |
| `--bg-sidebar` | `#4A154B` | Left sidebar (aubergine) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Sidebar item hover |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Active sidebar item |
| `--bg-message-hover` | `#F8F8F8` | Message row hover |

### Text Colors
| Token | Hex | Role |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Primary body text (near-black) |
| `--text-secondary` | `#616061` | Timestamps, muted labels |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Sidebar channel names |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Sidebar inactive items |
| `--text-link` | `#1264A3` | Inline links in messages |
| `--text-mention` | `#1264A3` | @mention text color |

### Semantic Colors
| Token | Hex | Role |
|---|---|---|
| `--color-success` | `#2EB67D` | Success toasts, positive states |
| `--color-warning` | `#ECB22E` | Warning states |
| `--color-danger` | `#E01E5A` | Error states, destructive actions |
| `--color-info` | `#36C5F0` | Informational highlights |

### Border & Divider
| Token | Hex | Role |
|---|---|---|
| `--border-default` | `#DDDDDD` | Standard dividers, card borders |
| `--border-subtle` | `#F1F1F1` | Subtle separators between rows |
| `--border-focus` | `#1264A3` | Focus ring color |

---

## 3. Typography Rules

### Typefaces
| Role | Official | Web Fallback |
|---|---|---|
| Display / Marketing Headings | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / Body / Chrome | Slack Lato (custom) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Code / Monospace | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack uses **Larsseit** for marketing headlines and a custom Lato variant for in-product UI. For web use, `system-ui` is the safest fallback.

### Type Scale

| Level | Size | Weight | Line Height | Letter Spacing | Usage |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | Marketing hero headlines |
| Display L | 36px | 700 | 1.15 | -0.5px | Section heroes |
| Heading 1 | 28px | 700 | 1.25 | normal | Modal titles, page headers |
| Heading 2 | 22px | 700 | 1.3 | normal | Card titles, settings sections |
| Heading 3 | 18px | 700 | 1.35 | normal | Sub-section headers |
| Body L | 16px | 400 | 1.5 | normal | Message text, descriptions |
| Body | 15px | 400 | 1.46667 | normal | Default UI text (Slack's base size) |
| Body SM | 13px | 400 | 1.38462 | normal | Secondary metadata |
| Caption | 12px | 400 | 1.33 | normal | Timestamps, hints |
| Code | 12px | 400 | 1.5 | normal | Inline code, code blocks |

### Type Rules
- Slack's base body size is **15px** — slightly smaller than 16px for density
- Unread channels: weight 700 — bold is the primary unread indicator
- Timestamps: 12px `--text-secondary`, show on hover only
- Code blocks: background `#F8F8F8`, border `1px solid #DDDDDD`, border-radius 4px
- Never use font sizes below 12px
- Marketing headings: letter-spacing `-1px` for large display sizes

---

## 4. Component Stylings

### Buttons

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Input Fields
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Sidebar Channel Item
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Unread Badge
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Message Attachments / Cards
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Reactions
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Layout Principles

### Three-Column Layout
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Spacing System (4px base)
| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Tight gaps |
| `--space-2` | 8px | Component padding |
| `--space-3` | 12px | Input padding |
| `--space-4` | 16px | Standard padding |
| `--space-6` | 24px | Card padding |
| `--space-8` | 32px | Section gaps |

### Sidebar Structure
```
[Workspace Name ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### Message Composer
- Pinned to bottom of message area
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Toolbar: emoji, attach, format, send button

---

## 6. Depth & Elevation

Slack uses light shadows on a light surface:

| Level | Usage | Shadow |
|---|---|---|
| Flat | Message rows, sidebar items | none |
| Low | Cards, inputs | `0 1px 3px rgba(0,0,0,0.08)` |
| Medium | Dropdowns, popovers | `0 4px 12px rgba(0,0,0,0.12)` |
| High | Modals, dialogs | `0 8px 24px rgba(0,0,0,0.15)` |
| Overlay | Modal backdrops | `rgba(0,0,0,0.5)` |

---

## 7. Do's and Don'ts

### ✅ Do
- Use aubergine `#4A154B` for the sidebar — it is Slack's most iconic UI element
- Keep the main content area white and light
- Use `#1D1C1D` (near-black) for all body text, not pure black
- Bold channel names to show unread status — weight is the indicator
- Use the four accent colors only for semantic roles (success, warning, danger, info)
- Apply `border-left: 4px` on message attachments and embeds
- Show timestamps on hover only
- Use `#1264A3` for links and focus states
- Keep sidebar items compact: 28px height, 6px border-radius

### ❌ Don't
- Don't use a dark main content area — Slack is light-first
- Don't scatter blue/green/yellow/red as decorative accents
- Don't use pure black `#000000` for text
- Don't use speech bubbles — messages are flat rows
- Don't make buttons large-radius — 4px is standard
- Don't show timestamps permanently
- Don't use ALL CAPS for channel names
- Don't use font sizes below 12px

---

## 8. Responsive Behavior

### Breakpoints
| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 768px | Single panel, sidebar as left drawer |
| Tablet | 768–1024px | Sidebar + message area only |
| Desktop | > 1024px | Full three-column layout |

### Mobile Adaptations
- Sidebar: left drawer, swipe right to open
- Bottom tab bar: Home, DMs, Activity, You
- Thread panel: full-screen overlay
- Composer: pinned above keyboard
- Channel list items: 44px touch target height
- Aubergine top header bar retained on mobile

---

## 9. Agent Prompt Guide

When generating Slack-styled designs, follow this approach:

**Color application:**
> Set `background: #FFFFFF` as the main canvas. Use `#4A154B` (aubergine) for the sidebar. All primary text is `#1D1C1D`. Links and focus rings use `#1264A3`. The four logo colors — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — are semantic only: info, success, warning, danger.

**Typography:**
> Use `system-ui, -apple-system, sans-serif` for all UI. Base size is 15px. Unread channels: weight 700. Body text: weight 400. Timestamps: 12px `#616061`, hover-only. Code: `Monaco, Menlo, monospace`, 12px, `#F8F8F8` background.

**Layout:**
> Three columns: 240px aubergine sidebar + flex white message area + optional 400px thread panel. Sidebar items: 28px height, 6px radius, bold when unread. Composer: pinned bottom, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Components:**
> Buttons: 4px radius, 36px height, aubergine primary. Inputs: `1px solid #DDDDDD` border, `#1264A3` focus ring. Message rows: flat, no bubbles, 36px circle avatar. Reactions: pill `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Tone:**
> Slack is warm, professional, and human. Empty states use friendly illustrations. CTAs are direct: "Send message", "Get started". Error messages are clear and helpful. Never alarming.

**Anti-patterns to avoid:**
> No dark content area. No speech bubbles. No pure black text. No scattered multi-color accents. No ALL CAPS channel names. No font below 12px. No large button radius.
