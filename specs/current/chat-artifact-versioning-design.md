# Chat 会话产物版本语义设计

状态：设计审计稿，待评审；不代表已经实现。  
更新时间：2026-09-01。  
产品裁决来源：会话栏参考 Manus 的产物版本语义。

## 1. 结论摘要

推荐把“工作区当前文件”和“某条 Chat 消息当时看到的结果”拆成两个不同的身份：

- `workspace artifact` 是可变的 latest 指针。它回答“Design Files 里现在是什么”，允许覆盖、重命名和恢复版本。
- `chat artifact snapshot` 是不可变的消息证据。它回答“这一轮当时产出了什么”，一旦消息落库便不跟随工作区文件变化。

两类产物采用不同打开规则：

| 产物类型 | 会话卡封面 | 点击后右侧预览 | 后续同名覆盖的影响 |
| --- | --- | --- | --- |
| HTML / prototype / slide / document | 该轮生成的静态“假预览图”；截取首屏 viewport，不渲染活动 iframe | 打开 `workspaceArtifactId` 当前指向的 latest 文件 | 卡面不变；右侧看到 latest |
| image | 该轮图片的 immutable snapshot 真图 | 打开该 snapshot，而不是工作区同名文件 | 历史卡与右侧历史预览均不变；Design Files 仍展示 latest |

当前实现不满足图片历史语义。`ProjectFile` 只保存路径、大小、mtime、kind/mime，没有内容 digest、version id 或 snapshot id（`packages/contracts/src/api/files.ts:32-45`）；`ChatMessage.producedFiles` 直接持久化这份可变路径元数据（`packages/contracts/src/api/chat.ts:1006-1112`），卡片又用项目当前文件 URL 渲染和打开（`apps/web/src/components/FileOpsSummary.tsx:497-570`）。因此同名图片被覆盖后，历史卡会读到新字节。

HTML 已有“只保存 HTML 文本”的版本系统，但它没有绑定到普通 Chat 消息，也没有版本化本地依赖图，不能直接当作会话快照系统。现有版本内容文件固定为 `.html`（`apps/daemon/src/project-file-versions.ts:188-193, 491-560`），运行结束只对 touched HTML 建版本（`apps/daemon/src/run-html-version-snapshots.ts:82-132`），而 `ChatMessage` 没有对应 version id 字段。

## 2. 当前实现审计

### 2.1 Web 卡片实际上只拿到路径

`FileOpsSummary` 把 `FileOpEntry` 投影成：

```ts
interface ArtifactCardItem {
  name: string;
  kind: 'html' | 'image' | 'video' | 'doc';
  pending?: boolean;
}
```

证据是 `apps/web/src/components/FileOpsSummary.tsx:127-175, 399-410`。这里没有 `mtime`、digest、run/task id、HTML version id 或 snapshot id。随后：

- HTML 卡把 `projectFileUrl(projectId, item.name)` 塞进活动 iframe（`FileOpsSummary.tsx:497-537`）。这不是静态假预览，动画与脚本仍可能运行。
- 图片卡把同一个当前文件 URL 塞进 `<img>`（`FileOpsSummary.tsx:545-559`）。
- 点击卡片只回传 `item.name`（`FileOpsSummary.tsx:565-572`），因此右侧也只能按当前路径打开。
- `projectFileUrl` 本身只是当前项目 raw URL，没有历史版本参数（`apps/web/src/providers/registry.ts:2498-2503`）。

`HtmlProjectCoverFrame` 同样是活动 iframe：验证 URL 后直接 `<iframe src={src} sandbox="allow-scripts">`（`apps/web/src/components/project-cover.tsx:98-183`）。它适合 latest 项目封面，不适合充当某轮不可变预览。

### 2.2 producedFiles 是终态文件目录快照，不是内容快照

`computeProducedFiles` 以本轮前文件名集合、daemon touched paths 和本轮结束后的 `ProjectFile[]` 合并出结果（`apps/web/src/components/ProjectView.tsx:13519-13551`）。它返回的是结束时工作目录中的元数据对象。

daemon 的 artifact diff 能识别创建/修改：小文件用 hash，大文件只用 size + mtime 控制成本（`apps/daemon/src/run-artifact-fs.ts:58-83, 259-301, 308-370`）。但是这些 fingerprint 只用于判断 touched paths，并没有作为持久化内容身份写进 `producedFiles`。

`messages` 表只有 `produced_files_json`，没有 message-artifact ref 或 snapshot 表（`apps/daemon/src/db.ts:219-243`）。读写路径原样 JSON stringify/parse（`apps/daemon/src/db.ts:2872-2915, 2933-2972, 4346-4373`）。所以 mtime 被记录了，内容版本没有被记录。

当前可回答的数据模型问题如下：

| 字段 | 当前是否有 | 位置 / 限制 |
| --- | --- | --- |
| project-relative path | 有 | `ProjectFile.name/path/localPath` |
| size / mtime | 有 | `ProjectFile.size/mtime` |
| run id | 消息有 | `ChatMessage.runId`，不是逐产物绑定 |
| media task id | 进度任务有 | `ProjectMediaTask.taskId/runId`（`packages/contracts/src/api/media.ts:41-55`），完成后未绑定到 `producedFiles` |
| content digest | HTML version 可选有 | `ProjectFileVersion.contentDigest`；普通 `ProjectFile` / Chat ref 无 |
| immutable content/blob | HTML 文本版本有 | 仅 HTML；图片/视频/文档没有通用 store |
| HTML version id | run 的外部插件观测可能有 | 只落在 run/analytics 流程，普通 `ChatMessage` 不持有 |
| immutable thumbnail | 无 | HTML 卡运行 live iframe；图片卡读 current raw URL |

### 2.3 图片生成/编辑/覆盖链会覆盖原文件

`od media generate` 接受显式 `output`，清洗后直接选为目标相对路径（`apps/daemon/src/media/index.ts:348-357, 488-493`）。生成完成后执行 `writeFile(finalTarget, bytes)`（`apps/daemon/src/media/index.ts:841-867`）。同名文件存在时会被覆盖，没有自动版本副本、历史 blob 或 snapshot ref。

自动文件名带时间戳，通常避免碰撞（`apps/daemon/src/media/index.ts:870-875`），但用户或 agent 明确要求“覆盖当前图”时会走同名 `output`，正好触发历史卡漂移。

BYOK 工具里有些图片路径用随机 id，能偶然保持不可变；这只是命名行为，不是会话版本契约，也不能覆盖 CLI media、agent shell 写文件和编辑同名图片等入口。

Design Files / Library 的同步也按项目当前目录枚举文件。它用历史消息的 `producedFiles.path` 判断“是不是 agent 生成”，但实际注册的是当前 `absPath`（`apps/daemon/src/library-sync.ts:227-300`）。因此它不是 Chat 历史快照来源。

### 2.4 现有 HTML 版本系统可以复用元数据思路，不能直接复用为通用 blob store

现有 `.file-versions` 机制具备：

