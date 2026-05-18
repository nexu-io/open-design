# Plugin System 测试集与验收指南

状态日期：2026-05-14

这份文档覆盖 `docs/plugins-spec.md`、`docs/plans/plugin-registry.md`、`docs/plans/plugins-implementation.md`
本期插件系统需求。目标是把需求进度、自动化测试、手工验收和推荐执行顺序放在同一个地方，方便发布前按清单验证。

## 1. 当前进度摘要

| 模块 | 进度 | 证据 | 发布判断 |
| --- | --- | --- | --- |
| Plugin manifest / contracts | 基本完成 | `packages/contracts/src/plugins/*`、`packages/contracts/tests/plugins-manifest.test.ts` | 进入回归维护 |
| Plugin runtime parser / merge / digest | 基本完成 | `packages/plugin-runtime/src/*`、`packages/plugin-runtime/tests/*` | 进入回归维护 |
| Daemon install / apply / snapshot | 完成 | `apps/daemon/src/plugins/{installer,apply,snapshots,resolve-snapshot}.ts`、`apps/daemon/tests/plugins-dod-e2e.test.ts` | v1 主路径可验收 |
| Pipeline / GenUI / devloop | 完成主路径 | `apps/daemon/src/plugins/{pipeline,pipeline-runner,until}.ts`、`apps/daemon/src/genui/*` | 需要继续跑事件流回归 |
| First-party atoms and scenarios | Phase 6/7/8 已落地 | `apps/daemon/src/plugins/atoms/*`、`plugins/_official/scenarios/*`、对应 `plugins-*-e2e.test.ts` | 需要按场景抽样验收 |
| Headless CLI loop | 主路径完成 | `od plugin install/run`、`od project create`、`od run start/watch`、`apps/daemon/tests/plugins-headless-run.test.ts` | v1 必测 |
| Federated registry | P0/P1/P3/P4 大多完成 | `packages/registry-protocol`、`apps/daemon/src/registry/*`、`apps/daemon/tests/registry-backends.test.ts` | DoD 仍有开放项 |
| Web Plugins UI | Installed / Available / Sources 可用，Team 未完成 | `apps/web/src/components/PluginsView.tsx`、`apps/web/tests/components/PluginsView.test.tsx` | 需要 UI 手工验收 |
| Plugin detail surface | 已有详情 modal、provenance、capabilities、share menu | `PluginDetailsModal.tsx`、`plugin-details/*` | P2.5 的 version dropdown 仍需补 |
| Team / private marketplace UI | 未完成 | `TeamPanel()` 仍是 coming soon | P2.6 未达成 |
| Trust badge consistency | 部分完成 | cards/detail/source tab 有 `official/trusted/restricted` 文案 | P2.7 需要视觉和文案统一验收 |
| Registry v1 DoD | 未完全关闭 | `docs/plans/plugin-registry.md` §4 仍是 `[ ]` | 不应标为 registry v1 fully done |

### 当前开放项

| ID | 开放项 | 测试策略 |
| --- | --- | --- |
| GAP-001 | `plugin-registry.md` 的 R1 / R3 仍未勾选 | 增加 CLI/UI parity 和 SKILL.md 发布可移植性回归 |
| GAP-002 | P2.5 plugin detail drawer 缺 version dropdown | 手工验收先记录风险，后续补 UI 测试 |
| GAP-003 | P2.6 Team / private marketplace UI 未落地 | 不纳入发布通过项，作为明确未完成范围 |
| GAP-004 | P2.7 trust badge consistency 未完整确认 | Playwright/人工视觉组合验收 |
| GAP-005 | registry v1 DoD 的第三方 fork 工作流还缺 e2e fixture | 用本地 fixture catalog 做替代 smoke，真实第三方 publisher 作为发布前人工项 |
| GAP-006 | scenario registry convergence 仍是下一步 | 不阻塞本期插件系统，但 Home chips / Plugins facets / composer search 要抽样对齐 |

## 2. 推荐执行顺序

### 2.1 快速 PR gate

