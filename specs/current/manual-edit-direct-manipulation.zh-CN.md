# Manual Edit 直接操纵升级(v2)

本文记录 HTML 编辑模式的第二阶段能力:在 v1(选中 + 属性面板 + 行内文本)的基础上,把画布升级为 Manus 级的直接操纵编辑器。v1 需求见 `manual-edit-mode-requirements.md`;该文档中"Drag-and-drop layout editing 属于 non-goal"的约定自本阶段起废止。

## 能力总览

| 能力 | 交互 | 持久化路径 |
| --- | --- | --- |
| 选中框 + 动作条 | 点击元素出现宿主侧蓝框,框上方浮动动作条(复制/删除;图片额外有替换/裁剪) | `duplicate-element` / `remove-element` / `set-image` patch |
| 复制元素 | 动作条按钮或 Cmd/Ctrl+D;副本插入原元素之后 | `duplicate-element`(克隆剥离全部 `data-od-*` 身份属性,渲染时重新标注;path id 可推导时自动选中副本) |
| 删除元素 | 动作条按钮或 Delete/Backspace | `remove-element` |
| 宽度拉伸 | 选中框左右两侧触点拖拽;左触点保持右缘锚定 | `set-style`(width;左触点附加水平位移;`display:inline` 元素同步升级 `inline-block`,否则 width 被 CSS 忽略) |
| 自由移动 | 选中框顶部触点拖拽;拖拽中显示红色虚线对齐参考线并吸附(边缘+中线,阈值 5px) | `set-style`(absolute/fixed → left/top;流式元素 → `position:relative` + left/top 偏移,不回流兄弟节点) |
| 行内文字编辑 | 点击文本元素落光标(含仅内联子标记的元素) | 纯文本 → `set-text`;产生内联标记 → `set-inner-html`(宿主侧消毒) |
| 浮动文字工具栏 | 选中文本/链接元素时出现:字号、B/I/U/S、对齐、字间距/行高、颜色 | 元素级 → `set-style`(即时预览 + 800ms 防抖自动落盘);会话内选区 → iframe `execCommand`,提交时走 `set-inner-html` |
| 图片替换 | 动作条按钮,文件选择后上传 | 上传至项目 → `set-image` |
| 图片裁剪 | 动作条按钮进入裁剪模式:遮罩 + 8 触点裁剪窗;确认后按原始像素裁切 | 宿主 fetch 原图 → canvas 裁切 → 上传新 PNG → `set-image`(原资产不动,undo 无损) |
| Undo/Redo | 画布左上角按钮簇 + Cmd/Ctrl+Z、Shift+Cmd/Ctrl+Z(iframe 内按键由桥转发) | 既有全量快照栈;每次手势/补丁 = 一条历史 + 一个文件版本(daemon `.file-versions` 存储) |

## 架构决策

1. **选中框/手势在宿主侧,不在 iframe 内**。复用 `manualEditFloatingPanelStyle` 同源的 rect×scale 坐标换算;拖拽用 pointer capture,预览经 `od-edit-preview-style` 流入 iframe,提交复用 pending-style 管线(`handleManualEditStyleChange` → `flushManualEditStyleSave`),因此每个手势天然可撤销并产生版本。几何与吸附逻辑抽为纯模块 `apps/web/src/edit-mode/gestures.ts`,可单测。
2. **富文本走"会话升级"**。会话默认 `contenteditable=plaintext-only`;首个格式命令(`od-edit-format`,execCommand + styleWithCSS)升级为 `true`。提交时元素若出现子元素,桥自动升级为 `od-edit-html-commit`,宿主用新 patch `set-inner-html` 持久化,消毒(script/on*/javascript:/构建期注解)后写入。文本类判定放宽为"内联格式子树"(`MANUAL_EDIT_INLINE_TEXT_TAGS`);`<a>`/块级子元素仍是 container。
3. **键盘转发**。画布点击后焦点在 iframe 内,宿主监听不到快捷键;桥在无会话时把 Cmd/Ctrl+Z(±Shift)、Delete/Backspace、Cmd/Ctrl+D 转发为 `od-edit-history` / `od-edit-delete-request` / `od-edit-duplicate-request` 消息。会话内 Cmd+B/I/U 由元素级 keydown 处理(不受 keyboard guard 拦截)。
4. **set-style 不重载 iframe**,手势提交后宿主发 `od-edit-refresh-targets` 让桥重播 targets,选中框与吸附候选保持新 rect;滚动时桥防抖重播。
5. **面板行为不变**(e2e 契约):点击仍会打开右侧属性面板;新 chrome 是叠加层。桥内 CSS 收敛为 hover-only 描边,选中框视觉交给宿主层,避免双框。

