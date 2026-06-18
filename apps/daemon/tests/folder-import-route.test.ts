import type http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { chmod, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  resetDesktopAuthForTests,
  setDesktopAuthSecret,
  signDesktopImportToken,
  startServer,
} from '../src/server.js';

describe('POST /api/import/folder', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    resetDesktopAuthForTests();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeFolder(): string {
    const d = mkdtempSync(path.join(tmpdir(), 'od-import-'));
    tempDirs.push(d);
    return d;
  }

  async function importFolder(body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  async function withSandboxMode<T>(run: () => Promise<T>): Promise<T> {
    const previous = process.env.OD_SANDBOX_MODE;
    process.env.OD_SANDBOX_MODE = '1';
    try {
      return await run();
    } finally {
      if (previous == null) delete process.env.OD_SANDBOX_MODE;
      else process.env.OD_SANDBOX_MODE = previous;
    }
  }

  async function withSandboxImportAllowedRoots<T>(
    roots: string[],
    run: () => Promise<T>,
  ): Promise<T> {
    const previous = process.env.OD_SANDBOX_IMPORT_ALLOWED_ROOTS;
    process.env.OD_SANDBOX_IMPORT_ALLOWED_ROOTS = roots.join(path.delimiter);
    try {
      return await run();
    } finally {
      if (previous == null) delete process.env.OD_SANDBOX_IMPORT_ALLOWED_ROOTS;
      else process.env.OD_SANDBOX_IMPORT_ALLOWED_ROOTS = previous;
    }
  }

  it('creates a project rooted at the submitted folder', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const resp = await importFolder({ baseDir: folder });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      project: { id: string; metadata?: { baseDir?: string; importedFrom?: string } };
      conversationId: string;
      entryFile: string | null;
    };
    expect(body.project.metadata?.baseDir).toBeTruthy();
    expect(body.project.metadata?.importedFrom).toBe('folder');
    expect(body.conversationId).toBeTruthy();
    expect(body.entryFile).toBe('index.html');

    const tabsResp = await fetch(`${baseUrl}/api/projects/${body.project.id}/tabs`);
    expect(tabsResp.status).toBe(200);
    const tabs = (await tabsResp.json()) as {
      tabs: string[];
      active: string | null;
      hasSavedState?: boolean;
      updatedAt?: number;
    };
    expect(tabs).toMatchObject({ tabs: [], active: null, hasSavedState: true });
    expect(typeof tabs.updatedAt).toBe('number');
  });

  it('rejects folder imports in sandbox mode', async () => {
    await withSandboxMode(async () => {
      const folder = makeFolder();
      await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

      const resp = await importFolder({ baseDir: folder });
      expect(resp.status).toBe(400);
      const body = (await resp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/OD_SANDBOX_MODE/i);
    });
  });

  it('allows sandbox folder imports under an explicit import root', async () => {
    await withSandboxMode(async () => {
      const root = makeFolder();
      const folder = path.join(root, 'job-clone');
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

      await withSandboxImportAllowedRoots([root], async () => {
        const resp = await importFolder({ baseDir: folder });
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as {
          project: { id: string; metadata?: { baseDir?: string; importedFrom?: string } };
          entryFile: string | null;
        };
        expect(body.project.metadata?.baseDir).toBe(await realpath(folder));
        expect(body.project.metadata?.importedFrom).toBe('folder');
        expect(body.entryFile).toBe('index.html');

        const filesResp = await fetch(`${baseUrl}/api/projects/${body.project.id}/files`);
        expect(filesResp.status).toBe(200);
        const filesBody = (await filesResp.json()) as { files: Array<{ name: string }> };
        expect(filesBody.files.map((file) => file.name)).toContain('index.html');
      });
    });
  });

  it('rejects sandbox folder imports outside the explicit import roots', async () => {
    await withSandboxMode(async () => {
      const allowedRoot = makeFolder();
      const folder = makeFolder();
      await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

      await withSandboxImportAllowedRoots([allowedRoot], async () => {
        const resp = await importFolder({ baseDir: folder });
        expect(resp.status).toBe(400);
        const body = (await resp.json()) as { error?: { message?: string } };
        expect(body.error?.message).toMatch(/OD_SANDBOX_IMPORT_ALLOWED_ROOTS/i);
      });
    });
  });

  it('rejects relative sandbox import allowed roots', async () => {
    await withSandboxMode(async () => {
      const folder = makeFolder();
      await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

      await withSandboxImportAllowedRoots(['tmp'], async () => {
        const resp = await importFolder({ baseDir: folder });
        expect(resp.status).toBe(400);
        const body = (await resp.json()) as { error?: { message?: string } };
        expect(body.error?.message).toMatch(/OD_SANDBOX_IMPORT_ALLOWED_ROOTS.*absolute/i);
      });
    });
  });

  it('rejects unauthenticated orchestrator scratch provenance outside sandbox import roots', async () => {
    await withSandboxMode(async () => {
      const folder = makeFolder();
      await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

      const importResp = await importFolder({
        baseDir: folder,
        orchestratorWorkspace: {
          kind: 'scratch',
          sourceLabel: 'checkout:main',
          sourceRef: 'main@abc123',
          baseRevision: 'abc123',
          writeback: 'external',
        },
      });
      expect(importResp.status).toBe(400);
      const body = (await importResp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/OD_SANDBOX_IMPORT_ALLOWED_ROOTS/i);
    });
  });

  it('persists trusted orchestrator scratch provenance for sandbox folder imports without an explicit import root', async () => {
    await withSandboxMode(async () => {
      const folder = makeFolder();
      await writeFile(path.join(folder, 'index.html'), '<!doctype html>');
      const secret = randomBytes(32);
      setDesktopAuthSecret(secret);
      try {
        const exp = new Date(Date.now() + 30_000).toISOString();
        const token = signDesktopImportToken(secret, folder, {
          nonce: `scratch-${Date.now()}`,
          exp,
        });

        const importResp = await importFolder(
          {
            baseDir: folder,
            orchestratorWorkspace: {
              kind: 'scratch',
              sourceLabel: 'checkout:main',
              sourceRef: 'main@abc123',
              baseRevision: 'abc123',
              writeback: 'external',
            },
          },
          { 'x-od-desktop-import-token': token },
        );
        expect(importResp.status).toBe(200);
        const { project } = (await importResp.json()) as {
          project: {
            id: string;
            metadata?: {
              baseDir?: string;
              orchestratorWorkspace?: Record<string, unknown>;
            };
          };
        };
        expect(project.metadata?.baseDir).toBe(await realpath(folder));
        expect(project.metadata?.orchestratorWorkspace).toEqual({
          kind: 'scratch',
          sourceLabel: 'checkout:main',
          sourceRef: 'main@abc123',
          baseRevision: 'abc123',
          writeback: 'external',
        });

        const patchResp = await fetch(`${baseUrl}/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: { kind: 'prototype', skipDiscoveryBrief: true } }),
        });
        expect(patchResp.status).toBe(200);
        const patchBody = (await patchResp.json()) as {
          project: {
            metadata?: {
              orchestratorWorkspace?: Record<string, unknown>;
              skipDiscoveryBrief?: boolean;
            };
          };
        };
        expect(patchBody.project.metadata?.skipDiscoveryBrief).toBe(true);
        expect(patchBody.project.metadata?.orchestratorWorkspace).toEqual({
          kind: 'scratch',
          sourceLabel: 'checkout:main',
          sourceRef: 'main@abc123',
          baseRevision: 'abc123',
          writeback: 'external',
        });

        const filesResp = await fetch(`${baseUrl}/api/projects/${project.id}/files`);
        expect(filesResp.status).toBe(200);
        const filesBody = (await filesResp.json()) as { files: Array<{ name: string }> };
        expect(filesBody.files.map((file) => file.name)).toContain('index.html');

        const runResp = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'missing-agent',
            projectId: project.id,
            message: 'Inspect the scratch workspace.',
          }),
        });
        expect(runResp.status).toBe(202);
        const runBody = (await runResp.json()) as { runId?: string };
        expect(runBody.runId).toBeTruthy();

        const resultPackageResp = await fetch(
          `${baseUrl}/api/runs/${runBody.runId}/result-package`,
        );
        expect(resultPackageResp.status).toBe(200);
        const resultPackage = (await resultPackageResp.json()) as {
          schema?: string;
          run?: { id?: string; projectId?: string };
          workspace?: {
            storage?: { kind?: string; baseDir?: string };
            provenance?: { kind?: string; writeback?: string; sourceRef?: string };
          };
          project?: { id?: string; fileCount?: number };
          artifacts?: Array<{
            file?: string;
            kind?: string;
            title?: string;
            manifest?: { metadata?: { inferred?: boolean } };
          }>;
        };
        expect(resultPackage.schema).toBe('open-design.run-result-package.v1');
        expect(resultPackage.run).toMatchObject({ id: runBody.runId, projectId: project.id });
        expect(resultPackage.workspace).toMatchObject({
          storage: {
            kind: 'folder-backed',
            baseDir: await realpath(folder),
          },
          provenance: {
            kind: 'orchestrator-scratch',
            sourceRef: 'main@abc123',
            writeback: 'external',
          },
        });
        expect(resultPackage.project).toMatchObject({ id: project.id, fileCount: 1 });
        expect(resultPackage.artifacts).toEqual([
          expect.objectContaining({
            file: 'index.html',
            kind: 'html',
            title: 'index.html',
            manifest: expect.objectContaining({
              metadata: expect.objectContaining({ inferred: true }),
            }),
          }),
        ]);
      } finally {
        resetDesktopAuthForTests();
      }
    });
  });

  it('rejects malformed orchestrator workspace metadata on folder import', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const resp = await importFolder({
      baseDir: folder,
      orchestratorWorkspace: { kind: 'bogus' },
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/orchestratorWorkspace\.kind/i);
  });

  it('rejects malformed orchestrator workspace metadata on working-dir replacement', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');
    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const nextFolder = makeFolder();
    await writeFile(path.join(nextFolder, 'index.html'), '<!doctype html>');
    const replaceResp = await fetch(`${baseUrl}/api/projects/${project.id}/working-dir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseDir: nextFolder,
        orchestratorWorkspace: { kind: 'scratch', source_reference: 'typo' },
      }),
    });
    expect(replaceResp.status).toBe(400);
    const body = (await replaceResp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/unsupported field: source_reference/i);
  });

  it('clears scratch provenance when replacing a working directory without new provenance', async () => {
    const scratchFolder = makeFolder();
    await writeFile(path.join(scratchFolder, 'index.html'), '<!doctype html>');
    const importResp = await importFolder({
      baseDir: scratchFolder,
      orchestratorWorkspace: {
        kind: 'scratch',
        sourceRef: 'main@abc123',
        writeback: 'external',
      },
    });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const localFolder = makeFolder();
    await writeFile(path.join(localFolder, 'index.html'), '<!doctype html>');
    const replaceResp = await fetch(`${baseUrl}/api/projects/${project.id}/working-dir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: localFolder }),
    });
    expect(replaceResp.status).toBe(200);
    const replaceBody = (await replaceResp.json()) as {
      project: { metadata?: { orchestratorWorkspace?: unknown } };
    };
    expect(replaceBody.project.metadata?.orchestratorWorkspace).toBeUndefined();

    const runResp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'missing-agent',
        projectId: project.id,
        message: 'Inspect the local workspace.',
      }),
    });
    expect(runResp.status).toBe(202);
    const runBody = (await runResp.json()) as { runId?: string };
    const statusResp = await fetch(`${baseUrl}/api/runs/${runBody.runId}`);
    expect(statusResp.status).toBe(200);
    const statusBody = (await statusResp.json()) as {
      workspace?: { provenance?: { kind?: string; writeback?: string } };
    };
    expect(statusBody.workspace?.provenance).toEqual({
      kind: 'user-local',
      writeback: 'in-place',
    });
  });

  it('fails result-package when a folder-backed workspace cannot be enumerated', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');
    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const runResp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'missing-agent',
        projectId: project.id,
        message: 'Inspect the local workspace.',
      }),
    });
    expect(runResp.status).toBe(202);
    const runBody = (await runResp.json()) as { runId?: string };

    rmSync(folder, { recursive: true, force: true });
    const resultPackageResp = await fetch(
      `${baseUrl}/api/runs/${runBody.runId}/result-package`,
    );
    expect(resultPackageResp.status).toBe(500);
    const body = (await resultPackageResp.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(body.error?.code).toBe('WORKSPACE_ENUMERATION_FAILED');
    expect(body.error?.message).toMatch(/ENOENT|no such file/i);
  });

  it('returns an empty result-package for an od-owned run before files exist', async () => {
    const projectResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `tmp-${Date.now()}`,
        name: 'Empty OD-owned project',
        metadata: { kind: 'prototype' },
      }),
    });
    expect(projectResp.status).toBe(200);
    const { project } = (await projectResp.json()) as { project: { id: string } };

    const runResp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'missing-agent',
        projectId: project.id,
        message: 'Inspect the empty project.',
      }),
    });
    expect(runResp.status).toBe(202);
    const runBody = (await runResp.json()) as { runId?: string };

    const resultPackageResp = await fetch(
      `${baseUrl}/api/runs/${runBody.runId}/result-package`,
    );
    expect(resultPackageResp.status).toBe(200);
    const resultPackage = (await resultPackageResp.json()) as {
      workspace?: { storage?: { kind?: string; baseDir?: string | null } };
      project?: { fileCount?: number };
      artifacts?: unknown[];
    };
    expect(resultPackage.workspace?.storage).toEqual({
      kind: 'od-owned',
      baseDir: null,
    });
    expect(resultPackage.project?.fileCount).toBe(0);
    expect(resultPackage.artifacts).toEqual([]);
  });

  it('keeps result-package files aligned with the run workspace snapshot after working-dir swaps', async () => {
    const scratchFolder = makeFolder();
    await writeFile(path.join(scratchFolder, 'index.html'), '<!doctype html><p>scratch</p>');
    const importResp = await importFolder({
      baseDir: scratchFolder,
      orchestratorWorkspace: {
        kind: 'scratch',
        sourceRef: 'main@abc123',
        writeback: 'external',
      },
    });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const runResp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'missing-agent',
        projectId: project.id,
        message: 'Inspect the scratch workspace.',
      }),
    });
    expect(runResp.status).toBe(202);
    const runBody = (await runResp.json()) as { runId?: string };

    const localFolder = makeFolder();
    await writeFile(path.join(localFolder, 'local-only.html'), '<!doctype html><p>local</p>');
    const replaceResp = await fetch(`${baseUrl}/api/projects/${project.id}/working-dir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: localFolder }),
    });
    expect(replaceResp.status).toBe(200);

    const resultPackageResp = await fetch(
      `${baseUrl}/api/runs/${runBody.runId}/result-package`,
    );
    expect(resultPackageResp.status).toBe(200);
    const resultPackage = (await resultPackageResp.json()) as {
      workspace?: {
        storage?: { kind?: string; baseDir?: string };
        provenance?: { kind?: string; sourceRef?: string };
      };
      artifacts?: Array<{ file?: string }>;
    };
    expect(resultPackage.workspace).toMatchObject({
      storage: {
        kind: 'folder-backed',
        baseDir: await realpath(scratchFolder),
      },
      provenance: {
        kind: 'orchestrator-scratch',
        sourceRef: 'main@abc123',
      },
    });
    expect(resultPackage.artifacts?.map((artifact) => artifact.file)).toEqual(['index.html']);
  });

  it('rejects sandbox runs for imported folders before creating a run', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    await withSandboxMode(async () => {
      const runResp = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId: project.id,
          message: 'Inspect the imported project.',
        }),
      });
      expect(runResp.status).toBe(400);
      const body = (await runResp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);
    });
  });

  it('rejects sandbox chat runs for imported folders before creating a run', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    await withSandboxMode(async () => {
      const chatResp = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId: project.id,
          message: 'Inspect the imported project.',
        }),
      });
      expect(chatResp.status).toBe(400);
      const body = (await chatResp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);

      const runsResp = await fetch(`${baseUrl}/api/runs?projectId=${encodeURIComponent(project.id)}`);
      expect(runsResp.status).toBe(200);
      const runsBody = (await runsResp.json()) as { runs: unknown[] };
      expect(runsBody.runs).toHaveLength(0);
    });
  });

  it('opens imported-folder projects through host editor routes in sandbox mode', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');
    const binDir = makeFolder();
    const cursorBin = path.join(
      binDir,
      process.platform === 'win32' ? 'cursor.cmd' : 'cursor',
    );
    await writeFile(
      cursorBin,
      process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n',
    );
    await chmod(cursorBin, 0o755);

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ''}`;
    try {
      await withSandboxMode(async () => {
        const resp = await fetch(`${baseUrl}/api/projects/${project.id}/open-in`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editorId: 'cursor' }),
        });
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { path?: string };
        expect(body.path).toBe(await realpath(folder));
      });
    } finally {
      if (previousPath == null) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  it('still opens an imported-folder project record in sandbox mode', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    await withSandboxMode(async () => {
      const resp = await fetch(`${baseUrl}/api/projects/${project.id}`);
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as {
        project?: { id?: string; metadata?: { baseDir?: string } };
      };
      expect(body.project?.id).toBe(project.id);
      expect(body.project?.metadata?.baseDir).toBeTruthy();
    });
  });

  it('rejects imported-folder project file listing in sandbox mode', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await importFolder({ baseDir: folder });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    await withSandboxMode(async () => {
      const resp = await fetch(`${baseUrl}/api/projects/${project.id}/files`);
      expect(resp.status).toBe(400);
      const body = (await resp.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);
    });
  });

  it('auto-detects the entry file when present', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const resp = await importFolder({ baseDir: folder });
    const body = (await resp.json()) as { entryFile: string | null };
    expect(body.entryFile).toBe('index.html');
  });

  it('returns null entryFile when the folder has no html file', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'README.md'), '# hi');
    const resp = await importFolder({ baseDir: folder });
    const body = (await resp.json()) as { entryFile: string | null };
    expect(body.entryFile).toBeNull();
  });

  it('rejects when baseDir is missing', async () => {
    const resp = await importFolder({});
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/baseDir required/i);
  });

  it('rejects when baseDir is empty', async () => {
    const resp = await importFolder({ baseDir: '   ' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/baseDir required/i);
  });

  it('rejects a relative baseDir', async () => {
    const resp = await importFolder({ baseDir: 'relative/path' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/absolute/i);
  });

  it('rejects a non-existent path', async () => {
    const resp = await importFolder({ baseDir: '/this/path/should/not/exist/od-test' });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/not found/i);
  });

  it('rejects when the path points at a file', async () => {
    const folder = makeFolder();
    const filePath = path.join(folder, 'file.txt');
    await writeFile(filePath, 'hi');
    const resp = await importFolder({ baseDir: filePath });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/directory/i);
  });

  it('rejects the filesystem root as an import folder', async () => {
    const root = path.parse(process.cwd()).root;
    const resp = await importFolder({ baseDir: root });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/filesystem root/i);
  });

  // Security: a user-controlled symlink at baseDir would let writeProjectFile
  // escape the project sandbox at every later call (resolveSafe checks the
  // *literal* baseDir, but the OS follows symlinks at open() time). The
  // realpath() canonicalization at import collapses the chain so the stored
  // baseDir == what the kernel will write to.
  it('canonicalizes symlinks via realpath at import time', async () => {
    const realFolder = makeFolder();
    await writeFile(path.join(realFolder, 'index.html'), '');
    const linkParent = makeFolder();
    const linkPath = path.join(linkParent, 'sneaky');
    symlinkSync(realFolder, linkPath);

    const resp = await importFolder({ baseDir: linkPath });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      project: { metadata?: { baseDir?: string } };
    };
    // Stored baseDir must be the realpath, not the symlink path. Use
    // realpath on the temp folder too since macOS prefixes /private/.
    const expected = path.normalize(realFolder);
    expect(body.project.metadata?.baseDir).not.toBe(linkPath);
    // The stored baseDir resolves to realFolder (allowing for /private/ prefix)
    expect(
      body.project.metadata?.baseDir?.endsWith(path.basename(expected)),
    ).toBe(true);
  });

  // Defense against descendant-symlink escape: even after canonicalizing
  // the import-time baseDir, a symlink *inside* the imported folder
  // (e.g. assets -> /Users/me/.ssh) used to pass resolveSafe()'s string
  // check because the literal path stayed under baseDir, but the OS
  // followed the link at open() time and returned bytes from outside
  // the project. resolveSafeReal() canonicalizes each read/write/delete,
  // so any link reaching outside the project root is refused with a
  // 4xx instead of an exfiltration channel.
  // Defense against client-supplied baseDir on the generic create path:
  // /api/import/folder owns the realpath() + RUNTIME_DATA_DIR reentry
  // checks. POST /api/projects (and PATCH) must refuse a metadata.baseDir
  // payload outright, otherwise an attacker bypasses the import-time
  // sandbox guards.
  it('rejects baseDir on the generic POST /api/projects', async () => {
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `tmp-${Date.now()}`,
        name: 'sneaky',
        metadata: { kind: 'prototype', baseDir: '/etc' },
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/baseDir.*import\/folder/i);
  });

  // Same defense extended to the archive endpoint. resolveSafe() at the
  // archive root only did string-prefix validation; a directory symlink
  // like `docs -> /Users/me/.ssh` would pass and collectArchiveEntries()
  // would zip files outside the imported folder. resolveSafeReal() now
  // canonicalizes the archive root before walking it.
  it('refuses archive root that resolves outside the imported folder', async () => {
    const real = makeFolder();
    await writeFile(path.join(real, 'index.html'), '<!doctype html>');
    try {
      symlinkSync('/etc', path.join(real, 'docs'));
    } catch {
      return;
    }
    const importResp = await importFolder({ baseDir: real });
    const { project } = (await importResp.json()) as { project: { id: string } };
    const archive = await fetch(
      `${baseUrl}/api/projects/${project.id}/archive?root=docs`,
    );
    expect(archive.status).toBe(400);
  });

  // Regression for the patch-metadata wipe. updateProject() replaces
  // metadata wholesale, so a normal UI patch that omits baseDir would
  // silently detach the project from its imported folder. Verify the
  // route preserves baseDir even when the incoming patch doesn't
  // mention it.
  it('preserves metadata.baseDir when PATCH omits it', async () => {
    const real = makeFolder();
    await writeFile(path.join(real, 'index.html'), '');
    const importResp = await importFolder({ baseDir: real });
    const { project } = (await importResp.json()) as {
      project: { id: string; metadata: { baseDir: string } };
    };
    const originalBaseDir = project.metadata.baseDir;
    expect(originalBaseDir).toBeTruthy();

    // Patch unrelated metadata field. baseDir is not mentioned.
    const patchResp = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { kind: 'prototype', linkedDirs: [] },
      }),
    });
    expect(patchResp.status).toBe(200);
    const after = (await patchResp.json()) as {
      project: { metadata: { baseDir?: string } };
    };
    expect(after.project.metadata.baseDir).toBe(originalBaseDir);
  });

  it('writes generated artifact files into metadata.baseDir instead of the daemon projects dir', async () => {
    const real = makeFolder();
    await writeFile(path.join(real, 'index.html'), '<!doctype html>');
    const importResp = await importFolder({ baseDir: real });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as {
      project: { id: string; metadata: { baseDir: string } };
    };

    const saveResp = await fetch(`${baseUrl}/api/projects/${project.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifact: true,
        artifactManifest: {
          exports: ['html'],
          kind: 'html',
          renderer: 'html',
          title: 'Generated',
        },
        content: '<!doctype html><h1>Generated</h1>',
        name: 'generated.html',
      }),
    });

    expect(saveResp.status).toBe(200);
    expect(await readFile(path.join(project.metadata.baseDir, 'generated.html'), 'utf8')).toContain(
      'Generated',
    );
    expect(
      await readFile(path.join(project.metadata.baseDir, 'generated.html.artifact.json'), 'utf8'),
    ).toContain('"entry": "generated.html"');

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    await expect(stat(path.join(dataDir, 'projects', project.id, 'generated.html'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('refuses raw reads through a descendant symlink that escapes the folder', async () => {
    const real = makeFolder();
    await mkdir(path.join(real, 'assets'));
    // Point a symlink at /etc/hosts (always exists, harmless to read,
    // but unambiguously outside the imported folder).
    try {
      symlinkSync('/etc/hosts', path.join(real, 'assets', 'leak.txt'));
    } catch {
      return;
    }
    const importResp = await importFolder({ baseDir: real });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };

    const raw = await fetch(
      `${baseUrl}/api/projects/${project.id}/raw/assets/leak.txt`,
    );
    expect(raw.status).toBe(400);
  });

  it('refuses a symlink that resolves into the daemon data directory', async () => {
    // Create a symlink that points into the test's RUNTIME_DATA_DIR (the
    // tmpdir-based path the daemon is using). Without realpath, this would
    // bypass the RUNTIME_DATA_DIR-reentry check.
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) {
      // Test setup didn't pin a data dir — skip this case rather than guess.
      return;
    }
    const linkParent = makeFolder();
    const linkPath = path.join(linkParent, 'into-data');
    try {
      symlinkSync(dataDir, linkPath);
    } catch {
      // Symlink creation may fail in restricted CI environments — skip.
      return;
    }
    const resp = await importFolder({ baseDir: linkPath });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/data directory/i);
  });
});