- 每个 HTML path 的 manifest、version id、createdAt、digest、parent/origin（`apps/daemon/src/project-file-versions.ts:26-59, 397-416`）。
- 内容写入后再更新 manifest（`project-file-versions.ts:491-560`）。
- delete/rename 的 HTML 专用历史处理（`project-file-versions.ts:563-662`）。
- 成功 run 对 touched HTML 自动建版本（`apps/daemon/src/run-html-version-snapshots.ts:82-132`；接入点 `apps/daemon/src/server.ts:11215-11259`）。

但它的边界是：

- 只接受 HTML，路由也明确拒绝其他类型（`apps/daemon/src/routes/project/index.ts:7007-7020, 7083-7105`）。
- 内容路径规范固定为 `.html`（`project-file-versions.ts:188-193, 522-555`），不适合二进制 media。
- `StandaloneHtmlExportRequest` 已明确写着“依赖图版本化之前，不支持历史 snapshot”（`packages/contracts/src/api/export.ts:41-49`）。旧 HTML 版本只存入口文本，CSS/JS/图片仍可能变。
- 普通 Chat 消息未保存 `ProjectFileVersion.id`，不能可靠判断某条消息对应哪个 HTML 版本。

结论：复用其 version identity、digest、atomic manifest、rename/delete 测试经验；不要扩展现有 HTML-only 文件夹去硬塞所有二进制。

## 3. 推荐双轨数据模型

### 3.1 Workspace latest 身份

新增稳定的 `workspace_artifacts`：

| 字段 | 说明 |
| --- | --- |
| `id` | project-scoped UUID，稳定身份 |
| `project_id` | 所属项目 |
| `current_path` | 当前 Design Files 路径，可变 |
| `kind` / `mime` | 当前类型 |
| `current_digest` / `current_size` / `current_mtime` | latest 内容身份 |
| `created_at` / `updated_at` / `deleted_at` | 生命周期 |

路径不是身份。HTML 卡点击 latest 时传 `workspaceArtifactId`，daemon 解析其 `current_path`。覆盖只更新 digest/mtime；rename 只更新 `current_path`；删除后保留 tombstone，右侧给“当前文件已删除”，不能偷偷打开同名新文件。

现有 artifact manifest 的 `metadata.identifier` 可以辅助首次绑定，但不能作为唯一主键：不是每个文件都有 manifest，agent 也可能重复/改写 identifier。

### 3.2 Immutable Chat snapshot 身份

新增三张规范化表，避免继续扩充不可查询的 `produced_files_json`：

#### `chat_artifact_blobs`

| 字段 | 说明 |
| --- | --- |
| `digest` | `sha256:<hex>`，主键；内容地址 |
| `storage_key` | daemon 内部相对 key，绝不返回绝对路径 |
| `byte_size` / `mime` | 校验和响应头 |
| `created_at` / `last_verified_at` | 运维字段 |

blob 文件必须从 `RUNTIME_DATA_DIR` 派生的专用 snapshot 根目录解析；文档不引入第二套 daemon data root。建议 project-scoped 授权、全局内容去重；如团队共享安全边界难以证明，首版可 project-scoped digest 去重。

#### `chat_artifact_snapshots`

| 字段 | 说明 |
| --- | --- |
| `id` | UUID，外部引用身份 |
| `project_id` | 授权边界 |
| `workspace_artifact_id` | 可选；关联 latest 身份 |
| `source_path_at_capture` | 历史显示/诊断，不参与读取 current |
| `kind` / `mime` | 捕获时类型 |
| `content_digest` | ~~image/video/audio/doc~~ image/sketch 原字节 blob（视频/音频 2026-09-02 起不存，见 §15.5） |
| `thumbnail_digest` | HTML/doc 静态假预览 PNG；**视频的当轮首帧 JPEG（§15.5.1）**；图片可等于内容或另存缩略图 |
| `source_size` / `source_mtime` | 捕获证据，不作为内容身份 |
| `run_id` / `media_task_id` | 精确 lineage，均可空以兼容普通文件写入 |
| `capture_state` | `pending / ready / failed / orphaned`（`orphaned` 是 GC 内部分类，不上线；上线的 wire 状态见下面 DTO 的 `snapshotState`） |
| `failure_code` | renderer unavailable、source changed、timeout 等 |
| `created_at` / `ready_at` | 生命周期 |

#### `message_artifacts`

| 字段 | 说明 |
| --- | --- |
| `message_id` / `ordinal` | 复合主键，FK 到消息并 cascade |
| `snapshot_id` | immutable Chat 内容/封面 |
| `workspace_artifact_id` | latest 打开目标 |
| `display_policy` | `latest_with_static_preview` 或 `immutable_snapshot` |
| `open_policy` | `workspace_latest` 或 `snapshot` |
| `label_at_capture` | 历史文件名 |
| `html_version_id` | 可选 lineage；不能替代 dependency-complete snapshot。**2026-09-02 起已启用**：`snapshotAiHtmlVersionsBeforeSuccess` 在版本落库后回填到本轮 refs 上 —— refs 写在前、版本写在后，所以是回填而不是同步写入 |

`ChatMessage` 对外增加 `artifactRefs?: ChatArtifactRef[]`。`producedFiles` 保留兼容和 transcript 归属，不再驱动新卡的 URL 语义。

建议 ref DTO：

```ts
interface ChatArtifactRef {
  id: string;                 // message_artifact stable id
  label: string;
  kind: ProjectFileKind;
  displayPolicy: 'latest_with_static_preview' | 'immutable_snapshot';
  // ~~openPolicy: 'workspace_latest' | 'snapshot';~~
  // 已作废（用户裁决 2026-09-02，见 §9.4）：点击一律打开工作区最新文件，
  // 点击目标就是下面的 workspaceArtifactId，没有第二种取值。字段整个删掉，
  // 不是收敛成单值 —— 理由同 §9.4。
  workspaceArtifactId?: string;
  snapshotId?: string;
  thumbnailUrl?: string;
  snapshotUrl?: string;
  snapshotState: 'pending' | 'ready' | 'failed' | 'legacy_unavailable';
}
```

URL 由 daemon response 生成或由 Web 用 id 构造；数据库绝不存带 authority query 的临时 URL。

## 4. 各类型的准确行为

### 4.1 HTML / prototype / slide / document

消息完成时创建静态 thumbnail snapshot。卡面只渲染 `<img>`，不再挂该 HTML 的 iframe。这样能避免历史消息里的 JS/动画持续运行，也能降低长会话的 iframe、网络连接和 compositor 压力。

点击流程：

1. Web 发送 `workspaceArtifactId` 给预览区。
2. daemon 解析 latest `current_path` 并返回当前文件元数据。
3. FileViewer 按现有 latest 路径打开；如果被重命名仍能找到，如果被删除则显示明确 unavailable。

静态卡面不随 latest 更新。即使点击后右侧展示 v8，历史消息卡仍是该轮 v3 捕获的首屏。

“文档”若是不可直接浏览的二进制格式，首版可使用类型化假封面（图标、标题、页数/格式），后续接文档 renderer。不得拿 current 文件的后续预览冒充历史 thumbnail。

### 4.2 图片

