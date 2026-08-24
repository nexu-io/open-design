import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

import { findBrowserExecutable } from '../../browser-sessions.js';

/**
 * Deterministic post-delivery audit for OD Next prototype artifacts.
 *
 * Two layers, both harness-owned — the agent never sees them run:
 *
 * - L0 (`syntaxAuditArtifact`): parse every JavaScript the entry carries.
 *   Milliseconds, no browser. Catches the "one mismatched quote kills a 95KB
 *   script" class where the delivered page renders blank.
 * - L1 (`runtimeAuditArtifact`): load the entry once in headless system
 *   Chrome over CDP, collect uncaught exceptions, then probe behavior —
 *   click a handful of primary controls and watch for DOM reaction, and
 *   check that a phone-shell app's bottom navigation is actually pinned.
 *   Seconds, skipped gracefully when no browser is installed.
 *
 * Severity is impact-based: a P0 means the delivered artifact is broken for
 * every user (nothing parses, nothing responds, core chrome detached) — the
 * uncaught exception itself is carried as evidence, never as the verdict.
 */

export interface OdNextArtifactFinding {
  rule:
    | 'js-syntax-error'
    | 'zero-interaction'
    | 'nav-not-pinned';
  severity: 'P0';
  /** Project-relative file (L0) or entry file (L1). */
  file: string;
  /** 1-based line inside the file when known. */
  line?: number;
  detail: string;
  evidence?: string;
}

export interface OdNextArtifactAuditResult {
  findings: OdNextArtifactFinding[];
  /** Whether the runtime layer actually ran. */
  browser: 'available' | 'missing' | 'timeout' | 'error';
  elapsedMs: number;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function scriptLineOffset(html: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (html.charCodeAt(i) === 10) line += 1;
  return line;
}

/**
 * L0: syntax-parse the entry's inline scripts and its same-directory external
 * scripts. `type="module"` scripts are skipped (vm.Script parses classic
 * scripts only); the runtime layer still covers them via page errors.
 */
export async function syntaxAuditArtifact(input: {
  projectRoot: string;
  entryFile: string;
}): Promise<OdNextArtifactFinding[]> {
  const entryPath = path.resolve(input.projectRoot, input.entryFile);
  const relative = path.relative(input.projectRoot, entryPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return [];
  let html: string;
  try {
    html = await readFile(entryPath, 'utf8');
  } catch {
    return [];
  }
  const findings: OdNextArtifactFinding[] = [];
  const check = (code: string, file: string, baseLine: number): void => {
    try {
      // eslint-disable-next-line no-new -- parse-only syntax check
      new vm.Script(code, { filename: file });
    } catch (error) {
      if (!(error instanceof SyntaxError)) return;
      const stackLine = /:(\d+)\n/.exec((error as Error & { stack?: string }).stack ?? '');
      const inScript = stackLine ? Number(stackLine[1]) : undefined;
      const line = inScript === undefined ? undefined : baseLine + inScript - 1;
      const snippet = inScript === undefined
        ? undefined
        : code.split('\n')[inScript - 1]?.trim().slice(0, 160);
      findings.push({
        rule: 'js-syntax-error',
        severity: 'P0',
        file,
        ...(line === undefined ? {} : { line }),
        detail: `JavaScript fails to parse: ${error.message}. Nothing in this script runs, so every behavior it owns is dead.`,
        ...(snippet ? { evidence: snippet } : {}),
      });
    }
  };
  let match: RegExpExecArray | null;
  while ((match = SCRIPT_RE.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const type = /type\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'application/javascript') continue;
    const src = /src\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    if (src) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)) continue; // external origin
      const target = path.resolve(path.dirname(entryPath), src.split(/[?#]/)[0] ?? src);
      const rel = path.relative(input.projectRoot, target);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
      try {
        check(await readFile(target, 'utf8'), rel.split(path.sep).join('/'), 1);
      } catch {
        // missing script file is the runtime layer's business
      }
      continue;
    }
    if (body.trim().length === 0) continue;
    const bodyStart = (match.index ?? 0) + match[0].indexOf(body);
    check(body, input.entryFile, scriptLineOffset(html, bodyStart));
  }
  return findings;
}

interface CdpClient {
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  onEvent(handler: (method: string, params: Record<string, unknown>) => void): void;
  close(): void;
}

async function connectCdp(wsUrl: string): Promise<CdpClient> {
  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  const eventHandlers: Array<(method: string, params: Record<string, unknown>) => void> = [];
  socket.addEventListener('message', (event) => {
    let parsed: { id?: number; result?: Record<string, unknown>; error?: { message?: string }; method?: string; params?: Record<string, unknown> };
    try {
      parsed = JSON.parse(String((event as MessageEvent).data));
    } catch {
      return;
    }
    if (parsed.id !== undefined) {
      const waiter = pending.get(parsed.id);
      if (!waiter) return;
      pending.delete(parsed.id);
      if (parsed.error) waiter.reject(new Error(parsed.error.message ?? 'CDP error'));
      else waiter.resolve(parsed.result ?? {});
      return;
    }
    if (parsed.method) {
      for (const handler of eventHandlers) handler(parsed.method, parsed.params ?? {});
    }
  });
  return {
    send: (method, params) => new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    }),
    onEvent: (handler) => { eventHandlers.push(handler); },
    close: () => { try { socket.close(); } catch { /* closed */ } },
  };
}

