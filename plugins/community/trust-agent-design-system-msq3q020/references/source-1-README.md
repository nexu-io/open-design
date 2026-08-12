# Trust Agent — design system

Registered system: `user:app-agenttrusthq-com`  
Source: https://app.agenttrusthq.com/  
Default theme: dark terminal (2026-08 UX redesign)

This package was AI-optimized in place. The first programmatic pass produced a usable but thin 7-color spec and a **light Ant Design** kit that does not match the product. This revision re-measures production CSS and the live marketing HTML.

## Start here

| File | What it is |
| --- | --- |
| `DESIGN.md` | Tokens, type, motion, components, posture |
| `BRAND.md` | Logo, voice, do/don’t |
| `SKILL.md` | How to apply the system in a new HTML artifact |
| `brand.json` | Machine-readable brand record |
| `system/variables.css` | `:root` dark + `[data-theme=light]` |
| `system/kit.html` | Dark component kit (default) |
| `system/kit.dark.html` | Same kit locked to dark (gallery slot) |
| `system/index.html` | Package gallery |
| `system/COMPONENTS.md` | Primitive contract (Button, Chip, Panel, …) |
| `fonts/` | IBM Plex Sans / Mono / Condensed (latin) |
| `logos/wordmark.svg` | `trust_agent` |
| `logos/mark.svg` | Concentric-circle mark |
| `context/provenance.md` | What was measured vs inferred |

## Product prototypes (this project)

Not the kit: logged-in and marketing HTML already in the project root (`app-shell.html`, `marketplace-landing.html`, `about.html`, `trust-scores.html`, `developers.html`). They should follow this system; the kit is the reusable reference.

## Caveats

- First-pass `logos/header-inline.svg` was a hamburger icon; archived as `logos/menu-icon.svg`.
- First-pass webfonts were Vietnamese subsets; replaced with latin fontsource files. Live next/font latin preloads are in `fonts/source-next/`.
- IBM Plex Sans Condensed is used by the app (`next/font/google`) but was missing from the first extraction.
- Ant Design 218-token ramps in the old `variables.css` are retired. Do not regenerate from `colorPrimary: #0c7a4d` on white.
- Light theme exists and must be checked, but dark is the brand face.
