# Visible Creator Task Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在 Creator Workbench 任务卡上直接显示人工阻塞任务的当前阻塞原因。

**Architecture:** 复用已经贯通到 TaskCardViewModel 的 blockerNote；只在 TasksView 添加条件渲染与局部样式，不修改 API、存储或任务焦点策略。

**Tech Stack:** React 18、TypeScript、Vitest、Next.js。

---

### Task 1: 覆盖显示和隐藏路径

**Files:**
- Modify: apps/web/tests/components/TasksView.page.test.tsx

- [ ] **Step 1: 写失败页面测试**

在现有持久化任务 fixture 中创建 status: blocked、blockerNote: 缺少夜景素材 的人工任务。切换到 Creator workbench 后断言：

~~~ts
expect(screen.getByText('阻塞：缺少夜景素材')).toBeTruthy();
~~~

再创建一条 status: ready、blockerNote: undefined 的人工任务，断言：

~~~ts
expect(screen.queryByText(/^阻塞：/)).toBeNull();
~~~

- [ ] **Step 2: 运行确认红灯**

Run: corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "shows a blocker note|hides blocker notes" --maxWorkers=1

Expected: 因任务卡尚未渲染 blockerNote 而失败。

### Task 2: 渲染阻塞原因

**Files:**
- Modify: apps/web/src/components/TasksView.tsx
- Modify: apps/web/src/styles/home/tasks.css

- [ ] **Step 1: 最小实现**

在任务描述和 chips 之间增加条件渲染：

~~~tsx
{task.status === 'blocked' && task.blockerNote ? (
  <p className="creator-list__blocker">阻塞：{task.blockerNote}</p>
) : null}
~~~

不依赖标题或标签文案判断状态，不为推导任务创建 blockerNote。

- [ ] **Step 2: 添加样式**

新增 creator-list__blocker：紧凑的顶部边距、琥珀色文本、适合长原因换行。不得改动非阻塞任务的布局。

- [ ] **Step 3: 验证并提交**

~~~powershell
corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "shows a blocker note|hides blocker notes" --maxWorkers=1
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
git add apps/web/src/components/TasksView.tsx apps/web/src/styles/home/tasks.css apps/web/tests/components/TasksView.page.test.tsx
git commit -m "feat: show creator task blocker notes"
~~~

Expected: 每条验证命令退出码为 0。

### Task 3: 最终检查

**Files:** Verify only: apps/web/src/components/TasksView.tsx

- [ ] **Step 1: 检查提交边界**

~~~powershell
git diff --check HEAD~1..HEAD
git status --short
~~~

Expected: 无空白错误，工作树无未提交产品文件。
