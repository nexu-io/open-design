# Launch Studio 商店截图第一阶段验收记录

## 文档状态

- 日期：2026-07-30
- 验收结论：**实现完成，验收受阻并继续进行；不能宣称第一阶段已验收。**
- 验收提交：`eec156b110e844413ef63e13cd8654b0a5d634ff`
- 环境：macOS 14.8.7（23J520）、x86_64、Node `v24.16.0`、pnpm `10.33.2`。
- 版本固定方式：临时 Corepack `pnpm` shim 位于忽略的 `.tmp/task-12-corepack-bin/`，保证嵌套脚本也使用 `10.33.2`。

本记录严格区分实际通过、没有终态摘要的命令，以及受环境阻塞的真实验收。未出现完整终态摘要的测试不得视为通过。

## 自动化验收

| 项目 | 实际命令 | 结果 | 证据说明 |
| --- | --- | --- | --- |
| pnpm 版本 | `corepack pnpm --version` | 通过 | 输出 `10.33.2`。 |
| 守卫 | `corepack pnpm guard` | 通过 | 退出码为 0；Residual JavaScript、certain-exempt、packaged-leaf、daemon-core 四项检查均输出 passed。 |
| 全仓类型检查 | `corepack pnpm typecheck` | 通过 | 命令返回退出码 0；输出显示 25 个 workspace project 的递归 typecheck 已启动并持续完成。 |
| i18n | `corepack pnpm i18n:check` | 通过 | 输出 `i18n P0 check passed`。 |
| 商店截图领域包 | `corepack pnpm --filter @launch-studio/store-screenshot test` | 通过 | 完整摘要：5 个文件、24 个测试通过。 |
| contracts | `corepack pnpm --filter @open-design/contracts test` | 通过 | 完整摘要：37 个文件、251 个测试通过。 |
| daemon 全包 | `corepack pnpm --filter @open-design/daemon test` | 未通过 | 已观察到 `connection-test.test.ts` 1 项、`amr-session-resume.test.ts` 8 项、`plugins-headless-run.test.ts` 1 项、`langfuse-trace.test.ts` 2 项、`proxy-dispatcher-options.test.ts` 7 项失败；失败后进程未自然退出，最终发送 `SIGINT`。这些失败不位于商店截图领域，但全包门槛不能记为通过。 |
| web 全包 | `corepack pnpm --filter @open-design/web test` | 未通过 | 完整摘要：446 个文件中 445 个通过、1 个失败；4938 个测试中 4930 个通过、1 个失败、7 个跳过。失败项为 `App.connectors.test.tsx` 的首次隐私同意分享选择测试，与商店截图领域无直接关系；命令以退出码 1 结束。 |
| daemon 精确补充 | `corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/store-screenshot-renderer.test.ts --reporter=verbose` | 通过 | 完整摘要：1 个文件、10 个测试通过，涵盖双平台尺寸、无 Alpha、manifest、ZIP 与 PNG/JPEG/WebP 素材。 |
| web 精确补充 | `corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/features/store-screenshots/workspace.test.tsx tests/features/store-screenshots/api.test.ts --reporter=verbose` | 通过 | 完整摘要：2 个文件、26 个测试通过，涵盖双平台校验、无 Provider 手工编辑、ChangeSet、轮询、下载及成功响应契约。 |
| 任务 11 HTTP/CLI 规格 | `pnpm --dir e2e exec vitest run -c vitest.config.ts specs/store-screenshots/main.spec.ts --reporter=verbose` | 通过 | 完整摘要：1 个文件、1 个测试通过，耗时 23.37 秒。 |
| 任务 11 功能 UI | `pnpm --dir e2e exec playwright test -c playwright.config.ts ui/store-screenshots.test.ts --workers=1` | 通过 | 完整摘要：1 个测试通过；覆盖真实浏览器编辑、校验、下载与 ZIP 检查。 |
| 任务 11 视觉无更新 | `pnpm --dir e2e exec playwright test -c playwright.visual.config.ts ui/visual-store-screenshots.test.ts --workers=1` | 通过 | 更新与真实 fixture 内容一致的基线后，连续两次无更新运行通过；第二次完整摘要为 1 个测试通过。仅隐藏动态 `<time>`，未放宽截图阈值。 |
| diff 空白检查 | `git diff --check` | 通过 | 退出码为 0；执行时没有输出。 |

## 路径 A：无 Provider 的真实手工流程

在隔离的 `tools-dev` daemon + web 实例上，使用真实 HTTP API 完成了下列流程：

1. 创建商店截图项目和 4 页文档；
2. 上传 4 张仓库内实际 PNG 素材；
3. 在 4 页中使用 `minimal-center`、`gradient-device`、`editorial-split` 三个模板；
4. 实际修改标题、背景色、素材位置/缩放、素材引用及页面顺序；
5. 同时校验并导出 App Store 与 Google Play；
6. 用 Sharp 重读 ZIP 内全部 PNG，检查尺寸、三通道、无 Alpha 和 SHA-256；
7. 解压 ZIP，以 manifest 中的每个 hash 对照文件字节。

