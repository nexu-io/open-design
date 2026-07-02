import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';

type PluginCapability = 'Connector' | 'MCP' | 'Skill';
type PluginSource = 'Official' | 'Workspace' | 'Personal';
type MarketplaceMode = 'plugins' | 'skills';

type PluginDemo = {
  id: string;
  name: string;
  icon: string;
  accent: string;
  description: string;
  source: PluginSource;
  category: string;
  status: 'installed' | 'available' | 'connected';
  capabilities: PluginCapability[];
  connector?: string[];
  mcp?: string[];
  skills?: string[];
};

type SkillDemo = {
  id: string;
  name: string;
  icon: string;
  accent: string;
  description: string;
  source: PluginSource;
  category: string;
  status: 'enabled' | 'available';
};

type MarketplaceCommandTryItem = {
  id: string;
  name: string;
  description: string;
  category?: string;
  marketplaceKind: 'command';
  command: string;
  commandLabel: string;
};

type MarketplaceTryItem = ((PluginDemo | SkillDemo) & {
  marketplaceKind?: 'skill';
}) | MarketplaceCommandTryItem;

type PluginMarketplaceDemoProps = {
  onTryPlugin?: (plugin: MarketplaceTryItem) => void;
  workspaceExpired?: boolean;
  onRenewWorkspace?: () => void;
};

const PLUGIN_DEMOS: PluginDemo[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: 'GH',
    accent: '#111111',
    description: 'Review PRs, triage issues, inspect CI, and publish release notes.',
    source: 'Official',
    category: 'Featured',
    status: 'available',
    capabilities: ['Connector', 'MCP', 'Skill'],
    connector: ['GitHub OAuth', 'Repository permissions', 'Organization access'],
    mcp: ['search_issues', 'read_pull_request', 'comment_on_pr', 'inspect_checks'],
    skills: ['PR review', 'CI fixer', 'Release notes'],
  },
  {
    id: 'figma',
    name: 'Figma',
    icon: 'Fi',
    accent: '#7c3aed',
    description: 'Read design files and sync visual context into Open Design projects.',
    source: 'Official',
    category: 'Featured',
    status: 'connected',
    capabilities: ['Connector', 'MCP'],
    connector: ['Figma OAuth', 'Team file access', 'Design token scope'],
    mcp: ['read_file', 'export_frame', 'inspect_components'],
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: 'No',
    accent: '#0f172a',
    description: 'Bring workspace docs, product notes, and databases into agent workflows.',
    source: 'Workspace',
    category: 'Productivity',
    status: 'installed',
    capabilities: ['Connector', 'MCP', 'Skill'],
    connector: ['Workspace connection', 'Page permissions', 'Database scopes'],
    mcp: ['search_pages', 'read_page', 'query_database', 'create_page'],
    skills: ['Summarize docs', 'Turn notes into specs', 'Sync roadmap context'],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    icon: 'G',
    accent: '#16a34a',
    description: 'Use Docs, Sheets, Slides, and shared folders as project context.',
    source: 'Official',
    category: 'Productivity',
    status: 'connected',
    capabilities: ['Connector', 'MCP', 'Skill'],
    connector: ['Google OAuth', 'Drive scopes', 'Shared folder access'],
    mcp: ['search_files', 'read_doc', 'read_sheet', 'export_slide'],
    skills: ['Document brief', 'Spreadsheet analysis', 'Slide rewrite'],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: 'Sl',
    accent: '#e11d48',
    description: 'Summarize discussions and turn team decisions into project actions.',
    source: 'Workspace',
    category: 'Communication',
    status: 'installed',
    capabilities: ['Connector', 'MCP'],
    connector: ['Workspace OAuth', 'Channel permissions'],
    mcp: ['search_messages', 'read_thread', 'post_update'],
  },
  {
    id: 'brand-audit',
    name: 'Brand Audit',
    icon: 'BA',
    accent: '#d46a3c',
    description: 'Evaluate generated work against brand voice, layout, and craft rules.',
    source: 'Personal',
    category: 'Design',
    status: 'installed',
    capabilities: ['Skill'],
    skills: ['Brand consistency audit', 'Anti-AI polish pass', 'Design-system checklist'],
  },
];

const SKILL_DEMOS: SkillDemo[] = [
  {
    id: 'brand-audit-skill',
    name: 'Brand Audit',
    icon: 'BA',
    accent: '#d46a3c',
    description: 'Review visual output against brand voice, layout, tokens, and craft rules.',
    source: 'Official',
    category: 'Featured',
    status: 'enabled',
  },
  {
    id: 'template-creator',
    name: 'Template Creator',
    icon: 'TC',
    accent: '#0ea5e9',
    description: 'Turn a repeatable artifact pattern into a reusable template workflow.',
    source: 'Official',
    category: 'Featured',
    status: 'available',
  },
  {
    id: 'prd-to-prototype',
    name: 'PRD to Prototype',
    icon: 'PP',
    accent: '#7c3aed',
    description: 'Convert a product requirement doc into a first-pass editable HTML project.',
    source: 'Workspace',
    category: 'Productivity',
    status: 'enabled',
  },
  {
    id: 'anti-ai-polish',
    name: 'Anti-AI Polish',
    icon: 'AI',
    accent: '#16a34a',
    description: 'Remove generic layout tells and tighten copy, spacing, and hierarchy.',
    source: 'Personal',
    category: 'Design',
    status: 'enabled',
  },
];

