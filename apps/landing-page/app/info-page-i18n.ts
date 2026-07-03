import {
  DEFAULT_LOCALE,
  getCommonCopy,
  getHomePageCopy,
  getLandingUiCopy,
  type LandingLocaleCode,
} from './i18n';
import { buildLocalizedAgentGuides } from './agent-guides.i18n';
import { EN_AGENT_GUIDES } from './agent-guides.en.i18n';
import { ZH_AGENT_GUIDES } from './agent-guides.zh.i18n';
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
export type AgentRichBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ol'; items: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'steps'; items: LinkText[] } // bolded label + body
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'image'; src: string; alt: string; caption?: string }
  | {
      // Image + prose side by side (editorial two-column). Stacks on mobile.
      kind: 'split';
      imageSide: 'left' | 'right';
      image: { src: string; alt: string; caption?: string };
      text: string[]; // paragraphs, rendered as set:html (may contain <a>)
    }
  | {
      kind: 'table';
      columns: string[];
      rows: string[][];
      compact?: boolean; // narrow tables (e.g. a decision matrix) — cap width, no sprawl
    };

export type AgentRichSection = {
  // Stable anchor id used by the on-this-page TOC and deep links.
  id: string;
  heading: string;
  blocks: AgentRichBlock[];
};

// One head CTA action. `variant: 'primary'` is the highlighted button.
export type AgentCtaAction = {
  label: string;
  href: string;
  variant: 'primary' | 'ghost';
  external?: boolean;
};

