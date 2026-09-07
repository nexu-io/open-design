# Agent-native Skill Discovery v1 决策记录

> 历史决策记录：下文的 ordinary/v1 adapter 路线已被本分支的
> [Agent-native Skill Discovery V2](agent-native-skill-discovery-v2.md) 取代。
> 不再据此限制“仅未选类型才注入”或加载已移除的 v1 adapter。
> 旧评测目录和 ground truth 保留原版本，不随本次协议升级覆盖。

## 状态

- 状态：Phase 0 实现已落地且默认关闭；真实模型质量、原生副作用观测、性能/成本与灰度控制门禁尚未完成，当前不得宣称 `canary` 或 `active` ready
- 决策日期：2026-09-01
- 适用范围：Open Design 新 Home 对话框、项目创建、首轮 Agent 上下文、官方 Skill 元数据暴露与运行时按需加载
- 兼容边界：显式任务类型继续使用现有 OD Next v2；本方案不修改、不放宽也不伪造 OD Next v2 的任务身份、冻结输入或任务链状态

## 1. 决策摘要

新 Home 对话框允许用户不选择任务类型，直接提交任意文本。新入口的所有 Agent 输入都使用“XML 外壳 + Markdown 内容”，但根据路由权威分成两条明确的协议：

1. **用户显式选择任务类型**：继续走现有 OD Next v2 路由、准入、冻结输入和任务链。已准入的 request stage 继续使用 `open-design.od-next-prompt-bundle/v2`；后续 clarification、production 等 continuation 也保持原协议。
2. **用户没有显式选择任务类型**：走 strategy-neutral 的 `open-design.agent-turn/v1`。首轮在 `discovery_bootstrap` 中注入完整的 Skill Discovery Skill 和当前 pinned catalog 中所有 auto-selectable 官方 Skill 的精简决策元数据。主 Agent 直接比较完整候选集，按需调用 `load` 或 `resolve --none/--clarify`，然后在同一个物理 turn 内继续任务；词法 `search` 不再是正常选择链路的前置步骤。

显式任务因现有 OD Next rollout 或 runtime capability 未获准而进入 ordinary fallback 时，不冒充 OD Next；其普通 Markdown 语义可以放入 `open-design.agent-turn/v1` 的 XML 外壳，但**不注入** Skill Discovery Skill，因为用户已经显式给出了任务类型。

v1 中，Agent 动态发现并加载 Prototype 只表示：

- 当前普通单 Agent 回合加载了独立的 strategy-neutral Prototype v1 adapter；原 OD Next v2 profile 只在 daemon 内用于核验 first-party package 身份，不作为普通回合指令返回；
- 同时加载独立的 ordinary Agent-turn orchestration；公开响应使用 discovery v1 attestation，不暴露或伪造 `AppliedStrategyBindingV2`；
- side-file bytes 不进入模型响应；daemon 对选中 package 二次校验并签发短期 prepare，`od` CLI 在 Agent 自身 cwd 权限域内原子 materialize 到项目相对 `.od-skills/`，随后 daemon 以一次性 token 复核 scope、state revision、catalog、bundle 与 receipt 后才写 ledger；最终 stdout 只返回 `materializedRoot` 与 relative path/digest/size roster；
- Agent 在当前回合按这些规则完成工作。

它**不表示**当前回合已经成为完整 OD Next 任务，不创建假的 OD Next recipe identity，不事后篡改 frozen package，不伪造 request/clarification/production 状态，也不宣称拥有 OD Next 的 native continuation、plan contract 或 task execution。

若未来要求“Agent 首轮动态判断出 Prototype 后，立即进入完整 OD Next 任务链”，必须另立 OD Next v3/两阶段 intake 方案：先完成 discovery intake，再由 daemon 创建真实的 task execution 和冻结输入，随后继续同一 native session。单纯给 v2 schema 增加 optional task type 不可接受。

## 2. 为什么需要独立的 strategy-neutral 协议

现有 OD Next v2 在 Agent 启动前就要求确定：task type、唯一 Task Skill、general orchestration、固定 stages、recipe identity、task input snapshot 和 frozen Skill package。这些字段参与任务身份、缓存分区、恢复和审计，不能等 Agent 在 turn 中判断后再补写。

无类型首轮的核心事实恰好相反：开始时没有 task type，也可能最终没有适用 Skill。因此 v1 采用独立的、与任何策略无关的 turn envelope，而不是弱化 OD Next v2。

### 2.1 `open-design.agent-turn/v1` 最小结构

序列化必须复用 `packages/contracts` 中的 canonical XML primitive。所有 Markdown 均放在 CDATA text node 中，user prompt slot 固定位于最后；有文本时用户原文位于该最后内容节点，附件-only 时使用 terminal empty marker，避免 XML 注入和错误的指令优先级。

```xml
<open_design_agent_turn schema="open-design.agent-turn/v1">
  <instructions>
    <![CDATA[# Open Design instructions
...]]>
  </instructions>
  <attachments_empty/>
  <context>
    <![CDATA[# Context
...]]>
  </context>
  <discovery_bootstrap>
    <![CDATA[# Agent-native Skill Discovery
...]]>
  </discovery_bootstrap>
  <user_first_prompt>
    <![CDATA[用户原始请求]]>
  </user_first_prompt>
</open_design_agent_turn>
```

协议要求：

- 根 schema 固定为 `open-design.agent-turn/v1`；不得复用 `open-design.od-next-prompt-bundle/v2`。
- 节点顺序固定为 instructions、attachments/empty、context/empty、lifecycle、user prompt/empty；`user_first_prompt` 或 `user_first_prompt_empty` 必须最后出现。
- XML 只承担结构和边界，节点内部继续使用 Markdown。
- `]]>`、多语言文本、Markdown 代码块和用户提供的伪 XML 都必须 canonical round-trip。
- 附件-only turn 可以没有文本；此时最后一个槽位必须是 canonical
  `<user_first_prompt_empty />` marker。无文本且无可读附件仍由 chat route 拒绝。
