import { describe, expect, it } from 'vitest';

import { buildGithubConnectorRunbook } from '../../src/components/DesignSystemFlow';

/**
 * Red spec for issue #4854 — "Design-system projects can repeatedly prompt
 * GitHub connect/auth even after GitHub is already connected".
 *
 * The GitHub intake runbook is injected into the per-run agent prompt AND
 * written into `context/source-context.md`, which the agent re-reads on every
 * subsequent command. Today `buildGithubConnectorRunbook` is a pure function of
 * the repo URLs only — it ignores whether GitHub is already connected — so it
 * always leads with mandatory `gh auth login --web` re-authentication. That
 * stale, connection-blind guidance is what re-prompts already-connected users
 * to connect/auth on every run.
 *
 * Invariant: when GitHub is already connected the runbook must acknowledge the
 * existing connection and demote `gh auth login --web` to a conditional local
 * fallback rather than a required first-class setup step.
 */
const REPOS = ['https://github.com/acme/product'];

describe('buildGithubConnectorRunbook connection-awareness (#4854)', () => {
  it('produces different guidance depending on whether GitHub is already connected', () => {
    const connected = buildGithubConnectorRunbook(REPOS, { githubConnected: true });
    const disconnected = buildGithubConnectorRunbook(REPOS, { githubConnected: false });
    // A connection-blind runbook returns identical text for both states, which
    // is exactly the conflation issue #4854 describes.
    expect(connected).not.toEqual(disconnected);
  });

  it('acknowledges the existing connection instead of demanding re-auth when connected', () => {
    const connected = buildGithubConnectorRunbook(REPOS, { githubConnected: true });
    // When connected, the runbook must not present mandatory re-authentication
    // as if GitHub were not connected.
    expect(connected).toMatch(/already connected|GitHub is connected/i);
    expect(connected).not.toMatch(
      /tries this-device access first \(`git clone`, then authenticated GitHub CLI via `gh auth login --web`\)/u,
    );
  });

  it('still drives bounded intake and keeps auth recovery available when connected', () => {
    const connected = buildGithubConnectorRunbook(REPOS, { githubConnected: true });
    // The bounded intake command must always be present regardless of connection.
    expect(connected).toContain('github-design-context');
    // `gh auth login --web` may still appear, but only as a conditional fallback.
    expect(connected).toContain('https://github.com/acme/product');
  });

  it('keeps the existing connect/auth guidance when GitHub is not connected', () => {
    const disconnected = buildGithubConnectorRunbook(REPOS, { githubConnected: false });
    expect(disconnected).toContain('github-design-context');
    expect(disconnected).toContain('gh auth login --web');
  });
});
