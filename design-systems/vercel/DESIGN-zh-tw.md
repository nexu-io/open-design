# Design System Inspired by Vercel

> Category: 開發者工具
> 前端部署。黑白精準，Geist 字型。

## 1. Visual Theme & Atmosphere

Vercel 的網站是「開發者基礎設施化為無形」的視覺論文——一套克制到近乎哲學層次的設計系統。頁面以大量純白（`#ffffff`）搭配近黑（`#171717`）文字，營造出如同畫廊般的空靜，每個元素都在為自己所佔的像素值得存在。這不是裝飾性的極簡主義，而是作為工程原則的極簡主義。Geist 設計系統對待介面，就像編譯器對待程式碼——一切多餘的 token 全部剝除，只留下結構。

自訂字型 Geist 是整套系統的核心瑰寶。Geist Sans 在顯示尺寸下採用大幅度的負字距（-2.4px 到 -2.88px），使標題感覺緊縮、有張力、充滿工程感——就像壓縮過的生產環境程式碼。縮小到正文尺寸時，字距放鬆，但幾何精準感依然延續。Geist Mono 作為等寬字型夥伴，用於程式碼、終端機輸出與技術標籤。兩種字型均在全域啟用 OpenType `"liga"`（連字），為版面增添一層令細心閱讀者受益的排版精緻感。

Vercel 與其他單色設計系統最大的不同，在於其「以陰影代替邊框」的哲學。相較於傳統的 CSS border，Vercel 使用 `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` ——偏移為零、模糊為零、擴散 1px 的陰影，製造出類似邊框的線條，卻不帶來盒模型上的影響。此技術讓邊框存在於陰影層，實現更平滑的過渡、不會裁切的圓角，以及比傳統邊框更細膩的視覺重量。整個深度系統建立在多層、多值的陰影堆疊上，每一層都有其特定用途：一層用於邊框，一層用於柔和浮起感，一層用於環境深度。

**Key Characteristics:**
- Geist Sans 搭配極度負字距（顯示尺寸 -2.4px 到 -2.88px）——文字即壓縮的基礎設施
- Geist Mono 用於程式碼與技術標籤，全域啟用 OpenType `"liga"`
- 以陰影代替邊框技術：`box-shadow 0px 0px 0px 1px` 全面取代傳統 border
- 多層陰影堆疊實現細膩深度（邊框 + 浮起 + 環境光，在單一宣告中完成）
- 近純白畫布搭配 `#171717` 文字——非全黑，產生微妙的對比柔和感
- 工作流程專屬強調色：Ship Red（`#ff5b4f`）、Preview Pink（`#de1d8d`）、Develop Blue（`#0a72ef`）
- 使用 `hsla(212, 100%, 48%, 1)` 的焦點環系統——飽和藍色以符合無障礙需求
- 膠囊徽章（9999px）搭配色調背景，用於狀態指示器

## 2. Color Palette & Roles

### Primary
- **Vercel Black** (`#171717`)：主要文字、標題、深色表面背景。非純黑——些微暖意防止刺眼。
- **Pure White** (`#ffffff`)：頁面背景、卡片表面、深色底上的按鈕文字。
- **True Black** (`#000000`)：次要用途，`--geist-console-text-color-default`，用於特定的主控台/程式碼情境。

### Workflow Accent Colors
- **Ship Red** (`#ff5b4f`)：`--ship-text`，「出貨到生產環境」工作流程步驟——溫暖、緊迫的珊瑚紅。
- **Preview Pink** (`#de1d8d`)：`--preview-text`，預覽部署工作流程——鮮豔的洋紅粉。
- **Develop Blue** (`#0a72ef`)：`--develop-text`，開發工作流程——明亮、專注的藍色。

### Console / Code Colors
- **Console Blue** (`#0070f3`)：`--geist-console-text-color-blue`，語法高亮藍色。
- **Console Purple** (`#7928ca`)：`--geist-console-text-color-purple`，語法高亮紫色。
- **Console Pink** (`#eb367f`)：`--geist-console-text-color-pink`，語法高亮粉紅。

