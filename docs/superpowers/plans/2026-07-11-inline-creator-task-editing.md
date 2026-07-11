# Creator Task Inline Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让人工创建的 Creator 任务可在任务卡内编辑，并把阻塞原因和更新活动持久化。

**Architecture:** 扩展现有合同、daemon 存储和既有 PATCH 路由。页面在人工任务卡内维护一份编辑草稿，保存任务后再写活动；推导任务保持只读。

**Tech Stack:** TypeScript、Express、React 18、Vitest、pnpm workspace。

---

### Task 1: 合同与存储规则

**Files:**
- Modify: packages/contracts/src/api/creator-workbench.ts
- Modify: apps/daemon/src/creator-workbench-store.ts
- Test: apps/daemon/tests/creator-workbench-store.test.ts

- [ ] **Step 1: 写失败测试**

~~~ts
it('requires a blocker note when a task becomes blocked', async () => {
  const task = await createCreatorTask(dataDir, 'project-blocked', { title: '补拍夜景' });
  await expect(updateCreatorTask(dataDir, 'project-blocked', task.id, {
    status: 'blocked',
  })).rejects.toThrow('blocker note is required');
});

it('stores a blocker note and clears it when the task is unblocked', async () => {
  const task = await createCreatorTask(dataDir, 'project-blocked', { title: '补拍夜景' });
  const blocked = await updateCreatorTask(dataDir, 'project-blocked', task.id, {
    status: 'blocked', blockerNote: '缺少夜景素材',
  });
  const resumed = await updateCreatorTask(dataDir, 'project-blocked', task.id, { status: 'ready' });
  expect(blocked).toMatchObject({ status: 'blocked', blockerNote: '缺少夜景素材' });
  expect(resumed).not.toHaveProperty('blockerNote');
});
~~~

- [ ] **Step 2: 确认红灯**

Run: corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-workbench-store.test.ts

Expected: 新测试因 blockerNote 未实现而失败。

- [ ] **Step 3: 最小实现**

给 CreatorTaskRecord、CreateCreatorTaskRequest、UpdateCreatorTaskRequest 添加 blockerNote?: string。存储层新增：

~~~ts
function parseBlockerNote(value: unknown): string | undefined {
  return optionalText(value);
}
~~~

更新任务计算最终 status 和 blockerNote：字段缺失则保留当前值，传入空字符串则清除。最终状态为 blocked 且说明为空时抛出 blocker note is required；非 blocked 状态永远不保存 blockerNote。创建 blocked 任务采用同一校验；validTask 允许旧 JSON 缺少 blockerNote。

- [ ] **Step 4: 验证并提交**

~~~powershell
corepack pnpm --filter @open-design/contracts build
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-workbench-store.test.ts
corepack pnpm --filter @open-design/daemon typecheck
git add packages/contracts/src/api/creator-workbench.ts apps/daemon/src/creator-workbench-store.ts apps/daemon/tests/creator-workbench-store.test.ts
git commit -m "feat: record creator task blockers"
~~~

Expected: 三条验证命令退出码为 0。

### Task 2: 路由验收

**Files:**
- Modify: apps/daemon/tests/creator-workbench-routes.test.ts

- [ ] **Step 1: 写失败 HTTP 测试**

创建任务后 PATCH status: blocked（无 blockerNote）应返回 400；再 PATCH status: blocked、blockerNote: 缺少夜景素材，应返回 200，且 JSON 任务包含该说明。

~~~ts
expect(rejected.status).toBe(400);
await expect(accepted.json()).resolves.toMatchObject({
  task: { status: 'blocked', blockerNote: '缺少夜景素材' },
});
~~~

- [ ] **Step 2: 验证并提交**

~~~powershell
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-workbench-store.test.ts tests/creator-workbench-routes.test.ts
corepack pnpm --filter @open-design/daemon typecheck
git add apps/daemon/tests/creator-workbench-routes.test.ts
git commit -m "test: cover creator task blocker requests"
~~~

