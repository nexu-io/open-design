# 运行错误全量清单(Run Error Catalog)

> 状态:**主表草稿完成,九份材料齐,待产品 / 设计逐项确认(2026-08-21)**。本文是 Open Design「一次运行可能怎么失败」的唯一权威清单,
> 目标是让产品和设计**逐项确认展示形式与后续处理流程**。旧文档《通用报错卡片 PRD》
> (飞书 `LdLMdMZ5Woq5hXxKZcJciIztndc`)只按埋点分类收了 12 类,没有覆盖 AMR 套餐/额度、BYOK、
> 客户端环境、网络、协作权限等来源,本文取代它的「错误类型表」,卡片骨架(标题/正文/CTA/源码四区)沿用。

## 0. 接手须知

> **优先级看这里**:各场景的线上频次、影响设备数、环比与 P0/P1/P2 分档,在设计方案 `docs/design/run-errors/error-ux-design.md` 文末《附:线上频次与优先级》(2026-08-24 拉的数,覆盖 93.3% 的失败)。重拉的方法在 `docs/design/run-errors/README.md`。

- 调研原始材料在 `docs/design/run-errors/sources/`(9 份,按来源分;见 §1;S3 拆成 `amr-vela-errors.md` + `vela-cli-error-surface.md` + `web-amr-error-ui.md`),本文只放结论与待决项。主表 §4 共 R-001–R-103(六层),流程 §5 共 F0–F10,待决 §7 共 Q-01–Q-25。
- 每一行错误都要有**证据**(文件:行号 / issue / PostHog 数字 / 飞书原话),没有证据的写「未找到」,不编。
- 展示形式与后续流程是**产品 + 设计的决定**,本文给候选与建议,不替他们选。决定落在 §6,未决的留在 §7。
- 旧 PRD 的 12 类、文案、CTA 规则作为基线保留在 §2,新清单每一行都要映射回这 12 类之一或标「旧分类覆盖不到」。
- **给产品 / 设计看的是《报错体验设计方案》**:仓库 `docs/design/run-errors/error-ux-design.md` = 飞书主文档 `AiTXdfTzJogsfKxTbwFcW78tnXg`(五原则 / 显示位置 / 统一规则 / 14 件事的决定 / 32 个场景:时机 · 位置 · 显示 · 点了之后,每个配界面内效果图 `cards/screens/`)。它是一套设计让人评审,不是选择题;早先的「决策单」已被它取代。本文(工程全表)的飞书副本是附录 https://powerformer.feishu.cn/docx/DFCKdpcvhoBwQPxqL9bcZbkBnx1;场景末尾的「对应工程条目 R-xxx」对应本文 §4;评审意见回抄本文 §6 和设计方案。两份文档改了都要重生成并 `+update --command overwrite`,设计方案覆盖后要重插图。

## 1. 材料来源

| # | 来源 | 覆盖面 | 文件 |
|---|---|---|---|
| S1 | daemon 源码 | run 生命周期、failureCategory 判定、各解析器 error 事件、产物校验 | `sources/daemon-run-failures.md` |
| S2 | web 源码 | 所有错误展示面(卡片/toast/banner/dialog/静默)、i18n 文案、动作 | `sources/web-error-surfaces.md` |
| S3 | AMR / vela(CLI + API) | 登录授权、会话、preflight、额度、套餐等级、网关 | `sources/amr-vela-errors.md` |
| S4 | BYOK / API 模式 | 各供应商 HTTP 错误、流中断、工具调用 | `sources/byok-api-errors.md` |
| S5 | 环境与边界 | 启动、打包客户端、更新、网络、本地 CLI、项目文件、工作区;近一月 GitHub issues | `sources/env-edge-errors.md` |
| S6 | 飞书群反馈(近 30 天) | 真实投诉面:现象桶 + 计数 + 原话 | `sources/feishu-feedback-30d.md` |
| S7 | PostHog(近 30 天) | 失败分布:failureCategory × agent × 版本 × 日 | `sources/posthog-failures-30d.md` |
| S8 | Langfuse(近 30 天,内部实例) | 错误原文按正则族聚类;找出被兜底分类吞掉的真因 | `sources/langfuse-errors-30d.md`(20:05 终版快照;scratchpad 那份后台管线还可能补 3 天,内容只增不减) |

## 2. 基线:旧 PRD 的 12 类(~38,000 次失败样本,时间窗未注明)

| 旧分类 | 次数 | 占比 | 旧 PRD 给的动作(AMR / 非 AMR) |
|---|---|---|---|
| 需要登录 | 9,697 | 25.41% | 登录 / 使用官方智能体 + 重试 |
| 余额不足 | 7,924 | 20.77% | 去充值(两种 agent 同) |
| 任务超时或卡住 | 4,593 | 12.04% | 重试 / 官方智能体 + 重试 |
| 智能体进程异常退出 | 4,028 | 10.56% | 重试 / 官方智能体 + 重试 |
| 网络或上游服务中断 | 2,293 | 6.01% | 重试 / 官方智能体 + 重试 |
| 频率或额度限制 | 1,970 | 5.16% | 重试 / 官方智能体 + 重试 |
| 工具或连接器失败 | 1,863 | 4.88% | 重试 / 官方智能体 + 重试 |
| 模型没有返回内容 | 1,143 | 3.00% | 重试 / 官方智能体 + 重试 |
| 输入内容过长 | 874 | 2.29% | 重试 / 官方智能体 + 重试 |
| 权限不足 | 535 | 1.40% | 重试 / 官方智能体 + 重试 |
| 服务端异常 | 516 | 1.35% | 重试 / 官方智能体 + 重试 |
| 模型不可用 | 289 | 0.76% | 更换模型 / 官方智能体 + 更换模型 |
| (兜底)未知 | — | — | 「任务执行失败 · 出了点意外」+ 重试 |

旧 PRD 的明显缺口(本文要补的):
- 12 类里 9 类的动作都是「重试」,没有区分**重试有没有用**(进程被杀 vs 输入过长 vs 上游 5xx)。
- 没有 AMR 的套餐等级 / 席位 / 工作区维度(余额不足 ≠ 套餐不含该模型 ≠ 席位已满 ≠ 团队欠费)。
- 没有 BYOK(key 无效 / 供应商 429 / 自定义网关不可达)。
- 没有「发起前」的失败(agent 没装、没登录、没选模型、daemon 不可达、工作区头缺失)——它们根本到不了 run_finished 埋点。
- 没有「结束后」的失败(产物找不到、导出失败、预览白屏)。
- 没有环境/网络边界(离线、代理、企业网、磁盘满、AVX2、版本错位)。
- 「任务超时或卡住」是一个大杂烩(上游空闲超时、daemon idle kill、SSE 断、用户电脑睡眠)。

## 2b. 真实数据基线(PostHog `run_finished`,2026-07-22 ~ 08-21,S7)

- 总量 1,076,866 次,**失败 133,367(12.38%)**,取消 88,971(8.26%);按天 10.0%–14.7% 平稳,**没有单日事故**;按版本也平(0.16.1 占失败 29% 只是装机基数最大)。
- 属性名与旧记忆不同:`result`(不是 status)、`agent_provider_id`(claude→`claude_code`、codex→`codex_cli`、BYOK 直连是 `openai`/`anthropic`/`google_gemini`)、`failure_category`/`failure_detail`;**没有原始错误文本字段**,也没有 channel。

| failure_category | 次数 | 占比 | 设备数 | 今天的 user_action |
|---|---:|---:|---:|---|
| process_exit | 28,789 | 21.6% | 9,530 | retry 17,621 / none 6,684 / install_cli 3,336 / fix_config 1,148 |
| rate_limit | 28,126 | 21.1% | 10,492 | **none 22,835** / retry 3,536 / recharge 1,755 |
| timeout | 20,156 | 15.1% | 8,190 | retry |
| upstream_unavailable | 19,129 | 14.3% | 6,176 | retry 11,773 / none 7,356 |
| auth | 16,524 | 12.4% | 6,425 | login |
| insufficient_balance | 6,822 | 5.1% | 3,909 | recharge |
| (null,0.7–0.13 老版本) | 4,058 | 3.0% | 1,186 | — |
| prompt_too_large | 4,002 | 3.0% | 1,064 | reduce_context |
| model_unavailable | 3,056 | 2.3% | 1,517 | switch_model |
| empty_output / tool_error / unknown | 985 / 889 / 832 | 2.0% | — | retry |

- 按 agent:claude_code 17.6% ≈ openai-BYOK 17.5% ≈ opencode 17.1% ≈ codex_cli 14.1%;**失败率** BYOK 整体 22.8%(google_gemini-BYOK 39.6%)是本地 CLI(9.8%)的 2.3 倍,AMR 19.2%(deepseek-v4-flash 26.5%)。
- 最大单签名:`rate_limit/hard_quota`(18,376 + 4,762,**UI 没给任何动作**)、`auth_required×claude_code` 9,471、`process_exit/stream_error` 11,172、`upstream stream_disconnected/upstream_5xx` 11,852、`timeout/inactivity_timeout` 15,967(first_token_wait 5,547 + tool_execution 5,946;自动重试救回率 ~12%)、`DAEMON_RESTARTED` 2,773、`cli_not_installed×codex_cli` 1,638(探测说可用实际没装)。
- AMR 46,675 runs:失败 7,666 次走 `fatal_rpc_error`(其中 insufficient_balance 3,704、upstream 1,489、process_exit 789、timeout 747、rate_limit 569)。
- 自动重试结局:suppressed/non_retryable_category 40,289、suppressed/hard_quota 23,211、重试后仍失败 20,409、unsafe_failure_stage 12,006、user_visible_output_seen 10,330。
- **run 之外**(旧 PRD 完全没有):`packaged_runtime_failed` 每天 100–190 台起不来(mac `better-sqlite3 ERR_MODULE_NOT_FOUND` 358 台、win32 sidecar status-timeout 958 台);`client_preview_white_screen` 0.20.x 每 session 5–6 次、08-20 起日均 5–6k(唯一陡升曲线,原因 `srcdoc_transport_unverified` + `lazy_shell_remount`,待判噪音/回归);`$exception` 去重后真问题 = ChunkLoadError 12.9k session(升级后旧 bundle)、localStorage sandboxed 28k session、React #31 779 session;workspace 链路 project_create「Workspace context is unavailable」4,799、WORKSPACE_AUTHORITY_UNAVAILABLE 1,520、file_upload OD_PROTOCOL_PROXY_FAILED 1,567;`mcp_tool_finished` 20.5k 失败全是 unknown。
- 旧 PRD 的 12 类与这里的口径基本对得上(rate_limit 里混着 hard_quota 与 429;insufficient_balance 只算 AMR),但它没有 null/unknown、没有 run 之外的事件。

## 2d. 错误原文基线(Langfuse,2026-07-22 ~ 08-21,S8)

PostHog 的 `run_finished` 没有原始错误文本,Langfuse 是唯一能看到「错误原文」的地方。窗口内 **184,337 个失败 trace**(28/31 天可查,缺 07-25、08-14、08-16,legacy 接口 422 超时;同期 trace 总量 1,167,601,失败占 17.8% —— 但其中 39.6% 是取消,剔掉后 ≈10.7%,与 PostHog 的 12.4% 同量级),抽样精确读回 **1,596 条**,全部归入 42 个正则族(1 条未匹配)。占比是抽样值(±2–3 个百分点)。0.17+ 客户端的 metadata 不再写 failure_category,所以与 PostHog 枚举的逐条对照只覆盖旧版客户端(抽样 26.8%)。

