# Design System 埋点方案（Tracking Spec）

> 状态：方案稿（仅设计，未实现代码）
> 关联 PR：#4691 `feat(brands): turn any brand into a reusable design system`，分支 `iodized-nephew`
> 目标读者：埋点实现 / 数据分析
> 维护：本文件是“代码现状 + 目标口径”的对照表，落地后逐条勾掉。

## 术语：只有一个对象 = Design System（先读这段，避免被 brand 绕晕）

整个功能里**只有一个用户层对象：Design System（设计系统）**。代码里之所以到处出现 “brand”，是因为它活在**不同层次**，不是第二个对象：

| 层 | 名字 | 是不是用户看到的对象 | 说明 |
|---|---|---|---|
| **对象层（唯一）** | **Design System** | ✅ 是 | 用户只看到/管理“设计系统”。左侧导航只有一个 design-systems 入口；`/brands` 旧链接已 redirect 到 `/design-systems`（router.ts:102）；`BrandsTab` 是遗留死代码，导航无按钮可达。 |
| **来源层（怎么造出来的）** | brand 只是一种**输入源** | ❌ 否 | 和 website / 文件 / Figma / DESIGN.md 并列。“Start from a brand” = 选一个**预设品牌当素材**，是输入方式，不是独立对象。 |
| **内部管道层** | brand（实现命名） | ❌ 否 | daemon 抽取引擎叫 brand（`brand.json`、backing project `kind:'brand'`、`brand-extract` skill），产物 register 成 `user:<id>` 的 design system。PR 已合并应用链路：**no parallel brandId path**，一切走 `designSystemId`（apps/daemon/src/brands/index.ts:1-17）。 |

**本文档口径**：凡“对象”一律 `design_system_*`；“brand” 只出现在两处——①来源维度的取值之一；②预设品牌选择器（它确实是在选 brand 当素材）。AI 优化事件统一叫 `design_system_enrich`（不是 brand_enrichment）。

---

## 0. 业务目标（埋点要回答的问题）

1. **创建漏斗**：从入口到成功创建一个 DS，每一步的转化与流失在哪。
2. **输入源偏好**：用户更爱用 Website / 文件 / 文本 / Figma / **预设品牌** 哪种来源；多网站用得多不多（决定是否保留“Add”）。
3. **AI 转化**：程序化抽取后，有多少人真正点了 **AI 优化（深度抽取）**。
4. **编辑/迭代**：DS 生成后，有多少人回去 **编辑** 它（Draft/Edit/Chat），怎么编、编多频。
5. **使用**：DS 被用来做东西的频次；选的是 **官方** 还是 **自建**，具体哪个。
6. **效果对比**：仅程序化 vs 经 AI 优化 的 DS，使用频次/留存差异。
7. **北极星关联**：用户创建/使用 DS 的量 ↔ **留存** 与 **复购转化**。

要支撑 6/7，必须先把 **“DS 本身是一种 project”** 这件事在数据里标清楚（见 §1）。

---

## 1. 地基：DS-project 类型标记（已定口径）

**决策：用户层只有一种 project 类型 `project_kind='design_system'`。**（不存在 “brand 项目 vs design-system 项目” 的二分——见顶部术语段。）

现状（探查结论）：
- 数据层：DS 的载体 project 现在底层 tag 为 `kind:'brand'` + `metadata.brandId` / `metadata.brandDesignSystemId`。
  - `apps/daemon/src/brands/index.ts:229`
  - 识别函数 `isProgrammaticBrandExtractionProject()` @ `apps/web/src/runtime/brand-enrichment.ts:41`
- 埋点层：`TrackingProjectKind` **已含 `'design_system'` 但从未真正写入**。
  - `packages/contracts/src/analytics/events.ts:99`
- 业务 ProjectKind（`packages/contracts/src/api/projects.ts:9`）目前 **没有** `'design_system'`，仅 `prototype/deck/template/other/brand/image/video/audio`。

