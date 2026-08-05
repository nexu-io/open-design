# Launch Studio 商店截图第一阶段设计规格

## 文档状态

- 日期：2026-07-28
- 状态：第一阶段实现完成；验收受阻并继续进行
- 产品：Launch Studio
- 上游基线：`nexu-io/open-design` `main`，提交 `f52fda29a8a6fc65c501a45bb165b6f5208194a1`
- 目标平台：macOS 和 Windows 桌面端

## 1. 目标

第一阶段将在 Open Design Fork 基础上实现专注于 App Store 和 Google Play
手机截图的生成与编辑工作台。

用户可以：

1. 创建商店截图项目。
2. 填写生成真实营销文案所需的最小产品信息。
3. 上传真实产品截图、Logo 和可选品牌素材。
4. 选择已有 Design System 和截图模板。
5. 让 AI 生成结构化截图方案，或完全手工创建。
6. 在现有 Open Design Studio 体验中审阅和编辑每一页。
7. 从同一份规范文档生成 App Store 与 Google Play 竖屏版本。
8. 校验并导出无透明通道的 PNG 文件和机器可读的 manifest。

## 2. 产品与界面方向

Launch Studio 保留 Open Design 现有的产品外壳、导航、组件、交互语言和
Studio 布局。

第一阶段不新建一套独立的三栏截图编辑应用。

### 2.1 功能入口

- 在现有首页和新建项目界面增加“商店截图”任务卡片。
- 在现有选择器中增加商店截图模板或 Scenario。
- Daemon HTTP API 与 `od` CLI 同时提供相同能力。

### 2.2 Studio 行为

- 左侧继续使用 Open Design 的对话和生成进度界面。
- 右侧在现有预览区域中显示整套截图画廊。
- Provider、Design System、模板和导出控件继续放在原有位置。
- 画廊可以切换 App Store 与 Google Play 版本。
- 用户通过缩略图轨道切换当前截图页面。
- 点击“精细编辑”后，可直接编辑当前页面的文字、颜色、素材、可见性、位置和缩放。
- 精细编辑沿用 Open Design 现有的浮动编辑交互。Fabric.js 仅作为内部画布适配器，
  不替换外层产品界面。

### 2.3 对话修改

用户可以发起整套或单页修改，例如：

- 重写第二页标题。
- 将第三页移动到第二页之前。
- 将整套截图切换为深色视觉方向。
- 替换第四页的产品截图。
- 仅在 Google Play 版本中隐藏副标题。

AI 返回经过校验的 ChangeSet。界面先预览受影响页面，只有用户确认后才应用修改。

## 3. 范围

### 3.1 第一阶段包含

- iPhone 竖屏 App Store 截图。
- Android Phone 竖屏 Google Play 截图。
- 一份规范截图文档及其平台专属版本。
- 生成文案所需的最小 Product Profile。
- 使用现有 Open Design Design System 作为首期 Brand Profile 来源。
- 素材上传与受管引用。
- 至少三个确定性模板。
- AI 生成结构化截图方案。
- 未配置 Provider 时的完整手工创建流程。
- 编辑文字、颜色、可见性、位置、缩放和产品截图。
- 页面新增、复制、删除、排序、锁定和重新生成。
- 后台校验、渲染和 ZIP 导出。
- 文档版本历史与恢复。
- HTTP、UI 和 CLI 三个能力入口。

### 3.2 第一阶段不包含

- iPad 和 Android Tablet 截图。
- 横屏截图。
- Google Play Feature Graphic、应用图标和 Preview Video。
- App Preview 视频生成。
- 自动上传 App Store Connect 或 Google Play Console。
- 多语言本地化、CJK 排版适配和 RTL 排版适配。
- 社交媒体图片、完整商店文案套件、产品视频、Website Studio 和 Automation。
- 专业时间轴、Photoshop 级自由图像编辑器或任意用户代码执行。

## 4. 平台输出目标

平台规则保存在版本化配置中，不能写死在 UI 组件里。

### 4.1 App Store

- 平台目标 ID：`app-store-iphone-6.9-portrait`
- 输出尺寸：1290 × 2796 像素
- 输出格式：PNG
- Alpha 通道：禁止
- 页面数量：1–10 页
- 产品默认：4 页

Apple 接受多组 6.9 英寸截图尺寸。第一阶段选择 1290 × 2796，是因为它属于
Apple 接受的竖屏尺寸，并且与现有技术方案中的规范 Design Document 示例一致。

### 4.2 Google Play

- 平台目标 ID：`google-play-phone-portrait`
- 输出尺寸：1080 × 1920 像素
- 输出格式：PNG
- Alpha 通道：禁止
- 页面数量：4–8 页
- 产品默认：4 页

