export interface OneShotStudio {
  id: string;
  title: string;
  role: string;
  status: 'native' | 'premium' | 'bridge' | 'planned';
  description: string;
  workflows: string[];
  outputs: string[];
  qualityGates: string[];
  adapterTarget?: string;
}

export interface OneShotCoreCapability {
  title: string;
  description: string;
}

export interface OneShotAdapterContract {
  id: string;
  title: string;
  status: 'ready' | 'bridge' | 'planned';
  methods: string[];
  guardrail: string;
}

export const ONESHOT_STUDIOS: OneShotStudio[] = [
  {
    id: 'website-studio',
    title: 'Website Studio',
    role: 'Native now, external Website Builder OS later',
    status: 'bridge',
    description:
      'Plan and generate professional websites from intake, sitemap, sections, responsive previews, design tokens, and Codex-ready build briefs.',
    workflows: [
      'Site intake',
      'Sitemap and page plan',
      'Landing page generator',
      'Section library',
      'Responsive preview',
      'Build brief export',
    ],
    outputs: ['HTML prototype', 'Sitemap', 'Section brief', 'Design tokens', 'Codex build brief'],
    qualityGates: ['Responsive fit', 'Accessibility', 'Copy clarity', 'Performance posture', 'Real deploy path'],
    adapterTarget: 'Website Builder / Design OS',
  },
  {
    id: 'product-ui-studio',
    title: 'Product UI Studio',
    role: 'App screens, SaaS tools, dashboards, and flows',
    status: 'native',
    description:
      'Create operator-grade product surfaces with states, data density, workflow logic, and implementation handoff.',
    workflows: ['App prototype', 'Dashboard mockup', 'Onboarding flow', 'Settings surface', 'Data table view'],
    outputs: ['Interactive HTML', 'Screen inventory', 'State map', 'Component notes'],
    qualityGates: ['Hierarchy', 'Interaction readiness', 'Data honesty', 'Accessibility', 'Build-readiness'],
  },
  {
    id: 'brand-studio',
    title: 'Brand Studio',
    role: 'Identity systems, typography, palette, and reusable rules',
    status: 'planned',
    description:
      'Turn a company, product, or creator direction into brand kits, typography systems, palettes, and reusable DESIGN.md rules.',
    workflows: ['Brand intake', 'Logo direction', 'Palette system', 'Typography system', 'Brand guideline packet'],
    outputs: ['Brand kit', 'DESIGN.md', 'Token sheet', 'Usage rules'],
    qualityGates: ['Distinctiveness', 'Legibility', 'Consistency', 'Licensing risk', 'System reuse'],
  },
  {
    id: 'deck-studio',
    title: 'Deck Studio',
    role: 'Pitch, sales, report, training, and strategy decks',
    status: 'native',
    description:
      'Generate executive-quality decks with slide arcs, speaker notes, export expectations, and PPTX/PDF handoff paths.',
    workflows: ['Pitch deck', 'Sales deck', 'Report deck', 'Training deck', 'Briefing deck'],
    outputs: ['HTML deck', 'PPTX plan', 'PDF handoff', 'Speaker notes'],
    qualityGates: ['Narrative', 'Slide hierarchy', 'Proof', 'Visual rhythm', 'Export readiness'],
  },
  {
    id: 'marketing-studio',
    title: 'Marketing Studio',
    role: 'Campaigns, social assets, ads, emails, and launch collateral',
    status: 'native',
    description:
      'Create launch and growth assets that stay tied to brand rules, campaign goals, copy variants, and export specs.',
    workflows: ['Ad concept', 'Social carousel', 'Email asset', 'Launch page', 'Campaign pack'],
    outputs: ['Campaign brief', 'HTML asset', 'Copy variants', 'Export checklist'],
    qualityGates: ['Conversion clarity', 'Brand fit', 'Format fit', 'Rights risk', 'QA before export'],
  },
  {
    id: 'covervision-os',
    title: 'CoverVision OS',
    role: 'Premium book-cover studio inside OneShot',
    status: 'premium',
    description:
      'Professional author and publisher workflows for cover concepts, typography labs, series systems, crop packs, and print-production handoff.',
    workflows: [
      'Cover concept lanes',
      'Typography lab',
      'Series design system',
      'Author brand kit',
      'ARC and ad crops',
      'KDP/Ingram checklist',
    ],
    outputs: ['Cover run packet', 'Prompt kit', 'Brief deck', 'Crop pack', 'Production checklist'],
    qualityGates: ['Genre signal', 'Thumbnail readability', 'Typography safety', 'Rights risk', 'Print readiness'],
    adapterTarget: 'CoverVision OS',
  },
  {
    id: 'evidence-studio',
    title: 'Evidence Studio',
    role: 'Research, screenshots, references, source trails, and packets',
    status: 'native',
    description:
      'Turn messy sources into traceable evidence inventories, opportunity rankings, DESIGN.md contracts, and build packets.',
    workflows: ['Screenshot intake', 'Reference board', 'Source trail', 'Opportunity packet', 'DESIGN.md extraction'],
    outputs: ['Evidence inventory', 'Opportunity report', 'DESIGN.md', 'Audit trail'],
    qualityGates: ['Source traceability', 'Privacy posture', 'Claim support', 'Design specificity', 'Build-readiness'],
  },
  {
    id: 'codex-build-studio',
    title: 'Codex Build Studio',
    role: 'Design-to-code handoff, verification, and implementation plans',
    status: 'native',
    description:
      'Translate design artifacts into exact Codex build briefs with requirements, file paths, constraints, commands, and verification gates.',
    workflows: ['Build brief', 'Implementation plan', 'Verification plan', 'Repo handoff', 'Agent run packet'],
    outputs: ['Codex brief', 'File plan', 'Verification commands', 'Acceptance criteria'],
    qualityGates: ['Scope clarity', 'File specificity', 'Testability', 'Risk handling', 'Repo readiness'],
  },
];

