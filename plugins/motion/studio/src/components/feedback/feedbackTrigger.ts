// ---------------------------------------------------------------------------
// Single owner of "should Studio ask for feedback right now, and about what".
//
// The prompt used to fire on a session counter (every 10th tab). That collected
// 5 responses in three months, because it asked at an arbitrary moment with no
// subject. It now fires on a render outcome — the moment the user has just
// formed an opinion — which is the same moment the CLI asks.
//
// Producers call `requestStudioFeedback`; the card subscribes. Eligibility
// lives here and nowhere else, so no caller has to know the cooldown rules.
// ---------------------------------------------------------------------------

import { browserTelemetryAllowed } from "../../telemetry/policy";

export type FeedbackReason = "render_complete" | "render_failed" | "crash";

/**
 * Everything except a finished render is a problem report: no 0-10 score (you
 * cannot rate an export you never got, and a fabricated rating poisons the
 * average) and the card wears its error styling.
 */
export function isProblemReason(reason: FeedbackReason): boolean {
  return reason !== "render_complete";
}

/**
 * A one-tap answer. `label` has to stand on its own — a chip that only makes
 * sense once you hover it is a badly named chip, and most people never hover.
 * `hint` carries the nuance a two-word label cannot, for the people who do.
 */
export interface FollowUpPreset {
  label: string;
  hint: string;
}

/**
 * The follow-up asked after a score. One question per person, rotated across
 * people: a corner card that asks three things gets answered by nobody, but the
 * same card asking one thing of every third user covers the same ground.
 */
export interface FollowUpQuestion {
  /** Sent with the response, so answers stay separable instead of collapsing
   *  into one undifferentiated comment field. */
  id: string;
  prompt: string;
  placeholder: string;
  /**
   * Typing into a corner card is a cost most people decline, so the common
   * answers are buttons and the field is the escape hatch. Keep these mutually
   * distinct: two chips a user could reasonably read the same way collect a
   * number that means nothing.
   */
  presets: readonly FollowUpPreset[];
}

// The options below are not invented, and none of them is a brand.
//
// `fix` mirrors the themes that actually dominate written feedback: audio and
// encoding first by a wide margin, then media and fonts, then export-versus-
// preview mismatches, then render time. `workaround` mirrors the steps people
// report finishing in other tools. `remove` offers the surfaces that see the
// least real use, so the question contains genuine deletion candidates instead
// of a list nobody would pick from. `detractor` mirrors the failures Studio
// actually emits.
//
// Seven is the ceiling, not a target: past that the chips stop being scannable
// in a corner card and start being a form. Re-derive all of these when the
// shape of the feedback changes, because a stale option list quietly steers
// every answer it collects.
const FOLLOW_UPS: readonly FollowUpQuestion[] = [
  {
    id: "remove",
    prompt: "What would you cut from Studio?",
    placeholder: "The part you never use",
    presets: [
      { label: "Layers panel", hint: "The layer tree on the right" },
      { label: "Variables panel", hint: "Composition variables on the right" },
      { label: "Blocks browser", hint: "The block library in the sidebar" },
      { label: "Caption editing", hint: "Editing caption words and presets in Studio" },
      { label: "Render history", hint: "The list of past exports" },
      { label: "Nothing", hint: "It all earns its place" },
    ],
  },
  {
    // Replaces an earlier "which editor gets this right?". Brand names are a
    // popularity vote, not an instruction: "CapCut" does not say what to build.
    // What someone had to leave HyperFrames to do names the missing feature
    // exactly, and written feedback is full of these workarounds already.
    //
    // Every option here is a step Studio genuinely cannot do today. Offering
    // one it CAN do (trimming, voiceover, ducking, compositing, grading) would
    // collect taps that mean "I could not find it", and there is no way to tell
    // those apart from "it does not exist" afterwards. Check before adding.
    id: "workaround",
    prompt: "What did you have to do outside Studio?",
    placeholder: "The step you finished somewhere else",
    presets: [
      { label: "Fix the exported file", hint: "Remuxing or re-encoding the output by hand" },
      { label: "Convert source media", hint: "Re-encoding footage before it would import cleanly" },
      { label: "Match loudness", hint: "Normalising levels across the finished audio" },
      { label: "Make images or graphics", hint: "Creating visual assets in another tool" },
      { label: "Record footage", hint: "Capturing screen or camera video" },
      { label: "Nothing, it was all here", hint: "No outside tools needed" },
    ],
  },
  {
    id: "fix",
    prompt: "What should we fix first?",
    placeholder: "The thing that slowed you down",
    presets: [
      { label: "Audio mixing", hint: "Levels, ducking or the balance in the exported mix" },
      { label: "Export encoding", hint: "The render fails, or the finished file is wrong" },
      { label: "Export matches preview", hint: "The exported video differs from the preview" },
      { label: "Media and fonts", hint: "Adding video, images or fonts to a project" },
      { label: "Render speed", hint: "Exports take too long to finish" },
      { label: "Re-rendering everything", hint: "A small change means rendering the whole thing" },
      {
        label: "Checks and warnings",
        hint: "Lint flags things that are fine, or misses real ones",
      },
    ],
  },
];

