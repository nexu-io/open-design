# ChatPanel 修复编队调度台账(2026-09-02)

> 调度者维护。每有 agent 交付就更新本文。agent **不提交**,由调度者统一收口。

## 基准

- 工作树:`/Users/elian/Documents/od-wt-chat-panel`,分支 `feat/chat-panel-next-impl`,PR #7518
- 起点 commit:`17eb85068b`(已推 origin,工作树干净)
- **唯一最新设计基准**:PR #7170 @ `8015870095348aa40655ef70edec6ac4de6fcc1b`
  - 生成页(浏览器验收用):`/Users/elian/Documents/od-design-artifacts/chat-panel-next-pr7170-8015870.html`(md5 `495992a904b6674dd07db4e0cb8d6f19`)
  - 场景稿:`/Users/elian/Documents/od-design-artifacts/chat-panel-scene-pr7170-8015870.html`
  - 设计源码:`git show 8015870095348aa40655ef70edec6ac4de6fcc1b:docs/design/chat-panel/src/<file>`
  - 已验证:该 commit 上 `build.mjs` 重跑生成页 md5 一字不差,src 与生成页同步,不存在"src 旧、html 新"
- **旧稿仅用于 diff**:`/Users/elian/Documents/od-design-artifacts/chat-panel-next.html`(md5 `28ea4c65…`,= `1bbdce0b06`)
- 中间稿(08-30,`50cfe50cfe`,md5 `aaa6a94f…`)在 `~/Downloads/chat-panel-next (1).html`,已不是基准
- 旧→新真实变更:10 个文件,2075 增 / 650 删

## 文件独占分区(防止并行 agent 互相覆盖)

| 组 | 独占文件 |
|---|---|
| G1 QuestionForm | `QuestionForm.tsx`、`viewer/composio.css`、`artifacts/question-form.ts` |
| G2 执行记录/thinking/Todo | `chat/ExecutionShell.tsx`、`chat/primitives/record.module.css`、`Foldable.tsx`、`ThinkingMarkdown.*`、`useThinkingStream.ts`、`PlanPill.*`、`ToolCard.tsx` |
| G3 分享/导出/产物卡 | `FileOpsSummary.tsx`、`viewer/tools.css`、`OdCard.module.css` |
| G4 Upgrade/错误/重连 | `UpgradeCard.*`、`RunErrorCard.*`、`Reconnect.*`、`runtime/amr-guidance.ts`、`runtime/chat/reconnect-state.ts` |
| G5 Composer/引用/队列 | `ChatComposer.tsx`、`styles/chat.css`、Quote* 组件 |
| G6 next-step | `AssistantMessage.tsx`、`viewer/theater.css`、prompts |
| G7 生图计数/媒体 | `ChatPane.tsx`、`daemon/routes/media.ts`、`contracts/api/media.ts` |
| G8 分诊 | 不改源码,只写 `scratchpad/g8-triage-report.md` |

i18n(`i18n/types.ts` + 19 个 locale)是共享面,G1/G4/G5/G6 都可能加 key —— **收口时重点查冲突**。

## 派单与状态

| 组 | 承接 | 状态 |
|---|---|---|
| G1 | 颜色选择器、数值滑块、多选计数两段式、OPEND-2402、2401 | 运行中 |
| G2 | **修红 CI(2 个 Todo 用例)**、thinking 流窗口 16px、执行层级排版、skipped token、OPEND-2557、2548、2417 | 运行中 |
| G3 | OPEND-2552、2559、2560 复验、2547 复验、artifact overlay + 16px modal | 运行中 |
| G4 | Upgrade 卡改版(CTA 移底排 + 配色翻转)、错误卡 16px、重连字重;**错误卡文案只审计不改** | 运行中 |
| G5 | OPEND-2551、2546、用户气泡 #121212 / 静音 #a3a3a3、队列 icon + steer | 运行中 |
| G6 | OPEND-2558、2497、2500、2412 + **五条 prompt 路径 next-step 契约审计** | 运行中 |
| G7 | OPEND-2195 生图逐张计数、2543/2544 边界复验补洞 | 运行中 |
| G8 | OPEND-2419、2416、2414、2194、2410 分诊定位(不改码) | 运行中 |

## 明确挂起 / 不做

- **选项列表分组能力(常用/更多折叠)** —— 用户挂起待讨论,任何 agent 不得实现
- **`FormOption` 行尾副标(language-code)** —— 需扩 schema,同上挂起
- **OPEND-2545 图片历史版本语义** —— 有独立待评审设计 `chat-artifact-versioning-design.md`,不得顺手做 mtime cache-bust
- **错误卡「从失败处重试」→「重试」** —— 产品逻辑,G4 只出审计结论

## 已知未决

- PR #7518 CI 红:`ToolCard.todo.test.tsx` + `assistant-message-unfinished-todos.test.tsx`,疑似折叠延迟挂载性能补丁回归 → G2 负责
- Plane 附件 22 份只落盘 4 份,18 份因 401 + 组织策略拦截未取得(见 `evidence/plane-chatpanel-2026-09-01/attachments/manifest.md`)
- Plane 写 API:**必须用 curl**,python urllib 会被 Cloudflare 按 UA 挡成 403
- 附件二进制(12MB)故意留在 git 外,只提交 manifest

