# App identity 覆盖清单

本文件记录 xDesign fork 如何在上游散落的 app identity（显示名 / appId / 图标 / 安装器名等）各点上注入品牌，是 fork-strategy ADR（`adr/0001-fork-strategy.md`）要求的「identity 覆盖清单」的当前状态。每条标注 **已覆盖** / **待覆盖**，便于每次 upstream sync window 核对注入点是否漂移、是否有上游新增的散落点。

注入机制见 `xdesign/README.md` 与 `tools/pack/src/brand.ts`：`OD_PRODUCT_NAME`（可选 `OD_APP_ID` / `OD_MAC_ICON` / `OD_WIN_ICON` / `OD_LINUX_ICON`）env overlay，未设时上游行为不变。

## 身份来源（上游 4 梯队，含图标）

| # | 梯队 | 位置 | 说明 |
| --- | --- | --- | --- |
| 1 | channel 身份表 | `packages/release/src/index.ts` `descriptors` | 按 channel（stable/beta/.../preview）给 appId/productName；`PRODUCT_NAME` 与 appId 常量都是模块私有、不导出 |
| 2 | pack 平台常量 | `tools/pack/src/mac/constants.ts`、`tools/pack/src/win/constants.ts`、`tools/pack/src/linux.ts` | 各平台**独立**硬编码 `PRODUCT_NAME = "Open Design"`（linux 另有 `APP_IMAGE_PRODUCT_NAME = "Open-Design"`） |
| 3 | pack 身份解析 + builder | `tools/pack/src/{mac,win}/identity.ts`、`tools/pack/src/mac/builder.ts`、`tools/pack/src/win/builder.ts` | 把 channel/常量解析成 appId/productName/executableName/installerTitle/bundle 名，并组装 electron-builder config |
| 4 | 运行时字面量 + 资源 | `apps/desktop`（窗口标题等）、`apps/web`（web title / loading 文案）、`tools/pack/resources/{mac,win,linux}/icon.*` | 用户可见的运行时字符串与图标二进制 |

全仓**原先不存在**任何 env/brand override 机制（调查结论）；identity 仅来自 5 个固定 channel 或 null-channel 回退（硬编码 `"Open Design"` + `io.open-design.desktop`）。xDesign **不**做成新 channel（会与 update feed / namespace 机制纠缠，见 issue 07 内部更新源），而是 **fork 级 env overlay**：brand 优先级高于任何从 version/namespace 派生的 channel。

## 注入点与覆盖状态

### mac（issue 01 已覆盖）

经 `resolveMacInstallIdentity`（`tools/pack/src/mac/identity.ts`）与 `runElectronBuilder`（`tools/pack/src/mac/builder.ts`）consult `config.brand`：

- ✅ productName → `xDesign`（驱动 `extraMetadata.productName`、顶层 `productName`、`executableName`、`.app` bundle 目录名 `xDesign.app`、DMG title）
- ✅ appId → `io.xdesign.desktop`（brand 未给 appId 时回退到 canonical `io.open-design.desktop`）
- ✅ installerTitle → `xDesign`
- ✅ system/public bundle name → `xDesign.app`（branded 构建不走 namespace 后缀，安装身份跨 namespace 稳定）
- ✅ mac 图标 → `xdesign/brand/icon.icns`（`config.brand.macIcon`；未设时回退 `tools/pack/resources/mac/icon.icns`）
- ✅ artifact 文件名 / protocol 标签 → `xDesign-<ns>.{ext}` / `xDesign Invite`（unbranded 时仍是 `Open Design`，上游命名零变化）

验证：`tools/pack/tests/brand.test.ts`、`tools/pack/tests/mac-identity.test.ts`。

### win / linux（issue 04 已覆盖）

`tools/pack/src/win/identity.ts` `resolveWinInstallIdentity` 与 `win/builder.ts`、`win/paths.ts`、`win/custom-installer.ts`、`win/resources.ts` consult `config.brand`；`tools/pack/src/linux.ts` 同理。

