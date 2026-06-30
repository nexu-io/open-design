/**
 * Creator Dashboard Adapter — minimal page wiring layer.
 *
 * Connects @open-design/creator-domain / creator-events / creator-workflows /
 * creator-ui into a single pure function that produces dashboard-ready view-models.
 */

import type { Task } from "@open-design/creator-domain";
import type { CreatorEvent } from "@open-design/creator-events";
import type { WorkflowDefinition } from "@open-design/creator-workflows";
import type {
  ActivityItemViewModel,
  TaskCardViewModel,
  WorkflowSummaryViewModel,
} from "@open-design/creator-ui";
import {
  toActivityItemViewModelFromActivity,
  toActivityItemViewModelFromEvent,
  toTaskCardViewModel,
  toWorkflowSummaryViewModel,
} from "@open-design/creator-ui";
import type { ActivityEvent } from "@open-design/creator-domain";
import { creatorMockData, type CreatorMockData } from "./mock-data.js";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface CreatorDashboardData {
  tasks: TaskCardViewModel[];
  activities: ActivityItemViewModel[];
  workflows: WorkflowSummaryViewModel[];
}

export interface BuildCreatorDashboardDataOptions {
  tasks?: Task[];
  activities?: ActivityEvent[];
  events?: CreatorEvent[];
  workflows?: WorkflowDefinition[];
}

// ---------------------------------------------------------------------------
// Pure function
// ---------------------------------------------------------------------------

export function buildCreatorDashboardData(
  input: BuildCreatorDashboardDataOptions = {},
): CreatorDashboardData {
  const taskVms = (input.tasks ?? []).map(toTaskCardViewModel);

  const activityVms: ActivityItemViewModel[] = [];
  for (const activity of input.activities ?? []) {
    activityVms.push(toActivityItemViewModelFromActivity(activity));
  }
  for (const event of input.events ?? []) {
    const vm = toActivityItemViewModelFromEvent(event);
    if (vm !== null) activityVms.push(vm);
  }

  const workflowVms = (input.workflows ?? []).map(toWorkflowSummaryViewModel);

  return { tasks: taskVms, activities: activityVms, workflows: workflowVms };
}

// ---------------------------------------------------------------------------
// Mock data export
// ---------------------------------------------------------------------------

export { creatorMockData };
