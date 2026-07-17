# CW-07C 验收报告 — 修复 TasksView 零项目切换 Creator workbench 的渲染挂起

- **日期**：2026-07-17
- **分支**：`feat/cw-07c-creator-surface-stability`
- **worktree**：`.worktrees/cw-07c-creator-surface-stability`（基于 `main` @ `b9943b18c`）
- **前置 cherry-pick**（来自 CW-07B，未修改）：
  - `b696ed82d` docs: correct creator readiness audit
  - `ae049b402` test: stabilize creator release readiness
- **本提交**：`fix: stabilize creator workbench surface switch`

## 1. 调研（React / Testing Library / Vitest 最佳实践）

参考高 Star 官方/权威来源，仅做最小、可证明正确的修复，不闭门重写。

| 项目 | Stars | 来源 URL | 采纳原则 |
|---|---|---|---|
| react/react | ~242k | https://react.dev/learn/you-might-not-need-an-effect | 派生状态在渲染期计算，不进 Effect；外部系统无关的状态变更不应使用 Effect |
| react/react | ~242k | https://react.dev/learn/removing-effect-dependencies | 依赖数组必须匹配代码；读 state 算下一 state 用 updater 函数把该 state 移出依赖；禁止 `eslint-disable react-hooks/exhaustive-deps` |
| react/react | ~242k | https://react.dev/learn/separating-events-from-effects | 交互逻辑放事件回调；非响应式的副作用用 `useEffectEvent` |
| react/react | ~242k | https://react.dev/learn/choosing-the-state-structure | 避免冗余/重复状态；存 id，渲染期派生对象 |
| react/react | ~242k | https://react.dev/reference/rules | 渲染保持纯；Hook 仅在顶层调用 |
| testing-library/react-testing-library | ~19.6k | https://testing-library.com/docs/dom-testing-library/api-async | 异步 UI 用 `findBy*` / `waitFor`（默认 1000ms）带超时；回调须抛错才重试，避免不收敛轮询 |
| testing-library/react-testing-library | ~19.6k | https://testing-library.com/docs/guiding-principles | 测试越像真实使用越有信心（`screen.findByRole` 等面向用户查询） |
| testing-library/react-testing-library | ~19.6k | https://testing-library.com/docs/react-testing-library/api | `cleanup()` 卸载渲染树防交叉测试副作用；配合 `vi.restoreAllMocks()` |
| vitest-dev/vitest | ~16.6k | https://vitest.dev/config/#testtimeout | `testTimeout` 默认 5000ms；超时仅报错，无法掩盖同步无限循环（须先在组件层修复） |
| vitest-dev/vitest | ~16.6k | https://vitest.dev/api/vi#vi-usefaketimers | fake timers 须配对 `vi.useRealTimers()`，避免 `waitFor` 轮询永不收敛 |

**采纳的核心原则**：tab 切换的派生数据在渲染期计算；Effect 依赖必须匹配代码，读最新 props 用 ref 而非把整数组塞进依赖；测试用面向用户的 `findBy*` 查询并配合理超时；`afterEach` 清理 + 真实定时器。

## 2. 根因诊断（可证明的证据链）

### 现象
`render(<TasksView />)`（无 projects → `entryProjects = []`），默认显示 Automations；
点击 `Creator workbench` tab → 期望出现 `[data-testid="creator-dashboard"]`，但实测在 jsdom 下
同步占满 CPU / 最终超时或 OOM。命令（CW-07C 规范复现）：

```
pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx \
  -t "keeps automations as the default surface until switching to creator workbench" \
  --maxWorkers=1 --testTimeout=10000 --hookTimeout=10000 --reporter=verbose
```

### 证据链
1. **定位不稳定依赖**：`TasksView.tsx` 中
   - `function TasksView({ projects: entryProjects = [], ... })` —— 调用方省略 prop 时，默认 `[]`
     是**每次渲染重新创建的数组字面量**（新引用）。
   - `const refresh = useCallback(async () => { ... }, [entryProjects])` —— 依赖 `entryProjects` 的
     **引用身份**。由于默认 `[]` 每次渲染都是新引用，`refresh` 在**每次渲染都是新函数**。
   - `useEffect(() => { void refresh(); }, [refresh])` —— 挂载后每当 `refresh` 变化就重跑。
     因此：`entryProjects`(新引用) → `refresh`(新函数) → effect 重跑 → `refresh()` 异步 setState →
     重渲染 → `entryProjects`(新引用) → …… **无限异步刷新循环**。