/**
 * In-page probe. Runs once after load inside the artifact page. Returns a
 * JSON-serializable report:
 * - interaction: how many visible controls exist and how many of the probed
 *   ones produced any observable reaction (DOM mutation, hash change,
 *   attribute flip) — the behavior-based verdict the audit rules on.
 * - navPinned: for phone-shell artifacts only, whether a bottom navigation
 *   bar (≥3 actions in the lower part of the screen) is pinned (sticky/fixed/
 *   absolute against a non-scrolling ancestor) rather than floating in the
 *   scrolled content flow.
 */
const PROBE_SOURCE = `(async () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const controls = [...document.querySelectorAll('button, [role="button"], [role="tab"], a[href], [data-act], [data-go], [data-view], [data-tab], [onclick]')].filter(vis);
  const shell = document.querySelector('[data-phone-shell]');
  const report = { controls: controls.length, probed: 0, reacted: 0, navBars: [] };

  let mutations = 0;
  const observer = new MutationObserver((batch) => { mutations += batch.length; });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  const seen = new Set();
  const candidates = [];
  for (const el of controls) {
    const key = (el.getAttribute('data-tab') || el.getAttribute('data-act') || el.getAttribute('data-go') || el.getAttribute('href') || el.textContent || '').trim().slice(0, 24) + '|' + el.className;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(el);
    if (candidates.length >= 6) break;
  }
  for (const el of candidates) {
    const before = mutations;
    const hashBefore = location.hash;
    try { el.click(); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 320));
    report.probed += 1;
    if (mutations > before || location.hash !== hashBefore) report.reacted += 1;
  }
  observer.disconnect();

  if (shell) {
    const content = shell.querySelector('[data-phone-content], .phone-content') || shell;
    const findScroller = (from) => {
      let node = from;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 40) return node;
        node = node.parentElement;
      }
      return null;
    };
    const screenRect = (shell.querySelector('[data-phone-screen], .phone-screen') || shell).getBoundingClientRect();
    const bars = [...shell.querySelectorAll('nav, footer, [class*="tab"], [class*="nav"], [class*="bar"], [class*="dock"]')]
      .filter(vis)
      .filter((el) => [...el.querySelectorAll('button, a, [role="tab"], [role="button"]')].filter(vis).length >= 3)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top > screenRect.top + screenRect.height * 0.5 && r.height < screenRect.height * 0.3;
      });
    const outer = new Set();
    for (const bar of bars) {
      if ([...outer].some((kept) => kept.contains(bar))) continue;
      outer.add(bar);
    }
    for (const bar of outer) {
      // Pinned means the bar does not travel with the scrolled content:
      // a fixed/sticky anywhere between the bar and its scroll container, or
      // an absolute anchored to something outside the scroller. An absolute
      // anchored to the scroller itself (or anything inside it) lives in the
      // scrolled canvas and travels with the content.
      const scroller = findScroller(bar.parentElement);
      let pinned = !scroller;
      if (scroller) {
        let node = bar;
        while (node && node !== scroller) {
          const cs = getComputedStyle(node);
          if (cs.position === 'fixed' || cs.position === 'sticky') { pinned = true; break; }
          if (cs.position === 'absolute') {
            const anchor = node.offsetParent;
            pinned = !(anchor && (anchor === scroller || scroller.contains(anchor)));
            break;
          }
          node = node.parentElement;
        }
      }
      report.navBars.push({
        selector: (bar.tagName.toLowerCase() + (bar.className ? '.' + String(bar.className).trim().split(/\\s+/).slice(0, 2).join('.') : '')).slice(0, 80),
        pinned,
        insideScrollableFlow: Boolean(scroller) && !pinned,
      });
    }
  }
  return JSON.stringify(report);
})()`;

interface RuntimeProbeReport {
  controls: number;
  probed: number;
  reacted: number;
  navBars: Array<{ selector: string; pinned: boolean; insideScrollableFlow: boolean }>;
}

/**
 * L1: one headless load of the entry in system Chrome. Collects uncaught
 * exceptions during startup as evidence, then applies the behavior probe.
 * Every failure mode degrades to a non-verdict (`browser: missing|timeout|
 * error`) — the audit never blocks or delays delivery on its own.
 */
