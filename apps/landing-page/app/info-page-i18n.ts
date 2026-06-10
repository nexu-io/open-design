import {
  DEFAULT_LOCALE,
  getCommonCopy,
  getHomePageCopy,
  getLandingUiCopy,
  type LandingLocaleCode,
} from './i18n';
import { buildLocalizedAgentGuides } from './agent-guides.i18n';
import { LOCALIZED_ALTERNATIVES } from './alternatives-i18n';

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
export type AlternativeDetailCopy = {
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
  // Optional rich long-form payload (hero illustration + sectioned blocks),
  // same contract as agent detail pages. When present, the alternatives page
  // renders the industrial long-form layout instead of the flat sections.
  rich?: AgentRichCopy;
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
      title: 'Open Design vs Figma, Lovable, Bolt, v0, Framer — honest comparisons',
      description:
        'Compare Open Design to the major AI design and app-building tools. Hosted vs local-first, BYOK vs vendor-locked, single-shot generation vs portable DESIGN.md systems.',
      breadcrumb: 'Compare',
      label: 'Evaluation · Nº 02',
      heading: 'Open Design vs everything else.',
      lead:
        'Short, honest summaries of how Open Design relates to the other AI design and app-building tools you might be evaluating. Each links to a full, candid comparison.',
      toc: ['vs Claude Design', 'vs Figma', 'vs Lovable', 'vs Bolt', 'vs v0', 'vs Framer', 'Honest limits'],
      comparisons: [
        {
          competitor: 'Claude Design',
          summary:
            'Hosted product tied to a single vendor. Open Design is local-first, BYOK, and Apache-2.0 — your skills and DESIGN.md live in your repo.',
          cta: 'Read the full comparison ->',
        },
        {
          competitor: 'Figma',
          summary:
            'Figma is a hosted, hands-on design canvas. Open Design is agent-driven and local-first, with your brand and artifacts as files in your repo.',
          cta: 'Read the full comparison ->',
        },
        {
          competitor: 'Lovable',
          summary:
            'Lovable ships hosted prompt-to-app builds. Open Design is the design-first, BYOK layer for the coding agent you already use.',
          cta: 'Read the full comparison ->',
        },
        {
          competitor: 'Bolt',
          summary:
            'Bolt builds running full-stack apps in the browser. Open Design produces design artifacts you own, locally, with your own agent.',
          cta: 'Read the full comparison ->',
        },
        {
          competitor: 'v0',
          summary:
            'v0 generates hosted UI tuned for the Vercel and React stack. Open Design generates design with any agent, locally, as files you own.',
          cta: 'Read the full comparison ->',
        },
        {
          competitor: 'Framer',
          summary:
            'Framer is a hosted no-code site builder. Open Design is the open-source, agent-driven alternative that keeps design as files you deploy anywhere.',
          cta: 'Read the full comparison ->',
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
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first design layer around the coding agent you already use — your key, your files, a curated skill and design-system library.',
          heroCtaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/lovable/lovable-hero.webp',
            alt: 'Open Design vs Lovable — warm-paper editorial illustration of code converging into a design hub',
          },
          intro: [
            'Lovable turns a prompt into a deployed full-stack app. Open Design is a self-evolving design agent for Claude Code and other coding agents — local-first, BYOK, Apache-2.0 — focused on producing design artifacts and a portable brand you keep as files in your own repo.',
            'This is an honest comparison: what Lovable is, why teams look for an alternative, how local-first + BYOK changes the economics, a feature-by-feature table, who should pick which, and how to move a design across. It is candid about where Lovable wins.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-lovable', label: 'What Lovable is' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'who-picks', label: 'Who picks which' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-lovable',
              heading: 'What Lovable is',
              blocks: [
                { kind: 'p', text: 'Lovable (lovable.dev) is a hosted AI app builder: describe a product in natural language and it generates and deploys a full-stack web app — frontend, backend, and database wiring — that you can host in one click. It is genuinely good at going from prompt to a running app.' },
                { kind: 'p', text: 'It is closed-source and runs in the vendor cloud, billed by subscription and per-message credits. That is a different posture from Open Design, which is a local-first, open-source design agent you point your own coding agent at — and the two overlap on prompt-to-UI, not on hosting a backend.' },
                { kind: 'ul', items: [
                  'Vendor: Lovable (lovable.dev) — hosted SaaS',
                  'Pricing: subscription + per-message credits',
                  'Primary output: a deployed app, plus code export',
                ] },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Lovable alternative',
              blocks: [
                { kind: 'p', text: 'Teams start looking past Lovable when they want to own the output, control spend, and keep design as portable, version-controlled assets rather than state inside a hosted project.' },
                { kind: 'steps', items: [
                  { label: 'Own the output', body: 'Designs and code should live as files in your repo, not inside a hosted project you can only edit through one UI.' },
                  { label: 'BYOK economics', body: 'Bring your own provider key so API spend bills to your account, instead of paying per-message credits on top of a subscription.' },
                  { label: 'Agent choice', body: 'Drive design from the coding agent you already use — Claude Code, Codex, Cursor, and more — not a single vendor-managed model.' },
                  { label: 'Open source', body: 'Apache-2.0 and self-hostable: fork it, rebrand it for your studio, or embed it in CI.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'p', text: 'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine. No design output is forced through a vendor cloud, and your brand lives in your repo as a portable DESIGN.md file every skill respects.' },
                { kind: 'p', text: 'You bring your own agent key. Credentials stay in local config or environment variables — Open Design never proxies them — and the API spend bills directly to you.' },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Lovable, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Lovable'], rows: [
                  ['Primary job', 'Design-first artifacts + portable brand', 'Prompt-to-deployed full-stack app'],
                  ['License', 'Apache-2.0, full source on GitHub', 'Closed-source, hosted product'],
                  ['Runtime', 'Local daemon on your machine', 'Vendor cloud'],
                  ['Agent', 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', 'Vendor-managed models'],
                  ['API spend', 'Bills to your account', 'Per-message credits / subscription'],
                  ['Design system', 'Portable DESIGN.md in your repo', 'Per-project styling'],
                  ['Output ownership', 'Files in your project directory', 'Hosted project + code export'],
                  ['Hosting / deploy', 'You own deploy; not bundled', 'One-click hosting included'],
                  ['Self-host', 'Yes, run anywhere Node 24 runs', 'No'],
                  ['CLI / CI', 'Yes via od CLI + HTTP daemon', 'Web UI first'],
                ] },
                { kind: 'p', text: 'Where Lovable wins: if your goal is a deployed, hosted full-stack app with the backend wired up for you, Lovable does that out of the box and Open Design does not. Open Design is design-first.' },
              ],
            },
            {
              id: 'who-picks',
              heading: 'Who should pick which',
              blocks: [
                { kind: 'p', text: 'Pick Lovable if:' },
                { kind: 'ul', items: [
                  'You want a deployed full-stack web app from a prompt with zero setup.',
                  'You want one-click hosting and the backend wired up for you.',
                  'You prefer a hosted UI and per-project credits over local files.',
                ] },
                { kind: 'p', text: 'Pick Open Design if:' },
                { kind: 'ul', items: [
                  'You want design artifacts and a brand as version-controlled files.',
                  'You want BYOK with your existing coding agent.',
                  'You want open source you can fork, rebrand, embed in CLI, or self-host.',
                  'You want one DESIGN.md per brand that every skill respects.',
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving a design from Lovable into Open Design',
              blocks: [
                { kind: 'p', text: 'There is no automatic import from Lovable today; start design-first with a one-time brand-extraction run.' },
                { kind: 'ol', items: [
                  'Install Open Design from the quickstart.',
                  'Open the web UI and point your agent at a Lovable project or screenshot you like.',
                  'Ask the agent to extract the brand into a DESIGN.md file.',
                  'Pick a skill and render it against your new brand.',
                ] },
                { kind: 'p', text: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'Is Open Design a drop-in replacement for Lovable?', text: 'No. Lovable ships deployed full-stack apps; Open Design is design-first and produces artifacts you own. They overlap on prompt-to-UI, not on hosting a backend.' },
            { name: 'Can Open Design build a full app like Lovable?', text: 'Open Design focuses on design artifacts, prototypes, and brand systems. For production backends and one-click hosting, Lovable is the better fit.' },
            { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. API spend bills to your account and credentials are never proxied through us.' },
            { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
            { name: 'Can I keep using Lovable alongside Open Design?', text: 'Yes. Many teams prototype design in Open Design and ship apps in Lovable; migration is manual today.' },
            { name: 'Is Open Design affiliated with Lovable?', text: 'No. Open Design is an independent, open-source project. Lovable is a trademark of its owner; this is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Design-first, in three commands.',
          ctaBody:
            'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
          ctaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      figma: {
        title: 'Open-source Figma alternative — Open Design (design-first, BYOK, local)',
        description:
          'Open Design is the open-source, local-first alternative to Figma for agent-driven design. BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen — your brand and artifacts live as files in your repo.',
        breadcrumb: 'Open-source Figma alternative',
        label: 'Alternative · Figma',
        heading: 'Open-source Figma alternative.',
        lead:
          'Figma is a hosted, collaborative canvas you design on by hand. Open Design is a self-evolving design agent for Claude Code — local-first, BYOK, Apache-2.0 — where you drive design through your coding agent and keep a portable brand as files. Different shape, same goal: shipped interfaces.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Figma is a manual cloud design tool; Open Design is an agent-driven, local-first, open-source design layer. If you want files in your repo and BYOK over a hosted canvas, Open Design is the alternative — and it is honest about where Figma wins.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Figma alternative',
        whyLead: 'A few reasons keep coming up when teams look past Figma:',
        reasons: [
          { label: 'Own the files.', body: 'Design should be version-controlled artifacts in your repo, not documents in a vendor cloud.' },
          { label: 'Open source.', body: 'Apache-2.0, self-hostable, rebrandable — not a closed, per-seat SaaS.' },
          { label: 'Agent-driven.', body: 'Generate and iterate design with the coding agent you already use, instead of drawing every frame by hand.' },
          { label: 'Portable brand.', body: 'One DESIGN.md encodes a brand every skill respects, versioned with your code.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine — your designs are files, not cloud documents.',
          'You bring your own agent key; credentials stay local and never proxy through us, and API spend bills to you.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'How you design', od: 'Prompt your coding agent', cd: 'Manual canvas, by hand' },
          { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Closed-source, hosted product' },
          { name: 'Runtime', od: 'Local daemon on your machine', cd: 'Vendor cloud' },
          { name: 'Output ownership', od: 'Files in your project directory', cd: 'Cloud documents' },
          { name: 'Design system', od: 'Portable DESIGN.md in your repo', cd: 'Hosted libraries' },
          { name: 'Collaboration', od: 'Git / your repo', cd: 'Real-time multiplayer canvas' },
          { name: 'Pricing', od: 'Free product; you pay agent API costs', cd: 'Per-editor seats' },
          { name: 'Self-host', od: 'Yes, run anywhere Node 24 runs', cd: 'No' },
          { name: 'Handoff', od: 'Code artifacts in your repo', cd: 'Dev Mode / inspect' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Figma if',
        pickClaude: [
          'You want hands-on vector editing and a real-time multiplayer canvas.',
          'Your team lives in a mature plugin and component ecosystem.',
          'You prefer a hosted designer-to-developer handoff over files.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You want design artifacts and a brand as version-controlled files.',
          'You want BYOK with your existing coding agent.',
          'You want open source you can fork, rebrand, embed in CLI, or self-host.',
          'You want one DESIGN.md per brand that every skill respects.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'There is no automatic import from Figma today; start design-first with a one-time brand-extraction run:',
        migrateSteps: [
          'Install Open Design from the quickstart.',
          'Open the web UI and point your agent at a Figma frame or screenshot you like.',
          'Ask the agent to extract the brand into a DESIGN.md file.',
          'Pick a skill and render it against your new brand.',
        ],
        migrateClosing: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Open Design a drop-in replacement for Figma?', text: 'No. Figma is a hands-on collaborative canvas; Open Design is an agent-driven, local-first design layer. They overlap on producing interfaces, not on real-time canvas editing.' },
          { name: 'Can I still use Figma alongside Open Design?', text: 'Yes. Many teams design in Figma and use Open Design to generate and iterate from a portable brand; migration is manual today.' },
          { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. Credentials are never proxied through us.' },
          { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
          { name: 'Is Open Design affiliated with Figma?', text: 'No. Open Design is an independent, open-source project. Figma is a trademark of its owner; this is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Design-first, in three commands.',
        ctaBody:
          'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first design layer around the coding agent you already use — your key, your files, a curated skill and design-system library.',
          heroCtaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/figma/figma-hero.webp',
            alt: 'Open Design vs Figma — warm-paper editorial illustration of code converging into a design hub',
          },
          intro: [
            'Figma turns a cloud canvas into shared, hands-on interface design. Open Design is a self-evolving design agent for Claude Code and other coding agents — local-first, BYOK, Apache-2.0 — where you drive design through your agent and keep a portable brand as files in your own repo.',
            'This is an honest comparison: what Figma is, why teams look for an alternative, how local-first + BYOK changes the shape of the work, a feature-by-feature table, who should pick which, and how to move a design across. It is candid about where Figma wins.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-figma', label: 'What Figma is' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'who-picks', label: 'Who picks which' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-figma',
              heading: 'What Figma is',
              blocks: [
                { kind: 'p', text: 'Figma is a hosted, collaborative interface design tool: a browser-based vector canvas with real-time multiplayer editing, prototyping, a large plugin and component ecosystem, and a designer-to-developer handoff. It is the default for hands-on UI design, and it has added AI features of its own.' },
                { kind: 'p', text: 'It is closed-source and runs in the vendor cloud, billed per editor seat. Open Design is a different shape: a local-first, open-source design agent you point your own coding agent at — the two overlap on producing interfaces, not on real-time canvas editing.' },
                { kind: 'ul', items: [
                  'Vendor: Figma — hosted SaaS',
                  'Pricing: per-editor seats',
                  'Primary output: cloud design documents',
                ] },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Figma alternative',
              blocks: [
                { kind: 'p', text: 'Teams start looking past Figma when they want design to be files they own, generated and iterated by the agent they already use, rather than documents living in a vendor cloud.' },
                { kind: 'steps', items: [
                  { label: 'Own the files', body: 'Design should be version-controlled artifacts in your repo, not cloud documents you only reach through one app.' },
                  { label: 'Open source', body: 'Apache-2.0 and self-hostable: fork it, rebrand it for your studio, or embed it in CI — not a closed per-seat SaaS.' },
                  { label: 'Agent-driven', body: 'Generate and iterate design with the coding agent you already use, instead of drawing every frame by hand.' },
                  { label: 'Portable brand', body: 'One DESIGN.md encodes a brand every skill respects, versioned with your code.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'p', text: 'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine. Your designs are files, not cloud documents, and your brand lives in your repo as a portable DESIGN.md file every skill respects.' },
                { kind: 'p', text: 'You bring your own agent key. Credentials stay in local config or environment variables — Open Design never proxies them — and the API spend bills directly to you.' },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Figma, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Figma'], rows: [
                  ['How you design', 'Prompt your coding agent', 'Manual canvas, by hand'],
                  ['License', 'Apache-2.0, full source on GitHub', 'Closed-source, hosted product'],
                  ['Runtime', 'Local daemon on your machine', 'Vendor cloud'],
                  ['Output ownership', 'Files in your project directory', 'Cloud documents'],
                  ['Design system', 'Portable DESIGN.md in your repo', 'Hosted libraries'],
                  ['Collaboration', 'Git / your repo', 'Real-time multiplayer canvas'],
                  ['Pricing', 'Free product; you pay agent API costs', 'Per-editor seats'],
                  ['Self-host', 'Yes, run anywhere Node 24 runs', 'No'],
                  ['Handoff', 'Code artifacts in your repo', 'Dev Mode / inspect'],
                ] },
                { kind: 'p', text: 'Where Figma wins: hands-on vector editing, a real-time multiplayer canvas, and a deep, mature plugin and component ecosystem. If that hands-on canvas is the job, Figma is hard to beat — Open Design is design-first and agent-driven instead.' },
              ],
            },
            {
              id: 'who-picks',
              heading: 'Who should pick which',
              blocks: [
                { kind: 'p', text: 'Pick Figma if:' },
                { kind: 'ul', items: [
                  'You want hands-on vector editing and a real-time multiplayer canvas.',
                  'Your team lives in a mature plugin and component ecosystem.',
                  'You prefer a hosted designer-to-developer handoff over files.',
                ] },
                { kind: 'p', text: 'Pick Open Design if:' },
                { kind: 'ul', items: [
                  'You want design artifacts and a brand as version-controlled files.',
                  'You want BYOK with your existing coding agent.',
                  'You want open source you can fork, rebrand, embed in CLI, or self-host.',
                  'You want one DESIGN.md per brand that every skill respects.',
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving a design from Figma into Open Design',
              blocks: [
                { kind: 'p', text: 'There is no automatic import from Figma today; start design-first with a one-time brand-extraction run.' },
                { kind: 'ol', items: [
                  'Install Open Design from the quickstart.',
                  'Open the web UI and point your agent at a Figma frame or screenshot you like.',
                  'Ask the agent to extract the brand into a DESIGN.md file.',
                  'Pick a skill and render it against your new brand.',
                ] },
                { kind: 'p', text: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'Is Open Design a drop-in replacement for Figma?', text: 'No. Figma is a hands-on collaborative canvas; Open Design is an agent-driven, local-first design layer. They overlap on producing interfaces, not on real-time canvas editing.' },
            { name: 'Can I still use Figma alongside Open Design?', text: 'Yes. Many teams design in Figma and use Open Design to generate and iterate from a portable brand; migration is manual today.' },
            { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. Credentials are never proxied through us.' },
            { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
            { name: 'Is Open Design affiliated with Figma?', text: 'No. Open Design is an independent, open-source project. Figma is a trademark of its owner; this is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Design-first, in three commands.',
          ctaBody:
            'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
          ctaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      bolt: {
        title: 'Open-source Bolt alternative — Open Design (design-first, BYOK, local)',
        description:
          'Open Design is the open-source, local-first alternative to Bolt (bolt.new) for design-first work. BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen — artifacts ship as files in your repo.',
        breadcrumb: 'Open-source Bolt alternative',
        label: 'Alternative · Bolt',
        heading: 'Open-source Bolt alternative.',
        lead:
          'Bolt (bolt.new) turns a prompt into a running full-stack app in the browser. Open Design is a self-evolving design agent for Claude Code — local-first, BYOK, open source — focused on design artifacts and a portable brand rather than shipping the backend. Different primary job, overlapping prompt-to-UI surface.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Bolt ships hosted apps; Open Design ships design artifacts as files you own. If you want a design-first, BYOK, open-source workflow with your own agent, Open Design is the alternative — and it is honest about where Bolt wins.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Bolt alternative',
        whyLead: 'A few reasons keep showing up when teams look past Bolt:',
        reasons: [
          { label: 'Own the output.', body: 'Designs and code should live as files in your repo, not inside a hosted in-browser project.' },
          { label: 'BYOK economics.', body: 'Bring your own provider key; API spend bills to your account instead of per-token credits.' },
          { label: 'Agent choice.', body: 'Drive design from the coding agent you already use — Claude Code, Codex, Cursor, and more.' },
          { label: 'Open source.', body: 'Apache-2.0, self-hostable, rebrandable for your studio.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine — no design output is forced through a vendor cloud.',
          'You bring your own agent key; credentials stay local and never proxy through us, and API spend bills to you.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'Primary job', od: 'Design-first artifacts + portable brand', cd: 'Prompt-to-running full-stack app' },
          { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Closed-source, hosted product' },
          { name: 'Runtime', od: 'Local daemon on your machine', cd: 'In-browser / vendor cloud' },
          { name: 'Agent', od: 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', cd: 'Vendor-managed models' },
          { name: 'API spend', od: 'Bills to your account', cd: 'Per-token credits / subscription' },
          { name: 'Design system', od: 'Portable DESIGN.md in your repo', cd: 'Per-project styling' },
          { name: 'Output ownership', od: 'Files in your project directory', cd: 'Hosted project + code export' },
          { name: 'Self-host', od: 'Yes, run anywhere Node 24 runs', cd: 'No' },
          { name: 'CLI / CI', od: 'Yes via od CLI + HTTP daemon', cd: 'Web UI first' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Bolt if',
        pickClaude: [
          'You want a running full-stack app from a prompt, in the browser, with zero setup.',
          'You want to deploy straight from the same hosted environment.',
          'You prefer a hosted UI and per-token credits over local files.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You want design artifacts and a brand as version-controlled files.',
          'You want BYOK with your existing coding agent.',
          'You want open source you can fork, rebrand, embed in CLI, or self-host.',
          'You want one DESIGN.md per brand that every skill respects.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'There is no automatic import from Bolt today; start design-first with a one-time brand-extraction run:',
        migrateSteps: [
          'Install Open Design from the quickstart.',
          'Open the web UI and point your agent at a Bolt project or screenshot you like.',
          'Ask the agent to extract the brand into a DESIGN.md file.',
          'Pick a skill and render it against your new brand.',
        ],
        migrateClosing: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Open Design a drop-in replacement for Bolt?', text: 'No. Bolt ships running full-stack apps; Open Design is design-first and produces artifacts you own. They overlap on prompt-to-UI, not on running a backend.' },
          { name: 'Can Open Design build a full app like Bolt?', text: 'Open Design focuses on design artifacts, prototypes, and brand systems. For an instant in-browser full-stack app, Bolt is the better fit.' },
          { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. API spend bills to your account and credentials are never proxied through us.' },
          { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
          { name: 'Is Open Design affiliated with Bolt?', text: 'No. Open Design is an independent, open-source project. Bolt and bolt.new are trademarks of their owner; this is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Design-first, in three commands.',
        ctaBody:
          'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first design layer around the coding agent you already use — your key, your files, a curated skill and design-system library.',
          heroCtaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/bolt/bolt-hero.webp',
            alt: 'Open Design vs Bolt — warm-paper editorial illustration of code converging into a design hub',
          },
          intro: [
            'Bolt turns a prompt into a running full-stack app in the browser. Open Design is a self-evolving design agent for Claude Code and other coding agents — local-first, BYOK, Apache-2.0 — focused on producing design artifacts and a portable brand you keep as files in your own repo.',
            'This is an honest comparison: what Bolt is, why teams look for an alternative, how local-first + BYOK changes the economics, a feature-by-feature table, who should pick which, and how to move a design across. It is candid about where Bolt wins.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-bolt', label: 'What Bolt is' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'who-picks', label: 'Who picks which' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-bolt',
              heading: 'What Bolt is',
              blocks: [
                { kind: 'p', text: 'Bolt (bolt.new, from StackBlitz) is a hosted AI app builder that runs in the browser: describe a product and it generates and runs a full-stack web app you can deploy. It is genuinely fast at going from prompt to a running app, with the dev environment in the browser.' },
                { kind: 'p', text: 'It is closed-source and hosted, billed by subscription and per-token credits. Open Design is a different posture: a local-first, open-source design agent you point your own coding agent at — and the two overlap on prompt-to-UI, not on running a backend.' },
                { kind: 'ul', items: [
                  'Vendor: StackBlitz (bolt.new) — hosted SaaS',
                  'Pricing: subscription + per-token credits',
                  'Primary output: a running app, plus code export',
                ] },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Bolt alternative',
              blocks: [
                { kind: 'p', text: 'Teams start looking past Bolt when they want to own the output, control spend, and keep design as portable, version-controlled assets rather than state inside a hosted in-browser project.' },
                { kind: 'steps', items: [
                  { label: 'Own the output', body: 'Designs and code should live as files in your repo, not inside a hosted in-browser project.' },
                  { label: 'BYOK economics', body: 'Bring your own provider key so API spend bills to your account, instead of paying per-token credits on top of a subscription.' },
                  { label: 'Agent choice', body: 'Drive design from the coding agent you already use — Claude Code, Codex, Cursor, and more — not a single vendor-managed model.' },
                  { label: 'Open source', body: 'Apache-2.0 and self-hostable: fork it, rebrand it for your studio, or embed it in CI.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'p', text: 'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine. No design output is forced through a vendor cloud, and your brand lives in your repo as a portable DESIGN.md file every skill respects.' },
                { kind: 'p', text: 'You bring your own agent key. Credentials stay in local config or environment variables — Open Design never proxies them — and the API spend bills directly to you.' },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Bolt, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Bolt'], rows: [
                  ['Primary job', 'Design-first artifacts + portable brand', 'Prompt-to-running full-stack app'],
                  ['License', 'Apache-2.0, full source on GitHub', 'Closed-source, hosted product'],
                  ['Runtime', 'Local daemon on your machine', 'In-browser / vendor cloud'],
                  ['Agent', 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', 'Vendor-managed models'],
                  ['API spend', 'Bills to your account', 'Per-token credits / subscription'],
                  ['Design system', 'Portable DESIGN.md in your repo', 'Per-project styling'],
                  ['Output ownership', 'Files in your project directory', 'Hosted project + code export'],
                  ['Self-host', 'Yes, run anywhere Node 24 runs', 'No'],
                  ['CLI / CI', 'Yes via od CLI + HTTP daemon', 'Web UI first'],
                ] },
                { kind: 'p', text: 'Where Bolt wins: if your goal is an instant, running full-stack app in the browser with the dev environment wired up for you, Bolt does that out of the box. Open Design is design-first.' },
              ],
            },
            {
              id: 'who-picks',
              heading: 'Who should pick which',
              blocks: [
                { kind: 'p', text: 'Pick Bolt if:' },
                { kind: 'ul', items: [
                  'You want a running full-stack app from a prompt, in the browser, with zero setup.',
                  'You want to deploy straight from the same hosted environment.',
                  'You prefer a hosted UI and per-token credits over local files.',
                ] },
                { kind: 'p', text: 'Pick Open Design if:' },
                { kind: 'ul', items: [
                  'You want design artifacts and a brand as version-controlled files.',
                  'You want BYOK with your existing coding agent.',
                  'You want open source you can fork, rebrand, embed in CLI, or self-host.',
                  'You want one DESIGN.md per brand that every skill respects.',
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving a design from Bolt into Open Design',
              blocks: [
                { kind: 'p', text: 'There is no automatic import from Bolt today; start design-first with a one-time brand-extraction run.' },
                { kind: 'ol', items: [
                  'Install Open Design from the quickstart.',
                  'Open the web UI and point your agent at a Bolt project or screenshot you like.',
                  'Ask the agent to extract the brand into a DESIGN.md file.',
                  'Pick a skill and render it against your new brand.',
                ] },
                { kind: 'p', text: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'Is Open Design a drop-in replacement for Bolt?', text: 'No. Bolt ships running full-stack apps; Open Design is design-first and produces artifacts you own. They overlap on prompt-to-UI, not on running a backend.' },
            { name: 'Can Open Design build a full app like Bolt?', text: 'Open Design focuses on design artifacts, prototypes, and brand systems. For an instant in-browser full-stack app, Bolt is the better fit.' },
            { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. API spend bills to your account and credentials are never proxied through us.' },
            { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
            { name: 'Is Open Design affiliated with Bolt?', text: 'No. Open Design is an independent, open-source project. Bolt and bolt.new are trademarks of their owner; this is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Design-first, in three commands.',
          ctaBody:
            'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
          ctaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      v0: {
        title: 'Open-source v0 alternative — Open Design (design-first, BYOK, local)',
        description:
          'Open Design is the open-source, local-first alternative to v0 by Vercel for design-first work. BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen — artifacts ship as files in your repo.',
        breadcrumb: 'Open-source v0 alternative',
        label: 'Alternative · v0',
        heading: 'Open-source v0 alternative.',
        lead:
          'v0 by Vercel turns a prompt into hosted UI components. Open Design is a self-evolving design agent for Claude Code — local-first, BYOK, open source — that drives any coding agent and keeps your brand and artifacts as files. Closest overlap of the bunch: prompt-to-UI, different posture.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'v0 generates UI in Vercel’s hosted flow; Open Design generates design with your own agent, locally, as files you own. If you want BYOK, any agent, and open source over a hosted generator, Open Design is the alternative — and it is honest about where v0 wins.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a v0 alternative',
        whyLead: 'A few reasons keep showing up when teams look past v0:',
        reasons: [
          { label: 'Own the output.', body: 'UI should be files in your repo, not generations in a hosted project.' },
          { label: 'BYOK economics.', body: 'Bring your own provider key; API spend bills to your account instead of per-generation credits.' },
          { label: 'Any agent, any stack.', body: 'Drive design from the coding agent you already use, not a single vendor-managed model.' },
          { label: 'Open source.', body: 'Apache-2.0, self-hostable, rebrandable for your studio.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine — your UI is files, not hosted generations.',
          'You bring your own agent key; credentials stay local and never proxy through us, and API spend bills to you.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'Primary job', od: 'Design-first artifacts + portable brand', cd: 'Prompt-to-hosted UI components' },
          { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Closed-source, hosted product' },
          { name: 'Runtime', od: 'Local daemon on your machine', cd: 'Vendor cloud' },
          { name: 'Agent', od: 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', cd: 'Vendor-managed model' },
          { name: 'API spend', od: 'Bills to your account', cd: 'Per-generation credits / subscription' },
          { name: 'Design system', od: 'Portable DESIGN.md in your repo', cd: 'Per-project styling' },
          { name: 'Output ownership', od: 'Files in your project directory', cd: 'Hosted project + code export' },
          { name: 'Self-host', od: 'Yes, run anywhere Node 24 runs', cd: 'No' },
          { name: 'CLI / CI', od: 'Yes via od CLI + HTTP daemon', cd: 'Web UI first' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick v0 if',
        pickClaude: [
          'You want UI generated tightly into the Vercel and React ecosystem.',
          'You want to deploy straight to Vercel from the same flow.',
          'You prefer a hosted generator and per-generation credits over local files.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You want design artifacts and a brand as version-controlled files.',
          'You want BYOK with your existing coding agent, on any stack.',
          'You want open source you can fork, rebrand, embed in CLI, or self-host.',
          'You want one DESIGN.md per brand that every skill respects.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'There is no automatic import from v0 today; start design-first with a one-time brand-extraction run:',
        migrateSteps: [
          'Install Open Design from the quickstart.',
          'Open the web UI and point your agent at a v0 generation or screenshot you like.',
          'Ask the agent to extract the brand into a DESIGN.md file.',
          'Pick a skill and render it against your new brand.',
        ],
        migrateClosing: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Open Design a drop-in replacement for v0?', text: 'No. v0 generates UI in Vercel’s hosted flow; Open Design is design-first and produces artifacts you own with any agent. They overlap on prompt-to-UI, not on the Vercel-hosted pipeline.' },
          { name: 'Does Open Design lock me to a stack?', text: 'No. BYOK with any supported agent, and your output is plain files in your repo — not tied to one framework or host.' },
          { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. API spend bills to your account and credentials are never proxied through us.' },
          { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
          { name: 'Is Open Design affiliated with v0 or Vercel?', text: 'No. Open Design is an independent, open-source project. v0 and Vercel are trademarks of their owner; this is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Design-first, in three commands.',
        ctaBody:
          'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first design layer around the coding agent you already use — your key, your files, a curated skill and design-system library.',
          heroCtaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/v0/v0-hero.webp',
            alt: 'Open Design vs v0 — warm-paper editorial illustration of code converging into a design hub',
          },
          intro: [
            'v0 by Vercel turns a prompt into hosted UI components, tuned for the React and Vercel ecosystem. Open Design is a self-evolving design agent for Claude Code and other coding agents — local-first, BYOK, Apache-2.0 — focused on producing design artifacts and a portable brand you keep as files in your own repo.',
            'This is an honest comparison: what v0 is, why teams look for an alternative, how local-first + BYOK changes the shape of the work, a feature-by-feature table, who should pick which, and how to move a design across. It is candid about where v0 wins.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-v0', label: 'What v0 is' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'who-picks', label: 'Who picks which' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-v0',
              heading: 'What v0 is',
              blocks: [
                { kind: 'p', text: 'v0 by Vercel is a hosted AI UI generator: describe a UI and it produces front-end components, tuned for the React, Next.js and Tailwind ecosystem, that you can deploy straight to Vercel. It is fast and tightly integrated with that stack.' },
                { kind: 'p', text: 'It is closed-source and runs in the vendor cloud, billed by subscription and per-generation credits. Open Design is a different posture: a local-first, open-source design agent you point your own coding agent at — overlapping on prompt-to-UI, not on the Vercel-hosted pipeline.' },
                { kind: 'ul', items: [
                  'Vendor: Vercel (v0) — hosted SaaS',
                  'Pricing: subscription + per-generation credits',
                  'Primary output: hosted UI, plus code export',
                ] },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a v0 alternative',
              blocks: [
                { kind: 'p', text: 'Teams start looking past v0 when they want to own the output, control spend, use any agent and any stack, and keep design as portable, version-controlled assets.' },
                { kind: 'steps', items: [
                  { label: 'Own the output', body: 'UI should be files in your repo, not generations in a hosted project.' },
                  { label: 'BYOK economics', body: 'Bring your own provider key so API spend bills to your account, instead of per-generation credits on top of a subscription.' },
                  { label: 'Any agent, any stack', body: 'Drive design from the coding agent you already use, on the stack you choose — not a single vendor-managed model.' },
                  { label: 'Open source', body: 'Apache-2.0 and self-hostable: fork it, rebrand it for your studio, or embed it in CI.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'p', text: 'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine. Your UI is files, not hosted generations, and your brand lives in your repo as a portable DESIGN.md file every skill respects.' },
                { kind: 'p', text: 'You bring your own agent key. Credentials stay in local config or environment variables — Open Design never proxies them — and the API spend bills directly to you.' },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs v0, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'v0'], rows: [
                  ['Primary job', 'Design-first artifacts + portable brand', 'Prompt-to-hosted UI components'],
                  ['License', 'Apache-2.0, full source on GitHub', 'Closed-source, hosted product'],
                  ['Runtime', 'Local daemon on your machine', 'Vendor cloud'],
                  ['Agent', 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', 'Vendor-managed model'],
                  ['API spend', 'Bills to your account', 'Per-generation credits / subscription'],
                  ['Design system', 'Portable DESIGN.md in your repo', 'Per-project styling'],
                  ['Output ownership', 'Files in your project directory', 'Hosted project + code export'],
                  ['Self-host', 'Yes, run anywhere Node 24 runs', 'No'],
                  ['CLI / CI', 'Yes via od CLI + HTTP daemon', 'Web UI first'],
                ] },
                { kind: 'p', text: 'Where v0 wins: if you live in the Vercel, Next.js and React ecosystem and want UI generated and deployed in one tight hosted flow, v0 is built for exactly that. Open Design is design-first and stack-agnostic.' },
              ],
            },
            {
              id: 'who-picks',
              heading: 'Who should pick which',
              blocks: [
                { kind: 'p', text: 'Pick v0 if:' },
                { kind: 'ul', items: [
                  'You want UI generated tightly into the Vercel and React ecosystem.',
                  'You want to deploy straight to Vercel from the same flow.',
                  'You prefer a hosted generator and per-generation credits over local files.',
                ] },
                { kind: 'p', text: 'Pick Open Design if:' },
                { kind: 'ul', items: [
                  'You want design artifacts and a brand as version-controlled files.',
                  'You want BYOK with your existing coding agent, on any stack.',
                  'You want open source you can fork, rebrand, embed in CLI, or self-host.',
                  'You want one DESIGN.md per brand that every skill respects.',
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving a design from v0 into Open Design',
              blocks: [
                { kind: 'p', text: 'There is no automatic import from v0 today; start design-first with a one-time brand-extraction run.' },
                { kind: 'ol', items: [
                  'Install Open Design from the quickstart.',
                  'Open the web UI and point your agent at a v0 generation or screenshot you like.',
                  'Ask the agent to extract the brand into a DESIGN.md file.',
                  'Pick a skill and render it against your new brand.',
                ] },
                { kind: 'p', text: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'Is Open Design a drop-in replacement for v0?', text: 'No. v0 generates UI in Vercel’s hosted flow; Open Design is design-first and produces artifacts you own with any agent. They overlap on prompt-to-UI, not on the Vercel-hosted pipeline.' },
            { name: 'Does Open Design lock me to a stack?', text: 'No. BYOK with any supported agent, and your output is plain files in your repo — not tied to one framework or host.' },
            { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. API spend bills to your account and credentials are never proxied through us.' },
            { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
            { name: 'Is Open Design affiliated with v0 or Vercel?', text: 'No. Open Design is an independent, open-source project. v0 and Vercel are trademarks of their owner; this is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Design-first, in three commands.',
          ctaBody:
            'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
          ctaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      framer: {
        title: 'Open-source Framer alternative — Open Design (design-first, BYOK, local)',
        description:
          'Open Design is the open-source, local-first alternative to Framer for agent-driven design. BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen — your brand and artifacts live as files in your repo.',
        breadcrumb: 'Open-source Framer alternative',
        label: 'Alternative · Framer',
        heading: 'Open-source Framer alternative.',
        lead:
          'Framer is a hosted, no-code visual builder for designing and publishing sites. Open Design is a self-evolving design agent for Claude Code — local-first, BYOK, open source — where you drive design through your coding agent and keep a portable brand as files. Different shape, same goal: shipped interfaces.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Framer is a hosted no-code site builder; Open Design is an agent-driven, local-first, open-source design layer. If you want files in your repo and BYOK over a hosted canvas, Open Design is the alternative — and it is honest about where Framer wins.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Framer alternative',
        whyLead: 'A few reasons keep coming up when teams look past Framer:',
        reasons: [
          { label: 'Own the files.', body: 'Design should be version-controlled artifacts in your repo, not a project in a vendor cloud.' },
          { label: 'Open source.', body: 'Apache-2.0, self-hostable, rebrandable — not a closed, hosted SaaS.' },
          { label: 'Agent-driven.', body: 'Generate and iterate design with the coding agent you already use, instead of building every section by hand.' },
          { label: 'Not locked to one host.', body: 'Your output is files; deploy anywhere, not only the vendor’s hosting.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine — your designs are files, not a hosted project.',
          'You bring your own agent key; credentials stay local and never proxy through us, and API spend bills to you.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'How you design', od: 'Prompt your coding agent', cd: 'No-code visual builder, by hand' },
          { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Closed-source, hosted product' },
          { name: 'Runtime', od: 'Local daemon on your machine', cd: 'Vendor cloud' },
          { name: 'Output ownership', od: 'Files in your project directory', cd: 'Hosted project' },
          { name: 'Design system', od: 'Portable DESIGN.md in your repo', cd: 'Per-project styling' },
          { name: 'Hosting / deploy', od: 'You own deploy; not bundled', cd: 'Hosting included' },
          { name: 'Agent', od: 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', cd: 'Vendor-managed models' },
          { name: 'Self-host', od: 'Yes, run anywhere Node 24 runs', cd: 'No' },
          { name: 'CLI / CI', od: 'Yes via od CLI + HTTP daemon', cd: 'Web UI first' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Framer if',
        pickClaude: [
          'You want a no-code visual builder to design and publish a site.',
          'You want hosting included in one place.',
          'You prefer a hosted canvas over files and BYOK.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You want design artifacts and a brand as version-controlled files.',
          'You want BYOK with your existing coding agent.',
          'You want open source you can fork, rebrand, embed in CLI, or self-host.',
          'You want one DESIGN.md per brand that every skill respects.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'There is no automatic import from Framer today; start design-first with a one-time brand-extraction run:',
        migrateSteps: [
          'Install Open Design from the quickstart.',
          'Open the web UI and point your agent at a Framer site or screenshot you like.',
          'Ask the agent to extract the brand into a DESIGN.md file.',
          'Pick a skill and render it against your new brand.',
        ],
        migrateClosing: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Open Design a drop-in replacement for Framer?', text: 'No. Framer is a hosted no-code site builder; Open Design is an agent-driven, local-first design layer. They overlap on producing interfaces, not on no-code publishing and hosting.' },
          { name: 'Can Open Design publish a site like Framer?', text: 'Open Design produces design artifacts and code you own; you deploy them yourself. For an all-in-one no-code builder plus hosting, Framer is the better fit.' },
          { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. Credentials are never proxied through us.' },
          { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
          { name: 'Is Open Design affiliated with Framer?', text: 'No. Open Design is an independent, open-source project. Framer is a trademark of its owner; this is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Design-first, in three commands.',
        ctaBody:
          'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first design layer around the coding agent you already use — your key, your files, a curated skill and design-system library.',
          heroCtaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/framer/framer-hero.webp',
            alt: 'Open Design vs Framer — warm-paper editorial illustration of code converging into a design hub',
          },
          intro: [
            'Framer turns a hosted, no-code canvas into designed and published websites. Open Design is a self-evolving design agent for Claude Code and other coding agents — local-first, BYOK, Apache-2.0 — where you drive design through your agent and keep a portable brand as files in your own repo.',
            'This is an honest comparison: what Framer is, why teams look for an alternative, how local-first + BYOK changes the shape of the work, a feature-by-feature table, who should pick which, and how to move a design across. It is candid about where Framer wins.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-framer', label: 'What Framer is' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'who-picks', label: 'Who picks which' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-framer',
              heading: 'What Framer is',
              blocks: [
                { kind: 'p', text: 'Framer is a hosted, no-code visual builder for designing and publishing websites: a canvas you lay out by hand, with components, CMS, AI features, and one-place hosting. It is strong at taking a marketing site from design to live without writing code.' },
                { kind: 'p', text: 'It is closed-source and runs in the vendor cloud, billed by subscription. Open Design is a different posture: a local-first, open-source design agent you point your own coding agent at — overlapping on producing interfaces, not on no-code publishing and hosting.' },
                { kind: 'ul', items: [
                  'Vendor: Framer — hosted SaaS',
                  'Pricing: subscription (per site / plan)',
                  'Primary output: a published, hosted site',
                ] },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Framer alternative',
              blocks: [
                { kind: 'p', text: 'Teams start looking past Framer when they want design to be files they own, generated by the agent they already use, deployable anywhere, rather than a project that lives in (and publishes from) a vendor cloud.' },
                { kind: 'steps', items: [
                  { label: 'Own the files', body: 'Design should be version-controlled artifacts in your repo, not a hosted project.' },
                  { label: 'Open source', body: 'Apache-2.0 and self-hostable: fork it, rebrand it for your studio, or embed it in CI — not a closed hosted SaaS.' },
                  { label: 'Agent-driven', body: 'Generate and iterate design with the coding agent you already use, instead of building every section by hand.' },
                  { label: 'Not locked to one host', body: 'Your output is files; deploy anywhere, not only the vendor’s hosting.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'p', text: 'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine. Your designs are files, not a hosted project, and your brand lives in your repo as a portable DESIGN.md file every skill respects.' },
                { kind: 'p', text: 'You bring your own agent key. Credentials stay in local config or environment variables — Open Design never proxies them — and the API spend bills directly to you.' },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Framer, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Framer'], rows: [
                  ['How you design', 'Prompt your coding agent', 'No-code visual builder, by hand'],
                  ['License', 'Apache-2.0, full source on GitHub', 'Closed-source, hosted product'],
                  ['Runtime', 'Local daemon on your machine', 'Vendor cloud'],
                  ['Output ownership', 'Files in your project directory', 'Hosted project'],
                  ['Design system', 'Portable DESIGN.md in your repo', 'Per-project styling'],
                  ['Hosting / deploy', 'You own deploy; not bundled', 'Hosting included'],
                  ['Agent', 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', 'Vendor-managed models'],
                  ['Self-host', 'Yes, run anywhere Node 24 runs', 'No'],
                  ['CLI / CI', 'Yes via od CLI + HTTP daemon', 'Web UI first'],
                ] },
                { kind: 'p', text: 'Where Framer wins: if you want a no-code visual builder that designs and publishes a marketing site with hosting included, Framer does that end to end. Open Design is design-first and agent-driven instead.' },
              ],
            },
            {
              id: 'who-picks',
              heading: 'Who should pick which',
              blocks: [
                { kind: 'p', text: 'Pick Framer if:' },
                { kind: 'ul', items: [
                  'You want a no-code visual builder to design and publish a site.',
                  'You want hosting included in one place.',
                  'You prefer a hosted canvas over files and BYOK.',
                ] },
                { kind: 'p', text: 'Pick Open Design if:' },
                { kind: 'ul', items: [
                  'You want design artifacts and a brand as version-controlled files.',
                  'You want BYOK with your existing coding agent.',
                  'You want open source you can fork, rebrand, embed in CLI, or self-host.',
                  'You want one DESIGN.md per brand that every skill respects.',
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving a design from Framer into Open Design',
              blocks: [
                { kind: 'p', text: 'There is no automatic import from Framer today; start design-first with a one-time brand-extraction run.' },
                { kind: 'ol', items: [
                  'Install Open Design from the quickstart.',
                  'Open the web UI and point your agent at a Framer site or screenshot you like.',
                  'Ask the agent to extract the brand into a DESIGN.md file.',
                  'Pick a skill and render it against your new brand.',
                ] },
                { kind: 'p', text: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'Is Open Design a drop-in replacement for Framer?', text: 'No. Framer is a hosted no-code site builder; Open Design is an agent-driven, local-first design layer. They overlap on producing interfaces, not on no-code publishing and hosting.' },
            { name: 'Can Open Design publish a site like Framer?', text: 'Open Design produces design artifacts and code you own; you deploy them yourself. For an all-in-one no-code builder plus hosting, Framer is the better fit.' },
            { name: 'Which agent does Open Design use?', text: 'Your choice — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. Credentials are never proxied through us.' },
            { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
            { name: 'Is Open Design affiliated with Framer?', text: 'No. Open Design is an independent, open-source project. Framer is a trademark of its owner; this is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Design-first, in three commands.',
          ctaBody:
            'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
          ctaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      'claude-design': {
        title: 'Open-source Claude Design alternative — Open Design (BYOK, local-first)',
        description:
          'Open Design is the open-source, local-first alternative to Claude Design. BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen — your skills and DESIGN.md live in your repo.',
        breadcrumb: 'Open-source Claude Design alternative',
        label: 'Alternative · Claude Design',
        heading: 'Open-source Claude Design alternative.',
        lead:
          'Open Design is the open-source, local-first alternative to Claude Design. Same use case — prompt to design artifact — different posture: BYOK with the agent you already use, keep your brand as a portable DESIGN.md file, and ship artifacts as files in your project.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Same job, different posture: local-first, BYOK, open source (Apache-2.0), with portable DESIGN.md systems and composable SKILL.md skills. Honest about where a hosted product is more convenient.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Claude Design alternative',
        whyLead: 'A few reasons keep showing up in support threads, GitHub discussions, and Discord:',
        reasons: [
          { label: 'Data ownership.', body: 'Designs should live as files in a repo, not documents in a vendor DB.' },
          { label: 'BYOK economics.', body: 'Bring your own provider key; API spend bills to your account.' },
          { label: 'Agent choice.', body: 'Drive design from the agent you already use for code.' },
          { label: 'Brand portability.', body: 'One DESIGN.md file encodes a brand for every skill.' },
          { label: 'Self-host / fork.', body: 'Apache-2.0, full source, rebrandable for your studio or company.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Open Design runs a desktop app, a local daemon, and Markdown skill/system catalogs on your machine — no design output is forced through a vendor cloud.',
          'You bring your own agent key; credentials stay in local config or environment variables, and API spend bills to you.',
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
          { name: 'Artifact ownership', od: 'Files in your project directory', cd: 'Vendor-hosted documents' },
          { name: 'CLI / CI', od: 'Yes via od CLI + HTTP daemon', cd: 'Web UI only' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Claude Design if',
        pickClaude: [
          'You want zero local setup and one vendor bill.',
          'You are already deep in a Claude-first hosted workflow.',
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
        migrateClosing: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Open Design really a drop-in alternative to Claude Design?', text: 'Not literally, but they overlap on prompt-to-design-artifact use cases.' },
          { name: 'Can I use Claude as my agent in Open Design?', text: 'Yes. Open Design supports Claude Code and Anthropic API BYOK flows; credentials are never proxied through us.' },
          { name: 'What happens to my Claude Design designs?', text: 'You can keep using Claude Design alongside Open Design; migration is manual today.' },
          { name: 'Does Open Design generate the same artifact types?', text: 'Yes for common types: landing pages, decks, dashboards, social posts, brand systems, and prototypes.' },
          { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
          { name: 'Is Open Design affiliated with Anthropic or Claude?', text: 'No. Open Design is an independent, open-source project. Claude is a trademark of Anthropic; this is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Switch in three commands.',
        ctaBody:
          'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first design layer around the coding agent you already use — your key, your files, a curated skill and design-system library.',
          heroCtaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/claude-design/claude-design-hero.webp',
            alt: 'Open Design vs Claude Design — warm-paper editorial illustration of code converging into a design hub',
          },
          intro: [
            'Claude Design is a hosted, vendor-managed product for prompt-to-design work. Open Design is a self-evolving design agent for Claude Code and other coding agents — local-first, BYOK, Apache-2.0 — that keeps your skills and a portable brand as files in your own repo.',
            'This is an honest comparison: why teams look for an alternative, how local-first + BYOK changes the economics, a feature-by-feature table, who should pick which, and how to move a design across. It is candid about where a hosted product is more convenient.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-claude-design', label: 'What Claude Design is' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'who-picks', label: 'Who picks which' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-claude-design',
              heading: 'What Claude Design is',
              blocks: [
                { kind: 'p', text: 'Claude Design is a hosted, vendor-managed product for turning prompts into design artifacts, tied to a single vendor’s cloud and agent. It is convenient: zero local setup, one bill, a hosted UI.' },
                { kind: 'p', text: 'Open Design is a different posture: a local-first, open-source design agent you point your own coding agent at — overlapping on the prompt-to-design-artifact job, not on being a hosted product.' },
                { kind: 'ul', items: [
                  'Vendor: hosted SaaS, single-vendor agent',
                  'Pricing: bundled into a vendor subscription',
                  'Primary output: vendor-hosted documents',
                ] },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Claude Design alternative',
              blocks: [
                { kind: 'p', text: 'These reasons keep showing up in support threads, GitHub discussions, and Discord:' },
                { kind: 'steps', items: [
                  { label: 'Data ownership', body: 'Designs should live as files in a repo, not documents in a vendor DB.' },
                  { label: 'BYOK economics', body: 'Bring your own provider key so API spend bills to your account instead of a bundled subscription.' },
                  { label: 'Agent choice', body: 'Drive design from the agent you already use for code — Claude Code, Codex, Cursor, and more.' },
                  { label: 'Self-host / fork', body: 'Apache-2.0, full source, rebrandable for your studio or company.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'p', text: 'Open Design runs a desktop app, a local daemon, and Markdown skill/system catalogs on your machine. No design output is forced through a vendor cloud, and your brand lives in your repo as a portable DESIGN.md file every skill respects.' },
                { kind: 'p', text: 'You bring your own agent key. Credentials stay in local config or environment variables — Open Design never proxies them — and the API spend bills directly to you.' },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Claude Design, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Claude Design'], rows: [
                  ['License', 'Apache-2.0, full source on GitHub', 'Closed-source, hosted product'],
                  ['Runtime', 'Local daemon on your machine', 'Vendor cloud'],
                  ['Agent', 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', 'Vendor-managed agent'],
                  ['API spend', 'Bills to your account', 'Bundled into vendor subscription'],
                  ['Design system', 'Portable DESIGN.md in your repo', 'Stored in vendor DB'],
                  ['Skills', 'Composable SKILL.md you can fork', 'Built-in templates'],
                  ['Self-host', 'Yes, run anywhere Node 24 runs', 'No'],
                  ['Artifact ownership', 'Files in your project directory', 'Vendor-hosted documents'],
                  ['CLI / CI', 'Yes via od CLI + HTTP daemon', 'Web UI only'],
                ] },
                { kind: 'p', text: 'Where Claude Design wins: zero local setup, one vendor bill, and a hosted UI. If that convenience is the priority, a hosted product is hard to beat — Open Design trades it for ownership, BYOK, and open source.' },
              ],
            },
            {
              id: 'who-picks',
              heading: 'Who should pick which',
              blocks: [
                { kind: 'p', text: 'Pick Claude Design if:' },
                { kind: 'ul', items: [
                  'You want zero local setup and one vendor bill.',
                  'You are already deep in a Claude-first hosted workflow.',
                  'Your team prefers a hosted UI over Markdown files.',
                ] },
                { kind: 'p', text: 'Pick Open Design if:' },
                { kind: 'ul', items: [
                  'You want design artifacts as version-controlled files.',
                  'You want BYOK with your existing coding agent.',
                  'You want to fork, rebrand, embed in CLI, or self-host.',
                  'You want one DESIGN.md per brand that every skill respects.',
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving a design from Claude Design into Open Design',
              blocks: [
                { kind: 'p', text: 'There is no automatic import from Claude Design today; use a one-time brand-extraction run.' },
                { kind: 'ol', items: [
                  'Install Open Design from the quickstart.',
                  'Open the web UI and point your agent at a Claude Design artifact you like.',
                  'Ask the agent to extract the brand into a DESIGN.md file.',
                  'Pick a skill and render it against your new brand.',
                ] },
                { kind: 'p', text: 'From then on, every skill renders in your brand without re-prompting — and the files stay in your repo.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'Is Open Design really a drop-in alternative to Claude Design?', text: 'Not literally, but they overlap on prompt-to-design-artifact use cases.' },
            { name: 'Can I use Claude as my agent in Open Design?', text: 'Yes. Open Design supports Claude Code and Anthropic API BYOK flows; credentials are never proxied through us.' },
            { name: 'What happens to my Claude Design designs?', text: 'You can keep using Claude Design alongside Open Design; migration is manual today.' },
            { name: 'Does Open Design generate the same artifact types?', text: 'Yes for common types: landing pages, decks, dashboards, social posts, brand systems, and prototypes.' },
            { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable.' },
            { name: 'Is Open Design affiliated with Anthropic or Claude?', text: 'No. Open Design is an independent, open-source project. Claude is a trademark of Anthropic; this is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Switch in three commands.',
          ctaBody:
            'Star the repo, grab the desktop build, or run the install in your terminal. Your DESIGN.md system stays in your repo from the first render onward.',
          ctaActions: [
            { label: 'Get started', href: '/quickstart/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
            { label: 'Download the desktop app', href: 'https://github.com/nexu-io/open-design/releases', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
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
  // Non-default locales always prefer the localized translation. Some
  // hand-written locale copies inherit en's `alternatives` map, so we must
  // not let that English copy win over the localized shard.
  if (locale !== DEFAULT_LOCALE) {
    const localized = LOCALIZED_ALTERNATIVES[locale]?.[slug];
    if (localized) return localized;
  }
  return (
    INFO_PAGE_COPY[locale]?.alternatives?.[slug] ??
    INFO_PAGE_COPY[DEFAULT_LOCALE]!.alternatives?.[slug]
  );
}

export const quickstartCode = QUICKSTART_CODE;
