# AMR 登录同步规则

## 目的

本文档用于对齐 `Open Design` 与 `Vela 网页钱包` 在以下场景中的状态预期：

- 登录
- 登出
- 网页端切换账号
- 状态收敛

目标不是追求“强实时双向同步”，而是保证：

- 用户感知稳定
- 不静默串号
- 不静默恢复错误账号
- 后续状态能正确收敛

## 两层状态

AMR 当前有两层相互独立、但会互相影响的状态：

1. `Open Design 客户端本地登录态`

- 以本地 `~/.vela/config.json` 和当前 AMR profile 的有效登录信息为准
- 这是 Open Design 判断“当前能不能用 AMR”的主依据

2. `Vela 网页钱包登录态`

- 以浏览器中的网页 session / cookie 为准
- 这是钱包页判断“当前能不能看余额、充值、退出登录”的主依据

这两层状态**允许短暂不一致**，但后续必须正确收敛。

## 核心规则

### 1. Open Design 内点击 `Sign in`

- Open Design 调用本地登录流程
- Vela CLI 拉起网页登录/授权
- 用户在网页完成授权后，Open Design 通过状态轮询收敛成已登录

预期：

- Open Design 不直接假设网页已成功登录
- 只有本地状态真正可用后，才显示为已登录

### 2. Open Design 内点击 `Sign out`

- 优先清理 **Open Design 本地 AMR 登录态**
- Open Design 立即显示为未登录
- 不要求浏览器中的 Vela 网页钱包会话同步退出

预期：

- 本地登出应立即生效
- 即使网页还保持登录，Open Design 也不能自动恢复成已登录

### 3. Vela 网页端点击“退出登录”

- 优先清理 **网页钱包会话**
- 不要求 Open Design 必须实时收到退出事件

预期：

- Open Design 可以短暂仍显示旧状态
- 但在后续刷新状态、打开 Settings、发起 AMR 请求时，必须收敛成“需要重新登录”或明确权限错误

### 4. 网页端手动切换账号

- 如果用户在钱包页从账号 A 切到账号 B
- Open Design 默认仍保持本地账号 A

预期：

- **网页切账号，不应自动切客户端账号**
- 只有用户在 Open Design 内再次显式 `Sign in` 并完成网页登录后，客户端才正式切到账号 B

### 5. 状态收敛优先于强实时同步

推荐采用：

- “本地状态先准”
- “网页状态独立变化”
- “在关键节点重新校验并收敛”

关键节点包括：

- 打开 Settings
- 打开 onboarding
- 打开钱包入口
- 发起一次 AMR chat run
- 用户主动刷新状态

## 不允许发生的行为

- 网页端切账号后，Open Design 静默切到新账号
- Open Design 本地已登出，但因为网页还登录着而自动恢复已登录
- 钱包页已退出登录，但 Open Design 长期假装仍可正常使用 AMR
- A 账号网页状态污染到 B 账号客户端身份、余额文案或聊天身份

## 推荐实现策略

### 基础版

- Open Design 的 `Sign out` 只清本地状态
- 网页端退出登录后，Open Design 在后续关键动作中重新校验并收敛

### 增强版

- 钱包页退出登录或切账号时，尝试通过 bridge / callback / postMessage 通知 Open Design
- Open Design 收到事件后主动刷新 AMR 状态
- 即使事件丢失，仍由“后续关键动作重新校验”兜底

## 测试重点

最关键的验证点有 6 个：

1. Open Design 本地 `Sign out` 后立即变未登录
2. 网页端退出登录后，Open Design 后续能正确收敛
3. 网页端切账号后，Open Design 默认保持旧账号
4. 只有显式重新登录后，Open Design 才切到新账号
5. 弱网、多 tab、旧网页会话残留时不串号
6. 余额、钱包入口、聊天身份不会跨账号污染

## 对应测试文档

完整功能回归用例见：

- [amr-functional-test-cases.zh-CN.md](/Users/mac/open-design/open-design-amr-runtime-acp/docs/testing/amr-functional-test-cases.zh-CN.md)