export const ONESHOT_SHARED_CORE: OneShotCoreCapability[] = [
  {
    title: 'Projects',
    description: 'Every run belongs to a reusable project with files, prompts, metadata, and handoff history.',
  },
  {
    title: 'Artifacts',
    description: 'HTML, Markdown, decks, packets, images, and briefs are first-class outputs, not chat byproducts.',
  },
  {
    title: 'Source and Reference Library',
    description: 'Evidence, inspiration boards, screenshots, and prior designs stay searchable and reusable.',
  },
  {
    title: 'Design Systems',
    description: 'Each studio can inherit or generate DESIGN.md rules, tokens, typography, layouts, and anti-patterns.',
  },
  {
    title: 'Versions and Export History',
    description: 'OneShot keeps runs auditable so strong directions can be reused, forked, restored, or shipped.',
  },
  {
    title: 'Quality Gates',
    description: 'Studios score output before export instead of relying on generic AI confidence.',
  },
  {
    title: 'Codex Build Briefs',
    description: 'Design work can become an implementation packet with exact goals, constraints, paths, and checks.',
  },
  {
    title: 'Adapter Layer',
    description: 'External engines can plug into OneShot without replacing the project, library, export, or QA core.',
  },
];

export const ONESHOT_OUTPUT_CONTROLS = [
  'Critique panel',
  'Quality scorecard',
  'Comments and pins',
  'Tweak controls for color, type, spacing, and density',
  'Export history',
  'Evidence trail',
  'Review before export',
  'No fake deploy or fake status',
];

export const ONESHOT_ADAPTER_CONTRACTS: OneShotAdapterContract[] = [
  {
    id: 'website-builder',
    title: 'Website Builder Adapter',
    status: 'bridge',
    methods: [
      'generateSitePlan',
      'generatePage',
      'generateSection',
      'validateResponsive',
      'exportBuildBrief',
      'publishOrPrepareDeploy',
    ],
    guardrail: 'Publishing requires a real deploy URL or explicit prepare-only state. OneShot must never invent live links.',
  },
  {
    id: 'image-generation',
    title: 'Image Generation Adapter',
    status: 'planned',
    methods: ['buildImageBrief', 'generateAsset', 'editAsset', 'scoreAsset', 'attachRightsNotes'],
    guardrail: 'Generated images stay draft assets until licensing, source, and production QA are recorded.',
  },
  {
    id: 'codex-agent',
    title: 'Codex / Code Agent Adapter',
    status: 'ready',
    methods: ['composeBuildBrief', 'runAgent', 'streamEvents', 'writeFiles', 'verifyCommands'],
    guardrail: 'Agent runs must preserve files, show real errors, and report exact verification output.',
  },
  {
    id: 'export',
    title: 'Export Adapter',
    status: 'ready',
    methods: ['exportHtml', 'exportMarkdown', 'exportPdf', 'exportPptx', 'exportZip'],
    guardrail: 'Exports must name the real file, format, source artifact, and remaining production limitations.',
  },
  {
    id: 'design-system',
    title: 'Design System Adapter',
    status: 'planned',
    methods: ['importDesignSystem', 'extractTokens', 'validateTokens', 'applyDesignSystem', 'exportDesignSystem'],
    guardrail: 'Imported systems remain traceable to their source and cannot silently override active project rules.',
  },
];

export const WEBSITE_STUDIO_V1_PROMPT = `Create a Website Studio v1 packet inside OneShot Design.

Use OneShot as the professional Design OS and treat this as a native website-builder workflow that can later hand off to a dedicated Website Builder / Design OS.

Required output:
1. Site intake: business, audience, offer, pages, primary conversion, brand constraints, source/reference assets, missing facts, and assumptions.
2. Sitemap and page plan: page list, purpose, primary CTA, section order, content needs, and build priority.
3. Landing page generator plan: first viewport, proof sections, offer section, CTA section, responsive behavior, and accessibility notes.
4. Section library: hero, social proof, feature/value, process, pricing/offer, FAQ, contact/booking, footer, and reusable variants.
5. Design tokens: typography, color, spacing, radius, surface, motion, and component rules for the website.
6. Responsive preview plan: desktop, tablet, mobile, content overflow risks, and navigation behavior.
7. Codex build brief: goal, source folder, output folder, framework assumptions, file plan, constraints, verification commands, and exact files to create or edit.
8. Quality scorecard: visual quality, responsive behavior, accessibility, copy clarity, performance posture, source traceability, deploy readiness, and no-fake-status compliance.

Trust rule:
- Do not claim the website is deployed unless a real deploy URL is provided by the operator or generated by a verified deployment command.
- If deployment is not available, mark the status as prepare-only and list the next real command.`;