| # | 原文族 | 抽样占比 | 30 天估算 | 主要 agent | 备注 |
|---:|---|---:|---:|---|---|
| 1 | **user_cancel**(`run-error` 对取消也写) | 39.6% | ≈70.8k | codex / claude / opencode | 不是失败;说明「失败」口径要先剔掉取消 |
| 2 | empty_output | 8.9% | ≈15.8k | byok-opencode 84、opencode 48 | 其中 28 条 PostHog 归 `rate_limit/hard_quota`,原文却只是泛化的「completed without producing any output」—— 真因只在本地 stderr |
| 3 | auth(401 / login / token expired / keychain) | 7.6% | ≈13.6k | claude 58、antigravity 13 | |
| 4 | stall_idle(600s 无输出) | 6.8% | ≈12.1k | byok-opencode 41、opencode 32 | |
| 5 | quota_usage_limit(429 / 并发 / session limit) | 5.3% | ≈9.5k | claude 28 | |
| 6 | upstream_5xx_overloaded | 4.1% | ≈7.3k | codex 18、byok-opencode 17 | |
| 7 | network(ECONNRESET / socket closed / stream failed) | 3.6% | ≈6.5k | codex 20、claude 19 | |
| 8 | balance(insufficient balance / no payment method) | 2.4% | ≈4.4k | amr 16、byok-opencode 11 | |
| 9 | cli_not_installed(含 Windows 乱码「不是内部或外部命令」) | 2.0% | ≈3.6k | codex 15 | |
| 10 | no_text(无原文、非取消) | 2.0% | ≈3.6k | opencode / claude | = S1 说的「stderr 为空不发 error 帧」 |
| 11–28 | invalid_request_param 1.8%、timeout_generic 1.8%(hermes 13)、provider_http_4xx 1.7%(BYOK baseUrl 错)、**opencode_masked「Unexpected server error. Check server logs」1.4%**、model_unavailable 1.4%(含 Cursor「requires Max Mode」)、context_length 1.3%、transcript_dump 1.2%(把对话当错误写了)、model_access_forbidden 1.1%(中转站 403)、cli_version_incompatible 0.9%、byok_missing_config 0.6%、cli_config_invalid 0.4%(codex `service_tier`)、**od_unknown_agent「unknown agent: undefined」0.4%(OD 自己的 bug)**、local_storage_io 0.4%(sqlite locked / ENOSPC)、amr_catalog_unavailable 0.4%、account_ineligible_region 0.3%、content_filter 0.2% | | | | |

兜底枚举在原文里能读出的真因(只有 ≤0.16.x 客户端的旧 exporter 把 failure_category 写进 Langfuse,覆盖抽样 26.8%):
- `process_exit/exit_nonzero` → Windows 下 node / CLI 找不到(乱码)、opencode / codex 配置文件非法、sqlite 磁盘 I/O、Cursor 要求 Max Mode、Antigravity 地区不可用
- `process_exit/stream_error` → `max_tokens` 超范围 400、上下文超长(被包成 500)、第三方中转 403 无权访问模型、内容过滤
- `timeout` → `Unsupported service_tier: flex`(codex 配置)
- `unknown` → Claude Code 掉线、BYOK 没配 key
- 反向:`rate_limit/hard_quota` 有 28 条原文只是泛化空输出
另发现的 OD 侧 bug:`unknown agent: undefined` 派发(7 例);pi agent 把 `…/Resources/open-design/skills` 目录当 append-system-prompt 文件(EISDIR);deepseek TUI / aider 只接 argv 而 prompt 超长;opencode 无 AVX2 panic。

## 2c. 三份源码调研里改变认知的事实(S1 / S3 / S4 摘要,细节见源文件)

