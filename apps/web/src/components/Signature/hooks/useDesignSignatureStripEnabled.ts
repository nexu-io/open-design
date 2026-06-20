import { useEffect, useState } from 'react';

const STORAGE_KEY = 'open-design:config';
const TOGGLE_EVENT = 'open-design:signature-strip-toggle';

interface ConfigShape {
  signatureStripEnabled?: boolean;
  [k: string]: unknown;
}

/**
 * Settings-toggle flag for the Design Signature strip. Unlike Critique
 * Theater, this is a pure client view-preference: the strip computes
 * entirely in-browser (no backend gating), so there is no project PATCH —
 * only the localStorage blob + a same-tab CustomEvent for live updates and
 * the cross-tab `storage` event for other windows. Defaults to false (opt-in).
 */
export function useDesignSignatureStripEnabled(): boolean {
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

export function setDesignSignatureStripEnabled(next: boolean): void {
  if (typeof window === 'undefined') return;
  let parsed: ConfigShape = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const candidate: unknown = JSON.parse(raw);
      if (candidate && typeof candidate === 'object') parsed = candidate as ConfigShape;
    }
  } catch {
    /* fresh object */
  }
  parsed.signatureStripEnabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* private mode / quota: event below still propagates in-session */
  }
  try {
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: { enabled: next } }));
  } catch {
    /* CustomEvent shim missing: single mount remains correct */
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
    return (parsed as ConfigShape).signatureStripEnabled === true;
  } catch {
    return false;
  }
}
