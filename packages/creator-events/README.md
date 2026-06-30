# @open-design/creator-events

事件 schema、轻量守卫、纯函数构造器与归一化逻辑包。只负责事件类型层，不含执行层。

## 当前包含的事件类型

- `task.created`
- `task.updated`
- `activity.recorded`
- `run.started`
- `run.finished`
- `runback.recorded`

## 当前包含的能力

- 事件 envelope 与 payload 类型
- 轻量事件守卫
- 纯函数事件构造器
- `normalizeCreatorEvent(input)` 归一化入口

## 明确不包含的内容

- 事件总线
- 事件存储
- daemon 执行逻辑
- UI 展示逻辑
