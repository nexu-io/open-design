/**
 * Per-tool renderer registry — the open-design analogue of CopilotKit's
 * `useCopilotAction({ render })` and AG-UI's tool render-prop contract.
 *
 * Built-in tools (Read/Write/Edit/Bash/...) keep their hand-tuned cards in
 * `ToolCard.tsx`. The registry is the extension point for everything else:
 * skill-emitted tools, MCP-style external tools, future plugins. Anything
 * registered here is consulted *before* the hardcoded family ladder, so a
 * third party can override a built-in if they really want to.
 *
 * The render-prop shape mirrors AG-UI:
 *   ({ status, name, args, result, isError }) => ReactNode
 * where `status` is the four-state lifecycle agreed across LangGraph,
 * CrewAI, and OpenAI tool calls.
 */
import type { ReactNode } from 'react';
import type { AgentEvent } from '../types';

export type ToolStatus = 'inProgress' | 'executing' | 'complete' | 'error';

type ToolUse = Extract<AgentEvent, { kind: 'tool_use' }>;
type ToolResult = Extract<AgentEvent, { kind: 'tool_result' }>;

export interface ToolRenderProps {
  status: ToolStatus;
  name: string;
  args: unknown;
  result: string | undefined;
  isError: boolean;
}

/**
 * Tool render callback. Mirrors AG-UI's `({ status, args, result, ... })`
 * render-prop shape and CopilotKit's `useCopilotAction({ render })`.
 *
 * The callback runs inside `ToolCard`'s render — it is *not* mounted as
 * its own component. Two implications follow from that:
 *
 *   1. **Renderers must be hook-free.** Calling React hooks here would
 *      weld them into `ToolCard`'s hook sequence, so any swap (skill
 *      hot-reload, fallback when the renderer returns null/false, or a
 *      replacement renderer with a different hook shape) would violate
 *      the Rules of Hooks and crash the surrounding assistant message.
 *   2. **If you need hooks**, return a component element. Wrap your
 *      hookful UI in a component and have the renderer return that
 *      element: `(props) => <MyHookfulCard {...props} />`. The element
 *      is mounted as a child, giving React stable hook ownership across
 *      re-registers.
 *
 * Returning `null` / `undefined` / `false` defers to the next step in
 * the lookup ladder (built-in family card, then generic fallback).
 */
export type ToolRenderer = (props: ToolRenderProps) => ReactNode;

const renderers = new Map<string, ToolRenderer>();

/**
 * Register a renderer for a tool name. Returns an unregister handle so
 * tests / hot-reloads can dispose cleanly.
 *
 * Names are matched case-sensitively against `tool_use.name` (mirrors the
 * agent's wire spelling). Re-registering the same name overwrites — the
 * last writer wins, matching CopilotKit's behaviour.
 *
 * The registry is module-scoped and persists for the lifetime of the
 * page. Callers that load skills dynamically (e.g. hot-reload, plugin
 * unload) should hold the dispose handle and call it before re-registering
 * under the same name, otherwise stale renderers may stick around when a
 * skill is removed without a replacement.
 */
export function registerToolRenderer(name: string, renderer: ToolRenderer): () => void {
  renderers.set(name, renderer);
  return () => {
    if (renderers.get(name) === renderer) renderers.delete(name);
  };
}

export function getToolRenderer(name: string): ToolRenderer | undefined {
  return renderers.get(name);
}

/** Visible mainly for tests. */
export function clearToolRenderers(): void {
  renderers.clear();
}

/**
 * Map an in-flight tool call to AG-UI's four-state lifecycle.
 *
 * - `error`      — tool returned with `isError`
 * - `complete`   — tool returned cleanly
 * - `executing`  — no result yet, run still streaming
 * - `inProgress` — no result yet, run finished (rare: agent crashed
 *                  mid-call). Distinct so renderers can surface a
 *                  different affordance ("interrupted") than the
 *                  live-spinner state.
 *
 * The split between `inProgress` and `executing` is the same one
 * CopilotKit exposes: in their world, `inProgress` = streaming args,
 * `executing` = handler running. We don't currently receive partial
 * tool_use args from the daemon, so the two states collapse onto the
 * "run alive vs. run dead" axis instead. Either way, renderers that
 * want a single "loading" state can treat both identically.
 */
export function deriveToolStatus(
  result: ToolResult | undefined,
  runStreaming: boolean,
): ToolStatus {
  if (result) return result.isError ? 'error' : 'complete';
  return runStreaming ? 'executing' : 'inProgress';
}

export function toRenderProps(
  use: ToolUse,
  result: ToolResult | undefined,
  runStreaming: boolean,
): ToolRenderProps {
  return {
    status: deriveToolStatus(result, runStreaming),
    name: use.name,
    args: use.input,
    result: result?.content,
    isError: result?.isError ?? false,
  };
}
