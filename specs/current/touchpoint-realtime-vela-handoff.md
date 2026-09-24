# Vela Touchpoint「真实时间活动」测试交接

> 写于 2026-09-14。本文是 OpenDesign 对 Vela 的待实现依赖交接，不是上线记录。
>
> 后续用户已批准本地客户端开发：OpenDesign worktree 已接入共享展示生命周期和 Test 授权字段；本文同步记录客户端实现与验证边界。不执行 Vela 远程部署或数据库操作，既有生产服务端协议、不可变发布快照及 deployments/acceptances 历史不因此改变。Vela 客户端与服务端的待交付要求仍保留。

## 已决定的产品语义

活动 Test 不再由客户端选择「模拟前/中/后/唤醒」时间。测试者选择一份 Test deployment，Vela 以每次 GET 的服务器当前时间重新判定状态；只有服务端确认 active 且授权在实际挂载时仍有效，客户端才能渲染、挂载并回执。

**用户已决定：测试入口以真实时间替换模拟场景，不再默认 `active`。** 这不是把旧 `active` 改名为 `wake`，也不是给任一模拟分支保留别名。唯一合法选择是 `realtime`，状态完全由 Vela 当前时钟计算。

不变量：

1. context 的唯一 scenario 是 `"realtime"`；旧 `before`、`active`、`after`、`wake` 一律拒绝，不兼容映射或静默降级。
2. `GET` 带 UTC ISO-8601 的 `serverTime`、`startsAt`、`endsAt`、`authorizationExpiresAt`；均由服务端生成，客户端不得模拟时间或自行签发展示授权。
3. 每次 runtime `GET` 用同一个 `serverTime` 计算状态：`serverTime < startsAt` 为 `before`；`startsAt <= serverTime < endsAt` 为 `active`；否则为 `ended`。三个状态均返回完整 metadata 与 identity 的 HTTP 200，不能由 POST、旧 context 或 `wake` 决定。
4. acceptance 的 `scenario` 也只能是 `"realtime"`；Vela 在写入事务中以服务器当前时间和 Test deployment snapshot 再次核对窗口 active，客户端不能传入/控制判定时间。
5. deployment 的 `snapshotHash`、`artifactHash`、`manifestHash`、内容和既有 acceptance/audit 历史仍是不可变证据。时钟是 runtime 投影，不得重写 snapshot 或历史审计。

### 全球统一时间：北京时间配置，服务端判定

Admin 排期输入和展示固定使用北京时间 `Asia/Shanghai`（UTC+08:00），不随配置人员电脑时区变化。保存时将北京时间转换为明确的 UTC instant；接口使用带时区的时间，runtime 统一返回 UTC ISO-8601。不能仅填写 timeZone 字段却把无偏移的日期字符串按浏览器本地时区解析。

开始、结束与展示授权均由服务端控制，Test/Production 使用同一全球时间点；客户端所在地、系统时区及夏令时不改变排期，不实现“当地时间到几点才展示”。例如北京时间 `2026-09-14 16:00` 对应 `2026-09-14T08:00:00.000Z`，全球客户端都以这一 instant 为开始边界。本地计时仅用于保守撤载和刷新，不自行决定 active。统一时间边界不承诺网络与 polling 下所有设备同一毫秒挂载。

此处明确目标契约；Admin 输入转换与固定北京时间展示仍需按下方清单验证，不视为已完成的实现证明。

## 已知活动证据（复现材料，不等于上线）

- 活动：`活动A-HYT测试`
- activity ID：`yl5cga2linv5ntp4sz0oc7oo`
- 活动修订：`r5`
- Test deployment：`odquc46ptdedpba1c42w5a49`
- 排期：2026-09-14 北京时间 15:47–16:00
- 16:01:06 创建 Test；16:15:35 context 仍投影为 `active`，模拟时间为 15:53:30；16:15:37–16:15:45 有四个 OD 触点回执。

这证明旧模拟 context 可在真实窗口结束后继续生成 `active` 与回执，正是本次要切断的路径。它不是一次真实时间验收成功的证据，不能据此 promotion 或宣称上线。

## OpenDesign 本地验证（非 live Vela 联调）

本轮在实际 Chromium 中使用本地 HTTP 协议 fixture 和正式桌面宿主桥协议 fixture，经过真实客户端入口验证：Test before 零挂载，active 四触点挂载；活动仍 active 时，断网后短期授权到期使四触点全部撤下，deployment 选择保留，界面不把授权过期误报为活动 ended。生产弹窗也经过真实获取入口验证短期授权先于活动结束时撤下。缺少 Test 授权字段的 fixture 零挂载、零回执。共享 owner 的虚拟时钟测试另覆盖续期、响应耗时、本地钟后退、恢复、请求超时与迟到响应。上述是本地客户端证明，**不是** live Vela 联调、原生桌面功能或部署证明。

