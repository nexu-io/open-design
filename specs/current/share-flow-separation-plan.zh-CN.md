# 分享浮层双流程解耦与服务端校验方案

状态：实施中，已完成服务端公开发布容量校验的第一批本地改动；完整迁移未完成。日期：2026-10-22。

## 1. 已确认的用户结果与边界

保留同一个分享弹窗。上半部“链接访问／生成／复制／更新链接”负责对外公开页面；下半部“工作区内可见范围”负责项目对工作区成员的可见性。两条流程拥有独立的业务权限、请求、进度、结果、错误与重试。

- 点击公开发布直接提交，不先请求客户端发布资格检查。打开弹窗、文件变化、复制链接均不触发发布预检查。
- 云端独立校验权限和发布约束，不能信任客户端传来的权限布尔值。工作区内分享的权限不得作为公开发布的业务开关。
- 发布公开链接不自动把项目开放给工作区；调整工作区可见范围不自动创建、更新、停止或恢复公开链接。
- 错误使用已确认的现有组件：`ShareErrorRow` 红色图标及具体说明，下方 `ShareButton variant="primary"` 全宽深色按钮；发布重试使用 `Icon name="share-refresh-arrows"`。不使用同步提示小按钮或错误 Toast。
- 保留身份隔离、项目／文件归属、正确链接绑定、并发与持久化保护。检查归属优化不等于删除这些保护。
- 不改停止／恢复的产品语义，不扩大谁可以操作别人的内容，不重做打包路径，不放宽容量，不改 Cloudflare／Vercel 部署流程，不改变项目删除规则。
- 旧实现不自动视为正确需求。工作区生命周期与公开发布的关系须独立审查，不能把 `canShareProjects` 的规则照搬为新的公开发布规则。

“完全拆开”指业务流程独立，不是复制账号体系、项目身份或数据库。共享认证、可信身份、文件标识和保护并发写入的锁可以保留，但不得通过共享状态相互产生业务副作用。

## 2. 代码基线与证据范围

| 仓库 | 当前核对版本 | 工作区情况 |
| --- | --- | --- |
| Open Design | `4bd36280f13ac91e0cbbd1097622dca8330351c2` | 核对前无受跟踪代码改动；预览在忽略的 `.tmp/share-error-preview/` |
| Vela | `908f7692878b70977a437d70f99a1112aa67f2bb` | 存在他人 Web／评论相关未提交改动；本方案仅只读 API／CLI 源码，实施必须隔离这些改动 |

以下均为这两个本地版本的代码证据，不是已部署版本证明。现有测试只核对源码，未在本轮运行。CI、部署、实际客户端版本和线上行为均为 UNKNOWN。

文中 OD 相对路径以本仓库为根；Vela 相对路径以 `/Users/alche/Documents/vela` 为根。代码证据索引见第 10 节。

## 3. 实施前的两条链路

### A. 公开链接发布

```text
FileViewer / ShareTab
  ├─ 打开分享／内容变化 → useSharePlan → POST .../share-plan
  │    └─ daemon：验证工作区 → canShareProjects → 项目归属 → 本地打包
  └─ 点击生成／更新 → planState.run → publishProjectFilePublic
       → POST /api/projects/:id/files/:path/publish-public
       → daemon：再次验证工作区／canShareProjects／归属【现状重复，目标删除】
       → 本地打包／20 MiB／入口冲突
       → 读云端历史 → 预留链接 → 固定会话／目录身份验证
       → 必要时 ensure-private → 资源关联 → 上传版本 → 文件事实登记
       → Vela /api/v1/resources/:resourceId/shares/bound
       → 云端别名、快照、文件关联、share binding 事务
       → 本地记录／恢复队列 → 返回结果
```

证据 E01—E07、E10—E14。这里的 daemon 是安装在用户电脑上的服务，不是云端。仅从 React 移到 daemon 不算完成“检查放服务端”。

### B. 工作区可见范围

```text
ShareTab 下半部选择“仅自己／工作区成员”
  → FileViewer.setWorkspaceShareAccess → 现有移动确认
  → commitWorkspaceShareAccess → moveWorkspaceProject
  → POST /api/workspaces/:workspaceId/projects/:projectId/move
  → daemon：身份／归属／移动权限，保存与恢复本地投影
  → requestTeamShare 或 requestTeamUnshare
  → Vela ensure-private／上传团队根内容／PATCH .../visibility
  → 云端确认后更新列表与可见性
```

证据 E08—E09、E15。`requestTeamUnshare` 当前调用 `setVisibility('private')`，没有调用公开链接 stop。`requestTeamDelete` 是另一条删除流程，不与可见性操作混同。

### 已存在的分离与确实存在的耦合

| 代码事实 | 实施含义 |
| --- | --- |
| 两条链路已有不同 HTTP 入口 | 复用入口，不为了拆分新造一套平行 API |
| 公开发布调用 `canShareProjectsForRequest` | 移除业务权限复用；最终由公开发布的云端规则裁决 |
| `useSharePlan` 与 publish 重复检查，且 plan 失败会挡住请求 | 删除 UI 的预检查及依赖它的禁用／排队逻辑 |
| 首次公开发布必要时 `ensurePublicShareProject`，其云端操作为 ensure-private | 这是身份与内容基础登记，不等于分享给工作区；不能直接删除依赖的身份事实 |
| 工作区 move 已有云端确认、本地失败恢复 | 保留现有恢复，不通过公开发布“顺带同步”可见性 |
| 首次发布使用面板错误，更新失败与工作区移动失败使用 Toast | 将错误路由到各自区域，避免同一次失败双重展示 |
| 删除与发布共享 mutation lane、文件身份 | 保留安全序列化，不因 UI 解耦取消保护 |

## 4. 实施前服务端覆盖与规则核实

| 检查／保护 | 当前证据 | 处理方案 |
| --- | --- | --- |
| 登录与工作区身份 | Vela Bearer 分支校验 control key、用户状态并服务端解析工作区，不采用客户端伪造 principal，E10 | 保留并复用；前端不先取得发布许可。daemon 仍需固定实际操作会话与目标 |
| 跨账号／跨工作区／资源编辑权 | `requireResourceAccess(..., 'edit')` 与 `resolveEffectiveAccess`，E11 | 必须保留；补直接调用云端、伪造请求、跨资源的回归测试后才能删重复业务门槛 |
| 项目所有者、文件事实、链接目标 | `establishPublicationAuthority` 校验活跃成员／用户、资源 owner、project、sourceFileId/path、version、slug，E13 | 不改变单一所有者及文件身份语义；不能仅凭知道 slug 更新分享 |
| 公开提交原子性 | `publishSnapshotAlias` 用事务和资源／别名锁；finalize 失败回滚，E12—E13 | 复用，不另写无事务的绑定接口，不用 generic shares 绕过 bound 路由 |
| 上传内容完整性 | blob commit 重算摘要并核对实测大小，versions 校验 manifest、缺失 blob 和空内容覆盖，E14 | 云端保留；本地只准备文件，不以本地校验替代云端校验 |
| 容量 | OD 总量 20 MiB；Vela 单 blob 256 MiB、批次 1 GiB，不是同一约束，E06、E14 | 将公开分享总量策略交给云端。不能用现有通用上传上限冒充等价覆盖 |
| 生命周期 | OD 本地派生权限只认 active，但也可接受云端返回的 permissions；Vela 根据有效付费周期计算可写性，删除在持久化层另有锁与拦截，E19—E22 | 不复制 active-only 规则；公开发布以云端当前身份、权益与该操作策略裁决，停止／恢复不套上传 gate |
| 停止／恢复、结果不确定 | stopped guard、历史恢复、固定回执、本地失败补偿，E04、E16 | 保留现有语义；明确错误与未知结果；不因 POST 超时就自动重复发布 |
| 本地路径与来源一致性 | 本地打包、`useShareSourceGuard`、账号 generation／文件请求序号，E03—E04 | 这是执行安全，不是发布资格预检查；保留，不上传其他文件或跨账号回写结果 |

### 生命周期核实结论（2026-10-22）

**结论：不能沿用“非 active 一律不可写”。** 云端已经明确支持“续费失败，但有效已付费周期尚未结束”继续写入；这不是要新增的权限例外。

