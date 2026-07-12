// Agent-tool descriptor — the shared, product-neutral shape that declares one
// capability the assistant can invoke. Pure transport/capability shape only: no
// UI-component fields (no button/panel/React props), no runtime logic, and no
// imports from apps/daemon/browser/React. The registry RUNTIME that stores and
// looks these up will live in a future standalone `packages/agent-tools`
// package (see docs/rfc-drafts/agent-ready.md); this file is only the
// wire shape.

import type { JsonValue } from '../common.js';

/**
 * Stable tool identity. Lowercase, dot-namespaced and domain-grouped so tools
 * cluster by owner — for example `navigation.goto` or `imagegen.create`. The
 * `name` is the only cross-surface identity a caller may rely on; renaming a
 * tool is a breaking change.
 *
 * Documented shape (not enforced at the type level — contracts is shapes-only):
 * `/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/`
 */
export type AgentToolName = string;

export type AgentToolHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * The surfaces a tool can run on — the descriptor union's discriminant, named so
 * the list/search shapes ({@link AgentToolManifest}, {@link AgentToolSearchQuery})
 * can reuse it.
 */
export type AgentToolSurface = 'browser' | 'api';

/** Fields common to every tool regardless of where it runs. */
interface AgentToolDescriptorBase {
  name: AgentToolName;
  /**
   * Model- and catalog-facing description: the text the assistant reads to
   * decide when to call the tool, and the text a future "what can you do?"
   * discovery view renders. Capability copy, never UI markup.
   */
  description: string;
  /**
   * JSON Schema (draft 2020-12) for the tool's input object, carried as a plain
   * {@link JsonValue} so it crosses the MCP wire verbatim and stays
   * framework-neutral (WebMCP / MCP-UI / A2UI ready). Authors may write Zod and
   * emit JSON Schema, but the contract carries the emitted schema — never a Zod
   * value.
   */
  inputSchema: JsonValue;
}

/**
 * A tool whose whole effect is an ephemeral browser view movement (navigate,
 * scroll, focus, open a panel). It runs in the browser and has no meaningful
 * `od` CLI form, so it is exempt from the UI/CLI dual-track law — but only by
 * asserting that exemption explicitly at the type level.
 */
export interface BrowserToolDescriptor extends AgentToolDescriptorBase {
  surface: 'browser';
  /**
   * Literal `true`: this tool's whole effect is ephemeral browser view state
   * and nothing it does outlives the session. Required so a browser tool cannot
   * be declared without claiming the dual-track exemption (see RFC §5).
   */
  viewStateOnly: true;
  api?: never;
  cli?: never;
}

/**
 * A real capability that runs as a normal API action. The UI/CLI dual-track law
 * is encoded structurally: an api tool cannot be declared without both its
 * `/api/*` route and its `od` subcommand.
 */
export interface ApiToolDescriptor extends AgentToolDescriptorBase {
  surface: 'api';
  /**
   * The HTTP endpoint this capability drives. Method + route only; headers,
   * bodies, and auth are transport concerns resolved at call time, not here.
   */
  api: { method: AgentToolHttpMethod; route: string };
  /** The equivalent `od` CLI form, satisfying the dual-track law. */
  cli: { subcommand: string };
  viewStateOnly?: never;
}

/** The descriptor union, discriminated on `surface`. */
export type AgentToolDescriptor = BrowserToolDescriptor | ApiToolDescriptor;
