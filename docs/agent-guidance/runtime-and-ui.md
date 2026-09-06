# Runtime and UI guidance

This document contains required guidance moved from the root [AGENTS.md](../../AGENTS.md) so nested instruction chains fit the default loader budget. Read the matching section before changing runtime or UI behavior. Paths written as code are repository-root-relative.

## Agent runtime conventions

- `RuntimeAgentDef.promptInputFormat` selects how the daemon writes the prompt to a child's stdin. The default `'text'` writes the composed prompt and ends stdin immediately. `'stream-json'` wraps the prompt as one JSONL `user` message and KEEPS stdin open so the daemon can stream further user messages back in mid-turn. Claude (`apps/daemon/src/runtimes/defs/claude.ts`) ships `'stream-json'` together with `--input-format stream-json` as generic mid-turn input infrastructure; the daemon closes stdin once the turn terminates cleanly. Every other agent stays on `'text'`.
- `apps/daemon/src/server.ts` tracks `run.stdinOpen` on the run object. `applyClaudeStreamJsonRunBookkeeping` closes stdin (and records `turnCompletedCleanly`) when a `turn_end` (or `usage`) event arrives with a non `tool_use` `stop_reason`. The `tool_use` stop reason means the model paused mid tool (waiting on claude-code's internal runner); closing stdin there would truncate the follow up response.
- `claude-stream.ts` emits the `turn_end` event AFTER iterating the assistant message's content blocks, not before, so the daemon sees the final `stop_reason` and every tool_use of the turn before deciding whether to close stdin.
- The host asks the user clarifying questions through the `<question-form>` artifact (see "Asking the user questions" below), NOT through a stdin-injected `tool_result`. There is no `AskUserQuestion` tool wiring, no `/api/runs/:id/tool-result` endpoint, and no host-answer return path; the stream-json input skeleton is retained only as generic infrastructure.

## Asking the user questions

- There is exactly one mechanism for clarifying user intent: the `<question-form>` markdown artifact the model emits inline. `AssistantMessage.tsx` renders `QuestionFormView` directly inside the originating assistant message, and answers flow back as the next user message (`formatFormAnswers` in `apps/web/src/artifacts/question-form.ts` → `POST /api/chat`). There is no separate Questions tab or native tool card.
- `<question-form>` is valid on ANY turn, not just turn-1 discovery. Use it for turn-1 discovery briefs AND for mid-conversation clarification (e.g. an ambiguous annotation). The system-prompt guidance lives in `apps/daemon/src/prompts/system.ts` and `discovery.ts`; the API/BYOK-mode wording is mirrored through `packages/contracts/src/prompts/system.ts`.
- `run-artifacts.ts:runAskedUserQuestion` powers the `run_finished.asked_user_question` analytics signal by scanning the run's streamed text for a `<question-form` marker (reassembled across `text_delta` chunks), not by detecting any tool call.

## Chat UI conventions

- `apps/web/src/components/file-viewer-render-mode.ts` decides URL-load vs srcDoc for HTML previews. Bridges (deck, comment/inspect selection, palette, edit, tweaks) can ONLY inject through the srcDoc path. Add a new disqualifier to `UrlLoadDecision` whenever a feature needs a srcDoc-only bridge; pass it from `FileViewer.tsx` based on a source-content heuristic where appropriate (e.g. `hasTweaksTemplate`). The host keeps both iframes mounted simultaneously and swaps CSS visibility so toggling render mode does not cause an iframe reload flash; `iframeRef.current` stays aligned with the active iframe via `useEffect`. Receive filters use `isOurIframe(ev.source)` to accept messages from either iframe but signals that should ONLY come from the active iframe (e.g. `od:tweaks-available`) re-check `ev.source === iframeRef.current?.contentWindow`.
- TodoWrite UI pins one canonical task list above the chat composer via `PinnedTodoSlot` in `ChatPane.tsx`. The slot reads the latest TodoWrite snapshot across the conversation through `latestTodoWriteInputFromMessages` (`apps/web/src/runtime/todos.ts`). `AssistantMessage.stripTodoToolGroups` removes any TodoWrite tool groups from per message rendering so there is exactly one TodoCard on screen. The progress count includes both `completed` and `in_progress` items (1/4 reads "one underway" not "zero finished"). Dismissal via the Done button is keyed on the snapshot's JSON, so a fresh TodoWrite from the agent automatically re shows the card. `PinnedTodoSlot` sits OUTSIDE the `.chat-log` scroll container, so auto-scroll requires explicit coverage: `ChatPane`'s `ResizeObserver` accepts a `containerRef` from `PinnedTodoSlot` and observes that element directly, and a pane-level `MutationObserver` (`childList: true` on the chat pane ancestor) re-syncs that observation whenever the slot mounts or unmounts as new TodoWrite snapshots arrive.
- Clarifying questions render through the `<question-form>` artifact directly inside the chat — see "Asking the user questions" above.
- Tool group rendering uses `dedupeSnapshotToolRetries` to collapse `TodoWrite` snapshots (only the most recent call survives, since each call is a state replace). `SNAPSHOT_TOOL_NAMES` lists the snapshot-style tools; non-snapshot tools pass through untouched.

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

- Default ease-out for UI transitions: `cubic-bezier(0.23, 1, 0.32, 1)`. Built-in `ease` is too weak; `ease-in` is forbidden for UI elements because it feels sluggish.
- Asymmetric durations: enter around 200ms, exit around 140ms. Exit reads as decisive because the user has already chosen to dismiss.
- Accordion expand and collapse uses `grid-template-rows: 0fr -> 1fr` (modern auto height pattern). Pair with opacity fade and the easing above. The shared `.accordion-collapsible` + `.accordion-collapsible-inner` class pair (defined in `apps/web/src/index.css`) is the canonical implementation; reuse it for new disclosure UI.
- Never animate from `transform: scale(0)`. Start from `scale(0.9)` or higher with `opacity: 0`.
- For elements that show conditionally, keep them mounted and toggle a CSS class (e.g. `.chat-jump-btn-active`). React unmounts skip the exit transition entirely.

## Reference maintenance

Keep the root routing entry aligned when a section in this document is renamed or moved.
