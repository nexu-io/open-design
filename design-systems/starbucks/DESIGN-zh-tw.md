# 以 Starbucks 為靈感的設計系統

> Category: 電商與零售
> 全球咖啡零售品牌。四階綠色系統、溫暖奶油色畫布、全圓角膠囊按鈕。

## 1. 視覺主題與氛圍

Starbucks 的設計系統是一套**溫暖而自信的零售旗艦**風格，將圍裙上的綠色延伸至每一個介面層面。畫布在中性暖奶油色（`#f2f0eb`）與陶瓷白（`#edebe9`）之間交替——這兩種顏色呼應了實體店的材質：紙巾、咖啡廳牆壁、木質裝潢——而標誌性的 **Starbucks 綠**（`#006241`）則在主視覺橫幅、CTA 以及 Rewards 體驗中錨定品牌時刻。綠色共分四個精心校調的色階（Starbucks、Accent、House、Uplift），各自對應特定的介面角色；金色（`#cba258`）僅出現在 Rewards 等級儀式場景，而非通用強調色。

字體承載了品牌大部分的聲音。專屬字體 **SoDoSans**（Starbucks 客製字型）覆蓋幾乎所有介面，並以緊湊的 `-0.16px` 字元間距呈現——讀起來自信而親切，而非時尚雜誌式的冷峻。有一點特別值得注意：Rewards 頁面在特定標題場景切換為溫暖的襯線字體（`"Lander Tall", "Iowan Old Style", Georgia`），微妙地呼應了咖啡館黑板的懷舊感。Careers 頁面則使用手寫風格字體（`"Kalam", "Comic Sans MS", cursive`）來呈現個人化的杯名觸感。三種字體、三種情境——系統對各字體的使用時機有嚴格的規範。

介面透過圓潤幾何形狀呼吸。每個按鈕都是 50px 全圓角膠囊形。卡片採用 12px 圓角矩形。「Frap」浮動 CTA——一個 56px 圓形訂單按鈕，填充 Green Accent（`#00754A`）——是產品的標誌性深度設計：它以層疊陰影（`0 0 6px rgba(0,0,0,0.24)` 基底 + `0 8px 12px rgba(0,0,0,0.14)` 環境）懸浮於右下角，按下時以 `scale(0.95)` 壓縮。整體陰影層級極為克制——卡片陰影維持在低透明度 `0.14/0.24`，全局導航欄使用三層柔和陰影疊加。整個系統有如整潔的咖啡廳招牌：清晰、溫暖，絕不嘈雜。

**主要特徵：**
- 四階綠色品牌系統（Starbucks / Accent / House / Uplift），各自對應不同介面角色，而非單一「品牌綠」
- 金色僅保留給 Rewards 等級儀式場景；絕非通用強調色
- 溫暖中性畫布（`#f2f0eb` / `#edebe9`）取代冷白色——呼應咖啡廳實體材質
- 客製專屬字體（SoDoSans），緊湊 `-0.16px` 字元間距，為通用聲音
- 情境切換字體：Rewards 使用 Lander Tall 襯線字體，Careers 杯名使用 Kalam 手寫字體
- 全圓角膠囊按鈕（`50px` 圓角）為通用規範，`scale(0.95)` 按下回饋為標誌性微互動
- 浮動「Frap」圓形 CTA（`56px`，Green Accent 填充，層疊陰影）——產品的標誌性高層級元素
- 禮品卡介面設計為**實體商品攝影**——每張卡片都是獨立的插畫攝影作品，而非生成圖形
- 12px 卡片圓角 + 極輕柔陰影，讓內容卡片呈現扁平加微量浮起的效果
- 以 rem 為基礎的間距比例，錨定 1.6rem（約 16px）= `--space-3`，最大步進至 6.4rem（約 64px）

**色塊頁面節奏：** 奶油色主視覺 → 白色內容區塊 → 深綠色（`#1E3932`）特色橫幅（白色文字）→ 奶油色功能區 → 深綠色（`#1E3932`）頁尾（金色 / 白色文字）——以濃縮咖啡般的深色作為明亮主體的首尾呼應。

## 2. 色彩調色盤與角色

**分析來源頁面：** 首頁、Rewards、禮品卡、商品詳情（Pink Energy Drink）、商品營養資訊（Cold Brew）。

### 主色

- **Starbucks Green**（`#006241`）：歷史性品牌綠。用於 h1 標題、Rewards 頁面主要區塊標題，以及需要單一主色時的品牌信號。
- **Green Accent**（`#00754A`）：稍微明亮、更有光澤的綠色。主要填充 CTA 色（「Explore our afternoon menu」、「See the spring menu」）以及浮動 Frap 圓形按鈕的填充色。
- **House Green**（`#1E3932`）：深沉近黑的品牌綠。頁尾底面、特色橫幅背景、Rewards 等級深色底面，以及 Rewards 頁面「Free coffee is just the beginning」英雄橫幅。
- **Green Uplift**（`#2b5148`）：次要中深綠，少量用於裝飾強調與深色漸層場景。
- **Green Light**（`#d4e9e2`）：淡薄荷色，用於表單有效狀態色調與淺綠功能底面。

### 輔助色與強調色

