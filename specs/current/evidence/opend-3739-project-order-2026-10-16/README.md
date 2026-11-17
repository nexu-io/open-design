# OPEND-3739 项目排序验收记录

- Plane：[OPEND-3739 · OD 项目列表排序逻辑优化](https://plane.powerformer.net/open-design/browse/OPEND-3739/)
- 需求：[Open Design 项目列表统一排序需求](https://powerformer.feishu.cn/docx/TYvyd7Xcqo7CVMxgM6ucnAZDnqh)，核对版本 revision 68。
- 代码基线：`1eaa2381aa6a7be74ac4cab8651eb7d12f9ec2ff`；验收对象是本提交中的排序改动。
- 结论：本地自动化与浏览器视觉验收通过；用户随后确认验收通过。
- 浏览器执行时间：2026-10-16 14:42:47–14:42:53（北京时间）。

## 交付范围与取舍

首页“最近项目”与“全部项目”的“最近更新”共用用户发送时间排序；项目内左上角下拉框额外将当前项目唯一置顶，其余项目使用相同规则。未调整“最早更新”或“名称”排序，也未将下拉框的现有 tabs 范围扩大为全部项目。

独立的 `lastUserQueryAt` 不替换内容活动字段 `updatedAt`。发送队列在入队时更新一次，出队执行不重复更新；手动重试记录本次用户操作时间。复用现有发送节点和项目 PATCH，不改变对话保存、队列执行或重试机制。排序写入是尽力而为：不阻塞发送，不增加轮询、补偿队列或自动重试。旧时间写回不能使排序时间回退。

历史项目在新增数据库列的那次升级中按已存用户消息时间回填一次，不在正常列表读取时扫描消息或解析消息大字段。无法确定时间的项目排在末尾，以固定 ID 顺序打破时间相同或未知的并列。

已知边界：本次未扩展云端同步或导入流程；升级后新导入的历史或仅云端占位项目若没有本地排序时间，暂按未知时间排末尾，直到后续记录新的用户发送。极端存储压力下允许排序元数据短暂不一致，但排序失败不能导致对话保存失败。

## 本地聚焦测试

改动前，在上述基线上运行新增数据库规格，因 `lastUserQueryAt` 为 `undefined` 而非预期的 `null` 得到 2 项失败。尚未在之后更新的远端 `main` 单独重放，不把基线红测表述为最新主干红测。

改动后，以下检查通过：

```bash
pnpm guard
pnpm typecheck

pnpm --filter @open-design/web exec vitest run \
  tests/lib/project-order.test.ts \
  tests/components/EntryNavRail.recent-section.test.tsx \
  tests/components/WorkspaceTabsBar.test.tsx \
  tests/components/RecentProjectsStrip.test.tsx \
  tests/components/ProjectView.pendingPrompt.test.tsx

pnpm --filter @open-design/web exec vitest run \
  tests/components/ProjectView.strategy-retry.test.tsx \
  tests/components/App.workspace-switch-project-list.test.tsx

pnpm --filter @open-design/daemon exec vitest run \
  tests/db-project-recency.test.ts \
  tests/headless-runs.test.ts \
  tests/routes/workspace-projects.test.ts

pnpm --filter @open-design/daemon exec vitest run \
  tests/run-steer-route.test.ts
```

| 检查组 | 结果 |
|---|---|
| Web 排序、三个列表及排队 | 147 通过、1 跳过 |
| Web 手动重试与工作区列表 | 19 通过 |
| daemon 数据库、headless、workspace HTTP | 77 通过 |
| daemon steer HTTP | 3 通过 |
| 合计 | **246 通过、1 跳过** |
| guard / 全仓 typecheck / diff 空白检查 | 通过 |

数据库测试覆盖独立时间持久化、单调更新、重启恢复、一次性跨会话历史回填、非法值与只读数据库下排序写入失败不抛出异常且保留已存消息。未运行全量 daemon/web 测试套件。

## 浏览器验收方式

- Chrome 155.0.8059.80，headless，视口 1440×1000，独立任务 profile。
- 使用 tools-dev 独立 namespace `recency-3739`；本地 Web 端口 17773、daemon 端口 17746。
- 通过真实 UI 选择 Local AI 完成首次设置，未执行模型任务。
- A/B/C/D 样本只通过生产 HTTP API 建立：A/B/C 最近用户发送分别为 10:00/11:00/09:00，D 从未发送。
- 未 mock 项目响应、未改 DOM、未注入排序结果；依次通过页面控件浏览 A、B、D、C，并在下拉框中由 C 切换到 A。
- 首轮脚本在关闭下拉框时尝试点击被 backdrop 覆盖的触发按钮而超时；检查页面后改为点击空白 backdrop，完整重跑通过。未修改产品源码，也未使用 force click。

## 浏览器实际结果

| 场景 | 实际顺序 |
|---|---|
| 首页“最近项目” | **B → A → C → D** |
| 当前项目 C，打开左上角下拉框 | **C → B → A → D**，C 唯一置顶 |
| 在下拉框切换至 A，再展开 | **A → B → C → D**，C 回到基础位置 |
| 返回首页 | **B → A → C → D** |
| 刷新首页 | **B → A → C → D** |

通过 HTTP 回读，浏览和切换前后四个项目的 `lastUserQueryAt` 完全相同；D 保持 `null`。结构化断言结果见 [report.json](report.json)。

按用户要求，截图不纳入仓库或 PR，由用户按需私下提供。本记录保留实际验收步骤和结果。

## 验收边界

- 已验证本地 Web、数据库与 HTTP 边界；这不是 stable/beta 桌面安装包实机验收。
- “全部项目”的排序本轮有组件测试覆盖，未另行截图该页面。
- 本地通过与用户验收通过不代表 PR CI、合并、发布或生产验证已经完成。
