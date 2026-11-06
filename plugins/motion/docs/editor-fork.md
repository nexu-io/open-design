# OpenDesign 编辑器开发

当前产品能力与维护规则见 [产品架构](product/architecture.md) 和 [文档中心](README.md)。

编辑器前端完整迁入本仓库，上游为 Hyperframes 0.9.7，commit `3baf81f9a92615507f76fe8de33e489034ee77ec`。`studio/` 包含原版 `src`、`public`、测试和测试素材，Apache-2.0 许可保存在 `studio/LICENSE`。运行时使用本地源码构建的编辑器。

## 功能与集成边界

原版组件负责 Compositions、Assets、Code、Catalog、Preview、Design、Layers、Renders、Variables 和 Blur。素材上传与预览、跨工程素材、画布编辑、音视频属性、关键帧、缓动、时间轴、保存、撤销与 WebMCP 沿用上游实现。布局继续由原生 Dock 管理拖动、分组、缩放、关闭、最大化和按工程持久化，不按屏宽强制合并面板。

OpenDesign 的 `WorkspaceFrame` 放在原生 App 外，负责通用导航和会话列表；`MotionSessionFrame` 将会话与浏览器顶格并列。完整原生 App（包括工程顶栏）放在浏览器 Artifact Tab 内；原生 `AppFrame` 仅向外层注册保存与写入门禁，不再用 `EditorFrame` 组织会话。浏览器关闭、恢复不会重挂载编辑器；跨工程则等待保存并整页重建，避免复用原生全局状态。全局工具（Agent、模型设置、主题、语言）位于侧栏，导航折叠在会话顶部；无全局面包屑顶栏。工程工具包括工程名、保存、模板、历史、预览、布局和导出。会话名与工程名分开。详见 [会话与 Artifact 浏览器](project-workspace.md)。

「预览」是常驻恢复入口：关闭后显示「打开预览」，重新打开回到两侧面板之间，时间轴回到整行底部。恢复时也会退出其他面板的最大化状态。「布局」菜单可以切换所有面板、应用代码创作/专注预览预设或恢复默认布局；这些操作直接调用同一 Dock，不建立第二套布局状态。

「历史」与项目旁的保存状态均可打开「版本历史」面板。该面板使用原生 `/api/projects/:id/history` 列表、checkpoint、pin 和 restore；支持查看修改文件、筛选保留版本、保留当前版本和恢复历史版本。保存状态读取原生待保存队列；恢复前等待保存并 checkpoint，恢复后重新加载编辑会话。恢复本身产生一条新记录，原来的修改仍在历史中，可继续通过原生撤销/重做操作。渲染或写入冲突期间禁用版本写操作。

「版本历史」Tab 是本地新增的 UI，所调用的历史、撤销/重做、保留与恢复服务来自 Hyperframes；没有另建版本数据存储。

侧栏底部语言菜单支持简体中文和 English，默认中文，偏好保存在 `motion.studio.locale`。`studio/src/i18n/I18n.tsx` 提供上下文与插值，英文源文案作为 key 和回退，中文集中在 `zh-CN.json`。新增 UI 文案通过 `useI18n().t(message, values)` 使用；数量复数在语言层处理，日期和数字使用 Intl。宿主外的原版组件默认英文，便于继续复用。只有展示标签被翻译，工程名、素材路径、属性值、视频文字和 Agent/API 标识不变。切换语言不会重新挂载编辑器；Dock 只更新标题，不重建布局或预览。播放条样式使用独立 data 属性，不依赖可翻译的 aria-label。主分支的统一 MCP/模板弹框保留原有流程与目录，内部文案目前以中文为主，尚未纳入完整双语覆盖。

顶栏 Export、合成列表 Render 和 Renders 面板均使用原版渲染队列，保留格式、分辨率、帧率、质量、取消、进度、历史、预览与下载。插件 `motion_request_export` 仍提供独立的后台快照渲染，供 Agent 使用；不会替代界面的原生导出。