**要做的接通**：
1. 埋点映射层把这个底层 `kind:'brand'` 的载体 project **统一上报为 `project_kind='design_system'`**（不要求改业务 ProjectKind 枚举）。
2. 所有**碰到 DS-project 的事件**（run_created / run_finished / project page_view / 编辑事件）都带上这个维度。
3. 下钻基线口径：
   - `project_kind='design_system'` → 用户在 **编辑/打磨 DS 本身**
   - `project_kind≠'design_system'` 且 `design_system_id` 有值 → 用户在 **用 DS 做别的产物**

> 这一条是 §6/§7 一切分析的前提，优先级最高。

---

## 2. 维度字典（新增 / 收紧的字段）

### 2.1 两个最容易混的字段，先讲清区别（回应评论①）

它俩名字像，但问的是**两件不同的事**：

- **`design_system_source`** ＝ 一次 run **用** DS 时，这个 DS 是**怎么被选中的**（使用时刻的“选择来源”）。
- **`ds_source_origins`** ＝ 这个 DS 当初**是用什么素材造出来的**（创建时刻的“输入素材”）。

**`design_system_source` 取值含义**（run_created 用）：

| 值 | 含义（大白话） |
|---|---|
| `user_selected` | 用户这次**主动**在选择器里选了某个 DS |
| `default` | 没主动选，用的是用户/工作区设的**默认** DS |
| `project_saved` | 用的是**这个项目里已存**的 DS（继承自项目） |
| `template_inherited` | DS 是从**模板**带过来的 |
| `not_applicable` | 这次 run 跟 DS **无关**（没用任何 DS） |
| `unknown` | **没采集到**——当前的 bug：daemon 把它硬写成 unknown/not_applicable（runs.ts:814-817），需修 |

### 2.2 字段总表

| 字段 | 取值 | 用途 | 现状 |
|---|---|---|---|
| `project_kind` | `... / 'design_system'` | 区分 DS-project vs 普通 project | 枚举有，未写入 |
| `design_system_kind` | `official / custom` | 官方预设 vs 用户自建 | **缺** |
| `design_system_slug` | string（仅 official） | 官方具体是哪一个 | **缺**（自建只用 id/hash） |
| `design_system_id` | string | DS 标识；自建形如 `user:<id>` | 有 |
| `design_system_source` | 见 §2.1 表 | run 用的 DS 怎么选中的 | 有枚举，但 daemon 硬写成 unknown，**未真上报** |
| `ds_source_origins` | **string[]（多值）** 例 `["website","local_code"]` | DS 用哪些素材造的（见评论②） | ⚠️ 现为单值会塌缩成 `mixed`，需改多值 |
| `enrichment_status` | `programmatic / ai_refined` | 仅程序化 vs 经 AI 优化 | **缺**（无字段可区分） |
| `edit_surface` | `chat / edit / draw / comment / mark / direct_module` | 编辑 DS 的入口工具（见 §3.4，评论⑤已修正：无 draft） | **缺** |
| `source_count` | number | 一次创建加了几个来源（含多网站） | 有（create_result） |
| `preset_brand_category` | string（枚举类目，**非域名**） | **预设品牌**素材选了哪类（来源层，见评论④） | **缺** |
| `is_quick_pick` | bool | 是否从快捷预设品牌选 | **缺** |

> **关于评论②（多来源不要塌缩成 mixed）**：`ds_source_origins` 改为**数组/多值**，把每个实际用到的来源都列出来（如既选了 website 又选了 local code，就上报 `["website","local_code"]`），**不再**只报一个 `mixed`。落地建议：作为逗号拼接字符串上报（对齐现有 `target_platforms`/`connectors` 的多值写法），如 `"website,local_code"`；分析侧可直接拆开统计每种来源的占比，也能算“多来源”的组合。`mixed` 仅在需要“是否多来源”的布尔判断时由列表长度派生，不再作为唯一取值。
>
> **关于评论④（brand 很怪）**：这里的 `preset_brand_category` 属于**来源层**——它是“用户拿哪一类**预设品牌**当创建素材”，brand 是 DS 的一种输入，不是另一个对象（见顶部术语段）。字段已从 `brand_category` 重命名为 `preset_brand_category` 以消歧。

