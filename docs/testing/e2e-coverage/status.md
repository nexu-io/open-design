# E2E 状态

这份文档记录 `e2e/` 当前的自动化测试分层、最近一轮补强工作的落点，以及我们有意保留的已知缺口。

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
- [e2e/tests/dialog/artifact-consistency.test.ts](../../../e2e/tests/dialog/artifact-consistency.test.ts)

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

## 已知且故意保留的缺口

当前仍有一个明确的产品级缺口，以 `fixme` 的形式保留在：

- [e2e/ui/real-daemon-run.test.ts](../../../e2e/ui/real-daemon-run.test.ts)

跳过的场景是：

- 真实 daemon run 进行中刷新页面，然后期望 artifact persistence 正常完成

当前产品实际行为：

- reload 后 run 状态可以 reattach
- assistant turn 看起来也可能正常结束
- 但 artifact persistence 可能在 reattach 后丢失

这条我们明确保留为已知产品缺口，而不是把测试弱化成假绿。

## 验证命令

从仓库根目录运行：

```bash
pnpm --filter @open-design/e2e typecheck
```

```bash
pnpm --filter @open-design/e2e test tests/dialog/artifact-consistency.test.ts
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
- 每补完一批，就做一次 grouped validation
- 已知产品 bug 继续保留为 `fixme`，不要为了变绿而弱化套件
