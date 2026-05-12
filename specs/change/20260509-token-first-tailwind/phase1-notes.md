# Phase 1 Notes: Foundation PR

## Implementation

<!-- Files created/modified; implementation decisions; migration inventory/classification; retained/deferred rationale; problems encountered; deviations from design -->

- Tailwind no-Preflight setup must use the official layered CSS imports in `apps/web/src/index.css`:
  ```css
  @layer theme, base, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);

  @layer base {
    *, ::before, ::after, ::backdrop, ::file-selector-button {
      border: 0 solid;
    }
  }
  ```
- Keep Preflight excluded in Phase 1 and retain the project-owned border reset from Tailwind's Preflight contract in the base layer so `border border-*` token utilities render solid borders from the later utilities layer.
- Record the cascade-layer policy for retained `index.css` element/reset rules: any rule that can override migrated Tailwind utilities must move into `@layer base`, be constrained to non-migrated scopes, or be removed before the affected component migration lands.

## Verification

<!-- Commands run and results; screenshot artifact links/paths; exact baseline/development startup parameters or full commands; baseline/development service URLs; baseline/development namespace names; agent comparison scenario coverage; theme/accent matrix covered; observed drift; approved deviations -->
