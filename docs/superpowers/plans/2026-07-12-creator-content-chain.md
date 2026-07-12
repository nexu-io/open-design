# Creator 内容链（CW-02）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个创作项目持久化选题、脚本大纲、分镜、任务/素材关联和发布复盘，并在 Creator Workbench 中完成手动内容链。

**Architecture:** `packages/contracts` 定义纯 DTO；daemon 的 `creator-content` 存储按项目 JSON 原子写入，路由只负责项目与同项目关联校验；Web 通过 HTTP 读取和修改内容数据。内容、任务和 CW-01 素材保持独立，只存 ID 关联。 

**Tech Stack:** TypeScript、Express、Node `fs/promises`、React 18、Vitest、pnpm workspace。

**Spec:** `docs/superpowers/specs/2026-07-12-creator-content-chain-design.md`

---

## 文件结构

- 新建 `packages/contracts/src/api/creator-content.ts`：内容、分镜、复盘和请求 DTO。
- 修改 `packages/contracts/src/index.ts`：导出内容 DTO。
- 新建 `apps/daemon/src/creator-content/store.ts`：按项目读写、内容 CRUD 和关联约束。
- 新建 `apps/daemon/src/routes/creator-content.ts`：HTTP 路由与项目存在性校验。
- 修改 `apps/daemon/src/server.ts`：注册内容路由。
- 新建 `apps/daemon/tests/creator-content-store.test.ts`：持久化、排序和关联纯逻辑测试。
- 新建 `apps/daemon/tests/creator-content-routes.test.ts`：路由和跨项目拒绝测试。
- 修改 `apps/web/src/components/TasksView.tsx`：加载内容数据并增加 Content 面板。
- 修改 `apps/web/src/styles/home/tasks.css`：内容面板与紧凑分镜列表样式。
- 修改 `apps/web/tests/components/TasksView.page.test.tsx`：页面级创建、编辑、素材关联、缺失提示和删除确认测试。

## Task 1：内容 contracts

**Files:**
- Create: `packages/contracts/src/api/creator-content.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts` build

- [ ] **Step 1：写入内容 DTO**

```ts
export type CreatorContentStatus = 'idea' | 'drafting' | 'production' | 'published' | 'archived';

export interface CreatorContentBrief {
  topic?: string;
  audience?: string;
  coreMessage?: string;
  targetPlatform?: string;
}

export interface CreatorContentOutline {
  opening?: string;
  sections?: string;
  ending?: string;
  editingIntent?: string;
}

export interface CreatorStoryboardItem {
  id: string;
  position: number;
  purpose: string;
  visualDescription?: string;
  audioNotes?: string;
  mediaAssetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatorRetrospective {
  publishedAt?: string;
  performanceSummary?: string;
  learnings?: string;
  nextAction?: string;
}

export interface CreatorContentProject {
  id: string;
  projectId: string;
  title: string;
  status: CreatorContentStatus;
  brief: CreatorContentBrief;
  outline: CreatorContentOutline;
  storyboardItems: CreatorStoryboardItem[];
  retrospective: CreatorRetrospective;
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatorContentProjectData {
  contentProjects: CreatorContentProject[];
}

export interface CreateCreatorContentRequest {
  title: string;
  status?: CreatorContentStatus;
}

export interface UpdateCreatorContentRequest {
  title?: string;
  status?: CreatorContentStatus;
  brief?: CreatorContentBrief;
  outline?: CreatorContentOutline;
  storyboardItems?: CreatorStoryboardItem[];
  retrospective?: CreatorRetrospective;
}
```

- [ ] **Step 2：导出并验证类型构建**

在 `packages/contracts/src/index.ts` 的 creator exports 相邻位置添加：

```ts
export * from './api/creator-content.js';
```

Run: `corepack pnpm --filter @open-design/contracts build`  
Expected: exit 0。

- [ ] **Step 3：提交 contracts**

```bash
git add packages/contracts/src/api/creator-content.ts packages/contracts/src/index.ts
git commit -m "feat: define creator content contracts"
```

## Task 2：内容存储与约束

**Files:**
- Create: `apps/daemon/src/creator-content/store.ts`
- Create: `apps/daemon/tests/creator-content-store.test.ts`

- [ ] **Step 1：先写失败测试**

