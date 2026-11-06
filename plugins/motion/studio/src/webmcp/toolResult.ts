/**
 * The shape every Studio tool resolves with.
 *
 * Tools resolve, they never reject. That is forced by the spec, not a style
 * choice: a rejected `execute` has its reason DISCARDED and the caller is
 * rejected with a bare `UnknownError` (`index.bs`, the execute-tool completion
 * steps). Rejecting would therefore guarantee the agent cannot see why the edit
 * failed, which is the one thing it needs most.
 *
 * There is no `outputSchema` in the platform yet, so this discriminant is
 * invisible to the agent's schema layer. Every tool's `description` has to say
 * that it returns `ok`.
 */

export type ToolFailureKind =
  /** A real state the agent can route around: save queue paused, capability off. */
  | "blocked"
  /** The agent's fault: unknown handle, bad enum, out of range. */
  | "invalid"
  /** Exogenous: the server said no, the patch target could not be resolved. */
  | "failed"
  /** Our bug. Reported AND re-thrown, so it is findable instead of plausible. */
  | "internal";

export interface ToolFailure {
  ok: false;
  kind: ToolFailureKind;
  reason: string;
  /** What to try instead. This is what turns a failure into a next action. */
  hint?: string;
}

export type ToolResult<T> = ({ ok: true } & T) | ToolFailure;

export function toolOk<T extends object>(value: T): { ok: true } & T {
  return { ok: true, ...value };
}

export function toolFailure(kind: ToolFailureKind, reason: string, hint?: string): ToolFailure {
  return hint ? { ok: false, kind, reason, hint } : { ok: false, kind, reason };
}

/**
 * Wrap a tool body so a thrown bug becomes a legible result instead of a
 * rejection the agent cannot read.
 *
 * The split matters. A `TypeError` means a handler signature moved under us and
 * the tool is permanently broken; reporting that as an ordinary failure would
 * let it ship looking like a bad request forever. So it is tagged `internal`
 * AND re-thrown to the console, where it is findable. Everything else is a
 * failure the agent should route around.
 */
export async function runToolBody<T>(
  toolName: string,
  body: () => Promise<ToolResult<T>>,
): Promise<ToolResult<T>> {
  try {
    return await body();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof TypeError || error instanceof ReferenceError) {
      console.error(`[hf-webmcp] ${toolName} threw`, error);
      return toolFailure("internal", reason);
    }
    return toolFailure("failed", reason);
  }
}
