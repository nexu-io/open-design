# HTML 生成与预览覆盖矩阵（含 Express 路由回归缺口）

## 结论

当前仓库并不是“完全没有”覆盖项目内生成 HTML 文件和 HTML 预览，而是：

- 已经有 **daemon 单测**、**web 组件测试**、**Playwright E2E** 三层覆盖；
- 但历史上没有把“**真实 daemon + raw HTML 路由 + iframe 成功渲染**”这条链路固定成足够强的硬门禁；
- 因此像 Express 4 -> 5 这种会影响通配路由、`req.params`、静态/raw 文件服务的底层升级，可能会绕过大量邻近测试，最终表现为“HTML 黑屏”。

## 相关 bad case

- [PR #2311](https://github.com/nexu-io/open-design/pull/2311)
  `chore(deps): upgrade express 4 -> 5 in daemon`
- 用户反馈的问题形态：项目内生成的 HTML 文件无法正常渲染，预览黑屏。

这类问题的危险点在于：

1. 文件可能已经成功生成；
2. 前端 iframe 也可能已经挂载；
3. 但 iframe 请求的 `/api/projects/:id/raw/*.html` 路由在 Express 升级后失配、取不到内容、或返回错误响应；
4. 最终用户看到的是“黑屏”，而不是明显的接口 404 提示。

## 现有覆盖

### 1. 项目内生成 HTML 文件

#### E2E / 集成

- [/Users/mac/open-design/open-design-home-entry/e2e/ui/real-daemon-run.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/ui/real-daemon-run.test.ts)
  - 真实 run 生成 `.html` 文件
  - 文件落盘
  - 预览 iframe 可见
  - iframe 内 heading/text 可见
  - follow-up turn 再生成 HTML
  - 失败态不留脏文件

- [/Users/mac/open-design/open-design-home-entry/e2e/tests/dialog/artifact-consistency.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/tests/dialog/artifact-consistency.test.ts)
  - run 状态、assistant message、持久化文件、`artifactManifest.renderer='html'`、原始 HTML 内容一致性

#### daemon 单测

- [/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/run-artifacts.test.ts](/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/run-artifacts.test.ts)
  - HTML artifact 识别、计数、成功/失败归因

- [/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/artifact-create.test.ts](/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/artifact-create.test.ts)
- [/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/artifacts-cli.test.ts](/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/artifacts-cli.test.ts)
- [/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/mcp-create-artifact.test.ts](/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/mcp-create-artifact.test.ts)
  - daemon / CLI / MCP 创建 artifact 路径

### 2. HTML 文件预览

#### web 组件测试

- [/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/file-viewer-render-mode.test.ts](/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/file-viewer-render-mode.test.ts)
  - HTML 预览走 `url-load` 还是 `srcdoc`
  - deck / comment / edit / inspect / draw / tweaks / forceInline 等模式分流

- [/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/PreviewModal.test.tsx](/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/PreviewModal.test.tsx)
  - preview modal sandbox
  - deck srcdoc 处理

- [/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/preview-modal-unavailable-state.test.tsx](/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/preview-modal-unavailable-state.test.tsx)
  - 无 HTML 预览的占位状态

- [/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/preview-modal-error-state.test.tsx](/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/preview-modal-error-state.test.tsx)
  - 预览加载错误态

- [/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/FileViewer.test.tsx](/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/FileViewer.test.tsx)
  - URL-load iframe
  - srcdoc transport reactivation
  - 切 tab/切 source/切 view 后的 iframe 行为
  - deck / bridge / download / render-mode 相关细节

#### E2E / 页面恢复

- [/Users/mac/open-design/open-design-home-entry/e2e/ui/app-restoration.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/ui/app-restoration.test.ts)
  - artifact tab 恢复
  - deep link 到 `.html`
  - 返回项目根后预览继续保持
  - later run 覆盖最新 artifact 预览
  - failed send 后 retry 恢复预览

- [/Users/mac/open-design/open-design-home-entry/e2e/ui/app-design-files.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/ui/app-design-files.test.ts)
  - HTML / image / source 文件预览路径
  - `image-preview.html` 渲染图片资源

- [/Users/mac/open-design/open-design-home-entry/e2e/ui/app-manual-edit.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/ui/app-manual-edit.test.ts)
  - HTML 预览 iframe 下的手动编辑与预览联动

### 3. raw HTML 路由与 iframe 特殊头

- [/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/origin-validation.test.ts](/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/origin-validation.test.ts)
  - `Origin: null` 的 raw-file 预览路由访问

- [/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/server-cors.test.ts](/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/server-cors.test.ts)
  - `srcdoc iframe` 相关 CORS 头

- [/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/plugins-preview-route.test.ts](/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/plugins-preview-route.test.ts)
  - HTML preview route 包裹/重写逻辑

## 为什么历史上没拦住 Express 4 -> 5 的黑屏

### 1. 当时主要验证的是 daemon 包级测试和视觉回归

在 [PR #2311](https://github.com/nexu-io/open-design/pull/2311) 里，验证重心是：

- `pnpm --filter @open-design/daemon test`
- `pnpm guard`
- `pnpm typecheck`

这些能抓到很多类型和路由注册问题，但不等于覆盖“**真实生成后的 HTML 在浏览器 iframe 里是否成功渲染**”。

### 2. 很多测试只覆盖了前端预览行为，不一定穿过 Express 通配路由坏路径

例如：

- `FileViewer` / `PreviewModal` / render-mode 测试

主要验证：

- 该走 `url-load` 还是 `srcdoc`
- iframe sandbox / bridge / mode 切换

但它们未必真的依赖 Express 5 下的：

- `/api/projects/:id/raw/*splat`
- `req.params.splat`
- 实际 HTML 内容读取和返回

### 3. 真实坏点在后端路由层，而 UI 可能还“看起来正常”

Express 5 的典型风险点：

- `/*` 需要改成 `/*splat`
- `req.params[0]` 要改成 `req.params.splat`
- wildcard 参数变成 `string | string[]`

如果这里改漏：

- HTML 文件仍可能成功写入项目目录；
- iframe 仍然被前端渲染出来；
- 但 iframe 请求的 raw HTML 路由失效，结果就是黑屏。

这类问题如果测试只断言：

- 有 iframe
- 有 artifact tab
- 有文件记录

就拦不住。

## 当前最能拦住这类事故的测试

如果把“Express 升级导致 HTML 黑屏”当成一个必须阻止的回归，现在最关键的是这几条：

### P0

- [/Users/mac/open-design/open-design-home-entry/e2e/ui/real-daemon-run.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/ui/real-daemon-run.test.ts)
  - 真 run 生成 HTML
  - iframe 内看到 heading/text

- [/Users/mac/open-design/open-design-home-entry/e2e/tests/dialog/artifact-consistency.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/tests/dialog/artifact-consistency.test.ts)
  - 文件、manifest、assistant message、raw HTML 一致

- [/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/origin-validation.test.ts](/Users/mac/open-design/open-design-home-entry/apps/daemon/tests/origin-validation.test.ts)
  - raw HTML 路由在 iframe 场景下仍然可用

### P1

- [/Users/mac/open-design/open-design-home-entry/e2e/ui/app-restoration.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/ui/app-restoration.test.ts)
  - HTML 预览恢复、deep link、artifact tab 回放

- [/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/FileViewer.test.tsx](/Users/mac/open-design/open-design-home-entry/apps/web/tests/components/FileViewer.test.tsx)
  - URL-load / srcdoc 路径的前端渲染决策

## 仍建议补的缺口

### 1. 更聚焦的 daemon raw-route 回归测试

建议新增一条更直白的 daemon 路由契约测试，专门锁：

- `/api/projects/:id/raw/foo/bar/index.html`
- 返回 200
- `content-type` 为 HTML
- body 内包含预期 HTML 内容
- `Origin: null` 下仍允许 iframe 访问

这样可以直接拦住：

- wildcard 没命中
- `req.params.splat` 拼接错误
- 读取 path 错误

### 2. E2E 明确断言“不是只有 iframe 可见，而是 iframe 内真的有内容”

所有关键 HTML 预览 E2E 都建议守住：

- `page.getByTestId('artifact-preview-frame')` 可见
- `page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole(...)` 可见

而不是只看 iframe 容器存在。

### 3. 把 HTML 预览 smoke 放进更硬的 CI 档位

如果这类场景被视为高风险回归，建议：

- `real-daemon-run` 至少保留 1 条 HTML 生成 + 预览 smoke 作为阻塞 PR
- 不要只放在夜间或非阻塞套件里

## 建议的最小门禁集合

如果目标只是“以后别再让 Express / server 升级把 HTML 预览搞黑屏”，最小集合建议是：

1. `e2e/ui/real-daemon-run.test.ts`
   - 真实生成 HTML 后 iframe 内看到 heading
2. `e2e/tests/dialog/artifact-consistency.test.ts`
   - artifact 文件、manifest、消息、raw HTML 一致
3. 新增 daemon raw-route 契约测试
   - 明确锁 `/api/projects/:id/raw/*splat`

这 3 条合起来，比单纯靠视觉回归或组件测试更能直接拦住这类事故。

