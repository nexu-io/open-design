# 入口模块

## 覆盖范围

- 新建项目入口面板
- 入口标签切换与草稿保持
- Examples 示例库搜索、筛选、预览与导出
- 提示词模板创建路径
- 连接器入口与连接器 gate
- 资源驱动的项目创建 happy path

## 对应测试文件

- `e2e/ui/entry-configuration-flows.test.ts`
- `e2e/ui/entry-chrome-flows.test.ts`
- `e2e/ui/app.test.ts`
- `apps/web/tests/components/ExamplesTab.test.tsx`

## 已自动化

### 入口配置流

| ID | 场景 | 来源 |
| --- | --- | --- |
| ENTRY-001 | 提示词模板加载失败后重试，编辑后的模板正文会写入项目 metadata | `entry-configuration-flows.test.ts` |
| ENTRY-002 | live artifact 的空状态连接器 CTA 会跳转到受保护的 connector setup 路径 | `entry-configuration-flows.test.ts` |
| ENTRY-003 | connectors 入口支持搜索、空结果态，以及详情抽屉的键盘关闭 | `entry-configuration-flows.test.ts` |
| ENTRY-004 | 在 Settings 里保存 Composio key 后，Entry 页 connectors gate 会立即解锁，搜索和卡片可直接使用 | `entry-configuration-flows.test.ts` |
| ENTRY-005 | 创建原型时切换到 `Wireframe` 后，即使先切到其他项目类型再切回，`fidelity` 选择也会保留，并正确写入创建 payload | `NewProjectPanel.test.tsx` |
| ENTRY-006 | 创建原型时在 design system 多选模式下切回 `不指定 — 自由发挥`，会清空主设计体系和 inspiration metadata | `NewProjectPanel.test.tsx` |
| ENTRY-007 | 创建原型时若项目名为空白，会回退到自动生成的默认标题而不是提交空名 | `NewProjectPanel.test.tsx` |
| ENTRY-008 | 创建实时制品时会把 `kind=prototype`、`intent=live-artifact` 和当前 `fidelity` 一并写入创建 payload | `NewProjectPanel.test.tsx` |
| ENTRY-009 | 创建幻灯片时，开启 `Use speaker notes` 会把 `speakerNotes=true` 写入创建 metadata | `NewProjectPanel.test.tsx` |
| ENTRY-010 | 从模板创建在没有用户模板时不会误触发创建；有模板时会带上 `templateId/templateLabel` 正常提交 | `NewProjectPanel.test.tsx` |
| ENTRY-011 | 创建图片项目时，所选 `aspect` 与修剪后的 `style notes` 会正确写入创建 payload | `NewProjectPanel.test.tsx` |
| ENTRY-012 | 创建视频项目时，所选 `aspect` 与 `duration` 会正确写入创建 payload | `NewProjectPanel.test.tsx` |
| ENTRY-013 | 创建音频项目时，所选 `duration` 与修剪后的 `voice` 会正确写入创建 payload | `NewProjectPanel.test.tsx` |
| ENTRY-014 | 顶部 settings menu 可以切换 pet rail 的显示/隐藏 | `entry-chrome-flows.test.ts` |
| ENTRY-015 | 紧凑桌面宽度下，入口页 header 与整页不会出现明显横向溢出 | `entry-chrome-flows.test.ts` |
| ENTRY-016 | Examples 示例库为空时展示 daemon/catalog 不可用提示 | `ExamplesTab.test.tsx` |
| ENTRY-017 | Examples 搜索支持按名称、描述、prompt 命中，并在无匹配时展示空结果态 | `ExamplesTab.test.tsx` |
| ENTRY-018 | Examples 支持按 Surface、Type、Scenario 筛选并正确收敛卡片列表 | `ExamplesTab.test.tsx` |
| ENTRY-019 | 点击 Examples 卡片的 `Use this prompt` 会把选中的 skill 传给创建快路径 | `ExamplesTab.test.tsx` |
| ENTRY-020 | Examples 预览按需加载后，Share 菜单可触发 PDF、ZIP、HTML 导出 | `ExamplesTab.test.tsx` |
| ENTRY-021 | Examples 全屏预览弹窗支持 Fullscreen/ESC 退出/Exit、Share 导出 PDF/ZIP/HTML、Open in new tab 和关闭 | `ExamplesTab.test.tsx` |

### 资源驱动创建场景

| ID | 场景 | 来源 |
| --- | --- | --- |
| ENTRY-101 | Prototype 项目可以创建并预览生成的 artifact | `app.test.ts` via `prototype-basic` |
| ENTRY-102 | Deck 项目可以创建并预览生成的 deck artifact | `app.test.ts` via `deck-basic` |
| ENTRY-103 | 选择 design system 后，创建项目时会正确带入配置 | `app.test.ts` via `design-system-selection` |
| ENTRY-104 | 使用 example prompt 可以直接创建带有预填草稿提示词的项目 | `app.test.ts` via `example-use-prompt` |

## 自动化候选

| ID | 场景 | 原因 |
| --- | --- | --- |
| ENTRY-C01 | 更多 image template / video template 的入口创建流 | 业务有价值，但当前入口覆盖仍以主路径为主，可在模板能力稳定后补进自动化 |

## 手工保留

| ID | 场景 | 原因 |
| --- | --- | --- |
| ENTRY-M01 | 入口页视觉风格是否符合品牌预期 | 依赖主观视觉判断，不适合做稳定自动化断言 |
| ENTRY-M02 | 入口页动效、过渡、微交互是否自然 | 更适合人工体验验收，自动化收益较低 |

## 说明

- `app.test.ts` 的部分场景来自 `e2e/resources/playwright.ts`。新增资源驱动用例时，需要同时更新资源文件和这份文档。
- 依赖 mocked SSE 的入口流程应尽量保持稳定、可重复、执行快。
