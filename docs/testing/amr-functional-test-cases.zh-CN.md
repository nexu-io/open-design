# AMR 功能测试用例

## 概述

本文档用于 `feat/amr-runtime-acp` 分支的 AMR（vela）运行时手工功能验证。

文档基于当前实现形态编写：

- AMR 以 daemon agent 的形式暴露，`agentId = amr`
- AMR 是否可用取决于是否能解析到可运行的 `vela` 二进制
- AMR 登录状态最终以 `~/.vela/config.json` 中当前 profile 的有效登录信息为准
- AMR 的 onboarding、Settings、inline switcher、chat run 都依赖 daemon 返回的 runtime 可用性和登录状态

适用于本地开发、QA 回归和发布前验证。

## 当前账号同步原则

基于当前产品形态，AMR 账号状态需要区分两层：

- `Open Design 客户端本地登录态`
  以本地 `~/.vela/config.json` 和当前 profile 的有效登录信息为准。
- `Vela 网页钱包登录态`
  以浏览器中的网页会话为准。

当前建议按以下原则测试与验收：

- Open Design 内点 `Sign out` 时，优先清理**本地 AMR 登录态**
- Vela 网页端点“退出登录”时，优先清理**网页钱包会话**
- 两者允许短暂不一致，但后续状态必须能正确收敛
- **网页端手动切换到新账号时，Open Design 默认保持旧账号，不应静默自动切号**
- 只有用户在 Open Design 内再次显式触发 `Sign in` 并完成网页登录后，客户端才应正式切到新账号

## 测试环境

### 环境 A：Fake Vela（推荐用于日常 UI 验证）

适用于验证入口展示、登录 UI、onboarding 流程、AMR 基本选择行为，不依赖真实 AMR 后端。

预期环境：

- `agentCliEnv.amr.VELA_BIN` 指向 `apps/daemon/tests/fixtures/fake-vela.mjs`
- `/api/agents` 返回 `amr.available = true`
- `/api/integrations/vela/status` 可通过 fake login 路由切换成已登录 / 未登录状态

### 环境 B：Real Vela（推荐用于发布前验证）

适用于验证真实 `vela` 安装、真实 AMR 账号登录、真实 chat run 行为。

预期环境：

- `vela` 已安装到 PATH，或已正确配置 `VELA_BIN`
- `vela login` 能在当前 profile 下成功
- `~/.vela/config.json` 中存在带 `runtimeKey` 的有效 profile

## 覆盖范围

- Runtime 可用性与发现
- AMR 登录 / 登出状态
- Open Design 会话与 AMR 会话的状态组合
- Onboarding 入口行为
- Settings / Execution 面板行为
- Inline Switcher 行为
- Chat Run 行为
- Profile 行为（`prod`、`test`、`local`）
- OAuth / 重新登录路径
- 计费网页与额度异常提示
- 异常与恢复流程

## QA 执行字段

建议 QA 执行时统一补这 4 列，便于冒烟、回归和发布前汇总：

- `优先级`
  建议使用 `P0 / P1 / P2`
- `是否必测`
  建议使用 `是 / 否`
- `测试结果`
  建议使用 `通过 / 失败 / 阻塞 / 未执行`
- `备注`
  记录环境、截图、日志、缺陷单号或额外观察

推荐分级：

- `P0`
  主链路必挂项。失败会直接影响 AMR 可用性、登录、聊天或计费恢复。
- `P1`
  高价值回归项。失败不一定完全阻塞主链路，但会明显影响体验或恢复能力。
- `P2`
  补充验证项。更偏边界、兼容性或细节一致性。

## QA 执行表模板

下面这张表可以直接复制给 QA 使用。

| ID | 模块 | 优先级 | 是否必测 | 前置条件 | 操作步骤 | 预期结果 | 测试结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 示例：AMR-001 | Runtime 发现 | P0 | 是 | PATH 中没有 `vela`，且未配置 `VELA_BIN` | 打开应用，查看 `/api/agents` 和执行器 UI | `amr` 存在但 `available=false`；AMR 不应作为可选可用入口展示 |  |  |

## 手工测试用例

