import { expect, test } from '@/playwright/suite';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '../lib/playwright/amr.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
const out = resolve(import.meta.dirname,'../../.tmp/ui-audit/final-design-review/current');
const captureRun = new Date().toISOString().replace(/[:.]/g, '-');
test.use({ viewport:{width:1440,height:900},deviceScaleFactor:2,colorScheme:'light',locale:'zh-CN' });
async function save(page:Page,id:string,observedState:string,detail:Record<string,unknown>={}){
  if (!new Set(['G1','G2','S1','S2','S3','S4','S4-C','S7','S9','S9-R','S10','S12','S15','C0','K2','K5','P1','S0','S1-T','S1-T2','S4-T','S14','S14-ERR']).has(id)) return;
  const captureId=`Owner-${id}-${captureRun}`;
  await mkdir(out,{recursive:true});
  const elements=await page.locator('body').evaluate(node=>[node,...Array.from(node.querySelectorAll('h1,h2,h3,button,[role="menu"],[role="menuitem"],[role="status"], [data-testid="artifact-card-publish-index.html"]')).slice(0,80)].map((el,index)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {index,tag:el.tagName.toLowerCase(),text:(el.textContent??'').trim().slice(0,160),disabled:el instanceof HTMLButtonElement?el.disabled:undefined,title:el.getAttribute('title')??undefined,style:{color:s.color,backgroundColor:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,borderRadius:s.borderRadius,boxShadow:s.boxShadow,width:r.width,height:r.height,padding:s.padding,margin:s.margin}}}));
  await page.screenshot({path:resolve(out,`${captureId}.png`),animations:'disabled'});
  await writeFile(resolve(out,`${captureId}.json`),JSON.stringify({id:captureId,capturedAt:new Date().toISOString(),source:'current-playwright-mocked',mockBoundary:'Local Playwright route mocks and fixture-backed local daemon data; not a real Vela/share-service delivery or real-account state.',observedState,viewport:page.viewportSize(),text:await page.locator('body').innerText(),elements,...detail},null,2));
}
test('capture isolated OD share entry, progress and failure states',async({page})=>{
  test.setTimeout(120_000);
  await page.addInitScript(()=>{localStorage.setItem('open-design:locale','zh-CN');localStorage.setItem('open-design:locale-source','manual');});
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/projects/*/workspace-scope',async r=>{const id=new URL(r.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];await r.fulfill({json:{scope:{kind:'personal',projectId:id,workspaceId:AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,visibility:'personal',context:AMR_PERSONAL_WORKSPACE_CONTEXT}}});});
  const projectId=`ui-audit-${Date.now()}`;
  const response=await page.request.post('/api/projects',{data:{id:projectId,name:'UI audit isolated fixture',skillId:null,designSystemId:null,metadata:{kind:'prototype',nameSource:'user'}}});
  expect(response.ok(),await response.text()).toBeTruthy();
  const {conversationId}=await response.json() as {conversationId:string};
  const content='<!doctype html><html lang="zh-CN"><body><main><h1 data-od-id="audit-target">审计产物</h1><p data-od-id="audit-own-target">Owner 注释区域</p></main></body></html>';
  const file=await page.request.post(`/api/projects/${projectId}/files`,{data:{name:'index.html',content,artifactManifest:{version:1,kind:'html',title:'index.html',entry:'index.html',renderer:'html',exports:['html']}}});
  expect(file.ok(),await file.text()).toBeTruthy();
  await page.route(`**/api/projects/${projectId}/files/index.html/share-plan`,r=>r.request().method()==='POST'?r.fulfill({json:{fileCount:1,totalBytes:content.length,exceedsSizeLimit:false,exclusions:[]}}):r.fallback());
  const now=Date.now();
  const message=await page.request.put(`/api/projects/${projectId}/conversations/${conversationId}/messages/ui-audit-assistant`,{data:{id:'ui-audit-assistant',role:'assistant',content:'已生成产物。',runStatus:'succeeded',startedAt:now-2000,endedAt:now-1000,createdAt:now-1500,events:[{kind:'tool_use',id:'write-index',name:'Write',input:{file_path:`/project/${projectId}/index.html`,content}},{kind:'tool_result',toolUseId:'write-index',content:'ok',isError:false},{kind:'text',text:'已生成产物。'},{kind:'artifact_focus',show:['index.html']}],producedFiles:[{name:'index.html',path:'index.html',localPath:`/project/${projectId}/index.html`,type:'file',size:content.length,mtime:now-1000,kind:'html',mime:'text/html'}]}});
  expect(message.ok(),await message.text()).toBeTruthy();
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  const card=page.getByTestId('artifact-card-publish-index.html');
  await expect(card).toBeVisible({timeout:20000});
  await save(page,'G1-entry','G1-entry');
  // G1 is the global top-right Share entry, not the artifact-card shortcut.
  await page.goto(`/projects/${projectId}/files/index.html`);
  const g1ToolbarShare=page.getByTestId('file-workspace').getByRole('button',{name:'分享',exact:true});
  await expect(g1ToolbarShare).toBeVisible();
  await g1ToolbarShare.click();
  const g1ToolbarMenu=page.locator('.share-menu-popover[role="menu"]');
  await expect(g1ToolbarMenu).toBeVisible();
  await save(page,'G1','G1',{entry:'file-workspace top-right share button'});
  await g1ToolbarMenu.getByRole('button',{name:/关闭|Close/}).click();
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expect(card).toBeVisible();
  await card.click();
  const menu=page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByText(/快速分享|分享至社交|Quick share|Social share/)).toHaveCount(0);
  await save(page,'S1','S1');
  const more=menu.getByRole('button',{name:/更多分享方式|More sharing options/});
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.getByRole('menu',{name:/更多分享方式|More sharing options/})).toBeVisible();
  await save(page,'S12','S12');
  await page.keyboard.press('Escape');
  const publish=menu.getByRole('menuitem').filter({hasText:/链接|复制/}).first();
  await expect(publish).toBeVisible();
  let release!:()=>void; const gate=new Promise<void>(res=>{release=res;});
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`,async r=>{if(r.request().method()!=='POST')return r.continue();await gate;await r.fulfill({status:500,json:{error:'ui_audit_mock_failure'}});});
  await publish.click();
  try{await expect(menu.getByRole('progressbar')).toBeVisible();await save(page,'S2','S2');}finally{release();}
  await expect(menu.getByRole('status')).toBeVisible();
  await save(page,'S7','S7');
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`,async r=>{if(r.request().method()!=='POST')return r.continue();await r.fulfill({status:413,json:{error:{code:'too_large',message:'Content too large'}}});});
  await menu.getByRole('menuitem').filter({hasText:/重试|Retry/}).first().click();
  await expect(menu.getByRole('status')).toContainText(/超过.*MiB.*上限|too large|size limit/i);
  await save(page,'S15','S15');
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.resolve()}});});
  const url=`https://example.test/artifact/${projectId}/ui-audit-link`;
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`,async r=>{if(r.request().method()!=='POST')return r.continue();await r.fulfill({json:{url,slug:'ui-audit-link',fileName:'index.html'}});});
  const retry=menu.getByRole('menuitem').filter({hasText:/重试|Retry/}).first();
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(menu.locator('.chrome-publish-url')).toHaveText(url);
  await expect(menu.getByRole('status')).toHaveCount(0);
  await save(page,'S3','S3');
  await page.waitForTimeout(1900);
  await expect(menu.locator('.chrome-publish-url')).toHaveText(url);
  await save(page,'S4','S4');
  await menu.getByRole('button',{name:/关闭|Close/}).click();
  await save(page,'G2-entry','G2-entry');
  await card.click();
  await expect(menu.locator('.chrome-publish-url')).toHaveText(url);
  await save(page,'G2','G2');
  await more.click();
  await expect(page.getByRole('menu',{name:/更多分享方式|More sharing options/})).toBeVisible();
  await save(page,'S12','S12');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise<void>(resolve=>window.addEventListener('ui-audit-release-copy',()=>resolve(),{once:true}))}});});
  const copy=menu.getByRole('button',{name:/复制链接|Copy share link/});
  await copy.click();
  await expect(menu.getByRole('button',{name:/复制中|Copying/})).toBeVisible();
  await save(page,'S4-C-pending','S4-C-pending');
  await page.evaluate(()=>window.dispatchEvent(new Event('ui-audit-release-copy')));
  await expect(menu.getByRole('button',{name:/已复制|Copied/})).toBeVisible();
  await save(page,'S4-C','S4-C');
  await page.waitForTimeout(2000);
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('clipboard denied by audit fixture'))}});document.execCommand=()=>false;});
  await copy.click();
  await expect(menu.getByRole('status')).toBeVisible();
  await save(page,'S11','S11');
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`,async r=>{if(r.request().method()!=='DELETE')return r.continue();await r.fulfill({status:500,json:{error:'ui_audit_mock_stop_failure'}});});
  await menu.getByRole('switch',{name:/链接访问|Link access/}).click();
  await expect(menu.getByRole('status')).toContainText(/停止|关闭|stop/i);
  await save(page,'S10','S10');
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`,async r=>{if(r.request().method()!=='DELETE')return r.continue();await r.fulfill({json:{slug:'ui-audit-link'}});});
  await menu.getByRole('switch',{name:/链接访问|Link access/}).click();
  await expect(menu.locator('.chrome-publish-url')).toHaveCount(0);
  await save(page,'S9','S9');
  let reopen!:()=>void;const reopening=new Promise<void>(res=>{reopen=res;});
  let markRequestStarted!:()=>void;const requestStarted=new Promise<void>(res=>{markRequestStarted=res;});
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`,async r=>{if(r.request().method()!=='POST')return r.continue();markRequestStarted();await reopening;await r.fulfill({json:{url,slug:'ui-audit-link',fileName:'index.html'}});});
  await menu.getByRole('menuitem').filter({hasText:/生成并复制链接|Generate and copy|重新开启|Resume/}).first().click();
  try {await requestStarted;await save(page,'S9-R','S9-R');}finally{reopen();}
  await expect(menu.locator('.chrome-publish-url')).toHaveText(url);
  await page.goto(`/projects/${projectId}/files/index.html`);
  const toolbarShare=page.getByTestId('file-workspace').getByRole('button',{name:'分享',exact:true});
  const comments=page.getByTestId('comment-panel-toggle');
  await expect(comments).toBeVisible();
  await expect(toolbarShare).toBeVisible();
  if(await toolbarShare.isDisabled()) await save(page,'E0-pending','E0-pending');
  await expect(toolbarShare).toBeEnabled();
  await save(page,'E0','E0');
  await comments.click();
  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  await expect(page.getByTestId('comment-side-item')).toHaveCount(0);
  await save(page,'R1','R1');
  // Install the external read fixture only AFTER recording R1's real empty state.
  // Re-enter the same file to force the production read path without changing daemon comments.
  const commentUrl = `**/api/projects/${projectId}/conversations/${conversationId}/comments`;
  let auditExcludeOnly=false;
  let auditEmptyName=false;
  let auditDuplicateAuthor=false;
  let auditPalette=false;
  const o8Keys='0019,0029,0039,0049,0059,0069,0079,0089,0099,000a,000b,000c,000d,000e,000f,001f,002f,003f,004f,005f,0000,0001,0002,0003,0004,0005,0006,0007,0008,0009'.split(',').map(suffix=>'a'.repeat(60)+suffix);
  let auditHandled=false;
  await page.route(commentUrl, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    if(auditPalette) return route.fulfill({json:{comments:o8Keys.map((authorKey,index)=>({
      id:`o8-${index}`,projectId,conversationId,filePath:'index.html',elementId:'audit-target',selector:'main h1',label:'标题',text:'审计产物',position:{x:0.25,y:0.25,width:0.5,height:0.1},note:`调色板第 ${index} 色`,status:'open',authorKind:'user',authorKey,authorDisplayName:`色号 ${index}`,createdAt:now-500+index,updatedAt:now-500+index,
    }))}});
    if(auditHandled) return route.fulfill({json:{comments:[
      {id:'ui-audit-external-comment',projectId,conversationId,filePath:'index.html',elementId:'audit-target',note:'来自外部访客的审计评论',status:'resolved',authorKind:'user',authorKey:'ui-audit-visitor',createdAt:now-500,updatedAt:Date.now()},
      {id:'ui-audit-own-comment',projectId,conversationId,filePath:'index.html',elementId:'audit-own-target',selector:'main p',label:'Owner 注释区域',text:'Owner 注释区域',position:{x:0.2,y:0.4,width:0.5,height:0.1},note:'Owner 的审计评论',status:'open',createdAt:now-900,updatedAt:now-900},
    ]}});
    if(auditDuplicateAuthor) return route.fulfill({json:{comments:['First keyed comment','Second keyed comment'].map((note,index)=>({
      id:`o5-${index}`,projectId,conversationId,filePath:'index.html',elementId:'audit-target',selector:'main h1',label:'标题',text:'审计产物',
      position:{x:0.25,y:0.25,width:0.5,height:0.1},note,status:'open',authorKind:'user',authorKey:'a'.repeat(64),authorDisplayName:'Shared author',
      createdAt:now-700+index,updatedAt:now-700+index,
    }))}});
    if(auditExcludeOnly) return route.fulfill({json:{comments:[
      {id:'audit-own-current',projectId,conversationId,filePath:'index.html',elementId:'audit-own-target',selector:'main p',label:'Owner 注释区域',text:'Owner 注释区域',position:{x:0.2,y:0.4,width:0.5,height:0.1},note:'自己写的新评论',status:'open',authorMemberId:AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceMemberId,createdAt:Date.now()+1000,updatedAt:Date.now()+1000},
      {id:'audit-older-external',projectId,conversationId,filePath:'index.html',elementId:'audit-target',selector:'main h1',label:'标题',text:'审计产物',position:{x:0.25,y:0.25,width:0.5,height:0.1},note:'已读旧评论',status:'open',authorKind:'user',authorKey:'older-visitor',createdAt:now-900,updatedAt:now-900},
      {id:'audit-other-file',projectId,conversationId,filePath:'other.html',elementId:'other-target',selector:'h1',label:'其他文件',text:'其他文件',position:{x:0.2,y:0.2,width:0.5,height:0.1},note:'其他文件的新评论',status:'open',authorKind:'user',authorKey:'other-file-visitor',createdAt:Date.now()+1000,updatedAt:Date.now()+1000},
      {id:'audit-handled',projectId,conversationId,filePath:'index.html',elementId:'audit-target',selector:'main h1',label:'标题',text:'审计产物',position:{x:0.25,y:0.25,width:0.5,height:0.1},note:'已处理的新评论',status:'resolved',authorKind:'user',authorKey:'handled-visitor',createdAt:Date.now()+1000,updatedAt:Date.now()+1000},
    ]}});
    await route.fulfill({ json: { comments: [{
      id: 'ui-audit-external-comment', projectId, conversationId, filePath: 'index.html',
      elementId: 'audit-target', selector: 'main h1', label: '标题', text: '审计产物',
      position: { x: 0.25, y: 0.25, width: 0.5, height: 0.1 }, htmlHint: '<h1 data-od-id="audit-target">审计产物</h1>',
      note: '来自外部访客的审计评论', status: 'open', createdAt: now - 500, updatedAt: now - 500,
      authorKind: 'user', authorAppUserId: 'ui-audit-visitor', authorDisplayName: auditEmptyName ? '' : '外部访客', authorKey: 'ui-audit-visitor',
    }, {
      id: 'ui-audit-own-comment', projectId, conversationId, filePath: 'index.html',
      elementId: 'audit-own-target', selector: 'main p', label: 'Owner 注释区域', text: 'Owner 注释区域',
      position: { x: 0.2, y: 0.4, width: 0.5, height: 0.1 }, htmlHint: '<p data-od-id="audit-own-target">Owner 注释区域</p>',
      note: 'Owner 的审计评论', status: 'open', createdAt: now - 900, updatedAt: now - 900,
    }] } });
  });
  let auditLastReadAt: number | undefined;
  let auditCanAcknowledge=false;
  await page.route(`**/api/projects/${projectId}/comments/read`,async r=>{
    if(r.request().method()==='PUT'&&!auditCanAcknowledge) return r.fulfill({status:503,json:{error:'ui_audit_read_failure'}});
    if(r.request().method()==='PUT') auditLastReadAt=Date.now();
    await r.fulfill({json:{projectId,...(auditLastReadAt===undefined?{}:{lastReadAt:auditLastReadAt})}});
  });
  await page.reload();
  await expect(page.getByTestId('comment-unread-dot')).toBeVisible();
  await save(page,'C0','C0');
  await save(page,'R2','R2');
  await comments.click();
  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  await expect(page.getByTestId('comment-unread-dot')).toHaveCount(0);
  await page.getByTestId('comment-side-panel').locator('.comment-side-collapse').click();
  await expect(page.getByTestId('comment-side-collapsed-rail')).toBeVisible();
  await expect(page.getByTestId('comment-rail-unread-dot')).toBeVisible();
  await save(page,'R3','R3');
  auditCanAcknowledge=true;
  await page.getByTestId('comment-side-collapsed-rail').click();
  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  await page.getByTestId('comment-side-panel').locator('.comment-side-collapse').click();
  await expect(page.getByTestId('comment-side-collapsed-rail')).toBeVisible();
  await expect(page.getByTestId('comment-rail-unread-dot')).toHaveCount(0);
  await expect(page.getByTestId('comment-unread-dot')).toHaveCount(0);
  await save(page,'R4','R4');
  await page.getByTestId('comment-side-collapsed-rail').click();
  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  const externalComment = page.getByTestId('comment-side-item').filter({ hasText: '来自外部访客的审计评论' });
  await expect(externalComment).toHaveCount(1);
  await expect(externalComment).toContainText('外部访客');
  await save(page,'K6','K6');
  await externalComment.getByRole('button',{name:/选择|Select/}).click();
  const sendToChat = page.getByTestId('comment-side-send-claude');
  await expect(sendToChat).toBeVisible();
  await expect(sendToChat).toBeEnabled();
  await save(page,'K7','K7');
  // OP4 is the Owner permission slice of this same selected external-comment state.
  await save(page,'OP4','OP4');
  await page.getByTestId('comment-side-selectbar').getByRole('button',{name:/清除|Clear/}).click();
  await expect(sendToChat).toHaveCount(0);
  await externalComment.click();
  const externalPopover=page.getByTestId('comment-popover');
  await expect(externalPopover).toBeVisible();
  await expect(externalPopover).toContainText('来自外部访客的审计评论');
  await save(page,'OP2','OP2');
  // Cross-end O3: OD half of an external visitor comment; Vela half is required before completion.
  await save(page,'O3-OD','O3-OD');
  await page.reload();
  if (!(await page.getByTestId('comment-side-panel').isVisible())) await comments.click();
  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  const ownComment=page.getByTestId('comment-side-item').filter({hasText:'Owner 的审计评论'});
  await expect(ownComment).toHaveCount(1);
  await ownComment.click();
  await expect(page.getByTestId('comment-popover-input')).toHaveValue('Owner 的审计评论');
  await save(page,'OP1','OP1');
  // Cross-end O2: OD half of the same owner-authored comment; not a combined-state frame.
  await save(page,'O2-OD','O2-OD');
  await save(page,'O6-OD','O6-OD',{ownerComment:'Owner 的审计评论',mockProvenance:'GET-only local fixture; not actual share-page delivery'});
  // O4 replacement only: an empty authorDisplayName models an abnormal legacy
  // read. Normal writes snapshot name || email on the server (UI-028 correction);
  // this screenshot is never O4 target-state or real-account evidence.
  auditEmptyName=true;
  await page.reload();
  if (!(await page.getByTestId('comment-side-panel').isVisible())) await comments.click();
  const unnamedComment=page.getByTestId('comment-side-item').filter({hasText:'来自外部访客的审计评论'});
  await expect(unnamedComment).toHaveCount(1);
  await unnamedComment.click();
  await save(page,'O4-OD','O4-OD');
  auditEmptyName=false;
  auditDuplicateAuthor=true;
  await page.reload();
  if (!(await page.getByTestId('comment-side-panel').isVisible())) await comments.click();
  const keyedComments=page.getByTestId('comment-side-item');
  await expect(keyedComments).toHaveCount(2);
  const avatarColors=await keyedComments.locator('.comment-side-avatar').evaluateAll(avatars=>avatars.map(node=>getComputedStyle(node).backgroundColor));
  expect(avatarColors).toHaveLength(2);
  expect(avatarColors[0]).toBe(avatarColors[1]);
  const clientPins=page.locator('.comment-saved-pin');
  await expect(clientPins).toHaveCount(2);
  const pinColors=await clientPins.evaluateAll(pins=>pins.map(node=>getComputedStyle(node).backgroundColor));
  expect(pinColors).toEqual(['rgb(217, 106, 70)','rgb(217, 106, 70)']);
  await save(page,'O5-OD','O5-OD',{avatarColors,pinColors,authorKey:'a'.repeat(64)});
  auditDuplicateAuthor=false;
  auditPalette=true;
  await page.setViewportSize({width:1440,height:3500});
  await page.reload();
  if (!(await page.getByTestId('comment-side-panel').isVisible())) await comments.click();
  const swatchRows=page.getByTestId('comment-side-item');
  await expect(swatchRows).toHaveCount(30);
  const displayedIndexes=await swatchRows.evaluateAll(rows=>rows.map(row=>{
    const match=row.textContent?.match(/调色板第 (\d+) 色/);
    if (!match) throw new Error('Missing O8 displayed row index');
    return Number(match[1]);
  }));
  expect(displayedIndexes).toEqual(Array.from({length:30},(_,i)=>29-i));
  const palette=await swatchRows.evaluateAll(rows=>rows.map(row=>{
    const match=row.textContent?.match(/调色板第 (\d+) 色/);
    const avatar=row.querySelector('.comment-side-avatar');
    if (!match||!avatar) throw new Error('Missing O8 author palette row/avatar');
    return {index:Number(match[1]),color:getComputedStyle(avatar).backgroundColor};
  }).sort((a,b)=>a.index-b.index));
  expect(new Set(palette.map(item=>item.color)).size).toBe(30);
  await save(page,'O8-OD','O8-OD',{palette,keys:o8Keys,displayedIndexes,apiInputOrder:'ascending'});
  auditPalette=false;
  await page.setViewportSize({width:1440,height:900});
  auditHandled=true;
  await page.reload();
  if (!(await page.getByTestId('comment-side-panel').isVisible())) await comments.click();
  await expect(page.getByTestId('comment-side-item')).toHaveCount(1);
  await expect(page.getByTestId('comment-side-item')).toContainText('Owner 的审计评论');
  await expect(page.getByText('来自外部访客的审计评论')).toHaveCount(0);
  await save(page,'OP5','OP5',{fixtureExternalStatus:'resolved',mutation:'none; GET-only after state'});
  auditHandled=false;
  await page.reload();
  if (!(await page.getByTestId('comment-side-panel').isVisible())) await comments.click();
  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  // Prior publish/unpublish actions are local mocks; seed the authoritative
  // per-file GET projection that makes the owner banner a real rendered UI state.
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`,r=>r.request().method()==='GET'
    ?r.fulfill({json:{status:'active',freshness:'current',publication:{url,slug:'ui-audit-link',fileName:'index.html'}}})
    :r.fallback());
  await page.route(`**/api/projects/${projectId}/comment-sync-state*`,r=>r.request().method()==='GET'?r.fulfill({json:{pending:0,sessionMissing:false,lastError:'backfill_failed',shareStopped:false,backfill:{state:'failed',filePath:'index.html',publicationRevision:'ui-audit-publication-revision',retryable:true}}}):r.fallback());
  await page.reload();
  const syncShareButton=page.getByTestId('file-workspace').getByRole('button',{name:'分享',exact:true});
  await expect(syncShareButton).toBeEnabled();
  const failedBackfillRead=page.waitForResponse(r=>r.url().includes(`/api/projects/${projectId}/comment-sync-state`)&&r.request().method()==='GET'&&r.ok());
  await syncShareButton.click();
  await expect(page.locator('.share-menu-popover[role="menu"]')).toBeVisible();
  await failedBackfillRead;
  const backfillBanner=page.getByRole('status').filter({hasText:/已有评论还没同步|评论.*同步/}).first();
  await expect(backfillBanner).toBeVisible();
  await expect(backfillBanner).toContainText('已有评论暂未同步，访客暂时看不到。正在后台自动重试。');
  await save(page,'K2','K2',{backfill:{state:'failed',retryable:true,filePath:'index.html'},provenance:'GET-only local UI fixture'});
  // This same failed-backfill response follows the scripted stop → re-enable (S9-R).
  await save(page,'K5','K5');
  await page.unroute(`**/api/projects/${projectId}/comment-sync-state*`);
  // K8 is not captured here: ShareTab mounts this banner with backfillOnly,
  // which intentionally suppresses sessionMissing; its owner-wide banner has
  // a different host surface and must not be represented by this fixture.
  auditExcludeOnly=true;
  await page.reload();
  await expect(page.getByTestId('comment-panel-toggle')).toHaveAttribute('aria-label','评论 (2)');
  await expect(page.getByTestId('comment-unread-dot')).toHaveCount(0);
  await save(page,'R6','R6');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.route(`**/api/projects/${projectId}/share-state`,r=>r.fulfill({json:{projectId,hasEverShared:true,bindingExists:true,publications:[{sourceFilePath:'index.html',slug:'ui-audit-link',status:'active'}]}}));
  await page.getByTestId('workspace-tabs-dropdown-trigger').click();
  const row=page.getByTestId('workspace-tabs-dropdown').locator('.workspace-tabs-dropdown__row').filter({hasText:'UI audit isolated fixture'}).first();
  await expect(row).toBeVisible();
  await row.getByTestId('workspace-tabs-dropdown-row-more').click();
  await page.getByTestId('workspace-tabs-dropdown-row-menu').getByRole('menuitem',{name:/删除|Delete/}).click();
  const confirm=page.getByTestId('project-delete-confirm-dialog');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(/分享|链接/);
  await save(page,'S14','S14');
  await page.getByTestId('project-delete-confirm-cancel').click();
  await expect(confirm).toHaveCount(0);
  // This intercept simulates the daemon's durable pending-stop outcome; it never sends DELETE.
  await page.route(`**/api/projects/${projectId}`,r=>r.request().method()==='DELETE'?r.fulfill({json:{shareResiduals:[{filePath:'index.html',slug:'ui-audit-link',retrying:false}]}}):r.fallback());
  await page.getByTestId('workspace-tabs-dropdown-trigger').click();
  const deleteRow=page.getByTestId('workspace-tabs-dropdown').locator('.workspace-tabs-dropdown__row').filter({hasText:'UI audit isolated fixture'}).first();
  await deleteRow.getByTestId('workspace-tabs-dropdown-row-more').click();
  await page.getByTestId('workspace-tabs-dropdown-row-menu').getByRole('menuitem',{name:/删除|Delete/}).click();
  await page.getByTestId('project-delete-confirm-accept').click();
  await expect(page.getByRole('alert').filter({hasText:'ui-audit-link'})).toBeVisible();
  await save(page,'S14-ERR','S14-ERR');
});
test('capture updated owner G1 portal and S12 deployment submenu',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('open-design:locale','zh-CN');localStorage.setItem('open-design:locale-source','manual');});
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/projects/*/workspace-scope',async r=>{const id=new URL(r.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];await r.fulfill({json:{scope:{kind:'personal',projectId:id,workspaceId:AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,visibility:'personal',context:AMR_PERSONAL_WORKSPACE_CONTEXT}}});});
  const projectId='ui-audit-owner-overlay-'+Date.now();
  const response=await page.request.post('/api/projects',{data:{id:projectId,name:'Owner overlay capture fixture',skillId:null,designSystemId:null,metadata:{kind:'prototype',nameSource:'user'}}});
  expect(response.ok(),await response.text()).toBeTruthy();
  const content='<!doctype html><html lang="zh-CN"><body><main><h1>Owner overlay fixture</h1></main></body></html>';
  const file=await page.request.post('/api/projects/'+projectId+'/files',{data:{name:'index.html',content,artifactManifest:{version:1,kind:'html',title:'index.html',entry:'index.html',renderer:'html',exports:['html']}}});
  expect(file.ok(),await file.text()).toBeTruthy();
  await page.route(`**/api/projects/${projectId}/files/index.html/share-plan`,r=>r.request().method()==="POST"?r.fulfill({json:{fileCount:1,totalBytes:content.length,exceedsSizeLimit:false,exclusions:[]}}):r.fallback());
  await page.goto('/projects/'+projectId+'/files/index.html');
  const share=page.getByTestId('file-workspace').getByRole('button',{name:'分享',exact:true});
  await expect(share).toBeVisible();
  await share.click();
  const menu=page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  const geometry=await menu.evaluate(el=>{const r=el.getBoundingClientRect();let node:Element|null=el;while(node&&node!==document.body)node=node.parentElement;const parent=el.parentElement;return {portal:node===document.body,rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},viewport:{width:innerWidth,height:innerHeight},dialog:el.closest('[role="dialog"]')?.getBoundingClientRect().toJSON()??null,parentTag:parent?.tagName.toLowerCase(),parentClass:parent?.getAttribute('class'),parentOverflow:getComputedStyle(parent!).overflow,zIndex:getComputedStyle(el).zIndex}});
  expect(geometry.portal,'share popup must be in a body portal, outside any dialog').toBe(true);
  expect(geometry.dialog,'share popup must not be trapped inside the right dialog').toBeNull();
  expect(geometry.rect.x+geometry.rect.width).toBeLessThanOrEqual(geometry.viewport.width);
  expect(await page.getByRole('alert').filter({hasText:/could not be checked|未能检查|无法检查/}).count()).toBe(0);
  await save(page,'G1','G1',{entry:'file-workspace top-right share button',geometry});
  const more=menu.getByRole('button',{name:/更多分享方式|More sharing options/});
  await expect(more).toBeVisible();
  await more.click();
  const submenu=page.getByRole('menu',{name:/更多分享方式|More sharing options/});
  await expect(submenu).toBeVisible();
  const bounds=await submenu.evaluate(el=>{const r=el.getBoundingClientRect();let node:Element|null=el;while(node&&node!==document.body)node=node.parentElement;const parent=el.parentElement;return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,viewport:{width:innerWidth,height:innerHeight},parentOverflow:getComputedStyle(parent!).overflow,portal:node===document.body,zIndex:getComputedStyle(el).zIndex}});
  expect(bounds.portal,'deployment submenu must be in a body portal').toBe(true);
  expect(bounds.right<=geometry.rect.x||bounds.x>=geometry.rect.x+geometry.rect.width,'submenu must sit outside the share panel').toBe(true);
  expect(await submenu.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'submenu must be hit-testable in front of the page').toBe(true);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport.width);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport.height);
  await save(page,'S12','S12',{geometry:bounds});
});
test('capture first-export share guide and ever-shared exclusion P1 EX0',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('open-design:locale','zh-CN');localStorage.setItem('open-design:locale-source','manual');});
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/integrations/vela/status*',r=>r.fulfill({json:{loggedIn:true,profile:'test',configPath:'',user:{id:'ui-audit-export-account',email:'fixture@example.invalid'}}}));
  await page.route('**/api/projects/*/workspace-scope',async r=>{const id=new URL(r.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];await r.fulfill({json:{scope:{kind:'personal',projectId:id,workspaceId:AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,visibility:'personal',context:AMR_PERSONAL_WORKSPACE_CONTEXT}}});});
  const projectId=`ui-audit-export-${Date.now()}`;
  const response=await page.request.post('/api/projects',{data:{id:projectId,name:'UI audit isolated export fixture',skillId:null,designSystemId:null,metadata:{kind:'prototype',nameSource:'user'}}});
  const content='<!doctype html><html lang="zh-CN"><body><main><h1>待导出的审计产物</h1></main></body></html>';
  expect(response.ok(),await response.text()).toBeTruthy();
  const file=await page.request.post(`/api/projects/${projectId}/files`,{data:{name:'index.html',content,artifactManifest:{version:1,kind:'html',title:'index.html',entry:'index.html',renderer:'html',exports:['html']}}});
  expect(file.ok(),await file.text()).toBeTruthy();
  let everShared=false;
  await page.route(`/api/projects/${projectId}/share-state`,r=>r.fulfill({json:{projectId,hasEverShared:everShared,bindingExists:everShared,publications:[]}}));
  await page.clock.install();
  const firstHistory=page.waitForResponse(r=>r.url().includes(`/api/projects/${projectId}/share-state`)&&r.ok());
  await page.goto(`/projects/${projectId}/files/index.html`);
  await firstHistory;
  const exportButton=page.getByTestId('file-workspace').getByRole('button',{name:'导出',exact:true});
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  const htmlExport=page.locator('.chrome-unified-popover').getByRole('menuitem',{name:/HTML/i});
  await Promise.all([page.waitForEvent('download'),htmlExport.click()]);
  await expect(page.getByRole('status',{name:'导出完成'})).toBeVisible();
  await save(page,'P1','P1');
  const guide=page.getByRole('status',{name:'导出完成'});
  await expect(guide).toBeVisible();
  await page.mouse.move(0,0);
  await page.clock.fastForward(11_000);
  await expect(guide).toHaveCount(0);
  await exportButton.click();
  await Promise.all([page.waitForEvent('download'),htmlExport.click()]);
  await expect(guide).toBeVisible();
  await guide.getByRole('button',{name:'不再提示'}).click();
  await expect(guide).toHaveCount(0);
  const suppressedHistory=page.waitForResponse(r=>r.url().includes(`/api/projects/${projectId}/share-state`)&&r.ok());
  await page.reload();
  await suppressedHistory;
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  await Promise.all([page.waitForEvent('download'),htmlExport.click()]);
  await expect(guide).toHaveCount(0);
  // Reset only this test user's preference so EX0 is independently gated by history, not by neverShow.
  await page.evaluate(()=>localStorage.removeItem('od:after-export-share-guide:v1:ui-audit-export-account'));
  // A prior binding includes stopped publications. Never call a real public-publish route.
  everShared=true;
  const secondHistory=page.waitForResponse(r=>r.url().includes(`/api/projects/${projectId}/share-state`)&&r.ok());
  await page.reload();
  await secondHistory;
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  await Promise.all([page.waitForEvent('download'),htmlExport.click()]);
  await expect(page.getByRole('status',{name:'导出完成'})).toHaveCount(0);
  await save(page,'EX0','EX0');
});

test('capture signed-out share shell S0',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('open-design:locale','zh-CN');localStorage.setItem('open-design:locale-source','manual');});
  await page.route('**/api/integrations/vela/status*',r=>r.fulfill({json:{loggedIn:false,profile:null,configPath:'',user:null}}));
  await page.route('**/api/projects/*/workspace-scope',r=>{const id=new URL(r.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];return r.fulfill({json:{scope:{kind:'unbound',projectId:id,workspaceId:null,context:null}}});});
  const projectId=`ui-audit-signed-out-${Date.now()}`;
  const response=await page.request.post('/api/projects',{data:{id:projectId,name:'UI audit isolated signed-out fixture',skillId:null,designSystemId:null,metadata:{kind:'prototype',nameSource:'user'}}});
  expect(response.ok(),await response.text()).toBeTruthy();
  const file=await page.request.post(`/api/projects/${projectId}/files`,{data:{name:'index.html',content:'<!doctype html><html><body><h1>审计产物</h1></body></html>',artifactManifest:{version:1,kind:'html',title:'index.html',entry:'index.html',renderer:'html',exports:['html']}}});
  expect(file.ok(),await file.text()).toBeTruthy();
  await page.goto(`/projects/${projectId}/files/index.html`);
  const share=page.getByTestId('file-workspace').getByRole('button',{name:'分享',exact:true});
  await expect(share).toBeEnabled();
  await share.click();
  const menu=page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('switch',{name:/链接访问|Link access/})).toHaveCount(0);
  await expect(menu.getByText(/快速分享|分享至社交|Quick share|Social share/)).toHaveCount(0);
  await save(page,'S0','S0');
  // S13: a prior binding exists in the API projection, but session identity is
  // gone. Capture the real empty fallback; it is NOT the designed shared-link state.
  await page.route(`**/api/projects/${projectId}/share-state`,r=>r.fulfill({json:{projectId,hasEverShared:true,bindingExists:true,publications:[{sourceFilePath:'index.html',slug:'ui-audit-prior-link',status:'active'}]}}));
  await page.reload();
  const signedOutShare=page.getByTestId('file-workspace').getByRole('button',{name:'分享',exact:true});
  await expect(signedOutShare).toBeEnabled();
  await signedOutShare.click();
  const lostSessionMenu=page.locator('.share-menu-popover[role="menu"]');
  await expect(lostSessionMenu).toBeVisible();
  await expect(lostSessionMenu.locator('.chrome-publish-url')).toHaveCount(0);
  await expect(lostSessionMenu.getByRole('switch',{name:/链接访问|Link access/})).toHaveCount(0);
  await save(page,'S13','S13-empty-shell');
});

// S1-T/S1-T2/S4-T: team identity is a scoped GET projection on a new local
// project. Intercept public POST; never upload to the shared service.
test('capture isolated team share menu and access choices',async({page})=>{
  test.setTimeout(120_000);
  const team={...AMR_PERSONAL_WORKSPACE_CONTEXT,workspaceId:'ws-ui-audit-team',workspaceName:'UI audit team',workspaceType:'team' as const,workspaceMemberId:'mem-ui-audit-team',seatSummary:{seatLimit:5,usedSeats:1,availableSeats:4,isSeatFull:false},teamId:'team-ui-audit',teamName:'UI audit team',role:'owner' as const};
  await page.addInitScript(()=>{localStorage.setItem('open-design:locale','zh-CN');localStorage.setItem('open-design:locale-source','manual');});
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/workspace/directory',r=>r.fulfill({json:{items:[team],activeWorkspaceId:team.workspaceId}}));
  await page.route('**/api/workspace/context',r=>r.fulfill({json:{context:team}}));
  const projectId=`ui-audit-team-${Date.now()}`;
  await page.route('**/api/projects/*/workspace-scope',r=>r.fulfill({json:{scope:{kind:'team',projectId,workspaceId:team.workspaceId,teamId:team.teamId,visibility:'private',context:team}}}));
  const create=await page.request.post('/api/projects',{data:{id:projectId,name:'Team UI audit local fixture',skillId:null,designSystemId:null,metadata:{kind:'prototype',nameSource:'user'}}});
  expect(create.ok(),await create.text()).toBeTruthy();
  const {conversationId}=await create.json() as {conversationId:string};
  const content='<!doctype html><html lang="zh-CN"><body><main><h1 data-od-id="team-title">Team audit fixture</h1></main></body></html>';
  const file=await page.request.post(`/api/projects/${projectId}/files`,{data:{name:'index.html',content,artifactManifest:{version:1,kind:'html',title:'index.html',entry:'index.html',renderer:'html',exports:['html']}}});
  expect(file.ok(),await file.text()).toBeTruthy();
  await page.route(`**/api/projects/${projectId}/files/index.html/share-plan`,r=>r.request().method()==='POST'?r.fulfill({json:{fileCount:1,totalBytes:content.length,exceedsSizeLimit:false,exclusions:[]}}):r.fallback());
  const projectResponse=await page.request.get(`/api/projects/${projectId}`);
  expect(projectResponse.ok(),await projectResponse.text()).toBeTruthy();
  const localProject=(await projectResponse.json() as {project:Record<string,unknown>}).project;
  const teamProject={...localProject,workspaceId:team.workspaceId,workspaceVisibility:'private'};
  await page.route(`**/api/workspaces/${team.workspaceId}/projects?*`,r=>r.fulfill({json:{projects:[{project:teamProject,workspaceId:team.workspaceId,visibility:'private',resourceState:'active',createdByWorkspaceMemberId:team.workspaceMemberId,updatedByWorkspaceMemberId:team.workspaceMemberId,currentUserAccess:{canOpen:true,canRename:true,canDelete:true,canDuplicate:true,canMoveToTeam:false,canMoveToPersonal:true,canExport:true,canSendTo:true,canRestoreVersion:true}}]}}));
  await page.route(`**/api/projects/${projectId}`,r=>r.request().method()==='GET'?r.fulfill({json:{project:teamProject}}):r.fallback());
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  const fileRow=page.getByTestId('file-workspace').getByText('index.html',{exact:true}).first();
  await expect(fileRow).toBeVisible();
  await fileRow.click();
  const share=page.getByTestId('file-workspace').getByRole('button',{name:'分享',exact:true});
  await expect(share).toBeEnabled();
  await share.click();
  const menu=page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('switch',{name:/链接访问|Link access/})).toBeVisible();
  const access=menu.locator('.chrome-access-trigger');
  await expect(access).toBeVisible();
  await save(page,'S1-T','S1-T',{mockWorkspaceType:team.workspaceType});
  await access.click();
  await expect(menu.getByRole('listbox')).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(2);
  await save(page,'S1-T2','S1-T2',{mockWorkspaceType:team.workspaceType});
  await page.keyboard.press('Escape');
  const url=`https://example.test/artifact/${projectId}/team-link`;
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`,r=>r.request().method()==='POST'?r.fulfill({json:{url,slug:'team-link',fileName:'index.html'}}):r.fallback());
  await menu.getByRole('menuitem').filter({hasText:/链接|复制/}).first().click();
  await expect(menu.locator('.chrome-publish-url')).toHaveText(url);
  await save(page,'S4-T','S4-T',{mockWorkspaceType:team.workspaceType});
  const memberComment={id:'o1-member',projectId,conversationId,filePath:'index.html',elementId:'team-title',selector:'main h1',label:'Team audit fixture',text:'Team audit fixture',position:{x:0.2,y:0.2,width:0.6,height:0.1},note:'来自团队成员的评论',status:'open',authorKind:'member',authorMemberId:'mem-other-team-member',authorDisplayName:'协作成员',authorKey:'b'.repeat(64),createdAt:Date.now()-60000,updatedAt:Date.now()-60000};
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`,r=>r.request().method()==='GET'?r.fulfill({json:{comments:[memberComment]}}):r.fallback());
  await page.goto(`/projects/${projectId}/files/index.html`);
  const comments=page.getByTestId('comment-panel-toggle');
  await expect(comments).toBeVisible();
  await comments.click();
  const memberRow=page.getByTestId('comment-side-item').filter({hasText:'来自团队成员的评论'});
  await expect(memberRow).toBeVisible();
  await expect(memberRow).toContainText('协作成员');
  await save(page,'O1-OD','O1-OD',{authorKey:memberComment.authorKey,mockWorkspaceType:team.workspaceType});
  const nonOwner={...team,role:'member' as const,permissions:{...team.permissions,canManageMembers:false,canManageBilling:false}};
  await page.route('**/api/workspace/context',r=>r.fulfill({json:{context:nonOwner}}));
  await page.route('**/api/projects/*/workspace-scope',r=>r.fulfill({json:{scope:{kind:'team',projectId,workspaceId:team.workspaceId,teamId:team.teamId,visibility:'private',context:nonOwner}}}));
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`,r=>r.request().method()==='GET'?r.fulfill({json:{comments:[{...memberComment,id:'op3-external',authorKind:'user',authorMemberId:undefined,authorDisplayName:'外部访客',authorKey:'c'.repeat(64),note:'团队成员查看外部评论'}]}}):r.fallback());
  const memberContextResponse=page.waitForResponse(r=>r.url().endsWith('/api/workspace/context')&&r.ok(),{timeout:10000});
  await page.reload();
  const memberContext=await (await memberContextResponse).json() as {context:{role:string}};
  expect(memberContext.context.role).toBe('member');
  if (!(await page.getByTestId('comment-side-panel').isVisible())) await comments.click();
  const externalRow=page.getByTestId('comment-side-item').filter({hasText:'团队成员查看外部评论'});
  await expect(externalRow).toBeVisible();
  await externalRow.click();
  const readonly=page.getByTestId('comment-popover');
  await expect(readonly).toContainText('分享页评论不可编辑');
  await expect(page.getByTestId('comment-popover-input')).not.toBeEditable();
  await expect(page.getByTestId('comment-popover-input')).toHaveAttribute('readonly','');
  await save(page,'OP3','OP3',{mockWorkspaceRole:'member',authorKind:'user'});
  // Versioned team comments pass through the actual live anchor resolver.
  await page.route(`**/api/projects/${projectId}/collab/status`,r=>r.fulfill({json:{publishedVersion:2,materializedVersion:2,awaitingFirstMaterialization:false,syncState:'synced',ownerMemberId:'mem-other-team-owner',ownerDisplayName:'Team Owner',ownerRole:'owner',contentTransferState:null}}));
  let newCommentArrived=false;
  const driftComments=[
    {...memberComment,id:'d1-reanchored',note:'跨版本仍在的标题锚点',anchoredVersion:1},
    {...memberComment,id:'d2-lost',elementId:'removed-unique-target',selector:'#removed-unique-target',label:'被删除的区块',text:'被删除的区块',note:'跨版本已删除的锚点',position:{x:70,y:120,width:160,height:40},anchoredVersion:1},
  ];
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`,r=>r.request().method()==='GET'?r.fulfill({json:{comments:newCommentArrived?[...driftComments,{...memberComment,id:'r5-arrived',note:'新到达的队友评论',createdAt:Date.now(),updatedAt:Date.now()}]:driftComments}}):r.fallback());
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments/lost-anchors`,r=>r.fulfill({json:{updated:0}}));
  await page.reload();
  if (!(await page.getByTestId('comment-side-panel').isVisible())) await comments.click();
  const reanchor=page.locator('[data-anchor-state="reanchored"]');
  const lost=page.locator('[data-anchor-state="lost"]');
  await expect(reanchor.first()).toBeVisible();
  await expect(lost.first()).toBeVisible();
  await expect(reanchor.first().locator('button')).toHaveAttribute('title',/基于旧版本/);
  await expect(lost.first().locator('button')).toHaveAttribute('title',/锚点已丢失/);
  const d1=page.getByTestId('comment-side-item').filter({hasText:'跨版本仍在的标题锚点'});
  await d1.click();
  await save(page,'D1','D1',{publishedVersion:2,anchoredVersion:1,anchorState:'reanchored',mockWorkspaceRole:'member'});
  const d2=page.getByTestId('comment-side-item').filter({hasText:'跨版本已删除的锚点'});
  await d2.click();
  await save(page,'D2','D2',{publishedVersion:2,anchoredVersion:1,anchorState:'lost',mockWorkspaceRole:'member'});
  newCommentArrived=true;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  const arrived=page.getByTestId('comment-side-item').filter({hasText:'新到达的队友评论'});
  await expect(arrived).toBeVisible({timeout:11000});
  await expect(page.getByTestId('comment-side-item')).toHaveCount(3);
  await save(page,'R5','R5',{mockWorkspaceRole:'member',trigger:'visibilitychange',withoutNavigation:true});
});

// O7 paired time proof: yesterday 22:00 at today 00:10 is 2h10 elapsed.
test('capture OD O7 yesterday boundary',async({page})=>{
  test.setTimeout(70_000);
  await page.addInitScript(()=>{localStorage.setItem('open-design:locale','zh-CN');localStorage.setItem('open-design:locale-source','manual');});
  await mockAmrPersonalWorkspace(page);
  const projectId=`ui-audit-time-${Date.now()}`;
  await page.route('**/api/projects/*/workspace-scope',r=>r.fulfill({json:{scope:{kind:'personal',projectId,workspaceId:AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,visibility:'personal',context:AMR_PERSONAL_WORKSPACE_CONTEXT}}}));
  const create=await page.request.post('/api/projects',{data:{id:projectId,name:'O7 isolated time fixture',skillId:null,designSystemId:null,metadata:{kind:'prototype',nameSource:'user'}}});
  expect(create.ok(),await create.text()).toBeTruthy();
  const {conversationId}=await create.json() as {conversationId:string};
  const file=await page.request.post(`/api/projects/${projectId}/files`,{data:{name:'index.html',content:'<!doctype html><main><h1 data-od-id="audit-target">时钟测试</h1></main>',artifactManifest:{version:1,kind:'html',title:'index.html',entry:'index.html',renderer:'html',exports:['html']}}});
  expect(file.ok(),await file.text()).toBeTruthy();
  const now=new Date(2026,8,24,0,10), prior=new Date(2026,8,23,22,0).getTime();
  await page.clock.install({time:now});
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`,r=>r.request().method()==='GET'?r.fulfill({json:{comments:[{id:'o7-yesterday',projectId,conversationId,filePath:'index.html',elementId:'audit-target',selector:'main h1',label:'时钟测试',text:'时钟测试',position:{x:0.2,y:0.2,width:0.6,height:0.1},note:'跨午夜的评论',status:'open',authorKind:'user',authorKey:'o7-timestamp',authorDisplayName:'时钟访客',createdAt:prior,updatedAt:prior}]}}):r.fallback());
  await page.goto(`/projects/${projectId}/files/index.html`);
  await page.getByTestId('comment-panel-toggle').click();
  const row=page.getByTestId('comment-side-item').filter({hasText:'跨午夜的评论'});
  await expect(row).toBeVisible();
  await expect(row).toContainText('昨天');
  await save(page,'O7-OD','O7-OD',{frozenNow:now.toISOString(),commentCreatedAt:new Date(prior).toISOString(),displayedTime:'昨天'});
});

