import {
  DEFAULT_LOCALE,
  getCommonCopy,
  getHomePageCopy,
  getLandingUiCopy,
  type LandingLocaleCode,
} from './i18n';

type LinkText = {
  label: string;
  body: string;
};

type NamedText = {
  name: string;
  text: string;
};

type StepText = NamedText & {
  code: string;
};

type SourceText = {
  label: string;
  name: string;
};

type TierCopy = {
  label: string;
  blurb: string;
};

type ComparisonCopy = {
  competitor: string;
  summary: string;
  cta: string;
};

type FeatureCopy = {
  name: string;
  od: string;
  cd: string;
};

export interface InfoPageCopy {
  common: {
    breadcrumbAria: string;
    onThisPage: string;
    starOnGithub: string;
    downloadDesktop: string;
    joinDiscord: string;
    quickstart: string;
    requestAdapter: string;
    live: string;
    localFirst: string;
    byok: string;
    apache: string;
    macWinLinux: string;
  };
  official: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
    canonicalTitle: string;
    canonicalBody: string;
    sources: [
      SourceText,
      SourceText,
      SourceText,
      SourceText,
      SourceText,
      SourceText,
      SourceText,
      SourceText,
      SourceText,
      SourceText,
    ];
    aliasesTitle: string;
    aliasesLead: string;
    aliases: LinkText[];
    aliasesClosing: string;
    maintainerTitle: string;
    maintainerBody: string;
    runtimeTitle: string;
    runtimeBody: string;
    runtimeItems: LinkText[];
    nextTitle: string;
    nextItems: [LinkText, LinkText, LinkText, LinkText, LinkText];
  };
  quickstart: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
    latestRelease: string;
    requirementsTitle: string;
    requirements: LinkText[];
    commandsTitle: string;
    commandsLead: string;
    steps: StepText[];
    fullNotes: string;
    expectedTitle: string;
    expectedBody: string;
    expectedPorts: string;
    troubleshootingTitle: string;
    troubleshooting: LinkText[];
    nextTitle: string;
    nextItems: [LinkText, LinkText, LinkText, LinkText];
    ctaTitle: string;
    ctaBody: string;
  };
  agents: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: (count: number) => string;
    lead: (count: number) => string;
    adaptersTitle: string;
    adaptersBody: string;
    tiers: [TierCopy, TierCopy, TierCopy];
    vendor: string;
    credential: string;
    byokTitle: string;
    byokLead: string;
    byokItems: string[];
    nextTitle: string;
    nextItems: [LinkText, LinkText, LinkText, LinkText];
    ctaTitle: (count: number) => string;
    ctaBody: string;
  };
  compare: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
    toc: string[];
    comparisons: ComparisonCopy[];
    limitsTitle: string;
    limitsBody: string;
    limitsFaq: NamedText[];
  };
  claudeAlternative: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
    tldrTitle: string;
    tldrBody: string;
    toc: string[];
    whyTitle: string;
    whyLead: string;
    reasons: LinkText[];
    localByokTitle: string;
    localByokBody: string[];
    featureTitle: string;
    features: FeatureCopy[];
    whoTitle: string;
    pickClaudeTitle: string;
    pickClaude: string[];
    pickOpenTitle: string;
    pickOpen: string[];
    migrateTitle: string;
    migrateLead: string;
    migrateSteps: string[];
    migrateClosing: string;
    faqTitle: string;
    faq: NamedText[];
    ctaTitle: string;
    ctaBody: string;
  };
  download: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
    autoCtaPrefix: string; // "Download for" → "Download for macOS"
    autoCtaFallback: string; // shown before JS detects platform
    recommended: string; // "Recommended for your system"
    publishedPrefix: string; // "Released"
    releaseNotes: string;
    platformsTitle: string;
    mac: string;
    macArm: string;
    macIntel: string;
    windows: string;
    windowsInstaller: string;
    windowsPortable: string;
    linux: string;
    linuxBody: string;
    installer: string;
    portable: string;
    dmg: string;
    zip: string;
    checksum: string;
    downloadVerb: string; // "Download"
    requirementsTitle: string;
    requirements: LinkText[];
    allReleasesTitle: string;
    allReleasesBody: string;
    ctaTitle: string;
    ctaBody: string;
  };
}

const QUICKSTART_CODE = {
  install: 'git clone https://github.com/nexu-io/open-design\ncd open-design\npnpm install',
  start: 'pnpm tools-dev',
  first: 'od skill run open-design-landing --output ./artifact.html',
};