| ID | 模块 | 前置条件 | 操作步骤 | 预期结果 |
| --- | --- | --- | --- | --- |
| AMR-001 | Runtime 发现 | PATH 中没有 `vela`，且未配置 `VELA_BIN` | 打开应用，查看 `/api/agents` 和执行器 UI | `amr` 存在但 `available=false`；AMR 不应作为可选可用入口展示 |
| AMR-002 | Runtime 发现 | `VELA_BIN` 指向可运行的 fake 或 real `vela` | 打开应用，查看 `/api/agents` | `amr.available=true`；模型列表存在；agent path 指向配置的二进制 |
| AMR-003 | Runtime 发现 | `VELA_BIN` 指向不存在文件 | 重启 daemon 或刷新 agents | `amr.available=false`；应用不崩；AMR 入口安全降级 |
| AMR-004 | 登录状态 | `~/.vela/config.json` 中没有当前 AMR profile | 调用 `/api/integrations/vela/status` | 返回 `loggedIn=false`、正确 `profile`、`user=null` |
| AMR-005 | 登录状态 | profile 存在但缺少 `runtimeKey` | 调用 `/api/integrations/vela/status` | 返回 `loggedIn=false`；无 `runtimeKey` 不算已登录 |
| AMR-006 | 登录状态 | 当前 profile 存在有效 `runtimeKey` | 调用 `/api/integrations/vela/status` | 返回 `loggedIn=true`；用户信息可见；敏感字段不会泄露 |
| AMR-007 | 登录动作 | AMR 可用且当前未登录 | 从 Settings 或 onboarding 触发登录 | 后端返回 accepted；Vela CLI 拉起网页登录/授权流程；Open Design UI 进入 `Signing in…` |
| AMR-008 | 登录完成 | 已在 Vela 网页完成授权 | 返回 Open Design 并等待轮询完成 | UI 自动从 `Signing in…` 切换到已登录，无需手动刷新 |
| AMR-009 | 登录错误 | 强制 `vela login` 立即失败 | 触发登录 | UI 退出 `Signing in…`，显示 AMR 标识的错误反馈 |
| AMR-010 | 登录并发 | 已有一个 AMR login 进行中 | 快速触发两次登录 | 只允许一个登录请求生效；重复登录被阻止或安全忽略 |
| AMR-011 | 登出 | 当前 profile 已登录 | 触发 Sign out | 当前 AMR profile 的本地登录信息被移除；下一次 status 为 `loggedIn=false`；其他 profile 不受影响；不要求自动登出浏览器中的 Vela 网页会话 |
| AMR-011A | 会话组合 | Open Design 已登录/可用，AMR 已登录 | 仅执行 Open Design 侧退出当前 agent/切换 agent，不执行 AMR Sign out | Open Design 本地状态变化后，AMR 的 `~/.vela/config.json` 登录态保持不变；再次回到 AMR 时仍可读到已登录状态 |
| AMR-011B | 会话组合 | AMR 已登录 | 执行 AMR Sign out，然后关闭并重新打开 Open Design | Open Design 重启后 AMR 仍为未登录；不会自动恢复旧 AMR 会话 |
| AMR-011C | 会话组合 | AMR 已登录，Open Design 正常运行 | 执行 Open Design 退出并重新打开，但不删除 `~/.vela/config.json` | AMR 登录态仍保留；重新打开后 `/api/integrations/vela/status` 仍返回 `loggedIn=true` |
| AMR-011D | 重新网页登录 | AMR 已登出 | 重新触发 AMR 登录并在 Vela 网页完成授权 | AMR 可重新完成登录；状态能重新回到 `loggedIn=true` |
| AMR-011E | Open Design 登出后继续发起 AMR 聊天 | 当前已选 AMR，且刚在 Open Design 中执行 `Sign out` | 不切换 agent，直接发送一条 prompt 或继续使用当前 AMR 模型 | AMR 不应继续正常运行；应提示重新登录或明确不可用；不能静默成功，也不能无限 loading |
| AMR-011F | Open Design 登出后继续操作 AMR 模型入口 | 当前已选 AMR，且刚在 Open Design 中执行 `Sign out` | 保持在当前页面，继续查看 inline switcher / Settings 中的 AMR 模型与状态 | AMR 入口仍可见，但状态应为未登录；需要重新登录后才能继续实际使用模型 |
| AMR-011G | 运行中请求期间执行 Open Design 登出 | 当前已有一条 AMR chat run 正在进行中 | 在请求尚未结束时执行 Open Design 内的 `Sign out` | 需按产品预期明确验证：要么当前 run 允许自然结束但后续新请求被阻止，要么当前 run 被安全终止；无论哪种，都不能出现状态错乱、静默挂死或登出后继续无限发请求 |
| AMR-012 | Settings 可见性 | AMR 可用，onboarding 已完成 | 打开 Settings → Execution | AMR 作为可选 runtime/agent 出现在执行器设置中 |
| AMR-013 | Settings 可见性 | AMR 不可用 | 打开 Settings → Execution | AMR 不应以“可用入口”被强推，不应出现损坏/不可操作 CTA |
| AMR-014 | 登录 Pill 未登录态 | AMR 可用，未登录 | 打开 Settings | AMR login pill 显示未登录状态与 Sign in 按钮 |
| AMR-015 | 登录 Pill 已登录态 | AMR 可用，已登录 | 打开 Settings | AMR login pill 显示已登录状态、用户邮箱、Sign out 按钮 |
| AMR-016 | Profile Badge | 当前 profile 为 `test` | 打开 Settings | 显示 `TEST` badge |
| AMR-017 | Profile Badge | 当前 profile 为 `local` | 打开 Settings | 显示 `LOCAL` badge |
| AMR-018 | Profile Badge | 当前 profile 为 `prod` | 打开 Settings | 不显示调试型 profile badge |
| AMR-019 | Login Pill 事件隔离 | AMR card 嵌在 settings agent card 内 | 点击 Sign in / Sign out | 点击不会误触发父级 agent card 的选中逻辑 |
| AMR-020 | 登录恢复 | 登录轮询期间 `/status` 短暂失败 | 触发登录并制造一次失败的 status 请求 | UI 可恢复，后续轮询成功后能切换到已登录 |
| AMR-021 | Onboarding 默认推荐 | AMR 可用 | 在新配置下打开 onboarding | `AMR Cloud` 作为默认推荐 runtime 展示 |
| AMR-022 | Onboarding 未登录流 | AMR 可用但未登录 | 打开 onboarding，并保持选择 `AMR Cloud` | 用户会看到“需要登录后继续”的状态 |
| AMR-023 | Onboarding 已登录流 | AMR 可用且已登录 | 打开 onboarding 并继续 | 用户可直接继续，不再被 AMR 登录阻塞 |
| AMR-024 | Onboarding 登录完成 | AMR 可用，未登录 | 从 onboarding 发起登录，在 Vela 网页完成授权并返回 | 登录完成后 onboarding 自动进入下一步 |
| AMR-025 | Onboarding 未登录不可跳过 | AMR 可用，未登录 | 打开 onboarding 并保持选择 `AMR Cloud` | 不展示 Skip；Continue 被登录授权拦截，不能进入后续步骤或主页 |
| AMR-026 | Onboarding 回退 | AMR 不可用 | 打开 onboarding | 不应把 AMR Cloud 当作可用路径；Local CLI 仍可正常使用 |
| AMR-027 | Local CLI 隔离 | AMR 可用 | 在 onboarding 切到 Local coding agent 视图 | AMR 不应出现在 Local CLI agent 列表中 |
| AMR-028 | Inline Switcher 可见性 | AMR 可用 | 打开 inline model switcher | AMR 以 `AMR` 标签出现，而不是 `AMR (vela)` |
| AMR-029 | Inline Switcher 未登录态 | AMR 可用但未登录 | 打开 inline model switcher | 行内状态显示紧凑的登录提示，不暴露完整账号信息 |
| AMR-030 | Inline Switcher 已登录态 | AMR 可用且已登录 | 打开 inline model switcher | 行内显示紧凑的已登录状态；不残留未登录文案 |
| AMR-031 | Inline Switcher 模型列表 | AMR 可用 | 打开 inline switcher 并查看模型下拉 | 模型选项来自 AMR runtime 列表；标签稳定正确 |
| AMR-032 | Chat Run 成功链路 | AMR 可用且已登录；fake 或 real vela 可运行 | 选择 AMR 并发送一条 prompt | assistant message 正常完成；run 不挂起 |
| AMR-033 | 默认模型替换 | 已选 AMR；配置模型为 `default` | 发送 prompt | 后端会先把模型替换成具体 fallback model，再发 `session/prompt`；run 成功 |
| AMR-034 | 显式模型选择 | 已选 AMR；选择了具体 AMR 模型 | 发送 prompt | 选择的 AMR 模型被正确使用；run 成功 |
| AMR-035 | prompt-before-model 回归 | 强制 backend 跳过模型设置，或使用会拒绝 prompt-before-model 的 stub | 发送 prompt | run 失败并给出可理解错误；不会静默成功 |
| AMR-036 | `session/new` 失败 | 使用会强制 `session/new` error 的 stub/环境 | 发送 prompt | 用户可见 run 失败；daemon 不挂起 |
| AMR-037 | `session/set_model` 失败 | 使用会强制 `session/set_model` error 的 stub/环境 | 发送 prompt | 用户可见 run 失败；不会出现部分成功 |
| AMR-038 | `session/prompt` 失败 | 使用会强制 `session/prompt` error 的 stub/环境 | 发送 prompt | 用户可见 run 失败；run 能正常结束 |
| AMR-039 | 静默超时 | 使用能启动但不返回 ACP 响应的 stub | 发送 prompt | run 通过 timeout 失败，而不是无限挂住 |
| AMR-040 | Profile 优先级 | 设置 `OPEN_DESIGN_AMR_PROFILE=test` 且 `VELA_PROFILE=local` | 查看 status / login | AMR 应解析为 `test`；低优先级 `VELA_PROFILE` 不能覆盖 |
| AMR-041 | Profile 隔离 | `~/.vela/config.json` 中存在多个 profile | 对某一个 profile 执行 login / status / logout | 只影响当前解析到的 profile；其他 profile 保持不变 |
| AMR-042 | Packaged 环境传递 | 打包环境中配置了 AMR profile | 启动 packaged app 并检查 daemon env 行为 | `OPEN_DESIGN_AMR_PROFILE` 会传给 daemon |
| AMR-043 | Vela bundling | beta mac arm64 打包路径 | 使用 strict 模式打包 | Vela binary 被打进包资源；缺失时构建清晰失败 |
| AMR-044 | Non-strict packaging | 非 strict 平台或路径 | 在无可用 Vela binary 的情况下打包 | 构建不会仅因缺少 Vela 而失败 |
| AMR-044A | CLI 已安装但读取不到 | 机器上已安装 AMR CLI，但 PATH 未生效或 `VELA_BIN` 指向错误 | 打开 Open Design，查看 `/api/agents`、Settings、onboarding | `amr.available=false`；UI 不崩；应给出可操作排查方向，如检查 PATH、重新安装 CLI、显式配置 `VELA_BIN` |
| AMR-044B | CLI 重复安装 | 机器上已存在可运行的 AMR CLI | 再次执行钱包页中的安装命令或重复安装同版本 / 新版本 CLI | 不应导致 Open Design 崩溃或识别到多个冲突入口；重新打开后应仍只解析一个有效 CLI 路径，AMR 可正常使用 |
| AMR-045 | 钱包页入口 | AMR 已登录；产品已提供外部钱包页面入口 | 从 Open Design 中点击余额不足提示、钱包入口或账户入口 | 在系统浏览器或内嵌浏览器打开独立钱包页；不会卡死在 Open Design 内部运行态 |
| AMR-046 | 钱包页基础展示 | 已打开钱包页 | 查看页面结构 | 应展示当前余额、充值区域、交易/消费记录、AMR CLI 安装说明等核心模块 |
| AMR-047 | Stripe 固定金额充值 | 钱包页可用 | 选择固定金额并点击 `Continue to Stripe` | 跳转到 Stripe Checkout；金额、币种和展示文案一致 |
| AMR-048 | Stripe 自定义金额充值 | 钱包页支持自定义金额 | 输入合法自定义金额并继续 | 跳转到 Stripe；金额按输入值传递；非法输入时前端阻止继续 |
| AMR-048A | 最低充值金额展示 | 钱包页支持自定义金额，最低充值为 US$10 | 打开充值区域，查看固定金额与自定义金额说明 | 页面应明确体现最低充值限制；默认固定金额选项不应低于 US$10 |
| AMR-048B | 自定义金额低于 US$10 | 钱包页支持自定义金额 | 输入 `9.99`、`1`、`0` 或负数并尝试继续 | 前端应阻止进入 Stripe；给出清晰的最低充值提示；不应创建有效支付流程 |
| AMR-048C | 自定义金额等于 US$10 | 钱包页支持自定义金额 | 输入 `10` 并继续 | 应允许进入 Stripe；金额按 US$10 传递 |
| AMR-048D | 自定义金额边界值与格式 | 钱包页支持自定义金额 | 输入带空格的 ` 10 `、超长小数、非数字字符等 | 合法整数格式应被规范化或接受；非法格式应被拦截；不能绕过 US$10 下限与“仅支持整数美元”规则 |
| AMR-048E | 自定义金额不支持小数 | 钱包页支持自定义金额，规则为“仅支持整数美元” | 输入 `10.5`、`10.00`、`.`、`0.1` 并观察输入框与按钮状态 | 小数输入应被拦截、自动清洗或直接判为无效；按钮保持不可点击；不能进入 Stripe |
| AMR-048F | 自定义金额不支持负数 | 钱包页支持自定义金额 | 输入 `-10`、`-1`、`--10` | 负数输入应被拦截或判为无效；金额展示不能出现负充值；按钮不可点击 |
| AMR-048G | 空值与仅占位字符 | 钱包页支持自定义金额 | 保持空输入，或输入空格、`+`、`-`、`.` 后尝试继续 | 本次充值金额应保持 `US$0.00` 或无效态；按钮不可点击；不会创建支付 |
| AMR-048H | 前导零与纯数字规范化 | 钱包页支持自定义金额 | 输入 `0010`、`00012` | 若产品允许，应规范显示为 `10`、`12`；金额传递应按整数值处理；不能因前导零出错 |
| AMR-048I | 超大整数输入 | 钱包页支持自定义金额 | 输入极大值，如 `999999999` | 页面应有合理上限或安全处理；不会出现溢出、布局错乱、按钮文案异常或错误跳转 |
| AMR-048J | 复制粘贴非法字符 | 钱包页支持自定义金额 | 粘贴 `10usd`、`$10`、`1,000`、`１０`、`1e2` | 非法格式应被拦截或清洗到产品允许范围；不能绕过整数与最低充值限制 |
| AMR-048K | 键盘提交与禁用态 | 自定义金额输入无效 | 在输入框聚焦时按 Enter | 无效金额下按 Enter 不应触发 Stripe 跳转；只有满足规则时才允许提交 |
| AMR-048L | 固定金额与自定义金额切换 | 钱包页支持固定金额与自定义金额 | 先输入自定义金额，再切回固定金额；再切回自定义金额 | 切换行为应稳定：要么保留上次合法自定义值，要么按产品设计重置；按钮金额和展示金额必须一致 |
| AMR-048M | 文案与按钮金额一致性 | 钱包页支持自定义金额 | 输入合法整数，如 `10`、`50`、`300` | 输入框、本次充值金额、主按钮文案中的金额三处应保持一致；不能一处显示旧值一处显示新值 |
| AMR-048N | 无效输入时错误提示可恢复 | 先输入非法金额，再改成合法整数 | 依次输入 `9`、`10.5`、`-10`，最后改成 `10` | 错误/禁用状态应在修正后立即恢复；用户无需刷新页面即可继续支付 |
| AMR-048O | 服务端兜底拒绝非法金额 | 具备调试能力，可绕过前端直接请求创建充值 session | 直接提交 `<10`、负数、非整数、非法格式金额到后端 | 服务端必须拒绝请求；不能仅依赖前端校验；不应创建有效 Stripe session |
| AMR-048P | 自定义充值金额上限待确认 | 钱包页支持自定义金额；产品尚未明确最大充值上限 | 输入明显过大的整数，如 `999999999`，观察输入、按钮和跳转行为 | 在上限规则明确前，前后端至少应有安全兜底：不能溢出、不能布局错乱、不能创建不可控大额支付；如已有上限，应给出明确超限提示 |
| AMR-048Q | 等于最大上限的边界值 | 产品已明确最大充值上限 | 输入等于上限的整数并继续 | 若该值在规则内，应允许继续；前端展示、按钮金额、提交金额三者一致 |
| AMR-048R | 超过最大上限 | 产品已明确最大充值上限 | 输入大于上限的整数并尝试继续 | 前端应阻止提交并给出明确提示；若绕过前端，服务端也必须拒绝 |
| AMR-049 | Stripe 支付成功回跳 | 已完成一笔 Stripe 测试支付 | 回到钱包页 `checkout-success` 场景 | 页面出现支付成功提示；余额在服务端确认后刷新；充值记录新增一条 |
| AMR-049A | Continue to Stripe 防重复点击 | 钱包页可用，已输入合法金额 | 快速连续点击 `Continue to Stripe` 多次 | 只应创建一次有效支付流程；按钮应进入 loading/禁用态，避免重复创建 session |
| AMR-049B | 创建 Stripe session 失败 | 服务端创建 checkout session 失败或网络请求失败 | 输入合法金额后点击 `Continue to Stripe` | 页面应显示明确错误；按钮可恢复再次点击；不会卡死在 loading 或产生幽灵订单 |
| AMR-050 | Stripe 支付取消/关闭 | 已跳到 Stripe Checkout | 主动取消支付或关闭支付页后返回 | 钱包页不增加余额；不出现成功提示；用户可重新发起充值 |
| AMR-051 | 钱包页刷新一致性 | 已完成一笔充值或消费 | 点击 Refresh 或手动刷新页面 | 余额、最近交易记录、分页状态与服务端一致；不出现重复记录 |
| AMR-051A | 钱包页余额不足展示 | 测试账户余额为 0 或接近 0 | 打开钱包页 | 页面能明确展示当前余额偏低/不足；至少余额数值、最近消费记录与账户真实状态一致 |
| AMR-051B | 钱包页余额不足时充值引导 | 钱包页已显示低余额或 0 余额 | 查看页面主操作区 | 用户可以直接继续选择充值金额并前往 Stripe；不会因为低余额进入不可恢复空白态 |
| AMR-051C | 钱包页余额不足但历史记录存在 | 测试账户余额不足且存在历史消费/充值记录 | 打开钱包页并查看 Wallet Activity | 历史记录仍可正常查看；不会因余额不足把记录区域置空或报错 |
| AMR-051D | 钱包页支付成功后低余额恢复 | 余额不足账户刚完成一笔充值 | 回到 `checkout-success` 钱包页并刷新 | 成功提示、余额和新增充值记录三者一致；余额从不足状态恢复 |
| AMR-051E | 支付成功但回跳参数丢失 | 已完成测试支付，但手动移除或破坏 `session_id` / success 参数 | 打开钱包页成功态链接的异常版本 | 页面不应错误展示“支付成功”；应安全降级为普通钱包页或提示无法确认支付结果 |
| AMR-051F | 重复打开同一个成功回跳链接 | 已有一个有效 `checkout-success` 链接 | 连续多次打开相同成功回跳 URL | 不应重复增加余额；成功提示与交易记录最多对应一笔真实支付 |
| AMR-051G | 服务端余额已更新但前端未自动刷新 | 支付已完成，服务端余额已变更 | 回到钱包页后不手动刷新，观察页面，再点击 Refresh | 自动刷新失败时，手动 Refresh 后应拿到正确余额与记录；页面不应永久停留在旧值 |
| AMR-051H | Stripe 支付页中途关闭后再次进入 | 第一次支付中途关闭或取消 | 回到钱包页后再次选择金额并进入 Stripe | 第二次支付可正常发起；第一次未完成支付不会污染第二次流程 |
| AMR-051I | 同一 `session_id` 幂等保护 | 已有一个有效 Stripe 成功回跳 `session_id` | 反复打开相同成功链接，并多次刷新钱包页 | 余额、充值记录、成功提示都只能对应一笔真实支付；不能重复记账 |
| AMR-051J | Webhook 延迟到账 | Stripe 已成功，但服务端确认晚于前端回跳 | 支付成功后立刻回到钱包页，观察一段时间并手动刷新 | 钱包页应能安全处理“先回跳、后到账”；最终余额和记录会收敛正确，不误报永久失败 |
| AMR-051K | 支付处理中提示 | 服务端尚未完成最终确认 | 支付成功回跳后立即查看页面 | 若余额尚未更新，页面应表现为处理中/等待确认或安全降级，而不是直接显示错误成功状态 |
| AMR-051L | 篡改 `session_id` | 手工修改成功回跳 URL 中的 `session_id` | 打开被篡改的成功页链接 | 不应把无效或他人的支付结果记到当前账户；页面应明确提示无法确认或安全降级 |
| AMR-051M | 越权查看他人支付结果 | 准备两个不同测试账号与不同支付回跳链接 | 账号 A 登录时访问账号 B 的支付成功回跳链接 | 当前账号不应看到他人支付结果、余额或新增记录；应拒绝展示或要求重新校验 |
| AMR-051N | 越权查看他人交易历史 | 准备两个测试账号 | 登录账号 A 后尝试通过钱包页或构造 URL 访问账号 B 的交易上下文 | 钱包页不应展示不属于当前账号的余额与历史；应保持当前账号数据或返回安全错误 |
| AMR-052 | 余额不足时发起聊天 | AMR 已登录，但测试账户余额不足或上游返回额度不足错误 | 在 Open Design 中选择 AMR 发起 chat run | 应出现明确“余额/额度不足”类错误；不应误显示为“未登录”；run 不应无限重试 |
| AMR-052A | 余额不足时对话区 run 状态收敛 | AMR 已登录，但余额不足 | 在对话区发起一条 AMR 请求并观察当前 run 状态 | 当前 run 应从进行中收敛为失败结束；停止 loading / thinking / requesting；不能一直卡在运行中 |
| AMR-052B | 余额不足错误不污染登录态 | AMR 已登录，但余额不足 | 触发一次余额不足错误后，再查看 Settings / inline switcher / onboarding 状态 | AMR 仍应显示为已登录；不能把余额不足误判为未登录或自动要求重新登录 |
| AMR-052C | 余额不足失败后对话仍可继续操作 | AMR 已登录，但余额不足 | 触发余额不足错误后，尝试切换 agent、继续新消息或走充值路径 | 对话线程不应锁死；用户仍可切到其他 agent、去充值，或在恢复后继续新请求 |
| AMR-052D | 余额不足时 assistant message / 系统提示落地 | AMR 已登录，但余额不足 | 在对话区触发一次余额不足错误 | 对话区应落一条明确失败消息或系统提示，帮助用户理解发生了额度不足；不能只有 loading 消失而没有可见反馈 |
| AMR-053 | 余额不足时的引导 | 余额不足提示已出现 | 查看错误文案与可操作入口 | 应提供去充值、查看钱包页或切换其他 agent 的路径；至少不能让用户卡死在当前错误态 |
| AMR-054 | 余额不足后切换 agent | AMR 因额度不足不可继续 | 切换到 Claude / Codex / Local CLI 等其他 agent | 切换应成功；不会被 AMR 计费错误阻塞整个应用 |
| AMR-054A | AMR 余额不足后切到其他 CLI 并继续请求 | AMR 已登录，但余额不足；随后切到 Claude / Codex / Local CLI | 切换后立即发起一条新请求 | 新 CLI 请求应正常开始并结束；不应继承 AMR 的额度不足失败态 |
| AMR-054B | 切到其他 CLI 后再返回 AMR | AMR 因额度不足失败后，用户切到其他 CLI 完成一次正常请求 | 再次切回 AMR，查看状态与入口 | AMR 应仍保持“已登录但额度不足”或明确错误态；不能被错误重置成未登录，也不能假装恢复正常 |
| AMR-054C | 余额不足后切到其他 CLI 时线程状态隔离 | AMR 因额度不足失败后，切到其他 CLI 继续同一线程或新线程 | 查看旧错误展示与新 CLI 回复 | AMR 的额度不足错误不应污染新 CLI 的 assistant message、状态条或结果区域 |
| AMR-055 | 充值后恢复可用 | 刚刚因余额不足失败，随后在钱包页成功充值 | 回到 Open Design 再次发起同类请求 | 无需重装或清缓存即可恢复 AMR 可用；不会残留永久错误态 |
| AMR-056 | 已登录与余额不足区分 | AMR 已登录，但余额不足 | 打开 Settings / onboarding / inline switcher | 登录态仍显示为已登录；不能把余额不足误判为未登录 |
| AMR-056A | AMR 登出后不应产生新的钱包扣费 | 刚在 Open Design 中对 AMR 执行 `Sign out` | 直接尝试再次发起新的 AMR 请求，然后刷新钱包页 | 新请求应被阻止或要求重新登录；钱包余额和消费流水不应新增新的扣费记录 |
| AMR-056B | 运行中请求期间登出后的扣费结果 | 当前已有一条 AMR 请求正在执行，随后在 Open Design 中执行 `Sign out` | 等待该请求结束或被终止，再刷新钱包页查看余额与流水 | 需按产品预期明确验证：若当前 run 允许自然结束，则最多产生该次对应的一笔正常扣费；若 run 被中断，则不应再新增该次消费；无论哪种，不能重复扣费或出现账实不一致 |
| AMR-056C | 登出后钱包余额与流水一致性 | 刚完成 Open Design 内的 AMR `Sign out` | 打开或刷新钱包页，查看余额、最近消费记录和筛选结果 | 登出本身不应凭空导致扣费变化；钱包余额、消费流水和筛选视图应保持一致，不出现异常新增消费 |
| AMR-TASK-001 | 定时任务触发时 AMR 余额不足 | 存在使用 AMR 的定时任务 / 自动化任务；账户余额不足 | 等待任务触发或手动触发一次等价任务 | 本次任务应明确失败结束；不能无限重试、卡在 running，或默默吞掉错误 |
| AMR-TASK-002 | 定时任务余额不足错误语义 | 使用 AMR 的定时任务在余额不足时失败 | 查看任务状态、错误文案、日志或历史记录 | 应明确区分“额度不足”与“未登录/网络错误/未知错误”；错误可追踪、可定位 |
| AMR-TASK-003 | 充值恢复后再次执行定时任务 | 同类任务曾因 AMR 余额不足失败，随后完成充值 | 再次触发相同或等价任务 | 任务应恢复可执行；不会残留永久失败态，也不会错误继承旧的额度不足状态 |
| AMR-057 | Open Design 登出但 AMR 未登出 | Open Design 当前选中 AMR 且 AMR 已登录 | 在 Open Design 中退出当前账户态或切换 agent，但不在钱包/AMR 中登出 | 返回 AMR 时仍应保持已登录；钱包页仍可查看原余额与记录 |
| AMR-058 | AMR 登出后重新网页登录与充值 | AMR 已登录，钱包页可用 | 先执行 AMR Sign out，再重新登录，再打开钱包页 | 重新网页登录后钱包页恢复到账户对应余额；不会串到旧会话或空白页 |
| AMR-058A | 仅本地 Sign out，不清理网页登录态 | AMR 已登录，且浏览器里仍保留 Vela 网页登录会话 | 在 Open Design 中执行 Sign out，然后重新点 Sign in | Open Design 本地应先回到未登录；再次登录时可因网页已有会话而快速完成，但不能在未触发重新登录前自动恢复为已登录 |
| AMR-058B | 网页端退出后 Open Design 状态收敛 | Open Design 显示已登录，同时在浏览器钱包页手动退出 Vela 网页登录 | 回到 Open Design，观察状态并再触发一次需要 AMR 的操作 | 若本地 `runtimeKey` 仍有效，短期内可能仍显示已登录；一旦上游拒绝或重新登录，应用应给出明确提示并允许重新登录，不应静默卡死 |
| AMR-059 | Open Design 与钱包页账号一致性 | AMR 已登录，钱包页可打开 | 分别在 Open Design 和钱包页确认当前账号标识 | 两边应指向同一 AMR 账号；不会一个显示 A 账号、另一个显示 B 账号 |
| AMR-060 | 钱包页残留旧账号会话 | 浏览器里残留旧钱包登录态；Open Design 已切到新 AMR 账号 | 从 Open Design 再次打开钱包页 | 钱包页应与当前 AMR 账号保持一致，或至少明确要求重新登录；不能静默展示旧账号余额 |
| AMR-061 | 多账号切换后余额不串号 | 准备两个不同 AMR 测试账号 | 用账号 A 登录并查看余额，再 Sign out，改用账号 B 登录并查看余额 | 账号 B 不应看到账号 A 的余额和交易记录；返回账号 A 后仍应恢复自己的数据 |
| AMR-062 | 多账号切换后 Open Design 状态刷新 | 先用账号 A 登录并成功聊天，再在 Open Design 内显式重新登录切到账号 B | 切换后查看 Settings、inline switcher、钱包入口，再发起一条 AMR 请求 | 账号展示、登录态、钱包入口、聊天请求都应切到账号 B；不残留账号 A 文案或会话 |
| AMR-063 | 多 profile 与多账号组合 | `prod`、`test` 或 `local` 下分别绑定不同 AMR 账号 | 切换 `OPEN_DESIGN_AMR_PROFILE` 后分别查看 status 与钱包页 | profile 切换后应映射到对应账号；不同 profile 的余额和交易记录不能串号 |
| AMR-064 | 钱包页已打开时再切换账号 | 钱包页已停留在账号 A；Open Design 中切换到账号 B | 不关闭旧钱包页，直接刷新或再次从 Open Design 打开钱包页 | 旧页刷新后不应继续误展示账号 A 的有效可操作状态；新打开的钱包页应对齐账号 B |
| AMR-065 | 支付成功后账号切换保护 | 账号 A 发起 Stripe 支付，在回跳前切到账号 B | 打开支付成功回跳页并检查余额记录 | 不应把账号 A 的支付结果错误记到账号 B；若无法确认，应明确报错或要求重新校验 |
| AMR-065A | 网页端手动切换账号后客户端保持旧账号 | Open Design 当前以账号 A 登录；钱包页手动切到账号 B | 切回 Open Design，查看 Settings、inline switcher，并尝试发起一次 AMR 请求 | Open Design 应继续显示/使用账号 A，不能静默切到账号 B |
| AMR-065B | 网页端切账号后重新打开钱包页 | Open Design 当前仍为账号 A；浏览器钱包页已切到账号 B | 从 Open Design 再次点击钱包入口 | 钱包页可继续显示账号 B，但 Open Design 客户端本地状态仍保持账号 A，直到显式重新登录 |
| AMR-065C | 网页端切账号后客户端显式重新登录 | 钱包页已切到账号 B；Open Design 当前仍为账号 A | 在 Open Design 中主动执行 Sign out / Sign in，并完成网页登录 | Open Design 完成新的网页登录后，才正式切到账号 B |
| AMR-065D | 网页端切账号后不允许静默串余额 | 钱包页已切到账号 B；Open Design 当前仍为账号 A | 观察客户端显示的账号标识、余额入口文案、聊天身份 | 在显式重登前，Open Design 不应混入账号 B 的余额、文案或身份信息 |
| AMR-065E | 本地显示已登录但 token 已失效 | Open Design 当前显示已登录，但上游 token 已过期/撤销/无权限 | 发起一次 AMR chat run、打开关键设置页或执行状态刷新 | 应收敛成需要重新登录或明确权限错误；不能长期假装已登录，也不能静默失败 |
| AMR-066 | 弱网下 AMR 登录轮询 | 网络延迟高、偶发丢包或短时断网 | 触发 AMR 登录并观察 `Signing in…` 到结果态的切换 | UI 不应立刻假失败；短暂失败后可恢复；超时后给出明确错误，不永久卡住 |
| AMR-067 | 弱网下登录完成后状态刷新 | OAuth 已在浏览器中完成，但 Open Design 与 daemon 的状态轮询较慢 | 等待登录结果或恢复网络后重试查看 Settings | 登录成功后最终能收敛到已登录；不会长期停留在旧未登录态 |
| AMR-068 | 弱网下钱包页打开 | 网络较慢时从 Open Design 打开钱包页 | 观察钱包页首屏加载 | 页面应有加载态或安全降级；不应空白无反馈；恢复网络后可继续正常展示余额和记录 |
| AMR-069 | 弱网下钱包页 Refresh | 钱包页已打开，网络抖动明显 | 点击 Refresh 多次或在网络恢复后再次刷新 | 最终以最新服务端结果为准；不会因重复刷新产生重复记录、重复提示或永久错误态 |
| AMR-070 | 弱网下 Stripe 成功回跳 | 支付成功后回到钱包页时网络不稳定 | 观察成功提示、余额和交易记录，再在网络恢复后刷新 | 即使首轮加载失败，恢复后仍能正确显示成功结果；不应丢单或重复记账 |
| AMR-071 | 弱网下 Stripe 取消回跳 | Stripe 取消或关闭支付后返回钱包页时网络抖动 | 返回钱包页并观察页面状态 | 不应误显示支付成功；恢复网络后仍保持未充值状态 |
| AMR-072 | 弱网下余额不足提示 | AMR 上游返回额度不足，同时网络波动 | 在 Open Design 中发起 AMR chat run | 应优先展示可理解错误；不能因为网络波动把“余额不足”错误变成静默失败或无限 loading |
| AMR-073 | 弱网下聊天请求超时恢复 | 选择 AMR 发起聊天时网络较差 | 发送 prompt，观察失败提示，并在网络恢复后重试 | 首次失败应可见且可恢复；重试后可重新发起，不残留卡死 run |
| AMR-074 | 弱网下切换 agent | AMR 正处于网络不稳定或错误态 | 立即切换到 Claude / Codex / Local CLI | 切换应仍可完成；AMR 的弱网状态不应拖垮整个执行器 UI |
| AMR-075 | 弱网下多账号切换 | 浏览器钱包页与 Open Design 切账号时网络较差 | 执行 Sign out / 重新登录 / 打开钱包页 | 账号切换最终应收敛到正确账号；不应因为弱网出现旧账号残留、串号或永久 loading |
| AMR-076 | 余额与流水对账一致性 | 钱包页存在充值与消费记录 | 对比当前余额、总充值、总消费和最近流水 | 余额变化应与充值/消费流水逻辑一致；切换筛选和分页后不应出现前后对不上的数据 |

