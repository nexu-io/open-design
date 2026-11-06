import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import { WorkspaceBrowser } from '../browser.ts';
import { webAddress } from '../shared/browser.ts';

test('browser addresses accept bare domains and local ports but reject executable and credential URLs', () => {
  assert.equal(webAddress('baidu.com'), 'https://baidu.com/');
  assert.equal(webAddress('localhost:48263/page'), 'https://localhost:48263/page');
  for (const url of ['', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello', 'https://user:pass@example.com']) assert.throws(() => webAddress(url));
});

test('real browser handles frame-denying sites, navigation, input, history, reload and isolated sessions', { timeout: 60_000 }, async () => {
  let visits = 0;
  const site = createServer((req, res) => {
    const url = new URL(req.url!, 'http://local');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" });
    res.end(`<title>${url.pathname}</title><a href="/next">Next</a><form action="/search"><input name="q" autofocus><button>Search</button></form><p id="query">${url.searchParams.get('q') || ''}</p><p id="visit">${++visits}</p>`);
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const browser = new WorkspaceBrowser(process.cwd());
  try {
    const tab = await browser.open('session-one', 'tab-one', `${base}/first`);
    await tab.page.waitForSelector('input');
    // Autofocus is scheduled after DOM readiness; explicitly focus before testing input delivery.
    await tab.page.focus('input');
    await tab.page.waitForFunction(() => document.activeElement?.tagName === 'INPUT');
    await tab.input({ type: 'text', text: 'OpenDesign 中文' });
    await Promise.all([tab.page.waitForNavigation(), tab.input({ type: 'key', key: 'Enter', modifiers: 0 })]);
    assert.equal(new URL(tab.page.url()).searchParams.get('q'), 'OpenDesign 中文');
    const link = await tab.page.$eval('a', element => { const r = element.getBoundingClientRect(); return { x: r.x + 5, y: r.y + 5 }; });
    await tab.input({ type: 'pointer', event: 'down', button: 'left', ...link });
    await Promise.all([tab.page.waitForNavigation(), tab.input({ type: 'pointer', event: 'up', button: 'left', ...link })]);
    assert.equal(tab.page.url(), `${base}/next`);
    await Promise.all([tab.page.waitForNavigation(), tab.command('back')]);
    assert.equal(new URL(tab.page.url()).pathname, '/search');
    await Promise.all([tab.page.waitForNavigation(), tab.command('forward')]);
    assert.equal(tab.page.url(), `${base}/next`);
    const before = await tab.page.$eval('#visit', el => el.textContent);
    await Promise.all([tab.page.waitForNavigation(), tab.command('reload')]);
    assert.notEqual(await tab.page.$eval('#visit', el => el.textContent), before);
    await assert.rejects(tab.command('navigate', 'file:///tmp/private'), /HTTP/);
    await tab.page.evaluate(() => { localStorage.setItem('isolation', 'one'); });
    const other = await browser.open('session-two', 'tab-one', `${base}/first`);
    await other.page.waitForSelector('input');
    assert.equal(await other.page.evaluate(() => localStorage.getItem('isolation')), null);
    const sibling = await browser.open('session-one', 'tab-two', `${base}/first`);
    await sibling.page.waitForSelector('input');
    assert.equal(await sibling.page.evaluate(() => localStorage.getItem('isolation')), 'one');
    let frames = '';
    const stream = Object.assign(new Writable({ write(chunk, _encoding, done) { frames += chunk.toString(); done(); } }), { writeHead() {} });
    await tab.watch(stream as unknown as ServerResponse);
    const deadline = Date.now() + 5000;
    while (!frames.includes('event: frame') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(frames, /event: frame/); assert.match(frames, /"canGoBack":true/);
    stream.destroy();
    assert.equal(await browser.open('session-one', 'tab-one', `${base}/first`), tab, 'reattaching preserves browser history');
    await browser.remove('session-one', 'tab-one');
    assert.equal(tab.page.isClosed(), true);
    await assert.rejects(browser.get('session-one', 'tab-one'), /关闭/);
    await other.page.browser().close();
    const recovered = await browser.open('session-two', 'tab-one', `${base}/recovered`);
    await recovered.page.waitForSelector('input');
    assert.equal(recovered.page.url(), `${base}/recovered`, 'a disconnected engine can be relaunched on retry');
  } finally { await browser.close(); site.closeAllConnections(); await new Promise<void>(resolve => site.close(() => resolve())); }
});
