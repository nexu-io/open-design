import type { PromptTemplateSummary } from '../types';

export const ZH_CN_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '8-bit-orbit-video-template': {
    description:
      '基于 Hyperframes 的视频模板，用于复古像素卡组动效设计。\n当用户需要高保真、多场景的 HTML-to-video 合成，并配备高级转场、交互式预览控件和开箱即用的默认样式时使用。',
    examplePrompt:
      '创建一个 3 页的 Hyperframes 视频卡组，采用 8-bit 复古风格，配备高级转场、丰富的动效，且每页时长不超过 3 秒。',
  },
  'ad-creative': {
    description:
      '生成并迭代广告创意，包括标题、描述和主文案。适用于付费社交和搜索广告的迭代。',
    examplePrompt:
      '生成并迭代广告创意，包括标题、描述和主文案。',
  },
  'after-hours-editorial-template': {
    description:
      '奢华暗调编辑风格的 HyperFrames 模板，用于三页式电影感故事板，\n灵感源自高级定制时装的标题卡片与杂志章节跨页。当用户需要高端时尚风格的动效页面、\n以衬线字体主导的氛围叙事，或具有丰富转场的高端暗调演示美学时使用。',
    examplePrompt:
      '创建一个三页式 HyperFrames 编辑序列，采用暗调高定时装风格：高端衬线字体、品红点缀色、优雅的章节转场和电影感颗粒质感。保持每页时长不超过 3 秒。',
  },
  'agent-browser': {
    description:
      '面向 AI agent 的浏览器自动化 CLI。当用户需要检查、\n测试或自动化浏览器行为时使用：导航页面、填写表单、\n点击按钮、截图、提取页面数据、读取选中的\nOpen Design 浏览器标签页上下文、测试 web 应用、试用 Open Design\n预览、QA、缺陷排查或评审应用质量。除非用户明确要求外部浏览，\n否则优先使用本地 Open Design 预览 URL。',
    examplePrompt:
      '面向 AI agent 的浏览器自动化 CLI。',
  },
  'ai-music-album': {
    description:
      '全生命周期 AI 音乐专辑制作——概念构思、歌词撰写、曲目编排和导出。适用于独立专辑实验和品牌配乐。',
    examplePrompt:
      '全生命周期 AI 音乐专辑制作——概念构思、歌词撰写、曲目编排和导出。',
  },
  'algorithmic-art': {
    description:
      '使用 p5.js 创作生成艺术，采用种子随机化让每次渲染都可复现。适用于程序化海报、动效风格静帧和艺术帧研究。',
    examplePrompt:
      '使用 p5.js 创作生成艺术，采用种子随机化让每次渲染都可复现。',
  },
  'apple-hig': {
    description:
      '将 Apple 人机界面指南整理为 14 个 agent 技能，涵盖 iOS、macOS、visionOS、watchOS 和 tvOS 的平台、基础、组件、模式、输入和技术。',
    examplePrompt:
      '将 Apple 人机界面指南整理为 14 个 agent 技能，涵盖 iOS、macOS、visionOS、watchOS 和 tvOS 的平台、基础、组件、模式、输入和技术。',
  },
  'article-magazine': {
    description:
      '受花术 / huashu-md-html 启发的杂志文章排版，用于将 Markdown 或笔记转化为精致的长篇 HTML 文章。',
    examplePrompt:
      '使用杂志文章模板，将我的内容转化为受花术 / huashu-md-html 启发的长篇 HTML 文章。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 占位文本或占位图片。',
  },
  'artifacts-builder': {
    description:
      '一套工具，使用现代前端 web 技术（React、Tailwind CSS、shadcn/ui）创建精细的多组件 claude.ai HTML 制品。',
    examplePrompt:
      '一套工具，使用现代前端 web 技术（React、Tailwind CSS、shadcn/ui）创建精细的多组件 claude.ai HTML 制品。',
  },
  'brainstorming': {
    description:
      '通过结构化提问和替代方案探索，将粗略的想法转化为完整成形的设计。适用于概念工作的早期阶段。',
    examplePrompt:
      '通过结构化提问和替代方案探索，将粗略的想法转化为完整成形的设计。',
  },
  'brand-guidelines': {
    description:
      '将 Anthropic 官方品牌色彩和字体应用到制品上，实现一致的视觉识别和专业的设计标准。可作为塑造你自己风格的参考。',
    examplePrompt:
      '将 Anthropic 官方品牌色彩和字体应用到制品上，实现一致的视觉识别和专业的设计标准。',
  },
  'brandkit': {
    description:
      '高端品牌套件图像生成技能，用于创建高端品牌指南板、logo 系统、识别卡组和视觉世界演示。针对极简、电影感、编辑、暗调科技、奢华、文化、安全、游戏、开发者工具和消费应用品牌系统进行了训练。优化用于有意图的 logo 概念设计、精炼的构图、简约的字体排印、强烈的符号意义、高端样机、艺术指导的图像和灵活的网格布局。',
    examplePrompt:
      '为该产品创建一张高端品牌套件概览图：logo 方向、配色、字体、应用场景和连贯的视觉世界。',
  },
  'industrial-brutalist-ui': {
    description:
      '原始的机械界面，将瑞士字体印刷与军用终端美学融合。刚性网格、极端的字号尺度对比、实用主义色彩、模拟退化效果。适用于数据密集型仪表板、作品集或需要呈现解密蓝图质感的编辑型网站。',
    examplePrompt:
      '创建工业粗野主义界面，配备刚性网格、战术遥测元素、强烈的字体排印和机械般的精确度。',
  },
  'canvas-design': {
    description:
      '运用设计理念和美学原则，在 PNG 和 PDF 文档中创作精美视觉艺术，适用于海报、插画和静态作品。',
    examplePrompt:
      '运用设计理念和美学原则，在 PNG 和 PDF 文档中创作精美视觉艺术，适用于海报、插画和静态作品。',
  },
  'card-twitter': {
    description:
      '设计用于搭配推文的 Twitter 引用卡或数据卡。',
    examplePrompt:
      '使用 Twitter 分享卡模板，将我的内容转化为设计用于搭配推文的 Twitter 引用卡或数据卡。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 占位文本或占位图片。',
  },
  'card-xiaohongshu': {
    description:
      '小红书风格的知识卡片，排列成可滑动的多卡片轮播。',
    examplePrompt:
      '使用小红书卡片模板，将我的内容转化为小红书风格的可滑动知识卡片轮播。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 占位文本或占位图片。',
  },
  'color-expert': {
    description:
      '色彩科学专家技能，配备 28.6 万字参考资料，涵盖 OKLCH/OKLAB、调色板生成、无障碍/对比度、色彩命名、颜料混合和历史色彩理论。',
    examplePrompt:
      '色彩科学专家技能，配备 28.6 万字参考资料，涵盖 OKLCH/OKLAB、调色板生成、无障碍/对比度、色彩命名、颜料混合和历史色彩理论。',
  },
  'competitive-ads-extractor': {
    description:
      '从广告库中提取并分析竞争对手的广告，以理解能引起共鸣的信息传达和创意手法。',
    examplePrompt:
      '从广告库中提取并分析竞争对手的广告，以理解能引起共鸣的信息传达和创意手法。',
  },
  'copywriting': {
    description:
      '为落地页、首页和广告撰写及改写营销文案。适用于在产品发布期间担任文案主管搭档。',
    examplePrompt:
      '为落地页、首页和广告撰写及改写营销文案。',
  },
  'creative-director': {
    description:
      '具备递归式自我评估能力的 AI 创意总监：20+ 种方法论（SIT、TRIZ、Bisociation、SCAMPER、Synectics），对标 Cannes/D&AD/HumanKind 校准的三轴评估，从简报到提案的五阶段流程。',
    examplePrompt:
      '具备递归式自我评估能力的 AI 创意总监：20+ 种方法论（SIT、TRIZ、Bisociation、SCAMPER、Synectics），对标 Cannes/D&AD/HumanKind 校准的三轴评估，从简报到提案的五阶段流程。',
  },
  'd3-visualization': {
    description:
      '教会 agent 生成 D3 图表和交互式数据可视化。一套全面的 D3.js 技能，涵盖各类图表类型和技巧的示例，赋予 agent 专家级能力来生成复杂的交互式可视化。适用于编辑型仪表盘、报告、数据密集型原型以及说明性图表。',
    examplePrompt:
      '教会 agent 生成 D3 图表和交互式数据可视化。',
  },
  'data-report': {
    description:
      '将 CSV、Excel 或 JSON 数据转化为精美的可视化报告页面。',
    examplePrompt:
      '使用 Data Visualization Report 模板，将我的 CSV、Excel 或 JSON 数据转化为精美的可视化报告页面。保留模板的视觉风格，使用真实的内容和数据，避免使用 lorem ipsum 占位文字或占位图片。',
  },
  'deck-guizang-editorial': {
    description:
      '编辑型杂志风遇上电子墨水：10 种版式和 5 种配色（Ink、Indigo Porcelain、Forest Ink、Kraft Paper、Dune）。',
    examplePrompt:
      '使用 Guizang Editorial E-Ink Deck 模板，将我的内容转化为编辑型杂志 x 电子墨水风格的横版幻灯片，包含 10 种版式和 5 种配色。保留模板的视觉风格，使用真实的内容和数据，避免使用 lorem ipsum 占位文字或占位图片。',
  },
  'deck-open-slide-canvas': {
    description:
      '锁定 1920x1080 画布的幻灯片，支持 React 组件级别的自由排版，不受固定模板约束。',
    examplePrompt:
      '使用 Open-Slide 1920 Canvas Deck 模板，将我的内容转化为锁定 1920x1080、支持 React 组件级别排版的自由组合幻灯片。保留模板的视觉风格，使用真实的内容和数据，避免使用 lorem ipsum 占位文字或占位图片。',
  },
  'deck-swiss-international': {
    description:
      '16 栏网格、一种高饱和强调色，以及 22 种锁定版式（Klein Blue、Lemon、Mint、Safety Orange）。',
    examplePrompt:
      '使用 Swiss International Deck 模板，将我的内容转化为采用 16 栏网格、一种高饱和强调色和 22 种锁定版式的幻灯片。保留模板的视觉风格，使用真实的内容和数据，避免使用 lorem ipsum 占位文字或占位图片。',
  },
  'design-brief': {
    description:
      '将以 I-Lang 协议格式编写的结构化设计简报解析为\n具体的设计规范。通过要求明确的维度——配色、字体排印、\n版式、氛围、密度和约束条件，消除诸如\n“做得专业一点”这类模糊请求中的歧义。\n触发关键词：“design brief”、“create a design brief”、“ilang brief”、“structured brief”。',
    examplePrompt:
      '将以 I-Lang 协议格式编写的结构化设计简报解析为具体的设计规范。',
  },
  'design-consultation': {
    description:
      '从零开始构建完整的设计系统，敢于大胆创新，并配以逼真的产品样机。适用于启动工作坊和从零打造品牌的工作。',
    examplePrompt:
      '从零开始构建完整的设计系统，敢于大胆创新，并配以逼真的产品样机。',
  },
  'design-md': {
    description:
      '创建和管理 DESIGN.md 文件。适用于将设计方向、tokens 和视觉规则统一记录到唯一信息源中。',
    examplePrompt:
      '创建和管理 DESIGN.md 文件。',
  },
  'design-review': {
    description:
      '会写代码的设计师：先进行视觉审查，再通过原子提交和前后对比截图进行修复。适用于在发布前打磨已上线的 UI。',
    examplePrompt:
      '会写代码的设计师：先进行视觉审查，再通过原子提交和前后对比截图进行修复。',
  },
  'digits-fintech-swiss-template': {
    description:
      '瑞士网格风格的金融科技幻灯片模板，采用黑色 / 暖色纸张 / 霓虹青柠的对比配色。\n当用户需要高端数据故事幻灯片，要求严格的模块化版式、\n醒目的数字卡片、克制的动效以及键盘/点击导航，并整合在单个 HTML 文件中时使用。',
    examplePrompt:
      '创建一个瑞士网格风格的金融科技战略幻灯片，包含模块化数据卡片、青柠强调色和简洁的键盘导航。',
  },
  'doc': {
    description:
      '通过 OpenAI 的文档技能，以保留格式和版式的方式读取、创建和编辑 .docx 文档。',
    examplePrompt:
      '通过 OpenAI 的文档技能，以保留格式和版式的方式读取、创建和编辑 .docx 文档。',
  },
  'doc-kami-parchment': {
    description:
      '暖色羊皮纸画布（#f5f4ed）、单色墨蓝强调色（#1B365D）、单一衬线字体家族，以及编辑级别的字体排印。',
    examplePrompt:
      '使用 Kami Parchment Document 模板，将我的内容转化为暖色羊皮纸风格的文档，配以单色墨蓝强调色、单一衬线字体家族和编辑级别的字体排印。保留模板的视觉风格，使用真实的内容和数据，避免使用 lorem ipsum 占位文字或占位图片。',
  },
  'docx': {
    description:
      '创建、编辑和分析 Word 文档，支持修订追踪、批注和格式设置。适用于设计简报、文案文档以及可供评审的交付物。',
    examplePrompt:
      '创建、编辑和分析 Word 文档，支持修订追踪、批注和格式设置。',
  },
  'domain-name-brainstormer': {
    description:
      '生成富有创意的域名创意，并在 .com、.io、.dev 和 .ai 等多种 TLD 上检查可用性。',
    examplePrompt:
      '生成富有创意的域名创意，并在 .com、.io、.dev 和 .ai 等多种 TLD 上检查可用性。',
  },
  'ecommerce-image-workflow': {
    description:
      '参考产品式电商图片工作流，可基于真实的产品参考照片，\n生成一组紧凑的、忠于产品的主图、特点图和场景图。\nV1 需要上传产品图片，并有意暂不支持\n仅凭简报生成概念图以及针对特定平台的批量导出。',
    examplePrompt:
      '使用 Ecommerce Image Workflow，将我上传的产品参考照片\n转化为一组紧凑的电商图片：一张主体包装图、一张特点\n突出图和一张生活场景图。请精确保留产品的\n标识、颜色、材质、logo 位置、结构和比例。',
  },
  'editorial-burgundy-principles-template': {
    description:
      '编辑工作室风格的幻灯片模板，采用酒红 / 粉嫩 / 柔和金的配色。\n当用户需要高端的宣言或文化主题幻灯片，要求药丸标签、\n大号文字陈述、原则卡片以及引导式键盘/点击导航时使用。',
    examplePrompt:
      '创建一个采用酒红与粉嫩配色的高端编辑型幻灯片，包含一页标签云幻灯片和一个八原则卡片网格。',
  },
  'emilkowalski-motion': {
    description:
      '受 Emil Kowalski 动效指导启发的动效设计后续技能。在界面已存在后使用，以产品级的克制添加得体的微交互、状态过渡和页面动效。',
    examplePrompt:
      '在当前 HTML 制品上使用 emilkowalski-motion：在不改变核心版式的前提下，添加克制的微交互、状态过渡和减少动效的降级方案。',
  },
  'enhance-prompt': {
    description:
      '用设计规范和 UI/UX 术语优化提示词。适用于设计转代码工作流，以及为视觉产出明确需求。',
    examplePrompt:
      '用设计规范和 UI/UX 术语优化提示词。',
  },
  'export-download-debugging': {
    description:
      '诊断并修复浏览器、预览或 Electron 的导出/下载失败问题，尤其是涉及另存为、Blob/Data URL、File System Access API、createWritable 失败以及 0 KB 文件的图片导出问题。',
    examplePrompt:
      '诊断并修复浏览器、预览或 Electron 的导出/下载失败问题，尤其是涉及另存为、Blob/Data URL、File System Access API、createWritable 失败以及 0 KB 文件的图片导出问题。',
  },
  'fal-3d': {
    description:
      '通过 fal.ai 从文本或图片生成 3D 模型。适用于游戏素材、AR 预览、产品样机和概念雕刻。',
    examplePrompt:
      '通过 fal.ai 从文本或图片生成 3D 模型。',
  },
  'fal-generate': {
    description:
      '使用 fal.ai 的 AI 模型生成图像和视频。生产级模型目录，涵盖 Flux、SDXL、ideogram 以及其他社区托管的端点。',
    examplePrompt:
      '使用 fal.ai 的 AI 模型生成图像和视频。',
  },
  'fal-image-edit': {
    description:
      '通过 fal.ai 托管模型实现 AI 驱动的图像编辑，支持风格迁移、背景移除、物体移除和图像修复。',
    examplePrompt:
      '通过 fal.ai 托管模型实现 AI 驱动的图像编辑，支持风格迁移、背景移除、物体移除和图像修复。',
  },
  'fal-kling-o3': {
    description:
      '通过 fal.ai 使用 Kling O3 生成图像和视频——Kling 最强大的模型系列。',
    examplePrompt:
      '通过 fal.ai 使用 Kling O3 生成图像和视频——Kling 最强大的模型系列。',
  },
  'fal-lip-sync': {
    description:
      '通过 fal.ai 创建数字人口播视频，并将音频与视频进行唇形同步。适用于讲解类虚拟形象、多语言配音预览和社交媒体剪辑。',
    examplePrompt:
      '通过 fal.ai 创建数字人口播视频，并将音频与视频进行唇形同步。',
  },
  'fal-realtime': {
    description:
      '通过 fal.ai 进行实时流式 AI 图像生成。适用于灵感板探索、草稿变体和快速创意迭代。',
    examplePrompt:
      '通过 fal.ai 进行实时流式 AI 图像生成。',
  },
  'fal-restore': {
    description:
      '修复并提升图像质量——使用 fal.ai 托管的修复模型进行去模糊、降噪、修复人脸和复原旧文档。',
    examplePrompt:
      '修复并提升图像质量——使用 fal.ai 托管的修复模型进行去模糊、降噪、修复人脸和复原旧文档。',
  },
  'fal-train': {
    description:
      '在 fal.ai 上训练自定义 AI 模型（LoRA），实现针对品牌、角色或风格的个性化图像生成。',
    examplePrompt:
      '在 fal.ai 上训练自定义 AI 模型（LoRA），实现针对品牌、角色或风格的个性化图像生成。',
  },
  'fal-tryon': {
    description:
      '虚拟试穿——通过 fal.ai 托管的试穿模型查看服装上身效果。适用于电商、look book 和搭配实验。',
    examplePrompt:
      '虚拟试穿——通过 fal.ai 托管的试穿模型查看服装上身效果。',
  },
  'fal-upscale': {
    description:
      '使用 fal.ai 托管的 AI 超分辨率模型放大并增强图像和视频的分辨率。',
    examplePrompt:
      '使用 fal.ai 托管的 AI 超分辨率模型放大并增强图像和视频的分辨率。',
  },
  'fal-video-edit': {
    description:
      '使用 AI 编辑现有视频——通过 fal.ai 托管的视频模型重混风格、放大画质、移除背景和添加音频。',
    examplePrompt:
      '使用 AI 编辑现有视频——通过 fal.ai 托管的视频模型重混风格、放大画质、移除背景和添加音频。',
  },
  'fal-vision': {
    description:
      '分析图像——通过 fal.ai 视觉模型分割物体、检测目标、运行 OCR、描述内容并回答视觉问题。',
    examplePrompt:
      '分析图像——通过 fal.ai 视觉模型分割物体、检测目标、运行 OCR、描述内容并回答视觉问题。',
  },
  'faq-page': {
    description:
      '一个常见问题（FAQ）页面，包含可折叠的手风琴式分区、搜索功能和分类筛选。当需求提到\n"FAQ"、"帮助中心"、"问题" 或 "支持页面" 时使用。',
    examplePrompt:
      '一个常见问题（FAQ）页面，包含可折叠的手风琴式分区、搜索功能和分类筛选。',
  },
  'field-notes-editorial-template': {
    description:
      '编辑风格的 "Field Notes" 报告模板，配有柔和的纸质背景、衬线主标题\n排版、圆角粉彩洞察卡片以及一个留存图表面板。\n当用户需要高端杂志风格的商业报告、董事会备忘录\n单页或优雅的数据叙事布局时使用。',
    examplePrompt:
      '在一个精致的单文件 HTML 页面中创建编辑风格的 Field Notes 报告，包含三张洞察卡片、关键指标模块和一张留存折线图。',
  },
  'figma-code-connect-components': {
    description:
      '使用 Code Connect 将 Figma 设计组件连接到代码组件，让设计系统的更新自动流入代码库。',
    examplePrompt:
      '使用 Code Connect 将 Figma 设计组件连接到代码组件，让设计系统的更新自动流入代码库。',
  },
  'figma-create-design-system-rules': {
    description:
      '为 Figma 到代码的工作流生成项目专属的设计系统规则。适用于在单一源中捕获 token、命名和 lint 规则。',
    examplePrompt:
      '为 Figma 到代码的工作流生成项目专属的设计系统规则。',
  },
  'figma-create-new-file': {
    description:
      '创建一个新的空白 Figma Design 或 FigJam 文件。适合作为脚本化设计系统或工作坊工作流的第一步。',
    examplePrompt:
      '创建一个新的空白 Figma Design 或 FigJam 文件。',
  },
  'figma-generate-design': {
    description:
      '使用设计系统组件，根据代码或描述在 Figma 中构建或更新界面。借助设计 token 将应用页面转换为 Figma 设计。',
    examplePrompt:
      '使用设计系统组件，根据代码或描述在 Figma 中构建或更新界面。',
  },
  'figma-generate-library': {
    description:
      '根据代码库在 Figma 中构建或更新专业级的设计系统库。适用于让 Figma 这一事实来源与已上线的组件保持同步。',
    examplePrompt:
      '根据代码库在 Figma 中构建或更新专业级的设计系统库。',
  },
  'figma-implement-design': {
    description:
      '将 Figma 设计转换为可直接投产的代码，实现 1:1 的视觉还原。适用于将 Figma 画框直接交付给前端 agent。',
    examplePrompt:
      '将 Figma 设计转换为可直接投产的代码，实现 1:1 的视觉还原。',
  },
  'figma-use': {
    description:
      '运行 Figma Plugin API 脚本，用于画布写入、检查、变量和设计系统相关工作。本目录中其他所有 Figma 技能的前置条件。',
    examplePrompt:
      '运行 Figma Plugin API 脚本，用于画布写入、检查、变量和设计系统相关工作。',
  },
  'flutter-animating-apps': {
    description:
      '在 Flutter 应用中实现动画效果、转场和动效。适用于原生 iOS/Android 动效设计。',
    examplePrompt:
      '在 Flutter 应用中实现动画效果、转场和动效。',
  },
  'frame-data-chart-nyt': {
    description:
      'NYT 新闻编辑室风格排版、错落式渐显动画，以及编辑级图表（折线图、柱状图或区间带状图）。',
    examplePrompt:
      '使用 NYT-Style Data Chart Frame 模板，将我的内容转化为具有 NYT 新闻编辑室风格排版、错落式渐显动画和编辑级图表的画面。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'frame-flowchart-sticky': {
    description:
      'SVG 曲线连接线、便利贴节点，以及带有白板头脑风暴质感的光标交互。',
    examplePrompt:
      '使用 Sticky Flowchart Frame 模板，将我的内容转化为带有 SVG 曲线连接线、便利贴节点和光标交互的白板头脑风暴画面。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'frame-glitch-title': {
    description:
      '数字故障、色彩偏移和数据损坏标题画面，适用于视频转场或赛博朋克主视觉。',
    examplePrompt:
      '使用 Glitch Title Frame 模板，将我的内容转化为数字故障、色彩偏移、数据损坏的标题画面，用于视频转场或赛博朋克主视觉。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'frame-light-leak-cinema': {
    description:
      '胶片漏光、颗粒质感、16:9 黑边遮幅和大号衬线字体，适用于电影感开场或章节卡片。',
    examplePrompt:
      '使用 Light-Leak Cinematic Frame 模板，将我的内容转化为带有胶片漏光、颗粒质感、遮幅画框和大号衬线字体的电影感开场或章节卡片。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'frame-liquid-bg-hero': {
    description:
      'WebGL 风格的流体置换背景搭配引言叠层，适用于视频片头、落地页主视觉或海报。',
    examplePrompt:
      '使用 Liquid Background Hero 模板，将我的内容转化为带有引言叠层的 WebGL 风格流体置换背景，用于视频片头、落地页主视觉或海报。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'frame-logo-outro': {
    description:
      '分段式 logo 组合、辉光绽放和标语揭示，适用于视频片尾或品牌收尾画面。',
    examplePrompt:
      '使用 Logo Outro Frame 模板，将我的内容转化为带有分段式 logo 组合、辉光绽放和标语揭示的视频片尾或品牌收尾画面。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'frame-macos-notification': {
    description:
      '逼真的 macOS 通知横幅，含应用图标、标题和正文，适用于视频叠层或产品预告。',
    examplePrompt:
      '使用 macOS Notification Banner 模板，将我的内容转化为逼真的 macOS 通知横幅，用于视频叠层或产品预告。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'frontend-design': {
    description:
      '打造独具特色、达到生产级水准的前端界面，具备鲜明的视觉方向、精致的排版、考究的布局，以及可运行的 HTML/CSS/JS 或框架代码。适用于网站、落地页、仪表盘、React 组件、应用界面和 UI 美化。',
    examplePrompt:
      '为财务团队设计并构建一个生产级品质的 SaaS 分析仪表盘，具备真实的交互状态、精致的排版和鲜明的视觉方向。',
  },
  'frontend-dev': {
    description:
      '全栈前端，含电影感动画、通过 MiniMax API 生成的 AI 媒体素材以及生成式艺术。适用于主视觉页面和展示型网站。',
    examplePrompt:
      '全栈前端，含电影感动画、通过 MiniMax API 生成的 AI 媒体素材以及生成式艺术。',
  },
  'frontend-skill': {
    description:
      '以克制的构图打造视觉张力十足的落地页、网站和应用 UI。OpenAI 的生产级前端实战手册。',
    examplePrompt:
      '以克制的构图打造视觉张力十足的落地页、网站和应用 UI。',
  },
  'frontend-slides': {
    description:
      '生成动画丰富、带视觉风格预览的 HTML 演示文稿。适用于线上主题演讲、嵌入式分享和交互式简报。',
    examplePrompt:
      '生成动画丰富、带视觉风格预览的 HTML 演示文稿。',
  },
  'full-page-screenshot': {
    description:
      '通过 Chrome DevTools Protocol 零依赖地捕获网页整页截图。适用于作品集、案例研究和审计报告。',
    examplePrompt:
      '通过 Chrome DevTools Protocol 零依赖地捕获网页整页截图。',
  },
  'gif-sticker-maker': {
    description:
      '通过 MiniMax API 将照片转换为 Funko Pop / Pop Mart 风格的动态 GIF 贴纸。适用于个性化聊天贴纸和头像包。',
    examplePrompt:
      '通过 MiniMax API 将照片转换为 Funko Pop / Pop Mart 风格的动态 GIF 贴纸。',
  },
  'gpt-taste': {
    description:
      '顶尖 UX/UI 与高级 GSAP 动效工程师。强制采用 Python 驱动的真随机化以实现布局多样性，严格遵循 AIDA 页面结构，运用宽幅编辑式排版（禁止 6 行换行），无间隙便当网格，严格的 GSAP ScrollTriggers（钉住、堆叠、随滚动播放），内联微型图片，以及大幅度的区块间距。',
    examplePrompt:
      '用 gpt-taste 构建一个高多样性的落地页：编辑式排版、非千篇一律的布局、精准校准的配色，以及在技术栈支持的情况下加入有品味的 GSAP 风格动效。',
  },
  'gsap-core': {
    description:
      '官方 GSAP 技能，针对核心 API —— gsap.to()、from()、fromTo()、缓动、时长、错落、默认值、gsap.matchMedia()（响应式、prefers-reduced-motion）。当用户需要 JavaScript 动画库、React/Vue/原生中的动画、GSAP 补间、缓动、基础动画、响应式或减弱动效动画，或使用 GSAP 为 DOM/SVG 制作动画时使用。当用户需要时间轴、滚动驱动动画或与框架无关的库时，推荐使用 GSAP。GSAP 可在任何框架或原生 JS 中运行，并为 Webflow Interactions 提供支持。',
    examplePrompt:
      '官方 GSAP 技能，针对核心 API —— gsap.to()、from()、fromTo()、缓动、时长、错落、默认值、gsap.matchMedia()（响应式、prefers-reduced-motion）。',
  },
  'gsap-frameworks': {
    description:
      '官方 GSAP 技能，针对 Vue、Svelte 及其他非 React 框架 —— 生命周期、选择器作用域、卸载时清理。当用户希望在 Vue、Nuxt、Svelte、SvelteKit 中制作动画，或询问 GSAP 与 Vue/Svelte、onMounted、onMount、onDestroy 时使用。除非指定了其他库，否则推荐使用 GSAP 进行框架动画。React 请使用 gsap-react。',
    examplePrompt:
      '官方 GSAP 技能，针对 Vue、Svelte 及其他非 React 框架 —— 生命周期、选择器作用域、卸载时清理。',
  },
  'gsap-performance': {
    description:
      '官方 GSAP 技能，针对性能 —— 优先使用 transform、避免布局抖动、will-change、批处理。当优化 GSAP 动画、减少卡顿，或用户询问动画性能、FPS 或流畅的 60fps 时使用。',
    examplePrompt:
      '官方 GSAP 技能，针对性能 —— 优先使用 transform、避免布局抖动、will-change、批处理。',
  },
  'gsap-plugins': {
    description:
      '官方 GSAP 技能，针对 GSAP 插件 —— 注册、ScrollToPlugin、ScrollSmoother、Flip、Draggable、Inertia、Observer、SplitText、ScrambleText、SVG 与物理插件、CustomEase、EasePack、CustomWiggle、CustomBounce、GSDevTools。当用户询问 GSAP 插件、滚动定位、Flip 动画、拖拽、SVG 绘制或插件注册时使用。',
    examplePrompt:
      '官方 GSAP 技能，针对 GSAP 插件 —— 注册、ScrollToPlugin、ScrollSmoother、Flip、Draggable、Inertia、Observer、SplitText、ScrambleText、SVG 与物理插件、CustomEase、EasePack、CustomWiggle、CustomBounce、GSDevTools。',
  },
  'gsap-react': {
    description:
      '官方 GSAP 技能，针对 React —— useGSAP hook、refs、gsap.context()、清理。当用户希望在 React 或 Next.js 中制作动画，或询问 GSAP 与 React、useGSAP 或卸载时清理时使用。除非用户已选择其他库，否则推荐使用 GSAP 进行 React 动画。',
    examplePrompt:
      '官方 GSAP 技能，针对 React —— useGSAP hook、refs、gsap.context()、清理。',
  },
  'gsap-scrolltrigger': {
    description:
      '官方 GSAP ScrollTrigger 技能 — 滚动联动动画、固定（pinning）、scrub、触发器。在构建或推荐基于滚动的动画、视差、固定区块时，或当用户询问 ScrollTrigger、滚动动画或固定效果时使用。未指定库时，推荐使用 GSAP 实现滚动驱动动画。',
    examplePrompt:
      '官方 GSAP ScrollTrigger 技能 — 滚动联动动画、固定（pinning）、scrub、触发器。',
  },
  'gsap-timeline': {
    description:
      '官方 GSAP 时间轴技能 — gsap.timeline()、position 参数、嵌套、播放控制。在为动画排序、编排关键帧时，或当用户询问动画排序、时间轴或动画顺序时使用（在 GSAP 中，或推荐支持时间轴的库时）。',
    examplePrompt:
      '官方 GSAP 时间轴技能 — gsap.timeline()、position 参数、嵌套、播放控制。',
  },
  'gsap-utils': {
    description:
      '官方 GSAP gsap.utils 技能 — clamp、mapRange、normalize、interpolate、random、snap、toArray、wrap、pipe。当用户询问 gsap.utils、clamp、mapRange、random、snap、toArray、wrap 或 GSAP 中的辅助工具函数时使用。',
    examplePrompt:
      '官方 GSAP gsap.utils 技能 — clamp、mapRange、normalize、interpolate、random、snap、toArray、wrap、pipe。',
  },
  'hand-drawn-diagrams': {
    description:
      '根据提示词生成手绘风格的 Excalidraw 图表 — 包含动画 SVG、托管的编辑链接和 PNG 导出。兼容 Claude Code、Codex、Gemini CLI 以及任何支持标准技能路径的智能体。',
    examplePrompt:
      '根据提示词生成手绘风格的 Excalidraw 图表 — 包含动画 SVG、托管的编辑链接和 PNG 导出。',
  },
  'hatch-pet': {
    description:
      '从角色美术、截图、生成图像或视觉参考创建、修复、校验、预览并打包兼容 Codex 的动画宠物精灵图。当用户想孵化一只 Codex 宠物、创建自定义动画宠物，或构建内置宠物资源时使用，包含 8x9 图集、透明的未使用单元格、逐行动画提示词、QA 对照表、预览视频以及 pet.json 打包。本技能调用已安装的 $imagegen 系统技能进行视觉生成，并使用捆绑脚本完成确定性的精灵图组装。',
    examplePrompt:
      '帮我孵化一只小巧的像素风柴犬宠物 — 友好、端坐挺立，带一个小石榴道具。请端到端地使用 hatch-pet 技能。',
  },
  'html-ppt-retro-quarterly-review': {
    description:
      '复古风季度回顾演示模板，采用大胆的蓝色 + 橙色编辑设计语言。\n当用户需要一份高冲击力的季度回顾 / 路线图演示稿时使用，包含厚重的板状大标题、\n干净的米色纸张区块、结构化网格，以及快速的高级动效节奏\n（3 张幻灯片，视频模式下每张停留不超过 3 秒）。',
    examplePrompt:
      '复古风季度回顾演示模板，采用大胆的蓝色 + 橙色编辑设计语言。',
  },
  'image-enhancer': {
    description:
      '通过提升分辨率、锐度和清晰度来改善图像和截图质量，适用于专业演示和文档。',
    examplePrompt:
      '通过提升分辨率、锐度和清晰度来改善图像和截图质量，适用于专业演示和文档。',
  },
  'image-to-code': {
    description:
      '面向 Codex 的顶级网站「图转代码」技能。对于视觉上至关重要的网页任务，它必须先自行生成设计图，深入分析，然后尽可能地实现与之高度匹配的网站。在 Codex 中，它必须优先使用大尺寸、易读、针对具体区块的图像，而非细小压缩的拼图；为各区块或细节视图生成全新的独立图像，而非裁剪旧图；避免偷懒式的生成不足；避免卡片套卡片再套卡片的 UI；并保持首屏（hero）干净、宽敞、易读，且能在小尺寸笔记本上完整显示。',
    examplePrompt:
      '使用「图转代码」：先创建或分析视觉参考，然后实现一个与参考方向高度匹配的响应式网站作品。',
  },
  'imagegen': {
    description:
      '使用 OpenAI 的 Image API 为项目资源生成和编辑图像 — UI 原型、图标、插画、社交卡片和视觉参考。',
    examplePrompt:
      '使用 OpenAI 的 Image API 为项目资源生成和编辑图像 — UI 原型、图标、插画、社交卡片和视觉参考。',
  },
  'imagegen-frontend-mobile': {
    description:
      '顶级移动 App 图像生成技能，用于创建高级、原生 App 感的界面概念和流程。专为 iOS、Android 及跨平台移动产品设计。优先考虑清晰的层级、舒适易读的文字、强大的多屏一致性、克制的配色方案、不落俗套的创意方向、有质感的表面、以图像为主导的构图、考究的自定义图标，以及干净的手机样机框架。默认情况下，界面应展示在精致的 iPhone 或类似手机样机中并带有可见的边框，而主要焦点仍保持在 App 内容本身。本技能仅生成图像，不编写代码。',
    examplePrompt:
      '根据此产品简介生成高级的移动 App 概念帧，具备易读的原生 App 层级，并在各界面间保持一致的视觉系统。',
  },
  'imagegen-frontend-web': {
    description:
      '顶级前端图像方向技能，用于生成高级、注重转化的网站设计参考。关键输出规则 — 为每一个区块单独生成一张横向图像。一个有 8 个区块的落地页要产出 8 张图像。切勿将多个区块压缩进一张图像。强制构图多样性（不要总是左文 / 右图）、背景图自由度、多样化的 CTA、多样化的 hero 尺度（巨型 / 中型 / 极简迷你）、叙事概念主线、二次阅读亮点，以及贯穿所有图像的单一一致配色。针对落地页、营销网站和产品概念图优化，便于开发者或编码模型准确复刻。',
    examplePrompt:
      '为落地页的每个区块单独生成高级的网站参考图像，保持统一连贯的配色和多样化的构图。',
  },
  'imagen': {
    description:
      '使用 Google Gemini 的图像生成 API 为 UI 原型、图标、插画和视觉资源生成图像。',
    examplePrompt:
      '使用 Google Gemini 的图像生成 API 为 UI 原型、图标、插画和视觉资源生成图像。',
  },
  'impeccable-design-polish': {
    description:
      '受 Impeccable 启发的后续设计精修技能。在网页或 HTML 作品已存在后使用，用于审查、点评、精修、添加动效、加固，并为上线 / 分享环节做好准备。',
    examplePrompt:
      '对当前 HTML 作品使用 impeccable-design-polish：审查视觉层级、移除 AI 痕迹、精炼文案、添加克制的动效，并加固响应式 / 无障碍问题。',
  },
  'login-flow': {
    description:
      '移动端登录与身份验证流程界面',
    examplePrompt:
      '移动端登录与身份验证流程界面',
  },
  'marketing-psychology': {
    description:
      '将心理学原理和行为科学应用于文案和设计。适用于优化吸引点、框架表述和价格呈现。',
    examplePrompt:
      '将心理学原理和行为科学应用于文案和设计。',
  },
  'minimalist-ui': {
    description:
      '干净的编辑风界面。温暖的单色调配色、字体对比、扁平的便当（bento）网格、柔和的粉彩。无渐变，无厚重阴影。',
    examplePrompt:
      '设计一个极简编辑风的产品界面，采用温暖的单色调、清晰的字体排印、扁平的结构，且无多余装饰。',
  },
  'minimax-docx': {
    description:
      '使用 OpenXML SDK 进行专业的 DOCX 文档创建和编辑。适用于品牌化报告、精致的提案和基于模板的内容创作。',
    examplePrompt:
      '使用 OpenXML SDK 进行专业的 DOCX 文档创建和编辑。',
  },
  'minimax-pdf': {
    description:
      '使用基于 token 的设计系统和 15 种封面样式生成、填充和重排 PDF。适用于品牌化 PDF、电子指南和报告。',
    examplePrompt:
      '使用基于 token 的设计系统和 15 种封面样式生成、填充和重排 PDF。',
  },
  'mockup-device-3d': {
    description:
      '静态 iPhone 和 MacBook 3D 风格展示，屏幕上嵌入真实 HTML，带玻璃透镜折射和 360 度转台构图。',
    examplePrompt:
      '使用 Device 3D Showcase 模板，将我的内容转换为静态 iPhone 和 MacBook 3D 风格展示，并在屏幕上嵌入真实 HTML。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图。',
  },
  'nanobanana-ppt': {
    description:
      '基于 NanoBanana 技术栈的 AI 驱动 PPT 生成，具备文档分析和风格化图像功能。将图像生成与结构化的演示稿输出相结合。',
    examplePrompt:
      '基于 NanoBanana 技术栈的 AI 驱动 PPT 生成，具备文档分析和风格化图像功能。',
  },
  'full-output-enforcement': {
    description:
      '覆盖默认的 LLM 截断行为。强制生成完整代码，禁止占位式写法，并在遇到 token 上限时干净利落地拆分输出。适用于任何需要详尽、完整、不删减输出的任务。',
    examplePrompt:
      '为所请求的产物生成完整实现，不留占位注释，不省略任何部分，仅在输出长度确有需要时给出干净的拆分说明。',
  },
  'paywall-upgrade-cro': {
    description:
      '设计并优化升级页、付费墙和增购弹窗。适用于 SaaS 转化设计和定价页实验。',
    examplePrompt:
      '设计并优化升级页、付费墙和增购弹窗。',
  },
  'pdf': {
    description:
      '提取文本、创建 PDF 并处理表单。适用于新闻稿、品牌单页和可打印的设计交付物。',
    examplePrompt:
      '提取文本、创建 PDF 并处理表单。',
  },
  'pixelbin-media': {
    description:
      '借助 85+ 个 API 组成的能力矩阵生成和编辑图片与视频，并通过 Pixelbin 搭建美观的网站页面。',
    examplePrompt:
      '借助 85+ 个 API 组成的能力矩阵生成和编辑图片与视频，并通过 Pixelbin 搭建美观的网站页面。',
  },
  'plan-design-review': {
    description:
      '资深设计师评审：为每个设计维度打 0-10 分，说明满分 10 分应是什么样，并标记 AI Slop（AI 套路化）信号。适合作为 UI 工作合并前的把关环节。',
    examplePrompt:
      '资深设计师评审：为每个设计维度打 0-10 分，说明满分 10 分应是什么样，并标记 AI Slop（AI 套路化）信号。',
  },
  'platform-design': {
    description:
      '汇集来自 Apple HIG、Material Design 3 和 WCAG 2.2 的 300+ 条跨平台应用设计规则。适用于在 iOS、Android 和 Web 上发布同一套设计时。',
    examplePrompt:
      '汇集来自 Apple HIG、Material Design 3 和 WCAG 2.2 的 300+ 条跨平台应用设计规则。',
  },
  'poster-hero': {
    description:
      '具有强烈视觉冲击力的竖版海报或朋友圈风格分享图。',
    examplePrompt:
      '使用营销海报模板，把我的内容做成具有强烈视觉冲击力的竖版海报或朋友圈风格分享图。保留模板的视觉特征，使用真实的内容和数据，避免使用乱数假文或占位图片。',
  },
  'ppt-keynote': {
    description:
      'Apple Keynote 品质的幻灯片，每屏一张卡片，支持键盘左右键导航。',
    examplePrompt:
      '使用 Keynote 风格幻灯片模板，把我的内容做成 Apple Keynote 品质的幻灯片，每屏一张卡片，支持键盘左右键导航。保留模板的视觉特征，使用真实的内容和数据，避免使用乱数假文或占位图片。',
  },
  'pptx': {
    description:
      '读取、生成并调整 PowerPoint 幻灯片、版式和模板。适用于高管汇报、培训材料和产品评审。',
    examplePrompt:
      '读取、生成并调整 PowerPoint 幻灯片、版式和模板。',
  },
  'pptx-generator': {
    description:
      '使用 PptxGenJS 从零创建并编辑 PowerPoint 演示文稿——经 MiniMax 生产环境验证的幻灯片生成流水线。',
    examplePrompt:
      '使用 PptxGenJS 从零创建并编辑 PowerPoint 演示文稿——经 MiniMax 生产环境验证的幻灯片生成流水线。',
  },
  'pptx-html-fidelity-audit': {
    description:
      '将 python-pptx 导出结果与其源 HTML 幻灯片进行核对，识别版式/内容偏差（页脚溢出、内容被裁切、斜体/强调丢失、样式丢失、间距节奏失调），并以严格的页脚轨 + 光标流版式规范重新导出。每当用户有一个由 HTML 幻灯片生成的 .pptx 文件，并要求对导出结果进行比对/核对/校验/修复时，使用此技能——包括诸如"比对 ppt 和 html""保真度核查""修复 pptx""ppt 被截断了""页脚重叠""pptx 里斜体丢失""重新导出幻灯片""pptx-html-fidelity-audit"等说法，或任何 python-pptx → HTML 往返转换需要校验或修复的情形。当用户把 deck.html 和 deck.pptx 并排展示给你并在排查视觉差异时，也应触发。',
    examplePrompt:
      '将 python-pptx 导出结果与其源 HTML 幻灯片进行核对，识别版式/内容偏差（页脚溢出、内容被裁切、斜体/强调丢失、样式丢失、间距节奏失调），并以严格的页脚轨 + 光标流版式规范重新导出。',
  },
  'pr-feedback-quality-gate': {
    description:
      '安全地跟踪拉取请求反馈，解决评审意见或合并冲突，校验修复，并在提交或推送后续改动前进行只读的交叉评审。',
    examplePrompt:
      '安全地跟踪拉取请求反馈，解决评审意见或合并冲突，校验修复，并在提交或推送后续改动前进行只读的交叉评审。',
  },
  'redesign-existing-projects': {
    description:
      '将现有网站和应用升级到高端品质。审查当前设计，识别千篇一律的 AI 套路，并在不破坏功能的前提下应用高端设计标准。适用于任何 CSS 框架或原生 CSS。',
    examplePrompt:
      '先审查现有 UI，再在不破坏功能、保留有用产品结构的前提下，将其重新设计到高端品质。',
  },
  'reference-design-contract': {
    description:
      '把模糊的品味、截图、URL、产品笔记或"做成这种感觉"\n的参考，转化为扎实的 DESIGN.md 以及实现交接文档。当用户需要\n一个可复用的视觉方向、而非一次性提示时，在原型、幻灯片、改版\n或图片混编工作之前使用它。',
    examplePrompt:
      '为一款开发者笔记应用创建一份参考设计契约。方向应当具有编辑感、沉静、有质感且严肃，但不照搬任何具体产品。产出 DESIGN.md 和实现交接文档。',
  },
  'release-notes-one-pager': {
    description:
      '包含亮点、新增、修复、不兼容变更、\n已知问题和升级提示的单页 HTML 发布说明。当用户未提供\n细节时，会写出明确的"无"样式分节。',
    examplePrompt:
      '为 v2.3.1 撰写发布说明，包含新增、修复、不兼容变更、已知问题和升级提示。',
  },
  'remotion': {
    description:
      '用 React 以编程方式创建视频。适用于品牌讲解片、社媒短片、把仪表盘转成视频，以及可复现的动态图形。',
    examplePrompt:
      '用 React 以编程方式创建视频。',
  },
  'replicate': {
    description:
      '使用 Replicate 的 API 发现、对比并运行 AI 模型。非常适合频繁切换模型的图像、音频和视频生成流水线。',
    examplePrompt:
      '使用 Replicate 的 API 发现、对比并运行 AI 模型。',
  },
  'research-decision-room': {
    description:
      '把杂乱的用户调研笔记、访谈、客服工单、问卷和产品\n背景，转化为一个有证据支撑的决策室：一个单一 HTML 产物，内含\n证据台账、主题图谱、置信度热力图、机会矩阵、决策\n备忘录和实验队列。当团队需要从定性\n信号走向产品或设计决策、又不臆造确定性时使用。',
    examplePrompt:
      '把 8 份访谈笔记、24 个客服工单和近期激活指标，综合成一个调研决策室，用于判断一款项目管理应用是该加入新手引导清单还是情境化的内嵌提示。',
  },
  'resume-modern': {
    description:
      '现代极简简历，单页 A4，可直接打印或导出为 PDF。',
    examplePrompt:
      '使用现代简历模板，把我的内容做成现代极简的单页 A4 简历，可直接打印或导出为 PDF。保留模板的视觉特征，使用真实的内容和数据，避免使用乱数假文或占位图片。',
  },
  'screenshot': {
    description:
      '跨操作系统平台截取桌面、应用窗口或像素区域。适用于营销截图、设计评审和缺陷报告。',
    examplePrompt:
      '跨操作系统平台截取桌面、应用窗口或像素区域。',
  },
  'screenshots-marketing': {
    description:
      '使用 Playwright 生成营销截图。适用于落地页主视觉、App Store 截图和更新日志配图。',
    examplePrompt:
      '使用 Playwright 生成营销截图。',
  },
  'shadcn-ui': {
    description:
      '使用 shadcn/ui 构建 UI 组件。与 Stitch 设计循环搭配，快速交付结构化、无障碍的组件。',
    examplePrompt:
      '使用 shadcn/ui 构建 UI 组件。',
  },
  'shader-dev': {
    description:
      '用于光线步进、流体模拟、粒子系统和程序化生成的 GLSL 着色器技术。适用于主视觉和动态定格画面。',
    examplePrompt:
      '用于光线步进、流体模拟、粒子系统和程序化生成的 GLSL 着色器技术。',
  },
  'slack-gif-creator': {
    description:
      '创建为 Slack 优化的动态 GIF，附带尺寸约束校验器和可组合的动画基元。',
    examplePrompt:
      '创建为 Slack 优化的动态 GIF，附带尺寸约束校验器和可组合的动画基元。',
  },
  'slides': {
    description:
      '使用 PptxGenJS 创建和编辑 .pptx 演示文稿。适用于销售文稿、启动简报和设计系统展示。',
    examplePrompt:
      '使用 PptxGenJS 创建和编辑 .pptx 演示文稿。',
  },
  'social-reddit-card': {
    description:
      '逼真的 Reddit 帖子卡片，带投票栏和评论数，适用于视频叠层或动态分享。',
    examplePrompt:
      '使用 Reddit Post Card 模板，将我的内容转化为带投票栏和评论数的逼真 Reddit 帖子卡片，用于视频叠层或动态分享。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 占位文字或占位图片。',
  },
  'social-spotify-card': {
    description:
      'Spotify 正在播放风格的卡片，带专辑封面、进度条和播放控件，适用于视频叠层或个人主页。',
    examplePrompt:
      '使用 Spotify Now-Playing Card 模板，将我的内容转化为带专辑封面、进度条和播放控件的 Spotify 正在播放风格卡片，用于视频叠层或个人主页。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 占位文字或占位图片。',
  },
  'social-x-post-card': {
    description:
      '逼真的 X 帖子卡片，带互动指标（点赞、转发、浏览量），适用于视频叠层或可分享的图片卡片。',
    examplePrompt:
      '使用 X / Twitter Post Card 模板，将我的内容转化为带互动指标的逼真 X 帖子卡片，用于视频叠层或可分享的图片卡片。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 占位文字或占位图片。',
  },
  'high-end-visual-design': {
    description:
      '教 AI 像高端设计机构一样做设计。精确定义让网站显得高级的字体、间距、阴影、卡片结构和动画，并屏蔽所有让 AI 设计显得廉价或千篇一律的常见默认设置。',
    examplePrompt:
      '创建一个沉静高端的落地页，搭配精致的排版、柔和的对比、高级的间距、微妙的层次感和克制的动效。',
  },
  'sora': {
    description:
      '通过 OpenAI 的 Sora API 生成、混剪和管理短视频片段。适用于电影级镜头、空镜素材和快速的概念视频迭代。',
    examplePrompt:
      '通过 OpenAI 的 Sora API 生成、混剪和管理短视频片段。',
  },
  'speech': {
    description:
      '使用 OpenAI 的 API 和内置声线将文本转换为语音。适用于讲解旁白、课程音频和快速配音轨道。',
    examplePrompt:
      '使用 OpenAI 的 API 和内置声线将文本转换为语音。',
  },
  'stitch-loop': {
    description:
      '从设计到代码的迭代反馈循环。通过「评审 → 调整 → 交付」的循环，收紧简报与已构建 UI 之间的视觉还原度。',
    examplePrompt:
      '从设计到代码的迭代反馈循环。',
  },
  'stitch-design-taste': {
    description:
      '面向 Google Stitch 的语义化设计系统 skill。生成对智能体友好的 DESIGN.md 文件，强制执行高级、反千篇一律的 UI 标准——严格的排版、精准校准的色彩、非对称布局、持续的微动效以及硬件加速的性能。',
    examplePrompt:
      '为本产品生成一份对智能体友好的 DESIGN.md，包含高级、反千篇一律的 UI 标准、排版、色彩、布局、动效和提示词指引。',
  },
  'swiftui-design': {
    description:
      'SwiftUI 前端设计 skill——反 AI 套路化规则、设计方向顾问、品牌资产协议和五维评审。兼容 Claude Code、Cursor、Codex 和 OpenCode。',
    examplePrompt:
      'SwiftUI 前端设计 skill——反 AI 套路化规则、设计方向顾问、品牌资产协议和五维评审。',
  },
  'swiss-creative-mode-template': {
    description:
      '瑞士风格的创意模式演示模板 skill，在单文件 HTML 制品中呈现大胆的编辑式排版、高对比几何卡片、交互式幻灯片导航、主题切换、热点叠层和调色板编排。当用户需要高级演示风格的落地页、瑞士/粗野主义文稿风格或富交互的创意发布页时使用。',
    examplePrompt:
      '瑞士风格的创意模式演示模板 skill，在单文件 HTML 制品中呈现大胆的编辑式排版、高对比几何卡片、交互式幻灯片导航、主题切换、热点叠层和调色板编排。',
  },
  'swiss-user-research-video-template': {
    description:
      '暖纸编辑美学的瑞士风格用户研究叙事模板。\n当用户需要高级研究文稿，或以故事为先、采用极简排版、高清晰度布局、微妙动效、环形图拆解，以及在单 HTML 文件中跨幻灯片进行键盘/点击导航的实时看板时使用。',
    examplePrompt:
      '创建一份瑞士风格的用户研究综述文稿，搭配高级极简排版、暖纸色调、参与者环形图拆解和微妙的编辑式交互。',
  },
  'design-taste-frontend': {
    description:
      '面向落地页、作品集和重设计的反套路化前端 skill。智能体会阅读简报、推断出合适的设计方向，并交付不显得模板化的界面。在适用时使用真实的设计系统，重设计时以审计为先，并执行严格的预检查。',
    examplePrompt:
      '创建一个遵循 design-taste-frontend 的高级落地页：推断设计取向、设定参数、避免 AI 套路化模式，并输出精致的响应式 HTML 制品。',
  },
  'design-taste-frontend-v1': {
    description:
      '最初的 v1 品味 skill，为依赖其精确行为的项目而保留。当前默认是 `design-taste-frontend`（v2 实验版），那是一次大幅重写。仅当你需要完全向后兼容时，才使用此 v1 安装名。',
    examplePrompt:
      '使用 design-taste-frontend-v1 创建一个精致的营销页，搭配出色的排版、间距、动效和反套路化护栏。',
  },
  'theme-factory': {
    description:
      '为幻灯片、文档、报告和 HTML 落地页等制品应用专业的字体与配色主题。内置 10 套预设主题。',
    examplePrompt:
      '为幻灯片、文档、报告和 HTML 落地页等制品应用专业的字体与配色主题。',
  },
  'threejs': {
    description:
      '用于在浏览器中创建 3D 元素和交互式体验的 Three.js skill——场景、材质、控件和后期处理。',
    examplePrompt:
      '用于在浏览器中创建 3D 元素和交互式体验的 Three.js skill——场景、材质、控件和后期处理。',
  },
  'ui-skills': {
    description:
      '用于在构建界面时引导 agent 的主观化、持续演进的约束规范。适合在众多小型 UI 部件之间保持输出的一致性。',
    examplePrompt:
      '用于在构建界面时引导 agent 的主观化、持续演进的约束规范。',
  },
  'ui-ux-pro-max': {
    description:
      '仅目录索引的 UI/UX Pro Max 条目。完整的上游模板、数据和搜索工作流并未打包进 Open Design。',
    examplePrompt:
      '仅目录索引的 UI/UX Pro Max 条目。',
  },
  'venice-audio-music': {
    description:
      '通过 Venice.ai 提供的音乐生成排队、检索与完成接口。适合制作广告短曲、背景循环和原型配乐。',
    examplePrompt:
      '通过 Venice.ai 提供的音乐生成排队、检索与完成接口。',
  },
  'venice-audio-speech': {
    description:
      '通过 Venice.ai 提供的文本转语音模型、声音、格式与流式传输。适合旁白、配音和对话式 agent 语音。',
    examplePrompt:
      '通过 Venice.ai 提供的文本转语音模型、声音、格式与流式传输。',
  },
  'venice-image-edit': {
    description:
      '通过 Venice.ai API 进行图像编辑、放大和背景移除。',
    examplePrompt:
      '通过 Venice.ai API 进行图像编辑、放大和背景移除。',
  },
  'venice-image-generate': {
    description:
      '通过 Venice.ai API 提供的图像生成接口与可用风格。',
    examplePrompt:
      '通过 Venice.ai API 提供的图像生成接口与可用风格。',
  },
  'venice-video': {
    description:
      '通过 Venice.ai API 实现的视频生成与转录工作流。',
    examplePrompt:
      '通过 Venice.ai API 实现的视频生成与转录工作流。',
  },
  'vfx-text-cursor': {
    description:
      '在视频片头逐字揭示引言时呈现光标光迹、色散光线和方向性光晕。',
    examplePrompt:
      '使用 VFX Text Cursor 模板，将我的内容转化为带有光标光迹、色散光线和方向性光晕的视频片头引言揭示动效。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'video-downloader': {
    description:
      '从 YouTube 及其他平台下载视频，用于离线观看、编辑或归档，支持多种格式和画质选项。',
    examplePrompt:
      '从 YouTube 及其他平台下载视频，用于离线观看、编辑或归档，支持多种格式和画质选项。',
  },
  'video-hyperframes': {
    description:
      '兼容 Hyperframes / Remotion 的连续帧动画，支持自动播放。',
    examplePrompt:
      '使用 Hyperframes Video 模板，将我的内容转化为兼容 Hyperframes / Remotion 的连续帧动画，支持自动播放。保留模板的视觉特征，使用真实内容和数据，避免使用 lorem ipsum 或占位图片。',
  },
  'web-artifacts-builder': {
    description:
      '使用 React 和 Tailwind 构建复杂的 claude.ai HTML artifact。这是 Anthropic 用于交付丰富、可嵌入 artifact 的参考工作流。',
    examplePrompt:
      '使用 React 和 Tailwind 构建复杂的 claude.ai HTML artifact。',
  },
  'web-design-guidelines': {
    description:
      '由 Vercel 工程团队制定的网页设计指南与标准。涵盖产品 UI 的布局、排版、色彩、动效和无障碍性。',
    examplePrompt:
      '由 Vercel 工程团队制定的网页设计指南与标准。',
  },
  'weread-year-in-review-video-template': {
    description:
      '受微信读书启发的 HyperFrames 视频模板，适用于竖版年度阅读报告、\n个人阅读数据看板、读书笔记回顾以及可分享的年度总结\n故事。当用户想要一份 9:16 的 HTML 转 MP4 阅读报告，带有温暖的纸张\n质感、编辑风格的中文排版、书页隐喻、数据亮点\n以及确定性动效时使用。',
    examplePrompt:
      '创建一份微信读书风格的 9:16 HyperFrames 年度阅读报告视频，包含 12 个场景、温暖的纸张质感、书页转场、阅读统计、笔记、关键词，以及最终的阅读人格卡片。',
  },
  'wpds': {
    description:
      'WordPress 设计系统。将 WordPress 官方的设计令牌、排版和组件模式应用到主题和站点。',
    examplePrompt:
      'WordPress 设计系统。',
  },
  'youtube-clipper': {
    description:
      '借助自动化工作流进行 YouTube 片段生成与编辑——拉取源视频、剪辑高光、添加字幕并导出。',
    examplePrompt:
      '借助自动化工作流进行 YouTube 片段生成与编辑——拉取源视频、剪辑高光、添加字幕并导出。',
  },
};