## 已同步到 Plane

2026-09-02 已把 22 项置为「进行中」(只 PATCH `state`,未动 assignees)。改前全量快照:
`scratchpad/plane_module_BEFORE_1033.json`

## Plane 状态流转纪律

工具:`scratchpad/plane-state.sh <inprog|done|testing> <编号...>`(只 PATCH `state`,不动 assignee;必须 curl,urllib 被 Cloudflare 挡)。

流转规则:
1. **派单即置「进行中」** —— agent 一开工就改,让用户实时看见。
2. **「开发完成」必须先证明红测能看见缺陷** —— 撤掉实现后精确变红、恢复后变绿,两边都留输出。只有 commit 存在、只有测试绿,都**不够**。
3. 依赖真机 / 真实 AMR / 打包客户端才能确认的,停在「进行中」,在本文写明缺什么证据。

### 已流转

| 编号 | 状态 | 证据 |
|---|---|---|
| OPEND-2549 | **开发完成** | 撤 `question-form-detect.ts` → 精确红 `counts the legacy child-tag form…`;撤 `design-delivery.ts` → 精确红 `does not report a malformed closed question form as a successful text answer`;恢复后各 18/18 绿 |
| OPEND-2497 | **开发完成** | G6 交付。撤 `AssistantMessage.tsx` → 新用例 `renders the agent-written suggestions on a completed turn with no produced file (OPEND-2497)` 精确红;恢复后 23 passed。另加失败/取消轮的反向守卫,和「点击只填草稿」的参数级断言(`setDraft(text, {entryFrom:'next_step'})`) |
| OPEND-2550 | 进行中 | commit `c3bf52b67f` 带 121 行新测试,但 `AssistantMessage.tsx` 当前由 G6 独占,**无法安全做撤销复验**。等 G6 交付后由调度者补验再流转 |
| OPEND-2543 / 2544 | 进行中 | 已提交 `f8b6c6c248`,G7 正在做边界补洞(mtime 容差、同尺寸撞车、注册窗口),验完再流转 |
| OPEND-2560 / 2547 | 进行中 | 前一轮已改,G3 正在复验是否误伤其他卡型,验完再流转 |

## 2026-09-02 调度者发现的回归(重要)

`AssistantMessage.test.tsx > never shows the tool-op summary and the produced-files block at once (P0 recvqaerXd82bE)` 红。

**这是 commit `c3bf52b67f`(OPEND-2550)引入的,不是既有红。** G6 曾判为「既有失败、疑似 G3 在飞」——它对照的 HEAD 已含该 commit,所以判错。

冲突的两条不变量:
- 2550 要:`producedFiles === undefined` = 尚未结算 → 回落工具行证据;`[]` = 权威空 → 不回落
- P0 要:有真实 `Write` 工具行 + 有 `declareTurnCards` 声明,即使 `producedFiles: []` 也必须出卡

`c3bf52b67f` 新增的 `if (produced.length === 0) return [];` 是断点。那条 P0 fixture 证明 **daemon 会在确实写了文件的回合给出 `[]`**,所以「`[]` = 权威空」这个语义在当前数据链上站不住。

已转 G6 修(它独占 `AssistantMessage.tsx`),要求:两条不变量都要绿、各自撤销复验、**不许为了 P0 变绿把 2550 退回去**。

## Plane 附件:资产 401 已复核

调度者亲自复验:带 API key 直取 `/api/assets/v2/.../<asset-id>/` 对 2558、2550 均返回 **HTTP 401**(58 字节 JSON,不是图)。manifest 记录的 18 份 blocked 属实,API key 无资产读权限。
唯一已验证可行的路径是**已登录浏览器**(前一轮 2557/2559/2560 三张就是这么拿到的,记为 `embedded-image-snapshot`)。
影响:OPEND-2558(Urgent)、2550(Urgent)、2552(High)描述为空或仅图,**没有原件就无法下手,不能靠猜**。

## G8 分诊结论(2026-09-02,已核实采纳)

### 四张单子是同一个 run

OPEND-2410 / 2414 / 2416 / 2419 全部诞生于同一次会话的同一个 run(`3fc3b3ae`,08-28 07:17→08:02,44.7 分钟),建单时刻分别落在 run 内 +6.8 / +12.7 / +19.6 / +31.3 分钟。此前当四件事分诊,所以每次都找不到抓手。