> ~~消息完成时把图片原字节安装进 content-addressed blob，并让
> `message_artifacts.open_policy='snapshot'`。卡面和右侧预览都读取 snapshot endpoint。~~
>
> **`open_policy='snapshot'` 与「点击开快照」已作废（用户裁决 2026-09-02，见 §9.4）：
> 「html 和图片都是，产物缩略是快照，但跳过去产物永远指向最新的」。**

消息完成时把图片原字节安装进 content-addressed blob。**卡面**读 snapshot endpoint；
**点击**和 HTML 一样，打开工作区最新文件。

工作区中仍保留/覆盖同名图片，Design Files 始终展示 latest。

如果生成第二张图覆盖 `hero.png`：

- 消息 A 的**卡面** -> snapshot A digest，永远是 A。
- `workspace_artifacts.current_digest` 更新为 B。
- 消息 B 的**卡面** -> snapshot B digest。
- 两条消息**点开都是** Design Files 里当前的 `hero.png`（即 B）。

> lineage 描述订正（2026-09-02，实现比原文更紧）：原文写「两者只通过
> `workspaceArtifactId` 建 lineage」，读起来像事后配对。实际实现里图片走
> `capturesContent` 分支，ref 上的 `workspaceArtifactId` 取的就是那次 capture 顺带
> `ensureWorkspaceArtifactForPath` 出来的同一个 id —— 和 snapshot 同源，不存在配错的
> 可能。见 `apps/daemon/src/chat-artifacts/run-capture.ts`。

## 5. Snapshot 创建与崩溃恢复

### 5.1 捕获时机

推荐两层捕获，统一落到同一个 store：

1. **强路径：media 成功写边界。** `generateMedia` 仍在持有 provider 返回的 `bytes`，在覆盖 workspace 文件前后都能用同一份 bytes 建 snapshot。这里最能保证 task -> exact bytes，不需要重新读取可能已变化的路径。当前直接写文件的位置是 `apps/daemon/src/media/index.ts:841-867`。
2. **通用路径：run terminal chokepoint。** 对 shell/Write/Edit 等其他写入，用 daemon 已有 touched paths，在 terminal SSE 前捕获。当前 HTML version snapshot 正挂在这个阶段（`apps/daemon/src/server.ts:11215-11269`），可复用时序，但必须复制二进制而不是只记路径。

任何 snapshot 都必须在消息可被标记“产物 ready”之前拿到 exact bytes。Web 客户端刷新目录后再请求 snapshot 太晚，会与下一轮覆盖竞态。

### 5.2 两阶段提交

文件系统和 SQLite 不能做同一原子事务，采用 intent + atomic install：

1. SQLite 写 `chat_artifact_snapshots(capture_state='pending', expected_size/mtime/fingerprint)` 和 message ref intent。
2. 从 provider bytes 或 verified source 读内容，流式计算 SHA-256，写专用根目录下的临时文件。
3. 校验 byte count/digest；以 digest 为 key 原子 rename 安装。已存在同 digest 时丢弃 temp。
4. SQLite 事务把 snapshot 置 `ready`、写 blob 行和 `message_artifacts` ref。
5. 终端事件可以携带 ref；Web 后续也可读消息投影。

不要使用 `ref_count += 1` 作为唯一真相。真实引用由 `message_artifacts` 和 thumbnail/source snapshot 外键可重算；缓存 ref_count 仅作加速。

### 5.3 中断恢复

启动与定时 reconciler 处理：

- `pending` 且 temp 完整：校验 digest 后完成提交。
- `pending` 且只有 source path：仅当 current size/mtime/digest 与 expected 完全一致才补捕获；否则置 `failed/source_changed`，绝不能复制新版本冒充旧版本。
- 无数据库 intent 的旧 temp：超过安全窗口删除。
- 有 blob 行但文件缺失/校验失败：置相关 snapshot `failed/blob_missing`，记录 telemetry，卡片诚实降级。
- 有 blob 文件但无任何 DB 行：标 orphan，经过 grace period 后回收，避免刚提交与扫描并发。

> **落地补充（2026-09-02）。** 「启动与定时」原先只落地了「启动」那一半：reconcile
> 和 §7.2 的 mark-sweep 都只在 `startServer` 里跑一次，长跑 daemon 从此不再跑第二次。
> 现已抽出 `apps/daemon/src/chat-artifacts/maintenance.ts`，启动那一遍和定时那一遍
> 走同一个 `runChatArtifactMaintenancePass`（两份实现必然漂移，而漂移只在最少被观察
> 的长跑场景暴露）。
>
> 一遍之内**先 reconcile 后 sweep**，顺序不是装饰：sweep 有意跳过 `pending` 行（字节
> 可能正在安装，只有 reconciler 有权裁决在飞捕获），所以先 sweep 会让一条早该被判死的
> 中断捕获被「pending」这个本该定它罪的状态保护住，白白多活一个周期。
>
> **重入**：跳过，不排队。一遍是幂等的、每次从头重扫，所以丢掉的那一拍不损失任何东西；
> 排队会在慢盘上堆出永远排不完的积压，而两遍并发还会对同一个 grace window 各自下结论，
> 输的那次 delete 被记成 sweep 失败。跳过的拍数记在 `overlappedTicks` 上，不静默吞掉。
>
> **关停**：`stop()` 同步 `clearInterval`（此后不会有新的一遍开始），返回的 promise
> 等在飞的那一遍跑完。这不是客气 —— daemon 关停下一步就是关数据库，在飞的一遍撞上
> `closeDatabase()` 是 SQLite 硬错误，不是「降级一张卡」。定时器另外 `unref()`，
> 保证一个还没到点的 tick 不会成为进程（或测试文件）退不掉的原因。
>
> **周期值仍未拍板。** 本文档 §5.3 和 §7.2 都只说「定时」「周期性」，两处都没有给数。
> 所以默认值是 `0`（关闭，等同今天的只在启动跑一次），唯一的打开方式是显式设置
> `OD_CHAT_ARTIFACT_MAINTENANCE_INTERVAL_MS`。仓库内最近的先例是插件快照 GC 的
> `OD_SNAPSHOT_GC_INTERVAL_MS`（默认 6 小时，同一形状的活、同一形状的存储），
> 列在这里作为起点而不是答案。

### 5.4 生命周期

- **overwrite：**只更新 workspace latest；任何 snapshot 不变。
- **rename：**更新 `workspace_artifacts.current_path`；历史 `source_path_at_capture` 和 label 不变。HTML 卡仍可通过 id 打开 latest 新路径，图片卡继续打开 snapshot。
- **workspace file delete：**workspace artifact tombstone；HTML 卡 thumbnail 仍在，但点击提示 latest 已删除；图片卡仍能打开 snapshot。
- **message delete：**删除 `message_artifacts` ref；blob 延迟 GC。
- **conversation delete：**现有 conversations -> messages FK cascade（`apps/daemon/src/db.ts:219-243`，删除入口 `apps/daemon/src/routes/project/conversations.ts:280-295`）带走 refs；GC 不放在请求同步热路径。
- **project delete：**先停 run，再删 DB/项目目录是当前行为（`apps/daemon/src/routes/project/index.ts:5246-5301`）。新增 snapshot refs 必须在 DB project cascade 中删除；blob 交给后台 GC。如果采用 project-scoped storage，可异步删除该项目所有 blobs。
- **fork conversation：**seed 的 message_artifact ref 指向同一 immutable snapshot，不复制 blob；新旧 message refs 独立计数。
- **team sync：**首版若 snapshot 没有进入共享资源协议，远端成员必须显示 `snapshot unavailable on this device`，不能 fallback 到 owner 的 latest。正式发布前需要明确是否把 blobs 纳入 Vela/team resource，现有 HTML `.file-versions` 被排除于 member mirror 的先例见 `apps/daemon/src/routes/project/index.ts:7035-7043`。

