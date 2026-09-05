import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  isValidBrainSessionId,
  syncAntigravityBrainArtifacts,
} from '../../src/runtimes/antigravity-sync.js';

describe('antigravity-sync', () => {
  it('validates session IDs and prevents path traversal', () => {
    expect(isValidBrainSessionId('')).toBe(false);
    expect(isValidBrainSessionId('   ')).toBe(false);
    expect(isValidBrainSessionId('../etc/passwd')).toBe(false);
    expect(isValidBrainSessionId('session/123')).toBe(false);
    expect(isValidBrainSessionId('session\\123')).toBe(false);
    expect(isValidBrainSessionId('..')).toBe(false);
    expect(isValidBrainSessionId('valid-session-uuid-1234')).toBe(true);
  });

  it('rejects path traversal session IDs during sync', async () => {
    const result = await syncAntigravityBrainArtifacts({
      projectsRoot: 'D:\\projects',
      projectId: 'proj-1',
      sessionId: '../../traversal',
    });
    expect(result.syncedCount).toBe(0);
    expect(result.skippedReason).toBe('invalid_session_id');
  });

  it('handles non-existent session directory gracefully', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sync-test-'));
    try {
      const result = await syncAntigravityBrainArtifacts({
        projectsRoot: path.join(tmpDir, 'projects'),
        projectId: 'proj-1',
        sessionId: 'non-existent-session',
        brainBaseDir: path.join(tmpDir, 'brain'),
      });
      expect(result.syncedCount).toBe(0);
      expect(result.skippedReason).toBe('no_session_dir');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('syncs web artifacts and ignores markdown and scratch files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sync-test-'));
    const brainDir = path.join(tmpDir, 'brain', 'session-1');
    const projectsRoot = path.join(tmpDir, 'projects');
    const projDir = path.join(projectsRoot, 'proj-1');

    await fs.mkdir(brainDir, { recursive: true });
    await fs.mkdir(projDir, { recursive: true });

    // Create various files in the brain directory
    await fs.writeFile(path.join(brainDir, 'preview.html'), '<html>Hello</html>');
    await fs.writeFile(path.join(brainDir, 'styles.css'), 'body { color: red; }');
    await fs.writeFile(path.join(brainDir, 'walkthrough.md'), '# Walkthrough');
    await fs.writeFile(path.join(brainDir, 'implementation_plan.md'), '# Plan');
    await fs.writeFile(path.join(brainDir, '.hidden'), 'hidden');

    const scratchDir = path.join(brainDir, 'scratch');
    await fs.mkdir(scratchDir);
    await fs.writeFile(path.join(scratchDir, 'temp.html'), 'temp');

    const mockWrite = vi.fn().mockResolvedValue({ name: 'ok' });

    try {
      const result = await syncAntigravityBrainArtifacts({
        projectsRoot,
        projectId: 'proj-1',
        sessionId: 'session-1',
        brainBaseDir: path.join(tmpDir, 'brain'),
        writeProjectFileFn: mockWrite as any,
      });

      expect(result.syncedCount).toBe(2);
      expect(result.syncedFiles.sort()).toEqual(['preview.html', 'styles.css']);
      expect(mockWrite).toHaveBeenCalledTimes(2);
      expect(mockWrite).toHaveBeenCalledWith(
        projectsRoot,
        'proj-1',
        'preview.html',
        expect.any(Buffer),
        { overwrite: true },
        undefined,
      );
      expect(mockWrite).toHaveBeenCalledWith(
        projectsRoot,
        'proj-1',
        'styles.css',
        expect.any(Buffer),
        { overwrite: true },
        undefined,
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects symlinked artifact files pointing outside the brain directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sync-test-'));
    const brainDir = path.join(tmpDir, 'brain', 'session-1');
    const projectsRoot = path.join(tmpDir, 'projects');
    const secretFile = path.join(tmpDir, 'secret.json');

    await fs.mkdir(brainDir, { recursive: true });
    await fs.mkdir(path.join(projectsRoot, 'proj-1'), { recursive: true });
    await fs.writeFile(secretFile, '{"sensitive":"data"}');
    await fs.writeFile(path.join(brainDir, 'legit.json'), '{"valid":"data"}');

    const symlinkTarget = path.join(brainDir, 'leaked.json');
    let symlinkCreated = false;
    try {
      await fs.symlink(secretFile, symlinkTarget, 'file');
      symlinkCreated = true;
    } catch {
      // On Windows without Developer Mode, fs.symlink file may fail.
    }

    const mockWrite = vi.fn().mockResolvedValue({ name: 'ok' });

    try {
      if (symlinkCreated) {
        const result = await syncAntigravityBrainArtifacts({
          projectsRoot,
          projectId: 'proj-1',
          sessionId: 'session-1',
          brainBaseDir: path.join(tmpDir, 'brain'),
          writeProjectFileFn: mockWrite as any,
        });

        // The symlinked file must be rejected, only legit.json synced
        expect(result.syncedFiles).toEqual(['legit.json']);
        expect(mockWrite).toHaveBeenCalledTimes(1);
        expect(mockWrite).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          'leaked.json',
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      } else {
        // Fallback test verifying lstat symbolic link branch rejection
        const originalLstat = fs.lstat;
        const spyLstat = vi.spyOn(fs, 'lstat').mockImplementation(async (filePath) => {
          if (String(filePath).endsWith('legit.json')) {
            const realStat = await originalLstat(filePath);
            return Object.assign({}, realStat, {
              isSymbolicLink: () => true,
              isFile: () => true,
            });
          }
          return originalLstat(filePath);
        });

        const result = await syncAntigravityBrainArtifacts({
          projectsRoot,
          projectId: 'proj-1',
          sessionId: 'session-1',
          brainBaseDir: path.join(tmpDir, 'brain'),
          writeProjectFileFn: mockWrite as any,
        });

        spyLstat.mockRestore();
        expect(result.syncedCount).toBe(0);
        expect(mockWrite).not.toHaveBeenCalled();
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports safely sync from a symlinked/junction session directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sync-test-'));
    const realSessionDir = path.join(tmpDir, 'actual-brain-store', 'session-1');
    const brainDir = path.join(tmpDir, 'brain');
    const symlinkSessionDir = path.join(brainDir, 'session-1');
    const projectsRoot = path.join(tmpDir, 'projects');

    await fs.mkdir(realSessionDir, { recursive: true });
    await fs.mkdir(brainDir, { recursive: true });
    await fs.mkdir(path.join(projectsRoot, 'proj-1'), { recursive: true });

    await fs.writeFile(path.join(realSessionDir, 'app.html'), '<h1>Hello</h1>');

    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await fs.symlink(realSessionDir, symlinkSessionDir, linkType);

    const mockWrite = vi.fn().mockResolvedValue({ name: 'ok' });

    try {
      const result = await syncAntigravityBrainArtifacts({
        projectsRoot,
        projectId: 'proj-1',
        sessionId: 'session-1',
        brainBaseDir: brainDir,
        writeProjectFileFn: mockWrite as any,
      });

      expect(result.syncedCount).toBe(1);
      expect(result.syncedFiles).toEqual(['app.html']);
      expect(mockWrite).toHaveBeenCalledWith(
        projectsRoot,
        'proj-1',
        'app.html',
        expect.any(Buffer),
        { overwrite: true },
        undefined,
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects file swap / TOCTOU discrepancy between lstat and open handle', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sync-test-'));
    const brainDir = path.join(tmpDir, 'brain', 'session-1');
    const projectsRoot = path.join(tmpDir, 'projects');

    await fs.mkdir(brainDir, { recursive: true });
    await fs.mkdir(path.join(projectsRoot, 'proj-1'), { recursive: true });

    await fs.writeFile(path.join(brainDir, 'swapped.json'), '{"initial":"content"}');

    const originalOpen = fs.open;
    // Simulate a handle where fstat differs from lstat (simulating a swapped file or race)
    const spyOpen = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      const originalStat = handle.stat.bind(handle);
      handle.stat = (async () => {
        const s = await originalStat();
        return Object.assign({}, s, {
          ino: (s.ino ?? 100) + 9999, // Mismatched inode
          size: s.size + 1000,        // Mismatched size
        });
      }) as any;
      return handle;
    });

    const mockWrite = vi.fn().mockResolvedValue({ name: 'ok' });

    try {
      const result = await syncAntigravityBrainArtifacts({
        projectsRoot,
        projectId: 'proj-1',
        sessionId: 'session-1',
        brainBaseDir: path.join(tmpDir, 'brain'),
        writeProjectFileFn: mockWrite as any,
      });

      spyOpen.mockRestore();
      expect(result.syncedCount).toBe(0);
      expect(mockWrite).not.toHaveBeenCalled();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
