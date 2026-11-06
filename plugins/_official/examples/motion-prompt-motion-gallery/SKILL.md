---
name: prompt-motion-gallery
description: Prompt Motion 网页作品浏览与形态变换演示。
---

从 `example.html` 开始制作；这是可寻址、单 Canvas、GSAP 主时钟驱动的完整影片。

**Arc:** 作品浏览 → 播放器形变 → 返回 → 图片打印演示 → 返回首页。

| 场景（CFG.scenes id） | 时长 | 画面与信息 | 构建方式 | 复用方式 |
|---|---|---|---|---|
| gallery | 4.70 | 页面标题、订阅卡与四列作品墙上下浏览 | Canvas 重建网页；gallery-open 弹窗进入 | brand、headline、独立图片变量 |
| player | 4.50 | 按钮→加载→勾选→音乐播放器→音量条 | player-loader、player-check、player-island、player-expand、player-play、player-scrub、player-volume；实测过冲回落，文字分层去模糊显现 | album 与右侧截图可替换；保持同一黑形体 |
| browse | 1.20 | 关闭演示，回到作品墙，再打开图片演示 | player-out 退出；photo-enter 进入 | 保留鼠标驱动的浏览节奏 |
| photo | 4.05 | develop.→圆点→按钮→光圈→门洞照片→九宫格 | photo-dot、photo-pill、photo-label、photo-iris、photo-open、photo-grid；photo-out 退出 | wordmark、door 与照片变量 |
| close | 0.739333 | 弹窗收回，作品墙继续播放 | photo-out 尾部过渡；作品缩略图循环 | brand、headline 与作品素材 |

## 素材与结构

`CFG.duration` 是总长唯一来源，场景起点由 `CFG.scenes` 累加，`CFG.cues` 的尾部事件使用 `from: "end"`。时间函数没有跨帧状态。预览入口为 `window.__odRenderAt(t)`；播放条控制 `window.__timelines.main`。

将 `example.html`、`references/sound.json` 及下面列出的本地资源一起复制，保留路径。所有图片都有同名的 CFG 图片变量；文字输入为 `brand`（24 字符）、`headline`（110 字符）、`wordmark`（8 字符）。复杂作品缩略演示采用独立原图截图加重绘运动；需要更换品牌时连同嵌入文案的截图一起换。

- `assets/album.png`
- `assets/avatar-LexnLin.png`
- `assets/avatar-LinearUncle.png`
- `assets/avatar-Majin_AppSheet.png`
- `assets/avatar-Ror_Fly.png`
- `assets/avatar-ajith_io.png`
- `assets/avatar-alex_prompter.png`
- `assets/avatar-davidmarcus.png`
- `assets/avatar-emollick.png`
- `assets/avatar-gabrielbuzziv.png`
- `assets/avatar-himanshutwtxs.png`
- `assets/avatar-itsolehmann.png`
- `assets/avatar-jacksonfall.png`
- `assets/avatar-kloss_xyz.png`
- `assets/avatar-sab8a.png`
- `assets/avatar-samuel_yostt.png`
- `assets/avatar-shneural.png`
- `assets/avatar-stephanlivera.png`
- `assets/avatar-steventey.png`
- `assets/avatar-tdinh_me.png`
- `assets/avatar-thatyto_dev.png`
- `assets/avatar-thismacapital.png`
- `assets/avatar-ultimaxbt.png`
- `assets/avatar.png`
- `assets/door.png`
- `assets/geist-OFL.txt`
- `assets/geist-variable.ttf`
- `assets/gsap.min.js`
- `assets/inter-OFL.txt`
- `assets/inter-variable.ttf`
- `assets/newsletter.png`
- `assets/photo-arch.png`
- `assets/photo-cyclist.png`
- `assets/photo-earth.png`
- `assets/photo-green.png`
- `assets/photo-nebula.png`
- `assets/photo-portrait.png`
- `assets/photo-sunset.png`
- `assets/photo-valley.png`
- `assets/tile-ascii.png`
- `assets/tile-ball.png`
- `assets/tile-blue.png`
- `assets/tile-claude.png`
- `assets/tile-creator.png`
- `assets/tile-dis.png`
- `assets/tile-drop.png`
- `assets/tile-every.png`
- `assets/tile-icons.png`
- `assets/tile-japan.png`
- `assets/tile-launch.png`
- `assets/tile-math.png`
- `assets/tile-money.png`
- `assets/tile-motion.png`
- `assets/tile-move.png`
- `assets/tile-negroni.png`
- `assets/tile-play.png`
- `assets/tile-price.png`
- `assets/tile-prompter.png`
- `assets/tile-purple.png`
- `assets/tile-spark.png`
- `assets/tile-theatre.png`
- `assets/tile-wire.png`
- `assets/tile-woman.png`
- `assets/ui-photo-code.png`
- `assets/ui-photo-long.png`
- `assets/ui-photo-scroll.png`
- `assets/ui-photo-short.png`
- `assets/ui-player-code.png`
- `assets/ui-player-long.png`
- `assets/ui-player-scroll.png`
- `assets/ui-player-short.png`
- `assets/cover.jpg`：模板封面。
- `assets/soundtrack.mp3`：由 runner 加入的参考原音轨。

