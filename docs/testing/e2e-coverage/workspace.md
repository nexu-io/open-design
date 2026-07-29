# 工作区模块

## 覆盖范围

- 项目工作区内的会话与文件流
- Design Files 上传、删除、标签持久化
- Quick switcher 键盘行为
- 聊天面板宽度持久化
- 手动编辑模式回归

## 对应测试文件

- `e2e/ui/app.test.ts`
- `e2e/ui/workspace-keyboard-flows.test.ts`

## 已自动化

### 资源驱动工作区场景

| ID | 场景 | 来源 |
| --- | --- | --- |
| WS-001 | 会话历史在刷新和线程切换后仍能保留 | `app.test.ts` via `conversation-persistence` |
| WS-002 | 上传文件后可以在聊天中通过 mention 再次引用发送给 agent | `app.test.ts` via `file-mention` |
| WS-003 | 通过文件深链接进入项目时，可以恢复到正确的预览标签 | `app.test.ts` via `deep-link-preview` |
| WS-004 | 通过 composer 文件选择器上传文件，并随 prompt 一起发送 | `app.test.ts` via `file-upload-send` |
| WS-005 | Design Files 上传图片后，会在工作区打开并可预览 | `app.test.ts` via `design-files-upload` |
| WS-006 | Design Files 删除上传文件后，列表和打开标签都会清理 | `app.test.ts` via `design-files-delete` |
| WS-007 | 已打开的文件标签在刷新后仍会恢复，并保持正确激活项 | `app.test.ts` via `design-files-tab-persistence` |
| WS-008 | 删除当前活跃会话后，界面会自动回退到剩余线程 | `app.test.ts` via `conversation-delete-recovery` |
| WS-009 | Question form 的多选题会正确限制最大选择数量 | `app.test.ts` via `question-form-selection-limit` |
| WS-010 | Question form 的回答会进入聊天历史，并在刷新后保持锁定态 | `app.test.ts` via `question-form-submit-persistence` |
| WS-011 | 在没有新 prompt 的情况下，刷新或空闲不会额外生成新文件 | `app.test.ts` via `generation-does-not-create-extra-file` |
| WS-012 | 预览评论可以附加到聊天中，并以结构化上下文发送 | `app.test.ts` via `comment-attachment-flow` |
| WS-013 | daemon 发送失败后，错误详情仍然可见，便于重试和排查 | `app.test.ts` direct test |
| WS-014 | 手动编辑模式支持内容、样式、源码 patch，以及 undo/redo | `app.test.ts` direct test |
| WS-015 | deck 形态 HTML 在手动编辑模式下仍保留 deck 导航能力 | `app.test.ts` direct test |

### 键盘优先工作区流

| ID | 场景 | 来源 |
| --- | --- | --- |
| WS-101 | Quick switcher 可通过键盘打开，并激活目标文件 | `workspace-keyboard-flows.test.ts` |
| WS-102 | Quick switcher 搜索无匹配时，不会改变当前文件 | `workspace-keyboard-flows.test.ts` |
| WS-103 | Quick switcher 支持方向键移动选择后再打开文件 | `workspace-keyboard-flows.test.ts` |
| WS-104 | 通过键盘调整聊天面板宽度后，刷新仍会保持 | `workspace-keyboard-flows.test.ts` |

## 自动化候选

| ID | 场景 | 原因 |
| --- | --- | --- |
| WS-C01 | Python 等非 HTML 文件的源码预览 | 很适合回归自动化，但当前仍属于待补 viewer 能力覆盖 |
| WS-C02 | 工作区侧栏的更完整纯键盘导航 | 自动化价值高，但需要先明确产品侧快捷键与焦点规则 |
| WS-C03 | 多会话的重命名、归档或恢复流 | 值得自动化，但前提是这些能力在产品层正式稳定 |

## 手工保留

| ID | 场景 | 原因 |
| --- | --- | --- |
| WS-M01 | 生成结果在预览里的“设计质量”是否达标 | 依赖主观内容质量判断，不适合用稳定断言衡量 |
| WS-M02 | 手动编辑后的视觉细节是否足够精致 | 更适合设计/QA 人工验收 |

## 说明

- `app.test.ts` 同时包含资源驱动场景和少量集中式回归，这里按用户行为分组，而不是按 helper 或实现结构分组。
- 资源驱动类场景来源于 `e2e/resources/playwright.ts`。