- **Gold**（`#cba258`）：幾乎專屬於 Rewards 等級儀式——Gold 等級標示、合作夥伴徽章（SkyMiles、Bonvoy）以及高端感強調。絕非通用品牌色。
- **Gold Light**（`#dfc49d`）：較柔和的金色，用於金色等級區塊的背景底洗。
- **Gold Lightest**（`#faf6ee`）：奶油金色頁面底洗，用於 Rewards 頁面合作夥伴區塊——將金色強調色連結回溫暖中性系統。

### 底面與背景色

- **White**（`#ffffff`）：主要卡片與 Modal 底面；同時用於禮品卡圖塊的卡片填充。
- **Neutral Cool**（`#f9f9f9`）：細微冷灰底面，用於下拉選單（「Account」下拉）、表單卡片包裝以及安靜的功能容器。
- **Neutral Warm**（`#f2f0eb`）：溫暖奶油色，Rewards 功能區與英雄橫幅的**主要頁面畫布**。
- **Ceramic**（`#edebe9`）：略暖略深的奶油色，用於區域分隔、頁面區塊柔和底洗，以及 Rewards 合作夥伴橫幅。
- **Black**（`#000000`）：深墨色，保留給頁面頂部深色 CTA 橫幅（「Join now」）以及高對比頂部導航登入按鈕。

### 中性色與文字色

- **Text Black**（`rgba(0, 0, 0, 0.87)`）：淺色底面上的主要標題與正文色。非純黑——87% 透明度的黑色讀起來更溫暖。
- **Text Black Soft**（`rgba(0, 0, 0, 0.58)`）：淺色底面上的次要 / 中繼資料文字。
- **Text White**（`rgba(255, 255, 255, 1)`）：深綠色底面上的主要標題 / 正文色。
- **Text White Soft**（`rgba(255, 255, 255, 0.70)`）：深綠色底面上的次要文字——頁尾連結說明、圖說文字。
- **Rewards Green**（`#33433d`）：專屬於 Rewards 頁面文字區塊的消光板岩綠——比 Text Black 略帶「塵霧感」的閱讀色，在不使用完整 Starbucks Green 的情況下傳遞「Rewards 底面」的信號。

### 語意色與強調色

- **Red**（`#c82014`）：錯誤與危險狀態（表單無效、破壞性操作）。
- **Yellow**（`#fbbc05`）：警告狀態、舊版品牌觸感。
- **Green Light**（`#d4e9e2`，33% 透明度 = `hsl(160 32% 87% / 33%)`）：表單有效欄位色調背景。
- **Red Tint**（`hsl(4 82% 43% / 5%)`）：表單無效欄位色調。

### 黑 / 白透明度階梯

兩組平行半透明比例，用於疊加與次要文字：
- `rgba(0,0,0,0.06)` 至 `rgba(0,0,0,0.90)`，以 10% 步進——用於淺色底面的深色疊加
- `rgba(255,255,255,0.10)` 至 `rgba(255,255,255,0.90)`，以 10% 步進——用於深色底面的淺色疊加

### 漸層系統

未觀察到結構性漸層 token。整體介面採用純色色塊——系統仰賴五階奶油色 / 綠色底面調色盤，而非漸層。

## 3. 字體規則

### 字體家族

- **主要字體：** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — Starbucks 專屬企業字體，覆蓋幾乎所有介面
- **載入備用字體：** `"Helvetica Neue", Helvetica, Arial, sans-serif` — SoDoSans 載入前用戶所見
- **Rewards 襯線字體：** `"Lander Tall", "Iowan Old Style", Georgia, serif` — 用於 Rewards 頁面特定標題場景，帶來溫暖的編輯風格感受
- **Careers 手寫字體：** `"Kalam", "Comic Sans MS", cursive` — 專屬用於 Careers 頁面「杯名」裝飾觸感，呼應 Starbucks 杯上的手寫名字

`:root` 未明確啟用 OpenType 字型特性集。

### 層級

| 角色 | 尺寸 | 字重 | 行高 | 字元間距 | 備註 |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | 最大 Rewards / 英雄展示字 |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | 次要英雄標題 |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | 登陸區塊主標題 |
| H1 | 24px | 600 | 36px | -0.16px | Starbucks Green 主標題 |
| H2 | 24px | 400 | 36px | -0.16px | Text Black 常規字重區塊標題 |
| Body Large | 19px | 400–600 | 33.25px（約 1.75） | -0.16px | 英雄導言、特色橫幅正文 |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5（24px） | -0.01em | 預設正文 |
| Small (text-2) | 1.4rem / 約 14px | 400–600 | 1.5 | -0.01em | 按鈕標籤、中繼資料、表單標籤 |
| Micro (text-1) | 1.3rem / 約 13px | 400 | 1.5 | -0.01em | 浮動標籤啟用狀態、圖說微型文字 |
| 按鈕標籤 | 14–16px | 400–600 | 1.2 | -0.01em | 所有膠囊按鈕標籤 |

**字元間距 token：**
- `letterSpacingNormal`：`-0.01em`（預設——緊湊，具識別性）
- `letterSpacingLoose`：`0.1em`（強調大寫）
- `letterSpacingLooser`：`0.15em`（大寫標籤樣式、極度強調）

**行高 token：**
- `lineHeightNormal`：`1.5`（正文）
- `lineHeightCompact`：`1.2`（展示字 / 按鈕）

### 原則

