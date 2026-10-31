# 运行时控制

本文档是时间控制、输入映射、预加载和运行时性能的唯一事实源。媒体格式由
[delivery-selection.md](delivery-selection.md) 决定；两者独立。

## 先读预算结果

`build/motion-budget.json` 必须分别给出：

- `delivery.selected`：使用哪种媒体和渲染器。
- `runtime.controller`：输入如何控制媒体时间。

| `time_control` | `runtime.controller` | 行为 |
|---|---|---|
| `scrub` | `frame-scrub` | 输入值持续映射到帧或时间 |
| `segment-play` | `segment-playback` | 输入选择相邻状态，片段按时间播放 |
| `autonomous` | `autonomous-playback` | 媒体时间自行推进 |

不要根据 `scroll`、分页布局或视频格式猜控制器。滚动既可以 scrub，也可以触发片段播放。

## 时间轴清单

所有控制器只读取编译生成的 `build/timeline.json`，页面中不得维护第二份时间常量。

```yaml
schemaVersion: 1
fps: <实际编码帧率>
frameDuration: <1 / fps>
initialState: <稳定状态 ID>
states:
  - id: <页面与运行时共同使用的状态 ID>
    hold: <该状态的停帧时间>
segments:
  - id: <稳定标识>
    from: <起点状态 ID>
    to: <终点状态 ID>
    start: <本段第一张可见帧的时间，包含>
    hold: <本段结束后应停留的最后可见帧时间>
    endExclusive: <本段编码边界，不包含>
    curve:
      type: constant | edge-mid-edge
      rate: <constant 使用>
      edgeRate: <edge-mid-edge 使用>
      midRate: <edge-mid-edge 使用>
```

硬性语义：

- `start <= hold < endExclusive`。
- 停止播放时只能落在 `hold`，不能落在 `endExclusive`。
- `states` 顺序必须与片段的 `from → to` 一致；页面状态直接使用这些 ID，不另建索引映射表。
- 所有时间都来自最终编码后的实际帧，不从生成时长或原始素材手工推算。
- 裁剪、拼接或重新编码后必须重新生成清单。

## frame-scrub

适用于“输入停在哪里，画面就停在哪里”的交互。使用
[assets/interactive-motion.ts](../assets/interactive-motion.ts) 的
`createFrameAnimator` 管理目标帧、阻尼和反向。

一维映射：

```text
progress = clamp((value - start) / (end - start), 0, 1)
targetFrame = progress * (frameCount - 1)
```

环形输入使用最短环形距离；二维输入使用二维采样网格，不能压成一维进度。输入事件只更新目标值，实际渲染集中在 `requestAnimationFrame`。

视频 scrub 每次只提交最新整数目标帧，丢弃过时 seek。需要随机访问或快速反向时使用全关键帧视频，并验收 seek 延迟。

## segment-playback

适用于“输入选择下一状态，动作随后自行完成”的交互。使用
[assets/interactive-motion.ts](../assets/interactive-motion.ts) 的
`createSegmentPlayer`，不要在页面重新实现播放状态机。

必须满足：

1. 生产时可以分段生成，但连续链交付前必须合并；运行时使用一个持续存在的媒体实例，切换状态不替换 `src`、视频节点或图片层。
2. 输入一发生就启动媒体；页面导航或其他几何动画可以并行，不等待动作结束。
3. 反向输入先取消当前播放，再从当前 `currentTime` 向上一状态撤回。
4. 前进可以使用用户输入触发的 `video.play()`。反向不能依赖浏览器支持负 `playbackRate`，由共享控制器按时间轴回放。
5. 使用 `requestVideoFrameCallback`，无支持时回退 `requestAnimationFrame`；不得用低频 `timeupdate` 判断停帧。
6. 接近目标时先暂停，再精确设到 `hold`，避免越过目标后回跳。
7. 播放速率曲线属于时间轴清单。需要两端快、中间慢时使用 `edge-mid-edge`；正放与倒放读取同一曲线。
8. 快速连续输入只保留最新目标，旧任务必须可取消。

