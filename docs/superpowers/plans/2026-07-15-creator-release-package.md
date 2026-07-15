# Creator 发布交付包（CW-03）实施计划

**目标：** 将 CW-02 内容项目转换为可人工发布、可核验、可导出的发布交付包。

**架构：** contracts 定义 DTO；daemon 使用独立项目 JSON 存储和 HTTP 路由；Web 仅通过 HTTP 与 contracts 管理发布包。内容、任务、素材和发布包均保持独立，只存稳定 ID。

**规格：** `docs/superpowers/specs/2026-07-15-creator-release-package-design.md`

## Task 1：Contracts

新建 `packages/contracts/src/api/creator-release-package.ts`，并从 `packages/contracts/src/index.ts` 导出。定义 package、平台、状态、固定 checklist、集合、create/update DTO。update DTO 不得允许客户端写入 ID、projectId、createdAt 或 updatedAt。

**验收：** `corepack pnpm --filter @open-design/contracts build`。

## Task 2：安全存储

新建 `apps/daemon/src/creator-release/store.ts`、`apps/daemon/tests/creator-release-store.test.ts`。实现项目级读写、原子 rename、path 安全、默认 checklist、字段验证、重启恢复及删除。只对 ENOENT、JSON 语法错误和非法结构降级为空，其他 I/O 错误必须传播。

**验收：** store 定向测试和 daemon typecheck。

## Task 3：API 与项目边界

新建 `apps/daemon/src/routes/creator-release.ts`、`apps/daemon/tests/creator-release-routes.test.ts`，修改 `apps/daemon/src/server.ts` 注册路由。实现 CRUD 与 JSON export；校验项目、内容和素材同项目，新增引用只接受 available，missing 既有引用仅原字段保留。实现 `ready`/`published` 检查表门禁。

**验收：** 覆盖跨项目拒绝、missing 保留、状态门禁、删除不级联和导出稳定性。

## Task 4：Web Release 面板

修改 `apps/web/src/components/TasksView.tsx`、`apps/web/src/styles/home/tasks.css`、`apps/web/tests/components/TasksView.page.test.tsx`。按项目加载、创建/编辑、检查表、素材选择、missing 提示、删除确认和 JSON/Markdown 下载。单项目失败不得影响 Content/Media/Tasks。禁止导入 daemon 私有源码，禁止自动发布。

**验收：** 页面测试覆盖创建、门禁、缺失、降级、删除、导出；web typecheck/build。

## Task 5：真实验收与回归

在 `creator-media-acceptance-20260712` 创建 `[CW-03验收]` B 站交付包，关联 CW-02 内容与可用素材，完成检查项、测试 URL，重启后验证 JSON/Markdown 导出。使用明确命名临时探针验证 missing 引用保留；不得修改用户原始素材。

**最终验证：** contracts build；release store/routes 定向 Vitest；Web Release 定向 Vitest、typecheck、build；`git diff --check`。根 guard 若仍只被既有 `design-systems/*` stale 记录阻塞，须如实记录且禁止顺带修改设计系统文件。