1. Vela `effectiveTeamBillingState` 将 `renewal_failed_pending_expiry` 和 `cancelled_pending_expiry` 在到期、到期时间缺失或无效时转为 locked；在有效未来到期时间内保留原状态。entitlement 对这两个未到期状态返回 `canWrite=true`，续费失败投影成 `billing_past_due`。workspace context 结合最新 entitlement 计算权限（E19）。现行 QA 矩阵也明确 recoverable past_due 保持可读可写，已有测试源码覆盖真假 entitlement 和到期边界（E20）。
2. OD `buildWorkspacePermissions` 的本地派生规则仅认 active；目录项构造上下文会使用它。但 `parseWorkspaceContext` 优先接受云端 permissions，不能笼统说所有客户端路径必然拒绝 past_due（E21）。本期解除公开发布对 `canShareProjects` 的依赖，不把旧派生规则复制到云端，也不借此全局重做工作区权限。
3. 不能只看资源层的 `isFrozen(locked)` 就判断 deleting 可写。资源创建／上传授权的 `withWriteAuthority` 在事务里锁有效用户及工作区，排除 locked/deleting/deleted；bound 发布的文件权威锁另行排除 deleting/deleted，并核对活跃成员、用户和项目。工作区删除锁与这些事务锁共同构成删除竞态保护（E22）。这些底层保护必须保留。
4. **停止和恢复已有链接是独立操作。** 云端 stop 校验项目所有者和绑定归属，没有上传的 frozen gate；resume-existing 在事务内核对原发布权威、精确来源和版本，禁止恢复 source_deleted，工作区事实锁排除 deleting/deleted，但没有排除 locked（E23）。不能通过给这两个接口加 active-only 条件来“统一”。这是云端当前代码事实，不代表所有客户端入口已经放行，也不代表线上版本已验证。

| 场景 | 首次发布／更新内容 | 停止／恢复已有链接 | 本次处理 |
| --- | --- | --- | --- |
| active、有效成员且有目标权限 | 正常进入内容及绑定校验 | 按各自所有权及绑定规则处理 | 保留 |
| 续费失败，但有效已付费周期尚未结束 | 云端可写，不能因 past_due 名称拒绝 | 不新增账单门槛 | 删除公开流程借用的本地 active-only 判断；不扩大目标权限 |
| 到期／无有效付费周期证据，云端解析为 locked | 现有资源写入拒绝 | 当前云端不以 locked 一概拒绝 stop/resume-existing；恢复仍须有效原始发布权威 | 不放开新上传，也不新增停止／恢复限制；按操作回归验证 |
| deleting／deleted | 上传授权、绑定事实校验阻止新发布／来源复活 | 恢复有删除事实锁；stop 是撤回能力，不能作为新写入授权 | 保留删除事务与来源终态，不声称所有接口仅靠同一个 gate |
| 仅复制已知链接 | 无新发布行为 | 无需重新取得写许可 | 保留复制；不承诺链接当前仍可访问 |

实施规则由云端实时解析结果决定，不能只信请求内 lifecycle 字符串。冻结期间是否允许“重新公开已有内容”若未来要调整，属于独立产品变更；本期沿用现有精确恢复操作，不把它替换成新发布。

## 5. 目标实现与代码修改点

### 5.1 同一个弹窗，两个独立业务区域

保留 `ShareTab` 的位置、标题、链接访问、工作区可见范围和既有确认交互。采用两个明确的区域状态：

- 公开区域：`publish / update / stop / resume` 操作、进度、发布结果和公开错误。
- 工作区区域：目标 visibility、移动确认、执行进度、移动结果和可见性错误。

可以按仓库组件惯例提取区域组件／hook，但不为此重构整个 FileViewer 或 ReactComponentViewer。新文件只在能消除两条流程的状态混用时添加。

具体改动：

1. `FileViewer.tsx` 的 `useSharePlan` 接入和 `ShareTab.tsx` 的本地 fallback 都去掉。公开生成／更新按钮直接调用发布 handler；删除 plan loading/error、planTooLarge、planBlocked、planState.run 和只为预检查设置的 Retry。
2. `useSharePlan.ts` 无调用后删除；`fetchProjectFileSharePlan` 无 Web 调用后移除。`od project share preflight` 及 daemon share-plan 是已有显式诊断功能，不能顺手破坏 CLI：本期保留显式调用，移除 UI 自动调用与其业务授权作用，后续容量结果按云端策略表达，不保留第二份本地权威值。
3. 将工作区 visibility 状态与公开状态分开，错误和 pending 不互相复用。某一操作失败只清理自己的进度，不清空另一条流程的链接或选择值。
4. 保留当前账号／文件 generation、请求序号、重复点击防护、已确认内容快照保护；旧响应不能写回新账号或新文件。取消的是“先拿到 plan 才能提交”，不是异步结果隔离。
5. 已有链接复制不依赖两条业务的写权限或检查结果；复制失败是剪贴板反馈，不伪装成发布失败。
6. 同一项目的底层写入仍可按 mutation lane 排队。独立 UI 状态不承诺危险的并发写入可以无锁执行。

### 5.1.1 更新链接提示改为纯本地内容比较（本期新增确认）

首次发布和更新已共同调用 `publishProjectFilePublic`（`FileViewer.tsx:8245`、`:8352`），保留同一个 POST 发布入口与稳定链接，不另建更新接口。提示是否需要更新与云端链接生命周期状态分开：

- 本地 daemon 复用 `share-content-fingerprint.ts`：对完整实际发布包的路径及字节生成指纹，覆盖 HTML、CSS、JS、图片等随包发布内容，不只比较主文件或 mtime。
- 将 freshness 计算从当前 GET publish-public 中拆出本地读取职责。内容变化只触发本地比较，不请求云端 directory／share-state／发布预检查，不触发上传；同一内容快照的比较结果可复用。
- 本地已确认发布基准与当前内容不同，显示“更新链接”；相同则不提示。缺少基准或无法读取时为 unknown，不伪装成 current/outdated，也不自动转云端资格检查。
- 点击更新复用首次发布流程，继续使用原 slug。只有确认发布成功，才保存此次实际上传包的指纹；更新失败保留旧基准。
- 上传期间文件再次改变时，以此次上传的内容记录基准，随后本地比较仍应显示待更新，不能将上传结束时读到的新文件误记成已发布。
- 链接 active/stopped 等云端状态读取独立保留，不能仅凭本地指纹推断链接仍有效；其失败不得清除已有可复制链接。
- 账号、工作区、项目、文件身份隔离继续使用既有 scope 和 revision；不把另一账号或文件的指纹作为基准。

验收：主文件未变但引用资源变化；内容恢复为已发布版本；首次无基准；比较失败；更新失败；上传期间再修改；旧账号异步结果返回。内容变更提示过程中断言云端请求与 publish POST 均为零；显式更新才提交一次发布。

### 5.2 最小校验步骤与请求内复用（按用户最新确认更新）

目标：daemon 不再先查询云端工作区权限／canShareProjects／项目归属来判断是否可以提交。公开发布直接进入云端发布流程；工作区可见性仍走自己的接口。这里合并的是业务校验及数据读取，不是将工作区 visibility 权限用于公开发布。

```text
点击发布／更新
  → daemon 固定账号会话与目标文件，准备本地内容
  → 云端一次解析当前身份、有效权益及项目／资源归属
  → 复用本次解析结果，合并处理清单、容量与内容完整性
  → 上传／恢复同一次操作
  → 最终事务锁定会变化的权威行，核对权限仍有效、来源未删除、版本未冲突
  → 原子提交公开快照与绑定，返回结果
```

仅保留以下必要检查：

| 步骤 | 必要目的 | 合并／复用规则 |
| --- | --- | --- |
| 当前身份与目标归属 | 防跨账号、跨工作区及操作他人内容 | 同一请求一次解析，传递明确的请求上下文；不反复请求 workspace directory，不通过 canShareProjects 裁决公开发布 |
| 内容可发布性 | 防缺文件、损坏内容和容量超限 | 一次读取清单及可信大小；同一结果用于计量、入口定位及提交，上传时实测摘要／大小不能被客户端声明代替 |
| 最终原子提交 | 防上传期间撤权／删除、并发版本覆盖和半绑定 | 只锁并复核可变化的事实；不可变 manifest／blob 数据不重复扫描。入口鉴权不能代替跨上传阶段的最终有效性校验 |

执行规则：