| 单号 | 结论 |
|---|---|
| 2419 | **不是卡死,是模型行为**。最长静默 150s 且都是正在跑的 Bash;结束态 `cancel_requested` exit 143(用户自己停的);产出 3 个文件。44.7 分钟去向:模型思考 28.5min(64%)、卡在 4KB/s 维基图片下载 14.1min(32%)、真正写产物 2.1min(5%)。模型在上一轮 plan 里写了「抓不到就退化成占位」却从未执行,而是 `sleep 75→110→150` 轮询 + 三次重启抓取脚本。全程可见文本仅 221 字符 |
| 2416 | **与 2419 重复**,建议并单。建单那刻 run 正常推进,「卡住」是感知不是状态 |
| 2414 | **模型压根没发 question form**。四个 run 的文本流 + 思维流全文检索,`<question-form` 出现 **0 次** → 「解析不出」「解析了没渲染」都被排除。根因在 `apps/daemon/src/prompts/discovery.ts` 的 RULE 1:把发问设成默认不发。**与 §23 的 direction-cards 缺陷无关**(那个的前提是表单已发出) |
| 2410 | **旧结论推翻**。不是「模型可以选择不发计划」,是**清单工具根本没暴露**(详见下节)。按 agent 实测:claude **0/3** 个 run 发清单(47 次工具全是 Bash),AMR 4/18 发、共 10 次 TodoWrite。用户当时猜的方向对,但准确说不是提示词,是工具暴露 —— 而系统提示里有 **17 处**让模型用一个它拿不到的工具 |
| 2194 | **已置开发完成**。分支比单子要求的更彻底:没按单子加映射,而是在 `acpToolName` 入口做权威归一。差分实测:main 版在带描述性 title 时产出 `Other`(清单整个消失),分支版 5/5 正确;仓内测试 4/4 绿;beta.7 诊断包 18 个真实 AMR run 精确 `"TodoWrite"` 10 次、零 mangling |

### ⚠️ 生产缺陷:Claude 的 Todo 卡在所有已发布版本里都画不出来(调度者已复核)