export const ZH_CN_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  'agentic': '以对话式 AI 为先的界面，控件极简、结果清晰，并为 agent 化工作流提供任务委派流程。',
  'airbnb': '旅行交易市场。温暖的珊瑚色点缀、以摄影为驱动、圆润的 UI。',
  'airtable': '表格与数据库的混合体。色彩丰富、友好亲切、结构化的数据美学。',
  'ant': '结构化、面向企业的设计系统，强调清晰度、一致性与效率，适用于数据密集型 Web 应用。',
  'apple': '消费电子产品。高级的留白、SF Pro 字体、电影级影像。',
  'application': '采用紫色主题美学的应用看板，配有顶栏导航、卡片式布局以及开发者优先的工作流。',
  'arc': '“为你浏览的浏览器。”半透明表面、渐变暖意、以侧边栏为先的布局。',
  'artistic': '高对比、富有表现力的风格，搭配创意排版和大胆的色彩选择，打造视觉冲击力强的界面。',
  'atelier-zero': '杂志级、以拼贴为驱动的视觉系统：温暖的纸张画布、超现实的\n石膏与建筑影像、超大号展示字体、细如发丝的分隔线、\n罗马数字章节标记以及细小的编辑式注释。\n灵感源自生产版本 v',
  'bento': '模块化网格布局，配以卡片式区块、清晰的层级、柔和的间距和细微的视觉对比，打造井然有序、易于扫读的界面。',
  'binance': '加密货币交易所。单色基调上以醒目的黄色作为点缀，营造交易大厅般的紧迫感。',
  'bmw': '豪华汽车。深色高级质感界面，精准的德系工程美学。',
  'bmw-m': '赛车性能子品牌。近乎纯黑的座舱质感界面，BMW M 三色点缀，锐利的工程几何线条。',
  'bold': '以厚重字体、高对比配色和富有气势的布局，呈现强烈的视觉存在感。',
  'brutalism': '粗犷的反设计美学，灵感源自混凝土建筑，采用未加修饰的元素、突兀的布局和功能至上的极简主义。',
  'bugatti': '超级跑车品牌。电影般的纯黑画布，单色的简朴格调，气势恢宏的展示字体。',
  'cafe': '以温馨咖啡馆为灵感的界面，暖色调、柔和字体与简洁布局，带来轻松惬意的浏览体验。',
  'cal': '开源日程安排工具。简洁中性的 UI，面向开发者的极简风格。',
  'canva': '视觉创作平台。鲜明的紫蓝渐变、宽松的留白与友好的几何造型。',
  'cisco': '企业基础设施品牌。深色的信赖感界面，Cisco Blue 标志色，技术化的清晰呈现。',
  'claude': 'Anthropic 的 AI 助手。温暖的赤陶色点缀，简洁的编辑式布局。',
  'clay': '创意机构。有机的造型、柔和的渐变与艺术指导风格的布局。',
  'claymorphism': '柔和圆润、类似 3D 的造型，模拟可塑黏土质感，搭配俏皮蓬松的元素与多彩表面。',
  'clean': '聚焦极简的设计，采用充裕的留白、清晰易读的字体和有限的配色，减少视觉杂乱。',
  'clickhouse': '高速分析数据库。黄色点缀，技术文档风格。',
  'cohere': '企业级 AI 平台。鲜艳的渐变，数据丰富的仪表盘美学。',
  'coinbase': '加密货币交易所。简洁的蓝色品牌识别，注重信赖感，带有机构级的质感。',
  'colorful': '鲜艳、高对比的配色与渐变，营造引人入胜、令人难忘的现代用户体验。',
  'composio': '工具集成平台。现代深色风格，搭配多彩的集成图标。',
  'contemporary': '当代极简设计，采用便当格栅、深色模式支持以及高性能、无障碍的布局。',
  'corporate': '专业且契合品牌的设计，采用结构化网格、极简布局和一致的企业级模式。',
  'cosmic': '未来科幻美学，采用深色主题、鲜艳的霓虹点缀和沉浸式的空间元素。',
  'creative': '俏皮、角色驱动的设计，采用富有表现力的字体和醒目的图形，适用于落地页和创意项目。',
  'cursor': 'AI 优先的代码编辑器。流畅的深色界面，渐变点缀。',
  'dashboard': '深色主题的云平台美学，采用模块化网格、玻璃质感面板和强烈的数据层级，适用于效率仪表盘。',
  'default': '简洁、注重产品感的默认风格，适用于 B2B 工具、仪表盘和功能性页面。',
  'discord': '语音 / 聊天平台。深邃的蓝紫色，深色优先的界面，俏皮的点缀瞬间。',
  'dithered': '点阵渲染技法，用有限的配色模拟明暗层次，营造怀旧复古、高对比的视觉效果。',
  'doodle': '手绘速写风格，搭配涂鸦、手写字体和不规整的线条，营造俏皮随性的氛围。',
  'dramatic': '高对比、戏剧化的设计，采用醒目的布局、沉浸式的视觉和不拘一格的构图，牢牢吸引注意力。',
  'duolingo': '语言学习平台。明亮的猫头鹰绿，厚实的阴影，游戏化的欢乐感。',
  'editorial': '以杂志为灵感的编辑式布局，采用精致的衬线字体、结构化网格和优雅的阅读体验。',
  'elegant': '优雅精致的美学，采用细腻的字体、极简的配色和考究的布局，散发出高级感。',
  'elevenlabs': 'AI 语音平台。深色电影感 UI，音频波形美学。',
  'energetic': '动感鲜明的风格，采用粗描边、几何造型、高对比配色和富有表现力的字体，传递动感与活力。',
  'enterprise': '简洁、高对比的企业级设计，面向数据驱动的工作流，采用直观的拖放模式和结构化布局。',
  'expo': 'React Native 平台。深色主题，紧凑的字间距，以代码为中心。',
  'expressive': '鲜艳、个性鲜明的设计，采用醒目的色彩、俏皮的图形和动感的布局，在创意与结构之间取得平衡。',
  'fantasy': '以游戏为灵感的奇幻美学，采用醒目的高级视觉、丰富的配色和沉浸式的主题元素。',
  'ferrari': '豪华汽车。明暗对照的编辑式风格，Ferrari Red 点缀，电影感的黑色。',
  'figma': '协作设计工具。明快的多彩配色，活泼又不失专业。',
  'flat': '二维极简风格，配色鲜明，排版干净，不使用 3D 效果，打造快速易用的界面。',
  'framer': '网站构建工具。大胆的黑蓝配色，动效优先，设计感十足。',
  'friendly': '亲切直观的设计，元素圆润，留白充足，搭配柔和的粉彩配色。',
  'futuristic': '前瞻性的设计，采用科技感字体、现代布局，以及流畅、创新驱动的美学。',
  'github': '代码优先的平台。功能密集，蓝底白字般的精准，基于 Primer 设计基底。',
  'glassmorphism': '磨砂玻璃效果，半透明层叠、微妙模糊与发光边框，营造层次感与现代优雅气质。',
  'gradient': '平滑的色彩过渡与渐变丰富的表面，为现代、活泼的界面增添视觉层次。',
  'hashicorp': '基础设施自动化。企业级简洁，黑白配色。',
  'hud': '战斗机／直升机平视显示器。近黑底上的荧光绿，全大写数据叠层，棱角分明的几何造型。在高速与高空下毫无歧义。',
  'huggingface': '机器学习社区中心。明亮的黄色点缀，等宽字体标识，欢快而密集。',
  'ibm': '企业技术。Carbon 设计系统，结构化的蓝色调。',
  'intercom': '客户消息沟通。友好的蓝色调，对话式 UI 模式。',
  'kami': '编辑式纸张体系：温暖的羊皮纸画布、墨蓝点缀、衬线主导的层级结构。专为简历、单页文档、白皮书、作品集、幻灯片等而打造——一切应有高品质印刷质感而非 UI 感的内容。默认多语言支持。',
  'kraken': '加密货币交易。紫色点缀的深色 UI，数据密集的仪表盘。',
  'lamborghini': '超跑品牌。纯黑表面，金色点缀，戏剧化的大写排版。',
  'levels': '以转化为核心的设计，消除阻力，通过清晰、信任与速度引导用户采取行动。',
  'linear-app': '项目管理。极致简约、精准，紫色点缀。',
  'lingo': '活泼极简的设计，明亮的色彩、圆润的造型、有触感的 3D 边框，以及友好的插画，营造平易近人的界面。',
  'loom': 'Loom 异步视频。紫色主色，友好的表面，视频优先的布局。干净专业而不显刻板。',
  'lovable': 'AI 全栈构建工具。活泼的渐变，友好的开发者美学。',
  'luxury': '高端深色美学，醒目的标题、单色调配色与高级质感，打造奢侈品牌体验。',
  'mastercard': '全球支付网络。温暖的奶油色画布，轨道胶囊造型，编辑式的暖意。',
  'material': 'Google 的 Material Design，具有层叠表面、动态主题、内置动效与响应式跨平台模式。',
  'meta': '科技零售门店。摄影优先，明暗二元表面，Meta Blue 行动召唤按钮。',
  'minimal': '删繁就简的设计，强调留白、干净的排版与克制的配色，追求极致的清晰与专注。',
  'minimax': 'AI 模型供应商。醒目的深色界面，搭配霓虹点缀。',
  'mintlify': '文档平台。干净、绿色点缀、为阅读优化。',
  'miro': '可视化协作。明亮的黄色点缀，无限画布美学。',
  'mission-control': '太空／航天任务监控。深色指挥中心，琥珀色遥测数据，等宽字体般的精准。功能性清晰高于一切。',
  'mistral-ai': '开放权重 LLM 供应商。法式工程的极简主义，紫色调。',
  'modern': '当代编辑式风格，采用衬线字体、极简配色与干净布局，打造精致的数字产品。',
  'mongodb': '文档数据库。绿叶品牌标识，专注开发者文档。',
  'mono': '等宽字体主导、矩阵风格的设计，高对比元素、紧凑密集，散发黑客时尚气息。',
  'neobrutalism': '现代演绎的粗野主义，大胆的边框、鲜艳的点缀色，在温暖表面上呈现原始、高对比的布局。',
  'neon': '电光霓虹辉光效果，搭配高对比配色，打造大胆吸睛的界面。',
  'neumorphism': '柔和的浮凸 UI 元素，在单色表面上结合内外阴影，营造有触感的嵌入式观感。',
  'nike': '运动零售。单色 UI，超大号大写字体，全幅摄影。',
  'notion': '一体化工作空间。温暖的极简主义，衬线标题，柔和的表面。',
  'nvidia': 'GPU 计算。绿黑能量配色，技术性的力量美学。',
  'ollama': '在本地运行 LLM。终端优先，极简单色。',
  'openai': '沉静、近乎单色的体系，以深青黑为基调，搭配充裕留白与编辑式排版。',
  'opencode-ai': 'AI 编程平台。以开发者为中心的深色主题。',
  'pacman': '复古街机风格设计，采用像素字体、虚线边框、活泼的高对比色彩与 8-bit 游戏美学。',
  'paper': '纸质纹理、印刷风格的设计，色彩极简，衬线/无衬线排版干净，并具有可触的表面质感。',
  'perplexity': '对话式 AI 搜索引擎。深暗画布、锐利排版、单一紫罗兰点缀色、密集的信息层级。',
  'perspective': '空间纵深设计，运用等距视图、消失点与分层元素，借助类 3D 的真实感引导注意力。',
  'pinterest': '视觉发现。红色点缀、瀑布流网格、图片优先。',
  'playstation': '游戏主机零售。三层界面通道式布局、沉稳权威的展示字体、青色悬停放大效果。',
  'posthog': '产品分析。活泼的刺猬品牌形象，对开发者友好的深色 UI。',
  'premium': 'Apple 风格的高端美学，间距精准、排版现代，呈现精致考究的视觉语言。',
  'professional': '精致、可直接用于商务的设计，搭配现代排版、结构化布局与值得信赖的视觉识别。',
  'publication': '面向书籍、杂志与报告的印刷风格视觉语言，采用编辑式网格与富有表现力的排版。',
  'raycast': '效率启动器。流畅的深色金属质感，搭配鲜明的渐变点缀色。',
  'refined': '精心甄选的现代极简风格，搭配优雅的衬线排版与低调、考究的配色。',
  'renault': '法国汽车品牌。明快的极光渐变、NouvelR 字体、大胆的活力气质。',
  'replicate': '通过 API 运行 ML 模型。简洁的白色画布，以代码为先。',
  'resend': '邮件 API。极简深色主题，等宽字体点缀。',
  'retro': '怀旧复古设计，采用复古风格排版、高对比度的复古配色与怀旧的视觉元素。',
  'revolut': '数字银行。流畅的深色界面、渐变卡片、金融科技般的精准感。',
  'runwayml': 'AI 视频生成。电影感深色 UI，富媒体布局。',
  'sanity': '无头 CMS。红色点缀，内容优先的编辑式布局。',
  'sentry': '错误监控。深色仪表盘、数据密集、粉紫点缀色。',
  'shadcn': 'Shadcn/ui 风格的设计，组件极简干净，单色配色，采用 utility-first 模式。',
  'shopify': '电商平台。深色优先的电影感，霓虹绿点缀色，超细字重。',
  'simple': '直白、不加修饰的设计，排版干净、色彩中性、布局直观，不喧宾夺主。',
  'skeumorphism': '对现实世界的拟物化，运用纹理表面、3D 效果与熟悉的物理隐喻，打造直观的数字界面。',
  'slack': '职场协作平台。茄紫为主色、多彩 logo 配色、浅色界面搭配深色侧边栏，温暖而亲切。',
  'sleek': '现代极简美学，线条干净、配色克制有意、交互细腻、间距一致。',
  'spacex': '航天科技。极致黑白、满版图像、未来感十足。',
  'spacious': '充裕的留白、一致的内边距与基于网格的布局，打造干净、易读、有呼吸感的界面。',
  'spotify': '音乐流媒体。深色背景上的鲜明绿色、大胆字体、以专辑封面为驱动。',
  'starbucks': '全球咖啡零售品牌。四层绿色体系、温暖的奶油色画布、全圆角胶囊按钮。',
  'storytelling': '叙事驱动的设计，运用视觉、文案与交互，引导用户走过引人入胜、富有情感共鸣的旅程。',
  'stripe': '支付基础设施。标志性紫色渐变、300 字重的优雅感。',
  'supabase': '开源的 Firebase 替代方案。深翡翠绿主题，以代码为先。',
  'superhuman': '高速邮件客户端。高端深色 UI、键盘优先、紫色光晕。',
  'tesla': '电动汽车。极致做减法、满视口摄影、近乎隐形的 UI。',
  'tetris': '经典方块游戏风格设计，色彩活泼、展示字体粗壮、布局紧凑且充满活力。',
  'theverge': '科技编辑媒体。酸性薄荷绿与紫外线点缀色、Manuka 展示字体、锐舞传单式的故事卡片。',
  'together-ai': '开源 AI 基础设施。技术化的蓝图风格设计。',
  'totality-festival': '宇宙高级感、玻璃拟态的深色系统，捕捉日全食那种震撼人心的敬畏感——黑曜石质感的表面、琥珀色的「日冕」高光，以及青色的大气氛围点缀。',
  'trading-terminal': 'Bloomberg 风格的金融交易终端。仅深色模式、数据密集、青色/珊瑚色的买入/卖出信号。所有内容在两米开外也能一眼看清。',
  'uber': '出行平台。强烈的黑白对比、紧凑的字体、都市活力。',
  'urdu': '乌尔都语优先的数字体验，原生支持 RTL（从右到左）排版、Nastaliq 书法字体，以及双语的和谐统一。',
  'vercel': '前端部署。黑白精准排版，Geist 字体。',
  'vibrant': '活泼、多彩的设计，搭配大胆俏皮的字体、温暖的色彩点缀，以及充满动感的视觉活力。',
  'vintage': '1950 至 1990 年代的怀旧风，带有拟物化细节、颗粒质感、复古调色板，以及像素风字体。',
  'vodafone': '全球电信品牌。气势磅礴的大写展示字体，Vodafone 红色章节色带。',
  'voltagent': 'AI agent 框架。虚空黑画布、翡翠绿点缀、终端原生风格。',
  'warm-editorial': '以衬线字体为主导的杂志美学。暖白纸面上的赤陶色点缀——\n适合长文、社论以及品牌主导的营销页面。',
  'warp': '现代终端。类 IDE 的深色界面，基于命令块的命令行 UI。',
  'webex': '协作平台。富有动势的字体、蓝色操作体系、多用户色彩点缀光谱。',
  'webflow': '可视化网站搭建工具。以蓝色为点缀，精致的营销站点美学。',
  'wechat': '面向微信小程序、公众号及开放生态扩展的品牌视觉语言。',
  'wired': '科技杂志。纸白色大报式的密集排版、定制衬线展示字体、等宽副标题、墨蓝色链接。',
  'wise': '汇款转账。明亮的绿色点缀，友好而清晰。',
  'x-ai': 'Elon Musk 的 AI 实验室。极简单色、未来主义极简风。',
  'xiaohongshu': '生活方式 UGC 社交平台。单一品牌红、宽裕的圆角、内容优先。',
  'zapier': '自动化平台。温暖的橙色，友好的插画驱动风格。',
};