从仓库根目录执行：

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/contracts test
pnpm --filter @open-design/plugin-runtime test
pnpm --filter @open-design/registry-protocol test
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
```

验收标准：

- 所有命令退出码为 `0`。
- 如 `@open-design/daemon test` 出现非插件相关历史失败，必须在发布记录里列出文件名、失败用例、是否已知，不能只写“daemon failed”。

### 2.2 插件聚焦回归

当只想验证本期插件系统，可以先跑这些较高信号文件：

```bash
pnpm --dir apps/daemon exec vitest run -c vitest.config.ts \
  tests/plugins-dod-e2e.test.ts \
  tests/plugins-headless-run.test.ts \
  tests/plugins-e2e-fixture.test.ts \
  tests/plugins-apply.test.ts \
  tests/plugins-installer.test.ts \
  tests/plugins-installer-archive.test.ts \
  tests/plugins-marketplaces.test.ts \
  tests/plugins-marketplace-doctor.test.ts \
  tests/plugins-lockfile.test.ts \
  tests/plugins-upgrade.test.ts \
  tests/plugins-connector-gate.test.ts \
  tests/plugins-tool-token-gate.test.ts \
  tests/plugins-pipeline-runner.test.ts \
  tests/plugins-code-migration-e2e.test.ts \
  tests/plugins-figma-migration-e2e.test.ts \
  tests/registry-backends.test.ts
```

```bash
pnpm --dir apps/web exec vitest run -c vitest.config.ts \
  tests/components/PluginsView.test.tsx \
  tests/components/PluginDetailsModal.dispatch.test.tsx \
  tests/components/PluginInputsForm.test.tsx \
  tests/components/InlinePluginsRail.test.tsx \
  tests/components/HomeHero.plugin-picker.test.tsx \
  tests/components/HomeView.plugin-i18n.test.tsx \
  tests/components/plugins-home-section.test.tsx \
  tests/components/plugins-home-facets.test.ts \
  tests/components/MarketplaceView.test.tsx \
  tests/router-marketplace.test.ts \
  tests/runtime/plugin-source.test.ts
```

```bash
pnpm --filter @open-design/landing-page build
```

验收标准：

- 聚焦文件请使用 `pnpm --dir <package> exec vitest ... <files>`；不要用
  `pnpm --filter <package> test -- <files>`，这个仓库里该写法会退化成全量测试。
- daemon 聚焦回归覆盖 install、marketplace、snapshot、pipeline、GenUI、trust gate、lockfile、archive integrity。
- web 聚焦回归覆盖 Plugins tab、detail dispatch、home/plugin picker、marketplace route、plugin source links。
- landing page build 通过，表示 public marketplace/search renderer 仍可静态生成。

### 2.3 用户级 UI smoke

UI smoke 耗时更高，建议发布前跑：

```bash
cd e2e
pnpm exec playwright test -c playwright.config.ts ui/app.test.ts --grep "plugin-create-import"
```

验收标准：

- `Create plugin` 会进入 agent-assisted authoring prompt。
- `Import plugin` 能安装本地 fixture。
- 安装后回到 Installed tab。
- Home `@query` 能选中用户安装插件。
- 创建项目请求携带 `pluginId` 和用户最终 prompt。

### 2.4 本地真实 daemon smoke

选择未占用端口：

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

然后浏览器访问 `http://127.0.0.1:17573`，手工执行：

1. 进入 Plugins。
2. Installed 里确认 official starters 可见。
3. Available 里确认 official 已安装项显示 `Use`，未安装项显示 `Install`。
4. Sources 添加一个 raw `open-design-marketplace.json` URL，刷新、改 trust、移除。
5. 导入本地 fixture plugin，点详情，确认 Source、Capabilities、Workflow、Share 菜单可见。
6. Home 里用 `@` 搜索刚导入的 plugin，创建项目，确认项目消息里出现 plugin chip。

## 3. 自动化测试矩阵

### A. Contract and Schema