Google Play 接受更宽泛的尺寸范围。第一阶段选择 1080 × 1920，是因为它符合手机截图的
9:16 竖屏比例和官方推荐的高分辨率要求。

## 5. 总体架构

Launch Studio 第一阶段保持模块化单体：

```text
Electron 桌面外壳
    ↓
Open Design Web Studio
    ↓ HTTP / SSE
Local Daemon
    ├── 商店截图路由与 Service
    ├── AI 编排与 ChangeSet 校验
    ├── Job Queue
    └── 项目持久化
            ↓
商店截图 Domain Package
    ├── 规范文档 Schema
    ├── 平台规格
    ├── 布局约束
    ├── 校验规则
    └── Render Model Compiler
            ↓
后台确定性渲染器
    ↓
无透明通道 PNG + manifest + ZIP
```

### 5.1 Fork 策略

- 第一阶段保留继承自 Open Design 的 `@open-design/*` 包名和内部控制协议。
- 通过集中式产品身份配置替换用户可见品牌。
- 使用新的 Domain 边界承载 Launch Studio 业务逻辑。
- `upstream` 继续指向 `https://github.com/nexu-io/open-design.git`。
- 不进行会严重阻碍上游合并的全仓库重命名。
- 保留 Apache-2.0 许可证和所有适用的第三方声明。

### 5.2 仓库边界

- Web 与 Daemon 共用的 DTO 和 Wire Schema 放在 `packages/contracts`。
- 规范截图业务规则放在纯 TypeScript 包 `@launch-studio/store-screenshot`。
- HTTP 路由、数据库、文件访问、任务和渲染编排放在 `apps/daemon`。
- 产品 UI 放在 `apps/web/src` 下独立的 Feature 目录。
- `src/` 目录只包含源码；测试放在 Package 或 App 的同级 `tests/` 目录。
- 每个公开能力必须在同一次改动中完成 HTTP、UI 和 CLI 闭环。

## 6. 规范业务文档

可编辑源文档是长期保存的产品数据。Fabric JSON、生成 HTML 和导出 PNG
均属于可重新生成的派生产物。

### 6.1 Product Profile

第一阶段只要求以下字段：

```ts
interface StoreProductProfile {
  id: string;
  name: string;
  summary: string;
  targetAudience: string;
  features: Array<{
    id: string;
    name: string;
    benefit: string;
    locked: boolean;
  }>;
  lockedTerms: string[];
}
```

所有生成标题必须以这些已确认字段为依据。

### 6.2 Store Screenshot Document

```ts
type StorePlatformTarget =
  | "app-store-iphone-6.9-portrait"
  | "google-play-phone-portrait";

interface StoreScreenshotDocument {
  schemaVersion: 1;
  id: string;
  projectId: string;
  productProfileId: string;
  designSystemId: string;
  sourceAssets: StoreAssetReference[];
  pages: StoreScreenshotPage[];
  variants: Record<StorePlatformTarget, StoreScreenshotVariant>;
  locks: StoreDocumentLock[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface StoreScreenshotPage {
  id: string;
  order: number;
  featureId: string | null;
  headline: string;
  subtitle: string | null;
  templateId: string;
  nodes: StoreScreenshotNode[];
}

type StoreScreenshotNode =
  | StoreTextNode
  | StoreImageNode
  | StoreDeviceNode
  | StoreShapeNode;

interface StoreScreenshotVariant {
  target: StorePlatformTarget;
  pageOverrides: Record<string, StorePageOverride>;
}
```

Node 使用规范化布局约束，不把 Fabric 原生序列化结果作为业务数据。

### 6.3 Platform Specification

```ts
interface StorePlatformSpec {
  id: StorePlatformTarget;
  version: string;
  width: number;
  height: number;
  orientation: "portrait";
  outputFormat: "png";
  allowsAlpha: false;
  minPages: number;
  maxPages: number;
  recommendedPages: number;
  sourceUrl: string;
  checkedAt: string;
}
```

UI、Validator、Renderer 和 Exporter 必须读取同一份版本化平台规格。

### 6.4 ChangeSet

```ts
interface StoreScreenshotChangeSet {
  documentId: string;
  baseVersion: number;
  operations: Array<{
    op: "add" | "remove" | "replace" | "move";
    path: string;
    from?: string;
    value?: unknown;
  }>;
  reason: string;
}
```

应用顺序：

```text
Schema 校验
→ 基础版本检查
→ 字段锁定检查
→ 业务规则校验
→ 预览
→ 用户确认
→ 创建不可变版本快照
→ 应用修改
```

## 7. AI 生成

AI 生成 `ScreenshotPlan`，不直接生成像素，也不编写任意应用代码。

生成上下文包含：

