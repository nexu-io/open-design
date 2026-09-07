# Chat Panel 问题与上线前设计滚动日志（2026-08-28）

> 用途：记录本轮用户反馈、明确预期、证据、已定位根因和代码状态。后续每完成一项就更新这里，避免会话压缩后丢失上下文。
>
> 工作分支：`feat/chat-panel-next-impl`
>
> 活跃 worktree：`/Users/elian/Documents/od-wt-chat-panel`
>
> 验证约束：用户明确要求不要跑全量测试；只运行与改动对应的聚焦测试。

## 2026-09-01 OPEND-2543～2547 实时修复台账

> Plane 当前间歇不可访问；代码工作继续，状态流转待服务恢复后补写。每次开始、修复、验证、提交、推送都必须同步更新本节。

| Work item | 优先级 | 状态 | 已确认根因 / 当前动作 |
|---|---:|---|---|
| OPEND-2544 思考中不展示媒体 Retry | P1 | **修复中** | `AssistantMessage → ExecutionShell → ImageRow` 无整体 run terminal gate，单格失败就暴露 Retry，可能和 Agent fallback 并发。先补 live-run 红测，只在整轮 terminal 且仍有最终失败时开放 Retry。 |
| OPEND-2543 媒体路径变化后缩略图裂图 | P1 | **排在 2544 后串行修复** | media task 永久保存生成时旧路径，agent move/rename 后未对账；web terminal 后又立即停轮询。需要先明确 task/file identity，再同步最终路径并补有界可访问性确认，不能只给 `<img>` 盲重试。 |
| OPEND-2545 同名图片修改后仍展示旧图 | P1 / 需设计 | **暂停小修，版本语义设计中** | 产品最新裁决否定单纯 `mtime` cache-bust：图片历史卡必须保持并打开该轮当时版本，即使 Design Files 同名文件后来被覆盖。需要 immutable Chat snapshot；旧会话兼容、生命周期和清理策略正在单独设计。 |
| OPEND-2547 9:16 图片被居中裁剪 | P2 | **代码已修、待 root 复验提交** | 仅 image artifact 大卡改为 contain/letterbox；video 专用布局、HTML iframe、文档卡、pending 与小型执行记录缩略图未改。红测先失败；`artifact-card-parity` 15/15、Web typecheck、diff-check 已通过。 |
| OPEND-2546 重复添加文案无反馈 | P2 | **待上述共享文件收口后修复** | `appendQuote` 已去重，但 `handleQuote` 丢弃 duplicate 结果并清选区。应返回 added/duplicate，并通过现有 toast + typed i18n 提示；禁止在 React state updater 内触发 toast。 |

并行分组：A = 2544 → 2543（媒体任务 / Retry 状态链）；B = 2545 → 2547（FileOpsSummary / 产物卡）；C = 2546（会碰近期 QuoteBar / ChatPane，待 A 收口后开始）。本地不得启动 Electron；focused tests 统一单 worker。

### 产物卡最新产品裁决（2026-09-01）

- HTML / 原型 / slide / 文档：会话栏展示静态“假预览图”，点击后右侧预览区打开工作区**最新版本**。
- 图片：生成结果同步保存到 Design Files；会话栏展示该轮的**真实图片**，点击后右侧打开该轮**当时版本**。后续同名覆盖不得让旧消息卡跟着变图。
- 因此不得把 OPEND-2545 简化成 filename + `mtime ?v=`：那只能解决当前卡缓存，却会把所有历史卡一起刷新成最新文件。
- 设计输出：`specs/current/chat-artifact-versioning-design.md`（subagent 编写，root 评审）。必须定义 snapshot 存储、ID / contracts、HTML 首屏截图、引用与清理、quota / GC、中断恢复、删除语义、旧会话兼容、UI / CLI / HTTP 闭环和测试迁移计划；设计通过前不改 2545 产品代码。

## 2026-08-31 提测前内部收尾清单（不向测试同学转嫁）

> 口径：以下事项由研发侧在提测前私下修复或复验。未完成前只留在本地滚动日志，不写入飞书提测文档的“已知风险”；飞书只保留真正需要测试知情、外部环境配合或产品决策的事项。

### A. 立即修复

- [x] 滚动 intent：用户下滚但未真正到底时继续保持 `escaped`，布局收缩不得重新挂回自动跟随；已补 `clientHeight↑`、`scrollHeight↓` 和两阶段收缩红测。
- [x] PlanPill：已确认当前 HEAD 使用聊天 viewport 内真悬浮层，不参与 chat-log 高度；胶囊保持设计稿规定的底部位置，出现时只增加 chat-log 末尾安全留白，Queue / Composer / tray 保持 viewport 外布局。
- [x] Question Form：Next / Back / 非末步 Skip / “自己填”高度变化已加入 DOM element anchor，恢复 footer / own-row 的 viewport offset。
- [x] 长历史虚拟列表：大于 80 条时已用 first-visible key + offset 补偿估算高度到实测高度的变化，会话切换会废弃旧锚点。
- [x] 队列就地编辑：保存后若宿主只更新队列、没有真正出队，不再误把 chat 重新挂回流式追尾；用户停留位置在随后内容增长时保持不变。
- [x] 正文取词：只有 chat viewport / Range 真正位移才隐藏 QuoteBar；nested/no-op scroll 保留操作条，Queue / Composer 改变可用高度会重新翻面；有效选区暂停流式追尾，清空选区仅恢复原本就在跟随的会话。
- [x] 长 Todo：PlanPill 浮层按药丸到 chat viewport 顶部的实时空间限高，清单内部滚动且阻断 overscroll；键盘可进入清单，常见 4 / 5 步布局不变。
- [x] daemon 建 Run 前发送失败：撤掉虚假的 assistant 占位，将原用户消息持久化为 `sendFailed`；重试复用原消息 ID、上下文和附件，已有 `runId` 的失败路径不变。

聚焦验证：最新整合批次共 6 个 Web 测试文件 136 / 136 通过，另有各子项红测；Web typecheck、仓库 `guard`、根 typecheck 与 `git diff --check` 通过。仍需在新 beta 后做一次真机手势复验。

### B. 立即复验

- [x] 当前 HEAD `77859f01f7` 已消费 `main@a8ec5784` 与 `v0.21.0@dbbd3b42` 两份 immutable producer DB；首次打开 / 展开 / 硬刷新 / 再展开断言一致，图片 2、结论 1、DSML / marker 0，producer DB hash 前后不变。
- [x] Agent runtime / host protocol 聚焦矩阵已完成：首轮 18 文件中 16 文件 / 223 条直接通过；stderr 单文件 2 / 2 通过；media routes 暴露 watcher 生命周期 bug，补 `collabPublishWatcher.dispose()` 后单文件 6 / 6 通过。覆盖 Codex 默认与 fallback、Claude stream-json / Todo、steer、取消 / 重试、marker、media、stderr 与重启恢复。
- [x] `0.21.1-beta.8` macOS 已安装并以 AMR `test` profile 启动；精确历史项目连续 10 次 Ctrl+Shift+R 均保留项目、会话、用户消息、助手消息与完成态，没有白屏或新增 React #185。证据：`.tmp/chat-panel-beta8-qa-20260831/01-beta8-hard-refresh-10x-pass.png`。同一客户端 AMR 发送约 462ms 出现用户消息，约 12.4s 得到预期助手正文，余额稳定为 `$19.89`。
- [ ] `0.21.1-beta.7` production CSS：Question Form、错误卡三按钮、分享 / 导出、disabled / hover，以及至少一个非 Chat 共享 Button。
- [ ] 真实 Team Beta cold path：直接深链、Home → Team、硬刷新、catalog 短断与权限错误。
- [ ] 聚焦浏览器证据改由远端执行，避免占用本机：`functional-e2e` p0p1 run `33366584600` 覆盖 AMR recovery、workspace restoration 与 Question Form；顺序生图与 Queue witness 仍需单独补齐。首个 run `33366389708` 仅因调度时误传短 SHA 导致 checkout 失败，没有执行测试，不计为产品失败。
- [x] beta.7 新项目硬刷新曾出现一次 `Minified React error #185`；beta.8 已对精确 project / history 会话连续硬刷新 10 次，renderer 未新增 #185，当前无法复现并以新包证据关闭。
- [x] beta.7 `od_next_protocol_runtime_state_missing` 已完成归因：QA 探针要求“只回复一句”，但 Home 固定 `sessionMode=design` 并自动进入 OD Next full-plan；run / transport 实际 succeeded，失败卡来自策略协议 fail-closed。此探针不用于证明 cold send；不隐藏失败卡、不做关键词猜测。未来若要支持 Design 模式纯问答，需显式 structured intent，作为独立产品设计而非本次尾项。
### 滚动冻结:2026-09-07 在活的现场上做的实测(第一次有硬数据)

包 `0.21.2-beta.1`。两次冻结现场,均通过 Electron 主进程 inspector +
`webContents.sendInputEvent` 注入**真滚轮**测量(JS 合成的 `WheelEvent` 不走这条路,量不出来)。

**缺陷形状(实测,非推断)**

| 量 | 值 |
|---|---|
| 布局侧 | `scrollHeight` 1442 / `clientHeight` 583 / `layoutMax` 859 —— **全部正确** |
| 真滚轮能到 | **6px**(平滑减速到 6 后死住) |
| 键盘 PageDown 能到 | **6px** —— **也走不动** |
| JS `scrollTo(99999)` | 859.5 —— 到底 |
| `scrollIntoView` | 840 —— 能到 |
| `scrollTop` 写入拦截 | **`[]`,一次 JS 写都没有** |

**两条由此确立的结论**

1. **不是我们的代码在把它拽回去。** 写入拦截全程为空,滚轮位移是引擎自己在 6 处夹取。
2. **不只是滚轮。** 键盘同样死在 6 —— 现代 Chromium 的 **scroll unification** 让滚轮/键盘/拖滚动条
   全部走合成器 scroll tree,只有 JS 程序性滚动走 Blink 自己那条路。所以卡住的是 **cc 侧 ScrollNode
   的 bounds**,它停在 589,而 Blink 侧的 1442 是对的。

**冻结值恒为 589 = 6 + 583**,两次现场同一个数字。02:20:04 的采样抓到 `sh 589 / max 6` —— 那一刻
**合成器的 6 是正确的**,随后内容长到 845 → 1350 → 1735,上限再没更新过。**冻结发生在新助手消息
刚开始渲染、内容从 589 往上长的那一瞬间。**

**它是彻底冻死,不是滞后**:往滚动盒里追加 1000px,布局上限从 2102 涨到 3114,滚轮仍然只到 6。
新的内容变化根本标不脏它。

**解法矩阵(全部实测)**