- 公开流程删除 `canShareProjectsForRequest` 的业务门槛。daemon 不保留云端已覆盖的 workspace lifecycle／ownership 预检查；固定会话、本地文件来源与路径保护继续保留。
- 同一请求内复用经过认证的上下文，不从客户端 permission header 构造可信权限；不得跨请求缓存权限。上传前后若是不同请求，必须认证当前请求，不能凭旧请求上下文授权。
- 按实际调用路径合并查询。身份／成员／workspace／项目／资源的关联可在一次关系查询中取得，但须保持既有锁顺序；不得为了“单条 SQL”增加死锁或把身份读取变成宽范围锁。
- `prepareBoundShare`、资源编辑权与 `establishPublicationAuthority` 重复读取的事实须收敛为同一事务上下文；终态／精确回执核对继续由提交入口负责。下层函数接收可信上下文，不各自重新获取全套数据。
- 工作区 `PATCH .../visibility` 使用独立策略和错误状态；公开发布只复用账号与目标身份基础事实，不复用团队可见性开关。ensure-private 保留已有 team/private policy。
- 停止、恢复已有链接按原操作处理；不通过重新上传完成恢复，不统一套新发布的账单限制。
- 暂存回收在后台执行，不放到发布响应的关键路径。提交只确认本次上传与结果归属，不等待全局清理。
- 对鉴权、上传、资源版本创建、最终绑定分别记录耗时，验证减少的串行请求／重复查询。当前没有耗时基线，不预设性能收益或引入未经证明的权限缓存。

改动依据：OD `routes/collab-sync.ts:1345`、`:1354`、`:1357` 及 `server.ts:5602` 当前多次获取许可／目录；Vela `resources/auth.ts:187`、`resources/routes.ts:787`、`app.ts:2150`、`collab/publication-authority.ts:175` 已有认证、资源授权、prepare 与提交权威链。具体查询合并按实现与事务测试验证，不把“减少查询”当作删除安全事实的理由。

### 5.3 容量归云端，仍保持现有业务范围

不把 20 MiB 擅自提高或取消；只迁移规则归属，后续若要调整阈值另做产品决定。

1. 云端公开分享验证读取可信 manifest 和已核验 blob 大小，按发布文件路径累计体积。不能只累加客户端自报大小，不能只对 blob 去重后累计而改变当前按文件计量的含义。
2. 在公开分享事务创建快照／推进别名前执行；超限返回结构化 `413`、错误码、可信 `totalBytes` 与 `limitBytes`。不得给所有 `kind='project'` 资源套这个限制——OD 公开文件资源与团队根资源当前都使用 project kind。
3. 删除 Web／daemon 的“总量超过常量就拒绝发布”，取消面板写死 20 MiB 文案。通用 blob 完整性与真实上传容量上限仍由云端保留。
4. 当前通用上传入口没有公开发布操作身份，也没有串起上传、版本、最终绑定的持久化尝试记录（第 6 节）。因此仅在 bound 加容量拒绝不够。需补限定于公开发布的云端尝试与暂存归属：请求提交后服务端验证身份和声明清单，授权上传，按实测大小复核，再提交公开绑定。声明大小不能代替实测校验；不能让客户端自报 purpose 绕过权限。此内部上传协议不恢复 UI 自动 preflight。
5. 仅在最终 shares/bound 拒绝超限，不足以宣称“没有脏数据”；第 6 节失败矩阵和暂存归属必须一起通过。这是本项移除本地上限的交付条件。

### 5.4 错误契约与展示

沿用现有 `error`、HTTP status 和 `ApiFailureDetail`，做兼容性增量，不替换旧 CLI 已消费的响应。

已有能力：`PublicFilePublishError` 保留 status/code；`failure` 已有 stage/reason/upstreamStatus/upstreamCode；但当前 UI 多数只映射 reason，容量 details 被丢弃，部分早期拒绝没有阶段。工作区 `WorkspaceProjectMoveError` 保留 code，FileViewer 又降成了通用 Toast。

拟增量：

- 明确 operation（公开发布／更新／停止／恢复或工作区可见性），安全错误码与阶段。
- 明确 outcome：未提交、已确认提交、结果未知。是否可重试由操作阶段及结果判断，不能根据 5xx 或 network 就一律允许。
- 仅传递白名单字段和校验过的数值／枚举；已有 request ID 用于关联诊断，**不是幂等键**。未知文本不直出 CLI stderr、堆栈、令牌、绝对路径或其他用户身份。
- 一处错误呈现映射供 FileViewer 的首次发布／更新／恢复使用；保留具体 upstreamCode，例如登录失效、权限不足、冻结、源文件代际不匹配、入口不存在、容量超限。不能把所有 403 叫“没有权限”、所有 404 叫“文件不存在”。
- 空响应、代理 HTML、响应丢失保留“暂时无法确认结果”，不捏造服务端原因。
- 工作区错误仍属于 visibility 流程，用其现有 API error code 映射，不落入公开链接错误状态。

| 场景 | 面板中的反馈 | 操作 |
| --- | --- | --- |
| 确认未提交的网络／上传失败 | 具体连接或上传原因 | 全宽深色重试按钮，重试同一操作／同一目标 |
| 登录缺失或失效 | 请登录／重新登录 | 复用现有登录动作；不得自动重放到另一个账号 |
| 确认无权限 | 当前账号无权执行此操作 | 不放无效 Retry，不泄露目标归属 |
| 云端容量拒绝 | 实际体积与服务端上限（字段可用时） | 先处理内容，无盲目重试 |
| 文件／版本／链接不匹配 | 具体但不泄露内部数据的说明 | 保留现有状态恢复路径，不另建链接绕过 |
| 发布已提交但响应／本地落库未确认 | “无法确认发布结果” | 先读取可信状态，保留显式撤销恢复；不自动重复发布 |
| 工作区 visibility 失败 | 下半部具体原因 | 只重试 visibility，不触发公开发布 |

样式直接复用 `ShareErrorRow`、`ShareButton`、`Icon('share-refresh-arrows')` 和原 CSS。首次发布错误放在链接区域；更新失败也在该区域，不再走更新失败 Toast。可见性错误放在下半部。成功反馈保持既有规则，避免扩大视觉改动。28 场景预览只是文案评审样本，不能据此创造 28 个后端错误码或未经验证的自动恢复动作。

## 6. 不越权、不产生脏数据的交付定义

### 权限

- 不能以 workspaceId／projectId／sourceFileId／slug／客户端 permission header 替换身份。
- 不能修改其他成员的资源，不能用 generic share 路由绕过已建立的 bound 关系。
- 上传开始后账号或成员权限变化，最终提交必须重新取得有效权威；旧 UI 结果不能落到新账号。
- team/private visibility 不应成为公开链接的授权代理；所有权事实仍参与安全校验。

### 数据

现有公共分享事务只包住 alias、snapshot 与 binding；上传 blob、manifest、resource version、目录登记和本地记录在不同阶段。Vela 当前资源存储是 append-only。不能声称一个 SQL rollback 能清理对象存储和全部前置写入，也不能删除共享 digest 作为简单补偿。

验收必须逐阶段记录以下结果：

| 失败位置 | 必须验证的结果 |
| --- | --- |
| 身份／权限／参数拒绝 | 不创建公开快照、别名版本、绑定；不改 visibility |
| 容量／完整性拒绝 | 不推进公开版本；前置暂存有明确归属与可恢复／清理机制，不产生无法解释的无主数据 |
| 原子绑定拒绝 | 同事务 alias/snapshot/file_publication/binding 不留下半状态，旧链接继续指向原已确认版本 |
| 上传中断 | 不呈现发布成功；不能凭客户端断开假定远端已回滚 |
| 最终提交后响应丢失 | 可通过稳定身份查回真实结果；不自动再创建一份，不关掉旧有链接 |
| 云端成功、本地记录失败 | 保留现有精确补偿／manual revoke 恢复数据，不吞掉已经公开的事实 |
| visibility 云端失败 | 本地恢复原投影；公开链接状态不变 |
| 同项目并发更新／停止／删除 | 锁与目标校验持续有效，不跨文件、不串评论、不复活已删除来源 |

### 上传暂存与恢复核实结论（2026-10-22）

**结论：已有链接恢复能力，但没有查到覆盖整个上传尝试的云端暂存回收闭环。两者不能互相替代。**

