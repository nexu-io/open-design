import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { clusterTest as test, expect } from '@/playwright/suite';
import { T } from '@/timeouts';

type Runtime = { root: string; webUrl: string; daemonUrl: string; apiUrl: string; preflightApiUrl: string; config: Record<string, unknown>; team: { workspaceId: string; workspaceMemberId: string } };
const manifest = process.env.OD_SEND_PREFLIGHT_RUNTIME;
const runtime: Runtime | null = manifest ? JSON.parse(await readFile(manifest, 'utf8')) : null;
test.skip(!runtime, 'Requires an isolated server-level send-preflight runtime fixture');
test.describe.configure({ timeout: T.xlong * 5 });

async function control(value: Record<string, unknown>) {
 const response = await fetch(`${runtime!.apiUrl}/__fixture/control`, { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value) });
 expect(response.ok).toBe(true);
 const modes:Record<string,string>={proceed:'available','404':'unsupported','503':'unavailable',insufficient_funds:'funds-reject',concurrency_full:'concurrency-reject','invalid-presentation':'invalid-presentation'};
 const mode=Number(value.delayMs)>=3000?'timeout':modes[String(value.verdict)]??'available';
 const upstream=await fetch(`${runtime!.preflightApiUrl}/__local__/control`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode})});
 expect(upstream.ok).toBe(true);
}
async function saveApiEvidence(name:string) {
 const evidence=await (await fetch(`${runtime!.preflightApiUrl}/__local__/evidence`)).json();
 await writeFile(join(runtime!.root,'evidence',`vela-${name}.json`),JSON.stringify(evidence,null,2));
 return evidence;
}
async function home(page: Page, options: { freshCredential?: boolean } = {}) {
 const config=options.freshCredential ? {...runtime!.config,agentCliEnv:{...runtime!.config.agentCliEnv as Record<string,unknown>,amr:{...(runtime!.config.agentCliEnv as Record<string,Record<string,string>>).amr,VELA_CONTROL_KEY:`synthetic-${randomUUID()}`}}} : runtime!.config;
 const response=await page.request.put(`${runtime!.daemonUrl}/api/app-config`,{data:config});expect(response.ok()).toBe(true);
 await page.addInitScript(({config,team})=>{
  localStorage.setItem('open-design:config',JSON.stringify(config));
  localStorage.setItem('open-design:locale','en');localStorage.setItem('open-design:locale-source','manual');
  sessionStorage.setItem('od.workspaceSelection.v1',JSON.stringify({workspaceId:team.workspaceId,workspaceMemberId:team.workspaceMemberId}));
 },{config,team:runtime!.team});
 await page.goto(runtime!.webUrl,{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('home-hero-input')).toBeVisible({timeout:T.xlong});
 await expect.poll(async()=>{const agents=await (await page.request.get(`${runtime!.daemonUrl}/api/agents`)).json();return agents.agents.find((a:{id:string})=>a.id==='amr')?.available;}).toBe(true);
}
function observe(page: Page) {
 const requests:Array<{path:string;body:Record<string,unknown>|null;startedAt:number;responseStatus?:number;elapsedMs?:number}>=[];
 const tracked=new Map<object,typeof requests[number]>();
 page.on('request',request=>{
  const path=new URL(request.url()).pathname;
  if(request.method()==='POST'&&(['/api/workspace/billing/send-preflight','/api/projects','/api/runs'].includes(path)||/^\/api\/runs\/[^/]+\/cancel$/.test(path))){
   const record={path,body:request.postDataJSON(),startedAt:Date.now()};requests.push(record);tracked.set(request,record);
  }
 });
 page.on('response',response=>{const record=tracked.get(response.request());if(record){record.responseStatus=response.status();record.elapsedMs=Date.now()-record.startedAt;}});
 return requests;
}
async function send(page:Page,prompt:string) {await page.getByTestId('home-hero-input').fill(prompt);await expect(page.getByTestId('home-hero-submit')).toBeEnabled();await page.getByTestId('home-hero-submit').click();}

for(const verdict of ['proceed','404','503','timeout'] as const) {
 test(`[P1] actual Home to Project optional preview ${verdict}`,async({page},info)=>{
  await control({verdict:verdict==='timeout'?'proceed':verdict,delayMs:verdict==='timeout'?3500:0,directoryFailures:0});
  const requests=observe(page);await home(page);
  const prompt=`send-preflight ${verdict} ${randomUUID()}`;
  await send(page,prompt);
  await expect.poll(()=>requests.filter(r=>r.path==='/api/runs').length,{timeout:T.xlong}).toBe(1);
  await expect(page.getByText('Hello from the e2e fake vela.',{exact:false}).first()).toBeVisible({timeout:T.xlong});
  expect(requests.filter(r=>r.path==='/api/workspace/billing/send-preflight')).toHaveLength(1);
  expect(requests.find(r=>r.path==='/api/projects')?.body?.workspaceTarget).toEqual({workspaceId:runtime!.team.workspaceId});
  expect(requests.find(r=>r.path==='/api/workspace/billing/send-preflight')?.body?.workspaceId).toBe(runtime!.team.workspaceId);
  const apiEvidence=await saveApiEvidence(verdict); expect(apiEvidence.calls).toHaveLength(1);
  expect(apiEvidence.mode).toBe(verdict==='404'?'unsupported':verdict==='503'?'unavailable':verdict==='timeout'?'timeout':'available');
  expect(requests.find(r=>r.path==='/api/workspace/billing/send-preflight')?.responseStatus).toBe(verdict==='proceed'?200:503);
  await info.attach('actual-network',{body:JSON.stringify(requests,null,2),contentType:'application/json'});
  await writeFile(join(runtime!.root,'evidence',`browser-${verdict}.json`),JSON.stringify(requests,null,2));
  await page.screenshot({path:join(runtime!.root,'evidence',`browser-${verdict}.png`)});
 });
}
for(const verdict of ['insufficient_funds','concurrency_full','invalid-presentation'] as const) {
 test(`[P1] actual Home ${verdict} preserves draft and file`,async({page},info)=>{
  await control({verdict,delayMs:0,directoryFailures:0});const requests=observe(page);await home(page);
  const prompt=`retain ${verdict} ${randomUUID()}`;
  await page.locator('input[type=file]').first().setInputFiles({name:'synthetic-brief.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic attachment; no personal data.')});
  await send(page,prompt);
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled({timeout:T.long});
  expect(requests.filter(r=>r.path==='/api/workspace/billing/send-preflight')).toHaveLength(1);
  expect(requests.filter(r=>r.path==='/api/projects'||r.path==='/api/runs')).toHaveLength(0);
  await expect(page.getByTestId('home-hero-input')).toHaveText(prompt);
  await expect(page.getByText('synthetic-brief.txt',{exact:true}).first()).toBeVisible();
  const apiEvidence=await saveApiEvidence(verdict);expect(apiEvidence.calls).toHaveLength(1);
  await info.attach('rejected-network',{body:JSON.stringify(requests,null,2),contentType:'application/json'});
  await writeFile(join(runtime!.root,'evidence',`browser-${verdict}.json`),JSON.stringify(requests,null,2));
  await page.screenshot({path:join(runtime!.root,'evidence',`browser-${verdict}.png`)});
 });
}

