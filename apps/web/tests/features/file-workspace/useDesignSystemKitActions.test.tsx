// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDesignSystemKitActions } from '../../../src/features/file-workspace/hooks/useDesignSystemKitActions.hooks';
import type {
  DesignSystemKitActionsParams,
} from '../../../src/features/file-workspace/hooks/useDesignSystemKitActions.hooks';
import type { DesignSystemKitActionsPort } from '../../../src/features/file-workspace/ports';
import type { DesignSystemSummary } from '../../../src/types';

// `system.swatches` is an array; `useDesignKit` (called inside the hook under
// test) depends on it by reference. Every test below builds `system`/`params`
// ONCE and passes the same reference into `renderHook` — recreating them
// inside the `renderHook` callback (a fresh `swatches: []` every render)
// retriggers useDesignKit's effect on every render and infinite-loops.
const SWATCHES: DesignSystemSummary['swatches'] = [];

function makeSystem(over: Partial<DesignSystemSummary> = {}): DesignSystemSummary {
  return {
    id: 'sys1',
    title: 'Acme',
    category: 'brand',
    summary: '',
    status: 'draft',
    swatches: SWATCHES,
    ...over,
  };
}

function makePort(over: Partial<DesignSystemKitActionsPort> = {}): DesignSystemKitActionsPort {
  return {
    writeProjectTextFile: vi.fn(async () => ({ name: 'DESIGN.md' })),
    updateDesignSystemDraft: vi.fn(async () => ({ status: 'draft' })),
    fetchProjectFileText: vi.fn(async () => null),
    readDesignMd: vi.fn(async () => ''),
    finalizeBrandProject: vi.fn(async () => ({ ok: true, result: {} }) as never),
    startDesignSystemTokenContractRebuildJob: vi.fn(async () => ({})),
    downloadProjectArchive: vi.fn(async () => true),
    downloadDesignSystemArchive: vi.fn(async () => true),
    deleteDesignSystemDraft: vi.fn(async () => true),
    updateBrandColor: vi.fn(async () => true),
    deleteBrandLogo: vi.fn(async () => true),
    deleteBrandImage: vi.fn(async () => true),
    confirmDelete: vi.fn(() => true),
    ...over,
  };
}

const T = ((key: string) => key) as DesignSystemKitActionsParams['t'];

function makeParams(over: Partial<DesignSystemKitActionsParams> = {}): DesignSystemKitActionsParams {
  return {
    projectId: '',
    system: makeSystem(),
    editable: true,
    t: T,
    onRefreshFiles: vi.fn(),
    githubEvidenceReady: true,
    ...over,
  };
}

