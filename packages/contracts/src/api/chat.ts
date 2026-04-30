import type { ProjectFile } from './files';

export type ChatRole = 'user' | 'assistant';

export interface ChatRequest {
  agentId: string;
  message: string;
  systemPrompt?: string;
  projectId?: string | null;
  attachments?: string[];
  model?: string | null;
  reasoning?: string | null;
}

export interface ChatRunCreateResponse {
  runId: string;
}

export interface ChatRunStatusResponse {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  createdAt: number;
  updatedAt: number;
  exitCode?: number | null;
  signal?: string | null;
}

export interface ChatRunCancelResponse {
  ok: true;
}

export interface ChatAttachment {
  path: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
}

export type PersistedAgentEvent =
  | { kind: 'status'; label: string; detail?: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { kind: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number; durationMs?: number }
  | { kind: 'raw'; line: string };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  agentId?: string;
  agentName?: string;
  events?: PersistedAgentEvent[];
  startedAt?: number;
  endedAt?: number;
  attachments?: ChatAttachment[];
  producedFiles?: ProjectFile[];
}
