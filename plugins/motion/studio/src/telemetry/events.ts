import { trackEvent } from "./client";
import { breadcrumbTrail } from "./breadcrumbs";

// Studio frontend events. The corresponding `render_complete` / `render_error`
// events are emitted server-side by `packages/cli/src/server/studioServer.ts`
// with `source: "studio"` — keeping rich perf data on a single unified event.

export function trackStudioSessionStart(props: { has_project: boolean }): void {
  trackEvent("studio_session_start", {
    has_project: props.has_project,
  });
}

export function trackPreviewFirstFrame(props: {
  duration_ms: number;
  composition_seconds: number;
  clip_count: number;
  media_clip_count: number;
  studio_version: string;
}): void {
  trackEvent("preview_first_frame", props);
}

export function trackStudioRenderStart(props: {
  fps: number;
  quality: string;
  format: string;
  resolution?: string;
  composition?: string;
}): void {
  trackEvent("studio_render_start", {
    fps: props.fps,
    quality: props.quality,
    format: props.format,
    resolution: props.resolution,
    composition: props.composition,
  });
}

export type StudioTimelinePerformanceSample = {
  total_clip_count: number;
  mounted_clip_count: number;
  total_row_count: number;
  timeline_dom_node_count: number;
  viewport_width: number;
  viewport_height: number;
  zoom_mode: string;
  scroll_sample_count: number;
  scroll_frame_latency_p95_ms: number;
  scroll_frame_latency_max_ms: number;
  frame_interval_p95_ms?: number;
};

export function trackStudioTimelinePerformance(props: StudioTimelinePerformanceSample): void {
  trackEvent("studio_timeline_performance", props);
}

function getBrowserDoctorSummary(): string {
  try {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string };
      userAgentData?: { platform?: string };
    };
    const platform = nav.userAgentData?.platform ?? navigator.platform ?? "unknown";
    const parts = [
      `ua=${platform}`,
      `screen=${screen.width}x${screen.height}@${devicePixelRatio}x`,
      `lang=${navigator.language}`,
    ];
    if (nav.deviceMemory) parts.push(`mem=${nav.deviceMemory}GB`);
    if (nav.connection?.effectiveType) parts.push(`net=${nav.connection.effectiveType}`);
    if (navigator.hardwareConcurrency) parts.push(`cpu=${navigator.hardwareConcurrency}cores`);
    return parts.join(" ");
  } catch {
    return "";
  }
}

export function trackStudioRazorSplit(props: { mode: "single" | "all"; count: number }): void {
  trackEvent("studio_razor_split", {
    mode: props.mode,
    count: props.count,
  });
}

// Adoption signal for the per-clip keyframe-lane caret toggle.
export function trackStudioKeyframeLaneExpand(props: { expanded: boolean }): void {
  trackEvent("studio_keyframe_lane_expand", { expanded: props.expanded });
}

// Adoption signal for opening and committing the per-segment ease editor.
export function trackStudioSegmentEaseEdit(props: {
  action: "open" | "commit";
  ease?: string;
}): void {
  trackEvent("studio_segment_ease_edit", { action: props.action, ease: props.ease });
}

/**
 * Context shared by every event in the feedback funnel, so `shown` →
 * `dismissed` / `studio_feedback` can be read as one funnel broken down by the
 * moment that triggered it. Without `shown` there is no way to tell a prompt
 * nobody answers from a prompt that never renders.
 */
interface StudioFeedbackContext {
  /** What the prompt is about: "render_complete" | "render_failed". */
  reason: string;
  /** Render job the prompt followed — joins the response to that render. */
  render_id?: string;
}

export function trackStudioFeedbackShown(ctx: StudioFeedbackContext): void {
  trackEvent("studio_feedback_shown", {
    reason: ctx.reason,
    render_id: ctx.render_id,
    source: "studio",
  });
}

export function trackStudioFeedbackDismissed(
  ctx: StudioFeedbackContext & {
    /** "close" | "escape" | "timeout" — separates rejection from inattention. */
    via: string;
    /** A dismiss after picking a rating is an abandon, not a refusal. */
    had_rating: boolean;
  },
): void {
  trackEvent("studio_feedback_dismissed", {
    reason: ctx.reason,
    render_id: ctx.render_id,
    via: ctx.via,
    had_rating: ctx.had_rating,
    source: "studio",
  });
}

/**
 * The booking link offered after a response. Its own event because the thing
 * worth measuring is the click, and a link is otherwise invisible to us.
 */
export function trackStudioFeedbackInterviewClick(ctx: { reason: string }): void {
  trackEvent("studio_feedback_interview_click", {
    reason: ctx.reason,
    source: "studio",
  });
}

export function trackStudioFeedback(
  props: StudioFeedbackContext & {
    /**
     * Absent on the failure prompt, which asks what broke instead of scoring a
     * render the user never got. A fabricated rating would poison the average.
     */
    rating?: number;
    comment?: string;
    /**
     * Which follow-up the comment answers ("remove" | "borrow" | "fix" |
     * "detractor" | "failure"). One card asks one question, rotated across
     * users, so this is what makes the free text separable.
     */
    question: string;
    /** "preset" (a tapped chip) or "typed". Never mix them when counting. */
    answer_kind: string;
    /**
     * Reproduction context from whatever produced the prompt: render settings,
     * outcome, counts. Flattened onto the event so each key is filterable in
     * PostHog rather than buried in a JSON blob nobody can group by.
     */
    context?: Record<string, string | number | boolean | undefined>;
  },
): void {
  // Plain product event, not a PostHog survey response: nothing here is served
  // by the surveys product (no survey definition, no targeting, no popover).
  trackEvent("studio_feedback", {
    ...(props.rating === undefined ? {} : { rating: props.rating, rating_scale: 10 }),
    ...(props.comment ? { comment: props.comment } : {}),
    ...props.context,
    reason: props.reason,
    render_id: props.render_id,
    question: props.question,
    answer_kind: props.answer_kind,
    doctor_summary: getBrowserDoctorSummary(),
    // What the user did in the run-up. A comment says what broke; this says
    // how to get there, which is the half a bug report is usually missing.
    // Read AFTER the context spread so no caller can shadow it.
    breadcrumbs: breadcrumbTrail(),
    source: "studio",
  });
}

export function trackBlockParamCommit(props: {
  tone: "saved" | "error" | "confirm";
  blockName: string;
  key: string;
}): void {
  trackEvent("studio_block_param_commit", {
    tone: props.tone,
    block_name: props.blockName,
    param_key: props.key,
  });
}