| 施加的改动 | 治好了吗 |
|---|---|
| 纯样式改动(内联写入与当前算出值相同的 `grid-template`) | ✗ |
| **`grid-template: minmax(0,1fr)` → `100% / 100%`(候选修法)** | **✗ 当场证伪** |
| 拿掉消息上残留的单位 transform + 取消全部动画 | ✗ |
| 追加 1000px 内容 | ✗ |
| `overflow-y` 切 hidden 再切回 | ✗ |
| `will-change: transform` 上下线 | ✗ |
| `transform: translateZ(0)` 上下线 | ✗ |
| 滚动盒**自身高度**动 1px 再还原 | ✗ |
| 把尾部占位块高度钉成 0 | ✗ |
| **`display:none` → 回来(销毁重建布局盒)** | **✓** |

⚠️ **`display:none` 那一格不要再跑。** 答案早就知道(只有重建能治),它唯一的作用是**终结现场** ——
2026-09-07 就是这么浪费掉一个现场的。**规矩:先跑全量只读取证落盘,再只做非破坏性实验。**

**H1 证伪:那个 grid 包装盒不是成因(2026-09-07 活现场)**

把 `.chat-log-viewport` 用 `!important` 还原成 `origin/main` 的形状(`display:flex` +
`.chat-log{flex:1 1 0%}`),**照样冻**:

```
sh 1022 → 2033    layoutMax 439 → 1450
wheelReached      31.5 全程不动(天花板 = 31.5 + 583 = 614.5)
```

所以 8/31 那两次结构改动(`77859f01f7` 新造 viewport、`0e8bbdaa69` flex→grid)**都洗清了**。
另注:天花板值本身不固定(第一、二次是 6,这次是 31.5)——它就是「助手消息刚开始长的
那一刻的内容高度」。

**★ 平滑滚动能解冻,瞬时直写不能(2026-09-07,可复现)**

产品点了「回到最新」之后当场恢复,探针量到:

```
sh 2033   layoutMax 1450   wheelReached 1449.5   frozen: false
```

对照极干净 —— 自动探针**每 12 秒**都会做一次 `scrollTop = N` 的瞬时直写(归零 + 还原),
冻结在那期间**纹丝不动**;唯一的差别是那次 `scrollTo({behavior:'smooth'})`。

| 动作 | 解冻 |
|---|---|
| `scrollTop = N`(瞬时,只走 Blink) | ✗ |
| `scrollTo({behavior:'smooth'})`(动画滚动,由 cc 驱动) | **✓** |
| `display:none` → 回来(销毁重建布局盒) | ✓(但会终结现场,禁止再跑) |

和「JS 能到底但滚轮/键盘不行」完全自洽:瞬时直写碰不到 cc 那侧,动画滚动由合成器驱动、
会强制重新同步那棵陈旧的 scroll tree。

**可落地的止血(非根治)**:探针判定冻结 → 自动做一次平滑滚动。**无闪屏**(避开了产品否掉
`display:none` 的理由),而且**先上报再自愈**,遥测一条不丢。

⚠️ **量测纪律(踩过)**:常驻自动探针会每 12 秒把用户的画面「滚到底再滚回来」,严重干扰
正常使用,产品当场以为是 agent 在乱操作。**只读采样可以常驻;任何注入输入的探测必须单次手动
触发。**

**已排除的成因**

- **CSS 容器查询(`container-type: inline-size`)** —— 第二次冻结的现场里**一个 artifact card 都没有**
  (DOM 计数 0),照样冻。
- **祖先链上的合成边界** —— 整条链 `transform`/`filter`/`contain`/`will-change`/`content-visibility`
  全为 `none`/`auto`。
- **嵌套滚动盒吃掉了滚轮** —— 探针的 `inner_scroller_free` 为 `0 verdicts discarded`。

**两次现场的共同点(未证实,是当前最可疑的方向)**

1. `msg user` / `msg assistant` 都挂着 `msg-enter` 动画且 **`fill: "both"`**,结束后 transform 永久留着。
2. **滚动盒用 ResizeObserver 观察自己**(`ChatPane.tsx` 的 `resizeObserver?.observe(el)`),回调里又写
   `spacer.style.height` —— **一个长在会冻的那个盒子上的自喂环**。`origin/main` **没有**这一条
   (它只观察子元素),这正好对上产品问的「为什么之前不会有问题」。ResizeObserver 回调跑在布局之后、
   绘制之前;回调把布局再弄脏,Blink 要多跑一趟,而绘制属性在第二趟里没被重新标脏 —— 能解释
   「Blink 侧对、cc 侧陈旧」。

**结构差(对 `origin/main`)**:`.chat-log-viewport` 这个元素**在 main 上根本不存在**(CSS/TSX 各 0 处命中)。
`77859f01f7`(8/31)新造了它,`0e8bbdaa69`(8/31)把它从 flex 改成 grid,`.chat-log` 因此丢掉 `flex:1`、
改由 grid 轨道定高。OPEND-2645 建单是 9/4。**建单日期不等于缺陷起始日期,这是相关不是证明。**

**观测缺口(实测发现)**:探针**每个聊天日志元素只报一次**。同一个会话里第二次冻结,遥测拿不到 ——
第二次现场全程 `reported` 停在 2。

**工具**(会话内,`scratchpad/`):`freeze-capture.mjs` 全量只读取证落盘;`freeze-watch.mjs` 800ms 只读采样;
`wheel-test.mjs` / `try-fix.mjs` 注入真滚轮验证;`input-matrix.mjs` 滚轮/键盘/JS 三路对照。
**这套东西要产品化到仓库里**,否则下一个现场还是靠临时脚本。

- [ ] **上面那条裁决的边界已量清,并挖出一条它盖不住的真缺陷(2026-09-07 复查)。**
  为了把「纯问答被判失败」钉成可回归的形状,在 `apps/daemon/tests/strategies/od-next/coordinator.test.ts`
  写了一条红测(**故意留红、未提交**),复现现场:task `odnext_c4ee010be6b748dc9b92984946bc10a8`,
  run `e5d6181b-1705-4a44-964b-cdcb3fbcb6ac`。判定链逐跳查清:
  `protocol.ts:233-238` 零个 runtime block → `coordinator.ts:351-380` 三条免阻塞推断依次拒绝,
  真正的判定点是 `inferDirectEditCompletionRuntimeState`(`:642-663`)卡在 `:651-654` 的
  `completionEvidence.deliverableValid !== true` → `tryBeginSerializationRepair` 在 `:877`
  因无 Plan Contract 退出 → 终态 blocked、sticky。
  **那个校验不该删**:它的 docblock 写明推断 `completed` 只能靠磁盘上解析出来的证据,
  "so a silent no-op can never be laundered into a completed task",由 `coordinator.test.ts:1712`
  的 `refuses to infer a Direct Edit completion without verified physical delivery` 守着。
  **实测证明两者互斥**:放开 `deliverableValid` 要求后红测转绿、那条既有绿测立刻转红 ——
  两条 fixture 除了 agent 那段散文**输入完全相同**(`completionEvidence` 一模一样),
  coordinator 手上没有任何信息能分开「用户只要文字」和「用户要页面但 agent 光说不做」。
  唯一剩下的杠杆是按散文内容猜,而那正是上一条裁决点名禁止的。
  **结论:红测断言的是「还没设计的产品行为」,不是缺陷。** 要么产品给出纯问答的显式
  structured intent 落地形态(intent 长什么样、用哪个 outcome、`strategyTaskDelivered` 怎么算),
  要么这条红测改成 pending 并挂到那个独立设计上。**待产品拍板。**
- [ ] **⚠️ 同一个坑里还有一条真缺陷,不在上面那条裁决的覆盖范围内:**
  **真干了活、但不产生新 artifact 的 Direct Edit** —— 删文件、改名、只读审计,或者这一轮的
  artifact 记账没算上的编辑。`validateRunDeliverable` 一律给 `no_artifact`
  (`apps/daemon/src/run-deliverable-validation.ts:164-166`),于是 `deliverableValid: false`,
  走进和纯问答一模一样的终态 blocked。**但这里用户明确要的是改动,agent 也确实做了** ——
  和「纯问答没交付物」是两件事,**它是缺陷,该单独立项**。
- [ ] 同一条链上另外三种合法产出也会掉进去(只记录,未动):一轮里合法地问**两个**问卷
  (`inferClarificationRuntimeState` 卡死在「正好 1 个」,`coordinator.ts:683`);澄清阶段先用散文
  思考(`coordinator.test.ts:1550` 已把它钉成 blocked);complex 模式的 production 轮交付了但没声明
  (`coordinator.ts:595` 显式只认 `simple`,有注释说明是有意的)。
- [ ] **规范自相矛盾,措辞该收敛**:`plugins/_official/scenarios/od-next-strategy/assets/general-orchestration.md:496`
  说 `clarification_required` 那轮「no machine-contract block is output」,而
  `packages/contracts/src/prompts/od-next-strategy.ts:752` 说「Emit exactly one Runtime State block
  on every response」。daemon 站在后者,靠 `inferClarificationRuntimeState` 把前者兜住。
- [ ] **前端那条重映射不用单独改**:`apps/web/src/providers/daemon.ts:2224-2247` 只在
  `outcome === 'blocked'` 时才把 succeeded 的 Run 改写成 failed,daemon 侧一旦不判 blocked 就进不去;
  `ProjectView.tsx:601` 的 `localBlockedTurnVerdictUnknownToServer` 同理(要 `strategyTaskBlocked`)。
  ⚠️ **反过来不能只改前端**:把 `deliveredDespiteBlock` 扩到覆盖 `no_artifact` 等于「隐藏失败卡」,
  正是裁决禁止的,而且会和任务中心对不上(那边 `delivered` 读的是 `outcome === 'completed'`)。
- [ ] **只有翻现场持久化事件才能定死的一点**:那次 run 到底是**一个 runtime-state block 都没发**,
  还是**发了一个被解析器拒掉的**。若是后者,根因完全是另一条(走 repair 路径),修法也不同。
- [x] beta.7 次级日志已排除当前链路影响：`update-store-invalid-shape` 来自 release-beta 历史非空 update store 缺 metadata，可通过现有 Clear update cache 恢复；test Vela `/api/v1/resources` TLS timeout 属 catalog 外部网络波动。两者均未阻塞 cold first output、AMR test 余额或文件打开。

### C. 工程收口

