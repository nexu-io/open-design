import type http from 'node:http';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

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

  async function importFolder(body: unknown) {
    return fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