| 阶段 | 当前实现／失败后的事实 | 结论 |
| --- | --- | --- |
| 本地打包 | publish route 的 finally 删除本地 tempDir | 只清本机临时包，不清云端对象 |
| 云端对象上传 | CLI PushTree 分批 prepare → PUT → commit，最后 PublishVersion；任一步失败直接返回，没有 abort／删除已传批次 | 上传中断可能留下对象，尚未 commit 的对象也不等于不存在 |
| blob commit | 服务端核验实测摘要／大小后记录 blob | 是内容完整性证明，不是分享提交证明 |
| manifest/version/ref | manifest 按 digest 复用；version 已持久化后才 setRef，ref conflict 明确返回 createdVersionId | 409 可能已有版本；不能当“无副作用”再从头发布 |
| alias/snapshot/binding | bound finalizer 处于公开提交事务内 | 保证这一步没有半绑定，不回滚前面对象／版本 |
| 别名恢复 | 本地持久化 reservation；读取可信云端历史恢复同一文件代际的 slug，冲突拒绝 | 能保持链接身份，不保证重复请求不生成新版本 |
| binding_pending | 本地完成事务保存回执和 outbox；启动／显式重试校验 identity、revision、精确回执，最多按既有失败预算重试 | 只补绑定、不重传文件；没有已落库回执／outbox 时不能承诺自动恢复 |
| 云端发布成功、本地落库失败 | 首次新增链接可做精确 stop 补偿；已有历史链接不能误停；补偿失败返回 manual revoke 信息 | 保留已公开事实和恢复入口，不以通用“上传失败”遮盖 |

证据 E24—E27。查到资源 signer 的 deleteObject 能力，但未找到上传失败路径或常规资源 GC 的调用闭环；deleteTeamObjects 接入的是账号擦除流程，不能用于单次上传回收。schema 注释中“orphan swept by GC”不等于运行中的 GC。此次未查看云端 bucket 生命周期配置，不能断言基础设施完全没有清理，也不能依赖未核实的配置承诺回收。签名 URL 到期仅代表授权过期。

**据此确定实施缺口与最小范围：**

1. 为公开发布尝试保存服务端认可的身份、目标、上传集合及阶段／结果，使中断后能查询并继续同一次操作。现有 requestId 只作日志关联，稳定 slug 也不是版本幂等键；需要实际的提交去重约束和已提交结果重放。
2. 对未完成尝试设有界保留与回收。清理前核对对象／版本引用及并发活跃尝试，不能删除共享 digest、既有资源版本或公开历史。单纯新增记录但没有可执行、可重入的回收路径不算闭环。具体表结构和租期是待实现设计，不冒称仓库已有机制。
3. 失败前已建立的合法项目身份／目录不按“上传垃圾”删除；记录它与尝试的关系。公开链接／visibility 不因失败发生意外变化。
4. 保留并复用现有 alias 恢复、binding-only outbox、精确补偿；对最终响应丢失先查同一尝试结果，无法确认时显示“无法确认发布结果”，不自动再发一个版本。
5. 补聚焦故障注入：PUT 成功但 commit 未发、部分批次成功、commit 成功但版本未建、ref conflict、最终绑定成功但响应丢失、重启重试、共享 digest 并发引用、回收与提交竞争。验证数据库及对象存储实际结果，不能只测返回码。

这属于服务端迁移的必要补齐项，不是保留旧客户端限制的产品理由。实施顺序必须先完成服务端暂存归属／恢复与容量覆盖，再删除对应本地 gate；不能仅加最终 413 就宣称“不产生脏数据”。范围限定公开发布尝试，不夹带重做全局资源 GC 或删除已有历史数据。上述为实施前的缺口；本期协议、故障注入和验证结果见第 11 节。

## 7. 实施顺序与预计改动面

1. **先锁定服务端行为基线。** 补两条流程的权限／生命周期／副作用矩阵；直接 API 测试绕过客户端。采用第 4 节已核实的有效权益及操作差异，不复制本地 active-only 条件。
2. **服务端补齐缺口。** 独立公开授权策略、容量权威及兼容错误详情；保留原子绑定／并发锁／回执校验；验证暂存与失败恢复。先完成服务端能力再移除本地对应保护。
3. **daemon 解除业务许可耦合。** 对已覆盖规则取消工作区分享 gate；保留本地执行安全和可信身份绑定。不得改动部署路由或团队可见性语义。
4. **Web 取消发布 preflight。** 生成／更新直提；两个区域状态、错误和重试独立；统一已确认样式；状态读取失败不能撤销已有可复制链接。
5. **完成集成验证。** 两个方向的互不影响、失败无半数据、并发／账号切换、首发与更新、CLI 和浏览器验收。

| 仓库／文件 | 预期改动 |
| --- | --- |
| OD `apps/web/src/components/FileViewer.tsx` | 去掉 plan 接入；公开与 visibility 状态／错误隔离；更新错误不再 Toast |
| OD `apps/web/src/components/share/ShareTab.tsx` | 删除预检查 UI 与阻塞，直调 handler；两个区域分别渲染现有错误组件 |
| OD `apps/web/src/components/share/useSharePlan.ts` | 无调用后删除及替换旧行为测试 |
| OD `apps/web/src/collab/public-file-publish.ts` | 按可信 code、stage、outcome 映射安全提示和重试；不按字符串猜权限 |
| OD `apps/web/src/providers/registry.ts`、`state/projects.ts` | 保留／解析具体错误详情；删除无用 Web preflight fetch；保护旧 API 响应兼容 |
| OD `packages/contracts/src/api/share.ts`、`failure-detail.ts` | 错误契约增量；客户端不持有容量权威；共享 failure 枚举变化须同步 parser／analytics 消费者 |
| OD `apps/daemon/src/routes/collab-sync.ts` | 按云端覆盖移除重复业务许可与容量 gate；保留打包、固定身份、mutation lane、回执／恢复；补齐早期错误分类 |
| OD `apps/daemon/src/server.ts`、`collab/public-file-failure.ts` | 固定会话准备与冗余 directory 许可拆清；传递云端安全错误细节，不大规模重构 server |
| OD `apps/web/src/i18n/locales/{zh-CN,en}.ts` | 具体错误文案、动态容量、未知结果；清理无引用的检查提示 |
| Vela `services/api/src/resources/routes.ts`、`persistence.ts` | 公开授权／容量接入，事务内最终校验和结构化拒绝；不全局限制所有 project kind |
| Vela `services/api/src/app.ts`、`collab/publication-authority.ts` | 必要的公开策略接线；保留文件事实和绑定事务，不改 owner 语义 |
| Vela CLI `apps/cli/internal/client/resource_hub.go` 及实际调用方 | 仅在新增可信错误详情／操作范围需透传时修改；保持旧命令兼容 |
| 两仓库现有测试目录 | 扩展对应行为和事务测试；跨边界放 OD e2e，UI 放 e2e/ui |

以上是候选改动面，不要求每个文件一定修改；实现必须按证据缩小。新模块名、错误字段名、迁移文件在设计落实时定，不把草案当成已有实现。

## 8. 验收与测试矩阵

### Web／交互

- 开面板和内容变化不调用 share-plan；点击首次发布／更新直接调用 publish-public 一次。
- Retry 不先调用 preflight、不重复点击提交；错误属于原操作和原文件。
- 上传 pending 不禁用无关 visibility 控件；visibility pending 不抹除公开链接。底层串行锁可以等待，但 UI 能说明自身操作状态。
- 首次发布、更新、恢复的错误均使用实际组件／SVG，无错误 Toast 和手写替代图标。
- 401、403、413、409、断网、代理非 JSON、未确认响应、CLI 不可用分别测试；未知不默认归因网络。
- 切账号／文件／关闭重开时无旧错误串入；已有链接复制不依赖 plan。
- visibility 失败重试只调用 move，公开失败重试只调用 publish-public。

### 云端／数据

- 匿名、移除成员、跨工作区、非 owner、伪造 source/slug、generic 绕过、来源删除、停止后普通 publish 均覆盖。
- 按第 4 节结论形成两套独立参数化用例，覆盖续费失败但周期有效、到期／无效证据转 locked、删除竞态；恢复已有链接不得误走重新上传。
- 容量等于上限、超过一字节、同 digest 多路径、伪造大小、缺 blob／错摘要，均由直接 API 验证。
- finalizer 抛错、并发 publish、publish 对 stop/delete、提交后连接断开、daemon 落库失败：检查前后数据库行和公开版本，而不仅检查状态码。
- 公开发布前后 visibility 不变；team→private 后公开 URL/slug/当前版本/binding 不变；private→team 后同样不变。
- 重试恢复不能留下重复活跃链接或把原有链接错误关闭。不要把 requestId 当作已实现幂等机制。