### Interactive
- **Link Blue** (`#0072f5`)：主要連結顏色，帶底線裝飾。
- **Focus Blue** (`hsla(212, 100%, 48%, 1)`)：`--ds-focus-color`，互動元素上的焦點環。
- **Ring Blue** (`rgba(147, 197, 253, 0.5)`)：`--tw-ring-color`，Tailwind 環形工具類。

### Neutral Scale
- **Gray 900** (`#171717`)：主要文字、標題、導覽文字。
- **Gray 600** (`#4d4d4d`)：次要文字、說明文案。
- **Gray 500** (`#666666`)：第三層文字、靜音連結。
- **Gray 400** (`#808080`)：佔位文字、停用狀態。
- **Gray 100** (`#ebebeb`)：邊框、卡片輪廓、分隔線。
- **Gray 50** (`#fafafa`)：細膩表面色調、內部陰影高光。

### Surface & Overlay
- **Overlay Backdrop** (`hsla(0, 0%, 98%, 1)`)：`--ds-overlay-backdrop-color`，強制回應視窗/對話框背景遮罩。
- **Selection Text** (`hsla(0, 0%, 95%, 1)`)：`--geist-selection-text-color`，文字選取高亮。
- **Badge Blue Bg** (`#ebf5ff`)：膠囊徽章背景，色調藍色表面。
- **Badge Blue Text** (`#0068d6`)：膠囊徽章文字，較深的藍色以確保可讀性。

### Shadows & Depth
- **Border Shadow** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`)：標誌性技術——取代傳統邊框。
- **Subtle Elevation** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`)：卡片的極小浮起感。
- **Card Stack** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`)：完整多層卡片陰影。
- **Ring Border** (`rgb(235, 235, 235) 0px 0px 0px 1px`)：用於標籤頁與圖片的淺灰環形邊框。

## 3. Typography Rules

### Font Family
- **Primary**：`Geist`，備用字型：`Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monospace**：`Geist Mono`，備用字型：`ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **OpenType Features**：所有 Geist 文字全域啟用 `"liga"`；特定說明文字啟用 `"tnum"` 以獲得表格數字。

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (tight) | -2.4px to -2.88px | 最大壓縮，廣告牌衝擊感 |
| Section Heading | Geist | 40px (2.50rem) | 600 | 1.20 (tight) | -2.4px | 功能區段標題 |
| Sub-heading Large | Geist | 32px (2.00rem) | 600 | 1.25 (tight) | -1.28px | 卡片標題、子區段 |
| Sub-heading | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | 較輕的子標題 |
| Card Title | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | 功能卡片 |
| Card Title Light | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | 次要卡片標題 |
| Body Large | Geist | 20px (1.25rem) | 400 | 1.80 (relaxed) | normal | 引言、功能描述 |
| Body | Geist | 18px (1.13rem) | 400 | 1.56 | normal | 標準閱讀文字 |
| Body Small | Geist | 16px (1.00rem) | 400 | 1.50 | normal | 標準 UI 文字 |
| Body Medium | Geist | 16px (1.00rem) | 500 | 1.50 | normal | 導覽、強調文字 |
| Body Semibold | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | 強勁標籤、活動狀態 |
| Button / Link | Geist | 14px (0.88rem) | 500 | 1.43 | normal | 按鈕、連結、說明文字 |
| Button Small | Geist | 14px (0.88rem) | 400 | 1.00 (tight) | normal | 緊湊型按鈕 |
| Caption | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | 元資料、標籤 |
| Mono Body | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | 程式碼區塊 |
| Mono Caption | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | 程式碼標籤 |
| Mono Small | Geist Mono | 12px (0.75rem) | 500 | 1.00 (tight) | normal | `text-transform: uppercase`，技術標籤 |
| Micro Badge | Geist | 7px (0.44rem) | 700 | 1.00 (tight) | normal | `text-transform: uppercase`，微型徽章 |

### Principles
- **壓縮即身份**：Geist Sans 在顯示尺寸下使用 -2.4px 到 -2.88px 的字距——這是所有主流設計系統中最激進的負字距。此舉使文字感覺像是_壓縮過的_、針對生產環境最佳化的程式碼。字距隨尺寸縮小而逐漸放鬆：32px 時為 -1.28px，24px 時為 -0.96px，16px 時為 -0.32px，14px 時恢復正常。
- **連字無處不在**：每個 Geist 文字元素均啟用 OpenType `"liga"`。連字不是裝飾——而是結構性的，創造更緊湊、更高效的字形組合。
- **三種字重，嚴格對應角色**：400（正文/閱讀）、500（UI/互動）、600（標題/強調）。除極小型微徽章外不使用粗體（700）。這種窄字重範圍透過尺寸與字距建立層次，而非依賴字重。
- **等寬字型作為身份**：大寫搭配 `"tnum"` 或 `"liga"` 的 Geist Mono 作為「開發者主控台」聲音——將行銷網站與產品緊密相連的緊湊技術標籤。

## 4. Component Stylings

### Buttons

**Primary White (Shadow-bordered)**
- Background: `#ffffff`
- Text: `#171717`
- Padding: 0px 6px（最小——由內容決定寬度）
- Radius: 6px（略帶圓角）
- Shadow: `rgb(235, 235, 235) 0px 0px 0px 1px`（環形邊框）
- Hover: 背景變換為 `var(--ds-gray-1000)`（深色）
- Focus: `2px solid var(--ds-focus-color)` 外框 + `var(--ds-focus-ring)` 陰影
- Use: 標準次要按鈕

