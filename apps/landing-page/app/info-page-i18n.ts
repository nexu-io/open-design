import {
  DEFAULT_LOCALE,
  getCommonCopy,
  getHomePageCopy,
  getLandingUiCopy,
  type LandingLocaleCode,
} from './i18n';
import { buildLocalizedAgentGuides } from './agent-guides.i18n';

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

// One per-agent detail page (`/agents/<slug>/`). The hub at `/agents/`
// links into these. `links` are real, externally-verified resources
// about using that agent for design work — never fabricate URLs here.
type AgentResourceLink = {
  label: string;
  href: string;
  source: string; // short attribution shown in the UI, e.g. "YouTube · Steve Schoger"
};

// A single block inside a rich (long-form) agent guide section. Blocks
// render in order: prose paragraphs, ordered/unordered lists, a fenced
// code block, an image with alt text, or a comparison table.
type AgentRichBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ol'; items: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'steps'; items: LinkText[] } // bolded label + body
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'image'; src: string; alt: string; caption?: string }
  | {
      kind: 'table';
      columns: string[];
      rows: string[][];
    };

type AgentRichSection = {
  // Stable anchor id used by the on-this-page TOC and deep links.
  id: string;
  heading: string;
  blocks: AgentRichBlock[];
};

// One head CTA action. `variant: 'primary'` is the highlighted button.
type AgentCtaAction = {
  label: string;
  href: string;
  variant: 'primary' | 'ghost';
  external?: boolean;
};

// Optional long-form payload. When present, the detail page renders the
// industrial how-to layout (hero CTA + deep sections) instead of the
// short default layout. Only pages that opt in carry this; the rest keep
// the compact shape below untouched.
type AgentRichCopy = {
  heroCtaLead: string;
  heroCtaActions: AgentCtaAction[];
  intro: string[];
  heroImage?: { src: string; alt: string; caption?: string };
  tocLabel: string;
  toc: { id: string; label: string }[];
  sections: AgentRichSection[];
  faqTitle: string;
  faq: NamedText[];
  ctaTitle: string;
  ctaBody: string;
  ctaActions: AgentCtaAction[];
  hubLinkLabel: string;
};

type AgentGuideCopy = {
  title: string;
  description: string;
  breadcrumb: string;
  label: string;
  heading: string;
  lead: string;
  tldrTitle: string;
  tldrBody: string;
  toc: string[];
  // Optional industrial long-form content. Present only on upgraded pages.
  rich?: AgentRichCopy;
  // "What is <agent>"
  aboutTitle: string;
  aboutBody: string[];
  vendorLabel: string;
  vendor: string;
  credentialLabel: string;
  credential: string;
  // "How people use <agent> for design"
  designTitle: string;
  designLead: string;
  designPoints: LinkText[];
  // Real, citable resources
  linksTitle: string;
  linksLead: string;
  links: AgentResourceLink[];
  // "With Open Design" — the drive-to-OD section
  withOdTitle: string;
  withOdLead: string;
  withOdSteps: string[];
  withOdClosing: string;
  faqTitle: string;
  faq: NamedText[];
  ctaTitle: string;
  ctaBody: string;
};

// Shape of one competitor comparison ("alternative") detail page.
// Mirrors the original `claudeAlternative` block so every per-competitor
// page under `/alternatives/<slug>/` shares one structure. The
// `pickClaude*` field names are historical — read them as "pick the
// competitor".
type AlternativeDetailCopy = {
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
  // Per-agent detail pages, keyed by slug (`claude-code`, `codex`,
  // `cursor`, `opencode`). Partial: non-en locales that don't override
  // a given slug inherit the English copy via the `...en` spread.
  agentGuides: Partial<Record<string, AgentGuideCopy>>;
  // Per-competitor comparison pages, keyed by slug (`lovable`, `figma`,
  // `bolt`, `v0`, `framer`). Optional + Partial: only en supplies copy
  // today; every other locale falls back to en via `getAlternativeCopy`.
  alternatives?: Partial<Record<string, AlternativeDetailCopy>>;
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
    alternatives: {
      lovable: {
        title: 'Open-source Lovable alternative — Open Design (design-first, BYOK, local)',
        description:
          'Open Design is the open-source, local-first alternative to Lovable for design-first work. BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen — artifacts ship as files in your repo.',
        breadcrumb: 'Open-source Lovable alternative',
        label: 'Alternative · Lovable',
        heading: 'Open-source Lovable alternative.',
        lead:
          'Lovable turns a prompt into a deployed full-stack app. Open Design is a self-evolving design agent for Claude Code — local-first, BYOK, open source — focused on design artifacts and a portable brand rather than shipping the backend. Different primary job, overlapping prompt-to-UI surface.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Lovable ships hosted apps; Open Design ships design artifacts as files you own. If you want a design-first, BYOK, open-source workflow with your own agent, Open Design is the alternative — and it is honest about where Lovable wins.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Lovable alternative',
        whyLead: 'A few reasons keep showing up when teams look past Lovable:',
        reasons: [
          { label: 'Own the output.', body: 'Designs and code should live as files in your repo, not inside a hosted project.' },
          { label: 'BYOK economics.', body: 'Bring your own provider key; API spend bills to your account instead of per-message credits.' },
          { label: 'Agent choice.', body: 'Drive design from the coding agent you already use — Claude Code, Codex, Cursor, and more.' },
          { label: 'Open source.', body: 'Apache-2.0, full source, self-hostable and rebrandable for your studio.' },
          { label: 'Design-first.', body: 'A portable DESIGN.md brand every skill respects, not one-off per-project styling.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Open Design runs a desktop app, a local daemon, and Markdown skill/system catalogs on your machine — no design output is forced through a vendor cloud.',
          'You bring your own agent key (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen). Credentials stay in local config or environment variables, and API spend bills to you.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'Primary job', od: 'Design-first artifacts + portable brand', cd: 'Prompt-to-deployed full-stack app' },
          { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Closed-source, hosted product' },
          { name: 'Runtime', od: 'Local daemon on your machine', cd: 'Vendor cloud' },
          { name: 'Agent', od: 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', cd: 'Vendor-managed models' },
          { name: 'API spend', od: 'Bills to your account', cd: 'Per-message credits / subscription' },
          { name: 'Design system', od: 'Portable DESIGN.md in your repo', cd: 'Per-project styling' },
          { name: 'Output ownership', od: 'Files in your project directory', cd: 'Hosted project + code export' },
          { name: 'Hosting / deploy', od: 'You own deploy; not bundled', cd: 'One-click hosting included' },
          { name: 'Self-host', od: 'Yes, run anywhere Node 24 runs', cd: 'No' },
          { name: 'CLI / CI', od: 'Yes via od CLI + HTTP daemon', cd: 'Web UI first' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Lovable if',
        pickClaude: [
          'You want a deployed full-stack web app from a prompt with zero setup.',
          'You want one-click hosting and the backend wired up for you.',
          'You prefer a hosted UI and per-project credits over local files.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You want design artifacts and a brand as version-controlled files.',
          'You want BYOK with your existing coding agent.',
          'You want open source you can fork, rebrand, embed in CLI, or self-host.',
          'You want one DESIGN.md per brand that every skill respects.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'There is no automatic import from Lovable today; start design-first with a one-time brand-extraction run:',
        migrateSteps: [
          'Install Open Design from the quickstart.',
          'Open the web UI and point your agent at a Lovable project or screenshot you like.',
          'Ask the agent to extract the brand into a DESIGN.md file.',
          'Pick a skill and render it against your new brand.',
        ],
        migrateClosing:
          'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Open Design a drop-in replacement for Lovable?', text: 'No. Lovable ships deployed full-stack apps; Open Design is design-first and produces artifacts you own. They overlap on prompt-to-UI, not on hosting a backend.' },
          { name: 'Can Open Design build a full app like Lovable?', text: 'Open Design focuses on design artifacts, prototypes, and brand systems. For production backends and one-click hosting, Lovable is the better fit.' },
          { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. API spend bills to your account.' },
          { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
          { name: 'Can I keep using Lovable alongside Open Design?', text: 'Yes. Many teams prototype design in Open Design and ship apps in Lovable; migration is manual today.' },
          { name: 'Why "open-source Lovable alternative" rather than "AI design tool"?', text: 'That is how many teams describe the product shape they are searching for when they want files and BYOK.' },
        ],
        ctaTitle: 'Design-first, in three commands.',
        ctaBody:
          'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
      },
    },
    agentGuides: {
      'claude-code': {
        title: 'Claude Code for design — Open Design',
        description:
          'How designers use Claude Code for UI and web design, and how Open Design turns it into a real design agent — local-first, BYOK, with a curated skill and design-system library.',
        breadcrumb: 'Claude Code',
        label: 'Agent · Claude Code',
        heading: 'Claude Code for design.',
        lead: 'Claude Code is Anthropic’s terminal coding agent. People already use it to build UIs, design systems, and landing pages. Open Design plugs it into a real design workflow — bring your Anthropic key or Claude subscription, keep every file local.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Claude Code is a strong design generator once you give it taste — a design system, an aesthetic skill, a screenshot loop. Open Design ships exactly that as a local-first, open-source layer. Point Claude Code at it with your own key and start designing.',
        toc: ['What is Claude Code', 'Designing with Claude Code', 'Resources', 'With Open Design', 'FAQ'],
        rich: {
          heroCtaLead:
            'Open Design turns Claude Code into a local-first, open-source design agent — your Anthropic key or Claude subscription, your files, a curated skill and design-system library around it.',
          heroCtaActions: [
            { label: 'Use Claude Code inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          intro: [
            'Claude Code is widely regarded as the coding agent with the best frontend taste — it reasons about interfaces with unusual specificity, naming exact hex values, spacing, and type scales, and it refactors UI across a large codebase without losing the thread. But out of the box it still drifts toward a generic look unless you hand it a design system, skills, and real references. This is a practical, end-to-end guide to using Claude Code for UI, frontend, and design-system work, and to wiring it into a structured workflow with Open Design.',
            'It covers what Claude Code actually is, why it is strong at frontend, how to set it up from zero, the CLAUDE.md and Skills workflow, the official Figma round-trip, how it compares to Codex and Cursor, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer.',
          ],
          heroImage: {
            src: '/agents/claude-code-design/claude-code-design-hero.webp',
            alt: 'Claude Code design feedback loop: terminal agent making specific design decisions, a browser rendering the UI, and a workspace, with a feedback arrow looping back',
            caption: 'The core loop: Claude Code reasons out specific UI decisions in the terminal, renders and verifies them in a real browser, and converges against your references.',
          },
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-claude-code', label: 'What Claude Code actually is' },
            { id: 'why-design', label: 'Why Claude Code is good at design' },
            { id: 'setup', label: 'Set up Claude Code for design (from zero)' },
            { id: 'skills-workflow', label: 'The CLAUDE.md and Skills workflow' },
            { id: 'figma', label: 'Claude Code + Figma round-trip' },
            { id: 'vs', label: 'Claude Code vs Codex vs Cursor' },
            { id: 'pitfalls', label: 'Pitfalls and the “AI slop” look' },
            { id: 'open-design', label: 'Designing with Claude Code in Open Design' },
            { id: 'faq', label: 'FAQ' },
          ],
          sections: [
            {
              id: 'what-is-claude-code',
              heading: 'What Claude Code actually is',
              blocks: [
                { kind: 'p', text: 'Claude Code is Anthropic’s agentic coding tool. It reads your codebase, edits files, runs commands, and integrates with your dev tools — planning, writing, and verifying work from natural-language tasks rather than just autocompleting lines.' },
                { kind: 'p', text: 'It ships across several surfaces that all share the same engine: a terminal CLI, IDE extensions for VS Code, Cursor, and JetBrains, a desktop app with visual diff review, and a web experience for long-running tasks. Your CLAUDE.md files, settings, and MCP servers carry across all of them.' },
                { kind: 'steps', items: [
                  { label: 'Instruction file', body: 'Claude Code reads a CLAUDE.md file in your project root at the start of every session — the natural place to encode your design conventions, tokens, and review checklists.' },
                  { label: 'Skills', body: 'Agent Skills package repeatable instructions, scripts, and resources that Claude loads on demand, including Anthropic’s official Frontend Design skill for taste.' },
                  { label: 'Plan and subagents', body: 'It can plan before acting and spawn subagents that work on different parts of a task in parallel, which keeps large UI refactors coherent.' },
                ] },
                { kind: 'ul', items: [
                  'Vendor: Anthropic',
                  'Credential: Anthropic API key (BYOK, via the Console) or a Claude subscription (Pro / Max)',
                  'Surfaces: terminal CLI, VS Code / Cursor / JetBrains extensions, desktop app, web',
                ] },
              ],
            },
            {
              id: 'why-design',
              heading: 'Why Claude Code is good at design',
              blocks: [
                { kind: 'p', text: 'Among coding agents, Claude Code has a reputation for taste in frontend work. A few things explain it.' },
                { kind: 'steps', items: [
                  { label: 'Specific, not vague, decisions', body: 'Claude Code tends to commit to concrete choices — exact hex values, spacing scales, type ramps, and component hierarchy — instead of hand-waving, which is what separates a real interface from a placeholder.' },
                  { label: 'Codebase-aware reasoning', body: 'With a large working context it refactors UI across many files at once, reusing your existing components and tokens rather than reinventing one-off styles.' },
                  { label: 'An official frontend skill', body: 'Anthropic ships a Frontend Design skill that makes Claude write a design direction first and deliberately steers away from generic system fonts and predictable purple gradients.' },
                ] },
                { kind: 'image', src: '/agents/claude-code-design/claude-code-design-taste-triangle.webp', alt: 'Diagram showing design system, skill, and reference image converging into good design output', caption: 'Taste comes from three inputs you provide: a design system, a skill, and real reference images.' },
                { kind: 'p', text: 'The lesson is the same one Anthropic makes about its own models: Claude does not have taste by default — left alone it converges on the statistical center of web design (Inter, purple gradients, soft shadows). It produces good design when you give it constraints. Open Design packages exactly those inputs, which is why the two fit together (more below).' },
              ],
            },
            {
              id: 'setup',
              heading: 'Set up Claude Code for design work, from zero',
              blocks: [
                { kind: 'p', text: 'Here is the full path from a clean machine to a Claude Code that can build and verify UI.' },
                { kind: 'code', lang: 'bash', code: '# 1. Install Claude Code (native install, recommended)\ncurl -fsSL https://claude.ai/install.sh | bash\n# or: brew install --cask claude-code\n# Windows PowerShell: irm https://claude.ai/install.ps1 | iex\n\n# 2. Start it in your project and sign in on first run\ncd your-project\nclaude            # sign in with your Claude subscription or API key\n\n# 3. Generate project context\n/init             # creates a CLAUDE.md for this project\n\n# 4. Add the official Frontend Design skill\nclaude plugin install frontend-design@claude-plugins-official\n\n# 5. Wire the Figma MCP server (optional, for design handoff)\nclaude plugin install figma@claude-plugins-official' },
                { kind: 'image', src: '/agents/claude-code-design/claude-code-design-setup-flow.webp', alt: 'Five-step setup flow: install, authenticate, configure CLAUDE.md, add skill, verify', caption: 'The setup sequence: install → authenticate → configure CLAUDE.md → add the Frontend Design skill → enable browser verification.' },
                { kind: 'steps', items: [
                  { label: 'Encode your design rules', body: 'Put your tokens, primitives, and conventions in CLAUDE.md and point Claude at them, so output matches a brand instead of defaulting to a generic look.' },
                  { label: 'Add browser verification', body: 'Wire a Playwright or Chrome MCP so Claude renders in a real browser and checks its output across breakpoints instead of only confirming the build passes.' },
                ] },
              ],
            },
            {
              id: 'skills-workflow',
              heading: 'The CLAUDE.md and Skills workflow',
              blocks: [
                { kind: 'p', text: 'The highest-leverage design loop with Claude Code is feeding it real references plus your design context, then iterating until the UI matches — with CLAUDE.md and Skills carrying the constraints so you do not re-explain them every prompt.' },
                { kind: 'ol', items: [
                  'Start from the clearest visual references you have — and include multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.',
                  'Be specific in the prompt; vague prompts produce generic UI even with a strong agent.',
                  'Keep your design system and conventions in CLAUDE.md, and tell Claude where the tokens and canonical primitives live.',
                  'Add the Frontend Design skill so Claude commits to a real aesthetic direction before writing code.',
                  'Wire browser verification so Claude renders, resizes to breakpoints, and compares back to the references — not merely confirms it builds.',
                ] },
                { kind: 'p', text: 'Drop a reference image into the session and prompt with concrete constraints:' },
                { kind: 'code', lang: 'bash', code: 'claude "Implement reference-desktop.png and reference-mobile.png in\n  React + Vite + Tailwind + TypeScript.\n  Reuse the design-system components and tokens described in CLAUDE.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser, verify it matches the references across\n  breakpoints, and iterate until it does."' },
                { kind: 'p', text: 'Run a dev server alongside, keep prompts small and focused, and commit good iterations / revert bad ones (telling Claude when you revert) so each pass builds on a clean base. Use plan mode for larger refactors so you can review the approach before any file changes.' },
              ],
            },
            {
              id: 'figma',
              heading: 'Claude Code + Figma: design ↔ code round-trip',
              blocks: [
                { kind: 'p', text: 'In February 2026 Anthropic and Figma shipped a first-class, bidirectional integration via the Figma MCP server. It works in both directions.' },
                { kind: 'steps', items: [
                  { label: 'Design → Code', body: 'Select a frame in Figma or paste a link into Claude Code, pull the design context, and ask it to implement the design using your existing component library. Code Connect keeps output aligned with your real components.' },
                  { label: 'Code → Design', body: 'Build and preview a feature in the browser, then say “Send this to Figma” to capture the running UI as editable Figma layers — entire screen or a selected element.' },
                ] },
                { kind: 'p', text: 'Install it once with claude plugin install figma@claude-plugins-official (Dev Mode MCP requires a paid Figma plan). The same Figma MCP is available to Claude Code, Codex, Cursor, and VS Code — exactly the kind of portable, multi-agent capability Open Design is built to orchestrate.' },
              ],
            },
            {
              id: 'vs',
              heading: 'Claude Code vs Codex vs Cursor for design',
              blocks: [
                { kind: 'p', text: 'There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:' },
                { kind: 'table', columns: ['Agent', 'Design strength', 'Best for'], rows: [
                  ['Claude Code', 'Specific design decisions (hex, spacing, type) and codebase-aware UX reasoning', 'Frontend reasoning and large-context refactors'],
                  ['Codex', 'Strong visual polish and image understanding; sandboxed async builds', 'Delegated async builds and portable AGENTS.md rules'],
                  ['Cursor', 'Visual build-and-see loop with live preview and inline edits', 'Tight iterate-and-watch UI work inside an IDE'],
                ] },
                { kind: 'p', text: 'The recurring community verdict is that taste comes from humans: all three default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped.' },
              ],
            },
            {
              id: 'pitfalls',
              heading: 'Pitfalls, and how to avoid the “AI slop” look',
              blocks: [
                { kind: 'p', text: 'Even with Claude Code’s reputation for taste, the most common complaint about AI-generated design is that it looks generic — Inter fonts, purple gradients on white, soft shadows, oversized rounded corners, an aesthetic that “screams an AI made this.” Anthropic itself attributes this to distributional convergence: safe choices dominate web training data. Other reported issues include broken mobile layouts and instructions leaking into UI copy.' },
                { kind: 'steps', items: [
                  { label: 'Install the Frontend Design skill', body: 'It forces Claude to commit to a real direction and explicitly avoids fonts and gradients overused by AI.' },
                  { label: 'Enable browser verification', body: 'Make Claude render and self-check across breakpoints so layouts do not silently break on mobile.' },
                  { label: 'Supply tokens and references', body: 'Real design tokens and reference screenshots are the single biggest lever on output quality.' },
                  { label: 'Encode rules in CLAUDE.md', body: 'Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run.' },
                ] },
                { kind: 'p', text: 'Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes.' },
              ],
            },
            {
              id: 'open-design',
              heading: 'Designing with Claude Code inside Open Design',
              blocks: [
                { kind: 'p', text: 'Open Design is the open-source design layer the workflow above keeps asking for. It treats Claude Code as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes Claude Code good is there from the first run, not assembled by hand each time.' },
                { kind: 'ol', items: [
                  'Install Open Design and select Claude Code as your agent.',
                  'Authenticate with your Anthropic API key (BYOK) or Claude subscription — credentials stay on your machine and are never proxied through us.',
                  'Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.',
                  'Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud.',
                ] },
                { kind: 'p', text: 'Same Claude Code agent, same key — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine.' },
              ],
            },
          ],
          faqTitle: 'Frequently asked questions',
          faq: [
            { name: 'Is Claude Code good for design work?', text: 'Yes — it is widely regarded as the coding agent with the best frontend taste, making specific, codebase-aware decisions about hex values, spacing, and type scales. With the Frontend Design skill, a design system, and real reference images in context it produces production-quality, responsive UI and can verify it in a browser. Without that context it tends to default to a generic look, which is the gap Open Design fills.' },
            { name: 'Do I need a Claude subscription to design with Claude Code?', text: 'You can use either an Anthropic API key (BYOK, via the Console) or a Claude subscription (Pro / Max). Either way Open Design never proxies your credentials — they are used directly by your agent on your machine.' },
            { name: 'Claude Code or Codex for frontend design?', text: 'Both are strong. Claude Code is known for specific, codebase-aware design decisions and frontend reasoning; Codex has strong visual polish and excels at delegated, sandboxed builds. Many teams use both — Open Design lets you switch agents without changing your design workflow.' },
            { name: 'How do I connect Claude Code to Figma?', text: 'Install the official Figma plugin with claude plugin install figma@claude-plugins-official. You can then implement Figma frames in code using the design context, and push a running UI back to editable Figma frames with “Send this to Figma.” Dev Mode MCP requires a paid Figma plan.' },
            { name: 'What are Skills and CLAUDE.md?', text: 'CLAUDE.md is a markdown file in your project root that Claude Code reads at the start of every session — the place to encode your design conventions. Skills package repeatable instructions and resources Claude loads on demand, including Anthropic’s official Frontend Design skill. Open Design ships a curated library of both so you skip the per-project setup.' },
            { name: 'How do I avoid the generic “AI slop” aesthetic?', text: 'Install the Frontend Design skill, supply real design tokens and reference screenshots, encode brand rules in CLAUDE.md, and enable browser verification. Open Design ships these as a curated library so you skip the per-project setup.' },
            { name: 'Is Open Design affiliated with Anthropic?', text: 'No. Claude Code is a product of Anthropic; Open Design is an independent open-source project that supports it as a first-party adapter. Claude and Claude Code are trademarks of Anthropic.' },
            { name: 'Are my files and credentials safe?', text: 'Yes — Open Design is local-first and Apache-2.0. Your files, artifacts, and DESIGN.md stay in your own repo, and your Anthropic credentials are used directly by your agent, never routed through Open Design servers.' },
          ],
          ctaTitle: 'Design with Claude Code, the open way.',
          ctaBody: 'Bring your own Anthropic key or Claude subscription, keep every file local, and get a curated design library around the agent you already use.',
          ctaActions: [
            { label: 'Use Claude Code inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all supported agents',
        },
        aboutTitle: 'What is Claude Code',
        aboutBody: [
          'Claude Code is Anthropic’s agentic command-line tool: you describe a task in natural language and it reads, writes, and runs code in your project until the task is done.',
          'It is a coding agent, not a design tool — but design is one of its strongest emergent uses. With the right skills and a design system in context, it generates production HTML/CSS/React, iterates on screenshots, and maintains design tokens.',
          'Open Design treats Claude Code as a first-party adapter, so the same agent you code with becomes the engine behind a structured design workflow.',
        ],
        vendorLabel: 'Vendor',
        vendor: 'Anthropic',
        credentialLabel: 'Credential',
        credential: 'Anthropic API key (BYOK) or Claude subscription',
        designTitle: 'Designing with Claude Code',
        designLead:
          'The community has converged on a few patterns that turn Claude Code from a generic code generator into something with real design judgment:',
        designPoints: [
          { label: 'Design system first', body: 'Drop a DESIGN.md / tokens / Tailwind config into the project so output matches a brand instead of defaulting to “AI slop”.' },
          { label: 'Aesthetic skills', body: 'Skills like Anthropic’s frontend-design make Claude Code commit to a typography/color/motion direction before writing any markup.' },
          { label: 'Figma → code', body: 'Wire the Figma MCP server in and Claude Code turns frames into production components with real tokens.' },
          { label: 'Screenshot loop', body: 'Let it screenshot its own UI, compare to a reference, and iterate — the agentic design feedback loop.' },
        ],
        linksTitle: 'Real-world resources',
        linksLead: 'Tutorials, skills, and walkthroughs people are actually using to design with Claude Code:',
        links: [
          { label: 'Designing with Claude Code (Steve Schoger, Tailwind Labs)', href: 'https://www.youtube.com/watch?v=lkKGQVHrXzE', source: 'YouTube · Steve Schoger' },
          { label: 'Claude Code for Designers in 10 Minutes', href: 'https://www.youtube.com/watch?v=NMi2LnFrUxw', source: 'YouTube · Adrien' },
          { label: 'anthropics/skills — frontend-design skill', href: 'https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md', source: 'GitHub · Anthropic' },
          { label: 'Claude Code for designers — full tutorial', href: 'https://www.builder.io/blog/claude-code-for-designers', source: 'Blog · Builder.io' },
          { label: 'The web design workflow that actually works', href: 'https://tutorialsdojo.com/claude-code-the-web-design-workflow-that-actually-works/', source: 'Blog · Tutorials Dojo' },
        ],
        withOdTitle: 'Claude Code + Open Design',
        withOdLead:
          'Open Design is the design layer Claude Code is missing: a curated skill and design-system library, a structured render pipeline, and a desktop UI — all open-source and local-first.',
        withOdSteps: [
          'Install Open Design and select Claude Code as your agent.',
          'Authenticate with your Anthropic API key (BYOK) or Claude subscription — nothing is proxied through us.',
          'Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.',
          'Every artifact and DESIGN.md file stays in your own repo.',
        ],
        withOdClosing:
          'Same agent, same key — plus a real design workflow around it.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Can Claude Code really do design work?', text: 'Yes — with a design system and aesthetic skills in context it generates production-quality UI. Open Design provides both out of the box so you skip the setup.' },
          { name: 'Do I need a Claude subscription?', text: 'You can use either an Anthropic API key (BYOK) or your Claude subscription. Open Design never proxies your credentials.' },
          { name: 'Is this an official Anthropic product?', text: 'No. Open Design is an independent open-source project. Claude Code is a trademark of Anthropic; we integrate with it as a first-party adapter.' },
        ],
        ctaTitle: 'Design with Claude Code, the open way.',
        ctaBody: 'Star the repo, download the desktop app, or join the community to request an adapter.',
      },
      codex: {
        title: 'Codex for design — Open Design',
        description:
          'How people use OpenAI Codex for UI and web design — the Product Design plugin, Figma integration, frontend skills — and how Open Design turns Codex into a local-first, open-source design agent.',
        breadcrumb: 'Codex',
        label: 'Agent · Codex',
        heading: 'Codex for design.',
        lead: 'Codex is OpenAI’s coding agent. With its Product Design plugin and Figma integration it has become a serious design tool. Open Design wires Codex into an open-source design workflow — your OpenAI key or ChatGPT subscription, your files, local-first.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Codex turns screenshots and user stories into responsive UI, and round-trips designs to Figma. Open Design gives it a curated design-system and skill library plus a desktop workflow — bring your own key and keep everything local.',
        toc: ['What is Codex', 'Designing with Codex', 'Resources', 'With Open Design', 'FAQ'],
        rich: {
          heroCtaLead:
            'Open Design turns Codex into a local-first, open-source design agent — your OpenAI key, your files, a curated skill and design-system library around it.',
          heroCtaActions: [
            { label: 'Use Codex inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          intro: [
            'OpenAI Codex started as a code generator, but in 2026 it became a credible tool for designing real interfaces — once you give it the right references, skills, and verification loop. This is a practical, end-to-end guide to using Codex for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.',
            'It covers what Codex is today, why it is suddenly good at frontend, how to set it up from zero, the screenshot-to-UI loop, the official Figma round-trip, how it compares to Cursor and Claude Code, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer.',
          ],
          heroImage: {
            src: '/agents/codex-design/codex-design-workflow-loop.webp',
            alt: 'Codex design feedback loop: terminal agent, browser rendering the UI, and a workspace, with a feedback arrow looping back',
            caption: 'The core loop: Codex builds UI in the terminal, renders and verifies it in a real browser, and iterates against your references.',
          },
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-codex', label: 'What OpenAI Codex actually is' },
            { id: 'why-design', label: 'Why Codex is good at design now' },
            { id: 'setup', label: 'Set up Codex for design (from zero)' },
            { id: 'screenshot-workflow', label: 'The screenshot-to-UI workflow' },
            { id: 'figma', label: 'Codex + Figma round-trip' },
            { id: 'vs', label: 'Codex vs Cursor vs Claude Code' },
            { id: 'pitfalls', label: 'Pitfalls and the “AI slop” look' },
            { id: 'open-design', label: 'Designing with Codex in Open Design' },
            { id: 'faq', label: 'FAQ' },
          ],
          sections: [
            {
              id: 'what-is-codex',
              heading: 'What OpenAI Codex actually is (and what it isn’t)',
              blocks: [
                { kind: 'p', text: 'First, a disambiguation that trips up almost everyone searching for “Codex.” The original OpenAI Codex was a 2021 code-completion model that powered early GitHub Copilot and was deprecated in 2023. That is not what this page is about. Today’s Codex is OpenAI’s agentic coding tool — it plans, writes, runs, and verifies code from natural-language tasks.' },
                { kind: 'p', text: 'Modern Codex ships across four surfaces: a terminal CLI (rewritten in Rust, Apache-2.0 licensed), an IDE extension for VS Code, Cursor, and Windsurf, a cloud/web experience for delegated async tasks, and a desktop app with an in-app browser and Computer Use.' },
                { kind: 'steps', items: [
                  { label: 'Default model', body: 'As of mid-2026 the recommended model is gpt-5.5, with gpt-5.4 being the model OpenAI explicitly trained for frontend and computer use.' },
                  { label: 'Instruction file', body: 'Codex reads an AGENTS.md file in your project (a cross-tool standard) for project rules — the natural place to encode your design conventions.' },
                  { label: 'Sandbox', body: 'It runs in a kernel-level sandbox (workspace-write by default), so an agent editing your UI cannot wander outside the project.' },
                ] },
                { kind: 'ul', items: [
                  'Vendor: OpenAI',
                  'Credential: OpenAI API key (BYOK) or ChatGPT subscription (Free / Go / Plus / Pro / Business / Enterprise)',
                  'License of the CLI: Apache-2.0, open source',
                ] },
              ],
            },
            {
              id: 'why-design',
              heading: 'Why Codex is good at design now',
              blocks: [
                { kind: 'p', text: 'Three things converged in early 2026 to make Codex a real design tool rather than a generic code generator.' },
                { kind: 'steps', items: [
                  { label: 'A frontend-trained model', body: 'OpenAI shipped GPT-5.4, its first mainline model trained for frontend and computer use, with much better image understanding across the design workflow and stronger self-verification. It can even generate mood boards and visual options before committing to final assets.' },
                  { label: 'An official frontend skill', body: 'The openai/skills catalog ships a curated frontend-skill that enforces real taste: cardless layouts, full-bleed heroes, brand-first hierarchy, restrained motion, at most two typefaces and one accent color — and makes Codex write a visual thesis before building.' },
                  { label: 'Browser verification', body: 'With the Playwright skill Codex opens a real browser, resizes to breakpoints, and compares its output back to the reference instead of just checking that the build passes.' },
                ] },
                { kind: 'image', src: '/agents/codex-design/codex-design-taste-triangle.webp', alt: 'Diagram showing design system, skill, and reference image converging into good design output', caption: 'Taste comes from three inputs you provide: a design system, a skill, and real reference images.' },
                { kind: 'p', text: 'The lesson behind all three: Codex does not have taste by default. It produces good design when you give it constraints — a design system, an aesthetic skill, and concrete references. Open Design packages exactly those inputs, which is why the two fit together (more below).' },
              ],
            },
            {
              id: 'setup',
              heading: 'Set up Codex for design work, from zero',
              blocks: [
                { kind: 'p', text: 'Here is the full path from a clean machine to a Codex that can build and verify UI.' },
                { kind: 'code', lang: 'bash', code: '# 1. Install the Codex CLI\nnpm install -g @openai/codex\n# or: brew install --cask codex\n# or: curl -fsSL https://chatgpt.com/codex/install.sh | sh\n\n# 2. Authenticate (ChatGPT sign-in recommended for higher limits)\ncodex            # then choose “Sign in with ChatGPT”\n\n# 3. Generate project context\ncodex            # inside your project, run /init to create AGENTS.md\n\n# 4. Add the official frontend skill, then restart Codex\n# (in the Codex app) $skill-installer frontend-skill\n\n# 5. Wire the Figma MCP server (optional, for design handoff)\ncodex mcp add figma --url https://mcp.figma.com/mcp' },
                { kind: 'image', src: '/agents/codex-design/codex-design-setup-flow.webp', alt: 'Five-step setup flow: install, authenticate, configure, install skill, verify', caption: 'The setup sequence: install → authenticate → configure AGENTS.md → install the frontend skill → enable browser verification.' },
                { kind: 'steps', items: [
                  { label: 'Encode your design rules', body: 'Put your tokens, primitives, and conventions in AGENTS.md or a DESIGN.md and point Codex at them, so output matches a brand instead of defaulting to a generic look.' },
                  { label: 'Choose the right reasoning level', body: 'OpenAI notes that low-to-medium reasoning levels often produce stronger frontend results than the highest setting.' },
                ] },
              ],
            },
            {
              id: 'screenshot-workflow',
              heading: 'The screenshot-to-UI workflow',
              blocks: [
                { kind: 'p', text: 'The highest-leverage design loop with Codex is turning a reference image into working, responsive UI and iterating until it matches. OpenAI’s own guidance distills to five steps.' },
                { kind: 'ol', items: [
                  'Start from the clearest visual references you have — and include multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.',
                  'Be specific in the prompt; vague prompts produce generic UI.',
                  'Prepare a design system and tell Codex where the tokens and canonical primitives live.',
                  'Enable the Playwright interactive skill so Codex renders in a real browser and resizes to breakpoints.',
                  'Iterate by having Codex compare its implementation back to the screenshots — not merely confirm it builds.',
                ] },
                { kind: 'p', text: 'Feed images by dragging a screenshot into the terminal or with the image flag, then prompt with concrete constraints:' },
                { kind: 'code', lang: 'bash', code: 'codex -i reference-desktop.png -i reference-mobile.png \\\n  "Implement this design in React + Vite + Tailwind + TypeScript.\n   Reuse my existing design-system components and tokens.\n   Match spacing, layout, and hierarchy; make it responsive.\n   Use the Playwright skill to verify the UI matches the\n   references and iterate until it does."' },
                { kind: 'p', text: 'Run a dev server in a second terminal, keep prompts small and focused, and commit good iterations / revert bad ones (telling Codex when you revert) so each pass builds on a clean base.' },
              ],
            },
            {
              id: 'figma',
              heading: 'Codex + Figma: design ↔ code round-trip',
              blocks: [
                { kind: 'p', text: 'In February 2026 OpenAI and Figma announced an official partnership, turning the earlier Figma MCP beta into a first-class, bidirectional integration. It works in both directions.' },
                { kind: 'steps', items: [
                  { label: 'Design → Code', body: 'Copy a frame’s “link to selection” in Figma, paste it into Codex with get_design_context, and ask it to implement the design using your existing component library.' },
                  { label: 'Code → Design', body: 'The generate_figma_design tool (“Code to Canvas”) turns a live, running UI back into editable Figma frames — entire screen, a selected element, or a whole file.' },
                ] },
                { kind: 'p', text: 'The Figma MCP runs as a remote server and is exempt from rate limits. Add it once and it is available to Codex, Claude Code, Cursor, VS Code, and more — which is exactly the kind of portable, multi-agent capability Open Design is built to orchestrate.' },
              ],
            },
            {
              id: 'vs',
              heading: 'Codex vs Cursor vs Claude Code for design',
              blocks: [
                { kind: 'p', text: 'There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:' },
                { kind: 'table', columns: ['Agent', 'Design strength', 'Best for'], rows: [
                  ['Codex', 'Strong visual polish after GPT-5.4 + frontend-skill; image understanding', 'Delegated async builds, sandboxed runs, portable AGENTS.md rules'],
                  ['Cursor', 'Visual build-and-see loop with live preview and inline edits', 'Tight iterate-and-watch UI work inside an IDE'],
                  ['Claude Code', 'Specific design decisions (hex, spacing, type) and codebase-aware UX', 'Frontend reasoning and large-context refactors'],
                ] },
                { kind: 'p', text: 'The recurring community verdict is that taste comes from humans: all three default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped.' },
              ],
            },
            {
              id: 'pitfalls',
              heading: 'Pitfalls, and how to avoid the “AI slop” look',
              blocks: [
                { kind: 'p', text: 'The most common complaint about Codex-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include broken mobile layouts, instructions leaking into UI copy, and hitting usage limits quickly.' },
                { kind: 'steps', items: [
                  { label: 'Install a frontend skill', body: 'A curated aesthetic skill forces Codex to commit to a real direction instead of the default look.' },
                  { label: 'Enable Playwright verification', body: 'Make Codex render and self-check across breakpoints so layouts do not silently break on mobile.' },
                  { label: 'Supply tokens and references', body: 'Real design tokens and reference screenshots are the single biggest lever on output quality.' },
                  { label: 'Encode rules in AGENTS.md', body: 'Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run.' },
                ] },
                { kind: 'p', text: 'Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes.' },
              ],
            },
            {
              id: 'open-design',
              heading: 'Designing with Codex inside Open Design',
              blocks: [
                { kind: 'p', text: 'Open Design is the open-source design layer the workflow above keeps asking for. It treats Codex as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes Codex good is there from the first run, not assembled by hand each time.' },
                { kind: 'ol', items: [
                  'Install Open Design and select Codex as your agent.',
                  'Authenticate with your OpenAI API key (BYOK) or ChatGPT subscription — credentials stay on your machine and are never proxied through us.',
                  'Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.',
                  'Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud.',
                ] },
                { kind: 'p', text: 'Same Codex agent, same key — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine.' },
              ],
            },
          ],
          faqTitle: 'Frequently asked questions',
          faq: [
            { name: 'Can OpenAI Codex really do design work?', text: 'Yes — with a frontend skill, a design system, and real reference images in context, Codex (especially on GPT-5.4) produces production-quality, responsive UI and can verify it in a browser. Without that context it tends to default to a generic look, which is the gap Open Design fills.' },
            { name: 'Is this the OpenAI Codex Product Design plugin?', text: 'No. Open Design is an independent open-source project that integrates Codex as an agent. It complements OpenAI’s own tooling with a local-first, open skill and design-system library.' },
            { name: 'Do I need a ChatGPT subscription to design with Codex?', text: 'You can use either an OpenAI API key (BYOK) or your ChatGPT subscription. ChatGPT sign-in generally gives more generous limits; Open Design never proxies your credentials either way.' },
            { name: 'Codex or Claude Code for frontend design?', text: 'Both are strong. Claude Code is known for specific, codebase-aware design decisions; Codex has strong visual polish after GPT-5.4 and excels at delegated, sandboxed builds. Many teams use both — Open Design lets you switch agents without changing your design workflow.' },
            { name: 'How do I connect Codex to Figma?', text: 'Add the official Figma MCP server (codex mcp add figma --url https://mcp.figma.com/mcp). You can then implement Figma frames in code with get_design_context and push a running UI back to editable Figma frames with generate_figma_design.' },
            { name: 'How do I avoid the generic “AI slop” aesthetic?', text: 'Install a frontend skill, supply real design tokens and reference screenshots, encode brand rules in AGENTS.md, and enable Playwright verification. Open Design ships these as a curated library so you skip the per-project setup.' },
            { name: 'Is Open Design affiliated with OpenAI?', text: 'No. Codex is a product of OpenAI; Open Design is an independent open-source project that supports it as a first-party adapter. OpenAI and Codex are trademarks of OpenAI.' },
            { name: 'Are my files and credentials safe?', text: 'Yes — Open Design is local-first. Your files, artifacts, and DESIGN.md stay in your own repo, and your OpenAI credentials are used directly by your agent, never routed through Open Design servers.' },
          ],
          ctaTitle: 'Design with Codex, the open way.',
          ctaBody: 'Bring your own OpenAI key, keep every file local, and get a curated design library around the agent you already use.',
          ctaActions: [
            { label: 'Use Codex inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all supported agents',
        },
        aboutTitle: 'What is Codex',
        aboutBody: [
          'Codex is OpenAI’s agentic coding system — a CLI and ChatGPT-integrated agent that plans, writes, and runs code from natural-language tasks.',
          'OpenAI now ships a role-specific Product Design plugin and a Figma integration, so Codex can explore directions, audit flows, prototype from a live URL, and export to Figma or Canva.',
          'Open Design treats Codex as a first-party adapter, so the agent slots into a structured, open-source design pipeline.',
        ],
        vendorLabel: 'Vendor',
        vendor: 'OpenAI',
        credentialLabel: 'Credential',
        credential: 'OpenAI API key (BYOK) or ChatGPT subscription',
        designTitle: 'Designing with Codex',
        designLead:
          'Codex’s design story moved fast in 2026, clustered around a few official and community capabilities:',
        designPoints: [
          { label: 'Product Design plugin', body: 'OpenAI’s role plugin: explore directions, audit user flows, prototype from a live URL, make screenshots interactive, export to Figma/Canva.' },
          { label: 'Screenshot → responsive UI', body: 'Codex turns a reference image into responsive markup and visually diffs against it across breakpoints with the Playwright skill.' },
          { label: 'Codex ↔ Figma', body: 'The Figma MCP server brings design context into code and turns a running UI back into editable Figma frames.' },
          { label: 'Frontend design skills', body: 'Community and official skills lock an aesthetic direction so output avoids the generic “purple AI slop” look.' },
        ],
        linksTitle: 'Real-world resources',
        linksLead: 'Official docs, Figma integration, and walkthroughs for designing with Codex:',
        links: [
          { label: 'Build responsive front-end designs (Codex docs)', href: 'https://developers.openai.com/codex/use-cases/frontend-designs', source: 'Docs · OpenAI' },
          { label: 'Introducing Codex to Figma', href: 'https://www.figma.com/blog/introducing-codex-to-figma/', source: 'Blog · Figma' },
          { label: 'Design with ChatGPT and Codex: The Designer’s Guide', href: 'https://www.youtube.com/watch?v=rW7vVVmKTS8', source: 'YouTube · UI Collective' },
          { label: 'openai/skills — frontend design skills', href: 'https://github.com/openai/skills', source: 'GitHub · OpenAI' },
          { label: 'New Codex design workflow', href: 'https://www.youtube.com/watch?v=CPg5UYbYLhA', source: 'YouTube · Lukas Margerie' },
        ],
        withOdTitle: 'Codex + Open Design',
        withOdLead:
          'Open Design is the open-source design layer around Codex: a curated skill and design-system library, a structured render pipeline, and a local desktop UI.',
        withOdSteps: [
          'Install Open Design and select Codex as your agent.',
          'Authenticate with your OpenAI API key (BYOK) or ChatGPT subscription — credentials stay on your machine.',
          'Choose a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.',
          'Artifacts and DESIGN.md files live in your own repo, not a hosted cloud.',
        ],
        withOdClosing:
          'The same Codex agent — with a real, portable design workflow around it.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is this the OpenAI Codex Product Design plugin?', text: 'No. Open Design is an independent open-source project that integrates Codex as an agent. It complements OpenAI’s own plugin with a local-first, open library.' },
          { name: 'Do I need a ChatGPT subscription?', text: 'You can use an OpenAI API key (BYOK) or your ChatGPT subscription. Open Design never proxies your credentials.' },
          { name: 'Is Open Design affiliated with OpenAI?', text: 'No. Codex is a product of OpenAI; Open Design is an independent open-source project that supports it as a first-party adapter.' },
        ],
        ctaTitle: 'Design with Codex, the open way.',
        ctaBody: 'Star the repo, download the desktop app, or join the community to request an adapter.',
      },
      cursor: {
        title: 'Cursor for designers — Open Design',
        description:
          'How designers use Cursor for UI and web design — Design Mode, Figma-to-code, the Figma MCP — and how Open Design turns Cursor into a local-first, open-source design agent.',
        breadcrumb: 'Cursor',
        label: 'Agent · Cursor',
        heading: 'Cursor for designers.',
        lead: 'Cursor is the AI code editor, now with a visual Design Mode. Designers use it to edit UI by pointing and drawing, and to turn Figma into code. Open Design plugs Cursor Agent into an open-source design workflow that keeps your files local.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Cursor’s Design Mode lets you edit a live UI by clicking, sketching, or talking; its Figma MCP integrations bring real design context into code. Open Design adds a curated skill and design-system library on top — your provider keys, your repo.',
        toc: ['What is Cursor', 'Designing with Cursor', 'Resources', 'With Open Design', 'FAQ'],
        rich: {
          heroCtaLead:
            'Open Design turns Cursor into a local-first, open-source design agent — your Cursor account or model keys, your files, a curated skill and design-system library around it.',
          heroCtaActions: [
            { label: 'Use Cursor inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          intro: [
            'Cursor is the AI-first code editor that made “build it and watch it render” the default way to ship UI. With Agent mode, inline edits, an in-editor preview, and Figma over MCP, it has become a genuine design tool — once you give it the right references, rules, and a verification loop. This is a practical, end-to-end guide to using Cursor for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.',
            'It covers what Cursor actually is, why its tight iterate-and-watch loop is good for design, how to set it up from zero, the screenshot-and-preview-to-UI loop, the Figma round-trip over MCP, how it compares to Codex and Claude Code, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer.',
          ],
          heroImage: {
            src: '/agents/cursor-design/cursor-design-hero.webp',
            alt: 'Cursor design convergence: editor on the left, a curated skill and design-system hub in the middle with the Cursor mark at center, and a rendered UI on the right',
            caption: 'The core idea: Cursor edits and renders UI in the editor, while a curated design hub feeds it the system, skills, and references that make output look intentional.',
          },
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-cursor', label: 'What Cursor actually is' },
            { id: 'why-design', label: 'Why Cursor is good at design' },
            { id: 'setup', label: 'Set up Cursor for design (from zero)' },
            { id: 'preview-workflow', label: 'The preview-to-UI workflow' },
            { id: 'figma', label: 'Cursor + Figma over MCP' },
            { id: 'vs', label: 'Cursor vs Codex vs Claude Code' },
            { id: 'pitfalls', label: 'Pitfalls and the “AI slop” look' },
            { id: 'open-design', label: 'Designing with Cursor in Open Design' },
            { id: 'faq', label: 'FAQ' },
          ],
          sections: [
            {
              id: 'what-is-cursor',
              heading: 'What Cursor actually is',
              blocks: [
                { kind: 'p', text: 'Cursor is an AI-first code editor built by Anysphere. It is a fork of VS Code, so it keeps the familiar editor, extensions, and keybindings, but rebuilds the workflow around an AI agent that can read your whole project, edit multiple files, run commands, and iterate with you in the loop.' },
                { kind: 'p', text: 'For design work the important surfaces are Agent mode (you describe an outcome and Cursor plans and edits across files), inline edits and Tab completions for fast tweaks, an in-editor preview / browser so you can see the running UI without leaving the window, and MCP support that lets it pull in external context like a live Figma file.' },
                { kind: 'steps', items: [
                  { label: 'Project rules', body: 'Cursor reads project instruction files — versioned `.mdc` rules under `.cursor/rules`, and a plain `AGENTS.md` — so you can encode your design conventions where the agent reads them every run.' },
                  { label: 'Models', body: 'Cursor is model-flexible: it ships with frontier models through your subscription and also supports bringing your own model keys, so you choose the engine behind the same editor workflow.' },
                  { label: 'MCP', body: 'It speaks the Model Context Protocol, so external servers — most relevantly the Figma MCP server — become first-class context for the agent.' },
                ] },
                { kind: 'ul', items: [
                  'Vendor: Anysphere',
                  'Credential: Cursor account / subscription (Hobby / Pro / Business) or your own model keys (BYOK)',
                  'Form: AI-first code editor (VS Code fork) with an in-editor agent and preview',
                ] },
              ],
            },
            {
              id: 'why-design',
              heading: 'Why Cursor is good at design',
              blocks: [
                { kind: 'p', text: 'Cursor’s design edge is not a single feature — it is the tightness of the build-and-see loop. Three things make it feel like a design tool rather than a generic code generator.' },
                { kind: 'steps', items: [
                  { label: 'A tight iterate-and-watch loop', body: 'You prompt, Cursor edits across files, and the in-editor preview renders the result immediately — so you adjust spacing, hierarchy, and motion in seconds instead of round-tripping through a separate terminal and browser.' },
                  { label: 'Direct visual editing', body: 'Beyond chat, Cursor lets you select elements in the preview and nudge styles, so small visual corrections feel like design edits rather than code archaeology.' },
                  { label: 'Project rules and MCP context', body: 'With `.cursor/rules` (or `AGENTS.md`) and the Figma MCP server, the agent works against your tokens, components, and real design specs instead of guessing.' },
                ] },
                { kind: 'image', src: '/agents/cursor-design/cursor-design-taste-triangle.webp', alt: 'Diagram showing design system, skill, and reference image converging into good design output', caption: 'Taste comes from three inputs you provide: a design system, a skill, and real reference images.' },
                { kind: 'p', text: 'The lesson is the same one every agent teaches: Cursor does not have taste by default. It produces good design when you give it constraints — a design system, an aesthetic skill, and concrete references. Open Design packages exactly those inputs, which is why the two fit together (more below).' },
              ],
            },
            {
              id: 'setup',
              heading: 'Set up Cursor for design work, from zero',
              blocks: [
                { kind: 'p', text: 'Here is the full path from a clean machine to a Cursor that can build, preview, and verify UI against your design system.' },
                { kind: 'ol', items: [
                  'Install Cursor from cursor.com and sign in with your Cursor account, or configure your own model keys (BYOK) in Settings.',
                  'Open your project and pick a model in the chat / Agent panel.',
                  'Add project rules: create `.cursor/rules/*.mdc` for structured, glob-scoped conventions, or a plain `AGENTS.md` for simple, readable instructions.',
                  'Connect the Figma MCP server (optional) so the agent can read live design context.',
                  'Run your dev server and use the in-editor preview to see and verify the UI as you iterate.',
                ] },
                { kind: 'image', src: '/agents/cursor-design/cursor-design-setup-flow.webp', alt: 'Five-step setup flow: install, authenticate, configure rules, add skill, verify', caption: 'The setup sequence: install → authenticate → configure project rules → add a skill → enable preview verification.' },
                { kind: 'p', text: 'A minimal project-rules file makes the agent design to a brand instead of defaulting to a generic look. Put it where Cursor reads it every run:' },
                { kind: 'code', lang: 'markdown', code: '# .cursor/rules/design.mdc\n---\ndescription: Project design conventions\nalwaysApply: true\n---\n\n- Reuse existing design-system tokens and components; never hardcode hex or spacing.\n- At most two typefaces and one accent color.\n- Brand-first hierarchy; restrained motion. No hero cards, no oversized rounded corners.\n- Build responsive by default; verify desktop and mobile in the preview before finishing.' },
                { kind: 'steps', items: [
                  { label: 'Encode your design rules', body: 'Put your tokens, primitives, and conventions in `.cursor/rules` or `AGENTS.md` and point Cursor at them, so output matches a brand instead of defaulting to a generic look.' },
                  { label: 'Keep prompts small', body: 'Cursor’s tight loop rewards focused asks — iterate one component or state at a time and watch the preview between passes.' },
                ] },
              ],
            },
            {
              id: 'preview-workflow',
              heading: 'The preview-to-UI workflow',
              blocks: [
                { kind: 'p', text: 'The highest-leverage design loop with Cursor is turning a reference into working, responsive UI and iterating in the editor until it matches — watching the live preview the whole time instead of guessing.' },
                { kind: 'ol', items: [
                  'Start from the clearest visual references you have — and include multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.',
                  'Be specific in the prompt; vague prompts produce generic UI.',
                  'Prepare a design system and tell Cursor where the tokens and canonical primitives live.',
                  'Keep the in-editor preview open and your dev server running so each edit renders immediately at the breakpoints you care about.',
                  'Iterate by comparing the rendered UI back to the references — and use direct element selection in the preview for small visual corrections.',
                ] },
                { kind: 'p', text: 'Feed references by attaching an image to the chat, then prompt with concrete constraints:' },
                { kind: 'code', lang: 'text', code: 'Implement this design in React + Vite + Tailwind + TypeScript.\nReuse my existing design-system components and tokens.\nMatch spacing, layout, and hierarchy; make it responsive.\nKeep the preview open — verify desktop and mobile match the\nreferences and iterate until they do.' },
                { kind: 'p', text: 'Commit good iterations and revert bad ones (telling Cursor when you revert) so each pass builds on a clean base — the same discipline that keeps any agent loop from drifting.' },
              ],
            },
            {
              id: 'figma',
              heading: 'Cursor + Figma: design ↔ code over MCP',
              blocks: [
                { kind: 'p', text: 'Cursor connects to Figma through the official Figma MCP server, which gives the agent structured access to a live Figma file instead of a flat screenshot. That removes the guesswork from handoff.' },
                { kind: 'steps', items: [
                  { label: 'Design → Code', body: 'Copy a frame’s link in Figma, paste it into Cursor, and ask it to implement the design. The MCP server exposes real design context — components, variables, layout data, tokens — so the generated code matches the source instead of approximating it.' },
                  { label: 'Stay aligned', body: 'With design tokens, styles, and components used consistently in Figma (and Code Connect where available), Cursor’s output stays mapped to your real design system rather than re-inventing primitives.' },
                ] },
                { kind: 'p', text: 'Set the remote Figma MCP server up once and it is available to Cursor as first-class context. Because MCP is an open standard, the same server is reusable across Cursor, Claude Code, Codex, and VS Code — exactly the kind of portable, multi-agent capability Open Design is built to orchestrate.' },
              ],
            },
            {
              id: 'vs',
              heading: 'Cursor vs Codex vs Claude Code for design',
              blocks: [
                { kind: 'p', text: 'There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:' },
                { kind: 'table', columns: ['Agent', 'Design strength', 'Best for'], rows: [
                  ['Cursor', 'Visual build-and-see loop with live in-editor preview and direct element editing', 'Tight iterate-and-watch UI work inside an IDE'],
                  ['Codex', 'Strong visual polish with a frontend skill; image understanding and sandboxed runs', 'Delegated async builds and portable AGENTS.md rules'],
                  ['Claude Code', 'Specific design decisions (hex, spacing, type) and codebase-aware UX', 'Frontend reasoning and large-context refactors'],
                ] },
                { kind: 'p', text: 'The recurring community verdict is that taste comes from humans: all three default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped.' },
              ],
            },
            {
              id: 'pitfalls',
              heading: 'Pitfalls, and how to avoid the “AI slop” look',
              blocks: [
                { kind: 'p', text: 'The most common complaint about Cursor-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include layouts that break on mobile and instructions leaking into UI copy.' },
                { kind: 'steps', items: [
                  { label: 'Add a design skill', body: 'A curated aesthetic skill forces Cursor to commit to a real direction instead of the default look.' },
                  { label: 'Use the preview to verify', body: 'Render and self-check across breakpoints in the in-editor preview so layouts do not silently break on mobile.' },
                  { label: 'Supply tokens and references', body: 'Real design tokens and reference screenshots are the single biggest lever on output quality.' },
                  { label: 'Encode rules in `.cursor/rules`', body: 'Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run.' },
                ] },
                { kind: 'p', text: 'Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes.' },
              ],
            },
            {
              id: 'open-design',
              heading: 'Designing with Cursor inside Open Design',
              blocks: [
                { kind: 'p', text: 'Open Design is the open-source design layer the workflow above keeps asking for. It treats Cursor as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes Cursor good is there from the first run, not assembled by hand each time.' },
                { kind: 'ol', items: [
                  'Install Open Design and select Cursor as your agent.',
                  'Authenticate with your Cursor account or your own model keys (BYOK) — credentials stay on your machine and are never proxied through us.',
                  'Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.',
                  'Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud.',
                ] },
                { kind: 'p', text: 'Same Cursor agent, same key — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine.' },
              ],
            },
          ],
          faqTitle: 'Frequently asked questions',
          faq: [
            { name: 'Can Cursor really do design work?', text: 'Yes — with a design skill, a design system, and real reference images in context, Cursor produces production-quality, responsive UI, and its in-editor preview lets you verify and refine it visually. Without that context it tends to default to a generic look, which is the gap Open Design fills.' },
            { name: 'Is this an official Cursor product?', text: 'No. Open Design is an independent open-source project that integrates Cursor as an agent. It complements Cursor with a local-first, open skill and design-system library.' },
            { name: 'Do I need a Cursor subscription to design with Cursor?', text: 'You can use a Cursor account / subscription or bring your own model keys (BYOK). Open Design never proxies your credentials either way — they are used directly by your agent.' },
            { name: 'Cursor or Claude Code for frontend design?', text: 'Both are strong. Claude Code is known for specific, codebase-aware design decisions; Cursor’s edge is its tight build-and-see loop with a live preview inside the editor. Many teams use both — Open Design lets you switch agents without changing your design workflow.' },
            { name: 'How do I connect Cursor to Figma?', text: 'Add the official Figma MCP server in Cursor, then paste a Figma frame link into the chat and ask Cursor to implement it. The server exposes real components, variables, and layout data so the generated code matches the source design.' },
            { name: 'How do I avoid the generic “AI slop” aesthetic?', text: 'Add a design skill, supply real design tokens and reference screenshots, encode brand rules in `.cursor/rules` or `AGENTS.md`, and verify across breakpoints in the preview. Open Design ships these as a curated library so you skip the per-project setup.' },
            { name: 'Is Open Design affiliated with Cursor or Anysphere?', text: 'No. Cursor is a product of Anysphere; Open Design is an independent open-source project that supports it as a first-party adapter. Cursor and Anysphere are trademarks of Anysphere, Inc.' },
            { name: 'Are my files and credentials safe?', text: 'Yes — Open Design is local-first. Your files, artifacts, and DESIGN.md stay in your own repo, and your Cursor or model credentials are used directly by your agent, never routed through Open Design servers.' },
          ],
          ctaTitle: 'Design with Cursor, the open way.',
          ctaBody: 'Bring your own Cursor account or model keys, keep every file local, and get a curated design library around the agent you already use.',
          ctaActions: [
            { label: 'Use Cursor inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all supported agents',
        },
        aboutTitle: 'What is Cursor',
        aboutBody: [
          'Cursor is an AI-first code editor built on VS Code, with a built-in agent that edits across your whole project.',
          'Cursor shipped Design Mode — point at an element, sketch a change, or describe it in words, and Cursor edits the underlying React/Vue/Svelte source. Combined with Figma MCP servers, it has become a credible design-to-code surface.',
          'Open Design treats Cursor Agent as a first-party adapter so it can drive a structured, open-source design pipeline.',
        ],
        vendorLabel: 'Vendor',
        vendor: 'Cursor (Anysphere)',
        credentialLabel: 'Credential',
        credential: 'Cursor account (uses your own provider keys)',
        designTitle: 'Designing with Cursor',
        designLead:
          'Cursor’s design ecosystem centers on visual editing and Figma interop:',
        designPoints: [
          { label: 'Design Mode', body: 'Click, draw, or voice-describe a UI change and Cursor edits the source — visual editing backed by real code.' },
          { label: 'Figma → code', body: 'Figma MCP servers feed real layout and tokens to Cursor so it builds from the design, not a screenshot.' },
          { label: 'Bidirectional Figma', body: 'Some MCPs let Cursor read and modify Figma designs programmatically, not just consume them.' },
          { label: 'Design-to-code loop', body: 'The common pattern: draft in a visual tool, import to Cursor, then refine and extend with the agent.' },
        ],
        linksTitle: 'Real-world resources',
        linksLead: 'Announcements, tutorials, and tools for designing with Cursor:',
        links: [
          { label: 'Cursor Design Mode announcement', href: 'https://x.com/cursor_ai/status/2062950344687272144', source: 'X · @cursor_ai' },
          { label: 'Cursor’s Design Mode (Visual Editing) explained', href: 'https://www.builder.io/blog/cursor-design-mode-visual-editing', source: 'Blog · Builder.io' },
          { label: 'Cursor for Designers — Figma to code', href: 'https://www.builder.io/blog/figma-to-cursor-for-designers', source: 'Blog · Builder.io' },
          { label: 'Framelink Figma-Context-MCP', href: 'https://github.com/GLips/Figma-Context-MCP', source: 'GitHub · GLips' },
          { label: 'cursor-talk-to-figma-mcp', href: 'https://github.com/grab/cursor-talk-to-figma-mcp', source: 'GitHub · Grab' },
        ],
        withOdTitle: 'Cursor + Open Design',
        withOdLead:
          'Open Design is the open-source design layer around Cursor: a curated skill and design-system library, a structured render pipeline, and a local desktop UI.',
        withOdSteps: [
          'Install Open Design and select Cursor Agent.',
          'Cursor uses your own provider keys — nothing is proxied through Open Design.',
          'Pick a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.',
          'Everything stays in your repo, local-first.',
        ],
        withOdClosing:
          'Cursor’s agent, plus an open and portable design workflow.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Cursor good for design?', text: 'With Design Mode and Figma MCP it edits and builds UI well; from scratch it benefits from a design system. Open Design supplies one out of the box.' },
          { name: 'Does Open Design replace Cursor’s Design Mode?', text: 'No — it complements it. Open Design adds an open, curated design-system and skill library and a structured render pipeline on top of the agent.' },
          { name: 'Is Open Design affiliated with Cursor?', text: 'No. Cursor is a product of Anysphere; Open Design is an independent open-source project that integrates it as a first-party adapter.' },
        ],
        ctaTitle: 'Design with Cursor, the open way.',
        ctaBody: 'Star the repo, download the desktop app, or join the community to request an adapter.',
      },
      opencode: {
        title: 'OpenCode for design — Open Design',
        description:
          'How people use OpenCode for UI and web design — design.md files, UI/UX skills, Figma MCP — and how Open Design turns OpenCode into a local-first, open-source design agent.',
        breadcrumb: 'OpenCode',
        label: 'Agent · OpenCode',
        heading: 'OpenCode for design.',
        lead: 'OpenCode is the open-source terminal AI coding agent. Designers bolt design skills and DESIGN.md files onto it to generate real UI. Open Design makes that a structured, open-source workflow — bring your provider keys, keep everything local.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'OpenCode is a fully open-source coding agent; design is an emergent use via skills, design.md files, and Figma MCP. Open Design packages a curated design-system and skill library plus a desktop workflow around it — your keys, your repo.',
        toc: ['What is OpenCode', 'Designing with OpenCode', 'Resources', 'With Open Design', 'FAQ'],
        rich: {
          heroCtaLead:
            'Open Design turns OpenCode into a local-first, open-source design agent — any model you choose with your own provider key, your files, a curated skill and design-system library around it.',
          heroCtaActions: [
            { label: 'Use OpenCode inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          intro: [
            'OpenCode is an open-source, terminal-first AI coding agent that is deliberately model-agnostic: you bring your own provider key and run whatever model you want behind the same workflow. That openness makes it a natural base for design work — but like every agent, it only produces good UI when you give it the right references, skills, and a verification loop. This is a practical, end-to-end guide to using OpenCode for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.',
            'It covers what OpenCode actually is, why a model-agnostic open agent is a good fit for design, how to set it up from zero, the screenshot-to-UI loop, how AGENTS.md and MCP extend it, how it compares to Codex, Claude Code, and Cursor, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer — a natural pairing, since both projects are open-source and run on your own machine.',
          ],
          heroImage: {
            src: '/agents/opencode-design/opencode-design-hero.webp',
            alt: 'OpenCode design feedback loop: a terminal TUI agent, a browser rendering the UI, and a workspace, with a feedback arrow looping back',
            caption: 'The core loop: OpenCode builds UI in the terminal, renders and verifies it in a real browser, and iterates against your references — on whatever model you choose.',
          },
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-opencode', label: 'What OpenCode actually is' },
            { id: 'why-design', label: 'Why an open, any-model agent fits design' },
            { id: 'setup', label: 'Set up OpenCode for design (from zero)' },
            { id: 'screenshot-workflow', label: 'The screenshot-to-UI workflow' },
            { id: 'extend', label: 'AGENTS.md, MCP, and shareable sessions' },
            { id: 'vs', label: 'OpenCode vs Codex vs Claude Code vs Cursor' },
            { id: 'pitfalls', label: 'Pitfalls and the “AI slop” look' },
            { id: 'open-design', label: 'Designing with OpenCode in Open Design' },
            { id: 'faq', label: 'FAQ' },
          ],
          sections: [
            {
              id: 'what-is-opencode',
              heading: 'What OpenCode actually is',
              blocks: [
                { kind: 'p', text: 'OpenCode is an open-source AI coding agent built for the terminal, maintained by the team behind SST (Anomaly Innovations). It reads your repository, runs commands, edits files, and talks to a large language model — but unlike vendor-bound agents, it does not ship its own model. You point it at whatever provider and model you want and bring your own key.' },
                { kind: 'p', text: 'It runs as a terminal UI (TUI), with a desktop app and IDE extensions on top of the same engine. Under the hood it uses a client/server architecture, so the agent that does the work is decoupled from the surface you drive it from. Two built-in agents — build and plan — toggle with the Tab key.' },
                { kind: 'steps', items: [
                  { label: 'Model-agnostic', body: 'Models and providers come from models.dev, an open catalog. You configure them in opencode.json with a provider/model-id string and can disable providers you do not want loaded — so the same design workflow runs on Anthropic, OpenAI, Google, OpenRouter, local models, and more.' },
                  { label: 'Instruction file', body: 'OpenCode reads an AGENTS.md file in your project (the cross-tool standard, also compatible with CLAUDE.md) for project rules — the natural place to encode your design conventions. Run /init to generate one.' },
                  { label: 'Extensible', body: 'It supports LSP integration, MCP servers, themes, keybinds, and custom commands, plus shareable session links for collaboration.' },
                ] },
                { kind: 'ul', items: [
                  'Maintainer: SST / Anomaly Innovations (open-source project)',
                  'Credential: your own model-provider API key(s) — BYOK, no vendor lock-in',
                  'License: MIT, open source',
                ] },
              ],
            },
            {
              id: 'why-design',
              heading: 'Why an open, any-model agent fits design work',
              blocks: [
                { kind: 'p', text: 'OpenCode does not have a single “design model” the way a vendor agent does — and that is the point. Because it is model-agnostic and open, you can run the same design workflow on whichever model is currently best at frontend, swap it later, or fall back to a local model, all without changing your setup.' },
                { kind: 'p', text: 'But model choice alone does not buy taste. Like every coding agent, OpenCode produces generic UI unless you give it constraints. Good design output comes from three inputs you provide.' },
                { kind: 'steps', items: [
                  { label: 'A design system', body: 'Real tokens, primitives, and conventions the agent reuses, so output matches a brand instead of defaulting to a generic look.' },
                  { label: 'An aesthetic skill', body: 'A curated skill that enforces real taste — restrained motion, brand-first hierarchy, at most two typefaces and one accent color — and makes the agent commit to a direction before building.' },
                  { label: 'Concrete references', body: 'Actual reference images and multiple states (desktop and mobile, hover, empty, loading), not a single hero shot.' },
                ] },
                { kind: 'image', src: '/agents/opencode-design/opencode-design-taste-triangle.webp', alt: 'Diagram showing design system, skill, and reference image converging into good design output', caption: 'Taste comes from three inputs you provide: a design system, a skill, and real reference images — independent of which model you run.' },
                { kind: 'p', text: 'The lesson: OpenCode gives you model freedom, but taste still comes from a curated design context. Open Design packages exactly those inputs, which is why the two fit together — both are open-source and local-first (more below).' },
              ],
            },
            {
              id: 'setup',
              heading: 'Set up OpenCode for design work, from zero',
              blocks: [
                { kind: 'p', text: 'Here is the full path from a clean machine to an OpenCode that can build and verify UI.' },
                { kind: 'code', lang: 'bash', code: '# 1. Install OpenCode\ncurl -fsSL https://opencode.ai/install | bash\n# or: npm i -g opencode-ai@latest\n# or: brew install sst/tap/opencode\n\n# 2. Start the TUI in your project, then authenticate your provider\nopencode          # then run /login and pick your provider + paste your key\n\n# 3. Generate project context\nopencode          # inside your project, run /init to create AGENTS.md\n\n# 4. Pick your model (any provider, via models.dev)\n#    set "provider/model-id" in opencode.json or switch in the TUI\n\n# 5. Add an MCP server (optional, e.g. for design handoff)\n#    configure it under the "mcp" key in opencode.json' },
                { kind: 'image', src: '/agents/opencode-design/opencode-design-setup-flow.webp', alt: 'Five-step setup flow: install, authenticate with your provider key, configure AGENTS.md, add a skill, verify', caption: 'The setup sequence: install → authenticate (your provider key) → configure AGENTS.md → add a skill → verify in a real browser.' },
                { kind: 'steps', items: [
                  { label: 'Encode your design rules', body: 'Put your tokens, primitives, and conventions in AGENTS.md (or a DESIGN.md referenced from it) so output matches a brand instead of defaulting to a generic look. The instructions option in opencode.json can point at additional rule files via globs.' },
                  { label: 'Choose a capable model', body: 'Because OpenCode is model-agnostic, pick whichever provider/model is currently strongest at frontend for the design pass — and keep the rest of your workflow unchanged.' },
                ] },
              ],
            },
            {
              id: 'screenshot-workflow',
              heading: 'The screenshot-to-UI workflow',
              blocks: [
                { kind: 'p', text: 'The highest-leverage design loop with any agent is turning a reference image into working, responsive UI and iterating until it matches. The same five-step shape applies in OpenCode.' },
                { kind: 'ol', items: [
                  'Start from the clearest visual references you have — and include multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.',
                  'Be specific in the prompt; vague prompts produce generic UI.',
                  'Prepare a design system and tell OpenCode where the tokens and canonical primitives live (in AGENTS.md).',
                  'Run a dev server and have the agent render in a real browser, resizing to breakpoints to check the result.',
                  'Iterate by having OpenCode compare its implementation back to the screenshots — not merely confirm it builds.',
                ] },
                { kind: 'p', text: 'Reference files with @ in the TUI for a fuzzy search of your working directory, run shell commands inline with a leading !, and drive actions with / commands. Then prompt with concrete constraints:' },
                { kind: 'code', lang: 'bash', code: 'opencode\n# in the TUI:\n> @reference-desktop.png @reference-mobile.png\n  Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from AGENTS.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Run the dev server, open it in a browser, and iterate until the\n  UI matches the references across breakpoints.' },
                { kind: 'p', text: 'Keep prompts small and focused, commit good iterations and revert bad ones (telling OpenCode when you revert), so each pass builds on a clean base.' },
              ],
            },
            {
              id: 'extend',
              heading: 'AGENTS.md, MCP, and shareable sessions',
              blocks: [
                { kind: 'p', text: 'Three extension points make OpenCode practical for sustained design work, and all three map cleanly onto an open design workflow.' },
                { kind: 'steps', items: [
                  { label: 'AGENTS.md rules', body: 'Project rules live in an AGENTS.md at the repo root (or global rules in ~/.config/opencode/AGENTS.md). It is the durable home for your design conventions, read on every run, and it is compatible with the CLAUDE.md files other agents use.' },
                  { label: 'MCP servers', body: 'OpenCode supports both local (command) and remote (URL) MCP servers, configured under the mcp key — the portable way to bring in design context and external tools that work across agents, not just OpenCode.' },
                  { label: 'Shareable sessions', body: 'The /share command creates a public link to a conversation for collaboration or review, and /unshare revokes it — useful for getting feedback on a design pass.' },
                ] },
                { kind: 'p', text: 'These are portable, multi-agent capabilities — exactly the kind of thing Open Design is built to orchestrate, rather than re-create per project.' },
              ],
            },
            {
              id: 'vs',
              heading: 'OpenCode vs Codex vs Claude Code vs Cursor for design',
              blocks: [
                { kind: 'p', text: 'There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:' },
                { kind: 'table', columns: ['Agent', 'Design strength', 'Best for'], rows: [
                  ['OpenCode', 'Open-source and model-agnostic; run any provider behind one terminal workflow', 'BYOK freedom, model-switching, fully open and local-first setups'],
                  ['Codex', 'Strong visual polish with a frontend skill; image understanding', 'Delegated async, sandboxed builds, portable AGENTS.md rules'],
                  ['Claude Code', 'Specific design decisions (hex, spacing, type) and codebase-aware UX', 'Frontend reasoning and large-context refactors'],
                  ['Cursor', 'Visual build-and-see loop with live preview and inline edits', 'Tight iterate-and-watch UI work inside an IDE'],
                ] },
                { kind: 'p', text: 'The recurring community verdict is that taste comes from humans: all of them default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped, which is precisely why an open agent like OpenCode pairs so well with an open design layer.' },
              ],
            },
            {
              id: 'pitfalls',
              heading: 'Pitfalls, and how to avoid the “AI slop” look',
              blocks: [
                { kind: 'p', text: 'The most common complaint about AI-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include broken mobile layouts and instructions leaking into UI copy. None of these are unique to OpenCode; they are what happens when any agent runs without a curated design context.' },
                { kind: 'steps', items: [
                  { label: 'Add an aesthetic skill', body: 'A curated design skill forces the agent to commit to a real direction instead of the default look.' },
                  { label: 'Verify in a real browser', body: 'Render and self-check across breakpoints so layouts do not silently break on mobile.' },
                  { label: 'Supply tokens and references', body: 'Real design tokens and reference screenshots are the single biggest lever on output quality.' },
                  { label: 'Encode rules in AGENTS.md', body: 'Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run.' },
                ] },
                { kind: 'p', text: 'Notice that every mitigation is about giving the agent a curated design context — regardless of which model you run. Maintaining that context by hand, per project, is the toil Open Design removes.' },
              ],
            },
            {
              id: 'open-design',
              heading: 'Designing with OpenCode inside Open Design',
              blocks: [
                { kind: 'p', text: 'Open Design is the open-source design layer the workflow above keeps asking for. It treats OpenCode as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes any agent good is there from the first run, not assembled by hand each time. Both projects are open-source and local-first, which makes the pairing a natural fit.' },
                { kind: 'ol', items: [
                  'Install Open Design and select OpenCode as your agent.',
                  'Authenticate with your own model-provider API key (BYOK) — credentials stay on your machine and are never proxied through us.',
                  'Pick any provider and model, plus a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.',
                  'Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud.',
                ] },
                { kind: 'p', text: 'Same OpenCode agent, same model freedom — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine.' },
              ],
            },
          ],
          faqTitle: 'Frequently asked questions',
          faq: [
            { name: 'Can OpenCode really do design work?', text: 'Yes — with an aesthetic skill, a design system, and real reference images in context, OpenCode produces production-quality, responsive UI and can verify it in a browser. Because it is model-agnostic, you run whichever model is currently best at frontend. Without that curated context it tends to default to a generic look, which is the gap Open Design fills.' },
            { name: 'Which model should I use with OpenCode for design?', text: 'Whichever you like — OpenCode is provider-agnostic via models.dev, so you can run Anthropic, OpenAI, Google, OpenRouter, or local models behind the same workflow and switch at any time. The quality of the design output depends far more on your skill, design system, and references than on the model alone.' },
            { name: 'Is Open Design made by the OpenCode (SST) team?', text: 'No. Open Design is an independent open-source project that integrates OpenCode as an agent. It complements OpenCode with a local-first, open skill and design-system library.' },
            { name: 'Do I need a special subscription to design with OpenCode?', text: 'No — OpenCode is BYOK. You bring your own model-provider API key, and Open Design never proxies your credentials. There is no vendor lock-in.' },
            { name: 'OpenCode or Codex or Claude Code for frontend design?', text: 'All are strong, and many teams stack them. OpenCode’s edge is being fully open-source and model-agnostic; Codex excels at delegated, sandboxed builds; Claude Code is known for specific, codebase-aware design decisions. Open Design lets you switch agents without changing your design workflow.' },
            { name: 'How do I extend OpenCode for design context?', text: 'Encode rules in AGENTS.md, add MCP servers under the mcp key for portable tools and design context, and use shareable sessions for review. Open Design ships a curated skill and design-system library so you skip the per-project setup.' },
            { name: 'Is Open Design affiliated with OpenCode or SST?', text: 'No. OpenCode is an open-source project maintained by SST (Anomaly Innovations); Open Design is an independent open-source project that supports it as a first-party adapter.' },
            { name: 'Are my files and credentials safe?', text: 'Yes — Open Design is local-first. Your files, artifacts, and DESIGN.md stay in your own repo, and your model-provider credentials are used directly by your agent, never routed through Open Design servers.' },
          ],
          ctaTitle: 'Design with OpenCode, the open way.',
          ctaBody: 'Bring your own model-provider key, keep every file local, and get a curated design library around the open agent you already use.',
          ctaActions: [
            { label: 'Use OpenCode inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all supported agents',
        },
        aboutTitle: 'What is OpenCode',
        aboutBody: [
          'OpenCode is an open-source (MIT) terminal AI coding agent — a TUI plus desktop and IDE surfaces — maintained by Anomaly (the SST team) at github.com/anomalyco/opencode.',
          'It is a coding agent, not a dedicated design tool. Design happens by adding skills, DESIGN.md system files, and Figma/visual-canvas MCPs to control its visual output.',
          'Open Design treats OpenCode as a first-party adapter, turning those ad-hoc patterns into a structured, open design pipeline.',
        ],
        vendorLabel: 'Vendor',
        vendor: 'Anomaly (open-source, MIT)',
        credentialLabel: 'Credential',
        credential: 'Provider keys via OpenCode config (BYOK)',
        designTitle: 'Designing with OpenCode',
        designLead:
          'The OpenCode community designs by giving the agent taste through configuration and skills:',
        designPoints: [
          { label: 'design.md systems', body: 'Drop a brand DESIGN.md (Stripe/Linear/Airbnb-style rules) into the project so OpenCode generates a matching UI.' },
          { label: 'UI/UX skills', body: 'Design-intelligence skills add dozens of UI styles and palettes, generating a design system before coding.' },
          { label: 'Figma & visual canvas MCP', body: 'Connect Figma or a visual canvas via MCP for a design-to-code loop.' },
          { label: 'Model taste', body: 'Because OpenCode is BYOK, you pick the model that designs best for your taste and budget.' },
        ],
        linksTitle: 'Real-world resources',
        linksLead: 'Skills, design.md collections, and tutorials for designing with OpenCode:',
        links: [
          { label: 'OpenCode UI/UX skill: build better modern designs', href: 'https://www.youtube.com/watch?v=Pc27ThkuBPQ', source: 'YouTube · AI Stack Engineer' },
          { label: 'OpenCode + design.md: stunning designs for free', href: 'https://www.youtube.com/watch?v=sCu34s8zb4o', source: 'YouTube · AI Stack Engineer' },
          { label: 'VoltAgent/awesome-design-md', href: 'https://github.com/VoltAgent/awesome-design-md', source: 'GitHub · VoltAgent' },
          { label: 'anomalyco/opencode (canonical repo)', href: 'https://github.com/anomalyco/opencode', source: 'GitHub · Anomaly' },
          { label: 'OpenCode tutorial: setup, agents, skills & MCP', href: 'https://www.youtube.com/watch?v=uZGDO0L-Dr4', source: 'YouTube · Leon van Zyl' },
        ],
        withOdTitle: 'OpenCode + Open Design',
        withOdLead:
          'Open Design is the open-source design layer around OpenCode: a curated skill and design-system library, a structured render pipeline, and a local desktop UI — no more hand-assembling design.md files and skills.',
        withOdSteps: [
          'Install Open Design and select OpenCode as your agent.',
          'OpenCode uses your provider keys via its own config (BYOK) — nothing is proxied.',
          'Pick a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.',
          'Both projects are open-source and local-first — your files never leave your machine.',
        ],
        withOdClosing:
          'Two open-source agents, one local-first design workflow.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Which OpenCode is this?', text: 'The open-source terminal agent at github.com/anomalyco/opencode (formerly sst/opencode), maintained by Anomaly. Not to be confused with similarly named tools.' },
          { name: 'Can OpenCode design UIs?', text: 'Yes, with design.md files and UI/UX skills in context. Open Design provides a curated library of both so you skip the manual setup.' },
          { name: 'Is Open Design the same project as OpenCode?', text: 'No. Both are open-source, but they are separate projects. Open Design integrates OpenCode as a first-party agent adapter.' },
        ],
        ctaTitle: 'Design with OpenCode, the open way.',
        ctaBody: 'Star the repo, download the desktop app, or join the community to request an adapter.',
      },
      gemini: {
        title: 'Gemini CLI for design — Open Design',
        description:
          'How people use Google’s Gemini CLI for UI and web design — its multimodal image understanding, the 1M-token context, GEMINI.md and MCP — and how Open Design turns Gemini CLI into a local-first, open-source design agent.',
        breadcrumb: 'Gemini CLI',
        label: 'Agent · Gemini CLI',
        heading: 'Gemini CLI for design.',
        lead: 'Gemini CLI is Google’s open-source terminal agent. Its multimodal models read screenshots and its 1M-token context holds a whole design system, which makes it a real design tool — once you give it references, conventions, and a verification loop. Open Design wires it into an open-source design workflow: your Google account or API key, your files, local-first.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Gemini CLI turns reference images into responsive UI with strong multimodal understanding and a huge context window, free to start with a Google account. Open Design gives it a curated design-system and skill library plus a desktop workflow — BYOK and keep everything local.',
        toc: ['What is Gemini CLI', 'Designing with Gemini CLI', 'Resources', 'With Open Design', 'FAQ'],
        rich: {
          heroCtaLead:
            'Open Design turns Gemini CLI into a local-first, open-source design agent — your Google account or Gemini API key, your files, a curated skill and design-system library around it.',
          heroCtaActions: [
            { label: 'Use Gemini CLI inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          intro: [
            'Gemini CLI is Google’s open-source AI agent for the terminal. Two things make it interesting for design specifically: its models are strongly multimodal, so it reads a screenshot and reasons about layout, spacing, and hierarchy; and its 1M-token context window can hold an entire design system and codebase at once. Paired with the right references, conventions, and a verification loop, it builds real, responsive UI — and it is free to start with a Google account. This is a practical, end-to-end guide to using Gemini CLI for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.',
            'It covers what Gemini CLI actually is, why its multimodal models and huge context fit design, how to set it up from zero, the screenshot-to-UI loop, how GEMINI.md and MCP extend it, how it compares to Codex, Claude Code, and Cursor, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer — a natural pairing, since both are open-source and run on your own machine.',
          ],
          heroImage: {
            src: '/agents/gemini-design/gemini-design-hero.webp',
            alt: 'Gemini CLI design feedback loop: a terminal agent reading a reference image, a browser rendering the UI, and a workspace, with a feedback arrow looping back',
            caption: 'The core loop: Gemini CLI reads your references in the terminal, builds and verifies the UI in a real browser, and iterates against them — with a whole design system in context.',
          },
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-gemini-cli', label: 'What Gemini CLI actually is' },
            { id: 'why-design', label: 'Why multimodal + huge context fit design' },
            { id: 'setup', label: 'Set up Gemini CLI for design (from zero)' },
            { id: 'screenshot-workflow', label: 'The screenshot-to-UI workflow' },
            { id: 'extend', label: 'GEMINI.md, MCP, and extensions' },
            { id: 'vs', label: 'Gemini CLI vs Codex vs Claude Code vs Cursor' },
            { id: 'pitfalls', label: 'Pitfalls and the “AI slop” look' },
            { id: 'open-design', label: 'Designing with Gemini CLI in Open Design' },
            { id: 'faq', label: 'FAQ' },
          ],
          sections: [
            {
              id: 'what-is-gemini-cli',
              heading: 'What Gemini CLI actually is',
              blocks: [
                { kind: 'p', text: 'Gemini CLI is an open-source (Apache-2.0) AI agent that Google ships for the terminal. It reads your repository, edits files, runs shell commands, fetches the web, and can ground answers with Google Search — planning and verifying work from natural-language tasks rather than just completing lines. The same engine also powers the Gemini Code Assist agent inside VS Code.' },
                { kind: 'p', text: 'For design work, two properties stand out. Its models are natively multimodal, so you can hand it a screenshot and it reasons about the actual layout. And its context window reaches up to 1M tokens, large enough to hold your whole design system, component library, and reference set at once instead of summarizing them away.' },
                { kind: 'steps', items: [
                  { label: 'Context files', body: 'Gemini CLI reads a GEMINI.md file for persistent project context — the natural place to encode your design conventions, tokens, and review checklists. Personal and team settings layer on top.' },
                  { label: 'Built-in tools + MCP', body: 'It ships file, shell, web-fetch, and Google Search tools out of the box, and supports MCP servers (configured in ~/.gemini/settings.json) to add external context like a live Figma file.' },
                  { label: 'Free to start', body: 'Signing in with a personal Google account gives a generous free tier of Gemini requests; you can also bring a Gemini API key or use Vertex AI.' },
                ] },
                { kind: 'ul', items: [
                  'Vendor: Google',
                  'Credential: Google account (free tier) or Gemini API key from AI Studio (BYOK) or Vertex AI',
                  'License: Apache-2.0, open source',
                ] },
              ],
            },
            {
              id: 'why-design',
              heading: 'Why multimodal models and a huge context fit design',
              blocks: [
                { kind: 'p', text: 'Gemini CLI’s design edge comes from two model properties — but, as with every agent, taste still has to be supplied.' },
                { kind: 'steps', items: [
                  { label: 'Strong multimodal understanding', body: 'Because Gemini models are natively multimodal, the agent reads reference screenshots well — comparing its rendered output back to an image instead of guessing from a prose description.' },
                  { label: 'A 1M-token context window', body: 'A large context means the whole design system, tokens, and many reference states fit at once, so the agent reuses your real primitives rather than inventing one-off styles.' },
                  { label: 'Conventions in GEMINI.md', body: 'A GEMINI.md (plus the Figma MCP server) points the agent at your tokens, components, and real specs, so it works against a brand instead of a default look.' },
                ] },
                { kind: 'image', src: '/agents/gemini-design/gemini-design-taste-triangle.webp', alt: 'Diagram showing design system, skill, and reference image converging into good design output', caption: 'Taste comes from three inputs you provide: a design system, a skill, and real reference images.' },
                { kind: 'p', text: 'The lesson is the same one every agent teaches: Gemini CLI does not have taste by default. It produces good design when you give it constraints — a design system, an aesthetic skill, and concrete references. Open Design packages exactly those inputs, which is why the two fit together (more below).' },
              ],
            },
            {
              id: 'setup',
              heading: 'Set up Gemini CLI for design work, from zero',
              blocks: [
                { kind: 'p', text: 'Here is the full path from a clean machine to a Gemini CLI that can build and verify UI.' },
                { kind: 'code', lang: 'bash', code: '# 1. Install Gemini CLI (Node 20+)\nnpm install -g @google/gemini-cli\n# or run without installing: npx https://github.com/google-gemini/gemini-cli\n\n# 2. Start it in your project and authenticate on first run\ncd your-project\ngemini            # sign in with your Google account, or set GEMINI_API_KEY\n\n# 3. Generate project context\n/init             # scaffolds a GEMINI.md for this project\n\n# 4. Wire the Figma MCP server (optional, for design handoff)\n#    add it under "mcpServers" in ~/.gemini/settings.json' },
                { kind: 'image', src: '/agents/gemini-design/gemini-design-setup-flow.webp', alt: 'Five-step setup flow: install, authenticate, configure GEMINI.md, add a skill, verify', caption: 'The setup sequence: install → authenticate → configure GEMINI.md → add a skill → enable browser verification.' },
                { kind: 'steps', items: [
                  { label: 'Encode your design rules', body: 'Put your tokens, primitives, and conventions in GEMINI.md and point Gemini at them, so output matches a brand instead of defaulting to a generic look.' },
                  { label: 'Add browser verification', body: 'Wire a Playwright or browser MCP so Gemini renders in a real browser and checks its output across breakpoints instead of only confirming the build passes.' },
                ] },
              ],
            },
            {
              id: 'screenshot-workflow',
              heading: 'The screenshot-to-UI workflow',
              blocks: [
                { kind: 'p', text: 'The highest-leverage design loop with Gemini CLI is turning a reference image into working, responsive UI and iterating until it matches — leaning on the multimodal model to compare output back to the reference.' },
                { kind: 'ol', items: [
                  'Start from the clearest visual references you have — and include multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.',
                  'Be specific in the prompt; vague prompts produce generic UI even with a strong model.',
                  'Keep your design system and conventions in GEMINI.md, and tell Gemini where the tokens and canonical primitives live.',
                  'Run a dev server and have Gemini render in a real browser, resizing to breakpoints to check the result.',
                  'Iterate by having Gemini compare its implementation back to the screenshots — not merely confirm it builds.',
                ] },
                { kind: 'p', text: 'Reference an image with @ to attach it to the prompt, then give concrete constraints:' },
                { kind: 'code', lang: 'bash', code: 'gemini\n# in the prompt:\n> @reference-desktop.png @reference-mobile.png\n  Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from GEMINI.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints.' },
                { kind: 'p', text: 'Keep prompts small and focused, commit good iterations and revert bad ones (telling Gemini when you revert), so each pass builds on a clean base.' },
              ],
            },
            {
              id: 'extend',
              heading: 'GEMINI.md, MCP, and extensions',
              blocks: [
                { kind: 'p', text: 'Three extension points make Gemini CLI practical for sustained design work, and all three map cleanly onto an open design workflow.' },
                { kind: 'steps', items: [
                  { label: 'GEMINI.md context', body: 'Project rules live in a GEMINI.md at the repo root (with global and team layers). It is the durable home for your design conventions, read on every run.' },
                  { label: 'MCP servers', body: 'Configure MCP servers under ~/.gemini/settings.json — the portable way to bring in design context and external tools, most relevantly the Figma MCP server, that work across agents, not just Gemini.' },
                  { label: 'Extensions and built-in tools', body: 'Gemini CLI extensions and its built-in Google Search, file, shell, and web-fetch tools let it gather references and run the verification loop without leaving the terminal.' },
                ] },
                { kind: 'p', text: 'These are portable, multi-agent capabilities — exactly the kind of thing Open Design is built to orchestrate, rather than re-create per project.' },
              ],
            },
            {
              id: 'vs',
              heading: 'Gemini CLI vs Codex vs Claude Code vs Cursor for design',
              blocks: [
                { kind: 'p', text: 'There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:' },
                { kind: 'table', columns: ['Agent', 'Design strength', 'Best for'], rows: [
                  ['Gemini CLI', 'Strong multimodal image understanding and a 1M-token context; open-source with a free tier', 'Screenshot-heavy work and holding a whole design system in context'],
                  ['Codex', 'Strong visual polish with a frontend skill; sandboxed async builds', 'Delegated async builds and portable AGENTS.md rules'],
                  ['Claude Code', 'Specific design decisions (hex, spacing, type) and codebase-aware UX', 'Frontend reasoning and large-context refactors'],
                  ['Cursor', 'Visual build-and-see loop with live preview and inline edits', 'Tight iterate-and-watch UI work inside an IDE'],
                ] },
                { kind: 'p', text: 'The recurring community verdict is that taste comes from humans: all of them default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped.' },
              ],
            },
            {
              id: 'pitfalls',
              heading: 'Pitfalls, and how to avoid the “AI slop” look',
              blocks: [
                { kind: 'p', text: 'The most common complaint about AI-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include broken mobile layouts and instructions leaking into UI copy. None of these are unique to Gemini CLI; they are what happens when any agent runs without a curated design context.' },
                { kind: 'steps', items: [
                  { label: 'Add an aesthetic skill', body: 'A curated design skill forces the agent to commit to a real direction instead of the default look.' },
                  { label: 'Verify in a real browser', body: 'Use the multimodal model to render and self-check across breakpoints so layouts do not silently break on mobile.' },
                  { label: 'Supply tokens and references', body: 'Real design tokens and reference screenshots are the single biggest lever on output quality.' },
                  { label: 'Encode rules in GEMINI.md', body: 'Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run.' },
                ] },
                { kind: 'p', text: 'Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes.' },
              ],
            },
            {
              id: 'open-design',
              heading: 'Designing with Gemini CLI inside Open Design',
              blocks: [
                { kind: 'p', text: 'Open Design is the open-source design layer the workflow above keeps asking for. It treats Gemini CLI as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes Gemini good is there from the first run, not assembled by hand each time. Both are open-source and local-first, which makes the pairing a natural fit.' },
                { kind: 'ol', items: [
                  'Install Open Design and select Gemini CLI as your agent.',
                  'Authenticate with your Google account or Gemini API key (BYOK) — credentials stay on your machine and are never proxied through us.',
                  'Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.',
                  'Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud.',
                ] },
                { kind: 'p', text: 'Same Gemini CLI agent, same key — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine.' },
              ],
            },
          ],
          faqTitle: 'Frequently asked questions',
          faq: [
            { name: 'Can Gemini CLI really do design work?', text: 'Yes — with an aesthetic skill, a design system, and real reference images in context, Gemini CLI produces production-quality, responsive UI, and its strong multimodal models verify output against references. Without that context it tends to default to a generic look, which is the gap Open Design fills.' },
            { name: 'Do I need to pay to design with Gemini CLI?', text: 'No — signing in with a Google account gives a generous free tier, and you can also bring a Gemini API key (BYOK) or use Vertex AI. Open Design never proxies your credentials either way.' },
            { name: 'What makes Gemini CLI good for design specifically?', text: 'Two things: its models are strongly multimodal, so it reads reference screenshots well, and its 1M-token context can hold an entire design system and reference set at once. Both help — but taste still comes from the design system, skill, and references you supply.' },
            { name: 'Gemini CLI or Claude Code for frontend design?', text: 'Both are strong. Claude Code is known for specific, codebase-aware design decisions; Gemini CLI’s edge is multimodal understanding plus a huge context and a free tier. Many teams use both — Open Design lets you switch agents without changing your design workflow.' },
            { name: 'How do I connect Gemini CLI to Figma?', text: 'Add the Figma MCP server under mcpServers in ~/.gemini/settings.json. Gemini can then pull real design context — components, variables, layout data — so the generated code matches the source instead of approximating it.' },
            { name: 'Is Open Design affiliated with Google?', text: 'No. Gemini CLI is a product of Google; Open Design is an independent open-source project that supports it as a first-party adapter. Gemini is a trademark of Google.' },
            { name: 'Are my files and credentials safe?', text: 'Yes — Open Design is local-first and Apache-2.0. Your files, artifacts, and DESIGN.md stay in your own repo, and your Google credentials are used directly by your agent, never routed through Open Design servers.' },
          ],
          ctaTitle: 'Design with Gemini CLI, the open way.',
          ctaBody: 'Bring your own Google account or Gemini API key, keep every file local, and get a curated design library around the agent you already use.',
          ctaActions: [
            { label: 'Use Gemini CLI inside Open Design', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all supported agents',
        },
        aboutTitle: 'What is Gemini CLI',
        aboutBody: [
          'Gemini CLI is Google’s open-source (Apache-2.0) terminal AI agent. It reads your codebase, edits files, runs commands, fetches the web, and grounds answers with Google Search.',
          'Its models are natively multimodal and its context window reaches 1M tokens, so it reads reference screenshots and holds a whole design system at once.',
          'Open Design treats Gemini CLI as a first-party adapter, so the agent slots into a structured, open-source design pipeline.',
        ],
        vendorLabel: 'Vendor',
        vendor: 'Google',
        credentialLabel: 'Credential',
        credential: 'Google account (free tier) or Gemini API key (BYOK)',
        designTitle: 'Designing with Gemini CLI',
        designLead: 'Gemini CLI’s design strengths cluster around its model and context:',
        designPoints: [
          { label: 'Multimodal screenshot → UI', body: 'Strong image understanding turns a reference image into responsive markup and checks the result against it.' },
          { label: '1M-token context', body: 'A whole design system, component library, and reference set fit at once, so output reuses your real primitives.' },
          { label: 'GEMINI.md + MCP', body: 'Context files carry your conventions; the Figma MCP server brings real design context into code.' },
          { label: 'Open and free to start', body: 'Apache-2.0 and a generous free tier via a Google account, with BYOK via the Gemini API.' },
        ],
        linksTitle: 'Real-world resources',
        linksLead: 'Official repo and docs for Gemini CLI:',
        links: [
          { label: 'google-gemini/gemini-cli (GitHub)', href: 'https://github.com/google-gemini/gemini-cli', source: 'GitHub · Google' },
          { label: 'Introducing Gemini CLI', href: 'https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-cli-open-source-ai-agent/', source: 'Blog · Google' },
          { label: 'Gemini CLI documentation', href: 'https://google-gemini.github.io/gemini-cli/', source: 'Docs · Google' },
        ],
        withOdTitle: 'Gemini CLI + Open Design',
        withOdLead:
          'Open Design is the open-source design layer around Gemini CLI: a curated skill and design-system library, a structured render pipeline, and a local desktop UI.',
        withOdSteps: [
          'Install Open Design and select Gemini CLI as your agent.',
          'Authenticate with your Google account or Gemini API key (BYOK) — credentials stay on your machine.',
          'Choose a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.',
          'Artifacts and DESIGN.md files live in your own repo, not a hosted cloud.',
        ],
        withOdClosing:
          'The same Gemini CLI agent — with a real, portable design workflow around it.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Open Design made by Google?', text: 'No. Gemini CLI is a Google product; Open Design is an independent open-source project that integrates it as a first-party adapter.' },
          { name: 'Do I need to pay?', text: 'No — a Google account gives a free tier, or bring a Gemini API key (BYOK). Open Design never proxies your credentials.' },
          { name: 'Is Open Design affiliated with Google?', text: 'No. Open Design is independent; Gemini is a trademark of Google.' },
        ],
        ctaTitle: 'Design with Gemini CLI, the open way.',
        ctaBody: 'Star the repo, download the desktop app, or join the community to request an adapter.',
      },
      copilot: {
        title: "GitHub Copilot CLI for design — Open Design",
        description: "How people use GitHub Copilot CLI for UI and web design — its terminal-native coding agent, custom instruction files, MCP support, and multi-model choice — and how Open Design turns Copilot CLI into a local-first, open-source design agent.",
        breadcrumb: "GitHub Copilot CLI",
        label: "Agent · GitHub Copilot CLI",
        heading: "GitHub Copilot CLI for design.",
        lead: "GitHub Copilot CLI is GitHub's terminal-native coding agent. It plans and edits across your repo, picks from frontier models like Claude and GPT, and reads your repository instructions — which makes it a real design tool once you give it references, conventions, and a verification loop. Open Design wires it into an open-source design workflow: your GitHub Copilot subscription, your files, local-first.",
        tldrTitle: "TL;DR",
        tldrBody: "Copilot CLI turns reference images and natural-language tasks into responsive UI from the terminal, with model choice and deep GitHub integration — available on your existing Copilot subscription. Open Design gives it a curated design-system and skill library plus a desktop workflow, and keeps everything local.",
        toc: ["What is GitHub Copilot CLI", "Designing with Copilot CLI", "Resources", "With Open Design", "FAQ"],
        rich: {"heroCtaLead": "Open Design turns GitHub Copilot CLI into a local-first, open-source design agent — your GitHub Copilot subscription, your files, a curated skill and design-system library around it.", "heroCtaActions": [{"label": "Use Copilot CLI inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["GitHub Copilot CLI is GitHub's terminal-native coding agent — the same agentic harness that powers Copilot coding agent, brought to your command line. Two things make it interesting for design specifically: it reads your repository instructions and AGENTS.md, so your design conventions travel with the agent on every run; and it lets you choose among frontier models from Anthropic, OpenAI, and Google per task, so you can pick the one that reasons best about a given UI. Paired with the right references, conventions, and a verification loop, it builds real, responsive UI — and it runs on the Copilot subscription you may already have. This is a practical, end-to-end guide to using Copilot CLI for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.", "It covers what Copilot CLI actually is, why repository instructions and model choice fit design, how to set it up from zero, the screenshot-to-UI loop, how custom instructions and MCP extend it, how it compares to Codex, Claude Code, Cursor, and Gemini CLI, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer — your subscription and credentials stay on your machine, your artifacts stay in your own repo."], "heroImage": {"src": "/agents/copilot-design/copilot-design-hero.webp", "alt": "GitHub Copilot CLI design feedback loop: a terminal agent reading a reference image, a browser rendering the UI, and a workspace, with a feedback arrow looping back", "caption": "The core loop: Copilot CLI reads your references in the terminal, builds and verifies the UI in a real browser, and iterates against them — with your design conventions in repository instructions."}, "tocLabel": "On this page", "toc": [{"id": "what-is-copilot", "label": "What GitHub Copilot CLI actually is"}, {"id": "why-design", "label": "Why instructions + model choice fit design"}, {"id": "setup", "label": "Set up Copilot CLI for design (from zero)"}, {"id": "screenshot-workflow", "label": "The screenshot-to-UI workflow"}, {"id": "extend", "label": "Custom instructions, MCP, and extensions"}, {"id": "vs", "label": "Copilot CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "Pitfalls and the “AI slop” look"}, {"id": "open-design", "label": "Designing with Copilot CLI in Open Design"}, {"id": "faq", "label": "FAQ"}], "sections": [{"id": "what-is-copilot", "heading": "What GitHub Copilot CLI actually is", "blocks": [{"kind": "p", "text": "GitHub Copilot CLI is GitHub's terminal-native coding agent. It reads your repository, edits files, runs shell commands, and works directly with your GitHub context — issues, pull requests, and repositories — authenticated with your existing GitHub account. It is powered by the same agentic harness as GitHub's Copilot coding agent, so it plans complex tasks and iterates rather than just completing lines. It reached general availability in February 2026 after a public preview that opened in September 2025."}, {"kind": "p", "text": "For design work, two properties stand out. It reads custom instruction files — repository-wide rules in .github/copilot-instructions.md plus AGENTS.md — so your design conventions are included automatically on every run. And it supports multiple foundation-model providers, so you can switch the model per task with the /model command to whichever reasons best about a given UI."}, {"kind": "steps", "items": [{"label": "Instruction files", "body": "Copilot CLI reads repository instructions in .github/copilot-instructions.md, path-specific files under .github/instructions, and AGENTS.md — the natural place to encode your design conventions, tokens, and review checklists."}, {"label": "Built-in tools + MCP", "body": "It ships with GitHub's MCP server built in and runs file and shell tools, and you can add custom MCP servers with /mcp add (stored in mcp-config.json under ~/.copilot) for external context like a live Figma file."}, {"label": "Model choice", "body": "Use the /model command to pick among frontier models from Anthropic, OpenAI, and Google — switching per task, all on your existing Copilot subscription."}]}, {"kind": "ul", "items": ["Vendor: GitHub", "Credential: an active GitHub Copilot subscription (Pro, Pro+, Business, or Enterprise)", "Install: npm install -g @github/copilot, then run copilot"]}]}, {"id": "why-design", "heading": "Why repository instructions and model choice fit design", "blocks": [{"kind": "p", "text": "Copilot CLI's design edge comes from two properties — but, as with every agent, taste still has to be supplied."}, {"kind": "steps", "items": [{"label": "Conventions that travel with the repo", "body": "Because Copilot CLI reads .github/copilot-instructions.md and AGENTS.md automatically, your tokens, primitives, and review rules are in context on every run — the agent works against a brand instead of a default look."}, {"label": "Pick the right model per task", "body": "Model choice across Anthropic, OpenAI, and Google means you can reach for the model that reasons best about a given layout, then switch for the next task — without changing your workflow."}, {"label": "Real specs via MCP", "body": "The built-in GitHub MCP server plus a Figma MCP server point the agent at your tokens, components, and real specs, so it builds from source instead of approximating."}]}, {"kind": "image", "src": "/agents/copilot-design/copilot-design-taste-triangle.webp", "alt": "Diagram showing design system, skill, and reference image converging into good design output", "caption": "Taste comes from three inputs you provide: a design system, a skill, and real reference images."}, {"kind": "p", "text": "The lesson is the same one every agent teaches: Copilot CLI does not have taste by default. It produces good design when you give it constraints — a design system, an aesthetic skill, and concrete references. Open Design packages exactly those inputs, which is why the two fit together (more below)."}]}, {"id": "setup", "heading": "Set up Copilot CLI for design work, from zero", "blocks": [{"kind": "p", "text": "Here is the full path from a clean machine to a Copilot CLI that can build and verify UI."}, {"kind": "code", "lang": "bash", "code": "# 1. Install Copilot CLI (Node.js required)\nnpm install -g @github/copilot\n\n# 2. Start it in your project and authenticate on first run\ncd your-project\ncopilot           # run /login and follow the prompts to sign in\n\n# 3. Choose a model for the task\n#    inside the session:\n/model            # pick a frontier model from Anthropic, OpenAI, or Google\n\n# 4. Add custom instructions and the Figma MCP server (optional)\n#    write .github/copilot-instructions.md or AGENTS.md\n/mcp add          # add the Figma MCP server for design handoff"}, {"kind": "image", "src": "/agents/copilot-design/copilot-design-setup-flow.webp", "alt": "Five-step setup flow: install, authenticate, choose a model, configure instructions, verify", "caption": "The setup sequence: install → authenticate → choose a model → write instructions → enable browser verification."}, {"kind": "steps", "items": [{"label": "Encode your design rules", "body": "Put your tokens, primitives, and conventions in .github/copilot-instructions.md or AGENTS.md, so output matches a brand instead of defaulting to a generic look."}, {"label": "Add browser verification", "body": "Wire a Playwright or browser MCP so Copilot renders in a real browser and checks its output across breakpoints instead of only confirming the build passes."}]}]}, {"id": "screenshot-workflow", "heading": "The screenshot-to-UI workflow", "blocks": [{"kind": "p", "text": "The highest-leverage design loop with Copilot CLI is turning a reference image into working, responsive UI and iterating until it matches — leaning on a strong multimodal model to compare output back to the reference."}, {"kind": "ol", "items": ["Start from the clearest visual references you have — and include multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.", "Be specific in the prompt; vague prompts produce generic UI even with a strong model.", "Keep your design system and conventions in .github/copilot-instructions.md or AGENTS.md, and tell Copilot where the tokens and canonical primitives live.", "Run a dev server and have Copilot render in a real browser, resizing to breakpoints to check the result.", "Iterate by having Copilot compare its implementation back to the screenshots — not merely confirm it builds."]}, {"kind": "p", "text": "Point Copilot at your reference images and give concrete constraints; it previews each file edit or command for your approval before it runs:"}, {"kind": "code", "lang": "bash", "code": "copilot\n# in the prompt:\n> Implement the design in reference-desktop.png and reference-mobile.png\n  in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens described in\n  .github/copilot-instructions.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints."}, {"kind": "p", "text": "Keep prompts small and focused, commit good iterations and revert bad ones (telling Copilot when you revert), so each pass builds on a clean base."}]}, {"id": "extend", "heading": "Custom instructions, MCP, and extensions", "blocks": [{"kind": "p", "text": "Three extension points make Copilot CLI practical for sustained design work, and all three map cleanly onto an open design workflow."}, {"kind": "steps", "items": [{"label": "Custom instructions", "body": "Repository rules live in .github/copilot-instructions.md (with path-specific files under .github/instructions and AGENTS.md). They are the durable home for your design conventions, included automatically on every run."}, {"label": "MCP servers", "body": "Copilot CLI ships with GitHub's MCP server built in and lets you add custom servers via /mcp add (stored in mcp-config.json under ~/.copilot) — the portable way to bring in design context, most relevantly the Figma MCP server, that works across agents, not just Copilot."}, {"label": "Specialized agents and built-in tools", "body": "Copilot CLI's specialized modes — for codebase exploration, running builds and tests, change review, and planning — plus its file and shell tools let it gather references and run the verification loop without leaving the terminal."}]}, {"kind": "p", "text": "These are portable, multi-agent capabilities — exactly the kind of thing Open Design is built to orchestrate, rather than re-create per project."}]}, {"id": "vs", "heading": "Copilot CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI for design", "blocks": [{"kind": "p", "text": "There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:"}, {"kind": "table", "columns": ["Agent", "Design strength", "Best for"], "rows": [["Copilot CLI", "Multi-model choice (Anthropic, OpenAI, Google) and deep GitHub integration on your Copilot subscription", "Picking the best model per task and instruction-driven work tied to your GitHub repo"], ["Codex", "Strong visual polish with a frontend skill; sandboxed async builds", "Delegated async builds and portable AGENTS.md rules"], ["Claude Code", "Specific design decisions (hex, spacing, type) and codebase-aware UX", "Frontend reasoning and large-context refactors"], ["Cursor", "Visual build-and-see loop with live preview and inline edits", "Tight iterate-and-watch UI work inside an IDE"], ["Gemini CLI", "Strong multimodal image understanding and a 1M-token context; open-source with a free tier", "Screenshot-heavy work and holding a whole design system in context"]]}, {"kind": "p", "text": "The recurring community verdict is that taste comes from humans: all of them default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped."}]}, {"id": "pitfalls", "heading": "Pitfalls, and how to avoid the “AI slop” look", "blocks": [{"kind": "p", "text": "The most common complaint about AI-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include broken mobile layouts and instructions leaking into UI copy. None of these are unique to Copilot CLI; they are what happens when any agent runs without a curated design context."}, {"kind": "steps", "items": [{"label": "Add an aesthetic skill", "body": "A curated design skill forces the agent to commit to a real direction instead of the default look."}, {"label": "Verify in a real browser", "body": "Render and self-check across breakpoints with a browser MCP so layouts do not silently break on mobile."}, {"label": "Supply tokens and references", "body": "Real design tokens and reference screenshots are the single biggest lever on output quality."}, {"label": "Encode rules in custom instructions", "body": "Put “no hero cards, max two typefaces, brand-first hierarchy” style rules in .github/copilot-instructions.md or AGENTS.md, where the agent reads them every run."}]}, {"kind": "p", "text": "Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes."}]}, {"id": "open-design", "heading": "Designing with Copilot CLI inside Open Design", "blocks": [{"kind": "p", "text": "Open Design is the open-source design layer the workflow above keeps asking for. It treats GitHub Copilot CLI as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes Copilot good is there from the first run, not assembled by hand each time. Open Design is independent, open-source (Apache-2.0), and local-first, which is why the pairing fits: the agent does the work, your files and credentials stay yours."}, {"kind": "ol", "items": ["Install Open Design and select GitHub Copilot CLI as your agent.", "Authenticate with your GitHub Copilot subscription — credentials stay on your machine and are never proxied through us.", "Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.", "Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud."]}, {"kind": "p", "text": "Same Copilot CLI agent, same subscription — plus a real, portable, open-source design workflow around it. Open Design is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine."}]}], "faqTitle": "Frequently asked questions", "faq": [{"name": "Can GitHub Copilot CLI really do design work?", "text": "Yes — with an aesthetic skill, a design system, and real reference images in context, Copilot CLI produces production-quality, responsive UI, and you can pick the model that verifies output best against references. Without that context it tends to default to a generic look, which is the gap Open Design fills."}, {"name": "Do I need a subscription to design with Copilot CLI?", "text": "Yes — Copilot CLI runs on an active GitHub Copilot subscription (Pro, Pro+, Business, or Enterprise); it is not bring-your-own-key. You authenticate with your GitHub account. Open Design never proxies your credentials — your subscription is used directly by your agent."}, {"name": "What makes Copilot CLI good for design specifically?", "text": "Two things: it reads repository instructions and AGENTS.md automatically, so your design conventions travel with the repo; and it lets you switch among frontier models from Anthropic, OpenAI, and Google per task. Both help — but taste still comes from the design system, skill, and references you supply."}, {"name": "Copilot CLI or Claude Code for frontend design?", "text": "Both are strong. Claude Code is known for specific, codebase-aware design decisions; Copilot CLI's edge is model choice across providers and deep GitHub integration on a subscription you may already have. Many teams use both — Open Design lets you switch agents without changing your design workflow."}, {"name": "How do I connect Copilot CLI to Figma?", "text": "Add the Figma MCP server with the /mcp add command; settings are stored in mcp-config.json under ~/.copilot. Copilot can then pull real design context — components, variables, layout data — so the generated code matches the source instead of approximating it."}, {"name": "Is Open Design affiliated with GitHub or Microsoft?", "text": "No. GitHub Copilot CLI is a product of GitHub; Open Design is an independent open-source project that supports it as a first-party adapter. GitHub Copilot is a trademark of GitHub, Inc. and Microsoft."}, {"name": "Are my files and credentials safe?", "text": "Yes — Open Design is local-first and Apache-2.0. Your files, artifacts, and DESIGN.md stay in your own repo, and your GitHub Copilot credentials are used directly by your agent, never routed through Open Design servers."}], "ctaTitle": "Design with GitHub Copilot CLI, the open way.", "ctaBody": "Bring your GitHub Copilot subscription, keep every file local, and get a curated design library around the agent you already use.", "ctaActions": [{"label": "Use Copilot CLI inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "See all supported agents"},
        aboutTitle: "What is GitHub Copilot CLI",
        aboutBody: ["GitHub Copilot CLI is GitHub's terminal-native coding agent, powered by the same agentic harness as Copilot coding agent. It reads your codebase, edits files, runs commands, and works with your GitHub issues, PRs, and repositories.", "It reads custom instruction files and AGENTS.md automatically, and lets you switch among frontier models from Anthropic, OpenAI, and Google per task.", "Open Design treats Copilot CLI as a first-party adapter, so the agent slots into a structured, open-source design pipeline."],
        vendorLabel: "Vendor",
        vendor: "GitHub",
        credentialLabel: "Credential",
        credential: "GitHub Copilot subscription",
        designTitle: "Designing with Copilot CLI",
        designLead: "Copilot CLI's design strengths cluster around instructions and model choice:",
        designPoints: [{"label": "Screenshot → UI", "body": "Pick a strong multimodal model and turn a reference image into responsive markup, then check the result against it."}, {"label": "Multi-model choice", "body": "Switch among frontier models from Anthropic, OpenAI, and Google per task with /model, all on your Copilot subscription."}, {"label": "Instructions + MCP", "body": "Custom instructions and AGENTS.md carry your conventions; the Figma MCP server brings real design context into code."}, {"label": "Deep GitHub integration", "body": "Built-in GitHub MCP server and access to your repos, issues, and PRs, authenticated with your existing GitHub account."}],
        linksTitle: "Real-world resources",
        linksLead: "Official repo and docs for GitHub Copilot CLI:",
        links: [{"label": "github/copilot-cli (GitHub)", "href": "https://github.com/github/copilot-cli", "source": "GitHub · GitHub"}, {"label": "Using GitHub Copilot CLI", "href": "https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/overview", "source": "Docs · GitHub"}, {"label": "GitHub Copilot CLI is now generally available", "href": "https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/", "source": "Changelog · GitHub"}],
        withOdTitle: "Copilot CLI + Open Design",
        withOdLead: "Open Design is the open-source design layer around Copilot CLI: a curated skill and design-system library, a structured render pipeline, and a local desktop UI.",
        withOdSteps: ["Install Open Design and select GitHub Copilot CLI as your agent.", "Authenticate with your GitHub Copilot subscription — credentials stay on your machine.", "Choose a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.", "Artifacts and DESIGN.md files live in your own repo, not a hosted cloud."],
        withOdClosing: "The same Copilot CLI agent — with a real, portable design workflow around it.",
        faqTitle: "FAQ",
        faq: [{"name": "Is Open Design made by GitHub?", "text": "No. GitHub Copilot CLI is a GitHub product; Open Design is an independent open-source project that integrates it as a first-party adapter."}, {"name": "Do I need a subscription?", "text": "Yes — Copilot CLI runs on an active GitHub Copilot subscription (Pro, Pro+, Business, or Enterprise). Open Design never proxies your credentials."}, {"name": "Is Open Design affiliated with GitHub or Microsoft?", "text": "No. Open Design is independent; GitHub Copilot is a trademark of GitHub, Inc. and Microsoft."}],
        ctaTitle: "Design with GitHub Copilot CLI, the open way.",
        ctaBody: "Star the repo, download the desktop app, or join the community to request an adapter.",
      },
      qwen: {
        title: "Qwen Code for design — Open Design",
        description: "How people use Alibaba’s open-source Qwen Code CLI for UI and web design — its Qwen3-Coder models, large context window, QWEN.md and MCP — and how Open Design turns Qwen Code into a local-first, open-source design agent.",
        breadcrumb: "Qwen Code",
        label: "Agent · Qwen Code",
        heading: "Qwen Code for design.",
        lead: "Qwen Code is Alibaba’s open-source terminal agent, adapted from Gemini CLI and tuned for the Qwen3-Coder models. Its large context window holds a whole design system at once, which makes it a real design tool — once you give it references, conventions, and a verification loop. Open Design wires it into an open-source design workflow: your DashScope or Qwen API key, your files, local-first.",
        tldrTitle: "TL;DR",
        tldrBody: "Qwen Code turns clear references into responsive UI with capable agentic coding and a big context window, BYOK with a DashScope or OpenAI-compatible key. Open Design gives it a curated design-system and skill library plus a desktop workflow — BYOK and keep everything local.",
        toc: ["What is Qwen Code", "Designing with Qwen Code", "Resources", "With Open Design", "FAQ"],
        rich: {"heroCtaLead": "Open Design turns Qwen Code into a local-first, open-source design agent — your DashScope or Qwen API key, your files, a curated skill and design-system library around it.", "heroCtaActions": [{"label": "Use Qwen Code inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Qwen Code is Alibaba’s open-source AI agent for the terminal. It is adapted from Google’s Gemini CLI, with parser-level and prompt adaptations that let it get the most out of the Qwen3-Coder models. Two things make it interesting for design specifically: it is a strong agentic coding model, so it plans, edits files, and runs the build and verification loop from a natural-language task; and its large context window can hold an entire design system and codebase at once. Paired with the right references, conventions, and a verification loop, it builds real, responsive UI — and it is open-source and BYOK, so you bring your own key. This is a practical, end-to-end guide to using Qwen Code for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.", "It covers what Qwen Code actually is, why a strong coder model plus a big context fit design, how to set it up from zero, the reference-to-UI loop, how QWEN.md and MCP extend it, how it compares to Codex, Claude Code, Cursor, and Gemini CLI, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer — a natural pairing, since both are open-source and run on your own machine."], "heroImage": {"src": "/agents/qwen-design/qwen-design-hero.webp", "alt": "Qwen Code design feedback loop: a terminal agent reading a reference image, a browser rendering the UI, and a workspace, with a feedback arrow looping back", "caption": "The core loop: Qwen Code reads your references in the terminal, builds and verifies the UI in a real browser, and iterates against them — with a whole design system in context."}, "tocLabel": "On this page", "toc": [{"id": "what-is-qwen", "label": "What Qwen Code actually is"}, {"id": "why-design", "label": "Why a strong coder model + big context fit design"}, {"id": "setup", "label": "Set up Qwen Code for design (from zero)"}, {"id": "screenshot-workflow", "label": "The reference-to-UI workflow"}, {"id": "extend", "label": "QWEN.md, MCP, and extensions"}, {"id": "vs", "label": "Qwen Code vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "Pitfalls and the “AI slop” look"}, {"id": "open-design", "label": "Designing with Qwen Code in Open Design"}, {"id": "faq", "label": "FAQ"}], "sections": [{"id": "what-is-qwen", "heading": "What Qwen Code actually is", "blocks": [{"kind": "p", "text": "Qwen Code is an open-source (Apache-2.0) AI agent that Alibaba ships for the terminal. It reads your repository, edits files, runs shell commands, and works the web — planning and verifying work from natural-language tasks rather than just completing lines. It is adapted from Google’s Gemini CLI, with parser-level and prompt adaptations tuned to unlock the Qwen3-Coder models on agentic coding tasks."}, {"kind": "p", "text": "For design work, two properties stand out. It is a capable agentic coder, so it can take a reference and a clear brief and build, run, and self-correct responsive UI. And the Qwen3-Coder models carry a large context window, big enough to hold your whole design system, component library, and reference set at once instead of summarizing them away."}, {"kind": "steps", "items": [{"label": "Context files", "body": "Qwen Code reads a QWEN.md file for persistent project context — the natural place to encode your design conventions, tokens, and review checklists. Personal and project settings layer on top."}, {"label": "Built-in tools + MCP", "body": "It ships file, shell, and web tools out of the box, and supports MCP servers (configured under mcpServers in ~/.qwen/settings.json) to add external context like a live Figma file."}, {"label": "BYOK to start", "body": "You bring your own key — a DashScope (Alibaba Cloud Model Studio) API key, or any OpenAI-compatible endpoint or ModelScope — and configure it in settings.json."}]}, {"kind": "ul", "items": ["Vendor: Alibaba", "Credential: DashScope / Qwen API key (BYOK), or OpenAI-compatible endpoint / ModelScope", "License: Apache-2.0, open source (adapted from Gemini CLI)"]}]}, {"id": "why-design", "heading": "Why a strong coder model and a big context fit design", "blocks": [{"kind": "p", "text": "Qwen Code’s design edge comes from two properties — but, as with every agent, taste still has to be supplied."}, {"kind": "steps", "items": [{"label": "Strong agentic coding", "body": "The Qwen3-Coder models are tuned for agentic tasks, so the agent plans, edits, runs the build, and self-corrects — turning a clear reference and brief into responsive markup rather than a one-shot guess."}, {"label": "A large context window", "body": "Qwen3-Coder’s big context means the whole design system, tokens, and many reference states fit at once, so the agent reuses your real primitives rather than inventing one-off styles."}, {"label": "Conventions in QWEN.md", "body": "A QWEN.md (plus the Figma MCP server) points the agent at your tokens, components, and real specs, so it works against a brand instead of a default look."}]}, {"kind": "image", "src": "/agents/qwen-design/qwen-design-taste-triangle.webp", "alt": "Diagram showing design system, skill, and reference image converging into good design output", "caption": "Taste comes from three inputs you provide: a design system, a skill, and real reference images."}, {"kind": "p", "text": "The lesson is the same one every agent teaches: Qwen Code does not have taste by default. It produces good design when you give it constraints — a design system, an aesthetic skill, and concrete references. Open Design packages exactly those inputs, which is why the two fit together (more below)."}]}, {"id": "setup", "heading": "Set up Qwen Code for design work, from zero", "blocks": [{"kind": "p", "text": "Here is the full path from a clean machine to a Qwen Code that can build and verify UI."}, {"kind": "code", "lang": "bash", "code": "# 1. Install Qwen Code (Node 22+)\nnpm install -g @qwen-code/qwen-code@latest\n# or: brew install qwen-code\n\n# 2. Start it in your project and authenticate on first run\ncd your-project\nqwen              # run /auth, or set a key in ~/.qwen/settings.json\n\n# 3. Configure a DashScope (OpenAI-compatible) key in settings.json\n#    baseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1\n#    model:   qwen3-coder-plus   (set DASHSCOPE_API_KEY)\n\n# 4. Add a QWEN.md and wire the Figma MCP server (optional)\n#    add MCP under \"mcpServers\" in ~/.qwen/settings.json"}, {"kind": "image", "src": "/agents/qwen-design/qwen-design-setup-flow.webp", "alt": "Five-step setup flow: install, authenticate, configure QWEN.md, add a skill, verify", "caption": "The setup sequence: install → authenticate → configure QWEN.md → add a skill → enable browser verification."}, {"kind": "steps", "items": [{"label": "Encode your design rules", "body": "Put your tokens, primitives, and conventions in QWEN.md and point Qwen Code at them, so output matches a brand instead of defaulting to a generic look."}, {"label": "Add browser verification", "body": "Wire a Playwright or browser MCP so Qwen Code renders in a real browser and checks its output across breakpoints instead of only confirming the build passes."}]}]}, {"id": "screenshot-workflow", "heading": "The reference-to-UI workflow", "blocks": [{"kind": "p", "text": "The highest-leverage design loop with Qwen Code is turning a reference into working, responsive UI and iterating until it matches — leaning on the agent to build, render, and compare its output back to the reference."}, {"kind": "ol", "items": ["Start from the clearest visual references you have — and describe multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.", "Be specific in the prompt; vague prompts produce generic UI even with a strong model.", "Keep your design system and conventions in QWEN.md, and tell Qwen Code where the tokens and canonical primitives live.", "Run a dev server and have Qwen Code render in a real browser, resizing to breakpoints to check the result.", "Iterate by having Qwen Code compare its implementation back to the references — not merely confirm it builds."]}, {"kind": "p", "text": "Reference a file with @ to attach it to the prompt, then give concrete constraints:"}, {"kind": "code", "lang": "bash", "code": "qwen\n# in the prompt:\n> @reference-desktop.png @reference-mobile.png\n  Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from QWEN.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints."}, {"kind": "p", "text": "Keep prompts small and focused, commit good iterations and revert bad ones (telling Qwen Code when you revert), so each pass builds on a clean base."}]}, {"id": "extend", "heading": "QWEN.md, MCP, and extensions", "blocks": [{"kind": "p", "text": "Three extension points make Qwen Code practical for sustained design work, and all three map cleanly onto an open design workflow."}, {"kind": "steps", "items": [{"label": "QWEN.md context", "body": "Project rules live in a QWEN.md at the repo root (with global and project layers). It is the durable home for your design conventions, read on every run."}, {"label": "MCP servers", "body": "Configure MCP servers under mcpServers in ~/.qwen/settings.json — the portable way to bring in design context and external tools, most relevantly the Figma MCP server, that work across agents, not just Qwen Code."}, {"label": "Skills and built-in tools", "body": "Qwen Code skills and its built-in file, shell, and web tools let it gather references and run the verification loop without leaving the terminal."}]}, {"kind": "p", "text": "These are portable, multi-agent capabilities — exactly the kind of thing Open Design is built to orchestrate, rather than re-create per project."}]}, {"id": "vs", "heading": "Qwen Code vs Codex vs Claude Code vs Cursor vs Gemini CLI for design", "blocks": [{"kind": "p", "text": "There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:"}, {"kind": "table", "columns": ["Agent", "Design strength", "Best for"], "rows": [["Qwen Code", "Strong agentic coding on the open Qwen3-Coder models with a large context; open-source and BYOK", "Open-source, key-flexible builds that hold a whole design system in context"], ["Codex", "Strong visual polish with a frontend skill; sandboxed async builds", "Delegated async builds and portable AGENTS.md rules"], ["Claude Code", "Specific design decisions (hex, spacing, type) and codebase-aware UX", "Frontend reasoning and large-context refactors"], ["Cursor", "Visual build-and-see loop with live preview and inline edits", "Tight iterate-and-watch UI work inside an IDE"], ["Gemini CLI", "Strong multimodal image understanding and a 1M-token context; the agent Qwen Code is adapted from", "Screenshot-heavy work and very large context"]]}, {"kind": "p", "text": "The recurring community verdict is that taste comes from humans: all of them default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped."}]}, {"id": "pitfalls", "heading": "Pitfalls, and how to avoid the “AI slop” look", "blocks": [{"kind": "p", "text": "The most common complaint about AI-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include broken mobile layouts and instructions leaking into UI copy. None of these are unique to Qwen Code; they are what happens when any agent runs without a curated design context."}, {"kind": "steps", "items": [{"label": "Add an aesthetic skill", "body": "A curated design skill forces the agent to commit to a real direction instead of the default look."}, {"label": "Verify in a real browser", "body": "Have the agent render and self-check across breakpoints so layouts do not silently break on mobile."}, {"label": "Supply tokens and references", "body": "Real design tokens and reference screenshots are the single biggest lever on output quality."}, {"label": "Encode rules in QWEN.md", "body": "Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run."}]}, {"kind": "p", "text": "Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes."}]}, {"id": "open-design", "heading": "Designing with Qwen Code inside Open Design", "blocks": [{"kind": "p", "text": "Open Design is the open-source design layer the workflow above keeps asking for. It treats Qwen Code as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes Qwen Code good is there from the first run, not assembled by hand each time. Both are open-source and local-first, which makes the pairing a natural fit."}, {"kind": "ol", "items": ["Install Open Design and select Qwen Code as your agent.", "Authenticate with your DashScope or Qwen API key (BYOK) — credentials stay on your machine and are never proxied through us.", "Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.", "Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud."]}, {"kind": "p", "text": "Same Qwen Code agent, same key — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine."}]}], "faqTitle": "Frequently asked questions", "faq": [{"name": "Can Qwen Code really do design work?", "text": "Yes — with an aesthetic skill, a design system, and real reference images in context, Qwen Code produces production-quality, responsive UI, and its agentic loop builds, renders, and verifies output against references. Without that context it tends to default to a generic look, which is the gap Open Design fills."}, {"name": "Do I need to pay to design with Qwen Code?", "text": "Qwen Code is free and open-source, but it is BYOK — you bring a DashScope (Alibaba Cloud Model Studio) API key, an OpenAI-compatible endpoint, or ModelScope. Alibaba also offers a fixed-fee coding plan. Open Design never proxies your credentials either way."}, {"name": "What makes Qwen Code good for design specifically?", "text": "Two things: the Qwen3-Coder models are tuned for agentic coding, so the agent builds and self-corrects responsive UI, and their large context can hold an entire design system and reference set at once. Both help — but taste still comes from the design system, skill, and references you supply."}, {"name": "Is Qwen Code the same as Gemini CLI?", "text": "No. Qwen Code is adapted from Google’s Gemini CLI — same open-source lineage — with parser-level and prompt adaptations that tune it for the Qwen3-Coder models. Open Design supports both, so you can switch agents without changing your design workflow."}, {"name": "How do I connect Qwen Code to Figma?", "text": "Add the Figma MCP server under mcpServers in ~/.qwen/settings.json. Qwen Code can then pull real design context — components, variables, layout data — so the generated code matches the source instead of approximating it."}, {"name": "Is Open Design affiliated with Alibaba or Qwen?", "text": "No. Qwen Code is a product of Alibaba; Open Design is an independent open-source project that supports it as a first-party adapter. Qwen is a trademark of Alibaba."}, {"name": "Are my files and credentials safe?", "text": "Yes — Open Design is local-first and Apache-2.0. Your files, artifacts, and DESIGN.md stay in your own repo, and your DashScope or Qwen credentials are used directly by your agent, never routed through Open Design servers."}], "ctaTitle": "Design with Qwen Code, the open way.", "ctaBody": "Bring your own DashScope or Qwen API key, keep every file local, and get a curated design library around the agent you already use.", "ctaActions": [{"label": "Use Qwen Code inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "See all supported agents"},
        aboutTitle: "What is Qwen Code",
        aboutBody: ["Qwen Code is Alibaba’s open-source (Apache-2.0) terminal AI agent, adapted from Google’s Gemini CLI. It reads your codebase, edits files, runs commands, and works the web.", "It is tuned for the Qwen3-Coder models, whose large context window lets it hold a whole design system and reference set at once.", "Open Design treats Qwen Code as a first-party adapter, so the agent slots into a structured, open-source design pipeline."],
        vendorLabel: "Vendor",
        vendor: "Alibaba",
        credentialLabel: "Credential",
        credential: "DashScope / Qwen API key (BYOK)",
        designTitle: "Designing with Qwen Code",
        designLead: "Qwen Code’s design strengths cluster around its model and context:",
        designPoints: [{"label": "Reference → UI", "body": "Strong agentic coding turns a clear reference and brief into responsive markup and self-checks the result against it."}, {"label": "Large context", "body": "A whole design system, component library, and reference set fit at once, so output reuses your real primitives."}, {"label": "QWEN.md + MCP", "body": "Context files carry your conventions; the Figma MCP server brings real design context into code."}, {"label": "Open and BYOK", "body": "Apache-2.0 and key-flexible — a DashScope or Qwen API key, an OpenAI-compatible endpoint, or ModelScope."}],
        linksTitle: "Real-world resources",
        linksLead: "Official repo and docs for Qwen Code:",
        links: [{"label": "QwenLM/qwen-code (GitHub)", "href": "https://github.com/QwenLM/qwen-code", "source": "GitHub · Alibaba / Qwen"}, {"label": "Qwen Code documentation", "href": "https://qwenlm.github.io/qwen-code-docs/en/", "source": "Docs · Qwen"}, {"label": "Qwen3-Coder: Agentic Coding in the World", "href": "https://qwen.ai/blog?id=qwen3-coder", "source": "Blog · Qwen"}],
        withOdTitle: "Qwen Code + Open Design",
        withOdLead: "Open Design is the open-source design layer around Qwen Code: a curated skill and design-system library, a structured render pipeline, and a local desktop UI.",
        withOdSteps: ["Install Open Design and select Qwen Code as your agent.", "Authenticate with your DashScope or Qwen API key (BYOK) — credentials stay on your machine.", "Choose a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.", "Artifacts and DESIGN.md files live in your own repo, not a hosted cloud."],
        withOdClosing: "The same Qwen Code agent — with a real, portable design workflow around it.",
        faqTitle: "FAQ",
        faq: [{"name": "Is Open Design made by Alibaba?", "text": "No. Qwen Code is an Alibaba product; Open Design is an independent open-source project that integrates it as a first-party adapter."}, {"name": "Do I need to pay?", "text": "Qwen Code is open-source but BYOK — bring a DashScope or Qwen API key, an OpenAI-compatible endpoint, or ModelScope. Open Design never proxies your credentials."}, {"name": "Is Open Design affiliated with Alibaba or Qwen?", "text": "No. Open Design is independent; Qwen is a trademark of Alibaba."}],
        ctaTitle: "Design with Qwen Code, the open way.",
        ctaBody: "Star the repo, download the desktop app, or join the community to request an adapter.",
      },
      grok: {
        title: "Grok CLI for design — Open Design",
        description: "How people use xAI's Grok CLI (Grok Build) for UI and web design — its plan mode, AGENTS.md and MCP, image-aware Grok models and large context — and how Open Design turns Grok CLI into a local-first, open-source design agent.",
        breadcrumb: "Grok CLI",
        label: "Agent · Grok CLI",
        heading: "Grok CLI for design.",
        lead: "Grok CLI is xAI's terminal coding agent. It plans multi-step work before it touches your files, reads images alongside code, and runs the build-and-verify loop in your repo — which makes it a real design tool once you give it references, conventions, and a verification step. Open Design wires it into an open-source design workflow: your SuperGrok login or xAI API key, your files, local-first.",
        tldrTitle: "TL;DR",
        tldrBody: "Grok CLI turns reference images into responsive UI with plan-mode review, parallel subagents, and image-aware Grok models, authenticated through your SuperGrok or X Premium+ account. Open Design gives it a curated design-system and skill library plus a desktop workflow — BYOK and keep everything local.",
        toc: ["What is Grok CLI", "Designing with Grok CLI", "Resources", "With Open Design", "FAQ"],
        rich: {"heroCtaLead": "Open Design turns Grok CLI into a local-first, open-source design agent — your SuperGrok login or xAI API key, your files, a curated skill and design-system library around it.", "heroCtaActions": [{"label": "Use Grok CLI inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Grok CLI — xAI's terminal coding agent, shipped as Grok Build — is an agentic tool that lives in your terminal. Two things make it interesting for design specifically: it plans risky work before it acts, so you can review a proposed approach before any files change; and its Grok models accept image input, so it can reason about a reference screenshot alongside the code it is writing. Paired with the right references, conventions, and a verification loop, it builds real, responsive UI — authenticated straight through your SuperGrok or X Premium+ account, no API-key juggling required. This is a practical, end-to-end guide to using Grok CLI for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.", "It covers what Grok CLI actually is, why plan mode and image-aware models fit design, how to set it up from zero, the screenshot-to-UI loop, how AGENTS.md and MCP extend it, how it compares to Codex, Claude Code, Cursor, and Gemini CLI, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer — your credentials and artifacts never leaving your machine."], "heroImage": {"src": "/agents/grok-design/grok-design-hero.webp", "alt": "Grok CLI design feedback loop: a terminal agent planning from a reference image, a browser rendering the UI, and a workspace, with a feedback arrow looping back", "caption": "The core loop: Grok CLI plans from your references in the terminal, builds and verifies the UI in a real browser, and iterates against them — with your conventions in AGENTS.md."}, "tocLabel": "On this page", "toc": [{"id": "what-is-grok", "label": "What Grok CLI actually is"}, {"id": "why-design", "label": "Why plan mode + image input fit design"}, {"id": "setup", "label": "Set up Grok CLI for design (from zero)"}, {"id": "screenshot-workflow", "label": "The screenshot-to-UI workflow"}, {"id": "extend", "label": "AGENTS.md, MCP, and subagents"}, {"id": "vs", "label": "Grok CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "Pitfalls and the “AI slop” look"}, {"id": "open-design", "label": "Designing with Grok CLI in Open Design"}, {"id": "faq", "label": "FAQ"}], "sections": [{"id": "what-is-grok", "heading": "What Grok CLI actually is", "blocks": [{"kind": "p", "text": "Grok CLI is xAI's terminal coding agent, shipped under the name Grok Build. It reads your repository, edits files, runs shell commands, and plans multi-step engineering work from natural-language tasks rather than just completing lines. It is built around xAI's Grok models — exposed on the xAI API as the grok-build model family — and authenticates through your xAI account, so the agent and the models come from the same vendor."}, {"kind": "p", "text": "For design work, two properties stand out. It has a plan mode that drafts a structured approach you can approve, comment on, or rewrite before any change lands — a useful gate when you are iterating on UI. And its Grok models accept image input, so you can hand it a reference screenshot and it reasons about the actual layout instead of guessing from a prose description."}, {"kind": "steps", "items": [{"label": "Context files", "body": "Grok CLI reads an AGENTS.md file for persistent project context — the natural place to encode your design conventions, tokens, and review checklists. It follows the same open AGENTS.md convention that Codex and other agents use."}, {"label": "Tools, MCP + subagents", "body": "It edits files, runs shell commands, and supports MCP servers to add external context like a live Figma file; for larger tasks it can delegate to parallel subagents that research, build, and review at once."}, {"label": "Sign in with your account", "body": "You authenticate by signing in through your browser with a SuperGrok or X Premium+ subscription; you can also bring an xAI API key for headless and CI use."}]}, {"kind": "ul", "items": ["Vendor: xAI", "Credential: xAI SuperGrok OAuth (`grok login`), or an xAI API key (BYOK) for headless use", "Models: xAI Grok models (the grok-build family on the xAI API), with image input"]}]}, {"id": "why-design", "heading": "Why plan mode and image-aware models fit design", "blocks": [{"kind": "p", "text": "Grok CLI's design edge comes from two properties — but, as with every agent, taste still has to be supplied."}, {"kind": "steps", "items": [{"label": "Image-aware reasoning", "body": "Because Grok models accept image input, the agent reads reference screenshots — comparing its rendered output back to an image instead of guessing from a prose description."}, {"label": "Plan mode before changes land", "body": "Plan mode drafts a structured approach you approve before files change, so design intent is reviewed up front instead of discovered after the diff."}, {"label": "Conventions in AGENTS.md", "body": "An AGENTS.md (plus the Figma MCP server) points the agent at your tokens, components, and real specs, so it works against a brand instead of a default look."}]}, {"kind": "image", "src": "/agents/grok-design/grok-design-taste-triangle.webp", "alt": "Diagram showing design system, skill, and reference image converging into good design output", "caption": "Taste comes from three inputs you provide: a design system, a skill, and real reference images."}, {"kind": "p", "text": "The lesson is the same one every agent teaches: Grok CLI does not have taste by default. It produces good design when you give it constraints — a design system, an aesthetic skill, and concrete references. Open Design packages exactly those inputs, which is why the two fit together (more below)."}]}, {"id": "setup", "heading": "Set up Grok CLI for design work, from zero", "blocks": [{"kind": "p", "text": "Here is the full path from a clean machine to a Grok CLI that can build and verify UI."}, {"kind": "code", "lang": "bash", "code": "# 1. Install Grok CLI (Grok Build) on macOS/Linux\ncurl -fsSL https://x.ai/cli/install.sh | bash\n\n# 2. Start it in your project and authenticate on first run\ncd your-project\ngrok login   # opens your browser; sign in with SuperGrok / X Premium+\n#   or, for headless / CI use, set an xAI API key:\n#   export XAI_API_KEY=xai-...\n\n# 3. Add project context\n#    create an AGENTS.md at the repo root with your design conventions\n\n# 4. Wire the Figma MCP server (optional, for design handoff)\n#    add it to your MCP server configuration"}, {"kind": "image", "src": "/agents/grok-design/grok-design-setup-flow.webp", "alt": "Five-step setup flow: install, authenticate, configure AGENTS.md, add a skill, verify", "caption": "The setup sequence: install → authenticate → configure AGENTS.md → add a skill → enable browser verification."}, {"kind": "steps", "items": [{"label": "Encode your design rules", "body": "Put your tokens, primitives, and conventions in AGENTS.md and point Grok at them, so output matches a brand instead of defaulting to a generic look."}, {"label": "Add browser verification", "body": "Wire a Playwright or browser MCP so Grok renders in a real browser and checks its output across breakpoints instead of only confirming the build passes."}]}]}, {"id": "screenshot-workflow", "heading": "The screenshot-to-UI workflow", "blocks": [{"kind": "p", "text": "The highest-leverage design loop with Grok CLI is turning a reference image into working, responsive UI and iterating until it matches — leaning on plan mode to agree on the approach and the image-aware model to compare output back to the reference."}, {"kind": "ol", "items": ["Start from the clearest visual references you have — and include multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.", "Be specific in the prompt; vague prompts produce generic UI even with a strong model.", "Keep your design system and conventions in AGENTS.md, and tell Grok where the tokens and canonical primitives live.", "Use plan mode to review the approach, then run a dev server and have Grok render in a real browser, resizing to breakpoints to check the result.", "Iterate by having Grok compare its implementation back to the screenshots — not merely confirm it builds."]}, {"kind": "p", "text": "Attach your reference images and give concrete constraints:"}, {"kind": "code", "lang": "bash", "code": "grok\n# in the prompt (attach reference-desktop.png and reference-mobile.png):\n> Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from AGENTS.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Show me the plan first, then render it in the browser and iterate\n  until it matches the references across breakpoints."}, {"kind": "p", "text": "Keep prompts small and focused, commit good iterations and revert bad ones (telling Grok when you revert), so each pass builds on a clean base."}]}, {"id": "extend", "heading": "AGENTS.md, MCP, and subagents", "blocks": [{"kind": "p", "text": "Three extension points make Grok CLI practical for sustained design work, and all three map cleanly onto an open design workflow."}, {"kind": "steps", "items": [{"label": "AGENTS.md context", "body": "Project rules live in an AGENTS.md at the repo root. It is the durable home for your design conventions, read on every run — and it is the same open format other agents understand, so the rules travel with you."}, {"label": "MCP servers", "body": "Configure MCP servers to bring in design context and external tools, most relevantly the Figma MCP server — the portable way to feed real specs into code, that works across agents, not just Grok."}, {"label": "Subagents and built-in tools", "body": "Grok CLI can spawn parallel subagents to research, build, and review at once, and its file, shell, and search tools let it gather references and run the verification loop without leaving the terminal."}]}, {"kind": "p", "text": "These are portable, multi-agent capabilities — exactly the kind of thing Open Design is built to orchestrate, rather than re-create per project."}]}, {"id": "vs", "heading": "Grok CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI for design", "blocks": [{"kind": "p", "text": "There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:"}, {"kind": "table", "columns": ["Agent", "Design strength", "Best for"], "rows": [["Grok CLI", "Plan-mode review before changes land, image-aware Grok models, and parallel subagents; signs in with your SuperGrok account", "Reviewed, plan-first UI builds with xAI models in the loop"], ["Codex", "Strong visual polish with a frontend skill; sandboxed async builds", "Delegated async builds and portable AGENTS.md rules"], ["Claude Code", "Specific design decisions (hex, spacing, type) and codebase-aware UX", "Frontend reasoning and large-context refactors"], ["Cursor", "Visual build-and-see loop with live preview and inline edits", "Tight iterate-and-watch UI work inside an IDE"], ["Gemini CLI", "Strong multimodal image understanding and a very large context; open-source with a free tier", "Screenshot-heavy work and holding a whole design system in context"]]}, {"kind": "p", "text": "The recurring community verdict is that taste comes from humans: all of them default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped."}]}, {"id": "pitfalls", "heading": "Pitfalls, and how to avoid the “AI slop” look", "blocks": [{"kind": "p", "text": "The most common complaint about AI-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include broken mobile layouts and instructions leaking into UI copy. None of these are unique to Grok CLI; they are what happens when any agent runs without a curated design context."}, {"kind": "steps", "items": [{"label": "Add an aesthetic skill", "body": "A curated design skill forces the agent to commit to a real direction instead of the default look."}, {"label": "Verify in a real browser", "body": "Render and self-check across breakpoints so layouts do not silently break on mobile."}, {"label": "Supply tokens and references", "body": "Real design tokens and reference screenshots are the single biggest lever on output quality."}, {"label": "Encode rules in AGENTS.md", "body": "Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run."}]}, {"kind": "p", "text": "Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes."}]}, {"id": "open-design", "heading": "Designing with Grok CLI inside Open Design", "blocks": [{"kind": "p", "text": "Open Design is the open-source design layer the workflow above keeps asking for. It treats Grok CLI as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes Grok good is there from the first run, not assembled by hand each time. Open Design is independent and Apache-2.0, and it runs on your own machine, which makes the pairing a natural fit."}, {"kind": "ol", "items": ["Install Open Design and select Grok CLI as your agent.", "Authenticate with your SuperGrok account or an xAI API key (BYOK) — credentials stay on your machine and are never proxied through us.", "Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.", "Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud."]}, {"kind": "p", "text": "Same Grok CLI agent, same credentials — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine."}]}], "faqTitle": "Frequently asked questions", "faq": [{"name": "Can Grok CLI really do design work?", "text": "Yes — with an aesthetic skill, a design system, and real reference images in context, Grok CLI produces production-quality, responsive UI, and its image-aware Grok models help verify output against references. Without that context it tends to default to a generic look, which is the gap Open Design fills."}, {"name": "How do I authenticate Grok CLI?", "text": "You sign in through your browser with a SuperGrok or X Premium+ subscription (`grok login`), so there is no API key to manage. For headless or CI use you can bring an xAI API key instead. Open Design never proxies your credentials either way."}, {"name": "What makes Grok CLI good for design specifically?", "text": "Two things: its plan mode lets you review the approach before any change lands, and its Grok models accept image input, so it reads reference screenshots well. Both help — but taste still comes from the design system, skill, and references you supply."}, {"name": "Grok CLI or Claude Code for frontend design?", "text": "Both are strong. Claude Code is known for specific, codebase-aware design decisions; Grok CLI's edge is plan-mode review and image-aware xAI models. Many teams use both — Open Design lets you switch agents without changing your design workflow."}, {"name": "How do I connect Grok CLI to Figma?", "text": "Add the Figma MCP server to your MCP configuration. Grok can then pull real design context — components, variables, layout data — so the generated code matches the source instead of approximating it."}, {"name": "Is Open Design affiliated with xAI?", "text": "No. Grok CLI is a product of xAI; Open Design is an independent open-source project that supports it as a first-party adapter. Grok is a trademark of xAI."}, {"name": "Are my files and credentials safe?", "text": "Yes — Open Design is local-first and Apache-2.0. Your files, artifacts, and DESIGN.md stay in your own repo, and your xAI credentials are used directly by your agent, never routed through Open Design servers."}], "ctaTitle": "Design with Grok CLI, the open way.", "ctaBody": "Bring your own SuperGrok account or xAI API key, keep every file local, and get a curated design library around the agent you already use.", "ctaActions": [{"label": "Use Grok CLI inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "See all supported agents"},
        aboutTitle: "What is Grok CLI",
        aboutBody: ["Grok CLI is xAI's terminal coding agent, shipped as Grok Build. It reads your codebase, edits files, runs shell commands, and plans multi-step engineering work before it acts.", "It is built on xAI's Grok models, which accept image input, so it can reason about a reference screenshot alongside the code it writes, and it reads an AGENTS.md for project conventions.", "Open Design treats Grok CLI as a first-party adapter, so the agent slots into a structured, open-source design pipeline."],
        vendorLabel: "Vendor",
        vendor: "xAI",
        credentialLabel: "Credential",
        credential: "xAI SuperGrok OAuth (`grok login`)",
        designTitle: "Designing with Grok CLI",
        designLead: "Grok CLI's design strengths cluster around its workflow and models:",
        designPoints: [{"label": "Image-aware screenshot → UI", "body": "Grok models accept image input, turning a reference image into responsive markup and checking the result against it."}, {"label": "Plan mode before changes", "body": "A structured plan you approve before files change, so design intent is reviewed up front instead of after the diff."}, {"label": "AGENTS.md + MCP", "body": "Context files carry your conventions; the Figma MCP server brings real design context into code."}, {"label": "Sign in with your account", "body": "Authenticate through SuperGrok or X Premium+ with OAuth, or bring an xAI API key (BYOK) for headless use."}],
        linksTitle: "Real-world resources",
        linksLead: "Official pages and docs for Grok CLI (Grok Build):",
        links: [{"label": "Grok Build (Grok CLI)", "href": "https://x.ai/cli", "source": "xAI"}, {"label": "Introducing Grok Build", "href": "https://x.ai/news/grok-build-cli", "source": "News · xAI"}, {"label": "xAI models documentation", "href": "https://docs.x.ai/docs/models", "source": "Docs · xAI"}],
        withOdTitle: "Grok CLI + Open Design",
        withOdLead: "Open Design is the open-source design layer around Grok CLI: a curated skill and design-system library, a structured render pipeline, and a local desktop UI.",
        withOdSteps: ["Install Open Design and select Grok CLI as your agent.", "Authenticate with your SuperGrok account or an xAI API key (BYOK) — credentials stay on your machine.", "Choose a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.", "Artifacts and DESIGN.md files live in your own repo, not a hosted cloud."],
        withOdClosing: "The same Grok CLI agent — with a real, portable design workflow around it.",
        faqTitle: "FAQ",
        faq: [{"name": "Is Open Design made by xAI?", "text": "No. Grok CLI is an xAI product; Open Design is an independent open-source project that integrates it as a first-party adapter."}, {"name": "How do I sign in?", "text": "Grok CLI signs in through your browser with a SuperGrok or X Premium+ subscription, or you can bring an xAI API key (BYOK). Open Design never proxies your credentials."}, {"name": "Is Open Design affiliated with xAI?", "text": "No. Open Design is independent; Grok is a trademark of xAI."}],
        ctaTitle: "Design with Grok CLI, the open way.",
        ctaBody: "Star the repo, download the desktop app, or join the community to request an adapter.",
      },
      kimi: {
        title: "Kimi CLI for design — Open Design",
        description: "How people use Moonshot AI’s Kimi CLI for UI and web design — its Kimi K2 agentic models, large context, AGENTS.md and MCP — and how Open Design turns Kimi CLI into a local-first, open-source design agent.",
        breadcrumb: "Kimi CLI",
        label: "Agent · Kimi CLI",
        heading: "Kimi CLI for design.",
        lead: "Kimi CLI is Moonshot AI’s open-source terminal agent, powered by the Kimi K2 model series. Its strong agentic coding and large context window let it hold a whole design system and iterate against references — once you give it conventions and a verification loop, it becomes a real design tool. Open Design wires it into an open-source design workflow: your Moonshot API key, your files, local-first.",
        tldrTitle: "TL;DR",
        tldrBody: "Kimi CLI turns references and conventions into responsive UI with the agentic Kimi K2 models and a large context window, with BYOK or an OAuth login. Open Design gives it a curated design-system and skill library plus a desktop workflow — BYOK and keep everything local.",
        toc: ["What is Kimi CLI", "Designing with Kimi CLI", "Resources", "With Open Design", "FAQ"],
        rich: {"heroCtaLead": "Open Design turns Kimi CLI into a local-first, open-source design agent — your Moonshot API key, your files, a curated skill and design-system library around it.", "heroCtaActions": [{"label": "Use Kimi CLI inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Kimi CLI is Moonshot AI’s open-source AI agent for the terminal. Two things make it interesting for design specifically: it is powered by the Kimi K2 series — a trillion-parameter mixture-of-experts model meticulously optimized for agentic coding and tool use; and that model carries a large context window (256k tokens on recent K2 releases), big enough to hold an entire design system and codebase at once. Paired with the right references, conventions, and a verification loop, it builds real, responsive UI — and you can start with an OAuth login or your own Moonshot API key. This is a practical, end-to-end guide to using Kimi CLI for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.", "It covers what Kimi CLI actually is, why its agentic Kimi K2 models and large context fit design, how to set it up from zero, the reference-to-UI loop, how AGENTS.md, MCP, and subagents extend it, how it compares to Codex, Claude Code, Cursor, and Gemini CLI, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer — a natural pairing, since both are open-source and run on your own machine."], "heroImage": {"src": "/agents/kimi-design/kimi-design-hero.webp", "alt": "Kimi CLI design feedback loop: a terminal agent reading a reference image, a browser rendering the UI, and a workspace, with a feedback arrow looping back", "caption": "The core loop: Kimi CLI reads your references in the terminal, builds and verifies the UI in a real browser, and iterates against them — with a whole design system in context."}, "tocLabel": "On this page", "toc": [{"id": "what-is-kimi", "label": "What Kimi CLI actually is"}, {"id": "why-design", "label": "Why agentic K2 + large context fit design"}, {"id": "setup", "label": "Set up Kimi CLI for design (from zero)"}, {"id": "screenshot-workflow", "label": "The reference-to-UI workflow"}, {"id": "extend", "label": "AGENTS.md, MCP, and subagents"}, {"id": "vs", "label": "Kimi CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "Pitfalls and the “AI slop” look"}, {"id": "open-design", "label": "Designing with Kimi CLI in Open Design"}, {"id": "faq", "label": "FAQ"}], "sections": [{"id": "what-is-kimi", "heading": "What Kimi CLI actually is", "blocks": [{"kind": "p", "text": "Kimi CLI is an open-source (Apache-2.0) AI agent that Moonshot AI ships for the terminal. It reads your repository, edits files, runs shell commands, searches files, fetches web pages, and chooses its next step from the feedback it gets — planning and verifying work from natural-language tasks rather than just completing lines. It is a Python tool, installed with uv, and it drives the Kimi K2 model family behind the scenes."}, {"kind": "p", "text": "For design work, two properties stand out. The Kimi K2 models are explicitly tuned for agentic, long-horizon coding and tool use, so the agent can carry a multi-step build through to a working result. And the context window reaches up to 256k tokens on recent K2 releases, large enough to hold your whole design system, component library, and reference set at once instead of summarizing them away."}, {"kind": "steps", "items": [{"label": "Context files", "body": "Kimi CLI reads an AGENTS.md file for persistent project context — the natural place to encode your design conventions, tokens, and review checklists. Run /init to scaffold one for a project that does not have it."}, {"label": "MCP, ACP + subagents", "body": "It manages MCP servers conversationally with /mcp-config, exposes a session over the Agent Client Protocol (kimi acp) to Zed and JetBrains, and can dispatch built-in coder, explore, and plan subagents in isolated contexts."}, {"label": "Login or BYOK", "body": "On first launch, /login lets you authorize via OAuth (Kimi Code) or enter your own Moonshot API key; Kimi’s platform also exposes OpenAI- and Anthropic-compatible endpoints."}]}, {"kind": "ul", "items": ["Vendor: Moonshot AI", "Credential: Moonshot API key (BYOK), or OAuth login via Kimi Code", "License: Apache-2.0, open source"]}]}, {"id": "why-design", "heading": "Why agentic K2 models and a large context fit design", "blocks": [{"kind": "p", "text": "Kimi CLI’s design edge comes from two model properties — but, as with every agent, taste still has to be supplied."}, {"kind": "steps", "items": [{"label": "Agentic, long-horizon coding", "body": "The Kimi K2 models are optimized for tool use and multi-step work, so the agent can take a reference and a brief and actually build, run, and refine the UI rather than stopping at a first draft."}, {"label": "A large context window", "body": "Up to 256k tokens on recent K2 releases means the whole design system, tokens, and many reference states fit at once, so the agent reuses your real primitives rather than inventing one-off styles."}, {"label": "Conventions in AGENTS.md", "body": "An AGENTS.md (plus an MCP server like Figma) points the agent at your tokens, components, and real specs, so it works against a brand instead of a default look."}]}, {"kind": "image", "src": "/agents/kimi-design/kimi-design-taste-triangle.webp", "alt": "Diagram showing design system, skill, and reference image converging into good design output", "caption": "Taste comes from three inputs you provide: a design system, a skill, and real reference images."}, {"kind": "p", "text": "The lesson is the same one every agent teaches: Kimi CLI does not have taste by default. It produces good design when you give it constraints — a design system, an aesthetic skill, and concrete references. Open Design packages exactly those inputs, which is why the two fit together (more below)."}]}, {"id": "setup", "heading": "Set up Kimi CLI for design work, from zero", "blocks": [{"kind": "p", "text": "Here is the full path from a clean machine to a Kimi CLI that can build and verify UI."}, {"kind": "code", "lang": "bash", "code": "# 1. Install Kimi CLI (uses uv; Python 3.12–3.14, 3.13 recommended)\ncurl -LsSf https://code.kimi.com/install.sh | bash\n# or, if you already have uv:\nuv tool install --python 3.13 kimi-cli\n\n# 2. Start it in your project and authenticate on first run\ncd your-project\nkimi              # then run /login: OAuth via Kimi Code, or paste a Moonshot API key\n\n# 3. Generate project context\n/init             # scaffolds an AGENTS.md for this project\n\n# 4. Wire an MCP server (optional, e.g. Figma for design handoff)\n/mcp-config       # add, edit, and authenticate MCP servers conversationally"}, {"kind": "image", "src": "/agents/kimi-design/kimi-design-setup-flow.webp", "alt": "Five-step setup flow: install, authenticate, configure AGENTS.md, add a skill, verify", "caption": "The setup sequence: install → authenticate → configure AGENTS.md → add a skill → enable browser verification."}, {"kind": "steps", "items": [{"label": "Encode your design rules", "body": "Put your tokens, primitives, and conventions in AGENTS.md and point Kimi at them, so output matches a brand instead of defaulting to a generic look."}, {"label": "Add browser verification", "body": "Wire a Playwright or browser MCP so Kimi renders in a real browser and checks its output across breakpoints instead of only confirming the build passes."}]}]}, {"id": "screenshot-workflow", "heading": "The reference-to-UI workflow", "blocks": [{"kind": "p", "text": "The highest-leverage design loop with Kimi CLI is turning reference material into working, responsive UI and iterating until it matches — feeding the agent your references and having it compare its rendered output back to them in a real browser."}, {"kind": "ol", "items": ["Start from the clearest references you have — and include multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.", "Be specific in the prompt; vague prompts produce generic UI even with a strong agent.", "Keep your design system and conventions in AGENTS.md, and tell Kimi where the tokens and canonical primitives live.", "Run a dev server and have Kimi render in a real browser, resizing to breakpoints to check the result.", "Iterate by having Kimi compare its implementation back to the references — not merely confirm it builds."]}, {"kind": "p", "text": "Point Kimi at your references and the dev server, then give concrete constraints:"}, {"kind": "code", "lang": "bash", "code": "kimi\n# in the prompt:\n> Implement the design in ./references (reference-desktop.png,\n  reference-mobile.png) using React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from AGENTS.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Run the dev server, render it in the browser, and iterate until it\n  matches the references across breakpoints."}, {"kind": "p", "text": "Keep prompts small and focused, commit good iterations and revert bad ones (telling Kimi when you revert), so each pass builds on a clean base. Kimi CLI can also take a short screen recording or demo clip when a flow is hard to describe in words."}]}, {"id": "extend", "heading": "AGENTS.md, MCP, and subagents", "blocks": [{"kind": "p", "text": "Three extension points make Kimi CLI practical for sustained design work, and all three map cleanly onto an open design workflow."}, {"kind": "steps", "items": [{"label": "AGENTS.md context", "body": "Project rules live in an AGENTS.md at the repo root. It is the durable home for your design conventions, read on every run — and it is the same portable format other agents use."}, {"label": "MCP servers", "body": "Add MCP servers conversationally with /mcp-config — the portable way to bring in design context and external tools, most relevantly the Figma MCP server, that work across agents, not just Kimi."}, {"label": "Subagents and the plugin marketplace", "body": "Dispatch built-in coder, explore, and plan subagents in isolated contexts, and install skills, MCP servers, and data sources from the marketplace or any GitHub repo to gather references and run the verification loop."}]}, {"kind": "p", "text": "These are portable, multi-agent capabilities — exactly the kind of thing Open Design is built to orchestrate, rather than re-create per project."}]}, {"id": "vs", "heading": "Kimi CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI for design", "blocks": [{"kind": "p", "text": "There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:"}, {"kind": "table", "columns": ["Agent", "Design strength", "Best for"], "rows": [["Kimi CLI", "Agentic Kimi K2 models tuned for long-horizon coding and tool use, with a large context; open-source and BYOK", "Multi-step builds and holding a whole design system in context affordably"], ["Codex", "Strong visual polish with a frontend skill; sandboxed async builds", "Delegated async builds and portable AGENTS.md rules"], ["Claude Code", "Specific design decisions (hex, spacing, type) and codebase-aware UX", "Frontend reasoning and large-context refactors"], ["Cursor", "Visual build-and-see loop with live preview and inline edits", "Tight iterate-and-watch UI work inside an IDE"], ["Gemini CLI", "Strong multimodal image understanding and a 1M-token context; free tier", "Screenshot-heavy work and very large context"]]}, {"kind": "p", "text": "The recurring community verdict is that taste comes from humans: all of them default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped."}]}, {"id": "pitfalls", "heading": "Pitfalls, and how to avoid the “AI slop” look", "blocks": [{"kind": "p", "text": "The most common complaint about AI-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include broken mobile layouts and instructions leaking into UI copy. None of these are unique to Kimi CLI; they are what happens when any agent runs without a curated design context."}, {"kind": "steps", "items": [{"label": "Add an aesthetic skill", "body": "A curated design skill forces the agent to commit to a real direction instead of the default look."}, {"label": "Verify in a real browser", "body": "Have Kimi render and self-check across breakpoints so layouts do not silently break on mobile."}, {"label": "Supply tokens and references", "body": "Real design tokens and reference screenshots are the single biggest lever on output quality."}, {"label": "Encode rules in AGENTS.md", "body": "Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run."}]}, {"kind": "p", "text": "Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes."}]}, {"id": "open-design", "heading": "Designing with Kimi CLI inside Open Design", "blocks": [{"kind": "p", "text": "Open Design is the open-source design layer the workflow above keeps asking for. It treats Kimi CLI as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes Kimi good is there from the first run, not assembled by hand each time. Both are open-source and local-first, which makes the pairing a natural fit."}, {"kind": "ol", "items": ["Install Open Design and select Kimi CLI as your agent.", "Authenticate with your Moonshot API key (BYOK) — credentials stay on your machine and are never proxied through us.", "Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.", "Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud."]}, {"kind": "p", "text": "Same Kimi CLI agent, same key — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine."}]}], "faqTitle": "Frequently asked questions", "faq": [{"name": "Can Kimi CLI really do design work?", "text": "Yes — with an aesthetic skill, a design system, and real reference images in context, Kimi CLI produces production-quality, responsive UI, and its agentic Kimi K2 models can render and verify output against references. Without that context it tends to default to a generic look, which is the gap Open Design fills."}, {"name": "Do I need to pay to design with Kimi CLI?", "text": "You bring your own credentials: authorize via the Kimi Code OAuth login or paste a Moonshot API key (BYOK), billed by Moonshot’s platform. Open Design never proxies your credentials either way."}, {"name": "What makes Kimi CLI good for design specifically?", "text": "Two things: the Kimi K2 models are tuned for agentic, long-horizon coding and tool use, so the agent can build and refine through to a working result, and the context window reaches up to 256k tokens, enough to hold a whole design system and reference set at once. Both help — but taste still comes from the design system, skill, and references you supply."}, {"name": "Kimi CLI or Claude Code for frontend design?", "text": "Both are strong. Claude Code is known for specific, codebase-aware design decisions; Kimi CLI’s edge is its agentic Kimi K2 models and a large context with BYOK economics. Many teams use both — Open Design lets you switch agents without changing your design workflow."}, {"name": "How do I connect Kimi CLI to Figma?", "text": "Run /mcp-config inside Kimi CLI to add and authenticate the Figma MCP server. Kimi can then pull real design context — components, variables, layout data — so the generated code matches the source instead of approximating it."}, {"name": "Is Open Design affiliated with Moonshot AI?", "text": "No. Kimi CLI is a product of Moonshot AI; Open Design is an independent open-source project that supports it as a first-party adapter. Kimi is a trademark of Moonshot AI."}, {"name": "Are my files and credentials safe?", "text": "Yes — Open Design is local-first and Apache-2.0. Your files, artifacts, and DESIGN.md stay in your own repo, and your Moonshot credentials are used directly by your agent, never routed through Open Design servers."}], "ctaTitle": "Design with Kimi CLI, the open way.", "ctaBody": "Bring your own Moonshot API key, keep every file local, and get a curated design library around the agent you already use.", "ctaActions": [{"label": "Use Kimi CLI inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "See all supported agents"},
        aboutTitle: "What is Kimi CLI",
        aboutBody: ["Kimi CLI is Moonshot AI’s open-source (Apache-2.0) terminal AI agent, powered by the Kimi K2 model series. It reads your codebase, edits files, runs commands, searches files, and fetches the web.", "The Kimi K2 models are tuned for agentic, long-horizon coding, and the context window reaches up to 256k tokens, so it holds a whole design system at once.", "Open Design treats Kimi CLI as a first-party adapter, so the agent slots into a structured, open-source design pipeline."],
        vendorLabel: "Vendor",
        vendor: "Moonshot",
        credentialLabel: "Credential",
        credential: "Moonshot API key (BYOK)",
        designTitle: "Designing with Kimi CLI",
        designLead: "Kimi CLI’s design strengths cluster around its model and context:",
        designPoints: [{"label": "Agentic reference → UI", "body": "Long-horizon Kimi K2 coding turns references into responsive markup and checks the result against them in a real browser."}, {"label": "256k-token context", "body": "A whole design system, component library, and reference set fit at once, so output reuses your real primitives."}, {"label": "AGENTS.md + MCP", "body": "Context files carry your conventions; the Figma MCP server brings real design context into code."}, {"label": "Open and BYOK", "body": "Apache-2.0 with an OAuth login or your own Moonshot API key, plus OpenAI- and Anthropic-compatible endpoints."}],
        linksTitle: "Real-world resources",
        linksLead: "Official repo and docs for Kimi CLI:",
        links: [{"label": "MoonshotAI/kimi-cli (GitHub)", "href": "https://github.com/MoonshotAI/kimi-cli", "source": "GitHub · Moonshot AI"}, {"label": "Kimi CLI documentation — Getting started", "href": "https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html", "source": "Docs · Moonshot AI"}, {"label": "Kimi K2 (GitHub)", "href": "https://github.com/MoonshotAI/Kimi-K2", "source": "GitHub · Moonshot AI"}],
        withOdTitle: "Kimi CLI + Open Design",
        withOdLead: "Open Design is the open-source design layer around Kimi CLI: a curated skill and design-system library, a structured render pipeline, and a local desktop UI.",
        withOdSteps: ["Install Open Design and select Kimi CLI as your agent.", "Authenticate with your Moonshot API key (BYOK) — credentials stay on your machine.", "Choose a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.", "Artifacts and DESIGN.md files live in your own repo, not a hosted cloud."],
        withOdClosing: "The same Kimi CLI agent — with a real, portable design workflow around it.",
        faqTitle: "FAQ",
        faq: [{"name": "Is Open Design made by Moonshot AI?", "text": "No. Kimi CLI is a Moonshot AI product; Open Design is an independent open-source project that integrates it as a first-party adapter."}, {"name": "Do I need to pay?", "text": "You bring your own credentials — an OAuth login or a Moonshot API key (BYOK), billed by Moonshot. Open Design never proxies your credentials."}, {"name": "Is Open Design affiliated with Moonshot AI?", "text": "No. Open Design is independent; Kimi is a trademark of Moonshot AI."}],
        ctaTitle: "Design with Kimi CLI, the open way.",
        ctaBody: "Star the repo, download the desktop app, or join the community to request an adapter.",
      },
      deepseek: {
        title: "DeepSeek TUI for design — Open Design",
        description: "How people use a DeepSeek-powered terminal coding agent for UI and web design — its strong coding models, 1M-token context, cost-efficiency, context files and MCP — and how Open Design turns the DeepSeek TUI into a local-first, open-source design agent.",
        breadcrumb: "DeepSeek TUI",
        label: "Agent · DeepSeek TUI",
        heading: "DeepSeek TUI for design.",
        lead: "DeepSeek TUI is a terminal coding agent driven by DeepSeek’s models. Its strong, cost-efficient coding models and 1M-token context can hold a whole design system and codebase at once, which makes it a real design tool — once you give it references, conventions, and a verification loop. Open Design wires it into an open-source design workflow: your DeepSeek API key, your files, local-first.",
        tldrTitle: "TL;DR",
        tldrBody: "DeepSeek TUI turns described layouts and reference conventions into responsive UI with strong coding models, a huge context window, and very low per-token cost — bring your own DeepSeek API key. Open Design gives it a curated design-system and skill library plus a desktop workflow — BYOK and keep everything local.",
        toc: ["What is DeepSeek TUI", "Designing with DeepSeek TUI", "Resources", "With Open Design", "FAQ"],
        rich: {"heroCtaLead": "Open Design turns the DeepSeek TUI into a local-first, open-source design agent — your DeepSeek API key, your files, a curated skill and design-system library around it.", "heroCtaActions": [{"label": "Use DeepSeek TUI inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["DeepSeek TUI is a terminal-based AI coding agent powered by DeepSeek’s models. Two things make it interesting for design specifically: its coding models are strong and unusually cost-efficient, so you can iterate aggressively without watching a meter; and its context window reaches up to 1M tokens, large enough to hold an entire design system and codebase at once instead of summarizing them away. Paired with the right references, conventions, and a verification loop, it builds real, responsive UI. This is a practical, end-to-end guide to using a DeepSeek-powered terminal agent for UI, frontend, and design-system work, and to wiring it into a structured design workflow with Open Design.", "It covers what the DeepSeek TUI actually is, why strong coding models, a huge context, and low cost fit design, how to set it up from zero, the reference-to-UI loop, how context files and MCP extend it, how it compares to Codex, Claude Code, Cursor, and Gemini CLI, the pitfalls that make AI output look generic, and how Open Design closes the gap as an open, local-first design layer — a natural pairing, since both are open and run on your own machine."], "heroImage": {"src": "/agents/deepseek-design/deepseek-design-hero.webp", "alt": "DeepSeek TUI design feedback loop: a terminal agent reading references and conventions, a browser rendering the UI, and a workspace, with a feedback arrow looping back", "caption": "The core loop: DeepSeek TUI reads your references and conventions in the terminal, builds and verifies the UI in a real browser, and iterates against them — with a whole design system in context."}, "tocLabel": "On this page", "toc": [{"id": "what-is-deepseek", "label": "What DeepSeek TUI actually is"}, {"id": "why-design", "label": "Why strong coding models + huge context fit design"}, {"id": "setup", "label": "Set up DeepSeek TUI for design (from zero)"}, {"id": "screenshot-workflow", "label": "The reference-to-UI workflow"}, {"id": "extend", "label": "Context files, MCP, and tools"}, {"id": "vs", "label": "DeepSeek TUI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "Pitfalls and the “AI slop” look"}, {"id": "open-design", "label": "Designing with DeepSeek TUI in Open Design"}, {"id": "faq", "label": "FAQ"}], "sections": [{"id": "what-is-deepseek", "heading": "What DeepSeek TUI actually is", "blocks": [{"kind": "p", "text": "A DeepSeek TUI is a keyboard-driven terminal AI agent that runs DeepSeek’s models. It reads your repository, edits files, runs shell commands, manages git, and can search the web — planning and verifying work from natural-language tasks rather than just completing lines. DeepSeek itself is the model provider: an OpenAI-compatible API (it also exposes an Anthropic-format endpoint), so a wide range of community terminal agents can be pointed at DeepSeek by setting a base URL and key. Several open-source TUIs ship DeepSeek as a first-class provider."}, {"kind": "p", "text": "For design work, three properties stand out. DeepSeek’s coding models are strong, so the agent reasons about layout, structure, and component hierarchy from a clear description. Its context window reaches up to 1M tokens, large enough to hold your whole design system and component library at once. And its pricing is very low per token, with prefix context-caching on top — so iterating on a design costs little."}, {"kind": "steps", "items": [{"label": "Context files", "body": "Terminal agents read a project context file (an AGENTS.md-style file, or the agent’s own convention) for persistent rules — the natural place to encode your design conventions, tokens, and review checklists."}, {"label": "Tools + MCP", "body": "Most DeepSeek TUIs ship file, shell, git, and web tools, and support MCP servers to add external context like a live Figma file — DeepSeek’s API supports tool calling, which these agents rely on."}, {"label": "Bring your own key", "body": "You authenticate with a DeepSeek API key from the DeepSeek platform. Because the API is OpenAI-compatible, pointing an agent at DeepSeek is usually two lines: base URL and key."}]}, {"kind": "ul", "items": ["Vendor: DeepSeek (model and API provider)", "Credential: DeepSeek API key (BYOK) from the DeepSeek platform", "Models: deepseek-v4-flash and deepseek-v4-pro (text-only; no native image input)"]}]}, {"id": "why-design", "heading": "Why strong coding models and a huge context fit design", "blocks": [{"kind": "p", "text": "DeepSeek TUI’s design edge comes from the model and its economics — but, as with every agent, taste still has to be supplied."}, {"kind": "steps", "items": [{"label": "Strong, cost-efficient coding", "body": "DeepSeek’s coding models are capable and inexpensive, so the agent reasons well about layout and structure and you can iterate many times without cost being the constraint."}, {"label": "A 1M-token context window", "body": "A large context means the whole design system, tokens, and many reference states fit at once, so the agent reuses your real primitives rather than inventing one-off styles — and context caching keeps repeated prompts cheap."}, {"label": "Conventions in a context file", "body": "A project context file (plus the Figma MCP server) points the agent at your tokens, components, and real specs, so it works against a brand instead of a default look."}]}, {"kind": "image", "src": "/agents/deepseek-design/deepseek-design-taste-triangle.webp", "alt": "Diagram showing design system, skill, and reference converging into good design output", "caption": "Taste comes from three inputs you provide: a design system, a skill, and real references."}, {"kind": "p", "text": "The lesson is the same one every agent teaches: DeepSeek TUI does not have taste by default. It produces good design when you give it constraints — a design system, an aesthetic skill, and concrete references. Open Design packages exactly those inputs, which is why the two fit together (more below)."}]}, {"id": "setup", "heading": "Set up DeepSeek TUI for design work, from zero", "blocks": [{"kind": "p", "text": "Here is the full path from a clean machine to a DeepSeek TUI that can build and verify UI. Exact install and command names vary by which terminal agent you pick, so the steps below stay at the level that holds across them."}, {"kind": "code", "lang": "bash", "code": "# 1. Get a DeepSeek API key from the DeepSeek platform\n#    https://platform.deepseek.com\nexport DEEPSEEK_API_KEY=sk-...\n\n# 2. Install a DeepSeek-capable terminal agent (follow its README),\n#    then point it at DeepSeek. The API is OpenAI-compatible:\n#      base URL: https://api.deepseek.com\n#      model:    deepseek-v4-flash (or deepseek-v4-pro)\n#    (an Anthropic-format endpoint also exists at /anthropic)\n\n# 3. Start it in your project and generate project context\ncd your-project\n#   create/scaffold a project context file with your design rules\n\n# 4. Wire the Figma MCP server (optional, for design handoff)\n#    add it to the agent's MCP server configuration"}, {"kind": "image", "src": "/agents/deepseek-design/deepseek-design-setup-flow.webp", "alt": "Five-step setup flow: get key, install agent, configure context file, add a skill, verify", "caption": "The setup sequence: get a key → point the agent at DeepSeek → configure a context file → add a skill → enable browser verification."}, {"kind": "steps", "items": [{"label": "Encode your design rules", "body": "Put your tokens, primitives, and conventions in the agent’s context file and point it at them, so output matches a brand instead of defaulting to a generic look."}, {"label": "Add browser verification", "body": "Wire a Playwright or browser MCP so the agent renders in a real browser and checks its output across breakpoints instead of only confirming the build passes."}]}]}, {"id": "screenshot-workflow", "heading": "The reference-to-UI workflow", "blocks": [{"kind": "p", "text": "DeepSeek’s models are text-only — they do not read images natively — so the highest-leverage design loop is turning clear references and described layouts into working, responsive UI, then verifying the result in a real browser rather than asking the model to look at a screenshot."}, {"kind": "ol", "items": ["Start from the clearest references you have — and describe multiple states (desktop and mobile, hover, empty, loading), not just one hero shot.", "Be specific in the prompt; vague prompts produce generic UI even with a strong model. Spell out spacing, hierarchy, and the components to reuse.", "Keep your design system and conventions in the context file, and tell the agent where the tokens and canonical primitives live.", "Run a dev server and have the agent render in a real browser, resizing to breakpoints to check the result — this is where verification happens, since the model cannot see the image itself.", "Iterate by having the agent compare the rendered DOM and computed styles back to your described spec — not merely confirm it builds."]}, {"kind": "p", "text": "Describe the target precisely and give concrete constraints:"}, {"kind": "code", "lang": "bash", "code": "# in the agent's prompt:\n> Implement this design in React + Vite + Tailwind + TypeScript.\n  Layout: two-column dashboard, 240px sidebar, 24px gutters,\n  card grid at 3/2/1 columns for desktop/tablet/mobile.\n  Reuse my existing design-system components and tokens from the\n  context file. Match spacing, layout, and hierarchy; make it responsive.\n  Run the dev server, render it in the browser, and iterate against the\n  spec across breakpoints until it matches."}, {"kind": "p", "text": "Keep prompts small and focused, commit good iterations and revert bad ones (telling the agent when you revert), so each pass builds on a clean base."}]}, {"id": "extend", "heading": "Context files, MCP, and tools", "blocks": [{"kind": "p", "text": "Three extension points make a DeepSeek TUI practical for sustained design work, and all three map cleanly onto an open design workflow."}, {"kind": "steps", "items": [{"label": "Project context file", "body": "Project rules live in a context file at the repo root (with global and team layers). It is the durable home for your design conventions, read on every run."}, {"label": "MCP servers", "body": "Configure MCP servers in the agent — the portable way to bring in design context and external tools, most relevantly the Figma MCP server, that work across agents, not just one. DeepSeek’s API supports the tool calling these servers rely on."}, {"label": "Built-in tools", "body": "DeepSeek TUIs ship file, shell, git, and web tools so the agent can gather references and run the verification loop without leaving the terminal."}]}, {"kind": "p", "text": "These are portable, multi-agent capabilities — exactly the kind of thing Open Design is built to orchestrate, rather than re-create per project."}]}, {"id": "vs", "heading": "DeepSeek TUI vs Codex vs Claude Code vs Cursor vs Gemini CLI for design", "blocks": [{"kind": "p", "text": "There is no single winner for design work — each agent has a different strength, and experienced teams stack them. A fair summary:"}, {"kind": "table", "columns": ["Agent", "Design strength", "Best for"], "rows": [["DeepSeek TUI", "Strong, very cost-efficient coding models with open weights and a 1M-token context; text-only (no native vision)", "High-volume iteration on a budget and holding a whole design system in context"], ["Codex", "Strong visual polish with a frontend skill; sandboxed async builds", "Delegated async builds and portable AGENTS.md rules"], ["Claude Code", "Specific design decisions (hex, spacing, type) and codebase-aware UX", "Frontend reasoning and large-context refactors"], ["Cursor", "Visual build-and-see loop with live preview and inline edits", "Tight iterate-and-watch UI work inside an IDE"], ["Gemini CLI", "Native multimodal image understanding and a 1M-token context; open-source with a free tier", "Screenshot-heavy work where the agent reads references directly"]]}, {"kind": "p", "text": "The recurring community verdict is that taste comes from humans: all of them default to a generic aesthetic without skills, references, and constraints. That is the real problem to solve — and it is design-tool-shaped, not model-shaped."}]}, {"id": "pitfalls", "heading": "Pitfalls, and how to avoid the “AI slop” look", "blocks": [{"kind": "p", "text": "The most common complaint about AI-generated design is that it looks generic — soft gradients, floating panels, oversized rounded corners, dramatic shadows, an Inter-and-purple vibe that “screams an AI made this.” Other reported issues include broken mobile layouts and instructions leaking into UI copy. None of these are unique to DeepSeek TUI; they are what happens when any agent runs without a curated design context. Because DeepSeek is text-only, it is especially important to verify in a real browser rather than trusting the model to “look” at the result."}, {"kind": "steps", "items": [{"label": "Add an aesthetic skill", "body": "A curated design skill forces the agent to commit to a real direction instead of the default look."}, {"label": "Verify in a real browser", "body": "Render and self-check across breakpoints with a browser tool — essential here, since the model cannot read a screenshot itself — so layouts do not silently break on mobile."}, {"label": "Supply tokens and references", "body": "Real design tokens and concrete, described references are the single biggest lever on output quality."}, {"label": "Encode rules in the context file", "body": "Put “no hero cards, max two typefaces, brand-first hierarchy” style rules where the agent reads them every run."}]}, {"kind": "p", "text": "Notice that every mitigation is about giving the agent a curated design context. Maintaining that context by hand, per project, is the toil Open Design removes."}]}, {"id": "open-design", "heading": "Designing with DeepSeek TUI inside Open Design", "blocks": [{"kind": "p", "text": "Open Design is the open-source design layer the workflow above keeps asking for. It treats the DeepSeek agent as a first-party adapter and wraps it in a curated skill and design-system library, a structured render pipeline, and a local desktop UI — so the design context that makes DeepSeek good is there from the first run, not assembled by hand each time. Both are open and local-first, which makes the pairing a natural fit."}, {"kind": "ol", "items": ["Install Open Design and select the DeepSeek TUI as your agent.", "Authenticate with your own DeepSeek API key (BYOK) — credentials stay on your machine and are never proxied through us.", "Pick a design system and a skill, then generate decks, prototypes, and landing pages with consistent taste.", "Every artifact and DESIGN.md file lives in your own repo, not a hosted cloud."]}, {"kind": "p", "text": "Same DeepSeek agent, same key — plus a real, portable, open-source design workflow around it. It is local-first and Apache-2.0, so nothing about your work or your credentials leaves your machine."}]}], "faqTitle": "Frequently asked questions", "faq": [{"name": "Can DeepSeek TUI really do design work?", "text": "Yes — with an aesthetic skill, a design system, and concrete references in context, a DeepSeek-powered terminal agent produces production-quality, responsive UI, and you verify the output in a real browser. DeepSeek’s models are text-only, so the verification loop replaces native image reading. Without that context it tends to default to a generic look, which is the gap Open Design fills."}, {"name": "How much does it cost to design with DeepSeek TUI?", "text": "Little — DeepSeek’s API is among the cheapest per token, and prefix context-caching cuts the cost of repeated prompts further, so you can iterate aggressively. You bring your own DeepSeek API key (BYOK); Open Design never proxies your credentials."}, {"name": "What makes DeepSeek good for design specifically?", "text": "Strong, cost-efficient coding models, open weights, and a 1M-token context that holds an entire design system and reference set at once. DeepSeek is text-only — it does not read images natively — so taste still comes from the design system, skill, and described references you supply, verified in a browser."}, {"name": "DeepSeek TUI or Claude Code for frontend design?", "text": "Both are strong. Claude Code is known for specific, codebase-aware design decisions; DeepSeek TUI’s edge is open weights, very low cost, and a huge context for high-volume iteration. Many teams use both — Open Design lets you switch agents without changing your design workflow."}, {"name": "How do I connect DeepSeek TUI to Figma?", "text": "Add the Figma MCP server in your terminal agent’s MCP configuration. The agent can then pull real design context — components, variables, layout data — so the generated code matches the source instead of approximating it. DeepSeek’s API supports the tool calling MCP relies on."}, {"name": "Is Open Design affiliated with DeepSeek?", "text": "No. DeepSeek is the model and API provider; Open Design is an independent open-source project that supports DeepSeek-powered terminal agents as a first-party adapter. DeepSeek is a trademark of DeepSeek."}, {"name": "Are my files and credentials safe?", "text": "Yes — Open Design is local-first and Apache-2.0. Your files, artifacts, and DESIGN.md stay in your own repo, and your DeepSeek API key is used directly by your agent, never routed through Open Design servers."}], "ctaTitle": "Design with DeepSeek TUI, the open way.", "ctaBody": "Bring your own DeepSeek API key, keep every file local, and get a curated design library around the agent you already use.", "ctaActions": [{"label": "Use DeepSeek TUI inside Open Design", "href": "/quickstart/", "variant": "primary"}, {"label": "Star on GitHub", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "Download the desktop app", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "See all supported agents"},
        aboutTitle: "What is DeepSeek TUI",
        aboutBody: ["DeepSeek TUI is a terminal AI coding agent driven by DeepSeek’s models. It reads your codebase, edits files, runs commands, manages git, and searches the web. DeepSeek is the model provider, exposing an OpenAI-compatible API (and an Anthropic-format endpoint).", "Its coding models are strong and very cost-efficient, and its context window reaches 1M tokens, so it holds a whole design system at once. The models are text-only, so design references are described and verified in a browser rather than read as images.", "Open Design treats the DeepSeek agent as a first-party adapter, so it slots into a structured, open-source design pipeline."],
        vendorLabel: "Vendor",
        vendor: "DeepSeek",
        credentialLabel: "Credential",
        credential: "DeepSeek API key (BYOK)",
        designTitle: "Designing with DeepSeek TUI",
        designLead: "DeepSeek TUI’s design strengths cluster around its model and economics:",
        designPoints: [{"label": "Strong, cheap coding", "body": "Capable coding models at very low per-token cost turn described layouts into responsive markup and let you iterate freely."}, {"label": "1M-token context", "body": "A whole design system, component library, and reference set fit at once, so output reuses your real primitives — with context caching on repeats."}, {"label": "Context file + MCP", "body": "Context files carry your conventions; the Figma MCP server brings real design context into code via DeepSeek’s tool calling."}, {"label": "Open weights, BYOK", "body": "DeepSeek ships open weights, and you bring your own DeepSeek API key — text-only, so verify visuals in a real browser."}],
        linksTitle: "Real-world resources",
        linksLead: "Official docs for the DeepSeek API and platform:",
        links: [{"label": "DeepSeek API documentation", "href": "https://api-docs.deepseek.com/", "source": "Docs · DeepSeek"}, {"label": "Models & pricing", "href": "https://api-docs.deepseek.com/quick_start/pricing", "source": "Docs · DeepSeek"}, {"label": "Anthropic API compatibility", "href": "https://api-docs.deepseek.com/guides/anthropic_api", "source": "Docs · DeepSeek"}],
        withOdTitle: "DeepSeek TUI + Open Design",
        withOdLead: "Open Design is the open-source design layer around the DeepSeek TUI: a curated skill and design-system library, a structured render pipeline, and a local desktop UI.",
        withOdSteps: ["Install Open Design and select the DeepSeek TUI as your agent.", "Authenticate with your own DeepSeek API key (BYOK) — credentials stay on your machine.", "Choose a design system and skill, then generate decks, prototypes, and landing pages with consistent taste.", "Artifacts and DESIGN.md files live in your own repo, not a hosted cloud."],
        withOdClosing: "The same DeepSeek agent — with a real, portable design workflow around it.",
        faqTitle: "FAQ",
        faq: [{"name": "Is Open Design made by DeepSeek?", "text": "No. DeepSeek is the model and API provider; Open Design is an independent open-source project that integrates DeepSeek-powered terminal agents as a first-party adapter."}, {"name": "Do I need to pay?", "text": "You bring your own DeepSeek API key (BYOK). DeepSeek’s API is very low-cost per token, and Open Design never proxies your credentials."}, {"name": "Is Open Design affiliated with DeepSeek?", "text": "No. Open Design is independent; DeepSeek is a trademark of DeepSeek."}],
        ctaTitle: "Design with DeepSeek TUI, the open way.",
        ctaBody: "Star the repo, download the desktop app, or join the community to request an adapter.",
      },
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
  agentGuides: {
    'claude-code': {
      ...INFO_PAGE_COPY.en!.agentGuides!['claude-code']!,
      title: 'Claude Code 做设计 — Open Design',
      description:
        '设计师如何用 Claude Code 做 UI 和网页设计，以及 Open Design 如何把它变成真正的设计 Agent —— 本地优先、自带密钥（BYOK），配套精选 skill 与设计系统库。',
      breadcrumb: 'Claude Code',
      label: 'Agent · Claude Code',
      heading: '用 Claude Code 做设计。',
      lead: 'Claude Code 是 Anthropic 的终端编码 Agent。已经有很多人用它做 UI、设计系统和落地页。Open Design 把它接进真正的设计工作流 —— 用你自己的 Anthropic 密钥或 Claude 订阅，所有文件留在本地。',
      tldrTitle: '一句话',
      tldrBody:
        '只要给 Claude Code「审美」—— 一套设计系统、一个风格 skill、一个截图迭代循环 —— 它就是个强力的设计生成器。Open Design 把这些做成本地优先的开源层。用你自己的密钥指向它，开始设计。',
      toc: ['什么是 Claude Code', '用 Claude Code 做设计', '资源', '配合 Open Design', '常见问题'],
      rich: {
        heroCtaLead:
          'Open Design 把 Claude Code 变成一个本地优先、开源的设计 agent —— 用你自己的 Anthropic key 或 Claude 订阅、你自己的文件，外面再包一层精选的 skill 与设计系统库。',
        heroCtaActions: [
          { label: '在 Open Design 里使用 Claude Code', href: '/quickstart/', variant: 'primary' },
          { label: '在 GitHub 上 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面应用', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        intro: [
          'Claude Code 被普遍认为是前端品味最好的 coding agent —— 它对界面的推理格外具体，会给出确切的 hex 色值、间距与字号阶梯，并能在大型代码库里跨文件重构 UI 而不丢失主线。但开箱即用时，如果你不给它设计系统、skill 和真实参考，它仍会滑向一种泛泛的样子。这是一份关于如何把 Claude Code 用于 UI、前端与设计系统工作，并将它接入 Open Design 结构化工作流的端到端实战指南。',
          '本文涵盖 Claude Code 到底是什么、它为何擅长前端、如何从零搭建、CLAUDE.md 与 Skills 工作流、官方的 Figma 往返、它与 Codex 和 Cursor 的对比、让 AI 产出显得套路化的那些坑，以及 Open Design 如何作为开源、本地优先的设计层来补上这道缺口。',
        ],
        heroImage: {
          src: '/agents/claude-code-design/claude-code-design-hero.webp',
          alt: 'Claude Code 设计反馈闭环：终端里做出具体设计决策的 agent、渲染 UI 的浏览器，以及一个工作区，由一条反馈箭头回环',
          caption: '核心闭环：Claude Code 在终端里推理出具体的 UI 决策，在真实浏览器里渲染并验证，再对照参考不断收敛。',
        },
        tocLabel: '本页内容',
        toc: [
          { id: 'what-is-claude-code', label: 'Claude Code 究竟是什么' },
          { id: 'why-design', label: 'Claude Code 为何擅长设计' },
          { id: 'setup', label: '从零搭建用于设计的 Claude Code' },
          { id: 'skills-workflow', label: 'CLAUDE.md 与 Skills 工作流' },
          { id: 'figma', label: 'Claude Code + Figma 往返' },
          { id: 'vs', label: 'Claude Code vs Codex vs Cursor' },
          { id: 'pitfalls', label: '常见坑与“AI 套路感”' },
          { id: 'open-design', label: '在 Open Design 里用 Claude Code 做设计' },
          { id: 'faq', label: '常见问题' },
        ],
        sections: [
          {
            id: 'what-is-claude-code',
            heading: 'Claude Code 究竟是什么',
            blocks: [
              { kind: 'p', text: 'Claude Code 是 Anthropic 的 agentic 编码工具。它读取你的代码库、编辑文件、运行命令、与你的开发工具集成 —— 从自然语言任务出发去规划、编写并验证，而不只是补全几行代码。' },
              { kind: 'p', text: '它有多个共享同一引擎的形态：终端 CLI、面向 VS Code / Cursor / JetBrains 的 IDE 扩展、带可视化 diff 审阅的桌面应用，以及用于长时任务的网页端。你的 CLAUDE.md 文件、设置与 MCP server 在所有形态间通用。' },
              { kind: 'steps', items: [
                { label: '指令文件', body: 'Claude Code 在每次会话开始时读取项目根目录下的 CLAUDE.md —— 这正是写入你的设计规范、token 与审阅清单的天然位置。' },
                { label: 'Skills', body: 'Agent Skills 把可复用的指令、脚本与资源打包，由 Claude 按需加载，其中就包括 Anthropic 官方的 Frontend Design skill 来注入品味。' },
                { label: 'Plan 与 subagent', body: '它能先规划再动手，并可派生 subagent 并行处理任务的不同部分，从而让大型 UI 重构保持连贯。' },
              ] },
              { kind: 'ul', items: [
                '厂商：Anthropic',
                '凭证：Anthropic API key（BYOK，经 Console）或 Claude 订阅（Pro / Max）',
                '形态：终端 CLI、VS Code / Cursor / JetBrains 扩展、桌面应用、网页端',
              ] },
            ],
          },
          {
            id: 'why-design',
            heading: 'Claude Code 为何擅长设计',
            blocks: [
              { kind: 'p', text: '在一众 coding agent 里，Claude Code 在前端工作上以“有品味”著称。原因有几点。' },
              { kind: 'steps', items: [
                { label: '决策具体，不含糊', body: 'Claude Code 倾向于落到确切的选择 —— 精确的 hex 色值、间距阶梯、字号 ramp 与组件层级，而不是泛泛而谈，而这正是真实界面与占位草稿的分水岭。' },
                { label: '理解代码库的推理', body: '凭借较大的工作上下文，它能一次性跨多文件重构 UI，复用你已有的组件与 token，而不是另造一套一次性样式。' },
                { label: '官方前端 skill', body: 'Anthropic 提供 Frontend Design skill，让 Claude 先写出设计方向，并刻意避开泛用系统字体与可预料的紫色渐变。' },
              ] },
              { kind: 'image', src: '/agents/claude-code-design/claude-code-design-taste-triangle.webp', alt: '展示设计系统、skill 与参考图三者汇聚成优质设计产出的示意图', caption: '品味来自你提供的三项输入：设计系统、skill，以及真实参考图。' },
              { kind: 'p', text: '这和 Anthropic 对自家模型的说法一致：Claude 默认并没有品味 —— 放任不管，它会收敛到网页设计的统计中心（Inter、紫色渐变、柔和阴影）。给它约束，它才能产出好设计。Open Design 恰恰把这些输入打包好了，这也是两者天然契合之处（详见下文）。' },
            ],
          },
          {
            id: 'setup',
            heading: '从零搭建用于设计工作的 Claude Code',
            blocks: [
              { kind: 'p', text: '下面是从一台干净机器到一个能构建并验证 UI 的 Claude Code 的完整路径。' },
              { kind: 'code', lang: 'bash', code: '# 1. 安装 Claude Code（推荐原生安装）\ncurl -fsSL https://claude.ai/install.sh | bash\n# 或：brew install --cask claude-code\n# Windows PowerShell：irm https://claude.ai/install.ps1 | iex\n\n# 2. 在你的项目里启动，首次运行时登录\ncd your-project\nclaude            # 用 Claude 订阅或 API key 登录\n\n# 3. 生成项目上下文\n/init             # 为本项目创建 CLAUDE.md\n\n# 4. 添加官方 Frontend Design skill\nclaude plugin install frontend-design@claude-plugins-official\n\n# 5. 接入 Figma MCP server（可选，用于设计交付）\nclaude plugin install figma@claude-plugins-official' },
              { kind: 'image', src: '/agents/claude-code-design/claude-code-design-setup-flow.webp', alt: '五步搭建流程：安装、认证、配置 CLAUDE.md、添加 skill、验证', caption: '搭建顺序：安装 → 认证 → 配置 CLAUDE.md → 添加 Frontend Design skill → 启用浏览器验证。' },
              { kind: 'steps', items: [
                { label: '把设计规则写进去', body: '把你的 token、基础原语与约定放进 CLAUDE.md 并让 Claude 指向它们，这样产出会贴合品牌，而不是退回到泛用样子。' },
                { label: '加上浏览器验证', body: '接入 Playwright 或 Chrome MCP，让 Claude 在真实浏览器里渲染，并跨断点检查产出，而不仅仅确认构建通过。' },
              ] },
            ],
          },
          {
            id: 'skills-workflow',
            heading: 'CLAUDE.md 与 Skills 工作流',
            blocks: [
              { kind: 'p', text: '用 Claude Code 做设计、杠杆最高的闭环，是把真实参考连同你的设计上下文一起喂给它，再迭代到 UI 对得上 —— 由 CLAUDE.md 和 Skills 承载约束，免得你每次 prompt 都重新解释一遍。' },
              { kind: 'ol', items: [
                '从你手头最清晰的视觉参考出发 —— 而且要包含多种状态（桌面与移动、hover、空态、加载态），不要只给一张 hero 图。',
                '在 prompt 里说具体；即便是强 agent，含糊的 prompt 也只会产出泛泛的 UI。',
                '把你的设计系统与约定放进 CLAUDE.md，并告诉 Claude token 与标准原语在哪里。',
                '添加 Frontend Design skill，让 Claude 在写代码前先确定一个真实的美学方向。',
                '接好浏览器验证，让 Claude 渲染、调整到各断点，并对照参考做比对 —— 而不只是确认能构建通过。',
              ] },
              { kind: 'p', text: '把一张参考图丢进会话，并用具体约束去提示：' },
              { kind: 'code', lang: 'bash', code: 'claude "把 reference-desktop.png 和 reference-mobile.png 用\n  React + Vite + Tailwind + TypeScript 实现。\n  复用 CLAUDE.md 里描述的设计系统组件与 token。\n  匹配间距、布局与层级；做成响应式。\n  在浏览器里渲染，跨断点验证它与参考一致，\n  并迭代到对得上为止。"' },
              { kind: 'p', text: '同时跑一个 dev server，prompt 保持小而聚焦，好的迭代就 commit、坏的就 revert（revert 时告诉 Claude 一声），让每一轮都在干净的基础上推进。较大的重构用 plan 模式，这样动文件前你能先审一遍方案。' },
            ],
          },
          {
            id: 'figma',
            heading: 'Claude Code + Figma：设计 ↔ 代码往返',
            blocks: [
              { kind: 'p', text: '2026 年 2 月，Anthropic 与 Figma 通过 Figma MCP server 推出了一流的双向集成。它在两个方向都能用。' },
              { kind: 'steps', items: [
                { label: '设计 → 代码', body: '在 Figma 里选中一个 frame，或把链接粘进 Claude Code，拉取设计上下文，让它用你已有的组件库来实现这份设计。Code Connect 会让产出与你真实的组件保持对齐。' },
                { label: '代码 → 设计', body: '在浏览器里构建并预览一个功能，然后说一句“Send this to Figma”，把运行中的 UI 捕获为可编辑的 Figma 图层 —— 整屏或选中的某个元素皆可。' },
              ] },
              { kind: 'p', text: '用 claude plugin install figma@claude-plugins-official 安装一次即可（Dev Mode MCP 需要 Figma 付费方案）。同一个 Figma MCP 对 Claude Code、Codex、Cursor 与 VS Code 都可用 —— 正是 Open Design 所要编排的那类可移植、多 agent 能力。' },
            ],
          },
          {
            id: 'vs',
            heading: 'Claude Code vs Codex vs Cursor 做设计',
            blocks: [
              { kind: 'p', text: '设计工作没有唯一赢家 —— 每个 agent 各有所长，有经验的团队会把它们叠着用。一个公允的概括：' },
              { kind: 'table', columns: ['Agent', '设计强项', '最适合'], rows: [
                ['Claude Code', '具体的设计决策（hex、间距、字号）与理解代码库的 UX 推理', '前端推理与大上下文重构'],
                ['Codex', '强视觉打磨与图像理解；沙箱化异步构建', '委派式异步构建与可移植的 AGENTS.md 规则'],
                ['Cursor', '带实时预览与内联编辑的“边做边看”闭环', 'IDE 内紧凑的“迭代-观察”式 UI 工作'],
              ] },
              { kind: 'p', text: '社区反复得出的结论是：品味来自人。三者在没有 skill、参考与约束时都会默认滑向泛用美学。这才是真正要解决的问题 —— 它是设计工具形状的，而非模型形状的。' },
            ],
          },
          {
            id: 'pitfalls',
            heading: '常见坑，以及如何避开“AI 套路感”',
            blocks: [
              { kind: 'p', text: '即便 Claude Code 以有品味著称，对 AI 生成设计最常见的吐槽仍是它显得套路 —— Inter 字体、白底上的紫色渐变、柔和阴影、过大的圆角，一种“一看就是 AI 做的”的观感。Anthropic 自己把这归因于分布收敛：安全的选择在网页训练数据里占主导。其他被反映的问题还包括移动端布局错乱、以及指令文字漏进了 UI 文案。' },
              { kind: 'steps', items: [
                { label: '装上 Frontend Design skill', body: '它会逼 Claude 确定一个真实方向，并明确避开被 AI 滥用的字体与渐变。' },
                { label: '启用浏览器验证', body: '让 Claude 渲染并跨断点自检，避免布局在移动端悄悄崩掉。' },
                { label: '提供 token 与参考', body: '真实的设计 token 与参考截图，是对产出质量影响最大的单一杠杆。' },
                { label: '把规则写进 CLAUDE.md', body: '把“不用 hero 卡片、最多两种字体、品牌优先的层级”这类规则，放在 agent 每次都会读到的地方。' },
              ] },
              { kind: 'p', text: '注意每一条缓解措施，本质都是在给 agent 一份精选的设计上下文。逐个项目手工维护这份上下文，正是 Open Design 替你省掉的苦差。' },
            ],
          },
          {
            id: 'open-design',
            heading: '在 Open Design 里用 Claude Code 做设计',
            blocks: [
              { kind: 'p', text: 'Open Design 就是上面那套工作流一直在呼唤的开源设计层。它把 Claude Code 当作一等适配器，并在外面包上一层精选的 skill 与设计系统库、一条结构化渲染流水线，以及一个本地桌面 UI —— 让那份令 Claude Code 出彩的设计上下文，从第一次运行就在位，而不必每次手工拼装。' },
              { kind: 'ol', items: [
                '安装 Open Design，并选择 Claude Code 作为你的 agent。',
                '用你的 Anthropic API key（BYOK）或 Claude 订阅认证 —— 凭证留在你自己机器上，绝不经我们中转。',
                '挑一套设计系统与一个 skill，然后产出风格一致的 deck、原型与落地页。',
                '每一件产物与 DESIGN.md 文件都存在你自己的仓库里，而非托管云端。',
              ] },
              { kind: 'p', text: '同一个 Claude Code agent、同一把 key —— 外加一套真实、可移植、开源的设计工作流。它本地优先、Apache-2.0，所以你的工作与凭证都不会离开你的机器。' },
            ],
          },
        ],
        faqTitle: '常见问题',
        faq: [
          { name: 'Claude Code 适合做设计吗？', text: '适合 —— 它被普遍认为是前端品味最好的 coding agent，会对 hex 色值、间距与字号阶梯做出具体且理解代码库的决策。配上 Frontend Design skill、一套设计系统与真实参考图，它能产出生产级、响应式的 UI 并在浏览器里验证。缺了这份上下文，它就容易退回泛用样子 —— 这正是 Open Design 要补的缺口。' },
          { name: '用 Claude Code 做设计需要 Claude 订阅吗？', text: '你可以用 Anthropic API key（BYOK，经 Console）或 Claude 订阅（Pro / Max），两者皆可。无论哪种，Open Design 都不会中转你的凭证 —— 它们由你的 agent 在你机器上直接使用。' },
          { name: '前端设计该用 Claude Code 还是 Codex？', text: '两者都很强。Claude Code 以具体、理解代码库的设计决策与前端推理著称；Codex 视觉打磨强，擅长委派式的沙箱构建。很多团队两者都用 —— Open Design 让你切换 agent 而无需改动设计工作流。' },
          { name: '怎么把 Claude Code 接到 Figma？', text: '用 claude plugin install figma@claude-plugins-official 安装官方 Figma 插件。之后你就能借助设计上下文在代码里实现 Figma frame，并用“Send this to Figma”把运行中的 UI 推回成可编辑的 Figma 图层。Dev Mode MCP 需要 Figma 付费方案。' },
          { name: 'Skills 和 CLAUDE.md 是什么？', text: 'CLAUDE.md 是你项目根目录里的一个 markdown 文件，Claude Code 在每次会话开始时都会读它 —— 这是写入设计规范的地方。Skills 把可复用的指令与资源打包，由 Claude 按需加载，其中包括 Anthropic 官方的 Frontend Design skill。Open Design 把两者都做成精选库，帮你免去逐项目搭建。' },
          { name: '怎么避开泛用的“AI 套路感”？', text: '装上 Frontend Design skill，提供真实的设计 token 与参考截图，把品牌规则写进 CLAUDE.md，并启用浏览器验证。Open Design 把这些做成精选库，帮你免去逐项目搭建。' },
          { name: 'Open Design 和 Anthropic 有从属关系吗？', text: '没有。Claude Code 是 Anthropic 的产品；Open Design 是一个独立的开源项目，把它作为一等适配器来支持。Claude 与 Claude Code 是 Anthropic 的商标。' },
          { name: '我的文件和凭证安全吗？', text: '安全 —— Open Design 本地优先、Apache-2.0。你的文件、产物与 DESIGN.md 都留在你自己的仓库里，你的 Anthropic 凭证由你的 agent 直接使用，绝不经 Open Design 服务器中转。' },
        ],
        ctaTitle: '用开放的方式，和 Claude Code 一起做设计。',
        ctaBody: '带上你自己的 Anthropic key 或 Claude 订阅，把每个文件都留在本地，再给你已在用的 agent 包上一层精选设计库。',
        ctaActions: [
          { label: '在 Open Design 里使用 Claude Code', href: '/quickstart/', variant: 'primary' },
          { label: '在 GitHub 上 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面应用', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        hubLinkLabel: 'See all supported agents',
      },
      aboutTitle: '什么是 Claude Code',
      aboutBody: [
        'Claude Code 是 Anthropic 的命令行 Agent：你用自然语言描述任务，它在你的项目里读写、运行代码，直到任务完成。',
        '它是编码 Agent，不是设计工具 —— 但设计是它最强的衍生用途之一。给足 skill 和设计系统上下文后，它能生成生产级 HTML/CSS/React，按截图迭代，维护设计 token。',
        'Open Design 把 Claude Code 作为一方适配器，让你写代码的同一个 Agent，成为结构化设计工作流背后的引擎。',
      ],
      vendorLabel: '厂商',
      vendor: 'Anthropic',
      credentialLabel: '凭据',
      credential: 'Anthropic API key（BYOK）或 Claude 订阅',
      designTitle: '用 Claude Code 做设计',
      designLead:
        '社区已经摸索出几种范式，让 Claude Code 从通用代码生成器变成有真正设计判断力的工具：',
      designPoints: [
        { label: '先给设计系统', body: '把 DESIGN.md / token / Tailwind 配置放进项目，让输出贴合品牌，而不是默认输出「AI 味」。' },
        { label: '审美 skill', body: 'Anthropic 的 frontend-design 这类 skill 会让它在写任何代码前先锁定排版／配色／动效方向。' },
        { label: 'Figma → 代码', body: '接入 Figma MCP，Claude Code 就能把 frame 转成带真实 token 的生产组件。' },
        { label: '截图循环', body: '让它给自己的 UI 截图、对照参考图、反复迭代 —— Agent 式的设计反馈闭环。' },
      ],
      linksTitle: '实战资源',
      linksLead: '大家真正在用来用 Claude Code 做设计的教程、skill 和实录：',
      withOdTitle: 'Claude Code + Open Design',
      withOdLead:
        'Open Design 正是 Claude Code 缺的那层设计能力：精选的 skill 与设计系统库、结构化的渲染流水线、一个桌面 UI —— 全开源、本地优先。',
      withOdSteps: [
        '安装 Open Design，选 Claude Code 作为你的 Agent。',
        '用你自己的 Anthropic API key（BYOK）或 Claude 订阅鉴权 —— 不经过我们中转。',
        '选一套设计系统和一个 skill，生成审美一致的 deck、原型和落地页。',
        '所有产物和 DESIGN.md 都留在你自己的 repo。',
      ],
      withOdClosing: '同一个 Agent、同一个密钥 —— 外加一套真正的设计工作流。',
      faqTitle: '常见问题',
      faq: [
        { name: 'Claude Code 真能做设计吗？', text: '能。给它设计系统和审美 skill 上下文，它就能生成生产级 UI。Open Design 把这两样开箱即用地配好，省去你搭环境。' },
        { name: '需要 Claude 订阅吗？', text: 'Anthropic API key（BYOK）或 Claude 订阅都行。Open Design 从不中转你的凭据。' },
        { name: '这是 Anthropic 官方产品吗？', text: '不是。Open Design 是独立的开源项目。Claude Code 是 Anthropic 的商标，我们以一方适配器的方式集成它。' },
      ],
      ctaTitle: '用开源的方式，跟 Claude Code 一起设计。',
      ctaBody: '给仓库点 Star、下载桌面版，或加入社区申请新适配器。',
    },
    codex: {
      ...INFO_PAGE_COPY.en!.agentGuides!.codex!,
      title: 'Codex 做设计 — Open Design',
      description:
        '大家如何用 OpenAI Codex 做 UI 和网页设计 —— Product Design 插件、Figma 集成、前端 skill —— 以及 Open Design 如何把 Codex 变成本地优先的开源设计 Agent。',
      breadcrumb: 'Codex',
      label: 'Agent · Codex',
      heading: '用 Codex 做设计。',
      lead: 'Codex 是 OpenAI 的编码 Agent。靠 Product Design 插件和 Figma 集成，它已经成了一个正经的设计工具。Open Design 把 Codex 接进开源设计工作流 —— 你自己的 OpenAI 密钥或 ChatGPT 订阅，你自己的文件，本地优先。',
      tldrTitle: '一句话',
      tldrBody:
        'Codex 能把截图和用户故事变成响应式 UI，还能把设计往返同步到 Figma。Open Design 给它配上精选的设计系统与 skill 库，外加桌面工作流 —— 自带密钥，所有东西留在本地。',
      toc: ['什么是 Codex', '用 Codex 做设计', '资源', '配合 Open Design', '常见问题'],
      rich: {
        heroCtaLead:
          'Open Design 把 Codex 变成本地优先的开源设计 Agent —— 你自己的 OpenAI 密钥、你自己的文件，外加一套围绕它的精选 skill 与设计系统库。',
        heroCtaActions: [
          { label: '在 Open Design 里用 Codex', href: '/quickstart/', variant: 'primary' },
          { label: '给 GitHub 点 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面客户端', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        intro: [
          'Codex 最初只是个代码生成器，但到 2026 年，只要你给对参考、skill 和验证回路，它已经能设计出真正可用的界面。这是一篇端到端的实操指南：怎么用 Codex 做 UI、前端和设计系统，以及怎么用 Open Design 把它接进结构化的设计工作流。',
          '内容覆盖：Codex 现在到底是什么、为什么它突然擅长前端、怎么从零配好、截图转 UI 的回路、官方的 Figma 双向打通、它跟 Cursor 与 Claude Code 的差异、让 AI 输出显得千篇一律的那些坑，以及 Open Design 作为开源、本地优先的设计层怎么补上缺口。',
        ],
        heroImage: {
          src: '/agents/codex-design/codex-design-workflow-loop.webp',
          alt: 'Codex 设计反馈回路：终端 Agent、浏览器渲染 UI、工作区，带一条回流箭头',
          caption: '核心回路：Codex 在终端里构建 UI，在真实浏览器里渲染并验证，再对着你的参考图迭代。',
        },
        tocLabel: '本页内容',
        toc: [
          { id: 'what-is-codex', label: 'Codex 到底是什么' },
          { id: 'why-design', label: '为什么 Codex 现在能做设计' },
          { id: 'setup', label: '从零配好 Codex 做设计' },
          { id: 'screenshot-workflow', label: '截图转 UI 的工作流' },
          { id: 'figma', label: 'Codex + Figma 双向打通' },
          { id: 'vs', label: 'Codex vs Cursor vs Claude Code' },
          { id: 'pitfalls', label: '常见坑与「AI 味」' },
          { id: 'open-design', label: '在 Open Design 里用 Codex' },
          { id: 'faq', label: '常见问题' },
        ],
        sections: [
          {
            id: 'what-is-codex',
            heading: 'Codex 到底是什么（以及不是什么）',
            blocks: [
              { kind: 'p', text: '先消歧，几乎每个搜「Codex」的人都会被绊一下。最早的 OpenAI Codex 是 2021 年的代码补全模型，驱动过早期 GitHub Copilot，2023 年已弃用。本文讲的不是它。今天的 Codex 是 OpenAI 的 Agent 式编码工具 —— 从自然语言任务出发，规划、编写、运行并验证代码。' },
              { kind: 'p', text: '现代 Codex 有四种形态：终端 CLI（用 Rust 重写、Apache-2.0 开源）、面向 VS Code / Cursor / Windsurf 的 IDE 扩展、用于异步委派任务的云端/网页版，以及带内置浏览器和 Computer Use 的桌面 App。' },
              { kind: 'steps', items: [
                { label: '默认模型', body: '截至 2026 年中，推荐模型是 gpt-5.5；而 gpt-5.4 是 OpenAI 明确为前端和 Computer Use 训练的那个模型。' },
                { label: '指令文件', body: 'Codex 读取项目里的 AGENTS.md（跨工具通用标准）作为项目规则 —— 也就是写你设计约定最自然的地方。' },
                { label: '沙箱', body: '它跑在内核级沙箱里（默认 workspace-write），改你 UI 的 Agent 不会跑到项目之外乱动。' },
              ] },
              { kind: 'ul', items: [
                '厂商：OpenAI',
                '凭据：OpenAI API key（BYOK）或 ChatGPT 订阅（Free / Go / Plus / Pro / Business / Enterprise）',
                'CLI 许可：Apache-2.0，开源',
              ] },
            ],
          },
          {
            id: 'why-design',
            heading: '为什么 Codex 现在能做设计',
            blocks: [
              { kind: 'p', text: '2026 年初有三件事凑到一起，才让 Codex 从通用代码生成器变成真正的设计工具。' },
              { kind: 'steps', items: [
                { label: '一个为前端训练的模型', body: 'OpenAI 发布了 GPT-5.4 —— 它第一个主线版为前端和 Computer Use 训练的模型，对设计流程里的图像理解大幅提升，自我验证也更强，甚至能在定稿前先生成情绪板和多个视觉方案。' },
                { label: '一个官方前端 skill', body: 'openai/skills 目录里有一个精选 frontend-skill，强制真审美：无卡片布局、整屏 hero、品牌优先的层级、克制的动效、最多两种字体加一个强调色 —— 还逼 Codex 先写「视觉论点」再动手。' },
                { label: '浏览器验证', body: '配上 Playwright skill，Codex 会真开浏览器、按断点缩放，并把输出跟参考图比对，而不只是「构建通过」就完事。' },
              ] },
              { kind: 'image', src: '/agents/codex-design/codex-design-taste-triangle.webp', alt: '设计系统、skill、参考图三者汇聚成优质设计输出的示意图', caption: '审美来自你提供的三种输入：设计系统、skill 和真实参考图。' },
              { kind: 'p', text: '三件事背后的道理是一样的：Codex 默认没有审美。只有当你给它约束 —— 设计系统、审美 skill、具体参考 —— 它才能产出好设计。Open Design 打包的正是这三种输入，这也是两者契合的原因（下文详述）。' },
            ],
          },
          {
            id: 'setup',
            heading: '从零配好 Codex 做设计',
            blocks: [
              { kind: 'p', text: '从一台干净的机器，到一个能构建并验证 UI 的 Codex，完整路径如下。' },
              { kind: 'code', lang: 'bash', code: '# 1. 安装 Codex CLI\nnpm install -g @openai/codex\n# 或：brew install --cask codex\n# 或：curl -fsSL https://chatgpt.com/codex/install.sh | sh\n\n# 2. 鉴权（推荐用 ChatGPT 登录，额度更高）\ncodex            # 然后选 “Sign in with ChatGPT”\n\n# 3. 生成项目上下文\ncodex            # 在项目里运行 /init 生成 AGENTS.md\n\n# 4. 装官方前端 skill，然后重启 Codex\n# （在 Codex App 里）$skill-installer frontend-skill\n\n# 5. 接 Figma MCP server（可选，做设计交付）\ncodex mcp add figma --url https://mcp.figma.com/mcp' },
              { kind: 'image', src: '/agents/codex-design/codex-design-setup-flow.webp', alt: '五步配置流程：安装、鉴权、配置、装 skill、验证', caption: '配置顺序：安装 → 鉴权 → 配 AGENTS.md → 装前端 skill → 开浏览器验证。' },
              { kind: 'steps', items: [
                { label: '把设计规则写进去', body: '把 token、基础组件、约定写进 AGENTS.md 或 DESIGN.md 并让 Codex 指向它们，输出就会贴合品牌，而不是退回那套通用样子。' },
                { label: '选对推理档位', body: 'OpenAI 提到：低到中等推理档位的前端效果，往往比最高档更好。' },
              ] },
            ],
          },
          {
            id: 'screenshot-workflow',
            heading: '截图转 UI 的工作流',
            blocks: [
              { kind: 'p', text: 'Codex 做设计最高杠杆的回路，是把参考图变成可用的响应式 UI，再迭代到对齐为止。OpenAI 官方指引归纳为五步。' },
              { kind: 'ol', items: [
                '从你手头最清晰的视觉参考出发 —— 而且要包含多个状态（桌面和移动、hover、空态、加载态），不只是一张 hero 图。',
                'prompt 要具体；含糊的 prompt 只会产出通用 UI。',
                '准备好设计系统，并告诉 Codex token 和基础组件在哪。',
                '开启 Playwright 交互 skill，让 Codex 真在浏览器里渲染并按断点缩放。',
                '迭代时让 Codex 把实现跟截图比对 —— 而不只是确认「能构建」。',
              ] },
              { kind: 'p', text: '喂图可以把截图拖进终端，或用 image 参数，然后用具体约束来 prompt：' },
              { kind: 'code', lang: 'bash', code: 'codex -i reference-desktop.png -i reference-mobile.png \\\n  "用 React + Vite + Tailwind + TypeScript 实现这个设计。\n   尽量复用我现有的设计系统组件和 token。\n   对齐间距、布局和层级；做成响应式。\n   用 Playwright skill 验证 UI 跟参考图一致，\n   不一致就一直迭代。"' },
              { kind: 'p', text: '在第二个终端里跑 dev server，prompt 保持小而聚焦，好的迭代就 commit、坏的就 revert（并告诉 Codex 你回退了），这样每一轮都在干净的基础上推进。' },
            ],
          },
          {
            id: 'figma',
            heading: 'Codex + Figma：设计 ↔ 代码双向打通',
            blocks: [
              { kind: 'p', text: '2026 年 2 月 OpenAI 和 Figma 宣布官方合作，把早先的 Figma MCP beta 升级成一等公民级的双向集成。两个方向都能走。' },
              { kind: 'steps', items: [
                { label: '设计 → 代码', body: '在 Figma 里复制某个 frame 的「link to selection」，粘进 Codex 配合 get_design_context，让它用你现有的组件库实现这个设计。' },
                { label: '代码 → 设计', body: 'generate_figma_design 工具（「Code to Canvas」）能把跑起来的 UI 变回可编辑的 Figma frame —— 整屏、选中元素或整个文件都行。' },
              ] },
              { kind: 'p', text: 'Figma MCP 以远程 server 形式运行且免限流。接一次，Codex、Claude Code、Cursor、VS Code 等都能用 —— 这种可移植的多 Agent 能力，正是 Open Design 要编排的东西。' },
            ],
          },
          {
            id: 'vs',
            heading: 'Codex vs Cursor vs Claude Code 做设计',
            blocks: [
              { kind: 'p', text: '做设计没有唯一赢家 —— 每个 Agent 强在不同地方，老手会叠着用。公允的总结：' },
              { kind: 'table', columns: ['Agent', '设计强项', '最适合'], rows: [
                ['Codex', 'GPT-5.4 + 前端 skill 之后视觉打磨很强；图像理解好', '异步委派构建、沙箱化运行、可移植的 AGENTS.md 规则'],
                ['Cursor', '边改边看的视觉回路，带实时预览和行内编辑', 'IDE 里贴身迭代、即时观察的 UI 工作'],
                ['Claude Code', '具体的设计决策（hex、间距、字体）和懂代码库的 UX', '前端推理和大上下文重构'],
              ] },
              { kind: 'p', text: '社区反复得出的结论是：审美来自人。三者在没有 skill、参考和约束时，都会退回通用样子。这才是要解决的真问题 —— 而它是「设计工具」形状的，不是「模型」形状的。' },
            ],
          },
          {
            id: 'pitfalls',
            heading: '常见坑，以及怎么避开「AI 味」',
            blocks: [
              { kind: 'p', text: '对 Codex 生成设计最常见的吐槽是「显得通用」—— 柔和渐变、漂浮面板、超大圆角、夸张阴影，那种 Inter 字体加紫色的味道，「一看就是 AI 做的」。其他常见问题还有移动端布局崩、指令文案泄漏进 UI、以及很快撞到用量上限。' },
              { kind: 'steps', items: [
                { label: '装一个前端 skill', body: '精选的审美 skill 逼 Codex 选定一个真方向，而不是默认那套样子。' },
                { label: '开启 Playwright 验证', body: '让 Codex 跨断点渲染并自检，布局就不会在移动端悄悄崩。' },
                { label: '喂 token 和参考', body: '真实的设计 token 和参考截图，是对输出质量影响最大的那个杠杆。' },
                { label: '把规则写进 AGENTS.md', body: '把「不要 hero 卡片、最多两种字体、品牌优先层级」这类规则放在 Agent 每次都会读到的地方。' },
              ] },
              { kind: 'p', text: '注意：每条缓解措施，本质都是给 Agent 一套精选的设计上下文。而逐个项目手工维护这套上下文，正是 Open Design 帮你省掉的苦活。' },
            ],
          },
          {
            id: 'open-design',
            heading: '在 Open Design 里用 Codex',
            blocks: [
              { kind: 'p', text: 'Open Design 就是上面这套工作流一直在呼唤的那个开源设计层。它把 Codex 当作一方适配器，外面包上精选的 skill 与设计系统库、结构化渲染流水线、本地桌面 UI —— 让那些让 Codex 变好的设计上下文从第一次运行就在，而不是每次手工拼。' },
              { kind: 'ol', items: [
                '安装 Open Design，选 Codex 作为你的 Agent。',
                '用 OpenAI API key（BYOK）或 ChatGPT 订阅鉴权 —— 凭据留在你机器上，绝不经我们中转。',
                '选一套设计系统和一个 skill，生成审美一致的 deck、原型和落地页。',
                '每个产物和 DESIGN.md 都在你自己的 repo 里，不在托管云端。',
              ] },
              { kind: 'p', text: '同一个 Codex Agent、同一把密钥 —— 外加一套真正可移植的开源设计工作流。它本地优先、Apache-2.0，你的工作和凭据都不离开你的机器。' },
            ],
          },
        ],
        faqTitle: '常见问题',
        faq: [
          { name: 'OpenAI Codex 真的能做设计吗？', text: '能 —— 只要上下文里有前端 skill、设计系统和真实参考图，Codex（尤其在 GPT-5.4 上）能产出生产级、响应式的 UI，还能在浏览器里自检。没有这套上下文它就会退回通用样子，而这正是 Open Design 补的缺口。' },
          { name: '这是 OpenAI 的 Codex Product Design 插件吗？', text: '不是。Open Design 是独立开源项目，把 Codex 作为 Agent 集成，用本地优先的开源 skill 与设计系统库补充官方工具。' },
          { name: '用 Codex 做设计需要 ChatGPT 订阅吗？', text: 'OpenAI API key（BYOK）或 ChatGPT 订阅都行。ChatGPT 登录通常额度更高；无论哪种，Open Design 都不中转你的凭据。' },
          { name: '前端设计该用 Codex 还是 Claude Code？', text: '两个都强。Claude Code 以具体、懂代码库的设计决策见长；Codex 在 GPT-5.4 之后视觉打磨很强，且擅长沙箱化的异步委派构建。很多团队两个都用 —— Open Design 让你换 Agent 时不用换设计工作流。' },
          { name: '怎么把 Codex 接到 Figma？', text: '加上官方 Figma MCP server（codex mcp add figma --url https://mcp.figma.com/mcp）。之后用 get_design_context 把 Figma frame 实现成代码，用 generate_figma_design 把跑起来的 UI 推回可编辑的 Figma frame。' },
          { name: '怎么避免那种通用的「AI 味」审美？', text: '装一个前端 skill、喂真实的设计 token 和参考截图、把品牌规则写进 AGENTS.md、并开启 Playwright 验证。Open Design 把这些做成精选库，你就省掉了逐项目的配置。' },
          { name: 'Open Design 跟 OpenAI 有关联吗？', text: '没有。Codex 是 OpenAI 的产品；Open Design 是独立开源项目，以一方适配器的方式支持它。OpenAI 和 Codex 是 OpenAI 的商标。' },
          { name: '我的文件和凭据安全吗？', text: '安全 —— Open Design 本地优先。你的文件、产物和 DESIGN.md 都留在自己的 repo，OpenAI 凭据由你的 Agent 直接使用，绝不经 Open Design 服务器中转。' },
        ],
        ctaTitle: '用开源的方式，跟 Codex 一起设计。',
        ctaBody: '自带 OpenAI 密钥、所有文件留在本地，给你已经在用的 Agent 配上一套精选设计库。',
        ctaActions: [
          { label: '在 Open Design 里用 Codex', href: '/quickstart/', variant: 'primary' },
          { label: '给 GitHub 点 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面客户端', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        hubLinkLabel: '查看全部支持的 Agent',
      },
      aboutTitle: '什么是 Codex',
      aboutBody: [
        'Codex 是 OpenAI 的 Agent 式编码系统 —— 一个 CLI 加 ChatGPT 集成的 Agent，从自然语言任务规划、写、跑代码。',
        'OpenAI 现在提供面向角色的 Product Design 插件和 Figma 集成，Codex 可以探索方向、审查用户流程、从在线 URL 出原型，并导出到 Figma 或 Canva。',
        'Open Design 把 Codex 作为一方适配器，让它嵌入结构化的开源设计流水线。',
      ],
      vendorLabel: '厂商',
      vendor: 'OpenAI',
      credentialLabel: '凭据',
      credential: 'OpenAI API key（BYOK）或 ChatGPT 订阅',
      designTitle: '用 Codex 做设计',
      designLead:
        'Codex 的设计能力在 2026 年快速成型，主要围绕几项官方和社区能力：',
      designPoints: [
        { label: 'Product Design 插件', body: 'OpenAI 的角色插件：探索方向、审查用户流程、从在线 URL 出原型、把截图变可交互、导出 Figma/Canva。' },
        { label: '截图 → 响应式 UI', body: 'Codex 把参考图变成响应式代码，并用 Playwright skill 在各断点上跟参考图做视觉比对。' },
        { label: 'Codex ↔ Figma', body: 'Figma MCP 把设计上下文带进代码，再把运行中的 UI 变回可编辑的 Figma frame。' },
        { label: '前端设计 skill', body: '社区和官方 skill 锁定审美方向，避免输出千篇一律的「紫色 AI 味」。' },
      ],
      linksTitle: '实战资源',
      linksLead: '用 Codex 做设计的官方文档、Figma 集成和实录：',
      withOdTitle: 'Codex + Open Design',
      withOdLead:
        'Open Design 是围绕 Codex 的开源设计层：精选 skill 与设计系统库、结构化渲染流水线、本地桌面 UI。',
      withOdSteps: [
        '安装 Open Design，选 Codex 作为你的 Agent。',
        '用 OpenAI API key（BYOK）或 ChatGPT 订阅鉴权 —— 凭据留在你机器上。',
        '选一套设计系统和 skill，生成审美一致的 deck、原型和落地页。',
        '产物和 DESIGN.md 都在你自己的 repo，不在托管云端。',
      ],
      withOdClosing: '同一个 Codex Agent —— 外加一套真正可移植的设计工作流。',
      faqTitle: '常见问题',
      faq: [
        { name: '这是 OpenAI 的 Codex Product Design 插件吗？', text: '不是。Open Design 是独立开源项目，把 Codex 作为 Agent 集成，用本地优先的开源库补充官方插件。' },
        { name: '需要 ChatGPT 订阅吗？', text: 'OpenAI API key（BYOK）或 ChatGPT 订阅都行。Open Design 从不中转你的凭据。' },
        { name: 'Open Design 跟 OpenAI 有关联吗？', text: '没有。Codex 是 OpenAI 的产品；Open Design 是独立开源项目，以一方适配器的方式支持它。' },
      ],
      ctaTitle: '用开源的方式，跟 Codex 一起设计。',
      ctaBody: '给仓库点 Star、下载桌面版，或加入社区申请新适配器。',
    },
    cursor: {
      ...INFO_PAGE_COPY.en!.agentGuides!.cursor!,
      title: 'Cursor 做设计 — Open Design',
      description:
        '设计师如何用 Cursor 做 UI 和网页设计 —— Design Mode、Figma 转代码、Figma MCP —— 以及 Open Design 如何把 Cursor 变成本地优先的开源设计 Agent。',
      breadcrumb: 'Cursor',
      label: 'Agent · Cursor',
      heading: 'Cursor 给设计师。',
      lead: 'Cursor 是那个 AI 代码编辑器，现在带了可视化 Design Mode。设计师用它点选、勾画来改 UI，也用它把 Figma 转成代码。Open Design 把 Cursor Agent 接进开源设计工作流，文件全留本地。',
      tldrTitle: '一句话',
      tldrBody:
        'Cursor 的 Design Mode 让你点击、勾画或用说话来改在线 UI；它的 Figma MCP 集成把真实设计上下文带进代码。Open Design 在上面叠一层精选 skill 与设计系统库 —— 你自己的模型密钥，你自己的 repo。',
      toc: ['什么是 Cursor', '用 Cursor 做设计', '资源', '配合 Open Design', '常见问题'],
      rich: {
        heroCtaLead:
          'Open Design 把 Cursor 变成一个本地优先、开源的设计 agent——用你自己的 Cursor 账号或模型密钥、你自己的文件，外面再裹一层精选的 skill 与 design-system 库。',
        heroCtaActions: [
          { label: '在 Open Design 里使用 Cursor', href: '/quickstart/', variant: 'primary' },
          { label: '在 GitHub 上 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面端', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        intro: [
          'Cursor 是一款 AI 优先的代码编辑器，它让“边写边看渲染”成为做 UI 的默认方式。借助 Agent 模式、行内编辑、编辑器内置预览，以及通过 MCP 接入的 Figma，它已经成为一个真正能用的设计工具——前提是你给它对的参考、规则和一套验证回路。这是一份从头到尾、可落地的指南，讲如何用 Cursor 做 UI、前端和 design-system 工作，并把它接入 Open Design 的结构化设计工作流。',
          '内容涵盖：Cursor 到底是什么、为什么它“边迭代边看”的紧凑回路适合做设计、如何从零搭起、从预览到 UI 的迭代回路、通过 MCP 与 Figma 的往返、它与 Codex 和 Claude Code 的对比、让 AI 产出显得平庸的那些坑，以及 Open Design 作为开源、本地优先的设计层如何补齐这道缺口。',
        ],
        heroImage: {
          src: '/agents/cursor-design/cursor-design-hero.webp',
          alt: 'Cursor 设计收敛示意：左侧是编辑器，中间是带 Cursor 标志的精选 skill 与 design-system hub，右侧是渲染出的 UI',
          caption: '核心思路：Cursor 在编辑器里编辑并渲染 UI，而一个精选的设计 hub 为它喂入设计系统、skill 和参考，让产出显得是有意为之、而非随手生成。',
        },
        tocLabel: '本页目录',
        toc: [
          { id: 'what-is-cursor', label: 'Cursor 到底是什么' },
          { id: 'why-design', label: '为什么 Cursor 擅长做设计' },
          { id: 'setup', label: '从零配置 Cursor 做设计' },
          { id: 'preview-workflow', label: '从预览到 UI 的工作流' },
          { id: 'figma', label: 'Cursor + Figma（经 MCP）' },
          { id: 'vs', label: 'Cursor vs Codex vs Claude Code' },
          { id: 'pitfalls', label: '常见坑与“AI 味”观感' },
          { id: 'open-design', label: '在 Open Design 里用 Cursor 做设计' },
          { id: 'faq', label: '常见问题' },
        ],
        sections: [
          {
            id: 'what-is-cursor',
            heading: 'Cursor 到底是什么',
            blocks: [
              { kind: 'p', text: 'Cursor 是 Anysphere 打造的 AI 优先代码编辑器。它是 VS Code 的一个 fork，所以保留了熟悉的编辑器、扩展和快捷键，但把整个工作流围绕一个 AI agent 重建——这个 agent 能读懂你的整个项目、跨多文件编辑、运行命令，并和你一起在回路里迭代。' },
              { kind: 'p', text: '对设计工作而言，关键的几个能力是：Agent 模式（你描述想要的结果，Cursor 规划并跨文件编辑）、用于快速微调的行内编辑与 Tab 补全、让你不离开窗口就能看到运行中 UI 的编辑器内置预览，以及让它能拉入外部上下文（比如一个实时 Figma 文件）的 MCP 支持。' },
              { kind: 'steps', items: [
                { label: '项目规则', body: 'Cursor 会读取项目指令文件——`.cursor/rules` 下纳入版本管理的 `.mdc` 规则，以及一个纯文本 `AGENTS.md`——你可以把设计约定写在 agent 每次都会读到的地方。' },
                { label: '模型', body: 'Cursor 在模型上很灵活：订阅自带前沿模型，也支持用你自己的模型密钥（BYOK），所以同一套编辑器工作流背后用哪台引擎由你定。' },
                { label: 'MCP', body: '它支持 Model Context Protocol，外部 server——最相关的就是 Figma MCP server——可以成为 agent 的一等上下文。' },
              ] },
              { kind: 'ul', items: [
                '厂商：Anysphere',
                '凭证：Cursor 账号 / 订阅（Hobby / Pro / Business）或你自己的模型密钥（BYOK）',
                '形态：AI 优先的代码编辑器（VS Code fork），内置 agent 与预览',
              ] },
            ],
          },
          {
            id: 'why-design',
            heading: '为什么 Cursor 擅长做设计',
            blocks: [
              { kind: 'p', text: 'Cursor 在设计上的优势不是某个单一功能，而是“边写边看”这条回路的紧凑度。有三点让它更像一个设计工具，而不是一个泛泛的代码生成器。' },
              { kind: 'steps', items: [
                { label: '紧凑的“边迭代边看”回路', body: '你给出提示，Cursor 跨文件编辑，编辑器内置预览立刻渲染出结果——于是你能在几秒内调整间距、层级和动效，而不必在另一个终端和浏览器之间来回切换。' },
                { label: '直接的可视化编辑', body: '除了对话，Cursor 还允许你在预览里选中元素、直接微调样式，让小的视觉修正更像设计编辑、而非翻代码考古。' },
                { label: '项目规则与 MCP 上下文', body: '有了 `.cursor/rules`（或 `AGENTS.md`）和 Figma MCP server，agent 是对着你的 tokens、组件和真实设计规格在工作，而不是靠猜。' },
              ] },
              { kind: 'image', src: '/agents/cursor-design/cursor-design-taste-triangle.webp', alt: '展示 design system、skill 与参考图三者收敛为优质设计产出的示意图', caption: '审美来自你提供的三个输入：一套设计系统、一个 skill，以及真实的参考图。' },
              { kind: 'p', text: '结论和每个 agent 教给我们的一样：Cursor 默认并没有审美。只有当你给它约束——一套设计系统、一个审美 skill、具体的参考——它才能产出好设计。Open Design 打包的正是这些输入，这也是两者天然契合的原因（下文详述）。' },
            ],
          },
          {
            id: 'setup',
            heading: '从零把 Cursor 配置成能做设计',
            blocks: [
              { kind: 'p', text: '下面是从一台干净机器，到一个能对着你的设计系统构建、预览并验证 UI 的 Cursor 的完整路径。' },
              { kind: 'ol', items: [
                '从 cursor.com 安装 Cursor，用 Cursor 账号登录，或在设置里配置你自己的模型密钥（BYOK）。',
                '打开你的项目，在对话 / Agent 面板里选一个模型。',
                '加项目规则：用 `.cursor/rules/*.mdc` 写结构化、按 glob 作用域生效的约定，或用一个纯文本 `AGENTS.md` 写简单可读的指令。',
                '接入 Figma MCP server（可选），让 agent 能读取实时设计上下文。',
                '启动你的 dev server，用编辑器内置预览边迭代边看、边验证 UI。',
              ] },
              { kind: 'image', src: '/agents/cursor-design/cursor-design-setup-flow.webp', alt: '五步配置流程：安装、认证、配置规则、添加 skill、验证', caption: '配置顺序：安装 → 认证 → 配置项目规则 → 添加 skill → 启用预览验证。' },
              { kind: 'p', text: '一份最简的项目规则文件，就能让 agent 对着品牌做设计、而不是退回到一个泛泛的样子。把它放在 Cursor 每次都会读到的地方：' },
              { kind: 'code', lang: 'markdown', code: '# .cursor/rules/design.mdc\n---\ndescription: Project design conventions\nalwaysApply: true\n---\n\n- 复用已有的 design-system tokens 和组件；不要写死 hex 或间距。\n- 最多两种字体、一个强调色。\n- 品牌优先的层级；克制的动效。不要 hero card，不要过大的圆角。\n- 默认做响应式；收尾前先在预览里验证桌面端和移动端。' },
              { kind: 'steps', items: [
                { label: '把设计规则写下来', body: '把你的 tokens、基础元件和约定放进 `.cursor/rules` 或 `AGENTS.md`，并让 Cursor 指向它们，这样产出会贴合品牌、而不是退回到泛泛的样子。' },
                { label: '让提示保持小而聚焦', body: 'Cursor 的紧凑回路偏爱聚焦的请求——一次只迭代一个组件或一种状态，每一轮之间都盯着预览看。' },
              ] },
            ],
          },
          {
            id: 'preview-workflow',
            heading: '从预览到 UI 的工作流',
            blocks: [
              { kind: 'p', text: '用 Cursor 做设计，杠杆最高的回路就是把一张参考变成能跑、且响应式的 UI，并在编辑器里一直盯着实时预览迭代到匹配为止——而不是靠猜。' },
              { kind: 'ol', items: [
                '从你手上最清晰的视觉参考开始——并且要包含多种状态（桌面与移动、hover、空态、加载态），而不只是一张主视觉。',
                '提示要具体；含糊的提示只会产出泛泛的 UI。',
                '准备好设计系统，并告诉 Cursor tokens 和标准基础元件都在哪里。',
                '让编辑器内置预览开着、dev server 跑着，这样每次编辑都能在你关心的断点上立刻渲染出来。',
                '通过把渲染出的 UI 和参考反复比对来迭代——小的视觉修正就直接在预览里选中元素来调。',
              ] },
              { kind: 'p', text: '把图片附到对话里来喂参考，然后用具体约束给出提示：' },
              { kind: 'code', lang: 'text', code: '用 React + Vite + Tailwind + TypeScript 实现这个设计。\n复用我已有的 design-system 组件和 tokens。\n匹配间距、布局和层级；做成响应式。\n预览一直开着——验证桌面端和移动端都和参考一致，\n迭代到一致为止。' },
              { kind: 'p', text: '好的迭代就提交，坏的就回退（回退时告诉 Cursor 一声），让每一轮都建立在干净的基础上——这是让任何 agent 回路不跑偏的同一条纪律。' },
            ],
          },
          {
            id: 'figma',
            heading: 'Cursor + Figma：经 MCP 的设计 ↔ 代码往返',
            blocks: [
              { kind: 'p', text: 'Cursor 通过官方的 Figma MCP server 连接 Figma，让 agent 对一个实时 Figma 文件有结构化访问，而不是只拿到一张扁平截图。这就把交接里的猜测成分去掉了。' },
              { kind: 'steps', items: [
                { label: '设计 → 代码', body: '在 Figma 里复制某个 frame 的链接，粘进 Cursor，让它去实现这个设计。MCP server 暴露的是真实的设计上下文——组件、变量、布局数据、tokens——所以生成的代码是贴合源文件的，而不是近似。' },
                { label: '保持对齐', body: '只要在 Figma 里一致地使用设计 tokens、样式和组件（有 Code Connect 时用上），Cursor 的产出就会映射到你真实的设计系统，而不是重新发明一套基础元件。' },
              ] },
              { kind: 'p', text: '远程 Figma MCP server 配一次，就能作为一等上下文供 Cursor 使用。由于 MCP 是开放标准，同一个 server 可以在 Cursor、Claude Code、Codex 和 VS Code 之间复用——这正是 Open Design 生来要去编排的那种可移植、多 agent 能力。' },
            ],
          },
          {
            id: 'vs',
            heading: 'Cursor vs Codex vs Claude Code：做设计怎么选',
            blocks: [
              { kind: 'p', text: '做设计没有唯一赢家——每个 agent 各有所长，有经验的团队会把它们叠着用。一个公允的总结：' },
              { kind: 'table', columns: ['Agent', '设计强项', '最适合'], rows: [
                ['Cursor', '“边写边看”的可视化回路，带编辑器内置实时预览与直接选中元素编辑', 'IDE 里“边迭代边看”的紧凑 UI 工作'],
                ['Codex', '配上前端 skill 后视觉打磨强；图像理解 + 沙箱化运行', '托管式异步构建，以及可移植的 AGENTS.md 规则'],
                ['Claude Code', '具体的设计决策（hex、间距、字体）和懂代码库的 UX', '前端推理与大上下文重构'],
              ] },
              { kind: 'p', text: '社区反复得出的结论是：审美来自人。三者在没有 skill、参考和约束时都会退回到一个泛泛的样子。那才是真正要解决的问题——而它是“设计工具”形状的，不是“模型”形状的。' },
            ],
          },
          {
            id: 'pitfalls',
            heading: '常见坑，以及如何避开“AI 味”观感',
            blocks: [
              { kind: 'p', text: '对 Cursor 生成设计最常见的抱怨，是它看着很泛——柔和渐变、悬浮面板、过大的圆角、夸张阴影，一股“Inter 字体加紫色”的味道，“一看就是 AI 做的”。其他被反映的问题还包括移动端布局错乱、指令文字泄漏进 UI 文案里。' },
              { kind: 'steps', items: [
                { label: '加一个设计 skill', body: '一个精选的审美 skill 会逼 Cursor 选定一个真实方向，而不是用默认那套。' },
                { label: '用预览来验证', body: '在编辑器内置预览里跨断点渲染并自检，这样布局就不会在移动端悄悄崩掉。' },
                { label: '提供 tokens 和参考', body: '真实的设计 tokens 和参考截图，是对产出质量影响最大的那个杠杆。' },
                { label: '把规则写进 `.cursor/rules`', body: '把“不要 hero card、最多两种字体、品牌优先层级”这类规则，放在 agent 每次都会读到的地方。' },
              ] },
              { kind: 'p', text: '注意到没有：每一条缓解措施都是在给 agent 一份精选的设计上下文。逐个项目、用手去维护这份上下文，正是 Open Design 帮你省掉的苦活。' },
            ],
          },
          {
            id: 'open-design',
            heading: '在 Open Design 里用 Cursor 做设计',
            blocks: [
              { kind: 'p', text: 'Open Design 就是上面这套工作流一直在要的那一层开源设计层。它把 Cursor 当作一等适配器，外面裹上一个精选的 skill 与 design-system 库、一条结构化的渲染流水线，以及一个本地桌面端 UI——让那份让 Cursor 变好用的设计上下文，从第一次运行就在那儿，而不是每次都手工拼。' },
              { kind: 'ol', items: [
                '安装 Open Design，选 Cursor 作为你的 agent。',
                '用你的 Cursor 账号或你自己的模型密钥（BYOK）认证——凭证留在你的机器上，绝不经我们代理。',
                '挑一套设计系统和一个 skill，然后生成审美一致的演示稿、原型和落地页。',
                '每一份产物和 DESIGN.md 都存在你自己的 repo 里，而不是某个托管云。',
              ] },
              { kind: 'p', text: '同一个 Cursor agent、同一把密钥——外面再加一套真实、可移植、开源的设计工作流。它本地优先、Apache-2.0 授权，所以你的工作和凭证没有任何东西会离开你的机器。' },
            ],
          },
        ],
        faqTitle: '常见问题',
        faq: [
          { name: 'Cursor 真的能做设计吗？', text: '能——只要上下文里有一个设计 skill、一套设计系统和真实参考图，Cursor 就能产出生产级、响应式的 UI，而它的编辑器内置预览让你能在视觉上验证并打磨。缺了这份上下文，它就容易退回到泛泛的样子，而这正是 Open Design 补齐的缺口。' },
          { name: '这是 Cursor 官方产品吗？', text: '不是。Open Design 是一个独立的开源项目，把 Cursor 作为 agent 集成进来。它用一个本地优先、开源的 skill 与 design-system 库来补充 Cursor。' },
          { name: '用 Cursor 做设计需要 Cursor 订阅吗？', text: '你可以用 Cursor 账号 / 订阅，也可以用自己的模型密钥（BYOK）。无论哪种方式，Open Design 都不会代理你的凭证——它们由你的 agent 直接使用。' },
          { name: '前端设计选 Cursor 还是 Claude Code？', text: '两者都很强。Claude Code 以具体、懂代码库的设计决策著称；Cursor 的优势是编辑器里“边写边看”的紧凑回路加实时预览。很多团队两个都用——Open Design 让你切换 agent 时无需改动设计工作流。' },
          { name: '怎么把 Cursor 连到 Figma？', text: '在 Cursor 里加上官方 Figma MCP server，然后把一个 Figma frame 链接粘进对话，让 Cursor 去实现它。该 server 暴露真实的组件、变量和布局数据，让生成的代码贴合源设计。' },
          { name: '怎么避开泛泛的“AI 味”观感？', text: '加一个设计 skill、提供真实的设计 tokens 和参考截图、把品牌规则写进 `.cursor/rules` 或 `AGENTS.md`，并在预览里跨断点验证。Open Design 把这些做成一个精选库，让你省掉逐项目的搭建。' },
          { name: 'Open Design 和 Cursor 或 Anysphere 有关联吗？', text: '没有。Cursor 是 Anysphere 的产品；Open Design 是一个独立的开源项目，把它作为一等适配器来支持。Cursor 和 Anysphere 是 Anysphere, Inc. 的商标。' },
          { name: '我的文件和凭证安全吗？', text: '安全——Open Design 本地优先。你的文件、产物和 DESIGN.md 都留在你自己的 repo 里，你的 Cursor 或模型凭证由你的 agent 直接使用，绝不经 Open Design 的服务器中转。' },
        ],
        ctaTitle: '用开放的方式，和 Cursor 一起做设计。',
        ctaBody: '带上你自己的 Cursor 账号或模型密钥，把每个文件都留在本地，并在你已经在用的 agent 外面，得到一个精选的设计库。',
        ctaActions: [
          { label: '在 Open Design 里使用 Cursor', href: '/quickstart/', variant: 'primary' },
          { label: '在 GitHub 上 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面端', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        hubLinkLabel: '查看所有支持的 agent',
      },
      aboutTitle: '什么是 Cursor',
      aboutBody: [
        'Cursor 是基于 VS Code 的 AI 优先代码编辑器，内置一个能在整个项目里改代码的 Agent。',
        'Cursor 推出了 Design Mode —— 点选某个元素、勾画一处改动，或用一句话描述，Cursor 就改底层的 React/Vue/Svelte 源码。配合 Figma MCP，它成了一个可信的设计转代码界面。',
        'Open Design 把 Cursor Agent 作为一方适配器，让它驱动结构化的开源设计流水线。',
      ],
      vendorLabel: '厂商',
      vendor: 'Cursor（Anysphere）',
      credentialLabel: '凭据',
      credential: 'Cursor 账号，使用你自己的模型凭据',
      designTitle: '用 Cursor 做设计',
      designLead:
        'Cursor 的设计生态围绕可视化编辑和 Figma 互通：',
      designPoints: [
        { label: 'Design Mode', body: '点选、勾画或说话来改 UI，Cursor 改源码 —— 由真实代码支撑的可视化编辑。' },
        { label: 'Figma → 代码', body: 'Figma MCP 把真实布局和 token 喂给 Cursor，让它按设计而非截图来构建。' },
        { label: '双向 Figma', body: '部分 MCP 让 Cursor 不只读取、还能用程序改 Figma 设计。' },
        { label: '设计转代码闭环', body: '常见范式：先在可视化工具里出稿，导入 Cursor，再用 Agent 精修和扩展。' },
      ],
      linksTitle: '实战资源',
      linksLead: '用 Cursor 做设计的发布、教程和工具：',
      withOdTitle: 'Cursor + Open Design',
      withOdLead:
        'Open Design 是围绕 Cursor 的开源设计层：精选 skill 与设计系统库、结构化渲染流水线、本地桌面 UI。',
      withOdSteps: [
        '安装 Open Design，选 Cursor Agent。',
        'Cursor 用你自己的模型密钥 —— 不经过 Open Design 中转。',
        '选一套设计系统和 skill，生成审美一致的 deck、原型和落地页。',
        '一切留在你的 repo，本地优先。',
      ],
      withOdClosing: 'Cursor 的 Agent，外加一套开放、可移植的设计工作流。',
      faqTitle: '常见问题',
      faq: [
        { name: 'Cursor 适合做设计吗？', text: '配合 Design Mode 和 Figma MCP，它改、建 UI 都不错；从零开始则更需要一套设计系统。Open Design 开箱即提供。' },
        { name: 'Open Design 会取代 Cursor 的 Design Mode 吗？', text: '不会，是互补。Open Design 在 Agent 之上加一层开放、精选的设计系统与 skill 库，以及结构化渲染流水线。' },
        { name: 'Open Design 跟 Cursor 有关联吗？', text: '没有。Cursor 是 Anysphere 的产品；Open Design 是独立开源项目，以一方适配器集成它。' },
      ],
      ctaTitle: '用开源的方式，跟 Cursor 一起设计。',
      ctaBody: '给仓库点 Star、下载桌面版，或加入社区申请新适配器。',
    },
    opencode: {
      ...INFO_PAGE_COPY.en!.agentGuides!.opencode!,
      title: 'OpenCode 做设计 — Open Design',
      description:
        '大家如何用 OpenCode 做 UI 和网页设计 —— design.md 文件、UI/UX skill、Figma MCP —— 以及 Open Design 如何把 OpenCode 变成本地优先的开源设计 Agent。',
      breadcrumb: 'OpenCode',
      label: 'Agent · OpenCode',
      heading: '用 OpenCode 做设计。',
      lead: 'OpenCode 是开源的终端 AI 编码 Agent。设计师给它挂上设计 skill 和 DESIGN.md 文件来生成真正的 UI。Open Design 把这套做成结构化的开源工作流 —— 用你自己的模型密钥，所有东西留本地。',
      tldrTitle: '一句话',
      tldrBody:
        'OpenCode 是完全开源的编码 Agent；设计是靠 skill、design.md 文件和 Figma MCP 衍生出来的用法。Open Design 在它周围打包一套精选设计系统与 skill 库，外加桌面工作流 —— 你的密钥，你的 repo。',
      toc: ['什么是 OpenCode', '用 OpenCode 做设计', '资源', '配合 Open Design', '常见问题'],
      rich: {
        heroCtaLead:
          'Open Design 把 OpenCode 变成本地优先、开源的设计 agent——用你自己选的任意模型和 provider key，用你自己的文件，外加一套精选的 skill 与设计系统库。',
        heroCtaActions: [
          { label: '在 Open Design 中使用 OpenCode', href: '/quickstart/', variant: 'primary' },
          { label: '在 GitHub 上 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面应用', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        intro: [
          'OpenCode 是一个开源、以终端为先的 AI 编码 agent，刻意做成与模型无关：你自带 provider key，在同一套工作流背后运行任意你想用的模型。这种开放性让它天然适合做设计——但和所有 agent 一样，只有当你给它正确的参考、skill 和一套验证回路时，它才能产出好的 UI。本文是一份从头到尾的实用指南，讲如何用 OpenCode 做 UI、前端和设计系统工作，以及如何把它接入 Open Design 的结构化设计工作流。',
          '内容涵盖：OpenCode 到底是什么、为什么一个与模型无关的开源 agent 适合做设计、如何从零配置、截图转 UI 的回路、AGENTS.md 与 MCP 如何扩展它、它与 Codex / Claude Code / Cursor 的对比、让 AI 产出显得套路化的那些坑，以及 Open Design 如何作为一个开源、本地优先的设计层来补上这道缺口——这是个天然的搭配，因为两个项目都是开源、都跑在你自己的机器上。',
        ],
        heroImage: {
          src: '/agents/opencode-design/opencode-design-hero.webp',
          alt: 'OpenCode 设计反馈回路：终端 TUI agent、在浏览器中渲染 UI，以及一个工作区，带一条回环反馈箭头',
          caption: '核心回路：OpenCode 在终端里构建 UI，在真实浏览器中渲染并验证，再对照你的参考反复迭代——用的是你自己选的任意模型。',
        },
        tocLabel: '本页目录',
        toc: [
          { id: 'what-is-opencode', label: 'OpenCode 究竟是什么' },
          { id: 'why-design', label: '为什么开放、任意模型的 agent 适合做设计' },
          { id: 'setup', label: '从零配置 OpenCode 做设计' },
          { id: 'screenshot-workflow', label: '截图转 UI 的工作流' },
          { id: 'extend', label: 'AGENTS.md、MCP 与可分享会话' },
          { id: 'vs', label: 'OpenCode vs Codex vs Claude Code vs Cursor' },
          { id: 'pitfalls', label: '坑，以及那种“AI 味”的观感' },
          { id: 'open-design', label: '在 Open Design 中用 OpenCode 做设计' },
          { id: 'faq', label: '常见问题' },
        ],
        sections: [
          {
            id: 'what-is-opencode',
            heading: 'OpenCode 究竟是什么',
            blocks: [
              { kind: 'p', text: 'OpenCode 是一个为终端打造的开源 AI 编码 agent，由 SST 背后的团队（Anomaly Innovations）维护。它会读取你的代码仓库、运行命令、编辑文件，并与大语言模型对话——但和被厂商绑定的 agent 不同，它本身不自带模型。你把它指向任意你想用的 provider 和模型，并自带 key。' },
              { kind: 'p', text: '它以终端界面（TUI）运行，并在同一引擎之上提供桌面应用和 IDE 扩展。底层采用客户端/服务端架构，所以真正干活的 agent 与你驱动它的界面是解耦的。它内置 build 和 plan 两个 agent，用 Tab 键切换。' },
              { kind: 'steps', items: [
                { label: '与模型无关', body: '模型和 provider 来自 models.dev 这个开放目录。你在 opencode.json 里用 provider/model-id 字符串配置，并可禁用不想加载的 provider——所以同一套设计工作流可以跑在 Anthropic、OpenAI、Google、OpenRouter、本地模型等之上。' },
                { label: '指令文件', body: 'OpenCode 会读取项目里的 AGENTS.md 文件（跨工具的通用标准，也兼容 CLAUDE.md）作为项目规则——这正是编码你设计约定的天然位置。运行 /init 即可生成一个。' },
                { label: '可扩展', body: '它支持 LSP 集成、MCP server、主题、快捷键和自定义命令，还有可分享的会话链接用于协作。' },
              ] },
              { kind: 'ul', items: [
                '维护方：SST / Anomaly Innovations（开源项目）',
                '凭证：你自己的模型 provider API key（BYOK，无厂商锁定）',
                '许可：MIT，开源',
              ] },
            ],
          },
          {
            id: 'why-design',
            heading: '为什么开放、任意模型的 agent 适合做设计',
            blocks: [
              { kind: 'p', text: 'OpenCode 不像厂商 agent 那样有某一个“设计模型”——而这恰恰是它的优势。因为与模型无关且开源，你可以在同一套设计工作流上运行当下前端最强的那个模型，之后随时更换，或退回到本地模型，全程不用改配置。' },
              { kind: 'p', text: '但光选对模型并不能买来审美。和所有编码 agent 一样，除非你给它约束，否则 OpenCode 也会产出套路化的 UI。好的设计产出来自你提供的三项输入。' },
              { kind: 'steps', items: [
                { label: '一套设计系统', body: '真实的 tokens、基础组件和约定，让 agent 复用，从而让产出贴合某个品牌，而不是退回到通用的观感。' },
                { label: '一个审美 skill', body: '一个精选的 skill，强制真正的审美——克制的动效、品牌优先的层级、最多两种字体一种强调色——并让 agent 在动手前先定一个方向。' },
                { label: '具体的参考图', body: '真实的参考图，以及多种状态（桌面和移动、hover、空态、加载态），而不是只有一张主视觉。' },
              ] },
              { kind: 'image', src: '/agents/opencode-design/opencode-design-taste-triangle.webp', alt: '展示设计系统、skill 与参考图三者汇聚成优质设计产出的示意图', caption: '审美来自你提供的三项输入：一套设计系统、一个 skill 和真实参考图——与你跑哪个模型无关。' },
              { kind: 'p', text: '结论：OpenCode 给了你模型自由，但审美仍来自一套精选的设计上下文。Open Design 恰好把这些输入打包好，这也是两者契合的原因——它们都是开源、都本地优先（下文详述）。' },
            ],
          },
          {
            id: 'setup',
            heading: '从零配置 OpenCode 做设计',
            blocks: [
              { kind: 'p', text: '下面是从一台干净的机器到一个能构建并验证 UI 的 OpenCode 的完整路径。' },
              { kind: 'code', lang: 'bash', code: '# 1. 安装 OpenCode\ncurl -fsSL https://opencode.ai/install | bash\n# 或：npm i -g opencode-ai@latest\n# 或：brew install sst/tap/opencode\n\n# 2. 在项目里启动 TUI，然后认证你的 provider\nopencode          # 然后运行 /login，选择 provider 并粘贴你的 key\n\n# 3. 生成项目上下文\nopencode          # 在项目里运行 /init 生成 AGENTS.md\n\n# 4. 选择你的模型（任意 provider，经 models.dev）\n#    在 opencode.json 里设置 "provider/model-id"，或在 TUI 里切换\n\n# 5. 添加 MCP server（可选，比如用于设计交付）\n#    在 opencode.json 的 "mcp" 字段下配置' },
              { kind: 'image', src: '/agents/opencode-design/opencode-design-setup-flow.webp', alt: '五步配置流程：安装、用你的 provider key 认证、配置 AGENTS.md、添加 skill、验证', caption: '配置顺序：安装 → 认证（你的 provider key）→ 配置 AGENTS.md → 添加 skill → 在真实浏览器中验证。' },
              { kind: 'steps', items: [
                { label: '编码你的设计规则', body: '把你的 tokens、基础组件和约定放进 AGENTS.md（或从中引用的 DESIGN.md），让产出贴合品牌而非退回通用观感。opencode.json 里的 instructions 选项可以用 glob 指向更多规则文件。' },
                { label: '选一个有能力的模型', body: '因为 OpenCode 与模型无关，可以为设计这一遍挑选当下前端最强的 provider/模型——而工作流的其余部分保持不变。' },
              ] },
            ],
          },
          {
            id: 'screenshot-workflow',
            heading: '截图转 UI 的工作流',
            blocks: [
              { kind: 'p', text: '用任何 agent 做设计，杠杆最高的回路都是：把一张参考图变成可用、响应式的 UI，并反复迭代直到匹配。同样的五步在 OpenCode 里也适用。' },
              { kind: 'ol', items: [
                '从你手头最清晰的视觉参考开始——并包含多种状态（桌面和移动、hover、空态、加载态），而不只是一张主视觉。',
                '提示词要具体；含糊的提示会产出套路化的 UI。',
                '准备好一套设计系统，并告诉 OpenCode tokens 和规范基础组件在哪里（写在 AGENTS.md 里）。',
                '跑一个 dev server，让 agent 在真实浏览器中渲染，并切换到各断点检查结果。',
                '让 OpenCode 把它的实现对照截图来迭代——而不只是确认能构建通过。',
              ] },
              { kind: 'p', text: '在 TUI 里用 @ 引用文件会对工作目录做模糊搜索，用开头的 ! 内联运行 shell 命令，用 / 命令驱动各种操作。然后用具体约束来提示：' },
              { kind: 'code', lang: 'bash', code: 'opencode\n# 在 TUI 里：\n> @reference-desktop.png @reference-mobile.png\n  用 React + Vite + Tailwind + TypeScript 实现这个设计。\n  复用 AGENTS.md 里我现有的设计系统组件和 tokens。\n  匹配间距、布局和层级；做到响应式。\n  运行 dev server，在浏览器中打开，并反复迭代\n  直到 UI 在各断点上都与参考图匹配。' },
              { kind: 'p', text: '提示词保持小而聚焦，好的迭代就提交、坏的就回退（回退时告诉 OpenCode），让每一遍都建立在一个干净的基础上。' },
            ],
          },
          {
            id: 'extend',
            heading: 'AGENTS.md、MCP 与可分享会话',
            blocks: [
              { kind: 'p', text: '三个扩展点让 OpenCode 在持续的设计工作中真正好用，而且它们都能干净地映射到一套开放的设计工作流上。' },
              { kind: 'steps', items: [
                { label: 'AGENTS.md 规则', body: '项目规则放在仓库根目录的 AGENTS.md（或全局规则放在 ~/.config/opencode/AGENTS.md）。它是你设计约定的长期归宿，每次运行都会读取，并兼容其他 agent 使用的 CLAUDE.md 文件。' },
                { label: 'MCP server', body: 'OpenCode 同时支持本地（命令）和远程（URL）MCP server，在 mcp 字段下配置——这是把设计上下文和外部工具引入进来的可移植方式，跨 agent 通用，而不只服务于 OpenCode。' },
                { label: '可分享会话', body: '/share 命令会为一段会话创建公开链接，用于协作或评审，/unshare 则收回它——很适合为一遍设计获取反馈。' },
              ] },
              { kind: 'p', text: '这些都是可移植、跨 agent 的能力——正是 Open Design 被设计来去编排的那类东西，而不是每个项目里重造一遍。' },
            ],
          },
          {
            id: 'vs',
            heading: 'OpenCode vs Codex vs Claude Code vs Cursor 做设计',
            blocks: [
              { kind: 'p', text: '设计工作没有唯一赢家——每个 agent 各有所长，有经验的团队会叠着用。一个公允的总结：' },
              { kind: 'table', columns: ['Agent', '设计强项', '最适合'], rows: [
                ['OpenCode', '开源且与模型无关；在一套终端工作流背后运行任意 provider', 'BYOK 自由、切换模型、完全开放且本地优先的配置'],
                ['Codex', '配合前端 skill 的视觉打磨能力强；图像理解', '委托式异步、沙箱化构建、可移植的 AGENTS.md 规则'],
                ['Claude Code', '具体的设计决策（hex、间距、字体）和对代码库有感知的 UX', '前端推理和大上下文重构'],
                ['Cursor', '带实时预览和内联编辑的所见即所得回路', 'IDE 内紧凑的边改边看 UI 工作'],
              ] },
              { kind: 'p', text: '社区反复得出的结论是：审美来自人——所有这些 agent 在没有 skill、参考和约束时都会退回到通用观感。这才是真正要解决的问题——它是设计工具形状的，不是模型形状的，而这恰恰说明了为什么像 OpenCode 这样的开放 agent 与一个开放的设计层配合得如此之好。' },
            ],
          },
          {
            id: 'pitfalls',
            heading: '坑，以及如何避开那种“AI 味”观感',
            blocks: [
              { kind: 'p', text: '对 AI 生成设计最常见的吐槽是它看起来很套路——柔和渐变、悬浮面板、过大的圆角、夸张的阴影，一种 Inter 字体加紫色的味道，“一看就是 AI 做的”。其他被报告的问题还包括移动端布局错乱、指令文字漏进了 UI 文案。这些都不是 OpenCode 独有的；它们是任何 agent 在缺少精选设计上下文时都会发生的事。' },
              { kind: 'steps', items: [
                { label: '加一个审美 skill', body: '一个精选的设计 skill 会强制 agent 定下一个真正的方向，而不是默认观感。' },
                { label: '在真实浏览器中验证', body: '让它跨断点渲染并自检，这样布局就不会在移动端悄悄崩掉。' },
                { label: '提供 tokens 和参考', body: '真实的设计 tokens 和参考截图是对产出质量影响最大的单一杠杆。' },
                { label: '把规则写进 AGENTS.md', body: '把“不要 hero 卡片、最多两种字体、品牌优先层级”这类规则放在 agent 每次都会读到的地方。' },
              ] },
              { kind: 'p', text: '注意到了吗：每一项缓解措施都是关于给 agent 一套精选的设计上下文——无论你跑哪个模型。靠手工逐项目维护这套上下文，正是 Open Design 帮你免除的苦活。' },
            ],
          },
          {
            id: 'open-design',
            heading: '在 Open Design 中用 OpenCode 做设计',
            blocks: [
              { kind: 'p', text: 'Open Design 正是上面那套工作流一直在呼唤的开源设计层。它把 OpenCode 当作一等适配器，并为它套上一套精选的 skill 与设计系统库、一条结构化的渲染管线，以及一个本地桌面 UI——让那些让任何 agent 变好的设计上下文从第一次运行就在那里，而不是每次都手工拼凑。两个项目都是开源、都本地优先，这让它们的搭配水到渠成。' },
              { kind: 'ol', items: [
                '安装 Open Design，并选择 OpenCode 作为你的 agent。',
                '用你自己的模型 provider API key（BYOK）认证——凭证留在你的机器上，绝不经我们代理。',
                '选择任意 provider 和模型，再加上一套设计系统和一个 skill，然后生成审美一致的 deck、原型和落地页。',
                '每个产物和 DESIGN.md 文件都存在你自己的仓库里，而不是托管云端。',
              ] },
              { kind: 'p', text: '同一个 OpenCode agent、同样的模型自由——外加一套真正可移植、开源的设计工作流。它本地优先、采用 Apache-2.0 许可，所以你的工作和凭证都不会离开你的机器。' },
            ],
          },
        ],
        faqTitle: '常见问题',
        faq: [
          { name: 'OpenCode 真的能做设计吗？', text: '能——当上下文里有审美 skill、设计系统和真实参考图时，OpenCode 能产出生产级、响应式的 UI，并能在浏览器中验证。因为它与模型无关，你可以运行当下前端最强的那个模型。缺少这套精选上下文时，它会倾向于退回到通用观感，而这正是 Open Design 补上的缺口。' },
          { name: '用 OpenCode 做设计该选哪个模型？', text: '你喜欢哪个都行——OpenCode 经 models.dev 与 provider 无关，所以你可以在同一套工作流背后运行 Anthropic、OpenAI、Google、OpenRouter 或本地模型，并随时切换。设计产出的质量更多取决于你的 skill、设计系统和参考，而非单看模型。' },
          { name: 'Open Design 是 OpenCode（SST）团队做的吗？', text: '不是。Open Design 是一个独立的开源项目，把 OpenCode 集成为一个 agent。它用一套本地优先、开源的 skill 与设计系统库来补足 OpenCode。' },
          { name: '用 OpenCode 做设计需要什么特殊订阅吗？', text: '不需要——OpenCode 是 BYOK。你自带模型 provider 的 API key，Open Design 绝不代理你的凭证，也没有厂商锁定。' },
          { name: '前端设计选 OpenCode、Codex 还是 Claude Code？', text: '都很强，很多团队会叠着用。OpenCode 的优势在于完全开源且与模型无关；Codex 擅长委托式、沙箱化构建；Claude Code 以具体、对代码库有感知的设计决策著称。Open Design 让你切换 agent 而不改变你的设计工作流。' },
          { name: '如何为设计上下文扩展 OpenCode？', text: '把规则写进 AGENTS.md，在 mcp 字段下添加 MCP server 以引入可移植工具和设计上下文，并用可分享会话来做评审。Open Design 直接提供一套精选的 skill 与设计系统库，让你省去逐项目的配置。' },
          { name: 'Open Design 与 OpenCode 或 SST 有关联吗？', text: '没有。OpenCode 是由 SST（Anomaly Innovations）维护的开源项目；Open Design 是一个独立的开源项目，把它作为一等适配器来支持。' },
          { name: '我的文件和凭证安全吗？', text: '安全——Open Design 本地优先。你的文件、产物和 DESIGN.md 都留在你自己的仓库里，你的模型 provider 凭证由你的 agent 直接使用，绝不经 Open Design 服务器中转。' },
        ],
        ctaTitle: '用开放的方式，借 OpenCode 做设计。',
        ctaBody: '自带你的模型 provider key，把每个文件留在本地，并为你已经在用的这个开放 agent 套上一套精选的设计库。',
        ctaActions: [
          { label: '在 Open Design 中使用 OpenCode', href: '/quickstart/', variant: 'primary' },
          { label: '在 GitHub 上 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面应用', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        hubLinkLabel: '查看所有支持的 agent',
      },
      aboutTitle: '什么是 OpenCode',
      aboutBody: [
        'OpenCode 是开源（MIT）的终端 AI 编码 Agent —— 一个 TUI 加桌面、IDE 界面 —— 由 Anomaly（SST 团队）维护，仓库在 github.com/anomalyco/opencode。',
        '它是编码 Agent，不是专门的设计工具。设计是靠给它加 skill、DESIGN.md 系统文件，以及 Figma／可视画布 MCP 来控制视觉输出实现的。',
        'Open Design 把 OpenCode 作为一方适配器，把这些零散范式变成结构化的开放设计流水线。',
      ],
      vendorLabel: '厂商',
      vendor: 'Anomaly（开源，MIT）',
      credentialLabel: '凭据',
      credential: '通过 OpenCode 配置接入模型凭据（BYOK）',
      designTitle: '用 OpenCode 做设计',
      designLead:
        'OpenCode 社区靠配置和 skill 给 Agent 喂「审美」：',
      designPoints: [
        { label: 'design.md 系统', body: '把品牌 DESIGN.md（Stripe/Linear/Airbnb 风格规则）放进项目，让 OpenCode 生成匹配的 UI。' },
        { label: 'UI/UX skill', body: '设计智能 skill 带来几十种 UI 风格和配色，在写代码前先生成一套设计系统。' },
        { label: 'Figma 与可视画布 MCP', body: '通过 MCP 接 Figma 或可视画布，形成设计转代码闭环。' },
        { label: '模型审美', body: '因为 OpenCode 是 BYOK，你可以挑最对你审美和预算的模型。' },
      ],
      linksTitle: '实战资源',
      linksLead: '用 OpenCode 做设计的 skill、design.md 合集和教程：',
      withOdTitle: 'OpenCode + Open Design',
      withOdLead:
        'Open Design 是围绕 OpenCode 的开源设计层：精选 skill 与设计系统库、结构化渲染流水线、本地桌面 UI —— 不用再手工拼 design.md 和 skill。',
      withOdSteps: [
        '安装 Open Design，选 OpenCode 作为你的 Agent。',
        'OpenCode 通过它自己的配置用你的模型密钥（BYOK）—— 不经过中转。',
        '选一套设计系统和 skill，生成审美一致的 deck、原型和落地页。',
        '两个项目都开源、本地优先 —— 你的文件永不离开你的机器。',
      ],
      withOdClosing: '两个开源 Agent，一套本地优先的设计工作流。',
      faqTitle: '常见问题',
      faq: [
        { name: '是哪个 OpenCode？', text: '是 github.com/anomalyco/opencode 这个开源终端 Agent（原 sst/opencode），由 Anomaly 维护。别跟同名工具混淆。' },
        { name: 'OpenCode 能做 UI 设计吗？', text: '能，给它 design.md 文件和 UI/UX skill 上下文即可。Open Design 提供精选的两者库，省去手工搭建。' },
        { name: 'Open Design 跟 OpenCode 是同一个项目吗？', text: '不是。两者都开源，但是独立项目。Open Design 把 OpenCode 作为一方 Agent 适配器集成。' },
      ],
      ctaTitle: '用开源的方式，跟 OpenCode 一起设计。',
      ctaBody: '给仓库点 Star、下载桌面版，或加入社区申请新适配器。',
    },
    gemini: {
      title: '用 Gemini CLI 做设计 — Open Design',
      description:
        '设计师如何用 Google 的 Gemini CLI 做 UI 与网页设计——它的多模态图像理解、1M token 上下文、GEMINI.md 与 MCP——以及 Open Design 如何把它变成一个本地优先、开源的设计 agent。',
      breadcrumb: 'Gemini CLI',
      label: 'Agent · Gemini CLI',
      heading: '用 Gemini CLI 做设计。',
      lead: 'Gemini CLI 是 Google 的开源终端 agent。它的多模态模型能读截图，1M token 上下文能装下整套设计系统，这让它成为一个真正能用的设计工具——前提是你给它参考、约定和一套验证回路。Open Design 把它接进开源设计工作流：用你的 Google 账号或 API key、你自己的文件、本地优先。',
      tldrTitle: 'TL;DR',
      tldrBody:
        'Gemini CLI 凭强多模态理解和超大上下文把参考图变成响应式 UI，用 Google 账号即可免费起步。Open Design 在它外面套一套精选的设计系统与 skill 库 + 桌面工作流——BYOK，一切留本地。',
      toc: ['什么是 Gemini CLI', '用 Gemini CLI 做设计', '资源', '配合 Open Design', '常见问题'],
      rich: {
        heroCtaLead:
          'Open Design 把 Gemini CLI 变成一个本地优先、开源的设计 agent——用你的 Google 账号或 Gemini API key、你自己的文件，外加一套精选的 skill 与设计系统库。',
        heroCtaActions: [
          { label: '在 Open Design 里使用 Gemini CLI', href: '/quickstart/', variant: 'primary' },
          { label: '在 GitHub 上 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面端', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        intro: [
          'Gemini CLI 是 Google 为终端打造的开源 AI agent。有两点让它在设计上格外有意思：它的模型是原生多模态的，能读一张截图并对布局、间距、层级做推理；它的上下文窗口可达 1M token，能一次装下整套设计系统和代码库。配上对的参考、约定和验证回路，它能构建真正的响应式 UI——而且用 Google 账号即可免费起步。这是一份从头到尾、可落地的指南，讲如何用 Gemini CLI 做 UI、前端和设计系统工作，并把它接入 Open Design 的结构化设计工作流。',
          '内容涵盖：Gemini CLI 到底是什么、为什么它的多模态模型与超大上下文适合做设计、如何从零配置、截图转 UI 的回路、GEMINI.md 与 MCP 如何扩展它、它与 Codex / Claude Code / Cursor 的对比、让 AI 产出显得套路化的那些坑，以及 Open Design 如何作为一个开源、本地优先的设计层补上这道缺口——这是个天然搭配，因为两者都开源、都跑在你自己机器上。',
        ],
        heroImage: {
          src: '/agents/gemini-design/gemini-design-hero.webp',
          alt: 'Gemini CLI 设计反馈回路：读参考图的终端 agent、渲染 UI 的浏览器，以及一个工作区，带一条回环反馈箭头',
          caption: '核心回路：Gemini CLI 在终端里读取你的参考，在真实浏览器中构建并验证 UI，再对照参考迭代——而且整套设计系统都在上下文里。',
        },
        tocLabel: '本页目录',
        toc: [
          { id: 'what-is-gemini-cli', label: 'Gemini CLI 到底是什么' },
          { id: 'why-design', label: '为什么多模态 + 超大上下文适合做设计' },
          { id: 'setup', label: '从零配置 Gemini CLI 做设计' },
          { id: 'screenshot-workflow', label: '截图转 UI 的工作流' },
          { id: 'extend', label: 'GEMINI.md、MCP 与扩展' },
          { id: 'vs', label: 'Gemini CLI vs Codex vs Claude Code vs Cursor' },
          { id: 'pitfalls', label: '常见坑与“AI 味”观感' },
          { id: 'open-design', label: '在 Open Design 里用 Gemini CLI 做设计' },
          { id: 'faq', label: '常见问题' },
        ],
        sections: [
          {
            id: 'what-is-gemini-cli',
            heading: 'Gemini CLI 到底是什么',
            blocks: [
              { kind: 'p', text: 'Gemini CLI 是 Google 为终端发布的开源（Apache-2.0）AI agent。它读取你的代码仓库、编辑文件、运行 shell 命令、抓取网页，还能用 Google 搜索为答案做事实接地——从自然语言任务出发去规划并验证，而不只是补全几行。同一个引擎也驱动 VS Code 里的 Gemini Code Assist agent。' },
              { kind: 'p', text: '对设计工作而言，有两个特性突出。它的模型原生多模态，所以你把一张截图交给它，它是对着真实布局在推理。它的上下文窗口可达 1M token，大到能一次装下你的整套设计系统、组件库和参考集，而不必把它们摘要掉。' },
              { kind: 'steps', items: [
                { label: '上下文文件', body: 'Gemini CLI 读取 GEMINI.md 作为持久项目上下文——这正是写入设计约定、token 与审阅清单的天然位置。个人与团队设置可叠加其上。' },
                { label: '内置工具 + MCP', body: '它开箱自带文件、shell、网页抓取和 Google 搜索工具，并支持 MCP server（在 ~/.gemini/settings.json 里配置）以引入外部上下文，比如一个实时 Figma 文件。' },
                { label: '免费起步', body: '用个人 Google 账号登录即可获得相当慷慨的 Gemini 免费额度；你也可以自带 Gemini API key 或用 Vertex AI。' },
              ] },
              { kind: 'ul', items: [
                '厂商：Google',
                '凭证：Google 账号（免费额度）或来自 AI Studio 的 Gemini API key（BYOK）或 Vertex AI',
                '许可：Apache-2.0，开源',
              ] },
            ],
          },
          {
            id: 'why-design',
            heading: '为什么多模态模型与超大上下文适合做设计',
            blocks: [
              { kind: 'p', text: 'Gemini CLI 在设计上的优势来自两个模型特性——但和所有 agent 一样，审美仍需你来提供。' },
              { kind: 'steps', items: [
                { label: '强多模态理解', body: '因为 Gemini 模型原生多模态，agent 能很好地读参考截图——把它渲染出的产出对照一张图来比对，而不是从文字描述里猜。' },
                { label: '1M token 上下文窗口', body: '大上下文意味着整套设计系统、token 和许多参考状态能一次性塞进去，于是 agent 复用你真实的基础元件，而不是另造一次性样式。' },
                { label: 'GEMINI.md 里的约定', body: '一份 GEMINI.md（加上 Figma MCP server）把 agent 指向你的 token、组件和真实规格，让它对着品牌工作，而不是默认观感。' },
              ] },
              { kind: 'image', src: '/agents/gemini-design/gemini-design-taste-triangle.webp', alt: '展示设计系统、skill 与参考图三者汇聚成优质设计产出的示意图', caption: '审美来自你提供的三种输入：一套设计系统、一个 skill，以及真实的参考图。' },
              { kind: 'p', text: '结论和每个 agent 教给我们的一样：Gemini CLI 默认并没有审美。只有当你给它约束——一套设计系统、一个审美 skill、具体的参考——它才能产出好设计。Open Design 打包的正是这些输入，这也是两者天然契合的原因（下文详述）。' },
            ],
          },
          {
            id: 'setup',
            heading: '从零把 Gemini CLI 配置成能做设计',
            blocks: [
              { kind: 'p', text: '下面是从一台干净机器，到一个能构建并验证 UI 的 Gemini CLI 的完整路径。' },
              { kind: 'code', lang: 'bash', code: '# 1. 安装 Gemini CLI（需 Node 20+）\nnpm install -g @google/gemini-cli\n# 或免安装运行：npx https://github.com/google-gemini/gemini-cli\n\n# 2. 在你的项目里启动，首次运行时认证\ncd your-project\ngemini            # 用 Google 账号登录，或设置 GEMINI_API_KEY\n\n# 3. 生成项目上下文\n/init             # 为本项目生成 GEMINI.md\n\n# 4. 接入 Figma MCP server（可选，用于设计交付）\n#    在 ~/.gemini/settings.json 的 "mcpServers" 下添加' },
              { kind: 'image', src: '/agents/gemini-design/gemini-design-setup-flow.webp', alt: '五步配置流程：安装、认证、配置 GEMINI.md、添加 skill、验证', caption: '配置顺序：安装 → 认证 → 配置 GEMINI.md → 添加 skill → 启用浏览器验证。' },
              { kind: 'steps', items: [
                { label: '把设计规则写进去', body: '把你的 token、基础元件和约定放进 GEMINI.md 并让 Gemini 指向它们，这样产出会贴合品牌，而不是退回到泛泛的样子。' },
                { label: '加上浏览器验证', body: '接入 Playwright 或浏览器 MCP，让 Gemini 在真实浏览器里渲染，并跨断点检查产出，而不仅仅确认构建通过。' },
              ] },
            ],
          },
          {
            id: 'screenshot-workflow',
            heading: '截图转 UI 的工作流',
            blocks: [
              { kind: 'p', text: '用 Gemini CLI 做设计、杠杆最高的回路，是把一张参考图变成能跑、且响应式的 UI，并迭代到匹配为止——靠多模态模型把产出对照参考来比对。' },
              { kind: 'ol', items: [
                '从你手上最清晰的视觉参考开始——并且要包含多种状态（桌面与移动、hover、空态、加载态），而不只是一张主视觉。',
                '提示要具体；即便是强模型，含糊的提示也只会产出泛泛的 UI。',
                '把你的设计系统与约定放进 GEMINI.md，并告诉 Gemini token 与标准基础元件在哪里。',
                '跑一个 dev server，让 Gemini 在真实浏览器中渲染，并切到各断点检查结果。',
                '通过让 Gemini 把它的实现对照截图来迭代——而不只是确认能构建通过。',
              ] },
              { kind: 'p', text: '用 @ 引用一张图片把它附到提示里，然后用具体约束给出提示：' },
              { kind: 'code', lang: 'bash', code: 'gemini\n# 在提示里：\n> @reference-desktop.png @reference-mobile.png\n  用 React + Vite + Tailwind + TypeScript 实现这个设计。\n  复用 GEMINI.md 里我现有的设计系统组件和 token。\n  匹配间距、布局和层级；做成响应式。\n  在浏览器中渲染，并迭代到 UI 在各断点上都与参考一致。' },
              { kind: 'p', text: '提示保持小而聚焦，好的迭代就提交、坏的就回退（回退时告诉 Gemini 一声），让每一轮都建立在干净的基础上。' },
            ],
          },
          {
            id: 'extend',
            heading: 'GEMINI.md、MCP 与扩展',
            blocks: [
              { kind: 'p', text: '三个扩展点让 Gemini CLI 在持续的设计工作中真正好用，而且它们都能干净地映射到一套开放的设计工作流上。' },
              { kind: 'steps', items: [
                { label: 'GEMINI.md 上下文', body: '项目规则放在仓库根目录的 GEMINI.md（还有全局与团队层）。它是你设计约定的长期归宿，每次运行都会读取。' },
                { label: 'MCP server', body: '在 ~/.gemini/settings.json 下配置 MCP server——这是把设计上下文和外部工具（最相关的是 Figma MCP server）引入进来的可移植方式，跨 agent 通用，而不只服务于 Gemini。' },
                { label: '扩展与内置工具', body: 'Gemini CLI 的扩展，以及它内置的 Google 搜索、文件、shell、网页抓取工具，让它能在不离开终端的情况下收集参考、跑完验证回路。' },
              ] },
              { kind: 'p', text: '这些都是可移植、跨 agent 的能力——正是 Open Design 被设计来去编排的那类东西，而不是每个项目里重造一遍。' },
            ],
          },
          {
            id: 'vs',
            heading: 'Gemini CLI vs Codex vs Claude Code vs Cursor 做设计',
            blocks: [
              { kind: 'p', text: '做设计没有唯一赢家——每个 agent 各有所长，有经验的团队会把它们叠着用。一个公允的总结：' },
              { kind: 'table', columns: ['Agent', '设计强项', '最适合'], rows: [
                ['Gemini CLI', '强多模态图像理解 + 1M token 上下文；开源且有免费额度', '截图密集的工作，以及把整套设计系统装进上下文'],
                ['Codex', '配上前端 skill 后视觉打磨强；沙箱化异步构建', '托管式异步构建，以及可移植的 AGENTS.md 规则'],
                ['Claude Code', '具体的设计决策（hex、间距、字体）和懂代码库的 UX', '前端推理与大上下文重构'],
                ['Cursor', '带实时预览与行内编辑的“边写边看”回路', 'IDE 里“边迭代边看”的紧凑 UI 工作'],
              ] },
              { kind: 'p', text: '社区反复得出的结论是：审美来自人。它们在没有 skill、参考和约束时都会退回到一个泛泛的样子。那才是真正要解决的问题——而它是“设计工具”形状的，不是“模型”形状的。' },
            ],
          },
          {
            id: 'pitfalls',
            heading: '常见坑，以及如何避开“AI 味”观感',
            blocks: [
              { kind: 'p', text: '对 AI 生成设计最常见的抱怨，是它看着很泛——柔和渐变、悬浮面板、过大的圆角、夸张阴影，一股“Inter 字体加紫色”的味道，“一看就是 AI 做的”。其他被反映的问题还包括移动端布局错乱、指令文字泄漏进 UI 文案里。这些都不是 Gemini CLI 独有的；它们是任何 agent 在缺少精选设计上下文时都会发生的事。' },
              { kind: 'steps', items: [
                { label: '加一个审美 skill', body: '一个精选的设计 skill 会逼 agent 选定一个真实方向，而不是用默认那套。' },
                { label: '在真实浏览器里验证', body: '用多模态模型跨断点渲染并自检，这样布局就不会在移动端悄悄崩掉。' },
                { label: '提供 token 和参考', body: '真实的设计 token 和参考截图，是对产出质量影响最大的那个杠杆。' },
                { label: '把规则写进 GEMINI.md', body: '把“不要 hero 卡片、最多两种字体、品牌优先层级”这类规则，放在 agent 每次都会读到的地方。' },
              ] },
              { kind: 'p', text: '注意到没有：每一条缓解措施都是在给 agent 一份精选的设计上下文。逐个项目、用手去维护这份上下文，正是 Open Design 帮你省掉的苦活。' },
            ],
          },
          {
            id: 'open-design',
            heading: '在 Open Design 里用 Gemini CLI 做设计',
            blocks: [
              { kind: 'p', text: 'Open Design 就是上面这套工作流一直在要的那一层开源设计层。它把 Gemini CLI 当作一等适配器，外面裹上一个精选的 skill 与设计系统库、一条结构化的渲染流水线，以及一个本地桌面端 UI——让那份让 Gemini 变好用的设计上下文，从第一次运行就在那儿，而不是每次都手工拼。两者都开源、都本地优先，这让搭配水到渠成。' },
              { kind: 'ol', items: [
                '安装 Open Design，选 Gemini CLI 作为你的 agent。',
                '用你的 Google 账号或 Gemini API key（BYOK）认证——凭证留在你的机器上，绝不经我们代理。',
                '挑一套设计系统和一个 skill，然后生成审美一致的演示稿、原型和落地页。',
                '每一份产物和 DESIGN.md 都存在你自己的 repo 里，而不是某个托管云。',
              ] },
              { kind: 'p', text: '同一个 Gemini CLI agent、同一把密钥——外面再加一套真实、可移植、开源的设计工作流。它本地优先、Apache-2.0 授权，所以你的工作和凭证没有任何东西会离开你的机器。' },
            ],
          },
        ],
        faqTitle: '常见问题',
        faq: [
          { name: 'Gemini CLI 真的能做设计吗？', text: '能——只要上下文里有一个审美 skill、一套设计系统和真实参考图，Gemini CLI 就能产出生产级、响应式的 UI，而它的强多模态模型会把产出对照参考做验证。缺了这份上下文，它就容易退回到泛泛的样子，而这正是 Open Design 补齐的缺口。' },
          { name: '用 Gemini CLI 做设计要付费吗？', text: '不一定——用 Google 账号登录就有相当慷慨的免费额度，你也可以自带 Gemini API key（BYOK）或用 Vertex AI。无论哪种方式，Open Design 都不会代理你的凭证。' },
          { name: 'Gemini CLI 在设计上具体强在哪？', text: '两点：它的模型强多模态，能很好地读参考截图；它的 1M token 上下文能一次装下整套设计系统和参考集。这都有帮助——但审美仍来自你提供的设计系统、skill 和参考。' },
          { name: '前端设计选 Gemini CLI 还是 Claude Code？', text: '两者都很强。Claude Code 以具体、懂代码库的设计决策著称；Gemini CLI 的优势是多模态理解加超大上下文和免费额度。很多团队两个都用——Open Design 让你切换 agent 时无需改动设计工作流。' },
          { name: '怎么把 Gemini CLI 连到 Figma？', text: '在 ~/.gemini/settings.json 的 mcpServers 下加上 Figma MCP server。Gemini 就能拉取真实的设计上下文——组件、变量、布局数据——让生成的代码贴合源设计，而不是近似。' },
          { name: 'Open Design 和 Google 有关联吗？', text: '没有。Gemini CLI 是 Google 的产品；Open Design 是一个独立的开源项目，把它作为一等适配器来支持。Gemini 是 Google 的商标。' },
          { name: '我的文件和凭证安全吗？', text: '安全——Open Design 本地优先、Apache-2.0。你的文件、产物和 DESIGN.md 都留在你自己的 repo 里，你的 Google 凭证由你的 agent 直接使用，绝不经 Open Design 的服务器中转。' },
        ],
        ctaTitle: '用开放的方式，和 Gemini CLI 一起做设计。',
        ctaBody: '带上你自己的 Google 账号或 Gemini API key，把每个文件都留在本地，并在你已经在用的 agent 外面，得到一个精选的设计库。',
        ctaActions: [
          { label: '在 Open Design 里使用 Gemini CLI', href: '/quickstart/', variant: 'primary' },
          { label: '在 GitHub 上 Star', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          { label: '下载桌面端', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
        ],
        hubLinkLabel: '查看所有支持的 agent',
      },
      aboutTitle: '什么是 Gemini CLI',
      aboutBody: [
        'Gemini CLI 是 Google 的开源（Apache-2.0）终端 AI agent。它读取代码库、编辑文件、运行命令、抓取网页，并用 Google 搜索为答案做事实接地。',
        '它的模型原生多模态，上下文窗口达 1M token，因此能读参考截图、一次性装下整套设计系统。',
        'Open Design 把 Gemini CLI 当作一等适配器，让它接入一条结构化、开源的设计流水线。',
      ],
      vendorLabel: '厂商',
      vendor: 'Google',
      credentialLabel: '凭证',
      credential: 'Google 账号（免费额度）或 Gemini API key（BYOK）',
      designTitle: '用 Gemini CLI 做设计',
      designLead: 'Gemini CLI 的设计强项围绕它的模型与上下文：',
      designPoints: [
        { label: '多模态截图 → UI', body: '强图像理解把参考图变成响应式标记，并对照它检查结果。' },
        { label: '1M token 上下文', body: '整套设计系统、组件库和参考集一次装下，产出复用你真实的基础元件。' },
        { label: 'GEMINI.md + MCP', body: '上下文文件承载你的约定；Figma MCP server 把真实设计上下文带进代码。' },
        { label: '开源且免费起步', body: 'Apache-2.0，用 Google 账号有慷慨免费额度，也可经 Gemini API BYOK。' },
      ],
      linksTitle: '真实资源',
      linksLead: 'Gemini CLI 的官方仓库与文档：',
      links: [
        { label: 'google-gemini/gemini-cli（GitHub）', href: 'https://github.com/google-gemini/gemini-cli', source: 'GitHub · Google' },
        { label: '官方发布：Introducing Gemini CLI', href: 'https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-cli-open-source-ai-agent/', source: 'Blog · Google' },
        { label: 'Gemini CLI 文档', href: 'https://google-gemini.github.io/gemini-cli/', source: 'Docs · Google' },
      ],
      withOdTitle: 'Gemini CLI + Open Design',
      withOdLead:
        'Open Design 是 Gemini CLI 外面那层开源设计层：精选的 skill 与设计系统库、结构化渲染流水线，以及本地桌面端 UI。',
      withOdSteps: [
        '安装 Open Design，选 Gemini CLI 作为你的 agent。',
        '用你的 Google 账号或 Gemini API key（BYOK）认证——凭证留在你的机器上。',
        '挑一套设计系统和 skill，然后生成审美一致的演示稿、原型和落地页。',
        '产物和 DESIGN.md 都存在你自己的 repo 里，而非托管云。',
      ],
      withOdClosing:
        '同一个 Gemini CLI agent——外面加一套真实、可移植的设计工作流。',
      faqTitle: '常见问题',
      faq: [
        { name: 'Open Design 是 Google 做的吗？', text: '不是。Gemini CLI 是 Google 的产品；Open Design 是一个独立的开源项目，把它作为一等适配器集成进来。' },
        { name: '要付费吗？', text: '不一定——Google 账号有免费额度，也可自带 Gemini API key（BYOK）。Open Design 不代理你的凭证。' },
        { name: 'Open Design 和 Google 有关联吗？', text: '没有。Open Design 独立；Gemini 是 Google 的商标。' },
      ],
      ctaTitle: '用开放的方式，和 Gemini CLI 一起做设计。',
      ctaBody: '给仓库点 Star、下载桌面版，或加入社区申请新适配器。',
    },
    copilot: {
      title: "用 GitHub Copilot CLI 做设计 — Open Design",
      description: "人们如何用 GitHub Copilot CLI 做 UI 和网页设计——它原生于终端的编码 agent、自定义指令文件、MCP 支持以及多模型选择——以及 Open Design 如何把 Copilot CLI 变成一个本地优先、开源的设计 agent。",
      breadcrumb: "GitHub Copilot CLI",
      label: "Agent · GitHub Copilot CLI",
      heading: "用 GitHub Copilot CLI 做设计。",
      lead: "GitHub Copilot CLI 是 GitHub 原生于终端的编码 agent。它能在整个仓库范围内规划与编辑，从 Claude、GPT 等前沿模型中任选其一，并读取你的仓库指令——这让它在你提供了参考、规范和验证闭环之后，成为一个真正的设计工具。Open Design 把它接入开源的设计工作流：用你的 GitHub Copilot 订阅、你的文件，本地优先。",
      tldrTitle: "TL;DR",
      tldrBody: "Copilot CLI 在终端里把参考图和自然语言任务变成响应式 UI，支持模型选择和深度的 GitHub 集成——用你现有的 Copilot 订阅即可。Open Design 为它配上一套精选的设计系统与 skill 库以及桌面工作流，并把一切都留在本地。",
      toc: ["什么是 GitHub Copilot CLI", "用 Copilot CLI 做设计", "资源", "搭配 Open Design", "常见问题"],
      rich: {"heroCtaLead": "Open Design 把 GitHub Copilot CLI 变成一个本地优先、开源的设计 agent——你的 GitHub Copilot 订阅、你的文件，外加围绕它的一套精选 skill 与设计系统库。", "heroCtaActions": [{"label": "在 Open Design 中使用 Copilot CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["GitHub Copilot CLI 是 GitHub 原生于终端的编码 agent——与驱动 Copilot 编码 agent 的同一套 agentic 框架，被搬到了你的命令行。有两点让它对设计尤其有意思：它会读取你的仓库指令和 AGENTS.md，因此你的设计规范每次运行都会随 agent 一起生效；同时它允许你按任务在 Anthropic、OpenAI 和 Google 的前沿模型之间任选其一，从而挑出对某个 UI 推理最佳的那个。配上恰当的参考、规范和验证闭环，它能构建真正可用的响应式 UI——而且它跑在你可能已经拥有的 Copilot 订阅上。这是一份关于如何用 Copilot CLI 做 UI、前端和设计系统工作，并把它接入 Open Design 结构化设计工作流的实用端到端指南。", "本文涵盖：Copilot CLI 究竟是什么、为什么仓库指令和模型选择契合设计、如何从零开始配置它、截图转 UI 的闭环、自定义指令和 MCP 如何扩展它、它与 Codex、Claude Code、Cursor 和 Gemini CLI 的对比、那些让 AI 输出显得千篇一律的陷阱，以及 Open Design 如何作为一个开放、本地优先的设计层来弥合差距——你的订阅和凭证留在你自己的机器上，你的产物留在你自己的仓库里。"], "heroImage": {"src": "/agents/copilot-design/copilot-design-hero.webp", "alt": "GitHub Copilot CLI 设计反馈闭环：一个终端 agent 读取参考图，一个浏览器渲染 UI，加上一个工作区，还有一条反馈箭头回环", "caption": "核心闭环：Copilot CLI 在终端里读取你的参考，在真实浏览器中构建并验证 UI，然后对照参考迭代——你的设计规范则放在仓库指令里。"}, "tocLabel": "本页内容", "toc": [{"id": "what-is-copilot", "label": "GitHub Copilot CLI 究竟是什么"}, {"id": "why-design", "label": "为什么指令 + 模型选择契合设计"}, {"id": "setup", "label": "从零开始为设计配置 Copilot CLI"}, {"id": "screenshot-workflow", "label": "截图转 UI 的工作流"}, {"id": "extend", "label": "自定义指令、MCP 与扩展"}, {"id": "vs", "label": "Copilot CLI 对比 Codex、Claude Code、Cursor、Gemini CLI"}, {"id": "pitfalls", "label": "陷阱与“AI 流水线感”的观感"}, {"id": "open-design", "label": "在 Open Design 中用 Copilot CLI 做设计"}, {"id": "faq", "label": "常见问题"}], "sections": [{"id": "what-is-copilot", "heading": "GitHub Copilot CLI 究竟是什么", "blocks": [{"kind": "p", "text": "GitHub Copilot CLI 是 GitHub 原生于终端的编码 agent。它读取你的仓库、编辑文件、运行 shell 命令，并直接结合你的 GitHub 上下文——issue、pull request 和仓库——用你现有的 GitHub 账号鉴权。它由与 GitHub Copilot 编码 agent 同一套 agentic 框架驱动，因此能规划复杂任务并迭代，而不只是补全代码行。它在 2025 年 9 月开启公开预览后，于 2026 年 2 月正式全面上线。"}, {"kind": "p", "text": "对设计工作而言，有两点尤为突出。它会读取自定义指令文件——位于 .github/copilot-instructions.md 的仓库级规则以及 AGENTS.md——因此你的设计规范每次运行都会被自动纳入。它还支持多家基础模型提供方，因此你可以用 /model 命令按任务切换到对某个 UI 推理最佳的那个模型。"}, {"kind": "steps", "items": [{"label": "指令文件", "body": "Copilot CLI 会读取 .github/copilot-instructions.md 中的仓库指令、.github/instructions 下的路径专属文件，以及 AGENTS.md——这是为你的设计规范、tokens 和评审清单编码的天然之处。"}, {"label": "内置工具 + MCP", "body": "它内置了 GitHub 的 MCP server，并运行文件和 shell 工具，你还可以用 /mcp add 添加自定义 MCP server（配置存于 ~/.copilot 下的 mcp-config.json），以引入诸如实时 Figma 文件这样的外部上下文。"}, {"label": "模型选择", "body": "用 /model 命令在 Anthropic、OpenAI 和 Google 的前沿模型之间任选其一——按任务切换，全部跑在你现有的 Copilot 订阅上。"}]}, {"kind": "ul", "items": ["厂商：GitHub", "凭证：一个有效的 GitHub Copilot 订阅（Pro、Pro+、Business 或 Enterprise）", "安装：npm install -g @github/copilot，然后运行 copilot"]}]}, {"id": "why-design", "heading": "为什么仓库指令和模型选择契合设计", "blocks": [{"kind": "p", "text": "Copilot CLI 的设计优势来自两点——但和每个 agent 一样，审美仍需由你提供。"}, {"kind": "steps", "items": [{"label": "随仓库一起流转的规范", "body": "因为 Copilot CLI 会自动读取 .github/copilot-instructions.md 和 AGENTS.md，你的 tokens、基础组件和评审规则每次运行都在上下文里——agent 是面向一个品牌而非默认观感来工作。"}, {"label": "按任务挑对模型", "body": "在 Anthropic、OpenAI 和 Google 之间做模型选择，意味着你可以为某个布局选用推理最佳的模型，再为下一个任务切换——而无需改变你的工作流。"}, {"label": "通过 MCP 接入真实规格", "body": "内置的 GitHub MCP server 加上 Figma MCP server，把 agent 指向你的 tokens、组件和真实规格，于是它从源头构建，而不是近似猜测。"}]}, {"kind": "image", "src": "/agents/copilot-design/copilot-design-taste-triangle.webp", "alt": "示意图：设计系统、skill 和参考图汇聚成优秀的设计输出", "caption": "审美来自你提供的三项输入：一套设计系统、一个 skill，以及真实的参考图。"}, {"kind": "p", "text": "这个教训和每个 agent 给我们的一样：Copilot CLI 默认并没有审美。当你给它约束时——一套设计系统、一个审美 skill 和具体参考——它才能产出好设计。Open Design 正是把这些输入打包好，这也是两者契合的原因（下文详述）。"}]}, {"id": "setup", "heading": "从零开始为设计工作配置 Copilot CLI", "blocks": [{"kind": "p", "text": "下面是从一台干净机器到一个能构建并验证 UI 的 Copilot CLI 的完整路径。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安装 Copilot CLI（需要 Node.js）\nnpm install -g @github/copilot\n\n# 2. 在你的项目中启动它，并在首次运行时鉴权\ncd your-project\ncopilot           # 运行 /login 并按提示登录\n\n# 3. 为任务选择一个模型\n#    在会话中：\n/model            # 从 Anthropic、OpenAI 或 Google 中挑一个前沿模型\n\n# 4. 添加自定义指令和 Figma MCP server（可选）\n#    编写 .github/copilot-instructions.md 或 AGENTS.md\n/mcp add          # 添加 Figma MCP server 用于设计交付"}, {"kind": "image", "src": "/agents/copilot-design/copilot-design-setup-flow.webp", "alt": "五步配置流程：安装、鉴权、选择模型、配置指令、验证", "caption": "配置顺序：安装 → 鉴权 → 选择模型 → 编写指令 → 启用浏览器验证。"}, {"kind": "steps", "items": [{"label": "为你的设计规则编码", "body": "把你的 tokens、基础组件和规范放进 .github/copilot-instructions.md 或 AGENTS.md，让输出贴合一个品牌，而非退回到千篇一律的观感。"}, {"label": "加入浏览器验证", "body": "接入 Playwright 或浏览器 MCP，让 Copilot 在真实浏览器中渲染，并跨断点检查输出，而不只是确认构建通过。"}]}]}, {"id": "screenshot-workflow", "heading": "截图转 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Copilot CLI 做设计、杠杆最高的闭环，是把一张参考图变成可用的响应式 UI，并不断迭代直到匹配——借助一个强大的多模态模型把输出对照参考来比较。"}, {"kind": "ol", "items": ["从你手上最清晰的视觉参考出发——并包含多种状态（桌面与移动、悬停、空态、加载态），而不只是一张主视觉。", "在 prompt 里写具体；即便用了强模型，含糊的 prompt 也会产出千篇一律的 UI。", "把你的设计系统和规范放进 .github/copilot-instructions.md 或 AGENTS.md，并告诉 Copilot tokens 和标准基础组件在哪里。", "运行一个 dev server，让 Copilot 在真实浏览器中渲染，调整到各断点来检查结果。", "让 Copilot 把它的实现对照截图来比较以进行迭代——而不只是确认能构建通过。"]}, {"kind": "p", "text": "把 Copilot 指向你的参考图并给出具体约束；它在运行前会预览每一次文件编辑或命令，等你批准："}, {"kind": "code", "lang": "bash", "code": "copilot\n# 在 prompt 中：\n> Implement the design in reference-desktop.png and reference-mobile.png\n  in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens described in\n  .github/copilot-instructions.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints."}, {"kind": "p", "text": "保持 prompt 小而聚焦，提交好的迭代、回退坏的迭代（回退时告诉 Copilot），这样每一轮都建立在干净的基础之上。"}]}, {"id": "extend", "heading": "自定义指令、MCP 与扩展", "blocks": [{"kind": "p", "text": "有三个扩展点让 Copilot CLI 适合持续的设计工作，而且这三者都能干净地映射到开放的设计工作流上。"}, {"kind": "steps", "items": [{"label": "自定义指令", "body": "仓库规则存于 .github/copilot-instructions.md（连同 .github/instructions 下的路径专属文件和 AGENTS.md）。它们是你设计规范的长期归宿，每次运行都会被自动纳入。"}, {"label": "MCP server", "body": "Copilot CLI 内置了 GitHub 的 MCP server，并允许你通过 /mcp add 添加自定义 server（配置存于 ~/.copilot 下的 mcp-config.json）——这是引入设计上下文（最相关的就是 Figma MCP server）的可移植方式，可跨多个 agent 通用，而不止 Copilot。"}, {"label": "专用 agent 与内置工具", "body": "Copilot CLI 的专用模式——用于代码库探索、运行构建与测试、变更评审和规划——加上它的文件和 shell 工具，让它无需离开终端就能收集参考并跑完验证闭环。"}]}, {"kind": "p", "text": "这些都是可移植的、多 agent 通用的能力——正是 Open Design 旨在编排、而非在每个项目里重复造的那类东西。"}]}, {"id": "vs", "heading": "做设计时 Copilot CLI 对比 Codex、Claude Code、Cursor、Gemini CLI", "blocks": [{"kind": "p", "text": "设计工作没有唯一赢家——每个 agent 各有所长，有经验的团队会把它们叠加使用。一个公允的总结："}, {"kind": "table", "columns": ["Agent", "设计强项", "最适合"], "rows": [["Copilot CLI", "多模型选择（Anthropic、OpenAI、Google）以及在你的 Copilot 订阅上深度的 GitHub 集成", "按任务挑选最佳模型，以及与你的 GitHub 仓库绑定的指令驱动型工作"], ["Codex", "凭借前端 skill 带来出色的视觉打磨；沙箱化的异步构建", "委托式异步构建和可移植的 AGENTS.md 规则"], ["Claude Code", "具体的设计决策（hex、间距、字体）和理解代码库的 UX", "前端推理和大上下文重构"], ["Cursor", "带实时预览和内联编辑的“边构建边看”视觉闭环", "在 IDE 内紧凑的“边迭代边观察”UI 工作"], ["Gemini CLI", "强大的多模态图像理解和 100 万 token 上下文；开源且带免费额度", "大量依赖截图的工作，以及在上下文中容纳整套设计系统"]]}, {"kind": "p", "text": "社区反复得出的结论是：审美来自人——没有 skill、参考和约束，它们都会默认退回到千篇一律的观感。这才是真正要解决的问题——而且它是设计工具的形状，不是模型的形状。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避免“AI 流水线感”的观感", "blocks": [{"kind": "p", "text": "关于 AI 生成设计最常见的抱怨是它看起来千篇一律——柔和渐变、悬浮面板、过大的圆角、夸张的阴影，以及一种 Inter 字体配紫色、“一眼就是 AI 做的”的气质。其他被反映的问题还包括移动端布局错乱、指令文字漏进 UI 文案。这些都不是 Copilot CLI 独有的；任何 agent 在缺少精选设计上下文时运行，都会这样。"}, {"kind": "steps", "items": [{"label": "加一个审美 skill", "body": "一个精选的设计 skill 会迫使 agent 投入到一个真正的方向上，而非默认观感。"}, {"label": "在真实浏览器中验证", "body": "用浏览器 MCP 跨断点渲染并自检，这样布局就不会在移动端悄无声息地崩坏。"}, {"label": "提供 tokens 和参考", "body": "真实的设计 tokens 和参考截图，是对输出质量影响最大的单一杠杆。"}, {"label": "把规则写进自定义指令", "body": "把诸如“不用 hero 卡片、最多两种字体、品牌优先的层级”这类风格规则放进 .github/copilot-instructions.md 或 AGENTS.md，agent 每次运行都会读到。"}]}, {"kind": "p", "text": "注意，每一项缓解措施都是在给 agent 提供精选的设计上下文。手工地、逐项目地维护这份上下文，正是 Open Design 要消除的苦工。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Copilot CLI 做设计", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一直在呼唤的开源设计层。它把 GitHub Copilot CLI 当作一等适配器，并用一套精选的 skill 与设计系统库、一条结构化的渲染流水线和一个本地桌面 UI 把它包裹起来——这样让 Copilot 变好的那份设计上下文，从第一次运行就已就位，而不必每次手工拼装。Open Design 独立、开源（Apache-2.0）且本地优先，这正是两者契合的原因：agent 干活，你的文件和凭证仍归你所有。"}, {"kind": "ol", "items": ["安装 Open Design 并选择 GitHub Copilot CLI 作为你的 agent。", "用你的 GitHub Copilot 订阅鉴权——凭证留在你的机器上，绝不经我们代理。", "选一套设计系统和一个 skill，然后以一致的审美生成演示稿、原型和落地页。", "每一个产物和 DESIGN.md 文件都存在你自己的仓库里，而非托管的云端。"]}, {"kind": "p", "text": "同一个 Copilot CLI agent、同一份订阅——外加围绕它的一套真实、可移植、开源的设计工作流。Open Design 本地优先且采用 Apache-2.0，所以关于你的工作或凭证的一切都不会离开你的机器。"}]}], "faqTitle": "常见问题", "faq": [{"name": "GitHub Copilot CLI 真的能做设计工作吗？", "text": "能——只要在上下文里有一个审美 skill、一套设计系统和真实参考图，Copilot CLI 就能产出生产级、响应式的 UI，而且你可以挑选最能对照参考验证输出的那个模型。缺少这份上下文时，它往往会默认退回到千篇一律的观感，而这正是 Open Design 要填补的差距。"}, {"name": "用 Copilot CLI 做设计需要订阅吗？", "text": "需要——Copilot CLI 跑在一个有效的 GitHub Copilot 订阅上（Pro、Pro+、Business 或 Enterprise）；它不是 BYOK。你用 GitHub 账号鉴权。Open Design 绝不代理你的凭证——你的订阅由你的 agent 直接使用。"}, {"name": "Copilot CLI 具体好在哪、为什么适合设计？", "text": "两点：它会自动读取仓库指令和 AGENTS.md，于是你的设计规范随仓库流转；它还让你按任务在 Anthropic、OpenAI 和 Google 的前沿模型之间切换。两者都有帮助——但审美仍来自你提供的设计系统、skill 和参考。"}, {"name": "前端设计该用 Copilot CLI 还是 Claude Code？", "text": "两者都很强。Claude Code 以具体、理解代码库的设计决策著称；Copilot CLI 的优势在于跨提供方的模型选择，以及在你可能已经拥有的订阅上深度的 GitHub 集成。许多团队两者并用——Open Design 让你切换 agent 而无需改变设计工作流。"}, {"name": "怎么把 Copilot CLI 连接到 Figma？", "text": "用 /mcp add 命令添加 Figma MCP server；设置存于 ~/.copilot 下的 mcp-config.json。之后 Copilot 就能拉取真实的设计上下文——组件、变量、布局数据——让生成的代码贴合源头，而非近似猜测。"}, {"name": "Open Design 与 GitHub 或 Microsoft 有关联吗？", "text": "没有。GitHub Copilot CLI 是 GitHub 的产品；Open Design 是一个独立的开源项目，以一等适配器的方式支持它。GitHub Copilot 是 GitHub, Inc. 和 Microsoft 的商标。"}, {"name": "我的文件和凭证安全吗？", "text": "安全——Open Design 本地优先且采用 Apache-2.0。你的文件、产物和 DESIGN.md 都留在你自己的仓库里，你的 GitHub Copilot 凭证由你的 agent 直接使用，绝不经 Open Design 服务器路由。"}], "ctaTitle": "用 GitHub Copilot CLI 做设计，以开放的方式。", "ctaBody": "带上你的 GitHub Copilot 订阅，把每个文件都留在本地，围绕你已经在用的 agent 获得一套精选的设计库。", "ctaActions": [{"label": "在 Open Design 中使用 Copilot CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "查看所有受支持的 agent"},
      aboutTitle: "什么是 GitHub Copilot CLI",
      aboutBody: ["GitHub Copilot CLI 是 GitHub 原生于终端的编码 agent，由与 Copilot 编码 agent 同一套 agentic 框架驱动。它读取你的代码库、编辑文件、运行命令，并结合你的 GitHub issue、PR 和仓库工作。", "它会自动读取自定义指令文件和 AGENTS.md，并让你按任务在 Anthropic、OpenAI 和 Google 的前沿模型之间切换。", "Open Design 把 Copilot CLI 当作一等适配器，于是这个 agent 能嵌入一条结构化、开源的设计流水线。"],
      vendorLabel: "厂商",
      vendor: "GitHub",
      credentialLabel: "凭证",
      credential: "GitHub Copilot 订阅",
      designTitle: "用 Copilot CLI 做设计",
      designLead: "Copilot CLI 的设计强项集中在指令和模型选择上：",
      designPoints: [{"label": "截图 → UI", "body": "挑一个强大的多模态模型，把参考图变成响应式标记，再对照它检查结果。"}, {"label": "多模型选择", "body": "用 /model 按任务在 Anthropic、OpenAI 和 Google 的前沿模型之间切换，全部跑在你的 Copilot 订阅上。"}, {"label": "指令 + MCP", "body": "自定义指令和 AGENTS.md 承载你的规范；Figma MCP server 把真实设计上下文带入代码。"}, {"label": "深度 GitHub 集成", "body": "内置 GitHub MCP server，可访问你的仓库、issue 和 PR，用你现有的 GitHub 账号鉴权。"}],
      linksTitle: "真实世界的资源",
      linksLead: "GitHub Copilot CLI 的官方仓库和文档：",
      links: [{"label": "github/copilot-cli (GitHub)", "href": "https://github.com/github/copilot-cli", "source": "GitHub · GitHub"}, {"label": "使用 GitHub Copilot CLI", "href": "https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/overview", "source": "Docs · GitHub"}, {"label": "GitHub Copilot CLI 现已全面上线", "href": "https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/", "source": "Changelog · GitHub"}],
      withOdTitle: "Copilot CLI + Open Design",
      withOdLead: "Open Design 是围绕 Copilot CLI 的开源设计层：一套精选的 skill 与设计系统库、一条结构化的渲染流水线，以及一个本地桌面 UI。",
      withOdSteps: ["安装 Open Design 并选择 GitHub Copilot CLI 作为你的 agent。", "用你的 GitHub Copilot 订阅鉴权——凭证留在你的机器上。", "选一套设计系统和一个 skill，然后以一致的审美生成演示稿、原型和落地页。", "产物和 DESIGN.md 文件都存在你自己的仓库里，而非托管的云端。"],
      withOdClosing: "同一个 Copilot CLI agent——外加围绕它的一套真实、可移植的设计工作流。",
      faqTitle: "常见问题",
      faq: [{"name": "Open Design 是 GitHub 出品的吗？", "text": "不是。GitHub Copilot CLI 是 GitHub 的产品；Open Design 是一个独立的开源项目，以一等适配器的方式集成它。"}, {"name": "我需要订阅吗？", "text": "需要——Copilot CLI 跑在一个有效的 GitHub Copilot 订阅上（Pro、Pro+、Business 或 Enterprise）。Open Design 绝不代理你的凭证。"}, {"name": "Open Design 与 GitHub 或 Microsoft 有关联吗？", "text": "没有。Open Design 独立运作；GitHub Copilot 是 GitHub, Inc. 和 Microsoft 的商标。"}],
      ctaTitle: "用 GitHub Copilot CLI 做设计，以开放的方式。",
      ctaBody: "给仓库点 Star、下载桌面应用，或加入社区来申请一个适配器。",
    },
    qwen: {
      title: "用 Qwen Code 做设计 — Open Design",
      description: "人们如何用阿里巴巴开源的 Qwen Code CLI 做 UI 和网页设计——它的 Qwen3-Coder 模型、超大上下文窗口、QWEN.md 和 MCP——以及 Open Design 如何把 Qwen Code 变成一个本地优先、开源的设计 agent。",
      breadcrumb: "Qwen Code",
      label: "Agent · Qwen Code",
      heading: "用 Qwen Code 做设计。",
      lead: "Qwen Code 是阿里巴巴开源的终端 agent，由 Gemini CLI 改造而来，并针对 Qwen3-Coder 模型做了调优。它超大的上下文窗口能一次性装下整套设计系统，这让它成为一个真正可用的设计工具——前提是你给它参考、规范和一套验证闭环。Open Design 把它接入开源设计工作流：用你自己的 DashScope 或 Qwen API key、你自己的文件，全程本地优先。",
      tldrTitle: "太长不看",
      tldrBody: "Qwen Code 凭借强大的 agent 化编码能力和超大上下文窗口，把清晰的参考转化为响应式 UI，BYOK 只需一个 DashScope 或 OpenAI 兼容的 key。Open Design 为它配上一套精选的设计系统与 skill 库，再加上桌面端工作流——BYOK 并把一切都留在本地。",
      toc: ["什么是 Qwen Code", "用 Qwen Code 做设计", "资源", "搭配 Open Design", "常见问题"],
      rich: {"heroCtaLead": "Open Design 把 Qwen Code 变成一个本地优先、开源的设计 agent——用你自己的 DashScope 或 Qwen API key、你自己的文件，外加围绕它的一套精选 skill 与设计系统库。", "heroCtaActions": [{"label": "在 Open Design 中使用 Qwen Code", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Qwen Code 是阿里巴巴开源的终端 AI agent。它由 Google 的 Gemini CLI 改造而来，在解析器层面和提示词上做了适配，让它能充分发挥 Qwen3-Coder 模型的能力。有两点让它在设计场景中尤其值得关注：它是一个强大的 agent 化编码模型，能从一个自然语言任务出发，自己规划、编辑文件、跑构建和验证闭环；它的超大上下文窗口能一次性装下整套设计系统和代码库。配上恰当的参考、规范和一套验证闭环，它能构建出真实、响应式的 UI——而且它是开源、BYOK 的，你自带 key 就能用。这是一份实用的端到端指南，讲如何用 Qwen Code 做 UI、前端和设计系统的工作，以及如何用 Open Design 把它接入一套结构化的设计工作流。", "本文涵盖：Qwen Code 究竟是什么，为什么一个强编码模型加超大上下文契合设计，如何从零搭好它，参考到 UI 的闭环，QWEN.md 和 MCP 如何扩展它，它与 Codex、Claude Code、Cursor、Gemini CLI 相比如何，那些让 AI 产出显得平庸的坑，以及 Open Design 如何作为一个开放、本地优先的设计层补上缺口——这是一对天然组合，因为两者都开源、都跑在你自己的机器上。"], "heroImage": {"src": "/agents/qwen-design/qwen-design-hero.webp", "alt": "Qwen Code 设计反馈闭环：终端 agent 读取一张参考图、浏览器渲染 UI、一个工作区，外加一条回环的反馈箭头", "caption": "核心闭环：Qwen Code 在终端里读取你的参考，在真实浏览器里构建并验证 UI，并对照参考反复迭代——整套设计系统始终在上下文里。"}, "tocLabel": "本页内容", "toc": [{"id": "what-is-qwen", "label": "Qwen Code 究竟是什么"}, {"id": "why-design", "label": "为什么强编码模型 + 超大上下文契合设计"}, {"id": "setup", "label": "从零搭好用于设计的 Qwen Code"}, {"id": "screenshot-workflow", "label": "参考到 UI 的工作流"}, {"id": "extend", "label": "QWEN.md、MCP 和扩展"}, {"id": "vs", "label": "Qwen Code vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "坑，以及那种「AI 味」外观"}, {"id": "open-design", "label": "在 Open Design 中用 Qwen Code 做设计"}, {"id": "faq", "label": "常见问题"}], "sections": [{"id": "what-is-qwen", "heading": "Qwen Code 究竟是什么", "blocks": [{"kind": "p", "text": "Qwen Code 是阿里巴巴为终端发布的开源（Apache-2.0）AI agent。它读取你的仓库、编辑文件、运行 shell 命令、上网检索——从自然语言任务出发去规划和验证工作，而不只是补全几行代码。它由 Google 的 Gemini CLI 改造而来，在解析器层面和提示词上做了调优，以释放 Qwen3-Coder 模型在 agent 化编码任务上的能力。"}, {"kind": "p", "text": "对设计工作来说，有两个特性格外突出。它是一个强大的 agent 化编码器，能拿着一份参考和一份清晰的需求去构建、运行并自我纠正出响应式 UI。而 Qwen3-Coder 模型自带超大上下文窗口，大到足以一次性装下你整套设计系统、组件库和参考集，而不必把它们压缩概括掉。"}, {"kind": "steps", "items": [{"label": "上下文文件", "body": "Qwen Code 会读取一个 QWEN.md 文件作为持久的项目上下文——这正是编写你的设计规范、tokens 和评审清单的天然位置。个人和项目级设置会层层叠加在其上。"}, {"label": "内置工具 + MCP", "body": "它开箱即带文件、shell 和 web 工具，并支持 MCP server（在 ~/.qwen/settings.json 的 mcpServers 下配置），以接入像实时 Figma 文件这样的外部上下文。"}, {"label": "从 BYOK 起步", "body": "你自带 key——一个 DashScope（阿里云百炼）API key，或任意 OpenAI 兼容端点，或 ModelScope——并在 settings.json 中配置。"}]}, {"kind": "ul", "items": ["厂商：Alibaba", "凭证：DashScope / Qwen API key（BYOK），或 OpenAI 兼容端点 / ModelScope", "许可：Apache-2.0，开源（由 Gemini CLI 改造而来）"]}]}, {"id": "why-design", "heading": "为什么强编码模型和超大上下文契合设计", "blocks": [{"kind": "p", "text": "Qwen Code 的设计优势来自两个特性——但和每个 agent 一样，审美仍然得由你来提供。"}, {"kind": "steps", "items": [{"label": "强大的 agent 化编码", "body": "Qwen3-Coder 模型针对 agent 化任务做了调优，因此这个 agent 会规划、编辑、跑构建并自我纠正——把一份清晰的参考和需求变成响应式标记，而不是一锤子的瞎猜。"}, {"label": "超大上下文窗口", "body": "Qwen3-Coder 的超大上下文意味着整套设计系统、tokens 和许多参考状态能一次性装下，于是 agent 会复用你真实的基础原语，而不是凭空造出一次性的样式。"}, {"label": "QWEN.md 里的规范", "body": "一份 QWEN.md（加上 Figma MCP server）把 agent 指向你的 tokens、组件和真实规格，于是它是对着一个品牌干活，而不是套用一套默认外观。"}]}, {"kind": "image", "src": "/agents/qwen-design/qwen-design-taste-triangle.webp", "alt": "图示：设计系统、skill 和参考图汇聚成优质的设计产出", "caption": "审美来自你提供的三个输入：一套设计系统、一个 skill，以及真实的参考图。"}, {"kind": "p", "text": "这个教训和每个 agent 教给我们的一样：Qwen Code 默认并不具备审美。当你给它约束时——一套设计系统、一个审美 skill 和具体的参考——它才能产出好设计。Open Design 恰恰把这些输入打包好了，这正是两者契合的原因（下文详述）。"}]}, {"id": "setup", "heading": "从零搭好用于设计工作的 Qwen Code", "blocks": [{"kind": "p", "text": "下面是从一台干净的机器到一个能构建并验证 UI 的 Qwen Code 的完整路径。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安装 Qwen Code（Node 22+）\nnpm install -g @qwen-code/qwen-code@latest\n# 或：brew install qwen-code\n\n# 2. 在你的项目里启动它，首次运行时完成认证\ncd your-project\nqwen              # 运行 /auth，或在 ~/.qwen/settings.json 里设置一个 key\n\n# 3. 在 settings.json 里配置一个 DashScope（OpenAI 兼容）key\n#    baseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1\n#    model:   qwen3-coder-plus   （设置 DASHSCOPE_API_KEY）\n\n# 4. 添加一个 QWEN.md 并接好 Figma MCP server（可选）\n#    在 ~/.qwen/settings.json 的 \"mcpServers\" 下添加 MCP"}, {"kind": "image", "src": "/agents/qwen-design/qwen-design-setup-flow.webp", "alt": "五步搭建流程：安装、认证、配置 QWEN.md、添加 skill、验证", "caption": "搭建顺序：安装 → 认证 → 配置 QWEN.md → 添加 skill → 启用浏览器验证。"}, {"kind": "steps", "items": [{"label": "写下你的设计规则", "body": "把你的 tokens、基础原语和规范放进 QWEN.md，并让 Qwen Code 指向它们，这样产出会贴合一个品牌，而不是退回到一套通用外观。"}, {"label": "加入浏览器验证", "body": "接好一个 Playwright 或浏览器 MCP，让 Qwen Code 在真实浏览器里渲染，并跨断点检查产出，而不只是确认构建通过。"}]}]}, {"id": "screenshot-workflow", "heading": "参考到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Qwen Code 收益最高的设计闭环，是把一份参考变成可用的响应式 UI，并反复迭代直到匹配——依靠 agent 去构建、渲染，并把产出对照参考做比较。"}, {"kind": "ol", "items": ["从你手头最清晰的视觉参考开始——并描述多个状态（桌面与移动、悬停、空态、加载中），而不只是一张主视觉。", "提示词要具体；含糊的提示词即便用强模型也只会产出通用 UI。", "把你的设计系统和规范放在 QWEN.md 里，并告诉 Qwen Code tokens 和标准基础原语在哪里。", "跑一个 dev server，让 Qwen Code 在真实浏览器里渲染，调整到各个断点尺寸来检查结果。", "通过让 Qwen Code 把它的实现对照参考做比较来迭代——而不只是确认它能构建通过。"]}, {"kind": "p", "text": "用 @ 引用一个文件把它附到提示词里，然后给出具体约束："}, {"kind": "code", "lang": "bash", "code": "qwen\n# 在提示词里：\n> @reference-desktop.png @reference-mobile.png\n  Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from QWEN.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints."}, {"kind": "p", "text": "把提示词保持小而聚焦，提交好的迭代、回退坏的迭代（回退时告诉 Qwen Code），这样每一轮都在一个干净的基础上推进。"}]}, {"id": "extend", "heading": "QWEN.md、MCP 和扩展", "blocks": [{"kind": "p", "text": "三个扩展点让 Qwen Code 能胜任持续的设计工作，而这三者都能干净地映射到一套开放的设计工作流上。"}, {"kind": "steps", "items": [{"label": "QWEN.md 上下文", "body": "项目规则放在仓库根目录的 QWEN.md 里（带全局层和项目层）。它是你设计规范的长久归宿，每次运行都会被读取。"}, {"label": "MCP server", "body": "在 ~/.qwen/settings.json 的 mcpServers 下配置 MCP server——这是引入设计上下文和外部工具的可移植方式，其中最相关的是 Figma MCP server，它们能跨 agent 通用，而不只服务于 Qwen Code。"}, {"label": "skill 与内置工具", "body": "Qwen Code 的 skill 以及它内置的文件、shell 和 web 工具，让它无需离开终端就能收集参考并运行验证闭环。"}]}, {"kind": "p", "text": "这些都是可移植、跨 agent 的能力——正是 Open Design 旨在编排的那类东西，而不是在每个项目里重新造一遍。"}]}, {"id": "vs", "heading": "做设计时 Qwen Code vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "设计工作没有唯一赢家——每个 agent 各有所长，老练的团队会把它们叠着用。一个公允的概括："}, {"kind": "table", "columns": ["Agent", "设计强项", "最适合"], "rows": [["Qwen Code", "在开放的 Qwen3-Coder 模型上具备强大的 agent 化编码能力，外加超大上下文；开源且 BYOK", "开源、key 灵活、且能把整套设计系统装进上下文的构建"], ["Codex", "凭借前端 skill 带来出色的视觉打磨；沙箱化的异步构建", "委托式异步构建与可移植的 AGENTS.md 规则"], ["Claude Code", "具体的设计决策（hex、间距、字体）和理解代码库的 UX", "前端推理与大上下文重构"], ["Cursor", "带实时预览和行内编辑的可视化「构建即所见」闭环", "在 IDE 内紧凑的「边改边看」UI 工作"], ["Gemini CLI", "强大的多模态图像理解与 1M-token 上下文；Qwen Code 正是由它改造而来", "大量截图的工作与超大上下文"]]}, {"kind": "p", "text": "社区反复得出的结论是：审美来自人类——它们在没有 skill、参考和约束时，都会默认退回一套通用审美。这才是真正要解决的问题——而它是设计工具形状的，不是模型形状的。"}]}, {"id": "pitfalls", "heading": "坑，以及如何避开那种「AI 味」外观", "blocks": [{"kind": "p", "text": "对 AI 生成设计最常见的抱怨是它看起来很通用——柔和的渐变、悬浮的面板、过大的圆角、夸张的阴影，一股「Inter 字体加紫色」的味道，「一看就是 AI 做的」。其他被反映的问题还包括移动端布局崩坏、以及指令泄漏进 UI 文案里。这些都不是 Qwen Code 独有的；任何 agent 在缺少精选设计上下文时运行，都会这样。"}, {"kind": "steps", "items": [{"label": "加一个审美 skill", "body": "一个精选的设计 skill 会逼着 agent 笃定一个真实的方向，而不是套用默认外观。"}, {"label": "在真实浏览器里验证", "body": "让 agent 跨断点渲染并自检，这样布局就不会在移动端悄悄崩掉。"}, {"label": "提供 tokens 和参考", "body": "真实的设计 tokens 和参考截图，是对产出质量最大的单一杠杆。"}, {"label": "把规则写进 QWEN.md", "body": "把诸如「不要 hero 卡片、最多两种字体、品牌优先的层级」这类风格规则，放在 agent 每次运行都会读到的地方。"}]}, {"kind": "p", "text": "注意到了吗，每一项缓解措施都是在给 agent 一份精选的设计上下文。逐个项目手工维护这份上下文，正是 Open Design 替你免去的苦活。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Qwen Code 做设计", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一再呼唤的那个开源设计层。它把 Qwen Code 当作一等公民适配器，并用一套精选的 skill 与设计系统库、一条结构化的渲染管线，以及一个本地桌面 UI 把它包起来——于是让 Qwen Code 好用的那份设计上下文，从第一次运行就在那里，而不必每次手工拼凑。两者都开源、都本地优先，这让这对组合天然契合。"}, {"kind": "ol", "items": ["安装 Open Design，并选择 Qwen Code 作为你的 agent。", "用你的 DashScope 或 Qwen API key 认证（BYOK）——凭证留在你自己的机器上，绝不经我们中转。", "选一套设计系统和一个 skill，然后以一致的审美生成演示稿、原型和落地页。", "每一份产物和 DESIGN.md 文件都留在你自己的仓库里，而非托管云端。"]}, {"kind": "p", "text": "同一个 Qwen Code agent、同一个 key——外加围绕它的一套真实、可移植、开源的设计工作流。它本地优先、Apache-2.0，所以你的工作和凭证都不会离开你的机器。"}]}], "faqTitle": "常见问题", "faq": [{"name": "Qwen Code 真能做设计工作吗？", "text": "能——只要上下文里有一个审美 skill、一套设计系统和真实的参考图，Qwen Code 就能产出生产级的响应式 UI，并且它的 agent 化闭环会构建、渲染，并对照参考验证产出。缺了这份上下文，它往往会退回一套通用外观，而这正是 Open Design 填补的缺口。"}, {"name": "用 Qwen Code 做设计需要付费吗？", "text": "Qwen Code 免费且开源，但它是 BYOK——你自带一个 DashScope（阿里云百炼）API key、一个 OpenAI 兼容端点，或 ModelScope。阿里巴巴也提供一个固定费用的编码套餐。无论哪种方式，Open Design 都绝不中转你的凭证。"}, {"name": "Qwen Code 具体好在哪里适合做设计？", "text": "两点：Qwen3-Coder 模型针对 agent 化编码做了调优，于是 agent 会构建并自我纠正出响应式 UI；它们的超大上下文能一次性装下整套设计系统和参考集。两者都有帮助——但审美仍然来自你提供的设计系统、skill 和参考。"}, {"name": "Qwen Code 和 Gemini CLI 是一回事吗？", "text": "不是。Qwen Code 由 Google 的 Gemini CLI 改造而来——同源的开源血统——在解析器层面和提示词上做了适配，以针对 Qwen3-Coder 模型调优。Open Design 两者都支持，所以你能在不改设计工作流的前提下切换 agent。"}, {"name": "我怎么把 Qwen Code 连到 Figma？", "text": "在 ~/.qwen/settings.json 的 mcpServers 下添加 Figma MCP server。然后 Qwen Code 就能拉取真实的设计上下文——组件、变量、布局数据——让生成的代码贴合源文件，而不是近似猜测。"}, {"name": "Open Design 和 Alibaba 或 Qwen 有关联吗？", "text": "没有。Qwen Code 是 Alibaba 的产品；Open Design 是一个独立的开源项目，把它作为一等公民适配器来支持。Qwen 是 Alibaba 的商标。"}, {"name": "我的文件和凭证安全吗？", "text": "安全——Open Design 本地优先、Apache-2.0。你的文件、产物和 DESIGN.md 都留在你自己的仓库里，你的 DashScope 或 Qwen 凭证由你的 agent 直接使用，绝不经 Open Design 的服务器路由。"}], "ctaTitle": "用开放的方式，跟 Qwen Code 一起做设计。", "ctaBody": "自带你的 DashScope 或 Qwen API key，把每个文件都留在本地，并围绕你已经在用的 agent 获得一套精选的设计库。", "ctaActions": [{"label": "在 Open Design 中使用 Qwen Code", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "查看所有受支持的 agent"},
      aboutTitle: "什么是 Qwen Code",
      aboutBody: ["Qwen Code 是阿里巴巴开源的（Apache-2.0）终端 AI agent，由 Google 的 Gemini CLI 改造而来。它读取你的代码库、编辑文件、运行命令并上网检索。", "它针对 Qwen3-Coder 模型做了调优，这些模型的超大上下文窗口让它能一次性装下整套设计系统和参考集。", "Open Design 把 Qwen Code 当作一等公民适配器，于是这个 agent 能嵌入一条结构化、开源的设计管线。"],
      vendorLabel: "厂商",
      vendor: "Alibaba",
      credentialLabel: "凭证",
      credential: "DashScope / Qwen API key（BYOK）",
      designTitle: "用 Qwen Code 做设计",
      designLead: "Qwen Code 的设计强项围绕它的模型和上下文展开：",
      designPoints: [{"label": "参考 → UI", "body": "强大的 agent 化编码把一份清晰的参考和需求变成响应式标记，并对照参考自检结果。"}, {"label": "超大上下文", "body": "整套设计系统、组件库和参考集能一次性装下，于是产出会复用你真实的基础原语。"}, {"label": "QWEN.md + MCP", "body": "上下文文件承载你的规范；Figma MCP server 把真实的设计上下文带进代码。"}, {"label": "开放且 BYOK", "body": "Apache-2.0 且 key 灵活——一个 DashScope 或 Qwen API key、一个 OpenAI 兼容端点，或 ModelScope。"}],
      linksTitle: "实战资源",
      linksLead: "Qwen Code 的官方仓库和文档：",
      links: [{"label": "QwenLM/qwen-code（GitHub）", "href": "https://github.com/QwenLM/qwen-code", "source": "GitHub · Alibaba / Qwen"}, {"label": "Qwen Code 文档", "href": "https://qwenlm.github.io/qwen-code-docs/en/", "source": "Docs · Qwen"}, {"label": "Qwen3-Coder：让 Agent 化编码走进现实", "href": "https://qwen.ai/blog?id=qwen3-coder", "source": "Blog · Qwen"}],
      withOdTitle: "Qwen Code + Open Design",
      withOdLead: "Open Design 是围绕 Qwen Code 的开源设计层：一套精选的 skill 与设计系统库、一条结构化的渲染管线，以及一个本地桌面 UI。",
      withOdSteps: ["安装 Open Design，并选择 Qwen Code 作为你的 agent。", "用你的 DashScope 或 Qwen API key 认证（BYOK）——凭证留在你自己的机器上。", "选一套设计系统和 skill，然后以一致的审美生成演示稿、原型和落地页。", "产物和 DESIGN.md 文件都留在你自己的仓库里，而非托管云端。"],
      withOdClosing: "同一个 Qwen Code agent——外加围绕它的一套真实、可移植的设计工作流。",
      faqTitle: "常见问题",
      faq: [{"name": "Open Design 是 Alibaba 做的吗？", "text": "不是。Qwen Code 是 Alibaba 的产品；Open Design 是一个独立的开源项目，把它作为一等公民适配器集成进来。"}, {"name": "我需要付费吗？", "text": "Qwen Code 开源但 BYOK——自带一个 DashScope 或 Qwen API key、一个 OpenAI 兼容端点，或 ModelScope。Open Design 绝不中转你的凭证。"}, {"name": "Open Design 和 Alibaba 或 Qwen 有关联吗？", "text": "没有。Open Design 是独立的；Qwen 是 Alibaba 的商标。"}],
      ctaTitle: "用开放的方式，跟 Qwen Code 一起做设计。",
      ctaBody: "给仓库点个 Star、下载桌面应用，或加入社区来申请一个适配器。",
    },
    grok: {
      title: "用于设计的 Grok CLI — Open Design",
      description: "人们如何使用 xAI 的 Grok CLI（Grok Build）做 UI 与网页设计——它的计划模式、AGENTS.md 和 MCP、能识别图像的 Grok 模型以及超大上下文——以及 Open Design 如何把 Grok CLI 变成一个本地优先、开源的设计 agent。",
      breadcrumb: "Grok CLI",
      label: "Agent · Grok CLI",
      heading: "用于设计的 Grok CLI。",
      lead: "Grok CLI 是 xAI 的终端编码 agent。它在动你的文件之前先规划好多步工作，把图像和代码一起读取，并在你的仓库里跑构建并验证的循环——只要你给它参考、规范和一个验证环节，它就能成为一个真正的设计工具。Open Design 把它接入开源设计工作流：用你的 SuperGrok 登录或 xAI API key，操作你自己的文件，本地优先。",
      tldrTitle: "太长不看",
      tldrBody: "Grok CLI 借助计划模式审查、并行子 agent 以及能识别图像的 Grok 模型，把参考图变成响应式 UI，并通过你的 SuperGrok 或 X Premium+ 账户进行身份验证。Open Design 为它配上一套精选的设计系统与 skill 库，外加一个桌面工作流——BYOK，一切都留在本地。",
      toc: ["什么是 Grok CLI", "用 Grok CLI 做设计", "资源", "搭配 Open Design", "常见问题"],
      rich: {"heroCtaLead": "Open Design 把 Grok CLI 变成一个本地优先、开源的设计 agent——用你的 SuperGrok 登录或 xAI API key，操作你自己的文件，并在外围配上一套精选的 skill 与设计系统库。", "heroCtaActions": [{"label": "在 Open Design 中使用 Grok CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Grok CLI——xAI 的终端编码 agent，以 Grok Build 之名发布——是一个驻留在你终端里的 agentic 工具。有两点让它对设计尤其有意思：它在动手之前会先规划有风险的工作，所以你可以在任何文件改动之前审查它提出的方案；而且它的 Grok 模型支持图像输入，因此它能在编写代码的同时对一张参考截图进行推理。配上恰当的参考、规范和一个验证循环，它能构建出真实、响应式的 UI——直接通过你的 SuperGrok 或 X Premium+ 账户进行身份验证，无需折腾 API key。这是一份实用的端到端指南，教你如何用 Grok CLI 做 UI、前端和设计系统工作，并把它接入 Open Design 提供的结构化设计工作流。", "本文涵盖：Grok CLI 究竟是什么，为什么计划模式和能识别图像的模型契合设计，如何从零开始搭建它，截图到 UI 的循环，AGENTS.md 和 MCP 如何扩展它，它与 Codex、Claude Code、Cursor 和 Gemini CLI 的对比，让 AI 产出显得千篇一律的那些陷阱，以及 Open Design 如何作为一个开放、本地优先的设计层来弥合差距——你的凭证和产物从不离开你的机器。"], "heroImage": {"src": "/agents/grok-design/grok-design-hero.webp", "alt": "Grok CLI 设计反馈循环：一个终端 agent 依据参考图进行规划，一个浏览器渲染 UI，以及一个工作区，反馈箭头回流形成闭环", "caption": "核心循环：Grok CLI 在终端里依据你的参考进行规划，在真实浏览器中构建并验证 UI，并对照参考反复迭代——你的规范则写在 AGENTS.md 里。"}, "tocLabel": "本页内容", "toc": [{"id": "what-is-grok", "label": "Grok CLI 究竟是什么"}, {"id": "why-design", "label": "为什么计划模式 + 图像输入契合设计"}, {"id": "setup", "label": "从零搭建用于设计的 Grok CLI"}, {"id": "screenshot-workflow", "label": "截图到 UI 的工作流"}, {"id": "extend", "label": "AGENTS.md、MCP 与子 agent"}, {"id": "vs", "label": "Grok CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "陷阱与“AI 味”观感"}, {"id": "open-design", "label": "在 Open Design 中用 Grok CLI 做设计"}, {"id": "faq", "label": "常见问题"}], "sections": [{"id": "what-is-grok", "heading": "Grok CLI 究竟是什么", "blocks": [{"kind": "p", "text": "Grok CLI 是 xAI 的终端编码 agent，以 Grok Build 之名发布。它读取你的仓库、编辑文件、运行 shell 命令，并依据自然语言任务规划多步工程工作，而不只是补全代码行。它围绕 xAI 的 Grok 模型构建——在 xAI API 上以 grok-build 模型家族的形式暴露——并通过你的 xAI 账户进行身份验证，因此 agent 和模型都出自同一家厂商。"}, {"kind": "p", "text": "对设计工作来说，有两个特性尤为突出。它有一个计划模式，会先草拟一份结构化方案，供你在任何改动落地之前批准、评论或重写——当你在迭代 UI 时，这是个很有用的关卡。而它的 Grok 模型支持图像输入，所以你可以把一张参考截图交给它，它会对实际布局进行推理，而不是从一段文字描述里瞎猜。"}, {"kind": "steps", "items": [{"label": "上下文文件", "body": "Grok CLI 会读取 AGENTS.md 文件来获取持久的项目上下文——这正是用来编码你的设计规范、tokens 和审查清单的自然位置。它遵循 Codex 和其他 agent 同样使用的开放 AGENTS.md 约定。"}, {"label": "工具、MCP + 子 agent", "body": "它能编辑文件、运行 shell 命令，并支持 MCP 服务器来引入外部上下文，比如一个实时的 Figma 文件；对于较大的任务，它可以委派给并行的子 agent，让它们同时进行调研、构建和审查。"}, {"label": "用你的账户登录", "body": "你通过浏览器以 SuperGrok 或 X Premium+ 订阅登录来完成身份验证；你也可以带上自己的 xAI API key 用于无头运行和 CI 场景。"}]}, {"kind": "ul", "items": ["厂商：xAI", "凭证：xAI SuperGrok OAuth（`grok login`），或用于无头场景的 xAI API key（BYOK）", "模型：xAI Grok 模型（xAI API 上的 grok-build 家族），支持图像输入"]}]}, {"id": "why-design", "heading": "为什么计划模式和能识别图像的模型契合设计", "blocks": [{"kind": "p", "text": "Grok CLI 的设计优势来自两个特性——但和所有 agent 一样，品味仍然得由你来提供。"}, {"kind": "steps", "items": [{"label": "能识别图像的推理", "body": "因为 Grok 模型支持图像输入，agent 能读取参考截图——把自己渲染出的产出与图像对照，而不是从一段文字描述里瞎猜。"}, {"label": "改动落地前的计划模式", "body": "计划模式会草拟一份结构化方案，供你在文件改动前批准，于是设计意图在一开始就被审查，而不是等差异出来之后才发现。"}, {"label": "写在 AGENTS.md 里的规范", "body": "一份 AGENTS.md（再加上 Figma MCP 服务器）会把 agent 指向你的 tokens、组件和真实规格，让它针对一个品牌来工作，而不是套用默认观感。"}]}, {"kind": "image", "src": "/agents/grok-design/grok-design-taste-triangle.webp", "alt": "示意图展示设计系统、skill 和参考图汇聚成优秀的设计产出", "caption": "品味来自你提供的三项输入：一个设计系统、一个 skill 和真实的参考图。"}, {"kind": "p", "text": "这条教训和每个 agent 教给我们的一样：Grok CLI 默认并不具备品味。当你给它约束时——一个设计系统、一个审美 skill 和具体的参考——它才会产出好的设计。Open Design 恰恰把这些输入打包好了，这正是两者契合的原因（下文详述）。"}]}, {"id": "setup", "heading": "从零开始搭建用于设计工作的 Grok CLI", "blocks": [{"kind": "p", "text": "下面是从一台干净的机器到一个能构建并验证 UI 的 Grok CLI 的完整路径。"}, {"kind": "code", "lang": "bash", "code": "# 1. 在 macOS/Linux 上安装 Grok CLI（Grok Build）\ncurl -fsSL https://x.ai/cli/install.sh | bash\n\n# 2. 在你的项目里启动它，并在首次运行时进行身份验证\ncd your-project\ngrok login   # 打开浏览器；用 SuperGrok / X Premium+ 登录\n#   或者，对于无头 / CI 场景，设置 xAI API key：\n#   export XAI_API_KEY=xai-...\n\n# 3. 添加项目上下文\n#    在仓库根目录创建一个 AGENTS.md，写入你的设计规范\n\n# 4. 接入 Figma MCP 服务器（可选，用于设计交付）\n#    把它加到你的 MCP 服务器配置里"}, {"kind": "image", "src": "/agents/grok-design/grok-design-setup-flow.webp", "alt": "五步搭建流程：安装、身份验证、配置 AGENTS.md、添加 skill、验证", "caption": "搭建顺序：安装 → 身份验证 → 配置 AGENTS.md → 添加 skill → 启用浏览器验证。"}, {"kind": "steps", "items": [{"label": "编码你的设计规则", "body": "把你的 tokens、基础元素和规范写进 AGENTS.md 并让 Grok 指向它们，这样产出就会贴合一个品牌，而不是退回到千篇一律的默认观感。"}, {"label": "加入浏览器验证", "body": "接入 Playwright 或浏览器 MCP，让 Grok 在真实浏览器中渲染，并跨断点检查它的产出，而不仅仅是确认构建通过。"}]}]}, {"id": "screenshot-workflow", "heading": "截图到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Grok CLI 时杠杆最高的设计循环，就是把一张参考图变成可用的响应式 UI 并不断迭代直到吻合——靠计划模式就方案达成一致，靠能识别图像的模型把产出与参考对照。"}, {"kind": "ol", "items": ["从你手头最清晰的视觉参考出发——并包含多种状态（桌面端和移动端、hover、空态、加载态），而不只是一张主视觉。", "在提示里写具体；含糊的提示即使配上强模型也只会产出千篇一律的 UI。", "把你的设计系统和规范放进 AGENTS.md，并告诉 Grok tokens 和规范基础元素在哪里。", "用计划模式审查方案，然后启动一个 dev server，让 Grok 在真实浏览器中渲染，调整到各个断点来检查结果。", "通过让 Grok 把自己的实现与截图对照来迭代——而不仅仅是确认它能构建。"]}, {"kind": "p", "text": "附上你的参考图，并给出具体约束："}, {"kind": "code", "lang": "bash", "code": "grok\n# 在提示里（附上 reference-desktop.png 和 reference-mobile.png）：\n> 用 React + Vite + Tailwind + TypeScript 实现这个设计。\n  复用我已有的设计系统组件和 AGENTS.md 里的 tokens。\n  匹配间距、布局和层级；做成响应式。\n  先把方案给我看，然后在浏览器里渲染并迭代，\n  直到它在各个断点上都与参考吻合。"}, {"kind": "p", "text": "让提示保持小而聚焦，提交好的迭代、回退差的迭代（回退时告诉 Grok），这样每一轮都能在一个干净的基础上推进。"}]}, {"id": "extend", "heading": "AGENTS.md、MCP 与子 agent", "blocks": [{"kind": "p", "text": "三个扩展点让 Grok CLI 适合持续的设计工作，而这三者都能干净地映射到一个开放的设计工作流上。"}, {"kind": "steps", "items": [{"label": "AGENTS.md 上下文", "body": "项目规则写在仓库根目录的 AGENTS.md 里。它是你设计规范的持久归宿，每次运行都会被读取——而且它是其他 agent 也能理解的同一种开放格式，所以这些规则会随你一起迁移。"}, {"label": "MCP 服务器", "body": "配置 MCP 服务器来引入设计上下文和外部工具，其中最相关的是 Figma MCP 服务器——它是把真实规格喂进代码的可移植方式，跨 agent 通用，不只限于 Grok。"}, {"label": "子 agent 与内置工具", "body": "Grok CLI 能派生出并行的子 agent 来同时进行调研、构建和审查，而它的文件、shell 和搜索工具让它无需离开终端就能收集参考并跑完验证循环。"}]}, {"kind": "p", "text": "这些都是可移植的多 agent 能力——正是 Open Design 旨在编排、而非在每个项目里重造的那类东西。"}]}, {"id": "vs", "heading": "做设计时 Grok CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "设计工作没有唯一赢家——每个 agent 各有所长，经验丰富的团队会把它们叠着用。一个公允的总结："}, {"kind": "table", "columns": ["Agent", "设计强项", "最适合"], "rows": [["Grok CLI", "改动落地前的计划模式审查、能识别图像的 Grok 模型，以及并行子 agent；用你的 SuperGrok 账户登录", "在循环中带着 xAI 模型、经过审查、计划优先的 UI 构建"], ["Codex", "凭借前端 skill 带来出色的视觉打磨；沙箱化的异步构建", "委派式异步构建与可移植的 AGENTS.md 规则"], ["Claude Code", "具体的设计决策（hex、间距、字体）以及理解代码库的 UX", "前端推理与大上下文重构"], ["Cursor", "带实时预览和内联编辑的可视化构建即所见循环", "在 IDE 内进行紧凑的迭代即观察 UI 工作"], ["Gemini CLI", "强大的多模态图像理解和超大上下文；开源且带免费额度", "截图密集的工作，以及把整个设计系统装进上下文"]]}, {"kind": "p", "text": "社区反复得出的结论是：品味来自人类——没有 skill、参考和约束，它们全都会退回到千篇一律的审美。这才是真正要解决的问题——而它是设计工具形态的，不是模型形态的。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避开“AI 味”观感", "blocks": [{"kind": "p", "text": "对 AI 生成设计最常见的抱怨是它看起来千篇一律——柔和的渐变、悬浮的面板、过大的圆角、夸张的阴影，一股 Inter 字体加紫色的味道，“一看就是 AI 做的”。其他被反映的问题还包括移动端布局崩坏，以及指令文字泄漏进 UI 文案。这些都不是 Grok CLI 独有的；任何 agent 在没有精选设计上下文的情况下运行都会这样。"}, {"kind": "steps", "items": [{"label": "加入一个审美 skill", "body": "一个精选的设计 skill 会迫使 agent 承诺一个真实的方向，而不是套用默认观感。"}, {"label": "在真实浏览器中验证", "body": "跨断点渲染并自检，让布局不会在移动端悄无声息地崩坏。"}, {"label": "提供 tokens 和参考", "body": "真实的设计 tokens 和参考截图是对产出质量影响最大的那个杠杆。"}, {"label": "把规则编码进 AGENTS.md", "body": "把“不要主视觉卡片、最多两种字体、品牌优先的层级”这类规则放到 agent 每次运行都会读取的地方。"}]}, {"kind": "p", "text": "注意，每一种缓解办法都是在给 agent 一份精选的设计上下文。手工地、按项目维护这份上下文，正是 Open Design 替你免去的苦差事。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Grok CLI 做设计", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一直在呼唤的开源设计层。它把 Grok CLI 当作一等适配器，并在外围包上一套精选的 skill 与设计系统库、一条结构化的渲染管线，以及一个本地桌面 UI——于是让 Grok 表现出色的那份设计上下文从第一次运行起就已就位，而不必每次都手工拼凑。Open Design 是独立的、采用 Apache-2.0 协议，并运行在你自己的机器上，这让二者天然契合。"}, {"kind": "ol", "items": ["安装 Open Design 并选择 Grok CLI 作为你的 agent。", "用你的 SuperGrok 账户或 xAI API key（BYOK）进行身份验证——凭证留在你的机器上，从不经我们中转。", "挑一个设计系统和一个 skill，然后以一致的品味生成演示稿、原型和落地页。", "每一份产物和 DESIGN.md 文件都存在你自己的仓库里，而不是托管云端。"]}, {"kind": "p", "text": "同一个 Grok CLI agent、同一套凭证——外加在外围包裹的一套真实、可移植、开源的设计工作流。它本地优先、采用 Apache-2.0，所以你的工作和凭证全都不会离开你的机器。"}]}], "faqTitle": "常见问题", "faq": [{"name": "Grok CLI 真的能做设计工作吗？", "text": "能——只要上下文里有一个审美 skill、一个设计系统和真实的参考图，Grok CLI 就能产出生产级、响应式的 UI，而它能识别图像的 Grok 模型还能帮你把产出与参考对照验证。没有这份上下文，它往往会退回到千篇一律的观感，而这正是 Open Design 要填补的缺口。"}, {"name": "我该如何对 Grok CLI 进行身份验证？", "text": "你通过浏览器以 SuperGrok 或 X Premium+ 订阅登录（`grok login`），所以无需管理 API key。对于无头或 CI 场景，你可以改用 xAI API key。无论哪种方式，Open Design 都不会中转你的凭证。"}, {"name": "Grok CLI 具体好在哪里、适合设计？", "text": "两点：它的计划模式让你在任何改动落地前审查方案，而它的 Grok 模型支持图像输入，所以它能很好地读取参考截图。两者都有帮助——但品味仍然来自你提供的设计系统、skill 和参考。"}, {"name": "前端设计该选 Grok CLI 还是 Claude Code？", "text": "两者都很强。Claude Code 以具体的、理解代码库的设计决策著称；Grok CLI 的优势在于计划模式审查和能识别图像的 xAI 模型。很多团队两者都用——Open Design 让你在不改变设计工作流的前提下切换 agent。"}, {"name": "我该如何把 Grok CLI 连接到 Figma？", "text": "把 Figma MCP 服务器加到你的 MCP 配置里。这样 Grok 就能拉取真实的设计上下文——组件、变量、布局数据——于是生成的代码会匹配源文件，而不是近似模仿。"}, {"name": "Open Design 隶属于 xAI 吗？", "text": "不是。Grok CLI 是 xAI 的产品；Open Design 是一个独立的开源项目，以一等适配器的方式支持它。Grok 是 xAI 的商标。"}, {"name": "我的文件和凭证安全吗？", "text": "安全——Open Design 本地优先且采用 Apache-2.0。你的文件、产物和 DESIGN.md 都留在你自己的仓库里，而你的 xAI 凭证由你的 agent 直接使用，绝不会经过 Open Design 的服务器路由。"}], "ctaTitle": "用 Grok CLI 做设计，以开放的方式。", "ctaBody": "带上你自己的 SuperGrok 账户或 xAI API key，让每一个文件都留在本地，并在你已经在用的 agent 外围获得一套精选的设计库。", "ctaActions": [{"label": "在 Open Design 中使用 Grok CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "查看所有受支持的 agent"},
      aboutTitle: "什么是 Grok CLI",
      aboutBody: ["Grok CLI 是 xAI 的终端编码 agent，以 Grok Build 之名发布。它读取你的代码库、编辑文件、运行 shell 命令，并在动手之前规划多步工程工作。", "它构建于 xAI 的 Grok 模型之上，这些模型支持图像输入，因此它能在编写代码的同时对一张参考截图进行推理，并会读取 AGENTS.md 来获取项目规范。", "Open Design 把 Grok CLI 当作一等适配器，于是这个 agent 能嵌入一条结构化、开源的设计管线。"],
      vendorLabel: "厂商",
      vendor: "xAI",
      credentialLabel: "凭证",
      credential: "xAI SuperGrok OAuth（`grok login`）",
      designTitle: "用 Grok CLI 做设计",
      designLead: "Grok CLI 的设计强项主要集中在它的工作流和模型上：",
      designPoints: [{"label": "能识别图像的截图 → UI", "body": "Grok 模型支持图像输入，把一张参考图变成响应式标记，并对照它检查结果。"}, {"label": "改动前的计划模式", "body": "一份你在文件改动前批准的结构化计划，让设计意图在一开始就被审查，而不是等差异出来之后。"}, {"label": "AGENTS.md + MCP", "body": "上下文文件承载你的规范；Figma MCP 服务器把真实的设计上下文带进代码。"}, {"label": "用你的账户登录", "body": "通过 SuperGrok 或 X Premium+ 以 OAuth 进行身份验证，或带上 xAI API key（BYOK）用于无头场景。"}],
      linksTitle: "实际资源",
      linksLead: "Grok CLI（Grok Build）的官方页面和文档：",
      links: [{"label": "Grok Build（Grok CLI）", "href": "https://x.ai/cli", "source": "xAI"}, {"label": "Grok Build 发布介绍", "href": "https://x.ai/news/grok-build-cli", "source": "新闻 · xAI"}, {"label": "xAI 模型文档", "href": "https://docs.x.ai/docs/models", "source": "文档 · xAI"}],
      withOdTitle: "Grok CLI + Open Design",
      withOdLead: "Open Design 是围绕 Grok CLI 的开源设计层：一套精选的 skill 与设计系统库、一条结构化的渲染管线，以及一个本地桌面 UI。",
      withOdSteps: ["安装 Open Design 并选择 Grok CLI 作为你的 agent。", "用你的 SuperGrok 账户或 xAI API key（BYOK）进行身份验证——凭证留在你的机器上。", "选择一个设计系统和 skill，然后以一致的品味生成演示稿、原型和落地页。", "产物和 DESIGN.md 文件都存在你自己的仓库里，而不是托管云端。"],
      withOdClosing: "同一个 Grok CLI agent——外加围绕它的一套真实、可移植的设计工作流。",
      faqTitle: "常见问题",
      faq: [{"name": "Open Design 是 xAI 做的吗？", "text": "不是。Grok CLI 是 xAI 的产品；Open Design 是一个独立的开源项目，以一等适配器的方式集成它。"}, {"name": "我该如何登录？", "text": "Grok CLI 通过浏览器以 SuperGrok 或 X Premium+ 订阅登录，你也可以带上 xAI API key（BYOK）。Open Design 绝不会中转你的凭证。"}, {"name": "Open Design 隶属于 xAI 吗？", "text": "不是。Open Design 是独立的；Grok 是 xAI 的商标。"}],
      ctaTitle: "用 Grok CLI 做设计，以开放的方式。",
      ctaBody: "为仓库点 Star、下载桌面应用，或加入社区来申请一个适配器。",
    },
    kimi: {
      title: "用于设计的 Kimi CLI — Open Design",
      description: "人们如何使用 Moonshot AI 的 Kimi CLI 进行 UI 和网页设计——借助其 Kimi K2 智能体模型、超大上下文、AGENTS.md 与 MCP——以及 Open Design 如何把 Kimi CLI 变成一个本地优先、开源的设计智能体。",
      breadcrumb: "Kimi CLI",
      label: "智能体 · Kimi CLI",
      heading: "用于设计的 Kimi CLI。",
      lead: "Kimi CLI 是 Moonshot AI 推出的开源终端智能体，由 Kimi K2 系列模型驱动。它强大的智能体式编码能力和超大上下文窗口，让它能够装下整套设计系统并对照参考稿反复迭代——只要你给它约定和一套验证闭环，它就会成为真正的设计工具。Open Design 把它接入了一套开源的设计工作流：用你自己的 Moonshot API 密钥、你自己的文件，本地优先。",
      tldrTitle: "太长不看",
      tldrBody: "Kimi CLI 凭借智能体式的 Kimi K2 模型和超大上下文窗口，把参考稿和约定转化为响应式 UI，支持 BYOK 或 OAuth 登录。Open Design 为它配备了精选的设计系统与 skill 库以及桌面工作流——自带密钥（BYOK），一切都留在本地。",
      toc: ["什么是 Kimi CLI", "用 Kimi CLI 做设计", "资源", "搭配 Open Design", "常见问题"],
      rich: {"heroCtaLead": "Open Design 把 Kimi CLI 变成一个本地优先、开源的设计智能体——用你自己的 Moonshot API 密钥、你自己的文件，外加一套环绕它的精选 skill 与设计系统库。", "heroCtaActions": [{"label": "在 Open Design 中使用 Kimi CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Kimi CLI 是 Moonshot AI 面向终端推出的开源 AI 智能体。有两点让它在设计场景中格外值得关注：它由 Kimi K2 系列驱动——这是一个万亿参数的混合专家模型，专为智能体式编码与工具调用精心优化；而这个模型还带有超大上下文窗口（近期 K2 版本可达 256k tokens），足以一次性装下整套设计系统和代码库。配合恰当的参考稿、约定和一套验证闭环，它能构建出真正可用的响应式 UI——你可以从 OAuth 登录起步，也可以用自己的 Moonshot API 密钥。本文是一份实用的端到端指南，讲述如何用 Kimi CLI 做 UI、前端和设计系统方面的工作，并把它接入由 Open Design 支撑的结构化设计工作流。", "内容涵盖：Kimi CLI 究竟是什么，为什么它智能体式的 Kimi K2 模型和超大上下文适合做设计，如何从零开始把它配置起来，从参考稿到 UI 的闭环，AGENTS.md、MCP 与子智能体如何扩展它，它与 Codex、Claude Code、Cursor 和 Gemini CLI 的对比，哪些坑会让 AI 产物看起来千篇一律，以及 Open Design 如何作为一个开放、本地优先的设计层来弥合落差——这是一对天然的搭配，因为两者都是开源的、都运行在你自己的机器上。"], "heroImage": {"src": "/agents/kimi-design/kimi-design-hero.webp", "alt": "Kimi CLI 设计反馈闭环：一个终端智能体读取参考图、一个浏览器渲染 UI、一个工作区，外加一条回流的反馈箭头", "caption": "核心闭环：Kimi CLI 在终端里读取你的参考稿，在真实浏览器中构建并验证 UI，对照参考不断迭代——而整套设计系统都在上下文之中。"}, "tocLabel": "本页内容", "toc": [{"id": "what-is-kimi", "label": "Kimi CLI 究竟是什么"}, {"id": "why-design", "label": "为什么智能体式 K2 + 超大上下文适合做设计"}, {"id": "setup", "label": "为设计配置 Kimi CLI（从零开始）"}, {"id": "screenshot-workflow", "label": "从参考稿到 UI 的工作流"}, {"id": "extend", "label": "AGENTS.md、MCP 与子智能体"}, {"id": "vs", "label": "Kimi CLI 对比 Codex、Claude Code、Cursor 与 Gemini CLI"}, {"id": "pitfalls", "label": "常见坑与“AI 味”外观"}, {"id": "open-design", "label": "在 Open Design 中用 Kimi CLI 做设计"}, {"id": "faq", "label": "常见问题"}], "sections": [{"id": "what-is-kimi", "heading": "Kimi CLI 究竟是什么", "blocks": [{"kind": "p", "text": "Kimi CLI 是 Moonshot AI 面向终端发布的一款开源（Apache-2.0）AI 智能体。它会读取你的仓库、编辑文件、运行 shell 命令、搜索文件、抓取网页，并根据得到的反馈决定下一步——它从自然语言任务出发去规划和验证工作，而不仅仅是补全代码行。它是一个 Python 工具，用 uv 安装，背后驱动着 Kimi K2 模型家族。"}, {"kind": "p", "text": "在设计工作中，有两个特性尤为突出。Kimi K2 模型明确针对智能体式、长链路的编码与工具调用做了调优，因此智能体能把一项多步骤的构建任务一直推进到可用的结果。而上下文窗口在近期 K2 版本中可达 256k tokens，足以一次性装下你的整套设计系统、组件库和参考集，而不必把它们压缩概括掉。"}, {"kind": "steps", "items": [{"label": "上下文文件", "body": "Kimi CLI 会读取一个 AGENTS.md 文件作为持久的项目上下文——这正是编写你的设计约定、tokens 和评审清单的天然之处。对于尚未配置的项目，运行 /init 即可为其生成一个。"}, {"label": "MCP、ACP + 子智能体", "body": "它通过 /mcp-config 以对话方式管理 MCP 服务器，通过 Agent Client Protocol（kimi acp）把会话暴露给 Zed 和 JetBrains，并能在隔离的上下文中调度内置的 coder、explore 和 plan 子智能体。"}, {"label": "登录或 BYOK", "body": "首次启动时，/login 让你通过 OAuth（Kimi Code）授权，或输入你自己的 Moonshot API 密钥；Kimi 的平台还提供 OpenAI 兼容和 Anthropic 兼容的端点。"}]}, {"kind": "ul", "items": ["厂商：Moonshot AI", "凭证：Moonshot API 密钥（BYOK），或通过 Kimi Code 进行 OAuth 登录", "许可证：Apache-2.0，开源"]}]}, {"id": "why-design", "heading": "为什么智能体式 K2 模型和超大上下文适合做设计", "blocks": [{"kind": "p", "text": "Kimi CLI 的设计优势来自两项模型特性——但和所有智能体一样，审美品味仍然得由你来提供。"}, {"kind": "steps", "items": [{"label": "智能体式、长链路编码", "body": "Kimi K2 模型针对工具调用和多步骤工作做了优化，因此智能体能拿着参考稿和需求说明，真正去构建、运行并打磨 UI，而不是止步于初稿。"}, {"label": "超大上下文窗口", "body": "近期 K2 版本可达 256k tokens，意味着整套设计系统、tokens 和大量参考状态能一次性装下，于是智能体会复用你真实的基础元素，而不是凭空造出一次性的样式。"}, {"label": "把约定写进 AGENTS.md", "body": "一份 AGENTS.md（外加一个像 Figma 这样的 MCP 服务器）把智能体指向你的 tokens、组件和真实规范，于是它是在对照某个品牌工作，而不是套用默认外观。"}]}, {"kind": "image", "src": "/agents/kimi-design/kimi-design-taste-triangle.webp", "alt": "示意图，展示设计系统、skill 和参考图汇聚成优秀的设计产出", "caption": "品味来自你提供的三项输入：一套设计系统、一个 skill，以及真实的参考图。"}, {"kind": "p", "text": "这条教训和每个智能体教会我们的都一样：Kimi CLI 默认并不具备品味。当你给它约束——一套设计系统、一个审美 skill 和具体的参考稿——它就能产出优秀的设计。Open Design 恰恰把这些输入打包好了，这也是两者契合的原因（下文详述）。"}]}, {"id": "setup", "heading": "从零开始为设计工作配置 Kimi CLI", "blocks": [{"kind": "p", "text": "下面是从一台干净的机器到一个能构建并验证 UI 的 Kimi CLI 的完整路径。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安装 Kimi CLI（使用 uv；Python 3.12–3.14，推荐 3.13）\ncurl -LsSf https://code.kimi.com/install.sh | bash\n# 或者，如果你已经装了 uv：\nuv tool install --python 3.13 kimi-cli\n\n# 2. 在你的项目中启动它，并在首次运行时完成认证\ncd your-project\nkimi              # 然后运行 /login：通过 Kimi Code 进行 OAuth，或粘贴一个 Moonshot API 密钥\n\n# 3. 生成项目上下文\n/init             # 为该项目生成一个 AGENTS.md\n\n# 4. 接入一个 MCP 服务器（可选，例如用 Figma 做设计交付）\n/mcp-config       # 以对话方式添加、编辑和认证 MCP 服务器"}, {"kind": "image", "src": "/agents/kimi-design/kimi-design-setup-flow.webp", "alt": "五步配置流程：安装、认证、配置 AGENTS.md、添加 skill、验证", "caption": "配置顺序：安装 → 认证 → 配置 AGENTS.md → 添加 skill → 启用浏览器验证。"}, {"kind": "steps", "items": [{"label": "把你的设计规则写下来", "body": "把你的 tokens、基础元素和约定写进 AGENTS.md 并让 Kimi 指向它们，这样产出就会贴合某个品牌，而不是退回到千篇一律的外观。"}, {"label": "加上浏览器验证", "body": "接入一个 Playwright 或浏览器 MCP，让 Kimi 在真实浏览器中渲染，并在各个断点上检查产出，而不只是确认构建能通过。"}]}]}, {"id": "screenshot-workflow", "heading": "从参考稿到 UI 的工作流", "blocks": [{"kind": "p", "text": "在 Kimi CLI 上收益最高的设计闭环，就是把参考素材转化为可用的响应式 UI，并不断迭代直到匹配——把参考稿喂给智能体，让它在真实浏览器中把渲染产出与参考稿对照回看。"}, {"kind": "ol", "items": ["从你手头最清晰的参考稿出发——并且包含多种状态（桌面端和移动端、悬停态、空状态、加载态），而不只是一张主视觉图。", "在提示词里说清楚；含糊的提示词即便配上强大的智能体，也会产出千篇一律的 UI。", "把你的设计系统和约定放进 AGENTS.md，并告诉 Kimi tokens 和规范性基础元素位于何处。", "运行一个开发服务器，让 Kimi 在真实浏览器中渲染，并调整到各个断点来检查结果。", "让 Kimi 把自己的实现与参考稿对照回看来迭代——而不只是确认它能构建通过。"]}, {"kind": "p", "text": "把 Kimi 指向你的参考稿和开发服务器，然后给出具体的约束："}, {"kind": "code", "lang": "bash", "code": "kimi\n# 在提示词中：\n> 使用 React + Vite + Tailwind + TypeScript 实现 ./references 中的设计\n  （reference-desktop.png、reference-mobile.png）。\n  复用我已有的设计系统组件，以及 AGENTS.md 中的 tokens。\n  匹配间距、布局和层级；做成响应式。\n  运行开发服务器，在浏览器中渲染，并不断迭代，\n  直到它在各个断点上都与参考稿匹配。"}, {"kind": "p", "text": "让提示词保持小而聚焦，提交好的迭代、回退差的迭代（回退时告诉 Kimi），这样每一轮都建立在一个干净的基础之上。当某个流程难以用文字描述时，Kimi CLI 也可以接收一段简短的屏幕录制或演示片段。"}]}, {"id": "extend", "heading": "AGENTS.md、MCP 与子智能体", "blocks": [{"kind": "p", "text": "三个扩展点让 Kimi CLI 能够胜任持续的设计工作，而且这三者都能干净地映射到一套开放的设计工作流上。"}, {"kind": "steps", "items": [{"label": "AGENTS.md 上下文", "body": "项目规则存放在仓库根目录的 AGENTS.md 中。它是你设计约定的持久归宿，每次运行都会被读取——而且它是其他智能体也在用的同一种可移植格式。"}, {"label": "MCP 服务器", "body": "用 /mcp-config 以对话方式添加 MCP 服务器——这是引入设计上下文和外部工具的可移植方式，其中最相关的是 Figma MCP 服务器，它们能跨智能体通用，而不只对 Kimi 有效。"}, {"label": "子智能体与插件市场", "body": "在隔离的上下文中调度内置的 coder、explore 和 plan 子智能体，并从市场或任意 GitHub 仓库安装 skill、MCP 服务器和数据源，用来收集参考稿并跑通验证闭环。"}]}, {"kind": "p", "text": "这些都是可移植的、跨智能体的能力——而这恰恰是 Open Design 生来要去编排的东西，而不是每个项目都重造一遍。"}]}, {"id": "vs", "heading": "做设计时 Kimi CLI 对比 Codex、Claude Code、Cursor 与 Gemini CLI", "blocks": [{"kind": "p", "text": "在设计工作上没有唯一的赢家——每个智能体各有所长，有经验的团队会把它们叠在一起用。一个中肯的总结："}, {"kind": "table", "columns": ["智能体", "设计优势", "最适合"], "rows": [["Kimi CLI", "针对长链路编码和工具调用调优的智能体式 Kimi K2 模型，搭配超大上下文；开源且 BYOK", "多步骤构建，以及以低成本把整套设计系统装进上下文"], ["Codex", "凭借前端 skill 实现出色的视觉打磨；沙箱化的异步构建", "委派式异步构建，以及可移植的 AGENTS.md 规则"], ["Claude Code", "具体的设计决策（色值、间距、字体）以及理解代码库的 UX", "前端推理与大上下文重构"], ["Cursor", "带实时预览和行内编辑的“边构建边看”视觉闭环", "在 IDE 内紧密的“迭代即看”UI 工作"], ["Gemini CLI", "强大的多模态图像理解能力和 1M-token 上下文；免费档", "大量依赖截图的工作以及超大上下文"]]}, {"kind": "p", "text": "社区反复得出的结论是：品味来自人类——它们在没有 skill、参考稿和约束的情况下，都会退回到一种千篇一律的审美。这才是真正要解决的问题——而它是设计工具形态的问题，不是模型形态的问题。"}]}, {"id": "pitfalls", "heading": "常见坑，以及如何避免“AI 味”外观", "blocks": [{"kind": "p", "text": "对 AI 生成设计最常见的抱怨就是它看起来千篇一律——柔和渐变、漂浮面板、超大圆角、夸张阴影，一股“一眼就是 AI 做的”的 Inter 加紫色的气味。其他被反映的问题还包括移动端布局崩坏，以及指令文字泄漏进 UI 文案。这些都不是 Kimi CLI 独有的；只要任何智能体在缺乏精选设计上下文的情况下运行，就会出现这些情况。"}, {"kind": "steps", "items": [{"label": "加上一个审美 skill", "body": "一个精选的设计 skill 会逼着智能体确立一个真实的方向，而不是套用默认外观。"}, {"label": "在真实浏览器中验证", "body": "让 Kimi 渲染并在各个断点上自检，这样布局就不会在移动端悄无声息地崩坏。"}, {"label": "提供 tokens 和参考稿", "body": "真实的设计 tokens 和参考截图是对产出质量影响最大的那个杠杆。"}, {"label": "把规则写进 AGENTS.md", "body": "把“不要主视觉卡片、最多两种字体、品牌优先的层级”这类风格规则，放在智能体每次运行都会读到的地方。"}]}, {"kind": "p", "text": "注意，每一项缓解措施都是关于给智能体一份精选的设计上下文。逐个项目地用手维护这份上下文，正是 Open Design 帮你免去的苦差事。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Kimi CLI 做设计", "blocks": [{"kind": "p", "text": "Open Design 正是上面这套工作流一直在呼唤的那个开源设计层。它把 Kimi CLI 当作一等适配器，并用精选的 skill 与设计系统库、一条结构化的渲染流水线，以及一个本地桌面 UI 把它包裹起来——于是让 Kimi 表现出色的那份设计上下文从第一次运行就已就位，无需每次手动拼凑。两者都是开源、本地优先的，这让这对组合成为天然的契合。"}, {"kind": "ol", "items": ["安装 Open Design，并选择 Kimi CLI 作为你的智能体。", "用你的 Moonshot API 密钥认证（BYOK）——凭证留在你的机器上，绝不经我们代理。", "选定一套设计系统和一个 skill，然后以一致的品味生成演示稿、原型和落地页。", "每一份产物和 DESIGN.md 文件都存放在你自己的仓库里，而不是托管的云端。"]}, {"kind": "p", "text": "同一个 Kimi CLI 智能体、同一把密钥——外加一套环绕它的、真实可移植的开源设计工作流。它本地优先、采用 Apache-2.0，所以你的工作内容和凭证都不会离开你的机器。"}]}], "faqTitle": "常见问题", "faq": [{"name": "Kimi CLI 真的能做设计工作吗？", "text": "能——只要上下文里有一个审美 skill、一套设计系统和真实的参考图，Kimi CLI 就能产出生产级、响应式的 UI，而它智能体式的 Kimi K2 模型还能渲染产出并对照参考稿做验证。缺了这份上下文，它往往会退回到千篇一律的外观，而这正是 Open Design 要填补的落差。"}, {"name": "用 Kimi CLI 做设计需要付费吗？", "text": "你自带凭证：通过 Kimi Code 的 OAuth 登录授权，或粘贴一个 Moonshot API 密钥（BYOK），由 Moonshot 平台计费。无论哪种方式，Open Design 都绝不代理你的凭证。"}, {"name": "Kimi CLI 具体好在哪、为什么适合设计？", "text": "两点：Kimi K2 模型针对智能体式、长链路的编码与工具调用做了调优，因此智能体能一路构建和打磨直到拿出可用的结果；而上下文窗口可达 256k tokens，足以一次性装下整套设计系统和参考集。两者都有帮助——但品味仍来自你提供的设计系统、skill 和参考稿。"}, {"name": "前端设计该用 Kimi CLI 还是 Claude Code？", "text": "两者都很强。Claude Code 以具体的、理解代码库的设计决策著称；Kimi CLI 的优势在于它智能体式的 Kimi K2 模型，以及带 BYOK 经济性的超大上下文。许多团队两者都用——Open Design 让你在不改变设计工作流的前提下切换智能体。"}, {"name": "我该如何把 Kimi CLI 连接到 Figma？", "text": "在 Kimi CLI 内运行 /mcp-config，来添加并认证 Figma MCP 服务器。随后 Kimi 就能拉取真实的设计上下文——组件、变量、布局数据——让生成的代码贴合源头，而不是近似还原。"}, {"name": "Open Design 隶属于 Moonshot AI 吗？", "text": "不。Kimi CLI 是 Moonshot AI 的产品；Open Design 是一个独立的开源项目，把它作为一等适配器来支持。Kimi 是 Moonshot AI 的商标。"}, {"name": "我的文件和凭证安全吗？", "text": "安全——Open Design 本地优先、采用 Apache-2.0。你的文件、产物和 DESIGN.md 都留在你自己的仓库里，而你的 Moonshot 凭证由你的智能体直接使用，绝不经 Open Design 服务器中转。"}], "ctaTitle": "用开放的方式，与 Kimi CLI 一起做设计。", "ctaBody": "自带你的 Moonshot API 密钥，让每个文件都留在本地，并为你已经在用的智能体配上一套精选的设计库。", "ctaActions": [{"label": "在 Open Design 中使用 Kimi CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "查看所有受支持的智能体"},
      aboutTitle: "什么是 Kimi CLI",
      aboutBody: ["Kimi CLI 是 Moonshot AI 推出的开源（Apache-2.0）终端 AI 智能体，由 Kimi K2 系列模型驱动。它会读取你的代码库、编辑文件、运行命令、搜索文件并抓取网页。", "Kimi K2 模型针对智能体式、长链路的编码做了调优，上下文窗口可达 256k tokens，因此能一次性装下整套设计系统。", "Open Design 把 Kimi CLI 当作一等适配器，让这个智能体能嵌入一条结构化、开源的设计流水线。"],
      vendorLabel: "厂商",
      vendor: "Moonshot",
      credentialLabel: "凭证",
      credential: "Moonshot API 密钥（BYOK）",
      designTitle: "用 Kimi CLI 做设计",
      designLead: "Kimi CLI 的设计优势主要围绕它的模型和上下文：",
      designPoints: [{"label": "智能体式的 参考稿 → UI", "body": "长链路的 Kimi K2 编码把参考稿转化为响应式标记，并在真实浏览器中对照参考核查结果。"}, {"label": "256k-token 上下文", "body": "整套设计系统、组件库和参考集能一次性装下，于是产出会复用你真实的基础元素。"}, {"label": "AGENTS.md + MCP", "body": "上下文文件承载你的约定；Figma MCP 服务器把真实的设计上下文带入代码。"}, {"label": "开放且 BYOK", "body": "Apache-2.0，支持 OAuth 登录或你自己的 Moonshot API 密钥，外加 OpenAI 兼容和 Anthropic 兼容的端点。"}],
      linksTitle: "实战资源",
      linksLead: "Kimi CLI 的官方仓库和文档：",
      links: [{"label": "MoonshotAI/kimi-cli（GitHub）", "href": "https://github.com/MoonshotAI/kimi-cli", "source": "GitHub · Moonshot AI"}, {"label": "Kimi CLI 文档 — 快速上手", "href": "https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html", "source": "文档 · Moonshot AI"}, {"label": "Kimi K2（GitHub）", "href": "https://github.com/MoonshotAI/Kimi-K2", "source": "GitHub · Moonshot AI"}],
      withOdTitle: "Kimi CLI + Open Design",
      withOdLead: "Open Design 是环绕 Kimi CLI 的开源设计层：精选的 skill 与设计系统库、一条结构化的渲染流水线，以及一个本地桌面 UI。",
      withOdSteps: ["安装 Open Design，并选择 Kimi CLI 作为你的智能体。", "用你的 Moonshot API 密钥认证（BYOK）——凭证留在你的机器上。", "选定一套设计系统和一个 skill，然后以一致的品味生成演示稿、原型和落地页。", "产物和 DESIGN.md 文件都存放在你自己的仓库里，而不是托管的云端。"],
      withOdClosing: "同一个 Kimi CLI 智能体——外加一套环绕它的、真实可移植的设计工作流。",
      faqTitle: "常见问题",
      faq: [{"name": "Open Design 是 Moonshot AI 做的吗？", "text": "不。Kimi CLI 是 Moonshot AI 的产品；Open Design 是一个独立的开源项目，把它作为一等适配器集成进来。"}, {"name": "我需要付费吗？", "text": "你自带凭证——OAuth 登录或一个 Moonshot API 密钥（BYOK），由 Moonshot 计费。Open Design 绝不代理你的凭证。"}, {"name": "Open Design 隶属于 Moonshot AI 吗？", "text": "不。Open Design 是独立的；Kimi 是 Moonshot AI 的商标。"}],
      ctaTitle: "用开放的方式，与 Kimi CLI 一起做设计。",
      ctaBody: "为仓库点 Star、下载桌面应用，或加入社区来申请一个适配器。",
    },
    deepseek: {
      title: "用于设计的 DeepSeek TUI —— Open Design",
      description: "人们如何用一个由 DeepSeek 驱动的终端编码 agent 进行 UI 与网页设计——它强大的编码模型、100 万 token 上下文、成本效率、上下文文件与 MCP——以及 Open Design 如何把 DeepSeek TUI 变成一个本地优先、开源的设计 agent。",
      breadcrumb: "DeepSeek TUI",
      label: "Agent · DeepSeek TUI",
      heading: "用于设计的 DeepSeek TUI。",
      lead: "DeepSeek TUI 是一个由 DeepSeek 模型驱动的终端编码 agent。它强大且具成本效率的编码模型，加上 100 万 token 的上下文，可以一次性容纳整套设计系统和代码库，这让它成为一款真正的设计工具——前提是你给它参考、规范以及一套验证循环。Open Design 把它接入开源设计工作流：用你自己的 DeepSeek API 密钥、你自己的文件，本地优先。",
      tldrTitle: "TL;DR",
      tldrBody: "DeepSeek TUI 借助强大的编码模型、巨大的上下文窗口以及极低的单 token 成本，把描述出来的布局和参考规范转化为响应式 UI——自带你自己的 DeepSeek API 密钥。Open Design 为它配上一套精选的设计系统与 skill 库，外加一套桌面工作流——BYOK，并把一切都留在本地。",
      toc: ["什么是 DeepSeek TUI", "用 DeepSeek TUI 做设计", "资源", "搭配 Open Design", "常见问题"],
      rich: {"heroCtaLead": "Open Design 把 DeepSeek TUI 变成一个本地优先、开源的设计 agent——用你自己的 DeepSeek API 密钥、你自己的文件，并在它周围配上一套精选的 skill 与设计系统库。", "heroCtaActions": [{"label": "在 Open Design 内使用 DeepSeek TUI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["DeepSeek TUI 是一个由 DeepSeek 模型驱动、基于终端的 AI 编码 agent。它在设计上之所以值得关注，有两点：它的编码模型既强大又异常具成本效率，因此你可以放开手脚地反复迭代而无需盯着计费表；它的上下文窗口最高可达 100 万 token，大到足以一次性容纳整套设计系统和代码库，而不必把它们压缩省略掉。配上恰当的参考、规范以及一套验证循环，它就能构建出真正的、响应式的 UI。这是一份实用的端到端指南，讲解如何用一个由 DeepSeek 驱动的终端 agent 来做 UI、前端与设计系统相关的工作，并把它接入 Open Design 的结构化设计工作流。", "本文涵盖：DeepSeek TUI 究竟是什么，为什么强大的编码模型、巨大的上下文和低成本恰好契合设计，如何从零开始把它配置好，从参考到 UI 的循环，上下文文件与 MCP 如何扩展它，它与 Codex、Claude Code、Cursor 和 Gemini CLI 相比如何，让 AI 产出显得平庸的那些陷阱，以及 Open Design 如何作为一个开放、本地优先的设计层来弥合这道鸿沟——这是天然的搭配，因为两者都开源、都跑在你自己的机器上。"], "heroImage": {"src": "/agents/deepseek-design/deepseek-design-hero.webp", "alt": "DeepSeek TUI 设计反馈循环：一个终端 agent 读取参考与规范，一个浏览器渲染 UI，以及一个工作区，还有一条反馈箭头回环", "caption": "核心循环：DeepSeek TUI 在终端里读取你的参考和规范，在真实浏览器中构建并验证 UI，然后对照它们迭代——而整套设计系统都在上下文里。"}, "tocLabel": "本页内容", "toc": [{"id": "what-is-deepseek", "label": "DeepSeek TUI 究竟是什么"}, {"id": "why-design", "label": "为什么强大的编码模型 + 巨大上下文契合设计"}, {"id": "setup", "label": "为设计配置 DeepSeek TUI（从零开始）"}, {"id": "screenshot-workflow", "label": "从参考到 UI 的工作流"}, {"id": "extend", "label": "上下文文件、MCP 与工具"}, {"id": "vs", "label": "DeepSeek TUI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "陷阱与“AI 味”外观"}, {"id": "open-design", "label": "在 Open Design 中用 DeepSeek TUI 做设计"}, {"id": "faq", "label": "常见问题"}], "sections": [{"id": "what-is-deepseek", "heading": "DeepSeek TUI 究竟是什么", "blocks": [{"kind": "p", "text": "DeepSeek TUI 是一个以键盘操作为主、运行 DeepSeek 模型的终端 AI agent。它读取你的代码仓库、编辑文件、运行 shell 命令、管理 git，还能搜索网络——它根据自然语言任务来规划并验证工作，而不只是补全代码行。DeepSeek 本身是模型提供方：一个与 OpenAI 兼容的 API（它还暴露了一个 Anthropic 格式的端点），因此只要设置一个 base URL 和密钥，就能把大量社区终端 agent 指向 DeepSeek。好几个开源 TUI 都把 DeepSeek 作为一等公民般的提供方内置支持。"}, {"kind": "p", "text": "对设计工作而言，有三个特性尤为突出。DeepSeek 的编码模型很强，因此 agent 能根据清晰的描述对布局、结构和组件层级进行推理。它的上下文窗口最高可达 100 万 token，大到足以一次性容纳你整套设计系统和组件库。而它的单 token 价格很低，再叠加前缀上下文缓存——所以围绕一个设计反复迭代成本很低。"}, {"kind": "steps", "items": [{"label": "上下文文件", "body": "终端 agent 会读取一个项目上下文文件（AGENTS.md 风格的文件，或该 agent 自己的约定）以获取持久规则——这是编码你的设计规范、tokens 和评审清单的天然位置。"}, {"label": "工具 + MCP", "body": "大多数 DeepSeek TUI 都内置文件、shell、git 和网络工具，并支持 MCP 服务器以接入外部上下文，比如一个实时的 Figma 文件——DeepSeek 的 API 支持工具调用，而这些 agent 正依赖于此。"}, {"label": "自带密钥", "body": "你用一个来自 DeepSeek 平台的 DeepSeek API 密钥进行鉴权。由于该 API 与 OpenAI 兼容，把一个 agent 指向 DeepSeek 通常只需两行：base URL 和密钥。"}]}, {"kind": "ul", "items": ["厂商：DeepSeek（模型与 API 提供方）", "凭证：来自 DeepSeek 平台的 DeepSeek API 密钥（BYOK）", "模型：deepseek-v4-flash 和 deepseek-v4-pro（纯文本；无原生图像输入）"]}]}, {"id": "why-design", "heading": "为什么强大的编码模型和巨大上下文契合设计", "blocks": [{"kind": "p", "text": "DeepSeek TUI 的设计优势来自模型本身及其经济性——但和每一个 agent 一样，品味仍然得由你来提供。"}, {"kind": "steps", "items": [{"label": "强大且具成本效率的编码", "body": "DeepSeek 的编码模型能力强且价格低廉，因此 agent 能很好地推理布局与结构，而你可以一遍又一遍地迭代，成本不再是约束。"}, {"label": "100 万 token 的上下文窗口", "body": "大上下文意味着整套设计系统、tokens 以及许多参考状态都能一次性放进去，于是 agent 会复用你真实的基础组件，而不是临时发明一次性的样式——而上下文缓存让重复的提示保持低成本。"}, {"label": "把规范写进上下文文件", "body": "一个项目上下文文件（再加上 Figma MCP 服务器）把 agent 指向你的 tokens、组件和真实规格，于是它是面向一个品牌工作，而不是一套默认外观。"}]}, {"kind": "image", "src": "/agents/deepseek-design/deepseek-design-taste-triangle.webp", "alt": "图示：设计系统、skill 和参考汇聚成优秀的设计产出", "caption": "品味来自你提供的三项输入：一套设计系统、一个 skill，以及真实的参考。"}, {"kind": "p", "text": "这个教训和每个 agent 教给我们的一样：DeepSeek TUI 默认并不具备品味。当你给它约束时，它才能产出优秀的设计——一套设计系统、一个审美 skill，以及具体的参考。Open Design 恰好把这些输入打包好，这正是两者契合的原因（下文还有更多）。"}]}, {"id": "setup", "heading": "从零开始，为设计工作配置 DeepSeek TUI", "blocks": [{"kind": "p", "text": "这是从一台干净的机器到一个能构建并验证 UI 的 DeepSeek TUI 的完整路径。具体的安装和命令名称会因你选用哪个终端 agent 而异，所以下面的步骤停留在对各个 agent 都成立的层面上。"}, {"kind": "code", "lang": "bash", "code": "# 1. 从 DeepSeek 平台获取一个 DeepSeek API 密钥\n#    https://platform.deepseek.com\nexport DEEPSEEK_API_KEY=sk-...\n\n# 2. 安装一个支持 DeepSeek 的终端 agent（按其 README 操作），\n#    然后把它指向 DeepSeek。该 API 与 OpenAI 兼容：\n#      base URL: https://api.deepseek.com\n#      model:    deepseek-v4-flash（或 deepseek-v4-pro）\n#    （/anthropic 处还有一个 Anthropic 格式的端点）\n\n# 3. 在你的项目里启动它并生成项目上下文\ncd your-project\n#   创建/搭建一个写有你设计规则的项目上下文文件\n\n# 4. 接入 Figma MCP 服务器（可选，用于设计交付）\n#    把它加入该 agent 的 MCP 服务器配置"}, {"kind": "image", "src": "/agents/deepseek-design/deepseek-design-setup-flow.webp", "alt": "五步配置流程：获取密钥、安装 agent、配置上下文文件、添加 skill、验证", "caption": "配置顺序：获取密钥 → 把 agent 指向 DeepSeek → 配置上下文文件 → 添加 skill → 启用浏览器验证。"}, {"kind": "steps", "items": [{"label": "编码你的设计规则", "body": "把你的 tokens、基础组件和规范放进 agent 的上下文文件并把它指向这些内容，让产出贴合一个品牌，而不是退回到一套平庸的默认外观。"}, {"label": "加入浏览器验证", "body": "接入一个 Playwright 或浏览器 MCP，让 agent 在真实浏览器中渲染，并跨断点检查其产出，而不只是确认构建通过。"}]}]}, {"id": "screenshot-workflow", "heading": "从参考到 UI 的工作流", "blocks": [{"kind": "p", "text": "DeepSeek 的模型是纯文本的——它们不原生读取图像——所以收益最高的设计循环，是把清晰的参考和描述出来的布局转化为可工作的、响应式的 UI，然后在真实浏览器中验证结果，而不是让模型去“看”一张截图。"}, {"kind": "ol", "items": ["从你手头最清晰的参考出发——并描述出多种状态（桌面端和移动端、悬停、空态、加载中），而不只是一张主视觉。", "在提示里要具体；即便用强大的模型，含糊的提示也会产出平庸的 UI。把间距、层级以及要复用的组件讲清楚。", "把你的设计系统和规范放在上下文文件里，并告诉 agent tokens 和规范化的基础组件位于何处。", "运行一个 dev server，让 agent 在真实浏览器中渲染，并调整到各个断点来检查结果——验证就发生在这里，因为模型本身看不到图像。", "通过让 agent 把渲染出的 DOM 和计算样式与你描述的规格相对照来迭代——而不仅仅是确认它能构建通过。"]}, {"kind": "p", "text": "精确地描述目标，并给出具体约束："}, {"kind": "code", "lang": "bash", "code": "# 在 agent 的提示里：\n> 用 React + Vite + Tailwind + TypeScript 实现这个设计。\n  布局：两栏式仪表盘，240px 侧边栏，24px 间距，\n  卡片网格在 桌面/平板/移动 下分别为 3/2/1 列。\n  复用上下文文件里我已有的设计系统组件和 tokens。\n  在间距、布局和层级上保持一致；做成响应式。\n  运行 dev server，在浏览器中渲染，并跨断点对照\n  规格迭代，直到匹配为止。"}, {"kind": "p", "text": "让提示保持小而聚焦，把好的迭代提交、把坏的回退（回退时告诉 agent），这样每一轮都建立在一个干净的基础上。"}]}, {"id": "extend", "heading": "上下文文件、MCP 与工具", "blocks": [{"kind": "p", "text": "有三个扩展点能让 DeepSeek TUI 适用于持续的设计工作，而这三者都能干净地对应到一套开放的设计工作流上。"}, {"kind": "steps", "items": [{"label": "项目上下文文件", "body": "项目规则存放在仓库根目录的一个上下文文件里（带有全局层和团队层）。它是你设计规范的持久归宿，每次运行都会被读取。"}, {"label": "MCP 服务器", "body": "在 agent 里配置 MCP 服务器——这是引入设计上下文和外部工具的可移植方式，其中最相关的就是 Figma MCP 服务器，它们能跨多个 agent 通用，而不只在某一个里有效。DeepSeek 的 API 支持这些服务器所依赖的工具调用。"}, {"label": "内置工具", "body": "DeepSeek TUI 内置文件、shell、git 和网络工具，让 agent 无需离开终端就能收集参考并跑完验证循环。"}]}, {"kind": "p", "text": "这些都是可移植的、多 agent 通用的能力——正是 Open Design 生来要去编排的那类东西，而不是在每个项目里重新造一遍。"}]}, {"id": "vs", "heading": "在设计上，DeepSeek TUI vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "在设计工作上并没有唯一的赢家——每个 agent 都有不同的强项，有经验的团队会把它们叠加使用。一个公允的概括："}, {"kind": "table", "columns": ["Agent", "设计强项", "最适合"], "rows": [["DeepSeek TUI", "强大、极具成本效率的编码模型，开放权重，100 万 token 上下文；纯文本（无原生视觉）", "在预算之内做高频迭代，并把整套设计系统持有在上下文中"], ["Codex", "出色的视觉打磨配上前端 skill；沙箱化的异步构建", "委派式异步构建以及可移植的 AGENTS.md 规则"], ["Claude Code", "具体的设计决策（hex 色值、间距、字体）以及理解代码库的 UX", "前端推理与大上下文重构"], ["Cursor", "带实时预览和行内编辑的可视化“边构建边看”循环", "在 IDE 内进行紧凑的“迭代-观察”式 UI 工作"], ["Gemini CLI", "原生多模态图像理解以及 100 万 token 上下文；开源且有免费额度", "大量依赖截图、需要 agent 直接读取参考的工作"]]}, {"kind": "p", "text": "社区反复得出的结论是：品味来自人类——在没有 skills、参考和约束的情况下，它们全都会退回到一套平庸的审美。这才是真正要解决的问题——而它的形态像是个设计工具问题，而非模型问题。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避免“AI 味”外观", "blocks": [{"kind": "p", "text": "对 AI 生成设计最常见的抱怨是它看起来很平庸——柔和的渐变、漂浮的面板、过大的圆角、夸张的阴影，一种 Inter 字体加紫色的调调，“一看就是 AI 做的”。其他被反映的问题还包括移动端布局错乱，以及指令文字泄漏进 UI 文案里。这些都不是 DeepSeek TUI 独有的；任何 agent 在缺少精选设计上下文的情况下运行都会这样。由于 DeepSeek 是纯文本的，在真实浏览器中验证就尤为重要，而不是指望模型去“看”结果。"}, {"kind": "steps", "items": [{"label": "加一个审美 skill", "body": "一个精选的设计 skill 会迫使 agent 承诺一个真实的方向，而不是默认外观。"}, {"label": "在真实浏览器中验证", "body": "用一个浏览器工具跨断点渲染并自检——这在这里至关重要，因为模型自己读不了截图——这样布局就不会在移动端悄无声息地崩掉。"}, {"label": "提供 tokens 和参考", "body": "真实的设计 tokens 和具体的、描述清楚的参考，是对产出质量影响最大的单一杠杆。"}, {"label": "把规则编码进上下文文件", "body": "把诸如“不要主视觉大卡片、最多两种字体、品牌优先的层级”这类规则，放到 agent 每次运行都会读取的地方。"}]}, {"kind": "p", "text": "请注意，每一项缓解措施都是在给 agent 一套精选的设计上下文。逐个项目手工维护这套上下文，正是 Open Design 替你免去的繁琐劳作。"}]}, {"id": "open-design", "heading": "在 Open Design 内用 DeepSeek TUI 做设计", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一再呼唤的开源设计层。它把 DeepSeek agent 当作一等适配器，并在其外包上一套精选的 skill 与设计系统库、一条结构化的渲染流水线，以及一个本地桌面 UI——于是让 DeepSeek 变好用的那套设计上下文，从第一次运行起就在那里，而不是每次都手工拼凑。两者都开源、都本地优先，这让这对搭配水到渠成。"}, {"kind": "ol", "items": ["安装 Open Design，并选择 DeepSeek TUI 作为你的 agent。", "用你自己的 DeepSeek API 密钥进行鉴权（BYOK）——凭证留在你的机器上，绝不经我们代理。", "选一套设计系统和一个 skill，然后以一致的品味生成演示文稿、原型和落地页。", "每一个产物和 DESIGN.md 文件都存放在你自己的仓库里，而不是托管的云端。"]}, {"kind": "p", "text": "同一个 DeepSeek agent、同一个密钥——再加上一套围绕它的真实、可移植、开源的设计工作流。它本地优先且采用 Apache-2.0 协议，所以你的工作内容和凭证没有任何东西会离开你的机器。"}]}], "faqTitle": "常见问题", "faq": [{"name": "DeepSeek TUI 真的能做设计工作吗？", "text": "能——只要上下文里有一个审美 skill、一套设计系统和具体的参考，一个由 DeepSeek 驱动的终端 agent 就能产出生产级的响应式 UI，然后你在真实浏览器中验证产出。DeepSeek 的模型是纯文本的，所以这套验证循环替代了原生的图像读取。缺了那套上下文，它就倾向于退回到一套平庸的外观，而这正是 Open Design 所填补的缺口。"}, {"name": "用 DeepSeek TUI 做设计要花多少钱？", "text": "很少——DeepSeek 的 API 单 token 价格属于最便宜之列，而前缀上下文缓存又进一步削减了重复提示的成本，所以你可以放开手脚地迭代。你自带 DeepSeek API 密钥（BYOK）；Open Design 绝不代理你的凭证。"}, {"name": "DeepSeek 具体好在哪里，适合做设计？", "text": "强大且具成本效率的编码模型、开放权重，以及一个能一次性容纳整套设计系统和参考集合的 100 万 token 上下文。DeepSeek 是纯文本的——它不原生读取图像——所以品味仍然来自你提供的设计系统、skill 和描述出来的参考，并在浏览器中验证。"}, {"name": "前端设计该选 DeepSeek TUI 还是 Claude Code？", "text": "两者都很强。Claude Code 以具体的、理解代码库的设计决策著称；DeepSeek TUI 的优势在于开放权重、极低成本，以及适合高频迭代的巨大上下文。许多团队两者都用——Open Design 让你在不改变设计工作流的前提下切换 agent。"}, {"name": "我该如何把 DeepSeek TUI 连接到 Figma？", "text": "在你终端 agent 的 MCP 配置里加入 Figma MCP 服务器。这样 agent 就能拉取真实的设计上下文——组件、变量、布局数据——让生成的代码与源文件一致，而不是近似还原。DeepSeek 的 API 支持 MCP 所依赖的工具调用。"}, {"name": "Open Design 与 DeepSeek 有关联吗？", "text": "没有。DeepSeek 是模型与 API 提供方；Open Design 是一个独立的开源项目，把由 DeepSeek 驱动的终端 agent 作为一等适配器来支持。DeepSeek 是 DeepSeek 的商标。"}, {"name": "我的文件和凭证安全吗？", "text": "安全——Open Design 本地优先且采用 Apache-2.0 协议。你的文件、产物和 DESIGN.md 都留在你自己的仓库里，而你的 DeepSeek API 密钥由你的 agent 直接使用，绝不经过 Open Design 的服务器路由。"}], "ctaTitle": "以开放的方式，用 DeepSeek TUI 做设计。", "ctaBody": "自带你自己的 DeepSeek API 密钥，把每个文件都留在本地，并在你已经在用的 agent 周围获得一套精选的设计库。", "ctaActions": [{"label": "在 Open Design 内使用 DeepSeek TUI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下载桌面应用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "查看所有受支持的 agent"},
      aboutTitle: "什么是 DeepSeek TUI",
      aboutBody: ["DeepSeek TUI 是一个由 DeepSeek 模型驱动的终端 AI 编码 agent。它读取你的代码库、编辑文件、运行命令、管理 git，并搜索网络。DeepSeek 是模型提供方，暴露一个与 OpenAI 兼容的 API（以及一个 Anthropic 格式的端点）。", "它的编码模型强大且极具成本效率，上下文窗口可达 100 万 token，因此能一次性容纳整套设计系统。这些模型是纯文本的，所以设计参考是被描述出来、并在浏览器中验证的，而不是作为图像被读取。", "Open Design 把 DeepSeek agent 当作一等适配器，因此它能嵌入一条结构化的开源设计流水线。"],
      vendorLabel: "厂商",
      vendor: "DeepSeek",
      credentialLabel: "凭证",
      credential: "DeepSeek API 密钥（BYOK）",
      designTitle: "用 DeepSeek TUI 做设计",
      designLead: "DeepSeek TUI 的设计强项集中在它的模型和经济性上：",
      designPoints: [{"label": "强大、便宜的编码", "body": "能力出众的编码模型加上极低的单 token 成本，把描述出来的布局转化为响应式标记，并让你自由迭代。"}, {"label": "100 万 token 上下文", "body": "整套设计系统、组件库和参考集合都能一次性放进去，于是产出会复用你真实的基础组件——重复时还有上下文缓存。"}, {"label": "上下文文件 + MCP", "body": "上下文文件承载你的规范；Figma MCP 服务器借助 DeepSeek 的工具调用把真实的设计上下文带进代码。"}, {"label": "开放权重，BYOK", "body": "DeepSeek 提供开放权重，而你自带自己的 DeepSeek API 密钥——纯文本，所以请在真实浏览器中验证视觉效果。"}],
      linksTitle: "真实世界的资源",
      linksLead: "DeepSeek API 与平台的官方文档：",
      links: [{"label": "DeepSeek API 文档", "href": "https://api-docs.deepseek.com/", "source": "文档 · DeepSeek"}, {"label": "模型与定价", "href": "https://api-docs.deepseek.com/quick_start/pricing", "source": "文档 · DeepSeek"}, {"label": "Anthropic API 兼容性", "href": "https://api-docs.deepseek.com/guides/anthropic_api", "source": "文档 · DeepSeek"}],
      withOdTitle: "DeepSeek TUI + Open Design",
      withOdLead: "Open Design 是围绕 DeepSeek TUI 的开源设计层：一套精选的 skill 与设计系统库、一条结构化的渲染流水线，以及一个本地桌面 UI。",
      withOdSteps: ["安装 Open Design，并选择 DeepSeek TUI 作为你的 agent。", "用你自己的 DeepSeek API 密钥进行鉴权（BYOK）——凭证留在你的机器上。", "选一套设计系统和一个 skill，然后以一致的品味生成演示文稿、原型和落地页。", "产物和 DESIGN.md 文件都存放在你自己的仓库里，而不是托管的云端。"],
      withOdClosing: "同一个 DeepSeek agent——再加上一套围绕它的真实、可移植的设计工作流。",
      faqTitle: "常见问题",
      faq: [{"name": "Open Design 是 DeepSeek 做的吗？", "text": "不是。DeepSeek 是模型与 API 提供方；Open Design 是一个独立的开源项目，把由 DeepSeek 驱动的终端 agent 作为一等适配器集成进来。"}, {"name": "我需要付费吗？", "text": "你自带自己的 DeepSeek API 密钥（BYOK）。DeepSeek 的 API 单 token 价格极低，而 Open Design 绝不代理你的凭证。"}, {"name": "Open Design 与 DeepSeek 有关联吗？", "text": "没有。Open Design 是独立的；DeepSeek 是 DeepSeek 的商标。"}],
      ctaTitle: "以开放的方式，用 DeepSeek TUI 做设计。",
      ctaBody: "为仓库点个 Star、下载桌面应用，或加入社区来请求一个适配器。",
    },
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
  agentGuides: {
    'claude-code': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['claude-code']!,
      title: "Claude Code 做設計 — Open Design",
      description: "設計師如何用 Claude Code 做 UI 和網頁設計，以及 Open Design 如何把它變成真正的設計 Agent —— 本地優先、自帶金鑰（BYOK），配套精選 skill 與設計系統庫。",
      breadcrumb: "Claude Code",
      label: "Agent · Claude Code",
      heading: "用 Claude Code 做設計。",
      lead: "Claude Code 是 Anthropic 的終端編碼 Agent。已經有很多人用它做 UI、設計系統和落地頁。Open Design 把它接進真正的設計工作流 —— 用你自己的 Anthropic 金鑰或 Claude 訂閱，所有檔案留在本地。",
      rich: {"heroCtaLead": "Open Design 把 Claude Code 變成一個本地優先、開源的設計 agent —— 用你自己的 Anthropic key 或 Claude 訂閱、你自己的檔案，外面再包一層精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 裡使用 Claude Code", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Claude Code 被普遍認為是前端品味最好的 coding agent —— 它對介面的推理格外具體，會給出確切的 hex 色值、間距與字號階梯，並能在大型程式碼庫裡跨檔案重構 UI 而不丟失主線。但開箱即用時，如果你不給它設計系統、skill 和真實參考，它仍會滑向一種泛泛的樣子。這是一份關於如何把 Claude Code 用於 UI、前端與設計系統工作，並將它接入 Open Design 結構化工作流的端到端實戰指南。", "本文涵蓋 Claude Code 到底是什麼、它為何擅長前端、如何從零搭建、CLAUDE.md 與 Skills 工作流、官方的 Figma 往返、它與 Codex 和 Cursor 的對比、讓 AI 產出顯得套路化的那些坑，以及 Open Design 如何作為開源、本地優先的設計層來補上這道缺口。"], "heroImage": {"src": "/agents/claude-code-design/claude-code-design-hero.webp", "alt": "Claude Code 設計反饋閉環：終端裡做出具體設計決策的 agent、渲染 UI 的瀏覽器，以及一個工作區，由一條反饋箭頭回環", "caption": "核心閉環：Claude Code 在終端裡推理出具體的 UI 決策，在真實瀏覽器裡渲染並驗證，再對照參考不斷收斂。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-claude-code", "label": "Claude Code 究竟是什麼"}, {"id": "why-design", "label": "Claude Code 為何擅長設計"}, {"id": "setup", "label": "從零搭建用於設計的 Claude Code"}, {"id": "skills-workflow", "label": "CLAUDE.md 與 Skills 工作流"}, {"id": "figma", "label": "Claude Code + Figma 往返"}, {"id": "vs", "label": "Claude Code vs Codex vs Cursor"}, {"id": "pitfalls", "label": "常見坑與“AI 套路感”"}, {"id": "open-design", "label": "在 Open Design 裡用 Claude Code 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-claude-code", "heading": "Claude Code 究竟是什麼", "blocks": [{"kind": "p", "text": "Claude Code 是 Anthropic 的 agentic 編碼工具。它讀取你的程式碼庫、編輯檔案、執行命令、與你的開發工具整合 —— 從自然語言任務出發去規劃、編寫並驗證，而不只是補全幾行程式碼。"}, {"kind": "p", "text": "它有多個共享同一引擎的形態：終端 CLI、面向 VS Code / Cursor / JetBrains 的 IDE 擴充套件、帶視覺化 diff 審閱的桌面應用，以及用於長時任務的網頁端。你的 CLAUDE.md 檔案、設定與 MCP server 在所有形態間通用。"}, {"kind": "steps", "items": [{"label": "指令檔案", "body": "Claude Code 在每次會話開始時讀取專案根目錄下的 CLAUDE.md —— 這正是寫入你的設計規範、token 與審閱清單的天然位置。"}, {"label": "Skills", "body": "Agent Skills 把可複用的指令、指令碼與資源打包，由 Claude 按需載入，其中就包括 Anthropic 官方的 Frontend Design skill 來注入品味。"}, {"label": "Plan 與 subagent", "body": "它能先規劃再動手，並可派生 subagent 並行處理任務的不同部分，從而讓大型 UI 重構保持連貫。"}]}, {"kind": "ul", "items": ["廠商：Anthropic", "憑證：Anthropic API key（BYOK，經 Console）或 Claude 訂閱（Pro / Max）", "形態：終端 CLI、VS Code / Cursor / JetBrains 擴充套件、桌面應用、網頁端"]}]}, {"id": "why-design", "heading": "Claude Code 為何擅長設計", "blocks": [{"kind": "p", "text": "在一眾 coding agent 裡，Claude Code 在前端工作上以“有品味”著稱。原因有幾點。"}, {"kind": "steps", "items": [{"label": "決策具體，不含糊", "body": "Claude Code 傾向於落到確切的選擇 —— 精確的 hex 色值、間距階梯、字號 ramp 與元件層級，而不是泛泛而談，而這正是真實介面與佔位草稿的分水嶺。"}, {"label": "理解程式碼庫的推理", "body": "憑藉較大的工作上下文，它能一次性跨多檔案重構 UI，複用你已有的元件與 token，而不是另造一套一次性樣式。"}, {"label": "官方前端 skill", "body": "Anthropic 提供 Frontend Design skill，讓 Claude 先寫出設計方向，並刻意避開泛用系統字型與可預料的紫色漸變。"}]}, {"kind": "image", "src": "/agents/claude-code-design/claude-code-design-taste-triangle.webp", "alt": "展示設計系統、skill 與參考圖三者匯聚成優質設計產出的示意圖", "caption": "品味來自你提供的三項輸入：設計系統、skill，以及真實參考圖。"}, {"kind": "p", "text": "這和 Anthropic 對自家模型的說法一致：Claude 預設並沒有品味 —— 放任不管，它會收斂到網頁設計的統計中心（Inter、紫色漸變、柔和陰影）。給它約束，它才能產出好設計。Open Design 恰恰把這些輸入打包好了，這也是兩者天然契合之處（詳見下文）。"}]}, {"id": "setup", "heading": "從零搭建用於設計工作的 Claude Code", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨機器到一個能構建並驗證 UI 的 Claude Code 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Claude Code（推薦原生安裝）\ncurl -fsSL https://claude.ai/install.sh | bash\n# 或：brew install --cask claude-code\n# Windows PowerShell：irm https://claude.ai/install.ps1 | iex\n\n# 2. 在你的專案裡啟動，首次執行時登入\ncd your-project\nclaude            # 用 Claude 訂閱或 API key 登入\n\n# 3. 生成專案上下文\n/init             # 為本專案建立 CLAUDE.md\n\n# 4. 新增官方 Frontend Design skill\nclaude plugin install frontend-design@claude-plugins-official\n\n# 5. 接入 Figma MCP server（可選，用於設計交付）\nclaude plugin install figma@claude-plugins-official"}, {"kind": "image", "src": "/agents/claude-code-design/claude-code-design-setup-flow.webp", "alt": "五步搭建流程：安裝、認證、配置 CLAUDE.md、新增 skill、驗證", "caption": "搭建順序：安裝 → 認證 → 配置 CLAUDE.md → 新增 Frontend Design skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把設計規則寫進去", "body": "把你的 token、基礎原語與約定放進 CLAUDE.md 並讓 Claude 指向它們，這樣產出會貼合品牌，而不是退回到泛用樣子。"}, {"label": "加上瀏覽器驗證", "body": "接入 Playwright 或 Chrome MCP，讓 Claude 在真實瀏覽器裡渲染，並跨斷點檢查產出，而不僅僅確認構建透過。"}]}]}, {"id": "skills-workflow", "heading": "CLAUDE.md 與 Skills 工作流", "blocks": [{"kind": "p", "text": "用 Claude Code 做設計、槓桿最高的閉環，是把真實參考連同你的設計上下文一起餵給它，再迭代到 UI 對得上 —— 由 CLAUDE.md 和 Skills 承載約束，免得你每次 prompt 都重新解釋一遍。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發 —— 而且要包含多種狀態（桌面與移動、hover、空態、載入態），不要只給一張 hero 圖。", "在 prompt 裡說具體；即便是強 agent，含糊的 prompt 也只會產出泛泛的 UI。", "把你的設計系統與約定放進 CLAUDE.md，並告訴 Claude token 與標準原語在哪裡。", "新增 Frontend Design skill，讓 Claude 在寫程式碼前先確定一個真實的美學方向。", "接好瀏覽器驗證，讓 Claude 渲染、調整到各斷點，並對照參考做比對 —— 而不只是確認能構建透過。"]}, {"kind": "p", "text": "把一張參考圖丟進會話，並用具體約束去提示："}, {"kind": "code", "lang": "bash", "code": "claude \"把 reference-desktop.png 和 reference-mobile.png 用\n  React + Vite + Tailwind + TypeScript 實現。\n  複用 CLAUDE.md 裡描述的設計系統元件與 token。\n  匹配間距、佈局與層級；做成響應式。\n  在瀏覽器裡渲染，跨斷點驗證它與參考一致，\n  並迭代到對得上為止。\""}, {"kind": "p", "text": "同時跑一個 dev server，prompt 保持小而聚焦，好的迭代就 commit、壞的就 revert（revert 時告訴 Claude 一聲），讓每一輪都在乾淨的基礎上推進。較大的重構用 plan 模式，這樣動檔案前你能先審一遍方案。"}]}, {"id": "figma", "heading": "Claude Code + Figma：設計 ↔ 程式碼往返", "blocks": [{"kind": "p", "text": "2026 年 2 月，Anthropic 與 Figma 透過 Figma MCP server 推出了一流的雙向整合。它在兩個方向都能用。"}, {"kind": "steps", "items": [{"label": "設計 → 程式碼", "body": "在 Figma 裡選中一個 frame，或把連結粘進 Claude Code，拉取設計上下文，讓它用你已有的元件庫來實現這份設計。Code Connect 會讓產出與你真實的元件保持對齊。"}, {"label": "程式碼 → 設計", "body": "在瀏覽器裡構建並預覽一個功能，然後說一句“Send this to Figma”，把執行中的 UI 捕獲為可編輯的 Figma 圖層 —— 整屏或選中的某個元素皆可。"}]}, {"kind": "p", "text": "用 claude plugin install figma@claude-plugins-official 安裝一次即可（Dev Mode MCP 需要 Figma 付費方案）。同一個 Figma MCP 對 Claude Code、Codex、Cursor 與 VS Code 都可用 —— 正是 Open Design 所要編排的那類可移植、多 agent 能力。"}]}, {"id": "vs", "heading": "Claude Code vs Codex vs Cursor 做設計", "blocks": [{"kind": "p", "text": "設計工作沒有唯一贏家 —— 每個 agent 各有所長，有經驗的團隊會把它們疊著用。一個公允的概括："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Claude Code", "具體的設計決策（hex、間距、字號）與理解程式碼庫的 UX 推理", "前端推理與大上下文重構"], ["Codex", "強視覺打磨與影象理解；沙箱化非同步構建", "委派式非同步構建與可移植的 AGENTS.md 規則"], ["Cursor", "帶實時預覽與內聯編輯的“邊做邊看”閉環", "IDE 內緊湊的“迭代-觀察”式 UI 工作"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人。三者在沒有 skill、參考與約束時都會預設滑向泛用美學。這才是真正要解決的問題 —— 它是設計工具形狀的，而非模型形狀的。"}]}, {"id": "pitfalls", "heading": "常見坑，以及如何避開“AI 套路感”", "blocks": [{"kind": "p", "text": "即便 Claude Code 以有品味著稱，對 AI 生成設計最常見的吐槽仍是它顯得套路 —— Inter 字型、白底上的紫色漸變、柔和陰影、過大的圓角，一種“一看就是 AI 做的”的觀感。Anthropic 自己把這歸因於分佈收斂：安全的選擇在網頁訓練資料裡佔主導。其他被反映的問題還包括移動端佈局錯亂、以及指令文字漏進了 UI 文案。"}, {"kind": "steps", "items": [{"label": "裝上 Frontend Design skill", "body": "它會逼 Claude 確定一個真實方向，並明確避開被 AI 濫用的字型與漸變。"}, {"label": "啟用瀏覽器驗證", "body": "讓 Claude 渲染並跨斷點自檢，避免佈局在移動端悄悄崩掉。"}, {"label": "提供 token 與參考", "body": "真實的設計 token 與參考截圖，是對產出質量影響最大的單一槓杆。"}, {"label": "把規則寫進 CLAUDE.md", "body": "把“不用 hero 卡片、最多兩種字型、品牌優先的層級”這類規則，放在 agent 每次都會讀到的地方。"}]}, {"kind": "p", "text": "注意每一條緩解措施，本質都是在給 agent 一份精選的設計上下文。逐個專案手工維護這份上下文，正是 Open Design 替你省掉的苦差。"}]}, {"id": "open-design", "heading": "在 Open Design 裡用 Claude Code 做設計", "blocks": [{"kind": "p", "text": "Open Design 就是上面那套工作流一直在呼喚的開源設計層。它把 Claude Code 當作一等介面卡，並在外面包上一層精選的 skill 與設計系統庫、一條結構化渲染流水線，以及一個本地桌面 UI —— 讓那份令 Claude Code 出彩的設計上下文，從第一次執行就在位，而不必每次手工拼裝。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 Claude Code 作為你的 agent。", "用你的 Anthropic API key（BYOK）或 Claude 訂閱認證 —— 憑證留在你自己機器上，絕不經我們中轉。", "挑一套設計系統與一個 skill，然後產出風格一致的 deck、原型與落地頁。", "每一件產物與 DESIGN.md 檔案都存在你自己的倉庫裡，而非託管雲端。"]}, {"kind": "p", "text": "同一個 Claude Code agent、同一把 key —— 外加一套真實、可移植、開源的設計工作流。它本地優先、Apache-2.0，所以你的工作與憑證都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Claude Code 適合做設計嗎？", "text": "適合 —— 它被普遍認為是前端品味最好的 coding agent，會對 hex 色值、間距與字號階梯做出具體且理解程式碼庫的決策。配上 Frontend Design skill、一套設計系統與真實參考圖，它能產出生產級、響應式的 UI 並在瀏覽器裡驗證。缺了這份上下文，它就容易退回泛用樣子 —— 這正是 Open Design 要補的缺口。"}, {"name": "用 Claude Code 做設計需要 Claude 訂閱嗎？", "text": "你可以用 Anthropic API key（BYOK，經 Console）或 Claude 訂閱（Pro / Max），兩者皆可。無論哪種，Open Design 都不會中轉你的憑證 —— 它們由你的 agent 在你機器上直接使用。"}, {"name": "前端設計該用 Claude Code 還是 Codex？", "text": "兩者都很強。Claude Code 以具體、理解程式碼庫的設計決策與前端推理著稱；Codex 視覺打磨強，擅長委派式的沙箱構建。很多團隊兩者都用 —— Open Design 讓你切換 agent 而無需改動設計工作流。"}, {"name": "怎麼把 Claude Code 接到 Figma？", "text": "用 claude plugin install figma@claude-plugins-official 安裝官方 Figma 外掛。之後你就能借助設計上下文在程式碼裡實現 Figma frame，並用“Send this to Figma”把執行中的 UI 推回成可編輯的 Figma 圖層。Dev Mode MCP 需要 Figma 付費方案。"}, {"name": "Skills 和 CLAUDE.md 是什麼？", "text": "CLAUDE.md 是你專案根目錄裡的一個 markdown 檔案，Claude Code 在每次會話開始時都會讀它 —— 這是寫入設計規範的地方。Skills 把可複用的指令與資源打包，由 Claude 按需載入，其中包括 Anthropic 官方的 Frontend Design skill。Open Design 把兩者都做成精選庫，幫你免去逐專案搭建。"}, {"name": "怎麼避開泛用的“AI 套路感”？", "text": "裝上 Frontend Design skill，提供真實的設計 token 與參考截圖，把品牌規則寫進 CLAUDE.md，並啟用瀏覽器驗證。Open Design 把這些做成精選庫，幫你免去逐專案搭建。"}, {"name": "Open Design 和 Anthropic 有從屬關係嗎？", "text": "沒有。Claude Code 是 Anthropic 的產品；Open Design 是一個獨立的開源專案，把它作為一等介面卡來支援。Claude 與 Claude Code 是 Anthropic 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全 —— Open Design 本地優先、Apache-2.0。你的檔案、產物與 DESIGN.md 都留在你自己的倉庫裡，你的 Anthropic 憑證由你的 agent 直接使用，絕不經 Open Design 伺服器中轉。"}], "ctaTitle": "用開放的方式，和 Claude Code 一起做設計。", "ctaBody": "帶上你自己的 Anthropic key 或 Claude 訂閱，把每個檔案都留在本地，再給你已在用的 agent 包上一層精選設計庫。", "ctaActions": [{"label": "在 Open Design 裡使用 Claude Code", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "See all supported agents"},
    },
    'codex': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['codex']!,
      title: "Codex 做設計 — Open Design",
      description: "大家如何用 OpenAI Codex 做 UI 和網頁設計 —— Product Design 外掛、Figma 整合、前端 skill —— 以及 Open Design 如何把 Codex 變成本地優先的開源設計 Agent。",
      breadcrumb: "Codex",
      label: "Agent · Codex",
      heading: "用 Codex 做設計。",
      lead: "Codex 是 OpenAI 的編碼 Agent。靠 Product Design 外掛和 Figma 整合，它已經成了一個正經的設計工具。Open Design 把 Codex 接進開源設計工作流 —— 你自己的 OpenAI 金鑰或 ChatGPT 訂閱，你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Codex 變成本地優先的開源設計 Agent —— 你自己的 OpenAI 金鑰、你自己的檔案，外加一套圍繞它的精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 裡用 Codex", "href": "/quickstart/", "variant": "primary"}, {"label": "給 GitHub 點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面客戶端", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Codex 最初只是個程式碼生成器，但到 2026 年，只要你給對參考、skill 和驗證迴路，它已經能設計出真正可用的介面。這是一篇端到端的實操指南：怎麼用 Codex 做 UI、前端和設計系統，以及怎麼用 Open Design 把它接進結構化的設計工作流。", "內容覆蓋：Codex 現在到底是什麼、為什麼它突然擅長前端、怎麼從零配好、截圖轉 UI 的迴路、官方的 Figma 雙向打通、它跟 Cursor 與 Claude Code 的差異、讓 AI 輸出顯得千篇一律的那些坑，以及 Open Design 作為開源、本地優先的設計層怎麼補上缺口。"], "heroImage": {"src": "/agents/codex-design/codex-design-workflow-loop.webp", "alt": "Codex 設計反饋迴路：終端 Agent、瀏覽器渲染 UI、工作區，帶一條迴流箭頭", "caption": "核心迴路：Codex 在終端裡構建 UI，在真實瀏覽器裡渲染並驗證，再對著你的參考圖迭代。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-codex", "label": "Codex 到底是什麼"}, {"id": "why-design", "label": "為什麼 Codex 現在能做設計"}, {"id": "setup", "label": "從零配好 Codex 做設計"}, {"id": "screenshot-workflow", "label": "截圖轉 UI 的工作流"}, {"id": "figma", "label": "Codex + Figma 雙向打通"}, {"id": "vs", "label": "Codex vs Cursor vs Claude Code"}, {"id": "pitfalls", "label": "常見坑與「AI 味」"}, {"id": "open-design", "label": "在 Open Design 裡用 Codex"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-codex", "heading": "Codex 到底是什麼（以及不是什麼）", "blocks": [{"kind": "p", "text": "先消歧，幾乎每個搜「Codex」的人都會被絆一下。最早的 OpenAI Codex 是 2021 年的程式碼補全模型，驅動過早期 GitHub Copilot，2023 年已棄用。本文講的不是它。今天的 Codex 是 OpenAI 的 Agent 式編碼工具 —— 從自然語言任務出發，規劃、編寫、執行並驗證程式碼。"}, {"kind": "p", "text": "現代 Codex 有四種形態：終端 CLI（用 Rust 重寫、Apache-2.0 開源）、面向 VS Code / Cursor / Windsurf 的 IDE 擴充套件、用於非同步委派任務的雲端/網頁版，以及帶內建瀏覽器和 Computer Use 的桌面 App。"}, {"kind": "steps", "items": [{"label": "預設模型", "body": "截至 2026 年中，推薦模型是 gpt-5.5；而 gpt-5.4 是 OpenAI 明確為前端和 Computer Use 訓練的那個模型。"}, {"label": "指令檔案", "body": "Codex 讀取專案裡的 AGENTS.md（跨工具通用標準）作為專案規則 —— 也就是寫你設計約定最自然的地方。"}, {"label": "沙箱", "body": "它跑在核心級沙箱裡（預設 workspace-write），改你 UI 的 Agent 不會跑到專案之外亂動。"}]}, {"kind": "ul", "items": ["廠商：OpenAI", "憑據：OpenAI API key（BYOK）或 ChatGPT 訂閱（Free / Go / Plus / Pro / Business / Enterprise）", "CLI 許可：Apache-2.0，開源"]}]}, {"id": "why-design", "heading": "為什麼 Codex 現在能做設計", "blocks": [{"kind": "p", "text": "2026 年初有三件事湊到一起，才讓 Codex 從通用程式碼生成器變成真正的設計工具。"}, {"kind": "steps", "items": [{"label": "一個為前端訓練的模型", "body": "OpenAI 釋出了 GPT-5.4 —— 它第一個主線版為前端和 Computer Use 訓練的模型，對設計流程裡的影象理解大幅提升，自我驗證也更強，甚至能在定稿前先生成情緒板和多個視覺方案。"}, {"label": "一個官方前端 skill", "body": "openai/skills 目錄裡有一個精選 frontend-skill，強制真審美：無卡片佈局、整屏 hero、品牌優先的層級、剋制的動效、最多兩種字型加一個強調色 —— 還逼 Codex 先寫「視覺論點」再動手。"}, {"label": "瀏覽器驗證", "body": "配上 Playwright skill，Codex 會真開瀏覽器、按斷點縮放，並把輸出跟參考圖比對，而不只是「構建透過」就完事。"}]}, {"kind": "image", "src": "/agents/codex-design/codex-design-taste-triangle.webp", "alt": "設計系統、skill、參考圖三者匯聚成優質設計輸出的示意圖", "caption": "審美來自你提供的三種輸入：設計系統、skill 和真實參考圖。"}, {"kind": "p", "text": "三件事背後的道理是一樣的：Codex 預設沒有審美。只有當你給它約束 —— 設計系統、審美 skill、具體參考 —— 它才能產出好設計。Open Design 打包的正是這三種輸入，這也是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零配好 Codex 做設計", "blocks": [{"kind": "p", "text": "從一臺乾淨的機器，到一個能構建並驗證 UI 的 Codex，完整路徑如下。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Codex CLI\nnpm install -g @openai/codex\n# 或：brew install --cask codex\n# 或：curl -fsSL https://chatgpt.com/codex/install.sh | sh\n\n# 2. 鑑權（推薦用 ChatGPT 登入，額度更高）\ncodex            # 然後選 “Sign in with ChatGPT”\n\n# 3. 生成專案上下文\ncodex            # 在專案裡執行 /init 生成 AGENTS.md\n\n# 4. 裝官方前端 skill，然後重啟 Codex\n# （在 Codex App 裡）$skill-installer frontend-skill\n\n# 5. 接 Figma MCP server（可選，做設計交付）\ncodex mcp add figma --url https://mcp.figma.com/mcp"}, {"kind": "image", "src": "/agents/codex-design/codex-design-setup-flow.webp", "alt": "五步配置流程：安裝、鑑權、配置、裝 skill、驗證", "caption": "配置順序：安裝 → 鑑權 → 配 AGENTS.md → 裝前端 skill → 開瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把設計規則寫進去", "body": "把 token、基礎元件、約定寫進 AGENTS.md 或 DESIGN.md 並讓 Codex 指向它們，輸出就會貼合品牌，而不是退回那套通用樣子。"}, {"label": "選對推理檔位", "body": "OpenAI 提到：低到中等推理檔位的前端效果，往往比最高檔更好。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖轉 UI 的工作流", "blocks": [{"kind": "p", "text": "Codex 做設計最高槓杆的迴路，是把參考圖變成可用的響應式 UI，再迭代到對齊為止。OpenAI 官方指引歸納為五步。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發 —— 而且要包含多個狀態（桌面和移動、hover、空態、載入態），不只是一張 hero 圖。", "prompt 要具體；含糊的 prompt 只會產出通用 UI。", "準備好設計系統，並告訴 Codex token 和基礎元件在哪。", "開啟 Playwright 互動 skill，讓 Codex 真在瀏覽器裡渲染並按斷點縮放。", "迭代時讓 Codex 把實現跟截圖比對 —— 而不只是確認「能構建」。"]}, {"kind": "p", "text": "喂圖可以把截圖拖進終端，或用 image 引數，然後用具體約束來 prompt："}, {"kind": "code", "lang": "bash", "code": "codex -i reference-desktop.png -i reference-mobile.png \\\n  \"用 React + Vite + Tailwind + TypeScript 實現這個設計。\n   儘量複用我現有的設計系統元件和 token。\n   對齊間距、佈局和層級；做成響應式。\n   用 Playwright skill 驗證 UI 跟參考圖一致，\n   不一致就一直迭代。\""}, {"kind": "p", "text": "在第二個終端裡跑 dev server，prompt 保持小而聚焦，好的迭代就 commit、壞的就 revert（並告訴 Codex 你回退了），這樣每一輪都在乾淨的基礎上推進。"}]}, {"id": "figma", "heading": "Codex + Figma：設計 ↔ 程式碼雙向打通", "blocks": [{"kind": "p", "text": "2026 年 2 月 OpenAI 和 Figma 宣佈官方合作，把早先的 Figma MCP beta 升級成一等公民級的雙向整合。兩個方向都能走。"}, {"kind": "steps", "items": [{"label": "設計 → 程式碼", "body": "在 Figma 裡複製某個 frame 的「link to selection」，粘進 Codex 配合 get_design_context，讓它用你現有的元件庫實現這個設計。"}, {"label": "程式碼 → 設計", "body": "generate_figma_design 工具（「Code to Canvas」）能把跑起來的 UI 變回可編輯的 Figma frame —— 整屏、選中元素或整個檔案都行。"}]}, {"kind": "p", "text": "Figma MCP 以遠端 server 形式執行且免限流。接一次，Codex、Claude Code、Cursor、VS Code 等都能用 —— 這種可移植的多 Agent 能力，正是 Open Design 要編排的東西。"}]}, {"id": "vs", "heading": "Codex vs Cursor vs Claude Code 做設計", "blocks": [{"kind": "p", "text": "做設計沒有唯一贏家 —— 每個 Agent 強在不同地方，老手會疊著用。公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Codex", "GPT-5.4 + 前端 skill 之後視覺打磨很強；影象理解好", "非同步委派構建、沙箱化執行、可移植的 AGENTS.md 規則"], ["Cursor", "邊改邊看的視覺迴路，帶實時預覽和行內編輯", "IDE 裡貼身迭代、即時觀察的 UI 工作"], ["Claude Code", "具體的設計決策（hex、間距、字型）和懂程式碼庫的 UX", "前端推理和大上下文重構"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人。三者在沒有 skill、參考和約束時，都會退回通用樣子。這才是要解決的真問題 —— 而它是「設計工具」形狀的，不是「模型」形狀的。"}]}, {"id": "pitfalls", "heading": "常見坑，以及怎麼避開「AI 味」", "blocks": [{"kind": "p", "text": "對 Codex 生成設計最常見的吐槽是「顯得通用」—— 柔和漸變、漂浮面板、超大圓角、誇張陰影，那種 Inter 字型加紫色的味道，「一看就是 AI 做的」。其他常見問題還有移動端佈局崩、指令文案洩漏進 UI、以及很快撞到用量上限。"}, {"kind": "steps", "items": [{"label": "裝一個前端 skill", "body": "精選的審美 skill 逼 Codex 選定一個真方向，而不是預設那套樣子。"}, {"label": "開啟 Playwright 驗證", "body": "讓 Codex 跨斷點渲染並自檢，佈局就不會在移動端悄悄崩。"}, {"label": "喂 token 和參考", "body": "真實的設計 token 和參考截圖，是對輸出質量影響最大的那個槓桿。"}, {"label": "把規則寫進 AGENTS.md", "body": "把「不要 hero 卡片、最多兩種字型、品牌優先層級」這類規則放在 Agent 每次都會讀到的地方。"}]}, {"kind": "p", "text": "注意：每條緩解措施，本質都是給 Agent 一套精選的設計上下文。而逐個專案手工維護這套上下文，正是 Open Design 幫你省掉的苦活。"}]}, {"id": "open-design", "heading": "在 Open Design 裡用 Codex", "blocks": [{"kind": "p", "text": "Open Design 就是上面這套工作流一直在呼喚的那個開源設計層。它把 Codex 當作一方介面卡，外面包上精選的 skill 與設計系統庫、結構化渲染流水線、本地桌面 UI —— 讓那些讓 Codex 變好的設計上下文從第一次執行就在，而不是每次手工拼。"}, {"kind": "ol", "items": ["安裝 Open Design，選 Codex 作為你的 Agent。", "用 OpenAI API key（BYOK）或 ChatGPT 訂閱鑑權 —— 憑據留在你機器上，絕不經我們中轉。", "選一套設計系統和一個 skill，生成審美一致的 deck、原型和落地頁。", "每個產物和 DESIGN.md 都在你自己的 repo 裡，不在託管雲端。"]}, {"kind": "p", "text": "同一個 Codex Agent、同一把金鑰 —— 外加一套真正可移植的開源設計工作流。它本地優先、Apache-2.0，你的工作和憑據都不離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "OpenAI Codex 真的能做設計嗎？", "text": "能 —— 只要上下文裡有前端 skill、設計系統和真實參考圖，Codex（尤其在 GPT-5.4 上）能產出生產級、響應式的 UI，還能在瀏覽器裡自檢。沒有這套上下文它就會退回通用樣子，而這正是 Open Design 補的缺口。"}, {"name": "這是 OpenAI 的 Codex Product Design 外掛嗎？", "text": "不是。Open Design 是獨立開源專案，把 Codex 作為 Agent 整合，用本地優先的開源 skill 與設計系統庫補充官方工具。"}, {"name": "用 Codex 做設計需要 ChatGPT 訂閱嗎？", "text": "OpenAI API key（BYOK）或 ChatGPT 訂閱都行。ChatGPT 登入通常額度更高；無論哪種，Open Design 都不中轉你的憑據。"}, {"name": "前端設計該用 Codex 還是 Claude Code？", "text": "兩個都強。Claude Code 以具體、懂程式碼庫的設計決策見長；Codex 在 GPT-5.4 之後視覺打磨很強，且擅長沙箱化的非同步委派構建。很多團隊兩個都用 —— Open Design 讓你換 Agent 時不用換設計工作流。"}, {"name": "怎麼把 Codex 接到 Figma？", "text": "加上官方 Figma MCP server（codex mcp add figma --url https://mcp.figma.com/mcp）。之後用 get_design_context 把 Figma frame 實現成程式碼，用 generate_figma_design 把跑起來的 UI 推回可編輯的 Figma frame。"}, {"name": "怎麼避免那種通用的「AI 味」審美？", "text": "裝一個前端 skill、喂真實的設計 token 和參考截圖、把品牌規則寫進 AGENTS.md、並開啟 Playwright 驗證。Open Design 把這些做成精選庫，你就省掉了逐專案的配置。"}, {"name": "Open Design 跟 OpenAI 有關聯嗎？", "text": "沒有。Codex 是 OpenAI 的產品；Open Design 是獨立開源專案，以一方介面卡的方式支援它。OpenAI 和 Codex 是 OpenAI 的商標。"}, {"name": "我的檔案和憑據安全嗎？", "text": "安全 —— Open Design 本地優先。你的檔案、產物和 DESIGN.md 都留在自己的 repo，OpenAI 憑據由你的 Agent 直接使用，絕不經 Open Design 伺服器中轉。"}], "ctaTitle": "用開源的方式，跟 Codex 一起設計。", "ctaBody": "自帶 OpenAI 金鑰、所有檔案留在本地，給你已經在用的 Agent 配上一套精選設計庫。", "ctaActions": [{"label": "在 Open Design 裡用 Codex", "href": "/quickstart/", "variant": "primary"}, {"label": "給 GitHub 點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面客戶端", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視全部支援的 Agent"},
    },
    'cursor': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['cursor']!,
      title: "Cursor 做設計 — Open Design",
      description: "設計師如何用 Cursor 做 UI 和網頁設計 —— Design Mode、Figma 轉程式碼、Figma MCP —— 以及 Open Design 如何把 Cursor 變成本地優先的開源設計 Agent。",
      breadcrumb: "Cursor",
      label: "Agent · Cursor",
      heading: "Cursor 給設計師。",
      lead: "Cursor 是那個 AI 程式碼編輯器，現在帶了視覺化 Design Mode。設計師用它點選、勾畫來改 UI，也用它把 Figma 轉成程式碼。Open Design 把 Cursor Agent 接進開源設計工作流，檔案全留本地。",
      rich: {"heroCtaLead": "Open Design 把 Cursor 變成一個本地優先、開源的設計 agent——用你自己的 Cursor 賬號或模型金鑰、你自己的檔案，外面再裹一層精選的 skill 與 design-system 庫。", "heroCtaActions": [{"label": "在 Open Design 裡使用 Cursor", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面端", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Cursor 是一款 AI 優先的程式碼編輯器，它讓“邊寫邊看渲染”成為做 UI 的預設方式。藉助 Agent 模式、行內編輯、編輯器內建預覽，以及透過 MCP 接入的 Figma，它已經成為一個真正能用的設計工具——前提是你給它對的參考、規則和一套驗證迴路。這是一份從頭到尾、可落地的指南，講如何用 Cursor 做 UI、前端和 design-system 工作，並把它接入 Open Design 的結構化設計工作流。", "內容涵蓋：Cursor 到底是什麼、為什麼它“邊迭代邊看”的緊湊迴路適合做設計、如何從零搭起、從預覽到 UI 的迭代迴路、透過 MCP 與 Figma 的往返、它與 Codex 和 Claude Code 的對比、讓 AI 產出顯得平庸的那些坑，以及 Open Design 作為開源、本地優先的設計層如何補齊這道缺口。"], "heroImage": {"src": "/agents/cursor-design/cursor-design-hero.webp", "alt": "Cursor 設計收斂示意：左側是編輯器，中間是帶 Cursor 標誌的精選 skill 與 design-system hub，右側是渲染出的 UI", "caption": "核心思路：Cursor 在編輯器裡編輯並渲染 UI，而一個精選的設計 hub 為它喂入設計系統、skill 和參考，讓產出顯得是有意為之、而非隨手生成。"}, "tocLabel": "本頁目錄", "toc": [{"id": "what-is-cursor", "label": "Cursor 到底是什麼"}, {"id": "why-design", "label": "為什麼 Cursor 擅長做設計"}, {"id": "setup", "label": "從零配置 Cursor 做設計"}, {"id": "preview-workflow", "label": "從預覽到 UI 的工作流"}, {"id": "figma", "label": "Cursor + Figma（經 MCP）"}, {"id": "vs", "label": "Cursor vs Codex vs Claude Code"}, {"id": "pitfalls", "label": "常見坑與“AI 味”觀感"}, {"id": "open-design", "label": "在 Open Design 裡用 Cursor 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-cursor", "heading": "Cursor 到底是什麼", "blocks": [{"kind": "p", "text": "Cursor 是 Anysphere 打造的 AI 優先程式碼編輯器。它是 VS Code 的一個 fork，所以保留了熟悉的編輯器、擴充套件和快捷鍵，但把整個工作流圍繞一個 AI agent 重建——這個 agent 能讀懂你的整個專案、跨多檔案編輯、執行命令，並和你一起在迴路裡迭代。"}, {"kind": "p", "text": "對設計工作而言，關鍵的幾個能力是：Agent 模式（你描述想要的結果，Cursor 規劃並跨檔案編輯）、用於快速微調的行內編輯與 Tab 補全、讓你不離開視窗就能看到執行中 UI 的編輯器內建預覽，以及讓它能拉入外部上下文（比如一個實時 Figma 檔案）的 MCP 支援。"}, {"kind": "steps", "items": [{"label": "專案規則", "body": "Cursor 會讀取專案指令檔案——`.cursor/rules` 下納入版本管理的 `.mdc` 規則，以及一個純文字 `AGENTS.md`——你可以把設計約定寫在 agent 每次都會讀到的地方。"}, {"label": "模型", "body": "Cursor 在模型上很靈活：訂閱自帶前沿模型，也支援用你自己的模型金鑰（BYOK），所以同一套編輯器工作流背後用哪臺引擎由你定。"}, {"label": "MCP", "body": "它支援 Model Context Protocol，外部 server——最相關的就是 Figma MCP server——可以成為 agent 的一等上下文。"}]}, {"kind": "ul", "items": ["廠商：Anysphere", "憑證：Cursor 賬號 / 訂閱（Hobby / Pro / Business）或你自己的模型金鑰（BYOK）", "形態：AI 優先的程式碼編輯器（VS Code fork），內建 agent 與預覽"]}]}, {"id": "why-design", "heading": "為什麼 Cursor 擅長做設計", "blocks": [{"kind": "p", "text": "Cursor 在設計上的優勢不是某個單一功能，而是“邊寫邊看”這條迴路的緊湊度。有三點讓它更像一個設計工具，而不是一個泛泛的程式碼生成器。"}, {"kind": "steps", "items": [{"label": "緊湊的“邊迭代邊看”迴路", "body": "你給出提示，Cursor 跨檔案編輯，編輯器內建預覽立刻渲染出結果——於是你能在幾秒內調整間距、層級和動效，而不必在另一個終端和瀏覽器之間來回切換。"}, {"label": "直接的視覺化編輯", "body": "除了對話，Cursor 還允許你在預覽裡選中元素、直接微調樣式，讓小的視覺修正更像設計編輯、而非翻程式碼考古。"}, {"label": "專案規則與 MCP 上下文", "body": "有了 `.cursor/rules`（或 `AGENTS.md`）和 Figma MCP server，agent 是對著你的 tokens、元件和真實設計規格在工作，而不是靠猜。"}]}, {"kind": "image", "src": "/agents/cursor-design/cursor-design-taste-triangle.webp", "alt": "展示 design system、skill 與參考圖三者收斂為優質設計產出的示意圖", "caption": "審美來自你提供的三個輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "結論和每個 agent 教給我們的一樣：Cursor 預設並沒有審美。只有當你給它約束——一套設計系統、一個審美 skill、具體的參考——它才能產出好設計。Open Design 打包的正是這些輸入，這也是兩者天然契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零把 Cursor 配置成能做設計", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨機器，到一個能對著你的設計系統構建、預覽並驗證 UI 的 Cursor 的完整路徑。"}, {"kind": "ol", "items": ["從 cursor.com 安裝 Cursor，用 Cursor 賬號登入，或在設定裡配置你自己的模型金鑰（BYOK）。", "開啟你的專案，在對話 / Agent 面板裡選一個模型。", "加專案規則：用 `.cursor/rules/*.mdc` 寫結構化、按 glob 作用域生效的約定，或用一個純文字 `AGENTS.md` 寫簡單可讀的指令。", "接入 Figma MCP server（可選），讓 agent 能讀取實時設計上下文。", "啟動你的 dev server，用編輯器內建預覽邊迭代邊看、邊驗證 UI。"]}, {"kind": "image", "src": "/agents/cursor-design/cursor-design-setup-flow.webp", "alt": "五步配置流程：安裝、認證、配置規則、新增 skill、驗證", "caption": "配置順序：安裝 → 認證 → 配置專案規則 → 新增 skill → 啟用預覽驗證。"}, {"kind": "p", "text": "一份最簡的專案規則檔案，就能讓 agent 對著品牌做設計、而不是退回到一個泛泛的樣子。把它放在 Cursor 每次都會讀到的地方："}, {"kind": "code", "lang": "markdown", "code": "# .cursor/rules/design.mdc\n---\ndescription: Project design conventions\nalwaysApply: true\n---\n\n- 複用已有的 design-system tokens 和元件；不要寫死 hex 或間距。\n- 最多兩種字型、一個強調色。\n- 品牌優先的層級；剋制的動效。不要 hero card，不要過大的圓角。\n- 預設做響應式；收尾前先在預覽裡驗證桌面端和移動端。"}, {"kind": "steps", "items": [{"label": "把設計規則寫下來", "body": "把你的 tokens、基礎元件和約定放進 `.cursor/rules` 或 `AGENTS.md`，並讓 Cursor 指向它們，這樣產出會貼合品牌、而不是退回到泛泛的樣子。"}, {"label": "讓提示保持小而聚焦", "body": "Cursor 的緊湊迴路偏愛聚焦的請求——一次只迭代一個元件或一種狀態，每一輪之間都盯著預覽看。"}]}]}, {"id": "preview-workflow", "heading": "從預覽到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Cursor 做設計，槓桿最高的迴路就是把一張參考變成能跑、且響應式的 UI，並在編輯器裡一直盯著實時預覽迭代到匹配為止——而不是靠猜。"}, {"kind": "ol", "items": ["從你手上最清晰的視覺參考開始——並且要包含多種狀態（桌面與移動、hover、空態、載入態），而不只是一張主視覺。", "提示要具體；含糊的提示只會產出泛泛的 UI。", "準備好設計系統，並告訴 Cursor tokens 和標準基礎元件都在哪裡。", "讓編輯器內建預覽開著、dev server 跑著，這樣每次編輯都能在你關心的斷點上立刻渲染出來。", "透過把渲染出的 UI 和參考反覆比對來迭代——小的視覺修正就直接在預覽裡選中元素來調。"]}, {"kind": "p", "text": "把圖片附到對話裡來喂參考，然後用具體約束給出提示："}, {"kind": "code", "lang": "text", "code": "用 React + Vite + Tailwind + TypeScript 實現這個設計。\n複用我已有的 design-system 元件和 tokens。\n匹配間距、佈局和層級；做成響應式。\n預覽一直開著——驗證桌面端和移動端都和參考一致，\n迭代到一致為止。"}, {"kind": "p", "text": "好的迭代就提交，壞的就回退（回退時告訴 Cursor 一聲），讓每一輪都建立在乾淨的基礎上——這是讓任何 agent 迴路不跑偏的同一條紀律。"}]}, {"id": "figma", "heading": "Cursor + Figma：經 MCP 的設計 ↔ 程式碼往返", "blocks": [{"kind": "p", "text": "Cursor 透過官方的 Figma MCP server 連線 Figma，讓 agent 對一個實時 Figma 檔案有結構化訪問，而不是隻拿到一張扁平截圖。這就把交接裡的猜測成分去掉了。"}, {"kind": "steps", "items": [{"label": "設計 → 程式碼", "body": "在 Figma 裡複製某個 frame 的連結，粘進 Cursor，讓它去實現這個設計。MCP server 暴露的是真實的設計上下文——元件、變數、佈局資料、tokens——所以生成的程式碼是貼合原始檔的，而不是近似。"}, {"label": "保持對齊", "body": "只要在 Figma 裡一致地使用設計 tokens、樣式和元件（有 Code Connect 時用上），Cursor 的產出就會對映到你真實的設計系統，而不是重新發明一套基礎元件。"}]}, {"kind": "p", "text": "遠端 Figma MCP server 配一次，就能作為一等上下文供 Cursor 使用。由於 MCP 是開放標準，同一個 server 可以在 Cursor、Claude Code、Codex 和 VS Code 之間複用——這正是 Open Design 生來要去編排的那種可移植、多 agent 能力。"}]}, {"id": "vs", "heading": "Cursor vs Codex vs Claude Code：做設計怎麼選", "blocks": [{"kind": "p", "text": "做設計沒有唯一贏家——每個 agent 各有所長，有經驗的團隊會把它們疊著用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Cursor", "“邊寫邊看”的視覺化迴路，帶編輯器內建實時預覽與直接選中元素編輯", "IDE 裡“邊迭代邊看”的緊湊 UI 工作"], ["Codex", "配上前端 skill 後視覺打磨強；影象理解 + 沙箱化執行", "託管式非同步構建，以及可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）和懂程式碼庫的 UX", "前端推理與大上下文重構"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人。三者在沒有 skill、參考和約束時都會退回到一個泛泛的樣子。那才是真正要解決的問題——而它是“設計工具”形狀的，不是“模型”形狀的。"}]}, {"id": "pitfalls", "heading": "常見坑，以及如何避開“AI 味”觀感", "blocks": [{"kind": "p", "text": "對 Cursor 生成設計最常見的抱怨，是它看著很泛——柔和漸變、懸浮面板、過大的圓角、誇張陰影，一股“Inter 字型加紫色”的味道，“一看就是 AI 做的”。其他被反映的問題還包括移動端佈局錯亂、指令文字洩漏進 UI 文案裡。"}, {"kind": "steps", "items": [{"label": "加一個設計 skill", "body": "一個精選的審美 skill 會逼 Cursor 選定一個真實方向，而不是用預設那套。"}, {"label": "用預覽來驗證", "body": "在編輯器內建預覽裡跨斷點渲染並自檢，這樣佈局就不會在移動端悄悄崩掉。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖，是對產出質量影響最大的那個槓桿。"}, {"label": "把規則寫進 `.cursor/rules`", "body": "把“不要 hero card、最多兩種字型、品牌優先層級”這類規則，放在 agent 每次都會讀到的地方。"}]}, {"kind": "p", "text": "注意到沒有：每一條緩解措施都是在給 agent 一份精選的設計上下文。逐個專案、用手去維護這份上下文，正是 Open Design 幫你省掉的苦活。"}]}, {"id": "open-design", "heading": "在 Open Design 裡用 Cursor 做設計", "blocks": [{"kind": "p", "text": "Open Design 就是上面這套工作流一直在要的那一層開源設計層。它把 Cursor 當作一等介面卡，外面裹上一個精選的 skill 與 design-system 庫、一條結構化的渲染流水線，以及一個本地桌面端 UI——讓那份讓 Cursor 變好用的設計上下文，從第一次執行就在那兒，而不是每次都手工拼。"}, {"kind": "ol", "items": ["安裝 Open Design，選 Cursor 作為你的 agent。", "用你的 Cursor 賬號或你自己的模型金鑰（BYOK）認證——憑證留在你的機器上，絕不經我們代理。", "挑一套設計系統和一個 skill，然後生成審美一致的演示稿、原型和落地頁。", "每一份產物和 DESIGN.md 都存在你自己的 repo 裡，而不是某個託管雲。"]}, {"kind": "p", "text": "同一個 Cursor agent、同一把金鑰——外面再加一套真實、可移植、開源的設計工作流。它本地優先、Apache-2.0 授權，所以你的工作和憑證沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Cursor 真的能做設計嗎？", "text": "能——只要上下文裡有一個設計 skill、一套設計系統和真實參考圖，Cursor 就能產出生產級、響應式的 UI，而它的編輯器內建預覽讓你能在視覺上驗證並打磨。缺了這份上下文，它就容易退回到泛泛的樣子，而這正是 Open Design 補齊的缺口。"}, {"name": "這是 Cursor 官方產品嗎？", "text": "不是。Open Design 是一個獨立的開源專案，把 Cursor 作為 agent 整合進來。它用一個本地優先、開源的 skill 與 design-system 庫來補充 Cursor。"}, {"name": "用 Cursor 做設計需要 Cursor 訂閱嗎？", "text": "你可以用 Cursor 賬號 / 訂閱，也可以用自己的模型金鑰（BYOK）。無論哪種方式，Open Design 都不會代理你的憑證——它們由你的 agent 直接使用。"}, {"name": "前端設計選 Cursor 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體、懂程式碼庫的設計決策著稱；Cursor 的優勢是編輯器裡“邊寫邊看”的緊湊迴路加實時預覽。很多團隊兩個都用——Open Design 讓你切換 agent 時無需改動設計工作流。"}, {"name": "怎麼把 Cursor 連到 Figma？", "text": "在 Cursor 里加上官方 Figma MCP server，然後把一個 Figma frame 連結粘進對話，讓 Cursor 去實現它。該 server 暴露真實的元件、變數和佈局資料，讓生成的程式碼貼合源設計。"}, {"name": "怎麼避開泛泛的“AI 味”觀感？", "text": "加一個設計 skill、提供真實的設計 tokens 和參考截圖、把品牌規則寫進 `.cursor/rules` 或 `AGENTS.md`，並在預覽裡跨斷點驗證。Open Design 把這些做成一個精選庫，讓你省掉逐專案的搭建。"}, {"name": "Open Design 和 Cursor 或 Anysphere 有關聯嗎？", "text": "沒有。Cursor 是 Anysphere 的產品；Open Design 是一個獨立的開源專案，把它作為一等介面卡來支援。Cursor 和 Anysphere 是 Anysphere, Inc. 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先。你的檔案、產物和 DESIGN.md 都留在你自己的 repo 裡，你的 Cursor 或模型憑證由你的 agent 直接使用，絕不經 Open Design 的伺服器中轉。"}], "ctaTitle": "用開放的方式，和 Cursor 一起做設計。", "ctaBody": "帶上你自己的 Cursor 賬號或模型金鑰，把每個檔案都留在本地，並在你已經在用的 agent 外面，得到一個精選的設計庫。", "ctaActions": [{"label": "在 Open Design 裡使用 Cursor", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面端", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有支援的 agent"},
    },
    'opencode': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['opencode']!,
      title: "OpenCode 做設計 — Open Design",
      description: "大家如何用 OpenCode 做 UI 和網頁設計 —— design.md 檔案、UI/UX skill、Figma MCP —— 以及 Open Design 如何把 OpenCode 變成本地優先的開源設計 Agent。",
      breadcrumb: "OpenCode",
      label: "Agent · OpenCode",
      heading: "用 OpenCode 做設計。",
      lead: "OpenCode 是開源的終端 AI 編碼 Agent。設計師給它掛上設計 skill 和 DESIGN.md 檔案來生成真正的 UI。Open Design 把這套做成結構化的開源工作流 —— 用你自己的模型金鑰，所有東西留本地。",
      rich: {"heroCtaLead": "Open Design 把 OpenCode 變成本地優先、開源的設計 agent——用你自己選的任意模型和 provider key，用你自己的檔案，外加一套精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 OpenCode", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["OpenCode 是一個開源、以終端為先的 AI 編碼 agent，刻意做成與模型無關：你自帶 provider key，在同一套工作流背後執行任意你想用的模型。這種開放性讓它天然適合做設計——但和所有 agent 一樣，只有當你給它正確的參考、skill 和一套驗證迴路時，它才能產出好的 UI。本文是一份從頭到尾的實用指南，講如何用 OpenCode 做 UI、前端和設計系統工作，以及如何把它接入 Open Design 的結構化設計工作流。", "內容涵蓋：OpenCode 到底是什麼、為什麼一個與模型無關的開源 agent 適合做設計、如何從零配置、截圖轉 UI 的迴路、AGENTS.md 與 MCP 如何擴充套件它、它與 Codex / Claude Code / Cursor 的對比、讓 AI 產出顯得套路化的那些坑，以及 Open Design 如何作為一個開源、本地優先的設計層來補上這道缺口——這是個天然的搭配，因為兩個專案都是開源、都跑在你自己的機器上。"], "heroImage": {"src": "/agents/opencode-design/opencode-design-hero.webp", "alt": "OpenCode 設計反饋迴路：終端 TUI agent、在瀏覽器中渲染 UI，以及一個工作區，帶一條迴環反饋箭頭", "caption": "核心迴路：OpenCode 在終端裡構建 UI，在真實瀏覽器中渲染並驗證，再對照你的參考反覆迭代——用的是你自己選的任意模型。"}, "tocLabel": "本頁目錄", "toc": [{"id": "what-is-opencode", "label": "OpenCode 究竟是什麼"}, {"id": "why-design", "label": "為什麼開放、任意模型的 agent 適合做設計"}, {"id": "setup", "label": "從零配置 OpenCode 做設計"}, {"id": "screenshot-workflow", "label": "截圖轉 UI 的工作流"}, {"id": "extend", "label": "AGENTS.md、MCP 與可分享會話"}, {"id": "vs", "label": "OpenCode vs Codex vs Claude Code vs Cursor"}, {"id": "pitfalls", "label": "坑，以及那種“AI 味”的觀感"}, {"id": "open-design", "label": "在 Open Design 中用 OpenCode 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-opencode", "heading": "OpenCode 究竟是什麼", "blocks": [{"kind": "p", "text": "OpenCode 是一個為終端打造的開源 AI 編碼 agent，由 SST 背後的團隊（Anomaly Innovations）維護。它會讀取你的程式碼倉庫、執行命令、編輯檔案，並與大語言模型對話——但和被廠商繫結的 agent 不同，它本身不自帶模型。你把它指向任意你想用的 provider 和模型，並自帶 key。"}, {"kind": "p", "text": "它以終端介面（TUI）執行，並在同一引擎之上提供桌面應用和 IDE 擴充套件。底層採用客戶端/服務端架構，所以真正幹活的 agent 與你驅動它的介面是解耦的。它內建 build 和 plan 兩個 agent，用 Tab 鍵切換。"}, {"kind": "steps", "items": [{"label": "與模型無關", "body": "模型和 provider 來自 models.dev 這個開放目錄。你在 opencode.json 裡用 provider/model-id 字串配置，並可禁用不想載入的 provider——所以同一套設計工作流可以跑在 Anthropic、OpenAI、Google、OpenRouter、本地模型等之上。"}, {"label": "指令檔案", "body": "OpenCode 會讀取專案裡的 AGENTS.md 檔案（跨工具的通用標準，也相容 CLAUDE.md）作為專案規則——這正是編碼你設計約定的天然位置。執行 /init 即可生成一個。"}, {"label": "可擴充套件", "body": "它支援 LSP 整合、MCP server、主題、快捷鍵和自定義命令，還有可分享的會話連結用於協作。"}]}, {"kind": "ul", "items": ["維護方：SST / Anomaly Innovations（開源專案）", "憑證：你自己的模型 provider API key（BYOK，無廠商鎖定）", "許可：MIT，開源"]}]}, {"id": "why-design", "heading": "為什麼開放、任意模型的 agent 適合做設計", "blocks": [{"kind": "p", "text": "OpenCode 不像廠商 agent 那樣有某一個“設計模型”——而這恰恰是它的優勢。因為與模型無關且開源，你可以在同一套設計工作流上執行當下前端最強的那個模型，之後隨時更換，或退回到本地模型，全程不用改配置。"}, {"kind": "p", "text": "但光選對模型並不能買來審美。和所有編碼 agent 一樣，除非你給它約束，否則 OpenCode 也會產出套路化的 UI。好的設計產出來自你提供的三項輸入。"}, {"kind": "steps", "items": [{"label": "一套設計系統", "body": "真實的 tokens、基礎元件和約定，讓 agent 複用，從而讓產出貼合某個品牌，而不是退回到通用的觀感。"}, {"label": "一個審美 skill", "body": "一個精選的 skill，強制真正的審美——剋制的動效、品牌優先的層級、最多兩種字型一種強調色——並讓 agent 在動手前先定一個方向。"}, {"label": "具體的參考圖", "body": "真實的參考圖，以及多種狀態（桌面和移動、hover、空態、載入態），而不是隻有一張主視覺。"}]}, {"kind": "image", "src": "/agents/opencode-design/opencode-design-taste-triangle.webp", "alt": "展示設計系統、skill 與參考圖三者匯聚成優質設計產出的示意圖", "caption": "審美來自你提供的三項輸入：一套設計系統、一個 skill 和真實參考圖——與你跑哪個模型無關。"}, {"kind": "p", "text": "結論：OpenCode 給了你模型自由，但審美仍來自一套精選的設計上下文。Open Design 恰好把這些輸入打包好，這也是兩者契合的原因——它們都是開源、都本地優先（下文詳述）。"}]}, {"id": "setup", "heading": "從零配置 OpenCode 做設計", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 OpenCode 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 OpenCode\ncurl -fsSL https://opencode.ai/install | bash\n# 或：npm i -g opencode-ai@latest\n# 或：brew install sst/tap/opencode\n\n# 2. 在專案裡啟動 TUI，然後認證你的 provider\nopencode          # 然後執行 /login，選擇 provider 並貼上你的 key\n\n# 3. 生成專案上下文\nopencode          # 在專案裡執行 /init 生成 AGENTS.md\n\n# 4. 選擇你的模型（任意 provider，經 models.dev）\n#    在 opencode.json 裡設定 \"provider/model-id\"，或在 TUI 裡切換\n\n# 5. 新增 MCP server（可選，比如用於設計交付）\n#    在 opencode.json 的 \"mcp\" 欄位下配置"}, {"kind": "image", "src": "/agents/opencode-design/opencode-design-setup-flow.webp", "alt": "五步配置流程：安裝、用你的 provider key 認證、配置 AGENTS.md、新增 skill、驗證", "caption": "配置順序：安裝 → 認證（你的 provider key）→ 配置 AGENTS.md → 新增 skill → 在真實瀏覽器中驗證。"}, {"kind": "steps", "items": [{"label": "編碼你的設計規則", "body": "把你的 tokens、基礎元件和約定放進 AGENTS.md（或從中引用的 DESIGN.md），讓產出貼合品牌而非退回通用觀感。opencode.json 裡的 instructions 選項可以用 glob 指向更多規則檔案。"}, {"label": "選一個有能力的模型", "body": "因為 OpenCode 與模型無關，可以為設計這一遍挑選當下前端最強的 provider/模型——而工作流的其餘部分保持不變。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖轉 UI 的工作流", "blocks": [{"kind": "p", "text": "用任何 agent 做設計，槓桿最高的迴路都是：把一張參考圖變成可用、響應式的 UI，並反覆迭代直到匹配。同樣的五步在 OpenCode 裡也適用。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考開始——幷包含多種狀態（桌面和移動、hover、空態、載入態），而不只是一張主視覺。", "提示詞要具體；含糊的提示會產出套路化的 UI。", "準備好一套設計系統，並告訴 OpenCode tokens 和規範基礎元件在哪裡（寫在 AGENTS.md 裡）。", "跑一個 dev server，讓 agent 在真實瀏覽器中渲染，並切換到各斷點檢查結果。", "讓 OpenCode 把它的實現對照截圖來迭代——而不只是確認能構建透過。"]}, {"kind": "p", "text": "在 TUI 裡用 @ 引用檔案會對工作目錄做模糊搜尋，用開頭的 ! 內聯執行 shell 命令，用 / 命令驅動各種操作。然後用具體約束來提示："}, {"kind": "code", "lang": "bash", "code": "opencode\n# 在 TUI 裡：\n> @reference-desktop.png @reference-mobile.png\n  用 React + Vite + Tailwind + TypeScript 實現這個設計。\n  複用 AGENTS.md 裡我現有的設計系統元件和 tokens。\n  匹配間距、佈局和層級；做到響應式。\n  執行 dev server，在瀏覽器中開啟，並反覆迭代\n  直到 UI 在各斷點上都與參考圖匹配。"}, {"kind": "p", "text": "提示詞保持小而聚焦，好的迭代就提交、壞的就回退（回退時告訴 OpenCode），讓每一遍都建立在一個乾淨的基礎上。"}]}, {"id": "extend", "heading": "AGENTS.md、MCP 與可分享會話", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 OpenCode 在持續的設計工作中真正好用，而且它們都能幹淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "AGENTS.md 規則", "body": "專案規則放在倉庫根目錄的 AGENTS.md（或全域性規則放在 ~/.config/opencode/AGENTS.md）。它是你設計約定的長期歸宿，每次執行都會讀取，併相容其他 agent 使用的 CLAUDE.md 檔案。"}, {"label": "MCP server", "body": "OpenCode 同時支援本地（命令）和遠端（URL）MCP server，在 mcp 欄位下配置——這是把設計上下文和外部工具引入進來的可移植方式，跨 agent 通用，而不只服務於 OpenCode。"}, {"label": "可分享會話", "body": "/share 命令會為一段會話建立公開連結，用於協作或評審，/unshare 則收回它——很適合為一遍設計獲取反饋。"}]}, {"kind": "p", "text": "這些都是可移植、跨 agent 的能力——正是 Open Design 被設計來去編排的那類東西，而不是每個專案裡重造一遍。"}]}, {"id": "vs", "heading": "OpenCode vs Codex vs Claude Code vs Cursor 做設計", "blocks": [{"kind": "p", "text": "設計工作沒有唯一贏家——每個 agent 各有所長，有經驗的團隊會疊著用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["OpenCode", "開源且與模型無關；在一套終端工作流背後執行任意 provider", "BYOK 自由、切換模型、完全開放且本地優先的配置"], ["Codex", "配合前端 skill 的視覺打磨能力強；影象理解", "委託式非同步、沙箱化構建、可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）和對程式碼庫有感知的 UX", "前端推理和大上下文重構"], ["Cursor", "帶實時預覽和內聯編輯的所見即所得迴路", "IDE 內緊湊的邊改邊看 UI 工作"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人——所有這些 agent 在沒有 skill、參考和約束時都會退回到通用觀感。這才是真正要解決的問題——它是設計工具形狀的，不是模型形狀的，而這恰恰說明了為什麼像 OpenCode 這樣的開放 agent 與一個開放的設計層配合得如此之好。"}]}, {"id": "pitfalls", "heading": "坑，以及如何避開那種“AI 味”觀感", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的吐槽是它看起來很套路——柔和漸變、懸浮面板、過大的圓角、誇張的陰影，一種 Inter 字型加紫色的味道，“一看就是 AI 做的”。其他被報告的問題還包括移動端佈局錯亂、指令文字漏進了 UI 文案。這些都不是 OpenCode 獨有的；它們是任何 agent 在缺少精選設計上下文時都會發生的事。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會強制 agent 定下一個真正的方向，而不是預設觀感。"}, {"label": "在真實瀏覽器中驗證", "body": "讓它跨斷點渲染並自檢，這樣佈局就不會在移動端悄悄崩掉。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖是對產出質量影響最大的單一槓杆。"}, {"label": "把規則寫進 AGENTS.md", "body": "把“不要 hero 卡片、最多兩種字型、品牌優先層級”這類規則放在 agent 每次都會讀到的地方。"}]}, {"kind": "p", "text": "注意到了嗎：每一項緩解措施都是關於給 agent 一套精選的設計上下文——無論你跑哪個模型。靠手工逐專案維護這套上下文，正是 Open Design 幫你免除的苦活。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 OpenCode 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一直在呼喚的開源設計層。它把 OpenCode 當作一等介面卡，併為它套上一套精選的 skill 與設計系統庫、一條結構化的渲染管線，以及一個本地桌面 UI——讓那些讓任何 agent 變好的設計上下文從第一次執行就在那裡，而不是每次都手工拼湊。兩個專案都是開源、都本地優先，這讓它們的搭配水到渠成。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 OpenCode 作為你的 agent。", "用你自己的模型 provider API key（BYOK）認證——憑證留在你的機器上，絕不經我們代理。", "選擇任意 provider 和模型，再加上一套設計系統和一個 skill，然後生成審美一致的 deck、原型和落地頁。", "每個產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是託管雲端。"]}, {"kind": "p", "text": "同一個 OpenCode agent、同樣的模型自由——外加一套真正可移植、開源的設計工作流。它本地優先、採用 Apache-2.0 許可，所以你的工作和憑證都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "OpenCode 真的能做設計嗎？", "text": "能——當上下文裡有審美 skill、設計系統和真實參考圖時，OpenCode 能產出生產級、響應式的 UI，並能在瀏覽器中驗證。因為它與模型無關，你可以執行當下前端最強的那個模型。缺少這套精選上下文時，它會傾向於退回到通用觀感，而這正是 Open Design 補上的缺口。"}, {"name": "用 OpenCode 做設計該選哪個模型？", "text": "你喜歡哪個都行——OpenCode 經 models.dev 與 provider 無關，所以你可以在同一套工作流背後執行 Anthropic、OpenAI、Google、OpenRouter 或本地模型，並隨時切換。設計產出的質量更多取決於你的 skill、設計系統和參考，而非單看模型。"}, {"name": "Open Design 是 OpenCode（SST）團隊做的嗎？", "text": "不是。Open Design 是一個獨立的開源專案，把 OpenCode 整合為一個 agent。它用一套本地優先、開源的 skill 與設計系統庫來補足 OpenCode。"}, {"name": "用 OpenCode 做設計需要什麼特殊訂閱嗎？", "text": "不需要——OpenCode 是 BYOK。你自帶模型 provider 的 API key，Open Design 絕不代理你的憑證，也沒有廠商鎖定。"}, {"name": "前端設計選 OpenCode、Codex 還是 Claude Code？", "text": "都很強，很多團隊會疊著用。OpenCode 的優勢在於完全開源且與模型無關；Codex 擅長委託式、沙箱化構建；Claude Code 以具體、對程式碼庫有感知的設計決策著稱。Open Design 讓你切換 agent 而不改變你的設計工作流。"}, {"name": "如何為設計上下文擴充套件 OpenCode？", "text": "把規則寫進 AGENTS.md，在 mcp 欄位下新增 MCP server 以引入可移植工具和設計上下文，並用可分享會話來做評審。Open Design 直接提供一套精選的 skill 與設計系統庫，讓你省去逐專案的配置。"}, {"name": "Open Design 與 OpenCode 或 SST 有關聯嗎？", "text": "沒有。OpenCode 是由 SST（Anomaly Innovations）維護的開源專案；Open Design 是一個獨立的開源專案，把它作為一等介面卡來支援。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的模型 provider 憑證由你的 agent 直接使用，絕不經 Open Design 伺服器中轉。"}], "ctaTitle": "用開放的方式，借 OpenCode 做設計。", "ctaBody": "自帶你的模型 provider key，把每個檔案留在本地，併為你已經在用的這個開放 agent 套上一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 OpenCode", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有支援的 agent"},
    },
    'gemini': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['gemini']!,
      title: "用於設計的 Gemini CLI — Open Design",
      description: "人們如何運用 Google 的 Gemini CLI 進行 UI 與網頁設計——它的多模態圖像理解能力、1M token 的上下文、GEMINI.md 與 MCP——以及 Open Design 如何將 Gemini CLI 化為一個 local-first、開源的設計代理。",
      breadcrumb: "Gemini CLI",
      label: "Agent · Gemini CLI",
      heading: "用於設計的 Gemini CLI。",
      lead: "Gemini CLI 是 Google 的開源終端機代理。它的多模態模型能讀懂螢幕截圖，1M token 的上下文足以容納整套設計系統，這讓它成為真正的設計工具——只要你給它參考、慣例與一套驗證迴圈。Open Design 將它接入開源的設計工作流：你的 Google 帳號或 API key、你的檔案，皆為 local-first。",
      rich: {"heroCtaLead": "Open Design 將 Gemini CLI 化為一個 local-first、開源的設計代理——你的 Google 帳號或 Gemini API key、你的檔案，外加一套精選的 skill 與設計系統函式庫環繞其上。", "heroCtaActions": [{"label": "在 Open Design 中使用 Gemini CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上加星", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用程式", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Gemini CLI 是 Google 推出的開源終端機 AI 代理。有兩點讓它在設計領域特別值得關注：它的模型具備強大的多模態能力，能讀懂一張螢幕截圖並推理出版面、間距與層級；而它 1M token 的上下文視窗能一次容納整套設計系統與程式碼庫。搭配適切的參考、慣例與一套驗證迴圈，它就能建構出真正可用的響應式 UI——而且只要有 Google 帳號就能免費上手。這是一份實務導向、端到端的指南，教你如何運用 Gemini CLI 處理 UI、前端與設計系統的工作，並將它接入 Open Design 這套結構化的設計工作流。", "本文涵蓋 Gemini CLI 究竟是什麼、為何它的多模態模型與龐大上下文契合設計、如何從零開始設定、螢幕截圖轉 UI 的迴圈、GEMINI.md 與 MCP 如何延伸它的能力、它與 Codex、Claude Code 和 Cursor 的比較、那些讓 AI 產出看起來千篇一律的陷阱，以及 Open Design 如何以一個開放、local-first 的設計層補上這道落差——兩者的搭配渾然天成，因為它們都是開源且在你自己的機器上執行。"], "heroImage": {"src": "/agents/gemini-design/gemini-design-hero.webp", "alt": "Gemini CLI 設計回饋迴圈：一個終端機代理讀取參考圖、一個瀏覽器渲染 UI、一個工作區，並有一道回饋箭頭循環回流", "caption": "核心迴圈：Gemini CLI 在終端機中讀取你的參考，在真實瀏覽器中建構並驗證 UI，並對照參考反覆迭代——同時將整套設計系統納入上下文。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-gemini-cli", "label": "Gemini CLI 究竟是什麼"}, {"id": "why-design", "label": "為何多模態 + 龐大上下文契合設計"}, {"id": "setup", "label": "為設計設定 Gemini CLI（從零開始）"}, {"id": "screenshot-workflow", "label": "螢幕截圖轉 UI 的工作流"}, {"id": "extend", "label": "GEMINI.md、MCP 與擴充功能"}, {"id": "vs", "label": "Gemini CLI vs Codex vs Claude Code vs Cursor"}, {"id": "pitfalls", "label": "陷阱與「AI 廉價感」的外觀"}, {"id": "open-design", "label": "在 Open Design 中以 Gemini CLI 設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-gemini-cli", "heading": "Gemini CLI 究竟是什麼", "blocks": [{"kind": "p", "text": "Gemini CLI 是 Google 為終端機推出的開源（Apache-2.0）AI 代理。它能讀取你的儲存庫、編輯檔案、執行 shell 指令、抓取網頁，並能以 Google 搜尋為答案提供佐證——它從自然語言任務出發來規劃並驗證工作，而不只是補全程式碼行。同一套引擎也驅動著 VS Code 內的 Gemini Code Assist 代理。"}, {"kind": "p", "text": "對設計工作而言，有兩項特性格外突出。它的模型原生支援多模態，因此你可以遞給它一張螢幕截圖，它便能就實際版面進行推理。而它的上下文視窗最高可達 1M token，大到足以一次容納你的整套設計系統、元件庫與參考集，而不必把它們摘要省略掉。"}, {"kind": "steps", "items": [{"label": "上下文檔案", "body": "Gemini CLI 會讀取一個 GEMINI.md 檔案來取得持久的專案上下文——這正是用來編入設計慣例、tokens 與審查檢查清單的天然之處。個人與團隊設定則疊加於其上。"}, {"label": "內建工具 + MCP", "body": "它開箱即附帶檔案、shell、web-fetch 與 Google 搜尋工具，並支援 MCP 伺服器（在 ~/.gemini/settings.json 中設定），以加入像即時 Figma 檔案這類的外部上下文。"}, {"label": "免費上手", "body": "以個人 Google 帳號登入即可獲得相當慷慨的 Gemini 請求免費額度；你也可以自備 Gemini API key 或使用 Vertex AI。"}]}, {"kind": "ul", "items": ["供應商：Google", "憑證：Google 帳號（免費額度），或來自 AI Studio 的 Gemini API key（BYOK），或 Vertex AI", "授權：Apache-2.0，開源"]}]}, {"id": "why-design", "heading": "為何多模態模型與龐大上下文契合設計", "blocks": [{"kind": "p", "text": "Gemini CLI 的設計優勢來自兩項模型特性——但一如每個代理，品味仍得由你來供給。"}, {"kind": "steps", "items": [{"label": "強大的多模態理解", "body": "因為 Gemini 模型原生支援多模態，代理能很好地讀懂參考螢幕截圖——把它渲染的成果與圖像對照比較，而不是從一段文字描述去揣測。"}, {"label": "1M token 的上下文視窗", "body": "龐大的上下文意味著整套設計系統、tokens 與眾多參考狀態能一次塞進去，於是代理會重用你真正的基本元素，而不是憑空發明一次性的樣式。"}, {"label": "GEMINI.md 中的慣例", "body": "一份 GEMINI.md（再加上 Figma MCP 伺服器）會把代理導向你的 tokens、元件與真實規格，讓它針對一個品牌工作，而不是套用預設外觀。"}]}, {"kind": "image", "src": "/agents/gemini-design/gemini-design-taste-triangle.webp", "alt": "圖示展示設計系統、skill 與參考圖三者匯聚成優秀的設計產出", "caption": "品味來自你提供的三項輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這個道理和每個代理教給我們的一樣：Gemini CLI 預設並不具備品味。當你給它約束時，它才能產出優秀的設計——一套設計系統、一個美學 skill，以及具體的參考。Open Design 正是把這些輸入打包起來，這也是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始為設計工作設定 Gemini CLI", "blocks": [{"kind": "p", "text": "以下是從一台乾淨的機器，到一個能建構並驗證 UI 的 Gemini CLI，完整的設定路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. Install Gemini CLI (Node 20+)\nnpm install -g @google/gemini-cli\n# or run without installing: npx https://github.com/google-gemini/gemini-cli\n\n# 2. Start it in your project and authenticate on first run\ncd your-project\ngemini            # sign in with your Google account, or set GEMINI_API_KEY\n\n# 3. Generate project context\n/init             # scaffolds a GEMINI.md for this project\n\n# 4. Wire the Figma MCP server (optional, for design handoff)\n#    add it under \"mcpServers\" in ~/.gemini/settings.json"}, {"kind": "image", "src": "/agents/gemini-design/gemini-design-setup-flow.webp", "alt": "五步驟設定流程：安裝、驗證、設定 GEMINI.md、加入 skill、驗證", "caption": "設定順序：安裝 → 驗證 → 設定 GEMINI.md → 加入 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "編入你的設計規則", "body": "把你的 tokens、基本元素與慣例放進 GEMINI.md，並讓 Gemini 指向它們，使產出符合一個品牌，而不是退回到千篇一律的外觀。"}, {"label": "加入瀏覽器驗證", "body": "接上一個 Playwright 或瀏覽器 MCP，讓 Gemini 在真實瀏覽器中渲染，並跨各種斷點檢查其產出，而不只是確認建構通過。"}]}]}, {"id": "screenshot-workflow", "heading": "螢幕截圖轉 UI 的工作流", "blocks": [{"kind": "p", "text": "Gemini CLI 槓桿效益最高的設計迴圈，是把一張參考圖轉成可運作的響應式 UI，並反覆迭代直到吻合——借助多模態模型把產出與參考對照比較。"}, {"kind": "ol", "items": ["從你手上最清晰的視覺參考出發——並納入多種狀態（桌面與行動裝置、hover、空狀態、載入中），而不只是一張主視覺。", "在提示中要具體；即使有強大的模型，含糊的提示仍會產出千篇一律的 UI。", "把你的設計系統與慣例保存在 GEMINI.md 中，並告訴 Gemini tokens 與權威基本元素位於何處。", "啟動一個 dev server，讓 Gemini 在真實瀏覽器中渲染，並調整尺寸至各斷點來檢查結果。", "讓 Gemini 把它的實作與螢幕截圖對照比較來迭代——而不只是確認它能建構成功。"]}, {"kind": "p", "text": "用 @ 引用一張圖把它附加到提示中，接著給出具體的約束："}, {"kind": "code", "lang": "bash", "code": "gemini\n# in the prompt:\n> @reference-desktop.png @reference-mobile.png\n  Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from GEMINI.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints."}, {"kind": "p", "text": "讓提示保持小而聚焦，提交好的迭代並還原壞的迭代（還原時告知 Gemini），如此每一輪都建立在乾淨的基礎之上。"}]}, {"id": "extend", "heading": "GEMINI.md、MCP 與擴充功能", "blocks": [{"kind": "p", "text": "三個擴充點讓 Gemini CLI 足以勝任持續性的設計工作，而這三者都能乾淨俐落地對應到一套開放的設計工作流。"}, {"kind": "steps", "items": [{"label": "GEMINI.md 上下文", "body": "專案規則存放於儲存庫根目錄的 GEMINI.md 中（並有全域與團隊層級）。它是你設計慣例的長久歸宿，每次執行都會被讀取。"}, {"label": "MCP 伺服器", "body": "在 ~/.gemini/settings.json 下設定 MCP 伺服器——這是引入設計上下文與外部工具的可攜方式，其中最切題的便是 Figma MCP 伺服器，且這些能力可跨代理通用，不限於 Gemini。"}, {"label": "擴充功能與內建工具", "body": "Gemini CLI 的擴充功能，以及它內建的 Google 搜尋、檔案、shell 與 web-fetch 工具，讓它無需離開終端機就能蒐集參考並執行驗證迴圈。"}]}, {"kind": "p", "text": "這些都是可攜、跨代理的能力——正是 Open Design 生來要去編排的那類東西，而非在每個專案中重新打造。"}]}, {"id": "vs", "heading": "用於設計時的 Gemini CLI vs Codex vs Claude Code vs Cursor", "blocks": [{"kind": "p", "text": "設計工作沒有唯一的贏家——每個代理各有不同的強項，而資深團隊會把它們疊起來用。一份公允的總結："}, {"kind": "table", "columns": ["代理", "設計強項", "最適合"], "rows": [["Gemini CLI", "強大的多模態圖像理解與 1M token 上下文；開源且附帶免費額度", "大量依賴螢幕截圖的工作，以及把整套設計系統納入上下文"], ["Codex", "搭配前端 skill 帶來出色的視覺精緻度；沙箱化的非同步建構", "委派式的非同步建構與可攜的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）與理解程式碼庫的 UX", "前端推理與大上下文的重構"], ["Cursor", "搭配即時預覽與行內編輯的視覺式「建構即所見」迴圈", "在 IDE 中緊湊的「邊迭代邊觀察」UI 工作"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人類——少了 skills、參考與約束，它們全都會退回千篇一律的美學。那才是真正要解決的問題——而它的形狀屬於設計工具，而非模型。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避開「AI 廉價感」的外觀", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨，就是它看起來千篇一律——柔和的漸層、漂浮的面板、過大的圓角、戲劇化的陰影，那種 Inter 字型加紫色的調調，「一看就知道是 AI 做的」。其他被回報的問題還包括行動裝置版面破版，以及指示文字外洩到 UI 文案裡。這些都不是 Gemini CLI 獨有的；它們是任何代理在缺乏精選設計上下文下執行時必然發生的結果。"}, {"kind": "steps", "items": [{"label": "加入一個美學 skill", "body": "一個精選的設計 skill 會迫使代理選定一個真實的方向，而不是套用預設外觀。"}, {"label": "在真實瀏覽器中驗證", "body": "運用多模態模型跨各斷點渲染並自我檢查，讓版面不會在行動裝置上悄悄破版。"}, {"label": "提供 tokens 與參考", "body": "真實的設計 tokens 與參考螢幕截圖，是對產出品質影響最大的單一槓桿。"}, {"label": "把規則編入 GEMINI.md", "body": "把「不要主視覺卡片、最多兩種字型、品牌優先的層級」這類風格規則，放在代理每次執行都會讀到的地方。"}]}, {"kind": "p", "text": "請留意，每一項對策都在於給代理一套精選的設計上下文。逐專案手工維護那份上下文，正是 Open Design 替你免去的苦工。"}]}, {"id": "open-design", "heading": "在 Open Design 中以 Gemini CLI 設計", "blocks": [{"kind": "p", "text": "Open Design 正是上述工作流一再呼喚的那個開源設計層。它把 Gemini CLI 當作一級的轉接器，並以一套精選的 skill 與設計系統函式庫、一條結構化的渲染管線，以及一個本機桌面 UI 將它包裹起來——於是讓 Gemini 變強的那份設計上下文，從第一次執行起就已就位，無需每次手工拼湊。兩者皆為開源且 local-first，這讓這場搭配渾然天成。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Gemini CLI 作為你的代理。", "以你的 Google 帳號或 Gemini API key（BYOK）驗證——憑證留在你的機器上，絕不經由我們代理轉送。", "挑一套設計系統與一個 skill，接著以一致的品味產出簡報、原型與著陸頁。", "每一份產物與 DESIGN.md 檔案都存在你自己的儲存庫裡，而非託管的雲端。"]}, {"kind": "p", "text": "同一個 Gemini CLI 代理、同一把 key——外加一套真正可攜、開源的設計工作流環繞其上。它是 local-first 且 Apache-2.0 的，因此關於你的工作或你的憑證，沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Gemini CLI 真的能做設計工作嗎？", "text": "可以——只要上下文中有一個美學 skill、一套設計系統與真實的參考圖，Gemini CLI 就能產出可上線品質的響應式 UI，而它強大的多模態模型會對照參考來驗證產出。缺了那份上下文，它往往會退回千篇一律的外觀，這正是 Open Design 補上的落差。"}, {"name": "用 Gemini CLI 做設計需要付費嗎？", "text": "不需要——以 Google 帳號登入即可獲得相當慷慨的免費額度，你也可以自備 Gemini API key（BYOK）或使用 Vertex AI。無論哪種方式，Open Design 都不會代理轉送你的憑證。"}, {"name": "Gemini CLI 在設計上具體好在哪？", "text": "兩點：它的模型具備強大的多模態能力，因此能很好地讀懂參考螢幕截圖；而它 1M token 的上下文能一次容納整套設計系統與參考集。兩者都有幫助——但品味仍然來自你供給的設計系統、skill 與參考。"}, {"name": "前端設計該用 Gemini CLI 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體、理解程式碼庫的設計決策著稱；Gemini CLI 的優勢則在於多模態理解，外加龐大的上下文與免費額度。許多團隊兩者並用——Open Design 讓你切換代理而無需改動你的設計工作流。"}, {"name": "我要如何把 Gemini CLI 連到 Figma？", "text": "在 ~/.gemini/settings.json 的 mcpServers 下加入 Figma MCP 伺服器。Gemini 接著便能拉取真實的設計上下文——元件、變數、版面資料——讓生成的程式碼吻合來源，而非近似地揣摩。"}, {"name": "Open Design 與 Google 有從屬關係嗎？", "text": "沒有。Gemini CLI 是 Google 的產品；Open Design 是一個獨立的開源專案，以一級轉接器的形式支援它。Gemini 是 Google 的商標。"}, {"name": "我的檔案與憑證安全嗎？", "text": "安全——Open Design 是 local-first 且 Apache-2.0 的。你的檔案、產物與 DESIGN.md 都留在你自己的儲存庫裡，而你的 Google 憑證由你的代理直接使用，絕不經由 Open Design 的伺服器轉送。"}], "ctaTitle": "以開放的方式，用 Gemini CLI 設計。", "ctaBody": "自備你的 Google 帳號或 Gemini API key，讓每一份檔案都留在本機，並在你早已使用的代理周圍獲得一套精選的設計函式庫。", "ctaActions": [{"label": "在 Open Design 中使用 Gemini CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上加星", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用程式", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "查看所有支援的代理"},
    },
    'copilot': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['copilot']!,
      title: "用 GitHub Copilot CLI 做設計 — Open Design",
      description: "人們如何用 GitHub Copilot CLI 做 UI 和網頁設計——它原生於終端的編碼 agent、自定義指令檔案、MCP 支援以及多模型選擇——以及 Open Design 如何把 Copilot CLI 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "GitHub Copilot CLI",
      label: "Agent · GitHub Copilot CLI",
      heading: "用 GitHub Copilot CLI 做設計。",
      lead: "GitHub Copilot CLI 是 GitHub 原生於終端的編碼 agent。它能在整個倉庫範圍內規劃與編輯，從 Claude、GPT 等前沿模型中任選其一，並讀取你的倉庫指令——這讓它在你提供了參考、規範和驗證閉環之後，成為一個真正的設計工具。Open Design 把它接入開源的設計工作流：用你的 GitHub Copilot 訂閱、你的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 GitHub Copilot CLI 變成一個本地優先、開源的設計 agent——你的 GitHub Copilot 訂閱、你的檔案，外加圍繞它的一套精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Copilot CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["GitHub Copilot CLI 是 GitHub 原生於終端的編碼 agent——與驅動 Copilot 編碼 agent 的同一套 agentic 框架，被搬到了你的命令列。有兩點讓它對設計尤其有意思：它會讀取你的倉庫指令和 AGENTS.md，因此你的設計規範每次執行都會隨 agent 一起生效；同時它允許你按任務在 Anthropic、OpenAI 和 Google 的前沿模型之間任選其一，從而挑出對某個 UI 推理最佳的那個。配上恰當的參考、規範和驗證閉環，它能構建真正可用的響應式 UI——而且它跑在你可能已經擁有的 Copilot 訂閱上。這是一份關於如何用 Copilot CLI 做 UI、前端和設計系統工作，並把它接入 Open Design 結構化設計工作流的實用端到端指南。", "本文涵蓋：Copilot CLI 究竟是什麼、為什麼倉庫指令和模型選擇契合設計、如何從零開始配置它、截圖轉 UI 的閉環、自定義指令和 MCP 如何擴充套件它、它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比、那些讓 AI 輸出顯得千篇一律的陷阱，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合差距——你的訂閱和憑證留在你自己的機器上，你的產物留在你自己的倉庫裡。"], "heroImage": {"src": "/agents/copilot-design/copilot-design-hero.webp", "alt": "GitHub Copilot CLI 設計反饋閉環：一個終端 agent 讀取參考圖，一個瀏覽器渲染 UI，加上一個工作區，還有一條反饋箭頭回環", "caption": "核心閉環：Copilot CLI 在終端裡讀取你的參考，在真實瀏覽器中構建並驗證 UI，然後對照參考迭代——你的設計規範則放在倉庫指令裡。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-copilot", "label": "GitHub Copilot CLI 究竟是什麼"}, {"id": "why-design", "label": "為什麼指令 + 模型選擇契合設計"}, {"id": "setup", "label": "從零開始為設計配置 Copilot CLI"}, {"id": "screenshot-workflow", "label": "截圖轉 UI 的工作流"}, {"id": "extend", "label": "自定義指令、MCP 與擴充套件"}, {"id": "vs", "label": "Copilot CLI 對比 Codex、Claude Code、Cursor、Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與“AI 流水線感”的觀感"}, {"id": "open-design", "label": "在 Open Design 中用 Copilot CLI 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-copilot", "heading": "GitHub Copilot CLI 究竟是什麼", "blocks": [{"kind": "p", "text": "GitHub Copilot CLI 是 GitHub 原生於終端的編碼 agent。它讀取你的倉庫、編輯檔案、執行 shell 命令，並直接結合你的 GitHub 上下文——issue、pull request 和倉庫——用你現有的 GitHub 賬號鑑權。它由與 GitHub Copilot 編碼 agent 同一套 agentic 框架驅動，因此能規劃複雜任務並迭代，而不只是補全程式碼行。它在 2025 年 9 月開啟公開預覽後，於 2026 年 2 月正式全面上線。"}, {"kind": "p", "text": "對設計工作而言，有兩點尤為突出。它會讀取自定義指令檔案——位於 .github/copilot-instructions.md 的倉庫級規則以及 AGENTS.md——因此你的設計規範每次執行都會被自動納入。它還支援多家基礎模型提供方，因此你可以用 /model 命令按任務切換到對某個 UI 推理最佳的那個模型。"}, {"kind": "steps", "items": [{"label": "指令檔案", "body": "Copilot CLI 會讀取 .github/copilot-instructions.md 中的倉庫指令、.github/instructions 下的路徑專屬檔案，以及 AGENTS.md——這是為你的設計規範、tokens 和評審清單編碼的天然之處。"}, {"label": "內建工具 + MCP", "body": "它內建了 GitHub 的 MCP server，並執行檔案和 shell 工具，你還可以用 /mcp add 新增自定義 MCP server（配置存於 ~/.copilot 下的 mcp-config.json），以引入諸如即時 Figma 檔案這樣的外部上下文。"}, {"label": "模型選擇", "body": "用 /model 命令在 Anthropic、OpenAI 和 Google 的前沿模型之間任選其一——按任務切換，全部跑在你現有的 Copilot 訂閱上。"}]}, {"kind": "ul", "items": ["廠商：GitHub", "憑證：一個有效的 GitHub Copilot 訂閱（Pro、Pro+、Business 或 Enterprise）", "安裝：npm install -g @github/copilot，然後執行 copilot"]}]}, {"id": "why-design", "heading": "為什麼倉庫指令和模型選擇契合設計", "blocks": [{"kind": "p", "text": "Copilot CLI 的設計優勢來自兩點——但和每個 agent 一樣，審美仍需由你提供。"}, {"kind": "steps", "items": [{"label": "隨倉庫一起流轉的規範", "body": "因為 Copilot CLI 會自動讀取 .github/copilot-instructions.md 和 AGENTS.md，你的 tokens、基礎元件和評審規則每次執行都在上下文裡——agent 是面向一個品牌而非預設觀感來工作。"}, {"label": "按任務挑對模型", "body": "在 Anthropic、OpenAI 和 Google 之間做模型選擇，意味著你可以為某個佈局選用推理最佳的模型，再為下一個任務切換——而無需改變你的工作流。"}, {"label": "通過 MCP 接入真實規格", "body": "內建的 GitHub MCP server 加上 Figma MCP server，把 agent 指向你的 tokens、元件和真實規格，於是它從源頭構建，而不是近似猜測。"}]}, {"kind": "image", "src": "/agents/copilot-design/copilot-design-taste-triangle.webp", "alt": "示意圖：設計系統、skill 和參考圖匯聚成優秀的設計輸出", "caption": "審美來自你提供的三項輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這個教訓和每個 agent 給我們的一樣：Copilot CLI 預設並沒有審美。當你給它約束時——一套設計系統、一個審美 skill 和具體參考——它才能產出好設計。Open Design 正是把這些輸入打包好，這也是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始為設計工作配置 Copilot CLI", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨機器到一個能構建並驗證 UI 的 Copilot CLI 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Copilot CLI（需要 Node.js）\nnpm install -g @github/copilot\n\n# 2. 在你的專案中啟動它，並在首次執行時鑑權\ncd your-project\ncopilot           # 執行 /login 並按提示登入\n\n# 3. 為任務選擇一個模型\n#    在會話中：\n/model            # 從 Anthropic、OpenAI 或 Google 中挑一個前沿模型\n\n# 4. 新增自定義指令和 Figma MCP server（可選）\n#    編寫 .github/copilot-instructions.md 或 AGENTS.md\n/mcp add          # 新增 Figma MCP server 用於設計交付"}, {"kind": "image", "src": "/agents/copilot-design/copilot-design-setup-flow.webp", "alt": "五步配置流程：安裝、鑑權、選擇模型、配置指令、驗證", "caption": "配置順序：安裝 → 鑑權 → 選擇模型 → 編寫指令 → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "為你的設計規則編碼", "body": "把你的 tokens、基礎元件和規範放進 .github/copilot-instructions.md 或 AGENTS.md，讓輸出貼合一個品牌，而非退回到千篇一律的觀感。"}, {"label": "加入瀏覽器驗證", "body": "接入 Playwright 或瀏覽器 MCP，讓 Copilot 在真實瀏覽器中渲染，並跨斷點檢查輸出，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖轉 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Copilot CLI 做設計、槓桿最高的閉環，是把一張參考圖變成可用的響應式 UI，並不斷迭代直到匹配——藉助一個強大的多模態模型把輸出對照參考來比較。"}, {"kind": "ol", "items": ["從你手上最清晰的視覺參考出發——幷包含多種狀態（桌面與移動、懸停、空態、載入態），而不只是一張主視覺。", "在 prompt 裡寫具體；即便用了強模型，含糊的 prompt 也會產出千篇一律的 UI。", "把你的設計系統和規範放進 .github/copilot-instructions.md 或 AGENTS.md，並告訴 Copilot tokens 和標準基礎元件在哪裡。", "執行一個 dev server，讓 Copilot 在真實瀏覽器中渲染，調整到各斷點來檢查結果。", "讓 Copilot 把它的實現對照截圖來比較以進行迭代——而不只是確認能構建通過。"]}, {"kind": "p", "text": "把 Copilot 指向你的參考圖並給出具體約束；它在執行前會預覽每一次檔案編輯或命令，等你批准："}, {"kind": "code", "lang": "bash", "code": "copilot\n# 在 prompt 中：\n> Implement the design in reference-desktop.png and reference-mobile.png\n  in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens described in\n  .github/copilot-instructions.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints."}, {"kind": "p", "text": "保持 prompt 小而聚焦，提交好的迭代、回退壞的迭代（回退時告訴 Copilot），這樣每一輪都建立在乾淨的基礎之上。"}]}, {"id": "extend", "heading": "自定義指令、MCP 與擴充套件", "blocks": [{"kind": "p", "text": "有三個擴充套件點讓 Copilot CLI 適合持續的設計工作，而且這三者都能幹淨地對映到開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "自定義指令", "body": "倉庫規則存於 .github/copilot-instructions.md（連同 .github/instructions 下的路徑專屬檔案和 AGENTS.md）。它們是你設計規範的長期歸宿，每次執行都會被自動納入。"}, {"label": "MCP server", "body": "Copilot CLI 內建了 GitHub 的 MCP server，並允許你通過 /mcp add 新增自定義 server（配置存於 ~/.copilot 下的 mcp-config.json）——這是引入設計上下文（最相關的就是 Figma MCP server）的可移植方式，可跨多個 agent 通用，而不止 Copilot。"}, {"label": "專用 agent 與內建工具", "body": "Copilot CLI 的專用模式——用於程式碼庫探索、執行構建與測試、變更評審和規劃——加上它的檔案和 shell 工具，讓它無需離開終端就能收集參考並跑完驗證閉環。"}]}, {"kind": "p", "text": "這些都是可移植的、多 agent 通用的能力——正是 Open Design 旨在編排、而非在每個專案裡重複造的那類東西。"}]}, {"id": "vs", "heading": "做設計時 Copilot CLI 對比 Codex、Claude Code、Cursor、Gemini CLI", "blocks": [{"kind": "p", "text": "設計工作沒有唯一贏家——每個 agent 各有所長，有經驗的團隊會把它們疊加使用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Copilot CLI", "多模型選擇（Anthropic、OpenAI、Google）以及在你的 Copilot 訂閱上深度的 GitHub 整合", "按任務挑選最佳模型，以及與你的 GitHub 倉庫繫結的指令驅動型工作"], ["Codex", "憑藉前端 skill 帶來出色的視覺打磨；沙箱化的非同步構建", "委託式非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）和理解程式碼庫的 UX", "前端推理和大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的“邊構建邊看”視覺閉環", "在 IDE 內緊湊的“邊迭代邊觀察”UI 工作"], ["Gemini CLI", "強大的多模態影像理解和 100 萬 token 上下文；開源且帶免費額度", "大量依賴截圖的工作，以及在上下文中容納整套設計系統"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人——沒有 skill、參考和約束，它們都會預設退回到千篇一律的觀感。這才是真正要解決的問題——而且它是設計工具的形狀，不是模型的形狀。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避免“AI 流水線感”的觀感", "blocks": [{"kind": "p", "text": "關於 AI 生成設計最常見的抱怨是它看起來千篇一律——柔和漸變、懸浮面板、過大的圓角、誇張的陰影，以及一種 Inter 字型配紫色、“一眼就是 AI 做的”的氣質。其他被反映的問題還包括移動端佈局錯亂、指令文字漏進 UI 文案。這些都不是 Copilot CLI 獨有的；任何 agent 在缺少精選設計上下文時執行，都會這樣。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會迫使 agent 投入到一個真正的方向上，而非預設觀感。"}, {"label": "在真實瀏覽器中驗證", "body": "用瀏覽器 MCP 跨斷點渲染並自檢，這樣佈局就不會在移動端悄無聲息地崩壞。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖，是對輸出質量影響最大的單一槓杆。"}, {"label": "把規則寫進自定義指令", "body": "把諸如“不用 hero 卡片、最多兩種字型、品牌優先的層級”這類風格規則放進 .github/copilot-instructions.md 或 AGENTS.md，agent 每次執行都會讀到。"}]}, {"kind": "p", "text": "注意，每一項緩解措施都是在給 agent 提供精選的設計上下文。手工地、逐專案地維護這份上下文，正是 Open Design 要消除的苦工。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Copilot CLI 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一直在呼喚的開源設計層。它把 GitHub Copilot CLI 當作一等介面卡，並用一套精選的 skill 與設計系統庫、一條結構化的渲染流水線和一個本地桌面 UI 把它包裹起來——這樣讓 Copilot 變好的那份設計上下文，從第一次執行就已就位，而不必每次手工拼裝。Open Design 獨立、開源（Apache-2.0）且本地優先，這正是兩者契合的原因：agent 幹活，你的檔案和憑證仍歸你所有。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 GitHub Copilot CLI 作為你的 agent。", "用你的 GitHub Copilot 訂閱鑑權——憑證留在你的機器上，絕不經我們代理。", "選一套設計系統和一個 skill，然後以一致的審美生成演示稿、原型和落地頁。", "每一個產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而非託管的雲端。"]}, {"kind": "p", "text": "同一個 Copilot CLI agent、同一份訂閱——外加圍繞它的一套真實、可移植、開源的設計工作流。Open Design 本地優先且採用 Apache-2.0，所以關於你的工作或憑證的一切都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "GitHub Copilot CLI 真的能做設計工作嗎？", "text": "能——只要在上下文裡有一個審美 skill、一套設計系統和真實參考圖，Copilot CLI 就能產出生產級、響應式的 UI，而且你可以挑選最能對照參考驗證輸出的那個模型。缺少這份上下文時，它往往會預設退回到千篇一律的觀感，而這正是 Open Design 要填補的差距。"}, {"name": "用 Copilot CLI 做設計需要訂閱嗎？", "text": "需要——Copilot CLI 跑在一個有效的 GitHub Copilot 訂閱上（Pro、Pro+、Business 或 Enterprise）；它不是 BYOK。你用 GitHub 賬號鑑權。Open Design 絕不代理你的憑證——你的訂閱由你的 agent 直接使用。"}, {"name": "Copilot CLI 具體好在哪、為什麼適合設計？", "text": "兩點：它會自動讀取倉庫指令和 AGENTS.md，於是你的設計規範隨倉庫流轉；它還讓你按任務在 Anthropic、OpenAI 和 Google 的前沿模型之間切換。兩者都有幫助——但審美仍來自你提供的設計系統、skill 和參考。"}, {"name": "前端設計該用 Copilot CLI 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體、理解程式碼庫的設計決策著稱；Copilot CLI 的優勢在於跨提供方的模型選擇，以及在你可能已經擁有的訂閱上深度的 GitHub 整合。許多團隊兩者並用——Open Design 讓你切換 agent 而無需改變設計工作流。"}, {"name": "怎麼把 Copilot CLI 連線到 Figma？", "text": "用 /mcp add 命令新增 Figma MCP server；設定存於 ~/.copilot 下的 mcp-config.json。之後 Copilot 就能拉取真實的設計上下文——元件、變數、佈局資料——讓生成的程式碼貼合源頭，而非近似猜測。"}, {"name": "Open Design 與 GitHub 或 Microsoft 有關聯嗎？", "text": "沒有。GitHub Copilot CLI 是 GitHub 的產品；Open Design 是一個獨立的開源專案，以一等介面卡的方式支援它。GitHub Copilot 是 GitHub, Inc. 和 Microsoft 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的 GitHub Copilot 憑證由你的 agent 直接使用，絕不經 Open Design 伺服器路由。"}], "ctaTitle": "用 GitHub Copilot CLI 做設計，以開放的方式。", "ctaBody": "帶上你的 GitHub Copilot 訂閱，把每個檔案都留在本地，圍繞你已經在用的 agent 獲得一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Copilot CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'qwen': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['qwen']!,
      title: "用 Qwen Code 做設計 — Open Design",
      description: "人們如何用阿里巴巴開源的 Qwen Code CLI 做 UI 和網頁設計——它的 Qwen3-Coder 模型、超大上下文視窗、QWEN.md 和 MCP——以及 Open Design 如何把 Qwen Code 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "Qwen Code",
      label: "Agent · Qwen Code",
      heading: "用 Qwen Code 做設計。",
      lead: "Qwen Code 是阿里巴巴開源的終端 agent，由 Gemini CLI 改造而來，並針對 Qwen3-Coder 模型做了調優。它超大的上下文視窗能一次性裝下整套設計系統，這讓它成為一個真正可用的設計工具——前提是你給它參考、規範和一套驗證閉環。Open Design 把它接入開源設計工作流：用你自己的 DashScope 或 Qwen API key、你自己的檔案，全程本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Qwen Code 變成一個本地優先、開源的設計 agent——用你自己的 DashScope 或 Qwen API key、你自己的檔案，外加圍繞它的一套精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Qwen Code", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Qwen Code 是阿里巴巴開源的終端 AI agent。它由 Google 的 Gemini CLI 改造而來，在解析器層面和提示詞上做了適配，讓它能充分發揮 Qwen3-Coder 模型的能力。有兩點讓它在設計場景中尤其值得關注：它是一個強大的 agent 化編碼模型，能從一個自然語言任務出發，自己規劃、編輯檔案、跑構建和驗證閉環；它的超大上下文視窗能一次性裝下整套設計系統和程式碼庫。配上恰當的參考、規範和一套驗證閉環，它能構建出真實、響應式的 UI——而且它是開源、BYOK 的，你自帶 key 就能用。這是一份實用的端到端指南，講如何用 Qwen Code 做 UI、前端和設計系統的工作，以及如何用 Open Design 把它接入一套結構化的設計工作流。", "本文涵蓋：Qwen Code 究竟是什麼，為什麼一個強編碼模型加超大上下文契合設計，如何從零搭好它，參考到 UI 的閉環，QWEN.md 和 MCP 如何擴充套件它，它與 Codex、Claude Code、Cursor、Gemini CLI 相比如何，那些讓 AI 產出顯得平庸的坑，以及 Open Design 如何作為一個開放、本地優先的設計層補上缺口——這是一對天然組合，因為兩者都開源、都跑在你自己的機器上。"], "heroImage": {"src": "/agents/qwen-design/qwen-design-hero.webp", "alt": "Qwen Code 設計反饋閉環：終端 agent 讀取一張參考圖、瀏覽器渲染 UI、一個工作區，外加一條迴環的反饋箭頭", "caption": "核心閉環：Qwen Code 在終端裡讀取你的參考，在真實瀏覽器裡構建並驗證 UI，並對照參考反覆迭代——整套設計系統始終在上下文裡。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-qwen", "label": "Qwen Code 究竟是什麼"}, {"id": "why-design", "label": "為什麼強編碼模型 + 超大上下文契合設計"}, {"id": "setup", "label": "從零搭好用於設計的 Qwen Code"}, {"id": "screenshot-workflow", "label": "參考到 UI 的工作流"}, {"id": "extend", "label": "QWEN.md、MCP 和擴充套件"}, {"id": "vs", "label": "Qwen Code vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "坑，以及那種「AI 味」外觀"}, {"id": "open-design", "label": "在 Open Design 中用 Qwen Code 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-qwen", "heading": "Qwen Code 究竟是什麼", "blocks": [{"kind": "p", "text": "Qwen Code 是阿里巴巴為終端釋出的開源（Apache-2.0）AI agent。它讀取你的倉庫、編輯檔案、執行 shell 命令、上網檢索——從自然語言任務出發去規劃和驗證工作，而不只是補全幾行程式碼。它由 Google 的 Gemini CLI 改造而來，在解析器層面和提示詞上做了調優，以釋放 Qwen3-Coder 模型在 agent 化編碼任務上的能力。"}, {"kind": "p", "text": "對設計工作來說，有兩個特性格外突出。它是一個強大的 agent 化編碼器，能拿著一份參考和一份清晰的需求去構建、執行並自我糾正出響應式 UI。而 Qwen3-Coder 模型自帶超大上下文視窗，大到足以一次性裝下你整套設計系統、元件庫和參考集，而不必把它們壓縮概括掉。"}, {"kind": "steps", "items": [{"label": "上下文檔案", "body": "Qwen Code 會讀取一個 QWEN.md 檔案作為持久的專案上下文——這正是編寫你的設計規範、tokens 和評審清單的天然位置。個人和專案級設定會層層疊加在其上。"}, {"label": "內建工具 + MCP", "body": "它開箱即帶檔案、shell 和 web 工具，並支援 MCP server（在 ~/.qwen/settings.json 的 mcpServers 下配置），以接入像即時 Figma 檔案這樣的外部上下文。"}, {"label": "從 BYOK 起步", "body": "你自帶 key——一個 DashScope（阿里雲百鍊）API key，或任意 OpenAI 相容端點，或 ModelScope——並在 settings.json 中配置。"}]}, {"kind": "ul", "items": ["廠商：Alibaba", "憑證：DashScope / Qwen API key（BYOK），或 OpenAI 相容端點 / ModelScope", "許可：Apache-2.0，開源（由 Gemini CLI 改造而來）"]}]}, {"id": "why-design", "heading": "為什麼強編碼模型和超大上下文契合設計", "blocks": [{"kind": "p", "text": "Qwen Code 的設計優勢來自兩個特性——但和每個 agent 一樣，審美仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "強大的 agent 化編碼", "body": "Qwen3-Coder 模型針對 agent 化任務做了調優，因此這個 agent 會規劃、編輯、跑構建並自我糾正——把一份清晰的參考和需求變成響應式標記，而不是一錘子的瞎猜。"}, {"label": "超大上下文視窗", "body": "Qwen3-Coder 的超大上下文意味著整套設計系統、tokens 和許多參考狀態能一次性裝下，於是 agent 會複用你真實的基礎原語，而不是憑空造出一次性的樣式。"}, {"label": "QWEN.md 裡的規範", "body": "一份 QWEN.md（加上 Figma MCP server）把 agent 指向你的 tokens、元件和真實規格，於是它是對著一個品牌幹活，而不是套用一套預設外觀。"}]}, {"kind": "image", "src": "/agents/qwen-design/qwen-design-taste-triangle.webp", "alt": "圖示：設計系統、skill 和參考圖匯聚成優質的設計產出", "caption": "審美來自你提供的三個輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這個教訓和每個 agent 教給我們的一樣：Qwen Code 預設並不具備審美。當你給它約束時——一套設計系統、一個審美 skill 和具體的參考——它才能產出好設計。Open Design 恰恰把這些輸入打包好了，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零搭好用於設計工作的 Qwen Code", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Qwen Code 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Qwen Code（Node 22+）\nnpm install -g @qwen-code/qwen-code@latest\n# 或：brew install qwen-code\n\n# 2. 在你的專案裡啟動它，首次執行時完成認證\ncd your-project\nqwen              # 執行 /auth，或在 ~/.qwen/settings.json 裡設定一個 key\n\n# 3. 在 settings.json 裡配置一個 DashScope（OpenAI 相容）key\n#    baseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1\n#    model:   qwen3-coder-plus   （設定 DASHSCOPE_API_KEY）\n\n# 4. 新增一個 QWEN.md 並接好 Figma MCP server（可選）\n#    在 ~/.qwen/settings.json 的 \"mcpServers\" 下新增 MCP"}, {"kind": "image", "src": "/agents/qwen-design/qwen-design-setup-flow.webp", "alt": "五步搭建流程：安裝、認證、配置 QWEN.md、新增 skill、驗證", "caption": "搭建順序：安裝 → 認證 → 配置 QWEN.md → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "寫下你的設計規則", "body": "把你的 tokens、基礎原語和規範放進 QWEN.md，並讓 Qwen Code 指向它們，這樣產出會貼合一個品牌，而不是退回到一套通用外觀。"}, {"label": "加入瀏覽器驗證", "body": "接好一個 Playwright 或瀏覽器 MCP，讓 Qwen Code 在真實瀏覽器裡渲染，並跨斷點檢查產出，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "參考到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Qwen Code 收益最高的設計閉環，是把一份參考變成可用的響應式 UI，並反覆迭代直到匹配——依靠 agent 去構建、渲染，並把產出對照參考做比較。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考開始——並描述多個狀態（桌面與移動、懸停、空態、載入中），而不只是一張主視覺。", "提示詞要具體；含糊的提示詞即便用強模型也只會產出通用 UI。", "把你的設計系統和規範放在 QWEN.md 裡，並告訴 Qwen Code tokens 和標準基礎原語在哪裡。", "跑一個 dev server，讓 Qwen Code 在真實瀏覽器裡渲染，調整到各個斷點尺寸來檢查結果。", "通過讓 Qwen Code 把它的實現對照參考做比較來迭代——而不只是確認它能構建通過。"]}, {"kind": "p", "text": "用 @ 引用一個檔案把它附到提示詞裡，然後給出具體約束："}, {"kind": "code", "lang": "bash", "code": "qwen\n# 在提示詞裡：\n> @reference-desktop.png @reference-mobile.png\n  Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from QWEN.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints."}, {"kind": "p", "text": "把提示詞保持小而聚焦，提交好的迭代、回退壞的迭代（回退時告訴 Qwen Code），這樣每一輪都在一個乾淨的基礎上推進。"}]}, {"id": "extend", "heading": "QWEN.md、MCP 和擴充套件", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 Qwen Code 能勝任持續的設計工作，而這三者都能幹淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "QWEN.md 上下文", "body": "專案規則放在倉庫根目錄的 QWEN.md 裡（帶全域性層和專案層）。它是你設計規範的長久歸宿，每次執行都會被讀取。"}, {"label": "MCP server", "body": "在 ~/.qwen/settings.json 的 mcpServers 下配置 MCP server——這是引入設計上下文和外部工具的可移植方式，其中最相關的是 Figma MCP server，它們能跨 agent 通用，而不只服務於 Qwen Code。"}, {"label": "skill 與內建工具", "body": "Qwen Code 的 skill 以及它內建的檔案、shell 和 web 工具，讓它無需離開終端就能收集參考並執行驗證閉環。"}]}, {"kind": "p", "text": "這些都是可移植、跨 agent 的能力——正是 Open Design 旨在編排的那類東西，而不是在每個專案裡重新造一遍。"}]}, {"id": "vs", "heading": "做設計時 Qwen Code vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "設計工作沒有唯一贏家——每個 agent 各有所長，老練的團隊會把它們疊著用。一個公允的概括："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Qwen Code", "在開放的 Qwen3-Coder 模型上具備強大的 agent 化編碼能力，外加超大上下文；開源且 BYOK", "開源、key 靈活、且能把整套設計系統裝進上下文的構建"], ["Codex", "憑藉前端 skill 帶來出色的視覺打磨；沙箱化的非同步構建", "委託式非同步構建與可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）和理解程式碼庫的 UX", "前端推理與大上下文重構"], ["Cursor", "帶即時預覽和行內編輯的視覺化「構建即所見」閉環", "在 IDE 內緊湊的「邊改邊看」UI 工作"], ["Gemini CLI", "強大的多模態影像理解與 1M-token 上下文；Qwen Code 正是由它改造而來", "大量截圖的工作與超大上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人類——它們在沒有 skill、參考和約束時，都會預設退回一套通用審美。這才是真正要解決的問題——而它是設計工具形狀的，不是模型形狀的。"}]}, {"id": "pitfalls", "heading": "坑，以及如何避開那種「AI 味」外觀", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來很通用——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一股「Inter 字型加紫色」的味道，「一看就是 AI 做的」。其他被反映的問題還包括移動端佈局崩壞、以及指令洩漏進 UI 文案裡。這些都不是 Qwen Code 獨有的；任何 agent 在缺少精選設計上下文時執行，都會這樣。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會逼著 agent 篤定一個真實的方向，而不是套用預設外觀。"}, {"label": "在真實瀏覽器裡驗證", "body": "讓 agent 跨斷點渲染並自檢，這樣佈局就不會在移動端悄悄崩掉。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖，是對產出質量最大的單一槓杆。"}, {"label": "把規則寫進 QWEN.md", "body": "把諸如「不要 hero 卡片、最多兩種字型、品牌優先的層級」這類風格規則，放在 agent 每次執行都會讀到的地方。"}]}, {"kind": "p", "text": "注意到了嗎，每一項緩解措施都是在給 agent 一份精選的設計上下文。逐個專案手工維護這份上下文，正是 Open Design 替你免去的苦活。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Qwen Code 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一再呼喚的那個開源設計層。它把 Qwen Code 當作一等公民介面卡，並用一套精選的 skill 與設計系統庫、一條結構化的渲染管線，以及一個本地桌面 UI 把它包起來——於是讓 Qwen Code 好用的那份設計上下文，從第一次執行就在那裡，而不必每次手工拼湊。兩者都開源、都本地優先，這讓這對組合天然契合。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 Qwen Code 作為你的 agent。", "用你的 DashScope 或 Qwen API key 認證（BYOK）——憑證留在你自己的機器上，絕不經我們中轉。", "選一套設計系統和一個 skill，然後以一致的審美生成演示稿、原型和落地頁。", "每一份產物和 DESIGN.md 檔案都留在你自己的倉庫裡，而非託管雲端。"]}, {"kind": "p", "text": "同一個 Qwen Code agent、同一個 key——外加圍繞它的一套真實、可移植、開源的設計工作流。它本地優先、Apache-2.0，所以你的工作和憑證都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Qwen Code 真能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一套設計系統和真實的參考圖，Qwen Code 就能產出生產級的響應式 UI，並且它的 agent 化閉環會構建、渲染，並對照參考驗證產出。缺了這份上下文，它往往會退回一套通用外觀，而這正是 Open Design 填補的缺口。"}, {"name": "用 Qwen Code 做設計需要付費嗎？", "text": "Qwen Code 免費且開源，但它是 BYOK——你自帶一個 DashScope（阿里雲百鍊）API key、一個 OpenAI 相容端點，或 ModelScope。阿里巴巴也提供一個固定費用的編碼套餐。無論哪種方式，Open Design 都絕不中轉你的憑證。"}, {"name": "Qwen Code 具體好在哪裡適合做設計？", "text": "兩點：Qwen3-Coder 模型針對 agent 化編碼做了調優，於是 agent 會構建並自我糾正出響應式 UI；它們的超大上下文能一次性裝下整套設計系統和參考集。兩者都有幫助——但審美仍然來自你提供的設計系統、skill 和參考。"}, {"name": "Qwen Code 和 Gemini CLI 是一回事嗎？", "text": "不是。Qwen Code 由 Google 的 Gemini CLI 改造而來——同源的開源血統——在解析器層面和提示詞上做了適配，以針對 Qwen3-Coder 模型調優。Open Design 兩者都支援，所以你能在不改設計工作流的前提下切換 agent。"}, {"name": "我怎麼把 Qwen Code 連到 Figma？", "text": "在 ~/.qwen/settings.json 的 mcpServers 下新增 Figma MCP server。然後 Qwen Code 就能拉取真實的設計上下文——元件、變數、佈局資料——讓生成的程式碼貼合原始檔，而不是近似猜測。"}, {"name": "Open Design 和 Alibaba 或 Qwen 有關聯嗎？", "text": "沒有。Qwen Code 是 Alibaba 的產品；Open Design 是一個獨立的開源專案，把它作為一等公民介面卡來支援。Qwen 是 Alibaba 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先、Apache-2.0。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的 DashScope 或 Qwen 憑證由你的 agent 直接使用，絕不經 Open Design 的伺服器路由。"}], "ctaTitle": "用開放的方式，跟 Qwen Code 一起做設計。", "ctaBody": "自帶你的 DashScope 或 Qwen API key，把每個檔案都留在本地，並圍繞你已經在用的 agent 獲得一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Qwen Code", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'grok': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['grok']!,
      title: "用於設計的 Grok CLI — Open Design",
      description: "人們如何使用 xAI 的 Grok CLI（Grok Build）做 UI 與網頁設計——它的計劃模式、AGENTS.md 和 MCP、能識別影像的 Grok 模型以及超大上下文——以及 Open Design 如何把 Grok CLI 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "Grok CLI",
      label: "Agent · Grok CLI",
      heading: "用於設計的 Grok CLI。",
      lead: "Grok CLI 是 xAI 的終端編碼 agent。它在動你的檔案之前先規劃好多步工作，把影像和程式碼一起讀取，並在你的倉庫裡跑構建並驗證的迴圈——只要你給它參考、規範和一個驗證環節，它就能成為一個真正的設計工具。Open Design 把它接入開源設計工作流：用你的 SuperGrok 登入或 xAI API key，操作你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Grok CLI 變成一個本地優先、開源的設計 agent——用你的 SuperGrok 登入或 xAI API key，操作你自己的檔案，並在外圍配上一套精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Grok CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Grok CLI——xAI 的終端編碼 agent，以 Grok Build 之名釋出——是一個駐留在你終端裡的 agentic 工具。有兩點讓它對設計尤其有意思：它在動手之前會先規劃有風險的工作，所以你可以在任何檔案改動之前審查它提出的方案；而且它的 Grok 模型支援影像輸入，因此它能在編寫程式碼的同時對一張參考截圖進行推理。配上恰當的參考、規範和一個驗證迴圈，它能構建出真實、響應式的 UI——直接通過你的 SuperGrok 或 X Premium+ 賬戶進行身份驗證，無需折騰 API key。這是一份實用的端到端指南，教你如何用 Grok CLI 做 UI、前端和設計系統工作，並把它接入 Open Design 提供的結構化設計工作流。", "本文涵蓋：Grok CLI 究竟是什麼，為什麼計劃模式和能識別影像的模型契合設計，如何從零開始搭建它，截圖到 UI 的迴圈，AGENTS.md 和 MCP 如何擴充套件它，它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比，讓 AI 產出顯得千篇一律的那些陷阱，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合差距——你的憑證和產物從不離開你的機器。"], "heroImage": {"src": "/agents/grok-design/grok-design-hero.webp", "alt": "Grok CLI 設計反饋迴圈：一個終端 agent 依據參考圖進行規劃，一個瀏覽器渲染 UI，以及一個工作區，反饋箭頭回流形成閉環", "caption": "核心迴圈：Grok CLI 在終端裡依據你的參考進行規劃，在真實瀏覽器中構建並驗證 UI，並對照參考反覆迭代——你的規範則寫在 AGENTS.md 裡。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-grok", "label": "Grok CLI 究竟是什麼"}, {"id": "why-design", "label": "為什麼計劃模式 + 影像輸入契合設計"}, {"id": "setup", "label": "從零搭建用於設計的 Grok CLI"}, {"id": "screenshot-workflow", "label": "截圖到 UI 的工作流"}, {"id": "extend", "label": "AGENTS.md、MCP 與子 agent"}, {"id": "vs", "label": "Grok CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與“AI 味”觀感"}, {"id": "open-design", "label": "在 Open Design 中用 Grok CLI 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-grok", "heading": "Grok CLI 究竟是什麼", "blocks": [{"kind": "p", "text": "Grok CLI 是 xAI 的終端編碼 agent，以 Grok Build 之名釋出。它讀取你的倉庫、編輯檔案、執行 shell 命令，並依據自然語言任務規劃多步工程工作，而不只是補全程式碼行。它圍繞 xAI 的 Grok 模型構建——在 xAI API 上以 grok-build 模型家族的形式暴露——並通過你的 xAI 賬戶進行身份驗證，因此 agent 和模型都出自同一家廠商。"}, {"kind": "p", "text": "對設計工作來說，有兩個特性尤為突出。它有一個計劃模式，會先草擬一份結構化方案，供你在任何改動落地之前批准、評論或重寫——當你在迭代 UI 時，這是個很有用的關卡。而它的 Grok 模型支援影像輸入，所以你可以把一張參考截圖交給它，它會對實際佈局進行推理，而不是從一段文字描述裡瞎猜。"}, {"kind": "steps", "items": [{"label": "上下文檔案", "body": "Grok CLI 會讀取 AGENTS.md 檔案來獲取持久的專案上下文——這正是用來編碼你的設計規範、tokens 和審查清單的自然位置。它遵循 Codex 和其他 agent 同樣使用的開放 AGENTS.md 約定。"}, {"label": "工具、MCP + 子 agent", "body": "它能編輯檔案、執行 shell 命令，並支援 MCP 伺服器來引入外部上下文，比如一個即時的 Figma 檔案；對於較大的任務，它可以委派給並行的子 agent，讓它們同時進行調研、構建和審查。"}, {"label": "用你的賬戶登入", "body": "你通過瀏覽器以 SuperGrok 或 X Premium+ 訂閱登入來完成身份驗證；你也可以帶上自己的 xAI API key 用於無頭執行和 CI 場景。"}]}, {"kind": "ul", "items": ["廠商：xAI", "憑證：xAI SuperGrok OAuth（`grok login`），或用於無頭場景的 xAI API key（BYOK）", "模型：xAI Grok 模型（xAI API 上的 grok-build 家族），支援影像輸入"]}]}, {"id": "why-design", "heading": "為什麼計劃模式和能識別影像的模型契合設計", "blocks": [{"kind": "p", "text": "Grok CLI 的設計優勢來自兩個特性——但和所有 agent 一樣，品味仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "能識別影像的推理", "body": "因為 Grok 模型支援影像輸入，agent 能讀取參考截圖——把自己渲染出的產出與影像對照，而不是從一段文字描述裡瞎猜。"}, {"label": "改動落地前的計劃模式", "body": "計劃模式會草擬一份結構化方案，供你在檔案改動前批准，於是設計意圖在一開始就被審查，而不是等差異出來之後才發現。"}, {"label": "寫在 AGENTS.md 裡的規範", "body": "一份 AGENTS.md（再加上 Figma MCP 伺服器）會把 agent 指向你的 tokens、元件和真實規格，讓它針對一個品牌來工作，而不是套用預設觀感。"}]}, {"kind": "image", "src": "/agents/grok-design/grok-design-taste-triangle.webp", "alt": "示意圖展示設計系統、skill 和參考圖匯聚成優秀的設計產出", "caption": "品味來自你提供的三項輸入：一個設計系統、一個 skill 和真實的參考圖。"}, {"kind": "p", "text": "這條教訓和每個 agent 教給我們的一樣：Grok CLI 預設並不具備品味。當你給它約束時——一個設計系統、一個審美 skill 和具體的參考——它才會產出好的設計。Open Design 恰恰把這些輸入打包好了，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始搭建用於設計工作的 Grok CLI", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Grok CLI 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 在 macOS/Linux 上安裝 Grok CLI（Grok Build）\ncurl -fsSL https://x.ai/cli/install.sh | bash\n\n# 2. 在你的專案裡啟動它，並在首次執行時進行身份驗證\ncd your-project\ngrok login   # 開啟瀏覽器；用 SuperGrok / X Premium+ 登入\n#   或者，對於無頭 / CI 場景，設定 xAI API key：\n#   export XAI_API_KEY=xai-...\n\n# 3. 新增專案上下文\n#    在倉庫根目錄建立一個 AGENTS.md，寫入你的設計規範\n\n# 4. 接入 Figma MCP 伺服器（可選，用於設計交付）\n#    把它加到你的 MCP 伺服器配置裡"}, {"kind": "image", "src": "/agents/grok-design/grok-design-setup-flow.webp", "alt": "五步搭建流程：安裝、身份驗證、配置 AGENTS.md、新增 skill、驗證", "caption": "搭建順序：安裝 → 身份驗證 → 配置 AGENTS.md → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "編碼你的設計規則", "body": "把你的 tokens、基礎元素和規範寫進 AGENTS.md 並讓 Grok 指向它們，這樣產出就會貼合一個品牌，而不是退回到千篇一律的預設觀感。"}, {"label": "加入瀏覽器驗證", "body": "接入 Playwright 或瀏覽器 MCP，讓 Grok 在真實瀏覽器中渲染，並跨斷點檢查它的產出，而不僅僅是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Grok CLI 時槓桿最高的設計迴圈，就是把一張參考圖變成可用的響應式 UI 並不斷迭代直到吻合——靠計劃模式就方案達成一致，靠能識別影像的模型把產出與參考對照。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發——幷包含多種狀態（桌面端和移動端、hover、空態、載入態），而不只是一張主視覺。", "在提示裡寫具體；含糊的提示即使配上強模型也只會產出千篇一律的 UI。", "把你的設計系統和規範放進 AGENTS.md，並告訴 Grok tokens 和規範基礎元素在哪裡。", "用計劃模式審查方案，然後啟動一個 dev server，讓 Grok 在真實瀏覽器中渲染，調整到各個斷點來檢查結果。", "通過讓 Grok 把自己的實現與截圖對照來迭代——而不僅僅是確認它能構建。"]}, {"kind": "p", "text": "附上你的參考圖，並給出具體約束："}, {"kind": "code", "lang": "bash", "code": "grok\n# 在提示裡（附上 reference-desktop.png 和 reference-mobile.png）：\n> 用 React + Vite + Tailwind + TypeScript 實現這個設計。\n  複用我已有的設計系統元件和 AGENTS.md 裡的 tokens。\n  匹配間距、佈局和層級；做成響應式。\n  先把方案給我看，然後在瀏覽器裡渲染並迭代，\n  直到它在各個斷點上都與參考吻合。"}, {"kind": "p", "text": "讓提示保持小而聚焦，提交好的迭代、回退差的迭代（回退時告訴 Grok），這樣每一輪都能在一個乾淨的基礎上推進。"}]}, {"id": "extend", "heading": "AGENTS.md、MCP 與子 agent", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 Grok CLI 適合持續的設計工作，而這三者都能幹淨地對映到一個開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "AGENTS.md 上下文", "body": "專案規則寫在倉庫根目錄的 AGENTS.md 裡。它是你設計規範的持久歸宿，每次執行都會被讀取——而且它是其他 agent 也能理解的同一種開放格式，所以這些規則會隨你一起遷移。"}, {"label": "MCP 伺服器", "body": "配置 MCP 伺服器來引入設計上下文和外部工具，其中最相關的是 Figma MCP 伺服器——它是把真實規格喂進程式碼的可移植方式，跨 agent 通用，不只限於 Grok。"}, {"label": "子 agent 與內建工具", "body": "Grok CLI 能派生出並行的子 agent 來同時進行調研、構建和審查，而它的檔案、shell 和搜尋工具讓它無需離開終端就能收集參考並跑完驗證迴圈。"}]}, {"kind": "p", "text": "這些都是可移植的多 agent 能力——正是 Open Design 旨在編排、而非在每個專案裡重造的那類東西。"}]}, {"id": "vs", "heading": "做設計時 Grok CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "設計工作沒有唯一贏家——每個 agent 各有所長，經驗豐富的團隊會把它們疊著用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Grok CLI", "改動落地前的計劃模式審查、能識別影像的 Grok 模型，以及並行子 agent；用你的 SuperGrok 賬戶登入", "在迴圈中帶著 xAI 模型、經過審查、計劃優先的 UI 構建"], ["Codex", "憑藉前端 skill 帶來出色的視覺打磨；沙箱化的非同步構建", "委派式非同步構建與可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）以及理解程式碼庫的 UX", "前端推理與大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的視覺化構建即所見迴圈", "在 IDE 內進行緊湊的迭代即觀察 UI 工作"], ["Gemini CLI", "強大的多模態影像理解和超大上下文；開源且帶免費額度", "截圖密集的工作，以及把整個設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人類——沒有 skill、參考和約束，它們全都會退回到千篇一律的審美。這才是真正要解決的問題——而它是設計工具形態的，不是模型形態的。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避開“AI 味”觀感", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來千篇一律——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一股 Inter 字型加紫色的味道，“一看就是 AI 做的”。其他被反映的問題還包括移動端佈局崩壞，以及指令文字洩漏進 UI 文案。這些都不是 Grok CLI 獨有的；任何 agent 在沒有精選設計上下文的情況下執行都會這樣。"}, {"kind": "steps", "items": [{"label": "加入一個審美 skill", "body": "一個精選的設計 skill 會迫使 agent 承諾一個真實的方向，而不是套用預設觀感。"}, {"label": "在真實瀏覽器中驗證", "body": "跨斷點渲染並自檢，讓佈局不會在移動端悄無聲息地崩壞。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖是對產出質量影響最大的那個槓桿。"}, {"label": "把規則編碼進 AGENTS.md", "body": "把“不要主視覺卡片、最多兩種字型、品牌優先的層級”這類規則放到 agent 每次執行都會讀取的地方。"}]}, {"kind": "p", "text": "注意，每一種緩解辦法都是在給 agent 一份精選的設計上下文。手工地、按專案維護這份上下文，正是 Open Design 替你免去的苦差事。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Grok CLI 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一直在呼喚的開源設計層。它把 Grok CLI 當作一等介面卡，並在外圍包上一套精選的 skill 與設計系統庫、一條結構化的渲染管線，以及一個本地桌面 UI——於是讓 Grok 表現出色的那份設計上下文從第一次執行起就已就位，而不必每次都手工拼湊。Open Design 是獨立的、採用 Apache-2.0 協議，並執行在你自己的機器上，這讓二者天然契合。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Grok CLI 作為你的 agent。", "用你的 SuperGrok 賬戶或 xAI API key（BYOK）進行身份驗證——憑證留在你的機器上，從不經我們中轉。", "挑一個設計系統和一個 skill，然後以一致的品味生成演示稿、原型和落地頁。", "每一份產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是託管雲端。"]}, {"kind": "p", "text": "同一個 Grok CLI agent、同一套憑證——外加在外圍包裹的一套真實、可移植、開源的設計工作流。它本地優先、採用 Apache-2.0，所以你的工作和憑證全都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Grok CLI 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一個設計系統和真實的參考圖，Grok CLI 就能產出生產級、響應式的 UI，而它能識別影像的 Grok 模型還能幫你把產出與參考對照驗證。沒有這份上下文，它往往會退回到千篇一律的觀感，而這正是 Open Design 要填補的缺口。"}, {"name": "我該如何對 Grok CLI 進行身份驗證？", "text": "你通過瀏覽器以 SuperGrok 或 X Premium+ 訂閱登入（`grok login`），所以無需管理 API key。對於無頭或 CI 場景，你可以改用 xAI API key。無論哪種方式，Open Design 都不會中轉你的憑證。"}, {"name": "Grok CLI 具體好在哪裡、適合設計？", "text": "兩點：它的計劃模式讓你在任何改動落地前審查方案，而它的 Grok 模型支援影像輸入，所以它能很好地讀取參考截圖。兩者都有幫助——但品味仍然來自你提供的設計系統、skill 和參考。"}, {"name": "前端設計該選 Grok CLI 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體的、理解程式碼庫的設計決策著稱；Grok CLI 的優勢在於計劃模式審查和能識別影像的 xAI 模型。很多團隊兩者都用——Open Design 讓你在不改變設計工作流的前提下切換 agent。"}, {"name": "我該如何把 Grok CLI 連線到 Figma？", "text": "把 Figma MCP 伺服器加到你的 MCP 配置裡。這樣 Grok 就能拉取真實的設計上下文——元件、變數、佈局資料——於是生成的程式碼會匹配原始檔，而不是近似模仿。"}, {"name": "Open Design 隸屬於 xAI 嗎？", "text": "不是。Grok CLI 是 xAI 的產品；Open Design 是一個獨立的開源專案，以一等介面卡的方式支援它。Grok 是 xAI 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，而你的 xAI 憑證由你的 agent 直接使用，絕不會經過 Open Design 的伺服器路由。"}], "ctaTitle": "用 Grok CLI 做設計，以開放的方式。", "ctaBody": "帶上你自己的 SuperGrok 賬戶或 xAI API key，讓每一個檔案都留在本地，並在你已經在用的 agent 外圍獲得一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Grok CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'kimi': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['kimi']!,
      title: "用於設計的 Kimi CLI — Open Design",
      description: "人們如何使用 Moonshot AI 的 Kimi CLI 進行 UI 和網頁設計——藉助其 Kimi K2 智慧體模型、超大上下文、AGENTS.md 與 MCP——以及 Open Design 如何把 Kimi CLI 變成一個本地優先、開源的設計智慧體。",
      breadcrumb: "Kimi CLI",
      label: "智慧體 · Kimi CLI",
      heading: "用於設計的 Kimi CLI。",
      lead: "Kimi CLI 是 Moonshot AI 推出的開源終端智慧體，由 Kimi K2 系列模型驅動。它強大的智慧體式編碼能力和超大上下文視窗，讓它能夠裝下整套設計系統並對照參考稿反覆迭代——只要你給它約定和一套驗證閉環，它就會成為真正的設計工具。Open Design 把它接入了一套開源的設計工作流：用你自己的 Moonshot API 金鑰、你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Kimi CLI 變成一個本地優先、開源的設計智慧體——用你自己的 Moonshot API 金鑰、你自己的檔案，外加一套環繞它的精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Kimi CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Kimi CLI 是 Moonshot AI 面向終端推出的開源 AI 智慧體。有兩點讓它在設計場景中格外值得關注：它由 Kimi K2 系列驅動——這是一個萬億引數的混合專家模型，專為智慧體式編碼與工具呼叫精心最佳化；而這個模型還帶有超大上下文視窗（近期 K2 版本可達 256k tokens），足以一次性裝下整套設計系統和程式碼庫。配合恰當的參考稿、約定和一套驗證閉環，它能構建出真正可用的響應式 UI——你可以從 OAuth 登入起步，也可以用自己的 Moonshot API 金鑰。本文是一份實用的端到端指南，講述如何用 Kimi CLI 做 UI、前端和設計系統方面的工作，並把它接入由 Open Design 支撐的結構化設計工作流。", "內容涵蓋：Kimi CLI 究竟是什麼，為什麼它智慧體式的 Kimi K2 模型和超大上下文適合做設計，如何從零開始把它配置起來，從參考稿到 UI 的閉環，AGENTS.md、MCP 與子智慧體如何擴充套件它，它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比，哪些坑會讓 AI 產物看起來千篇一律，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合落差——這是一對天然的搭配，因為兩者都是開源的、都執行在你自己的機器上。"], "heroImage": {"src": "/agents/kimi-design/kimi-design-hero.webp", "alt": "Kimi CLI 設計反饋閉環：一個終端智慧體讀取參考圖、一個瀏覽器渲染 UI、一個工作區，外加一條迴流的反饋箭頭", "caption": "核心閉環：Kimi CLI 在終端裡讀取你的參考稿，在真實瀏覽器中構建並驗證 UI，對照參考不斷迭代——而整套設計系統都在上下文之中。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-kimi", "label": "Kimi CLI 究竟是什麼"}, {"id": "why-design", "label": "為什麼智慧體式 K2 + 超大上下文適合做設計"}, {"id": "setup", "label": "為設計配置 Kimi CLI（從零開始）"}, {"id": "screenshot-workflow", "label": "從參考稿到 UI 的工作流"}, {"id": "extend", "label": "AGENTS.md、MCP 與子智慧體"}, {"id": "vs", "label": "Kimi CLI 對比 Codex、Claude Code、Cursor 與 Gemini CLI"}, {"id": "pitfalls", "label": "常見坑與“AI 味”外觀"}, {"id": "open-design", "label": "在 Open Design 中用 Kimi CLI 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-kimi", "heading": "Kimi CLI 究竟是什麼", "blocks": [{"kind": "p", "text": "Kimi CLI 是 Moonshot AI 面向終端釋出的一款開源（Apache-2.0）AI 智慧體。它會讀取你的倉庫、編輯檔案、執行 shell 命令、搜尋檔案、抓取網頁，並根據得到的反饋決定下一步——它從自然語言任務出發去規劃和驗證工作，而不僅僅是補全程式碼行。它是一個 Python 工具，用 uv 安裝，背後驅動著 Kimi K2 模型家族。"}, {"kind": "p", "text": "在設計工作中，有兩個特性尤為突出。Kimi K2 模型明確針對智慧體式、長鏈路的編碼與工具呼叫做了調優，因此智慧體能把一項多步驟的構建任務一直推進到可用的結果。而上下文視窗在近期 K2 版本中可達 256k tokens，足以一次性裝下你的整套設計系統、元件庫和參考集，而不必把它們壓縮概括掉。"}, {"kind": "steps", "items": [{"label": "上下文檔案", "body": "Kimi CLI 會讀取一個 AGENTS.md 檔案作為持久的專案上下文——這正是編寫你的設計約定、tokens 和評審清單的天然之處。對於尚未配置的專案，執行 /init 即可為其生成一個。"}, {"label": "MCP、ACP + 子智慧體", "body": "它通過 /mcp-config 以對話方式管理 MCP 伺服器，通過 Agent Client Protocol（kimi acp）把會話暴露給 Zed 和 JetBrains，並能在隔離的上下文中排程內建的 coder、explore 和 plan 子智慧體。"}, {"label": "登入或 BYOK", "body": "首次啟動時，/login 讓你通過 OAuth（Kimi Code）授權，或輸入你自己的 Moonshot API 金鑰；Kimi 的平臺還提供 OpenAI 相容和 Anthropic 相容的端點。"}]}, {"kind": "ul", "items": ["廠商：Moonshot AI", "憑證：Moonshot API 金鑰（BYOK），或通過 Kimi Code 進行 OAuth 登入", "許可證：Apache-2.0，開源"]}]}, {"id": "why-design", "heading": "為什麼智慧體式 K2 模型和超大上下文適合做設計", "blocks": [{"kind": "p", "text": "Kimi CLI 的設計優勢來自兩項模型特性——但和所有智慧體一樣，審美品味仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "智慧體式、長鏈路編碼", "body": "Kimi K2 模型針對工具呼叫和多步驟工作做了最佳化，因此智慧體能拿著參考稿和需求說明，真正去構建、執行並打磨 UI，而不是止步於初稿。"}, {"label": "超大上下文視窗", "body": "近期 K2 版本可達 256k tokens，意味著整套設計系統、tokens 和大量參考狀態能一次性裝下，於是智慧體會複用你真實的基礎元素，而不是憑空造出一次性的樣式。"}, {"label": "把約定寫進 AGENTS.md", "body": "一份 AGENTS.md（外加一個像 Figma 這樣的 MCP 伺服器）把智慧體指向你的 tokens、元件和真實規範，於是它是在對照某個品牌工作，而不是套用預設外觀。"}]}, {"kind": "image", "src": "/agents/kimi-design/kimi-design-taste-triangle.webp", "alt": "示意圖，展示設計系統、skill 和參考圖匯聚成優秀的設計產出", "caption": "品味來自你提供的三項輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這條教訓和每個智慧體教會我們的都一樣：Kimi CLI 預設並不具備品味。當你給它約束——一套設計系統、一個審美 skill 和具體的參考稿——它就能產出優秀的設計。Open Design 恰恰把這些輸入打包好了，這也是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始為設計工作配置 Kimi CLI", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Kimi CLI 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Kimi CLI（使用 uv；Python 3.12–3.14，推薦 3.13）\ncurl -LsSf https://code.kimi.com/install.sh | bash\n# 或者，如果你已經裝了 uv：\nuv tool install --python 3.13 kimi-cli\n\n# 2. 在你的專案中啟動它，並在首次執行時完成認證\ncd your-project\nkimi              # 然後執行 /login：通過 Kimi Code 進行 OAuth，或貼上一個 Moonshot API 金鑰\n\n# 3. 生成專案上下文\n/init             # 為該專案生成一個 AGENTS.md\n\n# 4. 接入一個 MCP 伺服器（可選，例如用 Figma 做設計交付）\n/mcp-config       # 以對話方式新增、編輯和認證 MCP 伺服器"}, {"kind": "image", "src": "/agents/kimi-design/kimi-design-setup-flow.webp", "alt": "五步配置流程：安裝、認證、配置 AGENTS.md、新增 skill、驗證", "caption": "配置順序：安裝 → 認證 → 配置 AGENTS.md → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把你的設計規則寫下來", "body": "把你的 tokens、基礎元素和約定寫進 AGENTS.md 並讓 Kimi 指向它們，這樣產出就會貼合某個品牌，而不是退回到千篇一律的外觀。"}, {"label": "加上瀏覽器驗證", "body": "接入一個 Playwright 或瀏覽器 MCP，讓 Kimi 在真實瀏覽器中渲染，並在各個斷點上檢查產出，而不只是確認構建能通過。"}]}]}, {"id": "screenshot-workflow", "heading": "從參考稿到 UI 的工作流", "blocks": [{"kind": "p", "text": "在 Kimi CLI 上收益最高的設計閉環，就是把參考素材轉化為可用的響應式 UI，並不斷迭代直到匹配——把參考稿餵給智慧體，讓它在真實瀏覽器中把渲染產出與參考稿對照回看。"}, {"kind": "ol", "items": ["從你手頭最清晰的參考稿出發——並且包含多種狀態（桌面端和移動端、懸停態、空狀態、載入態），而不只是一張主視覺圖。", "在提示詞裡說清楚；含糊的提示詞即便配上強大的智慧體，也會產出千篇一律的 UI。", "把你的設計系統和約定放進 AGENTS.md，並告訴 Kimi tokens 和規範性基礎元素位於何處。", "執行一個開發伺服器，讓 Kimi 在真實瀏覽器中渲染，並調整到各個斷點來檢查結果。", "讓 Kimi 把自己的實現與參考稿對照回看來迭代——而不只是確認它能構建通過。"]}, {"kind": "p", "text": "把 Kimi 指向你的參考稿和開發伺服器，然後給出具體的約束："}, {"kind": "code", "lang": "bash", "code": "kimi\n# 在提示詞中：\n> 使用 React + Vite + Tailwind + TypeScript 實現 ./references 中的設計\n  （reference-desktop.png、reference-mobile.png）。\n  複用我已有的設計系統元件，以及 AGENTS.md 中的 tokens。\n  匹配間距、佈局和層級；做成響應式。\n  執行開發伺服器，在瀏覽器中渲染，並不斷迭代，\n  直到它在各個斷點上都與參考稿匹配。"}, {"kind": "p", "text": "讓提示詞保持小而聚焦，提交好的迭代、回退差的迭代（回退時告訴 Kimi），這樣每一輪都建立在一個乾淨的基礎之上。當某個流程難以用文字描述時，Kimi CLI 也可以接收一段簡短的螢幕錄製或演示片段。"}]}, {"id": "extend", "heading": "AGENTS.md、MCP 與子智慧體", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 Kimi CLI 能夠勝任持續的設計工作，而且這三者都能幹淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "AGENTS.md 上下文", "body": "專案規則存放在倉庫根目錄的 AGENTS.md 中。它是你設計約定的持久歸宿，每次執行都會被讀取——而且它是其他智慧體也在用的同一種可移植格式。"}, {"label": "MCP 伺服器", "body": "用 /mcp-config 以對話方式新增 MCP 伺服器——這是引入設計上下文和外部工具的可移植方式，其中最相關的是 Figma MCP 伺服器，它們能跨智慧體通用，而不只對 Kimi 有效。"}, {"label": "子智慧體與外掛市場", "body": "在隔離的上下文中排程內建的 coder、explore 和 plan 子智慧體，並從市場或任意 GitHub 倉庫安裝 skill、MCP 伺服器和資料來源，用來收集參考稿並跑通驗證閉環。"}]}, {"kind": "p", "text": "這些都是可移植的、跨智慧體的能力——而這恰恰是 Open Design 生來要去編排的東西，而不是每個專案都重造一遍。"}]}, {"id": "vs", "heading": "做設計時 Kimi CLI 對比 Codex、Claude Code、Cursor 與 Gemini CLI", "blocks": [{"kind": "p", "text": "在設計工作上沒有唯一的贏家——每個智慧體各有所長，有經驗的團隊會把它們疊在一起用。一箇中肯的總結："}, {"kind": "table", "columns": ["智慧體", "設計優勢", "最適合"], "rows": [["Kimi CLI", "針對長鏈路編碼和工具呼叫調優的智慧體式 Kimi K2 模型，搭配超大上下文；開源且 BYOK", "多步驟構建，以及以低成本把整套設計系統裝進上下文"], ["Codex", "憑藉前端 skill 實現出色的視覺打磨；沙箱化的非同步構建", "委派式非同步構建，以及可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（色值、間距、字型）以及理解程式碼庫的 UX", "前端推理與大上下文重構"], ["Cursor", "帶即時預覽和行內編輯的“邊構建邊看”視覺閉環", "在 IDE 內緊密的“迭代即看”UI 工作"], ["Gemini CLI", "強大的多模態影像理解能力和 1M-token 上下文；免費檔", "大量依賴截圖的工作以及超大上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人類——它們在沒有 skill、參考稿和約束的情況下，都會退回到一種千篇一律的審美。這才是真正要解決的問題——而它是設計工具形態的問題，不是模型形態的問題。"}]}, {"id": "pitfalls", "heading": "常見坑，以及如何避免“AI 味”外觀", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨就是它看起來千篇一律——柔和漸變、漂浮面板、超大圓角、誇張陰影，一股“一眼就是 AI 做的”的 Inter 加紫色的氣味。其他被反映的問題還包括移動端佈局崩壞，以及指令文字洩漏進 UI 文案。這些都不是 Kimi CLI 獨有的；只要任何智慧體在缺乏精選設計上下文的情況下執行，就會出現這些情況。"}, {"kind": "steps", "items": [{"label": "加上一個審美 skill", "body": "一個精選的設計 skill 會逼著智慧體確立一個真實的方向，而不是套用預設外觀。"}, {"label": "在真實瀏覽器中驗證", "body": "讓 Kimi 渲染並在各個斷點上自檢，這樣佈局就不會在移動端悄無聲息地崩壞。"}, {"label": "提供 tokens 和參考稿", "body": "真實的設計 tokens 和參考截圖是對產出質量影響最大的那個槓桿。"}, {"label": "把規則寫進 AGENTS.md", "body": "把“不要主視覺卡片、最多兩種字型、品牌優先的層級”這類風格規則，放在智慧體每次執行都會讀到的地方。"}]}, {"kind": "p", "text": "注意，每一項緩解措施都是關於給智慧體一份精選的設計上下文。逐個專案地用手維護這份上下文，正是 Open Design 幫你免去的苦差事。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Kimi CLI 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面這套工作流一直在呼喚的那個開源設計層。它把 Kimi CLI 當作一等介面卡，並用精選的 skill 與設計系統庫、一條結構化的渲染流水線，以及一個本地桌面 UI 把它包裹起來——於是讓 Kimi 表現出色的那份設計上下文從第一次執行就已就位，無需每次手動拼湊。兩者都是開源、本地優先的，這讓這對組合成為天然的契合。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 Kimi CLI 作為你的智慧體。", "用你的 Moonshot API 金鑰認證（BYOK）——憑證留在你的機器上，絕不經我們代理。", "選定一套設計系統和一個 skill，然後以一致的品味生成演示稿、原型和落地頁。", "每一份產物和 DESIGN.md 檔案都存放在你自己的倉庫裡，而不是託管的雲端。"]}, {"kind": "p", "text": "同一個 Kimi CLI 智慧體、同一把金鑰——外加一套環繞它的、真實可移植的開源設計工作流。它本地優先、採用 Apache-2.0，所以你的工作內容和憑證都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Kimi CLI 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一套設計系統和真實的參考圖，Kimi CLI 就能產出生產級、響應式的 UI，而它智慧體式的 Kimi K2 模型還能渲染產出並對照參考稿做驗證。缺了這份上下文，它往往會退回到千篇一律的外觀，而這正是 Open Design 要填補的落差。"}, {"name": "用 Kimi CLI 做設計需要付費嗎？", "text": "你自帶憑證：通過 Kimi Code 的 OAuth 登入授權，或貼上一個 Moonshot API 金鑰（BYOK），由 Moonshot 平臺計費。無論哪種方式，Open Design 都絕不代理你的憑證。"}, {"name": "Kimi CLI 具體好在哪、為什麼適合設計？", "text": "兩點：Kimi K2 模型針對智慧體式、長鏈路的編碼與工具呼叫做了調優，因此智慧體能一路構建和打磨直到拿出可用的結果；而上下文視窗可達 256k tokens，足以一次性裝下整套設計系統和參考集。兩者都有幫助——但品味仍來自你提供的設計系統、skill 和參考稿。"}, {"name": "前端設計該用 Kimi CLI 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體的、理解程式碼庫的設計決策著稱；Kimi CLI 的優勢在於它智慧體式的 Kimi K2 模型，以及帶 BYOK 經濟性的超大上下文。許多團隊兩者都用——Open Design 讓你在不改變設計工作流的前提下切換智慧體。"}, {"name": "我該如何把 Kimi CLI 連線到 Figma？", "text": "在 Kimi CLI 內執行 /mcp-config，來新增並認證 Figma MCP 伺服器。隨後 Kimi 就能拉取真實的設計上下文——元件、變數、佈局資料——讓生成的程式碼貼合源頭，而不是近似還原。"}, {"name": "Open Design 隸屬於 Moonshot AI 嗎？", "text": "不。Kimi CLI 是 Moonshot AI 的產品；Open Design 是一個獨立的開源專案，把它作為一等介面卡來支援。Kimi 是 Moonshot AI 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先、採用 Apache-2.0。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，而你的 Moonshot 憑證由你的智慧體直接使用，絕不經 Open Design 伺服器中轉。"}], "ctaTitle": "用開放的方式，與 Kimi CLI 一起做設計。", "ctaBody": "自帶你的 Moonshot API 金鑰，讓每個檔案都留在本地，併為你已經在用的智慧體配上一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Kimi CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的智慧體"},
    },
    'deepseek': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['deepseek']!,
      title: "用於設計的 DeepSeek TUI —— Open Design",
      description: "人們如何用一個由 DeepSeek 驅動的終端編碼 agent 進行 UI 與網頁設計——它強大的編碼模型、100 萬 token 上下文、成本效率、上下文檔案與 MCP——以及 Open Design 如何把 DeepSeek TUI 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "DeepSeek TUI",
      label: "Agent · DeepSeek TUI",
      heading: "用於設計的 DeepSeek TUI。",
      lead: "DeepSeek TUI 是一個由 DeepSeek 模型驅動的終端編碼 agent。它強大且具成本效率的編碼模型，加上 100 萬 token 的上下文，可以一次性容納整套設計系統和程式碼庫，這讓它成為一款真正的設計工具——前提是你給它參考、規範以及一套驗證迴圈。Open Design 把它接入開源設計工作流：用你自己的 DeepSeek API 金鑰、你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 DeepSeek TUI 變成一個本地優先、開源的設計 agent——用你自己的 DeepSeek API 金鑰、你自己的檔案，並在它周圍配上一套精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 內使用 DeepSeek TUI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["DeepSeek TUI 是一個由 DeepSeek 模型驅動、基於終端的 AI 編碼 agent。它在設計上之所以值得關注，有兩點：它的編碼模型既強大又異常具成本效率，因此你可以放開手腳地反覆迭代而無需盯著計費表；它的上下文視窗最高可達 100 萬 token，大到足以一次性容納整套設計系統和程式碼庫，而不必把它們壓縮省略掉。配上恰當的參考、規範以及一套驗證迴圈，它就能構建出真正的、響應式的 UI。這是一份實用的端到端指南，講解如何用一個由 DeepSeek 驅動的終端 agent 來做 UI、前端與設計系統相關的工作，並把它接入 Open Design 的結構化設計工作流。", "本文涵蓋：DeepSeek TUI 究竟是什麼，為什麼強大的編碼模型、巨大的上下文和低成本恰好契合設計，如何從零開始把它配置好，從參考到 UI 的迴圈，上下文檔案與 MCP 如何擴充套件它，它與 Codex、Claude Code、Cursor 和 Gemini CLI 相比如何，讓 AI 產出顯得平庸的那些陷阱，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合這道鴻溝——這是天然的搭配，因為兩者都開源、都跑在你自己的機器上。"], "heroImage": {"src": "/agents/deepseek-design/deepseek-design-hero.webp", "alt": "DeepSeek TUI 設計反饋迴圈：一個終端 agent 讀取參考與規範，一個瀏覽器渲染 UI，以及一個工作區，還有一條反饋箭頭回環", "caption": "核心迴圈：DeepSeek TUI 在終端裡讀取你的參考和規範，在真實瀏覽器中構建並驗證 UI，然後對照它們迭代——而整套設計系統都在上下文裡。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-deepseek", "label": "DeepSeek TUI 究竟是什麼"}, {"id": "why-design", "label": "為什麼強大的編碼模型 + 巨大上下文契合設計"}, {"id": "setup", "label": "為設計配置 DeepSeek TUI（從零開始）"}, {"id": "screenshot-workflow", "label": "從參考到 UI 的工作流"}, {"id": "extend", "label": "上下文檔案、MCP 與工具"}, {"id": "vs", "label": "DeepSeek TUI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與“AI 味”外觀"}, {"id": "open-design", "label": "在 Open Design 中用 DeepSeek TUI 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-deepseek", "heading": "DeepSeek TUI 究竟是什麼", "blocks": [{"kind": "p", "text": "DeepSeek TUI 是一個以鍵盤操作為主、執行 DeepSeek 模型的終端 AI agent。它讀取你的程式碼倉庫、編輯檔案、執行 shell 命令、管理 git，還能搜尋網路——它根據自然語言任務來規劃並驗證工作，而不只是補全程式碼行。DeepSeek 本身是模型提供方：一個與 OpenAI 相容的 API（它還暴露了一個 Anthropic 格式的端點），因此只要設定一個 base URL 和金鑰，就能把大量社群終端 agent 指向 DeepSeek。好幾個開源 TUI 都把 DeepSeek 作為一等公民般的提供方內建支援。"}, {"kind": "p", "text": "對設計工作而言，有三個特性尤為突出。DeepSeek 的編碼模型很強，因此 agent 能根據清晰的描述對佈局、結構和元件層級進行推理。它的上下文視窗最高可達 100 萬 token，大到足以一次性容納你整套設計系統和元件庫。而它的單 token 價格很低，再疊加字首上下文快取——所以圍繞一個設計反覆迭代成本很低。"}, {"kind": "steps", "items": [{"label": "上下文檔案", "body": "終端 agent 會讀取一個專案上下文檔案（AGENTS.md 風格的檔案，或該 agent 自己的約定）以獲取持久規則——這是編碼你的設計規範、tokens 和評審清單的天然位置。"}, {"label": "工具 + MCP", "body": "大多數 DeepSeek TUI 都內建檔案、shell、git 和網路工具，並支援 MCP 伺服器以接入外部上下文，比如一個即時的 Figma 檔案——DeepSeek 的 API 支援工具呼叫，而這些 agent 正依賴於此。"}, {"label": "自帶金鑰", "body": "你用一個來自 DeepSeek 平臺的 DeepSeek API 金鑰進行鑑權。由於該 API 與 OpenAI 相容，把一個 agent 指向 DeepSeek 通常只需兩行：base URL 和金鑰。"}]}, {"kind": "ul", "items": ["廠商：DeepSeek（模型與 API 提供方）", "憑證：來自 DeepSeek 平臺的 DeepSeek API 金鑰（BYOK）", "模型：deepseek-v4-flash 和 deepseek-v4-pro（純文本；無原生影像輸入）"]}]}, {"id": "why-design", "heading": "為什麼強大的編碼模型和巨大上下文契合設計", "blocks": [{"kind": "p", "text": "DeepSeek TUI 的設計優勢來自模型本身及其經濟性——但和每一個 agent 一樣，品味仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "強大且具成本效率的編碼", "body": "DeepSeek 的編碼模型能力強且價格低廉，因此 agent 能很好地推理佈局與結構，而你可以一遍又一遍地迭代，成本不再是約束。"}, {"label": "100 萬 token 的上下文視窗", "body": "大上下文意味著整套設計系統、tokens 以及許多參考狀態都能一次性放進去，於是 agent 會複用你真實的基礎元件，而不是臨時發明一次性的樣式——而上下文快取讓重複的提示保持低成本。"}, {"label": "把規範寫進上下文檔案", "body": "一個專案上下文檔案（再加上 Figma MCP 伺服器）把 agent 指向你的 tokens、元件和真實規格，於是它是面向一個品牌工作，而不是一套預設外觀。"}]}, {"kind": "image", "src": "/agents/deepseek-design/deepseek-design-taste-triangle.webp", "alt": "圖示：設計系統、skill 和參考匯聚成優秀的設計產出", "caption": "品味來自你提供的三項輸入：一套設計系統、一個 skill，以及真實的參考。"}, {"kind": "p", "text": "這個教訓和每個 agent 教給我們的一樣：DeepSeek TUI 預設並不具備品味。當你給它約束時，它才能產出優秀的設計——一套設計系統、一個審美 skill，以及具體的參考。Open Design 恰好把這些輸入打包好，這正是兩者契合的原因（下文還有更多）。"}]}, {"id": "setup", "heading": "從零開始，為設計工作配置 DeepSeek TUI", "blocks": [{"kind": "p", "text": "這是從一臺乾淨的機器到一個能構建並驗證 UI 的 DeepSeek TUI 的完整路徑。具體的安裝和命令名稱會因你選用哪個終端 agent 而異，所以下面的步驟停留在對各個 agent 都成立的層面上。"}, {"kind": "code", "lang": "bash", "code": "# 1. 從 DeepSeek 平臺獲取一個 DeepSeek API 金鑰\n#    https://platform.deepseek.com\nexport DEEPSEEK_API_KEY=sk-...\n\n# 2. 安裝一個支援 DeepSeek 的終端 agent（按其 README 操作），\n#    然後把它指向 DeepSeek。該 API 與 OpenAI 相容：\n#      base URL: https://api.deepseek.com\n#      model:    deepseek-v4-flash（或 deepseek-v4-pro）\n#    （/anthropic 處還有一個 Anthropic 格式的端點）\n\n# 3. 在你的專案裡啟動它並生成專案上下文\ncd your-project\n#   建立/搭建一個寫有你設計規則的專案上下文檔案\n\n# 4. 接入 Figma MCP 伺服器（可選，用於設計交付）\n#    把它加入該 agent 的 MCP 伺服器配置"}, {"kind": "image", "src": "/agents/deepseek-design/deepseek-design-setup-flow.webp", "alt": "五步配置流程：獲取金鑰、安裝 agent、配置上下文檔案、新增 skill、驗證", "caption": "配置順序：獲取金鑰 → 把 agent 指向 DeepSeek → 配置上下文檔案 → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "編碼你的設計規則", "body": "把你的 tokens、基礎元件和規範放進 agent 的上下文檔案並把它指向這些內容，讓產出貼合一個品牌，而不是退回到一套平庸的預設外觀。"}, {"label": "加入瀏覽器驗證", "body": "接入一個 Playwright 或瀏覽器 MCP，讓 agent 在真實瀏覽器中渲染，並跨斷點檢查其產出，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "從參考到 UI 的工作流", "blocks": [{"kind": "p", "text": "DeepSeek 的模型是純文本的——它們不原生讀取影像——所以收益最高的設計迴圈，是把清晰的參考和描述出來的佈局轉化為可工作的、響應式的 UI，然後在真實瀏覽器中驗證結果，而不是讓模型去“看”一張截圖。"}, {"kind": "ol", "items": ["從你手頭最清晰的參考出發——並描述出多種狀態（桌面端和移動端、懸停、空態、載入中），而不只是一張主視覺。", "在提示裡要具體；即便用強大的模型，含糊的提示也會產出平庸的 UI。把間距、層級以及要複用的元件講清楚。", "把你的設計系統和規範放在上下文檔案裡，並告訴 agent tokens 和規範化的基礎元件位於何處。", "執行一個 dev server，讓 agent 在真實瀏覽器中渲染，並調整到各個斷點來檢查結果——驗證就發生在這裡，因為模型本身看不到影像。", "通過讓 agent 把渲染出的 DOM 和計算樣式與你描述的規格相對照來迭代——而不僅僅是確認它能構建通過。"]}, {"kind": "p", "text": "精確地描述目標，並給出具體約束："}, {"kind": "code", "lang": "bash", "code": "# 在 agent 的提示裡：\n> 用 React + Vite + Tailwind + TypeScript 實現這個設計。\n  佈局：兩欄式儀表盤，240px 側邊欄，24px 間距，\n  卡片網格在 桌面/平板/移動 下分別為 3/2/1 列。\n  複用上下文檔案裡我已有的設計系統元件和 tokens。\n  在間距、佈局和層級上保持一致；做成響應式。\n  執行 dev server，在瀏覽器中渲染，並跨斷點對照\n  規格迭代，直到匹配為止。"}, {"kind": "p", "text": "讓提示保持小而聚焦，把好的迭代提交、把壞的回退（回退時告訴 agent），這樣每一輪都建立在一個乾淨的基礎上。"}]}, {"id": "extend", "heading": "上下文檔案、MCP 與工具", "blocks": [{"kind": "p", "text": "有三個擴充套件點能讓 DeepSeek TUI 適用於持續的設計工作，而這三者都能幹淨地對應到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "專案上下文檔案", "body": "專案規則存放在倉庫根目錄的一個上下文檔案裡（帶有全域性層和團隊層）。它是你設計規範的持久歸宿，每次執行都會被讀取。"}, {"label": "MCP 伺服器", "body": "在 agent 裡配置 MCP 伺服器——這是引入設計上下文和外部工具的可移植方式，其中最相關的就是 Figma MCP 伺服器，它們能跨多個 agent 通用，而不只在某一個裡有效。DeepSeek 的 API 支援這些伺服器所依賴的工具呼叫。"}, {"label": "內建工具", "body": "DeepSeek TUI 內建檔案、shell、git 和網路工具，讓 agent 無需離開終端就能收集參考並跑完驗證迴圈。"}]}, {"kind": "p", "text": "這些都是可移植的、多 agent 通用的能力——正是 Open Design 生來要去編排的那類東西，而不是在每個專案裡重新造一遍。"}]}, {"id": "vs", "heading": "在設計上，DeepSeek TUI vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "在設計工作上並沒有唯一的贏家——每個 agent 都有不同的強項，有經驗的團隊會把它們疊加使用。一個公允的概括："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["DeepSeek TUI", "強大、極具成本效率的編碼模型，開放權重，100 萬 token 上下文；純文本（無原生視覺）", "在預算之內做高頻迭代，並把整套設計系統持有在上下文中"], ["Codex", "出色的視覺打磨配上前端 skill；沙箱化的非同步構建", "委派式非同步構建以及可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex 色值、間距、字型）以及理解程式碼庫的 UX", "前端推理與大上下文重構"], ["Cursor", "帶即時預覽和行內編輯的視覺化“邊構建邊看”迴圈", "在 IDE 內進行緊湊的“迭代-觀察”式 UI 工作"], ["Gemini CLI", "原生多模態影像理解以及 100 萬 token 上下文；開源且有免費額度", "大量依賴截圖、需要 agent 直接讀取參考的工作"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人類——在沒有 skills、參考和約束的情況下，它們全都會退回到一套平庸的審美。這才是真正要解決的問題——而它的形態像是個設計工具問題，而非模型問題。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避免“AI 味”外觀", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來很平庸——柔和的漸變、漂浮的面板、過大的圓角、誇張的陰影，一種 Inter 字型加紫色的調調，“一看就是 AI 做的”。其他被反映的問題還包括移動端佈局錯亂，以及指令文字洩漏進 UI 文案裡。這些都不是 DeepSeek TUI 獨有的；任何 agent 在缺少精選設計上下文的情況下執行都會這樣。由於 DeepSeek 是純文本的，在真實瀏覽器中驗證就尤為重要，而不是指望模型去“看”結果。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會迫使 agent 承諾一個真實的方向，而不是預設外觀。"}, {"label": "在真實瀏覽器中驗證", "body": "用一個瀏覽器工具跨斷點渲染並自檢——這在這裡至關重要，因為模型自己讀不了截圖——這樣佈局就不會在移動端悄無聲息地崩掉。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和具體的、描述清楚的參考，是對產出質量影響最大的單一槓杆。"}, {"label": "把規則編碼進上下文檔案", "body": "把諸如“不要主視覺大卡片、最多兩種字型、品牌優先的層級”這類規則，放到 agent 每次執行都會讀取的地方。"}]}, {"kind": "p", "text": "請注意，每一項緩解措施都是在給 agent 一套精選的設計上下文。逐個專案手工維護這套上下文，正是 Open Design 替你免去的繁瑣勞作。"}]}, {"id": "open-design", "heading": "在 Open Design 內用 DeepSeek TUI 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一再呼喚的開源設計層。它把 DeepSeek agent 當作一等介面卡，並在其外包上一套精選的 skill 與設計系統庫、一條結構化的渲染流水線，以及一個本地桌面 UI——於是讓 DeepSeek 變好用的那套設計上下文，從第一次執行起就在那裡，而不是每次都手工拼湊。兩者都開源、都本地優先，這讓這對搭配水到渠成。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 DeepSeek TUI 作為你的 agent。", "用你自己的 DeepSeek API 金鑰進行鑑權（BYOK）——憑證留在你的機器上，絕不經我們代理。", "選一套設計系統和一個 skill，然後以一致的品味生成簡報、原型和落地頁。", "每一個產物和 DESIGN.md 檔案都存放在你自己的倉庫裡，而不是託管的雲端。"]}, {"kind": "p", "text": "同一個 DeepSeek agent、同一個金鑰——再加上一套圍繞它的真實、可移植、開源的設計工作流。它本地優先且採用 Apache-2.0 協議，所以你的工作內容和憑證沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "DeepSeek TUI 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一套設計系統和具體的參考，一個由 DeepSeek 驅動的終端 agent 就能產出生產級的響應式 UI，然後你在真實瀏覽器中驗證產出。DeepSeek 的模型是純文本的，所以這套驗證迴圈替代了原生的影像讀取。缺了那套上下文，它就傾向於退回到一套平庸的外觀，而這正是 Open Design 所填補的缺口。"}, {"name": "用 DeepSeek TUI 做設計要花多少錢？", "text": "很少——DeepSeek 的 API 單 token 價格屬於最便宜之列，而字首上下文快取又進一步削減了重複提示的成本，所以你可以放開手腳地迭代。你自帶 DeepSeek API 金鑰（BYOK）；Open Design 絕不代理你的憑證。"}, {"name": "DeepSeek 具體好在哪裡，適合做設計？", "text": "強大且具成本效率的編碼模型、開放權重，以及一個能一次性容納整套設計系統和參考集合的 100 萬 token 上下文。DeepSeek 是純文本的——它不原生讀取影像——所以品味仍然來自你提供的設計系統、skill 和描述出來的參考，並在瀏覽器中驗證。"}, {"name": "前端設計該選 DeepSeek TUI 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體的、理解程式碼庫的設計決策著稱；DeepSeek TUI 的優勢在於開放權重、極低成本，以及適合高頻迭代的巨大上下文。許多團隊兩者都用——Open Design 讓你在不改變設計工作流的前提下切換 agent。"}, {"name": "我該如何把 DeepSeek TUI 連線到 Figma？", "text": "在你終端 agent 的 MCP 配置里加入 Figma MCP 伺服器。這樣 agent 就能拉取真實的設計上下文——元件、變數、佈局資料——讓生成的程式碼與原始檔一致，而不是近似還原。DeepSeek 的 API 支援 MCP 所依賴的工具呼叫。"}, {"name": "Open Design 與 DeepSeek 有關聯嗎？", "text": "沒有。DeepSeek 是模型與 API 提供方；Open Design 是一個獨立的開源專案，把由 DeepSeek 驅動的終端 agent 作為一等介面卡來支援。DeepSeek 是 DeepSeek 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0 協議。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，而你的 DeepSeek API 金鑰由你的 agent 直接使用，絕不經過 Open Design 的伺服器路由。"}], "ctaTitle": "以開放的方式，用 DeepSeek TUI 做設計。", "ctaBody": "自帶你自己的 DeepSeek API 金鑰，把每個檔案都留在本地，並在你已經在用的 agent 周圍獲得一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 內使用 DeepSeek TUI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
  },
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

// Per-locale agent-guide translations, built by spreading the English guides
// (so non-rendered compact fields stay type-complete) and overriding with the
// localized copy. en + zh come from INFO_PAGE_COPY directly; every other locale
// resolves its agent pages here instead of falling back to English.
const LOCALIZED_AGENT_GUIDES = buildLocalizedAgentGuides(INFO_PAGE_COPY.en!.agentGuides);

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
    // Per-agent detail pages: prefer the locale's own translated guides, and
    // fall back to the English copy for any locale not yet translated.
    agentGuides: LOCALIZED_AGENT_GUIDES[locale] ?? INFO_PAGE_COPY.en?.agentGuides ?? {},
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

// Copy for one `/alternatives/<slug>/` comparison page. Only en supplies
// these today, so non-en locales fall back to the English copy — the page
// still renders, just in English, until localized overrides land.
export function getAlternativeCopy(
  locale: LandingLocaleCode,
  slug: string,
): AlternativeDetailCopy | undefined {
  return (
    INFO_PAGE_COPY[locale]?.alternatives?.[slug] ??
    INFO_PAGE_COPY[DEFAULT_LOCALE]!.alternatives?.[slug]
  );
}

export const quickstartCode = QUICKSTART_CODE;
