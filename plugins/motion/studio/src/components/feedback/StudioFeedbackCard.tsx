import { useI18n } from "../../i18n/I18n";
import { memo, useState, useCallback, useRef, useEffect } from "react";
import { toastSurface } from "../StudioToast";
import {
  trackStudioFeedback,
  trackStudioFeedbackShown,
  trackStudioFeedbackDismissed,
  trackStudioFeedbackInterviewClick,
} from "../../telemetry/events";
import {
  subscribeToFeedbackRequests,
  markFeedbackAnswered,
  markFeedbackDismissed,
  followUpFor,
  isProblemReason,
  type FeedbackRequest,
  type FollowUpQuestion,
} from "./feedbackTrigger";
import { projectProvenance } from "./projectProvenance";

/** A failed render is its own question; nothing is rotated in front of it. */
const FAILURE_FOLLOW_UP: FollowUpQuestion = {
  id: "failure",
  prompt: "That export failed.",
  placeholder: "What were you exporting?",
  presets: [
    { label: "Happens every time", hint: "Every export of this project fails this way" },
    { label: "First time", hint: "Exports normally work for me" },
    { label: "Long composition", hint: "Over a minute, or a lot of scenes" },
    { label: "Big media files", hint: "Large video or image assets in the project" },
    { label: "Has audio", hint: "The composition includes voiceover, music or sound" },
    { label: "Embedded video", hint: "One or more video clips inside the composition" },
  ],
};

/**
 * The crash screen ask. "What were you doing" beats "what went wrong": the
 * user cannot see the stack trace, but they know exactly what they touched,
 * and that is the half the crash report is missing.
 */
const CRASH_FOLLOW_UP: FollowUpQuestion = {
  id: "crash",
  prompt: "Studio crashed. What were you doing?",
  placeholder: "The last thing you touched",
  presets: [
    { label: "Editing the timeline", hint: "Dragging, trimming or splitting clips" },
    { label: "Playing the preview", hint: "Scrubbing or playing back the composition" },
    { label: "Adding media", hint: "Importing video, images or audio" },
    { label: "Editing properties", hint: "Changing styles, transforms or keyframes" },
    { label: "Exporting", hint: "Starting or watching a render" },
    { label: "Just opened it", hint: "It broke before I did anything" },
  ],
};

/** Long enough to read the render result first; short enough to stay polite. */
const AUTO_DISMISS_MS = 30_000;
/** Matches the .hf-toast-exit animation so the node leaves as it finishes. */
const EXIT_MS = 160;
/**
 * The thanks state carries the interview link, so it has to outlast a glance.
 * A 1.4s confirmation would flash a booking link nobody could reach.
 */
const THANKS_MS = 10_000;

/**
 * Someone who just answered is the likeliest person in the product to say yes
 * to a call, and this is the only moment we have their attention with goodwill.
 */
const INTERVIEW_URL = "https://calendar.app.google/yRHT7oPsHWcqFfFv5";

const RATINGS = Array.from({ length: 11 }, (_, n) => n);

type Step = "rating" | "comment" | "thanks";

/**
 * The Studio feedback prompt. Shown by `feedbackTrigger` after a render
 * finishes or fails — never on a timer, so the user always knows what they are
 * being asked about.
 *
 * A failed render skips the 0-10 scale: scoring an export you never got is a
 * question with no useful answer, and the free-text reply is the whole point.
 */
