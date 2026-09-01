# E2E 状态

这份文档记录 `e2e/` 当前的自动化测试分层、自动执行入口，以及我们有意保留的已知缺口。

安装与更新器全生命周期的「节点 → 归属测试」覆盖图谱单独维护在
[`../updater-lifecycle.md`](../updater-lifecycle.md)；改动 updater 相关代码时以那份图谱定位归属测试。

## 当前套件形态

现在这套 E2E 已经比较明确地分成三层：

- `test:ui:critical`
  - 保持轻量
  - 只放入口可用性和最短、最高信心的主路径
  - 目标是快、稳、失败后容易定位
- `test:ui:extended`
  - 放更重的 UI 回归
  - 覆盖持久化、恢复、多项目隔离、Design Files、连接器配置、键盘流等
  - 最近这轮补强主要都落在这里
- `vitest` 系统级 smoke
  - 用于验证 daemon / API / artifact 链路
  - 在 UI 不是重点时，尽量不用浏览器

当前策略是明确的：继续增强 `extended` 的信号，但不把 `critical` 变成一个越来越慢的大杂烩。

合并门禁按 P0 domain 拆分运行；完整 Functional UI 套件由
`release-prerelease.yml` 在 prerelease 元数据解析出精确构建 commit 后调用，
并作为各平台打包与发布前的阻断门禁。也可以通过
`.github/workflows/ui-extended-main.yml` 的 `workflow_dispatch` 手动选择
`p0`、`p0p1` 或 `full`。

以 `origin/main@044324b9a` 合入当前分支后的状态为审计基线，Functional Playwright
清单为 **411 tests / 44 files**：P0 166、P1 220、P2 25。数字只用于说明本轮审计
范围，不作为永久冻结的门槛。

## 当前优先级执行方式

现在优先级不再只靠文件分组，已经落到 case 级测试名：

- `[P0]`
- `[P1]`
- `[P2]`

对应脚本：

- `pnpm -C e2e test:p0`
- `pnpm -C e2e test:p0p1`
- `pnpm -C e2e test:p1`
- `pnpm -C e2e test:p2`
- `pnpm -C e2e test:ui:p0`
- `pnpm -C e2e test:ui:p0p1`
- `pnpm -C e2e test:ui:p1`
- `pnpm -C e2e test:ui:p2`

这层过滤直接依赖测试标题前缀，适合后续逐步调整优先级，而不用同步维护一份越来越重的文件清单。

## 最近补强了什么

### 1. 资源驱动场景的 contract 断言

Playwright 资源场景现在支持显式 contract：

- `expectedProjectMetadata`
- `expectedRunRequest`
- `expectedFiles`
- `expectedPreviewText`

相关文件：

- [e2e/lib/playwright/resources.ts](../../../e2e/lib/playwright/resources.ts)
- [e2e/resources/playwright.ts](../../../e2e/resources/playwright.ts)
- [e2e/ui/app.test.ts](../../../e2e/ui/app.test.ts)

这意味着 `app.test.ts` 里的不少 flow 已经不再停留在“元素可见”，而是会一起验证持久化状态。

### 2. 真实 daemon 与系统一致性

更深的 real-run 校验落在：

- [e2e/ui/real-daemon-run.test.ts](../../../e2e/ui/real-daemon-run.test.ts)

现在这里覆盖了：

- real daemon follow-up turn
- empty-output failure convergence
- separate-project isolation
- fake runtime coverage
- run 状态、message、artifact manifest、project files、raw file content 一致性

### 3. Design Files 持久化

[e2e/ui/app-design-files.test.ts](../../../e2e/ui/app-design-files.test.ts) 现在有了 API-backed 校验，覆盖：

- upload persistence
- delete persistence
- active tab restoration
- uploaded image preview validity
- source preview persistence

### 4. Restoration 与会话恢复

[e2e/ui/app-restoration.test.ts](../../../e2e/ui/app-restoration.test.ts) 现在对下面这些点补了更强的 persisted-state 断言：

- reload 后 latest conversation 选择
- 删除 active conversation
- file / artifact deep-link restoration
- surface 切换后的 conversation retention

新增断言不只看 UI，还会确认：

- 当前 `conversationId`
- conversation 剩余集合
- 与 surface 相关的 persisted files

### 5. Project management 持久化

[e2e/ui/project-management-flows.test.ts](../../../e2e/ui/project-management-flows.test.ts) 现在对这些行为补了轻量 API 校验：