const EXTRA_PLUGIN_DEMOS: PluginDemo[] = [
  ['brand-studio', 'Brand Studio', 'BS', '#ef4444', 'Generate brand systems, campaign rules, and launch assets from one brief.', 'Official', 'Design', 'connected', ['Connector', 'Skill'], ['Brand asset library', 'Typography tokens'], ['Brand rule synthesis', 'Campaign adaptation', 'Logo usage QA']],
  ['site-builder', 'Site Builder', 'SB', '#2563eb', 'Turn product positioning into responsive marketing websites and landing pages.', 'Official', 'Website', 'connected', ['MCP', 'Skill'], undefined, ['generate_site', 'inspect_sections'], ['Hero rewrite', 'Pricing layout', 'Landing QA']],
  ['app-prototype', 'AP', 'AP', '#7c3aed', 'Create high-fidelity mobile and desktop prototypes from product requirements.', 'Official', 'Prototype', 'available', ['Skill'], undefined, undefined, ['Interaction map', 'Screen flow', 'State coverage']],
  ['ux-researcher', 'UX', 'UX', '#0891b2', 'Cluster user feedback, identify friction, and produce research-backed design tasks.', 'Official', 'Research', 'connected', ['Connector', 'Skill'], ['Research repository', 'Interview notes'], undefined, ['Insight clustering', 'Journey mapping', 'Opportunity sizing']],
  ['presentation-maker', 'PM', 'PM', '#f97316', 'Create executive decks, pitch stories, and design review presentations.', 'Official', 'Slides', 'connected', ['Skill'], undefined, undefined, ['Storyline draft', 'Slide critique', 'Speaker notes']],
  ['figma-to-system', 'FS', 'FS', '#a855f7', 'Extract component patterns from Figma files and turn them into design-system rules.', 'Official', 'Design System', 'connected', ['Connector', 'MCP', 'Skill'], ['Figma OAuth', 'Component access'], ['inspect_components', 'export_tokens'], ['Token mapping', 'Component audit', 'Usage examples']],
  ['visual-qa', 'VQ', 'VQ', '#10b981', 'Review generated screens for hierarchy, accessibility, spacing, and visual polish.', 'Official', 'Quality', 'available', ['Skill'], undefined, undefined, ['A11y pass', 'Spacing audit', 'Hierarchy review']],
  ['copy-designer', 'CD', 'CD', '#db2777', 'Write concise product copy, empty states, onboarding text, and CTAs.', 'Official', 'Content', 'connected', ['Skill'], undefined, undefined, ['CTA alternatives', 'Empty-state copy', 'Tone alignment']],
  ['commerce-studio', 'CS', 'CS', '#ea580c', 'Design commerce storefronts, product detail pages, and checkout experiments.', 'Workspace', 'Commerce', 'installed', ['Connector', 'Skill'], ['Shopify catalog', 'Product feed'], undefined, ['PDP redesign', 'Checkout review', 'Merchandising ideas']],
  ['growth-lab', 'GL', 'GL', '#16a34a', 'Prototype growth loops, referral pages, onboarding funnels, and experiment decks.', 'Workspace', 'Growth', 'installed', ['Connector', 'Skill'], ['PostHog events', 'CRM segments'], undefined, ['Funnel critique', 'Experiment plan', 'Activation flow']],
  ['support-console', 'SC', 'SC', '#0f766e', 'Design support tools, queue dashboards, and customer-resolution workflows.', 'Workspace', 'Operations', 'installed', ['Connector', 'MCP', 'Skill'], ['Zendesk tickets', 'SLA data'], ['read_tickets', 'summarize_threads'], ['Queue dashboard', 'Agent workflow', 'Escalation copy']],
  ['data-story', 'DS', 'DS', '#4f46e5', 'Turn metrics into readable dashboards, board updates, and investor narratives.', 'Workspace', 'Analytics', 'connected', ['Connector', 'Skill'], ['Warehouse query', 'BI charts'], undefined, ['Metric narrative', 'Dashboard QA', 'Board update']],
  ['mobile-design-kit', 'MD', 'MD', '#0284c7', 'Generate mobile-first product flows with native interaction patterns.', 'Workspace', 'Mobile', 'installed', ['Skill'], undefined, undefined, ['iOS flow', 'Android states', 'Mobile polish']],
  ['enterprise-admin', 'EA', 'EA', '#475569', 'Shape admin consoles, permission models, audit logs, and dense tool surfaces.', 'Workspace', 'Productivity', 'installed', ['Skill'], undefined, undefined, ['Admin IA', 'Table density', 'Permission copy']],
  ['client-review', 'CR', 'CR', '#be123c', 'Package design work for client reviews with notes, rationale, and next steps.', 'Workspace', 'Review', 'connected', ['Connector', 'Skill'], ['Project briefs', 'Client comments'], undefined, ['Review deck', 'Feedback digest', 'Decision log']],
  ['localization-suite', 'LS', 'LS', '#0d9488', 'Adapt product screens and marketing pages for multilingual audiences.', 'Workspace', 'Content', 'installed', ['Connector', 'Skill'], ['Locale glossary', 'Translation memory'], undefined, ['Locale QA', 'String rewrite', 'Cultural fit']],
  ['portfolio-maker', 'PF', 'PF', '#111827', 'Create polished case studies, portfolios, and founder-facing narratives.', 'Personal', 'Website', 'installed', ['Skill'], undefined, undefined, ['Case study outline', 'Portfolio polish', 'Project narrative']],
  ['moodboard-maker', 'MM', 'MM', '#c026d3', 'Build visual directions, moodboards, and art-direction notes from a brief.', 'Personal', 'Design', 'installed', ['Skill'], undefined, undefined, ['Moodboard brief', 'Style territories', 'Reference critique']],
  ['design-critic', 'DC', 'DC', '#dc2626', 'Give precise critique on layout, hierarchy, readability, and craft.', 'Personal', 'Quality', 'installed', ['Skill'], undefined, undefined, ['Layout critique', 'Craft pass', 'Design rationale']],
  ['prompt-to-site', 'PS', 'PS', '#2563eb', 'Convert rough prompts into structured site maps and first-pass HTML pages.', 'Personal', 'Website', 'installed', ['Skill'], undefined, undefined, ['Sitemap draft', 'Section plan', 'HTML starter']],
  ['deck-doctor', 'DD', 'DD', '#f59e0b', 'Tighten slide decks for narrative clarity, structure, and executive readability.', 'Personal', 'Slides', 'installed', ['Skill'], undefined, undefined, ['Deck diagnosis', 'Slide rewrite', 'Narrative arc']],
  ['icon-system', 'IS', 'IS', '#64748b', 'Create icon guidelines, usage rules, and simple SVG symbol directions.', 'Personal', 'Design System', 'installed', ['Skill'], undefined, undefined, ['Icon audit', 'Stroke rules', 'Usage matrix']],
  ['accessibility-coach', 'AC', 'AC', '#059669', 'Check contrast, semantics, focus states, and inclusive interaction patterns.', 'Personal', 'Quality', 'installed', ['Skill'], undefined, undefined, ['Contrast audit', 'Keyboard review', 'A11y copy']],
  ['design-handoff', 'DH', 'DH', '#0ea5e9', 'Prepare engineering handoff notes, component specs, and edge-case checklists.', 'Personal', 'Handoff', 'installed', ['Skill'], undefined, undefined, ['Spec checklist', 'Edge cases', 'Implementation notes']],
].map(([id, name, icon, accent, description, source, category, status, capabilities, connector, mcp, skills]) => ({
  id,
  name,
  icon,
  accent,
  description,
  source,
  category,
  status,
  capabilities,
  connector,
  mcp,
  skills,
} as PluginDemo));

