// Correlation context + breadcrumbs for chat observability.
//
// Why this exists
// ---------------
// A dashboard that says "first paint P95 went from 3s to 9s" has done half
// a job. The other half is answering "for whom, on what, and doing what" —
// otherwise the next step is guessing. Every `client_chat_*` event
// therefore carries a correlation block:
//
//   conversation_id / project_id / run_id  → pivot within PostHog, then
//                                            hand `run_id` to Langfuse
//                                            (its trace id IS the run id)
//                                            and to the diagnostics bundle
//   agent_id / model_id                    → "is this one provider?"
//   app_version / release_channel          → "is this one build?"
//   replay_session_id                      → jump to the session replay
//
// The privacy line is unchanged and absolute: **identifiers yes, content
// never**. An id is an opaque handle we can join on. A message body, a
// file path, a prompt, a form answer or any other user-authored string is
// not, and none of them are read by this module.
//
// Breadcrumbs
// -----------
// "The renderer OOMed" is unactionable on its own — today's
// `FATAL ERROR: Reached heap limit` is the case in point. What makes it
// actionable is the shape of the run-up: how the heap moved, how the DOM
// moved, and which structural actions preceded it. So we keep a small ring
// buffer of ENUM-ONLY breadcrumbs plus a heap trend, and attach both to the
// events that report a bad outcome. This is deliberately not a replay: it
// is the handful of facts needed to form a hypothesis without one.
//
// Measurement trust
// -----------------
// A reading taken under the wrong conditions is worse than no reading,
// because it looks like evidence. We have already been burned by this at
// the human level (an agent "measured" computed styles in Next dev before
// the lazily-injected CSS Module stylesheet had landed, and confidently
// reported browser defaults as the product's real typography). The same
// trap applies to a first-paint timer: if webfonts or stylesheets have not
// arrived, what we timed is not what the user saw; if the tab was hidden,
// the browser throttled us and the duration is fiction.
//
// So every timing-sensitive event carries `measurement_trusted` and, when
// false, `untrusted_reason`. Dashboards MUST filter on
// `measurement_trusted = true` for their headline numbers, and the
// untrusted slice is itself a useful signal (a spike in `fonts_pending`
// means font loading regressed).

/** Reasons a timing sample should not be believed. */
export type ChatMeasurementDoubt =
  /** Tab was backgrounded during the measured window; timers were throttled. */
  | 'document_hidden'
  /** Webfonts had not finished loading, so "painted" is not "readable". */
  | 'fonts_pending'
  /** A stylesheet was still in flight — layout was not final. */
  | 'stylesheets_pending'
  /** The page was restored from bfcache; the clock origin is not the open. */
  | 'bfcache_restore';

/** Structural actions worth remembering. Enum only — never user content. */
export type ChatBreadcrumbKind =
  | 'surface_attach'
  | 'surface_detach'
  | 'first_paint'
  | 'conversation_open'
  | 'run_start'
  | 'run_end'
  | 'run_error'
  | 'reconnect'
  | 'resume'
  | 'virtualize_on'
  | 'virtualize_off'
  | 'dom_spike'
  | 'heap_band';

export interface ChatCorrelation {
  conversation_id?: string;
  project_id?: string;
  run_id?: string;
  agent_id?: string;
  model_id?: string;
  release_channel?: string;
  /**
   * Build SHA. Not currently plumbed into the web client — see the
   * "what's missing" column of the root-cause table in
   * `specs/current/chat-panel-observability.md`. Stamped the moment a
   * source exists; absent until then rather than faked.
   */
  build_sha?: string;
  /** PostHog replay session id, when session replay is actually recording. */
  replay_session_id?: string;
}

const MAX_BREADCRUMBS = 24;
const MAX_HEAP_TREND = 10;

let correlation: ChatCorrelation = {};
const breadcrumbs: Array<{ at: number; kind: ChatBreadcrumbKind }> = [];
const heapTrendMb: number[] = [];

/**
 * Merge correlation identifiers. Callers pass only what they know; an
 * explicit `undefined` clears a field (a run ending clears `run_id`) while
 * an omitted field is left alone.
 */
export function setChatCorrelation(next: Partial<ChatCorrelation>): void {
  const merged: ChatCorrelation = { ...correlation };
  for (const key of Object.keys(next) as Array<keyof ChatCorrelation>) {
    const value = next[key];
    if (value == null || value === '') delete merged[key];
    else merged[key] = value;
  }
  correlation = merged;
}

/**
 * The correlation block to spread into an outgoing event. Returns a fresh
 * object so a caller cannot mutate the shared context by accident.
 */
export function chatCorrelation(): ChatCorrelation {
  return { ...correlation, ...readReplaySessionId() };
}

type ReplaySessionIdReader = () => string | undefined;

let replaySessionIdReader: ReplaySessionIdReader | null = null;