**Primary Dark (Inferred from Geist system)**
- Background: `#171717`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 6px
- Use: 主要 CTA（「Start Deploying」、「Get Started」）

**Pill Button / Badge**
- Background: `#ebf5ff`（色調藍）
- Text: `#0068d6`
- Padding: 0px 10px
- Radius: 9999px（完整膠囊）
- Font: 12px weight 500
- Use: 狀態徽章、標籤、功能標示

**Large Pill (Navigation)**
- Background: 透明或 `#171717`
- Radius: 64px–100px
- Use: 標籤頁導覽、區段選擇器

### Cards & Containers
- Background: `#ffffff`
- Border: 透過陰影實現——`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Radius: 8px（標準）、12px（精選/圖片卡片）
- Shadow stack: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- 圖片卡片：`1px solid #ebebeb` 搭配 12px 頂部圓角
- Hover: 陰影細微加深

### Inputs & Forms
- Radio: 標準樣式，焦點時使用 `var(--ds-gray-200)` 背景
- Focus shadow: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Focus outline: `2px solid var(--ds-focus-color)` ——一致的藍色焦點環
- Border: 透過陰影技術實現，非傳統 border

### Navigation
- 純白上的乾淨水平導覽列，黏性定位
- Vercel 標誌靠左對齊，262x52px
- 連結：Geist 14px weight 500，`#171717` 文字
- 活動狀態：weight 600 或底線
- CTA：深色膠囊按鈕（「Start Deploying」、「Contact Sales」）
- 行動版：漢堡選單收合
- 產品下拉選單支援多層級

### Image Treatment
- 產品截圖搭配 `1px solid #ebebeb` 邊框
- 頂部圓角圖片：`12px 12px 0px 0px` 圓角
- 儀表板/程式碼預覽截圖主導功能區段
- 英雄圖片後方的柔和漸層背景（多色粉彩）

### Distinctive Components

**Workflow Pipeline**
- 三步驟水平流程：Develop → Preview → Ship
- 每個步驟有其專屬強調色：藍色 → 粉紅 → 紅色
- 以線條/箭頭連接
- Vercel 核心價值主張的視覺隱喻

**Trust Bar / Logo Grid**
- 公司標誌（Perplexity、ChatGPT、Cursor 等）以灰階呈現
- 水平捲動或格狀排列
- 細膩的 `#ebebeb` 邊框分隔

**Metric Cards**
- 大型數字展示（例如「10x faster」）
- Geist 48px weight 600 呈現指標數字
- 下方灰色正文說明
- 陰影邊框卡片容器

## 5. Layout Principles

### Spacing System
- 基本單位：8px
- 刻度：1px、2px、3px、4px、5px、6px、8px、10px、12px、14px、16px、32px、36px、40px
- 值得注意的跳躍：從 16px 直接跳到 32px——主要刻度中不存在 20px 或 24px

