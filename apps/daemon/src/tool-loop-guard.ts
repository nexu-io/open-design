/**
 * Tool-loop guard — detects an agent stuck repeating failing tool calls and
 * lets the run loop intervene before it grinds through dozens of identical
 * attempts.
 *
 * Motivating failure (the reason this exists): an agent was asked to move a
 * button into a titlebar element it believed was called `titlebar-left`. The
 * real class was `tb-left`. It wrote a shell verification that asserted
 * `titlebar-left` exists, the assertion failed, it concluded the edit hadn't
 * landed, re-read, and retried the SAME wrong assumption — 80+ tool calls,
 * ~19 of them errors, all looping on one invented identifier. Nothing in the
 * autonomous agent-CLI path noticed or stepped in; the daemon faithfully
 * streamed every attempt. (The BYOK proxy path already bounds its tool loop at
 * MAX_BYOK_TOOL_LOOPS; the autonomous chat agents had no equivalent.)
 *
 * This guard observes the normalized `tool_use` / `tool_result` events that
 * EVERY agent stream emits (Claude stream-json, Codex/OpenCode json-event,
 * Copilot, ACP, …), so a single run-scoped instance covers all of them. It is
 * pure and synchronous: feed it events, it returns a verdict the moment a loop
 * signature crosses a threshold. Two independent triggers:
 *
 *   1. CONSECUTIVE failures — N tool_results in a row are errors with no
 *      successful tool call between them. Catches "everything it tries fails"
 *      even when the agent keeps varying the command. Reset to zero on any
 *      successful tool_result, because a success is real progress.
 *
 *   2. REPEATED failure — the SAME (tool, action) signature errors K times.
 *      Catches fixation: re-running the identical failing Edit/Bash over and
 *      over (the titlebar-left case). A read-only success (Read/Glob/LS/Grep,
 *      TodoWrite, …) does NOT clear this tally: a stuck agent often re-reads the
 *      file and retries the same wrong assumption, so resetting on those reads
 *      would let `fail -> read(ok) -> same fail -> read(ok) -> …` loop forever
 *      (exactly the "re-read, retry the same wrong assumption" shape from the
 *      motivating report). The tally clears only on real PROGRESS: a successful
 *      mutating call (Edit/Write/apply_patch/…), or the failing action itself
 *      finally succeeding. K is set high enough that a couple of legitimate
 *      retries of the same command (fix, re-run, fix, re-run) never trip it.
 *
 * Two escalation tiers per trigger:
 *   - WARN  — emit a one-shot heads-up event so the UI/CLI surfaces "this run
 *             may be stuck" while it is still cheap to stop. Never destructive.
 *   - HALT  — at a hard ceiling, signal the run loop to terminate the child so
 *             the worst case is bounded instead of open-ended. Gated by mode so
 *             operators can downgrade to warn-only (see OD_TOOL_LOOP_GUARD).
 *
 * Latching: WARN fires at most once; after it, continued failures can still
 * escalate to HALT (also once). HALT supersedes WARN if the first counted
 * failure already crosses the ceiling. Once halted, further observations are
 * inert — the run is being torn down.
 */

/** Why the guard tripped. */
export type ToolLoopReason = 'consecutive-errors' | 'repeated-failure';

/** What the run loop should do about it. */
export type ToolLoopAction = 'warn' | 'halt';

/** Operating mode. `off` disables the guard entirely. `warn` only ever emits
 *  heads-up events (never halts). `halt` (default) warns first, then halts at
 *  the hard ceiling. */
export type ToolLoopMode = 'off' | 'warn' | 'halt';

/** The verdict returned the instant a threshold is crossed. Shaped to match
 *  the `tool_loop` SSE payload in `@open-design/contracts`. */
export interface ToolLoopVerdict {
  type: 'tool_loop';
  reason: ToolLoopReason;
  action: ToolLoopAction;
  /** The tool that kept failing (e.g. `Edit`, `Bash`). */
  toolName: string;
  /** Truncated, human-readable form of the repeated action. */
  signature: string;
  /** How many times it failed: the consecutive run, or repeats of this exact
   *  signature, depending on `reason`. */
  count: number;
}