桌面与移动媒体版本在初始化时选择。普通 resize 不换源；确需重载另一版本时，恢复到当前状态的 `hold` 后再继续。

分页导航只负责选择目标状态 ID。它不能把分段时间轴改成多个互不相关的视频，也不能用页面切换遮盖媒体接缝。

### 分步手势策略

`segment-playback` 与分页导航组合时，必须从 Motion Brief 读取 `gesture_policy`：

- `one-gesture-one-step`：把同一次滚轮或触控板惯性序列合并成一个方向意图，不能按每个原始事件连续跳状态。
- `while_active`：明确新输入是重定向、排队还是忽略；默认需要可反向的交互使用 `retarget`。
- `boundary`：首尾状态执行 `clamp` 或合同明确的 `loop`，不能越界创建空状态。
- `programmatic_navigation=ignore`：页面自身的平滑滚动和位置校正不得再次触发媒体状态变化。
- 页面元素的状态 ID 必须直接匹配 `timeline.json.states[].id`；找不到、重复或顺序不一致时在初始化阶段失败。

从 [assets/step-gesture.ts](../assets/step-gesture.ts) 的 `createStepGestureAdapter` 开始实现。滚轮、触控板或触摸层只把方向增量送入该适配器；手势阈值、惯性结束判定和程序化导航锁不得在页面监听、媒体控制器和分页组件中各写一份。

## autonomous-playback

适用于待机、循环或进入可见区域后自行播放的动画。浏览器允许时使用 `muted playsinline`；需要声音或浏览器阻止自动播放时，等待明确用户手势。循环只在素材本身通过首尾接缝验收时启用。

## 渲染器

### Alpha 图集

- 单元格尺寸统一，并至少覆盖最大 CSS 尺寸乘目标 DPR。
- 清单保存帧数、行列、单元格尺寸和参数映射。
- 切帧只更新 `background-position`，不创建多张透明图片交叉淡化。
- 默认单张纹理不超过 4096；超预算回到自动路线选择。

### Chroma 视频

- 视频保留均匀色键，由 `chroma-video-renderer.ts` 绘制透明 Canvas。
- 页面背景、文字和其他视觉层位于 Canvas 外部。
- 运行时从 `compile.json.runtime.keying` 读取全部参数，不在页面另写阈值。
- WebGL 或视频失败时显示静态 Alpha 降级图，不能露出色键母版。

### Baked 视频

- 视频本身包含完整画面，不做抠色、色键或背景合成。
- 可由视频元素直接显示，也可绘制到 Canvas。
- 失败时显示普通 `poster.png`。

## 输入、布局与生命周期

- `pointermove`、`scroll` 和触摸事件只记录输入，不在事件回调中反复写 DOM。
- 布局变化后重新读取主体位置；不要永久缓存 `getBoundingClientRect()`。
- 使用 `IntersectionObserver` 暂停离屏计算，使用 `ResizeObserver` 更新布局。
- 手机方向权限必须由用户手势请求；拒绝或不可用时回退触摸或静态状态。
- 页面切后台时暂停；恢复后以最新目标和当前媒体时间继续。

## 预加载与降级

- 图集预加载清单、静态帧和图集，并等待 `Image.decode()`。
- 视频预加载静态降级、元数据和首个需要的媒体；`loadedmetadata` 前不得 seek 或播放。
- 加载完成前只显示一张静态降级图或简洁加载层。
- 资源失败时解除页面锁定并回退静态画面，不让次要动画阻塞页面。
- `prefers-reduced-motion` 使用合同指定的静态状态，不自动播放或连续 scrub。

## 性能验收

- 每个动画帧最多一次 DOM 写入；目标未变化时不重复渲染。
- 离屏或状态稳定时停止 `requestAnimationFrame`。
- 不同时渲染两张大图做“平滑”。
- 在冷缓存、弱网、低端移动设备、快速反向和连续输入下检查。
