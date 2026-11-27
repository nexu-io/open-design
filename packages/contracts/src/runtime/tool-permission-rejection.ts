/**
 * The sentence the daemon writes when a headless OpenCode run auto-denied a
 * tool call and then stopped without output.
 *
 * Headless OpenCode runs (BYOK OpenCode, local `opencode`) have no approval
 * UI, so a call that leaves the run's `external_directory` allowlist is denied
 * on the spot. The daemon names the denied call in this sentence; the failure
 * classifier keys on the marker, and the web failure card reads the tool and
 * the target back out so it can show the user the exact path. All three read
 * the sentence through this module so they cannot drift.
 */

/** Stable wording the failure classifier keys on. */
export const TOOL_PERMISSION_REJECTED_MARKER =
  'is outside the folders this run is allowed to access';

export interface ToolPermissionRejection {
  tool: string;
  /** The path (or pattern / command) the call targeted, when the call carried one. */
  target: string | null;
}

export function toolPermissionRejectionMessage(rejection: ToolPermissionRejection): string {
  const target = rejection.target ? ` on ${rejection.target}` : '';
  return (
    `The agent's ${rejection.tool} call${target} was blocked: the path ${TOOL_PERMISSION_REJECTED_MARKER}, ` +
    'and the agent stopped without producing output. Move the file into the project folder, or ask the agent to work inside the project, then retry.'
  );
}

/**
 * The denied call named by {@link toolPermissionRejectionMessage}, or null when
 * the text is not that sentence.
 *
 * The target is matched greedily up to the fixed tail, so a path that itself
 * contains spaces or the word "on" still comes back whole.
 */
export function readToolPermissionRejection(
  text: string | null | undefined,
): ToolPermissionRejection | null {
  if (!text) return null;
  const match = /The agent's (\S+) call(?: on (.+))? was blocked: the path is outside the folders this run is allowed to access/s
    .exec(text);
  if (!match) return null;
  return { tool: match[1]!, target: match[2] ?? null };
}