## 6. HTML 首屏局部截图方案

### 6.1 哪些现有能力可复用

可以复用 renderer 基础设施，但不应直接调用现有“导出 PNG”行为：

- daemon 的 programmatic visual export 已把 HTML/`baseHref` 交给 desktop Electron renderer（`apps/daemon/src/import-export-routes.ts:876-958`）。
- desktop exporter 使用隐藏 `BrowserWindow`、等待资源、`capturePage`、输出 PNG/JPEG（`apps/desktop/src/main/artifact-export.ts:14-49, 66-99`）。
- `waitForPrintableContent` 有 fonts、`<img>`、CSS background 等待与 10s/15s 双重超时（`apps/desktop/src/main/pdf-export.ts:320-458`）。
- deck/page capture 已有停止 animation/transition 和 scroll reveal 预热（`apps/desktop/src/main/deck-capture.ts:1530-1558, 1639-1667`）。

但现有非 deck image export 会把窗口增长到整个 document 高度，最大 20,000 px，然后截全页（`apps/desktop/src/main/artifact-export.ts:21-28, 66-88`）。这正是用户说的长图，不能作为会话卡首屏实现。

### 6.2 建议拆出的 renderer primitive

在 sidecar proto 增加明确用途而不是偷用 `deck=false`：

```ts
type DesktopArtifactCaptureMode = 'full_page_export' | 'first_viewport_thumbnail';
```

`first_viewport_thumbnail`：

- 固定逻辑 viewport，例如 1440x900；响应式行为因此可重复。
- 不测量/增长到 `scrollHeight`，不做长图 stitch。
- `window.scrollTo(0, 0)` 后只 `capturePage({x:0,y:0,width,height})`。
- 注入统一 static-capture CSS：animation/transition duration 0、smooth scroll off、caret hidden；调用 Web Animations API 对仍在跑的 animation `finish()`，失败则 `pause()`。
- 发送 `prefers-reduced-motion: reduce` 或等价 emulation，避免 JS 动画只看 media query。
- 只等待首屏资源；不应该为首屏 thumbnail 预热滚完整页，否则长页仍然慢。fonts/images 总预算建议 5s，render 总预算建议 8s，最多 2 次透明/空白重试。
- 截图后 daemon 生成适合卡面的缩略尺寸（保持比例、cover/contain 由 UI 规范决定），原始首屏 PNG是否保留由 quota 决定。

建议从 `deck-capture.ts` 抽出无滚动的 `freezeAnimationsAndTransitions`，不要把 `preparePageForCapture` 整体复用，因为后者会逐屏滚到底（`deck-capture.ts:1658-1663`），会让 snapshot 成本与页面长度相关。

### 6.3 冻结输入，不把异步 renderer 变成版本竞态

单纯排一个“稍后对 current URL 截图”的 job 是错误方案：job 开始前文件可能已覆盖。

推荐在 run terminal 阶段先冻结 renderer input：

- 首选把入口 HTML 与可解析的本地依赖打成临时 immutable capture package；现有 standalone bundler 可复用依赖解析思路。
- 无法形成 dependency-complete package 时，可在 source fingerprint 仍等于 terminal fingerprint 时立即 render；超时/desktop 不可用则失败降级。
- 禁止 renderer 在稍后发现 source changed 时转而读取 latest。

HTML version store 可以提供入口 HTML 文本，但不能保证依赖，合同也明确承认这一限制（`packages/contracts/src/api/export.ts:47-48`）。因此 `html_version_id` 只能做 lineage，不是完整 screenshot source。

**落地方式（2026-09-02，`apps/daemon/src/chat-artifacts/cover.ts`）：**

capture package 就是**一份自包含的 HTML 字符串**，在 terminal chokepoint 同步产出：

1. 入口 HTML 和它引用到的每一个本地依赖，在同一个窗口内读完，逐个记 size+mtime 指纹。
2. 用现有 standalone bundler（`artifacts/standalone-html.ts`）把整张图内联成一份文档。
   本地依赖闭不上（missing-local-dependency / 超限）就**不出封面**，不降级。
3. 窗口末尾把所有指纹**再核一遍**，任何一处漂了就作废 —— 否则拼出来的是一份跨两个
   版本的缝合文档，那比没有封面更糟。
4. 交给 renderer 时**不带 `baseHref`**。文档从 `data:` URL 加载，于是即便渲染发生在
   几分钟之后，renderer 也**没有任何地址**能指回工作区。它不是「不许读 latest」，
   而是根本无从读起。

第 4 步是异步渲染能成立的原因，前 3 步是第 4 步诚实的原因。只有 freeze 是 await 的；
render 故意不 await（一轮对话不该为了一张缩略图多等几秒）。

原文的次选方案「无法形成 dependency-complete package 时立即 render」**没有实现**：
它需要把 daemon 的 live raw endpoint 交回给 renderer，而那条路只对入口做了指纹，
依赖仍然可以在渲染期间被改掉 —— 拿到的保证比看上去弱，所以宁可不出封面。

### 6.4 失败降级

> ~~降级顺序必须诚实：~~
> ~~1. ready static thumbnail。~~
> ~~2. 类型化 generic fake cover（HTML/prototype/slide/doc 图标 + 文件名 + 格式），状态记 `failed`。~~
> ~~3. 不允许改回 live current iframe；那会让历史卡随 latest 漂移，也会重新引入动画与长会话性能成本。~~
>
> **已作废（产品 2026-09-02）。** 原依据是「历史卡不该随 latest 漂移」；推翻它的是
> 产品原话：「不允许退回不就一个错误文案显示在上面了？这感觉更奇怪呢」。

**现行裁决：**

1. ready static thumbnail。
2. 拿不到就**静默回落 live iframe 显示最新**，不出占位、不出任何失败文案。
3. 状态仍然照实记（`failed` / `legacy_unavailable`），但那是给遥测和诊断看的，**不上卡面**。

这条和同日那条点击裁决（§9.4）是一致的：点击本来就一律打开工作区最新文件，所以
卡面回落到 live 之后，卡面和点击指向同一份东西，不会出现「卡面说一套、点开是
另一套」。

实现见 `apps/daemon/src/chat-artifacts/cover.ts`（daemon 侧不产出占位）与
`apps/web/src/components/FileOpsSummary.tsx`（卡面降级支）。

## 7. 存储预算与 GC

