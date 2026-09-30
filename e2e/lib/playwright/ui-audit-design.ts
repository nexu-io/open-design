/* Local UI-audit design reference capture. Run from e2e with:
 * with-env pnpm exec tsx lib/playwright/ui-audit-design.ts [Chain-1-publish]
 * Never start while another browser runtime is active.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, open, unlink, rename } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '../../..');
const input = resolve(repo, '.tmp/ui-audit/input/boards');
const output = resolve(repo, '.tmp/ui-audit/captures/design');
const boardNames = ['Chain-1-publish', 'Chain-2-open', 'Chain-3-comment', 'Chain-4-owner', 'Chain-5-update', 'Chain-6-dialogs'];
const requested = process.argv[2] ? [process.argv[2]] : boardNames;
const memory = execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' });
const free = Number(memory.match(/System-wide memory free percentage: (\d+)%/)?.[1] ?? 0);
if (free < 20) throw new Error(`Insufficient free memory for capture: ${free}%`);
let activeBrowsers = '';
try { activeBrowsers = execFileSync('pgrep', ['-fl', 'chrome-headless-shell|chromium.*--headless|Google Chrome for Testing.*--headless'], { encoding: 'utf8' }); } catch { /* No matching browser runtime. */ }
if (activeBrowsers.trim()) throw new Error('Another browser runtime is active; capture deferred (do not stop it).');
if (requested.some((name) => !boardNames.includes(name))) throw new Error('Unknown board');
const inventory = await readFile(resolve(repo, '.tmp/ui-audit/inventory.md'), 'utf8');
const targets = inventory.split('\n').filter((row) => /^\| [A-Z][A-Z0-9-]* \|/.test(row)).map((row) => {
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
  return { id: cells[0] ?? '', frame: cells[3] ?? '' };
}).filter((row) => row.id !== '' && row.frame.startsWith('Chain-'));
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(input, '.' + decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname));
  if (path !== input && !path.startsWith(input + sep)) { res.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(path);
    res.setHeader('Content-Type', extname(path) === '.html' ? 'text/html; charset=utf-8' : extname(path) === '.js' ? 'text/javascript; charset=utf-8' : 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No local HTTP port');
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const reportPath = resolve(output, 'capture-report.json');
const report: Array<{ id: string; board: string; outcome: string }> = [];
try {
  const prior = JSON.parse(await readFile(reportPath, 'utf8')) as typeof report;
  if (Array.isArray(prior)) report.push(...prior);
} catch { /* First capture has no report yet. */ }
const lockPath = resolve(repo, '.tmp/ui-audit/design-capture.lock');
let lock: Awaited<ReturnType<typeof open>>;
try { lock = await open(lockPath, 'wx'); } catch (error) { server.close(); throw error; }
try {
  // The lock coordinates our own capture runs; process preflight also guards foreign browsers.
  let competing = '';
  try { competing = execFileSync('pgrep', ['-fl', 'chrome-headless-shell|chromium.*--headless|Google Chrome for Testing.*--headless'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* No competing process. */ }
  if (competing.trim()) throw new Error('Another browser runtime started after preflight; capture deferred.');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'zh-CN' });
  try {
    const page = await context.newPage();
    for (const board of requested) {
      await page.goto(`http://127.0.0.1:${address.port}/${board}/${board}.dc.html`, { waitUntil: 'networkidle' });
      await page.locator('.board').first().waitFor({ timeout: 15000 });
      for (const row of targets.filter((item) => item.frame.startsWith(board + ' '))) {
        const { id } = row;
        if (id === 'G4') { report.push({ id, board, outcome: 'shared-frame-negative-assertion' }); continue; }
        const locator = page.locator('.sid').filter({ hasText: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first();
        if (await locator.count() === 0) { report.push({ id, board, outcome: 'missing-id' }); continue; }
        const target = locator.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " cell ")][1]');
        const hasMockup = await target.evaluate((node) => Array.from(node.children).some((child) => !child.classList.contains('meta') && child.getBoundingClientRect().height > 20)).catch(() => false);
        if (!hasMockup) { report.push({ id, board, outcome: 'missing-mockup' }); continue; }
        const box = await target.boundingBox();
        if (!box || box.width < 20 || box.height < 20) { report.push({ id, board, outcome: 'missing-frame' }); continue; }
        const screenshot = resolve(output, `${id}.png`);
        try {
          const previous = JSON.parse(await readFile(resolve(output, `${id}.json`), 'utf8')) as { board?: string };
          if (previous.board && previous.board !== board) { report.push({ id, board, outcome: `duplicate-source:${previous.board}` }); continue; }
        } catch { /* No previous capture metadata. */ }
        const data = await target.evaluate((node) => {
          const nodes = [node, ...Array.from(node.querySelectorAll('*')).slice(0, 120)];
          return { text: (node.textContent || '').trim(), elements: nodes.map((element, index) => {
            const style = getComputedStyle(element);
            const bounds = element.getBoundingClientRect();
            return { index, tag: element.tagName.toLowerCase(), text: (element.textContent || '').trim().slice(0, 160), style: { color: style.color, backgroundColor: style.backgroundColor, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, borderRadius: style.borderRadius, boxShadow: style.boxShadow, width: bounds.width, height: bounds.height, margin: style.margin, padding: style.padding } };
          }) };
        });
        await target.screenshot({ path: screenshot, animations: 'disabled' });
        await writeFile(resolve(output, `${id}.json`), JSON.stringify({ id, board, frame: row.frame, source: 'design-board', viewport: '1440x900@2', screenshot: relative(repo, screenshot), ...data }, null, 2));
        const previousIndex = report.findIndex((entry) => entry.id === id && entry.board === board);
        if (previousIndex >= 0) report.splice(previousIndex, 1);
        report.push({ id, board, outcome: 'captured' });
      }
    }
  } finally { await context.close(); }
} finally {
  await browser?.close();
  server.close();
  await once(server, 'close');
  try {
    const nextReport = `${reportPath}.next`;
    await writeFile(nextReport, JSON.stringify(report, null, 2));
    await rename(nextReport, reportPath);
  } finally { await lock.close(); await unlink(lockPath); }
}
console.log(JSON.stringify({ captured: report.filter((r) => r.outcome === 'captured').length, missing: report.filter((r) => r.outcome !== 'captured'), boards: requested }));