| ID | 场景 | 核心断言 | 覆盖 |
| --- | --- | --- | --- |
| PS-A01 | Plugin manifest schema | `open-design.json` v1 字段、taskKind、inputs、pipeline、genui、capabilities 可解析 | `packages/contracts/tests/plugins-manifest.test.ts` |
| PS-A02 | Marketplace schema | `official/trusted/restricted` trust vocabulary，versions/integrity/publisher 等字段可 passthrough | `packages/contracts/src/plugins/marketplace.ts` + package tests |
| PS-A03 | RegistryBackend protocol | static/GitHub/DB 后端共享 list/search/resolve/publish 语义 | `packages/registry-protocol/tests/backend.test.ts`、`apps/daemon/tests/registry-backends.test.ts` |
| PS-A04 | Plugin block renderer | snapshot 渲染的 prompt block 稳定，不在 daemon/contracts 双份漂移 | `packages/contracts/src/prompts/plugin-block.ts`、`apps/daemon/tests/plugins-dod-e2e.test.ts` |

### B. Runtime Parsing and Portability

| ID | 场景 | 核心断言 | 覆盖 |
| --- | --- | --- | --- |
| PS-B01 | SKILL.md-only fallback | `SKILL.md` frontmatter 可合成 schema-valid `PluginManifest` | `packages/plugin-runtime/tests/adapter-agent-skill.test.ts` |
| PS-B02 | Claude plugin adapter | `.claude-plugin/plugin.json` 可作为兼容输入 | `packages/plugin-runtime/tests/parsers.test.ts`、`validate.test.ts` |
| PS-B03 | Sidecar manifest wins | `open-design.json` 覆盖 adapter fallback，不复制 SKILL.md body | `packages/plugin-runtime/tests/merge.test.ts` |
| PS-B04 | Deterministic digest | 同一 manifest/source 产出稳定 digest，升级后 digest 改变 | `packages/plugin-runtime/tests/digest.test.ts`、`plugins-dod-e2e.test.ts` |
| PS-B05 | Metadata-only preset | 只有 `open-design.json` 的目录必须被 doctor 标为 non-runnable | `apps/daemon/tests/plugins-validate.test.ts`、`plugins-verify.test.ts` |

### C. Install, Apply, Snapshot

| ID | 场景 | 核心断言 | 覆盖 |
| --- | --- | --- | --- |
| PS-C01 | Cold local install | local folder 安装到 user plugin root，SQLite 写 installed row | `apps/daemon/tests/plugins-e2e-fixture.test.ts` |
| PS-C02 | Archive install | HTTPS/GitHub archive 解包前校验 `sha256:`，mismatch fail closed | `apps/daemon/tests/plugins-installer-archive.test.ts` |
| PS-C03 | Install safety | traversal、symlink、size guard 不允许越界写入 | `apps/daemon/tests/plugins-installer.test.ts` |
| PS-C04 | Pure apply | 连续 apply digest 相同，project cwd 不变，apply 本身不写 snapshot | `apps/daemon/tests/plugins-dod-e2e.test.ts` |
| PS-C05 | Snapshot writer boundary | `applied_plugin_snapshots` 只由 snapshot/resolver 路径写入 | `apps/daemon/tests/plugins-snapshots.test.ts`、`plugins-dod-e2e.test.ts` |
| PS-C06 | Replay invariance | 插件升级后旧 snapshot prompt block byte-equal | `apps/daemon/tests/plugins-dod-e2e.test.ts` |
| PS-C07 | Snapshot GC | unreferenced snapshot 按 TTL 可清理，referenced snapshot pin 住 | `apps/daemon/tests/plugins-snapshot-gc.test.ts` |
| PS-C08 | API fallback reject | daemon 不在路径时，plugin run 走 fallback 必须 409 | `apps/daemon/tests/proxy-routes.test.ts` |

### D. CLI and Headless Loop

