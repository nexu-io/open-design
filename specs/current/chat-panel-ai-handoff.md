# 接手文档 · ChatPanel 这一轮

**写给下一个接手的人(很可能是另一个 AI)。** 读完这份就能接着干,不用回溯对话。

2026-08-28 写。

**这份和隔壁两份的分工**:
- `chat-panel-next.md` = 权威规格(要改什么)
- `chat-panel-handoff.md` = 提测前清单(OPEND-2205,证据留档,**别覆盖它**)
- **这份** = 交接(现在在哪、还剩什么、有哪些坑)

---

## 0. 一句话现状

聊天面板按设计稿做了 1:1 还原 + 一批真机暴露的缺陷修复,**已开 PR #7518**(`feat/chat-panel-next-impl` → `main`)。
**代码全部已提交并推送,不会丢。**

⚠️ **PR 的 CI 有 5 个红**(2026-08-28 09:30 时点),我没查完就被叫停了,**下一个人要先看这个**:

| 红的检查 | 我知道的 |
|---|---|
| `Preflight` | 未查。**先查这个** —— 它红了通常后面全连坐 |
| `Daemon tests (2/4)` | 疑似是那条 critique 测试。**修已合入且本地单跑绿**,这一轮 CI 是在合入前跑的 —— 重跑一次再判 |
| `UI P0 (workspace-restoration)` | 未查。和本分支改动无明显交集,先确认 base 上是不是也红 |
| `Playwright visual (settings-workspace)` | 同上,疑似视觉基线漂移 |
| `nix flake check` | **大概率与本分支无关** —— 它不在合并门内(见根 `AGENTS.md`),且本分支没动 lock |

**判 CI 红的规矩(踩过)**:OD 的「检查全绿」不可信,必须点名核心 job;而且要 **base 绿 → PR 红** 才算本分支阻塞。
先跑 `gh run view --job <id> --log-failed`,再和 `main` 的同名 job 对照。

### ⚠️ 两条结构性约束(我都是撞上去才知道的)

**一、`needs-validation` 标签在 PR 上,不能合、不能入队。** 它是人工 QA 门,由 Looper 外部 bot 加,
**摘掉会被自动加回来** —— 正规开关是 `skip-validation`。当前 `mergeState: BLOCKED` 有它一份。

**二、beta 打包的 `publish=true` 只允许在 main 的当前提交上跑。** 功能分支上必然失败:

```
Shared beta publication is restricted to the current main commit
(35edb37d…); got 50c3153b…. Re-run this ref with publish=false for
dogfood artifacts.
```

所以**这个分支能出的只有 `publish=false` 的自用包**(不进 R2、不推给 beta 用户)。
运行中:run `33132966714`。要真正发布给 beta 用户,只能等合进 main 之后从 main 触发。

---

## 1. 交付物在哪

| 东西 | 位置 |
|---|---|
| 主分支 | `feat/chat-panel-next-impl`(已推 origin) |
| PR | nexu-io/open-design#7518 |
| 工作树 | `/Users/elian/Documents/od-wt-chat-panel` |
| 裁决与理由 | `chat-panel-feedback.md` §F-11 … §F-20 |
| 提测清单 + 证据 | `chat-panel-handoff.md` |
| 设计稿(**已移出仓库**) | `/Users/elian/Documents/od-design-artifacts/chat-panel-next.html` |
| 性能报告 | 分支 `research/chat-perf-audit` 的 `perf-audit/` |
| critique 测试修复 | 分支 `fix/critique-label-test`,已合进 PR 分支 |

⚠️ **设计稿不在仓库里。** 原本是未跟踪文件,2026-08-28 移到 `od-design-artifacts/`。
历史版本:`git show 1bbdce0b06:docs/design/chat-panel-next.html`,md5 应为 `28ea4c6558d6158e88976e11283e269e`。
`docs/design/chat-mirror/` 下的**脚本和部分截图是已跟踪的**,不要连目录一起搬(我犯过,搬走了 17 个已跟踪文件)。

---

## 2. 这一轮做了什么

按用户可感知的顺序:

- **思考(thinking)从「壳的一种形态」改成「壳里的一个条目」** —— 不再顶掉进行中卡片;收起后是 brain 图标的工具行,可展开
- **逐字浮现**(设计稿 1627 行的 blur-in):正文和思考都有;后端一次性给的也在 ~2s 内铺完
- **claude 的思考文字**:1786 帧全空 → 有真文字。根因是 CLI 在无头 + stream-json 下**主动保留 `redact-thinking` 请求头**,加 `--thinking-display summarized` 去掉它(该 flag **不出现在 `--help` 里**,所以代码里带了垃圾值探针做门控)
- **codex 的推理**:codex 自带 `default_reasoning_summary: "none"`,加 `-c model_reasoning_summary="detailed"` 才有。**只有每块一行摘要标题**,全文拿不到(见 §5)
- **耗时**:壳头补上思考时间(真机见过 1.4s → 5m54s);思考格挂自己的数;修了两个会算大的 bug
- **列位与竖线**:顶层 26 / 抽屉 48 两套列;竖线穿过 Thoughts
- **轮次间距**:24(换人说话)/ 12(同一人续写),来自设计稿源件 `scene-shell.css`
- **图标描边**:0.583px → 1.021px,端头拐角 butt/miter → round
- **发布菜单**:修了越界、上下振荡、自己弹出、工具栏按钮失效四个问题
- **滚动**:往上滑不再被拽回底部
- **重连**:「正在重新连接 N/5」→〔重新连接〕整条链路第一次真正能触发
- **报错卡**:AMR 上原本永远不出的 8 张卡现在会出;删掉「错误详情」折叠(19 个语言包同步)
- **幽灵 run**:失败的轮次不再显示成「进行中」
- **删除**:流式光标(两枚)、AMR 的 `model` 标识
- **合并 main**:落后 122 提交 → 归零

---

## 3. ⚠️ 等用户拍板的事(不要自己决定)

| # | 事 | 现状 | 备选 |
|---|---|---|---|
| 1 | **输入框的独立逃生口** | 只要 run 状态被写坏,用户就没有停止按钮 | 建议:发送被「未接管的活跃 run」挡住时,把停止控件亮出来。**这是产品改动** |
| 2 | **daemon 连不上时冻住其它壳** | 现状 A(不管,会自愈) | B:把「连不上」提升成页面级事实,冻住其它壳但**不写终态**。C(已否决):本地标失败会写假数据回服务端 |
| 3 | **96px 展开限高** | 已按设计稿实现 | 用户还没亲眼确认够不够读 |
| 4 | **思考中的跑马灯滚动** | 还在 | 逐字浮现做出来后可能多余。设计稿自己的注释说它「是演示」 |
| 5 | **codex 换 app-server 传输** | 代码已合,`OD_CODEX_TRANSPORT` 默认关 | 开了能拿到约 2 倍的推理节拍密度。见 §5 |
| 6 | **「投稿社区」失去唯一落点** | T12 把三级菜单换成 agent 产出的三行引导后,`default` 这一路够不着它了 | 代码没删、别的变体仍渲染。**去哪要产品定** |

**已经拍过、不要回头动的**:
- 分叉会话的旧数据不追溯(§F-19 选 A)。**不要放宽 `legacyTurnFailed`** —— 2026-08-27 明确否决过
- T11 收成陈述 / T19 回合状态行只在最后一轮出 / T12 引导行改 agent 产出

---

## 4. 已知问题(查清了,没修)

按严重度:

1. **5.88 MB 的消息存不回去,静默丢数据(必现)**
   `PUT .../messages/:mid` 返 413(daemon `express.json({limit:'4mb'})`),而 `saveMessage` 的 `catch {}` 吞掉错误,界面无感知。
   同源:daemon 的 `compactAdjacentMessageAgentEvents` **不做相邻等值去重**,而隔壁 `mergeMessageAgentEvents` **有** —— 所以 9,267 个逐字节相同的 `TodoWrite` 全存下来了。
   **这是正确性问题不是性能问题,建议优先开工单。**