## 推荐优先级与是否必测

这部分给 QA 一个快速分层，避免一次性把整套长回归集全部跑完。

### P0 / 必测

- AMR-001 至 AMR-008
- AMR-010 至 AMR-015
- AMR-011E 至 AMR-011G
- AMR-021 至 AMR-026
- AMR-032 至 AMR-039
- AMR-045
- AMR-047
- AMR-049
- AMR-049A
- AMR-049B
- AMR-052 至 AMR-056C
- AMR-052D
- AMR-054A
- AMR-054B
- AMR-054C
- AMR-065A
- AMR-065C
- AMR-065E
- AMR-TASK-001
- AMR-TASK-002
- AMR-TASK-003
- AMR-076

### P1 / 建议回归

- AMR-009
- AMR-016 至 AMR-020
- AMR-027 至 AMR-031
- AMR-040 至 AMR-044B
- AMR-046
- AMR-048 至 AMR-048R
- AMR-050
- AMR-051 至 AMR-051N
- AMR-057
- AMR-058
- AMR-059 至 AMR-065
- AMR-065B
- AMR-065D
- AMR-066 至 AMR-075

### P2 / 扩展验证

- AMR-011A 至 AMR-011D
- 其余会话 / OAuth 组合矩阵项
- 多账号、多 profile、重复回跳、取消支付等跨环境组合场景
- 弱网、短时断网、恢复网络后的重试与状态收敛场景