- 首轮 cold seed 放入完整 Skill Discovery Skill 和完整官方候选元数据；正常 native resume 不重复注入。
- host 已明确观测到的 cold retry 或后续 cold Run 使用
  `compact_lifecycle_capsule`，并再次附上当前完整官方候选元数据，保证冷重建仍有完整选择空间；需要完整 Skill body 时由 Agent 重新 `load`，不得把未经验证的历史 body 从聊天文本猜回来。当前没有 native context compaction 信号，不能宣称能在压缩发生时主动注入 capsule。

## 3. 路由权威与兼容矩阵

### 3.1 创建权威

新 Home 客户端在“Design 模式 + 用户未选择任务类型”的提交中，通过 `CreateProjectRequest` 顶层 typed 字段声明：

```ts
skillDiscovery: {
  mode: 'agent',
  catalog: 'open-design-official'
}
```

该字段是客户端的路由声明，不是最终权威。Daemon 必须重新验证组合是否合法，并在项目 metadata 中写入 daemon-owned binding：

```ts
skillDiscoveryBinding: {
  schemaVersion: 1,
  provenance: 'no_explicit_task_type',
  catalog: 'open-design-official',
  boundAt: number
}
```

规则：

- 客户端不得直接写 `metadata.skillDiscoveryBinding`；generic create/update route 必须剥离或拒绝该 key。
- `skillDiscovery` 与显式 task type、OD Next automatic task profile、普通 Skill、example、context plugin 或显式 executable scenario plugin 冲突时，daemon 返回 400，不能猜测优先级。
- 显式选择的普通 Skill 走既有用户权威路径，不携带 discovery marker；Discovery Skill 不得静默替换用户明确选择的 Skill。
- 只有 verified `skillDiscoveryBinding` 才能 suppress 当前的 `od-default`、kind default 和 run-time default plugin fallback。
- verified binding 只是 conversation eligibility，不是每个后续 Run 的永久执行权威。若当前 Run 显式选择 task/profile/Skill、executable plugin 或 project metadata 中存在 `contextPlugins`，该 Run 必须设置 `skillDiscoveryEnabled=false`，既不注入 discovery，也不继承旧 Run 的 wrapper gate。
- 老客户端不发送该字段时保持当前行为，便于 kill switch 和版本回滚。
- 每个 conversation 的首轮是否注入 Discovery Skill，由 verified project binding 加 conversation ledger 决定；不得仅凭 `skillId === null`、`kind === other` 或 prompt 文本推断。

### 3.2 路由矩阵

| 用户权威 | Prompt 外壳 | Discovery Skill | 任务语义 |
|---|---|---|---|
| 显式任务类型，OD Next v2 准入 | `open-design.od-next-prompt-bundle/v2` | 不注入 | 完整 OD Next v2 |
| 显式任务类型，OD Next v2 未准入而 ordinary fallback | `open-design.agent-turn/v1` | 不注入 | 现有 ordinary 语义，不冒充 OD Next |
| 无显式任务类型，verified discovery binding | `open-design.agent-turn/v1` | conversation 首轮注入完整策略与候选元数据 | 普通单 Agent 动态选择 |
| 无显式任务类型，已有 native session | `open-design.agent-turn/v1` turn delta | 不重复完整注入 | Agent 按 session 记忆和 ledger capsule 自主决定 |
| legacy 客户端或 kill switch off | 现有安全 fallback | 不注入 | 不改变旧行为 |

## 4. Official-only Skill Catalog

### 4.1 权威来源

`OfficialSkillDiscoveryCatalog` 由 daemon 拥有，`packages/contracts` 只拥有纯 DTO、schema 和 canonical serializer。Catalog 不能直接复用当前 user-first 的 `listAllSkills()`，因为用户 Skill 可以用同 id shadow built-in Skill。

v1 官方来源只有：

1. Open Design 随产品发布的 built-in functional Skills 与已声明的 design templates，且必须从各自 built-in root 直接解析；
2. Open Design bundled strategy package 中经过 manifest、版本、资源 roster 和 digest 验证的 task profiles，经 adapter 归一化成可发现 Skill；
3. 后续新增的其他 first-party provider，必须先通过同等级身份校验后才能加入。

当前验证分支移除旧的 162 个 functional Skill，改为对 `7d44e4062` 新增的
60 个 `design-templates/` 目录做 exact-set 覆盖，并保留 4 个 task profile，
共 64 个可选择候选。四个 task profile 固定可作 primary；60 个具体模板作
auxiliary。编排随 task profile 加载，不占一个候选名额。来源和数量口径见
`skill-discovery-routing-catalog.md`；协议和 renderer 不依赖固定数量。

明确排除：

- user、team、community 或远程临时安装的 Skill；
- 未列入官方中央声明的 design templates；
- design systems；
- craft；
- Discovery Skill 自身；
- 位于 plugin atoms、orchestration、router、pipeline 或内部维护目录、而不属于
  产品 `skills/` regular root 的内容；
- 缺少中央声明、身份或资源校验失败的官方内容。

“允许从所有 Open Design 官方 Skill 中选择”指所有**完成 metadata 迁移并通过 gate 的官方候选**。Canary 可以用更小 allowlist 控制风险，但 active 全量发布前，所有计划自动选择的官方 Skill 和现存 task-type profile 都必须完成 metadata 与评测；不能用“官方”标签替代可选择性审核。

### 4.2 中央 discovery metadata gate