- rename persistence
- search recovery
- grid / kanban view persistence
- kanban open flow integrity

### 6. Entry configuration 与 keyboard workflows

- [e2e/ui/entry-configuration-flows.test.ts](../../../e2e/ui/entry-configuration-flows.test.ts)
  - 确认 Composio key 流程不会把明文 key 留在 saved config
  - 确认 replacement draft key 不会触发过早的全局持久化
- [e2e/ui/workspace-keyboard-flows.test.ts](../../../e2e/ui/workspace-keyboard-flows.test.ts)
  - 确认 quick-switcher 场景保留预期的 per-project file sets
  - 确认 mixed artifact / file workspace 在 reload 后仍然完整

### 7. Prerelease 精确提交与包体信号

`release-prerelease.yml` 现在会在 `metadata.outputs.commit` 上重新运行完整
E2E Vitest，各平台打包和最终 publish 都依赖该门禁。这避免了广义
daemon/API 回归只在 PR 的某个早期 SHA 跑过，但未在实际 prerelease commit 上复验。

打包后 smoke 已覆盖 macOS arm64、macOS Intel、Windows x64 和可选的
Linux x64 AppImage。Smoke 保持 advisory，不会因单一包体回归失败阻断产物发布；
macOS arm64 和 Windows x64 的失败会在飞书下载卡中显示，macOS Intel 和
Linux x64 的结果仅保留在 GitHub Actions job summary 和上传报告中。

### 8. 长耗时 media run 生命周期

AMR run 的 tool token TTL 现在至少覆盖完整 inactivity timeout，并保留
15 分钟收尾窗口；30 分钟 media run 因此会获得 45 分钟 token，且 agent 活动会
同步刷新 token。终态 media task 每 60 分钟执行一次清理检查；只要所属 run token
仍有效就继续保留，run 结束后再由下一次检查清理。daemon 单测锁定这个滑动生命周期，
AMR 系统 E2E 还会校验真实 run start 事件暴露的 token deadline。

### 9. Prerelease UI 缺口收敛

本轮确认下列过期 expected failure / `fixme` 已恢复为正向回归：

- Plan 首次生成与 regeneration 自动打开或 refocus HTML
- plugin authoring 从 Plugins Add 面板进入，并生成 scaffold、assistant 文件列表和操作卡
- Connectors / MCP visual capture 从 Home composer 的当前入口进入，不再 skip
- 已删除与 light-only 产品契约相反的 system-theme 动态切换旧用例；强制 light 的迁移
  契约由 `force-light-theme.test.ts` 覆盖

插件用例同时锁定两项完成态契约：终态文件列表必须绕过旧的共享读取缓存，且
`producedFiles` 必须合并“本轮新增文件”和 daemon 报告的“既有文件修改”。这样 `.md`、
`.json` 等非预览 artifact 也不会从 assistant turn 中丢失。

## 现在信号明显变强的能力面

最近这轮补强后，下列区域的自动化信号都更硬了：

- media routing
- plugin import / apply flow
- question form persistence
- file mention flow
- generated artifact stability
- design files upload / delete / persistence
- conversation persistence and recovery
- project rename / delete / search / view toggle
- connector configuration persistence
- quick-switcher 跨 reload / 跨项目边界行为

## 当前缺口

此前记录为产品缺口的 active-run reload 场景已经恢复为可执行的 P1 用例：

- [e2e/ui/real-daemon-run.test.ts](../../../e2e/ui/real-daemon-run.test.ts)
  - `artifact persistence survives page reload during an active real daemon run`
  - 断言原始 `runId`、assistant `runStatus`、`producedFiles`、项目文件和预览均在 reload 后收敛

当前仍有下列明确缺口：

- Media provider key 可以在 Settings 保存、重开和从 daemon reload，但返回 Projects
  后不会同步到 New Project model picker；OpenAI、MiniMax、Volcengine、FishAudio 的
  6 条跨页面/首轮 run P1 以 expected failure 保留。
- 删除 inline workspace Context chip 尚未同步 `linkedDirs`、失败 PATCH 与
  `context_remove` analytics；`project-management-flows.test.ts` 中保留 3 条 P1。
- chat scrollbar gutter 仍被 resize handle hitbox 覆盖，LTR hover/drag 与 RTL
  共 3 条 P1 为 expected failure。
- updater ready popup 在紧凑窗口中仍会落到 Home composer / agent picker 的 stacking
  context 下方，保留 1 条 P1 expected failure。
