import type { CommitMutationOptions, MutationResult } from "../hooks/gsapScriptCommitTypes";
import { trackStudioEvent } from "./studioTelemetry";

export type KeyframeUsageAction = "add" | "convert" | "remove_all" | "reset";

export function keyframeUsageActions(
  mutations: ReadonlyArray<Record<string, unknown>>,
  semanticActions?: ReadonlyArray<KeyframeUsageAction | undefined>,
): Set<KeyframeUsageAction> {
  const actions = new Set<KeyframeUsageAction>();
  for (const [index, mutation] of mutations.entries()) {
    const semanticAction = semanticActions?.[index];
    if (semanticAction) {
      actions.add(semanticAction);
      continue;
    }
    switch (mutation.type) {
      case "add-keyframe":
      case "add-with-keyframes":
        actions.add("add");
        break;
      case "convert-to-keyframes":
        actions.add("convert");
        break;
      case "remove-all-keyframes":
        actions.add("remove_all");
        break;
    }
  }
  return actions;
}

export function trackKeyframeUsage(action: KeyframeUsageAction, property?: string): void {
  trackStudioEvent("keyframe", property === undefined ? { action } : { action, property });
}

export function primaryKeyframeAction(
  actions: ReadonlySet<KeyframeUsageAction>,
): KeyframeUsageAction | undefined {
  return (["add", "convert", "remove_all", "reset"] as const).find((action) => actions.has(action));
}

export function changedMutationIndices(
  result: MutationResult,
  count: number,
  options?: ReadonlyArray<Pick<CommitMutationOptions, "keyframeTelemetry">>,
): number[] {
  if (!result.ok || result.changed !== true) return [];
  const changes = count === 1 ? [true] : result.mutationChanges;
  if (
    !Array.isArray(changes) ||
    changes.length !== count ||
    changes.some((value) => typeof value !== "boolean")
  )
    return [];
  return changes.flatMap((changed, index) =>
    changed && options?.[index]?.keyframeTelemetry !== false ? [index] : [],
  );
}

export function trackKeyframeCommit(
  mutations: ReadonlyArray<Record<string, unknown>>,
  result: MutationResult,
  options: CommitMutationOptions,
  memberOptions?: ReadonlyArray<CommitMutationOptions>,
): void {
  if (!result.ok || result.changed !== true || options.keyframeTelemetry === false) return;
  const indices = changedMutationIndices(result, mutations.length, memberOptions);
  const actions = keyframeUsageActions(
    indices.map((index) => mutations[index]!),
    indices.map(
      (index) =>
        memberOptions?.[index]?.keyframeAction ??
        (mutations.length === 1 ? options.keyframeAction : undefined),
    ),
  );
  const action = primaryKeyframeAction(actions);
  if (action) trackKeyframeUsage(action, action === "add" ? options.keyframeProperty : undefined);
}
