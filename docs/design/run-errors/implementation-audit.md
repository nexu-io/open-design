# 报错体验设计方案 · 实现现状对照表(origin/main @ 9881cff70e,2026-08-27)

> 只读审计。基线是 `origin/main`,不是任何特性分支。每一条判断都带 `文件:行号`;找不到的写「未找到」,不推测。
> 设计方案:`docs/design/run-errors/error-ux-design.md`(该文件只存在于 `feat/chat-panel-next-impl`,main 上没有)。
> 优先级取自设计方案文末《附:线上频次与优先级》(2026-08-24 拉的数)。

## 0. 三条横切结论(先看这个,它影响半张表)

**A. 报错卡的「正文」在 main 上默认是看不见的。**
`ChatPane.tsx:2831-2865` 把说明文字塞进 `UserActionCard` 的 `details`,而 `details` 默认折叠
(`ChatPane.tsx:1611` `useState(false)`;`UserActionCard.tsx:109-119`;`chat.css:962-964` 的注释自陈
「Only the concrete problem and primary recovery action stay visible」)。
所以设计原则五「标题一句话说发生了什么,正文一两句说为什么和怎么办」——**正文那一半今天要点开「查看错误详情」才有**。
凡是本表判「形态 ✓」的行,都要按这个折扣理解。

**B. 发送前只有两道闸,不是设计说的五道。**
全仓 `trackRunStartBlockedSurfaceView` 只有两个调用点:
- BYOK preflight — `ProjectView.tsx:6857`
- AMR 余额门 — `ProjectView.tsx:6995`
「没装 / 没登录 / 并发满」三类**根本没有发送前判定**。而且首页发送路径(`EntryShell.tsx:1334-1417`)连 BYOK preflight 都没有,只有余额门。

**C. 「更换模型」这个按钮全仓不存在。**
`RunFailurePrimaryAction` 的全部取值在 `amr-guidance.ts:163-173`:
`retry | authorize | recharge | upgrade | launch-terminal-auth | launch-terminal-switch-model | none`。
没有 switch-model、没有 open-settings。设计里 S08 / S09 / S10 / S12 / S13 / S21 六个场景都要这颗按钮,一颗都没有。
(`switch_model_retry` 只是 `ProjectView.tsx:6837` 的一个埋点标签,不是按钮。)

---

## 1. 对照表

### P0

| 场景 | 设计要什么(位置 / 形态 / 点了之后) | 判档 | 证据 | 缺什么 |
|---|---|---|---|---|
| **S08 供应商额度用完**<br>23,333/月 · 9,220 设备 · ↑55% | 对话里卡片;「{供应商}额度用完了,重试不会恢复」;〔更换模型 \| 去设置〕+ 非 Cloud 多一张〔切到 Open Design 智能体〕 | **部分实现** | 映射 `apps/web/src/runtime/amr-guidance.ts:411-414`(`hard_quota` → `switchToAlternative`,`primaryAction:'none'` 刻意不给重试);中文文案 `apps/web/src/i18n/locales/zh-CN.ts:148,155`;切换卡 `apps/web/src/components/AmrGuidance.tsx:70-112`,CTA 文案 `zh-CN.ts:71`「切换到 OpenDesign Cloud 并重试」;AMR 自己不会误出切换卡(`amr-guidance.ts:554-593` 先于 `DETAIL_FAILURE_UI:627` 返回) | 〔更换模型〕〔去设置〕两颗 CTA 全无(见横切 C);正文折叠(横切 A) |
| **S25 预览白屏**<br>每周 1,000–3,400 人 · 唯一在涨 | 预览区内(不进对话);先自动重载一次;15 秒仍不行才显示「预览加载失败」〔重新加载 \| 在浏览器打开〕 | **未实现** | 白屏探针只上报埋点:`apps/web/src/components/FileViewer.tsx:10534-10540` → `apps/web/src/observability/iframe-error.ts:191-204`,handler 里没有任何 setState/渲染;静默一次性重挂 `FileViewer.tsx:11068-11127`(`setSrcDocTransportResetKey` @ `:11122`),触发阈值是 1.5s 传输握手超时(`FileViewer.tsx:640`)而不是 15s 白屏;预览区唯一的可见错误页是「重定向死循环」占位,硬编码英文且无按钮 `apps/web/src/runtime/srcdoc.ts:154-179` | 全部三件都缺:无可见 UI、无 i18n 文案、无 CTA |
| **S19 进程崩了 / 异常退出**<br>20,868/月 · 3,869 设备 | 对话里;「{智能体} 意外退出了 —— 它没说为什么」;〔重试 \| 导出日志〕 | **部分实现** | `AGENT_EXECUTION_FAILED` / `process_exit` 系列在 web 侧**没有任何映射**(`amr-guidance.ts:335-384` 与 `:408-478` 两张表都没有),落到兜底 `amr-guidance.ts:679-685`:标题「任务执行失败」+ 原始 stderr + 重试;卡上有「复制诊断信息」按钮 `ChatPane.tsx:2849-2861` | 缺专属文案;〔导出日志〕不在卡上 —— **但这个动作是存在的**:`apps/web/src/components/ExportDiagnosticsButton.tsx:83`,daemon 端点 `apps/daemon/src/server.ts:668-669`,今天挂在 Settings→About(`SettingsDialog.tsx:6189`),而且 renderer 崩溃页已经用上了(`apps/desktop/src/main/runtime.ts:1341-1345`)。是**接线活,不是从零做** |
| **S15 Cloud 余额用完**<br>8,680/月 · 3,855 设备 | 个人保持「去充值+重试」;团队成员「团队额度用完了,需要管理员充值」〔通知管理员 \| 先不了〕 | **部分实现** | 个人路径成立:`amr-guidance.ts:568-575`(`AMR_INSUFFICIENT_BALANCE` → recharge + secondaryRetry),按钮 `ChatPane.tsx:2944-2989`。**但充值链接是账号级的**:`ChatPane.tsx:2969` → `amrRechargeUrlForProfile` → `amr-guidance.ts:21-24` = `/amr/dashboard?source=open_design`,不带 workspaceId、不带 billing 参数;带 workspace 的 `amrConsoleUrlForWorkspace`(`amr-guidance.ts:100-105`)**全仓无调用方**;`canManageBilling` 在 ChatPane 零使用;`billing=plan` 只出现在 `GoPlanSunsetDialog.tsx:15`,与报错卡无关 | 团队分支整个没有:无角色判断、无团队文案、无〔通知管理员〕(相关 i18n 键 `entry.creditsMemberNotice*` 是死键,只在 `i18n/types.ts:1213-1215` 和各 locale 里,无代码读取)。**设计要修的那个问题(团队成员被带到个人充值页)在 main 上没修** |

