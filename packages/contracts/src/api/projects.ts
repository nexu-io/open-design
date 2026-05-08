import type { ChatMessage } from './chat.js';

export type ProjectKind =
  | 'prototype'
  | 'deck'
  | 'template'
  | 'other'
  | 'image'
  | 'video'
  | 'audio';

export type MediaAspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type AudioKind = 'music' | 'speech' | 'sfx';

export type ProjectDisplayStatus =
  | 'not_started'
  | 'queued'
  | 'running'
  | 'awaiting_input'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface ProjectStatusInfo {
  value: ProjectDisplayStatus;
  updatedAt?: number;
  runId?: string;
}

export interface PromptTemplateMetadataSource {
  repo: string;
  license: string;
  author?: string;
  url?: string;
}

// Subset of a curated PromptTemplate kept on the project so the agent can
// reference it on every turn without re-reading the gallery file. The
// `prompt` field is the (possibly user-edited) body — when the user tunes
// it in the New Project panel before clicking Create, those edits land
// here and become authoritative for the system prompt.
export interface PromptTemplateMetadata {
  id: string;
  surface: 'image' | 'video';
  title: string;
  prompt: string;
  summary?: string;
  category?: string;
  tags?: string[];
  model?: string;
  aspect?: MediaAspect;
  source?: PromptTemplateMetadataSource;
}

export interface ProjectMetadata {
  kind: ProjectKind;
  intent?: 'live-artifact';
  fidelity?: 'wireframe' | 'high-fidelity';
  speakerNotes?: boolean;
  animations?: boolean;
  templateId?: string;
  templateLabel?: string;
  inspirationDesignSystemIds?: string[];
  importedFrom?: 'claude-design' | 'folder' | string;
  entryFile?: string;
  sourceFileName?: string;
  // Folder-import (#597): when set, the project's files live under this
  // absolute path instead of .od/projects/<id>/. OD reads and writes
  // directly inside the user's folder. Stored as the realpath() result so
  // symlinks can't redirect writes after import time.
  baseDir?: string;
  imageModel?: string;
  imageAspect?: MediaAspect;
  imageStyle?: string;
  videoModel?: string;
  videoLength?: number;
  videoAspect?: MediaAspect;
  audioKind?: AudioKind;
  audioModel?: string;
  audioDuration?: number;
  voice?: string;
  // Curated prompt template the user picked in the image/video tab of the
  // New Project panel. Treated by the system-prompt composer as a stylistic
  // and structural reference for the generation request.
  promptTemplate?: PromptTemplateMetadata;
  // Absolute paths to local code folders the agent can read via --add-dir.
  linkedDirs?: string[];
}