`player-expand` 位于 player 场景内 1.591667 秒。岛形到卡片的大小、封面位置与过冲使用参考逐帧测量的相对时间关键点；标题、副标题、进度和播放控件分别显现，不能把卡片直接设成最终尺寸。`player-play` 之后沿用原来的拖拽和音量演示。

提示词滚动素材：`ui-player-scroll.png` 和 `ui-photo-code.png` 是独立右栏拼接长图，`PROMPT_FLOW` 保存所属场景内的取样位移，绘制时在右栏裁切。换成长提示词时同步重做长图和位移记录；保留固定关闭按钮与底部箭头，不把这些控件拼进滚动图。播放器长图从场景内 2.05 秒开始滚动，沿用既有长图与后续取样点；滚动条随内容位移。其余 ui 图片仍是 413×913 的独立栏截图。

## Adapting the template

- `gallery`：可换网站名、介绍、缩略作品和作者头像，保留四列瀑布流及先向下再回顶的浏览动作。范围 4.70–6.50 秒，额外时间由缩略图缩放、星芒旋转和播放器进度运动填充。brand 上限 24，headline 上限 110，超过上限先精简文字，不缩小字号。作品更多时继续向下排，较少时选最强作品重复排列以保持密度。
- `player`：可换封面、应用与曲目信息、右侧提示词截图，保留同一个黑色圆角形体连续变换。范围 4.50–6.50 秒；新增时间放在循环音量调整阶段，圆环、波形和进度条继续运动。本演示只显示一首曲目，更多项目只选一首代表作。截图文字需由新产品内容重做，trackTitle 最长 20、trackByline 最长 24、generateLabel 最长 12；超过时先缩短文案，不缩小字号。
- `browse`：可换所选作品，保留返回再点击另一作品的交互连接。范围 1.20–2.00 秒，作品缩略图持续运动。文字沿用 gallery 上限；更多作品留在墙中，主片只打开两项。
- `photo`：可换 wordmark、照片和右侧提示词截图，保留字标收缩、黑色按钮、光圈打开与照片展开这一机制。范围 4.05–6.00 秒，额外时间放在九宫格，照片组轻微呼吸缩放。actionLabel 最长 12 字符，wordmark 最长 8 字符，过长则用短名；九张照片不足时重复裁切，超过九张时选九张最有辨识度的。图片按参考裁切比例使用，避免把低分辨率原图放大超过 1.5 倍。
- `close`：可换作品墙内容，保留弹窗缩回与首页结束。范围 0.739333–1.50 秒，墙中各预览持续运动；文字限制和项目数量处理同 gallery。

改总长时优先增加 player、photo，再增加 gallery；browse、close 最后调整。没有硬锁定场景，所有场景均以绝对场景内秒数进场，离场以尾部 cue 驱动。不要整体缩放内部动画速度。

Chinese（中文）处理：`--od-font-heading` 使用本地 Geist，`--od-font-body` 使用本地 Inter，均以相同字重回退到 Noto Sans SC，再回退到苹方等系统中文字体。繁体中文换为 Noto Sans TC。交付前用真实中英混排与标点渲染一帧，检查方框与异常回退；机器完全没有中文字体时必须告知使用者。仅在用户指定时增加特定中文字体。

Brand-bound: gallery、browse、close 的 Prompt Motion、Claude 与作者作品内容，player 的曲目与提示词，photo 的 develop. 和照片素材：换品牌时全部改写或替换成用户内容，保持相同布局与形变机制；没有新演示素材时删去对应弹窗并把时间交给 gallery。

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

参考作者 @0xMovez：https://x.com/0xMovez/status/2108170313557016623 。没有访问来源链接；所有视觉分析、裁切与测量来自本地 reference.mp4。页面内的作品作者署名沿用参考截图。