## 消息协议增量(bridge ⇄ host)

- bridge → host:`od-edit-html-commit {id,value}`、`od-edit-text-selection {id,hasRange}`、`od-edit-history {op}`、`od-edit-delete-request {id}`、`od-edit-duplicate-request {id}`
- host → bridge:`od-edit-format {command,value}`、`od-edit-refresh-targets`
- `ManualEditStyles` 增补:`fontStyle`、`textDecorationLine`、`position/left/top/right/bottom/zIndex`(桥内 styleProps 字面量需同步)

## 样式规范

新组件均为 CSS Modules(`ManualEditSelectionOverlay.module.css`、`ManualEditTextToolbar.module.css`),使用既有 token(`--bg-panel`/`--border`/`--text`/`--radius`)、编辑态强调色 `#2563eb`、对齐线 `#ef4444`、`cubic-bezier(0.23,1,0.32,1)` 入场动效(160–200ms,scale ≥0.9 起)。层级:参考线 < 选中框(29)< 面板(30)< hover/undo 簇(31)< 文字工具栏(32)。

## 测试映射

- `apps/web/tests/edit-mode/gestures.test.ts` — 移动/拉伸矩形、吸附与参考线、样式解析(absolute vs 流式)。
- `apps/web/tests/edit-mode/source-patches.test.ts` — `duplicate-element`(克隆位置、身份剥离、fragment 形状)、`set-inner-html`(格式保留、消毒)。
- `apps/web/tests/edit-mode/bridge.test.ts` — 文本类判定、富文本会话升级/提交/取消、键盘转发、targets 重播。
- `apps/web/tests/components/manual-edit-kind.test.ts` — 分类不变量更新为"内联格式=text、交互/块级=container"。
- e2e `app-manual-edit.test.ts` 既有断言(点击选中→面板、set-text 落盘)保持不变。

## v2.1 修订(性能 + 交互打磨,2026-07-17)

用户实测反馈驱动的六项修订;决策 5(面板行为不变)在本轮被**推翻**。