**隐私红线（必须遵守，contracts events.ts:622 已声明）**：
- ❌ 禁止上报：brand 文本、网站 URL 原文、文件名、DESIGN.md 原文。
- 预设品牌选择器只报 `preset_brand_category` + `is_quick_pick`，**不报域名**。
- 官方 DS 可报 `design_system_slug`；自建只报 `design_system_id`（已是 `user:<id>` 形式）。
- 公共参数（event_id/session_id/device_*/app_version/configure_* 等）由 AnalyticsProvider 自动带，**不要手动塞**。

---

## 3. 事件清单（按生命周期）

> 图例：✅ 已实现 ｜ ⚠️ 部分/有坑 ｜ ❌ 缺口（本方案新增）
> 三元组 = `page_name` · `area` · `element`

### 3.1 创建入口（来源区分）

| # | 事件 | 类型 | 三元组 | 关键维度 | 状态 | 位置 |
|---|---|---|---|---|---|---|
| C1 | DS create 页曝光 | `page_view` | design_systems · design_system_create · — | **`entry_from`（见下表）** | ⚠️ | DesignSystemFlow.tsx:391 |
| C2 | **Onboarding：创建 vs Go Home** | `ui_click` | design_systems(或 home) · onboarding_ds_step · `build_design_system / go_home` | entry_from | ❌ | Onboarding 第4步两个按钮 |

> C2 回答“多少人选择不创建直接进首页”，是创建漏斗的第一个流失点。

#### 创建入口来源（entry_from）必须分清——你要的三类

枚举 `TrackingDesignSystemsEntryFrom` 已有 6 个值，足够区分；**但当前 C1 的 page_view 写死成二选一（`onboarding ? 'onboarding' : 'design_systems_page'`，DesignSystemFlow.tsx:391），把所有非 onboarding 入口都塌成了 `design_systems_page`**。要做的是：每个 `navigate({kind:'design-system-create'})` 调用处把真实来源透传进去，page_view 如实上报。

| 你说的来源 | `entry_from` 取值 | 实际入口（navigate 调用处） |
|---|---|---|
| **1. Onboarding 链路** | `onboarding` | onboarding 第4步 → router.ts:92 |
| **2. 左侧 Design System Tab** | `design_systems_page` | DesignSystemsTab 的「创建」(App.tsx:2246 onCreateDesignSystem) · EntryShell.tsx:722 |
| **3. 产品里其他 DS 入口** | 按入口细分（见下） | 见下列各处 |

第 3 类“其他入口”再拆细，别全归一类：

| 入口 | 建议 `entry_from` | 位置 | 现状 |
|---|---|---|---|
| Home 页卡片/空态 | `home_card` | HomeView.tsx:1492 | 枚举有，未透传 |
| Composer 的 DS 选择器“新建” | `composer_picker` | DesignSystemPicker.tsx:234 | 枚举有，未透传 |
| 项目设置内创建 | `project_settings` | — | 枚举有，未透传 |
| 项目内画布/文件区创建 | **`project_canvas`（建议新增）** | FileWorkspace.tsx:2215 | **枚举缺** |
| Library 内创建 | **`library`（建议新增）** | LibrarySection.tsx:770 | **枚举缺** |
| 兜底 | `unknown` | — | 有 |

> 落地要点：① 给 `TrackingDesignSystemsEntryFrom` 补 `project_canvas` / `library` 两个值；② 把 `DesignSystemFlow.tsx:391` 的二元判断改成从“发起导航的入口”透传真实 `entry_from`（在每个 `navigate({kind:'design-system-create'})` 调用处带上来源标记，落进 create 页读取）；③ create_result（C11）也带同一个 `entry_from`，这样“入口 → 成功率”能直接下钻。

### 3.2 创建输入源