## 客户端核心要求：Test 与 Production 必须共用一个展示生命周期

**OpenDesign worktree 已合并展示生命周期实现。** `TestCampaignModal`、`ProductionCampaignModal`、`ProductionCampaignBadge`、`ProductionCampaignHover` 均调用 `touchpoint-lifecycle.ts` 的 `useTouchpointLifecycle`；旧的各宿主 polling/lease/wake effects 已移除。独立展示组各自持有实例，但调度、授权和代际隔离只有这一套实现，Test 不再绕开它。Test 选择/验收、生产展示频控和布局留在外层。下表保留重构前审计，不能当作当前代码状态。

### 重构前调用链与差异（历史基线）

下列行号仅定位重构前版本，符号名便于追溯；不是当前行号或 Vela 客户端的实现证明。

| 职责 | Test 重构前实现 | Production 重构前实现 | 基线判断 |
| --- | --- | --- | --- |
| 生命周期 owner | `apps/web/src/components/TestCampaignModal.tsx:583–832` 的 effect | `ProductionCampaignModal.tsx:182–353`、`ProductionCampaignBadge.tsx:63–204`、`ProductionCampaignHover.tsx:35–98`（均在同一 components 目录） | 独立；生产三个宿主也分别维护控制逻辑。 |
| 获取/刷新 | Test effect 建 context、逐 placement GET，30 秒 polling（:817–821） | `production-touchpoint-loader.ts:23` 的 `loadProductionTouchpointDecision`；modal 初始及 focus/online 获取（:238–344），badge:196、hover:96 另有 RECHECK_MS 周期 | 没有统一刷新 owner；生产 loader 只是获取复用，连生产宿主的调度也不统一。 |
| 时间与到期 | `realtimeTiming`（TestCampaignModal.tsx:484–513）按 serverTime/window 与请求单调时钟计算边界，effect 自己设 timer | 生产宿主各自计算授权截止并设 timer；modal:267–270、322–326 | Test 仅活动窗口不能替代生产授权 lease。 |
| 恢复/断网/迟到响应 | Test effect 自有 generation、AbortController、10 秒超时及 focus/pageshow/visibilitychange fence（:615–723、800–831） | 生产宿主自有 request/authorization/lease generation；modal focus/online 触发获取，加载异常 clear（:328–351） | 恢复策略和请求失效机制尚未合并。 |
| 已共享的宿主/渲染 | `useTestRuntime`、`TestTouchpointMount`、`recordVisibleTestTouchpoint` | modal/badge/hover 读取 Test store；modal/badge 调 TestTouchpointMount，hover 也调用可见性回执入口 | 仅部分宿主、store 和渲染/回执工具共用。 |

重构前，App 同时接入 Test/Production 组件，生产 modal 在存在 Test session 时退出独立生产获取 effect；这是 Test 接管宿主而非共享生命周期。重构后仍由 Test 选择接管展示，但 Test 的数据适配器与生产适配器均进入 `useTouchpointLifecycle`；共享 hook 的 references 已覆盖四个入口。

### 合并目标与准确职责

目标是**同一客户端内一个 lifecycle owner + 两个数据适配器**，不是跨 Vela/OD 仓库共享源码。Vela 客户端也需满足同一约束，但本次未重新核查其当前调用链，不能宣称它已完成共享。

- **数据获取/适配层**：分别处理 Test/Production endpoint、认证、locale、deployment/context 选择及响应验证/适配。输出给同一 controller 的是经过身份与能力校验的 decision、服务器时间/活动窗口、展示授权限制或明确的 no-decision/revocation/error 结果。适配器不得拥有 polling、到期 timer、页面事件 listener 或另一个挂载状态机。
- **唯一共享生命周期**：统一拥有 polling/重新获取调度、服务器时间边界、当前授权/可挂载状态、挂载与到期撤载、断网处理、页面恢复、请求取消和迟到响应隔离。Test 的开始边界也必须移入这里，不能继续由 TestCampaignModal 自己驱动，仅抽取一个“共同卸载计时器”仍不合格。
- **展示宿主**：modal/badge/hover 保留各自布局、交互与展示频控，但消费同一 controller 的当前授权和挂载结果；不得保留平行的取数/lease effect。授权失效时所有宿主和异步 mount 回调都受同一代际失效约束，不能重新挂回旧内容。
- **生命周期之外**：Test 选择面板只改变适配器输入；Test context 创建由 Test 适配器处理。`recordTestAcceptance`（TestCampaignModal.tsx:249–297）及 `recordVisibleTestTouchpoint`（:300–332）的验收业务留在外层，仅观察共享生命周期已授权且实际可见的结果；轮询、恢复和无效/过期响应不得产生新验收。外层不得反向维持另一套展示时钟。

