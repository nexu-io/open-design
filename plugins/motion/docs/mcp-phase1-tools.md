# OpenMotion 一期 9 Tool 契约与实现范围


## 结论与本次落地范围

本地候选包版本为0.6.2，避免误复用已运行的0.6.1旧服务和宿主缓存；尚未发布。源码和默认导出均使用 `phase1`，只公开以下 9 个 `motion_` Tool。发现、调用门禁、接入元数据和构建使用同一注册表；旧名不可绕过调用。原有领域服务、Studio、渲染器和内部兼容 handler 保留。适配不只是改名：补了项目身份、批量导入、请求去重、版本和保存保护、取消终态、自动导出校验。

用户说的“只支持这些 skill”在本次按上下文解释为“公开这 9 个 Tool”。Skill 是指导文档：一期只装入 motion-production、motion-director、template-to-video、motion-recreate 四个入口及其参考，并迁移其中的调用指引。模板已接主干真实实现；复刻入口后续由 [变更记录](product/changes.md) 接入实际流程（只用本表 9 个工具，规则与测量脚本随 motion-recreate 分发），不新增自动创作算法或 Tool。其他扩展 Skill 保留源码，排除在一期分发之外。

## 一期仅公开这 9 个 Tool

| 公开 Tool | 复用来源 | 本次实现到的边界 |
| --- | --- | --- |
| motion_create_project | 项目目录、空白工程、模板复制、会话归属 | 新建独立载体、保存需求/来源、返回初始内容版本；宿主 Agent 制作影片 |
| motion_open_preview | 原预览、项目选择、原生 lint | 打开指定已有工程；仅明确绑定的 OpenMotion 会话可省 projectId；返回真实 URL |
| motion_import_assets | 素材目录、FFprobe/FFmpeg | 实际本机媒体批量持久化、逐项结果、稳定素材 ID、去重；不自动排入时间线 |
| motion_get_project | 项目目录与原生文件读取、导出记录 | 项目分页5条、显式工程详情、分段文本读取、当前版本、具名导出任务状态 |
| motion_edit_project | 原写文件职责、Studio 原生 history | 双重版本校验；文本批量保存及需求一起写入；失败恢复保护；通知原生文件监听 |
| motion_export_request | 原 request/get/verify export、原生渲染器 | 冻结工程版本和本地素材、后台 MP4、自动 lint/规格/完整解码校验；同请求找回任务 |
| motion_list_versions | Studio history/checkpoint | 内容快照、稳定 ID/vN、来源/摘要、可恢复标记；每页5条，不限制只留5条 |
| motion_restore_version | Studio history 与保留的媒体内容 | 旧快照恢复成新版本；保留后续历史；历史资源缺失或并发冲突时拒绝覆盖 |
| motion_export_cancel | 现有导出队列、进程生命周期 | 指定项目/任务；排队取消、运行中 cancelling、进程退出后 cancelled；完成竞态保持 completed |

## 共用约束

- projectId 是作品身份；sessionId 是 OpenMotion 内部会话，不能把宿主聊天 ID 自动当成它。所有数据写入明确项目。新 MCP 客户端未绑定时，默认预览报 PROJECT_NOT_BOUND，不猜全局最近工程。
- versionId 是历史身份；versionNumber 显示 vN；revision 是内容哈希。恢复后哈希可与旧版相同，版本身份仍是新的。GUI 的已保存改动也进入原生历史。
- 有副作用的保存使用稳定 requestId。同 ID 同输入找回原结果（导出/取消同时刷新同一任务状态）；异输入报 REQUEST_ID_CONFLICT。修正失败输入时使用新 ID。对进程中断但无法确认结果的请求返回 REQUEST_STATE_UNKNOWN，不自动重复写入。
- 编辑/恢复以 Studio 原生独占窗口协调 GUI 写入，暂存文件和恢复日志保护整批写入。进程重启先恢复未完成写入；发现外部第三种内容报 RECOVERY_CONFLICT 并保留副本。普通文件系统的多文件提交不等于断电级数据库事务；macOS共享后台持有系统所有权锁后才回收旧私有锁；独立旧服务的workspace.lock仍明确阻塞，不能自动强删。
- 素材成功项与索引作为一次项目保存；无效素材逐项失败并保留有效项。不覆盖已导入资源。小于2 GiB/项、最多100项；当前为本机绝对路径传输，不是云附件上传协议。
- 源码最多100个文本文件、总计8 MiB；可仅更新 requirements；分段读取上限2 MiB/次，offset 是 UTF-8 字节边界。HTTP JSON 请求另受9 MiB传输体积限制。只允许项目内白名单路径，拒绝符号链接、越界及保留元数据路径。
- 错误通过 MCP isError 和 error.code/message/applied 返回原因；来源读取/版本/路径/媒体/任务错误不返回空成功。无法确认写入或丢失回复时，先读取项目/历史/原任务，不盲目重试。服务错误的 applied=unknown 表示无法替调用方推断是否生效。
- 技术验证、视觉/声音/播放审阅和用户采用分开。record_review 只保存所声明的真实依据，verifiedUserAdoption 固定为 false，不证明用户实际采用。

