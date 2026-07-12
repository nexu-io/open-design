# Creator 内容链设计（CW-02）

日期：2026-07-12  
状态：已确认，待实施计划

## 目标

让一个创作项目能够保留一条从选题、脚本大纲、分镜、素材关联到发布复盘的可追踪内容链。首版服务于个人摄影与视频创作者的手动工作流，不以自动生成内容替代创作判断。

## 调研依据

本次使用 `agent-reach` 的 GitHub 路由检索，体检结果为 GitHub `gh CLI` 可用。候选按 stars 排序；检索日期为 2026-07-12。

| 项目 | Stars | 观察到的模式 | 本项目采用 / 拒绝 |
| --- | ---: | --- | --- |
| [waooAI/waoowaoo](https://github.com/waooAI/waoowaoo) | 13,193 | 剧本分析、角色/场景、分镜、视频生成和异步任务分层；Next.js、Prisma、队列分离长任务。 | 采用脚本与分镜分层；拒绝队列、模型与生成工作流，首版只做手动内容链。 |
| [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) | 11,359 | 从策划、编剧、分镜到出片的生产链，剧本和素材节点可回溯。 | 采用阶段可回溯与内容实体边界；拒绝无限画布和 Agent 协作体系。 |
| [Forget-C/Jellyfish](https://github.com/Forget-C/Jellyfish) | 5,188 | script breakdown、shot preparation、资产候选确认、任务中心分层；镜头准备与生成状态分离。 | 采用分镜准备与素材关联独立；拒绝生成编排、角色/场景/道具一致性实体。 |
| [wonderunit/storyboarder](https://github.com/wonderunit/storyboarder) | 3,751 | 快速线性分镜，强调低复杂度、易修改和可导出。 | 采用紧凑纵向分镜列表；拒绝首版画布和绘图工具。 |

这些项目均说明内容结构、媒体资产和执行任务应是独立实体。CW-02 继续采用 CW-01 的资产 ID 关联，不把文件路径、媒体元数据或脚本正文复制进任务记录。

## 范围

一个内容项目（`CreatorContentProject`）属于一个 Open Design 项目，包含四个固定部分：

1. `brief`：选题、受众、核心表达和目标平台。
2. `outline`：开场、段落、结尾和剪辑意图。
3. `storyboardItems`：按 `position` 排序的镜头条目。
4. `retrospective`：发布日期、表现摘要、复盘结论和下一步。

每个分镜条目可关联多个 CW-01 `CreatorMediaAsset`。内容项目可关联多个 Creator 任务。任务、素材和内容只通过稳定 ID 关联。

首版不包含：AI 自动写稿/分镜、无限画布、绘图工具、视频播放器、系统文件打开、平台数据抓取、多人协作、角色/场景/道具模型、生成队列。

## 数据模型

```ts
type CreatorContentStatus = 'idea' | 'drafting' | 'production' | 'published' | 'archived';

interface CreatorContentBrief {
  topic?: string;
  audience?: string;
  coreMessage?: string;
  targetPlatform?: string;
}

interface CreatorContentOutline {
  opening?: string;
  sections?: string;
  ending?: string;
  editingIntent?: string;
}

interface CreatorStoryboardItem {
  id: string;
  position: number;
  purpose: string;
  visualDescription?: string;
  audioNotes?: string;
  mediaAssetIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface CreatorRetrospective {
  publishedAt?: string;
  performanceSummary?: string;
  learnings?: string;
  nextAction?: string;
}

interface CreatorContentProject {
  id: string;
  projectId: string;
  title: string;
  status: CreatorContentStatus;
  brief: CreatorContentBrief;
  outline: CreatorContentOutline;
  storyboardItems: CreatorStoryboardItem[];
  retrospective: CreatorRetrospective;
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

空对象允许表示尚未填写的部分；`title` 必填。`storyboardItems.position` 在项目内唯一，保存时按 position 升序输出。内容状态不由任务状态或发布字段自动推断，避免后台规则覆盖人工判断。

## 持久化与 API

daemon 在已解析的 `RUNTIME_DATA_DIR` 下按项目持久化内容数据，使用临时文件加 rename 的原子写法。Web 只通过 `@open-design/contracts` 和 HTTP 使用数据。

```text
GET    /api/projects/:id/creator-content
POST   /api/projects/:id/creator-content
PATCH  /api/projects/:id/creator-content/:contentId
DELETE /api/projects/:id/creator-content/:contentId

POST   /api/projects/:id/creator-content/:contentId/tasks
DELETE /api/projects/:id/creator-content/:contentId/tasks/:taskId

POST   /api/projects/:id/creator-content/:contentId/storyboard/:itemId/media-assets
DELETE /api/projects/:id/creator-content/:contentId/storyboard/:itemId/media-assets/:assetId
```

所有路由先验证项目存在。任务、内容、分镜和素材必须在同一项目；跨项目关联返回 400。删除内容项目只删除内容及其关联，不删除任务、素材或原始文件。素材缺失时既有分镜关联保留；新关联只允许 `availability=available` 的资产。

## Web 交互

Creator Workbench 增加独立的 `Content` 面板，不改变既有 Tasks、Activity 或 Media 面板的操作语义。

- 内容列表显示标题、状态、关联任务数、分镜数和缺失素材提示。
- 内容编辑按固定顺序显示 Brief、大纲、分镜和复盘，降低个人创作的决策成本。
- 分镜是紧凑纵向列表：新增、编辑、排序、关联/移除素材；不提供画布。
- 内容侧发起任务关联；任务侧只显示关联内容项目，首版不提供双向编辑。
- 保存失败保留当前输入并显示错误。删除内容项目必须二次确认。

## 验收

1. 可在一个项目中创建、编辑和删除内容项目；重启 daemon 后记录完整恢复。
2. 可完成一条 `brief → outline → 至少两个 storyboardItems → retrospective` 内容链。
3. 分镜可关联同项目的 CW-01 素材，缺失素材显示提示但关联不丢失；跨项目素材被拒绝。
4. 内容项目可关联同项目任务；跨项目任务被拒绝。
5. daemon 覆盖项目隔离、原子持久化、非法 ID、删除边界和关联约束；Web 覆盖创建、编辑、素材关联、缺失提示和删除确认。
6. 使用当前 CW-01 验收项目完成一条手动内容链，确认任务、素材和内容都可追溯。

## 实施顺序

1. contracts 和 daemon 存储/纯函数测试。
2. daemon 内容与关联路由测试。
3. Web `Content` 面板与页面测试。
4. 当前真实项目 dogfood 与回归验证。

