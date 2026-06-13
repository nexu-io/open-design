// Shared Discord presence hook backing the entry Discord CTAs.
//
// The renderer asks the local daemon for public invite counts so we avoid
// Discord CORS/runtime quirks in Electron and can reuse stale values when
// the upstream request fails.

import { useEffect, useState } from 'react';
import type { OpenDesignDiscordPresenceResponse } from '@open-design/contracts';

const API = '/api/community/discord';
const LS_KEY = 'open-design:discord-presence';
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedPresence = {
  onlineCount: number;
  memberCount: number;
  ts: number;
};

let memoryCache: CachedPresence | null = null;
let inflight: Promise<CachedPresence | null> | null = null;

function readPersistedCache(): CachedPresence | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPresence>;
    if (
      typeof parsed.onlineCount !== 'number' ||
      typeof parsed.memberCount !== 'number' ||
      typeof parsed.ts !== 'number'
    ) {
      return null;
    }
    return {
      onlineCount: parsed.onlineCount,
      memberCount: parsed.memberCount,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

function writePersistedCache(value: CachedPresence): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    // The in-memory cache still covers this tab if localStorage is full.
  }
}

function cacheFromPayload(payload: Partial<OpenDesignDiscordPresenceResponse>): CachedPresence | null {
  if (
    typeof payload.onlineCount !== 'number' ||
    payload.onlineCount < 0 ||
    typeof payload.memberCount !== 'number' ||
    payload.memberCount < 0
  ) {
    return null;
  }
  return {
    onlineCount: payload.onlineCount,
    memberCount: payload.memberCount,
    ts: Date.now(),
  };
}

export function formatDiscordPresenceCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1000) return String(Math.round(count));
  return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function useDiscordPresence(): CachedPresence | null {
  const [presence, setPresence] = useState<CachedPresence | null>(() => {
    if (memoryCache) return memoryCache;
    const persisted = readPersistedCache();
    if (persisted) memoryCache = persisted;
    return persisted;
  });

  useEffect(() => {
    const now = Date.now();
    const cached = memoryCache ?? readPersistedCache();
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      memoryCache = cached;
      setPresence(cached);
      return;
    }

    let active = true;
    if (!inflight) {
      inflight = (async () => {
        try {
          const res = await fetch(API);
          if (!res.ok) return null;
          const next = cacheFromPayload(await res.json());
          if (!next) return null;
          memoryCache = next;
          writePersistedCache(next);
          return next;
        } catch {
          return null;
        } finally {
          inflight = null;
        }
      })();
    }

    void inflight.then((next) => {
      if (!active || !next) return;
      setPresence(next);
    });

    return () => {
      active = false;
    };
  }, []);

  return presence;
}
