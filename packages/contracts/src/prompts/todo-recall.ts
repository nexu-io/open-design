/**
 * The unfinished-work handoff block — the one channel that carries "what was
 * still open when the previous turn ended" back to the agent.
 *
 * Why this exists at all: nothing else in the pipeline can carry it. The
 * conversation history the daemon renders (`buildDaemonTranscript`) is plain
 * text built from `message.content`, and `content` only accumulates
 * `kind === 'text'` events. A task list is a `tool_use`, so it can never reach
 * the transcript. The 21 runtimes without native session resume therefore start
 * every turn with zero knowledge of the plan they wrote one turn earlier.
 *
 * Why it lives HERE and not in the system prompt: the stable instruction slice
 * (see `stable-sections.ts` in the daemon) is hashed per conversation and
 * re-sent only when it changes; upstream prompt caching keys off exactly that
 * prefix. A list that changes every turn would move the prefix every turn — a
 * guaranteed cache miss on every turn of every conversation. The per-turn user
 * body carries no such penalty.
 *
 * Why it lives in CONTRACTS and not in the daemon: the daemon composes one user
 * body for both execution profiles (`filesystem` CLI runs and `plain`
 * API/BYOK runs). Keeping the single renderer here makes "the two modes say the
 * same thing" structurally true instead of a rule someone has to remember. The
 * wording is deliberately tool-agnostic for the same reason — API mode has no
 * TodoWrite (see `API_MODE_OVERRIDE` in ./system.ts), so this block must never
 * name a tool.
 *
 * Tone contract: this block STATES A FACT and HANDS THE DECISION BACK. It is
 * not an instruction to resume. Whether this turn picks the work back up,
 * replans it, or ignores it because the user moved on is the agent's call —
 * that is the product's explicit shape. The client side does not decide
 * anything either: it only recognizes items the agent chose to re-emit.
 *
 * Why the block carries the FINISHED items too, not just the open ones: the
 * client renders a re-emitted plan against what earlier turns declared, and
 * spec §5.2 gives "召回 · 上一轮就完成的" its own row — a struck, non-expandable
 * step. That row can only ever appear if the agent re-lists the finished items,
 * and it can only re-list what it was told. Handing back the open items alone
 * made the agent's next plan a strict subset of its own earlier one: the four
 * steps it stopped in the middle of came back as two, so the pill said "step 3
 * of 4" while the card below it said "2 steps". The snapshot is handed over
 * whole, each line stamped with the status it stopped at, and the gate below
 * still asks only about the OPEN ones — a plan that finished cleanly injects
 * nothing, exactly as before.
 */

import {
  isTodoWriteToolName,
  todoItemsFromTodoWriteInput,
  todoStatusIsUnfinished,
} from '../api/run-completeness.js';

/** One carried-over task: the agent's own wording plus the status it stopped at. */
export interface RecalledTodo {
  content: string;
  status: string;
}

/**
 * Heading the block opens with. Exported so callers can detect/strip it.
 *
 * It names the SNAPSHOT, not the open subset: the list below includes the items
 * that were already finished, and a heading promising "unfinished tasks" over a
 * row stamped `[completed]` is exactly the contradiction that would push a model
 * into redoing settled work.
 */
export const TODO_RECALL_HEADING = "## Where an earlier turn's task list stood";

/**
 * A task list item's wording, across the shapes different runtimes emit.
 * Mirrors `parseTodoWriteInput` in apps/web/src/runtime/todos.ts — the two must
 * agree, because the client matches recall by exact content string (D17) and a
 * field the daemon read differently would break that match.
 */
function todoContent(todo: unknown): string {
  if (!todo || typeof todo !== 'object') return '';
  const record = todo as Record<string, unknown>;
  for (const key of ['content', 'step', 'description', 'label', 'text']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function todoStatus(todo: unknown): string {
  if (!todo || typeof todo !== 'object') return 'pending';
  const record = todo as Record<string, unknown>;
  if (record.completed === true) return 'completed';
  return typeof record.status === 'string' && record.status ? record.status : 'pending';
}

/**
 * A TodoWrite tool_use's raw `input` as the plan it is — every item, in the
 * agent's own order, each carrying the status it stopped at.
 *
 * Deliberately UNFILTERED. Selecting the open subset here is what made the
 * finished steps unrecoverable: they were dropped one call before the prompt
 * was built, so no amount of wording downstream could put them back. Which
 * items matter is a question the RENDERER answers, once, where the reader can
 * see both the answer and the list it applies to.
 */
export function recalledTodosFromTodoWriteInput(input: unknown): RecalledTodo[] {
  const items = todoItemsFromTodoWriteInput(input);
  if (!Array.isArray(items)) return [];
  const out: RecalledTodo[] = [];
  for (const item of items) {
    const content = todoContent(item);
    if (!content) continue;
    out.push({ content, status: todoStatus(item) });
  }
  return out;
}

/**
 * The most recent TodoWrite tool_use `input` inside one message's persisted
 * event array, or `null` when that message declared no task list. Persisted
 * events carry `kind`, not the live stream's `type`.
 */
export function latestTodoWriteInputFromEvents(events: unknown): unknown | null {
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event || typeof event !== 'object') continue;
    const record = event as { kind?: unknown; name?: unknown; input?: unknown };
    if (record.kind !== 'tool_use' || !isTodoWriteToolName(record.name)) continue;
    return record.input ?? null;
  }
  return null;
}

/**
 * Render the handoff block, or `null` when nothing was left open.
 *
 * THE GATE lives here, and it asks about the OPEN items only — `todos` is the
 * whole snapshot, so "is there anything to hand back?" cannot be answered by
 * its length. A plan whose every item reads `completed` is a plan that ended,
 * and it injects nothing.
 *
 * `null` is load-bearing: the caller must then produce a user body that is
 * BYTE-IDENTICAL to the pre-feature one, so a conversation with no outstanding
 * work cannot shift a single prompt byte.
 *
 * The wording has one job beyond stating the facts — keeping the finished items
 * from being read as a queue. They are named as done, in the same sentence that
 * says not to redo them, before the list is ever shown; the decision handed back
 * is about the OPEN items only. The ask to re-list the plan whole, finished rows
 * still marked completed, is what lets the client show the user the same four
 * steps it showed them last turn instead of a plan that silently shrank.
 */
export function renderUnfinishedTodoRecall(
  todos: readonly RecalledTodo[] | null | undefined,
): string | null {
  if (!todos || todos.length === 0) return null;
  if (!todos.some((todo) => todoStatusIsUnfinished(todo.status))) return null;
  const lines = todos.map(
    (todo, index) => `${index + 1}. [${todo.status}] ${todo.content}`,
  );
  return [
    TODO_RECALL_HEADING,
    '',
    'This is the most recent task list this conversation declared, exactly as it stood when that turn ended. Items marked `completed` are already finished — that work exists, so do not redo it. Items with any other status were still open.',
    '',
    ...lines,
    '',
    'This is context, not an instruction, and the user did not write it. You decide what this turn does with the open items: pick them back up, replan them, or leave them alone because the user is asking about something else now.',
    '',
    "If you do pick any of them back up, list the whole plan again in this turn's task list using the original wording above, with the already-finished items still marked completed, so the user sees the same plan and how far it got. Do not mention this note itself to the user.",
  ].join('\n');
}