2. **零项目 vs 有项目差异**：
   - 在 Automations 表面该循环已在后台运行，但 Automations 渲染轻量，测试的首个 `findByLabelText`
     仍能命中，故表面“正常”。
   - 切换到 Creator workbench 后渲染重型 dashboard（`creator-dashboard` 下含多块 Metric /
     hero / 各 panel），循环导致的连续重渲染使该重型视图**永不稳定**，CPU 占满，
     `findByTestId('creator-dashboard')` 永不收敛 → 超时 / 堆溢出。
   - 有项目时 `entryProjects` 由父组件传入，引用相对稳定，故该路径不暴露挂起（但每次父级重渲染
     仍会触发一次冗余 refresh，属于同一根因的轻微表现）。
3. **量化证据（临时诊断，已删除，未进提交）**：挂载后停留 1.5s，统计 `fetch` 调用次数
   - 修复前：`before=4 after=4808 delta=4804` —— 约 1200 次 `refresh`/1.5s（每次 refresh ≈ 4 次读接口）。
   - 修复后：`before=4 after=4 delta=0` —— `refresh` 仅挂载时触发一次。

> 注意：三个 `useEffect`（1208/1214/1220）以 `entryProjects[0]?.id` 为守卫，零项目时守卫为假不会
> setState，不是循环来源；真正的循环来自 `refresh` 的不稳定依赖。其余 `useMemo`（如 `creatorDashboard`）
> 依赖 `entryProjects` 仅导致每次重渲染重算（非渲染循环），不在本修复范围内。

## 3. 修复（最小、可证明正确）

文件：`apps/web/src/components/TasksView.tsx`，仅改动 `refresh` 相关的依赖与内部取值。

```ts
// 读取最新 entryProjects 用 ref，避免把“每次渲染都新建的 []”塞进 useCallback 依赖，
// 从而让 refresh 在“项目集合不变”时保持稳定，挂载 effect 只跑一次。
const entryProjectsRef = useRef(entryProjects);
entryProjectsRef.current = entryProjects;
const entryProjectKey = entryProjects.map((project) => project.id).join('|');
const refresh = useCallback(async (): Promise<{ proposalRefreshFailed: boolean }> => {
  let proposalRefreshFailed = false;
  const projects = entryProjectsRef.current;     // 原 entryProjects
  try {
    // ... 内部 5 处 entryProjects.map(...) 改为 projects.map(...)
  }
  return { proposalRefreshFailed };
}, [entryProjectKey]);                            // 原 [entryProjects]
```

要点：
- **默认表面仍是 Automations**（未改 `useState('automations')`）。
- **零项目时 Creator workbench 仍展示空焦点状态**（`creator-dashboard` 渲染逻辑未变，只是不再被循环拖死）。
- **有项目时行为不回退**：`entryProjectKey` 在“项目集合变化”时改变 → `refresh` 重建 → 挂载 effect
  重跑 → 重新拉取该项目的 creator 数据（保留了原有“项目变化触发刷新”的语义）。
- **切换 surface 不触发额外 refresh / 重复读接口**：`refresh` 仅由挂载与项目集合变化触发，
  surface 切换（`setSurface`）不在其依赖链上。
- **不改任何业务 API / 数据契约 / daemon 行为**；未用 `setTimeout`、未禁 StrictMode、未关测试、
  未吞异常、未 mock 掉 Creator 面板、未跳过/弱化用例。

## 4. 修改文件及职责

| 文件 | 职责 |
|---|---|
| `apps/web/src/components/TasksView.tsx` | 最小应用层修复：`refresh` 改用 ref 读 `entryProjects` + 依赖稳定的 `entryProjectKey`，消除无限刷新循环 |
| `apps/web/tests/components/TasksView.page.test.tsx` | 在既有 `keeps automations as the default surface …` 用例后新增 `zero-project workspace: creator switch is stable, bounded, and loop-free`，覆盖零项目默认 Automations、切换后 10s 内稳定出现 `creator-dashboard`、切回 Automations 稳定、`fetch` 调用有界（切换不触发额外刷新）、无 `Maximum update depth` |
| `docs/verification/2026-07-17-cw-07c-creator-surface-stability-acceptance.md` | 本验收报告 |