- `22e2ee0ec3 fix(daemon): let Claude Code draw the Todos card again` **不在 `origin/main`、不在任何 tag**,只活在若干 feature 分支(含本分支)
- main **有**解析侧:`claude-stream.ts:145/161/186` 把 `TaskCreate`/`TaskUpdate` 归一成 `TodoWrite`
- main **没有**那个 env 开关(`CLAUDE_CODE_ENABLE_TODO_TOOLS`)→ Claude Code ≥2.1.x 不向模型暴露 plan 工具族
- 净效果:**已发布版本里那段归一逻辑在等一个永远不会到达的事件**;`open-design-v0.21.0` 上确认没有
- 本分支有(`apps/daemon/src/runtimes/env.ts:99-100`)
- **待用户拍板**:是否单独往 main 提一条修复(参照模板/插件上下文那次 PR #7533 的打法)

### 新发现的缺陷:daemon 把同一个 tool_use 发两遍(已派 G8 修,不开单)

`claude-stream.ts` 的去重守卫是单向的:`assistant` 那条路查集合,`content_block_stop` 那条路只 add、自己从不查。beta.4 三个 run 无一例外,40/40 对 input 逐字节相同。已在当前分支复现(5 形态 4 绿 1 红)。
用户影响小(web 侧有一层去重兜着),但 `events.jsonl` 是脏的,任何不去重的消费方看到 2 倍工具数。
按用户「自己的发现自己跟进,不自建 issue」的规矩,不开 Plane 单,直接派 G8 修。

### 需要产品拍板的三处

1. **2414 的发问阈值**:速度 vs 确定性,`discovery.ts` 目前写死选了速度
2. **2419 的进度面**:`quietMs` 探测还在算但**自 08-27 起无人消费**(产品撤了「上游响应慢」文案、要求保留探测)。本案真正没被覆盖的形态是「流很活跃但 28 分钟没有产物落地」
3. 2416 是否与 2419 并单

### G8 自查掉的一个错(值得记)

它一度拿 beta.7 包当「已修复」对照组,得出「重复率 0%」。但 beta.7 那 20 个 run **全是 AMR,根本不走 claude-stream**,对照组无效。修正后没有任何证据表明已修复,才转去写复现脚本。

### 仍缺的证据

1. `0.21.1-beta.7` 的构建 SHA —— 「beta.7 已含 2194 修复」是从产出字符串反推的高置信推断,不是直接证据。诊断包 manifest 记 version/channel 但**不记 SHA**,建议补该字段
2. claude 侧发清单率样本仅 n=3,发版验收建议补 flag on/off 各 3 轮对照
3. 现有包只对 `agent_thought_chunk` 采样 `acp_raw_event_shape`,看不到 ACP 工具帧原始键集

## 产品裁决:设计稿与产品口径冲突的项(2026-09-02)

> 这类冲突会反复出现,统一记在这里。**产品口头裁决 > 设计稿**。

### 1. 思考区不要滚动窗口(推翻最新设计稿)

用户与设计同学线下讨论后决定,原话:
> 先不要这个滚动的了,这里文本就和外面普通文本一样有个流式的效果就行,不要这个滚动效果了,**滚动太慢了,也很难看清**

- **作废**:设计稿 `.stream-viewport` / `thinking-stream.css` / `thinking-stream.js` 那一套(固定高度视口 + 自动滚动跟随 + 上下渐隐遮罩)。「很难看清」指的就是遮罩把上下行淡化掉了。
- **要的**:思考正文与普通正文同一套流式逐字浮现(blur-in),自然高度、不设视口、不裁剪。
- **保留**:灰底容器本身、折叠/展开行为。
- 实施:G2。盘点口径已同步 W3(不得列为缺口,要单列为"设计稿有、产品已否决")。
- ⚠️ 衍生风险:去掉视口后长思考会把执行记录撑很长。若成立是**新的产品问题**,不许自行加 `max-height` 把滚动变相加回来。

### 2. 错误卡「从失败处重试」→「重试」:设计稿的改动其实已是现状

G4 全仓核实:「从失败处重试」在产品源码里**一次都没出现**,产品早就是「重试」。该字符串只存在于设计镜像 fixture 和注释里。
更要紧的结论:**这个产品里没有任何一个「重试」是从失败点恢复的** —— 约 33 种失败态点重试都是整轮重跑。真正从断点续的是「继续运行」,且对可恢复失败产品是故意用它**替换**重试(否则会既 resume 又重发原话,活干两遍)。
遗留:`amr-guidance.ts` 的 `primaryActionForFailure` 注释仍在重复设计稿那句不准确的说法,应改为"重新跑这一轮"。

## 用户实测发现(2026-09-02,本地 runtime :17573)

| 现象 | 归属 | 状态 |
|---|---|---|
| 选项描述文字冲出卡片右边界被裁 | G1(`composio.css` `.qf-chip-desc` 无任何换行/溢出处理) | 已派 |
| 「已确认」摘要块缺底色 | G1。**确认没对齐**:最新稿 `components.css:2107-2113` 有 `padding:12px` / `background: var(--bg-panel)` / `border-radius:16px`,产品 `composio.css:4222` 三条全缺 | 已派 |
| 「Add to chat」浮层跑到离选区很远的下方 | W6(`QuoteBar.tsx`)。怀疑用了整条消息的 rect 而非选区 Range 的 rect | 已派 |

## 本地预览运行时

```
web     http://127.0.0.1:17573
daemon  http://127.0.0.1:17456
namespace  chatpanel
OD_DATA_DIR  ~/.od-chatpanel-preview   (隔离,不碰日常数据)
desktop  idle(按用户要求不起 Electron)
```
停:`pnpm tools-dev stop --namespace chatpanel`

## W2 结论:重试 / 恢复语义(2026-09-02)

### 已坐实的三件事

1. **客户端与 daemon 判定不一致是真的**。客户端 `ChatPane.tsx:1888` 只看 `resumable && agentId 匹配`;CLI `cli.ts:7816` 更弱,只看 `status.resumable`;daemon `agent-session-resume.ts:139-152` 还要比 `storedModel` / `storedCwd` / cursor。红测实测「失败→换模型→点继续」确实让 daemon 判 `model_changed` 并开新 session。

2. **但 Web 客户端不受影响**。挡住它的是 `server.ts:2109-2118`:Web 每次同时寄 `message`(整份 transcript)和 `currentPrompt`(只有最新一轮),daemon 接上了用后者、没接上用前者,**两条分支都对**。Web 不需要改,改了反而会把原话塞两遍。

3. **真正在漏的是 `od run continue`(CLI)**。它只发 `message = RESUME_CONTINUE_PROMPT`,不带 transcript。红测抓到 stdin 全文 52652 字符里原始请求出现 **0 次**。受影响面是所有拿 `od` 当后端的外部 agent(hermes / openclaw / bot),不是 UI。

### 新发现:Retry 会往已恢复的 session 里重发原话

链路(纯读码确认):第 1 轮成功存 session S(cursor=A1)→ 第 2 轮恢复 S、发 U2、**非可恢复**地失败 → UI 因 `resumable=false` 显示「重试」→ 点击后 guard 仍通过(A2 被 `currentAssistantMessageId` 排除,cursor 仍等于 A1)→ **再次 `--resume S` 并重发 U2**。
即 `ChatPane.tsx:1877-1887` 注释描述的「恢复+重发=干两遍」,**在 UI 主动路由到「重试」的那条路上现在就在发生**。

### 修法

- **CLI 洞(可先做)**:`ChatRequest` 增可选字段 `resumeContinuation?: boolean`;daemon 在 `requiresFullTranscript && resumeContinuation && storedSessionId && storedLastMessageId` 时,用 `agent_sessions.lastMessageId` 精确锚点取回被拒 session 当时的原始请求并渲染进 body。纯增字段,**现存调用方输出逐字节不变**,Web 不动。⚠️ contracts 改完必须重建 dist。
- 顺带:`RESUME_CONTINUE_PROMPT` 有两份副本(`web/runtime/resume.ts` 与 `daemon/cli.ts:35-40`),字面漂移无人守护,建议收进 contracts。
- **Retry 那条待产品拍板,不要自己定**:两种用户意图(被截断想接着做 / 方向错了想推倒重来)修法互相排斥,选错比不修更糟。

### 交付物
- 新增红测 `apps/daemon/tests/resume-continue-prompt-context.test.ts`,当前 `1 failed | 1 passed`(第 2 条是对照组,证明 Web 那条路是好的)
- **源码零改动**。该测试文件**暂不提交**,等修法落地一起进,避免把 CI 弄红。

## W23:证书校验失败的归因与错误卡呈现(只读排查,源码零改动)

现场:同事真实客户端,`agent_id=amr`,run `028c497b-1f60-421d-be30-d8fa0b29207c`,上游 opencode 事件流吐出
`{"error":{"name":"UnknownError","data":{"message":"unknown certificate verification error"}}}`。

### 第一问「是不是网络波动」:判不出来,而且这不是含糊其辞

这条字符串是 Bun TLS 层的兜底串,上游把**两类互斥的事故**压成了同一句话:

| 类别 | 上游证据 | 可重试? |
|---|---|---|
| 传输层瞬时失败(TLS 握手中途被 reset,证书本身有效) | opencode #43864,归为「与 econnreset 同类的 transient failure」,已提 PR 要加进重试白名单 | 是,就是网络波动 |
| 确定性环境问题(macOS + 本地代理 / 企业 MITM,1.3.17 相对 1.3.16 的回归) | opencode #21206。`NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` / `--use-system-ca` **全部无效**,而同机 curl / openssl 验链正常 | 否,重试一百次一样 |

**所以正确策略是「有限次自动重试吃掉瞬时那类 → 连续失败后升级为环境引导」,不是二选一。**

我方链路让企业代理的先验很高(AMR = vela CLI ACP,`vela agent run --runtime opencode` 在**用户本机**起 server,TLS 握手发生在用户机器到 `VELA_LINK_URL` 之间,飞连/CorpLink 完整在路径上),且本仓有实打实的先例:`98477c0924`(AMR 登录改直连优先/IPv4 代理兜底,commit 正文点名飞连 CorpLink → 30.x)、`ae67ad41b1` / `8d545196c6`(模型目录移出热路径,理由是 CorpLink 下常超时)。**但先验不是证据。**

**要同事补三条就能定论**:`vela --version`、opencode 版本、当时是否挂着飞连/代理。仓库里那份诊断包是另一台机器 2026-09-01 的,20 个 run 里没有这次,不能当现场。

### 第二问「卡片长什么样」:daemon 说别重试,卡片给了颗〔重试〕

链路端到端读通(不依赖这次 run 的现场):

1. **原文活着到 daemon**。daemon 里根本没有 opencode 流解析器 —— AMR 走 `streamFormat: 'acp-json-rpc'`,那段 JSON 是**当作不透明字符串**塞在 vela 的 JSON-RPC `error.message` 里进来的。「certificate」这个词能活下来,靠的是没人试图解析它。
2. **daemon 判对了**。`run-failure-classification.ts:273` 早就认得 `/\b(certificate|CERT_|self[- ]signed|unable to verify)\b/i` → `certificate_failure`,`retryable:false`、`user_action:'none'`,且不在自动重试白名单里。(此前以为「证书类零识别」是**错的**,已纠正。)
3. **信号送到了 web**。`failureDetail` / `failureAction` 都在契约上,`daemon.ts` 三处收下了。
4. **web 把三个信号全丢了**。`amr-guidance.ts` 里 client-environment 家族(`certificate_failure` / `proxy_configuration` / `network_configuration` / `host_policy_block` / `local_storage_failure`)**一行都没有**;`AGENT_EXECUTION_FAILED` 也不在 code 表里;一路落到兜底 `failureCard({transient:true}, ...)` → **primaryAction = 'retry'**。web **从不读 `failureAction`,也不读 `retryable`**。

用户看到的:380px 白底中性描边卡,红只出现在标题行图标 +「任务失败」;正文是兜底句(**不是上游原文**,原文只能从〔导出日志〕拿);右对齐三颗,〔重试〕是主按钮。**卡上没有任何一个字提到证书/代理/网络**,而〔重试〕= 整轮新 run(catalog 的 F3),落到确定性那一类就是点了没用、再点还是没用。

### 结构性障碍(这是要拍的那件)

`RunFailurePrimaryAction` 九个值里**没有一个是环境修复**(retry / authorize / recharge / upgrade / switch-model / launch-terminal-auth / launch-terminal-switch-model / switch-to-cloud / contact-support),而阶梯自己的注释声称「rung 1 = F4/F5/F6/F7/**F8**」。**阶梯宣称覆盖 F8,类型里却没有 F8 的动作。**

形态产品已经拍过,不是新提案:`run-error-catalog.md` R-054(:216)「证书错误 …… 企业 MITM / 自签名」→ 卡(按 cause 说)+ F8;R-097(:271)「企业网络 / 透明代理(飞连、CorpLink)」→ 卡 + F8;F8 行(:293)的用户动作清单里就写着「打开设置(代理 / 证书)」。缺的只是这颗按钮在类型里的落点。

### 落点有个坑,文案不能乱指

代理 OD 早就处理了(`packages/platform/src/proxy-env.ts` 读 `scutil --proxy` / Windows 注册表,每次 spawn 都套上),**证书信任一点没有**:全仓 `NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` / `rejectUnauthorized` 在产品代码里零命中。更要命的是 AMR 走 `execAgentFile`,**child 环境是整个替换的**,而 proxy 归一化表只有五个 proxy key,**没有任何证书变量**——用户在自己 shell 里配了 CA 也不保证传得到 vela/opencode。

→ 可靠通道只有 Settings → Local CLI → “Advanced: proxy & custom paths”(`configuredEnv` 优先级最高)。文案要**明确指向那里**,不要让用户去改 shell;同时**不要承诺「配好 CA 就行」**,上游实测这条路在 1.3.17 那类回归下无效。

### 拆单建议:别只拆证书

daemon 已有整个 client-environment detail 家族(5 个),web 一个都没接。一次把 5 个接上,比给证书开特例更划算,也正好对上 F8 的入口清单。

### 待办(已派回 W23)

1. **失配普查**:穷举 `(errorCode, failureDetail)`,三列对照 daemon 权威动作 / web 实际主按钮 / 是否一致,并标出「daemon 说 `retryable:false` 而 web 给〔重试〕」的所有格子——证书只是其中一格。**这是产品拍板真正缺的证据。**
2. **红测**:合成串 → 分类器应得 `certificate_failure`;`resolveRunFailureUi('AGENT_EXECUTION_FAILED','certificate_failure','amr')` 今天返回 `retry` 即红。**写完保持未提交**,拍板前进主线会把 CI 弄红。
3. 给产品的一页纸。

`mocks/` 里没有任何证书/TLS/`session.error` 录像,红测只能用合成串,没有现成 trace 可回放。

---

## 用户裁决:引用浮条永远留在画面里(2026-09-02)

用户原话:

> 长选区兜底,把那个发送到会话的悬浮按钮,**始终保持在画面里**不行吗?做不到吗… 但**尽可能显示在贴近选区的地方**,选区显示在视窗口内,**不能跑太远啊,跑太远肯定就是 bug 了**

优先级(冲突时上面赢):① 浮条永远在可视区内;② 尽可能贴近选区。

**这条替换掉 `QUOTE_BAR_LONG_SELECTION_RATIO = 0.5`**(「选区高度超过面板一半就认为让不开、翻下去改贴起点」)。那个比例是之前的 agent 自己补的,注释里也承认「稿子没有这一格」。

换掉的理由不只是有了裁决:那条判据在**猜**「选区大到让不开了」,而真正要回答的是「选区现在有哪一段在画面里」——这个量得出来,不用猜。而且 2026-09-02 上午修的锚点 bug 会污染它:选区曾把一块满宽的空占位盒子(在日志最底部)吞进去,于是「选区高度」变成「从选中处一直到日志底部」,**必然超过半屏、必然触发这条兜底**。源头已堵(只认被高亮文字画出的行),所以这条兜底当初定值时看到的现场,有一部分是假的。

**不动的**:上方 7px / 下方 6px 的不对称是稿子的(`specs/current/chat-panel-input-audit.md:478,495`,原文「照抄」),`edgeInset = 8` 用户没提,保持原值。

新判据改为**基于选区与可视区的交集**:完全可见 → 行为不变;部分可见 → 贴可见的那一段;完全不可见 → 走现有的「藏掉过期浮条」裁决。派给 W32。

---

## 用户裁决:产物卡「缩略是快照,点开永远最新」(2026-09-02)

用户原话:

> **html 和图片都是,产物缩略是快照,但跳过去产物永远指向最新的**

| | 规则 |
|---|---|
| 卡片**缩略图 / 封面** | **快照** —— 那一轮当时的内容 |
| **点击打开** | **永远是工作区最新文件** |

**HTML 与图片同规则,无例外。**

**这推翻了 `chat-artifact-versioning-design.md` §9.4 的「图片点开只读快照 tab」。** 该文档里若还有「点击进快照」的描述(§4.2、§16 的交付顺序)一并作废,已派 W39 在文档里标注(划掉原文 + 标日期 + 附原话,不抹掉)。

**调度失误记录**:我据设计文档派了 W38 去做「只读快照 tab」,并在给用户的说明里把「点进去打开最新」描述成缺陷。用户当场纠正(「这是预期内的啊大哥,别改偏了」)。W38 已停,**未改动任何文件**。教训:文档里的待办条目要先和用户核一次现行意图,尤其是这种「文档写了但从没实现」的项 —— 没实现本身可能就是裁决,不是欠债。

**对 W39 无影响**:它做的是 HTML 卡面封面图(缩略),裁决说卡面就该是快照,方向一致。而且这条裁决让封面更重要 —— 卡面是唯一承载「当时那一版」的地方;同时也让「截图失败静默回落 live iframe」更站得住:点击本来就走最新,卡面回落不会产生「卡面一套、点开另一套」的矛盾。

---

## 挂起:OPEND-2586「网络失败后消息未展示常驻重试操作」(2026-09-02)

**用户指示:先别修,描述好像有问题。** 任何 agent 不得实现,直到用户或报单人澄清。

单子的「预期结果」原文:

> 网络或服务异常时,失败消息应稳定保留失败态,并在气泡下**常驻「重试」**;hover 只控制时间和复制按钮,不应影响重试可见性。

⚠️ **这条预期和今天刚落地的失败阶梯正面冲突**,是它「描述有问题」的一个可能来源:

- 失败阶梯的设计原则 4 是「**『重试』只在有用时出现**」(`docs/design/run-errors/error-ux-design.md` §1),阶梯注释写着第 4 级的存在就是为了让「既没有直接修复也不是偶发的失败**不可能拿到重试按钮**」在结构上成立。
- 单子说「常驻重试」,等于要求**无条件给重试**——正是那条原则要防的。
- 单子引用「设计稿规定的常驻重试」,**这个前提要核实**:是哪一份稿子的哪一格?ChatPanel 交付稿和报错体验设计方案是两份东西,后者才是报错卡的权威。

另外单子描述里混了两件事:①「消息被包装成普通『已完成』回复」(该失败却判成功)②「失败卡出现又消失」(终态呈现不稳)。**这两件根因大概率不同**,并单会让修的人抓不到。

澄清前不要派。相关但**不是**这一单的在飞工作:W41(生图/生视频失败原因)、W42(OPEND-2581 答完却判失败)。

---

## 用户裁决:设计基线永远跟最新版(2026-09-02)

用户原话:**「跟最新版的,永远跟最新版」**。

**这条作废了台账和审计里那句「唯一最新设计基准 = `8015870095`」。**

| | |
|---|---|
| 旧基线 | `8015870095`(交付稿,2026-09-01) |
| **新基线** | **`853da24ea5`**(`origin/design/chat-cards-surface`,2026-09-02 15:43–17:18 四个 commit) |

取法:`git show 853da24ea5:docs/design/chat-panel/src/components.css`。
⚠️ `chat-panel-next.html` / `chat-panel-scene.html` 是构建产物,**永远看 `src/` 原件**。

**这不是一次性换值,是一条常设规则**:以后设计再推,基线跟着走,不需要再问。

### 已知两版差异(W43 点名的 5 处)

1. 撤掉任务进度步骤竖线 —— **我们已跟上**(`80510b5f67`)
2. Amount Slider 改版:数字框 `1.2em`→`1.35em`、高 34→42、加描边、轨道圆角换档 —— **W49 按最新稿做**
3. `.answered .k` 加字号 —— W49 核
4. 工具行文件名颜色改 `inherit` —— W50 核
5. hover 下划线改 `#A3A3A3` —— W50 核

### ⚠️ 连带影响:89 格审计的判档要重算

`chat-panel-component-gap-2026-09-02.md` 和 W43 的重新核实(已实现 46 / 有偏差 31 / 缺失 2 / 需浏览器量测 10)**都是对着 `8015870095` 判的**。跟最新版之后,**部分判「已实现」的格子会变回「有偏差」**。

三个在飞的 agent(W48 执行记录 / W49 question-form / W50 chat.css+接缝层)已各自收到通知,要求在自己那一片**顺手扫出多出来的偏差并列出**,不许默默做掉也不许默默跳过。**全量重判要等这一波落完单独跑一轮。**

---

## 待产品/用户拍板清单(累积中,均已阻塞)

| # | 事项 | 阻塞了什么 |
|---|---|---|
| 1 | 是否单独往 main 提 `CLAUDE_CODE_ENABLE_TODO_TOOLS` 修复 | 已发布版本里 Claude 的 Todo 卡全部画不出来 |
| 2 | OPEND-2416 是否与 2419 并单 | 两张单描述同一个 run 的同一件事 |
| 3 | OPEND-2414 的发问阈值:速度 vs 确定性 | `discovery.ts` RULE 1 现在写死选了速度 |
| 4 | 2419 暴露的盲区:要不要做「久无产物落地」提示 | `quietMs` 探测自 08-27 起无人消费;本案形态是"流很活跃但 28 分钟没产物" |
| 5 | 「重试」承诺什么?要不要拆「继续」/「重新来过」两颗按钮 | W2 的 Retry 重发缺陷 |
| 6 | 去掉滚动窗口后长思考无限撑长执行记录怎么办 | 真实数据 42,397 字符/轮;不许用 max-height 把滚动从侧门放回来 |
| 7 | 是否允许用用户 Chrome 捞那 18 份 Plane 附件 | OPEND-2558(Urgent)、2550、2552 描述为空或纯图,无原件不能下手 |
| 8 | OPEND-2417 需报告人补信息 | Plane 上无描述/评论/附件,G2 拒绝猜 |
| 9 | `RunFailurePrimaryAction` 要不要新增「环境修复」这一档(F8 的落点) | 证书/代理/网络类失败今天全部落兜底,给一颗点了没用的〔重试〕;catalog R-054/R-097 已拍形态,缺按钮 |
| 10 | 竖线撤掉后,「步骤间小结」那 22px 缩进留不留 | 稿子给这 22px 两条理由:「首字和步骤名对齐」(独立成立)与「不让线从字头上穿过 / 显得挂在链上」(随线消失)。W15 未自行决定,保持原值,改成贴左只需删一行 |

## W23 续:失配普查结果(2026-09-02)

穷举来自代码而非抽样:后端 67 个 `TrackingRunFailureDetail` 全集 × 前端 `resolveRunFailureUi` 的**真实返回值**(直接跑,不靠读优先级)。

| 分类 | 格数 | 含义 |
|---|---|---|
| A 前端没有行,落兜底通用卡 | **47** | 后端给了明确原因,前端一律「任务失败」+〔重试〕 |
| B 前端有行但结论和后端相反 | **6** | `membership_concurrency_limit` / `cli_not_installed` / `git_bash_missing` / `signal_killed` / `process_crashed` / `terminated_unknown` |
| C 两边一致 | 14 | 超时、空输出、余额、账号封禁、CPU 不支持等 |

**会骗用户的那一类(后端 `retryable:false`、前端主按钮仍是〔重试〕):40 格,其中在不透明错误码下真实可达 32 格。** 证书是第 17 格。分布:环境类 5、装不上/起不来 8、模型不可用 6、输入有问题 6、崩了/被杀 4、配置协议 3。

这个 32 与 W2 独立查到的「约 33 种」互相印证。

修法按分类走:**B 先修**(6 格是明确写反了,不需要新文案);A 里先挑环境类 5 格(正好是 F8 那一档);C 不动。

给产品的一页纸:`specs/current/run-failure-action-mismatch-2026-09-02.md`。

⚠️ **红测暂不提交**:`apps/web/tests/runtime/run-failure-action-certificate.red.test.ts`(7/7 红)留在工作区,等 F8 那颗按钮拍板后与修复一起进,免得把 CI 弄红。它只断言「不能是〔重试〕」,不指定该给哪颗——那颗是待拍的。后端侧的绿测 `apps/daemon/tests/run-failure-action-certificate.test.ts` 已提交,两条合起来才说明问题不在后端。

---

# 2026-09-02 深夜 · 用户裁决与交接

用户离开前的交代:「我要睡觉了,你自己盯着,都搞定了就打个 beta 包」。以下是这一段的裁决与状态,供任何接手的人直接续上。

## 用户当场拍的板(全部已落进代码,并在原地标了「对稿时不要改回去」)

| 主题 | 裁决 | 落点 |
|---|---|---|
| 壳头「已完成/已停止/运行失败」字号 | **提到 13px**,四态同号 | `record.module.css` `.fold.flat > summary`;稿子是 12,偏离原因是稿子的 `.shimmer` 自带 13 导致 run 结束时标题缩一档 |
| 视觉方向卡倒计时格式 | **保留 `M:SS`(`0:30`)**,不跟稿子的 `30s` | `composio.css` + `QuestionForm.tsx` + 测试三处标注 |
| 工具图标与文字的间距 | **维持 7px**,不跟稿子的 8px | `record.module.css`;7px 是 OPEND-2516 特意改的,而稿子自己三行错开(22/23/24) |
| 面板里裸 `<button>` 字重 | **按稿子的渲染结果 400** | `chat.css` `:where([data-chat-root]) button`;影响 220 颗按钮 |
| 设计系统状态卡 | **按稿子 1:1 实现**(推翻了我们之前"删掉换成普通气泡"的决定) | `UserStatusCard.tsx`;`ChatPane.streaming.test.tsx` 那条反向断言已翻转并记录了两次相反的决定 |
| 状态卡圆角 | **走 token(12/12/4/12)**,不跟稿子的字面 14px | 产品刻度 2/4/8/12/16 没有 14 |
| 稿子新加的 4 枚字面 hex | **可以用**,按仓库规约包一层 `--chat-*` 接缝变量 | `ChatRoot.module.css` |
| 选项行右内距 5 vs 11 | **未拍板**,现状 11px(OPEND-2402)保留并钉住 | 实测 5px 已不溢出,收回与否是产品决定 |

## 用户压着不做的

- **OPEND-2571**(多产物聚合展示 / 最多显示 N 张卡)—— 用户「我再问问」。**任何人不许自行实现"少显示几张卡"。**
- **OPEND-2586**(常驻重试)、**OPEND-2587**(网络超时)、**OPEND-2591**(批量生图)—— 用户先前分别说过先放放 / 先不管 / 去问同事。
- **产物外链 CDN 的整改** —— 用户「这个加载慢如果是仅仅这种案例才会的话,那就先这样吧」。清查结果保留,**不许改模板/skill**。

## ⚠️ 量具的可信度(影响所有"对稿差异"结论)

镜像陈列页曾经在**批量制造假差异**,四种机制都已证实:

1. 生成器只内联「挑中的」CSS 规则 —— **没被挑中的整条规则**会表现成一格的全部属性都不同
2. 裸挂、**缺产线上真实存在的祖先** —— token 解不出来、兜底值顶上,报成"色差一档"
3. 它**自己重写了产品的渲染逻辑**(画球那段写死 `box = 20`,丢掉 DOM 上的 `data-orb-box="24"`)
4. LCS 按位置配对时**把两个不同的元素配到一起**(稿子的开场白 vs 我们的推理段落)

**后果**:那份"14 条真差异"的清单,查证 9 条中有 7 条是假的。

已修:挑选器补齐 + 逐条选择器对账守卫、补真实祖先、`data-orb-box` 从 DOM 读、数字通配 + `texts` 列、量前冻结动画、选择器取不到时**当场抛错**(以前是静默 404 → 滤网空掉 → 属性差从 207 掉到 153,**看起来像修好了**)。

**当前读数(可信):属性差 207 / 位置差 678 / 裸差 161,90 格全部出实体。**

⚠️ **剩下 5 条(A8/A9/A10/A11/A13)没查证**,不要当成已确认的差异派单。

## 交接注意

- **打包命令**:`pnpm tools-pack mac build --to dmg --app-version 0.21.1-beta.N`(频道由版本号决定,beta 会出 `Open Design Beta.app`,不和正式版打架)
- **曾经的失败点**:`~/Library/Caches/electron-builder/dmg-builder@1.2.0` 缓存目录损坏导致最后一步 ENOENT,删掉重跑即可
- **快照为什么在开发环境永远看不到**:抓首屏截图的是 Electron 桌面进程,`tools-dev run web` 不起它,`/tmp/open-design/ipc/<ns>/desktop.sock` 不存在 → 每张 HTML 卡都掉进 live iframe 降级
- **快照那两张表在所有已发布客户端里都不存在**——是未发布的分支功能。今天线上所有历史会话 100% 走 live iframe,且补不上
