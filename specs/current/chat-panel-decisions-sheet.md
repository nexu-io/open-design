---

# 待拍板清单 · 一页拍完(2026-08-25)

29 条待决全在这里,按**拍完能解开什么**排序。每条给我的推荐和「选另一条的代价」——
**推荐不是决定**,你们说了算;但如果某条你们没意见,直接说"按推荐"我就照做。

## 一、拍了就能接进产品的(2 条,最要紧)

| # | 问题 | 我的推荐 | 选另一条的代价 |
|---|---|---|---|
| **T19** | 有执行记录时,底下那行「已完成」还要不要显示?产品现在**不显示**(理由:状态已经在上面的壳里了);稿子是**两处都显示**——上面说过程,下面说"这轮到此为止" | **维持不显示** | 按稿子改会让每条回答多一行;好处是"这轮结束了"有个明确落点。改动很小,随时可回头 |
| **T13** | `<done/>` 这个分界标记**线上根本没人发** —— system prompt 里一个字都没有。现在靠兜底(清单全关 / 轮末抬升)在工作 | **写进 system prompt** | 不写就等于 D43 的主路径永远不生效,只有兜底在撑;兜底在"agent 从不发清单"时会把结论也收进壳里 |

## 二、卡着某个组件做不完的(6 条)

| # | 组件 | 问题 | 我的推荐 | 代价 |
|---|---|---|---|---|
| ~~**T12**~~ **已拍(2026-08-26)** | 下一步引导 | 稿子要"跟本轮相关的 3 条建议",而全仓**没有这个数据** —— 现在渲染的是固定工具目录 | ✅ 产品裁决:**固定目录不要了,改 prompt 让 agent 产出三条建议** | 已实现,落地细节见 `chat-panel-next.md` 的「T12 落地记」;遗留一条待定(投稿社区没有落点了) |
| **T14** | 报错卡 | 稿子三枚固定动作;产品现在**按错误码分流一枚主动作**。照搬是功能回退 | **保留分流,只对齐视觉** | 照稿子做会把"这个错该干什么"的判断丢掉,用户要自己猜 |
| ~~**T15**~~ **已拍(2026-09-03,细化)** | 升级卡 | 稿子阈值 $0/$5 且"$0 无法开始",与已定的"付费档余额 0 不拦"打架 | ✅ **拦截口径不变(余额 0 照发);但「提醒」和「拦截」是两件事** —— 见下面 T37 | 按稿子会拦住已付费的团队,是线上事故级别 |
| **T17** | 音频产物 | 波形和时长**契约里都没有** | **本期不做,标注待后端** | 硬做只能画假波形 |
| **T18** | Plan 卡 | 规格里两条自相矛盾:S9 要"胶囊浮在输入框上方",B17 要"钉住的清单退场" | **按 B17,清单退场** | 留胶囊等于同一份清单显示两处,正是这次要消灭的 |
| **T32** | 取词加入对话 | 现有注释契约装不下"一段正文文字"(字段全是预览 iframe 的元素批注) | **扩现有类型加一种 `text`** | 另起通道更干净,但 composer 的暂存/排序/发送/回显四处都要认第二种 |

## 三、我们已经做了某种选择,请追认或推翻(7 条)

| # | 现在的做法 | 为什么这么做 | 你们可能想改成 |
|---|---|---|---|
| **T11** | 「已回答」仍是**锁住的整张表单** | 稿子要收成一条陈述,但那会丢掉"我当时看到哪些选项" | 按稿子收成陈述(高度省很多) |
| **T26** | 用户消息时间**加回来了**,但改成 hover 才浮出 | 稿子画了它,而已合并的 PR #4515 是**特意删掉**的 | 尊重 #4515 完全不显示 / 按稿子常驻 |
| **T23** | 视觉方向卡面**只留预览图和方向名** | 稿子明令不挂描述、不画色板 | 把色板/氛围/参考名放回 hover 或详情 |
| **T25** | 非用户主动取消**一律不显示**那行字 | 证不出是用户按的就不说是,宁可不出也不谎报 | 给那几种取消各配一句话 |
| **T29** | 「已手动暂停」**一步不剩时也照样出** | D5 只说不显示步数,没说没剩余就别出 | 一步不剩时压掉 |
| **T31** | 托盘里的附件卡**可点** | 稿子画成不可点,但"点缩略图看大图"是现有能力 | 按稿子改成不可点 |
| **T16** | Queue 保留**「立即发送」** | 稿子换成了"引导对话",没人解释过新语义 | 按稿子换 / 两个都留 |

## 四、小事,顺手拍(5 条)

| # | 问题 | 推荐 |
|---|---|---|
| **T20** | 赞/踩选中时图标要不要填成实心 | 只换底色(稿子 DOM 就是这样,状态名与 DOM 打架) |
| **T21** | 产物卡的「导出」是直接下载还是开格式菜单 | 单格式直下、多格式才开菜单 |
| **T22** | 多产物时谁上大卡 | 都一样大 |
| **T24** | 重连那一行挂在流水里还是输入框上方 | 输入框上方(和队列同一区) |
| **T28** | 用户消息时间写死 24 小时制还是跟 locale | 跟 locale |
| **T30** | `.pdf`/`.mov` 走宽卡还是方卡 | 能出缩略图的走方卡,出不了的走宽卡 |

## 五、真实运行时才照出来的(3 条,后补)

这三条在陈列页和单测里都看不见 —— 是把真实回放跑起来、按帧连拍才照出来的。

| # | 问题 | 我的推荐 | 选另一条的代价 |
|---|---|---|---|
| **T34** | **一轮里会出现两个「已完成」的执行记录壳**:第一张是钉顶的,清单一到又多出第二张(D29 ① / ② 的必然结果)。真实页面上两个都收着、文案一模一样,读起来像重复了一次 | **第一张壳没内容时不渲染** | 保持现状读者会以为出了两次;两张合成一张则要改 D29 的分卡规则,牵动面大 |
| **T35** | **产物卡在真实聊天宽度下是个铺满整行的大灰块**,而且**既没有缩略图也没有文件名**,只有 hover 才浮出「发布 / 导出」两颗按钮 —— 静止时它不自我说明是什么 | **按稿子:固定两列,单产物只占半格;卡面补文件名** | 按容器自适应会和稿子的两列栅格分叉;不补名字则用户要 hover 才知道那是什么 |
| **T36** | **没闭合的 `<artifact>` 会把整段 HTML 原文倒进聊天**:剥离函数要求成对标签,遇到被截断的一轮就把 1.4 万字符当纯文本渲染,一条消息拉出一万多像素。**不是这次改版引入的**,老链路一样 | **剥离时容忍未闭合(从开标签一路吃到末尾)** | 维持现状则每遇到一次截断就刷屏;渲染成代码面板要新增一种形态 |

## 五之二、低余额提醒(2026-09-03 已拍,OPEND-2600)

QA 报的是「专业版余额 $1.79 发新任务,没有任何低余额提示」。逐行走过判定路径后确认:
**个人工作区在两个档位下都拿不到这张卡**,而且死因不同 ——

- **付费档**:`amr-balance-gate.ts` 的早退(`balance ≤ $2 && personal && modelId && !isFreeAmrPlan`)
  排在 `hard` / `soft` 两个分支**之前**,直接 `return allow`,`soft` 根本算不出来;
- **免费档**:`soft` 算得出来,但渲染端(`ProjectView` / `EntryShell`)那道 `isPaidAmrPlan(plan)`
  把它挡掉了。

团队工作区不受影响 —— 早退带 `scope.workspaceType === 'personal'` 这个条件。

| # | 裁决 | 依据 |
|---|---|---|
| **T37** | **「提醒」不等于「拦截」。** 订阅还在、钱包 $0 的用户**照发**(T15 的口径不变),但**要看到提醒卡** | 产品口述 2026-09-03:「余额为 0 或者不足时,即使是套餐档,还是要提醒的」 |
| **T38** | **免费档也要有卡片。** 渲染端的 `isPaidAmrPlan` 过滤删掉,低余额提醒对所有档位可见 | 产品口述 2026-09-03:「免费档也要有卡片的吧?」 |
| **T39** | `planMayFundRunOutsideWallet`(「有套餐 ⇒ 可能不烧钱包」)**保留,但只管硬拦那一档**,不再顺手吞掉软提醒 | T37 的直接推论:它压制提醒的那半边被推翻了,压制**硬拦**的那半边仍然对(没套餐=真的只有钱包) |
| **T40** | **软提醒不许拖慢运行(红线)。** 判定和出卡移出发送关键路径:用户点发送到 run 真正开始之间,**不因为软提醒新增任何 await**。硬拦那一档保持阻塞(否则拦不住) | 产品口述 2026-09-03:「运行前不能强阻塞模型运行,不能等什么余额接口返回了再开始运行,不能拖慢运行速度,这是红线」 |

⚠️ 曾经考虑过的一层「**跑完看余额降没降,烧了钱包才提醒**」的经验判据 —— **不做**。
它唯一的作用是*压制*套餐档的提醒,而 T37 正是「别压制」。

## 五之三、2026-09-03 当天口述裁决(T41–T46)

| # | 裁决 | 依据 / 代价 |
|---|---|---|
| **T41** | 「余额不足」的报错卡交给升级卡是**交接**,不是删除。升级卡**只有钱包补查读出数字时才画得出来**;读不出来就把白卡(充值 + 重试)还回来 —— 否则用户在一轮死在钱上的失败之后屏幕上什么都不剩 | `fb83ad2cc5` 自己的 commit message 就标注了这个洞;`e2e/ui/amr-run-failure-recovery.test.ts:118` 是 @critical,曾连绿五次后在此变红 |
| **T42** | **余额不足只要升级卡一张,不把「重试」加回来。** 充完值重新发一遍那条消息即可 | 产品口述:「这个就这样吧,就是 upgrade 卡片就够了」。⚠️ 代价:那一轮 agent 已做的活作废,不能续跑;`secondaryRetry` 的**判定**仍在,只是没有界面画它 |
| **T43** | tooltip 气泡**全站**按稿子改(圆角/内距/材质/边框/阴影/文字色/行高/间距 共 8 条),**但 `white-space: nowrap` 不采纳** | 现有最长 tooltip 202 字符(fr `fileViewer.publishSingleFileDescription`),12px 下约 1300px 跑出屏幕;另有多处挂**无上限的用户数据**(`workingDir`、`item.label`)。稿子那句注释说 tooltip 是给纯图标按钮起名的两三个字 —— **根因是那类长文案本来就不该在 tooltip 里**,属另一轮文案活。已加反向守卫测试防止后来人"顺手补完" |
| **T44** | tooltip 的 **100ms 淡入做重构让它真的发生**(portal 保持挂载 + 切 opacity + `aria-hidden` 挡读屏);**但激活式关闭(点击/回车/空格)是瞬时的**,只有 hover 移开才淡出 | ⚠️ 后半条不是可选的:导出截图 `captureExportImageSnapshot` **恰好等两帧**,而两帧时气泡还有约 24% 不透明 —— **淡出到一半的气泡会被印进导出的图里**。由 `file-viewer-screenshot-tooltip.test.tsx` 照出来 |
| **T45** | 图标描边**只改聊天面板**,扩充 `chat/primitives/icons.tsx`;**`Icon.tsx` 的全站默认 `strokeWidth` 和 remix 实心映射一个字不动** | 产品明确否掉全站改。面板外的调用点(`McpClientSection`、`DesignSystemSwitchPicker`、约 30 处 plus 等)一律不碰 |
| **T46** | 「新建对话」这个动作**面板内文案统一**成 **新会话 / 正在开始新会话… / 无法开始新会话**;**入口只留面板头那枚图标键**,下拉里那颗删掉 | 稿子自己不一致(面板头写「新会话」、回合动作行写「新开会话」),取「新会话」的依据是稿子 `body-components.html:1243` 的分隔线写着「**新会话**从这里开始」,动词由它给出。⚠️ **代价:两处原本可能是两个动作** —— 面板头是空开,Fork 是带着这条回复的上下文开(`body-components.html:1280`「以此为上下文新开会话」),统一之后这层区别在标签上不再表达。面板外的 `chat.newConversation` 不动 |

