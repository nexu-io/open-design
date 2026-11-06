# ChatPanel「输入」族盘点与差异清单(OPEND-2199)

本文只盘**输入**这一族:组件 **1**(用户消息-文本)、**2**(用户消息-附件)、
**21**(待发送附件)、**23**(选中文字 · 添加到对话),对应 84 格里的第 **45–69** 格
(共 25 格,是五族里格子最多的一族)。

依据是 `docs/design/chat-panel-next.html`(wangchenglong 交付稿)里抽出的**真实 DOM +
CSS**,不是转述。复现方式:

```bash
cd docs/design/chat-matrix
python3 - <<'PY'
import sys, pathlib, importlib.util, re
spec=importlib.util.spec_from_file_location("bm","build-matrix.py"); bm=importlib.util.module_from_spec(spec)
sys.argv=['x']; spec.loader.exec_module(bm)
rows=bm.extract(pathlib.Path('../chat-panel-next.html').read_text(encoding='utf-8'))
for r in rows:
    if 45 <= r['gid'] <= 69:
        print('=====', r['gid'], r['sub'], r['name'], '|', r['state'])
        print(re.sub(r'<svg[\s\S]*?</svg>','<svg/>', r['dom'])[:1500])
PY
```

写包装/陈列页时注意:设计稿类名极短(`.bub` `.att-i` `.att-d` `.mini` `.card` `.h`),
必须给自己的类名加前缀,否则互相覆盖(已踩过两次)。

---

## 1. 现有实现落点表

**结论先行:这一族不是从零写,四个组件里三个在产品里已经在跑,只有组件 23 的「取词」那一半完全没有。**

| 组件 | 稿中名 | 产品渲染落点 | 组件名 | 已导出? | 能否独立挂载 | 样式落点 / 类名 |
|---|---|---|---|---|---|---|
| 1 | 用户消息-文本 | `apps/web/src/components/ChatPane.tsx:4658`(`memo`)/ `:4660`(`UserMessageImpl`) | `UserMessage` | ❌ 模块私有 | ✅ 加 `export` 即可。唯一 hook 是 `useProjectCollabContext()`,它有 `DISABLED` 默认值(`collab/collab-context.tsx:48,55`),**不需要 Provider**;其余全是 props | `apps/web/src/styles/chat.css`:`.msg.user`(499)、`.msg.user .user-text`(524)、`.user-text-wrap`(825)、`.user-actions`(916)、`.user-copy-btn`(929) |
| 2 | 用户消息-附件 | 同上,`UserMessageImpl` 内 `.user-attachments` 分支(`ChatPane.tsx:4745` 一带) | 无独立组件,内联 JSX | — | 随组件 1 一起 | `styles/chat.css`:`.user-attachments`(2905)、`.user-attachment`(2912)、`.staged-order`(2544)、`.staged-name`(2851);评论型附件 `.user-attachment.staged-comment`(2798) |
| 21 | 待发送附件 | `apps/web/src/components/ChatComposer.tsx:3790` `StagedRunContexts`(附件分支在 `:3986` 一带);挂载点 `:2998` | `StagedRunContexts` | ❌ 模块私有 | ✅ 加 `export` 即可,props 全是纯数据 + 回调;同样只依赖 `useProjectCollabContext()`。预览弹层走 `createPortal(document.body)` | `styles/chat.css`:`.staged-row`(2508)、`.staged-chip`(2518)、`.staged-chip--image-file`(2722)、`.staged-preview-trigger`(2697)、`.staged-remove`(2855)、`.staged-preview-modal`(2746) |
| 23(取词侧) | 选中文字浮条 | **没有现成实现** | — | — | — | — |
| 23(芯片侧) | 输入框里的注释芯片 | `ChatComposer.tsx:4074` `StagedCommentAttachments`;挂载点 `:3049` | `StagedCommentAttachments` | ❌ 模块私有 | ✅ 加 `export` 即可,props 只有 `attachments / onRemove / t` | `styles/chat.css`:`.staged-chip.staged-comment`(2798-2820) |

### 1.1 数据来源

| 需要的东西 | 有没有 | 出处 |
|---|---|---|
| 用户消息正文 | ✅ | `ChatMessage.content`(`packages/contracts/src/api/chat.ts`) |
| 发送时间(1-6) | ✅ **已有但没用** | `ChatMessage.createdAt`,`ProjectView.tsx:6848` 写入 `startedAt`,daemon `listMessages` 选出 `created_at AS createdAt`(`apps/daemon/src/db.ts:2597`)。`UserMessageImpl` 目前一次都没读 |
| 附件路径 / 名称 / 类型 | ✅ | `ChatAttachment { path, name, kind:'image'\|'file', size?, order? }` |
| 附件体积(2-5 / 2-8 的「12 KB」) | ✅ **已有但没用** | `size` 由 `uploadProjectFiles`(`providers/registry.ts:2969`)从上传响应带回,随 `attachments_json` 整体持久化 |
| 附件缩略图 URL | ✅ | `projectRawUrl(projectId, a.path, workspaceContext)` |
| 附件**逐个**上传中 / 上传失败(21-2 / 21-4) | ❌ | 见 §4-A |
| 用户消息**发送失败**(1-5 / 1-6 重试) | ❌ | 见 §4-B |
| 回答正文里的选区(23-1 / 23-2) | ❌ | 见 §4-C |
| 注释条目文本(23-3 ~ 23-5 的 popover 列表) | ✅ | `ChatCommentAttachment.comment / label / currentText`;分组成一枚芯片是纯视图改动 |

### 1.2 可直接借用的既有资产

- `docs/design/chat-sim/render-client.js` 已经把 **2 / 21 / 23** 照着稿子实现了一遍
  (`attCard` / `trayCard` / `attRow` / `tray` / `refsHtml` / `composer` / `selection`),
  含中间省略的字数预算 `truncName`(`NAME_BUDGET=9`)。做 React 版时逐标签对照它,别重新推。
- `apps/web/src/components/chat/primitives/record.module.css` 的 `.shot.fail .retry`(407-436)
  与稿子 `.att-i .rt` 是**同一套外观**(方格内居中的红色「↻ 重试」)。
  但按 `components/chat/AGENTS.md` §1b,`record.module.css` 只归执行记录族,**不要往里加附件样式**;
  这块要么复制,要么提成 primitive。
- `primitives/icons.tsx` 已有 `RetryIcon`、`ChevronIcon`。缺:`×`、文件、复制、眼睛(预览)、注释气泡。

---

## 2. 第 45–69 格逐格差异清单

标注含义:
**[样式]** 纯样式/文案差异 · **[形态]** 结构或交互不同,工作量不是一个量级 · **[数据]** 数据侧做不到。

### 组件 1 · 用户消息-文本(第 45–51 格)

---

#### #45 `1-1` 成功 · 发送完成

