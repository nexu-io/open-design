# Creator 发布后数据快照与复盘设计（CW-04）

日期：2026-07-15
状态：已确认，待实施计划

## 目标

在 CW-03 的已发布交付包上记录可追溯的人工表现数据快照，形成“素材 -> 内容 -> 发布 -> 复盘”的本地闭环。首版只保存用户手工录入或粘贴的指标，不访问任何平台账号，也不对数据做黑箱评分。

## 调研依据

本次通过 agent-reach 使用 GitHub CLI 和 Exa 进行公开检索，GitHub Star 越高的项目权重越高。检索日期为 2026-07-15。

| 项目 | Stars | 观察到的模式 | 本项目采用 / 拒绝 |
| --- | ---: | --- | --- |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | 196,532 | 自动化步骤具有明确状态、人工确认和可观察记录。 | 采用可观察、可追溯的人工记录；拒绝账号连接器和自动化抓取。 |
| [immich-app/immich](https://github.com/immich-app/immich) | 107,746 | 本地优先的媒体资产边界，元数据与原文件分离。 | 采用只保存快照元数据、不读取或修改原始素材。 |
| [makeplane/plane](https://github.com/makeplane/plane) | 54,508 | 独立实体通过稳定关联组织，不把分析字段塞入任务本体。 | 采用独立快照实体，以 releaseId 关联交付包。 |
| [Freeman-md/creator-lab](https://github.com/Freeman-md/creator-lab) | 小众参考 | 发布内容、指标、经验和下一次 brief 分层，指标变更可使后续结论失效。 | 首版只实现指标快照；经验继续使用现有 Content retrospective，拒绝 AI 分析和自动生成 brief。 |
| [catehstn/social-brain](https://github.com/catehstn/social-brain) | 小众参考 | 手工导出或收集后持久化历史数据，再做复盘。 | 采用手工录入与本地历史；拒绝首版 CSV/XLSX 解析和第三方凭证。 |

## 范围与边界

一个 `CreatorPerformanceSnapshot` 属于一个 Open Design 项目，并通过 `releaseId` 关联一个 CW-03 `CreatorReleasePackage`。同一个发布包可以有多个快照，用于记录发布后不同时间点的人工观察。

首版包含：手工创建、按发布包读取、删除误录、按时间排序、与上一条快照的基础增量展示。

首版不包含：平台账号授权、Cookie、自动抓取、CDP、浏览器扩展、CSV/XLSX/JSON 文件导入、平台数据格式适配、AI 结论、收入估算、排行榜、跨平台归一化评分、排期日历、通知或协作审批。

快照不能修改 release、Content、Task、Media 或用户原始素材。现有 Content retrospective 继续承载自由文本经验；CW-04 不复制或替换该字段。

## 数据模型

```ts
interface CreatorPerformanceMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  favorites?: number;
  followers?: number;
  watchSeconds?: number;
}

interface CreatorPerformanceSnapshot {
  id: string;
  projectId: string;
  releaseId: string;
  source: 'manual';
  capturedAt: string;
  metrics: CreatorPerformanceMetrics;
  note?: string;
  createdAt: string;
}

interface CreatorPerformanceProjectData {
  snapshots: CreatorPerformanceSnapshot[];
}
```

指标字段均为可选非负整数，但 `metrics` 至少必须包含一项数值。`watchSeconds` 表示累计观看时长的秒数，不推导平均观看时长。`followers` 是录入时观测到的账号粉丝数，不是该视频新增粉丝数。所有时间使用 UTC ISO 8601 字符串。

快照创建后不可编辑，避免历史观察被无痕改写；录错时只能删除并重新创建。服务端生成 `id`、`projectId`、`source`、`createdAt`，客户端不得伪造这些字段。

## 持久化与 API

daemon 从 `RUNTIME_DATA_DIR` 派生项目级数据路径：

```text
creator-performance/<projectId>.json
```

写入使用同目录临时文件与 rename 原子替换。读取仅对 ENOENT、JSON 语法错误和整体结构非法降级为空集合；其他 I/O 错误必须传播。

```text
GET    /api/projects/:id/creator-performance-snapshots?releaseId=:releaseId
POST   /api/projects/:id/creator-performance-snapshots
DELETE /api/projects/:id/creator-performance-snapshots/:snapshotId
```

所有路由先确认项目存在。POST 的 `releaseId` 必须属于当前项目，且 release 状态必须为 `published`。路由不接受跨项目 ID。DELETE 只删除目标快照，不级联删除 release、Content、Media 或原始文件。

创建输入：

```ts
interface CreateCreatorPerformanceSnapshotRequest {
  releaseId: string;
  capturedAt?: string;
  metrics: CreatorPerformanceMetrics;
  note?: string;
}
```

`capturedAt` 缺省时由服务端写入当前 ISO 时间。`note` 去除首尾空白，空字符串不持久化。每个指标必须是安全整数且大于等于零；负数、小数、NaN、Infinity、未知字段以及空指标对象都返回 400。

## Web 交互

在现有 Release 编辑器增加 `Performance` 区域，不新增页面、路由或依赖。

- 仅 `published` release 显示录入表单；其他状态显示明确的只读提示，且不发创建请求。
- 表单含七个可选数值输入、可选 `capturedAt` datetime-local 输入和 `note` textarea。
- 保存后请求成功时刷新该 release 的快照列表并清空表单；失败时保留输入并在现有 `role="alert"` 错误区显示错误。
- 列表按 `capturedAt` 降序展示，显示指标与备注；对每条较新的快照显示与时间上紧邻的上一条快照相比的数值增量。缺少某项指标时不推导该项增量。
- 每条快照都有删除确认；取消时不发请求。
- 快照 API 单项目失败时显示 `Performance unavailable for this project.`，不得影响 Tasks、Media、Content 或 Release 面板。

增量只做相同指标的减法，不做百分比、平台归一化、质量评分、收入推算或推荐结论。

## 验收

1. 同一 published release 可创建多条快照，daemon 重启后完整恢复并按 capturedAt 倒序返回。
2. draft、ready、archived release 创建快照返回 400；跨项目或未知 release 返回 400。
3. 负数、小数、非安全整数、空 metrics、非法时间和伪造身份字段被拒绝或忽略，且不污染已有数据。
4. 删除一个快照只影响该快照，不影响 release、Content、Media 或其他快照。
5. Web 可保存、显示、删除快照及基础增量；失败时保留输入并显示可见错误。
6. 单项目 Performance API 失败只降级 Performance 区域。
7. 真实 CW-03 发布包可录入两条快照，重启后验证历史与增量；不得访问平台账号或用户原始素材。
