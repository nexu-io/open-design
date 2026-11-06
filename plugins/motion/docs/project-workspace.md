# OpenDesign 会话与 Artifact 浏览器

当前模型以通用会话与独立 Artifact 组织创作；会话与视频工程分别持久化。

## 用户问题与产品关系

服务已有 Agent 用户和需要继续手工编辑的创作者。用户需要围绕一项创作保持对话，同时打开、切换或关闭多个编辑产物；工程工具栏不能成为会话的上级。

**会话是父级，Motion 工程是会话的产物。** OpenDesign 使用通用会话、模式注册表、模板与 skill 的结构。一期仅开放 Motion：对应 `motion-production` skill、Motion 模板目录和 `motion-project` 产物。其他模式是已确认的扩展方向，当前没有图片、网页等创作模式的执行能力。网页 Tab 只是浏览功能，不代表另一种生成模式。

会话的 Agent 推理与工具编排仍由已连接的外部 MCP 客户端负责。网页保存用户需求和产物关系，提供会话专属的「复制给 Agent」，不会把保存需求显示为模型已经执行。当前不包含内置聊天 Agent 运行器；外部 Agent 可以通过同一消息 API 或 `design_append_message` 写回真实回复，网页轮询展示，不自动抓取宿主聊天记录。Motion Viewer 内的素材生成则由共用 [Model Gateway](model-gateway.md) 执行。

右侧浏览器关闭、切到网页 Tab 或窄屏切回会话时，所属 Viewer 的时间轴菜单和媒体生成浮层也隐藏。恢复 Viewer 后可继续编辑，未提交的生成描述保留；已提交的媒体任务仍在后台运行。

参考 Personal video agent 的 `workspace-sidebar.tsx`、`creation-home.tsx`、`editor.tsx` 与 `responsive-layout.ts`。用户指定工作树只有初始空提交，因此读取同仓库现有实现核对布局与测试思路，参考仓库没有修改。

## 首页与会话流程

- `/` 展示新建创作、最近会话、Motion 分类模板和输入框，不展示宣传标题或解释段落。输入框的模式选择器一期只有 Motion。
- 模板「使用模板」先将精确模板 ID 加到输入框；点击「开始会话」先保存会话与初始需求，再请求生成产物；生成失败保留会话以便继续提问或重试。内置模板创建独立原生工程副本；外部参考保存模板身份并创建空白工程，之后由 Agent 按参考制作。仅内置模板标记「可以二次剪辑」。不输入文字也可提交已选模板，服务保存对应模板请求。
- 大尺寸「新建创作」与侧栏「新建会话」直接建立 Motion 会话及空白工程，进入后可上传视频、图片、音频。空白默认 1920×1080、30fps、10 秒；默认值不是编辑器限制。
- 最左侧列表共享全部会话，按最近打开时间排序，可搜索。会话名在对话区顶部修改；工程名在相应 Artifact Viewer 内修改，两者互不覆盖。
- 会话顶部按钮负责完全收起和恢复全局列表；会话隐藏时入口在浏览器顶部，首页在左上角，品牌旁的重复箭头已移除。桌面列表宽 224px；760px 以下使用抽屉。品牌、标题与接入页展示 OpenDesign，`motion` 插件标识、MCP 工具前缀、环境变量与旧配置保持兼容。

## 浏览器与编辑器的从属关系

不再保留全局面包屑/设置顶栏。左侧会话与右侧浏览器窗口顶格并列，标题栏与标签栏同色、中间有细分隔线。连接 Agent、模型设置、主题和语言在侧栏；嵌入视图的模型设置仍在编辑器内。Motion 编辑器完整位于右侧 Tab 内，包括工程名、保存状态、项目工具、Dock、预览和时间轴；这些不是全局会话工具。

- 关闭右侧浏览器窗口后，保留其 Tabs，展开完整会话；「打开浏览器」恢复。
- 浏览器标签栏最右侧、关闭按钮左边的「展开浏览器」收起会话，让浏览器占满主区域；同一位置的「展开会话」恢复原会话宽度。会话标题栏不再放浏览器展开按钮。两边不能同时隐藏；关闭最后一个 Tab 自动回到会话。
- 新建 Tab 可以打开本会话已有产物、建立另一个 Motion 工程或输入 HTTP(S) 地址。一个产物重复打开会激活已有 Tab。网页由独立本地 Chromium 承载，支持输入网址、前进/后退、刷新/停止、点击、滚动与文字输入；地址与标题随真实导航更新。从 Motion 地址栏输入网站时保留原产物 Tab，新建网页 Tab。会话隔离、配置与当前限制见 [浏览器运行架构](browser-runtime.md)。
- 打开其他会话的工程必须通过会话列表；地址栏拒绝把其他会话的产物挂到当前会话。网页脚本不能取得同源的本地编辑器权限。
- 关闭浏览器、切换 Tab 前等待原生保存。保存失败保留当前视图；渲染、版本操作或写冲突期间禁止切换。隐藏编辑器时暂停预览，保持组件挂载以保留时间轴与面板状态。
- 会话默认宽 340px，可拖动或用方向键调整到 280–480px，且不超过可用空间的 42%。主区域不足 900px 时用「会话 / 浏览器」切换单一表面，始终有一个可见区域。

