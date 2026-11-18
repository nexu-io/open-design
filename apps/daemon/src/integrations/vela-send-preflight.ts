import { parseSendPreflightResponse, sendPreflightForbiddenCodes, type WorkspaceSendPreflightRequest } from '@open-design/contracts';
import { readVelaControlApiContext } from './vela.js';

export async function fetchVelaSendPreflight(input: WorkspaceSendPreflightRequest, options: {
  configuredEnv?: Record<string, string>; signal?: AbortSignal;
  readSession?: typeof readVelaControlApiContext; fetch?: typeof fetch;
} = {}): Promise<{ status: number; body: unknown }> {
  try {
    const session = (options.readSession ?? readVelaControlApiContext)(process.env, options.configuredEnv);
    if (!session) return { status: 503, body: { error: 'send_preflight_unavailable' } };
    const timeout = AbortSignal.timeout(3_000);
    const response = await (options.fetch ?? fetch)(new URL(`/api/v1/workspaces/${encodeURIComponent(input.workspaceId)}/billing/send-preflight`, session.apiUrl), {
      method: 'POST', headers: { authorization: `Bearer ${session.controlKey}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ clientRequestId: input.clientRequestId, modelId: input.modelId }),
      signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
    });
    const body: unknown = await response.json();
    const error = (body as { error?: unknown })?.error;
    if (response.status === 401 && error === 'unauthenticated' || response.status === 403 && sendPreflightForbiddenCodes.includes(error as typeof sendPreflightForbiddenCodes[number])) return { status: response.status, body: { error } };
    const verdict = response.status === 200 ? parseSendPreflightResponse(body) : null;
    if (verdict && verdict.workspaceId === input.workspaceId && verdict.modelId === input.modelId && verdict.clientRequestId === input.clientRequestId) return { status: 200, body: verdict };
  } catch { /* Optional preview failures are not authentication decisions. */ }
  return { status: 503, body: { error: 'send_preflight_unavailable' } };
}
