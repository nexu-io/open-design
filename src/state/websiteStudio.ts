import {
  ONESHOT_QUALITY_GATES,
  WEBSITE_STUDIO_DEFAULT_INTAKE,
  WEBSITE_STUDIO_SECTIONS,
} from '../oneshotDesignOS';

export type WebsiteQualityGateStatus = 'pass' | 'needs-review' | 'blocked';
export type WebsiteBuilderAdapterStatus = 'prepare-only' | 'verified-local' | 'verified-deployed';

export interface WebsiteBuilderAdapterVerification {
  target: string;
  status: 'ok' | 'failed';
  checkedAt: number;
  httpStatus?: number;
  detail: string;
}

export interface EvidenceStudioScanFile {
  path: string;
  role: 'original' | 'thumbnail' | 'supporting' | 'flagged';
  size: number;
  reason: string;
}

export interface EvidenceStudioScanResult {
  sourcePath: string;
  scannedAt: number;
  originals: number;
  thumbnails: number;
  supportingAssets: number;
  flaggedFiles: number;
  files: EvidenceStudioScanFile[];
  error?: string;
}

export interface WebsiteStudioPin {
  id: string;
  target: string;
  note: string;
  createdAt: number;
}

export interface WebsiteStudioQualityReview {
  id: string;
  title: string;
  status: WebsiteQualityGateStatus;
  note: string;
  evidence: string;
}

export interface WebsiteStudioWorkbenchState {
  intake: {
    business: string;
    audience: string;
    offer: string;
    conversion: string;
    sourcePath: string;
  };
  sitemap: string[];
  selectedSectionIds: string[];
  tokens: Record<string, string>;
  deployTarget: string;
  deployCommandEvidence: string;
  deployVerification: WebsiteBuilderAdapterVerification | null;
  qualityReviews: WebsiteStudioQualityReview[];
  pins: WebsiteStudioPin[];
  evidenceStudio: {
    sourcePath: string;
    originals: number;
    thumbnails: number;
    supportingAssets: number;
    flaggedFiles: number;
    reviewGate: string;
    files: EvidenceStudioScanFile[];
    lastScanAt: number | null;
    scanError: string | null;
  };
  updatedAt: number;
}

export type WebsiteStudioArtifacts = Record<
  | 'site_plan.md'
  | 'section_library.md'
  | 'design_tokens.md'
  | 'codex_build_brief.md'
  | 'responsive_qa.md'
  | 'evidence_inventory.md'
  | 'DESIGN.md'
  | 'opportunity_packet.md'
  | 'adapter_execution.md'
  | 'packet_review.md',
  string
>;

const STORAGE_KEY = 'oneshot:website-studio-workbench';

const DEFAULT_TOKENS: Record<string, string> = {
  Typography: 'Display title, compact UI, mono numerals and paths',
  Color: 'Paper, graphite, amber proof, cyan action telemetry',
  Spacing: 'Dense but calm, 8px rhythm, fixed preview frames',
  Motion: 'Only status, review, and source-to-output transitions',
};

export function createDefaultWebsiteStudioState(): WebsiteStudioWorkbenchState {
  return {
    intake: {
      business: WEBSITE_STUDIO_DEFAULT_INTAKE.business,
      audience: WEBSITE_STUDIO_DEFAULT_INTAKE.audience,
      offer: WEBSITE_STUDIO_DEFAULT_INTAKE.offer,
      conversion: WEBSITE_STUDIO_DEFAULT_INTAKE.conversion,
      sourcePath: WEBSITE_STUDIO_DEFAULT_INTAKE.sourcePath,
    },
    sitemap: WEBSITE_STUDIO_DEFAULT_INTAKE.pages,
    selectedSectionIds: WEBSITE_STUDIO_SECTIONS.map((section) => section.id),
    tokens: DEFAULT_TOKENS,
    deployTarget: '',
    deployCommandEvidence: '',
    deployVerification: null,
    qualityReviews: ONESHOT_QUALITY_GATES.map((gate) => ({
      id: gate.id,
      title: gate.title,
      status: gate.status === 'ready' ? 'pass' : 'needs-review',
      note: gate.evidence,
      evidence: gate.status === 'ready' ? 'Default gate has source posture.' : 'Needs operator review before export.',
    })),
    pins: [
      {
        id: 'pin-website-hero',
        target: 'Website Studio / Hero',
        note: 'Lock the offer, CTA, and proof before export.',
        createdAt: 1,
      },
      {
        id: 'pin-deploy-status',
        target: 'Website Builder Adapter',
        note: 'Remain prepare-only until a local URL or deploy command is verified.',
        createdAt: 2,
      },
    ],
    evidenceStudio: {
      sourcePath: WEBSITE_STUDIO_DEFAULT_INTAKE.sourcePath,
      originals: 0,
      thumbnails: 0,
      supportingAssets: 0,
      flaggedFiles: 0,
      reviewGate: 'Source paths required before claims become export-ready.',
      files: [],
      lastScanAt: null,
      scanError: null,
    },
    updatedAt: Date.now(),
  };
}

