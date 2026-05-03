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

export interface OneShotQualityGate {
  id: string;
  title: string;
  score: number;
  status: 'ready' | 'review' | 'blocked';
  evidence: string;
}

export interface OneShotStudioModule {
  id: string;
  title: string;
  status: 'native' | 'premium' | 'adapter-ready' | 'planned';
  description: string;
  items: string[];
}

export interface WebsiteStudioIntakeTemplate {
  business: string;
  audience: string;
  offer: string;
  conversion: string;
  pages: string[];
  sourcePath: string;
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

export const WEBSITE_STUDIO_DEFAULT_INTAKE: WebsiteStudioIntakeTemplate = {
  business: 'Professional service, software product, creator brand, or local operator',
  audience: 'Primary buyer, evaluator, and repeat visitor',
  offer: 'Clear promise, proof, deliverables, and next step',
  conversion: 'Book call, buy, join waitlist, download packet, or request build',
  pages: ['Home', 'Offer', 'Proof', 'Pricing', 'Contact'],
  sourcePath: 'Add local source folder, reference board, or repo path before export',
};

export const WEBSITE_STUDIO_SECTIONS: OneShotStudioModule[] = [
  {
    id: 'hero',
    title: 'Hero',
    status: 'native',
    description: 'First viewport with literal offer, proof hint, primary CTA, and responsive copy limits.',
    items: ['Offer lock', 'Proof cue', 'CTA', 'Mobile wrap'],
  },
  {
    id: 'proof',
    title: 'Proof',
    status: 'native',
    description: 'Evidence-backed credibility section with real source notes instead of vague trust badges.',
    items: ['Case evidence', 'Metrics with source', 'Testimonials', 'Risk notes'],
  },
  {
    id: 'value',
    title: 'Feature / Value',
    status: 'native',
    description: 'Scannable benefits, workflow fit, and product details arranged for serious evaluation.',
    items: ['Feature blocks', 'Use cases', 'Operator detail', 'Comparison'],
  },
  {
    id: 'conversion',
    title: 'Conversion',
    status: 'native',
    description: 'Pricing, FAQ, booking, and contact patterns with review-before-export checks.',
    items: ['Offer card', 'FAQ', 'Booking', 'Footer'],
  },
];

export const ONESHOT_QUALITY_GATES: OneShotQualityGate[] = [
  {
    id: 'visual-quality',
    title: 'Visual quality',
    score: 86,
    status: 'review',
    evidence: 'Hierarchy, spacing, typography, and polish must pass before export.',
  },
  {
    id: 'responsiveness',
    title: 'Responsiveness',
    score: 82,
    status: 'review',
    evidence: 'Desktop, tablet, and mobile frames must be checked for overflow and navigation behavior.',
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    score: 80,
    status: 'review',
    evidence: 'Contrast, focus states, labels, and reduced-motion posture are required gates.',
  },
  {
    id: 'traceability',
    title: 'Source/evidence traceability',
    score: 88,
    status: 'ready',
    evidence: 'Claims, references, prompts, and design decisions need visible source paths.',
  },
  {
    id: 'copy-clarity',
    title: 'Copy clarity',
    score: 84,
    status: 'review',
    evidence: 'Headlines, CTAs, labels, and proof language must stay specific and English-only.',
  },
  {
    id: 'export-readiness',
    title: 'Export readiness',
    score: 78,
    status: 'review',
    evidence: 'Output format, files, limits, and downstream production requirements must be named.',
  },
  {
    id: 'build-readiness',
    title: 'Build readiness',
    score: 83,
    status: 'review',
    evidence: 'Codex briefs need exact goals, file plan, constraints, and verification commands.',
  },
  {
    id: 'risk-privacy',
    title: 'Risk/privacy notes',
    score: 90,
    status: 'ready',
    evidence: 'Private material, assumptions, unsupported claims, and deploy limits remain visible.',
  },
];

export const ONESHOT_OUTPUT_CONTROL_MODULES: OneShotStudioModule[] = [
  {
    id: 'critique',
    title: 'Critique panel',
    status: 'native',
    description: 'Operator-facing review that finds weaknesses before polish or export.',
    items: ['Hierarchy', 'Specificity', 'Risk', 'Next pass'],
  },
  {
    id: 'comments-pins',
    title: 'Comments and pins',
    status: 'native',
    description: 'Artifact notes that keep decisions attached to the exact screen, section, or source.',
    items: ['Artifact pin', 'Source note', 'Owner note', 'Review state'],
  },
  {
    id: 'export-history',
    title: 'Export history',
    status: 'native',
    description: 'Every exported packet records format, source artifact, limits, and next command.',
    items: ['HTML', 'Markdown', 'PDF plan', 'ZIP plan'],
  },
  {
    id: 'tweak-controls',
    title: 'Tweak controls',
    status: 'planned',
    description: 'Shared placeholders for color, type, spacing, and density adjustments across studios.',
    items: ['Color', 'Type', 'Spacing', 'Density'],
  },
];

export const COVERVISION_STUDIO_DEEPENING: OneShotStudioModule[] = [
  {
    id: 'concept-lanes',
    title: 'Cover concept lanes',
    status: 'premium',
    description: 'Three to six cover directions with genre rationale, comp fit, and thumbnail risk.',
    items: ['Genre signal', 'Composition', 'Art brief', 'Risk'],
  },
  {
    id: 'typography-lab',
    title: 'Typography lab',
    status: 'premium',
    description: 'Title, author, series, and subtitle hierarchy tested before final finishing.',
    items: ['Title scale', 'Author scale', 'Series badge', 'Thumbnail test'],
  },
  {
    id: 'series-system',
    title: 'Series system',
    status: 'premium',
    description: 'Reusable book-series rules for covers, spines, colors, type, and launch assets.',
    items: ['Book rules', 'Spine rules', 'Palette', 'Reusable brief'],
  },
  {
    id: 'production-pack',
    title: 'ARC/ad/audiobook crop packs',
    status: 'premium',
    description: 'Derivative asset plan for launch, audiobook, social, ads, and print-production review.',
    items: ['ARC', 'Audiobook', 'Ads', 'KDP/Ingram'],
  },
];

export const EVIDENCE_STUDIO_PIPELINE: OneShotStudioModule[] = [
  {
    id: 'ingest',
    title: 'Ingest and classify',
    status: 'native',
    description: 'Bring in screenshots, references, files, exports, links, and repo paths as evidence.',
    items: ['Originals', 'Thumbnails', 'Supporting assets', 'Flagged files'],
  },
  {
    id: 'trace',
    title: 'Evidence trail',
    status: 'native',
    description: 'Preserve source paths, assumptions, private material, and review gates.',
    items: ['Source path', 'Assumption', 'Private flag', 'Review gate'],
  },
  {
    id: 'extract',
    title: 'Generate DESIGN.md',
    status: 'native',
    description: 'Turn selected references into visual direction, tokens, layout rules, and anti-patterns.',
    items: ['Visual rules', 'Tokens', 'Components', 'Anti-patterns'],
  },
  {
    id: 'handoff',
    title: 'Opportunity and Codex packets',
    status: 'native',
    description: 'Create opportunity rankings, quality scorecards, and Codex build briefs with exact paths.',
    items: ['Ranking', 'Scorecard', 'Build brief', 'Verification'],
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
