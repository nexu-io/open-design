# E2E 用例库

这个目录用于维护当前自动化测试覆盖的 QA 用例文档，主要索引 `e2e/` 套件，并在必要处补充与同一用户流直接相关的 `apps/web` 组件测试。

## 文档范围

- 优先记录已经存在于 `e2e/` 下的自动化覆盖；当某个用户流主要由 `apps/web` 组件测试保护时，也会一并注明。
- 以用户视角描述场景，不展开实现细节。
- 新增测试文件或新增重要场景时，同步更新对应模块文档。
- 插件系统总验收维护在 [`../plugin-system-test-suite.md`](../plugin-system-test-suite.md)；Registry / CLI / daemon 跨层用例另见 [`../plugin-registry-eval-cases.md`](../plugin-registry-eval-cases.md)。

## 模块索引

| 模块 | 覆盖重点 | 对应测试文件 |
| --- | --- | --- |
| [entry.md](./entry.md) | 入口页创建路径、连接器入口、提示词模板、资源驱动场景、顶部 chrome | `e2e/ui/app.test.ts`, `e2e/ui/entry-configuration-flows.test.ts`, `e2e/ui/entry-chrome-flows.test.ts` |
| [project-management.md](./project-management.md) | 首页/项目管理、设计系统、项目重命名、删除流程、搜索与视图切换 | `e2e/ui/project-management-flows.test.ts` |
| [workspace.md](./workspace.md) | 工作区标签、会话、文件流、快速切换器、手动编辑模式 | `e2e/ui/app.test.ts`, `e2e/ui/workspace-keyboard-flows.test.ts` |
| [settings.md](./settings.md) | API protocol 回归、国际化内容完整性、关键设置表单行为、Orbit 设置 | `e2e/ui/settings-api-protocol.test.ts`, `e2e/tests/localized-content.test.ts`, `apps/web/tests/components/SettingsDialog.execution.test.tsx`, `apps/web/tests/components/SettingsDialog.orbit.test.tsx` |
| [desktop.md](./desktop.md) | mac 桌面端 smoke 覆盖、打包产物运行时 smoke | `e2e/specs/mac.spec.ts` |

## 维护规则

1. 新增用例时，优先补到最接近的模块文档里，不再维护一个超大的总表。
2. 每个场景尽量保持一行，方便 QA 在 PR review 里快速看差异。
3. 如果某个场景依赖环境变量、默认跳过，必须在模块文档中明确标注。
4. 如果测试被删除、重命名或迁移，文档需要在同一个 PR 里同步更新。

## 用例分类标准

### 已自动化

- 已经有稳定的自动化实现。
- 需要写明对应测试文件。
- 如果依赖特殊 gate，例如环境变量，也要一并标注。

### 自动化候选

- 业务价值明确，未来适合进入自动化。
- 但当前可能受限于环境、成本、稳定性或外部依赖。
- 建议补一行原因，方便后续判断何时转自动化。

### 手工保留

- 更适合人工验收，不建议短期纳入主自动化套件。
- 常见于主观体验、视觉质感、复杂真实授权、多设备协作等场景。
- 也建议补一行原因，避免以后重复讨论。

## 当前套件结构

- `e2e/ui/*.test.ts`：面向浏览器 UI 的 Playwright 回归测试。
- `e2e/specs/*.spec.ts`：运行时与平台级 smoke 测试。
- `e2e/tests/*.test.ts`：轻量 Vitest 完整性校验。
- `e2e/lib/**`：仅放 helper，不放可执行用例入口。
