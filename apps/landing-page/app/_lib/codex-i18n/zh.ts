/*
 * 简体中文文案：Codex 设计插件精选合集。
 * 译自英文基线（codex-en-v2）。
 */
import type { CodexCopyOverride } from './index';

export const zh: CodexCopyOverride = {
  collectionEyebrow: '精选合集',
  collectionHeading: '让 Codex 真正做出好界面的设计插件',
  collectionLede:
    'OpenAI Codex 能写出跑得起来的代码。但没人管它的时候，它只会挑最保险的字体、最平庸的间距，再把 Helvetica 往中间一放。这里精选的插件专门给它补审美：审美类 Skill 和设计系统规则。挑一个装，或者在 Open Design 里全跑起来。',
  collectionStats: [
    { value: '50', label: '个精选插件' },
    { value: '13', label: '个来源仓库' },
    { value: '开源', label: '且全部可溯源验证' },
  ],
  collectionIntro:
    '下面每个插件都真实存在，并附上源地址。它们各司其职，分成两类：在写代码之前先定下审美、把你的设计系统变成 Agent 必须遵守的规则。',
  collectionCategoryBlurbs: [
    '在写下第一行代码之前，就把 Codex 的默认审美判断改掉。',
    '把你的 token 和组件变成规则，让 Codex 照着做，而不是自己瞎编。',
  ],
  collectionCloserHeading: '省掉配置，在 Open Design 里用 Codex 做设计',
  filterAll: '全部',
  collectionCloserBody:
    'Open Design 是围绕 Codex 运转的开源、Agent 原生设计工作空间。它让你的设计系统、Skill 和模板始终保持一致，Agent 交付的成果真正属于你。',
  categoryFrontend: '前端与 UI',
  categoryDesignSystems: '设计系统',
  ctaDownload: '下载 Open Design',
  ctaStarList: '给这份清单点 Star',
  ctaBrowseAll: '浏览全部插件',
  ctaViewSource: '查看源地址',
  ctaOurRepo: 'GitHub 上的 codex-design',
  cardKind: '插件',
  cardWhatItDoes: '它能做什么',
  cardCta: '查看插件',
  detailWhatIsIt: '这是什么',
  detailWhyForDesign: '它对设计意味着什么',
  detailHowWithCodex: '如何配合 Codex 使用',
  detailExampleTag: '什么时候用它',
  detailSource: '来源',
  detailCategory: '分类',
  detailMaintainer: '作者',
  detailTags: '标签',
  detailLicense: '许可证',
  detailCovers: '包含哪些内容',
  detailUpstream: '来自上游 SKILL.md',
  detailCodexNote: '可用于 Codex',
  detailTraction: '热度',
  detailRepo: '源仓库',
  detailStars: 'Star',
  installHeading: '如何安装',
  installRunInCodex: '在 Codex 里运行这条命令。',
  installRestart: '重启 Codex，让它加载新的 Skill。',
  installClone: '克隆这个仓库。',
  installPoint: '把 Codex 指向这个 Skill 文件。',
  installThenUse: '然后描述你想要的界面，Codex 会照着这个 Skill 来做。',
  installNote: '这里的每个插件都免费开源，并附上真实的上游源地址。',
  installNoteCta: '浏览整个合集',
  detailMoreOnList: '在 codex-design 清单上了解更多',
  detailRelated: '更多 Codex 设计插件',
  finalEyebrow: '下一步',
  detailCloserHeading: '用 Open Design 做设计，省掉那些配置',
  detailCloserBody:
    '你可以自己装这个插件，也可以用 Open Design 在 Codex 外面套一整层精选设计层。自带 API Key，产出归你所有。',
  skills: {
    'gpt-taste': {
      tagline: '用 GSAP 滚动动效和无缝拼接的 bento 网格，做出获奖级的落地页。',
      whatIsIt:
        '一条前端指令，通过模拟随机挑选首屏、字体、组件和 GSAP 范式来强制布局多样性，同时规定 AIDA 页面结构和大区块间距。',
      whyForDesign: [
        '首屏标题保持两三行，容器会加宽而不是挤成一堵字墙。',
        'Bento 网格用 grid-flow-dense，不会留空格或破版的格子。',
        '廉价的元标签一律禁用，按钮文字对比度在出稿前会被检查。',
      ],
      howWithCodex: [
        '提出页面需求，Skill 会先输出一段 design_plan，再动手写界面代码。',
        '检查它随机挑选的结果：首屏布局、字体组合、组件、GSAP 范式。',
        '核对起飞前检查项：首屏宽度算法、网格密度、标签排查、对比度。',
      ],
    },
    'stitch-design-taste': {
      tagline: '写一份 DESIGN.md，引导 Google Stitch 做出不落俗套的界面。',
      whatIsIt:
        '生成一份为 Google Stitch 界面生成优化过的 DESIGN.md，把氛围、颜色、字体、组件、布局、动效和一份明确的禁用清单都写进去。',
      whyForDesign: [
        'Stitch 生成的界面统一继承一个饱和度低于 80% 的强调色，而不是霓虹紫渐变。',
        '居中首屏和三栏等宽卡片超过设定的多样性阈值就会被禁用。',
        '加载和空状态做成骨架屏式的排版，而不是千篇一律的转圈图标。',
      ],
      howWithCodex: [
        '描述项目的调性，Skill 会设定密度、多样性和动效的评分。',
        '它输出一份七个章节的 DESIGN.md，带具体色值和各颜色的功能角色。',
        '把这份文件直接喂给 Stitch，或者通过 Stitch MCP server 传进去。',
      ],
    },
    'image-to-code': {
      tagline: '先生成设计效果图，分析之后再据此写出对应的前端代码。',
      whatIsIt:
        '一套图像先行的视觉网页工作流。Agent 先生成各区块的参考图，从中提取字体、间距、颜色和组件，再照着实现整个网站。',
      whyForDesign: [
        '代码有真实的视觉参考可循，实现不会滑向千篇一律的布局。',
        '每个区块单独生成一张大图，文字和间距都能被清楚分析。',
        '首屏标题控制在三行以内，也不会出现层层嵌套的容器堆叠。',
      ],
      howWithCodex: [
        '说明要几个区块，Skill 会在 Codex 里为每个区块各生成一张图。',
        '按钮或文字细节看不清时，要求它再渲染一张更近的细节图。',
        '让它在写任何实现文件之前，先跑一遍清晰度检查。',
      ],
    },
    'imagegen-frontend-mobile': {
      tagline: '把高质感的移动应用界面流程生成图片，而不是代码。',
      whatIsIt:
        '一个只出图的 Skill，用于 iOS、Android 及跨平台产品的移动界面概念和流程，把界面放进干净的手机样机里展示，从不写代码。',
      whyForDesign: [
        '界面会尊重安全区域和系统区域，不会看着像塞进手机里的网页。',
        '锁定的设计规范让配色、字体和图标在每一屏之间保持一致。',
        '多屏套组会构成一条可信的流程，而不是互不相关的孤立样机。',
      ],
      howWithCodex: [
        '说明应用类别和屏数，每一屏都会单独生成一张图。',
        'Skill 会先选定平台模式：iOS、Android，或跨平台中性风格。',
        '文字偏小或取景不均的屏幕，可以要求它重新生成。',
      ],
    },
    'imagegen-frontend-web': {
      tagline: '为落地页的每个区块各生成一张横版参考图。',
      whatIsIt:
        '一个专注网站设计参考图的 Skill，为每个区块单独生成一张横版图，整套图用同一套锁定配色，首屏构图各有变化。',
      whyForDesign: [
        '八个区块的落地页会得到八张可读的效果图，而不是一张挤压变形的拼版图。',
        '首屏构图会跳出「左文右图」这个用滥了的默认组合。',
        '同一套配色、字号阶梯和 CTA 样式贯穿每一张生成图。',
      ],
      howWithCodex: [
        '说明想要几个区块；不说明时落地页默认是六个。',
        'Skill 会先报出数量，再按区块编号给每张输出图标注。',
        '给出「编辑感」「电影感」这类调性词，可以左右首屏比例和背景。',
      ],
    },
    'minimalist-ui': {
      tagline: '用暖色单色调和扁平 bento 网格，做出编辑风的界面。',
      whatIsIt:
        '一套面向文档风极简界面的前端规范，固定了暖色单色调、衬线加等宽的字体层级、1px 描边的 bento 卡片，以及低饱和的柔和强调色。',
      whyForDesign: [
        '每张卡片和分隔线都用统一的 1px 浅灰描边，圆角干净利落。',
        '强调色只来自四种柔和的浅色，专门留给标签和行内代码使用。',
        '区块的层次感来自低透明度的图像，而不是空荡荡的纯色背景。',
      ],
      howWithCodex: [
        '提出页面需求，Skill 会先定下大留白，py-24 或 py-32。',
        '它把文字宽度限制在 max-w-4xl 以内，并立刻套用单色调变量。',
        '滚动入场的淡入效果只通过 IntersectionObserver 控制 transform 和 opacity。',
      ],
    },
    'design-taste-frontend': {
      tagline: '读懂需求、选定方向，交付不落模板的界面。',
      whatIsIt:
        '一个反平庸的前端 Skill，面向落地页、作品集和改版项目。它先给出设计判断，设定多样性、动效和密度这几项刻度，再跑一遍长长的起飞前检查。',
      whyForDesign: [
        '企业类需求会用上官方设计系统包，而不是手搓一套看着像的 CSS。',
        '起飞前检查禁止破折号、区块编号式的小标题、滚动提示，以及重复意图的 CTA。',
        '布局重复度有上限，八个区块至少要用四种不同的版式家族。',
      ],
      howWithCodex: [
        'Agent 在写任何代码之前，先用一句话给出设计判断。',
        '它设定三项刻度：设计多样性、动效强度和视觉密度。',
        '起飞前检查的每一项都必须通过，否则页面就还没做完。',
      ],
    },
    'industrial-brutalist-ui': {
      tagline: '做出刚硬的瑞士印刷风或 CRT 终端风界面，带模拟颗粒质感。',
      whatIsIt:
        '一套把瑞士印刷排版和军用终端美学融合在一起的设计系统，规定了刚性网格、极端的字号反差、一种警示红强调色，以及模拟出的信号劣化效果。',
      whyForDesign: [
        '每个项目只选一种底色基调，浅色和深色永远不会混用。',
        '完全拒绝 border-radius，每个角都保持九十度直角。',
        '网点、扫描线和噪点滤镜让表面不会显得像扁平的矢量图。',
      ],
      howWithCodex: [
        '先选一种原型：瑞士工业印刷风，或者战术遥测 CRT 终端风。',
        '大标题用 clamp 加负字距，元信息用小号大写等宽字体。',
        '1px 的网格间距配上反差背景色，做出刀锋般纤细的分隔线。',
      ],
    },
    'redesign-existing-projects': {
      tagline: '审查现有网站，在不破坏功能的前提下升级它。',
      whatIsIt:
        '一套面向存量项目的扫描、诊断、修复流程。它审查字体、颜色、布局、状态、内容、图标和代码质量，再在现有技术栈内做针对性升级。',
      whyForDesign: [
        '紫蓝色的 AI 渐变和三栏等宽卡片会被替换成经过推敲的方案。',
        '卡片组里的按钮会对齐到同一条底线，不受内容长短影响。',
        '缺失的 hover、focus、加载、空状态和错误状态会被补全。',
      ],
      howWithCodex: [
        '它先扫描代码库，确认用的是什么框架和样式方案。',
        '在改动任何东西之前，先列出所有平庸套路和薄弱点。',
        '修复按优先级落地：字体、颜色、状态、布局、组件，最后打磨排版细节。',
      ],
    },
    'brandkit': {
      tagline: '把品牌规范板、Logo 系统和形象展示图，都生成为图片。',
      whatIsIt:
        '一个专门生成品牌工具包展示板的 Skill。它把 Logo 系统、颜色和字体面板、样机及氛围图，排布在一张基于网格的展示板上。',
      whyForDesign: [
        '默认的 3x3 面板系统会覆盖 Logo、构成规则、颜色、字体和应用场景。',
        'Logo 概念遵循一种明确说明的手法，比如字母组合、隐喻融合，或负空间。',
        '展示板有节奏感：安静、功能性、情绪化、技术性的面板交替出现，而不是全程一个调门。',
      ],
      howWithCodex: [
        '给出品牌和品类，Skill 会先选定一种视觉模式。',
        '默认生成一张 3x3 展示板，或者一份 2x3 的参考式迷你合集。',
        '文字保持精简：品牌名、一句标语、一条指令、几个标签。',
      ],
    },
    'cinematic-scroll-storytelling': {
      tagline: '用 Lenis 加 GSAP ScrollTrigger，做滚动驱动的落地页。',
      whatIsIt:
        '一套可用代码：预加载、遮罩式拆词浮现、区块入场、随滚动擦除的固定场景、吸顶卡片堆叠和视差，基于 Lenis 和 GSAP ScrollTrigger。',
      whyForDesign: [
        '动效 token 固定时长、错峰、偏移和模糊，让浮现效果始终一致。',
        '每个效果都有减弱动效分支，保住布局和对比度。',
        '构建顺序先立静态页再加动效，避免滚动场景搅成一团。',
      ],
      howWithCodex: [
        '装好 gsap 和 lenis，再把 Lenis 接进 GSAP 的 ticker。',
        '给区块加上对应浮现、堆叠和视差的 data 属性。',
        '最后再加随滚动擦除的固定场景，然后跑一遍 QA 清单。',
      ],
    },
    'webgl-3d-object': {
      tagline: '打好光的 Three.js 首屏网格，带 PBR 材质和真实阴影。',
      whatIsIt:
        '一个 Three.js 配方，做一个多面首屏物件：二十面体几何、MeshStandardMaterial、透视相机、主光加轮廓光、阴影平面、缓慢浮动旋转。',
      whyForDesign: [
        '真实的几何和打光造出边缘、高光和阴影，CSS 变换假装不来。',
        '材质预设覆盖高级金属、柔和陶瓷和带辉光的科技感。',
        '动效只限于缓慢旋转和小幅上下浮动，文案始终是主角。',
      ],
      howWithCodex: [
        '加一个方形 canvas 外壳，再在上面跑 Three.js 初始化。',
        '调 color、metalness、roughness 和 emissive，贴合品牌调性。',
        '确认好 resize 处理，以及几何、材质和渲染器的销毁。',
      ],
    },
    'css-border-gradient': {
      tagline: '给卡片、弹窗和首屏表面，加一道讲究的渐变边。',
      whatIsIt:
        '一个 CSS 配方，用 padding-box 和 border-box 叠层做细腻的渐变描边，另有一个遮罩伪元素变体，专对付背景复杂的表面。',
      whyForDesign: [
        '给出高级的边缘轮廓，又没有霓虹描边那种刺眼光晕。',
        '遮罩变体保住原有背景，而不是把它盖掉。',
        '默认把渐变节点压在 0.4 透明度以下，描边是衬托而不是抢戏。',
      ],
      howWithCodex: [
        '把 Codex 指向一个需要更好边缘的卡片或价格面板。',
        '纯色填充选简单版，背景复杂选遮罩版。',
        '浅色和深色主题分开检查，透明度很少能直接通用。',
      ],
    },
    'high-end-visual-design': {
      tagline: '拦掉 AI 的平庸默认套路，强制上工作室级的布局和动效。',
      whatIsIt:
        '一条指令式 Skill，先禁掉常见的 AI 设计默认套路，再逼 Agent 在写界面代码前先选定一种调性原型和一种布局原型。',
      whyForDesign: [
        'Inter、Roboto 和粗描边 Lucide 图标一律禁用，产出不再一股模板味。',
        '卡片做成外壳套内核的嵌套结构，容器有了真正的机械纵深。',
        '区块内边距从 py-24 起步，版面能透气，不会挤成一团。',
      ],
      howWithCodex: [
        '让 Codex 做页面，它会先悄悄跑一遍多样性引擎。',
        '先搭好背景纹理和字号阶梯，再做双层描边容器。',
        '注入自定义 cubic-bezier 动效，最后跑一遍出稿前检查清单。',
      ],
    },
    'pick-ui-library': {
      tagline: '给一个前端任务，只推荐一个精挑细选、态度鲜明的库。',
      whatIsIt:
        '一个需要显式调用的查询 Skill，从一张精选清单里为你说明的任务匹配唯一推荐库，覆盖基础组件、动效、图表、虚拟列表、状态和样式。',
      whyForDesign: [
        '每个任务只给一个推荐，不用对着一堆选项纠结。',
        '先看 package.json，能复用项目里已有的库就复用。',
        '揪出手搓的下拉和提示条，换成无障碍的基础组件。',
      ],
      howWithCodex: [
        '得显式调用，它不会自己触发。',
        '说任务而不是库名，比如「我要做提示条」。',
        '它点名一个库，讲清用法，再帮你接进去。',
      ],
    },
    'apple-design': {
      tagline: '把 Apple 的流体界面理念，落成 Web 上的弹性动效和手势。',
      whatIsIt:
        '从 Apple WWDC 设计演讲（主要是 Designing Fluid Interfaces）提炼的知识，对应到 CSS、Pointer Events 和弹性动画库，覆盖响应、可打断、惯性、材质、字体和无障碍。',
      whyForDesign: [
        '反馈在 pointer-down 就触发，按下去的元素不再毫无回应。',
        '动画从屏幕当前实时值起步，打断时不会突然跳一下。',
        '快速滑动会预测落点，甩出去的方向就是它停下的地方。',
      ],
      howWithCodex: [
        '让 Codex 做底部面板、抽屉或拖拽交互。',
        '它用 pointer capture 做 1:1 跟手，并记录速度历史。',
        '松手时把速度交给弹性动画，用内置的阻尼参数收尾。',
      ],
    },
    'animation-vocabulary': {
      tagline: '把含糊的动效描述，翻成精确的技术术语。',
      whatIsIt:
        '一个反查词典。你大致描述一个动效，Skill 原样给出准确术语，几个都可能沾边时还会列出近义项。',
      whyForDesign: [
        '让设计师拿到对的词，好去给 Agent 写提示。',
        '区分容易混的成对概念，比如 clip-path 和 mask、pop in 和 bounce。',
        '拒绝生造术语，命名始终靠得住。',
      ],
      howWithCodex: [
        '描述你看到的效果，比如「iOS 那种橡皮筋回弹滚动」。',
        '它给出加粗的术语，外加一句词典式释义。',
        '两个术语都说得通时，让它列出备选。',
      ],
    },
    'emil-design-eng': {
      tagline: 'Emil Kowalski 关于动画时长、缓动和组件打磨的一套规则。',
      whatIsIt:
        '把一套设计工程理念编码成规则：动画决策框架、弹性动效指南、组件原则、clip-path 技法、手势处理、性能规则和一份评审清单。',
      whyForDesign: [
        '高频操作干脆不加动画，命令面板始终即时响应。',
        '入场从 scale(0.95) 起，绝不从 scale(0) 冒出来，元素不会凭空出现。',
        '弹出层从触发点而不是自身中心放大，保住空间关联。',
      ],
      howWithCodex: [
        '让 Codex 审界面代码，它会给出「改前、改后、为什么」的表格。',
        '做新动效时，它先答该不该动、为什么、用哪种缓动、多快。',
        '它照清单检查，揪出 transition: all 和超过 300ms 的时长。',
      ],
    },
    'ui-ux-pro-max-design': {
      tagline: '一个入口，统一分派 Logo、品牌形象、幻灯片、Banner 和图标活。',
      whatIsIt:
        '一个统一的设计 Skill，把任务分派给子 Skill 或内置模块。内置模块通过 Gemini 脚本覆盖 Logo 生成、企业形象样机、HTML 幻灯片、Banner、社交配图和 SVG 图标。',
      whyForDesign: [
        'Logo、形象样机和整套演示都出自同一份品牌输入。',
        '图标生成为 SVG 文本，始终可编辑，不是位图。',
        'Banner 规则强制安全区、最多两种字体、只留一个 CTA。',
      ],
      howWithCodex: [
        '先导出 GEMINI_API_KEY，装好 google-genai 和 pillow。',
        '先跑 scripts/logo/search.py 出设计简报，再跑 generate.py 出图。',
        '把 Logo 喂给 scripts/cip/generate.py，产出可交付的样机。',
      ],
    },
    'ui-ux-pro-max-banner-design': {
      tagline: '用 HTML 做好尺寸精准的 Banner，再导出成 PNG。',
      whatIsIt:
        '一套五步 Banner 流程：收集需求、调研艺术方向、用 HTML 和 CSS 加生成图搭出 Banner、按平台精确像素截图，再给出多个方案供迭代。',
      whyForDesign: [
        '每张 Banner 都按平台精确像素导出，不会被裁切或缩放。',
        '生成图不带文字，标题始终用清晰的 HTML 渲染。',
        '每次给三个艺术方向，先比选再定稿。',
      ],
      howWithCodex: [
        '回答用途、平台、内容、品牌、风格和数量这几个问题。',
        '它为每个艺术方向做一张套好安全区的 HTML Banner。',
        '按设定宽高逐张截图，超出体积上限的会压缩。',
      ],
    },
    'ui-ux-pro-max-ui-styling': {
      tagline: '用 shadcn 组件和 Tailwind 工具类，做出无障碍的界面。',
      whatIsIt:
        '把基于 Radix 的 shadcn 组件层、Tailwind 工具类样式层和 canvas 视觉设计层组合在一起，附带主题、无障碍、响应式规则和定制的参考文件。',
      whyForDesign: [
        '弹窗和菜单直接继承 Radix 的焦点管理，无障碍不用事后补。',
        '主题颜色放在 CSS 变量里，暗色模式始终一致。',
        '移动优先的断点让布局从小屏起步，再逐层加宽。',
      ],
      howWithCodex: [
        '跑 npx shadcn@latest init 配置好框架和主题。',
        '用 npx shadcn@latest add button card dialog form 添加组件。',
        '跑 scripts/tailwind_config_gen.py 生成带自定义 token 的配置。',
      ],
    },
    'ui-ux-pro-max-brand': {
      tagline: '让品牌规范、设计 token 和素材始终对得上。',
      whatIsIt:
        '一个品牌形象 Skill，围绕一组脚本：把品牌上下文注入提示、校验素材、提取颜色，并把 brand-guidelines.md 同步成设计 token 的 JSON 和 CSS 变量。',
      whyForDesign: [
        '一份 markdown 文件就是 token 和 CSS 的唯一事实源。',
        '提取出的颜色会跟配色表比对，及早发现偏移。',
        '素材在通过前会检查命名、尺寸和格式。',
      ],
      howWithCodex: [
        '改 docs/brand-guidelines.md，再跑 scripts/sync-brand-to-tokens.cjs。',
        '用 scripts/inject-brand-context.cjs --json 校验。',
        '任何新文件交付前先用 scripts/validate-asset.cjs 检查。',
      ],
    },
    'ui-ux-pro-max-slides': {
      tagline: '用 Chart.js 和版式模式，搭出 HTML 演示文稿。',
      whatIsIt:
        '一个面向策略型 HTML 演示的小分派 Skill。它解析子命令，再加载覆盖版式模式、HTML 模板、文案公式和幻灯片策略的参考文件。',
      whyForDesign: [
        '幻灯片是 HTML，字体和间距都走真实的设计 token。',
        '数据页交给 Chart.js，数字是活的，不是贴上去的图。',
        '版式从一组模式里挑，整套演示视觉统一。',
      ],
      howWithCodex: [
        '用 create 子命令加上主题和页数来调用。',
        '它加载 references/create.md，照着那套创建流程走。',
        '它从参考文件里取版式模式和文案公式。',
      ],
    },
    'design-system-tokens': {
      tagline: '三层设计 token、组件规格，还有守 token 的幻灯片生成。',
      whatIsIt:
        '一个设计系统 Skill，以 CSS 变量覆盖原子、语义、组件三层 token，外加组件状态规格，以及一个用同一套 token 生成演示的工具。',
      whyForDesign: [
        '有了语义 token 层，明暗主题切换只是改配置，不用重写。',
        '组件规格把 default、hover、active、disabled 状态列成表，交接不留模糊。',
        '校验器揪出写死的色值，让组件和幻灯片都守在 token 系统里。',
      ],
      howWithCodex: [
        '拿 JSON token 配置跑 generate-tokens.cjs，产出你的 CSS 变量文件。',
        '让 Codex 出组件规格，再对 src/ 跑 validate-tokens.cjs 揪裸值。',
        '用 search-slides.py 加上位置和场景参数，为演示挑版式。',
      ],
    },
    'editorial-ui-style': {
      tagline: '严格 8pt 网格上的杂志排版，用 Gelasio 衬线。',
      whatIsIt:
        '一个现代编辑风的设计规范 Skill：正文和标题都用 Gelasio 衬线，搭 Ubuntu Mono，白底配近黑 #111111，8pt 基线网格。',
      whyForDesign: [
        '标题和正文出自同一衬线字族，长篇阅读的排版始终统一。',
        '8pt 基线网格贯穿标题、正文和间距，稳住垂直节奏。',
        '无障碍底线包含减弱动效支持、44px 触控区和高对比处理。',
      ],
      howWithCodex: [
        '让 Codex 先复述设计意图，定好 token 再碰组件。',
        '要它给出覆盖结构、变体、状态和响应式行为的组件规则。',
        '最后走一遍 QA 清单，方便代码评审核对产出。',
      ],
    },
    'terracotta-ui-style': {
      tagline: '奶油底配陶土强调色，DM Serif Display 标题，专为长文阅读。',
      whatIsIt:
        '一个日晒编辑风界面的规范 Skill：奶油色 #F3E9D8 表面、一种陶土色 #C56A3C 强调、DM Serif Display 标题、JetBrains Mono，专为博客和叙事调校。',
      whyForDesign: [
        '只用一种强调色，强调因此稀有，层级靠标题撑起。',
        '温暖的奶油底比纯白页更少眩光，适合长文。',
        '衬线标题压着墨棕正文，定下清晰的编辑节奏。',
      ],
      howWithCodex: [
        '让 Codex 先认准陶土和奶油这套 token，再写任何组件。',
        '逐组件要结构、变体和状态，间距 token 都点名写清。',
        '改造已有的不一致界面时，让它给出反面案例和迁移说明。',
      ],
    },
    'dithered-ui-style': {
      tagline: '用点阵明暗和有限配色，做复古高对比的界面。',
      whatIsIt:
        '一个抖动界面的规范 Skill，用点阵在有限配色里模拟明暗。正文 Open Sans、标题 Space Grotesk、IBM Plex Mono，蓝紫强调色。',
      whyForDesign: [
        '点阵取代渐变，明暗在刻意收窄的配色里也立得住。',
        '高对比渲染让文字在满是点阵纹理的表面上依旧清晰。',
        '规则禁止装饰性动效，别让复古处理变成视觉噪点。',
      ],
      howWithCodex: [
        '先告诉 Codex 配色上限，再让它推导出基于点阵的明暗规则。',
        '要它做空、加载和错误状态，让点阵表面依旧可读。',
        '核对点击区和焦点状态，这个 Skill 专门点了名。',
      ],
    },
    'neumorphism-ui-style': {
      tagline: '石灰底上柔和挤出的表面，配 Space Mono 字体。',
      whatIsIt:
        '一个新拟态界面的规范 Skill：在单色石灰 #E7E5E4 表面上做内外阴影，青色 #006666 强调，标题正文都用 Space Mono，紧凑密度间距。',
      whyForDesign: [
        '单色表面意味着纵深来自阴影，而不是颜色对比。',
        '紧凑间距适合控件密集的面板，比如仪表盘和设置页。',
        '规则禁止混用视觉隐喻，柔和挤出是唯一的纵深语言。',
      ],
      howWithCodex: [
        '让 Codex 先定好表面和阴影 token，再去做单个控件的样式。',
        '要它做出可见的焦点状态，光靠柔和阴影会坑了键盘用户。',
        '按这个 Skill 的要求，先上语义化 HTML，再谈 ARIA。',
      ],
    },
    'bento-ui-style': {
      tagline: '奶油底上大小不一的网格块，Inter 字体，紧凑字号。',
      whatIsIt:
        '一个便当盒布局的规范 Skill，把内容摆成大小不一的网格块。全程 Inter，12 到 32 的紧凑字号阶梯，奶油底配桃色和蓝色强调。',
      whyForDesign: [
        '块的大小差异承载层级，网格本身就在排优先级。',
        '12 到 32 的紧凑字号阶梯，让密集文字塞进小方块。',
        '奶油色 #FFF5E6 表面让块的边界不靠重描边也清晰。',
      ],
      howWithCodex: [
        '让 Codex 按内容优先级给每个块定尺寸。',
        '排块之前先在 4 到 32 的阶梯上定好间距 token。',
        '让它处理溢出和长标签，这个 Skill 把它们列成了边界情况。',
      ],
    },
    'claymorphism-ui-style': {
      tagline: '圆润饱满的 3D 形状，Poppins 标题，白底配蓝。',
      whatIsIt:
        '一个黏土拟态界面的规范 Skill：柔软、圆润、饱满的形状，像可捏的黏土。标题 Poppins、正文 Montserrat，蓝色 #3B82F6 强调，白底配深蓝文字。',
      whyForDesign: [
        '饱满的圆形让按钮一看就知道能按，不用多加文字。',
        '白底上的深蓝文字 #1C398E 撑住对比度，配色又不失活泼。',
        '规则禁止混用隐喻，黏土纵深不会跟玻璃或扁平掺在一起。',
      ],
      howWithCodex: [
        '先让 Codex 定圆角和阴影 token，黏土质感全靠它们。',
        '按规定把 Poppins 标题配 Montserrat 正文，别用两款相似的无衬线。',
        '确认 focus-visible 和 disabled 状态在柔和造型下依旧成立。',
      ],
    },
    'brutalism-ui-style': {
      tagline: '清水混凝土感的布局，Darker Grotesque 标题，红与赭。',
      whatIsIt:
        '一个野兽派界面的规范 Skill，取自 1950 年代清水混凝土建筑：不加修饰、讲功能、刻意扎眼。标题用 Darker Grotesque，白底配 #DD614C 红和 #DAA144 赭。',
      whyForDesign: [
        '粗粝无修饰的元素砍掉装饰，分量全交给结构和文案。',
        '红和赭两种强调色，彻底取代渐变和阴影。',
        '无障碍底线照样管用，再扎眼的版面也守住对比度和可见焦点。',
      ],
      howWithCodex: [
        '让 Codex 选组件前先定调：粗粝、不加修饰。',
        '按质量闸门的要求，每条规则都锚到一个 token 或阈值。',
        '评审产出时，每条「该怎么做」都配一个具体的「别这么做」。',
      ],
    },
    'hallmark-design-skill': {
      tagline: '反平庸的设计流程，58 道闸门，强制结构多样。',
      whatIsIt:
        '一个给 AI 编程助手用的设计 Skill，一条默认构建流程加三个动作：审查、改版、研究。它逼出结构多样性，两次构建不会共用同一套页面节奏。',
      whyForDesign: [
        '多样化规则逼着连续几次构建换不同的大结构、导航和页脚。',
        '锁定的 token 禁止绕过 token 区去写内联色值或 font-family。',
        '每次产出都在 320、375、414、768 像素宽度下校验。',
      ],
      howWithCodex: [
        '先让起飞前扫描读一遍现有的字体、配色和动效库。',
        '回答受众、场景和调性这道闸门，或者直接说「继续」。',
        '对页面跑 hallmark audit，拿到一份排好序的问题清单，不改动代码。',
      ],
    },
    'impeccable': {
      tagline: '二十来条命令，用来构建、评审和打磨前端界面。',
      whatIsIt:
        '一个前端设计 Skill，命令分成构建、评估、精修、增强、修复、迭代几组。它读项目上下文和一份语域参考，再写出生产级代码。',
      whyForDesign: [
        '语域一分，营销页和产品界面走各自的设计规则。',
        '硬性禁令拒掉渐变文字、侧边条描边，以及每个区块头顶的小标签。',
        '对比度下限写得明白：正文 4.5:1，大字 3:1。',
      ],
      howWithCodex: [
        '每次会话先跑一次 context.mjs，让 Skill 加载 PRODUCT.md 和 DESIGN.md。',
        '带上目标文件调用命令，比如 critique、polish 或 animate。',
        '开着 dev server 用实时模式，直接在浏览器里生成变体。',
      ],
    },
    'design-dna': {
      tagline: '把参考设计抽成结构化 JSON，再据此生成新页面。',
      whatIsIt:
        '一套三阶段流程，从可量化 token、定性风格和视觉效果三方面抓住设计身份。它输出一份完整的 Design DNA JSON，再把这份 JSON 套到新内容上。',
      whyForDesign: [
        '把一张截图或一个网址，变成带命名的颜色、字体和间距数值。',
        '不止记录可量化 token，还记下氛围、构图和品牌语气。',
        '捕捉纯 CSS 表达不了的 Canvas、WebGL、着色器和滚动效果。',
      ],
      howWithCodex: [
        '分析之前先要一份 schema，把三个维度看全。',
        '把参考图或网址交给 Codex，让它填出一份 DNA JSON。',
        '把这份 JSON 连同你的内容传进去，生成一个自包含的 HTML 页面。',
      ],
    },
    'material-3': {
      tagline: '在 Compose、Flutter 和 Web 上落地 Google 的 Material Design 3。',
      whatIsIt:
        '一份 Material Design 3 指南，覆盖 md.sys token 命名空间、30 多个组件、自适应布局、主题和 M3 Expressive。主攻 Jetpack Compose，Flutter 和 @material/web 为辅。',
      whyForDesign: [
        '颜色、字体、形状和高度 token，取代写死的色值和圆角。',
        '用色调表面而非阴影承载纵深，贴合当前 MD3 规范。',
        '一份打分审查评十个维度，按优先级列出待修项。',
      ],
      howWithCodex: [
        '点明平台，Codex 好在 Compose、Flutter 或 CSS 自定义属性里选。',
        '要一个组件，拿到正确的变体和接好的 token。',
        '对一个网址或源文件跑审查，出一份合规报告。',
      ],
    },
    'make-interfaces-feel-better': {
      tagline: '十六条具体的界面打磨规则，外加一份评审清单。',
      whatIsIt:
        '一组界面打磨的设计工程原则：同心圆角、视觉对齐、分层阴影、错峰入场动画、等宽数字、点击区，以及 transition 精确化。',
      whyForDesign: [
        '给出确切数值，按下缩放永远是 0.96，不靠拍脑袋。',
        '修掉嵌套圆角对不上的问题，多数组件的别扭感就来自这儿。',
        '在数字变化引起的布局抖动传到用户前就拦下。',
      ],
      howWithCodex: [
        '把 Codex 指向一个组件，让它套用这些原则。',
        '要一次评审，结果以「改前、改后」的表格返回。',
        '合并任何前端改动前，先跑那份十四项清单。',
      ],
    },
    'visual-plan': {
      tagline: '把文字方案变成可评审的文档，带线框图和原型。',
      whatIsIt:
        '一个给编程 Agent 用的结构化规划模式。方案变成一目了然的文档，内嵌图示、代码、数据模型、待定问题，还可选顶部画布或实时原型。',
      whyForDesign: [
        '界面方案开头就是线框画板，每个用户可见状态一张。',
        '评审者针对锚定的元素评论，而不是在聊天里扯皮。',
        '多步流程在静态样机旁边配一个能操作的原型。',
      ],
      howWithCodex: [
        '用 Agent-Native CLI 安装，再跑 /visual-plan 命令。',
        '粘贴一份现成的 Codex 或 Markdown 方案当素材。',
        '读反馈、改方案，再核对已保存的结果。',
      ],
    },
    'kami': {
      tagline: '用一套设计语言，排版简历、白皮书、演示和落地页。',
      whatIsIt:
        '一套面向专业文档和产品落地页的模板系统。暖羊皮纸底、墨蓝强调、衬线主导的层级，含九类文档模板和十五种图示基元。',
      whyForDesign: [
        '一种强调色加一款衬线字族，让每份交付物视觉统一。',
        '一份密度约定会标出内容不到半满的正文页。',
        '图示基元覆盖架构图、流程图、四象限、时间线和图表。',
      ],
      howWithCodex: [
        '说清你要什么，决策树替你挑中对应模板。',
        '先让 Codex 把原始内容提炼成一份校验过的 content.json。',
        '跑构建脚本，产出 HTML、PDF 和校验报告。',
      ],
    },
    'masked-reveal': {
      tagline: '滚动时用溢出遮罩，让标题逐词浮现。',
      whatIsIt:
        '一个 GSAP ScrollTrigger 方案：把标题拆成带遮罩的词块，文字进入视口时逐词错峰上移。附带一套 React 清理写法。',
      whyForDesign: [
        '逐词错峰比逐字母动画更沉稳，更有编辑气质。',
        '屏幕阅读器仍能通过 aria-label 读到完整文字。',
        '开了减弱动效的用户看到的是静态文字，不加任何变换。',
      ],
      howWithCodex: [
        '给标题加上 data-masked-reveal，再补上 CSS 遮罩规则。',
        '调用自带的拆分助手，绕开收费的 SplitText 插件。',
        '在 React 里用 GSAP context 包起来，路由切换时 ScrollTrigger 会自动清理。',
      ],
    },
    'framed-grid-layout': {
      tagline: '用细边框和角标记，搭出精准的编辑式版面。',
      whatIsIt:
        '一套十二栏网格方案，每个区块都吸附到共享栏，装进 1px 边框的盒子里。L 形角标记作为背景层，画在低透明度的斜向纹理之上。',
      whyForDesign: [
        '每个区块共用一种边框色、一种角标记尺寸、一套间距刻度。',
        '角标记不需要额外标签，结构留在 CSS 里。',
        '就算去掉纹理层，版面依旧清晰易读。',
      ],
      howWithCodex: [
        '要一个技术风或编辑风页面，先拿到父级网格。',
        '用明确的跨栏类，而不是临时定的区块宽度。',
        '在两个断点下都核对边框边缘的横竖对齐。',
      ],
    },
    'container-lines': {
      tagline: '在内容容器两侧，画出安静的竖向参考线。',
      whatIsIt:
        '一个 CSS 方案，在内容容器两侧各加一条 1px 竖线，可选带迷你角方块。参考线位于内容之下，不响应指针事件。',
      whyForDesign: [
        '把容器宽度显出来，松散的首屏区块因此有了结构张力。',
        '参考线共用容器的 max-width 和内边距，永远不会跑偏。',
        '关掉了指针事件，竖线不会挡住点击或选中。',
      ],
      howWithCodex: [
        '给布局外壳加上 container-lines 类。',
        '角方块只放在真正的容器或区块拐角上。',
        '确认竖线在浅色和深色背景上都足够克制。',
      ],
    },
    'skeuomorphic-ui': {
      tagline: '用分层渐变和阴影，给按钮和面板做出可触摸的纵深。',
      whatIsIt:
        '一套触感 Web 界面的表面配方：竖向渐变填充、1px 反光渐变描边、叠加的外阴影和内阴影。浮雕文字、图标和微纹理可选。',
      whyForDesign: [
        '凸起和按下状态把纵深反转，控件读起来是实体的。',
        '纵深保持方向感，光从上打，影落在下。',
        '提醒别在一个组件里混用玻璃拟态、新拟态和拟物。',
      ],
      howWithCodex: [
        '基础 token 定一次，再按品牌和主题逐一微调。',
        '把凸起表面用在卡片、按钮、标签页和控件外壳上。',
        '按下变体只留给激活的开关和选中的标签页。',
      ],
    },
    'beautiful-shadows': {
      tagline: '三个现成的 Tailwind 阴影工具类，做中性的分层高度。',
      whatIsIt:
        '一组精确的 Tailwind 任意值阴影类，分三档强度。每档叠加几层低透明度的中性阴影，取代 Tailwind 默认的阴影阶梯。',
      whyForDesign: [
        '高度保持中性，不会有带色光晕染到下面的表面。',
        '三档固定强度分别对应控件、卡片和首屏媒体。',
        '叠层的低透明度阴影读起来是真纵深，而不是一坨生硬的投影。',
      ],
      howWithCodex: [
        '让 Codex 把 md 那档用在卡片、面板和弹出层上。',
        'lg 那档留给首屏媒体和弹窗类容器。',
        '每个阴影都配上干净的表面填充和统一的圆角。',
      ],
    },
    'dither-background': {
      tagline: '带明显 4x4 Bayer 抖动和方形像素的 canvas 背景。',
      whatIsIt:
        '一个 canvas 配方，用值噪声、FBM 和 4x4 Bayer 阈值渲染出一片近黑的程序化场，以放大的方形格子绘制。',
      whyForDesign: [
        '放大的格子让抖动矩阵看得清，而不是糊成胶片颗粒。',
        '六阶单色配色让前景文字不靠重色遮罩也可读。',
        '暗角加偏心的明暗块，给出一个亮焦点，而非均匀亮度。',
      ],
      howWithCodex: [
        '把固定定位的 canvas 垫在内容后面，pointer-events 设为 none。',
        '把 cellSize 调在 5px 到 10px 之间，保证矩阵清晰。',
        '调 wave、cloud、ridge 和 vignette 的值，塑造明暗块的形状。',
      ],
    },
    'webgl-laser': {
      tagline: '全屏着色器光束，核心炽白，雾气染上品牌色。',
      whatIsIt:
        '一个原生 WebGL 片元着色器，在全屏四边形上画一道细窄竖向激光。核心近白，光晕和 FBM 烟雾跟着你的强调色走。',
      whyForDesign: [
        '光晕和烟雾取自你的品牌强调色，而不是写死的蓝。',
        '核心和辉光宽度分开控制，光束是刀锋而不是条块。',
        '烟雾聚在光束附近、向外消散，保住文案的对比度。',
      ],
      howWithCodex: [
        '设一个 --brand-accent 自定义属性，着色器会把它转成 RGB。',
        '把固定定位的 canvas 放到内容后面，pointer-events 设为 none。',
        '调 coreWidth、glowWidth、smokeDensity 和 xOffset 来给光束定位。',
      ],
    },
    'mesh-gradient-dark-blue-clean': {
      tagline: '近黑藏青系统，首屏外壳里嵌一片网格渐变场。',
      whatIsIt:
        '一套深蓝方向：CSS 颜色 token、渐变描边的首屏外壳、canvas 网格场、玻璃导航胶囊、漂浮节点、导轨和成对的 CTA。',
      whyForDesign: [
        '网格场装在首屏外壳里，主导构图而不是当装饰。',
        '命名 token 固定全页的背景、外壳、线条、文案和强调色数值。',
        '导轨、角方块和节点胶囊给极简外壳加上技术感结构。',
      ],
      howWithCodex: [
        '先粘贴 token 区块，再搭页面地基和首屏外壳。',
        '把网格 canvas 加进外壳里，垫在外壳内容后面。',
        '摆几个节点、导轨和标记，漂移循环保持慢速。',
      ],
    },
    'agency-grid-layout-minimal': {
      tagline: '编辑式多栏网格，超大标题配极小的大写标签。',
      whatIsIt:
        '一套面向工作室网站的布局方向：宽网格外壳、超大展示标题、相邻栏里的小号大写元信息，以及建筑感的图像块。',
      whyForDesign: [
        '严格的栏位摆放，让每个元素的位置都显得是有意为之。',
        '展示标题和极小元信息之间的尺寸反差承载着层级。',
        '留白被保留而非填满，页面保持编辑气质。',
      ],
      howWithCodex: [
        '先定一个宽 max-width 的外壳，栏位分隔可见。',
        '让首屏标题横跨大部分栏，辅助文案放侧栏。',
        '把服务条目做成多栏列表，配极小的元信息标签。',
      ],
    },
    'glass-dark-mode-clock': {
      tagline: '深色磨砂表面，围着一个圆形校准表盘展开。',
      whatIsIt:
        '一套以时钟式表盘为中心的深色玻璃方向：近黑底加光束网格、磨砂导航胶囊，以及分层的圆环和刻度中心件。',
      whyForDesign: [
        '一个占主导的表盘锚住整个布局，而不只是个装饰摆件。',
        '光束线和准星对齐表盘，强化校准的逻辑感。',
        '单色配色意味着亮度来自玻璃高光，而非高饱和强调色。',
      ],
      howWithCodex: [
        '先铺一个近黑底，加上淡淡的网格和光束参考线。',
        '把导航、胶囊和按钮做成深色玻璃胶囊，外包 1px 高光边。',
        '分层搭表盘：外圈、刻度、旋转标签、中心徽标。',
      ],
    },
    'gsap-skills': {
      tagline: '官方 GSAP 动画套件，从核心补间到 ScrollTrigger 和 React。',
      whatIsIt:
        'GreenSock 官方出品、用 GSAP 做 Web 动画的 Skill 套件。八个模块覆盖核心 API、时间线、ScrollTrigger、插件、React、其他框架、性能和工具函数。',
      whyForDesign: [
        '动效照 GSAP 真实 API 来，而不是 Agent 瞎猜语法。',
        'ScrollTrigger 和时间线被正确编排，而不是临时堆在一起。',
        '性能规则让动画流畅，滚动时不卡顿。',
      ],
      howWithCodex: [
        '装好 GSAP Skill 套件，Codex 就能加载对应模块。',
        '说清你要的动效，对应模块会处理好 API。',
        '在组件树里就取 React 或框架模块来用。',
      ],
    },
    'animation-review': {
      tagline: '按资深工艺标准，找出、改进并评审动效。',
      whatIsIt:
        'Emil Kowalski 的三个动效 Skill 串成一个循环：找出该加动效的地方、改进现有动效，再按高工艺标准评审动画代码。',
      whyForDesign: [
        '把该动却没动的界面揪出来，也否掉不该动的动效。',
        '把含糊的「做得更舒服点」变成排好优先级的动效审查。',
        '用一条明确的工艺标准约束动画，而非个人口味。',
      ],
      howWithCodex: [
        '先跑 find，定位界面里可以加动效的地方。',
        '再用 improve，重做现有的动画代码。',
        '发布前跑 review，拦下工艺不到位的动效。',
      ],
    },
  },
};