1. **拖拽跟手**。手势引擎改为单 rAF 管线:pointermove 只记录坐标,每帧一次计算吸附 + **命令式**更新选中框 DOM(不再每次 move 走 React setState)+ 一条预览消息。移动手势的预览改为 `transform: translate()`(纯合成器,不触发 iframe 逐帧重排),松手时在**同一条**预览消息里应用最终 left/top 并清空 transform(`handleManualEditStyleChange` 的 `previewExtras` 参数),无闪跳。参考线仅在签名变化时 setState。拖拽期间文字工具栏隐藏(`onGestureActiveChange`)。
2. **百分比定位修复**(拖右跳左 bug)。根因:桥的 `stylesFor` 内联优先,`left:43%` 被宿主按 43px 叠加增量。桥现在对 `position/left/top` 上报**解析后的 px 使用值**(computed;`auto` 时用 offsetLeft/Top − margin 回退,fixed 用 boundingClientRect),手势数学永远在 px 域。类定位(position 来自 stylesheet)也因此正确。
3. **Undo/Redo 原地回退,不再闪屏**。`undoManualEdit`/`redoManualEdit` 不再无条件换 `manualEditFrozenSource`(= srcDoc 重载 = 白闪 + 脚本重跑)。可逆补丁原地回放:`set-style` 走预览通道恢复触及键;`set-text/set-inner-html/set-link/set-image` 从目标 source 提取该元素 outerHTML,经新消息 `od-edit-apply-dom {id,html,version}` 原地换元素,桥回 `od-edit-apply-dom-result {version,ok}`(800ms 超时);结构性补丁(duplicate/remove/outer-html/token/full-source)或 ok:false 才回退重载。
4. **Undo/Redo 迁至预览工具条**(编辑开关旁,仅编辑模式显示),不再悬浮在画布左上角遮挡内容。testid 不变(`manual-edit-undo`/`manual-edit-redo`)。
5. **浮动条永不出界**。工具栏/动作条自测宽度,`manualEditClampedCenter`(纯函数)钳制中心点;上方放不下时翻转到元素下方,并按画布高度钳制。颜色 popover 右对齐锚定。
6. **属性面板改为按需打开**。点击元素只出轻量 chrome(选中框 + 动作条 + 文字工具栏);面板经动作条新按钮(`manual-edit-open-inspector`,sliders 图标)或 hover affordance 打开;关闭面板保留选中。e2e/组件测试助手已更新为两步流。
7. **工具提示 + 快捷键提示**。所有 chrome 按钮接入全局 `od-tooltip`/`data-tooltip`(TooltipLayer,即时深色气泡);带快捷键的按钮在提示中追加平台化快捷键(`edit-mode/shortcuts.ts`:⌘Z vs Ctrl+Z 等)。
8. **Manus 风格取色器**(`ManualEditColorPicker` + `edit-mode/color.ts` 纯色彩数学):SV 面板 + 色相/透明度滑条 + HEX/不透明度输入 + 常用色行,替换原生 `<input type=color>`;"A" 按钮下划线显示当前实际颜色(draft → computed 回退)。透明色输出 rgba(),不透明输出 hex。工具栏连发操作(滑条/取色拖动)在宿主端 leading+trailing rAF 合并(`handleManualEditToolbarStyle`),每帧至多一次 draft 更新 + 一条预览消息。
9. 新 i18n 键:`manualEdit.commonColors/hue/opacity`(19 locale 全量)。

新增测试:`edit-mode/shortcuts.test.ts`、`edit-mode/color.test.ts`、gestures 钳制用例、bridge `od-edit-apply-dom` 原地换元素/失败 ack 用例、FileViewer「undo 原地回退不换 srcdoc」回归用例。

## v2.2 修订(选取与手势修复,2026-07-17)

用户实测三项反馈;修订 6 的「hover affordance」自本轮起移除。

1. **inline 元素宽度拉伸生效**。根因:文本常被包在 `<span>`(`display:inline`)里,手势管线把 `width` 正确落盘到源码,但 CSS 对 inline 盒忽略 width,视觉零变化("拖拽左右没办法改")。`manualEditResizeStyles` 现在读取桥上报的 computed `display`,遇 `inline` 在预览与提交里同步写入 `display:inline-block`。`ManualEditStyles`/桥 styleProps 字面量增补 `display` 键。
2. **Chrome picker 式子元素选取**。点击/hover 解析(`closestTarget`)本就取"命中点向上最近的 source-mapped 元素",瓶颈在 `MANUAL_EDIT_DISCOVERY_SELECTOR` 缺标签:`canvas`(生成式艺术卡里最常见)、`svg`、`video`、`audio`、`picture`、`hr`、`time`、`address` 及内联格式标签(`u/s/strike/sub/sup/abbr/font/cite/q/kbd/samp/var/ins/del/dfn`)不可命中,点击只能爬到父卡片。选择器补全后,srcdoc 标注(`annotateManualEditSourcePaths`)、targets 广播与点击解析同源生效,任意层级子元素可直接选中。
3. **hover 虚线 / 选中实线,移除 hover 设置图标**。桥内 CSS:hover 描边改 `1.5px dashed`(并以 `:not([data-od-edit-selected])` 跳过已选中元素避免闪烁);选中保持实线(宿主选中框 + 桥内 1px solid)。宿主侧悬浮的「编辑参数」图标(`manual-edit-hover-open`)整体移除——面板入口收敛为动作条 sliders 按钮;`od-edit-hover` 消息保留在协议里但宿主不再消费。

