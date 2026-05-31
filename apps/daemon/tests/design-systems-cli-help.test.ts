import { describe, expect, it } from 'vitest';

import {
  DESIGN_SYSTEMS_USAGE,
  isDesignSystemsHelpArg,
} from '../src/design-systems-cli-help.js';

describe('od design-systems help surface', () => {
  it('routes help, --help, and -h to the usage text', () => {
    expect(isDesignSystemsHelpArg('help')).toBe(true);
    expect(isDesignSystemsHelpArg('--help')).toBe(true);
    expect(isDesignSystemsHelpArg('-h')).toBe(true);
  });

  it('does not treat subcommands or a missing arg as a help request', () => {
    expect(isDesignSystemsHelpArg('list')).toBe(false);
    expect(isDesignSystemsHelpArg('show')).toBe(false);
    expect(isDesignSystemsHelpArg('rename')).toBe(false);
    expect(isDesignSystemsHelpArg(undefined)).toBe(false);
  });

  it('advertises rename alongside list and show so the surface cannot drift', () => {
    expect(DESIGN_SYSTEMS_USAGE).toContain('list');
    expect(DESIGN_SYSTEMS_USAGE).toContain('show');
    expect(DESIGN_SYSTEMS_USAGE).toContain('rename');
  });
});