### 现有测试入口

OD：`apps/web/tests/components/share/{ShareTab.publish-error,ShareTab.first-publish,ShareTab.stopped,ShareTab.team-visibility-notice}.test.tsx`，`apps/web/tests/public-file-publish.test.ts`；daemon 的 `public-file-failure`、`public-file-error-chain`、`public-share-project-authority`、`public-file-publication-*`、`public-file-mutations` 等测试。

Vela：`services/api/test/resources-auth.test.ts`、`comment-file-bound-share-route.test.ts`、`publication-authority.test.ts`、`resource-routes.test.ts`、`test/e2e/resource-share-management.test.ts`。已有测试是可复用基础，不代表新增边界已经通过。

遵守各仓库测试规则：OD 聚焦测试，不跑完整 daemon/web suite；完成时 guard/typecheck。Vela 仅用具备明确所有权的隔离 E2E 数据库和官方 selected harness，不能使用生产或共享开发库；发布前按仓库要求 lint/typecheck，若触及 Go 执行相应 CLI 检查。

## 9. 交付门槛与范围外事项

- 此文档保留实施前调查与决策依据；当前实现和本地验证以第 11 节为准。线上状态未验证。
- 服务端覆盖与故障注入未通过前，不宣布可以安全删除全部本地保护。
- 新客户端依赖新的云端限制／错误字段时，需要服务端先就绪；不可借兼容性重新增加 UI preflight，也不能在旧服务端静默放开。旧客户端调用新版云端须保持兼容。
- PR、合并、部署分别验证；本次计划不授权生产写入、发布或上线。
- 不涉及 Cloudflare／Vercel 部署分享，不修改协作评论权限，不修改内容生成，不扩大分享给其他成员的范围，不删除历史身份数据，不修改现有 Vela Web 未提交工作。
- 交付证据分别记录：方案、代码、聚焦测试、隔离事务 E2E、UI 验收、CI、合并、部署、实际客户端结果。未知阶段标 UNKNOWN，不以源码存在代替通过。

## 10. 实施前调查的代码证据索引

下列定位是当前读取版本的起点，可用于逐项复核；实现时如 HEAD 变化先重新定位。

| 编号 | 已核对位置 | 支持的事实 |
| --- | --- | --- |
| E01 | OD `apps/web/src/components/FileViewer.tsx:7965` | 分享面板与内容键触发 useSharePlan |
| E02 | OD `apps/web/src/components/share/useSharePlan.ts:65`；`ShareTab.tsx:200`、`:298`、`:374` | retry／run gate、错误态、按钮禁用 |
| E03 | OD `apps/web/src/components/FileViewer.tsx:8213`、`:8331`；`components/share/useShareSourceGuard.ts:7` | 发布／更新、来源保护、异步结果与错误分流 |
| E04 | OD `apps/daemon/src/routes/collab-sync.ts:1305`、`:1335`、`:1512`、`:1635` | 预检查和发布重复许可、打包、历史及失败恢复 |
| E05 | OD `apps/web/src/providers/registry.ts:1961`、`:2032`；`collab/public-file-publish.ts:109` | API 错误解析与通用文案折叠 |
| E06 | OD `packages/contracts/src/api/share.ts:295`；`routes/collab-sync.ts:438` | 20 MiB 为沿用常量；公开文件资源 kind 为 project |
| E07 | OD `packages/contracts/src/api/collab.ts:319`、`:666`；`apps/daemon/src/server.ts:5602` | 生命周期枚举、canShareProjects、固定会话及目录检查 |
| E08 | OD `apps/web/src/components/FileViewer.tsx:8562`；`state/projects.ts:219`；`ShareTab.tsx:450` | visibility 独立操作、move API、下半部控件 |
| E09 | OD `apps/daemon/src/routes/project/index.ts:3678`；`collab/runtime.ts:930` | move 原有保护与私有可见性变更，不等于删除 |
| E10 | Vela `services/api/src/resources/auth.ts:187` | control key 校验和服务端 principal |
| E11 | Vela `services/api/src/resources/routes.ts:787`；`resources/lifecycle.ts:27` | edit gate 与冻结谓词 |
| E12 | Vela `services/api/src/resources/routes.ts:1377`；`resources/persistence.ts:987` | bound 路由与原子 alias 提交，generic 路由防绕过 |
| E13 | Vela `services/api/src/app.ts:2150`；`collab/publication-authority.ts:175` | binding finalizer、owner／source／version／状态检查 |
| E14 | Vela `services/api/src/resources/routes.ts:73`、`:1155`、`:1761` | blob／批次限制、manifest 验证与 blob 实测校验 |
| E15 | Vela `services/api/src/team-projects/routes.ts:155`、`:181`；`team-projects/core.ts:175` | ensure-private、visibility endpoint、团队写入策略 |
| E16 | OD `apps/daemon/src/collab/public-file-mutations.ts:10`；`vela-share-publish.ts:58` | 本地串行化、绑定发布及精确回执校验 |
| E17 | OD `apps/web/src/components/share/{ShareErrorRow,ShareButton,ShareProgressButton}.tsx`；`ShareTab.tsx:403` | 已确认组件和真实发布重试图标 |
| E18 | OD `packages/contracts/src/api/failure-detail.ts:11`；`apps/daemon/src/collab/public-file-failure.ts:37` | 已有安全错误字段／分类，不是完整 outcome／幂等协议 |

| E19 | Vela `services/api/src/billing/core.ts:1871`、`:1980`；`workspaces/core.ts:1837`、`:6334`；`packages/shared/src/workspace-context.ts:239` | 有效付费周期、entitlement 与生命周期／权限投影 |
| E20 | Vela `specs/current/qa-automation-matrix.md:53`；`services/api/test/workspace-context-contract.test.ts:283`；`team-billing-a.test.ts:206`；`workspaces-lifecycle.test.ts:20` | past_due 可写的设计与测试源码；本轮未执行 |
| E21 | OD `apps/daemon/src/collab/vela-workspace-context.ts:151`、`:374`；`routes/collab-sync.ts:960` | 云端 permissions 优先、本地目录派生 active-only、公开流程借用 canShareProjects |
| E22 | Vela `services/api/src/resources/persistence.ts:560`、`:916`；`collab/comment-file-facts.ts:6`；`workspaces/postgres.ts:624` | 上传／资源创建授权与绑定事实的删除保护和事务锁 |
| E23 | Vela `services/api/src/collab/routes.ts:444`、`:475`、`:572`；`collab/publication-authority.ts:175` | stop、resume-existing、resume 独立授权及精确原始发布权威 |
| E24 | Vela `apps/cli/internal/resource/drive.go:373`；`services/api/src/resources/routes.ts:1236`、`:1251`、`:1761` | 分批上传无 abort；版本先创建，ref 冲突返回已创建版本 |
| E25 | Vela `services/api/src/resources/blob-store.ts:219`、`:255`；`services/api/src/index.ts:786`；`db/schema/resource_hub.hcl:7` | 有删除能力不等于上传回收；全工作区对象删除属擦除流程 |
| E26 | OD `apps/daemon/src/collab/share-alias-reservation.ts:1`；`share-alias-recovery.ts:1`；`share-publication-completion.ts:23`；`resume-pending-share-binding.ts:13`；`share-binding-startup.ts:28` | 稳定链接身份、本地事务和 binding-only 恢复的能力边界 |
| E27 | OD `apps/daemon/src/routes/collab-sync.ts:1635`、`:1695` | 本地完成失败补偿与本地 tempDir 清理 |


## 11. 当前实现与本地验证（2026-10-22，未提交、未合并、未部署）

### 已实现的两条流程

公开链接和工作区可见性仍在同一个 ShareTab，使用不同的操作、pending、错误、重试目标。公开发布／更新走同一个 `publish-public`；visibility 保持原 move 接口和原策略。错误统一使用项目的 `ShareErrorRow`、深色 `ShareButton` 和 `share-refresh-arrows` 图标。更新／停止失败不再使用错误 Toast，具体原因与重试操作分别记录，避免“停止失败的网络错误”被重试成更新。工作区所有权冲突、权限拒绝和冻结有对应文案，不覆盖公开错误或链接。

