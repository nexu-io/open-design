# CW-01 Creator Media 素材资产域调研

检索日期：2026-07-11（GitHub `gh` CLI，经 `agent-reach` GitHub 路由）

## 参考项目（按 star 数排序）

| 项目 | Stars | 最近推送 | 许可证 | 架构 / 产品模式 | 来源 |
| --- | ---: | --- | --- | --- | --- |
| [immich-app/immich](https://github.com/immich-app/immich) | 107,282 | 2026-07-11 | AGPL-3.0 | TypeScript 的自托管照片/视频管理；Web 与移动端共享服务端，资产上传、浏览、去重和相册是主要用户路径。 | [README](https://github.com/immich-app/immich#readme) |
| [DSpace/DSpace](https://github.com/DSpace/DSpace) | 1,083 | 2026-07-11 | BSD-3-Clause | Java 后端提供 REST API，Angular 前端独立消费契约；数字资源以持久化仓储方式管理。 | [README](https://github.com/DSpace/DSpace#readme) |
| [nebulabroadcast/nebula](https://github.com/nebulabroadcast/nebula) | 309 | 2026-06-29 | GPL-3.0 | Python 服务端 + React 前端 + 独立 worker；媒体资产目录与低清预览、技术元数据和处理队列相邻。 | [README](https://github.com/nebulabroadcast/nebula#readme) |
| [alchemy-fr/Phraseanet](https://github.com/alchemy-fr/Phraseanet) | 270 | 2026-07-10 | GPL-3.0 | PHP DAM，REST API 与 Elasticsearch 支撑检索；GUI 按生产、管理、报告、审核等工作流分区。 | [README](https://github.com/alchemy-fr/Phraseanet#readme) |
| [zidage/AlcedoStudio](https://github.com/zidage/AlcedoStudio) | 156 | 2026-07-10 | GPL-3.0 | C++ 原生、本地优先的照片库；目录树、缩略图网格、筛选和 AI 标签组合成库浏览工作区。 | [README](https://github.com/zidage/AlcedoStudio#readme) |

## 对 CW-01 的采用结论

- 保留项目边界：面板只读消费既有 `GET /api/projects/:id/creator-media-assets`，与 daemon 已有的 `CreatorMediaProjectData` 契约对齐，不复制扫描或存储逻辑到 Web。
- 采用“当前项目上下文中的列表”模式：显示 `fileName`、`kind`、`relativePath` 和可用性/missing 状态，类似 DAM 的目录浏览入口，但不提前引入缩略图、搜索、批量操作或编辑。
- 采用单项目失败隔离：每个项目请求独立捕获错误，某个项目资产接口失败时保留 Creator workbench 的任务、活动和工作流，资产面板显示降级状态。
- 保持当前任务编辑流不变：资产状态只通过独立 React state 进入只读渲染，不参与任务创建、编辑、推进、恢复或活动写回。

## 不采用的方案

- 不照搬 Immich / AlcedoStudio 的缩略图网格、全文检索、AI 标签和相册模型；CW-01 当前只需要验证资产索引已接入工作台。
- 不照搬 Nebula / Phraseanet 的预览、转码、权限、审核和复杂元数据流程；这些能力会扩大本次变更的 API、状态和交互边界。
- 不把 DSpace 的长期仓储、独立前后端部署或持久化资源模型引入 Web；本仓库已经有 daemon 路由和 contracts，新增客户端抽象没有必要。

## 设计约束

生产实现仅修改 `apps/web/src/components/TasksView.tsx`，沿用现有 Creator 面板样式和项目选择逻辑。测试覆盖 GET mock、成功展示、missing 状态和项目级失败降级；任务编辑生产逻辑保持不变。

## 关联管理补充（2026-07-11）

- 通过 `agent-reach` 的 GitHub 路由检索 `media asset task workflow` 与 `digital asset management task association`，均未返回可直接参考的仓库；这是检索失败，不以无结果虚构新的外部架构。
- 沿用上述 Immich、PhotoPrism、AppFlowy 与 AFFiNE 的共同边界：资产保持项目内独立实体，任务只维护关联，不把素材字段复制进任务。
- 本轮只在既有 `taskLinks` 上做 HTTP 关联管理：编辑任务时展示已关联资产；候选项限制为该任务项目内、未关联且 `availability=available` 的资产；missing 资产只读保留在已关联列表中。
- 不采用预览、文件打开、上传、移动或跨项目选择；这些会突破既有 Web HTTP 边界和 CW-01 首版范围。

## 后端收口补充（2026-07-12）

- `agent-reach doctor --json` 本机超时，按技能规定使用 `gh search repos` 的 GitHub
  零配置路径；按 stars 检索到的结果没有比既有 Immich、PhotoPrism 更适合本地索引
  重扫语义的高星实现，因此不引入新的外部存储架构。
- 采用根目录级扫描游标：`roots` 独立记录 `rootPath`、`addedAt` 和
  `lastScannedAt`；资产仍是独立实体，任务关联保持独立。
- 只有扫描没有错误时，才把该 rootPath 本轮未发现的旧资产标记为 `missing`；扫描
  发生错误时保留原可用状态，避免不可读子目录造成误判。历史 `taskLinks` 永不因
  missing 被删除。
