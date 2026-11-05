# PostHog 成本优化试点：设置/搜索输入统计验收

目标是在不减少用户覆盖的前提下验证汇总是否能降低事件成本。本PR先保留原始，
额外形成5/10分钟汇总并每小时批量发送，验证准确性、故障恢复和客户端开销；不合并、不发布。
第一轮会增加事件，只有后续获批替换部分原始后才可能降本。

- [主文档：方案、自测、发版前6项工作](https://powerformer.feishu.cn/wiki/NTlywJroYiURBAk4xuqcUaYXnCV)
- [独立评估：线上回收、比较基线和快照时点](https://powerformer.feishu.cn/docx/El67dX79GoTSgoxMbLIcU7FKn0f)
- [执行表与D+1/D+3/D+7 Agent Prompts](https://powerformer.feishu.cn/sheets/Fh33sGvdphAVdYtHGxCcEZtPnwb)
- [Plane OPEND-4684](https://plane.powerformer.net/open-design/browse/OPEND-4684/)

## 公共层改什么

| 位置 | 行为 | 约束 |
| --- | --- | --- |
| 公共输入观察器 | 设置/搜索累计尾段后台保存；原始和汇总有同一数据依据 | 业务组件不改，不采集输入内容；业务输入不等待磁盘 |
| 公共队列 | 先持久化不可变原始，再立即发送原始；汇总按小时发，隐藏/退出/恢复可提前收尾 | 原始仍走`/i/v0/e/`，汇总走`/batch/`；重试保持UUID、身份、时间和正文 |
| Desktop/Host | 异步IPC到SQLite工作线程；正常退出先让公共层保存尾段，再关存储 | COMMIT才算已保存；退出等待有2秒上限，不等网络 |
| 目标及控制 | 本机daemon提供显式试点配置；默认关闭 | HTTPS PostHog Cloud US/EU目标校验；测试专用假Key的loopback例外 |
| 存储迁移 | 原IDB先复制到原生，读回一致后删源；冲突保留两边 | 回旧版前先兼容drain；旧版不能被假定自动读新库 |

这是现有公共层内部模块，不是新独立SDK或包。无新增依赖、业务组件、CI工作流。
持久化和汇总共用队列；持久化/容量失败会停止新增试点并报告状态。普通原始路径仍保留回退，
但不能把存储错误或提交前被强杀的输入承诺为可靠保存。

## 怎么启用与暂停

标准发布默认不启用。原生能力需进程显式`OD_INPUT_TRIAL_CAPABILITY=1`，并且配置目的地合法。
聚合还需daemon实际数据根内的`input-aggregation-trial.json`，字段如下（不在文档放真实Key）：

```json
{
  "trial_id": "qa-opend-4684-example",
  "revision": "r1",
  "mode": "shadow",
  "host": "https://us.i.posthog.com",
  "project_key": "phc_REPLACE_WITH_APPROVED_PROJECT_KEY"
}
```

目标必须与当前analytics host/key完全一致。数据路径遵循[根AGENTS数据根契约](../../AGENTS.md#daemon-data-directory-contract)，
从已解析的daemon数据根传入，不猜测或复用日常客户端目录。

| 模式 | 原始 | 新聚合 | 已有队列 |
| --- | --- | --- | --- |
| shadow | 保存后立即发 | 开 | 正常发送 |
| paused | 原有公共路径继续 | 停 | 保留、暂停发送 |
| drain | 原有公共路径继续 | 停 | 兼容版本继续清偿 |

已启用的客户端约30秒重读配置；配置缺失/非法会暂停。启动时无配置的客户端不额外轮询，
首次启用需重启。它不是公司远程灰度开关。回退前先drain并确认队列为空；否则保留原库并指定兼容版本处理，不能清库后称成功。
旧的全假Key/loopback本地编译开关仍可用于旧夹具；真实目标验收使用上述显式能力和配置，不依赖旧QA专用App包装。

## 测试从标准PR安装包开始

研发用仓库现有`pnpm tools-pack mac build --to app`构建验收版本，并交付匹配源码SHA、构建日志、运行文件哈希与便携夹具。
本轮代码冻结为`03c3838ce3db670765b148a0fc3aed0c037823fa`、安装版`0.25.1-preview.4`；后续文档提交不能被写成重新打包。
测试包/夹具入口见主文档最新章节；旧`20261104`包只作历史证据。

夹具使用已安装App自带Node和Chromium，含固定版本playwright-core，不需要系统Node、Python或另装浏览器。
解压到可写目录后：

```bash
bash configure-app.sh '/实际位置/Open Design Preview.app'
bash launch.sh pilot "$PWD/runs/自测-001"
```

configure核359个运行文件，记录当前机器路径。结果目录必须新建；保留失败证据，不改哈希绕过校验。
夹具源码和运行包作为独立验收附件，不把App、第三方依赖、密钥或原始运行日志提交产品仓库。
实际进程由现有sidecar生命周期原语隔离和关闭，遵守共享browser-lock队列，不批量按名称杀进程。

| 入口 | 内容 | 判定 |
| --- | --- | --- |
| pilot | 正常、空重启、断网、确认丢失、配额、暂停与清偿 | 70次可信输入；原始70，5/10分钟各66，另4次在暂停/清偿时只发原始 |
| kill | 保存后的原始及不足30秒尾段强杀恢复；持锁不等盘；提交前强杀 | 已保存必须恢复；提交前窗口单列已知缺口，不算硬完整性通过 |
| migration | IDB待发复制到原生，读回后删源 | 同6次输入，原始/5/10分钟各6，不重复累计 |
| rollback | 留待发→缺配置重启→原始继续→paused→兼容drain | 待发ID保留且最终清空；不冒充旧二进制降级验收 |
| performance | IDB与原生交错各2轮，空闲/输入/断网/恢复 | 输入延迟、CPU、内存、磁盘及提交耗时，门槛另确认 |
| hour | 实等1小时；第1/6分钟各设置20、搜索20 | 原始/5/10分钟各80；首条汇总不早于保存的deadline |

执行方式为`bash launch.sh <入口> <全新结果目录>`。小时用例约65分钟，发送期限前不退出、隐藏、手动flush或改时钟。
快速用例、退出触发发送、模拟定时器都不能替代真实小时。

远端接收仅由研发带单独批准的目标文件执行。当前复验使用现有OpenDesign420348，
`env=test`及`qa-opend-4684-*`设备隔离，真实事件按UUID/身份/时间/数值逐条比对；
需排除这些QA记录后再做业务分析。HTTP确认与目标查询可见分别验收，不修改项目规则。

## 工程检查

使用Node24、Corepack固定pnpm。只跑定向检查，不跑本机全量Web/Daemon套件：

```bash
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/web exec vitest run -c vitest.config.ts --maxWorkers=2 tests/analytics/input-aggregation.test.ts tests/analytics/input-aggregation-hourly.test.ts tests/analytics/input-aggregation-transport.test.ts tests/analytics/input-native-store.test.ts tests/analytics/input-trial-delivery.test.ts tests/analytics/input-trial-config.test.ts tests/analytics/error-tracking.test.ts tests/observability/chat-interaction.test.ts
pnpm --filter @open-design/desktop exec vitest run -c vitest.config.ts tests/main/input-native-store.test.ts tests/main/input-prewarm.test.ts tests/main/preload-host-boundary.test.ts tests/main/invite-deeplink-protocol-registration.test.ts
pnpm --filter @open-design/contracts exec vitest run tests/analytics-client-metrics.test.ts tests/analytics-input-trial.test.ts
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/storage/input-aggregation-config.test.ts
pnpm --filter @open-design/tools-pack exec vitest run tests/workspace-build.test.ts tests/prebundle/macos.test.ts
pnpm typecheck
pnpm guard
git diff --check
```

准确命令、原始日志、源码冻结点与校验值随证据交付。PR描述记录当前CI，不沿用旧HEAD的PASS。

## 证据和仍须人工验收的边界

每轮保留独立可信输入见证、本地COMMIT、HTTP请求/确认、PostHog查询结果，三套分别按稳定ID对账。
最大值取max，可加字段求和；不能通过三套一起少采后相等来证明无损，也不能恢复逐键P95。
本地日志/数据库只证明对应已保存的事实，不能证明所有物理按键都进入了公共观察器。

- 异步提交前强杀仍可能丢，不宣称任意时刻零丢失，也不是线上丢失率。
- 上限为1024原始、512汇总、2MiB；满或存储错误不会自动清空旧事实，但不证明无限离线完整。
- 主机默认配置真实接收已小量验收，不等同于所有线上版本、代理或转发部署都验收。
- 中文输入法/粘贴、独立QA、低配硬件、睡眠与长离线、旧二进制降级、业务看板和实际账单收益须另有证据。
- 没有随机灰度或AB基建。线上启用前需确认范围、负责人、性能和迟到门槛，冻结D0前7天基线；本PR不授权合并上线。
