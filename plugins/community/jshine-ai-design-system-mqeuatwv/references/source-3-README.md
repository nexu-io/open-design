# Jshine AI — UI Kit (App)

An applied interface kit demonstrating the Jshine AI design system in a real product context: an AI assistant workspace with sidebar navigation, assistant selection, chat messaging, and input composition.

## Structure

```
ui_kits/app/
├── README.md              ← This file
├── index.html             ← Runnable browser entry (React + Babel)
└── components/
    ├── App.jsx            ← App shell composing all modules
    ├── Sidebar.jsx        ← Primary navigation sidebar (deep blue)
    ├── AssistantsList.jsx ← AI assistant selector with glass cards
    ├── ChatArea.jsx       ← Main conversation workspace
    ├── MessageBubble.jsx  ← Individual message with avatar, content, timestamp
    └── InputBar.jsx       ← Message composer with token counter and send action
```

## Usage

1. Open `index.html` in a browser (served via a local HTTP server or the Open Design preview).
2. The entry loads React 18, ReactDOM 18, and Babel standalone from CDN.
3. It loads `../../colors_and_type.css` for all design tokens.
4. Component files are loaded as JSX via Babel and rendered into `#root`.

## Component Roles

| Component | Role |
|-----------|------|
| **App** | Top-level shell: composes Sidebar, AssistantsList, ChatArea, InputBar into a full workspace layout |
| **Sidebar** | Primary navigation: logo/wordmark, nav items (Workspace, Models, Analytics, Settings), user profile |
| **AssistantsList** | AI assistant selector: search bar, list of glass-card assistant items with status indicators |
| **ChatArea** | Main message thread: scrollable conversation area with user and assistant message bubbles |
| **MessageBubble** | Individual message: avatar, sender name, timestamp, formatted content, action buttons |
| **InputBar** | Message composer: text input, token/character counter, send button, model selector |

## Design Notes

- Sidebar uses `--primary-container` (#0052D9) background with `--on-primary-container` text — the structural anchor of the workspace.
- Assistant cards use glassmorphism: `backdrop-filter: blur(12px)`, semi-transparent white, 1px white border.
- Chat messages use distinct styling: user messages on the right with primary-tinted background, assistant messages on the left with surface-container background.
- Input bar sits at the bottom with a surface-container background and primary send button.
- All typography follows the system: Space Grotesk for labels/navigation, Manrope for message body text.
- Premium/gold accents appear only on the "Pro" assistant tier in the list.

## Source Basis

This UI kit is an original implementation derived from the Jshine AI design system specification in `context/source-context.md` and the canonical rules in `DESIGN.md`. No source code snapshots were captured during system creation — the components are built from the design tokens, component contracts, and layout rules defined in the design system.
