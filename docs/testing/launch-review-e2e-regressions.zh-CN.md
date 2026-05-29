# Launch Review 后新增 E2E 回归覆盖（main）

## 概述

这份文档汇总 `main` 分支基于 `launch-review-since-0.8.0.md` 补上的页面级 E2E 回归。

目标不是把所有 launch review 条目都硬塞进 Playwright，而是优先补：

- 跨页面状态联动
- daemon / workspace / preview 真实链路
- 容易回归且仅靠单测拦不住的问题

本文只记录已经落地、已经通过本地定向验证的新增覆盖。

## 当前新增覆盖

### 1. 项目聊天输入与运行状态

文件：
- [e2e/ui/workspace-keyboard-flows.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/workspace-keyboard-flows.test.ts)
- [e2e/ui/app-restoration.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/app-restoration.test.ts)

新增用例：

1. `project chat Enter sends while Shift+Enter inserts a newline`
   - 覆盖项目聊天输入框的键盘提交行为
   - 防止 `Enter` / `Shift+Enter` 语义回退

2. `retrying a failed run does not duplicate the original user message`
   - 覆盖失败后重试不会重复插入同一条 user message
   - 防止 retry 链路制造重复消息

3. `sending another prompt while a run is active queues it and starts it after the first run finishes`
   - 覆盖运行中继续发送的排队行为
   - 校验 queued strip 和顺序执行

### 2. 聊天文件链接与 HTML 预览恢复

文件：
- [e2e/ui/app-restoration.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/app-restoration.test.ts)
- [e2e/ui/app-manual-edit.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/app-manual-edit.test.ts)

新增用例：

1. `chat file links open project files in the workspace and keep trailing punctuation out of hrefs`
   - 覆盖项目内文件链接在右侧 workspace 打开
   - 覆盖裸链接尾部中文/英文标点不进入 `href`

2. `HTML preview stays rendered after switching from Preview to Code and back`
   - 覆盖 `Preview -> Code -> Preview` 后 iframe 不白屏
   - 防止 HTML transport/reactivation 回归

### 3. Plugin authoring 必须真实产生产物

文件：
- [e2e/lib/fake-agents.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/lib/fake-agents.ts)
- [e2e/ui/real-daemon-run.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/real-daemon-run.test.ts)

新增用例：

1. `plugin authoring produces a generated-plugin scaffold with action cards`
   - 覆盖首页 `create-plugin` 入口
   - 覆盖 `generated-plugin/` 真实落地
   - 覆盖 action cards 和 Design Files 中的插件条目

当前 fake runtime 会真实写出：

- `generated-plugin/open-design.json`
- `generated-plugin/SKILL.md`
- `generated-plugin/examples/demo.md`

### 4. 评论模式与预览联动

文件：
- [e2e/ui/app.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/app.test.ts)

新增用例：

1. `sending preview comments keeps the preview live and refreshes it with the follow-up artifact`
   - 覆盖 comment mode 发送后 preview 持续刷新
   - 防止评论模式切断预览更新链路

### 5. Diagnostics 导出完整性

文件：
- [e2e/ui/diagnostics-export.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/diagnostics-export.test.ts)

新增用例：

1. `diagnostics export zip includes the primary daemon, web, and desktop logs`
   - 覆盖 diagnostics zip 不再只带 renderer log
   - 明确要求主日志存在：
     - `daemon/latest.log`
     - `web/latest.log`
     - `desktop/latest.log`

### 6. Automations 页面顺序与摘要

文件：
- [e2e/ui/automations-page.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/automations-page.test.ts)

新增用例：

1. `places a newly created automation at the top of the list and highlights it`
   - 覆盖新建后置顶与聚焦态

2. `keeps saved automations ordered by newest createdAt first`
   - 覆盖多条 automation 混排时按 `createdAt` 倒序稳定排序

3. `renders the routine target and last-run status in the row summary`
   - 覆盖 row summary 的 target / status 信息

### 7. Integrations：连接、恢复、退化状态

文件：
- [e2e/ui/settings-connectors-auth-happy-path.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/settings-connectors-auth-happy-path.test.ts)
- [e2e/ui/settings-connectors-auth-recovery.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/settings-connectors-auth-recovery.test.ts)

新增 happy-path 覆盖：

1. `disconnecting and reconnecting keeps the connector usable without stale pending state`
   - 覆盖 connect -> disconnect -> reconnect 后不残留 pending 状态

新增 recovery 覆盖：

1. `keeps a pending authorization visible when the connector enters authorization-pending state`
2. `shows a continue-in-browser CTA for pending authorizations that include a redirect URL`
3. `settles a pending authorization into Disconnect when status polling reports the connector as connected`
4. `returns a pending authorization to Connect and clears session storage after a successful cancel`
5. `surfaces a connector error state when credentials have degraded`