// Optional long-form payload. When present, the detail page renders the
// industrial how-to layout (hero CTA + deep sections) instead of the
// short default layout. Only pages that opt in carry this; the rest keep
// the compact shape below untouched.
export type AgentRichCopy = {
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

export type AgentGuideCopy = {
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
      title: 'Open Design agents — {count} BYOK adapters',
      description:
        'Open Design ships {count} BYOK adapters out of the box. Drive design from the same agent you use for code — no separate vendor login.',
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      stitch: {
        title: 'Best Google Stitch alternative for design — Open Design',
        description:
          'Google Stitch is a free Gemini-powered UI generator from Google Labs, capped at ~350 standard generations/month in a hosted canvas. Open Design is the open-source, local-first alternative — BYOK, no Google account, design system as files you own.',
        breadcrumb: 'Best Google Stitch alternative',
        label: 'Alternative · Google Stitch',
        heading: 'Best Google Stitch alternative for design.',
        lead:
          'Google Stitch turns a prompt into a polished, Gemini-generated UI inside a hosted Google Labs canvas — free, but capped at ~350 standard generations a month and tied to a Google account. Open Design is a local-first, open-source design agent you point your own coding agent at: same prompt-to-UI surface, but the source, the design system, and the output stay as files you own.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Google Stitch is a free, Gemini 3-powered UI generator from Google Labs — fast first drafts, Figma paste, HTML/CSS and React export, but cloud-only, closed-source, monthly generation caps, and no enforceable design system. Open Design is the open-source, local-first alternative: BYOK with your own coding agent, a portable DESIGN.md brand in your repo, and no account gating. This page is honest about where Stitch genuinely wins.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Google Stitch alternative',
        whyLead: 'A few specific frustrations keep showing up once teams move past the first few Stitch drafts:',
        reasons: [
          { label: 'Generation caps you cannot lift.', body: 'The free tier runs roughly 350 standard generations (Gemini 2.5 Flash) plus a much smaller experimental pool (Gemini 2.5 Pro) per month, with no paid tier and no way to add your own API key for more — designers report hitting the wall mid-iteration.' },
          { label: 'No enforceable design system.', body: 'You cannot upload a brand kit, token set, or component library that Stitch obeys across generations. Brand colors must be re-prompted as hex values every time, and the same prompt produces a different result on each run.' },
          { label: 'Cloud-only and account-gated.', body: 'Stitch lives entirely at stitch.withgoogle.com behind a Google sign-in. There is no local mode, no self-host, and your work is state inside a Google Labs project rather than files in your repo.' },
          { label: 'Closed-source, not embeddable.', body: 'Stitch is a closed Google Labs experiment with no public API — you cannot fork it, run it in CI, or drive it from the coding agent you already use. Design stays in a separate browser tab, disconnected from your codebase.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your own machine — no design output is forced through a vendor cloud, and your brand lives in your repo as a portable DESIGN.md file every skill respects. There is no monthly generation cap baked into the product.',
          'You bring your own agent key — Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen. Credentials stay in local config or environment variables (Open Design never proxies them), model spend bills directly to your provider account, and you can drive everything from the od CLI or the local HTTP daemon, not just a web UI.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Closed-source Google Labs experiment' },
          { name: 'Runtime', od: 'Local daemon on your machine', cd: 'Cloud-only (stitch.withgoogle.com)' },
          { name: 'Account', od: 'None required; runs locally', cd: 'Google account sign-in required' },
          { name: 'Pricing / limits', od: 'Free; you pay your own model API spend, no app-level cap', cd: 'Free; ~350 standard + smaller experimental generations per month, no paid tier' },
          { name: 'Model', od: 'BYOK — Claude, GPT/Codex, Gemini, Qwen, and more', cd: 'Gemini (Flash standard / Pro experimental; Gemini 3 added Dec 2025)' },
          { name: 'Output formats', od: 'Real files: HTML/CSS, React, decks, design-system DESIGN.md', cd: 'HTML/CSS + React export, paste-to-Figma' },
          { name: 'Design system', od: 'Portable DESIGN.md every skill enforces', cd: 'No enforceable brand kit; re-prompt hex each time' },
          { name: 'Portability', od: 'Files in your project directory / git', cd: 'Hosted project state + manual export' },
          { name: 'Self-host', od: 'Yes, anywhere Node 24 runs', cd: 'No' },
          { name: 'Code ownership', od: 'Output lands in your repo, you own it', cd: 'Exported snapshot; tool not in your workflow' },
          { name: 'Flows vs screens', od: 'Multi-artifact projects, prototypes, decks', cd: 'Screens + multi-screen Prototypes canvas (2025–26)' },
          { name: 'CLI / CI / API', od: 'od CLI + local HTTP daemon', cd: 'Web canvas only; no public API' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Google Stitch if',
        pickClaude: [
          'You want a free, zero-setup UI generator backed by Google and Gemini, and a Google account is no obstacle.',
          'You value polished first drafts and a clean paste-into-Figma handoff over owning the source.',
          'Your volume fits comfortably inside the monthly generation caps, and a hosted canvas suits how you work.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You want the UI, code, and design system as version-controlled files you own — not state in a hosted project.',
          'You want BYOK with your existing coding agent and no per-month generation cap or Google account.',
          'You need open source you can fork, rebrand, self-host, or embed in CI and the od CLI.',
          'You want one DESIGN.md per brand that every render respects, instead of re-prompting hex codes.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'There is no automatic import from Google Stitch today, so start design-first with a one-time brand-extraction run:',
        migrateSteps: [
          'Install Open Design from the download page and bring your own agent key (Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen).',
          'Open the web UI and point your agent at a Stitch HTML/CSS export, Figma paste, or screenshot you like the look of.',
          'Ask the agent to extract the brand — colors, type, spacing — into a DESIGN.md file in your repo.',
          'Pick a skill and render it against your new brand; from then on every skill reuses it without re-prompting.',
        ],
        migrateClosing:
          'From then on, every skill renders in your brand without re-prompting hex codes — and the files stay in your repo under version control.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'What are Google Stitch’s generation limits?', text: 'Stitch’s free tier runs roughly 350 standard generations per month on Gemini 2.5 Flash, plus a smaller experimental pool on Gemini 2.5 Pro (commonly reported around 50). Reports through 2026 show the cap shifting and sometimes resetting daily; either way there is no paid tier to raise it and no bring-your-own-key option. Open Design has no app-level cap — you pay your own model API spend.' },
          { name: 'Is Google Stitch free?', text: 'Yes. Stitch is a free Google Labs experiment with no subscription, but it requires a Google account and the work lives in Google’s cloud. Open Design is also free and open source (Apache-2.0); you bring your own agent key, so model spend bills to you with no vendor cap.' },
          { name: 'Can I self-host an alternative to Google Stitch?', text: 'Stitch is cloud-only and closed-source — there is no self-host option. Open Design runs locally and self-hosts anywhere Node 24 runs, with full source on GitHub under Apache-2.0.' },
          { name: 'How does export compare?', text: 'Stitch exports HTML/CSS and React and supports paste-into-Figma (auto-layout, named layers, editable text — a real starting point, not pixel-perfect). Open Design writes real files into your repo — HTML/CSS, React, decks, and a portable DESIGN.md — that you own and version directly.' },
          { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable. Google Stitch is a closed-source Google Labs product.' },
          { name: 'Is Open Design affiliated with Google or Stitch?', text: 'No. Open Design is an independent, open-source project. Google Stitch is a product of Google Labs (built on the 2025 Galileo AI acquisition); this is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Own your design, in three commands.',
        ctaBody:
          'Star the repo, grab the desktop build, or run the install in your terminal. No generation cap, no Google account — your DESIGN.md system stays in your repo from the first render onward.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first alternative to Google Stitch — prompt-to-UI with the coding agent you already use, your key, your files, and a portable design system you keep in your repo.',
          heroCtaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/stitch/stitch-hero.webp',
            alt: 'Open Design vs Google Stitch — warm-paper editorial illustration of a prompt converging into a design hub you own',
          },
          intro: [
            'Google Stitch is a Google Labs design tool that turns a natural-language prompt — or a screenshot, sketch, or voice description — into a high-fidelity UI, generated by Gemini inside a hosted canvas. It launched at Google I/O in May 2025 on the back of Google’s <b>Galileo AI</b> acquisition, gained <b>Gemini 3</b> and a multi-screen "Prototypes" canvas through late 2025, and is genuinely good at producing a clean first draft fast. It is also <b>free</b> — with the catch that it is cloud-only, tied to a Google account, and capped at roughly <b>350 standard generations a month</b>.',
            'Open Design is the <b>open-source, local-first</b> alternative: a design agent you point <b>your own coding agent</b> at (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) over BYOK. Same prompt-to-UI surface — but the source, the design system, and the output stay as <b>files you own</b> in your repo, with no per-month cap and no vendor sign-in. This page is honest about where Stitch genuinely wins and where Open Design does.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-stitch', label: 'What Google Stitch is' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'decision', label: 'Which to pick' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-stitch',
              heading: 'What Google Stitch is',
              blocks: [
                { kind: 'p', text: 'Google Stitch (<a href="https://stitch.withgoogle.com" target="_blank" rel="noopener">stitch.withgoogle.com</a>) is a Google Labs design tool that converts a natural-language prompt — or an uploaded image, sketch, screenshot, or voice description — into a high-fidelity web or mobile UI, with Gemini doing the design work as you direct it by conversation. It runs entirely in the browser, requires a Google account, and is free. Under the hood it began life as <b>Galileo AI</b>, the prompt-to-UI startup Google acquired and relaunched as Stitch at Google I/O in May 2025.' },
                { kind: 'split', imageSide: 'right', image: { src: '/alternatives/stitch/stitch-product.webp', alt: 'Google Stitch — describe a UI in natural language and Gemini generates it in a hosted canvas', caption: 'Google Stitch: describe a UI and Gemini generates it in a hosted canvas (screenshot: stitch.withgoogle.com).' }, text: [
                  'Stitch runs in <b>two modes</b>: a <b>Standard</b> mode on Gemini 2.5 Flash for fast generation (roughly <b>350 generations a month</b>) and an <b>Experimental</b> mode on Gemini 2.5 Pro for higher fidelity with a much smaller monthly pool (commonly reported around 50). A December 2025 update brought <b>Gemini 3</b> for sharper layouts, and a multi-screen <b>Prototypes</b> canvas lets you stitch screens into a clickable flow.',
                  'For output, Stitch exports <b>HTML/CSS</b> and <b>React</b>, and supports <b>paste-into-Figma</b> with auto-layout, named layers, and editable text — a real starting point to refine, not a flat screenshot. What it does not have: a paid tier to lift the cap, a bring-your-own-key option, an enforceable design system, or any local / self-host mode.',
                ] },
                { kind: 'ul', items: [
                  'Vendor: Google Labs — cloud-only at stitch.withgoogle.com, Google account required, closed-source',
                  'Model: Gemini (2.5 Flash standard / 2.5 Pro experimental; Gemini 3 added Dec 2025)',
                  'Pricing: free, no paid tier — capped at ~350 standard + a smaller experimental pool per month',
                  'Output: high-fidelity screens + multi-screen Prototypes; HTML/CSS and React export, paste-to-Figma',
                ] },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Google Stitch, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Google Stitch'], rows: [
                  ['License', 'Apache-2.0, full source on GitHub', 'Closed-source Google Labs experiment'],
                  ['Runtime', 'Local daemon on your machine', 'Cloud-only (stitch.withgoogle.com)'],
                  ['Account', 'None required; runs locally', 'Google account sign-in required'],
                  ['Pricing / limits', 'Free; your own model API spend, no app-level cap', 'Free; ~350 standard + smaller experimental gens/month, no paid tier'],
                  ['Model', 'BYOK — Claude, GPT/Codex, Gemini, Qwen, more', 'Gemini (Flash standard / Pro experimental; Gemini 3 Dec 2025)'],
                  ['Output formats', 'Real files: HTML/CSS, React, decks, DESIGN.md', 'HTML/CSS + React export, paste-to-Figma'],
                  ['Portability', 'Files in your project dir / git', 'Hosted project state + manual export'],
                  ['Self-host', 'Yes, anywhere Node 24 runs', 'No'],
                  ['Design system', 'Portable DESIGN.md every skill enforces', 'No enforceable brand kit; re-prompt hex each time'],
                  ['Code ownership', 'Lands in your repo, you own it', 'Exported snapshot; tool not in your codebase'],
                  ['Flows vs screens', 'Multi-artifact projects, prototypes, decks', 'Screens + multi-screen Prototypes canvas'],
                  ['CLI / CI / API', 'od CLI + local HTTP daemon', 'Web canvas only; no public API'],
                ] },
                { kind: 'p', text: 'Read it honestly: Stitch wins on <b>zero-setup speed</b> and a <b>free, Gemini-backed first draft</b> with a clean Figma paste. Open Design wins everywhere the work has to <b>outlive the draft</b> — open source, local-first, no monthly cap, BYOK with the agent you already use, and a design system that lives as files in your repo instead of styling you re-prompt every session.' },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Google Stitch alternative',
              blocks: [
                { kind: 'p', text: 'Stitch is a great way to get a first screen on the canvas. The frustrations start once you iterate hard, need brand consistency, or want the design to live inside your codebase — exactly the points where a hosted Labs experiment is structurally limited.' },
                { kind: 'steps', items: [
                  { label: 'You run out of generations', body: 'The ~350 standard generations a month, plus a much smaller experimental pool, sound generous until you are iterating on a real project. There is no paid tier and no bring-your-own-key escape hatch — so heavy days mean waiting for a reset. Open Design has no app-level cap; you pay your own model spend and keep going.' },
                  { label: 'The brand never sticks', body: 'Stitch has no enforceable design system: you re-prompt brand colors as hex values every time, the same prompt yields a different result each run, and navigation can drift between screens. Open Design centralizes brand in one DESIGN.md that every render obeys, so iterations stay consistent.' },
                  { label: 'It lives in a separate tab', body: 'Design happens in Stitch’s cloud canvas, disconnected from your repo — you export a snapshot and re-integrate by hand, with no API to wire it into CI or an agent loop. Open Design output lands as files in your project and is drivable from the od CLI and local HTTP daemon.' },
                  { label: 'You cannot own or fork it', body: 'Stitch is closed-source and Google-hosted: no self-host, no audit, no rebrand for your studio. Open Design is Apache-2.0 — fork it, run it on your own machine, embed it in pipelines, and own every artifact it produces.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'split', imageSide: 'left', image: { src: '/alternatives/stitch/stitch-design-systems.webp', alt: 'The Open Design design-system library — brands and tokens kept as files you own', caption: 'Your design system lives as files in Open Design — portable, versioned, rendered by every skill.' }, text: [
                  'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs <b>on your machine</b>. No design output is forced through a vendor cloud, and your brand lives in your repo as a <b>portable DESIGN.md</b> file every skill respects.',
                  'You <b>bring your own agent key</b>. Credentials stay in local config or environment variables — Open Design never proxies them — and the API spend <b>bills directly to you</b>.',
                ] },
                { kind: 'p', text: 'New to the idea? Read <a href="/blog/what-is-vibe-design/">what vibe design is</a>, browse the <a href="/plugins/">plugin and design-system library</a>, see <a href="/compare/">all Open Design comparisons</a> — including <a href="/alternatives/figma/">Figma</a> and <a href="/alternatives/lovable/">Lovable</a> — or <a href="/download/">download Open Design</a> to try it.' },
              ],
            },
            {
              id: 'decision',
              heading: 'Where Google Stitch genuinely wins — and which to pick',
              blocks: [
                { kind: 'p', text: 'Credit where it is due: for a <b>fast, free first draft</b>, Stitch is hard to beat. It is zero-setup (sign in with a Google account and type), Gemini 3 produces clean, on-trend layouts from a sentence or a screenshot, and the <b>paste-into-Figma</b> handoff gives designers a real, editable starting point rather than a flat image. If your job is to get a polished concept screen in front of someone in two minutes and you are happy living in a hosted canvas, Stitch does that exceptionally well — and the price is zero. The trade-off is everything that comes after the draft: the cap, the missing design system, and the fact that the output never lives in your codebase.' },
                { kind: 'p', text: 'A quick way to decide by what you actually want to do — <b>most paths point to Open Design</b>, but the honest exceptions are listed too:' },
                { kind: 'table', compact: true, columns: ['If you want to…', 'Best pick'], rows: [
                  ['Own your UI, code, and design system as files in git', 'Open Design'],
                  ['Iterate heavily without a monthly generation cap', 'Open Design'],
                  ['Enforce one brand (DESIGN.md) across every render', 'Open Design'],
                  ['Run open-source you can self-host, fork, or rebrand', 'Open Design'],
                  ['Drive design from your coding agent / CLI / CI (BYOK)', 'Open Design'],
                  ['Get a free, zero-setup first draft in two minutes', 'Google Stitch'],
                  ['Paste a quick concept straight into Figma to refine', 'Google Stitch'],
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving a design from Google Stitch into Open Design',
              blocks: [
                { kind: 'p', text: 'There is no automatic import from Google Stitch today, so start design-first with a one-time brand-extraction run — it takes a few minutes and pays off on every render after.' },
                { kind: 'ol', items: [
                  'Install Open Design from the download page and bring your own agent key (Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen).',
                  'Open the web UI and point your agent at a Stitch HTML/CSS export, Figma paste, or screenshot whose look you want to keep.',
                  'Ask the agent to extract the brand — colors, type, spacing — into a DESIGN.md file in your repo.',
                  'Pick a skill and render it against your new brand to confirm it matches.',
                ] },
                { kind: 'p', text: 'From then on, every skill renders in your brand <b>without re-prompting hex codes</b> — and the files stay in your repo under version control.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'What are Google Stitch’s generation limits?', text: 'Stitch’s free tier runs roughly 350 standard generations per month on Gemini 2.5 Flash, plus a smaller experimental pool on Gemini 2.5 Pro (commonly reported around 50). Reports through 2026 show the cap shifting and at times resetting daily; either way there is no paid tier to raise it and no bring-your-own-key option. Open Design has no app-level cap — you pay your own model API spend and keep going.' },
            { name: 'Is Google Stitch free?', text: 'Yes. Stitch is a free Google Labs experiment with no subscription, but it requires a Google account and the work lives in Google’s cloud. Open Design is also free and open source (Apache-2.0); you bring your own agent key, so model spend bills to you with no vendor-set cap.' },
            { name: 'Can I self-host an alternative to Google Stitch?', text: 'Stitch is cloud-only and closed-source — there is no self-host option. Open Design runs locally and self-hosts anywhere Node 24 runs, with full source on GitHub under Apache-2.0.' },
            { name: 'How does export compare?', text: 'Stitch exports HTML/CSS and React and supports paste-into-Figma (auto-layout, named layers, editable text — a real starting point, not pixel-perfect). Open Design writes real files into your repo — HTML/CSS, React, decks, and a portable DESIGN.md — that you own and version directly.' },
            { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable. Google Stitch is a closed-source Google Labs product.' },
            { name: 'Is Open Design affiliated with Google or Stitch?', text: 'No. Open Design is an independent, open-source project. Google Stitch is a product of Google Labs (built on the 2025 Galileo AI acquisition); this is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Own your design, in three commands.',
          ctaBody:
            'Star the repo, grab the desktop build, or run the install in your terminal. No generation cap, no Google account — your DESIGN.md system stays in your repo from the first render onward.',
          ctaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      genspark: {
        title: 'Best Genspark AI Designer alternative for design — Open Design',
        description:
          'Looking for a Genspark AI Designer alternative for product design? Open Design is an open-source, local-first design agent. Drive it with your own coding agent (BYOK) and own every file — UI, code, and design system — in your repo.',
        breadcrumb: 'Best Genspark AI Designer alternative',
        label: 'Alternative · Genspark AI Designer',
        heading: 'Best Genspark AI Designer alternative for design.',
        lead:
          'Genspark AI Designer (launched Aug 2025) is Genspark\'s one-prompt design product — strongest at graphic and marketing design: logos, posters, social graphics, packaging, whole brand systems. Open Design is an open-source, local-first design agent for product UI: your coding agent, your key, files you own.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Genspark AI Designer is a closed, credit-metered SaaS that excels at marketing graphics in one shot. Open Design is the open-source (Apache-2.0), local-first alternative for product UI: BYOK with your own agent, a portable DESIGN.md in your repo, and output you keep as files. They do different jobs — this page is honest about where Genspark wins.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Genspark alternative',
        whyLead: 'A few reasons keep showing up when teams look past Genspark for product UI:',
        reasons: [
          { label: 'Product UI, not marketing graphics.', body: 'Genspark AI Designer is built for posters, logos and social assets. If the job is screens, flows, components and a design system — plus the code behind them — that is a different deliverable.' },
          { label: 'Own the output as files.', body: 'Genspark assets live in its cloud (AI Drive) tied to an account. Open Design writes UI, code and design tokens as files in your repo that you keep whether or not you keep the tool.' },
          { label: 'Open source.', body: 'Genspark is closed-source SaaS. Open Design is Apache-2.0 — read it, fork it, run it locally, audit what touches your designs.' },
          { label: 'BYOK over metered credits.', body: 'Genspark meters every generation in credits (and reviewers report being charged for failed or low-quality retries). Open Design runs on your own coding agent and key, so spend is just provider rates.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Open Design runs a desktop app, a local daemon, and Markdown skill and design-system catalogs on your machine. Output lands as files in your repo, and your brand lives as a portable DESIGN.md every skill respects.',
          'You bring your own agent key (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen). Credentials stay local and API spend bills to you.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'Primary job', od: 'Product UI design + the code behind it', cd: 'Graphic & marketing design (logos, posters, social, packaging, brand systems)' },
          { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Closed-source / proprietary' },
          { name: 'Runtime', od: 'Local-first on your machine', cd: 'Hosted SaaS in Genspark cloud' },
          { name: 'Account', od: 'None required — runs locally', cd: 'Genspark account required' },
          { name: 'Pricing', od: 'Free, open source (you pay your own model usage)', cd: 'Free tier, then Plus $24.99/mo & Pro $249.99/mo' },
          { name: 'Credits', od: 'None — no metering', cd: 'Credit-metered: 100 free/day; 10k/mo Plus, 125k/mo Pro' },
          { name: 'Model', od: 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', cd: "Genspark's agents + image models (Nano Banana, GPT Image, Flux)" },
          { name: 'Design system', od: 'Portable DESIGN.md in your repo', cd: 'Cloud project / brand kit' },
          { name: 'Output / portability', od: 'Code + assets as files in your project dir', cd: 'Image assets stored in / exported from cloud' },
          { name: 'Code ownership', od: 'Yes — real UI code you own', cd: 'No — flattened graphic assets, not editable code' },
          { name: 'Self-host', od: 'Yes, run anywhere Node 24 runs', cd: 'No' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Genspark if',
        pickClaude: [
          'Your main need is graphic or marketing design — posters, logos, social graphics — polished fast.',
          'You prefer one all-in-one hosted tool with zero setup and bundled AI.',
          'UI prototyping is a nice-to-have, not the core deliverable.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You are designing product UI and want the code behind it, not just an exported image.',
          'You want open source (Apache-2.0) you can read, fork, and self-host.',
          'You want the output as files you own in your own repo.',
          'You want BYOK with your own coding agent and model.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'There is no automatic import from Genspark; start design-first with a one-time brand-extraction run:',
        migrateSteps: [
          'Pull your brand basics (colors, type, logo, spacing) from your existing Genspark assets.',
          'Capture them in a portable DESIGN.md in your repo.',
          'Point your coding agent at the repo with your own API key.',
          'Generate product UI against your design system — it lands as files you own.',
        ],
        migrateClosing:
          'From then on, every skill renders in your brand — and the files stay in your repo. Keep Genspark for marketing graphics if you like; the roles do not overlap.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Is Genspark AI Designer for graphic design or product UI?', text: 'Mainly graphic and marketing design — logos, posters, flyers, social graphics, packaging and brand systems from one prompt. It can output UI prototypes too, but that is a slice of a broad visual-design surface, not its core. Open Design is built for product UI and the code behind it.' },
          { name: 'How much does Genspark cost?', text: 'Genspark has a free tier (100 credits/day), a Plus plan at $24.99/mo ($19.99/mo billed annually) with 10,000 credits/mo, and a Pro plan at $249.99/mo ($199.99/mo annually) with 125,000 credits/mo. Extra credit packs start around $20 for 10,000 credits.' },
          { name: 'Is Open Design free?', text: 'Open Design is free and open source (Apache-2.0). There is no subscription and no credit meter — you bring your own agent key, so model spend bills to your account at provider rates.' },
          { name: 'Is Open Design really open source?', text: 'Yes. It lives at github.com/nexu-io/open-design under Apache-2.0 and is self-hostable. Genspark is closed-source.' },
          { name: 'Who owns the output each produces?', text: 'With Open Design you own everything — UI, code and design system are written as plain files into your own repository, no proprietary cloud format. Genspark assets live in its cloud (AI Drive) tied to your account and are exported as flattened images.' },
          { name: 'Is Open Design affiliated with Genspark?', text: 'No. Open Design is an independent, open-source project, not affiliated with Genspark or Mainfunc. This is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Designing product UI? Own it as files.',
        ctaBody:
          'Star the repo, grab the desktop build, or run the install in your terminal. Keep Genspark for marketing graphics — bring Open Design in for the product.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first alternative to Genspark for product UI — your coding agent, your key, your files, and a portable design system you keep in your repo.',
          heroCtaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/genspark/genspark-hero.webp',
            alt: 'Open Design vs Genspark — warm-paper editorial illustration of a prompt converging into a design hub you own',
          },
          intro: [
            '<b>Genspark AI Designer</b> (launched August 2025 at <a href="https://www.genspark.ai/ai_designer" target="_blank" rel="noopener">genspark.ai/ai_designer</a>) is the design product inside Genspark\'s all-in-one AI super-agent. You hand it one prompt — say "a logo and launch poster for a vegan ramen shop" — and a top-level agent deconstructs the brief, routes it across specialist agents, and returns finished, on-brand assets. Its turf is <b>graphic and marketing design</b>: logos, posters, flyers, social graphics, packaging, menus, product ads, even full brand systems. It runs as a closed-source, hosted SaaS metered in credits.',
            'Open Design plays a different position, so this is an honest comparison — the two tools do <b>different jobs</b>. Open Design is an <b>open-source (Apache-2.0)</b>, <b>local-first</b> design agent for <b>product UI</b>: screens, flows, components and a design system, plus the code behind them. You drive it with <b>your own coding agent (BYOK)</b> and everything lands as <b>files in your repo</b>. Below we are upfront about where Genspark genuinely wins (marketing-graphic breadth, one-shot polish) and where Open Design wins (open source, local-first, product UI, code you own).',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-genspark', label: 'What Genspark AI Designer is' },
            { id: 'why-switch', label: 'Why teams look for an alternative' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'wins', label: 'Where Genspark wins' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'decision', label: 'Which to pick' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-genspark',
              heading: 'What Genspark AI Designer is',
              blocks: [
                { kind: 'p', text: 'Genspark AI Designer (<a href="https://www.genspark.ai/ai_designer" target="_blank" rel="noopener">genspark.ai/ai_designer</a>) launched in <b>August 2025</b> as part of Genspark\'s all-in-one AI super-agent, pitched as "your first AI employee." You give it one natural-language prompt and it returns finished, on-brand assets — its strongest work is <b>graphic and marketing design</b>: logos, color palettes, posters, flyers, social graphics, packaging, menus, product ads, store interiors and complete brand systems. It can also produce UI prototypes, but that is one slice of a broad visual-design surface.' },
                { kind: 'split', imageSide: 'right', image: { src: '/alternatives/genspark/genspark-product.webp', alt: 'Genspark AI Designer — generates posters, logos and social graphics from a prompt', caption: 'Genspark AI Designer: its strongest use cases are logos, posters and social graphics (screenshot: genspark.ai).' }, text: [
                  'Genspark frames its approach as <b>"construction, not generation"</b>: instead of one diffusion pass, a top-level <b>Super Agent</b> deconstructs the brief and coordinates subordinate specialist agents — a <b>Mixture-of-Experts</b> stack. In its Mixture-of-Agents mode it draws on several image models at once, including <b>Nano Banana, GPT Image and Flux.1 Kontext</b>, and returns multiple style options to pick from.',
                  'It runs as a closed-source, hosted SaaS — your work lives in Genspark\'s cloud (AI Drive) and the output is exported as flattened image assets, not editable source. For a marketer who needs a logo and a launch poster by tonight, that all-in-one, zero-setup convenience is the point.',
                ] },
                { kind: 'p', text: 'Genspark is <b>metered in credits</b>. The free tier gives <b>100 credits/day</b> (reset at midnight); a single design costs a few credits depending on complexity. Paid plans are <b>Plus at $24.99/mo</b> ($19.99/mo billed annually) with 10,000 credits/mo and 50 GB AI Drive, and <b>Pro at $249.99/mo</b> ($199.99/mo annually) with 125,000 credits/mo and 1 TB; extra credit packs start around <b>$20 for 10,000 credits</b>. Reviewers note credits can burn fast on complex or Mixture-of-Agents runs, and that you can be charged for retries and failed outputs.' },
                { kind: 'ul', items: [
                  'Closed-source, hosted SaaS — no self-host; projects and assets live in Genspark cloud',
                  'Graphic & marketing design is the main job; product UI is secondary',
                  'Output is flattened image assets, not editable UI code you own',
                  'Bundled, credit-metered billing — runs on Genspark keys, not BYOK',
                ] },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Genspark alternative',
              blocks: [
                { kind: 'p', text: 'Genspark AI Designer is a strong marketing-graphics tool. Teams reach past it when the deliverable is product UI and they care about owning what comes out:' },
                { kind: 'steps', items: [
                  { label: 'Product UI, not marketing graphics', body: 'The job is screens, flows, components and a design system — plus the working code — not a poster or a logo. Genspark\'s polish is aimed at flat brand assets; you would still have to rebuild the UI in code afterwards.' },
                  { label: 'Own the output as files', body: 'Genspark assets live in its cloud (AI Drive) tied to your account and export as flattened images. Open Design writes UI, components and tokens as real files you commit to git and keep forever — the implication: no migration cost if you leave the tool.' },
                  { label: 'Open source you can audit', body: 'Genspark is closed-source SaaS; you cannot read, fork or self-host it. Open Design is Apache-2.0, so security teams can audit exactly what runs against the codebase and run it on infrastructure you control.' },
                  { label: 'BYOK over a credit meter', body: 'Genspark bills generations in credits (100/day free, then 10k–125k/mo on paid plans) and reviewers report paying for failed retries. Open Design runs on the coding agent and key you already have, so spend is provider rates with no per-design meter.' },
                ] },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Genspark AI Designer, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Genspark AI Designer'], rows: [
                  ['Primary job', 'Product UI + the code behind it', 'Graphic & marketing design (logos, posters, social, packaging)'],
                  ['License', 'Apache-2.0, full source on GitHub', 'Closed-source / proprietary'],
                  ['Runtime', 'Local-first on your machine', 'Hosted SaaS in Genspark cloud'],
                  ['Account', 'None required — runs locally', 'Genspark account required'],
                  ['Pricing', 'Free, open source', 'Free tier, then Plus $24.99/mo, Pro $249.99/mo'],
                  ['Credits', 'None — no metering', '100 free/day; 10k/mo Plus; 125k/mo Pro'],
                  ['Model', 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', "Genspark agents + Nano Banana / GPT Image / Flux"],
                  ['API spend', 'Bills to your account at provider rates', "Bundled into Genspark's credit subscription"],
                  ['Design system', 'Portable DESIGN.md in your repo', 'Cloud project / brand kit'],
                  ['Output / portability', 'Code + assets as files in your project dir', 'Image assets stored in / exported from cloud'],
                  ['Code ownership', 'Yes — real UI code you own', 'No — flattened assets, not editable code'],
                  ['Self-host', 'Yes, run anywhere Node 24 runs', 'No'],
                ] },
              ],
            },
            {
              id: 'wins',
              heading: 'Where Genspark AI Designer genuinely wins',
              blocks: [
                { kind: 'p', text: 'Credit where it is due: for <b>marketing and graphic design</b>, Genspark AI Designer covers a far broader visual surface than Open Design and is built for exactly that. From a single prompt it will return a logo, a color palette, a poster, social graphics, packaging, a menu and a one-page web mockup — a whole brand system in minutes, polished enough to ship for many small businesses, with zero setup and no repo or coding agent required. Its Mixture-of-Agents image stack (Nano Banana, GPT Image, Flux.1 Kontext) gives it strong one-shot range across illustration styles. If your job is "I need on-brand marketing assets fast," that all-in-one breadth is a real strength, and Open Design does not try to compete there — Open Design\'s job is product UI and the code behind it.' },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'split', imageSide: 'left', image: { src: '/alternatives/genspark/genspark-design-systems.webp', alt: 'The Open Design design-system library — brands and tokens kept as files you own', caption: 'Your design system lives as files in Open Design — portable, versioned, rendered by every skill.' }, text: [
                  '<b>Local-first</b> means the agent runs on your machine and writes to your repo. Product UI, components, and a portable <b>DESIGN.md</b> land as real <b>files you commit to git</b> — yours whether or not you keep using the tool.',
                  '<b>BYOK</b> means you supply the model. Open Design runs on the <b>coding agent you already use</b> (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) with <b>your own key</b>; inference bills to you at provider rates.',
                ] },
                { kind: 'p', text: 'New to the idea? Read <a href="/blog/what-is-vibe-design/">what vibe design is</a>, browse the <a href="/plugins/">plugin and design-system library</a>, see <a href="/compare/">all Open Design comparisons</a> — including <a href="/alternatives/figma/">Figma</a> and <a href="/alternatives/lovable/">Lovable</a> — or <a href="/download/">download Open Design</a>.' },
              ],
            },
            {
              id: 'decision',
              heading: 'Which should you pick',
              blocks: [
                { kind: 'p', text: 'A quick way to decide by what you actually want to do:' },
                { kind: 'table', compact: true, columns: ['If you want to…', 'Best pick'], rows: [
                  ['Design product UI plus the code and a design system', 'Open Design'],
                  ['Own the output as editable files in your repo', 'Open Design'],
                  ['Run an open-source design agent you can fork and audit', 'Open Design'],
                  ['Keep everything local and self-hosted, no account', 'Open Design'],
                  ['Bring your own coding agent and model (BYOK)', 'Open Design'],
                  ['Generate logos, posters and social graphics fast', 'Genspark'],
                  ['Spin up a whole brand system in one prompt, zero setup', 'Genspark'],
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving from Genspark to Open Design',
              blocks: [
                { kind: 'p', text: 'There is no automatic import; start design-first with a one-time brand-extraction run.' },
                { kind: 'ol', items: [
                  'Pull your brand basics (colors, type, logo) from your existing Genspark assets.',
                  'Capture them in a portable DESIGN.md in your repo.',
                  'Point your coding agent at the repo with your own API key.',
                  'Generate product UI against your design system — it lands as files you own.',
                ] },
                { kind: 'p', text: 'Keep Genspark for marketing graphics if you like — the two roles do not overlap.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'Is Genspark AI Designer for graphic design or product UI?', text: 'Mainly graphic and marketing design — logos, posters, flyers, social graphics, packaging and full brand systems from one prompt. It can output UI prototypes too, but that is one slice of a broad visual-design surface, not its core. Open Design is built specifically for product UI and the code behind it.' },
            { name: 'How much does Genspark cost, and how do credits work?', text: 'Genspark is metered in credits. The free tier gives 100 credits/day (reset midnight); a design costs a few credits depending on complexity. Plus is $24.99/mo ($19.99/mo annual) with 10,000 credits/mo; Pro is $249.99/mo ($199.99/mo annual) with 125,000 credits/mo. Extra credit packs start around $20 for 10,000 credits.' },
            { name: 'Is Open Design free?', text: 'Yes — Open Design is free and open source (Apache-2.0), with no subscription and no credit meter. You bring your own agent key, so model spend bills to your account at provider rates.' },
            { name: 'Is Open Design really open source?', text: 'Yes — github.com/nexu-io/open-design under Apache-2.0, fully self-hostable. Genspark is closed-source.' },
            { name: 'Who owns the output each one produces?', text: 'With Open Design you own everything — UI, code and design system land as plain files in your own repository. Genspark assets live in its cloud (AI Drive) tied to your account and export as flattened images.' },
            { name: 'Is Open Design affiliated with Genspark?', text: 'No. Open Design is an independent, open-source project, not affiliated with Genspark or Mainfunc. This is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Designing product UI? Own it as files.',
          ctaBody:
            'Star the repo, grab the desktop build, or run the install in your terminal. Keep Genspark for the logo and the launch poster — bring Open Design in for the product UI, the design system, and the code you own.',
          ctaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      'figma-make': {
        title: 'Best Figma Make alternative for design — Open Design',
        description:
          'Figma Make turns prompts into React apps inside Figma\'s cloud — behind a Full seat and AI credits. Open Design is the open-source, local-first, BYOK alternative.',
        breadcrumb: 'Best Figma Make alternative',
        label: 'Alternative · Figma Make',
        heading: 'Best Figma Make alternative for design.',
        lead:
          'Figma Make turns a prompt — or an existing Figma frame — into a running React app, hosted inside Figma and powered by Claude Sonnet. Open Design is the open-source, local-first alternative: your coding agent, your key, output you own as files in your repo.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Figma Make ships React apps inside Figma\'s cloud, behind a paid Full seat and AI credits that reset monthly. Open Design ships product UI as files you own — open source, local-first, driven by your own agent (BYOK). For a full move off Figma the design tool, see the Figma comparison; this page is about Figma Make.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Figma Make alternative',
        whyLead: 'Figma Make is a strong fit for staying in Figma. Teams look past it when these matter more:',
        reasons: [
          { label: 'The app lives in Figma\'s cloud, not your repo.', body: 'Make exports React/TSX, but the running app, its publish targets and Supabase wiring stay in Figma\'s runtime behind a Full seat. Open Design writes UI, code, and your design system straight into your repo.' },
          { label: 'AI usage is metered and unpredictable.', body: 'Teams burn a 3,000-credit monthly allowance in a day, mostly fixing imperfect output — and undo never refunds a credit. Open Design is BYOK: pay your provider directly, no credit ledger.' },
          { label: 'Authoring needs a paid Full seat.', body: 'A View or Dev seat can\'t build in Make — you need a Full seat (~$16–$90/user/mo) on top of credits. Open Design is Apache-2.0 and free to run.' },
          { label: 'Closed-source and cloud-only.', body: 'No self-host, no local mode, no on-premise option. Open Design is open source and local-first — it runs on your machine and you can audit it.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Local-first means the agent runs on your machine, against your repo, and the artifacts are committed as files you control — reviewable in pull requests, diffable, usable even if you stop using the tool.',
          'BYOK means Open Design runs on the coding agent you already use (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) with your own key — you own the output and the engine driving it.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'License', od: 'Apache-2.0, full source on GitHub', cd: 'Proprietary / closed-source' },
          { name: 'Where it runs', od: 'Local-first, your machine & repo', cd: "Figma's hosted cloud only (sandboxed runtime)" },
          { name: 'Account / seat', od: 'None — clone the repo and run', cd: 'Paid Figma Full seat to author (Dev/Collab = trial only)' },
          { name: 'Pricing model', od: 'Free to run; pay your own model provider (BYOK)', cd: 'Full seat ~$16–$90/user/mo plus metered AI credits' },
          { name: 'AI usage limits', od: 'None imposed — bounded only by your key', cd: 'Credits 500–4,250/mo, reset monthly, no rollover; undo ≠ refund' },
          { name: 'AI model', od: 'Any, via your coding agent', cd: 'Anthropic Claude Sonnet (fixed)' },
          { name: 'Output & portability', od: 'Files in your repo — UI, components, design system', cd: 'React/TSX, ZIP or GitHub; running app stays in Figma' },
          { name: 'Self-host / on-prem', od: 'Yes — fully local', cd: 'No — Figma cloud only' },
          { name: 'Backend', od: 'Any — agent writes against your stack', cd: 'Supabase only (auth, Postgres, storage)' },
          { name: 'Hosting / publishing', od: 'Your infra / wherever you deploy', cd: 'Figma-hosted: template, password URL, public, Figma Sites' },
          { name: 'Design system', od: 'Portable DESIGN.md every skill obeys', cd: 'Figma libraries + Make Kits, bound to Figma' },
          { name: 'Code ownership', od: 'You own the files outright in git', cd: 'Export available; production-ready needs rebuild' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Figma Make if',
        pickClaude: [
          'Your design work already lives in Figma and you want to attach a real frame and stay on the canvas.',
          'You want one-click hosted publish plus the Figma Sites integration.',
          'A fast designer-led prototype with Supabase auth built in matters more than owning the files.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You want output as files in your own repo, owned outright.',
          'Open source (Apache-2.0) matters: read, self-host, fork, audit.',
          'You want no per-seat paywall and no AI credit cap.',
          'You want BYOK and freedom to use any model and any coding agent.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'Moving a Figma Make prototype toward an Open Design workflow:',
        migrateSteps: [
          'Install your coding agent (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) and add your own key — no Figma seat, no credits.',
          'Point Open Design at your repo; it runs locally and writes UI and code where your build and CI already are.',
          'Capture your brand once in a portable DESIGN.md every skill respects.',
          'Generate, review the diff in version control, and deploy on your own infrastructure.',
        ],
        migrateClosing:
          'For a broader move off Figma the design tool, see the Open Design vs Figma comparison; this page is about Figma Make specifically.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'How much does Figma Make cost?', text: 'Authoring requires a paid Figma Full seat (~$16/user/mo on Professional up to $90 on Enterprise) plus AI credits metered per action. Credit allowances run 500/mo (Starter) to 4,250/mo (Enterprise), reset monthly, no rollover; a full app generation can cost 100+ credits. Open Design is free to run — you only pay your own model provider via your key.' },
          { name: 'Can I self-host Figma Make or run it locally?', text: 'No. Figma Make runs exclusively inside Figma\'s hosted cloud — no local mode, self-host, or on-premise option. Open Design is local-first and runs entirely on your machine.' },
          { name: 'Do I need a paid Figma seat to use Figma Make?', text: 'Yes. Authoring in Make requires a paid Full seat; Dev and Collab seats get trial access only and a View seat can\'t author. Open Design needs no account or seat — clone the repo and run it with your own coding agent.' },
          { name: 'Can I export the code Figma Make generates?', text: 'Yes — download the React/TypeScript app as a ZIP or push it to a GitHub repo. The caveat: the export is source, not a turnkey deploy, and the running app and Supabase wiring stay tied to Figma\'s runtime. With Open Design the output is files in your repo from the start.' },
          { name: 'Is Open Design open source?', text: 'Yes — Apache-2.0, local-first, BYOK with your own coding agent (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) and your own model key. Figma Make is proprietary and closed-source.' },
          { name: 'Is Open Design affiliated with Figma?', text: 'No. Open Design is an independent, open-source project, not affiliated with or endorsed by Figma. Figma and Figma Make are trademarks of Figma, Inc.; this is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Own your output — from prompt to repo.',
        ctaBody:
          'Figma Make is the fastest path from a Figma frame to a hosted prototype — if you author behind a Full seat, spend AI credits, and keep the running app in Figma\'s cloud. Open Design takes the other path: open source, local-first, your own agent and key, every generation a file you own.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first alternative to Figma Make — your coding agent, your key, your files, and a portable design system you keep in your repo, with no Figma cloud lock-in and no credit meter.',
          heroCtaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/figma-make/figma-make-hero.webp',
            alt: 'Open Design vs Figma Make — warm-paper editorial illustration of a prompt converging into a design hub you own',
          },
          intro: [
            'Figma Make is Figma\'s prompt-to-app tool (<a href="https://www.figma.com/make/" target="_blank" rel="noopener">figma.com/make</a>): you describe an app — or <b>attach an existing Figma frame as the source of truth</b> — and it generates a running, interactive <b>React + TypeScript</b> web app you refine on the Figma canvas through chat, point-and-edit, and point-and-prompt. It reached general availability on <b>July 24, 2025</b>, is powered by <b>Anthropic\'s Claude Sonnet</b>, and can wire up a <b>Supabase backend</b> (auth, Postgres, storage) when your prompt calls for it. For designers who already live in Figma, it is the shortest path from a frame to something clickable and publishable.',
            'The catch is where all of that lives. Figma Make runs <b>only inside Figma\'s hosted cloud</b>, authoring requires a <b>paid Full seat</b>, and every meaningful action spends <b>AI credits</b> that reset monthly and don\'t roll over — a full app generation can cost 100+ credits, and undo never refunds them. This page compares Figma Make specifically — not all of Figma (see <a href="/alternatives/figma/">the Open Design vs Figma comparison</a> for that) — against <b>Open Design</b>, an <b>open-source (Apache-2.0), local-first</b> design agent you drive with your own coding agent. We credit what Figma Make does genuinely well, and we are specific about where its cloud-only, seat-gated, credit-metered model pushes teams to look elsewhere.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-figma-make', label: 'What Figma Make is' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'decision', label: 'Which to pick' },
            { id: 'migrate', label: 'Migration' },
          ],
          sections: [
            {
              id: 'what-is-figma-make',
              heading: 'What Figma Make is',
              blocks: [
                { kind: 'p', text: 'Figma Make is the AI sub-product inside Figma (<a href="https://www.figma.com/make/" target="_blank" rel="noopener">figma.com/make</a>), GA since <b>July 24, 2025</b> and powered by <b>Claude Sonnet</b> — not a standalone app builder. You write a prompt or <b>attach a real Figma design/frame</b>, and it generates a live React/TSX app rendered in Figma\'s sandboxed runtime. You iterate the Figma way: chat to change behavior, click an element and prompt against just that element, or hand-edit on the canvas. When a prompt implies data, it offers to add a <b>Supabase</b> backend — email/password and magic-link auth, social login, a Postgres database, file storage, Edge Functions — connected via your own Supabase project.' },
                { kind: 'split', imageSide: 'right', image: { src: '/alternatives/figma-make/figma-make-product.webp', alt: 'Figma Make — prompt-to-app inside the Figma ecosystem', caption: 'Figma Make: prompt-to-React-app, hosted inside Figma (screenshot: figma.com/make).' }, text: [
                  'Output is <b>React + TypeScript only</b> — no Vue, Svelte, or other frameworks. You can take the code with you (download a ZIP or push to a GitHub repo) and publish without leaving Figma: as a team template, a password-protected internal URL, or a public deploy. The same engine feeds <b>Figma Sites</b> through "Code Layers" — draw a code layer on the canvas (the Make tool, shortcut E) and Make populates it with React you can edit or extend with npm packages.',
                  'Commercially, Make sits on Figma\'s <b>seat + credit</b> model. Authoring requires a paid <b>Full seat</b> (Dev and Collab seats get trial access only), and AI usage is metered: a font tweak can cost 30+ credits and a full app generation 100+, against a monthly allowance that does not roll over. As of March 18, 2026 those seat-level credit limits are enforced, with pay-as-you-go overage around $0.03/credit. This page is about Figma Make specifically; for a full move off Figma the design tool, see <a href="/alternatives/figma/">the Open Design vs Figma comparison</a>.',
                ] },
                { kind: 'ul', items: [
                  '<b>Where it runs:</b> Figma\'s hosted cloud only — no local mode, no self-host, no on-premise option',
                  '<b>What you need:</b> a paid Figma <b>Full seat</b> to author; teammates need a seat to open and run the app',
                  '<b>What it outputs:</b> React + TSX, exportable as ZIP or to GitHub; backend is Supabase only',
                  '<b>What it costs:</b> Full seat (~$16–$90/user/mo) <b>plus</b> AI credits — 500–4,250/mo, reset monthly, no rollover, undo doesn\'t refund',
                ] },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Figma Make, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Figma Make'], rows: [
                  ['License', 'Apache-2.0, full source on GitHub', 'Proprietary / closed-source'],
                  ['Where it runs', 'Local-first, your machine & repo', "Figma's hosted cloud only (sandboxed runtime)"],
                  ['Account / seat', 'None — clone the repo and run', 'Paid Figma Full seat to author (Dev/Collab = trial only)'],
                  ['Pricing model', 'Free to run; pay your own model provider (BYOK)', 'Full seat ~$16–$90/user/mo plus metered AI credits'],
                  ['AI usage limits', 'None imposed — bounded only by your key', 'Credits 500–4,250/mo, reset monthly, no rollover; undo ≠ refund'],
                  ['AI model', 'Any, via your coding agent', 'Anthropic Claude Sonnet (fixed)'],
                  ['Output & portability', 'Files in your repo — UI, components, design system', 'React/TSX, ZIP or GitHub; running app stays in Figma'],
                  ['Self-host / on-prem', 'Yes — fully local', 'No — Figma cloud only'],
                  ['Backend', 'Any — agent writes against your stack', 'Supabase only (auth, Postgres, storage)'],
                  ['Hosting / publishing', 'Your infra / wherever you deploy', 'Figma-hosted: template, password URL, public, Figma Sites'],
                  ['Design system', 'Portable DESIGN.md every skill obeys', 'Figma libraries + Make Kits, bound to Figma'],
                  ['Code ownership', 'You own the files outright in git', 'Export available; production-ready needs rebuild'],
                ] },
                { kind: 'p', text: 'Where Figma Make genuinely wins: if your team already lives in Figma, it is hard to beat for the first mile. You can <b>attach a real, existing Figma frame as the source of truth</b> — not re-describe it in prose — and get a clickable React app without leaving the canvas or opening an IDE. The chat / point-and-edit / point-and-prompt loop is genuinely designer-friendly, <b>one-click publish</b> (internal password URL or public deploy) and the Figma Sites "Code Layers" path turn a prototype into a shared, even shippable, surface in minutes, and the <b>Supabase integration</b> gives you real auth and a Postgres database with no backend setup — enough to validate an idea end to end. Open Design optimizes for <b>ownership</b>, <b>openness</b>, and <b>control</b> instead — open source, local-first, your output as files you own.' },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Figma Make alternative',
              blocks: [
                { kind: 'p', text: 'Figma Make is a strong fit for staying inside Figma. Teams start looking for an alternative when the cloud-only, seat-gated, credit-metered model gets in the way.' },
                { kind: 'steps', items: [
                  { label: 'The app lives in Figma\'s cloud, not your repo', body: 'Make can hand you a React/TSX ZIP, but the running app — its preview, publish targets, Supabase wiring — lives in Figma\'s runtime behind a Full seat. The export gives you source, not a turnkey deploy; reviewers flag excessive div nesting, thin error handling, and architecture that needs substantial rebuilding. In Open Design the output is the artifact — UI, components, and design system land as files in your own repo, already where your build and CI live.' },
                  { label: 'AI usage is metered, and the meter is unpredictable', body: 'The loudest complaint on Figma\'s own forum is credits: teams burn a full 3,000-credit monthly allowance in a day across ~100 prompts, and most of those go to fixing imperfect output — exactly the iteration the tool depends on. Undo reverts your file but never refunds the credit, and you can\'t predict the cap before you hit it. Open Design is BYOK: bring your own model key and pay your provider directly, so iteration cost is transparent and uncapped.' },
                  { label: 'Authoring is gated behind a paid Full seat', body: 'A View or Dev seat won\'t let you build in Make — you need a paid Full seat (~$16–$90/user/month) just to author, on top of credits. For a team where engineers, PMs, or contractors want to generate UI, that\'s a per-head paywall before anyone writes a prompt. Open Design is Apache-2.0 and free to run; anyone with a repo checkout can drive it.' },
                  { label: 'It\'s closed-source and cloud-only by design', body: 'Make runs exclusively in Figma\'s hosted cloud — there is no self-host, no local mode, and no on-premise option, a hard stop for teams with code-can\'t-leave-the-building policies or air-gapped requirements. Open Design is open source and local-first: it runs on your machine, your code never has to touch a third-party runtime, and you can audit exactly what the agent does.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'split', imageSide: 'left', image: { src: '/alternatives/figma-make/figma-make-design-systems.webp', alt: 'The Open Design design-system library — brands and tokens kept as files you own', caption: 'Your design system lives as files in Open Design — portable, versioned, rendered by every skill.' }, text: [
                  '<b>Local-first</b> means the agent runs on your machine, against your repo, and the artifacts — components, pages, tokens, the design system — are committed as <b>files you control</b>. No hosted workspace has to stay alive, and no Full seat has to stay paid, for your work to exist.',
                  '<b>BYOK</b> means you point Open Design at the <b>coding agent you already trust</b> (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) with <b>your own key</b>. You pick the model, pay your provider directly, and own both the output and the engine driving it — no credit meter in between.',
                ] },
                { kind: 'p', text: 'New to the idea? Read <a href="/blog/what-is-vibe-design/">what vibe design is</a>, browse the <a href="/plugins/">plugin and design-system library</a>, see <a href="/compare/">all Open Design comparisons</a> — including <a href="/alternatives/figma/">Figma</a> and <a href="/alternatives/lovable/">Lovable</a> — or <a href="/download/">download Open Design</a>.' },
              ],
            },
            {
              id: 'decision',
              heading: 'Which should you pick',
              blocks: [
                { kind: 'p', text: 'A quick way to decide by what you actually want to do:' },
                { kind: 'table', compact: true, columns: ['If you want…', 'Best pick'], rows: [
                  ['Output as files in your own repo, owned outright', 'Open Design'],
                  ['Open-source, auditable, self-hostable / local', 'Open Design'],
                  ['No per-seat paywall and no AI credit cap', 'Open Design'],
                  ['Freedom to use any model and any coding agent (BYOK)', 'Open Design'],
                  ['To attach an existing Figma frame and stay on the canvas', 'Figma Make'],
                  ['One-click hosted publish + Figma Sites integration', 'Figma Make'],
                  ['A fast designer-led prototype with Supabase auth built in', 'Figma Make'],
                ] },
              ],
            },
            {
              id: 'migrate',
              heading: 'Moving from Figma Make to Open Design',
              blocks: [
                { kind: 'p', text: 'Getting from a Figma Make prototype to an Open Design workflow:' },
                { kind: 'ol', items: [
                  'Install your coding agent (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) and add your own model key — no Figma seat, no credits.',
                  'Point Open Design at your repo; it runs locally and writes generated UI, components, and code where your build and CI already are.',
                  'Capture your brand once in a portable DESIGN.md; every skill respects it, so output is on-brand from the first generation.',
                  'Prompt the agent, review the changes as ordinary files in version control, and deploy on your own infrastructure — no cloud runtime, no credit meter, no export-then-rebuild.',
                ] },
                { kind: 'p', text: 'For a broader move off Figma the design tool, see <a href="/alternatives/figma/">the Open Design vs Figma comparison</a>.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'How much does Figma Make cost?', text: 'Authoring requires a paid Figma Full seat (~$16/user/mo on Professional up to $90 on Enterprise) plus AI credits metered per action. Credit allowances run 500/mo (Starter) to 4,250/mo (Enterprise), reset monthly, no rollover; a full app generation can cost 100+ credits. Open Design is free to run — you only pay your own model provider via your key.' },
            { name: 'Can I self-host Figma Make or run it locally?', text: 'No. Figma Make runs exclusively inside Figma\'s hosted cloud — no local mode, self-host, or on-premise option. Open Design is local-first and runs entirely on your machine.' },
            { name: 'Do I need a paid Figma seat to use Figma Make?', text: 'Yes. Authoring in Make requires a paid Full seat; Dev and Collab seats get trial access only and a View seat can\'t author. Open Design needs no account or seat — clone the repo and run it with your own coding agent.' },
            { name: 'Can I export the code Figma Make generates?', text: 'Yes — download the React/TypeScript app as a ZIP or push it to a GitHub repo. The caveat: the export is source, not a turnkey deploy, and the running app and Supabase wiring stay tied to Figma\'s runtime. With Open Design the output is files in your repo from the start.' },
            { name: 'Is Open Design open source?', text: 'Yes — Apache-2.0, local-first, BYOK with your own coding agent (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) and your own model key. Figma Make is proprietary and closed-source.' },
            { name: 'Is Open Design affiliated with Figma?', text: 'No. Open Design is an independent, open-source project, not affiliated with or endorsed by Figma. Figma and Figma Make are trademarks of Figma, Inc.; this is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Own your output — from prompt to repo.',
          ctaBody:
            'Figma Make is the fastest path from a Figma frame to a hosted prototype — if you author behind a Full seat, spend AI credits, and keep the running app in Figma\'s cloud. Open Design takes the other path: open source, local-first, drive it with the coding agent and key you already have, and every generation lands as files you own in your own repo.',
          ctaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      qoder: {
        title: 'Best QoderWork Design alternative for design — Open Design',
        description:
          'Looking for a QoderWork Design alternative? Open Design is the open-source, local-first design agent: drive it with your own coding agent, own every file it writes, no IDE or vendor lock-in.',
        breadcrumb: 'Best QoderWork Design alternative',
        label: 'Alternative · QoderWork Design',
        heading: 'Best QoderWork Design alternative for design.',
        lead:
          'QoderWork Design and Open Design agree on the big idea — design-as-code, prompt-to-UI, editable output. They diverge on everything around it: Open Design is open source, local-first, and runs on your own agent (BYOK); Qoder is closed-source and bound to Alibaba\'s IDE and models.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Qoder is one of the closest products in spirit to Open Design — both do design-as-code. The difference is openness: Open Design is Apache-2.0, local-first, and BYOK with your own coding agent; Qoder is closed-source and built around Qoder IDE. It is honest about where Qoder wins.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Migration / first run', 'FAQ'],
        whyTitle: 'Why people search for a Qoder alternative',
        whyLead: 'QoderWork Design is genuinely good. Teams still look for an alternative for ownership and freedom, not quality:',
        reasons: [
          { label: 'You want open source.', body: 'Qoder is closed-source, built by Alibaba. Open Design is Apache-2.0 — read, self-host, fork, audit.' },
          { label: 'You want BYOK and agent choice.', body: 'Qoder runs its own models inside its product; Open Design runs on the coding agent you already use, with your keys.' },
          { label: 'You don\'t want IDE lock-in.', body: 'Qoder\'s smoothest path runs through Qoder IDE; Open Design works alongside whatever you already have.' },
          { label: 'You want to truly own output.', body: 'With Open Design the deliverable is files in your repo — committed, versioned, yours from the first keystroke.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Local-first means your design work lives where your code lives: real source — components, styles, a portable DESIGN.md every skill follows — written into your repo, versioned in git, usable even if you stop using Open Design.',
          'BYOK means Open Design ships no model and charges no inference. You point it at the agent and key you already have (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen); you choose the model and see the cost.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'License', od: 'Open source (Apache-2.0)', cd: 'Closed-source (Alibaba)' },
          { name: 'Agent & model', od: 'BYOK — your own Claude Code / Codex / Cursor / Gemini / OpenCode / Qwen', cd: "Bound to Qoder's own models" },
          { name: 'Where it runs', od: 'Local-first, in your repo, any editor', cd: 'Hosted canvas; pin to local folder; Qoder IDE handoff' },
          { name: 'Output', od: 'Real files in your repo (+ DESIGN.md)', cd: 'HTML or React (shadcn/ui, Spark, Ant Design)' },
          { name: 'Design system', od: 'Portable DESIGN.md every skill obeys', cd: 'Inside the Qoder product' },
          { name: 'Canvas / visual editing', od: 'Code-/file-driven', cd: 'Infinite canvas, marquee-select, Nudge' },
          { name: 'IDE / ecosystem lock-in', od: 'None — works alongside your stack', cd: 'Smoothest inside the Qoder ecosystem' },
          { name: 'Self-host / fork', od: 'Yes', cd: 'No' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick QoderWork Design if',
        pickClaude: [
          'You want the most polished interactive canvas — marquee-select, annotate, Nudge — out of the box.',
          'You like the Questions → Design Plan → Nudge loop built in.',
          'You\'re happy in the Qoder ecosystem and want one-click handoff into Qoder IDE.',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'You want an open-source (Apache-2.0) tool you can audit, self-host, and fork.',
          'You already pay for a coding agent and want to drive design with it via your own keys.',
          'You want every deliverable to be real files in your repo, yours forever.',
          'You don\'t want your design workflow tied to one IDE or vendor.',
        ],
        migrateTitle: 'Migration / first run',
        migrateLead: 'Moving from Qoder to Open Design — since both speak code, your existing output is the starting point:',
        migrateSteps: [
          'Export the HTML or React Qoder generated into your repository.',
          'Capture your design language (colors, spacing, radii, components) in a portable DESIGN.md.',
          'Point Open Design at the coding agent you already use with your own key.',
          'Describe changes; your agent edits the real files. Review in pull requests, commit, ship.',
        ],
        migrateClosing:
          'From here the work is versioned and owned, end to end — no canvas you have to stay inside.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Open Design and Qoder look really similar — what\'s the difference?', text: 'They are close: both do prompt-to-UI, design-as-code, editable output. The difference is everything around generation. Open Design is open source (Apache-2.0), local-first, and BYOK with your own agent, output in your repo. Qoder is closed-source, built around Alibaba\'s models and Qoder IDE.' },
          { name: 'Is Open Design really open source?', text: 'Yes — Apache-2.0. Read the source, self-host, fork, audit. QoderWork Design is closed-source.' },
          { name: 'Which AI agent do I use with Open Design?', text: 'Whichever you already have — Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen, via BYOK with your own keys.' },
          { name: 'Does Qoder also keep my work local?', text: 'Partly — it can pin a project to a local folder and hand off to Qoder IDE. But the primary surface is a hosted canvas. In Open Design, the repo itself is the product.' },
          { name: 'Does Open Design have an interactive canvas?', text: 'No — a deliberate trade. Qoder\'s canvas with marquee-select and Nudge is excellent for visual editing. Open Design is code- and file-driven through your coding agent.' },
          { name: 'Is Open Design affiliated with Qoder or Alibaba?', text: 'No. Open Design is an independent, open-source project, not affiliated with Qoder or Alibaba. This is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Own your design workflow — end to end.',
        ctaBody:
          'Open Design runs on the coding agent you already use and writes files you actually own. No lock-in, no second subscription, no canvas you can\'t leave.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first alternative to QoderWork Design — the same design-as-code idea, but Apache-2.0, BYOK with your own coding agent, and output that lives in your repo and belongs to you.',
          heroCtaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/qoder/qoder-hero.webp',
            alt: 'Open Design vs Qoder — warm-paper editorial illustration of a prompt converging into a design hub you own',
          },
          intro: [
            'Of every tool in this comparison series, QoderWork Design is the closest to Open Design in spirit. Built by the Qoder team at Alibaba (<a href="https://qoder.com" target="_blank" rel="noopener">qoder.com</a>), it bills itself as <b>"AI-native design as code"</b>: you describe what you want, it renders a real, runnable design on an infinite canvas, you clarify intent through <b>Questions</b>, preview a structured <b>Design Plan</b> before it builds, and then <b>Nudge</b> color, spacing and radius after the fact. The output is genuine front-end code — HTML or React on shadcn/ui, Spark Design or Ant Design — not a flattened vector mock. That is a real product with a polished loop, and it deserves the credit.',
            'Because the two tools share a thesis — prompt to UI, design as <i>code</i>, editable output you can ship — the honest comparison is not about who generates nicer screens. It is about everything <i>around</i> generation. Open Design is <b>Apache-2.0</b>, <b>local-first</b>, and <b>BYOK</b>: it ships no model, runs on the coding agent you already pay for, and writes its output straight into your repository. QoderWork Design is <b>closed-source</b>, runs on <b>Qoder\'s own (undisclosed) models</b> behind a credit meter, and is at its best inside Alibaba\'s own IDE. If you want the most polished integrated canvas, Qoder is excellent. If you want openness, your own agent, and a workflow that is not bet on a single vendor, that is the gap Open Design fills.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-qoder', label: 'What QoderWork Design is' },
            { id: 'why-switch', label: 'Why teams look for an alternative' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'qoder-wins', label: 'Where Qoder genuinely wins' },
            { id: 'decision', label: 'Which to pick' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'migrate', label: 'Migration / first run' },
          ],
          sections: [
            {
              id: 'what-is-qoder',
              heading: 'What QoderWork Design actually is',
              blocks: [
                { kind: 'p', text: 'QoderWork Design is the first vertical workbench inside QoderWork, the desktop agent surface of Qoder — Alibaba\'s agentic coding platform, launched in public preview in August 2025. Where a traditional design tool centers on cloud-based vector editing, QoderWork Design treats the design as a <b>code asset the team co-owns</b>: from the first prompt, designers and engineers operate on the same runnable file, and it can be handed off to the Qoder IDE in a single click with no lossy export step between design and development.' },
                { kind: 'split', imageSide: 'right', image: { src: '/alternatives/qoder/qoder-product.webp', alt: 'QoderWork Design — design-as-code on an infinite canvas with Questions, Design Plan and Nudge', caption: 'QoderWork Design: design-as-code on an infinite canvas, with the Questions → Design Plan → Nudge loop (screenshot: qoder.com).' }, text: [
                  'Three mechanisms make the loop feel deliberate rather than slot-machine. <b>Questions</b>: when your prompt is underspecified, the agent asks structured clarifying questions to align on intent before it generates, instead of guessing. <b>Design Plan</b>: under a Plan tab it previews a structured plan — layout, style, content hierarchy — that you can read and correct <i>before</i> any pixels are produced. <b>Nudge</b>: after generation it exposes the key decisions (color, spacing, corner radius) as adjustable parameters, so you tune them directly instead of re-describing the whole screen.',
                  'On the canvas you can also <b>marquee-select a region and annotate it</b>: select an area, tell the agent what to change there, and it edits in place using the surrounding canvas context rather than regenerating the entire frame. Output ships as <b>HTML or React</b> targeting shadcn/ui, Spark Design or Ant Design; a <b>Design Files</b> tab lets you edit the underlying code, a project can be <b>pinned to a local folder</b> on your machine, and the <b>one-click handoff into Qoder IDE</b> carries the work straight into development.',
                ] },
                { kind: 'ul', items: [
                  '<b>Design-as-code on an infinite canvas</b> — intent in, runnable HTML/React out, edited via the Design Files tab',
                  '<b>Questions → Design Plan → Nudge</b> loop, plus marquee-select-and-annotate for region-level edits',
                  '<b>Outputs to shadcn/ui, Spark Design, or Ant Design</b>; pins to a local folder; one-click handoff to Qoder IDE',
                  '<b>Closed-source, Alibaba-built</b>; runs on Qoder\'s own undisclosed models behind a credit-based meter',
                ] },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a QoderWork Design alternative',
              blocks: [
                { kind: 'p', text: 'QoderWork Design is genuinely good at what it does, so the reasons teams still go looking are rarely about output quality. They are about <b>ownership, freedom, and not building a workflow on top of a single closed vendor</b>. Four come up again and again.' },
                { kind: 'steps', items: [
                  { label: 'You want open source', body: 'Qoder is closed-source and built by Alibaba — you cannot read how it works, self-host it, or fork it if priorities change. Open Design is Apache-2.0: the entire agent, skill library and renderer are on GitHub to read, audit, run on your own machine, and fork. For anyone with a security-review or supply-chain requirement, "we can read the code" is not a nice-to-have.' },
                  { label: 'You want BYOK and agent choice', body: 'QoderWork Design runs on Qoder\'s own models — which it does not publicly name — and meters them in credits you buy from Alibaba. Open Design ships no model and resells no inference. You point it at the coding agent and key you already pay for (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen), pick the model, and see the real cost — no second subscription, no opaque per-credit pricing.' },
                  { label: 'You don\'t want IDE or vendor lock-in', body: 'Qoder\'s smoothest path runs through the standalone Qoder IDE and the broader Alibaba ecosystem; the one-click handoff is great precisely because it assumes you live there. Open Design is just files in a repo, so it works alongside VS Code, JetBrains, Neovim, your CI, and your existing review process — nothing has to route through one editor.' },
                  { label: 'You want to truly own the output', body: 'In Open Design the deliverable is real source committed to your repository — components, styles, and a portable DESIGN.md — versioned in git and fully usable even if you stop using Open Design tomorrow. Qoder can pin to a local folder, but the product surface is a hosted canvas you have to stay inside; the files are a sync target downstream of it, not the source of truth.' },
                ] },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs QoderWork Design, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'QoderWork Design'], rows: [
                  ['License', 'Open source (Apache-2.0)', 'Closed-source (Alibaba)'],
                  ['Agent & model', 'BYOK: Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', "Qoder's own models (not publicly named)"],
                  ['Where it runs', 'Local-first, in your repo, any editor', 'Hosted canvas; pin to local folder; Qoder IDE handoff'],
                  ['Output format', 'Real files in your repo (+ DESIGN.md)', 'HTML or React you can inspect and edit'],
                  ['Component libraries', 'Any — your real components & tokens', 'shadcn/ui, Spark Design, Ant Design'],
                  ['Design system', 'Portable DESIGN.md every skill obeys', 'Configured inside the Qoder product'],
                  ['Canvas / visual editing', 'Code-/file-driven (no canvas)', 'Infinite canvas, marquee-select + annotate, Nudge'],
                  ['Generation loop', 'Agent + skills + DESIGN.md context', 'Questions → Design Plan → Nudge'],
                  ['IDE / ecosystem lock-in', 'None — works alongside any stack', 'Smoothest inside the Qoder IDE / Alibaba ecosystem'],
                  ['Self-host / fork', 'Yes', 'No'],
                  ['Ownership', 'Files in your repo, yours forever', 'Files exportable; canvas is the primary surface'],
                  ['Pricing', 'Free & open; you pay only your own agent', 'Credit-based: Pro ~$30/mo, Pro+ ~$60, Ultra ~$200'],
                ] },
              ],
            },
            {
              id: 'qoder-wins',
              heading: 'Where QoderWork Design genuinely wins',
              blocks: [
                { kind: 'p', text: 'Be clear-eyed about this, because Qoder is the strongest peer in the field. Its <b>interactive canvas is the best part</b>: marquee-selecting a region and annotating the exact change is faster and more intuitive than describing edits in prose, and because it edits using surrounding canvas context it does not blow away the rest of the frame. The <b>Questions → Design Plan → Nudge loop is well-engineered</b> — clarifying intent up front and exposing color, spacing and radius as live parameters genuinely reduces the re-prompt churn that plagues most generate-a-screen tools. And if your team already lives in Alibaba\'s stack, the <b>one-click handoff into Qoder IDE</b> is seamless in a way a file-based tool cannot match. Open Design deliberately trades that single, polished, integrated canvas for <b>openness</b>, <b>your own coding agent</b>, and <b>repo-native ownership</b>. If the canvas is what you value most, Qoder is the better fit — and that is an honest call, not a hedge.' },
              ],
            },
            {
              id: 'decision',
              heading: 'Which should you pick',
              blocks: [
                { kind: 'p', text: 'A quick way to decide by what you care most about:' },
                { kind: 'table', compact: true, columns: ['If you care most about…', 'Lean toward'], rows: [
                  ['Open source you can read, audit, fork, and self-host', 'Open Design'],
                  ['Using your own coding agent and keys (BYOK)', 'Open Design'],
                  ['Output that lives and stays in your own repo', 'Open Design'],
                  ['Freedom from any one IDE, vendor, or ecosystem', 'Open Design'],
                  ['No credit meter — you pay only your own agent', 'Open Design'],
                  ['A polished, interactive visual canvas with marquee-edit', 'QoderWork Design'],
                  ['One-click handoff into the Qoder IDE / Alibaba stack', 'QoderWork Design'],
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'split', imageSide: 'left', image: { src: '/alternatives/qoder/qoder-design-systems.webp', alt: 'The Open Design design-system library — brands and tokens kept as files you own', caption: 'Your design system lives as files in Open Design — portable, versioned, rendered by every skill.' }, text: [
                  '<b>Local-first</b> means your design work lives as <b>files in your own repo</b>: real source and a portable <b>DESIGN.md</b> that every skill obeys, versioned in git, reviewable in pull requests, and fully usable even if you stopped using Open Design tomorrow. QoderWork Design can pin a project to a local folder and hand it to Qoder IDE — real and useful — but the product surface is still the hosted canvas, and the local files are a sync target downstream of it. In Open Design the repo <i>is</i> the surface; there is no canvas you have to stay inside.',
                  '<b>BYOK</b> means Open Design ships no model and charges no inference. Point it at <b>your own agent and key</b> — Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen — pick the model, and pay your provider directly. No credits to top up, no opaque per-task burn, and you upgrade to a better model the day it ships instead of waiting for a vendor to wire it in.',
                ] },
                { kind: 'p', text: 'New to the idea? Read <a href="/blog/what-is-vibe-design/">what vibe design is</a>, browse the <a href="/plugins/">plugin and design-system library</a>, see <a href="/compare/">all Open Design comparisons</a> — including <a href="/alternatives/figma/">Figma</a>, <a href="/alternatives/lovable/">Lovable</a>, and <a href="/alternatives/v0/">v0</a> — or <a href="/download/">download Open Design</a>.' },
              ],
            },
            {
              id: 'migrate',
              heading: 'Migration / first run',
              blocks: [
                { kind: 'p', text: 'Because both tools speak code, there is no lossy conversion — your existing QoderWork Design output is the starting point, not something you redraw.' },
                { kind: 'ol', items: [
                  'Export the HTML or React QoderWork Design generated (shadcn/ui, Spark, or Ant Design components) into your repository, or pull from the local folder you pinned.',
                  'Capture your design language — colors, spacing, radii, type scale, components — once in a portable DESIGN.md that every Open Design skill will follow.',
                  'Point Open Design at the coding agent you already use, authenticated with your own key (BYOK); nothing routes through Open Design\'s servers.',
                  'Describe changes in plain language; your agent edits the real files. Review the diff in a pull request, commit, ship.',
                ] },
                { kind: 'p', text: 'From there the work is versioned and owned end to end — no canvas to stay inside, no second subscription, no vendor between you and your own files.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'QoderWork Design and Open Design both do design-as-code — how are they actually different?', text: 'They are the closest peers in this comparison: both turn a prompt into runnable, editable UI code rather than a flattened mock. The difference is everything around generation. Open Design is open source (Apache-2.0), local-first, and BYOK — it runs on the coding agent you already pay for and writes output straight into your repo. QoderWork Design is closed-source, runs on Qoder\'s own undisclosed models behind a credit meter, and is at its best inside Alibaba\'s Qoder IDE. Same idea; opposite stances on openness and ownership.' },
            { name: 'Is Open Design really open source?', text: 'Yes — Apache-2.0. The whole thing — the agent, the skill and design-system library, and the renderer — is on GitHub to read, self-host, fork, and audit. QoderWork Design is closed-source.' },
            { name: 'Which AI agent and model does Open Design use?', text: 'Whichever you already have. Open Design is BYOK and ships no model of its own: Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen, with your own keys, and you choose the underlying model. QoderWork Design instead runs on Qoder\'s own models, which it does not publicly name, metered in credits.' },
            { name: 'Does QoderWork Design also keep my work local?', text: 'Partly. It can pin a project to a local folder and hand off to the Qoder IDE in one click, which is genuinely useful. But the primary working surface is a hosted canvas, so the local files are a sync target downstream of it. In Open Design the repo itself is the product — there is no hosted canvas in the loop.' },
            { name: 'Will my workflow be locked into Qoder IDE or the Alibaba ecosystem?', text: 'With QoderWork Design the smoothest path assumes you do — the one-click handoff lands in Qoder IDE, and the experience is tuned for the Qoder/Alibaba stack. Open Design has no IDE lock-in: output is just files in a repo, so it works alongside VS Code, JetBrains, Neovim, your CI, and your existing review process.' },
            { name: 'How much does each cost?', text: 'Open Design is free and open source; the only thing you pay for is your own coding agent (BYOK), so there is no separate seat or credit charge. Qoder is credit-based — Pro is roughly $30/month for around 2,000 credits, Pro+ about $60, and Ultra about $200, with extra credits sold per-credit; credit-heavy tasks can burn a Pro plan in days. Check qoder.com for current numbers.' },
            { name: 'Is Open Design affiliated with Qoder or Alibaba?', text: 'No. Open Design is an independent, open-source project and is not affiliated with, endorsed by, or sponsored by Qoder or Alibaba. Qoder and QoderWork are trademarks of their respective owners. This is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Own your design workflow — end to end.',
          ctaBody:
            'Open Design runs on the coding agent you already use and writes files you actually own. No closed vendor, no credit meter, no canvas you can\'t leave.',
          ctaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
      trae: {
        title: 'Best Trae alternative for design — Open Design',
        description:
          'Looking for a Trae alternative for design? Open Design is an open-source, local-first design agent that runs on your own coding agent and keeps your design system as files you own. Many teams run both.',
        breadcrumb: 'Best Trae alternative',
        label: 'Alternative · Trae',
        heading: 'Best Trae alternative for design.',
        lead:
          'Trae is ByteDance\'s free, VS Code–based AI IDE — strong at turning screenshots and Figma frames into UI, and at SOLO full-stack generation. Open Design is a design-first agent that owns your design system as portable files — they sit at different layers, and many teams run both.',
        tldrTitle: 'TL;DR',
        tldrBody:
          'Trae is ByteDance\'s free, VS Code–based AI IDE; design-to-code (screenshot/Figma → React/Tailwind) and SOLO full-stack generation are features inside it. Open Design is design-first: it owns your design system (DESIGN.md) as files, is open source (Apache-2.0) and local-first, and runs on the coding agent you already use. They are complementary — Trae writes code, Open Design governs the design system.',
        toc: ['Why people search', 'Local-first + BYOK', 'Feature comparison', 'Who should pick which', 'Using them together', 'FAQ'],
        whyTitle: 'Why people search for a Trae alternative for design',
        whyLead: 'In Trae, design lives inside a code editor. Teams whose actual problem is the design system look for a tool whose first job is design:',
        reasons: [
          { label: 'Design-first, not an IDE feature.', body: 'A tool whose first concern is the design system — tokens, components, consistency — not the code editor.' },
          { label: 'Own the design system as files.', body: 'A DESIGN.md and design artifacts in your repo — version-controlled, diffable, portable.' },
          { label: 'Open source.', body: 'Trae is closed-source; Open Design is Apache-2.0 — read, fork, run it locally.' },
          { label: 'Agent freedom + BYOK.', body: 'Drive it with the coding agent you already use, with your own key — not one bundled model.' },
        ],
        localByokTitle: 'Local-first + BYOK, explained',
        localByokBody: [
          'Local-first means the work product lives with you: a portable DESIGN.md plus the design artifacts Open Design generates, committed to your repo, reviewable in pull requests, yours to keep.',
          'BYOK means Open Design doesn\'t ship its own model. Point it at the coding agent you already trust (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) with your own key — you control the model, cost, and data path.',
        ],
        featureTitle: 'Feature comparison',
        features: [
          { name: 'Primary job', od: 'Design-first — design system & workflow', cd: 'Coding IDE — write/ship application code' },
          { name: 'License', od: 'Open source (Apache-2.0)', cd: 'Closed-source' },
          { name: 'Where it runs', od: 'Local-first; files in your own repo', cd: 'Hosted AI IDE (forked from VS Code core)' },
          { name: 'Model / agent', od: 'BYOK — Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', cd: 'Built-in agent; bundled models (Claude, GPT-4o, Gemini, DeepSeek)' },
          { name: 'Design system', od: 'Portable DESIGN.md every skill follows', cd: 'Generated inline; in the hosted product' },
          { name: 'Output ownership', od: 'Files you own and version-control', cd: 'App code in the editor; product hosted' },
          { name: 'Design-to-code (screenshot/Figma)', od: 'Possible via your agent', cd: 'Core, polished feature' },
          { name: 'Full-stack generation (SOLO)', od: 'Out of scope by design', cd: 'SOLO: frontend/backend/config/terminal' },
          { name: 'Self-host', od: 'Yes — clone and run it yourself', cd: 'No — hosted service' },
          { name: 'Pricing', od: 'Free + open; you pay only your own model usage', cd: 'Free tier + paid tiers (~$3–$100/mo)' },
        ],
        whoTitle: 'Who should pick which',
        pickClaudeTitle: 'Pick Trae if',
        pickClaude: [
          'Your main job is writing code in an AI IDE.',
          'You want fast screenshot/Figma → React/Tailwind.',
          'You want natural-language → full-stack app generation (SOLO).',
        ],
        pickOpenTitle: 'Pick Open Design if',
        pickOpen: [
          'Your main job is design: a design system, kept consistent, owned as files.',
          'You want open source (Apache-2.0) you can self-host and fork.',
          'You want to bring your own coding agent and API key (BYOK).',
          'You want the design system in your repo, versioned in git.',
        ],
        migrateTitle: 'Using them together',
        migrateLead: 'For many teams the answer is both — Trae writes and ships the code, Open Design owns the design system that feeds it:',
        migrateSteps: [
          'Keep Trae as your IDE for writing, refactoring, and shipping code (including SOLO and design-to-code).',
          'Add Open Design as your design layer; point it at your coding agent with your own key.',
          'Make DESIGN.md the source of truth — every Open Design skill follows it.',
          'Loop them: reconcile Trae\'s UI against your design system; commit design-system changes as files Trae picks up.',
        ],
        migrateClosing:
          'They sit at different layers — IDE and design agent — so running them together is a natural fit, not a compromise.',
        faqTitle: 'FAQ',
        faq: [
          { name: 'Isn\'t Trae an IDE? What\'s its relationship to Open Design?', text: 'Yes — Trae is an AI-native IDE (a code editor forked from the VS Code core) from ByteDance, and design-to-code is a feature inside it. Open Design is a design-first agent that owns your design system as files. They are complementary and sit at different layers, not direct competitors.' },
          { name: 'Can I use Trae and Open Design together?', text: 'Yes, and many teams do. Trae writes and ships code (including SOLO and design-to-code); Open Design owns the design system (DESIGN.md) the code consumes. Open Design produces files in your repo, so any IDE — Trae included — picks them up.' },
          { name: 'Is Trae free? How does its pricing work?', text: 'Trae has a free tier (around 5,000 autocompletions/month and limited premium-model requests) plus paid tiers — as of early 2026 roughly Lite $3, Pro $10, Pro+ $30, and Ultra $100 per month — on a token-based Basic+Bonus usage model. Open Design is free and open-source; you pay only for your own model usage via BYOK.' },
          { name: 'Is Open Design open source?', text: 'Yes — Apache-2.0. Read it, fork it, self-host it, run it locally. Trae is closed-source and hosted.' },
          { name: 'Which AI agent or model does Open Design use?', text: 'Whichever you choose — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen, using your own key. Trae instead bundles models (Claude Sonnet, GPT-4o, Gemini 2.5 Pro, DeepSeek, and ByteDance\'s own) that you switch between in-product.' },
          { name: 'Is Open Design affiliated with Trae or ByteDance?', text: 'No. Open Design is an independent, open-source project, not affiliated with Trae or ByteDance. Trae is a ByteDance product and trademark. This is an unaffiliated comparison.' },
        ],
        ctaTitle: 'Own your design system, on your own terms.',
        ctaBody:
          'Open Design is the open-source, local-first design agent that runs on the coding agent you already use — and pairs cleanly with an IDE like Trae. Keep your design system as portable files you control.',
        rich: {
          heroCtaLead:
            'Open Design is the open-source, local-first, design-first alternative to Trae for design — it owns your design system as portable files, runs on your own coding agent (BYOK), and pairs cleanly with the IDE you already use.',
          heroCtaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          heroImage: {
            src: '/alternatives/trae/trae-hero.webp',
            alt: 'Open Design vs Trae — warm-paper editorial illustration of a prompt converging into a design hub you own',
          },
          intro: [
            'Trae and Open Design are easy to put side by side, but they solve different jobs. Trae is an AI-native IDE from ByteDance (<a href="https://www.trae.ai" target="_blank" rel="noopener">trae.ai</a>) — a coding environment forked from the <b>VS Code core</b> (it imports VS Code extensions and settings) where AI helps you write, refactor, and ship code. Its design abilities — multimodal chat that takes screenshots and mockups, and design-to-code that turns a Figma frame into React/Tailwind — are features layered on a code editor. The center of gravity is code.',
            'Open Design starts from the other end: a design-first agent whose primary job is the design workflow — establishing a design system, keeping it consistent, and producing artifacts you own as files. It doesn\'t replace your IDE; it runs on <b>your own coding agent</b> and writes a portable <b>DESIGN.md</b> every skill follows — <b>open-source</b> (Apache-2.0) and <b>local-first</b>. So this isn\'t "which IDE is better" — it\'s two complementary tools. If you want a Trae alternative <i>for design</i> — a tool whose first concern is the design system — that\'s where Open Design fits.',
          ],
          tocLabel: 'On this page',
          toc: [
            { id: 'what-is-trae', label: 'What Trae is' },
            { id: 'compare', label: 'Feature comparison' },
            { id: 'why-switch', label: 'Why switch' },
            { id: 'local-byok', label: 'Local-first + BYOK' },
            { id: 'decision', label: 'Which to pick' },
            { id: 'migrate', label: 'Using them together' },
          ],
          sections: [
            {
              id: 'what-is-trae',
              heading: 'What Trae is',
              blocks: [
                { kind: 'p', text: 'Trae is ByteDance\'s AI-native IDE (<a href="https://www.trae.ai" target="_blank" rel="noopener">trae.ai</a>), forked from the <b>VS Code core</b> — so it keeps the familiar editor, file explorer, and extension model while wrapping it in an AI-first interface. Its headline is a tight, multimodal AI loop: chat that accepts screenshots and mockups, <b>design-to-code</b> that turns a Figma frame or UI image into working React/Tailwind (extended in 2026 with a Figma-to-code agent over MCP), and an agentic builder that takes a project from a plain-language description to running code.' },
                { kind: 'split', imageSide: 'right', image: { src: '/alternatives/trae/trae-product.webp', alt: 'Trae — ByteDance AI-native IDE with design-to-code', caption: 'Trae: an AI IDE with strong design-to-code and SOLO full-stack generation (screenshot: trae.ai).' }, text: [
                  'That agentic capability — <b>TRAE SOLO</b> — is the flagship. On March 31, 2026 ByteDance shipped SOLO as a standalone app (desktop and web) that no longer needs the IDE plugin, in two modes: <b>Code</b> (the agentic coding loop) and <b>MTC ("More Than Coding")</b> for broader product work. You describe a project and it plans, then works through frontend, backend, config, and terminal commands toward something running.',
                  'On pricing, Trae is genuinely cheap to start. There is a <b>free tier</b> (around 5,000 autocompletions/month and limited premium-model requests), then paid tiers (as of early 2026, roughly <b>Lite $3</b>, <b>Pro $10</b>, <b>Pro+ $30</b>, and <b>Ultra $100</b> per month) on a token-based Basic+Bonus usage model. You select among bundled models — Claude Sonnet, GPT-4o, Gemini 2.5 Pro, DeepSeek, plus ByteDance\'s own — and switch between them in a session without managing your own keys.',
                  'Taken together, Trae is best understood as a complete coding IDE with strong design-to-code, not a standalone design workspace. It is <b>closed-source</b> and hosted, and (like other ByteDance tools) has drawn telemetry/privacy scrutiny.',
                ] },
                { kind: 'ul', items: [
                  'ByteDance\'s AI-native IDE, forked from the VS Code core; imports VS Code extensions',
                  'Design-to-code (screenshot/Figma → React/Tailwind) + SOLO: NL → frontend/backend/config/terminal',
                  'Free tier + paid tiers (~$3–$100/mo); bundled models (Claude, GPT-4o, Gemini, DeepSeek) — no BYOK needed',
                  'Closed-source and hosted — a product, not files you own',
                ] },
              ],
            },
            {
              id: 'compare',
              heading: 'Open Design vs Trae, feature by feature',
              blocks: [
                { kind: 'table', columns: ['Feature', 'Open Design', 'Trae'], rows: [
                  ['Primary job', 'Design-first — design system & workflow', 'Coding IDE — write/ship application code'],
                  ['License', 'Open source (Apache-2.0)', 'Closed-source'],
                  ['Where it runs', 'Local-first; files in your own repo', 'Hosted AI IDE (forked from VS Code core)'],
                  ['Model / agent', 'BYOK — Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen', 'Built-in agent; bundled models (Claude, GPT-4o, Gemini, DeepSeek)'],
                  ['Design system', 'Portable DESIGN.md every skill follows', 'Generated inline; lives in the hosted product'],
                  ['Output ownership', 'Files you own and version-control in git', 'App code in the editor; product hosted'],
                  ['Design-to-code (screenshot/Figma)', 'Possible via your agent', 'Core, polished feature'],
                  ['Full-stack generation (SOLO)', 'Out of scope by design', 'SOLO: frontend/backend/config/terminal'],
                  ['Self-host', 'Yes — clone and run it yourself', 'No — hosted service'],
                  ['Pricing', 'Free + open; you pay only your own model usage', 'Free tier + paid tiers (~$3–$100/mo)'],
                ] },
                { kind: 'p', text: 'Where Trae wins: for several jobs it is the better pick and it is not close. It is a complete, polished AI IDE — if you want one environment to write and ship code, Trae does that and Open Design does not. Its design-to-code is first-class, SOLO\'s end-to-end full-stack generation has no equivalent in Open Design, and it is free to start. If those are your core needs, choose Trae. Open Design instead owns the design system as <b>files you own</b> — <b>open-source</b>, <b>local-first</b>, driven by <b>your own coding agent</b>.' },
              ],
            },
            {
              id: 'why-switch',
              heading: 'Why teams look for a Trae alternative for design',
              blocks: [
                { kind: 'p', text: 'Trae is a strong AI IDE. Teams look for an alternative for design when the actual problem is the design system, not the code editor.' },
                { kind: 'steps', items: [
                  { label: 'Design-first, not an IDE feature', body: 'A tool whose first job is the design system — tokens, components, consistency.' },
                  { label: 'Own the design system as files', body: 'A DESIGN.md and artifacts in your repo, version-controlled and portable.' },
                  { label: 'Open source', body: 'Apache-2.0 vs closed; read it, fork it, run it locally.' },
                  { label: 'Agent freedom + BYOK', body: 'Your own coding agent and key, not one bundled model.' },
                ] },
              ],
            },
            {
              id: 'local-byok',
              heading: 'Local-first + BYOK, explained',
              blocks: [
                { kind: 'split', imageSide: 'left', image: { src: '/alternatives/trae/trae-design-systems.webp', alt: 'The Open Design design-system library — brands and tokens kept as files you own', caption: 'Your design system lives as files in Open Design — portable, versioned, rendered by every skill.' }, text: [
                  '<b>Local-first</b> means the work product lives with you, not in someone else\'s cloud. Open Design produces a portable <b>DESIGN.md</b> plus design artifacts directly in <b>your repository</b> — committed alongside your code, reviewable in pull requests, yours even if you stop using the tool.',
                  '<b>BYOK</b> means Open Design doesn\'t ship or lock you into a model. Point it at the <b>coding agent you already trust</b> (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen) with <b>your own key</b>.',
                ] },
                { kind: 'p', text: 'New to the idea? Read <a href="/blog/what-is-vibe-design/">what vibe design is</a>, browse the <a href="/plugins/">plugin and design-system library</a>, see <a href="/compare/">all Open Design comparisons</a> — including <a href="/alternatives/figma/">Figma</a> and <a href="/alternatives/lovable/">Lovable</a> — or <a href="/download/">download Open Design</a>.' },
              ],
            },
            {
              id: 'decision',
              heading: 'Which should you pick',
              blocks: [
                { kind: 'p', text: 'A quick way to decide by what you actually want:' },
                { kind: 'table', compact: true, columns: ['If you want…', 'Pick'], rows: [
                  ['A design-first workflow, not a code editor', 'Open Design'],
                  ['To own your design system as files (DESIGN.md)', 'Open Design'],
                  ['Open source you can self-host and fork', 'Open Design'],
                  ['To bring your own coding agent and key (BYOK)', 'Open Design'],
                  ['A full AI IDE to write, refactor, and ship code', 'Trae'],
                  ['Fast screenshot/Figma → React/Tailwind', 'Trae'],
                  ['Natural-language → full-stack app generation (SOLO)', 'Trae'],
                ] },
                { kind: 'p', text: 'Most teams find these rows are not in conflict: Trae owns the rows about writing and shipping code, Open Design owns the rows about the design system itself. That is exactly why so many run both.' },
              ],
            },
            {
              id: 'migrate',
              heading: 'Using Trae and Open Design together',
              blocks: [
                { kind: 'p', text: 'A common setup runs both — Trae as the IDE, Open Design as the design layer:' },
                { kind: 'ol', items: [
                  'Keep Trae for writing, refactoring, and shipping code (including SOLO and design-to-code).',
                  'Add Open Design; point it at the coding agent you already use with your own key.',
                  'Make DESIGN.md the source of truth — every Open Design skill follows it.',
                  'Loop them: reconcile Trae\'s UI against your design system; commit design-system changes as files Trae picks up.',
                ] },
                { kind: 'p', text: 'The design system stays owned, versioned, and portable across both tools.' },
              ],
            },
          ],
          faqTitle: 'FAQ',
          faq: [
            { name: 'Isn\'t Trae an IDE? What\'s its relationship to Open Design?', text: 'Yes — Trae is an AI-native IDE (a code editor forked from the VS Code core) from ByteDance, and design-to-code is a feature inside it. Open Design is a design-first agent that owns your design system as files. They are complementary and sit at different layers, not direct competitors.' },
            { name: 'Can I use Trae and Open Design together?', text: 'Yes, and many teams do. Trae writes and ships code (including SOLO and design-to-code); Open Design owns the design system (DESIGN.md) the code consumes. Open Design produces files in your repo, so any IDE — Trae included — picks them up.' },
            { name: 'Is Trae free? How does its pricing work?', text: 'Trae has a free tier (around 5,000 autocompletions/month and limited premium-model requests) plus paid tiers — as of early 2026 roughly Lite $3, Pro $10, Pro+ $30, and Ultra $100 per month — on a token-based Basic+Bonus usage model. Open Design is free and open-source; you pay only for your own model usage via BYOK.' },
            { name: 'Is Open Design open source?', text: 'Yes — Apache-2.0. Read it, fork it, self-host it, run it locally. Trae is closed-source and hosted.' },
            { name: 'Which AI agent or model does Open Design use?', text: 'Whichever you choose — BYOK with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen, using your own key. Trae instead bundles models (Claude Sonnet, GPT-4o, Gemini 2.5 Pro, DeepSeek, and ByteDance\'s own) that you switch between in-product.' },
            { name: 'Is Open Design affiliated with Trae or ByteDance?', text: 'No. Open Design is an independent, open-source project, not affiliated with Trae or ByteDance. Trae is a ByteDance product and trademark. This is an unaffiliated comparison.' },
          ],
          ctaTitle: 'Own your design system, on your own terms.',
          ctaBody:
            'Open Design is the open-source, local-first design agent that runs on the coding agent you already use — and pairs cleanly with an IDE like Trae. Keep your design system as portable files you control.',
          ctaActions: [
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
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
            { label: 'Download Open Design', href: '/download/', variant: 'primary' },
            { label: 'Star on GitHub', href: 'https://github.com/nexu-io/open-design', variant: 'ghost', external: true },
          ],
          hubLinkLabel: 'See all comparisons',
        },
      },
    },
    agentGuides: EN_AGENT_GUIDES,
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
      allReleasesTitle: 'All releases',
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
    title: 'Open Design Agent —— {count} 个 BYOK 适配器',
    description: 'Open Design 内置 {count} 个 BYOK 适配器。直接用你写代码时已经在用的 Agent 来驱动设计，无需额外厂商登录。',
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
  agentGuides: ZH_AGENT_GUIDES,
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
    allReleasesTitle: '全部版本',
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
      breadcrumb: "Cursor Agent",
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
      title: "用於設計的 Grok Build — Open Design",
      description: "人們如何使用 xAI 的 Grok Build（Grok Build）做 UI 與網頁設計——它的計劃模式、AGENTS.md 和 MCP、能識別影像的 Grok 模型以及超大上下文——以及 Open Design 如何把 Grok Build 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "Grok Build",
      label: "Agent · Grok Build",
      heading: "用於設計的 Grok Build。",
      lead: "Grok Build 是 xAI 的終端編碼 agent。它在動你的檔案之前先規劃好多步工作，把影像和程式碼一起讀取，並在你的倉庫裡跑構建並驗證的迴圈——只要你給它參考、規範和一個驗證環節，它就能成為一個真正的設計工具。Open Design 把它接入開源設計工作流：用你的 SuperGrok 登入或 xAI API key，操作你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Grok Build 變成一個本地優先、開源的設計 agent——用你的 SuperGrok 登入或 xAI API key，操作你自己的檔案，並在外圍配上一套精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Grok Build", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Grok Build——xAI 的終端編碼 agent，以 Grok Build 之名釋出——是一個駐留在你終端裡的 agentic 工具。有兩點讓它對設計尤其有意思：它在動手之前會先規劃有風險的工作，所以你可以在任何檔案改動之前審查它提出的方案；而且它的 Grok 模型支援影像輸入，因此它能在編寫程式碼的同時對一張參考截圖進行推理。配上恰當的參考、規範和一個驗證迴圈，它能構建出真實、響應式的 UI——直接通過你的 SuperGrok 或 X Premium+ 賬戶進行身份驗證，無需折騰 API key。這是一份實用的端到端指南，教你如何用 Grok Build 做 UI、前端和設計系統工作，並把它接入 Open Design 提供的結構化設計工作流。", "本文涵蓋：Grok Build 究竟是什麼，為什麼計劃模式和能識別影像的模型契合設計，如何從零開始搭建它，截圖到 UI 的迴圈，AGENTS.md 和 MCP 如何擴充套件它，它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比，讓 AI 產出顯得千篇一律的那些陷阱，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合差距——你的憑證和產物從不離開你的機器。"], "heroImage": {"src": "/agents/grok-design/grok-design-hero.webp", "alt": "Grok Build 設計反饋迴圈：一個終端 agent 依據參考圖進行規劃，一個瀏覽器渲染 UI，以及一個工作區，反饋箭頭回流形成閉環", "caption": "核心迴圈：Grok Build 在終端裡依據你的參考進行規劃，在真實瀏覽器中構建並驗證 UI，並對照參考反覆迭代——你的規範則寫在 AGENTS.md 裡。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-grok", "label": "Grok Build 究竟是什麼"}, {"id": "why-design", "label": "為什麼計劃模式 + 影像輸入契合設計"}, {"id": "setup", "label": "從零搭建用於設計的 Grok Build"}, {"id": "screenshot-workflow", "label": "截圖到 UI 的工作流"}, {"id": "extend", "label": "AGENTS.md、MCP 與子 agent"}, {"id": "vs", "label": "Grok Build vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與“AI 味”觀感"}, {"id": "open-design", "label": "在 Open Design 中用 Grok Build 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-grok", "heading": "Grok Build 究竟是什麼", "blocks": [{"kind": "p", "text": "Grok Build 是 xAI 的終端編碼 agent，以 Grok Build 之名釋出。它讀取你的倉庫、編輯檔案、執行 shell 命令，並依據自然語言任務規劃多步工程工作，而不只是補全程式碼行。它圍繞 xAI 的 Grok 模型構建——在 xAI API 上以 grok-build 模型家族的形式暴露——並通過你的 xAI 賬戶進行身份驗證，因此 agent 和模型都出自同一家廠商。"}, {"kind": "p", "text": "對設計工作來說，有兩個特性尤為突出。它有一個計劃模式，會先草擬一份結構化方案，供你在任何改動落地之前批准、評論或重寫——當你在迭代 UI 時，這是個很有用的關卡。而它的 Grok 模型支援影像輸入，所以你可以把一張參考截圖交給它，它會對實際佈局進行推理，而不是從一段文字描述裡瞎猜。"}, {"kind": "steps", "items": [{"label": "上下文檔案", "body": "Grok Build 會讀取 AGENTS.md 檔案來獲取持久的專案上下文——這正是用來編碼你的設計規範、tokens 和審查清單的自然位置。它遵循 Codex 和其他 agent 同樣使用的開放 AGENTS.md 約定。"}, {"label": "工具、MCP + 子 agent", "body": "它能編輯檔案、執行 shell 命令，並支援 MCP 伺服器來引入外部上下文，比如一個即時的 Figma 檔案；對於較大的任務，它可以委派給並行的子 agent，讓它們同時進行調研、構建和審查。"}, {"label": "用你的賬戶登入", "body": "你通過瀏覽器以 SuperGrok 或 X Premium+ 訂閱登入來完成身份驗證；你也可以帶上自己的 xAI API key 用於無頭執行和 CI 場景。"}]}, {"kind": "ul", "items": ["廠商：xAI", "憑證：xAI SuperGrok OAuth（`grok login`），或用於無頭場景的 xAI API key（BYOK）", "模型：xAI Grok 模型（xAI API 上的 grok-build 家族），支援影像輸入"]}]}, {"id": "why-design", "heading": "為什麼計劃模式和能識別影像的模型契合設計", "blocks": [{"kind": "p", "text": "Grok Build 的設計優勢來自兩個特性——但和所有 agent 一樣，品味仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "能識別影像的推理", "body": "因為 Grok 模型支援影像輸入，agent 能讀取參考截圖——把自己渲染出的產出與影像對照，而不是從一段文字描述裡瞎猜。"}, {"label": "改動落地前的計劃模式", "body": "計劃模式會草擬一份結構化方案，供你在檔案改動前批准，於是設計意圖在一開始就被審查，而不是等差異出來之後才發現。"}, {"label": "寫在 AGENTS.md 裡的規範", "body": "一份 AGENTS.md（再加上 Figma MCP 伺服器）會把 agent 指向你的 tokens、元件和真實規格，讓它針對一個品牌來工作，而不是套用預設觀感。"}]}, {"kind": "image", "src": "/agents/grok-design/grok-design-taste-triangle.webp", "alt": "示意圖展示設計系統、skill 和參考圖匯聚成優秀的設計產出", "caption": "品味來自你提供的三項輸入：一個設計系統、一個 skill 和真實的參考圖。"}, {"kind": "p", "text": "這條教訓和每個 agent 教給我們的一樣：Grok Build 預設並不具備品味。當你給它約束時——一個設計系統、一個審美 skill 和具體的參考——它才會產出好的設計。Open Design 恰恰把這些輸入打包好了，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始搭建用於設計工作的 Grok Build", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Grok Build 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 在 macOS/Linux 上安裝 Grok Build（Grok Build）\ncurl -fsSL https://x.ai/cli/install.sh | bash\n\n# 2. 在你的專案裡啟動它，並在首次執行時進行身份驗證\ncd your-project\ngrok login   # 開啟瀏覽器；用 SuperGrok / X Premium+ 登入\n#   或者，對於無頭 / CI 場景，設定 xAI API key：\n#   export XAI_API_KEY=xai-...\n\n# 3. 新增專案上下文\n#    在倉庫根目錄建立一個 AGENTS.md，寫入你的設計規範\n\n# 4. 接入 Figma MCP 伺服器（可選，用於設計交付）\n#    把它加到你的 MCP 伺服器配置裡"}, {"kind": "image", "src": "/agents/grok-design/grok-design-setup-flow.webp", "alt": "五步搭建流程：安裝、身份驗證、配置 AGENTS.md、新增 skill、驗證", "caption": "搭建順序：安裝 → 身份驗證 → 配置 AGENTS.md → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "編碼你的設計規則", "body": "把你的 tokens、基礎元素和規範寫進 AGENTS.md 並讓 Grok 指向它們，這樣產出就會貼合一個品牌，而不是退回到千篇一律的預設觀感。"}, {"label": "加入瀏覽器驗證", "body": "接入 Playwright 或瀏覽器 MCP，讓 Grok 在真實瀏覽器中渲染，並跨斷點檢查它的產出，而不僅僅是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Grok Build 時槓桿最高的設計迴圈，就是把一張參考圖變成可用的響應式 UI 並不斷迭代直到吻合——靠計劃模式就方案達成一致，靠能識別影像的模型把產出與參考對照。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發——幷包含多種狀態（桌面端和移動端、hover、空態、載入態），而不只是一張主視覺。", "在提示裡寫具體；含糊的提示即使配上強模型也只會產出千篇一律的 UI。", "把你的設計系統和規範放進 AGENTS.md，並告訴 Grok tokens 和規範基礎元素在哪裡。", "用計劃模式審查方案，然後啟動一個 dev server，讓 Grok 在真實瀏覽器中渲染，調整到各個斷點來檢查結果。", "通過讓 Grok 把自己的實現與截圖對照來迭代——而不僅僅是確認它能構建。"]}, {"kind": "p", "text": "附上你的參考圖，並給出具體約束："}, {"kind": "code", "lang": "bash", "code": "grok\n# 在提示裡（附上 reference-desktop.png 和 reference-mobile.png）：\n> 用 React + Vite + Tailwind + TypeScript 實現這個設計。\n  複用我已有的設計系統元件和 AGENTS.md 裡的 tokens。\n  匹配間距、佈局和層級；做成響應式。\n  先把方案給我看，然後在瀏覽器裡渲染並迭代，\n  直到它在各個斷點上都與參考吻合。"}, {"kind": "p", "text": "讓提示保持小而聚焦，提交好的迭代、回退差的迭代（回退時告訴 Grok），這樣每一輪都能在一個乾淨的基礎上推進。"}]}, {"id": "extend", "heading": "AGENTS.md、MCP 與子 agent", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 Grok Build 適合持續的設計工作，而這三者都能幹淨地對映到一個開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "AGENTS.md 上下文", "body": "專案規則寫在倉庫根目錄的 AGENTS.md 裡。它是你設計規範的持久歸宿，每次執行都會被讀取——而且它是其他 agent 也能理解的同一種開放格式，所以這些規則會隨你一起遷移。"}, {"label": "MCP 伺服器", "body": "配置 MCP 伺服器來引入設計上下文和外部工具，其中最相關的是 Figma MCP 伺服器——它是把真實規格喂進程式碼的可移植方式，跨 agent 通用，不只限於 Grok。"}, {"label": "子 agent 與內建工具", "body": "Grok Build 能派生出並行的子 agent 來同時進行調研、構建和審查，而它的檔案、shell 和搜尋工具讓它無需離開終端就能收集參考並跑完驗證迴圈。"}]}, {"kind": "p", "text": "這些都是可移植的多 agent 能力——正是 Open Design 旨在編排、而非在每個專案裡重造的那類東西。"}]}, {"id": "vs", "heading": "做設計時 Grok Build vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "設計工作沒有唯一贏家——每個 agent 各有所長，經驗豐富的團隊會把它們疊著用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Grok Build", "改動落地前的計劃模式審查、能識別影像的 Grok 模型，以及並行子 agent；用你的 SuperGrok 賬戶登入", "在迴圈中帶著 xAI 模型、經過審查、計劃優先的 UI 構建"], ["Codex", "憑藉前端 skill 帶來出色的視覺打磨；沙箱化的非同步構建", "委派式非同步構建與可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）以及理解程式碼庫的 UX", "前端推理與大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的視覺化構建即所見迴圈", "在 IDE 內進行緊湊的迭代即觀察 UI 工作"], ["Gemini CLI", "強大的多模態影像理解和超大上下文；開源且帶免費額度", "截圖密集的工作，以及把整個設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人類——沒有 skill、參考和約束，它們全都會退回到千篇一律的審美。這才是真正要解決的問題——而它是設計工具形態的，不是模型形態的。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避開“AI 味”觀感", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來千篇一律——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一股 Inter 字型加紫色的味道，“一看就是 AI 做的”。其他被反映的問題還包括移動端佈局崩壞，以及指令文字洩漏進 UI 文案。這些都不是 Grok Build 獨有的；任何 agent 在沒有精選設計上下文的情況下執行都會這樣。"}, {"kind": "steps", "items": [{"label": "加入一個審美 skill", "body": "一個精選的設計 skill 會迫使 agent 承諾一個真實的方向，而不是套用預設觀感。"}, {"label": "在真實瀏覽器中驗證", "body": "跨斷點渲染並自檢，讓佈局不會在移動端悄無聲息地崩壞。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖是對產出質量影響最大的那個槓桿。"}, {"label": "把規則編碼進 AGENTS.md", "body": "把“不要主視覺卡片、最多兩種字型、品牌優先的層級”這類規則放到 agent 每次執行都會讀取的地方。"}]}, {"kind": "p", "text": "注意，每一種緩解辦法都是在給 agent 一份精選的設計上下文。手工地、按專案維護這份上下文，正是 Open Design 替你免去的苦差事。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Grok Build 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一直在呼喚的開源設計層。它把 Grok Build 當作一等介面卡，並在外圍包上一套精選的 skill 與設計系統庫、一條結構化的渲染管線，以及一個本地桌面 UI——於是讓 Grok 表現出色的那份設計上下文從第一次執行起就已就位，而不必每次都手工拼湊。Open Design 是獨立的、採用 Apache-2.0 協議，並執行在你自己的機器上，這讓二者天然契合。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Grok Build 作為你的 agent。", "用你的 SuperGrok 賬戶或 xAI API key（BYOK）進行身份驗證——憑證留在你的機器上，從不經我們中轉。", "挑一個設計系統和一個 skill，然後以一致的品味生成演示稿、原型和落地頁。", "每一份產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是託管雲端。"]}, {"kind": "p", "text": "同一個 Grok Build agent、同一套憑證——外加在外圍包裹的一套真實、可移植、開源的設計工作流。它本地優先、採用 Apache-2.0，所以你的工作和憑證全都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Grok Build 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一個設計系統和真實的參考圖，Grok Build 就能產出生產級、響應式的 UI，而它能識別影像的 Grok 模型還能幫你把產出與參考對照驗證。沒有這份上下文，它往往會退回到千篇一律的觀感，而這正是 Open Design 要填補的缺口。"}, {"name": "我該如何對 Grok Build 進行身份驗證？", "text": "你通過瀏覽器以 SuperGrok 或 X Premium+ 訂閱登入（`grok login`），所以無需管理 API key。對於無頭或 CI 場景，你可以改用 xAI API key。無論哪種方式，Open Design 都不會中轉你的憑證。"}, {"name": "Grok Build 具體好在哪裡、適合設計？", "text": "兩點：它的計劃模式讓你在任何改動落地前審查方案，而它的 Grok 模型支援影像輸入，所以它能很好地讀取參考截圖。兩者都有幫助——但品味仍然來自你提供的設計系統、skill 和參考。"}, {"name": "前端設計該選 Grok Build 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體的、理解程式碼庫的設計決策著稱；Grok Build 的優勢在於計劃模式審查和能識別影像的 xAI 模型。很多團隊兩者都用——Open Design 讓你在不改變設計工作流的前提下切換 agent。"}, {"name": "我該如何把 Grok Build 連線到 Figma？", "text": "把 Figma MCP 伺服器加到你的 MCP 配置裡。這樣 Grok 就能拉取真實的設計上下文——元件、變數、佈局資料——於是生成的程式碼會匹配原始檔，而不是近似模仿。"}, {"name": "Open Design 隸屬於 xAI 嗎？", "text": "不是。Grok Build 是 xAI 的產品；Open Design 是一個獨立的開源專案，以一等介面卡的方式支援它。Grok 是 xAI 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，而你的 xAI 憑證由你的 agent 直接使用，絕不會經過 Open Design 的伺服器路由。"}], "ctaTitle": "用 Grok Build 做設計，以開放的方式。", "ctaBody": "帶上你自己的 SuperGrok 賬戶或 xAI API key，讓每一個檔案都留在本地，並在你已經在用的 agent 外圍獲得一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Grok Build", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
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
    'trae-cli': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['trae-cli']!,
      title: "用 Trae CLI 做設計 — Open Design",
      description: "人們如何用字節跳動的 Trae CLI（trae-agent）做 UI 和網頁設計——它是一個開源、模型無關的命令列 CLI agent，可自帶 LLM 提供商，並採用配置驅動的工作流——以及 Open Design 如何通過 ACP 把 Trae CLI 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "Trae CLI",
      label: "Agent · Trae CLI",
      heading: "用 Trae CLI 做設計。",
      lead: "Trae CLI 是字節跳動的開源終端 agent（trae-agent）。它模型無關——你把它指向你信任的 LLM 提供商即可——它會讀取你的倉庫、編輯檔案，並根據自然語言任務執行命令；一旦你給它參考、規範和一套驗證迴圈，它就成了真正的設計工具。Open Design 通過 ACP 把它接入一套開源的設計工作流：用你自己的提供商金鑰、你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Trae CLI 變成一個本地優先、開源的設計 agent——用你自己的 LLM 提供商金鑰、你自己的檔案，外加一套精選的 skill 與設計系統庫，通過 ACP 驅動。", "heroCtaActions": [{"label": "在 Open Design 中使用 Trae CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Trae CLI 是字節跳動面向終端的開源 AI agent，以 trae-agent 專案的形式釋出。有兩點讓它對設計尤其有意思：它模型無關，因此你可以自帶任何你信任的 LLM 提供商，而不被某一家廠商鎖定；同時它是一個透明、採用 MIT 許可的 agent，能根據自然語言任務讀取你的程式碼庫、編輯檔案並執行 shell 命令。配上恰當的參考、規範和一套驗證迴圈，它就能構建出真正的響應式 UI——而且起步免費、開放，你只需提供一個提供商金鑰。這是一份實用的端到端指南，講如何用 Trae CLI 做 UI、前端和設計系統的工作，以及如何用 Open Design 把它接入一套結構化的設計工作流。", "本文涵蓋：Trae CLI 究竟是什麼、為什麼一個開放、模型無關的 agent 適合做設計、如何從零開始配置它、截圖到 UI 的迴圈、它的配置檔案和工具如何對它進行擴充套件、它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比、那些讓 AI 產物顯得千篇一律的陷阱，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合這道鴻溝——這是天然的搭配，因為兩者都是開源、都跑在你自己的機器上，而 Open Design 通過 Agent Client Protocol（ACP）驅動 Trae CLI。"], "heroImage": {"src": "/agents/trae-cli-design/trae-cli-design-hero.webp", "alt": "Trae CLI 設計反饋迴圈：一個終端 agent 讀取參考圖、一個瀏覽器渲染 UI、一個工作區，反饋箭頭回環", "caption": "核心迴圈：Trae CLI 在終端裡讀取你的參考和規範，在真實瀏覽器中構建並驗證 UI，並據此反覆迭代。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-trae-cli", "label": "Trae CLI 究竟是什麼"}, {"id": "why-design", "label": "為什麼開放、模型無關的 agent 適合做設計"}, {"id": "setup", "label": "從零配置 Trae CLI 來做設計"}, {"id": "screenshot-workflow", "label": "截圖到 UI 的工作流"}, {"id": "extend", "label": "配置、工具與提供商"}, {"id": "vs", "label": "Trae CLI 對比 Codex、Claude Code、Cursor、Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與「AI 廉價感」的外觀"}, {"id": "open-design", "label": "在 Open Design 中用 Trae CLI 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-trae-cli", "heading": "Trae CLI 究竟是什麼", "blocks": [{"kind": "p", "text": "Trae CLI 是字節跳動開源 trae-agent 專案中的命令列 agent。它會讀取你的倉庫，檢視、建立和編輯檔案，並在一個持久化的環境中執行 shell 命令——根據自然語言任務進行規劃和驗證，而不只是補全幾行程式碼。它採用 MIT 許可，圍繞透明、模組化的架構構建，因此易於審視和擴充套件。它與另一款獨立的 Trae IDE（字節跳動基於 VS Code 的 AI 編輯器）不同，儘管兩者出自同一廠商。"}, {"kind": "p", "text": "對設計工作來說，有兩個特性尤為突出。它模型無關——你選擇 LLM 提供商，所以永遠不會被某個模型的長處或侷限所束縛。它也完全開放、配置驅動，因此它的行為、工具和提供商都可以和你的專案一起固定在版本控制裡，而不是藏在某個託管服務背後。"}, {"kind": "steps", "items": [{"label": "執行模式與互動模式", "body": "Trae CLI 用 `trae-cli run \"...\"` 執行單個任務，或用 `trae-cli interactive` 保持一個持續會話——這正是對照你的設計規範來迭代 UI 的好地方。"}, {"label": "內建工具", "body": "它開箱即帶檔案編輯、bash/shell 執行和結構化推理工具，因此能構建、跑起開發伺服器並檢查執行時錯誤，全程不用離開終端。"}, {"label": "自帶你的提供商", "body": "你為信任的提供商提供一個 API 金鑰——OpenAI、Anthropic、Google、OpenRouter、Doubao、Azure，或本地的 Ollama 模型——通過環境變數或配置檔案設定。"}]}, {"kind": "ul", "items": ["廠商：字節跳動（開源 trae-agent 專案）", "憑證：一個 LLM 提供商 API 金鑰（BYOK）——例如 OpenAI、Anthropic、Google、OpenRouter、Doubao、Azure，或本地的 Ollama 模型", "許可：MIT，開源"]}]}, {"id": "why-design", "heading": "為什麼開放、模型無關的 agent 適合做設計", "blocks": [{"kind": "p", "text": "Trae CLI 在設計上的優勢來自它的開放和提供商靈活性——但和每一個 agent 一樣，品味仍然得由人來提供。"}, {"kind": "steps", "items": [{"label": "天生模型無關", "body": "因為提供商由你選擇，你可以把設計工作交給當下在佈局和前端程式碼上推理最好的模型，日後再換掉它也不必改動工作流。"}, {"label": "開放且配置驅動", "body": "agent、它的工具及其提供商都固定在一個你可以提交的配置檔案裡，於是團隊在每臺機器上都得到相同的 agent 行為，而不是因開發者而異地漂移。"}, {"label": "規範留在你的倉庫裡", "body": "把 agent 指向你的 tokens、元件和真實規格——它們都儲存在你的專案裡——這樣它就是在針對一個品牌工作，而不是退回到千篇一律的外觀。"}]}, {"kind": "image", "src": "/agents/trae-cli-design/trae-cli-design-taste-triangle.webp", "alt": "圖示：設計系統、skill 和參考圖匯聚成優質的設計產出", "caption": "品味來自你提供的三項輸入：一個設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這條教訓和每個 agent 教給我們的一樣：Trae CLI 預設並不具備品味。當你給它約束——一個設計系統、一個審美 skill 以及具體的參考——它才會產出好的設計。Open Design 恰好把這些輸入打包好，並通過 ACP 餵給 Trae CLI，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始配置 Trae CLI 來做設計", "blocks": [{"kind": "p", "text": "這是從一臺乾淨的機器到一個能構建並驗證 UI 的 Trae CLI 的完整路徑。Trae CLI 用 uv 從原始碼安裝，然後配置上你想用的 LLM 提供商。"}, {"kind": "code", "lang": "bash", "code": "# 1. 從原始碼獲取 Trae CLI（trae-agent）——需要 uv\ngit clone https://github.com/bytedance/trae-agent.git\ncd trae-agent\nuv sync --all-extras\nsource .venv/bin/activate\n\n# 2. 通過把它指向你的 LLM 提供商金鑰來完成認證\n#    在環境變數裡設定（或寫進 trae_config.yaml 檔案）\nexport OPENAI_API_KEY=...        # 或 ANTHROPIC_API_KEY、GOOGLE_API_KEY 等\n\n# 3. 在你的專案中執行一個任務\ntrae-cli run \"Create a hello world page\"\n#    或保持一個會話：\ntrae-cli interactive\n\n# 4. 檢視解析後的配置（金鑰會被打碼）\ntrae-cli show-config"}, {"kind": "image", "src": "/agents/trae-cli-design/trae-cli-design-setup-flow.webp", "alt": "五步配置流程：安裝、認證、配置規範、新增 skill、驗證", "caption": "配置順序：安裝 → 用提供商金鑰認證 → 配置你的設計規範 → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把你的設計規則編碼進去", "body": "把你的 tokens、原語和規範放在倉庫裡並把 Trae CLI 指向它們，這樣產出就會匹配一個品牌，而不是退回到千篇一律的外觀。"}, {"label": "加入瀏覽器驗證", "body": "讓 Trae CLI 跑起開發伺服器並在真實瀏覽器中渲染，這樣它就會跨斷點檢查自己的產出，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Trae CLI 做設計時，槓桿最高的迴圈是把一張參考圖變成可用的響應式 UI，並不斷迭代直到匹配。因為 Trae CLI 模型無關，把它指向一個其模型能很好處理參考圖的提供商，並依靠真實瀏覽器來檢查結果。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發——並描述多種狀態（桌面端和移動端、懸停、空態、載入中），而不只是一張主視覺。", "提示詞要具體；含糊的提示即便配上強模型也會產出千篇一律的 UI。", "把你的設計系統和規範留在倉庫裡，並告訴 Trae CLI tokens 和標準原語在哪裡。", "跑起開發伺服器，讓 Trae CLI 在真實瀏覽器中渲染，調整到各個斷點來檢查結果。", "讓 Trae CLI 把它的實現拿回去和參考對比來迭代——而不只是確認它能構建。"]}, {"kind": "p", "text": "執行一個互動式會話，給出具體的約束，而不是一句話的請求："}, {"kind": "code", "lang": "bash", "code": "trae-cli interactive\n# in the session:\n> Implement the attached reference design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Run the dev server, render it in the browser, and iterate until it\n  matches the references across breakpoints."}, {"kind": "p", "text": "保持提示詞小而聚焦，提交好的迭代、回退壞的迭代（回退時告訴 Trae CLI），這樣每一輪都建立在乾淨的基礎之上。"}]}, {"id": "extend", "heading": "配置、工具與提供商", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 Trae CLI 適合長期的設計工作，而且三者都能幹淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "配置檔案", "body": "Trae CLI 讀取一個 trae_config.yaml，它固定了你的提供商、模型和各項設定——這是 agent 在專案上如何執行的持久、可版本控制的歸宿。"}, {"label": "提供商選擇", "body": "由於它支援眾多提供商（OpenAI、Anthropic、Google、OpenRouter、Doubao、Azure、Ollama），你可以把設計工作交給你信任的模型，並在不重接工作流的情況下換掉它。"}, {"label": "內建工具", "body": "它的檔案編輯、shell 和結構化推理工具讓它能收集上下文、構建、跑起開發伺服器並執行驗證迴圈，全程不用離開終端。"}]}, {"kind": "p", "text": "這些都是可移植的、agent 級別的能力——恰恰是 Open Design 被設計用來通過 ACP 編排的那類東西，而不必每個專案都重新搭一遍。"}]}, {"id": "vs", "heading": "做設計時 Trae CLI 對比 Codex、Claude Code、Cursor、Gemini CLI", "blocks": [{"kind": "p", "text": "設計工作沒有唯一的贏家——每個 agent 各有不同的強項，有經驗的團隊會把它們疊著用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Trae CLI", "開源（MIT）且模型無關；自帶提供商金鑰，配置驅動且透明", "想要一個免費、可審視的 agent，並自由選擇或更換 LLM 提供商的團隊"], ["Codex", "憑藉前端 skill 帶來出色的視覺打磨；沙箱化的非同步構建", "委託式非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（十六進位制色值、間距、字型）和程式碼庫感知的 UX", "前端推理和大上下文重構"], ["Cursor", "視覺化的「邊構建邊看」迴圈，帶即時預覽和行內編輯", "在 IDE 內緊湊的「迭代-觀察」UI 工作"], ["Gemini CLI", "出色的多模態影像理解和 100 萬 token 的上下文；開源且有免費額度", "大量截圖的工作，以及把整個設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人——沒有 skill、參考和約束時，它們全都會退回到千篇一律的審美。這才是真正要解決的問題——而它是設計工具形狀的，不是模型形狀的。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避開「AI 廉價感」的外觀", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來千篇一律——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一種 Inter 字型加紫色的調調，「一看就是 AI 做的」。其他被反映的問題還包括移動端佈局錯亂，以及指令洩漏進 UI 文案。這些都不是 Trae CLI 獨有的；任何 agent 在缺乏精選的設計上下文下執行時都會這樣。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會迫使 agent 選定一個真正的方向，而不是預設外觀。"}, {"label": "在真實瀏覽器中驗證", "body": "讓 Trae CLI 跨斷點渲染並自檢，這樣佈局就不會在移動端悄悄崩壞。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖是撬動產出質量的最大單一槓桿。"}, {"label": "把規則編碼進你的倉庫", "body": "把「不用主視覺卡片、最多兩種字型、品牌優先的層級」這類風格規則放在 agent 每次執行都會讀到的地方。"}]}, {"kind": "p", "text": "注意到了嗎，每一項緩解措施都在於給 agent 一份精選的設計上下文。逐個專案手工維護這份上下文，正是 Open Design 替你省掉的苦力活。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Trae CLI 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一再呼喚的那個開源設計層。它把 Trae CLI 當作一等介面卡——通過其 trae-cli 二進位制檔案、用 Agent Client Protocol（ACP）來驅動它——並把它包進一套精選的 skill 與設計系統庫、一條結構化的渲染流水線和一個本地桌面 UI，於是讓 Trae CLI 出彩的那份設計上下文從第一次執行起就在那裡，不必每次手工拼湊。兩者都是開源、本地優先，這讓它們的搭配成了天然之選。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Trae CLI 作為你的 agent。", "用你自己的 LLM 提供商金鑰（BYOK）認證——憑證留在你的機器上，絕不經我們代理。", "挑一個設計系統和一個 skill，然後以一致的品味生成演示稿、原型和落地頁。", "每一個產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是某個託管雲上。"]}, {"kind": "p", "text": "同一個 Trae CLI agent、同一個提供商金鑰——外加一套真正可移植、開源的設計工作流圍著它運轉。它本地優先、開源，所以關於你的工作或你的憑證，沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Trae CLI 真的能做設計工作嗎？", "text": "能——配上一個審美 skill、一個設計系統和真實的參考上下文，Trae CLI 能產出生產級、響應式的 UI；而且因為它模型無關，你可以把工作交給在你的前端上推理最好的提供商。沒有這份上下文時，它往往會退回到千篇一律的外觀，這正是 Open Design 填補的鴻溝。"}, {"name": "用 Trae CLI 做設計需要付費嗎？", "text": "Trae CLI 本身免費且開源（MIT）。你自帶 LLM 提供商金鑰，所以你唯一的成本是那家提供商收的費用——或者如果你通過 Ollama 跑本地模型，則分文不花。無論哪種方式，Open Design 都不會代理你的憑證。"}, {"name": "Trae CLI 具體好在哪裡、適合做設計？", "text": "兩點：它模型無關，所以你可以選擇最適合前端工作的 LLM 提供商；它完全開放、配置驅動，所以它的行為對一個團隊來說透明且可復現。但品味仍然來自你提供的設計系統、skill 和參考。"}, {"name": "前端設計該用 Trae CLI 還是 Claude Code？", "text": "兩者都很能幹。Claude Code 以具體、程式碼庫感知的設計決策著稱；Trae CLI 的優勢是開源且提供商靈活，所以你永遠不會被鎖定在某一個模型上。許多團隊兩個都用——Open Design 讓你在不改動設計工作流的情況下切換 agent。"}, {"name": "Open Design 執行 Trae CLI 需要什麼？", "text": "Open Design 通過 Agent Client Protocol（ACP）驅動 Trae CLI 的 trae-cli 二進位制檔案，並使用你配置的 LLM 提供商金鑰。你選擇 Trae CLI 作為你的 agent，把它指向一個提供商，Open Design 就在它周圍提供那份精選的設計上下文。"}, {"name": "Open Design 和字節跳動或 Trae 有關聯嗎？", "text": "沒有。Trae CLI（trae-agent）是字節跳動的產品；Open Design 是一個獨立的開源專案，把它作為一等介面卡來支援。Trae 是字節跳動的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且開源。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的 LLM 提供商憑證由你的 agent 直接使用，絕不經 Open Design 的伺服器中轉。"}], "ctaTitle": "用開放的方式，借 Trae CLI 做設計。", "ctaBody": "自帶你的 LLM 提供商金鑰，把每個檔案都留在本地，並在你已經在用的 agent 周圍獲得一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Trae CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有支援的 agent"},
    },
    'aider': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['aider']!,
      title: "用 Aider 做設計 — Open Design",
      description: "人們如何用 Aider —— 執行在終端裡的開源、模型無關的 AI 結對程式設計師 —— 來做 UI 與網頁設計：基於 git 的原生改動、CONVENTIONS.md 檔案、影像支援以及 BYOK；以及 Open Design 如何把 Aider 變成本地優先、開源的設計 agent。",
      breadcrumb: "Aider",
      label: "Agent · Aider",
      heading: "用 Aider 做設計。",
      lead: "Aider 是執行在你終端裡、直接操作你 git 倉庫的開源 AI 結對程式設計師。它是模型無關的 —— 用你自己的 key 把它接到 Claude、GPT-4o、DeepSeek 或 Gemini 上 —— 它會編輯檔案、自動提交，並在支援視覺的模型上讀取影像。一旦你給它參考圖、規範和一套驗證迴圈，它就成了一個真正的設計工具。Open Design 把它接入一套開源的設計工作流：你的供應商 key、你的檔案、本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Aider 變成一個本地優先、開源的設計 agent —— 用你自己的供應商 API key、你的檔案，外加一套圍繞它的精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 裡使用 Aider", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Aider 是一個開源的 AI 結對程式設計工具，執行在你的終端裡，操作你 git 倉庫中的程式碼。有兩點讓它對設計尤其有意思：它是模型無關的，所以你可以自帶 key 接入幾乎任何 LLM —— Claude、GPT-4o、DeepSeek、Gemini 或本地模型 —— 而且它是 git 原生的，會就地編輯檔案，併為每次改動配上一條合理的提交資訊，於是每一輪迭代都可審閱、可回退。在支援視覺的模型上，它還能讀取影像，於是一張截圖就成了提示詞的一部分。配上合適的參考圖、規範和一套驗證迴圈，它就能搭出真正、響應式的 UI。這是一份實用、端到端的指南，講如何用 Aider 做 UI、前端和設計系統的工作，以及如何把它接入 Open Design 的結構化設計工作流。", "它涵蓋：Aider 究竟是什麼、為什麼一個模型無關、git 原生的工具適合做設計、如何從零搭起、截圖到 UI 的迴圈、CONVENTIONS.md 和 Aider 的命令如何擴充套件它、它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比、那些讓 AI 產物顯得千篇一律的陷阱，以及 Open Design 如何作為一層開放、本地優先的設計層來彌合差距 —— 二者天然契合，因為它們都是開源的、都跑在你自己的機器上。"], "heroImage": {"src": "/agents/aider-design/aider-design-hero.webp", "alt": "Aider 設計反饋迴圈：一個終端 agent 讀取參考圖、一個帶提交記錄的 git 倉庫、一個渲染 UI 的瀏覽器，以及一條迴環的反饋箭頭", "caption": "核心迴圈：Aider 在終端裡讀取你的參考圖，在你的 git 倉庫裡編輯並提交 UI，再對照參考圖反覆迭代 —— 用你自帶的任何模型。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-aider", "label": "Aider 究竟是什麼"}, {"id": "why-design", "label": "為什麼模型無關 + git 原生適合做設計"}, {"id": "setup", "label": "從零搭建用於設計的 Aider"}, {"id": "screenshot-workflow", "label": "截圖到 UI 的工作流"}, {"id": "extend", "label": "CONVENTIONS.md、影像與命令"}, {"id": "vs", "label": "Aider vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與那股“AI 流水貨”味"}, {"id": "open-design", "label": "在 Open Design 裡用 Aider 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-aider", "heading": "Aider 究竟是什麼", "blocks": [{"kind": "p", "text": "Aider 是一個開源（Apache-2.0）的 AI 結對程式設計工具，執行在你的終端裡。它讀取你已有的程式碼庫，為上下文對映整個倉庫，就地編輯檔案，並自動為每次改動配上一條合理的提交資訊 —— 於是你可以用早已熟悉的 git 工具來 diff、管理和撤銷 AI 的工作。它支援 100 多種程式語言，既能開新專案，也能在已有專案上繼續構建。"}, {"kind": "p", "text": "對設計工作而言，有兩個特性格外突出。Aider 是模型無關的：你自帶 key，把它接到幾乎任何 LLM —— Claude、GPT-4o、DeepSeek、Gemini 或本地模型 —— 所以你永遠不會被鎖死在某一家供應商上。而在 GPT-4o、Claude 這類支援視覺的模型上，它能讀取影像檔案，把一張參考截圖變成提示詞的一部分。"}, {"kind": "steps", "items": [{"label": "規範檔案", "body": "Aider 會讀取一個 CONVENTIONS.md 檔案，你用 /read CONVENTIONS.md（或 aider --read CONVENTIONS.md）載入它 —— 這是把你的設計規範、tokens 和評審清單編碼為只讀上下文的天然之處。"}, {"label": "git 原生的改動", "body": "每次改動都會應用到你倉庫裡的檔案上並自動提交，於是每一輪設計迭代都能用熟悉的 git 工具來審閱和回退。"}, {"label": "自帶你的模型", "body": "用你自己的 API key 接入 OpenAI、Anthropic、DeepSeek、Gemini 或本地模型；Aider 不繫結單一廠商，也不繫結某個託管後端。"}]}, {"kind": "ul", "items": ["供應商：Aider（Aider-AI，開源）—— 模型無關", "憑證：你自己的供應商 API key —— BYOK（OpenAI、Anthropic、DeepSeek、Gemini 或本地模型）", "許可證：Apache-2.0，開源"]}]}, {"id": "why-design", "heading": "為什麼一個模型無關、git 原生的工具適合做設計", "blocks": [{"kind": "p", "text": "Aider 在設計上的優勢，來自它與你的倉庫以及你所選模型協作的方式 —— 但與所有 agent 一樣，品味仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "模型無關，BYOK", "body": "挑一個最適合你任務和預算的、設計表現最好的模型 —— Claude、GPT-4o、DeepSeek、Gemini —— 並隨意切換而不必改動你的工作流，全程用你自己的 key。"}, {"label": "git 原生的迭代", "body": "自動提交讓每一輪設計都成為一段可回退、可審閱的 diff，於是你總是在一個乾淨的基線上迭代，而不是面對一堆未追蹤的散亂改動。"}, {"label": "把規範放進 CONVENTIONS.md", "body": "一個 CONVENTIONS.md（以只讀方式載入）把 agent 指向你的 tokens、元件和規則，於是它對照的是一套品牌，而不是某種預設觀感。"}]}, {"kind": "image", "src": "/agents/aider-design/aider-design-taste-triangle.webp", "alt": "示意圖：設計系統、skill 和參考圖匯聚成優質的設計產出", "caption": "品味來自你提供的三項輸入：一套設計系統、一個 skill 和真實的參考圖。"}, {"kind": "p", "text": "這個教訓和每個 agent 教給我們的一樣：Aider 預設並沒有品味。只有當你給它約束 —— 一套設計系統、一個審美 skill 和具體的參考 —— 它才會產出好設計。Open Design 恰恰把這些輸入打包了起來，這正是二者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零搭建用於設計的 Aider", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器，到一個能構建並驗證 UI 的 Aider 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Aider（推薦的安裝器；Python 3.8–3.13）\npython -m pip install aider-install\naider-install\n# 或用 pipx：pipx install aider-chat\n\n# 2. 在你的 git 專案裡啟動它，並自帶你的 key\ncd your-project\naider --model sonnet --api-key anthropic=<your-key>\n# 或：aider --api-key openai=<your-key>   （也支援 deepseek=、gemini=）\n\n# 3. 把你的設計規範作為只讀上下文載入進來\naider --read CONVENTIONS.md\n\n# 4. 新增一張參考圖（在支援視覺的模型上）\n#    在對話裡：/add reference-desktop.png"}, {"kind": "image", "src": "/agents/aider-design/aider-design-setup-flow.webp", "alt": "五步搭建流程：安裝、自帶 key、載入 CONVENTIONS.md、新增參考圖、驗證", "caption": "搭建順序：安裝 → 自帶你的 key → 載入 CONVENTIONS.md → 新增一張參考圖 → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把你的設計規則編碼下來", "body": "把你的 tokens、基礎元件和規範放進 CONVENTIONS.md 並以只讀方式載入，於是產出貼合一套品牌，而不是退回某種千篇一律的觀感。"}, {"label": "加上瀏覽器驗證", "body": "跑一個開發伺服器，讓 Aider 在真實瀏覽器裡渲染，並跨斷點檢查它的產出，而不是隻確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Aider 做設計，槓桿最高的迴圈就是把一張參考圖變成可用、響應式的 UI，並反覆迭代直到匹配 —— 用一個支援視覺的模型把產出與參考圖對比，每一輪都提交到 git。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發 —— 並且包含多種狀態（桌面和移動端、懸停、空狀態、載入中），而不只是一張大圖。", "提示詞要具體；含糊的提示詞即便配上強模型也只會產出千篇一律的 UI。", "把你的設計系統和規範放進 CONVENTIONS.md，並告訴 Aider tokens 和標準基礎元件在哪裡。", "跑一個開發伺服器，在真實瀏覽器裡檢查渲染結果，並縮放到各個斷點。", "迭代的方式是讓 Aider 把它的實現與截圖對比 —— 而不只是確認它能構建通過。"]}, {"kind": "p", "text": "在支援視覺的模型上，用 /add 新增一張圖（或用 /paste 從剪貼簿貼上），然後給出具體的約束："}, {"kind": "code", "lang": "bash", "code": "aider --model gpt-4o --read CONVENTIONS.md\n# 在對話裡：\n> /add reference-desktop.png\n> /add reference-mobile.png\n> Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens from CONVENTIONS.md.\n  Match spacing, layout, and hierarchy; make it responsive.\n  I'll render it in the browser and tell you what to fix until it matches\n  the references across breakpoints."}, {"kind": "p", "text": "讓提示詞保持小而聚焦。因為 Aider 會為每次改動提交一次，你就能留住好的迭代，並用 git（或 /undo）回退糟糕的那些 —— 於是每一輪都建立在一個乾淨的基線上。"}]}, {"id": "extend", "heading": "CONVENTIONS.md、影像與命令", "blocks": [{"kind": "p", "text": "有三項能力讓 Aider 在持續的設計工作中切實可用，而這三項都能幹淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "CONVENTIONS.md 上下文", "body": "用 /read CONVENTIONS.md 或 aider --read CONVENTIONS.md 載入編碼與設計規範，或在 .aider.conf.yml 裡設定 read: CONVENTIONS.md 讓它每次執行都載入。這是安放你 tokens、基礎元件和規則的長久之所。"}, {"label": "影像與網頁", "body": "在支援視覺的模型上，用 /add 新增一個影像檔案，或用 /paste 從剪貼簿貼上，給 Aider 一張真實的參考；/web <url> 會把一個頁面的文本抓進對話作為額外上下文。"}, {"label": "對話內命令", "body": "諸如 /add 把檔案納入上下文、/read 引入只讀參考、/undo 回退上一次提交之類的命令，讓它無需離開終端就能收集參考並跑完驗證迴圈。"}]}, {"kind": "p", "text": "這些都是可移植、倉庫原生的能力 —— 正是 Open Design 旨在去編排、而非每個專案重造一遍的那類東西。"}]}, {"id": "vs", "heading": "做設計：Aider vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "在設計工作上沒有唯一的贏家 —— 每個 agent 各有所長，有經驗的團隊會把它們疊著用。一份公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Aider", "開源、模型無關（BYOK）、git 原生；自動提交讓每一輪迭代都可審閱、可回退", "在你已有程式碼庫上、用最擅長設計的模型做倉庫原生的迭代"], ["Codex", "配合前端 skill，視覺精緻度強；沙箱化的非同步構建", "委託式的非同步構建，以及可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）和理解程式碼庫的 UX", "前端推理與大上下文的重構"], ["Cursor", "帶即時預覽和內聯編輯的“邊改邊看”視覺迴圈", "在 IDE 內做緊湊的“迭代即看”UI 工作"], ["Gemini CLI", "強大的多模態影像理解和 100 萬 token 的上下文；開源且有免費檔位", "截圖密集的工作，以及把一整套設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆給出的結論是：品味來自人類 —— 在沒有 skill、參考和約束的情況下，它們全都會退回到一種千篇一律的審美。這才是真正要解決的問題 —— 而它是設計工具形狀的，不是模型形狀的。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避開那股“AI 流水貨”味", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來千篇一律 —— 柔和的漸變、漂浮的面板、過大的圓角、誇張的陰影，一股“Inter 字型加紫色”的味道，“一眼就看出是 AI 做的”。其他被反映的問題還包括移動端佈局錯亂，以及指令洩露進 UI 文案。這些都不是 Aider 獨有的；任何 agent 在缺少精選設計上下文時執行，都會出這些問題。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會迫使 agent 錨定一個真正的方向，而不是那種預設觀感。"}, {"label": "在真實瀏覽器裡驗證", "body": "跨斷點渲染並自檢，讓佈局不會在移動端悄悄崩掉 —— 在支援視覺的模型上，把截圖再喂回去。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖，是撬動產出質量的最大單一槓桿。"}, {"label": "把規則編碼進 CONVENTIONS.md", "body": "把“不要大圖卡片、最多兩種字型、品牌優先的層級”這類風格規則，放在 agent 每次執行都會讀到的地方。"}]}, {"kind": "p", "text": "請注意，每一項對策的核心都是給 agent 一份精選的設計上下文。而手工、逐專案地維護這份上下文，正是 Open Design 替你免去的苦差。"}]}, {"id": "open-design", "heading": "在 Open Design 裡用 Aider 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一直在呼喚的那層開源設計層。它把 Aider 當作一等介面卡，並用一套精選的 skill 與設計系統庫、一條結構化的渲染管線和一個本地桌面 UI 把它包裹起來 —— 於是讓 Aider 變好的那份設計上下文從第一次執行起就已就位，而不是每次都手工拼湊。二者都是開源、本地優先的，這讓它們的搭配天然契合。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Aider 作為你的 agent。", "用你自己的供應商 API key 認證（BYOK）—— OpenAI、Anthropic、DeepSeek 或 Gemini；憑證留在你的機器上，絕不經我們中轉。", "挑一套設計系統和一個 skill，然後以一致的品味生成幻燈片、原型和落地頁。", "每一份產物和 DESIGN.md 檔案都存活在你自己的 git 倉庫裡，而不是某個託管雲端。"]}, {"kind": "p", "text": "同一個 Aider agent、同一把 key —— 外加一套圍繞它的、真實、可移植、開源的設計工作流。它本地優先且開源，所以你的工作和憑證沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Aider 真能做設計工作嗎？", "text": "能 —— 只要上下文裡有一個審美 skill、一套設計系統和真實的參考圖，Aider 就能產出生產級、響應式的 UI；在支援視覺的模型上，它會讀取截圖來把產出與參考對照驗證。缺了這份上下文，它就容易退回到一種千篇一律的觀感，而這正是 Open Design 填補的缺口。"}, {"name": "做設計時我能用哪些模型搭配 Aider？", "text": "Aider 是模型無關的。你自帶 API key，接入幾乎任何 LLM —— Claude、GPT-4o、DeepSeek、Gemini 或本地模型。做基於影像的設計工作時，請用 GPT-4o 或 Claude 這類支援視覺的模型。Open Design 絕不會中轉你的憑證。"}, {"name": "Aider 究竟好在哪裡、特別適合做設計？", "text": "兩點：它是模型無關的，所以你能挑出最擅長你這項任務設計的模型；它是 git 原生的，會提交每一次改動，於是每一輪設計迭代都可審閱、可回退。兩點都有幫助 —— 但品味仍然來自你提供的設計系統、skill 和參考。"}, {"name": "Aider 會編輯我的檔案並提交到 git 嗎？", "text": "會。Aider 直接在你的倉庫裡編輯檔案，並自動為每次改動配上一條合理的提交資訊，於是你可以用早已熟悉的 git 工具來 diff、管理和撤銷 AI 的工作。"}, {"name": "我該如何把我的設計規範交給 Aider？", "text": "建立一個寫有你 tokens、基礎元件和規則的 CONVENTIONS.md，然後用 /read CONVENTIONS.md 或 aider --read CONVENTIONS.md 以只讀方式載入它（或在 .aider.conf.yml 裡設定 read: CONVENTIONS.md 讓它每次執行都載入）。這樣 Aider 對照的就是你的品牌，而不是某種預設觀感。"}, {"name": "Open Design 和 Aider 有關聯嗎？", "text": "沒有。Aider 是一個獨立的開源專案（Aider-AI）；Open Design 是另一個獨立的開源專案，把 Aider 作為一等介面卡來支援。二者並無關聯。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全 —— Open Design 本地優先且開源。你的檔案、產物和 DESIGN.md 都留在你自己的 git 倉庫裡，而你的供應商 API key 由你的 agent 直接使用，絕不經 Open Design 的伺服器轉發。"}], "ctaTitle": "用開放的方式，與 Aider 一起做設計。", "ctaBody": "自帶你的供應商 API key，讓每一個檔案都留在你的 git 倉庫本地，併為你早已在用的 agent 配上一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 裡使用 Aider", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'antigravity': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['antigravity']!,
      title: "用 Antigravity 做設計 — Open Design",
      description: "人們如何使用 Google Antigravity——Google 推出的、由多模態 Gemini 3.x 模型驅動的 agent 優先開發平臺，配備編輯器檢視、管理面板、整合瀏覽器控制與 Artifacts——來做 UI 和網頁設計，以及 Open Design 如何把 Antigravity 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "Antigravity",
      label: "Agent · Antigravity",
      heading: "用 Antigravity 做設計。",
      lead: "Antigravity 是 Google 的 agent 優先開發平臺。它的 Gemini 3.x 模型能讀取截圖並對佈局進行推理，它的整合瀏覽器讓 agent 能驗證自己構建的成果，它的 Artifacts 把 agent 的工作變成可審閱的交付物——只要你給它參考圖、規範和一套驗證閉環，它就是一個真正的設計工具。Open Design 把它接入一套開源設計工作流：用你自己的 Google 賬號、你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Antigravity 變成一個本地優先、開源的設計 agent——用你自己的 Google 賬號、你自己的檔案，圍繞它構建一套精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Antigravity", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Antigravity 是 Google 的 agent 優先開發平臺，與 Gemini 3 同時釋出。有三點讓它在設計領域格外值得關注：它的 agent 執行在原生多模態的 Gemini 3.x 模型上，因此能讀懂一張截圖，並對佈局、間距和層級進行推理；它內建了一個 agent 可以操控的整合瀏覽器，因此會渲染並檢查自己做出的 UI，而不是憑空猜測；它還會產出 Artifacts——任務清單、實現方案、截圖和瀏覽器錄製——把 agent 的工作變成你真正可以審閱的東西。配上合適的參考圖、規範和一套驗證閉環，它就能構建出真正的響應式 UI——而且用一個 Google 賬號就能免費上手。這是一份關於如何用 Antigravity 做 UI、前端和設計系統工作，並把它接入一套結構化設計工作流（搭配 Open Design）的、務實的端到端指南。", "本文涵蓋：Antigravity 究竟是什麼，為什麼多模態 Gemini 加整合瀏覽器很適合設計，如何從零搭建，截圖到 UI 的閉環，它的 agent 上下文與工具如何擴充套件它，它與 Codex、Claude Code、Cursor、Gemini CLI 相比如何，哪些坑會讓 AI 產出看起來千篇一律，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合這道鴻溝——這是一對天然的搭檔，因為 Open Design 本身就是開源的，並執行在你自己的機器上。"], "heroImage": {"src": "/agents/antigravity-design/antigravity-design-hero.webp", "alt": "Antigravity 設計反饋閉環：一個 agent 優先的 IDE 讀取參考圖、一個整合瀏覽器渲染 UI、一個管理面板，以及一條迴環的反饋箭頭", "caption": "核心閉環：Antigravity agent 讀取你的參考圖，在整合瀏覽器中構建並驗證 UI，再對照參考圖迭代——並把工作以可審閱的 Artifacts 形式呈現出來。"}, "tocLabel": "本頁目錄", "toc": [{"id": "what-is-antigravity", "label": "Antigravity 究竟是什麼"}, {"id": "why-design", "label": "為什麼多模態 Gemini + 內建瀏覽器適合設計"}, {"id": "setup", "label": "為設計搭建 Antigravity（從零開始）"}, {"id": "screenshot-workflow", "label": "截圖到 UI 的工作流"}, {"id": "extend", "label": "Agent 上下文、工具與 Artifacts"}, {"id": "vs", "label": "Antigravity vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "常見坑與“AI 味”觀感"}, {"id": "open-design", "label": "在 Open Design 中用 Antigravity 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-antigravity", "heading": "Antigravity 究竟是什麼", "blocks": [{"kind": "p", "text": "Antigravity 是 Google 的 agent 優先開發平臺——一個為自主 agent（而非側邊欄聊天機器人）幹活而打造的 AI 驅動 IDE。它於 2025 年 11 月 18 日與 Gemini 3 一同釋出，並在公開預覽階段面向個人免費開放，讓你能把複雜的、跨多種工具的軟體任務委託給一個跨編輯器、終端和整合瀏覽器運作的 agent。它的 agent 主要執行在 Google 的多模態 Gemini 3.x 模型上。"}, {"kind": "p", "text": "對於設計工作來說，有三點尤為突出。它的 agent 能讀取截圖並對真實佈局進行推理，因為 Gemini 3.x 是原生多模態的。它能操控一個真實的瀏覽器，因此會渲染並驗證自己構建的成果。它還會呈現 Artifacts——任務清單、方案、截圖和瀏覽器錄製——讓你審閱的是看得見摸得著的產出，而非原始的工具日誌。"}, {"kind": "steps", "items": [{"label": "編輯器檢視 + 管理面板", "body": "編輯器檢視是一個熟悉的 AI IDE，帶有 Tab 補全和內聯命令；管理面板讓你能跨工作區生成、編排並觀察多個非同步工作的 agent——是跑一個長時設計任務的理想之處。"}, {"label": "整合瀏覽器 + Artifacts", "body": "Agent 可以在內建瀏覽器中操作，併產出你可以留下反饋的 Artifacts（截圖、瀏覽器錄製、任務清單、方案）——一套內建於平臺、而非事後拼接上去的驗證閉環。"}, {"label": "免費上手", "body": "用個人 Google 賬號登入即可獲得 Gemini 3.x 的寬鬆速率限額；該平臺可在 macOS、Windows 和 Linux 上執行。"}]}, {"kind": "ul", "items": ["廠商：Google", "憑證：Google 賬號（個人 Gmail），公開預覽期間免費", "執行檔：用 agy 啟動；可在 macOS、Windows 和 Linux 上執行"]}]}, {"id": "why-design", "heading": "為什麼多模態 Gemini 和內建瀏覽器適合設計", "blocks": [{"kind": "p", "text": "Antigravity 的設計優勢來自模型與平臺的合力——但和每一個 agent 一樣，品味仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "強大的多模態理解", "body": "由於 Gemini 3.x 是原生多模態的，agent 能很好地讀懂參考截圖——把自己渲染出的成果與一張圖片對照，而不是從一段文字描述裡猜。"}, {"label": "用整合瀏覽器來驗證", "body": "Agent 操控一個真實的瀏覽器，因此會渲染 UI、跨各種狀態檢查它、揪出錯亂的佈局——並把結果捕獲為一段你可以審閱的瀏覽器錄製 Artifact。"}, {"label": "agent 會讀取的規範", "body": "把你的 tokens、元件和審閱規則寫進 agent 的專案上下文，讓它對照你的品牌來工作，而不是套用一套預設觀感。"}]}, {"kind": "image", "src": "/agents/antigravity-design/antigravity-design-taste-triangle.webp", "alt": "示意圖，展示設計系統、skill 和參考圖三者匯聚成優秀的設計產出", "caption": "品味來自你提供的三項輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這條經驗和每一個 agent 教給我們的一樣：Antigravity 預設並不具備品味。當你給它約束——一套設計系統、一個審美 skill 和具體的參考圖——它就能產出優秀的設計。Open Design 恰恰把這些輸入打包好了，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始為設計工作搭建 Antigravity", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Antigravity agent 的完整路徑。預覽期間應用內的具體選單可能會變動，所以這裡只講你能放心依賴的層面。"}, {"kind": "code", "lang": "bash", "code": "# 1. 從官方下載頁 antigravity.google/download\n#    為你的作業系統（macOS、Windows、Linux）下載 Antigravity\n\n# 2. 啟動它並登入\nagy               # 開啟 Antigravity；用你的 Google 賬號登入\n\n# 3. 接受資料使用政策、選一個主題，並開啟你的專案資料夾\n\n# 4. 在編輯器檢視或管理面板中啟動一個 agent 任務，\n#    選擇一個 Gemini 3.x 模型（例如 Gemini 3.1 Pro）"}, {"kind": "image", "src": "/agents/antigravity-design/antigravity-design-setup-flow.webp", "alt": "五步搭建流程：下載、用 Google 登入、開啟專案、新增設計規則和一個 skill、啟用瀏覽器驗證", "caption": "搭建順序：下載 → 用 Google 登入 → 開啟你的專案 → 新增設計規則和一個 skill → 用整合瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "編入你的設計規則", "body": "把你的 tokens、基礎元件和規範放進 agent 的專案上下文，讓產出貼合一個品牌，而不是退回到一套千篇一律的觀感。"}, {"label": "使用整合瀏覽器", "body": "讓 agent 在 Antigravity 的內建瀏覽器中渲染，並跨各種斷點檢查產出——驗證的是 UI 看起來是否正確，而不僅僅是構建有沒有通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Antigravity 時最高槓桿的設計閉環，就是把一張參考圖轉化為可用的響應式 UI，並不斷迭代直到吻合——靠多模態模型把產出與參考圖對照，靠整合瀏覽器來驗證它。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發——並納入多種狀態（桌面端和移動端、懸停、空態、載入態），而不只是一張大圖。", "提示詞要具體；含糊的提示詞即便配上強力模型也只會產出千篇一律的 UI。", "把你的設計系統和規範留在 agent 的專案上下文裡，並告訴它 tokens 和規範的基礎元件在哪裡。", "讓 agent 在 Antigravity 的整合瀏覽器中渲染，並調整到各個斷點來檢查結果。", "通過讓 agent 把自己的實現與截圖對照來迭代——而不只是確認它能構建——並審閱它產出的瀏覽器錄製和截圖 Artifacts。"]}, {"kind": "p", "text": "附上你的參考圖、給出具體約束，然後讓 agent 在瀏覽器裡驗證："}, {"kind": "code", "lang": "text", "code": "# 在一個 Antigravity agent 任務中，附上 reference-desktop.png 和\n# reference-mobile.png，然後輸入提示詞：\n\n用 React + Vite + Tailwind + TypeScript 實現這個設計。\n複用我已有的設計系統元件和 tokens。\n匹配間距、佈局和層級；做成響應式。\n在整合瀏覽器中渲染並迭代，直到它跨各個斷點都與\n參考圖吻合，並把截圖展示給我。"}, {"kind": "p", "text": "保持提示詞小而聚焦，提交好的迭代、回退壞的迭代（回退時告訴 agent），這樣每一輪都能在乾淨的基底上推進。"}]}, {"id": "extend", "heading": "Agent 上下文、工具與 Artifacts", "blocks": [{"kind": "p", "text": "有三個擴充套件點讓 Antigravity 適合持續的設計工作，而這三者都能幹淨利落地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "專案上下文", "body": "持久化的專案規則是你設計規範的長久歸宿——agent 在每個任務中都會讀取的 tokens、基礎元件和審閱清單，讓產出始終貼合品牌。"}, {"label": "整合瀏覽器 + 終端", "body": "Agent 跨編輯器、終端和內建瀏覽器操作，因此能收集參考、跑一個開發伺服器，並驗證渲染出的 UI，全程不必離開平臺。"}, {"label": "你來審閱的 Artifacts", "body": "任務清單、實現方案、截圖和瀏覽器錄製讓 agent 的工作清晰可讀；你在 Artifact 上留下反饋，agent 據此吸收修正。"}]}, {"kind": "p", "text": "這些正是一套嚴肅的設計閉環所需的能力——也恰恰是 Open Design 被設計來編排（而非每個專案重新造一遍）的那類東西。"}]}, {"id": "vs", "heading": "做設計時 Antigravity vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "設計工作沒有唯一贏家——每個 agent 各有所長，有經驗的團隊會把它們疊加使用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Antigravity", "agent 優先的 IDE，搭配多模態 Gemini 3.x、用於自我驗證的整合瀏覽器，以及可審閱的 Artifacts；預覽期免費", "帶內建瀏覽器 UI 驗證的非同步多 agent 構建"], ["Codex", "帶前端 skill 的出色視覺打磨；沙箱化的非同步構建", "委託式非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（色值、間距、字型）以及理解程式碼庫的 UX", "前端推理與大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的“邊構建邊看”視覺閉環", "在 IDE 內緊湊的“邊迭代邊看”UI 工作"], ["Gemini CLI", "執行在多模態 Gemini 上的開源終端 agent，帶 1M tokens 上下文和免費檔", "大量依賴截圖的終端工作，以及把整套設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人——它們在沒有 skill、參考和約束時都會退回到一套千篇一律的審美。這才是真正要解決的問題——而它是設計工具形態的，不是模型形態的。"}]}, {"id": "pitfalls", "heading": "常見坑，以及如何避免“AI 味”觀感", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的吐槽是它看起來千篇一律——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一股 Inter 字型配紫色、“一看就是 AI 做的”的味道。其他被反映的問題還包括移動端佈局錯亂，以及指令洩漏進 UI 文案。這些都不是 Antigravity 獨有的；它們是任何 agent 在缺乏精選設計上下文時執行的必然結果。"}, {"kind": "steps", "items": [{"label": "加上一個審美 skill", "body": "一個精選的設計 skill 會逼著 agent 確定一個真實的方向，而不是套用預設觀感。"}, {"label": "在整合瀏覽器中驗證", "body": "用多模態模型和 Antigravity 的內建瀏覽器跨各個斷點渲染並自檢，讓佈局不會在移動端悄無聲息地崩掉。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖是撬動產出質量的最大單一槓桿。"}, {"label": "把規則編入專案上下文", "body": "把“不用大圖卡片、最多兩種字型、品牌優先的層級”這類風格規則，放在 agent 每個任務都會讀到的地方。"}]}, {"kind": "p", "text": "注意，每一項緩解措施都是在給 agent 一份精選的設計上下文。逐個專案手工維護那份上下文，正是 Open Design 替你免去的苦活。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Antigravity 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一再呼喚的開源設計層。它把 Antigravity 當作一等公民介面卡，並用一套精選的 skill 與設計系統庫、一條結構化的渲染流水線，以及一個本地桌面 UI 把它包起來——這樣，讓 Antigravity 變好的那份設計上下文從第一次執行起就在那兒，而不必每次都手工拼裝。Open Design 是開源且本地優先的，這讓這對搭檔天然契合。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 Antigravity 作為你的 agent。", "用你的 Google 賬號認證——憑證留在你的機器上，絕不經我們中轉。", "挑一套設計系統和一個 skill，然後以一致的品味生成演示稿、原型和落地頁。", "每一個 artifact 和 DESIGN.md 檔案都存在你自己的倉庫裡，而非託管雲端。"]}, {"kind": "p", "text": "還是同一個 Antigravity agent、同一個 Google 賬號——只是外面多了一套真實、可移植、開源的設計工作流。Open Design 本地優先且採用 Apache-2.0，因此你的工作或憑證沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Antigravity 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一套設計系統和真實的參考圖，Antigravity 就能產出生產級的響應式 UI，而它多模態的 Gemini 3.x agent 會在整合瀏覽器中驗證產出。缺了這份上下文，它就容易退回到一套千篇一律的觀感，而這正是 Open Design 來填補的缺口。"}, {"name": "用 Antigravity 做設計需要付費嗎？", "text": "Antigravity 在公開預覽階段面向個人免費開放，用個人 Google 賬號登入時可享 Gemini 3.x 的寬鬆速率限額。無論如何，Open Design 都絕不會中轉你的憑證。"}, {"name": "Antigravity 具體為什麼適合做設計？", "text": "三點：它的 agent 執行在原生多模態、能很好讀懂參考截圖的 Gemini 3.x 模型上；它內建了一個 agent 可操控、用來驗證 UI 的整合瀏覽器；它還會呈現 Artifacts——截圖和瀏覽器錄製——供你審閱。品味仍然來自你提供的設計系統、skill 和參考。"}, {"name": "前端設計該用 Antigravity 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體、理解程式碼庫的設計決策見長；Antigravity 的優勢在於它 agent 優先的平臺——多模態 Gemini 3.x、用於驗證的整合瀏覽器，以及可審閱的 Artifacts。許多團隊兩者並用——Open Design 讓你能切換 agent 而無需改變你的設計工作流。"}, {"name": "我該如何驗證 Antigravity 構建的成果？", "text": "Antigravity 內建了一個 agent 可操控的整合瀏覽器，因此它們會渲染 UI、跨各個斷點檢查它，並把截圖和瀏覽器錄製捕獲為 Artifacts。審閱這些 Artifacts——並讓 agent 把自己的產出與你的參考對照——就是你讓結果不偏離規範的方式。"}, {"name": "Open Design 與 Google 有關聯嗎？", "text": "沒有。Antigravity 是 Google 的產品；Open Design 是一個獨立的開源專案，以一等公民介面卡的形式支援它。Antigravity 和 Gemini 是 Google 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0。你的檔案、artifact 和 DESIGN.md 都留在你自己的倉庫裡，而你的 Google 憑證由你的 agent 直接使用，絕不經由 Open Design 伺服器中轉。"}], "ctaTitle": "用開放的方式，用 Antigravity 做設計。", "ctaBody": "帶上你自己的 Google 賬號，讓每個檔案都留在本地，並圍繞你已在用的 agent 獲得一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Antigravity", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'reasonix': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['reasonix']!,
      title: "DeepSeek Reasonix 用於設計 — Open Design",
      description: "人們如何使用 DeepSeek Reasonix——這個由社群構建、DeepSeek 原生的終端編碼代理——來做 UI 和網頁設計，以及 Open Design 如何把它變成一個本地優先、開源的設計代理。BYOK，使用你自己的 DeepSeek API key。",
      breadcrumb: "DeepSeek Reasonix",
      label: "代理 · DeepSeek Reasonix",
      heading: "DeepSeek Reasonix 用於設計。",
      lead: "DeepSeek Reasonix 是一個開源、由社群構建、基於 DeepSeek 模型的終端編碼代理。它能讀取你的倉庫、編輯檔案並低成本地執行你的驗證迴圈——它的整個設計都圍繞 DeepSeek 的字首快取構建，從而讓長會話保持經濟實惠。配上參考素材、規範和瀏覽器校驗，它就成了一個真正的設計工具。Open Design 把它接入一套開源的設計工作流：用你自己的 DeepSeek API key、你自己的檔案、本地優先。",
      rich: {"heroCtaLead": "Open Design 把 DeepSeek Reasonix 變成一個本地優先、開源的設計代理——用你自己的 DeepSeek API key、你自己的檔案，外加圍繞它的一套精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 DeepSeek Reasonix", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["DeepSeek Reasonix 是一個面向終端、開源、由社群構建的 AI 編碼代理，基於 DeepSeek 的模型。它不是 DeepSeek 的官方產品——它由 esengine 這位 GitHub 作者和社群維護，並且專門圍繞 DeepSeek 的字首快取機制構建，從而讓長時間、迭代式的會話保持低成本。它能讀取你的倉庫、編輯檔案、執行命令，並從自然語言任務出發工作，而不只是補全程式碼行。你自帶 DeepSeek API key（BYOK），代理執行在 deepseek-v4-pro 和 deepseek-v4-flash 等 DeepSeek 模型上。這是一份實用、端到端的指南，介紹如何用 DeepSeek Reasonix 來做 UI、前端和設計系統工作，以及如何用 Open Design 把它接入一套結構化的設計工作流。", "本文涵蓋：DeepSeek Reasonix 究竟是什麼，為什麼一個成本高效、由 DeepSeek 驅動的代理適合迭代式設計，如何用你自己的 key 從零開始搭建它，從參考到 UI 的迴圈，skill 和 MCP 如何擴充套件它，它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比，那些讓 AI 產出顯得千篇一律的陷阱，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合這一差距——這是天然的搭配，因為兩者都是開源的，且都執行在你自己的機器上。"], "heroImage": {"src": "/agents/reasonix-design/reasonix-design-hero.webp", "alt": "DeepSeek Reasonix 設計反饋迴圈：一個終端代理讀取設計參考、一個瀏覽器渲染 UI、一個工作區，以及一個迴環的反饋箭頭", "caption": "核心迴圈：DeepSeek Reasonix 在終端中依據你的參考素材和規範工作，你在真實瀏覽器中校驗 UI，它再迭代——而且很便宜，這要歸功於 DeepSeek 的字首快取。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-reasonix", "label": "DeepSeek Reasonix 究竟是什麼"}, {"id": "why-design", "label": "為什麼成本高效的 DeepSeek 代理適合做設計"}, {"id": "setup", "label": "從零搭建用於設計的 DeepSeek Reasonix"}, {"id": "screenshot-workflow", "label": "從參考到 UI 的工作流"}, {"id": "extend", "label": "Skill、MCP 與配置"}, {"id": "vs", "label": "DeepSeek Reasonix 對比 Codex、Claude Code、Cursor 與 Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與“AI 味”觀感"}, {"id": "open-design", "label": "在 Open Design 中用 DeepSeek Reasonix 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-reasonix", "heading": "DeepSeek Reasonix 究竟是什麼", "blocks": [{"kind": "p", "text": "DeepSeek Reasonix 是一個面向終端、開源（MIT）的 AI 編碼代理，由 esengine 這位 GitHub 作者和社群構建。它是 DeepSeek 原生的：圍繞 DeepSeek 的字首快取機制設計，從而讓長時間、迭代式的會話保持低成本。它能讀取你的倉庫，用一個帶審查門控的 SEARCH/REPLACE 編輯器編輯檔案，執行 shell 命令，並從自然語言任務出發工作——會規劃和驗證，而不只是補全程式碼行。需要明確的是，這是一個社群專案，而非 DeepSeek 公司的官方產品。"}, {"kind": "p", "text": "對設計工作而言，關鍵在於它是一個有能力、瞭解倉庫的編碼代理，以低成本執行在強大的 DeepSeek 模型上。它所用的 DeepSeek 模型是純文本的——它們並不原生讀取影像——所以實際的設計迴圈是參考驅動的，並在真實瀏覽器中校驗，而不是讓代理直接“看”一張截圖。成本高效是與設計相關的真正優勢：你可以多次迭代 UI，而不必擔心那筆通常會讓人放棄緊湊迴圈的賬單。"}, {"kind": "steps", "items": [{"label": "DeepSeek 原生，BYOK", "body": "Reasonix 執行在 deepseek-v4-pro 和 deepseek-v4-flash 等 DeepSeek 模型上。你自帶 DeepSeek API key——憑證存放在你的環境中，而不在代理的配置裡。"}, {"label": "瞭解倉庫的編輯", "body": "它用一個帶審查門控的編輯器讀取並編輯你專案中的檔案，並執行 shell 命令，因此可以在你自己的倉庫中構建和迭代真實的 UI 程式碼。"}, {"label": "Skill + MCP", "body": "它支援用 Markdown 編寫的 skill 和 MCP 伺服器，因此你可以為它提供持久的規範，並接入像設計源這樣的外部上下文。"}]}, {"kind": "ul", "items": ["供應方：社群 / esengine 這位 GitHub 作者（不是 DeepSeek 公司）", "憑證：你自己的 DeepSeek API key（BYOK），通過環境變數提供", "許可：MIT，開源"]}]}, {"id": "why-design", "heading": "為什麼成本高效的 DeepSeek 代理適合做設計", "blocks": [{"kind": "p", "text": "DeepSeek Reasonix 的設計優勢不在於某項炫目的單一能力，而更在於讓迭代式 UI 工作變得便宜且可重複——但和每個代理一樣，審美仍需由人來提供。"}, {"kind": "steps", "items": [{"label": "便宜、緊湊的迭代", "body": "因為它圍繞 DeepSeek 的字首快取設計，長時間的設計會話保持實惠——所以你可以多次執行“構建-校驗-精修”迴圈，而不必精打細算地省著用。"}, {"label": "瞭解倉庫的複用", "body": "它直接在你的倉庫中編輯檔案，因此當你把它指向現有元件和 tokens 時，它能複用它們，而不是臨時發明一次性的樣式。"}, {"label": "規範寫入 skill", "body": "Markdown skill 和專案配置讓你能把 tokens、元件和審查規則編碼進去，從而讓代理依據你的品牌工作，而不是套用預設觀感。"}]}, {"kind": "image", "src": "/agents/reasonix-design/reasonix-design-taste-triangle.webp", "alt": "圖示展示設計系統、skill 和參考影像匯聚成優秀的設計產出", "caption": "審美來自你提供的三項輸入：一個設計系統、一個 skill，以及真實的參考影像。"}, {"kind": "p", "text": "這個教訓和每個代理給出的是同一個：DeepSeek Reasonix 預設並不具備審美。當你給它約束時，它才會產出好的設計——一個設計系統、一個審美 skill，以及向它描述清楚的具體參考——再加上一個用來校驗的瀏覽器。Open Design 恰好打包了這些輸入，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零搭建用於設計工作的 DeepSeek Reasonix", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器，到一個能夠構建並校驗 UI 的 DeepSeek Reasonix 的路徑。因為它是一個社群專案，請始終遵循倉庫 README 中的安裝說明；下面的提綱只是大致的形態。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 DeepSeek Reasonix（Node 22+）—— 參見倉庫 README\nnpm install -g reasonix\n\n# 2. 自帶你的 DeepSeek API key（BYOK）\n#    Reasonix 從你的環境讀取它，而不是從配置檔案讀取。\nexport DEEPSEEK_API_KEY=sk-...    # 你的 DeepSeek key\n\n# 3. 在你的專案中啟動它\ncd your-project\nreasonix                         # 確切的子命令見 README\n\n# 4. 通過 MCP 新增一個設計源（可選）\n#    例如一個 Figma MCP 伺服器，按倉庫文件配置"}, {"kind": "image", "src": "/agents/reasonix-design/reasonix-design-setup-flow.webp", "alt": "五步搭建流程：安裝、新增你的 DeepSeek key、配置規範、新增 skill、在瀏覽器中校驗", "caption": "搭建順序：安裝 → 新增你的 DeepSeek API key → 編碼規範 → 新增 skill → 啟用瀏覽器校驗。"}, {"kind": "steps", "items": [{"label": "編碼你的設計規則", "body": "把你的 tokens、基礎元素和規範放進一個 skill 或專案配置，並把 Reasonix 指向它們，從而讓產出貼合某個品牌，而不是退回到千篇一律的觀感。"}, {"label": "加入瀏覽器校驗", "body": "由於 DeepSeek 模型是純文本的，接入一個 Playwright 或瀏覽器 MCP，讓代理在真實瀏覽器中渲染並跨斷點檢查其產出，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "從參考到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 DeepSeek Reasonix 做設計時，槓桿最高的迴圈是把清晰的參考轉化為可用、響應式的 UI，並迭代到匹配為止。因為 DeepSeek 模型是純文本的，參考是以詳細的描述和規格餵給它的——而不是被原生地當作影像讀取——匹配則通過在真實瀏覽器中渲染來確認。"}, {"kind": "ol", "items": ["把你的參考翻譯成具體的規格——用文字描述佈局、間距、層級和各種狀態（桌面和移動端、懸停、空狀態、載入中），因為模型讀的是文字，不是畫素。", "在提示詞中要具體；即便用上強模型，含糊的提示詞也只會產出千篇一律的 UI。", "把你的設計系統和規範放進一個 skill 或專案配置，並告訴 Reasonix tokens 和規範化基礎元素的位置。", "執行一個開發伺服器，在真實瀏覽器中校驗結果，並縮放到各個斷點——接入一個瀏覽器 MCP，讓代理可以自檢。", "通過在瀏覽器中把渲染出的 UI 與你的參考相互比對來迭代——而不只是確認它能構建。"]}, {"kind": "p", "text": "在提示詞中給代理具體的約束，而不是一份含糊的簡報："}, {"kind": "code", "lang": "bash", "code": "reasonix\n# 在提示詞中：\n> 用 React + Vite + Tailwind + TypeScript 實現這個設計。\n  參考：兩欄式 hero、48px 垂直節奏、品牌青綠色\n  強調色、system-ui 字型——桌面和移動端見 DESIGN.md 中的描述。\n  複用我現有的設計系統元件和 tokens。\n  匹配間距、佈局和層級；做成響應式。\n  在瀏覽器中渲染它，並迭代到跨斷點都與規格匹配為止。"}, {"kind": "p", "text": "保持提示詞小而聚焦，提交好的迭代、回退壞的迭代（在你回退時告訴 Reasonix），這樣每一輪都建立在一個乾淨的基礎上——也讓那個便宜、對快取友好的迴圈保持高效。"}]}, {"id": "extend", "heading": "Skill、MCP 與配置", "blocks": [{"kind": "p", "text": "有幾個擴充套件點讓 DeepSeek Reasonix 在持續的設計工作中變得實用，而且它們與一套開放的設計工作流能幹淨地對應起來。"}, {"kind": "steps", "items": [{"label": "Markdown skill", "body": "Reasonix 支援用 Markdown 編寫的 skill——這是承載你設計規範、tokens 和審查清單的持久之所，每次執行都會被應用。"}, {"label": "MCP 伺服器", "body": "它整合 MCP 伺服器，這是引入設計上下文和外部工具的可移植方式——其中最相關的是像 Figma MCP 伺服器這樣的設計源——並且它們能跨代理通用，而不只限於 Reasonix。"}, {"label": "專案配置與內建工具", "body": "按專案劃分的配置，加上內建的檔案、shell 和網頁工具，讓它無需離開終端就能收集上下文並執行驗證迴圈。確切的配置路徑請查閱倉庫 README。"}]}, {"kind": "p", "text": "這些都是可移植、跨代理的能力——正是 Open Design 旨在編排的那類東西，而不是在每個專案裡重新造一遍。"}]}, {"id": "vs", "heading": "DeepSeek Reasonix 對比 Codex、Claude Code、Cursor 與 Gemini CLI 做設計", "blocks": [{"kind": "p", "text": "做設計工作並沒有唯一的贏家——每個代理各有不同的強項，經驗豐富的團隊會把它們疊加使用。一個公允的小結："}, {"kind": "table", "columns": ["代理", "設計強項", "最適合"], "rows": [["DeepSeek Reasonix", "開源且由 DeepSeek 驅動；通過字首快取做到成本高效，BYOK 使用你自己的 DeepSeek key（社群構建，純文本模型）", "在你自己的倉庫裡做便宜、高頻的 UI 迭代"], ["Codex", "配合前端 skill 有出色的視覺打磨；沙箱化的非同步構建", "委派式非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex 值、間距、字型）以及瞭解程式碼庫的 UX", "前端推理和大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的視覺化“邊構建邊看”迴圈", "在 IDE 內做緊湊的“邊迭代邊觀察”UI 工作"], ["Gemini CLI", "強大的多模態影像理解和 1M-token 上下文；開源且帶免費額度", "截圖密集型工作，以及把整個設計系統保持在上下文裡"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人類——沒有 skill、參考和約束，它們全都會預設退回到一種千篇一律的觀感。這才是真正要解決的問題——而且它是設計工具形態的，不是模型形態的。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避免“AI 味”觀感", "blocks": [{"kind": "p", "text": "關於 AI 生成設計最常見的抱怨，就是它看起來千篇一律——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一股 Inter 加紫色的味道，“一眼就知道是 AI 做的”。其他被報告的問題還包括移動端佈局錯亂，以及指令洩漏進 UI 文案裡。這些都不是 DeepSeek Reasonix 獨有的；當任何代理在沒有精選設計上下文的情況下執行時，都會出現這些情況——而且因為它的模型是純文本的，精確地描述參考就更加重要。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會迫使代理拿出一個真正的方向，而不是套用預設觀感。"}, {"label": "在真實瀏覽器中校驗", "body": "由於模型看不見，要在真實瀏覽器中跨斷點渲染並自檢，這樣佈局就不會在移動端悄無聲息地崩壞。"}, {"label": "提供 tokens 和描述清楚的參考", "body": "真實的設計 tokens 和被精確描述的參考狀態，是對純文本代理產出質量影響最大的單一槓桿。"}, {"label": "把規則編碼進 skill 或配置", "body": "把“不用 hero 卡片、最多兩種字型、品牌優先的層級”這類風格規則放在代理每次執行都會讀到的地方。"}]}, {"kind": "p", "text": "請注意，每一項緩解措施都是在給代理提供一份精選的設計上下文。逐個專案手工維護那份上下文，正是 Open Design 幫你省去的苦差事。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 DeepSeek Reasonix 做設計", "blocks": [{"kind": "p", "text": "Open Design 就是上述工作流一再呼喚的那個開源設計層。它把 DeepSeek Reasonix 當作一等介面卡，併為它包裹上一套精選的 skill 與設計系統庫、一條結構化的渲染流水線，以及一個本地桌面 UI——這樣，讓 Reasonix 變好的那份設計上下文從第一次執行起就在那裡，而不必每次手工拼湊。兩者都是開源、本地優先的，這讓這對組合成為天然契合。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 DeepSeek Reasonix 作為你的代理。", "用你自己的 DeepSeek API key 進行認證（BYOK）——憑證留在你的機器上，絕不經我們代理轉發。", "挑選一個設計系統和一個 skill，然後以一致的審美生成演示稿、原型和落地頁。", "每一個產物和 DESIGN.md 檔案都存放在你自己的倉庫裡，而不是託管的雲端。"]}, {"kind": "p", "text": "還是同一個 DeepSeek Reasonix 代理、同一把 key——只是圍繞它多了一套真實、可移植、開源的設計工作流。它本地優先且開源，所以關於你的工作或憑證的一切都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "DeepSeek Reasonix 真的能做設計工作嗎？", "text": "能——配上一個審美 skill、一個設計系統，以及上下文中被精確描述的參考，DeepSeek Reasonix 能在你自己的倉庫裡產出生產級、響應式的 UI，而你則在真實瀏覽器中校驗產出。它的 DeepSeek 模型是純文本的，所以這個迴圈是“描述參考並校驗”，而不是“讀取影像”。沒有那份上下文，它往往會退回到一種千篇一律的觀感，而這正是 Open Design 所填補的空白。"}, {"name": "用 DeepSeek Reasonix 做設計需要付費嗎？", "text": "你自帶 DeepSeek API key，所以你為用量向 DeepSeek 付費（BYOK）——但代理圍繞 DeepSeek 的字首快取構建，從而在長會話中把這筆成本壓低。Reasonix 本身是免費的，採用 MIT 許可。Open Design 絕不會代理轉發你的憑證。"}, {"name": "DeepSeek Reasonix 是 DeepSeek 的官方產品嗎？", "text": "不是。DeepSeek Reasonix 是 esengine 這位 GitHub 作者打造的、由社群構建的開源專案——它執行在 DeepSeek 的模型上並使用 DeepSeek API key，但它並非由 DeepSeek 公司製作或背書。DeepSeek 是其各自所有者的商標。"}, {"name": "做前端設計，選 DeepSeek Reasonix 還是 Claude Code？", "text": "兩者都能做真正的設計工作。Claude Code 以具體、瞭解程式碼庫的設計決策著稱；DeepSeek Reasonix 的優勢在於開源且成本高效，用你自己的 key 在 DeepSeek 模型上做便宜、高頻的迭代。許多團隊會同時用不止一個——Open Design 讓你在不改變設計工作流的前提下切換代理。"}, {"name": "我如何把 DeepSeek Reasonix 連線到像 Figma 這樣的設計源？", "text": "Reasonix 支援 MCP 伺服器，所以你可以按倉庫文件新增一個設計源 MCP（例如一個 Figma MCP 伺服器）。代理隨後就能把真實的設計上下文——元件、變數、佈局資料——作為它可以處理的文本拉取進來，從而讓生成的程式碼與設計源相匹配，而不是近似還原。"}, {"name": "Open Design 與 DeepSeek 有從屬關係嗎？", "text": "沒有。DeepSeek Reasonix 是一個執行在 DeepSeek 模型上的社群專案；Open Design 是一個獨立的開源專案，把它作為一等介面卡來支援。它與 DeepSeek 公司和 Reasonix 維護者都沒有從屬關係。DeepSeek 是其各自所有者的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且開源。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的 DeepSeek API key 由你的代理直接使用，絕不會經 Open Design 伺服器轉發。"}], "ctaTitle": "以開放的方式，用 DeepSeek Reasonix 做設計。", "ctaBody": "自帶你的 DeepSeek API key，讓每一個檔案都留在本地，併為你已經在用的那個開源代理配上一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 DeepSeek Reasonix", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的代理"},
    },
    'hermes': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['hermes']!,
      title: "用 Hermes 做設計 — Open Design",
      description: "人們如何用 Nous Research 的 Hermes（這款自主、多供應商的終端編碼 agent）做 UI 和網頁設計，以及 Open Design 如何把它變成一個本地優先、開源的設計 agent——使用你自己的 xAI、OpenAI 或 Anthropic 金鑰。",
      breadcrumb: "Hermes",
      label: "Agent · Hermes",
      heading: "用 Hermes 做設計。",
      lead: "Hermes 是 Nous Research 推出的開源自主終端 agent。它在自己的機器上自主規劃、執行並委派工作——而且不繫結供應商，所以你可以自帶 xAI、OpenAI 或 Anthropic 金鑰。一旦你給它參考素材、規範和一套驗證閉環，這份自主性就讓它成為真正的設計工具。Open Design 把它接入一套開源設計工作流：你的金鑰、你的檔案、本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Hermes 變成一個本地優先、開源的設計 agent——你自己的 xAI、OpenAI 或 Anthropic 金鑰、你的檔案，外加圍繞它的一套精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Hermes", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Hermes 是 Nous Research 推出的開源自主 AI agent。有兩點讓它對設計而言格外有意思：它是真正意義上的 agentic（自主代理），會規劃任務、執行任務，並把區域性工作委派給隔離的子 agent，而不只是逐行補全；它還不繫結供應商，所以你可以把它指向你信任的任意模型——預設是 xAI Grok，也可通過自帶金鑰用 OpenAI 和 Anthropic。配上合適的參考素材、規範和一套驗證閉環，它就能在你自己的機器上構建真實、響應式的 UI。這是一份實用的端到端指南，教你如何用 Hermes 做 UI、前端和設計系統工作，並把它接入 Open Design 的結構化設計工作流。", "本文涵蓋 Hermes 究竟是什麼、為什麼一個自主、多供應商的 agent 適合做設計、如何從零搭起、截圖轉 UI 的閉環、skill 與子 agent 如何擴充套件它、它與 Codex、Claude Code、Cursor、Gemini CLI 的對比、那些讓 AI 產物顯得千篇一律的坑，以及 Open Design 如何作為一個開放、本地優先的設計層填補落差——這是一種天然搭配，因為兩者都開源、都跑在你自己的機器上。"], "heroImage": {"src": "/agents/hermes-design/hermes-design-hero.webp", "alt": "Hermes 設計反饋閉環：一個自主終端 agent 讀取參考圖、委派給子 agent、一個瀏覽器渲染 UI 以及一個工作區，反饋箭頭回環往復", "caption": "核心閉環：Hermes 在終端裡讀取你的參考素材，規劃並委派構建，在真實瀏覽器中驗證 UI，並對照參考反覆迭代——在你自帶的任意模型上執行。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-hermes", "label": "Hermes 究竟是什麼"}, {"id": "why-design", "label": "為什麼自主、多供應商的 agent 適合做設計"}, {"id": "setup", "label": "為設計搭起 Hermes（從零開始）"}, {"id": "screenshot-workflow", "label": "截圖轉 UI 的工作流"}, {"id": "extend", "label": "Skill、子 agent 與供應商"}, {"id": "vs", "label": "Hermes vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "坑，以及“AI 流水貨”觀感"}, {"id": "open-design", "label": "在 Open Design 中用 Hermes 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-hermes", "heading": "Hermes 究竟是什麼", "blocks": [{"kind": "p", "text": "Hermes 是 Nous Research 推出的開源（MIT）自主 AI agent。它持續執行在你自己的機器或伺服器上，讀取你的倉庫、編輯檔案、執行 shell 命令、搜尋網路，並且——這是關鍵——自主規劃並執行多步驟工作，把區域性委派給隔離的子 agent。它是一個自主 agent，而不是綁死在 IDE 裡的副駕。"}, {"kind": "p", "text": "對設計工作來說，有兩個特性格外突出。它是真正 agentic 的，所以你可以交給它一個目標，它會規劃、構建並驗證，而不是等你逐行指揮。它還不繫結供應商：你自帶金鑰，預設用 xAI Grok，但也可自由指向 OpenAI、Anthropic 或任何其他受支援的端點——由你掌控讓哪個模型來推理你的設計。"}, {"kind": "steps", "items": [{"label": "Skill", "body": "Hermes 會構建並複用 skill——它從經驗中創造出的過程性記憶——這正是沉澱你的設計規範、tokens 和評審清單的天然之處，讓它們在多次執行間持續生效。"}, {"label": "子 agent + 工具", "body": "它會派生隔離的子 agent 來並行處理多條工作流，並自帶檔案、shell、網路和瀏覽器工具，因此無需離開終端就能收集參考素材、跑一套構建並驗證的閉環。"}, {"label": "自帶金鑰", "body": "Hermes 預設用 xAI Grok，並通過 BYOK 支援 OpenAI、Anthropic、OpenRouter 及許多其他供應商——設定一個金鑰或走一遍 OAuth 流程，再挑選你的模型。"}]}, {"kind": "ul", "items": ["供應商：Nous Research", "憑證：通過 BYOK 自帶的供應商金鑰——xAI（Grok，預設）、OpenAI 或 Anthropic——用 hermes auth add 新增", "許可證：MIT，開源"]}]}, {"id": "why-design", "heading": "為什麼自主、多供應商的 agent 適合做設計", "blocks": [{"kind": "p", "text": "Hermes 的設計優勢來自兩個特性——但和每一個 agent 一樣，審美仍然得由你來供給。"}, {"kind": "steps", "items": [{"label": "自主規劃並執行", "body": "因為 Hermes 會自主規劃、執行並委派，所以它能接過一個設計目標——還原這張參考、把它做成響應式——並朝它迭代，而不需要把每一步都講清楚。"}, {"label": "帶上你信任的模型", "body": "不繫結供應商的 BYOK 意味著你為手頭的活兒挑選推理模型：預設是 xAI Grok，想用 OpenAI 和 Anthropic 模型的長處時也能切——不被任何一家供應商的審美鎖死。"}, {"label": "規範沉澱進 skill", "body": "Skill（再加上像 Figma 這樣的 MCP 伺服器）把 agent 指向你的 tokens、元件和真實規範，於是它針對一套品牌而非預設觀感來工作。"}]}, {"kind": "image", "src": "/agents/hermes-design/hermes-design-taste-triangle.webp", "alt": "示意圖展示設計系統、skill 和參考圖匯聚成優質設計產出", "caption": "審美來自你提供的三項輸入：一套設計系統、一個 skill 和真實的參考圖。"}, {"kind": "p", "text": "這是每一個 agent 都在教的同一課：Hermes 預設並沒有審美。當你給它約束時——一套設計系統、一個審美 skill 和具體的參考——它才產出好設計。Open Design 恰恰把這些輸入打包好了，這也是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零為設計工作搭起 Hermes", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨機器到一個能構建並驗證 UI 的 Hermes 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Hermes（Nous Research 提供的一行安裝指令碼）\ncurl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash\n\n# 2. 執行設定嚮導\nhermes setup\n\n# 3. 新增供應商並完成認證（BYOK）\n#    預設是 xAI Grok；同樣支援 OpenAI / Anthropic\nhermes auth add        # 新增供應商金鑰或走它的 OAuth 流程\nhermes model           # 挑選供應商和模型（預設 grok-4.3）\n\n# 4. 接入 Figma MCP 伺服器（可選，用於設計交付）\n#    在 Hermes 的 MCP / 工具設定中配置它"}, {"kind": "image", "src": "/agents/hermes-design/hermes-design-setup-flow.webp", "alt": "五步設定流程：安裝、認證、配置 skill、新增設計系統、驗證", "caption": "設定順序：安裝 → 新增供應商金鑰 → 把設計規則收進一個 skill → 新增設計系統 → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "編碼你的設計規則", "body": "把你的 tokens、基礎元素和規範收進一個 Hermes skill 並把 agent 指向它們，讓產出貼合一套品牌，而不是退回千篇一律的觀感。"}, {"label": "加上瀏覽器驗證", "body": "接入 Playwright 或瀏覽器 MCP，讓 Hermes 在真實瀏覽器中渲染並跨斷點檢查其產出，而不僅僅是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖轉 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Hermes 做設計槓桿最大的閉環，是把一張參考圖變成可用、響應式的 UI，並迭代到匹配為止——讓這個自主 agent 規劃構建，並把自己的產出對照參考來比對。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考起步——並納入多種狀態（桌面和移動、懸停、空態、載入），而不只是一張主視覺。", "在提示裡說具體；提示含糊，哪怕模型再強也只會產出千篇一律的 UI。", "把你的設計系統和規範放進一個 skill，並告訴 Hermes tokens 和標準基礎元素在哪裡。", "跑一個 dev server，讓 Hermes 在真實瀏覽器中渲染，調整到各斷點尺寸來檢查結果。", "讓 Hermes 把自己的實現對照截圖比對來迭代——而不只是確認它能構建。"]}, {"kind": "p", "text": "把 Hermes 指向你的參考素材，並給出具體約束："}, {"kind": "code", "lang": "bash", "code": "hermes\n# 在提示裡：\n> 使用本資料夾裡的 reference-desktop.png 和 reference-mobile.png。\n  用 React + Vite + Tailwind + TypeScript 實現這個設計。\n  複用我 skill 裡現有的設計系統元件和 tokens。\n  匹配間距、佈局和層級；做成響應式。\n  在瀏覽器裡渲染它，並迭代到跨斷點都與參考匹配為止。"}, {"kind": "p", "text": "把提示保持小而聚焦，提交好的迭代、回退壞的迭代（回退時告訴 Hermes），這樣每一輪都建立在乾淨的基礎上。"}]}, {"id": "extend", "heading": "Skill、子 agent 與供應商", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 Hermes 適合持續的設計工作，而且這三者都能幹淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "Skill", "body": "Hermes 會構建並複用 skill——從經驗中創造出的過程性記憶。它們是你設計規範的持久歸宿，在後續執行中被直接應用，而不必每次重新解釋。"}, {"label": "子 agent 與 MCP", "body": "它把工作委派給隔離的子 agent，並支援 MCP 伺服器——這是引入設計上下文與外部工具的可移植方式，其中最相關的是 Figma MCP 伺服器，它們跨 agent 通用，而不只服務於 Hermes。"}, {"label": "供應商選擇", "body": "因為 Hermes 不繫結供應商（預設 xAI Grok，通過 BYOK 用 OpenAI 和 Anthropic），你可以為任務匹配模型，而無需重建你的工作流。"}]}, {"kind": "p", "text": "這些是可移植、多 agent 的能力——恰恰是 Open Design 生來要去編排的那類東西，而不是每個專案重造一遍。"}]}, {"id": "vs", "heading": "做設計時 Hermes vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "做設計沒有唯一贏家——每個 agent 各有不同長處，經驗豐富的團隊會把它們疊著用。一份公允的小結："}, {"kind": "table", "columns": ["Agent", "設計長處", "最適合"], "rows": [["Hermes", "自主的規劃-執行-委派 agent；不繫結供應商的 BYOK（預設 xAI Grok，也支援 OpenAI/Anthropic）；開源且可自託管", "在你信任的任意模型上撒手交付的自主構建，且保留在本地"], ["Codex", "憑藉前端 skill 帶來出色的視覺打磨；沙箱化的非同步構建", "委派式的非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（hex、間距、字型）和懂程式碼庫的 UX", "前端推理和大上下文的重構"], ["Cursor", "帶即時預覽和內聯編輯的視覺化“邊構建邊看”閉環", "在 IDE 內緊湊的“迭代-觀察”UI 工作"], ["Gemini CLI", "強大的多模態影像理解和 1M tokens 上下文；有免費檔", "截圖密集的工作，以及把整套設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆給出的結論是：審美來自人——沒有 skill、參考和約束，它們全都會退回千篇一律的觀感。那才是真正要解決的問題——它是設計工具形態的，而非模型形態的。"}]}, {"id": "pitfalls", "heading": "坑，以及如何避開“AI 流水貨”觀感", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨，是它看起來千篇一律——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一股 Inter 加紫色的味道，“一眼就看出是 AI 做的”。其他被反映的問題還包括移動端佈局崩壞，以及指令文字滲進了 UI 文案。這些都不是 Hermes 獨有的；任何 agent 在沒有精選設計上下文的情況下執行，都會這樣。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會逼 agent 認定一個真實的方向，而不是預設觀感。"}, {"label": "在真實瀏覽器中驗證", "body": "讓 Hermes 跨斷點渲染並自檢，使佈局不會在移動端悄無聲息地崩壞。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖，是撬動產出質量最大的那根槓桿。"}, {"label": "把規則編碼進 skill", "body": "把諸如“不要主視覺卡片、最多兩種字型、品牌優先的層級”這類規則放進一個 agent 每次執行都會應用的 skill。"}]}, {"kind": "p", "text": "注意，每一項緩解措施都是在給 agent 一套精選的設計上下文。手工地、逐專案地維護這套上下文，正是 Open Design 替你省掉的苦力活。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Hermes 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面那套工作流一直在呼喚的開源設計層。它把 Hermes 當作一等介面卡，並用一套精選的 skill 與設計系統庫、一條結構化的渲染流水線和一個本地桌面 UI 把它包起來——於是讓 Hermes 變好的那套設計上下文，從第一次執行起就在那兒，而不是每次手工拼湊。兩者都開源、都本地優先，這讓它們的搭配水到渠成。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Hermes 作為你的 agent。", "用你自己的供應商金鑰（BYOK）認證——預設 xAI Grok，或 OpenAI 或 Anthropic——憑證留在你的機器上，絕不經我們代理。", "挑一套設計系統和一個 skill，然後以一致的審美生成演示稿、原型和落地頁。", "每一份產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是託管雲端。"]}, {"kind": "p", "text": "同一個 Hermes agent、同一個金鑰——再加上圍繞它的一套真實、可移植、開源的設計工作流。它本地優先、採用 Apache-2.0，所以你的工作和憑證沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Hermes 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一套設計系統和真實的參考圖，Hermes 就能產出生產級、響應式的 UI；作為一個自主 agent，它還能自行渲染並對照參考驗證產出。沒有那套上下文，它往往會退回千篇一律的觀感，而這正是 Open Design 填補的落差。"}, {"name": "Hermes 用哪些模型和金鑰？", "text": "Hermes 不繫結供應商，且自帶金鑰。它預設用 xAI Grok（例如 grok-4.3），同時支援 OpenAI、Anthropic、OpenRouter 及許多其他供應商——你用 hermes auth add 新增供應商金鑰（或走它的 OAuth 流程），用 hermes model 挑選模型。Open Design 從不代理你的憑證。"}, {"name": "Hermes 具體好在哪，讓它適合做設計？", "text": "兩點：它是真正自主的，所以會規劃、構建並驗證 UI，而不是等你逐行指揮；它還不繫結供應商，所以你能跑你信任的推理模型。兩點都有幫助——但審美仍然來自你提供的設計系統、skill 和參考。"}, {"name": "做前端設計，選 Hermes 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體、懂程式碼庫的設計決策著稱；Hermes 的優勢是自主規劃並執行加上供應商選擇——你甚至可以讓 Hermes 指向一個 Anthropic 金鑰。很多團隊兩者都用——Open Design 讓你切換 agent 而無需改動你的設計工作流。"}, {"name": "我怎麼把 Hermes 連到 Figma？", "text": "在 Hermes 的工具配置裡新增一個 Figma MCP 伺服器。Hermes 隨後就能拉取真實的設計上下文——元件、變數、佈局資料——使生成的程式碼與源頭匹配，而不是近似還原。"}, {"name": "Open Design 隸屬於 Nous Research 嗎？", "text": "不。Hermes 是 Nous Research 的產品；Open Design 是一個獨立的開源專案，以一等介面卡的方式支援它。Hermes 和 Nous Research 是其各自所有者的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先，採用 Apache-2.0。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的供應商憑證由你的 agent 直接使用，絕不經 Open Design 伺服器中轉。"}], "ctaTitle": "用開放的方式，和 Hermes 一起做設計。", "ctaBody": "自帶你自己的 xAI、OpenAI 或 Anthropic 金鑰，把每個檔案留在本地，併為你已經在用的 agent 配上一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Hermes", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'devin': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['devin']!,
      title: "用於設計的 Devin for Terminal — Open Design",
      description: "人們如何把 Devin for Terminal——Cognition 在命令列中的自主式 AI 軟體工程師——用於 UI 與網頁設計，以及 Open Design 如何藉助精選的 skill 與設計系統庫，把它變成一個本地優先、開源的設計 agent。",
      breadcrumb: "Devin for Terminal",
      label: "Agent · Devin",
      heading: "用於設計的 Devin for Terminal。",
      lead: "Devin for Terminal 是 Cognition 的自主式 AI 軟體工程師，執行在你的終端裡。它能自行規劃並執行多步驟任務，還能把會話移交給一個沙箱化的雲端 agent——只要你給它參考素材、規範約定和一套驗證迴圈，它就能成為真正交付前端工作的方式。Open Design 把它接入開源的設計工作流：用你自己的 Devin 賬號、你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Devin for Terminal 變成一個本地優先、開源的設計 agent——用你自己的 Devin 賬號、你自己的檔案，圍繞它配上精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 裡使用 Devin", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Devin for Terminal 是 Cognition 的自主式 AI 軟體工程師，被帶進了本地命令列。有兩點讓它在設計這件事上格外有意思：它是真正具備自主性的，能夠規劃並端到端地執行一個多步驟任務，而不只是補全程式碼行；它還能把會話移交給一個擁有自己計算機的沙箱化雲端 agent，於是較長的構建任務在你合上筆記本之後仍能繼續執行。配上合適的參考素材、規範約定和一套驗證迴圈，它能構建出真正可用的響應式 UI。這是一份實用的、端到端的指南，講如何把 Devin for Terminal 用於 UI、前端和設計系統工作，以及如何藉助 Open Design 把它接入一套結構化的設計工作流。", "本文涵蓋：Devin for Terminal 究竟是什麼、為什麼一個自主式軟體工程師適合設計工作、如何從零開始把它配置好、截圖轉 UI 的迴圈、專案規則與外部工具如何擴充套件它、它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比、那些讓 AI 產出看起來很「通用」的坑，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合這道鴻溝——對任何能規劃並交付前端工作的 agent 來說，這都是天然的搭配。"], "heroImage": {"src": "/agents/devin-design/devin-design-hero.webp", "alt": "Devin for Terminal 的設計反饋迴圈：一個自主式終端 agent 讀取參考圖、一個瀏覽器渲染 UI、一個工作區，以及一條迴環的反饋箭頭", "caption": "核心迴圈：Devin 在終端裡讀取你的參考素材，規劃並構建 UI，在真實瀏覽器中驗證，並對照參考不斷迭代——必要時把較長的執行任務移交給雲端。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-devin", "label": "Devin for Terminal 究竟是什麼"}, {"id": "why-design", "label": "為什麼自主式軟體工程師適合設計"}, {"id": "setup", "label": "從零配置用於設計的 Devin"}, {"id": "screenshot-workflow", "label": "截圖轉 UI 的工作流"}, {"id": "extend", "label": "專案規則、工具與雲端移交"}, {"id": "vs", "label": "Devin vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "坑，以及那股「AI 味」"}, {"id": "open-design", "label": "在 Open Design 裡用 Devin 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-devin", "heading": "Devin for Terminal 究竟是什麼", "blocks": [{"kind": "p", "text": "Devin for Terminal 是 Devin——Cognition 的自主式 AI 軟體工程師——的命令列版本。它作為一個本地編碼 agent 執行，能訪問你的程式碼庫、工具和環境——讀取你的倉庫、編輯檔案、執行 shell 命令，並從一條自然語言任務出發去規劃和驗證工作，而不只是補全程式碼行。Cognition 用 Rust 自研了一套終端渲染庫，讓介面保持快速、流暢。"}, {"kind": "p", "text": "對設計工作來說，有兩個特性格外突出。它是真正自主的，所以你可以描述一個目標結果，它會執行通往該結果的多步驟路徑。而當一個構建任務超出你筆記本的承載時，你可以把會話移交給一個執行在自己沙箱環境中的雲端 agent，讓它非同步地繼續工作——於是你回來時迎接你的是一個已完成的 pull request。"}, {"kind": "steps", "items": [{"label": "自主的、具備 agent 能力的執行", "body": "Devin 自行規劃並執行一個多步驟任務——實現一項功能、構建 UI、執行並測試它——由帶明確完成標準的清晰提示詞來引導。"}, {"label": "本地 agent，雲端移交", "body": "它在你的終端裡本地執行，並且能把會話升級移交給一個擁有自己計算機的沙箱化雲端 agent，在你離開後繼續工作。"}, {"label": "基於賬號，可選模型", "body": "你用 Devin（Cognition）賬號登入；Devin 執行在前沿模型上——你可以在多個選項之間選擇，比如 Cognition 自家的 SWE-1.6 以及其他前沿模型。"}]}, {"kind": "ul", "items": ["廠商：Cognition", "憑證：Devin（Cognition）賬號——基於訂閱/賬號的登入，而非自帶金鑰（BYOK）", "形態：本地終端 agent，可選沙箱化雲端移交"]}]}, {"id": "why-design", "heading": "為什麼自主式軟體工程師適合設計", "blocks": [{"kind": "p", "text": "Devin 的設計優勢來自它的工作方式——自主的、端到端的執行——但和每個 agent 一樣，審美仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "端到端、多步驟的構建", "body": "因為 Devin 會規劃並執行整個任務，它可以一氣呵成地搭好一個頁面、接好元件、跑起開發伺服器並測試結果，而不是停在一段程式碼片段上。"}, {"label": "沙箱化的雲端執行", "body": "較長的前端工作——一整個落地頁、一條多屏流程——可以移交給一個沙箱化的雲端 agent 繼續構建，於是迭代不會被你的筆記本卡住。"}, {"label": "把約定寫進專案規則", "body": "通過專案的規則和文件，把 agent 指向你的 tokens、元件和真實規範，讓它對著一個品牌工作，而不是一套預設外觀。"}]}, {"kind": "image", "src": "/agents/devin-design/devin-design-taste-triangle.webp", "alt": "示意圖：設計系統、skill 和參考圖匯聚成優秀的設計產出", "caption": "審美來自你提供的三項輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這條道理和每個 agent 教給我們的一樣：Devin 預設並不具備審美。當你給它約束時，它才能產出好設計——一套設計系統、一個審美 skill，以及具體的參考素材。Open Design 恰好把這些輸入打包好了，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零配置用於設計工作的 Devin", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Devin for Terminal 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Devin for Terminal\ncurl -fsSL https://cli.devin.ai/install.sh | bash\n\n# 2. 在你的專案裡啟動它，首次執行時登入\ncd your-project\ndevin             # 用你的 Devin（Cognition）賬號登入\n\n# 3. 用自然語言描述任務，給出清晰的\n#    完成標準，讓 Devin 自行規劃並執行。\n\n# 4. 當一個構建任務超出你筆記本的承載時，把會話\n#    移交給一個沙箱化的雲端 agent 繼續工作。"}, {"kind": "image", "src": "/agents/devin-design/devin-design-setup-flow.webp", "alt": "五步配置流程：安裝、登入、編碼設計規則、新增參考素材、在瀏覽器中驗證", "caption": "配置順序：安裝 → 登入 → 編碼你的設計規則 → 提供參考素材 → 在真實瀏覽器中驗證。"}, {"kind": "steps", "items": [{"label": "編碼你的設計規則", "body": "把你的 tokens、基礎元件和約定放到 agent 會讀取的地方——你專案的規則和文件裡——讓產出對齊一個品牌，而不是退回到一套通用外觀。"}, {"label": "加入瀏覽器驗證", "body": "讓 Devin 在真實瀏覽器中渲染，並跨斷點檢查它的產出，這樣它就會對照設計進行驗證，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖轉 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Devin 做設計時，槓桿率最高的迴圈是把一張參考圖變成可用的響應式 UI，並反覆迭代直到匹配——讓這個自主式 agent 去構建、執行，並把自己的產出對照參考進行比對。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發——並且包含多種狀態（桌面端和移動端、懸停、空態、載入），而不只是一張主視覺。", "提示詞要具體，並給出明確的完成標準；即使 agent 很強，含糊的提示詞也會產出通用的 UI。", "把你的設計系統和約定放在專案規則裡，並告訴 Devin tokens 和規範基礎元件都在哪裡。", "跑起一個開發伺服器，讓 Devin 在真實瀏覽器中渲染，並調整到各個斷點來檢查結果。", "通過讓 Devin 把自己的實現對照參考進行比對來迭代——而不只是確認它能構建通過——並把較長的迭代移交給雲端。"]}, {"kind": "p", "text": "把參考素材和具體約束交給 Devin，並給出清晰的「完成」定義："}, {"kind": "code", "lang": "bash", "code": "devin\n# 在提示詞裡：\n> Implement the attached reference (desktop + mobile) in\n  React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the\n  references across breakpoints. Done = pixel-close on both\n  desktop and mobile with no console errors."}, {"kind": "p", "text": "保持提示詞聚焦，提交好的迭代、回退壞的迭代（回退時告訴 Devin），這樣每一輪都建立在一個乾淨的基礎之上。"}]}, {"id": "extend", "heading": "專案規則、工具與雲端移交", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 Devin for Terminal 適合持續的設計工作，而且這三點都能幹淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "專案規則與上下文", "body": "把你的設計約定、tokens 和評審清單放在專案的規則和文件裡，讓 agent 每次執行都讀取它們，並對著你的品牌工作。"}, {"label": "程式碼庫、工具與環境", "body": "Devin 作為一個本地 agent 執行，能訪問你的程式碼庫、工具和環境——它可以跑開發伺服器、執行構建並驗證產出，全程不用離開終端。"}, {"label": "沙箱化雲端移交", "body": "把會話移交給一個執行在自己沙箱裡的雲端 agent，非同步地跑更長的構建、測試和 PR 建立，然後你回來迎接一個已完成的 pull request。"}]}, {"kind": "p", "text": "這些正是 Open Design 被設計來去編排、而非在每個專案裡重新造一遍的那類可移植的、agent 形態的能力。"}]}, {"id": "vs", "heading": "用於設計時 Devin vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "在設計工作上沒有唯一的贏家——每個 agent 各有所長，有經驗的團隊會把它們疊著用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Devin", "完全自主的軟體工程師；規劃並執行多步驟構建，並移交給一個沙箱化的雲端 agent", "把端到端的前端構建委派出去，讓它在你離開後繼續執行"], ["Codex", "憑藉 frontend skill 帶來強視覺打磨；沙箱化非同步構建", "委派式非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（十六進位制色值、間距、字型）以及理解程式碼庫的 UX", "前端推理和大上下文重構"], ["Cursor", "帶即時預覽和行內編輯的「邊構建邊看」迴圈", "在 IDE 內緊湊地「迭代並觀察」的 UI 工作"], ["Gemini CLI", "強大的多模態影像理解和 1M token 的上下文；開源且帶免費額度", "大量依賴截圖的工作，以及在上下文裡裝下整套設計系統"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人類——沒有 skill、參考素材和約束，它們都會預設退回一套通用審美。那才是真正要解決的問題——而它是設計工具形態的，不是模型形態的。"}]}, {"id": "pitfalls", "heading": "坑，以及如何避開那股「AI 味」", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來很通用——柔和的漸變、漂浮的面板、過大的圓角、誇張的陰影，一種 Inter 字型加紫色的調調，「一眼就知道是 AI 做的」。其他被反映的問題還包括移動端佈局錯亂，以及提示語洩漏進 UI 文案裡。這些都不是 Devin 獨有的；任何 agent 在缺少精選設計上下文的情況下執行，都會出現這些問題。"}, {"kind": "steps", "items": [{"label": "加入一個審美 skill", "body": "一個精選的設計 skill 會迫使 agent 投向一個真實的方向，而不是那套預設外觀。"}, {"label": "在真實瀏覽器中驗證", "body": "讓 Devin 渲染並跨斷點自檢，這樣佈局就不會在移動端悄悄崩掉。"}, {"label": "提供 tokens 和參考素材", "body": "真實的設計 tokens 和參考截圖，是對產出質量影響最大的那個槓桿。"}, {"label": "把規則編碼進專案上下文", "body": "把「不用主視覺卡片、最多兩種字型、品牌優先的層級」這類風格規則放在 agent 每次執行都會讀到的地方，並給出明確的完成標準。"}]}, {"kind": "p", "text": "注意，每一項緩解措施都是在給 agent 一份精選的設計上下文。靠手工、按專案去維護這份上下文，正是 Open Design 替你省掉的那份苦差。"}]}, {"id": "open-design", "heading": "在 Open Design 裡用 Devin 做設計", "blocks": [{"kind": "p", "text": "Open Design 就是上面那套工作流一直在呼喚的開源設計層。它把 Devin for Terminal 當作一等公民介面卡，並用一套精選的 skill 與設計系統庫、一條結構化的渲染管線和一個本地桌面 UI 把它包裹起來——於是讓 Devin 變好的那份設計上下文從第一次執行起就在那裡，而不必每次都手工拼裝。Open Design 是開源且本地優先的，這讓它與一個你本就在終端裡執行的 agent 天然契合。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 Devin for Terminal 作為你的 agent。", "用你的 Devin（Cognition）賬號進行認證——憑證由你的 agent 直接使用，絕不經我們代理。", "選一套設計系統和一個 skill，然後以一致的審美生成演示稿、原型和落地頁。", "每一份產出物和 DESIGN.md 檔案都留在你自己的倉庫裡，而不是託管的雲端。"]}, {"kind": "p", "text": "同一個 Devin agent、同一個賬號——外加圍繞它的一套真實、可移植、開源的設計工作流。Open Design 是本地優先且採用 Apache-2.0 許可的，所以你的工作和憑證都不會經由我們離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Devin for Terminal 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一套設計系統和真實的參考圖，Devin 就能產出生產級的響應式 UI，而且作為一個自主式 agent，它能構建、執行並對照你的參考驗證結果。缺少這份上下文時，它往往會預設退回一套通用外觀，而這正是 Open Design 填補的鴻溝。"}, {"name": "我該如何登入 Devin？", "text": "Devin 是基於賬號的：你用一個 Devin（Cognition）賬號登入，而不是自帶模型金鑰。安裝 Devin for Terminal，在你的專案裡執行它，並在首次執行時認證。Open Design 絕不代理你的憑證——你的 agent 會直接使用它們。"}, {"name": "Devin 在設計上具體好在哪裡？", "text": "它是一個完全自主的軟體工程師：它端到端地規劃並執行多步驟的前端構建，還能把會話移交給一個沙箱化的雲端 agent，讓它在你離開後繼續工作。審美仍然來自你提供的設計系統、skill 和參考素材。"}, {"name": "做前端設計該選 Devin 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體、理解程式碼庫的設計決策見長；Devin 的優勢在於完全自主、端到端的執行，外加沙箱化的雲端移交。許多團隊兩者都用——Open Design 讓你在不改變設計工作流的情況下切換 agent。"}, {"name": "Devin 在沙箱裡執行嗎？", "text": "Devin for Terminal 在本地執行，能訪問你的程式碼庫和環境，並且它可以把會話移交給一個執行在自己沙箱環境中的雲端 agent——這對那些需要非同步繼續的較長構建、測試和 PR 建立很有用。"}, {"name": "Open Design 與 Cognition 有關聯嗎？", "text": "沒有。Devin for Terminal 是 Cognition 的產品；Open Design 是一個獨立的開源專案，以一等公民介面卡的形式支援它。Devin 是 Cognition 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0 許可。你的檔案、產出物和 DESIGN.md 都留在你自己的倉庫裡，你的 Devin 憑證由你的 agent 直接使用，絕不經由 Open Design 伺服器中轉。"}], "ctaTitle": "以開放的方式，和 Devin 一起做設計。", "ctaBody": "用你的 Devin 賬號登入，讓每個檔案都留在本地，並圍繞你已經在用的那個自主式 agent 配上一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 裡使用 Devin", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'pi': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['pi']!,
      title: "用 Pi 做設計 — Open Design",
      description: "人們如何用 Pi（開源的多供應商終端編碼 agent）做 UI 與網頁設計——它的任意模型路由、BYOK 供應商金鑰、Skills 與 Extensions——以及 Open Design 如何把 Pi 變成本地優先的開源設計 agent。",
      breadcrumb: "Pi",
      label: "Agent · Pi",
      heading: "用 Pi 做設計。",
      lead: "Pi 是一個開源的終端編碼 agent，可路由到任意模型——Anthropic、OpenAI、Google 及 20 多家供應商——全部用你自己的 API 金鑰。這個與供應商無關的核心讓它成為一款靈活的設計工具：選今天讀截圖最強的模型，明天再換，工作流不變。Open Design 把它接入一套開源設計工作流：你的供應商金鑰、你的檔案、本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Pi 變成一個本地優先的開源設計 agent——用你自己的供應商 API 金鑰、你的檔案，外加圍繞它的一套精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Pi", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Pi 是一個面向終端的開源（MIT）AI 編碼 agent。對設計而言它的有趣之處在於：它與供應商無關——在一個統一介面背後把 Anthropic、OpenAI、Google 及另外 20 多家供應商規範成一致形態，所以你用自己的 API 金鑰（BYOK）做認證、按任務挑模型——而且可以在一次會話中途切換模型，不必重新學習這套工具。再配上合適的參考、規範和一個驗證迴路，它能構建出真實、響應式的 UI。這是一份實用的端到端指南，講如何用 Pi 做 UI、前端和設計系統工作，並把它接入 Open Design 的結構化設計工作流。", "它涵蓋：Pi 到底是什麼，為什麼一個多供應商 BYOK agent 適合設計，如何從零搭建，截圖轉 UI 的迴路，Skills 和 Extensions 如何擴充套件它，它與 Codex、Claude Code、Cursor、Gemini CLI 的對比，讓 AI 產出看起來千篇一律的那些坑，以及 Open Design 如何作為一個開放、本地優先的設計層補上這道缺口——這是一種天然的搭配，因為兩者都是開源、都在你自己的機器上執行。"], "heroImage": {"src": "/agents/pi-design/pi-design-hero.webp", "alt": "Pi 設計反饋迴路：一個終端 agent 在讀取參考圖、一個瀏覽器在渲染 UI、一個工作區，還有一條迴環的反饋箭頭", "caption": "核心迴路：Pi 在終端裡讀取你的參考，在真實瀏覽器中構建並驗證 UI，再對照它們迭代——無論你把它指向哪家供應商。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-pi", "label": "Pi 到底是什麼"}, {"id": "why-design", "label": "為什麼多供應商 BYOK agent 適合設計"}, {"id": "setup", "label": "從零搭建用於設計的 Pi"}, {"id": "screenshot-workflow", "label": "截圖轉 UI 的工作流"}, {"id": "extend", "label": "Skills、Extensions 與主題"}, {"id": "vs", "label": "Pi 對比 Codex、Claude Code、Cursor、Gemini CLI"}, {"id": "pitfalls", "label": "坑，以及“AI 流水線感”的樣子"}, {"id": "open-design", "label": "在 Open Design 中用 Pi 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-pi", "heading": "Pi 到底是什麼", "blocks": [{"kind": "p", "text": "Pi 是一個面向終端的開源（MIT）AI 編碼 agent，屬於 earendil-works pi 工具集的一部分。它讀取你的倉庫、編輯檔案、執行 shell 命令——從自然語言任務出發去規劃並驗證工作，而不只是補全幾行程式碼。它的核心刻意精簡：四個預設工具——read、write、edit 和 bash——外加內建的 grep、find 和 ls。"}, {"kind": "p", "text": "對設計工作來說，最突出的特性是 Pi 與供應商無關。它在一個統一 API 背後把 Anthropic、OpenAI、Google 及眾多其他供應商規範成一致形態，所以你自帶金鑰、按任務挑模型——比如挑一個擅長讀參考截圖的多模態強模型——並在會話中途用 /model 或 Ctrl+L 切換，工作流照舊不變。"}, {"kind": "steps", "items": [{"label": "任意模型，你的金鑰", "body": "Pi 可路由到 20 多家供應商，包括 Anthropic 和 OpenAI。你用自己的 API 金鑰（BYOK）做認證，或用 /login 登入 Claude Pro/Max、ChatGPT Plus/Pro 或 GitHub Copilot 訂閱。"}, {"label": "Skills + Extensions", "body": "Pi 載入 Skills（遵循 Agent Skills 標準的 Markdown 能力包）和 TypeScript Extensions——這正是編碼你的設計規範、新增自定義工具的天然位置。"}, {"label": "可分支的會話", "body": "會話以 JSONL 樹形式儲存，所以你可以為一次探索拉出分支、在單個檔案裡瀏覽歷史，而不會丟掉之前的嘗試。"}]}, {"kind": "ul", "items": ["供應商：earendil-works（開源社群專案）", "憑證：你自己的供應商 API 金鑰（BYOK——Anthropic、OpenAI、Google 等）或通過 /login 的訂閱登入；本地儲存在 ~/.pi/agent/auth.json（0600）", "許可證：MIT，開源"]}]}, {"id": "why-design", "heading": "為什麼多供應商、BYOK 的 agent 適合設計", "blocks": [{"kind": "p", "text": "Pi 的設計優勢在於靈活，而不在某個內建模型——但和每一個 agent 一樣，品味仍然得由你提供。"}, {"kind": "steps", "items": [{"label": "按任務挑對模型", "body": "因為 Pi 能路由到任意供應商，你可以拿一個強多模態模型去讀參考截圖，再切到另一個去做重構——全程不離開 agent。"}, {"label": "你的金鑰，無鎖定", "body": "BYOK 意味著你不被某一家供應商的定價或上下文限制綁死；按眼前的設計任務挑選其優勢最契合的模型。"}, {"label": "把規範放進 Skill", "body": "一個 Skill（再加上像 Figma 伺服器這樣的 MCP 來源）把 agent 指向你的 tokens、元件和真實規範，於是它針對一個品牌工作，而不是套用預設外觀。"}]}, {"kind": "image", "src": "/agents/pi-design/pi-design-taste-triangle.webp", "alt": "示意圖：設計系統、skill 和參考圖匯聚成優秀的設計產出", "caption": "品味來自你提供的三項輸入：一個設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這裡的教訓和每個 agent 教給我們的一樣：Pi 預設沒有品味，換什麼模型都補不上。當你給它約束時——一個設計系統、一個審美 skill 和具體參考——它才能產出好設計。Open Design 恰好把這些輸入打包好，這就是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零搭建用於設計的 Pi", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Pi 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Pi 編碼 agent CLI（Node）\nnpm install -g --ignore-scripts @earendil-works/pi-coding-agent\n\n# 2. 用你自己的供應商金鑰做認證（BYOK）\nexport ANTHROPIC_API_KEY=sk-ant-...   # 或 OPENAI_API_KEY=sk-...\n#    （或在 Pi 內執行 /login 使用 Claude / ChatGPT / Copilot 訂閱）\n\n# 3. 在你的專案裡啟動它\ncd your-project\npi\n\n# 4. 隨時用 /model 或 Ctrl+L 切換模型"}, {"kind": "image", "src": "/agents/pi-design/pi-design-setup-flow.webp", "alt": "五步搭建流程：安裝、認證、編碼設計規則、新增 skill、驗證", "caption": "搭建順序：安裝 → 認證（BYOK）→ 在 Skill 裡編碼設計規則 → 選一個模型 → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "編碼你的設計規則", "body": "把你的 tokens、基礎元素和規範放進一個 Skill 並把 Pi 指向它們，讓產出貼合一個品牌，而不是退回到千篇一律的外觀。"}, {"label": "加入瀏覽器驗證", "body": "接上 Playwright 或瀏覽器 MCP，讓 Pi 在真實瀏覽器中渲染、並跨斷點檢查產出，而不是隻確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖轉 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Pi 做設計槓桿最高的迴路，是把一張參考圖變成可用、響應式的 UI，然後迭代到匹配為止——靠一個多模態模型把產出對照參考來比較。因為 Pi 與供應商無關，本輪就把它指向最擅長讀圖的那個模型。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考入手——幷包含多種狀態（桌面端和移動端、懸停、空態、載入態），不要只給一張主視覺。", "用 /model 為本輪挑一個強多模態模型，因為影像理解才是截圖轉 UI 質量的關鍵驅動力。", "提示詞要具體；含糊的提示詞即便配強模型也會產出千篇一律的 UI。", "把你的設計系統和規範放進一個 Skill，並告訴 Pi tokens 和規範基礎元素在哪裡。", "跑一個開發伺服器，讓 Pi 在真實瀏覽器中渲染、縮放到各斷點，然後把它的實現對照截圖來迭代——而不是僅僅確認它能構建。"]}, {"kind": "p", "text": "一開始就把參考和具體約束交給 agent："}, {"kind": "code", "lang": "bash", "code": "pi\n# 在提示詞裡：\n> 用 React + Vite + Tailwind + TypeScript 實現\n  reference-desktop.png 和 reference-mobile.png。\n  複用我現有的設計系統元件和 tokens（見 Skill）。\n  匹配間距、佈局和層級；做成響應式。\n  在瀏覽器裡渲染並迭代，直到它跨斷點都與參考匹配。"}, {"kind": "p", "text": "保持提示詞小而聚焦，把好的迭代提交、把壞的回退掉（回退時告訴 Pi），這樣每一輪都在乾淨的基底上推進。Pi 可分支的 JSONL 會話也讓你在不丟失原始線索的情況下探索另一種方案。"}]}, {"id": "extend", "heading": "Skills、Extensions 與主題", "blocks": [{"kind": "p", "text": "Pi 在執行時通過幾個層自我擴充套件，而它們乾淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "Skills", "body": "遵循 Agent Skills 標準的 Markdown 能力包——是你的設計規範、tokens 和評審清單耐用、可移植的歸宿。同一個 Skill 在相容的 agent 間通用，不止 Pi。"}, {"label": "Extensions 與提示詞模板", "body": "TypeScript Extensions 新增自定義工具、命令和 UI；可複用的提示詞模板通過 /name 執行。兩者都讓你在不離開終端的前提下指令碼化驗證迴路。"}, {"label": "MCP 與主題", "body": "Pi 連線 MCP 伺服器以引入外部設計上下文（最相關的是一個 Figma MCP 伺服器），主題支援熱過載，讓終端 UI 在你工作時始終清晰可讀。"}]}, {"kind": "p", "text": "這些都是可移植的能力——尤其是 Skills 和 MCP——正是 Open Design 被設計來編排、而非每個專案都重造一遍的那類東西。"}]}, {"id": "vs", "heading": "做設計時 Pi 對比 Codex、Claude Code、Cursor、Gemini CLI", "blocks": [{"kind": "p", "text": "設計工作沒有唯一贏家——每個 agent 各有所長，老練的團隊會把它們疊著用。一個公允的總結："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Pi", "與供應商無關、BYOK——可路由到任意模型（Anthropic、OpenAI、Google……）並在會話中途切換；MIT，可自我擴充套件", "按任務選用最佳模型，且不被供應商鎖定"], ["Codex", "憑前端 skill 實現強視覺打磨；沙箱化的非同步構建", "委託式非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（色值、間距、字型）和理解程式碼庫的 UX", "前端推理和大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的“構建即所見”視覺迴路", "在 IDE 內緊湊的邊迭代邊看的 UI 工作"], ["Gemini CLI", "強多模態影像理解和 100 萬 token 上下文；有免費層", "截圖密集的工作，以及把整套設計系統裝進上下文"]]}, {"kind": "p", "text": "Pi 的切入角度與其他幾家正交：它是那個讓你用自己的金鑰去呼叫上述任意底層模型的 agent。社群反覆得出的結論依然成立——品味來自人：它們在沒有 skill、參考和約束時都會退回到千篇一律的審美。那才是真正要解決的問題，而它是設計工具形態的，不是模型形態的。"}]}, {"id": "pitfalls", "heading": "坑，以及如何避免“AI 流水線感”的樣子", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來千篇一律——柔和漸變、漂浮面板、過大的圓角、誇張的陰影，一種“一看就是 AI 做的”的 Inter 加紫色氣味。其他被反映的問題還包括移動端佈局崩壞、以及指令洩漏進 UI 文案。這些都不是 Pi 或某一個模型獨有的；它們是任何 agent 在缺少精選設計上下文時都會發生的結果。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 迫使 agent 承諾一個真實的方向，而不是預設外觀——而且因為它是可移植的 Skill，會跟著你跨模型走。"}, {"label": "在真實瀏覽器裡驗證", "body": "挑一個多模態模型，讓 Pi 跨斷點渲染並自檢，這樣佈局不會在移動端悄悄崩掉。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖是對產出質量影響最大的那個槓桿。"}, {"label": "把規則編碼到 Pi 讀得到的地方", "body": "把“不要主視覺卡片、最多兩種字型、品牌優先的層級”這類風格規則放進一個 agent 每次執行都載入的 Skill 裡。"}]}, {"kind": "p", "text": "注意，每一條緩解措施都是在給 agent 一個精選的設計上下文——與你路由到哪家供應商無關。手工、逐專案地維護那份上下文，正是 Open Design 幫你免去的苦差。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Pi 做設計", "blocks": [{"kind": "p", "text": "Open Design 就是上面那套工作流一直在呼喚的那個開源設計層。它把 Pi 當作一級介面卡，並圍繞它包上一套精選的 skill 與設計系統庫、一條結構化的渲染流水線，以及一個本地桌面 UI——於是讓 Pi 變好的那份設計上下文從第一次執行起就在那裡，而不是每次都手工拼裝。兩者都是開源、都本地優先，這讓這對組合天然契合。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Pi 作為你的 agent。", "用你自己的供應商 API 金鑰（BYOK）或一個訂閱登入做認證——憑證留在你機器上的 ~/.pi/agent/auth.json，絕不經我們代理。", "挑一個設計系統和一個 skill，然後以一致的品味生成演示稿、原型和落地頁。", "每一份產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是某個託管雲端。"]}, {"kind": "p", "text": "同一個 Pi agent、同樣的金鑰、同樣可以自由切換模型——再加上圍繞它的一套真實、可移植的開源設計工作流。它本地優先、採用 MIT，所以關於你的工作或憑證的任何東西都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Pi 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一個設計系統和真實的參考圖，Pi 就能產出生產級的響應式 UI，而且你可以把它路由到一個強多模態模型，去把產出對照參考做驗證。缺了那份上下文，它往往會退回到千篇一律的外觀，而這正是 Open Design 要補上的缺口。"}, {"name": "用 Pi 做設計需要付費嗎？", "text": "Pi 本身免費且開源（MIT）。你只為底層模型付費——自帶供應商 API 金鑰（BYOK），或通過 /login 使用 Claude Pro/Max、ChatGPT Plus/Pro 或 GitHub Copilot 訂閱。無論哪種方式，Open Design 都絕不代理你的憑證。"}, {"name": "Pi 具體好在哪裡、為何適合設計？", "text": "它與供應商無關：你自帶金鑰、可路由到 20 多家供應商中的任意一家，挑選其優勢契合任務的模型並在會話中途切換。但品味仍然來自你提供的設計系統、skill 和參考，而非模型本身。"}, {"name": "做前端設計時我該用哪個模型搭配 Pi？", "text": "Pi 可路由到多家供應商，所以按任務來選——一個強多模態模型很會讀參考截圖，而別的模型可能更適合重構。Pi 的優勢在於你可以切換而不改變工作流。Open Design 讓你在所選的任意模型之間保持同一份設計上下文。"}, {"name": "我如何把 Pi 連到 Figma？", "text": "Pi 支援 MCP 伺服器，所以你可以加一個 Figma MCP 伺服器，拉取真實的設計上下文——元件、變數、佈局資料——讓生成的程式碼貼合源頭，而不是近似還原。"}, {"name": "Open Design 和 Pi 有從屬關係嗎？", "text": "沒有。Pi 是 earendil-works 出品的獨立開源專案；Open Design 是一個單獨的獨立開源專案，以一級介面卡的形式支援 Pi。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且開源。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的供應商金鑰由 Pi 直接使用（本地儲存在 ~/.pi/agent/auth.json），絕不經過 Open Design 伺服器路由。"}], "ctaTitle": "以開放的方式，用 Pi 做設計。", "ctaBody": "自帶供應商金鑰、路由到任意模型、讓每個檔案都留在本地，併為你早已在用的 agent 配上一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Pi", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'kiro': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['kiro']!,
      title: "用於設計的 Kiro CLI —— Open Design",
      description: "人們如何用 Amazon 的 Kiro CLI 做 UI 與網頁設計——它的規範驅動開發、agent 鉤子、引導檔案與 MCP——以及 Open Design 如何把 Kiro CLI 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "Kiro CLI",
      label: "Agent · Kiro CLI",
      heading: "用於設計的 Kiro CLI。",
      lead: "Kiro CLI 是 Amazon 面向規範驅動開發的終端 agent——它會先把一個提示詞變成一份需求規範、一份設計文件和一份任務清單，然後才動手寫程式碼。這種結構正是設計工作所需要的：先定意圖，再去構建。Open Design 把它接入開源的設計工作流：用你自己的 Builder ID 或登入方式、你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Kiro CLI 變成一個本地優先、開源的設計 agent——用你自己的 AWS Builder ID 或登入方式、你自己的檔案，並圍繞它配上一套精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Kiro CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Kiro CLI 是 Amazon 面向規範驅動開發的終端 agent。它的與眾不同之處在於工作流：它不會從提示詞直接跳到程式碼，而是先把需求形式化為一份規範，產出一份設計文件和一份有序的任務清單，然後才動手實現——讓構建對既定意圖負責。它還提供了在檔案儲存等事件上觸發的 agent 鉤子、把你的標準與約定帶進每一次執行的引導檔案，以及面向外部工具的 Model Context Protocol 支援。Kiro 目前處於預覽階段，提供 IDE、CLI 和網頁介面三種形態，你可以免費開始使用。這是一份實用的端到端指南，講解如何用 Kiro CLI 做 UI、前端和設計系統工作，以及如何藉助 Open Design 把它接入一套結構化的設計工作流。", "本文涵蓋：Kiro CLI 究竟是什麼、為什麼規範驅動的工作流契合設計、如何從零搭建、截圖到 UI 的迴圈、引導檔案、鉤子與 MCP 如何擴充套件它、它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比、哪些坑會讓 AI 產出顯得千篇一律，以及 Open Design 如何作為圍繞它的開放、本地優先的設計層來補齊這塊短板。"], "heroImage": {"src": "/agents/kiro-design/kiro-design-hero.webp", "alt": "Kiro CLI 設計反饋閉環：一個終端 agent 把規範變成設計、一個瀏覽器渲染 UI、以及一個工作區，配有一條迴環的反饋箭頭", "caption": "核心閉環：Kiro CLI 在終端裡把你的意圖變成規範和任務清單，在真實瀏覽器中構建並驗證 UI，並對照你的參考反覆迭代。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-kiro", "label": "Kiro CLI 究竟是什麼"}, {"id": "why-design", "label": "為什麼規範驅動開發契合設計"}, {"id": "setup", "label": "從零搭建用於設計的 Kiro CLI"}, {"id": "screenshot-workflow", "label": "截圖到 UI 的工作流"}, {"id": "extend", "label": "規範、引導檔案、鉤子與 MCP"}, {"id": "vs", "label": "Kiro 對比 Codex、Claude Code、Cursor 與 Gemini CLI"}, {"id": "pitfalls", "label": "常見坑與“AI 流水線感”外觀"}, {"id": "open-design", "label": "在 Open Design 中用 Kiro CLI 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-kiro", "heading": "Kiro CLI 究竟是什麼", "blocks": [{"kind": "p", "text": "Kiro 是 Amazon 推出的智慧體式 AI，提供 IDE、命令列介面和網頁介面三種形態，旨在藉助規範驅動開發把你從原型一路帶到生產。Kiro CLI 把這個 agent 帶到你的終端：你可以開啟一段互動式聊天會話、建立並管理 agent、執行 Model Context Protocol 伺服器——全部都在命令列裡完成。Kiro 目前處於預覽階段。"}, {"kind": "p", "text": "對設計工作而言，最關鍵的特性是它的工作流。Kiro 不會把提示詞直接變成程式碼，而是先寫一份規範——需求、一份設計文件和一份有序的任務清單——然後照著它去實現。這讓 agent 的計劃在任何 UI 被構建之前就可見、可審閱，這恰好契合設計決策應有的方式：先定意圖，再去執行。"}, {"kind": "steps", "items": [{"label": "規範", "body": "Kiro 在寫程式碼之前先把提示詞變成一份結構化規範——需求、一份設計文件和一項項獨立的任務——這樣計劃在一開始就可審閱。"}, {"label": "引導檔案 + 鉤子", "body": "引導檔案把你的標準、約定和偏好的工具帶進每一次執行；agent 鉤子在檔案儲存等事件上觸發，自動執行後臺任務。"}, {"label": "免費起步、支援 MCP", "body": "用 Builder ID、Google、GitHub 或你所在的組織登入即可免費開始；Kiro CLI 還會管理 MCP 伺服器，以引入外部上下文。"}]}, {"kind": "ul", "items": ["廠商：Amazon（AWS）", "憑證：通過 kiro-cli login 使用 AWS Builder ID、Google、GitHub 或 AWS IAM Identity Center（無需 AWS 賬號）", "狀態：預覽階段；提供 IDE、CLI 和網頁介面"]}]}, {"id": "why-design", "heading": "為什麼規範驅動開發契合設計", "blocks": [{"kind": "p", "text": "Kiro CLI 在設計上的優勢來自它的工作流——但和每個 agent 一樣，審美仍然得由人來提供。"}, {"kind": "steps", "items": [{"label": "先有意圖，再有畫素", "body": "因為 Kiro 會先寫一份規範和一份設計文件，你可以在規劃階段就糾正佈局、層級和範圍——在 agent 還沒落入一種千篇一律的實現之前。"}, {"label": "引導檔案承載你的品牌", "body": "引導檔案在每一次執行時都把你的 tokens、元件和約定擺在 agent 面前，於是產出契合品牌，而不是落入預設的樣子。"}, {"label": "鉤子強制執行閉環", "body": "agent 鉤子可以在儲存時自動跑檢查——這是接入一個驗證或評審步驟的好地方，而不必指望 agent 自己記得。"}]}, {"kind": "image", "src": "/agents/kiro-design/kiro-design-taste-triangle.webp", "alt": "示意圖展示設計系統、skill 與參考圖匯聚成優質的設計產出", "caption": "審美來自你提供的三項輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這個教訓和每個 agent 教給我們的一樣：Kiro CLI 預設並不具備審美。規範能讓構建保持誠實，但只有當你給它約束——一套設計系統、一個審美 skill 和具體的參考——它才能產出好設計。Open Design 恰好把這些輸入打包好了，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始，搭建用於設計工作的 Kiro CLI", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Kiro CLI 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Kiro CLI（macOS/Linux/Windows 的命令見 kiro.dev/docs/cli）\n\n# 2. 認證——會開啟瀏覽器完成登入\nkiro-cli login   # 選擇 Builder ID、Google、GitHub 或你所在的組織\n\n# 3. 確認你已登入\nkiro-cli whoami\n\n# 4. 在你的專案裡開啟互動式會話\ncd your-project\nkiro-cli chat\n\n# 5. 接入 MCP 伺服器（可選，例如用於設計交付）\nkiro-cli mcp add ..."}, {"kind": "image", "src": "/agents/kiro-design/kiro-design-setup-flow.webp", "alt": "五步搭建流程：安裝、認證、新增引導檔案、新增 skill、驗證", "caption": "搭建順序：安裝 → 認證 → 新增引導檔案和一份設計規範 → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把你的設計規則編碼進去", "body": "把你的 tokens、基礎元素和約定寫進引導檔案，讓 agent 在每一次執行時都讀到它們，於是產出契合品牌，而不是落入千篇一律的預設樣子。"}, {"label": "加入瀏覽器驗證", "body": "接入一個 Playwright 或瀏覽器 MCP 伺服器，讓 Kiro 在真實瀏覽器中渲染並跨斷點檢查其產出，而不是隻確認構建能通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Kiro CLI 做設計時槓桿最大的閉環，是把一張參考圖變成可用的、響應式的 UI，並反覆迭代直到吻合——讓規範先捕捉意圖，然後照著它去構建。"}, {"kind": "ol", "items": ["從你手頭最清晰的視覺參考出發——並且要包含多種狀態（桌面端和移動端、懸停、空態、載入），而不只是一張主視覺。", "讓 Kiro 從你的提示詞寫出一份規範和設計文件，並在它構建之前審閱計劃——這是你及早發現佈局和範圍問題的地方。", "把你的設計系統和約定放進引導檔案，並告訴 Kiro tokens 和規範化基礎元素在哪裡。", "跑一個開發伺服器，讓 Kiro 在真實瀏覽器中渲染，並調整到各個斷點來檢查結果。", "通過讓 Kiro 把它的實現對照參考來迭代——而不只是確認它能構建通過。"]}, {"kind": "p", "text": "開啟一段互動式會話，並在一開始就給出具體約束，這樣它寫出的規範才能反映你真實的意圖："}, {"kind": "code", "lang": "bash", "code": "kiro-cli chat\n# 在提示詞中：\n> 這是我的參考圖：reference-desktop.png 和 reference-mobile.png。\n  先寫一份規範，然後用 React + Vite + Tailwind + TypeScript 實現這個設計。\n  複用我現有的設計系統元件和 tokens（見我的引導檔案）。\n  對齊間距、佈局和層級；做成響應式。\n  在瀏覽器裡渲染它，並反覆迭代直到它在各個斷點上\n  都與參考圖吻合。"}, {"kind": "p", "text": "保持任務小而聚焦，把好的迭代提交、把壞的回退掉（回退時告訴 Kiro），這樣每一輪都建立在一個乾淨的基礎之上。"}]}, {"id": "extend", "heading": "規範、引導檔案、鉤子與 MCP", "blocks": [{"kind": "p", "text": "四個擴充套件點讓 Kiro CLI 在持續的設計工作中變得實用，而這四個都能幹淨地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "規範", "body": "需求、一份設計文件和一份有序的任務清單——記錄一個功能本應是什麼樣的持久檔案，在構建之前和構建之中都可審閱。"}, {"label": "引導檔案", "body": "新增 agent 在每一次執行時都會讀取的上下文、編碼標準以及偏好的工作流或工具——這是安放你設計約定和 tokens 的天然之地。"}, {"label": "agent 鉤子", "body": "在檔案儲存等事件上觸發的自動化，執行檢查或文件生成等後臺任務——這是自動強制執行一個驗證步驟的好地方。"}, {"label": "MCP 伺服器", "body": "Kiro CLI 會管理 Model Context Protocol 伺服器，這是引入外部設計上下文和工具的可移植方式，能跨 agent 通用，而不僅限於 Kiro。"}]}, {"kind": "p", "text": "這些都是可移植、跨 agent 的能力——正是 Open Design 生來要去編排的那類東西，而不是每個專案重造一遍。"}]}, {"id": "vs", "heading": "做設計時 Kiro 對比 Codex、Claude Code、Cursor 與 Gemini CLI", "blocks": [{"kind": "p", "text": "在設計工作上沒有唯一贏家——每個 agent 各有不同的強項，經驗豐富的團隊會把它們疊加使用。一個公允的概括："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Kiro CLI", "規範驅動的工作流——先有需求、設計文件和任務清單，再寫程式碼；引導檔案和鉤子讓構建契合品牌", "結構化、可審閱的構建，在實現之前就鎖定意圖和範圍"], ["Codex", "憑藉前端 skill 帶來出色的視覺打磨；沙箱化的非同步構建", "委託式的非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（十六進位制色值、間距、字型）以及理解程式碼庫的 UX", "前端推理和大上下文重構"], ["Cursor", "帶即時預覽和行內編輯的視覺化“構建即所見”閉環", "在 IDE 內緊湊的“迭代即觀察”UI 工作"], ["Gemini CLI", "出色的多模態影像理解和極大的上下文；開源且帶免費額度", "大量依賴截圖的工作，以及把整套設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人類——它們在缺少 skill、參考和約束的情況下都會預設落入一種千篇一律的風格。那才是真正要解決的問題——而它是設計工具形態的問題，不是模型形態的問題。"}]}, {"id": "pitfalls", "heading": "常見坑，以及如何避免“AI 流水線感”外觀", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它顯得千篇一律——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一種 Inter 字型加紫色的調調，“一看就是 AI 做的”。其他被反映的問題還包括移動端佈局錯亂、以及指令洩漏進 UI 文案裡。這些都不是 Kiro CLI 獨有的；當任何 agent 在沒有精選設計上下文的情況下執行時，就會這樣——規範能讓構建不跑題，但它無法提供審美。"}, {"kind": "steps", "items": [{"label": "加入一個審美 skill", "body": "一個精選的設計 skill 會迫使 agent 投入一個真正的方向，而不是預設的樣子。"}, {"label": "在真實瀏覽器中驗證", "body": "跨斷點渲染並自檢——能的話把它接成一個鉤子——這樣佈局就不會在移動端悄無聲息地崩掉。"}, {"label": "提供 tokens 和參考", "body": "真實的設計 tokens 和參考截圖是對產出質量影響最大的單一槓桿。"}, {"label": "把規則編碼進引導檔案", "body": "把“不要主視覺卡片、最多兩種字型、品牌優先的層級”這類風格規則放在 agent 每次執行都會讀到的地方。"}]}, {"kind": "p", "text": "注意，每一種緩解辦法都是關於給 agent 一份精選的設計上下文。每個專案手動維護那份上下文，正是 Open Design 要替你省掉的苦工。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Kiro CLI 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上述工作流一再呼喚的那個開源設計層。它把 Kiro CLI 當作第一方介面卡，並用一套精選的 skill 與設計系統庫、一條結構化的渲染流水線和一個本地桌面 UI 來包裹它——於是讓 Kiro 變好的那份設計上下文從第一次執行起就在那裡，而不是每次都手動拼湊。Open Design 本地優先，這讓這對組合保持簡單：你的檔案和你的登入都留在你自己的機器上。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 Kiro CLI 作為你的 agent。", "用你的 AWS Builder ID 或其他登入方式認證——憑證留在你的機器上，絕不經我們代理。", "挑一套設計系統和一個 skill，然後以一致的審美生成演示稿、原型和落地頁。", "每一件產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是託管雲端。"]}, {"kind": "p", "text": "同一個 Kiro CLI agent、同一套登入——再加上圍繞它的一套真實、可移植、開源的設計工作流。Open Design 本地優先且採用 Apache-2.0，所以你的工作和憑證沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Kiro CLI 真的能做設計工作嗎？", "text": "能——在上下文裡配上一個審美 skill、一套設計系統和真實的參考圖，Kiro CLI 就能產出生產級、響應式的 UI，而它規範驅動的工作流會讓構建對既定意圖負責。沒有那份上下文時，它往往會落入千篇一律的樣子，這正是 Open Design 補齊的短板。"}, {"name": "使用 Kiro CLI 需要 AWS 賬號嗎？", "text": "不需要——Kiro 允許你用 AWS Builder ID、Google、GitHub 或你所在的組織（AWS IAM Identity Center）登入，使用它無需 AWS 賬號。Kiro 目前處於預覽階段且可免費起步。無論哪種方式，Open Design 都絕不代理你的憑證。"}, {"name": "Kiro CLI 在設計上具體好在哪裡？", "text": "它的規範驅動工作流：Kiro 在寫程式碼之前先寫需求、一份設計文件和一份任務清單，於是你能在構建落定之前糾正佈局和範圍。引導檔案承載你的約定，鉤子能強制執行檢查——但審美仍然來自你提供的設計系統、skill 和參考。"}, {"name": "做前端設計，選 Kiro CLI 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體、理解程式碼庫的設計決策著稱；Kiro CLI 的優勢在於其規範驅動、可審閱、帶引導檔案和鉤子的工作流。很多團隊兩者都用——Open Design 讓你在不改變設計工作流的前提下切換 agent。"}, {"name": "我如何把 Kiro CLI 連線到外部設計工具？", "text": "Kiro CLI 會管理 Model Context Protocol（MCP）伺服器——用 kiro-cli mcp 來新增它們。一個 MCP 伺服器能把真實的設計上下文和工具帶進 agent，讓生成的程式碼與源頭吻合，而不是近似還原。"}, {"name": "Open Design 是否隸屬於 Amazon 或 AWS？", "text": "不是。Kiro 是 Amazon（AWS）的產品；Open Design 是一個獨立的開源專案，以第一方介面卡的方式支援它。Kiro 是 Amazon 的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的 Kiro 登入由你的 agent 直接使用，絕不經 Open Design 伺服器中轉。"}], "ctaTitle": "用開放的方式，與 Kiro CLI 一起做設計。", "ctaBody": "自帶你的 AWS Builder ID 或登入方式，讓每個檔案都留在本地，併為你已經在用的 agent 配上一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Kiro CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的 agent"},
    },
    'kilo': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['kilo']!,
      title: "用 Kilo Code 做設計 — Open Design",
      description: "人們如何用 Kilo Code（開源、模型無關的 AI 編碼 agent）來做 UI 與網頁設計：它的 Architect/Code 模式、MCP 支援、跨眾多供應商的 BYOK，以及 Open Design 如何把 Kilo 變成一個本地優先、開源的設計 agent。",
      breadcrumb: "Kilo",
      label: "Agent · Kilo",
      heading: "用 Kilo Code 做設計。",
      lead: "Kilo Code 是一個面向你的 IDE 與 CLI 的開源、模型無關的 AI 編碼 agent。因為你幾乎可以讓它接入任意模型，並自帶供應商金鑰，所以只要你給它參考圖、規範和一套驗證迴路，它就能成為一個真正的設計工具。Open Design 把它接入一套開源的設計工作流：你的供應商金鑰、你的檔案、本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Kilo Code 變成一個本地優先、開源的設計 agent——你的供應商金鑰、你的檔案，外加圍繞它精選的 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Kilo Code", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Kilo Code 是一個開源的 AI 編碼 agent，可在 VS Code、JetBrains 系列 IDE 和終端中執行。有兩點讓它對設計尤其有意思：它是模型無關的，所以你可以選用最能讀懂截圖的前沿視覺模型來驅動它；它在眾多供應商之間支援 BYOK，所以成本和憑證都掌握在你自己手裡。配上合適的參考圖、規範和一套驗證迴路，它能構建出真正的響應式 UI。本文是一份實用的端到端指南，講如何用 Kilo Code 做 UI、前端和設計系統的工作，以及如何把它接入 Open Design 的結構化設計工作流。", "內容涵蓋：Kilo Code 究竟是什麼，為什麼一個模型無關、開放的 agent 適合設計，如何從零開始把它配置好，截圖到 UI 的迴路，自定義規則和 MCP 如何擴充套件它，它與 Codex、Claude Code、Cursor、Gemini CLI 的對比，那些讓 AI 輸出顯得千篇一律的陷阱，以及 Open Design 如何作為一個開放、本地優先的設計層來彌合這道鴻溝——這是天然的搭配，因為兩者都是開源的，都跑在你自己的機器上。"], "heroImage": {"src": "/agents/kilo-design/kilo-design-hero.webp", "alt": "Kilo Code 設計反饋迴路：IDE 與終端中的 agent 讀取一張參考圖，瀏覽器渲染 UI，以及一個工作區，反饋箭頭回環往復", "caption": "核心迴路：Kilo Code 在 IDE 或 CLI 中讀取你的參考圖，在真實瀏覽器裡構建並驗證 UI，再對照它們迭代——用你選定的模型。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-kilo", "label": "Kilo Code 究竟是什麼"}, {"id": "why-design", "label": "為什麼一個開放、模型無關的 agent 適合設計"}, {"id": "setup", "label": "從零配置 Kilo Code 做設計"}, {"id": "screenshot-workflow", "label": "截圖到 UI 的工作流"}, {"id": "extend", "label": "模式、自定義規則與 MCP"}, {"id": "vs", "label": "Kilo Code 對比 Codex、Claude Code、Cursor、Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與“AI 流水線感”的樣子"}, {"id": "open-design", "label": "在 Open Design 中用 Kilo Code 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-kilo", "heading": "Kilo Code 究竟是什麼", "blocks": [{"kind": "p", "text": "Kilo Code 是由 Kilo Code, Inc. 打造的開源 AI 編碼 agent。它以 VS Code 擴充套件、JetBrains 系列 IDE 中的外掛以及命令列介面的形式執行——讀取你的程式碼倉庫、編輯檔案、執行命令，並從自然語言任務出發去規劃和驗證工作，而不只是補全幾行程式碼。它最鮮明的特點是模型無關：由你選擇驅動它的模型，並自帶你的供應商金鑰。"}, {"kind": "p", "text": "對設計工作而言，有兩點格外突出。因為它模型無關，你可以讓它接入最能讀懂參考截圖、最會推斷佈局的強力視覺模型。又因為它開源且支援 BYOK，你可以精確檢視傳送了哪些上下文，並把憑證與成本牢牢掌握在自己手中。"}, {"kind": "steps", "items": [{"label": "Agent 模式", "body": "Kilo 自帶幾種專門模式——Architect 負責規劃、Code 負責構建、Debug 負責修復、Ask 負責答疑——還可自定義模式，於是你可以先規劃設計，再在各自專注的環節裡實現它。"}, {"label": "自定義規則 + MCP", "body": "它會讀取專案級的自定義規則以保留持久上下文，並支援 MCP 伺服器（還有 MCP 市場），於是你可以接入外部上下文，比如一份線上的 Figma 檔案或設計工具。"}, {"label": "自帶金鑰", "body": "Kilo 在眾多供應商之間支援 BYOK——Anthropic、OpenAI、Google、OpenRouter 等等——你也可以使用 Kilo 自家的閘道器，它按供應商成本提供 500 多個模型。"}]}, {"kind": "ul", "items": ["供應商：Kilo Code, Inc.（開源）", "憑證：你自己的供應商 API 金鑰（BYOK——Anthropic、OpenAI、Google、OpenRouter 等）或 Kilo 自家閘道器", "許可：開源"]}]}, {"id": "why-design", "heading": "為什麼一個開放、模型無關的 agent 適合設計", "blocks": [{"kind": "p", "text": "Kilo Code 在設計上的優勢來自開放性和模型選擇權——但和每一個 agent 一樣，品味仍然得由人來提供。"}, {"kind": "steps", "items": [{"label": "天生模型無關", "body": "因為模型由你來選，你可以用最能讀懂參考截圖的視覺模型來驅動 Kilo——並在出現更好的模型時隨時切換，無需改動工作流。"}, {"label": "開放且可審查", "body": "Kilo 是開源的，所以你能精確看到傳送了哪些上下文和提示詞——當你希望 agent 複用你真實的設計原語、而不是憑空造出一次性樣式時，這一點很有用。"}, {"label": "把規範寫進自定義規則", "body": "專案級自定義規則（再加一個 Figma 的 MCP 伺服器）把 agent 指向你的 tokens、元件和真實規格，於是它是在對照一個品牌工作，而不是套用預設外觀。"}]}, {"kind": "image", "src": "/agents/kilo-design/kilo-design-taste-triangle.webp", "alt": "圖示：設計系統、skill 與參考圖匯聚成優秀的設計輸出", "caption": "品味來自你提供的三項輸入：一套設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這個道理每個 agent 都在教我們：Kilo Code 預設並沒有品味。只有當你給它約束——一套設計系統、一個審美 skill 和具體的參考圖——它才能產出優秀的設計。Open Design 恰好把這些輸入打包好了，這正是兩者契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零開始配置 Kilo Code 做設計", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Kilo Code 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. Install the Kilo Code extension from the VS Code\n#    (or JetBrains) marketplace, or install the CLI.\n\n# 2. Open your project and sign in / add a provider key\ncd your-project\nkilo              # connect your provider (BYOK) or Kilo's gateway\n\n# 3. Add project context\n#    create custom rules for this project's design conventions\n\n# 4. Wire the Figma MCP server (optional, for design handoff)\n#    add it from the MCP marketplace / MCP settings"}, {"kind": "image", "src": "/agents/kilo-design/kilo-design-setup-flow.webp", "alt": "五步配置流程：安裝、認證、新增自定義規則、新增一個 skill、驗證", "caption": "配置順序：安裝 → 接入一個供應商 → 新增自定義規則 → 新增一個 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把你的設計規則編碼下來", "body": "把你的 tokens、原語和規範放進 Kilo 的自定義規則，並把 agent 指向它們，讓輸出對齊一個品牌，而不是預設套上千篇一律的外觀。"}, {"label": "加上瀏覽器驗證", "body": "接入 Playwright 或瀏覽器 MCP，讓 Kilo 在真實瀏覽器中渲染，並跨各個斷點檢查輸出，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "截圖到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Kilo Code 槓桿最高的設計迴路，是把一張參考圖變成可用的響應式 UI，並不斷迭代直到它匹配為止——藉助一個視覺模型把輸出對照參考圖反覆比對。"}, {"kind": "ol", "items": ["從你手上最清晰的視覺參考開始——幷包含多種狀態（桌面端和移動端、懸停、空態、載入態），而不只是一張主視覺圖。", "提示詞要具體；含糊的提示詞即便配上強力模型也只會產出千篇一律的 UI。", "把你的設計系統和規範放進 Kilo 的自定義規則，並告訴 agent tokens 和標準原語在哪裡。", "跑一個開發伺服器，讓 Kilo 在真實瀏覽器中渲染，並縮放到各個斷點來檢查結果。", "讓 Kilo 把自己的實現對照截圖反覆比對來迭代——而不只是確認它能構建通過。"]}, {"kind": "p", "text": "用 Architect 模式規劃構建，然後切到 Code 模式，附上你的參考圖並給出具體約束："}, {"kind": "code", "lang": "bash", "code": "# Plan in Architect mode, then build in Code mode:\n> Implement this design from @reference-desktop.png and\n  @reference-mobile.png in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens\n  from the custom rules.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the\n  references across breakpoints."}, {"kind": "p", "text": "讓提示詞保持小而專注，把好的迭代提交、把壞的回退（回退時告訴 Kilo），這樣每一輪都建立在一個乾淨的基礎之上。"}]}, {"id": "extend", "heading": "模式、自定義規則與 MCP", "blocks": [{"kind": "p", "text": "三個擴充套件點讓 Kilo Code 在持續的設計工作中切實可用，而這三者都能幹淨利落地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "模式（Architect → Code）", "body": "在 Architect 模式下規劃一個頁面的結構，然後在 Code 模式下實現它，再在 Debug 模式下修復問題——把設計意圖與實現分開。自定義模式還能讓你編碼出一套自己的設計評審環節。"}, {"label": "自定義規則", "body": "專案級自定義規則是你設計規範的長久歸宿——tokens、原語和評審清單——每次執行都會讀取，讓 agent 對照你的品牌工作。"}, {"label": "MCP 伺服器", "body": "Kilo 通過它的市場支援 MCP 伺服器——這是引入設計上下文和外部工具的可移植方式，最相關的是一個 Figma 的 MCP 伺服器，它們跨 agent 通用，不止限於 Kilo。"}]}, {"kind": "p", "text": "這些都是可移植、跨 agent 的能力——正是 Open Design 生來要去編排的那類東西，而不是每個專案都重新搭一遍。"}]}, {"id": "vs", "heading": "做設計：Kilo Code 對比 Codex、Claude Code、Cursor、Gemini CLI", "blocks": [{"kind": "p", "text": "設計工作沒有單一贏家——每個 agent 都各有所長，有經驗的團隊會把它們疊加使用。一份公允的概括："}, {"kind": "table", "columns": ["Agent", "設計強項", "最適合"], "rows": [["Kilo Code", "開源、模型無關，跨眾多供應商支援 BYOK；具備 Architect/Code 模式和 MCP", "按任務自選模型，並把成本與憑證掌握在自己手中"], ["Codex", "憑一個前端 skill 實現出色的視覺打磨；沙箱化的非同步構建", "委託式非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（色值、間距、字型）以及對程式碼庫有感知的 UX", "前端推理和大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的“構建即所見”視覺迴路", "在 IDE 內緊湊的“邊改邊看”UI 工作"], ["Gemini CLI", "強大的多模態影像理解和 100 萬 token 的上下文", "大量截圖的工作，以及把整套設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人類——它們在缺少 skill、參考圖和約束時，都會預設走向千篇一律的審美。這才是真正要解決的問題——而且它的形狀是設計工具，而非模型。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避開“AI 流水線感”的樣子", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨是它看起來千篇一律——柔和的漸變、懸浮的面板、過大的圓角、誇張的陰影，一種 Inter 字型加紫色的調調，“一眼就知道是 AI 做的”。其他被反映的問題還包括移動端佈局錯亂，以及指令洩漏進了 UI 文案。這些都不是 Kilo Code 獨有的；任何 agent 在缺乏精選設計上下文的情況下執行，都會這樣。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會逼著 agent 投入一個真實的方向，而不是套用預設外觀。"}, {"label": "在真實瀏覽器中驗證", "body": "用一個視覺模型跨斷點渲染並自檢，這樣佈局就不會在移動端悄無聲息地崩壞。"}, {"label": "提供 tokens 和參考圖", "body": "真實的設計 tokens 和參考截圖，是撬動輸出質量最大的那根槓桿。"}, {"label": "把規則編碼進自定義規則", "body": "把“不要 hero 卡片、最多兩種字型、品牌優先的層級”這類風格規則放在 agent 每次執行都會讀到的地方。"}]}, {"kind": "p", "text": "請注意，每一項緩解措施都是在給 agent 一份精選的設計上下文。手動逐專案維護這份上下文，正是 Open Design 替你免去的苦差。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Kilo Code 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上文那套工作流一直在呼喚的、開源的設計層。它把 Kilo Code 當作一等公民介面卡，並在其外圍包上一套精選的 skill 與設計系統庫、一條結構化的渲染流水線和一個本地桌面 UI——於是讓 Kilo 出色的那份設計上下文從第一次執行起就在那裡，而不必每次都手動拼湊。兩者都是開源、本地優先的，這讓它們的搭配水到渠成。"}, {"kind": "ol", "items": ["安裝 Open Design，並選擇 Kilo Code 作為你的 agent。", "用你自己的供應商金鑰（BYOK）或 Kilo 的閘道器進行認證——憑證留在你的機器上，絕不經我們中轉。", "選定一套設計系統和一個 skill，然後以一致的品味生成演示稿、原型和落地頁。", "每一份產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是託管的雲端。"]}, {"kind": "p", "text": "還是同一個 Kilo Code agent、同一套金鑰——只是外圍多了一套真實、可移植、開源的設計工作流。它本地優先且開源，所以關於你工作或憑證的一切都不會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Kilo Code 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一套設計系統和真實的參考圖，Kilo Code 就能產出生產級的響應式 UI，再由一個視覺模型把輸出對照參考圖來驗證。缺了這份上下文，它往往會預設走向千篇一律的外觀，而這正是 Open Design 填補的空白。"}, {"name": "用 Kilo Code 做設計需要付費嗎？", "text": "Kilo Code 是開源的，安裝免費。你自帶供應商 API 金鑰（BYOK）並直接向該供應商付費，或者按供應商成本使用 Kilo 自家閘道器。無論哪種方式，Open Design 都絕不中轉你的憑證。"}, {"name": "Kilo Code 在設計上具體好在哪裡？", "text": "它模型無關且開源，所以你可以用最能讀懂參考截圖的視覺模型來驅動它，精確檢視傳送了哪些上下文，並把成本與憑證掌握在自己手中。品味仍然來自你提供的設計系統、skill 和參考圖。"}, {"name": "前端設計選 Kilo Code 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體、對程式碼庫有感知的設計決策著稱；Kilo Code 的優勢在於它開源、模型無關且支援 BYOK，模型由你來選。許多團隊兩者並用——Open Design 讓你在不改動設計工作流的前提下切換 agent。"}, {"name": "我該如何把 Kilo Code 連到 Figma？", "text": "從 Kilo 的 MCP 市場或 MCP 設定裡新增一個 Figma 的 MCP 伺服器。這樣 Kilo 就能拉取真實的設計上下文——元件、變數、佈局資料——讓生成的程式碼與源頭一致，而不是近似還原。"}, {"name": "Open Design 和 Kilo Code 有關聯嗎？", "text": "沒有。Kilo Code 是 Kilo Code, Inc. 的產品；Open Design 是一個獨立的開源專案，把它作為一等公民介面卡來支援。兩者恰好都是開源的，但它們是各自獨立的專案。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且開源。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的供應商憑證由你的 agent 直接使用，絕不經 Open Design 伺服器中轉。"}], "ctaTitle": "用開放的方式，和 Kilo Code 一起做設計。", "ctaBody": "自帶你的供應商金鑰，把每一個檔案留在本地，並在你已經用著的 agent 周圍獲得一座精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Kilo Code", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上點 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有支援的 agent"},
    },
    'vibe': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['vibe']!,
      title: "用 Mistral Vibe CLI 做設計 — Open Design",
      description: "人們如何用 Mistral 的 Vibe CLI 做 UI 與網頁設計 —— 它開放權重的 Devstral 編碼模型、代理式多檔案編輯、config.toml、MCP 與 ACP —— 以及 Open Design 如何把 Vibe CLI 變成一個本地優先、開源的設計代理。",
      breadcrumb: "Mistral Vibe CLI",
      label: "Agent · Mistral Vibe CLI",
      heading: "用 Mistral Vibe CLI 做設計。",
      lead: "Mistral Vibe CLI 是 Mistral AI 推出的開源終端編碼代理，由 Devstral 模型家族驅動。它能編輯檔案、執行命令，並基於 Agent Client Protocol 工作——只要你給它提供參考素材、規範約定和一套驗證閉環，它就能成為一個真正的設計工具。Open Design 把它接入一套開源的設計工作流：用你自己的 Mistral API 金鑰（BYOK）或本地模型、你自己的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Mistral Vibe CLI 變成一個本地優先、開源的設計代理——用你自己的 Mistral API 金鑰或本地 Devstral 模型、你自己的檔案，外加一套圍繞它的精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Vibe CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Mistral Vibe CLI 是 Mistral AI 推出的開源（Apache-2.0）終端編碼代理。它會掃描你專案的檔案結構和 Git 狀態來獲取上下文，然後根據自然語言任務，在整個程式碼庫中探索、編輯並執行改動。有兩點讓它在設計場景中格外值得關注：它由 Mistral 的 Devstral 編碼模型驅動，這是一個開放權重生態的一部分，你既可以在本地執行，也可以放到雲端；同時它支援 Agent Client Protocol（ACP），因此它能嵌入編輯器和各類工具，而不只是侷限在某一個終端裡。配上合適的參考素材、規範約定和一套驗證閉環，它能構建出真正可用的響應式 UI。這是一份實用的端到端指南，講解如何用 Vibe CLI 做 UI、前端和設計系統的工作，以及如何把它接入 Open Design 的結構化設計工作流。", "內容涵蓋：Vibe CLI 究竟是什麼、為什麼一個開放權重的編碼代理適合做設計、如何從零開始配置它、從參考素材到 UI 的閉環、config.toml、MCP 和 ACP 如何擴充套件它的能力、它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比、那些讓 AI 產出顯得千篇一律的陷阱，以及 Open Design 如何作為一個開放、本地優先的設計層來補上這道缺口——這是天然的搭配，因為兩者都是開源的，並且都在你自己的機器上執行。"], "heroImage": {"src": "/agents/vibe-design/vibe-design-hero.webp", "alt": "Mistral Vibe CLI 設計反饋閉環：一個終端代理讀取參考素材、一個瀏覽器渲染 UI、一個工作區，以及一個迴環的反饋箭頭", "caption": "核心閉環：Vibe CLI 在終端裡讀取你的參考素材，在真實瀏覽器中構建並驗證 UI，再對照參考反覆迭代——全程由 Mistral 的 Devstral 編碼模型驅動。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-vibe", "label": "Mistral Vibe CLI 究竟是什麼"}, {"id": "why-design", "label": "為什麼開放權重的編碼代理適合做設計"}, {"id": "setup", "label": "從零配置 Vibe CLI 做設計"}, {"id": "screenshot-workflow", "label": "從參考素材到 UI 的工作流"}, {"id": "extend", "label": "config.toml、MCP 和 ACP"}, {"id": "vs", "label": "Vibe CLI 對比 Codex、Claude Code、Cursor 和 Gemini CLI"}, {"id": "pitfalls", "label": "陷阱與「AI 味」外觀"}, {"id": "open-design", "label": "在 Open Design 中用 Vibe CLI 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-vibe", "heading": "Mistral Vibe CLI 究竟是什麼", "blocks": [{"kind": "p", "text": "Mistral Vibe CLI 是 Mistral AI 為終端推出的開源（Apache-2.0）編碼代理。它提供一個互動式對話介面，配有檔案操作、程式碼搜尋、版本控制和命令執行等工具，並會自動掃描你專案的檔案結構和 Git 狀態，為代理提供相關上下文。它由 Mistral 的 Devstral 編碼模型驅動——根據自然語言任務進行規劃和驗證，而不只是補全程式碼行。"}, {"kind": "p", "text": "對設計工作而言，有兩個特性尤為突出。它執行在 Mistral 開放權重的 Devstral 家族上（Devstral 2 以及更小的 Devstral Small 2），因此你既可以讓代理對接雲端的 Mistral API，也可以對接本地模型——這對於注重隱私或離線的設計工作很有用。它還支援 Agent Client Protocol，因此同一個代理可以驅動編輯器和各類工具，而不只是一個終端會話。"}, {"kind": "steps", "items": [{"label": "配置檔案", "body": "Vibe CLI 通過 config.toml 檔案配置（專案級 ./.vibe/config.toml，並以 ~/.vibe/config.toml 作為回退）。這是個很實用的地方，可以把你的服務商、模型選擇和專案設定都寫進去。"}, {"label": "內建工具 + MCP", "body": "它自帶檔案、搜尋、版本控制和命令執行工具，並支援 MCP 伺服器（在 [[mcp_servers]] 區段下配置），以引入外部上下文，比如一個即時的 Figma 檔案。"}, {"label": "BYOK 或本地", "body": "用 Mistral 控制台的 Mistral API 金鑰進行認證，或把它指向本地/相容模型，讓它完全離線工作。"}]}, {"kind": "ul", "items": ["廠商：Mistral AI", "憑據：Mistral 控制台的 Mistral API 金鑰（BYOK），或本地/相容模型", "許可證：Apache-2.0，開源"]}]}, {"id": "why-design", "heading": "為什麼開放權重的編碼代理適合做設計", "blocks": [{"kind": "p", "text": "Vibe CLI 在設計上的優勢來自它開放權重的模型家族和廣泛的協議覆蓋——但與每一個代理一樣，審美仍然得由你來提供。"}, {"kind": "steps", "items": [{"label": "Devstral 編碼模型", "body": "Vibe 執行在 Mistral 的 Devstral 家族上，這是為代理式、多檔案工作打造的編碼調優模型——因此代理是在一個真實的前端程式碼庫中跨檔案編輯，而不是產出孤立的程式碼片段。"}, {"label": "開放權重且對本地友好", "body": "Devstral Small 2 足夠小，可以跑在消費級硬體上，因此設計工作可以完全保持在本地和離線狀態——參考素材和程式碼永遠不必離開你的機器。"}, {"label": "config.toml 中的約定 + 上下文", "body": "專案配置和你自己的指令會把代理引向你的 tokens、元件和真實規範，於是它是面向一個品牌工作，而不是套用預設外觀。"}]}, {"kind": "image", "src": "/agents/vibe-design/vibe-design-taste-triangle.webp", "alt": "示意圖：設計系統、skill 和參考圖匯聚成優質的設計產出", "caption": "審美來自你提供的三項輸入：一個設計系統、一個 skill 和真實的參考圖。"}, {"kind": "p", "text": "這條教訓和每個代理給出的如出一轍：Vibe CLI 預設並不具備審美。當你給它約束時——一個設計系統、一個審美 skill 和具體的參考素材——它才能產出好的設計。Open Design 恰好把這些輸入打包好了，這也是兩者能契合的原因（下文詳述）。"}]}, {"id": "setup", "heading": "從零配置 Vibe CLI 做設計工作", "blocks": [{"kind": "p", "text": "下面是從一臺乾淨的機器到一個能構建並驗證 UI 的 Vibe CLI 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Mistral Vibe CLI\nuv tool install mistral-vibe\n# 或：pip install mistral-vibe\n\n# 2. 執行配置嚮導以註冊你的 API 金鑰\nvibe --setup     # 將配置儲存到 ~/.vibe/config.toml 和 ~/.vibe/.env\n#    或直接設定：  export MISTRAL_API_KEY=...\n\n# 3. 在你的專案中啟動 Vibe\ncd your-project\nvibe\n\n# 4. 接入 Figma MCP 伺服器（可選，用於設計交付）\n#    在你的 config.toml 中新增一個 [[mcp_servers]] 條目"}, {"kind": "image", "src": "/agents/vibe-design/vibe-design-setup-flow.webp", "alt": "五步配置流程：安裝、認證、配置 config.toml、新增 skill、驗證", "caption": "配置流程：安裝 → 認證 → 配置 config.toml → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把你的設計規則寫進去", "body": "把你的 tokens、基礎元素和規範約定放在代理能讀到的地方，並讓 Vibe 指向它們，這樣產出就會匹配一個品牌，而不是退回到千篇一律的外觀。"}, {"label": "加上瀏覽器驗證", "body": "接入一個 Playwright 或瀏覽器 MCP，讓 Vibe 在真實瀏覽器中渲染，並跨斷點檢查產出，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "從參考素材到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Vibe CLI 做設計時收益最高的閉環，是把一份清晰的參考素材變成可用的響應式 UI，並反覆迭代直到匹配為止——藉助代理自身的工具來渲染、檢查並修正它自己的產出。"}, {"kind": "ol", "items": ["從你手頭最清晰的參考素材出發——並描述多種狀態（桌面和移動端、懸停、空態、載入中），而不只是一張主視覺。", "提示詞要具體；含糊的提示即便配上強大的模型也只會產出千篇一律的 UI。", "把你的設計系統和規範約定放在 Vibe 能讀到的地方，並告訴它 tokens 和標準基礎元素在哪裡。", "執行一個開發伺服器，讓 Vibe 在真實瀏覽器中渲染，並調整到各個斷點來檢查結果。", "通過讓 Vibe 把它的實現回頭對照參考素材來迭代——而不只是確認它能構建通過。"]}, {"kind": "p", "text": "用 @ 引用檔案（Vibe 會自動補全檔案路徑），用 / 呼叫斜槓命令，然後給出具體的約束："}, {"kind": "code", "lang": "bash", "code": "vibe\n# 在提示詞裡：\n> @design-spec.md @tokens.css\n  Implement this design in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Run the dev server, render it in the browser, and iterate until\n  it matches the references across breakpoints."}, {"kind": "p", "text": "保持提示詞小而聚焦，提交好的迭代、回退壞的迭代（回退時要告訴 Vibe），這樣每一輪都能在一個乾淨的基礎上推進。"}]}, {"id": "extend", "heading": "config.toml、MCP 和 ACP", "blocks": [{"kind": "p", "text": "有三個擴充套件點讓 Vibe CLI 適合做持續性的設計工作，而且這三個都能幹淨地對應到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "config.toml", "body": "專案規則以及服務商/模型設定都存放在 config.toml 中（專案級，並以 ~/.vibe 作為回退）。它是代理如何接入你專案的持久化歸宿，每次執行都會被讀取。"}, {"label": "MCP 伺服器", "body": "在你的 config.toml 中配置 MCP 伺服器（[[mcp_servers]]，支援 HTTP、可流式 HTTP 和 stdio 傳輸）——這是引入設計上下文和外部工具的可移植方式，其中最相關的就是 Figma MCP 伺服器，並且這些在各類代理間通用，不只限於 Vibe。"}, {"label": "Agent Client Protocol", "body": "Vibe 支援 ACP，因此同一個代理可以從編輯器和其他 ACP 客戶端來驅動。Open Design 正是這樣整合它的——通過 vibe-acp 二進位制檔案經由 ACP 接入。"}]}, {"kind": "p", "text": "這些都是可移植、跨代理的能力——恰恰是 Open Design 旨在編排的那類東西，而不是在每個專案裡重新造一遍。"}]}, {"id": "vs", "heading": "做設計時 Vibe CLI 對比 Codex、Claude Code、Cursor 和 Gemini CLI", "blocks": [{"kind": "p", "text": "在設計工作上沒有唯一的贏家——每個代理各有所長，經驗豐富的團隊會把它們疊加使用。一個公允的總結："}, {"kind": "table", "columns": ["代理", "設計強項", "最適合"], "rows": [["Mistral Vibe CLI", "可在本地執行的開放權重 Devstral 編碼模型；Apache-2.0 且原生支援 ACP", "注重隱私或離線的設計工作，以及一套開放權重的技術棧"], ["Codex", "配合前端 skill 的出色視覺打磨；沙盒化的非同步構建", "委託式的非同步構建和可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（十六進位制色、間距、字型）以及理解程式碼庫的 UX", "前端推理和大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的「邊做邊看」視覺化閉環", "在 IDE 內緊湊的「迭代-觀察」式 UI 工作"], ["Gemini CLI", "出色的多模態影像理解和超大的上下文視窗", "大量依賴截圖的工作，以及把整個設計系統裝進上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：審美來自人類——若沒有 skill、參考素材和約束，它們都會預設走向千篇一律的風格。這才是真正要解決的問題——而它是設計工具形態的，不是模型形態的。"}]}, {"id": "pitfalls", "heading": "陷阱，以及如何避開「AI 味」外觀", "blocks": [{"kind": "p", "text": "對 AI 生成設計最常見的抱怨，就是它看起來千篇一律——柔和的漸變、漂浮的面板、過大的圓角、誇張的陰影，以及那種「一看就是 AI 做的」的 Inter 字型加紫色調調。其他被反映的問題還包括移動端佈局錯亂，以及指令文字洩漏進 UI 文案。這些都不是 Vibe CLI 獨有的；只要任何代理在缺乏精選設計上下文的情況下執行，就會出現這些問題。"}, {"kind": "steps", "items": [{"label": "加上一個審美 skill", "body": "一個精選的設計 skill 會迫使代理給出一個真正的方向，而不是套用預設外觀。"}, {"label": "在真實瀏覽器中驗證", "body": "讓 Vibe 跨斷點渲染並自查，這樣佈局就不會在移動端悄無聲息地崩掉。"}, {"label": "提供 tokens 和參考素材", "body": "真實的設計 tokens 和參考截圖，是對產出質量影響最大的單一槓桿。"}, {"label": "把規則寫進配置和上下文", "body": "把「不要主視覺卡片、最多兩種字型、品牌優先的層級」這類風格規則放在代理每次執行都能讀到的地方。"}]}, {"kind": "p", "text": "注意，每一項緩解措施都是在給代理一份精選的設計上下文。逐個專案手工維護這份上下文，正是 Open Design 替你省掉的苦工。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Vibe CLI 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上面這套工作流一直在呼喚的那個開源設計層。它把 Mistral Vibe CLI 當作一等介面卡——通過 vibe-acp 二進位制檔案經由 ACP 來驅動它——併為它配上精選的 skill 與設計系統庫、一條結構化的渲染管線，以及一個本地桌面 UI。於是，讓 Vibe 變好用的那份設計上下文從第一次執行起就已就位，而不必每次手工拼湊。兩者都是開源且本地優先的，這讓這對搭配水到渠成。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Mistral Vibe CLI 作為你的代理。", "用你的 Mistral API 金鑰（BYOK）進行認證，或把 Vibe 指向本地模型——憑據留在你的機器上，絕不經我們代理轉發。", "挑選一個設計系統和一個 skill，然後以一致的審美生成演示稿、原型和落地頁。", "每一個產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是某個託管雲端。"]}, {"kind": "p", "text": "同一個 Vibe CLI 代理，同一把金鑰——外加一套圍繞它的真實、可移植、開源的設計工作流。它本地優先且採用 Apache-2.0，因此你的工作內容和憑據沒有任何一項會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Mistral Vibe CLI 真的能做設計工作嗎？", "text": "能——只要上下文裡有一個審美 skill、一個設計系統和真實的參考素材，Vibe CLI 就能產出生產級的響應式 UI，而它的 Devstral 模型會在一個真實的前端程式碼庫中跨檔案編輯。缺了這份上下文，它往往會退回到千篇一律的外觀，而這正是 Open Design 要補上的缺口。"}, {"name": "我該如何認證 Vibe CLI？", "text": "執行 vibe --setup 啟動配置嚮導來註冊一個 Mistral API 金鑰（來自 Mistral 控制台），或在你的環境中設定 MISTRAL_API_KEY。它也可以對接本地或相容模型，完全離線執行。無論哪種方式，Open Design 都絕不會代理轉發你的憑據。"}, {"name": "Vibe CLI 具體好在哪裡、為什麼適合做設計？", "text": "它是一個 Apache-2.0、原生支援 ACP 的代理，由 Mistral 開放權重的 Devstral 編碼模型驅動——因此你可以在本地執行它來處理注重隱私的工作，並在一個真實的程式碼庫中跨檔案編輯。但審美仍然來自你提供的設計系統、skill 和參考素材。"}, {"name": "做前端設計，選 Vibe CLI 還是 Claude Code？", "text": "兩者都很強。Claude Code 以具體的、理解程式碼庫的設計決策著稱；Vibe CLI 的優勢在於可在本地執行的開放權重 Devstral 技術棧以及 Apache-2.0 許可證。很多團隊兩者都用——Open Design 讓你可以切換代理而無需改變你的設計工作流。"}, {"name": "我該如何把 Vibe CLI 連線到 Figma？", "text": "在你的 config.toml 中以 [[mcp_servers]] 條目的形式新增 Figma MCP 伺服器。Vibe 隨後就能拉取真實的設計上下文——元件、變數、佈局資料——從而讓生成的程式碼匹配原始檔，而不是近似地湊出來。"}, {"name": "Open Design 與 Mistral AI 有關聯嗎？", "text": "沒有。Mistral Vibe CLI 是 Mistral AI 的產品；Open Design 是一個獨立的開源專案，以一等介面卡的形式支援它，並通過 ACP 來驅動。Mistral 是 Mistral AI 的商標。"}, {"name": "我的檔案和憑據安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的 Mistral 憑據由你的代理直接使用，絕不經由 Open Design 的伺服器轉發。"}], "ctaTitle": "用 Mistral Vibe CLI 做設計，以開放的方式。", "ctaBody": "用你自己的 Mistral API 金鑰或本地模型，把每個檔案都留在本地，並圍繞你已經在用的代理獲得一套精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Vibe CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有受支援的代理"},
    },
    'qoder': {
      ...INFO_PAGE_COPY.zh!.agentGuides!['qoder']!,
      title: "用 Qoder CLI 做設計 — Open Design",
      description: "人們如何用 Qoder CLI——阿里巴巴的智慧體編碼平臺——來做 UI 與網頁設計：它的 agent 與 quest 模式、深度的倉庫理解與 repo wiki，以及 Lite/Efficient/Auto 模型檔位——以及 Open Design 如何把 Qoder CLI 變成一個本地優先、開源的設計智慧體。",
      breadcrumb: "Qoder CLI",
      label: "Agent · Qoder CLI",
      heading: "用 Qoder CLI 做設計。",
      lead: "Qoder CLI 是 Qoder——阿里巴巴的智慧體編碼平臺——的終端智慧體。它理解整個倉庫——架構、模式以及在 repo wiki 中沉澱下來的約定——並以規範驅動的方式自主完成工作，這讓它在你給出參考、約定與驗證閉環之後，成為一個真正的設計工具。Open Design 把它接入開源設計工作流：你的 Qoder 賬戶、你的檔案，本地優先。",
      rich: {"heroCtaLead": "Open Design 把 Qoder CLI 變成一個本地優先、開源的設計智慧體——你的 Qoder 賬戶、你的檔案，外加一套圍繞它的精選 skill 與設計系統庫。", "heroCtaActions": [{"label": "在 Open Design 中使用 Qoder CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "intro": ["Qoder CLI 是 Qoder——阿里巴巴的智慧體編碼平臺——的終端智慧體。有兩點讓它在設計上格外值得關注：它會建立起對你倉庫的深度上下文——架構、設計模式，以及它提煉進 repository wiki 的約定——因此它複用你真實的基礎元件，而不是為每個介面發明一次性的樣式；它還會執行規範驅動、自主的 quest，對一項任務從頭到尾地規劃、實現並驗證，而不只是補全程式碼行。配上合適的參考、約定與驗證閉環，它能構建出真實、響應式的 UI。這是一份實用的端到端指南，講如何用 Qoder CLI 做 UI、前端與設計系統的工作，以及如何用 Open Design 把它接入一套結構化的設計工作流。", "它涵蓋了 Qoder CLI 究竟是什麼、為什麼它的倉庫理解與智慧體化 quest 契合設計、如何從零搭建、參考圖到 UI 的閉環、規則/MCP 與 repo wiki 如何擴充套件它、它與 Codex、Claude Code、Cursor 和 Gemini CLI 的對比、那些讓 AI 產出顯得千篇一律的坑，以及 Open Design 如何作為一層開放、本地優先的設計層，彌合你已在使用的智慧體與真正設計之間的差距。"], "heroImage": {"src": "/agents/qoder-design/qoder-design-hero.webp", "alt": "Qoder CLI 設計反饋閉環：一個終端智慧體藉助 repo-wiki 上下文讀取一張參考圖，一個瀏覽器渲染 UI，以及一個工作區，一條反饋箭頭回環", "caption": "核心閉環：Qoder CLI 在終端讀取你的參考與倉庫上下文，在真實瀏覽器中構建並驗證 UI，並對照它們持續迭代。"}, "tocLabel": "本頁內容", "toc": [{"id": "what-is-qoder", "label": "Qoder CLI 究竟是什麼"}, {"id": "why-design", "label": "為什麼智慧體化 + 倉庫上下文契合設計"}, {"id": "setup", "label": "從零搭建用於設計的 Qoder CLI"}, {"id": "screenshot-workflow", "label": "參考圖到 UI 的工作流"}, {"id": "extend", "label": "規則、MCP 與 repo wiki"}, {"id": "vs", "label": "Qoder CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI"}, {"id": "pitfalls", "label": "坑，以及“AI 味”觀感"}, {"id": "open-design", "label": "在 Open Design 中用 Qoder CLI 做設計"}, {"id": "faq", "label": "常見問題"}], "sections": [{"id": "what-is-qoder", "heading": "Qoder CLI 究竟是什麼", "blocks": [{"kind": "p", "text": "Qoder 是阿里巴巴推出的智慧體編碼平臺——一個 AI 開發環境，既有桌面應用也有 CLI，能理解真實的程式碼庫並端到端地完成開發任務。Qoder CLI 把這套引擎帶到了終端：它讀取你的倉庫、編輯檔案、執行 shell 命令，並從自然語言出發完成任務，而不只是補全程式碼行。它用 Qoder 賬戶登入。"}, {"kind": "p", "text": "對於設計工作，有兩個特性尤為突出。Qoder 會建立起對你倉庫的深度上下文——架構、設計模式，以及提煉進 repository wiki 的約定——因此它把產出錨定在你真實的基礎元件上。它還執行一套智慧體化、規範驅動的工作流：你勾勒出想要的東西，它便規劃、實現並驗證這項工作，包括跨多個步驟。"}, {"kind": "steps", "items": [{"label": "Agent 與 Quest 模式", "body": "Agent 模式是帶人類介入檢查點的對話式結對程式設計；Quest 模式則把更長的多步工作委派給一個自主智慧體，由它規劃、實現並自我驗證——這正是交付一項規範驅動設計任務的天然落點。"}, {"label": "Repo wiki + MCP", "body": "Qoder 把你的程式碼庫提煉成一份記錄架構與約定的 repository wiki，並支援 MCP 伺服器以引入外部上下文，比如一個即時的 Figma 檔案。"}, {"label": "模型檔位", "body": "Qoder CLI 提供 Lite、Efficient 和 Auto 三檔；Auto 讓它的排程器按任務挑選模型，這樣你就無需手動管理模型選擇。"}]}, {"kind": "ul", "items": ["廠商：Alibaba", "憑證：Qoder 賬戶（通過瀏覽器登入，或用 Qoder 個人訪問令牌進行非互動式使用）", "模型檔位：Lite、Efficient、Auto"]}]}, {"id": "why-design", "heading": "為什麼一個智慧體化、懂倉庫的智慧體契合設計", "blocks": [{"kind": "p", "text": "Qoder CLI 在設計上的優勢來自兩個特性——但和每個智慧體一樣，品味仍然得由人來提供。"}, {"kind": "steps", "items": [{"label": "深度的倉庫理解", "body": "因為 Qoder 會建立起對你整個程式碼庫的上下文並提煉成一份 repo wiki，智慧體會複用你已有的元件和 tokens，而不是為每個介面發明一次性的樣式。"}, {"label": "規範驅動、自主的 quest", "body": "Quest 模式把一份書面規範變成一個經過規劃、實現並自我驗證的結果，於是一項設計任務能端到端地跑完，而不是停在初稿。"}, {"label": "智慧體會讀取的約定", "body": "專案規則（再加上 Figma MCP 伺服器）把智慧體指向你的 tokens、元件和真實規範，於是它對著一個品牌工作，而不是一種預設觀感。"}]}, {"kind": "image", "src": "/agents/qoder-design/qoder-design-taste-triangle.webp", "alt": "圖示：設計系統、skill 與參考圖匯聚成優質的設計產出", "caption": "品味來自你提供的三項輸入：一個設計系統、一個 skill，以及真實的參考圖。"}, {"kind": "p", "text": "這個教訓和每個智慧體教給我們的一樣：Qoder CLI 預設並不具備品味。當你給它約束——一個設計系統、一個審美 skill 和具體的參考——它才產出優質的設計。Open Design 恰恰把這些輸入打包好了，這也是為什麼兩者契合（下文細說）。"}]}, {"id": "setup", "heading": "從零搭建用於設計工作的 Qoder CLI", "blocks": [{"kind": "p", "text": "這裡是從一臺乾淨的機器到一個能構建並驗證 UI 的 Qoder CLI 的完整路徑。"}, {"kind": "code", "lang": "bash", "code": "# 1. 安裝 Qoder CLI（Node 20+）\nnpm install -g @qoder-ai/qodercli\n# （macOS/Linux 也可通過 Homebrew 安裝）\n\n# 2. 驗證安裝\nqodercli --version\n\n# 3. 在你的專案裡啟動它，首次執行時登入\ncd your-project\nqodercli          # 然後 /login — 通過瀏覽器或 Qoder 訪問令牌登入\n\n# 4. 為本次會話挑選一個模型檔位\n#    Lite、Efficient 或 Auto（Auto 讓排程器按任務選擇）"}, {"kind": "image", "src": "/agents/qoder-design/qoder-design-setup-flow.webp", "alt": "五步搭建流程：安裝、認證、配置規則、新增 skill、驗證", "caption": "搭建順序：安裝 → 登入 → 配置專案規則 → 新增 skill → 啟用瀏覽器驗證。"}, {"kind": "steps", "items": [{"label": "把你的設計規則寫下來", "body": "把你的 tokens、基礎元件和約定放在智慧體會讀取的地方，讓產出貼合一個品牌，而不是退回到一種通用觀感。Qoder 的 repo wiki 有助於讓這份上下文保持最新。"}, {"label": "加上瀏覽器驗證", "body": "接入一個 Playwright 或瀏覽器 MCP，讓 Qoder 在真實瀏覽器中渲染，並跨斷點檢查其產出，而不只是確認構建通過。"}]}]}, {"id": "screenshot-workflow", "heading": "參考圖到 UI 的工作流", "blocks": [{"kind": "p", "text": "用 Qoder CLI 最具槓桿效應的設計閉環，是把一張參考變成可用、響應式的 UI，並不斷迭代直到它匹配為止——藉助智慧體的倉庫上下文和一個真實的驗證閉環，把產出對照回參考。"}, {"kind": "ol", "items": ["從你手上最清晰的視覺參考出發——幷包含多種狀態（桌面與移動端、懸停、空態、載入態），而不只是一張主視覺。", "在 prompt 裡講清楚；模糊的 prompt 即便配上能幹的智慧體也會產出通用的 UI。", "把 Qoder 指向你的設計系統和約定，並告訴它 tokens 和規範基礎元件存放在哪裡。", "跑一個 dev 伺服器，讓 Qoder 在真實瀏覽器中渲染，調整到各斷點尺寸來檢查結果。", "讓 Qoder 把它的實現對照回參考來迭代——而不只是確認它能構建通過。"]}, {"kind": "p", "text": "把任務寫成一份清晰的規範，讓一個 quest 把它貫穿到底，並給出具體約束："}, {"kind": "code", "lang": "bash", "code": "qodercli\n# 在 prompt 裡：\n> Implement this design from reference-desktop.png and\n  reference-mobile.png in React + Vite + Tailwind + TypeScript.\n  Reuse my existing design-system components and tokens.\n  Match spacing, layout, and hierarchy; make it responsive.\n  Render it in the browser and iterate until it matches the references\n  across breakpoints."}, {"kind": "p", "text": "保持 prompt 小而聚焦，提交好的迭代、回退壞的迭代（回退時告訴 Qoder），讓每一輪都建立在一個乾淨的基底之上。"}]}, {"id": "extend", "heading": "規則、MCP 與 repo wiki", "blocks": [{"kind": "p", "text": "有三個擴充套件點讓 Qoder CLI 適合持續的設計工作，而這三者都能幹淨利落地對映到一套開放的設計工作流上。"}, {"kind": "steps", "items": [{"label": "專案規則", "body": "把你的設計約定編碼為智慧體每次執行都會讀取的持久專案規則——這是 tokens、基礎元件和評審清單的歸處。"}, {"label": "MCP 伺服器", "body": "MCP 是引入設計上下文和外部工具的可移植方式，其中最相關的是 Figma MCP 伺服器，而且它跨智慧體可用，不只限於 Qoder。"}, {"label": "repo wiki", "body": "Qoder 的 repository wiki 會自動提煉架構與約定，於是智慧體能持續複用你真實的元件，而不必每個任務都重新學習一遍程式碼庫。"}]}, {"kind": "p", "text": "這些都是可移植、跨智慧體的能力——恰恰是 Open Design 生來要編排的那類東西，而不是每個專案都重新造一遍。"}]}, {"id": "vs", "heading": "做設計時 Qoder CLI vs Codex vs Claude Code vs Cursor vs Gemini CLI", "blocks": [{"kind": "p", "text": "做設計沒有單一贏家——每個智慧體各有所長，有經驗的團隊會把它們疊加使用。一個公允的小結："}, {"kind": "table", "columns": ["智慧體", "設計強項", "最適合"], "rows": [["Qoder CLI", "帶 repo wiki 的深度倉庫理解，以及規範驅動、自主的 quest；Lite/Efficient/Auto 檔位", "倉庫上下文密集的工作，以及委派多步、規範驅動的構建"], ["Codex", "憑前端 skill 帶來過硬的視覺打磨；沙箱化非同步構建", "委派的非同步構建與可移植的 AGENTS.md 規則"], ["Claude Code", "具體的設計決策（色值、間距、字型）與懂程式碼庫的 UX", "前端推理與大上下文重構"], ["Cursor", "帶即時預覽和內聯編輯的視覺化“邊建邊看”閉環", "在 IDE 內緊密迭代、邊看邊改的 UI 工作"], ["Gemini CLI", "過硬的多模態影像理解與 100 萬 token 的上下文；有免費檔", "截圖密集的工作，以及把整個設計系統放進上下文"]]}, {"kind": "p", "text": "社群反覆得出的結論是：品味來自人類——沒有 skill、參考和約束，它們全都會退回到一種通用審美。這才是真正要解決的問題——而它是設計工具形狀的，不是模型形狀的。"}]}, {"id": "pitfalls", "heading": "坑，以及如何避開“AI 味”觀感", "blocks": [{"kind": "p", "text": "關於 AI 生成設計最常見的抱怨是它看起來千篇一律——柔和漸變、懸浮面板、過大的圓角、誇張的陰影，一種“一眼就知道是 AI 做的”的 Inter 配紫色既視感。其他被反映的問題還包括移動端佈局錯亂，以及指令文字洩漏進 UI 文案。這些都不是 Qoder CLI 獨有的；任何智慧體在沒有精選設計上下文的情況下執行，都會這樣。"}, {"kind": "steps", "items": [{"label": "加一個審美 skill", "body": "一個精選的設計 skill 會迫使智慧體承諾一個真實的方向，而不是那種預設觀感。"}, {"label": "在真實瀏覽器中驗證", "body": "跨斷點渲染並自檢，這樣佈局就不會在移動端悄無聲息地崩掉。"}, {"label": "提供 tokens 與參考", "body": "真實的設計 tokens 和參考截圖，是撬動產出質量的最大單一槓桿。"}, {"label": "編碼智慧體會讀取的規則", "body": "把“不要主視覺卡片、最多兩種字型、品牌優先的層級”這類規則放進專案規則和 repo wiki，智慧體每次執行都會讀到它們。"}]}, {"kind": "p", "text": "注意，每一項緩解措施都關乎給智慧體一份精選的設計上下文。逐個專案手工維護這份上下文，正是 Open Design 替你省掉的苦活。"}]}, {"id": "open-design", "heading": "在 Open Design 中用 Qoder CLI 做設計", "blocks": [{"kind": "p", "text": "Open Design 正是上文那套工作流一再呼喚的開源設計層。它把 Qoder CLI 當作一等介面卡，並用一個精選的 skill 與設計系統庫、一條結構化的渲染管線，以及一個本地桌面 UI 把它包裹起來——於是讓 Qoder 出色的那份設計上下文從第一次執行起就在那裡，而不必每次手工拼湊。Open Design 是本地優先的，所以你的工作留在你自己的機器上。"}, {"kind": "ol", "items": ["安裝 Open Design 並選擇 Qoder CLI 作為你的智慧體。", "用你的 Qoder 賬戶認證——憑證留在你的機器上，絕不經我們代理。", "挑一個設計系統和一個 skill，然後以一致的品味生成演示稿、原型與落地頁。", "每個產物和 DESIGN.md 檔案都存在你自己的倉庫裡，而不是託管雲端。"]}, {"kind": "p", "text": "同一個 Qoder CLI 智慧體、同一個賬戶——再加上一套圍繞它的、真實、可移植、開源的設計工作流。它本地優先且採用 Apache-2.0 許可，所以你的工作或憑證沒有任何東西會離開你的機器。"}]}], "faqTitle": "常見問題", "faq": [{"name": "Qoder CLI 真的能做設計工作嗎？", "text": "能——在上下文中配上一個審美 skill、一個設計系統和真實的參考圖，Qoder CLI 能產出生產級、響應式的 UI，而它深度的倉庫理解能幫它複用你真實的元件。沒有這份上下文，它往往會退回到一種通用觀感，而這正是 Open Design 填補的差距。"}, {"name": "我該如何認證 Qoder CLI？", "text": "執行 qodercli 並用 /login 通過瀏覽器以你的 Qoder 賬戶登入，或為非互動式環境提供一個 Qoder 個人訪問令牌。Open Design 從不代理你的憑證——智慧體直接使用它們。"}, {"name": "究竟是什麼讓 Qoder CLI 適合做設計？", "text": "兩點：它會建立起對你倉庫的深度上下文——架構、約定和一份 repo wiki——所以它複用你真實的基礎元件；它的規範驅動 quest 能端到端地跑完一項設計任務。兩者都有幫助，但品味仍然來自你提供的設計系統、skill 和參考。"}, {"name": "Lite、Efficient 和 Auto 模型檔位是什麼？", "text": "Qoder CLI 讓你挑選一個模型檔位：Lite、Efficient 或 Auto。Auto 讓 Qoder 的排程器按任務選擇模型，這樣你就無需手動管理模型選擇。挑選契合任務的檔位；Auto 是個穩妥的預設值。"}, {"name": "我該如何把 Qoder CLI 連到 Figma？", "text": "把 Figma MCP 伺服器加進 Qoder 的 MCP 配置裡。Qoder 隨後就能拉取真實的設計上下文——元件、變數、佈局資料——於是生成的程式碼貼合來源，而不是近似它。"}, {"name": "Open Design 與 Qoder 或 Alibaba 有關聯嗎？", "text": "沒有。Qoder 是 Alibaba 的產品；Open Design 是一個獨立的開源專案，以一等介面卡的方式支援它。Qoder 是其各自所有者的商標。"}, {"name": "我的檔案和憑證安全嗎？", "text": "安全——Open Design 本地優先且採用 Apache-2.0 許可。你的檔案、產物和 DESIGN.md 都留在你自己的倉庫裡，你的 Qoder 憑證由你的智慧體直接使用，絕不會經過 Open Design 的伺服器中轉。"}], "ctaTitle": "用開放的方式，借 Qoder CLI 做設計。", "ctaBody": "帶上你自己的 Qoder 賬戶，讓每個檔案都留在本地，並圍繞你已在使用的智慧體獲得一個精選的設計庫。", "ctaActions": [{"label": "在 Open Design 中使用 Qoder CLI", "href": "/quickstart/", "variant": "primary"}, {"label": "在 GitHub 上 Star", "href": "https://github.com/nexu-io/open-design", "variant": "ghost", "external": true}, {"label": "下載桌面應用", "href": "https://github.com/nexu-io/open-design/releases", "variant": "ghost", "external": true}], "hubLinkLabel": "檢視所有支援的智慧體"},
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
    title: 'Open Design Agent —— {count} 個 BYOK adapter',
    description: 'Open Design 內建 {count} 個 BYOK adapter。直接用你寫程式時已經在用的 Agent 來驅動設計，無需額外供應商登入。',
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
