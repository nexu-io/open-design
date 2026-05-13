import { useEffect, useState } from 'react';

const STORAGE_KEY = 'open-design:config';
const TOGGLE_EVENT = 'open-design:critique-theater-toggle';

interface ConfigShape {
  critiqueTheaterEnabled?: boolean;
  [k: string]: unknown;
}

/**
 * Read the Settings-toggle flag for Critique Theater (Phase 15.3).
 *
 * Source of truth is the existing `open-design:config` localStorage
 * blob the Settings panel already round-trips. The web layer reads the
 * stored boolean; the daemon-side `isCritiqueEnabled` makes the final
 * routing decision (project-level override, env override, rollout
 * phase). When the two disagree, the daemon wins for backend gating
 * and the web reflects what the user toggled.
 *
 * The hook participates in two refresh paths:
 *
 *   1. The platform `storage` event fires for other tabs and is how
 *      the toggle stays in sync across browser windows.
 *   2. A same-tab `open-design:critique-theater-toggle` CustomEvent so
 *      a Settings save in the same window updates this hook without
 *      a page reload. The Settings save handler emits the event after
 *      it writes the new config blob.
 *
 * Same-tab payload handling (Siri-Ray + lefarcen P2 on PR #1320): the
 * CustomEvent carries `detail.enabled: boolean`. The listener prefers
 * the in-event payload over re-reading localStorage, because the
 * setter intentionally swallows quota / private-mode write failures
 * and still dispatches the event. Reading localStorage in that path
 * would see the stale (or empty) blob and the in-session UI would
 * lag the user's actual toggle. Storage events (cross-tab) do not
 * carry a typed payload, so they still fall back to `readToggle()`.
 */
export function useCritiqueTheaterEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => readToggle());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reload = (): void => setEnabled(readToggle());
    const onStorage = (evt: StorageEvent): void => {
      if (evt.key !== null && evt.key !== STORAGE_KEY) return;
      reload();
    };
    const onCustom = (evt: Event): void => {
      // Prefer the event's typed payload so a same-tab toggle still
      // reflects in the UI even when localStorage is unwritable.
      const detail = (evt as CustomEvent<{ enabled?: unknown }>).detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setEnabled(detail.enabled);
        return;
      }
      // Malformed CustomEvent (no detail, or detail.enabled not
      // boolean): degrade to the localStorage path.
      reload();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(TOGGLE_EVENT, onCustom);
    reload();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(TOGGLE_EVENT, onCustom);
    };
  }, []);
  return enabled;
}

/**
 * Imperative setter the Settings panel calls. Mutates the stored
 * config, emits the same-tab CustomEvent so every mounted
 * `useCritiqueTheaterEnabled` updates without a reload, and (when a
 * project id is supplied) round-trips the same value through the
 * existing `/api/projects/:id` settings endpoint so the daemon's
 * spawn-time resolver picks the override up the next time the
 * project starts a generation.
 *
 * Three writes, in order:
 *
 *   1. localStorage. What the web's `useCritiqueTheaterEnabled` hook
 *      reads, so the in-session UI flips immediately.
 *   2. Same-tab CustomEvent. Every mounted hook updates from the
 *      typed payload without re-reading storage.
 *   3. Project PATCH (when `projectId` is supplied). The setter GETs
 *      the project, spreads its current `metadata` into the patch,
 *      overlays `critiqueTheaterEnabled`, then PATCHes the merged
 *      object. The read-merge-write is mandatory because
 *      `PATCH /api/projects/:id` replaces `metadata` wholesale and a
 *      bare patch would wipe the row's other fields (`kind`,
 *      `templateId`, `linkedDirs`, ...). PerishCode P2 on PR #1338.
 *
 * Failure modes:
 *
 *   - localStorage rejected (quota / private mode): falls through to
 *     the dispatch + PATCH; the in-session UI still flips.
 *   - CustomEvent shim missing: single-mount remains correct.
 *   - Project GET fails: PATCH is skipped entirely so the row's other
 *     metadata fields are not at risk.
 *   - PATCH fails: logged in dev; the in-session UI is already
 *     consistent.
 *
 * `fetchProjectSettings` is a test seam mirroring the
 * `fetchInterrupt` pattern on `CritiqueTheaterMount`; production
 * callers pass nothing and the platform `fetch` is used.
 */
