# Deck V3：仅结果导向规则

## 版本说明

本文记录消融实验时的原始 V3 内容；实验期间它对应配置值 `outcome_only`。当前分支已将该配置值升级为建议上线的 vNext（最小交付协议 + V3 结果规则 + 少量完整性规则），实际新规范见 `deck-rules-vNext-proposal.md`。

它仅用下面的结果导向规则替换原有约 20k+ 的 Deck 专属动态注入规范。Open Design 的基础 System Prompt、任务上下文、工具协议、文件交付协议等通用内容仍然保留，并不是整次任务只使用下面这段 Prompt。

这组规则不规定模型必须使用哪种模板、组件或具体实现方法，而是定义最终 Deck 及每一页需要达到的质量结果。

## 中文整理版

### Deck 结果质量规则

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

### 交付前检查

交付前，先以缩略图视角检查整份 Deck，再逐页检查。出现以下任一情况时，应重写对应页面：

- 核心主张不清楚；
- 证据无法支撑主张；
- 排版掩盖了正确的阅读顺序；
- 页面内容没有推动整体叙事。

## 实际注入的英文原文

```markdown
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

Before handoff, review the deck once at thumbnail scale and once slide by slide. Rewrite any slide whose claim is unclear, whose evidence does not support it, whose layout hides the reading order, or whose content does not advance the narrative.
```