/** Detractors are not asked a rotated question; the complaint is the answer. */
const DETRACTOR_FOLLOW_UP: FollowUpQuestion = {
  id: "detractor",
  prompt: "What went wrong?",
  placeholder: "The thing that made that a low score",
  presets: [
    { label: "Export failed", hint: "The render did not finish" },
    { label: "Output looked wrong", hint: "It rendered, but not the way I built it" },
    { label: "Crashed or froze", hint: "The editor stopped responding" },
    { label: "Lost my edits", hint: "Changes did not save, or came back changed" },
    { label: "Too slow", hint: "Waiting on renders, or the editor itself lagging" },
    { label: "Could not figure it out", hint: "Could not find or understand something" },
  ],
};

const DETRACTOR_MAX_RATING = 6;

export function followUpFor(rating: number): FollowUpQuestion {
  if (rating <= DETRACTOR_MAX_RATING) return DETRACTOR_FOLLOW_UP;
  // Rotation only has to spread across users, not be unguessable, so any
  // per-prompt jitter works. Studio's determinism rules cover rendered
  // compositions, not the editor chrome.
  return FOLLOW_UPS[Math.floor(Math.random() * FOLLOW_UPS.length)];
}

/**
 * Facts about the moment being reported on, sent with the response so a
 * complaint arrives with the conditions that produced it instead of needing a
 * round trip to ask. Producers fill this; the trigger never inspects it.
 *
 * Names and enums only, no free text: this rides to the same place the comment
 * does, and the user consented to a comment, not to their project's contents.
 */
export interface FeedbackContext {
  [key: string]: string | number | boolean | undefined;
}

export interface FeedbackRequest {
  reason: FeedbackReason;
  /** Render job the prompt is about — joins the response to the render event. */
  renderId?: string;
  /** Failure text shown to the user, sent verbatim so reports are actionable. */
  detail?: string;
  /** Reproduction context: settings, counts, outcomes. See FeedbackContext. */
  context?: FeedbackContext;
}

const STORAGE_KEYS = {
  /** Epoch ms of the last prompt the user dismissed or ignored. */
  dismissedAt: "hyperframes-studio:feedbackDismissedAt",
  /** Epoch ms of the last prompt the user actually answered. */
  answeredAt: "hyperframes-studio:feedbackAnsweredAt",
} as const;

/** One prompt per tab, so a batch of renders can't turn into a batch of asks. */
const SESSION_ASKED_KEY = "hyperframes-studio:feedbackAskedThisSession";

const DAY_MS = 86_400_000;
const ANSWERED_COOLDOWN_MS = 30 * DAY_MS;
const DISMISSED_COOLDOWN_MS = 7 * DAY_MS;

type Listener = (request: FeedbackRequest) => void;

let listener: Listener | null = null;

function isDisabled(): boolean {
  try {
    return import.meta.env.VITE_HYPERFRAMES_NO_FEEDBACK === "1";
  } catch {
    return false;
  }
}

function readTimestamp(key: string): number {
  try {
    return parseInt(window.localStorage.getItem(key) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeTimestamp(key: string, now: number): void {
  try {
    window.localStorage.setItem(key, String(now));
  } catch {
    /* localStorage may be unavailable or full */
  }
}

function askedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_ASKED_KEY) === "1";
  } catch {
    // Without sessionStorage there is no way to bound the asks, so don't ask.
    return true;
  }
}

function markAskedThisSession(): void {
  try {
    window.sessionStorage.setItem(SESSION_ASKED_KEY, "1");
  } catch {
    /* sessionStorage may be unavailable */
  }
}

function isEligible(now: number): boolean {
  if (isDisabled()) return false;
  // Prompting a user whose telemetry is off would collect a response we then
  // drop on the floor. Ask only the people we can actually hear.
  if (!browserTelemetryAllowed()) return false;
  if (askedThisSession()) return false;
  if (now - readTimestamp(STORAGE_KEYS.answeredAt) < ANSWERED_COOLDOWN_MS) return false;
  if (now - readTimestamp(STORAGE_KEYS.dismissedAt) < DISMISSED_COOLDOWN_MS) return false;
  return true;
}

/**
 * Ask for feedback about `request` if the user is due. Safe to call on every
 * render outcome: ineligible calls are dropped without touching any state, so
 * a user who just answered stays quiet rather than burning their next window.
 */
export function requestStudioFeedback(request: FeedbackRequest): void {
  if (!listener) return;
  if (!isEligible(Date.now())) return;
  markAskedThisSession();
  listener(request);
}

/** Subscribe the card. Single-subscriber by design — there is one card. */
export function subscribeToFeedbackRequests(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

export function markFeedbackAnswered(): void {
  writeTimestamp(STORAGE_KEYS.answeredAt, Date.now());
}

export function markFeedbackDismissed(): void {
  writeTimestamp(STORAGE_KEYS.dismissedAt, Date.now());
}
