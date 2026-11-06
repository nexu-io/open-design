import type {
  CommitMutationCall,
  CommitMutation,
  CommitMutationOptions,
  MutationResult,
} from "./gsapScriptCommitTypes";
import {
  keyframeUsageActions,
  changedMutationIndices,
  primaryKeyframeAction,
  trackKeyframeUsage,
  type KeyframeUsageAction,
} from "../utils/keyframeUsage";
import type { GeometryCommitResult } from "../utils/previewFeatureUsage";
import { adoptingStudioPendingEdit } from "../utils/studioPendingEdits";

export function observeGsapGesture(writer: CommitMutation | null) {
  const edit = adoptingStudioPendingEdit();
  const join = <T>(run: () => T): T => (edit ? edit.within(run) : run());
  let changed = false;
  let pendingResults = 0;
  const actions = new Set<KeyframeUsageAction>();
  const observe = (calls: CommitMutationCall[], options: CommitMutationOptions) => {
    pendingResults += 1;
    return {
      ...options,
      ...(edit && { pendingEdit: edit }),
      keyframeTelemetry: false,
      onResult: (result: MutationResult) => {
        pendingResults -= 1;
        options.onResult?.(result);
        if (!result.ok || result.changed !== true) return;
        changed = true;
        edit?.markSaved();
        const members = changedMutationIndices(
          result,
          calls.length,
          calls.map((call) => call.options),
        ).map((index) => calls[index]!);
        for (const action of keyframeUsageActions(
          members.map((call) => call.mutation),
          members.map((call) => call.options.keyframeAction),
        ))
          actions.add(action);
      },
    };
  };
  let commit: CommitMutation | null = null;
  if (writer) {
    commit = (selection, mutation, options) =>
      join(() => writer(selection, mutation, observe([{ selection, mutation, options }], options)));
    if (writer.batch) {
      const batch = writer.batch;
      commit.batch = (calls, options) => join(() => batch(calls, observe(calls, options)));
    }
  }
  return {
    commit,
    drawKeepingUndone: <T>(draw: () => T): T => (edit ? edit.drawKeepingUndone(draw) : draw()),
    recordDomResult: (result: { changed: boolean } | undefined) => {
      changed ||= result?.changed === true;
      if (result?.changed) edit?.markSaved();
    },
    finish: (domChanged = false): GeometryCommitResult => {
      if (pendingResults !== 0) return { ok: true, changed: false };
      const action = primaryKeyframeAction(actions);
      if (action) trackKeyframeUsage(action);
      return { ok: true, changed: changed || domChanged };
    },
  };
}
