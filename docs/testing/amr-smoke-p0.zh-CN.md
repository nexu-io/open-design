# AMR P0 冒烟清单

## 说明

本文档用于从完整 AMR 功能回归集中抽取最关键的 `P0 / 必测` 项，适合：

- 提测前快速冒烟
- 每日回归
- 发布前首轮验证

执行建议：

- 优先用真实环境跑登录、对话、余额、钱包相关链路
- 若真实环境不可用，可先用 fake / stub 环境完成基础 UI 状态验证
- 结果建议记录为：`通过 / 失败 / 阻塞 / 未执行`

完整回归文档见：

- [amr-functional-test-cases.zh-CN.md](/Users/mac/open-design/open-design-amr-runtime-acp/docs/testing/amr-functional-test-cases.zh-CN.md)

## P0 冒烟用例

| ID | 模块 | 关键验证点 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| AMR-001 | Runtime 发现 | 未安装/未配置 `vela` 时，AMR 不应伪装成可用 |  |  |
| AMR-002 | Runtime 发现 | 已正确配置 `VELA_BIN` 或真实 `vela` 后，`amr.available=true` |  |  |
| AMR-007 | 登录动作 | 从 Open Design 触发登录后，能正确进入网页登录/授权流程 |  |  |
| AMR-008 | 登录完成 | 在网页完成授权后，Open Design 能自动收敛为已登录 |  |  |
| AMR-010 | 登录并发 | 重复点击登录不会发起多个并发登录 |  |  |
| AMR-011 | 登出 | Open Design 内 `Sign out` 后，本地 AMR 状态立即变未登录 |  |  |
| AMR-011E | 登出后继续发起 AMR 聊天 | 登出后不能继续正常调用 AMR 模型 |  |  |
| AMR-011G | 运行中请求期间登出 | 登出时已有 run 不应导致状态错乱、挂死或无限继续请求 |  |  |
| AMR-021 | Onboarding | AMR 可用时，`AMR Cloud` 作为默认推荐入口展示 |  |  |
| AMR-024 | Onboarding | 从 onboarding 发起登录并完成网页授权后，可自动继续下一步 |  |  |
| AMR-026 | Onboarding 回退 | AMR 不可用时不会强推 AMR，Local CLI 仍可正常使用 |  |  |
| AMR-032 | Chat Run | 已登录且可用时，AMR 聊天主链路能完整跑通 |  |  |
| AMR-033 | 默认模型替换 | `default` 模型会被替换为具体可用模型后再发请求 |  |  |
| AMR-036 | ACP 异常 | `session/new` 失败时，run 会明确失败，不会挂起 |  |  |
| AMR-038 | ACP 异常 | `session/prompt` 失败时，run 会明确失败并正常结束 |  |  |
| AMR-039 | ACP 超时 | 静默无响应时会超时失败，而不是无限 loading |  |  |
| AMR-045 | 钱包入口 | 从 Open Design 能正确打开独立钱包页 |  |  |
| AMR-047 | 固定金额充值 | 固定金额充值能正确进入 Stripe |  |  |
| AMR-049 | Stripe 成功回跳 | 支付成功后，成功提示、余额、充值记录三者一致 |  |  |
| AMR-049A | Stripe 防重复点击 | `Continue to Stripe` 快速重复点击只会创建一次有效支付流程 |  |  |
| AMR-049B | Stripe 创建失败 | 创建 checkout session 失败时，错误可见且按钮可恢复 |  |  |
| AMR-052 | 余额不足聊天 | 余额不足时聊天应明确失败，不能误判为未登录或无限重试 |  |  |
| AMR-052A | 余额不足 run 收敛 | 余额不足时当前 run 会结束失败，不会一直处于运行中 |  |  |
| AMR-052B | 余额不足不污染登录态 | 余额不足后，AMR 仍显示已登录，不应被误判为未登录 |  |  |
| AMR-052D | 对话区失败提示 | 余额不足时，对话区应有明确失败消息或系统提示 |  |  |
| AMR-053 | 余额不足引导 | 余额不足后能看到充值、切 agent 等下一步引导 |  |  |
| AMR-054A | 切到其他 CLI | AMR 余额不足后切到其他 CLI，请求仍可正常继续 |  |  |
| AMR-056A | 登出后不再扣费 | AMR 登出后再发新请求，不应新增钱包扣费 |  |  |
| AMR-056B | 运行中登出后的扣费 | 运行中登出后，扣费结果与产品预期一致，不重复扣费 |  |  |
| AMR-056C | 登出后账实一致 | 登出后钱包余额与消费流水保持一致 |  |  |
| AMR-065A | 网页切账号保持旧账号 | 钱包页切到新账号后，Open Design 默认仍保持旧账号 |  |  |
| AMR-065C | 显式重登后切新账号 | 只有在 Open Design 内显式重新登录后，客户端才切到新账号 |  |  |
| AMR-065E | token 失效收敛 | 本地显示已登录但 token 失效时，后续请求会收敛成重登或明确错误 |  |  |
| AMR-TASK-001 | 定时任务余额不足 | 定时任务跑到 AMR 且余额不足时，会明确失败结束，不会无限重试 |  |  |
| AMR-TASK-002 | 定时任务错误语义 | 定时任务余额不足的错误原因明确，不误报为未登录/未知错误 |  |  |
| AMR-TASK-003 | 充值恢复后任务恢复 | 充值后再次触发同类 AMR 定时任务，可恢复执行 |  |  |
| AMR-076 | 余额与流水对账 | 钱包余额、充值、消费流水在分页/筛选前后一致 |  |  |

## 推荐执行顺序

1. 基础可用性
   先跑 `AMR-001`、`AMR-002`
2. 登录与登出
   再跑 `AMR-007`、`AMR-008`、`AMR-010`、`AMR-011`
3. Onboarding 与主对话链路
   再跑 `AMR-021`、`AMR-024`、`AMR-026`、`AMR-032`、`AMR-033`
4. 钱包与 Stripe
   再跑 `AMR-045`、`AMR-047`、`AMR-049`、`AMR-049A`、`AMR-049B`
5. 余额不足与恢复
   再跑 `AMR-052`、`AMR-052A`、`AMR-052B`、`AMR-052D`、`AMR-053`、`AMR-054A`
6. 账号同步与定时任务
   最后跑 `AMR-056A`、`AMR-056B`、`AMR-056C`、`AMR-065A`、`AMR-065C`、`AMR-065E`、`AMR-TASK-001`、`AMR-TASK-002`、`AMR-TASK-003`、`AMR-076`

## 失败时建议附带的信息

- `/api/agents` 返回
- `/api/integrations/vela/status` 返回
- 当前 `OPEN_DESIGN_AMR_PROFILE`
- 当前使用的是 fake 还是真实 `vela`
- 相关 daemon 日志
- 相关 web / desktop 日志
- 钱包页截图、余额截图、交易记录截图
- 若涉及支付：`session_id`、失败请求响应、错误文案
