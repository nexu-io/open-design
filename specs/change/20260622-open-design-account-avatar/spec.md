# Open Design 账号体系 + 用户头像（订阅/余额）设计方案

> 状态：设计中（design）。本 spec 是评审稿，**独立于** "Open Design Cloud 文案改造" PR（`feat/cloud-subscription-copy`），不随其合入。评审通过后另起实现分支。

## Context / 背景

AMR（Agentic Model Router）不再作为 Open Design 的独立产品，收敛成 Open Design 的订阅 / 云服务。随之而来的产品架构变化：

- **AMR 的账号体系 = Open Design 的账号体系。** 不再有"AMR 账号"，只有"Open Design 账号"（承接现有 vela / Open Design Cloud 账号）。
- Open Design 需要成为一个**可登录**的产品，并提供类似 Claude 的**常驻用户头像**：头像 · 套餐 ▾ →（点击）当前套餐 + 余额 + 管理/充值入口。

**已确认的产品决策：**
1. **全局账号，与运行方式解耦**——登录即"登录 Open Design"，头像常驻；哪怕用本地 CLI / BYOK 也是登录态。订阅是对 Open Design 的订阅，不是对某个运行时。
2. **头像下拉展示完整版：身份 + 套餐 + 余额**——需要打通上游余额数据。
3. **先出 spec、再实现**（本文件）。
4. **开源 / 商业化边界（open-core）**——account 是**可选的商业化边界**，不是 OSS 核心的前置。OSS 核心（本地 CLI / BYOK）**无需登录即可正常使用**；登录只解锁云运行时 / 订阅 / 团队版。绝不让 OSS 体验变成"打开即逼登录"。
5. **身份源 = 现有 vela 账号（方案 A）**——把 vela / Open Design Cloud 账号确立为**唯一的 "Open Design 账号"**。身份、计费、未来的 org/seat/role 全部在**托管后端（vela）**演进；开源 repo **不自建第二套身份**，只做瘦客户端（账号契约 + 登录流 + 头像）。团队版的组织/席位/角色是 vela 账号模型的演进，不是本 repo 要造的东西。

## 现状（代码事实，决定工作量）

| 维度 | 现状 | 关键文件 |
|---|---|---|
| "头像" | 现 `AvatarMenu` 实为**运行时/agent 切换器**（误名），仅 `ProjectView` 挂载，home 无；只有 `agent==='amr'` 时露一个外链钱包入口 | `components/AvatarMenu.tsx`、`ProjectView.tsx:6062` |
| 账号数据 | `VelaUser { id, email, name?, image?, plan? }`，经 `/api/integrations/vela/status` 读 `~/.amr/config.json` 投影；**无 balance** | `providers/daemon.ts:736`、`daemon/src/routes/vela.ts` |
| 余额来源 | 本地 config 无余额；daemon 有 `/api/amr/*` 反代上游 vela API（代理已存在），余额可由此取 | `daemon/src/routes/vela.ts`（`AMR_API_PROXY_PREFIX`） |
| 登录态消费 | **四处各自 `fetch + useState` 轮询**，无全局 account context（App 顶层持有一份并部分下传） | `App.tsx:585`、`ChatPane.tsx:758`、`InlineModelSwitcher.tsx:160`、`AmrLoginPill.tsx` |
| 登录流 | vela device-auth（`startVelaLogin` → 轮询 `/status`），有事件总线 | `components/amrLoginPolling.ts`、`providers/daemon.ts` |
| CLI | vela 登录是纯 UI，**无 `od account` 子命令** | `daemon/src/cli.ts`（`SUBCOMMAND_MAP`） |

## 开源 / 商业化分层（open-core）

Open Design 本身是开源产品，商业化走 open-core：**账号挂在托管后端，开源端只做可选的瘦客户端**。

| 层 | 放哪 | 内容 |
|---|---|---|
| 身份 + 计费 + org/seat/role | **托管后端 vela**（闭源） | 账号库、Stripe 支付、订阅 tier、余额、团队组织/席位/角色 |
| 账号**客户端契约** + UI | **开源 app（本 repo）** | 可选登录流、`AccountSummary`（身份/套餐/余额/org）、`AccountAvatar` 头像 |