- [x] 已合并最新 `origin/main`（merge `f7a51fdf94`），完成受影响 Web / daemon / contracts 聚焦验证，并构建、签名、安装 `0.21.1-beta.8` dogfood 包；macOS 与 Windows 产物均已发布到 immutable R2 路径。
- [ ] 汇总上述结果：已关闭项写回本地日志；飞书提测文档删除研发内部待办，仅保留外部依赖和真实产品决策。
- [x] OPEND-2410 按当前产品契约关闭：Claude 启动环境已显式开启 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`，TaskCreate / TaskUpdate 会归一为 `TodoWrite`，本轮聚焦矩阵通过；模型仍可能选择不发计划，此时执行记录按既定 flat 模式诚实渲染。不新增 `plan_missing`，不伪造 Todo，也不继续堆提示词。

## 当前优先级

1. 修复 Design Harness 路径漏掉 Chat Panel host 协议，导致最终三行下一步建议不出现。
2. 修复 Ctrl+Shift+R 硬刷新后，OD Next / strategy 多 Run 的最终结论重复。
3. 修复 OPEND-2404 首页附件交互：点击附件应预览，点击 Run 不应自动打开附件。
4. 修复最终答复中的项目文件 / 目录链接展示异常。
5. 完成 OPEND-2403 thinking Markdown 主审、提交与推送。
6. 按飞书文档推进 Question Form 组件族上线前再设计。

## 2026-08-30 真实 AMR 与打包验收

- 使用隔离数据目录和 `test` AMR / Vela profile，分别对 Design Harness 开、关各跑一轮真实会话。旧的成对 `<od-next key="…">…</od-next>` 会被 Vela / OpenCode ACP 识别成原生 DSML tool-call envelope，导致三条建议落入普通正文并泄漏 DSML 闭合标签；根因不是 UI 丢事件。
- host protocol 已改为三个自闭合 UI marker：`<od-next key="…" value="…"/>`。daemon parser 仍兼容历史成对格式，并覆盖 SSE 任意切片、nonce 校验、去重、实体解码和不足三条时的 flush 行为。
- Harness 开 / 关两轮均约 29 秒完成，各产生 3 个结构化、可点击且 enabled 的 `next-step-suggestion-*` 按钮；消息 API 中没有 `DSML`、`tool_calls` 或 `invoke>` 残留，硬刷新后仍回放为 3 条。
- 修复 suggestion 外层引号规整误伤内部中文成对引号的问题；实测文案 `把副标题“Direct-edit verification complete”改为中文“直接编辑验证完成”` 可原样保留。
- 真实历史回放发现同一路径 `index.html` 的 artifact card 会产生 React duplicate-key warning；`FileOpsSummary` 现按项目相对路径去重，硬刷新后警告消失。
- 当前分支成功构建并启动生产打包客户端 `0.21.1-beta.1002`。Team 项目 `Deep Link Probe` 首次冷启动深链为 15.321 秒；同进程后续三次 Home → Team 深链分别为 1.578 / 1.226 / 1.007 秒。重复导航的固定 15–18 秒等待已消除，但首次 Team catalog / resource 同步仍是明确的剩余性能风险。
- 本轮遵守用户约束，没有跑全量测试；执行了 next-step contracts / parser / coordinator、artifact 去重聚焦测试，三个 package typecheck，以及生产打包构建。

## 2026-08-29 全量复核口径

- **不能宣称本需求全部关闭**。#1 / #15 Design Harness 与普通 Chat Panel host protocol 共用已完成代码修复和聚焦验证；OPEND-2410 仍只是确认“Agent 没有调用 Todo 工具”，没有代码修复；Question Form 组件族仍待设计评审。
- 已推送但主要只有聚焦测试、尚无对应真实操作 E2E 的项目：#2、#3、#4、#6、#7 的真实高速模型性能、#8 最终 media-task 版本、#9 全部文字角色、#11、#12、#14、#16、#17、#18、#19。交接时不得把“测试绿”写成“真机验收完成”。
- 有明确 post-fix 手工 UI 证据：#5 Question Form packaged 验证、#9 助手正文 computed style、#10 分享 tooltip。
- #13 DSML 已于 2026-08-29 使用正确的 test-AMR 环境完成真实 live + reload E2E，详见对应条目；这次不是打包安装包验收，当前 Beta 安装包仍未因本补丁重打。
- 新增 #20：消息队列卡片与 Composer 左右边界未对齐，已修代码和聚焦回归，待提交后再做真实队列视觉复验。

## 待修复 / 待设计

### 1. Design Harness 开启后缺少底部三行下一步建议

- 状态：**已修复；真实 Harness 开 / 关 test-AMR live、落库与硬刷新回放均已通过**。
- 修复：新增 contracts 层共享的 keyed Chat turn host protocol renderer，由普通 Chat、OD Next request Bundle 和 OD Next production continuation 共用同一份 `<od-done>` / `<od-next>` / `<od-focus>` 协议。request 路径仅在 Direct Edit request stage 完成时要求输出，production 路径仅在 production completed 时要求输出；clarification、repair、blocked、failed、canceled 均不错误注入完成协议。
- exact-input / cache 边界：request fingerprint 仍基于稳定输入计算，本轮 nonce 在 fingerprint 之后铸造并写入 run meta；production continuation 的 prompt 与 meta 使用同一 key；repair 保持原始 exact stage input，不混入协议。
- 聚焦验证：contracts renderer / OD Next recipe、daemon coordinator 与 automatic-simple server 用例覆盖普通、request、production 和省略场景；contracts / daemon typecheck 通过。未改 Todo 规范，OPEND-2410 仍单独处理。
- 用户现象：任务已经成功生成产物，但最终消息下方没有三行下一步建议。
- 用户疑问：开启“Open Design 实验室 → Design Harness”后，是否改走 strategy / plan，导致本轮 Chat Panel 新提示词没有被遵守。
- 证据截图：
  - `/Users/elian/Downloads/screenshot-20260828-180515.png`
  - `/Users/elian/Downloads/screenshot-20260828-180605.png`
- 根因：Design Harness / OD Next strategy 分支绕过普通 `composeDaemonSystemPrompt` 和 `composeChatAgentTextPayload`，没有把本轮 keyed host 协议注入最终 production 输入：
  - `<od-done key="…">`
  - `<od-next key="…">`（1–3 行建议）
  - `<od-focus key="…">`
- 关键代码链：
  - 实验室开关：`apps/web/src/components/LabsSection.tsx`
  - strategy admission / Bundle：`apps/daemon/src/routes/runs.ts`
  - 普通 run host 协议：`apps/daemon/src/server.ts`
  - strategy finalText 直通分支：`apps/daemon/src/server.ts`
  - next-step marker 契约：`packages/contracts/src/api/next-step-marker.ts`
- UI / SSE / 落库链本身存在且可用；首因是 agent 没拿到本轮 nonce 与输出格式，因此没有生成 `next_steps` 事件。
- 同类遗漏：
  - `done` marker 同样漏注入，目前由前端最终 prose 兜底掩盖。
  - `focus` marker 同样漏注入，目前由 produced-file inference 兜底。
  - Todo atom 允许 prose plan，未必产生 Chat Panel 可渲染的真实 Todo tool 事件。
  - question-form 有独立 strategy atom，未发现整体漏失。
- 最小正确方向：抽取共享、类型化的 `renderChatTurnHostProtocol(doneKey, stagePolicy)`，普通 run 与 strategy run 共用；不要在启动时临时 append，以免破坏 strategy exact-final-text 不变量。
- stage policy：只有 completed 的 Direct Edit / Production 输出下一步建议；plan_ready、clarification、contract repair、blocked、canceled 不输出。
- 必须补的聚焦测试：request / production exact input 包含与 Run `doneKey` 一致的 host 协议；production 产生、落库并回放 `next_steps`；Harness 完成态 UI 显示三行。
- 真实复验补充：初版共享 renderer 使用成对 marker，真实 Vela / ACP 会把它解释为 DSML tool-call envelope。最终协议改为每条建议一个带相同 nonce 的自闭合 marker，普通 Chat、OD Next request 与 production 继续共用同一 renderer；Harness 开 / 关均得到 3 条结构化按钮，正文与历史中均无 DSML。

### 2. Ctrl+Shift+R 后最终结论重复两遍

- 状态：**已修复并推送**，提交 `5834c0417e fix(chat): avoid duplicate strategy conclusion on reload`。
- 用户现象：客户端硬刷新几次后，同一逻辑轮次内的最终结论、交付文件和说明连续出现两份。
- 证据截图：`/Users/elian/Downloads/screenshot-20260828-181337.png`
- 根因：strategy 一个逻辑回合有 request / production 等多条物理 assistant message。刷新后，客户端查询前置 Run 的 task projection，拿到最终 Run 作为 `activeRunId`，误以为 successor 尚未恢复，于是把最终 Run 全量 SSE 追加进前置消息；服务端历史里原本已经有最终 Run 的独立消息，之后 `foldStrategyTaskTurns` 再折叠，得到 `PLAN + FINAL + FINAL`。
- 关键代码链：
  - strategy task projection / terminal run：`apps/daemon/src/strategies/task-store.ts`、`apps/daemon/src/strategies/od-next/automatic-simple-production.ts`
  - 刷新重挂与 replay：`apps/web/src/components/ProjectView.tsx`
  - strategy turn 折叠：`apps/web/src/components/ChatPane.tsx`
- 已排除：
  - 不是 `<od-done>` 与 fallback conclusion 双重提取。
  - 不是 React key。
  - 主要污染当前浏览器内存；每次刷新会重新触发，但 daemon PUT 的 runId 防护通常不会把重复永久写回 DB。
- 修复：`taskRunAdvanced` 时检查 projected successor 是否已由当前 hydration 的 sibling assistant message 物化。已物化则只更新前置消息的 task settled 字段并封存前置 Run，不再把 successor replay 进前置消息；successor 尚未落库时仍走原 crash-window 恢复。
- 红测先在旧逻辑稳定复现（错误调用一次 `reattachDaemonRun`），修复后同用例转绿；`ProjectView.reattach-restore.test.tsx` 全文件 45 条通过，按用户要求未跑全量测试。

### 3. OPEND-2404：首页附件点击与 Run 行为相反

- 状态：**已修复并推送**，提交 `04d327fc40 fix(chat): keep Home attachments as references`。
- 用户现象：
  1. 首页输入框带图片附件，点击 Run 后进入项目时，右侧工作区会自动打开该附件；用户不希望 Run 自动打开附件。
  2. 进入对话后，显式点击用户消息上的图片附件缩略图没有反应；用户希望此时能打开预览。
- 证据截图：`/Users/elian/Downloads/screenshot-20260828-181658.png`
- 明确预期：
  - `Run`：上传附件、把附件作为首轮上下文、进入会话；**不自动导航或打开附件**。
  - 用户显式点击附件：打开该附件预览 / 文件 tab。
- 当前高置信线索：
  - `ProjectView` 首次无 tab 时调用 `selectPrimaryProjectFile(projectFiles)`；图片的 rank 为 3。新项目如果此刻唯一文件就是首页上传的附件，它会被当作 primary 自动打开。
  - 首页自动发送已有 `autoSendFirstMessageRef` / `autoSendAttachmentsRef`，可用于区分“首轮参考附件”与“真正产物”；需要保证后续 agent 生成产物时仍可正常 auto-open。
  - 用户消息附件的点击可用性由 `ChatPane.UserAttachmentRow` 中 `projectFileNames.has(baseName)` 决定；需继续核对上传响应 path、项目文件 name 和刷新时序，不能只关掉初始 auto-open。
- 修复：首次进入项目时把 Home 已上传的参考附件从 primary artifact 候选中排除；若同时已有真正生成物，仍可正常选中生成物。用户显式点击消息附件时不再被滞后一拍的 `projectFileNames` 快照禁用，并优先使用已匹配的项目文件名打开。
- 红测：旧逻辑会自动选中唯一图片附件，并会禁用文件列表尚未刷新时的附件按钮；修复后 Home 自动发送、primary 选择和显式点击 3 条聚焦用例通过。按用户要求未跑全量测试。
- 相关文件：
  - `apps/web/src/components/HomeView.tsx`
  - `apps/web/src/components/HomeHero.tsx`
  - `apps/web/src/App.tsx`
  - `apps/web/src/components/ProjectView.tsx`
  - `apps/web/src/components/ChatPane.tsx`
  - `apps/web/src/providers/registry.ts`

### 4. 最终答复中的文件 / 目录链接展示异常

- 状态：**已修复并推送**，提交 `e60e79e499 fix(chat): render local markdown paths with spaces`。
- 用户现象：最终答复把项目文件和目录展示成原始 Markdown / 绝对路径文本，例如：
  - `打开 [index.html](</Users/.../index.html>)`
  - `三张真实摄影素材已本地化到 [assets](</Users/.../assets>)`
- 证据截图：`/Users/elian/Downloads/screenshot-20260828-182616.png`
- 明确预期：展示为简洁、可点击的项目内文件 / 目录链接；不能把 `</Users/...>` 绝对路径和 Markdown 语法直接暴露给用户。
- 根因：轻量 Markdown renderer 只接受不含空格的 `[...](/path)` destination，没有实现 CommonMark 的 angle-wrapped destination `[...](&lt;/path with spaces&gt;)`；因此包含 `Application Support` 的 macOS 绝对路径整段落回纯文本。
- 修复：显式支持 angle-wrapped destination，渲染时去掉尖括号，再交给既有的安全 href 与项目内链接路由；绝对路径不再把 Markdown 语法暴露给用户。同步保留 Windows `C:/...` 路径供既有 click router 判断，仍拒绝 `javascript:`、`vbscript:`、`file:` 和 protocol-relative URL。
- 红测：截图同形态的 macOS 空格路径在旧逻辑下无法生成 anchor；修后 renderer 与 AssistantMessage 点击路由用例转绿。两个聚焦测试文件共 55 条通过，按用户要求未跑全量测试。

### 5. Question Form 组件族需要上线前重新设计

- 状态：**已创建飞书设计任务文档，待设计评审**。
- 飞书文档：<https://powerformer.feishu.cn/docx/Qmmgd0SiUoQCXIxIazEcaWHSn1d>
- 证据：
  - `/Users/elian/Downloads/20260828-181201.jpg`（Select / 系统文案与语言归属）
  - `/Users/elian/Downloads/20260828-181206.jpg`（Color / Accent 色）
  - `/Users/elian/Downloads/20260828-181208.jpg`（Range / 版面密度）
  - `/Users/elian/Downloads/20260828-181214.jpg`（最终确认摘要）
- 用户判断：这些状态都需要重新设计，不能继续逐处修 CSS。
- 文档结论：缺的是 Question Form 组件族统一契约，包括 anatomy、输入控件、footer、确认态、响应式、i18n、无障碍和完整状态矩阵。
- 语言归属口径：题目、说明、选项和 `submitLabel` 属于 Agent 输出，跟随对话语言；Skip、Back、默认提交文案、提示和无障碍标签属于客户端系统文案，必须跟随界面语言并走 i18n。两者混排不是缺陷，不通过提示词强制统一。
- i18n 审计：已扩大到本次 Chat Panel 全部改动面；只记录系统自有可见文案的硬编码、错误 key / fallback 与 aria / title / tooltip 遗漏，待审计结果回填。
- 明确原则：以已有设计稿 / Chat Panel token 为准，不自行发挥具体视觉数值。

#### 已可直接修复的主设计稿对齐（2026-08-28 晚）

- 用户再次明确唯一视觉基准：`/Users/elian/Documents/od-design-artifacts/chat-panel-next.html`。
- 已移除 Question Form 顶层 `description`：类型、完整 / 流式解析、渲染、daemon / contracts 提示词和 ElevenLabs 特例均不再生成或消费该字段；必要说明只能进入具体问题的 label / help，不再塞进 Header。
- Header 成品包实测：378×36、`12px / 600 / 18px`、`#202020`，内距 `9px 11px`、间距 7px；图标 15×15、`#848484`；进度显示为无空格的 `1/3`。
- Footer 成品包实测：40px 高、`0 11px 8px`、gap 8px；跳过为 `12px / 600`、`4px 0`、透明；上一步为 `12px / 600`、`4px 11px`、透明；下一步为 58×32、`12px / 600`、`4px 11px`、999px 胶囊。
- 禁用态实测：下一步为 `#ededed / #bdbdbd`，尺寸不变；跳过在会话忙 / 禁用时仍透明，不再长出灰底药丸。
- 根因：`@open-design/components` 的 esbuild 产物抽出了 `dist/index.css`，却没在 `dist/index.mjs` 保留样式引用；开发态从源码加载所以正常，打包态从 dist 加载所以共享 Button CSS 丢失。已在组件构建入口保留 `import "./index.css"`，生产 Next build 和组件 tarball 均验证通过。
- 聚焦验证：Question Form 4 个测试文件 91 条、daemon prompt 2 个文件 78 条全部通过；daemon / contracts typecheck 通过；web production build 通过。web 单独 typecheck 仍有 3 个与本改动无关的既有测试类型错误（thinking markdown 1 条、artifact-card viewport 2 条）。
- 安装包验证：`0.21.1-beta.901` / namespace `chatqafix` 已完成 build → install → start，channel=beta；真实 Codex Run 生成 3 步 Question Form，并逐元素读取 packaged Electron computed style 对齐上述数值。
- 本地 DMG：`/Users/elian/Documents/od-wt-chat-panel/.tmp/tools-pack/out/mac/namespaces/chatqafix/dmg/Open Design-chatqafix.dmg`。