/**
 * Teach this module how to find PostHog's replay session id.
 *
 * This registration is REQUIRED for replay links to work, and its absence
 * is a real trap. `apps/web/src/analytics/client.ts` loads posthog-js with
 * `await import('posthog-js')`, and the ESM build — unlike the `array.js`
 * snippet the landing page uses — does not publish itself as
 * `window.posthog`. So the obvious `globalThis.posthog.get_session_id()`
 * silently returns `undefined` forever, and every replay link on the
 * dashboard would be quietly dead while looking implemented.
 *
 * The analytics client must therefore hand us its instance explicitly. We
 * keep the global lookup below only as a fallback for surfaces that do
 * load posthog-js as a global script.
 */
export function registerChatReplaySessionSource(reader: ReplaySessionIdReader): void {
  replaySessionIdReader = reader;
}

/**
 * PostHog's replay session id, read lazily on every event rather than
 * cached: posthog-js loads asynchronously after consent (so an id cached
 * at boot would always be missing) and the id rotates over a long session.
 */
function readReplaySessionId(): { replay_session_id?: string } {
  try {
    const id =
      replaySessionIdReader?.() ??
      (globalThis as unknown as {
        posthog?: { get_session_id?: () => string | undefined };
      }).posthog?.get_session_id?.();
    return typeof id === 'string' && id.length > 0 ? { replay_session_id: id } : {};
  } catch {
    // posthog-js not loaded, opted out, or mid-teardown. Correlation is a
    // nice-to-have; never let reading it break the event.
    return {};
  }
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

export function pushChatBreadcrumb(kind: ChatBreadcrumbKind, at?: number): void {
  const stamp = typeof at === 'number' ? at : nowMs();
  breadcrumbs.push({ at: Math.round(stamp), kind });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

/**
 * The trail as one compact string: `surface_attach@0,run_start@1200,…`.
 *
 * Deliberately a string, not structured data. A breadcrumb trail is read by
 * a human staring at one bad event, never aggregated across events, and a
 * flat string survives PostHog's property inspector intact while an array
 * of objects becomes a chore to unfold and impossible to grep.
 */
export function chatBreadcrumbTrail(): string {
  return breadcrumbs.map((b) => `${b.kind}@${b.at}`).join(',');
}

/** Record a heap reading for the trend attached to bad-outcome events. */
export function pushChatHeapSample(usedMb: number): void {
  if (!Number.isFinite(usedMb)) return;
  heapTrendMb.push(Math.round(usedMb));
  if (heapTrendMb.length > MAX_HEAP_TREND) heapTrendMb.shift();
}

/**
 * The last few heap readings, oldest first. Turns "it OOMed" into "it went
 * 120 → 180 → 260 → 410 while three runs streamed", which is a hypothesis.
 */
export function chatHeapTrend(): number[] {
  return [...heapTrendMb];
}

// ---------------------------------------------------------------------------
// Measurement trust
// ---------------------------------------------------------------------------

export interface ChatMeasurementTrust {
  measurement_trusted: boolean;
  untrusted_reason?: ChatMeasurementDoubt;
}

/**
 * Decide whether a timing sample taken right now is worth believing.
 *
 * `hiddenDuringWindow` must be supplied by the caller, which is the only
 * party that knows whether the tab went away mid-measurement — by the time
 * we are asked, `visibilityState` may well have flipped back to `visible`.
 */
export function chatMeasurementTrust(input: {
  hiddenDuringWindow: boolean;
}): ChatMeasurementTrust {
  if (input.hiddenDuringWindow) {
    return { measurement_trusted: false, untrusted_reason: 'document_hidden' };
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return { measurement_trusted: false, untrusted_reason: 'document_hidden' };
  }
  if (fontsPending()) {
    return { measurement_trusted: false, untrusted_reason: 'fonts_pending' };
  }
  if (stylesheetsPending()) {
    return { measurement_trusted: false, untrusted_reason: 'stylesheets_pending' };
  }
  return { measurement_trusted: true };
}

function fontsPending(): boolean {
  try {
    const fonts = (document as unknown as { fonts?: { status?: string } }).fonts;
    if (fonts?.status == null) return false;
    return fonts.status !== 'loaded';
  } catch {
    return false;
  }
}

/**
 * A `<link rel=stylesheet>` whose `.sheet` is still null has not applied
 * yet. This is precisely the Next-dev CSS-Module race that made a careful
 * observer read browser-default typography and believe it.
 */
function stylesheetsPending(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of Array.from(links)) {
      if ((link as HTMLLinkElement).sheet == null) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Test-only — flush module state between cases. */
export function __resetChatContextForTest(): void {
  correlation = {};
  replaySessionIdReader = null;
  breadcrumbs.length = 0;
  heapTrendMb.length = 0;
}