### 7.1 Quota

建议配置三层预算，默认值需产品/平台压测后拍板：

- 单 snapshot 上限：图片/文档原件按现有上传和 media 上限对齐；thumbnail 单独设置较小上限。
- 单项目 snapshot 总量上限。
- 全 daemon data root 总量上限。

达到 soft quota：先清未引用 orphan、失败 temp、可重建 thumbnail；不可删除仍被消息引用的 image 原图，否则产品语义失效。达到 hard quota：该轮 snapshot 标 `failed/quota_exceeded`，消息仍完成但明确展示“历史预览未保存”；同时 telemetry 告警。

### 7.2 Mark-sweep

推荐周期性 mark-sweep，而不是把删除变成同步递减计数：

1. mark 所有 `ready` snapshot 的 `content_digest/thumbnail_digest`，加上仍在 grace period 的 pending intent。
2. sweep 未 mark 且早于 grace period 的 blob。
3. 独立清理过期 temp、长期 pending、已失败且无 ref 的 rows。
4. 每次 sweep 有扫描数、回收 bytes、失败数 telemetry；任务可分批、可续跑。

项目删除/会话删除只删除 refs 并 enqueue GC，不在 UI 请求里遍历大目录。

> **落地补充（2026-09-02）。** 「周期性」这一条见 §5.3 的落地补充：sweep 和 reconcile
> 现在同属一个 maintenance pass，周期值同一个未拍板的开关，`OD_CHAT_ARTIFACT_GC=1`
> 仍是「真删」与「只报告」的开关（默认只报告）。

## 8. 旧会话兼容矩阵

核心原则：无法证明的历史不补造。

> 下表原文**已作废（2026-09-02）**，三处：
>
> - **卡面**一列的 generic fake cover / 占位 / 「历史图片不可用」文案 —— 产品原话
>   「不允许退回不就一个错误文案显示在上面了？这感觉更奇怪呢」（见 §6.4）。
> - **点击**一列对 image 写的 read-only current / 不提供打开 —— 用户原话「html 和
>   图片都是，产物缩略是快照，但跳过去产物永远指向最新的」（见 §9.4）；同一列的
>   「按新 openPolicy」也随该字段一起作废。
> - **`legacy_current_match` 这个状态从未实现，也不会实现。** 落地的 wire 状态是
>   `pending / ready / failed / legacy_unavailable`（`packages/contracts` 的
>   `CHAT_ARTIFACT_SNAPSHOT_STATES`），Web 端**只信 `ready`**，其余三态一律走降级支
>   —— 也就不需要一个「未检测到变化」的中间态。

现行兼容矩阵：

| 旧数据 | 卡面 | 点击 | 说明 |
| --- | --- | --- | --- |
| HTML，只有 path | live iframe 显示最新（静默降级） | 打开 workspace latest | 状态 `legacy_unavailable`；不出占位、不写文案 |
| HTML，能找到 version id 但依赖未版本化 | 同上 | 打开 workspace latest | version source 不足以重建视觉快照 |
| image，没有 snapshot | 显示 current 同名文件 | 打开 workspace latest | 这是「未检测到变化」，不是 cryptographic 历史保证；UI/telemetry 不得称 immutable snapshot |
| image，原路径已删除 | 不出卡（已删除的文件在成卡之前就筛掉了） | — | 不猜同名/相似文件 |
| 新消息，有 ready snapshot | static thumbnail / exact image | 打开 workspace latest | 完整语义 |
| 新消息，snapshot failed | 走降级支，和上面同形 | 打开 workspace latest | 状态记 `failed`，只上遥测不上卡面 |

不做 mtime -> HTML version 的自动 backfill。mtime 可以碰撞、拷贝可保留时间、普通 UI run 的 HTML versions 又未绑定 message；自动关联会制造并不存在的历史。

## 9. Contracts / HTTP / CLI / Web 三面闭环

### 9.1 Contracts

在 `packages/contracts/src/api/` 新增纯 TS：

- `ChatArtifactRef`、snapshot state/display/open policy。
- `ChatArtifactSnapshotMetadata`。
- list/get response 与 CLI JSON envelope。
- `ChatMessage.artifactRefs?: ChatArtifactRef[]`。

不要把绝对路径、SQLite 类型、Node Buffer 放进 contracts。

### 9.2 Daemon HTTP

建议路由：

- `GET /api/projects/:projectId/conversations/:conversationId/messages/:messageId/artifacts`
- `GET /api/projects/:projectId/chat-artifact-snapshots/:snapshotId/thumbnail`
- `GET /api/projects/:projectId/chat-artifact-snapshots/:snapshotId/content`
- `GET /api/projects/:projectId/workspace-artifacts/:artifactId`

每条 snapshot 路由必须：

- 先校验 snapshot.project_id 与 route project 一致，再走现有 project read authority。
- 不接受调用者传 storage key/path。
- 设置准确 `Content-Type`、`Content-Length`、immutable cache header、ETag=digest、`X-Content-Type-Options: nosniff`。
- 内容只以 image/media/blob 响应；如果未来允许 HTML source snapshot，默认下载，不能在主 app same-origin 下直接执行。
- workspace/team authority 与 `/raw` 一致，不能仅凭不可猜 UUID 绕过授权。

消息 GET 由 daemon join `message_artifacts` 投影 `artifactRefs`，不依赖 Web 二次猜测。

### 9.3 `od` CLI

能力不能 UI-only。建议：

```text
od project artifact-snapshot list --project <id> [--conversation <id>] --json
od project artifact-snapshot inspect <snapshotId> --project <id> --json
od project artifact-snapshot export <snapshotId> --project <id> --out <path> --json
```

CLI 调同一 HTTP API，不直接读内部 storage；导出二进制时支持 `--out`，metadata 输出 `--json`。这是检查、外部 agent 嵌入和故障恢复闭环。

### 9.4 Web

- `AssistantMessage` 优先用 `artifactRefs`；只有缺失时走 legacy `producedFiles` 分支。
- `ArtifactCardItem` 从 `name/kind` 扩成 ref，不再在组件里拼 current URL。
- HTML/doc card `<img src=thumbnailUrl>`；点击 `workspaceArtifactId`。
- image card `<img src=snapshotUrl>`；点击 `workspaceArtifactId`。

> ~~image card 点击打开 snapshot-backed readonly FileViewer tab。~~
> ~~snapshot tab 明确历史身份，可下载，不允许保存回同名 latest，除非用户显式“恢复/另存为”。~~
>
> **已作废（用户裁决 2026-09-02）。** 原话：「html 和图片都是，产物缩略是快照，但
> 跳过去产物永远指向最新的」。
>
> **现行规则：卡面用快照，点击一律打开工作区最新文件，HTML 与图片同规则。**
> 只读快照 tab 不做。
>
> 相应地 `openPolicy` 字段**整个删掉**，而不是收敛成单值 `workspace_latest`：
> 这条链路当时唯一没在线上出问题的原因，是宿主的 `onRequestOpenFile` 只收一个参数、
> 把第二个实参悄悄丢了。留一个恒定值的开关，下一个人看到「参数被丢了」会当成 bug
> 去接上，正好做出被否掉的行为，而且 typecheck 不报、测试不红。点击目标本来就由
> `workspaceArtifactId` 表达，再加一个单值枚举只是把同一件事说第二遍。

