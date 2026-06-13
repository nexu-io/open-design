// @vitest-environment jsdom

// Plan §3.C2 / §3.C4 — InlinePluginsRail unit test.
//
// Asserts that:
//   - The rail fetches GET /api/plugins on mount and renders one card per row.
//   - Clicking a card POSTs to /api/plugins/:id/apply and forwards the
//     ApplyResult to onApplied.
//   - The rail filters by taskKind / mode when supplied.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InlinePluginsRail } from '../../src/components/InlinePluginsRail';

const PLUGIN_ROW = {
  id: 'sample-plugin',
  title: 'Sample Plugin',
  version: '1.0.0',
  trust: 'restricted' as const,
  sourceKind: 'local' as const,
  source: '/tmp/sample',
  manifest: {
    name: 'sample-plugin',
    title: 'Sample Plugin',
    description: 'A fixture',
    od: { taskKind: 'new-generation', mode: 'deck' },
  },
};

const APPLY_RESULT = {
  ok: true,
  query: 'Make a deck for {{topic}}.',
  contextItems: [{ kind: 'skill', id: 'sample', label: 'Sample' }],
  inputs: [{ name: 'topic', type: 'string', required: true, label: 'Topic' }],
  assets: [],
  mcpServers: [],
  trust: 'restricted',
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snap-1',
    pluginId: 'sample-plugin',
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
  projectMetadata: {},
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('InlinePluginsRail', () => {
  it('renders a card for each installed plugin and fires onApplied on click', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [PLUGIN_ROW] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const onApplied = vi.fn();
    render(<InlinePluginsRail onApplied={onApplied} />);
    const card = await waitFor(() => screen.getByTitle('A fixture'));
    fireEvent.click(card);
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const [record, result] = onApplied.mock.calls[0]!;
    expect(record.id).toBe('sample-plugin');
    expect(result.appliedPlugin.snapshotId).toBe('snap-1');
  });

  it('filters by taskKind when supplied', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          plugins: [
            PLUGIN_ROW,
            { ...PLUGIN_ROW, id: 'other', title: 'Other', manifest: { ...PLUGIN_ROW.manifest, od: { taskKind: 'tune-collab' } } },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    render(<InlinePluginsRail onApplied={() => undefined} filter={{ taskKind: 'tune-collab' }} />);
    // The filter runs after the fetch resolves; wait until the surviving
    // card is rendered. Then the new-generation plugin must NOT be in
    // the DOM.
    await waitFor(() => expect(screen.getByText('Other')).toBeTruthy());
    expect(screen.queryByText('Sample Plugin')).toBeNull();
  });

  // Regression: when ChatComposer pins the rail to a single plugin id
  // (because the project was created from PluginLoopHome with that
  // plugin), every other installed plugin must be hidden so the
  // composer reflects the user's pick instead of re-offering all
  // installed plugins.
  it('collapses the rail to a single plugin when pluginIds is supplied', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          plugins: [
            PLUGIN_ROW,
            { ...PLUGIN_ROW, id: 'code-migration', title: 'Code migration' },
            { ...PLUGIN_ROW, id: 'figma-migration', title: 'Figma migration' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    render(
      <InlinePluginsRail
        onApplied={() => undefined}
        filter={{ pluginIds: ['sample-plugin'] }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Sample Plugin')).toBeTruthy());
    expect(screen.queryByText('Code migration')).toBeNull();
    expect(screen.queryByText('Figma migration')).toBeNull();
  });
});
