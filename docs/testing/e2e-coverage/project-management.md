# 项目管理模块

## 覆盖范围

- 首页项目卡片
- 首页搜索与视图切换
- 创建设计时的 design system 选择
- 项目重命名持久化
- 设计文件删除与首页删除流程
- 首页入口的宠物自定义

## 对应测试文件

- `e2e/ui/project-management-flows.test.ts`

## 已自动化

| ID | 场景 | 来源 |
| --- | --- | --- |
| PM-001 | Prototype、live artifact、deck、image 标签切换正确，且草稿内容会保留 | `project-management-flows.test.ts` |
| PM-002 | 多选 design system 时，会正确保存主系统和 inspiration metadata | `project-management-flows.test.ts` |
| PM-003 | 单选 design system 时，搜索后可以切换目标系统 | `project-management-flows.test.ts` |
| PM-004 | 项目标题重命名后刷新仍保留，空白标题不会覆盖原值 | `project-management-flows.test.ts` |
| PM-005 | 取消删除 design file 时，文件行和已打开标签都会保留 | `project-management-flows.test.ts` |
| PM-006 | 首页 design 卡片删除同时覆盖取消和确认两种路径 | `project-management-flows.test.ts` |
| PM-007 | 首页 designs 视图支持 grid/kanban 切换，并在刷新后保持 | `project-management-flows.test.ts` |
| PM-008 | 首页搜索会过滤项目卡片，并支持从无结果态恢复 | `project-management-flows.test.ts` |
| PM-009 | Change pet 可以打开宠物设置，并保存自定义 companion | `project-management-flows.test.ts` |

## 自动化候选

| ID | 场景 | 原因 |
| --- | --- | --- |
| PM-C02 | 更多 design system 筛选、排序或分类行为 | 价值明确，但要等产品侧交互稳定后再固化断言 |

## 手工保留

| ID | 场景 | 原因 |
| --- | --- | --- |
| PM-M01 | 宠物形象、表情、交互是否“自然/有趣” | 强主观体验项，不适合自动化 |
| PM-M02 | 首页卡片视觉密度、布局观感是否舒适 | 更适合人工视觉验收 |

## 说明

- 首页/项目管理相关场景集中在一个 Playwright 文件里，是因为它们共用相似的项目初始化生命周期。
- design system 相关覆盖同时验证了 metadata 持久化和 picker 搜索行为。
