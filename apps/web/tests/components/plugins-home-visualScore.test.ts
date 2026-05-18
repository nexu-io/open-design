// Visual-appeal ranking contract for the plugins-home gallery.
//
// The home grid relies on `sortByVisualAppeal` (and the underlying
// `pluginVisualScore`) to surface cinematic decks / image / video
// templates above plain scenario plugins. These tests lock the
// ordering so the first viewport keeps leading with rich previews
// instead of regressing back to alphabetical bundled noise.

import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  pluginVisualScore,
  sortByVisualAppeal,
} from '../../src/components/plugins-home/visualScore';

function fixture(overrides: {
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
  od?: Record<string, unknown>;
  author?: string;
}): InstalledPluginRecord {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: overrides.id,
      version: '0.1.0',
      ...(overrides.description ? { description: overrides.description } : {}),
      ...(overrides.tags ? { tags: overrides.tags } : {}),
      ...(overrides.author
        ? { author: { name: overrides.author } }
        : {}),
      ...(overrides.od ? { od: overrides.od } : {}),
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

describe('pluginVisualScore', () => {
  it('boosts featured plugins above everything else', () => {
    const plain = fixture({ id: 'plain' });
    const featured = fixture({ id: 'featured', od: { featured: true } });
    expect(pluginVisualScore(featured)).toBeGreaterThan(
      pluginVisualScore(plain) + 500,
    );
  });

  it('uses numeric featured ranks to order curated picks', () => {
    const lead = fixture({ id: 'lead', od: { featured: 2 } });
    const later = fixture({ id: 'later', od: { featured: 19 } });
    expect(pluginVisualScore(lead)).toBeGreaterThan(pluginVisualScore(later));
  });

  it('ranks media-rich plugins above plain scenarios', () => {
    const text = fixture({ id: 'text' });
    const deckHtml = fixture({
      id: 'deck',
      od: { mode: 'deck', preview: { type: 'html', entry: './index.html' } },
    });
    const image = fixture({
      id: 'image',
      od: { surface: 'image', mode: 'image', preview: { type: 'image', poster: 'a.png' } },
    });
    const video = fixture({
      id: 'video',
      od: { surface: 'video', mode: 'video', preview: { type: 'video', video: 'a.mp4' } },
    });
    expect(pluginVisualScore(video)).toBeGreaterThan(pluginVisualScore(image));
    expect(pluginVisualScore(image)).toBeGreaterThan(pluginVisualScore(deckHtml));
    expect(pluginVisualScore(deckHtml)).toBeGreaterThan(pluginVisualScore(text));
  });

  it('credits design-system plugins between decks and plain text', () => {
    const text = fixture({ id: 'text' });
    const ds = fixture({ id: 'ds', od: { mode: 'design-system' } });
    expect(pluginVisualScore(ds)).toBeGreaterThan(pluginVisualScore(text));
  });

  it('penalises atom kind so they never accidentally lead the grid', () => {
    const atom = fixture({ id: 'a', od: { kind: 'atom' } });
    expect(pluginVisualScore(atom)).toBeLessThan(0);
  });
});

describe('sortByVisualAppeal', () => {
  it('places the cinematic deck first, plain scenarios last', () => {
    const records = [
      fixture({ id: 'plain' }),
      fixture({
        id: 'guizang-ppt',
        od: { mode: 'deck', preview: { type: 'html', entry: './index.html' } },
      }),
      fixture({
        id: 'photo',
        od: {
          surface: 'image',
          mode: 'image',
          preview: { type: 'image', poster: 'p.png' },
        },
      }),
      fixture({
        id: 'reel',
        od: {
          surface: 'video',
          mode: 'video',
          preview: { type: 'video', video: 'r.mp4', poster: 'r.png' },
          featured: true,
        },
      }),
    ];
    const sorted = sortByVisualAppeal(records).map((r) => r.id);
    expect(sorted[0]).toBe('reel');
    expect(sorted[sorted.length - 1]).toBe('plain');
  });

  it('keeps numeric featured rank ahead of media bonuses', () => {
    const records = [
      fixture({
        id: 'hyperframes',
        od: {
          surface: 'video',
          mode: 'video',
          preview: { type: 'video', video: 'r.mp4', poster: 'r.png' },
          featured: 0.13,
        },
      }),
      fixture({
        id: 'guizang',
        od: {
          mode: 'deck',
          preview: { type: 'html', entry: './index.html' },
          featured: 0.01,
        },
      }),
      fixture({ id: 'huashu', od: { mode: 'prototype', featured: 0.03 } }),
      fixture({ id: 'kami', od: { mode: 'deck', featured: 0.06 } }),
    ];
    const sorted = sortByVisualAppeal(records).map((r) => r.id);
    expect(sorted).toEqual(['guizang', 'huashu', 'kami', 'hyperframes']);
  });

  it('keeps the original list reference unchanged (returns a new array)', () => {
    const records = [
      fixture({ id: 'a' }),
      fixture({ id: 'b', od: { mode: 'deck' } }),
    ];
    const before = records.map((r) => r.id).join(',');
    sortByVisualAppeal(records);
    expect(records.map((r) => r.id).join(',')).toBe(before);
  });

  it('breaks ties deterministically by title, then by original position', () => {
    const records = [
      fixture({ id: 'beta', title: 'Beta' }),
      fixture({ id: 'alpha', title: 'Alpha' }),
    ];
    const sorted = sortByVisualAppeal(records).map((r) => r.id);
    expect(sorted).toEqual(['alpha', 'beta']);
  });
});