高价值生成物保留在忽略目录，不纳入 Git：

- 仓库相对路径：`.superpowers/sdd/launch-studio-store-screenshot-implementation-plan/task-12-artifacts/manual-path-a-store-screenshots.zip`
- 绝对路径：`/Users/xiangzi/Documents/workspace/launch-studio/.worktrees/store-screenshot-phase1/.superpowers/sdd/launch-studio-store-screenshot-implementation-plan/task-12-artifacts/manual-path-a-store-screenshots.zip`
- 对照资料：同目录的 `manual-path-a-manifest.json` 与 `manual-path-a-summary.json`。

ZIP 为 554,555 bytes，manifest 有 8 个文件。四张 App Store PNG 均为 `1290 × 2796`，四张 Google Play PNG 均为 `1080 × 1920`；8 张全部为 `channels: 3`、`hasAlpha: false`。每一张的 SHA-256 已由 Sharp/Node 重新计算并与 manifest 相同，完整 hash 列表在上述忽略的 summary 中。

## 路径 B：真实 AI Provider

状态：**受阻，未用 mock 冒充真实 AI。**

只读检查结果如下：

- `/api/agents` 显示本机 `Codex CLI` 可执行，但 `BYOK OpenCode` 不可用；
- `/api/app-config` 中不存在 Provider 配置；检查过程未读取或输出 API key；
- 对真实文档提交 `POST .../generate` 后，任务终态为 `failed`，精确错误为：

```text
PROVIDER_NOT_CONFIGURED
No configured provider is available for structured JSON generation
```

因此本轮无法安全执行真实 4 页生成、锁定标题、重写、预览/应用、恢复及再次导出。补齐一个用户已授权的本地 CLI/Provider 后，必须重新完成这条路径，不能以已有单元测试替代。

## 桌面端烟雾验收

### macOS

状态：**通过。**

初次启动失败后，按系统化调试得到以下根因：

- `electron@41.3.0` 的 116MB 缓存 ZIP 通过 `unzip -t` 完整性检查，共 585 个条目；
- 仓库依赖的 `extract-zip@2.0.1` 在当前 Node `v24.16.0` 下，无论目标是现有目录还是新建的 `/tmp` 目录，都会在写入 `electron.icns` 的 204,727/272,259 bytes 时提前以退出码 0 结束，Promise 没有完成；
- 因此此前只得到约 224KB 的不完整 `Electron.app`，缺少 `Frameworks` 和 `path.txt`，直接运行会报动态库缺失。

本轮使用系统 `unzip` 解开已校验的本地缓存 ZIP，并恢复安装器应生成的无换行 `path.txt`。随后 `electron --version` 明确输出 `v41.3.0`。这是忽略的本地依赖修复，未改源码、lockfile 或全局依赖。

按仓库规定使用下列命令骨架运行（`...` 代表本轮隔离数据目录与端口参数）：

```bash
pnpm tools-dev start desktop --namespace task12-acceptance ...
pnpm tools-dev inspect desktop status --namespace task12-acceptance --json
pnpm tools-dev inspect desktop eval --namespace task12-acceptance ... --json
pnpm tools-dev inspect desktop screenshot --namespace task12-acceptance ... --json
pnpm tools-dev stop --namespace task12-acceptance --json
```

真实结果：

- daemon、web、desktop 均进入 `running`，desktop PID 为 `10984`，IPC 正常；
- desktop 状态 URL 为 `http://127.0.0.1:43862`；
- Electron 内执行结果为 `title: Open Design`、`url: http://127.0.0.1:43862/onboarding`、`readyState: complete`，页面正文是中文登录引导；
- 截图成功写入 `.superpowers/sdd/launch-studio-store-screenshot-implementation-plan/task-12-artifacts/macos-desktop-smoke.png`，已人工查看为真实 Open Design 登录页面；
- `tools-dev status` 的 `windowVisible` 字段为 `false`，但 webContents 已完整加载且截图成功；本轮不把它解释为前台交互验证；
- 验证后通过 IPC 正常停止三个进程，最终 namespace 状态为 `not-running`，daemon、web、desktop 均为 `idle`。

### Windows

状态：**受阻。**

当前主机为 Darwin，不存在 `powershell`、`pwsh`、`wine`、`wine64`、`qemu-system-x86_64`。虽然安装了 VirtualBox，但 `VBoxManage list runningvms` 没有运行中的 VM，`VBoxManage list vms` 仅列出两个 `<inaccessible>` 条目：