### P1

| 场景 | 设计要什么 | 判档 | 证据 | 缺什么 |
|---|---|---|---|---|
| **S12 等太久没动静**<br>18,891/月 · 6,372 设备 | 60 秒起「上游响应慢,已等 N 秒」〔停止〕;10 分钟超时后卡片〔继续运行 \| 更换模型〕 | **部分实现** | 超时卡有且中文:`amr-guidance.ts:437-446`(`timeout` / `inactivity_timeout`),文案 `zh-CN.ts:157-158`;〔继续运行〕仅覆盖 `inactivity_timeout`(`apps/daemon/src/run-failure-classification.ts:665-670`),按钮 `ChatPane.tsx:3014-3033`;有一个通用 elapsed 计时 `AssistantMessage.tsx:3801,3841` | **等待提示未实现** —— `assistant.waitingFirstOutput` / `assistant.slowHint` 是死键(`i18n/types.ts:4431,4438` + 19 个 locale,零代码读取);硬 `timeout` 没有继续运行;无〔更换模型〕 |
| **S02 本地 agent 没登录**<br>14,519/月 · 5,395 设备 | 发送前探测到没登录就拦;文案给出 {登录命令};〔在终端登录 \| 重试〕 | **形态不同** | 发送路径无任何登录探测(`ProjectView.tsx:6820-7038`);`testAgent` 只在 onboarding(`EntryShell.tsx:209`)和 Settings(`SettingsDialog.tsx:133`)。跑失败后才出卡:`amr-guidance.ts:647-655`,中文 `zh-CN.ts:125`;〔在终端登录〕**只有 Antigravity 有** `amr-guidance.ts:600-609` → `ChatPane.tsx:2920-2930` | 设计要「发送前拦住」,代码是「发出去之后报错」——这是最典型的形态不同;文案不给登录命令;推荐 OD 智能体那行不区分 Cloud 用户(`amr-guidance.ts:653` 只看 errorCode) |
| **S10 服务商报错 / 过载**<br>11,200/月 · 2,056 设备 | 自动重试 2 次(1s、3s),期间显示「正在重试 1/2」;失败后〔重试 \| 更换模型〕 | **部分实现** | 卡有且中文 `amr-guidance.ts:669-677` + `zh-CN.ts:144`;自动重试存在 `apps/daemon/src/run-retry-policy.ts:222`(`decideSafeRunRetry`) | 上限是 **1 次**不是 2 次(`run-retry-policy.ts:14` `DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS = 1`);「正在重试 N/2」零 UI(web 无任何重试态渲染;`'retrying'` 状态帧只有 pi agent 发 `apps/daemon/src/agent-protocol/pi-rpc/events.ts:184`,web 无消费者);无〔更换模型〕 |
| **S11 跑到一半网络断了**<br>6,994/月 · 2,501 设备 | 任意 agent 都给「连接断了…已做完的部分都保留着」〔继续运行〕 | **部分实现** | web 侧卡片是 agent 无关的:`amr-guidance.ts:633-641`(`AGENT_CONNECTION_DROPPED` → `chat.connectionDropped`);〔继续运行〕覆盖 `stream_disconnected` 等(`run-failure-classification.ts:648-664`) | **`AGENT_CONNECTION_DROPPED` 只有 claude 会产生**:`apps/daemon/src/claude-diagnostics.ts:81` `if (input.agentId !== 'claude') return null;`。其它 agent 的断流走 `UPSTREAM_UNAVAILABLE` 通用卡。「只有 claude 有专门的卡」在 main 上仍然成立 |
| **S09 被限速**<br>3,501/月 · 1,277 设备 · ↑25% | 〔稍后重试 0:42(倒计时,到点自动重试)\| 更换模型〕;「这次不扣费」 | **部分实现** | 通用限速卡 `amr-guidance.ts:660-668` + `zh-CN.ts:141`;滚动窗那张最好:`amr-guidance.ts:531-547` 读出重开时刻,`zh-CN.ts:143`「高峰期繁忙,请在 {retryAt} 后尝试(本次请求未扣费)」,时间本地化 `amr-guidance.ts:298-311` | 无倒计时组件(全仓 countdown 只有 DeepSeek 活动页);`retry-after` 三条路径都不读;不会到点自动重试;无〔更换模型〕 |
| **S06 余额不够 / 为 0**<br>飞书 20 条 + 26 条支付争议 | 居中弹窗;个人〔去充值 \| 升级套餐 \| 先不了〕;团队成员〔通知管理员 \| 先不了〕;付费个人 0 余额不拦;刚买没到账显示「套餐开通中」不拦 | **部分实现(且有真 bug)** | 弹窗在且是居中 modal:`apps/web/src/components/AmrBalanceDialog.tsx:167-175,260-261`;门 `apps/web/src/runtime/amr-balance-gate.ts:286-345`;付费 0 余额放行 `amr-balance-gate.ts:266-272` | 弹窗里只有〔暂不需要 \| 升级套餐〕(`AmrBalanceDialog.tsx:223-251`),**没有〔去充值〕**;团队分支/〔通知管理员〕完全没有;付费 0 余额放行**只对 personal**,`workspaceType==='team'` 的付费成员仍被硬拦(`amr-balance-gate.ts:266`);「套餐开通中」未找到。**Bug:团队普通成员拿到的是无任何前进按钮的死胡同弹窗**,见 §4 |
| **S04 OD 智能体没登录 / 授权过期**<br>随 S02 | 对话里〔授权并重试〕,登录完自动接着跑 | **已实现** | `amr-guidance.ts:554-566`;`AmrLoginPill` 渲染 `ChatPane.tsx:2879-2914`;续跑状态机 `apps/web/src/runtime/amr-auth-retry-continuation.ts`;CTA 中文 `zh-CN.ts:76`「授权并重试」——与设计逐字一致 | — |
| **S27 客户端起不来**<br>每天 100–190 台 | splash 上的弹窗:「Open Design 没能正常启动…」〔重新启动 \| 导出日志 \| 重新安装〕 | **未实现** | splash 只有 video + 进度 + 阶段文案,没有 error 分支:`apps/desktop/src/main/runtime.ts:934,1013-1023,1372-1406`(阶段枚举里没有 failed);启动失败直接 `process.exit(1)`:`apps/packaged/src/index.ts:360-390`;唯一的启动 dialog 是 `apps/packaged/src/index.ts:365`,只在 `PackagedPathAccessError` 时弹(三个触发点:`apps/packaged/src/paths.ts:65,79` 和 `apps/packaged/src/launch.ts:86`),硬编码英文、只有一个 OK;其余失败分类已经算好了但只进遥测:`apps/packaged/src/startup-telemetry.ts:96-102`(`daemon-start`/`web-start`/`status-timeout`/`spawn-failed`) | 全部三件都缺。**旁证**:带 CTA 的崩溃页已经存在,但那是 renderer 崩溃循环、不是启动失败:`apps/desktop/src/main/runtime.ts:1195,1302-1312`(〔Report a problem〕〔Save logs…〕),可以照抄 |

