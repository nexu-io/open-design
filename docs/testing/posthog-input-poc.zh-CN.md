# PostHog 设置与搜索输入统计：本地 PoC 验收

此改动交付本地实验能力，不授权发布。原始记录保留，5/10 分钟汇总分别核对；
汇总每小时尝试批量发送，退出和恢复可提前收尾。不能承诺任意时刻强杀零丢失。

- [独立交付文档、测试包、26 条用例和证据](https://powerformer.feishu.cn/docx/Hk1UdgaL6om0qaxH0u4cwhYWnYd)
- [Plane OPEND-4684](https://plane.powerformer.net/open-design/browse/OPEND-4684/)
- [GitHub PoC 交付范围 #9296](https://github.com/nexu-io/open-design/issues/9296)

## 实现边界

| 位置 | 实现 | 边界 |
| --- | --- | --- |
| 公共输入观察器与上报入口 | 保存累计尾段，统一原始记录与汇总补发 | 设置/搜索业务组件不修改，不采集输入文本 |
| 本地队列与汇总 | 同一原始窗口生成 5/10 分钟摘要，按稳定 ID 重试、确认后移除 | 两套汇总分别核对，不相加；允许网络重传 |
| Desktop / Host | 异步 IPC 到 SQLite 工作线程，提前开队列并预热校验 | COMMIT 才算已保存；输入不等待磁盘 |
| mac 打包 | 单独物化工作线程，构建缓存区分 QA 编译标志 | 私有测试包，不修改正式发布配置 |

原生持久化仅在 `OD_INPUT_NATIVE_POC=1`、
`NEXT_PUBLIC_OD_INPUT_AGGREGATION_POC=1`、
`POSTHOG_KEY=phc_local_poc_only` 和 HTTP `127.0.0.1` 目标下启用。
安装版另外要求 `OD_INPUT_QA_BUNDLE=local-only`，Web 构建需要
`NEXT_PUBLIC_OD_INPUT_QA_BUNDLE=local-only`。普通发布及真实目标不启用本 PoC。
`OD_INPUT_PREWARM_POC=0` 供同机关闭预热作对照。

这是现有公共层中的内部模块，不是新增对外 SDK。夹具源文件在测试包 `src/` 中，
使用已有 sidecar 生命周期原语和项目共享 `browser-lock.sh`；不把临时打包脚本、
App、第三方 node_modules、测试配置或原始运行日志提交进产品仓库。
数据隔离遵循[根 AGENTS 的 Daemon data directory contract](../../AGENTS.md#daemon-data-directory-contract)，
由夹具传入独立配置；不要使用日常客户端配置测试或切换存储后端。

## 测试同学怎样运行

下载交付文档内 `PostHog-QA-Mac-arm64-20261104.zip`，完整解压到可写目录。
仅支持 macOS Apple Silicon，运行不需要代码仓库、系统 Node、Python 或另装浏览器。
先读包内 `先读我.md`。

1. 双击 `安装测试包.command`，安装到当前用户的 Applications；同名包会拒绝覆盖。
2. 双击 `开始自测.command`，约一分钟，预期设置 23 + 搜索 33，原始/5分/10分各 56。
3. 按下面入口和包内 26 条用例继续执行，用空表独立填结果。
4. 回收当轮完整 `runs` 目录；失败后另建新一轮，不覆盖失败证据、不清队列凑通过。

| 入口 | 内容 | 判定 |
| --- | --- | --- |
| 开始自测.command | 正常重启、模拟断网恢复、稳定 ID 核对 | quick-result.json 的 PASS 只覆盖这些场景 |
| 强杀和重试验证.command | 预热关闭/开启各 19 场景，共 38；含确认丢失、尾段、渲染崩溃 | 缺失报告 FAIL_COMPLETENESS，不能用其他 PASS 抵消 |
| 写锁边界验证.command | 阻塞 SQLite 写入时看输入返回；未提交就强杀 | 当前 FAIL_KNOWN_GAP 是已知缺口，不是预期通过 |
| 性能对照.command | 关闭/开启预热交错各 3 轮，记录输入、CPU、内存和磁盘 | 只输出量测，性能门槛需另行确认 |
| 启动手工测试.command | 中文输入法、真实小时定时及人工边界 | REQUIRES_REVIEW；回车收尾；最长 85 分钟 |

真实一小时用例 QA-04：运行 70 分钟，第 1、6 分钟分别设置 20/搜索 20，之后不输入。
发送期限前不要退出、回车、手动 flush 或调整系统时钟。原始记录及时发送，5/10 分钟
两套汇总在小时期限发送且各累计 80。回车本身会收尾发送，必须看回车前的请求时间线。
快速自测不替代本用例。

App 为 ad-hoc 本地签名、未 Apple 公证，首次系统允许步骤见交付文档；
受公司设备策略限制时记 BLOCKED，不关闭全局系统防护。自动测试隐藏窗口避免抢焦点，
手工入口显示窗口。共享浏览器锁排队时等待，不删锁，不按进程名称批量强杀日常客户端。

## 研发确定性检查

使用项目要求的 Node 24、pnpm 和已安装的依赖。只跑定向测试，不跑全量 Web/Daemon 套件。

```bash
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/web exec vitest run -c vitest.config.ts --maxWorkers=2 tests/analytics/input-aggregation.test.ts tests/analytics/input-aggregation-hourly.test.ts tests/analytics/input-aggregation-transport.test.ts tests/analytics/input-native-store.test.ts tests/analytics/error-tracking.test.ts tests/observability/chat-interaction.test.ts
pnpm --filter @open-design/desktop exec vitest run -c vitest.config.ts tests/main/input-native-store.test.ts tests/main/input-prewarm.test.ts tests/main/preload-host-boundary.test.ts tests/main/invite-deeplink-protocol-registration.test.ts
pnpm --filter @open-design/contracts exec vitest run tests/analytics-client-metrics.test.ts
pnpm --filter @open-design/tools-pack exec vitest run tests/workspace-build.test.ts tests/prebundle/macos.test.ts
pnpm typecheck
pnpm guard
git diff --check
```

验证证据附件中的 `developer-material/self-test.sh` 会执行以上命令，并记录
`commands.tsv`、原始日志、HEAD、源码快照/哈希和 `result.json`。证据目录必须是新的。
最终 PR 的同提交检查和远端 CI 状态见 PR 描述，不能沿用旧 HEAD 的 PASS。

## 已完成的安装包验证及范围

2026-11-04，M5 Pro / 48GiB / macOS 26.5；安装包 `0.25.1-preview.1`。
基线 `5a0c47777975ddb91d09c1c16b423a3ef74bf572` 加 22 文件 PoC 快照，
对应产品实现提交 `cdd55a8794`；PR 另同步主干并增加本文。
旧安装包没有重新打包成同步主干后的整棵 PR，不能视作 PR 完整安装版验收。

| 检查 | 实测 | 范围 |
| --- | --- | --- |
| 安装与便携 | 安装启动、移到中文/空格目录、仅系统 PATH、最终 ZIP 解压后均可跑快速自测 | 同一台机器；另一台独立 QA 未执行 |
| 快速对账 | 设置 23 + 搜索 33，原始/5分/10分分别 56 | 包含正常重启、模拟断网恢复 |
| 故障 | 38 个定向场景，含准备输入共 80 次，恢复 80 | 两组首键均 6/6，不是任意强杀零丢失证明 |
| 写锁响应 | 输入约 13.4ms 返回后仍持锁 200ms，释放后能补齐 | 输入调用往返时间，不是屏幕真实呈现延迟 |
| 未提交强杀 | 1 次输入恢复 0 次 | FAIL_KNOWN_GAP，完整性要求未满足 |
| 性能 | 6 轮 3180 次对齐，3120 次进入量测；CPU 校准比值约 1.003 | 未判性能达标；一轮空闲辅助进程退出，不能当完整空闲统计 |
| 原包工程检查 | 136 项定向测试，8 组检查通过 | 不替代手工和正式链路验收 |

原包 SHA256：`e05b78e6f8b1c565c3c144c57800faabb1bf3fca51919c04a7e663db9760c6c8`。
数字对账见各轮 `reconciliation.json`，总览见 `comparison.json`，故障收据与 SQLite
均保留在证据附件内。重复网络收据必须按稳定 ID 去重，再累加次数并核对最大值；
还要与独立可信输入见证核对，不能仅凭原始和汇总相等判断没丢。

## 不满足准出的项目

- SQLite 提交前强杀仍丢；异步保存无法靠提前初始化保证任意时刻完整。
- 旧 IndexedDB 待发记录迁移/回退未实现，不使用旧日常配置切换后端或停止原始记录。
- 正常退出出现 `stopped/storage_error`，本轮恢复对账无缺失，原因仍待定位。
- 当前包真实一小时、中文输入法、低配硬件、睡眠及长离线等独立验收待执行。
- 正式转发、PostHog 入库和去重、看板迁移、真实费用收益未验证。
- 性能采样包含实际桌面 PID 的子孙服务，不与旧开发版进程树口径直接比较。

研发修复后用新版本、新目录复验失败场景及关键恢复、数字守恒和性能。
QA 回收设备/版本、用例号、期望/实际次数、收据、日志、数据库和缺陷号。
任何必测 FAIL、BLOCKED 或未确认的性能门槛，都不能改写成上线通过。