## 五之四、2026-09-03 当天后半程裁决(T47–T49)

| # | 裁决 | 依据 / 代价 |
|---|---|---|
| **T47** | **在跑的工具输出:执行中展开,跑完收起。**「同日未决」里那三个方向选 ① —— 而且**两种命令行都要**:有人话标题的(Claude 家族)和没有的(AMR / ACP 九家)统一成同一个折叠块 | 稿子 `body-components.html:1002-1021` 的 `cmp-meta` 逐字写着「执行中展开 → 完成收起」,三格样例(`:1010` 带 `open`、`:1014` 不带、`:1018` 失败带 `open`)对得上。我一度按直觉推荐了方向 ②(行上露 tail),是错的,产品翻出稿子指出这一格。<br>⚠️ **统一形态是产品口述裁决,稿子没画过**:全稿「执行 `<命令>`」单行只有 `:909` 一处,而那一处是**已完成态**(静态终端图标 + 结算过的 `8.4s`)。稿子会画进行中的单行(`:1037` 生图那条),所以不是「不画进行中单行」,而是专门没画过 exec 的进行中形态。第二条线索在同一行:`:909` 那颗按钮的 `aria-label` 逐字是「**查看 npm run build 的输出**」—— 稿子自己就把这一行的用途写成「看输出」,只是没画「看」之后长什么样 |
| **T48** | **`chat.forkedConversationTitle` 不再叫「{title} 分叉」,改成自增序号**:`标题 (1)`,已有 `(1)` 就用 `(2)`,依此类推 | 产品口述 2026-09-03:「生成的会话却叫『XXX 分叉』应该改成 (1) 这样的自增的会话名,如果 (1) 有了,就变成 (2)」,以及「老会话后续新 fork,就加一个 (1)」。⚠️ 中日文用不用全角括号**产品明确说先不管**,现全部用半角 |
| **T49** | **失败的文件行也要能下拉展开看报错原文**(与失败命令行同一个待遇)。**已落地** | 产品口述 2026-09-03:「能下拉展开吗?像这样」。⚠️ **有意偏离稿子** —— 稿子 `:917` 的文件类失败是单行 + 「失败」按钮,只有 `:1018` 的命令类失败是 `<details class="fold is-fail" open>`;call site 已写明这是口述裁决而非照稿。<br>**顺带关掉了 S1**:稿子那两种失败写法合成一支 —— 摘要恒是 `:917` 那一行(动词 + 文件名 + 「失败」+ 耗时),原文进正文,两支的差别只剩「有没有原文可给」。收起时看不到原因不是代价:失败行默认展开,原文一上屏就在,只是落在第二行 |
| **T50** | **自动展开只跟着「此刻真的在跑」走,不跟着「从来没回来」走** | T47 落地时 `lifecycleOpen` 读的是 `row.pending`,而它的定义是 `result == null`(「从来没回来过」)。用户按停止,那条在飞的调用永远等不到 `tool_result`,于是那一行**永远摊着**,以后每次重载这条老会话都还摊着。<br>⚠️ 修法**不是**在轮次终止时清掉 `row.pending`:行首那一格靠它分档,清掉等于给一次没跑完的调用画上跑完的工具图标(`closeRunningSegments` 的注释逐字:「标成完成是替 agent 说了它没说过的话」)。<br>实测结论:**只有 `canceled` 这一档在屏幕上看得见** —— `failed` / `error` 会把壳自己收起来,叠上 `deferBody` 里面一个节点都不挂 |
| **T51** | **升级卡没有「关闭」,也不做「本次会话不再提示」。** 余额条件成立就一直在 | 产品口述 2026-09-04:「它描述有问题应该,应该要继续显示的?」<br>OPEND-2597 的验收文案写着「关闭后本次会话不再重复提示」——**那是按弹窗写的标准套在了一张卡上**,大概率是早期还是弹窗时留下的措辞。现状不是弹窗:`ChatPane.tsx` 那段注释逐字是「**流水里的一张卡,不是弹窗**」,依据是 2026-08-26 的裁决「告警可继续的不弹窗,只有卡片;余额不足再弹窗」,而且它**不挡发送**(D4)。<br>⚠️ 与 T41 直接冲突,这是不采纳的硬理由:压掉卡片并不会改变余额,下一次运行照样死在钱上,而此时屏幕上又什么都不剩 —— T41 正是为了堵这个洞才写的。<br>它也不构成打扰:卡在流水里**随内容滚走**,不是钉住的横幅,本来就没有「挡着」这回事<br><br>⚠️ **2026-09-07 起适用范围缩小(T66)**:低余额那张卡整档撤掉了,本条现在只管硬拦档和「跑到一半死在钱上」那两张。 |

### 明确压后的(产品说「先不管」,不是遗漏)

- **英文动词时态**。`Read` / `Wrote` / `Edited` / `Searched` / `Ran` 整族都是过去式,而现在工具调用一发出行就落屏,所以**跑的过程中界面一直在说"干完了"** —— 一个 27.6KB 的页面写了 140 秒,那 140 秒里行上写着 `Wrote`。范围比最初描述的大,回头一起定。
- **中日文的括号全角 / 半角**(T48 的尾巴)。
- **没有工具事件的 8 家 runtime**(aider / antigravity / atomcode / deepseek / grok-build / qwen / qoder / cursor-agent)。产品原话:「那 8 家先放着,先把我们能支持的都支持到最完美的状态」。


### 同日未决(仍需产品拍板)

- **失败行还要不要出现「Failed」这个词**。`02605b1f01` 接通 `failReason` 之后走的是稿子「写法二」,屏幕上现在是 `Read missing.ts · File not found`,那个词不再出现。规格 S1 仍开着(挂在设计同学名下:两种写法是否有意区分)。
- **大格生图行加秒表是有意偏离稿子**。D34 这一档画的是「球 + 生成配套插图 2/4 + 一排大格」,没有耗时槽;2026-09-02 那次「pending 行要有耗时」的裁决只覆盖三类(思考中 / 工具行 / 步骤行)。按 2026-09-03「尽可能所有都有」补成第四类,待追认。
- **失败行还要不要出现「Failed」这个词** —— T49 落地后**它回来了**(摘要恒带稿子 `:917` 的「失败」标记),所以这一条实质已闭。但 S1 那句「两种写法是否有意区分」由我们**合掉**而不是由设计同学答的,值得设计同学过一眼。
- **短原因展开后会不会觉得空**。原文进正文之后,`File not found` 这种一句话的原因独占一个限高框。要不要给短原因保留行内那一份(代价:展开后同一句话出现两遍),归产品。
- ~~**升级卡的出现阈值:$2 还是 $5**~~ → **已拍板:$2**(产品 2026-09-04,原话「然后是 $2」)。工单 OPEND-2597 与交付稿第 75 格标题写的「额度 < 5 美金」**作废**;代码 `amr-balance-gate.ts` 的 `AMR_LOW_BALANCE_WARN_USD = 2` 是对的,`tests/runtime/amr-balance-gate.test.ts:172` 那条把 2 钉死的判据保持不动。`chat-panel-edge-audit.md:238` 那条「$2 → $5 待产品同意」随之关闭 —— **不要**再提这个改动,理由是它会放大触发面。
- ~~**Home 那张旧弹窗的「不再提醒」会不会把升级卡一起关掉**~~ → **已拍板:拆掉这颗 opt-out**(产品 2026-09-04,原话「拆掉吧」)。会。`AmrLowBalanceDialog` 勾选后写 `open-design:amr-low-balance-warn-optout:v1`,而项目页发送前那道闸门的 soft 档读同一个位(`amr-balance-gate.ts:381`、缓存快路径 `:402`),读到就返回 `allow` —— 用户以为关的是首页那个弹窗,实际把项目页的升级卡也永久静音了。影响面限于 **soft 档**(硬拦不受 opt-out 约束,`:146` 注释如此)和**发送前**那道闸门(跑到一半那条路不读这个位)。与 T51「升级卡不该有关闭态,余额条件成立就一直在」直接冲突,故整颗拆除。
- **`onShowFailure` 现在没有生产调用点**。`ToolRow` 定义了这个回调,但全仓没人传,`failButton` 一直走的是 `<span>` 回落分支。它原本要干的事(点一下看原因)T49 已经在行内做了。**没删** —— 是个没接线的扩展点,删它属另一轮。

## 五之五、2026-09-06 口述裁决(T52–T53)

| # | 裁决 | 依据 / 代价 |
|---|---|---|
| **T53** | **软提醒弹窗 `AmrLowBalanceDialog` 整个删除;软那一档只保留交付稿那张对话内升级卡。首页在这一档什么都不显示,直接放行。**<br>三个界面的终态:<br>· **项目页**(`ProjectView.handleSend` → `ChatPane` 的 `UpgradeCard`)—— 不变,本来就是这张卡,不挡发送(D4)<br>· **首页**(`EntryShell.handlePluginLoopSubmit`)—— **什么都不显示,直接建项目跑起来**。`soft` 这一档在提交路径上**故意没有分支**,落下去就是行为本身<br>· **硬拦档**(= $0,`gate.kind === 'hard'`)—— 不变,仍是带插画的 `AmrBalanceDialog`(无账单权限那一支仍走 `AmrOwnerTopUpDialog`) | 产品口述 2026-09-06:「**软提醒弹窗就是产品告诉我不要这个的,只用弹那个插画的就行**」;首页那一档追问后原话「**什么都不显示,有余额就允许运行**」。<br>⚠️ **这是软弹窗去留的第一次书面裁决。** 此前 `UpgradeCard.tsx` 的注释写着「那个的去留另记(见规格 T40)」—— 那是个**断指针**,T40 讲的是「软提醒不许拖慢运行」,和去留无关;`docs/design/chat-mirror/mirror-exec.html`(经 `mirror-gallery.test.tsx` 的 notes 生成)里复制了同一个坏指针。本次一并改掉。<br>⚠️ **代价:首页在 $0–$2 之间彻底静默。** 用户在首页发起的任务可能跑到一半因余额耗尽而停,事前没有任何提示 —— 产品知情并接受(「有余额就允许运行」)。<br>⚠️ 2026-08-26 的 D-01(`run-error-catalog.md:303`)只把软档的弹窗→卡片改在了 `ProjectView` + `ChatPane`,**落点栏没点首页**;所以首页保留弹窗至今不是漏做,是从没被覆盖过。<br>**遗留未清**:埋点 source `chat_low_balance_warn_recharge` / `home_low_balance_warn_recharge` 现在都是死值,但它们在 `packages/contracts` 的 `TrackingAmrEntrySource` 联合类型里,且 `apps/web/src/analytics/amr-attribution.ts` 的 `ENTRY_PAGE_BY_SOURCE` 是 `Record<TrackingAmrEntrySource, …>` 穷举映射 —— 删它要动跨包分析契约 + 重建 contracts dist,牵连面大于收益,**留着并记在这里**<br><br>⚠️ **2026-09-07 前半被 T66 推翻**:项目页那张低余额卡也撤掉了,两个界面拉齐成「什么都不显示」。后半(首页静默放行)继续有效,并且现在是全局口径。 |
| **T52** | **升级卡软档的阈值取 `< $2`,不采纳交付稿的「< 5 美金」。** 这是**对交付稿的有意偏离**,记在这里以免后来人以为是漏改。<br>· 交付稿:`docs/design/chat-panel-next.html`(git ref `729fa43ce7`)组件 **18 · 升级**,`cmp-meta` 逐字写「出现时机 额度 &lt; 5 美金 / 额度 = 0 美金」,第一格状态标签逐字写「额度不足 · &lt; 5 美金」。<br>· 代码取值:`AMR_LOW_BALANCE_WARN_USD = 2`(`apps/web/src/runtime/amr-balance-gate.ts`),硬拦那一档 `AMR_HARD_BLOCK_BALANCE_USD = 0` 与稿子的「额度耗尽 · = 0 美金」一致,只有软档这一条偏离 | 产品口述 2026-09-06:「**&lt;2 就行,不用管设计稿的 5 美金**」。<br>⚠️ **产品没有给出依据**,这里不代为补写理由。<br>这是 2026-09-04 那次「已拍板:$2」的再次确认(见下方「同日未决」里已划掉的那一条),两次结论一致<br><br>❌ **本条已于 2026-09-07 整条作废(T66)**:软档撤掉了,阈值常量 `AMR_LOW_BALANCE_WARN_USD` **已删除**(不是归零)。交付稿「额度不足 · &lt; 5 美金」这个状态我们不再实现。 |

