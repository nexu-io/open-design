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
});
