import type { JsonValue } from '../common.js';

export type BuilderIsoTimestamp = string;
export type BuilderEntityId = string;
export type BuilderProjectId = string;
export type BuilderRunId = string;

export type AutonomyLevel = 'observe' | 'draft' | 'stage' | 'publish' | 'autopublish';

export type BuilderAgentKind =
  | 'site-builder-agent'
  | 'growth-agent'
  | 'design-agent'
  | 'qa-agent'
  | 'analytics-agent'
  | 'computer-agent'
  | 'routing-agent'
  | (string & {});

export type SkillCategory =
  | 'Website Build'
  | 'SEO & AEO'
  | 'Content'
  | 'Design'
  | 'Publish'
  | 'Analytics'
  | 'Visitors & Outreach'
  | 'Computer Operations'
  | 'QA'
  | 'Integrations'
  | (string & {});

export type ToolFamily =
  | 'analytics'
  | 'astro'
  | 'brand'
  | 'computer'
  | 'copywrite'
  | 'dataforseo'
  | 'daytona'
  | 'deploy'
  | 'documents'
  | 'filesystem'
  | 'gsc'
  | 'integrations'
  | 'lookbook'
  | 'orgo'
  | 'preview'
  | 'research'
  | 'screenshot'
  | 'seo'
  | 'site'
  | 'siteComponents'
  | 'visitors'
  | 'web'
  | (string & {});

export type BuilderOutputKind =
  | 'account_plan'
  | 'approval'
  | 'audit_report'
  | 'canvas_card'
  | 'competitor_target_list'
  | 'contact_roster'
  | 'draft'
  | 'file_diff'
  | 'gmail_draft'
  | 'insight_card'
  | 'page'
  | 'preview_check'
  | 'recommendation_card'
  | 'seo_audit'
  | (string & {});

export type BuilderTriggerKind = 'manual' | 'scheduled' | 'watchdog' | 'event-triggered';

export type BuilderRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'sleeping'
  | 'failed'
  | 'completed'
  | 'cancelled';

export type HarnessProcessStatus =
  | 'registered'
  | 'enabled'
  | BuilderRunStatus
  | 'retry_scheduled'
  | 'condition_detected'
  | 'resolved'
  | 'disabled';

export interface BuilderSchedulePolicy {
  kind: 'cron' | 'interval' | 'routine';
  expression: string;
  timezone?: string;
  nextRunAt?: BuilderIsoTimestamp | null;
  metadata?: Record<string, JsonValue>;
}

export interface WatchdogPolicy {
  id: string;
  name: string;
  condition: string;
  checkIntervalSeconds?: number;
  cooldownSeconds?: number;
  requiredSignals?: string[];
  metadata?: Record<string, JsonValue>;
}

export interface SkillTriggers {
  manual?: boolean;
  schedules?: BuilderSchedulePolicy[];
  events?: string[];
  watchdogs?: WatchdogPolicy[];
}

export type ApprovalGateKind =
  | 'apply_file_changes'
  | 'contact_credit_spend'
  | 'credential_connection'
  | 'destructive_file_change'
  | 'dns_change'
  | 'gmail_draft_creation'
  | 'outreach_send'
  | 'paid_compute'
  | 'publish'
  | 'visual_direction'
  | (string & {});

export interface ApprovalPolicy {
  id: string;
  kind: ApprovalGateKind;
  label: string;
  required: boolean;
  description?: string;
  minimumAutonomy?: AutonomyLevel;
  metadata?: Record<string, JsonValue>;
}

export interface SkillSafetyPolicy {
  requiresApprovalFor: ApprovalGateKind[];
  allowAutopublish?: boolean;
  maxAutonomy?: AutonomyLevel;
  notes?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  version: string;
  category: SkillCategory;
  description?: string;
  sourcePath?: string;
  body: string;
  agents: BuilderAgentKind[];
  triggers: SkillTriggers;
  autonomy: AutonomyLevel;
  tools: ToolFamily[];
  outputs: BuilderOutputKind[];
  approvals: ApprovalPolicy[];
  safety: SkillSafetyPolicy;
  tags?: string[];
  importedFrom?: string;
  createdAt?: BuilderIsoTimestamp;
  updatedAt?: BuilderIsoTimestamp;
  metadata?: Record<string, JsonValue>;
}

export interface BuilderSkillSummary
  extends Omit<SkillDefinition, 'body' | 'safety' | 'approvals' | 'triggers'> {
  triggerKinds: BuilderTriggerKind[];
  approvalKinds: ApprovalGateKind[];
}

