# Deck vNext 注入规范

## 1. 定位

这版规范已作为当前分支的生产默认值接入，对应配置值 `outcome_only`，用于替换原约 20k+ 的通用 Deck 专属动态注入。`current` 与 `current_outcome` 仍保留用于实验回看和紧急回滚。

它保留 V3 已验证有效的结果导向规则，只增加保证 Open Design 预览、翻页、缩略图、批注和导出兼容所必需的最小技术协议。具体骨架实现、导航脚本、打印样式和专项修复不再常驻 System Prompt，应由平台运行时、模板和校验能力负责。

预计实际注入长度将显著低于当前规范。

## 2. 中文参考版

# Deck 最小交付协议

以下要求只规定 Deck 与 Open Design 的交付边界，不规定具体视觉风格或页面模板。

1. **交付完整产物。** 按当前执行环境的交付协议，输出一份完整的 HTML Deck 产物。编辑已有 Deck 时，应保留其已经兼容的运行结构，除非修复问题确实需要更改；不要在普通内容修改中重建整个运行框架。
2. **使用可识别的页面结构。** 每一页使用一个顶层 `<section class="slide" data-screen-label="NN Title">`，按照演示顺序存在于 DOM 中。`data-screen-label` 必须稳定且唯一；首屏在加载后可见，其他页面也必须持续存在于 DOM 中，以便宿主完成翻页、缩略图、批注和导出。
3. **使用标准演示画布。** 使用固定的 16:9 页面，确保在 1920×1080 下正确渲染。所有内容必须位于页面边界内，不得依赖滚动才能看到完整信息。
4. **与宿主导航协作。** 不要在幻灯片画布内部放置导航，也不要为导航预留页面空间。如果产物包含用于独立打开的上一页、下一页、页码圆点、页码计数、重置或快捷键提示，应将全部导航控件放在画布外的同一个 `data-deck-nav` 容器中；Open Design 会在宿主导航存在时隐藏该容器。
5. **保证静态完成态可用。** 核心内容不得依赖悬停、点击或未结束的入场动画才能出现。每一页在静态完成状态下都应完整、清晰、可导出。
6. **遵循用户明确要求。** 如果用户明确要求其他比例、纵向页面或特殊交互，可以偏离默认协议，但仍应尽量保留页面可识别性，并明确说明可能影响的预览或导出能力。

交付前，检查页面数量与顺序、首屏可见性和页面边界。在对应能力可用时，实际验证宿主翻页、缩略图识别和多页导出；能力不可用时，检查产物是否保留了这些功能所需的标准结构。发现问题时，修复产物，不要通过增加解释来代替修复。

# Deck 结果质量规则

以下规则同时适用于整份 Deck 和每一页。它们约束结果，而不是实现方式。

1. **每一页只承担一个叙事任务。**
   整份 Deck 应当构成一条有意识设计的论证路径，而不是一组各自好看的独立页面。如果删除某一页不会削弱整体叙事，就应删除或重写这一页。

2. **让标题直接表达本页结论。**
   标题应该说明观众需要记住的核心判断，而不只是标注页面主题。每一页只保留一个主要观点。

3. **形成“主张—证据—意义”的闭环。**
   正文必须使用最相关的事实、案例、对比、机制或证明，清晰支撑标题中的主张，并进一步说明这些证据为什么重要。不要给出缺少证据的结论，也不要堆放没有明确结论的证据。

4. **让页面结构表达推理关系。**
   并列关系使用平行分组，因果关系使用流程，时间顺序使用时间线，选项判断使用对比，数量关系使用图表。不要把没有并列关系的内容强行放进等权卡片，也不要用不增加信息含义的图形装饰文字。

5. **让留白发挥功能。**
   留白应当用于建立层级、节奏、分组或强调。如果内容集中在页面一角，导致页面显得没有完成，应放大核心信息、补充缺失证据，或改用能够有意识利用画布的结构。

6. **按照演示观看距离设计。**
   即使缩小到缩略图尺寸，观众仍应能够识别本页主张、核心证据和阅读顺序。使用清晰的字号层级、足够的对比度，并控制信息量，使观众能够在听讲的同时完成理解。