export interface ToolLoopGuardOptions {
  /** Consecutive errored tool_results that trigger a WARN. Default 5. */
  warnConsecutive?: number;
  /** Consecutive errored tool_results that trigger a HALT. Default 10. */
  haltConsecutive?: number;
  /** Repeats of the same failing signature that trigger a WARN. Default 4. */
  warnRepeat?: number;
  /** Repeats of the same failing signature that trigger a HALT. Default 8. */
  haltRepeat?: number;
  /** Operating mode. Default `halt`. */
  mode?: ToolLoopMode;
}

export interface ToolLoopGuard {
  /** Record a tool call so a later errored result can be attributed to its
   *  action signature. Safe to call with unknown/missing input. */
  observeToolUse(id: string, name: string, input: unknown): void;
  /** Record a tool result. Returns a verdict the first time WARN is crossed
   *  and again the first time HALT is crossed; otherwise `null`. */
  observeToolResult(toolUseId: string, isError: boolean, content?: string): ToolLoopVerdict | null;
  /** True once a WARN verdict has been returned. */
  readonly warned: boolean;
  /** True once a HALT verdict has been returned. */
  readonly halted: boolean;
}

// Defaults. The repeat thresholds are intentionally lower than the consecutive
// ones: re-running the IDENTICAL failing action is a stronger loop signal than
// a streak of different-but-failing actions, so it should trip sooner. All are
// generous enough that ordinary iterative work (try, fail, fix, succeed) never
// crosses them — a real fix changes the signature and lands a success, both of
// which break the count.
const DEFAULTS = {
  warnConsecutive: 5,
  haltConsecutive: 10,
  warnRepeat: 4,
  haltRepeat: 8,
} as const;

// Cap on the tool_use bookkeeping map. A run can make thousands of tool calls;
// we only ever need the signature of a call that is about to be answered by a
// result, and results follow their use closely. Keeping the most-recent N
// bounds memory to O(1) regardless of run length. 512 comfortably spans any
// realistic in-flight window between a use and its result.
const MAX_TRACKED_USES = 512;

// Cap on the per-signature failure tally. Bounds memory for runs that fail
// many DISTINCT actions (each a new signature) without ever repeating one.
// Distinct failures are caught by the consecutive trigger, not this map, so
// evicting the oldest distinct signatures loses nothing the guard acts on.
const MAX_TRACKED_SIGNATURES = 512;

const SIGNATURE_MAX_LEN = 160;

/** Collapse runs of whitespace to single spaces and trim — so trivially
 *  reformatted-but-identical actions still hash to the same signature. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

// Tools whose SUCCESS changes state and therefore counts as real progress: a
// successful one clears the repeated-failure tally. A successful read-only tool
// (Read/Glob/LS/Grep/TodoWrite/…) is NOT progress on a failing action, so it
// must not clear the tally, or a fixation loop that re-reads between identical
// failing calls would reset every round and never trip. Matched
// case-insensitively; names span the agents OD drives (Claude, Codex/OpenCode,
// Copilot, ACP).
const MUTATING_TOOL_NAMES = new Set([
  'edit',
  'write',
  'multiedit',
  'notebookedit',
  'apply_patch',
  'applypatch',
  'str_replace',
  'str_replace_editor',
  'create',
  'create_file',
  'write_file',
  'edit_file',
  'update_file',
  'insert',
  'patch',
  'delete_file',
]);

/** Whether a SUCCESSFUL call of this tool represents progress (state changed),
 *  as opposed to a read-only inspection. See MUTATING_TOOL_NAMES. */
export function isMutatingToolName(name: string): boolean {
  return MUTATING_TOOL_NAMES.has((name ?? '').trim().toLowerCase());
}

