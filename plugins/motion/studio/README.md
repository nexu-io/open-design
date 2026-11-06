# OpenDesign Motion editor

This directory contains the complete editable Hyperframes Studio frontend from
0.9.7, commit `3baf81f9a92615507f76fe8de33e489034ee77ec`: `src`, `public`, and
its test fixtures. The upstream Apache-2.0 license is in `LICENSE`; original
package metadata is in `upstream-package.json`.

The native editor owns the dock, panels, timeline, canvas, source editing,
media previews, keyframes, variables, history, WebMCP tools and render queue.
`src/motion/MotionStudioHost.tsx` supplies the brand, project switcher, template
library and MCP connection dialog through small header slots. Our theme is a
separate CSS entry; it does not replace editor components or editing behavior.
The top bar is one row on desktop, with host actions beside native Studio actions.
It also exposes native Undo/Redo, an always available Preview recovery button,
and a Layout menu with panel visibility, presets and reset. Dock recovery places
a closed preview between the side columns instead of adding another full row.
The dockable history panel uses the native history API for checkpoints, pins and
restores. Restoring creates a new undoable entry and retains the later edits.
The history tab is an OpenDesign addition; its operations use Hyperframes' existing
history service, not a separate version store.

`src/i18n/` provides live Simplified Chinese / English switching from the top bar.
The product defaults to Chinese and persists the choice in `motion.studio.locale`.
English source messages are the keys and fallback; Chinese lives in `zh-CN.json`.
Use `useI18n().t(message, values)` for UI copy, and `formatDate` / `formatNumber`
for locale-sensitive display. Add plural forms in `I18n.tsx` when needed.
Translate labels at display boundaries; keep property values, panel IDs, file names,
project names, and authored video content intact. Native dock titles update in place,
so switching languages does not reset layout, selection, playback, or preview frames.
Standalone upstream components retain English unless wrapped in `I18nProvider`.

The parser, player, SDK, CLI server and renderer are pinned upstream packages.
The local server streams `/api/` to the native Hyperframes service. Product
project/template/background-export endpoints live under `/motion-api/`.
The header's Export button uses the native render queue and format settings;
agent background exports remain available through MCP.

Run from the repository root:

```sh
npm ci
npm run dev
npm run typecheck:studio
npm run test:studio
npm test
```

`build/` is generated and included in the plugin ZIP. After frontend edits,
run `npm run build:studio` and refresh. The token source is
`../web/design-system/tokens.json`; `src/motion/theme.css` adapts it to Studio's
native theme preferences. UI styles never enter composition files or renders.

`test:studio` runs all unit/DOM suites. Test-only adaptations cover the moved
package paths, installed SDK exports, Happy DOM 21 iframe behavior, and CSS
properties that require jsdom. Real Chrome `*.browser.test.ts` benches and the
upstream `tests/` harness are retained separately and excluded from this unit
command. `npm test` exercises native APIs, MCP, project switching, shared files
and real video rendering when Chrome and FFmpeg are available.

See `../docs/editor-fork.md` for the integration boundaries.
