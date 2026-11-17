---
name: superx-audience-growth
description: "SuperX 受众增长产品宣传模板：火焰点燃品牌，产品操作连续转为增长数据。"
od:
  mode: video
  scenario: video
---

从 `example.html` 开始改编，它是本模板的完整影片。保留单画布、GSAP 主时间轴与纯时间函数 `render(t)`；默认内容完整保留 SuperX 原片身份。

**Arc:** 发布循环 → 品牌点燃 → 发现热门 → 内容写作 → 智能排期 → 互动增长 → 规模数据 → 行动收尾

## 参考文件

复制 `example.html`、`references/sound.json`，以及下列本地资源，保持路径：
- `assets/InstrumentSerif-400-Italic.ttf`
- `assets/InstrumentSerif-OFL.txt`
- `assets/Inter-400.ttf`
- `assets/Inter-500.ttf`
- `assets/Inter-600.ttf`
- `assets/Inter-700.ttf`
- `assets/Inter-OFL.txt`
- `assets/eli-post.png`
- `assets/x-mark.png`
- `assets/cover.jpg`
- `assets/gsap.min.js`
- `assets/mara-avatar.png`
- `assets/mara-post.png`
- `assets/nora-post.png`
- `assets/sam-post.png`
- `assets/superx-flame.png`

`assets/soundtrack.mp3` 是 runner 在交付后加入的演示音轨，是否复制它遵循下方 Sound 说明。字体许可证必须与字体一起保留。外部脚本与字体均不依赖 CDN。

## 结构与节奏

| 场景（CFG.scenes id） | 默认时长 | 画面与意义 | 实现与 cue | 可复用值 |
|---|---|---|---|---|
| `loop` | 1.883 s | 发布循环，点赞仍然稀少 | 大字弹入、卡片轻微漂移；post-word / hope-word / refresh-word / repeat-word / loop-out；expo.out / cubic.out | `postCopy` |
| `brand` | 1.817 s | 火焰点燃，逐字出现 SuperX | 裁切的火焰标识、粒子爆发、文字揭示；flame-ignites / wordmark-in / brand-out；expo.out / cubic.out | `brand / logoAsset` |
| `fire-wipe` | 0.200 s | 金色扩张圆露出内容墙 | 圆形遮罩与红色光晕；fire-expands；expo.out / cubic.out | `wallNoraAsset / wallSamAsset / wallEliAsset / wallPostAsset` |
| `discover` | 1.750 s | Mara Kent 的热门帖子浮到前景 | 红框卡片透视进入、缓慢落定、逐词主张与浏览量增长；wall-opens / viral-card / discover-line / discover-out；expo.out / cubic.out | `viralCopy / viralLine / viralAccent / avatarAsset` |
| `write` | 1.950 s | 编辑器逐字写入草稿 | 活文字卡片透视翻转、逐字输入、闪烁光标与旋转加载圈；draft-card / draft-typing / write-line / write-out；expo.out / cubic.out | `draftCopy / writeLine / writeAccent` |
| `schedule` | 1.900 s | 每周日历填入时间槽 | 逐格填入、独立时针、日历倾斜；calendar-in / slots-fill / schedule-line / calendar-tilt；expo.out / cubic.out | `scheduleLine / scheduleAccent` |
| `growth` | 1.700 s | 同一日历转成红色柱状图 | 同一投影平面、柱体错峰过冲回落、头像带残影沿弧线入场、绿色环扩散；bars-rise / growth-line / audience-orbits / growth-out；expo.out / cubic.out | `growthLine / accentWord` |
| `proof-flash` | 0.150 s | 浅金闪光连接到数据页 | 径向高光叠加；proof-burst；expo.out / cubic.out | `primary` |
| `metrics` | 1.783 s | 三行规模数据依次滚入 | 逐位数字滚轮、扩张同心环、火花、收缩旋转退场；creators-in / posts-in / impressions-in / metrics-out；expo.out / cubic.out | `creators / posts / impressions` |
| `close` | 1.928 s | 品牌、主张、按钮和网址收尾 | 字标揭示、按钮扫光、持续火花；close-brand / close-tagline / close-cta / close-settle；expo.out / cubic.out | `brand / tagline / accentWord / cta / domain / logoAsset / platformAsset` |

## Adapting the template

所有进场时间均为场景开始后的绝对秒数，所有退场和跨场过渡都读取 `from: "end"` cue。只修改 `CFG.scenes[].dur` 后自动累计起点，并将各段时长之和写回 `CFG.duration`。不按比例缩放场景内部动作。按变量声明中的 maxLength 缩短超长文案，不把字号缩至不可读。

