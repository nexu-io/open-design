# Design Browser Task Handoff

Generated from this chat session on 2026-05-30.

## Repository

- Worktree: `/Users/pftom/.superset/worktrees/d3aab1a3-c696-403f-9692-7e5bc2dfa1f3/accidental-bolt`
- Product area: Open Design `Design Files` workspace, embedded browser module, desktop host bridge, browser-harness task entry.

## User Queries, In Order

1. Initial feature request:

   > `[Image #1]` 在 design files 那一排支持一个 plus icon, 增加一个类似 `[Image #2]` 的 browser 模块,然后可以打开浏览器, 支持 `[Image #3]` 如图的能力, 包括上一页/下一页/刷新/输入地址栏/支持展示/搜索和选择历史地址打开各种能在浏览器打开的文件如本地文件/各种服务文件/网站 `[Image #4]` 如图也支持一些 clear/open in browser /等截图的能力
   >
   > 参考 https://github.com/superset-sh/superset 代码, 里面已经实现了完整的能力了,直接搬过来,确保在 open-design 里面完美适配和使用, 就像内嵌了一个真实的浏览器, 然后那个地址栏 + 浏览器空白页可以给大量的推荐网址, 方便做设计的参考,做的好看/酷/世界级设计
   >
   > 比如 svg 的 https://thesvg.org/
   > https://unsplash.com/ 图片的
   > https://motionsites.ai/ 各种高级网站参考 https://motion.page/showcase/
   > https://styles.refero.design/ 借鉴设计风格

2. Add blank-page recommendation:

   > 浏览器空白页网址继续添加:
   >
   > - https://brandfetch.com/

3. Agent/browser-harness integration direction:

   > 然后理论上应该结合 agent 的能力 和 https://github.com/browser-use/browser-harness , 以及结合对 browser 的控制和能力, 增加一些快捷的入口或者操作, 能够让用户轻松通过 browser use（browser harness）能够把这些网站的内容搞下来然后应用在用户自己的设计 artifacts 里面, 这样能够极大的增长用户的设计水准

4. User supplied repo instructions:

   > `# AGENTS.md instructions for /Users/pftom/.superset/worktrees/d3aab1a3-c696-403f-9692-7e5bc2dfa1f3/accidental-bolt`
   >
   > The full root `AGENTS.md` content was pasted into the chat. Important for next agent: follow the real repo `AGENTS.md`, plus `apps/AGENTS.md` and `packages/AGENTS.md` before touching those directories.

5. Add motion site:

   > 网址增加 https://gsap.com/ 做动效的

6. Add transition and font references:

   > 网址添加 https://transitions.dev/ 过渡动画/ 以及字体:https://fonts.google.com/

7. Add text animation reference:

   > 文字动画:https://animography.net/

8. Add resource collection:

   > 各种集合站和资源:https://toolfolio.io/

9. Add hand-drawn image reference:

   > 手绘图像: https://www.whirrls.com/

10. Add startup inspiration reference:

    > 各种顶尖的创业公司: https://startups.gallery/

11. Add dot-map visualization reference:

    > 世界点状图:https://www.worldindots.com/

12. Add design resource URL:

    > 添加 网址: getdesign.md

13. Verification request:

    > check 一下整体能力真的实现和跑通了吗

14. Handoff request:

    > 吧我这个 task/会话所有的历史的 query 都帮我提取出来放到一个文件里, 我要 handoff 任务给下一个 agent

## Derived Acceptance Requirements

- Add a `+` icon in the Design Files tab row.
- `+` opens a module menu with a Browser module.
- Browser module opens as a workspace tab.
- Browser supports back, forward, refresh, hard reload, address/search input, history suggestions, and reference-site suggestions.
- Browser can open websites and local/service URLs where supported by the embedded runtime.
- Browser menu supports:
  - Take Screenshot
  - Hard Reload
  - Copy URL
  - Open in Browser
  - Clear Browsing History
  - Clear Cookies
  - Clear All Data
- Blank page includes curated design-reference recommendations:
  - https://thesvg.org/
  - https://unsplash.com/
  - https://motionsites.ai/
  - https://motion.page/showcase/
  - https://styles.refero.design/
  - https://brandfetch.com/
  - https://gsap.com/
  - https://transitions.dev/
  - https://fonts.google.com/
  - https://animography.net/
  - https://toolfolio.io/
  - https://www.whirrls.com/
  - https://startups.gallery/
  - https://www.worldindots.com/
  - https://getdesign.md/
- Add browser-use/browser-harness oriented shortcut/task entry so a user can extract page screenshots/design language/assets and apply them to Open Design artifacts.

## Current Implementation Status

Files changed so far:

