# Creator 发布表现总览设计（CW-05）

日期：2026-07-15
状态：已确认，实施中

## 目标

在 Creator Workbench 内提供已发布交付包的只读表现总览，让创作者无需逐个打开 Release 即可比较最新手工快照与相邻增量。

## 调研依据

本次通过 agent-reach 的 GitHub CLI 与 Exa 公开检索，优先按 Star 加权。Grafana（75,648 Star）、Umami（37,677 Star）、PostHog（35,546 Star）和 Plausible（27,752 Star）共同表明，首版分析视图应先稳定呈现明确指标、时间与筛选条件，再考虑图表、评分或自动洞察。CreatorRPM 的可解释公式边界进一步说明本项目不应把手工快照伪装为收入或平台原始数据。

## 范围

仅在现有 Creator Workbench 的 Release 区域增加只读 `Performance overview`。它直接消费已有 Release、Content 与 Performance 快照 HTTP 数据，不新增 contracts、daemon 路由、持久化、平台访问或素材访问。

只纳入 `status === 'published'` 的 release。每项显示标题、平台、关联 Content 标题、发布时间、最新快照的 views/likes/comments，以及相对该 release 紧邻更旧快照的同指标增量。

## 交互

- 平台筛选：All、Bilibili、YouTube、Xiaohongshu、Other。
- 排序：最新快照时间、views、likes、comments；默认最新快照时间倒序。
- 无快照显示 `No performance snapshots`；缺失单项显示 `-`；不将缺失视为零。
- 缺失上一条快照或某项指标时不显示该项增量。
- 最新快照和上一条快照均按 capturedAt 降序确定；同一 capturedAt 以 createdAt、id 保持稳定。
- 排序时缺失值永远排在有值之后；相同值按 release title、id 稳定排序。
- 点击 `Open release` 仅切换到既有 Release 编辑器，不新建路由或编辑流程。

## 降级与边界

如果某个项目的 Release 或 Performance 请求失败，该项目不进入总览；其现有 Release/Performance 区域继续使用已实现的失败文案。Content 请求失败不排除项目，只退回显示 contentId。

不计算百分比、互动率、评分、收入、跨平台排名、趋势预测或推荐；不新增图表、账号授权、自动抓取、文件导入或 AI 分析。

## 验收

1. 多个已发布 release 显示正确的最新快照与相邻增量。
2. 平台筛选、四种排序、无快照和缺失指标均可预测。
3. Release/Performance API 单项目失败时，该项目不进入总览，其他项目仍可见。
4. Open release 复用既有编辑器与项目选择。
5. 定向页面测试、web typecheck、web build 与 diff check 通过。