要点：
- **真正的"账号体系设计"重心在 vela 后端，不在本 repo。** 本 repo 只消费契约、不持有身份真相。
- 客户端契约从一开始就**为 org/team 预留字段**（见数据契约），后端长出团队能力时客户端只需展示，不需重构。
- account 全程**可选**：未登录态所有 OSS 核心功能可用，登录只解锁云/订阅/团队。

## 目标 / 非目标

**Goals**
- 全局登录态的 single source（收敛现在分散的 4 处）。
- 常驻用户头像，跨视图（home + project）可见，与运行方式无关。
- 头像下拉展示：身份、当前套餐、余额，以及登出 / 管理订阅 / 充值入口。
- UI / CLI 双轨：新增 `od account login | status | logout`。

**Non-goals（本期不做）**
- 不改计费后端、不自建支付（充值/管理仍跳现有外部 console）。
- 不在 app 内实现订阅升级流程（上游若已有 tier 则仅展示）。
- 不做团队版。
- 不重命名内部代码标识（agent id `amr`、`vela` 端点、`~/.amr` 等沿用，仅对外措辞用 Open Design / Open Design Cloud）。

## 架构设计

### 1. 数据契约（`packages/contracts/src/api/account.ts` 新增）

在 contracts 立账号 DTO（web/daemon 共享，contracts 保持纯 TS）：

```ts
export interface AccountBalance { amount: number; currency: string; displayText: string; }

// 为团队版预留：本期后端可不返回，客户端按缺省处理；后端长出 org 后无需改契约。
export interface AccountOrg {
  id: string; name: string;
  role?: string;        // 'owner' | 'admin' | 'member' …（团队角色）
  seat?: string;        // 席位/来源订阅标识
}

export interface AccountUser {
  id: string; email: string; name?: string; image?: string | null;
  planTier?: string;        // 机器可读层级，如 'max'（若上游有）
  planLabel?: string;       // 展示用，如 'Max'
  balance?: AccountBalance; // 余额（来自上游，可能缺省）
  renewsAt?: string;        // ISO，续费/到期（可选）
  org?: AccountOrg;         // 团队上下文（个人账号缺省；团队版填充）
}
export interface AccountSummary {
  loggedIn: boolean;
  user: AccountUser | null;
  // 登录进行中的 device-auth 细节（沿用 VelaLoginStatus 的 activationUrl/userCode/...）
}
```

> 现有 `VelaLoginStatus`/`VelaUser` 是 web 私有类型；本期把账号形状上提到 contracts，daemon 与 web 都引用。`AccountOrg` 本期不实现填充逻辑，仅作为契约占位，确保团队版到来时**不破坏契约**。

### 2. daemon 侧

- 新增 `GET /api/account/summary`（`daemon/src/routes/`，可与 vela.ts 同域）：组合「本地登录态（`readVelaLoginStatus`）」+「经 `/api/amr` 上游取 balance / subscription」→ 组装成 `AccountSummary`。
- 登录/登出复用现有 `/api/integrations/vela/login|login/cancel|logout`（对外语义改为"Open Design 账号"，端点路径可不动）。
- **依赖确认**：上游 vela API 是否已暴露 balance / subscription（tier、续费日）端点与字段 → 见 Open questions Q1。

### 3. web 侧：全局 account context

- 新建 `AccountProvider`（React context）作为登录态 + 套餐 + 余额的 single source：内部轮询 + 失效刷新，复用 `amrLoginPolling.ts` 事件总线广播登录/登出。
- 现 `App.tsx / ChatPane / InlineModelSwitcher / AmrLoginPill` 的各自 `fetchVelaLoginStatus + useState` **逐步改为消费 context**（P3 收敛，避免一次性大改）。

### 4. UI

