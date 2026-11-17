---
name: oil-motion
description: "处理视频和序列帧，编译滚动、指针、拖动与状态驱动的网页动效；内含本地媒体处理脚本和运行时。新素材生成使用宿主工具。"
en_name: oil-motion
zh_name: "Oil Motion · 交互媒体动效"
zh_description: "处理视频和序列帧，编译滚动、指针、拖动与状态驱动的网页动效；内含本地媒体处理脚本和运行时。新素材生成使用宿主工具。"
triggers:
  - "oil-motion"
  - "动效"
  - "动画"
  - "motion"
  - "oil"
  - "滚动"
  - "拖动"
  - "交互媒体"
  - "序列帧"
license: MIT
od:
  mode: utility
  category: animation-motion
  upstream: https://github.com/oil-oil/oil-motion
  source-commit: 07e31f2265f80caa8f2c1df825d85ac24a46307c
---
## Open Design 宿主约定

这是当前任务中的功能技能。保留用户选定的任务类型、品牌、技术栈、当前阶段和交付格式；不要因为 @ 选择而改成视频项目。规划阶段只规划，实现阶段才写代码。检查、渲染和导出仅在宿主当前阶段允许且工具真实可用时执行；技能不能额外开启独立 Agent、强制审批或绕过宿主交付边界。

附属文件相对当前技能包根目录读取，按当前问题选读，不把全部参考文档粘入提示词。不读取其他 Agent 的全局配置。素材优先用用户已有文件；需要新图片、视频或音频时使用当前宿主实际提供且用户允许的工具。缺少生成、测量或导出能力时说明具体缺口，交付可验证部分，不声称完成未执行的步骤。遵循当前任务的输出路径，不覆盖输入或历史产物。


# Oil Motion

把用户的交互意图转换为可验收的动画素材、时间轴清单和网页运行时。AI 生成负责肢体、结构、材质、遮挡等语义变化；程序负责输入映射、播放控制、媒体处理和性能。

本适配包包含本地媒体处理脚本和网页控制器。运行 Python 脚本前检查 Python 3.10+、支持 `-fps_mode` 的 FFmpeg / ffprobe、Pillow、NumPy、PyYAML；缺少依赖时仅在任务隔离环境中按 `scripts/requirements.txt` 安装，不修改全局环境。纯本地处理不需要 API Key。

运行参考命令前，将 `OIL_MOTION` 设为本次实际加载的技能目录：

```bash
OIL_MOTION="<本次 SKILL.md 所在绝对目录>"
```

图片／视频生成交给宿主已有工具。此包不包含上游的生成服务、Keychain 或凭据配置页面；不要尝试调用它们。

## 四个唯一事实源

每项信息只保存在一个位置，其他文件引用它，不复制：

1. `source/concept-contract.yaml`：用户明确要求的对象、视觉、交互和连续性。
2. `source/motion-brief.yaml`：由合同派生的关键帧、片段和生产计划。
3. `build/timeline.json`：成片的实际帧率、段落边界、停帧和播放曲线。
4. `build/motion-budget.json`：交付格式与运行时控制器的自动选择结果。

## 主流程

### 1. 锁定用户意图

用户只有模糊目标时，先读 [references/concepts.md](references/concepts.md)，给出最多三个真正不同的方向；要求已经明确时直接写 Concept Contract。

需要外部案例启发时，按表达目的选读 [references/motion-patterns.md](references/motion-patterns.md)。先分清哪些变化属于素材本身、哪些只是容器编排或 UI 状态，只有前者进入生成流程。

```yaml
subject_count: <number>
subjects:
  - identity: <可验证的身份或外观锚点>
style: <用户原词>
motion_intent: <动作及视觉结果>
background_owner: video | page
scene: <背景属于视频时的场景、镜头和光线要求>
driver: scroll | pointer | drag | touch | orientation | audio | data | state | time
input_semantics: continuous | step | event
time_control: scrub | segment-play | autonomous
navigation: continuous | paged | none
clip_continuity: chain | independent
continuity: [<必须保持不变或连续的内容>]
aspect_ratio: 16:9 | 9:16 | 1:1 | 21:9 | custom
destination: <页面位置、最大显示尺寸和目标设备>
```

判断规则：

