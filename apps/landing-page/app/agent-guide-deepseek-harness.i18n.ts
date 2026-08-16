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
    label: 'Join Open Design Discord',
    href: 'https://discord.gg/mHAjSMV6gz',
    variant: 'ghost' as const,
    external: true,
  },
  {
    label: 'Join the Feishu group',
    href: 'https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=76ao915b-3a37-43dd-ba0e-152ae1aae78d',
    variant: 'ghost' as const,
    external: true,
  },
];

const DEEPSEEK_HARNESS_HERO_ACTIONS_ZH = [
  { label: '下载 Open Design', href: '/download/', variant: 'primary' as const },
  {
    label: '加入 Discord',
    href: 'https://discord.gg/mHAjSMV6gz',
    variant: 'ghost' as const,
    external: true,
  },
  {
    label: '加入飞书群',
    href: 'https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=76ao915b-3a37-43dd-ba0e-152ae1aae78d',
    variant: 'ghost' as const,
    external: true,
  },
];

export const DEEPSEEK_HARNESS_EN_GUIDE: AgentGuideCopy = {
  title: 'How to Use DeepSeek Harness for UI Design | Open Design',
  description:
    'Learn how to use DeepSeek Harness for UI design, then connect dsh to Open Design for design systems, reusable skills, model sync, and local previews.',
  breadcrumb: 'DeepSeek Harness',
  label: 'Agent · DeepSeek Harness',
  heading: 'Design with DeepSeek Harness.',
  lead:
    'DeepSeek Harness can build and edit interfaces in a real repository. Connect dsh to Open Design to guide that work with design systems, reusable skills, and local artifact previews.',
  tldrTitle: 'TL;DR',
  tldrBody:
    'DeepSeek Harness can do design work: it can read project instructions, use frontend skills, edit real UI code, and run checks. The practical path is to connect your dsh installation to Open Design, which adds the design systems, skills, model sync, previews, and review surface around the Harness while keeping credentials and files local.',
  toc: [
    'What is DeepSeek Harness',
    'Why it fits design work',
    'Setup',
    'Design workflow',
    'Plugins, skills, and context',
    'Comparison',
    'Pitfalls',
    'Connect Open Design',
    'FAQ',
  ],
  rich: {
    heroCtaLead:
      'DeepSeek Harness can generate and refine UI. Open Design turns that capability into a repeatable design workflow with visual rules, skills, previews, and review.',
    heroCtaActions: DEEPSEEK_HARNESS_HERO_ACTIONS,
    intro: [
      'DeepSeek Harness, or dsh, can work as a design agent because it combines a model with project instructions, files, shell tools, skills, sessions, and a verification loop. It can turn a written brief into frontend code, iterate on a real interface, and keep the work inside your repository.',
      'The model still needs visual direction. The simplest way to supply it is to connect DeepSeek Harness to Open Design: Open Design provides the design system, frontend skills, artifact preview, and review surface; dsh performs the coding work. This guide covers that workflow from the official [DeepSeek Harness product page](https://www.deepseek.com/harness/) and [source repository](https://github.com/deepseek-ai/deepseek-harness) to a finished interface.',
    ],
    heroImage: {
      src: '/agents/deepseek-harness-design/deepseek-harness-design-dsh-web-ui.webp',
      alt: 'DeepSeek Harness local Web UI running at 127.0.0.1:3080 with a workspace and model selector',
      caption:
        'Do not continue until dsh can start locally and the Web UI can see the model you want to use.',
    },
    tocLabel: 'On this page',
    toc: [
      { id: 'why-design', label: 'Can DeepSeek Harness do design?' },
      { id: 'setup', label: '1. Install and configure DeepSeek Harness' },
      { id: 'open-design', label: '2–5. Connect and use it in Open Design' },
      { id: 'design-workflow', label: 'Run the UI build and review loop' },
      { id: 'plugins', label: 'Make the workflow reusable' },
      { id: 'pitfalls', label: 'Avoid weak visual output' },
      { id: 'what-is-deepseek-harness', label: 'What the harness contributes' },
      { id: 'vs', label: 'DeepSeek Harness vs other agents' },
      { id: 'faq', label: 'FAQ' },
    ],
    sections: [
      {
        id: 'what-is-deepseek-harness',
        heading: 'What the harness contributes to design',
        blocks: [
          {
            kind: 'p',
            text: 'DeepSeek Harness (`dsh`) is an [MIT-licensed agent harness developed by DeepSeek AI](https://github.com/deepseek-ai/deepseek-harness). The [official product page](https://www.deepseek.com/harness/) presents the project; the GitHub repository carries the source, release history, and maintained guides. The public developer preview ships a local Web UI and headless profiles.',
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
        heading: 'Can DeepSeek Harness do design?',
        blocks: [
          {
            kind: 'p',
            text: 'DeepSeek Harness can build landing pages, product interfaces, dashboards, and frontend prototypes because it can read a repository, edit real UI code, run commands, load project instructions, and keep a session across iterations. What it does not supply on its own is visual taste: useful design work still needs brand rules, references, tools, permissions, and a loop that renders and checks the result.',
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
        heading: 'Step 1: Install and configure DeepSeek Harness',
        blocks: [
          {
            kind: 'p',
            text: 'Start by making sure DeepSeek Harness works on its own. Install the tested dsh release, then open its local Web UI to configure the API key and model before opening Open Design. The developer preview requires Node.js `^22.19.0` or `>=24.0.0`.',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: '# Open Design currently tests DeepSeek Harness 0.1.0-rc.6\n# Requires Node.js ^22.19.0 or >=24.0.0\nnpm install -g @deepseek-ai/dsh@0.1.0-rc.6\n\n# Verify the local executable\ndsh --version\n\n# Start the local Web UI and configure a provider and model\ndsh web\n# Open http://127.0.0.1:3080',
          },
          {
            kind: 'steps',
            items: [
              {
                label: 'Open the Harness Web UI',
                body: 'Run `dsh web`. It normally opens `http://127.0.0.1:3080`; if the browser does not open, copy the address printed by the terminal and use that exact address.',
              },
              {
                label: 'Add the DeepSeek API key',
                body: 'Continue past the preview notice, then save or apply the key when prompted. If the prompt does not appear, open Settings → Models → DeepSeek → API Key. Paste only the key — not `DEEPSEEK_API_KEY=...` and not quotes. The change takes effect immediately; you do not need to restart `dsh web`. Create one on the [DeepSeek Platform](https://platform.deepseek.com/api_keys) if needed.',
              },
              {
                label: 'Confirm the model, then close the setup UI',
                body: 'The DeepSeek provider should show as configured and its models should appear in the selector. If you see `MISSING_CREDENTIAL`, reopen the DeepSeek card and save the key again. After a test prompt works, press `Ctrl+C`; `dsh web` does not need to stay open while you use Open Design.',
              },
            ],
          },
          {
            kind: 'p',
            text: 'DeepSeek Harness stores provider credentials as write-only secrets: the UI can report whether a key is configured, but cannot read or display the plaintext key. Open Design reuses this user-installed dsh and its model configuration without copying the key into Open Design. For a dependable workflow, keep dsh pinned to the tested `0.1.0-rc.6` release. See the [official provider guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md) for the upstream credential behavior.',
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
        heading: 'DeepSeek Harness, DeepSeek TUI, and Open Design',
        blocks: [
          {
            kind: 'p',
            text: 'DeepSeek Harness and DeepSeek TUI are separate projects with different executables. Open Design now supports both as local agents, so the choice is about which runtime you want — not whether either can enter the design workspace.',
          },
          {
            kind: 'table',
            columns: ['Tool', 'What it is', 'Best design use'],
            rows: [
              [
                'DeepSeek Harness (`dsh`)',
                'Official DeepSeek AI plugin-first harness with local Web UI and headless profiles; first-party Open Design adapter',
                'Using Harness sessions, providers, and plugin composition inside Open Design’s artifact workflow',
              ],
              [
                'DeepSeek TUI (`deepseek` / `codewhale`)',
                'A separate terminal coding agent with its own Open Design adapter',
                'A terminal-first DeepSeek workflow without the Harness profile architecture',
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
            text: 'Choose DeepSeek Harness when you want its official Web UI, profile system, model catalog, and resumable Harness sessions. Choose [DeepSeek TUI inside Open Design](/agents/deepseek-design/) when you prefer that agent’s terminal-first workflow. They remain distinct runtimes even though Open Design can now wrap either one in the same design process.',
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
        heading: 'Steps 2–5: Connect DeepSeek Harness to Open Design',
        blocks: [
          {
            kind: 'p',
            text: 'Once dsh works locally, the rest happens in Open Design. DeepSeek Harness integration is available in Open Design 0.19.1 and later.',
          },
          {
            kind: 'steps',
            items: [
              {
                label: '2 · Download Open Design 0.19.1 or later',
                body: 'Get the current desktop build from the [Open Design download page](/download/), install it, and launch the app.',
              },
              {
                label: '3 · Detect DeepSeek Harness',
                body: 'Open Settings → Models & providers → Local CLI, then choose Rescan. Restart Open Design or rescan again if it was already open during installation. The DeepSeek Harness card appears when Open Design finds the `dsh` executable from step 1.',
              },
              {
                label: '4 · Connect the Open Design profile',
                body: 'Select the DeepSeek Harness card. If it says “Connection setup required,” confirm “Install and select.” Open Design verifies its own component, asks dsh to install it into the `open-design` profile, rescans, and tests the connection.',
              },
              {
                label: '5 · Start a design task',
                body: 'Confirm the card shows the Harness version and “Synced from CLI,” then click Test. After the test passes, open or create a project, choose DeepSeek Harness and a synced model, and send your design request.',
              },
            ],
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-open-design-settings.webp',
            alt: 'Open Design Models and providers settings showing DeepSeek Harness installed, synced from CLI, and ready to test',
            caption: 'This is the checkpoint: detected Harness version, “Synced from CLI,” and a working Test action.',
          },
          {
            kind: 'p',
            text: 'That completes the connection. The UI and `od agent setup deepseek-harness --json` use the same local setup path; each run starts `dsh --profile open-design --stdio`, while Harness keeps the session identity for later turns.',
          },
          {
            kind: 'code',
            lang: 'text',
            code: 'Create a polished product landing page in this workspace.\nUse DESIGN.md, AGENTS.md, and the installed frontend skill as the visual contract.\nReuse the project tokens and components; include desktop and mobile states.\nRun the app, inspect the rendered result, fix visible spacing and hierarchy issues,\nand leave the final HTML and assets in the project for Open Design to preview.',
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-open-design-workspace.webp',
            alt: 'Open Design workspace showing a DeepSeek Harness task beside a generated branded landing page preview',
            caption: 'DeepSeek Harness edits the real workspace; Open Design keeps the request, progress, preview, and final artifact together.',
          },
          {
            kind: 'p',
            text: 'The boundary stays simple: Harness owns dsh, credentials, models, and sessions; Open Design owns the verified connection profile and design workspace. Open Design is independent from DeepSeek AI, and DeepSeek and DeepSeek Harness are trademarks of their respective owner.',
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
        text: 'Install the tested CLI with `npm install -g @deepseek-ai/dsh@0.1.0-rc.6`, then run `dsh web`. Continue past the preview notice and save only the API key itself under Settings → Models → DeepSeek → API Key. Confirm the provider and model work, stop the Web UI with `Ctrl+C`, install Open Design 0.19.1 or later, rescan Local CLI agents, connect the Harness card, and click Test.',
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
        text: 'Yes. Open Design detects your official dsh installation, installs a verified Open Design-owned profile component after explicit confirmation, syncs the Harness model catalog, and runs DeepSeek Harness as a first-party local agent. Open Design does not install dsh or receive the provider secrets managed by Harness.',
      },
      {
        name: 'Where does DeepSeek Harness store my API key?',
        text: 'Configure the key in DeepSeek Harness, not Open Design. The official model guide says provider keys are stored in `$DSH_HOME/.credentials.yaml` as write-only secrets: the UI can see whether a key is configured but cannot read or display its plaintext value. Open Design does not ask you to paste the key into the app or write it into Open Design configuration.',
      },
    ],
    ctaTitle: 'Design with DeepSeek Harness in Open Design.',
    ctaBody:
      'Install the official dsh runtime, connect it once, then use Open Design’s design systems, skills, synced models, and local artifact previews in one workflow.',
    ctaActions: OPEN_DESIGN_ACTIONS,
    hubLinkLabel: 'See all supported agents',
  },
  aboutTitle: 'What is DeepSeek Harness?',
  aboutBody: [
    'DeepSeek Harness (`dsh`) is the official open-source agent harness from DeepSeek AI. Its local Web UI and headless runner compose models, tools, sessions, permissions, filesystems, skills, subagents, and UI as Cordis plugins.',
    'The project is MIT-licensed and currently in developer preview. Its maintainers explicitly expect compatibility-breaking changes.',
    'Open Design supports DeepSeek Harness and the separate DeepSeek TUI as distinct first-party local agents.',
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
      label: 'DeepSeek Harness official website',
      href: 'https://www.deepseek.com/harness/',
      source: 'Website · DeepSeek AI',
    },
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
    'Open Design treats the user-installed dsh as a first-party local agent and adds a verified connection profile, design systems, skills, and artifact previews around it.',
  withOdSteps: [
    'Install the tested official dsh package and configure a provider model.',
    'Open Settings → Models & providers → Local CLI in Open Design and rescan.',
    'Select DeepSeek Harness and confirm the one-time Open Design profile setup.',
    'Open a project, choose a synced Harness model, and build against DESIGN.md and your selected skills.',
  ],
  withOdClosing: 'One local runtime, one owned repository, and one reviewable design workflow.',
  faqTitle: 'FAQ',
  faq: [
    { name: 'Is DeepSeek Harness official?', text: 'Yes. It is developed by DeepSeek AI and published under the MIT license.' },
    { name: 'Is it stable?', text: 'No. It is a developer preview and compatibility-breaking changes are expected.' },
    {
      name: 'Is it supported inside Open Design?',
      text: 'Yes. Open Design detects the user-installed dsh and adds its own verified profile component after explicit confirmation.',
    },
  ],
  ctaTitle: 'Design with DeepSeek Harness in Open Design.',
  ctaBody: 'Connect the official dsh runtime and keep design systems, skills, models, previews, and files in one local workflow.',
};

export const DEEPSEEK_HARNESS_ZH_GUIDE: AgentGuideCopy = {
  title: 'DeepSeek Harness 怎么做设计？接入 Open Design 教程',
  description:
    '了解如何用 DeepSeek Harness 做 UI 设计，再把 dsh 接入 Open Design，使用设计系统、可复用 Skill、模型同步与本地预览完成界面。',
  breadcrumb: 'DeepSeek Harness',
  label: 'Agent · DeepSeek Harness',
  heading: '用 DeepSeek Harness 做设计。',
  lead:
    'DeepSeek Harness 可以在真实项目中生成并修改界面。把 dsh 接入 Open Design，就能用设计系统、可复用 Skill 与本地产物预览来约束和验收设计结果。',
  tldrTitle: '简要结论',
  tldrBody:
    'DeepSeek Harness 能读取项目指令、调用前端 Skill、修改真实 UI 代码并运行检查。更实用的做法是把你安装的 dsh 接入 Open Design，让 Open Design 在 Harness 外层补上设计系统、Skill、模型同步、预览与审阅界面，同时让凭证和文件继续留在本机。',
  toc: ['DeepSeek Harness 是什么', '为什么适合设计', '安装 dsh', '设计工作流', '插件、Skill 与上下文', '对比', '常见坑', '接入 Open Design', '常见问题'],
  rich: {
    heroCtaLead:
      'DeepSeek Harness 可以生成和迭代 UI；Open Design 再用视觉规则、Skill、预览与审阅，把这种能力变成可重复的设计工作流。',
    heroCtaActions: DEEPSEEK_HARNESS_HERO_ACTIONS_ZH,
    intro: [
      'DeepSeek Harness（dsh）可以成为设计 Agent，因为它把模型与项目指令、文件、Shell 工具、Skill、会话和验证闭环组合在一起。它能把文字需求变成前端代码，在真实界面上持续迭代，并把工作保留在你的仓库里。',
      '模型仍然需要明确的视觉方向。最直接的做法是把 DeepSeek Harness 接入 Open Design：Open Design 提供设计系统、前端 Skill、产物预览与审阅界面，dsh 负责实际编码。本文从 [DeepSeek Harness 官网](https://www.deepseek.com/harness/)与[官方源码仓库](https://github.com/deepseek-ai/deepseek-harness)开始，完整演示从接入到生成界面的流程。',
    ],
    heroImage: {
      src: '/agents/deepseek-harness-design/deepseek-harness-design-dsh-web-ui.webp',
      alt: 'DeepSeek Harness 本地 Web UI 运行在 127.0.0.1:3080，并显示工作区与模型选择器',
      caption: '确认 dsh 能在本机启动，而且 Web UI 已经看到你要使用的模型，再继续下一步。',
    },
    tocLabel: '本页目录',
    toc: [
      { id: 'why-design', label: 'DeepSeek Harness 能做设计吗？' },
      { id: 'setup', label: '1. 安装并配置 DeepSeek Harness' },
      { id: 'open-design', label: '2–5. 接入 Open Design 并开始设计' },
      { id: 'design-workflow', label: '执行 UI 构建与验收闭环' },
      { id: 'plugins', label: '把工作流固化下来' },
      { id: 'pitfalls', label: '避免低质量视觉输出' },
      { id: 'what-is-deepseek-harness', label: 'Harness 在流程中的作用' },
      { id: 'vs', label: 'DeepSeek Harness 与其他 Agent 的区别' },
      { id: 'faq', label: '常见问题' },
    ],
    sections: [
      {
        id: 'what-is-deepseek-harness',
        heading: 'Harness 在设计流程中负责什么',
        blocks: [
          {
            kind: 'p',
            text: 'DeepSeek Harness（`dsh`）是 [DeepSeek AI 开发、采用 MIT 许可的 Agent Harness](https://github.com/deepseek-ai/deepseek-harness)。[官方产品页](https://www.deepseek.com/harness/)用于了解产品，[GitHub 仓库](https://github.com/deepseek-ai/deepseek-harness)提供源码、版本记录与维护中的文档。公开开发者预览版包含本地 Web UI 与 headless profile。',
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
        heading: 'DeepSeek Harness 能做设计吗？',
        blocks: [
          { kind: 'p', text: 'DeepSeek Harness 能读取仓库、修改真实 UI 代码、运行命令、加载项目指令，并在多轮迭代中保留会话，因此可以用来制作落地页、产品界面、仪表盘与前端原型。但它不会凭空提供设计品味：真正好用的设计流程仍然需要品牌规则、参考、工具、权限，以及渲染和检查结果的闭环。' },
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
        heading: '第 1 步：安装并配置 DeepSeek Harness',
        blocks: [
          { kind: 'p', text: '先确保 DeepSeek Harness 可以独立运行。安装经过测试的 dsh 版本，然后打开本地 Web UI，配置好 API Key 与模型，再打开 Open Design。开发者预览版要求 Node.js `^22.19.0` 或 `>=24.0.0`。' },
          {
            kind: 'code',
            lang: 'bash',
            code: '# Open Design 当前完整测试 DeepSeek Harness 0.1.0-rc.6\n# 需要 Node.js ^22.19.0 或 >=24.0.0\nnpm install -g @deepseek-ai/dsh@0.1.0-rc.6\n\n# 验证本地命令\ndsh --version\n\n# 启动本地 Web UI，并配置供应方与模型\ndsh web\n# 打开 http://127.0.0.1:3080',
          },
          {
            kind: 'steps',
            items: [
              { label: '打开 Harness Web UI', body: '运行 `dsh web`。默认会打开 `http://127.0.0.1:3080`；如果浏览器没有自动打开，请复制终端实际打印的地址，并以该地址为准。' },
              { label: '填写 DeepSeek API Key', body: '先通过“内测声明”，再按提示保存或应用 Key。如果没有出现弹窗，请进入“设置 → 模型 → DeepSeek → API 密钥”。只粘贴 Key 本身，不要包含 `DEEPSEEK_API_KEY=...`，也不要加引号。配置会立即生效，无需重启 `dsh web`。没有 Key 时可前往 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys)创建。' },
              { label: '确认模型并关闭配置页面', body: 'DeepSeek 提供方应显示为已配置，相应模型也会出现在选择器中。如果看到 `MISSING_CREDENTIAL`，请重新打开 DeepSeek 卡片并保存 Key。测试请求成功后可按 `Ctrl+C`；日常使用 Open Design 时不需要让 `dsh web` 常驻。' },
            ],
          },
          {
            kind: 'p',
            text: 'DeepSeek Harness 会以只写方式保存供应方凭证：页面可以判断 Key 是否已配置，但无法重新读取或显示明文。Open Design 会复用这套由用户安装的 dsh 与模型配置，不会把 Key 复制进 Open Design。为了稳定使用，建议把 dsh 锁定在已测试的 `0.1.0-rc.6`。凭证行为以[官方供应方配置指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md)为准。',
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
        heading: 'DeepSeek Harness、DeepSeek TUI 与 Open Design',
        blocks: [
          { kind: 'p', text: 'DeepSeek Harness 与 DeepSeek TUI 是两个使用不同命令的独立项目。Open Design 现在同时把两者作为本地 Agent 支持，因此选择依据是你想使用哪套运行时，而不是哪一套能否进入设计工作区。' },
          {
            kind: 'table',
            columns: ['工具', '它是什么', '最适合的设计场景'],
            rows: [
              ['DeepSeek Harness（`dsh`）', 'DeepSeek AI 官方的插件优先 Harness，含本地 Web UI、headless profile 与 Open Design 一等适配器', '在 Open Design 的产物流程中使用 Harness 会话、模型供应方与插件组合'],
              ['DeepSeek TUI（`deepseek` / `codewhale`）', '另一套终端编程 Agent，也有独立的 Open Design 适配器', '不依赖 Harness profile 架构的终端优先 DeepSeek 工作流'],
              ['OpenCode', '成熟、开源、与模型供应方无关的终端 Agent', '在稳定 TUI 工作流中切换模型，并使用 AGENTS.md 与 MCP'],
              ['Claude Code', '覆盖终端、IDE、桌面与 Web 的成熟编程 Agent', '前端推理、图片密集型参考与成熟设计集成'],
              ['Open Design', '围绕受支持编程 Agent 的 Agent-Native Design Workspace 与资源库', '精选设计系统、Skill、视觉产物，以及不绑定单一模型厂商的本地工作流'],
            ],
          },
          { kind: 'p', text: '需要官方 Web UI、Profile 系统、模型目录与可恢复 Harness 会话时选择 DeepSeek Harness；偏好另一套终端优先体验时选择 [Open Design 内的 DeepSeek TUI](/agents/deepseek-design/)。两者仍是独立运行时，但现在都能复用同一套 Open Design 设计流程。' },
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
        heading: '第 2–5 步：把 DeepSeek Harness 接入 Open Design',
        blocks: [
          { kind: 'p', text: 'dsh 在本机正常运行后，剩下的操作都在 Open Design 里完成。DeepSeek Harness 接入能力从 Open Design 0.19.1 开始提供。' },
          {
            kind: 'steps',
            items: [
              { label: '2 · 下载 Open Design 0.19.1 或更高版本', body: '从 [Open Design 下载页](/download/)获取当前桌面版本，完成安装并启动应用。' },
              { label: '3 · 探测 DeepSeek Harness', body: '进入“设置 → 模型与提供商 → 本机 CLI”，点击“重新扫描”。如果安装时 Open Design 已经打开，请重启应用或再次扫描。找到第 1 步安装的 `dsh` 后，就会显示 DeepSeek Harness 卡片。' },
              { label: '4 · 接入 Open Design Profile', body: '选择 DeepSeek Harness 卡片。若显示“需要安装连接组件”，确认“安装并选择”。Open Design 会校验自己的组件，通过 dsh 安装到 `open-design` profile，然后重新扫描并测试连接。' },
              { label: '5 · 开始设计任务', body: '确认卡片显示 Harness 版本和“已从 CLI 同步”，然后点击“测试”。测试通过后，打开或新建项目，选择 DeepSeek Harness 与同步过来的模型，再发送设计需求。' },
            ],
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-open-design-settings.webp',
            alt: 'Open Design 的模型与提供商设置显示 DeepSeek Harness 已安装、已从 CLI 同步并可测试',
            caption: '这里是连接成功的检查点：已识别 Harness 版本、显示“已从 CLI 同步”，并且“测试”可以正常通过。',
          },
          { kind: 'p', text: '到这里接入就完成了。界面与 `od agent setup deepseek-harness --json` 使用同一条本地设置路径；每次运行都会启动 `dsh --profile open-design --stdio`，Harness 会保留会话标识供后续轮次继续使用。' },
          {
            kind: 'code',
            lang: 'text',
            code: '在当前工作区创建一页精致的产品落地页。\n把 DESIGN.md、AGENTS.md 与已安装的前端 Skill 作为视觉契约。\n复用项目中的 token 与组件，同时覆盖桌面端和移动端状态。\n运行应用、检查渲染结果，修复可见的间距与层级问题，\n最后把 HTML 与素材留在项目中，供 Open Design 直接预览。',
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-open-design-workspace.webp',
            alt: 'Open Design 工作区左侧显示 DeepSeek Harness 任务，右侧预览生成的品牌落地页',
            caption: 'DeepSeek Harness 修改真实工作区，Open Design 把需求、进度、预览与最终产物放在一起。',
          },
          { kind: 'p', text: '边界很简单：Harness 管理 dsh、凭证、模型与会话；Open Design 管理经过校验的连接 profile 与设计工作区。Open Design 独立于 DeepSeek AI；DeepSeek 与 DeepSeek Harness 商标归各自权利人所有。' },
        ],
      },
    ],
    faqTitle: '用 DeepSeek Harness 做设计：常见问题',
    faq: [
      { name: 'DeepSeek Harness 是什么？', text: 'DeepSeek Harness（`dsh`）是 DeepSeek AI 官方开源的 Agent Harness。它通过 Cordis 插件树组合模型、工具、上下文、会话、策略、编排与 UI。公开版本目前采用 MIT 许可，仍处于开发者预览阶段。' },
      { name: '如何安装并运行 DeepSeek Harness？', text: '先用 `npm install -g @deepseek-ai/dsh@0.1.0-rc.6` 安装经过测试的 CLI，再运行 `dsh web`。通过“内测声明”后，进入“设置 → 模型 → DeepSeek → API 密钥”，只保存 Key 本身。确认供应方与模型正常后，用 `Ctrl+C` 关闭 Web UI。安装 Open Design 0.19.1 或更高版本，重新扫描本机 CLI Agent，连接 Harness 卡片并点击“测试”。' },
      { name: 'DeepSeek Harness 是 DeepSeek 官方项目吗？', text: '是。仓库发布在 `deepseek-ai` GitHub 组织下，并明确说明 dsh 由 DeepSeek AI 开发。项目采用 MIT 许可，也明确标记为开发者预览版。' },
      { name: 'DeepSeek Harness 能根据截图构建 UI 吗？', text: '只有所选模型路由声明支持图片输入时才可以。dsh 中 DeepSeek 自身的 chat-completions 路由只支持文本；在纯文本路由中，Harness 会在发送前拒绝图片。截图任务请选择支持图片的供应方，或通过代码、DOM、token 与书面规格描述目标。' },
      { name: 'DeepSeek Harness 支持 AGENTS.md 与 Skill 吗？', text: '支持。它的指令插件会加载兼容 AGENTS.md 与 CLAUDE.md 的项目文件；文件系统 Skill 供应方会从 `.dsh/skills`、`.agents/skills` 以及配置的用户与内置目录中发现 Skill。' },
      { name: 'DeepSeek Harness 与 DeepSeek TUI 有什么区别？', text: '它们是不同工具。DeepSeek Harness 使用 `dsh` 命令，是 DeepSeek AI 官方的插件优先 Web UI/headless 运行时。DeepSeek TUI 使用 `deepseek` 或 `codewhale` 调度器，是 Open Design 当前支持的另一套 DeepSeek 适配器。' },
      { name: 'Open Design 支持 DeepSeek Harness 吗？', text: '支持。Open Design 会发现你安装的官方 dsh，在用户明确确认后安装由 Open Design 维护且经过校验的 profile 组件，同步 Harness 模型目录，并把 DeepSeek Harness 作为一等本地 Agent 运行。Open Design 不会安装 dsh，也不会接收 Harness 管理的供应方 secret。' },
      { name: 'DeepSeek Harness 把 API key 存在哪里？', text: '请在 DeepSeek Harness 中配置 Key，而不是在 Open Design 中配置。官方模型指南说明，供应方 Key 以只写 Secret 的方式保存在 `$DSH_HOME/.credentials.yaml`：页面可以知道 Key 是否已配置，但无法读取或显示明文。Open Design 不会要求你把 Key 粘贴到应用内，也不会把 Key 写入 Open Design 配置。' },
    ],
    ctaTitle: '在 Open Design 中使用 DeepSeek Harness 做设计。',
    ctaBody: '安装官方 dsh，一次完成连接，然后在同一流程里使用 Open Design 的设计系统、Skill、同步模型与本地产物预览。',
    ctaActions: OPEN_DESIGN_ACTIONS_ZH,
    hubLinkLabel: '查看所有受支持的 Agent',
  },
  aboutTitle: '什么是 DeepSeek Harness？',
  aboutBody: [
    'DeepSeek Harness（`dsh`）是 DeepSeek AI 官方开源的 Agent Harness。本地 Web UI 与无头运行器会把模型、工具、会话、权限、文件系统、Skill、子 Agent 与 UI 组合成 Cordis 插件。',
    '项目采用 MIT 许可，目前处于开发者预览阶段。维护者明确说明未来会出现破坏兼容性的改动。',
    'Open Design 同时支持 DeepSeek Harness 与独立的 DeepSeek TUI，它们是两套不同的一等本地 Agent。',
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
    { label: 'DeepSeek Harness 官方网站', href: 'https://www.deepseek.com/harness/', source: '官网 · DeepSeek AI' },
    { label: 'deepseek-ai/deepseek-harness', href: 'https://github.com/deepseek-ai/deepseek-harness', source: 'GitHub · DeepSeek AI' },
    { label: 'DeepSeek Harness Web UI 指南', href: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md', source: 'GitHub · 官方文档' },
    { label: 'DeepSeek Harness 架构', href: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md', source: 'GitHub · 官方文档' },
  ],
  withOdTitle: 'DeepSeek Harness + Open Design',
  withOdLead: 'Open Design 会把用户安装的 dsh 识别为一等本地 Agent，并在它外围补上经过校验的连接 profile、设计系统、Skill 与产物预览。',
  withOdSteps: ['安装经过测试的官方 dsh，并在 Harness 中配置供应方模型。', '在 Open Design 打开“设置 → 模型与供应方 → 本地 CLI”，然后重新扫描。', '选择 DeepSeek Harness，并确认一次性的 Open Design profile 设置。', '打开项目，选择同步过来的 Harness 模型，结合 DESIGN.md 与所选 Skill 开始生成设计。'],
  withOdClosing: '一套本地运行时、一个自己掌控的仓库，以及一条可以审查的设计工作流。',
  faqTitle: '常见问题',
  faq: [
    { name: 'DeepSeek Harness 是官方项目吗？', text: '是。它由 DeepSeek AI 开发，采用 MIT 许可。' },
    { name: '它稳定吗？', text: '还不稳定。当前是开发者预览版，预计会有破坏兼容性的改动。' },
    { name: 'Open Design 内已经支持它了吗？', text: '支持。Open Design 会发现用户安装的 dsh，并在用户明确确认后添加自己维护且经过校验的 profile 组件。' },
  ],
  ctaTitle: '在 Open Design 中使用 DeepSeek Harness 做设计。',
  ctaBody: '连接官方 dsh，把设计系统、Skill、模型、预览与文件留在同一条本地工作流中。',
};
