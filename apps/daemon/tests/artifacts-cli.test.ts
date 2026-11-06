import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runArtifactsCli } from '../src/artifacts-cli.js';

const ORIGINAL_ENV = { ...process.env };

describe('od artifacts CLI', () => {
  let stdoutWrite: { mockRestore: () => void };
  let stderrWrite: { mockRestore: () => void };
  let stdoutOutput: string[];
  let stderrOutput: string[];
  let fetchMock: ReturnType<typeof vi.fn>;
  const tempRoots: string[] = [];

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    stdoutOutput = [];
    stderrOutput = [];
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutOutput.push(String(chunk));
      return true;
    });
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrOutput.push(String(chunk));
      return true;
    });
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ file: { name: 'index.html' } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
    process.env = ORIGINAL_ENV;
    return Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))).then(() => undefined);
  });

  async function makeFile(name: string, contents: string): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'od-artifacts-cli-'));
    tempRoots.push(root);
    const filePath = path.join(root, name);
    await writeFile(filePath, contents, 'utf8');
    return filePath;
  }

  it('creates an artifact in an explicit project', async () => {
    const inputPath = await makeFile('deck.html', '<!doctype html><h1>Deck</h1>');
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ file: { name: 'deck.html' } }), { status: 200 });
    });

    const result = await runArtifactsCli([
      'create',
      '--daemon-url',
      'http://127.0.0.1:17456',
      '--project',
      'project-1',
      '--name',
      'deck.html',
      '--input',
      inputPath,
    ]);

    expect(result.exitCode).toBe(0);
    const postCall = fetchMock.mock.calls.at(-1);
    expect(postCall?.[0]).toBe('http://127.0.0.1:17456/api/projects/project-1/files');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      name: 'deck.html',
      content: '<!doctype html><h1>Deck</h1>',
      encoding: 'utf8',
      artifact: true,
      overwrite: false,
    });
    expect(JSON.parse(stdoutOutput.join(''))).toEqual({ ok: true, file: { name: 'deck.html' } });
    expect(stderrOutput.join('')).toBe('');
  });

  it('uses the active project when --project is omitted', async () => {
    const inputPath = await makeFile('index.html', '<!doctype html><h1>Active</h1>');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/active')) {
        return new Response(JSON.stringify({ active: true, projectId: 'active-1', projectName: 'Active', fileName: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ file: { name: 'index.html' } }), { status: 200 });
    });

    const result = await runArtifactsCli([
      'create',
      '--daemon-url',
      'http://127.0.0.1:17456',
      '--name',
      'index.html',
      '--input',
      inputPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('http://127.0.0.1:17456/api/projects/active-1/files');
    expect(JSON.parse(stdoutOutput.join(''))).toMatchObject({
      ok: true,
      usedActiveContext: { projectId: 'active-1', projectName: 'Active' },
    });
  });

  it('sends an explicit manifest file when provided', async () => {
    const inputPath = await makeFile('report.md', '# Report');
    const manifestPath = await makeFile('manifest.json', JSON.stringify({
      kind: 'markdown-document',
      renderer: 'markdown',
      exports: ['md', 'html', 'pdf', 'zip'],
      title: 'Report',
    }));
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ file: { name: 'report.md' } }), { status: 200 });
    });

    const result = await runArtifactsCli([
      'create',
      '--daemon-url',
      'http://127.0.0.1:17456',
      '--project',
      'Demo',
      '--name',
      'report.md',
      '--input',
      inputPath,
      '--manifest',
      manifestPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toMatchObject({
      name: 'report.md',
      content: '# Report',
      artifactManifest: {
        kind: 'markdown-document',
        renderer: 'markdown',
        exports: ['md', 'html', 'pdf', 'zip'],
        title: 'Report',
      },
    });
  });

  it('surfaces existing-target rejection from the daemon', async () => {
    const inputPath = await makeFile('index.html', '<!doctype html>');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { code: 'FILE_EXISTS', message: 'file already exists' } }), { status: 409 });
    });

    const result = await runArtifactsCli([
      'create',
      '--daemon-url',
      'http://127.0.0.1:17456',
      '--project',
      'Demo',
      '--name',
      'index.html',
      '--input',
      inputPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(stdoutOutput.join('')).toBe('');
    expect(JSON.parse(stderrOutput.join(''))).toMatchObject({
      ok: false,
      status: 409,
      error: { message: 'daemon artifact endpoint failed with 409' },
    });
  });
});