- `aspect_ratio` 取自 `destination` 的真实容器：横向全屏或 Hero 通常是 `16:9`，竖屏全屏是 `9:16`，卡片、头像等方形视窗是 `1:1`；不要未经确认就默认 `1:1`。容器比例与生成比例不一致时，在合同中写明裁切或补边策略。锁定后关键帧尺寸、视频画幅和编译输出都沿用同一比例，尺寸对照见 [references/prompting.md](references/prompting.md)。
- `scrub`：输入值与时间轴位置持续对应，输入停止时画面停在当前位置。
- `segment-play`：输入选择下一状态，片段随后按时间播放；反向输入应从当前画面撤回，不得换源硬切。
- `autonomous`：动画由时间推进，交互只负责开始、暂停或切换状态。
- `navigation` 只描述页面如何移动，不决定视频如何播放；分页页面也可以使用连续时间轴。
- 镜头、环境光、接触阴影、景深或背景连续性重要时使用 `background_owner: video`。只有主体必须透明复用在页面背景上时使用 `page`。
- 用户已说清的内容直接记录，不改写、不扩写。缺项会改变可生成性、可验收结果或生产路线时，必须先补齐。

### 2. 建立生产计划

Motion Brief 只保存派生计划，不复制合同字段：

```yaml
concept_contract: source/concept-contract.yaml
identity_bible: source/identity-bible.md | null
parameter_space: linear | circular | 2d | discrete
media_access: sequential | random
gesture_policy:
  unit: continuous | one-gesture-one-step
  inertia: coalesce | preserve
  while_active: retarget | queue | ignore
  boundary: clamp | loop
  programmatic_navigation: ignore | observe
storyboard: <有序视觉阶段>
keyframes: <K0…Kn>
clip_chain: <每段使用的相邻关键帧>
rest_state: <初始及失去输入时的状态>
loop: open | closed | none
anchor: fixed-body | center | bottom | free
scene_continuity: <仅背景属于视频时填写>
frame_policy: native | interpolate
target_fps: <由源素材和运行时需求决定>
quality_target: <分辨率、DPR 和文件预算>
pixel_dimensions: <宽x高，由合同的 aspect_ratio 与 DPR 派生>
reduced_motion: <静态替代状态>
```

`parameter_space` 描述素材时间轴，不描述页面布局：`linear` 是有起止的时间轴，`circular` 是闭环，`2d` 是二维采样，`discrete` 是互不连续的状态。不要把二维或无序状态压成一条线性视频。

`frame_policy` 与 `target_fps` 的取舍标准见 [references/optimization.md](references/optimization.md)。

整组位移、缩放、旋转、裁切和时间映射由程序完成；关节、结构、材质、接触和遮挡变化由生成模型完成。如果只移动整张图不能保持自然，就生成完整动作，不继续叠加 CSS 补丁。

### 3. 自动选择交付与运行时

在宿主允许运行工具的阶段，用 Brief 中的计划帧数、显示尺寸和参数空间运行 `motion_budget.py --strict`，显式传入合同中的 `background_owner` 和 `time_control`，保存 `build/motion-budget.json`。Pilot 按这个结果挂载到真实页面；之后帧数或尺寸变化就重新预算。脚本分别返回：

- `delivery.selected`：`baked-video | chroma-video | alpha-atlas`。
- `runtime.controller`：`frame-scrub | segment-playback | autonomous-playback`。

格式选择与播放方式是两件事，不得互相推断。命令和决策顺序见 [references/delivery-selection.md](references/delivery-selection.md)。按结果只读取一条媒体路线：

- `alpha-atlas`：[references/alpha-atlas.md](references/alpha-atlas.md)
- `chroma-video`：[references/chroma-video.md](references/chroma-video.md)
- `baked-video`：[references/baked-video.md](references/baked-video.md)

### 4. 制作关键帧

