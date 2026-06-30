/**
 * Minimal mock data for the creator dashboard adapter.
 * Uses factory functions from @open-design/creator-domain and
 * @open-design/creator-events to produce valid domain objects.
 */

import { createActivityEvent, createRunback, createRunSession, createTask, createWorkflowTemplate } from "@open-design/creator-domain";
import { createActivityRecordedEvent, createRunFinishedEvent, createRunStartedEvent, createRunbackRecordedEvent, type CreatorEvent } from "@open-design/creator-events";
import { createWorkflowDefinition } from "@open-design/creator-workflows";

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const mockTasks = [
  createTask({
    id: "t-1",
    projectId: "p-1",
    title: "选题：夏季短片",
    description: "确定主题和风格",
    stage: "topic",
    status: "todo",
    priority: "high",
    sourceType: "manual",
  }),
  createTask({
    id: "t-2",
    projectId: "p-1",
    title: "素材收集",
    description: "户外拍摄 B-roll",
    stage: "material",
    status: "ready",
    priority: "medium",
    sourceType: "import",
  }),
];

// ---------------------------------------------------------------------------
// Activities (domain objects)
// ---------------------------------------------------------------------------

export const mockActivities = [
  createActivityEvent({
    id: "a-1",
    projectId: "p-1",
    taskId: "t-1",
    category: "topic",
    title: "选题讨论完成",
    summary: "团队确定夏季短片方向",
    triggerSource: { sourceBlock: "manual", sourceTitle: "会议" },
  }),
  createActivityEvent({
    id: "a-2",
    projectId: "p-1",
    taskId: "t-2",
    category: "material",
    title: "素材入库",
    summary: undefined,
    triggerSource: undefined,
  }),
];

// ---------------------------------------------------------------------------
// CreatorEvent envelopes
// ---------------------------------------------------------------------------

const baseRunSession = createRunSession({
  id: "s-1",
  projectId: "p-1",
  workflowId: "wf-1",
  prompt: "generate draft",
});

const baseRunback = createRunback({
  id: "rb-1",
  projectId: "p-1",
  runSessionId: "s-1",
  title: "Draft v1",
});

const activityForEvent = mockActivities[0]!;

export const mockEvents: CreatorEvent[] = [
  createActivityRecordedEvent({
    id: "e-1",
    projectId: "p-1",
    activity: activityForEvent,
  }),
  createRunStartedEvent({
    id: "e-2",
    projectId: "p-1",
    session: baseRunSession,
  }),
  createRunFinishedEvent({
    id: "e-3",
    projectId: "p-1",
    session: baseRunSession,
  }),
  createRunbackRecordedEvent({
    id: "e-4",
    projectId: "p-1",
    runback: baseRunback,
  }),
];

// ---------------------------------------------------------------------------
// WorkflowDefinition
// ---------------------------------------------------------------------------

export const mockWorkflow = createWorkflowDefinition({
  id: "wf-1",
  name: "标准视频流程",
  description: "从选题到发布的标准工作流",
  stages: ["topic", "material", "editing", "release", "review"],
  defaultStage: "topic",
  active: true,
});

// ---------------------------------------------------------------------------
// Aggregated mock data
// ---------------------------------------------------------------------------

export interface CreatorMockData {
  tasks: ReturnType<typeof createTask>[];
  activities: ReturnType<typeof createActivityEvent>[];
  events: CreatorEvent[];
  workflow: ReturnType<typeof createWorkflowDefinition>;
}

export const creatorMockData: CreatorMockData = {
  tasks: mockTasks,
  activities: mockActivities,
  events: mockEvents,
  workflow: mockWorkflow,
};
