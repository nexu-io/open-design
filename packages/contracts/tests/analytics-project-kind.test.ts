import { describe, expect, it } from 'vitest';

import { projectKindToTracking } from '../src/analytics/events.js';

describe('projectKindToTracking', () => {
  it('maps the base project kinds to their tracking enum', () => {
    expect(projectKindToTracking('prototype')).toBe('prototype');
    expect(projectKindToTracking('deck')).toBe('slide_deck');
    expect(projectKindToTracking('template')).toBe('template');
    expect(projectKindToTracking('image')).toBe('image');
    expect(projectKindToTracking('video')).toBe('video');
    expect(projectKindToTracking('audio')).toBe('audio');
    expect(projectKindToTracking('brand')).toBe('brand');
    expect(projectKindToTracking('live-artifact')).toBe('live_artifact');
    expect(projectKindToTracking('other')).toBe('other');
    expect(projectKindToTracking(null)).toBeNull();
    expect(projectKindToTracking('bogus')).toBeNull();
  });

  it('splits HyperFrames out of generic video via the videoModel', () => {
    expect(projectKindToTracking('video', 'hyperframes-html')).toBe('hyperframes');
  });

  it('keeps a video project as video for any other videoModel', () => {
    expect(projectKindToTracking('video', 'kling-v2')).toBe('video');
    expect(projectKindToTracking('video', undefined)).toBe('video');
    expect(projectKindToTracking('video', null)).toBe('video');
  });

  it('only promotes to hyperframes when the kind is video', () => {
    // videoModel without a video kind must not leak into other kinds.
    expect(projectKindToTracking('image', 'hyperframes-html')).toBe('image');
    expect(projectKindToTracking('prototype', 'hyperframes-html')).toBe('prototype');
  });
});
