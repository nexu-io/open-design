/**
 * Which coding agent, if any, is driving this Studio.
 *
 * Studio cannot detect this. The signal lives entirely in the environment of
 * the CLI process — `CLAUDECODE`, `CURSOR_TRACE_ID` and friends — which the
 * browser has no access to. So the CLI classifies it once
 * (`cli/src/telemetry/agent_runtime.ts`) and publishes the resulting category
 * into the served page as `window.__HF_CLI_AGENT_RUNTIME`, alongside the
 * distinct id and the canary decisions.
 *
 * Null is the common, correct answer: a Studio opened by hand, or served by
 * Vite in development, has no CLI to ask. Reading it as "no agent" rather than
 * "unknown" is the honest default — every agent we can name sets a marker, and
 * an unnamed one is indistinguishable from a person either way.
 *
 * Memoized, matching `distinctId.ts`: the value is fixed for the life of the
 * page, and a caller that reads it per event should not pay for a global lookup
 * and a type check every time.
 */

declare global {
  interface Window {
    __HF_CLI_AGENT_RUNTIME?: string;
  }
}

let resolved: string | null | undefined;

export function resolveAgentRuntime(): string | null {
  if (resolved !== undefined) return resolved;
  if (typeof window === "undefined") {
    resolved = null;
    return resolved;
  }
  const raw = window.__HF_CLI_AGENT_RUNTIME;
  // A non-empty string only. An empty string means the CLI had nothing to say,
  // and sending `""` would land in PostHog as a distinct value from absent —
  // two encodings of the same fact, which is exactly what makes a breakdown
  // read as a gap that is not there.
  resolved = typeof raw === "string" && raw.length > 0 ? raw : null;
  return resolved;
}

/**
 * The same answer as a telemetry property: never null, never absent.
 *
 * "No agent" is a real, common finding — most sessions are people — so it needs
 * a value that survives a breakdown. Encoding it as an omitted property would
 * make "a person used this" indistinguishable from "this event predates the
 * property", and the two studio transports type their payloads differently
 * (one permits null, one does not), so left alone they would encode the same
 * fact two ways. That mismatch has already produced one wrong conclusion in
 * this project's telemetry; a shared sentinel is what stops it.
 */
export function agentRuntimeProperty(): string {
  return resolveAgentRuntime() ?? "none";
}

/** Test seam: the memo would otherwise leak between cases in one module load. */
export function resetAgentRuntimeForTests(): void {
  resolved = undefined;
}