// D4: a comment on the second deck slide remains in the sidebar while the
// first slide is active; navigating to its slide makes the real pin visible.
test('capture D4 non-current slide label and investigate missing pin',async({page})=>{
  test.setTimeout(90_000);
  await page.addInitScript(()=>{localStorage.setItem('open-design:locale','zh-CN');localStorage.setItem('open-design:locale-source','manual');});
  await mockAmrPersonalWorkspace(page);
  const projectId=`ui-audit-deck-${Date.now()}`;
  const create=await page.request.post('/api/projects',{data:{id:projectId,name:'Audit two slide deck',skillId:null,designSystemId:null,metadata:{kind:'deck',nameSource:'user'}}});
  expect(create.ok(),await create.text()).toBeTruthy();
  const {conversationId}=await create.json() as {conversationId:string};
  const content='<!doctype html><html><head><style>body{margin:0}.slide{width:100vw;height:100vh;display:grid;place-items:center}.slide[hidden]{display:none}</style></head><body><section class="slide" data-od-id="slide-one"><h1>第一页</h1></section><section class="slide" data-od-id="slide-two" hidden><h1 data-od-id="deck-second-title">第二页评论目标</h1></section><script>(()=>{let active=0;const slides=[...document.querySelectorAll(".slide")];function show(){slides.forEach((s,i)=>s.toggleAttribute("hidden",i!==active));parent.postMessage({type:"od:slide-state",active,count:slides.length},"*")}addEventListener("message",e=>{if(e.data?.type!=="od:slide")return;if(e.data.action==="go")active=e.data.index;if(e.data.action==="next")active=Math.min(slides.length-1,active+1);show()});addEventListener("keydown",e=>{if(e.key==="ArrowRight"){active=Math.min(slides.length-1,active+1);show()}},true);setTimeout(show,120)})()</script></body></html>';
  const file=await page.request.post(`/api/projects/${projectId}/files`,{data:{name:'deck.html',content,artifactManifest:{version:1,kind:'deck',title:'deck.html',entry:'deck.html',renderer:'deck-html',exports:['html','pdf']}}});
  expect(file.ok(),await file.text()).toBeTruthy();
  const deckComment={id:'d4-second',projectId,conversationId,filePath:'deck.html',elementId:'deck-second-title',selector:'h1[data-od-id="deck-second-title"]',label:'第二页评论目标',text:'第二页评论目标',slideIndex:1,position:{x:120,y:140,width:300,height:70},note:'第二页的评论',status:'open',createdAt:Date.now()-30000,updatedAt:Date.now()-30000};
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`,r=>r.request().method()==='GET'?r.fulfill({json:{comments:[deckComment]}}):r.fallback());
  await page.goto(`/projects/${projectId}/files/deck.html`);
  const comments=page.getByTestId('comment-panel-toggle');
  await expect(comments).toBeVisible();
  await comments.click();
  const row=page.getByTestId('comment-side-item').filter({hasText:'第二页的评论'});
  await expect(row.locator('.comment-side-slide')).toHaveText('第 2 / 2 页');
  await expect(page.getByTestId('comment-saved-marker-deck-second-title')).toHaveCount(0);
  await save(page,'D4','D4-label-only',{slideIndex:1,activeSlideIndex:0,slideLabel:await row.locator('.comment-side-slide').innerText(),pinVisible:false});
  await page.getByRole('button',{name:'收起评论'}).click({timeout:5000});
  await page.getByTestId('artifact-preview-frame').contentFrame().locator('body').press('ArrowRight');
  await expect(page.getByRole('region',{name:'演讲者备注'})).toContainText('第 2 / 2 页');
  await expect(page.getByTestId('comment-saved-marker-deck-second-title')).toHaveCount(0);
});
