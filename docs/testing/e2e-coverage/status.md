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

以 `main@a0474c540` 为审计基线，当前 Functional Playwright 清单为
**412 tests / 43 files**。数字只用于说明本轮审计范围，不作为永久冻结的门槛。

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

- Plugin authoring 的 daemon 能力仍在，但产品没有可驱动的 UI 入口；
  `real-daemon-run.test.ts` 中保留一条 `[P1]` `fixme` 记录该缺口。
- Connectors / MCP 没有无条件可达的导航入口，因此
  `visual-navigation.test.ts` 中两条视觉场景仍为显式 `skip`。
- PR #6475 之后 anonymous Local Agent/BYOK 和 signed-out 深链会被强制重定向到
  Cloud onboarding；`amr-onboarding.test.ts` 中 8 条 Functional P0 和
  `visual-entry.test.ts` 中 1 条 Visual P2 目前以 expected failure 记录该产品缺口。
- 同一 Cloud-first 回归还使 anonymous message center 不可达；
  `message-center.test.ts` 中 3 条用 expected failure 保留公共消息、已读状态和
  refresh 行为契约。
- Settings 中 Design Systems 的内容仍然存在，但 #5517 删除了导航入口（#6706）；本地导入、
  rename 和错误恢复 3 条 P1 以 expected failure 记录“能力存在但不可达”。
- Media provider key 可以在 Settings 保存、重开和从 daemon reload，但返回 Projects
  后不会同步到 New Project model picker；OpenAI、MiniMax、Volcengine、FishAudio 的
  6 条跨页面/首轮 run P1 以 expected failure 保留（#6705）。
- Plan mode 会持久化 `index.html`，但首次生成不会自动打开，regeneration 也无法稳定
  refocus（#5352）；real-daemon 中保留 1 条 expected failure 和 1 条 fixme。
- 删除 inline workspace mention 尚未同步 `linkedDirs`、失败 PATCH 与
  `context_remove` analytics；`project-management-flows.test.ts` 中保留 3 条 P1。
- System theme 只在启动时解析，不会跟随运行中的 OS color-scheme 变化；保留 1 条 P1。
- #548 的 chat scrollbar gutter 仍被 resize handle hitbox 覆盖，LTR hover/drag 与 RTL
  共 3 条 P1 为 expected failure；handle 本体 resize 的正向回归用例正常通过。
- #5517 account menu 不再展示 Personal/Team credit balance，双窗口 billing scope 的
  可视化隔离用例目前为 1 条 expected failure；workspace authority/billing API 的 P0
  覆盖仍正常。
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
- 优先修复 Media provider → New Project 的 config 同步和 Plan 首次生成 auto-open
- 恢复 Design Systems / plugin authoring 的可达 UI 入口，再解除对应 expected failure
- 修复 #548 resize hitbox、inline workspace mention 删除同步和 system-theme live update
- 补齐 run analytics v4 的本地 receiver、真实 PostHog 查询与样本对账
- 为 Community 搜索提供真实产品行为后再补搜索 E2E
- 每补完一批，就做一次 grouped validation
- 只有有明确产品语义、且当前架构仍支持的场景才保留在 UI E2E；过时的 DOM/交互模型应删除或迁移到更合适的测试层
