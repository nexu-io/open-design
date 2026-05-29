// @vitest-environment jsdom

// Regression for nexu-io/open-design#3216: after #2840 wired plugin and
// design-template 404s into the same "no shipped preview" placeholder the
// skills tab uses, the placeholder copy still hard-coded "skill" — so a user
// opening a Community/Plugins card whose manifest declares a preview entry
// that doesn't ship saw "No shipped preview for this skill." on a card that
// is clearly not a skill. Lock the noun-per-surface contract by asserting
// that PluginExampleDetail's unavailable copy reads with the right noun.
//
// Plugin records (non-deck) read "plugin". Deck-mode records read "template".
// The skills consumer (ExamplesTab) keeps the existing "skill" wording and is
// covered by the existing preview-modal-unavailable-state suite.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';

import { PluginExampleDetail } from '../../src/components/plugin-details/PluginExampleDetail';

vi.mock('../../src/providers/registry', () => ({
  fetchPluginPreviewHtml: vi.fn(async () => ({ unavailable: true, kind: 'html' })),
  fetchPluginExampleHtml: vi.fn(async () => ({ unavailable: true, kind: 'html' })),
}));

function make(overrides: {
  id: string;
  title?: string;
  mode?: string;
}): InstalledPluginRecord {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: [],
    manifest: {
      name: overrides.id,
      version: '0.1.0',
      title: overrides.title ?? overrides.id,
      od: {
        kind: 'scenario',
        ...(overrides.mode ? { mode: overrides.mode } : {}),
        preview: { type: 'html', entry: './missing.html' },
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

describe('PluginExampleDetail unavailable-state noun', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reads as "plugin" when a non-deck plugin ships no preview', async () => {
    render(
      <PluginExampleDetail
        record={make({ id: 'example-live-artifact', title: 'Live Artifact' })}
        onClose={() => {}}
        onUse={() => {}}
      />,
    );

    const placeholder = await waitFor(() => screen.getByTestId('preview-unavailable'));
    const copy = placeholder.textContent ?? '';

    // The noun must match the card surface — calling a plugin a "skill" is
    // what #3216 was filed for.
    expect(copy).toMatch(/plugin/i);
    expect(copy).not.toMatch(/\bskill\b/i);
  });

  it('reads as "template" when a deck-mode plugin ships no preview', async () => {
    render(
      <PluginExampleDetail
        record={make({ id: 'replit-deck', title: 'Replit Deck', mode: 'deck' })}
        onClose={() => {}}
        onUse={() => {}}
      />,
    );

    const placeholder = await waitFor(() => screen.getByTestId('preview-unavailable'));
    const copy = placeholder.textContent ?? '';

    // Decks are surfaced as design templates in Home → Community, so the
    // copy should track that vocabulary instead of saying "plugin" or
    // "skill".
    expect(copy).toMatch(/template/i);
    expect(copy).not.toMatch(/\bskill\b/i);
  });
});
