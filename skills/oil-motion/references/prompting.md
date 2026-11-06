# 关键帧与视频提示词（Open Design 适配）

使用当前宿主的图片／视频工具，不要求 ZenMux，不调用外部凭据页或上游 image_job/video_job 脚本。已有视频或序列帧跳过生成。先检查工具是否支持参考图、首尾帧、透明通道和所需画幅；不支持时不能假装约束已满足。

按任务的真实容器锁定比例、尺寸和裁切策略；用已验收 K0/K1 约束一段连续变化。每段只承担一种主要变化。连续片段的第二段起使用上一段实际尾帧，并保留任务元数据。用实际解码结果核对时长、分辨率与帧数，不把请求值当作结果。先把第一段放入真实页面检查，再批量生产；宿主不允许额外验证时记录未验证项。

生成调用的字段、模型和权限遵循当前宿主工具定义，以下是可移植的构图与动作提示词，不是服务 API 参数。

## 通用身份锁定段

有角色时，先把 Identity Bible 的身份锚点（脸型五官、发型发色、服装配色、标志物、
体型比例、风格线条）写进这段，再放在动作描述前，并替换尖括号：

```text
Use the supplied first and last frames as the exact identity and design
references for <SUBJECT>. Preserve the same silhouette, anatomy, face, clothing or product
geometry, colors, line work, texture, and proportions in every frame. The
subject remains the same size and at the same anchored position throughout the
shot. Do not add, remove, duplicate, or redesign any body part, accessory,
feature, logo, control, or prop.
```

如果主体是插画，补充：

```text
Preserve the original illustration style exactly. Keep line thickness,
halftone texture, flat color regions, and edge sharpness consistent. Do not
turn the subject into volumetric CGI, photorealistic, painterly, or glossy imagery.
```

## 固定镜头段

```text
Locked camera and locked framing. No camera pan, tilt, zoom, orbit, shake,
reframing, perspective change, lens change, depth of field, or lighting change.
The body and contact point remain fixed. Only <ALLOWED_PARTS> may move.
```

只有镜头运动本身需要被滚动控制时才删除这段，并明确描述镜头轨迹。

## 场景背景段（baked 路线）

仅当 Concept Contract 锁定 `background_owner: video` 时使用。场景、环境光、地面
接触和景深就是要烧进视频的内容，必须明确锁定，保证多段之间连续：

```text
The scene is <SCENE_ANCHOR> with <LIGHTING> and <GROUND_CONTACT>. Keep the
environment, light direction, color temperature, ground contact, shadows, and
depth of field identical and continuous across the entire shot. The background
is part of the final picture: no chroma key, no flat color backdrop, no
background replacement, and no transparency.
```

多段叙事时，这一段在每条提示词中原样复用，并把上一段验收后的实际尾帧作为下一段
首帧输入。

## 视频色键段（page 路线）

仅当 Concept Contract 锁定 `background_owner: page` 时追加到视频提示词，图集和色键视频两条路线都用它。
首尾关键帧先由宿主支持透明输出的图片工具生成透明 PNG，再由
`composite_alpha_keyframe.py` 合成为视频输入；不要把这段用于图片提示词。默认 `#00FF00`，主体含绿色时改用 `#FF00FF`。

```text
The entire background is one perfectly uniform flat chroma-key <KEY_COLOR>
rectangle in every frame. No gradient, texture, noise, floor plane, horizon,
shadow, reflection, glow, particles, color variation, or lighting falloff on
the background. Keep the subject fully separated from all image borders with
generous padding. No cast shadow. No green/magenta object or reflected spill on
the subject. No text, subtitle, watermark, border, or UI.
```

模型未必严格生成指定色值，所以最重要的是四周和时间维度保持均匀。后续脚本会从边缘采样真实背景色。

## 转动与视向提示词

先按 [concepts.md](concepts.md) 的四种类型确认要转的是什么，再选下面的写法。

### 圆周注视

脸始终朝向镜头，视线沿屏幕前方的一圈顺时针移动，不能转出后脑勺：

```text
Create one continuous clockwise head and gaze rotation cycle. The face and eyes
of <SUBJECT> remain oriented toward the camera at all times; do not rotate around
to show the back of the head. An invisible target moves smoothly clockwise in a
circle on the front screen plane (12 o'clock looking up, 3 o'clock looking
right, 6 o'clock looking down, 9 o'clock looking left, returning cleanly to 12
o'clock). <SUBJECT> follows the target smoothly within a natural cone of vision,
tilting and rolling its head without leaving the front-facing half-sphere. Pass
through every intermediate angle at a constant rate without pausing or snapping.
End exactly at the first frame pose for a seamless loop. Keep torso and position
completely stationary. No blinking, idle sway, or deformation.
```

运行时用 `atan2(y, x)` 把指针方向映射到角度。

### 二维注视

