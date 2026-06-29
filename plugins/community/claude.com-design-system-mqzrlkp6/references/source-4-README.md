# Claude.com Design System — App UI Kit

An applied interface example demonstrating the Claude.com design system in a product-like chat application surface. Models the claude.ai product interface with a sidebar, conversation list, chat area, message bubbles, and input composer.

## Kit Structure

```
ui_kits/app/
├── README.md                    # This file
├── index.html                   # Runnable browser entry point
└── components/
    ├── Sidebar.jsx              # Left sidebar shell — top nav, user menu
    ├── AssistantsList.jsx       # Conversation/assistant list rail
    ├── ChatArea.jsx             # Main message area with scroll
    ├── MessageBubble.jsx        # Individual message (user/assistant)
    ├── InputBar.jsx             # Text composer with send action
    └── App.jsx                  # App shell — composes all components
```

## Usage

Open `index.html` in a browser to see the composed interface. It loads React 18, ReactDOM, and Babel standalone for JSX transpilation, then loads each component from `components/` and renders the `App` component.

### Components

| Component | File | Role |
|---|---|---|
| App | `App.jsx` | Top-level shell — layout grid composing sidebar, list, chat area, and input |
| Sidebar | `Sidebar.jsx` | Left sidebar with navigation, branding, and user menu |
| AssistantsList | `AssistantsList.jsx` | Conversation/list rail showing recent chats or assistants |
| ChatArea | `ChatArea.jsx` | Main scrollable message area rendering message bubbles |
| MessageBubble | `MessageBubble.jsx` | User and assistant message styling with role indicators |
| InputBar | `InputBar.jsx` | Bottom input bar with textarea, send button, and attachments |

### Design Notes

- All components use CSS custom properties from `colors_and_type.css` for colors, typography, spacing, and radius.
- The cream canvas + dark sidebar creates the alternating surface rhythm from the design system.
- Coral accent used sparingly — on the send button and active conversation indicator.
- No shadows on cards; depth comes from surface color contrast.
- JetBrains Mono for code snippets within message bubbles.
- Inter for all UI text (open-source substitute for StyreneB).

### Source Basis

This UI kit is modeled after the claude.ai product interface, using the marketing design system tokens from DESIGN.md. The actual claude.ai product surface includes additional product-specific components (chat bubbles, message tools, file upload chips) that extend beyond the marketing-surface design system.
