import type {
  ApprovalStatus,
  AutonomyLevel,
  BuilderOutputKind,
  BuilderRunStatus,
  HarnessProcessStatus,
  ProviderCredentialStatus,
  ProviderHealthStatus,
} from './builder.js';
import type { JsonValue } from '../common.js';

export type RefinedCraftCanvasTransport = 'daemon-snapshot' | 'daemon-realtime';

export interface RefinedCraftCanvasDocument {
  schemaVersion: 1;
  storeSnapshot: unknown | null;
  appState?: unknown | null;
  metadata?: {
    title?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
}

export type RefinedCraftGraphEntityKind =
  | 'agent'
  | 'approval'
  | 'brief'
  | 'computer'
  | 'screen'
  | 'page'
  | 'component'
  | 'file'
  | 'run'
  | 'design-run'
  | 'ai-session'
  | 'artifact'
  | 'asset'
  | 'website'
  | 'terminal'
  | 'deploy'
  | 'comment'
  | 'task'
  | 'provider'
  | 'process'
  | 'preview'
  | 'recommendation'
  | 'site'
  | 'skill'
  | 'playbook'
  | 'workspace';

export type RefinedCraftGraphLinkKind =
  | 'approved-by'
  | 'blocks'
  | 'references'
  | 'generated'
  | 'opened-by'
  | 'previewed-by'
  | 'deployed-by'
  | 'commented-on'
  | 'follows-up'
  | 'requires'
  | 'runs'
  | 'uses';

export interface RefinedCraftGraphEntity {
  id: string;
  kind: RefinedCraftGraphEntityKind;
  title: string;
  body?: string;
  shapeId?: string | null;
  path?: string | null;
  url?: string | null;
  status?: string | null;
  source?: 'canvas' | 'files' | 'run' | 'terminal' | 'deploy' | 'system' | 'skill' | 'process' | 'provider';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RefinedCraftGraphLink {
  id: string;
  kind: RefinedCraftGraphLinkKind;
  fromEntityId: string;
  toEntityId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface RefinedCraftProjectGraph {
  schemaVersion: 1;
  entities: RefinedCraftGraphEntity[];
  links: RefinedCraftGraphLink[];
  metadata?: {
    title?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    workspaceProvider?: 'local-daemon' | 'remote-sandbox';
  };
}

export type CanvasEntityKind = RefinedCraftGraphEntityKind;

export type CanvasEdgeKind =
  | RefinedCraftGraphLinkKind
  | 'contains'
  | 'depends-on'
  | 'emits'
  | 'loads'
  | 'needs-approval'
  | 'owns'
  | 'pins-output'
  | 'scheduled-by'
  | 'triggered-by';

export type CanvasEntityStatus =
  | BuilderRunStatus
  | HarnessProcessStatus
  | ApprovalStatus
  | ProviderCredentialStatus
  | ProviderHealthStatus
  | 'idle'
  | 'draft'
  | 'ready'
  | 'staged'
  | 'published'
  | 'unknown'
  | (string & {});

export type CanvasEntitySource =
  | 'canvas'
  | 'files'
  | 'run'
  | 'terminal'
  | 'deploy'
  | 'system'
  | 'skill-registry'
  | 'playbook-registry'
  | 'automation'
  | 'provider';

export interface CanvasEntityBinding {
  projectId?: string;
  shapeId?: string | null;
  skillId?: string;
  playbookId?: string;
  processId?: string;
  runId?: string;
  approvalId?: string;
  providerId?: string;
  credentialId?: string;
  filePath?: string;
  artifactId?: string;
  previewId?: string;
  url?: string;
}

export interface CanvasEntityPosition {
  x: number;
  y: number;
}

export interface CanvasEntitySize {
  width: number;
  height: number;
}

export interface CanvasEntity {
  id: string;
  kind: CanvasEntityKind;
  title: string;
  body?: string;
  status?: CanvasEntityStatus | null;
  source?: CanvasEntitySource;
  binding?: CanvasEntityBinding;
  position?: CanvasEntityPosition;
  size?: CanvasEntitySize;
  autonomy?: AutonomyLevel;
  outputKind?: BuilderOutputKind;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, JsonValue>;
}

export interface CanvasEdge {
  id: string;
  kind: CanvasEdgeKind;
  fromEntityId: string;
  toEntityId: string;
  label?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, JsonValue>;
}

export interface CanvasGraph {
  schemaVersion: 1;
  projectId: string;
  entities: CanvasEntity[];
  edges: CanvasEdge[];
  document?: RefinedCraftCanvasDocument;
  metadata?: {
    title?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    workspaceProvider?: 'local-daemon' | 'remote-sandbox' | 'daytona' | 'mock' | (string & {});
  };
}

export type RefinedCraftCanvasActionType =
  | 'open-file'
  | 'send-to-chat'
  | 'start-ai-run'
  | 'continue-ai-run'
  | 'edit-selected-with-ai'
  | 'generate-site-from-selection'
  | 'open-preview'
  | 'create-task'
  | 'attach-artifact'
  | 'create-terminal'
  | 'create-run-from-selection'
  | 'generate-asset'
  | 'edit-asset'
  | 'create-preview-embed'
  | 'refresh-preview-screenshot'
  | 'publish-site'
  | 'link-entities'
  | 'update-shape-binding';

export interface RefinedCraftCanvasContextItem {
  id: string;
  kind: RefinedCraftGraphEntityKind | 'shape';
  title: string;
  body?: string;
  shapeId?: string | null;
  entityId?: string | null;
  path?: string | null;
  url?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RefinedCraftCanvasDesignRunRequest {
  prompt: string;
  entityIds?: string[];
  shapeIds?: string[];
  contextItems?: RefinedCraftCanvasContextItem[];
  target?: {
    entityId?: string;
    shapeId?: string;
    title?: string;
    body?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface RefinedCraftCanvasDesignRunResponse {
  ok: true;
  projectId: string;
  designRunEntityId: string;
  prompt: string;
  graph: RefinedCraftProjectGraph;
}

export interface RefinedCraftCanvasDesignRunStatusResponse {
  ok: true;
  projectId: string;
  designRunEntity: RefinedCraftGraphEntity;
  graph: RefinedCraftProjectGraph;
}

export interface RefinedCraftCanvasDesignRunPatchRequest {
  runId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  status?: string | null;
  body?: string;
  outputEntityIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface RefinedCraftCanvasActionRequest {
  action: RefinedCraftCanvasActionType;
  entityIds?: string[];
  shapeIds?: string[];
  prompt?: string;
  target?: {
    entityId?: string;
    path?: string;
    url?: string;
    artifactId?: string;
    title?: string;
    body?: string;
    providerId?: string;
    shapeId?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface RefinedCraftCanvasActionResponse {
  ok: true;
  action: RefinedCraftCanvasActionType;
  graph: RefinedCraftProjectGraph;
  instruction?: {
    type:
      | 'open-file'
      | 'send-to-chat'
      | 'open-preview'
      | 'create-terminal'
      | 'start-run'
      | 'publish-site'
      | 'refresh-preview'
      | 'none';
    path?: string;
    url?: string;
    prompt?: string;
    terminalId?: string;
    entityId?: string;
    artifactId?: string;
    providerId?: string;
    fileName?: string;
  };
}

export interface RefinedCraftCanvasPresenceSummary {
  id: string;
  name: string;
  color?: string;
  lastSeenAt: string;
}

export interface RefinedCraftCanvasRoomStatus {
  id: string;
  projectId: string;
  persistence: 'daemon-project-document';
  transport: RefinedCraftCanvasTransport;
  websocketUrl: string | null;
  collaborators: RefinedCraftCanvasPresenceSummary[];
  updatedAt: string | null;
}

export interface GetProjectCanvasResponse {
  projectId: string;
  document: RefinedCraftCanvasDocument;
  graph: RefinedCraftProjectGraph;
  room: RefinedCraftCanvasRoomStatus;
}

export interface PutProjectCanvasRequest {
  document: RefinedCraftCanvasDocument;
}

export type PutProjectCanvasResponse = GetProjectCanvasResponse;

export interface GetProjectCanvasRoomResponse {
  room: RefinedCraftCanvasRoomStatus;
}

export interface GetProjectGraphResponse {
  projectId: string;
  graph: RefinedCraftProjectGraph;
}

export interface PatchProjectGraphRequest {
  graph: RefinedCraftProjectGraph;
}

export type PatchProjectGraphResponse = GetProjectGraphResponse;
