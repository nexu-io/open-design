# 受 GitHub 啟發的設計系統

> Category: 開發者工具
> 以程式碼為核心的平台。功能密度高，藍白配色精準，基於 Primer 規範。

## 1. 視覺主題與氛圍

GitHub 的介面是工程化的，而非裝飾性的。每一個像素都在傳達一種立場：這是一款為在乎 diff、建置和 pull request 的人而生的工具。頁面背景是乾淨的 `#ffffff`（淺色模式）或 `#0d1117`（深色模式），內容排布在密集的矩形面板上，面板之間以細線邊框分隔，而非留白。資訊密度即品牌——列表列、程式碼行、儲存庫標題和通知卡片緊密排列，讓有經驗的使用者無需捲動即可瀏覽上百筆內容。

標誌性的強調色是用於連結和主要操作的 **Primer 藍** (`#0969da`)，以及用於合併狀態、成功提示和合併按鈕的 **GitHub 綠** (`#1a7f37`)。與消費品的藍綠色相比，兩者都略顯低調——飽和度足以在密集的灰色文字中清晰可辨，又克制到足以在同一視口中出現多次時不顯突兀。

排版使用覆蓋整個產品的 **system-ui** 字體堆疊，確保文字在所有作業系統上清晰渲染，搭配 **SFMono / Menlo / Consolas** 用於程式碼。沒有編輯類展示字體；GitHub 的聲音就是你正在使用的系統本身的聲音。

**關鍵特徵：**
- 純白畫布（`#ffffff`）或深海軍藍黑（`#0d1117`）——無暖調，無色調傾向
- 細線灰色邊框（`#d0d7de`）定義每個面板
- Primer 藍（`#0969da`）用於連結/主要操作；GitHub 綠（`#1a7f37`）用於成功/合併
- system-ui 用於正文；SFMono 用於程式碼——無自訂字體
- 內邊距極小的密集列表列；留白稀少
- 16px / 24px 的 Octicon 圖示——單描邊、幾何形態、風格統一
- 具有強色彩語義的膠囊狀狀態徽章

## 2. 色彩調色板與角色

### 主色
- **Canvas Default**（`#ffffff`）：淺色主題主頁面背景。
- **Canvas Subtle**（`#f6f8fa`）：次級表面、側邊欄、輸入框背景、頂欄區域。
- **Canvas Inset**（`#eaeef2`）：程式碼區塊背景、深內嵌表面。
- **Fg Default**（`#1f2328`）：主文字、標題、正文。
- **Fg Muted**（`#656d76`）：次級文字、說明文字、檔案路徑。

### 品牌強調色
- **Primer Blue**（`#0969da`）：連結、主要 CTA、焦點圓環基色——通用互動色。
- **Primer Blue Hover**（`#0550ae`）：主藍色的懸停/按下狀態。
- **Accent Subtle**（`#ddf4ff`）：用於標注、資訊橫幅的柔和藍色表面。

### 語義色
- **Success / Merge Green**（`#1a7f37`）：已合併 PR、成功徽章、合併按鈕。
- **Success Subtle**（`#dafbe1`）：成功狀態的表面色調。
- **Open Green**（`#1a7f37`）：Issue/PR 的「Open」狀態。
- **Closed / Danger Red**（`#cf222e`）：已關閉 PR、破壞性操作、驗證錯誤。
- **Danger Subtle**（`#ffebe9`）：錯誤橫幅表面。
- **Attention / Warning Yellow**（`#9a6700`）：琥珀色表面上的警告文字。
- **Attention Subtle**（`#fff8c5`）：警告橫幅表面。
- **Done Purple**（`#8250df`）：已合併並封存、「done」狀態、進階徽章。
- **Sponsor Pink**（`#bf3989`）：贊助愛心圖示、GitHub Sponsors 品牌色。