## 各 Tool 的输入、返回与失败边界

### motion_create_project

必填 requestId、projectType、title、requirements；可选 sessionId 归入已有会话。projectType 为 natural_language/template/reference_video。template 必须给实际可复制的 builtin templateId；reference_video 必须给已知目录 referenceVideoId 或 HTTP(S) referenceUrl。

返回 projectId、sessionId、project（directory、html、files）、revision、version、currentVersionId/currentVersionNumber、需求/来源、previewUrl，以及 creationComplete=true、filmComplete=false。参考只记录来源，不在创建时假装看片或生成成片；外部 URL 可达性/内容由宿主实际检查。输入不符、模板不可复制或 ID 不存在时明确失败，保留旧项目。

### motion_open_preview

默认 action=open；传 projectId 或已绑定 sessionId，可选 embedded。执行原生 lint，再选择同一实际工程，返回工程详情、previewUrl、preflight、selectionSource、openedByHost=false。无项目不自动创建；真正打开网页由宿主浏览器执行。

可选 action=record_review，须 projectId、requestId、review，记录已观察对象/versionId/结论/依据/来源与可选时间范围，不修改源码。

### motion_import_assets

必填 projectId、requestId、items；每项 itemId、sourcePath，可选 name。支持探测并首帧解码的 PNG/JPEG/WebP/GIF、MP4/WebM 及 WAV/MP3/OGG/FLAC/AAC/M4A。格式以实际媒体流/容器为准。字体、SVG/PDF、任意 URL 下载本期不在此入口支持范围。

返回 status=completed/partial/failed、items 中的素材 ID、相对 path、MIME、大小、SHA256、实际可得规格或单项错误，以及发生保存时的新版本。相同 itemId/输入复用现有素材；同 itemId 改输入冲突；纠正失败项使用新 requestId。导入不自动替换元素或放进时间线。

### motion_get_project

无 projectId：当前数据目录中按 createdAt 倒序列项目，每页5条，nextCursor 翻页，可按 sessionId 限定；旧项目无创建时间返回 null。不选择/创建 GUI 项目。

有 projectId：返回工程原生目录、入口源码/文件清单、需求/来源、assets、revision、当前版本、所属 sessionId、导出及审阅记录。读取会 flush 已保存原生历史的 metadata，不修改源文件。file={path,offset?,length?} 分段读文本；expectedRevision 可固定读取快照；exportJobId 查指定历史导出。导出结果包含真实状态/阶段、错误和校验；完成后才有 path/downloadUrl。错误项目、版本冲突或不属于该项目的任务明确失败。

### motion_edit_project

必填 projectId、requestId、expectedRevision、expectedVersionId、files=[{path,content}]；可选 requirements、summary。只保存宿主已生成的文本，不启动第二个创作 Agent。requirements 存在工程受版本管理的元数据中，与文件一起提交。

返回 projectId、version、revision、changed、changedFiles、previewSync。无内容变化返回 changed=false，不造空版本。Studio 已打开时返回 file_watcher_notified，这不是已观测到每个画面刷新完成的证明。路径/类型/体积/并发失败时拒绝或回滚整批；恢复冲突保留现场并阻塞覆盖。

### motion_export_request

默认 action=request，必填 projectId、requestId、expectedRevision、versionId，可选 audio=required/silent/optional。仅允许导出当前经双重校验的版本；先恢复历史版本，再导出它。局部文件冻结成私有快照，外部 URL 仍是外部依赖。

返回原 job（id/projectId/versionId/revision/expected/state/stage 等）和自动技术校验说明。用 motion_get_project 的 exportJobId 追踪。只输出 MP4；自动执行 lint、原生 render、FFprobe 规格、视频/音频全解码和代表时间点 seek。检查失败返回 failed，不把渲染退出0当成功。队列一期同数据目录只允许一个待执行/运行中的导出。

action=record_review 要求 projectId/requestId/jobId/review；只能对本项目已完成任务及其 versionId 记录依据，不重新渲染。

### motion_list_versions

必填 projectId，可选 cursor。返回 currentVersionId/currentVersionNumber、versions、pageSize=5、hasMore、nextCursor。每条有 versionId、versionNumber、createdAt、source、summary、revision、restorable/unavailableFiles；filePaths 是完整文件路径清单，不等同精确逐行 diff。首次读取建立现有工程基线；仅实际内容变化产生后续 vN。

