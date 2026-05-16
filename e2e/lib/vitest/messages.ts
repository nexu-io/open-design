import { requestJson } from './http.ts';

export type E2eChatMessage = {
  agentId?: string | null;
  agentName?: string;
  content: string;
  createdAt?: number;
  endedAt?: number;
  events?: unknown[];
  id: string;
  producedFiles?: unknown[];
  role: 'assistant' | 'user';
  runId?: string;
  runStatus?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  startedAt?: number;
  telemetryFinalized?: boolean;
};

export async function saveMessage(
  baseUrl: string,
  projectId: string,
  conversationId: string,
  message: E2eChatMessage,
): Promise<E2eChatMessage> {
  return await requestJson<E2eChatMessage>(
    baseUrl,
    `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}`,
    { body: message, method: 'PUT' },
  );
}

export async function listMessages(
  baseUrl: string,
  projectId: string,
  conversationId: string,
): Promise<E2eChatMessage[]> {
  const response = await requestJson<{ messages: E2eChatMessage[] }>(
    baseUrl,
    `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  return response.messages;
}