OpenDesign 实施位置：`touchpoint-lifecycle.ts` 统一拥有 30 秒 polling、请求超时、服务器相对授权期限、开始边界重新 GET、页面恢复/可见性、请求取消及代际隔离。各宿主的数据适配器只获取和验证响应；生产继续调用 `loadProductionTouchpointDecision`，Test 在选择作用域创建 context 并获取 placements。相同 immutable decision 的正常 polling 续期保留挂载身份，不重复展示/验收。授权到期撤下内容，不自行将服务器 active 状态改为 ended。

### Test deployment 目录发现（OPEND-3172）

“唯一共享生命周期”指展示授权与挂载的 owner，不代表 deployment 目录只能在初始化读取。目录发现由 `test-deployment-selection.ts` 独立拥有：前台每 30 秒读取目录，focus、online、pageshow 和恢复可见时立即刷新；单次请求 10 秒超时，单飞并取消过期请求。空目录、未开始和已结束的选中活动均不能终止目录发现。

- 普通客户端沿用服务端最新优先的目录顺序选择第一个受支持 deployment；调试模式保留人工选择，不自动抢选。目录不提供排期授权，未来活动只能在 realtime decision 验证后展示。
- 相同 deployment 与快照保留原 selection 对象，不能因新 JSON 对象重建 adapter、context 或挂载。替换、快照变化和成功目录确认移除才改变选择；目录请求失败、超时、格式错误不能被当成空目录，也不能延长原展示授权。
- 账号变化、卸载和页面隐藏取消旧目录请求，迟到结果不得覆盖新选择。目录选择只输入现有 Test adapter；context、decision、开始边界、续期和到期仍由原共享生命周期负责，不在目录层复制展示时钟。
- 目录刷新不发布临时空 Test session；切换期间由现有未授权 Test session 保持 Test/Production 隔离。旧授权不能随着目录发现或重试被恢复。

### 生产展示授权约束：必须原样保留上限

生产不是“活动未结束就能一直展示”。共享的 `resolveAuthorizationDeadline` 为生产保留有效截止：

`min(authorizationExpiresAt, endsAt, serverTime + 5 分钟)`

- 三个上限都必须进入共享生命周期；不能只取 `endsAt`，不能因 polling、Test 切换、重新挂载或页面恢复重新起算并延長旧授权。活动尚 active 但授权先到期时，也必须撤载。
- 按服务器时间和请求耗时保守换算本地调度；本地时钟变化、网络延迟或页面挂起不能延长已发授权。恢复时先阻止旧授权继续挂载，再重新验证；旧响应和旧 timer 不能复活已失效 decision。
- 普通窗口 `focus` 不等同于页面恢复：页面仍可见且当前 lease 尚未到期时，立即后台验证并保留原挂载，不改变原授权截止；同一内容的有效响应只续期。`visibilitychange`、`pageshow`、`online` 仍走暂停展示的恢复路径，focus 时已过期的 lease 也先撤下。请求失败、超时、匹配撤销及到期的清理规则不变。
- Test 弹窗与 Production 使用同一展示频控：弹窗实际可见即写入 localStorage `touchpoint-displayed:v1:<账号>:<活动ID>`，同一账号、活动在本设备只自动弹出一次，跨刷新、重新挂载与客户端重启保持；Test 与 Production 共用该记录。已打开的弹窗可在续期、验证与语言切换中保持；此后同一活动的新 deployment、临时空 decision 或关闭后的重新下发均不再自动弹出。账号角标与 hover 不受该频控影响。
- 生产 loader 的 404 是 no-decision，并不自行撤销有效 lease；只有有效且绑定当前 touchpointDecisionId/deploymentId/activityId/contentVersionId 的 410 receipt 才构成服务端撤销。匹配的撤销清除当前展示，但不停止后续发现新活动。非 Abort 的当前请求失败仍诊断后 clear。恢复期间先暂停旧展示；no-decision 或不匹配撤销只能保留尚未到期的原授权及原截止，不能续期或复活过期授权。
- **用户已确认：Test 也由服务端返回 authorizationExpiresAt，与 Production 使用相同的短期展示授权规则。** OpenDesign Test DTO 已将此字段设为必填；适配器不得伪造授权或 fallback 到仅受 endsAt 限制。Vela 新响应仍待交付验证。
- Vela 当前生产服务端最长授权 60 秒（`services/api/src/touchpoints/persistence.ts`：`resolveProductionRuntime`）；Test 每 GET 使用同一 serverTime 生成 `authorizationExpiresAt = min(endsAt, serverTime + 60 秒)`。before/ended 也返回该字段及完整 metadata，但不可挂载；ended 的授权时间可早于 serverTime。客户端 5 分钟安全上限不是服务端授权时长，不能延长 60 秒授权。
- 两种数据源进入同一授权与展示算法：服务器确认 active 且授权有效才能挂载；授权或活动到期取较早者撤载，断网也不续期。只有新的有效服务端响应可以续期；本地计时只能使展示失效，不能自行将 before 激活。

