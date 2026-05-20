# Design System Inspired by Plaid SDK

> Category: Fintech Infrastructure & Onboarding
> Bank-account connection, identity verification. Three-step indicator, dense brand-card grids, charcoal full-width CTA.

## 1. Visual Theme & Atmosphere

Plaid's SDK aesthetic is what a regulated handoff looks like — your app stops, Plaid's framing takes over with calm authority, and you trust it precisely because it doesn't look like marketing. The visual contract is severe: pure white canvas, charcoal-black ink (`#1F1F23`), a single Plaid wordmark centered in the header, and a top progress bar broken into 3 equal segments with the active step in teal (`#1AA39E`) — past steps in solid teal, future steps in 12% teal.

The body holds two archetypes. **The grid picker** is a 2-column grid of bank logo cards, each card a 1px gray border, 16px corner radius, holding the bank's signature logo at native colors (Chase blue, Wells Fargo red, Capital One blue+red). The grid is not styled — it's a chrome through which the banks express themselves. **The list picker** alternates: 24px circular bank logo + bank name + URL (small gray) + trailing chevron. Both end in the same charcoal-black `Continue` button pinned to the bottom safe area.

The first-screen narrative is conversational: "Sign in to Discover" with a bank illustration above it, a lightning bolt icon next to a single-line reassurance ("By signing in, you will instantly and securely connect your account."). No marketing copy, no benefit bullets, no testimonials. Plaid succeeds by being structurally invisible.

**Key characteristics:**
- Charcoal-black primary CTA `#1F1F23`, full-width, fixed bottom, 16px radius
- Teal accent `#1AA39E` reserved for progress + brand identifiers
- 3-segment progress bar at top: 4px tall, full-width minus margins, fully-rounded ends
- Bank cards in their native logo colors — system doesn't override brand
- Single-line reassurance text with leading icon (lightning, lock, sparkle)
- Centered Plaid wordmark in headers; never the host app's brand
- Lowercase "x" close icon in top-left or top-right
- Modal sheets with rounded-top corners 14px, 50% black backdrop

## 2. Color Palette

- **Plaid Teal** (`#1AA39E`): Progress active, brand mark, link text.
- **Plaid Teal Soft** (`#D6F0EE`): Past-step progress fill at 100%, badge backgrounds.
- **Charcoal** (`#1F1F23`): CTA fill, ink, icons.
- **Ink** (`#27272D`): Body text, headings.
- **Muted** (`#6E6E76`): Subtitle copy, "td.ca" URLs, helper text.
- **Border** (`#E5E5E8`): 1px around cards.
- **Page** (`#FFFFFF`): Always.
- **Modal Backdrop** (`rgba(0,0,0,0.50)`)

## 3. Typography

- **Title** 24/700 — "Sign in to Discover", "Connect to your institution"
- **Subtitle** 17/600 — Section anchors
- **Body** 16/400 — Reassurance copy, instructions
- **Label** 14/400 muted — URLs under bank names
- **CTA** 17/600 white-on-charcoal
- **Small caps** 11/700 uppercase — top "PLAID" mark beside icon

## 4. Components

### 3-Segment Progress Bar
- 3 equal pill segments, 8px gap, 4px tall
- Past + active: teal fill. Future: 12% teal.
- Sits 56px below status bar, 24px horizontal margin.

### Bank Card (grid)
- Square-ish 168x140, 1px `#E5E5E8` border, 16px radius
- Logo centered, native colors, max 80% of card width
- No shadow, no label below — the logo IS the label

### Bank Row (list)
- 56px tall, 24px circular logo at native color, name (16/600), URL (13/400/muted), chevron right

### Primary CTA
- Charcoal-black `#1F1F23`, full-width, 56px tall, 16px radius, white text 17/600
- Pinned 8px above safe area
- Press: scale(0.98), no color shift

### Reassurance Strip
- Icon (16px, charcoal) + single-line text (16/400/muted), no card chrome, just text sitting on canvas with 16px padding

## 5. Anti-Patterns

- No marketing language ("Powerful", "Seamless", "Trust")
- No multi-color gradients on CTAs
- No brand override on bank logos
- No 3+ trust badges in footer
- No animated lock or shield illustrations

## 6. When To Pick

Bank-connection flows, KYC, identity verification, regulated-action wrappers, secure handoffs. The voice is structural and quiet — let the host app's brand speak before and after, but **inside** the connection moment, the SDK takes control.
