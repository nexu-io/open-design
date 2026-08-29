// Trigger + frequency state for the experience survey (CSAT + NPS).
//
// The survey is armed by a DELIVERED design run — a run that finished and
// actually wrote an artifact — and then stays armed until the user answers or
// closes it. It deliberately outlives the screen that armed it, so a user who
// generates inside a project and immediately navigates back to home still sees
// the card. That is why the arm state lives in a module singleton rather than
// in the generating component's React tree.
//
// WHY DELIVERY AND NOT EXPORT. The survey used to be armed by a successful
// export. Export is a late, narrow event: over 30 days ~13k users exported
// while ~37k produced an artifact, so roughly two thirds of the people who got
// real work out of the product could never be asked — and the ones who tried
// it, got something, and left without exporting are exactly the ones worth
// hearing from.
//
// One qualification: the run delivered. A run that only answered in text,
// stopped to ask a clarifying question, or failed is not a product anyone can
// judge. `resolveDesignDeliveryOutcome` already draws that line; this module
// trusts its `delivered` verdict rather than re-deriving one.
//
// The first delivery counts. Holding out for a second run would buy an opinion
// formed on more than one artifact, but it would cost the answers of everyone
// who produces once and leaves — and those are the users we understand least.
//
// Frequency rule: exactly one ask per user, ever. The card retires the moment
// it is SHOWN, not when it is answered or closed — ignoring a prompt is how
// most people decline one, and treating silence as "ask again later" turns a
// single question into a recurring one. So a user sees this card at most once,
// whatever they do with it.
//
// Listeners still fire on every delivery rather than only the qualifying one.
// Arming is not showing: an arm can be lost to a navigation mid-delay, and the
// cheapest way to make sure the one ask actually happens is to let the next
// delivery re-arm.

const RETIRED_KEY = 'open-design:experience-survey:v1:retired';
const DELIVERY_COUNT_KEY = 'open-design:experience-survey:v1:deliveries';

/**
 * Deliveries a user must reach before the card may be armed. One, today: the
 * threshold survives as the seam this policy is actually made of, and as the
 * reason the counter below still earns its keep — a store that reads but
 * cannot write leaves the count at zero, which reads as "not yet qualified".
 * That matters because a store that cannot write cannot record a dismissal
 * either, so without the counter the card would come back forever.
 */
export const SURVEY_MIN_DELIVERIES = 1;

/** Breathing room after the artifact lands before the card animates in. */
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
    // generating, so a failed write is swallowed the same way the campaign
    // modal swallows its own.
  }
}

/**
 * Deliveries counted so far. Fail-closed for the same reason as
 * `isSurveyRetired`: without a readable store the count can never advance, so
 * reporting zero keeps the card away rather than showing it on every run.
 */
export function deliveredCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(DELIVERY_COUNT_KEY);
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/** Records one delivery and returns the new running total. */
function recordDelivery(): number {
  const next = deliveredCount() + 1;
  try {
    window.localStorage.setItem(DELIVERY_COUNT_KEY, String(next));
  } catch {
    // Same contract as `retireSurvey`: an unwritable store degrades to never
    // qualifying, never to asking on every run.
    return 0;
  }
  return next;
}

/**
 * Called by the run path once a design run is confirmed delivered. Counts the
 * delivery before checking the threshold, so the count is always the number of
 * deliveries seen, not the number that happened to qualify.
 */
export function notifyArtifactDelivered(): void {
  if (isSurveyRetired()) return;
  if (recordDelivery() < SURVEY_MIN_DELIVERIES) return;
  for (const listener of listeners) listener();
}

export function onArtifactDelivered(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
