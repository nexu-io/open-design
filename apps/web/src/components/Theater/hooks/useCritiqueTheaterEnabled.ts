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
 * config and emits the same-tab CustomEvent so every mounted
 * `useCritiqueTheaterEnabled` updates without a reload.
 */
export function setCritiqueTheaterEnabled(next: boolean): void {
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
