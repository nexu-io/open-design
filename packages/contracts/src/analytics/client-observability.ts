// Typed shapes for the browser-side `client_*` safety-telemetry namespace.
//
// These events do NOT go through the consent-gated product-analytics
// path (`page_view` / `surface_view` / `ui_click` / `*_result`, which
// carry the page_name+area+element triple documented in the tracking
// doc). They ride the direct-fetch transport in
// `apps/web/src/analytics/error-tracking.ts` — the same one that already
// carries `client_long_task`, `client_white_screen`, `client_boot_timing`
// and `client_run_stuck` — because stability ground truth must survive a
// user opting out of analytics.
//
// Everything here is a STRUCTURAL measurement: counts, durations, byte
// lengths, error codes, enum states. No message text, no file paths, no
// prompts, no user-authored strings of any kind ever appear in these
// payloads.
//
// This module is additive: it types a namespace that previously shipped
// as untyped `Record<string, unknown>`. Existing `client_*` emitters are
// unaffected.

/**
 * Identifiers stamped on every `client_chat_*` event so a dashboard number
 * can be walked back to the thing that produced it.
 *
 * This is the difference between "P95 first paint regressed" and "P95 first
 * paint regressed on 0.21.1, for the vela agent, and here are the run ids".
 * `run_id` is the highest-value key in the set: it is simultaneously the
 * PostHog join key, the Langfuse trace id, and the handle a diagnostics
 * bundle can be matched on.
 *
 * Identifiers only. No message text, no file path, no prompt, no
 * user-authored string ever enters this block.
 */
export interface ChatCorrelationProps {
  conversation_id?: string;
  project_id?: string;
  /** Also the Langfuse trace id. The single most useful field here. */
  run_id?: string;
  agent_id?: string;
  model_id?: string;
  /** stable | beta | preview | prerelease, when the client can tell. */
  release_channel?: string;
  /** Build SHA, once the web client has a source for one. */
  build_sha?: string;
  /** PostHog replay session id, when session replay is recording. */
  replay_session_id?: string;
}

/** Why a timing sample should not be believed. */
export type ChatMeasurementDoubt =
  /** Tab was backgrounded during the window; timers were throttled. */
  | 'document_hidden'
  /** Webfonts had not finished loading — "painted" is not yet "readable". */
  | 'fonts_pending'
  /** A stylesheet was still in flight — layout was not final. */
  | 'stylesheets_pending'
  /** Restored from bfcache; the clock origin is not the user's open. */
  | 'bfcache_restore';

/**
 * Attached to every timing-sensitive event. Headline dashboard numbers MUST
 * filter on `measurement_trusted = true`; the untrusted slice is its own
 * signal (a rise in `fonts_pending` means font loading regressed).
 */
export interface ChatMeasurementTrustProps {
  measurement_trusted: boolean;
  untrusted_reason?: ChatMeasurementDoubt;
}

/** Structural actions remembered in the breadcrumb trail. Enum only. */
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

/** Why a chat surface became visible. Breakdown dimension for first-paint cost. */
export type ChatOpenKind =
  /** Full page load / hard refresh landed directly on a chat surface. */
  | 'cold_boot'
  /** User switched to a different conversation inside the same project. */
  | 'conversation_switch'
  /** User navigated to a different project. */
  | 'project_switch'
  /** Chat surface remounted without a navigation (tab toggle, layout change). */
  | 'remount';

/** Why a DOM/heap sample was taken. */
export type ChatSampleReason =
  | 'conversation_open'
  | 'interval'
  | 'run_end'
  | 'page_hide';

/** Which recovery path ran, and what happened to it. */
export type ChatRecoveryPath =
  /** The SSE event stream dropped and the client re-subscribed. */
  | 'sse_reconnect'
  /** An interrupted run was resumed from the UI. */
  | 'run_resume'
  /** A hard refresh rehydrated an in-flight conversation from the daemon. */
  | 'hard_refresh_restore';

export type ChatRecoveryOutcome = 'success' | 'failed' | 'abandoned';

/**
 * Structural failures in the chat rendering contract — the agent emitted
 * something the client could not turn into the UI it was supposed to
 * produce. Each value names a user-visible thing that silently did not
 * appear.
 */
export type ChatProtocolAnomaly =
  /** `<question-form>` marker present but the parser returned nothing. */
  | 'question_form_parse_failed'
  /** Parsed question form contained zero answerable questions. */
  | 'question_form_empty'
  /** Turn finished with next-step suggestions expected but no marker found. */
  | 'next_step_marker_missing'
  /** Run reported artifacts but no artifact card rendered for them. */
  | 'artifact_card_missing'
  /** Turn-block assembly threw; the turn fell back to raw rendering. */
  | 'turn_block_build_failed';

