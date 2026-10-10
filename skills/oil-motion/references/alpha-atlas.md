# 透明图集路线

仅当 Concept Contract 锁定 `background_owner: page`（主体确有透明复用需求），且
`motion_budget.py` 返回 `delivery.selected=alpha-atlas` 时执行本流程。结果不是
`alpha-atlas` 时停止阅读，改走 [chroma-video.md](chroma-video.md) 或
[baked-video.md](baked-video.md)。

本文档只覆盖图集路线专属的帧提取、清理、检测与打包。公共步骤各有唯一事实源：

- 预算与路线选择：[delivery-selection.md](delivery-selection.md)
- 关键帧、提示词与提交命令：[prompting.md](prompting.md)
- 帧策略与图集压缩：[optimization.md](optimization.md)
- 母版验收、抠图验收、Pilot 与帧链硬门：[qa.md](qa.md)
- 运行时映射：[runtime.md](runtime.md)

## 交付物

```text
motion-name/
├── source/
│   ├── first-frame.png
│   ├── last-frame.png            # 单向转场需要
│   ├── prompt.txt
│   ├── master.mp4
│   └── master.job.json
├── frames/
│   ├── raw/
│   ├── clean/                    # 闭环或尾部清理后
│   └── final/
├── qa/
│   ├── raw-analysis.json
│   ├── raw-contact.jpg
│   ├── final-analysis.json
│   └── final-contact.jpg
└── final/
    ├── motion.webp
    ├── motion.json
    └── implementation.*
```

## 1. 帧准备与离线抠色

母版通过 [qa.md](qa.md) 的母版验收后再提取帧。色键在这一步离线去除，网页只加载已经透明的图集。

`frame_policy=native` 时按源帧提取，`--key auto` 从画面边缘采样实际背景色：

```bash
python3 "$OIL_MOTION/scripts/motion_pipeline.py" extract \
  source/master.mp4 frames/raw \
  --key auto

python3 "$OIL_MOTION/scripts/motion_pipeline.py" analyze frames/raw \
  --output qa/raw-analysis.json

python3 "$OIL_MOTION/scripts/motion_pipeline.py" contact frames/raw \
  --output qa/raw-contact.jpg \
  --columns 8
```

`frame_policy=interpolate` 时改用 [optimization.md](optimization.md) 的插帧命令，它同时输出原始与插帧的接触表和对比报告。

在白、黑和真实页面背景上查看接触表：残留色键、主体内部被误删或边缘溢色时，回到母版或关键帧返工，不靠调阈值掩盖。

## 2. 闭环清理与可选稳定

闭环动画：

```bash
python3 "$OIL_MOTION/scripts/loop_cleanup.py" \
  frames/raw frames/clean \
  --seam-window "$SEAM_WINDOW" \
  --duplicate-threshold "$DUPLICATE_THRESHOLD" \
  --report qa/loop-cleanup.json
```

该工具只做确定性选帧，不生成动作，也不对相邻帧做透明叠加。接缝选错时调整
`--seam-window`，不要为了减少帧数盲目提高重复阈值。首尾不同的单向转场传入
`--end-reference last-frame.png`，裁掉模型在尾帧上的多余停顿。

固定主体存在轻微漂移时才稳定：

```bash
python3 "$OIL_MOTION/scripts/motion_pipeline.py" normalize \
  frames/clean frames/final \
  --anchor bottom \
  --max-scale-change 0.08
```

不需要清理或稳定的步骤直接跳过，把上一步合格的帧作为 `frames/final`。自由运动、镜头运动和真实透视变化禁止稳定。

## 3. 最终门槛与图集打包

```bash
python3 "$OIL_MOTION/scripts/motion_pipeline.py" analyze frames/final \
  --output qa/final-analysis.json

python3 "$OIL_MOTION/scripts/motion_pipeline.py" contact frames/final \
  --output qa/final-contact.jpg \
  --columns 8

python3 "$OIL_MOTION/scripts/motion_pipeline.py" atlas frames/final \
  --output final/motion.webp \
  --manifest final/motion.json \
  --cell-width 360 \
  --cell-height 360 \
  --quality 88
```

打包前用最终帧数和单元格尺寸重新运行 [delivery-selection.md](delivery-selection.md)
的预算。只有仍返回 `alpha-atlas` 且通过时才打包；结果变成 `chroma-video` 时停止打包，
改走视频路线。需要压到目标体积时按 [optimization.md](optimization.md) 执行，不要手动
反复猜 WebP 质量。

## 4. 网页实现

从 [assets/interactive-motion.ts](../assets/interactive-motion.ts) 的对应控制器开始，
映射、阻尼、预加载和降级按 [runtime.md](runtime.md) 执行，验收和故障定位按
[qa.md](qa.md) 执行。出现闪帧时按“母版 → 帧 → 图集 → 映射 → 解码”的顺序定位。
