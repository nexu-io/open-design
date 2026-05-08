import type { ChatRequest } from './api/chat';
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
  featuredToolNames: ['github.search_issues_and_pull_requests'],
  minimumApproval: 'auto',
};
