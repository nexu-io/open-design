import { useCallback, useEffect, useRef, useState } from 'react';
import { canOfferAfterExportShareGuide, createExportSuccessGate, createShareGuidePreference } from './after-export-share-guide';

/** Host must derive hasEverShared from project bindings, including stopped bindings. */
export function useAfterExportShareGuide(input: {
  scopeKey: string;
  appUserId: string | null;
  hasEverShared: boolean | null;
  enabled: boolean;
}) {
  const live = useRef(input);
  const epoch = useRef(0);
  if (live.current.scopeKey !== input.scopeKey || live.current.appUserId !== input.appUserId || live.current.enabled !== input.enabled) {
    epoch.current += 1;
  }
  live.current = input;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current += 1; };
  }, []);
  const [notice, setNotice] = useState<{ epoch: number; id: number } | null>(null);
  const sequence = useRef(0);
  const dismiss = useCallback(() => setNotice(null), []);
  const neverShow = useCallback(() => {
    const preference = createShareGuidePreference(() => window.localStorage, live.current.appUserId);
    const saved = preference.suppress();
    if (saved) setNotice(null);
    return saved;
  }, []);
  const beginExport = useCallback(() => {
    const startEpoch = String(epoch.current);
    const accept = createExportSuccessGate(startEpoch, () => String(epoch.current));
    return (result: 'success' | 'cancelled' | 'failed') => {
      if (!accept(result) || !mounted.current) return;
      const current = live.current;
      const never = createShareGuidePreference(() => window.localStorage, current.appUserId).read();
      if (canOfferAfterExportShareGuide({
        result,
        originScope: startEpoch,
        currentScope: String(epoch.current),
        hasEverShared: current.hasEverShared,
        neverShow: never,
        canOpenShare: current.enabled,
      })) setNotice({ epoch: epoch.current, id: ++sequence.current });
    };
  }, []);
  return {
    noticeId: notice?.epoch === epoch.current && input.enabled && input.hasEverShared === false ? notice.id : null,
    beginExport,
    dismiss,
    neverShow,
  };
}
