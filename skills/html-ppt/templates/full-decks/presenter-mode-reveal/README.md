# presenter-mode-reveal · 演讲者模式模板

一份专为**带逐字稿的技术分享**设计的 full-deck 模板。核心卖点是真正可用的**磁吸卡片式演讲者视图**：当前页 iframe 预览 + 下页 iframe 预览 + 大字号逐字稿 + 计时器，4 个卡片可任意拖拽/缩放，全部集成在 `runtime.js` 里，零依赖。

## 使用场景

- 技术分享 / tech talk（30-60 min）
- 产品发布会主讲
- 课程讲授
- 任何**需要照着讲、但不能念稿**的正式演讲

## 快速开始

```bash
cp -r templates/full-decks/presenter-mode-reveal examples/my-talk
open examples/my-talk/index.html
```

## 键盘操作

| 键 | 动作 |
|---|---|
| `S` | 打开演讲者窗口（弹出新窗口，原页面不动） |
| `T` | 切换主题（5 种预设） |
| `←` `→` | 翻页 |
| `Space` / `PgDn` | 下一页 |
| `F` | 全屏 |
| `O` | 总览缩略图 |
| `R` | 重置计时器（仅演讲者视图下） |
| `Esc` | 关闭所有浮层 |

## 主题切换

模板预设了 5 个适配演讲场景的主题，在 `<html data-themes="...">` 属性里：

```html
<html lang="zh-CN" data-themes="tokyo-night,dracula,catppuccin-mocha,nord,corporate-clean">
```

按 `T` 循环切换。可以改成任何 `assets/themes/*.css` 里的主题。

## 写逐字稿的规范

**每一页的 `<aside class="notes">` 里写 150–300 字**。三条铁律：

1. **不是讲稿，是提示信号** — 核心点加粗、过渡句成段、数据列清楚
2. **150–300 字/页** — 按 2–3 分钟/页的节奏
3. **用口语写** — "因此" → "所以"；"该方案" → "这个方案"；读一遍不拗口才对

示例：
```html
<aside class="notes">
  <p>大家好，今天跟大家聊一个 <strong>很多人忽略的问题</strong>——...</p>
  <p>我先抛一个观点：<em>做 PPT 和讲 PPT 是两件事</em>。</p>
  <p>接下来我会用 3 个例子证明这个观点...</p>
</aside>
```

支持的 inline 标签：
- `<strong>` — 高亮（橘色）
- `<em>` — 斜体强调（蓝色）
- `<code>` — 等宽字体
- `<p>` — 分段（推荐每段讲 30-60 秒的内容）

## 文件结构

```
presenter-mode-reveal/
├── index.html       # 6 张示例 slide，每页都有完整逐字稿
├── style.css        # scoped .tpl-presenter-mode-reveal 样式
└── README.md        # 本文件
```

## 修改 / 扩展

- **加页**：复制任意 `<section class="slide">` 块，改内容和 `<aside class="notes">`
- **换主题**：改 `data-themes` 列表，或直接改 `<link id="theme-link" href="...">`
- **改样式**：只动 `style.css`，不要碰根目录的 `assets/base.css`
- **加动效**：在元素上加 `data-anim="fade-up"` 等（参考 `references/animations.md`）

## 演讲者窗口的 4 个卡片

按 `S` 后弹出的窗口里有：

- 🔵 **CURRENT** — 当前页 iframe 预览（加载 `?preview=N` 模式，像素级完美，与观众端同 CSS/主题/字体）
- 🟣 **NEXT** — 下一页预览，帮助准备过渡
- 🟠 **SPEAKER SCRIPT** — 大字号逐字稿，可滚动
- 🟢 **TIMER** — 经过时间 + 页码 + Prev/Next/Reset 按钮

卡片操作：
- **拖卡片头**（彩色圆点 + 标题的顶部条）→ 移动卡片
- **拖卡片右下角** → 调整大小
- 位置 + 尺寸自动存 localStorage，下次打开恢复
- 底部 "重置布局" 按钮可恢复默认卡片排列

翻页丝滑：iframe 只加载一次，后续翻页通过 `postMessage` 切换内部 slide，**不重新加载不闪烁**。两窗口通过 `BroadcastChannel` 双向同步。

## 注意事项

- **观众永远看不到 `.notes` 内容** — CSS 默认 `display:none`，只在演讲者视图里可见
- **别把只给自己看的话写在 slide 本体上** — 所有提词必须在 `<aside class="notes">` 里
- **双屏演讲**：打开 `index.html` 按 S 弹出演讲者窗口，把观众窗口拖到投影/外接屏 F 全屏，演讲者窗口留在自己屏幕
