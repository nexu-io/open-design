# Creator Task Completion Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让 Creator Workbench 默认隐藏已完成任务，并支持筛选和恢复人工完成任务。

**Architecture:** 前端维护当前任务筛选状态，在 creatorDashboard.tasks 上派生可见列表。恢复操作复用现有 PATCH 和活动写入；不新增后端合同或路由。

**Tech Stack:** React 18、TypeScript、Vitest、Next.js。

---

### Task 1: 筛选状态和恢复操作

**Files:**
- Modify: apps/web/src/components/TasksView.tsx
- Test: apps/web/tests/components/TasksView.page.test.tsx

- [ ] **Step 1: 写失败页面测试**

在同一项目提供一条 ready 人工任务和一条 done 人工任务。初始断言只有 ready 标题可见；点击 已完成 后只见 done 标题；点击 全部 后两条均可见。

再点击完成任务的 恢复，断言：

~~~ts
expect(patchBody).toMatchObject({ status: 'ready', blockerNote: '' });
expect(activityBody).toMatchObject({
  taskId: completedTaskId, category: 'review', title: '发布复盘 已恢复进行中',
});
~~~

并断言推导完成任务没有 恢复 按钮。

- [ ] **Step 2: 运行确认红灯**

Run: corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "filters creator tasks|restores a completed creator task" --maxWorkers=1

Expected: 因筛选控件和恢复操作不存在而失败。

- [ ] **Step 3: 实现最小状态和派生列表**

新增 type CreatorTaskFilter = 'active' | 'completed' | 'all' 和默认 active 的状态。用 useMemo 从 creatorDashboard.tasks 派生 visibleCreatorTasks：active 排除 done，completed 仅保留 done，all 不过滤。

渲染任务标题上方的 tablist，按钮名称为 进行中、已完成、全部，并用 aria-selected 表达当前状态。任务列表改为遍历 visibleCreatorTasks。

- [ ] **Step 4: 实现恢复**

增加 restoreCreatorTask(task)。通过现有 PATCH 写入：

~~~ts
body: JSON.stringify({ status: 'ready', blockerNote: '' })
~~~

成功后 POST 既有 creator-activities：

~~~ts
body: JSON.stringify({
  taskId: task.id, category: task.stage, title: `${task.title} 已恢复进行中`,
})
~~~

活动失败时不回滚 PATCH，显示现有错误并 refresh。仅 task.id.startsWith('creator-task:') 且 status === 'done' 时显示 恢复；完成任务不显示 Advance。

### Task 2: 筛选样式和回归验证

**Files:**
- Modify: apps/web/src/styles/home/tasks.css
- Test: apps/web/tests/components/TasksView.page.test.tsx

- [ ] **Step 1: 添加筛选样式**

新增 creator-task-filter 的紧凑分段控件样式；选中态使用现有面板和强调色 token，按钮保持固定高度，窄屏时允许换行但不覆盖任务表单。

- [ ] **Step 2: 验证并提交**

~~~powershell
corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "filters creator tasks|restores a completed creator task|does not render edit controls" --maxWorkers=1
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
git add apps/web/src/components/TasksView.tsx apps/web/src/styles/home/tasks.css apps/web/tests/components/TasksView.page.test.tsx
git commit -m "feat: archive completed creator tasks"
~~~

Expected: 每个验证命令退出码为 0。

### Task 3: 最终检查

- [ ] **Step 1: 检查工作树**

~~~powershell
git diff --check HEAD~1..HEAD
git status --short
~~~

Expected: 无空白错误，没有未提交产品代码。