- pending thumbnail 不出 placeholder，直接走 §6.4 的降级支；后台 ready 后消息投影更新，不影响滚动锚点尺寸。

## 10. Migration 与 rollout

### 10.1 数据迁移

1. Additive SQLite migration：新增四张表与索引，不改写 `produced_files_json`。
2. daemon dual-write：新 terminal run 写 refs + 继续写 `producedFiles`。
3. Web dual-read：`artifactRefs` 优先，legacy 矩阵兜底。
4. 观察一到两个 beta 周期后，停止新代码从 `producedFiles` 构造新卡；它仍用于 transcript/旧客户端。
5. 不批量回填旧 snapshot。仅可生成 `legacy_unavailable` 投影或后台验证“current metadata 未变”，不能复制 current 伪造过去。

schema migration 必须支持重新运行；blob store 初始化和 DB migration 分开，失败不得让 daemon 无法启动。

### 10.2 Feature flags

建议分别控制：

- `chatArtifactRefsWrite`：daemon dual-write。
- `chatArtifactSnapshotsRead`：Web 新读路径。
- `htmlChatThumbnailCapture`：renderer job。
- `chatSnapshotGc`：先 dry-run telemetry，再启用 sweep。

回滚只关闭 read/write flag，不删除新表和 blobs。旧客户端仍读 `producedFiles`。

### 10.3 Telemetry

至少记录：

- snapshot requested/ready/failed，按 kind/failure code。
- capture duration、source bytes、thumbnail bytes、dedupe hit。
- HTML renderer availability、resource timeout、blank retry。
- legacy fallback 分类和出现率。
- historical image card open 是否命中 snapshot。
- GC marked/swept/orphan bytes、quota exceeded。
- `source_changed_before_capture` 必须单独告警，它表示时序正确性失败。

不得上报文件内容、prompt、绝对路径或 snapshot URL token。

> **落地补充（2026-09-02）。** 首条埋点已落地：`chat_artifact_capture_result`，在 run
> 终点 chokepoint 每轮发一条（该轮没产物就不发 —— 绝大多数轮次没产物，给它们各发一行
> 零值会把这条事件本来要看的失败率淹没成舍入误差）。走的是仓库现成的那条通道
> （`design.analytics.capture`，和 `run_finished` / `media_generation_result` 同一条），
> 事件名与 props 已注册进 `packages/contracts/src/analytics/events/`；那两个文件里的
> catalog parity 断言会让漏注册直接 typecheck 失败。
>
> 字段只有计数和 id：`ref_count` / `captured_count` / `reused_count` / `failed_count`
> / `source_changed_count` / `result`。**`source_changed_count` 单列**，正是本节点名的
> 那条：其余 failure code 说的是「没能留下副本」（容量、可用性），只有它说的是**捕获窗口
> 本身错了** —— 盘上那个文件在拷贝之前就已经不是这一轮产出的那个文件。混进失败率里它
> 会消失（存储用了 2% 和正在伪造历史，读数一模一样），所以它必须能单独告警；同时它是
> `failed_count` 的**透镜而不是从中切走的一块**，总数仍然包含它，看板不需要把互斥列加起来。
> 它还是必填字段：可选计数在传输里和「被丢掉」无法区分，而告警需要一个真实的分母。
>
> 未覆盖（后续）：capture duration、bytes、dedupe hit、HTML renderer availability /
> resource timeout / blank retry、legacy fallback 分类、historical open 命中率、
> GC marked/swept/orphan bytes、quota exceeded。

## 11. Security 与隐私

- snapshot 是项目内容的副本，继承项目读权限；删除项目/账号数据时必须进入同一数据删除流程。
- storage key 由 digest/UUID 在 daemon 内部解析，HTTP 不接受相对路径，防止 traversal。
- 写 temp 时用受控目录与 exclusive create；完成后 atomic rename。
- 读取时验证 DB 宣称 size/digest 与磁盘一致；损坏即失败，不静默返回字节。
- HTML renderer 保持 sandbox、禁止导航/新窗口。外部网络是否允许需明确：若允许会泄露 capture 时机/IP，若禁止会造成外部资源缺失。推荐默认只允许项目/已代理资源，外部 URL 使用现有安全代理或降级。
- snapshot endpoint 使用 immutable ETag，但 workspace/team authority 不得缓存进公共 CDN key。
- snapshot 图片可能包含用户敏感内容；日志只记 id、kind、bytes、failure code。

## 12. 测试计划

### 12.1 Red unit / contract tests

1. 同名 `hero.png` 先写 A、消息 A ref ready、再覆盖 B；A 的 digest/content endpoint 仍返回 A。
2. 两条消息引用相同字节只建一个 blob、两个 refs；删一条消息不删除 blob。
3. source 在 pending 与 copy 之间变化：snapshot `failed/source_changed`，绝不保存新字节。
4. HTML thumbnail mode 不增长 window 到 scrollHeight，只 capture 首屏 clip。
5. animation/transition freeze、scroll=0、fonts/images 超时都在预算内完成。
6. rename 后 HTML ref 解析到新 current path；image ref 仍解析 snapshot。
7. delete current 后 HTML latest unavailable；image snapshot 仍可读。
8. conversation/project cascade 后 refs 清理，GC grace 后 blob 回收。
9. unauthorized project/member 无法读 UUID 已知的 snapshot。
10. legacy image mismatch 不使用 current URL 作为历史图。

### 12.2 Daemon integration

- media generate 显式覆盖同一 output，验证 task/run/message/snapshot lineage。
- shell 写图与 media 写图都能走通用 terminal capture。
- daemon 在 intent、temp write、blob install、DB ready 四个故障点分别 crash/restart，reconciler 收敛。
- quota soft/hard、重复 digest、损坏 blob。
- API/CLI 对同一 snapshot 返回一致 metadata/bytes。

### 12.3 Web component tests

- HTML 卡使用 `<img>` thumbnail，不再创建 iframe。
- HTML click 调 latest artifact id；image click 调 snapshot id。
- pending -> ready 不改变卡外框高度、不打断用户滚动。
- failed/legacy 各状态文案与次级动作正确。
- 长会话 100+ HTML 卡没有 100 个活动 iframe。

### 12.4 E2E

1. 生成图片 A -> 卡 A；要求覆盖生成 B -> 卡 B；回点 A/B，右侧像素/digest 分别一致。
2. HTML v1 -> 卡面快照 v1；修改 v2 后回点旧卡，卡面仍 v1、右侧打开 v2。
3. HTML 长页首屏卡面尺寸固定，不是长图缩小；动画页面卡面静止。
4. 重命名与删除当前文件后的打开行为。
5. beta packaged 有 desktop renderer；纯 web 无 renderer 时 generic cover 诚实降级。
6. 旧会话 fixture 覆盖兼容矩阵，不做“当前文件冒充旧图”。

## 13. 建议 Plane 任务拆分

