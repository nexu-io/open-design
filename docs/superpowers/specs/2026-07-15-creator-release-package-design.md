# Creator 发布交付包设计（CW-03）

日期：2026-07-15
状态：已确认，待实施计划

## 目标

让创作者在发布前将标题、简介、标签、封面、平台、计划时间、人工检查和发布链接保存为可导出的交付包。首版服务于手动发布：系统帮助准备与核验，不代替用户登录平台、上传视频或点击发布。

## 调研依据

本次通过 `agent-reach` 使用 GitHub CLI 和 Exa 进行公开检索，按 Star 由高到低加权。检索日期为 2026-07-15。

| 项目 | Stars | 观察到的模式 | 本项目采用 / 拒绝 |
| --- | ---: | --- | --- |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | 196,492 | 自动化步骤有清晰状态、人工批准和可观察运行记录。 | 采用显式检查项和人工发布确认；拒绝自动登录、自动上传、连接器编排。 |
| [makeplane/plane](https://github.com/makeplane/plane) | 54,490 | 工作项、模块、文档和分析独立建模，通过关联组织。 | 采用内容项目与发布包独立实体；拒绝通用看板、周期和团队协作系统。 |
| [mifi/lossless-cut](https://github.com/mifi/lossless-cut) | 42,087 | 本地媒体工具聚焦单一剪辑责任，不承担内容运营。 | 发布包只记录导出/封面素材 ID，不重做播放器或非编剪辑器。 |
| [waooAI/waoowaoo](https://github.com/waooAI/waoowaoo) | 13,227 | 剧本、分镜和下游交付分层。 | 采用阶段交付边界；拒绝模型供应商、异步生成队列。 |
| [Forget-C/Jellyfish](https://github.com/Forget-C/Jellyfish) | 5,327 | 分镜准备、候选确认和任务跟踪分离。 | 采用发布前检查状态；拒绝角色、场景、生成任务体系。 |

## 范围与边界

一个 `CreatorReleasePackage` 属于一个 Open Design 项目，并关联一个 CW-02 `CreatorContentProject`。同一内容可有多个交付包，以支持 B 站首发、其他平台改编或重新发布。

每个交付包保存平台、标题、简介、标签、封面/导出素材 ID、计划/实际发布时间、发布 URL、固定人工检查项及状态。首版不包含平台账号授权、自动上传/发布、平台数据抓取、封面生成、播放器、剪辑时间线、排期日历、协作审批、AI 自动文案或第三方连接器。

## 数据模型

```ts
type CreatorReleasePlatform = 'bilibili' | 'youtube' | 'xiaohongshu' | 'other';
type CreatorReleaseStatus = 'draft' | 'ready' | 'published' | 'archived';

interface CreatorReleaseChecklist {
  contentComplete: boolean;
  exportConfirmed: boolean;
  coverConfirmed: boolean;
  metadataConfirmed: boolean;
  platformConfirmed: boolean;
}

interface CreatorReleasePackage {
  id: string;
  projectId: string;
  contentId: string;
  platform: CreatorReleasePlatform;
  status: CreatorReleaseStatus;
  title: string;
  description: string;
  tags: string[];
  coverAssetId?: string;
  exportAssetId?: string;
  scheduledAt?: string;
  publishedAt?: string;
  publishedUrl?: string;
  checklist: CreatorReleaseChecklist;
  createdAt: string;
  updatedAt: string;
}
```

标题去除空白后必须非空；标签去空白、去重、最多 20 个；URL 必须为 `http:` 或 `https:`；时间使用 ISO 8601。`ready` 不自动推断，用户必须明确切换；`published` 不代表系统向平台执行写操作。

## 持久化、API 与一致性

daemon 在 `RUNTIME_DATA_DIR` 下按项目持久化 `creator-release/<projectId>.json`，以临时文件和 `rename` 原子写入。发布包仅通过 `contentId`、`coverAssetId`、`exportAssetId` 关联现有实体，不复制文件或媒体元数据。

```text
GET    /api/projects/:id/creator-release-packages
POST   /api/projects/:id/creator-release-packages
PATCH  /api/projects/:id/creator-release-packages/:releaseId
DELETE /api/projects/:id/creator-release-packages/:releaseId
GET    /api/projects/:id/creator-release-packages/:releaseId/export
```

所有路由先验证项目存在。内容、封面、导出素材必须属于当前项目；新引用素材必须为 `available`。后续变为 `missing` 的既有引用保留并标记 Missing。删除发布包不得删除内容、任务、素材或原始文件。

`ready` 或 `published` 需要五个检查项均完成；`published` 额外要求合法 `publishedAt` 和 `publishedUrl`。export 返回确定性 JSON；Web 同时提供由同一状态生成的 Markdown 下载。

## Web 交互与验收

Creator Workbench 增加独立 `Release` 面板，不改变 Tasks、Media 或 Content 编辑语义。列表显示平台、状态、标题、内容项目、计划时间、检查完成度及缺失素材提示；编辑器显示元数据、素材引用、检查表与发布信息。请求失败保留输入并显示错误；删除必须二次确认。

验收：

1. 同一内容可创建两个不同平台包，daemon 重启后完整恢复。
2. 跨项目 content/media ID、missing 新素材、空标题、非法 URL/状态均返回 400。
3. missing 既有引用在列表、编辑器和导出中保留并标记。
4. `ready`/`published` 门禁不可绕过，系统不执行平台写操作。
5. JSON 和 Markdown 导出包含元数据、检查表、素材引用及缺失状态。
6. 真实 CW-01/CW-02 项目可完成一个 B 站发布交付包并重启读取。
