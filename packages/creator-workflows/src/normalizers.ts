import {
  isWorkflowDefinition,
  isWorkflowTransitionSpec,
  isWorkflowTriggerSpec,
} from "./guards.js";
import type {
  WorkflowDefinition,
  WorkflowTransitionSpec,
  WorkflowTriggerSpec,
} from "./types.js";

export function normalizeWorkflowTriggerSpec(input: unknown): WorkflowTriggerSpec | null {
  return isWorkflowTriggerSpec(input) ? input : null;
}

export function normalizeWorkflowTransitionSpec(input: unknown): WorkflowTransitionSpec | null {
  return isWorkflowTransitionSpec(input) ? input : null;
}

export function normalizeWorkflowDefinition(input: unknown): WorkflowDefinition | null {
  return isWorkflowDefinition(input) ? input : null;
}