未访问 Plane；以下是建议拆分，创建前先去重现有任务，尤其是“媒体产物路径变更后缩略图裂图”和“图片修改后卡片仍展示旧/新图”类问题。

### P0/P1

1. **Chat artifact refs + immutable image snapshot core**  
   Contracts、DB、blob store、terminal/media capture、HTTP；先解决同名覆盖破坏历史。
2. **Web artifact card semantic routing**  
   HTML latest vs image snapshot，legacy 诚实降级，readonly snapshot tab。
3. **HTML first-viewport static thumbnail renderer**  
   Sidecar capture mode、freeze/timeout/blank retry、generic fallback。

### P1/P2

4. **Snapshot lifecycle, crash recovery and GC/quota**。
5. **Workspace artifact stable identity and rename/delete semantics**。
6. **CLI parity + observability/telemetry**。
7. **Historical compatibility fixtures and cross-version E2E**。
8. **Team resource/snapshot sync**（若 beta 首版不支持，必须作为明确 release gate 或已知限制，而非静默 latest fallback）。

## 14. 备选方案比较

### A. 只在 `producedFiles` URL 加 `?v=mtime`

不推荐。cache bust 只能要求浏览器重新取某个版本，服务器仍从同一路径读当前字节；旧字节已经被覆盖，URL 参数无法恢复。

### B. 每次覆盖时把旧文件重命名到隐藏目录

不推荐作为主架构。它把版本语义绑定到 overwrite 入口，漏掉 shell/第三方同步；rename/delete/去重/权限/GC 也会迅速变成另一套隐式 store。可以作为实现 blob capture 的内部临时步骤，但对外身份仍应是 snapshot id + digest。

### C. 扩展现有 `.file-versions` 支持所有二进制

可行但不推荐直接扩。现有系统按 file path 分根、manifest + `.html` 内容设计，适合可恢复 HTML source history，不适合跨消息去重、独立 thumbnail、媒体大文件 quota 和 message FK 生命周期。强行扩会把“编辑版本历史”和“Chat 证据存档”耦合。

### D. 直接把图片 base64 塞进 `produced_files_json`

禁止。长消息会膨胀 SQLite row、每次 upsert 重写大 JSON、listMessages 解析成本暴涨，也绕过统一权限/缓存/GC。当前代码已经专门把长事件拆 batch 避免重写（`apps/daemon/src/db.ts:248-255, 2843-2860`），不能在另一个 JSON 列重引入同类问题。

### E. 推荐：normalized refs + content-addressed blob + workspace stable id

正确性最好，且把三种变化分开：工作区路径变化、工作区内容变化、消息历史不变。新增面较大，但可以 additive migration + dual read/write 分阶段落地。

## 15. 风险与开放问题

1. **普通 agent shell rename 的 stable id 追踪。** watcher 能看到 rename，但跨目录/同内容多副本时存在歧义；需要明确冲突时 tombstone 旧 id 还是请求用户选择。
2. **HTML dependency-complete freeze。** standalone bundler 能覆盖多少本地构建/runtime 依赖，需要 corpus 验证。无法冻结时必须 generic fallback。
3. **desktop renderer 可用性。** 当前 visual export 明确依赖 desktop，web-only 是 501/降级（`apps/daemon/src/import-export-routes.ts:876-909`）。是否引入 daemon headless Chromium 是独立成本决策。
4. **团队同步。** snapshot blobs 是否属于项目共享资源、是否端到端加密、按谁的 quota 计费，需要平台决定。
5. ~~**视频/音频/大文档 —— 仍待拍板，但代码已经先行了，这是真实容量风险。**~~
   ~~本裁决只明确图片和 HTML/doc 卡。通用 store 能承载，但保留原件可能显著增长容量，
   应单独拍 quota/retention。~~

   > ~~⚠️ 现状（2026-09-02 审计）：`apps/daemon/src/chat-artifacts/policy.ts` 的
   > `IMMUTABLE_ORIGINAL_KINDS` **已经把 `video` / `audio` 一起划进了不可变原件**，
   > 也就是每一轮产出的视频/音频原件都会被整份复制进 blob store。代码注释自己标了
   > `OPEN PRODUCT QUESTION`，理由是「二进制原件的覆盖风险和图片一样」。~~
   >
   > ~~为什么这是容量风险而不只是口径问题：单 blob 上限 64 MiB、单项目上限 2 GiB
   > （`apps/daemon/src/chat-artifacts/quota.ts`）。一段几十 MB 的视频改三轮就吃掉
   > 项目配额的一大块，而配额一满，**同一批次里的图片快照也会跟着 `quota_exceeded`
   > 失败** —— 已经拍过板的图片语义会被没拍过板的视频语义挤掉。~~
   >
   > ~~在产品拍板前**不要改 `policy.ts`**（改哪个方向都是替产品下结论）。要拍的是两件事：
   > video/audio 是否保留原件；如果保留，它们是否走独立于图片的 quota/retention。~~

   **已拍板（用户裁决 2026-09-02）：「视频音频先不存快照了」。**

   `IMMUTABLE_ORIGINAL_KINDS` 只剩 `image` / `sketch`。视频/音频落到
   `latest_with_static_preview` 这一档，**不复制字节、不建 snapshot 行**：

   - **卡面**：视频卡拿工作区最新文件当 `<video preload="metadata">` 的源，浏览器
     自己出首帧；不出封面图、不出占位、不出错误文案 —— 和旧会话降级支同一条路。
     （**视频那一半当天晚些被追加裁决改写，见下面的 §15.5.1**；音频不变。）
     音频**根本不进产物卡**（`FileOpsSummary#artifactCardKind` 把它排除，走独立的
     胶囊横条），那条横条一直读的就是工作区最新文件，从没读过 `snapshotUrl`。
     也就是说音频快照此前存下来的字节，UI 从来没有任何一处读过。
   - **点击**：不变，仍然打开工作区最新文件。
   - **`snapshotState`**：`legacy_unavailable`（从没尝试过捕获），不是 `failed`。
     把「产品排除」和「配额满/渲染失败」记成同一个状态会把真失败埋掉。
     （视频在 §15.5.1 之后会有一行**只带 thumbnail** 的 snapshot，因此状态变成
     `ready`；音频仍然是 `legacy_unavailable`。）
   - **静态封面**：不会误落到 HTML 那条渲染路 —— `cover.ts#wantsRenderedCover`
     还有一道 `kind === 'html'` 的能力判据，视频/音频直接 skip，既不渲染也不记失败。
     （**视频这一句已被 §15.5.1 取代**：视频现在走一条独立的首帧抽取路，不经过
     desktop renderer；音频仍然 skip。）

   **落点不止 `policy.ts`。** 原注释说「从这个集合里删掉即可 —— 数据模型不用改」，
   这句是错的：`apps/daemon/src/routes/media.ts#onBytesWritten` 把 provider 字节
   直接交给 `captureChatArtifactSnapshotFromBytes`，**完全不查 policy**。只改显示
   策略的话，卡面会说「没存」而 blob store 里每一段生成的视频照存不误。因此排除
   规则改为在**捕获收敛点**强制执行（`capture.ts` 两个入口，`role === 'content'` 时
   查 `chatArtifactKindStoresOriginalBytes`，命中则 `state: 'skipped'`，一行不写、
   一个字节不落）。`role === 'thumbnail'` 豁免 —— 封面是「对文件的渲染」，归
   `wantsStaticCover` 管，若按 kind 一刀切会连 HTML 卡的封面一起杀掉。

   **残留行**：boot reconcile 遇到旧构建留下的 video/audio pending path intent，
   记 `failed / not_captured` 退休（新增的 failure code），**不再重新捕获** ——
   否则恢复路会在刚刚排除掉视频的构建上把那段字节又装回去。已 ready 且仍被
   `message_artifacts` 引用的旧视频快照不会被 GC 回收（mark-sweep 按引用算，
   引用还在就是活的）；未被引用的走正常 sweep。注意 GC 默认是 dry-run，
   只有 `OD_CHAT_ARTIFACT_GC=1` 才真删——这是既有的观察期开关，不因本裁决改动。

   **仍未拍板**：大文档（pdf / docx / pptx）的原件保留策略。它们目前走
   `latest_with_static_preview`，本来就不存原件，但也还没有文档 renderer 能出封面，
   所以卡面是「图标 + 文件名」。这条不在本次裁决范围内。