### P2

| 场景 | 设计要什么 | 判档 | 证据 | 缺什么 |
|---|---|---|---|---|
| **S20 输入太长**<br>3,735/月 | 〔新建对话继续(带上当前文件) \| 移除附件〕 | **部分实现** | 卡有且 agent 无关:`amr-guidance.ts:348-351` + `zh-CN.ts:139`;`AGENT_PROMPT_TOO_LARGE` 由 argv 预算(`apps/daemon/src/runtimes/prompt-budget.ts:54,168,242`)和 claude(`runtimes/claude-stream.ts:561`)产生 | 两颗 CTA 都没有,只有〔重试〕;上游 400 上下文超长走文本判成 `prompt_too_large` detail,而 web 的 detail 表里**没有这一项**(`amr-guidance.ts:408-478`)→ 落兜底「任务执行失败」 |
| **S01 本地 agent 没安装**<br>2,357/月 | 选择器里标「未安装」+ 输入框上方一条;〔查看安装指引 \| 重新检测〕 | **形态不同** | 线上的选择器 `InlineModelSwitcher.tsx:694-699` 直接 `filter(a => a.available)`,**未安装的 agent 压根不出现**,谈不上标记;跑失败后才出卡 `amr-guidance.ts:343-346` + `zh-CN.ts:131,138`;安装指引和重新检测只在 Settings(`SettingsDialog.tsx:5222-5250`) | 发送前不拦;两颗 CTA 都不在卡上。**陷阱**:`agentPicker.notInstalled`(zh「未安装」)看着像实现了,但唯一读它的 `AgentPicker.tsx:59-62` 整个组件**没有任何 import**,是死代码 |
| **S21 模型输出不正常**<br>1,767/月 | 合成一张「{智能体} 这次没给出结果」〔重试 \| 更换模型〕 | **部分实现** | 仍是三张卡:`empty_output`(`amr-guidance.ts:449-452`)、`ROLE_MARKER_HALLUCINATION`(`:365-368`)、`TOOL_LOOP_DETECTED`(`:359-362`),都有中文(`zh-CN.ts:135-136,150,159`) | 没合并;三张都只有〔重试〕,无〔更换模型〕 |
| **S13 模型不存在 / 不支持**<br>1,514/月 · ↑7% | 〔更换模型 \| 去设置〕 | **部分实现** | `AMR_MODEL_UNAVAILABLE` → 卡 + 中文 `amr-guidance.ts:353-356` + `zh-CN.ts:140`(文案里写了「请在设置中切换」) | 两颗 CTA 都没有,只有〔重试〕;daemon 侧 `model_not_found`/`model_not_supported`/`cli_version_incompatible`(`run-failure-classification.ts:364-386`)在 web 的 detail 表里都没有条目 → 非 AMR agent 走兜底 |
| **S17 Cloud 授权失效 / 被移出团队 / 客户端太旧**<br>1,065/月 | 按 401/403/426 分三种卡:〔授权并重试〕/〔切换工作区 \| 联系管理员〕/〔去更新〕 | **部分实现** | AMR 账号错误只有三种码:`apps/daemon/src/integrations/vela-errors.ts:1-4`(`AMR_AUTH_REQUIRED` / `AMR_INSUFFICIENT_BALANCE` / `AMR_TIER_UPGRADE_REQUIRED`);授权失效那支走 S04 的授权并重试 | 「被移出团队」「客户端太旧」两支**完全没有** —— 分类器里没有 403/426 概念。设计自己标了前提(Q-19:vela CLI 要把 code 透出来),这条在 OD 仓内判不到底,见 §5 |
| **S22 Open Design 自己的 bug**<br>893/月 | 「出了点问题,不是你的操作有误」〔重试 \| 导出日志〕 | **未实现** | 派发不存在的 agent 仍然报 `AGENT_UNAVAILABLE`:`apps/daemon/src/server.ts:10396-10399` `failRun('AGENT_UNAVAILABLE', \`unknown agent: ${agentId}\`)` → web 映射成「智能体未安装」(`amr-guidance.ts:343-346`)。**误导文案原封不动** | 无专属文案、无导出日志 |
| **S03 OD 账号登录过期**<br>飞书 17 条 | 顶部横幅,页面**不跳走**,〔登录〕原地弹 | **形态不同(方向相反)** | 401/403 判定 `apps/web/src/collab/useWorkspaceContext.ts:858,872-873`;消费端是**硬跳转**:`apps/web/src/App.tsx:1986` `navigate({kind:'home',view:'onboarding'}, {replace:true})`,以及 `apps/web/src/components/EntryShell.tsx:637` 同款;写路径直接抛硬编码英文 `apps/web/src/state/projects.ts:167` | 设计要「不跳走」,代码是 `replace:true` 强制跳走且退不回来 —— 这正是「本地项目消失」的出处 |
| **S05 BYOK 没配好** | 输入框上方一条,写清缺哪一项;〔去设置〕聚焦到那一项 | **部分实现** | preflight 在 `ProjectView.tsx:6829-6831`,原因分得很细 `apps/web/src/components/byok/preflight.ts:11-67`(`api_key_required`/`base_url_required`/`model_required`…) | 细分原因**只喂埋点**(`ProjectView.tsx:6851-6866`),UI 文案是一条硬编码英文常量 `ProjectView.tsx:766-767`;卡上无按钮(preflight 阻断时没有 `retryAssistant`,`ChatPane.tsx:1657-1670` 不渲染 footer);`onOpenSettings('execution')`(`ProjectView.tsx:6868`)只到 tab 级,全仓无字段级聚焦;首页发送路径没有这道 preflight |
| **S07 模型锁定 / 静默换模型 / 并发满** | 选择器锁定;运行时换了模型在对话里说一行;并发满发送前〔稍后重试(排队自动发) \| 升级套餐〕 | **部分实现** | 模型锁定**已实现**且三处一致:`apps/web/src/components/agentModelSelection.ts:81-94`、`apps/web/src/components/modelOptions.tsx:439-441`,文案 `settings.amrModelUpgradeHint` = zh「升级后使用」(`zh-CN.ts:4397`) | 静默换模型确实在发生(`agentModelSelection.ts:20-42` `normalizeAgentModelChoice` 回落 default),**六个调用点没有一处提示**;并发满无任何发送前判定(`API_ERROR_CODES` 里没有并发相关码);`QueuedSendStrip` 只挂在「本会话已有 run 在流」(`ProjectView.tsx:6884`),与并发上限无关 |
| **S14 内容被安全策略拒绝**<br>飞书 12 条 | 「内容没通过审核」〔编辑后重发〕 | **未实现** | 文本侧零识别:`run-failure-classification.ts` 全文无 content_filter / SAFETY / refusal;表现为「没有输出」。生图侧有结构化码 `apps/daemon/src/media/vela.ts:429`(`safety_rejection`),但它的「显示」是让模型自己复述一句 `apps/daemon/src/prompts/media-contract.ts:54`,不是 UI | 无卡、无〔编辑后重发〕 |
| **S16 套餐变了(降档 / 被移出团队)** | 顶部横幅说一次,可关 | **未实现** | 全仓无套餐变化侦测(无 previousPlan / planChanged 一类),无对应 i18n 键 | 全部 |
| **S18 账号被封** | 只给〔联系支持〕,**不给重试** | **未实现** | `account_suspended` 在 apps/web + apps/daemon 全无命中 → 落兜底「任务执行失败」**+ 重试**(`amr-guidance.ts:679-685`) | 全部;而且违反设计原则四(给了没用的重试) |
| **S26 导出 / 保存 / 评论失败**<br>飞书 7 条 | 右下角小提示,统一一套文案,〔重试〕,能判原因的写进去 | **形态不同** | 评论失败是**底部居中** toast(`apps/web/src/styles/viewer/routines.css:104-131`,渲染 `ProjectView.tsx:10281-10290`);导出失败是**顶部居中** toast(`FileViewer.tsx:4414-4432`);另有 4 处原生 `alert()`(`PreviewModal.tsx:884,888`、`SketchEditor.tsx:332`、`apps/web/src/runtime/exports.ts:1425,1429,1467` 后两处**硬编码英文**) | 位置没有一处在右下角;两套 key(`common.exportImageFailed` vs `fileViewer.exportImageFailed`);全部无〔重试〕—— 尽管 `Toast` 组件本身支持 `actionLabel`(`apps/web/src/components/Toast.tsx:22-24`);原因在 `apps/web/src/providers/registry.ts:2845` `if (!resp.ok) return null` 就把 401/403 丢了,写不进文案 |
| **S28 本地服务断开 / 版本不匹配** | 顶部横幅 +〔刷新〕;被打断的任务出卡〔继续运行 \| 重试〕 | **未实现 / 部分实现** | 无共享横幅组件;daemon 不可达散在 **9 处、8 种措辞**(`HomeView.tsx:3034`、`HomeView.tsx:1531`/`2073` 两处硬编码英文、`InlineModelSwitcher.tsx:1321` tooltip、`SettingsDialog.tsx:4438/4445/6079/8566`、`EntryShell.tsx:3809`、`FileViewer.tsx:17778`),外加完全静默的一路 `App.tsx:2014-2031`;`DAEMON_RESTARTED` 在 web 侧**零引用** → 兜底卡 + 原始英文,且 daemon 硬写 `resumable:false`(`apps/daemon/src/runtimes/runs.ts:744`)把〔继续运行〕关死;版本 skew / ChunkLoadError 全仓 0 命中 | 横幅、刷新、继续运行、版本 skew 全缺 |
| **S29 网络中断 / 正在重连** | 顶部横幅「正在重新连接 2/5」;5 次失败后「连接失败」〔重新连接〕 | **未实现** | 5 次预算是函数内局部变量:`apps/web/src/providers/daemon.ts:1365` `for (let reconnects = 0; endStatus === null && reconnects < 5;)`,无 callback、无 state;项目 SSE 的 `onConnectedChange` 唯一用途是调轮询频率(`ProjectView.tsx:4125,4921`);退避器有 attempt 计数但**全仓无读取方**(`apps/web/src/lib/backoff.ts:52,72`);`navigator.onLine` 全仓 0 命中 | 「2/5」这个数字在数据层就没有出口。唯一存在的重连 UI 是终端面板内的 `TerminalViewer.tsx:457-463`「Reconnecting…」,无计数无 CTA |
| **S30 公司网络 / 代理 / 证书**<br>飞书 6 条 | 「网络环境不对…{地区不支持 / 证书校验失败}」〔去设置 \| 重试〕 | **未实现** | 证书只在 BYOK「测试连接」里被半识别,且被压成「Base URL 无效」:`apps/daemon/src/connectionTest.ts:1137-1140`(只认 `CERT_HAS_EXPIRED` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`),自签名证书落 `settings.testUnknown`;run 失败分类器里 certificate / ENOTFOUND / ECONN / EPROTO **零命中**;地区不支持有正则但被折叠进 `upstream_client_error`(`run-failure-classification.ts:339,433`),而 web 的 detail 表里没有 `upstream_client_error` 也没有 `network_error` → 兜底 | 无分类、无文案、无〔去设置〕(动作枚举里根本没有 open-settings) |
| **S31 更新失败**<br>飞书 14 条 | 保持今天的弹窗,区分「你现在没网」和「下载失败,重试」 | **部分实现** | 弹窗在、文案全 i18n、按钮在:`apps/web/src/components/UpdateDialog.tsx:326-384` | main 侧其实分了 20+ 个 code(`apps/desktop/src/main/updater.ts:853` `metadata-unreachable`、`:229` `download-failed`、`:224/941/1154` `checksum-mismatch`…),但 `status.error.code` **只进埋点不进文案**(`UpdateDialog.tsx:123,206`);离线和下载失败都落到同一句 `updater.dialogCheckFailed`(「Couldn't check for updates」)—— 对下载失败这句话本身就是错的;主按钮只有〔再检查一次〕,没有〔重试下载〕 |
| **S32 Cloud 登录过程失败** | 按原因分四句;〔打开登录页 / 重新开始〕 | **部分实现** | 「浏览器没打开」这一支**完整实现**:`apps/web/src/components/AmrLoginPill.tsx:838-855`(文案 `settings.amrActivationBrowserFailed` / `settings.amrActivationHint` + 〔打开登录页〕`:845-853`),来源链路 `apps/daemon/src/integrations/vela.ts:971-982` → `apps/web/src/providers/daemon.ts:1036-1046` | 另外三句全无,统一 `'Sign-in failed.'`(`AmrLoginPill.tsx:161`);5 分钟超时常量已存在(`apps/web/src/components/amrLoginPolling.ts:4,32`)但和「网页上取消」合并进同一分支(`AmrLoginPill.tsx:422-446`);「凭据存不下来」代码里没有这个概念。**daemon 已经把 `errorKind` 送到 web 了**(`providers/daemon.ts:1021-1029`),但 `AmrLoginPill.tsx` 全文零消费,只喂 PostHog(`apps/web/src/analytics/amr-auth.ts:238,261`)—— 这是最低成本的改造入口 |

### 优先级判不了的两条(设计文里也说了埋点看不见)

| 场景 | 设计要什么 | 判档 | 证据 | 缺什么 |
|---|---|---|---|---|
| **S23 跑完了但没生成文件** | 「这次没有生成文件」〔让它继续 \| 重试〕 | **部分实现** | 卡在对话流末尾 `ChatPane.tsx:2831`;判定在客户端 `apps/web/src/runtime/design-delivery.ts:84-104` → `ProjectView.tsx:12590-12613`(`appendErrorStatusEvent(..., 'ARTIFACT_NOT_FOUND')`);标题真 i18n `zh-CN.ts:122`「未生成文件产物」 | 正文 `messageKey` 显式为 `null`(`amr-guidance.ts:338-341`)→ 显示硬编码英文 `ProjectView.tsx:12585-12586`;〔让它继续〕**永远不可达** —— 同一处硬写 `resumable:false`(`ProjectView.tsx:12606`),而 Continue 的门槛是 `canResumeFailedRun`(`ChatPane.tsx:1546`);daemon 侧另有一套 `deliverableValidation`(`apps/daemon/src/run-deliverable-validation.ts:158-192`)但 web 零消费 |
| **S24 做了一半** | (i) 回复末尾状态行「还有 {N} 项没完成」〔继续运行〕;(ii) 报错但文件已生成 → 算成功 + 一行「过程中报过错,文件已生成」 | **(i) 形态不同 / (ii) 未实现** | (i) 回复末尾那行只有文字无按钮:`AssistantMessage.tsx:1661-1700`,文案 `assistant.unfinishedLabel` = 「已停止,仍有未完成任务」(`zh-CN.ts:3704`),**没有 {N}**(带 {N} 的 `assistant.unfinishedSummary` 是死键,只在 `i18n/types.ts:4379`);按钮**存在但在别处** —— `PinnedTodoSlot` 在 composer 上方(`ChatPane.tsx:4068-4145` → `ToolCard.tsx:322-331`),文案「继续剩余任务」(`zh-CN.ts:3707`),落点是一条硬编码英文 prompt(`ProjectView.tsx:9005-9012`)。(ii) 后端确实算成功(`apps/daemon/src/runtimes/chat-run-lifecycle.ts:90-92`)并跳过整个 error 发送块(`apps/daemon/src/server.ts:15145`),**用户零提示** | (i) 位置错、无 {N}、CTA 文案不是「继续运行」;(ii) 全缺 |

---

## 2. 最值得先做的三条

按「今天用户拿到什么」× 频次排,不按判档难度排。

**第一:S25 预览白屏 —— 唯一「什么都没有」的 P0,而且还在涨。**
今天用户拿到的是:一片白 + 后台偷偷重挂一次(`FileViewer.tsx:11122`),没有任何字告诉他发生了什么。
另外两条 P0(S08、S19)至少还有一张卡、一句话、一个按钮;这条是零。
按人数是每周 1,000–3,400 人,是近一月唯一持续上涨的曲线(按周 1.7 万 → 9.3 万)。
而且门槛低:`iframe-error.ts:191-204` 已经拿到了白屏事件,只是没往 UI 传;`fileViewer.reload` 按钮的实现也已经有了(`FileViewer.tsx:2444-2452`)。

**第二:S08 供应商额度用完 —— 最大的一类(23,333/月、9,220 台设备、↑55%),差的是最后两颗按钮。**
今天用户拿到的:一张「额度已用尽」的卡,中文文案对,不给无用的重试(这几件都做对了),
但唯一的出路是「切换到 OpenDesign Cloud」——对不想换服务商的人等于没有出路。
设计要的〔更换模型〕〔去设置〕两颗都没有,而且这不是 S08 一家的事:S09 / S10 / S12 / S13 / S21 六条都在等这颗〔更换模型〕(见横切 C)。
一颗按钮解六条,ROI 最高。

**第三:S15 团队成员的钱路 —— 量不是最大,但是唯一会让人去投诉的一类。**
今天用户拿到的:团队成员点〔充值〕,落到 `/amr/dashboard?source=open_design`(`amr-guidance.ts:21-24`),
充的是自己的钱,不是团队的钱。设计方案里点名的那个问题,在 main 上一行都没改。
8,680 次/月、3,855 台设备,但真正的代价在飞书那 26 条支付争议里 —— 这类不产生重试,产生的是退款和投诉。
配套的 S06 死胡同弹窗(见 §4)是同一条链上的,应该一起修。

---

## 3. 「形态不同」的五条 —— 这类最容易被误当成已实现

1. **S02 本地 agent 没登录**:设计要「发送前探测到没登录就拦住」,代码是「让它跑、失败、再出卡」。卡做得不差(中文、有推荐),所以看截图很容易判成已实现 —— 但那 14,519 次失败**本来一次都不该发生**。差别不在卡上,在时序上。
2. **S01 本地 agent 没安装**:同上,而且更隐蔽 —— 选择器里连未安装的 agent 都不显示(`InlineModelSwitcher.tsx:694-699`),所以「标未安装」这件事看起来「不需要做」,实际是被过滤掉了。加上 `agentPicker.notInstalled` 这个 i18n 键还在(`zh-CN.ts:3648`),grep 到它会以为做了,但读它的整个组件是死代码。
3. **S03 账号登录过期**:设计要「顶部横幅,页面不跳走」,代码是 `navigate(..., {replace:true})` 强制跳到 onboarding 且退不回来(`App.tsx:1986`、`EntryShell.tsx:637`)。方向正好相反。「本地项目消失」这条飞书投诉就是这么来的。
4. **S24(i) 做了一半**:〔继续〕按钮**确实存在**,所以很容易判成已实现 —— 但它在 composer 上方的常驻 TodoCard 里(`ChatPane.tsx:4068-4145`),不在「那条回复末尾」;文案是「继续剩余任务」不是「继续运行」;落点是一条英文 prompt。位置错了,归属感就错了:用户看到的是一个全局待办卡,不是「刚才那次没做完」。
5. **S26 导出 / 评论失败**:三种形态并存(底部居中 toast、顶部居中 toast、原生 alert),没有一处在右下角,`Toast` 明明支持 `actionLabel`(`Toast.tsx:22-24`)却没有一处失败传了它。看起来「有提示」,实际是三套互不相干的提示且一个都不能重试。

---

## 4. 顺带查出来的问题(不在 32 条设计范围内,但建议单开)

**【严重】团队普通成员的余额弹窗是死胡同。**
链路:`AmrBalanceDialog.tsx:105-109` 取 `workspaceUpgradeUrl(...)` → `EntryNavRail.tsx:404` `if (context && context.permissions?.canManageBilling !== true) return null;`
→ `upgradeUrl === null` → `AmrBalanceDialog.tsx:242-251` 的三元落到 `null`。
结果:一个没有账单权限的团队成员余额耗尽时,拿到的弹窗**只有一颗「暂不需要」**,没有任何前进的路。
他的任务被 park 在队列里(`ProjectView.tsx:6975-6989`),而他既不能升级、也没有「通知管理员」、也看不到解释。
这比设计方案说的「被带到个人充值页」更糟 —— 那至少还有个地方可点。

**【中】`interrupted` 被记进失败维度表(但不影响前端展示)。**
前端是对的:用户按停止只会显示「已取消」(`AssistantMessage.tsx:1681`),**不会出报错卡**
—— `isRetryableAssistantTerminalFailure`(`apps/web/src/runtime/design-delivery.ts:32-39`)不含 `canceled`。
但 daemon 对 `result === 'cancelled'` 仍然产出一份完整 failure 分类:`failure_category: 'user_cancel'`
(`run-failure-classification.ts:692-709`,注释自陈是为了 dashboard 兼容)。
所以设计方案里担心的「用户可能看到一张不该出现的报错卡」在 web 侧**不成立**,但失败率被算高**是真的**。这是埋点口径问题,不是 UI 问题。

**【中】`resumable: false` 三处硬写,把〔继续运行〕关死在最需要它的三个场景。**
- `apps/daemon/src/runtimes/runs.ts:744` —— daemon 重启中断(S28)
- `apps/web/src/components/ProjectView.tsx:12606` —— 没生成文件(S23)
按钮的实现是好的(`ChatPane.tsx:3014-3033`),缺的是这几处的判定。

**【小】死代码 / 死键三则(改之前先确认,别重复造)**
- `AgentPicker.tsx` 整个组件无 import
- `InsufficientCreditsDialog.tsx` 整个组件无 import(线上跑的是 `AmrBalanceDialog`)
- 死 i18n 键:`assistant.waitingFirstOutput`、`assistant.slowHint`、`assistant.unfinishedSummary`、`entry.creditsMemberNotice*`、`common.offline`、`avatar.metaOffline`

---

## 5. 判不了 / 需要外部确认的

| 事项 | 卡在哪 | 要看什么才能判 |
|---|---|---|
| **S17 的「被移出团队」「客户端太旧」** | OD 仓内确实没有 403/426 分支,但设计方案自己写了前提(Q-19):要 vela CLI 先把 link 的 `code` 透进 ACP `error.data`。今天目录阶段被抹成「AMR model catalog is unavailable」 | 需要看 `/Users/elian/Documents/nexu/vela` 里 CLI 到父进程的错误契约,确认是「后端还没给」还是「给了但 OD 没接」。在 OD 仓内只能判到「OD 侧没接」 |
| **S25 白屏的 15 秒阈值** | 代码里的 1.5s(`FileViewer.tsx:640`)是「srcdoc 传输握手未确认」,探针侧另有 5s + 1.5s 确认(`packages/contracts/src/runtime/preview-observability.ts:16,24`)。三个数都不是 15s | 需要产品确认设计里的「15 秒」指的是哪一段(首屏可见?资源加载完?),否则实现出来会和设计对不上 |
| **S06「套餐开通中」的判定信号** | 代码里完全没有这个概念;`AmrBalanceDialog` 的 wallet 轮询(`:116-140`)是「已经拦住之后」的等待,不是「不拦」 | 需要后端确认「刚购买未到账」有没有可读的状态字段。没有的话这条做不了 |
| **S24(ii)「文件已生成但报过错」的提示** | 后端已经把它判成 succeeded 并跳过整个 error 发送块(`server.ts:15145`),所以前端**拿不到任何信号**知道「过程中报过错」 | 需要 daemon 在 end 帧上加一个标记(设计方案 Q-06 就是这条,还没拍板)。前端单独做不了 |
| **各场景的真机确认** | 本轮是纯代码审计,没起 runtime | 折叠正文(横切 A)、团队成员死胡同弹窗(§4)、白屏的实际观感,这三条建议真机各跑一遍再定优先级 |
