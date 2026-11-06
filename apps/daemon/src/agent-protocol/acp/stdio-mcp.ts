/** @module agent-protocol/acp/stdio-mcp
 * Keeps OD from handing an ACP agent an MCP transport that agent's build can no
 * longer ingest.
 *
 * ACP carries MCP servers on `session/new` as a `type`-discriminated array in
 * which a *missing* `type` means stdio. Kimi Code CLI 0.37.0 removed the branch
 * that built stdio servers out of those entries and replaced it with a throw:
 *
 *   {"code":-32603,"message":"Internal error","data":{"details":
 *    "ACP stdio MCP server open-design-live-artifacts does not declare a runtime identity"}}
 *
 * The message names a "runtime identity" the entry should declare, but no
 * accepted value exists. Kimi validates `session/new` against a zod union whose
 * stdio member declares no `type` key at all, so zod strips an explicit
 * `type: "stdio"` before the handler runs — after which the handler sees no
 * `type` and throws. Verified against the published tarballs: 0.35.0 and 0.36.1
 * accept a stdio entry with or without `type`; 0.37.0, 0.37.1, 0.37.2 and
 * 0.38.0 reject both spellings identically. Only `http` and `sse` survive.
 *
 * OD attaches at least one stdio MCP server to every `mature-acp` runtime
 * (`open-design-live-artifacts`, from `buildLiveArtifactsMcpServersForAgent`),
 * plus any user-configured external MCP servers merged in via `acp-merge`. On a
 * rejecting build that makes `session/new` fail deterministically, which is why
 * the observed failure rate for those versions is ~85–92% rather than
 * intermittent.
 *
 * Withholding the stdio entries costs those runs their live-artifact tooling,
 * but a session that opens without MCP is strictly better than a session that
 * cannot open at all — and on a rejecting build the tooling is unreachable
 * either way. Which builds reject is runtime-specific data
 * (`RuntimeAgentDef.acpStdioMcpRemovedInVersion`), so this module stays generic
 * and every runtime that does not declare the field is left untouched.
 */

interface VersionCore {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Reads the `major.minor.patch` core out of a version string.
 *
 * Prerelease and build metadata are deliberately ignored: an `0.37.0-beta`
 * build carries the same `session/new` handler as `0.37.0`, so for this guard
 * it must sort with the release rather than below it.
 *
 * @param value - Version string, optionally `v`-prefixed.
 * @returns The numeric core, or `null` when the string is not `X.Y.Z`-shaped.
 */
export function parseVersionCore(
  value: string | null | undefined,
): VersionCore | null {
  if (typeof value !== 'string') return null;
  const match = /^\s*v?(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isAtLeast(version: VersionCore, minimum: VersionCore): boolean {
  if (version.major !== minimum.major) return version.major > minimum.major;
  if (version.minor !== minimum.minor) return version.minor > minimum.minor;
  return version.patch >= minimum.patch;
}

/**
 * True when the connected agent build can still ingest a stdio MCP server.
 *
 * A runtime that does not declare `removedInVersion` accepts stdio at every
 * version — the removal is specific to the runtimes that shipped it, and every
 * other ACP agent must keep the payload it has today.
 *
 * When a runtime *does* declare it, an unreadable reported version answers
 * `false`. That is the deliberate fail-safe direction: withholding costs an
 * accepting build its live-artifact tooling for the turn, while sending costs a
 * rejecting build the entire run. Every Kimi build from 0.35.0 on reports its
 * version in the `initialize` result, so this branch is close to unreachable in
 * practice.
 *
 * @param reportedVersion - Version the agent reported for its own build.
 * @param removedInVersion - First version of this runtime that rejects stdio
 *   MCP servers, or `null`/`undefined` when no build of it does.
 */
export function acpBuildAcceptsStdioMcp(
  reportedVersion: string | null | undefined,
  removedInVersion: string | null | undefined,
): boolean {
  const removedIn = parseVersionCore(removedInVersion);
  if (!removedIn) return true;
  const reported = parseVersionCore(reportedVersion);
  if (!reported) return false;
  return !isAtLeast(reported, removedIn);
}

/** The subset of an ACP `mcpServers` entry this guard needs to classify it. */
interface AcpMcpServerLike {
  name?: unknown;
  type?: unknown;
  [key: string]: unknown;
}

/**
 * True when an ACP `mcpServers` entry describes a stdio (subprocess) server.
 *
 * ACP treats a missing `type` as stdio, and OD's own `session/new` builder
 * spells it out as `'stdio'`. Both are the same transport on the wire and both
 * are rejected by the same builds, so both classify as stdio here.
 *
 * @param entry - One element of the `mcpServers` array.
 */
export function isAcpStdioMcpServer(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const type = (entry as AcpMcpServerLike).type;
  if (type === undefined || type === null) return true;
  return type === 'stdio';
}

export interface WithheldStdioMcpResult<T> {
  /** The entries safe to send to this build. */
  servers: T[];
  /** Names of the stdio entries withheld, for logging. Empty when nothing was withheld. */
  withheldNames: string[];
}

/**
 * Invariant: OD never sends a stdio MCP server to an ACP build that rejects
 * them.
 *
 * Applied to the fully-assembled `mcpServers` array — live-artifacts plus any
 * `acp-merge` external servers — so a stdio entry cannot reach `session/new`
 * from either producer. Returns the input array unchanged (same reference) for
 * every build that still accepts stdio, so no other agent's payload shape moves.
 *
 * @param servers - The assembled ACP `mcpServers` array.
 * @param build - Version the agent reported, and the runtime's declared removal
 *   version (absent for runtimes that never removed stdio support).
 */
export function withholdStdioMcpServersForBuild<T>(
  servers: T[],
  build: {
    reportedVersion?: string | null | undefined;
    removedInVersion?: string | null | undefined;
  },
): WithheldStdioMcpResult<T> {
  if (acpBuildAcceptsStdioMcp(build.reportedVersion, build.removedInVersion)) {
    return { servers, withheldNames: [] };
  }
  const kept: T[] = [];
  const withheldNames: string[] = [];
  for (const entry of servers) {
    if (isAcpStdioMcpServer(entry)) {
      const name = (entry as AcpMcpServerLike | null)?.name;
      withheldNames.push(typeof name === 'string' ? name : '<unnamed>');
      continue;
    }
    kept.push(entry);
  }
  return { servers: kept, withheldNames };
}