- **緊縮負字距（`-0.01em`）** 幾乎通用於整個產品——整體閱讀感略微壓縮，賦予 SoDoSans 自信的存在感，而不感到侷促。
- **字重變化承載層級，而非尺寸變化。** H1 與 H2 共用相同的 24px / 36px 尺寸，僅以字重（600 vs 400）與色彩（Starbucks Green vs Text Black）區分。
- **尺寸 token 使用 rem，錨定 `1rem = 10px`**（透過 `font-size: 62.5%` 根部技巧）。因此 `1.6rem` = 16px、`2.4rem` = 24px，以此類推。比例為語意化（textSize-1 到 textSize-10），而非任意像素值。
- **情境特定字體切換**——Rewards 使用襯線字體、Careers 使用手寫字體——是刻意且局部的設計。切勿在同一底面內與主要無襯線字體混用。
- **正文文字絕不使用純黑色**——以 `rgba(0,0,0,0.87)` 配合溫暖中性畫布的色溫。

### 字體替代說明

SoDoSans 為 Starbucks 專屬字體（由 House Industries 授權，不公開取用）。合理的開源替代方案：
- **Inter**（Google Fonts）——相似的人文幾何比例，字重範圍廣
- **Manrope**——略帶圓潤感，相似的自信風格
- **Nunito Sans**——更溫暖，適合「咖啡館」品牌替代

替換時，請驗證緊縮的 `-0.01em` / `-0.16px` 字距在新字體上閱讀效果是否良好；部分開源字體可能需要改用 `-0.005em`。

Lander Tall（Rewards 襯線字體）為客製字型——開源替代方案：**Iowan Old Style**（已在備用堆疊中）、**Lora**，或 **Source Serif Pro**。Kalam（Careers 手寫字體）可直接在 Google Fonts 取用。

## 4. 元件樣式

### 按鈕

**1. 主要填充型——「Explore our afternoon menu / Sign up for free」**
- 背景：`#00754A`（Green Accent）
- 文字：`#ffffff`
- 邊框：`1px solid #00754A`
- 圓角：`50px`（全圓角膠囊）
- 內距：`7px 16px`
- 字體：SoDoSans，16px，字重 600，字元間距 `-0.01em`
- 啟用狀態：`transform: scale(0.95)`，透過 `--buttonActiveScale`
- 過渡：`all 0.2s ease`

**2. 主要外框型——「Give them a try / Start an order」**
- 背景：透明
- 文字：`#00754A`（Green Accent）
- 邊框：`1px solid #00754A`
- 圓角 / 內距 / 啟用 / 過渡效果與主要填充型相同

**3. 黑色填充型——「Join now」**
- 背景：`#000000`
- 文字：`#ffffff`
- 邊框：`1px solid #000000`
- 圓角：`50px`，內距：`7px 16px`
- 字體：14px，字重 600
- 用於頁面頂部加入橫幅及類似轉換場景

**4. 深色外框型——「Sign in」**
- 背景：透明
- 文字：`rgba(0, 0, 0, 0.87)`（Text Black）
- 邊框：`1px solid rgba(0, 0, 0, 0.87)`
- 圓角：`50px`，內距：`7px 16px`
- 字體：14px，字重 600

**5. 綠底綠字反轉型——「See the spring menu」**
- 背景：`#ffffff`
- 文字：`#00754A`
- 邊框：`1px solid #ffffff`
- 用於按鈕後方底面為深綠 House Green 橫幅時——以白色按鈕搭配綠色文字，取代綠底上的填充綠色膠囊

**6. 深色底面外框型——「Learn more / Order now」**
- 背景：透明
- 文字：`#ffffff`
- 邊框：`1px solid #ffffff`
- 用於深綠特色橫幅上，作為與白色填充主 CTA 搭配的次要操作

**7. 同意按鈕（深綠變體）**
- 背景：`rgb(0, 130, 72)`（用於 Cookie 同意模組的特定變體綠）
- 文字：`#ffffff`
- 無邊框，`50px` 圓角，`7px 16px` 內距，14px / 字重 400
- 比 Green Accent 略亮——專屬用於同意橫幅的「同意」操作

**8. Frap——浮動圓形訂單按鈕**
- 背景：`#00754A`（Green Accent）
- 圖示：`#ffffff`
- 尺寸：`5.6rem / 56px`（標準），`4rem / 40px`（迷你版）
- 圓角：`50%`（完整圓形）
- 固定於右下角，`-0.8rem` 觸控偏移以增加點擊舒適度
- 陰影疊加：基底 `0 0 6px rgba(0,0,0,0.24)` + 環境 `0 8px 12px rgba(0,0,0,0.14)`
- 啟用狀態：環境陰影消退至 `0 8px 12px rgba(0,0,0,0)`
- 這是產品的標誌性高層級元素——浮動於每個捲動底面之上

**9. 全寬回饋標籤——「Provide feedback」**
- 背景：`#00754A`
- 文字：`#ffffff`
- 圓角：`12px 12px 0px 0px`（僅頂部圓角）
- 內距：`8px 16px`
- 字體：14px，字重 400
- 固定於視窗右下內側邊緣

### 卡片與容器

**內容卡片（預設）**
- 背景：`#ffffff`（`--cardBackgroundColor`）
- 圓角：`12px`（`--cardBorderRadius`）
- 陰影：`0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)`（`--cardBoxShadow`）
- 用於：特色卡片、選單品項圖塊、Rewards 等級面板

