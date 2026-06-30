# Creator Workbench 业务骨架 — 结构说明 v1

> 冻结时间：2026-06-29
> 状态：空骨架，无业务实现

## 新增目录总览

```
Creator-Workbench-Next/
├── packages/
│   ├── creator-domain/       # 核心领域对象
│   ├── creator-events/       # 事件流与回写链
│   ├── creator-workflows/    # 工作流模板与编排
│   └── creator-ui/           # 创作者业务 UI 组件
├── plugins/
│   ├── topic-planning/       # 选题能力插件
│   ├── material-match/        # 素材匹配插件
│   ├── editing-prep/          # 剪辑准备插件
│   ├── release-check/         # 发布检查插件
│   └── review-loop/           # 复盘回路插件
└── docs/migration/            # 迁移文档
```

## 目录职责

### packages/creator-domain
核心领域对象定义。Project、Task、ActivityEvent、Runback、TriggerSource 等类型定义和不变规则。后续 Task 3+ 在此落地实体关系。

### packages/creator-events
事件流、活动流、回写链的定义与转换逻辑。不包含 daemon 实现，仅定义事件 schema 和纯函数转换。

### packages/creator-workflows
工作流模板、能力编排定义。以声明式配置描述"选题 → 素材 → 剪辑 → 发布 → 复盘"链路，不含执行引擎。

### packages/creator-ui
创作者业务 UI 组件或展示 helper。后续随 web 端迁移逐步填充，当前为空骨架。

### plugins/topic-planning
选题相关能力插件。负责接收 brief、生成选题方向、关联素材线索。

### plugins/material-match
素材匹配/整理相关能力插件。负责将素材与选题关联、生成整理建议。

### plugins/editing-prep
剪辑准备相关能力插件。输出剪辑清单、镜头顺序建议、旁白稿。

### plugins/release-check
发布检查相关能力插件。发布前 checklist 校验、格式合规检查。

### plugins/review-loop
复盘与回路相关能力插件。复盘数据采集、效果回写、模板迭代。

### docs/migration
迁移文档存放目录。阶段说明、API 映射、数据迁移方案、回滚策略。

## 为什么先建空骨架

1. **接口先行**：目录命名和职责边界固定后，后续迁移各阶段可以并行填充，不会出现"先写代码再定位置"的混乱。
2. **最小入侵**：不触碰 open-design 原有目录结构，所有新增内容落在独立命名空间（`creator-*` 前缀）。
3. **可追溯**：空骨架 + 占位文件让任何进入仓库的人一眼看到业务扩展的预期位置。

## 后续填充阶段

| 阶段 | 填充目录 |
|------|---------|
| Task 3+ | packages/creator-domain — 实体定义 |
| Task 4+ | packages/creator-events — 事件 schema |
| Task 5+ | packages/creator-workflows — 编排模板 |
| Task 6+ | plugins/* — 各插件 SKILL.md + 骨架 |
| 随 web 迁移 | packages/creator-ui — UI 组件 |