const EXTRA_SKILL_DEMOS: SkillDemo[] = [
  ['landing-page-qa', 'Landing Page QA', 'LQ', '#2563eb', 'Review hero clarity, conversion flow, proof points, and section rhythm.', 'Official', 'Website', 'enabled'],
  ['mobile-flow-audit', 'MF', '#0284c7', 'Inspect mobile navigation, screen density, states, and thumb-zone ergonomics.', 'Official', 'Mobile', 'enabled'],
  ['design-token-mapper', 'DT', '#7c3aed', 'Map colors, type, spacing, and radius decisions into reusable token suggestions.', 'Official', 'Design System', 'enabled'],
  ['deck-storyline', 'DS', '#f97316', 'Turn rough slide notes into a clear executive storyline.', 'Official', 'Slides', 'available'],
  ['pricing-page-review', 'PR', '#16a34a', 'Critique pricing tiers, plan names, objections, and upgrade cues.', 'Official', 'Growth', 'enabled'],
  ['accessibility-pass', 'AP', '#059669', 'Check generated UI against contrast, focus, labels, and motion basics.', 'Official', 'Quality', 'enabled'],
  ['visual-hierarchy', 'VH', '#dc2626', 'Identify weak hierarchy and propose stronger layout emphasis.', 'Official', 'Design', 'enabled'],
  ['empty-state-writer', 'EW', '#db2777', 'Write helpful empty states, error messages, and recovery prompts.', 'Official', 'Content', 'available'],
  ['brand-voice-pass', 'BV', '#ef4444', 'Align generated copy with a target brand voice and audience.', 'Workspace', 'Content', 'enabled'],
  ['figma-component-audit', 'FA', '#a855f7', 'Review component consistency and identify missing reusable primitives.', 'Workspace', 'Design System', 'enabled'],
  ['checkout-friction', 'CF', '#ea580c', 'Find friction in checkout and onboarding funnels.', 'Workspace', 'Commerce', 'enabled'],
  ['dashboard-density', 'DD', '#4f46e5', 'Tune dashboard density, grouping, labels, and scan paths.', 'Workspace', 'Analytics', 'enabled'],
  ['research-synthesis', 'RS', '#0891b2', 'Cluster notes into insights, opportunities, and design implications.', 'Workspace', 'Research', 'enabled'],
  ['client-review-summary', 'CS', '#be123c', 'Summarize review feedback into decisions, risks, and next actions.', 'Workspace', 'Review', 'enabled'],
  ['admin-permissions', 'PM', '#475569', 'Design roles, permissions, and audit-log communication clearly.', 'Workspace', 'Productivity', 'available'],
  ['release-notes-design', 'RN', '#0f766e', 'Turn design changes into readable release notes and user-facing copy.', 'Workspace', 'Content', 'enabled'],
  ['case-study-builder', 'CB', '#111827', 'Structure portfolio case studies around problem, process, and outcome.', 'Personal', 'Website', 'enabled'],
  ['moodboard-brief', 'MB', '#c026d3', 'Translate product strategy into visual direction prompts.', 'Personal', 'Design', 'enabled'],
  ['layout-tightener', 'LT', '#d46a3c', 'Remove loose spacing, vague sections, and generic visual rhythm.', 'Personal', 'Design', 'enabled'],
  ['svg-icon-rules', 'IR', '#64748b', 'Draft icon style rules for stroke, fill, grid, and metaphor choices.', 'Personal', 'Design System', 'enabled'],
  ['copy-shortener', 'CS2', '#db2777', 'Make interface copy shorter, sharper, and more specific.', 'Personal', 'Content', 'enabled'],
  ['prompt-clarifier', 'PC', '#0ea5e9', 'Turn fuzzy product prompts into usable design requirements.', 'Personal', 'Productivity', 'enabled'],
  ['microinteraction-pass', 'MP', '#f59e0b', 'Suggest subtle hover, loading, and transition behavior for UI details.', 'Personal', 'Prototype', 'enabled'],
  ['handoff-checklist', 'HC', '#0284c7', 'Create engineering handoff checklists from finished screens.', 'Personal', 'Handoff', 'enabled'],
  ['information-architecture', 'IA', '#7c3aed', 'Restructure navigation, grouping, and labels for clearer mental models.', 'Personal', 'Productivity', 'enabled'],
  ['form-usability', 'FU', '#16a34a', 'Review forms for ordering, labels, validation, and completion friction.', 'Personal', 'Quality', 'enabled'],
].map(([id, name, icon, accent, description, source, category, status]) => ({
  id,
  name,
  icon,
  accent,
  description,
  source,
  category,
  status,
} as SkillDemo));

