// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstalledPluginRecordSchema } from '@open-design/contracts';

import { PluginDetailView } from '../../src/components/PluginDetailView';
import { I18nProvider } from '../../src/i18n';
import { navigate } from '../../src/router';
import { applyPlugin } from '../../src/state/projects';
import { takeHomePromptHandoff } from '../../src/components/home-hero/plugin-authoring';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

vi.mock('../../src/router', () => ({
  goBack: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/state/projects')>();
  return { ...actual, applyPlugin: vi.fn() };
});

const PLUGIN = InstalledPluginRecordSchema.parse({
  id: 'visual-prototype-starter',
  title: 'Prototype Starter',
  version: '1.0.0',
  sourceKind: 'bundled',
  source: '/plugins/visual-prototype-starter',
  fsPath: '/plugins/visual-prototype-starter',
  installedAt: 0,
  updatedAt: 0,
  trust: 'bundled',
  capabilitiesGranted: ['prompt:inject'],
  manifest: {
    name: 'visual-prototype-starter',
    title: 'Prototype Starter',
    version: '1.0.0',
    description: 'Create polished product prototypes from a short brief.',
    license: 'MIT',
    od: { kind: 'bundle', mode: 'prototype' },
  },
});

const APPLY_RESULT = {
  ok: true as const,
  query: 'Design a Prototype Starter concept.',
  contextItems: [],
  inputs: [],
  assets: [],
  mcpServers: [],
  projectMetadata: {},
  trust: 'trusted',
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snapshot-visual-prototype-starter',
    pluginId: PLUGIN.id,
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
  },
};

beforeEach(() => {
  // Drain anything a previous test published so each case starts empty.
  takeHomePromptHandoff();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === `/api/plugins/${PLUGIN.id}`) {
      return new Response(JSON.stringify(PLUGIN), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  vi.mocked(applyPlugin).mockResolvedValue(APPLY_RESULT as never);
});

afterEach(() => {
  cleanup();
  takeHomePromptHandoff();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderDetailAndUse() {
  render(
    <I18nProvider initial="en">
      <PluginDetailView pluginId={PLUGIN.id} />
    </I18nProvider>,
  );
  const useButton = await screen.findByTestId('plugin-detail-use');
  fireEvent.click(useButton);
  await waitFor(() => {
    expect(vi.mocked(applyPlugin)).toHaveBeenCalledWith(PLUGIN.id, expect.anything());
  });
}

describe('PluginDetailView Use hands the plugin to Home', () => {
  it('publishes a plugin-use handoff that outlives the navigation to Home', async () => {
    await renderDetailAndUse();

    // The route lives outside EntryShell, so the only way Home can arrive with
    // this plugin already selected is a handoff that survives the unmount.
    // Reuses the same `plugin-use` payload the marketplace card's "Try it"
    // produces, so Home's existing pendingPluginUseHandoff path applies it.
    await waitFor(() => {
      expect(takeHomePromptHandoff()).toMatchObject({
        source: 'plugin-use',
        pluginId: PLUGIN.id,
        action: 'use',
        focus: true,
      });
    });
  });

  it('navigates to Home after publishing the handoff', async () => {
    await renderDetailAndUse();

    await waitFor(() => {
      expect(vi.mocked(navigate)).toHaveBeenCalledWith({ kind: 'home', view: 'home' });
    });
  });

  it('does not leave a handoff behind when applying the plugin fails', async () => {
    vi.mocked(applyPlugin).mockResolvedValue(null as never);
    await renderDetailAndUse();

    expect(takeHomePromptHandoff()).toBeNull();
    expect(vi.mocked(navigate)).not.toHaveBeenCalledWith({ kind: 'home', view: 'home' });
  });
});