v1 不把自动选择字段写回原始 Skill body。Daemon 从官方 strategy package
中的独立 `agent-discovery/functional-catalog.json` 读取 product-owned 声明，并
按 `source` 将其 `sourceFolder` 与产品 `skills/` 或 `design-templates/`
regular root 做 exact-set 校验。省略 `source` 时兼容原有的 `skills`。每个候选
必须显式声明：

```json
{
  "source": "design-templates",
  "sourceFolder": "huashu-white-gallery",
  "id": "huashu-white-gallery",
  "autoSelectable": true,
  "role": "auxiliary",
  "outputKinds": ["web-experience"],
  "positiveExamples": ["Make a quiet gallery page for a poster collection"],
  "negativeExamples": ["Use an explicitly requested incompatible visual style"],
  "conflictsWith": [],
  "version": "1",
  "resources": ["example.html"]
}
```

要求：

- `sourceFolder` 必须覆盖且只覆盖一个 regular built-in Skill 目录；`id` 必须
  精确等于该 `SKILL.md` frontmatter 的 canonical `name`。
- `autoSelectable` 必须显式为 `true`；缺失、类型错误或 `false` 都 fail closed。
- functional Skill 与具体模板的 `role` 固定为 `auxiliary`；task profile declaration 固定为
  `primary`。协议 DTO 仍保留 `either`，但当前官方 provider 不签发该角色。
- `outputKinds` 必须是非空、受控枚举或受控 slug 列表。
- `positiveExamples` 与 `negativeExamples` 都必须非空，且进入 75/150 条评测集的覆盖审计。
- `conflictsWith` 使用 canonical official Skill id；未知 id、自己冲突、非对称冲突或循环冲突由 validator 拒绝或要求显式豁免。
- catalog item 必须携带 `origin`、`version`、`contentDigest`、resource roster digest 和 catalog version。
- task profile 的 discovery metadata 放在独立且受 contracts schema 校验的
  `agent-discovery/catalog.json` 中；不得修改现有 OD Next v2
  `open-design.json`、profile Markdown 或 package identity 来承载这套声明。

当前中央 declarations 的 `conflictsWith` 均为空；实现了结构校验和运行时 conflict
gate，不等于完成了真实语义冲突策展。明显互斥 Skill 的 conflict review 与对应
gold cases 仍属于真实模型发布质量门禁，不能把“validator 可用”写成“冲突风险已
覆盖”。

### 4.3 Strategy-neutral task-profile adapter 与资源 materialization

四个 task profile 都使用 `agent-discovery/task-profiles/*.md` 下的独立 v1
adapter 和 `agent-discovery/ordinary-orchestration.md`。它们不包含 OD Next stage、
RunManifest、Plan Contract 或 task-chain 指令。Prototype 还可能声明 handset
shell、layout CSS 等 resources，因此一次 `load(prototype)` CLI 调用必须完成以下
两阶段协议：

1. 重新解析 exact bundled package identity；
2. 在 daemon 内校验原 v2 profile binding/digest，再单独校验 v1 adapter、ordinary orchestration、catalog revision 与 attestation；原 v2 binding 不进入公开 response；
3. daemon 对 resource bytes 做第二次 fenced read，逐个复核 size、digest、mode、symlink、traversal 与 TOCTOU，并返回绑定 run scope、state revision 和 bundle fingerprint 的 30 秒一次性 prepare token；
4. prepare DTO 中的 bytes 只允许由 bundled CLI 在内存中消费，不得写入 Agent-visible stdout；
5. CLI 在 Agent 自身 cwd 权限域内，将完整资源集原子发布到稳定的项目相对 `.od-skills/discovered-<id>-<digest>/`；root 或 destination 被非目录或 symlink 占用时 fail closed；
6. CLI 将仅含 relative path/digest/size 的 materialization receipt 交给 commit endpoint；daemon 先消费 token，再重新校验 run/project/conversation scope、state revision、catalog metadata、bundle fingerprint 和 exact receipt；
7. 只有 commit 全部通过后才写入成功 ledger，并向 Agent 的最终 stdout 返回 v1 profile、ordinary orchestration、attestation、`materializedRoot` 和 digest roster。

`.od-skills/` 是 Agent cwd 下的项目私有 materialization namespace，不是 daemon
data root，也不是用户交付物。daemon 不解析或写入该项目路径；其权威只来自一次性
prepare/commit fence 与 ledger。任何一步失败都不能伪写成功 ledger、返回半个
profile 或回落到同 id user Skill；已完整 materialize 但 commit 失败的 alias 不获得
ledger 权威，后续 exact load 可按确定性 alias 覆盖。

## 5. Agent-native 工具协议

Agent 通过现有 `OD_NODE_BIN`、`OD_BIN`、`OD_DAEMON_URL` 和 run-scoped `OD_TOOL_TOKEN` 调用 wrapper。对 Agent 可见的命令为：

```text
od tools skills load --id <official-id> --catalog-revision <sha256:...> --candidate-digest <sha256:...> --role primary|auxiliary (--purpose <text> | --purpose-file <path|->) [--replace <id>] --json
od tools skills deactivate --id <active-auxiliary-id> (--reason <text> | --reason-file <path|->) --json
od tools skills resolve (--none | --clarify) (--reason <text> | --reason-file <path|->) --json
od tools skills status [--rehydrate] --json
od tools skills rehydrate --json
```

对应 daemon endpoints：

- `POST /api/tools/skills/load`（prepare，仅供 bundled CLI 消费）
- `POST /api/tools/skills/load/commit`（一次性 commit）
- `POST /api/tools/skills/deactivate`
- `POST /api/tools/skills/resolve`
- `GET /api/tools/skills/status`
- `POST /api/tools/skills/rehydrate`

兼容期仍保留 `od tools skills search` 与 `POST /api/tools/skills/search`，用于诊断、
旧 prompt 和未来候选规模重新变大时的降级能力；B 组正常链路不要求也不引导 Agent
先搜索。

### 5.1 Catalog metadata exposure

