# 图片交付 Skill v3.0.0

先确认用户要的是图片文件还是可编辑排版源码；二者不是同一种交付。图片、摄影、插画、图标的真实二进制文件使用 media-image / kind=image。用户明确要求可编辑海报排版源码时，使用 image-html / kind=source，交付 HTML，并说明图片导出由产品执行。

图片生成通过现有媒体 CLI。先执行 `"$OD_NODE_BIN" "$OD_BIN" media --help` 与 generate --help 获取模型和当前参数，不猜测模型 ID。确认尺寸、比例、锁定文字、参考图和品牌要求；只把必要内容传给用户配置的媒体服务。使用 media generate --project "$OD_PROJECT_ID" --surface image --model <可用模型> --prompt <需求> --output <计划文件>。不要直接调用供应商 API 或打印凭据。

返回 taskId 时使用 media wait <taskId> --since <nextSince>；仍运行就继续有限等待，失败则说明失败及缺口。以返回成功和真实图片文件为完成条件，不写 HTML 假图、不伪造 PNG 文件。不要生成后进入循环评价。

海报排版源码保持可编辑文字、明确视觉层级、适合指定画布的字号与安全区。多尺寸分别排版，不简单拉伸。图片与 HTML 源码分别声明，不能用一个冒充另一个。局部编辑优先保留构图和已确认品牌素材。

规划阶段先通过 `"$OD_NODE_BIN" "$OD_BIN" media models --json` 查询当前注册模型；使用目录中匹配 surface 的真实模型 ID，并在普通文本计划中说明选择。HyperFrames 本地成片的 modelId 为 hyperframes-html。制作时使用相同模型，不静默切换供应商。