### motion_restore_version

必填 projectId、requestId、versionId（目标）、expectedRevision、expectedVersionId（当前）。校验目标属于该项目及历史资源完整，再恢复原生源文件、样式、时间/效果数据及媒体为新内容版本。v5→v3 得到 v6；v4/v5 仍可查/恢复。目标本就等同当前内容时 changed=false。

返回 version/revision、restoredFromVersionId、changed、previewSync。完整媒体恢复保证适用于本Tool，Studio自身GUI历史恢复仍沿用原生行为。不自动混合两个版本，不替换/删除已有导出成片；缺资源、并发改变或恢复冲突时明确报错。

### motion_export_cancel

必填 projectId、requestId、jobId。只能操作项目自己的任务；返回 job 最新状态。pending 直接 cancelled；running 先 cancelling，发出停止信号并在执行进程退出后 cancelled。执行器被异常杀死/超时返回 failed，不谎报取消成功。completed 保持 completed，历史视频保留。宿主停止对话不自动调用本 Tool。

## 注册、构建与兼容

- shared/mcp-profiles.json 是9项唯一公开清单，shared/mcp-release.json 默认 phase1；mcpRegistry 同时控制发现与调用，禁止运行时环境变量扩大列表。新增/缺失实现由构建完整性检查拦截。
- npm run package:phase1 构建 Studio 并生成 dist/motion-0.6.2-phase1.zip；npm run package:plugin 默认也沿用 phase1。该插件 ZIP 不带原生 Node/浏览器/FFmpeg：使用支持的本机 Node、首次安装锁定依赖，FFmpeg/ffprobe 需本机可用。
- 四宿主薄适配器从同一运行时导出，scope.json 记录 profile，复制上述4个 Skill；不另维护 allowlist。数据目录放在 runtime/插件缓存之外。资源指导通过本地文件或 resources/list、resources/read 取得，不增加第10个 Tool。
- 完整原生测试包的 build <target> <beta-version> [phase1|legacy] 使用同表检查并写 release.json；本次不声称重新制作/验收各平台原生安装包。
- 内部兼容 handler 与显式 legacy 开发构建保留，不能作为本次一期发布；旧调用在一期包中明确 MCP_TOOL_NOT_EXPOSED。宿主升级后须刷新发现和 Skill，不能继续缓存旧 schema。

## 开发顺序与放行

先明确项目/版本，再导入/保存、打开预览、按实际范围导出和审阅。不要为凑9个名字写空 handler。源码、本地运行、ZIP协议检查、完整平台/宿主和业务验收分别记录。

## 尚需对齐的产品口径

本次采用：P0 自然语言“创建”是工程载体+需求，影片仍由宿主制作；项目排序用创建时间；当前会话须显式绑定；历史5条是分页；媒体不自动清理。容量/清理、云附件传输、远程认证、成熟模板专业流程、四宿主完整模型任务体验及 Windows/macOS 安装验收后续单独推进。

## 证据与验证范围

已通过本地一期业务检查和真实运行闭环：创建/分页/请求去重、保存与 UTF-8 读取、v5→v3→v6、跨重启保留历史/媒体、失败与中断恢复保护、排队取消；真实 Studio 的原生历史、MCP 绑定与保存、运行中取消、320×180/10fps MP4 的自动技术验证。

合入最新主干后，后端完整回归124项通过；另含真实多MCP连接的项目隔离、并发冲突与断开续用；Studio类型检查通过，单元/DOM测试8098项通过，保留原有1个跳过文件/16项todo；check和后端类型检查通过。实际ZIP从独立目录启动、首次安装锁定运行时后，9项Tool均实际调用通过，含音轨MP4自动校验、运动帧变化、版本恢复、取消与历史结果读取。四宿主薄适配器已导出；安装配置的发现检查与完整模型体验分别验收。记录见 [变更记录](product/changes.md)。独立播放器听看、四宿主端到端模型任务、Windows 实机、CI、发布与业务验收均未据此宣布通过。

## 源码定位与验证记录

公开 schema 在 shared/phase1-tools.ts，注册在 shared/mcp-registry.ts；业务适配在 phase1.ts，原生历史及文件保护在 phase1-versions.ts，导出状态在 workspace.ts/server.ts。核心回归为 tests/phase1.test.ts、tests/phase1-runtime.test.ts、tests/mcp-registry.test.ts、tests/workflow.test.ts、tests/adapters.test.ts。旧逻辑通过内部兼容回归继续保护。

## 9个Tool自测对照

