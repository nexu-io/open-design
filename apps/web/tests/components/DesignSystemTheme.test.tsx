// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemPackageInfo } from '@open-design/contracts';
import { DesignSystemTheme } from '../../src/components/DesignSystemTheme';
import type { DesignKit } from '../../src/runtime/design-kit';
import { workspaceContextFixture } from '../helpers/workspace-context';

const mocks = vi.hoisted(() => ({ fetchProjectFileText: vi.fn() }));
vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>('../../src/providers/registry');
  return { ...actual, fetchProjectFileText: mocks.fetchProjectFileText };
});

const kit: DesignKit = {
  designSystemId: 'apple', name: 'Apple', editable: false, canUpload: false,
  colors: [{ name: 'Original blue', hex: '#0071e3', role: 'accent', usage: 'Primary action' }],
  typography: {}, fonts: [], logoAlternates: [],
};
const packageInfo: DesignSystemPackageInfo = {
  manifest: { schemaVersion: '1', id: 'apple', name: 'Apple', category: 'Consumer', files: { designTokens: 'design-tokens.json' } },
  availableFiles: ['design-tokens.json'],
};
const tokens = { tokens: [
  { name: '--accent', value: '#0071e3', type: 'color' },
  { name: '--accent-hover', value: 'color-mix(in oklab, var(--accent), black 8%)', type: 'color' },
  { name: '--bg', value: '#ffffff', type: 'color' },
  { name: '--success', value: '#16a34a', type: 'color' },
  { name: '--radius', value: '12px', type: 'dimension' },
] };
const response = (data: unknown) => ({ ok: true, json: async () => data });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(tokens)));
  mocks.fetchProjectFileText.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DesignSystemTheme', () => {
  it('omits the palette when no original colors exist', () => {
    const { container } = render(<DesignSystemTheme kit={{ ...kit, colors: [] }}
      resourceReadIdentity={null} tokens={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('uses shared tokens without fetching again and only renders their color entries', () => {
    const view = render(<DesignSystemTheme kit={kit} packageInfo={packageInfo} resourceReadIdentity={null} tokens={tokens.tokens} />);
    expect(screen.getByText('--accent')).toBeInTheDocument();
    expect(screen.queryByText('--radius')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<DesignSystemTheme kit={kit} packageInfo={packageInfo} resourceReadIdentity={null} tokens={[]} />);
    expect(screen.getByText('Original blue')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('groups real color tokens and preserves values without inventing a shade ramp', async () => {
    render(<DesignSystemTheme kit={kit} packageInfo={packageInfo} resourceReadIdentity={null} />);
    await screen.findByText('--accent');
    expect(screen.queryByText('Original blue')).toBeNull();
    expect(screen.queryByText('--radius')).toBeNull();
    expect(screen.queryByText('brand-900')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'brand' })).getByText('--accent-hover')).toBeInTheDocument();
    expect(screen.getByText(tokens.tokens[1]!.value)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'state-success' })).toBeInTheDocument();
    expect(screen.getByTestId('design-system-theme').style.getPropertyValue('--ds-preview-accent')).toBe('#0071e3');
    expect(fetch).toHaveBeenCalledWith('/api/design-systems/apple/static?path=design-tokens.json', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('uses kit colors without probing unadvertised or explicitly missing files', async () => {
    const view = render(<DesignSystemTheme kit={kit} resourceReadIdentity={null} />);
    expect(screen.getByText('Original blue')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<DesignSystemTheme kit={kit} packageInfo={{ ...packageInfo, availableFiles: [] }} resourceReadIdentity={null} />);
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<DesignSystemTheme kit={kit} packageInfo={packageInfo} resourceReadIdentity={null} />);
    await screen.findByText('--accent');
  });

  it('preserves the kit palette after invalid or unavailable optional token data', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ tokens: [{ name: '--bad', type: 'color', value: null }] }) as Response);
    render(<DesignSystemTheme kit={kit} packageInfo={packageInfo} resourceReadIdentity={null} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Original blue')).toBeInTheDocument();
    expect(screen.queryByText('--bad')).toBeNull();
  });

  it('scopes project token reads and ignores an old workspace result after switching', async () => {
    let resolveOld!: (value: string) => void;
    mocks.fetchProjectFileText.mockImplementationOnce(() => new Promise<string>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(JSON.stringify({ tokens: [{ name: '--accent', value: '#ff0000', type: 'color' }] }));
    const context = workspaceContextFixture({ workspaceId: 'workspace-one', workspaceMemberId: 'member-one' });
    const nextContext = workspaceContextFixture({ workspaceId: 'workspace-two', workspaceMemberId: 'member-two' });
    const projectKit = { ...kit, projectId: 'brand-project', editable: true };
    const view = render(<DesignSystemTheme kit={projectKit} packageInfo={packageInfo} resourceReadIdentity={{ context, generation: 'first' }} />);
    expect(mocks.fetchProjectFileText).toHaveBeenCalledWith('brand-project', 'design-tokens.json', expect.objectContaining({ workspaceContext: context, signal: expect.any(AbortSignal) }));
    const oldSignal = mocks.fetchProjectFileText.mock.calls[0]![2].signal as AbortSignal;
    view.rerender(<DesignSystemTheme kit={projectKit} packageInfo={packageInfo} resourceReadIdentity={{ context: nextContext, generation: 'second' }} />);
    await screen.findByText('#ff0000');
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { resolveOld(JSON.stringify(tokens)); });
    await waitFor(() => expect(screen.getByText('#ff0000')).toBeInTheDocument());
    expect(screen.queryByText('#0071e3')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