export function loadWebsiteStudioState(): WebsiteStudioWorkbenchState {
  if (typeof window === 'undefined') return createDefaultWebsiteStudioState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultWebsiteStudioState();
    return normalizeWebsiteStudioState(JSON.parse(raw));
  } catch {
    return createDefaultWebsiteStudioState();
  }
}

export function saveWebsiteStudioState(state: WebsiteStudioWorkbenchState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
}

export function resetWebsiteStudioState(): WebsiteStudioWorkbenchState {
  const state = createDefaultWebsiteStudioState();
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  return state;
}

export function resolveWebsiteBuilderAdapterStatus(
  state: WebsiteStudioWorkbenchState,
): {
  status: WebsiteBuilderAdapterStatus;
  label: string;
  detail: string;
} {
  const target = state.deployTarget.trim();
  const commandEvidence = state.deployCommandEvidence.trim();
  const verified =
    state.deployVerification?.target === target &&
    state.deployVerification.status === 'ok';
  if (
    verified &&
    target.startsWith('http://127.0.0.1') ||
    (verified && target.startsWith('http://localhost'))
  ) {
    return {
      status: 'verified-local',
      label: 'Verified local',
      detail: state.deployVerification?.detail ?? target,
    };
  }
  if (verified && target.startsWith('https://') && commandEvidence.length > 0) {
    return {
      status: 'verified-deployed',
      label: 'Verified deployed',
      detail: `${target} verified by recorded command output.`,
    };
  }
  return {
    status: 'prepare-only',
    label: 'Prepare-only',
    detail: 'No live URL claimed. Export a build brief or run a real deploy command first.',
  };
}