- ✅ win productName/appId/displayName/exeName → `xDesign`（`winArtifactProductName` + `resolveWinInstallIdentity`，brand 未给 appId 时 fail-closed，与 mac 一致）
- ✅ win 注册表 key / App Paths key / shortcut / uninstaller 名 / `$APPDATA` 数据根 → brand-scoped（与上游 Open Design 安装不碰撞）
- ✅ win artifact 文件名（setup/portable/exe/payload/blockmap）→ `xDesign-<ns>`；win 缓存 key 含 brand，branded/unbranded 不共享缓存条目
- ✅ win 图标 → `config.brand.winIcon`（未设时回退 `winResources.icon`）
- ✅ linux AppImage artifact 名 / `executableName` / `productName` / AppRun BIN / synopsis → brand；AppImage 安装名 → brand 派生（`linuxAppImageProductName`）
- ✅ linux 图标 / desktop 模板 → brand（模板用 `@@PRODUCT_NAME@@` token，未设时回退 `Open Design`，上游字节不变）
- ✅ linux containerized build 经 `buildDockerArgs` 转发 `OD_PRODUCT_NAME`/`OD_APP_ID`/`OD_LINUX_ICON`，容器内 brand 一致

验证：`tools/pack/tests/{brand,mac-identity,win-identity,linux}.test.ts`。

### 运行时字面量（issue 04 — 品牌名核心已覆盖，自然语言长尾待覆盖）

品牌名核心（用户「登录页还写着 Open Design」的直接来源）：

- ✅ desktop 窗口标题 / splash `<title>`（`apps/desktop/src/main/runtime.ts` + `apps/packaged/src/window-title.ts`，后者改为恒返回 `xDesign`）
- ✅ web 文档 title（`apps/web/app/layout.tsx`）
- ✅ i18n `app.brand` → `xDesign`（19 个 locale 文件 `apps/web/src/i18n/locales/*.ts`）

自然语言长尾（待覆盖，需独立决策与文案审校）：

- ⬜ ~150 条/语言 × 19（~2,880 处）嵌在真实 UI 句子里的 `Open Design`（onboarding、错误文案、AMR/Cloud、invite/deep-link 等）——非机械替换，多数是产品口吻决策
- ⬜ ~25 个 web 组件直写字面量（footer 版权、PR/contribution 标签、模板 HTML、「Use xDesign everywhere」modal 等）
- ⬜ ~20 条 AI prompt 字符串（影响模型生成内容）
- ⬜ splash 视频资源本身渲染 `Open Design` 字样（二进制，非源码可改）
- ⬜ ~80 条测试断言编码了上述字符串为期望值

详见本仓库根 `.scratch/xdesign/issues/04-brand-injection-all-platforms.md` 与 audit 记录。

## Sync window 核对

每次 `git merge upstream/<tag>` 后：

1. 本清单 4 梯队文件是否仍存在、签名是否变化（尤其 consult 点：`resolveMacInstallIdentity`、`resolveWinInstallIdentity`、`winArtifactProductName`/`linuxArtifactProductName`、各平台 `runElectronBuilder`、`win/resources.ts:copyWinIcon`、`win/custom-installer.ts` overlay 路径）。
2. 上游是否新增 identity 散落点（新常量、新 builder 字段、新运行时字面量）——有则补进本清单与注入点。
3. `packages/release` 的 `descriptors` / channel 集合是否变化——不影响 brand（brand 优先级更高），但需确认 channel 派生逻辑未被改得绕过 brand consult。
4. 运行时字面量长尾（见上节）是否新增散落点；splash 视频资源是否仍渲染旧字样。

注入 seam 是 additive、env-gated 的私有 patch（ADR 列为「品牌注入点」私有 patch 面）；解冲突集中在 `tools/pack/src/brand.ts`、`config.ts`、`{mac,win}/identity.ts`、`{mac,win}/builder.ts`、`win/{paths,custom-installer,resources}.ts`、`linux.ts`，以及运行时字面量私有替换点。