| # | 事件 | 类型 | 三元组 | 关键维度 | 状态 | 位置 |
|---|---|---|---|---|---|---|
| C3 | 加 Website 链接 | `ui_click` | design_systems · design_system_create · `source_url_add` | `source_url_count`（见 C10） | ✅ | DesignSystemFlow.tsx:597/663 |
| C4 | Figma URL | `ui_click` | …· `figma_url_add` | — | ✅ | :678 |
| C5 | 展开 Advanced / 浏览文件夹 / 上传.fig / 加素材 | `ui_click` | …· `show_access_methods/browse_folder/upload_fig/add_assets` | methods_expanded | ✅ | :716/766/1141/1254 |
| C6 | 文件上传结果 | `file_upload_result` | design_systems · design_system_source · — | source_type, cohort, result | ✅ | DesignSystemFlow.tsx:416 |
| C7 | **预设品牌：打开选择器** | `ui_click` | design_systems · design_system_create · `start_from_brand` | — | ❌ | DesignSystemFlow.tsx:1079 |
| C8 | **预设品牌选择器曝光** | `surface_view` | design_systems · preset_brand_picker · — | — | ❌ | BrandPickerModal 打开 |
| C9 | **选中某预设品牌 / quick-pick** | `ui_click` | design_systems · preset_brand_picker · `brand_pick/quick_pick/close` | `preset_brand_category`, `is_quick_pick` | ❌ | BrandPickerModal onPick |
| C10 | **多网站**：每次 add 带当前数量 | （C3 上加维度） | …· `source_url_add` | `source_url_count` | ⚠️ | 现仅 create_result 带 source_count |

> C7–C9 是“预设品牌当来源”的盲区，必补。C10 决定“是否保留 Add 按钮”。

### 3.3 创建结果与 AI 优化

| # | 事件 | 类型 | 三元组 | 关键维度 | 状态 | 位置 |
|---|---|---|---|---|---|---|
| C11 | 创建 kickoff 结果 | `design_system_create_result` | design_systems · design_system_create · — | result, design_system_id, **ds_source_origins**, source_count, has_brand_description, duration_ms | ✅(字段需补多值) | DesignSystemFlow.tsx:853 |
| C12 | 实时抽取 ready/failed | `design_system_status_result` | design_systems · design_system_status · — | result, action | ✅ | DesignSystemsTab.tsx:452 |
| C13 | **AI 优化（深度抽取）触发** | `ui_click` | design_system_project · design_system_enrich · `ai_optimize` | design_system_id, project_kind | ❌ | ProjectView.tsx:6234（BrandEnrichmentBanner） |
| C14 | **AI 优化结果** | `design_system_enrich_result` | design_system_project · design_system_enrich · — | result, duration_ms, design_system_id | ❌ | enrichment run 完成 |
| C15 | **enrichment 状态落库** | （非事件，数据字段） | — | `ProjectMetadata.enrichmentStatus: programmatic/ai_refined` + `enrichmentCompletedAt` | ❌ | apps/daemon brands/metadata |

> C13/C14 = 你要的“AI 转化率”。C15 是 §6 效果对比的前提：没有这个字段，事后无法区分两类 DS。事件名统一用 `design_system_enrich`（不叫 brand_enrichment）。

### 3.4 生成后编辑 / 迭代（按评论⑤修正：没有 draft，编辑走右侧工具且本质都经 Chat）

**修正口径（评论⑤）**：DS 生成出来是一组**原始 HTML 产物**。编辑它**没有单独的 draft 态**，而是用项目**右侧的工具：Draw / Edit / Comment / Mark**，外加直接 **Chat**。关键认知：**Draw/Edit/Comment/Mark 本质和 Chat 一样——它们最终都把意图喂给 agent，由一次 run 真正去改 HTML**（例如你 Comment 一下，其实是转成 chat 让 agent 改）。所以这些编辑动作在数据上几乎都落成 `run_created`，用 `edit_surface` 维度区分是从哪个工具发起的。

`edit_surface` 取值：

| `edit_surface` | 从哪发起 | 本质 |
|---|---|---|
| `chat` | 直接在对话框发消息 | agent run |
| `edit` | 右侧 **Edit** 工具 | 经 agent run（ArtifactToolbarClick element=`edit`，events.ts:1932） |
| `draw` | 右侧 **Draw** 工具 | 经 agent run（DrawToolbarClick，events.ts:1966） |
| `comment` | 右侧 **Comment** 工具 | 经 agent run（CommentPopoverClick：save_comment/send_to_chat，events.ts:1993） |
| `mark` | 右侧 **Mark** 工具 | 经 agent run |
| `direct_module` | DS 面板上的就地模块按钮（§3.6） | 部分直接改、部分经 agent |