### 15.5.1 追加裁决（同日晚）：视频要冻**首帧**

用户原话：**「视频这个东西，那看起来视频还是要快照一下首帧的..先显示首帧吧」**，
并且同一句里把版式排除在外：「具体的视频产物卡片样式我再问问同事」。

**这条不推翻 §15.5，它补上 §15.5 漏掉的那一半。** 两件事必须分开读：

| | 视频原件 | 视频首帧 |
| --- | --- | --- |
| 存不存 | **不存**（§15.5 的容量裁决，一字未改） | **存** |
| 走哪条路 | 原件路（`content_digest`） | **封面路**（`thumbnail_digest`） |
| 量级 | 几十～上百 MB | 一张静止图，和 HTML 首屏截图同量级 |

漏掉的那一半是什么：排除原件之后视频落进 `latest_with_static_preview`，
`wantsStaticCover` 是 `true` —— 但 `cover.ts#wantsRenderedCover` 那道
`kind === 'html'` 的能力判据把它挡在门外，于是视频被计成 `skipped`，
**永远拿不到封面**。卡面就退化成 `<video preload="metadata">` 指向工作区当前文件，
浏览器自己画第一帧 —— 文件一被覆盖，老消息里那张卡的首帧就跟着变。
**这就是图片卡当初那个 overwrite bug 的视频版。**

**首帧怎么抽。** ffmpeg，`apps/daemon/src/chat-artifacts/video-cover.ts`。
不是新依赖：`@ffmpeg-installer/ffmpeg` 已经是 daemon 的运行时依赖
（`media/index.ts` 用同一个二进制编 HyperFrames 的 MP4），
`tools/pack` 的 mac / win prebundle 已把它列为 external 并随包分发，
linux 整包 `node_modules`。所以这里**没有新的打包决策**。
不走 desktop renderer：那条路是浏览器截图，为一帧视频先把文件加载进 Electron 窗口
再截，代价和可靠性都不对。产物是 `mjpeg -q:v 4`（原分辨率）——
解出来的视频帧是照片，PNG 会是几 MB 的无损噪声去撞 `quota.ts` 8 MiB 的
thumbnail 上限，JPEG 同画质只有几百 KB；`image/jpeg` 在快照路由的
inline-safe 名单里。

**版本竞态怎么防。** HTML 那条路能「先冻结、后渲染」，是因为自包含文档是可搬运的
证据；视频没有等价的冻结手段——除非把文件整份复制，而那正是 §15.5 禁止的。
**所以对视频来说，抽帧本身就是冻结**：它跑在 run-terminal 那个窗口里，
并且按 `capture.ts` 拷字节的同一套做法在两端核指纹（stat → 抽帧 → stat，
size/mtime 任一漂了就 `source_changed` 作废）。
代价是这一步**会被计进这一轮的耗时**：单次 10s 预算、每轮最多 4 个视频。

**抽不出来怎么办。** 静默回落，和 §15.5 / §9.x 同一条口径：不出占位、不写失败文案
（产品原话「不允许退回不就一个错误文案显示在上面了？这感觉更奇怪呢」）。
回落就是今天的行为——`<video>` 指向工作区最新文件，浏览器自己画当前的第一帧。
失败按原因记一行 honest-miss（`renderer_unavailable` / `timeout` /
`source_changed` / `source_missing`），和 HTML 封面失败共用
`cover.ts#recordCoverFailure`：把「从来不是候选」和「真失败」分开，
否则真失败会被历史消息淹掉。

**卡面怎么接。** `FileOpsSummary.tsx` 里视频那一格**仍然是 `<video>`**，
只是多了一个 `poster={item.coverUrl}`；同时 `coverUrl` 那条 `<img>` 分支加一道
`item.kind !== 'video'`，免得视频被那条通用分支接走、把元素换成 `<img>`。
`poster` 是平台自带的「首帧位」，所以版式、尺寸、9:16 letterbox 一律没动 ——
用户明说版式要另外问同事，这里只接封面。
Web 读取端（`runtime/chat/artifact-refs.ts`）**一个字没改**：它本来就是按
daemon 宣布的 `displayPolicy` 取 `thumbnailUrl`，视频和 HTML 走的是同一条。

**仍未拍板**：视频产物卡的版式（播放按钮、时长角标、比例）。用户说要问同事。

6. **消息编辑/分叉。**分叉共享 snapshot 合理；若未来允许删除单条消息，GC 引用必须覆盖所有 fork。
7. **“假预览图”是否要求当轮视觉还是通用模板。**本方案按用户提出的“拍快照”实现当轮静态首屏；若产品只要统一模板，可关闭 renderer，数据模型仍成立且成本更低。
8. **完成延迟。**原图 snapshot 应在 terminal 前完成；HTML PNG 渲染可以异步，但 renderer input 必须先冻结。需要定义卡片 pending 最长时间与失败文案。
   **视频首帧是唯一同步的那条**（§15.5.1）：抽帧就是它的冻结，没有可以搬到后台的
   中间产物，所以它记在这一轮的耗时里（单次 10s，每轮最多 4 个）。

## 16. 实施顺序建议

1. 先落 image immutable snapshot core。~~与 Web 打开语义~~ —— **「Web 打开语义」这一步 2026-09-02 作废**：用户裁决点击一律打开工作区最新文件，而 Web 现状就是这样，这一步的答案是「保持现状即正确」，没有要改的东西。
2. 再落 HTML 卡 `<img>` + generic cover，立即移除 live iframe 历史性能风险。
3. 接 first-viewport renderer，把 generic cover 升级为当轮静态首屏。
4. 最后启用 GC/quota、team sync、CLI 运维与完整 rollout。

在第 1 步完成前，不应宣称“历史图片卡可回看当时版本”；当前代码只能回看当前同名文件。