```ts
it('persists a content chain in storyboard order', async () => {
  const content = await createCreatorContent(dataDir, 'project-1', { title: '校园黄昏短片' });
  const firstShot = { id: 'shot-1', position: 1, purpose: '用下课铃建立时间', mediaAssetIds: [], createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z' };
  const secondShot = { id: 'shot-2', position: 2, purpose: '跟拍走向操场', mediaAssetIds: [], createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z' };
  const updated = await updateCreatorContent(dataDir, 'project-1', content.id, {
    brief: { topic: '毕业前的傍晚', audience: '大学同学' },
    outline: { opening: '下课铃', sections: '操场 / 教室 / 天台', ending: '夜色亮起' },
    storyboardItems: [secondShot, firstShot],
    retrospective: { learnings: '保留环境声' },
  });
  expect(updated?.storyboardItems.map((item) => item.id)).toEqual(['shot-1', 'shot-2']);
  await expect(getCreatorContentProjectData(dataDir, 'project-1')).resolves.toMatchObject({
    contentProjects: [expect.objectContaining({ id: content.id, taskIds: [] })],
  });
});

it('keeps a missing media id while rejecting a duplicate task link', async () => {
  const content = await createCreatorContent(dataDir, 'project-1', { title: '复盘短片' });
  await updateCreatorContent(dataDir, 'project-1', content.id, {
    storyboardItems: [{ id: 'shot-1', position: 1, purpose: '保留环境声', mediaAssetIds: [], createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z' }],
  });
  await linkCreatorContentTask(dataDir, 'project-1', content.id, 'creator-task:1');
  await linkCreatorContentTask(dataDir, 'project-1', content.id, 'creator-task:1');
  await linkCreatorStoryboardMedia(dataDir, 'project-1', content.id, 'shot-1', 'creator-media:missing');
  const data = await getCreatorContentProjectData(dataDir, 'project-1');
  expect(data.contentProjects[0]).toMatchObject({
    taskIds: ['creator-task:1'],
    storyboardItems: [expect.objectContaining({ mediaAssetIds: ['creator-media:missing'] })],
  });
});
```

- [ ] **Step 2：运行测试确认红灯**

Run: `corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-content-store.test.ts --maxWorkers=1`  
Expected: FAIL，因为模块尚不存在。

- [ ] **Step 3：实现最小存储 API**

在 `apps/daemon/src/creator-content/store.ts` 实现：

```ts
export async function getCreatorContentProjectData(dataDir: string, projectId: string): Promise<CreatorContentProjectData>;
export async function createCreatorContent(dataDir: string, projectId: string, input: CreateCreatorContentRequest): Promise<CreatorContentProject>;
export async function updateCreatorContent(dataDir: string, projectId: string, contentId: string, patch: UpdateCreatorContentRequest): Promise<CreatorContentProject | null>;
export async function deleteCreatorContent(dataDir: string, projectId: string, contentId: string): Promise<boolean>;
export async function linkCreatorContentTask(dataDir: string, projectId: string, contentId: string, taskId: string): Promise<void>;
export async function unlinkCreatorContentTask(dataDir: string, projectId: string, contentId: string, taskId: string): Promise<void>;
export async function linkCreatorStoryboardMedia(dataDir: string, projectId: string, contentId: string, itemId: string, assetId: string): Promise<void>;
export async function unlinkCreatorStoryboardMedia(dataDir: string, projectId: string, contentId: string, itemId: string, assetId: string): Promise<void>;
```

实现要求：

- 文件路径为 `path.join(dataDir, 'creator-content', `${projectId}.json`)`。
- 读取损坏或不存在文件时返回 `{ contentProjects: [] }`。
- 写入使用与 `creator-workbench-store.ts` 相同的临时文件 + `rename` 原子写。
- `title` 去除空白后必须非空；非法 status、重复分镜 ID、非正整数 position 或重复 position 抛出明确错误。
- `updateCreatorContent` 合并 `brief`、`outline`、`retrospective`，替换完整 `storyboardItems`，并按 `position` 排序；保持未提交字段不变。
- 新建分镜时 `mediaAssetIds` 默认 `[]`；已有缺失资产 ID 不在 store 层过滤。
- 所有 link/unlink 幂等；不存在内容或分镜返回明确错误；内容不存在时 `deleteCreatorContent` 返回 `false`。

- [ ] **Step 4：运行存储测试确认绿灯**

Run: `corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-content-store.test.ts --maxWorkers=1`  
Expected: 所有测试通过。

- [ ] **Step 5：提交存储层**

```bash
git add apps/daemon/src/creator-content/store.ts apps/daemon/tests/creator-content-store.test.ts
git commit -m "feat: persist creator content chains"
```