- 已确认的 Product Profile 字段。
- 当前 Design System Token 与规则。
- 用户选择的源素材。
- 目标平台。
- 可用模板 Manifest。
- 重新生成时的现有页面。
- 锁定字段与锁定术语。

`ScreenshotPlan` 包含：

- 页面数量与顺序。
- 功能到页面的映射。
- 标题与可选副标题。
- Template ID。
- 源素材引用。
- 结构化布局建议与平台差异建议。

禁止生成未知功能、未经证实的排名或奖项、价格促销和绝对化承诺。结构化输出无效时，
按照现有 Orchestrator 策略重试，但不能直接写入项目。

未配置 AI Provider 时，用户仍可以通过模板完成所有手工操作和导出。

## 8. 编辑与渲染

### 8.1 编辑适配器

```text
StoreScreenshotDocument
↔ 商店截图编辑模型
↔ Fabric Adapter
↔ 聚焦交互画布
```

Adapter 将规范 Node 转换为 Fabric Object，并将用户确认的交互转换回规范操作。

### 8.2 布局适配

Renderer 按以下顺序工作：

1. 解析目标平台规格。
2. 加载页面和平台 Override。
3. 解析 Design System Token 和字体。
4. 按目标尺寸计算规范化约束。
5. 在最大行数和最小字号限制内适配文字。
6. 解析源素材和设备框。
7. 检查边界和安全区域。
8. 生成 Render Model。
9. 渲染无透明通道 Bitmap。
10. 重新读取输出，验证尺寸、格式和 Alpha 状态。

### 8.3 后台任务

高分辨率渲染和 ZIP 打包不能阻塞 Renderer UI。

任务状态：

```text
pending → queued → running → completed
                       ├── failed
                       ├── cancelled
                       └── interrupted
```

进度和页面级错误通过现有 SSE 事件流发送给 Studio。单页失败时可以只重试该页，
无需重新生成已完成页面。

## 9. 持久化与版本管理

- 所有 Daemon 数据从解析后的 `OD_DATA_DIR` 派生，遵守上游数据根目录约束。
- SQLite 保存项目、文档、版本、素材引用、任务、导出和审计元数据。
- 规范 JSON 文档和不可变版本快照存储在 Daemon 管理的项目数据中。
- 原始素材、处理素材、预览素材和缩略图分别存储。
- 导出的 PNG 与 ZIP 是可重建结果，不是唯一数据源。
- API Key 继续通过现有 Provider 配置保存在操作系统安全存储中。

版本操作需要记录来源：

- 用户编辑。
- AI ChangeSet。
- 应用模板。
- 替换素材。
- 页面排序。
- 恢复版本。

## 10. API 与 CLI

### 10.1 HTTP API

```text
POST   /api/projects/:projectId/store-screenshots
GET    /api/projects/:projectId/store-screenshots/:documentId
PATCH  /api/projects/:projectId/store-screenshots/:documentId
POST   /api/projects/:projectId/store-screenshots/:documentId/generate
POST   /api/projects/:projectId/store-screenshots/:documentId/change-sets/preview
POST   /api/projects/:projectId/store-screenshots/:documentId/change-sets/apply
POST   /api/projects/:projectId/store-screenshots/:documentId/validate
POST   /api/projects/:projectId/store-screenshots/:documentId/render
POST   /api/projects/:projectId/store-screenshots/:documentId/export
GET    /api/projects/:projectId/store-screenshots/:documentId/versions
POST   /api/projects/:projectId/store-screenshots/:documentId/versions/:version/restore
```

耗时接口返回 Job 引用，并通过现有 Job 事件流发送进度。

### 10.2 CLI

```text
od store-screenshot create
od store-screenshot show
od store-screenshot generate
od store-screenshot validate
od store-screenshot render
od store-screenshot export
od store-screenshot versions
od store-screenshot restore
```

所有命令支持 `--json`。接收长 Prompt 的命令支持 `--prompt-file <path|->`。

## 11. 校验与错误处理

### 11.1 上传校验

- 校验受支持的扩展名、MIME 和文件签名。
- 素材通过真实解码后才能进入项目。
- 损坏或过大的素材必须显示明确原因并拒绝保存。
- SVG 或 HTML 类素材在预览前必须完成安全清理。

### 11.2 阻止导出的错误

- 源素材缺失。
- 字体不存在或尚未加载完成。
- 已达到最小字号但仍发生文字溢出。
- Node 超出合法渲染边界。
- 页面数量不符合平台规则。
- 输出尺寸或格式错误。
- 图片存在 Alpha 通道。
- 文档或平台规格版本无法解析。

### 11.3 警告

- 重要内容接近裁切区域或视觉安全区。
- Google Play 截图文字密度过高。
- 文案可能包含排名、价格促销、奖项或无法验证的承诺。
- 前几页中的真实产品界面不够突出。
- 多页重复表达同一个用户收益。