`FileViewer` 取消自动 preflight；`useSharePlan` 及无调用方的 Web fetch 已移除。daemon 发布、停止及状态读取取消远程 workspace directory、canShareProjects 和目录归属的重复门槛；发布仍校验本地持久化来源、固定账号会话、路径和文件代际。云端依据真实会话判定操作权限。显式 CLI preflight 仍作为已有诊断接口保留，不能作为公开发布前置门槛。

本地更新提示对完整发布包的路径和字节作指纹比较，依赖文件变化也能识别；恢复原内容会恢复 current，无基准则 unknown。`GET publish-public?localOnly=true` 无云端请求，CLI `od project share status --local-only --json` 使用同一入口。只有显式点击更新才再次提交发布。云端状态读取和本地 freshness 的错误互不覆盖。

### 上传恢复、回收和原子权限

1. Vela 新增 `public_uploads`，保存 workspace、member、resource、manifest、blob 清单、到期时间、已接受 versionId 和回收进度。`POST resources/:resourceId/public-uploads` 在传文件前登记；旧服务端不支持此协议时失败，不降级成没有恢复保护的上传。
2. OD 根据来源 scope、已确认的本地 publication revision 和完整包指纹生成恢复键；CLI begin、blob 上传和 versions 使用同一键。不拿 requestId 充当幂等键。相同尝试重试返回同一个 immutable version；篡改目标／清单返回冲突。过期未完成尝试可用相同清单续期，已清理的字节由既有 missing-blob 流程重传。
3. 公开版本事务再次锁定有效 workspace、member／user 和资源 owner；拒绝 locked/deleting/deleted、失效成员和已删除／他人资源。不复制客户端 active-only 规则，不改变有效 paid-period 的现有规则。manifest 插入、可信容量校验、version 和尝试结果同事务提交；低报大小导致 413 时 manifest/version 回滚，暂存仍有尝试归属。
4. bound alias 对相同 version 精确重放回执，不增加第二份 snapshot 或 alias version。被新版本取代、入口不同或已 redacted 的旧回执不能回滚当前链接。重放仍经过 finalizer，不能绕过停止状态或绑定权限。
5. 现有 append-only 资源版本保留：已接受的不可变版本及其尝试回执属于可恢复历史，不按“上传垃圾”删除。尚未建版本的过期暂存由后台 collector 回收。现有目录身份、历史版本、公开快照和评论引用不纳入全局 GC。
6. collector 每分钟运行，每轮最多 16 个尝试、每个最多 64 个 blob，持久化剩余清单；进程重启可以继续。删除前先提交 `gc_digest` 删除意图并移除 blob 索引；删除或后续数据库提交失败时保留意图，重启继续。意图未完成时拒绝同 digest 的新上传租约、恢复登记和索引写入，避免恢复引用到已删除对象。其他 collector 完成后，旧 worker 必须重查意图再删除，不能误删后来重传的内容。只有未被 manifest 引用、没有有效上传租约、没有其他活跃尝试保护的 digest 才删除对象及索引。find-missing、签名和 commit 为共享 digest 加租约；租约覆盖签名 PUT 有效期。引用写入、租约和回收共用事务锁，避免边回收边建立引用。回收不在发布响应路径执行。
7. `preparePublicationAuthority` 返回仅限同一事务、同一身份／资源使用的上下文，finalizer 复用已有 owner/metadata 和锁，不重新取得整套项目权威。不同 HTTP 阶段仍重新认证；这属于防上传期间撤权的必要检查。没有增加权限缓存，也没有实测延迟收益的承诺。
8. 原停止、精确恢复旧版本、binding-only outbox 和本地提交失败的精确补偿继续沿用。恢复链接不重传新文件；失败不更改工作区 visibility。

### 当前代码入口

| 仓库 / 文件 | 本期职责 |
| --- | --- |
| OD `apps/daemon/src/routes/collab-sync.ts` | 直接发布、稳定上传恢复键、本地 freshness、具体接口失败 |
| OD `apps/daemon/src/server.ts`、`collab/vela-project-share-state.ts` | 固定会话、删除目录预检查、只读状态不登记项目 |
| OD `apps/web/src/components/FileViewer.tsx`、`share/ShareTab.tsx` | 两条操作状态和重试独立、真实组件错误展示 |
| OD `apps/web/src/collab/public-file-publish.ts`、`providers/registry.ts`、`packages/contracts/src/api/share.ts` | 错误映射、本地比较协议 |
| Vela `services/api/src/resources/public-uploads.ts`、`index.ts` | 尝试、租约和后台回收生命周期 |
| Vela `services/api/src/resources/persistence.ts`、`routes.ts`、`public-share-policy.ts` | 原子版本、可信容量、去重回执和上传入口 |
| Vela `services/api/src/collab/publication-authority.ts`、`app.ts` | 同事务权威复用，保持原绑定规则 |
| Vela `apps/cli/internal/{client/resource_hub,commands/resource,resource/drive}.go` | CLI 上传协议和恢复键贯穿 |
| Vela `db/schema/resource_hub.hcl`、两份 `20261022*_public_upload*.sql` 和 `20261023034057_public_upload_delete_intent.sql` | Atlas 生成的尝试／租约与回收游标迁移 |

### 验证结果及边界

- OD：daemon 16 个聚焦文件 356 项通过；最终错误透传调整后相关 3 文件 169 项复验通过。Web 23 个文件 293 项通过，新增反向独立性用例后错误组件 19 项通过（新增 1 项）。覆盖直接提交、本地比较不访问云端、身份隔离、停止失败原操作重试，以及公开／visibility 各自 busy 时另一流程仍可重试。
- OD：根 guard、全仓 typecheck 通过；最后的 Web 类型检查通过。未运行完整 daemon/web suite。
- Vela：API 聚焦 7 个文件共 141 项通过；全仓 typecheck 通过。Go `make -C apps/cli test-ci` 通过，含 vet、测试、脚本测试、本机和 Windows 交叉构建。
- Vela：正式迁移和官方 selected harness 在任务自有 `share-flow-7921` 隔离数据库执行；三文件事务回归 53 项通过、1 项原有 skip。覆盖真实 Postgres 去重、失败回滚、绑定／停止／恢复、并发评论、撤权、对象回收和重启游标；最后资源上传文件 11 项复验通过，新增低报大小回滚和对象／索引一致性断言；合计覆盖当前三文件 54 项通过、1 项原有 skip。
- 对象删除故障使用可观测内存对象存储注入，验证对象与真实数据库索引；没有连接生产 bucket。生产对象存储和端到端客户端视觉验收为 UNKNOWN，不能拿组件测试冒充线上结果。
- Vela 本次文件 Biome 与两个仓库 `git diff --check` 通过。全仓 lint 仍被原有两个 draft 目录的 6 处 JSON 格式问题阻塞，未修改这些无关文件。全仓 typecheck 独立执行通过，不受 lint 的提前退出掩盖。
- CI 未执行；没有提交、合并或部署。Vela 原有 Web／消息中心工作保留，本次仅在共享的 app.ts 中修改资源发布接线。

## 12. 更新 2026-10-22 — 隔离联调三轮开发自测

### 结论与范围

本地三轮验证通过，发现的两处代码问题已修复并复验。本记录对应 OD `4bd36280f1`、Vela `908f76928` 之上的当前未提交改动。此前第 11 节的纯组件／内存存储证据仍保留；本节补充真实 CLI、HTTP、Postgres、MinIO 和浏览器证据。没有提交、合并或部署；CI、正式环境及跨平台安装包验收为 UNKNOWN。

### 环境与数据隔离

- Vela 命名环境 `share-flow-7921`：任务自有数据库、Redis 分区、API/Web 和本地 MinIO；仅使用测试账号与测试资源。
- 事务回归另用 `share-flow-tests-7921`，不清空联调数据库。该环境由官方 sandbox 当前 schema 初始化，通过 Atlas 登记对应基线后使用官方 selected harness 执行。
- OD 命名环境 `share-live-7921`，独立运行数据根，按根 AGENTS.md 的 Daemon data directory contract 传入；没有读取或替换日常客户端数据。
- 实际启用 Vela workspace context、resource 和 collab CLI transport。遗漏此配置会导致工作区移动返回 503，已修正测试环境并重跑；这不是产品代码修复。
- 个人工作区和独立团队工作区分别建 fixture。默认个人空间具有成员自修复行为，不能把直接删除默认 Owner 当作有效的“成员撤权”用例；成员撤权由真实 PG 事务测试覆盖，HTTP 层另验证账号封禁与跨工作区拒绝。

