# 帧策略与图集压缩

本文件是 `frame_policy` 和图集清晰度预算的唯一事实源。先验收动作母版，再决定是否插帧；插帧不是默认正确答案。

## 选择帧策略

使用 `native`：

- 源帧率已经满足最终正常播放；
- 原始节奏、停顿或逐帧绘制感属于视觉设计；
- 插帧会产生重影、双轮廓、线稿扭曲或结构错误。

使用 `interpolate`：

- scrub 的参数采样明显不足；
- 目标播放速度下原始帧率可见跳步；
- 插帧结果通过自动比较和人工接触表验收。

把决定写入 Motion Brief：

```yaml
frame_policy: native | interpolate
target_fps: <native 使用源帧率；interpolate 必须高于源帧率>
```

## 插帧流程

只有 `frame_policy=interpolate` 时执行：

```bash
python3 "$OIL_MOTION/scripts/optimize_motion.py" interpolate \
  "$SOURCE_VIDEO" "$OUTPUT_DIRECTORY" \
  --fps "$TARGET_FPS" \
  --key "$KEY_MODE"
```

同时检查原始与插帧接触表。新增重影、双轮廓、边缘撕裂、部件穿插、结构扭曲、亮度闪帧或中心突变时，插帧失败；改用合格的原始帧，或重新生成母版，不得把插帧伪影带入编译。

`frame_policy=native` 仍需输出原始帧接触表和分析报告，只是不生成虚构中间帧。视频路线由 `compile_scroll_video.py --frame-policy` 统一执行对应分支；图集路线的原始帧提取见 [alpha-atlas.md](alpha-atlas.md)。

## 裁剪与拼接

- 裁剪只删除确实无变化的重复区，不改变已验收动作的终点。
- 每次裁剪或拼接后，重新检查所有新产生的相邻帧。
- 不能删除一段缓慢变化，再把远处最终帧直接接回；需要保留到终点的连续采样。
- 时间轴锚点和 `hold` 必须从最终保留帧重新生成。

## 图集压缩

只有预算选择 `alpha-atlas` 时执行：

```bash
python3 "$OIL_MOTION/scripts/optimize_motion.py" atlas "$FINAL_FRAMES" \
  --output "$OUTPUT_ATLAS" \
  --target-mb "$TARGET_MIB" \
  --display "$DISPLAY_SIZE" \
  --dpr "$TARGET_DPR" \
  --cell-width "$CELL_WIDTH" \
  --cell-height "$CELL_HEIGHT" \
  --columns "$COLUMNS"
```

工具先按“最大 CSS 尺寸 × DPR”计算最低单帧像素，再在不低于该尺寸的前提下搜索压缩质量。`clarityMet` 必须为 `true`；`targetMet=false` 时回到 [delivery-selection.md](delivery-selection.md) 重新预算，不继续降低清晰度。

## 验收

- `native`：接触表、相邻帧分析和最终播放均通过。
- `interpolate`：原始与插帧接触表均通过，且插帧没有新增结构或边缘缺陷。
- 最大显示尺寸和目标 DPR 未确认前，不执行最终压缩。
- 文件体积、解码内存和纹理尺寸同时满足目标设备预算。