const MARKETPLACE_PLUGIN_DEMOS = [...PLUGIN_DEMOS, ...EXTRA_PLUGIN_DEMOS];
const MARKETPLACE_SKILL_DEMOS = [...SKILL_DEMOS, ...EXTRA_SKILL_DEMOS];

const SOURCE_FILTERS: Array<PluginSource | 'All'> = ['Official', 'Workspace', 'Personal'];
const ALL_CATEGORY = 'All';

function sourceLabel(source: PluginSource | 'All') {
  if (source === 'Official') return 'Open Design 官方';
  if (source === 'Workspace') return '团队';
  if (source === 'Personal') return '个人的';
  return '全部';
}

function capabilityDescription(capability: PluginCapability): string {
  if (capability === 'Connector') return '账号授权、权限范围和外部数据连接。';
  if (capability === 'MCP') return '暴露给 Agent 调用的工具与上下文能力。';
  return '可复用的任务流程、审查规则和生成策略。';
}

function isPluginReady(status: PluginDemo['status'] | SkillDemo['status']) {
  return status === 'installed' || status === 'connected' || status === 'enabled';
}

function pluginAuthor(plugin: PluginDemo): string {
  if (plugin.source === 'Official') return '@OpenDesign';
  if (plugin.source === 'Workspace') return '@Nexu Team';
  return '@You';
}

function skillAuthor(skill: SkillDemo): string {
  if (skill.source === 'Official') return 'Open Design';
  if (skill.source === 'Workspace') return 'Nexu Team';
  return 'You';
}

function skillMarkdown(skill: SkillDemo): Array<{ kind: 'h1' | 'h2' | 'p' | 'ol'; content: string | string[] }> {
  if (skill.id === 'template-creator') {
    return [
      { kind: 'h1', content: 'Creating Reusable Templates' },
      { kind: 'p', content: 'Use this skill to turn repeatable artifact patterns into structured templates that agents can apply consistently across projects.' },
      { kind: 'h2', content: 'Before You Begin: Capture The Pattern' },
      {
        kind: 'ol',
        content: [
          'Define the artifact this template should create.',
          'List the inputs the user must provide.',
          'Describe the expected sections and output format.',
          'Collect examples that represent the preferred style.',
          'Note any constraints, validation rules, or review checks.',
        ],
      },
    ];
  }

  if (skill.id === 'anti-ai-polish') {
    return [
      { kind: 'h1', content: 'Removing Generic AI Tells' },
      { kind: 'p', content: 'This skill reviews generated work for vague copy, overused layout patterns, weak hierarchy, and spacing that feels automated rather than designed.' },
      { kind: 'h2', content: 'Review Checklist' },
      {
        kind: 'ol',
        content: [
          'Identify generic phrases and replace them with concrete product language.',
          'Tighten visual hierarchy so the most important action is obvious.',
          'Remove decorative elements that do not support the workflow.',
          'Check spacing, alignment, and density against the target context.',
          'Return specific edits instead of broad aesthetic advice.',
        ],
      },
    ];
  }

  return [
    { kind: 'h1', content: `Using ${skill.name}` },
    { kind: 'p', content: skill.description },
    { kind: 'h2', content: 'Before You Begin: Gather Requirements' },
    {
      kind: 'ol',
      content: [
        'Clarify the task or workflow this skill should help with.',
        'Identify when the agent should apply this skill automatically.',
        'List domain knowledge, examples, or standards the agent should use.',
        'Define the expected output format and success criteria.',
        'Call out existing team patterns or constraints to follow.',
      ],
    },
  ];
}

function pluginCommands(plugin: PluginDemo): Array<{ command: string; hint: string }> {
  const seeds = plugin.skills && plugin.skills.length > 0 ? plugin.skills : [plugin.name];
  return seeds.slice(0, 5).map((skill) => {
    const slug = skill
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || plugin.id;
    return {
      command: `/${slug}`,
      hint: `在对话框中输入该命令，快速调用 ${skill}`,
    };
  });
}