- `apps/web/src/components/DesignBrowserPanel.tsx`
- `apps/web/src/components/FileWorkspace.tsx`
- `apps/web/src/components/Icon.tsx`
- `apps/web/src/styles/workspace/design-files.css`
- `apps/web/src/styles/workspace/drawer.css`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/preload.cts`
- `apps/desktop/src/main/runtime.ts`
- `apps/desktop/tests/main/preload-host-boundary.test.ts`
- `apps/packaged/tests/desktop-url-allowlist.test.ts`
- `packages/host/src/index.ts`
- `packages/host/src/testing.ts`
- `packages/host/tests/index.test.ts`

Implemented behavior:

- Design Files tab strip now has a `+` button.
- `+` menu can open a local `Browser` tab.
- Browser panel has address input, suggestions, history persistence, back/forward/reload controls, menu actions, reference cards, screenshot saving, page brief saving, and browser-harness task saving.
- Desktop runtime enables Electron `webviewTag` only for the main window and validates embedded browser startup URLs.
- Desktop host bridge exposes browser data clearing for the dedicated browser partition.
- Host package has helper `clearHostBrowserData`.

## Verification Status

Passed:

- `pnpm --filter @open-design/web typecheck`
- `pnpm --filter @open-design/desktop typecheck`
- `pnpm --filter @open-design/host typecheck`
- `pnpm --filter @open-design/host test`
- `pnpm --filter @open-design/packaged test -- desktop-url-allowlist`
- Direct targeted web tests from `apps/web`:
  - `pnpm exec vitest run -c vitest.config.ts tests/components/FileWorkspace.test.tsx tests/components/FileWorkspace.design-system.test.tsx`
  - Result: 2 files passed, 38 tests passed.
- Root `pnpm typecheck` completed successfully. It emitted existing landing-page warnings/hints but no errors.

Not fully verified:

- `pnpm guard` did not run in this sandbox because `tsx` failed to create its IPC pipe with `EPERM`.
- `pnpm tools-dev run web --daemon-port 17456 --web-port 17573` did not start in this sandbox for the same `tsx` IPC pipe `EPERM`.
- No final visual/browser verification was completed because local runtime startup was blocked by the sandbox.

Observed unrelated test friction:

- Running `pnpm --filter @open-design/web test -- FileWorkspace` or passing paths through the package script unexpectedly exercised the full web test set. It hit unrelated failures/timeouts in `SettingsDialog.execution.test.tsx` or `ExamplesTab.test.tsx`.
- Direct `pnpm exec vitest ...` from `apps/web` correctly scoped to FileWorkspace and passed.

## Next Agent Suggested Checks

- Run `pnpm guard` outside this sandbox or in an environment where `tsx` can create its local IPC pipe.
- Start `pnpm tools-dev run web --daemon-port <free> --web-port <free>` and visually check:
  - Design Files row shows the `+` icon.
  - `+` opens Browser.
  - Blank browser page shows all requested URLs.
  - Address input navigates to at least one external site and one local/service URL.
  - History suggestions appear after navigation.
  - Browser menu actions render and enabled/disabled states make sense.
  - In desktop runtime, webview loads and screenshot/page brief/task save into Design Files.

## Completion Pass — Workflow + Runtime Verification (2026-05-30, follow-up agent)

### Static audit (multi-agent workflow)

Ran a 5-phase audit/verify/implement workflow over all acceptance requirements. Result: **42/45 requirements met, 0 defects** in static analysis; remaining 3 are partial/judgment (i18n debt, CLI dual-track N/A for an interactive render surface, CSS global-vs-module precedent). The workflow added `apps/web/tests/components/DesignBrowserPanel.test.tsx` (34 cases over the pure helpers — `normalizeBrowserAddress` every branch, history round-trip, harness/brief markdown, etc.) and made those helpers named exports.

### Real runtime verification (computer-use against the live Electron desktop app)

Drove the running desktop runtime via `pnpm tools-dev inspect desktop eval/screenshot`. Confirmed in the real app: `+` → add-menu → **Browser** tab → `DesignBrowserPanel` renders; all **15** reference URLs across MOTION/ASSETS/SYSTEMS; `webviewTag` enabled (`WebViewElement`); host bridge `__od__` exposes `browser.clearData`; navigation commits; the embedded `<webview>` loads and **paints** a real page (`example.com` → `<h1>Example Domain</h1>`, 487×117 layout); and `webview.capturePage()` returns a real 51 KB PNG (the "Take Screenshot" action works).

### Three runtime-only bugs found and fixed (invisible to static/JSDOM checks)

All in `apps/web/src/components/DesignBrowserPanel.tsx`:

1. **`allowpopups` React warning** — bare boolean JSX attr tripped "Received `true` for a non-boolean attribute" when the webview branch mounts. Fixed by setting `allowpopups` imperatively in the ref callback.
2. **`dom-ready` crash** — `updateNavigationState` (and the reload button) called `canGoBack()`/`canGoForward()`/`isLoading()`/`reload()` before the webview attached, throwing "The WebView must be attached…". Guarded with try/catch (matching the existing `safeGetWebviewUrl/Title` pattern).
3. **`ERR_ABORTED (-3)` blank page (critical / made the feature unusable)** — `src={currentUrl}` + a `did-navigate` handler that wrote the committed (trailing-slash) URL back into `currentUrl` caused Electron to re-navigate mid-load and abort it, leaving a blank pane. Fixed by splitting state into `loadUrl` (drives `src`, changes only on user navigation) and `currentUrl` (address bar / history, synced from webview events). Covered by a red→green regression test: `apps/web/tests/components/DesignBrowserPanel.webview.test.tsx`.

### Final verification (all green after fixes)

`pnpm guard` 33 · web `typecheck` clean · desktop `typecheck` clean · web tests **74** (34 pure + 2 webview regression + FileWorkspace + design-system) · desktop **73** · host **14** · packaged **111**. Runtime re-drive on the fixed code: page paints, no error overlays.
