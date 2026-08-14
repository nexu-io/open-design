import { describe, expect, it } from 'vitest';

import { isCloudLoginOptional } from '../src/app-config.js';

// The flag is read through an injected env so these need no process.env
// mutation and cannot leak into neighbouring suites.
describe('isCloudLoginOptional', () => {
  it('defaults to false when the operator has not opted in', () => {
    expect(isCloudLoginOptional({})).toBe(false);
  });

  it('accepts the truthy spellings the rest of the OD_* family accepts', () => {
    for (const raw of ['1', 'true', 'yes', 'on', 'TRUE', ' On ']) {
      expect(isCloudLoginOptional({ OD_CLOUD_LOGIN_OPTIONAL: raw })).toBe(true);
    }
  });

  it('treats anything else as not opted in', () => {
    // '0'/'false' are the obvious ones; the empty and near-miss cases matter
    // more, because an operator who sets the var without a value must not
    // silently loosen the sign-in requirement.
    for (const raw of ['0', 'false', 'no', 'off', '', '   ', 'optional', 'y']) {
      expect(isCloudLoginOptional({ OD_CLOUD_LOGIN_OPTIONAL: raw })).toBe(false);
    }
  });
});
