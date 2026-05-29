// plugin-url — single source of truth for the public marketplace URL scheme.
// Web (PluginShareMenu) and the landing site both derive links here; this
// pins the slug rules so the two surfaces can't drift into a 404 against the
// SSG site. Detail/share routes are SINGLE-segment (last id segment); the
// preview route keeps the namespace.

import { describe, expect, it } from 'vitest';
import {
  OPEN_DESIGN_SITE_ORIGIN,
  pluginSlug,
  pluginSlugSegment,
  pluginDetailSlug,
  pluginDetailPath,
  pluginPreviewPath,
  pluginShareUrl,
} from '../src/plugins/plugin-url.js';

describe('pluginSlugSegment', () => {
  it('lowercases, collapses unsafe runs, trims dashes', () => {
    expect(pluginSlugSegment('Hero Deck')).toBe('hero-deck');
    expect(pluginSlugSegment('  Wild!!Name  ')).toBe('wild-name');
  });
  it('keeps url-safe punctuation and falls back to "plugin"', () => {
    expect(pluginSlugSegment('keep.dots_and-dashes')).toBe('keep.dots_and-dashes');
    expect(pluginSlugSegment('!!!')).toBe('plugin');
  });
});

describe('pluginDetailSlug (single segment = last id segment)', () => {
  it('takes the slugified last segment, dropping any namespace', () => {
    expect(pluginDetailSlug('open-design/Hero Deck')).toBe('hero-deck');
    expect(pluginDetailSlug('community/registry-starter')).toBe('registry-starter');
    expect(pluginDetailSlug('live-dashboard')).toBe('live-dashboard');
  });
});

describe('pluginSlug (multi-segment, namespace preserved)', () => {
  it('slugifies each segment and keeps / as a separator', () => {
    expect(pluginSlug('open-design/Hero Deck')).toBe('open-design/hero-deck');
  });
});

describe('pluginDetailPath / pluginPreviewPath', () => {
  it('detail path is single-segment with trailing slash', () => {
    expect(pluginDetailPath('open-design/Hero Deck')).toBe('/plugins/hero-deck/');
    expect(pluginDetailPath('live-dashboard')).toBe('/plugins/live-dashboard/');
  });
  it('preview path keeps the namespace', () => {
    expect(pluginPreviewPath('open-design/Hero Deck')).toBe(
      '/plugins/previews/open-design/hero-deck/',
    );
  });
});

describe('pluginShareUrl', () => {
  it('defaults to the public open-design.ai origin, single-segment path', () => {
    expect(OPEN_DESIGN_SITE_ORIGIN).toBe('https://open-design.ai');
    expect(pluginShareUrl('open-design/live-dashboard')).toBe(
      'https://open-design.ai/plugins/live-dashboard/',
    );
  });
  it('honours an explicit origin and trims a trailing slash on it', () => {
    expect(pluginShareUrl('x', 'https://self.host')).toBe('https://self.host/plugins/x/');
    expect(pluginShareUrl('x', 'https://self.host/')).toBe('https://self.host/plugins/x/');
  });
});
