// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplyResult, InstalledPluginRecord } from '@open-design/contracts';
import { PluginLoopHome } from '../../src/components/PluginLoopHome';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePlugin(overrides: Partial<InstalledPluginRecord> = {}): InstalledPluginRecord {
  return {
    id: 'epam-html-deck',
    title: 'EPAM Brand HTML Deck',
    version: '1.0.0',
    trust: 'trusted',
    sourceKind: 'url',
    source: 'https://example.com/epam-html-deck-1.0.0.tgz',
    capabilitiesGranted: ['prompt:inject', 'fs:write'],
    fsPath: '/tmp/epam-html-deck',
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'epam-html-deck',
      title: 'EPAM Brand HTML Deck',
      version: '1.0.0',
      description: 'Generate EPAM-branded HTML slide decks.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: { query: 'Create an EPAM-branded deck about {{topic}}.' },
        inputs: [
          { name: 'topic', type: 'string', required: true, label: 'Deck topic' },
        ],
      },
    },
    ...overrides,
  };
}

const APPLY_RESULT: ApplyResult = {
  query: 'Create an EPAM-branded deck about {{topic}}.',
  contextItems: [],
  inputs: [{ name: 'topic', type: 'string', default: 'Enterprise Brand' }],
  assets: [],
  mcpServers: [],
  trust: 'trusted',
  capabilitiesGranted: ['prompt:inject', 'fs:write'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snap-epam-1',
    pluginId: 'epam-html-deck',
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject', 'fs:write'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
  projectMetadata: {
    skillId: 'epam-html-deck',
    designSystemId: 'design-system-epam',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginLoopHome', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('forwards skillId, designSystemId, and contextPlugins on submit when a plugin is active', async () => {
    const plugin = makePlugin();
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [plugin] }), {
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
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(<PluginLoopHome onSubmit={onSubmit} />);

    // Wait for plugins to load
    await waitFor(() => {
      expect(screen.getByTestId('plugin-loop-home')).toBeTruthy();
    });
    await settle();

    // Click "Use example query" on the plugin card
    fireEvent.click(screen.getByTestId('use-example-epam-html-deck'));
    await settle();

    // The textarea should be populated with the rendered query
    const textarea = screen.getByTestId('plugin-loop-input') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value.length).toBeGreaterThan(0);
    });

    // Press Enter to submit
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false });
    await settle();

    // Assert the submit payload includes the forwarded metadata
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.pluginId).toBe('epam-html-deck');
    expect(payload.skillId).toBe('epam-html-deck');
    expect(payload.designSystemId).toBe('design-system-epam');
    expect(payload.contextPlugins).toEqual([
      {
        id: 'epam-html-deck',
        title: 'EPAM Brand HTML Deck',
        description: 'Generate EPAM-branded HTML slide decks.',
      },
    ]);
  });

  it('falls back to plugin.id for skillId when projectMetadata lacks skillId', async () => {
    const plugin = makePlugin();
    const applyNoSkill: ApplyResult = {
      ...APPLY_RESULT,
      projectMetadata: {},
    };
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [plugin] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(applyNoSkill), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(<PluginLoopHome onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getByTestId('plugin-loop-home')).toBeTruthy());
    await settle();

    fireEvent.click(screen.getByTestId('use-example-epam-html-deck'));
    await settle();

    const textarea = screen.getByTestId('plugin-loop-input') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value.length).toBeGreaterThan(0));

    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false });
    await settle();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    // Falls back to record.id
    expect(payload.skillId).toBe('epam-html-deck');
    expect(payload.designSystemId).toBeNull();
  });

  it('sends empty contextPlugins when no plugin is active', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [makePlugin()] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(<PluginLoopHome onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getByTestId('plugin-loop-home')).toBeTruthy());
    await settle();

    // Type a prompt without activating a plugin
    const textarea = screen.getByTestId('plugin-loop-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Build a slide deck' } });

    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false });
    await settle();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.pluginId).toBeNull();
    expect(payload.skillId).toBeNull();
    expect(payload.designSystemId).toBeNull();
    expect(payload.contextPlugins).toEqual([]);
  });
});
