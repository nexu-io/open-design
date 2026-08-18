# Workspace Team 上线 Runbook

本手册用于把 Workspace Team 从 Vela `feature-test` 推进到 `test`，最终再发布到 production。它同时覆盖 Vela DB/API/Link/Web/CLI 和 Open Design 桌面包；任何一层没有明确版本和验收证据，都不能把整体标记为已上线。

> 安全边界：仓库内不得记录 Stripe 密钥、Webhook secret、数据库连接串、内部域名或测试账号密码。环境 URL、Secret 名称和值以 GitHub Environment、GitOps 仓库和内部上线记录为准。本手册中的 `<...>` 必须在受限上线记录中填写，不能直接提交真实 secret。

## 1. 发布角色与唯一证据单

发布前指定以下角色；一人可兼任，但每项必须有明确名字和替补。

| 角色              | 职责                                                           |
| ----------------- | -------------------------------------------------------------- |
| Release commander | 控制顺序、宣布 go/no-go、记录时间线、批准进入下一环境          |
| DB operator       | Atlas 状态、备份/PITR 可用性、migration 与 catalog seed        |
| Payments owner    | Stripe 产品、Price、Coupon、Webhook 和 sandbox/production 隔离 |
| Vela owner        | API、Link、Web、CLI 构建与部署                                 |
| Open Design owner | CLI pin、beta/prerelease/stable 包和 updater 元数据            |
| QA pair           | Owner + Admin/Member 双账号真实浏览器验收                      |
| SRE on-call       | Grafana/Loki/Tempo、告警、回滚和事故响应                       |

在受限上线记录中先建立一张证据表，至少包含：

```text
environment | component | source SHA | image digest/package version
workflow run URL | deploy start/end | operator | validation evidence
rollback target | result | open issue/waiver
```

版本必须是不可变标识：Git SHA、ECR digest、npm 精确版本、Open Design release version。分支名或 `latest` 不能单独作为证据。

## 2. 当前硬门禁

### 2.1 Vela 分支必须先同步最新 main

Vela 的 `DB Migration Gate` 会阻止包含 DB 变更但没有基于最新 `main` 的 PR。不要继续使用旧上线记录中“重命名 30 条 migration”之类的静态数字；以远端当前拓扑和 Atlas 校验为准。

```bash
git fetch origin main feat/workspace-team
git rev-list --left-right --count origin/main...origin/feat/workspace-team
git diff --name-status origin/main...origin/feat/workspace-team -- db/schema db/migrations
```

左侧计数不为 `0` 时，先在独立 worktree 将 `origin/main` 合入 `feat/workspace-team`，解决冲突并重新运行完整 CI。禁止在有用户 WIP 的主 checkout 中操作。

### 2.2 Open Design production 目前是显式关闭状态

当前 Open Design 代码只允许 `feature-test` 和 `test` profile 启用 Workspace Team transport；`prod` 即使拿到 Vela Web URL 也会保持关闭。证据在：

- `apps/packaged/src/sidecars.ts` 的 `WORKSPACE_TEAM_AMR_PROFILES`
- `.github/workflows/release-beta.yml` 的 `amr_profile` 和 `OD_VELA_WEB_URL`
- `apps/packaged/tests/sidecars.test.ts` 的 prod fail-closed 用例

因此，以下事项完成前，production 为 **NO-GO**：

1. 产品/维护者明确批准在 prod 开启 Workspace Team。
2. 代码把 prod 纳入受控 gate，并为“缺 URL 关闭、合法 URL 开启、错误 URL 失败”补测试。
3. stable/prerelease 工作流可以从 Secret 注入 prod Vela Web origin，且不会把内部地址写进源码或日志。
4. production Vela API/Web 已先上线并通过兼容验收。

不要用手工环境变量绕过这个 gate，也不要把 feature-test/test 包冒充 stable 包。

## 3. 发布前冻结与检查

### 3.1 冻结版本

记录并核对以下 SHA：