/**
 * Build a stable signature for a tool call from its name + input. Prefers the
 * one field that identifies the ACTION an agent would keep retrying:
 *   - Bash            → the command
 *   - Edit/Write/Read → the file path (plus the search string for Edit, since
 *                       re-running Edit on the same file with a different
 *                       old_string is legitimate progress, not a loop)
 *   - anything else   → a stable stringify of the whole input
 * Falls back to the tool name alone when there is no usable input. The result
 * is whitespace-collapsed but NOT length-capped: it is the dedup key, so it
 * must stay full-fidelity or two distinct long actions sharing a prefix would
 * collide and pool each other's failures. Use `displayToolSignature` for the
 * bounded form surfaced in the `tool_loop` event.
 */
export function computeToolSignature(name: string, input: unknown): string {
  const toolName = name || 'tool';
  let detail = '';
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const command = record.command;
    const filePath = record.file_path ?? record.filePath ?? record.path;
    const oldString = record.old_string ?? record.oldString;
    if (typeof command === 'string') {
      detail = command;
    } else if (typeof filePath === 'string') {
      detail = typeof oldString === 'string' ? `${filePath} :: ${oldString}` : filePath;
    } else {
      try {
        const serialized = JSON.stringify(record) ?? '';
        // An empty object carries no action identity — sign as the tool name
        // alone so e.g. ExitPlanMode {} clusters with other ExitPlanMode calls.
        detail = serialized === '{}' ? '' : serialized;
      } catch {
        // Circular / non-serializable input — name alone still gives a usable
        // (coarser) signature, and the consecutive trigger backs it up.
        detail = '';
      }
    }
  } else if (typeof input === 'string') {
    detail = input;
  }
  return detail ? `${toolName} ${collapseWhitespace(detail)}` : toolName;
}

/**
 * Bound a full signature to a human-readable length for the emitted
 * `tool_loop` event. Only the DISPLAY form is truncated; the full signature
 * from `computeToolSignature` remains the dedup key, so two long actions that
 * share a 160-char prefix still count separately.
 */
export function displayToolSignature(signature: string): string {
  return signature.length > SIGNATURE_MAX_LEN
    ? `${signature.slice(0, SIGNATURE_MAX_LEN - 1)}…`
    : signature;
}

/**
 * Create a run-scoped tool-loop guard. See the module docblock for the
 * detection model. Usage in the run loop:
 *
 *   const guard = createToolLoopGuard({ mode: resolveToolLoopMode() });
 *   // on tool_use:    guard.observeToolUse(ev.id, ev.name, ev.input);
 *   // on tool_result: const v = guard.observeToolResult(ev.toolUseId, ev.isError, ev.content);
 *   //                 if (v) { send('agent', v); if (v.action === 'halt') abortForToolLoop(v); }
 */