| ID | 场景 | 核心断言 | 覆盖 |
| --- | --- | --- | --- |
| PS-D01 | Headless install -> project -> run | HTTP/CLI 路径都 pin `appliedPluginSnapshotId` | `apps/daemon/tests/plugins-headless-run.test.ts` |
| PS-D02 | CLI prompt injection | `od plugin run` 把 query、inputs、local SKILL.md 注入 agent prompt | `apps/daemon/tests/plugins-headless-run.test.ts` |
| PS-D03 | Project/run/files basics | `od project create`、`od run start/watch/cancel/list/info`、`od files read` 可用 | `apps/daemon/tests/plugins-headless-run.test.ts` + CLI tests |
| PS-D04 | Marketplace CLI | `od marketplace plugins/search/doctor/login` 输出稳定，login 只调用 `gh` | `apps/daemon/tests/plugins-headless-run.test.ts`、`plugins-marketplace-doctor.test.ts` |
| PS-D05 | Plugin publish/share | user plugin 进入 publish/contribute workflow，GitHub PR payload 稳定 | `apps/daemon/tests/plugins-headless-run.test.ts`、`plugins-publish.test.ts` |
| PS-D06 | Plugin upgrade/yank | upgrade 遵守 policy/lockfile，yank 不硬删版本 | `apps/daemon/tests/plugins-upgrade.test.ts`、`plugins-publish.test.ts` |

### E. Registry and Federation

| ID | 场景 | 核心断言 | 覆盖 |
| --- | --- | --- | --- |
| PS-E01 | Raw marketplace only | GitHub tree HTML 被 parser 拒绝 | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| PS-E02 | Official seed | official registry 非空，trust 为 `official`，bundled entries 可 resolve | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| PS-E03 | Community seed | community registry 作为 `restricted` source 加载 | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| PS-E04 | Version resolution | exact、dist-tag、semver range、yanked beta 解析正确 | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| PS-E05 | Provenance | marketplace install 保留 sourceMarketplaceId、entry name/version、resolved ref、integrity | `apps/daemon/tests/plugins-installer.test.ts` |
| PS-E06 | Lockfile replay | `.od/od-plugin-lock.json` 可以重放 exact install | `apps/daemon/tests/plugins-lockfile.test.ts` |
| PS-E07 | Marketplace doctor | invalid name/source/capability/license/yank reason 被报告 | `apps/daemon/tests/plugins-marketplace-doctor.test.ts` |
| PS-E08 | Public site renderer | `/plugins`、detail route、`/plugins/search.json` build 通过 | `pnpm --filter @open-design/landing-page build` |

### F. Pipeline, GenUI, Atoms

| ID | 场景 | 核心断言 | 覆盖 |
| --- | --- | --- | --- |
| PS-F01 | First pipeline event | plugin run 的第一批事件包含 `pipeline_stage_started`，早于 agent message chunk | `apps/daemon/tests/plugins-headless-run.test.ts` |
| PS-F02 | Devloop until | `until` evaluator、最大迭代数、失败策略稳定 | `apps/daemon/tests/plugins-until.test.ts`、`plugins-pipeline-runner.test.ts` |
| PS-F03 | GenUI persistence | project-tier answer 跨 conversation 复用，发 cache response | `apps/daemon/tests/plugins-pipeline-runner.test.ts` |
| PS-F04 | GenUI renderer | form/choice/confirmation/oauth-prompt 由产品组件渲染 | `apps/web/tests/components/GenUISurfaceRenderer*.test.tsx` |
| PS-F05 | Auto diff review surface | stage 带 `diff-review` 时自动生成 choice surface | `apps/daemon/tests/plugins-auto-surfaces.test.ts` |
| PS-F06 | Figma migration atoms | `figma-extract`、`token-map` 输出稳定 fixtures | `apps/daemon/tests/plugins-figma-*.test.ts` |
| PS-F07 | Code migration atoms | `code-import`、`design-extract`、`rewrite-plan`、`patch-edit`、`diff-review`、`build-test` 串起来 | `apps/daemon/tests/plugins-code-migration-e2e.test.ts` |
| PS-F08 | Handoff atom | handoff manifest round trip，promotion ladder 合法 | `apps/daemon/tests/plugins-handoff*.test.ts` |

### G. Trust, Capability, Security

