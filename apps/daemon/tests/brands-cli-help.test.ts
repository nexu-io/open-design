import { describe, expect, it } from 'vitest';

import {
  BRAND_USAGE,
  isBrandHelpArg,
} from '../src/cli-help/index.js';

describe('od brand help surface', () => {
  it('routes help, --help, and -h to the usage text', () => {
    expect(isBrandHelpArg('help')).toBe(true);
    expect(isBrandHelpArg('--help')).toBe(true);
    expect(isBrandHelpArg('-h')).toBe(true);
  });

  it('does not treat subcommands or a missing arg as a help request', () => {
    expect(isBrandHelpArg('list')).toBe(false);
    expect(isBrandHelpArg('continue')).toBe(false);
    expect(isBrandHelpArg(undefined)).toBe(false);
  });

  it('advertises deterministic retry alongside the other brand commands', () => {
    expect(BRAND_USAGE).toContain('od brand list');
    expect(BRAND_USAGE).toContain('od brand create');
    expect(BRAND_USAGE).toContain('od brand continue');
    expect(BRAND_USAGE).toContain('od brand extract-from-html');
    expect(BRAND_USAGE).toContain('od brand finalize');
  });
});
