import type { JsonValue } from '../common.js';
import type { RunContextSelection } from './context.js';
import type { MemoryType } from './memory.js';

export type AutomationTriggerKind =
  | 'manual'
  | 'schedule'
  | 'connector'
  | 'project-event';

export type AutomationSourceKind =
  | 'upload'
  | 'url'
  | 'repo'
  | 'connector'
  | 'artifact'
  | 'chat';

export type AutomationOutputSink =
  | 'memory'
  | 'skill'
  | 'design-system'
  | 'automation-template'
  | 'artifact';

export type AutomationReviewPolicy =
  | 'always'
  | 'trusted-source'
  | 'auto-apply';

export type AutomationTokenCompressionMode =
  | 'off'
  | 'balanced'
  | 'aggressive';

export type AutomationTemplateStageKind =
  | 'ingest'
  | 'canonicalize'
  | 'redact'
  | 'compress'
  | 'classify'
  | 'propose'
  | 'agent-run'
  | 'apply'
  | 'notify';

export interface AutomationTemplateStage {
  id: string;
  kind: AutomationTemplateStageKind;
  title: string;
  description?: string;
  config?: JsonValue;
}

export interface AutomationTemplate {
  id: string;
  title: string;
  description: string;
  purpose: string;
  triggerKinds: AutomationTriggerKind[];
  sourceKinds: AutomationSourceKind[];
  stages: AutomationTemplateStage[];
  outputSinks: AutomationOutputSink[];
  reviewPolicy: AutomationReviewPolicy;
  tokenCompression: AutomationTokenCompressionMode;
  context?: RunContextSelection;
  tags?: string[];
}

export type AutomationRunStatus =
  | 'queued'
  | 'running'
  | 'needs-review'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface AutomationRunSummary {
  id: string;
  templateId: string;
  status: AutomationRunStatus;
  triggerKind: AutomationTriggerKind;
  startedAt: string;
  completedAt?: string;
  projectId?: string;
  sourcePacketIds: string[];
  proposalIds: string[];
  summary?: string;
  error?: string;
}

export type AutomationProvenanceSourceKind =
  | AutomationSourceKind
  | 'automation-run'
  | 'memory-node'
  | 'skill'
  | 'design-system';

export interface AutomationProvenanceRef {
  kind: AutomationProvenanceSourceKind;
  label: string;
  ref?: string;
  url?: string;
}

export type AutomationSensitivity =
  | 'public'
  | 'workspace'
  | 'private'
  | 'secret-adjacent';

export interface AutomationAttachmentRef {
  id: string;
  name: string;
  mimeType?: string;
  path?: string;
  sizeBytes?: number;
  tokenEstimate?: number;
}

export interface AutomationTokenStats {
  originalTokens: number;
  canonicalTokens?: number;
  compressedTokens?: number;
  compressionRatio?: number;
}

export interface AutomationSourceEvent {
  id: string;
  kind: AutomationSourceKind;
  sourceRef: string;
  title: string;
  capturedAt: string;
  projectId?: string;
  connectorId?: string;
  accountLabel?: string;
  artifactId?: string;
  conversationId?: string;
  metadata?: JsonValue;
}

export interface AutomationContentPacket {
  id: string;
  sourceEventId: string;
  sourceKind: AutomationSourceKind;
  sourceRef: string;
  title: string;
  capturedAt: string;
  bodyMarkdown: string;
  provenance: AutomationProvenanceRef[];
  attachments: AutomationAttachmentRef[];
  sensitivity: AutomationSensitivity;
  capabilityHints: string[];
  tokenStats: AutomationTokenStats;
  candidateSinks: AutomationOutputSink[];
  metadata?: JsonValue;
}

export type AutomationCompressionStatus =
  | 'not-run'
  | 'applied'
  | 'skipped'
  | 'failed';

export interface AutomationCompressionReport {
  mode: AutomationTokenCompressionMode;
  status: AutomationCompressionStatus;
  beforeTokens: number;
  afterTokens: number;
  summary: string;
  warnings?: string[];
  preservedSourcePacketId?: string;
}

export type MemoryTreeNodeKind = 'folder' | 'entry';

