# CW-06 调研记录：Creator 发布排期议程（Release schedule）

- 日期：2026-07-16
- 范围：在 `TasksView` Creator 面板新增只读「Release schedule」议程，仅聚合当前已加载项目的 `CreatorReleasePackage` 数据。
- 检索方式：按 `AGENTS.md` 要求优先经 `agent-reach` 高星项目核验；本执行环境未提供 `agent-reach` 技能/通道，改用公开 Web 检索（GitHub / star-history / repositorystats）做高星项目核验，结论与 dispatch 给定参考值量级一致。
- 检索日期：2026-07-16（star 为近似值，随仓库每日变动）。

## 一、高星参考项目

| 项目 | 角色 | 参考 Star | 2026-07-16 检索量级 | 许可证 | 采用权重 |
|---|---|---|---|---|---|
| `AppFlowy-IO/AppFlowy` | AI 协作工作区 / 项目与任务管理 | ~73.9k | ~72k（多源 68.9k–73.1k） | AGPL-3.0 | 高 |
| `makeplane/plane` | 开源项目管理（Jira/Linear 替代） | ~54.5k | ~54k（多源 49.7k–54.1k） | AGPL-3.0 | 高 |
| `calcom/cal.com` | 开源日程安排（Calendly 替代） | ~46.5k | ~45–46k（多源 40.7k–46.2k） | AGPL-3.0 | 高 |

三者均为活跃维护、高星的开源产品，且都围绕「项目 / 任务 / 日程」的可见化呈现，是本次议程设计的高权重参考。

## 二、观察到的架构与产品模式

- **AppFlowy**：以「日期 + 状态」为核心字段组织任务与页面；视图层（看板 / 时间线 / 日历）与编辑流（属性面板）严格分离，日期是唯一事实来源，时间线/日历只是同一数据的不同投影。
- **Plane**：Issue / Cycle / Module 均以「计划时间 / 目标时间」字段驱动；视图（看板、列表、甘特、日历）叠加在统一数据模型之上，不复制排期实体。
- **cal.com**：显式处理时区（每个预订按所有者时区渲染、自动换算访客时区），并突出「状态（available / booked / pending）」；其调度核心也是「日期时间字段 + 状态」而非平行实体。

## 三、采用的结论（本阶段范围）

1. **日期字段是唯一事实来源**：直接复用 `CreatorReleasePackage.scheduledAt`，不创建平行的排期实体或新存储表。
2. **总览与编辑分离**：议程为只读聚合；修改排期仍走既有 Release 编辑器（已支持 `scheduledAt` 编辑），不在议程内提供任何写操作。
3. **先提供紧凑、可扫描的 agenda，再考虑复杂月历**：本阶段以「按本地日期分组的有序列表」呈现，月历/拖拽为后续可选项，不在本阶段实现。
4. **明确显示本地时区与状态**：议程以浏览器本地时区渲染 `scheduledAt`，区域说明中标出当前时区；每条排期项显示 `status`（draft / ready）与逾期（Overdue）状态。

## 四、明确不采用（拒绝的方案）

- 新 daemon API、contracts、存储、依赖或页面路由。
- 自动排程、拖放改期、冲突消解、推荐发布时间。
- 平台账号、平台 API、自动发布、通知、日历同步。
- 时区持久化偏好、跨平台归一化。

## 五、与既有 CW-05「Performance overview」的关系

- 二者同属 Creator 面板下的只读聚合区，采用相同的前置约束：复用既有 Release / Performance / Content 状态，不新增 API、不含写请求、失败项目整体隔离、可见的项目级降级提示。
- CW-06 仅依赖 Release 状态（含 `scheduledAt`），其「失败项目」计数以 **Release API 失败** 为准（与 CW-05 同时看 Release/Performance 不同，因 CW-06 不消费 Performance 数据）。

## 六、核验备注

- 因环境无 `agent-reach` 通道，star 数值经公开 Web 检索交叉核验；dispatch 给定参考值（73.9k / 54.5k / 46.5k）与检索量级一致，规划以上述参考值为准。
- 若后续 `agent-reach` 可用，建议补充更精确的 star 抓取与许可证/维护状态字段，但本阶段结论不受影响。
