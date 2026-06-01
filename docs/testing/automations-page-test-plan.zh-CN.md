# Automations 页面自动化待补清单

## 说明

本文档针对 `/automations` 页面整理自动化测试缺口，目标是把当前“有零散组件测试、但缺页面级覆盖”的状态收敛成一个可执行清单。

适用范围：

- `Automations` 页面本身
- 列表卡片区
- 页面级筛选与分类
- `New automation` 页面入口
- 页面内的 `Run / History / Edit / Pause / Delete / Open result`

当前边界：

- 已有部分组件测试覆盖 `RoutinesSection`、`TasksView.history`、`NewAutomationModal`。
- 当前仓库内**还没有看到这整个页面的完整 E2E 覆盖**。
- 本文档优先补“页面真实使用路径”，而不是重复已有纯函数或小组件断言。

## 现有覆盖概览

当前已存在、与这页有关的测试主要有：

- [RoutinesSection.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/RoutinesSection.test.tsx)
  覆盖部分自动化列表区和 `New automation` 入口行为。
- [TasksView.history.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/TasksView.history.test.tsx)
  覆盖 automation history 相关行为。
- [NewAutomationModal.context-picker.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/NewAutomationModal.context-picker.test.tsx)
  覆盖创建弹窗里的 prompt/context picker。
- [router-marketplace.test.ts](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/router-marketplace.test.ts)
  覆盖 `/automations` 路由解析。

仍明显缺失的，是你截图这个页面本身的：

- 页面加载
- 顶部统计
- 卡片操作
- 页面级筛选
- “Open result” 链路
- 页面入口到弹窗/编辑页的完整串联

## P0

这些是最值得先补、最容易出真实回归事故的页面级能力。

| ID | 模块 | 待补自动化点 | 推荐层级 | 说明 |
| --- | --- | --- | --- | --- |
| AUTO-P0-001 | 页面加载 | `/automations` 页面可正常进入，标题、副标题、`New automation` 按钮可见 | E2E UI | 守住页面可达性和基本骨架 |
| AUTO-P0-002 | 顶部统计 | `Active / Paused / Templates` 三个统计块正常渲染 | 组件测试 + E2E UI | 至少校验数值显示与空态不炸 |
| AUTO-P0-003 | 列表加载 | `Your automations` 列表可渲染多条记录 | E2E UI | 覆盖成功、失败、暂停等不同状态卡片 |
| AUTO-P0-004 | 状态 badge | `FAILED / SUCCEEDED / PAUSED` badge 正确显示 | 组件测试 | 防止状态串文案、串颜色、串按钮 |
| AUTO-P0-005 | `New automation` 入口 | 点击 `New automation` 能打开创建弹窗/流程 | E2E UI | 守住最核心入口 |
| AUTO-P0-006 | `Run` 操作 | 点击 `Run` 后状态刷新，最近运行信息更新 | E2E UI | 用户最直接的主操作之一 |
| AUTO-P0-007 | `Pause` 操作 | 点击 `Pause` 后状态与按钮文案更新 | E2E UI | 防止暂停后还显示 active |
| AUTO-P0-008 | `History` 入口 | 点击 `History` 能打开历史视图/面板 | 组件测试 + E2E UI | 至少验证入口可达 |
| AUTO-P0-009 | `Edit` 入口 | 点击 `Edit` 能进入编辑状态或编辑弹窗 | E2E UI | 防止编辑入口断链 |
| AUTO-P0-010 | `Delete` 操作 | 删除入口可达，确认后列表移除 | E2E UI | 高风险破坏性操作，必须单测到 |

## P1

这些属于第二层回归，建议在页面主链路补齐后继续补。

