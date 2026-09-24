import type { AgentEvent, ChatMessage } from '../types';
import { toolCategoryForName } from '../components/ToolCard';

/** One tool call, reduced to the line the Design Files empty state shows. */
export interface RunProgressStep {
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
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.role === 'user') return [];
    if (message.role !== 'assistant') continue;
    return stepsFromEvents(message.events ?? []);
  }
  return [];
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