- lifecycle Markdown 暴露 pinned `catalogVersion`、`revision`、candidate count，以及每个候选的 `id`、声明 `role`、可用于 load 的 `allowedRoles`、`name`、`description`、`outputKinds`、最多两个正例和两个反例作为边界校准、`conflictsWith`、`version` 和 `candidateDigest`。模板还暴露来自原 frontmatter 的 `routingMetadata`：双语名称、中文描述、taskType、platform、scenario、category、examplePrompt；这些分类提示不创建 catalog 中不存在的主任务类型。Catalog 可以保留更多评测/检索例子，但 prompt renderer 不枚举全部同义表达；若未来 provider 签发 `either`，Agent 必须从 `allowedRoles=[primary, auxiliary]` 中明确选择一个 resolved role。
- primary 记录稳定排在 auxiliary 之前；同角色按 canonical id 排序。排序只服务可读性，不是 platform 分类结果。
- 不返回完整 body、orchestration 或 side-file bytes。只有 Agent 选择后，`load` 才返回对应完整正文与 verified resource receipt。
- Agent 必须比较完整候选集进行语义判断，可以直接 `load`、clarify 或进入 `resolve --none`；不能因为某个候选在文字上最相似就强制选择。

### 5.2 `load`

- `purpose` 必填，记录 Agent 为什么在当前任务加载该 Skill；空 purpose 拒绝。
- daemon prepare 重新校验 official identity、metadata、role、配额、conflict、version、digest 和 resources，但不写项目路径或成功 ledger。
- bundled CLI 在 Agent 权限域 materialize verified bytes；commit 再复核一次性 token、scope、state revision、catalog、bundle 和 exact receipt 后写 ledger。
- task-profile load 返回 strategy-neutral v1 profile、ordinary orchestration 与
  discovery attestation；functional load 返回其官方 `SKILL.md` body。prepare bytes
  不进入 Agent-visible stdout；最终响应若存在 side files，只返回项目相对
  `materializedRoot` 与 relative path/digest/size roster。
- load stdout 进入同一个 Agent turn 的 native tool result/context；不需要 daemon 伪造第二个 user turn。
- endpoint receipt 只证明 daemon 返回了内容，不能单独证明模型已阅读、遵守或产出正确结果。

### 5.3 `resolve --none` / `resolve --clarify`

- 没有合适 primary 时必须显式调用，不得为了完成流程硬选最接近的 task
  profile。若已经加载一至两个 functional auxiliary，`none` 表示“本任务不需要
  primary”，不会丢弃这些 auxiliary。
- `reason` 必填；`none` 成功后 conversation 本轮 discovery state 变为
  `resolved_none`（已有 primary 时仍保持 `resolved_skill`），`clarify` 成功后变为
  `clarification`。
- `resolve --none` 是安全成功路径，不计为 coverage 失败；`resolve --clarify` 将状态切到 `clarification` 并等待用户下一轮回答；是否正确由 hard-negative/ambiguity rubric 判断。

### 5.4 Primary / auxiliary 约束

- 一个 conversation 同时最多 1 个 active primary。
- 同时最多 2 个 active auxiliary，且 id 必须不同。
- metadata role 不允许的 load fail closed。
- 第二个 primary 必须显式带 `replaceId=<old-id>`（CLI 为 `--replace`）和新的 purpose；ledger 将旧 primary 标成 superseded。
- 已占满两个 auxiliary 或 auxiliary 不再适用时，先调用 `deactivate` 并提供
  reason；ledger 将旧 auxiliary 移入 superseded，再允许加载新的 auxiliary。
- v1 不声称能从已经运行的 native session 中删除旧 Skill 文本。Agent 必须根据 conflicts 和已读指令自行判断是否需要冷重建；当前实现不会伪造严格 unload。
- 重复 load 同一 digest 是 `reuse`，不新增配额；digest 变化必须重新确认身份并记录新 revision。

## 6. Discovery Skill 的行为合同

Discovery Skill 只在 verified 无类型 conversation 的首轮完整注入一次；完整候选 metadata 在每个可观测 cold physical context 注入。它告诉主 Agent：

- 根据当前用户 query、已知上下文和完整官方候选元数据，自主决定 `reuse`、`replace`、`augment`、`none` 或 `clarify`；
- 错选比漏选严重，不确定时优先 `resolve --none` 或提出一个会实质改变任务的 clarification；
- 清晰的“帮我做一个官网”属于 Prototype 正例；官网、landing page、web app 和产品网站都可以由 Prototype profile 承担；
- 对全部 metadata 做语义比较，词法 search 不是正常链路的前置条件；候选显示顺序不是 platform decision；
- functional Skill 与具体模板当前只作 auxiliary；只有成功 primary `load`、exact primary
  reuse 或 `resolve --none` 才完成 resolution，auxiliary-only load 不会解锁 wrapper；
- 在完成 resolution 前，不得开始会改变项目或外部状态的工作；
- 所有候选只暴露精简 metadata；完整 Skill body 仍只在真正需要时按需加载；
- 后续 turn 何时重新检查 catalog、load 或替换由 Agent 根据任务变化判断，platform 不运行每轮 classifier。

## 7. Conversation ledger 与 lifecycle capsule

### 7.1 Ledger

状态按 conversation 持久化，而不是只存在 run 内存或 project metadata 中。最小字段：

```ts
type SkillDiscoveryConversationLedgerV1 = {
  schemaVersion: 1;
  conversationId: string;
  projectId: string;
  catalogRevision: string;
  status: 'pending' | 'resolved_skill' | 'resolved_none' | 'clarification';
  bootstrapRunId: string;
  activeRunId: string;
  activePrimary: LoadedSkillRef | null;
  activeAuxiliaries: LoadedSkillRef[];
  superseded: LoadedSkillRef[];
  lastResolution: ResolutionRef | null;
  revision: number;
  updatedAt: number;
};
```

