import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { clusterTest as test, expect } from '@/playwright/suite';
import { T } from '@/timeouts';
import { verifyFundingLease } from '@/playwright/workspace-funding-lease';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { readConcurrencyFixture, assertConcurrencyBinding, assertConcurrencyReceipt, type ConcurrencyBinding } from '@/playwright/workspace-concurrency-fixture';
import { warmPlaywrightWebRuntime, warmPlaywrightDaemonRuntime, PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS } from '@/playwright/runtime-lifecycle';

const out = process.env.YANG_UI_EVIDENCE_DIR!;
if (!out) throw new Error('Unique YANG_UI_EVIDENCE_DIR required');

test.use({ video: 'on', viewport: { width: 1280, height: 800 } });

test('[P0] F04 Owner actual Go10 Link full refuses Home and Project with retained input', async ({ page }, testInfo) => {
  test.setTimeout(PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS);
  // The historical raw-fixture fallback below is retained as source history,
  // but every executable path must prove the real canonical owner first.
  if (process.env.OD_CONCURRENCY_OWNER_RUNNER !== 'active') {
    throw new Error('Use the canonical concurrency runner; historical raw-fixture execution is not authorized');
  }
  const canonical = await readConcurrencyFixture();
  await verifyFundingLease(canonical, T.xlong * 7);
  const releaseOne = process.env.F04_RELEASE_ONE === '1';
  if (releaseOne && (!canonical || process.env.F04_SURFACE !== 'home')) throw new Error('Single-release witness requires the canonical Home runner');
  const fixturePath = canonical ? process.env.OD_FUNDING_FIXTURE : process.env.YANG_UI_FIXTURE_PATH;
  if (!fixturePath) throw new Error('Explicit current server-owned private fixture required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Private fixture0600 required');
  const fixture = canonical ? {
    runtime: canonical.runtime, owner: canonical.owner, tuple: { AMR: canonical.upstream.amrSha },
    cfg: { urls: { api: canonical.upstream.apiUrl, link: canonical.upstream.linkUrl, web: canonical.upstream.webUrl } },
    actors: { od: canonical.actor },
    spaces: { concurrency: { ...canonical.concurrency!.space, roles: { member: canonical.concurrency!.member } } },
  } : JSON.parse(await readFile(fixturePath, 'utf8'));
  const realCli = fixture.runtime.velaBin;
  const modelId = fixture.runtime.modelId;
  for (const binary of ['vela', 'openCode'] as const) {
    expect(createHash('sha256').update(await readFile(fixture.runtime[`${binary}Bin`])).digest('hex')).toBe(fixture.runtime[`${binary}Sha256`]);
  }
  const actorKey = process.env.YANG_UI_ACTOR ?? 'od';
  const actor = fixture.actors[actorKey];
  if (!actor) throw new Error(`Missing requested fixture actor: ${actorKey}`);
  const spaceAlias = process.env.YANG_UI_SPACE ?? 'concurrency';
  const space = fixture.spaces[spaceAlias];
  if (!space) throw new Error(`Missing requested fixture workspace: ${spaceAlias}`);
  const role = actor.role ?? (actorKey === 'od' ? 'owner' : actorKey.includes('admin') ? 'admin' : 'member');
  const memberId = role === 'owner' ? space.ownerMemberId : (space.roles?.[role]?.memberId ?? actor.workspaceMemberId);
  const runtimeKey = role === 'owner' ? space.runtimeKey : (space.roles?.[role]?.runtimeKey ?? actor.runtimeKey);
  if (!memberId || !runtimeKey) throw new Error('Requested actor requires an exact workspace member and scoped runtime key');
  const urls = fixture.cfg.urls;
  const namespace = canonical ? `codex-link-${process.env.OD_CONCURRENCY_ATTEMPT_ID}`
    : `codex-yang-c20-f04-${role}-${process.pid}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const dataDir = join(root, 'scratch', 'data');
  const amrHome = join(out, 'private', namespace, 'amr-home');
  await mkdir(out, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  const configFile = join(amrHome, 'config.json');
  await writeFile(configFile, JSON.stringify({ profiles: { local: { controlKey: actor.controlKey, runtimeKey, apiUrl: urls.api, linkUrl: urls.link, user: { id: actor.userId, email: actor.email, name: actor.name ?? 'Yang continuation QA' } } } }));
  await chmod(configFile, 0o600);
  const config = { privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false }, mode: 'daemon', agentId: 'amr', model: modelId, onboardingCompleted: true, agentModels: { amr: { model: modelId } }, agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: realCli } } };
  await writeFile(join(dataDir, 'app-config.json'), JSON.stringify(config));
  const runtime = createToolsDevSuite({ root, dataDir, namespace, codexHomeDir: join(root, 'scratch', 'codex-home'), toolsDevRoot: join(root, 'scratch', 'tools-dev'), ownerPid: process.pid });
  const env = { AMR_HOME: amrHome, VELA_BIN: realCli, VELA_PROFILE: 'local', OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: urls.api, VELA_LINK_URL: urls.link, VELA_CONTROL_KEY: actor.controlKey, OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: urls.web, VELA_OPENCODE_BIN: fixture.runtime.openCodeBin, OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off' };
  const headers: Record<string, string> = { 'x-od-workspace-id': space.workspaceId, 'x-od-workspace-member-id': memberId, 'x-od-workspace-role': role, 'x-od-workspace-lifecycle-state': 'active', 'x-od-workspace-member-status': 'active' };
  const requests: { method: string; path: string; atUnixMs: number }[] = [];
  const responses: { method: string; path: string; status: number }[] = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) requests.push({ method: request.method(), path: url.pathname, atUnixMs: Date.now() }); });
  page.on('response', (response) => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() }); });
  await page.route('**/*', (route) => { const url = new URL(route.request().url()); return ['localhost', '127.0.0.1'].includes(url.hostname) || !url.protocol.startsWith('http') ? route.continue() : route.abort(); });
  const observations: unknown[] = [];
  const surfaceFailures: {surface: string; error: string}[] = [];
  const artifact = '<!doctype html><html><meta charset="utf-8"><title>Yang C02 preserved artifact</title><body><h1>Keep this existing artifact</h1><p>Manually seeded through the production project files API.</p></body></html>';
  const projectId = `yang-c20-f04-${role}-${process.pid}`;
  const artifactName = 'yang-c02-existing.html';
  try {
    await writeFile(join(out, 'owned-runtime-identity.safe.json'), JSON.stringify({namespace, root, toolsDevRoot: runtime.toolsDevRoot, dataDir}));
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.webUrl!);
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    await writeFile(join(out, `${role}-runtime-process.json`), JSON.stringify({ namespace, testPid: process.pid, daemonPort: runtime.daemonPort, webPort: runtime.webPort, toolsDevRoot: runtime.toolsDevRoot }, null, 2));
    const login = await (await fetch(new URL('/api/integrations/vela/status', runtime.webUrl!))).json();
    expect(login.loggedIn).toBe(true); expect(login.user?.id).toBe(actor.userId);
    const context = await (await fetch(new URL('/api/workspace/context', runtime.webUrl!), { headers })).json();
    expect(context.context.workspaceId).toBe(space.workspaceId); expect(context.context.workspaceMemberId).toBe(memberId); expect(context.context.role).toBe(role);
    headers['x-od-workspace-type'] = context.context.workspaceType;
    const billing = await (await fetch(new URL(`/api/workspace/billing?scope=workspace&workspaceId=${encodeURIComponent(space.workspaceId)}&includePreflight=1&modelId=${encodeURIComponent(modelId)}`, runtime.webUrl!), { headers })).json();
    expect(Number(billing.preflight.balanceUsd)).toBeGreaterThan(0);
    if (canonical) {
      expect(billing.workspaceSnapshot.workspaceId).toBe(space.workspaceId);
      expect(billing.workspaceSnapshot.workspaceMemberId).toBe(memberId);
      expect(billing.workspaceSnapshot.billing.planId).toBe('go');
    }
    await writeFile(join(out, 'actual-context-and-funded-preflight.json'), JSON.stringify({ context, billing }, null, 2));
    const create = await fetch(new URL('/api/projects', runtime.webUrl!), { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ id: projectId, name: `Yang continuation ${role}`, skillId: null, designSystemId: null, pendingPrompt: null, metadata: { kind: 'prototype' } }) });
    expect(create.ok, await create.text()).toBe(true);
    const file = await fetch(new URL(`/api/projects/${projectId}/files`, runtime.webUrl!), { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name: artifactName, content: artifact, encoding: 'utf8' }) });
    expect(file.ok, await file.text()).toBe(true);
    await page.addInitScript(({ config, space, memberId }) => { localStorage.setItem('open-design:config', JSON.stringify(config)); localStorage.setItem('open-design:locale', 'en'); localStorage.setItem('open-design:locale-source', 'manual'); sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId: space.workspaceId, workspaceMemberId: memberId })); }, { config, space: { workspaceId: space.workspaceId }, memberId });

    const requestedSurface = process.env.F04_SURFACE;
    if (requestedSurface && !['home', 'project'].includes(requestedSurface)) throw new Error('F04_SURFACE must be home or project');
    for (const surface of (['home', 'project'] as const).filter(surface => !requestedSurface || surface === requestedSurface)) {
      const attemptDir = join(out, `${role}-${surface}-01`);
      await mkdir(attemptDir, { recursive: false });
      const binding: ConcurrencyBinding | null = canonical ? {
        protocol: 'od-link-concurrency-v1', runId: canonical.isolation.runId,
        attemptId: process.env.OD_CONCURRENCY_ATTEMPT_ID!,
        tag: `od-concurrency-${process.env.OD_CONCURRENCY_ATTEMPT_ID!}-${surface}`,
        workspaceId: space.workspaceId, surface,
        fixtureSha256: createHash('sha256').update(await readFile(fixturePath)).digest('hex'),
      } : null;
      if (binding && !/^[a-f0-9-]{36}$/.test(binding.attemptId)) throw new Error('Fresh runner attempt ID required');
      const readMarker = async (name: string) => {
        const value = JSON.parse(await readFile(join(attemptDir, name), 'utf8'));
        if (binding) {
          assertConcurrencyBinding(value, binding);
          const phase = name === 'C-held.json' ? 'held' : name === 'C-one-released.json' ? 'one-released' : 'released';
          const expectedReceipt = `server-${phase}-receipt.safe.json`;
          if (value.receiptPath !== expectedReceipt || !/^[a-f0-9]{64}$/.test(value.receiptSha256 ?? '')) {
            throw new Error('Exact local coordinator receipt and digest required');
          }
          const bytes = await readFile(join(attemptDir, value.receiptPath));
          assertConcurrencyReceipt(value, binding, bytes, phase);
        }
        return value;
      };
      const writeMarker = (name: string, value: Record<string, unknown>) => writeFile(
        join(attemptDir, name), JSON.stringify({ ...value, ...binding }), { mode: 0o600 });
      const startIndex = requests.length;
      try {
        await page.goto(surface === 'home' ? runtime.webUrl! : new URL(`/projects/${projectId}`, runtime.webUrl!).toString(), { waitUntil: 'domcontentloaded', timeout: T.xlong });
        const input = page.getByTestId(surface === 'home' ? 'home-hero-input' : 'chat-composer-input');
        const send = page.getByTestId(surface === 'home' ? 'home-hero-submit' : 'chat-send');
        const staged = page.getByTestId(surface === 'home' ? 'home-hero-staged-files' : 'staged-attachments');
        await expect(input).toBeVisible({ timeout: T.xlong });
        const prompt = `Retain ${role} ${surface} input until I manually submit again`;
        const attachment = `l-${role}-${surface}.txt`;
        await input.fill(prompt);
        const upload = surface === 'project' ? page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/projects/${projectId}/upload`)) : null;
        await page.getByTestId(surface === 'home' ? 'home-hero-file-input' : 'chat-file-input').setInputFiles({ name: attachment, mimeType: 'text/plain', buffer: Buffer.from('Real file must survive actual shared Link refusal.') });
        if (upload) expect((await upload).ok()).toBe(true);
        await expect(staged).toContainText(attachment);
        await expect(send).toBeEnabled({ timeout: T.medium });
        const readyContext = await (await fetch(new URL('/api/workspace/context', runtime.webUrl!), { headers })).json();
        const readyBilling = await (await fetch(new URL(`/api/workspace/billing?scope=workspace&workspaceId=${encodeURIComponent(space.workspaceId)}&includePreflight=1&modelId=${encodeURIComponent(modelId)}`, runtime.webUrl!), { headers })).json();
        expect(readyContext.context.workspaceId).toBe(space.workspaceId);
        expect(readyContext.context.role).toBe(role);
        expect(Number(readyBilling.preflight.balanceUsd)).toBeGreaterThan(0);
        if (canonical) expect(readyBilling.workspaceSnapshot.billing.planId).toBe('go');
        await writeFile(join(attemptDir, 'before-hold-context-billing.json'), JSON.stringify({readyContext,readyBilling},null,2));
        await writeMarker('C-ready.json', { at: new Date().toISOString(), workspaceId: space.workspaceId, role, surface, note: 'Warm actual UI; server may hold10 actual Link requests now, no application gate.' });
        await expect.poll(async () => { try { return (await readMarker('C-held.json')).ready; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }, { timeout: T.long, intervals: [250, 500] }).toBe(true);
        const held = await readMarker('C-held.json');
        if (binding) expect(held.count).toBe(10);
        const post = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/runs', { timeout: T.medium }).catch(() => null);
        const clickedAt = new Date().toISOString();
        await send.click();
        const response = await post;
        const created = response ? await response.json().catch(() => null) : null;
        let terminal: Record<string, unknown> | null = null;
        if (response?.status() === 202 && typeof created?.runId === 'string') {
          await expect.poll(async () => {
            const result = await fetch(runtime.url.daemon(`/api/runs/${created.runId}`), { headers, signal: AbortSignal.timeout(T.short) });
            const data = await result.json().catch(() => null);
            if (!result.ok) return false;
            terminal = data;
            return ['done', 'finished', 'completed', 'error', 'failed', 'canceled', 'stopped'].includes(String(data?.status));
          }, { timeout: T.medium, intervals: [250, 500] }).toBe(true).catch(() => {});
        }
        const dialog = page.getByTestId('amr-concurrency-dialog');
        await expect(dialog).toBeVisible({timeout:T.long}).catch(()=>{});
        const currentInput = new URL(page.url()).pathname.startsWith('/projects/') ? page.getByTestId('chat-composer-input') : page.getByTestId('home-hero-input');
        const currentStaged = new URL(page.url()).pathname.startsWith('/projects/') ? page.getByTestId('staged-attachments') : page.getByTestId('home-hero-staged-files');
        const dialogVisible = await dialog.isVisible();
        const dialogText = dialogVisible ? await dialog.innerText({timeout:T.short}) : null;
        const geometry = dialogVisible ? await dialog.evaluate(el => { const r=el.getBoundingClientRect();return {width:r.width,height:r.height,imageCount:el.querySelectorAll('img').length}; }) : null;
        const upgradeVisible = await page.getByTestId('amr-concurrency-upgrade').isVisible();
        const actual = { qa: ['RUN-014-CLIENT', role === 'owner' ? 'UISTATE-F04-CLIENT' : 'UISTATE-F06-CLIENT'], role, surface, workspaceId: space.workspaceId, clickedAt, observedAt: new Date().toISOString(), held, fundedPreflight: billing.preflight, status: response?.status() ?? null, created, terminal, expected: { dialogConcurrency: true, input: prompt, attachment }, actual: { dialogVisible, dialogText, geometry, upgradeVisible, input: await currentInput.textContent({timeout:T.short}).catch(() => null), staged: await currentStaged.allTextContents(), bodyText: await page.locator('body').innerText(), runPosts: requests.slice(startIndex).filter(x => x.method === 'POST' && x.path === '/api/runs').length }, productResponseMocks: false, wholeQaPasses: 0 };
        await writeFile(join(attemptDir, 'actual-observation.json'), JSON.stringify(actual, null, 2));
        await page.screenshot({ path: join(attemptDir, 'actual-final.png') });
        const saved = await fetch(new URL(`/api/projects/${projectId}/files/${artifactName}`, runtime.webUrl!), { headers });
        expect.soft(saved.ok && await saved.text() === artifact, `${surface}: existing HTML preserved`).toBe(true);
        expect.soft(dialogVisible && /concurren|too many requests|并发/i.test(dialogText ?? ''), `${surface}: actual Link-full concurrency dialog must be visible, do not fabricate it if lease bridge blocks first`).toBe(true);
        expect.soft(actual.actual.runPosts, `${surface}: Link-full refusal must not create a run`).toBe(0);
        expect.soft(actual.actual.input, `${surface}: rejected input retained`).toBe(prompt);
        expect.soft(actual.actual.staged.join(' '), `${surface}: rejected real attachment retained`).toContain(attachment);
        if (dialogVisible) {
          expect.soft(upgradeVisible,'Go Owner concurrency notice offers an existing higher-tier upgrade').toBe(true);
          await page.getByTestId('amr-concurrency-close').click({timeout:T.medium});
          await expect.soft(currentInput).toHaveText(prompt,{timeout:T.short});
          await expect.soft(currentInput).toBeEditable({timeout:T.short});
        }
        const releasedMarker = releaseOne ? 'C-one-released.json' : 'C-released.json';
        await writeMarker(releaseOne ? 'C-release-one-ready.json' : 'C-release-ready.json', { at: new Date().toISOString(), reason: 'QA step2 release then manual recovery' });
        // This marker includes the owner's HTTP-thread join, Redis readback and
        // lease postcheck; it is not the product dialog/slot-release timer.
        await expect.poll(async () => { try { return (await readMarker(releasedMarker)).released; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }, { timeout: T.long, intervals: [250, 500] }).toBe(true);
        if (binding) expect((await readMarker(releasedMarker)).remaining).toBe(releaseOne ? 9 : 0);
        const releaseCompleteAt = new Date().toISOString();
        const autoPost = await page.waitForEvent('request', { predicate: r => r.method() === 'POST' && new URL(r.url()).pathname === '/api/runs', timeout: 2000 }).catch(() => null);
        const recovery: Record<string, unknown> = {releaseCompleteAt, releaseOne, remainingBeforeManual:releaseOne ? 9 : 0, negativeObservationMs:2000, automaticallyPosted:!!autoPost, manualAttempted:false};
        await writeFile(join(attemptDir, 'step2-recovery.json'),JSON.stringify(recovery,null,2));
        expect.soft(autoPost, 'Freeing Link capacity must not automatically submit the rejected draft').toBeNull();
        if (releaseOne) {
          await expect(currentInput).toHaveText(prompt, { timeout: T.short });
          await expect(currentStaged).toContainText(attachment, { timeout: T.short });
        }
        if(dialogVisible && await currentInput.textContent({timeout:T.short}) === prompt) {
          const currentSend = new URL(page.url()).pathname.startsWith('/projects/') ? page.getByTestId('chat-send') : page.getByTestId('home-hero-submit');
          await expect(currentSend).toBeEnabled({timeout:T.short});
          const manualPost=page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname==='/api/runs',{timeout:T.medium});
          await currentSend.click({timeout:T.short});
          const manualResponse=await manualPost;
          const manualCreated=await manualResponse.json();
          Object.assign(recovery,{manualAttempted:true,manualStatus:manualResponse.status(),manualCreated,manualAt:new Date().toISOString()});
          await writeFile(join(attemptDir, 'step2-recovery.json'),JSON.stringify(recovery,null,2));
          expect(manualResponse.status()).toBe(202);
          await expect.poll(async()=>{const r=await fetch(runtime.url.daemon(`/api/runs/${manualCreated.runId}`),{headers,signal:AbortSignal.timeout(T.short)});const terminal=await r.json();recovery.manualTerminal=terminal;return terminal.status;},{timeout:T.long,intervals:[250,500]}).toMatch(/succeeded|failed|canceled/);
          await writeFile(join(attemptDir, 'step2-recovery.json'),JSON.stringify(recovery,null,2));
          expect(String((recovery.manualTerminal as Record<string,unknown>).status),'Manual retry must finish successfully after actual Link capacity release').toMatch(/^(succeeded)$/);
        }else{ recovery.blocked='Step1 did not expose a concurrency dialog with retained draft; manual recovery precondition unproven';await writeFile(join(attemptDir,'step2-recovery.json'),JSON.stringify(recovery,null,2)); }
        observations.push(actual);
      } catch (error) {
        surfaceFailures.push({ surface, error: String(error) });
        await writeFile(join(attemptDir, 'attempt-error.json'), JSON.stringify({ error: String(error), at: new Date().toISOString() }));
        expect.soft(false, `${surface}: ${String(error)}`).toBe(true);
      } finally {
        await writeMarker('C-release-ready.json', { at: new Date().toISOString() });
        await expect.poll(async () => { try { return (await readMarker('C-released.json')).released; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }, { timeout: T.medium, intervals: [250, 500] }).toBe(true).catch(() => {});
      }
    }
    await writeFile(join(out, 'surface-results.json'), JSON.stringify({ observations, surfaceFailures, od: process.env.F04_OD_SHA, amr: fixture.tuple.AMR, modelVendor: 'controlled HTTP substitute', wholeQaPasses: 0 }, null, 2));
  } finally {
    await writeFile(join(out, 'ALL-DONE.json'), JSON.stringify({ at: new Date().toISOString(), note: 'End actual Owner Home/Project Link-full attempt; release only own held requests.' }));
    await page.close().catch(() => {});
    try {
      await runtime.stopWeb(env);
      await writeFile(join(out, `${role}-runtime-stopped.json`), JSON.stringify(await runtime.status(env), null, 2));
      await writeFile(join(out, `${role}-requests-final.json`), JSON.stringify({ requests, responses, observations, surfaceFailures }, null, 2));
    } finally {
      await verifyFundingLease(canonical, 0);
    }
  }
});