- account menu 当前不展示 Personal / Team credit balance，双窗口 billing scope 的
  可视化隔离保留 1 条 P1 expected failure；workspace authority / billing API 的 P0
  覆盖仍正常。
- 上述 14 条 UI 修复曾在本分支验证通过，但远端提交 `762dc6aa5` 明确将它们作为
  “unrelated UI changes” 移出当前 release-gate PR；本轮复验确认这些 expected failure
  仍会触发，而不是过期标记。后续应在单独 UI fix PR 中恢复实现并移除标记。

- Signed-out 产品契约已统一为 Cloud 登录门禁：Home、Community、Projects、
  Design Systems、Plugins、Integrations 和 Settings 深链都会收敛到
  `/onboarding`，登录前不展示 Local Agent/BYOK。`amr-onboarding.test.ts` 已将旧的
  8 条 expected failure 迁移为正向 P0 认证边界用例，`visual-entry.test.ts` 也直接验证
  当前登录页。
- Anonymous message center 不再是可达产品面；旧 anonymous case 已删除。
  `message-center.test.ts` 保留 signed-in account API 的已读同步、Escape 关闭和
  zh-CN 日期格式覆盖。
- Settings 在 definitive signed-out 状态下已不可达；两条旧的 Settings
  `AmrLoginPill` 登录测试依赖不存在的入口，已删除。当前 Cloud 登录主路径由
  `amr-onboarding.test.ts` 覆盖。
- #5517 删除的 Home Starters Gallery 不再作为当前产品能力统计；相关动态
  skip 用例已删除，现行 Community 页面由
  `community-template-modal-mapping.test.ts` 覆盖浏览、分类过滤、详情和 Use handoff。
- Community 搜索框当前为只读展示，尚不存在可自动化的搜索行为。
- Run analytics v4 已有失败卡到 Retry 成功的 UI 恢复闭环，但尚缺真实
  `/api/runs` line-protocol、真实 PostHog dot-path 查询和新旧字段样本对账；详见
  [`../../../specs/current/run-analytics-v4-test-plan.md`](../../../specs/current/run-analytics-v4-test-plan.md)。
- Media 长任务已覆盖 token/task 生命周期边界，但仍缺一条从 UI 发起 run、
  agent 调用 media tool、daemon 调用 fake Vela、轮询终态并校验产物文件的完整
  跨层自动化闭环。
- Functional UI 只覆盖 Chromium desktop；安装器交互和历史版本升级的人工边界见
  [`../updater-lifecycle.md`](../updater-lifecycle.md)。

默认 Playwright worker 会把 `AMR_HOME` 指向 worker-local 空目录，避免开发者真实
`~/.amr/config.json` 将普通 signed-out 用例意外切换为 Workspace scope。真正测试
Workspace authority 的场景必须显式提供 fake runtime 和 workspace headers。

## 验证命令

从仓库根目录运行：

```bash
pnpm --filter @open-design/e2e typecheck
```

```bash
pnpm --filter @open-design/e2e exec playwright test -c playwright.config.ts ui/app.test.ts --project=chromium
```

```bash
pnpm --filter @open-design/e2e exec playwright test -c playwright.config.ts ui/real-daemon-run.test.ts --project=chromium
```

```bash
pnpm --filter @open-design/e2e exec playwright test -c playwright.config.ts ui/app-design-files.test.ts ui/app-restoration.test.ts ui/project-management-flows.test.ts ui/entry-configuration-flows.test.ts ui/workspace-keyboard-flows.test.ts --project=chromium
```

这些 grouped commands 是当前验证入口；不要把某次运行的固定通过数量当作长期基线，因为测试集合会继续演进。

## 建议的下一步

暂时不要扩 `critical`。

后面最有价值的继续方式是：

- 在 `extended` 里继续给 UI-only 断言补低成本 persisted-state 校验
- 用单独 UI fix PR 收敛 Provider 6、Context 3、resize 3、Updater 1、billing 1，避免
  再次与 release-gate PR 的作用域清理互相覆盖
- 补一条 fake Vela 驱动的 UI → run → media tool → task 终态 → artifact 跨层闭环
- 补齐 run analytics v4 的本地 receiver、真实 PostHog 查询与样本对账
- 为 Community 搜索提供真实产品行为后再补搜索 E2E
- 每补完一批，就做一次 grouped validation
- 只有有明确产品语义、且当前架构仍支持的场景才保留在 UI E2E；过时的 DOM/交互模型应删除或迁移到更合适的测试层
