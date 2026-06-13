// Shared GitHub star-count hook backing the topbar pill
// (`GithubStarBadge`). The browser talks only to the local daemon,
// which caches GitHub metadata and can return stale-on-error values
// when the upstream API flakes. This keeps Electron / nightly builds
// out of the business of making unauthenticated GitHub requests from
// the renderer.

import { useEffect, useState } from 'react';
import type { OpenDesignGithubRepoResponse } from '@open-design/contracts';

const API = '/api/github/open-design';
const REPO = 'https://github.com/nexu-io/open-design';
const LS_KEY = 'open-design:gh-stars';
export const GITHUB_STARS_FALLBACK_LABEL = '40K+';

// One-hour soft cache — long enough to dodge GitHub's 60/hr
// unauthenticated quota when the same user reopens the app several
// times in a session, short enough that growing star counts still
// surface within a single working day.
const CACHE_TTL_MS = 60 * 60 * 1000;

type CachedStars = { count: number; ts: number };

let memoryCache: CachedStars | null = null;

function readPersistedCache(): CachedStars | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedStars>;
    if (typeof parsed.count !== 'number' || typeof parsed.ts !== 'number') {
      return null;
    }
    return { count: parsed.count, ts: parsed.ts };
  } catch {
    return null;
  }
}

function writePersistedCache(value: CachedStars): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    // Quota errors are fine to swallow — the in-memory cache still
    // keeps subsequent renders cheap within this tab.
  }
}

export function formatStars(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
}

export const GITHUB_REPO_URL = REPO;

export function useGithubStars(): number | null {
  const [count, setCount] = useState<number | null>(() => {
    if (memoryCache) return memoryCache.count;
    const persisted = readPersistedCache();
    if (persisted) memoryCache = persisted;
    return persisted ? persisted.count : null;
  });

  useEffect(() => {
    const now = Date.now();
    const cached = memoryCache ?? readPersistedCache();
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      memoryCache = cached;
      setCount(cached.count);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(API, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<OpenDesignGithubRepoResponse>;
        if (typeof data.stargazers_count !== 'number') return;
        const next: CachedStars = {
          count: data.stargazers_count,
          ts: Date.now(),
        };
        memoryCache = next;
        writePersistedCache(next);
        setCount(next.count);
      } catch {
        // Network failures and rate-limit 403s both land here. The
        // caller keeps rendering its previous (or fallback) count.
      }
    })();
    return () => ctrl.abort();
  }, []);

  return count;
}