## 五之六、2026-09-06 下半场口述裁决(T54–T57)

四条都出自同一次口述。权威源是产品文档第四节「四、升级情况」
(`https://powerformer.feishu.cn/docx/VtOwd4ON2oYZj0xd6OTceubcnDe`,
读法 `lark-cli docs +fetch --doc "<URL>" --scope section --start-block-id KLeXdGi42o6DSIxoOF7cHB5Qnfd --as user --doc-format markdown`)。

| # | 裁决 | 依据 / 推翻了什么 / 代价 |
|---|---|---|
| **T54** | **通用「升级」入口改跳「当前 profile 的 console 套餐页」**:`<console origin>/dashboard?source=open_design&billing=plan`,不再跳写死的公开 Pricing。<br>落地在 `apps/web/src/runtime/amr-guidance.ts`:复活 `AMR_CONSOLE_UPGRADE_INTENT = 'plan'`,`amrPlansUrlForProfile` / `amrPlansUrlForWorkspace` 改走 `amrConsoleUrlForProfile`,常量 `OPEN_DESIGN_PRICING_URL` 随之删除(它已无生产消费者)。origin 复用现成那条通路(daemon `/api/integrations/vela/status` → `setRuntimeAmrConsoleOrigin`),**没有造第二份**。 | 产品口述 2026-09-06。<br>⚠️ **这是推翻既有裁决,不是补 bug。**<br>· **#7122**(`feat(web): add Go campaign entries and route upgrades to Pricing`,2026-08-20 合并)原始理由逐字:「The confirmed Go launch flow uses public Pricing as the single comparison surface」,「Generic Upgrade / View plans actions across account, model, balance-gate, artifact, and settings surfaces now open Pricing」。这是 **Go 套餐上线时的信息架构选择**,不是技术约束。它同时删掉了 `AMR_CONSOLE_UPGRADE_INTENT` 和 `amrWorkspaceUrl` 的 `intent` 参数。<br>· **#7167**(`fix(pricing): align Go plan launch experience`)是 #7122 的**视觉/文案对齐续做**(Pricing 卡片几何、账单文案、Team 内容、模型插画、活动时间),对本条**没有独立理由**;它碰 `EntryNavRail.tsx` 只是活动入口位置。<br>· **#5459 与本事无关。** 它是 `fix(daemon): preserve data dir for media wrapper env`,只改了 `apps/daemon/src/server.ts` 和一个 daemon 测试。原注释把它列进来是**错误引用**,本次一并清掉。<br>**没有发现硬理由**(逐条核过):① 未登录**不会 404** —— `/dashboard` 在 vela `App.tsx` 里挂在 `AppShell` 下,`app-shell.tsx` 对无 user 只是 `return <>{children}</>`,没有 `Navigate to="/login"`;而且这条路径**就是现在已经在线的充值链接的同一页**,只是多一个 query。② `billing=plan` **是 B 认得的两个意图之一**(vela `apps/web/src/routes/team-dashboard.tsx:871-880`);它的 `ownerBillingActionsAvailable` 守卫不成立时只是**不弹**那个对话框,人仍然落在 dashboard —— 退化成今天的行为,不是报错。③ 不需要额外的 workspaceId 才能开页;`amrPlansUrlForWorkspace` 带上的 `workspaceId` 是加分项,vela `apps/web/src/lib/workspace-selector.ts` 确实读它。<br>**这条同时修掉一个真缺陷**:`amrPlansUrlForProfile(_profile)` 的参数带下划线前缀、刻意不用,所以 test / local / feature-test 的包**一律跳生产 Pricing**,而那页选中套餐会带着 plan + interval 回**生产** Vela 直接结账。<br>⚠️ **与产品文档第四节的「跳转页面」栏冲突**:该栏第一行写的是「跳转 Pricing」并配了公开 Pricing 页截图。本条按 2026-09-06 的口述裁决执行(时间更晚),**冲突记录在此,请产品确认文档是否同步修订**。<br>顺带改正:`AmrBalanceDialog.tsx` 顶部注释说主按钮走 `billing=checkout` 深链 —— 那在 #7122 之后就不成立了,已改。 |
| **T55** | **余额四格矩阵管个人工作区:个人版付费档余额 $0 也要硬拦。**<br>`amr-balance-gate.ts` 的让位判据从「有套餐 ⇒ 让位」改成「**档次读不出来 ⇒ 让位**」:`planMayFundRunOutsideWallet`(`!isFreeAmrPlan(...)`)删除,换成 `amrPlanTierUnreadable`(`resolveAmrPlan(...) == null`)。`isFreeAmrPlan` 因此没有生产消费者,一并删除(否则它会以「free 还是那个轴」的名义把老逻辑招回来)。 | 产品口述 2026-09-06:「矩阵管个人工作区,所以这是 bug,要修」。产品文档第四节的「用户身份」栏**逐行列的是 Free/Basic/Plus/Pro 和 Max**,即所有档位在 $0 都看拦截档的呈现 —— 文档与口述一致。<br>**缺陷形状**:`isFreeAmrPlan` 只精确匹配 `'free'`,连 `'basic'` 都算「非 free」,于是个人版 Basic/Plus/Pro/Max 在 $0 落到 soft 档,**四格弹窗一张都不出,只剩那张卡**。<br>⚠️ **推翻 T15 / R-010 / #7190「付费档余额 0 = 不限量,不拦」**,以及 `cf00c80bd1` commit message 里那句「an empty wallet is the normal state on an unlimited plan」。<br>✅ **`cf00c80bd1` 的另一半原样保住**:「套餐读不出来时放行,由远程兜底」(用户原话「放,具体由远程兜底」)。这两件事此前被同一个谓词管着,本次拆开 —— 读不出来 → 放行(**保留**),读出来是付费档 → 放行(**推翻**)。<br>⚠️ **口径同时覆盖无 scope 的旧账号路径**(`checkAmrBalanceGate(undefined, …)`)。谓词只有一个,两条路共用;不一起改会变成「同一个人、同样的 $0,项目绑了工作区就拦、没绑就放」。这一步**超出了缺陷描述的字面范围**,记在这里以便回退。<br>⚠️ **代价**:个人版 Max 用户 $0 时不能再靠套餐额度直接开跑,必须先充值或升级。这是这次改动风险最大的一格,**只有真机能确认它在生产上的实际影响**。<br>被改写的既有测试:`amr-balance-gate.test.ts`(付费档 $0 的一组「reverse controls」,原标题 `still never blocks…`)、`w116-amr-low-balance-all-tiers.test.ts`($0 那三组;$1.79 那几组一字未动,它们才是那个红测真正要防的缺陷)。 |
| **T56** | **「找所有者充值」弹窗改用产品稿正式文案,并删掉「复制请求」那颗主按钮及其复制逻辑**(连同那块「可以直接发给所有者的话」的引文与 `.request` 样式)。终态只剩 标题 / 正文 / 「知道了」三件。 | 产品口述 2026-09-06,原话「**不要保留,严格按产品稿,不要私自发挥**」。文案取自产品文档第四节第 2 / 4 行,逐字。<br>⚠️ **代价:这一档回到单出口。**「复制请求」当初是 §6.Y 那个死胡同的出口 —— 在它之前,没有账单权限的成员看到的是 `AmrBalanceDialog`,而那张弹窗的主按钮取自 `workspaceUpgradeUrl`(对这类成员返回 `null`),于是弹窗上**只剩一颗「暂不需要」**。删掉之后,这一档能给的只有「该找谁」,不再替他把话写好。**产品知情并明确要求**(原话在上)。<br>说明:我们原来那份是**有授权的临时文案** —— §6.V 逐字写「文案由研发拟,产品复核」,`run-error-catalog.md:487` 写「待产品复核」,「找管理员 + 复制请求」是 §7 Q-04 列出的候选之一。所以本次是**正式文案替换临时文案**,不是推翻设计。<br>i18n:`chat.amrBalanceOwner.requestTemplate` / `copyCta` / `copiedCta` 三个 key 从 `types.ts` 和 19 个 locale 一并删除。<br>被改写的既有测试:`ProjectView.amr-balance-branches.test.tsx` 那条「成员的弹窗上不能只有一颗『暂不需要』」—— 判据从「按钮数 > 2」改成「按身份出对的那张弹窗」。 |
| **T57** | **Owner 名字拿不到时的降级文案(产品已批),做成两个变体、两个 i18n key。**<br>拿得到:`chat.amrBalanceOwner.message`(带 `{name}` 插值)。<br>拿不到:`chat.amrBalanceOwner.messageNoOwnerName`。<br>组件新增 `ownerName?: string \| null` 属性,`trim()` 后为空就走降级那条。 | 产品已批,两句逐字不许改。**原则是最小偏离** —— 只把插值那一处换成角色名,其余逐字相同。<br>**为什么现在一定走降级那条**:契约里唯一的 owner 名是 `CollabProject.ownerDisplayName`(`packages/contracts/src/api/collab.ts:158`),**项目级**,而且它自己的注释逐字写着 "STUB: the real name source is B's member roster";`WorkspaceCollabContext` 上**没有**工作区 owner 名。所以两个调用点(`ProjectView` / `EntryShell`)都不传,后端补上名字来源后接上即可自动生效,不用再动文案。<br>19 个 locale 全部落齐(缺一个 typecheck 就报错)。**中文是产品原件、逐字照抄**(含全角标点);其余 18 个是它的忠实翻译,`「{name}」` 按各语言习惯换成当地引号。 |

### 这一轮明确**不做**的

- ~~**第 3 格(Max × Owner)加不加转化弹窗 —— 没碰。**~~ → **已拍板,见下方 T58。** 原措辞说「三份权威源说法不一致,产品还在想」,并把现状(`amrBalanceBlockedDialog` 对那一格返回 `null`)保持原样。2026-09-06 产品给出终态:**出转化弹窗**,主按钮跳自动充值。那三份「不一致」里有一份是误读,见 T58 的更正栏。

## 五之七、2026-09-06 余额矩阵第三格终态(T58)

权威源同 T54–T57:产品文档第四节「四、升级情况」
(`https://powerformer.feishu.cn/docx/VtOwd4ON2oYZj0xd6OTceubcnDe`)。