#### Chat Panel 全范围 i18n 审计结论

- Question Form 的系统文案未发现遗漏；Agent 中文 CTA + 英文 UI 的 Skip / Back 是预期组合。
- 本分支涉及的 `apps/web/src` 静态 `t('…')` key 共 1325 个，全部存在于 typed Dict 和 19 个 locale；相对 merge-base 新增的 86 个 Dict key 也全部补齐 19 locale。
- P1（本轮应修）：执行状态 aria、余额升级卡 CTA、会话搜索 placeholder / 空态、执行记录文件打开 aria、附件预览 aria 共 5 类系统硬编码。
- P1 修复结果：上述 5 类已全部接入 typed i18n，新增 5 个 key 均补齐 19 个 locale；法语组件断言和 locale 对齐测试通过。
- merge-base 归因：相对 `3af55e9f22` 到本分支审计点，本次需求新增的系统文案硬编码为 **0 项**。
- P2 收债结果：Composer / ChatPane 上下文 kind 与 tooltip、插件 / MCP / skill 工具面板、旧插件动作面板和上传失败模板已接入 typed i18n；旧插件动作新增 9 个 key 并补齐全部 19 locale。媒体 starter 的标题、标签和 prompt 属于可编辑模板内容，不是客户端系统 chrome，按用户确认不随 UI 语言强制翻译，也不修改提示词。
- 非问题：命令、路径、文件名、工具输出、Question Form Agent 字段、产品 / 插件专名不做强制翻译。

### 6. ToolRow 的 command 动作识别不足

- 状态：**已修复并推送**，包含于 `bb4292e82b fix(chat): close remaining panel regressions`；尚无真实会话 ToolRow 渲染 E2E。
- 样本：只读抽样本机 stable / beta / prerelease 的 332 条真实 OD shell command，不记录会话正文、绝对路径或凭据。
- 旧规则：246 / 332 条回落成“执行”。
- 新规则：83 条保守保留为真正的通用执行；其余识别为读取 107、搜索 102、新建 / 写入 33、改写 4、删除 3。
- 补充复核：真实样本有 3 条 `sed → grep → head`、1 条 `awk → rg`；已加窄规则，仅当 `cat/sed/awk` 是纯只读预处理且下游明确 grep / rg、整条无修改时按搜索。`curl/env → rg` 原本已正确。
- 安全边界：多文件、glob、变量路径和 heredoc 标记不伪造成可点击文件；能证明动作但不能证明目标时，只展示本地化语义动词与静态命令摘要。
- 聚焦验证：8 个文件、最新 206 条用例通过；未跑全量测试。

### 7. OPEND-2403：thinking 正文不渲染 Markdown，且高速流可能卡顿

- 状态：**已完成并推送**，提交 `107c500bfd fix(chat): render streamed thinking markdown efficiently`。
- 根因：新 Chat Panel 把 thinking 收进 `ThoughtsRow` 后仍使用纯文本 `SayText`；旧 `ThinkingBlock` 虽支持 Markdown，但已无消费方。
- 当前实现：
  - 新增 `ThinkingMarkdown`，复用现有安全 React Markdown renderer。
  - live 流使用固定 100ms 合并窗口，整段 Markdown parse / DOM commit 最多每秒 10 次。
  - 被合并丢弃的 delta 不触发 Markdown parse 或 `useCharReveal` DOM 遍历。
  - live fenced code 禁用 Shiki；完成态立即 flush 并恢复高亮。
  - 通用 Markdown link 允许项目相对路径、HTTP(S)、mailto；拒绝 `javascript:`、`vbscript:`、`file:` 和协议相对 URL。
- 修改文件：
  - `apps/web/src/components/chat/ExecutionShell.tsx`
  - `apps/web/src/components/chat/ThinkingMarkdown.tsx`
  - `apps/web/src/components/chat/ThinkingMarkdown.module.css`
  - `apps/web/src/runtime/markdown.tsx`
  - `apps/web/tests/components/chat/thinking-markdown.test.tsx`
  - `apps/web/tests/runtime/markdown.test.tsx`
- 聚焦验证：5 个相关测试文件、78 条测试通过；`git diff --check` 通过。按用户要求未跑全量测试。

### 8. OPEND-2195：生图逐张计数

- 状态：**已实现并推送**，包含于 `bb4292e82b fix(chat): close remaining panel regressions`；最终 media-task / ImageRow 补丁尚未重新跑完整顺序生图 E2E。
- 根因：ChatPanel 只从 shell command 中数 `media generate` 猜总数，完全没有消费既有的 `GET /api/projects/:id/media/tasks`；同时真实 CLI 成功输出是 `{ file: {...} }`，旧解析器却只认顶层 `status/path`。
- 当前实现：
  - media task 持久化 `runId`，升级旧 SQLite schema 时幂等新增 `run_id`。
  - 列表接口返回 `runId`；ChatPane 只在存在生图 turn 时拉取，运行中 750ms 串行轮询，失败退避到 1500ms，轮次与 task 均终止后停止。
  - 按 assistant run + task 创建顺序驱动每个格子的 `pending / done / failed`；失败格保留实际位置，命令已结束但后续 task 未创建时收敛为失败，不永久转圈。
  - 成功格直接读取真实项目图片作为缩略图，并复用项目文件打开动作。
  - 失败格点击重试时把被点格子的 `N/M` 坐标带回正常聊天发送链，多个失败格不会再发同一句含糊的“全部重试”；仍不伪造 daemon 级请求重放。
  - 无 task 数据的旧会话继续走事件兜底，且已兼容真实 `{ file: { name } }` 成功 envelope。
