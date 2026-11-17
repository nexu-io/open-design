# Claude 动效设计团队

从 `example.html` 开始修改，这是可确定性逐帧寻址的画布影片。

**Arc:** 引子 → 打字标题 → 请求 → 并行任务 → 设计团队 → 实时预览 → 配色变化 → 完成 → 收尾

关键 cue：title-typed（打字完成）、prompt-typed（请求完成）、prompt-submit（提交推近）、preview-launch（预览标题）、preview-feedback（换色请求）、palette-finished（完成状态）。

## 文件
保留 `example.html`、`assets/gsap.min.js`、`assets/Inter-Variable.ttf`、`assets/Inter-OFL.txt`、`assets/animator-label.png`、`assets/typographer-label.png`、`assets/sound-label.png`、`assets/colorist-label.png`、`assets/editor-label.png`、`assets/claude-label.png`。声音结构见 `references/sound.json`，演示音轨为 `assets/soundtrack.mp3`，由运行器添加。

## 分镜
| Scene (`CFG.scenes` id) | Dur | Summary | Build | Reuse |
|---|---|---|---|---|
| `introducing` | 0.9 s | 引子 | 单画布；`introducing-in` 入场，`introducing-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `cursor` | 1.2 s | 光标 | 单画布；`cursor-in` 入场，`cursor-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `title` | 3.45 s | 打字标题 | 单画布；`title-in` 入场，`title-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `prompt` | 4 s | 输入请求 | 单画布；`prompt-in` 入场，`prompt-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `tasks` | 2.7 s | 并行任务 | 单画布；`tasks-in` 入场，`tasks-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `claim` | 2 s | 设计团队 | 单画布；`claim-in` 入场，`claim-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `preview` | 3.6 s | 实时预览 | 单画布；`preview-in` 入场，`preview-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `palette` | 1.5 s | 更换配色 | 单画布；`palette-in` 入场，`palette-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `completed` | 1.65 s | 完成提示 | 单画布；`completed-in` 入场，`completed-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |
| `close` | 1.616 s | 品牌收尾 | 单画布；`close-in` 入场，`close-out` 尾部衔接，三次缓出 | 替换 CFG 文案；保留光标驱动的因果关系 |

## Adapting the template
- `introducing`：可改引子短句；保持中心小字。 范围 0.9–1.35 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `cursor`：替换 claudeLabel 图像；保持圆点与光标接近。 范围 1.2–1.8 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `title`：替换 brand（14 字符）、product（28 字符）和角色标签；保持逐字打入、镜头推近后拉远。 范围 3.45–5.175 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `prompt`：替换 request（48 字符）；保持输入、按钮显现、光标提交与推近。 范围 4–6 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `tasks`：重写三项任务及其说明；保留三色并行进度线。 范围 2.7–4.05 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `claim`：按新品牌重写设计团队主张；保留两行大字和渲染状态。 范围 2–3 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `preview`：替换 launchTitle（18 字符）和预览内容；保留实时窗口、出现的标题与三角色协作。 范围 3.6–5.4 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `palette`：可换三套调色板；保持配色选项出现、选中与横向覆盖。 范围 1.5–2.25 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `completed`：可重写完成状态；保留绿色勾与状态药丸放大。 范围 1.65–2.475 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。
- `close`：替换 brand（14 字符）、product（28 字符）及行动请求；保留居中大字与 Claude 光标。 范围 1.616–2.424 s，不锁定。延长时保留光标往复漂移、进度变化或文字轻移；不得冻结。文案超限先精简，不缩小到不可读。此段只展示一个主对象；增加对象时优先择最强的一项，任务与配色最多保留三项，减少时居中重排。

总时长变化优先由 tasks、preview 与 claim 吸收，再延长其余段；入场速度不随场景时长缩放，退出使用 from: "end" cues。无固定锁定段。

Chinese/CJK：标题与正文均使用随包 Inter，随后回退同字重 Noto Sans SC 与系统中文字体；繁体改用 Noto Sans TC。交付真实用户文案前，包含标点及中英混排渲染检查；若环境缺少中文字体应明确告知，避免方框。

Brand-bound: cursor、title、prompt、tasks、claim、preview、palette、completed、close 绑定 Claude 的名称、标签、产品能力及行动请求；换品牌时用相同形式重写主张、界面和标签，替换参考图片，不沿用 Claude 的身份素材。无需该产品主张时删去 claim，其时长并入 preview。

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
@motion_so：https://x.com/motion_so/status/2084690374833143893 。仅依据本地 reference.mp4 复刻，未访问来源链接。