### 邊框與分隔線
- **Border Default**（`#d0d7de`）：標準細線邊框、面板輪廓。
- **Border Muted**（`#d8dee4`）：面板內部分隔線。
- **Border Subtle**（`#eaeef2`）：隱約的表格列分隔線。

### 深色主題
- **Dark Canvas**（`#0d1117`）：深色頁面背景。
- **Dark Surface**（`#161b22`）：側邊欄、頂欄、次級表面。
- **Dark Border**（`#30363d`）：標準深色模式邊框。
- **Dark Fg**（`#e6edf3`）：深色背景上的主文字。

## 3. 排版規則

### 字體系列
- **正文 / UI**：`-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **程式碼 / 等寬**：`ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**：`"Apple Color Emoji", "Segoe UI Emoji"`

### 層級

| 角色 | 字體 | 字號 | 字重 | 行高 | 字距 | 備註 |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | 儲存庫標題、行銷首屏 |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | 頁面標題 |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | 區域標題 |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | 子區域、面板標題 |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | 預設文字尺寸——非 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | 說明文字、檔案中繼資料 |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | 程式碼區塊、diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | 行內 `code` 段 |

### 原則
- **正文 14px，非 16px**：GitHub 的文字密度是其標識。產品以 14px 閱讀，以便在視口中容納更多列。
- **字重二元化**：預設全部 400；標題和強調用 600。無 500，無 700。
- **始終使用系統字體**：絕不為介面載入網路字體——文字必須在慢速網路下即時渲染。

## 4. 元件樣式

### 按鈕

**主要按鈕（綠色）**
- Background: `#1f883d`
- Text: `#ffffff`
- Border: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- 用途：「Create repository」、「Merge pull request」

**預設按鈕**
- Background: `#f6f8fa`
- Text: `#1f2328`
- Border: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`，border `#d0d7de`

**輪廓按鈕（藍色連結風格）**
- Background: `#ffffff`
- Text: `#0969da`
- Border: 1px solid `#d0d7de`
- Hover: background `#0969da`，text `#ffffff`

**危險按鈕**
- Background: `#ffffff`
- Text: `#cf222e`
- Border: 1px solid `#d0d7de`
- Hover: background `#a40e26`，text `#ffffff`，border `#a40e26`

### 卡片 / 方塊
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px（標題）+ 16px（正文）
- 標題區有 `#f6f8fa` 底色帶下邊框。

### 輸入框
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Focus: border `#0969da`，ring `0 0 0 3px rgba(9,105,218,0.3)`

### 狀態徽章（Issue / PR）
- **Open**：background `#1a7f37`，文字白色，padding 4px 10px，radius 9999px。
- **Closed**：background `#cf222e`，文字白色。
- **Merged**：background `#8250df`，文字白色。
- **Draft**：background `#6e7781`，文字白色。

### 標籤（Issue/PR 上的標籤）
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- 背景色和文字顏色由程式計算（標籤顏色→文字顏色按對比度計算）。

## 5. 間距與佈局

- **基礎單位**：4px。間距比例：4, 8, 12, 16, 24, 32, 40, 48。
- **頁面最大寬度**：1280px（`Container-xl`）。
- **側邊欄**：桌面端 296px，低於 1012px 時折疊。
- **列內邊距**：水平 16px，垂直 12px（列表天生密集）。

## 6. 動效

- **時長**：懸停 80ms；選單/彈出層展開 200ms。
- **緩動**：展開用 `ease-out`，關閉用 `ease-in`。
- **刻意迴避**：頁面載入動畫、視差效果、持續的微互動。元素直接出現，不表演。

## 7. 使用護欄

- 密集列表、帶邊框的方塊和系統字體需搭配使用；單獨使用綠色按鈕不足以營造 GitHub 風格的產品介面。
- 綠色用於建設性儲存庫操作，藍色用於連結和焦點，紅色/紫色/灰色僅用於 Issue、PR 和工作流狀態。
- 優先選擇低調的介面裝飾、明確的邊框和緊湊的間距，而非裝飾性陰影或大型行銷風格卡片。