**禮品卡圖塊**
- 背景：插畫攝影填滿整張卡片（無純色背景）
- 圓角：與卡片相近（約 `12px`，邊角略緊）
- 陰影：比預設卡片更輕——這些卡片被視為放置於畫布上的實體卡片
- 以上方類別標籤分組（春季、感謝、生日、慶祝、母親節、感激、鼓勵、里程碑、隨時）

**Rewards 等級卡片（Rewards 頁面標誌元素）**
- 三欄格：Bronze / Gold / Silver-ish——每個均為深綠（`#1E3932`）面板，包含：
  - 帶色漸層 / 色彩標頭環
  - 帶編號的「Level」徽章
  - 以大字 SoDoSans 字重 600 呈現的等級標題
  - 白色 / 半透明白色文字的星星 / 權益清單
  - 底部「As you earn more stars…」進度說明文字

**合作夥伴卡片（Rewards）**
- 背景：`#faf6ee`（Gold Lightest）暖奶油底面
- 內容：合作夥伴 Logo（「SkyMiles」、「Bonvoy」）居中，下方附說明文字
- 圓角與陰影遵循預設卡片規格

**下拉選單（Account 下拉，頂部導航）**
- 背景：`#f9f9f9`（Neutral Cool）
- 選單項目：`24px / 字重 400`，Text Black
- 無邊框——僅以背景底面切換對比白色導航欄

**Modal**
- 內距：`2.4rem`（`--modalPadding`）
- 頂部內距：`8.8rem`（`--modalTopPadding`）——為關閉按鈕 / 標頭預留空間
- 上下內距合計：`11.2rem`
- 圓角繼承卡片規格（`12px`）

### 輸入框與表單

**浮動標籤輸入框**
- 標籤在聚焦 / 填寫後浮動至輸入框邊框上方
- 桌面標籤字體大小：預設 `1.9rem`，啟用時動畫至 `1.4rem`
- 行動裝置標籤字體大小：預設 `1.6rem`，啟用時動畫至 `1.3rem`
- 標籤水平偏移：距左 `12px`
- 啟用標籤位移：向上移至 `-12px`，Y 軸 `-50%` 位移
- 欄位內距：`12px`
- 表單水平內距：`1.6rem`
- 驗證：有效欄位獲得 `rgba(green-light, 0.33)` 色調；無效欄位獲得 `rgba(red, 0.05)` 色調
- 過渡：選取輸入框時使用 `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)`

**選項圖示（勾選框 / 單選框）**
- 內距：`3px`
- 使用上述勾選輸入框三次貝茲曲線動畫（略帶「彈跳」的 2.32 超量曲線）

### 導航

**全域導航列（頂部列）**
- 固定定位，漸進式高度：`64px` xs → `72px` 行動裝置 → `83px` 平板 → `99px` 桌面
- 陰影疊加：`0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — 三層柔和浮起效果
- 左側：Starbucks 文字 Logo，距左邊緣偏移 `99px`（md）/ `131px`（lg）
- 主要連結內嵌，使用 SoDoSans 字重 400–600：Menu · Rewards · Gift Cards
- 右側：Find a store 連結 + Sign in（外框型）+ Join now（黑色填充型）

**子導航列（第二列，例如 Rewards 內部）**
- 高度：`53px`（全域子導航）/ `48px`（內部子導航）
- 通常為全域導航欄下方的水平分頁群組

**行動裝置導航**
- 於平板斷點以下收合為漢堡抽屜選單
- Frap 浮動按鈕無論導航狀態如何，均固定於右下角

### 圖片處理

- **英雄攝影**：飲料照片（透明玻璃杯內的彩色飲料，背景有珊瑚色、鼠尾草色、暖琥珀色）佔分割英雄版面約 40vw；文字佔另外 60vw（`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`）
- **禮品卡插畫**：每張卡片為獨立插畫攝影作品（繪畫風格、手繪感、暖色調）。絕非通用生成圖形。
- **Rewards 儀式圖片**：手持 Starbucks Rewards App 螢幕的攝影作品，帶角度的構圖——產品情境攝影。
- **選單縮圖**：正方形或 4:3 商品攝影，乾淨的白色 / 奶油色背景，玻璃杯周圍有輕柔投影。
- **圖片淡入**：圖片載入時使用 `opacity 0.3s ease-in` 過渡（`--imageFadeTransition`）。

### 特色橫幅（深綠英雄橫幅）

全寬 `#1E3932`（House Green）橫幅，包含：
- 左側：白色標題 + 副標題 + CTA 列
- 右側：商品攝影或插畫
- 分割比例約 40/60 或 50/50，依區塊而定
- 全部使用白色文字，次要說明文字使用 `rgba(255,255,255,0.70)`
- CTA 遵循「綠底綠字反轉型」（白色填充）+ 「深色底面外框型」（白色外框）的配對方式

### 展開器 / 手風琴

- 持續時間：`300ms`（`--expanderDuration`）
- 時間曲線：`cubic-bezier(0.25, 0.46, 0.45, 0.94)` — 均衡的緩出效果
- 用於 Rewards 與禮品卡頁面的常見問題區塊

### Cookie 同意模組

頁面頂部的深綠 Modal 卡片，包含「同意」（綠色填充）與「管理偏好設定」（外框型）按鈕。首次訪問時出現，可關閉。

### 商品詳情元件（PDP 標誌元件群）

