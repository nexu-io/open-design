# Creator Workbench 现状总结与路线图

更新：2026-07-11。本文覆盖 Creator Workbench 增量，不替代 Open Design 平台总路线图。

## 调研前置规则

任何用户可见能力、外部集成、存储模型、工作流或交付形态，在设计和实现前必须先使用 `agent-reach` 调研公开方案。GitHub 候选按 star 数量排序，高 star 方案具有更高参考权重，同时评估维护状态、许可证和与本仓库边界的适配度。调研结论必须写入计划或决策文档，禁止闭门造车。

本次 `agent-reach doctor --json` 在本机超时；按技能的 GitHub 零配置路径用 `gh` 获取了公开元数据、README 和根目录结构。后续调研仍先尝试体检并记录失败情况。

## 高星公开参考（检索日 2026-07-11）

| 项目 | Stars | 架构/功能模式 | 对本项目的采用结论 |
| --- | ---: | --- | --- |
| [Immich](https://github.com/immich-app/immich) | 107,277 | 独立照片视频资产域、服务端索引、Web/移动端、机器学习目录 | 素材必须是独立资产域，任务只保存关联 ID。 |
| [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | 73,624 | 文档、任务、协作工作区分层，本地优先 | 脚本、分镜、复盘应是可关联内容实体。 |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | 70,310 | 计划、知识库、画布的 workspace/block 模型，本地优先 | 内容和任务解耦，避免万能任务卡。 |
| [Memos](https://github.com/usememos/memos) | 61,473 | 快速捕获、轻量自托管、Markdown、REST/gRPC | 每日工作入口需要低摩擦 capture 和可迁移数据。 |
| [Plane](https://github.com/makeplane/plane) | 54,281 | issues、cycles、docs、triage 分域 | 任务筛选/归档/周期应逐步增加，不复制企业 PM 全套。 |
| [PhotoPrism](https://github.com/photoprism/photoprism) | 39,939 | 媒体索引、标签和组合筛选、AI 元数据 | 先定义稳定资产索引与筛选合同，再接任务。 |
| [Focalboard](https://github.com/mattermost-community/focalboard) | 26,280 | 个人桌面/服务端看板 | 看板只是可选视图；该仓库无人维护，不作为依赖。 |
| [Leantime](https://github.com/Leantime/leantime) | 10,261 | 面向个人的 My Work、目标、日历和任务分组 | 每日视图采用阻塞/本周/稍后等可执行分组。 |

低 star 参考：[Vikunja](https://github.com/go-vikunja/vikunja)，4,728 stars，强调用户拥有任务数据；只作为所有权模型补充。

**结论：** 采用任务、内容、资产分域；先建立关联 ID、时间线、筛选和资产索引，再做看板、AI 排程或协作。

## 已完成工作

### 核心模块

- 平台基础：Next.js Web、Express daemon、Electron/packaged 运行时、contracts、pnpm workspace、项目/会话/运行/自动化/插件基础。
- Creator 领域：`creator-domain`、`creator-events`、`creator-workflows`、`creator-ui` 与 Web adapter。
- 语义稳定性：焦点 reason/action key 与展示 label 分离；事件来源类型受限；路由策略集中为 typed policy。
- 真实任务数据：按项目独立持久化，临时文件加 rename 原子写，未知项目拒绝创建数据。
- 任务闭环：创建、编辑、阶段推进、阻塞原因、活动回写、完成归档、恢复、默认进行中/已完成/全部筛选。
- 展示约束：人工持久任务可编辑/推进/恢复；推导任务只读；阻塞原因直接显示在任务卡。

### 已修复问题

- 不再用标题或展示文案决定焦点动作/导航。
- 不再从标题猜测运行生命周期，非法事件来源被拒绝。
- 阻塞任务必须填写原因；恢复或推进后清除旧原因。
- 完成任务不再长期挤在默认队列，误完成可恢复。

## 已验证范围与遗留风险

最近实际通过：daemon 存储/路由 10 测试、creator-domain 17 测试、creator-ui 40 测试、Web creator adapter 27 测试；TasksView 定向覆盖创建、推进、编辑、阻塞、取消、只读、原因展示、归档和恢复；Web typecheck 与生产构建通过。

测试缺口：大型 `TasksView.page.test.tsx` 在 Windows 曾因残留 Vitest 子进程不稳定，新增场景以定向测试验证。桌面安装/启动、真实数据根、备份、升级尚未为 Creator Workbench 做端到端验收。

## 待办与优先级

| ID | 任务 | 优先级 | 负责人建议 | 依赖 | 验收标准 |
| --- | --- | --- | --- | --- | --- |
| CW-01 | 素材资产域与任务关联：扫描导入、资产 ID、基础元数据、缩略图/代理状态 | P0 | daemon + Web + 媒体负责人 | Immich/PhotoPrism 调研、数据根决策 | 真实目录导入 100 个媒体；任务可打开关联资产；隔离/幂等/失败恢复有测试。 |
| CW-02 | 内容实体：选题、脚本、分镜、剪辑大纲、发布复盘并与任务关联 | P0 | 工作流产品 + Web | CW-01 关联 ID | 一个项目从选题到复盘至少有一条可追踪内容链。 |
| CW-03 | 每日工作视图：今日、阻塞、本周、稍后，显示关联资产/内容 | P1 | Web + 工作流产品 | CW-01、CW-02 | 默认打开给出唯一下一步；真实项目一周使用可验证。 |
| CW-04 | 任务治理：删除/撤销、批量状态、长期归档、完成度 | P1 | daemon + Web | CW-03 使用反馈 | 破坏性操作可撤销或二次确认，历史可追溯。 |
| CW-05 | 真实视频 dogfood | P0 | 创作者本人 + QA | 贯穿 CW-01 至 CW-04 | 从素材到发布有完整记录，阻断问题形成修复清单。 |
| CW-06 | Windows 桌面交付验收：安装、启动、备份、升级、离线 | P0 | 桌面/发布 + QA | 数据格式稳定 | 干净机器安装、重启保留任务、备份/升级回归通过。 |
| CW-07 | 可观测性与发布门禁 | P1 | daemon + QA | CW-01 至 CW-06 | API 失败可定位；完整页面测试稳定；发布清单可复现。 |

## 计划与依赖

未收到明确 deadline。采用相对计划，T0 为本文确认日，单人全职估算：

| 里程碑 | 时间 | 交付 |
| --- | --- | --- |
| M0 | T0+1 天 | 每项功能的公开调研模板与引用规则。 |
| M1 | T0+2 周 | CW-01 素材资产域。 |
| M2 | T0+3 周 | CW-02 内容实体关联。 |
| M3 | T0+4 周 | CW-03 每日工作视图。 |
| M4 | T0+5 周 | CW-04 治理；CW-06 可并行。 |
| M5 | 贯穿 M1-M4 | CW-05 真实视频 dogfood。 |
| M6 | T0+6 周 | CW-07 发布门禁。 |

```text
M0 调研规则
 ├─ M1 素材资产 ─┬─ M2 内容实体 ─ M3 每日工作视图 ─ M4 治理
 │               └─ M5 真实视频 dogfood（持续）
 └─ M6 桌面验收（依赖数据格式稳定） ─ CW-07 发布门禁
```

**当前进度：** Creator 任务管理约 70%，个人创作者工作流约 40%，当前阶段只能称为内部 alpha。M1、M3、M5、CW-06 联合通过前，不应宣称可对外稳定交付。

**下一步：** 启动 CW-01 素材资产域与任务关联。这是把任务从文本清单变为能打开真实镜头和剪辑工作的入口的关键前置条件。