```bash
gh api repos/powerformer/vela/git/ref/heads/main --jq .object.sha
gh api repos/powerformer/vela/git/ref/heads/feat/workspace-team --jq .object.sha
gh api repos/nexu-io/open-design/git/ref/heads/main --jq .object.sha
gh api repos/nexu-io/open-design/git/ref/heads/feat/workspace-team --jq .object.sha
```

从此刻开始只允许 release blocker 修复。任何新 commit 都使该环境之前的 CI、目验和签字失效，必须对新 SHA 重跑。

### 3.2 必须为绿的检查

Vela：

```bash
gh run list -R powerformer/vela --branch feat/workspace-team \
  --workflow ci.yml --limit 10
gh run list -R powerformer/vela --branch feat/workspace-team \
  --workflow db-migration-gate.yml --limit 10
gh run list -R powerformer/vela --branch feat/workspace-team \
  --workflow smoke-lite.yml --limit 10
gh run list -R powerformer/vela --branch feat/workspace-team \
  --workflow qa-browser-ci.yml --limit 10
```

Open Design：

```bash
gh run list -R nexu-io/open-design --branch feat/workspace-team \
  --workflow ci.yml --limit 10
```

同时要求：

- 所有 blocker review comment 已核实并解决；不适用的 comment 有书面原因。
- 合入提交没有 `Co-authored-by`。
- Vela API 对旧 CLI 请求仍向后兼容；显式 Workspace 请求不得静默回退 Personal。
- 未登录 Open Design 仍能使用本地 Coding Agent 和 BYOK，不能因 AMR 不可用被余额弹窗阻断。
- `powerformer/apps` 中各环境的变量/ExternalSecret 映射已合并并同步；只确认 Secret 存在，不在日志中打印值。

Workspace billing flags 必须按 API 的启动校验保持依赖顺序：

```text
WORKSPACE_BILLING_DEFAULT_SCOPE
  -> requires WORKSPACE_BILLING_LINK_SCOPE_V2=true
  -> requires WORKSPACE_BILLING_SCOPED_SETTLEMENT=true
```

`WORKSPACE_TEAM_ENABLED=false` 是服务端总开关。每个环境都要在证据表记录这四个 flag 的期望布尔值，并从 rollout 后 Pod 的受限配置视图核对；不要打印其他 env 或 Secret。

### 3.3 Stripe 和账单目录

每个环境独立核对：

- Stripe account/mode 正确，sandbox 与 production 的 Product、Price、Coupon、Webhook 不混用。
- Team Basic/Plus/Pro/Max 的月付和年付共 8 个 active catalog 条目。
- `plan_id`、账期、币种、最低席位、单席价格、月额度、优惠金额与产品签字一致。
- Webhook endpoint 已订阅上线代码依赖的事件；签名 secret 已通过 ExternalSecret 注入。
- 重放同一个 Stripe event 不会重复发额度、重复开票或重复执行 `invoice.paid` 副作用。
- Personal Plus -> Team、Free -> Team、Team 升降级、手动充值和发票路径在 sandbox 真实支付通过。

production 目录只能从 production Stripe 对象生成。禁止复制内部 Wiki 中的 test Price/Coupon ID。

### 3.4 DB 门禁

- 确认生产数据库 PITR/备份在恢复窗口内，并记录恢复责任人。
- migration 必须 expand-first，旧 API 和新 API 都能在过渡 schema 上运行。
- 先 `check`，后 `apply`；legacy credit repair 默认不执行。
- `repair` 是单独的、显式批准的数据变更，必须先导出受影响行数和只读校验结果。
- migration 失败后不允许直接回滚 SQL；优先修复前滚。只有 DB operator 确认存在经过演练的逆迁移时才能执行。

## 4. 统一发布顺序

每个环境都使用同一顺序；上一步完成并留证后才进入下一步：

