# Manual Edit Mode Implementation Plan

Source requirement: `specs/current/manual-edit-mode-requirements.md`.

Base branch: `origin/main` at `72edd4fc6090a3fda4ed175bd35dca76099a82f2`.

Implementation branch: `codex/manual-edit-mode`.

## Goal

Migrate the accepted manual edit-mode prototype into the production Open Design web app.

The product boundary is fixed:

- `Edit` is manual HTML/CSS editing.
- `Comment` remains the AI-assisted scoped edit path.
- `Tweaks` is for global/token parameters.
- `Draw` is annotation input and does not mutate HTML/CSS in v1.

## Implementation Steps

1. Add `apps/web/src/edit-mode/` with typed targets, patches, history, iframe bridge, and source patch helpers.
2. Integrate manual edit state into the HTML branch of `FileViewer`.
3. Enable the existing `Edit` toolbar button only for HTML/deck-HTML artifacts.
4. Keep comment mode and edit mode mutually independent; do not send manual edits to chat or daemon agent runs.
5. Save manual patches through the existing project file write provider, then refresh preview source.
6. Add the accepted layout: layers rail, canvas-first preview, right edit modal, and changes panel.
7. Add English i18n keys plus conservative fallback locale entries.
8. Add focused tests for patch helpers and the main browser smoke path.

## Acceptance Criteria

- Manual edit mode starts from latest `origin/main`.
- User can select a preview element or a layer row.
- Content, style, attributes, selected HTML, and full source edits are source-backed.
- Undo and redo work during the session.
- Attribute edits do not delete unrelated attributes or prior style edits.
- Comment mode still works as the AI edit path.
- Share/export and deck navigation still work after the edit-mode changes.

## Verification Commands

```bash
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/e2e test:ui -- --grep "manual edit"
pnpm typecheck
pnpm test
pnpm check:residual-js
```
