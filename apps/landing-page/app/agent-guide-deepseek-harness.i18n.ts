import type { AgentGuideCopy } from './info-page-i18n';

const OPEN_DESIGN_ACTIONS = [
  { label: 'Use DeepSeek with Open Design', href: '/quickstart/', variant: 'primary' as const },
  {
    label: 'Star Open Design on GitHub',
    href: 'https://github.com/nexu-io/open-design',
    variant: 'ghost' as const,
    external: true,
  },
  {
    label: 'Download the desktop app',
    href: 'https://github.com/nexu-io/open-design/releases',
    variant: 'ghost' as const,
    external: true,
  },
];

const OPEN_DESIGN_ACTIONS_ZH = [
  { label: '在 Open Design 中使用 DeepSeek', href: '/quickstart/', variant: 'primary' as const },
  {
    label: '在 GitHub 上 Star Open Design',
    href: 'https://github.com/nexu-io/open-design',
    variant: 'ghost' as const,
    external: true,
  },
  {
    label: '下载桌面应用',
    href: 'https://github.com/nexu-io/open-design/releases',
    variant: 'ghost' as const,
    external: true,
  },
];

const DEEPSEEK_HARNESS_HERO_ACTIONS = [
  { label: 'Download Open Design', href: '/download/', variant: 'primary' as const },
  {
    label: 'Open DeepSeek Harness on GitHub',
    href: 'https://github.com/deepseek-ai/deepseek-harness',
    variant: 'ghost' as const,
    external: true,
  },
];

const DEEPSEEK_HARNESS_HERO_ACTIONS_ZH = [
  { label: '下载 Open Design', href: '/download/', variant: 'primary' as const },
  {
    label: '在 GitHub 打开 DeepSeek Harness',
    href: 'https://github.com/deepseek-ai/deepseek-harness',
    variant: 'ghost' as const,
    external: true,
  },
];

