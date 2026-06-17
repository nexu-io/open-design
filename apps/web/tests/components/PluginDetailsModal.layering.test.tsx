// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { PluginDetailsModal } from '../../src/components/PluginDetailsModal';
import { I18nProvider } from '../../src/i18n';

function makePlugin(
  id: string,
  preview?: Record<string, unknown>,
): InstalledPluginRecord {
  return {
    id,
    title: id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: [],
    manifest: {
      name: id,
      version: '0.1.0',
      title: id,
      od: {
        kind: 'scenario',
        ...(preview ? { preview } : {}),
        useCase: {
          query: 'Generate a preview.',
        },
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

function renderInsideStackingContext(record: InstalledPluginRecord) {
  const host = document.createElement('div');
  host.className = 'composer';
  document.body.appendChild(host);

  render(
    <I18nProvider>
      <div className="composer-shell">
        <PluginDetailsModal record={record} onClose={() => {}} onUse={() => {}} />
      </div>
    </I18nProvider>,
    { container: host },
  );

  return host;
}

describe('PluginDetailsModal layering', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('portals rich preview details to the document body so sticky chat and workspace headers cannot cover them', () => {
    const host = renderInsideStackingContext(
      makePlugin('video-plugin', {
        type: 'video',
        poster: 'https://cdn.example/poster.jpg',
        video: 'https://cdn.example/clip.mp4',
      }),
    );

    const backdrop = document.body.querySelector('.ds-modal-backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop?.parentElement).toBe(document.body);
    expect(host.querySelector('.ds-modal-backdrop')).toBeNull();
  });

  it('portals fallback scenario details through the same top-level layer', () => {
    const host = renderInsideStackingContext(makePlugin('scenario-plugin'));

    const backdrop = document.body.querySelector('.plugin-details-modal-backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop?.className).toBe('plugin-details-modal-backdrop');
    expect(backdrop?.parentElement).toBe(document.body);
    expect(host.querySelector('.plugin-details-modal-backdrop')).toBeNull();
  });
});
