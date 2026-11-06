import { useCallback, useEffect, useState } from 'react';

const SAVED_PLUGIN_IDS_KEY = 'open-design:saved-plugin-ids';
const SAVED_PLUGIN_IDS_EVENT = 'open-design:saved-plugin-ids-changed';

type SavedPluginIdsEvent = CustomEvent<{ ids: string[] }>;

function isBrowserStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function normalizePluginIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id) continue;
    seen.add(id);
  }
  return [...seen].sort();
}

export function readSavedPluginIds(): Set<string> {
  if (!isBrowserStorageAvailable()) return new Set();
  try {
    return new Set(
      normalizePluginIds(JSON.parse(window.localStorage.getItem(SAVED_PLUGIN_IDS_KEY) ?? '[]')),
    );
  } catch {
    return new Set();
  }
}

function writeSavedPluginIds(ids: Iterable<string>): string[] {
  const next = normalizePluginIds([...ids]);
  if (!isBrowserStorageAvailable()) return next;
  window.localStorage.setItem(SAVED_PLUGIN_IDS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(SAVED_PLUGIN_IDS_EVENT, { detail: { ids: next } }));
  return next;
}

export function useSavedPluginIds(): {
  savedPluginIds: ReadonlySet<string>;
  savePluginId: (id: string) => 'saved' | 'already-saved' | 'unavailable';
} {
  const [savedPluginIds, setSavedPluginIds] = useState<ReadonlySet<string>>(
    () => readSavedPluginIds(),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const refresh = () => setSavedPluginIds(readSavedPluginIds());
    const onSavedIdsChanged = (event: Event) => {
      const detail = (event as SavedPluginIdsEvent).detail;
      setSavedPluginIds(new Set(normalizePluginIds(detail?.ids)));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_PLUGIN_IDS_KEY) refresh();
    };

    window.addEventListener(SAVED_PLUGIN_IDS_EVENT, onSavedIdsChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SAVED_PLUGIN_IDS_EVENT, onSavedIdsChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const savePluginId = useCallback((id: string) => {
    const cleanId = id.trim();
    if (!cleanId || !isBrowserStorageAvailable()) return 'unavailable';
    const current = readSavedPluginIds();
    if (current.has(cleanId)) {
      setSavedPluginIds(current);
      return 'already-saved';
    }
    current.add(cleanId);
    try {
      setSavedPluginIds(new Set(writeSavedPluginIds(current)));
      return 'saved';
    } catch {
      return 'unavailable';
    }
  }, []);

  return { savedPluginIds, savePluginId };
}