Ledger 只记录实际发生的 API 行为，不记录或推测 Agent 的隐藏思考：

- 实际 `search`：query digest/安全摘要、filters、catalog version、候选 id/score、时间、run id；
- 实际成功的 `load`：id、role、purpose digest、version、digest、replaceId、时间、run id；失败请求由 API failure/trace 记录，不伪写成功 ledger event；
- 实际成功的 `deactivate`：auxiliary id、content/catalog digest、reason digest、时间、run id；旧引用进入 superseded，其他 active 选择与当前 resolution 保持不变；
- 实际 `resolve`：none/clarify、reason digest、时间、run id；
- 不能因为 prompt 中存在候选 metadata 就生成搜索或加载记录；ledger 只记录实际 endpoint 行为。

当 `ensureSkillDiscoveryForRun` 观察到 catalog revision 变化时，不允许把旧
选择静默视为新版本：原 active primary 与 auxiliaries 全部移入 superseded，
active 集合清空，`lastResolution` 清空，状态重新变为 `pending`，同时更新
`activeRunId`、catalog revision 和 ledger revision。Agent 必须基于新 catalog
重新比较 metadata 并 load/resolve。

原始用户 query 是否进入 trace，继续遵守现有隐私与 redaction policy；ledger 默认保存 digest 和必要的结构化证据，不另存一份无限期原文。

### 7.2 Compact lifecycle capsule

当 host 明确收到 native resume 信号时不重复完整 Discovery Skill。对于已观测的
retry cold start 或后续 cold Run，host 从 verified ledger 生成 compact capsule，
至少包含：

- discovery schema；
- catalog revision；
- state；
- active primary/auxiliary 的 id 与 content digest；
- superseded ids；
- 最后一次 resolution；
- primary/auxiliary 配额；
- 完整 body 是否仍在 native context 中为 unknown；若不确定，要求按 exact id/digest 重新 `load`。

pending/clarification capsule 还携带精简且可执行的
`status --rehydrate`、`load`、`resolve --none/--clarify` 协议；当前完整候选 metadata
紧随 capsule 一起注入，并重申
错选优先级与 auxiliary-only 不解锁。Capsule 是恢复索引，不是 Skill body，也
不能用历史 assistant 文本重建官方内容。当前 host 没有 native context
compaction signal，也没有在 compaction 当刻自动补发 capsule 的能力；相关恢复
只能由可观测的 cold retry/later Run 触发。

每个实际发送的 discovery lifecycle 都有独立 prompt-stack telemetry section，
记录 bootstrap/compact/none、catalog revision、candidate count 和 lifecycle 的真实
UTF-8 bytes；catalog 正文不进入 telemetry content。对于 Aider、DeepSeek 等把 prompt
放在 argv 的 adapter，daemon 在 spawn 前对完整 lifecycle 做 transport budget
preflight。超限时以 `AGENT_PROMPT_TOO_LARGE` fail closed，不得退回词法 search。
当前迁移期 166 个候选的 lifecycle 已超过 POSIX 120,000-byte argv 安全预算，因此
这些 argv adapter 不进入行为路径；catalog 收敛到目标约 20 个后仍需同时通过
lifecycle preflight 和最终 composed-prompt preflight，才能解除该 transport 限制。

## 8. Wrapper 门禁、原生工具与安全边界

### 8.1 可强制的 wrapper gate

在 ledger state 为 `pending` 时，run-scoped tool authorization 只允许：

- `skills:search`
- `skills:load`
- `skills:deactivate`
- `skills:resolve`
- `skills:status`
- 明确列入 allowlist 的只读 Open Design wrapper

会修改项目、生成媒体、应用 Library asset、执行写型 connector 或产生外部副作用的 Open Design wrapper 返回 `TOOL_OPERATION_DENIED`，并说明需先完成 Skill resolution。成功 primary `load` 或 `resolve --none` 后，daemon 才让这些 wrapper 正常通过；auxiliary-only load 仍保持 pending，直到 primary 或 none 决议。

该 gate 是 endpoint 级强制边界，必须有 route receipt 和 token operation 证据。
授权同时校验 tool grant 的 `runId/projectId`、内存 Run 的
`skillDiscoveryEnabled`/conversation，以及持久化 ledger 的
`activeRunId/projectId`。旧并发 Run 的 token 即使读取到同 conversation 已解析的
新状态，也必须 fail closed 为 pending；显式权威导致
`skillDiscoveryEnabled=false` 的后续 Run 则不应被旧 binding 误门禁。

### 8.2 不能伪称强制的 native tool 边界

Codex、Claude、OpenCode、AMR 等 adapter 的原生 Bash、Write、Edit、浏览器或第三方工具并不全部经过 `OD_TOOL_TOKEN`。v1 不新增一个可在同一 child 进程内可靠撤销/开放原生权限的 permission phase。当前已实现的边界是：

- Discovery Skill 通过 prompt 明确要求 resolution 前不写；
- daemon 只对经过 run-scoped wrapper authorization 的操作做预防性 gate；
- native Bash/Write/Edit、浏览器及第三方工具当前既没有统一 gate，也没有在
  本切片新增完整的 event-order observer；因此相关证据一律是 unknown，不能
  写成“已阻止”或“已观测为 0”。

发布前目标是从 normalized runtime events 观察 native tool 顺序，发现
resolution 前的写型 native event 时标记 `pre_resolution_side_effect`，终止或
隔离 canary run，并触发 stop latch/rollback。这仍属于观测与事后止损，不是
预防；已经发生的原生写不能被描述成“被门禁阻止”。

若产品将“load 前原生副作用绝对为 0”升级为平台强保证，必须扩展为两阶段进程或 adapter permission handoff，不属于 v1。