2. **codex 的第三方 MCP 完全不可用**
   `codex exec` 审批策略默认 `never`,每次 MCP 调用被自己拒。`--approve-for-me` 能修但**和 `--sandbox` 互斥** —— 要放弃 workspace-write 沙箱,**是安全语义改变,需要维护者决定**。

3. **AMR 的 `session/new` 超时线画在中位数上**
   vela 侧 `defaultOpenCodeSessionSetupTimeout = 30s`,实测中位数 **26.7s**、p100 32s,**没有任何 override 路径**(env/flag/config 都没有),我们这边绕不过去。
   已给同事的完整报告:两条路径是「改一行常量提到 60–90s」vs「预热/池化会话(冷启 35s → 10s)」。

4. **`daemonLive` 是一次性开机探测,从不重新求值**
   「daemon 连不上」只在每个 run 各自的 SSE 梯子里发现,从未提升成页面级事实。这是 §3 第 2 条的根因。

5. **`<od-focus>` 的声明制没真正生效**
   规格说「不声明就不出卡」,实测**没发标记也照样出卡**(兜底还在兜)。行为更宽松更安全,不是回归,但规格和实现对不上。

6. **`Maximum update depth` 可能还没全修**
   修掉的两条有量化证据(379 次/秒 → 收敛)。但 React 18 的计数器是**每个 root 一个全局值、在下一次 setState 时才报**,所以报错栈里可能只是「目击者」不是「肇事者」。最值得接着查的是 `useTeamMembers.ts:117` 的 `useSyncExternalStore`。

7. **`.design-card-thumb .thumb-iframe`(Designs 抽屉)还是老写法**
   `width:250%; scale(0.4)`,和产物卡缩略图同一个 bug。根因:`transform: scale()` 的基准必须是绝对值,`width:250%` 会让基准跟着卡片走,永远到不了桌面宽。一行的事,但需要自己的视觉验证。

8. **提测清单里 21 条待裁决(T11–T32)**
   18 条不挡接入,但**挡对应组件的完成度** —— 组件 16 / 24 / 6 / 18 / 19 都停在「产品没定」,不是没做。详见 `chat-panel-handoff.md` 三节。

9. **一个与本改版无关的现网 bug**:上传期间发送键可点、文件不跟着发。已加断言钉住现状,按规矩要另起红测 + 独立 PR。

---

## 5. codex 推理的真相(别再重复调研)

源码 + 实测查透了,**结论是「拿不到全文」**:

- 全文**确实存在**,每轮随响应回来,但在 `encrypted_content` 里 —— Fernet token,熵 7.906/8,**密钥在 OpenAI 手里**
- 8 个推理块 = 22,956 字符密文 ≈ 17.2 KB,对得上 3981 个推理 token
- `summary` 里只有每块一行标题;**压缩到 4.3%**
- `model_reasoning_summary` 只有 `auto`/`concise`/`detailed`/`none` 四个值,**`detailed` 就是最详细的**
- `show_raw_agent_reasoning` 是**显示**开关不是**请求**开关,开了 `content` 依然是 `[]`
- `item/reasoning/textDelta` 是真的、接线了的,但只在上游发 `response.reasoning_text.delta` 时才有,**客户端没有任何参数能索要**

**唯一有实测收益的动作**:开 `OD_CODEX_TRANSPORT=app-server`,同一道题 exec 给 8 次批量、app-server 给 15 次逐条 —— 内容一样多,但**一条条落下来而不是一坨一坨**。

**兼容缺口已补**:app-server 解析器现在同时接 `summaryTextDelta`、`textDelta` 和完成态 `item.content`;本地 OSS 模型把推理放在 `content` 时也会正常显示。summary 与 raw content 使用独立去重键,两者同时存在时不会互相截断。

---

## 6. ⚠️ 这个仓库的坑(我在这些上面栽过)

### 构建产物陈旧 —— 这一轮栽了四次

`packages/*/dist` 是 gitignore 的,而且**没有 prepare/postinstall 钩子**。所以:

> **合并带进 `packages/` 下任何包的源码改动,就必须重建那个包的 dist。**