以下是已执行的本地主流程与异常检查，不等于覆盖所有输入组合、平台或人工验收。自动检查调用真实实现及临时隔离项目；示例命名不是新增需求编号。

| Tool | 已执行的检查 | 测试入口 |
| --- | --- | --- |
| motion_create_project | 自然语言载体、实际内置模板、参考ID载体；同请求找回、异输入冲突、来源类型不符拒绝 | tests/phase1.test.ts |
| motion_open_preview | 真实Studio URL、同会话绑定、未绑定拒绝、多连接各自选项目 | tests/phase1-runtime.test.ts、tests/phase1-shared.test.ts |
| motion_import_assets | PNG/WAV/MP4真实探测/解码、坏文件部分失败、重复去重、恢复历史媒体 | tests/phase1.test.ts |
| motion_get_project | 每页5条/游标、显式项目/会话归属、UTF-8分段读取、历史导出、无GUI切换 | tests/phase1.test.ts |
| motion_edit_project | 文本批量、仅需求保存、无变化不造版本、过期版本/路径冲突拒绝、多连接并发一成一拒 | tests/phase1.test.ts、tests/phase1-shared.test.ts |
| motion_export_request | 不开Studio的冷导出；实际静音/带音轨MP4、自动规格/解码/运动帧、原请求去重、审阅不重渲染 | tests/integration.test.ts、tests/phase1-runtime.test.ts、tests/phase1-package.mjs |
| motion_list_versions | 最近5条/更早页、当前版本标识、跨重启历史仍可读 | tests/phase1.test.ts |
| motion_restore_version | v5恢复v3产生v6并保留v4/v5；历史音视频；中断恢复及外部第三种内容保护 | tests/phase1.test.ts |
| motion_export_cancel | 排队取消、运行中确认停止、跨项目拒绝、已完成不改状态、旧结果保留 | tests/phase1.test.ts、tests/phase1-runtime.test.ts、tests/phase1-package.mjs |

复测命令：后端 `node --experimental-strip-types --test --test-concurrency=1 tests/*.test.ts`；实际包 `node tests/phase1-package.mjs /absolute/path/motion-0.6.2-phase1.zip /absolute/path/evidence`。涉及真实浏览器/渲染时按团队browser-lock包装器执行。完整测试包和四宿主真实模型任务另行验收。


### 测试代码与CI范围

| 层级 | 代码 | 当前执行方式 |
| --- | --- | --- |
| 业务/协议自动化 | tests/phase1.test.ts、tests/mcp-registry.test.ts | PR CI执行；真实临时文件/原生历史，覆盖主流程与关键异常 |
| 实际运行集成 | tests/phase1-runtime.test.ts、tests/phase1-shared.test.ts | 本机全量执行；真实Studio/渲染与多个MCP进程，部分场景限定macOS |
| 独立ZIP端到端 | tests/phase1-package.mjs | 每次PR创建/更新及main推送自动执行独立phase1-package-e2e任务；重新打包、独立解包/首次锁定依赖安装、真实stdio MCP、Chromium与FFmpeg；断言成功调用的Tool集合恰好是9项 |

各Tool的用例按用户场景复用，不要求每项单独一个文件。上表9个Tool均进入ZIP端到端链路；预览部分检查实际服务和URL，尚未覆盖完整GUI点击操作。宿主模型对话、Windows实机、播放器人工听看和所有参数组合不在当前完成范围。独立ZIP E2E已加入普通PR CI；完整GUI点击和macOS共享后台集成仍是单独验证范围。

CI不按路径过滤、不跳过渲染、无失败重试或continue-on-error；缺浏览器、依赖安装失败、任一Tool失败或视频校验失败均使任务失败。每次在独立临时数据目录安装，使用Linux临时容器与自带Chromium，不接入宿主共享浏览器；本地复测继续使用团队browser-lock包装器。CI保留14天的HEAD、ZIP校验和、Tool调用结果、MCP/预览日志及通过时的MP4。基础构建失败时以该任务日志为准。

**合并门禁还依赖仓库配置：** 管理员需为main开启分支保护，启用必需状态检查，并将实际CI产生的phase1-package-e2e检查上下文（以及现有assemble检查）设为必需；禁止跳过检查合并。工作流文件不能自行修改仓库权限。2026-11-05用户确认先不配置分支保护：本期先交付自动E2E与失败标红，按CI全绿才合并执行；平台暂不会强制锁住合并按钮。后续启用硬门禁仍需管理员配置，不能把CI接入等同于“服务端已禁止失败合并”。

参数拒绝另有回归：顶层/嵌套的constructor、__proto__、toString等未声明字段，以及类型不正确的分页游标，必须明确失败。不能把schema中的additionalProperties=false单独当作运行时校验已完成。
