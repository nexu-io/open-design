# Automations 当前自动化覆盖清单

## 概述

这份文档用于说明 `Automations` 页面及其核心运行链路，**当前已经有哪些自动化覆盖**，以及**还剩哪些空缺**。

覆盖范围按 3 层拆分：

- `组件/单测`
- `页面级 E2E`
- `tools-dev / non-UI 回归`

本文只统计当前仓库 `open-design-amr-runtime-acp` 里已经落地并可执行的自动化，不包含钱包、Stripe 或其他仓库页面。

## 当前已覆盖

### 1. 组件 / 单测

#### [TasksView.page.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/TasksView.page.test.tsx)

已覆盖：

- `Automations` 页面骨架渲染
- hero 标题、副标题、统计区
- `Active / Paused / Templates` 统计展示
- 空态展示
- 从空态打开 `New automation`
- 从顶部按钮打开 `New automation`
- 模板分类切换到空分类时的空态
- `Run`
- `Pause / Resume`
- `Delete`
- `Open result`
- `History / Hide history`
- `Edit` 预填
- template filter 的 `aria-selected` 切换

#### [TasksView.history.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/TasksView.history.test.tsx)

已覆盖：

- 历史运行信息展示
- `Open conversation`
- 历史视图中的元信息
- 从列表 `Edit` 打开预填弹窗

#### [TasksView.templates.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/TasksView.templates.test.tsx)

已覆盖：

- daemon automation templates 渲染
- 从 template 卡片打开创建弹窗
- evolution proposals 展示与应用
- source ingestion 基本链路

#### 相关旧测试

- [RoutinesSection.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/RoutinesSection.test.tsx)

说明：

- 这是旧的 routines surface 测试
- 仍覆盖部分基础动作，例如创建、暂停、运行、删除
- 但当前主页面已经是 `TasksView`，所以后续应优先看 `TasksView.*` 测试

### 2. 页面级 E2E

#### [automations-page.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/automations-page.test.ts)

已覆盖 9 条页面级 smoke / regression：

- 页面加载：hero、统计区、filter、已保存列表
- 创建 automation 后从页面运行
- 创建失败时 modal 保持打开且输入不丢
- `Run` 失败时页面错误展示与 row 仍可操作
- `Pause / History / Delete` 主链路
- `Pause` 失败态
- `Delete` 失败态
- `Edit` 保存后列表更新
- 模板 filter 切换后页面内容变化

#### [settings-memory-routines.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/ui/settings-memory-routines.test.ts)

已覆盖：

- 从主 `Automations` surface 创建 automation
- 运行 automation 跳转到项目对话
- 创建失败时 modal 保持打开

说明：

- 这部分和 `automations-page.test.ts` 有一定重叠
- 但它更像 Settings / Memory 混合场景下的回归

### 3. tools-dev / non-UI 回归

#### [routines.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/lib/vitest/routines.ts)

已提供 helper：

- `listRoutines`
- `createRoutine`
- `updateRoutine`
- `runRoutine`
- `deleteRoutine`

#### [automations-routines.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/e2e/tests/tools-dev/automations-routines.test.ts)

已覆盖 2 条核心非 UI 回归：

- 成功链路
  - `create`
  - `list`
  - `pause / resume`
  - `run succeeded`
  - `assistant message`
  - `lastRun`
  - `delete`

- 失败链路
  - `run failed`
  - `assistant message.runStatus = failed`
  - `lastRun.status = failed`
  - `lastRun.error` 已持久化

## 当前已形成的覆盖矩阵

### 页面展示

已覆盖：

- 页面可加载
- 统计区可见
- 空态可见
- filter/tab 状态切换
- 列表项主按钮可见

### 主操作

已覆盖：

- `New automation`
- `Edit`
- `Run`
- `Pause / Resume`
- `Delete`
- `Open result`
- `History`

### 失败态

已覆盖：

- 创建失败
- 运行失败
- Pause 失败
- Delete 失败
- run 失败后的 `assistant message` 与 `lastRun` 持久化

### 数据层 / 契约层

已覆盖：

- `/api/routines` create/list/update/delete/run 主链路
- `lastRun` 成功持久化
- `lastRun` 失败持久化
- 非 UI 运行结果与消息状态一致

## 仍然存在的空缺

下面这些还没有形成完整自动化，或者只被部分覆盖。

### 1. Edit 失败态

当前缺少：

- 编辑保存失败时 modal 是否保持打开
- 已输入修改是否保留
- 错误提示是否明确

建议优先级：`P1`

### 2. History 失败态

当前缺少：

- 拉取 history 接口失败时的页面表现
- history 空态与失败态是否区分

建议优先级：`P1`

### 3. Source ingestion 的页面级 E2E

当前组件测试已覆盖部分逻辑，但页面级 E2E 还缺：

- ingest 成功
- ingest 失败
- proposals 在页面上的联动

建议优先级：`P1`

### 4. Evolution proposals 的页面级 E2E

当前缺少：

- proposal 可见性
- `Apply`
- `Reject`
- proposal 数量变化

建议优先级：`P1`

### 5. 更细的错误恢复

当前缺少：

- `Run` 失败后再次成功运行
- `Pause` 失败后再次点击恢复成功
- `Delete` 失败后重试删除成功

建议优先级：`P2`

### 6. 并发 / 防重入

当前缺少：

- 连点 `Run`
- 连点 `Pause`
- 连点 `Delete`

建议优先级：`P2`

### 7. 多语言 / 文案变体

当前覆盖主要以当前默认界面为准，缺少：

- 中文 / 英文切换下关键入口是否仍稳定

建议优先级：`P2`

## 推荐优先级

### P0

已覆盖完成：

- 页面加载
- 新建
- 运行
- 暂停 / 恢复
- 删除
- 编辑
- 运行失败
- 暂停失败
- 删除失败
- tools-dev 成功 / 失败主链路

### P1

建议下一步补：

- Edit 失败态
- History 失败态
- proposals 页面级 E2E
- source ingestion 页面级 E2E

### P2

可后续补：

- 防重入
- 重试恢复
- 多语言稳定性

## 推荐执行命令

### 组件测试

```bash
cd /Users/mac/open-design/open-design-amr-runtime-acp
pnpm --dir apps/web test -- \
  tests/components/TasksView.page.test.tsx \
  tests/components/TasksView.history.test.tsx \
  tests/components/TasksView.templates.test.tsx
```

### 页面级 E2E

```bash
cd /Users/mac/open-design/open-design-amr-runtime-acp/e2e
pnpm exec playwright test -c playwright.config.ts ui/automations-page.test.ts
```

### tools-dev / non-UI

```bash
cd /Users/mac/open-design/open-design-amr-runtime-acp/e2e
pnpm test tests/tools-dev/automations-routines.test.ts
```

## 结论

当前 `Automations` 这一块已经不是“只有页面能点点看”的状态，而是已经形成了：

- `组件级`
- `页面级 E2E`
- `非 UI 契约级`

三层覆盖。

如果按回归价值看，当前最值得继续补的不是再堆更多 happy path，而是：

- `Edit` 失败态
- `History` 失败态
- `Source ingestion / proposals` 的页面级 E2E

这三块补完后，`Automations` 页面自动化会更接近完整回归集。