### 两层契约：API 可不同，展示生命周期相同

Test/Production 保留各自 endpoint、认证、选择方式和响应形状，不要求生产接口改为 Test 三态 200。两个适配器统一输出已验证的 identity/content、服务器窗口及授权限制，交给同一 lifecycle owner；统一 polling、挂载、撤载、恢复和迟到响应隔离。Test 选择与验收外置。生产既有 no-decision、撤销和失败语义按前文保留，不把不同响应混为相同撤销信号。

OpenDesign 本地 DTO 与客户端已按上述分层实现；Vela 侧 DTO、服务端、适配器及 fixtures 仍需迁移并完成真实联调，不能因本地实现完成而宣称两仓已交付。

### 共享完成的验收要求（两仓整体仍待验收）

1. 从 Test 和 Production 真实入口分别追踪到同一 lifecycle owner；旧平行 effects/timers/listeners 已移除，适配器仅取数与适配。代码调用链证据与行为验证都要有。
2. 在同一生命周期的验证入口替换两个实际适配器，覆盖 polling、before→active→ended、离线到期、页面恢复和迟到响应；再分别通过两种环境的实际宿主验证挂载/撤载。
3. 生产额外覆盖 authorizationExpiresAt 早于 endsAt、5 分钟上限、窗口仍 active 但 lease 已过期、匹配/不匹配 410 receipt、404 不等于撤销；确认 Test 切换和恢复不会延长生产授权。
4. Test 面板与验收回执外置；非 active/未授权/未实际挂载不验收，polling 不重复回执。生产原有展示频控与交互也必须保留。

此前 27 个相关 Test/host 测试和本地 Chromium Test fixture 的结果，只证明先前 Test 改动的已验证行为；**既不证明 Production 已走同一逻辑，也不证明本节共享目标完成**。

## Wire 契约

OpenDesign 客户端 DTO 位于 `@open-design/contracts/api/touchpointTestRuntime`。Vela 与 OpenDesign 按下列 wire 契约对齐，但两个仓库**不得互相 import**对方的 contracts/package；Vela 应用等价的本地 type/schema，不能另造不同字段或语义。

```ts
import type {
  TestRuntimeAcceptanceRequest,
  TestRuntimeContext,
  TestRuntimeContextRequest,
  TestRuntimeDecision,
  TestRuntimeScenario,
  TestRuntimeScheduleState,
  TestRuntimeTiming,
} from "@open-design/contracts/api/touchpointTestRuntime";

// TestRuntimeScenario = "realtime"
// TestRuntimeScheduleState = "before" | "active" | "ended"
// TestRuntimeContextRequest = { deploymentId: string; scenario: TestRuntimeScenario }
// TestRuntimeContext = TestRuntimeContextRequest & {
//   testerMemberId?: string; updatedAt: string // ISO-8601
// }
// OpenDesign DTO 已同步授权字段；Vela 等价类型与响应仍需实现/验证。
// TestRuntimeTiming = { serverTime: string; startsAt: string; endsAt: string; authorizationExpiresAt: string } // UTC ISO-8601
// TestRuntimeDecision<Content, StaticActions> = {
//   deploymentId: string; activityId?: string; snapshotHash?: string;
//   artifactHash?: string; manifestHash?: string; placementKey: string;
//   requiredCapabilities: string[]; content: Content; staticActions: StaticActions;
//   testContext: TestRuntimeContext & { scheduleState: TestRuntimeScheduleState }
// } & TestRuntimeTiming
// TestRuntimeAcceptanceRequest = {
//   placementKey: string; hostVersion: string; locale: string;
//   scenario: TestRuntimeScenario; evidence: string
// }
```