新增/更新测试:gestures「inline 升级 inline-block / 非 inline 不动」、bridge「canvas 直接选中不爬卡片」「hover 虚线 + 选中实线样式」、FileViewer manual-edit 测试改为「hover 零宿主 chrome」两步流。

## v2.3 修订(AI 编辑协同 + 剪贴板/拖放 + 手势保真,2026-07-17)

用户实测第三轮,六项;v2.1 修订 6 的「hover affordance 打开面板」通道已随 v2.2 移除,本轮进一步收敛工具栏为单层。

1. **编辑模式 ↔ AI 会话编辑源同步**。根因:`manualEditFrozenSource` 在退出编辑模式时不清空,freeze effect 只在 `=== null` 时捕获,二次进入复用首次会话的旧快照,AI 期间的改写全部不可见。修复分两层:(a) `!manualEditMode` 清理块释放 frozen + `manualEditOwnSourceWriteRef`,每次进入都以当下文件冻结;(b) 编辑模式开着时新 follow effect 跟随**外部**改写(agent run、另一会话)进 frozen——自己的 set-style/undo/redo 写盘经 `manualEditOwnSourceWriteRef` 豁免(否则每次样式保存都会重载 iframe);保存中/待保存样式/文字会话/手势中推迟,交互结束由 `manualEditIdleTick`(会话结束、保存 finally、草稿取消时自增)触发补跑。閉环 = manual 改动实时落盘 → AI 基于其上改 → Edit 基于 AI 结果继续。
2. **元素级 Cmd/Ctrl+C / +V**。复制 = 桥在无文字选区时转发 `od-edit-copy-request`(有高亮文本则让原生 copy);宿主存该元素的**源码 outerHTML**(非运行时 DOM)。粘贴 = 桥经原生 paste 事件转发 `od-edit-paste-request`,宿主用新 patch `insert-html` 在锚点(当前选中 → 被复制元素 → `__body__` 追加)之后插入**全新元素块**;消毒(同 innerHTML 通道)+ 剥离全部 `data-od-*` 身份,path 锚点时选中权交给新块(duplicate 同款推导)。
3. **图片粘贴/拖放上传**。剪贴板图片(即使文字会话中——纯文本会话消费不了图片)与 OS 文件拖放(drop 点最近可选元素为锚)都经 `od-edit-paste-image {id, name, mime, buffer}` → 宿主重建 File、复用 `uploadManualEditImageFile` 上传 → `insert-html` 插入 `<img src style="max-width:100%">`;新图片元素与既有目标同权(拖/删/复制)。桥内 dragover 需 preventDefault 才能收到 drop。**必须传字节而非 File 句柄**:剪贴板/拖放的 File 在事件回合结束后可能被 Chrome 失效,postMessage 克隆的句柄上传时报 `net::ERR_UPLOAD_FILE_CHANGED`("upload request failed");桥在事件回合内 `file.arrayBuffer()`(FileReader 兜底)读出字节再发。
4. **工具栏单层互斥**。选中元素(含 caret 落入)只出动作条;拉出文字选区(`od-edit-text-selection hasRange`)时只出文字工具栏、动作条隐藏(`actionBarHidden` prop);选区消失回到动作条。工具栏的 B/I/U 在此契约下总是走选区格式化;元素级排版走 inspector。
5. **移动手势松手漂移修复(两个根因)**。(a) 预览的内联 `translate(dx,dy)` 会顶掉 authored transform(如 `translate(-50%,-50%)` 居中),松手恢复即跳:桥 styleProps 增补 `transform`(computed),预览改为 `manualEditMovePreviewTransform` 把位移**前置合成**,提交把内联 transform 复位到**源码 authored 值**(非一律清空)。(b) auto 宽度的 absolute 元素 shrink-to-fit:提交改大 `left` 后可用宽变窄 → 元素变窄 → `-50%` 平移量变小再跳:`manualEditMoveStyles` 对 out-of-flow 移动附带**钉住起始宽度**(`width: startRect.width`),布局不回流。浏览器实测 held == released(零漂移)。
6. **拖拽跟手**。rAF tick 对吸附后矩形做等值去重:指针高频事件解析为同一 snapped rect 时跳过选中框 DOM 写入与 iframe 预览消息,拖拽成本跟随实际位移而非指针频率。(页面自身重动画的 iframe 主线程成本不在宿主可控范围。)