```bash
pnpm --filter @open-design/contracts build       # 栽了 3 次
pnpm --filter @open-design/plugin-runtime build  # 栽了 1 次
```

症状伪装得很像别的问题:「类型不存在」、「不是函数」、看起来像合并没解干净。

### 根 typecheck 绿 ≠ daemon 能构建

daemon 的 build 用更严的 tsconfig(带 `noUncheckedIndexedAccess`)。动了 daemon 要单独跑,**并且显式确认 exit code** —— 它有时什么都不打印:

```bash
pnpm --filter @open-design/daemon build; echo "EXIT=$?"
```

(我写过一句无条件的 `echo "typecheck 空=通过"`,把一个 exit=2 的真失败盖过去了。)

### macOS 没有 `timeout`

用了会**静默 127、整条命令零输出**,看起来像「跑完没失败」。我因此跑空过两次基线。用 `gtimeout` 或 `command -v`。

### 测量类的坑

- **后台标签页会把 `setInterval` 节流到约每分钟一次。** 我因此两次得出「重连行不触发」的错误结论。记录 DOM 变化用 `MutationObserver`;强制可见用 CDP `Emulation.setFocusEmulationEnabled`
- **量之前先确认量的是哪个实例。** 本机同时跑着好几个 runtime,浏览器标签页会漂到别人的端口上。我因此两次报了不存在的回归。**每次测量都把 `location.host` 和 `document.styleSheets[].href` 的 host 一起打出来**
- **`ps | grep` 会自匹配** —— 命令行里带着搜索词,grep 匹配到自己
- **量图标先分 fill / stroke 两类。** 拿 `strokeLinecap` 当筛子会把 20 个实心 brain 图标(`stroke: none`)网进来,我差点报一个不存在的回归
- **CSS 层叠平局由 `index.css` 的 import 顺序决定。** 字节相同的声明、相同特异性时,**只 diff CSS 文本看不出胜负**,必须量 computed style。这一轮踩了约 5 次
- **`svg` 的呈现属性排在任何作者 CSS 之下** —— 加一条全局 `svg { stroke-width }` 会静默盖掉 115 处硬编码的 `strokeWidth`

### 测试类的坑

- **`getByText` 匹配整段文字会失败** —— 逐字浮现把文字按字拆成 `<span>`。用 `textContent`。修过四次
- **造夹具前先看真实那条记录长什么样。** 用产品产不出的形状,红测漂亮转绿、真机一个字不变
- **红测要能捕捉「循环/振荡」本身**,不能只断言单帧的值 —— 振荡的每一帧都可能是「对的」
- **加可选参数会让 `not.toHaveBeenCalledWith` 永真** —— 修的时候用显式 `null`
- **`beforeAll` 的默认 10s 超时会掩盖真断言**:daemon 冷启超过 10s,于是同一个文件「全量跑过、单跑超时」。给它显式 60s

### git 操作

- **`git checkout <ref> -- <路径>` 会连带暂存** —— 后续 commit 会一起提交,而 `git diff` 看不见(要查 `--cached`)。恢复文件用 `git show <ref>:<文件> > <文件>`
- **`git stash` 栈是仓库级共享的** —— 会弹到别人的 worktree 里
- **删 worktree 前先查 `node_modules` 是不是软链** —— 有的 worktree 软链到主工作树,处理不当会把主仓依赖一起删掉
- **写文档前先 `git log -- <文件>`** —— 我今天差点用新版覆盖掉一份有证据的提测清单(104 行),幸好 diff 看了一眼

---

## 7. 派 subagent 的约定(实践证明有效)

这一轮派了约 25 个 agent,以下约定显著提高了产出质量:

**必须写进每个 brief 的:**