1. Stripe/Secret/GitOps 配置就绪，但功能仍关闭。
2. DB migration。
3. Team billing catalog seed 与只读校验。
4. Vela API。
5. Vela Link（若请求、计费或 runtime contract 有变化）。
6. Vela Web。
7. Vela CLI 精确版本发布。
8. Open Design pin 新 CLI，构建对应环境的包。
9. 双账号真实浏览器与 packaged app 验收。
10. 观察窗口通过后才进入下一环境。

若一次 push 同时触发 feature-test 的 DB/API/Web/Link workflow，它们可能并行。只有 expand-first schema 才允许这样做；否则把变更拆成“兼容 migration -> service -> cleanup migration”三个发布批次。

## 5. Feature-test

`powerformer/vela` 的 `deploy/environments/feature-test/bound-branch.json` 必须仍绑定 `feat/workspace-team`。Feature-test workflow 从 `main` 读取该绑定，再构建绑定分支的精确 SHA，并在 rollout 前校验 SHA、镜像 tag 和 digest。

相关路径有变更时 push 会自动触发；没有触发时从 `main` 手动 dispatch：

```bash
gh workflow run deploy-db-and-model-routing-catalog-feature-test.yml \
  -R powerformer/vela --ref main -f legacy_workspace_credit_action=check

gh workflow run deploy-api-eks-feature-test.yml \
  -R powerformer/vela --ref main
gh workflow run deploy-link-eks-feature-test.yml \
  -R powerformer/vela --ref main
gh workflow run deploy-web-eks-feature-test.yml \
  -R powerformer/vela --ref main
```

必须等待每个服务的 `Sync and Verify Feature Test Rollout` 成功；该 job 会验证所有 ready Pod 都运行预期 digest。只看到 build 绿不算部署成功。

发布 Vela CLI 的 test channel：

```bash
gh workflow run vela-cli-package.yml \
  -R powerformer/vela --ref feat/workspace-team
```

记录 workflow 产出的精确 `@powerformer/vela-cli@<version>-test.<n>`，确认 macOS arm64/x64、Windows x64 和 Linux 包发布与 smoke 均成功。随后在 Open Design 更新 `tools/pack/package.json` 的精确 pin 和 lockfile；不能依赖 npm dist-tag 漂移。

构建 feature-test beta：

```bash
gh workflow run release-beta.yml -R nexu-io/open-design \
  --ref feat/workspace-team \
  -f ref=feat/workspace-team \
  -f amr_profile=feature-test \
  -f enable_mac_arm64=true \
  -f enable_win_x64=true \
  -f publish=true \
  -f mac_arm64_sign_mode=notarize \
  -f mac_arm64_smoke_mode=full \
  -f win_x64_target=all \
  -f win_x64_smoke_mode=full
```

`release-beta` 必须报告 `release_state=complete`。核对 beta metadata 的 `github.commit` 等于冻结的 Open Design SHA，平台 artifact 均有 checksum；应用身份必须是 `Open Design Beta`。

## 6. Test

Feature-test 观察通过后，将 Vela 变更通过 PR squash 合入 `main`。`main` push 对路径匹配的 DB/API/Link/Web 自动部署到 test；不要因某个 workflow 未触发而假设旧服务已兼容。

必要时按顺序手动 dispatch：

```bash
gh workflow run deploy-db-and-model-routing-catalog-test.yml \
  -R powerformer/vela --ref main
gh workflow run deploy-api-eks-test.yml -R powerformer/vela --ref main
gh workflow run deploy-link-eks-test.yml -R powerformer/vela --ref main
gh workflow run deploy-web-eks-test.yml -R powerformer/vela --ref main
```

Test workflow 会写 GitOps values，但不像 feature-test workflow 一样内建 exact-digest rollout job。Release commander 必须从 workflow 记录 GitOps commit/image tag，并由 SRE 在 GitOps/集群只读视图确认 rollout healthy 后再验收。

用 `amr_profile=test` 重跑 Open Design beta；其余输入与 feature-test 相同。Feature-test 包不能作为 test 证据，因为 profile 和后端不同。

