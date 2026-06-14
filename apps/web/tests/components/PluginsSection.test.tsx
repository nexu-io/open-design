// @vitest-environment jsdom

// Plan §3.F5 — PluginsSection unit test.
//
// The section is the host-agnostic combination of Rail + ChipStrip +
// InputsForm. NewProjectPanel and ChatComposer drop it in with one
// line; this suite locks the contract that:
//
//   1. The empty state renders only the rail (no chips / inputs).
//   2. Clicking a plugin card fires onApplied(brief, applied) with the
//      template-expanded brief.
//   3. Editing an input field re-fires onApplied with the new brief.
//   4. Removing a chip clears the active plugin and invokes onCleared.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PluginsSection } from '../../src/components/PluginsSection';

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
  query: 'Make a {{topic}} brief.',
  contextItems: [{ kind: 'skill', id: 'sample', label: 'Sample Skill' }],
  inputs: [
    { name: 'topic', type: 'string', required: true, label: 'Topic' },
  ],
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
  fetchMock = vi.fn(async (url) => {
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
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('PluginsSection', () => {
  it('renders only the rail when no plugin is applied', async () => {
    render(<PluginsSection />);
    await waitFor(() => screen.getByTitle('A fixture'));
    expect(screen.queryByTestId('context-chip-strip')).toBeNull();
    expect(screen.queryByTestId('plugin-inputs-form')).toBeNull();
  });

  it('hydrates a brief and a single plugin chip on apply (no inputs form)', async () => {
    const onApplied = vi.fn();
    render(<PluginsSection onApplied={onApplied} />);
    fireEvent.click(await waitFor(() => screen.getByTitle('A fixture')));
    const strip = await waitFor(() => screen.getByTestId('context-chip-strip'));
    // The chip strip now shows ONE chip — the applied plugin itself —
    // never the per-category (skill / design / asset) fan-out.
    expect(within(strip).getByText('Sample Plugin')).toBeTruthy();
    expect(within(strip).queryByText('Sample Skill')).toBeNull();
    expect(strip.querySelectorAll('.context-chip-strip__chip')).toHaveLength(1);
    // The per-plugin inputs form (MODEL / ASPECT RATIO selects) is no longer
    // rendered: inputs fall back to schema defaults instead of being edited inline.
    expect(screen.queryByTestId('plugin-inputs-form')).toBeNull();
    expect(onApplied).toHaveBeenCalled();
    const [brief, applied] = onApplied.mock.calls[0]!;
    // `topic` has no schema default, so it stays un-substituted in the brief.
    expect(brief).toContain('{{topic}}');
    expect(applied.appliedPlugin.snapshotId).toBe('snap-1');
  });

  it('removes the chip strip + inputs form when the user clears the chip', async () => {
    const onCleared = vi.fn();
    render(<PluginsSection onCleared={onCleared} />);
    fireEvent.click(await waitFor(() => screen.getByTitle('A fixture')));
    await waitFor(() => screen.getByTestId('context-chip-strip'));
    fireEvent.click(screen.getByLabelText(/Remove Plugin Sample Plugin/));
    await waitFor(() => expect(onCleared).toHaveBeenCalled());
    expect(screen.queryByTestId('context-chip-strip')).toBeNull();
    expect(screen.queryByTestId('plugin-inputs-form')).toBeNull();
  });
});
