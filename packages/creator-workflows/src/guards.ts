import { isTaskStage } from "@open-design/creator-domain";
import { isCreatorEventType } from "@open-design/creator-events";
import type {
  WorkflowDefinition,
  WorkflowTransitionSpec,
  WorkflowTriggerSpec,
} from "./types.js";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isWorkflowTriggerSpec(value: unknown): value is WorkflowTriggerSpec {
  if (!isObjectRecord(value)) return false;
  return (
    isCreatorEventType(value.eventType) &&
    (value.advancesTo === undefined || isTaskStage(value.advancesTo))
  );
}

export function isWorkflowTransitionSpec(value: unknown): value is WorkflowTransitionSpec {
  if (!isObjectRecord(value)) return false;
  return isTaskStage(value.from) && isTaskStage(value.to);
}

export function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  if (!isObjectRecord(value)) return false;
  if (!isObjectRecord(value.template)) return false;
  if (!Array.isArray(value.triggers) || !Array.isArray(value.transitions)) return false;

  return (
    typeof value.template.id === "string" &&
    typeof value.template.name === "string" &&
    Array.isArray(value.template.stages) &&
    value.template.stages.every((stage) => isTaskStage(stage)) &&
    typeof value.template.active === "boolean" &&
    isTaskStage(value.defaultStage) &&
    value.triggers.every((trigger) => isWorkflowTriggerSpec(trigger)) &&
    value.transitions.every((transition) => isWorkflowTransitionSpec(transition))
  );
}
