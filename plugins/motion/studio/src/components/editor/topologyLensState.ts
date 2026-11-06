import type {
  StudioEditLifecycleState,
  StudioWriteOperation,
  StudioWriteTarget,
} from "../../webmcp/writeCoordinator";

type TopologyLensBase = {
  callId: string;
  projectId: string;
  target: StudioWriteTarget;
  operation: StudioWriteOperation;
};

export type TopologyLensState =
  | { phase: "hidden" }
  | (TopologyLensBase & { phase: "acquiring" })
  | (TopologyLensBase & {
      phase: "localizing";
      terminal: "dispatched" | "failed" | "no-change" | null;
    })
  | (TopologyLensBase & {
      phase: "sealing";
      receiptStage: "saved" | "verified";
    });

export type TopologyLensEvent =
  | { type: "lifecycle"; value: StudioEditLifecycleState }
  | { type: "acquisition-elapsed"; callId: string };

function visibleBase(
  value: Exclude<StudioEditLifecycleState, { phase: "idle" }>,
): TopologyLensBase {
  return {
    callId: value.callId,
    projectId: value.projectId,
    target: value.target,
    operation: value.operation,
  };
}

/**
 * Presentation follows transaction facts. Elapsed events may finish a visual
 * transition, but cannot promote a receipt or invent persistence.
 */
export function reduceTopologyLens(
  state: TopologyLensState,
  event: TopologyLensEvent,
): TopologyLensState {
  if (event.type === "lifecycle") {
    const lifecycle = event.value;
    if (lifecycle.phase === "idle") return { phase: "hidden" };
    const base = visibleBase(lifecycle);
    switch (lifecycle.phase) {
      case "dispatching":
        return lifecycle.targetChanged
          ? { ...base, phase: "acquiring" }
          : { ...base, phase: "localizing", terminal: null };
      case "dispatched":
      case "failed":
        return { ...base, phase: "localizing", terminal: lifecycle.phase };
      case "saved":
      case "verified":
        if (lifecycle.receipt?.ok && lifecycle.receipt.changed === false) {
          return { ...base, phase: "localizing", terminal: "no-change" };
        }
        return { ...base, phase: "sealing", receiptStage: lifecycle.phase };
    }
  }

  if (state.phase === "hidden" || state.callId !== event.callId) return state;
  return state.phase === "acquiring" ? { ...state, phase: "localizing", terminal: null } : state;
}