test('[P1] selected Team survives a failed display directory read and binds the real create',async({page})=>{
 await control({verdict:'proceed',delayMs:0,directoryFailures:100});
 const requests=observe(page);const directoryStatuses:number[]=[];
 page.on('response',response=>{if(new URL(response.url()).pathname==='/api/workspace/directory')directoryStatuses.push(response.status());});
 await home(page,{freshCredential:true});
 await expect.poll(async()=>{if(!directoryStatuses.includes(503))await page.reload({waitUntil:'domcontentloaded'});return directoryStatuses.includes(503);},{timeout:T.long,intervals:[1000,2000]}).toBe(true);
 await control({verdict:'proceed',delayMs:0,directoryFailures:0});
 await send(page,`target-only ${randomUUID()}`);
 await expect.poll(()=>requests.filter(r=>r.path==='/api/runs').length,{timeout:T.xlong}).toBe(1);
 const create=requests.find(r=>r.path==='/api/projects')!;
 expect(create.body?.workspaceTarget).toEqual({workspaceId:runtime!.team.workspaceId});
 const requestId=String(create.body?.id);
 const response=await page.request.get(`${runtime!.daemonUrl}/api/projects/${requestId}`,{headers:{'x-od-workspace-id':runtime!.team.workspaceId,'x-od-workspace-member-id':runtime!.team.workspaceMemberId}});
 expect(response.ok()).toBe(true);expect((await response.json()).project.workspaceId).toBe(runtime!.team.workspaceId);
 await writeFile(join(runtime!.root,'evidence','browser-target-directory-failure.json'),JSON.stringify({directoryStatuses,requests},null,2));
 await saveApiEvidence('target-directory-failure');
 await page.screenshot({path:join(runtime!.root,'evidence','browser-target-directory-failure.png')});
});
for(const change of ['model','account-boundary'] as const){
 test(`[P1] real browser cancels delayed Home send after ${change}`,async({page})=>{
  await control({verdict:'proceed',delayMs:3500,directoryFailures:0});const requests=observe(page);await home(page);
  const prompt=`cancel ${change} ${randomUUID()}`;await send(page,prompt);
  await expect.poll(()=>requests.filter(r=>r.path==='/api/workspace/billing/send-preflight').length).toBe(1);
  if(change==='model'){
   await page.getByRole('button',{name:'OpenDesign · glm-5',exact:true}).click();
   await page.getByText('glm-5-alt',{exact:true}).click();
  }else{
   const other=await page.context().newPage();await other.goto(runtime!.webUrl);
   await other.evaluate(()=>localStorage.setItem('od.workspaceContext.refreshAt',`synthetic-account-${Date.now()}`));await other.close();
  }
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled({timeout:T.long});
  await expect(page.getByTestId('home-hero-input')).toHaveText(prompt);
  await expect.poll(async()=>{const e=await saveApiEvidence(`cancel-${change}`);return e.calls[0]?.elapsedMs??0;},{timeout:T.long}).toBeGreaterThan(3000);
  expect(requests.filter(r=>r.path==='/api/projects'||r.path==='/api/runs')).toHaveLength(0);
  expect(requests.filter(r=>r.path==='/api/workspace/billing/send-preflight')).toHaveLength(1);
  await writeFile(join(runtime!.root,'evidence',`browser-cancel-${change}.json`),JSON.stringify(requests,null,2));
  await page.screenshot({path:join(runtime!.root,'evidence',`browser-cancel-${change}.png`)});
 });
}

