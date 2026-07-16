# CW-05 Creator 发布表现总览调研

检索日期：2026-07-15（GitHub `gh` CLI，经 `agent-reach` GitHub 路由；star 数为当日 `gh repo view` 实测值）

## 参考项目（按 star 数排序）

| 项目 | Stars | 最近推送 | 许可证 | 架构 / 产品模式 | 来源 |
| --- | ---: | --- | --- | --- | --- |
| [grafana/grafana](https://github.com/grafana/grafana) | 75,648 | 2026-07-15 | AGPL-3.0 | Go 后端 + React 前端；把原始时序数据源、可解释的面板聚合与告警/编辑三层分离。总览（Dashboard）只做只读的稳定查询、筛选与下钻，不改写底层采集数据。 | [README](https://github.com/grafana/grafana#readme) |
| [umami-software/umami](https://github.com/umami-software/umami) | 37,679 | 2026-07-14 | MIT | Next.js 全栈的隐私友好网站分析；总览按站点罗列可比指标（浏览、访客等），指标缺失时明确留空而非补零，不做跨站点黑箱评分。 | [README](https://github.com/umami-software/umami#readme) |
| [PostHog/posthog](https://github.com/PostHog/posthog) | 35,547 | 2026-07-15 | Other (MIT-family) | 产品分析平台；事件原始快照与可解释聚合分离，看板支持筛选/排序/下钻，指标口径透明，避免不可解释的合成分数。 | [README](https://github.com/PostHog/posthog#readme) |
| [plausible/analytics](https://github.com/plausible/analytics) | 27,755 | 2026-07-15 | AGPL-3.0 | Elixir + 轻前端的简洁分析；单屏总览优先呈现少量稳定核心指标与对比，强调可读的紧凑扫描型布局而非嵌套卡片。 | [README](https://github.com/plausible/analytics#readme) |

## 对 CW-05 采用的模式

- **原始快照 / 可解释聚合 / 详情编辑三层分离**（Grafana、PostHog）：总览只读地消费既有 `GET /api/projects/:id/creator-release-packages` 与 `GET /api/projects/:id/creator-performance-snapshots`，聚合仅在 Web 层做“最新快照 + 相对上一条快照增量”的可解释计算，不写回、不改写 CW-04 的录入/编辑流。
- **稳定的筛选 / 排序 / 下钻**（Grafana、PostHog）：总览提供平台 segmented（All / Bilibili / YouTube / Xiaohongshu / Other）与排序 select（Latest snapshot / Views / Likes / Comments），全部降序、确定性次级排序，切换筛选/排序不修改底层数据。
- **指标缺失明确显示，不补零**（Umami、Plausible）：无快照的 published release 仍显示，并标注 “No performance snapshots”，views/likes/comments 显示 “-”；数值 0 是有效值不得按缺失处理；latest 存在而 previous 缺失时只显示 latest，不伪造增量。
- **紧凑扫描型单屏总览，避免嵌套卡片**（Plausible）：使用语义表格、复用现有 TasksView 视觉语言与 CSS 变量，桌面便于横向比较，960px 以下允许横向滚动、640px 以下不重叠。
- **项目级失败隔离**（Grafana 数据源相互独立）：某项目 Release 或 Performance 接口失败则该项目整体不进入总览（禁止不完整聚合），但不影响其他健康项目，也不影响既有 Tasks/Media/Content/Release/Performance 面板。

## 不采用的方案

- 不引入黑箱评分、健康分、收入估算或增长率/百分比等派生指标；只呈现原始 views/likes/comments 及其相邻快照的绝对增量（对齐 Umami/PostHog 的“可解释口径”原则，反例是各类不可解释的合成分数）。
- 不做跨平台归一化排名或跨项目权重合并；排序只在同一可比指标（快照时间或单一指标绝对值）上做降序，缺失值一律排后。
- 不接入任何平台账号、不自动抓取、不写第三方平台；总览不含任何 POST/PATCH/DELETE，也不新增 daemon API / contracts / 持久化 / 页面路由。
- 不照搬 Grafana/PostHog 的时序图表、告警、查询构建器、多维下钻与持久化仪表盘模型；CW-05 首版只需在 TasksView 内提供一个只读、可横向比较的发布表现总览。
- 不引入新依赖、不使用卡片嵌套、不使用负 letter-spacing。

## 本阶段范围

- **界面**：在 TasksView 的 Creator surface 内、与现有 Creator 面板同级（`creator-dashboard` 直接子元素，位于 Release 面板之后）新增只读 “Performance overview” 区域；仅 `status === "published"` 的 release 各占一行，列出 Release 标题、Platform、关联 Content 标题、publishedAt、最新快照 capturedAt、最新 views/likes/comments 及各自相对上一条快照的增量。
- **数据来源**：复用 `refresh()` 已按项目并发加载的 Release、Performance、Content 状态（均带项目级 `failed` 标记）。由于 Performance 接口本身是项目级（一次返回该项目全部快照），项目级请求失败即整项目排除，天然满足“禁止不完整聚合”；无需为每个 published release 另发请求。Content 缺失不排除 release，仅回退显示 `contentId`。
- **算法**：复制快照数组后按 `capturedAt` 降序（相同用 snapshot id 次级）排序，取第一条为 latest、第二条为 previous；每个指标独立计算，0 视为有效值，缺失显示 “-” 且不显示增量，增量按 `+N` / `-N` / `0` 呈现，不计算百分比。
- **允许修改**：`apps/web/src/components/TasksView.tsx`、`apps/web/src/styles/home/tasks.css`、`apps/web/tests/components/TasksView.page.test.tsx`；文档新增本调研文档与验收文档。
- **明确不做**：不修改 `apps/daemon/**`、`packages/contracts/**`、`package.json`、`pnpm-lock.yaml`、`design-systems/**`、用户素材与真实 `.od` 数据；Web 仅通过 HTTP API 与 `@open-design/contracts` 集成，不导入 daemon 私有源码。
