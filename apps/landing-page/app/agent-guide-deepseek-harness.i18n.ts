import type { AgentGuideCopy } from './info-page-i18n';

const OPEN_DESIGN_ACTIONS = [
  { label: 'Use DeepSeek with OpenDesign', href: '/quickstart/', variant: 'primary' as const },
  {
    label: 'Star OpenDesign on GitHub',
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
  { label: '在 OpenDesign 中使用 DeepSeek', href: '/quickstart/', variant: 'primary' as const },
  {
    label: '在 GitHub 上 Star OpenDesign',
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
  { label: 'Download OpenDesign', href: '/download/', variant: 'primary' as const },
  {
    label: 'Join OpenDesign Discord',
    href: 'https://discord.gg/mHAjSMV6gz',
    variant: 'ghost' as const,
    external: true,
  },
];

const DEEPSEEK_HARNESS_HERO_ACTIONS_ZH = [
  { label: '下载 OpenDesign', href: '/download/', variant: 'primary' as const },
  {
    label: '加入 Discord',
    href: 'https://discord.gg/mHAjSMV6gz',
    variant: 'ghost' as const,
    external: true,
  },
];

export const DEEPSEEK_HARNESS_EN_GUIDE: AgentGuideCopy = {
  title: 'How to Design with DeepSeek Harness: the dsh + OpenDesign Workflow | OpenDesign',
  description:
    'DeepSeek Harness can build and edit real interfaces. Connect dsh to OpenDesign to turn it into a complete design workflow: design systems, reusable skills, model sync, and local artifact previews.',
  breadcrumb: 'DeepSeek Harness',
  label: 'Agent · DeepSeek Harness',
  heading: 'Design with DeepSeek Harness.',
  lead:
    'DeepSeek Harness can build and edit interfaces in a real repository. Connect dsh to OpenDesign to guide that work with design systems, reusable skills, and local artifact previews.',
  tldrTitle: 'TL;DR',
  tldrBody:
    'DeepSeek Harness can do design work: it can read project instructions, use frontend skills, edit real UI code, and run checks. The practical path is to connect your dsh installation to OpenDesign, which adds the design systems, skills, model sync, previews, and review surface around the Harness while keeping credentials and files local.',
  toc: [
    'What is DeepSeek Harness',
    'Why it fits design work',
    'Setup',
    'Design workflow',
    'Plugins, skills, and context',
    'Comparison',
    'Pitfalls',
    'Connect OpenDesign',
    'FAQ',
  ],
  rich: {
    heroCtaLead:
      'DeepSeek Harness can generate and refine UI. OpenDesign turns that capability into a repeatable design workflow with visual rules, skills, previews, and review.',
    heroCtaActions: DEEPSEEK_HARNESS_HERO_ACTIONS,
    intro: [
      'DeepSeek Harness, or dsh, can work as a design agent because it combines a model with project instructions, files, shell tools, skills, sessions, and a verification loop. It can turn a written brief into frontend code, iterate on a real interface, and keep the work inside your repository.',
      'The model still needs visual direction. The simplest way to supply it is to connect DeepSeek Harness to OpenDesign: OpenDesign provides the design system, frontend skills, artifact preview, and review surface; dsh performs the coding work. This guide covers that workflow from the official [DeepSeek Harness product page](https://www.deepseek.com/harness/) and [source repository](https://github.com/deepseek-ai/deepseek-harness) to a finished interface.',
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
      { id: 'open-design', label: '2. Download OpenDesign' },
      { id: 'detect-harness', label: '3. Detect DeepSeek Harness' },
      { id: 'connect-profile', label: '4. Connect the OpenDesign profile' },
      { id: 'first-design-task', label: '5. Start a design task' },
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
            text: 'The important limit is the same for every agent: composability is not taste. Without deliberate typography, spacing, component, and interaction constraints, the runtime will faithfully automate a generic result. OpenDesign’s role is to supply and organize those design inputs.',
          },
        ],
      },
      {
        id: 'setup',
        heading: 'Step 1: Install and configure DeepSeek Harness',
        blocks: [
          {
            kind: 'p',
            text: 'You do not need Node.js, pnpm, or dsh preinstalled. Run the one-line installer for your operating system: it installs the DeepSeek Harness toolchain OpenDesign has verified, then opens the API-key setup page. The installer never touches your system Node.js and needs no `sudo` or administrator rights; an existing compatible environment is reused automatically.',
          },
          {
            kind: 'p',
            text: 'macOS / Linux — open Terminal, paste this line, and press Enter (Apple Silicon, Intel Mac, and mainstream x64/arm64 Linux distributions are supported; Alpine Linux is not supported yet):',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: "curl -fsSL 'https://open-design.ai/install-dsh.sh?version=1' | sh",
          },
          {
            kind: 'p',
            text: 'Windows PowerShell — open PowerShell, paste this line, and press Enter:',
          },
          {
            kind: 'code',
            lang: 'powershell',
            code: "& ([scriptblock]::Create((irm 'https://open-design.ai/install-dsh.ps1?version=1')))",
          },
          {
            kind: 'p',
            text: 'Windows CMD — open Command Prompt, paste this line, and press Enter:',
          },
          {
            kind: 'code',
            lang: 'bat',
            code: 'curl -fsSL "https://open-design.ai/install-dsh.cmd?version=1" -o "%TEMP%\\install-dsh.cmd" && call "%TEMP%\\install-dsh.cmd"',
          },
          {
            kind: 'ul',
            items: [
              'Checks for compatible Node.js, pnpm, and DeepSeek Harness versions and reuses them when present — nothing is downloaded twice.',
              'When environments are missing, installs an isolated Node.js and DeepSeek Harness toolchain inside your user directory.',
              'Pins the release OpenDesign has verified, so automatic upgrades cannot break compatibility.',
              'Verifies the SHA-256 of the Node.js download and stops the installation on mismatch.',
              'Creates a `dsh` entry OpenDesign can discover, without overwriting your global Node.js.',
              'Talks only to the OpenDesign install endpoint, nodejs.org, and the npm registry; it uploads no project files or API keys.',
            ],
          },
          {
            kind: 'steps',
            items: [
              {
                label: 'Open the Harness Web UI',
                body: 'The installer runs `dsh web` for you when it finishes. It normally opens `http://127.0.0.1:3080`; if the browser does not open, copy the address printed by the terminal and use that exact address. Whenever you need to reconfigure later, run `dsh web` again.',
              },
              {
                label: 'Add the DeepSeek API key',
                body: 'Continue past the preview notice, then save or apply the key when prompted. If the prompt does not appear, open Settings → Models → DeepSeek → API Key. Paste only the key — not `DEEPSEEK_API_KEY=...` and not quotes. The change takes effect immediately; you do not need to restart `dsh web`. Create one on the [DeepSeek Platform](https://platform.deepseek.com/api_keys) if needed.',
              },
              {
                label: 'Confirm the model, then close the setup UI',
                body: 'The DeepSeek provider should show as configured and its models should appear in the selector. If you see `MISSING_CREDENTIAL`, reopen the DeepSeek card and save the key again. After a test prompt works, press `Ctrl+C`; `dsh web` does not need to stay open while you use OpenDesign.',
              },
            ],
          },
          {
            kind: 'p',
            text: 'DeepSeek Harness stores provider credentials as write-only secrets: the UI can report whether a key is configured, but cannot read or display the plaintext key. OpenDesign reuses this user-installed dsh and its model configuration without copying the key into OpenDesign. The installer already pins the release OpenDesign has verified, so no manual version management is needed. See the [official provider guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md) for the upstream credential behavior.',
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
        heading: 'DeepSeek Harness, DeepSeek TUI, and OpenDesign',
        blocks: [
          {
            kind: 'p',
            text: 'DeepSeek Harness and DeepSeek TUI are separate projects with different executables. OpenDesign now supports both as local agents, so the choice is about which runtime you want — not whether either can enter the design workspace.',
          },
          {
            kind: 'table',
            columns: ['Tool', 'What it is', 'Best design use'],
            rows: [
              [
                'DeepSeek Harness (`dsh`)',
                'Official DeepSeek AI plugin-first harness with local Web UI and headless profiles; first-party OpenDesign adapter',
                'Using Harness sessions, providers, and plugin composition inside OpenDesign’s artifact workflow',
              ],
              [
                'DeepSeek TUI (`deepseek` / `codewhale`)',
                'A separate terminal coding agent with its own OpenDesign adapter',
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
                'OpenDesign',
                'Agent-native design workspace and library around supported coding agents',
                'Curated design systems, skills, visual artifacts, and a local workflow independent of one model vendor',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'Choose DeepSeek Harness when you want its official Web UI, profile system, model catalog, and resumable Harness sessions. Choose [DeepSeek TUI inside OpenDesign](/agents/deepseek-design/) when you prefer that agent’s terminal-first workflow. They remain distinct runtimes even though OpenDesign can now wrap either one in the same design process.',
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
        heading: 'Step 2: Download OpenDesign 0.19.1 or later',
        blocks: [
          {
            kind: 'p',
            text: 'Once dsh works locally, the rest happens in OpenDesign. DeepSeek Harness integration is available in OpenDesign 0.19.1 and later.',
          },
          {
            kind: 'p',
            text: 'Get the current desktop build from the [OpenDesign download page](/download/), install it, and launch the app.',
          },
        ],
      },
      {
        id: 'detect-harness',
        heading: 'Step 3: Detect DeepSeek Harness',
        blocks: [
          {
            kind: 'p',
            text: 'Open Settings → Models & providers → Local CLI, then choose Rescan. Restart OpenDesign or rescan again if it was already open during installation. The DeepSeek Harness card appears when OpenDesign finds the `dsh` executable from step 1.',
          },
        ],
      },
      {
        id: 'connect-profile',
        heading: 'Step 4: Connect the OpenDesign profile',
        blocks: [
          {
            kind: 'p',
            text: 'Select the DeepSeek Harness card. If it says “Connection setup required,” confirm “Install and select.” OpenDesign verifies its own component, asks dsh to install it into the `open-design` profile, rescans, and tests the connection.',
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-open-design-settings.webp',
            alt: 'OpenDesign Models and providers settings showing DeepSeek Harness installed, synced from CLI, and ready to test',
            caption: 'This is the checkpoint: detected Harness version, “Synced from CLI,” and a working Test action.',
          },
          {
            kind: 'p',
            text: 'That completes the connection. The UI and `od agent setup deepseek-harness --json` use the same local setup path; each run starts `dsh --profile open-design --stdio`, while Harness keeps the session identity for later turns.',
          },
        ],
      },
      {
        id: 'first-design-task',
        heading: 'Step 5: Start a design task',
        blocks: [
          {
            kind: 'p',
            text: 'Confirm the card shows the Harness version and “Synced from CLI,” then click Test. After the test passes, open or create a project, choose DeepSeek Harness and a synced model, and send your design request.',
          },
          {
            kind: 'code',
            lang: 'text',
            code: 'Create a polished product landing page in this workspace.\nUse DESIGN.md, AGENTS.md, and the installed frontend skill as the visual contract.\nReuse the project tokens and components; include desktop and mobile states.\nRun the app, inspect the rendered result, fix visible spacing and hierarchy issues,\nand leave the final HTML and assets in the project for OpenDesign to preview.',
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-open-design-workspace.webp',
            alt: 'OpenDesign workspace showing a DeepSeek Harness task beside a generated branded landing page preview',
            caption: 'DeepSeek Harness edits the real workspace; OpenDesign keeps the request, progress, preview, and final artifact together.',
          },
          {
            kind: 'p',
            text: 'The boundary stays simple: Harness owns dsh, credentials, models, and sessions; OpenDesign owns the verified connection profile and design workspace. OpenDesign is independent from DeepSeek AI, and DeepSeek and DeepSeek Harness are trademarks of their respective owner.',
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
        text: "Run the one-line installer for your OS — macOS/Linux: `curl -fsSL 'https://open-design.ai/install-dsh.sh?version=1' | sh` (PowerShell and CMD one-liners are in the setup section above). No preinstalled Node.js, pnpm, or dsh is required, and no `sudo` is needed. The installer opens `dsh web` at the end; continue past the preview notice and save only the API key itself under Settings → Models → DeepSeek → API Key. Confirm the provider and model work, stop the Web UI with `Ctrl+C`, install OpenDesign 0.19.1 or later, rescan Local CLI agents, connect the Harness card, and click Test.",
      },
      {
        name: 'Will the installer overwrite my existing Node.js?',
        text: 'No. When environments are missing it installs an isolated Node.js and DeepSeek Harness toolchain inside your user directory; it does not modify the system Node.js or replace versions other projects use. If you already have compatible Node.js, pnpm, and dsh, the installer detects and reuses them instead of downloading again.',
      },
      {
        name: 'The terminal cannot find dsh after installation — what now?',
        text: 'Open a new terminal window first. OpenDesign scans the common user-level tool directories itself, so you normally do not need to edit PATH; if OpenDesign is already open, go to the Local Agent page and click Rescan. If detection still fails, confirm the installer’s final screen reported DeepSeek Harness as ready, then share that output together with OpenDesign’s test message when asking for support.',
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
        text: 'They are separate tools. DeepSeek Harness uses the `dsh` executable and is an official plugin-first Web UI/headless runtime from DeepSeek AI. DeepSeek TUI uses the `deepseek` or `codewhale` dispatcher and is the separate DeepSeek adapter OpenDesign currently supports.',
      },
      {
        name: 'Does OpenDesign support DeepSeek Harness?',
        text: 'Yes. OpenDesign detects your official dsh installation, installs a verified OpenDesign-owned profile component after explicit confirmation, syncs the Harness model catalog, and runs DeepSeek Harness as a first-party local agent. OpenDesign does not install dsh or receive the provider secrets managed by Harness.',
      },
      {
        name: 'Where does DeepSeek Harness store my API key?',
        text: 'Configure the key in DeepSeek Harness, not OpenDesign. The official model guide says provider keys are stored in `$DSH_HOME/.credentials.yaml` as write-only secrets: the UI can see whether a key is configured but cannot read or display its plaintext value. OpenDesign does not ask you to paste the key into the app or write it into OpenDesign configuration.',
      },
    ],
    ctaTitle: 'Design with DeepSeek Harness in OpenDesign.',
    ctaBody:
      'Install the official dsh runtime, connect it once, then use OpenDesign’s design systems, skills, synced models, and local artifact previews in one workflow.',
    ctaActions: OPEN_DESIGN_ACTIONS,
    hubLinkLabel: 'See all supported agents',
  },
  aboutTitle: 'What is DeepSeek Harness?',
  aboutBody: [
    'DeepSeek Harness (`dsh`) is the official open-source agent harness from DeepSeek AI. Its local Web UI and headless runner compose models, tools, sessions, permissions, filesystems, skills, subagents, and UI as Cordis plugins.',
    'The project is MIT-licensed and currently in developer preview. Its maintainers explicitly expect compatibility-breaking changes.',
    'OpenDesign supports DeepSeek Harness and the separate DeepSeek TUI as distinct first-party local agents.',
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
  withOdTitle: 'DeepSeek Harness + OpenDesign',
  withOdLead:
    'OpenDesign treats the user-installed dsh as a first-party local agent and adds a verified connection profile, design systems, skills, and artifact previews around it.',
  withOdSteps: [
    'Run the one-line installer for your OS and configure a provider model in the Web UI it opens.',
    'Open Settings → Models & providers → Local CLI in OpenDesign and rescan.',
    'Select DeepSeek Harness and confirm the one-time OpenDesign profile setup.',
    'Open a project, choose a synced Harness model, and build against DESIGN.md and your selected skills.',
  ],
  withOdClosing: 'One local runtime, one owned repository, and one reviewable design workflow.',
  faqTitle: 'FAQ',
  faq: [
    { name: 'Is DeepSeek Harness official?', text: 'Yes. It is developed by DeepSeek AI and published under the MIT license.' },
    { name: 'Is it stable?', text: 'No. It is a developer preview and compatibility-breaking changes are expected.' },
    {
      name: 'Is it supported inside OpenDesign?',
      text: 'Yes. OpenDesign detects the user-installed dsh and adds its own verified profile component after explicit confirmation.',
    },
  ],
  ctaTitle: 'Design with DeepSeek Harness in OpenDesign.',
  ctaBody: 'Connect the official dsh runtime and keep design systems, skills, models, previews, and files in one local workflow.',
};

export const DEEPSEEK_HARNESS_ZH_GUIDE: AgentGuideCopy = {
  title: '用 DeepSeek Harness 做设计：dsh + OpenDesign 完整教程 | OpenDesign',
  description:
    'DeepSeek Harness 能在真实项目里生成和修改界面。把 dsh 接入 OpenDesign，获得完整的设计工作流：设计系统、可复用 Skill、模型同步与本地产物预览。',
  breadcrumb: 'DeepSeek Harness',
  label: 'Agent · DeepSeek Harness',
  heading: '用 DeepSeek Harness 做设计。',
  lead:
    'DeepSeek Harness 可以在真实项目中生成并修改界面。把 dsh 接入 OpenDesign，就能用设计系统、可复用 Skill 与本地产物预览来约束和验收设计结果。',
  tldrTitle: '简要结论',
  tldrBody:
    'DeepSeek Harness 能读取项目指令、调用前端 Skill、修改真实 UI 代码并运行检查。更实用的做法是把你安装的 dsh 接入 OpenDesign，让 OpenDesign 在 Harness 外层补上设计系统、Skill、模型同步、预览与审阅界面，同时让凭证和文件继续留在本机。',
  toc: ['DeepSeek Harness 是什么', '为什么适合设计', '安装 dsh', '设计工作流', '插件、Skill 与上下文', '对比', '常见坑', '接入 OpenDesign', '常见问题'],
  rich: {
    heroCtaLead:
      'DeepSeek Harness 可以生成和迭代 UI；OpenDesign 再用视觉规则、Skill、预览与审阅，把这种能力变成可重复的设计工作流。',
    heroCtaActions: DEEPSEEK_HARNESS_HERO_ACTIONS_ZH,
    intro: [
      'DeepSeek Harness（dsh）可以成为设计 Agent，因为它把模型与项目指令、文件、Shell 工具、Skill、会话和验证闭环组合在一起。它能把文字需求变成前端代码，在真实界面上持续迭代，并把工作保留在你的仓库里。',
      '模型仍然需要明确的视觉方向。最直接的做法是把 DeepSeek Harness 接入 OpenDesign：OpenDesign 提供设计系统、前端 Skill、产物预览与审阅界面，dsh 负责实际编码。本文从 [DeepSeek Harness 官网](https://www.deepseek.com/harness/)与[官方源码仓库](https://github.com/deepseek-ai/deepseek-harness)开始，完整演示从接入到生成界面的流程。',
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
      { id: 'open-design', label: '2. 下载 OpenDesign' },
      { id: 'detect-harness', label: '3. 探测 DeepSeek Harness' },
      { id: 'connect-profile', label: '4. 接入 OpenDesign Profile' },
      { id: 'first-design-task', label: '5. 开始设计任务' },
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
          { kind: 'p', text: '最重要的限制与所有 Agent 一样：可组合性不等于品味。没有明确的字体、间距、组件与交互约束，运行时只会忠实地自动化一套通用结果。OpenDesign 的角色就是提供并组织这些设计输入。' },
        ],
      },
      {
        id: 'setup',
        heading: '第 1 步：安装并配置 DeepSeek Harness',
        blocks: [
          { kind: 'p', text: '如果电脑上还没有 Node.js、pnpm 或 `dsh`，无需逐项配置环境：运行对应系统的一行安装命令，即可安装 OpenDesign 当前兼容的 DeepSeek Harness 工具链，并进入 API Key 配置页面。安装过程不会修改系统级 Node.js，也不需要 `sudo` 或管理员权限；已有的兼容环境会被自动复用。' },
          { kind: 'p', text: 'macOS / Linux——打开“终端”，粘贴下面一行并按回车（支持 Apple Silicon、Intel Mac，以及主流 x64/arm64 Linux 发行版；Alpine Linux 暂不支持自动安装）：' },
          {
            kind: 'code',
            lang: 'bash',
            code: "curl -fsSL 'https://open-design.ai/install-dsh.sh?version=1' | sh",
          },
          { kind: 'p', text: 'Windows PowerShell——打开 PowerShell，粘贴下面一行并按回车：' },
          {
            kind: 'code',
            lang: 'powershell',
            code: "& ([scriptblock]::Create((irm 'https://open-design.ai/install-dsh.ps1?version=1')))",
          },
          { kind: 'p', text: 'Windows CMD——打开“命令提示符”，粘贴下面一行并按回车：' },
          {
            kind: 'code',
            lang: 'bat',
            code: 'curl -fsSL "https://open-design.ai/install-dsh.cmd?version=1" -o "%TEMP%\\install-dsh.cmd" && call "%TEMP%\\install-dsh.cmd"',
          },
          {
            kind: 'ul',
            items: [
              '检查电脑上是否已有兼容版本的 Node.js、pnpm 和 DeepSeek Harness；已有环境满足要求时直接复用，不重复下载。',
              '缺少环境时，在当前用户目录中安装隔离的 Node.js 和 DeepSeek Harness 工具链。',
              '固定安装 OpenDesign 已验证的版本，避免自动升级造成兼容问题。',
              '校验从 Node.js 官网下载的安装包 SHA-256，校验失败会停止安装。',
              '为 OpenDesign 创建可发现的 `dsh` 启动入口，但不会覆盖用户已有的全局 Node.js。',
              '安装器只访问 OpenDesign 下载地址、Node.js 官网和 npm registry，不会上传项目文件或 API Key。',
            ],
          },
          {
            kind: 'steps',
            items: [
              { label: '打开 Harness Web UI', body: '安装完成后，安装器会直接运行 `dsh web`。默认会打开 `http://127.0.0.1:3080`；如果浏览器没有自动打开，请复制终端实际打印的地址，并以该地址为准。以后需要重新配置时，在终端再次运行 `dsh web` 即可。' },
              { label: '填写 DeepSeek API Key', body: '先通过“内测声明”，再按提示保存或应用 Key。如果没有出现弹窗，请进入“设置 → 模型 → DeepSeek → API 密钥”。只粘贴 Key 本身，不要包含 `DEEPSEEK_API_KEY=...`，也不要加引号。配置会立即生效，无需重启 `dsh web`。没有 Key 时可前往 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys)创建。' },
              { label: '确认模型并关闭配置页面', body: 'DeepSeek 提供方应显示为已配置，相应模型也会出现在选择器中。如果看到 `MISSING_CREDENTIAL`，请重新打开 DeepSeek 卡片并保存 Key。测试请求成功后可按 `Ctrl+C`；日常使用 OpenDesign 时不需要让 `dsh web` 常驻。' },
            ],
          },
          {
            kind: 'p',
            text: 'DeepSeek Harness 会以只写方式保存供应方凭证：页面可以判断 Key 是否已配置，但无法重新读取或显示明文。OpenDesign 会复用这套由用户安装的 dsh 与模型配置，不会把 Key 复制进 OpenDesign。安装器已固定安装 OpenDesign 验证过的版本，无需手动管理版本。凭证行为以[官方供应方配置指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md)为准。',
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
        heading: 'DeepSeek Harness、DeepSeek TUI 与 OpenDesign',
        blocks: [
          { kind: 'p', text: 'DeepSeek Harness 与 DeepSeek TUI 是两个使用不同命令的独立项目。OpenDesign 现在同时把两者作为本地 Agent 支持，因此选择依据是你想使用哪套运行时，而不是哪一套能否进入设计工作区。' },
          {
            kind: 'table',
            columns: ['工具', '它是什么', '最适合的设计场景'],
            rows: [
              ['DeepSeek Harness（`dsh`）', 'DeepSeek AI 官方的插件优先 Harness，含本地 Web UI、headless profile 与 OpenDesign 一等适配器', '在 OpenDesign 的产物流程中使用 Harness 会话、模型供应方与插件组合'],
              ['DeepSeek TUI（`deepseek` / `codewhale`）', '另一套终端编程 Agent，也有独立的 OpenDesign 适配器', '不依赖 Harness profile 架构的终端优先 DeepSeek 工作流'],
              ['OpenCode', '成熟、开源、与模型供应方无关的终端 Agent', '在稳定 TUI 工作流中切换模型，并使用 AGENTS.md 与 MCP'],
              ['Claude Code', '覆盖终端、IDE、桌面与 Web 的成熟编程 Agent', '前端推理、图片密集型参考与成熟设计集成'],
              ['OpenDesign', '围绕受支持编程 Agent 的 Agent-Native Design Workspace 与资源库', '精选设计系统、Skill、视觉产物，以及不绑定单一模型厂商的本地工作流'],
            ],
          },
          { kind: 'p', text: '需要官方 Web UI、Profile 系统、模型目录与可恢复 Harness 会话时选择 DeepSeek Harness；偏好另一套终端优先体验时选择 [OpenDesign 内的 DeepSeek TUI](/agents/deepseek-design/)。两者仍是独立运行时，但现在都能复用同一套 OpenDesign 设计流程。' },
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
        heading: '第 2 步：下载 OpenDesign 0.19.1 或更高版本',
        blocks: [
          { kind: 'p', text: 'dsh 在本机正常运行后，剩下的操作都在 OpenDesign 里完成。DeepSeek Harness 接入能力从 OpenDesign 0.19.1 开始提供。' },
          { kind: 'p', text: '从 [OpenDesign 下载页](/download/)获取当前桌面版本，完成安装并启动应用。' },
        ],
      },
      {
        id: 'detect-harness',
        heading: '第 3 步：探测 DeepSeek Harness',
        blocks: [
          { kind: 'p', text: '进入“设置 → 模型与提供商 → 本机 CLI”，点击“重新扫描”。如果安装时 OpenDesign 已经打开，请重启应用或再次扫描。找到第 1 步安装的 `dsh` 后，就会显示 DeepSeek Harness 卡片。' },
        ],
      },
      {
        id: 'connect-profile',
        heading: '第 4 步：接入 OpenDesign Profile',
        blocks: [
          { kind: 'p', text: '选择 DeepSeek Harness 卡片。若显示“需要安装连接组件”，确认“安装并选择”。OpenDesign 会校验自己的组件，通过 dsh 安装到 `open-design` profile，然后重新扫描并测试连接。' },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-open-design-settings.webp',
            alt: 'OpenDesign 的模型与提供商设置显示 DeepSeek Harness 已安装、已从 CLI 同步并可测试',
            caption: '这里是连接成功的检查点：已识别 Harness 版本、显示“已从 CLI 同步”，并且“测试”可以正常通过。',
          },
          { kind: 'p', text: '到这里接入就完成了。界面与 `od agent setup deepseek-harness --json` 使用同一条本地设置路径；每次运行都会启动 `dsh --profile open-design --stdio`，Harness 会保留会话标识供后续轮次继续使用。' },
        ],
      },
      {
        id: 'first-design-task',
        heading: '第 5 步：开始设计任务',
        blocks: [
          { kind: 'p', text: '确认卡片显示 Harness 版本和“已从 CLI 同步”，然后点击“测试”。测试通过后，打开或新建项目，选择 DeepSeek Harness 与同步过来的模型，再发送设计需求。' },
          {
            kind: 'code',
            lang: 'text',
            code: '在当前工作区创建一页精致的产品落地页。\n把 DESIGN.md、AGENTS.md 与已安装的前端 Skill 作为视觉契约。\n复用项目中的 token 与组件，同时覆盖桌面端和移动端状态。\n运行应用、检查渲染结果，修复可见的间距与层级问题，\n最后把 HTML 与素材留在项目中，供 OpenDesign 直接预览。',
          },
          {
            kind: 'image',
            src: '/agents/deepseek-harness-design/deepseek-harness-design-open-design-workspace.webp',
            alt: 'OpenDesign 工作区左侧显示 DeepSeek Harness 任务，右侧预览生成的品牌落地页',
            caption: 'DeepSeek Harness 修改真实工作区，OpenDesign 把需求、进度、预览与最终产物放在一起。',
          },
          { kind: 'p', text: '边界很简单：Harness 管理 dsh、凭证、模型与会话；OpenDesign 管理经过校验的连接 profile 与设计工作区。OpenDesign 独立于 DeepSeek AI；DeepSeek 与 DeepSeek Harness 商标归各自权利人所有。' },
        ],
      },
    ],
    faqTitle: '用 DeepSeek Harness 做设计：常见问题',
    faq: [
      { name: 'DeepSeek Harness 是什么？', text: 'DeepSeek Harness（`dsh`）是 DeepSeek AI 官方开源的 Agent Harness。它通过 Cordis 插件树组合模型、工具、上下文、会话、策略、编排与 UI。公开版本目前采用 MIT 许可，仍处于开发者预览阶段。' },
      { name: '如何安装并运行 DeepSeek Harness？', text: "运行对应系统的一行安装命令——macOS/Linux：`curl -fsSL 'https://open-design.ai/install-dsh.sh?version=1' | sh`（PowerShell 与 CMD 的命令见上文安装小节）。不需要预装 Node.js、pnpm 或 dsh，也不需要 `sudo`。安装完成后安装器会直接打开 `dsh web`：通过“内测声明”后，进入“设置 → 模型 → DeepSeek → API 密钥”，只保存 Key 本身。确认供应方与模型正常后，用 `Ctrl+C` 关闭 Web UI。安装 OpenDesign 0.19.1 或更高版本，重新扫描本机 CLI Agent，连接 Harness 卡片并点击“测试”。" },
      { name: '安装器会覆盖我电脑上的 Node.js 吗？', text: '不会。缺少环境时，自动补齐的运行环境安装在当前用户的独立工具链目录，不修改系统 Node.js，也不替换其他项目使用的版本。已经安装过兼容的 Node.js、pnpm 和 dsh 时，安装器会先检测现有版本并直接复用，不会重复安装。' },
      { name: '为什么安装后终端里仍然找不到 dsh？', text: '先重新打开一个终端窗口。OpenDesign 会扫描常见的用户级工具目录，通常不需要手动修改 PATH；如果 OpenDesign 已经打开，请回到“本地 Agent”页面点击“重新扫描”。仍无法识别时，先确认安装命令最后显示 DeepSeek Harness 已就绪，再把安装器最后一屏输出和 OpenDesign 的测试提示一并反馈给支持人员。' },
      { name: 'DeepSeek Harness 是 DeepSeek 官方项目吗？', text: '是。仓库发布在 `deepseek-ai` GitHub 组织下，并明确说明 dsh 由 DeepSeek AI 开发。项目采用 MIT 许可，也明确标记为开发者预览版。' },
      { name: 'DeepSeek Harness 能根据截图构建 UI 吗？', text: '只有所选模型路由声明支持图片输入时才可以。dsh 中 DeepSeek 自身的 chat-completions 路由只支持文本；在纯文本路由中，Harness 会在发送前拒绝图片。截图任务请选择支持图片的供应方，或通过代码、DOM、token 与书面规格描述目标。' },
      { name: 'DeepSeek Harness 支持 AGENTS.md 与 Skill 吗？', text: '支持。它的指令插件会加载兼容 AGENTS.md 与 CLAUDE.md 的项目文件；文件系统 Skill 供应方会从 `.dsh/skills`、`.agents/skills` 以及配置的用户与内置目录中发现 Skill。' },
      { name: 'DeepSeek Harness 与 DeepSeek TUI 有什么区别？', text: '它们是不同工具。DeepSeek Harness 使用 `dsh` 命令，是 DeepSeek AI 官方的插件优先 Web UI/headless 运行时。DeepSeek TUI 使用 `deepseek` 或 `codewhale` 调度器，是 OpenDesign 当前支持的另一套 DeepSeek 适配器。' },
      { name: 'OpenDesign 支持 DeepSeek Harness 吗？', text: '支持。OpenDesign 会发现你安装的官方 dsh，在用户明确确认后安装由 OpenDesign 维护且经过校验的 profile 组件，同步 Harness 模型目录，并把 DeepSeek Harness 作为一等本地 Agent 运行。OpenDesign 不会安装 dsh，也不会接收 Harness 管理的供应方 secret。' },
      { name: 'DeepSeek Harness 把 API key 存在哪里？', text: '请在 DeepSeek Harness 中配置 Key，而不是在 OpenDesign 中配置。官方模型指南说明，供应方 Key 以只写 Secret 的方式保存在 `$DSH_HOME/.credentials.yaml`：页面可以知道 Key 是否已配置，但无法读取或显示明文。OpenDesign 不会要求你把 Key 粘贴到应用内，也不会把 Key 写入 OpenDesign 配置。' },
    ],
    ctaTitle: '在 OpenDesign 中使用 DeepSeek Harness 做设计。',
    ctaBody: '安装官方 dsh，一次完成连接，然后在同一流程里使用 OpenDesign 的设计系统、Skill、同步模型与本地产物预览。',
    ctaActions: OPEN_DESIGN_ACTIONS_ZH,
    hubLinkLabel: '查看所有受支持的 Agent',
  },
  aboutTitle: '什么是 DeepSeek Harness？',
  aboutBody: [
    'DeepSeek Harness（`dsh`）是 DeepSeek AI 官方开源的 Agent Harness。本地 Web UI 与无头运行器会把模型、工具、会话、权限、文件系统、Skill、子 Agent 与 UI 组合成 Cordis 插件。',
    '项目采用 MIT 许可，目前处于开发者预览阶段。维护者明确说明未来会出现破坏兼容性的改动。',
    'OpenDesign 同时支持 DeepSeek Harness 与独立的 DeepSeek TUI，它们是两套不同的一等本地 Agent。',
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
  withOdTitle: 'DeepSeek Harness + OpenDesign',
  withOdLead: 'OpenDesign 会把用户安装的 dsh 识别为一等本地 Agent，并在它外围补上经过校验的连接 profile、设计系统、Skill 与产物预览。',
  withOdSteps: ['运行对应系统的一行安装命令，并在自动打开的 Web UI 中配置供应方模型。', '在 OpenDesign 打开“设置 → 模型与供应方 → 本地 CLI”，然后重新扫描。', '选择 DeepSeek Harness，并确认一次性的 OpenDesign profile 设置。', '打开项目，选择同步过来的 Harness 模型，结合 DESIGN.md 与所选 Skill 开始生成设计。'],
  withOdClosing: '一套本地运行时、一个自己掌控的仓库，以及一条可以审查的设计工作流。',
  faqTitle: '常见问题',
  faq: [
    { name: 'DeepSeek Harness 是官方项目吗？', text: '是。它由 DeepSeek AI 开发，采用 MIT 许可。' },
    { name: '它稳定吗？', text: '还不稳定。当前是开发者预览版，预计会有破坏兼容性的改动。' },
    { name: 'OpenDesign 内已经支持它了吗？', text: '支持。OpenDesign 会发现用户安装的 dsh，并在用户明确确认后添加自己维护且经过校验的 profile 组件。' },
  ],
  ctaTitle: '在 OpenDesign 中使用 DeepSeek Harness 做设计。',
  ctaBody: '连接官方 dsh，把设计系统、Skill、模型、预览与文件留在同一条本地工作流中。',
};