协议增量:`od-edit-copy-request {id}`、`od-edit-paste-request {id}`、`od-edit-paste-image {id, file}`(bridge→host);patch 增 `insert-html {id, html}`;`ManualEditStyles` 增 `display`(v2.2)与 `transform`。i18n 增 `manualEdit.pasteElement` / `manualEdit.pasteImage`(19 locale)。

契约反转记录:FileViewer 旧测试「holds the preview steady while manual Edit is open」(编辑模式中外部变更不刷新画布)被本轮**推翻**,改为「defers during interaction, follows once idle」。

新增/更新测试:gestures「preview transform 前置合成」「out-of-flow 移动钉宽」;source-patches「insert-html 锚后插入/消毒/身份剥离/__body__ 追加/单根校验」;bridge「Cmd+C 元素复制 vs 原生文本复制」「paste 按载荷分流元素/图片」「drop 锚定 drop 点最深元素」;FileViewer「外部改写后重进编辑模式取新源」「编辑中空闲跟随外部改写」「交互中推迟、结束后落地」「工具栏单层互斥」。

## v2.4 体系化架构定稿(全内容补丁原地化 + 身份重标注,2026-07-19)

第四轮实测反馈(工具栏无格式反馈;图片上传/裁剪闪屏跳顶)暴露的不是两个孤立 bug,而是管线缺少一层「内容补丁原地应用」的系统能力。本节把整个局部编辑体系定稿为六层,并记录本轮落地的架构级修复。

### 层次地图

| 层 | 归属 | 职责 | 关键源 |
| --- | --- | --- | --- |
| L1 身份与发现 | srcdoc 构建 + 桥 | 构建时 `annotateMissingOdIds`(补位置性 `data-od-id`)+ `annotateManualEditSourcePaths`(全量 `data-od-source-path`);桥点击/hover 解析、targets 广播 | `runtime/srcdoc.ts`、`edit-mode/bridge.ts` |
| L2 选中与 chrome | 宿主 | 选中框/动作条/文字工具栏/裁剪窗,rect×scale 坐标换算,单层互斥 | `ManualEditSelectionOverlay`、`ManualEditTextToolbar` |
| L3 样式管线 | 宿主 ⇄ 桥 | `od-edit-preview-style` 即时预览 → pending 防抖 → `set-style` 落盘 → reconcile;**永不重载 iframe** | `FileViewer` pending-style 管线 |
| L4 内容管线 | 宿主 ⇄ 桥 | 文本/图片/属性/插入/删除/复制补丁:源码 patch → 落盘 → **`od-edit-apply-dom` 原地应用**(v2.4 起全覆盖)→ 重标注 → targets 重播 | `applyManualEditContentInPlace`、`source-patches.ts` |
| L5 版本与历史 | 宿主 + daemon | 每补丁 = 一条历史 + 一个带 `versionSource:'manual'` + label 的文件版本(版本列表可见);undo/redo(按钮 + ⌘Z/⇧⌘Z)同样产生 `Undo/Redo <label>` 版本,原地回放 | `applyManualEditHistoryInPlace`、daemon `.file-versions` |
| L6 外部同步 | 宿主 | frozen source 生命周期:进入冻结、own-write 豁免、外部改写空闲跟随、保存期新鲜度确认 | v2.3 follow effect |

