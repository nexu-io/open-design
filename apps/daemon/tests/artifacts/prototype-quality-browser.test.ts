import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPrototypeQuality } from '../../src/artifacts/prototype-quality.js';
import { findBrowserExecutable } from '../../src/browser-sessions.js';

let root: string;
beforeAll(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-quality-regression-')); });
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });
async function check(script: string, extra = '', options: { executablePath?: string | null; remainingBudgetMs?: number } = {}) {
  await fs.writeFile(path.join(root, 'index.html'), `<!doctype html><html><body><h1>今日</h1><main>今日用药记录与服药时间</main><nav aria-label="主导航"><button data-page="今日" aria-current="page">今日</button><button data-page="药品" aria-current="false">药品</button></nav>${extra}<script>${script}</script></body></html>`);
  return checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: '设计一个 App，主导航有今日和药品', ...options });
}
describe('fail-closed environment', () => {
  it('reports no browser as incomplete rather than zero-check pass', async () => {
    expect((await check('', '', { executablePath: null })).status).toBe('incomplete');
  });
  it('does not turn budget exhaustion into pass', async () => {
    expect((await check('', '', { remainingBudgetMs: 0 })).status).toBe('incomplete');
  });
  it('syntax error remains failure with no browser', async () => {
    expect((await check('const bad = "oops;', '', { executablePath: null })).status).toBe('fail');
  });
});
describe.skipIf(!findBrowserExecutable())('real isolated browser navigation', { timeout: 35_000 }, () => {
  it('accepts delegated handlers, returns, and clicking the current tab', async () => {
    const result = await check(`document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){document.querySelectorAll('nav button').forEach(item=>item.setAttribute('aria-current',item===b?'page':'false'));document.querySelector('h1').textContent=b.dataset.page;document.querySelector('main').textContent=b.dataset.page+'药物列表与实际业务内容';}});`);
    expect(result.status, JSON.stringify(result)).toBe('pass'); expect(result.coverage).toEqual({ expected: 2, checked: 2, complete: true });
  });
  it('accepts native nav without a prescribed label and a known synonymous control label', async () => {
    await fs.writeFile(path.join(root, 'index.html'), `<h1>今日</h1><main>今日服药记录</main><nav><button data-page="今日" aria-current="page">今日</button><button data-page="药品" aria-current="false">药物</button></nav><script>document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){document.querySelectorAll('nav button').forEach(t=>t.setAttribute('aria-current',t===b?'page':'false'));document.querySelector('h1').textContent=b.dataset.page;document.querySelector('main').textContent=b.dataset.page+'实际业务内容';}})</script>`);
    expect((await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App，主导航有今日和药品' })).status).toBe('pass');
  });
  it('does not confuse an in-page category rail with primary page navigation', async () => {
    const result = await check(`document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){document.querySelectorAll('nav[aria-label="主导航"] button').forEach(t=>t.setAttribute('aria-current',t===b?'page':'false'));document.querySelector('h1').textContent=b.dataset.page;document.querySelector('main').textContent=b.dataset.page+'实际业务内容';}});`, '<nav aria-label="商品分类"><button data-cat="meat">荤菜</button></nav>');
    expect(result.status).toBe('pass'); expect(result.coverage.expected).toBe(2);
  });
  it.each([
    ['URL only', `document.addEventListener('click',e=>{if(e.target.dataset.page)location.hash=e.target.dataset.page;});`, ''],
    ['wrong selection', `document.addEventListener('click',e=>{if(e.target.dataset.page){document.querySelector('h1').textContent=e.target.dataset.page;document.querySelector('main').textContent=e.target.dataset.page+'其他业务内容';}});`, ''],
    ['heading only', `document.addEventListener('click',e=>{if(e.target.dataset.page)document.querySelector('h1').textContent=e.target.dataset.page;});`, ''],
    ['heading and selection only', `document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){document.querySelectorAll('nav[aria-label="主导航"] button').forEach(t=>t.setAttribute('aria-current',t===b?'page':'false'));document.querySelector('h1').textContent=b.dataset.page;}});`, ''],
    ['heading selection and arbitrary counter', `document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){document.querySelectorAll('nav[aria-label="主导航"] button').forEach(t=>t.setAttribute('aria-current',t===b?'page':'false'));document.querySelector('h1').textContent=b.dataset.page;counter.textContent=Number(counter.textContent)+1;}});`, '<main id="counter">0</main>', 'incomplete'],
    ['highlight only', `document.addEventListener('click',e=>{if(e.target.dataset.page)e.target.classList.add('active');});`, ''],
    ['hidden target', `document.addEventListener('click',e=>{if(e.target.dataset.page)document.querySelector('#hidden').textContent=e.target.dataset.page;});`, '<h1 id="hidden" hidden></h1>'],
    ['overlay', '', '<div style="position:fixed;inset:0;z-index:99;background:white"></div>'],
    ['lost binding after replacement', `document.querySelectorAll('button').forEach(b=>b.onclick=()=>{document.querySelector('h1').textContent=b.dataset.page;document.querySelector('nav').innerHTML='<button data-page="今日">今日</button><button data-page="药品">药品</button>';});`, ''],
  ])('does not pass %s', async (_name, script, extra, expected = 'fail') => { expect((await check(script, extra)).status).toBe(expected); });
  it('missing requested mode is a failure', async () => {
    await fs.writeFile(path.join(root, 'index.html'), '<h1>选择方式</h1>');
    const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: '提供堂食和自提入口' });
    expect(result.status).toBe('fail');
  });
  it('missing independently requested navigation cannot pass', async () => {
    await fs.writeFile(path.join(root, 'index.html'), '<h1>今日</h1><main>今日用药记录</main><nav aria-label="主导航"><button aria-current="page">今日</button></nav>');
    const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App，主导航有今日和药品' });
    expect(result.status).toBe('fail');
    expect(result.checks).toContainEqual(expect.objectContaining({ control: '药品', reason: 'required_entry_missing' }));
  });
  it('two always visible panels without switching cannot pass', async () => {
    await fs.writeFile(path.join(root, 'index.html'), '<div role="tablist"><button role="tab" aria-selected="true" aria-controls="a">今日</button><button role="tab" aria-selected="false" aria-controls="b">药品</button></div><div id="a" role="tabpanel">今日服药记录</div><div id="b" role="tabpanel">药物清单</div>');
    expect((await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App，Tabs：今日、药品' })).status).toBe('fail');
  });
  it('selection and a click counter cannot substitute for switching panels', async () => {
    await fs.writeFile(path.join(root, 'index.html'), `<main id="counter">0</main><div role="tablist"><button role="tab" aria-selected="true" aria-controls="a">今日</button><button role="tab" aria-selected="false" aria-controls="b">药品</button></div><div id="a" role="tabpanel">今日服药记录</div><div id="b" role="tabpanel">药物清单</div><script>document.addEventListener('click',e=>{const b=e.target.closest('[role="tab"]');if(b){document.querySelectorAll('[role="tab"]').forEach(t=>t.setAttribute('aria-selected',t===b?'true':'false'));counter.textContent=Number(counter.textContent)+1;}})</script>`);
    expect((await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App，Tabs：今日、药品' })).status).toBe('fail');
  });
  it('accepts real semantic panel selection with inactive panels hidden', async () => {
    await fs.writeFile(path.join(root, 'index.html'), `<div role="tablist"><button role="tab" aria-selected="true" aria-controls="a">今日</button><button role="tab" aria-selected="false" aria-controls="b">药品</button></div><div id="a" role="tabpanel">今日服药记录</div><div id="b" role="tabpanel" hidden>药物清单</div><script>document.addEventListener('click',e=>{const b=e.target.closest('[role="tab"]');if(b){document.querySelectorAll('[role="tab"]').forEach(t=>t.setAttribute('aria-selected',t===b?'true':'false'));document.querySelectorAll('[role="tabpanel"]').forEach(p=>p.hidden=p.id!==b.getAttribute('aria-controls'));}})</script>`);
    expect((await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App，Tabs：今日、药品' })).status).toBe('pass');
  });
  it('accepts distinct exclusive ARIA panels whose business content differs only numerically', async () => {
    await fs.writeFile(path.join(root, 'index.html'), `<div role="tablist"><button role="tab" aria-selected="true" aria-controls="a">账户一</button><button role="tab" aria-selected="false" aria-controls="b">账户二</button></div><div id="a" role="tabpanel">余额100元</div><div id="b" role="tabpanel" hidden>余额200元</div><script>document.addEventListener('click',e=>{const b=e.target.closest('[role="tab"]');if(b){document.querySelectorAll('[role="tab"]').forEach(t=>t.setAttribute('aria-selected',t===b?'true':'false'));document.querySelectorAll('[role="tabpanel"]').forEach(p=>p.hidden=p.id!==b.getAttribute('aria-controls'));}})</script>`);
    expect((await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App，Tabs：账户一、账户二' })).status).toBe('pass');
  });
  it('keeps an explicitly declared category tab with unmapped target incomplete', async () => {
    const result = await check(`document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){document.querySelectorAll('nav[aria-label="主导航"] button').forEach(t=>t.setAttribute('aria-current',t===b?'page':'false'));document.querySelector('h1').textContent=b.dataset.page;document.querySelector('main').textContent=b.dataset.page+'实际业务内容';}});`, '<nav aria-label="商品分类"><button role="tab" aria-selected="true">荤菜</button></nav>');
    expect(result.status).toBe('incomplete');
    expect(result.checks).toContainEqual(expect.objectContaining({control:'荤菜', status:'incomplete'}));
  });

  it('keeps genuinely switching tabs with a reused panel incomplete rather than claiming failure', async () => {
    await fs.writeFile(path.join(root, 'index.html'), `<h1>堂食</h1><div role="tablist"><button role="tab" aria-controls="order" aria-selected="true">堂食</button><button role="tab" aria-controls="order" aria-selected="false">自提</button></div><main id="order">堂食桌号 A12</main><script>document.addEventListener('click',e=>{const b=e.target.closest('[role="tab"]');if(b){document.querySelectorAll('[role="tab"]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));document.querySelector('h1').textContent=b.textContent;document.querySelector('main').textContent=b.textContent==='自提'?'自提取餐号码 B34':'堂食桌号 A12';}});</script>`);
    const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: '堂食和自提 Tab' });
    expect(result.status).toBe('incomplete');
    expect(result.checks.filter(c => c.kind === 'navigation').every(c => c.status === 'incomplete')).toBe(true);
  });
  it('accepts a delayed semantic switch within the control deadline', async () => {
    const result = await check(`document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)setTimeout(()=>{document.querySelectorAll('nav button').forEach(item=>item.setAttribute('aria-current',item===b?'page':'false'));document.querySelector('h1').textContent=b.dataset.page;document.querySelector('main').textContent=b.dataset.page+'实际业务内容';},250);});`);
    expect(result.status).toBe('pass');
  });
  it('budget interruption remains incomplete and actually stops the owned browser', async () => {
    const result = await check('', '<div style="position:fixed;inset:0;z-index:99"></div>', { remainingBudgetMs: 900 });
    expect(result.status).toBe('incomplete'); expect(result.durationMs).toBeLessThan(2_000);
  });
  it('canceling a check is not a generated-artifact failure', async () => {
    await fs.writeFile(path.join(root, 'index.html'), '<h1>今日</h1><nav aria-label="主导航"><button aria-current="page">今日</button></nav>');
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 500);
    try {
      const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App', signal: abort.signal });
      expect(result.status).toBe('incomplete'); expect(result.checks).toContainEqual(expect.objectContaining({ reason: 'canceled' }));
    } finally { clearTimeout(timer); }
  });
  it('static display is not applicable', async () => {
    await fs.writeFile(path.join(root, 'index.html'), '<h1>品牌海报</h1>');
    const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: '设计品牌海报' });
    expect(result.status).toBe('not_applicable');
  });
  it('keeps an unrecognized greeting heading incomplete rather than claiming a wrong page', async () => {
    await fs.writeFile(path.join(root, 'index.html'), '<h2>您好，李女士</h2><div class="h-title">今日用药</div><main>服药时间线</main><nav><button aria-current="page">今日</button></nav>');
    const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App' });
    expect(result.status).toBe('incomplete');
    expect(result.checks.find(c => c.control === '今日')?.status).toBe('incomplete');
  });
  it('keeps a named requested entry outside supported nav incomplete rather than missing', async () => {
    await fs.writeFile(path.join(root, 'index.html'), '<h1>今日</h1><main>服药记录</main><button aria-label="提醒设置">设置</button><nav><button aria-current="page">今日</button></nav>');
    const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App，还需要提醒设置入口' });
    expect(result.status).toBe('incomplete');
    expect(result.checks).toContainEqual(expect.objectContaining({ control: '提醒', status: 'incomplete', reason: 'required_entry_outside_supported_navigation' }));
  });
  it('cannot pass a switch with no identifiable origin for return', async () => {
    await fs.writeFile(path.join(root, 'index.html'), `<h1>欢迎</h1><main>主页内容</main><nav><button aria-current="false">药品</button></nav><script>document.querySelector('button').onclick=e=>{e.target.setAttribute('aria-current','page');document.querySelector('h1').textContent='药品';document.querySelector('main').textContent='药物清单';}</script>`);
    const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: 'App' });
    expect(result.status).toBe('incomplete');
    expect(result.checks.find(c => c.control === '药品')?.observed).toContain('返回=null');
  });
  it.each([false, true])('checks the return origin for navigation discovered after a mode entry (broken=%s)', async broken => {
    await fs.writeFile(path.join(root, 'index.html'), `<section id="choose"><button data-mode="堂食">堂食</button><button data-mode="自提">自提</button></section><section id="menu" hidden><h1 id="title">点餐</h1><span data-current-mode></span><button id="back">切换用餐方式</button><main id="body">商品列表</main><nav><button data-page="点餐" aria-current="page">点餐</button><button data-page="我的订单" aria-current="false">我的订单</button></nav></section><script>
      document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.dataset.mode){choose.hidden=true;menu.hidden=false;document.querySelector('[data-current-mode]').textContent=b.dataset.mode;}
      if(b.id==='back'){choose.hidden=false;menu.hidden=true;}
      if(b.dataset.page){if(${broken}&&title.textContent==='我的订单'&&b.dataset.page==='点餐')return;document.querySelectorAll('nav button').forEach(t=>t.setAttribute('aria-current',t===b?'page':'false'));title.textContent=b.dataset.page;body.textContent=b.dataset.page==='点餐'?'商品列表':'订单明细';}
      });</script>`);
    const result = await checkPrototypeQuality({ projectRoot: root, entryFile: 'index.html', userBrief: '堂食和自提，主导航：点餐、我的订单' });
    expect(result.status).toBe(broken ? 'fail' : 'pass');
    const order = result.checks.find(c => c.control === '我的订单');
    expect(order?.expected).toContain('点击');
    expect(order?.observed).toContain('起点=');
    expect(order?.observed).toContain(`返回=${!broken}`);
    if (!broken) expect(order?.observed).toContain('再次切换=true');
  });
});
