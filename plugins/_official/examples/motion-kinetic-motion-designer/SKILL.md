# 动效设计师名片

从 `example.html` 开始改编。保留目录中的 `assets/Anton-400.ttf`、`assets/Anton-OFL.txt`、`assets/Caveat-400.ttf`、`assets/Caveat-OFL.txt`、`assets/gsap.min.js`、`assets/cover.jpg` 和 `references/sound.json`。原音轨 `assets/soundtrack.mp3` 由 runner 添加。

**Arc:** 弹跳 → 文字 → 动作词 → 缓动 → 跟随 → 预备动作 → 名片

| 场景（CFG.scenes id） | 时长 | 画面含义 | 构建方式 | 复用 |
|---|---|---|---|---|
| `spacing` | 1.9 s | 蓝球沿衰减弹跳路径运动，残影解释间距。 | 单画布，CFG.cues 驱动，绝对时间纯函数 | 保留动作机制，文字取 CFG |
| `type` | 1.85 s | I MAKE THINGS / MOVE 逐字错峰入场。 | 单画布，CFG.cues 驱动，绝对时间纯函数 | 保留动作机制，文字取 CFG |
| `actions` | 1.8 s | BOUNCE、STRETCH、SPIN、SNAP 快速切换。 | 单画布，CFG.cues 驱动，绝对时间纯函数 | 保留动作机制，文字取 CFG |
| `easing` | 2.9 s | 位置时间曲线由直线转为 S 形，方块演示运动间距。 | 单画布，CFG.cues 驱动，绝对时间纯函数 | 保留动作机制，文字取 CFG |
| `follow` | 2.55 s | 蓝色粒子头拖着尾迹绕行，点阵受其影响。 | 单画布，CFG.cues 驱动，绝对时间纯函数 | 保留动作机制，文字取 CFG |
| `anticipation` | 2.15 s | 环形刻度从零加载至百分之百，中心圆预备动作。 | 单画布，CFG.cues 驱动，绝对时间纯函数 | 保留动作机制，文字取 CFG |
| `hello` | 1.911333 s | MOTION DESIGNER / CLAUDE 与接洽项目短句收尾。 | 单画布，CFG.cues 驱动，绝对时间纯函数 | 保留动作机制，文字取 CFG |

## Adapting the template

- `spacing`：不含可换文案；新增项目另做一段，减少项目不能删掉蓝球的落地。 范围 1.9–2.8 秒，可延长；增加时间由持续弹跳填充。保留该段入场机制及尾部 `spacing-out` cue。
- `type`：headline 最多 20 字符，verb 最多 8 字符；超长先精简，不缩小到难以阅读。只展示一组主标题，多组时择最强一组。 范围 1.85–2.8 秒，可延长；增加时间由圆点与下划线的轻微摆动填充。保留该段入场机制及尾部 `type-out` cue。
- `actions`：保留四个动作词及其含义；项目增减时仍保留四种动作机制，不堆叠更多字卡。 范围 1.8–1.8 秒，锁定时长；增加时间由字卡旋转或拉伸填充。保留该段入场机制及尾部 `actions-out` cue。
- `easing`：保留直线转 S 曲线与单个运动方块；更多数据只择一组，不压缩坐标图。 范围 2.9–4.3 秒，可延长；增加时间由方块循环演示填充。保留该段入场机制及尾部 `easing-out` cue。
- `follow`：保留一个主粒子与残影；多个主体时择一个，不能变成静止装饰。 范围 2.55–3.8 秒，可延长；增加时间由粒子持续运动填充。保留该段入场机制及尾部 `follow-out` cue。
- `anticipation`：保留中心圆、百分比与环形加载；只用一个百分比指标，不增加环数。 范围 2.15–3.2 秒，可延长；增加时间由圆点呼吸和刻度环旋转填充。保留该段入场机制及尾部 `anticipation-out` cue。
- `hello`：name 最多 12 字符，role 最多 22 字符，availability 最多 28 字符；超长精简。多人时择一位主角，不能横排多人名片。 范围 1.911333–3 秒，可延长；增加时间由圆点的轻微压缩、位移与文字呼吸填充。保留该段入场机制及尾部 `hello-out` cue。

总时长改变时优先由 easing、follow、hello 吸收，其次 spacing、type、anticipation；actions 的快速字卡固定。重新求和 CFG.duration，场景开始时间自动累加。
Chinese / CJK：heading 使用 Anton 400，body 使用 Caveat 400–700；均后接同字重 Noto Sans SC。繁体改 Noto Sans TC。交付前用真实中英文混排及标点捕获一帧检查缺字；没有中文字体时明确告知。
Brand-bound: hello 的 CLAUDE 姓名、职业与接洽短句必须按用户身份改写；type 的自我宣言也按用户主张在同一形式中重写，不能沿用原设计师身份。

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

## 来源

@himanshutwtxs：https://x.com/himanshutwtxs/status/2103495232637882858。仅作署名，不访问原链接。