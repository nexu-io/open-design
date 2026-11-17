---
name: mind-clarity-journey
description: 清晰心智主题的黑红剪影动效模板。
---

以 `example.html` 为影片起点；保留单 canvas 与 GSAP 主时钟，按 `CFG` 调整内容。

**Arc:** 清晰 → 成长 → 专注 → 想法 → 出发

| 场景（CFG.scenes id） | 时长 | 画面与含义 | 实现 | 复用 |
|---|---|---|---|---|
| `clarity` | 2.25 s | 头脑敞开，太阳升起再缩为水滴 | canvas 路径与射线，`sun-rise`、`mind-reveal`、`sun-sink` | 三个开场文字变量；保留升起与内收 |
| `growth` | 2.083333 s | 手臂举壶，头顶生出红色枝叶 | `water-pour`、`plant-grow`、`water-stop`；宽高联动生长、顶叶倾斜与循环水滴 | 无产品列表；保留浇灌因果 |
| `focus` | 2.166667 s | 手中火柴点燃，出现专注燃料文案 | `match-light`、`focus-reveal`、`fuel-reveal`；点火轮廓依次变形，随后轻微弯曲 | `focusLine`、`fuelLine` |
| `ideas` | 2.458333 s | 几何想法升起并落入头脑 | `ideas-rise`、`ideas-fall`；漂浮、收窄与分阶段碎裂 | 保留抽象形状的视觉节奏 |
| `doorway` | 1.397767 s | 人走向打开的红色门 | `door-open`、`journey-end`；门的透视与步态 | `portalArt` 为可替换图像 |

## 文件
复制 `example.html`、`assets/gsap.min.js`、`assets/arimo-400.ttf`、`assets/arimo-700.ttf`、`assets/arimo-OFL.txt`、`assets/portal-art.png`、`references/sound.json`，保持相对路径。封面为 `assets/cover.jpg`。`assets/soundtrack.mp3` 由运行器添加。所有字体和脚本均本地加载。

## Adapting the template
- `clarity`：可改 `mindLine`（12 字符）、`growthLine`（10）、`clarityLine`（13）；超长先精简或改写，不能缩小到难读。保留太阳升起、文字分行和缩为水滴的过程。可延长到 2.25–3.2 s，太阳呼吸和射线持续微动，离场由 `sun-sink` 与 `clarity-cut` 倒推。此场不是产品清单；多条信息只选最重要一句，少条信息保持三行可读语义。
- `growth`：可按主题改造正在生长的图形，保留水滴落下与枝叶生长的因果关系。范围 2.083333–3.1 s，延长时水滴持续到离场前 0.5 秒，成熟叶片和手臂仅微动。无文字长度限制；增加叶片最多保留五个主视觉元素，少于五个时围绕主茎平衡分布。
- `focus`：`focusLine`、`fuelLine` 各最多 12 字符，超长先精简。保留短暂转腕、回撤与回卷→分叉→窄长→稳定的点火形变，不改为静态图。范围 2.166667–3.2 s，延长时稳定火苗仅轻微弯曲，手在点燃姿态保持；不要添加整团火焰的周期缩放。多条文案选最核心一组，少条保留足够留白。
- `ideas`：可替换抽象符号，保留从头脑涌出、漂浮、落回的过程。范围 2.458333–3.6 s，扩展时持续旋转和升降。无文字；更多元素只保留最强的十个，较少元素围绕中央圆形分布。离场始终读取 `ideas-fall`、`ideas-cut`，在结束前 0.9 秒开始分阶段收窄与碎裂。
- `doorway`：可替换 `portalArt`，保留黑色门扇、景象揭示与走向门的人。范围 1.397767–2.1 s，延长时人物继续步行，不能停在最终姿势。无文案；只保留一个目的地，多个目的地选择最重要的一个。不能用静态人物替代步态。

总时长变化先由 `growth`、`ideas` 吸收，其次 `focus`、`clarity`，最后 `doorway`；没有绝对锁定场景，但不得低于各自 minDur。更新 CFG.duration 与所有场景之和，开始时间自动累计。离场 cue 使用 from: "end"。

Chinese / CJK：标题为 Arimo 700，正文为 Arimo 400，分别经 `--od-font-heading` 与 `--od-font-body` 回退到同字重 Noto Sans SC，再到系统中文字体；繁体中文改用 Noto Sans TC。交付改编前必须用真实中英混排和标点渲染一帧，检查缺字、方框与字体跳变。机器无中文字体时明确告知用户；只有用户指定时才增加专用中文字体。

Brand-bound: none

## Source
来源为 @higgsfield：https://x.com/higgsfield/status/2055166020831301636 。只用本地提供的 reference.mp4 分析；没有访问来源链接。参考片没有可见品牌或产品标识。保留原片英文文案及匿名几何人物，所有可表演元素由路径重绘。

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
