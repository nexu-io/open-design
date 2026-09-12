import { buildTurnBlocks } from './chat/build-turn-blocks';
import { splitOnQuestionForms } from '../artifacts/question-form';
import type { AgentEvent, ChatMessage } from '../types';
import { toolCategoryForName } from '../components/ToolCard';

/** One tool call, reduced to the line the Design Files empty state shows. */
export interface RunProgressStep {
  /** Current plan title, shared with the chat execution record. */
  title?: string;
  /** Latest write location, independent of the displayed activity. */
  location?: { file: string | null; anchor: string | null };
  /** The `tool_use` id — stable across re-renders of the same streamed turn. */
  id: string;
  /** Drives the verb ("Editing" / "Running" / …) the caller renders. */
  category: ReturnType<typeof toolCategoryForName>;
  /** Raw tool name, so an unclassified call can still name itself. */
  toolName: string;
  /** What the step acted on — file basename, command, query — already short. */
  target: string | null;
  /**
   * A literal run of visible text this step wrote into an HTML page, used to
   * find the change inside a live preview. Null for every step that wrote no
   * HTML text — a read, a command, a CSS edit.
   *
   * It comes from the tool's OWN input rather than from diffing the file: the
   * `file-changed` event that reloads a preview arrives after the write
   * settles, by which point this `tool_use` is already on the message, so the
   * text is free. (The HTML source snapshot cache cannot help — it is
   * invalidated project-wide on every file change.)
   */
  anchor: string | null;
}

/** What a turn is doing before it has produced anything — the same three
 *  states the chat footer names under the assistant's avatar. */
export type RunPhase = 'preparing' | 'thinking' | 'working';

/**
 * The phase of the last assistant turn.
 *
 * This is the other pane's half of ONE status. The chat footer
 * (`AssistantFooter`) says "preparing" until the turn produces something,
 * swaps to "thinking" once the run reports that it is reasoning, and to
 * "working" the moment real content lands. The Design Files surfaces used to
 * say a flat "thinking" through all three, so the two sides of the split
 * disagreed about the same run: the chat column read "Preparing…" while the
 * ring beside it read "Thinking".
 *
 * Content is what the turn actually produced — prose, reasoning, a tool call,
 * an artifact. `status` / `usage` / `diagnostic` events are the run talking
 * about itself, not output, which is why a "thinking" STATUS only changes the
 * wording while a "thinking" BLOCK means the turn is already working.
 */
export function runProgressPhase(messages: ChatMessage[]): RunPhase {
  const message = lastAssistantTurn(messages);
  return message ? phaseFromEvents(message.events ?? []) : 'preparing';
}

function phaseFromEvents(events: AgentEvent[]): RunPhase {
  let reportedThinking = false;
  for (const event of events) {
    if (!event) continue;
    if (event.kind === 'text') {
      if (event.text.trim()) return 'working';
      continue;
    }
    if (
      event.kind === 'thinking' ||
      event.kind === 'tool_use' ||
      event.kind === 'live_artifact' ||
      event.kind === 'plugin_candidate'
    ) {
      return 'working';
    }
    if (event.kind === 'status' && event.label === 'thinking') reportedThinking = true;
  }
  return reportedThinking ? 'thinking' : 'preparing';
}

/**
 * The title of the question the last turn is waiting on, or null.
 *
 * A turn that ends by asking (`<question-form>`) is finished but NOT done: the
 * run stopped because it needs an answer. The pane's ring showed nothing at
 * all in that state — the field just turned — while the chat column beside it
 * held an open form. The title is the one line that says what the wait is
 * about.
 *
 * Only the very last message counts, and only if it is the assistant's: the
 * moment the user replies their message is last, the form is answered, and
 * there is nothing to wait for.
 */
export function pendingQuestionTitle(messages: ChatMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  const content = last.content;
  if (!content) return null;
  // The LAST form in the turn: a turn that asks twice is waiting on the
  // second one.
  let title: string | null = null;
  for (const segment of splitOnQuestionForms(content)) {
    if (segment.kind !== 'form') continue;
    const next = segment.form.title.trim();
    if (next) title = next;
  }
  return title;
}

/** How the last turn ENDED when it did not end well — the two terminal states
 *  the chat's own task card puts a heading on. */
export type RunFailure = 'failed' | 'canceled';