### Grid & Container
- 最大內容寬度：約 1200px
- 英雄區：置中單欄，頂部充裕留白
- 功能區段：卡片採 2–3 欄格線
- 全寬分隔線使用 `border-bottom: 1px solid #171717`
- 程式碼/儀表板截圖採全寬或帶邊框的容器

### Whitespace Philosophy
- **畫廊空靜感**：區段間的垂直留白極為充裕（80px–120px+）。留白本身即設計——它傳達出 Vercel 無需證明、無需遮掩任何事物。
- **文字壓縮，空間舒展**：標題上激進的負字距，被周遭慷慨的留白所平衡。文字密度高；環繞的空間卻廣闊。
- **區段節奏**：白色區段交替白色區段——區段之間無色彩變化。分隔完全依賴邊框（陰影邊框）與間距。

### Border Radius Scale
- Micro（2px）：行內程式碼片段、小型 span
- Subtle（4px）：小型容器
- Standard（6px）：按鈕、連結、功能元素
- Comfortable（8px）：卡片、列表項目
- Image（12px）：精選卡片、圖片容器（頂部圓角）
- Large（64px）：標籤頁導覽膠囊
- XL（100px）：大型導覽連結
- Full Pill（9999px）：徽章、狀態膠囊、標籤
- Circle（50%）：選單切換、頭像容器

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | 無陰影 | 頁面背景、文字區塊 |
| Ring (Level 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | 大多數元素的陰影式邊框 |
| Light Ring (Level 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | 標籤頁、圖片的較淺環形 |
| Subtle Card (Level 2) | Ring + `rgba(0,0,0,0.04) 0px 2px 2px` | 極小浮起感的標準卡片 |
| Full Card (Level 3) | Ring + Subtle + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + inner `#fafafa` ring | 精選卡片、高亮面板 |
| Focus (Accessibility) | `2px solid hsla(212, 100%, 48%, 1)` outline | 所有互動元素的鍵盤焦點 |

**陰影哲學**：Vercel 可說是現代網頁設計中最精密的陰影系統。Vercel 並非以傳統 Material Design 的方式用陰影表現高度，而是使用多值陰影堆疊，每一層都有明確的架構用途：一層製造「邊框」（0px 擴散，1px），一層增加環境柔和感（2px 模糊），一層處理遠距深度（8px 模糊搭配負擴散），以及一層內環（`#fafafa`）製造讓卡片「從內部發光」的細膩高光。這種分層方式讓卡片感覺是被建造出來的，而非漂浮在空中。

### Decorative Depth
- 英雄漸層：英雄內容後方的柔和多色粉彩漸層（幾乎不可見，僅作氛圍烘托）
- 區段邊框：主要區段間的 `1px solid #171717`（完整深色線條）
- 無背景色彩變化——深度完全來自陰影分層與邊框對比

## 7. Do's and Don'ts

### Do
- 在顯示尺寸上使用 Geist Sans 搭配激進的負字距（48px 時 -2.4px 到 -2.88px）
- 使用陰影式邊框（`0px 0px 0px 1px rgba(0,0,0,0.08)`）取代傳統 CSS border
- 在所有 Geist 文字上啟用 `"liga"`——連字是結構性的，並非可選
- 使用三種字重系統：400（正文）、500（UI）、600（標題）
- 僅在對應的工作流程情境中使用流程強調色（紅/粉/藍）
- 卡片使用多層陰影堆疊（邊框 + 浮起 + 環境光 + 內部高光）
- 保持色盤無彩——從 `#171717` 到 `#ffffff` 的灰階是整套系統
- 主要文字使用 `#171717` 而非 `#000000`——那微乎其微的暖意至關重要

### Don't
- 不要在 Geist Sans 上使用正值字距——它永遠是負值或零
- 不要在正文上使用 weight 700（粗體）——600 是上限，且僅用於標題
- 不要在卡片上使用傳統 CSS `border`——使用陰影邊框技術
- 不要將暖色（橘、黃、綠）引入 UI 外框
- 不要裝飾性地使用工作流程強調色（Ship Red、Preview Pink、Develop Blue）
- 不要使用過重的陰影（不透明度 > 0.1）——陰影系統以低語般的輕盈著稱
- 不要增加正文字距——Geist 是為緊湊排版而設計的
- 不要在主要動作按鈕上使用膠囊圓角（9999px）——膠囊只用於徽章/標籤
- 不要省略卡片陰影中的 `#fafafa` 內環——那是讓整套系統發揮作用的微光

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile Small | <400px | 緊湊單欄，最小化留白 |
| Mobile | 400–600px | 標準行動版，堆疊排列 |
| Tablet Small | 600–768px | 開始出現雙欄格線 |
| Tablet | 768–1024px | 完整卡片格線，擴大留白 |
| Desktop Small | 1024–1200px | 標準桌面排版 |
| Desktop | 1200–1400px | 完整排版，最大內容寬度 |
| Large Desktop | >1400px | 置中，慷慨邊距 |

### Touch Targets
- 按鈕使用舒適的 padding（垂直 8px–16px）
- 導覽連結 14px，間距充足
- 膠囊徽章水平 padding 10px 以確保觸控目標
- 行動版選單切換使用 50% 圓角圓形按鈕

### Collapsing Strategy
- 英雄區：顯示尺寸 48px → 縮小時按比例維持負字距
- 導覽列：水平連結 + CTA → 漢堡選單
- 功能卡片：3 欄 → 2 欄 → 單欄堆疊
- 程式碼截圖：維持長寬比，可能出現水平捲動
- 信任標誌欄：格線 → 水平捲動
- 頁腳：多欄 → 單欄堆疊
- 區段間距：80px+ → 行動版縮減至 48px

### Image Behavior
- 儀表板截圖在所有尺寸下維持邊框處理
- 英雄漸層在行動版上柔化/簡化
- 產品截圖使用響應式圖片，維持一致的邊框圓角
- 全寬區段維持邊到邊的處理方式

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: Vercel Black（`#171717`）
- Background: Pure White（`#ffffff`）
- Heading text: Vercel Black（`#171717`）
- Body text: Gray 600（`#4d4d4d`）
- Border (shadow): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Link: Link Blue（`#0072f5`）
- Focus ring: Focus Blue（`hsla(212, 100%, 48%, 1)`）

### Example Component Prompts
- "Create a hero section on white background. Headline at 48px Geist weight 600, line-height 1.00, letter-spacing -2.4px, color #171717. Subtitle at 20px Geist weight 400, line-height 1.80, color #4d4d4d. Dark CTA button (#171717, 6px radius, 8px 16px padding) and ghost button (white, shadow-border rgba(0,0,0,0.08) 0px 0px 0px 1px, 6px radius)."
- "Design a card: white background, no CSS border. Use shadow stack: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Radius 8px. Title at 24px Geist weight 600, letter-spacing -0.96px. Body at 16px weight 400, #4d4d4d."
- "Build a pill badge: #ebf5ff background, #0068d6 text, 9999px radius, 0px 10px padding, 12px Geist weight 500."
- "Create navigation: white sticky header. Geist 14px weight 500 for links, #171717 text. Dark pill CTA 'Start Deploying' right-aligned. Shadow-border on bottom: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Design a workflow section showing three steps: Develop (text color #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Each step: 14px Geist Mono uppercase label + 24px Geist weight 600 title + 16px weight 400 description in #4d4d4d."

### Iteration Guide
1. 永遠使用陰影式邊框取代 CSS border——`0px 0px 0px 1px rgba(0,0,0,0.08)` 是基礎
2. 字距隨字型尺寸縮放：48px 時 -2.4px，32px 時 -1.28px，24px 時 -0.96px，14px 時恢復正常
3. 僅三種字重：400（閱讀）、500（互動）、600（宣告）
4. 顏色是功能性的，絕非裝飾性——工作流程顏色（紅/粉/藍）僅標示流程階段
5. 卡片陰影中的 `#fafafa` 內環，是賦予 Vercel 卡片細膩內光的關鍵
6. 技術標籤用 Geist Mono 大寫，其餘全用 Geist Sans