| # | 裁决 | 依据 / 更正 / 代价 |
|---|---|---|
| **T58** | **Max × Team Owner(第 3 格)余额耗尽时出「会员转化弹窗」+ 升级 banner,点 Upgrade 在浏览器打开 vela dashboard 并唤起自动充值弹窗。**<br>那张弹窗**和第 1 格(非 Max × Owner)是同一张,文案一字不差** —— 所以**没有新文案、没有新 i18n key、没有新组件**。两格唯一的差别是主按钮的落点:第 1 格 `billing=plan`(T54),第 3 格 `billing=auto-recharge`。<br><br>**落地**:① `amr-balance-branch.ts` 的 `amrBalanceBlockedDialog` 不再返回 `null`,`AmrBalanceBlockedDialogKind` 的 `null` 那一支**整个删除**(留着它只会让每个调用点继续背一条 `?? 'upgrade'` 兜底);新增 `amrBalanceDialogUpgradeIntent`,与卡上那颗共用 `amrBalanceUpgradeIntent` 这一个决策点。② `AmrBalanceDialog` 新增可选属性 `upgradeIntent`(默认 `pricing` = T58 之前的行为),`auto_recharge` 时主按钮取 `workspaceAutoRechargeUrl`,拿不到就退回套餐页(权限位比账单严一格,少一个功能好过一颗死按钮)。③ `ProjectView` / `EntryShell` 在**拦截发生的那一刻**用同一个 branch 快照同时算出 `dialog` 和 `upgradeIntent`,不在渲染时再算。 | 产品口述 2026-09-06 + 产品文档第四节第 3 行的截图。<br><br>⚠️ **顺带更正一条被当成产品文案的机器描述。** 此前记录里引用过第 3 格「未达到 $100.00/月的额度」那句话 —— **那不是产品文案**,是飞书文档导出时 AI 为那张截图自动生成的**图片 alt 描述**。**以图为准**:截图上写的和第 1 格一字不差(`Upgrade to keep creating` / `Not enough allowance ($0.00 left)…`)。凡是照着那句话推出来的结论(比如「第 3 格要另写一套文案 / 另做一个组件」)一律作废。<br><br>⚠️ **推翻了两处既有记录**:① `run-error-catalog.md` §6.V 第 3 行的弹窗栏写的是「——」(不弹窗),`amr-balance-branch.ts` 原来的注释表格照抄了它;② 本文件「五之六 · 这一轮明确不做的」那一条。**§6.V 尚未同步修订**,冲突记录在此(与 T54 同一处理方式)。<br><br>✅ **链路的另一半在同一天通了**:vela **#1900**(`feat(billing): open auto-recharge settings from a dashboard deep link`)**已于 2026-09-06 合并**,`?billing=auto-recharge` 现在会真的弹出自动充值设置弹窗,不再只是落在拥有该设置的那一页上。我们这侧发出去的参数**不用改**;`amr-guidance.ts` 里那段「⚠️ UNCONFIRMED ON B」的注释已按事实改写。<br><br>⚠️ **代价 / 只有真机能确认的一格**:Max 档**在 prod 造不出来**(`chat-panel-feedback.md` E5 早已记着这一点 —— 真机只验得了 owner/member 两轴)。所以第 3 格今天**只有单测覆盖**:纯判据层 `tests/runtime/amr-balance-branch.test.ts`、项目页 `tests/components/ProjectView.amr-balance-branches.test.tsx`、首页 `tests/components/EntryShell.amr-balance-branches.test.tsx`(本次新增,首页此前没有分支矩阵覆盖)。**「弹窗真的弹出来了、按钮真的把浏览器带到了自动充值面板」这一步需要一个真 Max 账号在真机上走一遍。**<br><br>**被改写的既有测试**:`amr-balance-branch.test.ts` 与 `ProjectView.amr-balance-branches.test.tsx` 里那三条「Max · owner **不弹窗**」—— 判据从「弹窗必须不存在」翻成「弹窗必须存在,且主按钮指向自动充值」。反向对照同批加固:第 1 格的**弹窗按钮**也断言了 `billing=plan`(此前只断言卡),admin/member 四组仍走 `AmrOwnerTopUpDialog` 且不外跳。 |

## 五之八、交付稿自相矛盾时以渲染为准(T59)

| # | 裁决 | 依据 / 更正 / 代价 |
|---|---|---|
| **T59** | **交付稿的标注文字与它自己渲染出来的 DOM 打架时,以 DOM 为准。** 首次适用:**组件 18 · 升级卡不显示用量条**,只显示「剩余额度 $X.XX」这个数字。 | 产品口述 2026-09-07,原话「**对的以 dom 为准**」(确认「DOM 里」指的是交付稿那份可运行 HTML 的实际渲染结果,不是标注文字)。<br><br>**稿子自相矛盾,矛盾在两处**(git ref `729fa43ce7`,`docs/design/chat-panel-next.html`):<br>· `:5739` 组件 18 自己的 `cmp-meta` 逐字写「**展示**当前用量与受影响的能力」<br>· `:5585` 组件 15(回复动作行)的说明在解释「这里不报用量」时,把用量的归属指给了 18,逐字写「那有 18 · 升级专管(**剩余额度 + 进度条** + Upgrade)」<br><br>**自洽的那一半是 DOM + CSS**:<br>· `:3337` 稿子自己的 CSS 注释逐字写「保留旧刻度样式,**当前额度卡不显示刻度**」<br>· `class="meter"` 在**整份稿子的 DOM 里出现 0 次** —— `.up .meter` 那几条样式留着但没有任何节点用它<br>· 组件 18 那张卡的实际 DOM(`:5702` 起)是:`剩余额度 <b>$3.20</b>` + 一句 `why` + 一颗按钮,**没有任何条状元素**<br><br>**所以两条说明文字是过期描述**,不是我们漏做。稿子里那条 `.meter` 样式就是它自己留下的物证:曾经有过刻度,后来去掉了,样式没删、两处说明也没跟着改。<br><br>⚠️ **这条是通则,不只管这一格。** 交付稿是一份**可运行的 HTML**,标注文字是写给人看的旁白,渲染结果才是它自己执行出来的东西 —— 二者打架时旁白更可能过期。**但通则不等于可以自行发挥**:发现打架要在这里记一条,不能默默按 DOM 做完就算(否则和「照着标注做」一样不可追溯)。<br><br>**同处顺带核对**:`:5739` 同一句还写着「**关闭** — 本次会话不再提示」,那一半已由 **T51** 单独推翻(升级卡没有关闭、也不做本次会话静音)。两条裁决方向一致 —— 组件 18 的这段 `cmp-meta` 整体不可靠。 |

## 五之九、余额族归交付稿管,不跟新文案文档(T60)

| # | 裁决 | 依据 / 证据 / 代价 |
|---|---|---|
| **T60** | **余额 / 额度 / 充值 / 升级这一族的文案与形态,权威源是交付稿组件 18,不是产品 2026-09-06 那份《报错文案｜精简版》。** 该族在本次文案对齐中整族剔除。 | 产品口述 2026-09-07,原话:「我说的就是要实现这个卡片呢,**不能用以前那种白色报错卡**。新稿有新的文案是吗?**那就先不对齐,余额的一律对齐这两个视觉稿卡片**」,并贴出组件 18 的两张状态图。<br><br>**交付稿那两张卡逐字**:<br>· 额度不足 · &lt; 5 美金 —— `剩余额度 $3.20` / `余额可能撑不完下一个任务 —— 中途用尽会停在半成品上` / 〔Upgrade〕<br>· 额度耗尽 · = 0 美金 —— `剩余额度 $0.00` / `现在无法开始新任务` / 〔Upgrade〕<br><br>✅ **核实结果:我们当前就是逐字一致的**(`chat.upgrade.balance` / `whyLow` / `whyOut`),这一族**无需任何改动**。新文案文档给这一族的是通用话术(「可用额度不足 / 当前额度不足,请充值或升级套餐后再试」)并**删掉了 `{balance}` 具体数字**,相对交付稿是**倒退**。<br><br>⚠️ **本条重新确认了 2026-09-02 的裁决继续有效**:「额度不足和额度耗尽,升级卡各只有一张,**不存在第二张白色通用报错卡**」(逐字记在 `amr-guidance.ts:1522`、`ProjectView.tsx:2849`,红测 `w62-mid-run-balance-card.test.tsx` 钉着,关联 OPEND-2597)。新文案文档给这一格写了标题+正文,而接棒的升级卡**没有标题行**(T59 已确认其形态为「剩余额度 $X.XX + 一句话 + 一颗按钮」)—— **没有地方放,也不该放**。<br><br>⚠️ **交棒不是删除**:`failureCardHandedToAmrBalanceCard` 要求调用方**先确认升级卡真的在屏幕上**才执行交棒。升级卡要等钱包读回确定数字才渲染,而失败事件本身不带余额;若那次读为空还照样交棒,会让一个「因没钱而死」的运行**既没有充值入口也没有重试**——那是它唯一的自救路径。<br><br>**本族仍然生效的两处有意偏离**:阈值取 `&lt; $2` 而非稿子的 `&lt; 5 美金`(**T52**);按钮跟随用户语言,zh-CN 作「升级」而非字面 `Upgrade`(**D1**)。 |
| **T60-a** | **「请联系团队所有者充值」保持不变,不改成新稿的「管理员」。** | ⚠️ **更正一条我先前给出的错误事实**:`admin` 角色**是存在的**(`packages/contracts/src/api/collab.ts:18` `CollabMemberRole = 'owner' \| 'admin' \| 'member'`,全仓在用,vela 界面里叫「管理员」)。先前说「代码里没有 admin 这一档」**是错的** —— 那是把余额弹窗按**账单权限**分的两档(`upgrade` / `ask_owner`)误当成了角色轴。<br><br>**但 admin 确实不能充值,而且是后端强制的**:<br>· 我们 `packages/contracts/src/api/collab.ts:480` —— `canManageBilling: readable && isOwner`<br>· vela `packages/shared/src/workspace-context.ts:268` —— **逐字相同**<br>· vela 服务端还在拦:`services/api/src/billing/http/routes.ts:1765` / `:1868`,`if (!context.permissions.canManageBilling)` 直接拒<br><br>**且这是有意的,不是漏写** —— 同一处旁边 `canManageMembers` / `canInviteMembers` / `canManageSharedResources` 全是 `isOwner \|\| isAdmin`,**只有 `canManageBilling` 和 `canManageAutoRecharge` 排除 admin**。<br><br>所以新稿那句「请联系团队**管理员**充值」**会把用户指向一个充不了值的人**,点进去会被后端拒。保持 **T56** 已批的「请联系团队所有者充值」。<br><br>**留给产品**:若本意是「admin 也该能充值」,那是 **vela 后端的权限设计**要改,不是我们改文案。 |

## 五之十、升级卡是「那一轮的凭据」,不是「当前余额的读数」(T61)

| # | 裁决 | 依据 / 代价 / 未决 |
|---|---|---|
| **T61** | **软档(`< $2`)那张升级卡改成按轮次锚定的存档件:**<br>① **只在一轮结束后出现,运行中不出现**;<br>② 出现后**锚定在那一轮下面**,第二轮运行期间**不许挪到第二轮下面**;<br>③ 第二轮结束后余额仍不足 → **另出一张新的**,不是搬旧的;<br>④ 它是**那一刻的存档**,值不随后续余额变化而改写。 | 产品口述 2026-09-07,原话:「这个卡片在轮次后最好能固定一下,**它就好像历史记录一样,存档在当时状态了**,不能说我干个啥把当时的失败态搞丢了,我往回看那一轮为啥失败了根本没有依据和想不起来啊」。<br><br>**这是语义变更,不是样式调整**:卡片从「当前余额的实时读数」变成「**这一轮为什么停下来的凭据**」。后来人若看到它不随余额刷新,**那是有意的,不要"修"回去**。<br><br>⚠️ **和 2026-09-02 那条不矛盾**。那条说的是「额度不足和额度耗尽,升级卡**各只有一张**,不存在第二张白色通用报错卡」——指的是**同一时刻同一档不要两块 UI**;本条说的是**不同轮次各自一张**。两者正交。红测 `w62-mid-run-balance-card.test.tsx` 守的是前者,不受本条影响。<br><br>⚠️ **第 ④ 条的体量未定,已单独调研**:若这张卡今天是从**实时钱包状态**派生的,那么刷新 / 重进项目之后它要么消失、要么显示**当前**余额 —— **两种都不满足「凭据」**。真正做到存档可能要把它**落进会话记录**(像一条消息那样持久化),那是跨 `apps/web` / `apps/daemon` / `packages/contracts` 的改动。**①②③ 是纯渲染层,先做;④ 走的是「把读数写进那条已落库的失败事件」,同日落地 —— 见下面「T61 ④ 已落地」一节。**<br><br>**其余既有裁决不变**:T51(没有关闭、不做本次会话静音、不挡发送)、T52(阈值 `< $2`)、T53(软档只有这张卡、没有弹窗)、T59(没有用量条)、T60(文案归交付稿,当前已逐字一致)。<br><br>⚠️ **2026-09-07 晚些时候(T66)**:①②③④ **全部保留**,但**来源少了一条** —— 发送前的低余额档整档撤掉,存档件现在只来自「硬拦档」和「跑到一半死在钱上」。同一天写下的 T52 / T53 已被 T66 推翻,见「五之十三」。 |