| # | 事件 | 类型 | 三元组 | 关键维度 | 状态 | 说明 |
|---|---|---|---|---|---|---|
| E1 | **编辑 DS（chat/draw/edit/comment/mark）** | `run_created` | design_system_project · design_system_generation · — | `project_kind='design_system'`, `edit_surface`, `has_existing_artifact=true`, `is_first_run=false`, design_system_id | ⚠️ | run 基础设施有，要确保带 `project_kind` + `edit_surface`，并用 `has_existing_artifact` 把“后续编辑”与“首次生成”分开 |
| E2 | **右侧工具点击**（Draw/Edit/Comment/Mark） | `ui_click` | design_system_project · artifact_toolbar · `edit/draw/comment/mark/...` | `artifact_kind='design_system'`, design_system_id | ⚠️ | 工具点击事件已存在（ArtifactToolbar/Draw/Comment），需确保在 DS 项目里带上 `artifact_kind='design_system'` 维度以便筛 DS 编辑 |
| E3 | **模块按钮点击**（见 §3.6） | `ui_click` | design_system_project · design_system_edit · `<module_action>` | `edit_surface='direct_module'`, `module`, `artifact_kind='design_system'`, design_system_id | ❌ | 20 个未埋按钮 |

**两层标记机制**：
- 项目层：`project_kind='design_system'` → DS-project 内的任何 run/点击都能被识别为“在编辑 DS”。
- 动作层：编辑事件统一带 `artifact_kind='design_system'` + `edit_surface`，无论从 Chat 还是右侧 Draw/Edit/Comment/Mark 发起，都能筛出“针对 DS 的编辑”，并区分入口工具。

### 3.5 使用 DS（run 创建，含官方/自建）

| # | 事件 | 类型 | 三元组 | 关键维度 | 状态 | 位置 |
|---|---|---|---|---|---|---|
| U1 | Home 选 DS → 发送 run | `run_created` | chat_panel · chat_composer · — | design_system_id, **design_system_kind**, **design_system_slug**, design_system_source, project_kind | ⚠️ | HomeHero.tsx:1662 → App.tsx:1337 → daemon runs.ts |
| U2 | CTC “用 Agent 编辑” → 新项目 | `ui_click` + 随后 run | design_systems · design_system_list · `edit_with_agent` | design_system_id, design_system_kind | ❌(按钮) | DesignSystemsTab.tsx:1075 onEdit |
| U3 | **修复 daemon 来源上报** | （改 U1 字段） | — | 真正上报 `design_system_source`（request/plugin/project/app-default→映射到 §2.1 枚举） | ⚠️ | runs.ts:814-817 现被硬覆盖为 unknown |
| U4 | **官方 vs 自建维度** | （改 U1 字段） | — | `design_system_kind`, `design_system_slug` | ❌ | 由 id 前缀/注册表派生 |

> U3/U4 = 你要的“是否主动选了 DS / 官方还是自建 / 具体哪个”。现在全是 unknown，必修。

### 3.6 编辑/预览面板按钮清单（23 个，13% 已埋）

统一口径：`page_name=design_system_project`，`area=design_system_edit`，带 `edit_surface='direct_module'` + `artifact_kind='design_system'` + `design_system_id` + `module`。`element` 命名建议如下。

**通用操作（DS 层级）** — DesignSystemsTab.tsx
| 按钮 | element | 状态 | 行 |
|---|---|---|---|
| 用 Agent 编辑 | `edit_with_agent` | ❌ | 1075 |
| 刷新 | `refresh` | ❌ | 1087 |
| 下载 | `download` | ❌ | 1099 |
| 设为默认 | `set_default` | ✅ (status_result) | 1126 |
| 发布/取消发布 | `publish`/`unpublish` | ✅ | 1138 |
| 删除 | `delete` | ✅ | 1150 |