const INFO_PAGE_COPY: Partial<Record<LandingLocaleCode, InfoPageCopy>> = {
  en: {
    common: {
      breadcrumbAria: 'Breadcrumb',
      onThisPage: 'On this page:',
      starOnGithub: 'Star on GitHub',
      downloadDesktop: 'Download desktop',
      joinDiscord: 'Join Discord',
      quickstart: 'Quickstart',
      requestAdapter: 'Request an adapter',
      live: 'Live',
      localFirst: 'Local-first',
      byok: 'BYOK',
      apache: 'Apache-2.0',
      macWinLinux: 'macOS · Windows · Linux',
    },
    official: {
      title: 'Official Open Design — Source page, GitHub, releases, and aliases',
      description:
        'Official source page for Open Design (also searched as OpenDesign, open-design, opendesign, Open Design AI, OD). Canonical site, GitHub repository, releases, Discord, license, and maintainer identity in one place.',
      breadcrumb: 'Official',
      label: 'Source · Nº 00',
      heading: 'Official Open Design source page.',
      lead:
        'Open Design (also searched as OpenDesign, open-design, opendesign, or Open Design AI) is the official open-source AI design workspace from the nexu-io/open-design project. This page lists every canonical surface so you can verify the source for yourself.',
      canonicalTitle: 'Canonical surfaces',
      canonicalBody:
        'Bookmark open-design.ai and the GitHub repo. Everything else points back to one of these two.',
      sources: [
        { label: 'Official website', name: 'open-design.ai' },
        { label: 'GitHub repository', name: 'nexu-io/open-design' },
        { label: 'Latest release', name: 'version' },
        { label: 'Issues / discussion', name: 'GitHub issues' },
        { label: 'Community', name: 'Discord' },
        { label: 'Documentation', name: 'GitHub README' },
        { label: 'License', name: 'Apache-2.0' },
        { label: 'Skills catalog', name: '/plugins/skills/' },
        { label: 'Systems catalog', name: '/plugins/systems/' },
        { label: 'Templates catalog', name: '/plugins/templates/' },
      ],
      aliasesTitle: 'Naming & aliases',
      aliasesLead:
        'The project is searched and written several ways depending on the tool, audience, and locale:',
      aliases: [
        { label: 'Open Design', body: 'display name in the product UI, blog, and READMEs.' },
        { label: 'OpenDesign', body: 'common one-word search variant; same project.' },
        { label: 'open-design', body: 'repository / package slug.' },
        { label: 'opendesign', body: 'lowercase alias used in URLs and CLI invocations.' },
        { label: 'Open Design AI', body: 'long-form search variant for AI-design queries.' },
        { label: 'OD', body: 'internal abbreviation for the runtime and CLI bin.' },
      ],
      aliasesClosing: 'All six names refer to this same project. The canonical URL is always open-design.ai.',
      maintainerTitle: 'Maintainer & license',
      maintainerBody:
        'Open Design is developed in the open at github.com/nexu-io/open-design and released under the Apache-2.0 license. Issues, RFCs, and roadmap conversations happen on GitHub Issues and Discord.',
      runtimeTitle: 'What runs on your machine',
      runtimeBody: 'Open Design ships three runnable surfaces — all open source, all local-first:',
      runtimeItems: [
        { label: 'Desktop app', body: 'packaged Electron build for macOS, Windows, Linux.' },
        { label: 'Daemon (od)', body: 'local HTTP daemon and CLI for agents, shell, or CI.' },
        { label: 'Skills + Systems', body: 'Markdown bundles you can fork, edit, and ship.' },
      ],
      nextTitle: 'Where to go next',
      nextItems: [
        { label: 'Quickstart', body: 'install in three commands.' },
        { label: 'Agents', body: 'Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen.' },
        { label: 'Claude Design alternative', body: 'comparison and migration.' },
        { label: 'Skills catalog', body: 'every shippable design skill.' },
        { label: 'Systems catalog', body: 'every portable DESIGN.md brand system.' },
      ],
    },
    quickstart: {
      title: 'Open Design quickstart — Install in three commands (Node 24, pnpm)',
      description:
        'Install Open Design locally with three commands. Requirements (Node 24, pnpm 10.33.2), commands, expected output, troubleshooting, and how to generate your first design artifact with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen.',
      breadcrumb: 'Quickstart',
      label: 'Install · Nº 01',
      heading: 'Open Design quickstart.',
      lead:
        'Open Design runs entirely on your machine. Three commands gets you from a clean checkout to a running daemon, web UI, and your first generated design artifact.',
      latestRelease: 'Latest stable release:',
      requirementsTitle: 'Requirements',
      requirements: [
        { label: 'Node.js 24', body: 'install via your platform package manager or nodejs.org. Node 22 is not supported.' },
        { label: 'pnpm 10.33.2', body: 'enabled through Corepack so the lockfile-pinned version is used.' },
        { label: 'git', body: 'any recent version.' },
        { label: 'An agent', body: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, or Qwen.' },
      ],
      commandsTitle: 'Three commands to ship',
      commandsLead: 'Run these commands from a clean shell:',
      steps: [
        {
          name: 'Clone and install',
          text:
            'Clone the open-design repository and install workspace dependencies with pnpm. Requires Node 24 and pnpm 10.33.2.',
          code: QUICKSTART_CODE.install,
        },
        {
          name: 'Start the daemon and web UI',
          text:
            'Run tools-dev to start the local daemon and web runtime. This is the only lifecycle entry point.',
          code: QUICKSTART_CODE.start,
        },
        {
          name: 'Generate your first artifact',
          text:
            'Open the web UI, pick a skill from the catalog, and let your agent render it. Or drive the daemon directly with the od CLI.',
          code: QUICKSTART_CODE.first,
        },
      ],
      fullNotes: 'Full notes live in QUICKSTART.md.',
      expectedTitle: 'What you should see',
      expectedBody:
        'When pnpm tools-dev is healthy, the terminal reports the daemon, web runtime, and sidecar IPC namespace as ready:',
      expectedPorts:
        'The exact ports come from your tools-dev flags (--daemon-port, --web-port); defaults are stable across runs.',
      troubleshootingTitle: 'Troubleshooting',
      troubleshooting: [
        { label: 'EBADENGINE on pnpm install', body: 'wrong Node major. Switch to Node 24.' },
        { label: 'better-sqlite3 build hangs on Windows', body: 'expected on Node 24; install Visual Studio Build Tools first.' },
        { label: 'Port already in use', body: 'pass --daemon-port and --web-port, or stop the previous run.' },
        { label: 'Agent does not show up', body: 'check /agents/ and your .od/media-config.json credentials.' },
        { label: 'Permission prompt loops', body: 'pnpm tools-dev check verifies the environment and prints missing setup.' },
      ],
      nextTitle: 'Next steps',
      nextItems: [
        { label: 'Browse the skill catalog', body: 'and pick one to render.' },
        { label: 'Pick a DESIGN.md system', body: 'so generated artifacts inherit a brand.' },
        { label: 'Compare Open Design', body: 'with Claude Design, Figma Make, v0, and Lovable.' },
        { label: 'Subscribe to GitHub releases', body: 'for new versions.' },
      ],
      ctaTitle: 'Three commands. Yours to keep.',
      ctaBody:
        'You have the install path. Star the repo, grab the desktop build, or join Discord if anything breaks on first run.',
    },
    agents: {
      title: 'Open Design agents — 17 BYOK adapters',
      description:
        'Open Design ships 17 BYOK adapters out of the box. Drive design from the same agent you use for code — no separate vendor login.',
      breadcrumb: 'Agents',
      label: 'Adapters · Nº 04',
      heading: (count) => `${count} BYOK agents, one skill protocol.`,
      lead: (count) =>
        `Open Design ships ${count} first-party adapters out of the box. The same composable skills and portable DESIGN.md systems work with every one. BYOK throughout — your keys, your spend, your data.`,
      adaptersTitle: 'How adapters plug in',
      adaptersBody:
        'Every adapter is a thin shim between the agent native message format and Open Design skill protocol. Adding a new adapter is a single file — no fork required.',
      tiers: [
        {
          label: 'Tier 1 — first-party tested',
          blurb:
            'Battle-tested daily by the Open Design maintainers. Stream-JSON IPC where supported, full AskUserQuestion mid-turn, skill-aware system prompts.',
        },
        {
          label: 'Tier 2 — supported adapters',
          blurb:
            'Wired through the same skill protocol. Slightly less daily exposure than Tier 1 but still maintained in-tree.',
        },
        {
          label: 'Tier 3 — community / experimental',
          blurb:
            'Newer adapters with narrower coverage. Useful where the vendor offers a workflow Tier 1 does not.',
        },
      ],
      vendor: 'Vendor',
      credential: 'Credential',
      byokTitle: 'What BYOK means here',
      byokLead: 'BYOK ("bring your own key") in Open Design keeps credentials and spend on your side:',
      byokItems: [
        'Credentials live in .od/media-config.json or your shell env.',
        'API calls go from your machine straight to your provider.',
        'Switching providers is a key swap, not a re-onboard.',
        'API spend bills to your account on each provider.',
      ],
      nextTitle: 'Next steps',
      nextItems: [
        { label: 'Quickstart', body: 'install in three commands.' },
        { label: 'Browse the skill catalog', body: 'choose the workflow you want to run.' },
        { label: 'Browse design systems', body: 'pick the brand contract.' },
        { label: 'Claude Design alternative', body: 'full comparison.' },
      ],
      ctaTitle: (count) => `${count} adapters. Your agent.`,
      ctaBody:
        'Pick the agent already on your laptop, point Open Design at it, and start rendering.',
    },
    compare: {
      title: 'Open Design vs Claude Design, Figma Make, v0, Lovable — honest comparison',
      description:
        'Compare Open Design to the major AI design tools. Hosted vs local-first, BYOK vs vendor-locked, single-shot generation vs portable DESIGN.md systems.',
      breadcrumb: 'Compare',
      label: 'Evaluation · Nº 02',
      heading: 'Open Design vs everything else.',
      lead:
        'Short, honest summaries of how Open Design relates to the other AI design tools you might be evaluating.',
      toc: ['vs Claude Design', 'vs Figma Make', 'vs v0', 'vs Lovable / Bolt', 'vs Open CoDesign', 'Honest limits'],
      comparisons: [
        {
          competitor: 'Claude Design',
          summary:
            'Hosted product tied to a single vendor. Open Design is local-first, BYOK, and Apache-2.0 — your skills and DESIGN.md live in your repo.',
          cta: 'Read the full comparison ->',
        },
        {
          competitor: 'Figma Make',
          summary:
            'Figma Make focuses on prompt-to-mockup inside Figma. Open Design ships portable artifacts directly into your project.',
          cta: 'See the repo for migration notes ->',
        },
        {
          competitor: 'v0 by Vercel',
          summary:
            'v0 generates React components on a hosted runtime. Open Design generates decks, dashboards, landing pages, and brand systems locally.',
          cta: 'See the repo for migration notes ->',
        },
        {
          competitor: 'Lovable / Bolt',
          summary:
            'Lovable and Bolt focus on hosted prompt-to-app. Open Design is the design-skill layer for an agent you already use.',
          cta: 'See the repo for migration notes ->',
        },
        {
          competitor: 'Open CoDesign',
          summary:
            'Open CoDesign is a sibling open-source project. Open Design can wrap codesign-style workflows through its skill protocol.',
          cta: 'See the repo for migration notes ->',
        },
      ],
      limitsTitle: "Honest limits — what Open Design isn't",
      limitsBody:
        'Open Design is not trying to be every hosted AI design tool. These questions describe the trade-offs instead of glossing them.',
      limitsFaq: [
        { name: 'Does Open Design offer a hosted web sandbox?', text: 'No. Open Design is local-first by design.' },
        { name: 'Can I use Open Design without installing anything?', text: 'Not today. The minimum is a local daemon plus a coding agent.' },
        { name: 'Is Open Design a v0 / Lovable / Bolt replacement?', text: 'It depends. Open Design focuses on prompt-to-design-artifact via a skill protocol you can fork.' },
        { name: 'Does Open Design send my data to Anthropic, OpenAI, or Google?', text: 'Only your prompt and skill context goes to the provider whose key you brought.' },
        { name: 'Can I self-host Open Design on my own infrastructure?', text: 'Yes. Apache-2.0 license, Node 24 daemon, no required SaaS.' },
      ],
    },
    claudeAlternative: {
      title: 'Open-source Claude Design alternative — Open Design (BYOK, local-first)',
      description:
        'Open Design is the open-source, local-first alternative to Claude Design. BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen.',
      breadcrumb: 'Open-source Claude Design alternative',
      label: 'Alternative · Nº 03',
      heading: 'Open-source Claude Design alternative.',
      lead:
        'Open Design is the official open-source, local-first alternative to Claude Design. BYOK with the agent you already use, keep your brand as a portable DESIGN.md file, and ship artifacts as files in your project.',
      tldrTitle: 'TL;DR',
      tldrBody:
        'Same use case, different posture: local-first, BYOK, open source (Apache-2.0), with portable DESIGN.md systems and composable SKILL.md skills.',
      toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
      whyTitle: 'Why people search for a Claude Design alternative',
      whyLead: 'Five reasons keep showing up in support threads, GitHub discussions, and Discord:',
      reasons: [
        { label: 'Data ownership.', body: 'Designs should live as files in a repo, not documents in a vendor DB.' },
        { label: 'BYOK economics.', body: 'Bring your own provider key; API spend bills to your account.' },
        { label: 'Agent choice.', body: 'Drive design from the agent you already use for code.' },
        { label: 'Brand portability.', body: 'One DESIGN.md file encodes a brand for every skill.' },
        { label: 'Self-host / fork.', body: 'Apache-2.0, full source, rebrandable for your studio or company.' },
      ],
      localByokTitle: 'Local-first + BYOK, explained',
      localByokBody: [
        'Open Design runs a desktop app, a local daemon, and Markdown skill/system catalogs on your machine.',
        'No design output is forced through a vendor cloud. Credentials stay in local config or environment variables.',
      ],
      featureTitle: 'Feature comparison',
      features: [
        { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Closed-source, hosted product' },
        { name: 'Runtime', od: 'Local daemon on your machine', cd: 'Vendor cloud' },
        { name: 'Agent', od: 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', cd: 'Vendor-managed agent' },
        { name: 'API spend', od: 'Bills to your account', cd: 'Bundled into vendor subscription' },
        { name: 'Design system', od: 'Portable DESIGN.md in your repo', cd: 'Stored in vendor DB' },
        { name: 'Skills', od: 'Composable SKILL.md you can fork', cd: 'Built-in templates' },
        { name: 'Self-host', od: 'Yes, run anywhere Node 24 runs', cd: 'No' },
        { name: 'Pricing', od: 'Free product; you pay agent API costs', cd: 'Vendor subscription' },
        { name: 'CLI / CI', od: 'Yes via od CLI + HTTP daemon', cd: 'Web UI only' },
        { name: 'Artifact ownership', od: 'Files in your project directory', cd: 'Vendor-hosted documents' },
      ],
      whoTitle: 'Who should pick which',
      pickClaudeTitle: 'Pick Claude Design if',
      pickClaude: [
        'You want zero local setup and one vendor bill.',
        'You are already deep in a Claude-first workflow.',
        'Your team prefers a hosted UI over Markdown files.',
      ],
      pickOpenTitle: 'Pick Open Design if',
      pickOpen: [
        'You want design artifacts as version-controlled files.',
        'You want BYOK with your existing coding agent.',
        'You want to fork, rebrand, embed in CLI, or self-host.',
        'You want one DESIGN.md per brand that every skill respects.',
      ],
      migrateTitle: 'Migration / first run',
      migrateLead: 'There is no automatic import from Claude Design today; use a one-time brand-extraction run:',
      migrateSteps: [
        'Install Open Design from the quickstart.',
        'Open the web UI and point your agent at a Claude Design artifact you like.',
        'Ask the agent to extract the brand into a DESIGN.md file.',
        'Pick a skill and render it against your new brand.',
      ],
      migrateClosing:
        'From then on, every skill renders in your brand without re-prompting.',
      faqTitle: 'FAQ',
      faq: [
        { name: 'Is Open Design really a drop-in alternative to Claude Design?', text: 'Not literally, but they overlap on prompt-to-design-artifact use cases.' },
        { name: 'Can I use Claude as my agent in Open Design?', text: 'Yes. Open Design supports Claude Code and Anthropic API BYOK flows.' },
        { name: 'What happens to my Claude Design designs?', text: 'You can keep using Claude Design alongside Open Design; migration is manual today.' },
        { name: 'Does Open Design generate the same artifact types?', text: 'Yes for common types: landing pages, decks, dashboards, social posts, brand systems, and prototypes.' },
        { name: 'Why "open-source Claude Design" vs "open-source AI design tool"?', text: 'That is how many users describe the product shape they are searching for.' },
        { name: 'Who builds and maintains Open Design?', text: 'The project lives at github.com/nexu-io/open-design and is Apache-2.0.' },
      ],
      ctaTitle: 'Switch in three commands.',
      ctaBody:
        'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
    },
    download: {
      title: 'Download Open Design — desktop app for macOS, Windows & Linux',
      description:
        'Download the latest Open Design desktop build. Install and create — sign in once, pick a model, start designing. macOS (Apple Silicon & Intel), Windows, and Linux.',
      breadcrumb: 'Download',
      label: 'Download',
      heading: 'Download Open Design.',
      lead:
        'Install and create — no API key, no setup. The desktop app ships with the official model router; sign in once and start designing.',
      autoCtaPrefix: 'Download for',
      autoCtaFallback: 'Download Open Design',
      recommended: 'Recommended',
      publishedPrefix: 'Released',
      releaseNotes: 'Release notes',
      platformsTitle: 'All platforms',
      mac: 'macOS',
      macArm: 'Apple Silicon',
      macIntel: 'Intel',
      windows: 'Windows',
      windowsInstaller: 'Installer',
      windowsPortable: 'Portable',
      linux: 'Linux',
      linuxBody: 'AppImage and Docker / Podman Compose are available on the release page.',
      installer: 'Installer',
      portable: 'Portable',
      dmg: 'DMG',
      zip: 'ZIP',
      checksum: 'SHA-256',
      downloadVerb: 'Download',
      requirementsTitle: 'System requirements',
      requirements: [
        { label: 'macOS', body: '11 Big Sur or newer — Apple Silicon and Intel builds.' },
        { label: 'Windows', body: '10 or 11 (x64) — installer or portable zip.' },
        { label: 'Linux', body: 'AppImage, or Docker / Podman Compose one-click setup.' },
      ],
      allReleasesTitle: 'All releases & checksums',
      allReleasesBody:
        'Every build, checksum, and past version lives on GitHub Releases and releases.open-design.ai.',
      ctaTitle: 'Prefer the terminal?',
      ctaBody:
        'Install from source in three commands, or drive Open Design headlessly from your existing coding agent.',
    },
  },
};

/*
 * Localized /download copy for the compact locales (everything outside the
 * full en/zh/zh-tw blocks above). Brand/technical tokens — mac/windows/linux,
 * DMG/ZIP, SHA-256, Apple Silicon, Intel — intentionally stay as the English
 * defaults via the spread, matching how the zh block keeps them. zh-CN is
 * hand-checked; the rest are machine-translated and welcome native review.
 */
type DownloadCopy = InfoPageCopy['download'];
const COMPACT_DOWNLOAD_COPY: Partial<Record<LandingLocaleCode, DownloadCopy>> = {
  ja: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Open Design をダウンロード — macOS / Windows / Linux デスクトップアプリ',
    description:
      '最新の Open Design デスクトップ版をダウンロード。入れたらすぐ作れます——一度サインインし、モデルを選んで、デザインを開始。macOS（Apple Silicon と Intel）、Windows、Linux に対応。',
    breadcrumb: 'ダウンロード',
    label: 'ダウンロード',
    heading: 'Open Design をダウンロード。',
    lead:
      '入れたらすぐ作れます——API キー不要、設定不要。デスクトップ版は公式モデルルーター内蔵。一度サインインすればデザインを始められます。',
    autoCtaPrefix: 'ダウンロード:',
    autoCtaFallback: 'Open Design をダウンロード',
    recommended: 'おすすめ',
    publishedPrefix: '公開日',
    releaseNotes: 'リリースノート',
    platformsTitle: 'すべてのプラットフォーム',
    windowsInstaller: 'インストーラー',
    windowsPortable: 'ポータブル',
    linuxBody: 'AppImage と Docker / Podman Compose はリリースページから利用できます。',
    installer: 'インストーラー',
    portable: 'ポータブル',
    downloadVerb: 'ダウンロード',
    requirementsTitle: 'システム要件',
    requirements: [
      { label: 'macOS', body: '11 Big Sur 以降 — Apple Silicon と Intel に対応。' },
      { label: 'Windows', body: '10 または 11（x64）— インストーラーまたはポータブル zip。' },
      { label: 'Linux', body: 'AppImage、または Docker / Podman Compose のワンクリック構築。' },
    ],
    allReleasesTitle: 'すべてのリリースとチェックサム',
    allReleasesBody:
      'すべてのビルド、チェックサム、過去のバージョンは GitHub Releases と releases.open-design.ai にあります。',
    ctaTitle: 'ターミナル派ですか？',
    ctaBody:
      '3 つのコマンドでソースからインストール、または既存のコーディングエージェントから Open Design をヘッドレスで動かせます。',
  },
  ko: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Open Design 다운로드 — macOS / Windows / Linux 데스크톱 앱',
    description:
      '최신 Open Design 데스크톱 빌드를 다운로드하세요. 설치하면 바로 제작——한 번 로그인하고 모델을 고른 뒤 디자인을 시작하세요. macOS(Apple Silicon 및 Intel), Windows, Linux 지원.',
    breadcrumb: '다운로드',
    label: '다운로드',
    heading: 'Open Design 다운로드.',
    lead:
      '설치하면 바로 제작——API 키도, 설정도 필요 없습니다. 데스크톱 앱에는 공식 모델 라우터가 내장되어 있어 한 번 로그인하면 바로 디자인할 수 있습니다.',
    autoCtaPrefix: '다운로드 대상:',
    autoCtaFallback: 'Open Design 다운로드',
    recommended: '추천',
    publishedPrefix: '출시일',
    releaseNotes: '릴리스 노트',
    platformsTitle: '모든 플랫폼',
    windowsInstaller: '설치 버전',
    windowsPortable: '포터블',
    linuxBody: 'AppImage 및 Docker / Podman Compose는 릴리스 페이지에서 받을 수 있습니다.',
    installer: '설치 버전',
    portable: '포터블',
    downloadVerb: '다운로드',
    requirementsTitle: '시스템 요구 사항',
    requirements: [
      { label: 'macOS', body: '11 Big Sur 이상 — Apple Silicon 및 Intel 빌드.' },
      { label: 'Windows', body: '10 또는 11(x64) — 설치 버전 또는 포터블 zip.' },
      { label: 'Linux', body: 'AppImage, 또는 Docker / Podman Compose 원클릭 설치.' },
    ],
    allReleasesTitle: '모든 릴리스 및 체크섬',
    allReleasesBody:
      '모든 빌드, 체크섬, 이전 버전은 GitHub Releases와 releases.open-design.ai에 있습니다.',
    ctaTitle: '터미널이 더 편하세요?',
    ctaBody:
      '세 개의 명령으로 소스에서 설치하거나, 기존 코딩 에이전트에서 Open Design을 헤드리스로 구동하세요.',
  },
  de: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Open Design herunterladen — Desktop-App für macOS, Windows & Linux',
    description:
      'Lade den neuesten Open-Design-Desktop-Build herunter. Installieren und loslegen — einmal anmelden, Modell wählen, designen. macOS (Apple Silicon & Intel), Windows und Linux.',
    breadcrumb: 'Download',
    label: 'Download',
    heading: 'Open Design herunterladen.',
    lead:
      'Installieren und loslegen — kein API-Schlüssel, keine Einrichtung. Die Desktop-App bringt den offiziellen Model-Router mit; einmal anmelden und designen.',
    autoCtaPrefix: 'Download für',
    autoCtaFallback: 'Open Design herunterladen',
    recommended: 'Empfohlen',
    publishedPrefix: 'Veröffentlicht',
    releaseNotes: 'Release Notes',
    platformsTitle: 'Alle Plattformen',
    windowsInstaller: 'Installer',
    windowsPortable: 'Portable',
    linuxBody: 'AppImage sowie Docker / Podman Compose stehen auf der Release-Seite bereit.',
    installer: 'Installer',
    portable: 'Portable',
    downloadVerb: 'Herunterladen',
    requirementsTitle: 'Systemanforderungen',
    requirements: [
      { label: 'macOS', body: '11 Big Sur oder neuer — Builds für Apple Silicon und Intel.' },
      { label: 'Windows', body: '10 oder 11 (x64) — Installer oder portables ZIP.' },
      { label: 'Linux', body: 'AppImage oder Docker / Podman Compose mit Ein-Klick-Setup.' },
    ],
    allReleasesTitle: 'Alle Releases & Prüfsummen',
    allReleasesBody:
      'Jeder Build, jede Prüfsumme und alle früheren Versionen liegen auf GitHub Releases und releases.open-design.ai.',
    ctaTitle: 'Lieber das Terminal?',
    ctaBody:
      'Installiere aus dem Quellcode mit drei Befehlen oder steuere Open Design headless aus deinem bestehenden Coding-Agent.',
  },
  fr: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Télécharger Open Design — application de bureau pour macOS, Windows et Linux',
    description:
      'Téléchargez la dernière version bureau d’Open Design. Installez et créez — connectez-vous une fois, choisissez un modèle, commencez à concevoir. macOS (Apple Silicon et Intel), Windows et Linux.',
    breadcrumb: 'Télécharger',
    label: 'Télécharger',
    heading: 'Télécharger Open Design.',
    lead:
      'Installez et créez — sans clé API, sans configuration. L’application de bureau intègre le routeur de modèles officiel ; connectez-vous une fois et commencez à concevoir.',
    autoCtaPrefix: 'Télécharger pour',
    autoCtaFallback: 'Télécharger Open Design',
    recommended: 'Recommandé',
    publishedPrefix: 'Publié le',
    releaseNotes: 'Notes de version',
    platformsTitle: 'Toutes les plateformes',
    windowsInstaller: 'Installateur',
    windowsPortable: 'Portable',
    linuxBody: 'AppImage ainsi que Docker / Podman Compose sont disponibles sur la page de release.',
    installer: 'Installateur',
    portable: 'Portable',
    downloadVerb: 'Télécharger',
    requirementsTitle: 'Configuration requise',
    requirements: [
      { label: 'macOS', body: '11 Big Sur ou plus récent — builds Apple Silicon et Intel.' },
      { label: 'Windows', body: '10 ou 11 (x64) — installateur ou zip portable.' },
      { label: 'Linux', body: 'AppImage, ou installation en un clic via Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Toutes les versions et sommes de contrôle',
    allReleasesBody:
      'Chaque build, somme de contrôle et version passée se trouve sur GitHub Releases et releases.open-design.ai.',
    ctaTitle: 'Vous préférez le terminal ?',
    ctaBody:
      'Installez depuis les sources en trois commandes, ou pilotez Open Design en mode headless depuis votre agent de code existant.',
  },
  ru: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Скачать Open Design — десктопное приложение для macOS, Windows и Linux',
    description:
      'Скачайте последнюю десктопную сборку Open Design. Установите и создавайте — войдите один раз, выберите модель, начните проектировать. macOS (Apple Silicon и Intel), Windows и Linux.',
    breadcrumb: 'Скачать',
    label: 'Скачать',
    heading: 'Скачать Open Design.',
    lead:
      'Установите и создавайте — без API-ключа и настройки. Десктопное приложение поставляется с официальным маршрутизатором моделей; войдите один раз и начинайте проектировать.',
    autoCtaPrefix: 'Скачать для',
    autoCtaFallback: 'Скачать Open Design',
    recommended: 'Рекомендуется',
    publishedPrefix: 'Выпущено',
    releaseNotes: 'Примечания к выпуску',
    platformsTitle: 'Все платформы',
    windowsInstaller: 'Установщик',
    windowsPortable: 'Портативная версия',
    linuxBody: 'AppImage, а также Docker / Podman Compose доступны на странице релиза.',
    installer: 'Установщик',
    portable: 'Портативная версия',
    downloadVerb: 'Скачать',
    requirementsTitle: 'Системные требования',
    requirements: [
      { label: 'macOS', body: '11 Big Sur или новее — сборки для Apple Silicon и Intel.' },
      { label: 'Windows', body: '10 или 11 (x64) — установщик или портативный zip.' },
      { label: 'Linux', body: 'AppImage или установка в один клик через Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Все релизы и контрольные суммы',
    allReleasesBody:
      'Каждая сборка, контрольная сумма и прошлые версии — на GitHub Releases и releases.open-design.ai.',
    ctaTitle: 'Предпочитаете терминал?',
    ctaBody:
      'Установите из исходников тремя командами или управляйте Open Design в headless-режиме из вашего существующего агента для кода.',
  },
  es: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Descargar Open Design — app de escritorio para macOS, Windows y Linux',
    description:
      'Descarga la última versión de escritorio de Open Design. Instala y crea: inicia sesión una vez, elige un modelo y empieza a diseñar. macOS (Apple Silicon e Intel), Windows y Linux.',
    breadcrumb: 'Descargar',
    label: 'Descargar',
    heading: 'Descargar Open Design.',
    lead:
      'Instala y crea: sin clave de API, sin configuración. La app de escritorio incluye el enrutador de modelos oficial; inicia sesión una vez y empieza a diseñar.',
    autoCtaPrefix: 'Descargar para',
    autoCtaFallback: 'Descargar Open Design',
    recommended: 'Recomendado',
    publishedPrefix: 'Publicado',
    releaseNotes: 'Notas de la versión',
    platformsTitle: 'Todas las plataformas',
    windowsInstaller: 'Instalador',
    windowsPortable: 'Portable',
    linuxBody: 'AppImage y Docker / Podman Compose están disponibles en la página de la versión.',
    installer: 'Instalador',
    portable: 'Portable',
    downloadVerb: 'Descargar',
    requirementsTitle: 'Requisitos del sistema',
    requirements: [
      { label: 'macOS', body: '11 Big Sur o posterior — versiones para Apple Silicon e Intel.' },
      { label: 'Windows', body: '10 u 11 (x64) — instalador o zip portable.' },
      { label: 'Linux', body: 'AppImage, o instalación con un clic vía Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Todas las versiones y sumas de verificación',
    allReleasesBody:
      'Cada compilación, suma de verificación y versión anterior está en GitHub Releases y releases.open-design.ai.',
    ctaTitle: '¿Prefieres la terminal?',
    ctaBody:
      'Instala desde el código fuente con tres comandos, o controla Open Design en modo headless desde tu agente de código actual.',
  },
  'pt-br': {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Baixar Open Design — app de desktop para macOS, Windows e Linux',
    description:
      'Baixe a versão de desktop mais recente do Open Design. Instale e crie: faça login uma vez, escolha um modelo e comece a projetar. macOS (Apple Silicon e Intel), Windows e Linux.',
    breadcrumb: 'Baixar',
    label: 'Baixar',
    heading: 'Baixar Open Design.',
    lead:
      'Instale e crie: sem chave de API, sem configuração. O app de desktop já vem com o roteador de modelos oficial; faça login uma vez e comece a projetar.',
    autoCtaPrefix: 'Baixar para',
    autoCtaFallback: 'Baixar Open Design',
    recommended: 'Recomendado',
    publishedPrefix: 'Publicado em',
    releaseNotes: 'Notas da versão',
    platformsTitle: 'Todas as plataformas',
    windowsInstaller: 'Instalador',
    windowsPortable: 'Portátil',
    linuxBody: 'AppImage e Docker / Podman Compose estão disponíveis na página da versão.',
    installer: 'Instalador',
    portable: 'Portátil',
    downloadVerb: 'Baixar',
    requirementsTitle: 'Requisitos do sistema',
    requirements: [
      { label: 'macOS', body: '11 Big Sur ou mais recente — versões para Apple Silicon e Intel.' },
      { label: 'Windows', body: '10 ou 11 (x64) — instalador ou zip portátil.' },
      { label: 'Linux', body: 'AppImage, ou instalação com um clique via Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Todas as versões e somas de verificação',
    allReleasesBody:
      'Cada build, soma de verificação e versão anterior fica no GitHub Releases e em releases.open-design.ai.',
    ctaTitle: 'Prefere o terminal?',
    ctaBody:
      'Instale a partir do código-fonte com três comandos, ou controle o Open Design em modo headless pelo seu agente de código atual.',
  },
  it: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Scarica Open Design — app desktop per macOS, Windows e Linux',
    description:
      'Scarica l’ultima build desktop di Open Design. Installa e crea: accedi una volta, scegli un modello e inizia a progettare. macOS (Apple Silicon e Intel), Windows e Linux.',
    breadcrumb: 'Scarica',
    label: 'Scarica',
    heading: 'Scarica Open Design.',
    lead:
      'Installa e crea: nessuna chiave API, nessuna configurazione. L’app desktop include il model router ufficiale; accedi una volta e inizia a progettare.',
    autoCtaPrefix: 'Scarica per',
    autoCtaFallback: 'Scarica Open Design',
    recommended: 'Consigliato',
    publishedPrefix: 'Pubblicato il',
    releaseNotes: 'Note di rilascio',
    platformsTitle: 'Tutte le piattaforme',
    windowsInstaller: 'Programma di installazione',
    windowsPortable: 'Portatile',
    linuxBody: 'AppImage e Docker / Podman Compose sono disponibili nella pagina della release.',
    installer: 'Programma di installazione',
    portable: 'Portatile',
    downloadVerb: 'Scarica',
    requirementsTitle: 'Requisiti di sistema',
    requirements: [
      { label: 'macOS', body: '11 Big Sur o successivo — build per Apple Silicon e Intel.' },
      { label: 'Windows', body: '10 o 11 (x64) — installer o zip portatile.' },
      { label: 'Linux', body: 'AppImage, o installazione con un clic tramite Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Tutte le release e i checksum',
    allReleasesBody:
      'Ogni build, checksum e versione precedente si trova su GitHub Releases e releases.open-design.ai.',
    ctaTitle: 'Preferisci il terminale?',
    ctaBody:
      'Installa dai sorgenti con tre comandi, oppure pilota Open Design in modalità headless dal tuo agente di coding esistente.',
  },
  vi: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Tải Open Design — ứng dụng máy tính cho macOS, Windows và Linux',
    description:
      'Tải bản dựng máy tính Open Design mới nhất. Cài đặt là tạo được ngay — đăng nhập một lần, chọn mô hình và bắt đầu thiết kế. macOS (Apple Silicon và Intel), Windows và Linux.',
    breadcrumb: 'Tải xuống',
    label: 'Tải xuống',
    heading: 'Tải Open Design.',
    lead:
      'Cài đặt là tạo được ngay — không cần khóa API, không cần thiết lập. Ứng dụng máy tính đã tích hợp model router chính thức; đăng nhập một lần và bắt đầu thiết kế.',
    autoCtaPrefix: 'Tải cho',
    autoCtaFallback: 'Tải Open Design',
    recommended: 'Khuyến nghị',
    publishedPrefix: 'Phát hành',
    releaseNotes: 'Ghi chú phát hành',
    platformsTitle: 'Tất cả nền tảng',
    windowsInstaller: 'Bản cài đặt',
    windowsPortable: 'Bản di động',
    linuxBody: 'AppImage cùng Docker / Podman Compose có sẵn trên trang phát hành.',
    installer: 'Bản cài đặt',
    portable: 'Bản di động',
    downloadVerb: 'Tải xuống',
    requirementsTitle: 'Yêu cầu hệ thống',
    requirements: [
      { label: 'macOS', body: '11 Big Sur trở lên — bản dựng Apple Silicon và Intel.' },
      { label: 'Windows', body: '10 hoặc 11 (x64) — bản cài đặt hoặc zip di động.' },
      { label: 'Linux', body: 'AppImage, hoặc cài đặt một chạm qua Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Tất cả bản phát hành và checksum',
    allReleasesBody:
      'Mọi bản dựng, checksum và phiên bản trước đều có trên GitHub Releases và releases.open-design.ai.',
    ctaTitle: 'Thích dùng terminal hơn?',
    ctaBody:
      'Cài đặt từ mã nguồn bằng ba lệnh, hoặc điều khiển Open Design ở chế độ headless từ agent lập trình hiện có của bạn.',
  },
  pl: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Pobierz Open Design — aplikacja desktopowa na macOS, Windows i Linux',
    description:
      'Pobierz najnowszą wersję desktopową Open Design. Zainstaluj i twórz — zaloguj się raz, wybierz model i zacznij projektować. macOS (Apple Silicon i Intel), Windows oraz Linux.',
    breadcrumb: 'Pobierz',
    label: 'Pobierz',
    heading: 'Pobierz Open Design.',
    lead:
      'Zainstaluj i twórz — bez klucza API, bez konfiguracji. Aplikacja desktopowa zawiera oficjalny router modeli; zaloguj się raz i zacznij projektować.',
    autoCtaPrefix: 'Pobierz dla',
    autoCtaFallback: 'Pobierz Open Design',
    recommended: 'Zalecane',
    publishedPrefix: 'Opublikowano',
    releaseNotes: 'Informacje o wydaniu',
    platformsTitle: 'Wszystkie platformy',
    windowsInstaller: 'Instalator',
    windowsPortable: 'Wersja przenośna',
    linuxBody: 'AppImage oraz Docker / Podman Compose są dostępne na stronie wydania.',
    installer: 'Instalator',
    portable: 'Wersja przenośna',
    downloadVerb: 'Pobierz',
    requirementsTitle: 'Wymagania systemowe',
    requirements: [
      { label: 'macOS', body: '11 Big Sur lub nowszy — wersje dla Apple Silicon i Intel.' },
      { label: 'Windows', body: '10 lub 11 (x64) — instalator albo przenośny zip.' },
      { label: 'Linux', body: 'AppImage lub instalacja jednym kliknięciem przez Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Wszystkie wydania i sumy kontrolne',
    allReleasesBody:
      'Każda kompilacja, suma kontrolna i poprzednia wersja są na GitHub Releases i releases.open-design.ai.',
    ctaTitle: 'Wolisz terminal?',
    ctaBody:
      'Zainstaluj ze źródeł trzema poleceniami albo steruj Open Design w trybie headless ze swojego agenta do kodowania.',
  },
  id: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Unduh Open Design — aplikasi desktop untuk macOS, Windows & Linux',
    description:
      'Unduh build desktop Open Design terbaru. Pasang lalu berkarya — masuk sekali, pilih model, mulai mendesain. macOS (Apple Silicon & Intel), Windows, dan Linux.',
    breadcrumb: 'Unduh',
    label: 'Unduh',
    heading: 'Unduh Open Design.',
    lead:
      'Pasang lalu berkarya — tanpa kunci API, tanpa penyiapan. Aplikasi desktop sudah dilengkapi model router resmi; masuk sekali dan mulai mendesain.',
    autoCtaPrefix: 'Unduh untuk',
    autoCtaFallback: 'Unduh Open Design',
    recommended: 'Disarankan',
    publishedPrefix: 'Dirilis',
    releaseNotes: 'Catatan rilis',
    platformsTitle: 'Semua platform',
    windowsInstaller: 'Penginstal',
    windowsPortable: 'Portabel',
    linuxBody: 'AppImage serta Docker / Podman Compose tersedia di halaman rilis.',
    installer: 'Penginstal',
    portable: 'Portabel',
    downloadVerb: 'Unduh',
    requirementsTitle: 'Persyaratan sistem',
    requirements: [
      { label: 'macOS', body: '11 Big Sur atau lebih baru — build Apple Silicon dan Intel.' },
      { label: 'Windows', body: '10 atau 11 (x64) — penginstal atau zip portabel.' },
      { label: 'Linux', body: 'AppImage, atau penyiapan satu klik via Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Semua rilis & checksum',
    allReleasesBody:
      'Setiap build, checksum, dan versi lampau ada di GitHub Releases dan releases.open-design.ai.',
    ctaTitle: 'Lebih suka terminal?',
    ctaBody:
      'Pasang dari sumber dengan tiga perintah, atau jalankan Open Design secara headless dari agen coding Anda yang sudah ada.',
  },
  nl: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Open Design downloaden — desktop-app voor macOS, Windows en Linux',
    description:
      'Download de nieuwste Open Design desktop-build. Installeren en maken — één keer inloggen, een model kiezen en beginnen met ontwerpen. macOS (Apple Silicon en Intel), Windows en Linux.',
    breadcrumb: 'Downloaden',
    label: 'Downloaden',
    heading: 'Open Design downloaden.',
    lead:
      'Installeren en maken — geen API-sleutel, geen setup. De desktop-app bevat de officiële model-router; log één keer in en begin met ontwerpen.',
    autoCtaPrefix: 'Downloaden voor',
    autoCtaFallback: 'Open Design downloaden',
    recommended: 'Aanbevolen',
    publishedPrefix: 'Uitgebracht',
    releaseNotes: 'Release notes',
    platformsTitle: 'Alle platforms',
    windowsInstaller: 'Installatieprogramma',
    windowsPortable: 'Portable',
    linuxBody: 'AppImage en Docker / Podman Compose zijn beschikbaar op de release-pagina.',
    installer: 'Installatieprogramma',
    portable: 'Portable',
    downloadVerb: 'Downloaden',
    requirementsTitle: 'Systeemvereisten',
    requirements: [
      { label: 'macOS', body: '11 Big Sur of nieuwer — builds voor Apple Silicon en Intel.' },
      { label: 'Windows', body: '10 of 11 (x64) — installatieprogramma of portable zip.' },
      { label: 'Linux', body: 'AppImage, of installatie met één klik via Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Alle releases en checksums',
    allReleasesBody:
      'Elke build, checksum en eerdere versie staat op GitHub Releases en releases.open-design.ai.',
    ctaTitle: 'Liever de terminal?',
    ctaBody:
      'Installeer vanuit de broncode met drie commando’s, of stuur Open Design headless aan vanuit je bestaande coding-agent.',
  },
  ar: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'تنزيل Open Design — تطبيق سطح المكتب لنظام macOS وWindows وLinux',
    description:
      'نزّل أحدث إصدار سطح مكتب من Open Design. ثبّت وابدأ الإنشاء — سجّل الدخول مرة واحدة، اختر نموذجًا، وابدأ التصميم. يدعم macOS (Apple Silicon وIntel) وWindows وLinux.',
    breadcrumb: 'تنزيل',
    label: 'تنزيل',
    heading: 'تنزيل Open Design.',
    lead:
      'ثبّت وابدأ الإنشاء — بدون مفتاح API وبدون إعداد. يأتي تطبيق سطح المكتب مزوّدًا بموجّه النماذج الرسمي؛ سجّل الدخول مرة واحدة وابدأ التصميم.',
    autoCtaPrefix: 'تنزيل لنظام',
    autoCtaFallback: 'تنزيل Open Design',
    recommended: 'موصى به',
    publishedPrefix: 'صدر بتاريخ',
    releaseNotes: 'ملاحظات الإصدار',
    platformsTitle: 'جميع المنصات',
    windowsInstaller: 'برنامج التثبيت',
    windowsPortable: 'النسخة المحمولة',
    linuxBody: 'يتوفر AppImage وكذلك Docker / Podman Compose في صفحة الإصدار.',
    installer: 'برنامج التثبيت',
    portable: 'النسخة المحمولة',
    downloadVerb: 'تنزيل',
    requirementsTitle: 'متطلبات النظام',
    requirements: [
      { label: 'macOS', body: '11 Big Sur أو أحدث — إصدارات Apple Silicon وIntel.' },
      { label: 'Windows', body: '10 أو 11 (x64) — برنامج تثبيت أو ملف zip محمول.' },
      { label: 'Linux', body: 'AppImage، أو إعداد بنقرة واحدة عبر Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'جميع الإصدارات وقيم التحقق',
    allReleasesBody:
      'كل بناء وقيمة تحقق وإصدار سابق موجود على GitHub Releases وعلى releases.open-design.ai.',
    ctaTitle: 'تفضّل الطرفية؟',
    ctaBody:
      'ثبّت من المصدر بثلاثة أوامر، أو شغّل Open Design بوضع headless من وكيل البرمجة الحالي لديك.',
  },
  tr: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Open Design’i indir — macOS, Windows ve Linux için masaüstü uygulaması',
    description:
      'En son Open Design masaüstü sürümünü indirin. Kurun ve üretmeye başlayın — bir kez giriş yapın, bir model seçin, tasarlamaya başlayın. macOS (Apple Silicon ve Intel), Windows ve Linux.',
    breadcrumb: 'İndir',
    label: 'İndir',
    heading: 'Open Design’i indir.',
    lead:
      'Kurun ve üretin — API anahtarı yok, kurulum yok. Masaüstü uygulaması resmi model yönlendiriciyle gelir; bir kez giriş yapın ve tasarlamaya başlayın.',
    autoCtaPrefix: 'Şunun için indir:',
    autoCtaFallback: 'Open Design’i indir',
    recommended: 'Önerilen',
    publishedPrefix: 'Yayınlandı',
    releaseNotes: 'Sürüm notları',
    platformsTitle: 'Tüm platformlar',
    windowsInstaller: 'Yükleyici',
    windowsPortable: 'Taşınabilir',
    linuxBody: 'AppImage ile Docker / Podman Compose sürüm sayfasında mevcuttur.',
    installer: 'Yükleyici',
    portable: 'Taşınabilir',
    downloadVerb: 'İndir',
    requirementsTitle: 'Sistem gereksinimleri',
    requirements: [
      { label: 'macOS', body: '11 Big Sur veya üzeri — Apple Silicon ve Intel sürümleri.' },
      { label: 'Windows', body: '10 veya 11 (x64) — yükleyici veya taşınabilir zip.' },
      { label: 'Linux', body: 'AppImage veya Docker / Podman Compose ile tek tıkla kurulum.' },
    ],
    allReleasesTitle: 'Tüm sürümler ve sağlama toplamları',
    allReleasesBody:
      'Her derleme, sağlama toplamı ve geçmiş sürüm GitHub Releases ve releases.open-design.ai üzerindedir.',
    ctaTitle: 'Terminali mi tercih edersiniz?',
    ctaBody:
      'Kaynaktan üç komutla kurun veya Open Design’i mevcut kodlama aracınızdan headless olarak çalıştırın.',
  },
  uk: {
    ...INFO_PAGE_COPY.en!.download,
    title: 'Завантажити Open Design — десктопний застосунок для macOS, Windows і Linux',
    description:
      'Завантажте найновішу десктопну збірку Open Design. Встановіть і творіть — увійдіть один раз, виберіть модель, почніть проєктувати. macOS (Apple Silicon та Intel), Windows і Linux.',
    breadcrumb: 'Завантажити',
    label: 'Завантажити',
    heading: 'Завантажити Open Design.',
    lead:
      'Встановіть і творіть — без API-ключа й без налаштувань. Десктопний застосунок постачається з офіційним маршрутизатором моделей; увійдіть один раз і починайте проєктувати.',
    autoCtaPrefix: 'Завантажити для',
    autoCtaFallback: 'Завантажити Open Design',
    recommended: 'Рекомендовано',
    publishedPrefix: 'Випущено',
    releaseNotes: 'Примітки до випуску',
    platformsTitle: 'Усі платформи',
    windowsInstaller: 'Інсталятор',
    windowsPortable: 'Портативна версія',
    linuxBody: 'AppImage, а також Docker / Podman Compose доступні на сторінці випуску.',
    installer: 'Інсталятор',
    portable: 'Портативна версія',
    downloadVerb: 'Завантажити',
    requirementsTitle: 'Системні вимоги',
    requirements: [
      { label: 'macOS', body: '11 Big Sur або новіша — збірки для Apple Silicon та Intel.' },
      { label: 'Windows', body: '10 або 11 (x64) — інсталятор або портативний zip.' },
      { label: 'Linux', body: 'AppImage або встановлення в один клік через Docker / Podman Compose.' },
    ],
    allReleasesTitle: 'Усі випуски та контрольні суми',
    allReleasesBody:
      'Кожна збірка, контрольна сума й попередня версія — на GitHub Releases і releases.open-design.ai.',
    ctaTitle: 'Надаєте перевагу терміналу?',
    ctaBody:
      'Встановіть із джерел трьома командами або керуйте Open Design у headless-режимі з наявного агента для кодування.',
  },
};

INFO_PAGE_COPY.zh = {
  ...INFO_PAGE_COPY.en!,
  common: {
    ...INFO_PAGE_COPY.en!.common,
    breadcrumbAria: '面包屑',
    onThisPage: '本页内容：',
    starOnGithub: '在 GitHub 点 Star',
    downloadDesktop: '下载桌面端',
    joinDiscord: '加入 Discord',
    quickstart: '快速开始',
    requestAdapter: '请求适配器',
    live: '在线',
    localFirst: '本地优先',
  },
  official: {
    ...INFO_PAGE_COPY.en!.official,
    title: '官方 Open Design —— 来源页、GitHub、发布与别名',
    description:
      'Open Design 官方来源页：canonical 网站、GitHub 仓库、发布、Discord、许可证和维护者身份都集中在这里。',
    breadcrumb: '官方',
    label: '来源 · Nº 00',
    heading: '官方 Open Design 来源页。',
    lead:
      'Open Design（也会被搜索为 OpenDesign、open-design、opendesign 或 Open Design AI）是 nexu-io/open-design 项目的官方开源 AI 设计工作台。这个页面列出所有 canonical 入口，方便你自行核验来源。',
    canonicalTitle: 'Canonical 入口',
    canonicalBody: '请收藏 open-design.ai 和 GitHub 仓库。其它入口都应回到这两个来源之一。',
    sources: [
      { label: '官方网站', name: 'open-design.ai' },
      { label: 'GitHub 仓库', name: 'nexu-io/open-design' },
      { label: '最新版本', name: 'version' },
      { label: 'Issue / 讨论', name: 'GitHub issues' },
      { label: '社区', name: 'Discord' },
      { label: '文档', name: 'GitHub README' },
      { label: '许可证', name: 'Apache-2.0' },
      { label: 'Skill 目录', name: '/plugins/skills/' },
      { label: '系统目录', name: '/plugins/systems/' },
      { label: '模板目录', name: '/plugins/templates/' },
    ],
    aliasesTitle: '命名与别名',
    aliasesLead: '不同工具、受众和语言环境里，这个项目会以几种方式被搜索和书写：',
    aliases: [
      { label: 'Open Design', body: '产品 UI、博客和 README 中的展示名。' },
      { label: 'OpenDesign', body: '常见的连写搜索变体，指向同一个项目。' },
      { label: 'open-design', body: '仓库和包名 slug。' },
      { label: 'opendesign', body: 'URL 和 CLI 调用中的小写别名。' },
      { label: 'Open Design AI', body: '用于区分通用 open design 话题的长尾搜索词。' },
      { label: 'OD', body: 'runtime 和 CLI bin 的内部缩写。' },
    ],
    aliasesClosing: '这六个名称都指向同一个项目。canonical URL 始终是 open-design.ai。',
    maintainerTitle: '维护者与许可证',
    maintainerBody:
      'Open Design 在 github.com/nexu-io/open-design 公开开发，并以 Apache-2.0 发布。Issue、RFC 和路线图讨论都在 GitHub Issues 与 Discord 进行。',
    runtimeTitle: '你的机器上运行什么',
    runtimeBody: 'Open Design 提供三个可运行表面，全部开源、全部本地优先：',
    runtimeItems: [
      { label: '桌面应用', body: '面向 macOS、Windows、Linux 的 Electron 打包版本。' },
      { label: 'Daemon（od）', body: '给 agent、shell 或 CI 使用的本地 HTTP daemon 与 CLI。' },
      { label: 'Skills + Systems', body: '可以 fork、编辑和交付的 Markdown bundle。' },
    ],
    nextTitle: '下一步',
    nextItems: [
      { label: '快速开始', body: '三条命令完成安装。' },
      { label: 'Agent', body: 'Claude Code、Codex、Cursor、Gemini、OpenCode、Qwen。' },
      { label: 'Claude Design 替代方案', body: '对比与迁移。' },
      { label: 'Skill 目录', body: '所有可交付的设计 Skill。' },
      { label: '系统目录', body: '所有可移植 DESIGN.md 品牌系统。' },
    ],
  },
  quickstart: {
    ...INFO_PAGE_COPY.en!.quickstart,
    title: 'Open Design 快速开始 —— 三条命令安装（Node 24、pnpm）',
    description:
      '用三条命令在本地安装 Open Design。包含 Node 24、pnpm 10.33.2 要求、命令、预期输出、排障和首次生成设计 artifact 的步骤。',
    breadcrumb: '快速开始',
    label: '安装 · Nº 01',
    heading: 'Open Design 快速开始。',
    lead: 'Open Design 完全运行在你的机器上。三条命令就能从干净 checkout 到本地 daemon、Web UI 和第一个设计 artifact。',
    latestRelease: '最新稳定版本：',
    requirementsTitle: '环境要求',
    requirements: [
      { label: 'Node.js 24', body: '通过系统包管理器或 nodejs.org 安装。不支持 Node 22。' },
      { label: 'pnpm 10.33.2', body: '通过 Corepack 启用，使用 lockfile 固定版本。' },
      { label: 'git', body: '任意较新的版本即可。' },
      { label: '一个 Agent', body: 'Claude Code、Codex、Cursor、Gemini CLI、OpenCode 或 Qwen。' },
    ],
    commandsTitle: '三条命令开始交付',
    commandsLead: '在一个干净 shell 中运行：',
    steps: [
      {
        name: '克隆并安装',
        text: '克隆 open-design 仓库，并用 pnpm 安装 workspace 依赖。需要 Node 24 和 pnpm 10.33.2。',
        code: QUICKSTART_CODE.install,
      },
      {
        name: '启动 daemon 和 Web UI',
        text: '运行 tools-dev 启动本地 daemon 与 Web runtime。这是唯一的本地生命周期入口。',
        code: QUICKSTART_CODE.start,
      },
      {
        name: '生成第一个 artifact',
        text: '打开 Web UI，从目录里选择一个 Skill，让你的 Agent 渲染。也可以直接用 od CLI 驱动 daemon。',
        code: QUICKSTART_CODE.first,
      },
    ],
    fullNotes: '完整说明见 QUICKSTART.md。',
    expectedTitle: '你应该看到什么',
    expectedBody: '当 pnpm tools-dev 正常时，终端会显示 daemon、Web runtime 和 sidecar IPC namespace 已 ready：',
    expectedPorts: '实际端口由 tools-dev 参数决定（--daemon-port、--web-port）；默认值在多次运行中保持稳定。',
    troubleshootingTitle: '排障',
    troubleshooting: [
      { label: 'pnpm install 出现 EBADENGINE', body: 'Node 大版本不对，请切到 Node 24。' },
      { label: 'Windows 上 better-sqlite3 编译卡住', body: '这是 Node 24 上的预期行为，请先安装 Visual Studio Build Tools。' },
      { label: '端口被占用', body: '传入 --daemon-port 与 --web-port，或停止之前的运行。' },
      { label: 'Agent 没出现', body: '检查 /agents/ 以及 .od/media-config.json 中的凭据。' },
      { label: '权限提示反复出现', body: '运行 pnpm tools-dev check 检查环境并输出缺失项。' },
    ],
    nextTitle: '下一步',
    nextItems: [
      { label: '浏览 Skill 目录', body: '选择一个工作流开始渲染。' },
      { label: '选择 DESIGN.md 系统', body: '让生成 artifact 继承品牌。' },
      { label: '比较 Open Design', body: '了解它和 Claude Design、Figma Make、v0、Lovable 的差异。' },
      { label: '订阅 GitHub Releases', body: '获取新版本。' },
    ],
    ctaTitle: '三条命令，归你所有。',
    ctaBody: '你已经看到安装路径。可以给仓库点 Star、下载桌面版，或在首次运行遇到问题时加入 Discord。',
  },
  agents: {
    ...INFO_PAGE_COPY.en!.agents,
    title: 'Open Design Agent —— 17 个 BYOK 适配器',
    description: 'Open Design 内置 17 个 BYOK 适配器。直接用你写代码时已经在用的 Agent 来驱动设计，无需额外厂商登录。',
    breadcrumb: 'Agent',
    label: '适配器 · Nº 04',
    heading: (count) => `${count} 个 BYOK Agent，一套 Skill 协议。`,
    lead: (count) =>
      `Open Design 内置 ${count} 个一方适配器。同一套可组合 Skill 和可移植 DESIGN.md 系统可以用于每一个 Agent。全程 BYOK：你的密钥、你的成本、你的数据。`,
    adaptersTitle: '适配器如何接入',
    adaptersBody:
      '每个适配器都是很薄的一层 shim，把 Agent 原生消息格式翻译成 Open Design Skill 协议。新增适配器通常只是一个文件，不需要 fork 整个产品。',
    tiers: [
      { label: 'Tier 1 —— 一方日常验证', blurb: 'Open Design 维护者每天使用的适配器。支持时会使用 Stream-JSON IPC、AskUserQuestion 中途交互和 Skill-aware system prompt。' },
      { label: 'Tier 2 —— 已支持适配器', blurb: '接入同一套 Skill 协议。日常覆盖略少于 Tier 1，但仍在仓库内维护。' },
      { label: 'Tier 3 —— 社区 / 实验', blurb: '较新的适配器，覆盖面更窄，适合特定厂商提供了 Tier 1 没有的工作流时使用。' },
    ],
    vendor: '厂商',
    credential: '凭据',
    byokTitle: '这里的 BYOK 是什么意思',
    byokLead: 'Open Design 中的 BYOK（bring your own key）意味着凭据和成本都留在你这一侧：',
    byokItems: [
      '凭据存放在 .od/media-config.json 或 shell env 中。',
      'API 调用从你的机器直接到你的 provider。',
      '切换 provider 是换 key，不是重新 onboarding。',
      'API 成本直接记在你自己的 provider 账户上。',
    ],
    nextTitle: '下一步',
    nextItems: [
      { label: '快速开始', body: '三条命令安装。' },
      { label: '浏览 Skill 目录', body: '选择你要运行的工作流。' },
      { label: '浏览设计系统', body: '选择品牌契约。' },
      { label: 'Claude Design 替代方案', body: '完整对比。' },
    ],
    ctaTitle: (count) => `${count} 个适配器，你自己的 Agent。`,
    ctaBody: '选择你电脑上已有的 Agent，把 Open Design 指向它，然后开始渲染。',
  },
  compare: {
    ...INFO_PAGE_COPY.en!.compare,
    title: 'Open Design vs Claude Design、Figma Make、v0、Lovable —— 诚实对比',
    description:
      '比较 Open Design 与主流 AI 设计工具：云端托管 vs 本地优先、BYOK vs 厂商锁定、一次性生成 vs 可移植 DESIGN.md 系统。',
    breadcrumb: '对比',
    label: '评估 · Nº 02',
    heading: 'Open Design 与其它工具的对比。',
    lead: '这里用简短、诚实的摘要说明 Open Design 与你可能正在评估的其它 AI 设计工具之间的关系。',
    toc: ['vs Claude Design', 'vs Figma Make', 'vs v0', 'vs Lovable / Bolt', 'vs Open CoDesign', '真实限制'],
    comparisons: [
      { competitor: 'Claude Design', summary: '绑定单一厂商的云端产品。Open Design 本地优先、BYOK、Apache-2.0，Skill 与 DESIGN.md 都留在你的 repo。', cta: '阅读完整对比 ->' },
      { competitor: 'Figma Make', summary: 'Figma Make 侧重在 Figma 内 prompt-to-mockup。Open Design 把可移植 artifact 直接交付到你的项目。', cta: '查看仓库中的迁移说明 ->' },
      { competitor: 'v0 by Vercel', summary: 'v0 在云端 runtime 生成 React 组件。Open Design 在本地生成 deck、dashboard、landing page 和品牌系统。', cta: '查看仓库中的迁移说明 ->' },
      { competitor: 'Lovable / Bolt', summary: 'Lovable 和 Bolt 侧重云端 prompt-to-app。Open Design 是给你已有 Agent 使用的设计 Skill 层。', cta: '查看仓库中的迁移说明 ->' },
      { competitor: 'Open CoDesign', summary: 'Open CoDesign 是同领域开源项目。Open Design 可以通过 Skill 协议包装 codesign 类型工作流。', cta: '查看仓库中的迁移说明 ->' },
    ],
    limitsTitle: '真实限制 —— Open Design 不是什么',
    limitsBody: 'Open Design 不试图成为所有云端 AI 设计工具。下面的问题说明实际取舍，而不是把限制包装掉。',
    limitsFaq: [
      { name: 'Open Design 有云端 Web sandbox 吗？', text: '没有。Open Design 的设计目标就是本地优先。' },
      { name: '不安装任何东西可以使用 Open Design 吗？', text: '目前不行。最小形态是本地 daemon 加一个 coding agent。' },
      { name: 'Open Design 是 v0 / Lovable / Bolt 替代品吗？', text: '取决于场景。Open Design 聚焦通过可 fork 的 Skill 协议生成设计 artifact。' },
      { name: 'Open Design 会把我的数据发给 Anthropic、OpenAI 或 Google 吗？', text: '只会把 prompt 与 Skill 上下文发给你自己带 key 的 provider。' },
      { name: '可以把 Open Design 自托管到自己的基础设施吗？', text: '可以。Apache-2.0、Node 24 daemon、没有必需 SaaS。' },
    ],
  },
  claudeAlternative: {
    ...INFO_PAGE_COPY.en!.claudeAlternative,
    title: 'Claude Design 开源替代方案 —— Open Design（BYOK、本地优先）',
    description:
      'Open Design 是 Claude Design 的开源、本地优先替代方案。支持 Claude Code、Codex、Cursor、Gemini、OpenCode 或 Qwen 的 BYOK 工作流。',
    breadcrumb: 'Claude Design 开源替代方案',
    label: '替代方案 · Nº 03',
    heading: 'Claude Design 的开源替代方案。',
    lead:
      'Open Design 是官方开源、本地优先的 Claude Design 替代方案。你可以用自己已有的 Agent BYOK，把品牌保存为可移植 DESIGN.md 文件，并把 artifact 作为项目文件交付。',
    tldrTitle: '简版结论',
    tldrBody: '同样覆盖 prompt-to-design-artifact，但姿态不同：本地优先、BYOK、Apache-2.0 开源、可移植 DESIGN.md 与可组合 SKILL.md。',
    toc: ['为什么搜索替代方案', '本地优先 + BYOK', '功能对比', '谁适合哪个', '迁移 / 首次运行', 'FAQ'],
    whyTitle: '为什么用户会搜索 Claude Design 替代方案',
    whyLead: '在支持线程、GitHub 讨论和 Discord 里，反复出现的原因主要有五个：',
    reasons: [
      { label: '数据所有权。', body: '设计应该作为 repo 中的文件存在，而不是厂商 DB 里的文档。' },
      { label: 'BYOK 成本。', body: '带上自己的 provider key，API 成本记到自己的账户。' },
      { label: 'Agent 选择。', body: '用你已经拿来写代码的 Agent 驱动设计。' },
      { label: '品牌可移植。', body: '一个 DESIGN.md 文件为所有 Skill 编码品牌。' },
      { label: '自托管 / fork。', body: 'Apache-2.0、完整源码，可为你的工作室或公司重命名。' },
    ],
    localByokTitle: '本地优先 + BYOK 解释',
    localByokBody: [
      'Open Design 在你的机器上运行桌面应用、本地 daemon，以及 Markdown 形式的 Skill/System 目录。',
      '设计输出不会被强制经过厂商云。凭据保留在本地配置或环境变量中。',
    ],
    featureTitle: '功能对比',
    features: [
      { name: '许可证', od: 'Apache-2.0，GitHub 完整源码', cd: '闭源、云端托管产品' },
      { name: 'Runtime', od: '你机器上的本地 daemon', cd: '厂商云' },
      { name: 'Agent', od: 'BYOK：Claude Code、Codex、Cursor、Gemini、OpenCode、Qwen', cd: '厂商托管 Agent' },
      { name: 'API 成本', od: '记到你的账户', cd: '包含在厂商订阅中' },
      { name: '设计系统', od: 'repo 中的可移植 DESIGN.md', cd: '存储在厂商 DB' },
      { name: 'Skill', od: '可 fork 的可组合 SKILL.md', cd: '内置模板' },
      { name: '自托管', od: '可以，Node 24 可运行处都能跑', cd: '不支持' },
      { name: '价格', od: '产品免费，你支付 Agent API 成本', cd: '厂商订阅' },
      { name: 'CLI / CI', od: '通过 od CLI + HTTP daemon 支持', cd: '仅 Web UI' },
      { name: 'Artifact 所有权', od: '项目目录中的文件', cd: '厂商托管文档' },
    ],
    whoTitle: '谁应该选择哪个',
    pickClaudeTitle: '适合 Claude Design 的情况',
    pickClaude: ['你想要零本地安装和单一厂商账单。', '你已经深度处于 Claude-first 工作流。', '你的团队更偏好托管 UI，而不是 Markdown 文件。'],
    pickOpenTitle: '适合 Open Design 的情况',
    pickOpen: ['你想把设计 artifact 作为可版本控制文件保存。', '你想用现有 coding agent BYOK。', '你想 fork、重命名、嵌入 CLI 或自托管。', '你希望每个品牌有一个所有 Skill 都尊重的 DESIGN.md。'],
    migrateTitle: '迁移 / 首次运行',
    migrateLead: '今天还没有从 Claude Design 自动导入的能力；建议做一次品牌提取：',
    migrateSteps: ['按快速开始安装 Open Design。', '打开 Web UI，让 Agent 查看一个你喜欢的 Claude Design artifact。', '让 Agent 把品牌提取成 DESIGN.md 文件。', '选择一个 Skill，用新品牌渲染。'],
    migrateClosing: '之后每个 Skill 都能沿用你的品牌，不需要反复重新提示。',
    faqTitle: 'FAQ',
    faq: [
      { name: 'Open Design 真的是 Claude Design 的 drop-in 替代吗？', text: '不是字面上的 drop-in，但它们都覆盖 prompt-to-design-artifact 这个用途。' },
      { name: '可以在 Open Design 中使用 Claude 作为 Agent 吗？', text: '可以。Open Design 支持 Claude Code 和 Anthropic API BYOK。' },
      { name: '我的 Claude Design 设计怎么办？', text: '你可以继续并行使用 Claude Design；目前迁移是手动的。' },
      { name: 'Open Design 能生成相同类型的 artifact 吗？', text: '常见类型可以：落地页、演示文稿、仪表盘、社交内容、品牌系统和原型。' },
      { name: '为什么说 open-source Claude Design，而不是 open-source AI design tool？', text: '因为很多用户就是用这个形状来描述他们在找的产品。' },
      { name: '谁在构建和维护 Open Design？', text: '项目位于 github.com/nexu-io/open-design，许可证为 Apache-2.0。' },
    ],
    ctaTitle: '三条命令切换。',
    ctaBody: '给仓库点 Star、下载桌面版，或直接在终端安装。你的 DESIGN.md 系统从第一次渲染开始就留在自己的 repo。',
  },
  download: {
    ...INFO_PAGE_COPY.en!.download,
    title: '下载 Open Design —— macOS / Windows / Linux 桌面客户端',
    description:
      '下载最新版 Open Design 桌面客户端。装上就能创作——登录一次、选个模型、开始设计。支持 macOS（Apple Silicon 与 Intel）、Windows、Linux。',
    breadcrumb: '下载',
    label: '下载',
    heading: '下载 Open Design。',
    lead: '装上就能创作——不需要 API key、零配置。桌面端内置官方 model router，登录一次即可开始设计。',
    autoCtaPrefix: '下载适用于',
    autoCtaFallback: '下载 Open Design',
    recommended: '推荐',
    publishedPrefix: '发布于',
    releaseNotes: '更新日志',
    platformsTitle: '全部平台',
    macArm: 'Apple Silicon',
    macIntel: 'Intel',
    windowsInstaller: '安装版',
    windowsPortable: '便携版',
    linuxBody: 'AppImage 以及 Docker / Podman Compose 一键搭建，见 release 页面。',
    installer: '安装版',
    portable: '便携版',
    checksum: 'SHA-256',
    downloadVerb: '下载',
    requirementsTitle: '系统要求',
    requirements: [
      { label: 'macOS', body: '11 Big Sur 及以上——提供 Apple Silicon 与 Intel 版本。' },
      { label: 'Windows', body: '10 或 11（x64）——安装版或便携版 zip。' },
      { label: 'Linux', body: 'AppImage，或 Docker / Podman Compose 一键搭建。' },
    ],
    allReleasesTitle: '全部版本与校验和',
    allReleasesBody: '每个构建、校验和与历史版本都在 GitHub Releases 与 releases.open-design.ai 上。',
    ctaTitle: '更喜欢用终端？',
    ctaBody: '三条命令从源码安装，或用你现有的编码 agent 以 headless 方式驱动 Open Design。',
  },
};

INFO_PAGE_COPY['zh-tw'] = {
  ...INFO_PAGE_COPY.zh!,
  common: {
    ...INFO_PAGE_COPY.zh!.common,
    breadcrumbAria: '麵包屑',
    onThisPage: '本頁內容：',
    starOnGithub: '在 GitHub 按 Star',
    downloadDesktop: '下載桌面端',
    quickstart: '快速開始',
    live: '在線',
    localFirst: '本地優先',
  },
  official: {
    ...INFO_PAGE_COPY.zh!.official,
    title: '官方 Open Design —— 來源頁、GitHub、發布與別名',
    description:
      'Open Design 官方來源頁：canonical 網站、GitHub repo、發布、Discord、授權與維護者身份都集中在這裡。',
    breadcrumb: '官方',
    heading: '官方 Open Design 來源頁。',
    lead:
      'Open Design（也會被搜尋為 OpenDesign、open-design、opendesign 或 Open Design AI）是 nexu-io/open-design 專案的官方開源 AI 設計工作台。這個頁面列出所有 canonical 入口，方便你自行核驗來源。',
    canonicalBody: '請收藏 open-design.ai 與 GitHub repo。其他入口都應回到這兩個來源之一。',
    aliasesTitle: '命名與別名',
    aliasesLead: '不同工具、受眾與語言環境裡，這個專案會以幾種方式被搜尋和書寫：',
    aliases: [
      { label: 'Open Design', body: '產品 UI、部落格與 README 中的展示名。' },
      { label: 'OpenDesign', body: '常見的連寫搜尋變體，指向同一個專案。' },
      { label: 'open-design', body: 'repo 與 package slug。' },
      { label: 'opendesign', body: 'URL 與 CLI 呼叫中的小寫別名。' },
      { label: 'Open Design AI', body: '用來區分通用 open design 話題的長尾搜尋詞。' },
      { label: 'OD', body: 'runtime 與 CLI bin 的內部縮寫。' },
    ],
    aliasesClosing: '這六個名稱都指向同一個專案。canonical URL 永遠是 open-design.ai。',
    maintainerBody:
      'Open Design 在 github.com/nexu-io/open-design 公開開發，並以 Apache-2.0 發布。Issue、RFC 與路線圖討論都在 GitHub Issues 與 Discord 進行。',
    runtimeTitle: '你的機器上執行什麼',
    runtimeBody: 'Open Design 提供三個可執行表面，全部開源、全部本地優先：',
    runtimeItems: [
      { label: '桌面應用', body: '面向 macOS、Windows、Linux 的 Electron 打包版本。' },
      { label: 'Daemon（od）', body: '給 agent、shell 或 CI 使用的本地 HTTP daemon 與 CLI。' },
      { label: 'Skills + Systems', body: '可以 fork、編輯和交付的 Markdown bundle。' },
    ],
    nextItems: [
      { label: '快速開始', body: '三條命令完成安裝。' },
      { label: 'Agent', body: 'Claude Code、Codex、Cursor、Gemini、OpenCode、Qwen。' },
      { label: 'Claude Design 替代方案', body: '比較與遷移。' },
      { label: 'Skill 目錄', body: '所有可交付的設計 Skill。' },
      { label: '系統目錄', body: '所有可移植 DESIGN.md 品牌系統。' },
    ],
  },
  quickstart: {
    ...INFO_PAGE_COPY.zh!.quickstart,
    title: 'Open Design 快速開始 —— 三條命令安裝（Node 24、pnpm）',
    description:
      '用三條命令在本地安裝 Open Design。包含 Node 24、pnpm 10.33.2 要求、命令、預期輸出、排障與首次生成設計 artifact 的步驟。',
    breadcrumb: '快速開始',
    heading: 'Open Design 快速開始。',
    lead: 'Open Design 完全執行在你的機器上。三條命令就能從乾淨 checkout 到本地 daemon、Web UI 和第一個設計 artifact。',
    latestRelease: '最新穩定版本：',
    requirementsTitle: '環境要求',
    requirements: [
      { label: 'Node.js 24', body: '透過系統套件管理器或 nodejs.org 安裝。不支援 Node 22。' },
      { label: 'pnpm 10.33.2', body: '透過 Corepack 啟用，使用 lockfile 固定版本。' },
      { label: 'git', body: '任意較新的版本即可。' },
      { label: '一個 Agent', body: 'Claude Code、Codex、Cursor、Gemini CLI、OpenCode 或 Qwen。' },
    ],
    commandsTitle: '三條命令開始交付',
    commandsLead: '在一個乾淨 shell 中執行：',
    steps: [
      {
        name: 'clone 並安裝',
        text: 'clone open-design repo，並用 pnpm 安裝 workspace 依賴。需要 Node 24 與 pnpm 10.33.2。',
        code: QUICKSTART_CODE.install,
      },
      {
        name: '啟動 daemon 與 Web UI',
        text: '執行 tools-dev 啟動本地 daemon 與 Web runtime。這是唯一的本地 lifecycle 入口。',
        code: QUICKSTART_CODE.start,
      },
      {
        name: '生成第一個 artifact',
        text: '打開 Web UI，從目錄裡選擇一個 Skill，讓你的 Agent 渲染。也可以直接用 od CLI 驅動 daemon。',
        code: QUICKSTART_CODE.first,
      },
    ],
    fullNotes: '完整說明見 QUICKSTART.md。',
    expectedTitle: '你應該看到什麼',
    expectedBody: '當 pnpm tools-dev 正常時，終端會顯示 daemon、Web runtime 與 sidecar IPC namespace 已 ready：',
    expectedPorts: '實際連接埠由 tools-dev 參數決定（--daemon-port、--web-port）；預設值在多次執行中保持穩定。',
    troubleshootingTitle: '排障',
    troubleshooting: [
      { label: 'pnpm install 出現 EBADENGINE', body: 'Node 大版本不對，請切到 Node 24。' },
      { label: 'Windows 上 better-sqlite3 編譯卡住', body: '這是 Node 24 上的預期行為，請先安裝 Visual Studio Build Tools。' },
      { label: '連接埠被占用', body: '傳入 --daemon-port 與 --web-port，或停止之前的執行。' },
      { label: 'Agent 沒出現', body: '檢查 /agents/ 以及 .od/media-config.json 中的憑據。' },
      { label: '權限提示反覆出現', body: '執行 pnpm tools-dev check 檢查環境並輸出缺失項。' },
    ],
    ctaTitle: '三條命令，歸你所有。',
    ctaBody: '你已經看到安裝路徑。可以給 repo 按 Star、下載桌面版，或在首次執行遇到問題時加入 Discord。',
  },
  agents: {
    ...INFO_PAGE_COPY.zh!.agents,
    title: 'Open Design Agent —— 17 個 BYOK adapter',
    description: 'Open Design 內建 17 個 BYOK adapter。直接用你寫程式時已經在用的 Agent 來驅動設計，無需額外供應商登入。',
    breadcrumb: 'Agent',
    heading: (count) => `${count} 個 BYOK Agent，一套 Skill 協議。`,
    lead: (count) =>
      `Open Design 內建 ${count} 個一方 adapter。同一套可組合 Skill 與可移植 DESIGN.md 系統可以用於每一個 Agent。全程 BYOK：你的密鑰、你的成本、你的資料。`,
    adaptersTitle: 'Adapter 如何接入',
    adaptersBody:
      '每個 adapter 都是很薄的一層 shim，把 Agent 原生訊息格式翻譯成 Open Design Skill 協議。新增 adapter 通常只是一個檔案，不需要 fork 整個產品。',
    vendor: '供應商',
    credential: '憑據',
    byokTitle: '這裡的 BYOK 是什麼意思',
    byokLead: 'Open Design 中的 BYOK（bring your own key）意味著憑據和成本都留在你這一側：',
    byokItems: [
      '憑據存放在 .od/media-config.json 或 shell env 中。',
      'API 呼叫從你的機器直接到你的 provider。',
      '切換 provider 是換 key，不是重新 onboarding。',
      'API 成本直接記在你自己的 provider 帳戶上。',
    ],
    ctaTitle: (count) => `${count} 個 adapter，你自己的 Agent。`,
    ctaBody: '選擇你電腦上已有的 Agent，把 Open Design 指向它，然後開始渲染。',
  },
  compare: {
    ...INFO_PAGE_COPY.zh!.compare,
    title: 'Open Design vs Claude Design、Figma Make、v0、Lovable —— 誠實比較',
    breadcrumb: '比較',
    label: '評估 · Nº 02',
    heading: 'Open Design 與其他工具的比較。',
    lead: '這裡用簡短、誠實的摘要說明 Open Design 與你可能正在評估的其他 AI 設計工具之間的關係。',
    limitsTitle: '真實限制 —— Open Design 不是什麼',
    limitsBody: 'Open Design 不試圖成為所有雲端 AI 設計工具。下面的問題說明實際取捨，而不是把限制包裝掉。',
  },
  claudeAlternative: {
    ...INFO_PAGE_COPY.zh!.claudeAlternative,
    title: 'Claude Design 開源替代方案 —— Open Design（BYOK、本地優先）',
    description:
      'Open Design 是 Claude Design 的開源、本地優先替代方案。支援 Claude Code、Codex、Cursor、Gemini、OpenCode 或 Qwen 的 BYOK 工作流。',
    breadcrumb: 'Claude Design 開源替代方案',
    label: '替代方案 · Nº 03',
    heading: 'Claude Design 的開源替代方案。',
    lead:
      'Open Design 是官方開源、本地優先的 Claude Design 替代方案。你可以用自己已有的 Agent BYOK，把品牌保存為可移植 DESIGN.md 檔案，並把 artifact 作為專案檔案交付。',
    tldrTitle: '簡版結論',
    tldrBody: '同樣覆蓋 prompt-to-design-artifact，但姿態不同：本地優先、BYOK、Apache-2.0 開源、可移植 DESIGN.md 與可組合 SKILL.md。',
    whyTitle: '為什麼使用者會搜尋 Claude Design 替代方案',
    localByokTitle: '本地優先 + BYOK 解釋',
    featureTitle: '功能比較',
    whoTitle: '誰應該選擇哪個',
    pickClaudeTitle: '適合 Claude Design 的情況',
    pickOpenTitle: '適合 Open Design 的情況',
    migrateTitle: '遷移 / 首次執行',
    faqTitle: 'FAQ',
    faq: [
      { name: 'Open Design 真的是 Claude Design 的 drop-in 替代嗎？', text: '不是字面上的 drop-in，但它們都覆蓋 prompt-to-design-artifact 這個用途。' },
      { name: '可以在 Open Design 中使用 Claude 作為 Agent 嗎？', text: '可以。Open Design 支援 Claude Code 和 Anthropic API BYOK。' },
      { name: '我的 Claude Design 設計怎麼辦？', text: '你可以繼續並行使用 Claude Design；目前遷移是手動的。' },
      { name: 'Open Design 能生成相同類型的 artifact 嗎？', text: '常見類型可以：落地頁、簡報、儀表板、社群內容、品牌系統和原型。' },
      { name: '為什麼說 open-source Claude Design，而不是 open-source AI design tool？', text: '因為很多使用者就是用這個形狀來描述他們在找的產品。' },
      { name: '誰在構建和維護 Open Design？', text: '專案位於 github.com/nexu-io/open-design，授權為 Apache-2.0。' },
    ],
    ctaTitle: '三條命令切換。',
    ctaBody: '給 repo 按 Star、下載桌面版，或直接在終端安裝。你的 DESIGN.md 系統從第一次渲染開始就留在自己的 repo。',
  },
  // Inherit the zh download copy, but use Traditional script for the recommended badge.
  download: {
    ...INFO_PAGE_COPY.zh!.download,
    recommended: '推薦',
  },
};

type CompactInfoPageText = {
  common: Pick<
    InfoPageCopy['common'],
    'breadcrumbAria' | 'onThisPage' | 'joinDiscord' | 'requestAdapter' | 'localFirst'
  >;
  section: {
    details: string;
    names: string;
    runtime: string;
    next: string;
    requirements: string;
    commands: string;
    expected: string;
    troubleshooting: string;
    adapters: string;
    byok: string;
    limits: string;
    summary: string;
    why: string;
    features: string;
    decision: string;
    migrate: string;
    faq: string;
    continue: string;
  };
  terms: {
    source: string;
    desktop: string;
    daemon: string;
    skillsSystems: string;
    node: string;
    packageManager: string;
    git: string;
    agent: string;
    clone: string;
    start: string;
    render: string;
    openChoice: string;
    closedChoice: string;
  };
  reusable: {
    sourceBody: string;
    itemBody: string;
    nextBody: string;
    installBody: string;
    expectedBody: string;
    byokBody: string;
    localBody: string;
    ctaBody: string;
  };
  official: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
  };
  quickstart: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
    ctaTitle: string;
  };
  agents: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
    ctaTitle: string;
  };
  compare: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
  };
  claudeAlternative: {
    title: string;
    description: string;
    breadcrumb: string;
    label: string;
    heading: string;
    lead: string;
    ctaTitle: string;
  };
};

const sourceNames = [
  'open-design.ai',
  'nexu-io/open-design',
  'version',
  'GitHub issues',
  'Discord',
  'GitHub README',
  'Apache-2.0',
  '/plugins/skills/',
  '/plugins/systems/',
  '/plugins/templates/',
] as const;

const aliasLabels = [
  'Open Design',
  'OpenDesign',
  'open-design',
  'opendesign',
  'Open Design AI',
  'OD',
] as const;

const comparisonNames = [
  'Claude Design',
  'Figma Make',
  'v0 by Vercel',
  'Lovable / Bolt',
  'Open CoDesign',
] as const;

function withCount(template: string, count: number): string {
  return template.replaceAll('{count}', String(count));
}

function compactCommon(locale: LandingLocaleCode, text: CompactInfoPageText): InfoPageCopy['common'] {
  const common = getCommonCopy(locale);
  const ui = getLandingUiCopy(locale);
  return {
    breadcrumbAria: text.common.breadcrumbAria,
    onThisPage: text.common.onThisPage,
    starOnGithub: common.header.starTitle,
    downloadDesktop: common.header.downloadTitle,
    joinDiscord: text.common.joinDiscord,
    quickstart: ui.footer.quickstart,
    requestAdapter: text.common.requestAdapter,
    live: common.topbar.live,
    localFirst: text.common.localFirst,
    byok: 'BYOK',
    apache: 'Apache-2.0',
    macWinLinux: 'macOS · Windows · Linux',
  };
}

function compactInfoPageCopy(
  locale: LandingLocaleCode,
  text: CompactInfoPageText,
): InfoPageCopy {
  const nextItems: [LinkText, LinkText, LinkText, LinkText, LinkText] = [
    { label: text.quickstart.breadcrumb, body: text.reusable.nextBody },
    { label: text.agents.breadcrumb, body: text.reusable.nextBody },
    { label: text.claudeAlternative.breadcrumb, body: text.reusable.nextBody },
    { label: text.terms.skillsSystems, body: text.reusable.nextBody },
    { label: text.section.details, body: text.reusable.nextBody },
  ];
  const fourNextItems: [LinkText, LinkText, LinkText, LinkText] = [
    { label: text.quickstart.breadcrumb, body: text.reusable.nextBody },
    { label: text.terms.skillsSystems, body: text.reusable.nextBody },
    { label: text.compare.breadcrumb, body: text.reusable.nextBody },
    { label: 'GitHub', body: text.reusable.nextBody },
  ];

  return {
    common: compactCommon(locale, text),
    official: {
      ...text.official,
      canonicalTitle: text.section.details,
      canonicalBody: text.reusable.sourceBody,
      sources: sourceNames.map((name) => ({
        label: text.terms.source,
        name,
      })) as InfoPageCopy['official']['sources'],
      aliasesTitle: text.section.names,
      aliasesLead: text.official.description,
      aliases: aliasLabels.map((label) => ({
        label,
        body: text.reusable.sourceBody,
      })),
      aliasesClosing: text.official.lead,
      maintainerTitle: text.section.details,
      maintainerBody: text.reusable.sourceBody,
      runtimeTitle: text.section.runtime,
      runtimeBody: text.official.lead,
      runtimeItems: [
        { label: text.terms.desktop, body: text.reusable.localBody },
        { label: text.terms.daemon, body: text.reusable.localBody },
        { label: text.terms.skillsSystems, body: text.reusable.localBody },
      ],
      nextTitle: text.section.next,
      nextItems,
    },
    quickstart: {
      ...text.quickstart,
      latestRelease: 'Version:',
      requirementsTitle: text.section.requirements,
      requirements: [
        { label: text.terms.node, body: text.reusable.installBody },
        { label: text.terms.packageManager, body: text.reusable.installBody },
        { label: text.terms.git, body: text.reusable.installBody },
        { label: text.terms.agent, body: text.reusable.installBody },
      ],
      commandsTitle: text.section.commands,
      commandsLead: text.quickstart.lead,
      steps: [
        { name: text.terms.clone, text: text.reusable.installBody, code: QUICKSTART_CODE.install },
        { name: text.terms.start, text: text.reusable.installBody, code: QUICKSTART_CODE.start },
        { name: text.terms.render, text: text.reusable.installBody, code: QUICKSTART_CODE.first },
      ],
      fullNotes: text.reusable.nextBody,
      expectedTitle: text.section.expected,
      expectedBody: text.reusable.expectedBody,
      expectedPorts: text.reusable.expectedBody,
      troubleshootingTitle: text.section.troubleshooting,
      troubleshooting: [
        { label: text.terms.node, body: text.reusable.installBody },
        { label: text.terms.packageManager, body: text.reusable.installBody },
        { label: text.terms.daemon, body: text.reusable.installBody },
        { label: text.terms.agent, body: text.reusable.installBody },
        { label: text.section.troubleshooting, body: text.reusable.installBody },
      ],
      nextTitle: text.section.next,
      nextItems: fourNextItems,
      ctaBody: text.reusable.ctaBody,
    },
    agents: {
      ...text.agents,
      heading: (count) => withCount(text.agents.heading, count),
      lead: (count) => withCount(text.agents.lead, count),
      adaptersTitle: text.section.adapters,
      adaptersBody: text.agents.description,
      tiers: [
        { label: 'Tier 1', blurb: text.reusable.itemBody },
        { label: 'Tier 2', blurb: text.reusable.itemBody },
        { label: 'Tier 3', blurb: text.reusable.itemBody },
      ],
      vendor: text.terms.source,
      credential: text.section.byok,
      byokTitle: text.section.byok,
      byokLead: text.reusable.byokBody,
      byokItems: [
        text.reusable.byokBody,
        text.reusable.localBody,
        text.reusable.itemBody,
        text.reusable.sourceBody,
      ],
      nextTitle: text.section.next,
      nextItems: fourNextItems,
      ctaTitle: (count) => withCount(text.agents.ctaTitle, count),
      ctaBody: text.reusable.ctaBody,
    },
    compare: {
      ...text.compare,
      toc: [
        'Claude Design',
        'Figma Make',
        'v0',
        'Lovable / Bolt',
        'Open CoDesign',
        text.section.limits,
      ],
      comparisons: comparisonNames.map((competitor) => ({
        competitor,
        summary: text.compare.lead,
        cta: text.section.continue,
      })),
      limitsTitle: text.section.limits,
      limitsBody: text.reusable.itemBody,
      limitsFaq: [
        { name: text.section.runtime, text: text.reusable.localBody },
        { name: text.section.byok, text: text.reusable.byokBody },
        { name: text.section.features, text: text.reusable.itemBody },
        { name: text.section.next, text: text.reusable.nextBody },
        { name: text.section.faq, text: text.compare.description },
      ],
    },
    claudeAlternative: {
      ...text.claudeAlternative,
      tldrTitle: text.section.summary,
      tldrBody: text.claudeAlternative.description,
      toc: [
        text.section.why,
        text.common.localFirst,
        text.section.features,
        text.section.decision,
        text.section.migrate,
        text.section.faq,
      ],
      whyTitle: text.section.why,
      whyLead: text.claudeAlternative.lead,
      reasons: [
        { label: text.section.runtime, body: text.reusable.localBody },
        { label: text.section.byok, body: text.reusable.byokBody },
        { label: text.terms.agent, body: text.reusable.itemBody },
        { label: text.terms.skillsSystems, body: text.reusable.itemBody },
        { label: text.section.details, body: text.reusable.sourceBody },
      ],
      localByokTitle: text.common.localFirst,
      localByokBody: [text.reusable.localBody, text.reusable.byokBody],
      featureTitle: text.section.features,
      features: [
        { name: text.section.details, od: text.terms.openChoice, cd: text.terms.closedChoice },
        { name: text.section.runtime, od: text.reusable.localBody, cd: text.terms.closedChoice },
        { name: text.terms.agent, od: text.reusable.byokBody, cd: text.terms.closedChoice },
        { name: text.section.byok, od: text.reusable.byokBody, cd: text.terms.closedChoice },
        { name: text.terms.skillsSystems, od: text.reusable.itemBody, cd: text.terms.closedChoice },
        { name: text.section.commands, od: text.reusable.installBody, cd: text.terms.closedChoice },
        { name: text.section.next, od: text.reusable.nextBody, cd: text.terms.closedChoice },
        { name: text.section.features, od: text.terms.openChoice, cd: text.terms.closedChoice },
        { name: text.section.runtime, od: text.terms.openChoice, cd: text.terms.closedChoice },
        { name: text.section.details, od: text.terms.openChoice, cd: text.terms.closedChoice },
      ],
      whoTitle: text.section.decision,
      pickClaudeTitle: 'Claude Design',
      pickClaude: [text.terms.closedChoice, text.reusable.nextBody, text.reusable.itemBody],
      pickOpenTitle: 'Open Design',
      pickOpen: [
        text.terms.openChoice,
        text.reusable.byokBody,
        text.reusable.localBody,
        text.reusable.itemBody,
      ],
      migrateTitle: text.section.migrate,
      migrateLead: text.reusable.installBody,
      migrateSteps: [
        text.reusable.installBody,
        text.reusable.localBody,
        text.reusable.itemBody,
        text.reusable.nextBody,
      ],
      migrateClosing: text.reusable.ctaBody,
      faqTitle: text.section.faq,
      faq: [
        { name: text.section.summary, text: text.claudeAlternative.description },
        { name: text.section.byok, text: text.reusable.byokBody },
        { name: text.section.runtime, text: text.reusable.localBody },
        { name: text.section.features, text: text.reusable.itemBody },
        { name: text.section.details, text: text.reusable.sourceBody },
        { name: text.section.next, text: text.reusable.nextBody },
      ],
      ctaBody: text.reusable.ctaBody,
    },
    // Localized /download copy per compact locale; English is the fallback
    // for any locale not yet in COMPACT_DOWNLOAD_COPY.
    download: COMPACT_DOWNLOAD_COPY[locale] ?? INFO_PAGE_COPY.en!.download,
  };
}

const COMPACT_INFO_PAGE_TEXT: Partial<
  Record<LandingLocaleCode, CompactInfoPageText>
> = {
  ja: {
    common: {
      breadcrumbAria: 'パンくず',
      onThisPage: 'このページ:',
      joinDiscord: 'Discord に参加',
      requestAdapter: 'アダプターを依頼',
      localFirst: 'ローカル優先',
    },
    section: {
      details: '詳細',
      names: '名称と別名',
      runtime: 'ローカル実行環境',
      next: '次のステップ',
      requirements: '要件',
      commands: 'コマンド',
      expected: '期待される状態',
      troubleshooting: 'トラブルシューティング',
      adapters: 'アダプター',
      byok: 'BYOK',
      limits: '正直な制約',
      summary: '要約',
      why: '選ばれる理由',
      features: '機能',
      decision: '選び方',
      migrate: '移行',
      faq: 'FAQ',
      continue: '詳しく読む',
    },
    terms: {
      source: '出典',
      desktop: 'デスクトップアプリ',
      daemon: 'ローカル daemon',
      skillsSystems: 'Skill と DESIGN.md',
      node: 'Node.js 24',
      packageManager: 'pnpm',
      git: 'git',
      agent: 'エージェント',
      clone: 'クローンとインストール',
      start: '起動',
      render: '最初の artifact を生成',
      openChoice: 'オープンソースでローカル優先',
      closedChoice: 'クラウド中心の管理型体験',
    },
    reusable: {
      sourceBody: 'この項目は Open Design の正規の入口と同じプロジェクトを指します。',
      itemBody: 'リポジトリ内のファイル、スキル、デザインシステムとして再利用できます。',
      nextBody: '次のページで手順、カタログ、比較を確認できます。',
      installBody: 'Node 24 と pnpm を用意し、ローカルの tools-dev フローで進めます。',
      expectedBody: 'daemon、Web UI、IPC 名前空間がローカルで起動していれば正常です。',
      byokBody: '鍵、支払い、データは利用者側に残り、呼び出し先のプロバイダーを選べます。',
      localBody: '出力はローカルプロジェクトのファイルとして扱われます。',
      ctaBody: 'リポジトリを確認し、デスクトップ版またはローカル CLI から試せます。',
    },
    official: {
      title: '公式 Open Design — 出典、GitHub、リリース、別名',
      description: 'Open Design の正規ページ、GitHub、リリース、コミュニティ、ライセンスをまとめた確認用ページです。',
      breadcrumb: '公式',
      label: '出典 · Nº 00',
      heading: '公式 Open Design 出典ページ。',
      lead: 'Open Design は nexu-io/open-design プロジェクトのオープンソース AI デザインワークスペースです。',
    },
    quickstart: {
      title: 'Open Design クイックスタート — Node 24 と pnpm で開始',
      description: 'Open Design をローカルに入れ、daemon、Web UI、最初の artifact まで進む手順です。',
      breadcrumb: 'クイックスタート',
      label: 'インストール · Nº 01',
      heading: 'Open Design クイックスタート。',
      lead: 'ローカル環境だけで起動し、既存のエージェントからデザイン生成を始められます。',
      ctaTitle: 'ローカルで始める。',
    },
    agents: {
      title: 'Open Design エージェント — {count} 個の BYOK アダプター',
      description: '普段使っているコーディングエージェントから Open Design のスキルを実行できます。',
      breadcrumb: 'エージェント',
      label: 'アダプター · Nº 04',
      heading: '{count} 個の BYOK エージェント、1 つのスキルプロトコル。',
      lead: 'Open Design は {count} 個のアダプターで、同じスキルと DESIGN.md を複数のエージェントから使えます。',
      ctaTitle: '{count} 個のアダプター。あなたのエージェント。',
    },
    compare: {
      title: 'Open Design と主要 AI デザインツールの比較',
      description: 'ローカル優先、BYOK、オープンソース、ポータブルな DESIGN.md という観点で比較します。',
      breadcrumb: '比較',
      label: '評価 · Nº 02',
      heading: 'Open Design と他の選択肢。',
      lead: 'Open Design はホスト型ツールではなく、エージェントで動かすローカル優先のデザイン層です。',
    },
    claudeAlternative: {
      title: 'Claude Design のオープンソース代替 — Open Design',
      description: 'Open Design は BYOK とローカル優先を軸にした Claude Design 代替です。',
      breadcrumb: 'Claude Design 代替',
      label: '代替 · Nº 03',
      heading: 'Claude Design のオープンソース代替。',
      lead: '既存のエージェント、ローカルファイル、ポータブルな DESIGN.md で同じ設計ループを自分の環境に置けます。',
      ctaTitle: '三つの手順で切り替え。',
    },
  },
};

const INFO_PAGE_LABELS: Record<
  LandingLocaleCode,
  {
    official: string;
    quickstart: string;
    agents: string;
    compare: string;
    alternative: string;
    source: string;
    details: string;
    next: string;
    guides: string;
  }
> = {
  en: {
    official: 'Official source',
    quickstart: 'Quickstart',
    agents: 'Agents',
    compare: 'Compare',
    alternative: 'Claude Design alternative',
    source: 'Source',
    details: 'Details',
    next: 'Next steps',
    guides: 'Guides',
  },
  zh: {
    official: '官方来源',
    quickstart: '快速开始',
    agents: 'Agent',
    compare: '对比',
    alternative: 'Claude Design 替代方案',
    source: '来源',
    details: '详情',
    next: '下一步',
    guides: '指南',
  },
  'zh-tw': {
    official: '官方來源',
    quickstart: '快速開始',
    agents: 'Agent',
    compare: '比較',
    alternative: 'Claude Design 替代方案',
    source: '來源',
    details: '詳情',
    next: '下一步',
    guides: '指南',
  },
  ja: {
    official: '公式情報',
    quickstart: 'クイックスタート',
    agents: 'エージェント',
    compare: '比較',
    alternative: 'Claude Design 代替',
    source: '出典',
    details: '詳細',
    next: '次のステップ',
    guides: 'ガイド',
  },
  ko: {
    official: '공식 출처',
    quickstart: '빠른 시작',
    agents: '에이전트',
    compare: '비교',
    alternative: 'Claude Design 대안',
    source: '출처',
    details: '세부 정보',
    next: '다음 단계',
    guides: '가이드',
  },
  de: {
    official: 'Offizielle Quelle',
    quickstart: 'Schnellstart',
    agents: 'Agenten',
    compare: 'Vergleich',
    alternative: 'Claude-Design-Alternative',
    source: 'Quelle',
    details: 'Details',
    next: 'Nächste Schritte',
    guides: 'Leitfäden',
  },
  fr: {
    official: 'Source officielle',
    quickstart: 'Démarrage rapide',
    agents: 'Agents',
    compare: 'Comparaison',
    alternative: 'Alternative à Claude Design',
    source: 'Source',
    details: 'Détails',
    next: 'Étapes suivantes',
    guides: 'Guides',
  },
  ru: {
    official: 'Официальный источник',
    quickstart: 'Быстрый старт',
    agents: 'Агенты',
    compare: 'Сравнение',
    alternative: 'Альтернатива Claude Design',
    source: 'Источник',
    details: 'Подробности',
    next: 'Следующие шаги',
    guides: 'Руководства',
  },
  es: {
    official: 'Fuente oficial',
    quickstart: 'Inicio rápido',
    agents: 'Agentes',
    compare: 'Comparación',
    alternative: 'Alternativa a Claude Design',
    source: 'Fuente',
    details: 'Detalles',
    next: 'Siguientes pasos',
    guides: 'Guías',
  },
  'pt-br': {
    official: 'Fonte oficial',
    quickstart: 'Início rápido',
    agents: 'Agentes',
    compare: 'Comparação',
    alternative: 'Alternativa ao Claude Design',
    source: 'Fonte',
    details: 'Detalhes',
    next: 'Próximos passos',
    guides: 'Guias',
  },
  it: {
    official: 'Fonte ufficiale',
    quickstart: 'Avvio rapido',
    agents: 'Agenti',
    compare: 'Confronto',
    alternative: 'Alternativa a Claude Design',
    source: 'Fonte',
    details: 'Dettagli',
    next: 'Passi successivi',
    guides: 'Guide',
  },
  vi: {
    official: 'Nguồn chính thức',
    quickstart: 'Bắt đầu nhanh',
    agents: 'Tác nhân',
    compare: 'So sánh',
    alternative: 'Phương án thay thế Claude Design',
    source: 'Nguồn',
    details: 'Chi tiết',
    next: 'Bước tiếp theo',
    guides: 'Hướng dẫn',
  },
  pl: {
    official: 'Oficjalne źródło',
    quickstart: 'Szybki start',
    agents: 'Agenci',
    compare: 'Porównanie',
    alternative: 'Alternatywa dla Claude Design',
    source: 'Źródło',
    details: 'Szczegóły',
    next: 'Następne kroki',
    guides: 'Przewodniki',
  },
  id: {
    official: 'Sumber resmi',
    quickstart: 'Mulai cepat',
    agents: 'Agen',
    compare: 'Perbandingan',
    alternative: 'Alternatif Claude Design',
    source: 'Sumber',
    details: 'Detail',
    next: 'Langkah berikutnya',
    guides: 'Panduan',
  },
  nl: {
    official: 'Officiële bron',
    quickstart: 'Snelstart',
    agents: 'Agents',
    compare: 'Vergelijking',
    alternative: 'Alternatief voor Claude Design',
    source: 'Bron',
    details: 'Details',
    next: 'Volgende stappen',
    guides: 'Gidsen',
  },
  ar: {
    official: 'المصدر الرسمي',
    quickstart: 'البدء السريع',
    agents: 'الوكلاء',
    compare: 'المقارنة',
    alternative: 'بديل Claude Design',
    source: 'المصدر',
    details: 'التفاصيل',
    next: 'الخطوات التالية',
    guides: 'الأدلة',
  },
  tr: {
    official: 'Resmi kaynak',
    quickstart: 'Hızlı başlangıç',
    agents: 'Ajanlar',
    compare: 'Karşılaştırma',
    alternative: 'Claude Design alternatifi',
    source: 'Kaynak',
    details: 'Ayrıntılar',
    next: 'Sonraki adımlar',
    guides: 'Kılavuzlar',
  },
  uk: {
    official: 'Офіційне джерело',
    quickstart: 'Швидкий старт',
    agents: 'Агенти',
    compare: 'Порівняння',
    alternative: 'Альтернатива Claude Design',
    source: 'Джерело',
    details: 'Деталі',
    next: 'Наступні кроки',
    guides: 'Посібники',
  },
};

function registerCompactInfoCopy(
  locale: LandingLocaleCode,
  text: CompactInfoPageText,
): void {
  INFO_PAGE_COPY[locale] = compactInfoPageCopy(locale, text);
}

for (const [locale, text] of Object.entries(COMPACT_INFO_PAGE_TEXT)) {
  registerCompactInfoCopy(locale as LandingLocaleCode, text);
}

function compactInfoTextFromHome(locale: LandingLocaleCode): CompactInfoPageText {
  const common = getCommonCopy(locale);
  const ui = getLandingUiCopy(locale);
  const home = getHomePageCopy(locale);
  const labels = INFO_PAGE_LABELS[locale];
  const lead = home.hero.lead('132', '150');
  const heroTitle = [
    home.hero.titlePrefix,
    home.hero.titleEmphasis,
    home.hero.titleMiddle,
    home.hero.titleSecondEmphasis,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const summary = ui.footer.summary || lead;
  const readMore = ui.blog.readMore || ui.blog.read || ui.blog.nextStep;

  return {
    common: {
      breadcrumbAria: common.header.brandMetaTitle,
      onThisPage: ui.blog.categoriesLabel,
      joinDiscord: home.hero.joinDiscord,
      requestAdapter: ui.footer.agents,
      localFirst: common.topbar.madeOnEarth,
    },
    section: {
      details: labels.details,
      names: labels.official,
      runtime: common.topbar.live,
      next: labels.next,
      requirements: labels.quickstart,
      commands: labels.quickstart,
      expected: labels.details,
      troubleshooting: labels.guides,
      adapters: labels.agents,
      byok: 'BYOK',
      limits: labels.compare,
      summary: labels.details,
      why: labels.compare,
      features: common.header.nav.skills,
      decision: labels.compare,
      migrate: labels.alternative,
      faq: labels.guides,
      continue: readMore,
    },
    terms: {
      source: labels.source,
      desktop: common.header.downloadTitle,
      daemon: 'od',
      skillsSystems: `${common.header.nav.skills} + ${common.header.nav.systems}`,
      node: 'Node.js 24',
      packageManager: 'pnpm',
      git: 'git',
      agent: labels.agents,
      clone: labels.quickstart,
      start: common.topbar.live,
      render: common.header.nav.templates,
      openChoice: summary,
      closedChoice: labels.compare,
    },
    reusable: {
      sourceBody: summary,
      itemBody: lead,
      nextBody: ui.blog.nextStep,
      installBody: lead,
      expectedBody: summary,
      byokBody: lead,
      localBody: summary,
      ctaBody: readMore,
    },
    official: {
      title: `${labels.official} · Open Design`,
      description: summary,
      breadcrumb: labels.official,
      label: labels.official,
      heading: `${labels.official} · Open Design`,
      lead,
    },
    quickstart: {
      title: `${labels.quickstart} · Open Design`,
      description: lead,
      breadcrumb: labels.quickstart,
      label: labels.quickstart,
      heading: `${labels.quickstart} · Open Design`,
      lead,
      ctaTitle: labels.next,
    },
    agents: {
      title: `${labels.agents} · Open Design`,
      description: lead,
      breadcrumb: labels.agents,
      label: labels.agents,
      heading: `{count} ${labels.agents}`,
      lead,
      ctaTitle: `{count} ${labels.agents}`,
    },
    compare: {
      title: `${labels.compare} · Open Design`,
      description: summary,
      breadcrumb: labels.compare,
      label: labels.compare,
      heading: `${labels.compare} · Open Design`,
      lead,
    },
    claudeAlternative: {
      title: `${labels.alternative} · Open Design`,
      description: summary,
      breadcrumb: labels.alternative,
      label: labels.alternative,
      heading: `${labels.alternative} · Open Design`,
      lead: heroTitle ? `${heroTitle}. ${lead}` : lead,
      ctaTitle: labels.next,
    },
  };
}

export function getInfoPageCopy(locale: LandingLocaleCode): InfoPageCopy {
  return (
    INFO_PAGE_COPY[locale] ??
    compactInfoPageCopy(locale, compactInfoTextFromHome(locale)) ??
    INFO_PAGE_COPY[DEFAULT_LOCALE]!
  );
}

export const quickstartCode = QUICKSTART_CODE;