### T61 ①②③ 已落地(2026-09-07)

**①②③ 已实现,纯渲染层,没有动契约。**

- 「一轮结束」的判据 = **daemon 的三个终态**(`succeeded` / `failed` / `canceled`),
  外加「`runStatus` 缺席但已落 `endedAt`」那一格(非 daemon 模式建消息时 `runStatus`
  本来就是 `undefined`)。判据写在 `apps/web/src/components/ChatPane.tsx` 的
  `isFinishedTurn`,和 `apps/web/src/runtime/todos.ts` 认「这一轮收尾了」同一条。
  **只认 `succeeded` 是错的** —— 跑挂了和被按停恰恰是最该留凭据的两种收尾。
- 存档账本:`ChatPane` 的 `archiveLowBalanceTurnCard`,key = 那一轮助手消息 id,
  **只增不删**。卡画在该助手消息紧下面(`ChatRows.renderItem`),位置由 DOM 顺序
  本身保证,不做任何位置计算。
- 读数带主:`ProjectView` 的 `amrBalanceCard = { balanceUsd, anchorMessageId }`
  **装在同一条 state 里**,没有「只写一半」的写法。锚点归属:告警档 → 这一次要跑的
  那一轮;跑到一半死在钱上 → 那条失败的助手消息;**拦截档 → `null`**(那一轮已被
  `retractPaintedTurn` 收回,没有轮次可锚),读数照旧落在流水末尾。
- 红测:`apps/web/tests/components/chat/t61-balance-card-turn-archive.test.tsx`
  (渲染层四条)+ `ProjectView.amr-balance-card.test.tsx` /
  `w62-mid-run-balance-wiring.test.tsx` 里新增的锚点接线三条。

### T61 ④ 已落地(2026-09-07)· 走的是「挂在已落库的失败事件上」

**改前的行为**(调研原始结论,留档):

| 问题 | 改前的实际行为 |
|---|---|
| 告警档(跑通了但余额低)刷新后 | **卡整个消失。** 这一档在客户端只有 React state,消息上不留任何痕迹 |
| 跑到一半死在钱上,刷新后 | **卡还在,但数字是「现在的余额」不是「那一轮停下来时的余额」。** 失败事件落库,但 `classifyAmrAccountFailure`(`apps/daemon/src/integrations/vela-errors.ts:181`)拿不到余额、事件里也不带,所以 `ProjectView` 那个 effect 每次都**现查一次当前钱包**。充完值再刷新,那一轮的卡会写着 `$20.00 / 余额可能撑不完下一个任务` —— 作为凭据是**错的** |
| 后来又跑通一轮,刷新后 | **卡没了。** `amrInsufficientBalanceFailure` 只看最后一条助手消息 |

**做法:读数写进那条已落库的 `status/error` 事件,写一次,从此不再报价。**

- 契约:`PersistedAgentEvent` 的 `status` 成员加一个可选数字
  `amrBalanceUsd`(`packages/contracts/src/api/chat.ts`)。**不用数据库迁移** ——
  `events` 存成 `events_json` 自由 JSON blob(`apps/daemon/src/db.ts:240`),
  未知字段原样往返,`failureCategory` / `retryable` 就是同一个先例。
- 读:`amrInsufficientBalanceFailure`(`ProjectView.tsx`)一次返回
  `{ messageId, archivedBalanceUsd }` —— 两者读的是**同一条失败事件**,
  分两个函数各走一遍就给「id 取自这一条、数字取自那一条」留缝。
- 用:补查那条 effect 先看存档,**有就不问钱包**;没有才现查一次。
- 写:查完走 `updateMessageById(..., persist=true)` 把数字盖回那条 error 事件
  (`stampAmrBalanceUsdOnFailure`)。**就地改一条,不增不删、不碰 `runStatus` /
  `endedAt`** —— `mergeMessageWriteForDaemonBacked`
  (`apps/daemon/src/routes/project/conversations.ts:543/549`)按事件数组**长度**
  判缩短、按终态判回退,任一条犯了这次写就整份被退回 stored。
- 顺带收益:**重开带历史余额失败的会话不再打一次 authoritative 钱包读**。

**没走 daemon 那条(判定失败时把余额一起发出来)的理由**,留档以免有人回头重开:

- daemon 侧那条 SSE 事件落库时会**过一道白名单**
  (`apps/daemon/src/runtimes/chat-run-messages.ts:460` 只留 `kind` / `label` /
  `detail`,`:400` 另给 `code` / `stderrTail` 开了口),所以「daemon 多发一个字段」
  并不会自动落库 —— 要在 daemon 持久化映射**和** web 的 `translateAgentEvent`
  (`apps/web/src/providers/daemon.ts:2417`)两处各开一次口。
- 还要在 run 失败路径上**新增一次工作区钱包读**(`sendAmrAccountFailure` 目前是
  同步的),给一条已经在失败的路加网络往返和新的失败态。
- 合计跨 `apps/daemon` + `apps/web` + `packages/contracts` 约 6 处改点,
  对比走事件字段的 3 个文件。两条路**覆盖面完全相同**(都只盖「死在钱上」那一轮)。
- 判据不变的部分:余额本身由**客户端**读才拿得到工作区身份
  (`fetchAmrBalanceCardWalletSnapshot` 钉在 `projectRunPreflightContext` 上),
  daemon 侧要重新解一遍同一个身份。

**两条已知边界,都是有意不做的:**

1. ~~**「跑通了但余额低」那一档刷新后仍会消失。**~~ **这条边界当天晚些时候自行消失了**:
   产品把整个低余额档撤掉(**T66**),那一轮现在根本不会出卡,也就没有「刷新后消失」
   这回事。原文留档:那一轮**根本没有 error 事件可挂**(它跑通了),消息上不留任何
   痕迹;要盖住它得给 `messages` 表加顶层字段(类型化列,要 `ALTER TABLE` + 改
   `listMessages` / `upsertMessage` / `normalizeMessage`,约 4–5 个文件 8 处改点)。
   **没做,现在也不用做了**。
2. **失败发生时客户端不在场的那一轮,存的是「下次打开时」的余额。** 读数是客户端
   取的,run 在 daemon 里跑挂而窗口已经关了,那么第一次读数发生在重开的时候。
   这一格**改前也是错的**(改前是每次都错,改后是错一次然后冻住)。真要修得走
   daemon 那条路,代价见上。

**这条字段的语义是「读数,已存档」,不是「余额」。** 后来人若看到它不随钱包刷新,
**那是有意的,不要"修"回去**(产品 2026-09-07 原话在本节表头)。

## 五之十一、文案对齐的三处口径(T62–T64)

| # | 裁决 | 依据 / 说明 |
|---|---|---|
| **T62** | **S21 保持我们的三态,不按新文案文档合并成一格。** | 产品口述 2026-09-07:「**S21 我们三态就三态**」。<br>文档 S21 只给了一格,而我们有三个**可分辨**的状态:`outputInvalid`(伪造角色标记)、`emptyOutput`(空输出)、`toolLoop`(工具死循环)。把同一句抄给三个等于**悄悄合并三个状态** —— 那是产品设计不是文案活。<br>已落地:只对最字面对应的 `outputInvalid` 采用新文案;`title.emptyOutput`「没有任何输出」与 `title.toolLoop`「操作陷入循环」**保持不动**。 |
| **T63** | **S17「登录已失效」先放放。** | 产品口述 2026-09-07:「**S17 没这个就先放放**」。<br>我们**没有这个状态**:`chat.runError.title.authRequired` 和 `chat.amrError.authMessage` 只存在于类型 union 和 19 个 locale 里,**没有任何映射引用,是死键**。真实的 401/403 走 `AMR_AUTH_REQUIRED → title.signInRequired.amr`(T65 拆键前叫 `title.signInRequired`),也就是 S04 那张卡。<br>**未决**(留给产品):S17 是不是就等于 S04?还是要新开一条分流?连带「被移出团队」「客户端版本过旧」两格也没有对应分流(`vela-errors.ts` 只有 3 个码,全仓不读 HTTP 状态码,403/426 分不出来)。 |
| **T64** | **S29 正文的插值槽先不改。** | 产品口述 2026-09-07:「**S29 插值槽先不改吧?**」。<br>S29 标题已按新稿改(「正在恢复网络连接」/「网络连接未能恢复」)。正文「正在进行第 {重连次数}/{最大重连次数} 次连接尝试,请稍候。」**未采用** —— 组件 22 是**一行状态**不是卡,没有正文槽;计数是紧跟标题的 `<span>`,要新增两个插值槽 + 改结构。<br>顺带记:`{重连次数}/{最大重连次数}` 这两个值**今天已经贯通到 UI**(`Reconnect.tsx` 已在画 `2/5`),只是形态是一行不是两段。 |

## 五之十二、S01 / S02 / S04 的标题补齐(T65)

| # | 裁决 | 依据 / 说明 |
|---|---|---|
| **T65** | **第一批跳过的 S01 / S02 / S04 三格标题按新文案落地,连带两处接线。** | 第一批只落了这三格的**正文**,标题跳过 —— 不是文案没给,是**我们缺接线**。产品口述 2026-09-07 对这三格的处置:「**那咋办**」。逐条如下:<br><br>**① 标题从来不传插值。** `ChatPane` 那一行是裸的 `t(runFailureUi.titleKey)`,一个变量都不给。新稿 S01「未检测到 {智能体}」、S02「{智能体} 尚未登录」把主语放进了标题,照抄进字典会把**字面的 `{agent}`** 摆到用户脸上。<br>**做法:复用正文那一份取值,不另起 `titleVars`。** 正文早就在传 `{ agent: failedAgentLabel, ...messageVars }`,提成 `runFailureCopyVars` 后标题和正文同吃一份 —— 两处名的既然是同一个 `{agent}`,就没有让它们各取各的的理由,那只会给「标题说 Claude、正文说 Codex」留一道缝。用不到的槽(`{retryAt}` / `{cause}`)传过去无害,`t` 只替换字面出现的占位符。<br><br>**② `title.signInRequired` 一个键服务两格,必须拆。** S02(本地 agent「{智能体} 尚未登录」)和 S04(Cloud「Open Design 尚未登录」)不是同一句话,一个键装不下。<br>拆成 `title.signInRequired.other`(S02)/ `title.signInRequired.amr`(S04),命名对齐正文已有的 `signInMessage.other` / `signInMessage.amr`。**三个调用点全部明确落位**:AMR 分支(`AMR_AUTH_REQUIRED` / `AGENT_AUTH_REQUIRED` / `UNAUTHORIZED`)→ `.amr`;Antigravity 的终端登录分支 → `.other`(它的登录只能在终端做,但它**是**一个本地 agent 没登录);通用非 AMR 分支 → `.other`。旧键已从类型 union 与 19 个 locale 中删除,不留「随便哪一边」的落点。<br><br>**③ S01 标题连带换键内容**:`title.cliMissing` 从固定短语「智能体未安装」改成「未检测到 {agent}」,两个调用点(`AGENT_UNAVAILABLE` 码 + `cli_not_installed` detail)共用。<br><br>⚠️ **S03 和 S04 的标题 / 正文在原文档里逐字相同**(都是「Open Design 尚未登录」+「请先登录，以便查看项目和继续对话。」)。本次只接 S04 那一格 —— S03(Open Design 账号登录过期)在我们这儿不是报错卡,是另一条路。 |

## 五之十三、低余额档整档撤掉(T66)

| # | 裁决 | 依据 / 代价 / 连带 |
|---|---|---|
| **T66** | **升级卡的「余额不足 · 低余额」那一整档撤掉:余额 `> 0` 时什么都不出 —— 没有卡、没有弹窗、不挡发送。余额 `= 0` 那一档**卡和弹窗都要在**。** | 产品口述 2026-09-07。给出软档那张卡的截图(逐字:「剩余额度 $3.20」/「余额可能撑不完下一个任务 —— 中途用尽会停在半成品上」/〔Upgrade〕)后原话:<br><br>> 「**这个要不先不要了,跟产品说了一下,不要这个了**」<br><br>追问撤除范围后原话:<br><br>> 「**余额为零的那个卡片要显示的,并且也要弹窗的**」<br><br>⚠️ **产品没有给出理由**,这里不代为补写。 |