## 会话 / OAuth 组合测试矩阵

这部分用于补足“Open Design 自身状态”和“AMR 自身 OAuth 状态”组合下的行为验证。

| ID | 场景 | 预期结果 |
| --- | --- | --- |
| AMR-OAUTH-001 | Open Design 切换到非 AMR agent，但 AMR 不执行 Sign out | AMR 登录态保留；切回 AMR 时仍可识别 |
| AMR-OAUTH-002 | 仅 Open Design 关闭并重开，AMR 配置文件保留 | AMR 登录态仍应存在 |
| AMR-OAUTH-003 | AMR 执行 Sign out 后，Open Design 关闭并重开 | AMR 登录态不应自动恢复 |
| AMR-OAUTH-004 | AMR Sign out 后重新执行网页登录 / 登录 | 可重新登录成功，状态恢复为已登录 |
| AMR-OAUTH-005 | 存在多个 AMR profile 时切换 `OPEN_DESIGN_AMR_PROFILE` | 登录态应随 profile 切换，不应串号 |
| AMR-OAUTH-006 | 当前 profile 登录失败后立即重试 | 第二次登录可恢复，不应永久卡在错误态或 signing-in |

## 计费 / 钱包页专项测试

根据当前产品形态，计费并不内嵌在 Open Design 主界面里，而是通过**独立钱包网页**承载，典型内容包括：

