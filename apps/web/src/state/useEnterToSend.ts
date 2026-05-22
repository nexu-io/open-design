import { useEffect, useState } from 'react';

import { loadConfig } from './config';

const STORAGE_KEY = 'open-design:config';

/**
 * Reads the Settings → General "Enter to send" preference.
 *
 * Defaults to `true` (Enter sends) so it matches the composer's default. The
 * value is read from the persisted `open-design:config` blob at mount and kept
 * in sync across tabs via the platform `storage` event. Same-tab consumers that
 * mount fresh after a Settings change (e.g. a comment popover opened after the
 * dialog closes) pick up the latest value on their next mount.
 */
export function useEnterToSend(): boolean {
  const [value, setValue] = useState<boolean>(() => loadConfig().enterToSend ?? true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      setValue(loadConfig().enterToSend ?? true);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return value;
}