- **新组件 `AccountAvatar`**（与运行时切换器彻底分开）：
  - 触发器：头像（`image` 或 email 首字母）+ `name · planLabel ▾`（对标截图 `frg · Max ▾`）。
  - 下拉：身份块（头像/姓名/邮箱）→ 套餐（`planLabel` + 续费日）→ 余额（`balance.displayText` + "充值/管理"按钮跳外部 console，沿用 `amr-attribution` 归因）→ 设置 → 登出。
  - **未登录态**：头像位显示"登录 Open Design" CTA，点击触发现有 vela device-auth 登录流。
- **登录态展示规则（统一，适用于所有露出账号状态的地方）**：
  - **登录态不再展示冗余的 "✓ / 已登录"**——"已登录"由"显示了套餐"隐含表达。直接展示当前套餐（`planLabel`）。
  - **未登录态**才显示登录 / 授权 CTA。
  - 适用面：`AccountAvatar`、`InlineModelSwitcher` 的 Cloud 行（当前截图里仍是 `Cl… ✓ 已登录`，要改为 `Cl… · {套餐}`）、`SettingsDialog` 的 Cloud 服务卡（`amrSignedIn` 等处）。
  - 数据源：`planLabel`（过渡期用现有 `VelaUser.plan`，已可取到）。
  - **缺省 fallback（需拍板，见 Open questions Q5）**：登录了但拿不到套餐串时显示什么。
- 现 `AvatarMenu` 回归"运行时切换器"本职语义；可顺势更名 `RuntimeSwitcher`（非本期必须）。

## CLI 对等（仓库强制 UI/CLI 双轨）

- 新增 `od account login | status | logout`，`--json` 输出，走同一 `/api/account/*` 与 vela 登录端点；与 UI 同 PR 落地（`daemon/src/cli.ts` 的 `SUBCOMMAND_MAP` 注册）。

## 分阶段实现

- **P1 数据层**：contracts `account.ts` + daemon `/api/account/summary`（含余额打通）+ web `AccountProvider`。
- **P2 UI**：`AccountAvatar`（登录态展示）+ 全局头部接入 + 未登录登录流。
- **P3 收敛 + CLI**：把分散的 4 处登录态迁到 context；`od account` 子命令。
- **P4 文案/验证**：i18n（承接 Open Design Cloud 命名）+ 截图 + 测试。

## Open questions（需确认，决定能否落地）

1. **上游 vela API 是否已暴露 balance / subscription 端点与字段？**（tier、余额、续费日）——决定 P1 余额打通能否进行，是 blocker。
2. **"套餐(tier)"是真实订阅层级还是现有 `plan` 自由串？** 截图的 `Max` 映射到哪个字段/取值？
3. **未登录态策略**：home 首屏即引导登录，还是仅在需要云能力时？（影响 onboarding 与转化）
4. **全局头部容器**：复用现有哪个头部，还是新建统一顶栏 slot？（影响 home/project 两处接入方式）
5. ~~登录态拿不到套餐时的 fallback~~ → **已定：拿不到套餐就不显示状态**（方案②，只显示 Open Design Cloud 名称）。
   - "登录了但无套餐"是预期常态，非异常：①免费用户（从未订阅）；②本地 `~/.amr/config.json` 投影未含 plan（老 CLI / 登录时未写入）；③权威套餐在上游、本地缺；④上游拉取失败或加载中。一律降级为"不显示状态"。
   - **实现注意**：要把"已登录但无套餐（→ 不显示状态、也不显示登录 CTA）"与"未登录（→ 显示登录 CTA）"区分开，二者都"没有套餐标签"，但前者无 CTA、后者有 CTA。判定用 `loggedIn`，不要用"有没有 plan"。

## 验证

- `pnpm --filter @open-design/web typecheck`、`pnpm guard`。
- e2e（Vitest）在 daemon HTTP 边界打 `/api/account/summary`（含登录/未登录/有余额/无余额分支）。
- Playwright 看头像的登录态/未登录态、套餐+余额渲染。
- 两 namespace（main vs 分支）对比；用**真实 vela 账号**经生产 API 验证余额展示（不走测试后门）。
- CLI：`od account status --json` 与 UI 同源校验。
