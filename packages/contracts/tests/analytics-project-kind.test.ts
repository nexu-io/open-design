import { describe, expect, it } from 'vitest';

import {
  projectKindFromMetadataToTracking,
  projectKindToTracking,
} from '../src/analytics/events.js';

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
    expect(projectKindToTracking('web-clone')).toBe('web_clone');
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

  it('splits prototype subtypes out via the metadata discriminators', () => {
    // Each Home task card persists a distinguishing metadata field; the
    // analytics kind must line up with the card the user picked.
    expect(projectKindToTracking('prototype', null, { fidelity: 'wireframe' })).toBe('wireframe');
    expect(projectKindToTracking('prototype', null, { platform: 'mobile-ios' })).toBe('mobile');
    expect(
      projectKindToTracking('prototype', null, { platformTargets: ['mobile-ios', 'mobile-android'] }),
    ).toBe('mobile');
    expect(projectKindToTracking('prototype', null, { intent: 'live-artifact' })).toBe('live_artifact');
    expect(projectKindToTracking('prototype', null, { intent: 'web-clone' })).toBe('web_clone');
    // A bare prototype (no discriminators) stays prototype.
    expect(projectKindToTracking('prototype', null, {})).toBe('prototype');
    expect(projectKindToTracking('prototype', null, { platform: 'web-desktop' })).toBe('prototype');
  });

  it('applies the web_clone > live_artifact > wireframe > mobile precedence', () => {
    expect(
      projectKindToTracking('prototype', null, {
        intent: 'web-clone',
        fidelity: 'wireframe',
        platform: 'mobile-ios',
      }),
    ).toBe('web_clone');
    expect(
      projectKindToTracking('prototype', null, {
        intent: 'live-artifact',
        fidelity: 'wireframe',
        platform: 'mobile-ios',
      }),
    ).toBe('live_artifact');
    expect(
      projectKindToTracking('prototype', null, { fidelity: 'wireframe', platform: 'mobile-ios' }),
    ).toBe('wireframe');
  });

  it('splits document out of generic other via intent', () => {
    expect(projectKindToTracking('other', null, { intent: 'document' })).toBe('document');
    expect(projectKindToTracking('other', null, {})).toBe('other');
    // The discriminators are scoped to their owning kind: a non-prototype kind
    // must not pick up wireframe/mobile, and document only applies to `other`.
    expect(projectKindToTracking('image', null, { fidelity: 'wireframe' })).toBe('image');
    expect(projectKindToTracking('deck', null, { intent: 'document' })).toBe('slide_deck');
  });

  it('derives the fine kind straight from a metadata object', () => {
    expect(
      projectKindFromMetadataToTracking({ kind: 'prototype', fidelity: 'wireframe' }),
    ).toBe('wireframe');
    expect(
      projectKindFromMetadataToTracking({
        kind: 'prototype',
        platformTargets: ['mobile-ios', 'mobile-android'],
      }),
    ).toBe('mobile');
    expect(
      projectKindFromMetadataToTracking({ kind: 'prototype', intent: 'live-artifact' }),
    ).toBe('live_artifact');
    expect(
      projectKindFromMetadataToTracking({ kind: 'prototype', intent: 'web-clone' }),
    ).toBe('web_clone');
    expect(projectKindFromMetadataToTracking({ kind: 'other', intent: 'document' })).toBe('document');
    expect(projectKindFromMetadataToTracking({ kind: 'video', videoModel: 'hyperframes-html' })).toBe(
      'hyperframes',
    );
    expect(projectKindFromMetadataToTracking({ kind: 'deck' })).toBe('slide_deck');
    expect(projectKindFromMetadataToTracking(null)).toBeNull();
  });
});