export function buildWebsiteStudioArtifacts(
  state: WebsiteStudioWorkbenchState,
): WebsiteStudioArtifacts {
  const adapterStatus = resolveWebsiteBuilderAdapterStatus(state);
  const selectedSections = WEBSITE_STUDIO_SECTIONS.filter((section) =>
    state.selectedSectionIds.includes(section.id),
  );
  const gateLines = state.qualityReviews.map(
    (gate) => `- ${gate.title}: ${gate.status}. ${gate.note} Evidence: ${gate.evidence}`,
  );
  const pinLines = state.pins.map((pin) => `- ${pin.target}: ${pin.note}`);
  const evidenceFiles = state.evidenceStudio.files.map(
    (file) => `- ${file.role}: ${file.path} (${file.size} bytes). ${file.reason}`,
  );
  const blockedGates = state.qualityReviews.filter((gate) => gate.status === 'blocked');
  const reviewGates = state.qualityReviews.filter((gate) => gate.status === 'needs-review');
  const passGates = state.qualityReviews.filter((gate) => gate.status === 'pass');

  return {
    'site_plan.md': [
      '# Website Studio Site Plan',
      '',
      `Business: ${state.intake.business}`,
      `Audience: ${state.intake.audience}`,
      `Offer: ${state.intake.offer}`,
      `Primary conversion: ${state.intake.conversion}`,
      `Source/reference path: ${state.intake.sourcePath}`,
      '',
      '## Sitemap',
      ...state.sitemap.map((page, index) => `${index + 1}. ${page}`),
      '',
      '## Review Pins',
      ...(pinLines.length ? pinLines : ['- No pins recorded.']),
    ].join('\n'),
    'section_library.md': [
      '# Website Studio Section Library',
      '',
      ...selectedSections.flatMap((section) => [
        `## ${section.title}`,
        section.description,
        '',
        ...section.items.map((item) => `- ${item}`),
        '',
      ]),
    ].join('\n'),
    'design_tokens.md': [
      '# Website Studio Design Tokens',
      '',
      ...Object.entries(state.tokens).map(([label, value]) => `- ${label}: ${value}`),
    ].join('\n'),
    'codex_build_brief.md': [
      '# Codex Build Brief',
      '',
      `Goal: Build a professional website for ${state.intake.business}.`,
      `Audience: ${state.intake.audience}.`,
      `Offer: ${state.intake.offer}.`,
      `Primary conversion: ${state.intake.conversion}.`,
      `Source/reference path: ${state.intake.sourcePath}.`,
      `Deploy adapter status: ${adapterStatus.status}.`,
      `Deploy detail: ${adapterStatus.detail}`,
      '',
      '## Files To Generate',
      '- site_plan.md',
      '- section_library.md',
      '- design_tokens.md',
      '- codex_build_brief.md',
      '- responsive_qa.md',
      '',
      '## Verification Commands',
      '- pnpm typecheck',
      '- pnpm test -- --reporter=default',
      '- pnpm build',
      '- Playwright desktop and mobile screenshots with no horizontal overflow',
      '',
      '## Review Before Build',
      `- Passing gates: ${passGates.length}`,
      `- Needs review: ${reviewGates.length}`,
      `- Blocked: ${blockedGates.length}`,
      `- Pins/comments: ${state.pins.length}`,
      `- Evidence files: ${state.evidenceStudio.files.length}`,
    ].join('\n'),
    'responsive_qa.md': [
      '# Responsive QA',
      '',
      `Adapter status: ${adapterStatus.label}`,
      `Adapter detail: ${adapterStatus.detail}`,
      '',
      '## Quality Gates',
      ...gateLines,
      '',
      '## Evidence Studio v1',
      `Source path: ${state.evidenceStudio.sourcePath}`,
      `Originals: ${state.evidenceStudio.originals}`,
      `Thumbnails: ${state.evidenceStudio.thumbnails}`,
      `Supporting assets: ${state.evidenceStudio.supportingAssets}`,
      `Flagged files: ${state.evidenceStudio.flaggedFiles}`,
      `Review gate: ${state.evidenceStudio.reviewGate}`,
      `Last scan: ${state.evidenceStudio.lastScanAt ? new Date(state.evidenceStudio.lastScanAt).toISOString() : 'not scanned'}`,
      '',
      '## Evidence Files',
      ...(state.evidenceStudio.files.length
        ? state.evidenceStudio.files.map((file) => `- ${file.role}: ${file.path} (${file.reason})`)
        : ['- No evidence files scanned yet.']),
    ].join('\n'),
    'evidence_inventory.md': [
      '# Evidence Inventory',
      '',
      `Source path: ${state.evidenceStudio.sourcePath || state.intake.sourcePath}`,
      `Last scan: ${state.evidenceStudio.lastScanAt ? new Date(state.evidenceStudio.lastScanAt).toISOString() : 'not scanned'}`,
      `Review gate: ${state.evidenceStudio.reviewGate}`,
      '',
      '## Counts',
      `- Originals: ${state.evidenceStudio.originals}`,
      `- Thumbnails: ${state.evidenceStudio.thumbnails}`,
      `- Supporting assets: ${state.evidenceStudio.supportingAssets}`,
      `- Flagged files: ${state.evidenceStudio.flaggedFiles}`,
      '',
      '## Files',
      ...(evidenceFiles.length ? evidenceFiles : ['- No evidence files scanned yet.']),
      '',
      '## Risks',
      state.evidenceStudio.scanError
        ? `- Scan error: ${state.evidenceStudio.scanError}`
        : '- No scan error recorded.',
    ].join('\n'),
    'DESIGN.md': [
      '# DESIGN.md',
      '',
      `Project: ${state.intake.business}`,
      'Style: Operational Atelier, professional design OS, evidence room, command center, and build studio.',
      '',
      '## Visual Direction',
      '- Use a precise studio surface with source visibility, review gates, artifact previews, and build handoff controls.',
      '- Keep the design calm, dense, professional, and English-only.',
      '',
      '## Typography',
      `- ${state.tokens.Typography ?? 'Display title, compact UI, mono numerals and paths'}`,
      '',
      '## Color Tokens',
      `- ${state.tokens.Color ?? 'Paper, graphite, amber proof, cyan action telemetry'}`,
      '',
      '## Component Patterns',
      '- Source rail, artifact canvas, inspector/review panel, packet history, quality scorecards, and exact-path evidence chips.',
      '',
      '## Layout Rules',
      '- Preserve source/sidebar room while letting the active studio use the available work area.',
      '- Desktop should show artifact review and packet status together; mobile should stack without horizontal overflow.',
      '',
      '## Motion Rules',
      `- ${state.tokens.Motion ?? 'Only status, review, and source-to-output transitions'}`,
      '',
      '## Anti-Patterns',
      '- No fake deploy URLs, unsupported claims, generic chatbot framing, purple gradients, or hidden source paths.',
      '',
      '## First Screen Recommendation',
      '- Show Website Studio intake, section plan, quality gates, comments/pins, Evidence Studio source state, and Project Packet readiness in one operator workbench.',
    ].join('\n'),
    'opportunity_packet.md': [
      '# Opportunity Packet',
      '',
      `Product thesis: ${state.intake.business} should produce a build-ready website packet for ${state.intake.audience}.`,
      `Offer: ${state.intake.offer}`,
      `Primary conversion: ${state.intake.conversion}`,
      '',
      '## Opportunity Ranking',
      '| Idea | Evidence links | Speed to launch | Revenue potential | Defensibility | Existing asset fit | Risk |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      `| Website Studio v1 | ${state.evidenceStudio.sourcePath || state.intake.sourcePath || 'Needs source path'} | High | Medium | Medium | High | ${blockedGates.length ? 'Blocked gates remain' : 'Review required'} |`,
      '| Evidence Studio v1 | evidence_inventory.md, DESIGN.md | Medium | Medium | High | High | Local scan coverage must be verified |',
      '| Codex Build Studio handoff | codex_build_brief.md | High | Medium | Medium | High | Build commands must pass before export |',
      '',
      '## Assumptions',
      '- Assumptions must stay marked until evidence files and review gates support them.',
      '',
      '## Review Gates',
      ...gateLines,
    ].join('\n'),
    'adapter_execution.md': [
      '# Adapter Execution',
      '',
      `Status: ${adapterStatus.status}`,
      `Detail: ${adapterStatus.detail}`,
      `Target: ${state.deployTarget || 'not provided'}`,
      `Command evidence: ${state.deployCommandEvidence || 'not provided'}`,
      '',
      '## Allowed States',
      '- prepare-only: packet generated, no live URL claimed.',
      '- verified-local: local URL verified by HTTP/browser probe.',
      '- verified-deployed: external URL verified with command output evidence.',
      '',
      '## Guardrail',
      '- Never mark deployed without a real URL and verification evidence.',
    ].join('\n'),
    'packet_review.md': [
      '# Packet Review',
      '',
      `Updated: ${new Date(state.updatedAt).toISOString()}`,
      `Adapter status: ${adapterStatus.status}`,
      '',
      '## Quality Summary',
      `- Pass: ${passGates.length}`,
      `- Needs review: ${reviewGates.length}`,
      `- Blocked: ${blockedGates.length}`,
      '',
      '## Comments and Pins',
      ...(pinLines.length ? pinLines : ['- No comments or pins recorded.']),
      '',
      '## Review Before Export',
      '- Open every generated packet file.',
      '- Resolve blocked gates.',
      '- Confirm evidence source paths.',
      '- Verify responsive behavior.',
      '- Confirm adapter status is honest.',
    ].join('\n'),
  };
}