## 7. Production

只有第 2.2 节的 prod gate 已通过代码、review、CI 和 prerelease 验证后才能继续。

### 7.1 Vela production

所有 production workflow 只允许从 `main` 手动 dispatch，并受 GitHub `prod` Environment 审批保护：

```bash
gh workflow run deploy-db-migrations-prod.yml \
  -R powerformer/vela --ref main
gh workflow run deploy-model-routing-catalog-prod.yml \
  -R powerformer/vela --ref main
gh workflow run deploy-api-eks-prod.yml \
  -R powerformer/vela --ref main
gh workflow run deploy-link-eks-prod.yml \
  -R powerformer/vela --ref main
gh workflow run deploy-web-eks-prod.yml \
  -R powerformer/vela --ref main
```

若 Workspace 变更触及 Admin，再单独运行 `deploy-admin-eks-prod.yml`。每次 dispatch 后先完成健康检查和观察窗口，不能把五个 workflow 一次性全点下去。

后端兼容确认后再发布 production Vela CLI：

```bash
gh workflow run vela-cli-release.yml -R powerformer/vela \
  --ref main -f target_ref=main -f bump=patch
```

记录 GitHub release tag、npm 精确版本、各平台 checksum 和 Windows smoke。然后让 Open Design release branch pin 该 production CLI 精确版本。

### 7.2 Open Design prerelease 与 stable

Workspace Team 必须先存在于 `main`，再走仓库既有 release branch -> prerelease -> stable promotion，不从 beta 直接升 stable：

```bash
gh workflow run cut-release.yml -R nexu-io/open-design \
  --ref main -f version=<x.y.z>

gh workflow run release-prerelease.yml -R nexu-io/open-design \
  --ref release/v<x.y.z> \
  -f ref=release/v<x.y.z> \
  -f release_version=<x.y.z> \
  -f win_x64_smoke_mode=full

gh workflow run release-stable.yml -R nexu-io/open-design \
  --ref release/v<x.y.z> \
  -f ref=release/v<x.y.z> \
  -f prerelease_version=<x.y.z-prerelease.n> \
  -f dry_run=prepublish \
  -f win_x64_smoke_mode=full
```

`prepublish` 全绿、QA 签字和 production Vela 观察窗口通过后，使用同一 prerelease 和 release branch 把 `dry_run` 改为 `publish`。Stable 仍由 validated prerelease 推进，不能从 preview/beta metadata 拼装。

## 8. 兼容矩阵

每格必须实际运行，不得只靠单元测试推断。

| 客户端/身份                        | Personal                      | Team Owner              | Team Admin           | Team Member               | 未登录           |
| ---------------------------------- | ----------------------------- | ----------------------- | -------------------- | ------------------------- | ---------------- |
| 上一个 stable OD + 上一个 prod CLI | Personal 账本                 | 旧请求保持兼容          | 旧请求保持兼容       | 旧请求保持兼容            | Local agent/BYOK |
| 新 OD + 新 CLI                     | Personal scope                | Team scope、管理和计费  | Team scope、权限边界 | Team scope、只读项目+评论 | Local agent/BYOK |
| 新 OD + 后端 N-1（回滚态）         | 可用或明确失败                | 不能静默扣 Personal     | 不能越权             | 不能越权                  | 不受 AMR 影响    |
| 旧 OD/CLI + 新后端                 | 旧无 scope 请求按既有兼容规则 | 默认 Workspace 行为保真 | 同左                 | 同左                      | 不受影响         |

重点断言：

- 显式 `workspaceId` 请求只能使用该 Workspace；不可解析时 fail closed，不能退到 Personal。
- 真正无 Workspace scope 的旧请求保留既有兼容行为。
- Workspace 切换不能停止原项目 run，也不能把运行中计费切到新 Workspace。
- Team workspace 有余额时，模板运行不能弹 Personal `$0` 的升级弹窗。
- Owner/Admin/Member 权限与当前产品定义一致；Member 可分享自己的资源，但不能修改别人的共享项目产物。

