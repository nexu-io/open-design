import { useEffect } from "react";
import { StudioFeedbackCard } from "./StudioFeedbackCard";
import { requestStudioFeedback } from "./feedbackTrigger";

/**
 * The feedback prompt for the crash screen.
 *
 * A crash unmounts the whole editor, and with it the card that normally lives
 * in the overlay stack, so the request cannot come from there. The error
 * boundary's fallback renders this instead: the card mounts and subscribes
 * first (child effects run before the parent's), then the effect below asks.
 *
 * The crash screen is the one place a user is guaranteed to have an opinion
 * and nothing else to do with it. Everything else about the ask is unchanged —
 * same eligibility, same cooldowns — so a crash cannot be used to talk to
 * someone who already said their piece this session.
 */
export function CrashFeedbackPrompt() {
  useEffect(() => {
    // No `detail`: the crash screen already prints the error message directly
    // above this card, and the crash event already carries it. Passing it here
    // would quote the same sentence back to the user twice.
    requestStudioFeedback({ reason: "crash" });
  }, []);

  return <StudioFeedbackCard />;
}
