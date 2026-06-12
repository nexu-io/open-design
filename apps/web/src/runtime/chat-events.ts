import type { AgentTerminalAuthMetadata } from '@open-design/contracts';
import type { ChatMessage } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function acpTerminalAuthFromErrorDetails(
  details: unknown,
  agentId: string | null | undefined,
): AgentTerminalAuthMetadata | undefined {
  if (!agentId || !isRecord(details) || details.kind !== 'acp_terminal_auth') {
    return undefined;
  }
  const auth = isRecord(details.auth) ? details.auth : null;
  const methodId = typeof auth?.methodId === 'string' && auth.methodId.trim()
    ? auth.methodId.trim()
    : '';
  if (!methodId) return undefined;
  const label =
    typeof auth?.label === 'string' && auth.label.trim()
      ? auth.label.trim()
      : undefined;
  return {
    kind: 'terminal-auth',
    agentId,
    methodId,
    ...(label ? { label } : {}),
  };
}

export function appendErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
  auth?: AgentTerminalAuthMetadata,
): ChatMessage {
  if (!detail) return message;
  const events = message.events ?? [];
  const last = events[events.length - 1];
  if (last?.kind === 'status' && last.label === 'error' && last.detail === detail) {
    return message;
  }
  if (!detail?.trim()) {
    return message;
  }
  const event = {
    kind: 'status' as const,
    label: 'error',
    detail,
    ...(code ? { code } : {}),
    ...(auth ? { auth } : {}),
  };
  return {
    ...message,
    events: [...events, event],
  };
}
