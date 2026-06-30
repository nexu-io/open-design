# @open-design/creator-domain

核心领域对象定义包。只含类型定义、类型守卫和纯函数工厂，不含持久化、不含 UI、不含执行引擎。

## 当前包含的对象

| 类型 | 说明 |
|------|------|
| `TriggerSource` | 触发源对象 `{ sourceBlock: string, sourceTitle?: string }` |
| `Project` | 创作者项目 |
| `Task` | 项目内的任务单元 |
| `ActivityEvent` | 活动流事件 |
| `RunSession` | 一次 Agent 执行会话 |
| `Runback` | 执行回滚记录 |
| `WorkflowTemplate` | 工作流模板 |
| `TaskStage` | 任务阶段 `topic / material / editing / release / review` |
| `TaskStatus` | 任务状态 `todo / ready / blocked / done` |
| `ActivityCategory` | 活动分类 `topic / material / editing / release / review` |

## 明确不包含的内容

- 数据库访问或持久化逻辑
- UI 组件或渲染代码
- daemon / web / desktop 运行逻辑
- 网络请求或文件 I/O

## 使用方式

```ts
import { createTask, isTaskStage, isTriggerSource } from "@open-design/creator-domain";

const task = createTask({ id: "t-1", projectId: "p-1", title: "Draft script" });
const source = { sourceBlock: "manual" };
if (isTriggerSource(source)) { /* ... */ }
```