品牌宿主隐藏上游桌面下载推广与反馈邀约，相关上游组件仍保留在源码中。Studio 的原生暗色/浅色偏好由 `hf-studio-ui-preferences` 管理；`data-theme="paper"` 为浅色，无属性为暗色。设计系统变量映射到这一机制，不再使用第二套编辑器主题状态。

前端可以直接修改。CLI 服务、core、parsers、player、SDK 与渲染器使用锁定的 0.9.7 npm 包，并未复制整个 monorepo。桌面端的宿主功能以开源 Studio 的实际能力为准。

## 修改入口

先用 [产品架构](product/architecture.md#职责分层与依赖方向) 判断需求归属；多模态入口、原图修改和后续属性面板接入遵循 [素材生成设计](product/media-generation-design.md)。该设计记录用户意图、候选采用、原生历史与过期目标的边界，本页维护实现位置。

模型设置位于顶栏，空时间轴、时间轴工具栏和素材面板共用 `MediaGatewayProvider`。生成面板读取已选时段，提供模态/模型/参数与任务结果，显式放置才调用原生 `useTimelineAssetDropOps`，沿用撤销与保存。上下文绑定会在工程/合成切换及卸载时失效。素材菜单增加可见入口、预览和下载，其他操作继续使用原生文件服务。模型协议与限制见 [模型网关](model-gateway.md)。

`TimelineMediaBar` 订阅原生片段选择、已完成的范围选择和标尺点击，在时间轴上方就地显示描述/生成/修改入口；原有范围 Agent 弹框通过「交给 Agent」继续使用。图片修改传 `referenceAsset`，结果选择后通过 `handleDomAttributeBatchCommit` 只改 `src`，在文件队列内的 `validateContent` 检查修改前的原始引用，保留原生历史、时长与动画。`prepareContent` 用于服务端已执行 patch 后的后处理，不能用作修改前验证。不要绕过该提交链整页重写 HTML，也不要在工程切换后恢复旧选区。

| 需求 | 入口 |
| --- | --- |
| 首页与共享会话列表 | `studio/src/motion/MotionApp.tsx`、`MotionHome.tsx`、`WorkspaceFrame.tsx`、`workspace.css` |
| 工程保存门禁、MCP 与模板入口 | `studio/src/motion/MotionStudioHost.tsx`、`WorkspaceFrame.tsx`、`useWorkspace.ts` |
| 网页浏览器 | `browser.ts`、`shared/browser.ts`、`studio/src/motion/WebBrowser.tsx`；见 [浏览器架构](browser-runtime.md) |
| 创作会话、需求持久化、编辑器分栏 | `studio/src/motion/MotionSessionFrame.tsx`、`ProjectConversation.tsx`、`artifactBrowser.ts`、`shared/session.ts`、`shared/conversation.ts` |
| 首页分类模板与精确复刻 | `studio/src/motion/HomeTemplates.tsx` |
| 宿主插槽 | `studio/src/motion/StudioHost.tsx`、`studio/src/components/StudioHeader.tsx` |
| 模型设置、生成面板、时间轴桥接 | `studio/src/motion/ModelSettings.tsx`、`MediaGenerator.tsx`、`MediaGatewayContext.tsx`、`MotionTimelineMedia.tsx` |
| 时间轴就地生成与图片修改 | `studio/src/motion/TimelineMediaBar.tsx`、`timelineMediaSelection.ts`；挂载于 `Timeline.tsx` 的原生 Provider 内 |
| 共享生成合约与服务 | `shared/gateway.ts`、`gateway/`、`server.ts`、`mcp.ts` |
| 原生 Capture、Inspector、Export | `studio/src/components/StudioHeader.tsx` |
| 模板画廊、视频预览、出处与热度 | `web/template-gallery.ts`、`web/template-gallery.css`、`template-catalog.ts` |
| 内置原生模板与工程副本 | `template-library.ts`、`template-library/` |
| MCP 与模板统一弹框、配置下载与 Agent 指引 | `studio/src/motion/ConnectionDialog.tsx`、`web/connect.*`、`shared/integration.ts` |
| 设计变量 | `web/design-system/tokens.json`，执行 `npm run design:tokens` |
| 编辑器主题 | `studio/src/motion/theme.css` |
| Dock 与面板注册 | `studio/src/components/dock/` |
| 顶部预览恢复与布局预设 | `studio/src/motion/MotionLayoutControls.tsx` |
| 版本历史面板与原生历史 API | `studio/src/motion/MotionHistoryPanel.tsx` |
| 中英文文案、格式化、语言菜单 | `studio/src/i18n/` |
| 时间轴、片段、关键帧 | `studio/src/player/` |
| 画布、属性与动画编辑 | `studio/src/components/editor/` |
| 素材、合成、Catalog | `studio/src/components/sidebar/` |
| 原生导出队列 | `studio/src/components/renders/` |
| 保存、历史、预览刷新 | `studio/src/hooks/` |
| 浏览器 Agent 工具 | `studio/src/webmcp/` |
| 原生 API 转发 | `editor-server.ts` |
| 工程切换、模板与后台导出 | `server.ts`、`workspace.ts` |

## 服务与工程

`/motion-api/` 为产品 API，`/api/` 为原生 Studio API。流式代理保留文件版本头、上传体、媒体 Range、SSE 文件变化和渲染进度；只有通过本机 Host/Origin 检查的请求才会转发。

切换工程前等待原生保存队列完成，切换后重新加载文档以释放旧编辑会话。原生渲染、版本写入或写冲突期间，所有入口禁止新建、切换工程、返回首页或应用模板。空白项目和三个官方模板均创建为独立工程，原工程与素材保留。通过 URL 恢复工程时先选择服务再挂载 Studio；代理拒绝旧工程 ID 的原生请求。

新工程使用 CLI 默认的官方 Catalog。启动旧工程时，只移除先前版本误写的 `https://hyperframes.heygen.com/registry`，该地址返回 404；用户自定义 Registry 与其他配置不变。

UI 主题不会写入影片 HTML、CSS、GSAP 或 Studio 编辑数据，预览与导出均由原版播放器和渲染器处理。MCP 仍共享同一组原生文件与 revision。

## 构建与验证

```sh
npm ci
npm run dev
npm run build:studio
npm run typecheck:studio
npm run check
npm run test:studio
npm test
npm run package:plugin
```

生产页面使用 `studio/build/`，前端修改后重新构建并刷新。该目录不提交；插件 ZIP 包含运行时源码、构建产物、使用文档和许可证，不包含个人工程、依赖目录或 sourcemap。

`test:studio` 启用完整上游单元与 DOM 测试。迁移适配只涉及包路径、独立仓库样式入口、Happy DOM 21 的 iframe 开关、异步弹层收尾，以及由 jsdom 验证的 WebKit 文本填色。原版 Chrome bench 和 E2E 文件保留，`*.browser.test.ts` 不属于该单元命令。

`npm test` 覆盖原生 API/MCP 双向编辑、revision 冲突、路径隔离、上传、媒体 Range、SSE、工程切换、模板与真实音视频渲染。Registry 迁移测试保证自定义配置不被覆盖。宿主顶栏测试保证 Export 继续走原版回调，渲染中禁止替换当前工程。

布局回归测试覆盖关闭预览后刷新重开、全部面板关闭、最大化恢复与布局预设。历史集成测试使用真实服务验证保留版本在重启后仍存在，恢复不删除后续记录，并可撤销恢复。面板测试覆盖保存失败与原生恢复拒绝，确保失败时不重新加载或替换工程。

侧栏 Agent 和编辑器模板入口使用同一个弹框，提供 Codex、Claude Code、DeepSeek Harness 和通用 stdio 客户端的配置与指南。配置中的数据目录、Node 路径和端口来自当前运行服务；ChatGPT 云端接入尚无远程端点。`motion_list_templates` 搜索完整目录，`motion_get_template` 读取精确参考，`motion_apply_template` 只应用本地原生模板并创建独立工程。外部参考由 Agent 分析后写入可编辑原生源文件。数据、封面与热度的维护见 [模板目录](template-catalog.md)。

i18n 测试覆盖语言偏好、存储不可用、跨窗口同步、插值和复数，以及切换语言时保持 Dock 分组、面板尺寸、预览 iframe 和原生属性提交值。
