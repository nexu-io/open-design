# Windows Studio Launch

从 `example.html` 开始，保留本地 assets 路径。该文件是可直接播放和定位时间的完整影片。

**Arc:** 启动 → 发布 → 期待 → 演示 → 安装 → 反馈 → 品牌收尾

| Scene (`CFG.scenes` id) | Dur | Summary | Build | Reuse |
|---|---|---|---|---|
| `boot` | 5.85 s | 云朵天空中的 Windows 旗帜变为 HyperFrames 标志 | 单 canvas，`boot-in` 入场，`boot-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `desktop` | 3.95 s | 复古图标和发布标题进入桌面 | 单 canvas，`desktop-in` 入场，`desktop-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `launch` | 3.3 s | 产品窗口打开并嵌套播放发布演示 | 单 canvas，`launch-in` 入场，`launch-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `bluescreen` | 2.6 s | 蓝屏解释原先缺少 Studio | 单 canvas，`bluescreen-in` 入场，`bluescreen-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `asks` | 4.033 s | 十五张原始评论卡片铺满屏幕，出现解决方案 | 单 canvas，`asks-in` 入场，`asks-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `document` | 1.767 s | 文字处理器文档嵌入吉祥物视频 | 单 canvas，`document-in` 入场，`document-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `dance` | 4.233 s | 产品编辑器中吉祥物跳舞并戴上耳机 | 单 canvas，`dance-in` 入场，`dance-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `setup` | 5.534 s | 安装向导分三步展示 PR 和更新能力 | 单 canvas，`setup-in` 入场，`setup-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `errors` | 4 s | 警告窗口逐层叠起，邀请反馈 | 单 canvas，`errors-in` 入场，`errors-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `feedback` | 5.8 s | 输入反馈账号，展示修复进度与前后报告 | 单 canvas，`feedback-in` 入场，`feedback-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `modern` | 2.6 s | 现代桌面上再次展示产品窗口 | 单 canvas，`modern-in` 入场，`modern-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |
| `close` | 6.866333 s | 青绿渐变、品牌文字、吉祥物和网址收尾 | 单 canvas，`close-in` 入场，`close-out` 末端，power3.out | 修改 CFG 对应文案与图像，保留窗口层级 |

## Reviewed performance cues

`dance-headphones`（dance +2.57 s）驱动耳机缩放进入及手臂上举；`dance-confetti`（+2.63 s）驱动一次顶部彩屑爆发和下落。`close-dip`（close +0.83 s）和 `close-leap`（+1.23 s）控制前景大角色下蹲、上跃离场和品牌显露。保留这些相对时点与动作幅度，拉伸场景时不要把表演整体放慢；其余延长停留继续使用原有呼吸运动。

## Adapting the template
- `boot`：可替换该场景的文字和图片；保留“云朵天空中的 Windows 旗帜变为 HyperFrames 标志”的运动机制。伸缩范围 5.85–8.85 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `desktop`：可替换该场景的文字和图片；保留“复古图标和发布标题进入桌面”的运动机制。伸缩范围 3.95–6.95 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `launch`：可替换该场景的文字和图片；保留“产品窗口打开并嵌套播放发布演示”的运动机制。伸缩范围 3.3–6.3 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `bluescreen`：可替换该场景的文字和图片；保留“蓝屏解释原先缺少 Studio”的运动机制。伸缩范围 2.6–5.6 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `asks`：可替换该场景的文字和图片；保留“十五张原始评论卡片铺满屏幕，出现解决方案”的运动机制。伸缩范围 4.033–7.033 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `document`：可替换该场景的文字和图片；保留“文字处理器文档嵌入吉祥物视频”的运动机制。伸缩范围 1.767–4.7669999999999995 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `dance`：可替换该场景的文字和图片；保留“产品编辑器中吉祥物跳舞并戴上耳机”的运动机制。伸缩范围 4.233–7.233 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `setup`：可替换该场景的文字和图片；保留“安装向导分三步展示 PR 和更新能力”的运动机制。伸缩范围 5.534–8.533999999999999 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `errors`：可替换该场景的文字和图片；保留“警告窗口逐层叠起，邀请反馈”的运动机制。伸缩范围 4–7 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `feedback`：可替换该场景的文字和图片；保留“输入反馈账号，展示修复进度与前后报告”的运动机制。伸缩范围 5.8–8.8 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `modern`：可替换该场景的文字和图片；保留“现代桌面上再次展示产品窗口”的运动机制。伸缩范围 2.6–5.6 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。
- `close`：可替换该场景的文字和图片；保留“青绿渐变、品牌文字、吉祥物和网址收尾”的运动机制。伸缩范围 6.866333–9.866333000000001 秒，未锁定。额外时间由云团漂移、角色摇摆眨眼、光标闪动或渐变位移填充。文案以各变量 maxLength 为上限，超长先缩写，不缩小字号。评论少于十五张按原网格留空，多于十五张选择最有代表性的十五张；其他场景保持当前对象数量，新增内容另开场景。

调整总时长时，优先让 asks、setup、feedback 吸收额外时间，其次 desktop 与 close；同时更新 CFG.duration 和根节点 data-duration，场景总和须相等，末端 cue 保持 from: end。不得缩放场景内时间。

Chinese / CJK：--od-font-heading 使用本地 Inter 可变字体，--od-font-body 使用本地 Pixelify Sans，均后接同字重 Noto Sans SC 和系统中文字体；繁体换 Noto Sans TC。用真实用户文案（包括标点和中英混排）渲染检查缺字；如环境没有中文字体，明确说明。

延长出的停留区统一增加 2.5% 的连续镜头呼吸与缓慢平移，默认时长画面不改变。

## Files
- `assets/ask-0.png`
- `assets/ask-1.png`
- `assets/ask-10.png`
- `assets/ask-11.png`
- `assets/ask-12.png`
- `assets/ask-13.png`
- `assets/ask-14.png`
- `assets/ask-2.png`
- `assets/ask-3.png`
- `assets/ask-4.png`
- `assets/ask-5.png`
- `assets/ask-6.png`
- `assets/ask-7.png`
- `assets/ask-8.png`
- `assets/ask-9.png`
- `assets/bin.png`
- `assets/brand-symbol.png`
- `assets/cloud-0.png`
- `assets/cloud-1.png`
- `assets/cloud-2.png`
- `assets/cloud-3.png`
- `assets/cloud-4.png`
- `assets/cloud-5.png`
- `assets/cloud-6.png`
- `assets/cloud-7.png`
- `assets/computer.png`
- `assets/editor.png`
- `assets/gsap.min.js`
- `assets/inter-OFL.txt`
- `assets/inter-variable.ttf`
- `assets/launch-ui.png`
- `assets/pixelify-OFL.txt`
- `assets/pixelify-sans.ttf`
- `assets/cover.jpg`
- `references/sound.json`

## Sound
The demo track is the reference film's own soundtrack.
When the film length changes, refit or replace the track using references/sound.json (bpm, sections).
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


## Source
参考：@HyperFrames_，https://x.com/HyperFrames_/status/2114773205651275793 。品牌、产品、评论头像与原文均来自参考片。


## Round 2 动作补充

- `boot`：`boot-morph` 在场景内 3.65 秒启动；旗帜共享连续波形边界，尾迹随相位摆动，再经绿色四格变为符号，活文本乱码恢复到品牌和产品。延长时间仍使用 `boot-out` 从末端退出。
- `desktop`：`desktop-pointer` 驱动中央到图标的光标移动；`desktop-select` 选中品牌图标；`launch-open` 从场景结束前 0.04 秒开始展开窗口，并跨入 `launch`，不可改成硬切。保持已有文案长度和伸缩范围。
- `close`：`close-type` 到 `close-type-done` 揭示产品文字；选框扩张、字标居中和角色位置共用揭示进度。保留白青渐变与角色轻微持续动作，延长时在完整字标阶段停留，不能冻结角色。品牌更长时保持字标区宽度，优先缩短文案。