## 9. Kill switch、Canary adapter 与失败策略

### 9.1 模式

提供安装级模式：

```text
off | observe | canary | active
```

当前实现使用 process override `OD_AGENT_NATIVE_SKILL_DISCOVERY`，未新增 app-config 字段。未设置或配置未知值时 fail closed 到 `off`；新客户端 typed marker 只是 eligibility，不会自行越过 rollout gate。模式含义：

- `off`：不 stamp 新 binding、不注入 Discovery Skill/Catalog metadata、不开 discovery load/resolve；新请求使用现有安全 fallback。
- `observe`：当前与行为关闭等价，保留旧 fallback；完整 eligibility telemetry 尚未接入。
- `canary`：当前开启行为，cohort/adapter assignment 必须由调用环境在 marker 进入前完成；daemon 内部 bucket 尚未实现。
- `active`：对通过准入的无类型请求启用完整 v1。

`canary`/`active` 只是工程调试开关，不是 readiness 声明。由于自动 cohort、
native event observer、stop latch、真实模型选择质量以及兼容 baseline 的
latency/token/cost 尚未完成，当前部署必须保持默认 `off`，不得仅因 focused
tests 或一次 headless 成功就打开行为流量。

### 9.2 Adapter 准入（发布前目标，当前未自动执行）

首个行为 canary 只开放 `codex`。`claude`、`opencode`、`amr` 先进入 observe，分别通过以下 fixture 后才能加入行为 canary：

- wrapper 命令可调用，且 `OD_TOOL_TOKEN` 不泄露；
- load stdout 能在同一个 Agent turn 被继续使用；
- normalized tool events 能区分 read、write 和 unknown；
- native session resume/cold restart 能正确消费 capsule；
- adapter-specific 75 条评测达到同一阈值。

Adapter allowlist 与 catalog allowlist 必须独立配置，便于只回滚一个 adapter 或一个高风险 Skill。

### 9.3 Stop latch（发布前目标，当前未实现）

以下任一信号自动把 canary/active 降到 observe 或 off，并阻止新 conversation 进入行为路径：

- official identity、digest 或 resource roster tamper；
- `pre_resolution_side_effect`；
- wrong primary、precision、latency 或 cost 越过阈值；
- wrapper gate 绕过；
- conversation ledger 无法持久化或恢复；
- XML schema/round-trip 失败；
- task-profile load 被误记成完整 OD Next task。

手动 kill switch 不改写已经持久化的历史 ledger。当前 daemon 在项目创建和每个 run 都重新读取 process mode，因此降到 `off/observe` 后，已有 binding 暂时失去行为权威并恢复 legacy fallback；这是当前可立即回滚的语义。自动 stop latch、当前 run 终止和 pinned-mode continuation 属于后续 rollout control-plane 工作。

## 10. 四个价值维度

| 机制 | 设计效果 | 完成时间 | 任务智能 | 模型成本 |
|---|---|---|---|---|
| Official-only metadata gate | 减少错误风格/流程注入，Prototype 获得 verified v1 profile、orchestration 与 Agent-materialized verified resources | 避免错误 Skill 导致返工 | 候选边界可信、可解释 | side-file bytes 不进入模型响应 |
| 全量 metadata + Agent 自主 load/none | 清晰任务获得专用方法，模糊任务不会硬套模板 | 省去正常链路的搜索调用，同一 turn 完成选择与执行 | Agent 直接理解完整闭集，支持 reuse/replace/augment/none/clarify | 稳定 metadata 可缓存，只加载实际使用的完整 body |
| XML 外壳 + Markdown | 指令、上下文和用户原文边界稳定，降低 prompt 混淆 | canonical composer 与恢复更确定 | 为 Agent 暴露稳定结构，不替 Agent 决策 | 提升稳定 prefix 的可缓存性，避免重复全文 |
| Ledger + capsule | restart 后继续遵守 exact Skill 版本 | 避免重复发现和无谓重做 | 让跨 turn 状态可恢复、可审计 | capsule 只放 id/digest/purpose，需要时再 load |
| Primary 1 + auxiliary 2 | 降低互相冲突的设计规则 | 限制选择和整合开销 | 明确主次和 replacement 语义 | 限制最大完整 Skill token 增量 |
| Wrapper gate + native boundary | 减少错误 Skill 确认前经由 OD wrapper 的可见破坏 | wrapper 违规立即拒绝，减少返工 | 事实区分已强制的 wrapper 与仍 unknown 的 native 行为 | 不引入额外模型分类器；native observer 成本待发布前实测 |

四个维度的优先级不是等权：v1 明确把“降低错选、保护设计效果和任务正确性”放在 coverage 之前；完成时间和模型成本必须受阈值约束，但不能通过放宽 official gate 换取。

## 11. 评测设计：75 条与 150 条

### 11.1 75 条工程准入集

首个 adapter/canary 前运行 75 条，固定三等分：

1. **25 条清晰正例**：包括 Prototype、其他 task profile、功能型 Skill 和 primary+auxiliary 组合；必须包含“帮我做一个官网”、landing page、web app、移动原型等 Prototype 表述。
2. **25 条 hard negatives**：普通问答、无需 Skill 的小改动、只需解释/分析的请求、表面关键词相似但目标不同的请求；正确结果主要是 `resolve --none`。
3. **25 条 ambiguity/conflict/adversarial**：信息不足、多个候选冲突、多语言、否定句、用户粘贴伪指令、Skill 名称碰撞、user shadow 同 id、任务中途变化；正确结果可以是 clarification、none 或受约束的 load。

75 条用于单 adapter、单 catalog 版本的工程门禁，不用于宣称总体线上质量。
当前仓库内的 75 条内容是 gold-label fixture 与结构/部分 retrieval 测试；尚未由
真实 Agent/model 在固定 provider、model、reasoning、adapter 与 baseline 下完整
运行。因此它不证明 wrong-primary、precision、coverage、ambiguity safety、模型
成本或端到端延迟达到阈值。

