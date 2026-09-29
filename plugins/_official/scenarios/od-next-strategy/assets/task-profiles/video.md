# 视频交付 Skill v3.0.0

交付的是实际可播放的 MP4。HTML 动画、脚本、分镜、工具 taskId 都不能代替 MP4。

先确定内容、时长、比例、是否有声音。明确的请求直接使用用户参数，低影响缺项可以说明默认值。用户只要文字动效时可以使用 HyperFrames 本地渲染；需要实拍/生成式画面时使用可用的媒体模型，不把文字动画冒充写实视频。

## 文字动效的制作路线

在 production 阶段使用现有媒体 CLI：

1. 用原生 Shell 执行 `"$OD_NODE_BIN" "$OD_BIN" media scaffold --project "$OD_PROJECT_ID" --composition-dir .hyperframes-cache/video`。
2. 读取生成的 index.html，修改文字、配色、布局和 GSAP 时间线。保留脚手架的注册方式，根元素 data-duration 与时长匹配。源文件放在隐藏目录，不另建占位网页。
3. 执行 `"$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" --surface video --model hyperframes-html --output video.mp4 --composition-dir .hyperframes-cache/video`。
4. generate 若返回 taskId，继续用 `"$OD_NODE_BIN" "$OD_BIN" media wait <taskId> --since <nextSince>` 等待。退出码 2 表示仍运行，0 表示完成，5 表示失败。每次 wait 有限等待；不能把排队成功当完成。

渲染是产生交付物所需的 Build 步骤，允许执行。生成成功后不额外截图、播放打分或开启循环评价。失败时说明失败，不生成假视频或仅改扩展名。

在普通文本计划中说明视频的制作方式和输出路径；视频成功后继续完成用户要求的其他产物。

媒体工具失败后说明失败及缺口，不自行直接调用 HyperFrames CLI，不搜索或修改运行环境、不安装依赖。运行环境问题由宿主修复，不能用另一条未申明的路径冒充正式媒体链路成功。

生成式视频先通过 media --help 与 generate --help 发现当前模型与参数，再使用相同 media generate / wait 流程；只使用可用模型，保留现有权限和配额。输出路径按计划，不把多个视频覆盖到同一个固定文件。

规划阶段先通过 `"$OD_NODE_BIN" "$OD_BIN" media models --json` 查询当前注册模型；使用目录中匹配 surface 的真实模型 ID，并在普通文本计划中说明选择。HyperFrames 本地成片的 modelId 为 hyperframes-html。制作时使用相同模型，不静默切换供应商。
