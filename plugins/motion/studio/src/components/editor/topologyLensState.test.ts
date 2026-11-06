import { describe, expect, it } from "vitest";
import { reduceTopologyLens, type TopologyLensState } from "./topologyLensState";
import type { StudioEditLifecycleState } from "../../webmcp/writeCoordinator";

const targetA = { handle: "dom:v1:index.html:index.html:target-a", sourceFile: "index.html" };
const targetB = { handle: "dom:v1:index.html:index.html:target-b", sourceFile: "index.html" };

function lifecycle(
  overrides: Partial<Exclude<StudioEditLifecycleState, { phase: "idle" }>> = {},
): Exclude<StudioEditLifecycleState, { phase: "idle" }> {
  return {
    callId: "call-a",
    projectId: "project-a",
    target: targetA,
    operation: "set-text",
    targetChanged: true,
    phase: "dispatching",
    ...overrides,
  };
}

function hidden(): TopologyLensState {
  return { phase: "hidden" };
}

describe("Topology Lens state", () => {
  it("reveals a new target but localizes a repeated target immediately", () => {
    expect(reduceTopologyLens(hidden(), { type: "lifecycle", value: lifecycle() })).toMatchObject({
      phase: "acquiring",
      callId: "call-a",
    });
    expect(
      reduceTopologyLens(hidden(), {
        type: "lifecycle",
        value: lifecycle({ callId: "call-repeat", targetChanged: false }),
      }),
    ).toMatchObject({ phase: "localizing", callId: "call-repeat" });
  });

  it("lets a fast durable receipt interrupt acquisition and seal once", () => {
    const acquiring = reduceTopologyLens(hidden(), { type: "lifecycle", value: lifecycle() });
    const sealing = reduceTopologyLens(acquiring, {
      type: "lifecycle",
      value: lifecycle({ phase: "verified" }),
    });

    expect(sealing).toMatchObject({ phase: "sealing", receiptStage: "verified" });
    expect(reduceTopologyLens(sealing, { type: "lifecycle", value: { phase: "idle" } })).toEqual(
      hidden(),
    );
  });

  it.each(["dispatched", "failed"] as const)(
    "retracts %s without manufacturing a success seal",
    (phase) => {
      const localizing = reduceTopologyLens(hidden(), {
        type: "lifecycle",
        value: lifecycle({ phase }),
      });

      expect(localizing).toMatchObject({ phase: "localizing", terminal: phase });
      expect(
        reduceTopologyLens(localizing, { type: "lifecycle", value: { phase: "idle" } }),
      ).toEqual(hidden());
    },
  );

  it.each(["saved", "verified"] as const)(
    "retracts a %s no-op without manufacturing a success seal",
    (phase) => {
      const noChange = reduceTopologyLens(hidden(), {
        type: "lifecycle",
        value: lifecycle({
          phase,
          receipt: {
            ok: true,
            stage: phase,
            target: targetA,
            operation: "set-text",
            changed: false,
            evidence: { kind: "content-version", sourceFile: "index.html", version: "v1" },
          },
        }),
      });

      expect(noChange).toMatchObject({ phase: "localizing", terminal: "no-change" });
    },
  );

  it("ignores elapsed events owned by an older invocation", () => {
    const newer = reduceTopologyLens(hidden(), {
      type: "lifecycle",
      value: lifecycle({ callId: "call-b", target: targetB }),
    });

    expect(reduceTopologyLens(newer, { type: "acquisition-elapsed", callId: "call-a" })).toBe(
      newer,
    );
  });

  it("clears when the coordinator publishes idle", () => {
    const acquiring = reduceTopologyLens(hidden(), { type: "lifecycle", value: lifecycle() });

    expect(reduceTopologyLens(acquiring, { type: "lifecycle", value: { phase: "idle" } })).toEqual(
      hidden(),
    );
  });

  it("advances acquisition to localization only for the same visual invocation", () => {
    const acquiring = reduceTopologyLens(hidden(), { type: "lifecycle", value: lifecycle() });

    expect(
      reduceTopologyLens(acquiring, { type: "acquisition-elapsed", callId: "call-a" }),
    ).toMatchObject({ phase: "localizing", terminal: null });
  });
});