- `loop`：1.883333–3.0 s，可替换 `postCopy`（75字符）与发布困境；保留四个大字节拍和点赞增长。增加时长时延长第四字后的卡片漂移与点阵烟云，不能固定一帧。帖文只有一张，多条内容选最强的一条，少于一条时改写为用户的一个痛点。
- `brand`：1.816667–2.6 s，可替换 `brand`（14字符）和 `logoAsset`；保留中心点燃后标识左移、字标揭示的动作。额外时间由火花与火光呼吸填充。只用一个主品牌，多品牌选择主办方，其余移到收尾说明；缺少标识时重建用户品牌的简单几何记号。
- `fire-wipe`：0.2–0.2 s，锁定。保留金色圆扩张后穿入帖子墙的转场，不加入文字或额外商品。无数量和文案限制；可替换墙面帖子图像，不能使用完整参考帧。
- `discover`：1.75–3.0 s，`viralCopy` 上限110字符，`viralLine` 35字符、`viralAccent` 12字符。保留一张帖子从墙中突出、红边发亮、浏览量上升。额外时间让背景帖子墙继续横移与分层纵移、深度轻微变化，前景卡片缓慢落定；退场的竖轴翻转跨入 `write`，保留两面连续性。更多内容仍只突出最强一条，余下可放在墙面；更少时保留一张真实案例。
- `write`：1.95–3.0 s，`draftCopy` 上限120字符、`writeLine` 24字符、`writeAccent` 24字符。保留热门帖子翻到编辑器的连续透视动作，以及稍后开始的草稿逐字出现与红色光标；延长时间时加载圈持续旋转、光标闪烁、内容墙漂移。只显示一份草稿，多份选择最具代表性的一份，不缩小编辑器。
- `schedule`：1.9–3.0 s，`scheduleLine` 上限40字符、`scheduleAccent` 14字符。保留7列4行日历、排期卡片错峰入场与时钟；延长时间依靠明显的指针转动和烟云。更多排期填空格，超过28项选核心时段；更少则留空格，保持周结构。`calendar-tilt` 从末端倒数，必须与后段投影连续。
- `growth`：1.7–2.8 s，`growthLine` 上限30字符、`accentWord` 12字符。保留日历平面变成七根错峰升高并过冲回落的柱体、随位置倾斜的暖色顶面，以及六头像沿独立弧线带残影入场和绿色环扩散。额外时间用柱顶轻微呼吸、头像环绕和高光移动填充；更多数据取7个代表点，更少插入合理的空位并重新计算列宽，不能虚构用户数据。
- `proof-flash`：0.15–0.15 s，锁定。无文案，保留暖金闪光；只有一个过渡，不受条目数量影响。
- `metrics`：1.783333–2.8 s，`creators` 上限8字符、`posts` 5字符、`impressions` 4字符。保留三行白色数字的逐位滚轮、静止红色单位与扩张暖色同心环；额外时间让背景烟云和微粒持续明显移动。超过三项只取最强三项，少于三项按实际数量垂直居中，禁止保留不属于用户的数字。
- `close`：1.928–3.0 s，`brand` 上限14字符、`tagline` 30字符、`accentWord` 12字符、`cta` 22字符、`domain` 28字符。保留上方品牌、中间主张、下方红色按钮与网址；`platformAsset` 是主张中的 X 平台标识，改编时换成用户平台标识或移除。额外时间让按钮高光、火花、光晕继续运动。只有一个行动目标；多个目标选主目标，缺少网址可移除该行。

总时长变化先由 `discover`、`write`、`schedule`、`growth`、`metrics` 和 `close` 吸收，再扩展 `loop`、`brand`；两段闪光始终锁定。超过范围时重排内容并更新场景表和音轨，不能把固定动作整体减速。

非 Latin / Chinese 文案：`--od-font-heading` 与 `--od-font-body` 均使用已打包的 Inter，后接同字重 Noto Sans SC；`--od-font-accent` 使用 Instrument Serif Italic，后接 Noto Serif SC。简体中文斜体不做伪造；繁体改为 Noto Sans TC / Noto Serif TC。交付前以用户真实的中英混排和标点渲染检查缺字与方框；若机器缺少中文字体，应告知用户。中文字体由 OD 注入，不打包系统字体。

Brand-bound: `brand`、`close` 的 SuperX 标识、品牌、网址和主张都要换成用户的对应内容；`discover`、`write` 的具体人物与帖子、`metrics` 的三组数字必须改为用户有依据的内容；`growth` 的头像缩写应换成用户自己的身份，不能把原片的人物、措辞、主张或数字带进改编片。若删去某项，将时间优先分给 `schedule` 与 `close`，保留相同表现形式。

## 预览与导出

唯一时钟为 `window.__timelines.main`。`window.__odRenderAt(t)` 会暂停、定位并直接重画，支持任意顺序跳转。字体与图像加载完成并等待两个动画帧后才暴露时间轴。预览保留 PLAY / PAUSE、进度条与时间；`html.od-export` 隐藏控制栏并把画布对齐输出原点并填满交付视口；不要恢复固定1920像素的导出CSS宽度，以免较小分辨率裁切。所有可指认的 Canvas 内容由 CFG 变量、场景 id 与 cue id 定位。

## Sound
The demo track is the reference film's own soundtrack.
`assets/soundtrack.mp3` ships as the demo track.
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

原片作者：@robj3d3。署名链接：https://x.com/robj3d3/status/2103875898349088830 。只使用本地 `reference.mp4` 分析，未访问来源帖子。火焰和静态帖子从局部画面裁切；动态产品操作、字标、文字和背景由代码重建。