export type MemoryTreeNodeScope =
  | 'global'
  | 'project'
  | 'connector'
  | 'artifact'
  | 'design-system'
  | 'skill';

export interface MemoryTreeNode {
  id: string;
  parentId: string | null;
  path: string;
  name: string;
  description?: string;
  kind: MemoryTreeNodeKind;
  type?: MemoryType;
  scope: MemoryTreeNodeScope;
  sourcePacketIds: string[];
  proposalIds: string[];
  createdAt: string;
  updatedAt: string;
  childrenCount?: number;
}

export type AutomationProposalTargetKind =
  | 'memory-node'
  | 'skill'
  | 'design-system'
  | 'automation-template';

export type AutomationProposalAction =
  | 'create'
  | 'update'
  | 'merge'
  | 'move'
  | 'delete'
  | 'promote';

export type AutomationProposalStatus =
  | 'draft'
  | 'pending-review'
  | 'applied'
  | 'rejected'
  | 'superseded'
  | 'failed';

export type AutomationProposalPatchFormat =
  | 'markdown'
  | 'json'
  | 'file-tree';

export interface AutomationProposalPatch {
  format: AutomationProposalPatchFormat;
  before?: string;
  after?: string;
  diffSummary?: string;
}

export interface AutomationEvolutionProposal {
  id: string;
  title: string;
  summary: string;
  targetKind: AutomationProposalTargetKind;
  action: AutomationProposalAction;
  status: AutomationProposalStatus;
  reviewPolicy: AutomationReviewPolicy;
  createdAt: string;
  updatedAt: string;
  sourcePacketIds: string[];
  automationRunId?: string;
  targetRef?: string;
  patch: AutomationProposalPatch;
  confidence?: number;
  compressionReport?: AutomationCompressionReport;
  metadata?: JsonValue;
}

export interface CreateAutomationEvolutionProposalRequest {
  title: string;
  summary: string;
  targetKind: AutomationProposalTargetKind;
  action: AutomationProposalAction;
  reviewPolicy?: AutomationReviewPolicy;
  sourcePacketIds?: string[];
  automationRunId?: string;
  targetRef?: string;
  patch: AutomationProposalPatch;
  confidence?: number;
  compressionReport?: AutomationCompressionReport;
  metadata?: JsonValue;
}

export interface AutomationTemplateListResponse {
  templates: AutomationTemplate[];
}

export interface AutomationTemplateResponse {
  template: AutomationTemplate;
}

export interface AutomationRunListResponse {
  runs: AutomationRunSummary[];
}

export interface AutomationRunResponse {
  run: AutomationRunSummary;
}

export interface AutomationSourcePacketResponse {
  packet: AutomationContentPacket;
}

export interface AutomationSourcePacketListResponse {
  packets: AutomationContentPacket[];
}

export interface CreateAutomationSourceIngestionRequest {
  templateId?: string;
  triggerKind?: AutomationTriggerKind;
  sourceKind: AutomationSourceKind;
  sourceRef?: string;
  title?: string;
  bodyMarkdown?: string;
  projectId?: string;
  connectorId?: string;
  accountLabel?: string;
  artifactId?: string;
  conversationId?: string;
  sensitivity?: AutomationSensitivity;
  capabilityHints?: string[];
  candidateSinks?: AutomationOutputSink[];
  reviewPolicy?: AutomationReviewPolicy;
  tokenCompression?: AutomationTokenCompressionMode;
  memoryType?: MemoryType;
  metadata?: JsonValue;
}

export interface AutomationSourceIngestionResponse {
  packet: AutomationContentPacket;
  compressionReport: AutomationCompressionReport;
  proposals: AutomationEvolutionProposal[];
}

export interface AutomationEvolutionProposalResponse {
  proposal: AutomationEvolutionProposal;
}

export interface AutomationEvolutionProposalListResponse {
  proposals: AutomationEvolutionProposal[];
}

export interface AutomationEvolutionProposalApplyResponse {
  proposal: AutomationEvolutionProposal;
  result?: JsonValue;
}

export interface MemoryTreeResponse {
  nodes: MemoryTreeNode[];
}