/**
 * The last turn's failure, or null.
 *
 * The ring reports the work, and a run that DIED is still something the work
 * did: the pane used to go blank the moment a failed turn settled, so the chat
 * column carried a red "Run failed" header while the field beside it just
 * turned, saying nothing had happened. This is the same read
 * `TaskActivityCard` makes — the same message fields, in the same order, so
 * one run can never be headed "Run failed" on one side of the split and
 * nothing at all on the other.
 *
 * A turn still in flight is not a failure (`running` owns that state), and a
 * user message on top means the next turn has not started, so the one before
 * it is history.
 */
export function runFailureState(messages: ChatMessage[]): RunFailure | null {
  const message = lastAssistantTurn(messages);
  if (!message) return null;
  if (message.runStatus === 'canceled') return 'canceled';
  if (message.runStatus === 'failed') return 'failed';
  // The result never reached the conversation. The turn may have run fine
  // upstream; from here it produced nothing, which is the failure.
  if (
    message.resultDeliveryState === 'no_result' ||
    message.resultDeliveryState === 'delivery_failed'
  ) {
    return 'failed';
  }
  // Anything else the run said about itself is either a success or a state
  // that has not settled yet.
  if (message.runStatus) return null;
  // No terminal status of its own — an older message, or a run whose end never
  // came back. The card falls back to the tool calls, and so does this: one
  // that came back an error, or (in a turn that never reported an end) one
  // that never came back at all.
  const events = message.events ?? [];
  const settled = new Set<string>();
  for (const event of events) {
    if (event.kind !== 'tool_result') continue;
    if (event.isError) return 'failed';
    settled.add(event.toolUseId);
  }
  if (message.endedAt) return null;
  for (const event of events) {
    if (event.kind === 'tool_use' && !settled.has(event.id)) return 'failed';
  }
  return null;
}

/** The turn the Design Files surfaces are reporting on: the newest assistant
 *  message, unless the user has already spoken after it. */
function lastAssistantTurn(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.role === 'user') return null;
    if (message.role !== 'assistant') continue;
    return message;
  }
  return null;
}

/** Steps kept for the trail. Older ones are off-screen behind the fade anyway. */
const MAX_STEPS = 12;
/** A target longer than this is a command line or a URL; elide the tail. */
const MAX_TARGET_CHARS = 44;

/**
 * What the agent is doing right now, newest first.
 *
 * This is the whole of what the Design Files empty state puts inside its
 * particle ring: the head of the list is the current step and the rest is the
 * trail behind it, so the pane says "editing index.html, after reading two
 * files" instead of a static "thinking". (The ring used to carry the user's
 * own prompt above this; it no longer does — that sentence belongs to the chat
 * column.)
 *
 * A pure reducer over the conversation: the panel needs no chat wiring of its
 * own, and a streamed `tool_use` shows up as soon as it lands in the message's
 * events.
 *
 * Only the LAST assistant turn is read. Steps from the turn before are history,
 * not progress, and the panel would be claiming work it is no longer doing.
 */
export function runProgressSteps(messages: ChatMessage[]): RunProgressStep[] {
  const message = lastAssistantTurn(messages);
  if (!message) return [];
  const events = message.events ?? [];
  const toolSteps = stepsFromEvents(events);
  const write = [...events].reverse().find((event) => event.kind === 'tool_use'
    && ['edit', 'write'].includes(toolCategoryForName(event.name)));
  const fields = write?.kind === 'tool_use' && write.input && typeof write.input === 'object'
    ? write.input as Record<string, unknown> : null;
  const location = write?.kind === 'tool_use' ? {
    file: fields ? firstString(fields, ['file_path', 'filePath', 'path', 'notebook_path']) : null,
    anchor: anchorFor(toolCategoryForName(write.name), write.input),
  } : undefined;
  const blocks = buildTurnBlocks({ events, runStatus: 'running' });
  for (const block of [...blocks].reverse()) {
    if (block.kind !== 'shell') continue;
    const segment = block.segments.find((item) => item.status === 'in_progress')
      ?? block.segments.find((item) => item.status === 'pending');
    if (segment) {
      return [{
        id: `plan:${block.id}:${segment.content}`,
        title: segment.content,
        location,
        category: 'todo', toolName: 'TodoWrite', target: null, anchor: null,
      }];
    }
  }
  return toolSteps.map((step) => ({ ...step, location }));
}

function stepsFromEvents(events: AgentEvent[]): RunProgressStep[] {
  const steps: RunProgressStep[] = [];
  // Backwards: the newest step leads, and the cap then drops the oldest.
  for (let i = events.length - 1; i >= 0 && steps.length < MAX_STEPS; i--) {
    const event = events[i];
    if (!event || event.kind !== 'tool_use') continue;
    const category = toolCategoryForName(event.name);
    // The todo list has its own pinned card above the composer; repeating it
    // here would spend trail lines on a state the user is already watching.
    if (category === 'todo') continue;
    steps.push({
      id: event.id,
      category,
      toolName: event.name,
      target: targetFor(category, event.input),
      anchor: anchorFor(category, event.input),
    });
  }
  return steps;
}