## Task 3：内容路由与项目边界

**Files:**
- Create: `apps/daemon/src/routes/creator-content.ts`
- Modify: `apps/daemon/src/server.ts`
- Create: `apps/daemon/tests/creator-content-routes.test.ts`

- [ ] **Step 1：编写路由失败测试**

```ts
const headers = { 'content-type': 'application/json' };
const availableCandidate = { rootPath: 'C:\\media', sourcePath: 'C:\\media\\clip.jpg', relativePath: 'clip.jpg', fileName: 'clip.jpg', extension: '.jpg', kind: 'image' as const, sizeBytes: 1, modifiedAt: '2026-07-12T00:00:00.000Z', availability: 'available' as const, thumbnailStatus: 'unavailable' as const };
const createContent = async (baseUrl: string, projectId: string, title: string) => {
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/creator-content`, { method: 'POST', headers, body: JSON.stringify({ title }) });
  return (await response.json() as { content: { id: string } }).content;
};
const linkContentTask = (baseUrl: string, projectId: string, contentId: string, taskId: string) => fetch(`${baseUrl}/api/projects/${projectId}/creator-content/${contentId}/tasks`, { method: 'POST', headers, body: JSON.stringify({ taskId }) });
const linkStoryboardMedia = (baseUrl: string, projectId: string, contentId: string, itemId: string, assetId: string) => fetch(`${baseUrl}/api/projects/${projectId}/creator-content/${contentId}/storyboard/${itemId}/media-assets`, { method: 'POST', headers, body: JSON.stringify({ assetId }) });
const readContent = async (baseUrl: string, projectId: string) => (await fetch(`${baseUrl}/api/projects/${projectId}/creator-content`)).json();

it('creates and reads content only for an existing project', async () => {
  const unknown = await fetch(`${baseUrl}/api/projects/missing/creator-content`, { method: 'POST', headers, body: JSON.stringify({ title: '不应创建' }) });
  expect(unknown.status).toBe(404);

  const created = await fetch(`${baseUrl}/api/projects/project-1/creator-content`, { method: 'POST', headers, body: JSON.stringify({ title: '校园黄昏短片' }) });
  expect(created.status).toBe(201);
  await expect(fetch(`${baseUrl}/api/projects/project-1/creator-content`).then((r) => r.json())).resolves.toMatchObject({ contentProjects: [expect.objectContaining({ title: '校园黄昏短片' })] });
});

it('rejects cross-project task and media links while preserving an existing missing link', async () => {
  const content = await createContent(baseUrl, 'project-1', '跨项目边界');
  const localTask = await createTask(dataDir, 'project-1', { title: '本项目任务' });
  const foreignTask = await createTask(dataDir, 'project-2', { title: '外部项目任务' });
  const [localAsset] = await upsertCreatorMediaAssets(dataDir, 'project-1', [availableCandidate]);
  const [foreignAsset] = await upsertCreatorMediaAssets(dataDir, 'project-2', [availableCandidate]);
  await expect(linkContentTask(baseUrl, 'project-1', content.id, localTask.id)).resolves.toMatchObject({ status: 201 });
  await expect(linkContentTask(baseUrl, 'project-1', content.id, foreignTask.id)).resolves.toMatchObject({ status: 400 });
  await expect(linkStoryboardMedia(baseUrl, 'project-1', content.id, 'shot-1', foreignAsset!.id)).resolves.toMatchObject({ status: 400 });
  await linkStoryboardMedia(baseUrl, 'project-1', content.id, 'shot-1', localAsset!.id);
  await upsertCreatorMediaAssets(dataDir, 'project-1', [], { rootPath: availableCandidate.rootPath, complete: true });
  await expect(readContent(baseUrl, 'project-1')).resolves.toMatchObject({ contentProjects: [expect.objectContaining({ storyboardItems: [expect.objectContaining({ mediaAssetIds: [localAsset!.id] })] })] });
});
```

- [ ] **Step 2：运行确认红灯**

Run: `corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-content-routes.test.ts --maxWorkers=1`  
Expected: FAIL，因为路由尚未注册。

- [ ] **Step 3：实现路由**

在 `registerCreatorContentRoutes()` 中实现规格列出的八条路由。路由依赖保持窄接口：

```ts
export interface RegisterCreatorContentRoutesDeps {
  paths: { RUNTIME_DATA_DIR: string };
  projectStore: { getProject: (db: unknown, projectId: string) => unknown };
  db: unknown;
}
```

关联前校验：

```ts
const tasks = await getCreatorWorkbenchProjectData(RUNTIME_DATA_DIR, projectId);
if (!tasks.tasks.some((task) => task.id === taskId)) throw new Error('creator task not found');

