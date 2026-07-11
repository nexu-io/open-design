# Creator 素材资产域设计

## 目标

为每个创作项目建立本地素材资产索引，并让人工任务通过多对多关联指向真实图片和视频，而不是依赖标题或文件夹路径文本。

## 调研依据

- [Immich](https://github.com/immich-app/immich)，107,277 stars（2026-07-11）：controllers、dtos、repositories、services、workers 分层；资产域与机器学习、客户端分离。采用其“资产是独立实体”的边界，不复制其服务规模或代码。
- [PhotoPrism](https://github.com/photoprism/photoprism)，39,939 stars：`internal/entity`、`meta`、`thumb`、`workers` 分域，媒体索引和组合筛选先于工作流关联。采用“索引和预览状态独立”的模式。
- [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy)，73,624 stars；[AFFiNE](https://github.com/toeverything/AFFiNE)，70,310 stars：内容、计划和工作区分层。采用关联实体，不把资产字段塞进任务。
- [Memos](https://github.com/usememos/memos)，61,473 stars：本地所有权、低摩擦使用和可迁移数据。采用只索引用户目录、默认不复制原文件。

## 范围

- 用户选择本地根文件夹；daemon 递归扫描图片和视频。
- 不复制、移动、转码、删除原始文件；资产只保留原路径和元数据。
- 项目内资产与人工任务可多对多关联。
- 读取文件名、路径、扩展名、大小、修改时间、可用状态；尽力读取拍摄时间，无法读取时为空。
- 缩略图作为异步派生状态：首版可为 `pending`、`ready`、`failed` 或 `unavailable`，不阻塞索引完成。
- 路径失效时资产标记 `missing`，历史任务关联保留。

非目标：音频、云同步、AI 自动标签、素材复制、代理/转码、编辑软件工程解析、全库去重、多人协作。

## 数据合同

```ts
type CreatorMediaKind = 'image' | 'video';
type CreatorMediaAvailability = 'available' | 'missing';
type CreatorThumbnailStatus = 'pending' | 'ready' | 'failed' | 'unavailable';

interface CreatorMediaAsset {
  id: string;
  projectId: string;
  rootPath: string;
  sourcePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  kind: CreatorMediaKind;
  sizeBytes: number;
  modifiedAt: string;
  capturedAt?: string;
  availability: CreatorMediaAvailability;
  thumbnailStatus: CreatorThumbnailStatus;
  createdAt: string;
  updatedAt: string;
}

interface CreatorTaskMediaLink {
  taskId: string;
  assetId: string;
  createdAt: string;
}
```

资产 ID 不由绝对路径直接派生。扫描幂等键为同项目下的规范化 `sourcePath`；相同路径且 `sizeBytes`、`modifiedAt` 未变化时不更新，发生变化时更新同一资产记录。每个项目可有多个 rootPath。

## 存储与 API

在 daemon 已解析的 `RUNTIME_DATA_DIR` 下按项目保存 Creator 媒体数据，使用临时文件加 rename 原子写。Web 只通过 contracts 和 HTTP 使用它。

首版路由：

- `GET /api/projects/:id/creator-media-assets`
- `POST /api/projects/:id/creator-media-roots`，请求 `{ rootPath }`，触发扫描并返回扫描概要。
- `POST /api/projects/:id/creator-tasks/:taskId/media-assets`，请求 `{ assetId }`。
- `DELETE /api/projects/:id/creator-tasks/:taskId/media-assets/:assetId`。

每条路由必须先验证项目存在；关联时验证任务和资产都属于同一项目。路径必须是绝对路径、存在且目录可读取；不允许 daemon 通过该 API 写入、移动或删除用户文件。

## 扫描与缩略图

扫描器只接受允许的图片/视频扩展名，跳过隐藏/系统目录、符号链接循环和不可读文件。扫描结果分为 `discovered`、`unchanged`、`missing`、`skipped`、`errors`。

首版将缩略图状态初始化为 `unavailable`，不实现缩略图生成器；该字段保留为下个阶段的兼容合同。这样先完成可用的文件定位和任务关联，避免把媒体处理队列作为首个阻断。

## Web 首版

Creator Workbench 新增素材面板：显示项目选择、已索引资产的名称、类型、路径、可用状态和任务关联数。任务卡显示关联素材数量，编辑区可打开关联管理器，支持添加/移除关联。点击资产调用现有安全文件打开/预览能力；若运行时没有可用打开能力，显示路径并不伪造成功。

## 验收标准

1. 一个项目可扫描真实本地目录中的图片和视频，重复扫描不重复创建资产。
2. 文件修改更新资产，文件缺失标记为 `missing` 且不丢失任务关联。
3. 同项目任务与素材支持双向多对多；跨项目关联被拒绝。
4. API、存储、路径校验和 Web 交互有自动化测试。
5. 100 个混合图片/视频的目录可完成扫描，扫描结果可解释，原文件字节和目录结构不被修改。
6. Windows 的路径、不可读目录和重启后持久化有明确验收。