/**
 * `client_chat_first_paint` — how long until the user can read the chat.
 *
 * The fields after `duration_ms` are DISCRIMINATORS: they exist so the
 * duration becomes a testable hypothesis rather than a number. A slow open
 * with a huge `stream_event_count` is a data-volume problem; the same
 * duration with a small event count but a huge `dom_node_count` and
 * `virtualized: false` is a rendering-path regression. Without them a
 * triager can only re-open the app and hope.
 */
export interface ChatFirstPaintProps
  extends ChatCorrelationProps,
    ChatMeasurementTrustProps {
  open_kind: ChatOpenKind;
  /** Open intent (route/conversation change) → first message row painted. */
  duration_ms: number;
  /** Messages in the conversation being opened. */
  message_count: number;
  /**
   * Raw agent stream events behind those messages. This is the number that
   * separated the 10.75s conversation from an ordinary one — it had 63,472.
   */
  stream_event_count?: number;
  /** Rows actually mounted at first paint (< message_count when virtualized). */
  rendered_row_count: number;
  virtualized: boolean;
  /** Descendant element count of the chat log container at first paint. */
  dom_node_count: number;
  /** `<details>` at first paint. High here = lazy mounting did not engage. */
  details_count: number;
}

/** `client_chat_dom_growth` — how the chat surface scales with conversation length. */
export interface ChatDomGrowthProps extends ChatCorrelationProps {
  sample_reason: ChatSampleReason;
  message_count: number;
  rendered_row_count: number;
  virtualized: boolean;
  /** Descendants of the chat log container. Lazy-mount regressions show here. */
  dom_node_count: number;
  /** `<details>` elements in the chat log — the collapsed-tool lazy-mount signal. */
  details_count: number;
  /** ms since this chat surface was attached. */
  surface_age_ms: number;
  /** Chromium-only. Absent everywhere else — never assume presence. */
  js_heap_used_mb?: number;
  js_heap_limit_mb?: number;
  /** used/limit as a whole percent. The number that predicts an OOM. */
  heap_pressure_pct?: number;
}

/** `client_chat_memory_pressure` — edge-triggered pre-OOM warning. */
export interface ChatMemoryPressureProps extends ChatCorrelationProps {
  /** Which band was crossed (70 / 85 / 95). Fires at most once per band per session. */
  threshold_pct: number;
  js_heap_used_mb: number;
  js_heap_limit_mb: number;
  heap_pressure_pct: number;
  message_count: number;
  dom_node_count: number;
  surface_age_ms: number;
  /** Runs started on this surface so far — separates "one huge run" from "long grind". */
  run_count: number;
  /**
   * Compact structural trail, `surface_attach@0,run_start@1200,…`. Read by a
   * human on one bad event; never aggregated. Enum kinds only, no content.
   */
  breadcrumbs?: string;
  /**
   * Last few heap readings in MB, oldest first. Turns "it OOMed" into
   * "it climbed 120 → 180 → 260 → 410 across three runs", i.e. a hypothesis.
   */
  heap_trend_mb?: number[];
  /** `<details>` count at the moment pressure was detected. */
  details_count?: number;
}

/**
 * `client_chat_stream_health` — main-thread blocking measured over a
 * window in which a run was actively streaming. `blocked_ratio` is the
 * headline jank number: the fraction of wall-clock the main thread spent
 * unable to paint.
 */
export interface ChatStreamHealthProps extends ChatCorrelationProps, ChatMeasurementTrustProps {
  window_ms: number;
  /** Sum of long-task durations inside the window. */
  blocked_ms: number;
  /** blocked_ms / window_ms as a whole percent. */
  blocked_ratio_pct: number;
  long_task_count: number;
  worst_task_ms: number;
  message_count: number;
  dom_node_count: number;
  virtualized: boolean;
  /** True when the window closed because the run ended, false for a periodic cut. */
  run_completed: boolean;
  /** `<details>` count — pairs with dom_node_count to spot lazy-mount loss. */
  details_count?: number;
}

/**
 * `client_chat_interaction_latency` — worst input-response delay in a
 * window, from the Event Timing API (the INP primitive).
 */
export interface ChatInteractionLatencyProps extends ChatCorrelationProps {
  /** Worst `duration` among interactions in the window. */
  inp_ms: number;
  /** Interactions over the reporting threshold in this window. */
  interaction_count: number;
  /** Low-cardinality: the DOM event name only, never a selector or text. */
  event_name: string;
  /** Which chat region absorbed the interaction. */
  area: 'composer' | 'chat_log' | 'other';
  /** Whether a run was streaming during the window. The key breakdown. */
  streaming: boolean;
  /**
   * Conversation length, when the observer can see it. Optional rather
   * than defaulted to 0: a fabricated zero would make "input lag is worse
   * in long conversations" unanswerable by quietly filling the bucket
   * that disproves it.
   */
  message_count?: number;
}

