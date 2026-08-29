/*
 * 简体中文文案：DeepSeek Harness 设计插件精选合集。
 * 译自英文基线。
 */
import type { DeepseekCopyOverride } from './index';

export const zh: DeepseekCopyOverride = {
  collectionEyebrow: '精选合集',
  collectionHeading: 'DeepSeek Harness 设计插件',
  collectionLede:
    '一个精选的 dsh 设计插件合集：能读截图的视觉桥、Agent 可以落笔的画布和生成式 UI、设计评审工具，以及把这一切预览出来的工作台。DeepSeek Harness 读取跟 Claude Code 和 Codex 相同的 SKILL.md 格式，你的设计 Skill 库可以直接带过来。',
  collectionStats: [
    { value: '19', label: '个精选 dsh 插件' },
    { value: '19', label: '个来源仓库' },
    { value: 'SKILL.md', label: '与 Claude Code、Codex 通用' },
  ],
  collectionIntro:
    '下面每个 dsh 插件都真实存在、原生支持 DeepSeek Harness，可以通过 GitHub 上的 dsh-plugin topic 找到，并附上源地址。它们各司其职，分成四类：给纯文本的 harness 装上视觉、给它可以落笔的设计画面、把设计评审接进工作闭环、把它的 web UI 变成设计工作空间。',
  collectionCategoryBlurbs: [
    '把截图、样机和图表变成纯文本模型能直接行动的结构化证据。',
    '给 Agent 可以落笔的画面：可编辑的矢量画布、活的 UI 卡片、幻灯片。',
    '把闭环补上：在真实页面上做标注、编译动效资产、把你的 Skill 库带过来。',
    '把 harness 本身变成设计工作空间：对话旁边的预览面板、工作台和看板。',
  ],
  collectionCloserHeading: '省掉配置，在 OpenDesign 里用 DeepSeek Harness 做设计',
  filterAll: '全部',
  collectionCloserBody:
    'OpenDesign 是围绕 DeepSeek Harness 运转的开源、Agent 原生设计工作空间。它让你的设计系统、Skill 和模板始终保持一致，Agent 交付的成果真正属于你。',

  categoryVision: '视觉与输入',
  categoryCanvas: '画布与生成式 UI',
  categoryWorkflow: '设计工作流',
  categoryWorkspace: '工作空间与预览',

  ctaDownload: '下载 OpenDesign',
  ctaStarList: '给 DeepSeek Harness 点 Star',
  ctaGuide: '了解如何用 DeepSeek Harness 做设计',
  ctaBrowseAll: '浏览全部插件',
  ctaViewSource: '查看源地址',
  ctaOurRepo: 'GitHub 上的 deepseek-harness',
  cardKind: '插件',
  cardWhatItDoes: '它能做什么',
  cardCta: '查看插件',

  detailWhatIsIt: '这是什么',
  detailWhyForDesign: '它对设计意味着什么',
  detailHowWithAgent: '如何配合 DeepSeek Harness 使用',
  detailExampleTag: '什么时候用它',
  detailSource: '来源',
  detailCategory: '分类',
  detailMaintainer: '作者',
  detailTags: '标签',
  detailLicense: '许可证',
  detailCovers: '包含哪些内容',
  detailUpstream: '来自上游 README',
  detailAgentNote: '可用于 DeepSeek Harness',
  detailTraction: '热度',
  detailRepo: '源仓库',
  detailStars: 'Star',

  installHeading: '如何安装',
  installRunInAgent: '在终端里运行这条命令。',
  installRestart: '重启 dsh web，让它加载这个插件。',
  installClone: '克隆这个仓库。',
  installPoint: '把 DeepSeek Harness 指向这个 Skill 文件。',
  installThenUse: '然后描述你想要的设计，DeepSeek Harness 会自动用上插件提供的工具。',

  installNote: '这里的每个插件都可以免费安装，并附上真实的上游源地址。',
  installNoteCta: '浏览整个合集',
  detailMoreOnList: '在 DeepSeek Harness 仓库里了解更多',
  detailRelated: '更多 DeepSeek Harness 设计插件',
  finalEyebrow: '下一步',
  detailCloserHeading: '用 OpenDesign 做设计，省掉那些配置',
  detailCloserBody:
    '你可以自己装这个插件，也可以用 OpenDesign 在 DeepSeek Harness 外面套一整层精选设计层。自带 API Key，产出归你所有。',

  skills: {
    modlens: {
      tagline: '给纯文本的 DeepSeek 模型装上即插即用的视觉：贴一张截图，拿到结构化证据。',
      whatIsIt:
        '一座给纯文本编程 Agent 用的视觉桥。把图片粘进对话，modlens 会把它转成结构化的 JSON 证据——完整文字转录、按阅读顺序排列的版面区域、实体和关系——而不是让模型靠猜。',
      whyForDesign: [
        'UI 截图变成逐元素的走查记录，Agent 可以直接照着行动。',
        '信息密集的图表和数据可视化会被完整读出来：坐标轴、刻度、配色、高亮区域。',
        '一次粘贴多张参考图，它会先识别出共同的视觉家族，再逐张描述。',
      ],
      howWithAgent: [
        '装上插件，模型选择器里会多出带 modlens 视觉的 DeepSeek-V4 变体。',
        '把截图、样机或图表直接粘进对话。',
        '对着结构化证据提设计问题，不用再费劲复述图里有什么。',
      ],
    },
    'dsh-vision-toolkit': {
      tagline: '十个视觉工具，覆盖 UI 还原、grounding 和像素级 diff 验证。',
      whatIsIt:
        '一个 DeepSeek Harness 原生的视觉工具包，打包十个工具：图片问答、带像素坐标的 grounding 和检测、长截图 OCR、裁剪、取色、HTML 截图和像素 diff。工具通过一个 vision-tools Skill 渐进挂载。',
      whyForDesign: [
        'UI 还原用数字闭环：仓库里自带的工作流把一次重建从 6.04% 的像素差一路迭代到 0%。',
        'grounding 和检测返回原图上的像素框，Agent 按坐标行动，而不是从文字描述里解析位置。',
        '信息图和手绘草图都能变成可编辑的 HTML/CSS 界面。',
      ],
      howWithAgent: [
        '把插件加进你的 web 或 headless profile，为远程工具配好视觉凭证。',
        '激活工具包，vision-tools Skill 会挂载全部十个工具的 schema。',
        '重建一份参考稿，再用 vision_html_screenshot 和 vision_pixel_diff 验证。',
      ],
    },
    'dsh-ui-spec': {
      tagline: '把 UI 截图变成可直接落地的规格：token、间距刻度、布局网格。',
      whatIsIt:
        '一个 analyze_ui_image 工具，把截图或样机转成结构化的前端规格。确定性的几何层量出精确尺寸、配色、建议的设计 token、布局网格和间距刻度；可选的视觉模型再在上面补语义。',
      whyForDesign: [
        '像素坐标、间距刻度和 token 配色都是确定性算出来的，不是视觉模型猜的。',
        '规格字段直接对应实现：建议 token 对应设计 token，间距刻度对应 CSS。',
        '语义角色给出意图，几何层给出位置，合并成一份 JSON 加 Markdown 的规格。',
      ],
      howWithAgent: [
        '装上插件，几何层零配置、离线就能跑。',
        '语义层可以按需指向任何兼容 OpenAI 接口的视觉端点。',
        '把截图交给 Agent，照返回的规格来实现，而不是照着图猜。',
      ],
    },
    'dsh-media-skills': {
      tagline: '免费的眼睛加免费的画笔：粘贴读图，外加无水印的图片生成。',
      whatIsIt:
        '两个 SKILL.md Skill 加一条免费视觉模型线路：vision-review 读截图、抓视觉 bug，media-tools 生成插画、头像、背景和 Banner——全都跑在免费档模型上。',
      whyForDesign: [
        '抓出纯文本 Agent 看不见的 UI 视觉 bug：重叠、溢出、没对齐。',
        '在免费档上无水印地生成设计素材，探索方案不花一分钱。',
        '给纯文本会话加上「添加图片」按钮，粘贴的图片会被描述给当前模型。',
      ],
      howWithAgent: [
        '装上插件，把免费的 API Key 放进 harness 的凭证库。',
        '重启 dsh web，模型选择器里会多出一条免费视觉线路。',
        '用大白话要一次截图评审，或要一张新素材。',
      ],
    },
    'dsh-openpencil': {
      tagline: 'Agent 在真实可编辑的矢量画布上做设计，而不是丢回一张静态图。',
      whatIsIt:
        '把 harness 接到 OpenPencil——一个开源的 AI 原生矢量设计工具。五个工具让 Agent 通过事务式批次创建、编辑、渲染和检查 design-as-code 的 .op 文档，支持多画框预览和一个供人接管的托管编辑器。',
      whyForDesign: [
        '从需求到画布一条闭环：Agent 编辑真实文档，预览渲染出忠于设计的画框。',
        '事务式批次只在成功时发布，绝不覆盖外部编辑——冲突会浮出来，而不是被抹掉。',
        '带选择、图层、属性和撤销的托管编辑器，让人随时可以接手 Agent 的产出。',
      ],
      howWithAgent: [
        '装好 OpenPencil，再把插件加进你的 web profile。',
        '描述设计，Agent 会分批驱动 openpencil_create 和 openpencil_edit。',
        '打开渲染预览或托管编辑器，原地继续迭代。',
      ],
    },
    'dsh-visualize': {
      tagline: '模型把可交互的 HTML 卡片直接画进对话流。',
      whatIsIt:
        '一个 visualize 工具加配套 Skill：模型写出一段 HTML 片段，挂载成对话里的沙箱交互卡片——模拟器、图表、对比面板和 UI 样机，支持流式预览和跟随主题的样式。',
      whyForDesign: [
        'UI 样机就活在对话里，可以点，不只是被描述。',
        '卡片跟随宿主的明暗主题和配色，预览看起来就像原生的。',
        '每张卡片都跑在带严格 CSP 的沙箱 iframe 里——写坏的片段搞不垮会话。',
      ],
      howWithAgent: [
        '装上插件，重启 dsh web。',
        '要一个样机或一份对比，模型会带着自己写的 HTML 调用 visualize。',
        '之后回放会话，卡片会从持久化的工具结果里恢复。',
      ],
    },
    'dsh-genui': {
      tagline: '三十多个交互组件内联渲染在回复里，动作还能回流给模型。',
      whatIsIt:
        '模型在 dsh-ui fence 里用 JSON 描述界面，浏览器端渲染器把它变成回复里的活组件——卡片、表格、图表、表单、标签页、时间线、diff、mermaid、3D 场景——随着回答流式出现。',
      whyForDesign: [
        '回答变成界面：数据面板、图表和表单就渲染在讲解发生的地方。',
        '交互组件把动作发回给模型，模型再反过来更新 UI。',
        '组件白名单加规格校验，写坏的图表永远不会上屏。',
      ],
      howWithAgent: [
        '从 GitHub 添加插件，重启 dsh web。',
        '要一个仪表盘、测验或表单，模型会自己写出 dsh-ui fence。',
        '跟结果互动——本地动作即时响应，模型动作回流处理。',
      ],
    },
    'dsh-openmaic': {
      tagline: '幻灯片、交互挂件和整节可上的课程，全部由 Agent 写的 JSON 渲染。',
      whatIsIt:
        '来自 THU-MAIC 团队的四个工具加一个苏格拉底式教学 Skill：Agent 写出 PPTist 风格的幻灯片 JSON，由官方 OpenMAIC 渲染器渲染，交互挂件以沙箱卡片流式呈现，还能提交一句话请求，拿回一间可以直接上课的课堂。',
      whyForDesign: [
        '带文字、形状、图片、表格、图表、公式和代码的幻灯片——在对话里以 JSON 写就。',
        '交互模拟和小游戏就地渲染成沙箱卡片。',
        '一次请求就能拿到带视觉内容的完整课程，返回的是一个可以直接玩的链接。',
      ],
      howWithAgent: [
        '从 GitHub 添加插件；它发布的就是编译好的产物，不用构建。',
        '重启 dsh web，要一套幻灯片或一个挂件。',
        '要整节课时，openmaic_generate 会轮询 OpenMAIC 服务并返回课堂链接。',
      ],
    },
    'dsh-web-review': {
      tagline: '在真实页面上指着元素做可视化标注，Agent 直接改源码。',
      whatIsIt:
        '给 harness web UI 内置一个浏览器：像在设计工具里一样悬停高亮、点选元素，附上批注，还能现场试调视觉效果——文字、颜色、字体、尺寸、间距、边框、特效。标注会带上选择器和源码线索，Agent 能据此定位并修改代码。',
      whyForDesign: [
        '指着页面标注，取代用文字描述 UI 问题。',
        '实时调整让改动先在页面上预览，代码一行都还没动。',
        '自带八个设计 Skill，从 better-typography 到 interface-review，都能在标注编辑器里直接用。',
      ],
      howWithAgent: [
        '装上插件，启动 dsh web。',
        '在 Web Preview 标签页里打开你正在跑的应用，标出该改的地方。',
        '发送——Agent 收到选择器、批注和试调过的值，直接修改工作区源码。',
      ],
    },
    'dsh-figma-to-lottie': {
      tagline: '在对话里把 SVG 路径和关键帧编译成自包含的 Lottie 动画。',
      whatIsIt:
        '两个把设计数据变成动效资产的工具：lottie_compile_shape 把 SVG 路径转成 Lottie 形状值，lottie_compile 从一份紧凑的图层规格组装出完整的 Lottie JSON——矩形、渐变、路径、内嵌图片和文字，每层都可以做关键帧动画。',
      whyForDesign: [
        '用大白话描述一个加载动画，拿到能跑在 iOS、Android 和 Web 上的 .lottie.json。',
        '贝塞尔的出入切线和关键帧缓动是编译出来的，不用手写。',
        '零构建、纯 ESM：发布出去的就是实际运行的。',
      ],
      howWithAgent: [
        '从 npm 添加插件，或从 GitHub 锁定某个 commit。',
        '描述动效：图层、时序、缓动、错峰。',
        '把编译出的 .lottie.json 丢进 LottieWeb、lottie-ios 或 lottie-android。',
      ],
    },
    'dsh-plugin-claude-bridge': {
      tagline: '你的 Claude Code Skill、记忆和全局指令，零迁移直接在 harness 里可用。',
      whatIsIt:
        '直接读取 Claude Code 的标准文件位置——不用迁移脚本、不用复制、不用软链。~/.claude/skills 里的 Skill 会加入 harness 的 Skill 目录，项目记忆在每次请求时注入为上下文，CLAUDE.md 全局指令原样带过来。',
      whyForDesign: [
        '你在 Claude Code 里跑惯的设计 Skill，一个文件都不用挪就能在这里用。',
        '项目记忆每次请求都重新读取，新写的笔记立刻生效。',
        '全局指令和协作偏好在不同 Agent 之间保持一致。',
      ],
      howWithAgent: [
        '把插件加进你的 profile，零配置就能用。',
        '可以按需指向额外的 Skill 目录，比如 ~/.agents/skills。',
        '按名字调用你已有的 Skill，用法跟在 Claude Code 里一样。',
      ],
    },
    'dsh-web-ui': {
      tagline: '生态里最大的 UI 套件：任务看板、预览面板、Git 图谱和皮肤中心。',
      whatIsIt:
        '一套面向 harness web UI 的插件与皮肤合集：五列任务看板的卡片跑的是真实 Agent 会话，右侧面板带文件树和多标签预览，还有 Git 图谱、移动端远程控制，以及先试后用的皮肤中心。',
      whyForDesign: [
        '右侧面板在对话旁边预览 Markdown、HTML、diff、CSV、PDF、Office 文件和图片。',
        '任务看板把设计待办变成卡片，由真实的 dsh Agent 会话执行并回报进展。',
        '面板宽度可以拖拽，并按项目记住，工作空间始终保持你摆好的样子。',
      ],
      howWithAgent: [
        '把聚合包加进你的 web profile，一次装齐全部组件。',
        '打开右侧面板，把正在对照的文件和预览固定住。',
        '把设计任务丢上看板，让卡片在真实的 Agent 会话里执行。',
      ],
    },
    'dsh-better-sidebar': {
      tagline: '塞进侧边栏的完整工作台：文件浏览器、富预览、终端、Git 和浏览器。',
      whatIsIt:
        '一个给 harness web UI 用的双面板工作台：带 CodeMirror 编辑的懒加载文件浏览器，图片、Markdown、HTML、PDF 和 Office 文件的内联预览，一个真实终端，带 VS Code 风格 diff 的 Git 面板，一个内嵌的沙箱浏览器，以及可拖拽的分栏标签页。',
      whyForDesign: [
        '不用离开对话，就能预览 Agent 产出的 HTML、图片和文档。',
        '内嵌的沙箱浏览器把你正在跑的原型开在对话旁边的标签页里。',
        '第三方插件可以通过它的服务 API 注册自己的标签页和文件预览器。',
      ],
      howWithAgent: [
        '用一行脚本安装，或把 npm 包加进你的 web profile。',
        '打开工作台，把标签页排布在右侧边栏和底部面板上。',
        '原地检阅 Agent 做出来的东西：预览、diff、终端和浏览器标签页。',
      ],
    },
    'dsh-vision-router': {
      tagline: '给纯文本 Agent 的免费视觉，不要 API Key：内置视觉链路加十一个像素级工具。',
      whatIsIt:
        '一个视觉路由器：原始像素留在视觉模型一侧，推理交给 DeepSeek。选一个标着「+ Auto Vision」的模型组，粘贴一张图，Agent 就能驱动十一个像素级工具——grounding、裁剪、像素 diff、取色、OCR、SVG 描摹、抠图、HTML 截图——底下是一条免费的匿名视觉回退链路，不用注册账号，也不用 API Key。',
      whyForDesign: [
        'UI 还原有了可验证的像素闭环：参考稿 → 截图 → 带红色热力图的像素 diff → 修改 → 反复迭代直到差异收敛。',
        'grounding 和检测返回原图上的像素框，README 里还记录了一次验证到最终差异只剩 2.54% 的重建。',
        '取色、图标 SVG 矢量化和背景抠图，把重建周边的设计杂活也一并包了。',
      ],
      howWithAgent: [
        '把插件加进你的 web profile；它的组合补丁会把一切接好，一个文件都不用手动改。',
        '发图之前，先在模型选择器里选一个标着「+ Auto Vision」的模型组。',
        '粘贴一张截图，让 Agent 串起 vision_ground、vision_crop、vision_describe 和 vision_pixel_diff。',
      ],
    },
    'dsh-diagram': {
      tagline: '把会话里的任何文章变成可编辑的 Excalidraw 画布，而不是一张用完即弃的图。',
      whatIsIt:
        '把 Excalidraw 画布装进 harness：Agent 调用 diagram_create，从一份紧凑的语义规格生成流程图、架构图、时间线、层级图或对比图，Canvas 标签页会打开完整编辑器，让你在会话里直接改文字、节点和连线。',
      whyForDesign: [
        '可编辑，不是一次性的：在真实的矢量画布上继续工作，而不是勉强接受一张生成的静态图。',
        '基于版本号的 compare-and-set 自动保存，防止过期的编辑器悄悄覆盖更新的成果。',
        '可以导出 .excalidraw、SVG 或 PNG；你手动改过的内容，只有在让 Agent 调用 diagram_read 时才会回到它那边。',
      ],
      howWithAgent: [
        '把插件加进你的 web profile，重启 dsh web。',
        '让它把会话里的文章画成一张清晰的图，Agent 会调用 diagram_create。',
        '打开 Canvas 标签页直接编辑，然后导出，或让 Agent 把你的修改读回去。',
      ],
    },
    'deepseek-harness-genui': {
      tagline: '任务自己长出一个专注的 React 界面——你在里面做的选择会回流给 Agent。',
      whatIsIt:
        '一层给 Agent 任务用的运行时界面：当文字开始碍事，Agent 会写一个小型 React + TypeScript 应用——内联展示、放进 Canvas、全屏或跑在 localhost——用来讲清一段复杂关系、收集一个复杂决策，或在任务级授权后操作接入的工具。',
      whyForDesign: [
        '界面是代码优先的 React：布局、控件和图表都是真实组件，不是截图。',
        '保存下来的选择、输入和草稿会回到任务里，供 Agent 后续轮次读取。',
        '一套带四种视觉 profile 的 DESIGN.md 体系，让生成的应用保持同一种设计语言。',
      ],
      howWithAgent: [
        '运行安装命令——它会添加插件，然后装好 Playwright 所需的 Chromium。',
        '在交互更高效的时候要一个界面：一个选择器、一个可探索的模型、一个代码路径浏览器。',
        '操作完接着聊——Agent 会直接读到你的选择，不用你再复述一遍。',
      ],
    },
    'dsh-annotate': {
      tagline: '指着浏览器里的元素，发给 Agent 的是结构化事实，不是含糊的描述。',
      whatIsIt:
        '通过配套 Chrome 扩展做可视化浏览器反馈：/annotate 进入选择模式，你点选的每个元素都会带上选择器、DOM 事实、计算样式要点、无障碍数据、你的批注和可选的视口截图，一起进入 Agent 的下一轮。',
      whyForDesign: [
        '视觉反馈始终挂在页面元素上，而不是退化成一段含糊描述或一张贴进来的截图。',
        '计算样式和无障碍数据以结构化事实的形式到达，Agent 可以直接照着行动。',
        '按主机、来源和扩展 ID 限制的本地回环 WebSocket 桥，让整条通道不出本机。',
      ],
      howWithAgent: [
        '克隆仓库并把项目加进一个 harness profile，然后在 chrome://extensions 里以解包扩展方式加载它的 browser-extension 文件夹。',
        '运行 /annotate，在页面上点选元素，逐个附上批注。',
        '提交——采集到的事实和视口截图会落进 Agent 的下一轮。',
      ],
    },
    'dsh-hyperframes': {
      tagline: 'HeyGen 出品的 HyperFrames 移植版：五个官方 Skill，把 HTML 变成成片视频。',
      whatIsIt:
        '一次安装，把 HyperFrames by HeyGen 的五个官方 Skill 注册进 harness：带视觉风格、配色、字幕和音频响应转场的 HTML 视频合成、hyperframes CLI、组件仓库、网站转视频流水线，还有一份 GSAP 动画参考。',
      whyForDesign: [
        '在你本来就熟的介质里做动效：HTML 和 CSS 直接变成渲染出的视频。',
        '一条七步的网站转视频流水线，把一个 URL 变成一支成片。',
        'Skill 用的是开放的 SKILL.md 格式，同一套还能带去 Claude Code、Cursor 和 Codex。',
      ],
      howWithAgent: [
        '把插件加进你的 web profile，重启。',
        '说一句「把这个 URL 做成 HyperFrames 视频」，就能触发流水线。',
        '用 hyperframes CLI 渲染；依赖只有 Node 22+ 和 FFmpeg。',
      ],
    },
    'dsh-web-preview': {
      tagline: '一块玻璃质感的侧边面板：预览工作区、运行项目、标注元素。',
      whatIsIt:
        '一个给 harness web UI 用的侧边网页预览面板：工作区文件直接托管出来预览——Markdown 渲染、代码带行号、图片和 HTML 原样呈现——项目自动识别类型（Cargo、package.json、go.mod、Python）并带实时日志运行，标记模式还能把元素批注采集回对话。',
      whyForDesign: [
        'Agent 刚写好的原型就开在对话旁边，地址栏保持同步，面板宽度可以拖拽。',
        '标记模式悬停高亮元素，采集选择器和 HTML 快照，把你的批注发进对话。',
        '链接、文件路径和拖进来的文件都在面板里打开，评审全程不用离开会话。',
      ],
      howWithAgent: [
        '把包装进你的 web profile 目录，然后在该 profile 的 cordis.patch.yml 里添加一条名为 dsh-web-preview-panel 的 insert 条目来挂载它。',
        '重启 dsh web，点开对话右上角的 ▶ 预览按钮。',
        '在面板里运行项目、标注元素，把日志或批注直接发给 Agent。',
      ],
    },
  },
};