export function buildWebsiteStudioProjectPrompt(
  basePrompt: string,
  state: WebsiteStudioWorkbenchState,
  artifacts: WebsiteStudioArtifacts,
) {
  return [
    basePrompt,
    '',
    'Project-backed Website Studio state:',
    JSON.stringify(state, null, 2),
    '',
    'Generate these exact Website Studio artifact files in the project:',
    ...Object.entries(artifacts).flatMap(([filename, body]) => [
      '',
      `## ${filename}`,
      '```markdown',
      body,
      '```',
    ]),
  ].join('\n');
}

function normalizeWebsiteStudioState(input: Partial<WebsiteStudioWorkbenchState>): WebsiteStudioWorkbenchState {
  const fallback = createDefaultWebsiteStudioState();
  return {
    ...fallback,
    ...input,
    intake: { ...fallback.intake, ...(input.intake ?? {}) },
    sitemap: Array.isArray(input.sitemap) && input.sitemap.length > 0 ? input.sitemap : fallback.sitemap,
    selectedSectionIds:
      Array.isArray(input.selectedSectionIds) && input.selectedSectionIds.length > 0
        ? input.selectedSectionIds
        : fallback.selectedSectionIds,
    tokens: { ...fallback.tokens, ...(input.tokens ?? {}) },
    deployVerification: input.deployVerification ?? fallback.deployVerification,
    qualityReviews:
      Array.isArray(input.qualityReviews) && input.qualityReviews.length > 0
        ? input.qualityReviews
        : fallback.qualityReviews,
    pins: Array.isArray(input.pins) ? input.pins : fallback.pins,
    evidenceStudio: {
      ...fallback.evidenceStudio,
      ...(input.evidenceStudio ?? {}),
      files: Array.isArray(input.evidenceStudio?.files) ? input.evidenceStudio.files : fallback.evidenceStudio.files,
    },
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : fallback.updatedAt,
  };
}