### 终态三行

| 档 | 终态 |
|---|---|
| 余额 `> 0`(含原来 `< $2` 那一段) | **什么都不出**,判定为 `allow`,发送照常 |
| 余额 `= 0`(硬拦档) | **卡 + 弹窗都出**,发送被拦住 |
| 跑到一半死在钱上 | **保留**(T61:那是「这一轮为什么停」的凭据) |

### 推翻了哪几条的哪一部分

- **T51**(升级卡没有关闭、不做本次会话静音)→ **只剩硬拦档和「跑到一半死在钱上」那两张卡适用**。低余额那张卡不存在了,自然也谈不上关不关。
- **T52**(软档阈值取 `< $2`,对交付稿「< 5 美金」的有意偏离)→ **整条作废**。阈值常量 `AMR_LOW_BALANCE_WARN_USD` **已删除,不是改成 0** —— 归零会让「软档」这个概念以看不出来的方式活着。交付稿组件 18 第一格「额度不足 · &lt; 5 美金」这个状态**我们不再实现**。
- **T53**(软档只有流水里那张卡、首页什么都不显示)→ **前半作废**:项目页现在和首页拉齐,两边都什么都不显示。后半(首页静默放行)**继续有效**,而且现在是全局口径。
- **T61**(升级卡是按轮次锚定的存档件)→ **①②③④ 全部保留**,但它的**来源少了一条**:发送前的低余额档没了,存档件现在只来自「硬拦档」和「跑到一半死在钱上」。T61 那节里「跑通了但余额低那一档刷新后仍会消失」的已知边界**随之消失**(那一档本身不存在了)。
- **2026-09-02**(额度不足和额度耗尽,升级卡各只有一张)→ 现在**只剩「额度耗尽」那一张**。
- **OPEND-2600**(2026-09-03「低余额提醒对所有档位可见」)→ **整条作废**。QA 当初报的「专业版 $1.79 发新任务没有任何提示」现在是**正确行为**。

### 代码怎么落的

- 判定层 `apps/web/src/runtime/amr-balance-gate.ts`:删掉 `AMR_LOW_BALANCE_WARN_USD`,`AmrBalanceGateResult` 的 `soft` 成员换成 **`empty_not_blocked`**。
  - **换名不是改名。** `soft` 当年混装了两件事:「余额 `> 0` 但低」(已撤)和「余额 `= 0` 但硬拦让了位」(T55,**保留**:档次读不出来时由 Vela 入场兜底)。后者仍要出 $0 那张卡、仍不拦、仍不弹窗,所以它需要一个自己的名字。`empty_not_blocked` 只在 `balance <= 0` 时可达,正数余额永远到不了。
  - 余额 `> 0` 现在直接 `allow`,这条路上**一次套餐读数都不发**(T40 的延迟红线因此更严格了)。
- 呈现层 `ProjectView.tsx`:原来的 `gate.kind === 'soft'` 分支改成 `empty_not_blocked`;`allow` 那一段照旧 `setAmrBalanceCard(null)`,低余额落在这里,所以「什么都不出」是**判定层就没有第二条线**的结果,不是呈现层补写 `null`。
- 硬拦档**没有改动**:卡 + 弹窗今天就都在(红测 `ProjectView.amr-balance-card.test.tsx`「拦截档:弹窗和卡片同时出」在这次改动**之前**就是绿的)。产品要的「卡要显示」是**保留**,不是新增。

### 文案与常量的去留

- `chat.upgrade.whyLow`(「余额可能撑不完下一个任务 —— 中途用尽会停在半成品上」)**保留,不删**。它仍有一条活的来源:一轮**跑到一半死在钱上**、而停下来时钱包还剩一点(例如 `$0.35`),`UpgradeCard` 按 `balanceUsd > 0` 走的就是这一句(红测 `w62-mid-run-balance-wiring.test.tsx`「余额还剩一点的那一档,念的是真实读数,不是 0」)。19 个 locale 一个都没动。
- `chat.upgrade.whyOut`(「现在无法开始新任务」)当然保留 —— 那正是要留下的那一档。
- `AMR_LOW_BALANCE_WARN_USD` **删除**。核过没有其他消费者:不在埋点里、不在契约里、不在任何闸门分档里,唯一的读取方就是它自己那两处比较。

### 测试

- 新增红测 `apps/web/tests/components/t66-low-balance-tier-retired.test.tsx`。**故意不 mock `checkAmrBalanceGate`** —— 喂的是钱包读数本身,判定用真的,这样「$1.20 该算哪一档」才在判据里面。
- 删除 `apps/web/tests/components/w116-amr-low-balance-card-tiers.test.tsx`(整份都在测「低余额卡对所有档位可见」,那张卡没了)。它唯一还成立的那条红线(这条路上不许多打一次套餐读数)搬进上面那个新文件。
- 改口径:`amr-balance-gate.test.ts`、`w116-amr-low-balance-all-tiers.test.ts`、`amr-balance-gate-personal-tiers.test.ts`、`amr-low-balance-optout-removed.test.ts`、`w116-entry-shell-low-balance-tiers.test.tsx`、`ProjectView.amr-balance-card.test.tsx`。
- **没动**:`t61-balance-card-turn-archive.test.tsx`、`w62-mid-run-balance-*`(除一行注释)、`upgrade-card-layout.test.tsx`、`ChatPane.wired-cards.test.tsx` —— 它们测的是保留下来的那几档。

## 五之十四、记忆卡「两个进行中」+ 标签泄漏(T67)

| # | 裁决 | 依据 / 说明 |
|---|---|---|
| **T67** | **记忆卡不删。打补丁修好它的呈现,不动消息编排、不动 daemon、不动契约。** | 产品口述 2026-09-07。工单 OPEND-2745(urgent)一度被产品改成「[ChatPanel][运行状态] **去掉记忆**」,追问「能修吗?不好修先把 memory 干掉?」时产品先答**先干掉**;把根因讲清楚之后产品改口,原话:<br><br>> 「**去修吧,先打补丁保证能正常运行,不要做大的重构**」<br><br>改口的理由是**问题不在那张卡,在它的送达形式**;而且删卡有真代价 —— 那张卡当初就是为修 **OPEND-2607** 加的(`useMemoryWrittenCard.ts` 开头逐字:一轮可以把三条规则沉进记忆库、库从 22 涨到 25,**而流水里什么都看不到**),删了等于把 2607 重新打开。 |

### 工单症状与根因

QA 报的是两件(Beta 0.21.1-beta.7,会话 `7f04b326`):**① 提交后同时出现两个「进行中」**,下面那个是单独冒出来的记忆消息;**② 那条消息把 `<od-card type="memory-applied">…</od-card>` 的原文直接摊在屏幕上**。实际只有一次运行。

**两件是同一个根因。** 记忆卡是宿主补发的一条助手消息(`ProjectView.tsx` 收到 `useMemoryWrittenCard` 的批次后 `appendConversationMessage`),它**从来不是一次运行**:没有 runId、没有 runStatus、没有 startedAt / endedAt。而 `ChatPane.isAssistantMessageStreaming` 的兜底只问「是不是最后一条助手消息 + 面板在不在流」,**没问这条消息自己有没有过一次运行**。

记忆提取跑在轮次结束**之后**(守护进程在子进程关闭时才排队),回报常常正好落在用户已经发出下一轮的时候:卡成了最后一条助手消息,面板又在流 —— 于是它被当成了那条正在跑的消息。接下来:

- `AssistantMessage` 据此把 `turnRunStatus` 定成 `running`,画出执行记录壳(转球 + 一直往上走的秒表)。**这就是第二个「进行中」**,而且它没有 runId,那一个永远不会结束。
- 运行中的正文归壳内(D43),壳内叙述走 `ThinkingMarkdown` —— **那条链上没有任何一处 `splitOnOdCards`**,于是 od-card 被当成纯 markdown 渲染,标签原文摊到了屏幕上。**这就是泄漏**。

所以泄漏是①的直接后果,不是第二个 bug:这条消息一旦不再被当成正在跑的运行,正文就回到壳外的普通 `prose-block`,`splitOnOdCards` → `OdCardView` 照常生效。

### 代码怎么落的(两条渲染层条件,共用一个判据)

- 新增 `apps/web/src/runtime/chat/host-authored-message.ts` 的 `assistantMessageNeverHadARun()`:runId / runStatus / startedAt / endedAt **四样都没有**。
- `ChatPane.isAssistantMessageStreaming`:面板级流式不再投影到这种消息上。
- `AssistantMessage` 的 `hideRunStatus` 加第三条例外:没跑过的消息不挂「已完成」。复制、时间**照旧** —— 它们说的是这段内容本身,不是某一轮的结果。

⚠️ **判据为什么是四样一起看,而不是「没有 runId / runStatus 就不算在跑」。** 后者会误伤真运行:API / BYOK 模式下的乐观占位正是那个形状(`ProjectView.tsx` 建占位时 `runStatus: config.mode === 'daemon' ? 'running' : undefined`),它靠的就是这条兜底。分开两者的是 **`startedAt`** —— 每条真占位都写了它,宿主补发的卡一条都没有。红测里专门留了这条反向锚点。

### 有意没做的

- **没有**把记忆卡并进上一条 run 消息。那要动落库,daemon 有 `mergeMessageWriteForDaemonBacked` 守卫,属于产品说的「大重构」。
- **没有**删卡、删 `useMemoryWrittenCard`、删 `chat.memoryWrittenSummary`。
- **没有**给记忆卡换送达方式。它今天仍是一条助手消息 —— 只是不再冒充一次运行。

### 顺带查到、**本单不修**的邻接缺陷

执行记录壳内的叙述整条链上没有 od-card 处理(`ExecutionShell.tsx` / `ThinkingMarkdown.tsx` 都不调 `splitOnOdCards`)。后果是**模型自己发的** `<od-card>` 只要落在 done 标记之前,就会:运行中把标签原文摊出来,跑完之后连同壳一起收起、卡整个看不见。而系统提示词恰恰让模型「在回复最开头」发 `memory-applied` / `task-brief` 这两张卡(`apps/daemon/src/prompts/system.ts`、`packages/contracts/src/prompts/system.ts`)。

这条**不在 OPEND-2745 的边界内**(工单点的是宿主补发的那条消息),改它要动壳内渲染,超出「打补丁」的授权范围。**要单独立项、单独红测。**

## 五之十五、一次失败只出一张卡,主 CTA 一律切 Cloud(T68)

| # | 裁决 | 依据 / 说明 |
|---|---|---|
| **T68** | **报错卡与切换卡合并成一张:主按钮位一律是〔切换到 OpenDesign Cloud 并重试〕,铺到所有 BYOK / 本地 CLI 的失败;第二张卡整块删除。⚠️ 明确推翻 2026-08-26 的 §6.Z「主按钮阶梯」。** | 工单 **OPEND-2772(urgent · 孙庆雨)**「用户自己的 CLI/BYOK 报错,统一 CTA 引导切换 OpenDesign Cloud」,正文只有一张截图:Claude 本地 CLI 登录过期,红框圈住**上下两张卡同时出现**。产品口述 2026-09-07,逐字:<br><br>> 「**2772 的『统一』是『铺到所有报错』,主 cta 都是切换至 cloud,具体样式按设计稿**」<br><br>> 「我没让你改文案吧? 应该是所有 cta 按钮都是切换到 cloud? 然后 2772 应该有个附件,就是之前旧的报错卡片也出现了,我们应该直接干掉旧的报错卡片。**不能新旧一起出现吧??**」<br><br>> 「**8-26 推翻掉吧**」<br><br>被推翻的是 `run-error-catalog.md` §6.Z 那段(原话):「**为什么不是「一律劝切 Cloud」**:付费用 CLI/BYOK 的人遇到『换个模型就好』的问题,主按钮却劝他再买一份 Cloud,那是把营销放在解决问题前面。所以第 1 档永远优先。」推翻记录落在同一份文档新增的 **§6.ZB**,原文保留不删。 |

