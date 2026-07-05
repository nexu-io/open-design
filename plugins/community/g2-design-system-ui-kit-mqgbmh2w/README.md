# G2 Design System UI Kit

This community plugin packages a reviewable UI kit for the HiCatcat G2 AR glasses HUD design system.

## What It Enables

- Generate dark G2 HUD-style prototypes inside Open Design.
- Reuse source-backed role components for call, message, AI card, teleprompter, device, and bottom command surfaces.
- Switch between regular 640 display scale and compact 320 display scale.
- Avoid generic mobile, SaaS dashboard, marketing page, and warm brand-kit styling.

## Files

- `SKILL.md` - Agent instructions.
- `open-design.json` - Plugin manifest.
- `index.html` - Browser-reviewable UI kit entry.
- `colors_and_type.css` - G2 token CSS.
- `components/` - React/Babel component files used by `index.html`.
- `references/` - Provenance and source notes.

## Review

Open `index.html` in a browser. The page loads local CSS and component files from this plugin directory. It uses React, ReactDOM, and Babel from CDN only for the preview shell.

The root element uses `data-g2-mode="regular"`. Change it to `data-g2-mode="compact"` to review the 320-mode scale.

## Validation

The plugin is valid when:

- Every path named in `SKILL.md` and `open-design.json` exists.
- `index.html` references `./colors_and_type.css` and files under `./components/`.
- The visual direction stays aligned with G2 AR glasses HUD tokens.
