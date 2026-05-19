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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('hydrates a brief, chip strip, and inputs form on apply', async () => {
    const onApplied = vi.fn();
    render(<PluginsSection onApplied={onApplied} />);
    fireEvent.click(await waitFor(() => screen.getByTitle('A fixture')));
    await waitFor(() => screen.getByTestId('context-chip-strip'));
    expect(screen.getByText('Sample Skill')).toBeTruthy();
    expect(screen.getByTestId('plugin-inputs-form')).toBeTruthy();
    expect(onApplied).toHaveBeenCalled();
    const [brief, applied] = onApplied.mock.calls[0]!;
    // The template still has {{topic}} because the user hasn't typed
    // anything yet — fields with no default stay un-substituted.
    expect(brief).toContain('{{topic}}');
    expect(applied.appliedPlugin.snapshotId).toBe('snap-1');
  });

  it('re-emits onApplied when an input field changes', async () => {
    const onApplied = vi.fn();
    render(<PluginsSection onApplied={onApplied} />);
    fireEvent.click(await waitFor(() => screen.getByTitle('A fixture')));
    await waitFor(() => screen.getByTestId('plugin-inputs-form'));
    onApplied.mockClear();
    const topicInput = screen.getByLabelText(/Topic/);
    fireEvent.change(topicInput, { target: { value: 'agentic design' } });
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const lastCall = onApplied.mock.calls[onApplied.mock.calls.length - 1]!;
    expect(lastCall[0]).toBe('Make a agentic design brief.');
  });

  it('removes the chip strip + inputs form when the user clears the chip', async () => {
    const onCleared = vi.fn();
    render(<PluginsSection onCleared={onCleared} />);
    fireEvent.click(await waitFor(() => screen.getByTitle('A fixture')));
    await waitFor(() => screen.getByTestId('context-chip-strip'));
    fireEvent.click(screen.getByLabelText(/Remove Skill Sample Skill/));
    await waitFor(() => expect(onCleared).toHaveBeenCalled());
    expect(screen.queryByTestId('context-chip-strip')).toBeNull();
    expect(screen.queryByTestId('plugin-inputs-form')).toBeNull();
  });
});