**模块操作** — DesignKitView.tsx（统一 `area=design_system_edit`，`module` 维度区分）
| 模块 | 按钮 | element | module | 状态 | 行 |
|---|---|---|---|---|---|
| Logo | 上传 / 复制图 / 删除 | `logo_upload`/`logo_copy`/`logo_delete` | logo | ❌ | 649-653 |
| Brand/DesignMD | 复制 / 编辑 / 上传 MD | `design_md_copy`/`design_md_edit`/`design_md_upload` | design_md | ❌ | 452/454/459 |
| Typography | 上传字体 | `font_upload` | typography | ❌ | 701 |
| Palette | 改颜色 | `color_edit` | palette | ❌ | 766 |
| Images | 上传 / 复制 / 删除 | `image_upload`/`image_copy`/`image_delete` | images | ❌ | 883/884/914 |
| Kit | 刷新/下载/导入/重置/打开 | `kit_refresh`/`kit_download`/`kit_import`/`kit_reset`/`kit_open` | kit | ❌ | 948-963 |

**Brand 卡（BrandPreviewCard.tsx）**（注：这是预设品牌素材的预览卡，属来源层）
| 按钮 | element | 状态 | 行 |
|---|---|---|---|
| 用到新对话 | `use_in_chat` | ❌ | 118 |
| 打开项目 | `open_project` | ❌ | 127 |
| 删除 | `delete` | ❌ | 136 |

---

## 4. 现状盘点（一句话）

- **创建侧**：主干已埋（page_view / 各输入点击 / 文件上传 / create_result / status_result）；缺 **预设品牌选择器(C7-C9)**、**Onboarding 创建-vs-跳过(C2)**、**AI 优化(C13-C15)**；`ds_source_origins` 需改多值(评论②)；**`entry_from` 入口来源被写死成二元、需透传真实来源(§3.1)**。
- **使用侧**：run 基础设施在，但 **官方/自建 + 来源口径全是 unknown(U3/U4)**，CTC 入口按钮未埋(U2)。
- **编辑侧**：几乎空白——23 个面板按钮埋了 3 个；缺整条编辑/迭代生命周期(E1-E3)。
- **地基**：`project_kind='design_system'` 枚举有、未接通(§1)；`enrichment_status` 字段完全缺(C15)。

## 5. 分期落地建议（实现时用）

- **第一期（地基 + 两个盲区）**：§1 接通 `project_kind` → U3/U4 修 daemon 来源&官方/自建 → C7-C9 预设品牌选择器 → C13-C15 AI 优化事件+状态字段 → `ds_source_origins` 改多值 → **§3.1 `entry_from` 三类入口透传（补 `project_canvas`/`library` 枚举值 + 改掉二元写死）**。直接支撑留存/复购/AI 转化分析。
- **第二期（编辑生命周期）**：E1-E3 + §3.6 全部面板/模块按钮。
- **第三期（补全）**：C2 Onboarding 分叉、C10 多网站计数、其余次级动作。
- 每期：契约（contracts）改完先 `pnpm --filter @open-design/contracts build` 再 web typecheck；新 interface 记得加进 events.ts 末尾总 union；落地后同步飞书「埋点文档2.0」表 `MUu2Au`（对外写，动手前确认）。

## 6. 分析口径（落地后怎么用）

- **DS 创建量/人**：`design_system_create_result{result=success}` 按 person 计数。
- **AI 转化率**：`design_system_enrich_result` 触发数 ÷ 程序化创建数。
- **程序化 vs AI优化 留存**：按 `enrichment_status` 分群，看各自 DS 的后续 `run_created{design_system_id=...}` 频次与 WAU 留存。
- **编辑深度**：`project_kind='design_system'` 的 run（E1）+ 右侧工具点击（E2）+ 模块按钮（E3）频次，可再按 `edit_surface` 拆 chat/edit/draw/comment/mark/direct_module。
- **创建入口转化**：`design_system_create_result` 按 `entry_from`（onboarding / design_systems_page / home_card / composer_picker / project_canvas / library …）下钻，看各入口的成功率与占比（见 §3.1）。
- **来源偏好**：`ds_source_origins` 多值拆开，统计每种来源占比与“多来源”组合（评论②）。
- **使用偏好**：`run_created` 按 `design_system_kind(official/custom)` 与 `design_system_slug` 下钻。
- **留存/复购关联**：以“是否创建过 DS / 创建数量分桶 / 是否用过 AI 优化”为用户属性，关联留存曲线与复购转化（注意 OD 留存须限已认证用户，见团队留存口径备忘）。
