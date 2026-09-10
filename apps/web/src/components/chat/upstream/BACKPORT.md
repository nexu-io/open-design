# Chat module backport

Source: `origin/main` at `6b60b567a` (2026-09-08 fetch).

Only `ProjectView` selects this implementation, through `../ProjectChatPane.tsx`.
Legacy chat entry points and the project controller remain intact. The private
component/runtime copies keep newer chat dependencies from replacing shared
components used by the home screen, workspace, or settings.

Compatibility boundaries:

- `types.ts` reads newer optional message fields and events. `toHostMessage`
  filters the four new control-event variants when invoking the existing host.
- `host-api.ts` tolerates a missing media-task endpoint; historical message
  events still render execution records. Diagnostics uses the existing export
  endpoint without introducing the newer backend forensics route.
- Feedback uses the reason codes supported by the current host. New queue and
  suggestion analytics map to existing event vocabulary.
- The private icon component accepts existing toolbox icons; private button
  primitives retain main's new sizes without changing shared primitives.
- The chat stylesheet contains main's tokens and relevant stylesheet snapshots,
  restricted to `[data-chat-root]` and its descendants. Legacy stylesheet rules
  exclude that subtree; their declarations and behavior elsewhere are preserved.
  Imported animation/property names are isolated. Portals join the same root.
- New translation keys are added without replacing existing translations.

The new UI does not upgrade the backend, global contracts, workspace, home page,
or settings. Features requiring optional callbacks remain governed by the
existing project controller. Existing project files and conversations are kept.

Validation: workspace and web typechecks; 172 focused chat, queue, history,
message-rail, timestamp, and runtime checks; manual client checks for history,
text input, send enablement, and the shared attachment menu. The existing
legacy quick-pill contract failure also reproduces on the PR head before this
integration. The root guard remains blocked by the existing cross-app import
in `tests/styles/font-weight-normalization.test.ts`.
