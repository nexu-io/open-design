import type { ChatMessage } from './chat';

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
  fidelity?: 'wireframe' | 'high-fidelity';
  speakerNotes?: boolean;
  animations?: boolean;
  templateId?: string;
  templateLabel?: string;
  inspirationDesignSystemIds?: string[];
  importedFrom?: 'claude-design' | string;
  entryFile?: string;
  sourceFileName?: string;
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

export type DeployProviderId = 'vercel-self';
export type DeploymentStatus =
  | 'deploying'
  | 'preparing-link'
  | 'ready'
  | 'link-delayed'
  | 'protected'
  | 'failed';

export interface DeployConfigResponse {
  providerId: DeployProviderId;
  configured: boolean;
  tokenMask: string;
  teamId: string;
  teamSlug: string;
  target: 'preview';
}

export interface UpdateDeployConfigRequest {
  token?: string;
  teamId?: string;
  teamSlug?: string;
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
  createdAt: number;
  updatedAt: number;
}

export interface ProjectDeploymentsResponse {
  deployments: DeploymentInfo[];
}

export interface DeployProjectFileRequest {
  fileName: string;
  providerId?: DeployProviderId;
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
