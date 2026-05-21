// Onboarding session id helper. The v2 doc requires every
// `page_view / page_name=onboarding` emission to carry the same
// `onboarding_session_id` so dashboards can stitch the 4-step funnel
// (connect → about_you → design_system → generation).
//
// Because the "generation" step renders in `DesignSystemDetailView`
// AFTER `OnboardingView` navigates away, the session id must outlive
// the React tree that owns it. We keep it in `sessionStorage` so a
// reload of the same tab keeps the same id; closing the tab drops it.
// `clear()` is called when the user finishes (or skips) onboarding,
// so a later `/design-systems/:id` visit unrelated to onboarding does
// NOT inherit the previous session's id.

import { randomUUID } from '../utils/uuid';

const STORAGE_KEY = 'od:onboarding-session-id';

function readSessionStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSessionStorage(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore — quota errors / disabled storage just mean we get a
    // session id that doesn't persist across reload.
  }
}

function clearSessionStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function getOrCreateOnboardingSessionId(): string {
  const existing = readSessionStorage();
  if (existing) return existing;
  const next = randomUUID();
  writeSessionStorage(next);
  return next;
}

export function peekOnboardingSessionId(): string | null {
  return readSessionStorage();
}

export function clearOnboardingSessionId(): void {
  clearSessionStorage();
}