export interface PlaybookDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  skillIds: string[];
  workflowId: string;
  inputSchema: JsonValue | null;
  outputSchema: JsonValue | null;
  defaultAgent: BuilderAgentKind;
  defaultAutonomy: AutonomyLevel;
  triggers: BuilderTriggerKind[];
  tools?: ToolFamily[];
  outputs?: BuilderOutputKind[];
  approvalPolicies?: ApprovalPolicy[];
  createdAt?: BuilderIsoTimestamp;
  updatedAt?: BuilderIsoTimestamp;
  metadata?: Record<string, JsonValue>;
}

export interface HarnessProcessTrigger {
  kind: BuilderTriggerKind;
  source:
    | 'canvas'
    | 'chat'
    | 'cli'
    | 'routine'
    | 'schedule'
    | 'watchdog'
    | 'platform-event'
    | (string & {});
  eventName?: string;
  initiatedBy?: string | null;
  metadata?: Record<string, JsonValue>;
}

export interface HarnessProcess {
  id: string;
  projectId: BuilderProjectId;
  playbookId?: string;
  skillIds: string[];
  agentId: BuilderAgentKind | string;
  status: HarnessProcessStatus;
  trigger: HarnessProcessTrigger;
  autonomy: AutonomyLevel;
  schedule?: BuilderSchedulePolicy;
  watchdog?: WatchdogPolicy;
  startedAt?: BuilderIsoTimestamp;
  lastHeartbeatAt?: BuilderIsoTimestamp;
  nextRunAt?: BuilderIsoTimestamp | null;
  runId?: BuilderRunId;
  enabled?: boolean;
  failureCount?: number;
  metadata?: Record<string, JsonValue>;
}

export type BuilderRunOrigin =
  | 'manual'
  | 'scheduled'
  | 'watchdog'
  | 'event-triggered'
  | 'replay';

export interface BuilderRun {
  id: BuilderRunId;
  projectId: BuilderProjectId;
  processId?: string;
  playbookId?: string;
  skillIds: string[];
  agentId: BuilderAgentKind | string;
  status: BuilderRunStatus;
  origin: BuilderRunOrigin;
  autonomy: AutonomyLevel;
  prompt?: string;
  startedAt: BuilderIsoTimestamp;
  completedAt?: BuilderIsoTimestamp | null;
  lastEventId?: string | null;
  approvalIds?: string[];
  outputEntityIds?: BuilderEntityId[];
  error?: BuilderRunError | null;
  metadata?: Record<string, JsonValue>;
}

export interface BuilderRunError {
  code: string;
  message: string;
  recoverable?: boolean;
  metadata?: Record<string, JsonValue>;
}

export type BuilderRunEventType =
  | 'process.started'
  | 'skill.loaded'
  | 'workflow.started'
  | 'tool.started'
  | 'tool.completed'
  | 'file.changed'
  | 'preview.checked'
  | 'computer.started'
  | 'approval.requested'
  | 'approval.resolved'
  | 'canvas.output_pinned'
  | 'process.heartbeat'
  | 'process.completed'
  | 'process.failed';

export type BuilderRunEvent =
  | BuilderProcessStartedEvent
  | BuilderSkillLoadedEvent
  | BuilderWorkflowStartedEvent
  | BuilderToolStartedEvent
  | BuilderToolCompletedEvent
  | BuilderFileChangedEvent
  | BuilderPreviewCheckedEvent
  | BuilderComputerStartedEvent
  | BuilderApprovalRequestedEvent
  | BuilderApprovalResolvedEvent
  | BuilderCanvasOutputPinnedEvent
  | BuilderProcessHeartbeatEvent
  | BuilderProcessCompletedEvent
  | BuilderProcessFailedEvent;

export interface BuilderRunEventBase<Type extends BuilderRunEventType> {
  id: string;
  runId: BuilderRunId;
  projectId: BuilderProjectId;
  type: Type;
  sequence: number;
  timestamp: BuilderIsoTimestamp;
  source: 'builder' | 'harness' | 'agent' | 'tool' | 'system';
  metadata?: Record<string, JsonValue>;
}

export interface BuilderProcessStartedEvent extends BuilderRunEventBase<'process.started'> {
  processId?: string;
  playbookId?: string;
  skillIds: string[];
  autonomy: AutonomyLevel;
}

export interface BuilderSkillLoadedEvent extends BuilderRunEventBase<'skill.loaded'> {
  skillId: string;
  version: string;
  sourcePath?: string;
}

export interface BuilderWorkflowStartedEvent extends BuilderRunEventBase<'workflow.started'> {
  workflowId: string;
  playbookId?: string;
}

export interface BuilderToolStartedEvent extends BuilderRunEventBase<'tool.started'> {
  toolId: string;
  toolFamily?: ToolFamily;
  inputSummary?: string;
}