除非违反确定性平台规则，否则警告需要用户复核，但不阻止导出。

### 11.4 恢复策略

- AI 解析或 Schema 校验失败时，当前文档保持不变。
- ChangeSet 的 `baseVersion` 过期时返回版本冲突。
- 单页渲染失败时可以单独重试。
- 应用重启后，未完成任务标记为 `interrupted`。
- 内容 Hash 相同的已完成渲染结果可以直接复用。

## 12. 导出结构

```text
Store Screenshots/
├── app-store/
│   └── iphone-6.9-portrait/
│       ├── 01-core-value.png
│       ├── 02-main-feature.png
│       └── ...
├── google-play/
│   └── phone-portrait/
│       ├── 01-core-value.png
│       ├── 02-main-feature.png
│       └── ...
└── manifest.json
```

`manifest.json` 包含：

- Document ID 与版本。
- Platform Specification ID 与版本。
- 页面顺序和文件名。
- 宽度、高度、格式和内容 Hash。
- 源素材引用。
- 校验结果。
- 导出时间。

## 13. 测试方案

### 13.1 单元测试

- Zod 文档和 API Schema。
- Platform Specification 解析。
- 页面数量与输出格式规则。
- 规范化布局适配。
- 文字适配和溢出。
- ChangeSet 应用。
- `baseVersion` 冲突。
- 文档锁定和术语锁定。
- 文件命名。
- 内容 Hash 稳定性。

### 13.2 Contract Test

- Web 与 Daemon 使用相同的请求、响应、错误、Job 和 SSE 类型。
- CLI 与 UI 调用相同 HTTP API。
- 存储文档通过 Schema Round Trip 后保持一致。
- Platform Specification 与 Manifest 类型保持兼容。

### 13.3 集成测试

- 创建项目和截图文档。
- 上传并引用产品截图。
- 通过确定性测试 Provider 生成 Screenshot Plan。
- 应用合法 ChangeSet。
- 拒绝修改锁定字段的 ChangeSet。
- 校验、渲染并导出两个平台。
- 恢复不可变历史版本。
- 恢复中断的渲染任务。

### 13.4 视觉回归

使用固定字体、素材、Design System Token 和模板检查：

- 每个首发模板的 1290 × 2796 输出。
- 每个首发模板的 1080 × 1920 输出。
- 长标题适配。
- 无副标题布局。
- 平台专属 Override。
- 无透明通道和精确尺寸。

Golden Image 按平台分别维护，避免字体和 Renderer 差异产生无效失败。

### 13.5 端到端验收

```text
创建项目
→ 上传产品截图
→ 选择 Design System
→ 生成四页截图
→ 编辑其中一页
→ 调整页面顺序
→ 校验两个平台
→ 导出 ZIP
→ 验证 manifest 与 PNG
→ 重启应用
→ 重新打开可编辑源文档
```

必须通过：

- `pnpm guard`
- 相关 Package 的 Typecheck 和 Test。
- Web Typecheck、Test 和 Build。
- Daemon Typecheck、Test 和 Build。
- Desktop Build。
- 目标 Playwright E2E。
- 本地桌面端启动和 Daemon Health Check。

## 14. 验收标准

1. “商店截图”入口与 Studio 体验在视觉和行为上保持 Open Design 风格。
2. 用户可以创建项目并上传真实产品截图。
3. 至少三个确定性模板能够读取当前 Design System 的颜色、字体和 Logo。
4. AI 可以生成至少四页基于真实产品信息的截图；无 Provider 时可以手工完成。
5. 同一份规范文档可以生成 App Store 和 Google Play 竖屏版本。
6. 用户可以编辑标题、颜色、产品截图、页面顺序、元素可见性、位置和缩放。
7. 重新生成单页不会修改其他页面。
8. AI 或模板变更不能覆盖已锁定字段和术语。
9. App Store 文件必须是精确的 1290 × 2796 PNG。
10. Google Play 文件必须是精确的 1080 × 1920 PNG。
11. 所有导出图片必须无 Alpha 通道且顺序正确。
12. 导出结果包含约定目录结构和 manifest。
13. 应用重启后保留项目、素材、规范文档、版本和可恢复任务状态。
14. HTTP、UI 和 CLI 使用相同能力与 Contract。
15. 所有必须的校验、Build、视觉回归和 E2E 均通过。

## 15. 参考资料

- `doc/` 下的 Launch Studio 产品需求文档。
- `doc/` 下的 Launch Studio 技术方案。
- Open Design 根目录 `AGENTS.md` 与目录级开发约束。
- Apple App Store Connect Screenshot Specifications：
  `https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/`
- Google Play Preview Asset Requirements：
  `https://support.google.com/googleplay/android-developer/answer/9866151`
