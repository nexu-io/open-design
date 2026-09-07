# OD Next 上下文优化实验：SP 与 Skills 前后对照

> 策略实验，仅更新 `mason/od-next-strategy-v2-prompt` 远端分支。
> PR 的目标分支是 `mason/od-next-strategy-v2`；本次不执行合并，不合并 main，也不发布或推全。

本轮基线为 `a07106c5c87f7d885216ae1d661a901ae036560d`，已包含上一轮手机壳语义选型修复。
本轮优化 Core SP、通用编排及四个 active 任务类型的正文；不修改 main 策略、模型选择、工具实现、机器 schema、设备模板或渲染链路。

## 目标与取舍

唯一目标是让 Agent 获得足够而相关的上下文，在满足需求和质量要求的前提下，用更低成本、更短时延完成任务。没有设定固定压缩率，也没有把“更短”当作效果提升的证据。

采用三层职责：

| 层 | 保留的责任 | 移除的负担 |
| --- | --- | --- |
| Core SP | 优先级、能力和执行边界、跨类型设计目标、素材真实性、交付状态 | 通用前端教学、固定审美配方、反复强调同一禁令 |
| 编排 Skill | 路由、阶段、冻结对象、Preflight、协作条件、缺失输入处理 | 重复定义对象、重复解释阶段权限、正文复述机器合同 |
| 任务类型 Skill | 特定媒介的预期结果、字段、交付接口和技术参数 | 再讲一次通用视觉规则、指定固定布局和文案套路 |

模型可自行判断的内容改写为“目标 + 适用条件 + 冲突取舍”。文件路径、字段枚举、模板接口、阶段权限和导出归属继续明确表达。

## 依据如何进入正文