test('[P1] actual queued Send now rejects before stopping, then reuses one preview on manual retry',async({page})=>{
 await control({verdict:'proceed',delayMs:0,directoryFailures:0});
 await writeFile(join(runtime!.root,'agent-delay.json'),JSON.stringify({delayMs:60_000}));
 const requests=observe(page);await home(page);await send(page,`running before queue ${randomUUID()}`);
 await expect.poll(()=>requests.filter(r=>r.path==='/api/runs').length,{timeout:T.xlong}).toBe(1);
 await expect(page.getByTestId('chat-composer-input')).toBeVisible();
 const queued=`manual queued ${randomUUID()}`;
 await page.getByTestId('chat-composer-input').fill(queued);await page.getByTestId('chat-send').click();
 await expect(page.getByTestId('chat-queued-send-strip')).toContainText(queued);
 expect(requests.filter(r=>r.path==='/api/workspace/billing/send-preflight')).toHaveLength(1);
 await saveApiEvidence('queue-first-run');
 await control({verdict:'insufficient_funds',delayMs:0,directoryFailures:0});
 await page.getByTestId('chat-queued-send-strip').hover();
 await page.getByTestId('chat-queued-send-steer').click();
 await expect.poll(()=>requests.filter(r=>r.path==='/api/workspace/billing/send-preflight').length).toBe(2);
 await expect(page.getByText('Your workspace is out of allowance.',{exact:false}).first()).toBeVisible();
 expect(requests.filter(r=>r.path==='/api/runs')).toHaveLength(1);
 expect(requests.filter(r=>r.path.endsWith('/cancel'))).toHaveLength(0);
 await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeVisible();
 await saveApiEvidence('queue-rejected-before-stop');
 await page.screenshot({path:join(runtime!.root,'evidence','browser-queue-rejected-before-stop.png')});
 await writeFile(join(runtime!.root,'agent-delay.json'),JSON.stringify({delayMs:0}));
 await control({verdict:'proceed',delayMs:0,directoryFailures:0});
 await page.getByTestId('chat-queued-send-strip').hover();await page.getByTestId('chat-queued-send-steer').click();
 await expect.poll(()=>requests.filter(r=>r.path==='/api/runs').length,{timeout:T.xlong}).toBe(2);
 expect(requests.filter(r=>r.path==='/api/workspace/billing/send-preflight')).toHaveLength(3);
 await expect.poll(()=>requests.filter(r=>r.path.endsWith('/cancel')).length).toBe(1);
 const evidence=await saveApiEvidence('queue-manual-send-now');expect(evidence.calls).toHaveLength(1);
 await writeFile(join(runtime!.root,'evidence','browser-queue-send-now.json'),JSON.stringify(requests,null,2));
 await page.screenshot({path:join(runtime!.root,'evidence','browser-queue-send-now.png')});
});
