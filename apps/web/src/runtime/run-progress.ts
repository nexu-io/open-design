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
}

/** Steps kept for the trail. Older ones are off-screen behind the fade anyway. */
const MAX_STEPS = 12;
/** A target longer than this is a command line or a URL; elide the tail. */
const MAX_TARGET_CHARS = 44;

/**
 * What the agent is doing right now, newest first.
 *
 * The Design Files empty state echoes the user's prompt while the agent works
 * (see `./latest-user-prompt`); this is the other half — the progress under it.
 * The head of the list is the current step and the rest is the trail below it,
 * so the pane says "editing index.html, after reading two files" instead of a
 * static "thinking".
 *
 * A pure reducer over the conversation, same as `latestUserPromptText`: the
 * panel needs no chat wiring of its own, and a streamed `tool_use` shows up as
 * soon as it lands in the message's events.
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
    });
  }
  return steps;
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