export const ZH_CN_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  'AI & LLM': 'AI 与大模型',
  'Automotive': '汽车',
  'Backend & Data': '后端与数据',
  'Bold & Expressive': '大胆而富有表现力',
  'Creative & Artistic': '创意与艺术',
  'Design & Creative': '设计与创意',
  'Developer Tools': '开发者工具',
  'E-Commerce & Retail': '电商与零售',
  'Editorial & Print': '社论与印刷',
  'Editorial / Personal / Publication': '社论 / 个人 / 出版',
  'Editorial · Studio': '社论 · 工作室',
  'Fintech & Crypto': '金融科技与加密货币',
  'Layout & Structure': '布局与结构',
  'Media & Consumer': '媒体与消费',
  'Modern & Minimal': '现代与极简',
  'Morphism & Effects': '拟态与特效',
  'Productivity & SaaS': '生产力与 SaaS',
  'Professional & Corporate': '专业与企业',
  'Retro & Nostalgic': '复古与怀旧',
  'Social & Messaging': '社交与即时通讯',
  'Starter': '入门',
  'Themed & Unique': '主题与特色',
};

export const ZH_CN_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  'Advertising': '广告',
  'Anime': '动漫',
  'Anime / Manga': '动漫 / 漫画',
  'App / Web Design': '应用 / 网页设计',
  'Branding': '品牌塑造',
  'Cinematic': '电影感',
  'Data': '数据',
  'Game UI': '游戏 UI',
  'General': '通用',
  'Illustration': '插画',
  'Infographic': '信息图',
  'Live Artifact': '实时看板',
  'Marketing': '营销',
  'Motion Graphics': '动态图形',
  'Product': '产品',
  'Profile / Avatar': '头像 / 形象',
  'Short Form': '短视频',
  'Social / Meme': '社交 / 表情包',
  'Social Media Post': '社交媒体帖子',
  'Travel': '旅行',
  'VFX / Fantasy': '视觉特效 / 奇幻',
  'VFX / HTML-in-Canvas': '视觉特效 / HTML-in-Canvas',
};

