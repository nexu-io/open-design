# `apps/web/src/components/Signature/` (Design Signature Strip, web side)

Module map agents enter when they need to change the visual surface of
the Design Signature feature. The directory keeps the internal **Signature**
name; the user-facing label "Design Signature" comes from the i18n key
`designSignature.userFacingName`, so the product name can be renamed
without code churn.

## Layout

| File | Responsibility |
|---|---|
| `DesignSignatureStrip.tsx` | Container component. Gates on the enabled toggle, calls `useDesignSignatureDiff`, and renders the collapsed/expanded strip above the artifact preview. |
| `StripCollapsed.tsx` | One-line glanceable summary (e.g. "3 changes since last version") plus the expand/collapse toggle button. Uses `.accordion-collapsible` for animation. |
| `StripExpanded.tsx` | Full diff list and "Why" detail accordion. Reads the `DesignDiff` entries produced by the engine and renders plain-language change descriptions. |
| `DesignSignatureStrip.module.css` | Component-owned styles. Disclosure animation is inherited from the shared `.accordion-collapsible` + `.accordion-collapsible-inner` classes (loaded via `apps/web/src/index.css`; defined in `apps/web/src/styles/viewer/composio.css`). This module does not define its own transition. |
| `hooks/useDesignSignatureStripEnabled.ts` | Opt-in toggle state (client-only). Reads `open-design:config` localStorage and stays in sync with cross-tab `storage` events plus the same-tab `open-design:design-signature-toggle` CustomEvent. Pairs with `setDesignSignatureStripEnabled` so a Settings save reflects in every mounted hook without a reload. |
| `hooks/useDesignSignatureDiff.ts` | Computes the `DesignSignature` for the current artifact text and diffs it against the stored previous-version signature. Runs entirely in-browser; no daemon round-trip, no project PATCH. |
| `index.ts` | Public barrel. Exports the strip mount, sub-components, and hooks. Everything else stays internal. |

## Import boundary

The signature **engine** lives in `@open-design/contracts/design-signature`.
Import it from there — never reach into `apps/daemon/src/**`.

```ts
// Correct
import { computeSignature, diffSignatures } from '@open-design/contracts/design-signature';

// Forbidden — violates web/daemon boundary rule in AGENTS.md
import { ... } from '../../../../../../daemon/src/design-signature';
```

This boundary is enforced by the repo-wide rule in `AGENTS.md`:
> `apps/web/**` must not import `apps/daemon/src/**`

## Opt-in, client-only nature

- The strip is **disabled by default**. Users enable it in **Settings → Design Signature**.
- All computation is **in-browser**: `useDesignSignatureDiff` calls the pure engine from
  `@open-design/contracts` directly — there is no daemon HTTP round-trip and no project
  metadata `PATCH`.
- The strip renders **above** the artifact preview in `FileWorkspace.tsx` and is
  conditionally mounted only when enabled.

## Session-local "previous version" caveat

The "previous version" baseline is stored **session-locally** (in-memory or
`sessionStorage`). It is set the first time an artifact is loaded in a session and
updated when the user explicitly saves a new baseline. There is **no persistent
history** across sessions or across browser tabs.

Persistent cross-session history is tracked in **issue #1241**. Until that ships,
do not store baseline signatures in `localStorage`, project metadata, or any
daemon-owned store — that would be a scope expansion beyond the current design.

## Invariants

- **Engine is pure and shared.** `@open-design/contracts/design-signature` is the
  single source of truth for signature computation and diff. Do not fork or inline
  the engine logic in this directory.
- **No daemon round-trip.** `useDesignSignatureDiff` must not call any `/api/*`
  endpoint. If you find yourself reaching for `fetch`, the logic belongs elsewhere.
- **No project PATCH.** The strip never writes to the project or artifact metadata.
  It is read-only relative to the project store.
- **Opt-in only.** The enabled state comes exclusively from the Settings toggle
  (`useDesignSignatureStripEnabled`). Never enable the strip unconditionally.
- **All strings go through the i18n registry.** Every visible string is a `t(...)`
  call against the `designSignature.*` key namespace. Hardcoded English will fail
  review; the locale alignment test enforces every locale carries the same keyset.

## When you change anything here

1. Update `packages/contracts/src/design-signature.ts` first if the engine shape
   changes. The web hooks key off the exported types from that file.
2. Add an i18n key to `apps/web/src/i18n/types.ts` and seed the `en` value. All
   18 locale files must carry the key or typecheck fails.
3. Run `pnpm --filter @open-design/web exec vitest run tests/hooks tests/components`
   before pushing to confirm the hook and component suites are green.
4. For CSS changes in `DesignSignatureStrip.module.css`, verify the accordion
   animation uses the canonical `.accordion-collapsible` + `.accordion-collapsible-inner`
   class pair — do not introduce a bespoke height-animation approach.

## Related

- Engine: `packages/contracts/src/design-signature.ts`
- Token extractor: `packages/contracts/src/design-tokens.ts`
- Daemon CLI surface (CLI parity, `od signature`): `apps/daemon/src/design-signature.ts`
- Settings toggle section: `apps/web/src/components/SettingsDialog.tsx`
- Mount point: `apps/web/src/components/FileWorkspace.tsx`
- Persistent history tracking: issue #1241