### 终态长什么样

一张 `RunErrorCard`,自上而下:红标题一行 → 一句人话 → 靠右一排动作。动作排是

  〔联系支持〕次级 · 〔导出日志〕次级 · (阶梯自己那颗,次级)· 〔重试 / 续跑〕次级 · **〔切换到 OpenDesign Cloud 并重试〕主**

最右那颗是主(交付稿第 78 / 79 格都是「次要在左、主动作在最右」),而且**整张卡只有一颗主按钮**。

### 三条边界,一条都没越

- **文案一个字没动。** 每一类失败保留它自己的标题 / 正文;主 CTA 复用切换卡上原来那句 `chat.amrCard.switchCta`「切换到 OpenDesign Cloud 并重试」,**没有**换成稿子第 79 格的「切换到 Cloud」——「改文案」产品明确说了不在授权范围内。
- **阶梯不删,只让位。** §6.Z 的四档仍然在算(`primaryActionForFailure` 一行没动),换个模型 / 去设置 / 在终端登录 / 授权并重试 / 重试 / 续跑**一颗都没删**,统一退到次级(`ChatPane` 的 `errorActionVariant`)。
- **AMR 不能被劝去买 AMR。** 出口不变式两侧同源:非 Cloud 走 `withCloudSwitchCta`(往上铺),Cloud 走 `withoutCloudSelfPromotion`(往回摘),判据都是 `runsOnALocalAgent()` 一个函数。全矩阵反向用例在 `amr-card-gaps.test.ts`(10 code × 7 detail)与新红测里各一份。

### 摆出来、**没有自己拍板**的一条:〔重试〕

交付稿第 79 格只画了两枚按钮 ——〔导出日志〕〔切换到 Cloud〕,**没有重试、没有联系支持**;
产品说「具体样式按设计稿」。但重试对某些失败是真正的自救(上游 5xx、网络抖动、S30 里
混着的握手中断),一刀切掉会伤到它们;〔联系支持〕又是产品自己点名「好多都应该得有」的。
本轮取**保守解 A**:两颗常驻次级和重试都留在卡上,只降为次级。三个候选写进
`run-error-catalog.md` §6.ZB 末尾的表,等产品挑。

### 顺手处理掉的一条无理由否决

`UPSTREAM_UNAVAILABLE` 在映射表里明写着要出切换卡,却在 `ChatPane` 里被**单独否掉**,
代码里没有任何注释说明理由,规格与决策表里也查不到出处 —— 也就是说上游过载(S10,
每月 11,200 次)在产品里从来没有过这颗出路。这次一并撤掉。同时撤掉的还有
`PROMOTE_AMR_CODES` 这张表:它列的四个 code 在兜底分支之前**全都已经 return**,
`promote` 恒为 false,是一段没人发现的死码。

### 埋点怎么搬的(一个事件都没丢)

- `surface_view`(element=`run_failed_toast`):以前切换卡在场时由**切换卡**发,报错卡那个 effect 主动早退避让。卡没了,早退那一句也删掉 —— 事件属主收回报错卡,props 一个字段没变。⚠️ 不删这句话的话,凡是出 Cloud CTA 的失败(现在是所有 BYOK 失败)一条 surface_view 都不会有。
- `ui_click`(element=`go_amr`)+ `recordAmrEntry('chat_error_switch_retry_card')`:原样搬到新 CTA 的 onClick,归因来源字符串**逐字不变**(动它会断漏斗)。
- `run_recovery_action` 的 `switch_runtime_retry`:曝光与点击两侧都还在,判据从 `showAmrGuidance` 换成同义的 `showCloudSwitchCta`。

### 测试

- 新增红测 `apps/web/tests/components/chat/opend-2772-one-card-one-cta.test.tsx`(17 条)。**故意不 mock `AmrGuidance`** —— 第一条判据就是「那张卡还在不在」,stub 掉等于把要照的东西糊住。撤实现验红:9 条红、8 条绿(6 条 AMR 反向用例本来就该绿)。
- 字段更名 `showSwitchCard` → `cloudSwitchCta`(「第二张卡」这个概念没有了,名字不能留着骗人)。
- 口径翻转 `amr-guidance.test.ts`(11 处)、`run-error-ladder.test.ts`、`run-failure-clarification-repeated.test.ts`、`run-failure-agent-reply-incomplete.test.ts` —— 都是「非 Cloud 的卡有没有这颗 CTA」,从 false 翻成 true(循环用例翻成 `agent !== 'amr'`)。**AMR 那一侧一条都没翻。**
- 删除 `apps/web/tests/components/AmrGuidance.test.tsx`(组件没了);7 份 ChatPane 测试里的 `vi.mock('.../AmrGuidance')` 桩一并摘掉。
- `ChatPane.error-card-ladder.test.tsx` 的第 4 档那一节**改成两侧都钉**,不是删:BYOK 封号主位归 Cloud CTA、〔联系支持〕退回次级;**已经在 Cloud 上**的封号仍然把〔联系支持〕提为主 —— 提为主这条规则本身没有被删,只是适用面缩到了拿不到 Cloud CTA 的那一侧。
- `run-error-actions-parity.test.tsx` 的「重试是 primary」改成「重试和旁边几颗同一个 `errorActionVariant` 出口」,并补一条源码断言钉住「没有 Cloud CTA 时它仍是 primary」。

### 顺带清掉的死码 / 留下的死键

- **已删**:`styles/chat.css` 里 `.amr-card__body` / `__chips` / `__chip` / `__cta` / `__cta:hover` 五条规则(唯一的使用者就是那张卡)。
- **没删,报上来等拍板**:`chat.amrCard.switchTitle` / `switchBody` / `chipOfficial` / `chipNoKey` / `chipAutoRetry` 五个 i18n 键随卡下线后**成了死键**(19 个 locale × 5 + `types.ts`)。产品说了「我没让你改文案吧」,所以这一轮**一个字典都没动**;要清的话是一次纯机械删除,单独一个 PR 更干净。`switchCta` 仍在用,不能删。

## 五之十六、设计风格选择题从提示词整题下线(T69)

| # | 裁决 | 依据 / 代价 / 连带 |
|---|---|---|
| **T69** | **「看图选设计风格」这道题整题不问了 —— 从**提示词源头**断掉,不在渲染层拦。组件代码**原地留着当休眠件**,不删。** | 产品口述 2026-09-07(OPEND-2760),原话:<br><br>> 「选中态就是当前切换到的那个效果,或者你能否**把提示词里让 agent 感知到 question-form 能出设计风格的那些提示词下掉**?**不问了**,这些代码先讲提示词干掉,**组件代码注释,后续可能要找回**」<br><br>⚠️ **产品没有给出理由**,这里不代为补写。<br><br>工单原标题是「去掉随机、平铺、换一批、选中状态」四个控件。调研发现按字面做**不自洽**:`direction-cards` / `tone` 都躺在 `CHOICE_QUESTION_TYPES` 里,去掉选中态 ⇒ `requiredAnswered` 永远 false ⇒ 「下一步」**永远置灰**,整道题只剩「跳过」(判据钉在 `qf-next-gate.test.tsx`,来自交付稿 5-1 / 5-2)。把这条摆给产品之后,才有了上面这句「不问了」。 |

### 这是对交付稿的**有意偏离**

交付稿 `729fa43ce7` 的 `cmp-clarify` 第 21 / 22 格(`docs/design/chat-panel/src/body-components.html`)画的就是这张卡,四个控件**一个不少**:`换一批`(`:722/:761`)、网格切换 `.vswitch`(同行)、`随机`(`:746/:785`)、选中态 `.vopt.is-on` + `.pick > .ck`(`:753`);第 22 格状态标签逐字写着「**选中一张 · 图上落绿勾,「下一步」才亮起**」。

**后来人不要当成漏做补回去。**

### 推翻了哪几条

- **2026-08-27 产品口径**(逐字记在 `apps/web/src/runtime/visual-style-deck.ts` 文件头):「点击换一批时,顺序从 22 个里每次挑 6 个出来」「但如果用户选中了一个,那要保留选中的这个,**不能把用户选中的给轮换出去了,不然无法取消选择了**」→ **不再有触发它的路径**。⚠️ 结论本身**没有被证伪**,代码和 5 条测试**全部原样保留**,找回来那天直接生效。
- **2026-09-04**「先改成 4 吧」(`VISUAL_STYLE_BATCH_SIZE = 4`,OPEND-2584)→ 同上,保留不动。
- **2026-08-27 用户裁决**「视觉调性就是要单选」→ **调性题本身没了**。原来守它的 `apps/daemon/tests/prompts/tone-single-select.test.ts` 里那条 `选项还在 —— 别把这题整个删了` 是**防误删**守卫;这次的删除**是产品指令不是误删**,该文件已翻成反向守卫(文件名故意不改,保住裁决链)。
- **B39**「+22 别出现了,直接渲染 22 个」、**B53**「看全部交给网格切换」、**B56**「视觉方向底栏顺序 `Shuffle / Random / Next`」(均在 `specs/current/chat-panel-feedback.md`)→ 都**只在这张卡出现时才有意义**,随卡一起休眠。

### 断在哪儿:**七**条路径,不是六条

前六条就是 `e2e/tests/question-form-type-parity.test.ts` 那份清单。**第七条是最容易漏的一条**:`plugins/_official/atoms/direction-picker/SKILL.md` —— 它不在 parity 清单里,却被 `od-default`(**默认设计路由**)、`od-next-strategy`、`od-new-generation`、`od-tune-collab`、`od-plugin-authoring` 五个官方场景挂在 `plan` 阶段整段拼进系统提示词。只改前六条,默认路由照旧会教模型出方向卡。

每条路撤的是两样东西:类型清单里的 `direction-cards` + 它的作者规则;以及开场简报示例里那道 `{ "id": "tone", "label": "Visual tone", "type": "radio", … }` —— **`tone` 是第二个、也更隐蔽的入口**,它长得像普通单选,渲染时被 `QuestionForm.tsx` 的 `asksVisualDirection`(`q.id === 'tone'`)认走换成整份目录。只撤 `direction-cards` 会留下它。

`direction-picker` atom 改成「**自己定方向、不问用户**」(设计系统 → 用户给的品牌源 → 自己推断),这不是新造的产品规则 —— `discovery.ts` RULE 2 和 `directions.ts` 早就写着「pick the best-matching direction yourself … without asking」。

### 判据变更:提示词与渲染器**故意不相等**

`question-form-type-parity.test.ts` 原本断言「提示词类型清单 **==** 渲染器类型清单」。现在放宽成「**== 渲染器 − 休眠集**」(`DORMANT_TYPES = {'direction-cards'}`),理由:

- 渲染器**继续**认 `direction-cards` —— 缓存的旧提示词、旧版客户端、模型记住的旧格式都还可能发来这种表单,认不得它那道题会渲染成一块只有标题的空白;
- 提示词**不再**提它 —— 提了就等于告诉模型「你可以问设计风格」,连否定句(「不要发 direction-cards」)也一起撤,否定句同样是在宣告这个能力存在。

⚠️ **往 `DORMANT_TYPES` 里加名字 = 宣布又一个能力对模型不可见,必须有产品裁决**,不是「这条路写漏了」的消音器。已实测:把 `direction-cards` 加回任何一条路的类型清单,parity **当场红**。

**撤的是「发问」,不是「读答案」**:`prompts/directions.ts` 里解读旧表单答案那半边(`value` / `foundation` / `guidance`、`od tools directions`)**故意留着**,和渲染器继续认这个类型是同一件事的两面。

### 顺带修掉的一条死路(本来就在,不是这次改出来的)

一道**渲染不出任何选项**的 `direction-cards`(既没有 `visualStyleContext`、模型又没带 `cards`)此前会:只剩一个标题 + 「下一步」**永远置灰** ⇒ 整张表只剩「跳过」。`visualStyleContextForProjectKind` 对 `audio` / `brand` / `orbit` / `design_system` 以及项目类型未落定(`null`)都返回 `undefined`,所以这个死角真实可达。

