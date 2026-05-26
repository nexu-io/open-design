import type { ChatRequest } from './api/chat';
import type {
  AutomationCompressionReport,
  AutomationContentPacket,
  AutomationEvolutionProposal,
  AutomationSourceIngestionResponse,
  AutomationTemplate,
  MemoryTreeNode,
} from './api/automations';
import type { ConnectorDetail } from './api/connectors';
import type { ProjectFile } from './api/files';
import type { LiveArtifact, LiveArtifactCreateInput, LiveArtifactUpdateInput } from './api/live-artifacts';
import type { HealthResponse } from './api/registry';
import type { ApiErrorResponse, ApiValidationErrorDetails } from './errors';
import type { ChatSseEvent } from './sse/chat';
import type { ProxySseEvent } from './sse/proxy';

export const exampleChatRequest: ChatRequest = {
  agentId: 'claude',
  message: '## user\nCreate a design',
  currentPrompt: 'Create a design',
  systemPrompt: 'Design carefully.',
  projectId: 'project_1',
  attachments: ['brief.pdf'],
  model: 'default',
  reasoning: null,
};

export const exampleProjectFile: ProjectFile = {
  name: 'index.html',
  path: 'index.html',
  type: 'file',
  size: 1024,
  mtime: 1_713_000_000,
  kind: 'html',
  mime: 'text/html',
};

export const exampleChatSseEvents: ChatSseEvent[] = [
  { event: 'start', data: { bin: 'claude', cwd: '/legacy/internal/path' } },
  { event: 'agent', data: { type: 'text_delta', delta: 'Hello' } },
  { event: 'stdout', data: { chunk: 'plain output' } },
  { event: 'end', data: { code: 0 } },
];

export const exampleProxySseEvents: ProxySseEvent[] = [
  { event: 'start', data: { model: 'gpt-4o-mini' } },
  { event: 'delta', data: { delta: 'Hello' } },
  { event: 'end', data: { code: 0 } },
];

export const exampleApiErrorResponse: ApiErrorResponse = {
  error: {
    code: 'BAD_REQUEST',
    message: 'Missing message',
    retryable: false,
  },
};

const exampleLiveArtifactValidationDetails: ApiValidationErrorDetails = {
  kind: 'validation',
  issues: [
    {
      path: 'document.templatePath',
      message: 'Live artifact templates must be stored at template.html.',
      code: 'INVALID_TEMPLATE_PATH',
    },
  ],
};

export const exampleLiveArtifactValidationErrorResponse: ApiErrorResponse = {
  error: {
    code: 'LIVE_ARTIFACT_INVALID',
    message: 'Live artifact validation failed',
    details: exampleLiveArtifactValidationDetails,
    retryable: false,
  },
};

export const exampleHealthResponse: HealthResponse = { ok: true, service: 'daemon' };

export const exampleAutomationTemplate: AutomationTemplate = {
  id: 'extract-design-system',
  title: 'Extract design system',
  description: 'Turn a trusted source into a reviewable DESIGN.md proposal.',
  purpose: 'Self-evolve project visual direction from source material and strong artifacts.',
  triggerKinds: ['manual', 'connector', 'project-event'],
  sourceKinds: ['upload', 'url', 'repo', 'connector', 'artifact'],
  stages: [
    { id: 'ingest', kind: 'ingest', title: 'Ingest source' },
    { id: 'canonicalize', kind: 'canonicalize', title: 'Canonicalize to Markdown' },
    { id: 'compress', kind: 'compress', title: 'Compact source context' },
    { id: 'propose', kind: 'propose', title: 'Draft DESIGN.md proposal' },
  ],
  outputSinks: ['design-system', 'memory'],
  reviewPolicy: 'always',
  tokenCompression: 'balanced',
  tags: ['self-evolution', 'design-system'],
};

export const exampleAutomationContentPacket: AutomationContentPacket = {
  id: 'packet_design_source_1',
  sourceEventId: 'source_event_1',
  sourceKind: 'repo',
  sourceRef: 'https://github.com/acme/design-system',
  title: 'Acme design system README',
  capturedAt: '2026-05-18T02:00:00.000Z',
  bodyMarkdown: '# Acme Design\n\nPrimary color: #335CFF\n\nUse dense enterprise dashboards.',
  provenance: [
    {
      kind: 'repo',
      label: 'acme/design-system README',
      ref: 'README.md',
      url: 'https://github.com/acme/design-system/blob/main/README.md',
    },
  ],
  attachments: [],
  sensitivity: 'workspace',
  capabilityHints: ['connector:github'],
  tokenStats: {
    originalTokens: 4200,
    canonicalTokens: 1800,
    compressedTokens: 720,
    compressionRatio: 0.4,
  },
  candidateSinks: ['memory', 'design-system'],
};

