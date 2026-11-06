# 质量检查与生产硬门

本文档是 Pilot、连续帧链和最终验收的唯一事实源。检查顺序固定为：用户意图 → 关键帧 → 母版 → 帧准备 → 媒体编译 → 时间轴 → 真实页面运行时。上游失败时停止，不在下游掩盖。

## Concept Contract 回归

每次验收先逐项对照合同：

- 主体数量、身份和关系一致。
- 风格、情绪、动作和叙事形式保持用户原意。
- `background_owner=video` 的成品没有抠色；`page` 的成品没有烧入页面背景。
- `driver`、`time_control` 和 `navigation` 分别符合要求。
- `clip_continuity` 与 Pilot 批准一致。

任一项偏离都属于需求级错误，必须返工；不接受“差不多”。

## Identity Bible

有角色或稳定身份对象时，逐张关键帧和逐段母版检查：

- 同脸或同一识别特征；
- 发型、服装、材质和配色一致；
- 配饰、标记、零件和道具不增不减不错位；
- 比例、锚点和主要轮廓没有无意漂移。

## 透明关键帧

`background_owner=page` 时，原始关键帧必须是直接生成的真实 Alpha PNG：四角透明，没有实体底色或棋盘格，主体边缘在浅色和深色测试底上均干净。宿主图片工具返回结果后，实际检查 Alpha 通道、四角和可见主体；边缘质量仍要放在测试底上看。

视频模型需要色键时，只能从已验收透明源确定性合成副本，并保留源文件对应关系。不得生成色底图片再反向抠图。

## Pilot 硬门

批量生成前必须具备：第一组关键帧、第一段短视频、真实页面最终位置挂载、明确的视觉验收结论。通过后生成 `pilot/approval.json`：

```bash
python3 "$OIL_MOTION/scripts/production_gate.py" approve-pilot \
  --contract source/concept-contract.yaml \
  --identity-bible source/identity-bible.md \
  --first-frame "$FIRST_FRAME" \
  --last-frame "$LAST_FRAME" \
  --video "$PILOT_VIDEO" \
  --page-evidence "$PAGE_EVIDENCE" \
  --reviewer "$REVIEWER" \
  --decision pass \
  --output pilot/approval.json
```

批准文件记录工件 SHA-256 和合同中的连续模式。生产阶段必须验证批准文件与工件未变化；任何变更都会使批准失效。

## 连续帧链

`clip_continuity=chain` 必须通过两道不同硬门。

### 1. 生成输入接力

上一段验收后的实际尾帧必须作为下一段首帧的原文件：

```bash
python3 "$OIL_MOTION/scripts/production_gate.py" verify-chain \
  --previous-tail "$PREVIOUS_TAIL" \
  --next-first "$NEXT_FIRST_INPUT" \
  --segment-index "$SEGMENT_INDEX" \
  --manifest qa/frame-chain.json
```

这一步验证生成请求没有换图，但不能证明模型输出首帧没有重绘。

### 2. 成片输出接缝

下一段生成完成后，再比较上一段成片解码尾帧与下一段成片解码首帧：

```bash
python3 "$OIL_MOTION/scripts/production_gate.py" verify-output-chain \
  --previous-video "$PREVIOUS_VIDEO" \
  --next-video "$NEXT_VIDEO" \
  --segment-index "$SEGMENT_INDEX" \
  --manifest qa/frame-chain.json \
  --evidence-dir qa/frame-chain-evidence
```

自动相似度通过后仍要查看证据帧，确认身份、构图、光线和背景没有可见跳变。再把实际尾帧与计划关键帧比较；偏差超限时重做当前段或更新后续约束，不允许误差逐段累积。

## 母版

- 完整观看，不只看首尾截图。
- 主体身份、结构、颜色和数量稳定。
- 动作没有硬切、无意反向、长时间待机或错误终点。
- 镜头、透视、光线和接触关系符合合同。
- 闭环素材首尾真实连续。
- `page` 路线的色键背景均匀；烘焙路线的背景与主体一起连续。

## 帧准备

`frame_policy=native`：

- 查看原始接触表和相邻帧分析。
- 在目标播放速度下确认节奏和清晰度。

`frame_policy=interpolate`：

- 同时查看原始与插帧接触表。
- 插帧不得新增重影、双轮廓、边缘撕裂、结构扭曲、穿插或闪帧。
- 失败时回到合格原始帧或重新生成，不把插帧当成强制交付条件。

任何裁剪和拼接都必须检查新产生的相邻帧；不能用远距离末帧替代被删除的缓慢变化。

## 媒体编译

- 输出像素至少覆盖最大 CSS 尺寸乘目标 DPR，不超过母版可用分辨率。
- 图集帧数、行列和实际文件一致。
- 视频帧率、帧数、全关键帧状态和 `compile.json` 一致。
- 色键路线按 [chroma-video.md](chroma-video.md) 验收编码后抠色和多底色矩阵。
- 烘焙路线按 [baked-video.md](baked-video.md) 验收完整画面，不得出现色键处理。

## 时间轴

`timeline.json` 必须由最终编译结果生成，并验证：

- [runtime.md](runtime.md) 定义的时间轴硬性语义全部通过。
- 页面状态 ID、顺序和 `timeline.json.states` 完全一致；缺失、重复或错序时初始化失败。
- 重新裁剪、拼接或编码后旧时间轴失效。
- 播放曲线参数来自清单，页面没有第二份常量。

## 运行时验收

所有模式都检查：

- 冷缓存、慢网、资源失败和 `prefers-reduced-motion`。
- 目标 CSS 尺寸、DPR、浏览器 100% 缩放和移动端。
- 窗口变化、页面切后台再恢复、快速连续输入。
- 媒体节点不重复创建，降级时不露出色键或半成品。

`frame-scrub`：

- 慢速、快速、跳转和连续反向都能到达正确帧。
- 输入停止时画面停在对应位置，不粘滞、不越界。

`segment-playback`：

- 输入发生后立即开始，不等待页面导航结束。
- 连续链使用同一媒体实例，不在状态间换源。
- 反向输入从当前画面撤回。
- 每段停在 `hold`，没有越过目标后回跳。
- 快速重复输入只执行最新目标，旧播放已取消。
- 同一次惯性手势不会连续跳过多个状态；程序化页面滚动不会反向触发媒体控制器。
- 首尾边界按 `gesture_policy.boundary` 停止或闭环，不产生空状态。

`autonomous-playback`：

- 浏览器阻止自动播放时有明确降级或启动手势。
- 只有通过闭环验收的素材才循环。

## 故障定位

- **闪帧或切帧**：依次检查母版、裁剪接缝、成片输出接缝、`hold/endExclusive`、旧媒体层和资源解码。
- **动作粘滞**：检查是否重复平滑、目标是否及时更新、seek 是否串行堆积。
- **停下后回跳**：检查是否用 `timeupdate` 判断、是否停在 `endExclusive`、是否先越界再回设。
- **新版本变糊**：检查母版分辨率、插帧伪影、重复缩放、图集单元格和有损压缩。
- **色键残留**：检查母版和编码后实际帧；不得先扩大运行时阈值。
