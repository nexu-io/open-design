import { useCallback } from "react";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { DomEditGroupPathOffsetCommit } from "../components/editor/DomEditOverlay";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { CommitMutationCall, CommitMutationOptions } from "./gsapScriptCommitTypes";
import type { UseGsapAwareEditingParams } from "./useGsapAwareEditing";
import { observeGsapGesture } from "./gsapGestureOutcome";
import { editsPlainCss } from "./gsapRuntimeKeyframes";
import { refuseGsapTakeover } from "./elementOffsetStager";
import { tryGsapDragIntercept } from "./gsapRuntimeBridge";
import { freezeDragStamp } from "./draggedGsapPosition";
import { assertGsapEditPersisted } from "./gsapEditOutcome";
import { firstPreflightFailure } from "./gsapGroupPreflight";
import { whileScriptWrites } from "../player/previewReloading";
import type { GeometryCommitResult } from "../utils/previewFeatureUsage";

// A distinct key keeps consecutive group drags in separate undo entries.
let groupDragCommitCounter = 0;

export function useGsapAwareGroupMove({
  gsapCommitMutation,
  activeCompPath,
  previewIframeRef,
  makeFetchFallback,
  trackGsapInteractionFailure,
  stageElementPositionOffset,
  showToast,
}: Pick<
  UseGsapAwareEditingParams,
  | "gsapCommitMutation"
  | "activeCompPath"
  | "previewIframeRef"
  | "makeFetchFallback"
  | "trackGsapInteractionFailure"
  | "stageElementPositionOffset"
  | "showToast"
>) {
  const handleGsapAwareGroupPathOffsetCommit = useCallback(
    async (
      updates: DomEditGroupPathOffsetCommit[],
      options: { refusalToast?: boolean } = {},
    ): Promise<GeometryCommitResult> => {
      const writes = observeGsapGesture(gsapCommitMutation);
      const writer = writes.commit;
      if (!writer) return { ok: true, changed: false };
      const scripted = updates.some(
        ({ selection, plainTranslate }) =>
          !(plainTranslate ?? editsPlainCss(selection.element, "move")),
      );
      const commitGroup = async (): Promise<GeometryCommitResult> => {
        const stamps = new Map(
          updates.map((u) => [u.selection, freezeDragStamp(u.selection.element)]),
        );
        const toastRefusal = options.refusalToast !== false;
        // One coalesce key across slow writes keeps the group drag in one undo entry.
        const coalesceKey = `group-drag:${++groupDragCommitCounter}`;
        // Hold the render until every member is saved, or unwritten members snap back.
        let renderOnCommit = false;
        const previewFallbackLatch = { pending: false };
        const withGroupOptions = (options: CommitMutationOptions): CommitMutationOptions => ({
          ...options,
          coalesceKey,
          coalesceMs: Number.POSITIVE_INFINITY,
          deferPreviewSync: !renderOnCommit,
          previewFallbackLatch,
        });
        // Batch members in the same file to avoid repeating its read, parse, write and preview patch.
        const queued: CommitMutationCall[] = [];
        const flushQueued = async () => {
          if (queued.length === 0) return;
          const calls = queued.splice(0, queued.length);
          if (!writer.batch) {
            for (const call of calls) {
              await writer(call.selection, call.mutation, call.options);
            }
            return;
          }
          await writer.batch(calls, {
            ...(calls.at(-1)?.options ?? { label: "Move animated layer (group)" }),
            label: "Move animated layer (group)",
          });
        };
        const coalescedCommit: typeof gsapCommitMutation = (selection, mutation, options) => {
          queued.push({ selection, mutation, options: withGroupOptions(options) });
          return Promise.resolve();
        };
        const preflightAnimations = new Map<DomEditSelection, GsapAnimation[]>();
        // Members saved on themselves, each with its route: true for its CSS translate.
        const offsetMembers = new Map<DomEditSelection, boolean>();
        // Editability is user-atomic: prove every member can be written before the first source
        // mutation, so a blocked member never leaves earlier siblings partially moved. Preflights
        // write nothing and share one in-flight parse per file, so they run together.
        const preflightResults = await Promise.allSettled(
          updates.map(async ({ selection, next, plainTranslate }) => {
            if (plainTranslate ?? editsPlainCss(selection.element, "move")) {
              refuseGsapTakeover(selection.element, toastRefusal ? showToast : () => {});
              return void offsetMembers.set(selection, true);
            }
            const animations = await makeFetchFallback(selection, { failOnFetchError: true })();
            preflightAnimations.set(selection, animations);
            const outcome = await tryGsapDragIntercept(
              selection,
              next,
              animations,
              previewIframeRef.current,
              coalescedCommit,
              undefined,
              { preflightOnly: true, group: true },
            );
            if (outcome.status === "element-offset") offsetMembers.set(selection, false);
            assertGsapEditPersisted(outcome);
          }),
        );
        const preflightFailure = firstPreflightFailure(
          preflightResults,
          updates,
          offsetMembers,
          activeCompPath,
        );
        if (preflightFailure) {
          trackGsapInteractionFailure(
            preflightFailure.error,
            preflightFailure.selection,
            "drag",
            "Move animated layer (group)",
            toastRefusal,
          );
          throw preflightFailure.error;
        }
        const lastScriptWrite = updates.findLastIndex(
          ({ selection }) => !offsetMembers.has(selection),
        );
        for (const [index, { selection, next }] of updates.entries()) {
          renderOnCommit = index === lastScriptWrite;
          const plain = offsetMembers.get(selection);
          if (plain !== undefined) {
            const staged = writes.drawKeepingUndone(() =>
              stageElementPositionOffset(selection, next, plain, coalesceKey),
            );
            const result = await staged.save();
            writes.recordDomResult(result);
            continue;
          }
          try {
            const outcome = await tryGsapDragIntercept(
              selection,
              next,
              preflightAnimations.get(selection) ?? [],
              previewIframeRef.current,
              coalescedCommit,
              // The intercept re-reads the file to resolve a stale or shared tween.
              // Anything already queued has to be on disk before that read, or it
              // resolves against a file missing writes it is about to build on.
              async () => {
                await flushQueued();
                return makeFetchFallback(selection, { fresh: true })();
              },
              { preflightPassed: true, stamp: stamps.get(selection) },
            );
            assertGsapEditPersisted(outcome);
          } catch (error) {
            trackGsapInteractionFailure(error, selection, "drag", "Move animated layer (group)");
            throw error;
          }
        }
        try {
          await flushQueued();
          return writes.finish();
        } catch (error) {
          // The aggregate write has no uniquely failing member; do not misattribute
          // its telemetry to whichever member happened to be last in the array.
          trackGsapInteractionFailure(error, null, "drag", "Move animated layer (group)");
          throw error;
        }
      };
      return scripted ? whileScriptWrites(commitGroup) : commitGroup();
    },
    [
      gsapCommitMutation,
      activeCompPath,
      previewIframeRef,
      makeFetchFallback,
      trackGsapInteractionFailure,
      stageElementPositionOffset,
      showToast,
    ],
  );

  return handleGsapAwareGroupPathOffsetCommit;
}