### 8. Design systems：Settings 导入/重命名/坏导入

文件：
- [e2e/ui/settings-design-systems.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/settings-design-systems.test.ts)

新增用例：

1. `imports a local design system and makes it visible immediately`
2. `renames an editable design system and keeps the new title after reopening settings`
3. `shows an inline error when importing a broken local design system package`

### 9. Design systems manager：发布、过滤、删除 fallback

文件：
- [e2e/ui/design-systems-manager.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/design-systems-manager.test.ts)

新增用例：

1. `publishing a user design system promotes it to the default system in the manager`
2. `filters user design systems by draft and published status in the manager`
3. `deleting the active design system falls back to another user system`

## 当前覆盖对应的产品结论

这批用例重点拦住的是下面这些历史高频回归：

- 项目聊天输入行为漂移
- retry 造成重复消息
- 聊天文件链接错误打开外部窗口
- HTML 预览切换白屏
- Plugin authoring 只说不做、没有产物
- 评论模式下预览不再刷新
- diagnostics 导出丢主日志
- automations 新建后顺序/摘要不稳定
- connector pending / degraded / reconnect 状态错乱
- design systems 导入、重命名、发布和删除 fallback 回归

## 运行命令

仓库根目录：

```bash
cd /Users/mac/open-design/open-design-amr-runtime-acp/e2e
```

### 聊天输入 / retry / queued / links

```bash
pnpm exec playwright test -c playwright.config.ts ui/workspace-keyboard-flows.test.ts --grep "project chat Enter sends while Shift\\+Enter inserts a newline"
```

```bash
pnpm exec playwright test -c playwright.config.ts ui/app-restoration.test.ts --grep "retrying a failed run does not duplicate the original user message|chat file links open project files in the workspace and keep trailing punctuation out of hrefs|sending another prompt while a run is active queues it and starts it after the first run finishes"
```

### HTML 预览恢复

```bash
pnpm exec playwright test -c playwright.config.ts ui/app-manual-edit.test.ts --grep "HTML preview stays rendered after switching from Preview to Code and back"
```

### Plugin authoring

```bash
pnpm exec playwright test -c playwright.config.ts ui/real-daemon-run.test.ts --grep "plugin authoring produces a generated-plugin scaffold with action cards"
```

### 评论模式 + 预览刷新

```bash
pnpm exec playwright test -c playwright.config.ts ui/app.test.ts --grep "sending preview comments keeps the preview live and refreshes it with the follow-up artifact"
```

### Diagnostics 导出

```bash
pnpm exec playwright test -c playwright.config.ts ui/diagnostics-export.test.ts
```

### Automations

```bash
pnpm exec playwright test -c playwright.config.ts ui/automations-page.test.ts --grep "places a newly created automation at the top of the list and highlights it|keeps saved automations ordered by newest createdAt first|renders the routine target and last-run status in the row summary"
```

### Connectors：happy path + recovery

```bash
pnpm exec playwright test -c playwright.config.ts ui/settings-connectors-auth-happy-path.test.ts --grep "switches from Connect to Disconnect on success, then returns to Connect after a successful disconnect|disconnecting and reconnecting keeps the connector usable without stale pending state"
```

```bash
pnpm exec playwright test -c playwright.config.ts ui/settings-connectors-auth-recovery.test.ts
```

### Design systems：settings + manager

```bash
pnpm exec playwright test -c playwright.config.ts ui/settings-design-systems.test.ts
```

```bash
pnpm exec playwright test -c playwright.config.ts ui/design-systems-manager.test.ts
```

## 当前测试依赖的产品事实

这批用例不是建立在“理想设计”上，而是建立在当前主线真实实现上。后续改产品时，需要一起更新测试假设。

### Connectors

- Connectors 页面是否可用，当前取决于 `savedApiKeyConfigured`
- `GitHub` 这类 Composio connector 不展示 `accountLabel`
- degraded/error connector 当前会显示：
  - `status-error`
  - error pill
  - 无 `Disconnect`
- 当前 UI 不保证 degraded 卡片一定有 `is-locked`

### Automations

- 保存后的排序规则当前是 `createdAt` 倒序
- row summary 稳定展示的是 `target` 与 `last-run status`

### Design systems

- 发布后会把 `designSystemId` 写回 `app-config`
- 删除当前 active system 时，当前行为是 fallback 到另一条 user system

## 建议的后续维护方式

后续新增 launch review 条目时，优先按下面 3 类拆分，而不是一股脑补 Playwright：

1. **页面级 E2E**
   - 只补跨状态、跨 surface、靠单测拦不住的回归

