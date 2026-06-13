# 我读完 @trq212 那条推之后, 把所有 markdown 都换成了 HTML

> 灵感原文: https://x.com/trq212/status/2052809885763747935
>
> 简而言之: 在 AI 写作 / 编辑器 / 代理时代, markdown 这个"中间态"已经撑不住了 —— HTML 才是面向读者的最终形态。

## 让我点头的三个观察

第一, 我们对 markdown 的爱, 主要是写起来爽。但读者从来没投过票。
读者拿到的永远是某个 markdown 渲染器吐出来的结果 —— 而那个渲染器属于平台, 不属于你。

第二, 截图发推这件事, markdown 输了。
随便挑一段 markdown, 截图发出去都是被 GitHub 默认主题压扁的灰白方块。HTML 可以是壁纸级图片。

第三, 公众号 / 知乎 / 小红书 / Notion / 飞书 —— 每一家解释 markdown 的方式都不一样。
你写一份, 5 个平台得调 5 次。HTML + 内联 CSS, 一次粘贴, 任何平台都还原。

## 但 HTML 太啰嗦, 这是真的

`<div class="...">` 写多了想吐, 这是事实。
之前没人愿意花成本写 HTML, 因为同样的内容, markdown 30 秒, HTML 30 分钟。

变量是 —— **AI 把这 30 分钟降到 30 秒了**。
你写 markdown, AI 把它升级成可交付的 HTML。你管最终形态, AI 管啰嗦细节。

## 我们顺手做了一个工具

灵感来自原推, 加上 Claude Code 团队的实践, 我们做了 [HTML Anything](https://github.com/your-org/html-anything)。
左侧贴 markdown / CSV / JSON, 选一个模板 (杂志、PPT、海报、小红书、数据报告 …), 按 ⌘+Enter ——
本地的 Claude / Cursor / Codex 在你**已经登录**的 session 里跑, 几秒后右侧就是一份可以直接复制到公众号 / 推特 / 知乎的 HTML。

不需要 API Key, 不浪费 token (二次编辑只跑 diff)。

## 结论

如果你也觉得 "markdown → 编辑器手动重排" 这件事浪费了你的人生 —— 看一眼原推, 看一眼 Claude Code 团队的迁移, 然后试试任何一个能把 markdown 自动升格为 HTML 的工具。

> 题图致敬: 推文中那个 "everything is HTML" 的瞬间。