## 9. 双账号真实验收

使用全新 Chrome profile 和两个真实账号/两个隔离客户端实例。不得用同一 daemon data root、同一 Vela profile 或同一浏览器 storage 冒充双账号。

1. Owner 创建 Team、邀请 Admin 和 Member；两端角色与成员列表一致。
2. Owner 创建/从模板运行/Remix/复制项目，验证项目绑定当前 Workspace。
3. 个人项目分享进 Team 后只出现在 Team 列表；移出后只出现在 Personal。
4. 重命名后返回“最近/全部项目”，两端无需刷新看到同名；更新时间不能因单纯 pull 被改成“刚刚”。
5. 项目 owner 修改/新增/删除产物，另一账号无刷新看到；非项目 owner 的写入和 run/chat 返回明确 403。
6. Owner、Admin、Member 分别发表评论；其他账号无刷新看到计数、锚点和正文。再验证编辑、删除和“发送到聊天”。评论可见性按 Team project，而不是本地 conversation ID。
7. 两个账号同时打开项目，在线成员名单均显示对方；切换设计文件/预览或 Workspace 不应靠组件重挂载才恢复。
8. 分享/移出 Design System、plugin、project，验证 Personal/Team tab 不重复且撤销及时同步。
9. 运行中的 Team 项目切换到另一个 Workspace；原 run 继续且 usage/trace/账单仍归原 Workspace。
10. 未登录状态真实启动 Codex/OpenCode/Claude 中至少一个本地 agent，并验证 BYOK；不得出现 AMR 余额弹窗。
11. 真实 sandbox 支付覆盖 Free -> Team、Personal Plus -> Team、Team 升级、席位变化、手动充值、发票；Webhook 后 UI 和账本最终一致。

每项保留：时间、账号角色、Workspace/project/run ID、请求 trace ID、截图或录像、关键 HTTP 状态和预期/实际。截图不得包含 cookie、session token 或支付凭据。

## 10. 性能与 CDN

- 记录 project 首开、文件树、首个预览、聊天历史、评论/在线状态同步和 Workspace 切换的基线与发布后数据。
- 同一 project 的列表/预览切换不得反复出现全屏 loading；缓存命中和 stale-while-revalidate 行为必须保留。
- 新静态资产必须使用内容 hash。发布后从 HTML 提取实际 JS/CSS URL，逐个确认 `200` 和正确 `content-type`。
- Cloudflare/CDN 不得长时间缓存静态资产 `404`。若 rollout 新旧 Pod 混跑，先等 exact-digest rollout 完成，再验收新 HTML 与其引用的资产。
- 发现缓存污染时只 purge 精确受影响资产/版本前缀；不要把全站 purge 当常规发布步骤。purge 前后都保留响应 header 证据。

性能退化、无限 loading、资产 404/错误 MIME 或频繁重复请求均为 STOP，不以“刷新后可用”放行。

## 11. 观察、告警与停止条件

每个环境至少观察一个完整的支付 Webhook + Team run 周期。Production 初始观察窗口不得少于 60 分钟。

观察面：

- Grafana：API/Link 5xx、延迟、模型成功率、TTFT、CPU/内存、Pod restart/unavailable。
- Loki：Workspace scope、billing、Stripe webhook、catalog、collab/presence/comment、TLS 和 timeout 错误。
- Tempo：按 `open_design.run_id` 核对 CLI -> API -> Link trace 和 Workspace 计费归属。
- Postgres/账本只读查询：重复 grant、负余额、错 Workspace、Webhook backlog、outbox/retry backlog。
- GitHub Actions/GitOps：built SHA、image digest、GitOps commit 与 ready Pod 完全一致。

任一条件触发立即停止推进：

