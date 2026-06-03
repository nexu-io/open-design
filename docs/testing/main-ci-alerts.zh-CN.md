# Main CI 告警处理规则

这份文档约定 `main` 分支全量 CI 失败后的告警范围、消息内容和处理方式。目标只有一个：`main` 挂掉时，相关负责人能尽快看到并恢复为绿色。

## 告警目标

- `main` 分支全量 CI 失败时，及时通知值守人员
- 告警内容能直接带出定位线索
- 区分产品回归、测试过时和基础设施抖动，降低误判成本

## 告警范围

只对以下情况发送飞书告警：

- workflow：主 CI，名称为 `ci`（定义在 `.github/workflows/ci.yml`）
- event：`push`
- branch：`main`
- conclusion：`failure`

不对以下情况发群告警：

- 普通 PR 失败
- feature branch 失败
- 手动 `workflow_dispatch` 失败

## 告警群建议

建议单独建立一个 `main` 告警群，而不是发到日常开发大群。

推荐群成员：

- 负责 trunk 稳定性的人
- 最近活跃的仓库维护者
- 有权限回滚或修复 CI 的人

这个群只接 `main` 级别告警，不接普通 PR 失败。

## 告警消息内容

每条告警至少应包含：

- workflow 名称
- failing jobs 列表
- GitHub Actions run 链接
- `head_sha`
- commit subject
- commit author
- 关联 PR 编号、标题、链接（如果能解析到）

告警文案应保持中性，不直接判断是产品问题还是测试问题。

推荐格式：

- `Open Design main CI failed`
- `failing jobs: ...`
- `commit: ...`
- `PR: ...`
- `run: ...`
- `needs triage`

## 处理时限

收到告警后，建议按以下节奏处理：

1. 尽快认领
2. 在 15 分钟内完成初步分类
3. 优先恢复 `main` 为绿
4. 再处理根因和后续治理

## 故障分类

收到告警后，先将问题归到以下四类之一：

- `product-regression`
- `test-regression`
- `infra-flake`
- `unknown`

### `product-regression`

定义：

- 产品代码或行为真实回归
- 当前测试失败是合理发现

处理原则：

- 修代码或回滚
- 以恢复 `main` 绿灯为优先

### `test-regression`

定义：

- 用例预期过时
- UI、文案、结构或交互已合法变化，但测试仍按旧合同断言
- 产品本身没有真实损坏

处理原则：

- 告警照发，因为从 trunk 稳定性的角度 `main` 的确已经变红
- 优先恢复 `main` 绿灯
- 可选处理方式包括：
  - 修测试预期
  - 收窄断言
  - 降低优先级
  - 临时 `skip` 或 `fixme`
- 修完后再评估该 case 是否还适合留在当前 gate 层

推荐在处理结论里明确标注：

- `classified as test-regression`
- `root cause: stale E2E expectation after UI behavior change`

### `infra-flake`

定义：

- 环境、网络、端口、缓存、第三方依赖等外部因素导致失败
- 同一代码重跑可能通过

处理原则：

- 优先确认是否可通过重跑恢复
- 如果反复出现，应单独治理，而不是长期依赖手动重跑

### `unknown`

定义：

- 暂时无法快速判断根因

处理原则：

- 先补充日志和上下文
- 尽快收敛成以上三类之一

## 对“用例过时”的特别处理

如果确认属于 `test-regression`，应按以下原则处理：

1. 先恢复 `main` 为绿
2. 再决定是修断言、下沉测试层级，还是把该 case 从 gate 中降级
3. 如果同类问题反复出现，应评估：
   - 断言是否过脆
   - 是否应该改成更稳定的合同测试
   - 是否更适合放到组件测试或更低层
   - 是否应从 `P0/P1` 挪到更低优先级

## 恢复优先级

统一原则：

1. 第一优先级：恢复 `main` 为绿
2. 第二优先级：修根因
3. 第三优先级：优化测试分层或告警规则，减少重复噪音

## 群内处理约定

建议每次告警后至少补一条简短结论消息：

- `claimed by @xxx`
- `classified as test-regression`
- `fix pushed: <sha / pr>`
- `main back to green`

## 不建议的做法

- 不区分测试问题和产品问题，统一按功能回归处理
- 因为“只是测试过时”就不发 `main` 告警
- 长期依赖重跑而不治理 flaky 或 stale cases
- 把所有 PR 失败都推到同一个群里
