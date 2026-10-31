---
name: distilbook-explainer
description: DistilBook 手绘讲解产品演示模板。
od:
  mode: video
  scenario: video
---

从 `example.html` 开始制作；它是本模板的完整影片。参考品牌、产品、文案和数字保持原样，用户明确改编时再通过 CFG 替换。

**Arc:** 教师手写引子 → 品牌 → 添加资料 → 审核脚本 → 同步绘图 → 速度 → 风格 → 画幅 → 语言 → 品牌定制 → 收尾。

## 结构

| 场景（CFG.scenes id） | 时长 | 画面摘要 | 构建方式 | 复用内容 |
|---|---:|---|---|---|
| `hook` | 2.0 s | 教师不照读，而是画出来 | 单画布，hook-line、hook-answer 逐字裁切，expo.out；hook-underline 划线 | 手写形式保留，文字按用户主张重写 |
| `intro` | 1.9 s | 三色书本与 DistilBook | books-land 三书错峰下落；brand-in 活字揭示 | brand、tagline、books |
| `add` | 5.75 s | 添加资料与上传完成 | add-enter 卡片上移，file-float、file-drop、upload-done 进度与光标 | material 与产品资料格式 |
| `edit` | 6.0 s | 阅读脚本，改 holes 为 pores，批准 | script-fill 填字；word-select、word-change、script-approved | 文案与审核流程 |
| `draw` | 6.467 s | 手绘植物吸水进入工厂 | draw-enter、water-reveal、plant-reveal、factory-reveal 分区蒙版显现 | leafFactory、plant、water、factory |
| `speed` | 1.75 s | 划掉一周，约六分钟 | speed-enter、six-in 分行揭示；时钟按 t 转动 | minutes |
| `styles` | 4.133 s | 多种手绘与动效风格 | styles-enter 画廊上移，独立样张映射四边形，styles-select 选中框 | style1–style12 |
| `formats` | 1.9 s | 横屏转竖屏 | formats-enter；phone-slide 手机框在图上三段滑动 | formatArt |
| `languages` | 2.1 s | 19 种旁白语言 | languages-enter 数字递增与标签错峰 | languageCount、hindi |
| `branding` | 1.767 s | 用户标识与品牌色 | branding-enter、your-logo-in 标识弹入；色点错峰 | price、brandArt、yourLogo |
| `close` | 6.287422 s | 品牌、免费试用及网址 | close-books、close-brand、close-cta、close-click；按钮连续光带 | brand、tagline、domain、books |

标题和正文另有 hookStatement、hookAnswer、addHeading、addDescription、editHeading、editDescription、drawHeading、drawDescription、speedDescription、stylesDescription、formatDescription、languageHeading、languageDescription、brandingHeading、freeTrial 变量。换行符固定分行；改编时仍遵守下述每段行数限制。脚本示例集中在 CFG.scriptLines 与 CFG.editedScriptLine。

所有离场都是同名 `*-out` 的末端 cue，使用 `from: "end"`。场景起点由 dur 累加，不另存绝对时间。`render(t)` 无历史状态；`window.__odRenderAt(t)` 支持任意前后跳转。一个 canvas 绘制全部内容，GSAP 主时间轴是唯一播放时钟。等待本地字体、图片和两次动画帧后才暴露时间轴。

## 文件

携带 `example.html`、`references/sound.json` 和以下本地资源，保留目录。不得复制参考视频或把整帧当背景。
- `assets/books.png`
- `assets/brand-art.png`
- `assets/factory.png`
- `assets/format-art.png`
- `assets/gsap.min.js`
- `assets/hindi.png`
- `assets/inter-OFL.txt`
- `assets/inter-100-900.ttf`
- `assets/leaf-factory.png`
- `assets/patrickhand-400.ttf`
- `assets/patrickhand-OFL.txt`
- `assets/plant.png`
- `assets/style-01.jpg`
- `assets/style-02.jpg`
- `assets/style-03.jpg`
- `assets/style-04.jpg`
- `assets/style-05.jpg`
- `assets/style-06.jpg`
- `assets/style-07.jpg`
- `assets/style-08.jpg`
- `assets/style-09.jpg`
- `assets/style-10.jpg`
- `assets/style-11.jpg`
- `assets/style-12.jpg`
- `assets/water.png`
- `assets/your-logo.png`

## Adapting the template