| ID | 场景 | 核心断言 | 覆盖 |
| --- | --- | --- | --- |
| PS-G01 | Restricted capability gate | restricted plugin 缺 `connector:<id>` 时 apply 409 / exit 66 | `apps/daemon/tests/plugins-dod-e2e.test.ts` |
| PS-G02 | Tool token revalidation | 泄漏 token 也不能绕过 connector gate | `apps/daemon/tests/plugins-tool-token-gate.test.ts` |
| PS-G03 | Capability grant/revoke | trust endpoint 可授予/撤销 capability，非法 capability 被拒 | `apps/daemon/tests/plugins-trust.test.ts` |
| PS-G04 | Asset sandbox | plugin asset route 不允许路径穿越，返回合适 CSP/content-type | `apps/daemon/tests/plugins-asset-route.test.ts` |
| PS-G05 | API token guard | public bind 没有 `OD_API_TOKEN` 被拒，loopback 跳过 bearer | `apps/daemon/tests/api-token-guard.test.ts` |
| PS-G06 | Origin/CORS | daemon route origin validation 不放宽 | `apps/daemon/tests/origin-validation.test.ts`、`server-cors.test.ts` |

### H. Web Product Surface

| ID | 场景 | 核心断言 | 覆盖 |
| --- | --- | --- | --- |
| PS-H01 | Plugins tabs | Installed / Available / Sources / Team tab 可切换 | `apps/web/tests/components/PluginsView.test.tsx` |
| PS-H02 | Available state | 已安装 official 显示 `Use`，未安装显示 `Install`，版本不同显示 upgrade 状态 | `apps/web/tests/components/PluginsView.test.tsx` |
| PS-H03 | Sources operations | add/refresh/remove/trust 调用对应 API wrapper | `apps/web/tests/components/PluginsView.test.tsx` |
| PS-H04 | Create plugin flow | Create plugin 进入 agent-assisted authoring，不打开旧 import modal | `apps/web/tests/components/PluginsView.test.tsx`、`e2e/ui/app.test.ts` |
| PS-H05 | Detail modal dispatch | media/html/design/scenario 四种详情入口正确分派 | `apps/web/tests/components/PluginDetailsModal.dispatch.test.tsx` |
| PS-H06 | Detail metadata | Source、capabilities、workflow、GenUI、connectors、author/provenance 可见 | 需补更细组件测试，当前由 detail component + manual 验收覆盖 |
| PS-H07 | Share menu | copy install command / id / link / markdown badge，source/homepage/marketplace link 可用 | `apps/web/tests/components/PluginShareMenu.test.tsx` |
| PS-H08 | Home/Composer apply | Home `@` picker、ChatComposer plugin rail、input form 都能 apply plugin | `HomeHero.plugin-picker.test.tsx`、`InlinePluginsRail.test.tsx`、`PluginInputsForm.test.tsx` |
| PS-H09 | Trust badge consistency | `official/trusted/restricted` 在 card/drawer/source/install confirm 语言一致 | 自动化不足，发布前手工验收 |

## 4. 手工验收清单

### 4.1 Plugin detail drawer

| ID | 步骤 | 期望 |
| --- | --- | --- |
| MAN-001 | 打开一个 official scenario plugin 详情 | 标题、版本、trust、source、workflow、capabilities 都可读 |
| MAN-002 | 打开一个 marketplace-installed plugin 详情 | provenance 显示 sourceMarketplaceId / entry name / source kind |
| MAN-003 | 打开 Share 菜单，复制 install command | 剪贴板内容为 `od plugin install <plugin-or-source>`，不是 marketplace id 误当 plugin id |
| MAN-004 | 打开带 inputs 的 plugin | inputs 类型、required、default、options 都显示 |
| MAN-005 | 尝试查找 version dropdown | 当前预期：缺失，记录为 P2.5 未完成 |

### 4.2 Sources / Available / Team

| ID | 步骤 | 期望 |
| --- | --- | --- |
| MAN-006 | Sources 添加 raw marketplace JSON | 成功加入 restricted source，列表显示 catalog name 和 plugin count |
| MAN-007 | Sources 添加 GitHub tree 页面 | 被拒绝，错误文案指向 marketplace JSON 解析失败 |
| MAN-008 | Sources 切 trust 为 trusted，再刷新 | trust 保存，Available 卡片继承新的 catalog trust 语义 |
| MAN-009 | Available 安装远程 entry | installed record 保留 marketplace provenance |
| MAN-010 | Team tab | 当前预期：展示 coming soon，不宣称 private marketplace 已完成 |

### 4.3 Headless real workflow