7. **建立唯一的视觉重心。**
   每一页都需要一个占主导地位的元素，例如核心陈述、关键数字、图表、产品画面或示意图。其他元素只能强化它，不能与它争夺注意力。

8. **只因叙事需要而改变构图。**
   整份 Deck 应保持统一、连贯的视觉系统。只有当叙事模式发生变化——例如开场、举证、转场、揭示或收尾——才改变页面底色、信息密度或布局；不要按照页码机械交替，也不要为了形式变化而变化。

9. **保持事实与认知边界的诚实。**
   明确区分有来源的事实、用户提供的事实、假设和建议。不要为了让页面看起来完整而虚构指标、业务进展、引语、客户或研究结论；证据不足时，应使用明确占位或定性表述。

10. **让每个视觉元素都有必要性。**
    每一条线、边框、容器、图标和装饰都必须明确表达层级、分组、比较、尺度或含义。如果删除它不会降低理解效率，就删除它。不要使用多个边界重复表达同一组关系；优先通过留白、对齐、字号和背景建立结构。

仅在相关内容出现时，额外遵循：

- **定量图表：** 图形比例必须由真实数据决定，并清楚显示类别和值；不得凭视觉感觉编造柱长、面积或比例。
- **图表与示意图：** 必须根据页面实际背景设置颜色和对比度，确保所有标签在演示距离下仍然可读。

交付前，先以缩略图视角检查整份 Deck，再逐页检查。以下任一情况出现时，应重写对应页面：

- 核心主张不清楚；
- 证据无法支撑主张；
- 排版掩盖了正确的阅读顺序；
- 页面内容没有推动整体叙事；
- 内容发生裁切、溢出或需要滚动才能完整阅读。

## 3. 建议实际注入的英文原版

```markdown
# Deck delivery contract

These requirements define only the delivery boundary between the deck and Open Design. They do not prescribe a visual style or slide template.

1. **Deliver a complete artifact.** Following the active execution contract, deliver one complete HTML deck artifact. When editing an existing deck, preserve its compatible runtime structure unless changing it is necessary to fix a real problem; do not rebuild the runtime for an ordinary content edit.
2. **Use a recognizable slide structure.** Represent every slide as one top-level `<section class="slide" data-screen-label="NN Title">` in presentation order. Keep every `data-screen-label` stable and unique. The first slide must be visible after load, and all slides must remain in the DOM so the host can navigate, thumbnail, annotate, and export them.
3. **Use a standard presentation canvas.** Use a fixed 16:9 slide that renders correctly at 1920×1080. Keep all content inside the slide bounds; the audience must not need to scroll to see the complete slide.
4. **Cooperate with host navigation.** Do not place navigation inside the slide canvas or reserve slide space for it. If the artifact includes standalone previous/next controls, pagination dots, a page counter, reset controls, or keyboard hints, place all of that chrome in one `data-deck-nav` container outside the slide canvas. Open Design hides that container when host navigation is present.
5. **Make the static completed state sufficient.** Essential content must not require hover, clicks, or an unfinished entrance animation to become visible. Every slide must be complete, legible, and exportable in its settled static state.
6. **Honor explicit user requirements.** If the user explicitly requests another aspect ratio, a vertical deck, or special interaction, you may depart from these defaults. Preserve slide discoverability where possible and state any preview or export limitation that remains.

Before handoff, verify slide count and order, first-slide visibility, and slide bounds. When the corresponding capability is available, test host navigation, thumbnail discovery, and multi-page export; otherwise inspect the artifact for the standard structure those capabilities require. Fix failures in the artifact; do not substitute an explanation for a fix.

# Deck outcome quality rules

Apply these as result criteria for the deck and for every slide. They constrain the outcome, not the implementation technique.

1. **Give every slide one narrative job.** The deck must move through a deliberate argument, not a pile of independently attractive pages. If removing a slide does not weaken the story, remove or rewrite it.
2. **Make the title the slide's claim.** A title should state the conclusion the audience should retain, not merely name the topic. Keep one primary idea per slide.
3. **Close the claim–evidence–implication loop.** The body must visibly support the title with the most relevant fact, example, comparison, mechanism, or proof, then make clear why that evidence matters. Do not present unsupported conclusions or evidence with no takeaway.
4. **Let structure express reasoning.** Use parallel groups for peers, flows for causality, timelines for sequence, comparisons for choices, and charts for quantitative relationships. Do not force unrelated ideas into equal cards or decorate prose with a diagram that adds no meaning.
5. **Make whitespace functional.** Empty space should establish hierarchy, pacing, grouping, or emphasis. If a slide feels unfinished because content is stranded in one corner, either enlarge the key message, add the missing evidence, or choose a structure that uses the canvas deliberately.
6. **Design for presentation distance.** At thumbnail size, the claim, primary evidence, and reading order must still be apparent. Use a clear type hierarchy, sufficient contrast, and no more detail than the audience can absorb while listening.
7. **Create one visual center of gravity.** Each slide needs a dominant element — a statement, number, chart, product view, or diagram. Supporting elements must reinforce it rather than compete with it.
8. **Vary composition only for narrative reasons.** Keep a coherent deck-wide system. Change surface, density, or layout when the story changes mode — opening, evidence, transition, reveal, or close — never by slide index or for arbitrary variety.
9. **Preserve epistemic honesty.** Distinguish sourced facts, user-provided facts, assumptions, and recommendations. Never invent metrics, traction, quotes, customers, or research to make a slide look complete; use an explicit placeholder or qualitative framing when evidence is missing.
10. **Make every visual element earn its place.** Every line, border, container, icon, and decoration must clarify hierarchy, grouping, comparison, scale, or meaning. If removing it does not reduce comprehension, remove it. Never stack multiple boundaries to express the same separation; prefer whitespace, alignment, type, and surface before adding boxes or rules.

Only when relevant:

- **Quantitative charts:** Derive visual proportions from the actual values and show both category and value labels. Never eyeball bar lengths, areas, or ratios.
- **Charts and diagrams:** Theme them for the slide's actual background and verify that every label remains legible at presentation distance.

Before handoff, review the deck once at thumbnail scale and once slide by slide. Rewrite any slide whose claim is unclear, whose evidence does not support it, whose layout hides the reading order, whose content does not advance the narrative, or whose content clips, overflows, or requires scrolling.
```

