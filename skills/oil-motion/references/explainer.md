# 动画原理展示页

需要把“母版视频如何变成可交互动画”讲清楚时，使用
`scripts/create_explainer.py` 生成独立 HTML。不要复制某个项目的角色、文案或布局；
页面只读取图集结构和驱动配置。

## 页面包含

- 左侧完整雪碧图，可缩放、拖拽，并高亮右侧真正渲染的帧。
- 可选“母版视频”Tab，用于对照 AI 视频和编译后的网页资产。
- 右侧实时动画、帧号、行列位置和输入映射公式。
- 桌面端 2:1 布局，移动端自动上下排列。
- 图集解码完成后才显示，避免首帧闪烁。

## 驱动方式

| `--driver` | 输入 | 适用素材 |
|---|---|---|
| `pointer-angle` | 指针相对主体的方向 | 环形方向、朝向、旋钮 |
| `pointer-x` | 指针在预览区的横向位置 | 线性姿态、前后对比 |
| `drag` | 横向拖拽距离 | 可抓取产品、逐帧检查 |
| `scroll` | 页面滚动进度 | 章节转场、产品拆解、一镜到底 |
| `autoplay` | 时间 | 待机、循环动作、无需操作的展示 |

`pointer-angle` 使用首尾相连和最短环形距离。其余交互默认是有起止点的线性序列。
自动播放支持 `loop`、`pingpong` 和 `once`。

滚动模式生成前先按 [delivery-selection.md](delivery-selection.md) 运行预算，并传
`--scroll-pages`。预算默认要求每屏至少 24 帧；帧数不够时，长滚动会出现明显的换帧
阶梯，不能只靠调小 `smooth-time` 掩盖。

## 生成

图集 URL 和视频 URL 最终写入 HTML，均以输出 HTML 的目录为基准。manifest 是生成
时读取的本地 JSON，不会在浏览器运行时请求。

```bash
python3 "$OIL_MOTION/scripts/create_explainer.py" \
  --title "一张图，240 个方向。" \
  --manifest final/motion.json \
  --atlas-url ../final/motion.webp \
  --video-url ../source/master.mp4 \
  --driver pointer-angle \
  --output motion-explainer.html
```

没有 manifest 时直接给出网格参数：

```bash
python3 "$OIL_MOTION/scripts/create_explainer.py" \
  --atlas-url ./motion.webp \
  --frames 96 \
  --columns 12 \
  --rows 8 \
  --cell-width 320 \
  --cell-height 320 \
  --driver scroll \
  --scroll-pages 4 \
  --output scroll-explainer.html
```

自动播放：

```bash
python3 "$OIL_MOTION/scripts/create_explainer.py" \
  --atlas-url ./idle.webp \
  --frames 48 --columns 8 --rows 6 \
  --driver autoplay \
  --autoplay-fps 18 \
  --autoplay-mode pingpong \
  --output autoplay-explainer.html
```

输出已存在时脚本默认停止；确认目标后再传 `--force`。

## 验收

1. 通过本地 HTTP 服务打开页面，不只用 `file://`。
2. 检查右侧当前帧与左侧高亮格严格一致。
3. 检查首帧、尾帧、快速反向和环形接缝。
4. 切换视频 Tab 后能播放，切回图集时视频暂停。
5. 滚动模式页面确实有滚动距离，进度能完整覆盖 0 到 1。
6. 在 0%、50%、100% 三个位置检查右侧帧号与左侧高亮严格一致，并快速反向滚动确认没有漏帧或明显阶梯。
7. 在移动端检查布局、触摸拖拽和 reduced-motion 静态降级。