- 聚焦验证：daemon 2 文件 23 条、web 3 文件 100 条全部通过；daemon / contracts typecheck 通过。web typecheck 只剩 3 条本分支既有错误（thinking markdown 1 条、artifact-card viewport 2 条），本次新增代码无类型错误。按用户要求未跑全量测试。
- 2026-08-29 真机补充：运行时能生成 4 张真实图片，但隔夜重启后生图行退化为普通“读取图片”工具行。原因是 terminal media task 过 TTL 后被启动清理，而历史 Bash stdout 同时被 ACP 安全打码。已增加持久化事件兜底：当 `media generate` 的成功调用结构里明确带有 `file_path` 时，恢复为完成态生图行与缩略图，不把它误判成读文件；新增红测由失败转为通过（该文件 62/62）。

### 9. Chat Panel 全量字体角色对齐

- 状态：**深度审计完成，P0/P1/P2 已修复并推送**，包含于 `bb4292e82b fix(chat): close remaining panel regressions`；只对助手正文做了 post-fix computed-style 真机复验，并非每个文字角色都已 E2E。
- 唯一基准仍为 `/Users/elian/Documents/od-design-artifacts/chat-panel-next.html`，不是凭观感统一字号。
- 本轮范围扩大为 Chat 中每一种可见文字角色：壳头 / Todo / thinking / 过程正文 / ToolRow 动词、命令、文件名、耗时、失败态 / 壳外结论 / 状态行 / Question Form / 生图行 / 附件与产物卡。
- 用户真机指出同一执行流内普通正文、等宽命令、ToolRow 标题、thinking 标题与耗时看起来各不一致；需逐角色记录稿件值、生产 selector、computed value 与是否语义上应当不同，不能粗暴“一刀切”。
- 审计结论：ToolRow 动作词 13px sans、文件 / 命令 12px mono、耗时 12px mono 是设计稿明确层级，不能统一成同一种字；Media ToolRow、Plan/Todo、Question Form 核心文字和 Error Card 也已对齐。
- 真正失配并已修复：壳外助手正文改为 `13px / 1.7 / #202020 / normal letter-spacing`，粗体 600；live “思考中”移除壳头专用的 `head` 档，回到 500 / muted；回合底部“已完成 / 已手动停止”字重 500→400。
- 真机 computed style 复验正文为 `13px / 22.1px / rgb(32,32,32) / letter-spacing normal / 400`；thinking + conversation 聚焦测试 2 文件 26 条通过。

### 10. 分享菜单 tooltip 跑位

- 状态：**已修复、真机复验并推送**，包含于 `bb4292e82b fix(chat): close remaining panel regressions`。
- 复现：预览区“分享”菜单中，hover 分区标题右侧问号后，说明 tooltip 掉到菜单下方 / 右下侧并遮压后续内容。
- 当前线索：问号使用共享 `TooltipLayer` portal，但显式声明 `data-tooltip-placement="bottom"`；需确认预期应为向左 / 向上，以及 portal 与锚定菜单的 fixed 坐标是否有二次偏移，不能用 margin 伪修。
- 根因：菜单层级 `--z-menu: 9000` 按全局规则高于 hint 的 `--z-hint: 4000`，而这个 hint 恰好由菜单内部触发；向下放置后大部分气泡被菜单自己盖住，只在菜单下方 / 右下侧露出。
- 修复：两种 Viewer chrome 的两个帮助入口统一改为向上；`TooltipLayer` 仅对“触发器位于当前 menu 内”的气泡标记 menu context，并提升到该 menu 上一层，不改变 unrelated tooltip < menu 的全局原则。
- 验证：Tooltip / FileViewer 聚焦 4 条通过（同文件其余 312 skipped）；本地真实分享菜单 hover 截图确认 tooltip 完整贴在问号上方，不再掉到底部。

### 11. 会话切换弹层下半部点击无响应

- 状态：**已修复并推送**，包含于 `bb4292e82b fix(chat): close remaining panel regressions`；聚焦测试覆盖 meta 区点击，尚未对截图中的下半部真实点击做 post-fix E2E。
- 复现：点击 ChatPanel 右上角会话切换后，列表下半部的会话行（含 `0 msg / 2 msg` 元数据区域）点击无响应，无法切换。
- 审计重点：整行与右侧删除按钮的命中区、透明遮罩、pointer-events、z-index / stacking context、拖动区域；同时判断是否与上述 tooltip / portal 层叠问题同源。
- 根因一：行虽然有 pointer / hover，但 `onSelect` 只绑在标题 button；messageCount、耗时和空白区域天然不响应。根因二：菜单困在 header `z=7`，而消息 rail 是 `z=8` 且带 20px 透明命中区，菜单最右侧约 12px 被截获。
- 修复：选择处理上提到整行，删除按钮继续 stopPropagation；header 提到 z=9 越过 rail 与回到最新按钮。
- 验证：新增点击 meta 的红测，修后 conversation menu 自动切换并关闭；2 文件 13 条通过，`git diff --check` 通过。该问题与分享 tooltip 不同源。

### 12. 顺序生图时缺少运行中 ImageRow

- 状态：**已修复并推送**，包含于 `bb4292e82b fix(chat): close remaining panel regressions`；最终版本尚未重新跑顺序生图 E2E。
- 复现：AMR / ACP 按顺序逐张调用媒体生成时，执行计划只显示 Todo 行；当前正在生成的图片没有出现设计稿中的 Media ToolRow，也看不到绿色 PixelLiquid loading。
- 用户裁决：逐张生成可以接受；每个正在生成的调用至少显示一行、一个绿色 loading cell，不需要为了凑总数伪造尚未创建的图片任务。
- 根因：ACP 的 terminal tool pair 在工具结束时才落 `tool_use`，而 ChatPane 原来需要先从事件中看到 media command 才开始轮询 task；首个运行中 task 因而既没有 tool event，也没有被拉取 / 消费。
- 修复：streaming assistant run 现在即使还没有 terminal media `tool_use`，也会按 runId 拉取 media task；未被 terminal tool event 消费的 live task 会在当前 Todo 下生成一条单格 ImageRow，cell 显示绿色 loading。terminal event 到达后同一 task 会被 cursor 接管，不重复一行。
- 聚焦验证：`build-turn-blocks.test.ts`、`ChatPane.media-task-polling.test.tsx` 已覆盖 live polling、单格 loading、terminal 接管不重复和失败格顺序。

### 13. DSML 内部协议尾标泄漏到最终正文

- 状态：**已修复并完成 test-AMR live + reload E2E，当前补丁待提交推送（P1）**。
- 复现：AMR 会话结论末尾出现 `</｜｜DSML｜｜parameter>`、`</｜｜DSML｜｜invoke>`、`</｜｜DSML｜｜tool_calls>`；这些是内部工具调用序列化协议，不是 Agent 正文。
- 根因一：截图时真正承载该项目的 `chatpanel-e2e` daemon 是 09:35 启动的旧进程，早于 `bb4292e82b`，所以新抑制器根本没进入真实运行链；不能把旧 daemon 上的截图当作新代码回归。
- 根因二：历史 scrub 的正则只接受紧邻的 `||` / `｜｜`，对 `| | DSML | |` 这种管道内部含空格的变体不稳健。实时 suppressor 会 compact 空格，但 DB 历史回放没有同等能力。
- 修复：工具文本抑制器精确剥离三段 DSML protocol tail，覆盖全角 / ASCII 竖线、管道内部空格和跨 chunk；DB 读取历史 assistant message 时做同一精确 scrub。正常 Markdown / 代码示例不剥离。
- 聚焦验证：`text-suppression.test.ts`、`db-message-events.test.ts` 本轮 23/23 通过，新增 spaced ASCII、split stream、跨 status / tool event 历史回放；`git diff --check` 通过。
- 真实 E2E 环境：namespace `chatpanel-e2e`，daemon `http://127.0.0.1:56183`，web `http://127.0.0.1:56184`；AMR profile 曾错误回落 `prod` 且余额为 0，已通过 app config 修正为 `test`，wallet 返回 `$19.8977`，UI 显示 `$19.90`。
- 历史回放：原项目 `3d02a559-745b-44c2-a8e4-2c82c9468a6d` / 原会话 `ed6de411-4f5d-4b33-b977-5d2c72d29404` 在新 daemon 上打开后，协议残留计数为 0，旧的三条建议可见。
- 新实时回合：会话 `a04e85da-b1b3-4c57-8b3e-9c09ebbe2a5f`，run `0b53f7f8-847f-43d5-b749-7d9d2a1fee51`。发送后立即显示进行中，40s 后为已完成；正文 `DSML E2E 验证完成`，三条 `next_steps` 正常展示。live 协议残留 0，reload 后协议残留仍为 0、建议仍为 3 条；run events 中无 `parameter / invoke / tool_calls` 尾标，存在结构化 `next_steps` 事件。
- 验收边界：这是最新源码 + test-AMR 的开发桌面 / web / daemon E2E；尚未重打、安装并验证新的 Beta 包。
- 2026-08-30 补充：真实 A/B 证明成对 `<od-next>` 本身会触发 Vela / ACP 的 DSML 序列化；协议改成自闭合 marker 后，新 live run 和 reload 均无尾标。本轮还完成了生产打包客户端构建与启动验证。

### 14. 成功轮因最后 Todo 快照陈旧而误显示“已停止”

- 状态：**已修复并推送**，包含于 `bb4292e82b fix(chat): close remaining panel regressions`；只有聚焦测试，尚无真实 stale Todo 成功轮 E2E。
- 真实现场：run `9529a731-88c2-4693-ae72-abafdd5703ea` 的状态为 `succeeded`，已有最终总结并发出匹配本轮 nonce 的 `<od-done>`；但 Agent 在完成总结后漏发最后一次 TodoWrite，末项“简短总结新图”仍为 `in_progress`。
- 旧 UI：只把最后 TodoWrite 快照当权威，因而显示“已停止，仍有未完成任务”并提供“继续剩余任务”。这不代表进程取消或媒体任务失败。
- 修复：不粗暴信任所有 `succeeded`；只有 `runStatus=succeeded` 且事件里存在本轮 `done_key` 匹配的 `<od-done key="…"/>`，并且 marker 后有可见最终结论时，才把陈旧 Todo 判为已交付。失败 run、截断 run、空 marker、错误 nonce、代码里的 marker 仍保留未完成入口。
- 聚焦验证：`run-completeness.test.ts`、`runs.test.ts`、`todo-recall.test.tsx`、`authenticated-done.test.ts` 已覆盖 contracts / daemon / UI 三层。

