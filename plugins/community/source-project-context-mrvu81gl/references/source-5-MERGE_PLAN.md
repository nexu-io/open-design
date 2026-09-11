# 设计系统融合方案 — Open Design → clb-frontend

## 目标

将本项目的 ui_kits、SKILL.md、AGENT_PROMPTS.md、DESIGN.md、README.md 融合进 `/Users/zhongqi/huawei/code/clb-new/clb-frontend`。

## 注入点：`packages/design-system/`

clb-frontend 的 AGENTS.md 第 28 行已规划此包："设计令牌及 CLB 公共 UI；不得包含领域流程"。目录尚不存在。

## 文件映射

```
Open Design 项目                              →  clb-frontend 目标位置
────────────────────────────────────────────────────────────────────────
colors_and_type.css                           →  packages/design-system/src/tokens.css
DESIGN.md (设计规范)                         →  packages/design-system/DESIGN.md
SKILL.md (Agent 使用 skill)                  →  packages/design-system/SKILL.md
AGENT_PROMPTS.md (Phase 任务 prompt)         →  packages/design-system/AGENT_PROMPTS.md
ui_kits/app/components/*.css                 →  packages/design-system/src/components/*.css
ui_kits/app/index.html                       →  packages/design-system/preview/index.html
ui_kits/app/README.md                        →  packages/design-system/preview/README.md
preview/*.html                               →  packages/design-system/preview/*.html
source_examples/*.html                       →  packages/design-system/source_examples/*.html
workspace.html (参考原型)                    →  packages/design-system/reference/workspace.html
context/provenance.md                        →  packages/design-system/docs/provenance.md
README.md                                    →  合并到 clb-frontend 根 README.md 的设计系统章节
```

## 具体步骤（逐条可执行）

### Step 1: 创建包目录结构

```bash
cd /Users/zhongqi/huawei/code/clb-new/clb-frontend
mkdir -p packages/design-system/src/components
mkdir -p packages/design-system/preview
mkdir -p packages/design-system/source_examples
mkdir -p packages/design-system/reference
mkdir -p packages/design-system/docs
```

### Step 2: 编写 package.json

创建 `packages/design-system/package.json`:
```json
{
  "name": "@clb/design-system",
  "version": "0.1.0",
  "description": "CLB 设计系统 — 设计令牌、组件样式、Agent skill 与实现 prompts",
  "type": "module",
  "main": "./src/index.ts",
  "files": ["src", "preview", "DESIGN.md", "SKILL.md", "AGENT_PROMPTS.md"]
}
```

### Step 3: 复制 token 文件并适配

复制 `colors_and_type.css` → `packages/design-system/src/tokens.css`

适配要点：
- 保留所有 `:root` 变量
- 将 `font-feature-settings` 从 `:root` 移到 `body`
- 去掉全局 reset（clb-frontend 有自己的 reset.css）
- 确保变量名不与 clb-frontend 的 `--ds-*` 命名空间冲突

### Step 4: 复制组件 CSS

将 `ui_kits/app/components/*.css` 复制到 `packages/design-system/src/components/`：
- buttons.css, kpi-cards.css, pills.css, table.css
- environment-cards.css, health-monitoring.css, navigation.css, empty-state.css

每个文件添加 `@import '../tokens.css';` 头部引用。

### Step 5: 创建 src/index.ts 入口

```typescript
// packages/design-system/src/index.ts
// 设计系统入口 — 导出 token 和组件样式引用路径
export { default as tokens } from './tokens.css?inline';
export const componentStyles = {
  buttons:    () => import('./components/buttons.css?inline'),
  kpiCards:   () => import('./components/kpi-cards.css?inline'),
  pills:      () => import('./components/pills.css?inline'),
  table:      () => import('./components/table.css?inline'),
  envCards:   () => import('./components/environment-cards.css?inline'),
  health:     () => import('./components/health-monitoring.css?inline'),
  navigation: () => import('./components/navigation.css?inline'),
  emptyState: () => import('./components/empty-state.css?inline'),
};
```

### Step 6: 复制文档和预览

```
DESIGN.md              → packages/design-system/DESIGN.md
SKILL.md               → packages/design-system/SKILL.md
AGENT_PROMPTS.md       → packages/design-system/AGENT_PROMPTS.md
preview/*.html         → packages/design-system/preview/
source_examples/*.html → packages/design-system/source_examples/
workspace.html         → packages/design-system/reference/workspace.html
context/provenance.md  → packages/design-system/docs/provenance.md
```

### Step 7: 更新 clb-frontend 的 AGENTS.md

在 `## Package Boundaries` 段落，将 `packages/design-system` 条目更新为：

```markdown
- `packages/design-system`：设计令牌、组件 CSS 模式、Agent skill、实现 prompts 和预览卡片。
  源自 Github Dashboard 设计系统项目。agent 任务前先读 SKILL.md 和 DESIGN.md。
  令牌文件位于 src/tokens.css；组件 CSS 位于 src/components/。
  不得包含领域流程或运行时业务逻辑。
```

### Step 8: 在 clb-frontend 根 README 中添加设计系统章节

在 README 末尾添加：
```markdown
## 设计系统

本项目使用 `@clb/design-system` 包（`packages/design-system/`）统一设计语言。
详见 [DESIGN.md](packages/design-system/DESIGN.md)。

快速开始：
\`\`\`ts
import '@clb/design-system/src/tokens.css';
\`\`\`

Agent 开发前请阅读：
- [SKILL.md](packages/design-system/SKILL.md) — 设计系统使用规范
- [AGENT_PROMPTS.md](packages/design-system/AGENT_PROMPTS.md) — 分阶段实现 prompts
\`\`\`
```

### Step 9: 将 token 纳入 clb-frontend 主题体系

更新 `src/theme/tokens.ts`，从 `@clb/design-system` 导入基础 token，与现有 NaiveUI 主题合并。具体映射见 AGENT_PROMPTS.md Phase 1。

### Step 10: 添加 pnpm workspace 依赖

确保 `pnpm-workspace.yaml` 的 `packages` 数组包含 `packages/design-system`（当前配置 `packages/*` 已覆盖）。

## 验证清单

- [ ] `packages/design-system/package.json` 存在
- [ ] `packages/design-system/src/tokens.css` 可被 import
- [ ] `packages/design-system/preview/index.html` 可在浏览器打开
- [ ] clb-frontend AGENTS.md 已更新
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm dev` 启动后设计系统预览页可访问
