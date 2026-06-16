# G2 Design System UI Kit

Use this skill when generating Open Design artifacts that should follow the HiCatcat G2 AR glasses HUD design system. This plugin packages a browser-reviewable UI kit, local token CSS, and modular React role components.

## Structure

- `index.html` - Browser-reviewable entry that loads `./colors_and_type.css`, React, ReactDOM, Babel, and the component files.
- `colors_and_type.css` - Source-backed G2 token CSS for dark HUD color, type, spacing, radius, icon, stroke, and compact/regular display modes.
- `components/App.jsx` - App shell that composes the G2 HUD surface.
- `components/Sidebar.jsx` - Compact system rail for mode, call, messages, AI, and device controls.
- `components/AssistantsList.jsx` - AI card and quick status pattern.
- `components/ChatArea.jsx` - Primary message, call, and teleprompter workspace.
- `components/InputBar.jsx` - Bottom command-entry surface.
- `components/MessageBubble.jsx` - Message, note, and assistant response unit.
- `README.md` - Human-readable package guide and validation notes.

## Usage

Open `index.html` directly for visual review. Copy component files into a React prototype when building product-like artifacts. Keep `colors_and_type.css` loaded before the components so color, type, spacing, radius, stroke, and mode variables resolve through the G2 token contract.

## Design Notes

Use G2 as a dark AR glasses control interface, not a generic mobile app, SaaS dashboard, or marketing page. Preserve these source-backed cues:

- Black optical canvas.
- White, secondary gray, and tertiary gray text.
- `#333333` controls, borders, and disabled surfaces.
- `#0D76FF` selected state.
- `#0D76FFA6` focus and touch feedback.
- Noto Sans Medium/Bold typography.
- `data-g2-mode="regular"` for 640 mode and `data-g2-mode="compact"` for 320 mode.

Do not invent off-token accent colors, glassmorphism, or landing-page hero compositions.

## Provenance

Formalized by Open Design from candidate 33633026-3f08-4a00-86c8-1bbd1d3e1ce4 and corrected so every referenced file is packaged in this plugin folder.
