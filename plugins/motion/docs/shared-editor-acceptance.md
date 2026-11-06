# 共享编辑器验收记录

初次正式交付基于 `core/open-motion` 的 `main` 提交 `49423180cb63af8515622fe06588929aac3b9100`（0.6.1，含四宿主薄适配器）集成正式 `mcp.ts`，不再从独立 PoC 导入运行代码。实现范围为 macOS；Windows / Linux 保留原生命周期。

以下记录正式入口的验收。旧 PoC、旧故障和样式归档仍保留在[原 Dev Design](https://powerformer.feishu.cn/docx/IwFrdjFBXoxf49xZIyScxDO0nWc)；旧结果不代替本次验证。

## 验收对象

| 约定条件 | 验证方法 | 结果 |
| --- | --- | --- |
| 正式集成 | 当前主干独立工作树；生产代码无 research/、poc/ 依赖；打包包含运行入口与守卫 | 通过：最新 main 已合入；源码插件解压发现 27 工具，静态指引不创建工作区 |
| 正式 MCP 与数据兼容 | 27 个工具保留，既有目录/会话回归，6 个真实 stdio 连接启动竞争，工程绑定和冲突 | 通过：90 项服务端/MCP 测试；既有会话、模板、历史、网关与四宿主适配器回归 |
| 真实故障与宿主链路 | 三个渲染中后台 SIGKILL 场景、媒体生命周期、登录宿主自然语言制作 | 通过：3/3 真实强杀、6 项媒体检查、真实 Codex 自然语言链路 |

## 可复现检查

- `npm run check`：插件清单、语法、制作流程与设计系统检查。
- `npm run typecheck:studio`、`npm run test:studio`：原生前端类型及单元/DOM 回归。
- `npm test`：先构建 Studio，再执行仓库服务端和 MCP 测试；`tests/shared-editor.test.ts` 包含系统锁交接和生产 stdio 多连接回归。
- `node --experimental-strip-types tests/shared-editor-crash.mjs`：三种真实渲染故障观察，需独占数据目录，保留进程和任务证据。
- `node --experimental-strip-types tests/shared-editor-media.mjs`：真实 Studio、工程切换和导出检查，使用既有 `verifyExport` 全解码和定位。
- `npm run package:plugin`：验证源码插件打包，不等于完整 Mac/Windows 安装包目标机验收。

所有真实 Chrome 检查经过团队 `browser-lock.sh run … -- browser-lock.sh real …`；故障脚本的兜底信号单独记录，不计作产品自动清理。`OPENMOTION_CRASH_EVIDENCE` 和 `OPENMOTION_MEDIA_EVIDENCE` 可指定输出目录，`OPENMOTION_EDITOR_EVIDENCE` 可保存 stdio 回归观察。

## 强杀后的恢复口径

| 注入点 | 要检查的实际对象 | 通过标准 |
| --- | --- | --- |
| Chrome 捕帧 | 存在真实页面渲染进程时杀后台，先不重连观察 | 旧进程自动退出；重连后原任务失败；旧原生 Studio 地址不可访问 |
| FFmpeg 编码 | 存在实际 FFmpeg 编码进程且临时 MP4 已写入时杀后台 | 旧 Studio/守卫/渲染器/Chrome/FFmpeg 清理完毕，任务不重放 |
| Studio 无响应 | SIGSTOP 原生 Studio，再杀后台 | 约 5 秒后升级强杀；新后台等旧锁释放；旧进程退出，原任务失败 |

任务的 `export.json` 和 `jobs/<id>/job.json` 都必须持久化为 `failed`，移除旧 `workerPid` 与任务 token。后台未重启前旧磁盘状态可暂为 `running`。记录以 PID 加进程出生时间识别旧进程，正常新开的 Studio 不属于旧进程残留。

## 本次结果

本轮实际运行环境：macOS 26.5、Node 26.11.1、Chrome 156.0.8078.80、FFmpeg 9.0.2。通过标准是技术与生命周期验收，非创作品质验收。

| 实际检查 | 结果与限制 |
| --- | --- |
| `npm test` | **90/90 通过，0 跳过**；合入四宿主薄适配器后的最终入口 |
| `npm run test:studio` | **703 文件、8,098 项通过**，另 1 文件跳过、16 项 todo；随后合入的主干未修改 Studio 源码，未为纯后端合并重复运行 |
| `npm run check`、`npm run typecheck:studio`、构建与源码插件打包 | 通过；打包包含新业务/后台入口、系统锁启动器和 Studio 守卫；解压后的 stdio 可发现全部 27 工具、读取制作指引且不创建数据目录 |
| 本地产品文档链接 | 204 个链接检查通过；不代表远端链接权限或内容审计 |
| 三类真实强杀 | 3/3 通过；Chrome 捕帧前段不重连也完成清理；FFmpeg 临时 MP4 写出 262,192 字节时注入；Studio 无响应场景重连耗时 4997 ms |
| 强杀后任务与进程 | 三次原任务最新/历史状态均持久化 failed、旧 workerPid/token 移除、不重放；约 10 秒时旧 Studio、守卫、esbuild、渲染器、Chrome、FFmpeg 均为 0，旧原生 Studio 地址不可访问；兜底未补杀旧进程 |
| 正式媒体生命周期 | 6 项通过：真实 Studio 复用、自行退出后重开、跨工程预览与连接绑定、忙碌停止拒绝、全部原 MCP 退出后导出继续、MP4 全解码/定位 |
| 真实 Codex CLI 0.166.0 模型回合 | 通过既有 ChatGPT 登录、`workspace-write` 沙箱和临时命令级 MCP 配置，完成会话/产物 → 预览 → 源码 → lint/timeline → 导出 → 技术校验；不改全局配置，不调用付费媒体服务 |

宿主产物：session `c712dd6b-3f6b-4eb2-a83c-efc0a53cd21e`，project `bd0aabc2-6b63-4f15-b3cc-81cb99b52620`，job `72c11272-5be5-46be-b4e6-a69473250460`，revision `15c9c81d7ddd93383158b890f50f1d61f951f81c29540ba03ace185db79214a2`。视频为 1 秒、320×180、10fps、H.264、静音。真实工具轨迹中 `motion_verify_export` 通过；成片文件 hash 与验证报告一致。

浏览器补验独立于 Codex CLI（CLI 自身没有打开网页）：Chrome 加载返回的真实嵌入 URL，并检查播放器 Shadow DOM。播放器验收把同一实际 MP4 从磁盘加载为 data URL，播放到结束、定位 0.5 秒、重播到结束；**不把此结果当作 HTTP 下载接口的 Range/流式 seek 验收**。本轮没有新增 Range 支持。首轮浏览器脚本错误使用 network-idle、普通 DOM/JSON 页以及 HTTP seek 的记录保留为调试记录，不计产品失败或有效通过；最终脚本按实际编辑器 DOM 和本地成片验证。

正式结果与 `commands.tsv`、原始日志、`HEAD.txt`、运行源码 SHA-256、`comparison.json`、进程/任务快照、宿主 JSONL 轨迹、技术报告和 MP4 一并附在原 Dev Design。本地验证与远端 CI 分开记录；提出正式 PR 不表示已合并、发布或所有宿主/系统都验收。


## 尚未验证的边界

Windows / Linux 共享后台未实现；其他宿主、系统重启/断电、后台与守卫同时被杀、Studio 启动中途被杀、渲染中 SIGTERM、独立网页浏览器进程强杀回收、长时间负载和资源节省未验证。保留 UI 原生保存门禁，未建立 UI/MCP 跨文件事务、并行 Studio、并行导出或持久请求去重。源码插件包验证不代表完整安装包验收或发布。

技术验收使用 1 秒合成动画，故障注入使用 12 秒样本；不代表长视频、创作品质或生产容量验收。原生渲染捕帧与 MP4 全解码/定位也不能代替实际播放器播放和目视检查，相关补验单独记录。

## 合并主干后的冲突回归（2026-11-05）

本轮合入 main `5ed1a4bcceb6e8e18a793edaf2b44cd566d7be8b`，同时保留新版 workflow/section 路由、视频对比工具与后台冷启动，以及共享后台、连接工程绑定和 Studio 守卫。MCP 共 28 个工具。新增正式 stdio 冷导出回归：实际导出完成、源 revision 不变、未启动 Studio，成片校验通过。仓库服务端/MCP/实际渲染检查 **111/111 通过，0 跳过**。

Studio 源码和依赖锁未变，本轮不重复完整 Studio 或模型回合；此前证据仍属初次交付。本轮三类真实强杀 **3/3 通过**，任务最新/历史记录均失败恢复，旧 Studio/守卫/Chrome/FFmpeg 均清理；6 项真实媒体检查通过。结果以本轮独立日志、commands.tsv、HEAD 和 comparison.json 为准；未将历史 90 项结果冒充当前主干结果。