export const exampleAutomationCompressionReport: AutomationCompressionReport = {
  mode: 'balanced',
  status: 'applied',
  beforeTokens: 1800,
  afterTokens: 720,
  summary: 'Removed boilerplate and kept brand tokens, component rules, and source links.',
  preservedSourcePacketId: 'packet_design_source_1',
};

export const exampleMemoryTreeNode: MemoryTreeNode = {
  id: 'memory_node_acme_design',
  parentId: 'memory_node_design_systems',
  path: 'design-systems/acme/README.md',
  name: 'Acme design source notes',
  description: 'Source-backed brand and component rules extracted from Acme materials.',
  kind: 'entry',
  type: 'project',
  scope: 'design-system',
  sourcePacketIds: ['packet_design_source_1'],
  proposalIds: ['proposal_acme_design_system_1'],
  createdAt: '2026-05-18T02:01:00.000Z',
  updatedAt: '2026-05-18T02:01:00.000Z',
};

export const exampleAutomationEvolutionProposal: AutomationEvolutionProposal = {
  id: 'proposal_acme_design_system_1',
  title: 'Create Acme DESIGN.md',
  summary: 'Draft a design system from the Acme repo source packet.',
  targetKind: 'design-system',
  action: 'create',
  status: 'pending-review',
  reviewPolicy: 'always',
  createdAt: '2026-05-18T02:02:00.000Z',
  updatedAt: '2026-05-18T02:02:00.000Z',
  sourcePacketIds: ['packet_design_source_1'],
  automationRunId: 'automation_run_1',
  targetRef: 'design-systems/acme/DESIGN.md',
  patch: {
    format: 'markdown',
    after: '# Acme Design System\n\n> Category: Productivity & SaaS\n\n## 1. Visual Theme & Atmosphere\n\nDense enterprise dashboards with crisp blue actions.',
    diffSummary: 'Creates a new DESIGN.md proposal from the ingested source packet.',
  },
  confidence: 0.82,
  compressionReport: exampleAutomationCompressionReport,
};

export const exampleAutomationSourceIngestionResponse: AutomationSourceIngestionResponse = {
  packet: exampleAutomationContentPacket,
  compressionReport: exampleAutomationCompressionReport,
  proposals: [exampleAutomationEvolutionProposal],
};

export const exampleLiveArtifact: LiveArtifact = {
  schemaVersion: 1,
  id: 'live_artifact_1',
  projectId: 'project_1',
  createdByRunId: 'run_1',
  title: 'Launch Metrics',
  slug: 'launch-metrics',
  status: 'active',
  pinned: false,
  preview: { type: 'html', entry: 'index.html' },
  refreshStatus: 'idle',
  createdAt: '2026-04-29T12:00:00.000Z',
  updatedAt: '2026-04-29T12:00:00.000Z',
  document: {
    format: 'html_template_v1',
    templatePath: 'template.html',
    generatedPreviewPath: 'index.html',
    dataPath: 'data.json',
    dataJson: {
      title: 'Launch Metrics',
      metrics: [{ label: 'Signups', value: 1280, delta: '+12%' }],
    },
  },
};

export const exampleLiveArtifactCreateInput: LiveArtifactCreateInput = {
  title: 'Launch Metrics',
  slug: 'launch-metrics',
  pinned: false,
  status: 'active',
  preview: { type: 'html', entry: 'index.html' },
  document: {
    format: 'html_template_v1',
    templatePath: 'template.html',
    generatedPreviewPath: 'index.html',
    dataPath: 'data.json',
    dataJson: {
      title: 'Launch Metrics',
      metrics: [{ label: 'Signups', value: 1280, delta: '+12%' }],
    },
  },
};

export const exampleLiveArtifactUpdateInput: LiveArtifactUpdateInput = {
  title: 'Launch Metrics Dashboard',
  pinned: true,
  preview: { type: 'html', entry: 'index.html' },
};

export const exampleConnectorDetail: ConnectorDetail = {
  id: 'github',
  name: 'GitHub',
  provider: 'composio',
  category: 'developer',
  description: 'Search repositories, issues, pull requests, commits, and releases from a connected GitHub account via Composio.',
  status: 'available',
  toolCount: 1,
  tools: [
    {
      name: 'github.search_issues_and_pull_requests',
      title: 'Search issues and pull requests',
      description: 'Search issues and pull requests across repositories visible to the connected account.',
      inputSchemaJson: { type: 'object', additionalProperties: true },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      safety: {
        sideEffect: 'read',
        approval: 'auto',
        reason: 'Tool name, scope, or description indicates explicit read-only behavior.',
      },
      refreshEligible: true,
      curation: {
        useCases: ['personal_daily_digest'],
        reason: 'Curated for recent personal GitHub activity in a daily digest.',
      },
    },
  ],
  auth: { provider: 'composio', configured: false },
  allowedToolNames: ['github.search_issues_and_pull_requests'],
  curatedToolNames: ['github.search_issues_and_pull_requests'],
  featuredToolNames: ['github.search_issues_and_pull_requests'],
  minimumApproval: 'auto',
};