未改动：`apps/daemon/**`、`packages/contracts/**`、`package.json`、`pnpm-lock.yaml`、
`design-systems/**`、真实 `.od`/素材/daemon 数据、`next-env.d.ts`、vitest 全局配置。

## 5. 测试数量

- 既有 TasksView 拆分测试：**99** 个（page 40 / creator-content 5 / release 8 / performance 28 / release-schedule 18）。
- 本次新增：**1** 个（page 文件内 `zero-project workspace: creator switch is stable, bounded, and loop-free`）。
- 合计：**100** 个 TasksView 测试，断言未删除或弱化。

## 6. 验证结果

所有命令均使用 `NODE_OPTIONS=`（清除环境里的 `--use-system-ca`）后再执行。

1. **最小复现（修复前 → 后）**
   - 修复前：命令挂起，CPU 占满，最终超时 / OOM（`findByTestId('creator-dashboard')` 永不收敛）。
   - 修复后：`✓ keeps automations as the default surface until switching to creator workbench` **190ms 通过**。
2. **全部 5 个拆分 TasksView 文件，单 worker**
   - `pnpm vitest run TasksView.page.test.tsx TasksView.creator-content.test.tsx TasksView.release.test.tsx TasksView.performance.test.tsx TasksView.release-schedule.test.tsx --maxWorkers=1`
   - **Test Files 5 passed (5)；Tests 100 passed (100)**；0 failed，无 OOM、无超时、无 worker 终止。
3. **packaged 回归**（`--pool=forks`）
   - **Test Files 14 passed (14)；Tests 150 passed | 2 skipped (152)**；0 failed。
   - 2 个 skipped 为 Windows 不具备目录符号链接权限的能力感知测试（CW-07B 既有策略），其余全绿。
4. **Web typecheck**：`pnpm --filter @open-design/web typecheck` → **TC_EXIT=0**，无 `error TS`。
   - 注：首次运行因 workspace 依赖（`@open-design/creator-domain`、`@open-design/desktop` 等）未构建，
     先执行了 `pnpm -r --filter "@open-design/web^..." --filter "!@open-design/web" build` 与
     `pnpm --filter @open-design/desktop build` 构建依赖，再重跑通过（如实记录）。
5. **Web build**：`pnpm --filter @open-design/web build` → **BUILD_EXIT=0**，Next 路由正常预渲染。
6. **空白检查**：`git diff --check main...HEAD` → **无空白/冲突问题（DIFF_CHECK_OK）**。

## 7. git status（提交前）

```
 M apps/web/src/components/TasksView.tsx
 M apps/web/tests/components/TasksView.page.test.tsx
?? docs/verification/2026-07-17-cw-07c-creator-surface-stability-acceptance.md
```

（`dist/**` 等构建产物已被 `.gitignore` 忽略，未进入工作树；`pnpm-lock.yaml` 未被修改。）

## 8. 已知限制与未做事项

- **未合并 / 未 push / 未 rebase / 未 reset**：仅停留在 `feat/cw-07c-creator-surface-stability` 分支，
  等待 Codex 审核后由你决定下一步。
- **构建依赖为前置步骤**：worktree 首次运行需 `pnpm install --prefer-offline --frozen-lockfile` 与
  构建 workspace 依赖（`creator-domain` / `desktop` 等）。这属验证环境准备，未改动任何源码或 lockfile。
- **未扩大修复范围**：仅修复 `refresh` 的不稳定依赖（根因）。其余 `useMemo` 对 `entryProjects` 的
  引用重算属轻微浪费、非渲染循环，按“最小修复”原则未一并改动。
- **CW-07B 既有 4 个未拆分文件**（`analytics`/`history`/`routines`/`templates`）未纳入本次交付，
  其既有行为（如 `templates.test.tsx` 的 React 告警）不在 CW-07C 范围内。