`simulatedAt` 已删除，不得出现在 context、decision、数据库新写入、客户端校验或 acceptance 依据。`testerMemberId` 由服务端认证得到；客户端不得伪造它。`TestRuntimeDecision<Content, StaticActions>` 在顶层保留 deployment/activity/snapshot/artifact/manifest identity、placement、`requiredCapabilities`、content 和 staticActions，并附 timing/context；它是统一 shape，不得将 non-active 做成缺 metadata/content 的变体。

### 请求与响应范例

继续使用既有 endpoints。

```http
POST /api/v1/touchpoints/runtime/test-context
Content-Type: application/json

{"deploymentId":"odquc46ptdedpba1c42w5a49","scenario":"realtime"}
```

```http
201 Created
Content-Type: application/json

{
  "deploymentId":"odquc46ptdedpba1c42w5a49",
  "testerMemberId":"<authenticated-member-id>",
  "scenario":"realtime",
  "updatedAt":"2026-09-14T08:15:35.000Z"
}
```

```http
GET /api/v1/touchpoints/runtime/test?deploymentId=odquc46ptdedpba1c42w5a49&placementKey=vela.web.console-overlay&locale=zh-CN
```

以下是**局部说明性响应**，只展开本次新增/关键字段；`content` 保持既有完整 payload shape，不是此处省略字段的替代协议。

```http
200 OK
Content-Type: application/json

{
  "deploymentId":"odquc46ptdedpba1c42w5a49",
  "activityId":"<existing-activity-id>",
  "snapshotHash":"sha256:<existing-64-hex-snapshot-hash>",
  "artifactHash":"sha256:<existing-64-hex-artifact-hash>",
  "manifestHash":"sha256:<existing-64-hex-manifest-hash>",
  "placementKey":"vela.web.console-overlay",
  "requiredCapabilities":["hover","static-action"],
  "staticActions":[],
  "content":{"id":"<existing-content-version-id>","placementKey":"vela.web.console-overlay","...":"existing payload unchanged"},
  "testContext":{
    "deploymentId":"odquc46ptdedpba1c42w5a49",
    "testerMemberId":"<authenticated-member-id>",
    "scenario":"realtime",
    "updatedAt":"2026-09-14T08:15:35.000Z",
    "scheduleState":"ended"
  },
  "serverTime":"2026-09-14T08:15:45.000Z",
  "startsAt":"2026-09-14T07:47:00.000Z",
  "endsAt":"2026-09-14T08:00:00.000Z",
  "authorizationExpiresAt":"2026-09-14T08:00:00.000Z"
}
```

`startsAt < endsAt` 必须成立；`serverTime` 可以在窗口外。临界点 start 包含、end 排除。Vela 用单一 `serverTime` 同时生成 response 与 `scheduleState`，避免同一响应自相矛盾。

同一 serverTime 还用于生成最长 60 秒的 authorizationExpiresAt。active 响应必须满足 `serverTime < authorizationExpiresAt <= min(endsAt, serverTime + 60 秒)`。缺少/非法授权时间或超出上限不得挂载、回执或续期；before/ended 带完整字段不代表授权展示。before 必须重新 GET 得到 active 且有效的新授权，不能按本地计时启用旧响应。

```http
POST /api/v1/touchpoints/test-deployments/odquc46ptdedpba1c42w5a49/acceptances
Content-Type: application/json

{
  "placementKey":"vela.web.console-overlay",
  "hostVersion":"<existing-host-version>",
  "locale":"zh-CN",
  "scenario":"realtime",
  "evidence":"https://<existing-approved-evidence-location>",
  "hostCompatibility":{"...":"existing optional report shape"}
}
```

窗口不是 active 时，服务端必须拒绝写入（保持项目现有错误风格；可用明确码 `test_schedule_not_active`），不创建 acceptance，避免 promotion 将其误认为验收齐全。

## Vela 实施定位与改法

以下位置来自 `powerformer/vela` 检索到的当前实现（commit `7cbaeb015196c8ed4bdd669905b3811250335b59`），是待迁移引用，不代表已修改。