重複使用的元件群，用於選單商品頁面（例如飲料詳情的 `/menu/product/40498/iced`，或營養資訊的 `/menu/product/.../nutrition`）。這些元件擴充了元件庫，但不改動 token。

**尺寸選擇器**
- 水平排列的 4 個杯型圖示按鈕（Tall / Grande / Venti / Trenta）
- 每個項目：頂部為杯型輪廓圖示，下方為尺寸名稱（16/700，Starbucks Green），容量說明（13/400，Text Black Soft）
- 啟用狀態：選取的杯型圖示周圍有綠色圓圈外框（`2px solid #00754A`）
- 未選取：無外框，字體樣式相同
- 全寬列，等距排列
- 容器圓角：`12px` 或直角；個別圖示為 `50%` 圓形
- 內距：`16px 24px`

**加料 / 牛奶選擇（外框矩形）**
- 背景：`#ffffff`
- 邊框：`1px solid #d6dbde`（Input Border）
- 圓角：`4px`
- 欄位全寬
- 邊框上方浮動標籤：「Add-ins」/ 「Milk」/ 「Add-ins」——13/700，Text Black，大寫，`0.325px` 字元間距
- 值居中顯示（例如「Ice」、「Coconut」、「Strawberry Fruit Inclusions scoop」）：16/400，Text Black
- 右側：Text Black Soft 的向下箭頭圖示
- 聚焦：邊框切換為 Green Accent（`#00754A`）

**數字步進器**
- 內嵌於需要指定數量的加料列中（例如草莓果粒份數）
- `−` 減號按鈕 + 數量數字 + `+` 加號按鈕，全部內嵌於標籤右側
- 按鈕：`32×32px` 圓形，`1px solid #d6dbde` 邊框，中性灰色圖示
- 數量數字：16/700，Text Black，居中

**自訂按鈕**
- 背景：`#ffffff`
- 文字：`#00754A`（Green Accent）
- 邊框：`1.5px solid #00754A`
- 圓角：`50px`（全圓角膠囊）
- 內距：`14px 40px`（比預設膠囊大幅放大——這是次要主操作）
- 標籤：「Customize」，左側內嵌金色閃耀 ✨ 圖示
- 用於：選擇尺寸 / 牛奶後進入飲料自訂流程

**加入訂單按鈕（PDP）**
- 背景：`#00754A`（Green Accent）
- 文字：`#ffffff`
- 圓角：`50px`
- 內距：`14px 32px`
- 固定於商品卡片右上角，且 / 或在門市庫存橫幅內靠右對齊
- 與其他主要 CTA 相同的 `scale(0.95)` 啟用行為

**Rewards 費用膠囊——「200★ item」**
- 背景：透明
- 邊框：`1px solid #cba258`（Gold）
- 文字：`#cba258`（Gold）
- 圓角：`50px`（全圓角膠囊）
- 內距：`4px 12px`
- 內容：「200★ item」，其中 `★` 為小型填充星形字符——標示兌換此品項所需的 Rewards 星星數
- 字體：Proxima Nova 13/700，`0.5px` 字元間距
- 僅用於可用 Rewards 兌換的商品

**商品說明橫幅**
- 全寬深綠橫幅（`#1E3932`，House Green）
- 由上至下包含：
  1. Rewards 費用膠囊（金色，如適用）
  2. 白色商品說明正文（16/400/1.5）
  3. 內嵌營養摘要（「140 calories, 25g sugar, 2.5g fat」），附資訊圖示提示——14/700，白色
  4. 「Full nutrition & ingredients list」白色外框綠色底膠囊按鈕
- 垂直內距：`32px`
- 出現於主要商品標頭橫幅下方

**成分 / 營養資訊表格**
- 營養頁面採用兩欄版面
- 左欄：「Ingredients」標頭 + 清單，或「Not available for this item」占位文字區塊，附 14/400 Text Black Soft 說明段落
- 右欄：「Nutrition」標頭 + 標籤 / 數值列
- 每列：左側營養素標籤（Proxima Nova 14/400），右側數值（例如「140 calories」、「25g」、「205 mg**」），下方以 `1px solid #e7e7e7` 細線分隔
- 底部咖啡因 / 星號標記的腳注：13/400，Text Black Soft
- 符合營養標示法規的可重複使用表格模式

**門市庫存選擇器**
- 出現於尺寸選擇列上方的深綠特色橫幅
- 全寬圓角矩形，半透明白色內部
- 文字：「For item availability, choose a store」，白色，14/400
- 右側：向下箭頭 + 白色外框購物袋 SVG 圖示
- 圓角：`4px`
- 高度：約 48px

**PDP 麵包屑導航**
- 商品標題上方的「Menu / Refreshers / Pink Energy Drink」路徑
- 分隔符：Text Black Soft 的 `/` 斜線字符
- 當前頁面無連結，前方頁面為帶底線的 Green Accent 連結
- 字體：14/400，Proxima Nova
- 出現於所有 PDP 頁面

**返回箭頭連結（PDP 營養 / 詳情子頁面）**
- 營養頁面區段標題上方的「← Back」文字連結
- 文字：Green Accent（`#00754A`），14/700，Proxima Nova
- 左側箭頭 `<`，相同的綠色
- 深層子頁面的替代麵包屑導航

## 5. 版面原則

### 間距系統