/** Longest tail of a Write we bother scanning. The end of the file is where a
 *  freshly written page's newest content is, and a whole document per streamed
 *  event is more work than this reducer should ever do. */
const MAX_ANCHOR_SOURCE_CHARS = 4096;
/** Anchors longer than this stop being cheaper than the document itself. */
const MAX_ANCHOR_CHARS = 96;
/** Shorter runs match too much — "Save", "OK" — and would point anywhere. */
const MIN_ANCHOR_CHARS = 8;

/**
 * The text a preview can be scrolled to, taken from what this step wrote.
 *
 * Only write/edit steps on an HTML file qualify: everything else has nothing to
 * point at in a rendered page. The LAST visible run is chosen because that is
 * the deepest point the step reached — for a whole-file write it lands near the
 * bottom of the page, which is what "it is building this part now" means.
 */
function anchorFor(
  category: ReturnType<typeof toolCategoryForName>,
  input: unknown,
): string | null {
  if (category !== 'write' && category !== 'edit') return null;
  if (!input || typeof input !== 'object') return null;
  const fields = input as Record<string, unknown>;
  const path = firstString(fields, ['file_path', 'filePath', 'path']);
  if (!path || !/\.html?$/i.test(path)) return null;
  const written = writtenText(fields);
  if (!written) return null;
  return longestVisibleRun(written.slice(-MAX_ANCHOR_SOURCE_CHARS));
}

/** The HTML this step put on disk: an edit's replacement, a multi-edit's last
 *  replacement, or a write's whole body. */
function writtenText(fields: Record<string, unknown>): string | null {
  const single = firstString(fields, ['new_string', 'newString', 'content', 'contents']);
  if (single) return single;
  const edits = fields.edits;
  if (Array.isArray(edits)) {
    for (let i = edits.length - 1; i >= 0; i--) {
      const edit = edits[i];
      if (!edit || typeof edit !== 'object') continue;
      const text = firstString(edit as Record<string, unknown>, ['new_string', 'newString']);
      if (text) return text;
    }
  }
  return null;
}

/** Strip the markup and return the last run of real words in what is left.
 *  Script and style bodies go first: their text is never on the page. */
function longestVisibleRun(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?(?:<\/script>|$)/gi, ' ')
    .replace(/<style[\s\S]*?(?:<\/style>|$)/gi, ' ')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<[^>]*>/g, '\n')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');
  let best: string | null = null;
  for (const line of text.split('\n')) {
    const run = line.replace(/\s+/g, ' ').trim();
    if (run.length < MIN_ANCHOR_CHARS) continue;
    // Later wins: the tail of the write is the part being built now.
    best = run;
  }
  if (!best) return null;
  return best.length > MAX_ANCHOR_CHARS ? best.slice(0, MAX_ANCHOR_CHARS).trimEnd() : best;
}

function targetFor(
  category: ReturnType<typeof toolCategoryForName>,
  input: unknown,
): string | null {
  if (!input || typeof input !== 'object') return null;
  const fields = input as Record<string, unknown>;
  if (category === 'write' || category === 'edit' || category === 'read') {
    const path = firstString(fields, ['file_path', 'filePath', 'path', 'notebook_path']);
    return path ? shorten(basename(path)) : null;
  }
  if (category === 'run') {
    const command = firstString(fields, ['command', 'cmd', 'script']);
    // Multi-line scripts are heredocs and pipelines; the first line names it.
    return command ? shorten(command.split('\n')[0]!.trim()) : null;
  }
  if (category === 'search') {
    const query = firstString(fields, ['pattern', 'query', 'q', 'path']);
    return query ? shorten(query) : null;
  }
  if (category === 'fetch') {
    const url = firstString(fields, ['url', 'uri']);
    return url ? shorten(hostAndPath(url)) : null;
  }
  return null;
}

function firstString(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** `https://example.com/a/b?c=1` → `example.com/a/b`. Falls back to the raw
 *  string when the value is not a parseable absolute URL. */
function hostAndPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function shorten(value: string): string {
  return value.length > MAX_TARGET_CHARS
    ? `${value.slice(0, MAX_TARGET_CHARS).trimEnd()}…`
    : value;
}