- 独立 worktree,**禁止 `git stash` / `git add -A` / `git checkout <ref> -- <路径>`**
- **禁止宽泛的 `pkill`** —— 有 agent 跑了 `pkill -f "od-stamp-app=web"`,把用户的 runtime 杀了
- 用户的 runtime 端口(当前 17573/17456)**不许碰**;自己起实例要换端口 + 独立 `OD_DATA_DIR`,**用完按 pid 停掉,包括 `tools-dev run` 那个启动器外壳**(`tools-dev stop` 不回收它)
- 临时文件用**唯一前缀**放工作树之外 —— 两个 agent 撞过 `pr-body.md`,互相覆盖了 PR 描述
- **红测先行 → 撤掉实现验红 → 逐机制消融**(单独撤一个,恰好只红对应那条)
- **反向对照**:每条否定断言都要配正向控制,否则「什么都不渲染」也能绿
- **交付时老实列没验证的部分**
- 涉及 vela/AMR 的,把仓库路径给它:`/Users/elian/Documents/nexu/vela`

**效果最好的两条:**

1. **「不要为了迎合我的判读而给结论」** —— 多个 agent 因此推翻了我,包括:重连不是我改坏的、渲染循环不是我引入的、耗时那条「根本不是 bug」
2. **「撤掉仍绿的实现直接删」** —— 但有个 agent 做得比这条更对:它撤掉旧守卫后**一条都没红**,却没删,而是先构造出「这条守卫唯一还看得见的场景」、证明它承重、补成测试再消融。**「测试没覆盖」和「代码没用」是两回事**

**盯 agent 的坑**:「等待中」≠ 活着。这一轮有看护 agent 静默死亡压了一小时;也有 agent 卡在 `tail -f` 上空等一个永远不会出现的汇总行。**盯实况(进程 / 日志 mtime),别盯状态字段。**

---

## 8. 环境

| 项 | 值 |
|---|---|
| 用户 runtime | web `127.0.0.1:17573` / daemon `127.0.0.1:17456`,namespace `default` |
| 工作树 | `/Users/elian/Documents/od-wt-chat-panel` |
| AMR 档位 | `OPEN_DESIGN_AMR_PROFILE=test` → `vela.powerformer.net`(**不是生产**) |
| 启动命令 | `OPEN_DESIGN_AMR_PROFILE=test pnpm tools-dev run web --daemon-port 17456 --web-port 17573` |
| vela 仓库 | `/Users/elian/Documents/nexu/vela` |
| 回放 mock | `export PATH="$PWD/mocks/bin:$PATH" OD_MOCKS_TRACE=98d2b062 OD_MOCKS_NO_DELAY=1` |
| E2E 浏览器 | 用 open-browser-use 接管用户自己的 Chrome。**本机绝不装 playwright 浏览器**(534MB,曾把磁盘写穿到 0 字节) |

**隔离 runtime 的已知卡点**:没有 workspace 身份时 `GET /api/projects` 返回 `[]`,首页列不出项目 —— 要**在浏览器里登录**再建项目,不要走脚本那条路。

---

## 9. 下一步建议顺序

0. **拿 `publish=false` 那个包给用户**(run `33132966714`)—— 我承诺过发链接但没兑现:`publish=true` 那次因上面第二条约束失败了
1. **查 PR #7518 那 5 个红**,从 `Preflight` 开始;每条都和 `main` 的同名 job 对照,分清「本分支引入」还是「base 就红」
2. ~~验证 critique 测试~~ **已做**:`tests/chat-project-skill-critique-label.test.ts` 在 PR 分支上单跑绿(1/1,4.6s)
3. **拿 §3 那六条去问用户**,不要自己决定
4. **§4 第 1 条(静默丢数据)开工单** —— 正确性问题,优先级高于剩下的
5. §4 其余按序号排

**不要做的**:
- 不要在没有用户裁决的情况下动 §3 里的任何一条
- 不要去优化性能报告里明确列为「排除项」的地方 —— `previousTodosByAssistantMessageId` 全量遍历 p95 只有 0.151ms、`dedupeToolUsesById` p50 0.005ms、daemon 读取不是首开慢的原因。**那些量过,不慢**
- 不要动 `CHAT_MESSAGE_VIRTUALIZE_THRESHOLD = 80` —— 真实会话消息数 p50=4、max=41,**这条虚拟化在现实中从没触发过**。真正的规模轴是**单条消息的事件数**,不是消息条数