| ID | 命令 | 期望 |
| --- | --- | --- |
| MAN-011 | `od plugin install <local-plugin>` | 输出 ok，`od plugin list --json` 能看到新 plugin |
| MAN-012 | `od plugin doctor <id> --json` | valid plugin 无 error，metadata-only plugin 有明确 non-runnable 诊断 |
| MAN-013 | `od project create --plugin <id> --inputs '{"topic":"qa"}' --json` | 返回 project id 和 `appliedPluginSnapshotId` |
| MAN-014 | `od plugin run <id> --project <projectId> --follow` | 事件流包含 pipeline stage、agent events、end status |
| MAN-015 | `od marketplace search "<query>" --json` | 搜索 configured catalog，不依赖 web UI |

### 4.4 Public registry / self-host

| ID | 步骤 | 期望 |
| --- | --- | --- |
| MAN-016 | `pnpm --filter @open-design/landing-page build` | 静态 `/plugins` 和 `search.json` 生成成功 |
| MAN-017 | 复制 `plugins/registry/community/open-design-marketplace.json` 到临时 URL 或本地 fixture server | daemon 能 add/search/install |
| MAN-018 | 按 `docs/self-hosting-a-registry.md` 新建第三方 catalog | 只需替换 catalog name/url/source 两类配置，不改 daemon/web 代码 |
| MAN-019 | 用 `od plugin publish --to marketplace-json --catalog <path>` | catalog 稳定 upsert，source 可复现 |

## 5. 发布通过标准

本期插件系统可以标为“插件运行时 v1 ready”的条件：

1. `plugins-implementation.md` §8 的 8 个 e2e gate 都通过。
2. `pnpm guard` 和 `pnpm typecheck` 通过。
3. contract/runtime/registry-protocol/daemon/web/landing-page 的推荐命令通过。
4. 至少跑过一次 `plugin-create-import` Playwright smoke。
5. 手工确认 P2.5/P2.6/P2.7 的状态：完成则更新 plan 勾选；未完成则在发布说明里列为 deferred。

Registry v1 只有在以下额外条件满足后才能标为“fully done”：

1. `plugin-registry.md` §4 DoD 全部勾选。
2. 有一个 e2e fixture catalog 验证第三方 fork/self-host source。
3. UI Sources/Available 的每个动作都有等价 CLI 命令，并有 parity 测试或脚本证明。
4. 至少一次真实第三方 publisher 通过 `od plugin publish` 发起发布流程，没有手写 JSON。

## 6. 失败排查顺序

| 现象 | 优先检查 |
| --- | --- |
| manifest/schema 测试失败 | `packages/contracts/src/plugins/*` 和 `packages/plugin-runtime/src/validate.ts` |
| install 成功但 Available/Installed 状态不对 | installed record 的 `sourceMarketplaceEntryName`、`sourceMarketplaceId`、`marketplaceTrust` |
| apply 需要重复输入或 snapshot 丢失 | `resolve-snapshot.ts` 的 project-pinned fallback 和 `snapshots.ts` |
| pipeline 事件缺失 | `firePipelineForRun()` 是否在 `POST /api/runs` 路径触发 |
| connector token 绕过 | `connector-gate.ts`、`tool-tokens.ts`、`/api/tools/connectors/execute` 二次校验 |
| UI 装完 plugin 后找不到 | `PluginsView` tab/test id、`buildAvailablePlugins()` name matching |
| public registry 页面缺条目 | `plugins/registry/*/open-design-marketplace.json`、`apps/landing-page/app/plugin-registry.ts` |

## 7. 维护规则

1. 每次插件系统 PR 合入，若新增能力或测试文件，更新本文件对应矩阵。
2. 若 `docs/plans/plugins-implementation.md` 或 `docs/plans/plugin-registry.md` 勾选状态变化，同步更新 §1 进度摘要。
3. 不把主观视觉验收伪装成自动化通过项。视觉和真实第三方发布流程保留在 MAN 用例。
4. 自动化测试优先放在所有者目录：daemon 行为进 `apps/daemon/tests/`，web 组件进 `apps/web/tests/`，跨 app/user flow 进 `e2e/`。
