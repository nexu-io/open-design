/**
 * Canonical "did the run's declared work actually finish?" predicate.
 *
 * ONE definition, shared by the daemon run classifier (which stamps
 * `endedWithUnfinishedWork` onto the run/message) and the web chat footer
 * (`unfinishedTodosFromEvents` in apps/web/src/runtime/todos.ts). If these two
 * drifted, the lower-left status surfaces (Pet task center, project pill) could
 * read "Completed" while the chat footer reads "Stopped with unfinished work" —
 * the exact bug (#1247 / #1060) this module exists to make unrepresentable.
 *
 * A TodoWrite task counts as UNFINISHED when its status is anything other than
 * `completed` — i.e. `pending`, `in_progress`, or `stopped` (a task the agent
 * marked failed/canceled). This mirrors the web footer's `status !== 'completed'`
 * filter exactly. Do not narrow this to "pending or in_progress only": excluding
 * `stopped` would make a stopped-only run read "unfinished" in the footer but
 * "Completed" on the pill/Pet widget, reintroducing the divergence.
 */

/** Turn-terminal stop reasons that mean the model was cut off mid-generation
 *  rather than finishing cleanly. A run truncated here is incomplete even if its
 *  last TodoWrite looked done. Shared by the daemon capture path and the persisted
 *  events predicate so the live and reloaded verdicts agree. */
export const MID_TURN_TRUNCATION_STOP_REASONS: ReadonlySet<string> = new Set([
  'max_tokens',
  'max_output_tokens',
]);

/** True when a turn stop reason indicates a mid-generation truncation. */
export function stopReasonIsTruncation(stopReason: unknown): boolean {
  return typeof stopReason === 'string' && MID_TURN_TRUNCATION_STOP_REASONS.has(stopReason);
}

/** True when a single TodoWrite task status represents unfinished work. */
export function todoStatusIsUnfinished(status: unknown): boolean {
  return status !== 'completed';
}

/**
 * True when a TodoWrite `todos` snapshot contains any unfinished task.
 *
 * `todos` is the raw `input.todos` array from a `TodoWrite` tool_use event.
 * A non-array (no plan emitted) is NOT unfinished — the absence of a declared
 * plan means a text-only answer, which must stay "Completed". An empty array is
 * likewise finished.
 */
export function todoSnapshotHasUnfinishedWork(todos: unknown): boolean {
  if (!Array.isArray(todos)) return false;
  return todos.some(
    (todo) =>
      Boolean(todo) &&
      typeof todo === 'object' &&
      todoStatusIsUnfinished((todo as { status?: unknown }).status),
  );
}

/** A TodoWrite tool_use carries its task list under `todos` (Claude / codex
 *  normalized) or `plan` (update_plan style). Mirrors parseTodoWriteInput in
 *  apps/web/src/runtime/todos.ts, which accepts both. */
function todoItemsFromToolInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as { todos?: unknown; plan?: unknown };
  if (Array.isArray(record.todos)) return record.todos;
  if (Array.isArray(record.plan)) return record.plan;
  return undefined;
}

/** TodoWrite surfaces under several tool aliases across runtimes. Mirrors
 *  isTodoWriteToolName in apps/web/src/runtime/todos.ts. */
export function isTodoWriteToolName(name: unknown): boolean {
  return (
    name === 'TodoWrite' ||
    name === 'todowrite' ||
    name === 'todo_write' ||
    name === 'update_plan'
  );
}

/**
 * Derive "ended with unfinished declared work" from a run's PERSISTED agent
 * events (the `events_json` the daemon writes per event, and the same array the
 * web chat footer reads). Finds the LAST TodoWrite tool_use snapshot and applies
 * the canonical predicate. Returns false when the run emitted no TodoWrite at all
 * (a text-only answer stays "Completed").
 *
 * This lets the project-status projection judge completeness from data that
 * already survives reload — no extra column — while reusing the exact predicate
 * the footer uses, so the two can never disagree (#1247 / #1060).
 */
export function eventsEndedWithUnfinishedWork(events: unknown): boolean {
  if (!Array.isArray(events)) return false;
  // A max_tokens truncation is recorded on the persisted `usage` event's
  // stopReason. It flags the run incomplete regardless of the TodoWrite state,
  // so a generation cut off mid-stream never reads "Completed" — even after the
  // in-memory run ages out.
  for (const event of events) {
    if (
      event &&
      typeof event === 'object' &&
      (event as { kind?: unknown }).kind === 'usage' &&
      stopReasonIsTruncation((event as { stopReason?: unknown }).stopReason)
    ) {
      return true;
    }
  }
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (
      !event ||
      typeof event !== 'object' ||
      (event as { kind?: unknown }).kind !== 'tool_use' ||
      !isTodoWriteToolName((event as { name?: unknown }).name)
    ) {
      continue;
    }
    return todoSnapshotHasUnfinishedWork(
      todoItemsFromToolInput((event as { input?: unknown }).input),
    );
  }
  return false;
}

/** Extract a TodoWrite tool_use's task array from its input, whether the tool
 *  emitted `todos` or `plan`. Exposed so the daemon capture path folds the same
 *  shape the projection later reads. */
export function todoItemsFromTodoWriteInput(input: unknown): unknown {
  return todoItemsFromToolInput(input);
}
