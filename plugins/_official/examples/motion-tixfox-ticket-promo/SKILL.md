# TixFox 票务宣传片

从 `example.html` 开始制作；此文件是完整画面与唯一时间逻辑入口。

**Arc:** 提问 → 费用问题 → 品牌 → 定价 → 建活动与销售 → 购票 → 收款 → 检票 → 品牌收尾

## 文件
保留 `assets/gsap.min.js`、`assets/Roboto-regular.ttf`、`assets/Roboto-OFL.txt`、`assets/fox-logo.png`、`assets/fox-coin.png`、`assets/microphone.png`、`assets/ticket-qr.png`、`assets/fox-tickets.png`、`assets/RobotoMono-regular.ttf`、`assets/RobotoMono-OFL.txt` 和 `references/sound.json` 的相对路径。配乐文件为 `assets/soundtrack.mp3`，由运行器补入。

## 场景
| Scene (`CFG.scenes` id) | Dur | Summary | Build | Reuse |
|-|-|-|-|-|
| `hook` | 3.8 s | 开场提问 | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |
| `problem` | 2.65 s | 费用侵蚀票款 | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |
| `meet` | 1.95 s | 认识 TixFox | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |
| `pricing` | 5.05 s | 39¢ 定价与零固定费 | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |
| `make` | 5.9 s | 创建、分享及实时销售 | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |
| `checkout` | 4.3 s | 三次点击与二维码 | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |
| `paid` | 4.3 s | 即时转入银行 | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |
| `scan` | 3.65 s | 手机检票 | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |
| `close` | 6.94933 s | 品牌及行动入口 | 单 canvas，纯时间函数，文字 power3.out，入场及尾部 cue | 读取 CFG 品牌及活动变量，保持左右构图 |

## Adapting the template
- `hook`：开场提问。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 3.8–5.7 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
- `problem`：费用侵蚀票款。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 2.65–4 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
- `meet`：认识 TixFox。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 1.95–2.9 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
- `pricing`：39¢ 定价与零固定费。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 5.05–7.5 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
- `make`：创建、分享及实时销售。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 5.9–8.8 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
- `checkout`：三次点击与二维码。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 4.3–6.4 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
- `paid`：即时转入银行。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 4.3–6.4 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
- `scan`：手机检票。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 3.65–5.4 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
- `close`：品牌及行动入口。可替换对应品牌、活动与界面文字，保持原来的逐行揭示、橙色强调及左右构图；伸缩范围 6.94933–10.4 秒，未锁定。新增时间由狐狸呼吸、眨眼、卡片浮动或硬币旋转填充，退出必须读 end cue。品牌上限 12、网址 24、费用 7、活动名称 28 字符；超出先改短文案，不缩到难以阅读。产品种类多于四类时选最有代表性的四类，少于四类则居中分布，其他界面仍保留一个主活动。
总时长优先由 close、make、pricing 吸收，再调整其他章节；保持原来的事件先后顺序，所有 minDur 保证默认文案阅读，缩短时先删句再调范围。
Chinese：标题与正文均使用本地 Roboto；回退 Noto Sans SC，字重与 Latin 一致。繁体换 Noto Sans TC。交付改编前须用真实中英混排、标点渲染，检查缺字与意外回退；环境无中文字体时明确告知用户。
Brand-bound: hook、problem、meet、pricing、make、checkout、paid、scan、close 的 TixFox 品牌、39¢、零月费、实时销售、即时到账等都是原品牌内容；改编时以用户已确认信息同形式重写，未经确认的产品承诺删去，时间交给 make 与 close。不得在其他品牌影片里保留原狐狸、标志、活动地点或参考品牌措辞。

## Sound
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

The demo track is the reference film's own soundtrack.
When the film length changes, refit or replace the track using references/sound.json (bpm, sections).
To refit, cut the track at the original scene boundaries, time-stretch each piece to its new scene length with ffmpeg atempo (keep each factor within 0.8–1.25; beyond that, trim or loop that piece instead), join the pieces with 40 ms crossfades, fade in 0.15 s and out over the last second, and replace assets/soundtrack.mp3 with the result at exactly CFG.duration.

## 来源
原片由 @achxvi 发布：https://x.com/achxvi/status/2108212570096038173 。仅使用本地提供的 reference.mp4 分析，未获取来源网页。