### 核心不变量

1. **DOM ≡ 已落盘源码(元素粒度)**。每个内容补丁落盘后,live DOM 中被触及的元素被 reconcile 为保存源里的消毒后标记(op `replace` 用 `readManualEditOuterHtml(saved, id)`,插入用保存源读回的兄弟节点)——不是把用户输入直接信任进 DOM。
2. **iframe 重载只是兜底,不是路径**。元素级补丁(text/inner-html/link/image/attributes/outer-html/insert/duplicate/remove)全部原地;仅页面级(`__body__` 样式、`set-token`、`set-full-source`)与任何原地失败(桥 800ms 未 ack、元素定位失败)回退 frozen-source 重载,且回退前必 `capturePreviewScrollPosition()`(闪屏兜底也不异常滚动)。
3. **位置性身份必须跟随结构变更**。`path-N` 形 id(`data-od-source-path` 与自动标注的 `data-od-id`)编码构建时位置;任何原地结构变更(插入/删除/复制)后,桥的 `restampPositionalIdentity()` 在 ack 前全量重算:位置形值重写、陈旧 `data-od-runtime-id` 摘除、新插入的干净标记就地 stamp(立刻可选中,无需重载)。**授权语义 id(如 `hero-title`)永不改写**。若无此层,原地插入后点击后续兄弟会把补丁打到错误的源元素上。
4. **每次落盘都是版本列表一等公民**。所有写盘走 `versionSource:'manual'` + 操作语义 label(粘贴图片/裁剪图片/删除元素…);undo/redo 写 `Undo/Redo <label>`,可从版本列表二次恢复,编辑不可能丢失。
5. **选中交接从保存源读回**。插入/复制后的新元素 id 用 `readManualEditInsertedSibling(saved, anchor)` 读回(授权 id 优先,否则位置 path),在 apply 前武装 `pendingSelectId`——原地重播与兜底重载两条路径同一机制接管选中。
6. **工具栏反馈来自渲染真值**。有选区时 B/I/U/S 高亮取桥上报的 `queryCommandState`(`od-edit-text-selection.format`,selectionchange + 每次格式命令后重报,序列化 key 去重);无选区回退元素级 draft。

### 补丁种类 × 应用方式矩阵

| patch | 原地 op | 兜底 |
| --- | --- | --- |
| `set-style`(元素) | 预览通道(L3) | — |
| `set-text` / `set-inner-html` / `set-link` / `set-image` / `set-attributes` / `set-outer-html` | `replace`(保存源 outerHTML) | frozen 重载 + 滚动快照 |
| `insert-html`(元素锚) / `duplicate-element` | `insert-after`(保存源读回) | 同上 |
| `insert-html`(`__body__`) | `append-child` | 同上 |
| `remove-element` | `remove` | 同上 |
| undo of `remove-element` | `readManualEditRestoreDescriptor` → `insert-after` 前兄弟 / `prepend-child` 父级(`__body__` 支持) | 同上 |
| `set-token` / `set-full-source` / `__body__` 样式 | —(页面级) | frozen 重载 + 滚动快照 |

### 性能契约

- targets 广播(滚动防抖 120ms / resize / mutation burst)在宿主端做轻量投影等值去重(`manualEditTargetsLightEqual`:id/kind/label/text/rect/isHidden/isLayoutContainer),无变化保持数组与选中对象引用,不触发全量 re-render。
- 手势:单 rAF + 命令式选中框 + transform 预览(v2.1/v2.3 既有)。
- 工具栏连发:leading+trailing rAF 合并(v2.1 既有)。
- 桥内格式状态上报按 key 去重,caret 移动不产生重复消息。

