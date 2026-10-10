# 色键视频路线

仅当 `background_owner: page` 且预算返回 `delivery.selected=chroma-video` 时读取。主体通过 WebGL 实时生成 Alpha，页面拥有最终背景。

如果镜头、环境光、接触阴影、景深或背景连续性属于画面主体的一部分，停止本路线并回到合同改用 [baked-video.md](baked-video.md)。

## 编译

输入必须是从已验收透明关键帧确定性合成、并由视频模型保持均匀的色键母版：

```bash
python3 "$OIL_MOTION/scripts/compile_scroll_video.py" \
  "$SOURCE_VIDEO" "$OUTPUT_DIRECTORY" \
  --background-owner page \
  --budget-report build/motion-budget.json \
  --frame-policy "$FRAME_POLICY" \
  --fps "$TARGET_FPS" \
  --timeline-output build/timeline.json \
  --desktop-width "$DESKTOP_WIDTH" \
  --mobile-width "$MOBILE_WIDTH"
```

需要记录语义锚点时追加 `--anchor NAME=SOURCE_FRAME`；静态降级状态使用 `--poster-source-frame`。索引都基于帧准备后的序列，编译器会在清理后重新映射。

编译器会：

1. 按 `frame_policy` 保留原始帧或插帧，并输出接触表与报告。
2. 按需清理接缝或重复尾帧。
3. 检查整段代表帧的色键颜色与边缘均匀度。
4. 编码桌面与移动全关键帧 MP4。
5. 逐帧模拟运行时抠色，使用与 WebGL 相同的 `dominance-v2` 参数检查残留、误删和溢色。
6. 生成编码后 Alpha 接触表、`background-matrix`、静态 Alpha 降级图和 `compile.json`。

多段时间轴用 `--initial-state-id` 指定初始状态，并用重复的 `--segment DESTINATION_STATE_ID=START:HOLD:END_EXCLUSIVE` 传入后续状态与帧边界。编译器从最终保留帧生成状态映射与 `timeline.json`，页面不得手工换算秒数。

默认删除可重新生成的中间 PNG；诊断帧准备、抠色或编码问题时才使用 `--keep-frames`。

## 抠色硬门

- 编译后的实际 MP4 解码帧仍有可见色键块、边缘溢色、主体内部误删或半透明脏边时，拒收母版。
- 禁止靠扩大抠色阈值、腐蚀轮廓或模糊边缘掩盖素材缺陷。
- 阈值只能复现已验收母版的已知色键，不能修复不均匀背景或错误主体颜色。
- 半透明、发丝和大范围运动模糊属于高风险输入；无法稳定通过时重新生成，或重新评估背景归属。
- 自动报告通过后仍要查看白、黑、高饱和色和真实页面背景上的合成结果。

## 网页接入

使用两个共享实现：

- [assets/interactive-motion.ts](../assets/interactive-motion.ts)：按 `runtime.controller` 控制帧或视频时间。
- [assets/chroma-video-renderer.ts](../assets/chroma-video-renderer.ts)：读取 `compile.json.runtime.keying` 并绘制透明 Canvas。

`frame-scrub` 调用 renderer 的 `render(frame)`。`segment-playback` 或 `autonomous-playback` 在视频按时间播放期间调用 `startLive()`，停止或销毁时调用 `stopLive()`。不要在页面复制 Shader 参数或另写抠色算法。

```ts
const runtime = manifest.runtime;
const renderer = createChromaVideoRenderer({
  video,
  canvas,
  frameCount: runtime.frameCount,
  fps: runtime.fps,
  keying: runtime.keying,
});
```

页面不能直接显示色键视频：

```html
<section class="motion-stage">
  <video class="motion-source" muted playsinline preload="auto"></video>
  <canvas class="motion-canvas"></canvas>
</section>
```

```css
.motion-stage { background: var(--page-background); }
.motion-source { display: none; }
.motion-canvas { width: 100%; height: 100%; display: block; }
```

## 加载与降级

- 预加载静态 Alpha 状态、视频元数据和首个需要的媒体。
- WebGL、视频解码或资源加载失败时显示静态 Alpha 图，不能露出色键母版。
- `prefers-reduced-motion` 显示合同指定的静态 Alpha 状态。

## 验收

- `qa/post-encode-keying.json` 的桌面与移动结果均为 `passed: true`。
- `compile.postEncodeKeyingPassed` 为 `true`，实际检查帧数与报告一致。
- 查看 Alpha 接触表和 `background-matrix`；自动报告不能替代视觉检查。
- `allFramesAreKeyframes` 为 `true`。
- 按实际 `runtime.controller` 检查快速反向、停帧、连续播放或循环。
- 页面更换背景只改变页面层，不重新生成主体。
