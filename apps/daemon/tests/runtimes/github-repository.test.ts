import { describe, expect, it } from 'vitest';
import {
  isGhApiRateLimit,
  isPlaceholderRepoOwner,
  isRepoNotFound,
  parseGhAuthStatusLogin,
  parseGithubRepoUrl,
} from '../../src/runtimes/github-repository.js';

describe('GitHub repository boundary helpers', () => {
  it('normalizes GitHub URLs and shorthand repository names', () => {
    expect(parseGithubRepoUrl(' https://github.com/Acme/Plugin.git ')).toEqual({
      owner: 'Acme',
      name: 'Plugin',
      fullName: 'Acme/Plugin',
      url: 'https://github.com/Acme/Plugin',
    });
    expect(parseGithubRepoUrl('Acme/Plugin')).toMatchObject({ fullName: 'Acme/Plugin' });
    expect(parseGithubRepoUrl('https://gitlab.com/Acme/Plugin')).toBeNull();
    expect(parseGithubRepoUrl('Acme/Plugin/extra')).toBeNull();
  });

  it('rejects placeholder owners while allowing real identities', () => {
    expect(isPlaceholderRepoOwner('your-org')).toBe(true);
    expect(isPlaceholderRepoOwner(' Open-Design-User ')).toBe(true);
    expect(isPlaceholderRepoOwner('nexu-io')).toBe(false);
  });

  it('detects repository lookup failures from either command stream', () => {
    expect(isRepoNotFound({ stderr: 'Could not resolve to a Repository' })).toBe(true);
    expect(isRepoNotFound({ stdout: 'repository not found' })).toBe(true);
    expect(isRepoNotFound({ stdout: 'HTTP 500' })).toBe(false);
  });

  it('extracts the authenticated account from gh status output', () => {
    expect(parseGhAuthStatusLogin('Logged in to github.com account octocat (keyring)')).toBe('octocat');
    expect(parseGhAuthStatusLogin('Token account: octocat')).toBe('octocat');
    expect(parseGhAuthStatusLogin('not logged in')).toBe('');
  });

  it('recognizes GitHub API rate-limit diagnostics', () => {
    expect(isGhApiRateLimit({ stderr: 'API rate limit exceeded for user' })).toBe(true);
    expect(isGhApiRateLimit({ stdout: 'authenticated requests get a higher rate limit' })).toBe(true);
    expect(isGhApiRateLimit({ stderr: 'permission denied' })).toBe(false);
  });
});
