/**
 * Where in the rack an automation lane's parameter actually lives.
 *
 * A lane names `fx.<nodeId>.<param>`, but the rack does not show one flat list
 * of nodes: the carve is one module standing for the filters it compiled, EQ
 * bands are folded into their own module, and preset runs are collapsible
 * groups. A node id therefore resolves to one of several surfaces, and the
 * caller has to open the RIGHT one — opening `openNode` on a carve band, whose
 * row is filtered out of `handBuilt`, would open nothing at all and read as the
 * click doing nothing.
 */

import { parseAutomationTarget } from "@hyperframes/core/audio-automation";
import { escapeCssString } from "./domEditingDom";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";

export type AudioFxRevealTarget =
  /** A hand-built effect, addressed by its index in the chain. */
  | { kind: "node"; index: number; nodeId: string }
  /** An EQ module, addressed by the id its bands share. */
  | { kind: "eq"; eqId: string }
  /** A preset run, addressed the way `collapsedRuns` keys it. */
  | { kind: "preset"; runKey: string }
  /** The carve module, which owns every `fromCarve` node collectively. */
  | { kind: "carve" }
  /** The track's own volume — no rack row; the reveal is the rack itself. */
  | { kind: "volume" };

/**
 * Resolve a lane target to the surface that shows it, or null when the chain
 * does not contain it (a stale lane, or one whose effect was removed).
 */
export function audioFxRevealTarget(
  target: string,
  chain: HfAudioFxChain | null,
): AudioFxRevealTarget | null {
  const parsed = parseAutomationTarget(target);
  if (!parsed) return null;
  if (parsed.kind === "volume") return { kind: "volume" };
  if (parsed.kind === "rate") return null;
  if (parsed.kind === "preset") {
    // A preset-level lane names the preset, not a node inside it: find its run
    // by the first node that belongs to it, which is how `runKey` is built.
    const index = (chain?.nodes ?? []).findIndex((node) => node.fromPreset === parsed.presetId);
    return index >= 0 ? { kind: "preset", runKey: `${parsed.presetId}-${index}` } : null;
  }
  const index = (chain?.nodes ?? []).findIndex((node) => node.id === parsed.nodeId);
  const node = index >= 0 ? chain?.nodes[index] : undefined;
  if (!node) return null;
  // Order matters: a carve band can also carry `fromEq`/`fromPreset` tags, and
  // the carve module is the one that actually renders it.
  if (node.fromCarve) return { kind: "carve" };
  if (node.fromEq) return { kind: "eq", eqId: node.fromEq };
  if (node.fromPreset) {
    const first = (chain?.nodes ?? []).findIndex((n) => n.fromPreset === node.fromPreset);
    return { kind: "preset", runKey: `${node.fromPreset}-${first}` };
  }
  return { kind: "node", index, nodeId: parsed.nodeId };
}

/**
 * The DOM selector for the row a reveal target lives in, or null when the target
 * names no surface this panel renders.
 *
 * A preset run is keyed by the preset id the run element actually exposes, not by
 * `runKey`, which is the collapse map's key and carries an index suffix.
 */
function revealRowSelector(where: AudioFxRevealTarget | null): string | null {
  if (!where) return null;
  switch (where.kind) {
    case "node":
      return where.nodeId ? `[data-fx-node-id="${escapeCssString(where.nodeId)}"]` : null;
    case "eq":
      return `[data-fx-eq="${escapeCssString(where.eqId)}"]`;
    case "carve":
      return ".hf-fx-carve-module";
    case "preset":
      return `[data-fx-preset="${escapeCssString(where.runKey.replace(/-\d+$/, ""))}"]`;
    default:
      return null;
  }
}

/**
 * Scroll the row that owns `target` into view, and report whether it was found.
 *
 * The target is resolved against the chain again rather than remembered: which
 * surface owns a parameter is a fact about the chain, and the chain may have
 * been edited between the reveal request and the pass that can act on it. A
 * false return means the row has not mounted yet, so the caller keeps the
 * request pending.
 */
export function scrollRevealedRowIntoView(
  root: HTMLElement | null,
  target: string,
  chain: HfAudioFxChain,
): boolean {
  const selector = revealRowSelector(audioFxRevealTarget(target, chain));
  // `querySelector` throws SyntaxError on a malformed selector, and this runs
  // inside a render-phase effect — an unescapable id would take the whole
  // property panel down instead of leaving the request pending, which is what
  // returning false means. `parseAudioFxNode` accepts any non-empty string as
  // an id and `parseAutomationTarget` only splits on `.`, so a hand- or
  // LLM-authored chain can carry one.
  let row: HTMLElement | null = null;
  try {
    row = selector ? (root?.querySelector<HTMLElement>(selector) ?? null) : null;
  } catch {
    return false;
  }
  if (!row) return false;
  row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return true;
}