/** `client_chat_protocol_anomaly` — a render contract silently did not hold. */
export interface ChatProtocolAnomalyProps extends ChatCorrelationProps {
  anomaly: ChatProtocolAnomaly;
  /** Length of the offending payload in characters. Never its content. */
  source_length?: number;
  message_count?: number;
}

/** `client_chat_recovery` — did the client heal itself after a break? */
export interface ChatRecoveryProps extends ChatCorrelationProps {
  path: ChatRecoveryPath;
  outcome: ChatRecoveryOutcome;
  /** 1-based attempt number within one recovery episode. */
  attempt: number;
  duration_ms: number;
  /** Daemon error code when outcome is `failed`. Already an enum, safe to ship. */
  error_code?: string;
  message_count?: number;
}

/** Which symptom of a stale compositor scroll ceiling fired. */
export type ChatScrollFreezeTrigger =
  /** Repeated downward wheels asked for real distance and moved nothing. */
  | 'wheel_stall'
  /** A downward wheel threw the scroller BACKWARDS onto the stale ceiling. */
  | 'wheel_snap_back';

/**
 * `client_chat_scroll_frozen` — the chat log stopped responding to the
 * wheel while layout still says it has room.
 *
 * The defect this reports is invisible to JS from the inside: the
 * compositor keeps its own copy of a scroller's maximum offset so wheel
 * input need not wait on the main thread, and on the chat log that copy
 * can freeze at an early value and never refresh. Measured on a real
 * machine: `scrollHeight` 2347 and `clientHeight` 583 (1764px of travel),
 * `scrollTop = 1700` assigned from JS took effect, yet twelve wheel
 * notches asking for 1440px stopped dead at 91 — and a notch from 800
 * snapped back to 91. Only destroying and rebuilding the layout box
 * cleared it.
 *
 * Nothing here reads the compositor. Every field is the symptom, plus
 * enough of the run-up to date the freeze — which is the point, since the
 * user already knows it is stuck and cannot tell us what preceded it.
 *
 * Structural only: counts, pixels, durations, enums. No message text, no
 * selector, no user-authored string.
 */
export interface ChatScrollFreezeProps extends ChatCorrelationProps {
  trigger: ChatScrollFreezeTrigger;
  /** Random per-surface handle, so a follow-up event can be joined to this one. */
  probe_id: string;

  // -- geometry at the moment of the freeze --------------------------------
  scroll_top: number;
  scroll_height: number;
  client_height: number;
  /** The scrollTop the wheel refuses to pass. */
  ceiling_scroll_top: number;
  /** Highest scrollTop ever seen, INCLUDING programmatic writes. */
  max_scroll_top_seen: number;
  /** scrollHeight - clientHeight: what layout would permit. */
  layout_max_scroll_top: number;
  /** How much of the log the wheel cannot reach. */
  unreachable_px: number;

  // -- the inferred freeze point -------------------------------------------
  /**
   * ceiling + clientHeight. The content height the compositor still
   * believes in — 674 in the measured case. Compare against
   * `content_px_at_scrollable_on`: if they match, the copy was stale from
   * the moment the scroll node was created.
   */
  compositor_content_px: number;
  /** scrollHeight. The content height layout actually has. */
  layout_content_px: number;

  // -- the gesture ----------------------------------------------------------
  wheel_count: number;
  wheel_requested_px: number;
  /**
   * Scrollable descendants between the wheel target and the chat log that
   * still had travel left. Reported only when zero — a non-zero count
   * means an inner box could have eaten the wheel and no report is sent.
   */
  inner_scroller_count: number;

  // -- the run-up -----------------------------------------------------------
  /** ms since the probe attached to this chat log element. */
  surface_age_ms: number;
  /**
   * Compact structural trail, `scrollable_on@1200:c674/v583,…`. A string
   * rather than an array of objects because it is read by a human staring
   * at one bad event and never aggregated.
   */
  transitions: string;
  /** Content height when the log first became scrollable. The prime suspect. */
  content_px_at_scrollable_on?: number;
  /** ms between that transition and the freeze. */
  scrollable_since_ms?: number;