以 rem 為基礎的語意化比例（錨定 `1rem = 10px`）：

| Token | Rem | 像素 | 典型用途 |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | 最緊湊的內嵌內距 |
| `--space-2` | `0.8rem` | 8px | 小間距，按鈕垂直內距 |
| `--space-3` | `1.6rem` | 16px | 預設——卡片內距，外側欄距 xs |
| `--space-4` | `2.4rem` | 24px | 區塊內部間距，外側欄距 md |
| `--space-5` | `3.2rem` | 32px | 主要區塊間距 |
| `--space-6` | `4rem` | 40px | 大間距，外側欄距 lg，標頭容器 |
| `--space-7` | `4.8rem` | 48px | 區塊間距 |
| `--space-8` | `5.6rem` | 56px | 極大留白——Frap 高度 |
| `--space-9` | `6.4rem` | 64px | 最寬區塊內距 |

**欄距 token：**
- `--outerGutter: 1.6rem`（16px，預設 / 行動裝置）
- `--outerGutterMedium: 2.4rem`（24px，平板）
- `--outerGutterLarge: 4.0rem`（40px，桌面）

**通用節奏常數：** `1.6rem`（16px）出現於每個頁面，作為預設外側欄距、卡片內距基準，以及 body text-3 字體大小——是系統中最頻繁使用的間距單位。

### 格線與容器

- 欄寬比例：`--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- 禮品卡格線：響應式 3 至 5 欄，圖塊約 `343px`
- Rewards 等級區塊：`lg+` 斷點採 3 欄深綠面板
- 英雄：透過 `--headerCrateProportion` / `--contentCrateProportion` 實現 40%（圖片）/ 60%（內容）不對稱分割

### 留白哲學

留白傳遞「咖啡廳空間充裕」的感受。區塊內距偏寬鬆（40–64px）。內容區塊以留白分隔，而非分隔線。奶油色畫布（`#f2f0eb`）本身即是白色卡片與綠色特色橫幅之間的視覺呼吸空間。

### 邊框圓角比例

| 數值 | 用途 |
|-------|-----|
| `12px` | 卡片、Modal、選單品項圖塊（`--cardBorderRadius`） |
| `12px 12px 0 0` | 全寬回饋標籤（僅頂部圓角） |
| `50px` | 所有按鈕——全圓角膠囊（`--buttonBorderRadius`） |
| `50%` | 圓形圖示、Frap 浮動按鈕、大頭貼縮圖 |
| 特殊 | `3.3333%/5.298%` 橢圓形，用於 Starbucks Visa 卡模型（`--svcRoundedCorners`） |

## 6. 深度與層級

| 層級 | 處理方式 | 用途 |
|-------|-----------|-----|
| 卡片 | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | 預設內容卡片——極輕柔的雙層陰影 |
| 全域導航 | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | 固定頂部列的三層柔和浮起效果 |
| Frap 基底 | `0 0 6px rgba(0,0,0,0.24)` | 浮動圓形 CTA 周圍的基底光暈 |
| Frap 環境 | `0 8px 12px rgba(0,0,0,0.14)` | 疊加的方向性環境光——讓 Frap 向前浮起 |
| 禮品卡 | 插畫攝影周圍的輕投影 | 禮品卡圖塊的實體卡片感 |
| Starbucks Card（SVC） | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Starbucks 卡片視覺的疊加 SVG 投影 |

**陰影哲學：** 極輕柔、層疊於純色之上——系統從不使用單一厚重的投影。而是以 2–3 個低透明度陰影疊加，搭配不同偏移量，模擬真實世界的環境光與直射光。Frap 按鈕是任何頁面中層級最高的元素。

### 裝飾性深度

- **無漸層系統**——底面為純色色塊
- **色塊分帶**承載視覺深度感（深綠色帶讀起來像奶油色 / 白色主體區塊之間「凹陷的特色區域」）
- **Starbucks Card 視覺上的 SVG 濾鏡陰影**增添了些許立體實體感，不使用 box-shadow

## 7. 應該與不應該

### 應該
- 使用 Neutral Warm（`#f2f0eb`）或 Ceramic（`#edebe9`）作為頁面畫布，而非純白——溫暖奶油色是品牌標誌
- 將四階綠色對應至其預定的介面角色——Starbucks Green 用於標題，Green Accent 用於 CTA，House Green 用於深色橫幅，Uplift 用於裝飾
- 在整個系統中保持 SoDoSans 的緊縮字距 `-0.01em` / `-0.16px`
- 所有按鈕無例外地使用 50px 全圓角膠囊
- 套用 `transform: scale(0.95)` 作為通用按鈕啟用狀態
- 將金色保留給 Rewards 等級儀式場景
- SoDoSans 幾乎用於所有場景；僅在 Rewards 編輯標題切換 Lander Tall 襯線字體；Kalam 手寫字體保留給 Careers「杯名」場景
- 以 2–3 個低透明度陰影疊加，取代單一較重的投影
- 在所有購物介面上使用 Frap 圓形 CTA 作為持續浮動的訂單入口
- 讓奶油色畫布在內容卡片之間自然呼吸——使用留白而非分隔線

