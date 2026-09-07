import { describe, expect, it } from 'vitest';
import {
  OD_NEXT_PROTOTYPE_PRESENTATION_PROFILE_VERSION,
  PrototypePresentationV1Schema,
  parsePrototypePresentation,
  prototypeProfileRequiresPresentation,
  readPrototypePresentationFromPlan,
  type PrototypePresentationV1,
} from '../src/index.js';

const website = {
  productSurface: 'website',
  viewport: 'responsive',
  deviceFrame: 'none',
  frameSource: 'none',
} as const satisfies PrototypePresentationV1;

describe('prototype presentation', () => {
  it.each(['website', 'web-app', 'mobile-app', 'desktop-app', 'tablet-app'])(
    'keeps %s independent from viewport size',
    (productSurface) => {
      for (const viewport of ['responsive', 'phone', 'desktop', 'tablet']) {
        const presentation = { ...website, productSurface, viewport };
        expect(PrototypePresentationV1Schema.parse(presentation)).toEqual(presentation);
      }
    },
  );

  it.each(['ios', 'android', 'mobile-neutral'])(
    'allows %s frames for mobile apps or explicit presentation choices',
    (deviceFrame) => {
      expect(parsePrototypePresentation({
        productSurface: 'mobile-app', viewport: 'phone', deviceFrame,
        frameSource: 'mobile-app-default',
      })).not.toBeNull();
      for (const productSurface of ['website', 'web-app', 'mobile-app', 'desktop-app', 'tablet-app']) {
        for (const frameSource of ['user-request', 'existing-artifact']) {
          expect(parsePrototypePresentation({
            productSurface, viewport: 'phone', deviceFrame, frameSource,
          })).not.toBeNull();
        }
      }
    },
  );

  it.each(['website', 'web-app', 'desktop-app', 'tablet-app'])(
    'rejects automatically framing %s even at a phone viewport',
    (productSurface) => {
      for (const deviceFrame of ['ios', 'android', 'mobile-neutral']) {
        expect(parsePrototypePresentation({
          productSurface, viewport: 'phone', deviceFrame,
          frameSource: 'mobile-app-default',
        })).toBeNull();
      }
    },
  );

  it('requires frame presence and source presence to agree', () => {
    for (const frameSource of ['mobile-app-default', 'user-request', 'existing-artifact']) {
      expect(parsePrototypePresentation({
        ...website, productSurface: 'mobile-app', frameSource,
      })).toBeNull();
    }
    for (const deviceFrame of ['ios', 'android', 'mobile-neutral']) {
      expect(parsePrototypePresentation({ ...website, deviceFrame })).toBeNull();
    }
  });

  it.each(['productSurface', 'viewport', 'deviceFrame', 'frameSource'])(
    'rejects missing, non-string, or unknown %s values',
    (key) => {
      for (const value of [undefined, null, 1, '', 'unrecognized']) {
        expect(parsePrototypePresentation({ ...website, [key]: value })).toBeNull();
      }
    },
  );

  it('rejects unrecognized presentation fields', () => {
    expect(parsePrototypePresentation({ ...website, inferredFromWidth: true })).toBeNull();
  });
});

describe('prototype presentation version and plan readers', () => {
  it('starts requiring presentation at profile 2.3.0', () => {
    expect(OD_NEXT_PROTOTYPE_PRESENTATION_PROFILE_VERSION).toBe('2.3.0');
    for (const version of ['2.3.0', '2.3.1', '2.10.0', '3.0.0']) {
      expect(prototypeProfileRequiresPresentation(version)).toBe(true);
    }
    for (const version of ['1.9.0', '2.0.0', '2.2.0', '2.2.10', '2', 'historical-profile']) {
      expect(prototypeProfileRequiresPresentation(version)).toBe(false);
    }
  });

  it('reads the explicit website presentation without inferring a phone frame', () => {
    expect(readPrototypePresentationFromPlan({
      taskProfile: {
        taskType: 'prototype', taskProfileVersion: '2.3.0',
        taskSpecific: { presentation: { ...website, viewport: 'phone' }, primaryFlow: 'read-news' },
      },
    })).toEqual({ ...website, viewport: 'phone' });
  });

  it('returns null for missing or unknown legacy data and other task types', () => {
    for (const plan of [undefined, null, [], {}, { taskProfile: [] },
      { taskProfile: { taskType: 'prototype', taskSpecific: {} } },
      { taskProfile: { taskType: 'prototype', taskSpecific: { presentation: 'phone' } } },
      { taskProfile: { taskType: 'ppt', taskSpecific: { presentation: website } } },
    ]) {
      expect(readPrototypePresentationFromPlan(plan)).toBeNull();
    }
  });
});