- [OpenAI Astra 提示词建议](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices)：合理授权、清楚的 Skill 优先级、按收益组织协作和验证、自然简洁的表达。这里不把它解释成“只写目标”或“删除所有否定句”。
- [OpenAI Skills 指南](https://learn.chatgpt.com/docs/build-skills)：复用已有上下文、按需读取辅助内容。入口因此改为只读缺失的绑定内容；没有增加一次模型分类、规划或自检调用。
- 用户提供的[行业实践与 D1/D2 文档](https://powerformer.feishu.cn/docx/ZCO5dtgRAoV53QxQ22ucjFphnWf)用于内部分析；正文不复制评测流程、评分口令或“必须满分”。
- [WCAG 文本对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)与[非文本对比度](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)：保留可访问性的标准目标，删除原文中把大字阈值写成 18px 的不准确简写。

行业实践中的受众适配、信息层级、视觉一致性、媒体语义相关、完整内容和可理解交互进入设计目标；具体风格偏好和单篇案例的布局数字没有升级为全局规则。

D1/D2 依据 [ODEval rubric v2 源码](https://code.powerformer.net/core/odeval/src/commit/f85687f65ebcf0c32039e1d3c273556271a5b7ae/platform/server/src/annotations/rubrics.ts#L17)采用当前评测含义：D1 需求实现占 30%，D2 视觉质量占 70%；D2 的五个维度分别是布局与可读性、信息层级、风格与任务适配、色彩与对比、图片匹配与相关性。参考文档旧流程图中的 65/35 和历史七维 rubric 不作为本次依据。这些权重没有注入生成提示词。

| 评测期望 | 转成 Agent 可执行的目标 |
| --- | --- |
| D1：实现明确需求 | 保留指定内容、结构、行为、锁定数据及素材；实际写出要求的产物 |
| D2：布局与可读性 | 内容变化时重排、分组或分页；保持可读密度、阅读路径和关键操作 |
| D2：信息层级 | 依受众理解或查找顺序组织信息，以位置和视觉权重区分主次 |
| D2：风格与任务适配 | 服从用户、品牌、参考和使用场景；同类内容一致，必要时因内容变化构图 |
| D2：色彩与对比 | 颜色角色一致、满足 AA 对比度、关键信号有非颜色表达 |
| D2：图片相关性 | 真实且相关，保留主体和必要信息，按内容角色决定裁切 |

## 源文本变化

下表为 UTF-8 bytes；统计六份正文，不包含机器合同、工具定义、附件、会话历史或 CLI 自带上下文。六份不会同时进入单个任务。

| 正文 | 版本 | 优化前 bytes | 优化后 bytes | 减少 | 行数前 → 后 |
| --- | --- | ---: | ---: | ---: | ---: |
| Core SP | 2.1.3 → 2.2.0 | 19,759 | 11,181 | 43.4% | 340 → 174 |
| 编排 Skill | 2.0.1 → 2.1.0 | 29,123 | 17,153 | 41.1% | 572 → 264 |
| 原型 Skill | 2.3.0 → 2.4.0 | 20,243 | 8,998 | 55.6% | 353 → 163 |
| PPT Skill | 2.0.0 → 2.1.0 | 11,445 | 3,709 | 67.6% | 214 → 69 |
| 营销 Skill | 2.0.0 → 2.1.0 | 9,959 | 4,643 | 53.4% | 188 → 90 |
| 视频 Skill | 2.0.0 → 2.1.0 | 7,735 | 4,204 | 45.6% | 161 → 77 |
| 合计 | — | 98,264 | 49,888 | 49.2% | 1,828 → 837 |

策略包版本为 2.0.4 → 2.1.0。入口 SKILL.md 由 1,149 → 1,222 bytes：这处增加用于明确复用已有正文，避免重复读取。映射版本、reserved image profile 与资源版本保持不变；已有任务保存原 Bundle 与绑定身份，不会自动重绑；新绑定使用新包身份。旧任务后续若重新加载包或资源，仍受当前 bundled 内容与旧 binding 的一致性检查约束，发生漂移会拒绝或按具体资源路径处理。本轮不承诺跨升级无缝续跑，前后实验应分别使用新会话。

## 逐项增删改

以下旧行号对应基线，新行号对应本次正文；完整原文可在 PR diff 查看。

## 1. Core：从统一设计配方转为六个通用目标

文件：`core-system-prompt.md`，v2.1.3 → v2.2.0。

- **删除｜目标默认**：移除统一字号、行长、4/8 间距、动效时长、全局画布安全比例和审美禁令；不再把米色、普通 UI 字体、紫色渐变等当成所有任务的默认禁区。
  - 旧188–229：“on-screen body text ≥ 16px”“small interactions 150–300ms”“warm beige / cream / peach …”。
  - 新91–122：由需求忠实、信息层级、内容与视口适配、视觉一致、颜色与交互语义、素材适配六目标决定具体选择。
- **合并抽象｜目标**：把各 profile 重复的对齐、留白、清晰层级、统一字体配色和图像适配上收；只保留一次通用要求。
  - 旧191–196的字号/行长配方 → 新99–107：“Layout that accommodates content”“Give equivalent content and controls consistent treatment”。
  - 新118–122仍明确：必需内容、无障碍、可读与可用优先于装饰；具体字号、间距和时序按任务选。
  - 新108–113仍明确WCAG AA对比、非纯颜色信号、可访问名称、键盘焦点、图片文本替代和reduced-motion；不是把无障碍底线一并删除。
- **新增表达｜目标**：新85明确“Use these goals to make decisions, not to produce a separate design essay”；目标应落实在产物中，不要求另写设计论证。
  - 新91–95把复刻与原创区分：复刻保留指定范围的参考关系，原创按受众与目的选择方向。
- **保持不变｜硬合同**：新17–34保留执行/安全边界、任务类型、用户指令优先级、冻结合同及真实运行事实；新41–58保留锁路由、计划阶段不 Build、repair 无工具、production 不重问、写盘后不做质量操作。
  - 新56–58说明既有媒体产出按已冻结所有权执行；这不授权播放、验收或检查后修复。
  - 新154–174保留机器块与用户说明分离、真实完成/阻塞/取消、真实文件与入口、语言与引用忠实。
- **保持不变｜内容底线与辅助规则**：新126–150保留真实事实、真实实体图片、本地素材、不能用装饰替代必需素材、内容图完整几何和正常文档流。
  - 旧250–255：“before writing styles … read its intrinsic width and height … a one-line shell probe”。
  - 新144–145：“Use known intrinsic image dimensions; probe unknown dimensions … batching independent probes”。
- **潜在行为变化**：允许复用已知且有效的图片尺寸，只对未知尺寸探测；这可能改变工具调用轨迹，需要实测，不能直接宣称更快。旧的无条件探测要求没有原样保留。
- **潜在行为变化**：删除审美黑名单后，合法品牌/任务方向有更大选择空间；是否增加普通模板感、降低可读性，仍需由完整产物比较回答。

## 2. General：合并流程叙述，修正澄清输出的文本冲突

文件：`general-orchestration.md`，v2.0.1 → v2.1.0。

- **删除｜重复说明**：旧83–108的完整写盘边界、449–485的 Build/读写复述和562起的成本条款不再各自展开；新6–9、213–219、261–264回指 Core，同时保留本层的执行责任。
- **合并抽象｜硬合同**：旧204–295多处计划步骤、草稿字段和 Resolver → 新123–149单一六步规划序列；字段来源/必填/缺失处理集中于39–53。
  - 旧包含单独的“Drafting the Task Profile”“Resolver”；新先解析输入、做 Intake、解决缺口、冻结需求、规划 Build、Execution 后移交。
  - 新139–140：“When no clarification is needed, freeze directly; do not output duplicate draft and frozen versions”。这约束输出重复，不允许省掉必填字段。
- **新增/纠正文案｜硬合同**：澄清时保留 Runtime State，禁止的只是尚未完整的 Plan Contract。
  - 旧532–533：“The Task Profile draft stays in internal working state … no machine-contract block is output”。
  - 新240–248：“Emit exactly one Runtime State per response”；澄清为“executionMode: null; emit no Plan Contract”。
  - 原因：已有 `packages/contracts/src/prompts/od-next-strategy.ts:684,698` 本来就要求每次一个 Runtime State，澄清 mode 为 null 且不输出 Plan Contract；`packages/contracts/src/plugins/strategy-v2.ts:495–501,569–580`已有对应 schema。此次不新增 wire 字段或协议阶段。
  - 这是消除 Skill 与既有机器合同的矛盾；尚未据此证明减少了解析失败或修复轮次。
- **保持不变｜硬合同**：新57–72保留四阶段；76–117保留 Direct Edit 的全部条件、最小变更合同、simple、同请求完成与范围失控后 blocked。
  - 新153–181保留真实两阶段 Preflight、最多一轮1–3问、只重做受影响项；下游产品导出器不进入 Agent 的 Execution gate。
  - 新185–211保留 complex 的至少两个独立包、冻结共享决策、已验证原生 Child 生命周期和并行收益门槛；锁定后不回退 simple。
- **保持不变｜辅助引用**：旧489–506 → 新223–236仍按“需要媒体工作、阶段允许、完整有效正文尚不在上下文”条件读取 `od-next-media-inputs`；POSIX wrapper 命令不变。
- **潜在行为变化**：单一规划序列和“不重复草稿/冻结版”更直接地约束解释性输出；所需合同内容、能力检查和交付不能因此减少。其输出长度、轮次效果待测。

## 3. Prototype：保留产品交互和模板接口，移除页面配方

文件：`task-profiles/prototype.md`，v2.3.0 → v2.4.0。

- **删除｜目标默认**：旧72–107的风格例子、色彩/阴影禁令、relaxed/standard/compact像素档位；旧222–224的汉字上限；旧256–295的固定表单时机、导航数量和性能阈值。
  - 旧101–102：“relaxed 24–96px, standard 16–64px, compact 8–32px”。
  - 新17：“Apply configured visual style, information density, and motion”；具体空间由 Core 内容适配目标决定。
- **合并抽象｜目标**：旧117–144、256–295 → 新53–79的状态连续、反馈、可访问操作、响应式与加载稳定性。
  - 旧“Validate on blur, not on every keystroke” → 新62–64要求字段错误解释问题/补救，并保留有效输入；校验时机由场景决定。
  - 旧139：“breakpoints at 375 / 768 / 1024 / 1440” → 新71–75：“cover 375px through wide screens; choose breakpoints where content needs to reflow”。
- **保持不变｜硬合同**：新20–33保留 presentation 四字段、全部枚举、none/source 一致性；新104–125保留选框顺序、默认仅 mobile-app、显式无框优先、现有壳保留、catalog 缺失则 blocked。
  - 新42–51保留真实入口解析顺序和主流程可操作；新22–23不增加 machine block、分类调用或选框确认轮。
- **保持不变｜辅助引用/技术接口**：新83–88完整嵌入 `.od-frames/layout.css`、`@layer od-layout` 顺序与 marker；新128–155保留三个壳路径、APP CONTENT 标记、`.phone-content`、safe-top/bottom、`:root` token 和480px fallback。
  - 删除旧233–241的八类布局用法表，没有删除 CSS 文件或类接口；完整注入的 `prototype/layout.css:22–28`仍解释 `--od-ratio` 与 `.od-media-cover` 的成对用法。
- **新增/增强表达｜目标**：新48–51明确产品 UI 的演示控制默认不出现，但用户确实要求作为产品功能时允许；新98–100强调金额、状态、错误等信息完整可读。
- **潜在行为变化**：旧229–230连换行也禁止的价格/时间/动作文字，新98–100允许必要换行，但仍将数字与单位等不可拆值绑定；新90–97允许改写未锁定文案，禁止靠截断隐藏界面说明，数据摘要保留全文入口。
- **潜在行为变化**：375px是沿用原型支持范围的下界，不是新增行业通用标准；固定中间断点被取消，480px是现有壳的实际fallback接口，因此保留。

## 4. PPT：从叙事与版式目录转为整套表达目标

文件：`task-profiles/ppt.md`，v2.0.0 → v2.1.0。

- **删除｜目标默认**：旧62–78六种用途的固定页数与1/3、2/3节奏点；90–101七种文案公式；121–130八种布局；153–164审美负面清单。
  - 旧76–78：“Place one rhythm break at roughly the 1/3 mark … 2/3 mark”。
  - 新53–55：“Change density and rhythm where the narrative benefits”。
- **合并抽象｜目标**：旧80–151与187–207质量复述 → 新41–62：标题连成叙事、一页一个结论、演讲/阅读密度、按内容变化、可解释证据、保护既有页面。
  - 旧148–151：“at most three supporting points per slide” → 新47–52按约定预算和材料分配页数与负载，过密时重组/拆页，不能丢内容或缩字硬塞。
- **新增表达｜目标合并**：旧101的行动页要求并入新46“make a requested decision or next action explicit”，不是新增行动交付物；页数预算与完整内容共同约束布局，不能仅为了省页面删信息。
- **保持不变｜硬合同**：新22–37保留可编辑单文件HTML、真实入口、完整内容及页序、可翻页、无占位；PPTX/PDF由产品生成，Agent不探测转换工具、不导出、不验证、不虚报完成。
- **保持不变｜硬合同**：新56–62保留来源、单位、时间、归属、真实数据、锁定文字和局部编辑范围；66–69仍只允许冻结叙事/数据/设计后拆完整有序章节。
- **潜在行为变化**：取消“never invent a structure from scratch”及固定页数/公式后，模型可按材料组织故事；不保证更有说服力，需要查看全篇标题叙事、内容完整性与最终版式，而非只看封面。

## 5. Marketing：聚焦主张、支持信息与行动，保留渠道交付参数

文件：`task-profiles/marketing.md`，v2.0.0 → v2.1.0。

- **删除｜目标默认**：旧103–124的固定三区构图、统一字体/CTA高度、文字占画面20%、50%缩放规则；旧136–163风格禁令与行业外观配方。
  - 旧105–106：“Compose in three zones … CTA at the bottom”。
  - 新36–40：“Connect the claim, evidence, and action”；动作位置由信息关系与渠道决定。
- **合并抽象｜目标**：旧48–88、107–124、165–180 → 新34–52：一眼懂主张、支持信息相关、动作明确、品牌事实不变、每个尺寸独立编排。
- **新增表达｜目标**：新50–52仅在要求不同创意方向时才强调构图/信息/概念差异；不是所有尺寸变体都被迫重新探索创意。
- **保持不变｜硬合同**：新22–32保留每尺寸HTML画布、可编辑源、派生关系、产品导出图片/PDF、写盘后不做检查及不虚报导出。
- **保持不变｜技术参数**：旧92–101、128–134 → 新56–72；用户配置优先，未配置才用渠道画布默认；保留300/150 DPI、CMYK、3–5mm出血、5mm裁切安全距离、纯黑单色及交付记录责任。
  - 旧128：“300 DPI (150 DPI acceptable for large format)” → 新68–70同值；这些描述输出尺寸/印刷生产，而非审美偏好。
- **保持不变｜内容/许可硬边界**：新41–46保留品牌、文案和交易事实；新76–82保留对外营销的授权摄影限制、网页图仅披露占位、真实指代不伪造。
- **潜在行为变化**：动作数量、字体数量、构图位置与文字密度交给任务判断；不能据此移除法务内容、价格条件或用户锁定文字。渠道默认数值是继承配置，不是本轮重新验证过的最新平台政策。

## 6. HyperFrames：保留时间轴与音画合同，减少动效/读速配方

文件：`task-profiles/hyperframes.md`，v2.0.0 → v2.1.0。

- **删除｜目标默认**：移除旧94–105的短标题至少1.5秒、每4汉字约1秒阅读公式及118起的审美禁令；重复的对比可读性和图片清晰度要求由Core统一表达。
  - 旧99–100：“short titles no less than 1.5 seconds … 1 second per 4 Chinese characters”。
  - 新52–54：“Set exposure time from the amount of copy, the audience, and the narration”。
- **合并抽象｜目标**：旧48–116多个视觉/时间/运动小节 → 新42–69的时间轴叙事、动效传义、时空可读、音画同步、场景连续与介质忠实。
- **新增表达｜硬合同澄清**：新23–26集中写出总时长、尺寸、比例、帧率须匹配配置；新34–38把媒体生成所有权与生成后的质量检查分开表述。
- **保持不变｜硬合同**：新23–38仍交付可编辑timeline HTML及稳定render entry；产品生成MP4；只有任务合同显式分配的render-owning Build Package才负责渲染，并声明格式/时长/尺寸/帧率。
  - 新35禁止播放/抽帧/质量验证；渲染例外不是新增预览权限。原profile没有独立player API，本轮没有猜造接口或加载新工具。
- **保持不变｜目标与技术边界**：新44–46保留锁定镜头顺序/时长/文字/转场/媒体；59–69保留有音频时的同步、静音传义、连续性、不能用静态页冒充运动或代码动画冒充真人实拍。
- **保持不变｜条件默认**：旧101–103 → 新55–58保留竖屏顶部约15%/底部20%、横屏5%安全区；其作用是避开播放平台遮挡，不是视觉风格，已有用户safe-area配置优先。
- **潜在行为变化**：时长按内容和旁白决定，可能更适配也可能造成读速不足；安全区比例仍是原文继承的近似fallback，不是对全部平台UI的保证。每镜头仍只归一个包（新73–77）。

## 7. SKILL入口：复用已注入正文，补读缺失部分

文件：插件根 `SKILL.md`。

- **删除/改写｜辅助引用**：旧12“load the assets in this order” → 新12–13“use the strategy bodies already included … Read only missing bound content”。
- **合并抽象/新增**：没有新增正文或工具；只是把缺失检查前置，避免将固定读取顺序理解为每次必须重读全部。
- **保持不变｜硬合同与引用**：新12仍要求validated V2 binding；15–18仍为Core→General→单个选中profile；20–29仍说明资源包身份、工程staging和运行事实所有权。
- **潜在行为变化**：正文已完整且有效时可不再发起重复读取；缺失、截断或失效时仍须补读。实际节省与正确复用率未测。

## 8. 用户审阅时应区分的变化性质

| 性质 | 本轮例子 | 不应推出的结论 |
|---|---|---|
| 保留产品/机器合同 | Runtime State、选框字段、HTML入口、导出职责 | “文字变少所以协议也更宽松” |
| 保留真实技术接口 | 480px壳fallback、CSS layer/marker、印刷参数 | “所有数字都是审美配方，都该删” |
| 保留既有覆盖目标/近似默认 | 375px支持下界、视频safe-area比例、渠道默认画布 | “这些数值已重新验证为所有平台的最新标准” |
| 新的行为候选 | 已知尺寸复用、不重复读Skill、自由断点/页数/读速 | “一定更快、更便宜或更好看” |
| 生成目标抽象 | 内容可读、风格适配、信息关系、动效传义 | “模型自称满足目标就已通过验收” |

这份增删清单依据源文回读和已有合同代码整理，不是模型评测结果。效果比较应同时观察需求漏项、最终视觉与交互、真实数据/素材、协议成功率、完整任务成本和端到端时延；本清单不预报提升幅度。


## 必须继续明确的边界

- 原型的 `productSurface / viewport / deviceFrame / frameSource` 四字段及枚举、选择次序、显式用户意图和旧外壳保留。
- “官网适配移动端”默认无手机壳；网站明确要求演示框与移动 App 默认框是不同意图。
- 已验证模板目录和 `.od-frames/*` 接口；原型的 layout.css、层顺序、标记、插槽、safe area 与窄屏退壳行为。
- 模板在已有 Build 写入步骤内复制和填槽，不新增一轮模型调用，不用正文重写固定硬件源码。
- Direct Edit / Full Plan、一次澄清轮及其上限、冻结后生产、两个 Preflight、verified native Child 和独立 Build Package 门槛。
- Ship on write 与产品侧导出边界；HyperFrames 原有的显式 render-owning package 例外仍受冻结生产职责限制。
- 真实素材、锁定内容、诚实的完成/阻塞状态以及完整机器输出合同。

没有为压缩文本删除这些边界。375px 等原型支持目标、画布尺寸、印刷参数，以及没有平台配置时的视频 safe-area 默认值仍是带适用条件的技术默认；它们不限定整体视觉风格，明确配置优先。

## 同条件的请求装配大小

复用真实的包解析/绑定/装配函数（`resolvePluginFolder`、`createBundledStrategyBindingV2`、`applyPlugin`、`resolveOdNextStrategyRequestRecipeV2`、`composeSystemPrompt` 与 `composeChatAgentTextPayload`），分别绑定旧包和新包。比较阶段为首次 `request` 规划输入（新建产物场景预期走 Full Plan，实际路由由 Agent 声明）；同一个 case 的用户需求、能力事实、执行 profile、阶段与宿主上下文相同。包版本与内容 hash 按实际内容变化。

| 类型 | Bundle 优化前 bytes | Bundle 优化后 bytes | 减少 |
| --- | ---: | ---: | ---: |
| 原型 | 91,029 | 59,236 | 34.9% |
| PPT | 78,537 | 50,253 | 36.0% |
| 营销 | 76,278 | 50,414 | 33.9% |
| 视频 | 74,055 | 49,976 | 32.5% |

这是受控装配输入：未选择额外 Session Skill/example card，没有记忆、品牌、模板、历史、附件或 MCP 上下文。原型带相同的中性设备目录及布局资源。线上若选择示例卡或品牌 Skill，其内容仍会进入上下文；本轮没有重写共享的示例卡，也没有宣称消除全部上下文中的模板约束。

能力信息由仓库 resolver 生成：0.153.4 使用记录 CLI 0.147.0 的内置 fixture 兼容映射；这不是本轮现场验证 Child 生命周期或真实 daemon admission 的证据。

该 Bundle 包含策略、机器合同与请求封装，但不包含 Codex CLI 在其外添加的工具定义、系统说明和用户 Skill 目录。两种大小都不是 provider token 数，也不能代表真实费用。运行时流程没有增加固定的分类、规划或自检调用环节；模型实际选择的工具回合数仍需观测。

## Astra 小规模规划对照

使用现有应用内 Codex CLI 0.153.4 请求 `gpt-6-astra`，reasoning `low`。两个 case 各前后一次，新建 ephemeral 会话，忽略用户配置但保留同一认证；四次共用同一隔离可写目录与完全相同的 staged 资源。顺序为原型前→后、PPT后→前；每次上限 180 秒，没有重试或 repair 续跑。比较输入为上述原样导出的 Bundle，没有加入额外评测提示。

| Case | 版本 | CLI 完成秒数 | 总 input tokens | 其中 cached input | output tokens | 工具动作数 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 原型 | 前 | 96.871 | 84,811 | 53,632 | 2,737 | 1 |
| 原型 | 后 | 102.565 | 106,779 | 82,048 | 2,753 | 2 |
| PPT | 前 | 99.460 | 78,588 | 50,560 | 2,711 | 1 |
| PPT | 后 | 98.233 | 66,428 | 44,416 | 2,751 | 2 |

四次均输出 `full_plan / simple / plan_ready`，没有 question-form。用真实 parser、独立临时 Task/Snapshot Store、Intake、Execution Preflight 和 coordinator 接受逻辑回放，四次均无 parser issue、无 normalization，均可冻结；capability hash 与 inputRefs 和输入精确一致，productionRoutes 均在输入允许列表内。原型两次均为 `website / responsive / none / none`；PPT 两次均保留 6 页和给定六主题顺序。未启动 production，也没有生成 HTML 或产品侧导出。

这里是两个样本的规划与协议 smoke，不是四类任务的完整效果评测。CLI 的用量是全部工具回合累计，完成时间包含外层启动、网络、缓存与工具执行。没有实际费用、首 token 时间、完整任务时延或 D1/D2 分数；不存在仅凭这些数字宣告最优版本的依据。

具体观察：

- 原型新版总 input 增加、耗时略增；PPT 新版总 input 减少、耗时接近。两类未缓存 input 分别为 31,179→24,731 和 28,028→22,012；缓存分布和工具回合不同，不据此计算实际账单或稳定降幅。
- 原型两版首次文件枚举都没有覆盖隐藏的 `.od-frames`。新版补查目录、写权限和 Python 可用性，多一次工具回合；旧版直接输出 Plan。两版均要求实际 Preflight，不能由单次采样认定额外读取由压缩导致，也不能把少查一次当成更正确。
- 原型旧 Plan 选择中性暖白与拟获取的摄影，新 Plan 选择奶油色与明确标为示意的内嵌 SVG。说明可选择的设计方向发生变化；未看到完整产物，不能判断视觉优劣或 D2 增减。
- 初始另有两次只读目录探针：均因 filesystem Execution Preflight 条件不兼容而无法冻结，已保留并排除于上表。随后两组统一为可写实验条件，策略正文与 Bundle 均未改动，没有为让实验通过而放开规划阶段 Build 权限。

实验原始输入、哈希、逐次 CLI events/reply/usage 和 coordinator 结果保存在本工作树的 `.tmp/context-optimization/`；目录被 Git 忽略，不进入产品包。

## 验证与结论边界

- `pnpm guard` 与全仓 `pnpm typecheck` 通过。
- contracts：56 个文件、548 项测试通过。
- plugin-runtime 策略包和 fixture：2 个文件、12 项通过。
- daemon 策略包、请求装配和设备资源：3 个文件、30 项通过。
- 真实 daemon + 模拟 Codex：6 条手机壳与 Direct Edit 回归通过，覆盖官网无壳、旧 iOS 转 Android、模板文件冲突、沿用旧框、单轮去壳；同文件其余 32 条未在这组聚焦命令中运行。
- 合计 596 项相关测试通过；服务链路的模拟模型不计作 Astra 效果证据。
- 三个测试文件仅更新正式资源的版本/标题断言，并为一个现有规则添加单词边界，避免把 `preview` 中的 `review` 子串误判成检查动作；没有放开 ship-on-write 的业务权限。
- 六正文、入口与 manifest 完成独立语义审阅；这项审阅不等同于模型生成效果验证。

压缩后的布局和审美自由度可能带来不同的视觉选择。源文本缩减与协议通过只支持进入策略实验，不能证明 D1/D2、实际费用、端到端时延或成功率提高。结果质量需要同条件的实际生成及独立评测；不以更短输出、静态检查或一次成功替代。
