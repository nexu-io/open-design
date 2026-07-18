import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createProjectFileVersion,
  ensureCurrentProjectFileVersion,
  isProjectFileVersionPath,
  listProjectFileVersions,
  markProjectFileVersionStoreDeleted,
  readProjectFileVersion,
  renameProjectFileVersionStore,
} from '../src/project-file-versions.js';
import { ensureProject } from '../src/projects.js';

describe('project file versions', () => {
  async function withProject(fn: (projectsRoot: string, projectId: string) => Promise<void>) {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-file-versions-'));
    try {
      const projectId = 'versioned-project';
      await ensureProject(projectsRoot, projectId);
      await fn(projectsRoot, projectId);
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  }

  it('snapshots HTML content, dedupes unchanged current content, and marks the latest version current', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const first = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>v1</body></html>',
        { prompt: 'first prompt', promptSource: 'message' },
      );
      expect(first).toMatchObject({
        version: 1,
        current: true,
        source: 'ai',
        prompt: 'first prompt',
        promptSource: 'message',
      });
      if (!first) throw new Error('expected first version');

      const duplicate = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>v1</body></html>',
        { prompt: 'ignored prompt', promptSource: 'manual' },
      );
      expect(duplicate?.id).toBe(first.id);

      const second = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>v2</body></html>',
        { prompt: 'second prompt', promptSource: 'message' },
      );
      expect(second).toMatchObject({
        version: 2,
        current: true,
        source: 'ai',
        prompt: 'second prompt',
      });

      const versions = await listProjectFileVersions(projectsRoot, projectId, 'brand.html');
      expect(versions).toHaveLength(2);
      expect(versions.map((version) => version.current)).toEqual([false, true]);

      const prior = await readProjectFileVersion(projectsRoot, projectId, 'brand.html', first.id);
      expect(prior.content).toBe('<html><body>v1</body></html>');
      expect(prior.version.current).toBe(false);

      const restored = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        prior.content,
        {
          prompt: prior.version.prompt,
          promptSource: 'restore',
          source: 'restore',
          restoreFromVersionId: prior.version.id,
        },
      );
      expect(restored).toMatchObject({
        version: 3,
        current: true,
        source: 'restore',
        restoreFromVersionId: prior.version.id,
      });

      const afterRestore = await listProjectFileVersions(projectsRoot, projectId, 'brand.html');
      expect(afterRestore.map((version) => version.current)).toEqual([false, false, true]);
      expect(afterRestore.at(-1)?.id).toBe(restored.id);
    });
  });

  it('records manual provenance and ignores non-HTML files', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const textVersion = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'notes.txt',
        'plain text',
        { source: 'manual', promptSource: 'manual' },
      );
      expect(textVersion).toBeNull();

      const manual = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>manual</body></html>',
        { source: 'manual', promptSource: 'manual', label: 'Manual text edit' },
      );

      expect(manual).toMatchObject({
        version: 1,
        current: true,
        source: 'manual',
        promptSource: 'manual',
        label: 'Manual text edit',
      });
    });
  });

  it('explicit creates append a checkpoint even when content is unchanged', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const first = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>same</body></html>',
        { source: 'manual', promptSource: 'manual', label: 'First checkpoint' },
      );
      const second = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>same</body></html>',
        { source: 'manual', promptSource: 'manual', label: 'Named checkpoint' },
      );

      expect(second.id).not.toBe(first.id);
      expect(second).toMatchObject({
        version: 2,
        current: true,
        label: 'Named checkpoint',
      });
      const versions = await listProjectFileVersions(projectsRoot, projectId, 'brand.html');
      expect(versions).toHaveLength(2);
      expect(versions.map((version) => version.current)).toEqual([false, true]);
    });
  });

  it('preserves every checkpoint saved concurrently for the same HTML file', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const labels = Array.from({ length: 12 }, (_, index) => `Concurrent checkpoint ${index + 1}`);

      const created = await Promise.all(
        labels.map((label, index) =>
          createProjectFileVersion(
            projectsRoot,
            projectId,
            'brand.html',
            `<html><body>v${index + 1}</body></html>`,
            { source: 'manual', promptSource: 'manual', label },
          ),
        ),
      );

      expect(new Set(created.map((version) => version.id)).size).toBe(labels.length);
      const versions = await listProjectFileVersions(projectsRoot, projectId, 'brand.html');
      expect(versions).toHaveLength(labels.length);
      expect(new Set(versions.map((version) => version.label))).toEqual(new Set(labels));
      expect(versions.map((version) => version.version).sort((a, b) => a - b)).toEqual(
        labels.map((_, index) => index + 1),
      );
      expect(versions.filter((version) => version.current)).toHaveLength(1);
    });
  });

  it('keeps checkpoints visible when version creation races HTML rename', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const initial = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'foo.html',
        '<html><body>initial</body></html>',
        { source: 'ai', promptSource: 'message', label: 'Initial' },
      );
      const labels = Array.from({ length: 8 }, (_, index) => `Queued checkpoint ${index + 1}`);
      const creates = labels.map((label, index) =>
        createProjectFileVersion(
          projectsRoot,
          projectId,
          'foo.html',
          `<html><body>queued ${index + 1}</body></html>`,
          { source: 'manual', promptSource: 'manual', label },
        ),
      );

      const results = await Promise.allSettled([
        renameProjectFileVersionStore(projectsRoot, projectId, 'foo.html', 'nested/bar.html'),
        ...creates,
      ]);

      expect(results.filter((result) => result.status === 'rejected')).toEqual([]);
      await expect(listProjectFileVersions(projectsRoot, projectId, 'foo.html')).resolves.toHaveLength(0);
      const renamed = await listProjectFileVersions(projectsRoot, projectId, 'nested/bar.html');
      expect(renamed).toHaveLength(labels.length + 1);
      expect(new Set(renamed.map((version) => version.label))).toEqual(new Set(['Initial', ...labels]));
      expect(renamed.map((version) => version.version).sort((a, b) => a - b)).toEqual(
        Array.from({ length: labels.length + 1 }, (_, index) => index + 1),
      );
      const firstRenamed = renamed[0];
      expect(firstRenamed).toBeDefined();
      expect(firstRenamed?.id).toBe(initial.id);
      expect(renamed.every((version) => version.fileName === 'nested/bar.html')).toBe(true);
      expect(renamed.filter((version) => version.current)).toHaveLength(1);
    });
  });

  it('rotates deleted history when an HTML path is recreated', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const oldVersion = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'foo.html',
        '<html><body>old file</body></html>',
        { source: 'manual', promptSource: 'manual', label: 'Old deleted file' },
      );
      await markProjectFileVersionStoreDeleted(projectsRoot, projectId, 'foo.html');
      await expect(listProjectFileVersions(projectsRoot, projectId, 'foo.html')).resolves.toHaveLength(1);

      const newVersion = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'foo.html',
        '<html><body>new file</body></html>',
        { source: 'manual', promptSource: 'manual', label: 'New reused file' },
      );

      const versions = await listProjectFileVersions(projectsRoot, projectId, 'foo.html');
      expect(versions).toHaveLength(1);
      const current = versions[0];
      expect(current).toBeDefined();
      expect(current).toMatchObject({
        id: newVersion.id,
        label: 'New reused file',
        version: 1,
        current: true,
      });
      await expect(
        readProjectFileVersion(projectsRoot, projectId, 'foo.html', oldVersion.id),
      ).rejects.toThrow(/version not found/);
    });
  });

  it('replaces deleted target history when renaming another HTML file into that path', async () => {
    await withProject(async (projectsRoot, projectId) => {
      await createProjectFileVersion(
        projectsRoot,
        projectId,
        'target.html',
        '<html><body>deleted target</body></html>',
        { source: 'manual', promptSource: 'manual', label: 'Deleted target history' },
      );
      await markProjectFileVersionStoreDeleted(projectsRoot, projectId, 'target.html');
      const sourceVersion = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'source.html',
        '<html><body>source history</body></html>',
        { source: 'manual', promptSource: 'manual', label: 'Source history' },
      );

      await renameProjectFileVersionStore(projectsRoot, projectId, 'source.html', 'target.html');

      await expect(listProjectFileVersions(projectsRoot, projectId, 'source.html')).resolves.toHaveLength(0);
      const versions = await listProjectFileVersions(projectsRoot, projectId, 'target.html');
      expect(versions).toHaveLength(1);
      const renamed = versions[0];
      expect(renamed).toBeDefined();
      expect(renamed).toMatchObject({
        id: sourceVersion.id,
        label: 'Source history',
        fileName: 'target.html',
        current: true,
      });
      const content = await readProjectFileVersion(projectsRoot, projectId, 'target.html', sourceVersion.id);
      expect(content.content).toBe('<html><body>source history</body></html>');
    });
  });

  it('moves HTML version history when a project file is renamed', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const first = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'foo.html',
        '<html><body>first</body></html>',
        { source: 'ai', promptSource: 'message', prompt: 'make foo' },
      );

      await renameProjectFileVersionStore(projectsRoot, projectId, 'foo.html', 'nested/bar.html');

      await expect(listProjectFileVersions(projectsRoot, projectId, 'foo.html')).resolves.toHaveLength(0);
      const renamed = await listProjectFileVersions(projectsRoot, projectId, 'nested/bar.html');
      expect(renamed).toHaveLength(1);
      expect(renamed[0]).toMatchObject({
        id: first.id,
        fileName: 'nested/bar.html',
        current: true,
      });
      const content = await readProjectFileVersion(projectsRoot, projectId, 'nested/bar.html', first.id);
      expect(content.content).toBe('<html><body>first</body></html>');
      expect(content.version.fileName).toBe('nested/bar.html');
    });
  });

  it('recognizes internal version storage paths', () => {
    expect(isProjectFileVersionPath('.file-versions/abc/manifest.json')).toBe(true);
    expect(isProjectFileVersionPath('nested/.file-versions/abc/content.html')).toBe(true);
    expect(isProjectFileVersionPath('brand.html')).toBe(false);
  });

  it('rejects unsafe version identifiers', async () => {
    await withProject(async (projectsRoot, projectId) => {
      await expect(
        readProjectFileVersion(projectsRoot, projectId, 'brand.html', '../manifest.json'),
      ).rejects.toThrow(/version id required/);
    });
  });
});