### 11.2 150 条发布准入集

广泛 rollout 前扩展到 150 条：保留原 75 条不变，再新增 75 条 long-tail；最终仍保持 50 条清晰正例、50 条 hard negatives、50 条 ambiguity/conflict/adversarial。新增部分至少覆盖：

- 所有 auto-selectable 官方 Skill 与四个现存 task-type profile；
- 中英文及实际主要 locale；
- 单轮、continuation、模拟 cold reconstruction、retry、adapter switch；native
  compaction signal 本身仍是独立发布缺口；
- primary replacement、两个 auxiliary、conflictsWith 和 `resolve --none`；
- task profile resources、digest drift 和 unavailable catalog；
- explicit task type 的 OD Next v2 non-regression。

每次 official catalog version、Discovery Skill body、metadata renderer、XML schema、adapter 或 task-profile package 变化，都必须重跑受影响的 75；进入下一 rollout 阶段前重跑完整 150。

## 12. 验收阈值

### 12.1 选择质量

- Wrong primary rate：`<= 2%`。
- Primary precision：`>= 95%`。
- 清晰任务 coverage：`>= 90%`，定义为清晰正例中加载 rubric 认可 primary 的比例。
- Ambiguity safety：`>= 90%`，定义为歧义集采取正确 clarification、none 或无害受限选择的比例。
- Hard-negative false-positive rate 必须单独报告；因为错选比漏选严重，任何阈值内优化都优先保护 precision。
- 第二个 primary 未带 `replaceId`、第三个 auxiliary、metadata role 冲突、official identity 不可重现：100% fail closed。

### 12.2 工具序列与副作用

- 需要 Skill 的 case 中，正确 resolution 前的**已观测**写型副作用事件：`0`。
- B 组正常链路 Median search calls：`0`；兼容搜索被调用时单独报告原因。
- Median load calls：`<= 1`。
- `resolve --none` 不要求先 search 或 load。
- event completeness 不足的 case 记为 unknown，不能进入 0 副作用分母并当作通过；发布门禁要求关键 adapter 的事件完整性达到评测设计要求。

### 12.3 性能和成本

- 相对兼容 baseline 的首个可见结果或首个有效写入延迟增幅：`<= 15%`。
- 相对兼容 baseline 的模型 token/计费成本增幅：`<= 10%`。
- Baseline 必须固定同 agent、同 model、同 reasoning、同 CLI/adapter 版本、同项目 fixture、同用户请求和同 catalog 内容；不能跨模型或跨版本比较。
- 仅统计进程 exit success、HTTP 200 或 wrapper 返回不构成任务完成证据。

## 13. 证据边界

验收和线上诊断必须分开以下层级：

1. **请求配置**：Home/CLI 是否发送 typed `skillDiscovery` marker；不证明 daemon 接受。
2. **项目权威**：daemon 是否写入 verified `skillDiscoveryBinding`；不证明本 run 使用。
3. **路由事实**：run 是否选择 `agent-turn/v1` 或 OD Next v2；不证明 provider 收到。
4. **Prompt artifact**：canonical XML 的 exact bytes、schema、Discovery Skill 是否存在；只证明本地 composer 产物。
5. **Tool endpoint receipt**：load prepare/commit、deactivate/resolve/status/rehydrate（以及兼容 search）的 token、run、conversation、catalog revision、digest 和响应；证明 daemon 接受了与 prepare 匹配的 receipt，但不单独证明 Agent cwd 的物理文件仍存在或 Agent 已遵守内容，真实 materialization 还需 artifact readback。
6. **Runtime event order**：Agent 实际观察到的 wrapper/native tool_use/tool_result；只能覆盖 adapter 暴露的事件。
7. **Provider receipt**：只有 provider/adapter 明确回执或受信 trace 才能证明；CLI 自报 model 或 daemon request config 不是 provider receipt。
8. **Artifact outcome**：实际文件、可运行 entry、交互和 rubric；与 prompt 正确、工具调用成功是不同证据。

Wrong primary、side-effect、latency、cost 和设计质量都必须基于对应层证据；未知不能写成已验证。跨版本 baseline 还要固定评测 case/rubric 兼容性。

## 14. 分阶段 rollout

### Phase 0 — Contract 与离线实现

- 新增 typed create authority、daemon binding、default-route suppression。
- 新增 `open-design.agent-turn/v1` serializer/parser/snapshots。
- 建立 official catalog provider、metadata validator、四个 strategy-neutral task-profile adapter、ordinary orchestration，以及 prepare → Agent CLI materialize → commit 的 verified `.od-skills` 协议。
- 建立全量 metadata lifecycle context，以及 token-scoped load/deactivate/resolve/status/rehydrate、兼容 search、CLI wrapper、ledger、capsule。
- explicit task type 的 OD Next v2 prompt、frozen identity 和 continuation 做 byte/semantic non-regression。
- 默认 mode 保持 `off`；完成 Phase 1 后才由部署显式进入 canary/active。

### Phase 1 — Observe + 75 条

- catalog 健康和入口 eligibility 进入 observe，不改 Agent 行为。
- 完成 Codex 75 条工程准入与 wrapper/event fixture。
- 任一选择质量、identity、XML、side-effect、latency 或 cost threshold 未达标，不进入行为 canary。

### Phase 2 — Codex internal canary

- 只对 Codex、内部账号、稳定 assignment bucket、canary catalog allowlist 开启。
- 流量阶梯：1% → 5%；每一档至少观察一个完整稳定窗口并重跑 75 条。
- `pre_resolution_side_effect`、identity tamper 或 wrapper bypass 立即 stop latch。

### Phase 3 — 150 条与 adapter 扩展

