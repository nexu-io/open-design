# Web application guide

Read the root and `apps/AGENTS.md` for repository/app boundaries. This guide owns
web implementation conventions; product-agent prompt instructions are not
instructions for the agent maintaining this repository.

## Entry points and ownership

- `app/` contains Next.js routes; `src/App.tsx` is the main client shell.
- `src/providers/` owns app-local HTTP/SSE integration; shared wire types come from `@open-design/contracts`.
- `src/runtime/` owns presentation/domain helpers; component-owned behavior stays with its component.
- Before changing chat rendering, tool displays, execution records, or pinned UI, read [the chat guide](src/components/chat/AGENTS.md) and affected behavior tests.
- HTML preview mode/bridge decisions live in `src/components/file-viewer-render-mode.ts` and `FileViewer.tsx`. Features requiring injected bridges must disqualify URL-load mode; filter iframe messages against owned frames and, where required, the active frame.

## Web CSS ownership

- `apps/web/src/index.css` is an import-only cascade entrypoint. Do not add selectors or declarations there; add imports only when a truly global stylesheet is needed, and keep import order intentional.
- Shared global styles belong in `apps/web/src/styles/`: design tokens, base/reset rules, primitives, app-shell layout, and legacy cross-component selectors that cannot safely be scoped yet. Keep domain-level global files grouped by owner (for example `styles/viewer/` and `styles/workspace/`) instead of adding more large files directly under `styles/`.
- New component-owned UI styles should default to CSS Modules next to the component (`Component.module.css`) instead of expanding global stylesheets. This is preferred for isolated components, panels, menus, drawers, toolbars, cards, and form sections.
- When touching an existing component with nearby global styles, prefer migrating that component's local selectors to a CSS Module as part of the change if it is small and testable. Do not mix a large mechanical move with behavior/styling changes in the same patch.
- Keep global class names only for deliberate shared contracts: reusable primitives, theme hooks, third-party/content styling, cross-component layout, or selectors that rely on global cascade/specificity. Document any new global selector group with its owning feature.
- CSS refactors must preserve cascade semantics. For mechanical splits, verify expanded import content/order matches the previous stylesheet; for CSS Module migrations, validate the affected UI path with `pnpm --filter @open-design/web typecheck` and a focused build/test or visual check when practical.

## Web component reuse

- New `apps/web` UI should reuse shared primitives from `@open-design/components` when one exists instead of styling plain HTML elements directly. For example, use `Button` for app buttons and `VisuallyHidden` for screen-reader-only text/status content.
- Do not add new raw primitive classes such as `primary`, `primary-ghost`, `ghost`, `subtle`, `icon-btn`, or `sr-only` for new UI. Those classes are legacy compatibility surface for existing markup until it is migrated.
- If a needed primitive is missing, prefer adding a small focused primitive to `packages/components` with colocated CSS Modules, then consume it from the app. Keep product-specific layout and workflow styling in the app, not in `packages/components`.
- Keep semantic plain HTML when it is content markup or a specialized control that the shared package does not model yet; do not force a migration that would hide native behavior or make a custom widget harder to reason about.
- `apps/web` transpiles `@open-design/components` from source during dev, so component and CSS Module edits should work through the normal web dev loop without rebuilding the package.

## i18n keys

- `apps/web/src/i18n/types.ts` is the typed `Dict`; every key must be defined in all 19 locale files under `apps/web/src/i18n/locales/*.ts` (`ar`, `de`, `en`, `es-ES`, `fa`, `fr`, `hu`, `id`, `it`, `ja`, `ko`, `pl`, `pt-BR`, `ru`, `th`, `tr`, `uk`, `zh-CN`, `zh-TW`). Add the key to `types.ts` first; missing translations produce a typecheck error.

## UI animation philosophy

- Default transitions use `cubic-bezier(0.23, 1, 0.32, 1)`; prefer ease-out over sluggish ease-in. Enter is around 200ms and exit around 140ms unless the feature design specifies otherwise.
- Accordion disclosure can use `grid-template-rows: 0fr -> 1fr` with opacity. Existing `.accordion-collapsible` styles live in `src/styles/viewer/composio.css`; preserve their consumers and cascade when changing them. `src/index.css` only imports stylesheets.
- Start scale transitions at `0.9` or above with opacity rather than `scale(0)`.
- Components needing an exit animation may delay unmount until that animation completes. Do not keep all conditional components mounted by default: preserve effect cleanup, focus behavior, and hidden-content accessibility.

## Product question forms

Within the OpenDesign product, clarifying questions render as the
`<question-form>` artifact inside the originating assistant message. Answers
become the next user message through `formatFormAnswers` and `/api/chat`.
This describes the product protocol, not the repository contributor's chat UI.
Before changing it, read `apps/daemon/src/prompts/AGENTS.md` and update affected host
rendering, prompt paths, and contracts together. Do not add a separate tool-answer
return path without changing that protocol deliberately.

## Validation

Tests live in `apps/web/tests/`; Playwright belongs in `e2e/ui/` and uses the
shared suite. Run web typecheck plus focused tests or visual checks matching
the change. Follow `src/components/chat/AGENTS.md` for chat-specific validation.

```bash
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web build
```