### v2.4 真浏览器验收轮(Playwright 驱动隔离实例,2026-07-19)

对运行中的 tools-dev 实例(独立 namespace + OD_DATA_DIR)用 Playwright 驱动完整验收矩阵,20/20 通过:sentinel 证明整个编辑会话 iframe 零重载;文本提交/删除滚动零位移;工具栏选区高亮 aria-pressed 即时生效;删除/Undo/复制原地 + 版本列表语义 label 完整;结构变更后编辑后续兄弟补丁命中正确元素(重标注)。该轮另发现并修复三个真 bug:

1. **Home/End 滚底**:Chromium 在 contenteditable 内对 Home/End「光标移动 + 文档平滑滚动」双重生效(caret 消费不抑制页面滚动默认行为),行内编辑中按 End 会把画布拽到页面底部。修复 = 会话 onKey 消费 Home/End,preventDefault 后手动把光标移到内容首/尾(Shift 扩展选区)。定位过程:滚动是原生平滑动画,绕过 scrollTo/scrollIntoView/focus/scrollTop 全部打桩点,靠最小化按键序列二分锁定。
2. **双击选词被折叠**:同元素二次点击的 `placeCaretFromClick` 把双击词选区折叠回光标;修复 = `clickEvent.detail >= 2` 时跳过(拖选幸免只因移动阈值抑制了 click 事件)。
3. **apply-dom 替换/删除节点残留 selection**(防御性):被替换/删除节点内的 caret 会不可预期地重锚;`dropSelectionInside` 在变更前清掉。

### v2.4 brand 页(运行时标注目标)原地化(2026-07-19,第五轮实测)

用户实测:brand kit 页(`od-brand-payload`)编辑图片后再编辑文字,闪屏 + 跳顶。根因两层:

1. **brand 元素的 id 是运行时标注的**(桥的 `annotateBrandKitRuntimeTargets` 在 live DOM 上 stamp `brand-*` id),保存源码里没有对应标记——补丁经 `applyDynamicBrandKitPatch` 落进 payload JSON / runtime overrides。因此 in-place 的 `readManualEditOuterHtml(saved, id)` 读回为空 → 每次编辑都走兜底重载。修复 = 新 `apply-dom` op **`apply-content`**:读回为空时把补丁字段(text/href/src/alt/html/attributes,属性名过滤 on*/data-od-*)直接镜像到 live 元素上——与 override applier 下次加载渲染的结果一致,DOM ≡ 落盘语义保持。`set-outer-html` 读回为空时用 patch.html 走 replace。
2. **异步渲染页的滚动恢复窗口太短**:brand 页内容由脚本在 load 后渲染,兜底重载后的三连恢复(rAF/80/260ms)时文档还没高度,scrollTo 被 clamp 到 0 后放弃 → 跳顶。修复 = 恢复重试梯:260ms 内保持旧行为,600/1200/2400/4000ms 仅在「目标仍被 clamp(内容还不够高)」时补打,永不覆盖用户 260ms 后的主动滚动;快照 5s 过期。

真浏览器验证(异步渲染 brand fixture):运行时 id 标注 ✓、文案落盘 override ✓、sentinel 零重载 ✓、滚动零位移 ✓、live DOM 与落盘同步 ✓。边界:brand 页的 undo/redo 仍走重载(旧值只存在于 payload 历史,无法泛化提取),由恢复重试梯保证不跳顶。

### v2.4 修复清单

