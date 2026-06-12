import type { AgentTerminalAuthMetadata } from '@open-design/contracts';
import type { ChatMessage } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === 'string');
  return out.length > 0 ? out : undefined;
}

function stringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
  const command = typeof auth?.command === 'string' && auth.command.trim()
    ? auth.command.trim()
    : '';
  if (!methodId || !command) return undefined;
  const label =
    typeof auth?.label === 'string' && auth.label.trim()
      ? auth.label.trim()
      : undefined;
  return {
    kind: 'terminal-auth',
    agentId,
    methodId,
    command,
    ...(label ? { label } : {}),
    ...(stringArray(auth?.args) ? { args: stringArray(auth?.args) } : {}),
    ...(stringMap(auth?.env) ? { env: stringMap(auth?.env) } : {}),
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
