import type { TaskStage, WorkflowTemplate } from "@open-design/creator-domain";
import type { CreatorEventType } from "@open-design/creator-events";

export interface WorkflowTriggerSpec {
  eventType: CreatorEventType;
  advancesTo?: TaskStage;
}

export interface WorkflowTransitionSpec {
  from: TaskStage;
  to: TaskStage;
}

export interface WorkflowDefinition {
  template: WorkflowTemplate;
  defaultStage: TaskStage;
  triggers: WorkflowTriggerSpec[];
  transitions: WorkflowTransitionSpec[];
}