## 4. 不进入 System Prompt 的平台保障

以下内容不应继续占用常驻 Prompt，而应在启用这版规范时同步落实：

1. **Deck 识别与宿主桥接**
   - 支持 `.slide`、`data-screen-label` 和现有结构化 Deck runtime；
   - 在宿主导航存在时隐藏 `data-deck-nav`，并兼容已有产物使用的 `data-od-id="deck-nav"`；
   - 保证宿主翻页、缩略图、批注和导出在标准结构下可用；
   - 对无法识别的页面结构给出明确错误，而不是退化成普通网页后静默失败。

2. **Lint 对齐**
   - 保留缺少 `data-screen-label`、页面不可识别、内容溢出等真实可用性检查；
   - 移除“必须存在 `light` / `dark` / `hero` class”这类与具体实现绑定的 P0 要求；如果暂时没有可靠的渲染后可读性检查，应先降级或删除该规则，而不是用 class 名代替真实质量；
   - 不要求模型为了通过 lint 添加没有实际意义的 class。

3. **渲染与导出验证**
   - 验证首屏显示、页面总数和翻页状态；
   - 验证缩略图能够完整拆页；
   - 验证 PDF 页数与 Deck 页数一致；
   - 检测页面边界溢出和静态完成态下的不可见内容。

4. **按需专项规则**
   - 只有检测到定量图表时，才提供更具体的图表实现建议；
   - 只有检测到 Mermaid 或类似运行时图表时，才提供背景主题和导出兼容建议；
   - 不再把所有低频故障教程常驻注入每一次 Deck 任务。

## 5. 与三个实验版本的关系

- 相比 V1：删除固定模板、实现教程、历史故障说明和大部分局部硬阈值。
- 相比 V2：不把旧规范与结果规则简单相加，避免 Prompt 更长、规则注意力进一步分散。
- 相比 V3：完整保留已经验证有效的结果导向规则，只增加不会干预视觉决策的最小交付协议、一条视觉必要性规则和两条按需完整性规则。

这版的目标不是在 V3 上重新堆积规则，而是把“模型负责质量、平台负责运行”的边界重新划清。