- `hook`：可重写教师比喻，保留黑色手写第一句、蓝色回答和手画下划线。1.8–3.0 秒，额外时间以手写块轻浮动填充。第一句最多 45 字符、回答最多 18 字符；超长先改短，不缩小字号。始终两句，更多论点移到后面的产品演示。
- `intro`：可换 brand（16）、tagline（64）、books 图，保留三书落下再出字标。1.9–2.5 秒，书标轻浮动；多标识只留主标，少于三本仍保留三色抽象条。长品牌先缩写，长描述改短。
- `add`：可换 material（32）及格式示例，保留漂浮文件进入上传区并变成完成卡。4.5–8.5 秒，额外时间让面板漂浮及进度光条持续行走。资料增加时只选最强四种格式，减少时居中排剩余徽章；长文件名用中间省略号。
- `edit`：可换产品脚本文案和编辑词，保留选词、替换、绿色已编辑状态、审批按钮。5.5–9.0 秒，额外时间以面板浮动与光标移动填充。两行主标题每行 20 字符以内，每个脚本段最多两行；长句先重写，段数增减时优先只保留三段示例。
- `draw`：可换四张教育图片，保留由语音语义触发的分区显现。6.467–9.0 秒，植物、面板缓慢浮动，进度条继续前进。左标题三行，每行 14 字符，说明三行，每行 24 字符。不要在 HTML 中重写旁白字幕，OD 按新旁白生成。多步骤合并为植物、水、工厂三个关键动作，少步骤则移除对应图块，保留空白阅读空间。现版是静态底图的分区蒙版，不含可编辑的原始笔划。
- `speed`：可换 minutes（1–99），保留旧耗时划除和新耗时大字，时钟一直转。1.75–2.5 秒。主句最多 24 字符，辅助句最多 42 字符；多个速度指标只保留最重要一个。
- `styles`：可换 style1–style12，保留倾斜大画廊、边缘淡出、依次点亮。3.5–6.5 秒，额外时间持续平移并轮换选择。标题最多两行，每行 26 字符，长文重写；超过 12 张时挑选代表性最强的 12 张，少于 12 张时重排格子或循环现有样张，不虚构新样张。
- `formats`：可换 formatArt 和渠道说明，保留横画布上竖框滑动。1.9–3.0 秒，额外时间让框循环扫描，面板轻浮动。主标题最多 18 字符，说明最多 60 字符；多画幅只选横竖两种示范，不增加第三层框，缺少某画幅能力则重写为实际支持的两种视窗。
- `languages`：languageCount 必须与标签列表同步，范围 1–19；增加真实语言需扩充 langs 并分第二页，不能只增加数字。2.1–3.5 秒，标签持续缓慢浮动。主标题最多 24 字符、说明两行每行 32；长语言名优先用常见本地简称，少于 19 项保留三列网格并移除空行。
- `branding`：可换 brandArt、yourLogo、price（8）。1.767–3.0 秒，面板漂浮、色点呼吸。主标题两行每行 20 字符、说明最多 56；多标识只展示主标和三个主色，减少色点则居左紧排。长价格写币种缩写或简短金额，不缩正文。
- `close`：可换 brand（16）、tagline（64）、domain（24），保留书标、字标、试用文案和蓝色胶囊网址。4.0–9.0 秒，额外时间按钮光带持续扫过、光标轻动。一个主 CTA；多链接选主要一个，长网址先用短域名。按钮也会随超出默认宽度的网址扩宽，避免压住前导文案。

总时长改变时优先由 close、add、edit、styles 吸收，再调整其余段。所有场景都有 minDur/maxDur，当前无完全锁定场景；片尾离场和各段离场始终锚到末端。若 draw 的语音改变，先重配图与声音，再延长 dur，不按比例拉慢所有入场。保持 CFG.duration 等于 dur 之和，并更新根节点属性。

Chinese / CJK：`--od-font-heading`、`--od-font-body` 使用本地 Inter，后备 Noto Sans SC；手写 Patrick Hand 后备 Noto Sans SC。粗体与正文匹配各自字重。繁体换 Noto Sans TC。改编交付前，用用户真实中文、标点与中英混排渲染检查缺字和字体回退；无中文字体的机器需明确告知。中文字体由 OD 提供，不在包内另带。超过上述字符容量应改短文案，不牺牲可读性。

Brand-bound: hook、intro、close 的品牌主张须重写为用户品牌；add、edit、draw 的产品流程和光合作用示范须换成用户产品及原创素材；speed 的六分钟、languages 的十九种语言、branding 的十五美元必须改成可验证的用户数据；formats 的画幅能力和 styles 的示例素材必须换成用户实际支持与拥有的内容。不能保留原品牌标识、参考图中的人物或原文，删除能力段时将时间交给 add、edit、close。

## Sound

The demo track is the reference film's own soundtrack.
`assets/soundtrack.mp3` 由 runner 交付时添加；声音结构见 `references/sound.json`。
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

来源作者 @ajith_io： https://x.com/ajith_io/status/2103469807375208546 。仅作为署名，不抓取源链接。原品牌与文案按内部评测要求保留。