export interface BuilderToolCompletedEvent extends BuilderRunEventBase<'tool.completed'> {
  toolId: string;
  toolFamily?: ToolFamily;
  status: 'succeeded' | 'failed' | 'cancelled';
  outputSummary?: string;
  error?: BuilderRunError;
}

export interface BuilderFileChangedEvent extends BuilderRunEventBase<'file.changed'> {
  path: string;
  change: 'created' | 'updated' | 'deleted' | 'renamed';
  previousPath?: string;
  diffSummary?: string;
}

export interface BuilderPreviewCheckedEvent extends BuilderRunEventBase<'preview.checked'> {
  previewId?: string;
  url?: string;
  status: 'passed' | 'failed' | 'warning';
  summary?: string;
}

export interface BuilderComputerStartedEvent extends BuilderRunEventBase<'computer.started'> {
  computerId: string;
  providerId: string;
  sessionId?: string;
  controlMode: ComputerControlMode;
}

export interface BuilderApprovalRequestedEvent extends BuilderRunEventBase<'approval.requested'> {
  approvalId: string;
  approvalKind: ApprovalGateKind;
  title: string;
}

export interface BuilderApprovalResolvedEvent extends BuilderRunEventBase<'approval.resolved'> {
  approvalId: string;
  resolution: ApprovalResolution;
  resolvedBy?: string;
}

export interface BuilderCanvasOutputPinnedEvent extends BuilderRunEventBase<'canvas.output_pinned'> {
  entityId: BuilderEntityId;
  outputKind: BuilderOutputKind;
}

export interface BuilderProcessHeartbeatEvent extends BuilderRunEventBase<'process.heartbeat'> {
  processId?: string;
  status: HarnessProcessStatus;
  summary?: string;
}

export interface BuilderProcessCompletedEvent extends BuilderRunEventBase<'process.completed'> {
  processId?: string;
  summary?: string;
  outputEntityIds?: BuilderEntityId[];
}

export interface BuilderProcessFailedEvent extends BuilderRunEventBase<'process.failed'> {
  processId?: string;
  error: BuilderRunError;
}

export type ApprovalStatus = 'requested' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type ApprovalResolution = Exclude<ApprovalStatus, 'requested'>;

export interface Approval {
  id: string;
  projectId: BuilderProjectId;
  runId?: BuilderRunId;
  processId?: string;
  kind: ApprovalGateKind;
  title: string;
  description?: string;
  status: ApprovalStatus;
  requestedBy: 'agent' | 'system' | 'user';
  requestedAt: BuilderIsoTimestamp;
  resolvedAt?: BuilderIsoTimestamp | null;
  resolvedBy?: string | null;
  expiresAt?: BuilderIsoTimestamp | null;
  policy?: ApprovalPolicy;
  subject?: {
    entityId?: BuilderEntityId;
    path?: string;
    url?: string;
    providerId?: string;
  };
  metadata?: Record<string, JsonValue>;
}

export type ProviderKind =
  | 'model'
  | 'workspace'
  | 'computer'
  | 'deploy'
  | 'analytics'
  | 'search-console'
  | 'email'
  | 'crm'
  | (string & {});

export type ProviderCredentialStatus =
  | 'not_configured'
  | 'connected'
  | 'expired'
  | 'error'
  | 'disabled';

export interface ProviderCredential {
  id: string;
  providerId: string;
  providerKind: ProviderKind;
  displayName: string;
  status: ProviderCredentialStatus;
  scopes: string[];
  lastUsedAt?: BuilderIsoTimestamp | null;
  expiresAt?: BuilderIsoTimestamp | null;
  failure?: {
    code: string;
    message: string;
    occurredAt: BuilderIsoTimestamp;
  } | null;
  requiredApprovals?: ApprovalGateKind[];
  metadata?: Record<string, JsonValue>;
}

export type WorkspaceProviderKind = 'local-daemon' | 'daytona' | 'mock' | (string & {});
export type ComputerProviderKind = 'orgo' | 'mock' | (string & {});
export type ProviderHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'unavailable';

export interface WorkspaceProvider {
  id: string;
  kind: WorkspaceProviderKind;
  displayName: string;
  health: ProviderHealthStatus;
  credentialId?: string;
  capabilities: string[];
  metadata?: Record<string, JsonValue>;
}

export type ComputerControlMode =
  | 'view_only'
  | 'user_control'
  | 'agent_control'
  | 'shared_control'
  | 'locked';

export interface ComputerProvider {
  id: string;
  kind: ComputerProviderKind;
  displayName: string;
  health: ProviderHealthStatus;
  credentialId?: string;
  supportedControlModes: ComputerControlMode[];
  capabilities: string[];
  metadata?: Record<string, JsonValue>;
}