```text
<inaccessible> {0e5512f7-f351-46cc-97da-0c4bccd17579}
<inaccessible> {7ad4e9c3-84f4-4753-bad1-b125a797b8de}
```

未把 CI、打包帮助输出或代码审查当作 Windows 真机验收。需要可启动的 Windows runner/VM 后，按 `tools/pack/AGENTS.md` 的真实 Windows 路径重验。

## 未纳入第一阶段

仍遵循设计规格：iPad/Android Tablet、横屏、Feature Graphic、应用图标、Preview Video、自动上传商店、多语言/RTL 排版、社交媒体套件、专业时间轴和 Photoshop 级编辑均不属于本阶段。

## 延后次要事项台账处置建议

| 来源 | 事项 | 建议 |
| --- | --- | --- |
| 任务 2 | `deriveStoreScreenshotPage` 的可变引用 | 后续改为深拷贝或只读输出，并添加突变回归用例。 |
| 任务 3 | 契约成功/拒绝用例覆盖度 | 按 API 契约族补齐边界用例。 |
| 任务 5 | 嵌套 JSON 非递归 strict、内部损坏映射 400 | 统一嵌套 strict；区分客户端输入错误与存储损坏。 |
| 任务 6 | 最多 18 张高分辨率 PNG 与 ZIP 同驻内存 | 评估流式归档或显式输出上限；补 ProjectStorage 中断/reconcile 回归。 |
| 任务 8 | 硬链接发布与 `--wait` 取消/超时 | 为跨文件系统发布提供替代方案，并支持 AbortSignal/超时。 |
| 任务 10 | 多页 review、JPEG/WebP raw 成功、真实 sidecar round-trip | 将其列为后续集成验收补充；本轮 renderer 已覆盖真实 JPEG/WebP 合成。 |

## 计划冲突与后续门槛

实施计划的“完成定义”要求真实 AI、macOS 和 Windows desktop smoke 全部完成；其 12.3 节又要求把规格状态改为“第一阶段已实现并验收”。macOS desktop smoke 已完成，但真实 AI 与 Windows desktop smoke 仍未完成，故不能执行后者。本规格只记录“第一阶段实现完成；验收受阻并继续进行”。是否在未完成真实 AI 和 Windows desktop smoke 的情况下改变完成定义，须由维护者另行决定。

## 复跑记录（2026-08-05）：真实 AI 路径 B 再次受阻于账户额度

- 日期：2026-08-05
- 环境：同 2026-07-30（macOS、x86_64、Node `v24.16.0`、pnpm `10.33.2`），worktree `feature/store-screenshot-phase1`。
- 本次已解除上一轮“无 provider”阻塞并验证 Provider 链路，但真实生成仍无法完成，原因改为 **Codex 账户额度用尽**。

### 已完成并验证

1. **Provider 已配置**：在隔离 namespace `path-b-0805` 的 daemon 中，通过 `PUT /api/app-config` 写入
   `agentId=codex`、`agentModels.codex.model=gpt-5.5`；`GET /api/app-config` 复核一致。
2. **Codex CLI 可用**：`/api/agents` 显示 `codex available: true`（`codex login status` 为
   `Logged in using ChatGPT`）。
3. **真实一次调用成功**：临时 `CODEX_HOME`（仅复制 auth，未含应用托管 MCP 状态）下执行
   `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true -C /tmp --model gpt-5.5`，
   模型返回 `{"ok":true}`（13 秒，usage 正常）。
4. **Path B 脚本已跑通到生成任务**：创建项目、创建 4 页文档、上传 4 张仓库真实 PNG 素材全部通过；
   `POST /generate` 任务确实启动真实 Codex CLI（stderr 出现读取提示词与 AGENTS.md 截断警告）。

### 根因与处置

- 首次失败为 ChatGPT 应用托管的 MCP（`chatgpt.com/backend-api/ps/mcp`、`cloudflare-api` OAuth 刷新被拒），
  通过 `OD_CODEX_DISABLE_PLUGINS=1` + 临时 `CODEX_HOME`（不含应用托管状态）绕开。
- 当前失败为模型调用前的账户额度错误，精确信息：
  `You've hit your usage limit ... try again at Aug 8th, 2026 4:13 PM.`
  即使最小一次调用也返回同一错误，故不是代码或提示词问题，属于外部 Provider 额度阻塞。

### 结论

- 真实 AI 路径 B 仍未验收：生成、锁定、改写、恢复、导出无法在无模型额度下完成。
- 复跑证据保留在 Git 忽略目录：
  `.worktrees/store-screenshot-phase1/.tmp/e2e/path-b-0805/artifacts/summary.json` 与同目录脚本
  （`run-path-b.mjs`）。
- 恢复方式：账户额度恢复（预计 2026-08-08 后）或提供其他已授权 Provider 后，
  以相同 namespace 环境重跑脚本；无需改动实现代码。
