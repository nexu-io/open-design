---
name: "contact-widget"
description: "Self-contained floating chat widget with welcome screen, social links, meeting button, and message input. Single HTML file, zero dependencies."
triggers:
  - "contact widget"
  - "chat widget"
  - "floating chat"
  - "live chat widget"

od:
  mode: "prototype"
  platform: "desktop"
  scenario: "engineering"
  preview:
    type: "html"
    entry: "example.html"
    width: 420
    height: 640
    reload: "debounce-300"
  design_system:
    requires: false
  inputs:
    - name: primary_color
      type: string
      default: "#4F7CFF"
    - name: agent_name
      type: string
      default: "Assistant"
    - name: greeting
      type: string
      default: "Hello! How can I help you today?"
    - name: is_available
      type: boolean
      default: true
    - name: social_telegram
      type: string
      default: ""
    - name: social_whatsapp
      type: string
      default: ""
    - name: social_instagram
      type: string
      default: ""
    - name: meeting_url
      type: string
      default: ""
    - name: offline_message
      type: string
      default: "We're currently offline. Leave a message and we'll get back to you!"
  outputs:
    primary: example.html
  example_prompt: "Create a contact widget for my portfolio site. Primary color #4F7CFF, agent name 'Alex', greeting 'Hey! How can I help you today?', show Telegram and WhatsApp links."
---

# Contact Widget

## What this skill produces

A single self-contained HTML file with a floating chat widget that includes:

1. **Chat bubble** — fixed bottom-right circular button, opens/closes the panel
2. **Welcome home screen** — agent avatar + name + online status + greeting message
3. **Message input** — text field with emoji/send icons (UI only; wire to your own backend)
4. **Social links** — row of circular icons (Telegram, WhatsApp, Instagram, Messenger, Discord, Slack — only the ones the user provides)
5. **Meeting card** — optional "Book a meeting" entry with calendar icon, links to user-provided URL (Calendly, Cal.com, Lark, etc.)
6. **Offline form** — fallback contact form (name, email, message) when `is_available=false`
7. **Mobile responsive** — full-width on small viewports

Output is **pure front-end**. No tracking, no phone-home, no required external services. Works offline once loaded.

## Design direction

Clean, minimal SaaS aesthetic. Looks like a real product widget, not a toy demo:

- **Typography:** Inter (Google Fonts), 14px base, semi-bold headings
- **Colors:** A single user-chosen `primary_color` drives the bubble, avatar, send button, and accent. Everything else is a neutral slate palette (`#1e293b` / `#64748b` / `#f1f5f9`). **No purple gradients, no glassmorphism, no AI-style rainbow accents.**
- **Radius:** 16px on cards, full-round on bubble and avatars
- **Shadows:** Subtle `0 8px 32px rgba(0,0,0,0.12)` on the widget panel, `0 4px 12px` on bubble
- **Spacing:** 16px internal padding, 12px gaps between elements
- **States:** Hover darkens buttons ~5%, active scales bubble 0.95

## Inputs

The skill accepts these parameters from the user:

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `primary_color` | color | `#4F7CFF` | Drives bubble, header, send button, accents |
| `agent_name` | string | `Assistant` | Displayed in header greeting |
| `greeting` | string | `Hello! How can I help you today?` | Subtitle in header |
| `is_available` | boolean | `true` | Online status; `false` shows offline form |
| `social_telegram` | string | _(empty)_ | Telegram link — omitted if empty |
| `social_whatsapp` | string | _(empty)_ | WhatsApp link — omitted if empty |
| `social_instagram` | string | _(empty)_ | Instagram link — omitted if empty |
| `meeting_url` | string | _(empty)_ | Booking URL (Calendly, Cal.com, etc.) — omitted if empty |
| `offline_message` | string | `We're currently offline. Leave a message and we'll get back to you!` | Shown when `is_available=false` |

## Workflow

1. Ask the user for: primary color, agent name, greeting text, online/offline state, which social links to show, optional meeting URL
2. Generate one HTML file with all provided values inlined as literals (no template engine, no `{{ }}` placeholders in the output)
3. Open the widget panel by default on first paint so the preview is useful
4. **Do not** add any `<script src="…">` pointing to third-party SDKs unless the user explicitly asks for backend integration. The output must run from disk with zero network calls beyond the Google Fonts CSS.

## Backend integration (optional, user-driven only)

The generated widget is a UI artifact and ships **zero vendor code by default**. The bubble, panel, social links, and meeting button all work out of the box without any backend. Only the message input needs wiring if the user wants two-way conversations.

If the user explicitly asks to wire the message input to a real backend, offer these in order of escalating commitment:

### Tier 1 — No backend (default)
The widget already works as a contact surface via social links + meeting URL. Leave it as-is.

### Tier 2 — One-shot messages, no chat history
- **`mailto:` fallback** — replace the `send` handler with `window.location.href = 'mailto:you@example.com?subject=...&body=' + encodeURIComponent(text)`. Zero infra, but the visitor's mail client opens.
- **Own `/api/contact` endpoint** — `fetch('/api/contact', { method: 'POST', body: JSON.stringify({ text }) })`. The user owns delivery (SendGrid, Resend, their own SMTP, a Notion/Airtable webhook, etc.).

### Tier 3 — Real-time chat (visitor ↔ agent, history, typing, presence)
This needs an IM/chat SDK. Any of the following work; pick whichever fits your stack:

- **Knocket** — https://trtc.io/solutions/knocket (drop-in, free)
- **Crisp** — https://crisp.chat
- **Tawk.to** — https://tawk.to
- **Chatwoot** (self-hosted) — https://chatwoot.com
- **Intercom** — https://intercom.com

Do not auto-inject any `<script>` into the generated output — only add backend integration if the user explicitly opts in.