// fallow-ignore-next-line complexity
export const StudioFeedbackCard = memo(function StudioFeedbackCard() {
  const { t } = useI18n();
  const [request, setRequest] = useState<FeedbackRequest | null>(null);
  const [step, setStep] = useState<Step>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [followUp, setFollowUp] = useState<FollowUpQuestion>(FAILURE_FOLLOW_UP);
  const [comment, setComment] = useState("");
  /** Explanation of the chip under the pointer, shown on the reserved line. */
  const [hint, setHint] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside close(), which must not re-subscribe every keystroke.
  const stateRef = useRef({ request, rating, step });
  stateRef.current = { request, rating, step };

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const close = useCallback(
    (via: "close" | "escape" | "timeout" | "sent") => {
      const { request: req, rating: picked, step: at } = stateRef.current;
      if (!req) return;
      clearTimer();
      if (via === "sent") {
        markFeedbackAnswered();
      } else {
        markFeedbackDismissed();
        trackStudioFeedbackDismissed({
          reason: req.reason,
          render_id: req.renderId,
          via,
          had_rating: picked !== null || at === "comment",
        });
      }
      setExiting(true);
      setTimeout(() => {
        setRequest(null);
        setExiting(false);
        setRating(null);
        setComment("");
        setStep("rating");
      }, EXIT_MS);
    },
    [clearTimer],
  );

  useEffect(
    () =>
      subscribeToFeedbackRequests((next) => {
        setRequest(next);
        setRating(null);
        setComment("");
        setHint(null);
        setFollowUp(next.reason === "crash" ? CRASH_FOLLOW_UP : FAILURE_FOLLOW_UP);
        // A crash or a failed render has nothing to score, so those open
        // straight at the ask instead of demanding a number first.
        setStep(isProblemReason(next.reason) ? "comment" : "rating");
        trackStudioFeedbackShown({ reason: next.reason, render_id: next.renderId });
      }),
    [],
  );

  // Auto-dismiss only while the prompt is still untouched — once the user
  // starts typing or picks a score, the card is theirs until they close it.
  useEffect(() => {
    if (!request || step === "thanks" || rating !== null || comment !== "") return;
    timerRef.current = setTimeout(() => close("timeout"), AUTO_DISMISS_MS);
    return clearTimer;
  }, [request, step, rating, comment, close, clearTimer]);

  useEffect(() => {
    if (step === "comment") inputRef.current?.focus();
  }, [step]);

  /** `preset` is the tapped chip's text; absent means the field was typed in. */
  const submit = useCallback(
    (preset?: string) => {
      const req = stateRef.current.request;
      if (!req) return;
      const text = (preset ?? comment).trim();
      // Nothing to send yet: a failure prompt with no words is just a dismiss.
      if (rating === null && text === "") return close("close");
      trackStudioFeedback({
        reason: req.reason,
        render_id: req.renderId,
        // Which follow-up this comment answers. Without it, "nothing" against
        // "what would you cut?" and "nothing" against "what should we fix?" are
        // the same row, and neither means anything.
        question: followUp.id,
        // Tapped chips cluster into countable buckets; typed answers do not.
        // Mixing them would make a chip's popularity look like a written theme.
        answer_kind: preset === undefined ? "typed" : "preset",
        // Provenance first so a producer's own context wins on a key clash.
        context: { ...projectProvenance(), ...req.context },
        ...(rating === null ? {} : { rating }),
        ...(text ? { comment: text } : {}),
      });
      clearTimer();
      setStep("thanks");
      setTimeout(() => close("sent"), THANKS_MS);
    },
    [rating, comment, followUp.id, close, clearTimer],
  );

  const pickRating = useCallback((n: number) => {
    setRating(n);
    setFollowUp(followUpFor(n));
    setStep("comment");
  }, []);

  if (!request) return null;

  const failed = isProblemReason(request.reason);
  // Deliberately the CLI's question, word for word. Studio and CLI ratings only
  // sit on one axis if they asked the same thing; what makes them comparable is
  // `reason`, which records the moment, not a reworded prompt.
  const title =
    step === "rating" ? "How likely are you to recommend HyperFrames?" : followUp.prompt;

  return (
    <div
      role="dialog"
      aria-label={t("Send feedback to the HyperFrames team")}
      className={`motion-reduce:animate-none ${exiting ? "hf-toast-exit" : "hf-toast-enter"}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") close("escape");
      }}
    >
      <div
        className={`flex w-[min(340px,calc(100vw-48px))] flex-col gap-2.5 overflow-hidden rounded-2xl px-3.5 py-3 ${toastSurface(failed)}`}
      >
        <div className="flex items-start gap-3">
          <p
            className={`min-w-0 flex-1 text-[12px] leading-5 ${failed ? "text-danger-ink" : "text-text-0"}`}
          >
            {step === "thanks" ? t("Thanks, that helps.") : title}
          </p>
          {step === "thanks" && (
            <a
              href={INTERVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                const req = stateRef.current.request;
                if (req) trackStudioFeedbackInterviewClick({ reason: req.reason });
                close("sent");
              }}
              className="h-6 shrink-0 whitespace-nowrap rounded-full border border-border-strong bg-hover px-2.5 text-[11px] leading-6 text-neutral-100 transition-[background-color,border-color,transform] duration-150 ease-out hover:border-text-muted hover:bg-press active:scale-[0.97] motion-reduce:transition-none"
            >
              {t("Talk to us, 30 min")}</a>
          )}
          <button
            type="button"
            onClick={() => close("close")}
            className="-mr-1 -mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors duration-150 hover:bg-press hover:text-neutral-200"
            aria-label={t("Dismiss")}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        </div>

        {/* The failure text the user already saw, quoted back so the report
            carries it without asking them to retype the error. */}
        {failed && request.detail && step !== "thanks" && (
          <p className="line-clamp-2 text-[11px] leading-4 text-danger-ink">{request.detail}</p>
        )}

        {step === "rating" && (
          <>
            {/* Native radios: free arrow-key navigation, grouping and labels. */}
            <fieldset className="grid grid-cols-11 gap-[3px]">
              <legend className="sr-only">{t("Rate this export from 0 to 10")}</legend>
              {RATINGS.map((n) => (
                <label
                  key={n}
                  // A resting fill, so the row reads as eleven controls rather
                  // than as a line of text that happens to be clickable.
                  className="flex h-7 cursor-pointer items-center justify-center rounded-md bg-hover text-[11px] tabular-nums text-neutral-400 transition-[background-color,color,transform] duration-150 ease-out hover:bg-press hover:text-neutral-100 active:scale-[0.97] has-checked:bg-text-0 has-checked:text-bg-0 has-focus-visible:ring-1 has-focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <input
                    type="radio"
                    name="hf-studio-feedback-rating"
                    value={n}
                    checked={rating === n}
                    onChange={() => pickRating(n)}
                    className="sr-only"
                  />
                  {n}
                </label>
              ))}
            </fieldset>
            <div className="flex justify-between text-[10px] leading-none text-neutral-500">
              <span>{t("Not likely")}</span>
              <span>{t("Extremely likely")}</span>
            </div>
          </>
        )}

        {step === "comment" && (
          <>
            {/* One tap is the whole answer. Sends immediately: making someone
                tap a chip and then hunt for Send throws away the reason chips
                exist. The field below stays for anything the chips miss. */}
            <div className="flex flex-wrap gap-1.5">
              {followUp.presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => submit(preset.label)}
                  onPointerEnter={() => setHint(preset.hint)}
                  onPointerLeave={() => setHint(null)}
                  onFocus={() => setHint(preset.hint)}
                  onBlur={() => setHint(null)}
                  // The hint reaches a screen reader through the label, since
                  // it never gets the hover that reveals it visually.
                  aria-label={`${preset.label}. ${preset.hint}`}
                  // Hover has to be unmistakable, not a shade brighter: the
                  // chip under the pointer is the one the hint line is talking
                  // about, so if you cannot tell which is hovered, the hint is
                  // attached to nothing.
                  className={`h-6 rounded-full border px-2.5 text-[11px] transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none ${
                    failed
                      ? "border-danger/30 bg-danger/10 text-danger-ink hover:border-danger/60 hover:bg-danger/20"
                      : "border-border bg-hover text-neutral-300 hover:border-text-muted hover:bg-press hover:text-text-0"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {/* Inline, not a floating tooltip. The card is 340px in a corner,
                so a bubble above the chips lands on top of the question and a
                bubble below lands on the input. One reserved line occludes
                nothing and needs no hover delay to be readable. */}
            <p className="h-3.5 truncate text-[10.5px] leading-[14px] text-neutral-500">
              {hint ?? "Tap one, or write your own."}
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder={followUp.placeholder}
                aria-label={followUp.prompt}
                maxLength={500}
                className="h-7 min-w-0 flex-1 rounded-md border border-border bg-input px-2 text-[11px] text-neutral-100 outline-hidden transition-colors duration-150 placeholder:text-neutral-500 focus:border-ring"
              />
              <button
                type="button"
                onClick={() => submit()}
                className="h-7 shrink-0 rounded-md bg-press px-2.5 text-[11px] text-neutral-100 transition-[background-color,transform] duration-150 ease-out hover:bg-on active:scale-[0.97] motion-reduce:transition-none"
              >
                {t("Send")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