Expected: 两个测试文件和类型检查均退出码为 0。

### Task 3: 卡片内编辑和活动回写

**Files:**
- Modify: apps/web/src/components/TasksView.tsx
- Modify: apps/web/src/styles/home/tasks.css
- Test: apps/web/tests/components/TasksView.page.test.tsx

- [ ] **Step 1: 写失败页面测试**

扩展 CreatorProjectData 任务 mock 支持 description? 与 blockerNote?。新增三项：

~~~ts
it('edits a creator task inline, records its blocker note, and writes an activity', async () => {
  // Edit -> status=blocked -> 填写 缺少夜景素材 -> Save。
  // 断言 PATCH body 有 blockerNote；POST 活动有标题 补拍夜景 已阻塞 和同名 summary。
});

it('cancels inline editing without sending a task update', async () => {
  // Edit 后改标题再 Cancel；断言 PATCH 未调用、原标题仍展示。
});

it('does not render edit controls for inferred project tasks', async () => {
  // 仅输入 Project；断言没有 name 为 Edit 的按钮。
});
~~~

- [ ] **Step 2: 确认红灯**

Run: corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "edits a creator task inline|cancels inline editing|does not render edit controls" --maxWorkers=1

Expected: 因 Edit、原地表单和保存逻辑不存在而失败。

- [ ] **Step 3: 最小前端实现**

在 TasksView 增加单个编辑草稿：taskId、title、description、stage、status、priority、blockerNote。仅 task.id.startsWith('creator-task:') 显示 Edit。

保存时 PATCH 发送 title、description、stage、status、priority、blockerNote。状态为 blocked 但 blockerNote.trim() 为空时，设置 error 为 Blocker reason is required 且不请求。

PATCH 成功后 POST 既有 creator-activities。活动标题：blocked 为 任务标题 已阻塞；从 blocked 改为其他状态为 任务标题 已解除阻塞；其余为 任务标题 已更新。blocked 活动 summary 为 blockerNote.trim()，category 为保存后的 stage。活动失败不回滚 PATCH，但显示错误后 refresh。

advanceCreatorTask 的 PATCH body 添加 blockerNote: ''，保证快捷推进会解除阻塞。

- [ ] **Step 4: 渲染与可访问性**

原地表单字段 aria-label 固定为 Edit task title、Edit task description、Edit task stage、Edit task status、Edit task priority、Blocker reason、Save task、Cancel task edit。Blocker reason 仅 status=blocked 显示。添加 creator-task-edit 样式：卡片内分隔线、紧凑网格、窄屏单列；不影响推导任务。

- [ ] **Step 5: 验证并提交**

~~~powershell
corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "edits a creator task inline|cancels inline editing|does not render edit controls|creates a creator task|advances it" --maxWorkers=1
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
git add apps/web/src/components/TasksView.tsx apps/web/src/styles/home/tasks.css apps/web/tests/components/TasksView.page.test.tsx
git commit -m "feat: edit creator tasks inline"
~~~

Expected: 新增页面测试、类型检查与构建退出码为 0。整页 Vitest 若因 Windows 遗留子进程超时，必须单独如实报告。

### Task 4: 最终验收

**Files:** Verify only: packages/contracts/src/api/creator-workbench.ts, apps/daemon/src/creator-workbench-store.ts, apps/web/src/components/TasksView.tsx

- [ ] **Step 1: 运行最终验证**

~~~powershell
git diff --check HEAD~3..HEAD
corepack pnpm --filter @open-design/contracts build
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-workbench-store.test.ts tests/creator-workbench-routes.test.ts
corepack pnpm --filter @open-design/daemon typecheck
corepack pnpm --filter @open-design/web exec vitest run tests/creator-adapters/creator-dashboard.test.ts --maxWorkers=1
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
git status --short
~~~

Expected: 每条验证命令退出码为 0；回传分别列出新增页面测试、整页 Vitest 与构建的实际结果。