### 用户可见验收结果

| ID | 优先级 | 场景与操作 | 观察结果 |
| --- | --- | --- | --- |
| A1 | P0 | 首次发布，匿名浏览器打开分享页 | 成功发布，匿名 iframe 显示实际上传的 HTML |
| A2 | P0 | 修改 CSS，显式点击更新；随后停止、恢复链接 | 本地提示内容过期；更新沿用原链接；停止返回不可访问，恢复原快照，不上传停止期间的新内容 |
| A3 | P0 | 在同一个弹窗分别制造公开更新、工作区分享失败 | 两处错误各自显示红色错误行、深色重试按钮和项目原有刷新图标；不使用错误 Toast |
| A4 | P0 | 先重试公开更新，再重试工作区分享，等待各自响应完成 | 重试只执行对应操作；一个成功不清除另一处错误；最终工作区显示“团队成员” |
| A5 | P0 | 工作区可见性改变后核对公开链接；再停止／恢复公开链接 | 公开内容版本不因工作区移动改变；工作区可见范围不因公开停止／恢复改变 |
| A6 | P1 | 云端 API 停止时读取本地变动状态 | 状态与停止前相同，单次本地测量约 5 ms，不依赖云端可用性；不是生产延迟承诺 |

A3 的两次失败使用浏览器请求拦截：公开错误重放本地真实服务端 403 错误结构，工作区错误注入 503；后续重试放行到真实 daemon/CLI/API/DB。不能将这两次故障注入描述成完整网络事故。A4 等待 HTTP 成功及界面稳定，并核对数据库可见性，而不是以按钮消失作为通过依据。

### 开发自测结果

1. **真实传输与恢复 PASS**：CLI 经本地故障代理提交版本后，代理丢弃成功响应；第一次命令退出失败，重试成功，数据库只有一个版本。独立重启 API 后再次重放已接受上传，返回同一个版本 ID。
2. **可信容量及回滚 PASS**：真实上传 `20 MiB + 1 byte` 对象；低报大小在 blob commit 被拒绝；按真实大小登记后，公开版本提交返回 413，未遗留新 manifest/version。声明即超过限制也在服务端拒绝。
3. **回收 PASS**：真实 MinIO 未完成上传在租约有效时保留；过期后删除对象与索引。注入删除失败时保留重试记录，重新创建 collector 后成功清理；已发布 blob 保留。被拒绝的大对象过期后也清理成功。这里是生产 collector 类的受控调用，定时调度压力与生产存储仍未验证。
4. **权限 PASS**：真实 HTTP 验证锁定拒绝、欠费宽限期允许公开发布、无认证拒绝、账号封禁后不能重放、跨工作区拒绝。20 项真实 PG 测试覆盖成员撤权、资源归属、原子回滚、去重、回收游标、评论身份及工作区 published 读边界。
5. **客户端回归 PASS**：本轮 daemon 定向 5 文件 55 项，Web 定向 2 文件 44 项通过；OD 根 guard、全仓 typecheck 通过；Vela API typecheck、修改文件 Biome 和两仓 diff whitespace 检查通过。未运行完整 daemon/web suite。
6. **既有阻塞**：上一轮全仓 Vela lint 的无关 draft JSON 格式错误未修改。本轮不把局部 Biome 通过当作全仓 lint 通过。

### 本轮修复的代码问题

- **公开上传仍被工作区引用卡住**：评论身份登记和后续身份校验只认 workspace `published` ref，独立公开上传没有移动该 ref，导致首发 409。现在允许服务端已接受的公开上传回执作为另一种证据，严格匹配 team/resource/member/version/manifest，同时保留项目归属与活跃主体校验。普通工作区上传仍依赖自己的 published ref 与原有规则。公开回执路径不沿用 active-only 限制，允许 billing_past_due，仍拒绝 locked/deleting/deleted。真实首发重试与新增 PG 回归通过。
- **准备阶段吞掉具体错误**：bootstrap 已分类的服务端错误再被外层当成未知异常，变成通用 502。现在保留受控的状态码与错误码，服务端 403 能完整返回客户端；不透传原始 stderr、凭据或任意错误文本。新增回归及真实锁定拒绝复验通过。

对应实现与回归位于 OD `public-share-project-bootstrap.ts`、`public-file-failure.ts`、`collab-sync.ts` 及 bootstrap 测试；Vela `comment-file-facts.ts` 与 `comment-file-contract.test.ts`。临时诊断代码已移除。

### 本地证据与边界

- OD `.tmp/share-live/`：`lifecycle.log`、`ui-round3.log`、`offline-restart.log`、`guest.log`、`final-daemon-tests.log`、`final-web-tests.log`、`final-guard.log`、`final-typecheck.log`。
- Vela `.tmp/share-flow-validation/`：`live-round2.log`、`live-boundaries.log`、`restart-replay.log`、`pg-recheck.log`、`recheck-api-type.log`、`recheck-format.log`。
- 实际组件截图：公开失败 `public-error.png`、两条独立错误 `two-independent-errors.png`、恢复后 `recovered-popup.png`；均在 OD `.tmp/share-live/`。本地密钥文件不作为报告附件。
- 匿名分享内容读取已验证；本地 Web 的 `/api/share-auth/session` 返回 404，访客登录／发评论认证未完成环境接线，本次不据此宣称访客认证验收通过。
- 本次通过标准：上述 P0/P1 用例通过，已发现的发布／重试阻断修复并复验，真实上传不越权、失败不留下可访问的半成品链接、暂存有恢复／回收归属。结论仅限本地开发自测，不代替正式 QA 签署、CI 或生产验证。

联调结束后，已停止本次 OD namespace、两个 Vela sandbox、任务自有 MinIO 和临时 HTTPS 代理。保留隔离数据与日志供复查；未停止共享 Postgres/Redis 数据平面，也未操作其他任务环境。


## 13. 访客登录认证补充验证（2026-10-22）

第 12 节未完成的访客认证接线已在独立认证联调栈中补齐验证。沿用同一代码基线与当前未提交改动，使用任务自有 `share-flow-tests-7921` 数据库及官方 selected E2E harness；没有连接生产、合并或部署。

### 环境问题与修正

- 上一轮 HTTP sandbox 的 `SHARE_APP_ORIGIN`、`SHARE_AUTH_CLIENT_ID`、`SHARE_AUTH_CLIENT_SECRET` 均未配置。`resolveShareAuthConfig()` 返回 null，认证接口未挂载，因此 `/api/share-auth/session` 为 404；不是认证校验拒绝。该旧 HTTP sandbox 本轮未改造成认证入口。
- 本轮使用已有 `startShareBrowserStack()`，启用完整认证配置，启动两个 HTTPS origin、真实 API、Better Auth 官方 OAuth provider、openid-client 和 PostgreSQL。浏览器通过真实登录页面完成授权。
- 原测试域名 `aa3.test` 在本机发生 `ERR_CONNECTION_CLOSED`；测试改用保留的 `aa3.localhost` 回环域名，并为这套临时 Chromium 配置直连。复验通过。没有调整系统 DNS、代理或用户网络配置。
- 业务认证代码本轮未发现需要修改的问题。改动仅限认证浏览器测试、其启动 harness 及本方案记录；新增退出后的浏览器回归断言。

### 结果

| 场景 | 结果 |
| --- | --- |
| 已在账户站登录，点击分享页评论 | 自动授权回跳，进入评论模式，不自动发评论 |
| 未登录，点击分享页评论 | 进入真实登录页，登录后回到原分享页，手动提交评论成功 |
| 取消登录，再点击重试 | 返回可重试错误；重试登录成功，评论作者正确 |
| 分享站退出后刷新 | 会话返回 `authenticated: false`；评论入口要求登录，公开 HTML 仍可读，无额外评论提交 |
| 账户站退出、分享站退出、会话过期、账号禁用 | 接口拒绝旧身份写入；相关断言确认无新增评论事件 |
| 伪造凭据、错误 Origin、回调 state/nonce 不匹配、授权码重放 | 拒绝；分享 cookie 不授权工作区或控制台 API |

最终 selected harness：3 个测试文件、37 个 Vitest 用例通过，其中浏览器编排用例实际启动 3 个 Playwright 场景；即 36 项接口用例 + 3 个浏览器场景，不能重复计数。数据库核对仅出现三次显式评论，作者分别对应三个测试账号。浏览器退出检查复用第三个场景。

