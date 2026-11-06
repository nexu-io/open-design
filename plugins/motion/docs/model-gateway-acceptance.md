# 模型网关验收记录

日期：2026-11-04。需求：[REQ-20261104-005](product/changes.md#req-20261104-005模型网关与时间轴素材生成)。这是本地开发验收，不是远端付费服务的全面可用性证明。

## 已验证的真实链路

1. 从空时间轴打开「生成素材」，检测本机 Codex：CLI 0.166.0，已登录，`image_generation` 开启。
2. 在 Studio 选择 Codex Image、16:9、1 张，输入清晨湖泊与森林提示词并提交。
3. Gateway 调用本机 Codex CLI，任务 `c30f41d4-879d-4be8-8774-adfadfc072c6` 完成，得到真实 PNG（1,896,995 字节），保存到发起工程的 `assets/generated/`。
4. 在生成面板选择 0–6 秒并放入时间轴；源文件实际新增原生 `img.clip`，含 `data-start="0"`、`data-duration="6"` 和素材相对路径，原生撤销按钮启用。
5. 素材库卡片显示「已添加」，可见操作菜单含预览、播放头添加、复制路径、下载、重命名和删除；「在预览区查看」成功打开真实图像。
6. 真实 MCP stdio 初始化与 tools/list 返回 22 个工具；能力查询成功。通过 `motion_generate_asset` 使用同一幂等键读取同一已完成任务，再由 `motion_get_generation` 取得可用文件；未重复发起付费生成。
7. 从「导入文件」打开系统文件选择器，选择本地验收 PNG；素材入库并新增原生时间轴片段。原生撤销恢复为 6 秒合成，导入的文件仍可在素材库继续使用。
8. 通过 MCP 导入本地字体、写入背景缩放和三组文字动画；最终工程 lint 为 0 错误、0 警告。四条素材/文字轨道可以继续编辑。
9. MCP 请求后台导出并取得真实 MP4；`motion_verify_export` 校验通过。使用 Chrome 实际播放最终文件到 6 秒结束，重播回到 0 秒，并通过播放器进度控件跳转至 3 秒。

## 检查结果

| 检查 | 实际结果 |
| --- | --- |
| 后端全量测试 | 60 通过；包含模型发现、凭据脱敏、工程绑定、取消、幂等、Atlas/fal 协议、HTTP 与 MCP |
| Studio 全量测试 | 693 个测试文件通过、1 个跳过；8054 项通过、16 项 todo |
| Studio 类型检查与构建 | `npm run typecheck:studio`、`npm run build:studio` 通过 |
| 仓库检查与分发 | `npm run check` 通过；插件 ZIP 含 gateway、共享合约及产品文档，不含验收素材或凭据 |
| 最终原生工程 lint | 0 错误、0 警告 |
| 导出技术校验 | MP4 / H.264 / yuv420p，1280×720，30 fps，6 秒；180 帧完整解码与首/中/尾 seek 均通过 |
| 声音 | brief 明确为无声示例；验证为 0 音频流，未将静音结果当成音频生成测试 |
| 画面与播放器 | 真实森林湖泊背景、文字分段入场、缓慢缩放；最终文件已查看，并完成浏览器播放、重播和跳转 |

最终导出任务为 `853d470d-7aef-4a76-9d69-d1a75ea2439c`，固定 revision 为 `35891613e96113285ce329861cfa0f1004d8b3d61b83d301df8c75ac803c5465`，文件大小 3,210,102 字节，SHA-256 为 `693ac2462f43f00a8ad27e6fa0f5a42ea71281fd70e62b9695be2eee4bfe1b42`。

## 同日补充：时间轴上下文入口与参考图修改

用户首次验收指出：已有生成按钮，但激活片段/播放头后没有 Hyperframes 式的就地操作栏。本轮补充 `TimelineMediaBar`，订阅所选片段、Shift 时间范围与标尺点击，并接通原图修改、显式替换和原生撤销。

实际浏览器验证：

1. 刷新原验收工程，选中 0–6 秒湖泊图片，自动显示带描述输入、生成素材、修改图片、交给 Agent 的浮动栏。
2. 点击「修改图片」，面板显示原图、Codex Image、比例与数量，原片段的开始时间/时长固定为 0/6 秒。
3. 从 Studio 提交保留湖泊与森林构图、改为秋日夕照的指令。本地 Codex 使用真实参考图完成任务 `9357565d-f788-4096-aa1b-b90ecd9ce770`；输出 PNG 为 2,066,244 字节。任务记录原图 SHA-256 `cc29c070cd6399d9c0eebcb3a45bc686aff0f11152ac6904f75afa6fa0798df6`，MCP 可查询同一结果。
4. 点击「替换所选图片」后成功保存。逐字比较源文件，仅图片 `src` 变化（原生解析器规范化 doctype 的大小写）；时长、布局与 GSAP 动画一致。点击原生撤销恢复原图，再重做恢复夕照；保存前后/撤销后的 HTML 作为证据。
5. 清除片段选择，在 3 秒标尺处点击，生成栏显示播放头位置，打开面板后带入约 3 秒开始、3 秒时长。Shift 范围优先级、反向范围、缩放/滚动坐标、关闭/重开、只读/播放隐藏由 DOM 测试覆盖。
6. 夕照工程原生 lint 为 0 错误、0 警告。导出任务 `d0f9f35b-4d42-4340-8390-70588e8b2e1e` 完成，revision 为 `49820b0fc4b1dbc0d1f6b8c1c4e42bb967277402c3d474fdef56af033d3076b1`。MP4 为 4,660,992 字节，SHA-256 `59dcf614310936122fda82205d0ed20fae86ca29dd800203be0f3083b6add58b`。
7. `motion_verify_export` 通过：1280×720、30 fps、6 秒、H.264/yuv420p、无声，180 帧完整解码及首中尾跳转。Chrome 实际播放至 0:06 结束、重播至 0:00，并从进度条跳到 0:03；检查最终画面中文字、背景与缩放保持正确。

实现中发现原生 `prepareContent` 是 patch 后处理，不能承担修改前校验。已将保护移到文件队列内、任何写入之前的 `validateContent`；回归测试验证拒绝过期源文件时不发起 patch、不写文件、不新增历史，成功时只新增一条原生撤销记录。

补充后的全量验证：后端 **62 项通过**；Studio **695 个测试文件通过、1 个跳过，8060 项通过、16 项 todo**。类型检查、Studio 构建和仓库检查通过。对应日志为 `backend-tests-timeline.log`、`studio-tests-timeline.log`、`timeline-media-tests.log`。

夕照验收交付保存在 `.artifacts/model-gateway-e2e/`：`openmotion-codex-edited.mp4`、`openmotion-codex-edited-project.zip`、`reference-edit-mcp.json`、`reference-edit-lint.json`、`reference-edit-export-status.json`、`reference-edit-verification.json`、`reference-edit-applied.html`、`reference-edit-undone.html`。在线工程保留夕照结果，原图仍在素材库；早先清晨版本的 MP4/工程包作为历史验收结果保留。

## 本地交付位置

本轮工程与证据保存在工作区的 `.artifacts/model-gateway-e2e/`，不会随插件分发：

- `workspace/project/`：可继续编辑的原生工程与真实素材。
- `openmotion-codex-project.zip`：工程副本，包含本地图片、字体、GSAP 与原生工程元数据。
- `openmotion-codex-demo.mp4`：最终 6 秒无声成片。
- `workspace/model-gateway/jobs/`：真实生成任务记录，无 API Key。
- `mcp-generation.json`：实际 MCP 初始化、能力查询、幂等生成与结果查询响应。
- `mcp-composition.json`、`final-lint.json`、`export-request.json`、`export-status.json`、`export-verification.json`：编排、最终检查及后台导出证据。
- `final-frame-01.png`、`final-frame-02.png`、`final-frame-03.png`：最终文件的首、中、尾帧。
- `backend-tests-final.log`、`studio-tests-final.log`、`studio-retest.log`：测试记录。

验收服务器使用独立端口 `4317`，工程名为「模型网关验收 · Codex Image」，图片默认路由已设置为 `codex:image-generation`。打开 Studio 后可从顶栏查看模型设置，从时间轴工具栏打开生成面板，从素材卡片的省略号打开操作菜单。重新启动时在仓库根目录执行：

```sh
PORT=4317 MOTION_DATA_DIR="$PWD/.artifacts/model-gateway-e2e/workspace" npm start
```

## 验证边界

Atlas Cloud 与 fal.ai 没有配置真实 Key，本轮验证其异步提交/轮询、返回 URL、音频字段、拒绝处理与状态映射的协议测试，没有产生收费视频或音频。其他本地 Agent 仅检查安装，不宣称具有已接入的媒体生成能力。

该示例验证的是「Codex 生图 → 工程素材 → 原生 motion 编排 → MP4」；不将图片缩放动画称为视频模型生成，也不将单一机器上的成功代表为所有 Codex 版本/账户的可用性。