### 15. Design Harness / OD Next 与普通 Chat Panel prompt 协议分叉

- 状态：**已完成架构修复、聚焦覆盖和真实 Harness 开 / 关 test-AMR A/B 复验**。
- 用户强约束：以后每次修改 Todo、Question Form、`<od-done>`、`<od-next>`、`<od-focus>` 等 Chat prompt / host 协议，都必须同时审计 Design Harness 开 / 关两条路径；不能只验证普通 chat。
- 已确认调用链：普通 chat 走 `composeChatAgentTextPayload`，由 `server.ts` 每轮注入带本轮 nonce 的 done / next / focus；OD Next 一旦存在 `strategyTaskAtStart`，则直接使用冻结的 `persistedStrategyFinalText`，跳过这组 per-turn contributor。
- 初始 Bundle 虽存在 `context/client_system_prompt`，但在 Run 创建、`doneKey` 铸造之前冻结，当前无法携带本轮 nonce；后续 clarification / production continuation 又要求 exact stage input，同样不会自动拼普通 per-turn slice。
- 现场吻合：开启 Design Harness 后最终产物轮缺少三条下一步建议，不是偶发模型不遵守，而是该物理 Run 没收到同一份 `<od-next>` 协议。
- Todo 差异：普通 discovery prompt 明确要求每步开工前 `in_progress`、做完立刻 `completed`；OD Next core 当前只写“Keep the Todo plan live”，Production continuation 只说复用 frozen Todo plan，约束明显更弱。不能直接复制整份普通 prompt，应把需要共享的 host protocol 与状态契约注册为两条路线共同消费的 contributor，并保留 exact-input / cache 边界。
- 落地：已按上述边界仅抽取 done / next / focus host protocol，不顺带强化 Todo prompt。普通 route、OD Next request Bundle 和 production continuation 共享 renderer；repair / clarification 不注入。nonce 在 request fingerprint 之后生成，避免破坏 cache / idempotency；聚焦测试验证 prompt 与 run meta 的 key 一致。
- 真实 A/B：两条路径均约 29 秒完成，均产生 3 条结构化 next-step，硬刷新后保持一致；共享 renderer 已采用 ACP-safe 自闭合 marker，daemon 保留旧成对 marker 的历史兼容。

### 16. “基于此项目创建设计系统”自动消息仍使用旧灰卡

- 状态：**已修复并推送**，包含于 `bb4292e82b fix(chat): close remaining panel regressions`；只有聚焦测试，尚无菜单触发后的 post-fix E2E。
- 复现：在 FileWorkspace 菜单点击“基于此项目创建设计系统”后，客户端会自动发送一条隐藏的长 prompt；ChatPane 将它替换为一张灰色英文状态卡 `Creating design system workspace`，与新版黑色用户消息不一致，中文界面也暴露硬编码英文。
- 审计结论：这是唯一一个把 user-side auto prompt 渲染为专用旧卡的分支。设计稿没有这种灰卡，语义上也仍是用户触发并自动发送的请求；应归入设计稿 #1“用户消息-文本”。附件、Question Form 回填、Thinking、Plan、ToolRow、Queue、升级、报错、暂停和重连均有各自设计稿角色，不应统一涂黑。
- 修复：复用 canonical `UserBubble`，只展示现有 typed i18n 文案 `designFiles.createDesignSystemFromProject`，不泄露内部长 prompt；复制动作复制可见的本地化摘要。移除旧灰卡、两个硬编码英文 display 常量和废弃 CSS；首轮 fallback 会话标题同步复用该 i18n key。
- 额外 i18n 修复：suppressed-direction StatusPill、SkillPluginCandidateCard busy 文案、`context_compaction` 已知状态均已接入 typed Dict 和 19 locale；未知 runtime status 仍原样展示，不做盲译。这些仍保留 assistant structured / recovery UI 的专用样式，不混同为黑色用户气泡。
- 聚焦验证：自动 DS prompt 渲染用例 1 条通过（32 skipped），prompt 识别用例 4 条通过；新增 zh-CN 系统 copy 用例 4 条通过并覆盖 unknown runtime label 保留；`git diff --check` 通过。未跑全量测试。

### 17. AMR 发送前权威预检期间界面静默

- 状态：**已修复并推送**，包含于 `c60bbe7f5b fix(chat): tighten pending and terminal feedback`；test-AMR E2E 已确认消息发送后立即出现“进行中”，但未人为制造慢余额预检来单独复验“正在准备”胶囊。
- 复现：使用 AMR 发送后，workspace billing 权威预检可能等待数秒；消息在预检通过前不会持久化，而 Composer 原来只有防重复提交的 ref 锁，没有任何可见状态，看起来像点击无效或客户端卡死。
- 修复：保留预检先于消息持久化的计费安全边界；异步 send admission 期间，发送键立即切换为带动态矩阵的“正在准备”胶囊并禁止再次点击，预检通过后再进入正常 streaming / stop 状态。余额拦截时仍不会伪造已发送消息。
- 聚焦验证：`ChatComposer.infinite-render.test.tsx` 新增 deferred send gate 用例，覆盖即时反馈、draft 保留、resolve 后清理。

### 18. 生图运行行首误用灰色 thinking-orb

- 状态：**已修复并推送**，包含于 `c60bbe7f5b fix(chat): tighten pending and terminal feedback`；只有 primitive 聚焦测试，尚无最终顺序生图 E2E。
- 复现：设计稿“生成配套插图 N/M”运行态的行首是绿色自转球；生产 `ImageRow` 却直接使用单色 `Orb solving`，与壳头 / thinking 的灰色动效混在一起。
- 修复：复用现有步骤级 `StatusMark status=running`，即设计稿已经对齐的八层锥形渐变绿色自转球；未新增另一套动画或色值。
- 聚焦验证：`primitives.test.tsx` 断言运行中 ImageRow 使用绿色 run mark，且不再渲染 `[data-orb]`。最终与 AMR pending、手动终止 / 重连相关用例合计 8 文件 103 条通过；未跑全量测试。

### 19. 手动终止后重复显示独立“已手动暂停任务”行

- 状态：**已修复并推送**，包含于 `c60bbe7f5b fix(chat): tighten pending and terminal feedback`；2026-08-29 已补 test-AMR 真实手动停止 E2E。
- 复现：用户手动停止一轮后，Assistant footer 已显示“已手动停止”，ChatPane 流水尾部又根据 `canceled + cancelOrigin:user_stop + unfinished todos` 追加“已手动暂停任务”，同一终态出现两遍；刷新后的历史回放也会复现。
- 根因：`cancelOrigin:user_stop` 证明的是用户终止 run，不代表任务进入可恢复的 paused-task 领域状态；旧接线把两种语义混为一谈。
- 修复：删除 ChatPane 对 run canceled 状态的 PauseLine 映射，只保留回合 footer；PauseLine 设计组件仍保留给未来真正的 paused-task 状态，但不再接受 `RunCancelOrigin` / Todo 余量作为输入。重连终态撤行和“继续剩余任务”入口保持不变。
- 聚焦验证：覆盖 live `running -> canceled` 与 JSON 历史回放，两条路径均只显示 footer、不再出现 `chat-pause-line`；最终与 AMR pending、生图状态、重连 / Todo 相关用例合计 8 文件 103 条通过，`git diff --check` 通过；未跑全量测试。
- 真实 E2E：test-AMR 运行中点击停止后，回合底部只出现一次“已手动停止”与“继续剩余任务”，没有再出现独立“已手动暂停任务”行。

### 20. Composer 上方消息队列外框左右未对齐

- 状态：**已修复，当前补丁待提交；聚焦测试已绿，待真实队列视觉复验**。
- 复现：队列卡片的左右外框比下方 Composer shell 各外凸约 16px。
- 根因：Composer 自身水平 padding 为 16px，但晚写的 `.chat-queued-send-strip { width: 100%; margin-inline: 0 }` 覆盖了早先内缩；恢复淡边框后，队列作为 Composer 的兄弟节点自然占满 pane，比输入框外框更宽。
- 修复：在 `.pane` 以 `--chat-composer-inline-inset: 16px` 作为横向基线单一来源；Composer padding、queue margin 和 queue `calc()` width 共用该 token。
- 红绿验证：`queue-strip-border.test.tsx` 在旧 CSS 下先红，修复后相关 3 个文件 19 条测试通过；仅有既有 jsdom canvas warning，未跑全量测试 / typecheck。

### 21. 新 Chat Panel 对旧版本会话的兼容性验收

