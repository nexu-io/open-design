import type { AmrWebIntentResponse } from '@open-design/contracts';

export async function createVelaWebIntent(input: {
  apiUrl: string; controlKey: string; consoleOrigin: string; target: string;
}, request: typeof fetch = fetch): Promise<AmrWebIntentResponse> {
  if (!/^\/(dashboard|billing|settings|account|team|wallet|billing-records|usage-records|subscription|workspace|api-keys|usage)(\/[^?#]*)?(\?[^#]*)?$/.test(input.target) || input.target.includes('\\')) {
    throw new Error('invalid_target');
  }
  const response = await request(`${input.apiUrl.replace(/\/$/, '')}/api/v1/auth/intents`, {
    method: 'POST', headers: {authorization: `Bearer ${input.controlKey}`, 'content-type': 'application/json'},
    body: JSON.stringify({target: input.target}), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'amr_login_required' : 'amr_web_intent_unavailable');
  const result = await response.json() as {intentId?: string};
  if (!result.intentId) throw new Error('amr_web_intent_unavailable');
  const url = new URL('login', `${input.consoleOrigin.replace(/\/$/, '')}/`);
  url.searchParams.set('intentId',result.intentId);
  return {url: url.toString()};
}
