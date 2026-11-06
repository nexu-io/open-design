/** Opt-in original F12/F15 only: one real Go workspace, three isolated native clients. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { clusterTest as test, expect } from '@/playwright/suite';
import { seedCampaignDismissals } from '@/playwright/campaign-dismissals';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { ACTIVE_ARTIFACT_PREVIEW_SELECTOR } from '@/playwright/artifact-preview';
import { T } from '@/timeouts';

test('[P1] F12 Owner and F15 Admin Member retain ChatPanel then manually recover one real Link slot', async ({ browser }) => {
  test.setTimeout(T.xlong * 18);
  const directory = process.env.CHATPANEL_RUNTIME;
  test.skip(!directory, 'Explicit owned F12/F15 runtime required');
  assert(directory);
  const cfg = JSON.parse(await readFile(join(directory, 'sandbox.private.json'), 'utf8'));
  const fixture = JSON.parse(await readFile(join(directory, 'chatpanel-registration.private.json'), 'utf8'));
  const workspace = fixture.spaces.main;
  const resumed = process.env.CHATPANEL_RESUME_GIVEN ? JSON.parse(await readFile(process.env.CHATPANEL_RESUME_GIVEN, 'utf8')) : null;
  const evidence = process.env.CHATPANEL_NATIVE_OUTPUT ?? join(directory, 'native');
  await mkdir(evidence, { recursive: true });
  const provider = JSON.parse(await readFile(join(directory, 'provider-state.json'), 'utf8'));
  const providerURL = `http://127.0.0.1:${provider.port}`;
  const load = async (name: string) => JSON.parse(await readFile(join(directory, name), 'utf8'));
  const waitFile = async (name: string) => { await expect.poll(async () => { try { await access(join(directory, name)); return true; } catch { return false; } }, { timeout: T.xlong * 4 }).toBe(true); return load(name); };
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const providerState = async () => { const r = await fetch(`${providerURL}/state`); assert(r.ok); return r.json(); };
  const daemonURL = (runtime: ReturnType<typeof createToolsDevSuite>, path: string) => new URL(path, runtime.url.daemon('/')).href;
  const roleNames = ['owner', 'admin', 'member'] as const;
  type Client = { role: string; page: Page; context: BrowserContext; runtime: ReturnType<typeof createToolsDevSuite>; env: Record<string,string>; headers: Record<string,string>; prompt: string; rawURL: string; artifact: Buffer; creates: unknown[]; events: unknown[]; network: unknown[]; proof: Record<string,unknown> };
  const clients: Client[] = [];
  const actualProductAMR = process.env.RUN013_PRODUCT_BASELINE_SHA ?? '289dbce6b021cbbf139bf070a0b9c486823f950c';
  const actualProductOD = process.env.RUN013_OD_BASELINE_SHA ?? 'dd39556468811fd473d4aa27168b5c47956e1435';
  assert.match(actualProductAMR, /^[a-f0-9]{40}$/);assert.match(actualProductOD, /^[a-f0-9]{40}$/);
  const proof: Record<string, unknown> = { cases: ['client:UISTATE-F12-CLIENT', 'client:UISTATE-F15-CLIENT'], actualProductAMR, actualProductOD, startedAt: new Date().toISOString(), workspaceId: workspace.workspaceId, roles: [], boundary: 'Real ChatPanel, daemon project/artifact Given, native Vela/OpenCode, canonical API/Link/PG/Redis; only supplier HTTP controlled. No Home case, UI response mock, price/quota/permission mutation or actual PSP payment.' };
  const save = () => writeFile(join(evidence, 'F12-F15-actual.private.json'), JSON.stringify({ ...proof, roles: clients.map(c => ({ ...c.proof, creates: c.creates, network: c.network, events: c.events })) }, null, 2));
  let controlURL = '';
  const control = async (path: string) => { const response = await fetch(`${controlURL}${path}`, { method: path === '/state' ? 'GET' : 'POST', signal: AbortSignal.timeout(T.long) }); const body = await response.json(); assert(response.ok, JSON.stringify(body)); return body; };
  try {
    for (const role of roleNames) {
      const actor = fixture.actors[role], memberId = workspace.members[role]; assert(actor && memberId);
      const namespace = `cp-${role}-${process.pid}-${randomUUID().slice(0,4)}`;
      const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
      const clientData = join(directory, 'clients', role, 'data');
      const runtime = createToolsDevSuite({ root, namespace, ownerPid: process.pid, dataDir: clientData, toolsDevRoot: join(root,'tools-dev'), codexHomeDir: join(root,'codex-home') });
      const home = join(clientData,'agent-runtime','amr-local'); await mkdir(home,{recursive:true});
      const vela = join(directory,'vela-native');
      await writeFile(join(home,'config.json'),JSON.stringify({profiles:{local:{controlKey:actor.controlKey,runtimeKey:actor.runtimeKey,apiUrl:cfg.urls.api,linkUrl:cfg.urls.link,user:{id:actor.userId,email:actor.email,name:`ChatPanel ${role}`}}}}),{mode:0o600});
      const config = { mode:'daemon',agentId:'amr',model:'gpt-5.6-sol',onboardingCompleted:true,privacyDecisionAt:Date.now(),telemetry:{metrics:false,content:false,artifactManifest:false},agentModels:{amr:{model:'gpt-5.6-sol'}},agentCliEnv:{amr:{OPEN_DESIGN_AMR_PROFILE:'local',VELA_BIN:vela}} };
      await mkdir(runtime.dataDir,{recursive:true});await writeFile(join(runtime.dataDir,'app-config.json'),JSON.stringify(config));
      const env = { AMR_HOME:home,VELA_BIN:vela,VELA_PROFILE:'local',OPEN_DESIGN_AMR_PROFILE:'local',VELA_API_URL:cfg.urls.api,VELA_LINK_URL:cfg.urls.link,VELA_CONTROL_KEY:actor.controlKey,VELA_OPENCODE_BIN:process.env.CHATPANEL_OPENCODE_BIN ?? '',OD_WORKSPACE_CONTEXT_SOURCE:'vela',OD_COLLAB_TRANSPORT:'off',OD_RESOURCE_TRANSPORT:'off',OD_TEAM_PROJECTS_TRANSPORT:'off',OD_VELA_WEB_URL:cfg.urls.web,OPENCODE_DISABLE_DEFAULT_PLUGINS:'1',OPENCODE_DISABLE_EXTERNAL_SKILLS:'1' };
      assert(env.VELA_OPENCODE_BIN);
      const context = await browser.newContext({viewport:{width:1440,height:1000}});await seedCampaignDismissals(context);const page = await context.newPage();
      const headers:Record<string,string>={'x-od-workspace-id':workspace.workspaceId,'x-od-workspace-type':'team','x-od-workspace-member-id':memberId,'x-od-workspace-role':role,'x-od-workspace-member-status':'active','x-od-workspace-lifecycle-state':'active'};
      const creates:unknown[]=[], network:unknown[]=[], events:unknown[]=[];
      const c:Client={role,page,context,runtime,env,headers,prompt:'',rawURL:'',artifact:Buffer.alloc(0),creates,events,network,proof:{role,memberId,actorId:actor.userId,namespace,caseId:role==='owner'?'client:UISTATE-F12-CLIENT':'client:UISTATE-F15-CLIENT',environmentFlags:{OD_WORKSPACE_CONTEXT_SOURCE:'vela',OD_COLLAB_TRANSPORT:'off',OD_RESOURCE_TRANSPORT:'off',OD_TEAM_PROJECTS_TRANSPORT:'off'},steps:[]}};clients.push(c);
      page.on('request',r=>{if(new URL(r.url()).pathname==='/api/runs'&&r.method()==='POST')creates.push({at:Date.now(),body:r.postData()});});
      page.on('response',async response=>{const path=new URL(response.url()).pathname;if(/billing|\/api\/runs/.test(path)){try{network.push({at:Date.now(),path,status:response.status(),body:await response.json()});}catch{/* streamed body is captured separately */}}});
      const cdp = await context.newCDPSession(page);await cdp.send('Network.enable');cdp.on('Network.eventSourceMessageReceived',e=>events.push(e));
      await context.route('**/*',route=>{const u=new URL(route.request().url());return !u.protocol.startsWith('http')||['127.0.0.1','localhost','[::1]'].includes(u.hostname)?route.continue():route.abort();});
      await page.addInitScript(({config,workspace,memberId})=>{localStorage.setItem('open-design:config',JSON.stringify(config));localStorage.setItem('open-design:locale','zh-CN');localStorage.setItem('open-design:locale-source','manual');sessionStorage.setItem('od.workspaceSelection.v1',JSON.stringify({workspaceId:workspace.workspaceId,workspaceMemberId:memberId}));},{config,workspace,memberId});
      await runtime.startWeb(env);await warmPlaywrightWebRuntime(runtime.url.web('/'));await warmPlaywrightDaemonRuntime(daemonURL(runtime,'/api/health'));
      const identity = await (await page.request.get(daemonURL(runtime,'/api/integrations/vela/status'))).json();assert(identity.loggedIn && identity.user.id===actor.userId);
      const current = await (await page.request.get(daemonURL(runtime,'/api/workspace/context'),{headers})).json();assert.equal(current.context.workspaceId,workspace.workspaceId);assert.equal(current.context.workspaceMemberId,memberId);assert.equal(current.context.role,role);
      const preflight = await (await page.request.get(daemonURL(runtime,`/api/workspace/billing/preflight?workspaceId=${workspace.workspaceId}&modelId=gpt-5.6-sol`),{headers})).json();assert.equal(preflight.preflight.billingMode,'shared');assert.equal(preflight.preflight.codingPlan.tier,'go');assert.equal(preflight.preflight.fundingCheck,'available');
      const hint = await (await page.request.get(daemonURL(runtime,`/api/workspace/billing/request-concurrency?workspaceId=${workspace.workspaceId}`))).json();assert.equal(hint.requestConcurrencyHint.limit,10);assert.equal(hint.requestConcurrencyHint.running,0);
      const previous = resumed?.roles.find((r:{role:string}) => r.role===role);
      if(previous){assert.equal(previous.actorId,actor.userId);assert.equal(previous.memberId,memberId);}
      const projectId=previous?.projectId ?? `cp-${role}-${randomUUID()}`, filename=previous?.artifact.filename ?? `existing-${role}.html`, title=`Existing ${role} artifact stays exact`;
      let conversationId:string;
      if (!previous) {
      const response=await page.request.post(daemonURL(runtime,'/api/projects'),{headers,data:{id:projectId,name:`F12 F15 ${role}`,skillId:null,designSystemId:null,pendingPrompt:null,metadata:{kind:'prototype'}}});assert(response.ok(),await response.text());const body=await response.json();conversationId=body.conversationId;assert.equal(typeof conversationId,'string');
      const html=`<!doctype html><html><body><h1>${title}</h1><p>Pre-existing artifact Given via the actual daemon API.</p></body></html>`;
      const file=await page.request.post(daemonURL(runtime,`/api/projects/${projectId}/files`),{headers,data:{name:filename,content:html}});assert(file.ok(),await file.text());
      const messageId=`existing-${randomUUID()}`,now=Date.now();const message=await page.request.put(daemonURL(runtime,`/api/projects/${projectId}/conversations/${conversationId}/messages/${messageId}`),{headers,data:{id:messageId,role:'assistant',content:'已有产物，保留其原字节。',runStatus:'succeeded',createdAt:now-1000,startedAt:now-2000,endedAt:now-1000,producedFiles:[{name:filename,path:filename,localPath:`/project/${projectId}/${filename}`,type:'file',size:Buffer.byteLength(html),mtime:now-1000,kind:'html',mime:'text/html'}],events:[{kind:'text',text:'已有产物。'},{kind:'artifact_focus',show:[filename]}]}});assert(message.ok(),await message.text());
      } else {conversationId=previous.conversationId;}
      c.rawURL=daemonURL(runtime,`/api/projects/${projectId}/raw/${filename}`);c.artifact=await (await page.request.get(c.rawURL,{headers})).body();if(previous)assert.equal(hash(c.artifact),previous.artifact.sha256);
      await page.goto(runtime.url.web(`/projects/${projectId}/conversations/${conversationId}/files/${filename}`),{waitUntil:'domcontentloaded',timeout:T.xlong});
      await expect(page.getByTestId('chat-composer-input')).toBeVisible({timeout:T.xlong});await expect(page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).getByRole('heading',{name:title})).toBeVisible({timeout:T.xlong});
      c.prompt=previous?.originalPrompt ?? `只回复一行已完成，不修改已有产物。QA:${JSON.stringify({id:`manual-${role}-${randomUUID()}`,tokens:1000,text:`${role} manual completion`})}`;
      await page.getByTestId('chat-composer-input').fill(c.prompt);
      c.proof={...c.proof,projectId,conversationId,artifact:{filename,bytes:c.artifact.length,sha256:hash(c.artifact),given:'Real daemon project/file/message API, no generated task claimed'},originalPrompt:c.prompt,context:current,preflight,hint,webURL:runtime.url.web('/'),daemonURL:daemonURL(runtime,'/')};await save();
    }
    const initialProvider=await providerState();assert.equal(initialProvider.events.length,0);
    await writeFile(process.env.CHATPANEL_READY_FILE ?? join(directory,'native-ready.private.json'),JSON.stringify({at:new Date().toISOString(),roles:clients.map(c=>c.proof),modelRequests:0,threeProjectPanelsReady:true},null,2));
    await waitFile('holder/RUN013-held-ready.safe.json');const h=await load('holder/RUN013-holder-runtime.safe.json');controlURL=h.url;
    let state=await control('/state');assert(state.barrierValidNow && state.callerPending===10 && state.counts.advisory.running===10);
    for(const c of clients){
      await c.page.getByTestId('chat-send').click();
      await expect(c.page.getByRole('heading',{name:c.role==='owner'?'可用并发不足':'团队并发不足',exact:true})).toBeVisible({timeout:T.long});
      await expect(c.page.getByTestId('chat-composer-input')).toHaveText(c.prompt);assert.equal(c.creates.length,0);
      await c.page.screenshot({path:join(evidence,`${c.role}-full-modal.png`),fullPage:true});
      await c.page.getByRole('button',{name:c.role==='owner'?'暂不需要':'知道了',exact:true}).click();
      await expect(c.page.getByTestId('chat-concurrency-card')).toBeVisible({timeout:T.long});await expect(c.page.getByTestId('chat-concurrency-card')).toContainText('已用满');await expect(c.page.getByTestId('chat-concurrency-card')).toContainText(c.role==='owner'?'当前并发不足，请升级套餐后再试。':'当前团队并发不足，请联系团队空间所有者升级订阅。');await expect(c.page.getByTestId('chat-concurrency-card').getByRole('button',{name:'升级',exact:true})).toBeVisible();await expect(c.page.getByTestId('chat-composer-input')).toHaveText(c.prompt);
      assert.deepEqual(await(await c.page.request.get(c.rawURL,{headers:c.headers})).body(),c.artifact);assert.equal(c.creates.length,0);
      await c.page.screenshot({path:join(evidence,`${c.role}-chatpanel-full-card.png`),fullPage:true});await writeFile(join(evidence,`${c.role}-full-card.ax.txt`),await c.page.locator('body').ariaSnapshot());
      c.proof.steps=[{id:'1',status:'passed',at:new Date().toISOString(),promptRetained:true,artifactSHA256:hash(c.artifact),newCreateRun:0}];await save();
    }
    const beforeRelease=await control('/snapshot');assert.equal(beforeRelease.usage,0);assert.equal(beforeRelease.ledger,0);assert.equal((await providerState()).events.filter((e:{type:string})=>e.type==='arrived').length,10);
    await control('/release-one');state=await control('/state');assert.equal(state.counts.advisory.running,9);assert.equal(state.counts.redis.running,9);
    proof.oneReleaseObservedAt=new Date().toISOString();proof.beforeRelease=beforeRelease;await save();
    for(const c of clients){
      const refreshed=await c.page.request.get(daemonURL(c.runtime,`/api/workspace/billing?scope=workspace&workspaceId=${workspace.workspaceId}&includePreflight=1&modelId=gpt-5.6-sol`),{headers:c.headers});assert(refreshed.ok(),await refreshed.text());
      const hint=await(await c.page.request.get(daemonURL(c.runtime,`/api/workspace/billing/request-concurrency?workspaceId=${workspace.workspaceId}`))).json();assert.equal(hint.requestConcurrencyHint.running,9);assert.equal(hint.requestConcurrencyHint.limit,10);
      await expect(c.page.getByTestId('chat-composer-input')).toHaveText(c.prompt);assert.equal(c.creates.length,0);assert.deepEqual(await(await c.page.request.get(c.rawURL,{headers:c.headers})).body(),c.artifact);
      await c.page.screenshot({path:join(evidence,`${c.role}-recovered-before-manual.png`),fullPage:true});
    }
    const releasedOnly=await control('/snapshot');assert.equal(releasedOnly.usage,1);assert.equal(releasedOnly.ledger,1);proof.afterOneReleasedBeforeManual=releasedOnly;await save();
    for(const c of clients){
      const createdPromise=c.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/runs'&&r.request().method()==='POST',{timeout:T.xlong});await c.page.getByTestId('chat-send').click();const created=await createdPromise;assert(created.ok(),await created.text());const run=await created.json();assert.equal(typeof run.runId,'string');
      let terminal:unknown;await expect.poll(async()=>{const response=await c.page.request.get(daemonURL(c.runtime,`/api/runs/${run.runId}`));assert(response.ok());terminal=await response.json();return (terminal as {status:string}).status;},{timeout:T.xlong*3}).toBe('succeeded');
      assert.equal(c.creates.length,1);await expect(c.page.getByTestId('chat-composer-input')).toBeEmpty();assert.deepEqual(await(await c.page.request.get(c.rawURL,{headers:c.headers})).body(),c.artifact);
      await c.page.screenshot({path:join(evidence,`${c.role}-manual-completed.png`),fullPage:true});await writeFile(join(evidence,`${c.role}-manual-completed.ax.txt`),await c.page.locator('body').ariaSnapshot());
      c.proof.steps=[...(c.proof.steps as unknown[]),{id:'2',status:'passed',at:new Date().toISOString(),manualRunId:run.runId,terminal,createRunCount:1,artifactSHA256:hash(c.artifact)}];await save();
      await control('/snapshot');
    }
    await control('/release');proof.status='original_two_steps_passed_all_three_roles';await save();
  }catch(error){proof.status='first_failure_preserved';proof.error=error instanceof Error?error.stack:String(error);for(const c of clients)await c.page.screenshot({path:join(evidence,`${c.role}-first-failure.png`),fullPage:true}).catch(()=>{});throw error;}
  finally{proof.finishedAt=new Date().toISOString();await save();if(controlURL)await control('/release').catch(()=>{});for(const c of clients.reverse()){await c.context.close();await c.runtime.stopWeb(c.env);await writeFile(join(evidence,`${c.role}-client-stopped.private.json`),JSON.stringify({at:new Date().toISOString(),status:await c.runtime.status(c.env)},null,2));}}
});
