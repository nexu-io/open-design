# ChatPanel 重构 ·「边界」族盘点与差异清单(组件 6 / 17 / 18 / 19 / 20 / 22)

> **范围** 84 格状态矩阵的第 **70–84** 格 ·「边界」段(设计稿 `chat-panel-next.html` 的
> `data-od-id="stage-edge"`,段落副标题原话:「不在主流程上,但缺了会把人锁死」)。
> **权威源** `docs/design/chat-panel-next.html`(PR #7170 head `1bbdce0b06`,组件稿)+
> `docs/design/chat-panel-scene.html`(场景稿),规格与决策以
> `specs/current/chat-panel-next.md` 为准。本文只做**盘点与差异**,不含实现代码。
> **成文** 2026-08-25。所有行号为写作时快照;本 worktree 有大量未提交在制品,行号可能漂。

## 0. 一句话结论

这一族**没有一个组件是从零开始的,但也没有一个是能直接改样式对齐的**。

- **17 Queue** 是唯一「实现完整、只差版式」的:能力比稿子多(立即发送、meta chips),形态差在卡头 / 序号 / 折行 / 溢出四处。
- **19 报错** 的卡面在,但产品今天是「一张卡 + 按错误码分流的一枚主动作」,稿子是「一张卡 + 三枚固定动作」——**1:1 照搬会把已分好的动作压回一种,是功能回退**。
- **18 升级** 今天是**居中弹窗**(硬拦 / 软提醒各一个),稿子是**流水里的一张卡**,阈值也不同($0/$2 vs $0/$5)。
- **20 暂停 / 22 重连** 在 web 里**完全没有 UI**;22 的数据(重连次数)存在但没出过 provider,20 的数据(是谁停的)在契约里有、web 零引用。
- **6 Plan 卡** 已由 D33 + S9 拍板**本期不做**,做的时候只做收起胶囊 —— 但那条与 B17 冲突(见 §4 R1)。

---

## 1. 现有实现落点表

### 1.1 组件 6 · Plan 卡

| 项 | 落点 |
|---|---|
| 线上实现 | `apps/web/src/components/ToolCard.tsx:256` `TodoCard`(props `{ input, runStreaming, runSucceeded, onContinue? }` :257–266) |
| 挂载位置 | `apps/web/src/components/ChatPane.tsx:3997` `PinnedTodoSlot`(渲染 `TodoCard` 于 :4056),挂在 `ChatPane.tsx:3032`,即**钉在输入框上方** |
| 收起态 | 已有:`op-todo-collapsed`(:296)+ `.op-meta` 显示 `{done}/{total}`(:313–316)+ `.op-todo-current` 显示当前步 `activeForm`(:318–322);自动收起规则 :290–292 |
| 数据层 | `apps/web/src/runtime/todos.ts` — `latestTodoWriteInputForPinnedCard:100`(PinnedTodoSlot 实际调用的,`ChatPane.tsx:4025`)、`isTodoWriteToolName:127` |
| 样式 | 全局:`apps/web/src/styles/viewer/composio.css:683–845`(`.op-todo` 684、`.chat-pinned-todo` 708、`.op-todo-current` 821)+ `styles/viewer/tools.css:550–605`(`.todo-*` 列表) |
| 新写的(未接线) | `apps/web/src/components/chat/ExecutionShell.tsx:138` `PlanRow`(把清单画成壳内一段「执行计划 · N 步」)、`:120` `TodoRow`;数据 `runtime/chat/contract.ts:52 ShellPlan` |
| 能否单挂做对照 | 能。`TodoCard` 只吃 `input` + 两个布尔;`PlanRow` 只吃 `steps` + `t` |

### 1.2 组件 17 · Queue

| 项 | 落点 |
|---|---|
| 渲染 | `apps/web/src/components/ChatPane.tsx:4096` `QueuedSendStrip`,根节点 `div.chat-queued-send-strip` / `data-testid="chat-queued-send-strip"` |
| 挂载位置 | `ChatPane.tsx:3039` —— 在 `PinnedTodoSlot`(:3032)之下、composer 之上,**位置与稿子一致** |
| 条目类型 | `ChatPane.tsx:805 QueuedSendItem`;更新载荷 `:813 QueuedSendUpdate`;ChatPane props `:547–551` |
| 拖动排序 | 已有。`handleDragStart/Over/Drop` :4120–4176;MIME `:4283`;落点边缘 `queuedDropEdgeForEvent:4293`;重排 `reorderQueuedSendIds:4304`(仅 `items.length > 1` 时可拖) |
| 编辑 | 已有。铅笔 → `restoreQueuedSendToComposer`(`ChatPane.tsx:1816`)→ `editingQueuedSendId`(:1280);保存走 composer `onSend` 拦截 :2408–2420 |
| 移除 / 立即发送 | 已有。`onRemove`;`data-testid="chat-queued-send-now"` → `onSendNow` |
| 溢出 | `QUEUED_SEND_VISIBLE_ROW_COUNT = 4`(:4284)+「+N more queued」行 |
| 每条摘要 | `summarizeQueuedPrompt:4320`(压成单行,58 字截断)+ `QueuedSendMetaChips:4330`(附件 / 标记 / 插件 / 技能 / MCP / 连接器) |
| 状态所在 | **前端本地**:`apps/web/src/components/ProjectView.tsx:2533 queuedChatSends`;类型 `:677`;增删改 `:6414/6420/6429/6434/6451`;localStorage `od:chat-queued-sends:${projectId}:v1`(`:11945`,读 `:11948` 写 `:11968`,上限 100) |
| 入队判定 | `ProjectView.tsx:6646`(显式 `meta.queueOnly`)与 `:6659`(`currentConversationBusy`,计算于 `:2653`) |
| 自动出队 | `ProjectView.tsx:8456–8510`(空闲即取队首重放,`{ queueDrain: true }`) |
| 立即发送会打断当前 run | `ProjectView.tsx:8383–8453 sendQueuedChatSendNow` → 调 `handleStop()`(:8440) |
| 第二处消费者 | `apps/web/src/components/workspace/SideChatTab.tsx:25–56` 透传;`useConversationChat.ts:37` 明确**不做队列** |
| 样式 | 全局:`apps/web/src/styles/chat.css:2202–2470` |
| i18n | `chat.queuedHeader/ToSend/Reorder/Edit/More/FollowUpFallback/Save/Cancel/EditQueuedTaskAria`(`i18n/types.ts:3492–3500`) |
| 埋点 | `trackMessageQueueClick`(`apps/web/src/analytics/events.ts:868`,契约 `packages/contracts/src/analytics/events/ui-click.ts:1030`,`area: 'message_queue'`);调用点 `ChatPane.tsx:3044/3055/3068` |
| 能否单挂做对照 | 能,但 `QueuedSendStrip` 未导出(是 `ChatPane.tsx` 内的模块级函数),陈列页要么改成导出、要么在新 `chat/` 下重写 |

### 1.3 组件 18 · 升级 / 额度

| 项 | 落点 |
|---|---|
| **流水里的升级卡** | **没有现成实现**。`ChatPane.tsx` / `ChatComposer.tsx` 里没有任何余额读数 |
| 硬拦(余额 ≤ 0) | `apps/web/src/components/AmrBalanceDialog.tsx`(+ `.module.css`)—— **居中弹窗**,`reason: 'insufficient' \| 'signed_out'`(:31);充值后轮询钱包续跑(:125–150) |
| 软提醒(余额 ≤ 2) | `apps/web/src/components/AmrLowBalanceDialog.tsx` —— 居中弹窗,`'proceed' \| 'recharge' \| 'dismiss'`(:18),带「不再提醒」持久化 |
| 阈值 | `apps/web/src/runtime/amr-balance-gate.ts:27 AMR_HARD_BLOCK_BALANCE_USD = 0`、`:35 AMR_LOW_BALANCE_WARN_USD = 2`;闸门入口 `checkAmrBalanceGate():275–320` |
| 挂载 | 对话侧 `ProjectView.tsx:11501–11520`(硬)/ `:11522–11530`(软);首页侧 `EntryShell.tsx:1710/1722` |
| 余额读数所在 | 顶栏模型切换器 `InlineModelSwitcher.tsx:920–932`(挂载于 `EntryShell.tsx:1625`)、侧栏 `EntryNavRail.tsx:1165`、头像菜单 `AvatarMenu.tsx:277–302` |
| 身份分支(Owner / 计费权限) | `EntryNavRail.tsx:433–500 workspaceUpgradeUrl()` —— **`canManageBilling !== true` 直接 `return null`(:452),即入口消失** |
| 身份分支(Max / 顶档) | `apps/web/src/collab/team-plan.ts` — `resolvePlanTier:78`、`isTopPlanTier:130`、`canUpgradeFromPlanTier:154`;`providers/daemon.ts:941 canUpgradeVelaPlan` |
| 四种弹窗的唯一实现痕迹 | `apps/web/src/components/InsufficientCreditsDialog.tsx` —— **死代码,零引用**(`UPGRADE_TARGETS:44`、`AUTO_RECHARGE_LIMITS:52`)。`run-error-catalog.md` Q-20 已点名 |
| 数据源 | 契约 `packages/contracts/src/api/amrWallet.ts`(`AmrWalletSnapshot:24`、`balanceUsd: string \| null :28`);取数 `providers/daemon.ts` 的 `fetchAmrWalletSnapshot` / `workspaceBillingBalanceUsd` |
| i18n | `chat.amrBalanceGate.*`(types.ts:2855–2867)、`chat.amrLowBalance.*`(:2868–2872)、`chat.amrArtifactUpgrade.*`(:2873–2886) |
| 能否单挂做对照 | 两个 Dialog 能(自带 module.css);但它们**不是稿子那个形态**,对照价值有限 |

### 1.4 组件 19 · 报错

| 项 | 落点 |
|---|---|
| 卡本体 | **没有独立组件文件**。内联 JSX 在 `apps/web/src/components/ChatPane.tsx:2765–2986`,壳是通用的 `apps/web/src/components/UserActionCard.tsx`(`dataKind="run-recovery"`) |
| 原因来源 | `ChatPane.tsx:1296–1303 failedRunErrorEvent` —— 反扫消息 `events` 找 `kind === 'status' && label === 'error'`(**正是 B18 要求的 `status(label: error).detail`**,可重放,不依赖临时 `error` prop) |
| 文案 / 动作决策表 | `apps/web/src/runtime/amr-guidance.ts` —— `RunFailurePrimaryAction:179`(`retry \| authorize \| recharge \| upgrade \| launch-terminal-auth \| launch-terminal-switch-model \| none`)、`RunFailureUi:248–265`、**`resolveRunFailureUi():496–665`**;兜底分支 `:659–665`(`title.generic` + 原始串 + retry) |
| 色调 | `ChatPane.tsx:1535–1542 runErrorTone`(authorize/recharge/upgrade → brand;`AGENT_CONNECTION_DROPPED` → warning;其余 danger) |
| 「复制详情」 | `ChatPane.tsx:1547–1559 copyErrorDiagnostic`,按钮 `:2785–2793`,文本 `buildRunErrorDiagnosticText:4534`(含 error_code / runId / projectId / conversationId / agentId) |
| 「切到 Cloud」 | **另一张卡**:`apps/web/src/components/AmrGuidance.tsx`,挂在报错卡下方 `ChatPane.tsx:2988–3005`,由 `runFailureUi.showSwitchCard` 控制 |
| BYOK 逃生口 | `ChatPane.tsx:2802–2810`(`t('avatar.useLocal')`),开关 `showByokRecoveryCta:1602–1603`,由 `ProjectView.tsx:11211/11220` 接线 |
| 可续跑 | `ChatPane.tsx:1480–1483 canResumeFailedRun`;契约字段 `ChatSseEndPayload.resumable`(`packages/contracts/src/sse/chat.ts:95`) |
| 失败分类(daemon 侧) | `apps/daemon/src/run-failure-classification.ts`(`classifyRunFailure:1038`、`isResumableFailure:610`);写到终帧 `apps/daemon/src/runtimes/runs.ts:524/1135/1214` |
| 样式 | 全局:`apps/web/src/styles/chat.css` — `.run-error__details:965`、`.run-error__diagnostic:987`、`.chat-error-action:1098`、`.chat-error-retry:1114`、`.amr-card__*:1179–1210`;卡壳是 CSS Module `UserActionCard.module.css` |
| **联系支持** | **没有任何实现**。全仓仅有 `EntryNavRail.tsx:101` 的 `mailto:support@open-design.ai`(账号菜单里一枚小图标)与 `EntryHelpMenu.tsx:31` 的 `DISCORD_URL`。`apps/web/src` 里**搜不到飞书 / feishu / lark** |
| **导出日志** | chat 里**没有**。只有剪贴板复制诊断串;真正的导出是 `ExportDiagnosticsButton.tsx`,只挂在 `SettingsDialog.tsx:64` |
| 能否单挂做对照 | **不能整块单挂**。它绑死在 5123 行的 `ChatPane` 上(`onRetry` / `onResumeRun` / `onSwitchToAmrAndRetry` / `onLaunchAntigravityOauth` / AMR 登录 pill 的真实轮询)。陈列页只能用 `UserActionCard` + 纯函数 `resolveRunFailureUi` 重搭 |

### 1.5 组件 20 · 暂停任务

| 项 | 落点 |
|---|---|
| 稿子要的那一行 | **没有实现**。全仓(web / daemon / contracts)搜不到 pause / paused / 已暂停 的产品语义 |
| 手动停止入口 | `apps/web/src/components/ChatComposer.tsx:3371–3384`(`button.composer-send.stop`,`t('chat.stop')`) |
| 停止处理 | `apps/web/src/components/ProjectView.tsx:8312 handleStop` → `:12580 finalizeActiveAssistantMessagesOnStop`(把活跃消息置 `runStatus: 'canceled'` + `endedAt`);同时 POST `/api/runs/{id}/cancel`(`providers/daemon.ts:1265–1275`) |
| 今天用户看到什么 | 一个词。`AssistantFooter`(`AssistantMessage.tsx:1616`,标签 `:1662`)显示 `assistant.canceledLabel` = 「已取消」/「Canceled」;有执行折叠时是 `TaskActivityCard` 的 `task-state-canceled`(`:3792–3801`) |
| 与失败的区分 | 客户端只有 `runStatus === 'canceled'` vs `'failed'`。**注意 `AssistantMessage.tsx:899–901` 把 canceled 也折进了 `runFailed`**,所以停止的一轮今天会带上失败态的动作 |
| 服务端有更细的字段但 web 没用 | `RunCancelOrigin`(`packages/contracts/src/api/chat.ts:644`,枚举在 `analytics/events/shared-enums.ts:220–224`:`user_stop \| project_cleanup \| daemon_shutdown \| unknown`,注释原话「Only `user_stop` proves the user explicitly stopped this run」);daemon 写于 `apps/daemon/src/runtimes/runs.ts:1440/1486`。**`grep -rn "cancelOrigin" apps/web/src` 零命中** |
| 新写的(未接线) | `apps/web/src/runtime/chat/contract.ts:123–132` —— `ShellStatus = 'running' \| 'done' \| 'failed'` + **`stopped: boolean` 旗标**;`build-turn-blocks.ts:462–470` 已把 canceled 转成 `shell.stopped`;`ExecutionShell.tsx:36/43–46/73` 已消费。**但没有组件画那一行,`chat.record.*` 也没有对应 key** |

### 1.6 组件 22 · 重连

| 项 | 落点 |
|---|---|
| UI | **零实现**。chat 里没有任何重连指示;`styles/chat.css` / `viewer/composio.css` 无 reconnecting 类,chat 域无对应 i18n key |
| 机制 | `apps/web/src/providers/daemon.ts:1283` —— `for (let reconnects = 0; endStatus === null && reconnects < 5;)`。**上限正好是 5**,与稿子的「N/5」对上 |
| 传输方式 | `fetch` + `ReadableStream` + `?after=<lastEventId>` 游标。**全仓 `apps/web/src` 无 `EventSource`** |
| 计数递增 / 归零 | `:1296`(fetch 抛错)、`:1457` `reconnects = shouldResetReconnects ? 0 : reconnects + 1`;看到真实进度(`sawStreamProgress:1425`)就归零,只收到 error 帧不归零(`:1452–1455`) |
| 用尽之后 | `handlers.onError(new Error('daemon stream disconnected before run completed'), DAEMON_STREAM_DISCONNECTED)`;常量在 `providers/daemon.ts:407 GENERIC_DAEMON_DISCONNECT_CODE` |
| 是否暴露给 UI | **否**。`reconnects` 是循环内局部变量;`DaemonStreamHandlers`(`providers/daemon.ts:273`)没有 `onReconnect` / `onConnectionLost` / `retryCount` 任何回调 |
| 已有测试 | `apps/web/tests/providers/sse.test.ts:2030`(重连)、`:2113`(只收 keepalive 仍重连)、`:2138–2164`(用尽后报 `DAEMON_STREAM_DISCONNECTED`) |
| 唯一沾边的「Reconnecting」UI | 终端查看器,不是 chat:`workspace.terminalReconnecting`(en.ts:2812),渲染于 `components/workspace/TerminalViewer.tsx:462` |
| 可复用的壳 | `record.module.css` 的 `.tool`(:131)+ **`.shimmer` 扫光已实现**(:295–320,含 `prefers-reduced-motion` 兜底 :354)+ `primitives/Orb.tsx` |

### 1.7 模拟器里已有的原型(可直接翻成 TS,别重写)

| 组件 | 原型函数 |
|---|---|
| 22 重连(三态全) | `docs/design/chat-sim/render-client.js:74 reconnect()` |
| 17 Queue | `render-client.js:83 queue()`;dock 组合 `:125 dock()`(重连行在队列之上) |
| 18 升级 | `render-cards.js:154 upgrade()` |
| 6 Plan 卡收起胶囊 | `render-cards.js:102 planPill()`(全做完时不渲染 —— 稿子没画那一态,S17) |
| 19 报错 | `sim.js:539` —— **只是替换设计稿静态片段的 `.d`**,没有建模 19-2 / 19-3 |
| 20 暂停 | `sim.js:537` —— `<div class="stopline">已手动暂停任务</div>`,**没带 8/21 版新加的图标** |

---

## 2. 第 70–84 格逐格差异清单

> 分类标记:**〔样式〕** 纯样式 / 文案 · **〔形态〕** 形态差异 · **〔数据〕** 数据侧做不到或要先开口子。
> 「稿」= `docs/design/chat-panel-next.html`,括号里是该文件行号。

---

### 70 · 6-1 · Plan 卡 · 执行中 · 随进度逐条打勾

**稿子**(4762;CSS `.card:has(> .h + .steps)` 2112 / `.steps` 2114)
`.card`(定宽 380px)> `.h`(`orb[data-orb=solving]` + 「执行中」+ `.roll` 翻滚计数「2/4」)+ `ol.steps` 四条:`is-done` 灰 + 打勾划线、`is-now` 深色 600 + 转弧、未开始留虚线圈。限高 148px 滚动(说明写「限高约 5 步」)。**无操作**。

**现在**
`TodoCard`(`ToolCard.tsx:256`)钉在输入框上方,头是折叠按钮 + `{done}/{total}`,列表 `.todo-item` 四态(`completed ✓ / in_progress ◐ / stopped ! / else ○`,:378–387)。另有新写的 `PlanRow`(`ExecutionShell.tsx:138`)把清单画成壳里一段「执行计划 · N 步」。

**差在哪**
- **〔形态〕这一格已拍板不做。** D33:「场景稿里那张『执行中 2/4』清单式任务进度卡不用,不实现、不模拟」;S9:「展开态的独立卡不做」。清单的正式落点是**组件 7 执行记录内的分段**(B17)。
- 因此本格的正确交付是:**陈列页照出这一格并写清「按 D33 / S9 不做」**,而不是去对齐。若日后要做,`.roll` 翻滚计数(`.card > .h .roll` 3623–3626)是唯一需要自写的动效。

---

### 71 · 6-2 · Plan 卡 · 收起 · 只留「第 N / M 步」,悬停浮出整张清单

**稿子**(4776;CSS `.pdemo` 2069 / `.pmini` 2070 / `.pmini .pill` 2071 / `.pmini .pop` 2080)
`.pmini` > `.pop`(绝对定位在胶囊**上方** 8px,`min-width 232px`/`max-width 320px`,`--shadow-lg`,`opacity` 过渡,`pointer-events:none`,hover 才 1)+ `button.pill`(圆角胶囊,`orb[data-orb=solving]` + 「第 3 / 4 步」)。
`.pdemo{padding-top:136px}` 只是画廊给浮层留的空间,**不实现**(同 D31 的性质)。
浮层里的 `ol.steps` 复用同一套四态圆,`max-height:none`(不滚)。

**现在**
最接近的是 `TodoCard` 的收起态:`op-todo-collapsed`(:296)+ `.op-meta` 的 `{done}/{total}`(:313)+ `.op-todo-current` 当前步文字(:318,样式 `composio.css:821`)。

**差在哪**
- **〔形态〕卡 vs 胶囊。** 现在是一张有框有底、可原地展开的卡;稿子是一枚胶囊 + hover 浮层,**展开不占位**。
- **〔形态〕计数口径不同。** 稿子「第 N / M 步」= *当前正在做第几步*;现有 `{done}/{total}` = *已完成几步*(且 `done` 把 `in_progress` 也算进去了,`ToolCard.tsx:283–285`)。两者在同一份清单上会给出不同数字。
- **〔数据〕当前步序号拿得到**,靠 D36「隐式进行中」(清单里没有任何 `in_progress` 时,第一条未完成的就是当前);codex 原生清单没有进行中这一档,不套 D36 就算不出 N。
- **〔样式〕** `.pmini .pop` 要 `--chat-shadow-lg`,而 `ChatRoot.module.css` 现在**只定义到 `--chat-shadow-md`**(:103–104 / :186–187),要新增(亮暗两个作用域)。
- **本期状态**:S9 明确「本次提测范围外;做的时候只做胶囊 + 悬停清单」。
- **⚠ 与 B17 直接冲突**,见 §4 R1。
- **〔数据〕全做完时胶囊写什么,稿子没画**(S17 待设计答);模拟器 `planPill()` 的做法是**不渲染**。

---

### 72 · 17-1 · Queue · 排队中 · 生成中按发送即进入

**稿子**(5234;CSS `.queue` 2951 / `.queue .q` 2954)
`.queue` —— **不套框、不铺底**(CSS 2939 注释原话:「输入框自己已经是一个有边的东西,队列再套一圈,人得先分辨这两块是不是一回事」),只靠条与条之间 1px `--border-soft` 立起来;`max-height:122px; overflow-y:auto`。
每条 `.q`:**顶对齐**(align-items:flex-start,注释解释:两行消息时居中会让序号 / 手柄 / 按钮掉到文字块中间)= `.grip`(拖动排序,`cursor:grab`)+ `.ix`(mono 序号)+ `.tx`(2984,`-webkit-line-clamp:2`,**最多两行**)+ `.qops`(编辑 / 移除 / **引导对话** 三枚)。
**没有卡头** —— CSS 2974 原话:「不再单起一行卡头写『排队中 · N 条』:队列就贴在输入框底下,是什么一目了然」。

**现在**
`QueuedSendStrip`(`ChatPane.tsx:4096`),位置正确(:3039,PinnedTodoSlot 之下、composer 之上)。
有 `.chat-queued-send-header` 卡头「N Queued ↩ to Send」;每行 = grip + **单行**标题(`summarizeQueuedPrompt` 58 字截断,:4320)+ `QueuedSendMetaChips` + 三枚按钮 **编辑 / 立即发送 / 移除**;**没有序号**。样式全在 `styles/chat.css:2202–2470`。

**差在哪**
- **〔样式〕删卡头**(`.chat-queued-send-header` / `-heading`,chat.css:2240)。
- **〔样式〕补行首序号** `.ix`(mono、`--chat-text-soft`)。
- **〔样式〕文字从「58 字单行截断」改成 CSS 两行 line-clamp** —— 顺带删掉 `summarizeQueuedPrompt` 的截断逻辑(稿子 CSS 2942 注释解释了为什么给两行:「压成一行会把话截在半截,人就认不出自己要取消 / 调序的是哪一条」)。
- **〔样式〕删框与底**,只留条间分隔线;顶对齐。
- **〔形态〕三枚动作对不上。** 稿子 = 编辑 / 移除 /「引导对话」;产品 = 编辑 /「立即发送」/ 移除。
  - 「引导对话」**稿子里没有任何解释**(S11 已记为待问设计)。
  - 「立即发送」是产品已有能力,而且它会 `handleStop()` **打断当前 run**(`ProjectView.tsx:8440`)。**照稿删掉 = 砍掉一个已上线的能力**,见 §4 R4。
- **〔形态〕`QueuedSendMetaChips` 稿子没有。** 它把附件 / 标记 / 插件 / 技能 / MCP / 连接器摊出来,是「所见即所发」的信任面。稿子的两行文字装不下,删掉是能力回退。
- **〔数据〕全部做得到** —— 队列是纯前端 localStorage 状态,不依赖 daemon 或 agent 能力。
- **〔样式〕拖动手柄的 tooltip**:稿子用 `data-tip` + `mod-tip-s`(向下),产品用 `od-tooltip` + `data-tooltip-placement="right"`。

---

### 73 · 17-2 · Queue · 条数多 · 限高约三行半,其余滚动

**稿子**(5265)六条,靠 `.queue{max-height:122px;overflow-y:auto}` 截。CSS 2944 把 122 的来历写死了:单行 = 7px×2 内边距 + 20px 行高 = 34px,加 1px 分隔线,3.5 × 35 ≈ 122;**露出的半行就是「下面还有」的提示**。CSS 2947 特别强调:**限的是高度不是条数**,两行消息时可见条数不足三条半是对的。

**现在**
固定显示 4 条(`QUEUED_SEND_VISIBLE_ROW_COUNT = 4`,:4284),其余折成「+N more queued」文本行(`.chat-queued-send-overflow`,chat.css:2450);列表加 `is-scrollable` 类。

**差在哪**
- **〔样式〕** 把「按条数截 + `+N` 行」换成「`max-height:122px` + 滚动」。删 `.chat-queued-send-overflow` 与 `chat.queuedMore` 这个 key。
- 没有形态或数据差异。

---

### 74 · 17-3 · Queue · 出队 · 变成一条普通消息,队列少一条

**稿子**(5274)队首变成流水里一条 `.msg-me` 气泡,队列剩两条,**序号重排为 1、2**。

**现在**
自动出队已实现(`ProjectView.tsx:8456–8510`,空闲即取队首重放),队列本来就没有序号所以不存在重排问题。

**差在哪**
- **〔样式〕** 序号随 72 的 `.ix` 一起做,重排是数组下标自然结果。
- **本格是这一族最接近对齐的一格,零形态差异、零数据差异。**
- 一个要记的边界:AMR 余额闸门会**暂停**队列自动出队(`amrGatePausedQueueConversationsRef`,`ProjectView.tsx:2442` 注释)。此时队列停在那儿不动,稿子没画这一态。

---

### 75 · 18-1 · 升级 · 额度不足 · < 5 美金

**稿子**(5297;CSS `.up` 3000,注释 3009 / 3028 / 3034)
`.up` 卡 = `.h`(`.amt > .n`「剩余额度 **$3.20**」,金额 mono 700 **`#f8672f` 橙硬编码**;`.n` 本身 `#353535` 硬编码)+ `Upgrade` 主按钮(带图标,`.up .h .btn{padding:8px}`(3093)是这张卡专属的覆盖)+ `p.why`「余额可能撑不完下一个任务 —— 中途用尽会停在半成品上」。
**位置**:场景稿 4491 把它画在**对话流水里**,排在回合状态行(`.fb`)之后。
CSS 里 `.up .meter` 刻度条样式留着但标记里已删(注释 3038:「哪天要回来就是」)—— **不实现**。

**现在**
流水里没有这张卡。最接近的是 `AmrLowBalanceDialog`(**居中弹窗**,阈值 `AMR_LOW_BALANCE_WARN_USD = 2`,带「不再提醒」opt-out),以及顶栏 `InlineModelSwitcher` 的余额文案。

**差在哪**
- **〔形态〕弹窗 → 流水内卡片。** 这是最大的一处:今天是打断式的,稿子是非打断式的(和 D4「不阻塞」同一个价值取向)。
- ~~**〔形态〕阈值 $2 → $5**~~ → **已关闭:维持 $2**(产品 2026-09-04 拍板,原话「然后是 $2」)。放大触发面这个顾虑成立,工单 OPEND-2597 里「额度 < 5 美金」的说法作废。
- **〔形态〕出现时机没有规格。** 「流水里的一张卡」到底什么时候插进去(每轮末?余额跨过阈值那一刻?一次会话只出一次?),稿子和 `chat-panel-next.md` 都没写。**必须定,否则实现只能自行拍板。**
- **〔样式〕稿内不一致**:cmp-ops 写「**关闭** — 本次会话不再提示」,但 DOM 里**没有关闭键**。按 `components/chat/AGENTS.md` §6「以说明文字为准」→ 需要一枚关闭键,请设计补(现有 `AmrLowBalanceDialog` 的「不再提醒」正好是这个语义)。
- **〔样式〕稿内不一致**:cmp-ops 写「展示当前用量与受影响的能力」,DOM 只有余额 + 一句 why,**没有用量、没有能力清单**。
- **〔样式〕两处硬编码要抽 `--chat-*`**(`chat-panel-next.md` §7 已点名):金额橙 `#f8672f`、`.amt .n` 的 `#353535`。
- **〔数据〕余额拿得到**(`AmrWalletSnapshot.balanceUsd`),做得到。

---

### 76 · 18-2 · 升级 · 额度耗尽 · = 0 美金

**稿子**(5305)同一张 `.up`,`.amt` 加 `.is-out`(金额转 `--red`,CSS 3023),`.why` 换成「现在无法开始新任务」。

**现在**
`AmrBalanceDialog` —— **硬阻断**弹窗(`AMR_HARD_BLOCK_BALANCE_USD = 0`,`amr-balance-gate.ts:27`),挡住发送,充值到账后轮询钱包自动续跑(:125–150)。

**差在哪**
- **〔形态〕阻断弹窗 → 流水内卡片**。稿子这张卡**不阻断**,但文案说「现在无法开始新任务」;今天是真的按不下发送。两者要对齐成一种。
- **⚠〔形态〕与已定产品口径冲突**:`docs/design/run-errors/error-ux-design.md` §3 明确「**付费用户余额 0 = 不限量,不拦**」(对应 OD #7190 已合、`run-error-catalog.md` R-010 与 Q-05)。稿子这一格是「= $0 → 无法开始」。见 §4 R3。
- **〔数据〕** 「付费档 0 余额 = 无限」要按 plan 判定,不能只看余额数字 —— `collab/team-plan.ts` 的 `resolvePlanTier:78` 是现成判据。

---

### 77 · 18-3 · 升级 · 点 Upgrade 后 · 跳 Web 端,按身份分四种弹窗

**稿子**(5313,`.up.branch`)—— 这一格**不是 UI,是一张说明表**,四行:

| 身份 | 稿子说要出什么 |
|---|---|
| 非 Max · Team Owner | 升级弹窗 |
| 非 Max · 非 Owner | 提醒弹窗 — 提示联系管理员 |
| Max · Team Owner | 自动充值弹窗 |
| Max · 非 Owner | 提醒弹窗 |

cmp-ops:「升级 — 跳订阅页」。

**现在**
两条身份轴都在,但**结论完全不同 —— 今天是「隐藏入口」,稿子是「换一种弹窗」**:
- Owner / 计费轴:`workspaceUpgradeUrl()`(`EntryNavRail.tsx:452`)在 `canManageBilling !== true` 时 **`return null`**,消费方(`InlineModelSwitcher.tsx:949–952`、`AvatarMenu.tsx:277–279`)据此**不渲染按钮**。
- Max / 顶档轴:`canUpgradeFromPlanTier`(`team-plan.ts:154`)/ `isTopPlanTier:130` 顶档返回 false,同样是**隐藏**。
- 「自动充值弹窗」:**零实现**。唯一痕迹是死代码 `InsufficientCreditsDialog.tsx`(`AUTO_RECHARGE_LIMITS:52`、`UPGRADE_TARGETS:44`,Max/team 走空数组即自动充值)。

**差在哪**
- **〔形态〕「隐藏」→「提醒弹窗」**:非 Owner 今天看不到按钮,稿子要他看到按钮、点了告诉他找管理员。这与报错设计方案 §3「团队 vs 个人:团队成员看『通知管理员』」是同一诉求,方向一致。
- **〔数据〕「自动充值弹窗」做不到** —— web 端没有任何自动充值 UI 或接口调用。
- **〔范围〕这四格是「跳 Web 端」之后的事**(cmp-ops:「跳订阅页」),弹窗可能长在 vela web 而非 chat panel 里。**先确认这一格是不是我们的活**,别默认接下来。

---

### 78 · 19-1 · 报错 · 通用错误 · 白卡,红只留在标题那一行

**稿子**(5338;CSS `.errb` 3113,注释 3105 / 3131 / 3142)
`.errb`(定宽 380px,白底,`padding:10px 11px`)=
- `.t` 标题行:红图标 + 「任务失败」,`--t-head`/600/`--red`,底部 1px `--border-soft` 分隔线;
- `.d` 正文:人话原因,`--t-mini`/`--text-muted`。示例原文「构建到设置页时找不到商品卡组件 —— 前面抽组件那一步没落盘成功。已生成的列表页不受影响。」;
- `.ops` 动作排:`flex-wrap` + **右对齐**,三枚 —— 「联系支持」`mod-secondary` / 「导出日志」`mod-secondary` / 「从失败处重试」`mod-primary`。
8/21 版给重试按钮加了转圈动画 `.rt.is-spinning`(§1.5 已记)。
CSS 3105 注释解释了为什么白底不红底:「红底又和下面那三个按钮抢注意力」。

**现在**
`ChatPane.tsx:2765–2986` 内联 JSX + `UserActionCard`;标题走 `chat.runError.title.*`(21 个 key,types.ts:2890+);正文与主动作由 `resolveRunFailureUi`(`amr-guidance.ts:496–665`)按 error code / detail / agent 分流,**主动作只有一枚**,取值 `retry / authorize / recharge / upgrade / launch-terminal-auth / launch-terminal-switch-model / none`;另有 `.run-error__diagnostic` 原始错误折叠区 + 「复制详情」;卡下面还挂一张 `AmrGuidance` 切换卡。

**差在哪**
- **〔样式〕文案**:「复制详情」→「导出日志」(§1.5 已记);D39 还要求把图标换成产物卡那枚导出图标(稿子更新后撤销这层借用)。
- **〔样式〕按钮规格**:全部收成 `.btn.mod-sm`(26px / 12px / 600 / 胶囊)+ `mod-secondary`(B16);右对齐;标题红只留一行。
- **〔样式〕`.d` 为空时不编一句**(B18 明写)。
- **⚠〔形态〕动作集合。** 稿子是**三枚固定**动作,产品是**按错误分流的一枚主动作 + 若干条件动作**。而 `error-ux-design.md` 原则 4 明确「**重试只在有用时出现**」(额度用完 / 封号 / CPU 不支持这类不给重试)。**稿子的「从失败处重试」常驻与那条原则直接冲突**,见 §4 R2。
- **〔形态〕原始错误折叠区**:稿子没有,产品有(`.run-error__diagnostic`,chat.css:987)。`run-error-catalog.md` Q-21 还在讨论这一区默认显示什么。删掉会丢排障能力,见 §4 R5。
- **〔形态〕`AmrGuidance` 第二张卡**:稿子没有;它今天承担「切到 Open Design 智能体」的引导(报错设计方案说这句只在两处出现)。
- **〔数据〕原因取值**:B18 要求取 `status(label: error).detail` —— `failedRunErrorEvent`(`ChatPane.tsx:1296–1303`)正是这条,**做得到**。
- **〔数据〕「导出日志」在 chat 里没有实现**:只有剪贴板复制。要么复用 `ExportDiagnosticsButton.tsx`(现只挂 `SettingsDialog.tsx:64`),要么另开。
- **〔样式〕稿内不一致**:组件稿(5342)「联系支持」是带字的 `mod-secondary`;场景稿(4429)是 `mod-ghost mod-sm mod-icon` 纯图标 + tooltip。按 §6「两者都画了的以组件稿为准」→ 用带字版,但记进待决。

---

### 79 · 19-2 · 报错 · 特殊错误 · 运行环境为 CLI / BYOK

**稿子**(5352)同一张 `.errb`,标题「本地环境跑不动这一步」,正文「当前运行在 CLI / BYOK 环境,这一步需要云端算力。切到 Cloud 可以接着跑,已完成的部分会带过去。」,动作只有两枚:「导出日志」`mod-secondary` + 「**切换到 Cloud**」`mod-primary`(5357)。
**没有重试,没有联系支持。** cmp-ops:「切换到 Cloud — 已登录直接切,未登录先登录。」

**现在**
等价能力在,但是**第二张卡**:`AmrGuidance`(`ChatPane.tsx:2988–3005`),开关 `runFailureUi.showSwitchCard`(在 `AGENT_AGNOSTIC_FAILURE_UI` 与登录类分支上置 true,`UPSTREAM_UNAVAILABLE` 时被排掉,`ChatPane.tsx:1575`)。反方向的 BYOK → 本地 CLI 逃生口是报错卡里的 `t('avatar.useLocal')` 按钮(:2802–2810)。

**差在哪**
- **〔形态〕两张卡 → 一张卡。** 把 `AmrGuidance` 的主 CTA 收进报错卡的 primary 位。
- **〔样式〕文案逐字替换**:现有 `chat.amrCard.switchTitle/switchBody/switchCta` 换成稿子原文。
- **〔数据〕做得到** —— `showSwitchCard` 已经在算,`onSwitchToAmrAndRetry` 已经接线。
- **⚠ 但这一格的文案对不上最大的真实场景。** 稿子写的是「需要云端算力」;而 `error-ux-design.md` 的 **S08 供应商额度用完(每月 23,333 次、9,220 台设备、环比 ↑55%、P0 第一大类,今天一个按钮都没有)** 才是这张卡最该承接的内容,它的文案是「{供应商} 的额度用完了 —— 这是你在 {供应商} 那边的额度,重试不会恢复」。**卡面能复用,文案要产品给第二套。**

---

### 80 · 19-3 · 报错 · 联系支持 · 全局弹窗

**稿子**(5365;CSS `.ovl` 2670 / `.modal` 2672,注释「全局弹窗:联系支持」2664)
`.ovl` 遮罩(`color-mix(in srgb, var(--text-strong) 26%, transparent)`,`place-items:center`)+ `.modal`(max-width **316px**,`--radius-lg`,`--shadow-lg`)=
- `.mh`:「联系支持」+ 关闭 `×`(24px,hover 变底);伪元素画分隔线;
- `.mb` > 两条 `.chan` **同一副行壳**:26px logo(`.ci`)+ 名字(`.cn`)+ 「加入」按钮(`btn mod-primary mod-sm`)。两条是 **飞书社群** 与 **Discord**。

cmp-ops 把设计意图写死了:「开一个【全局弹窗】,不是在报错卡里展开一块……而且这个弹窗**从设置、帮助菜单也进得来,它本来就不属于报错卡**。弹窗里直接给东西,不给二级跳转……两条本来就是同一件事(进群),形状一分反而要人先判断『为什么这个要扫、那个要点』。」
对应 **D6**(评审录音拍板,压过设计师「比较阻断」的顾虑)。

**现在**
**没有任何实现。**
- 无支持弹窗 / 对话框 / 卡内链接;`contactSupport` / `supportUrl` 在 `apps/web/src/components` 零命中。
- 只有 `EntryNavRail.tsx:101` `mailto:support@open-design.ai`(账号菜单社交行里一枚图标,:1051–1061)与 `EntryHelpMenu.tsx:31` `DISCORD_URL = 'https://discord.gg/mHAjSMV6gz'`。
- **飞书 / feishu / lark 在 `apps/web/src` 里一个字都没有。**

**差在哪**
- **〔形态〕全新建。** 而且按 `components/chat/AGENTS.md` §1 的分层判断,「离开 chat 还通用吗?→ 是」(设置 / 帮助菜单也要能进),所以**它不该落在 `components/chat/` 下**,应落 `apps/web/src/components/`。见 §4 R12。
- **〔数据〕飞书群入口是缺口** —— 没有这个 URL / 二维码常量,要产品给。Discord 的可直接复用 `EntryHelpMenu.tsx:31`。
- **〔样式〕** 需要 `--chat-shadow-lg`(同 71 格)与遮罩色;遮罩可用 `color-mix(in srgb, var(--chat-text-strong) 26%, transparent)`,不必新开 token。
- **⚠ 事实更正**:`run-error-catalog.md` §5 的 F10 行写着「『联系支持』(**已有全局弹窗**)」——**与代码不符**,那一行要改。

---

### 81 · 20-1 · 暂停任务 · 默认 · 一句话,到此为止

**稿子**(4264;CSS `.stopline` 2769)
`.stopline` = ⏸ 实心圆图标(14px,`currentColor`)+ 「**已手动暂停任务**」,`--t-mini` / `--text-muted`,一行。**8/21 版新加了图标**(§1.5)。
cmp-ops 四条边界写得很死:
1. **无操作**,只有这一句话;
2. **不摊剩余步骤** —— 「是你自己按的暂停,剩几步、分别叫什么,上面那段执行记录本来就写着」(= D5);
3. **断线不走这一行** —— 由 22 · 重连全程接管;
4. **剩余为 0 时这一行也不出现** —— 那一轮已经跑完,而「这轮被你停了」由**回合状态行(组件 15)**报,状态词是「已手动停止」(稿 5149,`.fin.mod-stop`)。
场景稿顺序(4479 → 4485):`.stopline` 在上,`.fb` 回合状态行在下。

**现在**
**这一行不存在。** 手动停止只把 `runStatus` 置 `'canceled'`(`ProjectView.tsx:8312 / 12580`),用户看到的是 `AssistantFooter` 里一个词「已取消」(`assistant.canceledLabel`,`AssistantMessage.tsx:1662`)。
新写的数据层已经准备好了:`build-turn-blocks.ts:462–470` 把 canceled 转成 `shell.stopped = true`,`ExecutionShell.tsx:36/43–46/73` 已消费,壳头保持「进行中」、秒数停住(契约注释 `runtime/chat/contract.ts:123–132`)。**缺的只是画那一行的组件和文案。**

**差在哪**
- **〔形态〕新增一个块**(纯展示、零逻辑),插在壳之后、回合状态行之前。
- **〔样式〕新 i18n key**「已手动暂停任务」,20 个文件全补(`chat.record.*` 现有 16 个 key,`types.ts:5458–5473`,没有这一条)。模拟器 `sim.js:537` 那行**缺图标**,是 8/21 之前的版本。
- **⚠〔数据〕真实缺口:web 分不出「是谁停的」。** 稿子的「已手动暂停」预设是用户按的;今天 `runStatus: 'canceled'` 把「用户按停」和「daemon 关机 / 项目清理杀掉」混成一种。契约里有现成的 `RunCancelOrigin`(`packages/contracts/src/api/chat.ts:644`,`user_stop | project_cleanup | daemon_shutdown | unknown`,daemon 写于 `runtimes/runs.ts:1440/1486`),但 **`apps/web/src` 零引用**。不接上,这一行会在 daemon 重启时**谎报**。见 §4 R8。
- **〔数据〕「剩余为 0 时不出现」判据已有**:`unfinishedTodosFromEvents`(`runtime/todos.ts:72`,B17 明确保留)。
- **〔形态〕顺带要拆的一处**:`AssistantMessage.tsx:899–901` 把 canceled 折进 `runFailed`,所以停止的一轮今天会带上失败态动作 —— 与「暂停只有一句话、无操作」冲突。
- **边界提醒**:状态词「已手动停止」属于**组件 15**(第 39 格),不在本族;本格只负责那一行文案。

---

### 82 · 22-1 · 重连 · 重连中 · 第几次 / 共几次,可展开看详情

**稿子**(4354;CSS `.tool` 2207 / `.shimmer` 1529,注释 3327)
一行 `.tool`(和工具行**同一副壳**:1px 边、`--radius`、白底)= `orb[data-orb=searching][data-orb-box=24]` + `.nm > .shimmer`「正在重新连接`<span class="cnt">2/5</span>`」+ `.ch` 展开箭头(`aria-label="查看详情"`)。
`.shimmer` 是彩带扫光(1.5s 扫 + 1s 停,一轮 2.5s;`font-weight:500`),字号 `--t-body` —— CSS 1552 注释把这三句(思考中 / 进行中 / 正在重新连接)定义为「流水里**会动的那一行**,它们要先被看见」。
cmp-meta:「**流水里的一行**,恢复后自动消失」;cmp-ops:「恢复后整行消失,**不留『已恢复』**」。

**现在**
**零 UI。** 机制只活在 `providers/daemon.ts:1283` 的循环里,**上限正好 5**(与稿子的 N/5 对上);`reconnects` 是局部变量,`DaemonStreamHandlers`(:273)没有任何暴露它的回调。

**差在哪**
- **〔形态〕新建,但壳全是现成的**:`record.module.css` 的 `.tool`(:131)+ **`.shimmer` 已实现**(:295–320,含 `prefers-reduced-motion` 兜底 :354)+ `primitives/Orb.tsx`。`ToolRow` 的 props(`primitives/contract.ts:44–63`)不含 orb / 计数 / 尾部动作,**要么扩 `ToolRowProps`,要么新起一个消费同一 Module 的组件**(按 AGENTS.md §1b,样式改动落在 `record.module.css` 这一个文件)。
- **〔数据〕必须先开口子**:在 `DaemonStreamHandlers` 上加一个回调(如 `onReconnect(attempt, max)`),把 `reconnects` 与上限送出来。**这是 web provider 的改动,不动 daemon。**
- **⚠〔数据〕展开「断在哪」做不到。** cmp-ops 说点 ⌄ 能看「接口 / 超时 / 服务端」,但那条循环**不区分断因**(fetch 抛错 / 流提前关 / 只收到 keepalive 都进同一条路径)。要么先补分类,要么这一格**先不做展开箭头并在陈列页写清原因**。
- **⚠〔数据〕计数会倒退。** `reconnects = shouldResetReconnects ? 0 : reconnects + 1`(:1457),看到真实进度就归零。稿子的「2/5 → 5/5 → 失败」是单调递增的叙事,归零后用户会看到 3/5 又变回 1/5。见 §4 R7。
- **⚠〔形态〕位置矛盾**:组件稿说「流水里的一行」,场景稿(4436)把它画在 `.dock > .dock-note`(输入框上方,队列之上),而且用 `svg.wifi` 不是 orb。S10 已记图标那半,**位置那半还没记**。见 §4 R6。

---

### 83 · 22-2 · 重连 · 最后一次 · 5/5,下一格就是失败

**稿子**(4360)与 82 **完全同一段 DOM**,只有 `.cnt` 从 `2/5` 变 `5/5`。

**现在** 同 82(零 UI)。

**差在哪**
- **不是独立形态,只是数据到边界。** 做完 82 这一格自动成立;陈列页两格并排是为了让设计确认「5/5 时不换任何样式」这件事本身。
- 唯一要确认的:计数归零(见 R7)会让「5/5」这一态在真实运行里**几乎出不来**。

---

### 84 · 22-3 · 重连 · 重连失败 · 次数用尽,交回给人

**稿子**(4366)`.tool.is-fail`(`--red-border` 边 + `--red-bg` 底,CSS 2307)+ wifi-off 图标 + 「连接失败」+ `btn mod-secondary mod-sm`「**重新连接**」。
cmp-ops:「用尽后**停止自动重连**,换成『重新连接』交回给人。」
设计稿总说明(4058)还特意写了一句:表里的「网络错误」在这份设计里**没有独立形态** —— 断线由 22 全程接管,任务真挂了由 19 给「从失败处重试」,**不再立第三个说法**。

**现在**
重连用尽后走 `handlers.onError(…, DAEMON_STREAM_DISCONNECTED)`(常量 `providers/daemon.ts:407`)。而 `resolveRunFailureUi`(`amr-guidance.ts:496–665`)的决策表里**没有这个 code**(只有 `AGENT_CONNECTION_DROPPED` 在 :614),所以它落进**兜底分支**(:659–665):标题 `chat.runError.title.generic`、正文是原始英文串、主动作 `retry`。
→ **今天用户看到的是一张「任务执行失败」的通用报错卡,而不是这一行。**

**差在哪**
- **〔形态〕通用报错卡 → 一行 `.tool.is-fail`**。
- **⚠〔形态〕19 与 22 今天在抢同一件事。** 必须把 `DAEMON_STREAM_DISCONNECTED` 从报错卡分流到组件 22(改 `amr-guidance.ts` 或在 `ChatPane` 拦一层),否则会同时出两个说法 —— 恰是设计稿 4058 明说要避免的。见 §4 R9。
- **⚠〔数据〕「重新连接」≠「重试」。** 稿子是重新接上**同一个 run 的流**(`?after=<lastEventId>` 续上,不新建 run);今天兜底给的 `retry` 是**新建 run**。技术上做得到(`streamRun` 已经带游标),但要在 provider 上新开一个「手动重连」入口。
- **〔样式〕** wifi-off 图标要从稿子抠(注意 §10 #20 记过的坑:抠图标先按位置切,别让正则跨过按钮边界)。

---

## 3. 要改哪些文件

> 我没有改任何文件。以下按「新建 / 改现有 / 要回写的文档」分三类。
> **`apps/daemon` 不需要改** —— 重连是 web transport 的事,`cancelOrigin` daemon 已经在写了。

### 3.1 新建(`apps/web/src/components/chat/` 下,各自共置 `.module.css`)

| 文件 | 覆盖格 | 备注 |
|---|---|---|
| `QueueStrip.tsx` + `.module.css` | 72–74 | 从 `ChatPane.tsx:4096` 迁出;拖拽逻辑可整段搬 |
| `UpgradeCard.tsx` + `.module.css` | 75–76 | 原型 `render-cards.js:154` |
| `RunErrorCard.tsx` + `.module.css` | 78–79 | 卡面按稿;动作集合建议保留 `resolveRunFailureUi` 的分流(见 R2) |
| `StopLine.tsx`(或直接进 `record.module.css`) | 81 | 只有一行,若与壳咬合就按 AGENTS.md §1b 落在 `record.module.css` |
| `ReconnectRow.tsx` | 82–84 | 复用 `.tool` + `.shimmer` + `Orb`;三态一个组件 |
| `PlanPill.tsx` | 71 | **本期不做**(S9);做的时候原型是 `render-cards.js:102` |

**不放 `chat/` 下的一个**:`SupportModal.tsx` 应落 `apps/web/src/components/`(设置 / 帮助菜单也要能进,按 AGENTS.md §1 第 1 问)。

### 3.2 改现有

| 文件 | 改什么 |
|---|---|
| `apps/web/src/components/chat/primitives/contract.ts` | 加 L1 props:`ReconnectRowProps`(orb / 计数 / 上限 / 失败态 / 展开)、`QueueItemProps`、`RunErrorCardProps`、`UpgradeCardProps` |
| `apps/web/src/components/chat/primitives/record.module.css` | 22 复用 `.tool` 时的增补(AGENTS.md §1b:加行 / 改缩进就改这一个文件) |
| `apps/web/src/components/chat/ChatRoot.module.css` | **新增 `--chat-shadow-lg`**(亮暗两个作用域;现在只到 `--chat-shadow-md`);升级卡金额橙 `#f8672f` 与 `.amt .n` 的 `#353535` 抽 token(§7 已点名) |
| `apps/web/src/i18n/types.ts` + 19 个 locale | 见 §3.4 的 key 清单 |
| `apps/web/src/providers/daemon.ts` | `DaemonStreamHandlers`(:273)加重连回调;新增「手动重新连接」入口(`?after=` 续流,不新建 run) |
| `apps/web/src/runtime/amr-guidance.ts` | 把 `DAEMON_STREAM_DISCONNECTED` 从兜底分支分流出去(交给组件 22) |
| `apps/web/src/runtime/amr-balance-gate.ts` | 阈值 `AMR_LOW_BALANCE_WARN_USD` 2 → 5(**待产品同意**);硬阻断是否改成非阻断卡 |
| `apps/web/src/components/ChatPane.tsx` | 换掉 `QueuedSendStrip`(:4096/:3039)与报错卡(:2765–2986);挂 StopLine / ReconnectRow;`AmrGuidance`(:2988–3005)收进报错卡 |
| `apps/web/src/components/ProjectView.tsx` | 升级卡插流水的位置;`AmrBalanceDialog`(:11501)/`AmrLowBalanceDialog`(:11522)去留;`finalizeActiveAssistantMessagesOnStop`(:12580)带上 `cancelOrigin` |
| `apps/web/src/components/AssistantMessage.tsx` | `:899–901` 把 canceled 从 `runFailed` 里摘出来 |
| `apps/web/src/styles/chat.css` | 删 `.chat-queued-send-*`(2202–2470)、`.run-error__*` / `.chat-error-*` / `.amr-card__*`(965–1210) |
| `apps/web/src/styles/viewer/composio.css` | 组件 6 收起态若改成胶囊,`.chat-pinned-todo`(708–760)整段要处理 |
| `apps/web/tests/components/chat/mirror-gallery.test.tsx` | **加第 70–84 格**(现在只有 1–27,断言写死 `Array.from({length: 27})` 于 :441) |
| `apps/web/tests/components/ChatPane.streaming.test.tsx` | `:239` 断言 CSS 里有 `.chat-queued-send-strip`、`:1413/:1567` 按类名 / testid 取节点 —— CSS Module 化后必红,按 AGENTS.md §5 迁到行为断言 |

### 3.3 要回写的文档

| 文件 | 改什么 |
|---|---|
| `specs/current/chat-panel-next.md` | §9.1 / Decisions needed 里补本文 §4 的 R1–R14;S9 与 B17 的冲突要单开一条 T 项;S10 补「位置」那半 |
| `specs/current/run-error-catalog.md` | §5 F10 行的「联系支持(**已有全局弹窗**)」与代码不符,要更正为「无实现」 |
| `docs/design/chat-mirror/README.md` | 覆盖范围从「1–27」扩到含 70–84 |
| 根 `AGENTS.md` | B17 已要求同 PR 改「Chat UI conventions」里 `PinnedTodoSlot` 那段;若 R1 裁决为「保留胶囊」,这段要按胶囊再写一次 |
| `docs/design/chat-sim/sim.js:537` | `.stopline` 补 8/21 版的图标(模拟器落后于稿子) |

### 3.4 需要新增的 i18n key(全部 20 个文件)

现有 `chat.record.*` 只有 16 个(`types.ts:5458–5473`),这一族一个都没有。**文案逐字取自设计稿,不改写**(B15 / AGENTS.md §0):

| 建议 key | 稿子原文 | 来源行 |
|---|---|---|
| `chat.edge.paused` | 已手动暂停任务 | 4264 |
| `chat.edge.reconnecting` | 正在重新连接 | 4354 |
| `chat.edge.reconnectFailed` | 连接失败 | 4366 |
| `chat.edge.reconnectCta` | 重新连接 | 4366 |
| `chat.edge.reconnectDetail` | 查看详情 | 4354 (aria) |
| `chat.edge.balanceLabel` | 剩余额度 | 5298 |
| `chat.edge.balanceLowWhy` | 余额可能撑不完下一个任务 —— 中途用尽会停在半成品上 | 5298 |
| `chat.edge.balanceOutWhy` | 现在无法开始新任务 | 5306 |
| `chat.edge.errorTitle` | 任务失败 | 5339 |
| `chat.edge.errorRetry` | 从失败处重试 | 5344 |
| `chat.edge.errorExportLog` | 导出日志 | 5343 |
| `chat.edge.errorContactSupport` | 联系支持 | 5342 |
| `chat.edge.errorCliTitle` | 本地环境跑不动这一步 | 5353 |
| `chat.edge.errorCliBody` | 当前运行在 CLI / BYOK 环境,这一步需要云端算力。切到 Cloud 可以接着跑,已完成的部分会带过去。 | 5354 |
| `chat.edge.switchToCloud` | 切换到 Cloud | 5357 |
| `chat.edge.supportTitle` | 联系支持 | 5367 |
| `chat.edge.supportJoin` | 加入 | 5372 / 5377 |
| `chat.edge.supportFeishu` | 飞书社群 | 5371 |
| `chat.edge.supportDiscord` | Discord | 5376 |
| `chat.edge.queueGuide` | 引导对话 | 5240 (aria) — **待 S11 答复后再定** |
| `chat.edge.planStep` | 第 {n} / {m} 步 | 4786 — **本期不做** |

可复用不新增的:`chat.queuedReorder` / `chat.queuedEdit` / `chat.comments.remove`(队列三枚)、`chat.amrCard.*`(切 Cloud 那句可能被稿子文案取代)。
**「Upgrade」按钮上的字稿子写的是英文原文**(5298),不要自作主张译成中文。

---

## 4. 形态级风险

> 每条都是「不裁决就会返工」的。R1–R3、R6、R10 需要产品 / 设计拍板;其余是工程内部可解但必须先记账的。

| # | 风险 | 证据 | 影响 |
|---|---|---|---|
| **R1** | **输入框上方到底还挂不挂清单 —— 规格自相矛盾。** B17 写「**钉在输入框上方的 TodoCard 退场**,同一份清单不再同时显示两处」;S9 写组件 6 的收起胶囊「**浮在输入框上方**、悬停浮出整张清单」。 | `chat-panel-next.md` B17 / S9 | 决定 `PinnedTodoSlot` 是删还是改;决定根 `AGENTS.md` 那段要改几次;决定第 71 格做不做 |
| **R2** | **「从失败处重试」常驻 × 「重试只在有用时出现」。** 稿子组件 19 三枚动作固定;`error-ux-design.md` 原则 4 与 §4 决定表明确「额度用完每月 23,333 次,点重试全是白点」。产品今天已经按 code 分流出 7 种主动作。 | 稿 5344;`error-ux-design.md` §1/§4;`amr-guidance.ts:179` | 1:1 照搬 = 把已分好的动作压回一种,**是功能回退** |
| **R3** | **「余额 $0 = 无法开始新任务」× 「付费档余额 0 = 不限量,不拦」。** | 稿 5306;`error-ux-design.md` §3;`run-error-catalog.md` R-010 / Q-05;OD #7190 | 照稿做会把付费用户重新拦住(这正是刚修过的那个 P0) |
| **R4** | **Queue 的「立即发送」会被稿子删掉。** 稿子三枚是 编辑 / 移除 / 引导对话;产品是 编辑 / 立即发送 / 移除,且「立即发送」会 `handleStop()` 打断当前 run。 | 稿 5240;`ProjectView.tsx:8383–8453` | 照稿删 = 砍已上线能力;而「引导对话」是什么**至今没人解释**(S11) |
| **R5** | **报错卡的「原始错误折叠区」会被稿子删掉。** 稿子没有这一区,产品有 `.run-error__diagnostic` + 复制诊断串。 | 稿 5338;`chat.css:987`;`run-error-catalog.md` Q-21 | 删掉后排障只能靠「导出日志」——而导出日志在 chat 里**还没实现** |
| **R6** | **组件 22 的位置两稿不一致。** 组件稿 cmp-meta:「流水里的一行」;场景稿 4436 画在 `.dock > .dock-note`(输入框上方)。图标那半已记为 S10,位置那半没记。 | 稿 4354 vs 场景稿 4436 | 决定它跟着流水滚走还是常驻;也影响 `error-ux-design.md` S29 说的「顶部横幅」到底是哪一个 |
| **R7** | **重连计数会倒退。** `reconnects` 看到真实进度就归零(`daemon.ts:1457`)。 | `providers/daemon.ts:1425/1452–1457` | 用户会看到 3/5 又变 1/5;83 格的「5/5」在真实运行里几乎出不来。要么显示层不归零,要么向设计说明 |
| **R8** | ✅ **已接线**(2026-08-27,`feat/wire-drawn-cards`):`ChatMessage.cancelOrigin` 落 `messages.cancel_origin` 列,daemon 在 run 落终态时无条件补写,`ChatPane` 只在 `user_stop` 时渲染 `PauseLine`。原文如下 —— **组件 20 会谎报。** web 分不出「用户按停」与「daemon 关机 / 项目清理杀掉」,两者都是 `runStatus: 'canceled'`。契约有 `RunCancelOrigin`,daemon 在写,**web 零引用**。 | `packages/contracts/src/api/chat.ts:644`;`apps/daemon/src/runtimes/runs.ts:1440/1486`;`grep cancelOrigin apps/web/src` = 0 | 不接就会在 daemon 重启后显示「已手动暂停任务」。顺带能修 `run-error-catalog.md` 记的「`interrupted` 每月 3,040 次被记成失败」那条线 |
| **R9** | **19 与 22 在抢同一件事。** `DAEMON_STREAM_DISCONNECTED` 今天落进 `resolveRunFailureUi` 的兜底分支,出的是「任务执行失败」通用卡,而不是 22-3 那一行。 | `providers/daemon.ts:407`;`amr-guidance.ts:659–665`;稿 4058 明说不立第三个说法 | 不分流就会同时出两个说法 |
| **R10** | **18-3 四种弹窗的范围边界不清,且「自动充值弹窗」零实现。** 稿子说「跳 Web 端」,那四种弹窗可能长在 vela web;而今天 web 的做法是**隐藏入口**不是换弹窗。 | 稿 5313;`EntryNavRail.tsx:452`;`team-plan.ts:130/154`;死代码 `InsufficientCreditsDialog.tsx` | 先确认是不是我们的活,别默认接下来 |
| **R11** | **只读成员的权限面没走查过。** 共享项目的只读成员能不能点「从失败处重试」/「导出日志」/「Upgrade」/ 队列的编辑与删除? | `chat-panel-dev-design.md`「漏过的维度 · 权限」原文标注「**未验证,需产品定**」 | 边界族全是动作按钮,是这个问题暴露面最大的一族 |
| **R12** | **联系支持弹窗放错目录的风险。** 它「从设置、帮助菜单也进得来」,按 AGENTS.md §1 第 1 问应落 `components/`,不是 `components/chat/`。 | 稿 5387 cmp-ops;`components/chat/AGENTS.md` §1 | 放错就成了「chat 拥有一个全局弹窗」,后面从设置进要么复制一份要么反向依赖 |
| **R13** | **这一族没有验收载体。** 镜像陈列页只覆盖第 1–27 格(断言写死 `length: 27`),70–84 格设计师无从逐格比。 | `mirror-gallery.test.tsx:441`;`chat-mirror/README.md` | 按 §12 的判据,「84 格全部在陈列页上有对照」是完成条件之一 |
| **R14** | **四处稿内不一致,按 AGENTS.md §6 都要回写待决。** ① `.up` cmp-ops 写「关闭 — 本次会话不再提示」+「展示当前用量与受影响的能力」,DOM 里两样都没有;② `.errb`「联系支持」组件稿是带字 `mod-secondary`、场景稿是纯图标 `mod-ghost mod-icon`;③ `.stopline` 场景稿注释写「不带图标」,8/21 组件稿加了图标;④ `.queue` cmp-ops 写「卡头常驻」,CSS 2974 明说「不再单起一行卡头」。 | 稿 5324 vs 5297–5303 / 稿 5342 vs 场景稿 4429 / 场景稿 4478 vs 稿 4264 / 稿 5283 vs CSS 2974 | 每处都要按「以说明文字为准」还是「以 DOM 为准」逐条定;①④ 两条 cmp-ops 与 DOM 互相矛盾,`AGENTS.md` §6 的规则在这里不够用 |

---

## 5. 报错卡与 `run-error-catalog.md` 的对应关系

> 目的:让组件 19 的对齐和那份清单**对得上口径**,不各说各的。
> 左边是设计稿给的卡面(第 78–80 格 + 相邻的 75/76、81、82–84),右边是
> `specs/current/run-error-catalog.md` 的 R-xxx 与 `docs/design/run-errors/error-ux-design.md` 的 S01–S32。

### 5.1 稿子里**有**卡面的

| 稿子的格 | 承接的 catalog 条目 | 对应场景 | 线上量级 |
|---|---|---|---|
| **19-1 通用报错卡**(78) | R-020/021/022/026/027/031/042/049/050/053/055/058/059/060/065/066/067/070/071/073/074/079/080/082 | S10 服务商报错 · S13 模型用不了 · S19 进程崩了 · S20 输入太长 · S21 输出不正常 · S22 OD 自己的 bug · S23 没生成文件 · S30 代理/证书 | S19 = **P0**,20,868 次/月、3,869 台;S10 = P1,11,200 次/月;S20 = P2,3,735 次/月 |
| **19-2 CLI / BYOK 卡**(79) | **R-044**(hard_quota)、R-040(401 key 无效)、R-009(BYOK 没配好)、R-007(本地 CLI 没登录) | **S08 供应商额度用完** · S02 本地 agent 没登录 | **S08 = P0 第一大类**,23,333 次/月、9,220 台、环比 **↑55%**,今天**一个按钮都没有**;S02 = P1,14,519 次/月 |
| **19-3 联系支持弹窗**(80) | R-023(AVX2 `cpu_unsupported`,今天零按钮)、R-064 封号、R-053 平台凭据坏、R-071 信号死亡、R-090 打包起不来、R-102 支付争议 | S18 账号被封 · S27 客户端起不来 · S22 | 单项量都不大,但都是「重试无意义、只能找人」的一类;catalog 的 F10 就是这条流程 |
| **18-1 / 18-2 升级卡**(75/76) | R-010(发送前余额)、**R-043**(AMR PAYG 耗尽)、R-045(workspace credits) | S06 余额不够 · **S15 Cloud 余额用完** | S15 = **P0**,8,680 次/月、3,855 台;今天的问题是**团队成员被带到个人充值页** |
| **20-1 暂停行**(81) | R-078(用户取消 / 项目删除连带 / daemon 关机取消) | S24 做了一半 | catalog「顺带查出的三件事」第一条:`interrupted` 每月 **3,040 次、1,716 台**,7/19 起由每周 ~30 涨到 ~900,**被记成了失败**,用户可能看到一张不该出现的报错卡 —— 第 81 格正是修这个 |
| **22-1/2/3 重连行**(82–84) | R-096(SSE / 协作 / 记忆通道断开与重连)、R-003(离线)、R-056(流中断) | S29 网络中断 / 正在重连 · S11 跑到一半网络断了 | S11 = P1,6,994 次/月、2,501 台,今天「只有 claude 有专门的卡」;R-096 埋点看不到,catalog **Q-13** 还在问「要不要上这张」 |

### 5.2 稿子里**没有**卡面的(报错方案要、24 个组件里找不到)

`error-ux-design.md` §2 列了七种显示方式,设计稿只覆盖其中三种(对话里的报错卡 / 弹窗 / 行内提示)。缺的四种:

| 缺的形态 | 承接的条目 | 对应场景 | 备注 |
|---|---|---|---|
| **顶部横幅** | R-001 daemon 不可达 · R-002 版本不匹配 · R-003 离线 · R-004 登录过期 · R-005 工作区上下文 · R-100 套餐降档 · R-103 项目「消失」 | S03 · S16 · S28a · S29 | 报错方案 §4 自己也写了「工程上**只新做『顶部横幅』『进行中提示』两样**」——即它知道稿子没有。R-001 每天 100–190 台设备无声消失 |
| **发送前拦截条**(输入框上方) | R-006/007/009/011/012/013/014/061 | S01 · S05 · S07 · S07b | 报错方案原则 1「能在发送前知道的,不让发」的全部落点。稿子零覆盖 |
| **进行中提示**(替代转圈那一行) | R-057 无输出超时的「上游响应慢,已等 N 秒」· R-051 的「正在重试 1/2」· R-046/047/048 的倒计时 | S09 · S10 · **S12a** | **这是稿子与报错方案之间最大的一块缺口。** 稿子只有重连那一行属于这个形态。S12 等太久 = P1,18,891 次/月、6,372 台,「缺的正是等待期间的回音」 |
| **toast / 预览区内提示** | R-084 导出失败 · R-085 保存发布失败 · **R-083 预览白屏** | S26 · **S25** | S25 = **P0,唯一在涨的一条**(每周 1,000–3,400 人);但它在预览区不在 chat panel,**不属于本族** |

### 5.3 动作维度的缺口(比形态更要命)

`error-ux-design.md` §2 定了 14 种按钮,组件 19 的三枚(联系支持 / 导出日志 / 从失败处重试)覆盖不到的:

- **「继续运行」**(F2 从失败处续跑)— R-051/052/056/057/077/081,对应 S24。产品**已经有**(`canResumeFailedRun`,`ChatPane.tsx:1480`;契约 `resumable`,`sse/chat.ts:95`)。稿子只有「从失败处重试」,两者语义不同(续跑 vs 新 run),**别合并**。
- **「稍后重试 0:42」倒计时** — R-046/047/048(S09,3,501 次/月,环比 ↑25%)。稿子没有倒计时形态。
- **「更换模型」/「去设置」/「新建对话」/「通知管理员」/「授权并重试」/「在终端登录」** — 产品今天已有五种主动作(`amr-guidance.ts:179`),稿子那三枚里一个都没有。

### 5.4 结论与建议(供裁决)

设计稿的组件 19 是**一张卡面**;`run-error-catalog.md` 与报错设计方案要的是**一张卡面 × 一张按错误分流的动作表**。两者不冲突,但**照稿 1:1 会把产品今天已经分好的动作压回一种,是回退**。

建议(需产品确认):
1. **卡面按稿子 1:1** —— 白底、红只留标题一行、正文人话、动作右对齐、按钮统一 `.btn.mod-sm`。
2. **动作集合保留 `resolveRunFailureUi` 的分流**,并按 D6 / D39 把「导出日志」「联系支持」补进去(它们是**跨错误类型都成立**的两枚,可以常驻)。
3. **「重试」按报错方案原则 4 判定是否出现**,不常驻。
4. 稿子没画的四种形态(横幅 / 发送前拦截 / 进行中提示 / toast)**不在本次「边界」族范围内**,单独排期;本族只交付第 70–84 格。

---

## 6. 附:本文的取数方式(便于复核)

```bash
# 第 70–84 格的原始 DOM(设计稿自己的实体)
cd docs/design/chat-matrix && python3 - <<'PY'
import sys, pathlib, importlib.util, re
spec=importlib.util.spec_from_file_location("bm","build-matrix.py"); bm=importlib.util.module_from_spec(spec)
sys.argv=['x']; spec.loader.exec_module(bm)
rows=bm.extract(pathlib.Path('../chat-panel-next.html').read_text(encoding='utf-8'))
for r in rows:
    if 70 <= r['gid'] <= 84:
        print('=====', r['gid'], r['sub'], r['name'], '|', r['state'])
        print(re.sub(r'<svg[\s\S]*?</svg>','<svg/>', r['dom']))
PY
```

设计意图(`cmp-ops` 说明段)按 `data-od-id` 抽:`cmp-plan-card` / `cmp-queue` / `cmp-upgrade` /
`cmp-error` / `cmp-paused` / `cmp-reconnect`。
**注意稿子的类名极短**(`.card` `.h` `.q` `.up` `.queue` `.mk` `.tx` `.ops`),写任何包装页面
都必须给自己的类名加前缀,否则互相覆盖(§10 已记过两次)。
