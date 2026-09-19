// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemPackageInfo } from '@open-design/contracts';
import { useDesignSystemTokens } from '../../src/components/useDesignSystemTokens';
import type { DesignKit } from '../../src/runtime/design-kit';
import { workspaceContextFixture } from '../helpers/workspace-context';

const kit: DesignKit = {
  designSystemId: 'apple', name: 'Apple', editable: false, canUpload: false,
  colors: [], typography: {}, fonts: [], logoAlternates: [],
};
const packageInfo: DesignSystemPackageInfo = {
  manifest: { schemaVersion: '1', id: 'apple', name: 'Apple', category: 'Consumer', files: { designTokens: 'design-tokens.json' } },
  availableFiles: ['design-tokens.json'],
};
const validTokens = [
  { name: '--accent', value: '#0071e3', type: 'color' },
  { name: '--font-body', value: '"SF Pro Text", sans-serif', type: 'fontFamily' },
  { name: '--radius-md', value: '12px', type: 'dimension' },
  { name: '--elev-ring', value: '0 0 0 1px var(--border)', type: 'shadow' },
  { name: '--leading-body', value: '1.47', type: 'number' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tokens: validTokens }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('useDesignSystemTokens', () => {
  it('distinguishes source evidence from defaults, unknown metadata and curated backfills', async () => {
    const token = { name: '--radius-card', value: '14px', type: 'dimension' };
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ tokens: [
      { ...token, name: '--radius-original', confidence: 'high', sources: ['source/site.css:12'] },
      { ...token, name: '--radius-mapped', confidence: 'medium', sources: ['source/site.css:20'] },
      { ...token, name: '--radius-default', confidence: 'fallback', sources: [] },
      { ...token, name: '--radius-unknown' },
      { ...token, name: '--radius-backfill', confidence: 'high', sources: ['tokens.css:1'],
        reason: 'Bundled tokens.css declares --radius-backfill; no upstream recrawl was performed for this backfill.' },
    ] }) } as Response);
    const { result } = renderHook(() => useDesignSystemTokens({ kit, packageInfo, resourceReadIdentity: null }));
    await waitFor(() => expect(result.current).toHaveLength(5));
    expect(result.current.map((token) => token.sourceBacked)).toEqual([true, true, false, false, false]);
  });

  it('preserves every valid token type and rejects malformed entries', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ tokens: [
      ...validTokens, null, { name: '--bad', value: false, type: 'color' },
      { name: '--missing', value: '12px' }, { name: '', value: '8px', type: 'dimension' },
    ] }) } as Response);
    const { result } = renderHook(() => useDesignSystemTokens({ kit, packageInfo, resourceReadIdentity: null }));
    await waitFor(() => expect(result.current).toEqual(validTokens.map((token) => ({ ...token, sourceBacked: false }))));
  });

  it('waits for an enabled kit, and does not refetch on unrelated object rerenders', async () => {
    const { result, rerender } = renderHook((props: { kit: DesignKit | null; enabled: boolean }) =>
      useDesignSystemTokens({ ...props, packageInfo, resourceReadIdentity: null }),
    { initialProps: { kit: null as DesignKit | null, enabled: true } });
    expect(result.current).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    rerender({ kit, enabled: false });
    expect(fetch).not.toHaveBeenCalled();
    rerender({ kit, enabled: true });
    await waitFor(() => expect(result.current).toEqual(validTokens.map((token) => ({ ...token, sourceBacked: false }))));
    const loaded = result.current;
    rerender({ kit: { ...kit }, enabled: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(loaded);
  });

  it('aborts and hides stale tokens when the read generation changes', async () => {
    let resolveOld!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }));
    const context = workspaceContextFixture({ workspaceId: 'workspace-one', workspaceMemberId: 'member-one' });
    const { result, rerender } = renderHook(({ generation }: { generation: string }) =>
      useDesignSystemTokens({ kit, packageInfo, resourceReadIdentity: { context, generation } }),
    { initialProps: { generation: 'old' } });
    const oldSignal = vi.mocked(fetch).mock.calls[0]![1]!.signal as AbortSignal;
    rerender({ generation: 'current' });
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current).toEqual(validTokens.map((token) => ({ ...token, sourceBacked: false }))));
    await act(async () => { resolveOld({ ok: true, json: async () => ({ tokens: [{ name: '--wrong', value: '#ff0000', type: 'color' }] }) } as Response); });
    expect(result.current).toEqual(validTokens.map((token) => ({ ...token, sourceBacked: false })));
  });

  it('returns no tokens when a read fails and aborts in-flight work on unmount', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Offline'));
    const first = renderHook(() => useDesignSystemTokens({ kit, packageInfo, resourceReadIdentity: null }));
    await act(async () => { await Promise.resolve(); });
    expect(first.result.current).toEqual([]);
    first.unmount();
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => {}));
    const second = renderHook(() => useDesignSystemTokens({ kit, packageInfo, resourceReadIdentity: null }));
    const signal = vi.mocked(fetch).mock.calls[1]![1]!.signal as AbortSignal;
    second.unmount();
    expect(signal.aborted).toBe(true);
  });
});
