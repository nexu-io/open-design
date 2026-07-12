// Agent-tool list + search vocabulary — the "what can you do?" catalog a run or
// frontend advertises, plus a paged search shape for progressive discovery over
// a large registry. Pure types only: no runtime logic, no imports from
// apps/daemon/browser/React. The MCP-congruent `tools/list` analog.

import type { AgentToolDescriptor, ApiToolDescriptor } from './descriptor.js';
import { AGENT_ACTIONS_PROTOCOL_VERSION } from './actions.js';

/**
 * The capability catalog a run advertises to the model — the `tools/list` analog
 * ("what can you do?"). Small runs hand the model the whole `tools` array; large
 * registries hand it an {@link AgentToolSearchQuery} instead (see the RFC
 * "Agent tool search — options"). `protocolVersion` reuses the browser-action
 * version so catalog and calls version together.
 */
export interface AgentToolManifest {
  protocolVersion: typeof AGENT_ACTIONS_PROTOCOL_VERSION;
  /** The run this catalog was assembled for. */
  runId: string;
  /** The advertised tools, as product-neutral descriptors. */
  tools: AgentToolDescriptor[];
}

/**
 * A progressive-discovery query over the registry — the answer to "too many
 * tools." Mirrors the Composio `listToolsPage({ limit, cursor })` paged idiom so
 * an agent fetches relevant tools just-in-time instead of receiving the full
 * list. All fields optional: an empty query pages the whole registry.
 */
export interface AgentToolSearchQuery {
  /** Free-text match over tool name/description. Omitted = match all. */
  query?: string;
  /**
   * Restrict to a surface. Search is the PULL path over the persistent registry,
   * which holds only `api`-surface tools — browser availability is PUSH-advertised
   * per-session and is never searched (see the RFC "Advertisement axis — PUSH vs
   * PULL"). So `'api'` is the only searchable surface: the field exists to document
   * that scope and to stay forward-compatible if a future surface becomes
   * persistently searchable. Browser-tool discovery needs live session scope this
   * query deliberately does not carry.
   */
  surface?: 'api';
  /** Page size. The registry clamps to its own maximum. */
  limit?: number;
  /** Opaque forward cursor from a previous {@link AgentToolSearchResult.nextCursor}. */
  cursor?: string;
}

/**
 * One page of search results. `nextCursor` is present iff more pages remain;
 * `total` is a best-effort count the registry MAY omit for cheap paging.
 * Deliberately returns full descriptors and no ranking `score` — keyword search
 * (the slice-3 default) needs none, and a score can be added later without a
 * breaking change (see the RFC "Non-breaking type hooks").
 *
 * Items are `ApiToolDescriptor` only, not the full {@link AgentToolDescriptor}
 * union: search is the PULL path over the persistent `api` catalog, so the
 * result type enforces the same invariant as {@link AgentToolSearchQuery.surface}
 * on the response side — a registry implementation cannot type-check while
 * leaking `browser` descriptors into a session-less search result. Browser tools
 * are advertised by PUSH per-session and are never a search result (see the RFC
 * "Advertisement axis — PUSH vs PULL").
 */
export interface AgentToolSearchResult {
  tools: ApiToolDescriptor[];
  /** Opaque cursor to fetch the next page; absent on the final page. */
  nextCursor?: string;
  /** Best-effort total match count; optional so a store need not count to page. */
  total?: number;
}
