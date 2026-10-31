---
name: claude-agent-lab
description: Claude 代理实验室的连续数据界面动效模板。
---

从 `example.html` 开始制作影片；它是可直接渲染的完整参考成片。

**Arc:** 参考 → 数据 → 叙事 → 动效 → 指导 → 交付

| Scene (`CFG.scenes` id) | Dur | Summary | Build | Reuse |
|---|---|---|---|---|
| `reference` | 4 s | 参考阶段：REFERENCE，文件送往代理队列 | 单 canvas，`reference-focus` 淡入，`reference-out` 尾部淡出；持续轨道运动 | 替换 `referenceTitle`、`referenceCopy`、`referenceFile`、`referenceDetail`，保持弧形关联结构 |
| `data` | 4 s | 数据阶段：DATA，文件送往代理队列 | 单 canvas，`data-focus` 淡入，`data-out` 尾部淡出；持续轨道运动 | 替换 `dataTitle`、`dataCopy`、`dataFile`、`dataDetail`，保持弧形关联结构 |
| `story` | 4 s | 叙事阶段：STORY，文件送往代理队列 | 单 canvas，`story-focus` 淡入，`story-out` 尾部淡出；持续轨道运动 | 替换 `storyTitle`、`storyCopy`、`storyFile`、`storyDetail`，保持弧形关联结构 |
| `motion` | 4 s | 动效阶段：MOTION，文件送往代理队列 | 单 canvas，`motion-focus` 淡入，`motion-out` 尾部淡出；持续轨道运动 | 替换 `motionTitle`、`motionCopy`、`motionFile`、`motionDetail`，保持弧形关联结构 |
| `direct` | 4 s | 指导阶段：DIRECT，文件送往代理队列 | 单 canvas，`direct-focus` 淡入，`direct-out` 尾部淡出；持续轨道运动 | 替换 `directTitle`、`directCopy`、`directFile`、`directDetail`，保持弧形关联结构 |
| `ship` | 4.05587 s | 交付阶段：SHIP，文件送往代理队列 | 单 canvas，`ship-focus` 淡入，`ship-out` 尾部淡出；持续轨道运动 | 替换 `shipTitle`、`shipCopy`、`shipFile`、`shipDetail`，保持弧形关联结构 |

## Reference files
复制 `example.html`、`assets/gsap.min.js`、`assets/RobotoMono-400-700.ttf`、`assets/RobotoMono-OFL.txt`、`assets/agent.png`、`assets/credit.png`、`assets/cover.jpg` 和 `references/sound.json`，保留相对路径。`assets/soundtrack.mp3` 由交付流程从参考片提取，仅在下述声音选择规则适用时复制。

## Adapting the template
- `reference`：可更换标题、说明、文件名和焦点说明，保留弧形索引、线束聚焦与文件队列这一连续动作。时长可在 3—6 秒间调整，未锁定；多出的时间由旋转索引、代理漂移和图表波动填充。标题最多 14 字符，说明和焦点最多 44 字符，文件名最多 18 字符；过长时先改写缩短，不把字缩小。若有更多文件，在同一轨道循环分发并只显示最强的六个；较少文件则减少标签、保留队列运动。
- `data`：可更换标题、说明、文件名和焦点说明，保留弧形索引、线束聚焦与文件队列这一连续动作。时长可在 3—6 秒间调整，未锁定；多出的时间由旋转索引、代理漂移和图表波动填充。标题最多 14 字符，说明和焦点最多 44 字符，文件名最多 18 字符；过长时先改写缩短，不把字缩小。若有更多文件，在同一轨道循环分发并只显示最强的六个；较少文件则减少标签、保留队列运动。
- `story`：可更换标题、说明、文件名和焦点说明，保留弧形索引、线束聚焦与文件队列这一连续动作。时长可在 3—6 秒间调整，未锁定；多出的时间由旋转索引、代理漂移和图表波动填充。标题最多 14 字符，说明和焦点最多 44 字符，文件名最多 18 字符；过长时先改写缩短，不把字缩小。若有更多文件，在同一轨道循环分发并只显示最强的六个；较少文件则减少标签、保留队列运动。
- `motion`：可更换标题、说明、文件名和焦点说明，保留弧形索引、线束聚焦与文件队列这一连续动作。时长可在 3—6 秒间调整，未锁定；多出的时间由旋转索引、代理漂移和图表波动填充。标题最多 14 字符，说明和焦点最多 44 字符，文件名最多 18 字符；过长时先改写缩短，不把字缩小。若有更多文件，在同一轨道循环分发并只显示最强的六个；较少文件则减少标签、保留队列运动。
- `direct`：可更换标题、说明、文件名和焦点说明，保留弧形索引、线束聚焦与文件队列这一连续动作。时长可在 3—6 秒间调整，未锁定；多出的时间由旋转索引、代理漂移和图表波动填充。标题最多 14 字符，说明和焦点最多 44 字符，文件名最多 18 字符；过长时先改写缩短，不把字缩小。若有更多文件，在同一轨道循环分发并只显示最强的六个；较少文件则减少标签、保留队列运动。
- `ship`：可更换标题、说明、文件名和焦点说明，保留弧形索引、线束聚焦与文件队列这一连续动作。时长可在 3—6 秒间调整，未锁定；多出的时间由旋转索引、代理漂移和图表波动填充。标题最多 14 字符，说明和焦点最多 44 字符，文件名最多 18 字符；过长时先改写缩短，不把字缩小。若有更多文件，在同一轨道循环分发并只显示最强的六个；较少文件则减少标签、保留队列运动。