证据位于 Vela `.tmp/share-flow-validation/guest-auth-final.log`；首次连接失败及修复复验日志保留。认证、API、数据库和浏览器登录请求均走真实实现；浏览器 fixture 的静态 HTML blob 由测试响应提供，不将其描述为再次验证真实对象存储上传。此前真实上传链路证据仍见第 12 节。

本轮浏览器是本地 Chromium，两个 origin 使用同一 site 的 HTTPS 回环子域及临时证书；截至本节验证时，两个不同 site 之间的登录跳转与回调、WebKit/Safari、正式域名证书和部署配置仍为 UNKNOWN。这里不涉及跨站共享 Cookie：账户站与分享站各自保存自己的会话，通过一次性授权码完成登录回跳。不同 site 的本地补充验证见第 14 节。退出写入权限由真实 PG 接口测试覆盖，浏览器退出通过同源 logout 接口触发，不宣称验证了额外的退出按钮 UI。临时服务由 harness 关闭；共享数据平面和其他任务环境保持不变。


## 14. 两个不同站点之间的登录回跳验证（2026-10-23）

### 认证设计与表述

本次没有修改认证设计或业务认证代码。账户站和分享站各自使用自己的会话 Cookie；浏览器通过顶层页面导航访问账户站，授权后携带一次性授权码回到分享站，分享站验证结果后设置自己的 host-only Cookie。两站不共享 Cookie，不依赖第三方 Cookie。原“生产跨站 Cookie 验证”更正为“生产双站点登录回跳验证”。

### 本地不同 site 的验证结果：PASS

沿用官方 selected harness 和独立数据库 `share-flow-tests-7921`，在真实 Chromium 中运行两组 HTTPS 登录场景：

- 对照组：`ai.aa3.localhost` 与 `share.aa3.localhost`，不同 origin、同一 site。
- 不同 site 组：`ai.account.localhost` 与 `share.viewer.localhost`，各自属于不同 site。仅将测试主机名映射到回环地址，不修改系统网络或生产 DNS。
- 在两组中均直接断言浏览器实际发出的 `Sec-Fetch-Site`：账户站 authorize 请求及分享站 callback 请求分别符合 `same-site` / `cross-site`，并非只按域名外观推断。
- 断言分享会话 Cookie 只属于分享站主机，账户站 URL 对应的 Cookie 集合不包含分享会话 Cookie。

每组 3 个真实浏览器场景均通过，共 6 个：已登录账户自动授权回跳、未登录账户登录后回跳、取消后重试。每组数据库核对三次显式评论与正确作者，回跳不自动发评论；第三个场景还验证分享站退出后会话失效、评论入口恢复登录要求、公开 HTML 仍可读。

本轮仅修改 `share-browser-harness.ts`、`share-app-browser.test.ts`、`share-app-auth-live.spec.ts` 的测试配置与断言，以及本方案。API typecheck、修改文件 Biome 和 diff whitespace 检查通过。日志：Vela `.tmp/share-flow-validation/cross-site-auth.log`、`cross-site-typecheck.log`、`cross-site-format.log`。认证、授权回调及评论请求使用真实实现和 PostgreSQL；静态 HTML 仍是测试 blob fixture。

边界：本地 Chromium 的不同 site 登录回跳已验证，不再列为未验证。生产正式域名、可信证书、部署配置及 WebKit/Safari 尚未验证；本轮未连接生产、未合并、未部署。临时 API、HTTPS 前端和浏览器由 harness 关闭，隔离数据库保留。


## 15. WebKit 双站点验证与 Safari 实机阻塞（2026-10-23）

**WebKit 本地验证 PASS，Safari 实机验证 BLOCKED，二者不等同。** 本轮未改认证设计或业务代码，未合并部署。

- 使用 Playwright WebKit 26.4（build 2287），实际运行不同 site 的 HTTPS 账户站与分享站。既有 harness 增加 `SHARE_BROWSER_ENGINE=webkit` 选择；默认 Chromium 路径保留。
- WebKit 没有 Chromium 的主机解析参数，因此测试启动一个仅允许连接两个 fixture 主机及其端口的本地 CONNECT 代理，将连接转到任务自有 HTTPS 入口。代理只提供测试域名寻址，不改 HTTP 响应或认证数据，不修改系统代理、DNS 或证书信任。
- 初轮发现测试假设差异：WebKit 将原 `.localhost` 同 site 对照的两个主机也标记为 `cross-site`。WebKit 测试只选明确的不同 site 场景，保留严格的 `Sec-Fetch-Site: cross-site` 断言；Chromium 继续运行同 site 对照及不同 site 两组。没有放宽业务校验。
- 复验：3 个 WebKit 场景全部通过。已登录自动回跳、未登录完成登录后回跳、取消后重试；回跳不自动发评论，三次显式评论作者正确。退出后会话为未登录，评论重新要求登录，公开 HTML 继续可读。分享会话 Cookie 仅属于分享站，账户站 Cookie 集合不包含它。
- API typecheck、修改文件 Biome 和 diff whitespace 检查通过。日志：Vela `.tmp/share-flow-validation/webkit-auth-recheck.log`、`webkit-typecheck.log`、`webkit-format.log`；初轮失败记录保留于 `webkit-auth.log`。

Safari 实机：本机 SafariDriver 报告 Safari 27.2。创建 Safari WebDriver 会话时明确拒绝，要求在 Safari 设置的开发者选项中开启“允许远程自动化”。已告知用户开启方式，未擅自修改浏览器设置；没有真实 Safari 登录回跳通过证据。待开启后继续实机验证，不能以 WebKit 的通过替代此项。生产正式域名、证书和部署配置仍未验证。

本轮 Chromium 回归：同 site / 不同 site 两组共 6 个浏览器场景通过，日志为 Vela `.tmp/share-flow-validation/chromium-after-webkit.log`。测试临时服务和代理均由 harness 关闭。


## 16. 独立 PR 整理与主线复验（2026-10-23）

按用户要求将本次技术改造拆成 Open Design 与 Vela 两个配套 PR，均关联 OPEND-4264。用户已明确本期不再继续 Safari 实机验证，第 15 节的阻塞记录作为历史保留，不再作为本期待办。没有合并或部署授权。

从原工作目录按文件和代码块提取本需求：不包含评论加载／定位、移动端评论样式或消息中心的旁支改动。两仓均基于各自当时最新主线重放；Vela 保留主线的并行资源关闭逻辑，将上传回收器纳入同一关闭阶段，Atlas 校验清单通过工具重新生成。

提取后新增复验发现更新失败测试仍检查旧 Toast。现在改为断言统一的面板内错误行；同时保留既有更新保护：snapshot/persist 网络失败或手动撤销要求均显示“结果未确认”，已发布链接不提供盲目重试，不承诺远端仍为旧版本。明确失败仍可显式重试。

上线依赖固定为：Vela 数据库迁移 → Vela API（统一校验、恢复及回收）与匹配的 CLI → Open Design 客户端。新客户端不得先于服务端发布。回滚优先退客户端，保留服务端新增表和回执数据；不得通过删表清理已接受上传。PR 创建和 CI 不代表合并、部署或生产验收。


## 17. PR 复审修正（2026-10-23）

- **上传回收一致性**：原实现在同一事务内删除多个远端对象，后续对象失败或提交失败会回滚数据库，却无法恢复远端对象。改为先持久化删除意图及索引移除，再删除对象并完成意图；manifest 写入在同一引用锁内复查 blob 存在。已接受版本、历史引用和停止／恢复规则不变。
- **首次公开发布入口**：未登记项目的只读分享状态现在向有效成员返回空历史，不写 catalog；已登记项目仍只允许未删除项目的 Owner 读取，缺 catalog 但残留 binding 返回错误。点击发布时才登记，并由现有服务端写权限检查约束。避免状态读取失败隐藏首次发布按钮，也不引入工作区可见范围流程的依赖。
- **复验范围**：真实 PostgreSQL 注入部分删除成功、远端删除成功后调用报错、数据库最终提交失败，验证重启恢复；交错执行两个 collector，验证不误删完成回收后重新上传的对象。首发状态测试核对无登记副作用、无权限拒绝和残留 binding 不误报为空。
- 本轮问题与修复均由代码和隔离故障测试得出，不表示生产环境已发生数据丢失。服务端先上线的依赖保留；未合并、未部署。