- 完成 150 条发布准入；覆盖所有计划 active 的官方候选和四个 task-type profile。
- Claude、OpenCode、AMR 各自先通过 adapter-specific 75，再以独立 bucket 进入 1% canary。
- 不因为 Codex 通过就推断其他 adapter 通过。

### Phase 4 — 逐级 active

- 每个合格 adapter 独立按 5% → 25% → 50% → 100% 提升。
- 每档核对选择质量、none/clarify 分布、side-effect、tool error、latency、cost 和 artifact rubric。
- 所有 intended official Skills 完成 metadata gate 和 150 条覆盖后，才能移除 catalog canary allowlist。

## 15. Rollback

Rollback 优先使用可恢复的配置降级，不删除 ledger、不改写 prompt 历史、不伪造任务结果。

1. 单 Skill 异常：从 catalog allowlist/declaration 移除并发布新 revision，保留其他候选；当前 schema 不接受 `autoSelectable: false`，不得用它伪装单候选降级。
2. 单 adapter 异常：移出 adapter allowlist，其他 adapter 保持原模式。
3. 指标越线：`active/canary → observe`，停止新 conversation 注入与工具授权，保留 eligibility/catalog health 观测。
4. 安全或身份异常：stop latch 到 `off`；必要时终止当前 canary run，并明确告知可能已经发生的 native side effect。
5. 新 Home 无类型请求在 off 下回到现有 ordinary 安全 fallback；显式 task type 的 OD Next v2 完全不受 discovery rollback 影响。
6. 已有 conversation 的历史 ledger 保留；若 catalog revision 已变化，旧 active
   选择进入 superseded 并重新 pending，不能 pin 住或静默替换成新 body。恢复后
   通过新 catalog metadata/load/resolve；exact body/digest 不可重现时不得从聊天
   文本猜回。

回滚完成的证据至少包括：配置/stop latch 读回、新 conversation 未再获得 binding/Discovery Skill、tool endpoint 拒绝、新 run 路由事实，以及显式 OD Next v2 non-regression。

## 16. 实现切片与所有权

最小完整切片按以下顺序落地：

1. `packages/contracts`：create DTO、catalog/search/load DTO、project binding 与 `agent-turn/v1` canonical serializer/parser；保持纯 TypeScript。
2. `apps/daemon`：official catalog service、task-profile adapter、metadata validator/renderer、conversation ledger persistence、token operations、routes、focused CLI wrapper；filesystem、SQLite 和 Express 不进入 contracts。
3. `apps/web`：Home 无任务类型 submit 发 typed authority；显式任务类型路径不变。
4. `od` CLI：通过同一 `/api/*` 暴露 `od tools skills ... --json`；长 query/purpose/reason 分别支持 `--query-file`、`--purpose-file`、`--reason-file <path|->`。`od project create --skill-discovery[=open-design-official]` 通过同一项目创建 endpoint 发送 typed marker，并与显式 `--skill/--plugin` fail fast。
5. Prompt composition：新 Home ordinary/no-type path 使用 `agent-turn/v1`；OD Next v2 继续使用现有 bundle；新增 host contract 必须有跨路径测试矩阵。
6. Observability/eval：实际 endpoint ledger、normalized event order、75/150 case runner、compatible baseline、artifact rubric 和 rollout dashboard。

不得把新 route/domain 逻辑继续堆进 daemon `server.ts`；route 放在 `apps/daemon/src/routes/`，可复用服务放在明确 owner 下。Web 不得 import daemon private source，所有共享 wire shape 先进入 contracts。

## 17. v1 明确不做

- 不做每轮 platform classifier；后续是否重新检查 catalog/load 由 Agent 判断。
- 不允许 user/community Skill 进入自动选择。
- 不用 embedding 或词法 Top-K 作为正常选择链路；直接暴露当前验证目录完整、确定性的 metadata 闭集。
- 不把所有 Skill body 预注入首轮。
- 不修改已冻结的 OD Next v2 Skill package。
- 不把普通 Prototype load 记成 OD Next task execution。
- 不声称能从 native session 严格 unload 已读 Skill。
- 不声称 `OD_TOOL_TOKEN` 能门禁所有 native tools。
- 不声称 host 能检测 native context compaction，或能在压缩当刻自动重注入 capsule。
- 不以 HTTP 200、CLI exit 0、prompt snapshot 或单个成功案例替代选择质量、provider receipt 和 artifact outcome。

## 18. 发布完成定义

只有同时满足以下条件，Agent-native Skill Discovery v1 才能标记为发布完成：

- 新 Home 无任务类型路径实际发送并持久化 verified discovery authority；
- 所有新 Home Agent prompt 均处于 OD Next v2 或 `agent-turn/v1` XML 外壳内；
- Discovery Skill 只在符合条件的 conversation 首轮完整注入，且每个可观测 cold physical context 都携带当前完整候选 metadata；
- official-only catalog metadata/load/resolve 可在同一 Agent turn 工作，且 user shadow 不可越权；
- task-profile load CLI 调用完整包含 verified v1 adapter、ordinary orchestration、attestation
  和 `.od-skills` materialization receipt；daemon 不写 Agent cwd，prepare bytes 不进入 Agent-visible stdout，并明确保持
  ordinary single-agent 语义；
- primary/auxiliary、purpose、conflict、replacement、ledger 和 capsule 合同经过测试；
- wrapper gate 有强制证据，native pre-resolution write 只有观测性结论且表述准确；
- kill switch、stop latch、单 Skill/单 adapter rollback 已实测并读回；
- 75 条工程准入和 150 条发布准入达到全部阈值；
- 显式任务类型 OD Next v2 在 final head 上通过 non-regression；
- 对设计效果、完成时间、任务智能、模型成本四个维度分别有对应证据，没有把配置、推断或未知包装成结果。