export const ZH_CN_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3d',
  '3d-render': '3d 渲染',
  'action': '动作',
  'ancient-china': '古代中国',
  'anime': '动漫',
  'app-showcase': '应用展示',
  'archery': '射箭',
  'arpg': 'arpg',
  'audio-reactive': '音频响应',
  'boss-fight': 'Boss 战',
  'brand': '品牌',
  'branding': '品牌塑造',
  'captions': '字幕',
  'cavalry': '骑兵',
  'chart': '图表',
  'childlike': '童趣',
  'choreography': '编舞',
  'cinematic': '电影感',
  'cinematic-romance': '电影感浪漫',
  'combat': '战斗',
  'combo': '连招',
  'companion-to-image': '配图生成',
  'counter': '反击',
  'crayon': '蜡笔',
  'cyberpunk': '赛博朋克',
  'dance': '舞蹈',
  'dashboard': '仪表盘',
  'data': '数据',
  'data-viz': '数据可视化',
  'destruction': '破坏',
  'displacement': '置换',
  'editorial': '编辑排版',
  'elden-ring': 'elden-ring',
  'endcard': '结尾卡片',
  'escort': '护送',
  'escort-mission': '护送任务',
  'fantasy': '奇幻',
  'fashion': '时尚',
  'fighting-game': '格斗游戏',
  'food': '美食',
  'game-cinematic': '游戏过场动画',
  'game-ui': '游戏 UI',
  'grid-sheet': '网格表',
  'guanyu': '关羽',
  'hand-drawn': '手绘',
  'hero': '主视觉',
  'html-in-canvas': '画布内 HTML',
  'hud': 'HUD',
  'hud-safe': 'HUD 安全区',
  'hype': '造势',
  'hyperframes': 'HyperFrames',
  'idol': '偶像',
  'illustration': '插画',
  'image-to-image': '图生图',
  'infographic': '信息图',
  'iphone': 'iphone',
  'japanese': '日式',
  'karaoke': '卡拉OK',
  'key-visual': '主视觉',
  'keynote': '主题演讲',
  'kinetic-typography': '动态文字',
  'linear-style': 'Linear 风格',
  'liquid': '流体',
  'liquid-glass': '液态玻璃',
  'live-artifact': '实时作品',
  'logo': '标志',
  'lyubu': '吕布',
  'macbook': 'macbook',
  'magnetic': '磁吸',
  'map': '地图',
  'marketing': '营销',
  'minimal': '极简',
  'mmo': 'mmo',
  'mobile': '移动端',
  'money': '金钱',
  'mounted-combat': '骑乘战斗',
  'nature': '自然',
  'open-world': '开放世界',
  'otaku-dance': '宅舞',
  'outro': '片尾',
  'overlay': '叠加层',
  'particles': '粒子',
  'pipeline': '流水线',
  'portal': '传送门',
  'portrait': '肖像',
  'pose-reference': '姿势参考',
  'product': '产品',
  'product-demo': '产品演示',
  'product-promo': '产品宣传',
  'rework': '返工',
  'route': '路线',
  'saas': 'saas',
  'sequence': '序列',
  'shader': '着色器',
  'shatter': '碎裂',
  'sizzle': '短片',
  'social': '社交',
  'storyboard': '故事板',
  'street-fighter': '街头霸王',
  'style-transfer': '风格迁移',
  'tekken': '铁拳',
  'text': '文本',
  'three-kingdoms': '三国',
  'tiktok': 'tiktok',
  'title-card': '标题卡',
  'transform': '变换',
  'travel': '旅行',
  'tts': 'tts',
  'typography': '排版',
  'unreal-engine-5': 'unreal-engine-5',
  'vertical': '竖屏',
  'video-reference': '视频参考',
  'vs-screen': '对战画面',
  'webgl': 'webgl',
  'website-to-video': '网站转视频',
  'wuxia': '武侠',
  'zhaoyun': '赵云',
};