2. **组件/契约测试**
   - 文案、细粒度状态分支、纯视图逻辑优先放这里

3. **packaged / daemon / tools-dev**
   - 真实 run、打包态、导出与系统集成问题放这层

这样 Playwright 不会膨胀成一套难维护的全能回归集。

## 新增 daemon 契约回归

这批 launch review 补测不只停留在 Playwright。对于前端 E2E 无法替代的契约层问题，当前已补 5 条 daemon 定向回归。

### 1. Diagnostics 导出路径与缺失日志清单

文件：
- [apps/daemon/tests/diagnostics-export.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/apps/daemon/tests/diagnostics-export.test.ts)

新增用例：

1. `reports missing packaged log files under logical log paths without duplicating runtime segments`
   - 覆盖 packaged runtime 下 manifest 仍使用逻辑路径：
     - `logs/daemon/latest.log`
     - `logs/web/latest.log`
     - `logs/desktop/latest.log`
   - 防止路径回退成错误的 `runtime/<namespace>/logs/...`
   - 覆盖缺失日志时 manifest 会留下结构化 `error`

### 2. nested raw HTML route 契约

文件：
- [apps/daemon/tests/projects-routes.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/apps/daemon/tests/projects-routes.test.ts)

新增用例：

1. `serves nested project html files through the raw route and allows Origin: null`
   - 覆盖 `nested/demo/index.html` 这类深层项目文件
   - 覆盖 `/api/projects/:id/raw/*` 路由对 HTML 的 `content-type`
   - 覆盖 sandboxed iframe 场景下 `Origin: null` 的允许策略
   - 当前实现的 `Access-Control-Allow-Origin` 真实契约是 `*`

### 3. run 终态幂等

文件：
- [apps/daemon/tests/runs.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/apps/daemon/tests/runs.test.ts)

新增用例：

1. `ignores subsequent finish attempts after the run reaches a terminal state`
   - 覆盖 run 一旦进入 terminal state，就不会再被后续 `finish()` 覆盖
   - 覆盖 terminal `end` 事件只会发一次
   - 防止失败/取消/成功之间被重复收尾导致状态漂移


### 4. AMR model id 归一化回归

文件：
- [apps/daemon/tests/amr-acp-integration.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/apps/daemon/tests/amr-acp-integration.test.ts)
- [apps/daemon/src/runtimes/defs/amr.ts](/Users/mac/open-design/open-design-amr-runtime-acp/apps/daemon/src/runtimes/defs/amr.ts)

新增覆盖：

1. `deepseek-v3-2` / `vela/deepseek-v3-2` 会被归一化成 `deepseek-v3.2`
   - 直接对应最近 beta 包里出现的：
     - `Model not found: vela/deepseek-v3-2`
   - 防止 daemon 把展示值或旧值错误地下发到 ACP `session/set_model`


### 5. Plugin authoring 完成性判定

文件：
- [apps/daemon/tests/chat-route.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/apps/daemon/tests/chat-route.test.ts)
- [apps/daemon/src/server.ts](/Users/mac/open-design/open-design-amr-runtime-acp/apps/daemon/src/server.ts)

新增覆盖：

1. `does not report plugin authoring as succeeded when the agent only emits planning text without artifacts`
   - 覆盖 `Plugin authoring` 这类必须落地产物的任务不能只凭一条计划文本成功收尾
   - 当 agent 退出码为 `0`，但项目目录里缺少：
     - `generated-plugin/open-design.json`
     - `generated-plugin/SKILL.md`
   - daemon 会把本轮转成 `failed`，而不是错误地保留 `succeeded`

### daemon 定向运行命令

仓库根目录：

```bash
cd /Users/mac/open-design/open-design-amr-runtime-acp/apps/daemon
```

```bash
pnpm exec vitest run tests/chat-route.test.ts tests/diagnostics-export.test.ts tests/projects-routes.test.ts tests/runs.test.ts tests/amr-acp-integration.test.ts tests/runtimes/env-and-detection.test.ts tests/runtimes/resolve-model.test.ts
```

## 这批 daemon 补测当前没有覆盖的点

下面这些仍然值得继续补，但这轮没有为了追求数量硬塞进去：

1. AMR / agent 运行结束态收敛
   - 例如“工作完成但没有 terminal event，最后被 watchdog 打成 failed”
   - 例如“有有效产物但收尾阶段卡住”的 terminal-state 修正

2. AMR auth / model discovery 的更完整契约
   - 例如 auth probe 与真实 launch path / env 必须同源
   - 例如 live models 成功时不能回退到假默认模型

3. queued / retry 的持久化语义
   - 前端行为已覆盖
   - daemon 侧仍可继续锁住 message 关联和队列启动顺序