function PluginLogo({ plugin }: { plugin: Pick<PluginDemo | SkillDemo, 'id' | 'name' | 'icon' | 'accent'> }) {
  const style = { '--plugin-accent': plugin.accent } as CSSProperties;

  if (plugin.id === 'github') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--github" style={style} aria-hidden>
        <Icon name="github-filled" size={22} />
      </span>
    );
  }

  if (plugin.id === 'figma') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--figma" style={style} aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  }

  if (plugin.id === 'google-drive') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--drive" style={style} aria-hidden>
        <i />
        <i />
        <i />
      </span>
    );
  }

  if (plugin.id === 'slack') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--slack" style={style} aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  }

  if (plugin.id === 'brand-audit' || plugin.id === 'brand-audit-skill') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--brand-audit" style={style} aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
    );
  }

  if (plugin.id === 'template-creator') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--template" style={style} aria-hidden>
        <Icon name="layout" size={18} />
      </span>
    );
  }

  if (plugin.id === 'prd-to-prototype') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--prototype" style={style} aria-hidden>
        <Icon name="file-code" size={18} />
      </span>
    );
  }

  if (plugin.id === 'anti-ai-polish') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--polish" style={style} aria-hidden>
        <Icon name="tweaks" size={18} />
      </span>
    );
  }

  if (plugin.id === 'notion') {
    return (
      <span className="plugin-marketplace__icon plugin-marketplace__icon--notion" style={style} aria-hidden>
        N
      </span>
    );
  }

  return (
    <span className="plugin-marketplace__icon" style={style} aria-hidden>
      {plugin.icon}
    </span>
  );
}

