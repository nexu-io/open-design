import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findBrowserExecutable } from '../../../src/browser-sessions.js';
import {
  auditOdNextPrototypeArtifact,
  renderOdNextArtifactFindings,
  runtimeAuditArtifact,
  syntaxAuditArtifact,
} from '../../../src/strategies/od-next/artifact-audit.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

async function projectWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'od-artifact-audit-'));
  temporaryRoots.push(dir);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content);
  }
  return dir;
}

// The v2.0_007 shape: one mismatched quote makes a large inline script fail to
// parse, so a JS-rendered page ships completely blank while the eval records
// succeeded. L0 must catch it in milliseconds with a line number.
const BROKEN_QUOTE_HTML = `<!doctype html><html><head><title>t</title></head><body>
<div id="app"></div>
<script>
const a = 1;
let html = '';
html += '<div class="card">今日任务提醒</div>";
document.getElementById('app').innerHTML = html;
</script>
</body></html>`;

describe('syntaxAuditArtifact (L0)', () => {
  it('flags a quote-mismatched inline script with its line and evidence', async () => {
    const root = await projectWith({ 'index.html': BROKEN_QUOTE_HTML });
    const findings = await syntaxAuditArtifact({ projectRoot: root, entryFile: 'index.html' });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'js-syntax-error',
      severity: 'P0',
      file: 'index.html',
      line: 6,
    });
    expect(findings[0]!.evidence).toContain('今日任务提醒');
  });

  it('checks same-directory external scripts and reports their own file', async () => {
    const root = await projectWith({
      'index.html': '<!doctype html><html><body><script src="app.js"></script></body></html>',
      'app.js': 'function f( {\n  return 1;\n}\n',
    });
    const findings = await syntaxAuditArtifact({ projectRoot: root, entryFile: 'index.html' });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'js-syntax-error', file: 'app.js' });
  });

  it('stays silent for parseable scripts, module scripts, and external origins', async () => {
    const root = await projectWith({
      'index.html': [
        '<!doctype html><html><body>',
        '<script>const ok = () => 1; ok();</script>',
        '<script type="module">import x from "./x.js";</script>',
        '<script src="https://example.com/cdn.js"></script>',
        '<script src="../outside.js"></script>',
        '</body></html>',
      ].join('\n'),
    });
    expect(await syntaxAuditArtifact({ projectRoot: root, entryFile: 'index.html' })).toEqual([]);
  });
});

// The runtime layer needs a real system Chrome; on hosts without one the
// audit reports browser: 'missing' and never blocks anything.
const chrome = findBrowserExecutable();