### 不應該
- 不使用純白作為頁面畫布——溫暖奶油色的色溫至關重要
- 不挑選「一個品牌綠」——四綠系統是刻意設計；到處使用 `#006241` 會削弱品牌層次感
- 不將金色作為通用強調色——它是 Rewards 的專屬信號
- 不將按鈕改成方角——50px 膠囊是通用規範
- 不引入漸層填充——系統全程使用色塊設計
- 不以尺寸區分 h1 與 h2 的對比——層級來自字重 + 色彩（600 Starbucks Green vs 400 Text Black）
- 不使用純黑色作為正文——`rgba(0,0,0,0.87)` 才能配合溫暖畫布的色溫
- 不省略按鈕的 `scale(0.95)` 啟用回饋——這是標誌性的微互動
- 不堆疊單一厚重陰影；務必疊加 2–3 個低透明度陰影
- 不在主要購物流程中引入襯線或手寫字體——它們分別屬於 Rewards 和 Careers 情境

## 8. 響應式行為

### 斷點

依元件寬度 token 與漸進式導航高度推斷：

| 名稱 | 寬度 | 主要變化 |
|------|-------|-------------|
| xs | < 480px | 全域導航 64px；漢堡選單；單欄版面；膠囊按鈕全寬 |
| 行動裝置 | 480–767px | 全域導航 72px；禮品卡格線 2 欄；卡片內距縮緊 |
| 平板 | 768–1023px | 全域導航 83px；禮品卡格線 3 欄；英雄分割開始出現 |
| 桌面 | 1024–1439px | 全域導航 99px；禮品卡格線 4 欄；完整 40/60 不對稱英雄 |
| 超大螢幕 | 1440px+ | 內容上限至 `--columnWidthXLarge`；禮品卡格線 5 欄；額外奶油色邊距 |

### 觸控目標

- 膠囊按鈕以 `7px 16px` 內距計算高度約 32px——低於僅觸控介面的 WCAG AAA 44px 最低標準。行動裝置上按鈕內距可視覺上擴大以達到最低標準。
- Frap 浮動圓形按鈕 `56px`，遠超最低標準。
- Frap 使用 `--frapTouchOffset: calc(-1 * .8rem)` 將點擊區域延伸至視覺邊緣外 8px。
- 表單浮動標籤輸入框在行動裝置上字體尺寸較大（基底 1.6rem vs 桌面 1.9rem）——在手持距離下更易點擊與閱讀。

### 收合策略

- **全域導航高度漸進式調整**：64 → 72 → 83 → 99px 跨斷點，而非單一固定值
- **英雄分割收合**：40/60 不對稱分割 → 行動裝置堆疊（圖片在上，內容在下）
- **禮品卡格線**：5 欄 → 4 欄 → 3 欄 → 2 欄 → 1 欄，跨斷點調整卡片寬度
- **特色橫幅**：保持全寬，但行動裝置上文字與圖片垂直堆疊
- **外側欄距調整**：16px → 24px → 40px，隨視窗增大
- **Rewards 三欄等級面板**：行動裝置上堆疊為單欄

### 圖片行為

- 英雄商品攝影在行動裝置上垂直裁剪更緊湊；內容成為視覺主軸
- 禮品卡插畫保持長寬比；卡片格線重新排列
- 圖片載入時使用 `opacity 0.3s ease-in` 淡入過渡（防止突兀的閃現）
- Rewards 手持 App 攝影等比例縮放，絕不拉伸

## 9. Agent 提示指南

### 快速色彩參考

- 主要 CTA：「Green Accent（`#00754A`）」
- 主要 CTA 文字：「White（`#ffffff`）」
- 品牌標題：「Starbucks Green（`#006241`）」
- 特色橫幅 / 頁尾：「House Green（`#1E3932`）」
- 頁面畫布：「Neutral Warm（`#f2f0eb`）」
- 卡片畫布：「White（`#ffffff`）」
- 淺色底面標題文字：「Text Black（`rgba(0,0,0,0.87)`）」
- 淺色底面正文：「Text Black Soft（`rgba(0,0,0,0.58)`）」
- 深綠底面正文：「Text White Soft（`rgba(255,255,255,0.70)`）」
- Rewards 強調色：「Gold（`#cba258`）」
- Rewards 文字：「Rewards Green（`#33433d`）」
- 危險 / 破壞性操作：「Red（`#c82014`）」

### 元件提示範例

1. 「建立一個主要 Starbucks CTA 膠囊按鈕，背景為 Green Accent（`#00754A`），白色文字『Explore our afternoon menu』，SoDoSans 字體，16px，字重 600，字元間距 `-0.01em`，`50px` 圓角（全圓角膠囊），`7px 16px` 內距。啟用狀態套用 `transform: scale(0.95)`，過渡使用 `0.2s ease`。」

2. 「設計一個內容卡片，背景為 White（`#ffffff`），`12px` 圓角，層疊陰影 `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`。內距 `16–24px`（`--space-3` 至 `--space-4`）。放置於 Neutral Warm（`#f2f0eb`）頁面畫布上，與兄弟元件間距 `16px`。」

3. 「建立 Frap 浮動圓形訂單按鈕——直徑 `56px`，Green Accent（`#00754A`）填充，白色購物袋圖示居中。層疊陰影：`0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`。固定定位於右下角，`-0.8rem` 觸控偏移。啟用狀態：環境陰影消退至 `0 8px 12px rgba(0,0,0,0)`，搭配 `scale(0.95)`。」

