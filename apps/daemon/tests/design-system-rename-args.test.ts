import { describe, expect, it } from 'vitest';

import { parseDesignSystemRenameArgs } from '../src/design-system-rename-args.js';

describe('parseDesignSystemRenameArgs', () => {
  it('reads the id positional and the title from --title', () => {
    expect(parseDesignSystemRenameArgs(['user:acme', '--title', 'Acme v2'])).toEqual({
      id: 'user:acme',
      title: 'Acme v2',
    });
  });

  it('accepts --title=<value>', () => {
    expect(parseDesignSystemRenameArgs(['user:acme', '--title=Acme v2'])).toEqual({
      id: 'user:acme',
      title: 'Acme v2',
    });
  });

  it('falls back to trailing positionals as the title', () => {
    expect(parseDesignSystemRenameArgs(['user:acme', 'Acme', 'v2'])).toEqual({
      id: 'user:acme',
      title: 'Acme v2',
    });
  });

  it('does not mistake a --daemon-url value for the id or title', () => {
    expect(
      parseDesignSystemRenameArgs([
        '--daemon-url',
        'http://127.0.0.1:7456',
        'user:acme',
        '--title',
        'Acme v2',
      ]),
    ).toEqual({ id: 'user:acme', title: 'Acme v2' });
  });

  it('returns null when the title is missing', () => {
    expect(parseDesignSystemRenameArgs(['user:acme'])).toBeNull();
    expect(parseDesignSystemRenameArgs(['user:acme', '--title', '   '])).toBeNull();
  });

  it('returns null when the id is missing', () => {
    expect(parseDesignSystemRenameArgs(['--title', 'Acme v2'])).toBeNull();
    expect(parseDesignSystemRenameArgs([])).toBeNull();
  });

  it('does not treat a following flag as the --title value', () => {
    expect(parseDesignSystemRenameArgs(['user:acme', '--title', '--json'])).toBeNull();
    expect(
      parseDesignSystemRenameArgs(['user:acme', '--title', '--daemon-url', 'http://127.0.0.1:7456']),
    ).toBeNull();
  });

  it('returns null when --title is the last token with no value', () => {
    expect(parseDesignSystemRenameArgs(['user:acme', '--title'])).toBeNull();
  });

  it('still accepts a dash-leading title via the --title=<value> form', () => {
    expect(parseDesignSystemRenameArgs(['user:acme', '--title=-dash-brand'])).toEqual({
      id: 'user:acme',
      title: '-dash-brand',
    });
  });
});
