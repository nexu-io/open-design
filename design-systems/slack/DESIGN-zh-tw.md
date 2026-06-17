# 受 Slack 啟發的設計系統

> Category: 生產力與 SaaS
> 職場通訊平台。以深茄紫為主色，多色調 Logo 調色板，明亮介面搭配深色側邊欄，溫暖而親切。

## 1. 視覺主題與氛圍

Slack 的品牌形象建立在「工作也可以充滿人情味，甚至有點趣味」的理念之上。標準介面是**明亮**的——白色內容區搭配深茄紫（`#4A154B`）側邊欄——與深色優先工具形成反差。這種對比是刻意為之：側邊欄是沉穩、始終存在的導航錨點，而內容區則明亮開闊。

Logo 調色板——藍、綠、黃、紅——主要出現在井號圖示和行銷場景中，而非散落於整個 UI。在產品本身中，Slack 使用克制、專業的配色系統，以茄紫色作為唯一的品牌錨點。

**核心特徵：**
- 明亮優先的內容介面：白色 `#FFFFFF` 與近白色 `#F8F8F8`
- 深茄紫 `#4A154B` 側邊欄——品牌最具辨識度的 UI 元素
- 四種 Logo 強調色（藍、綠、黃、紅）僅少量用作高亮
- 標題使用 Larsseit（行銷場景），UI 使用系統無襯線字體
- 圓潤但不卡通：大多數元件圓角為 4–8px
- 緊湊而透氣：訊息行緊密，討論串層級清晰
- 溫暖對話的語調——表情符號、回應和插圖是一等公民

---

## 2. 色彩規範與用途

### 品牌主色
| 變數 | Hex | 用途 |
|---|---|---|
| `--color-aubergine` | `#4A154B` | 側邊欄背景，品牌主色 |
| `--color-aubergine-dark` | `#350d36` | 茄紫介面上的懸停狀態 |
| `--color-aubergine-light` | `#611f69` | 側邊欄活躍項高亮 |

### Logo 強調色（少量使用——僅用於高亮、圖示、行銷）
| 變數 | Hex | 名稱 | 用途 |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | 天藍 | 頻道圖示、連結、資訊狀態 |
| `--color-green` | `#2EB67D` | 青綠 | 線上狀態、成功狀態 |
| `--color-yellow` | `#ECB22E` | 金黃 | 離開狀態、警告、高亮 |
| `--color-red` | `#E01E5A` | 寶石紅 | 通知、錯誤、提及徽章 |

### 介面背景色
| 變數 | Hex | 用途 |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | 主訊息區、彈窗 |
| `--bg-secondary` | `#F8F8F8` | 討論串面板、次級介面 |
| `--bg-tertiary` | `#F1F1F1` | 輸入框背景、懸停狀態 |
| `--bg-sidebar` | `#4A154B` | 左側邊欄（茄紫色） |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | 側邊欄項懸停 |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | 活躍側邊欄項 |
| `--bg-message-hover` | `#F8F8F8` | 訊息行懸停 |

### 文字顏色
| 變數 | Hex | 用途 |
|---|---|---|
| `--text-primary` | `#1D1C1D` | 主要正文（近黑色） |
| `--text-secondary` | `#616061` | 時間戳記、靜音標籤 |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | 側邊欄頻道名稱 |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | 側邊欄未啟用項 |
| `--text-link` | `#1264A3` | 訊息內聯連結 |
| `--text-mention` | `#1264A3` | @提及文字顏色 |

### 語意色
| 變數 | Hex | 用途 |
|---|---|---|
| `--color-success` | `#2EB67D` | 成功提示、積極狀態 |
| `--color-warning` | `#ECB22E` | 警告狀態 |
| `--color-danger` | `#E01E5A` | 錯誤狀態、破壞性操作 |
| `--color-info` | `#36C5F0` | 資訊性高亮 |

### 邊框與分隔線
| 變數 | Hex | 用途 |
|---|---|---|
| `--border-default` | `#DDDDDD` | 標準分隔線、卡片邊框 |
| `--border-subtle` | `#F1F1F1` | 行間細微分隔線 |
| `--border-focus` | `#1264A3` | 焦點環顏色 |

---

## 3. 字體排版規則

### 字體
| 用途 | 官方字體 | 網頁後備 |
|---|---|---|
| 展示 / 行銷標題 | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / 正文 / 框架 | Slack Lato（定製） | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| 程式碼 / 等寬 | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack 行銷標題使用 **Larsseit**，產品內 UI 使用定製版 Lato。網頁使用時，`system-ui` 是最安全的後備方案。

### 字號層級

| 層級 | 大小 | 字重 | 行高 | 字間距 | 用途 |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | 行銷主視覺標題 |
| Display L | 36px | 700 | 1.15 | -0.5px | 區塊主視覺 |
| Heading 1 | 28px | 700 | 1.25 | normal | 彈窗標題、頁面標題 |
| Heading 2 | 22px | 700 | 1.3 | normal | 卡片標題、設定區塊 |
| Heading 3 | 18px | 700 | 1.35 | normal | 子區塊標題 |
| Body L | 16px | 400 | 1.5 | normal | 訊息文字、說明 |
| Body | 15px | 400 | 1.46667 | normal | 預設 UI 文字（Slack 基礎字號） |
| Body SM | 13px | 400 | 1.38462 | normal | 次要元資料 |
| Caption | 12px | 400 | 1.33 | normal | 時間戳記、提示 |
| Code | 12px | 400 | 1.5 | normal | 行內程式碼、程式碼區塊 |