- 当前余额
- Stripe 充值入口
- 最近充值/消费记录
- 支付成功回跳提示
- AMR CLI 安装说明

因此计费测试建议拆成三层：

### A. 钱包页本身

- 入口能否正确打开
- Stripe 金额与回跳是否正确
- 最低充值 US$10 的前端展示、输入校验与边界值是否正确
- 前端校验被绕过后，服务端是否仍拒绝非法金额
- 自定义充值金额上限未明确时是否仍有安全兜底；明确后前后端是否一致执行
- 余额与交易记录是否刷新
- 余额不足时钱包页自身是否仍可用、可充值、可查看历史
- 支付取消、参数丢失、重复打开、前端刷新延迟等异常回跳是否安全
- 同一支付结果的幂等保护、延迟到账和越权访问是否安全
- 创建 Stripe session 的 loading、防重复点击和失败恢复是否安全

### B. Open Design 与钱包页的联动

- 余额不足时 Open Design 如何提示
- 是否能从错误态去钱包页充值
- 充值后是否能恢复 AMR 可用
- 登录态与计费态是否分离展示

### C. 账户与会话组合

- Open Design 会话变化时，AMR / 钱包页会话是否保持
- AMR Sign out 与重新网页登录后，钱包页是否仍指向正确账户
- Open Design 的 Sign out 是清理本地 AMR 登录态，还是同时要求网页钱包会话失效
- 多 profile 或多账号时是否会串余额、串交易记录
- Open Design 与钱包页是否可能因为浏览器残留会话而出现账号不一致
- 网页端手动切到新账号后，客户端是否仍默认保持旧账号，直到显式重新登录
- 弱网、超时、短时断网时 Open Design 与钱包页的状态是否还能正确收敛

