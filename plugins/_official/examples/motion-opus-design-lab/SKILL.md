# Opus Motion Design Lab

从 `example.html` 开始制作影片。它是一段 15.125 秒的浏览器工作台式动效实验室：上方是演示舞台，中间的像素向导指向当前控制项，下方是始终可见的六格代码面板。

**Arc:** spacing → typography → motion blur → easing → follow-through → anticipation → final delivery

| Scene (`CFG.scenes` id) | Dur | Summary | Build | Reuse |
|-|-|-|-|-|
| `spacing` | 1.967 s | 蓝球沿弧线弹跳，残影解释动作间距 | canvas 弹道与轮廓残影；`ball-release` 触发起跳 | 可替换 `accent`；保留带残影的弹跳教学机制 |
| `typography` | 1.800 s | 巨型「I MAKE THINGS / MOVE.」错落组装 | canvas 活字逐字进入；`words-stack` 与 `type-out` 控制进退场 | 可替换 `heroCopy`；保留上下两级尺度和蓝色句点 |
| `motion-blur` | 1.800 s | 黑底依次演示 STRETCH、SPIN、SNAP | canvas 拉伸残影、旋转和挤压；`stretch-hit` 触发第一击 | 可换主色；三个动作词和连续变形是签名 |
| `easing` | 2.900 s | 线性图变成 ease-in-out，方块沿轨道推进 | canvas 曲线、游标与卡片列；`linear-mark` 标记比较 | 可换双色；保留图表与实体方块的对应关系 |
| `follow-through` | 2.733 s | 蓝色主体在点阵中绕行并拖出红蓝尾迹 | canvas 粒子链按时间采样；`trail-turn` 标记转弯 | 可换双色；保留延迟尾迹与点阵空间 |
| `anticipation` | 1.967 s | 环形仪表从 0% 蓄力到 100% | canvas 同心圆、刻度与充能弧；`gauge-fill` 开始充能 | 可换主色；保留由跟随轨迹变成仪表的观感 |
| `final-delivery` | 1.958 s | 「MOTION DESIGNER / CLAUDE.」锁定收尾 | canvas 两级标题与蓝色句点；`name-build` 触发排版 | 可替换 `designerRole`、`designerName`；保留上下堆叠和句点 |

## Adapting the template

- `spacing`：可改主色和注释，但弹跳、残影与基线必须保留。范围 1.5–3.0 秒，增加时由循环弹跳和页面轻微呼吸填充。此场景不显示可替换长文案；若需要更多示例球，只保留一个主球，其余作为更淡的轨迹样本。
- `typography`：可改 `heroCopy`，上限 20 个字符；超出时先缩短文案，不要把主标题缩到失去冲击力。范围 1.6–3.0 秒，额外时间由逐字微漂和句点呼吸填充。单词多于四个时仍分两行，并把最强动词独占第二行；更少时保持第二行的单词更大。
- `motion-blur`：可改色彩，不建议改 STRETCH / SPIN / SNAP 三词及其顺序，因为三种变形组成教学签名。范围 1.5–2.5 秒，额外时间按相同顺序循环轻量残影；若增减示例，优先保留三项，不新开第二行。
- `easing`：可改曲线说明与双色，但必须保留“曲线 + 运动方块”的对应展示。范围 2.5–4.2 秒，额外时间由游标沿曲线循环和方块轮替填充。说明文案宜不超过 18 个字符；更长时缩短说明。示例多于八个时加快轮替，不增加第二排。
- `follow-through`：可改粒子颜色，主体领先、尾部延迟的关系必须保留。范围 2.4–4.0 秒，额外时间由轨迹继续绕行填充。没有长文案；若增加粒子数量，应延长尾部密度而不是增加第二条主轨迹。
- `anticipation`：可改主色和百分比样式，但必须保留蓄力圆环从低值到 100% 的动作。范围 1.7–3.0 秒，额外时间由中心呼吸和刻度轮转填充。若需要多个指标，只展示最重要的一个，不把环拆成多个小仪表。
- `final-delivery`：可改 `designerRole`（上限 24 字符）和 `designerName`（上限 16 字符）；超出时先精简，不得把姓名缩到低于主标题的视觉级别。范围 1.7–3.0 秒，额外时间由蓝色句点呼吸和页面微漂填充。只有一个署名；若用户提供多个名字，合并为团队名。

改变总时长时，优先让 `easing`、`follow-through` 和 `anticipation` 吸收时长，其次是 `spacing`；`motion-blur` 尽量维持原始节拍。所有离场与转场都读取 `from: "end"` 的 cue，不要手写场景尾部时间。

页眉两张品牌卡分别由 `anthropicLogo`、`claudeCodeLogo` 提供，面板右下的交付预览由 `previewStrip` 提供；替换时保持原始宽高比和当前卡片尺寸，不要把整张页面截图放进这些槽位。

非拉丁文案：标题使用已打包的 Barlow Condensed，正文使用已打包的 Barlow；两者的简体中文后备均为 Noto Sans SC，并使用与拉丁字面匹配的字重。繁体中文改用 Noto Sans TC。交付前要用用户的真实文案（包括标点和中英混排）渲染一帧，确认没有字形回退错位或方框；如果执行环境完全没有 Chinese/CJK 字体，应明确告知用户，而不是直接交付。

## Sound
`assets/soundtrack.mp3` is the reference film's own soundtrack.
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
  duration. When the film length changes, refit or replace the track using
  references/sound.json (bpm, sections). Edit the selected track with a
  deliberate ending/fade; use the same edited local file in HTML and MP4.

For background music keep `id="soundtrack"`, `data-start="0"` and a numeric
`data-volume`; update `src` and `data-duration` to the actual edited asset and
film. Remove unused demo audio from the generated composition. The `<audio>`
element stays inside the composition root, and sound follows the master timeline.

## Source

参考影片由 [@beamnxw](https://x.com/beamnxw/status/2112180280110776797) 发布；本模板仅重建其画面结构、文字、节奏与动效机制。
