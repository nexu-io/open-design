# 分享评论后续修复验证

基线：Open Design `c097c5b2579661974f2f022067d8e5bd524ea504`（PR #9027）。当前 #9025 相对已包含源码仅增加计划文档。Vela 定位探针使用 `173a8d14b34ad75673454c616146ad81bab220d4` 的公开评论投影和分享定位 runtime。

| 问题 | 根因与修复 | 回归证据 |
| --- | --- | --- |
| OPEND-4083 | 云端 admission 等待前读取的本地身份过期；收到结果后在 adoption 事务内重新读取并恢复评论身份和 outbox | `apps/daemon/tests/local-comment-files.test.ts`：等待前/期间新增、重试、已采用身份补偿、owner/workspace/文件生命周期变化拒绝 |
| OPEND-4046 | 对齐请求导出整个项目；复用个人项目分享文件范围，并在序列化和 pinned CLI 准备后复核范围 | `apps/daemon/tests/comment-alignment.test.ts`：未分享/停止分享过滤、恢复分享、身份替换、无关附件、发送前竞态；现有 HTTP/CLI 同路由验证 |
| OPEND-3887 | srcdoc 自动生成的 data-od-id 不在发布原文中；识别 runtime ID 并保存已有 DOM selector fallback，保留 authored/comment ID | `apps/web/tests/runtime/srcdoc-comment-location.test.ts` 与 `e2e/ui/comment-anchor-publication.test.ts`：真实客户端点击、保存、daemon 持久化、原文 selector 匹配 |

## 实际执行

- 仅恢复基线生产源码，保留新回归测试：daemon 两文件 8 failed / 30 passed；web srcdoc 文件 1 failed / 4 passed。恢复候选源码后 daemon 三文件 44 passed，web 四文件 43 passed。
- `pnpm guard` 与 `pnpm typecheck` 通过。
- 浏览器测试以受控 workspace discovery 运行，评论保存和 daemon 持久化走真实本地接口。未使用真实跨账户云端同步，未作生产验收。
- 跨端 runtime 探针执行 12 项：10 项允许定位且找到目标/产生单一高亮；2 项跨版本结构路径被现有版本策略禁止，未发送定位命令且无高亮。原始结果见 [contract-results.json](./contract-results.json)。该探针验证实际映射和 runtime，但不是完整 ShareApp 登录与云端同步 E2E。

## 截图

[客户端保存后的评论标记](./3887-client-saved.png)、[srcdoc 来源的分享 runtime 定位](./share-located-srcdoc.png)、[URL bridge 来源的分享 runtime 定位](./share-located-url-bridge.png)。后两张是受控原始 HTML 上的实际分享 runtime，不是生产分享页。

4083/4046 是后台身份和请求范围修复，无新增 UI；其并发/出站范围证据是上述真实 SQLite 和受控 transport 回归断言，截图不能证明这两个后台结果。

保留 workspace 原有图片评论能力；本期不新增分享协作图片评论。3911、3862、4105 不在此补丁范围。未合并、未部署。
