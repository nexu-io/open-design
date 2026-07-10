import { describe, expect, it } from 'vitest';
import { buildPath, parseRoute } from '../src/router';

describe('Repo Studio route', () => {
  it('parses and builds the studio route', () => {
    expect(parseRoute('/studio')).toEqual({ kind: 'repo-studio' });
    expect(buildPath({ kind: 'repo-studio' })).toBe('/studio');
  });
});