## 建议后续补强

如果后面要把 AMR 的计费体验做得更完整，建议追加这些实现与测试：

- 独立的 AMR 计费状态读取接口
- “已登录但余额不足”与“未登录”分离展示
- 余额不足时的 CTA（充值、升级、查看文档、切换 agent）
- 余额恢复后的状态刷新与重试路径
- Open Design 自身退出/重开与 AMR OAuth 状态的更明确 UX 文案
- “本地登出”与“网页会话仍存在”之间更明确的产品文案与用户预期
- Stripe 取消支付、重复回跳、过期 session_id 等更明确的结果页状态
- Stripe success 回跳、webhook 延迟与最终到账之间更明确的处理中状态
- 钱包页与 Open Design 之间更清晰的回跳/返回路径
- 多账号场景下更显式的账号展示与串号保护
- 钱包页对篡改 `session_id`、错误账号访问、重复消费回跳结果的安全保护
- 弱网态下更明确的 loading、timeout、retry 与恢复提示

## 推荐 Smoke 流程

### Smoke A：入口 + 登录 UI

- 确认 `amr.available=true`
- 打开 Settings
- 确认 AMR login pill 可见
- 触发登录
- 确认状态切换成已登录
- 确认 Sign out 可用

### Smoke B：Onboarding

- 重置配置，让 onboarding 可见
- 确认 `AMR Cloud` 是默认推荐入口
- 确认未登录时 Continue 受登录授权拦截，且不存在 Skip 入口
- 完成登录后确认 onboarding 可继续