下线之后 `direction-cards` 变成**不再被宣传的类型**,它的每一次出现都是计划外的,也就更可能缺素材 —— 安全网必须真的兜得住,不能只是「留着代码」。修法是一条具名不变量 `questionRendersNoChoices`:**一道渲染不出任何选项的题不能充当提交门闩**(压过 `required`)。红测 `apps/web/tests/components/question-form-direction-cards-dead-end.test.tsx`,含防真空与对照组各一条 —— 有卡可点时 5-1 的门闩照旧生效。

### 验收陈列页第 21 / 22 格:**建议,未执行**

`docs/design/chat-mirror` 那页是 ChatPanel 1:1 重构的验收依据,`mirror-gallery.test.tsx:624/626` 两格分别写着「视觉方向 · 看图选择(风格类问题不能用文字选项),没选时「下一步」置灰」和「选中一张 · 图上落绿勾,「下一步」才亮起」。

**我没有动它,挖洞要留痕。三个选项摆给产品:**

1. **两格标成「已休眠」**(推荐)—— 格子照旧渲染(组件还在,渲染得出来),标题加前缀、备注里写明「T69 起正常流程不出现,提示词已撤;这两格是找回时的对照件」。好处:82 格矩阵不缺号,找回那天有现成基线。
2. **整格删掉** —— 矩阵从 82 变 80,后续所有按编号引用的文档要跟着改号。代价最大。
3. **保留原样不加说明** —— 最省事,但验收人会照着一张线上根本不存在的卡验收。**不建议。**

### 测试怎么处理的

**保留(测休眠件本身,是找回时的保障)**:`tests/runtime/visual-style-deck.test.ts`、`QuestionForm.deck-batch.test.tsx`、`QuestionForm.direction-cards-catalog.test.tsx`、`chat/w75-visual-direction-card.test.tsx`、`chat/visual-at-limit-affordance.test.ts`、`chat/visual-option-stack-opacity.test.ts`、`chat/visual-card-aspect.test.ts`、`chat/visual-card-spacing.test.ts`、`chat/question-form-carousel-nav-inset.test.tsx` —— 九个文件**一个没删**。

**改口径(测的是这次断掉的那条接线)**:`apps/daemon/tests/prompts/` 下 `core-slim.test.ts`(三处)、`discovery-form.test.ts`、`system.test.ts`(两处)、`discovery-localization-drift.test.ts`(direction-picker 那一行的判据句)、`tone-single-select.test.ts`(整份翻向)、`system-prompt-matrix.test.ts` 快照(**只有 `totalChars` 变了,section 一个没增没减**);`packages/contracts/tests/system-prompt.test.ts`(两处)。

**新增**:`e2e/tests/question-form-visual-style-retired.test.ts`(七条路径正面守「撤干净」)、`apps/web/tests/components/question-form-direction-cards-dead-end.test.tsx`(死路兜底)。

### i18n:六个 `qf.visual*` 键**一个不删**

`qf.visualReshuffle` / `qf.visualRandom` / `qf.visualViewGrid` / `qf.visualViewFan` / `qf.visualPrev` / `qf.visualNext` 的唯一消费者是 `QuestionForm.tsx`,而那些控件**还在**(只是不可达)。删键会让休眠件编译不过,等于把「留着随时能找回」变成谎话。19 个 locale + `types.ts` 一处未动。

### 本单**不修**的邻接面(留给产品拍)

- `plugins/_official/examples/guizang-ppt/`(及其 `design-templates/guizang-ppt/` 镜像)仍会在用户明确要求时发 `direction-cards`。它是**opt-in 的示例插件**、有自己作者写的流程,不是「产品默认去问设计风格」;渲染器还认这个类型,所以它继续能跑。**要不要一起下线,是插件策略问题,需要产品单独说。**
- `direction-picker` atom 仍挂在五个官方场景的 `plan` 阶段。我只改了它**说什么**(不再问),**没有**把它从场景清单和 marketplace 里摘掉 —— 那是插件拓扑改动,越出本单范围。

## 六、需要我做实测才能定的(3 条,不用你们操心)

T10(Claude 到底发不发原生清单)、T1(AMR 打码与归一)、T2(提测分不分批)—— 我来。
T4 / T6 是小的默认值问题,现状能跑,不急。

---

## OPEND-2714 Fork 分界脚注:文案与形态(2026-09-08 用户拍板)

**背景**:9-07 的分诊结论是「未修 —— 设计变更,不是缺陷,状态保持未立项」,并要产品先给两样东西:①源会话标题去哪 ②中文及其余 17 个 locale 的文案。用户随后指示「都做了吧」,实现落在 PR #7863。

**裁决**

1. **两块并成一行,不再单独渲染源会话标题。** 稿子(`729fa43ce7:docs/design/chat-panel-next.html` 3132-3164)原本定义的是 `.fork-sep`(线中间放源标题)+ `.fork-note`(图标 + 脚注)两块,各带 `is-new` 入场动画。**工单覆盖稿子**;`chat-panel-outro-audit.md:302-305` 记录的是稿子当时的形态,作为历史保留,不改。
2. **英文**逐字用工单给的 `Continued from chat`(原 `Context above came along — just keep going.`)。
3. **中文由用户 2026-09-08 当面给定:「从上一个会话继续」**(zh-TW 为同句繁体「從上一個會話繼續」)。`chat-panel-outro-audit.md:304 / :318 / :536` 里写的「上文已带过来,接着说就行」是**旧文案**,同样作为历史保留。

**未决 / 未做**

- `docs/design/chat-mirror/mirror-exec.html` 是**生成产物**,仍停在两块式旧形态且写着旧文案。重建会产生约 776KB 的巨型 diff,单独一件事。
- daemon 在源会话没有标题时整个压掉 `forkedInto` 戳(`routes/project/conversations.ts`「拿不到源标题就不盖」)。标题现在已经不渲染了,无标题的源会话理应仍然值得那条分界线。

**已收尾**

- ~~**其余 17 个 locale 仍是旧句子的各自译文**,没有跟着改。~~ **已补齐(2026-09-08 用户拍板「都改」)**:除已定稿的 `en` / `zh-CN` / `zh-TW` 外的 **16 支**语言包(目录下共 19 支)全部改成对齐新英文 `Continued from chat` 的说法 —— 说的是「来处」(这段是从上一个会话接着来的),不再是旧句的「上下文已带过来 + 接着说」。用词跟各 locale 自己的 `assistant.forkConversation` 走(`es-ES` 例外:`conversación` 那条会到 1.63×,改用 `chat`)。长度全部控制在英文 19 字符的 1.5× 以内,最长 `de` 28 字符。
- ~~`.fork-sep span` 带着 `overflow: hidden; text-overflow: ellipsis`,但标签本身是 flex 容器,`text-overflow` 永远不生效;长译文会被切掉而不是省略号。~~ **已修**(#7868 评审线程 → 修复 PR):文案搬进内层 `.fork-note-label`,截断四条(`min-width: 0` / `overflow: hidden` / `text-overflow: ellipsis` / `white-space: nowrap`)落在那一层;`.fork-sep span` 同时换成子组合符 `.fork-sep > span`,否则内层会被一起按成 `flex: none`,不可收缩的 flex item 宽度恒等于内容宽度,省略号照样轮不到。守卫 `e2e/ui/fork-note-ellipsis.test.ts`:真浏览器里用**最长的那支译文**(德语)在受限宽度下渲染,先证明它真的溢出了(`scrollWidth > clientWidth`),再拿同一个元素强制 `text-overflow: clip` 的渲染做对照 —— 两张画得一样就说明还是硬切。判据只读几何和像素,不碰类名和声明:`apps/web/src/components/chat/AGENTS.md` §5 禁止断言 CSS 类名/声明,而且缺陷现场那句 `text-overflow: ellipsis` **本来就写着**,断言声明必然假绿。结构那一条(文案由自己的元素承载)在 `AssistantMessage.fork-continued-line.test.tsx` 里,走 `data-testid`。

---

## 2026-09-08 用户当面裁决三条

### 1. 队列行第三颗按钮:并成一颗「引导对话」

原话:「**引导对话就是原本的立即发送啊,只不过我们换了个名字跟 codex 客户端对齐了下**」。

依据核实:`onSendQueuedNow` 和 `onSteerQueuedSend` 两个 prop 的实参**是同一个函数** `sendQueuedChatSendNow`,差别只有标签文字、`canSteerCurrentTurn` 这道门、以及埋点的 `element` 值。交付稿(`729fa43ce7` 组件 17「Queue」)三行样例的第三颗**一律**是 `aria-label="引导对话" data-tip="引导对话"`,**没有**只有图标的「立即发送」那一面。

落地:并成一颗,门去掉,tooltip 收敛回稿子的四个字。**顺序仍按 OPEND-2715 的 引导会话 → 编辑 → 删除**(工单晚于稿子;稿子自己的 `qops` 源码顺序是 编辑 → 移除 → 引导对话,这条分歧**故意保留**,下一个拿稿子做 diff 的人会遇到)。

埋点:`element: 'send_now'` **从此不再产生**,只剩 `'steer'`。类型联合里保留 `send_now`(PostHog 历史事件还在,看板要能编译),注释已改成「已退役,不是改名」。**队列漏斗看板的所有者需要知道这件事。**

### 2. 问卷澄清卡副标题:改彻底,提示词一起收

原话:「**改彻底是的, 提示词也改**」。

9-07 分诊给的两条路里选②(渲染 + 提示词链路)。模型面 3 处(`core-slim.ts` 的 `labels/help`、`system.ts` 本地化清单里的 `helper text`、以及 `packages/contracts` 那份 API/BYOK 镜像)全部去掉;宿主自己那条 ElevenLabs 音色说明按「不丢信息」原则**并进 `label`**。`FormQuestion.help` 字段**保留**并标休眠(参照六个 `qf.visual*` 键的先例)。

### 3. Cloud 切换按钮:只对齐按钮,报错文案不对齐

原话:「切换到 cloud 就行了,你怎么写那么长的文案『切换到 Cloud 并重试』」、「**具体的报错文案不一定跟设计稿对齐, 按钮文案对齐先**」。

`chat.amrCard.switchCta` 19 个 locale 全部缩短(zh-CN 为「切换到 Cloud」,en 为 `Switch to Cloud`),对齐交付稿第 5772 行。

⚠️ **标题与正文按裁决明确不对齐**:稿子那一格写的是「本地环境跑不动这一步」+「当前运行在 CLI / BYOK 环境…」,而产品是**每类失败各说各的**(例:Claude 登录过期 → 「Claude 尚未登录」)。这不是遗漏,是产品选择。`chat-panel-edge-audit.md:329`、`run-error-catalog.md:405-406` 等处 2026-09-07 的记载写着「改文案不在授权范围内」—— 那些是**当时的**存档,不改;本条是新的裁决。

⚠️ 按钮**数量**也和稿子不一致(稿子 2 颗,产品 4 颗),`run-error-catalog.md:421-430` 里 A/B 两案仍挂着等产品挑,本次未动。

### 本轮顺带确认、**未做**的

- `docs/design/chat-mirror/mirror-exec.html:8948` 的说明在文案改后变成了反话(它和 `mirror-gallery.test.tsx:1687` 逐字配对)。生成产物,与 fork 那条同属「重建是 776KB 巨型 diff」的待办。
- `chat.amrCard.switchTitle` / `switchBody` / 三枚 chip 共 **5 个死键**(OPEND-2772 删掉 AmrGuidance 卡之后没有消费者),19 locale × 5 + `types.ts`。纯机械清理,单独一个 PR 更干净。
- hu 的 `Cloud-re`、tr 的 `Cloud'ye` 是前元音后缀,而 "Cloud" 读作 /klaud/ 属后元音,按元音和谐应为 `-ra` / `'a`。**旧串里就带着的**,本次只做了「删掉多余部分」的最小变换,没顺手改翻译质量。
