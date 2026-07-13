// Phase 6/7 entry slice — design-extract atom impl.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCodeImport } from '../src/plugins/atoms/code-import.js';
import { runDesignExtract } from '../src/plugins/atoms/design-extract.js';

let repo: string;
let cwd: string;

beforeEach(async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-design-extract-'));
  repo = path.join(tmp, 'repo');
  cwd = path.join(tmp, 'cwd');
  await mkdir(repo, { recursive: true });
  await mkdir(cwd, { recursive: true });
});

afterEach(async () => {
  await rm(path.dirname(repo), { recursive: true, force: true });
});

async function importThenExtract() {
  await runCodeImport({ repoPath: repo, cwd });
  return runDesignExtract({ cwd, repoPath: repo });
}

describe('runDesignExtract', () => {
  it('extracts hex / rgba / CSS-variable colours from CSS', async () => {
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(path.join(repo, 'theme.css'), `
:root {
  --primary-color: #5b8def;
  --surface-bg: rgba(255, 255, 255, 0.8);
}
.btn { background: #5b8def; color: rgb(20, 30, 40); }
`);
    const report = await importThenExtract();
    const values = report.colors.map((t) => t.value);
    expect(values).toContain('#5b8def');
    expect(values).toContain('rgb(20, 30, 40)');
    expect(values).toContain('rgba(255, 255, 255, 0.8)');
    // Two hex sources should dedupe by value.
    const blue = report.colors.find((t) => t.value.toLowerCase() === '#5b8def');
    expect(blue?.sources.length).toBeGreaterThanOrEqual(2);
  });

  it('captures font-family declarations', async () => {
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(path.join(repo, 'global.css'), `
body { font-family: 'Inter', system-ui, sans-serif; }
.heading { font-family: 'Recoleta', serif; }
`);
    const report = await importThenExtract();
    const fonts = report.typography.map((t) => t.value);
    expect(fonts).toEqual(expect.arrayContaining([
      expect.stringMatching(/Inter/),
      expect.stringMatching(/Recoleta/),
    ]));
  });

  it('extracts spacing px / rem values from common CSS properties', async () => {
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(path.join(repo, 'spacing.css'), `
.row { padding: 16px; gap: 8px; margin: 1.5rem; }
`);
    const report = await importThenExtract();
    const values = report.spacing.map((t) => t.value);
    expect(values).toEqual(expect.arrayContaining(['16px', '8px', '1.5rem']));
  });

  it('captures border-radius + box-shadow values', async () => {
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(path.join(repo, 'card.css'), `
.card {
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
`);
    const report = await importThenExtract();
    expect(report.radius.map((t) => t.value)).toContain('12px');
    expect(report.shadow.length).toBeGreaterThan(0);
  });

  it('captures Tailwind config quoted hex palette entries', async () => {
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: 'fixture',
      devDependencies: { tailwindcss: '4' },
    }));
    await writeFile(path.join(repo, 'tailwind.config.js'), `
module.exports = {
  theme: { extend: { colors: {
    brand: { 500: '#5b8def', 600: '#3e6dca' }
  }}}
};
`);
    const report = await importThenExtract();
    const values = report.colors.map((t) => t.value.toLowerCase());
    expect(values).toEqual(expect.arrayContaining(['#5b8def', '#3e6dca']));
  });

  it('persists code/tokens.json under cwd', async () => {
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(path.join(repo, 'a.css'), '.x { color: #abcdef; }');
    await importThenExtract();
    const json = JSON.parse(await readFile(path.join(cwd, 'code', 'tokens.json'), 'utf8'));
    expect(json.colors.length).toBeGreaterThan(0);
    expect(json.scannedFiles).toContain('a.css');
  });

  it('throws a clear error when code/index.json is missing', async () => {
    await expect(runDesignExtract({ cwd, repoPath: repo }))
      .rejects.toThrow(/code-import first/);
  });

  it('returns an empty bag when no source files contain design tokens', async () => {
    await writeFile(path.join(repo, 'README.md'), '# fixture without tokens\n\nNothing to extract.');
    const report = await importThenExtract();
    expect(report.colors).toEqual([]);
    expect(report.spacing).toEqual([]);
    expect(report.typography).toEqual([]);
  });
});