- 状态：**channel 历史体检、精确版本回放与隔离 Beta 包验收均已完成；P0 与长消息 DOM P1 已修复，Beta 包另暴露一个与会话长度无关的全页 bootstrap P1，另有 1 个低优先级语义图标问题**。完整截图报告见飞书文档 `Chat Panel Next 旧会话兼容性验收报告（2026-08-29）`。
- 离线历史重放：只读扫描 dev / stable / legacy-beta / beta / prerelease 共 5 份 channel 数据库，覆盖 95 个会话、243 条 assistant message、126,835 个事件。`buildTurnBlocks` 异常 0、同条消息内重复结论 0；实际 UI / API 重放的 DSML 残留为 0。这里的 channel 目录只能证明数据来源，单条历史消息没有持久化客户端 commit / version，不能据此宣称其精确生成版本。
- 精确版本回放：分别在 `main@a8ec5784eb13a248f5ff3586800819fa070ea250` 与 `open-design-v0.21.0@dbbd3b42eab9609065637452b347f903d7125ecd` 的 daemon/runtime/parser/DB 持久化链生成同一份确定性 Thinking + Todo + 两次媒体工具调用 fixture，先由当前分支基线 `c90c1e899e` 消费，再由含 P0 / P1 修复的最终提交 `7c971791a5` 复验。producer DB 在复验前记录的 SHA-256 分别为 `aed1a4078f813aac03a59101dcaefc4daeed879fd6a1047c4aed57703fa49e65` 与 `211fb9389ce1a0f7b73d4c8298b1cb771a184435362d693526417d25a6534664`。
- 精确版本结果：两组在 `7c971791a5` 首次打开时均为 `assistant=1`、外层 `details=1`、未挂载折叠 body、结论 `=1`、DSML `=0`；展开后均完整恢复 `details=5`、body `=4`、消息内图片 `=2`、结论 `=1`、DSML `=0`，一次硬刷新及再次展开数值完全一致。release consumer 首轮曾因隔离副本把 `designSystemId` 从 `"default"` 漂成 `null` 而停在 setup bootstrap；修正测试夹具后通过，确认不是 P1 回归。fixture 故意保留第二项 Todo 为 `in_progress`，因此 footer 显示“已停止，仍有未完成任务”，这验证 unfinished 历史语义，不是回放失败。
- 组件覆盖：Thinking Markdown、Plan / Todo、读 / 写 / 搜索 / 执行 / 删除 ToolRow、Question Form（待答 / 已答）、产物文件、错误卡、失败 / 手动停止 footer、绝对路径文件链接、附件和结构化 next_steps 均有 channel 历史样本；ImageRow 另有上述两个精确 producer 版本样本。纯 content-only assistant、音频产物、Queue、待发送附件、重连与升级属于样本缺口或瞬时状态，不能从持久化旧会话证明。
- 组合与刷新：stable 的 Question Form + Plan + ToolRow + 结论 + 错误卡组合、legacy-beta 缺失 `run_status`、beta 手动停止、prerelease 87 个 details 的长执行记录均可打开；多组 2–3 次硬刷新后消息数、结论数、Question Form 数与 terminal footer 稳定，无重复 assistant hash、无协议残留。首次从“手动展开全部 details”进入刷新时 hash 会因折叠状态复位变化，后续轮次稳定，不是正文重复。
- 交互验证：旧文档附件点击会打开对应文件标签；旧绝对路径 Markdown 链接能解析为当前项目文件并在 workspace 内切换；未回答 Question Form 连续刷新仍保持可交互。
- P0 上线阻断（已修并通过 Beta 包）：设计稿 #16 明确“点击建议只填入输入框，不直接发送”，但原实现会立即持久化 user message 并创建新 run。现已改为 `composerRef.setDraft(prompt, { entryFrom: 'next_step' })`；live 回合与经过 JSON 持久化边界的历史 replay 红绿用例均断言只填草稿、`onSend` 未调用、消息数不变。隔离 Beta 包中点击真实历史建议后，Composer 出现完整建议文案，user / assistant 消息数保持 `1 / 2`，没有自动发送或创建新 run。
- P1 性能（本地已修）：精确 63,472-event Beta message `ab7ff827…` 中，61,614 条 thinking + 1,771 条 text 在 daemon 归一化后只有 125 events / 2 blocks，parse + normalize + serialize + client parse + build 合计仅十几毫秒；消息 API 热读为 5.6–9.2ms，确认 3 秒以上首开不在 parser / API。补丁把已结束、初始折叠的 ExecutionShell / Thoughts / Plan / Todo / 命令正文改为首次展开再挂 DOM，live / failed / in-progress / default-open 首帧仍挂载，且首次展开后再次折叠不会丢子状态。完全相同的相邻 `TodoWrite` 快照另在 daemon 与 live buffer 两侧窄范围折叠，普通 Bash / 其他工具不做深比较。
- P1 同机 A/B：同一 Beta 数据副本、同一 63,472-event 会话、同一 Playwright 脚本、均预热排除 Next 冷编译；`c90c1e89` 三次 ready 为 13.35s / 10.75s / 8.02s（中位 10.75s），补丁后为 5.73s / 5.12s / 6.07s（中位 5.73s，约 -46.7%）。目标 assistant 初始后代 DOM 从 2,799 降到 119（约 -95.7%），初始 details 从 29 降到 1。该数据来自 dev runtime，证明方向与量级，不替代 production / Beta 包门槛。
- Beta 包验收：从 `a57542773e` 构建、DMG 安装并从隔离安装目录启动 `Open Design Beta 0.21.1-beta.999`；packaged app 显示 AMR 余额，`/api/app-config` 确认 `agentId=amr` 且 `OPEN_DESIGN_AMR_PROFILE=test`。长会话 SPA 切换到可见首屏为 307ms，初始仍为 119 个后代节点 / 1 个 details / 0 个折叠 body / DSML 0；完整展开约 377ms，恢复 2,799 个后代节点 / 29 个 details / 203,613 字符 / DSML 0。短会话 SPA 切换为 282ms，说明长会话懒挂载在 production bundle 中生效。
- 新 P1（packaged 全页 bootstrap，代码已修）：长会话三次硬刷新到 assistant 可见为 17.91s / 14.95s / 16.62s（中位 16.62s）；只有 7.9KB events 的短会话硬刷新同样为 17.02s，而页面 Navigation Timing 的 `loadEventEnd` 仅约 239ms。根因是 Team authoritative catalog 不可用时被折叠成“共享项目仍在物化”，随后执行 21 次 × 600ms 重试。现在 pull outcome 显式携带 `catalogAvailable`：首次 catalog 不可用立即进入现有 retry UI，不再等待；只有此前已经确认共享的项目才在后续 catalog 短暂不可用时继续保留 materializing 语义。聚焦回归以 21 次配置断言只读本地一次、读 catalog 一次、delay 0 次。真实 Team 权限 Beta namespace 仍需复验实际硬刷新时间。
- P1 重复快照样本：真实 9,280-event TodoWrite 样本在通用原型中从 9,280 events / 4.19MB 压为 15 events / 2.2KB；最终实现进一步收窄为 TodoWrite-only，测试覆盖 pending→completed 变化、Question Form 文本边界、next_steps 保留以及相同 Bash 不去重，避免普通 same-id/different-state 流的 stringify 退化。
- P2 语义图标（已修）：ToolRow 的 delete 动作使用独立垃圾桶 icon，不再复用写入铅笔；聚焦测试同时断言 delete 与 write SVG 结构不同。
- 类型债（已修）：`thinking-markdown.test.tsx` 的 ExecutionShell fixture 与 `artifact-card-desktop-viewport.test.ts` 的 nullable regex capture 均已修正，web typecheck 通过。
- 验证边界：按用户要求未跑全量测试；本轮使用聚焦测试、typecheck 和 packaged 关键路径。当前源码已成功构建 macOS app 与 DMG，并直接启动该构建产物验证 Electron `od://app/` ready、Beta identity / version / channel 正确；`tools-pack mac install` 仍暴露一个既有 harness 名称不匹配（DMG 内为 `Open Design Beta.app`，install 查找 `Open Design.app`），因此本轮不宣称 installer harness 通过。隔离 package 没有完整 Team authoritative resource 环境，bootstrap P1 仍需真实 Beta namespace 复验。

### 22. Question Form select 与 Chat 底部滚动 / Plan 浮层

- 状态：**现场问题与滚动专项审计的两个 P1 均已修复。**
- Question Form `type: "select"`：撤掉原生下拉框，复用设计稿现有的纵向单选行和内联“自己填”。不改 schema / 提交协议；旧会话里的 machine value、显示 label 和未知自定义文本均可恢复，已固化三类兼容用例。
- 距底几十像素自动吸底：旧状态机在 40–120px resume band 内提前清除 escape intent。现在只有同一次真实用户下滚到 8px bottom tolerance 内才重启跟随；`scrollHeight` / `clientHeight` 变化和原生 scroll anchoring 不得伪装成用户动作。ResizeObserver 落定后同步刷新几何 baseline，避免下一次真滚动仍拿旧高度比较。
- Plan Pill 白带：根因是 Plan 作为 `.pane` 的普通 flex 子项，mount 时压缩 chat-log clientHeight，不是单纯背景色问题。现已新增 `.chat-log-viewport`，Plan 在其底部绝对定位，满宽透明层不接管 pointer events；queue / composer 仍按普通布局改变 viewport，project toast 保持在 viewport 外。“回到最新”同时出现时 Plan 上移一档。
- Question Form 初始定位：撤掉 `scrollIntoView(... smooth)` 的中间帧竞争，改为 instant/auto 定位；预测落点只有真底部才恢复 follow，不再使用 near-bottom band。
- 聚焦验证：Question Form / scroll-following / stick-to-bottom / Plan Pill / jump / feedback 共 7 个文件 98 条通过；Web typecheck 通过。仅有 jsdom 既有 canvas warning，按用户要求未跑全量测试。
- 滚动专项 P1 收口：① Question Form Next / Back / 自己填现在优先锚定切换前首个可见消息，卡片局部高度变化不再把阅读位置整体上推；无可用 viewport 几何的宿主仍回落到原 named control anchor。② `>80` 条消息的虚拟窗口在行高从估算值切到实测值前捕获 first-visible key 与 clipped offset，重排后恢复同一可见锚点；只变化 viewport 下方行时不写 scrollTop。两条均有独立红绿规格，分别覆盖普通 DOM rect 与 transform-only 虚拟重排。

### 23. `kind=other` 的 direction-cards 只显示空表单

- 状态：**根因修复、prompt / Design Harness 契约统一和本地真实 AMR 浏览器复验均已完成；打包 Beta 复验仍跟随下一包进行。**
- 现场：Beta `0.21.1-beta.8` 项目《风格选择测试》（project `6ed96025-…`，kind=`other`）中，Codex 三次输出合法的 `direction-cards + options`，均未带 legacy `cards`；表单只显示标题、问题和按钮，没有视觉卡片，提交记录均为 `(skipped)`。
- 历史对照：旧 `release-beta` 项目 `Prototype · 4/30/2026`（kind=`prototype`）在 2026-04-30 由 Claude 输出过 5 个 options + 5 个完整 cards，用户随后成功选择 `warm-soft`。当时系统 prompt 的 Branch A 要求原样输出 `renderDirectionFormBody()`，所以完整 cards 不是 Claude 临场猜中的。
- 协议演进：当前 `cards?:` 明确可选；2026-08-26 起 `direction-cards` 在有 `visualStyleContext` 时由 Host 内置真图目录接管，模型不再需要携带 mood / palette / font / preview 数据。本次并非 Codex 漏必填字段，而是 kind=`other` 未映射 catalog，fallback 又只接受 legacy `q.cards`，两路都落空。`variant:"fan"` 不属于协议，会被 parser 丢弃。
- Harness 结论：该会话虽然 app-config 请求 `odNextStrategyMode=active`，但实际 `effectiveMode=off`、`decisionClass=not_applicable`、`taskType=null`；这次不是新策略 prompt 接管导致。审计同时发现 OD Next 的 `direction-picker` atom 仍要求 Agent 准备 3–5 个方向，与 Host 目录接管语义冲突；现已连同 classic、slim、Ask 和 API/BYOK 路径统一为同一职责边界。
- 当前修复：`other` 和 `template` 与它们实际共用的 HTML prototype 生成路径一致，映射为 `prototype` visual-style context。模型只决定是否输出 `direction-cards`，Host 按项目类型决定目录、预览、推荐和稳定 ID。提交答案同时回传 Host `value`、Agent 可用 `od tools directions` 解析的 `foundation` 和该卡的视觉 `guidance`，避免把 `prototype-quiet-saas` 之类的 Host ID 错当成旧方向库 ID。技术元数据放在 stable value token 之前，最后仍保留独立 `[value: …]`，因此“已确认”摘要只显示用户选择的标题和预览；短暂生成过的 `[value: host-id; foundation: …; guidance: …]` 格式也已加入回放兼容。现场 options-only payload 与正式的无 options / 无 cards 裸触发器均已固化；修前视觉卡数为 0，修后显示 prototype 目录真图且卡片数与 preview 数一致。
- 设计稿对齐补漏：React 版已具备设计稿的 8px 卡片内间距，但漏了 `.opts.mod-visual` 的 11px 左右外边距；现已给视觉切换栏和卡片 stage 补齐 11px gutter，footer 保持自身 11px padding，避免重复加宽。
- 真实浏览器复验：仅启动 daemon + web（desktop/Electron 保持 `idle`），Chrome 中以 AMR test 对 `kind=other` 项目发送无 `options/cards` 的最小 `direction-cards`。Host 成功展示 prototype 真图目录；选择 Quiet SaaS 后，持久化消息精确包含 `value: prototype-quiet-saas`、`foundation: modern-minimal` 与 guidance；后续 Agent 无工具调用，只确认三项。硬刷新后已确认答复和完成消息仍可恢复。证据截图：`.tmp/e2e-evidence/direction-foundation-reload.png`。
- 聚焦验证：Web direction-cards / 视觉 gutter 共 7 条、daemon core-slim 46 条、contracts prompt 23 条全部通过；Web / daemon / contracts typecheck 通过。按用户要求未在本机跑全量测试；远端 P0/P1 另行跟踪。

