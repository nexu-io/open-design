# Plugin Registry 评测集用例

这份用例集把 registry 产品心智转成可回归的断言：`Sources` 只接收
`open-design-marketplace.json`，`Available` 是供应池，`Installed` 才是 agent
可消费集合，official/community/self-hosted 都通过同一套 registry source 模型进入系统。

插件系统整体进度、运行顺序和发布验收总表见
[`plugin-system-test-suite.md`](./plugin-system-test-suite.md)。本文只保留
registry / distribution / website / multi-source 的细分用例。

## 已自动化

| ID | 场景 | 核心断言 | 覆盖文件 |
| --- | --- | --- | --- |
| REG-001 | Sources 添加的是 raw `open-design-marketplace.json`，不是 GitHub tree 页面 | GitHub tree HTML 会被 marketplace parser 拒绝并返回 422 | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| REG-002 | 默认 official registry seed 是真实 catalog，不是空数组 | `plugins/registry/official/open-design-marketplace.json` 包含 bundled official entries，trust 为 `official`，且 `open-design/build-test` 可 resolve | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| REG-003 | 默认 community registry seed 可被 daemon 当作 restricted source 加载 | `plugins/registry/community/open-design-marketplace.json` 可 seed，`community/registry-starter` 可 resolve，trust 为 `restricted` | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| REG-004 | checked-in registry entry 指向真实可打包插件源码 | `community/registry-starter` 的 source 指向 `plugins/community/registry-starter`，源码 `open-design.json` 带 `plugin.repo` | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| REG-005 | marketplace install 会保留 provenance 并继承 trust | installed record 写入 `sourceMarketplaceId`、entry name/version、resolved source/ref、digest/integrity；official/trusted source 默认 trusted | `apps/daemon/tests/plugins-installer.test.ts` |
| REG-006 | restricted marketplace install 不会被自动提权 | restricted source 安装出的 plugin 仍是 `restricted` | `apps/daemon/tests/plugins-installer.test.ts` |
| REG-007 | 直接 GitHub source import 与 registry source 是两条入口 | Import dialog 会把 `github:nexu-io/open-design@.../plugins/community/registry-starter` 原样交给 install API | `apps/web/tests/components/PluginsView.test.tsx` |
| REG-008 | Available 里的 bundled official entry 已安装时显示 `Use`，不是 `Install` | registry entry `open-design/official-plugin` 能匹配 installed bundled record，并调用 `applyPlugin` | `apps/web/tests/components/PluginsView.test.tsx` |
| REG-009 | Sources tab 支持填入 raw GitHub `open-design-marketplace.json` URL | UI 调用 `addPluginMarketplace({ url, trust: "restricted" })` | `apps/web/tests/components/PluginsView.test.tsx` |
| REG-010 | Create plugin 是 agent-assisted authoring 入口 | `Create plugin` 不打开旧 import modal，而是触发 `onCreatePlugin` agent 流程 | `apps/web/tests/components/PluginsView.test.tsx` |
| REG-011 | 用户插件可通过 publish/share action 进入 GitHub registry 工作流 | Publish/Contribute action 会确认后创建对应 agent task，携带 source plugin id 和 action id | `apps/web/tests/components/PluginsView.test.tsx` |
| REG-012 | version range / dist-tag / yank resolution | `vendor/plugin@1.0.0`、`@latest`、`@^1.0.0` 可解析；yanked beta 不参与新解析 | `apps/daemon/tests/plugins-marketplaces.test.ts` |
| REG-013 | archive integrity fail closed | HTTPS/GitHub tarball 下载会计算 `sha256:`；entry integrity 不匹配时拒绝解包，匹配/缺省时写入 installed record | `apps/daemon/tests/plugins-installer-archive.test.ts` |
| REG-014 | registry backend parity | static/GitHub/DB backend 共享 list/search/resolve/publish contract；GitHub publish 产出稳定 PR mutation paths | `apps/daemon/tests/registry-backends.test.ts` |
| REG-015 | install lockfile | installed plugin 可生成稳定 `.od/od-plugin-lock.json` entry，包含 marketplace id、resolved ref、digest、integrity | `apps/daemon/tests/plugins-lockfile.test.ts`, `apps/daemon/tests/plugins-installer.test.ts` |
| REG-016 | marketplace doctor | invalid name、missing source、missing capability/license、yank reason 等会被 doctor 报告，并支持 strict warning-as-error | `apps/daemon/tests/plugins-marketplace-doctor.test.ts` |
| REG-017 | static marketplace-json publish | `od plugin publish --to marketplace-json` 的纯 upsert 逻辑强制 `vendor/plugin-name`，从 GitHub URL 推导 reproducible source，并稳定更新 catalog | `apps/daemon/tests/plugins-publish.test.ts` |
| REG-018 | public plugin SEO/search renderer | `/plugins/search.json` 和 per-plugin detail pages 可静态构建，包含 official/community registry entry | `apps/landing-page` `typecheck` + `build` |
| REG-019 | registry protocol future hooks | `RegistryBackend` 纯接口要求 vendor/plugin identity，并接受 metrics/signatures，为 DB/search/trust hardening 预留 | `packages/registry-protocol/tests/backend.test.ts` |

## 自动化候选

| ID | 场景 | 建议补法 |
| --- | --- | --- |
| REG-C01 | `od marketplace add/search/refresh/remove/trust` CLI 全链路 | CLI harness + fake fetcher，断言 JSON 输出、exit code、SQLite source row |
| REG-C02 | `od plugin login/whoami` 只复用 `gh`，不保存 GitHub token | fake `GhClient` 或 fake `gh` bin，断言 stdout 和无 token 持久化 |
| REG-C03 | 完整 `gh repo fork` / `gh pr create` 外部流程 | fake `gh` bin + temp registry repo，断言真实 branch/commit/PR 命令序列 |
| REG-C04 | `open-design-marketplace.json` 生成器 | 输入多个 `plugins/community/**/open-design.json`，输出排序稳定、schema 通过、source/digest 完整 |
| REG-C05 | lockfile replay route-level behavior | 启动 daemon，先安装 `vendor/plugin@1.0.0` 写 lock，再默认安装 `vendor/plugin`，断言仍解析 lock 里的 exact version |
| REG-C06 | enterprise database backend HTTP/API parity | 同一组 CLI/UI 行为同时跑 static/GitHub 和 DB backend，而不只是 backend unit parity |

## 手工验收保留

| ID | 场景 | 原因 |
| --- | --- | --- |
| REG-M01 | open-design.ai marketplace 页面视觉、SEO、插件详情叙事 | 强依赖品牌表达和真实内容质量，适合人工验收 |
| REG-M02 | 第三方真实自托管 registry 接入体验 | 涉及外部 repo、GitHub 权限、网络和组织流程，适合作为发布前 smoke |
