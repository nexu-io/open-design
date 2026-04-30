import type { ChatMessage } from './chat';

export type ProjectKind = 'prototype' | 'deck' | 'template' | 'other';

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