export const DEEPSEEK_HARNESS_EN_GUIDE: AgentGuideCopy = {
  title: 'How to Use DeepSeek Harness for Design | Open Design',
  description:
    'Use DeepSeek Harness (dsh) to design and build UI. Set up its Web UI, add a design contract and skills, generate frontend code, and verify the result.',
  breadcrumb: 'DeepSeek Harness',
  label: 'Agent · DeepSeek Harness',
  heading: 'Design with DeepSeek Harness.',
  lead:
    'Turn DeepSeek Harness into a local UI workspace with project rules, reusable skills, model routing, and a browser verification loop.',
  tldrTitle: 'TL;DR',
  tldrBody:
    'Run DeepSeek Harness with npx @deepseek-ai/dsh web, add your model key, choose a workspace, and give the agent design rules through AGENTS.md, CLAUDE.md, and skills. DeepSeek’s native route is text-only, so screenshot work needs an image-capable provider. Open Design can supply the design-system and artifact layer alongside dsh today; a dedicated dsh adapter is not shipped yet.',
  toc: [
    'What is DeepSeek Harness',
    'Why it fits design work',
    'Setup',
    'Design workflow',
    'Plugins, skills, and context',
    'Comparison',
    'Pitfalls',
    'With Open Design',
    'FAQ',
  ],
  rich: {
    heroCtaLead:
      'Start dsh, open your repository, load a design contract, generate the interface, then verify it in the browser.',
    heroCtaActions: DEEPSEEK_HARNESS_HERO_ACTIONS,
    intro: [
      'DeepSeek Harness, or dsh, becomes useful for design when you treat it as the runtime around a repeatable UI process. The model edits the code, project files hold the visual contract, skills encode the craft, and browser checks decide whether the result is acceptable.',
      'This guide follows that process from setup to visual review. Product architecture, provider limits, and tool comparisons are included only where they change how you design with the harness.',
    ],
    heroImage: {
      src: '/agents/deepseek-harness-design/deepseek-harness-design-hero.webp',
      alt: 'DeepSeek Harness plugin streams converging on the official DeepSeek fish mark before branching into a local design workspace',
      caption:
        'The harness is the middle layer: plugins bring models, tools, skills, and policy together; the workspace turns them into visible, reviewable output.',
    },
    tocLabel: 'On this page',
    toc: [
      { id: 'setup', label: 'Build the design workspace' },
      { id: 'why-design', label: 'Give the agent a design contract' },
      { id: 'design-workflow', label: 'Run the UI build and review loop' },
      { id: 'plugins', label: 'Make the workflow reusable' },
      { id: 'pitfalls', label: 'Avoid weak visual output' },
      { id: 'what-is-deepseek-harness', label: 'What the harness contributes' },
      { id: 'vs', label: 'When to choose DeepSeek Harness' },
      { id: 'open-design', label: 'Add the Open Design layer' },
      { id: 'faq', label: 'FAQ' },
    ],
    sections: [
      {
        id: 'what-is-deepseek-harness',
        heading: 'What the harness contributes to design',
        blocks: [
          {
            kind: 'p',
            text: 'DeepSeek Harness (`dsh`) is an [MIT-licensed agent harness developed by DeepSeek AI](https://github.com/deepseek-ai/deepseek-harness). The public developer preview ships a local Web UI and a headless runner. It is not a model and it is not merely a terminal skin: it is the runtime that assembles a model, tools, context, permissions, sessions, and user interface into an agent.',
          },
          {
            kind: 'p',
            text: 'Its defining idea is “everything is a plugin.” Cordis composes a tree in which the model adapter, tool registry, agent loop, filesystem, shell, sandbox, skills, subagents, persistence, and UI can be mounted, replaced, or patched through profiles and bundles. The shipped `web` and `headless` profiles are starting points rather than fixed products.',
          },
          {
            kind: 'steps',
            items: [
              {
                label: 'Local Web UI',
                body: '`npx @deepseek-ai/dsh web` starts a browser workspace on `127.0.0.1:3080` by default. Add a model, choose a workspace, and run tasks from the conversation UI.',
              },
              {
                label: 'Headless mode',
                body: 'The `headless` profile runs one fresh persisted session, prints the final answer, and exits — useful for scripted audits, builds, and repeatable design checks.',
              },
              {
                label: 'Composable runtime',
                body: 'Profiles stack plugin bundles and your own patches. That lets a team change providers, tools, policy, and UI behavior without forking an agent loop.',
              },
            ],
          },
          {
            kind: 'ul',
            items: [
              'Developer: DeepSeek AI (official project)',
              'Status: developer preview; compatibility-breaking changes are expected',
              'License: MIT',
              'Primary command: `npx @deepseek-ai/dsh web`',
            ],
          },
        ],
      },
      {
        id: 'why-design',
        heading: 'Give the agent a design contract',
        blocks: [
          {
            kind: 'p',
            text: 'A model can write JSX, but a useful design agent needs more than model output. It needs brand rules, references, tools, permissions, and a loop that renders and checks the result. DeepSeek Harness exposes those surrounding pieces instead of hiding them.',
          },
          {
            kind: 'steps',
            items: [
              {
                label: 'Persistent design context',
                body: 'The default instruction loader reads `AGENTS.md` and `CLAUDE.md` from the project hierarchy. Put tokens, component rules, responsive breakpoints, and review criteria where every run can see them.',
              },
              {
                label: 'Reusable skills',
                body: 'Local skills can live under `.dsh/skills` or `.agents/skills`. A frontend skill can package the exact brief, checklist, examples, and scripts that stop each UI task from starting at zero.',
              },
              {
                label: 'Provider choice by task',
                body: 'The Web UI can configure DeepSeek, catalog providers such as Anthropic or OpenAI, and custom OpenAI-compatible endpoints. Use a declared image-capable route for screenshot input; use the native DeepSeek route for text, code, DOM, and spec-driven work.',
              },
            ],
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-taste-triangle.webp',
            alt: 'Design system, skill, and reference converging into good design output',
            caption:
              'The harness carries the inputs; taste still comes from a design system, a focused skill, and concrete references.',
          },
          {
            kind: 'p',
            text: 'The important limit is the same for every agent: composability is not taste. Without deliberate typography, spacing, component, and interaction constraints, the runtime will faithfully automate a generic result. Open Design’s role is to supply and organize those design inputs.',
          },
        ],
      },
      {
        id: 'setup',
        heading: 'Build your DeepSeek Harness design workspace',
        blocks: [
          {
            kind: 'p',
            text: 'The public preview requires Node.js `^22.19.0` or `>=24.0.0`. The npm command initializes the web profile on first use, so you can reach a working local UI without cloning the repository.',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: '# 1. Start the official DeepSeek Harness Web UI\n# Requires Node.js ^22.19.0 or >=24.0.0\nnpx @deepseek-ai/dsh web\n\n# 2. Open the local UI (default)\n# http://127.0.0.1:3080\n\n# 3. In Settings → Models, add a DeepSeek API key\n#    or configure another supported provider.\n\n# 4. Choose the project directory as your workspace.\n\n# Optional: run one headless job after the profile is initialized\nnpx @deepseek-ai/dsh --profile headless "Audit this UI against AGENTS.md"',
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-setup-flow.webp',
            alt: 'Five-step setup flow: launch dsh, configure a model, choose a workspace, add design context, and verify output',
            caption:
              'Launch → add a model → choose a workspace → load design rules and skills → verify the rendered result.',
          },
          {
            kind: 'steps',
            items: [
              {
                label: 'Credentials stay referenced',
                body: 'The Web UI stores provider secrets in `$DSH_HOME/.credentials.yaml`; settings keep a credential reference, and the UI receives a redacted descriptor rather than the literal key.',
              },
              {
                label: 'Treat the preview as pinned infrastructure',
                body: 'The maintainers explicitly warn that compatibility-breaking changes will happen. Pin the version for a team workflow and review release changes before updating.',
              },
            ],
          },
        ],
      },
      {
        id: 'design-workflow',
        heading: 'Run the UI build and review loop',
        blocks: [
          {
            kind: 'p',
            text: 'For interface work, make the brief and acceptance loop explicit. The default DeepSeek route is text-only, so the most reliable baseline is a code-and-spec workflow; attach screenshots only after selecting a model route that declares image input.',
          },
          {
            kind: 'ol',
            items: [
              'Start dsh from the repository, choose that directory as the workspace, and select the model route for this task.',
              'Put the brand contract in `AGENTS.md`, `CLAUDE.md`, or a referenced `DESIGN.md`: tokens, primitives, spacing, type, breakpoints, states, and forbidden patterns.',
              'Load a focused frontend skill from `.dsh/skills` or `.agents/skills`; keep examples and validation scripts beside the instructions.',
              'Ask the agent to reuse existing components, run the application, and validate responsive states with the project’s own tests or browser tooling.',
              'Review the visible result, record specific deltas, and iterate in small commits. Revert weak passes instead of layering fixes on a bad base.',
            ],
          },
          {
            kind: 'p',
            text: 'A useful prompt names both the visual constraints and the verification evidence:',
          },
          {
            kind: 'code',
            lang: 'text',
            code: 'Implement the account dashboard in React + TypeScript.\nReuse the components and tokens named in AGENTS.md and DESIGN.md.\nUse a 240px sidebar, a 12-column content grid, and the documented\nmobile navigation pattern. Include loading, empty, error, and focus states.\nRun the app and existing UI checks, inspect desktop and mobile breakpoints,\nand report the exact files and states you verified.',
          },
          {
            kind: 'p',
            text: 'If a screenshot is essential, configure an image-capable provider first. DeepSeek Harness refuses an image before sending when the selected route does not declare image support — a useful guard against silently dropping the reference.',
          },
        ],
      },
      {
        id: 'plugins',
        heading: 'Make the workflow reusable with plugins and skills',
        blocks: [
          {
            kind: 'p',
            text: 'DeepSeek Harness is most differentiated below the chat surface. Its plugin tree lets teams make the design workflow part of the runtime instead of a prompt pasted into every session.',
          },
          {
            kind: 'steps',
            items: [
              {
                label: 'AGENTS.md and CLAUDE.md',
                body: 'The instruction plugin loads the user-global file and the project hierarchy, then notices relevant nested instruction files after first-party file operations. Use it for durable design rules, not one-off requests.',
              },
              {
                label: 'Filesystem skills',
                body: 'The skill registry discovers project and user roots, ranks duplicates, and exposes a model-facing `skill` tool. This is a natural home for frontend craft, accessibility, responsive QA, and design-system procedures.',
              },
              {
                label: 'Profiles and bundles',
                body: 'A profile stacks ordered plugin bundles plus user patches. Teams can maintain a design-focused composition with the provider, tools, permission policy, and skill sources they actually need.',
              },
              {
                label: 'MCP and external capabilities',
                body: 'The source tree includes MCP client capabilities, but user-facing configuration is still developer-oriented. Treat integrations as versioned plugin work during the preview, not a stable checkbox workflow.',
              },
            ],
          },
          {
            kind: 'p',
            text: 'Before building a long-lived internal workflow, inspect the effective tree with `dsh --profile web --dump-config`. That output shows what is actually mounted and patchable; it is more reliable than assuming every package in the repository is active in the shipped profile.',
          },
        ],
      },
      {
        id: 'vs',
        heading: 'When to choose DeepSeek Harness',
        blocks: [
          {
            kind: 'p',
            text: 'The names are easy to conflate. DeepSeek Harness and the DeepSeek TUI currently listed in Open Design are separate projects with different executables and integration status.',
          },
          {
            kind: 'table',
            columns: ['Tool', 'What it is', 'Best design use'],
            rows: [
              [
                'DeepSeek Harness (`dsh`)',
                'Official DeepSeek AI plugin-first harness with local Web UI and headless profiles; developer preview',
                'Teams that want to compose the runtime, skills, providers, policy, and UI around a design workflow',
              ],
              [
                'DeepSeek TUI (`deepseek` / `codewhale`)',
                'A separate terminal coding agent and the DeepSeek adapter Open Design currently supports',
                'Using DeepSeek from inside Open Design today',
              ],
              [
                'OpenCode',
                'Mature open-source, provider-agnostic terminal agent',
                'Switching models inside a stable TUI workflow with AGENTS.md and MCP',
              ],
              [
                'Claude Code',
                'Mature coding agent across terminal, IDE, desktop, and web surfaces',
                'Frontend reasoning, image-heavy references, and established design integrations',
              ],
              [
                'Open Design',
                'Agent-native design workspace and library around supported coding agents',
                'Curated design systems, skills, visual artifacts, and a local workflow independent of one model vendor',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'Choose dsh when the harness itself is what you want to extend. Choose [DeepSeek TUI inside Open Design](/agents/deepseek-design/) when you want the currently supported DeepSeek adapter and a ready design layer. They may converge through a future adapter, but they are not interchangeable today.',
          },
        ],
      },
      {
        id: 'pitfalls',
        heading: 'Avoid the failures that ruin visual output',
        blocks: [
          {
            kind: 'p',
            text: 'The biggest mistakes come from treating a preview like a stable product, treating a text-only route like a vision model, or treating a flexible harness like a source of visual taste.',
          },
          {
            kind: 'steps',
            items: [
              {
                label: 'Pin before you customize',
                body: 'Compatibility-breaking changes are an explicit preview policy. Pin the npm version and keep profile patches small enough to review after an upgrade.',
              },
              {
                label: 'Check the selected model’s modalities',
                body: 'The native DeepSeek chat-completions route is text-only. For screenshot-to-code, select and declare an image-capable provider route instead of assuming the attachment will be understood.',
              },
              {
                label: 'Supply taste as data',
                body: 'Give the agent tokens, canonical components, reference states, and forbidden patterns. A modular runtime without a design contract still produces generic UI.',
              },
              {
                label: 'Verify what the profile actually mounts',
                body: 'Repository packages are capabilities, not proof that the default profile enabled them. Inspect the composed config before documenting an integration or relying on it.',
              },
            ],
          },
          {
            kind: 'p',
            text: 'Each mitigation is a context and verification decision. That is exactly the work a design layer should make repeatable rather than leaving every project to rediscover it.',
          },
        ],
      },
      {
        id: 'open-design',
        heading: 'Add Open Design as the design layer',
        blocks: [
          {
            kind: 'p',
            text: 'Open Design and DeepSeek Harness occupy adjacent layers. dsh composes an agent runtime; Open Design curates the [design systems](/plugins/systems/), [skills](/plugins/skills/), and local artifact workflow that make an agent useful for visual work. Open Design does not yet ship a dedicated `dsh` adapter, so the accurate workflow today is side by side.',
          },
          {
            kind: 'ol',
            items: [
              'Install [Open Design](/download/) and use its design systems and skills to establish the visual contract for the project.',
              'Keep the resulting `DESIGN.md`, references, and project instructions in the same repository DeepSeek Harness opens as its workspace.',
              'Run dsh for plugin-first experiments and code tasks; reuse the same tokens, rules, assets, and validation criteria rather than maintaining a second design brief.',
              'When you need DeepSeek directly inside Open Design today, select the existing [DeepSeek TUI adapter](/agents/deepseek-design/). Treat a future dsh adapter as a separate integration, not as current behavior.',
            ],
          },
          {
            kind: 'p',
            text: 'The result is one owned codebase and one portable design contract across two local-first tools. Open Design remains independent from DeepSeek AI; DeepSeek and DeepSeek Harness are trademarks of their respective owner.',
          },
        ],
      },
    ],
    faqTitle: 'Using DeepSeek Harness for design: FAQ',
    faq: [
      {
        name: 'What is DeepSeek Harness?',
        text: 'DeepSeek Harness (`dsh`) is DeepSeek AI’s official open-source agent harness. It combines models, tools, context, sessions, policy, orchestration, and UI through a Cordis plugin tree. The public release is currently a developer preview under the MIT license.',
      },
      {
        name: 'How do I install and run DeepSeek Harness?',
        text: 'Install a supported Node.js version, then run `npx @deepseek-ai/dsh web`. It starts the local Web UI at `http://127.0.0.1:3080` by default. Add a model under Settings → Models, choose a workspace, and start a session.',
      },
      {
        name: 'Is DeepSeek Harness an official DeepSeek project?',
        text: 'Yes. The repository is published under the `deepseek-ai` GitHub organization and describes dsh as an agent harness developed by DeepSeek AI. It is MIT-licensed and explicitly marked developer preview.',
      },
      {
        name: 'Can DeepSeek Harness build UI from screenshots?',
        text: 'Only when the selected provider route declares image input. DeepSeek’s own chat-completions route in dsh is text-only, and the harness rejects image attachments before sending them on a text-only route. Use an image-capable provider for screenshots, or describe the target through code, DOM, tokens, and written specifications.',
      },
      {
        name: 'Does DeepSeek Harness support AGENTS.md and skills?',
        text: 'Yes. Its instruction plugin loads AGENTS.md and CLAUDE.md-compatible project files. Its filesystem skill provider discovers project skills under `.dsh/skills` and `.agents/skills`, plus configured user and bundled roots.',
      },
      {
        name: 'What is the difference between DeepSeek Harness and DeepSeek TUI?',
        text: 'They are separate tools. DeepSeek Harness uses the `dsh` executable and is an official plugin-first Web UI/headless runtime from DeepSeek AI. DeepSeek TUI uses the `deepseek` or `codewhale` dispatcher and is the separate DeepSeek adapter Open Design currently supports.',
      },
      {
        name: 'Does Open Design support DeepSeek Harness?',
        text: 'Not as a dedicated first-party adapter yet. Open Design currently supports the separate DeepSeek TUI adapter. You can still use Open Design’s design systems, skills, DESIGN.md files, and artifacts alongside dsh in the same local repository.',
      },
      {
        name: 'Where does DeepSeek Harness store my API key?',
        text: 'The official model guide says provider keys are stored in `$DSH_HOME/.credentials.yaml`. Settings keep only a credential reference, and the Web UI receives a redacted descriptor rather than the literal secret.',
      },
    ],
    ctaTitle: 'Build the design layer around your DeepSeek workflow.',
    ctaBody:
      'Use Open Design’s local design systems, skills, and artifact workflow today, and keep the same project contract ready for whichever agent runtime you choose next.',
    ctaActions: OPEN_DESIGN_ACTIONS,
    hubLinkLabel: 'See all supported agents',
  },
  aboutTitle: 'What is DeepSeek Harness?',
  aboutBody: [
    'DeepSeek Harness (`dsh`) is the official open-source agent harness from DeepSeek AI. Its local Web UI and headless runner compose models, tools, sessions, permissions, filesystems, skills, subagents, and UI as Cordis plugins.',
    'The project is MIT-licensed and currently in developer preview. Its maintainers explicitly expect compatibility-breaking changes.',
    'DeepSeek Harness is separate from the DeepSeek TUI adapter that Open Design currently supports.',
  ],
  vendorLabel: 'Developer',
  vendor: 'DeepSeek AI (official)',
  credentialLabel: 'Credential',
  credential: 'DeepSeek API key or another configured provider credential',
  designTitle: 'Using DeepSeek Harness for design',
  designLead: 'The useful design capabilities come from the harness around the model:',
  designPoints: [
    { label: 'Project instructions', body: 'Load brand and component rules from AGENTS.md or CLAUDE.md.' },
    { label: 'Reusable skills', body: 'Package frontend craft and verification under `.dsh/skills` or `.agents/skills`.' },
    { label: 'Provider choice', body: 'Use text-only DeepSeek for code/spec work and an image-capable route for screenshots.' },
    { label: 'Composable profiles', body: 'Build a focused runtime from the tools, policy, and UI plugins the workflow needs.' },
  ],
  linksTitle: 'Official DeepSeek Harness resources',
  linksLead: 'Start with the official repository and its maintained documentation:',
  links: [
    {
      label: 'deepseek-ai/deepseek-harness',
      href: 'https://github.com/deepseek-ai/deepseek-harness',
      source: 'GitHub · DeepSeek AI',
    },
    {
      label: 'DeepSeek Harness Web UI guide',
      href: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md',
      source: 'GitHub · official docs',
    },
    {
      label: 'DeepSeek Harness architecture',
      href: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md',
      source: 'GitHub · official docs',
    },
  ],
  withOdTitle: 'DeepSeek Harness + Open Design',
  withOdLead:
    'Use Open Design as the design-system, skill, and artifact layer alongside dsh. A dedicated DeepSeek Harness adapter is not shipped yet.',
  withOdSteps: [
    'Use Open Design to choose a design system and frontend skill.',
    'Keep DESIGN.md, assets, and project instructions in the repository.',
    'Open the same repository as a DeepSeek Harness workspace.',
    'Use the existing DeepSeek TUI adapter when you need DeepSeek inside Open Design today.',
  ],
  withOdClosing: 'One repository and one portable design contract, without pretending the two runtimes are already integrated.',
  faqTitle: 'FAQ',
  faq: [
    { name: 'Is DeepSeek Harness official?', text: 'Yes. It is developed by DeepSeek AI and published under the MIT license.' },
    { name: 'Is it stable?', text: 'No. It is a developer preview and compatibility-breaking changes are expected.' },
    {
      name: 'Is it supported inside Open Design?',
      text: 'Not through a dedicated dsh adapter yet. Open Design currently supports the separate DeepSeek TUI.',
    },
  ],
  ctaTitle: 'Build the design layer around your DeepSeek workflow.',
  ctaBody: 'Bring the same design systems, skills, and project contract to whichever local agent runtime you use.',
};

export const DEEPSEEK_HARNESS_ZH_GUIDE: AgentGuideCopy = {
  title: '如何用 DeepSeek Harness 做设计 | Open Design',
  description:
    '用 DeepSeek Harness（dsh）设计并构建 UI：配置 Web UI、注入设计契约与 Skill、生成前端代码，并在浏览器中验证结果。',
  breadcrumb: 'DeepSeek Harness',
  label: 'Agent · DeepSeek Harness',
  heading: '用 DeepSeek Harness 做设计。',
  lead:
    '把 DeepSeek Harness 变成一套本地 UI 工作台：加载项目规则与 Skill，选择模型路由，生成界面，再用浏览器完成视觉验收。',
  tldrTitle: '简要结论',
  tldrBody:
    '运行 npx @deepseek-ai/dsh web，添加模型凭证、选择工作区，再通过 AGENTS.md、CLAUDE.md 与 Skill 给 Agent 注入设计规则。DeepSeek 原生路由只支持文本，截图任务需要支持图片的模型供应方。Open Design 目前可在 dsh 旁边提供设计系统与产物层，但尚未发布专用 dsh 适配器。',
  toc: ['DeepSeek Harness 是什么', '为什么适合设计', '配置', '设计工作流', '插件、Skill 与上下文', '对比', '常见坑', '与 Open Design 配合', '常见问题'],
  rich: {
    heroCtaLead:
      '启动 dsh，打开代码仓库，加载设计契约，生成界面，然后在浏览器里验证结果。',
    heroCtaActions: DEEPSEEK_HARNESS_HERO_ACTIONS_ZH,
    intro: [
      '要用 DeepSeek Harness 做设计，关键不是让模型随手写一段 JSX，而是把它放进一套可重复的 UI 流程：模型修改代码，项目文件保存视觉契约，Skill 固化前端工艺，浏览器检查决定结果是否通过。',
      '本文按这条路径从配置讲到视觉验收。插件架构、模型限制和工具对比只在它们会影响实际设计工作时出现，不再喧宾夺主。',
    ],
    heroImage: {
      src: '/agents/deepseek-harness-design/deepseek-harness-design-hero.webp',
      alt: 'DeepSeek Harness 的插件流汇聚到官方 DeepSeek 鱼形标识，再分支进入本地设计工作区',
      caption: 'Harness 是中间层：插件把模型、工具、Skill 与策略组合起来，工作区再把它们变成可见、可审阅的产物。',
    },
    tocLabel: '本页目录',
    toc: [
      { id: 'setup', label: '搭建设计工作台' },
      { id: 'why-design', label: '给 Agent 一份设计契约' },
      { id: 'design-workflow', label: '执行 UI 构建与验收闭环' },
      { id: 'plugins', label: '把工作流固化下来' },
      { id: 'pitfalls', label: '避免低质量视觉输出' },
      { id: 'what-is-deepseek-harness', label: 'Harness 在流程中的作用' },
      { id: 'vs', label: '什么时候选择 DeepSeek Harness' },
      { id: 'open-design', label: '接入 Open Design 设计层' },
      { id: 'faq', label: '常见问题' },
    ],
    sections: [
      {
        id: 'what-is-deepseek-harness',
        heading: 'Harness 在设计流程中负责什么',
        blocks: [
          {
            kind: 'p',
            text: 'DeepSeek Harness（`dsh`）是 [DeepSeek AI 开发、采用 MIT 许可的 Agent Harness](https://github.com/deepseek-ai/deepseek-harness)。公开的开发者预览版提供本地 Web UI 与无头运行器。它不是模型，也不只是终端皮肤；它是把模型、工具、上下文、权限、会话和用户界面组装成 Agent 的运行时。',
          },
          {
            kind: 'p',
            text: '它的核心理念是“万物皆插件”。Cordis 组合出一棵插件树，模型适配器、工具注册表、Agent Loop、文件系统、Shell、沙箱、Skill、子 Agent、持久化与 UI 都可以通过 profile 和 bundle 挂载、替换或打补丁。随项目提供的 `web` 与 `headless` profile 是起点，不是封闭产品。',
          },
          {
            kind: 'steps',
            items: [
              { label: '本地 Web UI', body: '`npx @deepseek-ai/dsh web` 默认在 `127.0.0.1:3080` 启动浏览器工作区。添加模型、选择工作区，即可在对话界面中运行任务。' },
              { label: '无头模式', body: '`headless` profile 会运行一个新的持久化会话、打印最终答案并退出，适合脚本化审计、构建与可重复的设计检查。' },
              { label: '可组合运行时', body: 'Profile 会叠加插件 bundle 与用户 patch，让团队无需 fork Agent Loop 就能更换模型供应方、工具、策略与 UI 行为。' },
            ],
          },
          { kind: 'ul', items: ['开发者：DeepSeek AI（官方项目）', '状态：开发者预览版，预计会有破坏兼容性的改动', '许可：MIT', '主要命令：`npx @deepseek-ai/dsh web`'] },
        ],
      },
      {
        id: 'why-design',
        heading: '给 Agent 一份设计契约',
        blocks: [
          { kind: 'p', text: '模型会写 JSX，但真正好用的设计 Agent 还需要品牌规则、参考、工具、权限，以及渲染和检查结果的闭环。DeepSeek Harness 把这些外围能力暴露出来，而不是藏在固定产品里。' },
          {
            kind: 'steps',
            items: [
              { label: '持久的设计上下文', body: '默认指令加载器会从项目层级读取 `AGENTS.md` 与 `CLAUDE.md`。把 token、组件规则、响应式断点和验收标准放到每次运行都能看到的位置。' },
              { label: '可复用 Skill', body: '本地 Skill 可以放在 `.dsh/skills` 或 `.agents/skills`。一套前端 Skill 能把准确的 brief、清单、示例与脚本打包，避免每个 UI 任务都从零开始。' },
              { label: '按任务选择供应方', body: 'Web UI 可配置 DeepSeek、Anthropic 或 OpenAI 等目录供应方，以及自定义 OpenAI 兼容端点。截图任务选择明确支持图片的路由；DeepSeek 原生路由适合文本、代码、DOM 与规格驱动的工作。' },
            ],
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-taste-triangle.webp',
            alt: '设计系统、Skill 与参考共同汇聚成优质设计产出',
            caption: 'Harness 承载输入；品味仍来自设计系统、聚焦的 Skill 与具体参考。',
          },
          { kind: 'p', text: '最重要的限制与所有 Agent 一样：可组合性不等于品味。没有明确的字体、间距、组件与交互约束，运行时只会忠实地自动化一套通用结果。Open Design 的角色就是提供并组织这些设计输入。' },
        ],
      },
      {
        id: 'setup',
        heading: '搭建 DeepSeek Harness 设计工作台',
        blocks: [
          { kind: 'p', text: '公开预览版要求 Node.js `^22.19.0` 或 `>=24.0.0`。npm 命令会在首次运行时初始化 web profile，因此无需克隆仓库也能打开本地 UI。' },
          {
            kind: 'code',
            lang: 'bash',
            code: '# 1. 启动官方 DeepSeek Harness Web UI\n# 需要 Node.js ^22.19.0 或 >=24.0.0\nnpx @deepseek-ai/dsh web\n\n# 2. 打开本地 UI（默认地址）\n# http://127.0.0.1:3080\n\n# 3. 在 Settings → Models 中添加 DeepSeek API key\n#    或配置其他受支持的模型供应方。\n\n# 4. 把项目目录选为 workspace。\n\n# 可选：Profile 初始化后运行一次无头任务\nnpx @deepseek-ai/dsh --profile headless "Audit this UI against AGENTS.md"',
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-setup-flow.webp',
            alt: '五步配置流程：启动 dsh、配置模型、选择工作区、添加设计上下文并验证输出',
            caption: '启动 → 添加模型 → 选择工作区 → 加载设计规则与 Skill → 验证渲染结果。',
          },
          {
            kind: 'steps',
            items: [
              { label: '凭证只保留引用', body: 'Web UI 将供应方密钥存入 `$DSH_HOME/.credentials.yaml`；设置中只保留凭证引用，UI 收到的是脱敏描述，而不是明文 key。' },
              { label: '把预览版当作需锁版本的基础设施', body: '维护者明确说明会有破坏兼容性的改动。团队工作流应锁定版本，并在升级前审阅发布变化。' },
            ],
          },
        ],
      },
      {
        id: 'design-workflow',
        heading: '执行 UI 构建与验收闭环',
        blocks: [
          { kind: 'p', text: '做界面时，要把 brief 与验收闭环写清楚。DeepSeek 默认路由只支持文本，因此最可靠的基线是代码与规格工作流；只有在选择声明支持图片的模型路由后，才应附加截图。' },
          {
            kind: 'ol',
            items: [
              '从仓库目录启动 dsh，把该目录选为工作区，并为当前任务选择合适的模型路由。',
              '把品牌契约写入 `AGENTS.md`、`CLAUDE.md` 或被引用的 `DESIGN.md`：token、基础组件、间距、字体、断点、状态与禁用模式。',
              '从 `.dsh/skills` 或 `.agents/skills` 加载聚焦的前端 Skill；把示例与验证脚本放在指令旁边。',
              '要求 Agent 复用现有组件、运行应用，并用项目自身的测试或浏览器工具验证响应式状态。',
              '审阅可见结果，记录具体差异，用小步提交迭代。较弱的一轮直接回退，不要在错误基线上继续叠补丁。',
            ],
          },
          { kind: 'p', text: '一条有用的 prompt 需要同时说明视觉约束与验证证据：' },
          {
            kind: 'code',
            lang: 'text',
            code: '用 React + TypeScript 实现账户仪表盘。\n复用 AGENTS.md 与 DESIGN.md 中指定的组件和 token。\n使用 240px 侧栏、12 栏内容网格，以及文档规定的移动端导航。\n包含加载、空态、错误与焦点状态。\n运行应用和现有 UI 检查，审阅桌面与移动断点，\n并报告你实际验证过的文件与状态。',
          },
          { kind: 'p', text: '如果截图不可或缺，先配置支持图片的模型供应方。所选路由未声明图片支持时，DeepSeek Harness 会在发送前拒绝图片，避免参考图被悄悄丢掉。' },
        ],
      },
      {
        id: 'plugins',
        heading: '用插件与 Skill 固化设计工作流',
        blocks: [
          { kind: 'p', text: 'DeepSeek Harness 真正的差异不在聊天界面，而在其下层。插件树让团队可以把设计工作流写进运行时，而不是每个会话都粘贴一次 prompt。' },
          {
            kind: 'steps',
            items: [
              { label: 'AGENTS.md 与 CLAUDE.md', body: '指令插件会加载用户全局文件与项目层级，并在一等文件操作后发现相关的嵌套指令文件。它适合承载长期设计规则，而不是一次性请求。' },
              { label: '文件系统 Skill', body: 'Skill 注册表会发现项目与用户目录、处理同名优先级，并向模型暴露 `skill` 工具。前端工艺、无障碍、响应式 QA 与设计系统流程都适合放在这里。' },
              { label: 'Profile 与 Bundle', body: 'Profile 会叠加有序插件 bundle 和用户 patch。团队可以维护一套设计专用组合，只挂载真正需要的供应方、工具、权限策略和 Skill 来源。' },
              { label: 'MCP 与外部能力', body: '源码包含 MCP 客户端能力，但面向用户的配置仍偏开发者。预览阶段应把集成视为需要锁版本的插件工作，而不是稳定的勾选项。' },
            ],
          },
          { kind: 'p', text: '在搭建长期内部工作流前，用 `dsh --profile web --dump-config` 检查生效的插件树。它展示实际挂载和可 patch 的内容，比假设仓库里的每个 package 都已在默认 profile 中启用更可靠。' },
        ],
      },
      {
        id: 'vs',
        heading: '什么时候选择 DeepSeek Harness',
        blocks: [
          { kind: 'p', text: '这些名称很容易混淆。DeepSeek Harness 与 Open Design 当前列出的 DeepSeek TUI 是两个不同项目，命令和集成状态也不同。' },
          {
            kind: 'table',
            columns: ['工具', '它是什么', '最适合的设计场景'],
            rows: [
              ['DeepSeek Harness（`dsh`）', 'DeepSeek AI 官方的插件优先 Harness，含本地 Web UI 与 headless profile；开发者预览版', '想自行组合运行时、Skill、模型供应方、策略与 UI 的团队'],
              ['DeepSeek TUI（`deepseek` / `codewhale`）', '另一套终端编程 Agent，也是 Open Design 当前支持的 DeepSeek 适配器', '今天就在 Open Design 内使用 DeepSeek'],
              ['OpenCode', '成熟、开源、与模型供应方无关的终端 Agent', '在稳定 TUI 工作流中切换模型，并使用 AGENTS.md 与 MCP'],
              ['Claude Code', '覆盖终端、IDE、桌面与 Web 的成熟编程 Agent', '前端推理、图片密集型参考与成熟设计集成'],
              ['Open Design', '围绕受支持编程 Agent 的 Agent-Native Design Workspace 与资源库', '精选设计系统、Skill、视觉产物，以及不绑定单一模型厂商的本地工作流'],
            ],
          },
          { kind: 'p', text: '当你想扩展 Harness 本身时选择 dsh；当你需要当前已支持的 DeepSeek 适配器与现成设计层时，选择 [Open Design 内的 DeepSeek TUI](/agents/deepseek-design/)。未来两者可能通过新适配器汇合，但今天不能互换。' },
        ],
      },
      {
        id: 'pitfalls',
        heading: '避免毁掉视觉结果的常见问题',
        blocks: [
          { kind: 'p', text: '最大的错误，是把预览版当稳定产品、把纯文本路由当视觉模型，或者把灵活的 Harness 当作视觉品味的来源。' },
          {
            kind: 'steps',
            items: [
              { label: '先锁版本，再定制', body: '破坏兼容性的改动是明确的预览版策略。锁定 npm 版本，并让 profile patch 保持足够小，便于升级后逐项审阅。' },
              { label: '检查所选模型的输入模态', body: 'DeepSeek 原生 chat-completions 路由只支持文本。做截图转代码时，应改用并声明支持图片的模型路由。' },
              { label: '把品味作为数据提供', body: '向 Agent 提供 token、标准组件、参考状态与禁用模式。没有设计契约的模块化运行时，依然会产出通用 UI。' },
              { label: '核实 Profile 真正挂载的能力', body: '仓库中的 package 代表可用能力，不等于默认 profile 已启用。记录或依赖某个集成前，先检查组合后的配置。' },
            ],
          },
          { kind: 'p', text: '每条缓解措施，本质都是在做上下文与验证决策。这正是设计层应该变成可重复流程、而不是让每个项目重新摸索的工作。' },
        ],
      },
      {
        id: 'open-design',
        heading: '把 Open Design 作为设计层接入',
        blocks: [
          { kind: 'p', text: 'Open Design 与 DeepSeek Harness 位于相邻层。dsh 负责组合 Agent 运行时；Open Design 负责策展让 Agent 真正适合视觉工作的[设计系统](/plugins/systems/)、[Skill](/plugins/skills/)与本地产物流程。Open Design 尚未发布专用 `dsh` 适配器，所以今天准确的用法是并行配合。' },
          {
            kind: 'ol',
            items: [
              '安装 [Open Design](/download/)，用其中的设计系统与 Skill 为项目建立视觉契约。',
              '把生成的 `DESIGN.md`、参考与项目指令保存在 DeepSeek Harness 打开的同一个仓库中。',
              '用 dsh 做插件优先实验与代码任务；复用同一套 token、规则、资产与验收标准，不要再维护第二份设计 brief。',
              '如果今天就需要在 Open Design 内直接用 DeepSeek，请选择现有 [DeepSeek TUI 适配器](/agents/deepseek-design/)。把未来 dsh 适配器当成另一项集成，不要误写成现有能力。',
            ],
          },
          { kind: 'p', text: '最终得到的是同一个自有代码库与一份可移植设计契约，横跨两款本地优先工具。Open Design 独立于 DeepSeek AI；DeepSeek 与 DeepSeek Harness 商标归各自权利人所有。' },
        ],
      },
    ],
    faqTitle: '用 DeepSeek Harness 做设计：常见问题',
    faq: [
      { name: 'DeepSeek Harness 是什么？', text: 'DeepSeek Harness（`dsh`）是 DeepSeek AI 官方开源的 Agent Harness。它通过 Cordis 插件树组合模型、工具、上下文、会话、策略、编排与 UI。公开版本目前采用 MIT 许可，仍处于开发者预览阶段。' },
      { name: '如何安装并运行 DeepSeek Harness？', text: '安装受支持的 Node.js 版本，然后运行 `npx @deepseek-ai/dsh web`。默认会在 `http://127.0.0.1:3080` 启动本地 Web UI。进入 Settings → Models 添加模型，选择工作区后即可开始会话。' },
      { name: 'DeepSeek Harness 是 DeepSeek 官方项目吗？', text: '是。仓库发布在 `deepseek-ai` GitHub 组织下，并明确说明 dsh 由 DeepSeek AI 开发。项目采用 MIT 许可，也明确标记为开发者预览版。' },
      { name: 'DeepSeek Harness 能根据截图构建 UI 吗？', text: '只有所选模型路由声明支持图片输入时才可以。dsh 中 DeepSeek 自身的 chat-completions 路由只支持文本；在纯文本路由中，Harness 会在发送前拒绝图片。截图任务请选择支持图片的供应方，或通过代码、DOM、token 与书面规格描述目标。' },
      { name: 'DeepSeek Harness 支持 AGENTS.md 与 Skill 吗？', text: '支持。它的指令插件会加载兼容 AGENTS.md 与 CLAUDE.md 的项目文件；文件系统 Skill 供应方会从 `.dsh/skills`、`.agents/skills` 以及配置的用户与内置目录中发现 Skill。' },
      { name: 'DeepSeek Harness 与 DeepSeek TUI 有什么区别？', text: '它们是不同工具。DeepSeek Harness 使用 `dsh` 命令，是 DeepSeek AI 官方的插件优先 Web UI/headless 运行时。DeepSeek TUI 使用 `deepseek` 或 `codewhale` 调度器，是 Open Design 当前支持的另一套 DeepSeek 适配器。' },
      { name: 'Open Design 支持 DeepSeek Harness 吗？', text: '目前尚未提供专用的一等适配器。Open Design 当前支持另一套 DeepSeek TUI。你仍可让 Open Design 的设计系统、Skill、DESIGN.md 与产物和 dsh 并行使用，并保存在同一个本地仓库里。' },
      { name: 'DeepSeek Harness 把 API key 存在哪里？', text: '官方模型指南说明，供应方 key 存在 `$DSH_HOME/.credentials.yaml`。设置中只保留凭证引用，Web UI 收到的是脱敏描述，不是明文 secret。' },
    ],
    ctaTitle: '为你的 DeepSeek 工作流补上设计层。',
    ctaBody: '今天就使用 Open Design 的本地设计系统、Skill 与产物流程，并让同一份项目契约适配你下一步选择的任何 Agent 运行时。',
    ctaActions: OPEN_DESIGN_ACTIONS_ZH,
    hubLinkLabel: '查看所有受支持的 Agent',
  },
  aboutTitle: '什么是 DeepSeek Harness？',
  aboutBody: [
    'DeepSeek Harness（`dsh`）是 DeepSeek AI 官方开源的 Agent Harness。本地 Web UI 与无头运行器会把模型、工具、会话、权限、文件系统、Skill、子 Agent 与 UI 组合成 Cordis 插件。',
    '项目采用 MIT 许可，目前处于开发者预览阶段。维护者明确说明未来会出现破坏兼容性的改动。',
    'DeepSeek Harness 与 Open Design 当前支持的 DeepSeek TUI 适配器是两个不同项目。',
  ],
  vendorLabel: '开发者',
  vendor: 'DeepSeek AI（官方）',
  credentialLabel: '凭证',
  credential: 'DeepSeek API key 或其他已配置供应方的凭证',
  designTitle: '用 DeepSeek Harness 做设计',
  designLead: '真正有用的设计能力来自模型外围的 Harness：',
  designPoints: [
    { label: '项目指令', body: '从 AGENTS.md 或 CLAUDE.md 加载品牌与组件规则。' },
    { label: '可复用 Skill', body: '把前端工艺与验证流程放进 `.dsh/skills` 或 `.agents/skills`。' },
    { label: '供应方选择', body: '用纯文本 DeepSeek 处理代码与规格，用支持图片的路由处理截图。' },
    { label: '可组合 Profile', body: '只组合工作流真正需要的工具、策略与 UI 插件。' },
  ],
  linksTitle: 'DeepSeek Harness 官方资源',
  linksLead: '从官方仓库与持续维护的文档开始：',
  links: [
    { label: 'deepseek-ai/deepseek-harness', href: 'https://github.com/deepseek-ai/deepseek-harness', source: 'GitHub · DeepSeek AI' },
    { label: 'DeepSeek Harness Web UI 指南', href: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md', source: 'GitHub · 官方文档' },
    { label: 'DeepSeek Harness 架构', href: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md', source: 'GitHub · 官方文档' },
  ],
  withOdTitle: 'DeepSeek Harness + Open Design',
  withOdLead: '把 Open Design 作为 dsh 旁边的设计系统、Skill 与产物层使用。目前尚未发布专用 DeepSeek Harness 适配器。',
  withOdSteps: ['用 Open Design 选择设计系统与前端 Skill。', '把 DESIGN.md、资产与项目指令留在仓库中。', '在 DeepSeek Harness 中打开同一个仓库作为工作区。', '需要今天就在 Open Design 内使用 DeepSeek 时，选择现有 DeepSeek TUI 适配器。'],
  withOdClosing: '同一个仓库与一份可移植设计契约，同时不把尚未存在的集成写成事实。',
  faqTitle: '常见问题',
  faq: [
    { name: 'DeepSeek Harness 是官方项目吗？', text: '是。它由 DeepSeek AI 开发，采用 MIT 许可。' },
    { name: '它稳定吗？', text: '还不稳定。当前是开发者预览版，预计会有破坏兼容性的改动。' },
    { name: 'Open Design 内已经支持它了吗？', text: '尚未提供专用 dsh 适配器。Open Design 当前支持另一套 DeepSeek TUI。' },
  ],
  ctaTitle: '为你的 DeepSeek 工作流补上设计层。',
  ctaBody: '把同一套设计系统、Skill 与项目契约带到你选择的任何本地 Agent 运行时。',
};
