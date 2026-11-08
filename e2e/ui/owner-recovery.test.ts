/** Opt-in canonical AMR witness: real native client, no business route mocks. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { clusterTest as test, expect } from '@/playwright/suite';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { ACTIVE_ARTIFACT_PREVIEW_SELECTOR } from '@/playwright/artifact-preview';
import { T } from '@/timeouts';

test('[P1] F11 Owner keeps input and artifact until one manual funded native task', async ({ page }) => {
  test.setTimeout(T.xlong * 10);
  const directory = process.env.F11_RUNTIME;
  test.skip(!directory, 'Explicit owned canonical F11 runtime required');
  assert(directory);
  const fixture = JSON.parse(await readFile(join(directory, 'f11-setup.private.json'), 'utf8'));
  const cfg = fixture.cfg, actor = fixture.actor, workspace = fixture.workspace;
  const leaseEnv = JSON.parse(await readFile(join(directory, 'owner-env.private.json'), 'utf8'));
  const namespace = `f11-${process.pid}-${randomUUID().slice(0, 6)}`;
  const evidence = process.env.F11_EVIDENCE_DIR ?? join(directory, `f11-${randomUUID()}`);
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const runtime = createToolsDevSuite({ root, namespace, ownerPid: process.pid, dataDir: join(root, 'data'), toolsDevRoot: join(root, 'tools-dev'), codexHomeDir: join(root, 'codex-home') });
  await mkdir(runtime.dataDir, { recursive: true });
  const home = join(root, 'amr-home');
  await mkdir(home, { recursive: true, mode: 0o700 });
  const vela = join(directory, 'vela-native');
  await writeFile(join(home, 'config.json'), JSON.stringify({ profiles: { local: { controlKey: actor.controlKey, runtimeKey: actor.runtimeKey, apiUrl: cfg.urls.api, linkUrl: cfg.urls.link, user: { id: actor.userId, email: actor.email, name: 'F11 Owner' } } } }), { mode: 0o600 });
  const config = { privacyDecisionAt: Date.now(), telemetry: { metrics: false, content: false, artifactManifest: false }, mode: 'daemon', agentId: 'amr', model: 'gpt-5.6-sol', onboardingCompleted: true, agentModels: { amr: { model: 'gpt-5.6-sol' } }, agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: vela } } };
  await writeFile(join(runtime.dataDir, 'app-config.json'), JSON.stringify(config));
  assert(process.env.F11_OPENCODE_BIN, 'Explicit actual native OpenCode binary required');
  const env = { AMR_HOME: home, VELA_BIN: vela, VELA_PROFILE: 'local', OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: cfg.urls.api, VELA_LINK_URL: cfg.urls.link, VELA_CONTROL_KEY: actor.controlKey, VELA_OPENCODE_BIN: process.env.F11_OPENCODE_BIN, OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: cfg.urls.web, OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off', OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1' };
  const headers = { 'x-od-workspace-id': workspace.workspaceId, 'x-od-workspace-type': 'team', 'x-od-workspace-member-id': workspace.ownerMemberId, 'x-od-workspace-role': 'owner', 'x-od-workspace-member-status': 'active', 'x-od-workspace-lifecycle-state': 'active', 'x-od-workspace-can-share-projects': 'true', 'x-od-workspace-can-write-synced-files': 'true' };
  const proof: Record<string, unknown> = { caseKey: 'client:UISTATE-F11-CLIENT', startedAt: new Date().toISOString(), productAMR: fixture.binding.productAMR, productOD: fixture.binding.OD, actualODTestHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), velaSHA256: createHash('sha256').update(await readFile(vela)).digest('hex'), workspaceId: workspace.workspaceId, ownerMemberId: workspace.ownerMemberId, actor: actor.userId, runtime: { namespace, dataDir: runtime.dataDir, toolsDevRoot: runtime.toolsDevRoot }, steps: [], boundary: 'Real browser/tools-dev/native Vela+OpenCode/API/Go/PG. Existing artifact prepared through actual daemon API, no fake generated task. Outgoing supplier and local incoming funding fact controlled.' };
  const network: unknown[] = [], creates: unknown[] = [];
  let businessStarted = false;
  const save = async () => { await writeFile(join(evidence, 'F11-actual.private.json'), JSON.stringify({ ...proof, network, creates }, null, 2)); };
  const helper = (action: string, label: string) => {
    const output = execFileSync('corepack', ['pnpm', '--filter', '@vela/api', 'exec', 'tsx', 'test/e2e/phase1-owner-recovery-fixture.ts', directory, action, `${label}-${basename(evidence)}`], { cwd: cfg.sourceRoot, env: { ...process.env, ...leaseEnv }, timeout: T.long, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return writeFile(join(evidence, `F11-helper-${action}-${label}.stdout.log`), output);
  };
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/runs' && request.method() === 'POST') creates.push({ at: new Date().toISOString(), url: request.url(), body: request.postData() });
  });
  page.on('response', async response => {
    const path = new URL(response.url()).pathname;
    if (/preflight|billing|wallet|workspace|\/api\/runs/.test(path)) {
      try { network.push({ at: new Date().toISOString(), path, status: response.status(), body: await response.json() }); } catch { /* SSE bodies remain in runtime logs. */ }
    }
  });
  await page.context().route('**/*', route => {
    const u = new URL(route.request().url());
    return !u.protocol.startsWith('http') || ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ? route.continue() : route.abort();
  });
  await page.addInitScript(({ config, workspace }) => {
    localStorage.setItem('open-design:config', JSON.stringify(config));
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
    sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId: workspace.workspaceId, workspaceMemberId: workspace.ownerMemberId }));
  }, { config, workspace });
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    const ready = { at: new Date().toISOString(), ...proof, daemonUrl: runtime.url.daemon('/'), webUrl: runtime.url.web('/'), allOwnedClientHandlesReady: true, modelRequestsBeforeOriginalSteps: 0 };
    await writeFile(join(evidence, 'F11-runtime-ready.private.json'), JSON.stringify(ready, null, 2));
    // Human/parent can inspect this readiness record while the browser prepares the Given.
    console.log('F11 owned native runtime ready; original steps not started');
    const projectId = `f11-${randomUUID()}`, filename = 'f11-existing.html';
    const html = '<!doctype html><html><body><h1>F11 existing output must remain</h1></body></html>';
    const project = await page.request.post(runtime.url.daemon('/api/projects'), { headers, data: { id: projectId, name: 'F11 Owner existing artifact', skillId: null, designSystemId: null, pendingPrompt: null, metadata: { kind: 'prototype' } } });
    assert(project.ok(), await project.text());
    const projectBody = await project.json();
    const conversationId = projectBody.conversationId;
    assert.equal(typeof conversationId, 'string');
    const file = await page.request.post(runtime.url.daemon(`/api/projects/${projectId}/files`), { headers, data: { name: filename, content: html } });
    assert(file.ok(), await file.text());
    const now = Date.now(), messageId = `existing-${randomUUID()}`;
    const message = await page.request.put(runtime.url.daemon(`/api/projects/${projectId}/conversations/${conversationId}/messages/${messageId}`), { headers, data: { id: messageId, role: 'assistant', content: '已有产物。', runStatus: 'succeeded', createdAt: now - 1000, startedAt: now - 2000, endedAt: now - 1000, producedFiles: [{ name: filename, path: filename, localPath: `/project/${projectId}/${filename}`, type: 'file', size: Buffer.byteLength(html), mtime: now - 1000, kind: 'html', mime: 'text/html' }], events: [{ kind: 'text', text: '已有产物。' }, { kind: 'artifact_focus', show: [filename] }] } });
    assert(message.ok(), await message.text());
    const rawURL = runtime.url.daemon(`/api/projects/${projectId}/raw/${filename}`);
    const originalRaw = await (await page.request.get(rawURL, { headers })).body();
    proof.artifact = { projectId, conversationId, filename, bytes: originalRaw.length, sha256: createHash('sha256').update(originalRaw).digest('hex'), givenSource: 'Actual daemon project/file/message API; no model generation claimed' };
    await page.goto(runtime.url.web(`/projects/${projectId}/conversations/${conversationId}/files/${filename}`), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    const input = page.getByTestId('chat-composer-input');
    await expect(input).toBeVisible({ timeout: T.xlong });
    const frame = page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
    await expect(frame.getByRole('heading', { name: 'F11 existing output must remain' })).toBeVisible({ timeout: T.xlong });
    const actualContextResponse = await page.request.get(runtime.url.daemon('/api/workspace/context'), { headers });
    assert(actualContextResponse.ok(), await actualContextResponse.text());
    const actualContext = (await actualContextResponse.json()).context;
    assert.equal(actualContext.workspaceId, workspace.workspaceId);
    assert.equal(actualContext.workspaceMemberId, workspace.ownerMemberId);
    assert.equal(actualContext.role, 'owner');
    // Current OD identity context derives from the directory, whose DTO intentionally omits planId.
    // Paid tier is authoritative only in the model-specific billing preflight below.
    const preflightURL = new URL(runtime.url.daemon('/api/workspace/billing/preflight'));
    preflightURL.searchParams.set('workspaceId', workspace.workspaceId);
    preflightURL.searchParams.set('modelId', 'gpt-5.6-sol');
    const preflightResponse = await page.request.get(preflightURL.href, { headers });
    assert(preflightResponse.ok(), `Actual Go prequalification must be configured, not a503: ${await preflightResponse.text()}`);
    const preflight = (await preflightResponse.json()).preflight;
    assert.equal(preflight.workspaceId, workspace.workspaceId);
    assert.equal(preflight.workspaceMemberId, workspace.ownerMemberId);
    assert.equal(preflight.modelId, 'gpt-5.6-sol');
    assert.equal(preflight.fundingCheck, 'insufficient');
    assert.equal(preflight.billingMode, 'shared');
    assert.equal(preflight.codingPlan.tier, 'go');
    proof.actualPrequalification = { actualContext, preflight };
    const prompt = 'F11 Owner：额度不足时保留这段输入和已有产物，补款后由我手动发送。只回复完成，不改文件。';
    await input.fill(prompt);
    await page.screenshot({ path: join(evidence, 'F11-before-send.png'), fullPage: true });
    await helper('snapshot', 'before-ui');
    proof.originalPage = page.url();
    proof.originalPrompt = prompt;
    await save();
    if (process.env.F11_READY_GATE) {
      await writeFile(join(evidence, 'F11-business-ready.private.json'), JSON.stringify({ at: new Date().toISOString(), projectId, conversationId, runtime: ready, modelRequests: 0 }, null, 2));
      await expect.poll(async () => { try { await access(process.env.F11_READY_GATE!); return true; } catch { return false; } }, { timeout: T.xlong * 5 }).toBe(true);
    }
    businessStarted = true;
    await page.getByTestId('chat-send').click();
    await expect(page.getByRole('heading', { name: '可用额度不足', exact: true })).toBeVisible({ timeout: T.long });
    await expect(page.getByText('当前额度不足，请充值或升级套餐后再试。', { exact: true })).toBeVisible();
    await expect(input).toHaveText(prompt);
    expect(page.url()).toBe(proof.originalPage);
    expect(creates).toHaveLength(0);
    await expect(frame.getByRole('heading', { name: 'F11 existing output must remain' })).toBeVisible();
    assert.deepEqual(await (await page.request.get(rawURL, { headers })).body(), originalRaw);
    await page.screenshot({ path: join(evidence, 'F11-insufficient.png'), fullPage: true });
    await writeFile(join(evidence, 'F11-insufficient.ax.txt'), await page.locator('body').ariaSnapshot());
    await helper('snapshot', 'after-insufficient');
    proof.steps = [{ id: '1', status: 'passed', at: new Date().toISOString(), actual: 'Real Owner insufficient notice; editable original input/page and actual viewer artifact retained; no create-run request' }];
    await save();
    await page.getByRole('button', { name: '暂不需要', exact: true }).click();
    await helper('fund', 'once');
    await page.getByTestId('entry-top-right-credits').click();
    await expect(page.getByTestId('entry-top-right-credits-panel')).toBeVisible({ timeout: T.long });
    await expect(page.getByTestId('entry-nav-credits-row')).toContainText('$10.00', { timeout: T.long });
    await expect(input).toHaveText(prompt);
    expect(creates).toHaveLength(0);
    await expect(frame.getByRole('heading', { name: 'F11 existing output must remain' })).toBeVisible();
    await helper('snapshot', 'funded-before-manual');
    await page.screenshot({ path: join(evidence, 'F11-funded-before-manual.png'), fullPage: true });
    await writeFile(join(evidence, 'F11-funded-before-manual.ax.txt'), await page.locator('body').ariaSnapshot());
    await page.getByTestId('entry-top-right-credits').click();
    const createResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/runs' && response.request().method() === 'POST', { timeout: T.xlong });
    await page.getByTestId('chat-send').click();
    const created = await createResponse;
    assert(created.ok(), await created.text());
    const run = await created.json();
    assert.equal(typeof run.runId, 'string');
    proof.manualCreated = run;
    await save();
    let terminal: unknown;
    await expect.poll(async () => { const response = await page.request.get(runtime.url.daemon(`/api/runs/${run.runId}`)); assert(response.ok()); terminal = await response.json(); await writeFile(join(evidence, 'F11-manual-run.private.json'), JSON.stringify(terminal, null, 2)); return (terminal as { status?: string }).status; }, { timeout: T.xlong * 5 }).toBe('succeeded');
    expect(creates).toHaveLength(1);
    await expect(input).toBeEmpty();
    await expect(frame.getByRole('heading', { name: 'F11 existing output must remain' })).toBeVisible();
    assert.deepEqual(await (await page.request.get(rawURL, { headers })).body(), originalRaw);
    await helper('snapshot', 'manual-completed');
    await helper('audit', 'manual-completed');
    await page.screenshot({ path: join(evidence, 'F11-manual-completed.png'), fullPage: true });
    await writeFile(join(evidence, 'F11-manual-completed.ax.txt'), await page.locator('body').ariaSnapshot());
    proof.steps = [...proof.steps as unknown[], { id: '2', status: 'passed', at: new Date().toISOString(), actual: 'Actual production funding/projection ACK visible; no create before manual click; one new native run naturally succeeded, existing artifact unchanged' }];
    proof.status = 'ui_original_two_steps_and_dynamic_financial_oracle_passed';
  } catch (error) {
    proof.status = 'first_failure_preserved'; proof.businessStarted = businessStarted; proof.error = error instanceof Error ? error.stack : String(error);
    await page.screenshot({ path: join(evidence, 'F11-first-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    proof.finishedAt = new Date().toISOString();
    await save();
    await runtime.stopWeb(env);
    await writeFile(join(evidence, 'F11-client-stopped.private.json'), JSON.stringify({ at: new Date().toISOString(), namespace, runtimeRoot: root, status: await runtime.status(env) }, null, 2));
  }
});
