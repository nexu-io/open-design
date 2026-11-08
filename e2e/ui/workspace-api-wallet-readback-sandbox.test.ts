import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,chmod,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {clusterTest as test,expect} from '@/playwright/suite';
import {T} from '@/timeouts';
import {createToolsDevSuite,e2eWorkspaceRoot} from '@/tools-dev/runtime';
import {warmPlaywrightWebRuntime,warmPlaywrightDaemonRuntime,PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS} from '@/playwright/runtime-lifecycle';
// Preserved historical witness only. This raw-fixture continuation has no
// canonical ownership/origin binding and cannot safely reuse its old runtime.
function requireCanonicalHistoricalReplay(): void {
  throw new Error('Historical replay is disabled until a fresh canonical ownership and exact loopback binding is provided; do not reuse prior runtime data');
}
test.use({video:'on',viewport:{width:1280,height:800}});
test('[P0] API001 read-only Owner final five-dollar quota visible',async({page})=>{
 requireCanonicalHistoricalReplay();
 test.setTimeout(PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS);
 const out=process.env.YANG_UI_EVIDENCE_DIR!, fixturePath=process.env.YANG_UI_FIXTURE_PATH!;
 if(!out||!fixturePath)throw new Error('Explicit evidence and private sandbox fixture required');
 if((await stat(fixturePath)).mode&0o077)throw new Error('Private0600 fixture required');
 const f=JSON.parse(await readFile(fixturePath,'utf8'));const space=f.spaces.subject,control=f.spaces.control,actor=f.actors.od;
 for(const name of ['vela','openCode'])expect(createHash('sha256').update(await readFile(f.runtime[`${name}Bin`])).digest('hex')).toBe(f.runtime[`${name}Sha256`]);
 expect(space.workspaceId).not.toBe(control.workspaceId);
 const prior=process.env.API001_REUSE_IDENTITY ? JSON.parse(await readFile(process.env.API001_REUSE_IDENTITY,'utf8')) : null;
 const namespace=prior?.namespace ?? `codex-yang-c20-api001-${process.pid}`,root=prior?.root ?? join(e2eWorkspaceRoot(),'.tmp','e2e',namespace),dataDir=prior?.dataDir ?? join(root,'scratch','data'),amrHome=join(out,'private','amr-home');
 await mkdir(dataDir,{recursive:true});await mkdir(amrHome,{recursive:true,mode:0o700});
 const configPath=join(amrHome,'config.json');await writeFile(configPath,JSON.stringify({profiles:{local:{controlKey:actor.controlKey,runtimeKey:space.runtimeKey,apiUrl:f.cfg.urls.api,linkUrl:f.cfg.urls.link,user:{id:actor.userId,email:actor.email,name:actor.name??'API001 QA'}}}}));await chmod(configPath,0o600);
 const config={privacyDecisionAt:1,telemetry:{metrics:false,content:false,artifactManifest:false},mode:'daemon',agentId:'amr',model:f.runtime.modelId,onboardingCompleted:true,agentModels:{amr:{model:f.runtime.modelId}},agentCliEnv:{amr:{OPEN_DESIGN_AMR_PROFILE:'local',VELA_BIN:f.runtime.velaBin}}};
 await writeFile(join(dataDir,'app-config.json'),JSON.stringify(config));
 const runtime=createToolsDevSuite({root,dataDir,namespace,codexHomeDir:join(root,'scratch','codex-home'),toolsDevRoot:join(root,'scratch','tools-dev'),ownerPid:process.pid});
 const env={AMR_HOME:amrHome,VELA_BIN:f.runtime.velaBin,VELA_OPENCODE_BIN:f.runtime.openCodeBin,VELA_PROFILE:'local',OPEN_DESIGN_AMR_PROFILE:'local',VELA_API_URL:f.cfg.urls.api,VELA_LINK_URL:f.cfg.urls.link,VELA_CONTROL_KEY:actor.controlKey,OD_WORKSPACE_CONTEXT_SOURCE:'vela',OD_VELA_WEB_URL:f.cfg.urls.web,OD_COLLAB_TRANSPORT:'off',OD_RESOURCE_TRANSPORT:'off',OD_TEAM_PROJECTS_TRANSPORT:'off'};
 const headers={'x-od-workspace-id':space.workspaceId,'x-od-workspace-member-id':space.ownerMemberId,'x-od-workspace-role':'owner','x-od-workspace-lifecycle-state':'active','x-od-workspace-member-status':'active'};
 await writeFile(join(out,'owned-runtime-identity.safe.json'),JSON.stringify({namespace,root,dataDir,toolsDevRoot:runtime.toolsDevRoot}));
 const requests:{method:string;url:string;at:string}[]=[];const responses:unknown[]=[];const pending:Promise<void>[]=[];
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))requests.push({method:r.method(),url:r.url(),at:new Date().toISOString()});});
 page.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/workspace/')&&r.headers()['content-type']?.includes('application/json'))pending.push((async()=>{responses.push({url:r.url(),status:r.status(),body:await r.json().catch(()=>null),at:new Date().toISOString()});})());});
 try{
  await runtime.startWeb(env);await warmPlaywrightWebRuntime(runtime.webUrl!);await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
  const integration=await(await fetch(new URL('/api/integrations/vela/status',runtime.webUrl!))).json();expect(integration.loggedIn).toBe(true);expect(integration.user.id).toBe(actor.userId);
  const before=await(await fetch(new URL(`/api/workspace/billing?scope=workspace&workspaceId=${space.workspaceId}&includePreflight=1&modelId=${f.runtime.modelId}`,runtime.webUrl!),{headers,signal:AbortSignal.timeout(T.medium)})).json();expect(Number(before.preflight.balanceUsd)).toBe(5);await writeFile(join(out,'before-readonly-billing.json'),JSON.stringify(before,null,2));
  await page.addInitScript(({config,workspaceId,memberId})=>{localStorage.setItem('open-design:config',JSON.stringify(config));localStorage.setItem('open-design:locale','en');localStorage.setItem('open-design:locale-source','manual');sessionStorage.setItem('od.workspaceSelection.v1',JSON.stringify({workspaceId,workspaceMemberId:memberId}));},{config,workspaceId:space.workspaceId,memberId:space.ownerMemberId});
  const contextReady=page.waitForResponse(async r=>{if(new URL(r.url()).pathname!=='/api/workspace/context'||!r.ok())return false;const value=await r.json().catch(()=>null);return value?.context?.workspaceId===space.workspaceId&&value.context.role==='owner';},{timeout:T.long});
  await page.goto(runtime.webUrl!,{waitUntil:'domcontentloaded',timeout:T.xlong});const contextResponse=await contextReady;const current=await contextResponse.json();expect(current.context.workspaceId).toBe(space.workspaceId);expect(current.context.role).toBe('owner');
  await expect(page.getByTestId('home-hero-input')).toBeVisible({timeout:T.long});const toggle=page.getByTestId('entry-rail-collapse');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click({timeout:T.medium});await expect(toggle).toHaveAttribute('aria-expanded','true');
  const switcher=page.getByTestId('workspace-switcher');await switcher.click({timeout:T.medium});const row=page.getByTestId('workspace-switcher-list').getByRole('menuitem').filter({hasText:space.workspaceName});await expect(row).toHaveAttribute('aria-current','true');await page.locator('.entry-nav-rail__menu-backdrop').click({timeout:T.medium});await expect(switcher).toHaveAttribute('aria-expanded','false');
  const credits=page.getByTestId('entry-top-right-credits');await credits.hover({timeout:T.medium});await credits.click({timeout:T.medium});const panel=page.getByTestId('entry-top-right-credits-panel');await expect(panel).toBeVisible({timeout:T.medium});await panel.hover({timeout:T.medium});await expect(panel.getByTestId('workspace-quota-skeleton')).toHaveCount(0,{timeout:T.long});await expect(panel.getByTestId('entry-nav-credits-row')).toContainText('$5.00',{timeout:T.long});
  await writeFile(join(out,'final-five-dollar-dom.json'),JSON.stringify({url:page.url(),current,selectedSpace:space.workspaceId,panel:await panel.innerText(),at:new Date().toISOString()},null,2));await page.screenshot({path:join(out,'owner-final-five-dollar-quota.png')});
  const after=await(await fetch(new URL(`/api/workspace/billing?scope=workspace&workspaceId=${space.workspaceId}&includePreflight=1&modelId=${f.runtime.modelId}`,runtime.webUrl!),{headers,signal:AbortSignal.timeout(T.medium)})).json();expect(Number(after.preflight.balanceUsd)).toBe(5);expect(requests.filter(r=>r.method==='POST'&&new URL(r.url).pathname==='/api/runs')).toHaveLength(0);await writeFile(join(out,'readback-results.safe.json'),JSON.stringify({before,after,actualOwnerId:actor.userId,workspaceId:space.workspaceId,visibleBalance:'$5.00',newModelRuns:0,scope:'Read-only real UI after original04 accounting; does not change original exit1 or certify Key UI',wholeQaPass:false},null,2));
 }finally{
  await writeFile(join(out,'final-observed-dom.private.json'),JSON.stringify({url:page.url(),text:await page.locator('body').innerText().catch(()=>null)}),{mode:0o600});await page.screenshot({path:join(out,'final-observed-page.png')}).catch(()=>{});await page.close().catch(()=>{});await Promise.allSettled(pending);await writeFile(join(out,'workspace-http-readback.json'),JSON.stringify(responses,null,2));await runtime.stopWeb(env);await writeFile(join(out,'owner-runtime-stopped.json'),JSON.stringify(await runtime.status(env),null,2));await writeFile(join(out,'browser-requests.json'),JSON.stringify(requests,null,2));
 }
});