1. **工具栏 B/I/U/S 无高亮反馈**:元素级 draft 看不见选区级 span → 桥 `selectionFormatState()`(queryCommandState×4,try/catch)经 `od-edit-text-selection.format` 上报;`ManualEditTextToolbar` 新 `rangeFormat` prop,有值走选区真值。
2. **图片上传/裁剪闪屏 + 跳顶**:根因 = 所有非 set-style 补丁无条件 `setManualEditFrozenSource` → srcDoc 换 → 全量重载。修复 = L4 原地内容管线全覆盖(上表),重载降级为兜底且带滚动快照。
3. **原地结构变更的身份陈旧**(隐性正确性 bug,本轮自查发现):见不变量 3,`restampPositionalIdentity()`。
4. **undo/redo 版本管理闭环**:结构补丁(插入/复制/删除)双向原地回放(此前必闪屏);删除的 undo 经还原描述符插回原位;所有回退落 `Undo/Redo` 版本。
5. 修复既有 7 个红测试(v2.1 面板 opt-in 两步流未同步进 `manual-edit-history` / `srcdoc-reload-races` 测试助手)。

协议增量:`od-edit-text-selection` 增 `format {bold,italic,underline,strike} | null`;`od-edit-apply-dom` 增 `op: replace|insert-after|append-child|prepend-child|remove`(默认 replace,向后兼容)。

新增测试:bridge「选区格式状态上报」「insert-after/append-child/prepend-child/remove 原地应用」「重标注跟随位移 + 新元素就地 stamp + 授权 id 不动 + replace 后仍 source-mappable」;source-patches「插入读回(授权锚/位置锚/__body__)」「删除还原描述符(前兄弟/父级 prepend/__body__/缺失)」;FileViewer「文本提交原地不换 srcdoc」「删除走 remove op」「粘贴图片原地插入 + 选中交接」「undo 原地 + Undo 版本 label」。

### v2.5 修订(整图拖拽移动 + 选中框跟随实测盒,2026-07-20)

用户实测(prototype/landing/deck 三种编辑模式)提两点:图片只能靠顶部锚点(pill)拖动,期望**整张图任意处点击拖拽即移动**;拉伸边框时**外层选中框与图片错位**(尤其居中/`max-width`/带比例的图,拉伸后框飘在图旁边),要求所有元素框在交互中与元素**始终一致**。

1. **整图整体移动**。`ManualEditSelectionOverlay` 在选中框内新增一层填满内部的 `moveBody`(`inset:0`、`pointer-events:auto`、`cursor:grab`),`onPointerDown` 复用 `startGesture('move')`——与顶部 pill 完全同一条手势管线(transform 预览 + 松手落 left/top,可撤销、产版本)。仅对 `kind === 'image'` 渲染:文本/链接元素的正文保持「点击进入行内编辑」语义,不被拖拽劫持。`moveBody` 排在 DOM 中的手柄之前,左右/顶部手柄(靠后绘制)在重叠区仍吃到指针,拉伸不受影响。
2. **选中框跟随元素实测盒(修错位)**。根因:resize 手势里选中框画的是**手势意图矩形**的 x/width,只吸收 iframe 回报的 y/height;而目标元素在拉伸时可能重新居中(`margin:auto`/flex 居中的图,变宽时固定边内滑)、`max-width` 截断、按内在比例缩放或在父容器里回流——真实渲染盒在**两个轴**上都偏离意图,框只在纵向被纠正,横向永久飘移。修复:`DragState.measuredY/measuredHeight` 合并为单个 `measured: ManualEditRect | null`,`adoptMeasuredExtent` 吸收**完整**实测盒(x/y/width/height),`displayRect = state.measured ?? state.rect`。手势仍以 `state.rect`(意图)落盘 `set-style`,只有用户所见的选中框跟随实测——首帧(尚无测量)与整个 move(纯合成器 transform,不测量)回退到意图矩形。提交时 `outcome = displayRect(state)` 也即实测盒,乐观写入 `target.rect` 与 `heldRect` 与刷新后的真实 rect 对齐,松手零闪跳。

新增测试:`ManualEditSelectionOverlay`「整图 body 拖拽提交 move / 非图片无 body 面」「resize 吸收实测盒纠正横向错位」。
