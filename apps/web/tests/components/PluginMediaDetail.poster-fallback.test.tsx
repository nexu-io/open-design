// @vitest-environment jsdom

import type { InstalledPluginRecord } from '@open-design/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { PluginMediaDetail } from '../../src/components/plugin-details/PluginMediaDetail';

function makeRecord(
  poster: string,
  preview: Record<string, unknown> = { type: 'image' },
): InstalledPluginRecord {
  return {
    id: 'broken-poster-plugin',
    title: 'Broken Poster Plugin',
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: [],
    manifest: {
      name: 'broken-poster-plugin',
      version: '0.1.0',
      title: 'Broken Poster Plugin',
      od: {
        kind: 'scenario',
        preview: { poster, ...preview },
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

afterEach(() => {
  cleanup();
});

describe('PluginMediaDetail poster fallback', () => {
  it('removes a broken poster image from the detail stage', () => {
    const { container } = render(
      <I18nProvider>
        <PluginMediaDetail
          record={makeRecord('https://example.invalid/poster.png')}
          onClose={() => {}}
          onUse={() => {}}
        />
      </I18nProvider>,
    );

    const img = container.querySelector('img.plugin-media-stage__image');
    expect(img).not.toBeNull();

    fireEvent.error(img as HTMLImageElement);

    expect(container.querySelector('img.plugin-media-stage__image')).toBeNull();
    expect(container.querySelector('.plugin-media-stage__empty')).not.toBeNull();
  });

  it('tries a new poster URL after a previous poster failed', () => {
    const { container, rerender } = render(
      <I18nProvider>
        <PluginMediaDetail
          record={makeRecord('https://example.invalid/poster.png')}
          onClose={() => {}}
          onUse={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.error(
      container.querySelector('img.plugin-media-stage__image') as HTMLImageElement,
    );
    expect(container.querySelector('.plugin-media-stage__empty')).not.toBeNull();

    rerender(
      <I18nProvider>
        <PluginMediaDetail
          record={makeRecord('https://example.invalid/recovered.png')}
          onClose={() => {}}
          onUse={() => {}}
        />
      </I18nProvider>,
    );

    const recovered = container.querySelector('img.plugin-media-stage__image');
    expect(recovered).not.toBeNull();
    expect((recovered as HTMLImageElement).src).toContain('recovered.png');
  });

  it('keeps the audio player available when an audio poster fails', () => {
    const { container } = render(
      <I18nProvider>
        <PluginMediaDetail
          record={makeRecord('https://example.invalid/poster.png', {
            type: 'audio',
            audio: 'https://example.invalid/clip.mp3',
          })}
          onClose={() => {}}
          onUse={() => {}}
        />
      </I18nProvider>,
    );

    const poster = container.querySelector(
      'img.plugin-media-stage__audio-poster',
    );
    expect(poster).not.toBeNull();

    fireEvent.error(poster as HTMLImageElement);

    expect(
      container.querySelector('img.plugin-media-stage__audio-poster'),
    ).toBeNull();
    expect(
      container.querySelector('.plugin-media-stage__audio-glyph'),
    ).not.toBeNull();
    expect(
      container.querySelector('audio.plugin-media-stage__audio-player'),
    ).not.toBeNull();
  });
});
