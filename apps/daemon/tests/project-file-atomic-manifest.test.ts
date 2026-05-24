import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('writeProjectFile atomic manifest write', () => {
  let tempDir: string;
  let projectsRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-atomic-'));
    projectsRoot = path.join(tempDir, 'projects');
    fs.mkdirSync(projectsRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const validManifest = {
    version: 1,
    kind: 'html',
    title: 'Test',
    entry: 'page.html',
    renderer: 'html',
    exports: ['html'],
    updatedAt: '2026-05-01T00:00:00.000Z',
  };

  it('writes manifest atomically; no .tmp debris left after success', async () => {
    const { writeProjectFile } = await import('../src/projects.js');
    await writeProjectFile(
      projectsRoot,
      'proj-1',
      'page.html',
      '<html>hello</html>',
      { artifactManifest: validManifest },
    );

    const projectDir = path.join(projectsRoot, 'proj-1');
    const manifestPath = path.join(projectDir, 'page.html.artifact.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const tmpFiles = fs.readdirSync(projectDir).filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toEqual([]);

    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(parsed.kind).toBe('html');
  });

  it('recovers from a left-behind temp manifest on the next write', async () => {
    const { writeProjectFile } = await import('../src/projects.js');
    const projectDir = path.join(projectsRoot, 'proj-1');
    fs.mkdirSync(projectDir, { recursive: true });

    // Simulate a crash: a stale temp manifest from a previous run.
    const manifestPath = path.join(projectDir, 'page.html.artifact.json');
    const staleTmp = `${manifestPath}.tmp`;
    fs.writeFileSync(staleTmp, '{"kind":"stale"}');

    await writeProjectFile(
      projectsRoot,
      'proj-1',
      'page.html',
      '<html>hello</html>',
      { artifactManifest: validManifest },
    );

    // Final manifest must be correct.
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(parsed.kind).toBe('html');

    // Stale temp must be gone (rename overwrites the destination on POSIX).
    // On Windows, rename would fail if dest exists, but Node's rename on
    // Windows replaces the destination file since Node 6.
    expect(fs.existsSync(staleTmp)).toBe(false);
  });
});
