import type { DomEditGroupPathOffsetCommit } from "../components/editor/DomEditOverlay";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { GsapEditBlockedError } from "./gsapEditOutcome";
import { gsapWriteFile } from "./gsapScriptCommitTypes";

/** The first member a group's preflight refused, else one from a second file. */
export function firstPreflightFailure(
  results: PromiseSettledResult<void>[],
  updates: DomEditGroupPathOffsetCommit[],
  savedOnElement: Map<DomEditSelection, boolean>,
  activeCompPath: string | null | undefined,
): { error: unknown; selection: DomEditSelection } | null {
  for (const [index, result] of results.entries()) {
    if (result.status !== "rejected") continue;
    const selection = updates[index]?.selection;
    if (selection) return { error: result.reason, selection };
  }
  return secondFile(updates, savedOnElement, activeCompPath);
}

/** The group's script writes go out as one batch to one file, so members from two files refuse. */
function secondFile(
  updates: DomEditGroupPathOffsetCommit[],
  savedOnElement: Map<DomEditSelection, boolean>,
  activeCompPath: string | null | undefined,
): { error: unknown; selection: DomEditSelection } | null {
  const scripted = updates.filter(({ selection }) => !savedOnElement.has(selection));
  const fileOf = (s: DomEditSelection) => gsapWriteFile(s, activeCompPath);
  const file = scripted[0] && fileOf(scripted[0].selection);
  const other = scripted.find(({ selection }) => fileOf(selection) !== file);
  return other
    ? { error: new GsapEditBlockedError("mixed-files"), selection: other.selection }
    : null;
}