describe('runtimeAuditArtifact (L1)', () => {
  it('reports browser missing instead of failing when no Chrome exists', async () => {
    if (chrome) return; // covered by the real-browser specs below
    const root = await projectWith({ 'index.html': '<!doctype html><html><body></body></html>' });
    const result = await runtimeAuditArtifact({ projectRoot: root, entryFile: 'index.html' });
    expect(result).toEqual({ findings: [], browser: 'missing' });
  });

  it.skipIf(!chrome)('flags a page whose startup exception kills every interaction', async () => {
    // The v2.0_009 shape: markup renders (pretty), but an uncaught error in
    // init() means zero listeners are ever bound.
    const root = await projectWith({
      'index.html': `<!doctype html><html><body>
        <button data-act="a">首页</button>
        <button data-act="b">服务</button>
        <button data-act="c">我的</button>
        <script>
          function init() { const t = {}; t('boom'); document.body.addEventListener('click', () => {
            document.body.setAttribute('data-clicked', '1');
          }); }
          document.addEventListener('DOMContentLoaded', init);
        </script>
      </body></html>`,
    });
    const result = await runtimeAuditArtifact({ projectRoot: root, entryFile: 'index.html', timeoutMs: 20_000 });
    expect(result.browser).toBe('available');
    expect(result.findings.map((finding) => finding.rule)).toContain('zero-interaction');
    expect(result.findings.find((finding) => finding.rule === 'zero-interaction')?.evidence)
      .toMatch(/is not a function/);
  }, 30_000);

  it.skipIf(!chrome)('passes a page whose controls actually respond', async () => {
    const root = await projectWith({
      'index.html': `<!doctype html><html><body>
        <button data-act="a">首页</button>
        <button data-act="b">服务</button>
        <button data-act="c">我的</button>
        <div id="out"></div>
        <script>
          document.body.addEventListener('click', (event) => {
            const act = event.target.getAttribute('data-act');
            if (act) document.getElementById('out').textContent = act + Date.now();
          });
        </script>
      </body></html>`,
    });
    const result = await runtimeAuditArtifact({ projectRoot: root, entryFile: 'index.html', timeoutMs: 20_000 });
    expect(result.browser).toBe('available');
    expect(result.findings).toEqual([]);
  }, 30_000);

  it.skipIf(!chrome)('flags a phone-shell bottom navigation that scrolls with the content', async () => {
    // The astro shape: a flex-column skeleton mounted inside the shell's
    // scroll container, nav in normal flow — it drifts mid-screen on scroll.
    const root = await projectWith({
      'index.html': `<!doctype html><html><head><style>
          .phone-screen { position: relative; width: 390px; height: 600px; overflow: hidden; }
          .phone-content { position: absolute; inset: 0; overflow-y: auto; }
          .tall { height: 1800px; }
          .app-nav { display: grid; grid-template-columns: repeat(3, 1fr); }
        </style></head><body>
        <div data-phone-shell data-platform="neutral">
          <section class="phone-screen" data-phone-screen>
            <main class="phone-content" data-phone-content>
              <div class="tall">content</div>
              <nav class="app-nav">
                <button onclick="this.setAttribute('data-x','1')">首页</button>
                <button onclick="this.setAttribute('data-x','1')">服务</button>
                <button onclick="this.setAttribute('data-x','1')">我的</button>
              </nav>
              <div style="height:120px">after nav</div>
            </main>
          </section>
        </div>
        <script>document.querySelector('.phone-content').scrollTop = 1400;</script>
      </body></html>`,
    });
    const result = await runtimeAuditArtifact({ projectRoot: root, entryFile: 'index.html', timeoutMs: 20_000 });
    expect(result.browser).toBe('available');
    expect(result.findings.map((finding) => finding.rule)).toContain('nav-not-pinned');
  }, 30_000);

  it.skipIf(!chrome)('accepts a pinned bottom navigation and a plain landing page', async () => {
    const root = await projectWith({
      'index.html': `<!doctype html><html><head><style>
          .phone-screen { position: relative; width: 390px; height: 600px; overflow: hidden; }
          .phone-content { position: absolute; inset: 0; overflow-y: auto; }
          .tall { height: 1800px; }
          .app-nav { position: sticky; bottom: 0; display: grid; grid-template-columns: repeat(3, 1fr); }
        </style></head><body>
        <div data-phone-shell data-platform="neutral">
          <section class="phone-screen" data-phone-screen>
            <main class="phone-content" data-phone-content>
              <div class="tall">content</div>
              <nav class="app-nav">
                <button onclick="this.setAttribute('data-x','1')">首页</button>
                <button onclick="this.setAttribute('data-x','1')">服务</button>
                <button onclick="this.setAttribute('data-x','1')">我的</button>
              </nav>
            </main>
          </section>
        </div>
      </body></html>`,
    });
    const result = await runtimeAuditArtifact({ projectRoot: root, entryFile: 'index.html', timeoutMs: 20_000 });
    expect(result.browser).toBe('available');
    expect(result.findings).toEqual([]);
  }, 30_000);
});

describe('auditOdNextPrototypeArtifact + rendering', () => {
  it('short-circuits on syntax findings without launching a browser', async () => {
    const root = await projectWith({ 'index.html': BROKEN_QUOTE_HTML });
    const result = await auditOdNextPrototypeArtifact({ projectRoot: root, entryFile: 'index.html' });
    expect(result.findings.map((finding) => finding.rule)).toEqual(['js-syntax-error']);
    expect(result.elapsedMs).toBeLessThan(2_000);
  });

  it('renders findings grouped by rule with file:line locations', () => {
    const text = renderOdNextArtifactFindings([
      { rule: 'js-syntax-error', severity: 'P0', file: 'index.html', line: 868, detail: 'JavaScript fails to parse: Invalid or unexpected token.', evidence: "html += '<div>x</div>\";" },
      { rule: 'zero-interaction', severity: 'P0', file: 'index.html', detail: 'No probed control produced any DOM reaction.' },
    ]);
    expect(text).toContain('### js-syntax-error (1)');
    expect(text).toContain('index.html:868');
    expect(text).toContain('### zero-interaction (1)');
  });
});
