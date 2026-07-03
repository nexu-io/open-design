# Contributing

This package is intended to be contribution-ready for Open Design while remaining usable as a local agent skill.

## Source of Truth

Use this priority order:

1. `SYSTEM-MANIFEST.json` and `manifest.json` for package structure and stable invariants.
2. `DESIGN.md`, `brand.json`, `system/tokens.*.json`, and `colors_and_type.css` for rules and tokens.
3. `examples/examples.css` and `examples/details-*.html` for exact component behavior.
4. `examples/page-*.html` for page composition.
5. `system/artifacts/*.html` for material-direction examples.
6. `preview/*.html` for quick review only.

If a material example or preview conflicts with `DESIGN.md`, `brand.json`, tokens, or a detail fixture, fix the material/preview file.

## Evidence Rules

- Separate measured evidence from inferred design decisions.
- Do not call inferred status colors, Chinese fallback stacks, or terminal visual calibration official Anthropic specifications.
- Keep official SVG imagery as content imagery, not logo, wordmark, button icon, or generic UI glyph material.

## Implementation Rules

- Import `colors_and_type.css` before artifact-specific CSS.
- Reuse `examples/examples.css` for navigation, dropdowns, buttons, route tabs, cards, switches, sidebars, state badges, and terminal components.
- Do not fork shared component behavior inside a page.
- Keep the outer topbar content identical across all package HTML pages.
- Do not ship `.nav-demo.is-open` in normal showcase, preview, kit, or page files.

## Before Submitting

Run or reproduce these checks:

- JSON parse for all `*.json` files.
- HTML structure check for all `*.html` files.
- Local `href` / `src` link check.
- Privacy scan for local paths and secrets.
- Topbar consistency check across package HTML files.
- Machine color check: `brand.json.colors`, `brand.json.palette`, and `brand.json.previewTheme` must be populated and must not fall back to a default blue theme.

## Local Skill Registry

For local use, expose this package through a registry stub that points back to this directory. Set `AGENT_SKILLS_ROOT` explicitly when running:

```bash
AGENT_SKILLS_ROOT="/path/to/agent-skills" scripts/install-as-agent-skill.sh
```

Do not commit a user-specific registry path.