改变总长时，优先把新增时间分给 `data`、`story`、`motion`，其次是 `direct` 与 `ship`，最后调整 `reference`。更新 `CFG.duration` 和各段 `dur` 的总和，不能添加固定开始时间；保持出口 cue 的 `from: "end"`。额外停留必须保留可见运动。顶部计数可独立替换；它们表示参考界面中的统计，不应误用作本模板实际场景数。品牌最多 25 字符，顶栏说明最多 48 字符。

Chinese / 非拉丁文字：`--od-font-heading` 和 `--od-font-body` 均以本地 Roboto Mono 为拉丁字体，随后使用 Noto Sans SC 和系统中文字体；中文采用对应的 400、500、700 字重。繁体中文改为 Noto Sans TC。更换用户文案后须渲染包括标点与中英混排的一帧，检查缺字、方框与异常回退；若机器无中文字体，应明确告知用户。只有用户指定时才添加特定中文字体。

## Rendering
所有画面由单个 canvas 的 `render(t)` 绘制，随机图形使用固定种子。弧形索引采用不重置条目身份的连续纵向滚动；代理沿轨道前进并带轻微起伏及明暗波动，线束端点和底部求解图表也按绝对时间变化。伸长场景时保留这些持续运动，不能把索引或队列停在最后一帧。GSAP 是唯一时间轴，`window.__odRenderAt(t)` 支持确定性前后跳转；先等待字体和图片加载。页面本地控制条仅用于预览，`html.od-export` 隐藏它。全部脚本与拉丁字体均为本地文件。

## Source
来源：@francescoinweb3，https://x.com/francescoinweb3/status/2111393917899808880 。品牌、人物、主文案和统计保留原片内容；角色及署名是参考局部裁切，其余界面是动态重建。

## Sound
The demo track is the reference film's own soundtrack.
When the film length changes, refit or replace the track using references/sound.json (bpm, sections).
The bundled track is demo material, not a requirement for generated films.
The user's current brief takes priority over this reference and its seed prompt,
including duration, music choice, genre, mood, voiceover and sound effects.
Follow the general motion-design audio guidance; this template does not disable
available audio tools or original audio synthesis.

- If the user requests a silent film, remove all audio. If they request only
  no background music, remove the music but retain any requested sound effects
  or voiceover. No voiceover does not mean no music.
- Use the user's supplied audio when requested. If they request different music,
  choose or create a suitable real local asset using the available audio tools,
  licensed sources or original synthesis. Do not silently substitute the demo
  track for an unmet request; briefly disclose any limitation.
- Without a specific music request, add appropriate audio when it benefits the
  film. Reuse the demo track only when it suits the actual story, mood and timing;
  it is an option, not the default for every adaptation.
- Fit the visuals and audio to the requested film duration, not to the demo's
  duration. For example, a 15-second brief stays 15 seconds even when the demo
  score is 20 seconds. Edit the selected track with a deliberate ending/fade;
  use the same edited local file in HTML and MP4. For a longer film, arrange or
  replace the track to cover the intended beats rather than leaving an accidental
  silent tail. Do not rely on an HTML-only loop or playbackRate for export.

For background music keep `id="soundtrack"`, `data-start="0"` and a numeric
`data-volume`; update `src` and `data-duration` to the actual edited asset and
film. Remove unused demo audio from the generated composition. Set the source's
`od-motion-audio` metadata to `required` when sound is intended, or `silent` for
an intentionally silent film, using the general motion-design delivery guidance.
Verify the ending and audio in both HTML playback and the exported MP4.

The `<audio>` element stays inside the composition root; the desktop exporter
mixes its local file into the MP4. Preview sound starts with the film; when the
browser blocks autoplay, the first click or key press turns it on, and Sound off
mutes it. Sound follows the master timeline, including pause and backward
seeks. Keep it silent during frame capture and in sandboxed gallery thumbnails.