见下文[指针二维动画](#指针二维动画)的二维采样。

### 水平摆头

只绕竖直轴转，不闭环：

```text
Move once continuously from looking left (-60 degrees) through center to
looking right (+60 degrees). Do not loop, do not return to start, and do not
pause at intermediate angles. Head turns only on the horizontal yaw axis; locked
vertical pitch, locked camera, locked scale, locked center anchor.
```

### 展台自转

真实产品的侧面和背面不能交给模型猜。先用产品参考图生成 0°、90°、180°、270° 四张关键帧，
再按 `K0 → K1 → K2 → K3 → K0` 分四段生成，每段转 90°：

```text
Use the supplied first and last frames as the exact geometry, material, color,
logo, control, and proportion references. Rotate the product clockwise around
its vertical center from the angle of the first frame to the angle of the last
frame at a constant angular speed. Locked orthographic-like camera, fixed scale,
fixed center, fixed lighting, no perspective breathing, no added details, no
deformation, no text changes, no logo changes.
```

只有背面不重要的小型物件，才用一张正面图配 `--loop-frame` 一次转完。

## 一镜到底连续镜头提示词

范式和交接关键帧的定法见 [concepts.md](concepts.md)。每段只负责一级变化，首尾帧就是交接关键帧。
所有范式共用一个骨架，只替换镜头句和范式句：

```text
Use the supplied first and last frames as exact composition anchors.
<CAMERA_CLAUSE> <PARADIGM_CLAUSE> No cuts, dissolves, jump pans, rotational
drift, or sudden speed changes. Arrive exactly at the framing, scale, and
alignment of the last frame. Every intermediate frame must read clearly when
playback stops.
```

镜头句：推进用 `The camera moves forward in one uninterrupted dolly at a steady speed toward <TARGET>.`；
机位不动用 `The camera stays completely locked.`

| 范式 | `<PARADIGM_CLAUSE>` |
|---|---|
| 尺度穿透 | `The center subject <TARGET> stays exactly at the center while the surroundings expand past the frame edges, passing through <INTERMEDIATE_LAYERS>.` |
| 遮挡转场 | `A large foreground <OCCLUDER> crosses the lens and fills the entire frame by the last frame. Exposure stays constant.` |
| 形状匹配 | `The <SHAPE> outline keeps exactly the same screen position and size while its surface transforms from <SUBJECT_A> into <SUBJECT_B>.` |
| 时间流转 | `Only materials and lighting change, continuously from <STATE_A> to <STATE_B>; silhouette, geometry, and perspective never change.` |
| 倒影穿越 | `The camera pushes into the reflection on <REFLECTIVE_SURFACE>; the reflected scene grows sharper until it fills the frame as the real scene of the last frame.` |
| 剖切穿墙 | `As the camera reaches the wall of <STRUCTURE>, the surface dissolves into a clean cutaway that reveals <INTERIOR>, without slowing down.` |

## 产品拆解与爆炸图

先根据真实产品参考图分别生成完整态和爆炸态图片。两张图都通过人工验收后，再作为精确首尾帧；
不要让视频模型凭文字发明最终结构。

```text
Use the supplied first and last frames as exact geometry, identity, material,
logo, component-count, alignment, camera, lighting, and composition references.
Create one continuous transformation from the fully assembled <PRODUCT> to the
approved exploded view. Separate the existing shell, display, battery, boards,
connectors, cameras, and fasteners only along their physically plausible axes.
Preserve every component's exact shape, scale, orientation, color, and relative
order. Keep all parts readable and non-overlapping at the final state. No new,
missing, duplicated, melted, or redesigned components. No cuts, camera changes,
scale breathing, motion blur, labels, or unrelated motion. Every intermediate
frame must be a stable reversible assembly state suitable for scroll scrubbing.
```

爆炸方向、间距、部件数量和最终构图必须先在尾帧图片中确定。视频负责从完整态连续过渡到
该尾帧；文字标注、数字和部件高亮在生成后由程序覆盖，避免 AI 视频生成不稳定文字。

## 镜头穿越

镜头运动本身是交互内容时，不使用固定镜头段，改为明确一条可逆轨迹：

```text
Create one continuous forward camera move from <START_VIEW> to <END_VIEW>.
Follow the supplied path through <ORDERED_LANDMARKS> without cuts, orbiting,
sideways drift, speed jumps, focus pumping, or lens changes. Keep product
geometry, lighting, scale relationships, and landmark positions consistent.
Every frame must remain sharp and readable when scroll playback stops. The
reverse frame order must also form a natural backward move.
```

长距离穿越不要只给起点和终点。先生成路径上的中间关键帧，保证主体、空间地标、比例和风格
一致，再把相邻关键帧分别生成短视频。

## 多段关键帧串联

先建立 `K0 → K1 → K2…Kn`：

- 第 `i` 段以 `Ki` 为首帧、`Ki+1` 为尾帧；`chain` 模式下第 2 段起的首帧换成上一段的实际尾帧。
- 所有关键帧复用同一组参考图、画幅、风格约束、主体比例和场景设定。
- 每段只写一个主要变化。
- 拼接后逐帧检查接缝；若接缝不稳，重做对应短片，不重做整条时间轴。

实际尾帧接力、SHA-256 校验和误差累积处理按 [qa.md](qa.md) 的“连续帧链”执行。

## 指针二维动画

二维输入不能只靠一条左右转头视频准确表达。优先选择以下方案：

### 方案 A：角度足够

指针远近不影响姿态时，用[圆周注视](#圆周注视)生成完整方向环。距离只影响平滑速度或回正强度。

### 方案 B：二维采样

生成固定网格中的多个短片或关键姿态，例如：

```text
Generate the same subject and framing for target position <X_POSITION>,
<Y_POSITION>. Keep the exact body anchor, subject scale, lighting, style, and
background used in every other grid sample. Move only <ALLOWED_PARTS> toward
that target and settle naturally. No entrance or exit motion.
```

二维网格至少覆盖左上、上、右上、左、中、右、左下、下、右下。用程序统一锚点和尺寸，再做双线性邻域选择或插值。不要要求模型在一条视频中遍历网格后直接随机访问。

## 逐帧 scrub 时间轴

适合产品拆解、页面叙事、图表展开和场景变换：

```text
Create a single continuous transformation designed for frame-by-frame scroll
scrubbing. At frame 0, <START_STATE>. Over the shot, <ORDERED_CHANGES>. At the
last frame, <END_STATE>. Every intermediate frame must be a meaningful stable
progress state. Use constant visual continuity with no cuts, dissolves, sudden
jumps, duplicated holds, camera shake, motion blur, or unrelated motion. Keep
the composition readable when playback is stopped on any frame.
```

把多个变化写成相对进度阶段，例如 `0–35%` 完成第一阶段、`35–80%` 推进主要关系、
`80–100%` 到达最终状态。要求每个阶段持续变化，并明确禁止模型在前段快速完成主要
动作、后段只保留近重复帧。百分比用于约束节奏，不要求模型输出精确帧编号；实际节奏
仍需通过接触表检查，必要时裁剪或重定时。

scrub 序列的目标帧率由帧密度和画质验收决定。优先生成清晰的语义关键阶段，再按
[optimization.md](optimization.md) 选择保留原帧或插帧。

## 分段播放转场

适合输入触发后按时间完成、并在状态锚点停住的片段：

```text
Create one uninterrupted transition from the exact provided first frame to the
exact provided last frame. Begin the intended motion immediately, preserve all
identity, structure, framing, background, and lighting constraints throughout,
and reach the final state only at the end. No cut, dissolve, unrelated idle
motion, early completion, long final hold, or return motion.
```

每段只描述一个方向的主要变化。运行时反向通常复用同一段；只有倒放违反物理或叙事规律时，才另外生成反向片段。

## 离散状态动画

每个状态单独生成，不让一个长视频同时包含 hover、点击、成功和失败：

```text
Create a short transition from the exact neutral pose to the exact <STATE>
pose. The first frame must match the shared neutral reference exactly. Hold the
final pose only briefly. No camera movement, no unrelated idle motion, and no
return transition.
```

反向状态优先用程序倒放；只有倒放不符合物理规律时再单独生成。

## 失败修复提示词

一次只修一个问题，同时重申所有不变量：

```text
Keep the subject identity, design, style, camera, framing, scale, anchor,
background, lighting, and correct motion unchanged. Fix only this issue:
<ONE_PRECISE_ISSUE>. Do not add any new motion or detail.
```

常见修复：

- `Keep every approved component unchanged; remove the duplicated connector.`
- `Keep the body fixed; eliminate scale pulsing and center drift.`
- `Remove the one-frame brightness flash; lighting is identical in every frame.`
- `Continue through the angle without pausing or snapping.`
- `Make the last frame match the first frame exactly for a seamless loop.`

## 负面约束

按需要加入，不必机械复制全部：

```text
No cuts, morphing, identity drift, scale breathing, position drift, duplicated
limbs, missing limbs, extra objects, blinking, idle sway, motion blur, ghosting,
frame blending, lighting flicker, shadows on the background, camera movement,
text, watermark, border, style change, unnecessary sci-fi circuitry, or plastic AI clutter.
```

用户没有要求科幻题材时，不写 `cyberpunk`、`neon glow`、`intricate circuitry`、
`hyperdetailed 8k` 这类套路词，也不要用满画面的细碎发光线条充当细节。画面冲击力来自镜头、
形态对比和干净的轮廓；细节只服务于叙事焦点，非焦点区域保持干净。需要时追加：

```text
No unnecessary sci-fi circuitry, generic cyberpunk neon clutter, plastic AI
noise, over-detailed artificial lines, or visual noise.
```
