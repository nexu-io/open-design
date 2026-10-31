import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, type Route } from '@playwright/test';
import { configureVisualPage, VISUAL_AMR_AGENT, waitForVisualStable } from './visual.js';
import { T } from '../timeouts.js';

export const NEW_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const NEW_AUTHORIZATION_ID = '22222222-2222-4222-8222-222222222222';
export interface RegistrationReceipt { accountId: string; deviceAuthorizationId: string }
export interface RegistrationAccount { id: string; receipt?: RegistrationReceipt }
export async function registrationHost(page: Page, options: {
  account?: RegistrationAccount;
  role?: 'owner' | 'member';
  existingSetup?: boolean;
  initiallyAuthenticated?: boolean;
  contextFailure?: 'forbidden' | 'workspace' | 'member' | 'permission';
} = {}) {
  let account = options.account ?? { id: NEW_ACCOUNT_ID, receipt: { accountId: NEW_ACCOUNT_ID, deviceAuthorizationId: NEW_AUTHORIZATION_ID } };
  let loggedIn = options.initiallyAuthenticated ?? false;
  let loginCalls = 0;
  let statusReads = 0;
  let contextFailure = options.contextFailure;
  let displayVerificationReady = false;
  const verifiedContextRequests: Record<string, string>[] = [];
  let heldFresh: { gate: Promise<void>; began: () => void; finished: () => void } | null = null;
  const invitationRequests: unknown[] = [];
  const config = { privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false }, mode: 'daemon' as const, apiKey: '', baseUrl: '', model: 'deepseek-v4-flash', agentId: 'amr', skillId: null, designSystemId: null, onboardingCompleted: options.existingSetup ?? true, agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } }, agentModels: { amr: { model: 'deepseek-v4-flash' } } };
  await page.setViewportSize({ width: 1440, height: 900 });
  await configureVisualPage(page, { config, agents: [VISUAL_AMR_AGENT], velaLoggedIn: false });
  await page.addInitScript(() => { localStorage.setItem('od.entry.railOpen', 'true'); localStorage.setItem('open-design:locale', 'zh-CN'); localStorage.setItem('open-design:locale-source', 'manual'); });
  const workspace = () => ({ workspaceId: `${account.id}-workspace`, workspaceMemberId: `${account.id}-member`, workspaceName: 'Xiaoyi’s Workspace', workspaceType: 'personal', role: options.role ?? 'owner', memberStatus: 'active', lifecycleState: 'active', isDefault: true, billingState: 'active', planId: 'free', workspaceSettingsUrl: 'https://console.example.test/settings', permissions: { canInviteMembers: true, canManageMembers: true, canManageBilling: true, canManageAutoRecharge: false, canShareProjects: true, canWriteSyncedFiles: true, canViewWorkspaceSettings: true, canManageSharedResources: true } });
  await page.route('**/api/app-config', route => {
    if (route.request().method() === 'PUT') { Object.assign(config, route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { config } });
  });
  await page.route('**/api/integrations/vela/status**', async route => {
    statusReads += 1;
    if (loggedIn && new URL(route.request().url()).searchParams.get('refresh') === '1') displayVerificationReady = true;
    const body = loggedIn ? { loggedIn: true, loginInFlight: false, sessionState: 'authenticated', credentialRevision: `revision-${account.id}`, profile: 'test', user: { id: account.id, email: `${account.id}@example.com`, plan: 'free' }, ...(account.receipt ? { registrationInvite: account.receipt } : {}) } : { loggedIn: false, loginInFlight: false, sessionState: 'signed_out', credentialRevision: 'signed-out', profile: 'test', user: null };
    const held = new URL(route.request().url()).searchParams.get('refresh') === '1' ? heldFresh : null;
    if (held) { heldFresh = null; held.began(); await held.gate; }
    try { await route.fulfill({ json: body }); } finally { held?.finished(); }
  });
  await page.route('**/api/integrations/vela/login', route => {
    loginCalls += 1; loggedIn = true;
    return route.fulfill({ status: 202, json: { pid: 4242, startedAt: new Date().toISOString(), profile: 'test', authAttemptId: route.request().postDataJSON().authAttemptId } });
  });
  await page.route('**/api/integrations/vela/wallet**', route => route.fulfill({ json: { status: 'available', profile: 'test', user: { id: account.id, email: `${account.id}@example.com`, plan: 'free' }, balanceUsd: '0', stale: false, source: 'vela_api' } }));
  await page.route('**/api/workspace/directory', route => route.fulfill({ json: { items: loggedIn ? [workspace()] : [], activeWorkspaceId: loggedIn ? workspace().workspaceId : null } }));
  await page.route('**/api/workspace/context', route => {
    const headers = route.request().headers();
    const verification = displayVerificationReady && headers['x-od-workspace-can-share-projects'] !== undefined && Boolean(headers['x-od-workspace-id'] && headers['x-od-workspace-member-id']);
    if (verification) verifiedContextRequests.push(headers);
    if (verification && contextFailure === 'forbidden') return route.fulfill({ status: 403, json: { error: 'workspace_forbidden' } });
    const context = loggedIn ? workspace() : null;
    if (verification && context) {
      if (contextFailure === 'workspace') context.workspaceId = 'another-workspace';
      if (contextFailure === 'member') context.workspaceMemberId = 'another-member';
      if (contextFailure === 'permission') context.permissions.canInviteMembers = false;
    }
    return route.fulfill({ json: { context } });
  });
  await page.route('**/api/workspace/projects/team', route => route.fulfill({ json: { projects: [] } }));
  await page.route('**/api/workspaces/*/projects**', route => route.fulfill({ json: { projects: [] } }));
  await page.route('**/api/workspace/invite', route => { invitationRequests.push(route.request().postDataJSON()); return route.fulfill({ status: 503, json: { error: 'unexpected_invitation_request' } }); });
  return {
    form: page.getByRole('region', { name: '邀请成员', exact: true }),
    invitationRequests,
    verifiedContextRequests,
    restoreContext() { contextFailure = undefined; },
    get loginCalls() { return loginCalls; },
    get statusReads() { return statusReads; },
    async begin() {
      await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /欢迎使用 OpenDesign|Welcome to OpenDesign/ })).toBeVisible({ timeout: T.long });
      const primary = page.locator('.onboarding-cloud__primary');
      await expect(primary).toBeEnabled(); await primary.click();
      await expect.poll(() => loginCalls).toBe(1);
    },
    async invite(handler: (route: Route) => Promise<void>) {
      await page.route('**/api/workspace/invite', async route => { invitationRequests.push(route.request().postDataJSON()); await handler(route); });
    },
    holdNextFresh() {
      let release!: () => void; let began!: () => void; let finished!: () => void; let opened = false;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const started = new Promise<void>(resolve => { began = () => { opened = true; resolve(); }; });
      const settled = new Promise<void>(resolve => { finished = resolve; });
      heldFresh = { gate, began, finished };
      return { release, started, settled, get opened() { return opened; } };
    },
    async changeAccount(next: RegistrationAccount, reload = true) {
      account = next; loggedIn = true;
      if (reload) await page.reload({ waitUntil: 'domcontentloaded' });
      else await page.evaluate(() => window.dispatchEvent(new CustomEvent('od:amr-login-status-change', { detail: { reason: 'status-changed' } })));
    },
  };
}

