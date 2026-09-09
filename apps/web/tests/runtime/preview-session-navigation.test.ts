import { describe, expect, it } from 'vitest';
import type { ProjectScopedPreviewNavigation } from '../../src/providers/registry';
import {
  buildPreviewSessionNavigation,
  type PreviewSessionNavigationPolicy,
} from '../../src/runtime/preview-session-navigation';

const scoped: ProjectScopedPreviewNavigation = {
  sessionId: 'scope-0001',
  normalUrl: 'http://n-scope-0001.localhost:17456/nested/My%20Deck.html',
  poweredUrl: 'http://p-scope-0001.localhost:17456/nested/My%20Deck.html',
  documentVersion: '10:20',
  runtimeProtocol: 'universal',
  renewalScope: {
    href: 'http://host/api/projects/project-1/preview/scope-0001/nested/',
    expiresAt: 20_000,
  },
};

function policy(
  overrides: Partial<PreviewSessionNavigationPolicy> = {},
): PreviewSessionNavigationPolicy {
  return {
    sandboxProfile: 'normal',
    guards: { storage: false, focus: false, redirect: false },
    deck: false,
    ...overrides,
  };
}

describe('buildPreviewSessionNavigation', () => {
  it('keeps the exact normal document URL when no navigation policy is needed', () => {
    expect(buildPreviewSessionNavigation(scoped, policy())).toEqual({
      sessionId: 'scope-0001',
      documentVersion: '10:20',
      url: scoped.normalUrl,
      runtimeProtocol: 'universal',
      sandboxProfile: 'normal',
      deck: false,
    });
  });

  it('prefers the daemon policy over a stale host fallback', () => {
    const authoritative = {
      ...scoped,
      previewPolicy: {
        sandboxProfile: 'powered' as const,
        guards: { storage: false, focus: false, redirect: false },
      },
    };
    const result = buildPreviewSessionNavigation(authoritative, policy({
      guards: { storage: true, focus: true, redirect: true },
    }));

    expect(new URL(result.url).origin).toBe('http://p-scope-0001.localhost:17456');
    expect(new URL(result.url).searchParams.getAll('odPreviewBridge')).toEqual([]);
    expect(result.sandboxProfile).toBe('powered');
  });

  it('prefers daemon Deck classification over a stale host fallback', () => {
    const authoritative = {
      ...scoped,
      previewPolicy: {
        sandboxProfile: 'normal' as const,
        guards: { storage: false, focus: false, redirect: false },
        deck: true,
      },
    };

    const result = buildPreviewSessionNavigation(authoritative, policy({ deck: false }));

    expect(new URL(result.url).searchParams.getAll('odPreviewRuntime')).toEqual([]);
    expect(result.deck).toBe(true);
  });

  it('adds passive guards and deck runtime without changing the file path', () => {
    const result = buildPreviewSessionNavigation(scoped, policy({
      guards: { storage: true, focus: true, redirect: true },
      deck: true,
    }));
    const url = new URL(result.url);

    expect(url.origin).toBe('http://n-scope-0001.localhost:17456');
    expect(url.pathname).toBe('/nested/My%20Deck.html');
    expect(url.searchParams.getAll('odPreviewBridge')).toEqual([
      'sandbox',
      'focus',
      'redirect',
    ]);
    expect(url.searchParams.getAll('odPreviewRuntime')).toEqual([]);
  });

  it('uses powered isolation while retaining document guards', () => {
    const result = buildPreviewSessionNavigation(scoped, policy({
      sandboxProfile: 'powered',
      guards: { storage: true, focus: true, redirect: true },
      deck: true,
    }));
    const url = new URL(result.url);

    expect(url.origin).toBe('http://p-scope-0001.localhost:17456');
    expect(url.searchParams.getAll('odPreviewBridge')).toEqual([
      'focus',
      'redirect',
    ]);
    expect(url.searchParams.getAll('odPreviewRuntime')).toEqual([]);
  });

  it('is deterministic and does not mutate the cached scoped navigation', () => {
    const selectedPolicy = policy({
      guards: { storage: false, focus: true, redirect: false },
    });
    const first = buildPreviewSessionNavigation(scoped, selectedPolicy);
    const second = buildPreviewSessionNavigation(scoped, selectedPolicy);

    expect(second).toEqual(first);
    expect(scoped.normalUrl).not.toContain('?');
    expect(scoped.poweredUrl).not.toContain('?');
  });
});
