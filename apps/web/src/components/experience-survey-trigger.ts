// Trigger + frequency state for the experience survey (CSAT + NPS).
//
// The survey is armed by a SUCCESSFUL export and then stays armed until the
// user answers or closes it — it deliberately outlives the screen that armed
// it, so a user who exports inside a project and immediately navigates back to
// home still sees the card. That is why the arm state lives in a module
// singleton rather than in the exporting component's React tree.
//
// There is exactly one qualification: the export succeeded. No usage-count or
// account-age threshold gates it, so the very first successful export can ask.
//
// Frequency rule: once the user answers or closes the card, it never comes
// back. A single dismissal is treated as a real answer to "do you want to be
// asked this", and re-asking would spend goodwill for a marginal sample gain.

const RETIRED_KEY = 'open-design:experience-survey:v1:retired';

/** Breathing room after the export lands before the card animates in. */
export const SURVEY_DELAY_MS = 3_000;

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * True once the user has answered or closed the survey. Read fail-closed: when
 * the store is unreadable we cannot persist a dismissal either, so answering
 * "retired" avoids showing a card the user can never permanently dismiss.
 */
export function isSurveyRetired(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(RETIRED_KEY) === '1';
  } catch {
    return true;
  }
}

export function retireSurvey(): void {
  try {
    window.localStorage.setItem(RETIRED_KEY, '1');
  } catch {
    // Frequency control is advisory. A locked-down store must never break
    // exporting, so a failed write is swallowed the same way the campaign
    // modal swallows its own.
  }
}

/** Called by the export path on a successful export. */
export function notifyExportSucceeded(): void {
  if (isSurveyRetired()) return;
  for (const listener of listeners) listener();
}

export function onExportSucceeded(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
