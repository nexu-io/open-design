# G2 design system UI Kit

This UI kit is the applied interface reference for the design system. Open `index.html` to review the composed app surface, then reuse the modular role components under `components/` when building new product-like artifacts.

## Structure

- `index.html` - Browser-reviewable entry that loads `../../colors_and_type.css`, React, ReactDOM, Babel, and the component files.
- `components/App.jsx` - App shell that composes the role components.
- `components/Sidebar.jsx` - Navigation rail or sidebar pattern.
- `components/AssistantsList.jsx` - Object, assistant, or thread list pattern.
- `components/ChatArea.jsx` - Primary workspace with message/content stream.
- `components/InputBar.jsx` - Composer or command-entry surface.
- `components/MessageBubble.jsx` - Message, note, or review-comment unit.

## Usage

Copy component files into a React prototype or open `index.html` directly for visual review. Keep `colors_and_type.css` loaded before the components so color, type, spacing, radius, and state variables resolve through the extracted token contract.

## Design Notes

Prefer source-backed component roles over static duplicate HTML. When repository evidence is available, replace this scaffold with components modeled from captured app shell, navigation, composer, message, and content surfaces.

## Source

Use parent `DESIGN.md`, `README.md`, `preview/`, and `context/` as the evidence trail for any future refinement.

## Provenance

Formalized by Open Design from candidate 33633026-3f08-4a00-86c8-1bbd1d3e1ce4.