  // -- what else was moving -------------------------------------------------
  /**
   * Bounded trail of parallel activity, `jump_shown:jump@1204,…` — oldest
   * first, milliseconds since the probe attached, `xN` for a coalesced
   * burst.
   *
   * The geometry above dates the freeze; it cannot say what else the page
   * was doing at that instant, and after 225 synthetic reproduction
   * attempts that is the only lead left. Kinds and roles are enums; the
   * class names they were derived from never leave the browser.
   */
  activity_trail: string;
  /**
   * The same trail sliced to ±500ms around the birth of the scroll node.
   * Absent when the probe attached after the log was already scrollable —
   * there is then no birth to centre on.
   */
  activity_near_scroll_node?: string;
  /** …and to the two seconds before the verdict. */
  activity_pre_freeze: string;
  /** Entries evicted from the ring buffer, so a partial trail cannot read as whole. */
  activity_dropped: number;
  /** `kind=count` totals over the buffer, e.g. `jump_shown=1,log_class=4`. */
  activity_counts: string;
  /** The "back to latest" button was already lit when the probe attached. */
  jump_active_at_attach: boolean;
  /** ms after attach that the button was first SEEN to light up. */
  jump_first_active_ms?: number;
  /**
   * Signed ms between that and the scroll node's birth; negative means the
   * button lit up first. The button carries `od-glass-refract` (a
   * backdrop-filter/SDF layer) and can only appear once the log is
   * scrollable, which makes it the closest thing to a suspect this probe
   * has.
   */
  jump_active_vs_scroll_node_ms?: number;

  // -- the drift ------------------------------------------------------------
  /**
   * Every content-height change, `1600:c1434/v583/m851+assistant_msg:534` —
   * ms since attach, content, viewport, the ceiling layout permits, and the
   * child that grew.
   *
   * Unfiltered, unlike `transitions`: a live capture showed the compositor
   * falling behind five and nine pixels at a time, so a 200px step filter
   * would have drawn a flat line through the interesting part.
   */
  content_steps: string;
  /** Content changes observed in total, including those the ring evicted. */
  content_step_count: number;
  /**
   * Rounds of "the wheel asked to go further and stopped here",
   * `1900:r846/m851/s5` — ms, reached, layout maximum, shortfall; `xN` for a
   * collapsed run at the same ceiling.
   *
   * This is the sequence that overturned "the ceiling froze at birth": in
   * the capture it read 0, 1, 5, 9, 12, 27 against an unchanging layout.
   */
  ceiling_probes: string;
  ceiling_probe_count: number;
  /** ms after attach that the compositor first fell behind layout. */
  shortfall_first_ms?: number;
  /** …by how much (>= 1px; sub-pixel slack does not count). */
  shortfall_first_px?: number;
  shortfall_first_reached_px?: number;
  shortfall_first_layout_max_px?: number;
  /** Content height at that moment — WHICH content change opened the deficit. */
  shortfall_first_content_px?: number;
  /** What grew into it, `assistant_msg:534`. Role enum and pixels only. */
  shortfall_first_growth?: string;
  /**
   * `.chat-log-tail-spacer`'s height at the freeze. It was 0 throughout the
   * capture; whether it ever has height while the deficit opens is an open
   * question this answers.
   */
  tail_spacer_px?: number;

  // -- compositing layers ---------------------------------------------------
  /** Elements with a layer-promoting property when the probe attached. */
  layer_count_at_attach?: number;
  /** …and at the freeze. A rise names a new layer as a suspect. */
  layer_count_now?: number;
  /** Distinct triggers present now, e.g. `will_change,backdrop_filter`. */
  layer_kinds_now?: string;
  /** True when the subtree scan hit its element budget. */
  layer_scan_truncated?: boolean;
  /** Layer-promoting properties on the chat log's ancestor chain. */
  ancestor_layer_kinds?: string;

  // -- runtime state --------------------------------------------------------
  /** A turn was streaming into the log at the moment it froze. */
  streaming: boolean;
  /** A `<question-form>` skeleton was mounted. */
  question_form_pending: boolean;
  /** Direct children of the chat log — message rows. */
  message_row_count: number;
  visibility_state: string;
  device_pixel_ratio?: number;
  /** Parsed from the UA. Low cardinality; never the full UA string. */
  chromium_version?: string;
  electron_version?: string;
  /** Running inside the packaged desktop shell (`od://`). */
  packaged: boolean;
}

/**
 * The full `client_chat_*` event surface. Adding a member here is the
 * only sanctioned way to introduce a new chat observability event.
 */
export type ChatObservabilityEvent =
  | { event: 'client_chat_first_paint'; props: ChatFirstPaintProps }
  | { event: 'client_chat_dom_growth'; props: ChatDomGrowthProps }
  | { event: 'client_chat_memory_pressure'; props: ChatMemoryPressureProps }
  | { event: 'client_chat_stream_health'; props: ChatStreamHealthProps }
  | { event: 'client_chat_interaction_latency'; props: ChatInteractionLatencyProps }
  | { event: 'client_chat_protocol_anomaly'; props: ChatProtocolAnomalyProps }
  | { event: 'client_chat_recovery'; props: ChatRecoveryProps }
  | { event: 'client_chat_scroll_frozen'; props: ChatScrollFreezeProps };

export type ChatObservabilityEventName = ChatObservabilityEvent['event'];
