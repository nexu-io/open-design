import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasDesktopBridge,
  resolveDesktopBridge,
  setTauriCoreLoaderForTests,
} from '../../src/native/desktop-bridge';

describe('desktop bridge resolver', () => {
  afterEach(() => {
    setTauriCoreLoaderForTests(null);
    vi.unstubAllGlobals();
  });

  it('returns null when no native desktop runtime is present', () => {
    vi.stubGlobal('window', {} as Window & typeof globalThis);

    expect(resolveDesktopBridge()).toBeNull();
    expect(hasDesktopBridge()).toBe(false);
  });

  it('wraps the legacy Electron preload bridge', async () => {
    const openExternal = vi.fn(async () => true);
    const openPath = vi.fn(async () => '');
    const pickAndImport = vi.fn(async () => ({ canceled: true, ok: false as const }));
    const printPdf = vi.fn(async () => undefined);
    vi.stubGlobal('window', {
      __odDesktop: { printPdf, isDesktop: true },
      electronAPI: { openExternal, openPath, pickAndImport },
    } as unknown as Window & typeof globalThis);

    const bridge = resolveDesktopBridge();

    expect(bridge?.kind).toBe('electron');
    await expect(bridge?.openExternal?.('https://example.com')).resolves.toBe(true);
    await expect(bridge?.openPath?.('project-1')).resolves.toBe('');
    await expect(bridge?.pickAndImport?.({ skillId: 'skill-1' })).resolves.toEqual({ canceled: true, ok: false });
    await expect(bridge?.printPdf?.('<html></html>', 'nonce')).resolves.toBeUndefined();
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(openPath).toHaveBeenCalledWith('project-1');
    expect(pickAndImport).toHaveBeenCalledWith({ skillId: 'skill-1' });
    expect(printPdf).toHaveBeenCalledWith('<html></html>', 'nonce');
  });

  it('wraps Tauri command IPC when Tauri internals are present', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'desktop_open_external') return true;
      if (command === 'desktop_open_project_path') return '';
      return { canceled: true, ok: false };
    });
    setTauriCoreLoaderForTests(async () => ({
      invoke: invoke as unknown as <T>(command: string, args?: Record<string, unknown>) => Promise<T>,
    }));
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
    } as unknown as Window & typeof globalThis);

    const bridge = resolveDesktopBridge();

    expect(bridge?.kind).toBe('tauri');
    await expect(bridge?.openExternal?.('https://example.com')).resolves.toBe(true);
    await expect(bridge?.openPath?.('project-1')).resolves.toBe('');
    await expect(bridge?.pickAndImport?.({ designSystemId: 'ds-1' })).resolves.toEqual({ canceled: true, ok: false });
    expect(bridge?.printPdf).toBeUndefined();
    expect(invoke).toHaveBeenNthCalledWith(1, 'desktop_open_external', { url: 'https://example.com' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'desktop_open_project_path', { projectId: 'project-1' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'desktop_pick_and_import', { init: { designSystemId: 'ds-1' } });
  });
});