浏览器偏好按会话保存在 `opendesign.artifact-browser.v1:<sessionId>`，包含最多 30 个 Tabs、活动页、面板可见性、宽度和窄屏表面。原生 Dock 继续按工程保存布局。关闭 Tab 不删除产物或工程。

## 嵌入与调用兼容

`embed=1` 隐藏全局侧栏、会话和浏览器外框，只显示 Artifact Viewer，适用于 Codex 内置浏览器；`sidebar=0`、`conversation=0` 可分别配置初始隐藏。完整与嵌入链接指向同一会话和产物，不复制数据，也不覆盖完整视图偏好。MCP 创建、应用模板、打开产物/预览默认返回带 `embed=1` 的 `previewUrl`，同时提供完整 `sessionUrl` 和 `embeddedPreviewUrl`；显式 `embedded=false` 可选择完整工作区。模板复刻后宿主必须保留返回 URL 的查询参数和工程路由。无产物的会话仍保留生成入口，避免空白视图。技术协议与扩展步骤见 [会话技术架构](session-architecture.md)。

## 数据与兼容

`projects.json` 同时保存工程索引 `projects/activeId` 与通用会话索引 `sessions/activeSessionId`，同一锁内原子写入。会话包含 `id/title/mode/templateId?/artifacts/activeArtifactId` 与创建/打开时间；产物包含独立 `id/kind/projectId/title/templateId?`。新会话 ID、产物 ID 和工程 ID 分离，每个工程只属于一个会话。

已有目录没有 `sessions` 时，按旧工程 ID 兼容为一工程一个会话；保留 `sessions/<旧id>.json` 的需求、工程文件及原生历史，下一次目录写入时持久化关系。旧书签 `/?project=<id>#project/<id>` 和 `/#project/<id>` 仍解析为所属会话。新链接使用 `/?session=<sid>&project=<pid>#project/<pid>`，只带 session 时恢复该会话最后选中的产物。

初始工程位于 `project/`，新增工程在 `projects/<uuid>/`。用户需求与外部 Agent 写回的真实回复位于 `sessions/<sessionId>.json`；每条最多 8000 字符，每个会话最多 200 条消息，UUID 去重保障不确定网络结果可重试。未提交草稿按会话保存在本机浏览器。会话元数据、重命名和需求不改变视频 revision 或导出快照。

| 接口 | 行为 |
| --- | --- |
| `GET /motion-api/modes` | 当前模式及 skill / 产物类型 |
| `GET /motion-api/projects` | 工程索引、会话索引与当前选择 |
| `POST /design-api/sessions` | 先保存模式、可选模板和初始需求，允许没有产物的会话 |
| `GET /motion-api/sessions/:id` | 会话、模式、产物与需求 |
| `PATCH /motion-api/sessions/:id` | 重命名会话；工程名不变 |
| `POST /design-api/sessions/:id/messages` | 追加真实用户需求或 Agent 回复，按消息 ID / 角色 / 内容去重 |
| `POST /motion-api/sessions/:id/open` | 打开指定的所属工程，省略时恢复上次产物 |
| `POST /motion-api/sessions/:id/artifacts` | 创建本会话的空白或内置模板工程 |
| `PATCH /motion-api/projects/:id` | 重命名工程；会话名不变 |

旧 `/projects` 创建、打开、conversation 及 `/templates/:id/open` 入口继续兼容；旧 conversation API 解析到工程所属会话。新建/切换使用 `expectedRevision` 和 `expectedProjectId` 防止竞争。

通用接口命名空间为 `/design-api`，`/motion-api` 保留别名。MCP 的 `design_create_session` 先建会话再按需生成产物；`design_create_artifact` 向已有会话生成；`design_get_session` 读取会话与 skill，`design_open_artifact` 校验归属后选择已有产物。`motion_get_project` 同时返回 `session`、`projectId` 和兼容 `conversation`；`motion_apply_template` 在指定或当前会话添加工程。Agent 写入前应先确认会话与产物身份，再使用最新 revision 操作。macOS 多个 MCP 连接按数据目录共用后台，但每条连接保留自己的工程选择，网页切换不改变已有绑定；工作区原生 Studio 仍只打开一个活动工程。详见 [共享编辑器](shared-editor.md)。

一个本地服务仍只有一个活动原生工程；多个 Artifact Tabs 是可切换的工程入口，不是同时运行多套编辑器。跨工程切换时创建候选 Studio、重查 revision、原子发布目录，再整页重建；失败保留原工程。旧工程原生 API 请求被拒绝，避免写入新目录。其他客户端切换时当前会话页跟随新的活动会话，首页保持首页。

## 验收与待验证项

服务回归覆盖旧数据兼容、多产物归属、最后产物恢复、命名隔离、需求去重、MCP 身份与保存竞争。DOM 和状态测试覆盖保存等待与失败、相邻工程 Tab 切换、关闭/恢复两侧、最后 Tab、无效 URL、模板提交和窄屏可见性。浏览器实际检查结果记在[需求记录](product/changes.md)。

待验证：真实创作中的会话查找效率、多个产物之间切换与模板二次剪辑的完成体验，以及之后其他模式的 skill、工具与产物协议。没有新增用户研究或付费证据；不改变当前账号、权限和商业化能力。