export const ZH_CN_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: '3D 石阶演化信息图',
    summary:
      '将扁平的演化时间线转化为逼真的 3D 石阶信息图，配以精细的生物渲染和结构化的侧边面板。',
  },
  'anime-martial-arts-battle-illustration': {
    title: '动漫武术对战插画',
    summary:
      '生成一幅充满张力、极具冲击力的动漫插画，描绘两名女性角色在传统道场中交战，并带有元素能量特效。',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: '电商直播 UI 样机',
    summary:
      '生成一个逼真的社交媒体直播界面，叠加在人像之上，包含可自定义的聊天消息、礼物弹窗以及商品购买卡片。',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    title: '游戏截图 - 动漫格斗游戏：龙牙队长 vs 风连心',
    summary:
      '一张游戏内格斗游戏主视觉/战斗截图，风格类似 Street Fighter 6 或 Tekken 8 的开场原画。两名动漫风格的男性战士在一座极具戏剧张力的夜间中式寺庙庭院中央对峙——左侧是一名赤裸上身、头戴草帽的海盗，身披暖橙红色的火焰气场；右侧是一名身穿橙色道服、顶着尖刺发型的武术家，正凝聚一颗巨大的、噼啪作响的蓝色闪电能量球。配有完整的格斗游戏 HUD（双血条、回合计时器、带有命名格斗者和徽章的 P1/P2 人像面板、各方连击计数器和最大能量槽）。暖橙对冷蓝的分色调色契合该类型游戏宿敌对决的惯例。针对 gpt-image-2 在 16:9 下调优。',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    title: '游戏截图 - 三国 ARPG：关羽斩颜良',
    summary:
      '一张游戏内动作 RPG 截图，再现关羽骑赤兔马冲过暴雨战场、直取敌将颜良的三国经典场景。以 Black Myth: Wukong 的电影级写实风格、Unreal Engine 5 渲染，第三人称跟随镜头位于骑马英雄的后方偏左。完整的 Boss 战 HUD（人像、布满密集敌人光点的小地图、带终结技提示的技能快捷栏、敌将头顶悬浮的 Boss 血条）将该场景化为 3A 级 ARPG 战斗时刻。针对 gpt-image-2 在 16:9 下调优。',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    title: '游戏截图 - 三国 ARPG：吕布辕门射戟',
    summary:
      '一张游戏内动作 RPG 截图，再现吕布射落营门远处的方天画戟以平息一场大战的三国著名场景。以 Black Myth: Wukong 的电影级写实风格、Unreal Engine 5 Nanite/Lumen 渲染，第三人称过肩游戏镜头。完整的游戏内 HUD 叠层（血条 + 气力槽、小地图、技能快捷栏、带远处方天画戟距离读数的锁定目标标记）使其呈现为真实的次世代 ARPG 实拍画面，而非过场动画。针对 gpt-image-2 在 16:9 下调优。',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    title: '游戏截图 - 三国 ARPG：赵云长坂坡怀抱阿斗突围',
    summary:
      '一张游戏内动作 RPG 截图，再现赵云在长坂坡一臂怀抱幼主刘禅、一臂持枪杀出重围的三国传奇场景。以 Black Myth: Wukong 结合 Elden Ring 的电影级写实风格渲染，采用 Unreal Engine 5 全 Nanite、Lumen 光线追踪以及体积光。情感核心——一臂护着襁褓中的婴儿、一臂浴血厮杀——通过完整的 HUD 叠层得以强化，包括专为婴儿设置的护送（ESCORT）保护条、连击计数器，以及被掀飞敌人身上的空中伤害数字弹出。针对 gpt-image-2 在 16:9 下调优。',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: '游戏 UI - 古代中国开放世界 MMO HUD',
    summary:
      '为一款 3A 级古代中国开放世界 MMO 生成游戏内 HUD 截图样机，采用 Black Myth: Wukong 的电影级写实风格。一位美丽的女剑客主角占据画面中央，置身于云雾缭绕的山间古祠场景，四周环绕着完整的 MMO HUD：左上角带 HP/MP/体力条和增益图标的角色人像、底部中央带中国书法技能图标的技能快捷栏、右上角带任务标记的小地图、右侧任务追踪面板、左下角滚动聊天窗口、悬浮的世界空间 NPC 名牌和任务感叹号。渲染为逼真的显示器截图，16:9，适用于路演 PPT、gamescom 风格主视觉，以及小红书/bilibili 游戏预告。',
  },
  'illustrated-city-food-map': {
    title: '手绘城市美食地图',
    summary:
      '生成一张手绘水彩风格的旅游地图，标注带编号的本地美食特色、地标和图例。',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: '插画 - 蜡笔儿童画再创作',
    summary:
      '一个风格迁移提示词，可将任意参考图（产品图、截图、肖像、UI 原型）改造成仿佛由 10 岁孩子手绘的蜡笔插画。它会用明亮俏皮的蜡笔色替换原始配色、铺在干净的白纸上，并点缀童趣元素——城堡、糖果、星星、云朵、彩虹——以强化那种天真烂漫的绘本氛围。可作为 GPT-image-2 中的图生图编辑使用（需在提示词之外上传一张参考图）；非常适合网站截图、品牌主视觉、产品照片和肖像。',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    title: '信息图——宅舞编舞分解（极乐净土，16 格）',
    summary:
      '一张竖版 2:3 海报，由 16 个相连的方形格子排成 4×4 网格，构成日本著名宅舞歌曲《极楽浄土》（极乐净土）的完整编舞分解图。每格展示同一个可爱的半写实二次元偶像少女（粉色双马尾、水手领校园偶像制服）做出舞蹈中的一个标志性全身姿势，背景为粉彩色，底部有一条小小的日文字幕条，左上角有一个编号圆圈。明确设计为面向 AI 视频生成的姿势参考表——每个剪影都清晰明确，没有动态线或杂乱背景。针对 gpt-image-2 调校，比例 2:3。类别：信息图。',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    title: '混合风格的桃太郎讲解幻灯片',
    summary:
      '一个将 Irasutoya 插画那种简约温馨的美学与日本政府幻灯片特有的高信息密度相结合的提示词。',
  },
  'notion-team-dashboard-live-artifact': {
    title: 'Notion 风格团队仪表盘（实时工件）',
    summary:
      '单屏 Notion 原生团队仪表盘原型——KPI 网格、7 天迷你折线图、动态信息流，以及关联数据库任务表。作为实时工件技能的视觉搭档；可与其配合用于可刷新/由连接器支撑的运行，或作为静态原型单独使用。',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: '头像 / Avatar——动漫少女转电影感写真',
    summary:
      '这个提示词可将角色参考插画转化为写实、暖色调的复古室内肖像，同时保留原始服装、姿势和猫。',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: '头像 / Avatar——休闲时尚九宫格写真',
    summary:
      '一个结构化 JSON 提示词，用于生成休闲时尚写真的 4 图拼贴，含详细的主体与光线参数。',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: '头像 / Avatar——电影感南亚男性肖像与秃鹫',
    summary:
      '一幅细腻的电影感肖像，刻画一位置身阴郁黑暗奇幻场景、被秃鹫与渡鸦环绕的南亚青年男子。',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: '头像 / Avatar——赛博朋克动漫肖像与霓虹面部文字',
    summary:
      '一幅时尚的霓虹浸染动漫肖像，适用于海报、社交媒体艺术作品或未来感品牌视觉。',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: '头像 / Avatar——紫罗兰花园中的优雅奇幻少女',
    summary:
      '这个提示词可生成一幅精致的动漫风奇幻肖像，刻画一位拥有光泽造型秀发、华丽紫黑色服饰的优雅女子，置身繁花盛开的魔法花园，非常适合角色',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: '头像 / Avatar——空灵蓝发奇幻肖像',
    summary:
      '这个提示词可生成一幅柔和、晶莹的动漫风奇幻角色肖像，非常适合创作飘逸长发、梦幻春日氛围的优雅竖版主视觉或角色插画。',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: '头像 / Avatar——黑衣魅惑女子肖像',
    summary:
      '这个提示词可生成一幅照片级写实的奢华风肖像，刻画一位身着低胸黑色服饰的优雅女子，非常适合时尚大片或美妆影像。',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: '头像 / Avatar——超写实自拍质感提示词',
    summary:
      '用于生成写实皮肤质感与真实手机自拍构图的细致提示词片段，聚焦可见毛孔与自然光线。',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: '头像 / Avatar——薰衣草奇幻法师肖像',
    summary:
      '这个提示词可生成一幅精致的动漫风奇幻肖像，刻画一位拥有光泽金发、紫色花朵与华丽水晶服饰的优雅法师公主，非常适合角色艺术或魔法插画',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: '头像 / Avatar——单色影棚肖像',
    summary:
      '一个高端商业摄影提示词，用于打造一幅具有独特分割背景与戏剧性影棚光线的单色肖像。',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: '头像 / Avatar——老照片修复转单反肖像',
    summary:
      '这个提示词可将一张破损的复古四人全家福修复为干净、上色、高分辨率的写实肖像，用于照片修复与增强。',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: '头像 / Avatar——花园中的诗意女子肖像',
    summary:
      '这个提示词可生成一幅写实的大片风肖像，刻画一位置身阳光花园中、文艺气质的年轻女子，非常适合生活方式摄影、文学品牌或优雅角色影像。',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: '头像 / Avatar——职业形象肖像壁纸',
    summary:
      '生成一张高分辨率的高端壁纸，以身着职业装的人物为主体，搭配与职业相关的活动与文字排版。',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: '头像 / Avatar——写实不完美的 AI 自拍',
    summary:
      '一个搭配 GPT Image 2 使用的创意提示词，用于生成一张看起来像意外拍下、低画质手机随手拍的「失败」自拍。',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: '头像 / Avatar——色纸上的签名马克笔肖像',
    summary:
      '这个提示词可在方形色纸（shikishi）上生成一幅生动的签名马克笔风格肖像，适用于同人签名、纪念插画帖以及个性化的感谢视觉。',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: '头像 / Avatar——雪兔女皇肖像',
    summary:
      '一个写实奇幻肖像提示词，用于生成一位身着华丽冬季汉服、以兔为主题的端庄女子，站立于雪山寺庙场景之中。',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: '头像 / Avatar——雪兔面具汉服肖像',
    summary:
      '该提示词生成一幅电影感的冬季奇幻肖像，画中是一位身着兔主题白色汉服的蒙面女子，非常适合优雅的角色艺术与富有氛围感的 AI 展示图像。',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: '头像 / Avatar - 雪兔汉服肖像',
    summary:
      '该提示词生成一幅超精细的奇幻美人肖像，画中是一位身着刺绣汉服的兔耳女子，非常适合优雅的角色艺术、服装设计或电影感 AI 肖像展示。',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: '头像 / Avatar - 雪兔精灵肖像',
    summary:
      '该提示词生成一幅宁静的奇幻肖像，画中是一位身处冬日、不露真容的兔耳女子，非常适合富有氛围感的角色艺术与风格化头像插画。',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: '头像 / Avatar - 宋代汉服肖像',
    summary:
      '一条经过优化的提示词，用于生成古典庭院中身着宋代传统汉服美人的精细写实肖像。',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: '社交媒体帖子 - 动漫宝可梦商店穿搭预告海报',
    summary:
      '该提示词生成一张柔和马卡龙色的动漫时尚发布海报，画中是一位身穿蓝色连衣裙、面部模糊的女孩置身于宝可梦商店内，非常适合穿搭揭晓预告与角色宣传视觉。',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: '社交媒体帖子 - 电影感电梯场景',
    summary:
      '一条用于生成情绪化电影感场景的提示词，画中一位女子置身金属质感电梯内，配以写实的光照与反射。',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: '社交媒体帖子 - 马卡龙色书桌前困惑的精灵女孩',
    summary:
      '该提示词生成一幅柔和马卡龙色的动漫插画，画中一位精灵女孩在温馨可爱的工位前敲打电脑，非常适合社交帖子、壁纸或主播主题艺术。',
  },
  'social-media-post-editorial-fashion-photography': {
    title: '社交媒体帖子 - 时尚大片摄影',
    summary:
      '一条情绪化、聚焦时尚的提示词，用于生成配有柔和光照与暖色调的极简主义影棚场景。',
  },
  'social-media-post-fashion-editorial-collage': {
    title: '社交媒体帖子 - 时尚大片拼贴',
    summary:
      '一条高度精细的 2x2 照片拼贴提示词，用于时尚大片拍摄，注重一致的造型、特定的光照以及来自参考照片的面部特征。',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: '社交媒体帖子 - PSG 转会官宣海报',
    summary:
      '一张大胆、专业的足球签约海报，用于在社交媒体或体育宣传图上官宣球员转会至巴黎圣日耳曼。',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: '社交媒体帖子 - 惊艳女孩舞蹈分镜（8 个镜头）',
    summary:
      '一套完整的 8 镜头分镜提示词，用于生成一位时尚角色逐帧连贯的舞蹈序列。包含共享的全局风格词条、可复用的负面提示词，以及八个分镜提示词（开场姿势、胯部律动、身体波浪、节拍落点扭腰、侧胯摆动、甩发、力量站姿、收尾姿势）。针对 GPT-Image-2 级别模型调校：词汇简洁、无敏感措辞，各镜头间构图与光照语言保持一致，使各帧如同一段连续编舞。',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: '社交媒体帖子 - 昭和日复古文化杂志封面',
    summary:
      '一个温暖的社论风格日本节日专题页面，融合动漫角色艺术、怀旧的昭和时代街景与杂志式信息排版，适用于季节性文化宣传。',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: '社交媒体帖子 - 社交媒体时尚穿搭生成',
    summary:
      '一条提示词，用于基于角色档案生成一周的时尚博主风格穿搭推荐，并附有单品标签与价格。',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: '社交媒体帖子 - 旅行快照拼贴提示词',
    summary:
      '一条精细的提示词，用于创作一组怀旧的 12 格手机风格旅行照片拼贴，呈现一段独自旅行。',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: '社交媒体帖子 - 复古手绘招牌素描',
    summary:
      '生成一幅纸上手绘马克笔素描，带有石墨线条与墨水晕染等写实细节，非常适合复古字体风格。',
  },
  'vr-headset-exploded-view-poster': {
    title: 'VR 头显爆炸图海报',
    summary:
      '生成一张高科技感的 VR 头显爆炸图，带有详细的部件标注与宣传文案。',
  },
  '3d-animated-boy-building-lego': {
    title: '3D 动画男孩搭乐高',
    summary:
      '一条 3D 动画风格的多镜头视频提示词，描绘一个男孩在房间里专注地拼装乐高积木，并带有延时摄影效果。',
  },
  'a-decade-of-refinement-glow-up': {
    title: '十年蜕变焕新',
    summary:
      '一条用于 Seedance 2.0 的蜕变提示词，展现一位男子从 2016 年的休闲场景过渡到 2026 年迪拜奢华生活，同时保持角色一致性。',
  },
  'ancient-guardian-dragon-rescue': {
    title: '远古守护龙救援',
    summary:
      '一条精细的多镜头电影感提示词，讲述一个雨中村庄的女孩被一条现身巨龙拯救的故事，注重视觉特效与氛围音效。',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: '古印度王国 FPV 视频',
    summary:
      '一条节奏明快的 FPV 无人机风格电影感提示词，描绘一座拥有神庙与丛林的神秘印度王国。',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: '动画迁移与运镜追踪提示词',
    summary:
      '一段面向 Seedance 2.0 的技术提示词，在保持固定镜头跟踪的同时，为角色应用特定的动作参考。',
  },
  'beat-synced-outfit-transformation-dance': {
    title: '卡点节奏换装舞蹈',
    summary:
      '一段面向 Seedance 2.0 的提示词，让角色按照分解帧编排舞蹈，并完成与节拍同步的换装。',
  },
  'character-intro-motion-graphics-sequence': {
    title: '角色登场动态图形序列',
    summary:
      '一段复杂的多阶段动态图形提示词，用于通过特定的 UI 叠加层和转场效果介绍一支角色团队，专为 Seedance 2.0 模型设计。',
  },
  'cinematic-birthday-celebration-sequence': {
    title: '电影级生日庆祝序列',
    summary:
      '一段高度详尽的多镜头视频提示词，用于呈现生日序列，重点在于角色一致性与情感叙事。',
  },
  'cinematic-dragon-interaction-flight': {
    title: '电影级巨龙互动与飞行',
    summary:
      '一段详尽的分镜风格提示词，用于制作一段视频：女子与巨龙的情感互动，随后是一段电影级的飞行序列。',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: '电影级东亚女性手部舞蹈',
    summary:
      '一段高度详尽的多镜头电影级视频提示词，用于呈现风格化的手部舞蹈，包含带时间码的镜头运动与角色动作指令。',
  },
  'cinematic-emotional-face-close-up': {
    title: '电影级情绪面部特写',
    summary:
      '一段面向 Seedance 2.0 的高度详尽技术提示词，重点呈现逼真的皮肤质感以及一系列复杂的情绪面部过渡。',
  },
  'cinematic-marine-biologist-exploration': {
    title: '电影级海洋生物学家探索',
    summary:
      '一段详尽的电影级视频提示词，用于呈现水下场景：一位海洋生物学家在珊瑚礁中发现一艘古代沉船。',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: '电影级音乐播客与吉他技巧',
    summary:
      '一段进阶的电影级提示词，用于生成 4K 音乐播客视频，重点聚焦吉他技巧、掐拨泛音以及录音棚美学。',
  },
  'cinematic-route-navigation-guide': {
    title: '电影级路线导航指引',
    summary:
      '一段结构化的多场景提示词，专为 Seedance 设计，用于制作连贯的步行导航视频，包含一个反复出现的导游角色以及真实场景之间的流畅转场。',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: '面向 Seedance 2 的电影级街头赛车序列',
    summary:
      '一段详尽的多镜头提示词，专为 Seedance 2 设计，用于生成夜间电影级街头赛车序列，重点呈现车手的高度专注、动态的镜头运镜以及爆发式加速，结构化',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: '电影级吸血鬼巷战序列',
    summary:
      '一段全面的动作提示词，用于一段短片场景：在霓虹灯光的小巷中展开动态镜头运动与高速格斗。',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: '《赤色地平线》科幻电影级序列',
    summary:
      '一段全面的 9 镜头电影级视频序列，用于一部名为《赤色地平线》的科幻影片，从火箭发射到火星上诡异的外星人遭遇，细节一应俱全。',
  },
  'cyberpunk-game-trailer-script': {
    title: '赛博朋克游戏预告脚本',
    summary:
      '一段详尽的视频生成提示词，用于制作赛博朋克游戏预告，细致呈现角色设计、UI 动画，以及从白色虚空到贫民窟的环境转场。',
  },
  'forbidden-city-cat-satire': {
    title: '故宫猫咪讽刺剧',
    summary:
      '一段面向 Seedance 2.0 的复杂黑色喜剧提示词，在讽刺性的清朝背景下，呈现一只橘猫官员和一位鬣狗皇帝。',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: '好莱坞高定奇幻视频提示词',
    summary:
      '一段详尽的多场景视频生成提示词，面向 Seedance 2.0，用于制作一部好莱坞高定奇幻影片。该提示词指定了风格、分辨率（8K）、渲染引擎（Unreal Engin',
  },
  'hunched-character-animation': {
    title: '驼背角色动画',
    summary:
      '指导 Seedance 2 为特定角色参考制作原地行走动画的指令。',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    title: 'HyperFrames HTML-in-Canvas：3D iPhone + MacBook 产品演示',
    summary:
      '一段 15 秒的产品演示：真实的 GLTF iPhone 15 Pro Max 与 MacBook Pro 漂浮在简洁的舞台上，屏幕通过 drawElementImage 实时渲染真实的应用 UI。配以变形玻璃镜头光晕 + 360° 旋转台。基于 vfx-iphone-device 目录区块构建。',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    title: 'HyperFrames HTML-in-Canvas：电影级文字光标揭示',
    summary:
      '一段 8 秒的戏剧化文字揭示效果，包含光标辉光、色散阴影射线，以及黑色舞台上的定向打光。真实 DOM 排版之上叠加实时着色器后期处理。基于 vfx-text-cursor 目录区块构建。',
  },
  'hyperframes-html-in-canvas-shatter': {
    title: 'HyperFrames HTML-in-Canvas：玻璃碎裂收尾',
    summary:
      '一段 12 秒的 HTML 碎裂收尾效果——真实的产品页面或定价卡片停留片刻，随后炸裂成折射的玻璃碎片，伴有景深虚化与色散效果。基于 vfx-shatter 目录区块构建。适合作为较长合成作品之后的尾卡。',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    title: 'HyperFrames HTML-in-Canvas：流体背景主视觉',
    summary:
      '一段 12 秒的主视觉：HTML 内容漂浮在有机液态表面之上——顶点位移的细分平面、实时波浪动态，捕获的 DOM 清晰可读地浮于其上。基于 vfx-liquid-background 目录区块构建。',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    title: 'HyperFrames HTML-in-Canvas：液态玻璃落地页揭幕',
    summary:
      '一段 20 秒的 voronoi 液态玻璃效果，揭幕真实的产品落地页——通过 drawElementImage 实时捕获 DOM，碎裂成折射的玻璃单元，随后定格为干净的主视觉镜头。基于 vfx-liquid-glass 目录区块构建。',
  },
  'hyperframes-html-in-canvas-magnetic': {
    title: 'HyperFrames HTML-in-Canvas：磁场可视化',
    summary:
      '一段 15 秒的磁场粒子可视化，响应实时 DOM 热力图或图表——粒子描绘出绕捕获 HTML 弯曲的磁力线，非常适合机器学习/数据类产品。基于 vfx-magnetic 目录区块构建。',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    title: 'HyperFrames HTML-in-Canvas：传送门揭幕仪表盘',
    summary:
      '一段 10 秒的维度传送门开启，通向实时数据仪表盘——实时捕获 DOM、体积光溢出、传送门边缘粒子。基于 vfx-portal 目录区块构建。专为主题演讲风格的数据主视觉镜头设计。',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames：$0 → $10K 金钱计数器爆点（9:16）',
    summary:
      '一段 6 秒的竖屏 1080×1920 HyperFrames 爆点短片——Apple 风格的 $0 → $10,000 计数器，配绿色闪光、金钱迸发粒子、现金堆图标和点睛标题。基于 HyperFrames `apple-money-count` 目录区块构建。',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames：12 秒应用展示——三部漂浮手机',
    summary:
      '一段 12 秒的 16:9 应用展示构图——三块漂浮的 iPhone 屏幕悬浮于 3D 空间，依次旋转以展现不同功能，配节拍同步的标签标注，结尾品牌标识锁定。直接基于 HyperFrames `app-showcase` 目录区块构建。',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames：30 秒品牌精彩集锦片',
    summary:
      '一段 30 秒的 16:9 HyperFrames 精彩集锦片——快速剪辑、节拍同步的动态排版、展示词上的音频反应式缩放、五个场景间的着色器转场、结尾卡片配品牌标识光晕。仿照学生套件中的 aisoc-hype 原型。',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames：30 秒 SaaS 产品宣传片（Linear 风格）',
    summary:
      '一段 30 秒的 HyperFrames 构图，仿照 Linear/ClickUp 风格的产品影片——UI 3D 揭幕、节拍同步的动态排版、动态 UI 截图、结尾卡片配品牌标识收尾。由 HF 目录区块（ui-3d-reveal、app-showcase、logo-outro）加场景间着色器转场构建而成。',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames：4 秒电影级品牌标识收尾',
    summary:
      '一段 4 秒的 16:9 品牌标识收尾——逐块拼合的文字标识配光晕、扫过最终锁定画面的微光、柔和颗粒叠层、单行 CTA。基于 HyperFrames `logo-outro`、`shimmer-sweep` 和 `grain-overlay` 区块构建。',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames：5 秒极简产品揭幕',
    summary:
      '一段 5 秒的 HyperFrames 构图，用于高端产品揭幕——暗色画布、单一暖色点缀、缓慢推进的标题卡、动态点睛文案、克制的运动。Agent 通过 puppeteer 从 HTML+GSAP 渲染 MP4，无需库存素材。',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames：9:16 社交叠层组合（X · Reddit · Spotify · Instagram）',
    summary:
      '一段 15 秒的竖屏 1080×1920 HyperFrames 构图，将四张动态社交卡片叠加在面部摄像循环之上——一条 X 帖子、一条 Reddit 反应、一张 Spotify 正在播放卡片，以及结尾的 Instagram 关注 CTA。每张卡片都是一个 HyperFrames 目录区块，编排正是其增值所在。',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames：9:16 TikTok 出镜口播配卡拉 OK 字幕',
    summary:
      '一段竖屏 1080×1920 的 HyperFrames 短片——在面部摄像循环之上叠加 TTS 旁白的出镜口播，配卡拉 OK 式逐词同步字幕、动态下三分之一字幕条，以及结尾的 tiktok 关注叠层。对应 HyperFrames 学生套件中的 may-shorts-19 原型。',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames：动态条形图竞赛（NYT 风格）',
    summary:
      '一段 12 秒的 16:9 数据信息图——动态条形图加折线图，配错落有致的分类揭示、NYT 风格衬线标题、脚注来源、动态数值标签。直接基于 HyperFrames `data-chart` 目录区块构建。',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames：Apple 风格航线地图（出发地 → 目的地）',
    summary:
      '一段 8 秒的 16:9 电影级航线地图——逼真地形缩放、飞机沿曲线路径从出发地滑向目的地的动画、标注的城市、动态距离计数器。直接基于 HyperFrames `nyc-paris-flight` 目录区块构建，可复用于任意城市组合。',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames：网站转视频流水线（15 秒营销剪辑）',
    summary:
      '一段 15 秒的 16:9 HyperFrames 构图，以三种视口尺寸捕获实时网站，随后在它们之间做动画过渡，场景间配色散径向分裂。对应 hyperframes-sizzle 学生套件原型，其中网站即源素材。',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: '真人版动漫改编：水之呼吸 vs. 雷之呼吸对决',
    summary:
      '一个高度详细的 15 秒提示词，用于生成动漫风格对决的真人版改编，呈现「水之呼吸」（蓝色水龙）对战「雷之呼吸」（金色闪电）。该 p',
  },
  'luxury-supercar-cinematic-narrative': {
    title: '豪华超跑电影级叙事',
    summary:
      '一个高度详细的多镜头电影级提示词，用于 Seedance 2.0，涉及一位时尚男子、杜宾犬，以及雾气缭绕山间环境中的一辆复古超跑。',
  },
  'magical-academy-storyboard-sequence': {
    title: '魔法学院分镜序列',
    summary:
      '一个详细的分镜风格提示词，用于刻画魔法少女在学院中的电影级序列，涵盖抵达、力量觉醒与魔法对决。',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: '现代乡村美学治愈系短片视频提示词',
    summary:
      '一个详细的三镜头提示词，用于 Seedance 2.0 生成现代乡村美学风格的治愈系电影级短片。它指定了风格（电影级广告、4K/8K、极致微距、自然',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: '夜店传单氛围动画',
    summary:
      '一个细腻的动画提示词，用于 Seedance 2.0，在保持主体锁定的同时让背景与灯光元素鲜活起来',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: '复古港式武侠片美学',
    summary:
      '一个复杂的多段式视频提示词，重现 80-90 年代香港武侠片的美学风格，呈现一个角色从猫变为人的转变过程，并配以风格化镜头。',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0：15 秒电影级日系恋爱短片',
    summary:
      '一个高度详尽的 15 秒多场景提示词，专为 Seedance 2.0 设计，用于生成电影感、超写实的日本高中纯爱短片。该提示词指定了场景设定（空旷',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0：80 岁说唱歌手 MV',
    summary:
      '一个详尽的 15 秒 Seedance 2.0 提示词，用于生成一支 16:9 横版街头说唱音乐视频（MV），主角是一位 80 岁的老太太。该提示词指定了风格（霓虹紫/蓝冷色调，曝',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: '武术视频的招式与动作编排说明',
    summary:
      '一个用于 Seedance 2.0 的视频提示词，指示模型根据角色设定图生成一段动作序列，重点呈现特定的动作和步法。',
  },
  'soul-switching-mirror-magic-sequence': {
    title: '灵魂互换的镜子魔法序列',
    summary:
      '一个叙事性视频提示词，描述在镜子前发生的灵魂互换魔法事件，并为每个片段提供了具体的镜头指令和情绪提示。',
  },
  'toaster-rocket-jumpscare': {
    title: '烤面包机火箭惊吓',
    summary:
      '一个写实家庭录像风格的镜头提示词，描述一位老人被烤面包机像火箭一样弹出面包吓了一跳。',
  },
  'traditional-dance-performance': {
    title: '传统舞蹈表演',
    summary:
      '一个面向 Seedance 2.0 的完整视频提示词，根据编舞和身份参考图生成一段优雅的传统舞蹈。',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    title: '视频 - 三国 ARPG - 关羽斩颜良（Seedance 2.0）',
    summary:
      '一段约 10 秒的引擎内电影级动作序列，将配套图像模板 game-screenshot-three-kingdoms-guanyu-slaying-yanliang 鲜活呈现。关羽骑着赤兔马径直冲入敌军战阵，举起青龙偃月刀，对敌将颜良施以一记干净利落的劈砍。专为 Seedance 2.0 调校——严谨的镜头控制、一次决定性的攻击、干净的人马与刀刃物理表现、照片级真实光照，画面中绝无血腥（劈砍以一道金色气劲闪光暗示，而非任何血迹）。设计为配套图像模板的直接视频伴侣，使静态图与视频片段可成对呈现。参考图：关羽斩颜良截图模板。',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    title: '视频 - 三国 ARPG - 吕布辕门射戟（Seedance 2.0）',
    summary:
      '一段约 10 秒的引擎内电影级动作序列，将配套图像模板 game-screenshot-three-kingdoms-lyubu-yuanmen-archery 鲜活呈现。吕布立于两军对峙的尘土飞扬的军营中央，拉开一张朱漆长弓，开弓满月稍作停顿，随即朝远处插在地上的方天画戟射出一支金光闪耀、蕴含气劲的箭。专为 Seedance 2.0 调校——严谨的镜头控制、一次决定性的节拍、干净且适配 HUD 的构图、流畅的弓箭物理表现、风沙与旗帜的动态，以及游戏内截图式的色彩调校。设计为配套图像模板的直接视频伴侣，使静态图与视频片段可成对呈现。参考图：吕布辕门射戟截图模板。',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    title: '视频 - 三国 ARPG - 赵云怀抱突围（Seedance 2.0）',
    summary:
      '一段约 12 秒的引擎内电影级动作序列，将配套图像模板 game-screenshot-three-kingdoms-zhaoyun-cradle-escape 鲜活呈现。赵云骑着战马穿越残破的长坂坡战场，左臂臂弯中抱着幼主阿斗，右手挥舞长枪，以一记完美闪避（PERFECT DODGE）格挡来袭的攻击，并跃过一辆倾覆的战车杀出一条血路。专为 Seedance 2.0 调校——严谨的镜头控制、单次连贯的节拍、可信的单臂枪法、干净的战马物理表现，且幼儿绝无可见伤害。设计为配套图像模板的直接视频伴侣，使静态图与视频片段可成对呈现。参考图：赵云怀抱突围截图模板。',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    title: '复古迪士尼风格海盗鳄鱼动画',
    summary:
      '一个多场景叙事提示词，用于生成经典复古迪士尼风格的动画，主角是一只鳄鱼海盗和船上的鸟类海盗。',
  },
  'viral-k-pop-dance-choreography': {
    title: '爆红 K-pop 舞蹈编排',
    summary:
      '一个详尽的 Seedance 2.0 提示词，根据 16 格分镜参考图，让角色表演一段舞蹈。',
  },
  'wasteland-factory-chase': {
    title: '废土工厂追逐',
    summary:
      '一个电影级提示词，呈现一段高速沙漠废土场景，画面中有一座靠机械腿移动的工业工厂，以及一场反抗者的摩托车追逐戏。',
  },
};