- **稿子**:`div.msg-me > div.bub`。气泡 `--bub-bg: var(--text-strong)`(#202020)**深底白字**
  (`color: var(--bg)`),圆角 `12px 12px 4px 12px`(**缺口在右下**),`padding: 9px 13px`,
  13px / **行高 1.7**,`max-width: min(84%, 380px)`,`overflow-wrap: anywhere`。
- **现在**:`div.msg.user > .user-text-wrap > .user-text.user-bubble`。气泡 `background: #ededed`
  **浅底深字**(`color: var(--text)`),圆角 `12px 0 12px 12px`(**缺口在右上**),
  `padding: 8px 12px`,13px / **行高 1.5**,外层 `max-width: min(78%, 560px)`,`white-space: pre-wrap`。
- **差在哪**:
  1. **[样式]** 底色反转:深底白字 ↔ 浅底深字。这是这一格最扎眼的一处。
  2. **[样式]** 缺口的角从右上挪到右下。
  3. **[样式]** 行高 1.5 → 1.7、内边距 8/12 → 9/13、最大宽 560 → 380(稿子按 380 锁死气泡,
     不跟 `.msg-stack` 的 412 一起变宽)。
  4. **[样式]** 底色必须走一个中间变量(稿子叫 `--bub-bg`)而不是写死 `#ededed`:
     hover 变色(#50)和折行时盖住半个字的渐变(#46)**必须同色**,所以只能有一个出处。
     `ChatRoot.module.css` 里目前**没有** `--chat-bub-bg`(spec 的 W1 已经登记要补,还没补)。
  5. **[样式]** `white-space: pre-wrap` 是产品自己加的(保住用户手打的换行),稿子没写。
     建议保留,但要写进决策——它会影响 #46 的 6 行裁切结果。

#### #46 `1-2` 超长消息 · 折到 6 行,文末留「…」

- **稿子**:`div.bub.mod-clamp > span.clip > (span.txt + button.more) `,气泡内再挂一行
  `div.msg-more > button 「查看全部」+ chevron`。
  - 折的是**里面那层 `.txt`**(`-webkit-line-clamp: 6`),不是气泡本身 —— 气泡有 9px 下内边距,
    直接折在气泡上第 7 行会从内边距里露半条字。
  - `.more`(那枚「…」)绝对定位贴 `.clip` 右下角,左侧垫一段 `transparent → var(--bub-bg)` 的
    26px 渐变把被压住的半个字化掉。
  - **只在真的被截断时才出**:`.bub.mod-clamp.is-cut .more`,`is-cut` 由 JS 量
    `txt.scrollHeight - txt.clientHeight > 1` 得出,并在 `resize` 与 `document.fonts.ready` 时重量。
  - 6 行 = 13px × 1.7 ≈ 22px × 6 ≈ 132px。
- **现在**:**完全没有**。`.user-text` 无 `line-clamp`、无展开入口,一条超长消息把整屏顶掉。
  (注:`styles/chat.css:378` 那处 `-webkit-line-clamp: 4` 是别的选择器,不作用于用户气泡。)
- **差在哪**:**[形态]** 从零加:双层 `clip/txt` 结构 + 溢出测量 hook(`ResizeObserver` +
  `fonts.ready` + `resize`)+ 渐变遮罩 + 展开态。这一格是组件 1 里最大的一块。
- **⚠️ 稿内不一致(必须先拍)**:说明文字(`cmp-ops`)写的是
  「hover 时「…」后面浮出一枚下拉箭头,点它看全文 —— **不再在气泡外面另挂一行按钮**」,
  但 DOM 和 CSS 注释都说箭头**已经去掉**、展开入口改成气泡**内部**的「查看全部」一行,
  `specs/current/chat-panel-next.md` 的 W7 也按「查看全部」记录。
  `components/chat/AGENTS.md` §6 的规矩是「以说明文字为准」,这一格三比一要反过来 ——
  **按 DOM/CSS/W7 做(气泡内「查看全部」),说明文字这一句已过时**。
- **[形态]** 稿子只画了「折起来」,**没画展开之后长什么样**(能不能再收起?收起按钮在哪?)。待补。

#### #47 `1-3` hover ·「…」后面浮出箭头,点开看全文

- **稿子**:DOM 与 #46 **逐字节相同**,只多一个 `is-hover` 类。
- **现在**:同 #46(没有)。
- **差在哪**:**⚠️ 这一格在稿子里是死的**。`.bub.mod-clamp.is-hover` 在样式表里**没有任何匹配规则**
  (全表只有 `.msg-row.is-hover .bub` 和 `.msg-row.is-hover .msg-act …`),
  而气泡内的「查看全部」是常驻的(`.bub .msg-more` 无 hover 门)。
  所以 #47 相对 #46 **没有任何可见差异**。
  → 实现上把 #46/#47 当**同一态**做;把这条回写进 `chat-panel-next.md` 待决表,请设计确认
  「折起来的长消息 hover 时到底变不变」。

#### #48 `1-4` 长链接 · 没有空格也要断开,不能冲出气泡

- **稿子**:`.bub` 明确 `overflow-wrap: anywhere`。CSS 注释点名:
  「凡是承载用户输入或外部数据的容器都要能断开:链接、token、路径、base64……
  用 `anywhere` 不用 `break-all`」。样例是一条带 `?from=…&token=eyJ…` 的飞书长链接。
- **现在**:`.user-text` 没有自己的换行声明,继承 `.msg { word-wrap: break-word }`
  (`styles/chat.css:487`)。
- **差在哪**:**[样式,但是真 bug]** `break-word` 与 `anywhere` 的差别正好落在这一格:
  `anywhere` 会把长串计入 **min-content 宽度**,`break-word` **不会**。
  `.user-text` 是 `align-items: flex-end` 的列 flex 项,宽度按 shrink-to-fit 算、
  下限是 min-content —— 于是一条不可断的长 URL 可以把气泡撑得比容器还宽。
  改法就一行:给用户气泡显式写 `overflow-wrap: anywhere`。
  **验收时必须真拿一条无空格长 URL 在窄面板里看**,别只看代码。

#### #49 `1-5` 失败 · 网络或服务异常

- **稿子**:`div.msg-me > .bub` 之后**并列**一个 `div.msg-fail`(右对齐,`gap: 5px`,
  `margin-top: 5px`,整行 `--red`,12px):`svg`(**刷新/重试**图标,14px)+
  `button aria-label="发送失败,重试"` 文案就一个词「重试」。
  - **不写「发送失败」四个字** —— 红 + 图标已经说了出事,而它挂在自己刚发的气泡下面,
    没有别的可能。
  - hover 不铺红底,只把前景压深(`color-mix(--red 70%, --text-strong)`);
    理由写在注释里:`--red` 在这层底上对比本就吃紧。
  - 点「重试」这一行自己**淡出并收掉占位**(`.is-sent` → `msg-fail-out` 动画 → `.is-gone` `display:none`),
    气泡一动不动;不在原地换成「已重发」。
- **现在**:**完全没有**。失败永远落在**助手侧**:`retryableAssistantMessage()`
  (`ChatPane.tsx:4481`)只认「最后一条是 assistant 且是可重试的终止失败」,重试按钮长在报错卡上
  (`ChatPane.tsx:2811` 一带,属于**组件 19 / 边界族**,不是本族)。
  用户消息本身 `persistMessage(userMsg)` 是 fire-and-forget(`ProjectView.tsx:6955` 一带),
  存不进去也不会有任何提示。
- **差在哪**:**[数据]** `ChatMessage` 上没有任何「这条没发出去」的字段
  (无 `sendState` / `failed` / `pending`),web 侧也没有失败重发的路径。见 §4-B。
- **⚠️ 稿内不一致**:CSS 注释写「只留**红色感叹号** + 重发」,DOM 里那枚 svg 是**刷新箭头**
  (与 #50 `.keep` 上那枚**完全同一条 path**,而注释又说两处「长得一样」)。
  两条注释互相打架时,DOM 自洽 → **按刷新图标做**,把这条记进待决表。

#### #50 `1-6` hover · 背景加深;时间与复制浮出,重试常驻

- **稿子**:换了个外壳 —— `div.msg-row`(`flex-direction: column-reverse; align-items: flex-end; gap: 4px`),
  子元素 `span.msg-act` + `div.bub`,靠 column-reverse 让操作位落在气泡**下方**。
  - `.msg-act` 里三样东西:`.tm`(12px,`--text-soft`,**不给按钮的 30px 命中框**)、
    复制按钮(30×30,16px 图标)、`.keep` 重试(`width:auto; padding-inline:6px`,
    13px 图标 + 12px/600 文字,红色,高度仍 30px)。
  - **重试常驻**;时间和复制 `opacity: 0 + pointer-events: none`,hover 才亮 ——
    **用 opacity 不用 display,位置一直占着,浮出时这一行不跳**。
  - 气泡底色 hover 时 `--bub-bg` 从 `--text-strong`(#202020)换成 `--text`(#494949)。
- **现在**:`.user-actions`(`chat.css:916`)也在气泡下方、也右对齐、也是 `opacity 0→1`
  (`.user-text-wrap:hover / :focus-within`),`@media (hover:none)` 下常驻。
  但里面**只有一枚复制按钮**(`.user-copy-btn`,padding 4px,13px 图标),
  **没有时间、没有重试**;气泡 hover **不变色**。复制点过会切成 ✓ 并 2s 后复原(稿子没画这一态)。
- **差在哪**:
  1. **[形态]** 缺「重试」常驻按钮 —— 依赖 §4-B 的发送失败数据。
  2. **[数据→其实有]** 缺时间。`createdAt` 已经在手,只是没渲染;格式按稿子是 `14:31`(HH:mm)。
  3. **[样式]** 复制按钮尺寸:30×30 命中框 + 16px 图标 vs 现在的 ~21×21 + 13px 图标。
  4. **[样式]** 气泡 hover 变色没有。
  5. **⚠️ 稿内不一致(顺序)**:说明文字写「复制 — hover 后点复制图标。**时间跟在复制后面**」,
     CSS 注释也写「时间排在复制之后 —— 也就是最右边」,`.msg-act .tm { margin-inline-start: 2px }`
     也印证时间不在头一个;但 DOM 里 `.tm` 排在**第一个**。
     按 AGENTS.md §6(以说明文字为准)→ **复制在前、时间在后(最右)**,DOM 那一格是旧的。
  6. **⚠️ 值与文案打架**:状态标题写「背景**加深**」,而 `--text-strong`(#202020)→ `--text`(#494949)
     在白底上是**变浅**。按值实现,记待决。
  7. **[形态]** 复制的「已复制 ✓」反馈稿子没画 —— 产品已有,建议保留并回报设计。

#### #51 `1-7` hover · 多行同理,复制仍在气泡下方

- **稿子**:与 #50 结构逐字节相同,只是气泡文字更长(换行两行)。用来证明「操作位在下方之后,
  单行/多行合并成同一种情况,不再需要那段按行高对齐的计算」。
- **现在**:同 #50,产品的 `.user-actions` 本来就在下方,这一点已经对齐。
- **差在哪**:与 #50 完全同一批差异,不额外新增。
  **实现时当作 #50 的回归样例**(单行 / 多行 / 带附件 三种都要看操作位不跳)。

#### ⚠️ 组件 1 的稿子缺口

`msg-me` 与 `msg-row` 在整份稿子里**从不同时出现**(`chat-panel-next.html` 里
`msg-me` 7 处 / `msg-row` 2 处;场景稿 `chat-panel-scene.html` 里**只有** `msg-me`,没有 `msg-row`)。
也就是说:
- 「一条**带附件**的消息 hover 时长什么样」(`.msg-stack` + `.msg-act`)**没有任何一格画过**;
- 「失败行 `.msg-fail` 与 hover 操作位 `.msg-act` 同时在场」也没画过。

产品里这两种组合都会自然发生。实现时必须先定一个统一外壳(建议:`msg-row` 吃掉 `msg-me` 的右对齐职责,
`msg-stack` 作为它的子项),并把这条回写进待决表。

---

### 组件 2 · 用户消息-附件(第 52–59 格)

先说这一族共用的**行容器**,九格都吃它:

> **稿子 `.att`**:`display:flex; flex-wrap:nowrap; gap:7px; max-width:412px;
> margin-inline-start:auto; overflow-x:auto; scrollbar-width:none`,
> 加 `.att > :first-child { margin-inline-start:auto }` 实现「少了贴右、多了从左滚」。
> 滚动条**藏起来**,靠**行尾把一张卡切在腰上**暗示还有更多 —— 412 = 6×64 + 28 是刻意错开卡片节拍算出来的
> (卡 57 + 缝 7 = 64;写 380 的话切点正好落在缝里,7 张卡看起来就是整整齐齐的 6 张,
> 「后面还有」一点痕迹都没有)。
> 另有 JS 现包的 `.att-wrap` + 两枚 `.att-nav` 翻页箭头(52px 宽、自带 46% 渐变压在内容上、
> 内嵌 24px 白圆片),**只在真的被遮住时才出**(量 `scrollLeft / scrollWidth / clientWidth`
> → `.is-prev` / `.is-next`),一次滚 `clientWidth * 0.8`(留两成重叠)。
>
> **现在 `.user-attachments`**:`display:flex; gap:3px; flex-wrap:wrap;
> justify-content:flex-end; margin-bottom:4px`。**会换行、无横滚、无翻页箭头。**

两张卡的规格:

> **稿子 `.att-i`(图卡)**:`width:57px`,`aspect-ratio:1/1`,`radius:12px`,1px 边,
> `overflow:hidden`,**不挂文件名**,`aria-label="预览 X.png"`,hover 只加深边框。
> **稿子 `.att-d`(文档卡)**:`width:180px`,`padding:9px 11px`,`gap:9px`,1px 边,`radius:12px`,
> 左侧 15px 文件图标 + 右侧两行:主名(12px,`--text-strong`,`.base` 可截 / `.ext` 永不截)
> 与体积(12px,`--text-soft`)。57px 见方不是挑的,是**文档卡的自然高度量出来的**,两卡同高。
>
> **现在 `.user-attachment`**:图和文档**同一张小药丸** —— `padding:4px 10px 4px 4px`,
> `background: var(--bg-fill-tertiary)`,`radius: 8px`,12px 字,`max-width:240px`,
> 里面是 `[序号徽标 14×14][12×12 缩略图或文件图标][文件名(尾部省略,max-width:106px)]`。
> **没有体积、没有 57px 缩略图、没有 180px 宽卡、多一个稿子没有的序号徽标。**

---

#### #52 `2-1` 发送后 · 图只有缩略图,不挂文件名

- **稿子**:`div.att > button.att-i × 2`,每个只有 `span.ph > span.mini`(缩略图),
  `aria-label="预览 首页.png"`。说明文字:「**点缩略图弹层看大图,多附件左右键切换**」。
- **现在**:两枚小药丸,**带序号 1/2**、**带文件名**、12px 缩略图;
  点击走 `onRequestOpenFile(baseName)` —— 是**在编辑器里打开文件**,不是弹层看大图;
  而且只有 `projectFileNames` 里有这个名字时才可点,否则 `disabled`。
- **差在哪**:
  1. **[形态]** 卡片形态整个换:57px 方缩略图,**去掉文件名、去掉序号徽标**。
  2. **[形态]** 点击语义换:打开文件 → **弹层看大图 + 左右键切换**。产品里已有的
     `.staged-preview-modal`(`ChatComposer.tsx:4035`,composer 侧)是最接近的原型,
     但它**没有左右切换、没有键盘导航**,而且不在消息侧。
  3. **[样式]** 卡间距 3px → 7px。
  4. **[形态]** 「文件不在 projectFileNames 里就禁用」这条产品规则稿子没有 ——
     稿子里附件永远可点。要么保留禁用并回报设计,要么改成始终可预览(缩略图 URL 本来就取得到)。

#### #53 `2-2` 文字 + 附件 · 最常见的一条,附件在上文字在下

- **稿子**:`div.msg-me > div.msg-stack > (div.att + div.bub)`。
  `.msg-stack`:`flex-direction:column; align-items:flex-end; gap:4px; max-width:412px`,
  且 `.msg-stack .att { max-width:100% }`、`.msg-stack .bub { max-width:380px }` ——
  **两条上限各管各的,右边界照样对齐**;壳子刻意不设 `width:100%`。
  样例里同一行既有两张图卡又有一张文档卡。
- **现在**:`.msg.user` 直接竖排 `.user-attachments` → `.user-text-wrap`,间距靠
  `.user-attachments { margin-bottom: 4px }`。顺序(附件在上、文字在下)**已经对**。
- **差在哪**:
  1. **[样式]** 缺 `.msg-stack` 这一层:现在附件行和气泡各自按 `.msg.user` 的
     `min(78%,560px)` 收缩,**没有 412 / 380 的双上限**,附件多时右边界会和气泡对不齐。
  2. 其余差异继承 #45(气泡)与 #52(卡片)。

#### #54 `2-3` 失败 · 重试

- **稿子**:`span.att-i.is-fail`(注意是 `span` 不是 `button`,整卡不可点)>
  `span.ph > button.rt`(整格铺满、居中、红色、14px 图标 + 12px/600 的「重试」两个字,
  hover 变 `--text-strong`)。**卡上不挂文件名**。
  `.att-i.is-fail` **本身没有任何样式**——不描红框、不改底色,只是把缩略图换成重试按钮。
- **现在**:**完全没有**。发送后的附件不存在失败态(附件是发送**前**上传好的,
  上传失败只出一行全局 `.composer-hint` 文本)。
- **差在哪**:**[数据]** 见 §4-A。渲染层的样子倒是现成的 ——
  `primitives/record.module.css` 的 `.shot.fail .retry` 与它像素级同源。
- **⚠️ 稿子缺口(spec 已登记为 S13)**:**文档宽卡(`.att-d`)的失败态没画**,重试按钮放哪没有说法。

#### #55 `2-4` hover · 浮出预览

- **稿子**:`button.att-i.att-ov`,卡右上角浮出 `span.act`:20×20、`radius:4px`、
  **深底浅字**(`background: var(--text-strong); color: var(--bg)`)、`--shadow-sm`,
  里面是 12px 的**眼睛**图标(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z` + `circle r=3`)。
- **现在**:**没有**。消息侧附件 hover 只有 `background` 变一档(`.user-attachment.openable:hover`)。
- **差在哪**:**[形态]** 新增 hover 浮层 + 眼睛图标 + 预览动作。
  与 #52 的弹层是同一件事的两半(hover 提示 + 点击行为)。

#### #56 `2-5` 文档 · 出不了预览的换一张更宽的卡

- **稿子**:两张 `button.att-d`,各 180px:
  `[15px 文件图标] [ .tx > .nm(.base + .ext) + .meta ]`。
  `.nm` 是 `display:flex; align-items:baseline`,`.base { min-width:0; overflow:hidden; white-space:nowrap }`,
  `.ext { flex:none }` —— **后缀永不被吃掉**。`.meta` 是体积(`12 KB` / `4 KB`)。
- **现在**:同一张小药丸,`Icon name="file" size={14}`,文件名尾部省略(`text-overflow: ellipsis`,
  max-width 106px)→ **后缀是第一个被吃掉的东西**;**完全不显示体积**。
- **差在哪**:
  1. **[形态]** 新增 180px 文档宽卡(双行:主名 + 体积),与图卡同高 57px、同一行。
  2. **[样式]** 文件图标 14px → 15px,颜色 `--text-soft`。
  3. **[数据→其实有]** 体积:`ChatAttachment.size` 已经在手,只差一个 `formatBytes`
     (仓库里目前没有统一的字节格式化函数,需要新写并进 `runtime/chat/`)。
  4. **[形态]** 「哪些文件算能预览」的判据不一致:产品 `looksLikeImage()`
     (`providers/registry.ts:3027`)只认 `png|jpe?g|gif|webp|svg|avif|bmp`;
     而稿子的 21-1 把 **`.pdf` 和 `.mov` 都渲染成 57px 方缩略图卡**
     (模拟器 `render-client.js` 的 `IMG` 正则也把 `pdf|mov|mp4|heic|sketch|fig` 算进去)。
     → **这条要拍板**:方卡的准入名单到底是哪一批后缀。

#### #57 `2-6` 图 + 文档 · 同一行,同高不同宽

- **稿子**:`att-i` / `att-d` / `att-i` 混排,靠 57px 同高咬合。
- **现在**:两种都是同一张药丸,天然同高但**都不对**。
- **差在哪**:无新增差异,是 #52 + #56 的组合验收样例。
  **实现时把它当「57px 这个数字对不对」的判据** —— 文档卡的自然高度
  (9 + 18 + 1 + 18 + 9 + 2 = 57)必须真的等于图卡边长,不能一个写死一个算出来。

#### #58 `2-7` 多附件 · 永远单行,超出横向滚动

- **稿子**:7 张图卡塞进 `max-width:412px` 的 `.att`,不换行、隐藏滚动条,
  **第 7 张被切在腰上**,再加 JS 包出来的两枚 `.att-nav` 翻页箭头。
- **现在**:`flex-wrap: wrap` —— **会换行**。5 张和 8 张的消息高度不一样,
  回看历史时消息块忽高忽低。
- **差在哪**:**[形态]** 这一格是组件 2 里最大的一块:
  1. `wrap` → `nowrap` + `overflow-x:auto` + 隐藏滚动条 + `margin-inline-start:auto` 的右对齐技巧
     (**不能用 `justify-content:flex-end`** —— 溢出内容会跑到左边滚不回去;
     也**不能用 `width:fit-content`** —— 稿子注释记着实测会算塌成 0);
  2. 412px 这个魔数要原样照抄并把推导写进注释,别顺手改成 380 或 400;
  3. 两枚翻页箭头是**新组件**:`ResizeObserver` + `scroll` + `resize` + `fonts.ready`
     四路重算 `.is-prev / .is-next`,渐变压在内容上,一次滚 80%。
     `chat-panel-next.md` 的「§1.5 变更」里明确记着这是 8/20 版**新增**的东西。

#### #59 `2-8` 文件名过长 · 省略号切在中间,末尾保留一个词

- **稿子**:`商品卡组件规格说明终稿-第三轮评审后.md` → `商品卡组件…评审后` + `.md`;
  `埋点.csv` 原样不截。规则(写在 `.att-d .nm .base` 上方注释里):
  **头留到放不下为止**(这是哪个东西)、**尾只留扩展名**(这是什么文件)、
  中间那截修饰词信息密度最低,省掉的就是它;中文留最后 2–3 字,拉丁留最后一个单词,
  `-v3` 这种版本尾巴算作一个词。
- **现在**:CSS 尾部省略(`text-overflow: ellipsis` + `max-width:106px`),
  **被吃掉的正好是扩展名** —— 稿子注释原话「对文件名是最差的一种截法」。
- **差在哪**:**[形态]** 中间省略在 CSS 里**没有对应写法**(`text-overflow` 只认两端),
  必须写 JS:按**整行宽度倒推预算**(行宽 − 内边距 − 其它子元素宽 − gap),
  然后对头段做二分,取「放得下的最长的那一版」。
  - ⚠️ **不能拿名字自己去试**:`.nm` 是 `flex: 0 1 auto`,名字一截短 `.nm` 跟着变窄,
    下次再量可用宽度就是缩过的值 —— 只会越截越短、永远长不回去(稿子里 `budgetFor()` 的注释)。
  - 稿子里 `midTrunc()` 只挂在**执行记录**的 `.tool .nm .fn > code` 上,**附件卡没接**;
    附件卡那三例「切好的结果」是手写在静态标记里的。所以附件侧的量法**要自己接一遍**。
  - `chat-panel-next.md` 的 **S12** 已经把它登记为待决(阈值没定、拉丁名没样例)。
    模拟器 `render-client.js` 用 `NAME_BUDGET=9` 的字数预算顶替,是从稿里三例反推的,
    **只能当过渡**,正式实现要按宽度量。
  - 截过之后完整名字仍要拿得到:`title` + `aria-label`。

---

### 组件 21 · 待发送附件(第 60–64 格)

与组件 2 **共用同一张卡**,发送前只多一个 hover 才出的「×」。
容器加 `.mod-tray`:`margin-inline-start: 0`(**不再右对齐,从左排**)、`max-width: none`。

> **现在**:`StagedRunContexts` 里的 `.staged-row`:`flex-wrap: wrap; gap:5px;
> max-height: min(108px,18vh); overflow-y:auto` —— **换行 + 纵向滚动**,
> 而且附件芯片和 plugin / workspace / skill / MCP / connector 芯片**挤在同一行容器里**。
> 图片芯片走 `.staged-chip--image-file`:44px 高、36px 缩略图、`radius:12px`;
> 其它走 22px 高的小药丸。每枚都常驻 `[序号徽标][内容][× 移除]`。

---

#### #60 `21-1` 发送前 · 输入框内待发,静止时不摆「×」

- **稿子**:`div.att.mod-tray > span.att-i × 3`(注意外层从 `button` 变成 `span`,
  卡本身不可点,可点的只有里面的「×」)。
  `button.del`:18×18 圆形、`background: var(--bg)`、1px 边、10px 图标、`--shadow-sm`,
  绝对定位在卡**右上角** `top:4px; inset-inline-end:4px`。
  **`opacity: 0`,只有 `.att-i:hover` / `.att-d:hover` / `.del:focus-visible` 时才亮 ——
  逐张出、不整排亮。**
  样例三张分别是 `首页.png` / `跨端适配检查清单.pdf` / `走查录屏.mov`,
  **三张都是方缩略图卡**(见 #56 的准入名单问题)。
  说明文字补充:「触屏没有 hover,一律常驻」。
- **现在**:`.staged-remove` **常驻**,14×14 方形无边框,在芯片**行内右端**(不是右上角浮标)。
- **差在哪**:
  1. **[形态]** 卡形态换成 57px 方卡 / 180px 宽卡(继承 #52 / #56)。
  2. **[样式]** 「×」变成右上角 18px 圆形浮标 + 阴影,**默认 `opacity:0`,逐张 hover 才出**,
     并要补 `@media (hover: none)` 常驻(说明文字明确要求)。
  3. **[样式]** 去掉序号徽标 `.staged-order`(稿子没有)。
  4. **[形态]** 容器从左排、不右对齐。
  5. **[形态]** **待发送附件应当自己占一个 `.tray` 容器**,不要和 plugin/skill/MCP 芯片混在
     同一个 `.staged-row` 里 —— 稿子的 `.composer > .tray` 只装附件。
     这条会牵动 `StagedRunContexts` 的结构。

#### #61 `21-2` 发送前 · 上传中,进度走在描边上,不另占一行

- **稿子**:`span.att-i.is-up`。做法:
  ```
  border-color: transparent;
  background: linear-gradient(var(--bg-subtle) 0 0) padding-box,
              conic-gradient(from var(--att-up-angle), …) border-box;
  animation: att-up-travel 1.4s linear infinite;   /* --att-up-angle: 0 → 360deg */
  ```
  配 `@property --att-up-angle { syntax:"<angle>"; initial-value:0deg; inherits:false }`;
  同时 `.att-i.is-up .mini { opacity: .45 }` 把缩略图压暗;
  「×」的 `aria-label` 换成「取消上传 X」。
  **⚠️ 关键:这是一圈匀速转的 conic 描边,是「在忙」的不定式指示,不是按百分比走的进度。**
  不需要逐字节进度数据。
  说明文字另加一条:**「这几秒发送键不可用」**。
- **现在**:**完全没有**。`uploadFiles()`(`ChatComposer.tsx:1885`)是原子的 ——
  `await uploadProjectFiles(...)` 成功之后芯片才 `appendOrderedStagedAttachments` 出现,
  上传中**界面上一张卡都没有**;只有一个全局 `uploading` 布尔喂给 `attachLoading`(加号菜单的 loading)。
  而且 `sendDisabled` **不包含** `uploading`(`ChatComposer.tsx:3398`
  `disabled={sendDisabled || !hasComposerPayload}`),
  → **上传期间发送键是可点的,点下去这批文件不会跟着发出去。** 这是稿子已经点名要修的一条。
- **差在哪**:**[数据]** + **[形态]**,见 §4-A。
- **⚠️ 稿子缺口(S13)**:文档宽卡的上传中态没画。

#### #62 `21-3` 发送前 · 文档同在一行,「×」位置不变

- **稿子**:`span.att-d` 与 `span.att-i` 混排。文档卡在 tray 里额外
  `padding-inline-end: 28px` 给「×」让位,`.att-d .del` 定位 `top:5px; inset-inline-end:5px`
  (图卡是 4px,因为两张卡的边框/内边距不同)。
- **现在**:同 #61 —— 文档芯片的「×」在行内右端,不是右上角。
- **差在哪**:**[样式]** 两种卡的「×」偏移值不同(4px vs 5px)+ 文档卡右内边距 28px。
  照抄,别统一成一个值。

#### #63 `21-4` 发送前 · 上传失败,重试或直接移除

- **稿子**:`span.att-i.is-fail` = #54 那张失败卡 **+ 一枚 `.del`**(「移除 规范.pdf」)。
  即失败卡上同时有「重试」(铺满卡面)和「×」(右上角浮标)。
- **现在**:**完全没有**。失败只出一行全局文本
  (`{uploadError ? <span className="composer-hint">…` ,`ChatComposer.tsx:3412`),
  文案是英文硬编码字符串(`Attachment upload failed for N file(s)…`),**没走 i18n**,
  也无法针对某一个文件重试。
- **差在哪**:**[数据]** + **[形态]**,见 §4-A。
  另外顺带记一笔:那两句英文硬编码文案不在本族范围内,但同一次改动会碰到,建议一起收进 i18n。

#### #64 `21-5` 发送前 · 附件多到装不下,一行横滚

- **稿子**:外面包一层 `div.att-demo { width: 406px }`,注释写得很直白:
  「这一格特意卡到 406px —— 460 面板里输入框的**净内宽**,量出来的。
  不卡宽度就看不见这一态:组件页的格子比输入框宽,再多几张也溢不出来。」
  里面 6 张卡(图/图/文档/图/文档/图)在 `.att.mod-tray` 里单行横滚。
- **现在**:`flex-wrap: wrap` + `max-height: min(108px,18vh)` + `overflow-y:auto` ——
  **纵向长高再纵向滚**,输入框高度会变。
- **差在哪**:**[形态]** 与 #58 同一件事,但方向相反(tray 从左排):
  单行 + 横滚 + 隐藏滚动条 + 翻页箭头(`.att-nav` 的渐变色变量 `--att-fade` 在两处底色相同,
  所以同一套箭头能直接复用)。
  **稿子给的验收方式要照做**:把陈列格宽度卡到 406px,否则这一态根本看不见。
  **收益是说明文字点名的那句「输入框高度因此是常量」。**

---

### 组件 23 · 选中文字 · 添加到对话(第 65–69 格)

这是本族里**唯一从零做**的组件。说明文字很长,几条硬约束先摘出来:

> - **只放一个动作**。不是工具栏,就是一颗按钮 —— 「复制」系统右键已经有了,
>   「更多详情」「到侧边提问」都是把明确动作稀释成选择题。
> - **贴边翻转**:选区在面板最上面时浮条翻到下方(和 tooltip 那套边界补正同理)。
> - **点完不直接发送**:芯片落进输入框,人还要补一句自己的话。
> - **是芯片不是引用块**:引用块会占掉写字的地方;选好几段时引用块会堆成一叠,
>   而芯片只是数字变,**一条和五条一样高**。
> - **全文和「×」都只在 hover 出现**。静止时它是一条状态,不是一个待办。
> - **浮出的全文和选中浮条用同一种深色磨砂** —— 两者都是悬在内容之上的临时层。

---

#### #65 `23-1` 默认 · 浮在选区上方,居中于选区

- **稿子**:`<mark class="sel">` 把选中的文字包起来,浮条 `<span class="selbar">` 挂在
  **`<mark>` 内部**(§1.5 记着这是 8/20 版的**结构变更**:「「添加到对话」条挪进 `<mark>` 内部」)。
  - `.sel { position: relative; background: var(--selected-soft); border-radius: 2px }`
    (`--selected-soft` = `color-mix(in srgb, #353535 12%, transparent)`,**产品 tokens.css:120 已有**)
  - `.selbar { position:absolute; left:50%; translate:-50% 0; bottom: calc(100% + 7px); z-index:6;
    padding:3px; radius:8px; background: var(--overlay-glass); border:1px solid var(--overlay-glass-edge);
    backdrop-filter: blur(var(--glass-regular-blur)); box-shadow: var(--shadow-md) }`
  - 按钮:`padding: 7px 12px; radius:4px; font-size:12px; font-weight:500;
    color: var(--overlay-glass-text)`,文案 **「添加到对话」**。
- **现在**:**完全没有**。全仓 `apps/web/src` 里没有任何针对聊天正文的
  `window.getSelection` / `selectionchange` 监听(只有 Lexical 编辑器内部的 `$getSelection`
  和 `edit-mode/bridge.ts` 里注入 iframe 的那一段)。
- **差在哪**:**[形态,新建]** + **[数据]**,见 §4-C。
  另有 **[样式]** 前置:`--overlay-glass` / `--overlay-glass-edge` / `--overlay-glass-text`
  这三个**深色磨砂**变量在产品 `tokens.css` / `material.css` 里**都不存在**
  (产品只有浅色系的 `--glass-regular` / `--glass-clear`)。
  按 `components/chat/AGENTS.md` §2,要新增 `--chat-overlay-glass*` 并**在亮暗两个作用域都定义**。
  设计值:`rgba(32,32,32,0.88)` / `color-mix(in srgb,#fff 16%,transparent)` / `#fafafa`。

#### #66 `23-2` 选区贴着面板顶边 · 浮条翻到下方

- **稿子**:同一结构,`.selbar` 加 `.mod-below`:`bottom:auto; top: calc(100% + 6px)`。
  (注意上下的间隙不对称:上方 7px,下方 6px。照抄。)
- **现在**:没有。
- **差在哪**:**[形态]** 需要一段边界补正:量选区 `getBoundingClientRect()` 与聊天面板顶边的距离,
  不够就翻到下方。产品里已有可参照的同类逻辑:
  `components/composer-flyout-placement.ts` / `composer-detail-position.ts`。
  **建议复用而不是新写一套。**

#### #67 `23-3` 点完之后 · 输入框里多一枚芯片,不占写字的地方

- **稿子**:`div.composer > span.refs + div.ta + div.bar`。
  `.refs`:`inline-flex; gap:5px; margin: 9px 9px 0; padding: 4px 9px; 1px 边; radius:8px; 12px 字`,
  内容依次是 `[13px 注释气泡图标][「1 条注释」][× 移除注释][.pop 隐藏的全文浮层]`。
  - **文案是「N 条注释」**,不是文件名、不是原文。
  - `.refs .del`:`position: static`(注意 —— 与附件卡的浮标不同,这枚是**行内**的),
    16×16,`opacity:0`,`.refs:hover` 或 `.mod-open` 时才亮。
- **现在**:`StagedCommentAttachments`(`ChatComposer.tsx:4074`)渲染
  **每条注释一枚 `.staged-chip.staged-comment`**,内容是 `<strong>{目标名}</strong>{注释文本}`,
  「×」常驻。位置在 `.composer` 内、输入框之上(**这一点已经对**)。
- **差在哪**:
  1. **[形态]** N 条注释 → **一枚芯片**(数量收进文案),而不是 N 枚芯片。
     这是说明文字里点名的核心诉求(「选好几段时引用块还会堆成一叠,而芯片只是数字变」)。
  2. **[文案]** 芯片文字从「目标名 + 注释内容」换成「N 条注释」。
     ⚠️ **语义要先拍**:产品现在的 `commentAttachments` 全部来自**预览 iframe 里的元素批注**
     (`selectionKind: 'element' | 'pod' | 'visual'`,见 `packages/contracts/src/api/chat.ts:753`),
     而稿子说的是**在回答正文里选中的一段话**。这两种东西要不要合并进同一枚「N 条注释」芯片,
     是产品要拍的一条。
  3. **[样式]** 「×」改成 hover 才出 + `position: static` + 16×16。
  4. **[样式]** 芯片有 1px 边框、`radius:8px`、外边距 `9px 9px 0`。
  5. **[形态]** 新增 `.pop` 全文浮层(见 #68)。

#### #68 `23-4` hover 芯片 · 上方浮出全文,右侧露出移除

- **稿子**:`.refs.mod-open`(演示用;真实是 `:hover`)。
  `.pop`:`position:absolute; left:0; bottom: calc(100% + 7px); z-index:7;
  width: max-content; max-width: 300px; padding: 9px 11px; radius:8px`,
  **与 `.selbar` 同一种深色磨砂**(`--overlay-glass` 三件套 + `backdrop-filter`),
  `opacity: 0 → 1` 过渡(**不是 display 切换**)。
  内容是一个 `<ol>`,`list-style:none` + `counter-reset` 手写序号
  (`li::before { content: counter(r) "." ; opacity:.6; font-variant-numeric: tabular-nums }`),
  `li + li { margin-top: 6px }`,`li { overflow-wrap: anywhere }`。
- **现在**:没有浮层。注释全文只塞在 `title` 属性里(原生 tooltip)。
  产品有一个 `ContextChipHoverCard.tsx`(46 行)+ `.module.css`,是**最接近的现成件**,
  但它服务的是别的芯片,材质是浅色。
- **差在哪**:**[形态]** 新增 hover 浮层。可以考虑把 `ContextChipHoverCard` 泛化,
  但**别直接改它** —— 它现在的消费方不该被深色磨砂波及。

#### #69 `23-5` 选了好几段 · 只是数字变,一条和五条一样高

- **稿子**:与 #68 逐字节相同,只是文案变「3 条注释」、`<ol>` 里三个 `<li>`。
  这一格存在的意义就是**证明芯片高度不随条数变**。
- **现在**:N 条 = N 枚芯片,`.staged-row` 会换行 → **高度随条数长**,正是稿子要反对的形态。
- **差在哪**:无新增,是 #67 的验收样例。
  **实现时把「1 条 / 3 条 / 10 条三种截图等高」写成断言。**

#### ⚠️ 组件 23 的稿子缺口

23-1 ~ 23-5 **全是发送前**的形态。「一条带注释的消息**发出去之后**长什么样」**一格都没画**。
产品现在有实现(`UserMessageImpl` 里的 `.user-attachment.staged-comment`,
只渲染 `selectionKind !== 'visual'` 的那些)。要么找设计补一态,要么明确沿用现状,
不要在代码里默默选一个。

---

## 3. 要改哪些文件

### 3.1 建议新建(本族落地)

按 `components/chat/AGENTS.md` §1 的四步分层:

| 文件 | 内容 |
|---|---|
| `apps/web/src/components/chat/UserMessage.tsx` + `UserMessage.module.css` | 组件 1 + 2(气泡、折行、hover 操作位、失败行、附件行) |
| `apps/web/src/components/chat/AttachmentRow.tsx` + `AttachmentRow.module.css` | `.att` / `.att-i` / `.att-d` / `.att-wrap` / `.att-nav`。组件 2 与 21 **共用**,靠一个 `tray` 布尔切换 |
| `apps/web/src/components/chat/AttachmentTray.tsx` | 组件 21 的薄壳(`mod-tray` + 逐张「×」+ 上传中/失败态) |
| `apps/web/src/components/chat/SelectionBar.tsx` + `.module.css` | 组件 23-1 / 23-2 浮条 |
| `apps/web/src/components/chat/RefsChip.tsx` + `.module.css` | 组件 23-3 ~ 23-5 芯片 + 深色磨砂浮层 |
| `apps/web/src/runtime/chat/attachment-name.ts` | 中间省略的宽度量法(#59);纯函数,可不启 jsdom 单测 |
| `apps/web/src/runtime/chat/format-bytes.ts`(或并入现有 format) | `12 KB` / `4 KB`(#56) |
| `apps/web/src/runtime/chat/clamp-measure.ts` | `is-cut` 的溢出测量(#46);纯函数 + 一个 hook |
| 对应 `apps/web/tests/components/chat/*.test.tsx` / `tests/runtime/chat/*.test.ts` | 断言行为 / ARIA / `data-testid`,**不断言 CSS 类名**(§5) |

### 3.2 必须改的**现有**文件(我没动,列给你)

| 文件 | 要做什么 | 阻塞什么 |
|---|---|---|
| `apps/web/src/components/ChatPane.tsx` | ① `export` `UserMessage`(:4658);② 最终把 `UserMessageImpl` 迁到 `components/chat/` | 独立挂载做视觉对照;整族落地 |
| `apps/web/src/components/ChatComposer.tsx` | ① `export` `StagedRunContexts`(:3790)与 `StagedCommentAttachments`(:4074);② 把附件从 `.staged-row` 拆进独立 `.tray`;③ `sendDisabled` 或 `disabled` 表达式(:3398)并入 `uploading`;④ `uploadFiles()`(:1885)改成逐文件状态机 | #60~#64;#61 那条「上传中能点发送」的真 bug |
| `apps/web/src/components/chat/ChatRoot.module.css` | 补 `--chat-bub-bg`(亮 `var(--text-strong)` / 暗 `var(--text)`,spec W1 已登记但未落)、`--chat-overlay-glass` / `--chat-overlay-glass-edge` / `--chat-overlay-glass-text`、`--chat-att-fade`。**亮暗两个作用域都要写** | #45 #50 #65 #68 |
| `apps/web/src/styles/chat.css` | 迁走并删掉 `.msg.user*`(499-545、825-950)、`.user-attachment*`(2905-2950)、`.staged-*`(2508-2760)。⚠️ `.staged-*` 还被 `styles/viewer/routines.css`(1662/1713/4118…)与 `styles/viewer/core.css:2864` 依赖,一起清 | 迁移收尾;不清会两套样式打架 |
| `apps/web/src/i18n/types.ts` + `locales/*.ts`(**19 个全补**) | 新键见 §3.3 | typecheck 直接红 |
| `packages/contracts/src/api/chat.ts` | 组件 1-5 需要用户消息的发送状态;组件 21 需要待发送附件的上传状态(见 §4) | #49 #50 #54 #61 #63 |
| `apps/web/src/components/chat/primitives/icons.tsx` | 补 `CloseIcon` / `FileIcon` / `CopyIcon` / `EyeIcon` / `CommentIcon`(路径直接从设计稿抽,见 §2 各格) | 全族 |
| `specs/current/chat-panel-next.md` | 把 §5 的六条稿内矛盾/缺口回写进待决表(AGENTS.md §6 要求) | 评审 |
| `apps/web/tests/components/chat/mirror-gallery.test.tsx` | 现在只覆盖执行记录(1-11 格)与理解段(12-27 格),输入族要新增 25 格 | 验收 |

### 3.3 需要新增的 i18n 键(19 个 locale + `types.ts` 全补)

现成可复用:`chat.copyPrompt` / `chat.copyDone` / `chat.openFile` / `chat.removeAria`。
`chat.record.retry` 属于执行记录族,**不要跨族借用**。

建议新键(措辞以设计稿逐字为准,别自己改写):

```
chat.input.viewAll          「查看全部」            (#46)
chat.input.expandFull       「展开全文」  aria       (#46 .more)
chat.input.sendFailedRetry  「发送失败,重试」 aria   (#49)
chat.input.retry            「重试」                (#49 #50 #54 #63)
chat.att.preview            「预览 {name}」 aria     (#52 #55)
chat.att.open               「打开 {name}」 aria     (#56)
chat.att.remove             「移除 {name}」 aria     (#60)
chat.att.cancelUpload       「取消上传 {name}」 aria (#61)
chat.att.prev               「看前面的附件」 aria    (#58)
chat.att.next               「看后面的附件」 aria    (#58)
chat.sel.addToChat          「添加到对话」          (#65)
chat.refs.count             「{count} 条注释」       (#67 #69)
chat.refs.remove            「移除注释」 aria        (#67)
```

---

## 4. 形态级风险(哪几格是重写)

### A. 待发送附件的**逐文件上传状态**(#54 #61 #63)—— 最大的一块

现状是**原子上传**:`uploadFiles()` 里 `await uploadProjectFiles(...)`,
成功之后才 `appendOrderedStagedAttachments`。上传中界面上一张卡都没有;
失败是一句全局英文 `composer-hint`,无法针对某个文件重试。

稿子要求的是**逐文件状态机**:`pending → uploading → ok | failed`,
每张卡各自显示 conic 描边、各自重试、各自移除,并且**上传期间发送键不可用**。

要动的:
1. 上传前先落一张**乐观占位卡**(拿本地 `File` 的名字/大小,图片可用 `URL.createObjectURL` 出缩略图);
2. `uploadProjectFiles` 现在是**按 `PROJECT_UPLOAD_BATCH_SIZE` 分批**的
   (`providers/registry.ts:2927`),整批失败会把同批 + 剩余全部标失败 ——
   要能把 `result.failed[]` 映射回具体那张占位卡(现在只有 `name`,同名文件会撞);
3. 单文件重试要能只重发那一个 `File`,所以本地 `File` 引用得留着;
4. `ChatAttachment` 需要一个**仅前端**的上传态(不要污染持久化契约,
   建议在 web 侧包一层 `StagedAttachment = ChatAttachment & { state, localFile? }`);
5. `sendDisabled` 并入 `uploading`。

**顺带修掉一个真 bug**:现在上传期间发送键可点,点下去这批文件不跟着发。

### B. 用户消息的**发送失败态**(#49 #50)—— 需要契约改动

`ChatMessage` 上没有任何「这条没发出去」的字段,web 侧也没有失败重发路径:
`persistMessage(userMsg)` 是 fire-and-forget,失败静默;
真正的失败永远归到**助手侧**的报错卡(`retryableAssistantMessage`,属组件 19)。

要落 #49/#50,得先回答:
- 「发送失败」到底指什么?(a) `POST /api/messages` 保存失败;(b) `POST /api/runs` 起不来;
  (c) 网络整个断了。三种的重试语义不一样。
- 这三种失败在**已有的报错卡(组件 19)**里是不是已经有归属?
  如果是,那 #49/#50 就和组件 19 **重叠**,需要产品裁一次「同一个失败到底显示在哪」。
  **建议:先拿这条去问设计/产品,别先写代码。**

### C. 回答正文取词(#65 #66)—— 全新链路

产品里没有任何针对聊天正文的选区监听。要新建:
1. 在 `AssistantMessage` 的正文容器上挂 `selectionchange` / `pointerup`
   → `window.getSelection().getRangeAt(0)`;
2. 把 Range 包成 `<mark class="sel">` **或**用 `getClientRects()` 画覆盖层。
   ⚠️ **稿子选的是前者**(§1.5:「「添加到对话」条挪进 `<mark>` 内部」),
   但正文是 **markdown 渲染出来的 React 树** —— 直接改 DOM 会被下一次 render 冲掉,
   流式期间尤其。这条**必须先做技术方案**,不能照着静态稿的结构直译;
3. 边界补正翻转(复用 `composer-flyout-placement.ts`);
4. 点击后把选中文本送进 composer 的注释列表 —— 这需要一个新的注释来源
   (现有 `ChatCommentAttachment` 全部是**预览 iframe 元素批注**,字段是
   `elementId / selector / pagePosition / htmlHint`,和「一段正文文字」对不上)。
   要么扩 `ChatCommentSelectionKind` 加一种 `'text'`,要么另起一条通道。**契约要先拍。**

### D. 附件行的单行横滚 + 翻页箭头(#58 #64)

`wrap → nowrap` 看着是一行 CSS,实际带着三块:
魔数 412 / 406 的推导、右对齐必须用 `margin-inline-start:auto`(踩过 `flex-end` 和
`fit-content` 两个坑,注释里都记着)、以及一个全新的 `.att-nav` 组件
(四路重算 `.is-prev/.is-next`)。**别当样式微调排期。**

### E. 中间省略(#59)

`text-overflow` 做不到,必须写按行宽倒推 + 二分的量法,还要绕开
「`flex:0 1 auto` 导致越截越短」的棘轮(稿子 `budgetFor()` 注释)。
且**阈值本身还是 S12 待决**。**建议先按宽度量把机制做对,字数预算只当 fallback。**

---

## 5. 需要设计 / 产品拍板的(全部来自稿子本身,不是我编的)

| # | 问题 | 出处 |
|---|---|---|
| 1 | #47(`1-3`)的 `is-hover` 在样式表里**没有任何匹配规则**,与 #46 无可见差异 —— 折起来的长消息 hover 到底变不变? | `.bub.mod-clamp.is-hover` 无规则 |
| 2 | #46 展开入口:说明文字说「hover 浮出箭头、不再在气泡外挂一行」,DOM/CSS/W7 说「气泡内『查看全部』一行、箭头已删」。**三比一,建议按后者**,但要设计确认 | cmp-ops vs DOM+CSS+W7 |
| 3 | #46 **展开之后**长什么样、能不能再收起 —— 一格没画 | — |
| 4 | #50 `.msg-act` 的顺序:说明文字与 CSS 注释都说「时间在复制之后(最右)」,DOM 里 `.tm` 排第一 | cmp-ops / CSS 注释 vs DOM |
| 5 | #50 状态标题写「背景**加深**」,而 `--text-strong`(#202020)→ `--text`(#494949)在白底上是**变浅** | 标题 vs 值 |
| 6 | #49 失败图标:CSS 注释说「红色**感叹号**」,DOM 是**刷新箭头**(且与 #50 重试同一条 path) | CSS 注释 vs DOM |
| 7 | 「能出预览」的后缀名单:产品 `looksLikeImage` 只认 7 种位图;稿子把 `.pdf` `.mov` 都画成 57px 方卡 | `21-1` DOM vs `registry.ts:3027` |
| 8 | 组件 2:附件「文件不在项目里就禁用点击」是产品现状,稿子里附件永远可点 | `UserMessageImpl` `openable` |
| 9 | 组件 23:稿子的「注释」是**回答正文里的一段话**,产品的 `commentAttachments` 是**预览里的元素批注**。两者要不要合并进同一枚「N 条注释」芯片? | `chat.ts:753` |
| 10 | 组件 23:**发出去之后**的注释长什么样,一格没画 | — |
| 11 | 组件 1:`msg-me` 与 `msg-row` 从不同时出现 → 「带附件的消息 hover」「失败行 + hover 操作位同时在场」两种真实组合无稿 | 全稿统计 |
| 12 | **S12**(已登记):文件名截断阈值未定、拉丁名无样例 | `chat-panel-next.md:673` |
| 13 | **S13**(已登记):文档宽卡的失败 / 上传中态没画,「重试」放哪没说 | `chat-panel-next.md:674` |
| 14 | `.user-text` 的 `white-space: pre-wrap`(保住用户手打换行)是产品自加,稿子没写;它会影响 6 行裁切的结果 | `chat.css:525` |

> 按 `components/chat/AGENTS.md` §6,以上矛盾**要回写进 `specs/current/chat-panel-next.md` 的待决表**,
> 不要在代码里默默选一个。本文只做记录,没有代写。
