// Plugin details modal — preview-kind dispatch contract.
//
// The home gallery routes every plugin tile to a kind-specific
// detail surface (media / html / design-system / scenario fallback)
// so the modal mirrors the affordances of the tile users clicked
// from. This suite locks the dispatch routing through observable
// markers — `data-detail-variant` attributes and surface-specific
// chrome — so a future refactor can not silently collapse two
// variants into one.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';

import { PluginDetailsModal } from '../../src/components/PluginDetailsModal';
import { I18nProvider } from '../../src/i18n';

interface MakeArgs {
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
  mode?: string;
  preview?: Record<string, unknown>;
  exampleOutputs?: Array<{ path: string; title?: string }>;
  designSystemRef?: string;
  query?: string;
  pipelineStages?: Array<{ id: string; atoms: string[] }>;
  capabilities?: string[];
  inputs?: Array<{
    name: string;
    type?: 'string' | 'text' | 'select' | 'number' | 'boolean';
  }>;
}

function make(args: MakeArgs): InstalledPluginRecord {
  return {
    id: args.id,
    title: args.title ?? args.id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: [],
    manifest: {
      name: args.id,
      version: '0.1.0',
      title: args.title ?? args.id,
      ...(args.description ? { description: args.description } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
      od: {
        kind: 'scenario',
        ...(args.mode ? { mode: args.mode } : {}),
        ...(args.preview ? { preview: args.preview } : {}),
        ...(args.exampleOutputs
          ? { useCase: { exampleOutputs: args.exampleOutputs, query: args.query } }
          : args.query
            ? { useCase: { query: args.query } }
            : {}),
        ...(args.designSystemRef
          ? { context: { designSystem: { ref: args.designSystemRef } } }
          : {}),
        ...(args.pipelineStages
          ? { pipeline: { stages: args.pipelineStages } }
          : {}),
        ...(args.capabilities ? { capabilities: args.capabilities } : {}),
        ...(args.inputs ? { inputs: args.inputs } : {}),
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

function render(record: InstalledPluginRecord): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <PluginDetailsModal record={record} onClose={() => {}} onUse={() => {}} />
    </I18nProvider>,
  );
}

describe('PluginDetailsModal dispatch', () => {
  it('routes image-template plugins to the unified PreviewModal chrome with image stage', () => {
    const html = render(
      make({
        id: 'img-anime',
        title: 'Anime Battle',
        description: 'High-impact illustration generator.',
        preview: { type: 'image', poster: 'https://cdn/anime.jpg' },
        query: 'A dynamic anime-style illustration of {character}.',
      }),
    );
    // Same chrome as html/design-system variants.
    expect(html).toContain('ds-modal');
    expect(html).toContain('ds-modal-stage-custom');
    expect(html).toContain('ds-modal-primary-action');
    expect(html).toContain('plugin-details-use-img-anime');
    // Variant marker + asset stay observable.
    expect(html).toContain('data-detail-variant="media"');
    expect(html).toContain('plugin-media-stage');
    expect(html).toContain('https://cdn/anime.jpg');
    expect(html).toContain('Anime Battle');
    // Inline share menu surfaces in the header extras.
    expect(html).toContain('plugin-share-img-anime');
  });

  it('routes video-template plugins to the unified chrome with a playable video', () => {
    const html = render(
      make({
        id: 'vid-decade',
        title: 'Glow-Up Video',
        preview: {
          type: 'video',
          poster: 'https://cdn/poster.jpg',
          video: 'https://cdn/clip.mp4',
        },
      }),
    );
    expect(html).toContain('ds-modal');
    expect(html).toContain('ds-modal-stage-custom');
    expect(html).toContain('data-detail-variant="media"');
    expect(html).toContain('plugin-media-stage__video');
    expect(html).toContain('https://cdn/clip.mp4');
    expect(html).toContain('controls');
    expect(html).toContain('plugin-share-vid-decade');
  });

  it('routes audio plugins to the unified chrome with a playable audio element', () => {
    const html = render(
      make({
        id: 'aud-jingle',
        title: 'Audio Jingle',
        preview: { type: 'audio', audio: 'https://cdn/jingle.mp3' },
      }),
    );
    expect(html).toContain('ds-modal');
    expect(html).toContain('data-detail-variant="media"');
    expect(html).toContain('plugin-media-stage__audio');
    expect(html).toContain('https://cdn/jingle.mp3');
    expect(html).toContain('plugin-share-aud-jingle');
  });

  it('routes html-preview plugins to the example detail (sandboxed iframe + share menu)', () => {
    const html = render(
      make({
        id: 'live-dashboard',
        title: 'Live Dashboard',
        description: 'A Notion-style team dashboard.',
        preview: { type: 'html', entry: './example.html' },
      }),
    );
    expect(html).toContain('ds-modal');
    expect(html).toContain('ds-modal-primary-action');
    expect(html).toContain('plugin-details-use-live-dashboard');
    expect(html).toContain('plugin-share-live-dashboard');
  });

  it('routes design-system plugins to the showcase + DESIGN.md surface (with share menu)', () => {
    const html = render(
      make({
        id: 'ds-airbnb',
        title: 'Airbnb',
        mode: 'design-system',
        designSystemRef: 'airbnb',
      }),
    );
    expect(html).toContain('ds-modal');
    expect(html).toContain('Showcase');
    expect(html).toContain('Tokens');
    expect(html).toContain('DESIGN.md');
    expect(html).toContain('plugin-share-ds-airbnb');
  });

  it('falls back to the scenario inspector when the plugin has no rich preview', () => {
    const html = render(
      make({
        id: 'plain-scenario',
        title: 'Plain Scenario',
        description: 'No preview material.',
        mode: 'prototype',
      }),
    );
    expect(html).toContain('data-detail-variant="scenario"');
    expect(html).toContain('plugin-details-modal__title');
    expect(html).toContain('plugin-share-plain-scenario');
  });
});

describe('PluginDetailsModal common metadata coverage', () => {
  // Each detail variant must surface the plugin-common manifest
  // fields (workflow, capabilities, file path, source provenance)
  // in addition to its kind-specific hero — otherwise users lose
  // information when expanding a media/html/design tile.
  function pluginWithMeta(overrides: Partial<MakeArgs>): InstalledPluginRecord {
    return make({
      id: overrides.id ?? 'meta-plugin',
      title: overrides.title ?? 'Meta Plugin',
      description: overrides.description ?? 'A plugin with rich metadata.',
      pipelineStages: [{ id: 'plan', atoms: ['todo-write'] }],
      capabilities: ['fs:read', 'mcp:invoke'],
      inputs: [{ name: 'topic', type: 'string' }],
      ...overrides,
    });
  }

  it('surfaces workflow + capabilities + file path inside the media variant sidebar', () => {
    const html = render(
      pluginWithMeta({
        id: 'media-with-meta',
        preview: { type: 'image', poster: 'https://cdn/p.jpg' },
        query: 'Generate a {style} portrait of {subject}.',
      }),
    );
    // Plugin info sidebar pane + heading.
    expect(html).toContain('plugin-info-pane');
    expect(html).toContain('plugin-meta-sections');
    expect(html).toContain('plugin-meta-sections__heading');
    expect(html).toMatch(/<h3[^>]*>Plugin info<\/h3>/);
    // Prompt body block lives inside the sidebar with the same panel.
    expect(html).toContain('plugin-media-sidebar__prompt');
    expect(html).toContain('Generate a {style} portrait of {subject}.');
    // Manifest sections still render alongside the prompt.
    expect(html).toContain('Workflow');
    expect(html).toContain('Capabilities');
    expect(html).toContain('fs:read');
    expect(html).toContain('Source');
    expect(html).toMatch(/Path<\/dt>/);
    expect(html).toContain('/tmp');
  });

  it('surfaces meta sections in the example variant via the sidebar', () => {
    const html = render(
      pluginWithMeta({
        id: 'html-with-meta',
        preview: { type: 'html', entry: './ex.html' },
      }),
    );
    expect(html).toContain('plugin-info-pane');
    expect(html).toContain('plugin-meta-sections');
    expect(html).toContain('plugin-meta-sections__heading');
    expect(html).toMatch(/<h3[^>]*>Plugin info<\/h3>/);
    expect(html).toContain('Workflow');
    expect(html).toContain('Capabilities');
    expect(html).toContain('mcp:invoke');
  });

  it('surfaces Plugin info first in the design-system sidebar, with DESIGN.md below', () => {
    const html = render(
      pluginWithMeta({
        id: 'ds-with-meta',
        title: 'Brandy',
        mode: 'design-system',
        designSystemRef: 'brandy',
      }),
    );
    expect(html).toContain('plugin-design-sidebar');
    expect(html).toContain('plugin-info-pane');
    expect(html).toContain('plugin-meta-sections');
    expect(html).toContain('plugin-meta-sections__heading');
    expect(html).toMatch(/<h3[^>]*>Plugin info<\/h3>/);
    expect(html).toContain('plugin-design-sidebar__spec');
    expect(html).toContain('DESIGN.md');
    expect(html.indexOf('Plugin info')).toBeLessThan(html.indexOf('DESIGN.md'));
    expect(html).toContain('Workflow');
    expect(html).toContain('Source');
  });

  it('does not duplicate the plugin info heading inside the scenario fallback', () => {
    // The scenario variant uses the modal title as the "what is this
    // plugin" anchor, so adding a redundant inline heading would feel
    // like noise. Lock the absence so future refactors don't quietly
    // start passing `heading="Plugin info"` here too.
    const html = render(
      pluginWithMeta({
        id: 'scenario-with-meta',
        title: 'Scenario Plugin',
        mode: 'prototype',
      }),
    );
    expect(html).toContain('data-detail-variant="scenario"');
    expect(html).toContain('plugin-meta-sections');
    expect(html).not.toContain('plugin-meta-sections__heading');
  });

  it('routes official plugin author and source links to the Open Design repo', () => {
    const html = render(
      pluginWithMeta({
        id: 'official-link-meta',
        title: 'Official Link Meta',
        mode: 'prototype',
      }),
    );

    expect(html).toContain('href="https://github.com/nexu-io/open-design"');
    expect(html).toContain('nexu-io/open-design');
    expect(html).toContain('Official');
  });
});
