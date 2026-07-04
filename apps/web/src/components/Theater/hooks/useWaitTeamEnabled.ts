import { useEffect, useState } from 'react';

const STORAGE_KEY = 'open-design:config';
const TOGGLE_EVENT = 'open-design:wait-team-toggle';

interface ConfigShape {
  waitTeamEnabled?: boolean;
  [k: string]: unknown;
}

/**
 * Read the Settings-toggle flag for multi-agent team collaboration.
 *
 * Mirrors the Critique Theater toggle pattern: source of truth is the
 * `open-design:config` localStorage blob. When enabled, agent runs go
 * through the multi-agent team module; when disabled, runs use the
 * default single-agent design mode.
 *
 * Refresh paths:
 *   1. Cross-tab `storage` event keeps the toggle in sync across windows.
 *   2. Same-tab `open-design:wait-team-toggle` CustomEvent so a Settings
 *      save in the same window updates this hook without a reload.
 */
export function useWaitTeamEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => readToggle());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reload = (): void => setEnabled(readToggle());
    const onStorage = (evt: StorageEvent): void => {
      if (evt.key !== null && evt.key !== STORAGE_KEY) return;
      reload();
    };
    const onCustom = (evt: Event): void => {
      const detail = (evt as CustomEvent<{ enabled?: unknown }>).detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setEnabled(detail.enabled);
        return;
      }
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
 * Imperative setter the Settings panel calls. Mutates the stored config
 * and emits a same-tab CustomEvent so every mounted `useWaitTeamEnabled`
 * updates without a reload.
 */
export function setWaitTeamEnabled(next: boolean): void {
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
  parsed.waitTeamEnabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* private mode / quota / disabled storage */
  }
  try {
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: { enabled: next } }));
  } catch {
    /* CustomEvent shim missing */
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
    return (parsed as ConfigShape).waitTeamEnabled === true;
  } catch {
    return false;
  }
}
