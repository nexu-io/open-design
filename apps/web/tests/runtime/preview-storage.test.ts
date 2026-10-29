// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { buildPreviewStorageBridge, previewStorageKey, readPreviewStorage, savePreviewStorageMessage, PREVIEW_STORAGE_MAX_CHARS } from '../../src/runtime/preview-storage';

afterEach(() => window.localStorage.clear());
const scope = previewStorageKey('workspace:w:member:a', 'project-a', 'index.html')!;
function documentRuntime(values: Record<string, string>, generation: string) {
  const source = {} as Window;
  const runtime: Record<string, any> = { Object, DOMException };
  runtime.window = runtime;
  runtime.__odPreviewStorageSeed = { generation, values };
  runtime.parent = { postMessage: (data: unknown) => savePreviewStorageMessage(
    { source, data } as MessageEvent, source, generation, scope,
  ) };
  runInNewContext(buildPreviewStorageBridge().replace(/^<script[^>]*>|<\/script>$/g, ''), runtime);
  return runtime;
}

describe('artifact-local preview persistence', () => {
  it('restores checklist progress before the next document reads it; supports remove and clear', () => {
    const first = documentRuntime(readPreviewStorage(scope), 'one');
    first.localStorage.setItem('onboarding', '[true,false,true]');
    const second = documentRuntime(readPreviewStorage(scope), 'two');
    expect(second.localStorage.getItem('onboarding')).toBe('[true,false,true]');
    expect(second.localStorage.length).toBe(1);
    second.localStorage.removeItem('onboarding');
    expect(readPreviewStorage(scope)).toEqual({});
    second.localStorage.setItem('__proto__', 'safe');
    expect(second.localStorage.getItem('__proto__')).toBe('safe');
    second.localStorage.clear();
    expect(readPreviewStorage(scope)).toEqual({});
  });
  it('isolates member, project and file; refuses a pending authority', () => {
    documentRuntime({}, 'one').localStorage.setItem('progress', '2');
    for (const key of [previewStorageKey('workspace:w:member:b','project-a','index.html'), previewStorageKey('workspace:w:member:a','project-b','index.html'), previewStorageKey('workspace:w:member:a','project-a','other.html'), previewStorageKey(null,'project-a','index.html')]) {
      expect(readPreviewStorage(key)).toEqual({});
    }
  });
  it('rejects other frames, old documents and invalid or oversized messages', () => {
    const frame = {} as Window;
    const msg = (source: Window, generation: string, values: unknown) => ({ source, data: {type:'od:preview-local-storage', generation, values} }) as MessageEvent;
    expect(savePreviewStorageMessage(msg({} as Window,'current',{progress:'9'}),frame,'current',scope)).toBe(false);
    expect(savePreviewStorageMessage(msg(frame,'old',{progress:'9'}),frame,'current',scope)).toBe(false);
    expect(savePreviewStorageMessage(msg(frame,'current',{progress:9}),frame,'current',scope)).toBe(false);
    expect(savePreviewStorageMessage(msg(frame,'current',{progress:'x'.repeat(PREVIEW_STORAGE_MAX_CHARS)}),frame,'current',scope)).toBe(false);
    expect(readPreviewStorage(scope)).toEqual({});
  });
  it('keeps rejected writes atomic and does not bridge sessionStorage or host keys', () => {
    window.localStorage.setItem('host-session', 'private');
    const runtime = documentRuntime({}, 'one');
    expect(runtime.localStorage.getItem('host-session')).toBeNull();
    expect(runtime.sessionStorage).toBeUndefined();
    expect(() => runtime.localStorage.setItem('huge','x'.repeat(PREVIEW_STORAGE_MAX_CHARS))).toThrow('quota');
    expect(runtime.localStorage.length).toBe(0);
    expect(runtime.__odPreviewStorageSeed).toBeUndefined();
  });
});