## 已完成 / 已合入本分支

### 修复批次 `c5b047dfd9 fix(chat): address module feedback regressions`

- 已推送到 `origin/feat/chat-panel-next-impl`。
- 包含：
  - OPEND-2420：历史菜单打开时保留“回到最新”，并修复 z-index。
  - OPEND-2418：图片预览 border 使用 `box-sizing: border-box`。
  - OPEND-2415：反馈提交合并时保留较新的 optimistic feedback。
  - OPEND-2411：thinking dots 垂直居中。
  - OPEND-2409：无保存自定义值时，项目 chat / preview 默认 1:1。
  - OPEND-2406：历史 / live thought collapse 回归覆盖。
- 验证：5 个测试文件 / 52 tests；FileWorkspace 定向 4 passed / 94 skipped。未跑全量。

### 模板 / 插件上下文错误

- 主线 PR：<https://github.com/nexu-io/open-design/pull/7533>
- 用户已确认该 PR 合并。
- 本分支需要持续确认已集成对应提交，避免首页选择的模板进入会话后被错误替换为“克制的 COO 经营复盘”，或顶部“正在使用”插件消失 / 显示错误。

## 已确认的边界与非本轮问题

### OPEND-2410：Agent 没有 Todo

- 状态：**按当前产品契约关闭，不再作为本次未完成项。**
- 诊断确认：目标 Claude Run 没有发出 TodoWrite / TaskCreate / TaskUpdate / update_plan / write_todos；不是 UI 丢数据。
- 当前分支已显式设置 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`，并将 Claude TaskCreate / TaskUpdate 归一为 TodoWrite；本轮 Agent runtime 聚焦矩阵通过。
- Agent 即使拥有工具仍可能选择不发计划；现行规格明确“有 Todo 则分段、无 Todo 则 flat”，因此无清单不是异常状态。客户端不伪造 Todo，不新增 `plan_missing`，也不继续堆提示词。

### Strategy 长时间运行 / 超时

- `OD_NEXT_STRATEGY_MAX_RUN_DURATION_MS` 是运行结束后的 rollout 观察阈值，不是硬超时；不能直接复用为进程终止 deadline。
- 如要加 wall-clock timeout，需独立配置并覆盖 cancel race、ACP abort、进程树终止、termination barrier、禁止自动重试和 strategy blocked 收敛。

## 用户已明确的长期产品决策

- Composer 的“设计”是固定默认能力，不可选择；首页和对话内都不显示可切换的“设计”选项。
- question-form 有多种形态，底部按钮和 footer 必须逐态对齐主设计稿，不得自行发挥。
- 主设计稿：`/Users/elian/Documents/od-design-artifacts/chat-panel-next.html`
  - md5：`28ea4c6558d6158e88976e11283e269e`
- 场景稿：`/Users/elian/Documents/od-design-artifacts/chat-panel-scene.html`
- Codex beta 验证希望开启 app-server transport；打包 / 发布时需显式确认 `OD_CODEX_TRANSPORT`。
- 不跑全量测试，避免占满用户电脑；使用聚焦测试与必要的本地 UI 验证。

## 下一次接手时先做

1. `git status --short --branch`，确认当前修复是否已经提交推送。
2. 使用有正常 Team authoritative catalog 权限的真实 Beta namespace 复验全页硬刷新，确认不再出现 15–18 秒等待；同时完成 Harness 开 / 关 live 会话，验证 done / next / focus 实际输出。
3. 为 OPEND-2410 决定产品方案：修 Agent Todo contract，或新增诚实的 `plan_missing` 状态；不要在客户端伪造 Todo。
4. 按上述全量复核清单补缺失的 post-fix 真机 / E2E，尤其是 OPEND-2195 / #12 顺序生图、#11 会话行下半部、#19 手动停止、#2 Ctrl+Shift+R。
5. 跟进 Question Form 组件族设计评审；视觉基准仍是 `chat-panel-next.html`。
6. 每完成一项，更新本文对应状态、测试层级和是否真实 E2E，禁止把聚焦测试写成真机验收。

## Plane 模块增量快照：OPEND-2482 及之后（2026-09-01）

> 数据源：Plane 模块 `ChatPanel 优化` 的已登录列表 DOM，只读抓取时间
> 2026-09-01 21:50（Asia/Shanghai）；22:43 通过每行只读 `Edit` 弹窗补读描述。
> 模块当前 DOM **不包含 OPEND-2482**，
> 因而不能推断它已删除、已移出模块或只是列表未加载；需要 API / 详情页恢复后复核。
> Plane API 直达目前被浏览器拦截，事项详情直链同时触发 Cloudflare；未知字段均明确
> 标成“API 阻塞，未确认”，不以标题或列表图标猜测。描述为空是 Plane 编辑器实际为空，
> 不是漏读；“仅截图附件”表示编辑器只有图片节点、没有文字。编辑弹窗只暴露 `Add parent`，
> 这不能证明没有依赖或重复关系。

| 编号 | 标题 | 状态 | 优先级 | 描述 | 最新更新时间 | 依赖 / 重复关系 |
|---|---|---|---|---|---|---|
| OPEND-2497 | [ChatPanel] 添加到对话任务完成后未展示下一步引导 | 未立项 | Medium | “添加到对话”任务完成后缺少 3 条上下文相关、点击只填入不自动发送的下一步建议。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2500 | [ChatPanel] PPT 生成完成后未展示下一步引导 | 未立项 | Medium | 描述为空。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2543 | [ChatPanel] 媒体产物路径变更后缩略图裂图 | 未立项 | High | 媒体路径规范化 / 移动 / 重命名后，会话卡仍请求旧路径并 404；需同步最终地址并容忍注册延迟。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2544 | [ChatPanel] 思考过程中不展示媒体 Retry，避免与 Agent 自动重试冲突 | 进行中 | High | Agent 仍在自动切换 Provider 时不得展示手动 Retry；仅整次 run 终态失败后给一次 Retry。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2545 | [ChatPanel] 图片修改生成后会话产物卡片仍展示旧图 | 未立项 | High | 同一图片修改完成后右侧已是新图、该轮会话卡仍是旧图；要求新旧产物版本语义稳定且点击、预览、导出一致。[诊断包原件](evidence/plane-chatpanel-2026-09-01/attachments/OPEND-2545-01-open-design-diagnostics-2026-09-01T11-09-27Z.zip) | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2546 | [ChatPanel] 重复添加同一文案时提示“会话已添加” | 未立项 | None | 再次添加同一选中文案时无反馈；应去重并显示一致的轻提示。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2547 | [ChatPanel] 9:16 图片在左侧预览卡片中被居中裁剪 | 未立项 | None | 竖图在会话产物卡被横向容器裁掉上下区域；应保持宽高比并以 contain / 留白完整显示。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2548 | [ChatPanel] 侧栏宽度不足时步骤耗时换行显示 | 未立项 | None | 窄栏下 `1m 59s` 被拆成两行；耗时与展开按钮需保留固定空间，标题优先压缩。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2549 | Question 卡片使用旧格式导致解析失败，并错误结束为成功状态 | 未立项 | None | Agent 输出旧 XML Question Form，前端按 JSON 解析失败，却把无产物 run 标为成功；需统一协议与等待 / 失败收口。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2550 | 生成产物之后，没有在会话栏里面出现那个产物卡片 | 未立项 | Urgent | 描述为空。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2551 | [ChatPanel] 添加到注释后输入框显示为空且发送按钮禁用，但回车仍可发送 | 未立项 | None | 注释已进入内部 Composer，但 UI 为空、按钮禁用、Enter 却可发；三者需共用同一 `canSend` 状态并正确清空。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2552 | 点击 Share 和 Export 按钮：点击一下应该展开，再点击一下应该关闭这个面板 | 未立项 | High | 描述为空；标题要求同一按钮第二次点击关闭面板。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2557 | 任务运行结束后，应该默认收起 | 未立项 | Urgent | 仅截图附件（asset `f7d7ecf7…`），无文本描述。[本地原件](evidence/plane-chatpanel-2026-09-01/attachments/OPEND-2557-01-f7d7ecf7.png) | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2558 | next step 视觉重心加强 | 未立项 | Urgent | 描述为空。 | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2559 | 导出有icon，但是分享没有icon，应该统一一下 | 未立项 | High | 仅截图附件（asset `0ba7dbbe…`），无文本描述。[本地原件](evidence/plane-chatpanel-2026-09-01/attachments/OPEND-2559-01-0ba7dbbe.png) | API 阻塞，未确认 | API 阻塞，未确认 |
| OPEND-2560 | 导出和分享的按钮有点小，可以变成跟右上角的按钮相同大小的 | 未立项 | High | 仅截图附件（asset `7a76068c…`），无文本描述。[本地原件](evidence/plane-chatpanel-2026-09-01/attachments/OPEND-2560-01-7a76068c.png) | API 阻塞，未确认 | API 阻塞，未确认 |

### 当前可见的修复分组

- 产物注册 / 路径 / 版本：OPEND-2543、2545、2550。2543 是路径变更，2545 是历史版本
  语义，不能合并成一次 cache-bust；2550 描述为空，先只按标题进入同组，定位后再决定是否同根因。
- Agent 协议 / 完成态：OPEND-2497、2500、2544、2549。2497 / 2500 都是 next-step
  缺失，可共用协议审计；2544 是自动 / 手动重试边界；2549 是 Question Form 协议和错误成功态。
- Composer / 评论输入：OPEND-2546、2551，可独立于媒体链路推进。
- 产物动作菜单：OPEND-2552、2559、2560，适合合并做 Share / Export 交互与视觉审计；
  是否互为依赖或重复仍待 Plane 关系字段确认。
- 独立视觉 / 展开态：OPEND-2547（竖图 fit）、2548（耗时 nowrap）、2557（任务结束折叠）、
  2558（Next Step 视觉），四项可分别推进。
