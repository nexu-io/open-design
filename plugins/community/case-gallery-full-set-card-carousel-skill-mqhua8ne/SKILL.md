# Case Gallery Full-Set Card Carousel Skill

## Goal
标准化“卡片轮播”展示：支持完整案例图库（封面图、配件图、安装图、展示图、细节图）在中轴为主图的卡片队列中可浏览，左右侧为阴影预览卡，点击预览卡可直接切入中心。

## Skill Name（改好名字）
- `CaseGalleryFullSetCarousel`
- 组件建议导出名：`CaseGalleryCarousel`
- CSS 命名建议：`portfolio-case-carousel`, `portfolio-case-carousel__card`, `portfolio-case-carousel__side-action`

## Core Scope
- 仅处理案例图展示交互（完整案例图库），不改作品发布状态，不改内容源。
- 目标支持完整案例集轮播（至少 3~7 张图）。
- 保持“中心清晰 / 两侧轻弱 / 后侧淡化 / 不晕眩转动”的视觉。
- 交互优先手控（箭头与侧边预览卡点击），自动轮播仅低频且可暂停。

## Hard Rules
- 不发布案例，不改 `content/works/auto/**` 与 `content/works.ts`。
- 不改 `assetPermissionStatus` 与 `status`。
- 不改源图文件、不写回 Obsidian。
- 不引入新外部服务。
- 不出现固定比例硬裁切导致主体模糊；容器内优先 `contain/cover` 明确可控。

## Runtime Contract
- Input: `visuals[]`（每个包含 `publicPath`、`role`、`label`）。
- State: `activeIndex`。
- Output: 左右控制箭头 + 可点击侧卡切图行为。
- Fail-safe: 当可见图不足时，降级为普通列表/网格，不阻塞页面。

## Carousel State Machine
1. `activeIndex` 表示当前中心卡。
2. 允许显示 5 个槽位：`left`, `active`, `right`, `rear-left`, `rear-right`。
3. `slotOf(i, active)` 计算：
   - 与 active 差值 `d`：0/1/-1/2/-2 分别映射到主、右、左、后右、后左；其他隐藏。
4. 点击左/右箭头：`activeIndex = prev/next`。
5. 点击侧边预览卡：`activateVisual(index)`，该图直接变为中心图。
6. 自动播放：可选，低频（推荐 9~10s）+ 用户交互后暂停。

## Interaction Rules
- 左箭头：`‹`，右箭头：`›`。
- 侧边卡支持点击区域，点击后切换为中心图。
- 中心图可点击放大/查看大图（可选）。
- 侧卡图标注只做静态弱化，不抢主视觉权重。

## Visual Design (Video-inspired)
- 中心卡：清晰（`opacity: 1`, `filter: none`），尺寸最大。
- 左右卡：`opacity` 约 0.4~0.5，`transform` 小旋转 + 深度位移。
- 后卡（后左/后右）：`opacity` 约 0.12~0.2，模糊/降亮。
- 过渡时长短，避免明显眩晕（目标减少视觉疲劳）。
- 统一加轻微阴影/边缘发光，形成“卡片”触感。
- 建议背景非纯黑：使用轻微渐变或网格雾化底纹（不压过图片）。

## 标签与内容规则（案例库统一）
优先标准标签：
- `封面图`
- `配件图`
- `安装图`
- `安装对比图`
- `成品效果图`
- `细节图`
- `案例图`

## Figma Save Guide（组件落地方式）
1. 建立 Frame：`CaseGalleryCarouselCard`（Desktop/Wireframe: 1400x760，Mobile: 390x780）。
2. 建立 5 个卡位 Layer：`Card_Center`, `Card_Left`, `Card_Right`, `Card_RearLeft`, `Card_RearRight`。
3. 建立 5 个 Variant 状态：`slot` 对应 5 档位。
4. 统一样式 Tokens：
   - `CardRadius`: `16`
   - `CenterWidth`: `clamp(286, 30vw, 404)`（desktop）
   - `SideScale`: `0.82`
   - `RearScale`: `0.63`
   - `BlurRear`: `0`~`2`
   - `Opacity`: {`center:1`, `side:0.42`, `rear:0.16`}
5. 交互绑定：
   - `ArrowPrev` → `activeIndex - 1`
   - `ArrowNext` → `activeIndex + 1`
   - `SideCard` → `activate(index)`
   - `AutoPlay`（可选，toggle）→ 9.6s/slide
6. 图层结构：
   - `CaseCarousel` > `Track` > `Card*` > `Image`
   - `Image` 建议 `contain` 显示关键图（防止车身/部件裁切）
7. 在顶部写明组件名为 `CaseGalleryFullSetCarousel`，并用组件说明注明“完整案例集轮播”与“侧卡点击直达中心”。

## Suggested Implementation Hints
- 组件文件建议：`components/portfolio/CaseGalleryCarousel.tsx`
- 资产选择建议：优先 `final`，不足时按 `editorial-review` 回退（只在允许白名单来源内）。
- `prefers-reduced-motion` 中保留静态位移，不保留大位移过渡，维持卡片深度。

## Acceptance Checklist（自检）
1. 焦点图来自完整案例集，未只显示单一图。
2. 5 卡位均有区分（中心/左右/后位），但一次只聚焦一个中心。
3. 侧卡可点，点击后立即变为中心图。
4. 上下左右箭头可控，且不遮挡内容。
5. 过渡不突兀、不晕眩。
6. 车友热度 `🔥🔥🔥🔥` 作为 badge 样式可见、居中适配。
7. 中心图清晰，非整体模糊。

## Delivery Artifacts
- 本 skill 文档：`/Users/macmini-simon66/.codex/skills/case-gallery-fullset-carousel/SKILL.md`
- Figma 落地建议以组件参数、token 与交互步骤入库。

## Provenance

Formalized by Open Design from candidate 6832f6fb-4621-49fa-9e93-f79dcc224523.
