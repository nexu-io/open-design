/* Codex Slides page — Simplified Chinese override (Agent-localized over the English base). */
import type { DeepPartial, CodexSlidesCopy } from '../codex-slides-i18n';

const zh: DeepPartial<CodexSlidesCopy> = {
  title: "Codex Slides — 住在 Codex 里的开源 AI 幻灯片工作室 · PPTX 与 PDF",
  description:
    "Codex Slides 是一个住在 Codex 里的开源 AI 幻灯片工作室。描述你想要的一套幻灯片，或者直接把一个代码仓库、一份 PDF、一张表格丢给它，本地的 Codex 就会一路完成调研、拟大纲、定风格、渲染，并导出真正的 PPTX 和可付印的 PDF。每一页都是一整张视觉画布。45 套演示模板、73 种社区风格、24 个引导式场景，Fast 模式约四到五分钟就能渲染 10 页以上。浏览器优先，MIT 许可，用你已有的 codex login 就能跑，不用另配 API key。",
  label: "姊妹项目",
  heading: "住在你编码 agent 里的 AI 幻灯片工作室",
  lead:
    "大多数 AI 幻灯片生成器把活儿都藏在一次请求背后，最后甩给你一个文件。Codex Slides 不一样：调研、大纲、视觉方向、渲染、编辑、演示、导出，这整条链路都在 Codex 里全程可见、随时可调。每一套幻灯片都是一个留在你自己磁盘上、明天回来还能接着做的项目。而且它是 image-native 的，每一页都是一整张视觉画布，而不是换了文字的模板。",
  downloadCta: "下载 OpenDesign 桌面端",
  heroAlt:
    "Codex Slides — 左侧 Codex 正在驱动浏览器里的幻灯片工作室，右侧是渲染完成的市场报告页",

  glanceAria: "一览",
  glance: {
    stars: "GitHub 星标",
    templates: "演示模板",
    styles: "社区风格",
    scenarios: "引导式场景",
    license: "许可协议",
  },

  whyTitle: "为什么会有它",
  whyLead:
    "一套幻灯片不是一次性生成就能搞定的事。它是一连串决定——说什么、按什么顺序说、用什么视觉语言说——而每一个决定，在渲染之前修正都比渲染之后便宜得多。",
  ideas: [
    {
      headline: "你看着它一步步长出来，而不是干等一个文件。",
      body: "Codex 在自带的浏览器里打开工作室，并让它一直看得见。你先确认需求、改好大纲、敲定视觉方向，然后才渲染第一页——那些代价高昂的错误，在还便宜的时候就被拦下了。",
    },
    {
      headline: "每一套幻灯片都是长期存在的项目，而不是一次下载。",
      body: "对话、素材来源、大纲、品牌规则、检查点、渲染好的页面，全都留在磁盘上。明天回来接着编辑同一个项目；每一条 AI 指令、每一次手动修改都会落下一个不可篡改的检查点，随时能查看、回滚或导出。",
    },
    {
      headline: "image-native：幻灯片本身就是画布。",
      body: "每一页都是当成一整张视觉画布来构图的，而不是往现成主题上丢一个文本框，所以成品摆在手工设计的作品旁边也毫不逊色。直接在页面上圈注，再让它只按你的批注重新生成那一页。",
    },
  ],

  flowTitle: "它是怎么运作的",
  flowLead:
    "一句提示进去，一套能直接上台的幻灯片出来——每一步都留有检查点，而在这些地方，你的判断比再调一次模型更值钱。",
  flow: [
    { step: "01", headline: "先把需求问清楚", body: "一份量身定制的问题表单，会在动笔之前先确认受众、页数、画幅比例、语言、分辨率和视觉意图。" },
    { step: "02", headline: "把事实查扎实", body: "可选的多轮联网调研会生成一份带来源的 Markdown 简报，它在 Design Files 里始终可查、可改。" },
    { step: "03", headline: "把大纲打磨好", body: "逐条改标题和要点、加页删页、重排叙事，或者干脆让 agent 整个重构一遍——全都在视觉出现之前完成。" },
    { step: "04", headline: "锁定视觉方向", body: "Codex Slides 会拿风格库对着你的主题和大纲排序推荐。选一个、搜完整目录，或者就用默认的。" },
    { step: "05", headline: "并行渲染", body: "Fast 模式把所有页面一次全铺开渲染，而不是一页页排队，所以 10 页的幻灯片大约四到五分钟就位，而视觉方向全程锁定。" },
    { step: "06", headline: "就地修改", body: "让它改写文案、用箭头和批注圈出某块区域、替换图片、重排页序、设置转场、写演讲者备注。" },
    { step: "07", headline: "上台演示，一键导出", body: "用 Presenter Mode 打开同步的观众窗口和计时器，然后下载真正的 PPTX 和可付印的 PDF，备注一并保留。" },
  ],

  showcaseTitle: "这些幻灯片长什么样",
  showcaseLead:
    "每一张卡片都是 Codex Slides 自带的一套视觉体系——一个已经成型的方向，你从它出发，再换上自己的主题、受众或文件就行。",
  showcase: [
    { alt: "带图表和 KPI 标注的商业与市场报告幻灯片", tag: "市场报告 · 图表与 KPI" },
    { alt: "含世界地图、环形图和指标卡片的数据看板幻灯片", tag: "数据叙事 · 看板" },
    { alt: "靠高对比标题时刻取胜的电影感产品发布页", tag: "发布会 · 电影感" },
    { alt: "衬线标题配印刷网格的杂志编辑风幻灯片", tag: "编辑 · 印刷网格" },
    { alt: "明亮通透、带柔和 3D 图示节点、只用一抹靛蓝点缀的产品主题演讲页", tag: "主题演讲 · 明亮日光" },
    { alt: "把系统重建成剖面图的带标注技术剖切页", tag: "技术 · 带标注剖切" },
  ],

  insideTitle: "看看真实的产品",
  insideLead:
    "这些都是 Codex 在浏览器里真实操作的界面，跟你亲手用的一模一样，所以你随时都能接手。",
  inside: [
    { alt: "带提示词编辑器、场景快捷入口和社区风格的 Codex Slides 首页", tag: "首页 · 说出你想做什么" },
    { alt: "预置了各种演示工作流的场景库", tag: "场景 · 挑一个工作流" },
    { alt: "可逐条编辑标题和讲述要点的演示大纲", tag: "大纲 · 理清叙事" },
    { alt: "整页画布、工具栏、演讲者备注与缩略图并存的幻灯片编辑器", tag: "编辑器 · 整页画布" },
  ],

  scenariosTitle: "六大类工作流",
  scenariosLead:
    "24 个引导式场景，归成六大类工作流。每一类都自带对应的问题表、素材位和视觉语法。挑一个开始，或者直接说出你要什么。",
  scenarios: [
    { name: "从零开始创建", blurb: "从一份简报出发，生成商业报告、路演材料和项目提案。" },
    { name: "转换已有素材", blurb: "美化现成的 PPTX、HTML 或 PDF；把文档、笔记或一张白板照片变成幻灯片。" },
    { name: "数据与洞察", blurb: "数据看板、周期性业绩报告、财务结果和调研结论。" },
    { name: "调研与决策", blurb: "深度调研演示、市场研究、竞品分析、文献综述。" },
    { name: "优化一套幻灯片", blurb: "套用品牌体系、复刻参考风格、翻译与本地化、压缩或扩写。" },
    { name: "专项产出", blurb: "培训课件、发布会主题演讲、作品集与案例研究、模板驱动的批量生产。" },
  ],

  formatsTitle: "可直接交付的成品",
  formatsLead:
    "等视觉定了稿，再把它导出成一份真正的 PowerPoint（.pptx）和一份可付印的 PDF，两者都保留你的演讲者备注。挑一档渲染画质，选一种贴合现场或信息流的画幅：",
  formatsRows: [
    { label: "导出格式", values: "PowerPoint (.pptx) · PDF · 保留演讲者备注" },
    { label: "渲染画质", values: "1K · 2K · 4K" },
    { label: "画幅比例", values: "16:9 · 4:3 · 1:1 · 9:16 · 3:4" },
  ],

  duoTitle: "又快又省心",
  fastTitle: "Fast 模式",
  fastLead:
    "页面并行渲染——最多四页同时进行，其余排队——而不是一页接一页，同时已确认的大纲和视觉方向保持锁定。十页的幻灯片通常四到五分钟就位；就算中途被打断，也会从项目的权威状态接着跑，而不是从头再来。",
  installTitle: "安装到 Codex",
  installLead:
    "把仓库添加为插件市场，装上插件，重启 Codex，再开一个新任务。你只需要支持插件的 Codex、Node.js 20 或更高版本，以及一次 `codex login`——默认流程既不用单配 OpenAI key，也不用 `.env` 文件。",

  finalEyebrow: "下一步",
  tiebackTitle: "来自 OpenDesign 家族",
  tiebackBody:
    "OpenDesign 是一个开放、local-first 的设计工作空间，它位于你已经在用的编码 agent 之外。Codex Slides 就是同一个想法瞄准演示场景的产物：agent 在明处干活，项目留在你自己的机器上，没有任何东西被锁在订阅背后。想要幻灯片之外那整套设计工具箱，装上 OpenDesign 应用就好。",

  schemaAlternateName: "住在 Codex 里的开源 AI 幻灯片工作室",
  schemaWhatQuestion: "Codex Slides 是什么？",
  schemaWhatAnswer:
    "Codex Slides 是一个以 MIT 许可开源的 AI 幻灯片工作室，作为插件运行在 Codex 内部。它通过一条全程可见的工作流——澄清需求、可选调研、大纲、视觉方向、并行渲染、编辑、演示、导出 PPTX/PDF——把一句提示、一个代码仓库或一堆文件变成能直接上台的幻灯片，并把每一套幻灯片作为长期项目保存在你自己的磁盘上。",
  schemaKeyQuestion: "Codex Slides 需要单独的 API key 吗？",
  schemaKeyAnswer:
    "不需要。它用的就是你已经通过 `codex login` 登录的 ChatGPT 账号。默认流程既不用单独的 OpenAI API key，也不用 `.env` 文件；它只要求支持插件的 Codex、Node.js 20 或更高版本，以及 Git。",
  schemaExportQuestion: "Codex Slides 能导出真正的 PowerPoint 文件吗？",
  schemaExportAnswer:
    "能。Codex Slides 会导出真正的 PPTX 和可付印的 PDF，两者都保留项目里的演讲者备注，渲染画质支持 1K/2K/4K，并覆盖五种画幅比例（16:9、4:3、1:1、9:16、3:4）。由于它是 image-native 的，导出的 PPTX 每页是整页图像，而不是可以逐个编辑的 PowerPoint 图形；可编辑图形的导出也在计划之中。",
  schemaRelationQuestion: "Codex Slides 和 OpenDesign 有关系吗？",
  schemaRelationAnswer:
    "有。Codex Slides 是 OpenDesign 背后团队推出的姊妹项目——同样开放、local-first、agent-native 的思路，只不过用在了演示文稿而不是设计文件上。",
};

export default zh;
