# ChatPanel「产出收尾」族差异清单(OPEND-2198)

> **范围**:组件 13(总结文案)/ 14(产物卡片)/ 15(反馈 · 复制 · Fork)/ 16(下一步引导)/ 24(音频产物),
> 对应 84 格里的**第 28–44 格**(共 17 格)。
>
> **权威源**:`docs/design/chat-panel-next.html`(wangchenglong 交付稿,PR #7170 head `1bbdce0b06`)。
> 实体用 `docs/design/chat-matrix/build-matrix.py` 的 `extract()` 现场抽,样式按选择器从同一份 `<style>` 里抽,
> 说明文字取自各组件的 `cmp-ops` 段。**没有一条差异是凭转述写的。**
>
> **规格总纲**:`specs/current/chat-panel-next.md`。与本族直接相关的既有决策:
> D28(产物卡动作)· D37(产物卡生成中占位)· D38(轮末顺序)· D39(发布补图标)· D43(done 分界)· B19 · S5 · S14。
>
> **本文只做盘点**,不含实现、不含代码改动。

---

## 0. 一句话结论

这一族**不是从零写**,但也**不是"照着改样式"**:

| 组件 | 产品里有没有 | 对齐的性质 |
|---|---|---|
| 13 总结文案 | 有(消息层 markdown) | 样式几乎已对;差的是**流式表现**和 `<done/>` 分界的**数据侧** |
| 14 产物卡片 | 有"本轮产出的文件"**文本行列表**,**没有任何带缩略图的卡** | **形态级重写**;但缩略图、发布、导出三条链路产品里全都有,是搬位置不是造能力 |
| 15 反馈行 | 有,且相当完整(赞踩 / 原因面板 / 复制 / Fork / Tooltip / 埋点) | 大部分是**样式 + 文案 + 排布**;只有「Fork 原地落分界」和「中断轮不给赞踩」是形态 |
| 16 下一步引导 | 有 `NextStepActions`,但**渲染的是固定工具目录,不是本轮内容的建议** | **数据侧真的没有**——这一族唯一一处"缺数据" |
| 24 音频产物 | **完全没有**(产出的 mp3 只会变成产出文件列表里的一行) | **全新组件**;时长可客户端读,波形没有数据源 |

---

## 1. 现有实现落点

### 1.1 汇总表

| 组件 | 现在谁在渲染 | 组件名 | 能否独立挂载 | 样式在哪 | 类名形式 |
|---|---|---|---|---|---|
| 13 总结文案 | `apps/web/src/components/AssistantMessage.tsx:2633` | `ProseBlocks` 内的 `.prose-block` + `renderMarkdown` | **不能**(`ProseBlocks` 未导出);但 `renderMarkdown` 是 `apps/web/src/runtime/markdown.tsx:36` 导出的纯函数,可直接挂 | `apps/web/src/styles/viewer/code.css:998`(流式光标)+ 全局 prose 规则 | 全局类名 |
| 14 产物卡片 | `apps/web/src/components/FileOpsSummary.tsx:50`(有 write/edit 事件时)<br>`apps/web/src/components/AssistantMessage.tsx:2215` `ProducedFiles`(兜底) | `FileOpsSummary` / `ProducedFiles` | `FileOpsSummary` **能**(已导出,props = `entries` + 两个可选项)<br>`ProducedFiles` **不能**(未导出,且依赖 `useProjectCollabContext`) | `apps/web/src/styles/viewer/tools.css:58`(produced-files)、`:298`(file-ops);`apps/web/src/styles/viewer/routines.css:1993` 还有一层 `.app` 覆盖 | 全局类名 |
| 15 反馈 / 复制 / Fork | `apps/web/src/components/AssistantMessage.tsx:1617` `AssistantFooter`、`:1683` `AssistantForkButton`、`:1710` `AssistantMarkdownCopyButton`、`:1758` `AssistantFeedback` | 四个 | **全都不能**(四个都未导出);外层 `AssistantMessage` 已导出,47 个 props、只有 `message` / `streaming` 必填,但要让这一行长出来还得给 `onFeedback` / `onForkFromMessage` | `apps/web/src/styles/viewer/composio.css:3582`(completion-row / footer / dot)<br>`apps/web/src/styles/viewer/theater.css:298`(feedback / copy button / tooltip 兜底) | 全局类名 |
| 16 下一步引导 | `apps/web/src/components/NextStepActions.tsx:316` | `NextStepActions`(1081 行) | **能**(已导出,全部 props 可选) | `apps/web/src/components/NextStepActions.module.css`(405 行) | **CSS Module**(本族唯一已 Module 化的) |
| 24 音频产物 | **没有实现** | — | — | — | — |

### 1.2 逐个补充

**13 · 总结文案**
消息正文分段发生在 `ProseBlocks`:先按 `<question-form>` 切,再按 `<od-card>` 切,再按 `<system-reminder>` 切,
剩下的文本交给 `renderMarkdown`。流式时外层挂 `data-stream-cursor="true"`,由 `code.css:998` 给最后一个块元素
加一枚 `::after` 闪烁光标。**产品里组件 4(开始执行文案)和组件 13(总结)是同一段 markdown,没有任何区分。**
按 D43,两者的分界是正文里的 `<done/>` 自闭合标记 —— `apps/web/src/runtime/chat/build-turn-blocks.ts:52`
的 `DONE_RE` / `IMPLICIT_DONE_RE` 已经把解析写好了,但**全仓 `apps/daemon/src/prompts/` 与
`packages/contracts/src/prompts/` 里没有任何 `<done` 字样** —— 线上没有任何 agent 会发这个标记。

**14 · 产物卡片**
产品有**两套**"本轮产出"面板,互斥渲染(`AssistantMessage.tsx:1004` 的注释记着这条:两个面板同屏是 P0,
飞书 `recvqaerXd82bE` / issue #5909):
- `FileOpsSummary` —— 一个框 + 头行「本轮产出的文件 · 新建 N · 改写 M」+ 每行 `[write/edit 徽标][路径 code][>]`,4 行以上折叠。
- `ProducedFiles` —— 「本轮产出的文件」标签 + 每行 `[kind 图标][文件名][体积][打开][下载]`。

**两套都是纯文本行,一张缩略图都没有。**
但缩略图能力产品是有的:`apps/web/src/components/project-cover.tsx`(选封面 + 出 URL)、
`DesignsTab.tsx:849` 的 `thumb-iframe`(HTML 用 iframe 直接渲染真页面当缩略图)、
`apps/web/src/components/html-thumbnail-source-cache.ts`(HTML 源缓存)。
产物判据也已就位:`apps/web/src/runtime/chat/format.ts:43` 的 `artifactKind()` / `isArtifactPath()`;
事件源有 `packages/contracts/src/sse/chat.ts:90` 的 `end.artifactPaths` 和 `live_artifact` 事件
(W12 明确要求走这两个,不要抄模拟器的后缀推断)。
"发布 / 导出"两条链路也都在:`apps/web/src/components/ProjectView.tsx:9931` `handleArtifactShare`、
`:9940` `handleArtifactDownload`,现在挂在 `NextStepActions` 的三级 flyout「更多 → 分享 → 分享 / 下载」里。

**15 · 反馈 / 复制 / Fork**
`AssistantFeedback` 把 `AssistantFooter` 包在里面并注入 `feedbackControls`,所以真实 DOM 顺序是
`[圆点][状态词] │ [复制][Fork][赞][踩]`,状态与动作之间由 `theater.css:323` 的 `border-left` 分隔。
反馈原因面板 `.assistant-feedback-reasons` 是**赞和踩都会弹**,勾了「其他」才出 textarea。
埋点非常密(6 个 PostHog 事件 + `requestId` 串起 click→result),**这部分不能在对齐样式时被削掉**。
Fork 的真实行为在 `ProjectView.tsx:9351` `handleForkFromMessage`:创建带 `forkAfterMessageId` 的新会话
(服务端 `apps/daemon/src/routes/project/conversations.ts:96` 会把前序消息复制过去)→ `setMessages([])`
→ 切 `activeConversationId` → `navigate(replace)`。**原地什么都不留。**

**16 · 下一步引导**
`NextStepActions` 渲染的是**固定目录**,按 `variant` 分支:设计工具箱精选动作 / 品牌动作 / plan 动作 /
项目未完成动作,再加一枚「更多」开三级 flyout(工具箱搜索、创建设计系统、分享、下载、投稿社区)。
每行是 `[icon][标题][chevron-right]` 的**胶囊按钮**(`.module.css:136`,带 1px 边框和 `--bg-panel` 底),
hover 还会 portal 出一张 detail 说明卡。
点击行为:`ChatPane.tsx:1130` `handleNextStepPromptAction` → `composerRef.setDraft(prompt)`
—— **填入输入框、不直接发送,和稿子一致**(这是本组件唯一对上的一条)。

**24 · 音频产物**
chat 面板里零实现。产品唯一的音频播放器是原生 `<audio controls>`,出现在
`apps/web/src/components/FileViewer.tsx:17849`、`DesignSystemAssetDropzone.tsx:394`、
`apps/web/src/components/plugin-details/PluginMediaDetail.tsx:164`。
纯函数已经先行:`apps/web/src/runtime/chat/format.ts:35` 的 `formatDuration()` 就是照组件 24 的写法做的
(分钟不补零、秒补两位)。

---

## 2. 逐格差异清单(第 28–44 格)

标注口径:
**[样式]** = 照着改就行(含文案)· **[形态]** = 结构或交互不同,工作量不是一个量级 · **[数据]** = 事件流/契约里没有这个信息。

---

### 第 28 格 · 13-1 总结文案 · 生成中 · 逐字流式

**稿子**:`<div class="say" data-reveal>` 一段纯文字。`.say { font-size: var(--t-body); line-height: var(--lh-body); color: var(--text-strong) }`。
CSS 注释写明:「它没有 hover 态,不用留一档给鼠标,直接给最深的一档」。
**流式期间没有任何视觉标记** —— 21:02 版把 `.caret` 整个删了(见 `chat/primitives/contract.ts` 里 W2 的注);
逐字化开由 `[data-reveal] .rv` 承担(W9:单字 0.4s、错开 0.01s、元素子节点整块算一个字、拉丁词不拆)。

**现状**:`.prose-block` 里 `renderMarkdown(text)`;流式时挂 `data-stream-cursor="true"`,
`styles/viewer/code.css:998` 给最后一个块元素加一枚闪烁 `::after` 光标。整段是重排式更新,没有逐字入场。

**差在哪**
1. **[样式]** 稿子没有流式光标,产品有。要删 `code.css:998` / `:1014` 那两条规则(或随 W9 一起换掉)。
2. **[形态]** 逐字化开未实现。W9 / W13 已经把两条实现硬约束写死了(不能靠渲染后 `textContent` 前缀比较判新字;每帧重画不能把还在化开的字拆掉重来),模拟器 `docs/design/chat-sim/player.js` 是参考实现。这不是加个 CSS 动画能了事的。
3. **[数据]** 「总结」这个身份本身依赖 `<done/>`(D43)。L0 已经能解析,但**没有任何 agent 会发** —— prompt 侧没落地。当前只能靠 D43 的两档兜底(清单全关 = done;整轮没发过 done 的,run 结束那一刻把最后一段叙述提出来当结论)。要真正成立,得改 system prompt(产品行为,不是 UI 改动)。
4. **[口径]** 产品里组件 4(第 15 格,开始执行文案)与组件 13 是同一段 markdown,渲染上零区分。按 D43,4 = done 之前的过程叙述(收进壳内),13 = done 之后的结论(留在壳外)。这条分界落地之前,28/29 两格在陈列页上只能标"当前不可区分"。

---

### 第 29 格 · 13-2 总结文案 · 结束 · 输出完成

**稿子**:和 28 格**同一个 DOM**,只是内容更长,含一处 `<b>12px</b>`。`.say b { font-weight: 600 }` ——
CSS 注释:「`.say b` 因此不再靠颜色加重(已经同色),改成只用字重」。
**结束态不追加任何标记**:不出勾、不出「已完成」、不换底 —— 收尾的宣告由第 34 格那一行负责。

**现状**:同 28 格,`<strong>` 走 markdown 默认。

**差在哪**
1. **[样式]** 段落色要落在 `--text-strong`(最深一档),`<b>` 只加字重、不改色。需要逐条核 prose 的现行取色。
2. 其余**零差异** —— 这一格真正的活全在第 28 格(光标 + 逐字 + done 分界)。

---

### 第 30 格 · 14-1 产物卡片 · 默认(卡面只有图,动作在右上角)

**稿子**
```
.arts  → display:grid; grid-template-columns: repeat(2,1fr); gap:8px       两张卡并排
.art   → 1px --border + --radius-lg 圆角 + --bg 白底;position:relative
         ★ 卡上不能有 overflow:hidden(会切掉 tooltip / 弹出菜单)
.thumb → aspect-ratio 16/10,满铺,自己圆自己的角(calc(var(--radius) - 1px)),overflow:hidden
.acts  → position:absolute; top:12px; inset-inline-end:12px; flex 靠右; gap:4px
按钮   → #353535 实底胶囊 + 白字 + --t-cap(12px)/600 + padding 2px 9px;hover → #202020
         「导出」内嵌 12px 圈内下箭头图标(margin-inline-start:-1px 吃掉 svg 自带留白)
```
说明文字要点:**卡面不写文件名、不摆工具条、没有「预览」、没有「⋯」**。
「这张卡上唯一要判断的是『这是不是我要的那一版』,而那件事只有缩略图回答得了」。
文件名去哪了 —— 「导出和发布之后拿到的仍是这个名字,它在右侧预览的标题栏里出现」。
动作放右上角而不是下缘的理由:「界面截图的下面那一截常常还是内容,按钮压上去正好糊住;右上角在任何一张界面截图里都是最空的一块」。

**现状**:`FileOpsSummary` / `ProducedFiles` 两套**纯文本行列表**,见 §1.2。

**差在哪**
1. **[形态 · 重写级]** 文本行 → 图片卡网格。需要新组件(卡 + 网格容器),这是本族最大的一块。
2. **[形态]** 产品的两套面板要合并成一个产物区。目前它们靠 `summaryArtifactOps.length === 0` 一个条件互斥,注释里挂着一条 P0 的历史(#5909)—— 合并正好把这个脆点消掉。
3. **[样式]** 缩略图:HTML 复用 `DesignsTab` 的 `thumb-iframe` 打法(iframe 渲染真页面),图 / 视频直接走 `projectFileUrl`。**能力已有,只是没在 chat 里用过。**注意 `chat/primitives/ImageRow.tsx:54` 现在的 `.mini` 还只是一块灰占位,没接真图 —— 产物卡要接真图,不能照抄它。
4. **[数据 · 可做]** 产物判据用 `runtime/chat/format.ts` 的 `artifactKind()` / `isArtifactPath()`(md / csv 不是主产物);出卡时机与名单核对按 W12 走 `live_artifact` 事件 + `end.artifactPaths`。
5. **[样式]** 稿子固定 2 列;产品是单列列表。**数量极端(S5)未决**:多产物时谁上大卡,设计还没答(`specs/current/chat-panel-next.md` §9.1 挂着)。
6. **[缺一态]** 稿子只有四态,**没有「生成中」**。D37 要求补一个灰占位呼吸态(产品 2026-08-21 提的:「现在它停在这儿,不知道它有没有结束,然后产物突然就出来了」),样式是模拟器加的 `.art.is-pending`,**待设计确认**,陈列页上要单独标注。
7. **[排布 · 需拍板]** D38 定的轮末顺序是「产物卡 → 总结正文 → 回合状态行 → 下一步引导」,而 D37 又说产物卡「位置 = 出卡那一刻的位置,不挪到轮末」。产品现在是**固定钉在全部正文之后**。这两者在"写产物早于说总结"的常见情况下一致,但**顺序是按事件时间涌现的,不是写死的** —— 实现时要按事件位置落卡,别照着 D38 的字面顺序硬排。

---

### 第 31 格 · 14-2 HTML 产物 · 发布 / 导出 两枚都在

**稿子**:单张卡,右上角 `[发布][导出]`。`.acts` 用 flex 靠右而不是各自定位 —— 「少一个的时候整排自己往右收,右缘始终齐」。

**现状**:两个动作都存在,但**位置和形态完全不同**:
- 发布 = `ProjectView.tsx:9931` `handleArtifactShare` → `requestOpenFile` + 打开 FileViewer 的 share 菜单;
- 导出 = `ProjectView.tsx:9940` `handleArtifactDownload` → 打开 Download / Export 菜单(PDF / 图片 / zip / standalone HTML / 存为模板);
- 两者现在挂在 `NextStepActions` 的**三级 flyout**「更多 → 分享 → 分享 / 下载」里(`NextStepActions.tsx:900` / `:990`)。

**差在哪**
1. **[形态]** 从三级菜单提到卡面右上角的两枚常驻胶囊。**回调可以原样复用**,不用新写业务逻辑;`NextStepActions` 里的 share 分支随之拆走。
2. **[交互 · 需拍板]** 稿子说明只写「导出下载到本地」;产品的「导出」是**打开一个要选格式的菜单**。是一次点击直接下载,还是仍开菜单?**要问产品。**
3. **[样式]** #353535 实底胶囊 + 白字,产品没有对应样式。CSS 注释里明确点名:实底是产品指定的,原来是 44% 半透明黑 ——「压在浅图上偏灰、压在深图上几乎看不见边,一排卡看过去按钮深浅不齐」。**不要改回半透明。**
4. **[图标]** 「发布」在稿子里是**纯文字**;D39 要求补一枚上传图标(设计 2026-08-21 口头答复,稿子未更新)——**待设计确认,陈列页要标**。
5. **[图标 · 要抠]** 「导出」那枚圈内下箭头(`M12 2C17.52 2 22 6.48 22 12…`)**不在** `apps/web/src/components/remix-icon-paths.ts` 的 152 个字形里,得新抠路径。按 `chat/AGENTS.md` 的既有做法,进 `apps/web/src/components/chat/primitives/icons.tsx`,路径逐字取自设计稿。

---

### 第 32 格 · 14-3 非 HTML 产物 · 右上角只剩一枚「导出」

**稿子**:单张卡,右上角只有「导出」。说明文字:「发布只有 HTML 产物有,md / csv 那类卡右上角就只有一枚 —— 认下这点参差」。

**现状**:同 30 格(无卡)。不过**判据其实已经对齐**:`NextStepActions` 的 `canShare` 依赖
`pickPreviewableArtifact`(`AssistantMessage.tsx:1160`),只认 HTML。

**差在哪**
1. **[形态]** 同第 30 格。
2. **[样式]** 判据直接用 `artifactKind(path) === 'html'`,和现有 `isPreviewableHtml` 是同一条线。
3. **[稿内不一致 · 已消失]** `apps/web/src/components/chat/AGENTS.md` §6 记着「组件 14 非 HTML 态 DOM 里 `product-card.md` 仍渲染了『发布』按钮」——**在当前稿(`1bbdce0b06` 抽取)里已经修好了**,32 格 DOM 只有一枚导出。同段记的另一条「状态标题写『其余收进「⋯」』」也已修(现在标题是「动作在右上角」)。**这两条陈述已过期,建议从 AGENTS.md §6 撤掉。**

---

### 第 33 格 · 14-4 视频产物 · 卡面上什么都不压

**稿子**
```
.art.mod-video .thumb → display:grid; place-items:center; background: var(--bg-panel)
.art.mod-video .mini  → width:auto; aspect-ratio: 9/16; height:100%; background: var(--bg-muted)
```
竖片按 9:16 居中、两边留白 ——「卡是 16:10 的横框,把竖视频拉满会变形,留白本身也是信息:这是一条竖片」。
右上角只有「导出」(视频不是 HTML,没有发布)。DOM 里两张视频卡并排。

**现状**:同 30 格(无卡)。视频封面的现成做法在 `DesignsTab` 的 `project-thumb-video`。

**差在哪**
1. **[形态]** 同第 30 格,多一个 `mod-video` 变体。
2. **[稿内不一致 · 新发现]** 这一段 CSS 里有**两条互相矛盾的注释**:靠前那条写「视频这张卡**面上要有播放键**……『⋯』照旧在右上角,里面还是 预览 / 导出」,靠后那条写「**卡面上什么都不压**……这里先后压过一条播放控制条和一枚居中的『查看』,都撤了」。
   DOM、状态标题、`cmp-ops` 三处都站后一条。按 `chat/AGENTS.md` §6「以说明文字为准」→ **卡面什么都不压,右上角只有一枚导出**。这条矛盾 AGENTS.md 里没记,建议补进去。

---

### 第 34 格 · 15-1 反馈行 · 默认(回合状态 + 图标组 + 时间)

**稿子**
```
DOM 顺序: [.fin 勾+已完成] [赞] [踩] [复制] [Fork] [.sp 弹簧] [.tm 14:32]
.fb        → display:flex; align-items:center; gap:2px   (满宽,靠 .sp 把时间推到右端)
.fb .fin   → --t-cap(12px) + color:--brand-text(绿字);勾 13px、color:--brand-weak
.fb button → 26×26; border-radius: --radius-sm; color:--text-soft; 无边框
             hover → background:--bg-fill-secondary; color:--text-strong
.fb button svg → 13px
.fb .tm    → margin-left:6px; --t-cap; color:--text-soft
```
说明文字要点:**不报用量**(「原来这里跟一个『3.2k』,是个没单位、不可行动的裸数字」),
**不报耗时**(「耗时归过程,写在『已完成 N 个任务』那一行里」)。
勾用 13px 不是 15px ——「这一行右边那组动作图标是 13,状态挨着它们,跟着行内的图标尺寸走」。

**现状**:`.assistant-footer`,顺序 `[5px 圆点][状态词] │ [复制][Fork][赞][踩]`,没有时间。
按钮 22×22、`--radius-pill`、hover 上一圈边框。整行 `opacity: 0`,只有
`:hover` / `[data-streaming="true"]` / `[data-last="true"]` / 无 hover 设备 才显形(`composio.css:3595`)。

**差在哪**
1. **[样式]** 状态标记:产品是 5px 圆点(完成态 `--text-faint` 灰、进行中才 `--green` + pulse);稿子是 13px 绿勾(`--brand-weak` 底片)+ `--brand-text` 绿字。仓库里已有现成的勾资产 `--chat-tick-img`(`chat/ChatRoot.module.css:83`,D40 修过底圆半径),可直接复用。
2. **[排布]** 图标顺序:产品 `复制→Fork→赞→踩`,稿子 `赞→踩→复制→Fork`。
3. **[排布]** 稿子右端有 `14:32`,产品没有。**数据是有的** —— `packages/contracts/src/api/chat.ts:882` 的 `ChatMessage.createdAt?: number`。
4. **[排布]** 产品在状态与动作之间有一条 `border-left`(`theater.css:323` / `:305`),稿子没有分隔线,改用 `.sp` 弹簧撑满整行。
5. **[交互]** 产品整行 hover 才显形,稿子的「出现时机」写的是**消息末尾常驻**。
6. **[样式]** 按钮 22→26px、圆角 pill→`--radius-sm`、hover 从「加边框」改成「只上底色」。
7. **[形态 · 需拍板]** `hideRunStatus`(`AssistantMessage.tsx:1113`):产品在这一轮有执行记录或 todo 快照时,**整个状态词都不渲染**,理由是"run 状态已经在答案顶部了,footer 不重复"。稿子里壳头(「已完成 N 个任务」)和回合状态行(「已完成」)是**同时存在、各说各的**:前者说过程,后者说「这轮到此为止」。要恢复吗?**要拍板** —— 这条直接改的是同屏信息密度。
8. **[文案]** 「已完成」= `assistant.doneLabel`,产品值已是「已完成」,**这一条不用改**。

---

### 第 35 格 · 15-2 hover · 出 Tooltip

**稿子**:所有纯图标按钮挂 `data-tip`,`[data-tip]:hover::after` 与 `:focus-visible::after` 都出。
CSS 注释说明了为什么不用原生 `title`:「原生 tip 要等半秒到两秒(各家浏览器不一,不可控),等到时手已经点下去了」。
`.is-tip` 只是稿子给静态截图用的常开态,**不是真实 UI**。
四条文案:`有帮助 / 没帮助 / 复制 / 新开会话`。

**现状**:`.od-tooltip` + `data-tooltip` + `apps/web/src/components/TooltipLayer.tsx`(portal 实现,
按 pointer / keyboard modality 分别触发,`aria-expanded="true"` 时抑制)。**机制等价,还更完整。**
但产品同时还挂了原生 `title={label}`(`AssistantMessage.tsx:1707` 等),会和自绘 tip 叠在一起。

**差在哪**
1. **[文案]** `有帮助 / 没有帮助 / 复制回复 Markdown / 从这里分叉` → `有帮助 / 没帮助 / 复制 / 新开会话`。
   四条全要改(`assistant.feedbackPositive` / `feedbackNegative` / `copyMarkdown` / `forkConversation`),19 语 + `types.ts`。
2. **[样式 · 顺手]** 产品的 `title` 属性和自绘 tooltip 重复,应当去掉 `title`(稿子只有 `aria-label` + `data-tip`)。
3. 形态**无差异**。

---

### 第 36 格 · 15-3 踩被选中 · 用红不用绿

**稿子**:`.fb button.is-on.mod-down { color: var(--red); background: var(--red-bg) }`,`aria-pressed="true"`。
CSS 注释:「踩用的是 `--red-bg`(#F04142 掺到 10%)那种淡红底,一浓一淡并排,两枚本该对称的按钮看着不像一对」——
所以赞那一档的绿也掺了白,让两边同量级。

**现状**:`[data-selected="true"]` → `color: var(--accent)` + `--accent-tint` 底 + `--accent-soft` 边。
**赞和踩同一套颜色。**

**差在哪**
1. **[样式]** 踩要单独一套红态(`--red` / `--red-bg`),不能和赞共用 accent。
2. **[样式]** 产品选中态多一圈 `border-color`,稿子不画边。
3. **[稿内细节]** 36 格 DOM 里被选中的那颗踩**丢掉了 `data-tip`**(其余几颗还在)。看着是稿子疏漏而非设计意图 —— 实现时**保留 tip**,并记进待确认。

---

### 第 37 格 · 15-4 已选 · 图标变填充,再点取消

**稿子**:`.fb button.is-on { color: var(--brand-text); background: color-mix(in srgb, var(--brand-weak) 45%, var(--bg)) }`
——「同一个 #00FF04,掺 55% 白……这枚底是 26×26 的实心方块,而 `.mk.is-ok` 那枚绿勾底片只有 14px,同一个饱和度铺在近四倍的面积上就重了一档」。

**现状**:`[data-selected="true"] { color: var(--accent); background: var(--accent-tint); border-color: var(--accent-soft) }`
外加 `[data-selected="true"] svg { fill: currentColor }` —— **产品真的把线性图标填成了实心**。

**差在哪**
1. **[样式]** 选中底色:accent 蓝 → 品牌绿掺白那一档;去掉边框。
2. **[待确认]** 状态标题写「**图标变填充**」,但 37 格 DOM 里 `.is-on` 那颗仍然是 `thumb-up-line` 的路径,**只换了底色**;`cmp-ops` 里也只写「单击切换,互斥」,没提填充。按 `chat/AGENTS.md` §6「以说明文字 / DOM 为准」→ **只换底色**。产品现在的 `fill: currentColor` 与之相反。**要拍板**(这条会影响 36 格一起)。
3. **[稿内细节]** 37 格 DOM 里**没有 Fork 按钮**(只有 赞 / 踩 / 复制),而 34 / 35 / 36 / 38 四格都有。大概率是稿子疏漏 —— 实现时保留 Fork,记进待确认。
4. **[已对齐]** 图标本身**不用改**:产品的 `Icon` 走 `REMIX_ICON` 映射(`Icon.tsx:122`),`thumbs-up → thumb-up-line`、`thumbs-down → thumb-down-line`、`copy → file-copy-line`、`fork → git-branch-line`,与稿子 DOM 里的四条路径**逐字相同**,尺寸也同为 13px。

---

### 第 38 格 · 15-5 点过「新开会话」· 原地落一条分界

**稿子**:反馈行照旧,**下面原地追加两个新元素**:
```
.fork-sep  → flex;两侧 <i> 各一条 1px 渐变发丝线(外沿透明 → 贴字处 --border-strong)
             中间 <span> = 承接过来的【会话标题】,--t-cap/500/--brand-text 绿,max-width 62%,单行省略
.fork-note → 居中一行:git-branch 图标 12px + 「上文已带过来,接着说就行」,--t-cap/--text-soft
.is-new    → fork-in 入场动画(note 延后 60ms)
```
说明文字要点:「Fork 是**以这条回复为上下文另起一轮,不是跳走** —— 所以它的结果得留在原处看得见……
点完什么都不留,人只会以为这个按钮没反应;而跳走又会让人丢掉刚读到一半的上文」。
中间那行字是**承接过来的会话标题,不是新写的说明**。

**现状**:`handleForkFromMessage` 创建新会话 → 清空 messages → `navigate(replace)` 到新会话。
原地不留任何痕迹。新会话标题是 `chat.forkedConversationTitle` = 「{title} 分叉」。

**差在哪**
1. **[形态 · 重写级]** 「不跳走 / 原地落分界」是**行为改变**,不是样式。可行路径:仍然切到新会话(服务端已把前序消息复制过去),但在新会话消息流的**末尾**渲染这条分界,并保住滚动位置 —— 视觉上就是"原地"。
2. **[数据]** 需要「这条会话是从哪条消息分叉出来的 + 源会话标题」这两个信息落在 conversation 上,否则刷新之后分界就没了。现在 conversation 上**没有这个字段**,唯一的痕迹是标题里那两个字。要动 `packages/contracts` + daemon。
3. **[文案]** 分界上写的是**原会话标题**,不是「{title} 分叉」。
4. **[文案]** `.fork-note` 「上文已带过来,接着说就行」是新文案,19 语 + `types.ts` 全要补。
5. **[样式]** 两侧渐变线、绿色标题、居中脚注、入场动画,全新。

---

### 第 39 格 · 15-6 这轮被中断 · 状态词说清有没有剩余,绿点转灰

**稿子**
```
.fb .fin.mod-stop     → color: var(--text-muted)   —— 不是红,「它不是出事,只是没跑完」
.fb .fin.mod-stop i   → 5px 灰圆点,background: var(--text-faint)
文案                  → 「已手动停止」
按钮组                → 只有 [复制][Fork] —— 赞 / 踩 两枚整个消失
```
说明文字明确:「停止时状态词写清是谁停的 ——『已手动停止』。**不加『仍有未完成任务』那种限定语**:
剩没剩、剩几步,上面那段执行记录本来就写着」(与 D5 同源)。

**现状**
- `canceled` → `assistant.canceledLabel` = **「已取消」**
- `hasUnfinishedTodos` → `assistant.unfinishedLabel` = **「已停止，仍有未完成任务」**
- 赞 / 踩照常渲染(`isFeedbackEligible` 只挡 streaming / 空回复 / 未完成 todo 里的一部分,需逐条核)

**差在哪**
1. **[文案]** 两条状态词都要换成「已手动停止」。`assistant.unfinishedLabel` 那句正好是稿子点名反对的写法。(顺带:那句里还混了一个全角逗号,和邻近文案不统一。)
2. **[形态]** 中断轮次**不出赞 / 踩**。产品要加这条门 —— 这会改 `isFeedbackEligible` 的判据,**同时影响反馈埋点的样本口径**,要跟数据侧的人打招呼。
3. **[样式]** 5px 圆点用 `--text-faint` 底、`--text-muted` 字;产品完成态本来就是灰点,主要差在字色档和文案。

---

### 第 40 格 · 15-7 反馈弹窗 · 点踩后选原因 + 补充

**稿子**
```
.rsn      → 1px --border + --radius-lg + --bg 白底 + padding 10px 11px + margin-top 8px
.rsn .t   → 「哪里不对?」--t-lead(14px)/600/--text-strong 「是这个弹窗的问句,不是标注」
.rsn .ch  → flex wrap gap 5px,四枚 .chip.mod-sm 胶囊:
             没按我说的改 / 视觉不一致 / 跑不起来 / 太慢
.chip.is-on → border-color: transparent(保住 1px 位置,不跳)+ 品牌浅绿底 + --brand-text + 600
              「选中态不画描边:底色已经把『选中』说完了」
.rsn .ta  → 【只有一条下边框】的输入,无左右内边距、无底色、field-sizing:content 自动长高
             placeholder「补充点什么(可选)」;focus 时 border-bottom-color → --border-strong
底部      → 右对齐 [取消 .btn.mod-ghost.mod-sm][提交 .btn.mod-primary.mod-sm]
```
`cmp-ops`:「赞 / 踩 — 单击切换,互斥;**踩后**弹窗选原因 + 补充」。

**现状**:`.assistant-feedback-reasons`(`AssistantMessage.tsx:2087`)
- 标题「选择原因」+ 一枚 😊/😔 emoji
- 选项是 `<label><input type="checkbox">` 的**复选框行**,不是胶囊
- **6 项**(含「其他」,有设计系统上下文时 7 项),文案是 `没有理解需求 / 视觉效果不理想 / 产物不完整 / 不方便使用 / 其他`
- 勾了「其他」才出 `<textarea rows={2}>`(带完整边框)
- 中间夹一段**硬编码英文**的 Discord 引导句(`Share what you made with the Discord community…`),**没走 i18n**
- 底部只有一枚「提交」,**没有取消**
- **赞和踩都会弹**

**差在哪**
1. **[形态]** 复选框列 → 胶囊组。
2. **[形态]** textarea 从「勾了『其他』才出」→ **常驻**;样式从框改成一条下边框。
3. **[交互 · 需拍板]** 赞也弹面板 → 稿子只有踩弹。**现有正向原因收集是有埋点价值的**(`assistant_feedback_reason_*` 一整组事件),砍掉之前要问产品。
4. **[排布]** 缺一枚「取消」。
5. **[文案]** 标题 → 「哪里不对?」;原因项 6→4 且**全部换词**;placeholder 换词;emoji 稿子没有。
6. **[数据 · 有代价]** 原因枚举是契约类型 `ChatMessageFeedbackReasonCode`(`packages/contracts/src/api/chat.ts`),换成 4 个新词 = **改契约 + 改埋点口径**,PostHog 上历史 `reason` 值会断代。这不是样式改动,得先跟数据侧对齐。
7. **[缺陷 · 顺手补]** Discord 那两段硬编码英文既不在稿子里、也不在 i18n 里。按稿删掉正好把这个洞一起补上;若产品要留,必须补满 19 语。

---

### 第 41 格 · 16-1 下一步引导 · 默认 · 3 条可点击建议

**稿子**
```
.nexts        → border-radius: --radius; background:--bg; overflow:hidden
                 ★ 不画外框、不画分割线
.nexts button → flex; width:100%; padding:9px 11px; border:none; background:none
                 --t-mini(12px); color:--text; text-align:left; 左侧 12px 箭头图标 --text-soft
hover         → background:--bg-panel; 字与图标一起转 --text-strong
```
CSS 注释把演进整段记下来了:「最早每条各有一圈边框……后来收成『一个外框 + 内部发丝分割线』;
现在**线全去掉**……它在整轮的最末尾,是收尾之后的一句『接下来还能做什么』,本身不是这一屏要你读的内容。
一个带框的块在版面上是个『东西』,会跟上面刚交付的产物卡抢一次注意力」。
「『有三条』这件事由三个箭头说,不由两道线说。点得动这件事由 hover 底色说 —— 静止时不显形,是这一块想要的分寸」。
`cmp-ops`:「点击填入输入框 — 单击某条,内容作为新 Prompt 填入输入框,**不直接发送**」。
三条文案是**内容相关的建议**:再加一页订单列表 / 把商品卡换成两列布局 / 补一套深色模式。

**现状**:`NextStepActions`。`.root` 有 1px 边框 + 渐变底 + padding;每行 `.toolboxRow` 是**独立胶囊**
(1px `--border-soft` + `--bg-panel` 底 + `border-radius: 999px`),右端还有 chevron;
hover 换 `--accent-tint` 底并 portal 弹一张 detail 说明卡;下面还挂一枚「更多」开三级 flyout。
内容是**固定目录**,不是本轮内容的建议。

**差在哪**
1. **[数据 · 真的做不到]** 产品**没有任何「按本轮内容生成的后续建议」数据源**。
   `packages/contracts` 里没有 followUp / suggestions 之类的字段(只有 `ProjectDesignTokenSuggestion` 和 `MemorySuggestion`,都不是这个);daemon 侧也没有。
   要做只有两条路:
   - ① 学 `<question-form>` 的做法,让 agent 在正文里吐一段标记(比如 `<next-steps>`)。**改 system prompt = 产品行为**,代价与 D43 的 `<done/>` 同一量级,而且要覆盖全部 agent。
   - ② daemon 在轮末再调一次模型生成三条。有成本、有延迟,且要考虑 BYOK / AMR 的计费面。
   **这是本族唯一一处「事件流里没有这个信息」。**在它落地之前,41 / 42 两格在陈列页上只能拿现有目录数据凑,并标明"内容非稿子形态"。
2. **[形态]** 目录式菜单(胶囊行 + chevron + hover detail 卡 + 三级 flyout)→ 三条无框建议行。稿子里**没有** chevron、没有 detail 卡、没有「更多」。
3. **[排布]** 稿子固定三条;产品行数随 variant 在 2–5 行 + 更多之间变。
4. **[样式]** `.root` 的边框 + 渐变底要去掉;`.toolboxRow` 的胶囊边框要去掉;行与行之间**不留 gap**(靠贴在一起表达成组),现在是 `gap: 6px`。
5. **[归属]** 「分享 / 下载 / 投稿社区 / 创建设计系统」现在藏在这个组件的三级菜单里 —— 按稿子,分享和导出属于**组件 14 的卡面动作**。这一族对齐会顺手把它们拆走,`NextStepActions` 只剩"接下来做什么"。
6. **[已对齐]** 点击行为:`handleNextStepPromptAction` 已经是 `composerRef.setDraft(prompt)`(填入不发送)。**这是本组件唯一对上的一条,别改坏它。**

---

### 第 42 格 · 16-2 下一步引导 · hover · 只高亮被指的那一条

**稿子**:`.nexts button:hover`(稿子用 `.is-hover` 做静态常开态)→ `background: --bg-panel`,字与图标一起转 `--text-strong`。
「圆角和 overflow:hidden 留着:外框虽然没有描边了,hover 的底色仍然要被圆角裁齐,否则首尾两行的高亮会露出直角」。

**现状**:`.toolboxRow:hover` → `--accent-tint` 底 + `border-color: --border`;**同时 portal 弹一张 detail 说明卡**。

**差在哪**
1. **[样式]** hover 底色换成 `--bg-panel`,字与图标同时转深;去掉边框变化。
2. **[形态]** hover 弹出的 detail 说明卡要撤 —— 稿子里没有这个东西(它服务的是"固定目录需要解释"这个前提,建议本身自解释就不需要了)。
3. 高亮**只落在被指的那一行**这一点两边一致。

---

### 第 43 格 · 24-1 音频产物 · 默认 · 停着,整条波形都还没播

**稿子**
```
.aud      → flex; gap:3px; padding:3px; --radius-lg; background:--bg-subtle   (外层浅底)
.aud-demo → width:406px; max-width:100%   —— 与 21·待发送附件那排同宽,「两处都是『输入框那么宽的一条东西』」
.aud-in   → flex; gap:7px; flex:1; min-width:0; padding:3px 7px; --radius; background:--bg  (内层白行)
  ├ .aud-ic  麦克风 15px,--text-soft
  ├ .aud-t.aud-now  已播时间,26px 定宽 + tabular-nums(「秒数每跳一下字形宽度就变,不定宽整条波形会跟着左右抖」)
  ├ .wave   28 根柱子:width 3px、gap 3px、height calc(var(--h) * 0.68px)、--text-faint;整条 height:30px
  ├ .aud-t.mod-end  总长,右对齐
  └ .aud-b  播放键 26px 实底圆,background:--text-strong / color:--bg;三角 translateX(1px) 找重心
.aud-x    → 「×」26px,在【白行外面】——「它删的是整条附件,不是音频里的某一段」
```
`cmp-ops`:「波形是**固定的**,不是随机画的 —— 这是一份要反复截图对照的稿子」;
「听完停在末尾,**不自动回零**:自己跳回 0:00 会让人以为没播过;再点一次从头开始」。
配套脚本(稿内 `[data-audio]` 那段)已经把播放逻辑写全了:200ms tick、`data-playing` 切图标、
`is-on` 只在"该亮的根数变了"时才刷 class、`data-play` 是稿子演示格的自动循环标记、
`prefers-reduced-motion` 下不自动播。

**现状**:**chat 里完全没有。**产出的 mp3 只会作为 `ProducedFiles` 的一行(文件名 + 体积 + 打开 + 下载)。
产品唯一的音频播放器是原生 `<audio controls>`(FileViewer / 资产上传 / 插件媒体详情)。

**差在哪**
1. **[形态 · 重写级]** 全新组件,产品里没有任何可复用的形状。
2. **[数据 · 部分做不到]** **时长**:`packages/contracts/src/api/files.ts:32` 的 `ProjectFile` **没有 duration 字段**,只能靠 `<audio>` 的 `loadedmetadata` 在客户端读。可行,但首帧拿不到 —— 而 `chat/AGENTS.md` §3 的降级规约**禁止用 `0:00` / `--` 这类假值填补缺席数据**。要么等元数据到了再显形,要么那一格先留空。**要拍板。**
3. **[数据 · 没有]** **波形**:全仓零 `decodeAudioData` / wavesurfer,没有任何波形数据源。稿子自己写明这 28 根是上游那张固定表(WAVEFORM_BARS),不是真波形。所以两条路:照抄 28 根固定柱(视觉上等于装饰),或客户端解码算真波形(重,且要考虑大文件)。**要产品拍板。**
4. **[待确认 · S14]** 稿子这一条上**没有文件名、也没有 aria 挂它** —— 一屏里出现两条音频就分不出谁是谁。规格 §13 已开成 S14,仍未答。
5. **[待确认 · 新提]** 那枚「×」的语义。稿子写「移除这段音频」,注释写「它删的是整条**附件**」—— 因为这条是从 beui.dev 的 file-upload 组件搬来的。但组件 24 的出现时机是「**产物**是一段音频时」,产物不是附件。这个「×」到底是删文件、还是只从流水里撤掉一张卡?**稿子没说,要问。**
6. **[已就位]** `runtime/chat/format.ts:35` 的 `formatDuration()` 就是照这一格的写法做的,可直接用。

---

### 第 44 格 · 24-2 音频产物 · 播放中 · 已播那截变实,波形跟着起伏

**稿子**:同一份 DOM,加 `data-at="12"`(起播位置)+ `data-play`(稿子演示格的自动循环标记);
运行时由脚本写 `data-playing`。
```
.wave > i.is-on                  → background: var(--text-strong)
                                    「颜色的分界本身就是播放头,不另画竖线」
.aud[data-playing] .wave > i     → animation: wave-pulse 0.55s infinite;
                                    animation-delay: calc(var(--i) * 18ms)
                                    「这一下表示的是【还在响】,不是音量(音量已经由柱高定死),
                                      所以它是全条一起动,不只动已播那截」
.aud[data-playing] .aud-b .ic-play  → display:none  (切成 pause 图标)
@media (prefers-reduced-motion: reduce) { .aud[data-playing] .wave > i { animation: none } }
```
> 注:`animation: none` 那条**在 reduced-motion 媒体查询里面**,不是覆盖前面那条。
> 用扁平化的 CSS 抽取脚本看会误判成"稿子自相矛盾",这里已核实过(规格 §10 踩坑 #2 同类)。

**现状**:同 43 格(无实现)。

**差在哪**:同第 43 格。这一格额外要注意的只有两点 ——
1. **[样式]** 已播/未播的分界**只用颜色**,不画播放头竖线。
2. **[样式]** 起伏动画是**整条一起动**(逐根 18ms 错开),不是只动已播那截;并且必须带 `prefers-reduced-motion` 关闭分支。

---

## 3. 要改哪些文件(给你照着做)

> 只列本族需要动的落点,按"改动性质"分组。**本轮没有动任何一个文件。**

### 3.1 新建(建议)

| 文件 | 内容 |
|---|---|
| `apps/web/src/components/chat/ArtifactCard.tsx` + `ArtifactCard.module.css` | 组件 14:卡 + 2 列网格 + `mod-video` 变体 + 右上角动作组。`--chat-*` only |
| `apps/web/src/components/chat/AudioArtifact.tsx` + `AudioArtifact.module.css` | 组件 24:外层浅底 + 白行 + 28 柱波形 + 播放键 + 外置「×」 |
| `apps/web/src/components/chat/TurnOutro.tsx`(名字待定)+ `.module.css` | 组件 15:回合状态行(勾/灰点 + 状态词 + 四枚动作 + 右端时间)与原因面板 `.rsn` |
| `apps/web/src/components/chat/NextSteps.tsx` + `.module.css` | 组件 16 的稿子形态(无框三行)。**先不要删 `NextStepActions`** —— 目录内容还没有替代品 |

### 3.2 修改(现有文件)

| 文件 | 要做什么 |
|---|---|
| `apps/web/src/components/AssistantMessage.tsx` | 接入四个新组件;合并 `FileOpsSummary` / `ProducedFiles` 两条产出面板;`hideRunStatus` 的取舍;中断轮不出赞踩;去掉按钮上重复的 `title` 属性 |
| `apps/web/src/components/NextStepActions.tsx` + `.module.css` | 拆走「分享 / 下载」分支(归组件 14);`.root` 去框去渐变;`.toolboxRow` 去胶囊边框;去 chevron 与 hover detail 卡 |
| `apps/web/src/components/chat/primitives/icons.tsx` | 新抠两枚设计稿图标:「导出」圈内下箭头、「下一步引导」的箭头(两枚都**不在** `remix-icon-paths.ts` 的 152 个字形里) |
| `apps/web/src/styles/viewer/code.css:998,1014` | 删流式光标 `::after`(稿子 21:02 版已去掉 `.caret`) |
| `apps/web/src/styles/viewer/composio.css:3582–3645` | `.assistant-completion-row` / `.assistant-footer` / `.dot` 一段随组件 15 迁走 |
| `apps/web/src/styles/viewer/theater.css:298–430` | `.assistant-feedback*` / `.assistant-copy-button` 一段随组件 15 迁走 |
| `apps/web/src/styles/viewer/tools.css:58–90, 298–380` + `routines.css:1993` | `.produced-files*` / `.file-ops*` 随组件 14 迁走(注意 `routines.css` 里那层 `.app` 覆盖别漏) |
| `apps/web/src/i18n/types.ts` + `locales/*.ts`(**19 个**) | 见 §3.3 |
| `apps/web/src/runtime/chat/contract.ts` | 加产物块类型(W12 已挂账);`TurnBlock` 现在只有 `ExecutionShell │ ProseBlock` |
| `apps/web/tests/components/chat/mirror-gallery.test.tsx` | 把第 28–44 格挂上镜像陈列页(做不到的格子照样出格 + 写清原因,§11 的三条自律) |
| `apps/web/src/components/chat/AGENTS.md` §6 | 两条已过期的稿内不一致要撤(见 §5.2),两条新的要补 |
| `specs/current/chat-panel-next.md` | §9.1 / §12 / §13 的待决表要吸收 §5.1 的新问题 |

### 3.3 i18n(每条都要 `types.ts` + 19 个 locale)

**要改值的现有 key**
- `assistant.feedbackPositive` 「有帮助」→ 稿子同(不用改)
- `assistant.feedbackNegative` 「没有帮助」→ 「没帮助」
- `assistant.copyMarkdown` 「复制回复 Markdown」→ 「复制」
- `assistant.forkConversation` 「从这里分叉」→ 「新开会话」
- `assistant.canceledLabel` 「已取消」→ 「已手动停止」
- `assistant.unfinishedLabel` 「已停止，仍有未完成任务」→ 「已手动停止」(D5 明令去掉限定语)
- `assistant.feedbackReasonTitle` 「选择原因」→ 「哪里不对?」
- `assistant.feedbackReasonPlaceholder` 「补充说明...」→ 「补充点什么(可选)」
- `assistant.feedbackReasonNegative*` 四条全部换词(**同时要改契约枚举,见 §4 风险 4**)

**要新增的 key**
- Fork 分界脚注:「上文已带过来,接着说就行」
- 反馈面板「取消」按钮(现有 `common.cancel` 可能能复用,要核)
- 组件 14 的「发布」/「导出」(现有 `nextStep.share` / `nextStep.download` 语义不同,建议新开 `chat.artifact.*`)
- 组件 24 的 aria(播放 / 暂停 / 移除这段音频)—— 但**文件名那条卡在 S14**

**要删的硬编码英文**
- `AssistantMessage.tsx:2120` / `:2131` 的两段 Discord 引导句(既不在稿子里,也不在 i18n 里)

### 3.4 需要跨端(daemon / contracts)的

| 事项 | 涉及 | 挡住哪几格 |
|---|---|---|
| `<done/>` 写进 system prompt(D43) | `apps/daemon/src/prompts/system.ts`、`packages/contracts/src/prompts/system.ts` | 28、29(以及组件 4 的第 15 格) |
| conversation 加 fork 元信息(源会话标题 + 分叉点 messageId) | `packages/contracts` + `apps/daemon/src/routes/project/conversations.ts` | 38 |
| 本轮内容的后续建议(`<next-steps>` 标记 或 daemon 轮末生成) | prompt 或 daemon,二选一 | 41、42 |
| 反馈原因枚举换词 | `packages/contracts/src/api/chat.ts` + PostHog 口径 | 40 |
| 音频时长 / 波形 | `ProjectFile` 契约 或 客户端读 | 43、44 |

---

## 4. 形态级风险(哪几格改起来是重写)

按"能不能靠改样式收工"排序,**最高风险在前**:

**风险 1 · 第 41 / 42 格:下一步引导没有数据源(唯一一处真缺数据)**
产品的 `NextStepActions` 和稿子的组件 16 **只有交互契约对得上**(填入输入框不发送),
内容、形态、层级全部不同。而"按本轮内容给三条建议"这件事,**事件流里没有、契约里没有、daemon 里也没有**。
不管走 prompt 标记还是 daemon 生成,都是**产品行为改动**,不是 UI 工作量问题。
在它拍板之前,这两格只能拿现有目录数据凑一个形状,陈列页上必须标明"内容非稿子形态"。
> 连带风险:直接把 `NextStepActions` 换成三行建议,会**弄丢**现在藏在它三级菜单里的
> 创建设计系统 / 工具箱搜索 / 投稿社区 三个入口 —— 这些入口稿子里一个都没有。删之前要确认它们改去哪。

**风险 2 · 第 30–33 格:产物卡是一整块新东西**
文本行 → 图片卡是形态改写,但**能力都在**(缩略图三种打法都有现成实现,发布 / 导出的回调可原样复用),
真正的不确定性在三处:① S5「多产物时谁上大卡」设计没答;② D37 的「生成中」态稿子里根本没有,
样式是模拟器编的,待设计确认;③ 出卡时机要走 `live_artifact` + `end.artifactPaths` 两个真实事件源(W12),
**不能抄模拟器那套看后缀猜的替身逻辑**。
附带收益:合并两套产出面板,消掉 `AssistantMessage.tsx:1004` 那条挂着 P0 历史的互斥条件。

**风险 3 · 第 43 / 44 格:音频产物是全新组件 + 两处数据缺口**
组件本身不难(结构清楚,脚本逻辑稿子里写全了),难的是:
波形**没有数据源**(照抄 28 根固定柱 = 装饰,算真波形 = 重),
时长**契约里没有**(客户端读,但首帧拿不到,而降级规约禁止填假值),
再加 S14(没有文件名 / aria)和「×」语义未定 —— **四个未决项压在两格上**。
建议:先做静态形态挂陈列页,把四个问题一次性打包问设计和产品。

**风险 4 · 第 40 格:反馈原因换词会断埋点口径**
把 6 个原因换成稿子的 4 个,等于改 `ChatMessageFeedbackReasonCode` 契约 —— PostHog 上历史 `reason` 值会断代,
`assistant_feedback_reason_*` 那一整组事件的报表要重新对齐。
同样,「中断轮不出赞踩」(第 39 格)也会改反馈样本的口径。
这两条**不是 UI 决定**,动之前要跟数据侧对齐。

**风险 5 · 第 38 格:Fork 从"跳走"改成"原地"**
现在的实现是彻底换会话(清消息 + navigate);稿子要求原地留痕。
UI 侧可做(新会话本来就带前序消息,保住滚动位置即可),但**分界要能扛住刷新**,
就得给 conversation 加 fork 元信息 —— 又是一次跨端改动。

**低风险(基本是照着改)**:第 29 格、第 35 格、第 36 格、第 37 格、第 34 格的大部分。
第 28 格的"逐字化开"属于中等 —— W9 / W13 已经把两条坑写死了,照着模拟器的 `player.js` 做即可。

---

## 5. 待拍板 / 稿内不一致(要回写进 `chat-panel-next.md` 的待决表)

### 5.1 新提出的待拍板项

| # | 事项 | 卡在谁 | 影响 |
|---|---|---|---|
| O1 | 「导出」是一次点击直接下载,还是仍打开现有的格式选择菜单 | 产品 | 31、32、33 |
| O2 | 「图标变填充」:状态标题这么写,但 DOM 只换了底色,`cmp-ops` 没提。产品现有实现是真填充 | wangchenglong | 36、37 |
| O3 | 赞也弹原因面板要不要保留(现有正向原因收集有埋点价值,稿子只让踩弹) | 产品 + 数据 | 40 |
| O4 | 反馈原因换成稿子那 4 条 = 改契约枚举 + 断 PostHog 口径,认不认这个代价 | 产品 + 数据 | 40 |
| O5 | 中断轮不出赞踩,会改反馈样本口径 | 数据 | 39 |
| O6 | 组件 24 的「×」语义:删文件,还是只撤掉这张卡?稿子沿用的是附件语义,但 24 的出现时机是产物 | wangchenglong + 产品 | 43、44 |
| O7 | 音频波形:照抄 28 根固定柱(装饰),还是客户端解码算真波形 | 产品 | 43、44 |
| O8 | 音频时长首帧拿不到时长什么样(降级规约禁止 `0:00` 占位) | wangchenglong | 43 |
| O9 | 组件 15 的状态词与执行记录壳头同时出现(现有 `hideRunStatus` 会藏掉一个),恢复吗 | 产品 | 34 |
| O10 | 换掉 `NextStepActions` 之后,创建设计系统 / 工具箱搜索 / 投稿社区 三个入口去哪(稿子里一个都没有) | 产品 | 41 |
| O11 | 组件 16 的三条建议从哪来(prompt 标记 / daemon 生成 / 不做) | 产品 | 41、42 |

### 5.2 稿内不一致(按 `chat/AGENTS.md` §6「以说明文字为准」处理)

| 位置 | 矛盾 | 判定 |
|---|---|---|
| 组件 14 · 视频卡 CSS 注释 | 靠前那条写「视频这张卡**面上要有播放键**……『⋯』照旧在右上角,里面还是 预览 / 导出」;靠后那条写「**卡面上什么都不压**……先后压过一条播放控制条和一枚居中的『查看』,都撤了」 | DOM / 状态标题 / `cmp-ops` 三处都站后一条 → **卡面什么都不压,右上角只有一枚导出**。**AGENTS.md §6 里没记这条,建议补** |
| 组件 15 · `.fb` CSS 注释 | 注释写「这一行的开头放【状态词 + **耗时用量**】」;`cmp-ops` 和 DOM 都明确**不报用量、不报耗时** | 以 `cmp-ops` 为准 → **只有状态词** |
| 组件 15 · 第 37 格 DOM | 这一格**没有 Fork 按钮**,而 34/35/36/38 都有 | 疏漏,实现时保留 Fork,记进待确认(并入 O2 一起问) |
| 组件 15 · 第 36 格 DOM | 被选中的那颗踩**丢了 `data-tip`**,其余几颗都在 | 疏漏,实现时保留 tip |

### 5.3 已过期、建议撤掉的记录

`apps/web/src/components/chat/AGENTS.md` §6 现在记着两条组件 14 的稿内不一致:
> - 组件 14 状态标题写「其余收进「⋯」」,实际是三个动作全摆卡面
> - 组件 14 非 HTML 态 DOM 里 `product-card.md` 仍渲染了「发布」按钮

**在当前稿(`1bbdce0b06`,本次现场重抽)里这两条都已修好**:
- 14-1 的状态标题现在是「卡面只有图,不写文件名;**动作在右上角**」;
- 14-3 的 DOM 里只有一枚「导出」,没有「发布」。

建议把这两条从 §6 撤掉,换成 §5.2 里新发现的两条,免得下一个接手的人拿过期结论去"修"一个已经对的稿子。

---

## 6. 校验口径(别人复核时怎么重跑)

```bash
# 抽第 28–44 格的实体与状态名
cd docs/design/chat-matrix
python3 - <<'PY'
import sys, pathlib, importlib.util, re
spec=importlib.util.spec_from_file_location("bm","build-matrix.py"); bm=importlib.util.module_from_spec(spec)
sys.argv=['x']; spec.loader.exec_module(bm)
rows=bm.extract(pathlib.Path('../chat-panel-next.html').read_text(encoding='utf-8'))
for r in rows:
    if 28 <= r['gid'] <= 44:
        print('=====', r['gid'], r['sub'], r['name'], '|', r['state'])
        print(re.sub(r'<svg[\s\S]*?</svg>','<svg/>', r['dom'])[:1500])
PY
```

抽 CSS 时**注意两点**(本次踩到过):
1. 用扁平的 `([^{}]+)\{([^{}]*)\}` 正则会把 `@media` 里的规则提到顶层 —— 第 44 格的
   `.aud[data-playing] .wave > i { animation: none }` 就在 `prefers-reduced-motion` 里,
   扁平化之后看着像"后一条覆盖前一条",会误报成稿内矛盾。
2. 设计稿类名极短(`.art` `.fb` `.say` `.aud` `.rsn` `.nexts` `.chip` `.mini`),
   写任何包装页面时必须给自己的类名加前缀,否则会和稿子样式互相覆盖(仓库里已经踩过两次)。
