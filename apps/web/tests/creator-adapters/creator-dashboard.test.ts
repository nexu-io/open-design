import { describe, expect, it } from "vitest";
import {
  buildCreatorDashboardData,
  creatorMockData,
  type CreatorDashboardData,
} from "../../src/creator-adapters/index.js";
import type { ActivityEvent, Task } from "@open-design/creator-domain";
import type { CreatorEvent } from "@open-design/creator-events";
import type { WorkflowDefinition } from "@open-design/creator-workflows";

// ---------------------------------------------------------------------------
// buildCreatorDashboardData
// ---------------------------------------------------------------------------

describe("buildCreatorDashboardData", () => {
  it("returns empty arrays when no input provided", () => {
    const result = buildCreatorDashboardData({});
    expect(result.tasks).toEqual([]);
    expect(result.activities).toEqual([]);
    expect(result.workflows).toEqual([]);
  });

  it("maps tasks to TaskCardViewModel[]", () => {
    const tasks: Task[] = [
      {
        id: "t-1",
        projectId: "p-1",
        title: "Test",
        stage: "topic",
        status: "todo",
        priority: "high",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
      },
    ];
    const result = buildCreatorDashboardData({ tasks });
    expect(result.tasks).toHaveLength(1);
    const firstTask = result.tasks[0]!;
    expect(firstTask.id).toBe("t-1");
    expect(firstTask.stageLabel).toBe("选题");
    expect(firstTask.priorityLabel).toBe("高");
  });

  it("maps activities to ActivityItemViewModel[]", () => {
    const activities: ActivityEvent[] = [
      {
        id: "a-1",
        projectId: "p-1",
        category: "topic",
        title: "Research",
        createdAt: "2025-01-01T00:00:00Z",
        triggerSource: { sourceBlock: "manual", sourceTitle: "Timer" },
      },
    ];
    const result = buildCreatorDashboardData({ activities });
    expect(result.activities).toHaveLength(1);
    const firstActivity = result.activities[0]!;
    expect(firstActivity.title).toBe("Research");
    expect(firstActivity.categoryLabel).toBe("选题");
    expect(firstActivity.triggerSourceLabel).toBe("来源：manual / Timer");
  });

  it("appends event-derived activity items after activity-derived items", () => {
    const activity: ActivityEvent = {
      id: "a-1",
      projectId: "p-1",
      category: "topic",
      title: "Activity title",
      createdAt: "2025-01-01T00:00:00Z",
    };

    const event: CreatorEvent = {
      type: "run.started",
      id: "e-1",
      projectId: "p-1",
      occurredAt: "2025-01-02T00:00:00Z",
      payload: {
        session: {
          id: "s-1",
          projectId: "p-1",
          workflowId: "w-1",
          prompt: "test",
          startedAt: "2025-01-02T00:00:00Z",
          status: "running",
        },
      },
    };

    const result = buildCreatorDashboardData({ activities: [activity], events: [event] });
    expect(result.activities).toHaveLength(2);
    expect(result.activities[0]!.title).toBe("Activity title");
    expect(result.activities[1]!.title).toBe("运行开始");
    expect(result.activities[1]!.category).toBe("system");
  });

  it("excludes task.created and task.updated events from activities", () => {
    const task: Task = {
      id: "t-1",
      projectId: "p-1",
      title: "New",
      stage: "topic",
      status: "todo",
      priority: "medium",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    const events: CreatorEvent[] = [
      {
        type: "task.created",
        id: "e-1",
        projectId: "p-1",
        occurredAt: "2025-01-01T00:00:00Z",
        payload: { task },
      },
      {
        type: "task.updated",
        id: "e-2",
        projectId: "p-1",
        occurredAt: "2025-01-02T00:00:00Z",
        payload: { task, previousStatus: "todo" },
      },
    ];

    const result = buildCreatorDashboardData({ events });
    expect(result.activities).toEqual([]);
  });

  it("maps workflows to WorkflowSummaryViewModel[]", () => {
    const workflows: WorkflowDefinition[] = [
      {
        template: {
          id: "wf-1",
          name: "Pipeline",
          stages: ["topic", "editing"],
          active: true,
        },
        defaultStage: "topic",
        triggers: [],
        transitions: [],
      },
    ];
    const result = buildCreatorDashboardData({ workflows });
    expect(result.workflows).toHaveLength(1);
    const firstWorkflow = result.workflows[0]!;
    expect(firstWorkflow.id).toBe("wf-1");
    expect(firstWorkflow.defaultStageLabel).toBe("选题");
  });
});

// ---------------------------------------------------------------------------
// Mock data smoke test
// ---------------------------------------------------------------------------

describe("creatorMockData", () => {
  it("produces valid dashboard data with all sections populated", () => {
    const result = buildCreatorDashboardData({
      tasks: creatorMockData.tasks,
      activities: creatorMockData.activities,
      events: creatorMockData.events,
      workflows: [creatorMockData.workflow],
    });

    // Tasks
    expect(result.tasks).toHaveLength(2);
    const firstTask = result.tasks[0]!;
    expect(firstTask.stageLabel).toBe("选题");
    expect(firstTask.priorityLabel).toBe("高");
    expect(firstTask.sourceLabel).toBe("manual");

    // Activities (2 from activities + 4 from events - 0 excluded = 6)
    expect(result.activities).toHaveLength(6);
    // First activity from mockActivities[0] has triggerSource
    const firstActivity = result.activities[0]!;
    expect(firstActivity.triggerSourceLabel).toBe("来源：manual / 会议");
    // Event-derived run.started has system category (index 3 after 2 activities)
    const eventActivity = result.activities[3]!;
    expect(eventActivity.category).toBe("system");
    expect(eventActivity.categoryLabel).toBe("系统");

    // Workflows
    expect(result.workflows).toHaveLength(1);
    const firstWorkflow = result.workflows[0]!;
    expect(firstWorkflow.name).toBe("标准视频流程");
    expect(firstWorkflow.defaultStageLabel).toBe("选题");
    expect(firstWorkflow.stageLabels).toEqual([
      "选题",
      "素材",
      "剪辑",
      "发布",
      "复盘",
    ]);
  });
});