4. 「建立深綠特色橫幅——全寬區塊，House Green（`#1E3932`）背景。左欄：白色 SoDoSans h2，24px，字重 600，接著是 Text White Soft（`rgba(255,255,255,0.70)`）正文段落，以及包含兩個按鈕的 CTA 列（主要按鈕為白色填充搭配 Green Accent 文字，次要按鈕為深色底面外框型白色邊框）。右欄：商品攝影。分割比例 40/60，`768px` 以下垂直堆疊。」

5. 「建立 Rewards 等級卡片——House Green（`#1E3932`）面板，`12px` 圓角，頂部帶色漸層條（Bronze / Silver / Gold 等級）。標題使用 SoDoSans 24px，字重 600，白色。權益清單為白色項目符號，次要說明使用 `rgba(255,255,255,0.70)`。底部進度說明文字使用 Text White Soft。`lg+` 採 3 欄格線，行動裝置單欄。」

6. 「設計禮品卡圖塊——卡片圓角對應 `12px`，以插畫攝影（手繪水彩畫風格）填滿整個底面。細微投影讓它在奶油色畫布上呈現實體卡片感。以 SoDoSans 24px 字重 400 的類別標籤分組，顯示於格線上方（「Spring」、「Thank You」、「Birthday」）。」

7. 「建立 Starbucks 商品詳情標頭——House Green（`#1E3932`）橫幅，商品標題上方有麵包屑『Menu / Refreshers / Pink Energy Drink』，14/400 白色。商品標題使用 SoDoSans 32/700 大寫白色。商品照片居中於標題下方。照片下方：4 個尺寸選擇按鈕橫排——每個杯型圖示按鈕顯示垂直杯型輪廓，尺寸名稱（『Tall』/ 『Grande』/ 『Venti』/ 『Trenta』）16/700 白色，容量 13/400 Text White Soft。選取的尺寸杯型圖示以 `2px solid #00754A` 圓圈框選。」

8. 「建立 Starbucks 自訂流程——尺寸選擇器下方，3 個堆疊的外框矩形輸入列（白色背景，`1px solid #d6dbde` 邊框，`4px` 圓角）。每列在頂部邊框上方有浮動標籤（「Add-ins」、「Milk」、「Add-ins」），13/700 Text Black 大寫。值居中顯示（例如『Ice』、『Coconut』）。右側：Text Black Soft 的向下箭頭。份數列嵌入數字步進器（`−` `1` `+`，配備 `32px` 外框圓形按鈕）。三個欄位下方：外框綠色『Customize』膠囊按鈕搭配金色閃耀圖示，`50px` 圓角，`14px 40px` 內距。同一列搭配 Green Accent 填充的『Add to Order』膠囊按鈕。」

9. 「設計 Starbucks 商品說明橫幅——商品標頭下方的全寬 House Green（`#1E3932`）。頂部：金色外框『200★ item』Rewards 費用膠囊（`50px` 圓角，`4px 12px` 內距，金色 `#cba258` 邊框與文字）。下方：白色商品說明，16/400/1.5。白色內嵌營養摘要，14/700（『140 calories, 25g sugar, 2.5g fat』），附資訊圖示提示。白色外框綠底膠囊按鈕『Full nutrition &amp; ingredients list』。垂直內距 32px。」

10. 「建立 Starbucks 營養資訊表格——White 卡片內的兩欄版面。左欄：『Ingredients』標頭（24/400 Text Black），接著是成分清單，或『Not available for this item』占位段落，14/400 Text Black Soft。右欄：『Nutrition』標頭，接著是標籤 / 數值列（左側營養素名稱，右側數值），以 `1px solid #e7e7e7` 細線分隔。字體：標籤 14/400 Text Black，數值 14/700 Text Black 靠右對齊。底部星號標記腳注：13/400 Text Black Soft。」

### 迭代指南

使用此設計系統優化現有畫面時：
1. 每次專注於**一個元件**
2. 參照本文件中的具體色彩名稱與十六進位色碼
3. 在自然語言描述（「溫暖奶油色畫布」、「四階綠色系統」）旁提供精確數值
4. 始終保持 50px 膠囊 + `scale(0.95)` 啟用狀態
5. 確認綠色對應正確角色（Green Accent 用於 CTA，Starbucks Green 用於標題，House Green 用於橫幅）
6. 不引入漸層——系統全程使用色塊設計
7. 在整個系統中保持 SoDoSans 字距 `-0.01em` / `-0.16px`

### 已知缺口

- SoDoSans 為專屬字體，無法在 Google Fonts 取用——公開實作時，使用 Inter 或 Manrope 作為替代，並記錄此替換
- Lander Tall（Rewards 襯線字體）同樣為客製字型——替代方案：Iowan Old Style、Lora 或 Source Serif Pro
- 除少數已記錄的數值（`--duration: 0.4s`、`--iconTransition: all ease-out 0.2s`、`--expanderDuration: 300ms`）外，每個互動介面的具體動畫時間尚未完整記錄
- 表單錯誤狀態的完整樣式（紅色邊框粗細、圖示位置）在色調 token 中可見，但未詳盡提取
- Careers 頁面的特定元件（杯名卡片、搜尋單選格線）在 token 名稱中有所提及，但本次提取未涵蓋
- Starbucks Visa Card / Starbucks Card（SVC）的詳細模型規格由 `--svcRoundedCorners` 與 `--svcShadowFilter` token 暗示，但未完整記錄
