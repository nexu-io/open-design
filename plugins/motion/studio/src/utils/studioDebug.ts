// Opt-in diagnostic channels — one per question worth tracing, all off by
// default. Turn one on for the session with `localStorage.setItem("hf-<name>-debug",
// "1")` and reload, then grep the console for `[hf-<name>]`.
// Live channels: reload, select, drag, resize, commit.
//
// These exist because the interesting failures here are decisions, not crashes:
// a preview that reloads when it should not, a shift-click that selects nothing.
// Nothing is thrown and nothing is logged by default, so without a trace of the
// decision the only way to find the cause is to guess.
type DebugDetails = Record<string, unknown> | (() => Record<string, unknown> | null);
type DebugLogger = (stage: string, data?: DebugDetails) => void;

export function makeStudioDebugLogger(name: string): DebugLogger {
  let enabled: boolean | null = null;
  return (stage, data = {}) => {
    if (enabled === null) {
      try {
        enabled = localStorage.getItem(`hf-${name}-debug`) === "1";
      } catch {
        enabled = false;
      }
    }
    if (!enabled) return;
    const details = typeof data === "function" ? data() : data;
    if (!details) return;
    console.log(
      `[hf-${name}] ${JSON.stringify({ stage, t: Math.round(performance.now()), ...details })}`,
    );
  };
}
