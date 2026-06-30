import { createWorkflowTemplate, type TaskStage } from "@open-design/creator-domain";
import type {
  WorkflowDefinition,
  WorkflowTransitionSpec,
  WorkflowTriggerSpec,
} from "./types.js";

export function createWorkflowTriggerSpec(input: {
  eventType: WorkflowTriggerSpec["eventType"];
  advancesTo?: TaskStage;
}): WorkflowTriggerSpec {
  return {
    eventType: input.eventType,
    advancesTo: input.advancesTo,
  };
}

export function createWorkflowTransitionSpec(input: {
  from: TaskStage;
  to: TaskStage;
}): WorkflowTransitionSpec {
  return {
    from: input.from,
    to: input.to,
  };
}

export function createWorkflowDefinition(input: {
  id: string;
  name: string;
  description?: string;
  stages: TaskStage[];
  defaultStage?: TaskStage;
  active?: boolean;
  triggers?: WorkflowTriggerSpec[];
  transitions?: WorkflowTransitionSpec[];
}): WorkflowDefinition {
  const stages = input.stages;

  return {
    template: createWorkflowTemplate({
      id: input.id,
      name: input.name,
      description: input.description,
      stages,
      active: input.active,
    }),
    defaultStage: input.defaultStage ?? stages[0] ?? "topic",
    triggers: input.triggers ?? [],
    transitions: input.transitions ?? [],
  };
}