export async function runtimeAuditArtifact(input: {
  projectRoot: string;
  entryFile: string;
  timeoutMs?: number;
}): Promise<Pick<OdNextArtifactAuditResult, 'findings' | 'browser'>> {
  const executable = findBrowserExecutable();
  if (!executable) return { findings: [], browser: 'missing' };
  const timeoutMs = input.timeoutMs ?? 10_000;
  const entryPath = path.resolve(input.projectRoot, input.entryFile);
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'od-artifact-audit-'));
  const child = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const cleanup = (): void => {
    try { child.kill('SIGKILL'); } catch { /* gone */ }
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* leaked tmp */ }
  };
  try {
    const audit = (async (): Promise<Pick<OdNextArtifactAuditResult, 'findings' | 'browser'>> => {
      const wsUrl = await new Promise<string>((resolve, reject) => {
        let buffer = '';
        child.stderr?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const found = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
          if (found?.[1]) resolve(found[1]);
        });
        child.once('exit', () => reject(new Error('browser exited before DevTools was ready')));
      });
      const version = new URL(wsUrl);
      const listResponse = await fetch(`http://${version.host}/json/list`);
      const targets = await listResponse.json() as Array<{ type: string; webSocketDebuggerUrl?: string }>;
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (!page?.webSocketDebuggerUrl) throw new Error('no page target');
      const cdp = await connectCdp(page.webSocketDebuggerUrl);
      const exceptions: string[] = [];
      cdp.onEvent((method, params) => {
        if (method !== 'Runtime.exceptionThrown') return;
        const details = params['exceptionDetails'] as {
          text?: string;
          lineNumber?: number;
          exception?: { description?: string };
        } | undefined;
        const description = details?.exception?.description ?? details?.text ?? 'uncaught exception';
        exceptions.push(`${description.split('\n')[0]?.slice(0, 200)}${details?.lineNumber !== undefined ? ` (line ${details.lineNumber + 1})` : ''}`);
      });
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      const loaded = new Promise<void>((resolve) => {
        cdp.onEvent((method) => { if (method === 'Page.loadEventFired') resolve(); });
      });
      await cdp.send('Page.navigate', { url: `file://${entryPath}` });
      await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 5_000))]);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const evaluated = await cdp.send('Runtime.evaluate', {
        expression: PROBE_SOURCE,
        awaitPromise: true,
        returnByValue: true,
      });
      cdp.close();
      const raw = (evaluated['result'] as { value?: string } | undefined)?.value;
      if (typeof raw !== 'string') return { findings: [], browser: 'error' };
      const report = JSON.parse(raw) as RuntimeProbeReport;
      const findings: OdNextArtifactFinding[] = [];
      if (report.controls >= 3 && report.probed >= 3 && report.reacted === 0) {
        findings.push({
          rule: 'zero-interaction',
          severity: 'P0',
          file: input.entryFile,
          detail: `The page renders but none of ${report.probed} probed controls (of ${report.controls} visible) produced any DOM reaction — every interaction is dead.`,
          ...(exceptions.length > 0 ? { evidence: exceptions.slice(0, 3).join(' | ') } : {}),
        });
      }
      for (const bar of report.navBars) {
        if (!bar.insideScrollableFlow) continue;
        findings.push({
          rule: 'nav-not-pinned',
          severity: 'P0',
          file: input.entryFile,
          detail: `Bottom navigation ${bar.selector} sits in the scrolled content flow, so it drifts with the page instead of staying pinned. Give it position: sticky; bottom: 0 inside the scroller (or restructure as header + scroll area + footer rows).`,
        });
      }
      return { findings, browser: 'available' };
    })();
    return await Promise.race([
      audit,
      new Promise<Pick<OdNextArtifactAuditResult, 'findings' | 'browser'>>((resolve) => {
        setTimeout(() => resolve({ findings: [], browser: 'timeout' }), timeoutMs);
      }),
    ]);
  } catch {
    return { findings: [], browser: 'error' };
  } finally {
    cleanup();
  }
}

/** Full audit: L0 always, L1 when a browser exists and L0 found nothing fatal. */
export async function auditOdNextPrototypeArtifact(input: {
  projectRoot: string;
  entryFile: string;
  timeoutMs?: number;
}): Promise<OdNextArtifactAuditResult> {
  const startedAt = Date.now();
  const findings = await syntaxAuditArtifact(input);
  // A file that does not parse makes the runtime layer redundant for the
  // verdict; skip the browser and keep the audit in milliseconds.
  if (findings.length > 0) {
    return { findings, browser: 'available', elapsedMs: Date.now() - startedAt };
  }
  const runtime = await runtimeAuditArtifact(input);
  return {
    findings: runtime.findings,
    browser: runtime.browser,
    elapsedMs: Date.now() - startedAt,
  };
}

/** Findings rendered for the corrective continuation payload, grouped by rule. */
export function renderOdNextArtifactFindings(findings: readonly OdNextArtifactFinding[]): string {
  const groups = new Map<string, OdNextArtifactFinding[]>();
  for (const finding of findings) {
    const list = groups.get(finding.rule) ?? [];
    list.push(finding);
    groups.set(finding.rule, list);
  }
  return [...groups.entries()].map(([rule, list]) => {
    const lines = list.slice(0, 5).map((finding) => (
      `- ${finding.file}${finding.line === undefined ? '' : `:${finding.line}`} — ${finding.detail}${finding.evidence ? `\n  evidence: ${finding.evidence}` : ''}`
    ));
    return `### ${rule} (${list.length})\n${lines.join('\n')}`;
  }).join('\n\n');
}