1. 有角色或需要身份一致时，先写 Identity Bible。
2. 生成并验收 `K0…Kn`；每段只承担一个主要语义变化，片段 `i` 使用 `Ki → Ki+1`。`clip_continuity: chain` 时，第 2 段起的首帧改用上一段验收后的实际尾帧，尾帧仍是计划关键帧。
3. 用宿主可用图片工具生成关键帧：按 `aspect_ratio` 传尺寸，并核对脚本报告的实际宽高比；尺寸至少覆盖最大 CSS 尺寸乘目标 DPR。真实产品、既定角色或上一张关键帧用 `--image` 作为参考输入，不只凭文字描述。
4. `background_owner: page` 请求透明输出，并实际检查 Alpha 通道；不得先生成色底再反向抠图。视频模型需要色键输入时，由 `composite_alpha_keyframe.py` 从透明源合成副本。`background_owner: video` 使用不透明场景输出，场景直接画进关键帧。
5. 命令、尺寸对照、提示词、首尾帧模式和提交方式见 [references/prompting.md](references/prompting.md)。宿主自带的图片工具同样能输出真实 Alpha 并接受参考图时也可以使用，验收标准不变。已有视频或序列帧时跳过生成，保留原始素材并从分析开始。

### 5. 先做 Pilot

批量生成前，只完成第一组关键帧、第一段视频，并按已选路线挂载到真实页面。按 [references/qa.md](references/qa.md) 通过 Pilot 硬门后才能量产；失败就修正上游，不在运行时掩盖。

### 6. 生成并逐段验收

按 [references/prompting.md](references/prompting.md) 生成母版，按 [references/qa.md](references/qa.md) 验收内容与连续帧链。`chain` 模式必须同时验证生成输入接力和相邻成片解码后的输出接缝；任一失败都停止后续生产。

### 7. 帧准备、清理与编译时间轴

按 [references/optimization.md](references/optimization.md) 执行 `frame_policy`（插帧出现重影或伪影时退回 `native` 或重新生成），再按已选媒体路线清理和编译。所有裁剪和拼接都要检查新产生的相邻帧；不得用一次远距离跳帧替代缓慢尾部变化。

编译后生成 `build/timeline.json`，字段语义只以 [references/runtime.md](references/runtime.md) 的时间轴规范为准。时间值必须由最终编译结果生成，不手工抄写。

### 8. 接入运行时

从 [assets/interactive-motion.ts](assets/interactive-motion.ts) 的对应控制器开始实现（`frame-scrub` 管理随动与最短环形距离，`segment-playback` 管理分段与反向）；分步手势使用 [assets/step-gesture.ts](assets/step-gesture.ts)。输入映射、分段播放、反向、取消、预加载和降级只以 [references/runtime.md](references/runtime.md) 为准。

### 9. 最终验收

按 [references/qa.md](references/qa.md) 在目标 CSS 尺寸、DPR、冷缓存、快速反向、移动端和资源失败条件下验收。页面导航、时间控制、媒体格式和连续性分别检查，不用一种检查代替另一种。

需要动画原理展示页时，读 [references/explainer.md](references/explainer.md) 并使用 `create_explainer.py`。

## 交付

保留 `source/`、`pilot/`、`build/`、`qa/` 和 `final/`。`final/` 只包含选中的主资源、静态降级和运行时入口；同时按宿主交付契约附上四个事实源及可复现的处理命令。


## 随包运行文件

下列文件随会话冻结，按需读取；所有 Python 内部依赖和运行时模板均在包内。

- `assets/chroma-video-renderer.ts`
- `assets/interactive-motion.ts`
- `assets/motion-explainer-template.html`
- `assets/motion-manifest.example.json`
- `assets/step-gesture.ts`
- `references/alpha-atlas.md`
- `references/baked-video.md`
- `references/chroma-video.md`
- `references/concepts.md`
- `references/delivery-selection.md`
- `references/explainer.md`
- `references/motion-patterns.md`
- `references/optimization.md`
- `references/prompting.md`
- `references/qa.md`
- `references/runtime.md`
- `scripts/chroma_key.py`
- `scripts/compile_scroll_video.py`
- `scripts/compose_travel_frames.py`
- `scripts/composite_alpha_keyframe.py`
- `scripts/create_explainer.py`
- `scripts/loop_cleanup.py`
- `scripts/media_edges.py`
- `scripts/motion_budget.py`
- `scripts/motion_pipeline.py`
- `scripts/optimize_motion.py`
- `scripts/production_gate.py`
- `scripts/requirements.txt`

## 许可随包保留

`references/license.md` 随会话包保留来源许可。复制参考代码到交付工程时保留上游署名及许可文本。