export interface SetCritiqueTheaterEnabledOptions {
  /** Project id to round-trip the override through the daemon. */
  projectId?: string;
  /** Test seam: swap the PATCH transport. */
  fetchProjectSettings?: (url: string, init: RequestInit) => Promise<Response>;
}

export function setCritiqueTheaterEnabled(
  next: boolean,
  options: SetCritiqueTheaterEnabledOptions = {},
): void {
  if (typeof window === 'undefined') return;
  let parsed: ConfigShape = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const candidate: unknown = JSON.parse(raw);
      if (candidate && typeof candidate === 'object') {
        parsed = candidate as ConfigShape;
      }
    }
  } catch {
    /* fall through to fresh object */
  }
  parsed.critiqueTheaterEnabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* private mode / quota / disabled storage: the in-session event
       below still propagates to other mounts so the UI stays
       consistent for the rest of the session. */
  }
  try {
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: { enabled: next } }));
  } catch {
    /* CustomEvent shim missing: single mount remains correct. */
  }
  // Round-trip the override through the existing project-settings
  // endpoint so the daemon's spawn-time resolver picks it up on the
  // next generation. Read-merge-write rather than a bare patch:
  // `PATCH /api/projects/:id` replaces `metadata` wholesale (the
  // route only re-stamps the three immutable folder-import fields),
  // so sending only `{ critiqueTheaterEnabled }` would wipe `kind`,
  // `templateId`, `linkedDirs`, and any other field the rest of the
  // app reads. We GET the project first, overlay the toggle on the
  // returned metadata, then PATCH the merged object. PerishCode P2
  // on PR #1338.
  //
  // Failure handling:
  //   - GET fails → skip the PATCH entirely. We cannot construct a
  //     safe merged body without the current state, and a bare patch
  //     would wipe other metadata. The in-session CustomEvent fired
  //     above still keeps every mounted hook consistent; the next
  //     save retries the round-trip.
  //   - PATCH fails → log in dev. The in-session UI is already
  //     correct via the CustomEvent.
  //
  // Skipped silently when no projectId is provided (the bare hook
  // still works for integrators that drive a non-project surface).
  if (options.projectId) {
    const projectId = options.projectId;
    const fetcher = options.fetchProjectSettings
      ?? ((url: string, init: RequestInit) => fetch(url, init));
    const projectUrl = `/api/projects/${encodeURIComponent(projectId)}`;
    (async () => {
      let existingMetadata: Record<string, unknown> = {};
      try {
        const getRes = await fetcher(projectUrl, { method: 'GET' });
        if (!getRes.ok) {
          throw new Error(`prefetch returned status ${getRes.status}`);
        }
        const body = (await getRes.json()) as {
          project?: { metadata?: unknown };
        };
        const meta = body?.project?.metadata;
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
          existingMetadata = meta as Record<string, unknown>;
        }
      } catch (err) {
        if (
          typeof process !== 'undefined'
          && process.env?.NODE_ENV === 'development'
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            '[critique-theater] project-settings prefetch failed; skipping PATCH to avoid clobbering metadata',
            err,
          );
        }
        return;
      }
      try {
        await fetcher(projectUrl, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            metadata: { ...existingMetadata, critiqueTheaterEnabled: next },
          }),
        });
      } catch (err) {
        if (
          typeof process !== 'undefined'
          && process.env?.NODE_ENV === 'development'
        ) {
          // eslint-disable-next-line no-console
          console.warn('[critique-theater] project-settings PATCH failed', err);
        }
      }
    })().catch(() => {
      /* Already surfaced inside the async block. */
    });
  }
}

function readToggle(): boolean {
  if (typeof window === 'undefined') return false;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return false;
    return (parsed as ConfigShape).critiqueTheaterEnabled === true;
  } catch {
    return false;
  }
}