### 排版規則
- Slack 基礎正文字號為 **15px**——比 16px 略小，以提高密度
- 未讀頻道：字重 700——粗體是主要的未讀指示器
- 時間戳記：12px `--text-secondary`，僅懸停時顯示
- 程式碼區塊：背景 `#F8F8F8`，邊框 `1px solid #DDDDDD`，圓角 4px
- 不使用 12px 以下的字號
- 行銷標題：大展示尺寸使用字間距 `-1px`

---

## 4. 元件樣式

### 按鈕

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### 輸入框
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### 側邊欄頻道項
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### 未讀徽章
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### 訊息附件 / 卡片
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### 回應
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. 版面原則

### 三欄版面
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### 間距系統（基礎單位 4px）
| 變數 | 數值 | 用途 |
|---|---|---|
| `--space-1` | 4px | 緊湊間隙 |
| `--space-2` | 8px | 元件內邊距 |
| `--space-3` | 12px | 輸入框內邊距 |
| `--space-4` | 16px | 標準內邊距 |
| `--space-6` | 24px | 卡片內邊距 |
| `--space-8` | 32px | 區塊間距 |

### 側邊欄結構
```
[工作區名稱 ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### 訊息編輯器
- 固定在訊息區底部
- `border: 1px solid #DDDDDD`，`border-radius: 8px`，`margin: 0 16px 16px`
- 工具列：表情符號、附件、格式化、傳送按鈕

---

## 6. 深度與層級

Slack 在明亮介面上使用輕柔陰影：

| 層級 | 用途 | 陰影 |
|---|---|---|
| 扁平 | 訊息行、側邊欄項 | none |
| 低 | 卡片、輸入框 | `0 1px 3px rgba(0,0,0,0.08)` |
| 中 | 下拉選單、彈出層 | `0 4px 12px rgba(0,0,0,0.12)` |
| 高 | 強制回應視窗、對話框 | `0 8px 24px rgba(0,0,0,0.15)` |
| 遮罩 | 強制回應背景遮罩 | `rgba(0,0,0,0.5)` |

---

## 7. 應該與不應該

### ✅ 應該
- 側邊欄使用茄紫色 `#4A154B`——這是 Slack 最標誌性的 UI 元素
- 保持主內容區白色和明亮
- 所有正文使用 `#1D1C1D`（近黑色），而非純黑
- 用粗體頻道名稱表示未讀狀態——字重是指示器
- 四種強調色僅用於語意角色（成功、警告、危險、資訊）
- 訊息附件和嵌入內容使用 `border-left: 4px`
- 僅在懸停時顯示時間戳記
- 連結和焦點狀態使用 `#1264A3`
- 側邊欄項保持緊湊：高度 28px，圓角 6px

### ❌ 不應該
- 不要使用深色主內容區——Slack 是明亮優先的
- 不要將藍/綠/黃/紅作為裝飾性強調色散落各處
- 不要使用純黑 `#000000` 作為文字顏色
- 不要使用氣泡——訊息是扁平行
- 不要將按鈕做成大圓角——4px 是標準
- 不要永久顯示時間戳記
- 不要將頻道名稱全大寫
- 不要使用 12px 以下的字號

---

## 8. 響應式行為

### 斷點
| 斷點 | 寬度 | 版面 |
|---|---|---|
| 行動裝置 | < 768px | 單面板，側邊欄作為左抽屜 |
| 平板 | 768–1024px | 側邊欄 + 僅訊息區 |
| 桌機 | > 1024px | 完整三欄版面 |

### 行動端適配
- 側邊欄：左抽屜，向右滑動開啟
- 底部標籤列：首頁、私訊、動態、我
- 討論串面板：全螢幕覆蓋層
- 編輯器：固定在鍵盤上方
- 頻道清單項：44px 觸控目標高度
- 行動端保留茄紫色頂部標題列

---

## 9. Agent 提示指南

產生 Slack 風格設計時，遵循以下方法：

**顏色應用：**
> 將 `background: #FFFFFF` 設為主畫布。側邊欄使用 `#4A154B`（茄紫色）。所有主要文字使用 `#1D1C1D`。連結和焦點環使用 `#1264A3`。四種 Logo 顏色——`#36C5F0`、`#2EB67D`、`#ECB22E`、`#E01E5A`——僅作語意用途：資訊、成功、警告、危險。

**排版：**
> 所有 UI 使用 `system-ui, -apple-system, sans-serif`。基礎字號為 15px。未讀頻道：字重 700。正文：字重 400。時間戳記：12px `#616061`，僅懸停顯示。程式碼：`Monaco, Menlo, monospace`，12px，背景 `#F8F8F8`。

**版面：**
> 三欄：240px 茄紫色側邊欄 + 彈性白色訊息區 + 可選 400px 討論串面板。側邊欄項：高度 28px，圓角 6px，未讀時加粗。編輯器：固定底部，`border: 1px solid #DDDDDD`，`border-radius: 8px`。

**元件：**
> 按鈕：圓角 4px，高度 36px，茄紫色主按鈕。輸入框：`1px solid #DDDDDD` 邊框，`#1264A3` 焦點環。訊息行：扁平，無氣泡，36px 圓形頭像。回應：膠囊形 `border: 1px solid #DDDDDD`，`border-radius: 24px`。

**語調：**
> Slack 是溫暖、專業且充滿人情味的。空狀態使用友善插圖。行動呼籲直接明確：「Send message」、「Get started」。錯誤訊息清晰且有幫助。絕不令人感到警覺。

**需要避免的反模式：**
> 不要深色內容區。不要氣泡。不要純黑文字。不要散落的多色強調。不要全大寫頻道名稱。不要低於 12px 的字號。不要大圓角按鈕。
