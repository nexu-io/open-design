# OpenDesign Motion

源码位于 OpenDesign 仓库的 `plugins/motion/`。从仓库根目录执行 `npm --prefix plugins/motion ci` 和 `npm --prefix plugins/motion run package:npm`，即可独立构建 Motion；用户无需安装完整 OD 应用。迁移基线、开发入口、CI 与分发边界见[迁移说明](docs/repository-migration.md)。npm 安装器尚未公开发布。

**Agent 会话、Motion 模板与可编辑产物。**

OpenDesign 0.6.2 是面向 Agent 的本地创作工作区与 Codex 插件，一期提供 Motion 模式。会话是父级，Motion 工程是可在 Artifact Viewer 中编辑的产物。完整 Studio 前端已迁入 `studio/`，保留原生面板、编辑流程与导出队列，并适配我们的设计系统；工程语法、时间轴语义、动画和视频渲染基于 [Hyperframes](https://github.com/heygen-com/hyperframes) 0.9.7。

- 页面直接运行本仓库构建的 React 编辑器，顶栏、模板库、浅色/深色主题和面板布局由我们维护。时间轴、画布编辑、属性、代码、撤销与保存的源码都在 `studio/src/`。
- 工程就是 `index.html`、`compositions/`、CSS、JS、素材和 Hyperframes 的 Studio 编辑数据。Agent 和 Studio 读写同一组文件。
- 动画遵循 Hyperframes 的 composition 属性和可 seek 的 GSAP timeline。视频、音频、字幕、嵌套 composition 使用它的原生语法。
- 导出执行 `hyperframes lint` 和 `hyperframes render`，由上游负责逐帧捕获、编码与混音。关闭页面或将窗口放到后台不会中止导出。

顶栏「预览」可以重新打开关闭的预览面板；「布局」提供各面板的显示开关、代码创作/专注预览预设及默认布局恢复。原生撤销/重做保留在顶栏和时间轴；点击「历史」或项目旁的自动保存状态，可以查看修改文件、保留当前版本、取消保留及恢复历史版本。版本数据继续由 Hyperframes 原生历史服务管理，恢复不会删除后续记录。

首页提供新建创作、最近会话和分类模板；输入框一期只有 Motion 模式。选择模板后提交需求，创建一个会话和对应工程，通过「模板 + motion-production skill」继续制作。所有页面共享最左侧会话列表。会话与右侧浏览器顶格并列，完整 Motion 编辑器放在浏览器 Tab 内；关闭浏览器可继续完整会话，收起会话可沉浸编辑，新 Tab 可以打开另一个所属工程或网页。会话名与工程名独立保存。旧工程、需求与书签兼容，切换前等待原生保存，失败保留当前页。会话的 Agent 推理与工具编排仍由外部 MCP 客户端负责，网页不包含聊天 Agent 运行器；外部 Agent 可通过 `design_append_message` 写回真实回复。详细行为、网页浏览能力与单活动工程边界见 [会话与 Artifact 浏览器](docs/project-workspace.md)。

全局面包屑与设置顶栏已移除。会话标题与右侧标签栏同色、顶格对齐，中间有分隔线。浏览器展开／恢复按钮固定在标签栏最右侧、关闭按钮左边。会话顶部按钮可完全收起列表；会话隐藏时由浏览器顶部恢复，首页由左上角按钮恢复。连接 Agent、模型设置、主题与语言收纳到侧栏。

地址栏支持直接输入 `baidu.com`、前进、后退、刷新和停止；网页由独立本地 Chromium 承载，支持点击、滚动与文字输入，切回 Motion 仍保留编辑状态。需要本机 Chrome / Chromium，或设置 `MOTION_BROWSER_PATH` / `HYPERFRAMES_BROWSER_PATH`。网站音频、文件上传/下载管理等当前边界见 [浏览器运行架构](docs/browser-runtime.md)。

展示品牌为 OpenDesign。产品内会话、模板、媒体生成与通用 API 继续保留；本次一期给宿主 Agent 的公开 MCP 只含下方 9 个 motion_ Tool，未公开的产品能力不因此删除。

MCP 打开预览、创建产物、应用/复刻模板时，`previewUrl` 默认包含 `embed=1`，Codex 等宿主直接打开完整地址即可只显示编辑器，隐藏侧栏、会话和产品浏览器外框。`sessionUrl` 或显式 `embedded=false` 返回完整工作区；空会话仍显示会话入口。也可分别配置 `sidebar=0`、`conversation=0`。这些视图使用同一会话与产物。完整接口、失败语义与后续模式扩展见 [会话技术架构](docs/session-architecture.md)。

侧栏底部的语言菜单支持简体中文和 English，切换时保留当前播放位置、选择与面板布局，偏好在本地持久化。工程文字、文件名与属性值保持原文。统一 MCP/模板弹框沿用主分支的接入流程与目录，内部文案目前以中文为主。

侧栏底部「模型设置」（嵌入视图保留在编辑器顶栏）提供 **Model Router / Gateway**：检测本机 Codex 的登录和内置生图能力，配置 Atlas Cloud / fal.ai Key，发现多模态模型并选择默认路由。空时间轴支持「导入文件 / 生成素材」，生成面板可以选择图片、视频、音乐、语音及参数；结果存入工程素材库，再放到选定时段。素材菜单支持预览、在播放头处添加、复制路径、下载、重命名与删除。

选中时间轴片段、Shift 拖选时段或在未选片段时点击标尺，会弹出素材操作栏。选中图片可直接「修改图片」，由本地 Codex 以原图为参考生成候选；确认替换后保留原片段时长、动画与样式，并可撤销。图片修改支持工程内 PNG/JPEG/WebP（20 MB 以内）；视频、音乐和语音目前支持生成。

Studio 与 MCP 共用这套模型和任务服务。云 Key 的填写不等于已验证权限/额度；调用使用用户自有账户，失败不会自动重试或换到另一付费供应商。Key 仅保存在本地独立配置中，不返回给前端/MCP，也不随工程导出。可使用环境变量 `ATLASCLOUD_API_KEY` / `FAL_KEY`。本地 Codex 需要已登录、支持 `--ephemeral` 且开启 `image_generation`；不会复制 Codex 登录 token。详细说明见 [模型网关](docs/model-gateway.md) 与 可复现测试。

## 一期 MCP 发布范围

[一期 9 Tool 契约与实现范围](docs/mcp-phase1-tools.md)固定公开名称、输入返回、内容版本与裁剪边界。源码和默认构建均为 phase1，仅暴露 9 项；`npm run package:phase1` 导出一期插件 ZIP。已补齐契约适配，复用现有 Studio/渲染器，四个随包 Skill 的调用指引同步迁移。内部 legacy 实现保留供兼容回归。

## 产品与文档

OpenDesign 围绕已有 Agent 用户的产品演示、参考复刻、动态图形和后续修改场景建设。目标是从需求或参考出发，在同一个本地工作区交付可继续编辑的工程与成片。目标人群的优先级仍需通过真实任务验证；当前没有产品账号、订阅计费或云端团队服务。

[docs/ 文档中心](docs/README.md) 是持续维护的产品知识库：

| 文档 | 内容 |
| --- | --- |
| [产品架构](docs/product/architecture.md) | 定位、核心流程、能力边界、模块与数据关系、成功标准 |
| [共享编辑器](docs/shared-editor.md) | 多个 MCP 连接共用后台、工程选择、目录兼容与崩溃恢复 |
| [网页浏览器](docs/browser-runtime.md) | Chromium 隔离、实际导航与输入、资源释放、运行配置和当前限制 |
| [会话与 Viewer 技术架构](docs/session-architecture.md) | 共用生命周期、模式/模板/skill、HTTP/MCP、Codex 嵌入、扩展点与设计取舍 |
| [素材生成设计与架构决策](docs/product/media-generation-design.md) | 为什么共享网关、先生成再采用；选区交互、关键取舍、故障与扩展约束 |
| [模型网关](docs/model-gateway.md) | 当前配置与 API/MCP 合约、运行限制、真实验证及未验证范围 |
| [需求与决策记录](docs/product/changes.md) | 每次需求的选择理由、产品影响、验证证据和后续事项 |

文档区分当前能力、已确认方向、待验证假设和候选方案。画像与商业化内容会随新需求和真实证据持续修订。

产品按职责连接创作 Agent、Model Router / Gateway、原生编辑器和后台渲染：Agent 与用户决定创作意图，网关执行多模态素材任务，编辑器把素材组织成可继续修改的作品，渲染与验收交付确定版本的成片。Studio 和 MCP 共用网关，模型 Key 与任务配置属于工作区，作品文件保持独立。生成成功先得到候选素材，用户确认放置或替换后才修改合成。

理解整体设计可从[职责分层与架构约束](docs/product/architecture.md#职责分层与依赖方向)开始，再读[多模态设计决策](docs/product/media-generation-design.md)。后续属性面板调用、更多本地 Agent 和完整 motion 编排均沿用这些边界；已实现接口与候选工作流执行器分别记录，不能把扩展方向当作已上线功能。

## 使用

团队试装见 [内部测试包](docs/test-packages.md)：本分支的 Actions 手动构建默认生成 npm 轻量安装器、应用归档与固定校验清单，完整 Mac arm64 / Windows x64 ZIP 通过 `format=full` 保留备用。两种格式保留真实出片验收；迁移后的工作流只构建和校验，不上传制品或发布 npm / Release。原生依赖自动从固定公开源获取，无需公司仓库凭据；Mac 仍以 macOS 26.0+、Windows 以 Windows 11 为验证目标，旧系统未验收。主分支按钮在合入后生效。

### 复制到 Codex 安装并体验

先安装支持 `codex plugin add` 的 Codex CLI、Git、Node.js 22.18+（含 npm）和 curl，适用于 macOS / Linux。**复制下面整个文本块，粘贴到 Codex 对话框并发送：**

```text
请执行以下命令安装 OpenMotion：
curl -fsSL https://raw.githubusercontent.com/nexu-io/open-design/main/plugins/motion/install.sh | bash

安装成功后，简要介绍它能做什么，并询问我是否体验一个无需准备素材的 20 秒视频，提供 MP4 并打开可编辑工程。
```

这段指令要求 Codex 在安装成功后介绍能力并邀请体验；你选择开始后再制作。完整文本应发送到 Codex 对话框，不要直接粘贴到终端。

入口合入 OpenDesign `main` 后此命令才可用。脚本仅检出 `plugins/motion/`，自动安装锁定依赖、构建编辑器、注册并安装插件，再验证真实 MCP 握手。首次安装需联网；不会安装系统软件或重启 Codex。安装目录会保留，供本地插件源继续使用。

已有同名目录时停止，不覆盖、不自动更新。需要换目录时，在 `bash` 前设置 `OPENMOTION_INSTALL_DIR=/绝对路径`；可同时用 `OPENMOTION_REF=标签或分支` 选择下载版本。已有源码也可直接运行 `bash scripts/install-motion.command`。安装插件与成功导出视频是不同阶段；导出依赖见下文。

### 安装完成后的引导（Codex / Agent）

由 Codex 或其他 Agent 执行安装时，在插件安装与 MCP 连接预检均成功后，按以下顺序结束安装任务：

1. 在当前对话简要介绍 OpenMotion 支持产品宣传视频、动态图表与流程动画、模板和可编辑预览、MP4 导出。
2. 主动询问用户：**“要现在体验一个无需准备素材的 20 秒视频吗？我会提供 MP4，并打开可编辑工程。”**
3. 停下来等待用户选择；用户回复“体验”或明确同意后，执行下方首次体验默认规则。用户明确只要安装或暂不体验时，尊重该选择。

先在当前对话完成介绍与邀请。若新插件工具尚未加载，在用户同意体验后再提供新会话接续方式；安装时的 MCP 预检不代表当前对话已加载新工具。安装失败时先说明失败原因，修复成功后再邀请。

### 首次体验默认规则

接受上述邀请即确认使用内置 **Product Promo（`product-promo`）**：

- 沿用模板的示例文字、图形和动画，保持原生 20 秒规格，不再询问素材、品牌、风格或模板选择。
- 创建独立可编辑工程，保留原有工程；同一次体验已经创建工程时直接续用，避免重复创建。
- 在 Codex 右侧打开 OpenMotion 可编辑工程，检查正确载入并可播放；让用户可以在等待导出时继续查看工程。
- 接受首次体验同时授权导出该示例的 MP4。读取当前 revision，导出并等待完成，检查实际文件与播放；复用本次已完成的导出，不重复排队。
- 最终回复包含**简短说明与可直接播放/下载的 MP4**，同时保持右侧工程页面可用。工程 ZIP 和截图只作补充，不能代替 MP4。

右侧页面打开依赖宿主的浏览器/面板能力。没有该能力时仍交付 MP4 和实际工程链接，明确说明页面未自动打开，不能声称完整的桌面体验已通过。导出失败时保留工程并说明具体原因，不把预览或任务排队当作最终成片。

此默认规则只适用于用户接受安装后的首次体验邀请；用户提出自己的视频需求时，按其明确范围执行。

### 开始创作

新工程先 `motion_create_project`；已有工程先 `motion_get_project` 明确 projectId、revision、currentVersionId，再保存或打开。`motion_open_preview({projectId})` 运行 lint 并返回真实预览 URL，由宿主内置浏览器打开。它不隐式创建新工程；无浏览器时可以手动打开返回地址。

macOS 同一数据目录中的多个 MCP 会话现在共用一个后台，每个会话保留自己的工程选择；所有会话退出后导出仍继续。新安装默认使用 `~/Library/Application Support/OpenDesign`，已有 `.motion-data` 或显式 `MOTION_DATA_DIR` 沿用；不同目录仍是不同后台。原生 Studio 和导出继续各只有一个活动实例，Windows / Linux 保留原启动方式。停止、旧服务升级和故障恢复见 [共享编辑器](docs/shared-editor.md)。

仅导出时只启动后台服务，不启动 Studio 改写当前源文件；冷启动套模板也不会先创建无关 starter。随后调用 `motion_open_preview` 可在同一服务中启动编辑器。真实外部编辑仍受 revision 校验保护。

点击全局「连接 Agent」或编辑器「模板库」，在同一个弹框里连接 Agent、浏览模板、观看视频并一键复制复刻指令。模板入口会直接定位到画廊，接入指南也在弹框中展开。旧的 `?templates=1` 与 `/connect` 链接仍可使用。

完整迁入 Personal video agent 的 **891 条 Hyperframes 目录**：42 个完整参考、393 个创作片段、210 个动效模板、238 个组件和 8 个影片范例。再加上三个可直接打开的官方示例，共 **894 条**。完整目录通过 MCP 搜索与分页读取。

画廊优先展示成片效果，保留精选、视频复刻、产品宣传、动态设计和口播内容五类。**551 张参考封面已下载或从原视频提取并校验**，加上三个本地示例，展示 554 条有真实封面的内容；暂时没有有效封面的 340 条保留在 MCP 目录中。视频占据卡片主体，点击放大播放；下方显示作者和可跳转的 X、Instagram、GitHub 或原始视频出处。同源片段在预览中可切换，每个版本仍对应自己的 ID。

卡片与预览同时展示**原帖播放数据和内容种类**，例如 `42K 次查看`、产品展示、开场、A-roll Cuts。已从 Hyperframes 公开清单同步 382 条有热度的记录，覆盖 X、Instagram、YouTube 和 TikTok；悬停数字可看精确数值与同步日期。没有数据的条目省略热度，同源片段不重复累计。运行 `npm run catalog:metadata` 更新快照。

点击 **一键复刻** 只复制一段简短指令：

> 请读取 http://localhost:4173/connect/guide?host=codex&template=hf-moment-M953 并在 OpenDesign 复刻模板 hf-moment-M953，完成后打开可编辑工程。

链接由当前工作区生成；详细配置、工作区目录、视频/源码、制作流程和原生 MCP 步骤放在链接里。Agent 读取真实来源后，通过 `motion_create_project`、`motion_import_assets`、`motion_edit_project` 制作可编辑的 Hyperframes 工程，检查实际预览。复制按钮不会修改当前工程，也不会把其他示例冒充复刻结果。完整来源与更新方式见 [模板目录说明](docs/template-catalog.md)。

三个可直接打开的官方示例是 **Product Promo**（20 秒产品宣传）、**NYT Graph**（15 秒动态图表）、**Decision Tree**（10 秒流程动画）。首页模板先选择再提交，内置模板创建可二次剪辑的独立工程；外部参考保存模板身份并由 Agent 制作。原工程始终保留在所属会话中。统一接入弹框仍提供精确参考的复制指令。源码、真实渲染封面与 Apache-2.0 许可证已内置，GSAP 使用本地依赖；首次使用模板字体仍可能需要联网。

新增的 [npm 轻量安装渠道](docs/npm-installation.md) 可在本地为 Codex、Claude Code、DeepSeek Harness、WorkBuddy 同时安装 MCP 与 Skills，并共用一份应用与依赖缓存，首次工程操作需要本地服务时按需准备固定媒体工具和浏览器；当前可本地构建或由 Actions 生成测试制品，不发布 npm。运行 `npm run package:npm` 构建，具体隔离安装命令与边界见专题。

需要 Node.js 22.18+ 和 npm。依赖固定为 Hyperframes **0.9.7**、GSAP **3.15.0**，并提交 lockfile。开发目录运行 `npm ci`；安装包首次启动时自动在 `MOTION_DATA_DIR/runtime/<lock-hash>/` 安装同一套依赖，不修改插件缓存或全局 npm 包。首次安装需要联网；Hyperframes 首次渲染可能下载浏览器、字体等资源。

视频渲染需要 FFmpeg 和 Chrome/Chromium，成片技术校验还需要 ffprobe。可用 `HYPERFRAMES_BROWSER_PATH`、`HYPERFRAMES_FFMPEG_PATH`、`HYPERFRAMES_FFPROBE_PATH` 指定本机程序；旧的 `FFMPEG_PATH` / `FFPROBE_PATH` 也会传给 Hyperframes，原生变量优先。渲染失败返回上游错误，未生成 MP4 不会报告完成。

开发调试：

```sh
npm ci
npm run dev
```

默认访问 `http://localhost:4173` 首页；`/?project=<id>` 或 `/#project/<id>` 打开对应项目。插件启动会校验服务版本与工程目录，避开已占用端口。Hyperframes 原生服务使用另一个回环端口；我们的服务转发原生 API、文件事件和预览请求，直接提供自有编辑器页面。视频作品仍在独立 composition iframe 中预览，以隔离 UI 样式和作品样式。

## Agent 工具

仓库 Agent 从 [AGENTS.md](AGENTS.md) 进入，Claude Code 同时读取 [CLAUDE.md](CLAUDE.md)。[motion-production](skills/motion-production/SKILL.md) 负责范围与路线：原创/大幅重编进入 [motion-director v1.4.4](skills/motion-director/SKILL.md)，已有模板出片或适配进入 [template-to-video](skills/template-to-video/SKILL.md)，参考视频复刻进入 [motion-recreate](skills/motion-recreate/SKILL.md)（先读工作区资料、最多问一次，用一期 9 个工具在编辑器工程里重建，交付成片、原片对照和可编辑工程；重建规则与测量脚本随该 Skill 一起分发）。明确要求视频转可复用模板或 ZIP 时，单独进入 [video-to-template](skills/video-to-template/SKILL.md)。已有内容的修改统一复用 [edit 流程](skills/motion-production/references/edit.md)，核对保持项及后续延续；首次补读的结果须先返回模型，再执行依赖操作。

仅有 MCP 时通过 resources/list 与 resources/read 读取 `motion://workflow/production/start`；已选专业入口直接读对应路线，无需重新选路。固定引擎指南为 `motion://engine/SKILL.md`。详见 [Skill 路由](docs/skills.md)。一期仅包含 production/director/template/recreate 四个 Skill 入口，其他兼容/独立扩展保留源码。

共享上下文列出各范围的必读依赖，Agent 只补齐尚未读取的正文，并复用同一份已读记录。这个约定不等于工具强制执行；七份 Motion 质量参考保持原有内容与风格边界。

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

全局「连接 Agent」保留 Codex、Claude Code、DeepSeek Harness 与通用 stdio 客户端的配置下载和接入指引；配置绑定当前工作区。ChatGPT 云端远程 MCP 尚未提供。

模板从 Studio 画廊或已有指引选择，当前3个 builtin 可由创建工具复制；没有单独公开目录查询 Tool。其他外部源码/视频由宿主实际检查并重建。

编辑须同时传 expectedRevision 与 expectedVersionId；文本批量/需求保存和版本恢复使用原生独占历史窗口、暂存与恢复日志。旧 `motion_write_files` 的逐文件行为仅留内部兼容。8 MiB/100文件与2 MiB分段读取是传输限制；媒体小于2 GiB/项并实际探测。恢复旧版本创建新 vN，保留后续历史。


## 本地文件与升级

一个 `MOTION_DATA_DIR` 保存多个工程和当前选择。macOS新安装默认使用 `~/Library/Application Support/OpenDesign`，保留已有插件根目录 `.motion-data/` 的兼容路径；其他平台默认在插件根目录 `.motion-data/`，建议指定缓存目录外的稳定绝对路径，并定期备份 `project/`、`projects/`、`sessions/` 和 `projects.json`。一期 MCP 数据写入必须显式 projectId，不跟随其他会话全局选择。执行原生 CLI 前重新读取该项目目录。备份还应包含 phase1/versions、phase1/retained 和原生 history root，避免丢失历史媒体。

```text
.motion-data/
  project/                 初始原生工程与素材（始终保留）
  projects/<id>/           新建或从模板复制的独立工程
  projects.json            工程列表与当前选择
  exports/                 后台导出的 MP4
  jobs/<id>/render.log      上游渲染日志；完成/失败后删除临时工程快照
  export.json              最近一次 Agent/插件导出任务状态
  preview.json             已验证的本地端口
  preview.log              插件服务日志
  studio.log               原生 Studio 日志
  runtime/                 安装包按 lockfile 安装的依赖
```

首次启动发现旧 `workspace.json` 且不存在原生工程时，会转换其素材、镜头时间、文字、位置和颜色为 HTML compositions，保留原 `workspace.json` 不动。旧版无素材的 Canvas 演示图形转换成静态背景；需要逐帧保留旧演示效果时请先在旧版导出视频。已有原生工程不会被旧 JSON 覆盖。

旧的镜头 JSON 编辑接口、Canvas 播放/录制、IndexedDB 草稿和离线 HTML 编辑页已移除。参考视频通过 Studio 或 `motion_import_asset` 导入，在原生时间轴编排；Agent 用 `data-start`、`data-duration`、`data-media-start` 表达镜头节奏。旧 `.motion.json` 文件不是新 Studio 的工程格式。

后台导出每次使用独立源文件快照，后续编辑不会改变该任务的本地输入；远程 URL 指向的媒体仍由上游获取，需稳定复现时先导入本地。当前一个工作区只运行一个插件导出任务，查询保留最近一次状态，历史 MP4 留在 `exports/`。任务最长 30 分钟，失败可读取错误和 `render.log` 后重试。Studio 自带导出面板由上游管理，任务不会出现在插件的 `motion_get_export` 中。

请求导出时从快照读取尺寸、fps 和时长，保存在任务的 `expected` 中，随后才执行后台 lint/render。完成后将该任务的 `jobId` / `revision` 交给 `motion_verify_export`，按 brief 指定 `audio: "required"` 或 `"silent"`；默认 `optional` 只允许有声或无声，不能证明要求的配音已经存在。校验覆盖 MP4/H.264/yuv420p、尺寸/帧率/时长、AAC 音轨策略、完整视频/音频解码、首中尾 seek 和文件哈希。缺少工具返回 blocked；旧任务没有快照规格时需重新导出。

保留历史文件后也可用独立脚本，参数来自存档任务和 brief，不能从待检文件反推预期值：

```sh
node --experimental-strip-types scripts/verify-export.ts /absolute/path/final.mp4 '{"width":1920,"height":1080,"fps":30,"duration":15,"audio":"required"}'
```

也可运行 `npm run verify:export -- FILE EXPECTATION_JSON`。原来的纯数字时长参数只用于旧版 540×960 / 24 fps 静音文件；原生工程使用完整规格。

技术通过后仍要检查最终画面、文案和声音，并在实际播放器完整播放、跳转和重播；没有执行的检查记录为 `not_run`。保存 brief、分镜、选择、review 与 verify 证据，以及包含本地素材和隐藏 Studio manifests 的原生工程，便于另一个 Agent 接续。

## 视频转模板与模板出片

视频转模板入口仅在要求可复用模板时使用，要求原样重建尽量匹配参考画面、构图、运动和节奏；素材与源码保持可编辑。原样使用模板时直接交付模板里的 `preview.mp4`，不重新渲染、不比对。制作模板时只检查 ZIP 解压到别处能独立渲染，不缺文件、字体和素材，帧率、帧数、时长和预览一致；不做逐帧像素比对，不为肉眼看不出的差异返工。具体规范见 [模板制作验证](skills/video-to-template/references/verify.md)。视频转模板时不向用户提问，由 Agent 自行选择最贴近原片的方案并记录在模板内唯一的说明文件 `TEMPLATE.md`；常用修改声明为变量，在 Studio Variables 面板修改；交付回复只给预览、模板、原片对照、能改什么和与原片的差异，技术检查写在 `TEMPLATE.md`；用模板生成视频时，缺少品牌、产品、价格、图片等只有用户能提供的内容，或要求有明显歧义时，Agent 会一次性提问。video-to-template 不承接普通视频复刻或直接混入修改要求；用参考视频（自己的或看中的）做用户自己的片由 motion-recreate 负责，已有模板的修改由 template-to-video 处理。

## 多 Agent 薄适配器

已有 Codex、Claude Code、DeepSeek Harness 或 WorkBuddy 的用户，可在安装机器运行 `npm run export:adapters -- <runtime绝对路径> <data绝对路径> <新output绝对路径>`，生成四家共用一份外置应用的连接包。包内包含 Skills 与文档，工程留在插件缓存外；不会自动注册客户端。WorkBuddy 使用官方 Connector 结构，桌面实测仍待完成。本机 ZIP 绑定安装路径，移动或换机器后重新生成，不能直接作为通用安装包分发。安装、升级及验收见 [多 Agent 适配器](docs/agent-adapters.md)。

## 开发与验证

**每次需求交付都必须同时更新产品文档。** 所有贡献者提交功能、优化、修复、重构或文档需求时，在同一提交或 PR 中更新受影响专题，并新增或补充 [需求记录](docs/product/changes.md)。说明服务人群、前后行为、决策理由、架构影响、画像/商业化影响和验证证据；无直接画像或商业化影响时记录原因。用户可见入口、行为或限制变化时同步更新本 README。

执行步骤见 [文档维护流程](docs/README.md)；复杂需求可使用 [需求模板](docs/templates/requirement.md)。产品知识应进入仓库正式文档，不能只留在聊天或 PR 描述中。

```sh
npm run check
npm run typecheck:studio
npm run test:studio
npm test
npm run package:plugin
```

`npm run dev` 先构建编辑器再启动服务；只改前端后可运行 `npm run build:studio` 并刷新页面。`npm run test:studio` 运行上游单元/DOM 回归与宿主集成测试；`npm run typecheck:studio` 检查前端类型；`npm run design:check` 检查主题变量与对比度。`check` 校验清单、版本、锁定依赖、技能入口、服务 TypeScript 语法及设计规范。测试覆盖原生源文件共享、并发 revision、路径隔离、旧工程迁移、Studio 编辑数据快照、真实 stdio MCP、原生 Studio HTTP 接口、完整目录与同源版本、封面筛选、短指令与参数化指南、三个官方模板的打开/编辑/切换/保留和带音轨的真实 MP4 渲染。没有 FFmpeg 或 Chrome 的机器会跳过渲染集成测试；PR CI 的 phase1-package-e2e 独立任务安装 Chromium、FFmpeg/ffprobe，重新构建并隔离安装真实ZIP，自动跑全部9个Tool；依赖缺失或测试失败直接标红，日志与MP4证据保留14天。合并阻断须同时启用main的必需状态检查，配置与边界见[测试覆盖](docs/mcp-phase1-tools.md#测试代码与ci范围)。

打包产物为 `dist/motion-0.6.2-phase1.zip`，包含运行时源码与编辑器构建产物、设计系统与字体许可、原生模板、目录与封面、技能、lockfile 和允许分发的使用文档，排除个人媒体、草稿、node_modules 和原生程序。`bash scripts/install-motion.command` 可注册并安装本地插件，并按 Codex 实际解析的启动配置验证 MCP 握手；它不会重启 Codex。代码改动和打包不会自动替换用户已安装的插件版本。

主要实现：`hyperframes.ts` 管理锁定的上游 CLI 与 Studio 进程；`workspace.ts` 管理原生文件、迁移和快照；`server.ts` 提供薄壳与后台任务；`mcp.ts` 向 Agent 暴露工具；`template-library.ts` 创建官方模板的可编辑副本，`template-catalog.ts` 提供完整参考目录及热度；`editor-server.ts` 提供自有编辑器资源并流式转发原生 API；`studio/src/motion/` 是我们的界面入口，`web/design-system/` 是共享设计规范。`shared/legacy.ts` 仅用于读取旧版工程。

Hyperframes 使用 Apache-2.0 许可证，依赖从 npm 官方包安装；其源码和许可证见[上游仓库](https://github.com/heygen-com/hyperframes)。Motion 运行的上游进程默认关闭匿名遥测。

后续改造入口、源码边界和适配说明见 [编辑器开发指南](docs/editor-fork.md)。

## Template production and reuse

The source retains `video-to-template` and `template-to-video` independently to the team base. The standard workflow sections, gallery, template IDs and preview instructions keep their team behavior. The default interfaces no longer scan a custom local `template.json` library or expose `motion_save_template`. Existing project/template files are not deleted: pass the complete folder or ZIP directly to Codex for reuse. Projects remain native HyperFrames source plus local assets and preview. These extension Skills and comparison Tool are not exposed in phase-one distributions; human review decides visual acceptance.

The plugin name, install script, data directory and Studio ports are the team base, unchanged by this extension. See [scope](docs/motion-extension-scope.md).

内部兼容诊断 `motion_compare_video`（一期不公开）接受视频绝对路径，候选还可用 `latest-export`。工程先导出再比较；执行错误与画面差异分别返回，指标不代替人工视觉验收。
