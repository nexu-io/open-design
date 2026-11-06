import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkspaceStore } from '../workspace.ts';
import { pluginRoot } from '../hyperframes.ts';
import type { Project } from '../shared/legacy.ts';
import { sharedEditorEnabled, readEditor, editorRequest } from '../editor-runtime.ts';

export function legacyProject(): Project {
  return { version: 1, title: '旧版工程', assets: [], referenceId: null, cuts: [],
    shots: [0, 1, 2].map(i => ({ id: `shot-${i}`, assetId: null, duration: 3, start: 0, caption: `标题 ${i}`, subtitle: '副标题', accent: '#d8f598', position: 'bottom', fit: 'cover' })) };
}

export async function fixture(run: (store: WorkspaceStore) => Promise<void>, initialize = true) {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-hyperframes-test-'));
  try {
    const store = new WorkspaceStore(directory);
    if (initialize) await store.initialize(pluginRoot);
    await run(store);
  } finally {
    await closeFixtureEditor(directory);
    await rm(directory, { recursive: true, force: true });
  }
}

export async function closeFixtureEditor(directory: string) {
  if (sharedEditorEnabled) {
    const editor = await readEditor(directory);
    if (editor) {
      try { await editorRequest(editor, '/editor-api/shutdown', {}); }
      catch {
        const health = await editorRequest(editor, '/editor-api/health', undefined, 500).catch(() => null);
        if (health?.instanceId === editor.instanceId && health.pid === editor.pid) process.kill(editor.pid, 'SIGTERM');
      }
      for (let i = 0; i < 100; i++) {
        try { process.kill(editor.pid, 0); await new Promise(resolve => setTimeout(resolve, 100)); }
        catch { break; }
      }
    }
  }
}
