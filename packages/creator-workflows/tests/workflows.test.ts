import { describe, expect, it } from "vitest";
import {
  createWorkflowDefinition,
  createWorkflowTransitionSpec,
  createWorkflowTriggerSpec,
  isWorkflowDefinition,
  isWorkflowTransitionSpec,
  isWorkflowTriggerSpec,
  normalizeWorkflowDefinition,
  normalizeWorkflowTransitionSpec,
  normalizeWorkflowTriggerSpec,
} from "../src/index.js";

describe("isWorkflowTriggerSpec", () => {
  it("accepts valid triggers", () => {
    expect(
      isWorkflowTriggerSpec({ eventType: "task.created", advancesTo: "material" }),
    ).toBe(true);
    expect(isWorkflowTriggerSpec({ eventType: "run.finished" })).toBe(true);
  });

  it("rejects invalid triggers", () => {
    expect(isWorkflowTriggerSpec({ eventType: "task.deleted" })).toBe(false);
    expect(isWorkflowTriggerSpec({ eventType: "task.created", advancesTo: "planning" })).toBe(
      false,
    );
    expect(isWorkflowTriggerSpec(null)).toBe(false);
  });
});

describe("isWorkflowTransitionSpec", () => {
  it("accepts valid transitions", () => {
    expect(isWorkflowTransitionSpec({ from: "topic", to: "material" })).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(isWorkflowTransitionSpec({ from: "planning", to: "material" })).toBe(false);
    expect(isWorkflowTransitionSpec({ from: "topic" })).toBe(false);
  });
});

describe("createWorkflowTriggerSpec", () => {
  it("creates trigger specs", () => {
    expect(
      createWorkflowTriggerSpec({ eventType: "activity.recorded", advancesTo: "editing" }),
    ).toEqual({
      eventType: "activity.recorded",
      advancesTo: "editing",
    });
  });
});

describe("createWorkflowTransitionSpec", () => {
  it("creates transition specs", () => {
    expect(createWorkflowTransitionSpec({ from: "material", to: "editing" })).toEqual({
      from: "material",
      to: "editing",
    });
  });
});

describe("createWorkflowDefinition", () => {
  it("creates workflow definitions with defaults", () => {
    const definition = createWorkflowDefinition({
      id: "wf-1",
      name: "Creator flow",
      stages: ["topic", "material", "editing", "release", "review"],
    });

    expect(definition.template.id).toBe("wf-1");
    expect(definition.template.active).toBe(true);
    expect(definition.defaultStage).toBe("topic");
    expect(definition.triggers).toEqual([]);
    expect(definition.transitions).toEqual([]);
  });

  it("preserves explicit values", () => {
    const trigger = createWorkflowTriggerSpec({
      eventType: "task.updated",
      advancesTo: "release",
    });
    const transition = createWorkflowTransitionSpec({
      from: "editing",
      to: "release",
    });
    const definition = createWorkflowDefinition({
      id: "wf-2",
      name: "Release flow",
      description: "Moves assets toward release",
      stages: ["editing", "release", "review"],
      defaultStage: "editing",
      active: false,
      triggers: [trigger],
      transitions: [transition],
    });

    expect(definition.template.description).toBe("Moves assets toward release");
    expect(definition.template.active).toBe(false);
    expect(definition.defaultStage).toBe("editing");
    expect(definition.triggers).toEqual([trigger]);
    expect(definition.transitions).toEqual([transition]);
  });
});

describe("isWorkflowDefinition", () => {
  it("accepts valid workflow definitions", () => {
    const definition = createWorkflowDefinition({
      id: "wf-3",
      name: "Review flow",
      stages: ["topic", "material", "editing", "release", "review"],
      triggers: [createWorkflowTriggerSpec({ eventType: "run.finished" })],
      transitions: [createWorkflowTransitionSpec({ from: "release", to: "review" })],
    });

    expect(isWorkflowDefinition(definition)).toBe(true);
  });

  it("rejects invalid workflow definitions", () => {
    expect(
      isWorkflowDefinition({
        template: {
          id: "wf-4",
          name: "Broken",
          stages: ["planning"],
          active: true,
        },
        defaultStage: "topic",
        triggers: [],
        transitions: [],
      }),
    ).toBe(false);
    expect(
      isWorkflowDefinition({
        template: {
          id: "wf-5",
          name: "Broken",
          stages: ["topic"],
          active: true,
        },
        defaultStage: "topic",
        triggers: [{ eventType: "task.deleted" }],
        transitions: [],
      }),
    ).toBe(false);
  });
});

describe("normalizers", () => {
  it("normalizes valid trigger specs", () => {
    const trigger = { eventType: "run.started", advancesTo: "editing" };
    expect(normalizeWorkflowTriggerSpec(trigger)).toEqual(trigger);
  });

  it("returns null for invalid trigger specs", () => {
    expect(normalizeWorkflowTriggerSpec({ eventType: "run.cancelled" })).toBeNull();
  });

  it("normalizes valid transition specs", () => {
    const transition = { from: "topic", to: "material" };
    expect(normalizeWorkflowTransitionSpec(transition)).toEqual(transition);
  });

  it("returns null for invalid transition specs", () => {
    expect(normalizeWorkflowTransitionSpec({ from: "planning", to: "material" })).toBeNull();
  });

  it("normalizes valid workflow definitions", () => {
    const definition = createWorkflowDefinition({
      id: "wf-6",
      name: "Creator flow",
      stages: ["topic", "material", "editing", "release", "review"],
    });

    expect(normalizeWorkflowDefinition(definition)).toEqual(definition);
  });

  it("returns null for invalid workflow definitions", () => {
    expect(
      normalizeWorkflowDefinition({
        template: { id: "wf-7", name: "Broken", stages: ["topic"] },
        defaultStage: "topic",
        triggers: [],
        transitions: [],
      }),
    ).toBeNull();
  });
});
