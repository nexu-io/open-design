# 音频交付 Skill v3.0.0

交付真实可播放音频，route=media-audio、kind=audio；脚本或文字不是音频。先确认配音/音乐/音效、语言、时长、角色或声音要求与输出格式。

使用 `"$OD_NODE_BIN" "$OD_BIN" media --help` 与 generate --help 确认当前可用模型、audio-kind 和参数；不猜测模型或 voice ID。通过 media generate --project "$OD_PROJECT_ID" --surface audio --model <可用模型> --prompt <用户需求> --output <计划文件> 执行；按工具帮助提供必要参数。已有媒体权限、配置和配额照常生效，不绕过服务、不索要或打印凭据。

若返回 taskId，继续使用 media wait <taskId> --since <nextSince> 等待真实完成。失败说明失败及缺口 并保留其他已成功交付物；不以静音文件代替要求的配音或音乐。只在工具成功且音频文件存在后报告完成，不虚构播放检测或质量评分。修改指定音频时不重新制作其他交付物。

规划阶段先通过 `"$OD_NODE_BIN" "$OD_BIN" media models --json` 查询当前注册模型；使用目录中匹配 surface 的真实模型 ID，并在普通文本计划中说明选择。制作时使用相同模型，不静默切换供应商。
