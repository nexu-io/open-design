import type { AmrWebIntentRequest, AmrWebIntentResponse } from '@open-design/contracts';
import { amrConsoleUrlForProfile } from '../runtime/amr-guidance';

/** Console links carry a daemon-verified account source, never an email hint. */
export function amrWebTarget(url: string): string | null {
  let target: URL;
  try { target = new URL(url); } catch { return null; }
  const consoles = ['prod', 'test', 'local', 'feature-test'].map(profile => new URL(amrConsoleUrlForProfile(profile)));
  const console = consoles.find(candidate => candidate.origin === target.origin && target.pathname.startsWith(candidate.pathname.replace(/\/dashboard$/, '/')));
  if (!console) return null;
  const prefix = console.pathname.replace(/\/dashboard$/, '');
  const path = target.pathname.slice(prefix.length);
  if (!/^\/(?:dashboard|billing|settings|account|team|wallet|billing-records|usage-records|subscription|workspace|api-keys|usage)(?:\/|$)/.test(path)) return null;
  return `${path}${target.search}`;
}

export async function prepareAmrWebUrl(url: string): Promise<string> {
  const target = amrWebTarget(url);
  if (!target) return url;
  const payload: AmrWebIntentRequest = { target };
  const response = await fetch('/api/amr/web-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (response.status === 401) {
    const login = new URL(url); const prefix = login.pathname.endsWith('/dashboard') ? login.pathname.slice(0, -'/dashboard'.length) : login.pathname.startsWith('/cloud/') ? '/cloud' : '';
    login.pathname = `${prefix}/login`; login.search = new URLSearchParams({ redirect: target }).toString();
    return login.toString();
  }
  if (!response.ok) throw new Error('Could not open the account page. Please try again.');
  const body = await response.json() as AmrWebIntentResponse;
  return body.url;
}
