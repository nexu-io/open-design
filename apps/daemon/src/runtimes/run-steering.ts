/**
 * B11 「引导对话」 — steer a turn that is still running.
 *
 * The chat queue's third action is NOT "cancel and resend". Steering writes one
 * more JSONL `user` frame onto the agent child's stdin while the turn is still
 * executing, so the model reads the new instruction without losing the work it
 * has already done.
 *
 * That only means anything when three things hold at once, and each of them
 * fails silently if we guess:
 *
 *  1. The runtime delivers its prompt as `stream-json`. That is the only writer
 *     that leaves stdin open past the opening prompt — every other runtime goes
 *     through `writePromptAndEndStdin`, so a later write lands on a closed pipe.
 *     This is a permanent property of the agent, so callers should stop
 *     advertising the affordance rather than retry.
 *  2. The run is still live.
 *  3. `run.stdinOpen` is still true. A clean turn terminal closes stdin (see
 *     `applyClaudeStreamJsonRunBookkeeping`); a `stop_reason: 'tool_use'` pause
 *     deliberately does NOT — the model is parked mid-tool and still reading,
 *     which is exactly when steering is worth the most.
 *
 *     "Turn terminal" is either a `turn_end` or a `usage` event, and which one
 *     arrives first depends on the installed Claude Code build. On 2.1.259 the
 *     `assistant` wrapper's `stop_reason` is always null, so `turn_end` comes
 *     from `stream_event`/`message_delta` and exists only when
 *     `--include-partial-messages` was negotiated; without that flag the first
 *     terminal of the turn is the `usage` event synthesized from the `result`
 *     frame. `chat-run-lifecycle.ts` treats the two as equals for exactly this
 *     reason — see `claude-stream.ts`'s `emitTurnEndOnce` for the full
 *     three-source contract and the recordings that pin it down.
 *
 *     Practical consequence for callers: the steering window closes at the
 *     turn's `result` frame on every build, so the affordance is only live
 *     while the model is still working.
 *
 * `classifyRunSteering` is the single place that verdict is made; the HTTP
 * route, the CLI, and any future caller must go through it instead of
 * re-deriving the rule.
 */

import { agentSupportsMidTurnSteering } from '@open-design/contracts';

export type RunSteeringRefusal =
  | 'runtime_unsupported'
  | 'run_terminal'
  | 'stdin_closed';

export type RunSteeringVerdict =
  | { ok: true }
  | { ok: false; refusal: RunSteeringRefusal };

/**
 * Minimal shape of a runtime def this module needs — keeps it unit-testable.
 * The index signature is deliberate: callers hand us whole `RuntimeAgentDef`
 * objects (closures and all), and a bare optional-only type would trip
 * TypeScript's weak-type check on every one of them.
 */
type PromptInputFormatBearer = {
  promptInputFormat?: 'text' | 'stream-json';
  [key: string]: unknown;
};

/**
 * Whether this runtime's child keeps reading stdin after the opening prompt.
 * Delegates to the shared contract predicate so the daemon and the web UI can
 * never disagree about which agents advertise steering.
 */
export function runtimeAcceptsMidTurnInput(
  def: PromptInputFormatBearer | null | undefined,
): boolean {
  return agentSupportsMidTurnSteering(def);
}

export function classifyRunSteering(input: {
  runtimeAccepts: boolean;
  terminal: boolean;
  stdinOpen: boolean;
}): RunSteeringVerdict {
  // Runtime capability is checked first on purpose: it is permanent, so the
  // caller can disable the affordance instead of showing a "try again" hint.
  if (!input.runtimeAccepts) return { ok: false, refusal: 'runtime_unsupported' };
  if (input.terminal) return { ok: false, refusal: 'run_terminal' };
  if (!input.stdinOpen) return { ok: false, refusal: 'stdin_closed' };
  return { ok: true };
}

/**
 * The exact JSONL frame `claude --input-format stream-json` expects for a user
 * message. The opening prompt in `server.ts` writes the same frame through this
 * encoder: a steering frame the model does not recognise fails invisibly, so
 * the two writers must not be allowed to drift apart.
 */
export function encodeStreamJsonUserMessage(text: string): string {
  return `${JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  })}\n`;
}

type SteerableStdin = {
  destroyed?: boolean;
  write: (chunk: string, encoding: BufferEncoding) => boolean;
};

/**
 * Write one steering frame. Returns whether it actually reached the pipe, plus
 * whether the OS buffered it (the child is not draining stdin — the same
 * corroborating signal `run.stdinBackpressure` records for the opening prompt).
 *
 * A buffered write is still delivered; a destroyed pipe or an EPIPE is not, and
 * must surface as a refusal rather than a thrown 500 — the child racing to exit
 * is an expected outcome here, not a daemon bug.
 */
export function writeSteeringUserMessage(
  stdin: SteerableStdin | null | undefined,
  text: string,
): { delivered: boolean; backpressure: boolean } {
  if (!stdin || stdin.destroyed) return { delivered: false, backpressure: false };
  try {
    const accepted = stdin.write(encodeStreamJsonUserMessage(text), 'utf8');
    return { delivered: true, backpressure: accepted === false };
  } catch {
    return { delivered: false, backpressure: false };
  }
}
