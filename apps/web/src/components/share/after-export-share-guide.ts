/** Eligibility consumes explicit history; a missing current URL is not history. */
export function canOfferAfterExportShareGuide(input: {
  result: 'success' | 'cancelled' | 'failed';
  /** Host-composed identity + project + artifact scope captured when export starts. */
  originScope: string;
  currentScope: string;
  hasEverShared: boolean | null;
  neverShow: boolean | null;
  canOpenShare: boolean;
}): boolean {
  return input.result === 'success'
    && input.originScope === input.currentScope
    && input.hasEverShared === false
    && input.neverShow === false
    && input.canOpenShare;
}

/** One gate per export attempt. Completion from an obsolete scope never reopens UI. */
export function createExportSuccessGate(originScope: string, currentScope: () => string) {
  let completed = false;
  return (result: 'success' | 'cancelled' | 'failed'): boolean => {
    if (completed) return false;
    completed = true;
    return result === 'success' && originScope === currentScope();
  };
}

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Storage adapter only: the host supplies an stable appUserId, never workspaceMemberId, email or profile.
 * It stores no sharing history and makes no cross-device persistence promise.
 * Resolve browser storage lazily because even accessing localStorage may throw.
 */
export function createShareGuidePreference(
  storage: () => PreferenceStorage,
  appUserId: string | null,
) {
  const account = appUserId?.trim();
  const key = account ? `od:after-export-share-guide:v1:${encodeURIComponent(account)}` : null;
  return {
    read(): boolean | null {
      if (key === null) return null;
      try {
        const value = storage().getItem(key);
        if (value === null) return false;
        if (value === '1') return true;
        return null;
      } catch {
        return null; // Unknown preference must not override a prior opt-out.
      }
    },
    suppress(): boolean {
      if (key === null) return false;
      try {
        storage().setItem(key, '1');
        return true;
      } catch {
        return false; // Let the host distinguish durable and in-memory dismissal.
      }
    },
  };
}

export interface ShareGuideClock {
  readonly remainingMs: number;
  readonly checkedAt: number;
  readonly paused: boolean;
}

/** Use the same monotonic clock (performance.now) for every transition. */
export function startShareGuideClock(now: number): ShareGuideClock {
  return { remainingMs: 10_000, checkedAt: now, paused: false };
}

/** Charge elapsed time to the previous interaction state, then change that state. */
export function advanceShareGuideClock(
  previous: ShareGuideClock,
  now: number,
  interaction: { hovered: boolean; focused: boolean },
): ShareGuideClock {
  const elapsed = previous.paused ? 0 : Math.max(0, now - previous.checkedAt);
  return {
    remainingMs: Math.max(0, previous.remainingMs - elapsed),
    checkedAt: now,
    paused: interaction.hovered || interaction.focused,
  };
}
