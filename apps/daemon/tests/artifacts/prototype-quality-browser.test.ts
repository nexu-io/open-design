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
    ['heading selection and arbitrary counter', `document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b){document.querySelectorAll('nav[aria-label="主导航"] button').forEach(t=>t.setAttribute('aria-current',t===b?'page':'false'));document.querySelector('h1').textContent=b.dataset.page;counter.textContent=Number(counter.textContent)+1;}});`, '<main id="counter">0</main>'],
    ['highlight only', `document.addEventListener('click',e=>{if(e.target.dataset.page)e.target.classList.add('active');});`, ''],
    ['hidden target', `document.addEventListener('click',e=>{if(e.target.dataset.page)document.querySelector('#hidden').textContent=e.target.dataset.page;});`, '<h1 id="hidden" hidden></h1>'],
    ['overlay', '', '<div style="position:fixed;inset:0;z-index:99;background:white"></div>'],
    ['lost binding after replacement', `document.querySelectorAll('button').forEach(b=>b.onclick=()=>{document.querySelector('h1').textContent=b.dataset.page;document.querySelector('nav').innerHTML='<button data-page="今日">今日</button><button data-page="药品">药品</button>';});`, ''],
  ])('rejects %s', async (_name, script, extra) => { expect((await check(script, extra)).status).toBe('fail'); });
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
});