const media = await getCreatorMediaProjectData(RUNTIME_DATA_DIR, projectId);
const asset = media.assets.find((candidate) => candidate.id === assetId);
if (!asset) throw new Error('creator media asset not found');
if (asset.availability !== 'available') throw new Error('creator media asset is missing');
```

删除内容成功返回 204，不存在内容返回 404。注册器在 `apps/daemon/src/server.ts` 中与 `registerCreatorWorkbenchRoutes` 和 `registerCreatorMediaRoutes` 相邻注册。

- [ ] **Step 4：验证 daemon 层**

Run:

```bash
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-content-store.test.ts tests/creator-content-routes.test.ts tests/creator-media-routes.test.ts --maxWorkers=1
corepack pnpm --filter @open-design/daemon typecheck
```

Expected: exit 0。

- [ ] **Step 5：提交 API**

```bash
git add apps/daemon/src/routes/creator-content.ts apps/daemon/src/server.ts apps/daemon/tests/creator-content-routes.test.ts
git commit -m "feat: expose creator content APIs"
```

## Task 4：Creator Workbench 内容面板

**Files:**
- Modify: `apps/web/src/components/TasksView.tsx`
- Modify: `apps/web/src/styles/home/tasks.css`
- Modify: `apps/web/tests/components/TasksView.page.test.tsx`

- [ ] **Step 1：扩展页面 fetch mock，写失败用例**

为 `mockTasksViewFetch` 添加 `creatorContentData?: Record<string, CreatorContentProjectData>` 和下列读取分支：

```ts
const creatorContentRead = /^\/api\/projects\/([^/]+)\/creator-content$/.exec(url);
if (creatorContentRead && (!init || init.method === undefined)) {
  const projectId = decodeURIComponent(creatorContentRead[1]!);
  return new Response(JSON.stringify(creatorContentData[projectId] ?? { contentProjects: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
}
```

新增页面测试：

```ts
const creatorProject: Project = { id: 'project-content-1', name: '内容项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
const deleteCalls: string[] = [];
// 在每个测试中先 mockTasksViewFetch({ creatorProjects: [creatorProject], creatorContentData, creatorMediaData })，
// 再用 globalThis.fetch 包装 baseFetch：记录 creator-content 的 POST/PATCH body，并对 DELETE 记录 url 后返回 204。

it('creates a content project and saves its brief, outline, storyboard, and retrospective', async () => {
  render(<TasksView projects={[creatorProject]} />);
  fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
  fireEvent.change(screen.getByLabelText('Content title'), { target: { value: '校园黄昏短片' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create content' }));
  fireEvent.change(await screen.findByLabelText('Brief topic'), { target: { value: '毕业前的傍晚' } });
  fireEvent.change(screen.getByLabelText('Outline opening'), { target: { value: '下课铃' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add storyboard item' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add storyboard item' }));
  fireEvent.change(screen.getAllByLabelText('Storyboard purpose')[0]!, { target: { value: '建立时间' } });
  fireEvent.change(screen.getAllByLabelText('Storyboard purpose')[1]!, { target: { value: '跟拍离开教室' } });
  fireEvent.change(screen.getByLabelText('Retrospective learnings'), { target: { value: '保留环境声' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save content' }));
  expect(writes).toEqual(expect.arrayContaining([
    expect.objectContaining({ url: '/api/projects/project-content-1/creator-content', body: { title: '校园黄昏短片', status: 'idea' } }),
    expect.objectContaining({ url: '/api/projects/project-content-1/creator-content/creator-content%3A1', body: expect.objectContaining({ brief: expect.objectContaining({ topic: '毕业前的傍晚' }), outline: expect.objectContaining({ opening: '下课铃' }), storyboardItems: expect.arrayContaining([expect.objectContaining({ purpose: '建立时间' }), expect.objectContaining({ purpose: '跟拍离开教室' })]), retrospective: expect.objectContaining({ learnings: '保留环境声' }) }) }),
  ]));
});

it('shows missing storyboard media and never offers it as a new candidate', async () => {
  render(<TasksView projects={[creatorProject]} />);
  fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit content 校园黄昏短片' }));
  expect(screen.getByText('Missing')).toBeTruthy();
  expect(within(screen.getByLabelText('Storyboard media candidate')).queryByRole('option', { name: 'missing.jpg' })).toBeNull();
});

it('asks for confirmation before deleting a content project', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<TasksView projects={[creatorProject]} />);
  fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete content 校园黄昏短片' }));
  expect(deleteCalls).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete content 校园黄昏短片' }));
  await waitFor(() => expect(deleteCalls).toEqual(['/api/projects/project-content-1/creator-content/creator-content%3A1']));
  expect(confirmSpy).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2：运行确认红灯**

Run: `corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "content project|storyboard media|deleting a content" --maxWorkers=1`  
Expected: FAIL，因为 Content 面板尚不存在。

- [ ] **Step 3：加载数据并实现最小 UI**

在 `TasksView.tsx` 添加 `CreatorContentProjectData` 导入和状态：

```ts
const [creatorContentProjectData, setCreatorContentProjectData] = useState<Array<{
  projectId: string;
  data: CreatorContentProjectData;
}>>([]);
```

在现有 `refresh()` 中按 `entryProjects` 并行读取 `/creator-content`；单项目失败使用 `{ contentProjects: [] }` 降级，不影响任务和素材刷新。新增 `Content` 面板：

- 项目选择器与创建输入；POST 只提交 `{ title, status: 'idea' }`。
- 选中内容项目后显示 title/status、Brief、Outline、Storyboard、Retrospective 表单；PATCH 保存所有已编辑字段。
- “新增分镜”生成浏览器端临时 ID，默认 position 为当前最大 position + 1、purpose 为空；保存时阻止空 purpose 并显示现有 error 区。
- 每个分镜从当前项目 `creatorMediaProjectData` 中选择 `availability === 'available'` 且未关联的素材；POST/DELETE 调用 storyboard media API，成功后 refresh。
- 已关联 missing 素材在分镜内显示文件名、路径和 `Missing`；不从既有关联中自动移除。
- 任务关联使用同项目任务候选；从内容侧 POST/DELETE task API。任务卡只显示关联内容数量，不提供双向编辑。
- 删除前调用 `window.confirm('Delete this content project?')`；用户拒绝时不请求，确认后 DELETE 并 refresh。

添加 `creator-content` CSS：两列编辑表单在小屏折叠为一列；分镜列表沿用 `.creator-list` 和 `.creator-chip`，不引入画布、预览或硬编码颜色。

- [ ] **Step 4：运行页面测试和类型检查**

Run:

```bash
corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "content project|storyboard media|deleting a content" --maxWorkers=1
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
```

Expected: exit 0。

- [ ] **Step 5：提交 Web 面板**

```bash
git add apps/web/src/components/TasksView.tsx apps/web/src/styles/home/tasks.css apps/web/tests/components/TasksView.page.test.tsx
git commit -m "feat: manage creator content chains"
```

## Task 5：真实项目 dogfood 与交付检查

**Files:**
- Modify: none unless发现可复现缺陷；缺陷修复单独提交。

- [ ] **Step 1：启动本地 daemon 并建立内容链**

```powershell
corepack pnpm tools-dev start daemon
corepack pnpm tools-dev status daemon --json
```

对 CW-01 真实验收项目执行：创建一个内容项目，填写 Brief 和 Outline，保存至少两个分镜；给其中一个分镜关联一个已有 available 素材；填写 retrospective；关联一个已有任务。

- [ ] **Step 2：验证重启保留与 missing 显示**

```powershell
corepack pnpm tools-dev restart daemon
```

重新读取内容 API，断言内容、两个分镜、任务关联和素材关联仍在。通过只创建并删除一个命名为 `__cw02_missing_probe.jpg` 的临时探针文件执行 CW-01 重扫；确认内容分镜仍保留该 asset ID 并显示 Missing。不得移动、删除或修改用户原始素材。

- [ ] **Step 3：运行完整相关回归**

```bash
corepack pnpm --filter @open-design/contracts build
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-workbench-routes.test.ts tests/creator-media-scanner.test.ts tests/creator-media-store.test.ts tests/creator-media-routes.test.ts tests/creator-content-store.test.ts tests/creator-content-routes.test.ts --maxWorkers=1
corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "creator content|content project|storyboard" --maxWorkers=1
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
corepack pnpm guard
git diff --check
git status --short
```

Expected: 所有命令 exit 0，工作树除刻意修复外干净。Windows 上若整份 `TasksView.page.test.tsx` 因既有 Vitest 子进程超时，必须如实记录，不得将未完成整文件运行表述为通过。
