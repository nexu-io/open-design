# UI 用例库

这个目录是 UI 自动化场景的来源库。

## 目的

用例库把这三层拆开：

- 场景设计
- 自动化实现
- 测试素材和运行数据

这样 Playwright spec 不会慢慢变成一堆写死的 prompt 和一次性断言。

## 当前目录结构

- [index.ts](/Users/mac/open-design/open-design/e2e/cases/index.ts)：用例定义
- [types.ts](/Users/mac/open-design/open-design/e2e/cases/types.ts)：用例 schema
- [modules/project-and-generation.md](/Users/mac/open-design/open-design/e2e/cases/modules/project-and-generation.md)：项目创建与生成链路用例
- [modules/conversations.md](/Users/mac/open-design/open-design/e2e/cases/modules/conversations.md)：会话生命周期用例
- [modules/files.md](/Users/mac/open-design/open-design/e2e/cases/modules/files.md)：文件上传、mention、预览恢复用例
- [../reports/README.zh-CN.md](/Users/mac/open-design/open-design/e2e/reports/README.zh-CN.md)：测试结果与报告说明
- [../specs/app.spec.ts](/Users/mac/open-design/open-design/e2e/specs/app.spec.ts)：执行已自动化用例的 Playwright 入口

## Schema 说明

每条用例都是一个 `UICase`。

- `id`：稳定的用例标识，用于 spec 和测试报告
- `title`：人可读的用例名称
- `kind`：项目类型，比如 `prototype`、`deck`、`workspace`
- `flow`：Playwright 里对应的自动化流程分支
- `automated`：当前是否会被 `pnpm run test:ui` 执行
- `description`：覆盖目标和场景说明
- `create`：创建项目时要用到的输入
- `prompt`：主输入内容
- `secondaryPrompt`：多步骤流程里的后续输入
- `mockArtifact`：mock SSE 时预期生成的 artifact
- `notes`：实现细节或维护备注

## 当前支持的 Flow

- `standard`：创建项目，发送 prompt，校验生成 artifact
- `conversation-persistence`：创建多会话，刷新后恢复，再切换历史
- `file-mention`：预置文件后通过 `@` mention 选中并校验 staged attachment
- `deep-link-preview`：通过文件路由打开预览并校验恢复
- `file-upload-send`：走真实文件选择器，校验上传和发送
- `conversation-delete-recovery`：删除当前活跃会话后校验回退

## 文档拆分规则

- `README.zh-CN.md` 只保留总览、结构和维护规则
- 具体用例清单按模块拆到 `modules/` 目录
- 一个模块一个 Markdown，后面可以继续细分
- 当单个模块内容变长时，再继续按子模块拆分

## 新增用例的方式

1. 在 [index.ts](/Users/mac/open-design/open-design/e2e/cases/index.ts) 里新增一条 `UICase`。
2. 先把场景写进对应模块文档，如果只是设计阶段，保持 `automated: false`。
3. 能复用已有 `flow` 就优先复用。
4. 只有在确实需要新自动化路径时，才去 [types.ts](/Users/mac/open-design/open-design/e2e/cases/types.ts) 增加新的 `flow` 类型。
5. 在 [app.spec.ts](/Users/mac/open-design/open-design/e2e/specs/app.spec.ts) 里实现这个流程。
6. 用例稳定后，再把 `automated` 改成 `true`。

## 推荐工作流

1. 先用产品语言把场景写清楚。
2. 先决定它归哪个模块文档。
3. 判断它能不能归到已有的自动化 flow。
4. 只在确实需要的节点补 `data-testid`。
5. 优先 mock `/api/chat` 的 SSE，保证稳定性。
6. 项目创建、路由、持久化、文件 API 尽量走真实链路。

## 适合放进来的范围

适合：

- 项目创建主流程
- 生成与 artifact 预览流程
- 会话生命周期流程
- 文件上传、mention、重新打开流程
- deep link 和刷新恢复流程

不建议优先放：

- 纯视觉、容易抖的检查
- 模型质量评估
- 强依赖真实外部 agent CLI 的测试

## 运行方式

```bash
pnpm -C e2e test:ui
```

运行完成后会自动生成：

- `e2e/reports/latest.md`
- `e2e/reports/ui-test-report.html`
- `e2e/reports/playwright-html-report/`
- `e2e/reports/results.json`
- `e2e/reports/junit.xml`

运行开始前会自动清理旧的 e2e 运行时数据和上一次报告，避免：

- `.od-data` 里累积空 project 目录
- `e2e/reports/test-results` 混入旧失败截图
- 报告内容和本次执行结果不一致

如果要带界面调试：

```bash
pnpm run test:ui:headed
```
