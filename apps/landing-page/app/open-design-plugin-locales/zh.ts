import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const zh: OpenDesignPluginCopy = {
  metadata: {
    title: 'Open Design for Codex/ChatGPT | 安装 Open Design Cloud 插件',
    description:
      '在 Codex/ChatGPT 中安装 Open Design Cloud，直接在同一个任务里创建网站、幻灯片、原型和设计系统。',
    keywords:
      'Open Design Codex 插件, ChatGPT 桌面插件, Codex 插件安装, Open Design Cloud, Codex 设计插件, Codex MCP',
  },
  hero: {
    title: '面向 Codex/ChatGPT 的 Open Design 插件',
    leadBefore: '将下方指令输入你的',
    chatgptLabel: 'ChatGPT 桌面应用中的任意任务',
    installAria: '在 Codex/ChatGPT 中安装 Open Design Cloud',
    copy: '复制',
    github: '在 GitHub 上查看源码 ↗',
  },
  agentInstall: {
    howToName: '在 Codex 中安装 Open Design 插件',
    howToDescription:
      '供 Agent 安装 Open Design Codex 插件并完成本地 MCP 注册的可执行步骤。',
    eyebrow: 'Agent 可读安装协议',
    title: '完整安装 Codex 插件。',
    intro:
      '如果用户要求你安装 Open Design，请按顺序执行此流程。该请求仅授权更改用户的 Codex 插件和 MCP 配置。请保持其他插件市场、插件、MCP 服务器及身份验证状态不变。',
    downloadLabel: 'Open Design 官方下载页 ↗',
    steps: [
      {
        title: '检查环境是否受支持',
        body:
          '从 release-manifest.json 读取 plugin.minimumCodexCliVersion 和 plugin.minimumOpenDesignVersion。在更改任何配置之前，必须同时满足这两个最低版本要求。仅接受由经过探测的 Open Design CLI 报告的 Open Design 运行时版本，或通过代码签名和 Gatekeeper 检查的已签名 macOS 应用包中 CFBundleShortVersionString 的值。如果 od 缺失、在 PATH 中被其他程序遮蔽（包括 /usr/bin/od），或守护进程已停止，必须改用已签名应用包进行探测。如果两种已验证的探测方式均不可用，请在更改配置前停止操作，引导用户前往 Open Design Settings → MCP server 复制适用于该客户端的绝对路径配置片段，然后重试。只有在应用缺失或版本过低时，才引导用户前往官方下载页；绝不要静默下载安装程序或运行未验证的脚本。',
      },
      {
        title: '更改配置前先行检查',
        body:
          '从 release-manifest.json 读取所需的选择器和版本，然后与检查到的 Codex 状态进行比较。仅通过从 codex mcp list --json 派生的已过滤 MCP 快照检查 MCP 状态。输出时只保留 name、enabled、transport.type 和 command；在输出前丢弃 args、env、env_vars、headers 和 token 字段。缺少 open-design 结果属于正常情况，不应导致流程失败。绝不要打印或报告原始列表或 codex mcp get open-design --json 输出，因为传输值可能包含凭据。如果名为 open-design 的 marketplace 指向其他来源，请停止操作并报告命名冲突。仅当已安装版本与 release-manifest.json 中声明的版本一致时，才保留 open-design@open-design。',
      },
      {
        title: '仅安装缺失的组件',
        body:
          '仅在官方指定的 marketplace 尚未添加时运行 marketplace 命令。缺少 open-design@open-design 时，运行插件命令。如果已安装的是其他版本，请先征得用户确认，再进行更新或重新安装；只有在已安装版本与要求的版本完全一致时，才跳过安装。返回 alreadyAdded: true 表示成功。不要手动编辑 Codex 配置，也不要将插件文件复制到 Codex 主目录。',
      },
      {
        title: '确保本地 Open Design MCP 可用',
        body:
          '保留现有且已启用的 open-design MCP。如果不存在，请运行已安装 Open Design 应用提供的 MCP 安装程序。在 POSIX 系统中，仅当对解析出的 od 路径执行探测并返回 open-design-cli:mcp-install:v1 后，才运行该路径。如果该路径缺失、被 /usr/bin/od 遮蔽或无法完成操作，请使用 /usr/bin/open 启动经过验证的已签名 macOS 应用包并执行 --headless --mcp-install codex，然后仅轮询已过滤的 MCP 快照。如果没有可用的已验证启动器，请停止操作，引导用户前往 Open Design Settings → MCP server 复制适用于该客户端的绝对路径配置片段，然后重试此步骤。绝不要猜测 localhost 端口，也不要运行 codex mcp login；Vela 登录应在 Open Design 中完成。',
      },
      {
        title: '验证、报告并开始新任务',
        body:
          '验证插件 id 为 open-design@open-design，确认其已安装版本与 release-manifest.json 中的 plugin.version 完全一致，并使用已过滤的 MCP 快照确认存在名为 open-design 的已启用 stdio MCP。仅检查 name、enabled、transport.type 和 command；原始 args、env、env_vars、headers、token、bearer token、API key 和 Vela 凭据值绝不能出现在输出或报告中。command 必须是 Open Design 的绝对启动路径。报告已安装的内容，以及尚未满足的 Open Design 或 Vela 登录前置条件。新建 Codex 任务以加载已安装的插件快照，然后调用 @open-design。',
      },
    ],
  },
  demo: {
    title: '安装一次，随时从 Codex/ChatGPT 开始创作。',
    lead:
      '先了解完整的 Codex 与 Open Design 工作区，再跟随从安装到成品的真实流程。',
    overviewAlt:
      '真实 Codex 任务界面：使用 Open Design 插件创作，并同时展示完成后的 Goodfield 咖啡馆网站',
    overviewLabel: '真实 Codex 任务',
    overviewCaption:
      '提示词、Open Design 交接过程、生成的文件和最终网站，全都呈现在同一个工作区。',
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
          'Codex 完成安装后，在新任务中打开已安装的 Open Design 插件，然后选择“Try now”开始使用。',
        alt: 'Codex 中真实的 Open Design 插件详情页，带有 Try now 按钮',
      },
      {
        phase: '创作',
        title: '写下设计需求',
        body:
          '提及 Open Design，然后描述你要创作的内容、所需信息、视觉方向和响应式要求。',
        alt: '真实 Codex 提示词，请 Open Design 创建一个温暖的社区咖啡馆网站',
      },
      {
        phase: '创作',
        title: '实时跟进任务交接',
        body:
          'Codex 会确认设计方向、创建项目并将工作交给 Open Design，生成的文件会实时出现。',
        alt: '社区咖啡馆网站生成过程中真实的 Codex 与 Open Design 工作区',
      },
      {
        phase: '创作',
        title: '查看创作结果',
        body:
          '同一个任务会返回响应式 Goodfield 咖啡馆落地页，以及生成的图片和可编辑文件。',
        alt: '通过 Codex 中的 Open Design 插件生成的 Goodfield 社区咖啡馆落地页成品',
      },
    ],
  },
  use: {
    title: '直接从这条提示词开始。',
    lead:
      '在 Codex 的插件菜单中选择 Open Design，描述你要创作的内容，并在同一个任务中持续完善。Codex 会将插件提及显示为 Open Design 标签。',
    promptLabel: '本次真实 Codex 任务使用的提示词',
    copyPrompt: '复制 Codex 提示词',
    galleryAria: '使用 Open Design 创作的示例',
    templates: [
      {
        alt: 'Oryzo 产品落地页，画面包含富有触感的切割垫和软木物件',
        label: '产品发布',
      },
      {
        alt: 'Open Design Osaka 活动落地页，使用地图与排版结合的视觉设计',
        label: '活动页面',
      },
      {
        alt: 'Fable 5 深色编辑风产品网站',
        label: '编辑风网站',
      },
      {
        alt: '明亮画布上的 Open Design 模型时间线交互界面',
        label: '互动叙事',
      },
    ],
    promptListAria: 'Open Design Cloud 提示词示例',
    prompts: [
      { title: '网站' },
      { title: '幻灯片' },
      { title: '原型' },
      { title: '设计系统' },
    ],
  },
  faq: {
    title: '安装前常见问题',
    lead: 'Codex 始终掌控任务，Open Design 负责视觉创作流程。',
    items: [
      {
        q: '这个插件为 Codex 增加了哪些能力？',
        a:
          '它为 Codex 带来一套用于创建网站、幻灯片、原型和设计系统的 Open Design 工作流。插件通过本地 Open Design MCP 完成需求收集、项目创建和作品生成。',
      },
      {
        q: '支持哪些 Codex 产品？',
        a:
          '当前版本支持 Codex Desktop 和 Codex CLI，Codex 是首个获得支持的宿主。',
      },
      {
        q: '安装前需要准备什么？',
        a:
          '请使用 Codex CLI 0.144.6 或更高版本，以及 Open Design 0.17.0 或更高版本。注册本地 MCP 前，请先安装 Open Design。',
      },
      {
        q: '为什么需要新建一个 Codex 任务？',
        a:
          'Codex 会在任务启动时加载插件和 MCP 能力。新建任务后，刚刚安装的 Open Design Cloud 插件就会生效。',
      },
      {
        q: '需要一直打开 Open Design 窗口吗？',
        a:
          '不需要。注册好的本地 MCP 会在需要时，以无界面模式启动已签名的 Open Design 运行时。',
      },
    ],
  },
  final: {
    aria: '在 Codex/ChatGPT 中安装 Open Design Cloud',
    title: '在下一个 Codex/ChatGPT 任务中使用 Open Design。',
    bodyBeforeMention: '安装插件、连接本地 MCP，然后调用',
    bodyAfterMention: '即可开始创作。',
    copy: '复制',
    download: '下载 Open Design',
    source: '查看源码',
  },
  clipboard: {
    copying: '正在复制…',
    copied: '已复制',
    failed: '请选择并复制',
  },
  schema: {
    pageName: '面向 Codex/ChatGPT 的 Open Design Cloud 插件',
    applicationName: '面向 Codex/ChatGPT 的 Open Design Cloud 插件',
  },
};

export default zh;