| 位置 | 当前职责/旧行为 | Vela 必须改动 |
| --- | --- | --- |
| `services/api/src/touchpoints/routes.ts`：`testContextSchema`、`POST /api/v1/touchpoints/runtime/test-context` | schema 接受 `before/active/after/wake`，再调 `repository.selectTestContext` | 改为严格 `{ deploymentId, scenario: z.literal("realtime") }`；继续从认证 principal 填 tester；旧值或额外 `simulatedAt` 返回既有 `invalid_test_context` 400。 |
| 同文件：`GET /api/v1/touchpoints/runtime/test` | 调 `repository.resolveTestRuntime({ deploymentId, placementKey, locale, testerMemberId })` 后直接返回 decision | 保留认证、查询、404、413；repository 每 GET 取一次 now，返回完整 decision、顶层 timing 及重算 state。route 不缓存 decision。before/ended 仍 200。 |
| 同文件：`POST /api/v1/touchpoints/test-deployments/:id/acceptances` | 接受任意非空 scenario 后调 `recordTestAcceptance` | schema 收紧为 `z.literal("realtime")`；repository 写入事务内再判真实 active，不能只作 route 前置检查。 |
| `services/api/src/touchpoints/persistence.ts`：`TestScenario`、`TestContext`、`TestContextRow`、`toTestContext`、`simulatedTimeForScenario`、`scheduleStateAt`、`TestRuntimeDecision` | 四种模拟场景；context 有 `simulated_at`；模拟函数生成时刻；decision 无顶层 timing | scenario 只留 realtime；删 `simulatedAt`/`simulated_at` 投影和 `simulatedTimeForScenario`；`scheduleStateAt` 可保留为纯函数但输入必须是本次 server instant；decision 顶层加 `serverTime/startsAt/endsAt/authorizationExpiresAt`。 |
| 同文件：`PostgresTouchpointRepository.selectTestContext`、`resolveTestRuntime`、`recordTestAcceptance` | context 写入/更新；resolve 拼 Test snapshot/context；acceptance 写证据 | select 只持久化 realtime 与 `updated_at`；resolve 每 GET 用 now + snapshot window 构建完整 timing/state 及最长 60 秒授权；acceptance 的 active 判定与写入在同一事务。 |
| touchpoints 的 test-context schema migration（路径/命名遵从 Vela 现有 migration 约定） | 当前 `touchpoints.test_contexts` 含 `scenario` 与 `simulated_at`；API SQL mock 也引用它 | context 是可重选临时状态，不是 deployment/acceptance 审计。clean cutover 下：停写旧服务后令旧 contexts 失效并清理，DB owner 批准后收紧 schema 到 realtime 并移除 `simulated_at`。若不能安全清理，可保留 legacy 存储但 runtime 必须拒绝读取/解释它；不得改 deployments、acceptances 或其历史。 |
| `apps/web/src/components/test-campaign-contract.ts` | `TestScenario`、`VelaTestContext`、`VelaTestDecision` 和 `velaTestDecisionMatchesSelection` 比较 `simulatedAt`，并要求 active | 切到 realtime DTO：删旧 scenario/simulatedAt；校验完整授权字段、最长 60 秒上限、ISO timing、`startsAt < endsAt`、state 与 serverTime/window 一致；保留 snapshot、placement、capabilities、staticActions 绑定。non-active 保留同形 content，但不挂载。 |
| `apps/web/src/components/test-campaign-console.tsx`、`apps/web/src/components/production-campaign-float.tsx` | 历史检索入口，非本次 Vela 调用链核查结果 | 在 Vela 客户端内核查并合并到同一生命周期；console 保留选择/验收外层，Test/Production 获取适配器负责协议差异。不能仅迁移 realtime DTO 或复用 float 就声称共享，必须提交实际调用链与两环境验收证据。 |

## 需迁移引用与验证

已检索到的引用：

- `services/api/test/touchpoints-test-context.test.ts`：mock `touchpoints.test_contexts` SQL 与 context persistence。
- `services/api/test/touchpoints-browser-runtime-routes.test.ts`：runtime routes/依赖注入。
- `services/api/test/touchpoints-activities.test.ts`：活动/Test runtime 行为。
- `services/api/test/e2e/touchpoints-restore-lifecycle.test.ts`：Test deployment 生命周期与 promotion/restore 边界。
- `apps/web/tests/unit/production-campaign-float.test.ts`、`apps/web/tests/browser-agent/production-campaign-float.spec.ts`：Web 浮层 fixture/消费。
- `apps/web/src/components/test-campaign-console.tsx`、`apps/web/src/components/production-campaign-float.tsx`、`apps/web/src/components/test-campaign-contract.ts`：Admin/Vela Web 类型、选择校验、渲染入口。
- `services/api/src/touchpoints/promotion.ts` 与 `routes.ts` promotion path：`acceptance_incomplete` 阻断仍必须只承认真实 active 窗口形成的 acceptance。