### Smoke C：Chat Run

- 选择 AMR 作为当前 agent
- 模型保持 `default`
- 发送一条 prompt
- 确认 assistant 正常返回
- 确认没有出现 `session/set_model must be called before session/prompt`

## 值得重点关注的失败场景

- 明明预期有 `vela`，但 `amr.available=false`
- 钱包页里已经提示安装 CLI，但 Open Design 仍读取不到 CLI
- CLI 重复安装后，Open Design 解析到旧路径、失效路径或错误版本
- 登录已 accepted，但 status 一直不切到已登录
- 弱网后恢复了，但 UI 仍卡在旧状态不刷新
- UI 一直卡在 `Signing in…`
- 钱包页按钮进入 Stripe 创建流程后一直 loading，无法恢复
- 已登录状态显示了错误的 profile badge
- AMR 不可用时，onboarding 仍然强推 AMR
- AMR 出现在 Local CLI 列表里
- 发送 prompt 后 run 挂住
- `model=default` 时 AMR silently fail
- 打包构建成功，但运行时找不到 bundled `vela`

## 建议采集的排障信息

提 bug 时建议附带：

- `/api/agents` 返回
- `/api/integrations/vela/status` 返回
- 当前 `agentCliEnv.amr` 配置
- 相关 daemon 日志
- 相关 desktop / renderer 日志
- 当前 `OPEN_DESIGN_AMR_PROFILE` 值
- 使用的是 fake 还是真实 `vela`
- `which vela` 输出
- `echo $VELA_BIN` 输出
- 弱网复现方式
- 失败时的网络状态、代理/VPN 状态、是否可稳定复现
- 相关支付 session_id / 请求 ID / 服务端拒绝原因

## 备注

- 自动化测试已经覆盖了大量契约级行为；本文档主要用于手工功能验证，尤其是 UI 状态、环境配置和打包/运行时行为。
- onboarding 是否可见取决于当前配置；如果 `onboardingCompleted=true`，需要先重置 onboarding 才能看到 AMR onboarding 入口。
- 如果页面上没看到 AMR，优先先查 `/api/agents`，不要先假设是前端渲染问题。