- 显式 Team scope 静默回退 Personal，或扣错 Workspace。
- 重复扣款/额度、漏发订阅额度、Webhook 副作用被跳过。
- 权限绕过、跨 Workspace 数据泄漏、评论/产物错误同步。
- migration/seed 校验不一致或需要未审批的数据 repair。
- API/Link 5xx、错误率、延迟、Pod 重启超出发布前基线/既定阈值。
- 客户端未登录本地 agent/BYOK 回归。
- 新版本无法通过 updater 安装、冷启动或回到上一个健康版本。

## 12. 快速回滚

### 服务

1. Release commander 宣布 freeze，停止后续 workflow 和新 stable 发布。
2. 从证据表取上一个健康 image tag/digest；不要凭“上一次 run”猜。
3. 通过 `powerformer/apps`/Orbit GitOps 把受影响服务的 values 恢复到该不可变镜像并等待 reconcile。
4. 确认 Deployment、所有 ready Pod 和 digest 一致，再做 health/smoke。
5. 若 API 与 Link contract 成套变化，按已验证兼容组合一起回滚；不要留下不兼容的混合版本。

禁止用临时 `kubectl set image` 作为最终回滚：它会与 GitOps 漂移并被覆盖。

### DB

Atlas migration 默认不可逆。服务回滚必须能在新 schema 上运行；若不能，发布设计本身不满足 expand-first，禁止上线。数据修复只能走经 review、dry-run、影响行数确认和备份验证的独立操作。

### Vela Web/CDN

回滚到上一个健康 Web image 后，先验证 HTML 引用旧 hash 资产仍为 `200`。只对确认污染的 asset URL 做精确 purge。

### CLI/Open Design

- 停止发布/撤回下载通知；不要覆盖已发布的 npm 版本或 release artifact。
- Beta/prerelease 通过发布一个更高版本修复；Stable 使用仓库 release 流程发布 patch。
- updater metadata 只能指向经过 smoke 的完整 artifact 集；不能手改成半发布版本。
- 若新客户端会对旧后端产生危险写入，先在服务端关闭功能 gate，再回滚客户端。

回滚完成仍需跑第 8、9 节的关键兼容与双账号链路，并持续观察；“Pod 已回滚”不等于事故结束。

## 13. Go/No-Go 签字

只有以下全部为真才能宣布环境完成：

- [ ] 证据表中每个组件都有 SHA/digest/version、workflow URL 和 operator。
- [ ] CI、migration gate、rollout/smoke 全绿且对应当前 SHA。
- [ ] Stripe/DB/catalog/Secret 配置由双人复核。
- [ ] Owner/Admin/Member + 未登录兼容矩阵完成。
- [ ] sandbox 支付、Webhook、额度、账单、发票完成。
- [ ] project 首开/缓存/评论/在线状态无性能回退。
- [ ] 观察窗口内没有新增 firing alert 或未解释的错误尖峰。
- [ ] 回滚目标和执行人已确认，且没有依赖不可逆 DB downgrade。
- [ ] QA、Vela owner、Open Design owner、SRE、Release commander 签字。

任何 waiver 必须写明风险、有效期、owner 和回收条件；口头“先上线再看”不是有效签字。

## 14. 实现来源

操作命令和边界来自以下实际实现；修改 workflow 后应同步更新本手册：

- Open Design `.github/workflows/ci.yml`
- Open Design `.github/workflows/release-beta.yml`
- Open Design `.github/workflows/cut-release.yml`
- Open Design `.github/workflows/release-prerelease.yml`
- Open Design `.github/workflows/release-stable.yml`
- Open Design `tools/pack/AGENTS.md`
- Vela `.github/workflows/deploy-*-feature-test.yml`
- Vela `.github/workflows/deploy-*-test.yml`
- Vela `.github/workflows/deploy-*-prod.yml`
- Vela `.github/workflows/vela-cli-package.yml`
- Vela `.github/workflows/vela-cli-release.yml`
- Vela `deploy/environments/feature-test/bound-branch.json`
- Vela `specs/current/observability/{monitor,alert}.md`
