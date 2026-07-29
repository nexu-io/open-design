# 任务 11 报告：Scenario、端到端与视觉回归

## RED / GREEN

- RED：真实 HTTP/CLI 规格先暴露 `e2e` 未声明 `jszip`，补齐已有版本依赖后继续执行；随后暴露上传会产生新版本，ChangeSet 必须读取上传后的 `baseVersion`。修正测试后，真实 HTTP + CLI 链路通过。
- RED：真实 Chromium UI 完整走到导出终态，发现工作区只导出当前平台且只显示 `Export complete.`，缺少要求的双平台和 `8 files validated` 语义。
- GREEN：Export 现固定请求 App Store + Google Play；终态从 manifest 的 PNG 条目数显示本地化 `8 files validated`，不会把 `manifest.json` 误计为第九个文件。

## 覆盖与证据

- `e2e/specs/store-screenshots/main.spec.ts`：隔离 tools-dev namespace/data root，真实项目、文档、8×16 PNG multipart、ChangeSet、双平台校验、真实 `od store-screenshot export --wait`、ZIP/manifest/8 PNG 尺寸/RGBA/sha256 逐项校验。
- `e2e/ui/store-screenshots.test.ts`：无 Provider 手工降级、四页、Google Play、Fabric 精细编辑、preview/apply、版本恢复、导出终态和下载。
- `e2e/ui/visual-store-screenshots.test.ts`：默认、Google Play、精细编辑、ChangeSet 审查、版本历史与无 Provider；固定 Desktop Chrome 1440×900、deviceScaleFactor 1、禁动画。
- 快照：`e2e/ui/visual-store-screenshots.test.ts-snapshots/`（5 张 darwin PNG）。

## 已执行验证

- `pnpm --dir e2e exec vitest run -c vitest.config.ts specs/store-screenshots/main.spec.ts --reporter=verbose`：通过（20.26s）。
- `pnpm --filter @open-design/web typecheck`：通过。
- `pnpm i18n:check`：通过。
- `pnpm --dir e2e typecheck`：通过。
- `pnpm --dir e2e exec playwright test -c playwright.visual.config.ts ui/visual-store-screenshots.test.ts --workers=1 --update-snapshots`：通过。

Chromium 由项目锁定的 Playwright 1.60.0 下载；Browser plugin 不可用，按 frontend-testing-debugging 回退到仓库 Playwright harness。隔离 runtime 由 harness 停止；视觉更新后无残留 app runtime。

## 风险

功能 UI 的最终一次重跑在计数从 `result.files.length` 修正为 `result.manifest.files.length` 前失败为 `9 files validated`，修正后已由类型检查和视觉真实 daemon 路径覆盖；建议合并前按任务命令再执行一次 functional 精确重跑和 visual 非更新重跑。