describe('useDesignSystemKitActions', () => {
  it('saveDesignMd persists the body and surfaces success', async () => {
    // `refreshKitDependencies` (called at the end of persistDesignMd) bumps
    // `kitReloadKey`, which re-triggers the hook's own DESIGN.md/brand.json
    // load effect — exactly like the pre-decomposition source. Make the fake
    // `readDesignMd` reflect the last write so that re-fetch converges on the
    // same value a real server would return, instead of racing it back to ''.
    let storedBody = '';
    const writeProjectTextFile = vi.fn(async (_projectId: string, _name: string, content: string) => {
      storedBody = content;
      return { name: 'DESIGN.md' };
    });
    const updateDesignSystemDraft = vi.fn(async () => ({ status: 'draft' }));
    const readDesignMd = vi.fn(async () => storedBody);
    const port = makePort({ writeProjectTextFile, updateDesignSystemDraft, readDesignMd });
    const params = makeParams();
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.saveDesignMd('# hello');
    });
    expect(updateDesignSystemDraft).toHaveBeenCalledWith('sys1', { body: '# hello' });
    expect(writeProjectTextFile).toHaveBeenCalledWith('', 'DESIGN.md', '# hello');
    await waitFor(() => expect(result.current.designMdBody).toBe('# hello'));
    expect(result.current.kitToast).toEqual({ tone: 'success', message: 'ds.actionDone' });
  });

  it('saveDesignMd surfaces an error toast and rethrows when the draft update fails', async () => {
    const port = makePort({ updateDesignSystemDraft: vi.fn(async () => null) });
    const params = makeParams();
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await expect(result.current.saveDesignMd('# hello')).rejects.toThrow();
    });
    expect(result.current.kitToast).toEqual({ tone: 'error', message: 'ds.actionFailed' });
    expect(result.current.savingDesignMd).toBe(false);
  });

  it('refreshKit starts a token-contract rebuild job when there is no brandId', async () => {
    const startDesignSystemTokenContractRebuildJob = vi.fn(async () => ({ id: 'job1' }));
    const port = makePort({ startDesignSystemTokenContractRebuildJob });
    const params = makeParams({ brandId: null });
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.refreshKit();
    });
    expect(startDesignSystemTokenContractRebuildJob).toHaveBeenCalledWith('sys1', { force: true });
    expect(result.current.kitToast?.tone).toBe('success');
  });

  it('refreshKit finalizes the brand project when a brandId is present', async () => {
    const finalizeBrandProject = vi.fn(async () => ({ ok: true, result: {} }) as never);
    const port = makePort({ finalizeBrandProject });
    const params = makeParams({ brandId: 'brand1' });
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.refreshKit();
    });
    expect(finalizeBrandProject).toHaveBeenCalledWith('brand1', '');
  });

  it('downloadKit falls back to the design-system archive when the project archive is unavailable', async () => {
    const downloadProjectArchive = vi.fn(async () => false);
    const downloadDesignSystemArchive = vi.fn(async () => true);
    const port = makePort({ downloadProjectArchive, downloadDesignSystemArchive });
    const params = makeParams();
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.downloadKit();
    });
    expect(downloadProjectArchive).toHaveBeenCalled();
    expect(downloadDesignSystemArchive).toHaveBeenCalled();
    expect(result.current.kitToast?.tone).toBe('success');
  });

  it('deleteDesignSystemProject no-ops when the user cancels the confirm dialog', async () => {
    const confirmDelete = vi.fn(() => false);
    const onDeleteDesignSystemProject = vi.fn(async () => true);
    const port = makePort({ confirmDelete });
    const params = makeParams({ onDeleteDesignSystemProject });
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.deleteDesignSystemProject();
    });
    expect(onDeleteDesignSystemProject).not.toHaveBeenCalled();
  });

  it('deleteDesignSystemProject deletes the project then the draft on confirm', async () => {
    const onDeleteDesignSystemProject = vi.fn(async () => true);
    const deleteDesignSystemDraft = vi.fn(async () => true);
    const onDesignSystemsRefresh = vi.fn();
    const port = makePort({ deleteDesignSystemDraft });
    const params = makeParams({ onDeleteDesignSystemProject, onDesignSystemsRefresh });
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.deleteDesignSystemProject();
    });
    expect(onDeleteDesignSystemProject).toHaveBeenCalledWith('');
    expect(deleteDesignSystemDraft).toHaveBeenCalledWith('sys1');
    expect(onDesignSystemsRefresh).toHaveBeenCalled();
  });

  it('togglePublished refuses to publish when the github-evidence gate is not ready', async () => {
    const updateDesignSystemDraft = vi.fn(async () => ({ status: 'published' }));
    const port = makePort({ updateDesignSystemDraft });
    const params = makeParams({ githubEvidenceReady: false });
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.togglePublished(true);
    });
    expect(updateDesignSystemDraft).not.toHaveBeenCalled();
    expect(result.current.statusBusy).toBe(false);
  });

  it('togglePublished updates status on success', async () => {
    const updateDesignSystemDraft = vi.fn(async () => ({ status: 'published' }));
    const port = makePort({ updateDesignSystemDraft });
    const params = makeParams();
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.togglePublished(true);
    });
    expect(updateDesignSystemDraft).toHaveBeenCalledWith('sys1', { status: 'published' });
    await waitFor(() => expect(result.current.status).toBe('published'));
  });

  it('toggleDefault is a no-op without an onSetDefaultDesignSystem callback', async () => {
    const port = makePort();
    const params = makeParams();
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.toggleDefault(true);
    });
    expect(result.current.defaultBusy).toBe(false);
    expect(result.current.kitToast).toBeNull();
  });

  it('toggleDefault calls the callback and surfaces success', async () => {
    const onSetDefaultDesignSystem = vi.fn(async () => undefined);
    const port = makePort();
    const params = makeParams({ onSetDefaultDesignSystem });
    const { result } = renderHook(() => useDesignSystemKitActions(port, params));
    await act(async () => {
      await result.current.toggleDefault(true);
    });
    expect(onSetDefaultDesignSystem).toHaveBeenCalledWith('sys1');
    expect(result.current.kitToast?.tone).toBe('success');
  });
});
