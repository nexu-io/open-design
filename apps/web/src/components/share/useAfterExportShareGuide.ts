import { useCallback, useEffect, useRef, useState } from 'react';
import { canOfferAfterExportShareGuide, createExportSuccessGate, createShareGuidePreference } from './after-export-share-guide';

/** Host must derive hasEverShared from project bindings, including stopped bindings. */
export function useAfterExportShareGuide(input: {
  scopeKey: string;
  appUserId: string | null;
  hasEverShared: boolean | null;
  /** In-flight reads defer a saved export; a settled error permits only the suggestion. */
  historyLoading?: boolean;
  historyError?: boolean;
  enabled: boolean;
}) {
  const live = useRef(input);
  const epoch = useRef(0);
  const preferenceScope = useRef(0);
  if (live.current.scopeKey !== input.scopeKey || live.current.appUserId !== input.appUserId || live.current.enabled !== input.enabled) {
    epoch.current += 1;
    preferenceScope.current += 1;
  }
  live.current = input;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current += 1; };
  }, []);
  const [notice, setNotice] = useState<{ epoch: number; id: number } | null>(null);
  const sequence = useRef(0);
  const [pendingEpoch, setPendingEpoch] = useState<number | null>(null);
  const dismiss = useCallback(() => { setNotice(null); setPendingEpoch(null); }, []);
  // Save dialogs restore window focus before their completion callback. The host
  // refreshes history on focus, so retain a completed save until that read settles,
  // then offer on known-never-shared or an explicit read failure, not idle/unknown.
  useEffect(() => {
    if (pendingEpoch === null) return;
    if (pendingEpoch !== epoch.current || !input.enabled) {
      setPendingEpoch(null);
      return;
    }
    if (input.hasEverShared === null && input.historyLoading) return;
    setPendingEpoch(null);
    const never = createShareGuidePreference(() => window.localStorage, input.appUserId).read();
    if (canOfferAfterExportShareGuide({
      result: 'success', originScope: String(pendingEpoch), currentScope: String(epoch.current),
      hasEverShared: input.hasEverShared, historyError: input.historyError, neverShow: never, canOpenShare: input.enabled,
    })) setNotice({ epoch: epoch.current, id: ++sequence.current });
  }, [pendingEpoch, input.scopeKey, input.appUserId, input.hasEverShared, input.historyLoading, input.historyError, input.enabled]);
  // Retained card callbacks must never suppress a newly selected account/scope.
  // Unlike export epochs, this generation is unaffected by StrictMode effect replay.
  const currentPreferenceScope = preferenceScope.current;
  const neverShow = useCallback(() => {
    if (!mounted.current || currentPreferenceScope !== preferenceScope.current) return false;
    const preference = createShareGuidePreference(() => window.localStorage, input.appUserId);
    const saved = preference.suppress();
    if (saved) { setNotice(null); setPendingEpoch(null); }
    return saved;
  }, [currentPreferenceScope, input.appUserId]);
  const beginExport = useCallback(() => {
    const startEpoch = String(epoch.current);
    const accept = createExportSuccessGate(startEpoch, () => String(epoch.current));
    return (result: 'success' | 'cancelled' | 'failed') => {
      if (!accept(result) || !mounted.current) return;
      const current = live.current;
      if (current.enabled && current.hasEverShared === null && current.historyLoading) {
        setPendingEpoch(epoch.current);
        return;
      }
      const never = createShareGuidePreference(() => window.localStorage, current.appUserId).read();
      if (canOfferAfterExportShareGuide({
        result,
        originScope: startEpoch,
        currentScope: String(epoch.current),
        hasEverShared: current.hasEverShared,
        historyError: current.historyError,
        neverShow: never,
        canOpenShare: current.enabled,
      })) setNotice({ epoch: epoch.current, id: ++sequence.current });
    };
  }, []);
  return {
    noticeId: notice && canOfferAfterExportShareGuide({
      result: 'success', originScope: String(notice.epoch), currentScope: String(epoch.current),
      hasEverShared: input.hasEverShared, historyError: input.historyError,
      neverShow: false, canOpenShare: input.enabled,
    }) ? notice.id : null,
    beginExport,
    dismiss,
    neverShow,
  };
}
