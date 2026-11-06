// Phase 7 entry slice — rewrite-plan atom impl.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCodeImport } from '../src/plugins/atoms/code-import.js';
import { runDesignExtract } from '../src/plugins/atoms/design-extract.js';
import { runRewritePlan } from '../src/plugins/atoms/rewrite-plan.js';

let repo: string;
let cwd: string;

beforeEach(async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-rewrite-plan-'));
  repo = path.join(tmp, 'repo');
  cwd = path.join(tmp, 'cwd');
  await mkdir(repo, { recursive: true });
  await mkdir(cwd, { recursive: true });
});

afterEach(async () => {
  await rm(path.dirname(repo), { recursive: true, force: true });
});

async function setupNextRepo() {
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({
    name: 'fixture',
    dependencies: { next: '15', react: '18' },
    devDependencies: { tailwindcss: '4' },
  }));
  await writeFile(path.join(repo, 'pnpm-lock.yaml'), '');
  await mkdir(path.join(repo, 'app'),       { recursive: true });
  await mkdir(path.join(repo, 'components'),{ recursive: true });
  await mkdir(path.join(repo, 'lib'),       { recursive: true });
  await writeFile(path.join(repo, 'app', 'layout.tsx'),
    `export default function Layout({ children }: any) { return <html><body>{children}</body></html>; }\n`);
  await writeFile(path.join(repo, 'app', 'page.tsx'),
    `import Button from '@/components/Button';\nexport default function Page() { return <Button />; }\n`);
  await writeFile(path.join(repo, 'components', 'Button.tsx'),
    `export default function Button() { return <button style={{ color: '#5b8def' }} />; }\n`);
  await writeFile(path.join(repo, 'components', 'Button.css'),
    `.btn { padding: 16px; color: #5b8def; }`);
  await writeFile(path.join(repo, 'lib', 'fetcher.ts'),
    `export const fetcher = (u: string) => fetch(u).then((r) => r.json());\n`);
  await runCodeImport({ repoPath: repo, cwd });
  await runDesignExtract({ cwd, repoPath: repo });
}

describe('runRewritePlan', () => {
  it('classifies ownership across leaf / shared / route / shell', async () => {
    await setupNextRepo();
    const report = await runRewritePlan({ cwd, intent: 'tighten the brand' });
    const own = new Map(report.ownership.map((o) => [o.file, o.layer]));
    expect(own.get('app/layout.tsx')).toBe('shell');
    expect(own.get('app/page.tsx')).toBe('route');
    expect(own.get('components/Button.tsx')).toBe('leaf');
    expect(own.get('lib/fetcher.ts')).toBe('shared');
    // Root-level package.json defaults to shared (config) per the
    // safety contract.
    expect(own.get('package.json')).toBe('shared');
  });

  it('produces a tokens-alignment step when design-extract found inline literals', async () => {
    await setupNextRepo();
    const report = await runRewritePlan({ cwd });
    const ids = report.steps.map((s) => s.id);
    expect(ids).toContain('tokens-alignment');
    const step = report.steps.find((s) => s.id === 'tokens-alignment');
    expect(step?.risk).toBe('low');
    expect(step?.files.length).toBeGreaterThan(0);
  });

  it('emits one rewrite-<slug> step per leaf component file', async () => {
    await setupNextRepo();
    const report = await runRewritePlan({ cwd });
    const rewriteIds = report.steps.map((s) => s.id).filter((id) => id.startsWith('rewrite-'));
    expect(rewriteIds.length).toBeGreaterThanOrEqual(1);
    const buttonStep = report.steps.find((s) => s.id === 'rewrite-button');
    expect(buttonStep).toBeDefined();
    // Sibling stylesheet bundled into the same step.
    expect(buttonStep?.files).toEqual(expect.arrayContaining([
      'components/Button.tsx',
      'components/Button.css',
    ]));
  });

  it('always ends with a build-test step', async () => {
    await setupNextRepo();
    const report = await runRewritePlan({ cwd });
    const last = report.steps[report.steps.length - 1];
    expect(last?.id).toBe('build-test');
    expect(last?.risk).toBe('low');
  });

  it('persists plan/{plan.md, ownership.json, steps.json, meta.json} under cwd', async () => {
    await setupNextRepo();
    await runRewritePlan({ cwd, intent: 'mvp polish' });
    const planMd  = await readFile(path.join(cwd, 'plan', 'plan.md'),       'utf8');
    const ownJson = JSON.parse(await readFile(path.join(cwd, 'plan', 'ownership.json'), 'utf8'));
    const stepsJson = JSON.parse(await readFile(path.join(cwd, 'plan', 'steps.json'), 'utf8'));
    const metaJson  = JSON.parse(await readFile(path.join(cwd, 'plan', 'meta.json'), 'utf8'));
    expect(planMd).toContain('# Rewrite plan');
    expect(planMd).toContain('mvp polish');
    expect(Array.isArray(ownJson)).toBe(true);
    expect(stepsJson.some((s: { id: string }) => s.id === 'build-test')).toBe(true);
    expect(typeof metaJson.atomDigest).toBe('string');
    expect(metaJson.atomDigest.length).toBe(40);
  });

  it('produces stable atomDigest across two runs over the same code/index.json', async () => {
    await setupNextRepo();
    const a = await runRewritePlan({ cwd, intent: 'x' });
    const b = await runRewritePlan({ cwd, intent: 'y' });
    // Intent does not contribute to atomDigest; only the canonicalised
    // code/index.json roster does.
    expect(a.meta.atomDigest).toBe(b.meta.atomDigest);
    // Different intents produce different plan.md though.
    expect(a.planMarkdown).not.toBe(b.planMarkdown);
  });

  it('throws a clear error when code/index.json is missing', async () => {
    await expect(runRewritePlan({ cwd })).rejects.toThrow(/code-import first/);
  });
});
