# 自动选择交付与运行时

本文件是媒体格式选择的唯一事实源。选择分为三个正交问题，必须依次处理：

1. `background_owner` 决定背景是否烧入媒体。
2. 参数空间、访问方式和资源预算决定媒体格式。
3. `time_control` 决定运行时控制器。

不要用媒体格式推断播放方式，也不要用滚动或分页布局推断 scrub。

## 1. 背景归属

- `video`：背景与主体在同一视频中生成，选择 `baked-video`，不抠色。
- `page`：主体必须透明复用。关键帧直接生成真实 Alpha；需要视频模型时才从透明源合成色键输入，再在 `alpha-atlas` 与 `chroma-video` 中预算。

`--background-owner` 没有默认值。合同未锁定时停止，不得因为参数缺失静默选择透明或色键路线。

## 2. 执行预算

生成素材前用 Brief 的计划帧数（目标帧率 × 时长）运行一次，帧准备完成后再用实际帧数复核：

```bash
python3 "$OIL_MOTION/scripts/motion_budget.py" \
  --frames "$FRAME_COUNT" \
  --display "$DISPLAY_SIZE" \
  --dpr "$TARGET_DPR" \
  --driver "$DRIVER" \
  --time-control "$TIME_CONTROL" \
  --parameter-space "$PARAMETER_SPACE" \
  --background-owner "$BACKGROUND_OWNER" \
  --report build/motion-budget.json \
  --strict \
  --json
```

只有 `driver=scroll` 且 `time_control=scrub` 时才额外传 `--scroll-pages`，用于检查滚动采样密度。分段播放按成片帧率验收，不把页面数量换算成 scrub 帧数。

读取以下结果：

- `delivery.selected`：唯一主媒体格式。
- `delivery.reasonCodes`：选择依据。
- `runtime.renderer`：对应渲染器。
- `runtime.controller`：对应时间控制器。
- `failures` 与 `passes`：阻断项。

## 3. 固定决策顺序：媒体格式

1. `background_owner=video`：选择 `baked-video`。
2. `parameter_space=2d`：选择 `alpha-atlas`；超预算时降低采样或拆分轴后重新预算。
3. `parameter_space=discrete`：每个独立状态或转场分别预算，不把无序状态拼成线性视频。
4. 随机访问且单图集与解码内存均在预算内：选择 `alpha-atlas`。
5. 一维顺序访问且达到视频帧数门槛：选择 `chroma-video`。
6. 一维图集超过纹理或解码内存预算：选择 `chroma-video`。
7. 其余小型透明资源：选择 `alpha-atlas`。

`background_owner=video` 遇到二维或无序离散参数时，拆成多条独立烘焙片段分别预算；不能压成一条时间轴。

## 纹理上限怎么计算

`--max-texture=4096` 限制的是单张纹理的宽和高，不直接限制帧数。预算必须使用
“最大 CSS 显示尺寸 × 目标 DPR”得到最低单格尺寸，再计算单张图集容量：

```text
columns = floor(max_texture / cell_width)
rows = floor(max_texture / cell_height)
capacity = columns * rows
```

例如 48 帧、最低单格 640×640 px 时，4096 纹理只能容纳 6×6=36 帧，不能做成
一张图集。改成 7×7 时单格最多约 585×585 px；使用 576 px 只有在实际显示尺寸
乘 DPR 不超过 576 时才成立，不能为了塞进一张图而牺牲已确认的清晰度。

同理，16×14 排列能否放进一张图只取决于单格尺寸：宽最多 256 px，高最多约
292 px。帧数很多的图集能放进一张图，靠的是更小的单格，不是绕过了浏览器纹理上限。

当前运行时只接受一张主图集。圆环或一维时间轴超出单图集预算时自动选择
`chroma-video`；真正的二维参数仍需要 `alpha-atlas`，超预算时降低参数采样密度、
拆分独立状态或拆分参数轴后重新预算。不要自行实现未经过预算和预加载验收的多图集切换。

## 4. 控制器选择

控制器只由合同中的 `time_control` 决定：

| `time_control` | `runtime.controller` |
|---|---|
| `scrub` | `frame-scrub` |
| `segment-play` | `segment-playback` |
| `autonomous` | `autonomous-playback` |

`delivery.selected` 可以与任一合理控制器组合。例如视频既可以逐帧 scrub，也可以按片段正常播放；图集也可以按时间自动播放。

## 超预算处理

- `alpha-atlas` 超预算：降低采样密度、拆分独立状态，或在用户已确认的显示范围内重新预算；不得偷降清晰度。
- `chroma-video` 被选中：只保留 QA 帧和静态 Alpha 降级，不再生成大型 Alpha 图集。
- `baked-video` 被选中：不得加入抠色、色键 Shader 或页面背景合成。
- 源素材低于最大 CSS 尺寸乘 DPR：重新生成或调整已确认的显示目标，不从低清网页资产反向放大。

任何调整后都重新运行预算，旧报告失效。

### 母版像素不足时的显示预算

视频的可用分辨率见 [prompting.md](prompting.md#分辨率和时长)。预算使用探测到的实际
像素尺寸，通过 `--source WIDTHxHEIGHT` 传入；不能把分辨率标签或放大后的尺寸当作源尺寸。
同时核对宽高与最终裁切，目标 DPR 不得超过
`min(源宽 / CSS 宽, 源高 / CSS 高)`。

例如只有 `1344×768` 母版、最大显示为 `1280×720` CSS px 时，把原先的高 DPR 目标下调为
`--display 1280x720 --dpr 1.05 --source 1344x768`，所需像素为 `1344×756`，
再按上面的预算命令运行 `--strict` 并重写 `build/motion-budget.json`。若保留 DPR `2`，
则把 16:9 显示目标缩小到最多 `672×378` CSS px。编译资源宽度不得超过母版可用宽度。

降低目标 DPR 是素材清晰度取舍，不改变设备的真实 DPR，也不代表在高 DPR 屏幕上达到
原来的清晰度。将调整同步到合同的 `destination` 与 Brief 的 `quality_target`、
`pixel_dimensions`，按新目标重新验收；不得只改预算数值而仍在更大的容器中显示。

## 后续路由

- `alpha-atlas`：读 [alpha-atlas.md](alpha-atlas.md)。
- `chroma-video`：读 [chroma-video.md](chroma-video.md)。
- `baked-video`：读 [baked-video.md](baked-video.md)。
- 控制器实现：读 [runtime.md](runtime.md)。
