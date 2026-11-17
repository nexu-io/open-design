从 `example.html` 开始修改。这是一段将原片词语输入与色带占比变化重建在单个 canvas 上的演示。

**Arc:** 番茄 → 霓虹 → 年代与游戏词语 → 城市 → 蓝色语义 → 自然意象

## 文件
复制 `example.html`、`assets/gsap.min.js`、`assets/motion-data.js`、`assets/NotoSansMono-variable.woff2` 与 `assets/NotoSansMono-OFL.txt`，保持相对路径。声音结构见 `references/sound.json`。封面为 `assets/cover.jpg`。

## 场景结构
文字、色带、插入点与鼠标指针均由纯函数 `render(t)` 重建；不加载参考视频，不使用整帧背景。`assets/motion-data.js` 仅存放色带编号、边界坐标、按键文字、输入选区和首场鼠标轨迹的矢量关键帧。首场鼠标先以箭头滑入，进入输入区后变成 I 形，再在输入前隐藏；时间跟随 `tomato-typing`，与文字插入点独立。画布颜色含实测 H.264 导出补偿（每通道 0–2 级），以导出后的参考色为准。修改时间只改 `CFG.scenes`，场景起点自动累计，所有出场通过 `from: "end"` 的 cue 定位。

| 场景（CFG.scenes id） | 时长 | 内容 | 构建 | 复用 |
|---|---:|---|---|---|
| `tomato` | 4.583 | 番茄与藤蔓 | canvas；`tomato-typing` 驱动文字；`tomato-palette` 驱动色带；`tomato-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `neon` | 3.367 | 霓虹东京 | canvas；`neon-typing` 驱动文字；`neon-palette` 驱动色带；`neon-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `eighties` | 4.000 | 八十年代迪斯科与流行 | canvas；`eighties-typing` 驱动文字；`eighties-palette` 驱动色带；`eighties-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `retro` | 2.283 | 复古色谱 | canvas；`retro-typing` 驱动文字；`retro-palette` 驱动色带；`retro-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `browser` | 4.617 | browser 修正为 bowser | canvas；`browser-typing` 驱动文字；`browser-palette` 驱动色带；`browser-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `mario` | 1.400 | mario | canvas；`mario-typing` 驱动文字；`mario-palette` 驱动色带；`mario-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `luigi` | 2.317 | luigi | canvas；`luigi-typing` 驱动文字；`luigi-palette` 驱动色带；`luigi-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `wario` | 2.550 | wario | canvas；`wario-typing` 驱动文字；`wario-palette` 驱动色带；`wario-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `canada` | 2.267 | 加拿大 | canvas；`canada-typing` 驱动文字；`canada-palette` 驱动色带；`canada-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `london` | 6.933 | 伦敦、巴士与酒馆 | canvas；`london-typing` 驱动文字；`london-palette` 驱动色带；`london-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `royalty` | 2.800 | 皇室紫 | canvas；`royalty-typing` 驱动文字；`royalty-palette` 驱动色带；`royalty-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `indigo` | 2.233 | 靛蓝 | canvas；`indigo-typing` 驱动文字；`indigo-palette` 驱动色带；`indigo-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `blue-screen` | 4.967 | 蓝屏 | canvas；`blue-screen-typing` 驱动文字；`blue-screen-palette` 驱动色带；`blue-screen-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `matrix` | 4.583 | matrix 与 the matrix | canvas；`matrix-typing` 驱动文字；`matrix-palette` 驱动色带；`matrix-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `beach` | 3.550 | 沙滩与落日 | canvas；`beach-typing` 驱动文字；`beach-palette` 驱动色带；`beach-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `sunlight` | 8.317 | 阳光、田野与海滩 | canvas；`sunlight-typing` 驱动文字；`sunlight-palette` 驱动色带；`sunlight-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |
| `stormclouds` | 4.517 | 乌云 | canvas；`stormclouds-typing` 驱动文字；`stormclouds-palette` 驱动色带；`stormclouds-out` 衔接下组；分段线性插值 | 更换 `terms` 对应行，保留输入与色带的先后关系 |

## Adapting the template
`terms` 是逐行词语序列，默认共 28 行；每个词语最多 29 个拉丁字符或约 18 个汉字。总槽上限 500 字符。超过限制时先缩短文字，保持字号可读；不把全部新项目挤进同一场景。对常规改稿，重新编排该词的输入事件和对应色带目标；不要把默认色带误解为能自动理解任何新语义的模型。

