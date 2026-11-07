import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  assertVisibleForImportedProject,
  isAgentWritableConfigPath,
  sanitizePath,
  writeProjectFile,
  readProjectFile,
} from '../src/projects.js';
import {
  normalizeProjectOutputs,
  readProjectManifest,
  resolveProjectOutputs,
  upsertProjectManifestOutputs,
  writeProjectManifest,
} from '../src/project-locations.js';
import { startServer } from '../src/server.js';

describe('agent-owned project outputs config', () => {
  it('normalizes valid outputs and rejects hidden/traversal segments', () => {
    expect(normalizeProjectOutputs({ designs: 'designs', plans: 'plans', store: 'store' })).toEqual({
      designs: 'designs',
      plans: 'plans',
      store: 'store',
    });
    expect(normalizeProjectOutputs({ designs: 'work/designs-v2' })).toEqual({ designs: 'work/designs-v2' });
    expect(normalizeProjectOutputs({ designs: '.ssh' })).toBeUndefined();
    expect(normalizeProjectOutputs({ designs: '../escape' })).toBeUndefined();
    expect(normalizeProjectOutputs({ designs: '/absolute' })).toBeUndefined();
    expect(normalizeProjectOutputs({ designs: '' })).toBeUndefined();
    expect(normalizeProjectOutputs(null)).toBeUndefined();
    expect(normalizeProjectOutputs({})).toBeUndefined();
  });

  it('allowlists exactly .open-design/project.json for imported folders', () => {
    const metadata = { baseDir: '/tmp/user-folder' };
    expect(isAgentWritableConfigPath('.open-design/project.json')).toBe(true);
    expect(isAgentWritableConfigPath('.open-design\\project.json')).toBe(true);
    expect(isAgentWritableConfigPath('.open-design/other.json')).toBe(false);
    expect(isAgentWritableConfigPath('.ssh/id_rsa')).toBe(false);
    expect(() => assertVisibleForImportedProject('.open-design/project.json', metadata)).not.toThrow();
    expect(() => assertVisibleForImportedProject('.ssh/id_rsa', metadata)).toThrow();
    expect(() => assertVisibleForImportedProject('.open-design/other.json', metadata)).toThrow();
    expect(() => assertVisibleForImportedProject('designs/a.html', metadata)).not.toThrow();
  });

  it('sanitizePath preserves the manifest path instead of mangling it', () => {
    expect(sanitizePath('.open-design/project.json')).toBe('.open-design/project.json');
    // Regular dotfiles still get mangled (defense in depth).
    expect(sanitizePath('.ssh/id_rsa')).not.toBe('.ssh/id_rsa');
  });

  it('round-trips manifest outputs through read/write/upsert', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-outputs-manifest-'));
    try {
      await writeProjectManifest(dir, {
        schemaVersion: 1,
        id: 'proj-outputs-1',
        name: 'Outputs fixture',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        skillId: null,
        designSystemId: null,
      });
      const before = await readProjectManifest(dir);
      expect(before?.outputs).toBeUndefined();
      expect(resolveProjectOutputs(dir, before)).toEqual({ designs: 'designs', plans: 'plans', store: 'store' });

      const next = await upsertProjectManifestOutputs(dir, 'proj-outputs-1', 'Outputs fixture', {
        designs: 'my-designs',
        plans: 'my-plans',
        store: 'assets/store',
      });
      expect(next.outputs).toEqual({ designs: 'my-designs', plans: 'my-plans', store: 'assets/store' });
      const raw = JSON.parse(await readFile(path.join(dir, '.open-design', 'project.json'), 'utf8'));
      expect(raw.outputs).toEqual({ designs: 'my-designs', plans: 'my-plans', store: 'assets/store' });
      expect(resolveProjectOutputs(dir, next)).toEqual({ designs: 'my-designs', plans: 'my-plans', store: 'assets/store' });

      await expect(upsertProjectManifestOutputs(dir, 'proj-outputs-1', 'Outputs fixture', { designs: '.ssh' })).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writeProjectFile allows the manifest for imported roots but still blocks other dotfiles', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-outputs-root-'));
    const baseDir = mkdtempSync(path.join(tmpdir(), 'od-outputs-base-'));
    const metadata = { baseDir };
    try {
      const projectId = 'proj-outputs-file-1';
      const saved = await writeProjectFile(
        projectsRoot,
        projectId,
        '.open-design/project.json',
        Buffer.from(JSON.stringify({ schemaVersion: 1, id: projectId, name: 't', createdAt: 1, updatedAt: 1 })),
        {},
        metadata,
      );
      expect(saved.name).toBe('.open-design/project.json');
      const read = await readProjectFile(projectsRoot, projectId, '.open-design/project.json', metadata);
      expect(read.name).toBe('.open-design/project.json');
      await expect(
        writeProjectFile(projectsRoot, projectId, '.ssh/id_rsa', Buffer.from('x'), {}, metadata),
      ).rejects.toThrow();
    } finally {
      rmSync(projectsRoot, { recursive: true, force: true });
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});

describe('PUT /api/projects/:id/outputs', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as unknown as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('gets defaults then upserts agent-chosen folders for an imported folder', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'od-outputs-api-'));
    tempDirs.push(folder);
    const importResp = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: folder }),
    });
    expect(importResp.status).toBe(200);
    const importBody = (await importResp.json()) as { project: { id: string } };
    const projectId = importBody.project.id;

    const getResp = await fetch(`${baseUrl}/api/projects/${projectId}/outputs`);
    expect(getResp.status).toBe(200);
    const getBody = (await getResp.json()) as { outputs: Record<string, string> };
    expect(getBody.outputs).toEqual({ designs: 'designs', plans: 'plans', store: 'store' });

    const putResp = await fetch(`${baseUrl}/api/projects/${projectId}/outputs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputs: { designs: 'my-designs', plans: 'my-plans', store: 'my-store' } }),
    });
    expect(putResp.status).toBe(200);
    const putBody = (await putResp.json()) as { outputs: Record<string, string> };
    expect(putBody.outputs).toEqual({ designs: 'my-designs', plans: 'my-plans', store: 'my-store' });

    const badResp = await fetch(`${baseUrl}/api/projects/${projectId}/outputs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputs: { designs: '.ssh' } }),
    });
    expect(badResp.status).toBe(400);
  });
});