1. **启动期失败不经过分类器**(S1 §0、§3.4):`runs.fail` / `finishRun` 终结的 ~20 条(agent 未注册/没装、BYOK 缺配置、argv 超预算、AMR 未登录、spawn 抛错、daemon 重启、HTML 版本快照失败)前端只拿到裸 `error.code`,`failureCategory=null`。`finishWithRetryDecision` 是唯一会分类的终结点。
2. **分类器 = 26 级顺序短路的文本正则**(S1 §2):结构化 code 只在前 6 级起作用;`AGENT_EXECUTION_FAILED` 有 ~18 个发射点,拆不开的落 `process_exit/execution_failed`(不可重试),再靠 `rpc_close_reason` 提升成 `stream_error/exit_nonzero/fatal_rpc_error`;stderr 为空的非零退出**不发 error 帧**。
3. **契约与实现不一致**:`RunFailureAction` 契约只有 `relogin|recharge|upgrade|retry|none`,daemon 实际写 `login|switch_model|reduce_context|install_cli|fix_config|…`;`HTML_VERSION_SNAPSHOT_FAILED`、`DAEMON_RESTARTED`、`BYOK_PROVIDER_REQUIRED`、`PI_PARENT_SESSION_FAILED`、`DSH_PROFILE_*`、`AMR_WORKSPACE_SCOPE_REQUIRED` 都不在 `API_ERROR_CODES`。
4. **exit≠0 但本 run 写了产物一律算 succeeded**(chat-run-lifecycle.ts:90-92);critique 分支非 shipped 直接 failed 且不发 error 帧。
5. **web 解析顺序**(S3 web):agent 无关 code → `model_window_limit` → agent 无关 detail → AMR 分支 → Antigravity → detail 覆盖 → 连接断开 → 非 AMR auth → RATE_LIMITED → UPSTREAM → 兜底「Task failed + 原文 + Retry」。`fatal_rpc_error`、`process_crashed`、`model_not_found`、`prompt_too_large`(detail)、`upstream_client_error`、`network_error` 都**没有**卡片映射;`cpu_unsupported` 无任何按钮;两个死 i18n 键;`InsufficientCreditsDialog` 从未挂载;`json-rpc id N:` 原文直接进兜底。
6. **vela CLI 到父进程的契约**(S3 CLI):JSON-RPC 只有 4 个标准码,业务信息全在 `error.data.kind`(`model_catalog_unavailable` / `account_suspended` / `no_models_available` / `opencode_prompt_error` / `opencode_retry_exhausted` / `resume_failed` / `billing_recovery_*`)和 `statusCode`(上游网关状态码原样);401 的 HTTP 细节在 session_new 阶段被吞成「AMR model catalog is unavailable」;网关 401/402/403/429 在 prompt 期通过 `session.status retry` 原样透传文本;`vela login` 没有 `--json`、没有 logout、没有已登录短路;登录各阶段有 `OPEN_DESIGN_AMR_AUTH_STAGE` JSONL(error_kind 8 种);AVX2 崩溃在 vela 里**没有检测**,只表现为「opencode exited before readiness」。
7. **BYOK 不是直连**(S4):UI 的 API 模式全走 `byok-opencode`(daemon 拉 OpenCode,AI SDK 发请求);浏览器直连 `/api/proxy/*` 在 web 已无调用方(7 个路由 + 1,693 行媒体工具 + 测试仍在);OpenCode 日志回捞(#982)和 SSRF 守卫只覆盖 `opencode`/proxy 不覆盖 `byok-opencode`;上下文上限写死 128k/16k;内容审核(除 Gemini)、证书错误、`retry-after`、非流式 2xx 回包零识别;401 文案在劝 BYOK 用户「去本地登录 / 换 Cloud」。

8. **web 的非 AMR 错误面**(S2,76 条 W-xxx):run 失败只有 `ChatPane.tsx:2765` 一张 `UserActionCard(run-recovery)`,而会话加载失败、产物保存失败、BYOK 配置缺失、Side Chat 未选 agent 全塞进同一个 `error` 槽位、顶着「任务执行失败」标题且多数没按钮;**连接类状态几乎全静默**(SSE 断连重连 5 次、自动重试 2 次、协作/记忆 SSE 断开、5 分钟卡死看门狗、预览白屏重挂、首页 daemon 不可达都只有埋点没有 UI);daemon 不可达在 5 个位置有 5 种说法、没有共享横幅;版本不匹配、浏览器离线完全未处理;没有全局 ErrorBoundary;项目 403 被说成「已删除或不存在」、5xx 借 connectors 的「不可用」;`WORKSPACE_CONTEXT_INCOMPLETE` / `AMR_WORKSPACE_SCOPE_*` 在 web 零命中;十几处正文是绕过 i18n 的硬编码英文;上传失败三种形态、导出失败两套 key(一处还是原生 `alert()`)。

9. **环境 / 打包 / 网络边界**(S5,84 条 E-xxx + 近一月 issue 14 簇):打包壳的启动失败面**只有遥测没有用户出口** —— 除「OD_DATA_DIR 非绝对路径」会弹框外,原生模块缺失、SQLite 损坏/锁(无 busy_timeout、无 CORRUPT 处理)、状态超时、EACCES、磁盘满全是 splash 走完应用消失;daemon 运行中死掉后壳子不重拉(只有 web 有 supervisor),UI 还显示「Recovering automatically…」(#7010);daemon 没有 uncaughtException/unhandledRejection 兜底;坏 JSON 配置静默归零无备份。网络层几乎没有环境归因:无离线态、无时钟漂移、DNS/证书错误统一归 `invalid_base_url`、SOCKS 代理原样塞给 Claude Code(#6969)。本地 CLI 探测:坏 shim 挡好 shim + 丢 path 致整行消失(PR #7153 未合);Git Bash / AVX2 只能等 run 失败才知道;Windows 包两次丢 `node.exe`(#6065 → #7148 回归)说明打包产物校验缺一道门;Windows DPAPI 保存 BYOK 超时曾让 run 静默走 Cloud 计费(#6285)。近一月 issue 最集中:打包 daemon 起不来/半死(8 条)、workspace 头缺失让 CLI/MCP/预览 401 或看不到(6 条)、预览白屏/不响应(9 条)。

10. **飞书群近 30 天真实投诉面**(S6:98 个 OD 相关群 + 41 个小群,13,375 条消息,归出 **229 条人工反馈事件**,16 桶):A 套餐/订阅/支付争议 26(Go Plan 月付变年付、「不能接 API」、退款无人回复→支付宝投诉)、M UI 交互缺陷 25、D 任务卡住/超时 21(预览不刷新、watchdog 10 min、thinking 数分钟)、B 额度/余额错误 20(买了 Go 仍「余额为 0」、余额不足弹窗反复 #5987)、F 登录/工作区不可用 17(08-13 amr-api 拖崩 ingress;强制登录后本地项目「消失」)、E 白屏/崩溃/起不来 15、I 更新/安装 14、N 运行时/Agent 接入 14(DSH 扫不到、Ollama 测试通过运行 404、BYOK 读不了图)、C 并发/限流 13(`membership concurrency limit exceeded 6/5`、5h 限额 fail-open)、O 后端事故 13、H 模型不可用/生图被安全策略拒绝 12、J 工作区/项目管理 12、L 生成质量 11、K 导出/产物 7、G 代理/网络/地区 6(中转站、梯子 → Anthropic 400 unsupported region)、P 安全 3。bot 告警:AMR 模型成功率 <95% 83 次、LLM 错误率严重过高 64 次、Beta 发布失败 44 次。缺口:`+messages-search` 无 scope,约 30 条只有截图未读,Discord/邮件只拿到转述。**旧 PRD 的 12 类一个都对不上「套餐/支付争议」「余额显示错」「并发限额」「强制登录后项目消失」这几桶** —— 它们是真实投诉的前五,却都不是 run_finished 埋点能看见的。

## 3. 分层框架(清单按这个切)

```
L0 发起前     用户点发送之前/之时就被拦:agent 缺失、未登录、未选模型、配额为零、工作区/权限、daemon 不可达
L1 启动       spawn 失败、能力探测失败、登录态过期、版本错位、ACP 握手失败、preflight 模型不可用
L2 运行中     上游 4xx/5xx、429、流中断、空闲超时、进程被杀、工具/MCP 失败、输入过长、内容拒绝、AMR 额度耗尽
L3 结束       非零退出、信号、stop_reason 异常、模型零输出、turn 未完成
L4 结果       产物找不到、产物校验失败、导出/渲染失败、预览白屏
L5 环境/外围  离线、代理、企业网、磁盘、更新器、打包壳子、OS 特有;协作实时通道断开
```

每条错误的字段(最终主表 §4 的列):

| 列 | 含义 |
|---|---|
| ID | 全局唯一,按来源前缀(D/W/A/B/E)+ 序号,来自 §1 各源文件 |
| 层级 | L0–L5 |
| 来源 | 本地 CLI(哪家)/ AMR / BYOK / daemon / web / 系统 |
| 触发条件 | 用户做了什么、环境是什么、上游返回什么 |
| 检测信号 | 今天代码靠什么认出它(字段 / 事件 / 正则 / 文件:行);「无检测」要明写 |
| 今天用户看到 | 文案原文(i18n key)+ 形态(卡片/toast/banner/dialog/行内/静默) |
| 今天的动作 | 按钮及其行为 |
| 频率 | PostHog 30 天次数 / 飞书反馈次数 |
| 映射旧分类 | 12 类之一 / 兜底 / 覆盖不到 |
| **建议形态** | 报错卡(组件 19)/ 发送前拦截 / 顶部 banner / toast / 静默重试 —— 候选,待设计 |
| **建议后续流程** | 自动重试 × N / 从失败处重试 / resume / 登录 / 充值 / 升级套餐 / 换模型 / 精简输入 / 导出日志 / 联系支持 / 换 agent —— 候选,待产品 |
| 可恢复性 | 自动可恢复 / 用户一步可恢复 / 需外部(充值、管理员)/ 不可恢复 |
| 待决 | 需要谁拍板 |

## 4. 主表

合并规则:同一触发条件一行;「来源」列给出证据行号(D=daemon S1、W=web S2、A=AMR/vela S3、B=BYOK S4、E=环境 S5、F=飞书桶 S6、P=PostHog S7),细节去源文件查。
「今天」= 代码现状;「建议形态 / 建议后续」= 候选,**待产品设计拍板**,不是决定。形态缩写:**拦** 发送前拦截(不让失败发生)/ **卡** 报错卡(组件 19)/ **横** 顶部横幅 / **吐** toast / **弹** 对话框 / **静** 静默自动处理 / **行** 行内状态行。流程编号见 §5。
频率列:P = PostHog 30 天 run_finished 次数;F = 飞书 30 天人工反馈条数;「—」= 该来源看不见(不等于不发生)。

### L0 发起前(用户点发送之前 / 之时)

| ID | 错误 | 触发 | 今天怎么认出 | 今天用户看到 | 频率 | 旧分类 | 建议形态 | 建议后续(§5) | 可恢复 | 来源 |
|---|---|---|---|---|---|---|---|---|---|---|
| R-001 | daemon 不可达 / 没起来 | 打包壳启动失败、daemon 崩溃后未重拉、端口占用 | web 5 处各自探测;打包只有遥测 | 5 种说法、无共享横幅;首页「正在自动恢复」可能永远不恢复;应用直接消失 | P packaged_runtime_failed 每天 100–190 台 | 覆盖不到 | 横 + 启动失败弹 | F8 环境修复(重启 / 重装 / 导出日志) | 需用户 | W-018~021、E-001~011、E-031、#7010 |
| R-002 | daemon ↔ web / desktop 版本不匹配 | 更新后旧进程占 socket、旧 bundle | `unknown desktop sidecar message`;ChunkLoadError 12.9k session | 无处理 / 白屏 | P ChunkLoadError 12.9k session | 覆盖不到 | 横(「有新版本,请刷新 / 重启」) | F8(刷新 / 重启) | 一步 | W、E-019、P §7a |
| R-003 | 浏览器 / 机器离线 | 断网 | **无检测** | 各处报错文案不一 | — | 覆盖不到 | 横(离线态) | F8;恢复后自动重连 | 自动 | W、E |
| R-004 | 登录态过期(Cloud 账号 401/403) | token 过期、被登出 | context 401/403 静默跳 onboarding;首页发送才提示 | 「登录状态已过期」只在首页;其它路径静默跳转,本地项目「消失」 | F 17(F 桶) | 需要登录 | 横 + 登录弹 | F4 登录 | 一步 | W-031/033、A-014/015、F-F |
| R-005 | 工作区上下文缺失 / 权限不够 / scope 冲突 | 旧客户端、CLI/MCP/预览不带头、被移出团队、项目属别的 workspace | 400 `WORKSPACE_CONTEXT_INCOMPLETE` / 403 `WORKSPACE_PROJECT_PERMISSION_DENIED` / 409 `AMR_WORKSPACE_SCOPE_*`;web 零处理 | 403 被说成「项目已删除或不存在」;技能被藏;预览 iframe 裸 JSON | P project_create 「Workspace context is unavailable」4,799;F 6 条 issue | 权限不足(部分) | 横 / 卡(说清「哪个工作区、缺什么」) | F4(切换工作区 / 重新登录 / 找管理员) | 需用户 | D-006/007、A-025、W-034/035、E、#7072 |
| R-006 | 本地 agent CLI 未安装 / 不在 PATH / 探测被坏 shim 挡住 | 没装;shim 坏;PATH 裁剪;Windows 缺 node.exe | `AGENT_UNAVAILABLE`(启动期不分类);探测链 PR #7153 未合 | 「Agent not installed」卡(run 已建)或整行从 UI 消失 | P cli_not_installed 2,458(其中 codex_cli 1,638「探测说可用实际没装」) | 覆盖不到 | 拦(选 agent 时就标「未安装 → 安装指引」) | F8 安装 CLI | 需用户 | D-013/028、E-022、B-008、#7153 |
| R-007 | 本地 agent CLI 未登录 / 登录过期 | claude/codex/cursor 等 | 启动期 `AGENT_AUTH_REQUIRED`(D-066/069)或运行期 401 文本 | 「Sign-in required:{agent} isn't signed in…推荐 Cloud」+ 切换卡 | P auth 16,524(claude_code 9,471 = 其失败 40%) | 需要登录 | 拦(发送前探测登录态)+ 卡 | F4(终端登录指引;Antigravity 有「Sign in via terminal」) | 需用户 | D-066/069/073、W、P |
| R-008 | AMR 未登录 / 登录过期 | 无 profile、runtime key 失效 | D-024/029 `AMR_AUTH_REQUIRED`;运行中 link 401 被 CLI 抹成「catalog unavailable」 | 登录态正常:「Sign-in required」+ 行内 Authorize & retry;**key 失效时变成「Task failed」** | P auth 含 AMR;F-F 17 | 需要登录 | 拦 + 卡(行内授权) | F4 设备授权(自动重试) | 一步 | D-024/029、A-016~020、S3-③1 |
| R-009 | BYOK 配置缺失 / 形状错 / baseUrl 非法 / Bedrock 不支持 / OpenCode 未装 | API 模式 | web preflight 拦 + daemon 400 / `BYOK_PROVIDER_REQUIRED`(不在契约) | 硬编码英文错误条 + 自动开 Settings | — | 覆盖不到 | 拦(Settings 字段级) | F4 改 key / F8 装 OpenCode | 一步 | B-001~008 |
| R-010 | AMR 余额为 0 / 过低(账号级 / 工作区级) | PAYG 钱包耗尽;**买了 Go 仍显示 0**(补发延迟) | 余额门 ≤$0 硬阻断、≤$2 软提醒;工作区读不到则静默放行;刷新失败 fail-open | 硬弹「Upgrade to keep creating」/ 软弹「Running low」;**弹窗反复**(#5987);付费档余额 0 其实=「无限」 | F-B 20、F-A 26 | 余额不足 | 拦(弹);付费档 0 余额**不拦** | F5 付费(充值 / 升级 / 团队找管理员) | 需外部 | A-058、S3-②、F-B、#5987、#7190 |
| R-011 | 选中的模型不在套餐里 / 已下线 / 目录为空 | free 只有 allowlist;team_basic = free 规则;模型 downline | 选择器 `enabled===false` 锁定 + 「Upgrade to use」;**set_model 不可用被静默换 default** | 锁图标;运行时可能悄悄用了别的模型 | P model_unavailable 3,056 | 模型不可用 | 拦(锁定 + 套餐说明);运行时换了模型要**提示** | F6 换模型 / F5 升级 | 一步 | A-021/033/034/037/038、S3-① |
| R-012 | 套餐并发 / RPM 上限 | `membership concurrency limit exceeded 6/5`、rpm 61/60 | link 400 `tier_limit_exceeded`;OD 不识别 → `upstream_client_error` 不重试 | 「Task failed」+ 原文 | F-C 13 | 频率或额度限制 | 拦(并发计数在发送前就知道)/ 卡 + 倒计时 | F9 等待(自动排队)/ F5 升级 | 自动 | A-045、S3-③5、F-C |
| R-013 | 席位满 / 订阅锁定 / 需付款方式 | 邀请、加入、自动充值 | 409 `workspace_seat_limit_reached` 等 | 邀请流有文案;其它路径无 | — | 覆盖不到 | 拦 | F5(找管理员 / 加席位) | 需外部 | A-066/067、W |
| R-014 | 空消息 / 图片附件 >1MB / 附件类型不支持 | 发送校验 | daemon 400 | 错误条 | — | 覆盖不到 | 拦(输入框旁) | F7 改输入 | 一步 | D-017/019 |
| R-015 | 沙箱模式导入文件夹无托管副本 | 沙箱 + 导入项目 | 400 | 错误条 | — | 覆盖不到 | 拦 | 不可恢复(重新导入) | 需用户 | D-004/018 |
| R-016 | 幂等冲突 / 消息占位冲突 / 角色错误 / daemon 关机中 / 插件 snapshot 不存在 | 并发发送、刷新竞态 | 409 / 503 / 404 | 多为静默或原始 JSON | — | 覆盖不到 | 静(自动重发)或 吐 | F3 | 自动 | D-001/008~012 |

### L1 启动(run 已建,子进程起来之前 / 握手期)

| ID | 错误 | 触发 | 今天怎么认出 | 今天用户看到 | 频率 | 旧分类 | 建议形态 | 建议后续 | 可恢复 | 来源 |
|---|---|---|---|---|---|---|---|---|---|---|
| R-020 | spawn 失败(ENOENT / EACCES / EPERM / ENAMETOOLONG / ENOEXEC / EBADF) | 二进制不可执行、杀毒拦截、路径问题 | `AGENT_EXECUTION_FAILED "spawn failed: …"`(启动期不分类;事后文本能分 spawn_*) | 「Task failed」+ 原文 | P spawn_eperm×codex 301 | 进程异常退出 | 卡(按 errno 说人话) | F8 | 需用户 | D-030、P |
| R-021 | prompt 超 argv / 命令行预算(Windows 32,767、deepseek/aider 30k) | 长对话 + plain CLI | `AGENT_PROMPT_TOO_LARGE`(启动期不分类) | 「Input too long」卡 | P prompt_too_large 4,002(含运行期) | 输入内容过长 | 卡 | F7 精简 / 新对话 | 一步 | D-021~023 |
| R-022 | vela / opencode 二进制缺失、opencode 起不来(readiness 10s、端口、数据目录)、profile 配置损坏 | 打包坏、HOME 不可写、`~/.amr/config.json` 坏 | CLI stderr + exit 1;`start opencode server: …` | 「Task failed」+ 原文 | — | 覆盖不到 | 卡(环境类) | F8 | 需用户 | A-001/002/004/005 |
| R-023 | CPU 无 AVX2 | 老 x64 机器跑捆绑 opencode | 仅 run 失败文本 `no_avx2` / 0xC000001D → `cpu_unsupported` | 「Processor not supported」**无任何按钮** | — | 覆盖不到 | 拦(安装 / 首启探测)+ 卡 | F8(换 baseline 构建 / 升级客户端);给「导出日志」 | 不可自动 | A-003、E-021、#5733 |
| R-024 | AMR runtime key 失效 / paused / 封号 / 被移出团队 / workspace 锁定 / 旧 link 426 | key rotate、风控、团队变动、客户端过旧 | **link 401/403/409/426 在目录阶段被 CLI 抹成 `AMR model catalog is unavailable.`(retryable:false)**;封号文案无正则 | 全部「Task failed」 | — | 需要登录 / 权限不足 | 卡(按 code:重新登录 / 切换工作区 / 升级客户端 / 封号申诉) | F4 / F10 | 需用户 | A-018~020/023/024、S3-③1-2、S3-④12 |
| R-025 | 目录拉取 429/5xx/传输错(4 次耗尽) | 网关抖动 | `AMR model catalog is temporarily unavailable. Please retry.` retryable:true | 「Task failed」 | — | 网络或上游 | 静(自动重试 1 次)→ 卡 | F1 → F3 | 自动 | A-022 |
| R-026 | codex 默认模型与 CLI 版本不兼容 | stale 模型目录 | preflight `cli_version_incompatible`(唯一有分类的 preflight) | 「Task failed」(detail 无卡片) | P 1,267 | 模型不可用 | 卡(升级 CLI 或换模型) | F6 / F8 | 一步 | D-027、P |
| R-027 | ACP 握手失败 / 方法不支持 / 参数非法 / 单会话限制 | 协议不匹配(CLI 版本) | -32601/-32602/-32600 → `agent_protocol_error` | 「Task failed」 | P agent_protocol_error 1,584 | 进程异常退出 | 卡(版本不匹配 → 升级) | F8 | 需用户 | A-032、D-045 |
| R-028 | 会话恢复失败(claude --resume / codex rollout / opencode session / AMR resume_failed) | session 被清、过期 | 首次:静默清 session + 同 run 重跑;二次:`session_resume_expired` | 首次无感;二次「Session expired」卡 | — | 覆盖不到 | 静 → 卡 | F1 → F3 | 自动 | D-036/051/070、A-027/028 |
| R-029 | 阶段看门狗 / 首输出超时(ACP 各阶段默认 10min、AMR 30min;首输出 2min) | 握手后无任何行 | `ACP <label> timed out` → timeout;`first_output_deadline` | 「Timed out」卡 | P timeout/first_token_wait 5,547 | 任务超时或卡住 | 静(同 run 自动重试 1 次)→ 卡 | F1 → F3 | 自动 | D-044/057、A-029/030 |
| R-030 | OD 单行 JSON-RPC >1MiB | 超长 prompt 走 ACP | `ACP input line exceeds maximum size` → `agent_protocol_error`(**不是** prompt_too_large) | 「Task failed」 | — | 输入内容过长 | 拦(ACP 路径加预算)+ 卡 | F7 | 一步 | A-031、S3-④6 |
| R-031 | agent 运行时定义非法 / byok provider 构建失败 / critique 异常 | 源码 bug、配置 | `AGENT_RUNTIME_DEF_INVALID` / `BYOK_PROVIDER_REQUIRED`(不在契约) | 「Configuration error」/「Task failed」 | — | 覆盖不到 | 卡 | F10 反馈 | 不可 | D-015/016/061 |

### L2 运行中(上游 / 模型 / 流 / 工具)

| ID | 错误 | 触发 | 今天怎么认出 | 今天用户看到 | 频率 | 旧分类 | 建议形态 | 建议后续 | 可恢复 | 来源 |
|---|---|---|---|---|---|---|---|---|---|---|
| R-040 | 401 key 无效(BYOK / 本地 CLI) | key 错、吊销 | 文本 → `auth/invalid_api_key` | 「Sign-in required:{agent} isn't signed in…推荐 Cloud」(**对 BYOK 错位**) | P auth 含 | 需要登录 | 卡(BYOK:改 key;CLI:终端登录) | F4 | 一步 | B-014、D-073/074 |
| R-041 | 403 权限 / 地区不支持 / 套餐不含模型 | 代理出口地区;free 无 allow 规则;`tier_model_not_entitled` | 403 → `upstream_client_error`(不重试);AMR 有 `AMR_TIER_UPGRADE_REQUIRED` | BYOK「Task failed」;AMR「Upgrade to keep creating」 | F-G 6(梯子 / 中转站) | 权限不足 | 卡(地区:换出口;套餐:升级) | F8 / F5 | 需用户 | B-015、A-037、F-G |
| R-042 | 404 模型不存在 / 网关不路由 | 模型名打错、网关 404 HTML | `model_not_found` / `upstream_client_error`;web **无卡片映射** | 「Task failed」+ AMR 口吻「Check the OpenDesign link URL」 | P model_unavailable 含 | 模型不可用 | 卡(换模型) | F6 | 一步 | B-016/028、A-035 |
| R-043 | AMR PAYG 余额耗尽(个人非 coding-plan / 团队钱包) | 429 `insufficient_balance` | `AMR_INSUFFICIENT_BALANCE` → recharge;充值后可 `resume:true` 同 run 重启 | 「Insufficient allowance」+ Top up(固定跳账号 dashboard)+ Retry;**团队成员被引到个人充值页** | P 6,822(AMR fatal_rpc 里 3,704) | 余额不足 | 卡(个人 / 团队两版) | F5;充值后自动续跑(已有) | 需外部 | D-049/096、A-046、S3-② |
| R-044 | BYOK / 本地 CLI 配额耗尽(hard_quota) | OpenAI 429 insufficient_quota、Anthropic 400 credit too low、DeepSeek 402、OpenCode Zen 免费额度 | 文本 → `rate_limit/hard_quota`(不重试) | 「Quota exhausted…retrying won't help」**无按钮** + 切 AMR 卡(对 AMR 自己也出) | **P 23,138(最大单签名,user_action=none 22,835)**;Langfuse:其中一部分原文只是泛化空输出,真因在本地 stderr | 频率或额度限制 | 卡(去供应商充值 / 换 key / 换模型 / 切 Cloud) | F5 / F6 | 需外部 | B-018、P §3b、S3-④9、S8 族 2 |
| R-045 | workspace credits 耗尽(BYOK 之外的工作区额度) | `workspace_credits_exhausted` | detail 已分;卡「Quota exhausted(workspace)」 | 无按钮 | P 1,742 | 余额不足 | 卡(找管理员 / 充值) | F5 | 需外部 | D-049、P |
| R-046 | API key 美元用量上限 `usage_limit_exceeded` | AMR key 窗口用量 | 429 文本 → rate_limit | 「Usage limit reached」 | — | 频率或额度限制 | 卡 + 重置时间 | F9 等待 | 自动 | A-043 |
| R-047 | Coding Plan / 单模型滚动窗用尽 `model_limit_exceeded` | 个人付费档 5 小时窗 | 400 + Retry-After → `model_window_limit` | 「High demand right now — try again after {retryAt}. Not charged.」 | F-C(「5 小时 1 美金」) | 频率或额度限制 | 卡 + 倒计时(**已是最好的一张**) | F9;到点自动重试? | 自动 | A-044、W |
| R-048 | 429 速率限制(RPM/TPM) | 供应商限速 | `rate_limit_429`(可重试);`retry-after` 三路径都不读 | 「Usage limit reached」+ Retry | P rate_limit_429 2,598 | 频率或额度限制 | 静(退避重试)→ 卡 + 倒计时 | F9 → F1 | 自动 | B-019、D-074 |
| R-049 | 上下文过长(400 / 413) | 历史长、附件大;BYOK 写死 128k | Claude 结构化 `AGENT_PROMPT_TOO_LARGE`;其它靠文本 `prompt_too_large`(**web 无 detail 映射**);AMR 顺手清 session | Claude「Input too long」;其它「Task failed」 | P prompt_too_large 4,002;F-K | 输入内容过长 | 卡(精简 / 新对话 / 压缩上下文) | F7 | 一步 | B-020、D-035/099、A-048 |
| R-050 | 参数不支持 / 请求结构被拒 / 工具 schema 非法 / 模型不支持工具 | o-series、兼容网关、OpenRouter | `upstream_client_error` / `tool_schema_invalid` / `provider_routing_error` | 「Task failed」 | P upstream_client_error 2,479 | 服务端异常 | 卡(换模型 / 换网关) | F6 | 一步 | B-021~023 |
| R-051 | 上游 5xx / 过载 529 / 网关 502 upstream_error | 供应商抖动 | `upstream_5xx` / `provider_high_demand`(可重试、可 Continue) | 「Service temporarily unavailable」+ Retry | P upstream_5xx 大桶(opencode 2,013…) | 网络或上游 | 静(自动重试)→ 卡(+Continue) | F1 → F2 → F3 | 自动 | B-024、A-040、D-074 |
| R-052 | 网关 idle 504 / 排队超时(grok、DashScope) | 首 token 迟迟不来 | `stream idle timeout` → `stream_disconnected`(可 Continue) | 「Task failed」(detail 无映射) | — | 任务超时或卡住 | 静 → 卡(+Continue) | F2 | 自动 | A-041/073 |
| R-053 | 平台自己的 provider 凭据坏 `upstream_provider_unauthenticated` | 网关配置 | **被误判成用户鉴权** `auth/auth_required` | 「Sign-in required」(**错**) | — | 服务端异常 | 卡(「服务故障,不怪你」) | F10 / 自动告警 | 不可 | A-042、S3-③6 |
| R-054 | 自定义 baseUrl 不可达 / DNS / 代理 env 非法 / 证书错误 | 网关挂、企业 MITM、自签名 | `network_error`;证书 A/B 路径**零识别**;`fetch failed` 无 cause → stream_error | 「Task failed」+ 「fetch failed」 | — | 网络或上游 | 卡(按 cause 说:DNS / 证书 / 代理) | F8 | 需用户 | B-025~027、E |
| R-055 | 非流式 2xx 回包 / HTML 错页 | 网关不支持流式 | 静默空回复 / `upstream_client_error` | 无错误或「Task failed」 | — | 模型没有返回内容 | 卡 | F6 换网关 | 需用户 | B-028/029 |
| R-056 | 流中断 / 半包(ECONNRESET、socket closed、SSE EOF) | 网络抖动 | `stream_disconnected`(可 Continue);「Connection dropped」卡**只给 claude** | claude「Connection dropped」;其它「Task failed」 | P stream_disconnected 大桶(claude 1,835、codex 1,811) | 网络或上游 | 静 → 卡(+Continue) | F2 → F3 | 自动 | B-031、D-034/073、A-052 |
| R-057 | 无输出超时(inactivity 10min / AMR 30min;opencode 静默重试 429 不吐输出) | 模型挂起;OpenCode 吞 429/401 | `inactivity_timeout`;opencode 日志回捞只对 `opencode` 不对 `byok-opencode` | 「Timed out」+ Retry | **P 15,967(tool_execution 5,946 + first_token 5,547);自动重试救回 ~12%** | 任务超时或卡住 | 行(先显「还在等上游」)→ 卡(+Continue) | F1 → F2 | 自动 | D-055/056、B-032、A-051/056 |
| R-058 | 内容审核 / 拒答(Gemini SAFETY、OpenAI content_filter、Anthropic refusal、生图安全拒绝) | 敏感内容 | **除 Gemini(B 路径)外零识别** → 表现为空输出 | 「No output produced」 | F-H 12(生图 27 次失败 15) | 模型没有返回内容 | 卡(「内容被拒」+ 改提示词) | F7 | 需用户 | B-033、A-062、F-H |
| R-059 | 模型伪造角色标记被守卫截断 | 注入 / 幻觉 | `ROLE_MARKER_HALLUCINATION` → `fabricated_role_marker`(可重试) | 「Invalid model output」+ Retry | P 1,012 | 覆盖不到 | 静(自动重试 1 次)→ 卡 | F1 → F3 | 自动 | D-053、B-034 |
| R-060 | 工具死循环 / 工具或 MCP 调用失败 | 连续失败 10 次;MCP 坏 | `TOOL_LOOP_DETECTED`(默认只 warn);`tool_error`;**mcp_tool_finished 20.5k 失败全 unknown** | 「Stuck in a loop」/「Task failed」 | P tool_error 889;mcp 20.5k | 工具或连接器失败 | 卡(说清哪个工具 / 连接器) | F3 / F8 | 需用户 | D-054、A-055、P |
| R-061 | 图片 >20MiB / 路径失效(AMR) | 附件 | -32602 文本 | 「Task failed」 | — | 覆盖不到 | 拦(上传时) | F7 | 一步 | A-054 |
| R-062 | 媒体生成 402 / 429 tier_limit / 504 / 502 | 生图生视频 | `friendlyMediaError` 文本;工具结果 isError | 模型自述;生图格「失败 · 重试」 | F-H | 余额不足 / 频率 | 行(生图格)+ 卡 | F5 / F9 | 需外部 | A-062、B-038 |
| R-063 | 计费恢复流失败(AMR 个人 PAYG) | 充值恢复轮询失败 | `billing_recovery_unavailable` retryable:true,**无命名分类** | 「Task failed」 | — | 余额不足 | 卡(「充值已到账,点继续」) | F5 | 一步 | A-047 |
| R-064 | 封号 `account_suspended` | 风控 | 文案无正则 → 可重试「Task failed」 | 「Task failed」+ 英文长文 | — | 覆盖不到 | 卡(联系支持,不给 Retry) | F10 | 不可 | A-019、S3-③2 |
| R-065 | DSH / pi / copilot 协议错误 | 特定 agent | `DSH_PROFILE_*`、`PI_PARENT_SESSION_FAILED`(不在契约);copilot 无 error 事件 | 「Task failed」 | — | 进程异常退出 | 卡 | F3 | 自动 | D-041/043/052 |
| R-066 | stdin 写错 / child error / critique 非 shipped | 边缘 | 只发 error 不 finish;critique 不发 error 帧 | 先错后成功;或 failed 无文案 | — | 覆盖不到 | 卡 | F3 | 自动 | D-031/058/061 |
| R-067 | opencode 把真因遮成「Unexpected server error. Check server logs」 | opencode 内部任何 5xx | 原文无信息;真因在 opencode 自己的 log(回捞只对 `opencode` 不对 `byok-opencode`) | 「Task failed」+ 这句废话 | Langfuse 1.4%(≈2.6k) | 服务端异常 | 卡(附 opencode 日志回捞结果) | F1 → F3;研发:扩回捞到 byok-opencode | 自动 | S8 族 14、B-032 |
| R-068 | OD 自己派发了 `unknown agent: undefined` | agent id 丢失(切换 / 刷新竞态) | `AGENT_UNAVAILABLE "unknown agent: undefined"` | 「Agent not installed」(**误导**) | Langfuse 7 例 | 覆盖不到 | 静(自动回落默认 agent)+ 修 bug | F3 | 自动 | S8 族 22、D-013 |
| R-069 | pi agent 把 skills 目录当 system-prompt 文件(EISDIR) | 打包路径 | 原文 EISDIR | 「Task failed」 | Langfuse 若干 | 覆盖不到 | 修 bug | — | 不可 | S8 |

### L3 结束(子进程 close)

| ID | 错误 | 触发 | 今天怎么认出 | 今天用户看到 | 频率 | 旧分类 | 建议形态 | 建议后续 | 可恢复 | 来源 |
|---|---|---|---|---|---|---|---|---|---|---|
| R-070 | 非零退出且 stderr 无命中(最大兜底桶) | CLI 崩、Node 栈 | `process_exit/exit_nonzero` / `exit_code` / `execution_failed`;**stderr 为空不发 error 帧**。Langfuse 原文里 exit_nonzero 的真因:Windows 下 node / CLI 找不到(乱码)、CLI 配置文件非法、sqlite I/O、Cursor 要 Max Mode、Antigravity 地区不可用;stream_error 的真因:`max_tokens` 超范围、上下文超长被包成 500、中转站 403、内容过滤 | 「Task failed」+ stderr 尾 / 或什么都没有 | P stream_error 11,172 + exit_nonzero 3,907 + execution_failed 1,150;Langfuse no_text 2.0% | 进程异常退出 | 卡(默认给「导出日志」);研发:把这几条真因加进分类器正则 | F1(exit_nonzero 可自动重试)→ F3 → F10 | 部分 | D-076、P、S8 |
| R-071 | 信号死亡(SIGKILL OOM / SIGSEGV / SIGABRT / Bun crash / 0xc0000409) | 内存、崩溃 | `signal_killed` / `process_crashed`(不可重试) | 「Task failed」 | P 含 | 进程异常退出 | 卡(「进程崩溃」+ 导出日志) | F10 | 不可自动 | D-077、A-053/076 |
| R-072 | ACP fatal 后退出 | 任何 ACP `fail()` | `rpc_close_reason=fatal_rpc_error`(**web 无分支**) | 「Task failed」 | P AMR fatal_rpc 7,666 | 进程异常退出 | 按 data.kind 分流到上面各行 | 各行 | 各行 | D-063、A-078 |
| R-073 | 空输出(exit 0 无文本 / 只有标题) | 模型空回、审核、会话过期 | `empty_output`;plain CLI 读 log 判登录 | 「No output produced」+ Retry(原文说「re-authenticate」对 BYOK 不适用) | P 985 | 模型没有返回内容 | 静(first_token 阶段自动重试)→ 卡 | F1 → F3 | 自动 | D-067/071、A-036/075 |
| R-074 | 插件创作未产出 generated-plugin 产物 | 插件 run | `plugin_artifact_missing`(不重试) | 「Task failed」 | — | 工具或连接器 | 卡 | F3 | 一步 | D-068 |
| R-075 | plain CLI exit 0 但 stdout 是登录提示 | antigravity / deepseek TUI | 文本判 auth | 「Sign-in required」(终端登录) | — | 需要登录 | 卡 | F4 | 需用户 | D-069 |
| R-076 | exit≠0 但本 run 写了产物 → 算成功 | CLI 写完文件后崩、hook 失败 | `classifyChatRunCloseStatus` | 显示成功,无任何提示 | — | 覆盖不到 | **待决**:成功 + 行内警告? | — | — | D-072、S1-§4-7 |
| R-077 | daemon 重启打断 | daemon 崩 / 升级 | 读盘补 `DAEMON_RESTARTED`(不在契约,不分类) | 「Task failed」+ 「Run interrupted because the daemon restarted.」 | P 2,773 | 覆盖不到 | 卡(「已中断,可继续」) | F2(若有 session)/ F3 | 一步 | D-082、P |
| R-078 | 用户取消 / 项目删除连带 / daemon 关机取消 | stop 按钮等 | `user_cancel`,`cancelOrigin` 三种 | 「已取消」脚注;web 待确认是否该给重试 | P cancelled 88,971 | — | 行 | F3 可选 | — | D-083~087、W |
| R-079 | 超长输出行 `bufio.scanner: token too long` | 工具输出超大 | 改写成通用文案 | 「Task failed」 | — | 进程异常退出 | 卡 | F3 | 自动 | A-077、B-043 |

### L4 结果(run 已终态,交付物对不对)

| ID | 错误 | 触发 | 今天怎么认出 | 今天用户看到 | 频率 | 旧分类 | 建议形态 | 建议后续 | 可恢复 | 来源 |
|---|---|---|---|---|---|---|---|---|---|---|
| R-080 | 交付物校验失败(无产物 / 入口缺失 / 未被本 run 触碰 / 类型不匹配) | 模型没写文件、写错地方 | statusBody `deliverableValidation`(只读信号);`ARTIFACT_NOT_FOUND` 只是文件 API 错误 | 「No deliverable produced」卡 | — | 覆盖不到 | 卡(「没生成文件」+ 重试 / 继续) | F3 / F2 | 一步 | D-088/092 |
| R-081 | 未完成工作 / max_tokens 截断 | TodoWrite 未关、stop_reason 截断 | `endedWithUnfinishedWork`(仍 succeeded) | 脚注「已停止,仍有未完成任务」 | — | 覆盖不到 | 行 + 「继续」按钮 | F2 | 一步 | D-089、B-035 |
| R-082 | HTML 版本快照失败 / plain 产物持久化失败 | 磁盘、路径 | `HTML_VERSION_SNAPSHOT_FAILED`(不在契约);成功翻成失败 | 「Task failed」 | — | 覆盖不到 | 卡(说明文件其实已写) | F3 | 一步 | D-078/079 |
| R-083 | 预览白屏 / iframe 超时 / 资源加载失败 / `__resources` 不注入 | srcdoc 传输、懒加载重挂、od:// 字体 | 只有遥测(`client_preview_white_screen`,重挂静默) | 白屏;切代码再切回才显示 | **P 0.20.x 每 session 5–6 次、日均 5–6k(唯一陡升)**;F-E 15、issue 9 条 | 覆盖不到 | 行(预览区内「加载失败 · 重新加载」) | F8(自动重挂 + 手动) | 自动 | W-060、E-017/018、P §7d |
| R-084 | 导出失败(图片 / PPTX / PDF) | sidecar 版本错位、截图失败 | 两套 key、一处原生 `alert()` | toast 或 alert | F-K 7 | 覆盖不到 | 吐(统一)+ 重试 | F3 / F8 | 一步 | W-058、E-019 |
| R-085 | 产物保存 / 发布 / 评论保存失败(含 headerless 401) | 工作区头缺失、403、网络 | 同一句「评论保存失败,请重试」 | 塞进 run 失败卡或 toast | — | 覆盖不到 | 吐 / 行 | F3 / F4 | 一步 | W-039/045 |
| R-086 | 等待用户回答 `<question-form>` | agent 发问 | `awaiting_input`(非失败) | 项目状态「待输入」 | — | — | 行 | — | — | D-091 |

### L5 环境 / 外围 / 账号生命周期(run 之外,但用户体感是「坏了」)

| ID | 错误 | 触发 | 今天怎么认出 | 今天用户看到 | 频率 | 旧分类 | 建议形态 | 建议后续 | 可恢复 | 来源 |
|---|---|---|---|---|---|---|---|---|---|---|
| R-090 | 打包壳启动失败家族(原生模块缺失、SQLite 坏 / 锁、数据目录不可写、磁盘满、冷启动超时、Node 版本) | 安装损坏、两实例、慢盘、杀毒 | 只有遥测 `packaged_runtime_failed`;弹框仅路径非法 | 应用消失 | P 每天 100–190 台(mac better-sqlite3 358 台、win sidecar 超时 958 台) | 覆盖不到 | 弹(启动失败页:原因 + 导出日志 + 重装) | F8 / F10 | 需用户 | E-002~011/031 |
| R-091 | 更新器失败(元数据拉不到、下载中断、校验失败、壳子 / payload 错配、地板拒绝) | 离线、镜像、旧壳 | `metadata-unreachable` / `download-failed` / `checksum-*` / `outer-below-min` | 「Couldn't check for updates」/「Update failed」/ reinstallReady | F-I 14 | 覆盖不到 | 弹(已有)+ 区分离线 | F8 | 一步 | E-020/035~037 |
| R-092 | Windows 特有:缺 node.exe、无 od CLI、坏 PATHEXT、DPAPI 超时、EPIPE 弹窗、Defender 拖慢 | Windows 包 | 多数无告警;DPAPI 曾让 run 静默走 Cloud 计费 | 各种 | issue #6065/#7148/#6285/#6964 | 覆盖不到 | 拦(打包产物校验门)+ 弹 | F8 | 需用户 | E-022~027 |
| R-093 | macOS 27 系统策略拒绝 / 安装路径含符号链接 / 单实例闸门误杀 | 特定环境 | 零日志 / 拒绝 symlink / 强杀重启 | 无窗口;「launcher payload」报错;被重启 | issue #6663 | 覆盖不到 | 文档 + 弹 | F8 | 需用户 | E-012/028/029 |
| R-094 | Renderer 崩溃循环 / GPU | 驱动、缓存 | 熔断 5 次/60s → 静态恢复屏 | 「It will try to recover on its own」 | P 去重后每版几十到几百台 | 覆盖不到 | 弹(已有) | F8 | 自动 | E-030、P §7b |
| R-095 | od:// 连接池卡死 / 字体 tofu / 高 CPU(大目录 walk) | 频繁切页、长流、16 万条目导入 | 已修无回归监测;font-recovery 只覆盖两族;无自监测 | 越来越慢到全白;方块图标;卡顿 | issue #7195/#6655 | 覆盖不到 | 静(自愈)+ 行 | F8 | 自动 | E-017/018/032 |
| R-096 | SSE / 协作 / 记忆通道断开与重连 | 网络抖动、睡眠唤醒 | 重连 5 次、自动重试 2 次,**零 UI** | 什么都看不到,然后内容不更新 | — | 网络或上游 | 横(「连接中断,重连中 N/5」= 组件 22) | F8;失败给「重新连接」 | 自动 | W-001/003/028/029 |
| R-097 | 企业网络 / 透明代理(飞连、CorpLink):设备授权 502 `Invalid IP address: undefined`、vela api-proxy 30s 超时 | 公司网络 | 文本 | 「Sign-in failed.」/「Task failed」 | — | 网络或上游 | 卡(「企业网络代理」指引) | F8 | 需用户 | A-069/070、E |
| R-098 | AMR 登录流程各阶段失败(设备授权创建 502、浏览器打不开、超时 5min、取消、已消费、凭据保存失败、并发登录) | 登录 | CLI `error_kind` 8 种只进分析;web 统一「Sign-in failed.」;`userCode` 不显示 | 「Sign-in failed.」 | — | 需要登录 | 行(登录 pill 按 error_kind 分句) | F4 | 一步 | A-006~013、S3-③12 |
| R-099 | 钱包 / 账单读取失败(401、5xx、8–10s 超时、24 字段严格校验、旧服务端) | 网关、旧 CLI | `AmrWalletSnapshotErrorCode`;余额显示 `—` | 「Balance temporarily unavailable」;发送门 fail-open | — | 覆盖不到 | 行(已有)| 自动 | 自动 | A-059~061 |
| R-100 | 团队成员停用 / 订阅过期 → **静默降档**;team_basic = free 规则 | 团队变动 | 无错误、无事件 | 模型突然锁了、额度变了,没有解释 | — | 覆盖不到 | 横(「你的套餐已变为 X,原因」) | F5 | 需外部 | A-064/065、S3-④7 |
| R-101 | 自动充值失败(payment_failed / requires_action / monthly_limit / risk_blocked…) | Stripe | `autoTopupFailureReason` 7 种 | 无专门 UI | — | 余额不足 | 横 / 弹 | F5 | 需外部 | A-063 |
| R-102 | 套餐 / 支付争议:月付点成年付、买了 Go 仍 0、退款无回复、「不能接 API」 | 购买流程、补发延迟 | 不是运行错误,但是**飞书第一大桶** | 用户去支付宝投诉 | **F-A 26、F-B 20** | 覆盖不到 | 购买确认弹 + 到账状态行 | F5 / F10 | 需外部 | F-A/B |
| R-103 | 强制登录后本地项目「消失」 | 登出 / 过期 | 产品决策(workspace 隔离) | 「我的项目没了」 | F-F | 覆盖不到 | 横(解释:登录后可见) | F4 | 一步 | F-F、W-031 |

## 5. 处理流程定义(候选,待产品拍板)

把上面 ~100 行的「建议后续」归并成 11 条流程。每条给:入口(哪些 R-xxx)、自动动作、用户动作、终态、埋点。

| 流程 | 入口 | 自动动作(不打扰用户) | 用户动作(卡 / 弹上的按钮) | 终态 | 埋点 |
|---|---|---|---|---|---|
| **F0 发送前拦截** | R-006/007/008/009/010/011/012/013/014/015/030/061 | 发送前跑探测:agent 装没装、登没登、key 形状、余额、模型是否在套餐、并发槽位、附件大小 | 按原因直达修复入口(安装指引 / 登录 / 设置 / 充值 / 换模型 / 等待) | 不产生失败 run | `run_start_blocked{reason}`(已有,扩 reason) |
| **F1 静默自动重试(同 run)** | R-025/029/048/051/056/057/059/073/070(exit_nonzero) | 现有 `decideSafeRunRetry`:首 token 前、无可见输出、白名单类别、≤1 次、退避 ≤8s;**待决**:是否放宽到 2 次、是否对 429 用 retry-after | 无;失败后进 F3 | 成功 / 转 F3 | `run_retry_attempted/finished`(已有) |
| **F2 从失败处续跑(Continue)** | R-051/052/056/057/077/081 | 已提交工具 / 产物 + runtime 支持 resume 时标 `resumable`;post-tool 原生续跑 1 次 | 「继续运行」(已有) | 续跑成功 / 转 F3 | `run_resume_attempted{reason}`(已有) |
| **F3 人工重试(新 run)** | 所有可重试行的兜底 | — | 「重试」 | 新 run | `chat_error_retry` |
| **F4 登录 / 授权** | R-004/005/007/008/024/040/075/098/103 | AMR:行内设备授权,成功后自动重试(已有) | AMR「授权并重试」;本地 CLI「在终端登录」(Antigravity 已有);BYOK「打开设置改 key」;工作区「切换 / 重新登录」 | 自动重试 | `chat_error_login{agent}` |
| **F5 付费 / 套餐** | R-010/011/012/013/043/044/045/062/063/100/101/102 | 余额更新后自动续跑(已有 watchingWallet);充值到账状态 | 个人:充值 / 升级;团队成员:「找管理员」+ 复制链接;管理员:加席位 / 充值;BYOK:去供应商充值 / 换 key | 续跑 | `chat_error_upgrade/recharge`(已有) |
| **F6 换模型** | R-011/026/042/050/055 | 不静默换(**待决**:set_model 回落 default 今天是静默的) | 「更换模型」直接打开选择器(今天只有文字说「去 Settings」) | 新 run | `chat_error_switch_model` |
| **F7 精简输入** | R-014/021/030/049/058 | AMR 清 session(已有) | 「新建对话」/「移除附件」/「压缩上下文」 | 新 run | `chat_error_reduce_context` |
| **F8 环境修复** | R-001/002/003/006/020/022/023/027/054/083/084/090~097 | 能自愈的自愈(重连、重挂、重启 daemon) | 「安装 / 升级 CLI」「重启客户端」「打开设置(代理 / 证书)」「重新加载预览」「导出日志」 | 自愈 / 用户修 | `client_recovery{kind}` |
| **F9 等待** | R-012/046/047/048 | 有 reset 时间的:倒计时到点自动重试(**待决**);没有的:退避 | 「稍后重试」(有倒计时) | 自动重试 | `chat_error_wait{seconds}` |
| **F10 反馈 / 支持** | R-023/031/053/064/070/071/090/102 | 自动附带诊断包 | 「导出日志」「联系支持」(已有全局弹窗)「申诉」 | 工单 | `support_opened{from}` |

每张报错卡 = 一个 R-id → 一个主流程 + 至多一个次流程;「重试」只在流程说「可重试」的行上出现(旧 PRD 9/12 类都给 Retry 的问题由此解决)。

## 6. 决策记录

| ID | 决定 | 依据 | 落地 |
|---|---|---|---|
| D-01 | **告警可继续的不弹窗,只有卡片;余额不足再弹窗。** 余额告警档(`gate.kind === 'soft'`)撤掉 `AmrLowBalanceDialog`,改成流水里的 `UpgradeCard`,**不再挡住那一次发送**(D4 不阻塞);拦截档(`gate.kind === 'hard'`,`reason: 'insufficient'`)弹窗保留,**同时**也出卡片 | 产品 2026-08-26 | `ProjectView.tsx` 余额门分支 + `ChatPane` 的 `amrBalanceCardUsd` |
| D-02 | **所有报错卡都给〔导出日志〕。** 不挑失败类型 —— 原话「好多都应该得有导出日志这个按钮」。同一排还常驻〔联系支持〕(交付稿第 78 格的前两颗次级) | 产品 2026-08-26 | `ChatPane` 报错卡动作行 + `chat/ExportLogsAction.tsx`(复用 `useDiagnosticsExport`) |
| D-03 | **`AMR_MODEL_UNAVAILABLE` 不给重试,给「换个模型」。** 模型已下线 / 不在套餐里,重试必然同样结果(设计原则四:重试只在有用时出现)。落点是设置 → 执行(composer 齿轮通向的同一个模型选择面板) | 产品 2026-08-26 | `runtime/amr-guidance.ts` 新增 `primaryAction: 'switch-model'` |
| D-04 | **「已手动暂停任务」只认 `user_stop`。** 其余三种取消(`project_cleanup` / `daemon_shutdown` / `unknown`)与缺字段一律不显示 —— 该给它们哪句话属于新文案语义,**待产品定**。剩余步数为 0 时这一行也不出 | 产品 2026-08-26 + `chat-panel-edge-audit.md` §4 R8 | `ChatMessage.cancelOrigin` 落 `messages.cancel_origin` 列;`ChatPane` 渲染 `chat/PauseLine.tsx` |

> **仍未决(与 D-01 相邻)**:R-010 那条「付费档余额 0 = 不限量,**不拦**」属于**判定**层(`runtime/amr-balance-gate.ts` 今天仍在 `<= $0` 硬拦),D-01 只改了判定结果的**呈现**,没有动判定。要不要让付费档的 0 余额直接放行,仍是 Q-05。

### 6.X 2026-08-26 用户逐条裁决(对《报错体验设计方案》的 32 个场景)

> 口径:「**别做**」= **保持跟 `main` 一样,不要私自乱实现**。不是「以后再说」,是这一轮不许动。

| 场景 | 裁决 | 备注 |
|---|---|---|
| **S03** 账号登录过期 | **不要顶部横幅** —— 那属于比较大的视觉变更。**放在 run 里**(会话中的卡) | 现状更糟:代码是 `replace:true` 强制跳走且退不回来,方向与设计相反 |
| **S05** BYOK key 没配好 | 改成**会话中的卡片** | 现状:preflight 拦住了,但文案是硬编码英文常量、卡上无按钮 |
| **S06** 余额不够 / 为 0 | **不按文档写的来**,按用户此前口述的那套:**不同身份 × 不同订阅 → 不同的卡片与不同的 upgrade 点击行为** | 见本仓关于四种角色分支的记录;⚠️ 现状有**死胡同 bug**,见下 |
| (并发满那张:「同时最多跑 {N} 个任务」) | 也改成**会话中的卡片** | 属 S07 的一支 |
| **S15** Cloud 余额用完 | **按设计稿样式实现** | 团队成员那条钱路在 main 上一行未改,是这条的主要缺口 |
| **S16** 套餐变了 | **不要顶部横幅**,改成**运行中的卡片**;**不在运行中就先不弹** | |
| **S24** 做了一半 | **别做**(保持 main) | |
| **S25** 预览白屏 | **别做**(保持 main) | 注:审计判它是唯一「什么都没有」且仍在涨的 P0,但用户裁定不做 |
| **S26** 导出 / 保存 / 评论失败 | 用户在问**现在的失败态是怎样的** —— 待答后再定 | |
| **S28** 本地服务断开 / 版本不匹配 | **复用设计稿里「网络连接失败」那个样式**,只把文案改成「本地服务断开了,…」 | |
| **S29** 网络中断 / 正在重连 | 用**设计稿现有的设计**,位置在**会话中最后一行**(交付稿第 82–84 格「重连」那三格:重连中 N/M → 重连失败 + 〔重新连接〕) | |
| **S31** 更新失败 | **别做**(保持 main) | |
| **S32** Cloud 登录失败 | **别做**(保持 main) | |

**未在本轮点名的场景**(S01/S02/S04/S07 其余支/S08–S14/S17–S23/S27/S30)仍按 §7 待决,
**不要因为「审计说缺」就自行开工** —— 这一轮只做上表点名且未标「别做」的那几条。

### 6.Z 报错卡的形态与主按钮规则(2026-08-26 用户裁决)

**卡永远是同一张**(交付稿第 78 格):白卡、红只在标题那一行、一两句说明、一排动作。
**次级动作固定两颗且常驻**:〔联系支持〕(开第 80 格那个全局弹窗)、〔**导出日志**〕。
用户原话:「好多都应该得有导出日志这个按钮」—— 那就不挑,**全给**。
三块料都已存在,只是没接到卡上:`ExportDiagnosticsButton.tsx`(今天挂在设置→关于)、
`SupportDialog.tsx`(本轮已抽出)、`switchToAlternative()`(今天只给两个 detail 用)。

**主按钮 = 一条优先级阶梯,从上往下第一个命中的就是它。**
一套覆盖两种环境:已经在 Cloud 上时第 3 档天然不触发,自动退化成 Cloud 的答案,不用维护两张表。

| 档 | 条件 | 主按钮 |
|---|---|---|
| 1 | **我们有能直接解决它的动作** | 去设置改 key(S05)· **换个模型**(模型不存在 / 已下线)· 新建对话 / 删附件(S20)· 授权并重试(S04)· 去充值 / 升级(S06、S15) |
| 2 | **这次失败是暂时性的** | 从失败处重试;被限速则是「稍后重试 0:42(到点自动)」 |
| 3 | **本地这条路根本走不通** | **切换到 Cloud** |
| 4 | 上面都没有 —— 重试无效、我们也没别的出路 | **联系支持**(从次级**提为主**) |

**第 3 档具体是哪几种,说死**:没装(S01)、没登录 / 过期(S02)、CPU 不支持、
本地环境跑不动这一步(稿子第 79 格「这一步需要云端算力」)、**供应商额度用完(S08)**。
共同点是**我们给不了一键解决** —— 装 CLI、终端登录、换 CPU 都不在我们手里。
次级仍给登录命令 / 安装指引,想留在本地的人照样有路。

**为什么不是「一律劝切 Cloud」**(用户原话):付费用 CLI/BYOK 的人遇到「换个模型就好」的问题,
主按钮却劝他再买一份 Cloud,那是把营销放在解决问题前面。所以第 1 档永远优先。

**第 4 档正好兜住原则四**:额度用完、账号被封、CPU 不支持这三类拿不到重试,
拿到的是真能解决问题的按钮;而〔联系支持〕本来就是常驻次级,只是在没别的出路时**升格**。

#### 两条点名裁决

| | 裁决 | 现状 |
|---|---|---|
| **S08** 供应商额度用完 | 落**第 3 档 → 切换到 Cloud** | 已是 `switchToAlternative` 且刻意不给重试,方向对;缺的是常驻的〔导出日志〕〔联系支持〕两颗次级 |
| **已在 Cloud + 模型不可用 / 已下线** | **换个模型**(第 1 档),**不是**升级套餐 | ⚠️ 现在是 `AMR_MODEL_UNAVAILABLE → retryWithGuidance`,**给的是重试** —— 模型下线了重试必然同样结果,**这是一条现存的原则四违规** |

### 6.T 主按钮阶梯 ↔ §5 流程表的对应(别让两份规格各说各话)

§6.Z 那条「主按钮优先级阶梯」不是新发明,它和 §5 的 F0–F10 是**同一件事的两种写法**。
对应关系写死在这里,以后改任一边都要同步:

| 阶梯 | 对应流程 |
|---|---|
| 第 1 档 我们有能直接解决它的动作 | **F4** 登录/授权 · **F5** 付费/套餐 · **F6** 换模型 · **F7** 精简输入 · **F8** 环境修复 |
| 第 2 档 暂时性 | **F1** 静默自动重试(同 run)· **F2** 从失败处续跑 · **F3** 人工重试(新 run)· **F9** 等待(有倒计时) |
| 第 3 档 本地这条路走不通 | **§5 表里没有** —— 这是阶梯新增的一档 |
| 第 4 档 都没有 | **F10** 反馈 / 支持(〔联系支持〕从次级提为主) |

§5 表末那句和原则四是同一条,保留为准绳:
> 每张报错卡 = 一个 R-id → 一个主流程 + 至多一个次流程;
> 「重试」只在流程说「可重试」的行上出现。

**⚠️ 已知冲突,尚未处置**:`resumable` 被**硬写成 `false`** 在两处 ——
`apps/daemon/src/runtimes/runs.ts:744`(daemon 重启,对应 S28)与
`apps/web/src/components/ProjectView.tsx:12606`(跑完没生成文件,对应 S23)。
于是 F2 的〔继续运行〕在**最需要它的两个场景**被关死。按钮实现本身是好的
(`ChatPane.tsx:3014-3033`),缺的是判定。不在本轮点名裁决内,**先不动**。

### 6.V 余额不足:身份 × 订阅的四种分支(2026-08-26 用户裁决,已落表)

**「Max」= 个人 Max 和团队 Max 都算**(用户修正)。

**卡片永远保留**,四组的差别只在「同时唤起什么弹窗、点了跳哪」。
这张卡就是交付稿**组件 18** 的 #75(额度不足 · < 5 美金)/ #76(额度耗尽 · = 0 美金)——
稿子在这一族的副标题里本来就写着「**按身份唤起不同弹窗**」,#77 那格的状态名更直接:
「点 Upgrade 后 · 跳 Web 端,**按身份分四种弹窗**」。

| 身份 × 订阅 | 卡片 | 弹窗 | 点击行为 |
|---|---|---|---|
| **非 Max · owner** | 保留 | **现有的**余额不足升级弹窗 | 卡和弹窗都跳**当前环境 console 的套餐页** `?billing=plan`(2026-09-06 T54 起;原为公开 Pricing) |
| **非 Max · 非 owner** | 保留 | **新弹窗**:提示告知 owner 去充值(文案由研发拟,产品复核) | —— |
| **Max · owner** | 保留 | **和「非 Max · owner」同一张,文案一字不差**(2026-09-06 T58 起;原记「——」不弹窗) | **跳 vela web 端** `?billing=auto-recharge`,**自动唤起「团队自动充值」弹窗**(触发阈值 / 充值金额 / 每月上限那张)。vela #1900 已合并,该深链现在真的弹得出来 |
| **Max · 非 owner** | 保留 | 同「非 Max · 非 owner」:提示告知 owner 去充值 | —— |

**前置缺口(必须先补,否则这四组无处安放)**:`components/chat/UpgradeCard.tsx` **已经画出来了但产品零消费者** ——
今天线上跑的仍是两个居中弹窗(`AmrBalanceDialog`),而稿子要的是**流水里的一张卡、不挡发送**。
先接线,再挂分支。

**与已定口径的关系(2026-09-06 已变)**:「付费档余额 0 = 不限量,不拦」(§3 / R-010 / OD #7190)
**已被 T55 推翻** —— 产品口述「矩阵管个人工作区,所以这是 bug,要修」,个人版付费档 $0 现在也硬拦。
让位判据改成「**档次读不出来才让位**」(`amrPlanTierUnreadable`),不再是「有套餐就让位」。
`cf00c80bd1` 的另一半(读不出来 → 放行,由远程兜底)原样保住。
⚠️ 代价:个人版 Max 用户 $0 时不能再靠套餐额度直接开跑。**只有真机能确认生产影响。**

#### 已实现(`feat/balance-role-branches`)

判据落在 `apps/web/src/runtime/amr-balance-branch.ts`,是一支纯函数,不认识钱包:

| 轴 | 字段 | 出处 |
|---|---|---|
| 身份 | `permissions.canManageBilling` | `packages/contracts/src/api/collab.ts:260`(声明)/ `:481`(`readable && role === 'owner'`) |
| 订阅 | `resolvePlanTier({ billing, context, accountPlan })` | `apps/web/src/collab/team-plan.ts:78` |
| 「Max」 | `isMaxPlanTier` —— 段匹配 `max`,个人 `max` 与 `team_max` 都命中 | `apps/web/src/collab/team-plan.ts` |

两条刻意的兜底:**没有工作区上下文**按 owner(和 `workspaceUpgradeUrl` 的 profile 兜底一致);
**个人工作区**一律按 owner(那里没有第二个人可以找,推去「联系所有者」只是换一个死胡同)。
**档次读不出来按非 Max**,也就是保持今天的行为。

呈现:`ProjectView` 在拦截发生的那一刻把分支结论记进 `amrBalanceGateBlock.dialog`
(`'upgrade' | 'ask_owner' | null`),`EntryShell`(首页)同一套判据 —— 只是首页**没有那张卡**
兜底,所以 `null` 在首页退回 `'upgrade'`,否则拦住了却什么都不显示。

⚠️ **「自动唤起团队自动充值弹窗」需 vela 侧确认。** 客户端已经按
`AMR_CONSOLE_UPGRADE_INTENT` 的先例发出 `billing=auto-recharge`
(`apps/web/src/runtime/amr-guidance.ts` 的 `AMR_CONSOLE_AUTO_RECHARGE_INTENT`),
但 B 的 dashboard 今天**只认 `checkout` 和 `plan`**
(`vela apps/web/src/routes/team-dashboard.tsx` 的深链 effect,`origin/main` 同样如此),
自动充值面板只能页内点开。所以这条链接目前把所有者带到了**管这件事的那一页**,
但不会替他把弹窗打开 —— 需要 B 加一个 handler。

### 6.U ⚠️「画出来了,没接线」审计(2026-08-26)

陈列页**直接 import 组件**,而产品**根本不渲染它** —— 于是陈列页全绿、真实客户端照旧。
这一页结构上照不出这件事。全量核过 `apps/web/src/components/chat/*.tsx`:

| 组件 | 对应稿子 | 产品今天是什么 |
|---|---|---|
| **UpgradeCard** | #75 / #76 | 两个居中弹窗(`AmrBalanceDialog`),会挡发送 |
| **SupportDialog** | #80 联系支持(飞书社群 / Discord) | **没有这个入口** |
| **support-brand-icons** | #80 里那两枚品牌图标 | 跟着一起没接 |
| **PauseLine** | 暂停 / 停止那一行 | 走另一条老路径 |
| **AudioArtifact** | #43 / #44 音频产物 | 被**数据**卡着:`artifactCardKind` 对 `.mp3` 返回 null,契约里也没有波形与时长 —— 不是接线能解决的 |

已接上的:`ExecutionShell` / `Reconnect` / `PlanPill` / `ChatRoot` / `RunErrorCard` / `QuoteBar` / `QuotedRefs`。

**两条正卡在当前需求上**:①四组身份分支要的「保留卡片」就是 `UpgradeCard`;
②报错卡三槽里常驻的〔联系支持〕开的就是 `SupportDialog`。**都要先接线。**

### 6.W ⚠️ 欠账:身份 × 订阅的余额分支,结论没落表也没实现

2026-08-26 用户问「max + 非 owner 之类的组合,需要有不同的余额不足弹窗或点击 upgrade 行为,
还记得结论吗?做了吗?」—— **诚实答案:讨论过,结论没写进规格,也没实现。**

当时读过飞书文档第四节并逐条问过(有 team max 也有个人 max / 点升级现在是跳 pricing /
owner 弹窗先用通用话术 / 告警可继续的不弹窗只出卡片、余额不足才弹窗……),
用户当时的指令是「先深入理解不要动手」,之后转去做聊天面板重构,**这批答复没有落成文档**。

仓内目前只有一条相关的已定口径:「**付费档余额 0 = 不限量,不拦**」
(`error-ux-design.md` §3 / 本文 R-010 / Q-05 / OD #7190 已合)。

**代价已经在线上**:见 §6.Y —— 没有账单权限的团队成员余额耗尽时,弹窗上只有一颗「暂不需要」。
那正是「身份 × 订阅没有分支」的直接后果。

**下一步**:请用户复述或指认那份飞书文档的第四节结论,落成本节的分支表之后再动手。
**在落表之前不要实现** —— 这是产品口径,不是工程可以推断的东西。

### 6.Y 审计照出的严重缺陷(不在 32 条范围内,建议与 S06 一起修)

**团队普通成员的余额弹窗是死胡同。** `AmrBalanceDialog.tsx:105-109` 取 `workspaceUpgradeUrl`
→ `EntryNavRail.tsx:404` 对没有 `canManageBilling` 的成员返回 `null` → 弹窗那个三元落到 `null`。
结果:没有账单权限的团队成员余额耗尽时,弹窗上**只有一颗「暂不需要」**,没有任何前进的路,
任务被 park 在队列里,他既不能升级、也没有「通知管理员」、也看不到解释。
这比设计描述的「被带到个人充值页」更糟 —— 那至少还有个地方可点。

**已修(`feat/balance-role-branches`)**:这一档不再渲染 `AmrBalanceDialog`,改成
`components/chat/AmrOwnerTopUpDialog.tsx` —— 它不外跳(账单动作 B 会拒),而是把一句
可以直接发给所有者的话交到成员手上,一键复制。聊天流水和首页两条路都换掉了。
文案由研发拟,**待产品复核**;「找管理员 + 复制请求」取自 §7 Q-04 已列的候选。

**复核结果(2026-09-06,产品口述;`chat-panel-decisions-sheet.md` T56 / T57)**:
文案改用产品文档「四、升级情况」的正式文案(标题「请联系团队所有者充值」/ 正文
「当前仅团队所有者可以为团队充值,请联系「{Owner 名称}」完成充值后再继续使用。」/
按钮「知道了」),并**删掉「复制请求」那颗主按钮及其复制逻辑** —— 产品原话
「不要保留,严格按产品稿,不要私自发挥」。
⚠️ 于是**这一档回到单出口**:上面那句「把该说的话交到成员手上」不再成立,弹窗只
说明该找谁。产品知情。Owner 名字目前拿不到(契约里只有项目级的
`CollabProject.ownerDisplayName`,且它自称 STUB),所以实际走的是产品另批的降级
变体「…请联系团队所有者完成充值后再继续使用。」,后端补上名字来源后自动切回带名
字那句。

## 6.Z R-051 已止血,但**未对齐设计稿 S10**(2026-09-07,产品拍板「先这样」)

**已做(进 `0.21.4-beta.1`)**:`upstream_5xx` / `provider_high_demand` 补进
`AGENT_AGNOSTIC_DETAIL_FAILURE_UI`,复用已有 key
`chat.runError.title.upstreamUnavailable` / `chat.runError.upstreamUnavailableMessage`
(`fatal_rpc_error` 那档在用同一句,19 个 locale 现成)。**解决的是「把 JSON 原文摊给
用户」这个 P0**,不是对齐设计稿。

**现在显示**(zh-CN 逐字):
> 服务暂时不可用
> 模型服务暂时不可用,通常是上游波动或网络/代理问题。请稍后重试。
> 〔重试〕

**设计稿 S10 要的**(`docs/design/run-errors/error-ux-design.md`,逐字):
> {供应商} 暂时不可用 —— 服务商那边不稳定,不是你的问题。已自动重试过,稍后再试通常就好。
> 〔重试 | 更换模型〕

**差四处 + 一个中间态**:

| | 设计稿 | 现状 |
|---|---|---|
| 供应商名 | `{供应商}` 插值 | 无 —— **需要先确定数据来源**(daemon 侧有没有把 provider 名送到前端) |
| 安抚句 | 「不是你的问题」 | 无 |
| 已重试的交代 | 「已自动重试过」 | 无 —— 而且这是**对行为的声明**,得先确认真的重试过才能写 |
| 第二颗按钮 | 〔更换模型〕 | 无 —— 要接模型切换器,不只是文案 |
| 中间态 | 自动重试期间显示「正在重试 1/2」,**2 次都失败后才出卡** | 今天自动重试 1 次,失败即出卡 |

**为什么没有一次做完**(产品 2026-09-07 拍板,选了「先止住泄漏」):完整对齐要新增
i18n key + 19 个 locale + 供应商名的数据通路 + 一颗接模型切换器的按钮 + 重试计数的中间态,
体量远超「别摊 JSON 给用户」这件事。

⚠️ **这是对设计稿的有意偏离,记录在此以免后来人以为是漏做。** 按仓库规矩不另开 issue,
由研发自己跟进。

## 7. 待决(产品 / 设计 / 研发)

| ID | 问题 | 候选 | 决定人 | 影响行 |
|---|---|---|---|---|
| Q-01 | 报错卡的形态分级:是否接受「拦 / 卡 / 横 / 吐 / 弹 / 静 / 行」七种,还是坚持旧 PRD「一张卡承接所有」 | 七种(本文)/ 一张卡 + 发送前拦截 | 设计 + 产品 | 全部 |
| Q-02 | 「重试」按钮的出现规则:只给可重试行,还是沿用旧 PRD 每类都给 | 按流程表 / 都给 | 产品 | L2–L3 |
| Q-03 | 旧 PRD 的「推荐 Open Design 智能体」引导句:在 BYOK / 本地 CLI 的哪些失败上出现;hard_quota 对 AMR 自己也出切换卡(今天的 bug)要不要修 | 只在 F4/F5 类 / 全部非 AMR / 去掉 | 产品 | R-040/044 |
| Q-04 | 团队工作区的余额不足:成员(无 canManageBilling)该看到什么、点去哪 | 「找管理员」+ 复制请求 / 仍跳个人充值页 | 产品 | R-043/045/010 |
| Q-05 | 付费档余额 0 = 「无限」:余额门、徽标、失败卡三处口径是否统一 | 按 coding-plan 判定 / 按余额 | 产品 + 后端 | R-010/047 |
| Q-06 | exit≠0 但写了产物算成功(D-072):保持 / 成功 + 行内警告 / 失败 | 三选一 | 产品 | R-076 |
| Q-07 | set_model 回落 default 模型静默换(A-034):提示 / 拦下 / 保持 | 三选一 | 产品 | R-011 |
| Q-08 | 团队成员停用 / 订阅过期的静默降档(A-064)要不要解释面 | 横幅 / 不做 | 产品 | R-100 |
| Q-09 | team_basic 成员只拿 free allowlist 模型是否产品意图 | 是 / 否 | 产品 + 后端 | R-011 |
| Q-10 | 等待类错误(429 / 并发 / 滚动窗)到点是否自动重试 | 自动 / 只倒计时 | 产品 | R-012/046/047/048 |
| Q-11 | 同 run 自动重试放宽:次数 1→2?429 读 retry-after?stream_error 默认可重试是否合理 | — | 研发 + 产品 | F1 |
| Q-12 | 封号 `account_suspended`:不给 Retry,只给联系支持? | 是 / 否 | 产品 | R-064 |
| Q-13 | 连接类静默状态(SSE 重连、协作通道断开)要不要上组件 22「正在重新连接 N/5」横幅 | 上 / 不上 | 设计 + 产品 | R-096 |
| Q-14 | daemon 不可达 5 种文案统一成一条全局横幅 | 是 / 否 | 设计 | R-001 |
| Q-15 | 打包启动失败要不要用户可见的「启动失败页」(原因 + 导出日志 + 重装) | 是 / 否 | 产品 + 设计 | R-090 |
| Q-16 | 预览白屏:0.20.x 陡升先判噪音还是回归;预览区内是否给「重新加载」 | — | 研发先判,再设计 | R-083 |
| Q-17 | BYOK 直连路径(7 个 proxy 路由 + byok-tools)删还是留 | 删 / 留 | 研发 | S4-④1 |
| Q-18 | 内容审核 / 拒答要不要单独分类与文案 | 要 / 不要 | 产品 | R-058 |
| Q-19 | CLI 是否把 link 的 `code` 透进 ACP `error.data`(目录阶段今天没有)—— R-024 整行的前置 | 改 CLI / 不改 | 后端(vela) | R-024 |
| Q-20 | 契约清理:`RunFailureAction` 5 值 vs daemon 9 值;7 个不在 `API_ERROR_CODES` 的 code;两个死 i18n 键;`InsufficientCreditsDialog` 死代码 | 修契约 / 保持 | 研发 | — |
| Q-21 | 「报错源码」折叠区(旧 PRD 第④区)默认一行:stderr 为空的失败(今天不发 error 帧)显示什么 | 「无诊断信息」+ 导出日志 / 隐藏 | 设计 | R-070 |
| Q-22 | 登录 pill 是否按 CLI `error_kind` 分句(超时 / 拒绝 / 浏览器打不开 / 保存失败),`userCode` 要不要显示 | 分句 / 统一 | 设计 | R-098 |
| Q-23 | 「已取消」要不要给重试 | 给 / 不给 | 产品 | R-078 |
| Q-24 | 套餐 / 支付争议(飞书第一大桶)是否纳入本清单的流程 F5(购买确认弹、到账状态行),还是另立项目 | 纳入 / 另立 | 产品 | R-102 |
| Q-25 | 优先级:先做哪一批 —— 按 PostHog「能修 × 触达设备」:hard_quota 给动作(2.3 万次无按钮)> 连接类静默 > 启动失败页 > BYOK 文案错位 > 预览白屏 | 本文建议顺序 / 其它 | 产品 | — |

## 8. 踩坑

- 飞书旧 PRD 的 38,000 样本没写时间窗与口径(是 run_finished 的 failureCategory 还是别的),引用时要标「旧口径」。