- `tomato`：可替换与“番茄与藤蔓”对应的词语及配色，保留先输入、后重排的动作。范围 4.583333–6.874999，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 27 个拉丁字符或约 13 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `neon`：可替换与“霓虹东京”对应的词语及配色，保留先输入、后重排的动作。范围 3.366667–5.050001，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 20 个拉丁字符或约 10 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `eighties`：可替换与“八十年代迪斯科与流行”对应的词语及配色，保留先输入、后重排的动作。范围 4.000000–6.000000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 23 个拉丁字符或约 11 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `retro`：可替换与“复古色谱”对应的词语及配色，保留先输入、后重排的动作。范围 2.283333–3.425000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 13 个拉丁字符或约 6 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `browser`：可替换与“browser 修正为 bowser”对应的词语及配色，保留先输入、后重排的动作。范围 4.616667–6.925001，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 27 个拉丁字符或约 13 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `mario`：可替换与“mario”对应的词语及配色，保留先输入、后重排的动作。范围 1.400000–2.100000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 8 个拉丁字符或约 4 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `luigi`：可替换与“luigi”对应的词语及配色，保留先输入、后重排的动作。范围 2.316667–3.475000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 13 个拉丁字符或约 6 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `wario`：可替换与“wario”对应的词语及配色，保留先输入、后重排的动作。范围 2.550000–3.825000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 15 个拉丁字符或约 7 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `canada`：可替换与“加拿大”对应的词语及配色，保留先输入、后重排的动作。范围 2.266666–3.399999，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 13 个拉丁字符或约 6 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `london`：可替换与“伦敦、巴士与酒馆”对应的词语及配色，保留先输入、后重排的动作。范围 6.933334–10.400001，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 29 个拉丁字符或约 14 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `royalty`：可替换与“皇室紫”对应的词语及配色，保留先输入、后重排的动作。范围 2.800000–4.200000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 16 个拉丁字符或约 8 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `indigo`：可替换与“靛蓝”对应的词语及配色，保留先输入、后重排的动作。范围 2.233333–3.350000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 13 个拉丁字符或约 6 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `blue-screen`：可替换与“蓝屏”对应的词语及配色，保留先输入、后重排的动作。范围 4.966667–7.450001，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 29 个拉丁字符或约 14 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `matrix`：可替换与“matrix 与 the matrix”对应的词语及配色，保留先输入、后重排的动作。范围 4.583333–6.874999，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 27 个拉丁字符或约 13 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `beach`：可替换与“沙滩与落日”对应的词语及配色，保留先输入、后重排的动作。范围 3.550000–5.325000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 21 个拉丁字符或约 10 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `sunlight`：可替换与“阳光、田野与海滩”对应的词语及配色，保留先输入、后重排的动作。范围 8.316667–12.475000，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 29 个拉丁字符或约 14 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。
- `stormclouds`：可替换与“乌云”对应的词语及配色，保留先输入、后重排的动作。范围 4.516666–6.774999，未锁定。新增时间放在完成输入后的停留，插入点继续闪动，色带边界继续轻缓往返；原速演示严格使用实测轨迹。该场景每行最多 27 个拉丁字符或约 13 个汉字，长文先改短。项目减少时省去该行输入，项目增加时复制一组输入与重排，不叠加更多文字。

总时长改变时先由 `sunlight`、`london`、`blue-screen` 吸收停留，再分配给其他场景。不要把打字速度整体拉慢，不缩放场景内部时间。短于各场景 minDur 之和时删去完整词语示例，再重新设置时长。非 Latin / Chinese 文案：两个字体角色均使用捆绑 Noto Sans Mono 400，中文回退 Noto Sans SC 400；繁体改为 Noto Sans TC。交付前用用户真实文字、标点与中英混排渲染一帧，检查缺字与方框；机器没有中文字体时明确告知。参考演示没有中文画面，本次未捆绑中文字体。

Brand-bound: none

## Sound
The demo track is the reference film's own soundtrack.
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

When the film length changes, refit or replace the track using references/sound.json (bpm, sections).
To refit, cut the track at the original scene boundaries, time-stretch each piece to its new scene length with ffmpeg atempo (keep each factor within 0.8–1.25; beyond that, trim or loop that piece instead), join the pieces with 40 ms crossfades, fade in 0.15 s and out over the last second, and replace assets/soundtrack.mp3 with the result at exactly CFG.duration.

本次参考文件经 ffprobe 确认没有音频流，故 `references/sound.json` 的 music 为 null，效果列表为空；以上官方条款用于未来用户改编，不能视为本次已有音轨。`assets/soundtrack.mp3` 和标签由运行器后处理，本次不创建。

## 来源
原片作者 @mattdesl：https://x.com/mattdesl/status/2100899669802963060。链接仅供署名，未访问。
