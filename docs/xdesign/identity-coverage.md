# App identity 覆盖清单

本文件记录 xDesign fork 如何在上游散落的 app identity（显示名 / appId / 图标 / 安装器名等）各点上注入品牌，是 fork-strategy ADR（`adr/0001-fork-strategy.md`）要求的「identity 覆盖清单」的当前状态。每条标注 **已覆盖** / **待覆盖**，便于每次 upstream sync window 核对注入点是否漂移、是否有上游新增的散落点。

注入机制见 `xdesign/README.md` 与 `tools/pack/src/brand.ts`：`OD_PRODUCT_NAME`（可选 `OD_APP_ID` / `OD_MAC_ICON`）env overlay，未设时上游行为不变。

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

### win / linux（issue 04 待覆盖）

- ⬜ `tools/pack/src/win/constants.ts` `PRODUCT_NAME`、`win/identity.ts` `resolveWinInstallIdentity`（displayName/shortcut/uninstaller 名）、win builder icon
- ⬜ `tools/pack/src/linux.ts` `PRODUCT_NAME` + `APP_IMAGE_PRODUCT_NAME`、linux icon / desktop 模板
- ⬜ 三平台身份一致后，全仓无残留 `"Open Design"` 用户可见字样

issue 04 把同一 `config.brand` seam 接到 win/linux 的 identity 解析与 builder，并把 `OD_WIN_ICON` / `OD_LINUX_ICON` 加入 `ToolPackBrand`。

### 运行时字面量（issue 04 待覆盖）

- ⬜ desktop 窗口标题（`apps/desktop`）
- ⬜ web title / loading 文案 / 其它用户可见 `Open Design` 字面量（`apps/web`，含 i18n）

issue 04 清理这些字面量（走 overlay 注入或 fork 私有替换，不改上游默认）。

## Sync window 核对

每次 `git merge upstream/<tag>` 后：

1. 本清单 4 梯队文件是否仍存在、签名是否变化（尤其 `resolveMacInstallIdentity`、`runElectronBuilder` 这两个 consult 点）。
2. 上游是否新增 identity 散落点（新常量、新 builder 字段、新运行时字面量）——有则补进本清单与注入点。
3. `packages/release` 的 `descriptors` / channel 集合是否变化——不影响 brand（brand 优先级更高），但需确认 channel 派生逻辑未被改得绕过 brand consult。

注入 seam 是 additive、env-gated 的私有 patch（ADR 列为「品牌注入点」私有 patch 面）；解冲突集中在 `tools/pack/src/brand.ts`、`config.ts`、`mac/identity.ts`、`mac/builder.ts`。