实现时对上述导出类型/方法先跑 references，再全量迁移实际命中处；不要臆测或改动未检索到的消费者。

## 历史 acceptance 有效性：同库与跨库必须同时过滤

Vela review 补充的交付要求：同库 promotion 和跨库 `getPromotionEvidence` 必须消费同一份有效性判定；仅收紧新 acceptance 写入不能隔离旧证据。本次不声称远程 Vela 已实现该过滤。

- 先过滤，再计算必需 placement 的完整性。有效记录必须为 `scenario === "realtime"`，绑定目标 Test deployment、不可变 snapshot/hash、placement 及既有身份/兼容性要求；可信服务端验收时刻必须位于 `[startsAt, endsAt)`。只有 scenario 字符串不够，缺失可信时间/绑定信息的记录不得计入。
- 旧 before/active/after/wake 或未知 scenario 保留审计但不计入；不得改名 realtime、补造时间或重写历史。判断的是验收发生时刻，不是 promotion 当前时刻；已结束活动中的有效历史 realtime 验收不会仅因现在过期而失效。
- **同库 promotion**：过滤后未覆盖所有必需 placement，沿用 `acceptance_incomplete` 阻断。
- **跨库 `getPromotionEvidence`**：导出/聚合前应用同一过滤，不得把原始记录 count 或未过滤的“齐全”布尔值作为证据。跨库消费侧须验证证据来源、绑定和有效性契约，拒绝旧导出或不可验证记录，不能绕过源侧过滤。格式按 Vela 现有跨库协议落地，不在本文臆造字段。
- 两条路径均须验收：仅旧模拟记录失败；旧新混合但有效覆盖不足失败；完整有效 realtime 证据通过；错 snapshot/placement、窗口外或缺少可信时间不计入；跨库导出/消费后结论一致。原始审计记录保持不变。

## 严格协议切换：Test 维护窗口与旧页面刷新

以下为待另行批准的操作方案，本文不执行。严格协议切换没有新旧兼容期；仅写“先 Vela、后 OD”不足以保护两仓发布之间的 Test 使用者。

1. 维护前准备好两仓新协议、各客户端共享生命周期、两条 promotion 证据过滤及可分发构建。确认能暂停 Test 而不影响 Production；若没有现成暂停/版本识别设施，须先补齐，不能假定已有开关。
2. **进入 Test 维护窗口**：通知测试者关闭旧 Test 页面，暂停选择、展示和验收；服务端受控暂停 Test context/runtime/acceptance 入口及相关 promotion 证据导出/消费。仅隐藏选择面板不够，未刷新的旧页面也必须被拒绝。Production runtime 保持服务。
3. 停止旧服务写入后，再由 DB owner 单独批准 migration；Vela schema、persistence、routes、active-only acceptance 和两条证据过滤作为同一发布单元切换。令旧临时 contexts 失效，不允许新旧实例同时按不同语义服务 Test；不重写 deployment、acceptance 历史或 snapshot。
4. **升级并刷新客户端**：Vela Web 和 OD Web 刷新至新 bundle；OD 打包客户端升级并重启至新构建，仅刷新旧版本不能代替升级。测试者重新选择 deployment，创建 realtime context，不恢复旧模拟 context。未升级/未刷新的页面继续被服务端拒绝，并有明确维护/升级/刷新提示；提示和版本识别是发布前提，不是本文声称已实现的功能。不得静默兼容旧 scenario。
5. 维护期间先走受控验收：新链路 before/active/ended、离线到期、页面恢复、迟到响应、生产授权早于活动结束、同库/跨库证据过滤，以及旧页面实际被拒绝。确认每个客户端两条入口进入同一 lifecycle owner 后，再开放 Test。维护窗口结束取决于完整链路验收，不取决于某一个仓库部署完成。

失败时保持 Test 不可用；不得通过恢复模拟 active、重放旧 context 或放松历史证据过滤回滚。以上是操作交接，不构成远程部署或数据库修改授权。

## 边界