export interface Project {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  createdAt: number;
  updatedAt: number;
  status?: ProjectStatusInfo;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  sourceProjectId?: string;
  files: Array<{ name: string; content: string }>;
  description?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  projectId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectRequest {
  name: string;
  skillId?: string | null;
  designSystemId?: string | null;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
}

export interface UpdateProjectRequest {
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  pendingPrompt?: string | null;
  metadata?: ProjectMetadata | null;
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
}

export interface CreateProjectResponse extends ProjectResponse {
  conversationId?: string;
}

// POST /api/import/folder — create a project rooted at an existing local
// folder. The submitted baseDir is stored as the project's metadata.baseDir
// (after realpath canonicalization) and OD reads/writes directly inside it.
// The user owns version control; OD does not snapshot or copy.
export interface ImportFolderRequest {
  baseDir: string;
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
}

export interface ImportFolderResponse {
  project: Project;
  conversationId: string;
  entryFile: string | null;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface ConversationResponse {
  conversation: Conversation;
}

export interface CreateConversationRequest {
  title?: string | null;
}

export interface UpdateConversationRequest {
  title?: string | null;
}

export interface MessagesResponse {
  messages: ChatMessage[];
}

export type DeployProviderId = 'vercel-self' | 'cloudflare-pages';
export type DeploymentStatus =
  | 'deploying'
  | 'preparing-link'
  | 'ready'
  | 'link-delayed'
  | 'protected'
  | 'failed';

export interface CloudflarePagesConfigHints {
  lastZoneId?: string;
  lastZoneName?: string;
  lastDomainPrefix?: string;
}

export interface CloudflarePagesZoneInfo {
  id: string;
  name: string;
  status?: string;
  type?: string;
}

export interface CloudflarePagesZonesResponse {
  zones: CloudflarePagesZoneInfo[];
  cloudflarePages?: CloudflarePagesConfigHints;
}

export interface CloudflarePagesDeploySelection {
  zoneId: string;
  zoneName: string;
  domainPrefix: string;
}

export type DeploymentLinkStatus =
  | 'ready'
  | 'link-delayed'
  | 'protected'
  | 'failed';

export interface DeploymentLinkInfo {
  url: string;
  status: DeploymentLinkStatus;
  statusMessage?: string;
  reachableAt?: number;
}

export type CloudflarePagesDnsStatus =
  | 'skipped'
  | 'created'
  | 'reused'
  | 'unmarked'
  | 'patched'
  | 'conflict'
  | 'failed';

export type CloudflarePagesDomainStatus =
  | 'skipped'
  | 'pending'
  | 'active'
  | 'conflict'
  | 'failed';

export type CloudflarePagesCustomDomainStatus =
  | 'pending'
  | 'ready'
  | 'conflict'
  | 'failed';

export type CloudflarePagesDnsOwnership = 'marked' | 'unmarked' | 'external';

export interface CloudflarePagesCustomDomainInfo {
  hostname: string;
  url: string;
  zoneId: string;
  zoneName: string;
  domainPrefix: string;
  status: CloudflarePagesCustomDomainStatus;
  statusMessage?: string;
  errorCode?: string;
  errorMessage?: string;
  dnsStatus?: CloudflarePagesDnsStatus;
  dnsRecordId?: string;
  dnsOwnership?: CloudflarePagesDnsOwnership;
  domainStatus?: CloudflarePagesDomainStatus;
  pagesDomainStatus?: string;
  validationData?: unknown;
  verificationData?: unknown;
}

export interface CloudflarePagesDeploymentInfo {
  projectName: string;
  pagesDev: DeploymentLinkInfo;
  customDomain?: CloudflarePagesCustomDomainInfo;
}

export interface DeployConfigResponse {
  providerId: DeployProviderId;
  configured: boolean;
  tokenMask: string;
  teamId: string;
  teamSlug: string;
  accountId?: string;
  projectName?: string;
  cloudflarePages?: CloudflarePagesConfigHints;
  target: 'preview';
}

export interface UpdateDeployConfigRequest {
  providerId?: DeployProviderId;
  token?: string;
  teamId?: string;
  teamSlug?: string;
  accountId?: string;
  projectName?: string;
  cloudflarePages?: CloudflarePagesConfigHints;
}

export interface DeploymentInfo {
  id: string;
  projectId: string;
  fileName: string;
  providerId: DeployProviderId;
  url: string;
  deploymentId?: string;
  deploymentCount: number;
  target: 'preview';
  status: DeploymentStatus;
  statusMessage?: string;
  reachableAt?: number;
  cloudflarePages?: CloudflarePagesDeploymentInfo;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectDeploymentsResponse {
  deployments: DeploymentInfo[];
}

export interface DeployProjectFileRequest {
  fileName: string;
  providerId?: DeployProviderId;
  cloudflarePages?: CloudflarePagesDeploySelection;
}

export interface DeployProjectFileResponse extends DeploymentInfo {}

export interface CheckDeploymentLinkResponse extends DeploymentInfo {}

// Preflight inspects the file set that would be uploaded for a deploy
// without sending anything to the provider. Lets the UI show file count,
// total size, and warnings before the user pays the network round-trip.

export type DeployPreflightWarningCode =
  | 'broken-reference'
  | 'invalid-reference'
  | 'large-asset'
  | 'large-bundle'
  | 'large-html'
  | 'external-script'
  | 'external-stylesheet'
  | 'no-doctype'
  | 'no-viewport';

export interface DeployPreflightWarning {
  code: DeployPreflightWarningCode;
  message: string;
  path?: string;
  url?: string;
  size?: number;
}

export interface DeployPreflightFile {
  path: string;
  size: number;
  mime: string;
  sourcePath: string;
}

export interface DeployPreflightRequest {
  fileName: string;
  providerId?: DeployProviderId;
}

export interface DeployPreflightResponse {
  providerId: DeployProviderId;
  entry: string;
  files: DeployPreflightFile[];
  totalFiles: number;
  totalBytes: number;
  warnings: DeployPreflightWarning[];
}
