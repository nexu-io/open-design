# Flowdrive 动效展示

从 `example.html` 开始制作。此文件是影片源；拷贝 `assets/` 中所有图像、字体、许可证和 `gsap.min.js`，并读取 `references/sound.json`。参考原片保留 Flowdrive、Anthropic、Claude Code 和原文案。

**Arc:** 点阵文件 → 上传 → 分层流播 → 全球交付 → 域名安全 → 无限带宽 → Webflow → 品牌收尾

| Scene (`CFG.scenes` id) | Dur | Summary | Build | Reuse |
|-|-|-|-|-|
| `hook` | 1.300 s | 点阵文件 | 单 canvas；`hook-enter` 入场，`hook-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |
| `upload` | 2.400 s | 上传 | 单 canvas；`upload-enter` 入场，`upload-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |
| `flare` | 0.300 s | 橙色闪切 | 单 canvas；`flare-enter` 入场，`flare-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |
| `stream` | 1.650 s | 分层流播 | 单 canvas；`stream-enter` 入场，`stream-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |
| `global` | 1.750 s | 全球交付 | 单 canvas；`global-enter` 入场，`global-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |
| `secure` | 1.900 s | 域名安全 | 单 canvas；`secure-enter` 入场，`secure-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |
| `bandwidth` | 1.800 s | 无限带宽 | 单 canvas；`bandwidth-enter` 入场，`bandwidth-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |
| `webflow` | 1.700 s | Webflow 展示 | 单 canvas；`webflow-enter` 入场，`webflow-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |
| `close` | 2.347 s | 品牌收尾 | 单 canvas；`close-enter` 入场，`close-out` 从末尾计时退出；cubic.out | 保留本场视觉机制，可替换品牌与素材 |

## Adapting the template

所有场景的入场按绝对秒数执行，退出从 end cue 计时；不能把整场时间按比例缩放。文字超限先改短，不缩小至难以阅读。单个重点对象的结构不增加成密集列表，更多项目选最重要的一个；更少项目则保留一个。
- `hook`：可换文件内容；保留点阵聚合与播放三角，延长时点阵与外部角色持续运动。伸缩范围 1.300–1.950 秒，不锁定。
- `upload`：可换上传提示和文件；保留点阵进度条，延长时进度条微光、外部角色持续运动。伸缩范围 2.400–3.600 秒，不锁定。
- `flare`：保留橙色铺满过渡；无文字，延长时光晕与角色持续运动。伸缩范围 0.300–0.450 秒，不锁定。
- `stream`：可改分辨率文案，固定四层表示质量层级；保留透视堆叠与点阵，延长时层板漂浮。伸缩范围 1.650–2.475 秒，不锁定。
- `global`：可换全球交付指标；保留旋转点阵地球与路线，延长时继续转动。伸缩范围 1.750–2.625 秒，不锁定。
- `secure`：读取 domain（18 字符）；保留地址栏解锁到绿色安全态，延长时微浮动与角色持续运动。伸缩范围 1.900–2.850 秒，不锁定。
- `bandwidth`：可改带宽主张；保留发光无限符号，延长时粒子循环。伸缩范围 1.800–2.700 秒，不锁定。
- `webflow`：可替换 siteImage 和平台名；保留网页入场与旋转离开，延长时网页漂浮、角色持续运动。伸缩范围 1.700–2.550 秒，不锁定。
- `close`：读取 brand（18 字符）、tagline（70 字符）、logoImage；保留图标落位与品牌浮现。延长时轻浮动与角色持续运动。伸缩范围 2.347–3.520 秒，不锁定。

总时长变化优先由 secure、global、bandwidth 和 close 吸收；flare 优先保持参考长度。所有场景都有显著的外部像素角色绕边运动；不可在扩展时间后冻结画布。文案上限为 brand 18、tagline 70、domain 18 字符，超长先缩写或分行。页头中的固定原片文案在 headerImage 内，换品牌时必须换整张素材。

Chinese / CJK：标题使用捆绑的 Libre Caslon Display 400，回退 Noto Serif SC；正文使用 Inter 400，回退 Noto Sans SC。繁体改为 Noto Serif TC / Noto Sans TC。交付前必须渲染用户实际文案，含标点和中英混排，检查方框字与意外回退；机器无中文字体时明确说明。仅用户指定时另选中文字体。

Brand-bound: hook、upload 的文件造型可沿用形式但替换用户素材；stream 的 4K、global 的 200+、secure 的产品能力、bandwidth 的无限带宽均须改为用户真实主张；webflow 改为用户平台和网页；close 更换品牌、图标、标语和网址。所有场景的 headerImage、timelineImage、footerImage 含参考品牌与制作展示文字，适配时一并替换，不能保留他人品牌语境。

## Sound
`assets/soundtrack.mp3` 为演示音轨，由 runner 添加。
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

@beamnxw：https://x.com/beamnxw/status/2110039251681218763
地球轮廓重建使用 Natural Earth 公共领域 110m land 数据：https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson 。