- 未选择 context、deployment 不存在、placement 不匹配、无 runtime 授权保持现有 404/认证失败语义；不得以虚假 active 掩盖。
- `before`/`ended` **不是 404**：必须 HTTP 200，含完整既有 identity、snapshot hashes、placement、capabilities、staticActions、context、timing 和同形 `content`。它们供客户端等待开始/停用；客户端/host 非 active 时禁止挂载 content、发 runtime event 或 acceptance，并必须撤下已显示触点。
- `updatedAt` 是 context 选择更新时间，不替代 `serverTime`，不能判排期。客户端本地钟只可用于刷新/展示，不决定 active。
- 本轮仅修改 OpenDesign 本地客户端、契约、构建入口和相关测试/交接记录，不修改 Vela 运行时代码或远程环境。“不改生产”指不借此改变生产服务端协议、展示授权上限及既有推广门槛。历史证据过滤仍由 Vela 补齐；不重写 deployment/acceptance 审计或内容快照，不更改凭证和数据库连接。

## Vela 与客户端后续验收清单

- [ ] Admin 在不同电脑时区下配置/回显同一北京时间，保存的 UTC startsAt/endsAt 不变；Test/Production 客户端切换 Asia/Shanghai、UTC、America/Los_Angeles 后，对同一服务器 instant 的开始、结束和授权判定一致，覆盖开始包含、结束排除以及当地夏令时切换。
- [ ] 各客户端内 Test/Production 实际入口进入同一生命周期；旧平行调度/lease effects 移除；适配器仅取数、认证、选择和响应适配。
- [ ] 生产 authorizationExpiresAt、endsAt、serverTime + 5 分钟上限与 404/410/加载失败语义保留；两环境分别验证 polling、挂载、离线、恢复和迟到响应。
- [ ] Test DTO、服务端、两仓适配器和 fixtures 同步 authorizationExpiresAt；两种数据源均验证活动仍 active 但授权先过期、断网不续期、恢复获取新授权、before 不被本地激活、缺失授权字段严格拒绝。
- [ ] Test 面板与 acceptance 留在生命周期之外；Test fixture 不被当作 Production 共享证据。
- [ ] 同库 promotion 与跨库 getPromotionEvidence 使用同一历史验收有效性规则，混合/无效证据不能满足完整性。
- [ ] Test 维护窗口、旧页面刷新/旧版本升级、未升级请求拒绝、失败保持 Test 不可用均已受控演练；Production 不因 Test 切换停服。

- [ ] POST context 只接受严格 body `{deploymentId,scenario:"realtime"}`；四种旧值、额外 `simulatedAt`、畸形 body 均 400。
- [ ] 201 context 无 `simulatedAt`，仅有 realtime scenario、deployment、认证得到的 tester、`updatedAt`。
- [ ] 同一 deployment 在真实 starts 前、窗口内、ends 后的 GET 都是 HTTP 200，含合法 timing 与完整 metadata/identity，并依次为 before/active/ended；不重 POST context；只有 active 且授权有效才挂载 content。
- [ ] GET 每次由 server clock 判定；旧 context updatedAt/历史模拟时刻不能让结束窗口变 active。
- [ ] decision 的 identity/content/manifest/artifact/snapshot hashes、placement、capabilities、staticActions 保持精确绑定 immutable snapshot。
- [ ] acceptance 只接受 realtime，before/ended 由服务器拒绝且不落库；active 成功写入仍可走既有 promotion。
- [ ] migration 仅在 DB owner 批准后清理临时旧 contexts，或保留 legacy 但让 runtime 拒绝它；不 mutation deployments、acceptances、历史审计或发布 snapshot hash。
- [ ] Vela Web console/float/fixtures 无 simulated fallback；无效时间 response 不展示/不回执，non-active 200 仅等待/停用。
- [ ] 运行 Vela API scoped tests（test-context、browser runtime routes、activities、promotion/restore lifecycle）、Vela Web consumer tests，并做真实时钟本地 API smoke。

## 部署阻碍与交付状态

| 交付面 | 状态 | 可宣称的范围 |
| --- | --- | --- |
| OpenDesign 当前 worktree 客户端与 contracts | 已接入共享生命周期及必填 Test 授权；本地测试与浏览器协议 fixture 验证 | 覆盖本地客户端，不代表 Vela 新协议已部署；真实联调与正式发布仍待完成。 |
| Vela runtime、persistence、migration、acceptance 与 Vela Web 消费者 | 待实现、待部署、待真实窗口验证 | 不能将本文协议、OpenDesign worktree 代码或 A-HYT 的旧模拟回执表述为 Vela 已部署或真实时间活动已上线。 |

剩余上线阻碍：Vela 客户端共享生命周期与服务端授权响应；migration、每 GET realtime、active-only acceptance、同库 promotion 与跨库 getPromotionEvidence 历史过滤；维护窗口、旧页面策略与两仓真实窗口联调。OpenDesign 本地实现不替代这些交付，也不构成部署或数据库修改授权。
