# 烘焙视频路线

仅当 `background_owner: video` 且预算返回 `delivery.selected=baked-video` 时读取。视频包含完整画面；不做抠色、色键或页面背景合成。

## 编译

先完成内容验收和预算，再运行：

```bash
python3 "$OIL_MOTION/scripts/compile_scroll_video.py" \
  "$SOURCE_VIDEO" "$OUTPUT_DIRECTORY" \
  --background-owner video \
  --budget-report build/motion-budget.json \
  --frame-policy "$FRAME_POLICY" \
  --fps "$TARGET_FPS" \
  --timeline-output build/timeline.json \
  --desktop-width "$DESKTOP_WIDTH" \
  --mobile-width "$MOBILE_WIDTH"
```

`FRAME_POLICY` 与 `TARGET_FPS` 来自 Motion Brief。使用 `native` 时目标帧率等于源帧率；使用 `interpolate` 时目标帧率必须更高。

编译器会：

1. 按帧策略保留原始帧或插帧，并输出对应接触表和报告。
2. 按需清理闭环接缝或尾部重复帧。
3. 编码桌面端和移动端全关键帧 MP4，移除音轨。
4. 生成普通 `poster.png` 与 `compile.json`。

多段时间轴用 `--initial-state-id` 指定初始状态，并用重复的 `--segment DESTINATION_STATE_ID=START:HOLD:END_EXCLUSIVE` 传入后续状态与帧边界；需要统一播放曲线时使用 `--playback-curve` 及对应速率参数。编译器负责生成状态映射并把最终保留帧换算成时间。

成功后默认删除可重新生成的中间 PNG；只有诊断帧准备、裁剪或编码问题时才使用 `--keep-frames`。

## 多段连续

`clip_continuity=chain` 时，按 [qa.md](qa.md) 同时执行：

- 上一段实际尾帧作为下一段生成输入；
- 相邻成片解码后的尾帧与首帧接缝验收；
- 身份、构图、光线和背景偏差累积检查。

合并后从最终成片生成 `timeline.json`，不手工抄写段落时间。

“分段”只属于生产过程。交付前必须把连续链编译为每个设备版本各自的一条主视频；运行时不得把生产片段逐段设为 `src`。

## 网页接入

页面只保留一个持续存在的视频元素：

```html
<section class="motion-stage">
  <video class="motion-video" muted playsinline preload="auto"></video>
</section>
```

```css
.motion-stage { overflow: hidden; }
.motion-video { width: 100%; height: 100%; object-fit: cover; display: block; }
```

根据预算中的 `runtime.controller` 接入 [runtime.md](runtime.md)：

- `frame-scrub`：整数帧映射到 `currentTime`。
- `segment-playback`：读取 `timeline.json` 分段播放、反向和精确停帧。
- `autonomous-playback`：按时间播放，仅在素材通过闭环验收时循环。

控制器变化不改变视频背景归属，也不需要重新选择媒体格式。

桌面与移动资源只在会话初始化时选择。分页、反向和普通 resize 期间不换 `src`；确需切换设备版本时，执行一次受控重载并恢复到当前状态的 `hold`，不能把换源当作页面转场。

## 加载与降级

- 预加载 `poster.png` 和首个需要的视频资源。
- 视频解码或资源加载失败时显示 `poster.png`。
- `prefers-reduced-motion` 显示合同指定的静态状态。

## 验收

- 完整观看桌面与移动输出，确认主体、背景、光线、接触关系和镜头连续。
- 多段输出接缝通过 [qa.md](qa.md) 的成片连续性硬门。
- `compile.json` 中桌面与移动输出的 `allFramesAreKeyframes` 为 `true`。
- 实际页面没有抠色、色键 Shader 或阈值配置。
- 按选中的控制器验收 seek、分段播放或自动播放，不混用验收标准。