export async function captureRegistration(page: Page, state: string, transient = false) {
  const output = process.env.OD_MEMBERS_VISUAL_ARTIFACT_DIR ?? path.resolve('.tmp/members-visual-qa');
  await mkdir(output, { recursive: true });
  if (!transient) await waitForVisualStable(page);
  else await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: 'nextjs-portal { display:none!important; }' });
  const metrics = await page.getByRole('region', { name: '邀请成员', exact: true }).evaluateAll(regions => regions.map(region => ({ rect: region.getBoundingClientRect().toJSON(), panels: Array.from(region.children).map(el => ({ tag: el.tagName, rect: el.getBoundingClientRect().toJSON() })), elements: Array.from(region.querySelectorAll('section,header,form,h1,h2,p,label,input,button,img,div[class*=labels],div[class*=rows],div[class*=center],div[class*=form],div[class*=panel]')).map(el => { const css = getComputedStyle(el); return { tag: el.tagName, text: el.textContent, className: el.className, rect: el.getBoundingClientRect().toJSON(), fontSize: css.fontSize, lineHeight: css.lineHeight, margin: css.margin, padding: css.padding, gap: css.gap, display: css.display, justify: css.justifyContent, color: css.color, background: css.backgroundColor }; }) })));
  const toastMetrics = await page.locator('.od-toast').evaluateAll(items => items.map(el => { const css = getComputedStyle(el); return { rect: el.getBoundingClientRect().toJSON(), background: css.backgroundColor, color: css.color, borderRadius: css.borderRadius, closeButtons: el.querySelectorAll('button').length, svg: el.querySelectorAll('svg').length }; }));
  await writeFile(path.join(output, `${state}-toast-metrics.json`), JSON.stringify(toastMetrics, null, 2));
  await writeFile(path.join(output, `${state}-metrics.json`), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: path.join(output, `${state}.png`), animations: 'disabled', caret: 'hide' });
}
