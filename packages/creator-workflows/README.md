# @open-design/creator-workflows

声明式工作流模板与编排定义包。只负责模板结构、轻量守卫、纯函数构造器与归一化逻辑。

## 当前包含的内容

- `WorkflowTriggerSpec`
- `WorkflowTransitionSpec`
- `WorkflowDefinition`
- 轻量守卫
- 纯函数构造器
- 归一化函数

## 依赖关系

- 复用 `@open-design/creator-domain` 中的 `WorkflowTemplate`、`TaskStage`
- 复用 `@open-design/creator-events` 中的 `CreatorEventType`

## 明确不包含的内容

- 执行引擎
- daemon 编排逻辑
- 网络请求
- UI 展示逻辑
