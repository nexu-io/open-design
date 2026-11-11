---
name: sky-water-tessellation
description: 鸟群与鱼群交错的黑白版画循环模板。
---

从 `example.html` 开始制作影片，保留本地资源的相对路径。

**Arc:** 版画鸟群拍翼 → 鸟鱼正负形交错 → 鱼群游动；三个空间层同时存在，没有剪切。

| Scene (`CFG.scenes` id) | Dur | Summary | Build | Reuse |
|-|-|-|-|-|
| `tessellation` | 4.266667 s | 上部鸟群飞行，下部鱼群游动，中间形成黑白负形 | 单 canvas；`flight-start` 启动连续位移，`cycle-end` 标记终点；翼面使用余弦拍动，位移线性、起伏正弦 | 读取 `fishLine`、`fishScale`、`fishFine`；保持鸟鱼尺寸和错位排列 |

## 资源
必须携带 `assets/gsap.min.js`、`assets/engraving.js`、`assets/fish-line.png`、`assets/fish-scale.png`、`assets/fish-fine.png`、`assets/Geist-400.ttf`、`assets/Geist-OFL.txt`、`references/sound.json`。`assets/cover.jpg` 是重建画面的封面。音频由任务运行器按原片情况处理；本次 ffprobe 实测原片没有音轨，未创建音频标签。

## Adapting the template
- `tessellation`：可替换三种鱼类图案，必须保持上鸟下鱼、中央正负形和逐层纹理密度变化。时长范围为 3–12 秒，未锁定；新增时间由持续拍翼、水平游动和纵向波动填充，不冻结画面。这里只有图像槽，没有文案，`maxLength` 不适用；新增文案应另加可读的独立区域，超长时缩写，不能缩到不可读。鱼类超过三种时选择最有辨识度的三种；少于三种时复用已有种类，保持空间密度。
- 总时长变化全部由 `tessellation` 吸收。调整 `dur` 与 `CFG.duration`，入口从场景起点计算，结束标记通过 `from: 'end'` 随片尾移动，不缩放局部动画时间。
- Chinese / CJK：`--od-font-heading`、`--od-font-body` 均为本地 Google Fonts Geist，随后使用同字重 Noto Sans SC 和系统中文字体；繁体替换为 Noto Sans TC。影片本身没有文字，字体仅用于预览控件。以后加入用户真实文案时，必须渲染中英混排及标点，检查缺字和方框；无中文字体时告知用户。字体角色不改变图案主体。
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

上述英文为按任务要求保留的官方音频规则；本参考没有音轨，故“示例音轨”说明只在运行器实际提供该资源时适用。

## 来源
@akella：https://x.com/akella/status/2107764940954091531 。仅记录归属，未抓取来源页面。此模板根据本地 `reference.mp4` 重建。
