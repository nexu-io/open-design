import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { clusterTest as test, expect } from '@/playwright/suite';
import { T } from '@/timeouts';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightWebRuntime, warmPlaywrightDaemonRuntime, PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS } from '@/playwright/runtime-lifecycle';
// Preserved historical witness only. This raw-fixture continuation has no
// canonical ownership/origin binding and cannot safely reuse its old runtime.
function requireCanonicalHistoricalReplay(): void {
  throw new Error('Historical replay is disabled until a fresh canonical ownership and exact loopback binding is provided; do not reuse prior runtime data');
}
test.use({video:'on',viewport:{width:1280,height:800}});
test('[P0] F04 actual manual Retry after real Link capacity release',async({page})=>{
 requireCanonicalHistoricalReplay();
 test.setTimeout(PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS);
 const out=process.env.YANG_UI_EVIDENCE_DIR!;const old=process.env.F04_PRIOR_EVIDENCE!;
 if(!out||!old)throw new Error('Explicit private evidence paths required');
 const fixture=JSON.parse(await readFile(process.env.YANG_UI_FIXTURE_PATH!,'utf8'));
 const identity=JSON.parse(await readFile(join(old,'owned-runtime-identity.safe.json'),'utf8'));
 const config=JSON.parse(await readFile(join(identity.dataDir,'app-config.json'),'utf8'));
 const space=fixture.spaces.concurrency, actor=fixture.actors.od;
 const namespace=`codex-yang-c20-f04-retry-${process.pid}`;
 const root=join(e2eWorkspaceRoot(),'.tmp','e2e',namespace);
 const runtime=createToolsDevSuite({root,dataDir:identity.dataDir,namespace,codexHomeDir:join(root,'scratch','codex-home'),toolsDevRoot:join(root,'scratch','tools-dev'),ownerPid:process.pid});
 const env={AMR_HOME:join(old,'private',identity.namespace,'amr-home'),VELA_BIN:fixture.runtime.velaBin,VELA_PROFILE:'local',OPEN_DESIGN_AMR_PROFILE:'local',VELA_API_URL:fixture.cfg.urls.api,VELA_LINK_URL:fixture.cfg.urls.link,VELA_CONTROL_KEY:actor.controlKey,OD_WORKSPACE_CONTEXT_SOURCE:'vela',OD_VELA_WEB_URL:fixture.cfg.urls.web,VELA_OPENCODE_BIN:fixture.runtime.openCodeBin,OD_COLLAB_TRANSPORT:'off',OD_RESOURCE_TRANSPORT:'off',OD_TEAM_PROJECTS_TRANSPORT:'off'};
 const headers={'x-od-workspace-id':space.workspaceId,'x-od-workspace-member-id':space.ownerMemberId,'x-od-workspace-role':'owner','x-od-workspace-lifecycle-state':'active','x-od-workspace-member-status':'active'};
 await mkdir(out,{recursive:true});
 await writeFile(join(out,'owned-runtime-identity.safe.json'),JSON.stringify({namespace,root,dataDir:identity.dataDir,toolsDevRoot:runtime.toolsDevRoot,priorNamespace:identity.namespace}));
 const observations:unknown[]=[];
 try{
  await runtime.startWeb(env);await warmPlaywrightWebRuntime(runtime.webUrl!);await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
  await page.addInitScript(({config,workspaceId,memberId})=>{localStorage.setItem('open-design:config',JSON.stringify(config));localStorage.setItem('open-design:locale','en');localStorage.setItem('open-design:locale-source','manual');sessionStorage.setItem('od.workspaceSelection.v1',JSON.stringify({workspaceId,workspaceMemberId:memberId}));},{config,workspaceId:space.workspaceId,memberId:space.ownerMemberId});
  for(const surface of ['home','project']){
   const dir=join(out,surface);await mkdir(dir,{recursive:true});
   try{
    const prior=JSON.parse(await readFile(join(old,`owner-${surface}-01`,'actual-observation.json'),'utf8'));
    const oldRun=await(await fetch(runtime.url.daemon(`/api/runs/${prior.created.runId}`),{headers})).json();
    expect(oldRun.status).toMatch(/error|failed/);
    await page.goto(new URL(`/projects/${oldRun.projectId}/conversations/${oldRun.conversationId}`,runtime.webUrl!).toString(),{waitUntil:'domcontentloaded',timeout:T.xlong});
    const retry=page.getByTestId('chat-run-error-card').getByRole('button',{name:'Retry',exact:true});
    await expect(retry).toBeVisible({timeout:T.long});await expect(retry).toBeEnabled({timeout:T.short});
    const before=await page.locator('body').innerText();
    await page.screenshot({path:join(dir,'before-manual-retry.png')});
    const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/runs',{timeout:T.long});
    const clickedAt=new Date().toISOString();await retry.click({timeout:T.short});
    const response=await responsePromise;const created=await response.json();
    const result:Record<string,unknown>={surface,priorRunId:prior.created.runId,oldStatus:oldRun.status,clickedAt,status:response.status(),created,beforeHistory:before,trigger:'visible error-card Retry button',wholeQaPass:false};
    await writeFile(join(dir,'manual-retry-observation.json'),JSON.stringify(result,null,2));
    expect(response.status()).toBe(202);
    await expect.poll(async()=>{const r=await fetch(runtime.url.daemon(`/api/runs/${created.runId}`),{headers,signal:AbortSignal.timeout(T.short)});const d=await r.json();result.terminal=d;await writeFile(join(dir,'manual-retry-observation.json'),JSON.stringify(result,null,2));return d.status;},{timeout:45000,intervals:[250,500]}).toMatch(/^(succeeded|failed|canceled)$/);
    await page.screenshot({path:join(dir,'after-manual-retry.png')});
    expect.soft(String((result.terminal as Record<string,unknown>).status),'Manual retry after Link release completes successfully').toMatch(/^(succeeded)$/);
    observations.push(result);
   }catch(e){await writeFile(join(dir,'attempt-error.json'),JSON.stringify({error:String(e),at:new Date().toISOString()}));expect.soft(false,`${surface}: ${String(e)}`).toBe(true);}
  }
 }finally{
  await page.close().catch(()=>{});await runtime.stopWeb(env);await writeFile(join(out,'owner-runtime-stopped.json'),JSON.stringify(await runtime.status(env),null,2));await writeFile(join(out,'surface-results.json'),JSON.stringify(observations,null,2));
 }
});
