import { parseSendPreflightResponse, sendPreflightForbiddenCodes, type WorkspaceSendPreflightRequest } from '@open-design/contracts';

export interface SendAttempt extends WorkspaceSendPreflightRequest { accountGeneration: number; targetRevision: string | number }
export type ServerSendRejection = 'insufficient_funds' | 'concurrency_full' | 'unauthenticated' | typeof sendPreflightForbiddenCodes[number];
export type ClientPreflightResult = { action: 'continue' } | { action: 'cancelled' } | { action: 'reject'; rejection: ServerSendRejection };
/** No admission cache: every new intent reads once, then the real write owns admission. */
export async function checkAmrSendPreflight(attempt: SendAttempt, options: { signal?: AbortSignal; isCurrent: () => boolean }): Promise<ClientPreflightResult> {
  const current = () => !options.signal?.aborted && options.isCurrent();
  if (!current()) return { action: 'cancelled' };
  try {
    const timeout = AbortSignal.timeout(5_000);
    const response = await fetch('/api/workspace/billing/send-preflight', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: attempt.workspaceId, modelId: attempt.modelId, clientRequestId: attempt.clientRequestId }),
      signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
    });
    const body: unknown = await response.json();
    if (!current()) return { action: 'cancelled' };
    if (response.status === 401 && (body as { error?: unknown })?.error === 'unauthenticated') return { action: 'reject', rejection: 'unauthenticated' };
    if (response.status === 403 && sendPreflightForbiddenCodes.includes((body as { error?: unknown })?.error as typeof sendPreflightForbiddenCodes[number])) return { action: 'reject', rejection: (body as { error: typeof sendPreflightForbiddenCodes[number] }).error };
    if (response.status !== 200) return { action: 'continue' };
    const verdict = parseSendPreflightResponse(body);
    if (!verdict || verdict.clientRequestId !== attempt.clientRequestId || verdict.workspaceId !== attempt.workspaceId || verdict.modelId !== attempt.modelId) return { action: 'continue' };
    return verdict.decision === 'reject' ? { action: 'reject', rejection: verdict.reason } : { action: 'continue' };
  } catch {
    return current() ? { action: 'continue' } : { action: 'cancelled' };
  }
}
// In-memory one-shot handoff only. Reloads and new sends cannot reuse a verdict.
const homeStages = new Map<string, SendAttempt>();
export function handoffAmrSendPreflight(projectId: string, attempt: SendAttempt): void { homeStages.set(projectId, attempt); }
export function takeAmrSendPreflightHandoff(projectId: string): SendAttempt | undefined { const stage = homeStages.get(projectId); homeStages.delete(projectId); return stage; }

export function amrSendRejectionMessageKey(reason: ServerSendRejection): 'chat.runError.workspaceCreditsMessage' | 'chat.runError.membershipConcurrencyLimitMessage' | 'chat.amrBalanceGate.signedOutMessage' | 'chat.runError.title.accountSuspended' | 'chat.runError.title.readOnlyAccess' {
  switch (reason) {
    case 'insufficient_funds': return 'chat.runError.workspaceCreditsMessage';
    case 'concurrency_full': return 'chat.runError.membershipConcurrencyLimitMessage';
    case 'unauthenticated': return 'chat.amrBalanceGate.signedOutMessage';
    case 'user_banned': return 'chat.runError.title.accountSuspended';
    default: return 'chat.runError.title.readOnlyAccess';
  }
}
export function discardAmrSendPreflightHandoff(projectId: string): void { homeStages.delete(projectId); }
export function clearAmrSendPreflightHandoffs(): void { homeStages.clear(); }