| ID | 模块 | 待补自动化点 | 推荐层级 | 说明 |
| --- | --- | --- | --- | --- |
| AUTO-P1-001 | `Open result` | 成功 run 有结果时可打开结果页 | E2E UI | 守住成功产物可追溯 |
| AUTO-P1-002 | 失败结果 | 失败 run 的 `Open result` 行为正确，不假装有结果 | E2E UI | 防止死链或错误跳转 |
| AUTO-P1-003 | 顶部筛选 | `Active / Paused / Templates` 切换后列表正确过滤 | 组件测试 + E2E UI | 覆盖页面级聚合筛选 |
| AUTO-P1-004 | 底部分类 | `All / Orbit / Live artifacts / Memory / ...` 分类切换正确 | E2E UI | 贴近截图中的模板分类条 |
| AUTO-P1-005 | 列表时间信息 | `Last run / Next run` 时间展示正确 | 组件测试 | 防止时区、格式或排序回归 |
| AUTO-P1-006 | `Run` 防重入 | 连点 `Run` 不应产生并发重复执行 | 组件测试 + E2E UI | 防止重复触发 |
| AUTO-P1-007 | `Pause` 防重入 | 连点 `Pause` 不会出现状态错乱 | 组件测试 | 防止 UI/接口竞态 |
| AUTO-P1-008 | 创建成功回填 | 新建 automation 后统计数字和列表一起刷新 | E2E UI | 覆盖页面级一致性 |
| AUTO-P1-009 | 编辑成功回填 | 编辑后卡片标题、频率、下一次运行时间更新 | E2E UI | 覆盖编辑结果回流 |

## P2

这些更偏兜底与稳定性，适合在主链路稳定后补充。

| ID | 模块 | 待补自动化点 | 推荐层级 | 说明 |
| --- | --- | --- | --- | --- |
| AUTO-P2-001 | 空态 | 没有 automations 时的空态渲染正确 | 组件测试 + E2E UI | 防止空页布局坏掉 |
| AUTO-P2-002 | 接口失败 | 列表加载失败时有明确错误或降级 | 组件测试 | 防止白屏 |
| AUTO-P2-003 | 单操作失败 | `Run / Pause / Delete / Edit` 请求失败时提示明确 | 组件测试 + E2E UI | 防止静默失败 |
| AUTO-P2-004 | 本地化 | 中文/英文下按钮、状态、统计布局正常 | E2E UI | 防止文案切换后布局溢出 |
| AUTO-P2-005 | 长列表 | 多条 automation 时滚动与分页/截断正常 | E2E UI | 防止页面退化 |
| AUTO-P2-006 | 模板统计边界 | 模板数量为 0 或很多时顶部统计仍正确 | 组件测试 | 覆盖计数边界 |

## 建议测试文件落点

### 组件测试

- [TasksView.history.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/TasksView.history.test.tsx)
  继续扩展 `History` 相关断言。
- [RoutinesSection.test.tsx](/Users/mac/open-design/open-design-amr-runtime-acp/apps/web/tests/components/RoutinesSection.test.tsx)
  可继续扩展列表加载、空态、状态 badge、`New automation` 按钮。
- 建议新增：
  - `apps/web/tests/components/TasksView.list.test.tsx`
  - `apps/web/tests/components/TasksView.filters.test.tsx`
  - `apps/web/tests/components/TasksView.actions.test.tsx`

### E2E UI

建议新增：

- `e2e/ui/automations-page.test.ts`
  - 页面加载
  - 标题/统计
  - 列表渲染
  - 顶部/底部筛选
- `e2e/ui/automations-actions.test.ts`
  - `Run / History / Edit / Pause / Delete`
  - `Open result`
- `e2e/ui/automations-create-flow.test.ts`
  - `New automation`
  - 创建成功后回填列表

## 推荐补测顺序

1. 页面基础骨架
   先补 `AUTO-P0-001`、`AUTO-P0-002`、`AUTO-P0-003`
2. 卡片主操作
   再补 `AUTO-P0-006`、`AUTO-P0-007`、`AUTO-P0-008`、`AUTO-P0-009`、`AUTO-P0-010`
3. 创建入口
   再补 `AUTO-P0-005`
4. 筛选与结果页
   再补 `AUTO-P1-001`、`AUTO-P1-002`、`AUTO-P1-003`、`AUTO-P1-004`
5. 稳定性与边界
   最后补 `AUTO-P2-*`

## 最值得先实现的 5 条

如果只优先做最有价值的 5 条，我建议是：

1. `AUTO-P0-001` `/automations` 页面加载成功
2. `AUTO-P0-005` `New automation` 入口可打开
3. `AUTO-P0-006` `Run` 操作后状态刷新
4. `AUTO-P0-007` `Pause` 操作后状态刷新
5. `AUTO-P1-003` 顶部筛选切换后列表正确变化

## 后续建议

这页最适合的策略不是一开始就做很重的全链路，而是：

- 先用组件测试守住状态展示和局部交互
- 再用 2 到 3 个 E2E 文件守住页面入口和核心动作
- 最后再补异常态、防重入和本地化

这样补起来更快，也更不容易被页面文案或布局小改动拖垮。
