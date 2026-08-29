import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const zh: OpenDesignPluginCopy = {
  metadata: {
    title: 'OpenDesign for Codex/ChatGPT | 安装 OpenDesign Cloud 插件',
    description:
      '在 Codex/ChatGPT 中安装 OpenDesign Cloud，直接在同一个任务里创建网站、幻灯片、原型和设计系统。',
    keywords:
      'OpenDesign Codex 插件, ChatGPT 桌面插件, Codex 插件安装, OpenDesign Cloud, Codex 设计插件, Codex MCP',
  },
  hero: {
    title: '面向 Codex/ChatGPT 的 OpenDesign 插件',
    leadBefore: '将下方指令输入你的',
    chatgptLabel: 'ChatGPT 桌面应用中的任意任务',
    installAria: '在 Codex/ChatGPT 中安装 OpenDesign Cloud',
    copy: '复制',
    github: '在 GitHub 查看安装指南 ↗',
  },
  demo: {
    title: '安装一次，随时从 Codex/ChatGPT 开始创作。',
    lead:
      '先了解完整的 Codex 与 OpenDesign 工作区，再跟随从安装到成品的真实流程。',
    overviewAlt:
      '真实 Codex 任务界面：使用 OpenDesign 插件创作，并同时展示完成后的 Goodfield 咖啡馆网站',
    overviewLabel: '真实 Codex 任务',
    overviewCaption:
      '提示词、OpenDesign 交接过程、生成的文件和最终网站，全都呈现在同一个工作区。',
    stepListAria: '真实 Codex 插件运行流程的五个阶段',
    installPhase: '安装',
    installTitle: '让 Codex 帮你完成安装',
    installBody:
      '将这条指令粘贴到 Codex 任务中。Codex 会添加官方指定的 Git marketplace 源，仅在插件尚未安装时进行安装，并完成本地 MCP 配置，无需插件已在公开目录中上架。',
    installNote: '只需在 Codex 中粘贴一次，具体安装步骤会自动完成。',
    steps: [
      {
        phase: '使用',
        title: '新建一个 Codex 任务',
        body:
          'Codex 完成安装后，在新任务中打开已安装的 OpenDesign 插件，然后选择“Try now”开始使用。',
        alt: 'Codex 中真实的 OpenDesign 插件详情页，带有 Try now 按钮',
      },
      {
        phase: '创作',
        title: '写下设计需求',
        body:
          '提及 OpenDesign，然后描述你要创作的内容、所需信息、视觉方向和响应式要求。',
        alt: '真实 Codex 提示词，请 OpenDesign 创建一个温暖的社区咖啡馆网站',
      },
      {
        phase: '创作',
        title: '实时跟进任务交接',
        body:
          'Codex 会确认设计方向、创建项目并将工作交给 OpenDesign，生成的文件会实时出现。',
        alt: '社区咖啡馆网站生成过程中真实的 Codex 与 OpenDesign 工作区',
      },
      {
        phase: '创作',
        title: '查看创作结果',
        body:
          '同一个任务会返回响应式 Goodfield 咖啡馆落地页，以及生成的图片和可编辑文件。',
        alt: '通过 Codex 中的 OpenDesign 插件生成的 Goodfield 社区咖啡馆落地页成品',
      },
    ],
  },
  use: {
    title: '直接从这条提示词开始。',
    lead:
      '在 Codex 的插件菜单中选择 OpenDesign，描述你要创作的内容，并在同一个任务中持续完善。Codex 会将插件提及显示为 OpenDesign 标签。',
    promptLabel: '本次真实 Codex 任务使用的提示词',
    copyPrompt: '复制 Codex 提示词',
    galleryAria: '使用 OpenDesign 创作的示例',
    templates: [
      {
        alt: 'Oryzo 产品落地页，画面包含富有触感的切割垫和软木物件',
        label: '产品发布',
      },
      {
        alt: 'OpenDesign Osaka 活动落地页，使用地图与排版结合的视觉设计',
        label: '活动页面',
      },
      {
        alt: 'Fable 5 深色编辑风产品网站',
        label: '编辑风网站',
      },
      {
        alt: '明亮画布上的 OpenDesign 模型时间线交互界面',
        label: '互动叙事',
      },
    ],
    promptListAria: 'OpenDesign Cloud 提示词示例',
    prompts: [
      { title: '网站' },
      { title: '幻灯片' },
      { title: '原型' },
      { title: '设计系统' },
    ],
  },
  faq: {
    title: '安装前常见问题',
    lead: 'Codex 始终掌控任务，OpenDesign 负责视觉创作流程。',
    items: [
      {
        q: '这个插件为 Codex 增加了哪些能力？',
        a:
          '它为 Codex 带来一套用于创建网站、幻灯片、原型和设计系统的 OpenDesign 工作流。插件通过本地 OpenDesign MCP 完成需求收集、项目创建和作品生成。',
      },
      {
        q: '支持哪些 Codex 产品？',
        a:
          '当前版本支持 Codex Desktop 和 Codex CLI，Codex 是首个获得支持的宿主。',
      },
      {
        q: '安装前需要准备什么？',
        a:
          '请使用 Codex CLI 0.144.6 或更高版本，以及 OpenDesign 0.17.0 或更高版本。注册本地 MCP 前，请先安装 OpenDesign。',
      },
      {
        q: '为什么需要新建一个 Codex 任务？',
        a:
          'Codex 会在任务启动时加载插件和 MCP 能力。新建任务后，刚刚安装的 OpenDesign Cloud 插件就会生效。',
      },
      {
        q: '需要一直打开 OpenDesign 窗口吗？',
        a:
          '不需要。注册好的本地 MCP 会在需要时，以无界面模式启动已签名的 OpenDesign 运行时。',
      },
    ],
  },
  final: {
    aria: '在 Codex/ChatGPT 中安装 OpenDesign Cloud',
    title: '在下一个 Codex/ChatGPT 任务中使用 OpenDesign。',
    bodyBeforeMention: '安装插件、连接本地 MCP，然后调用',
    bodyAfterMention: '即可开始创作。',
    copy: '复制',
    download: '下载 OpenDesign',
    source: '查看源码',
  },
  clipboard: {
    copying: '正在复制…',
    copied: '已复制',
    failed: '请选择并复制',
  },
  schema: {
    pageName: '面向 Codex/ChatGPT 的 OpenDesign Cloud 插件',
    applicationName: '面向 Codex/ChatGPT 的 OpenDesign Cloud 插件',
  },
};

export default zh;