export function createToolLoopGuard(options: ToolLoopGuardOptions = {}): ToolLoopGuard {
  const mode: ToolLoopMode = options.mode ?? 'halt';
  const warnConsecutive = options.warnConsecutive ?? DEFAULTS.warnConsecutive;
  const haltConsecutive = options.haltConsecutive ?? DEFAULTS.haltConsecutive;
  const warnRepeat = options.warnRepeat ?? DEFAULTS.warnRepeat;
  const haltRepeat = options.haltRepeat ?? DEFAULTS.haltRepeat;

  // id -> { name, signature } for in-flight tool calls, capped (insertion-order
  // Map eviction).
  const uses = new Map<string, { name: string; signature: string }>();
  // signature -> cumulative failure count across the run, capped.
  const failCounts = new Map<string, number>();

  let consecutiveErrors = 0;
  let _warned = false;
  let _halted = false;

  function evict<K, V>(map: Map<K, V>, cap: number): void {
    while (map.size > cap) {
      const oldest = map.keys().next().value as K | undefined;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }

  return {
    get warned() {
      return _warned;
    },
    get halted() {
      return _halted;
    },

    observeToolUse(id, name, input) {
      if (mode === 'off' || _halted) return;
      if (!id) return;
      uses.set(id, { name: name || 'tool', signature: computeToolSignature(name, input) });
      evict(uses, MAX_TRACKED_USES);
    },

    observeToolResult(toolUseId, isError, content) {
      if (mode === 'off' || _halted) return null;

      const use = toolUseId ? uses.get(toolUseId) : undefined;
      if (toolUseId) uses.delete(toolUseId);

      // A success always breaks the strictly-consecutive error streak. Whether
      // it also clears the per-signature failure tally depends on whether it was
      // real PROGRESS:
      //   - a successful mutating call (Edit/Write/apply_patch/…) changed state,
      //     so prior failure tallies are stale -> clear them all. This keeps the
      //     normal "edit -> rerun the check -> fix -> rerun" workflow from ever
      //     accumulating to the ceiling.
      //   - the exact action that was failing finally succeeding is that action
      //     recovering -> drop just its tally.
      //   - any OTHER success (a read-only Read/Glob/LS/Grep, a TodoWrite) is NOT
      //     progress on a failing action, so the tallies are kept. Without this a
      //     fixation loop that re-reads between identical failing calls
      //     (fail -> read(ok) -> same fail -> …) would reset every round and
      //     never trip — exactly the "re-read, retry the same wrong assumption"
      //     shape from the motivating report. (PR #3375 review.)
      if (!isError) {
        consecutiveErrors = 0;
        if (use && isMutatingToolName(use.name)) {
          failCounts.clear();
        } else if (use && failCounts.has(use.signature)) {
          failCounts.delete(use.signature);
        }
        return null;
      }

      const toolName = use?.name ?? 'tool';
      // Prefer the use's action signature. If the use was evicted/never seen
      // (e.g. a result with no matching use), fall back to a signature derived
      // from the tool name + a slice of the error content so identical repeated
      // errors still cluster.
      const signature =
        use?.signature ??
        computeToolSignature(toolName, typeof content === 'string' ? content : undefined);

      consecutiveErrors += 1;
      const repeatCount = (failCounts.get(signature) ?? 0) + 1;
      failCounts.set(signature, repeatCount);
      evict(failCounts, MAX_TRACKED_SIGNATURES);
      // Truncate only for the emitted event; `signature` (full) stays the key.
      const displaySignature = displayToolSignature(signature);

      // HALT first (only in halt mode): the hard ceiling supersedes a warn so a
      // run that blew straight past both thresholds is torn down, not merely
      // warned. Pick the reason whose ceiling was actually crossed, preferring
      // the repeat trigger (a more specific signal than a mixed error streak).
      if (mode === 'halt') {
        const repeatHalt = repeatCount >= haltRepeat;
        const consecutiveHalt = consecutiveErrors >= haltConsecutive;
        if (repeatHalt || consecutiveHalt) {
          _halted = true;
          _warned = true; // a halt is also, implicitly, the strongest warning
          return repeatHalt
            ? { type: 'tool_loop', reason: 'repeated-failure', action: 'halt', toolName, signature: displaySignature, count: repeatCount }
            : { type: 'tool_loop', reason: 'consecutive-errors', action: 'halt', toolName, signature: displaySignature, count: consecutiveErrors };
        }
      }

      if (!_warned) {
        const repeatWarn = repeatCount >= warnRepeat;
        const consecutiveWarn = consecutiveErrors >= warnConsecutive;
        if (repeatWarn || consecutiveWarn) {
          _warned = true;
          return repeatWarn
            ? { type: 'tool_loop', reason: 'repeated-failure', action: 'warn', toolName, signature: displaySignature, count: repeatCount }
            : { type: 'tool_loop', reason: 'consecutive-errors', action: 'warn', toolName, signature: displaySignature, count: consecutiveErrors };
        }
      }

      return null;
    },
  };
}

/**
 * Resolve the guard mode from the environment. `OD_TOOL_LOOP_GUARD` accepts
 * `halt` (default), `warn`, or `off`; anything else falls back to the default
 * so a typo never silently disables the guard. Mirrors the OD_*_GUARD
 * convention used elsewhere (e.g. OD_ARTIFACT_STUB_GUARD).
 */
export function resolveToolLoopMode(env: NodeJS.ProcessEnv = process.env): ToolLoopMode {
  const raw = (env.OD_TOOL_LOOP_GUARD ?? '').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'halt') return raw;
  return 'halt';
}
