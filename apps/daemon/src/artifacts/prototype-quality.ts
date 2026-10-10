import path from 'node:path';
import os from 'node:os';
import { chromium, type Page } from 'playwright-core';
import {
  DELIVERABLE_QUALITY_SCHEMA, DELIVERABLE_QUALITY_CHECKER,
  type DeliverableQualityEvidence, type DeliverableQualityCheck,
} from '@open-design/contracts';
import { findBrowserExecutable } from '../browser-sessions.js';
import { runPrototypeStatic } from './prototype-quality-static-service.js';
export { inspectPrototypeScripts } from './prototype-quality-static.js';

export const PROTOTYPE_HOST_BUDGET_MS = 30_000;
const ORIGIN = 'https://prototype.invalid';
const CONTROL_SELECTOR = 'nav a,nav button,[role="tab"],[data-mode]' ;

export function qualityStatus(checks: DeliverableQualityCheck[], complete: boolean): DeliverableQualityEvidence['status'] {
  if (checks.some(check => check.status === 'fail')) return 'fail';
  if (!complete || checks.some(check => check.status === 'incomplete')) return 'incomplete';
  return checks.length ? 'pass' : 'not_applicable';
}

interface Control { label: string; mode: boolean; tab: boolean; target: string | null; }
export function prototypeRequiredControls(brief: string): { labels: string[]; unresolved: boolean } {
  const labels = ['堂食', '自提'].filter(label => brief.includes(label));
  let unresolved = false;
  for (const match of brief.matchAll(/(?:主导航|底部导航|tabs?|标签页|页签)(?:为|包括|包含|有|：|:)?\s*[(（【]?([^\n。;；)）】]{2,100})/gi)) {
    if (labels.includes('堂食') && labels.includes('自提') && /^(?:切换|选择|入口|点击)(?:功能)?[\s，,]*$/.test(match[1]!.trim())) continue;
    const names = match[1]!.split(/[、,，/]|和|与/).map(name => name.trim().replace(/^(?:为|有|包括|包含|：|:)\s*/, ''));
    if (names.length < 2 || names.some(name => name.length > 16 || !name)) unresolved = true;
    else labels.push(...names);
  }
  // Natural-language entry requests are independent of what the artifact happens to render.
  // Only known primary-page names are reliably mapped; other named entries leave coverage unknown.
  const natural = /(?:还?需要|提供|包含|包括)([^。;；\n]{2,160})入口/.exec(brief);
  if (natural) {
    for (const [pattern, label] of [[/药品管理|用药清单/, '药品'], [/提醒设置/, '提醒'], [/健康趋势/, '趋势']] as const) {
      if (pattern.test(natural[1]!)) labels.push(label);
    }
    if (natural[1]!.replace(/药品管理|用药清单|提醒设置|健康趋势|堂食|自提|[、,，/和与\s]/g, '')) unresolved = true;
  }
  return { labels: [...new Set(labels)], unresolved };
}
async function controls(page: Page): Promise<Control[]> {
  return page.locator(CONTROL_SELECTOR).evaluateAll(nodes => nodes.filter(node => {
    const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && node.ownerDocument.defaultView!.getComputedStyle(node).visibility !== 'hidden';
  }).map(node => ({
    label: (node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
    mode: node.hasAttribute('data-mode'), tab: node.getAttribute('role') === 'tab', target: node.getAttribute('aria-controls'),
  })));
}
function semanticLabel(label: string): string {
  if (/堂食/.test(label)) return '堂食';
  if (/自提/.test(label)) return '自提';
  const name = label.replace(/\s+/g, '').slice(0, 40);
  return ({ 药物: '药品', 今天: '今日', 个人: '我的', 菜单: '点餐', 订单: '我的订单' } as Record<string, string>)[name] ?? name;
}
async function targetVisible(page: Page, control: Control): Promise<boolean | null> {
  if (control.target) {
    const target = page.locator(`[id=${JSON.stringify(control.target)}]`);
    const selected = await page.locator(CONTROL_SELECTOR).evaluateAll((nodes, label) => {
      const same = nodes.find(node => (node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100) === label);
      if (!same) return false;
      if (!same.hasAttribute('aria-selected')) return null;
      const group = same.closest('[role="tablist"]') || same.parentElement;
      if (same.getAttribute('aria-selected') !== 'true' || group?.querySelectorAll('[aria-selected="true"]').length !== 1) return false;
      // Selection plus an arbitrary counter change is insufficient: sibling tab panels must switch away.
      for (const peer of group.querySelectorAll('[role="tab"][aria-controls]')) {
        if (peer === same) continue;
        const panel = same.ownerDocument.getElementById(peer.getAttribute('aria-controls')!);
        if (!panel) return null;
        const box = panel.getBoundingClientRect();
        if (box.width > 0 && box.height > 0 && panel.ownerDocument.defaultView!.getComputedStyle(panel).visibility !== 'hidden') return false;
      }
      return true;
    }, control.label);
    if (selected === null) return null;
    return selected && await target.count() > 0 && await target.isVisible() && (await target.innerText()).trim().length > 0;
  }
  if (control.tab) return null; // Unmapped filter/Tab semantics require stronger evidence, never a false failure.
  const label = semanticLabel(control.label);
  const titles = await page.locator('h1,h2,[role="heading"],section[aria-label],main[aria-label],[aria-labelledby]').evaluateAll(nodes => nodes
    .filter(node => { const b = node.getBoundingClientRect(); return b.width > 0 && b.height > 0 && node.ownerDocument.defaultView!.getComputedStyle(node).visibility !== 'hidden'; })
    .map(node => (node.getAttribute('aria-label') || (node.getAttribute('aria-labelledby')?.split(/\s+/).map((id: string) => node.ownerDocument.getElementById(id)?.textContent || '').join(' ')) || node.textContent || '').replace(/\s+/g, '')));
  const aliases: Record<string, string[]> = { 今日: ['今日', '今天'], 药品: ['药品', '药物'], 提醒: ['提醒'], 趋势: ['趋势'], 我的: ['我的', '个人'], 点餐: ['点餐', '菜单'], 我的订单: ['我的订单', '订单'] };
  if (control.mode) {
    // Mode must be reflected in the actual ordering screen, outside its entry button.
    const mode = page.locator('#menuModeText,[data-current-mode],[aria-label="切换用餐方式"]');
    const text = await mode.filter({ visible: true }).allTextContents();
    return titles.some(title => /点餐|菜单/.test(title)) && text.some(t => t.includes(label));
  }
  const terms = aliases[label] ?? [label];
  if (!label || !titles.length) return null;
  return titles.some(title => terms.some(term => title.includes(term)));
}
async function selectedControl(page: Page, control: Control): Promise<boolean | null> {
  if (control.mode) return true; // Business mode is asserted in the actual ordering screen.
  return page.locator(CONTROL_SELECTOR).evaluateAll((nodes, label) => {
    const same = nodes.find(node => (node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100) === label);
    if (!same) return false;
    const group = same.closest('nav,[role="tablist"]');
    const value = same.getAttribute('aria-selected') ?? same.getAttribute('aria-current');
    if (value !== null) {
      const active = [...(group?.querySelectorAll('[aria-selected],[aria-current]') ?? [])].filter(node => {
        const state = node.getAttribute('aria-selected') ?? node.getAttribute('aria-current'); return state !== 'false' && state !== '';
      });
      return value !== 'false' && value !== '' && active.length === 1;
    }
    if (group?.querySelector('.active,.is-active,.selected,.is-selected')) return group.querySelectorAll('.active,.is-active,.selected,.is-selected').length === 1 && /(?:^|\s)(?:is-)?(?:active|selected)(?:\s|$)/.test(same.className);
    return null;
  }, control.label);
}
async function awaitTarget(page: Page, control: Control, deadline: () => boolean): Promise<boolean | null> {
  const until = performance.now() + 1_500;
  let visible = await targetVisible(page, control);
  if (visible === true) visible = await selectedControl(page, control);
  while ((visible === false || (visible === null && !control.tab)) && performance.now() < until && !deadline()) {
    await page.waitForTimeout(50);
    visible = await targetVisible(page, control);
    if (visible === true) visible = await selectedControl(page, control);
  }
  if (deadline()) throw new Error('host_budget_exhausted');
  return visible;
}
async function clickControl(page: Page, control: Control): Promise<void> {
  const candidate = page.locator(CONTROL_SELECTOR).filter({ visible: true });
  for (let i = 0; i < await candidate.count(); i++) {
    const item = candidate.nth(i);
    const label = (await item.getAttribute('aria-label') || await item.innerText()).trim().replace(/\s+/g, ' ').slice(0, 100);
    if (label === control.label) { await item.click({ timeout: 700 }); return; }
  }
  throw new Error('control_missing_after_return');
}

async function visibleContent(page: Page): Promise<string> {
  return page.locator('main,[role="tabpanel"],section[aria-labelledby],section[aria-label]').filter({ visible: true })
    .evaluateAll(nodes => nodes.map(node => {
      const walker = node.ownerDocument.createTreeWalker(node, 4);
      const text: string[] = [];
      let next = walker.nextNode();
      while (next) {
        const parent = next.parentElement as typeof node | null;
        if (parent && !parent.closest('nav,button,h1,h2,script,style,[hidden]')) {
          const box = parent.getBoundingClientRect();
          const style = parent.ownerDocument.defaultView!.getComputedStyle(parent);
          if (box.width > 0 && box.height > 0 && style.visibility !== 'hidden') text.push(next.textContent || '');
        }
        next = walker.nextNode();
      }
      return text.join(' ').replace(/\s+/g, ' ').trim();
    }).join('|'));
}

export async function checkPrototypeQuality(input: {
  projectRoot: string; entryFile: string; userBrief: string; relatedPaths?: readonly string[];
  remainingBudgetMs?: number; signal?: AbortSignal; executablePath?: string | null;
  screenshotPath?: string;
}): Promise<DeliverableQualityEvidence> {
  const started = performance.now(); const checkedAt = Date.now();
  const budget = Math.max(0, Math.min(PROTOTYPE_HOST_BUDGET_MS, input.remainingBudgetMs ?? PROTOTYPE_HOST_BUDGET_MS));
  const checks: DeliverableQualityCheck[] = [];
  let hash = ''; let expected = 0; let checked = 0; let complete = false;
  const result = (): DeliverableQualityEvidence => ({ schema: DELIVERABLE_QUALITY_SCHEMA, checker: DELIVERABLE_QUALITY_CHECKER,
    status: qualityStatus(checks, complete), candidateHash: hash, entryFile: input.entryFile, checkedAt,
    durationMs: Math.max(0, performance.now() - started), coverage: { expected, checked, complete }, checks });
  const deadline = () => input.signal?.aborted || performance.now() - started >= budget;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let browserServer: Awaited<ReturnType<typeof chromium.launchServer>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    // This process belongs exclusively to the host check. Force-stop on deadline/cancel.
    void browserServer?.kill().catch(() => {});
    void browser?.close().catch(() => {});
  };
  try {
    if (deadline()) throw new Error('host_budget_exhausted');
    const frozen = await runPrototypeStatic({ projectRoot: input.projectRoot, entryFile: input.entryFile, ...(input.relatedPaths ? { relatedPaths: input.relatedPaths } : {}), deadlineAtMs: checkedAt + budget, ...(input.signal ? { signal: input.signal } : {}) });
    hash = frozen.hash; checks.push(...frozen.checks);
    if (checks.some(check => check.status !== 'pass')) return result();
    const source = frozen.files.get(input.entryFile)?.toString() ?? '';
    const required = /(?:app|应用|原型|tab|导航|堂食|自提|切换)/i.test(input.userBrief);
    if (!required && !/(?:<nav|role=['"]tab|data-mode)/i.test(source)) { checks.length = 0; complete = true; return result(); }
    const executablePath = input.executablePath === undefined ? findBrowserExecutable() : input.executablePath;
    if (!executablePath) throw new Error('browser_unavailable');
    if (deadline()) throw new Error('host_budget_exhausted');
    browserServer = await chromium.launchServer({ executablePath, headless: true, chromiumSandbox: true,
      env: { PATH: process.env.PATH ?? '', TMPDIR: os.tmpdir(), LANG: 'en_US.UTF-8' },
      timeout: Math.max(1, budget - (performance.now() - started)),
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update'] });
    if (deadline()) throw new Error('host_budget_exhausted');
    timer = setTimeout(close, Math.max(1, budget - (performance.now() - started)));
    input.signal?.addEventListener('abort', close, { once: true });
    browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: Math.max(1, budget - (performance.now() - started)) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
    let blockedExecutable = false;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const content = url.origin === ORIGIN && route.request().method() === 'GET' ? frozen.files.get(decodeURIComponent(url.pathname.slice(1))) : undefined;
      if (!content) {
        if (['script', 'document', 'stylesheet'].includes(route.request().resourceType())) blockedExecutable = true;
        await route.abort(); return;
      }
      const ext = path.extname(url.pathname);
      const mime = ext === '.js' || ext === '.mjs' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.svg' ? 'image/svg+xml' : ext === '.html' ? 'text/html' : 'application/octet-stream';
      await route.fulfill({ body: content, contentType: `${mime}; charset=utf-8`, headers: { 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'" } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(700);
    const errors: string[] = []; page.on('pageerror', () => errors.push('page_script_error'));
    await page.goto(`${ORIGIN}/${input.entryFile}`, { waitUntil: 'load', timeout: Math.max(1, budget - (performance.now() - started)) });
    let found = await controls(page);
    if (!found.length) {
      const entry = page.getByRole('link', { name: /跳过|开始体验|进入应用/ }).or(page.getByRole('button', { name: /跳过|开始体验|进入应用/ })).filter({ visible: true }).first();
      if (await entry.count()) { await entry.click(); await page.waitForTimeout(100); found = await controls(page); }
    }
    const todo = [...found]; const seen = new Set<string>();
    let origin: Control | undefined;
    for (const item of found) if (!item.mode && await targetVisible(page, item) === true) { origin = item; break; }
    let lastMode: Control | undefined;
    const requirements = prototypeRequiredControls(input.userBrief);
    if (!found.length && required) checks.push({ id: 'navigation-discovery', kind: 'navigation', status: 'incomplete', reason: 'required_navigation_not_reached' });
    while (todo.length && seen.size < 24 && !deadline()) {
      const control = todo.shift()!; if (seen.has(control.label)) continue; seen.add(control.label); expected++;
      try {
        if (!control.mode && lastMode && !(await controls(page)).some(item => item.label === control.label)) {
          await clickControl(page, lastMode); await page.waitForTimeout(80);
        }
        const beforeContent = await visibleContent(page);
        const alreadyAtTarget = await targetVisible(page, control) === true && await selectedControl(page, control) === true;
        // Reacquire nodes after every render; never invoke generated handlers or set hashes directly.
        await clickControl(page, control); await page.waitForTimeout(80);
        let visible = await awaitTarget(page, control, deadline);
        if (visible === true) visible = await selectedControl(page, control);
        if (visible === true && !control.mode && !alreadyAtTarget) {
          const afterContent = await visibleContent(page);
          visible = !afterContent ? null : afterContent === beforeContent ? false : true;
        }
        if (visible === true) {
          if (control.mode) {
            lastMode = control;
            const back = page.getByRole('button', { name: /切换用餐方式|返回用餐方式/ }).filter({ visible: true }).first();
            if (!await back.count()) visible = null;
            else { await back.click(); await clickControl(page, control); visible = await awaitTarget(page, control, deadline); }
          } else {
            if (origin && origin.label !== control.label) {
              await clickControl(page, origin); await page.waitForTimeout(80);
              if (await awaitTarget(page, origin, deadline) !== true) visible = false;
            }
            if (visible === true) { await clickControl(page, control); visible = await awaitTarget(page, control, deadline); }
          }
        }
        checks.push({ id: `navigation-${seen.size}`, kind: 'navigation', control: control.label,
          status: visible === true ? 'pass' : visible === false && !blockedExecutable ? 'fail' : 'incomplete',
          reason: visible === true ? 'visible_semantic_target_and_repeat' : visible === false ? 'semantic_target_not_visible' : 'target_cannot_be_determined' });
        checked++;
        const next = await controls(page); for (const item of next) if (!seen.has(item.label) && !todo.some(c => c.label === item.label)) todo.push(item);
        if (control.mode) {
          const back = page.getByRole('button', { name: /切换用餐方式|返回用餐方式/ }).filter({ visible: true }).first();
          if (await back.count()) await back.click();
        }
      } catch {
        const interrupted = deadline() || blockedExecutable || !browser.isConnected();
        checks.push({ id: `navigation-${seen.size}`, kind: 'navigation', control: control.label, status: interrupted ? 'incomplete' : 'fail', reason: input.signal?.aborted ? 'canceled' : deadline() ? 'host_budget_exhausted' : interrupted ? 'check_environment_incomplete' : 'control_unreachable_or_binding_lost' }); checked++;
      }
    }
    for (const label of requirements.labels) if (![...seen].some(name => semanticLabel(name) === semanticLabel(label))) {
      expected++;
      checks.push({ id: `missing-${checks.length}`, kind: 'navigation', control: label, status: blockedExecutable || deadline() ? 'incomplete' : 'fail', reason: 'required_entry_missing' });
    }
    if (requirements.unresolved) checks.push({ id: 'requirements', kind: 'navigation', status: 'incomplete', reason: 'required_navigation_scope_unresolved' });
    if (blockedExecutable) checks.push({ id: 'dependencies', kind: 'navigation', status: 'incomplete', reason: 'executable_dependency_unavailable_in_isolation' });
    if (errors.length) checks.push({ id: 'browser-script', kind: 'navigation', status: blockedExecutable ? 'incomplete' : 'fail', reason: blockedExecutable ? 'isolated_dependency_error' : 'page_script_error' });
    complete = found.length > 0 && !todo.length && !deadline() && checks.every(check => check.status === 'pass');
    if (deadline()) checks.push({ id: 'budget', kind: 'navigation', status: 'incomplete', reason: input.signal?.aborted ? 'canceled' : 'host_budget_exhausted' });
    if (input.screenshotPath) await page.screenshot({ path: input.screenshotPath });
    const latest = await runPrototypeStatic({ projectRoot: input.projectRoot, entryFile: input.entryFile, ...(input.relatedPaths ? { relatedPaths: input.relatedPaths } : {}), deadlineAtMs: checkedAt + budget, ...(input.signal ? { signal: input.signal } : {}), mode: 'snapshot' });
    if (latest.hash !== hash) { complete = false; checks.push({ id: 'version', kind: 'static', status: 'incomplete', reason: 'candidate_changed_during_check' }); }
  } catch (error) {
    const reason = input.signal?.aborted ? 'canceled' : error instanceof Error && ['browser_unavailable', 'host_budget_exhausted', 'snapshot_limit', 'snapshot_path_outside_project'].includes(error.message) ? error.message : deadline() ? 'host_budget_exhausted' : 'check_environment_incomplete';
    checks.push({ id: 'environment', kind: 'navigation', status: 'incomplete', reason });
  } finally {
    if (timer) clearTimeout(timer); input.signal?.removeEventListener('abort', close);
    await Promise.race([browser?.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 500))]);
    await browserServer?.kill().catch(() => {});
  }
  return result();
}