export function PluginMarketplaceDemo({ onTryPlugin, workspaceExpired = false, onRenewWorkspace }: PluginMarketplaceDemoProps = {}) {
  const [mode, setMode] = useState<MarketplaceMode>('plugins');
  const [source, setSource] = useState<PluginSource | 'All'>('Official');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORY);
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [detailPlugin, setDetailPlugin] = useState<PluginDemo | null>(null);
  const [detailSkill, setDetailSkill] = useState<SkillDemo | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<'plugin' | 'skill'>('plugin');

  const pluginsForSource = useMemo(() => {
    return MARKETPLACE_PLUGIN_DEMOS.filter((plugin) => source === 'All' || plugin.source === source);
  }, [source]);

  const categoryTags = useMemo(() => {
    const rows = mode === 'skills'
      ? MARKETPLACE_SKILL_DEMOS.filter((skill) => source === 'All' || skill.source === source)
      : pluginsForSource;
    return [ALL_CATEGORY, ...Array.from(new Set(rows.map((row) => row.category)))];
  }, [mode, pluginsForSource, source]);

  const filteredPlugins = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pluginsForSource.filter((plugin) => {
      if (categoryFilter !== ALL_CATEGORY && plugin.category !== categoryFilter) return false;
      if (!q) return true;
      return `${plugin.name} ${plugin.description} ${plugin.category}`.toLowerCase().includes(q);
    });
  }, [categoryFilter, pluginsForSource, query]);

  const categories = Array.from(new Set(filteredPlugins.map((plugin) => plugin.category)));
  const pluginGroups = categoryFilter === ALL_CATEGORY
    ? [{ id: 'all', label: null as string | null, plugins: filteredPlugins }]
    : categories.map((category) => ({
        id: category,
        label: category,
        plugins: filteredPlugins.filter((plugin) => plugin.category === category),
      }));

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MARKETPLACE_SKILL_DEMOS.filter((skill) => {
      if (source !== 'All' && skill.source !== source) return false;
      if (categoryFilter !== ALL_CATEGORY && skill.category !== categoryFilter) return false;
      if (!q) return true;
      return `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(q);
    });
  }, [categoryFilter, query, source]);
  const isWorkspaceSourceLocked = (item: Pick<PluginDemo | SkillDemo, 'source'>) =>
    workspaceExpired && item.source === 'Workspace';

  if (detailPlugin) {
    if (isWorkspaceSourceLocked(detailPlugin)) {
      return (
        <MarketplaceLockedDetail
          title={detailPlugin.name}
          onBack={() => setDetailPlugin(null)}
          onRenewWorkspace={onRenewWorkspace}
          kind="专家套件"
        />
      );
    }
    return (
      <PluginSuiteDetail
        plugin={detailPlugin}
        onBack={() => setDetailPlugin(null)}
        onUseCommand={(item) => {
          const label = item.command
            .replace(/^\//, '')
            .split('-')
            .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
            .join(' ');
          onTryPlugin?.({
            id: `${detailPlugin.id}-${item.command.replace(/^\//, '')}`,
            name: item.command,
            description: `请基于当前项目内容生成 ${label}。`,
            category: detailPlugin.category,
            marketplaceKind: 'command',
            command: item.command,
            commandLabel: item.command,
          });
        }}
      />
    );
  }

  if (detailSkill) {
    if (isWorkspaceSourceLocked(detailSkill)) {
      return (
        <MarketplaceLockedDetail
          title={detailSkill.name}
          onBack={() => setDetailSkill(null)}
          onRenewWorkspace={onRenewWorkspace}
          kind="Skill"
        />
      );
    }
    return (
      <SkillDetail
        skill={detailSkill}
        onBack={() => setDetailSkill(null)}
        onTrySkill={() => onTryPlugin?.({ ...detailSkill, marketplaceKind: 'skill' })}
      />
    );
  }

  return (
    <section className="plugin-marketplace" aria-labelledby="plugin-marketplace-title">
      <header className="plugin-marketplace__hero">
        <div>
          <h1 id="plugin-marketplace-title" className="entry-section__title">
            扩展
          </h1>
          <p>
            安装专家套件、技能和连接器，为 Open Design 增加新的工作能力。
          </p>
        </div>
        <div className="plugin-marketplace__hero-actions">
          <button
            type="button"
            className="plugin-marketplace__create"
            disabled={workspaceExpired}
            title={workspaceExpired ? '团队版到期后不能新增团队 Plugin 或 Skill' : undefined}
            onClick={() => {
              setCreateKind(mode === 'skills' ? 'skill' : 'plugin');
              setCreateOpen(true);
            }}
          >
            <Icon name="plus" size={15} />
            新增
          </button>
        </div>
      </header>

      <div className="plugin-marketplace__toolbar">
        <div className="plugin-marketplace__switch" aria-label="Marketplace mode">
          <button
            type="button"
            className={mode === 'plugins' ? 'is-active' : ''}
            onClick={() => {
              setMode('plugins');
              setCategoryFilter(ALL_CATEGORY);
            }}
          >
            专家套件
          </button>
          <button
            type="button"
            className={mode === 'skills' ? 'is-active' : ''}
            onClick={() => {
              setMode('skills');
              setCategoryFilter(ALL_CATEGORY);
            }}
          >
            技能
          </button>
        </div>

      </div>

      <p className="plugin-marketplace__mode-note">
        {mode === 'plugins'
          ? '专家套件是面向角色行业的工具套件，在对话框中输入 @ 或斜杠即可使用。'
          : '技能是可复用的任务流程和审查规则，可独立使用，也可以被专家套件组合调用。'}
      </p>
      {workspaceExpired ? (
        <div className="plugin-marketplace__expired-note" role="status">
          <Icon name="lock" size={14} />
          <span>团队版已到期，团队来源的 Plugin 和 Skill 会保留但锁定；个人和官方能力仍可继续使用。</span>
          {onRenewWorkspace ? (
            <button type="button" onClick={onRenewWorkspace}>
              续费恢复
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="plugin-marketplace__filter-block">
        <div className="plugin-marketplace__filters" aria-label="Marketplace source filters">
          {SOURCE_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={source === item ? 'is-active' : ''}
              onClick={() => {
                setSource(item);
                setCategoryFilter(ALL_CATEGORY);
              }}
            >
              {sourceLabel(item)}
            </button>
          ))}
          <label className="plugin-marketplace__search">
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                mode === 'plugins'
                  ? 'Search expert suites'
                  : 'Search skills'
              }
              aria-label={
                mode === 'plugins'
                  ? 'Search expert suites'
                  : 'Search skills'
              }
            />
          </label>
        </div>
        <div className="plugin-marketplace__category-tags" aria-label={`${sourceLabel(source)} categories`}>
          {categoryTags.map((category) => (
            <button
              key={category}
              type="button"
              className={categoryFilter === category ? 'is-active' : ''}
              onClick={() => {
                setCategoryFilter(category);
              }}
            >
              {category === ALL_CATEGORY ? 'All' : category}
            </button>
          ))}
        </div>
      </div>

      {mode !== 'skills' ? (
      <div className="plugin-marketplace__catalog">
        {pluginGroups.map((group) => (
          <section
            key={group.id}
            className={`plugin-marketplace__category${group.label ? '' : ' plugin-marketplace__category--flat'}`}
            aria-labelledby={group.label ? `plugin-category-${group.id}` : undefined}
          >
            {group.label ? <h2 id={`plugin-category-${group.id}`}>{group.label}</h2> : null}
            <div className="plugin-marketplace__rows">
              {group.plugins
                .map((plugin) => {
                  const isReady = isPluginReady(plugin.status);
                  const locked = isWorkspaceSourceLocked(plugin);
                  const skillCount = plugin.skills?.length ?? 0;
                  const connectorCount = plugin.connector?.length ?? 0;
                  return (
                    <article
                      key={plugin.id}
                      className={`plugin-marketplace__item${locked ? ' is-locked' : ' is-clickable'}`}
                      role={locked ? undefined : 'button'}
                      tabIndex={locked ? undefined : 0}
                      onClick={() => {
                        if (locked) return;
                        setDetailPlugin(plugin);
                        setMenuId(null);
                      }}
                      onKeyDown={(event) => {
                        if (locked) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setDetailPlugin(plugin);
                        setMenuId(null);
                      }}
                    >
                      <div className="plugin-marketplace__row">
                        <PluginLogo plugin={plugin} />
                        <span className="plugin-marketplace__row-main">
                          <strong>{plugin.name}</strong>
                          <small>{plugin.description}</small>
                          <span className="plugin-marketplace__row-stats">
                            <span>{skillCount} skills</span>
                            <span>{connectorCount} connectors</span>
                            {locked ? <span className="plugin-marketplace__lock-badge"><Icon name="lock" size={11} /> 已锁定</span> : null}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="plugin-marketplace__row-action"
                          disabled={locked}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isReady && !locked) {
                              onTryPlugin?.(plugin);
                            }
                          }}
                        >
                          {locked ? '已锁定' : isReady ? 'Try it' : '安装'}
                        </button>
                        {isReady && !locked ? (
                          <span className="plugin-marketplace__menu-wrap">
                            <button
                              type="button"
                              className="plugin-marketplace__more"
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuId(menuId === plugin.id ? null : plugin.id);
                              }}
                              aria-expanded={menuId === plugin.id}
                              aria-label={`${plugin.name} more actions`}
                            >
                              <Icon name="more-horizontal" size={16} />
                            </button>
                            {menuId === plugin.id ? (
                              <span className="plugin-marketplace__menu" role="menu">
                                {plugin.source === 'Personal' ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setMenuId(null);
                                    }}
                                  >
                                    <Icon name="share" size={14} />
                                    转为团队共享
                                  </button>
                                ) : null}
                                <button type="button" role="menuitem">
                                  <Icon name="trash" size={14} />
                                  卸载
                                </button>
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        ))}
        {filteredPlugins.length === 0 ? (
          <div className="plugin-marketplace__empty">
            <Icon name="search" size={18} />
            <strong>No plugin packages found</strong>
            <span>Try a different keyword or source filter.</span>
          </div>
        ) : null}
      </div>
      ) : (
        <div className="plugin-marketplace__catalog">
          <div className="plugin-marketplace__rows">
            {filteredSkills.map((skill) => (
              (() => {
                const locked = isWorkspaceSourceLocked(skill);
                return (
              <article
                key={skill.id}
                className={`plugin-marketplace__item plugin-marketplace__item--skill${locked ? ' is-locked' : ' is-clickable'}`}
                role={locked ? undefined : 'button'}
                tabIndex={locked ? undefined : 0}
                onClick={() => {
                  if (locked) return;
                  setDetailSkill(skill);
                  setMenuId(null);
                }}
                onKeyDown={(event) => {
                  if (locked) return;
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  setDetailSkill(skill);
                  setMenuId(null);
                }}
              >
                <div className="plugin-marketplace__row">
                  <PluginLogo plugin={skill} />
                  <span className="plugin-marketplace__row-main">
                    <strong>{skill.name}</strong>
                    <small>{skill.description}</small>
                    {locked ? <span className="plugin-marketplace__lock-badge"><Icon name="lock" size={11} /> 已锁定</span> : null}
                  </span>
                  <button
                    type="button"
                    className="plugin-marketplace__row-action"
                    disabled={locked}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isPluginReady(skill.status) && !locked) {
                        onTryPlugin?.({ ...skill, marketplaceKind: 'skill' });
                      }
                    }}
                  >
                    {locked ? '已锁定' : isPluginReady(skill.status) ? 'Try it' : '安装'}
                  </button>
                  {isPluginReady(skill.status) && !locked ? (
                    <span className="plugin-marketplace__menu-wrap">
                      <button
                        type="button"
                        className="plugin-marketplace__more"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuId(menuId === skill.id ? null : skill.id);
                        }}
                        aria-expanded={menuId === skill.id}
                        aria-label={`${skill.name} more actions`}
                      >
                        <Icon name="more-horizontal" size={16} />
                      </button>
                      {menuId === skill.id ? (
                        <span className="plugin-marketplace__menu" role="menu">
                          {skill.source === 'Personal' ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuId(null);
                              }}
                            >
                              <Icon name="share" size={14} />
                              转为团队共享
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Icon name="trash" size={14} />
                            卸载
                          </button>
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </article>
                );
              })()
            ))}
          </div>
          {filteredSkills.length === 0 ? (
            <div className="plugin-marketplace__empty">
              <Icon name="search" size={18} />
              <strong>No skills found</strong>
              <span>Try a different keyword or source filter.</span>
            </div>
          ) : null}
        </div>
      )}

      {createOpen ? (
        <div className="plugin-marketplace__modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <section
            className="plugin-marketplace__create-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plugin-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="plugin-marketplace__create-head">
              <div>
                <h2 id="plugin-create-title">新增 {createKind === 'plugin' ? 'Plugin' : 'Skill'}</h2>
                <p>
                  {createKind === 'plugin'
                    ? '从 GitHub 或本地文件夹导入一个插件，上传后即可在团队内使用。'
                    : '创建一个可复用的任务流程或审查规则，之后可以被 Plugin 复用。'}
                </p>
              </div>
              <button type="button" aria-label="关闭新增面板" onClick={() => setCreateOpen(false)}>
                <Icon name="close" size={15} />
              </button>
            </header>
            <div className="plugin-marketplace__create-tabs" aria-label="Create type">
              <button
                type="button"
                className={createKind === 'plugin' ? 'is-active' : ''}
                onClick={() => setCreateKind('plugin')}
              >
                Plugin
              </button>
              <button
                type="button"
                className={createKind === 'skill' ? 'is-active' : ''}
                onClick={() => setCreateKind('skill')}
              >
                Skill
              </button>
            </div>
            <div className="plugin-marketplace__create-options">
              <article>
                <span className="plugin-marketplace__create-option-icon" aria-hidden>
                  <Icon name="external-link" size={20} />
                </span>
                <div>
                  <h3>从链接导入</h3>
                  <p>
                    粘贴 {createKind === 'plugin' ? '专家套件' : 'Skill'} 的公开链接，
                    Open Design 会拉取清单、校验能力并上传到团队空间。
                  </p>
                  <label>
                    <span>URL</span>
                    <input placeholder={createKind === 'plugin' ? 'https://example.com/open-design-suite' : 'https://example.com/skill'} />
                  </label>
                </div>
                <button type="button">导入并上传</button>
              </article>
              <article>
                <span className="plugin-marketplace__create-option-icon" aria-hidden>
                  <Icon name="folder" size={20} />
                </span>
                <div>
                  <h3>上传本地文件夹</h3>
                  <p>
                    选择包含 {createKind === 'plugin' ? 'open-design.json / SKILL.md' : 'SKILL.md'} 的本地目录，
                    校验通过后上传为团队 {createKind === 'plugin' ? '专家套件' : 'Skill'}。
                  </p>
                  <button type="button" className="plugin-marketplace__folder-pick">
                    <Icon name="folder" size={15} />
                    选择文件夹
                  </button>
                </div>
                <button type="button">
                  上传 {createKind === 'plugin' ? '专家套件' : 'Skill'}
                </button>
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function MarketplaceLockedDetail({
  title,
  kind,
  onBack,
  onRenewWorkspace,
}: {
  title: string;
  kind: string;
  onBack: () => void;
  onRenewWorkspace?: () => void;
}) {
  return (
    <section className="plugin-marketplace plugin-marketplace__locked-detail" aria-labelledby="marketplace-locked-title">
      <button type="button" className="plugin-suite-detail__back" onClick={onBack}>
        <Icon name="arrow-left" size={15} />
        返回
      </button>
      <div className="plugin-marketplace__locked-panel">
        <span className="plugin-marketplace__locked-icon" aria-hidden>
          <Icon name="lock" size={20} />
        </span>
        <h1 id="marketplace-locked-title">{title} 已锁定</h1>
        <p>这个团队 {kind} 仍保留在原 Workspace 中，但团队版到期降级后不可打开或运行。Owner 续费后会恢复团队共享能力。</p>
        {onRenewWorkspace ? (
          <button type="button" onClick={onRenewWorkspace}>
            续费恢复
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PluginSuiteDetail({
  plugin,
  onBack,
  onUseCommand,
}: {
  plugin: PluginDemo;
  onBack: () => void;
  onUseCommand: (command: { command: string; hint: string }) => void;
}) {
  const commands = pluginCommands(plugin);
  const connectors = plugin.connector ?? [];
  const skills = plugin.skills ?? [];

  return (
    <section className="plugin-marketplace plugin-suite-detail" aria-labelledby="plugin-suite-title">
      <header className="plugin-suite-detail__topbar">
        <button type="button" className="plugin-suite-detail__back" onClick={onBack}>
          <Icon name="arrow-left" size={15} />
          返回列表
        </button>
      </header>

      <div className="plugin-suite-detail__hero">
        <PluginLogo plugin={plugin} />
        <div>
          <div className="plugin-suite-detail__title-row">
            <h1 id="plugin-suite-title">{plugin.name}</h1>
            <span>{sourceLabel(plugin.source)}</span>
          </div>
          <p className="plugin-suite-detail__author">{pluginAuthor(plugin)}</p>
        </div>
      </div>

      <p className="plugin-suite-detail__description">{plugin.description}</p>

      <DetailSection title="快捷命令" count={commands.length}>
        <div className="plugin-suite-detail__command-list">
          {commands.map((item) => (
            <button
              type="button"
              key={item.command}
              className="plugin-suite-detail__command"
              onClick={() => onUseCommand(item)}
            >
              <strong>{item.command}</strong>
              <span>{item.hint}</span>
              <Icon name="chevron-right" size={15} />
            </button>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="数据连接" count={connectors.length}>
        <div className="plugin-suite-detail__connection-list">
          {connectors.length > 0 ? connectors.map((connector) => (
            <div key={connector} className="plugin-suite-detail__connection">
              <span />
              <strong>{connector}</strong>
              <label className="plugin-suite-detail__switch" aria-label={`${connector} 连接状态`}>
                <input type="checkbox" defaultChecked={plugin.status === 'connected'} />
                <span />
              </label>
            </div>
          )) : (
            <div className="plugin-suite-detail__empty-row">此套件不需要外部数据连接。</div>
          )}
        </div>
      </DetailSection>

      <DetailSection title="知识技能" count={skills.length}>
        <div className="plugin-suite-detail__skill-list">
          {skills.length > 0 ? skills.map((skill) => (
            <article key={skill} className="plugin-suite-detail__skill">
              <h3>{skill}</h3>
              <p>{capabilityDescription('Skill')}</p>
            </article>
          )) : (
            <div className="plugin-suite-detail__empty-row">此套件暂无独立知识技能。</div>
          )}
        </div>
      </DetailSection>
    </section>
  );
}

function SkillDetail({
  skill,
  onBack,
  onTrySkill,
}: {
  skill: SkillDemo;
  onBack: () => void;
  onTrySkill: () => void;
}) {
  const markdown = skillMarkdown(skill);

  return (
    <section className="plugin-marketplace skill-detail" aria-labelledby="skill-detail-title">
      <header className="skill-detail__topbar">
        <button type="button" className="plugin-suite-detail__back" onClick={onBack}>
          <Icon name="arrow-left" size={15} />
          返回列表
        </button>
        <button type="button" className="skill-detail__close" aria-label="关闭详情" onClick={onBack}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="skill-detail__header">
        <PluginLogo plugin={skill} />
        <div>
          <div className="skill-detail__title-row">
            <h1 id="skill-detail-title">{skill.name}</h1>
            <button type="button" onClick={onTrySkill}>
              使用
            </button>
          </div>
          <p>provided by {skillAuthor(skill)}</p>
        </div>
      </div>

      <p className="skill-detail__description">{skill.description}</p>

      <section className="skill-detail__markdown" aria-label={`${skill.name} SKILL.md preview`}>
        <div className="skill-detail__notice">
          <Icon name="info" size={16} />
          以下内容来自该技能的 SKILL.md 原文
        </div>
        {markdown.map((block, index) => {
          if (block.kind === 'h1') {
            return <h2 key={`${block.kind}-${index}`}>{block.content}</h2>;
          }
          if (block.kind === 'h2') {
            return <h3 key={`${block.kind}-${index}`}>{block.content}</h3>;
          }
          if (block.kind === 'ol') {
            return (
              <ol key={`${block.kind}-${index}`}>
                {(block.content as string[]).map((item) => <li key={item}>{item}</li>)}
              </ol>
            );
          }
          return <p key={`${block.kind}-${index}`}>{block.content}</p>;
        })}
      </section>
    </section>
  );
}

function DetailSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="plugin-suite-detail__section">
      <h2>
        {title}
        <span>({count})</span>
      </h2>
      {children}
    </section>
  );
}
