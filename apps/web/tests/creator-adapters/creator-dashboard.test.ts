import { describe, expect, it } from "vitest";
import {
  buildCreatorDashboardData,
  buildCreatorDashboardDataFromOpenDesign,
  creatorMockData,
  type CreatorDashboardData,
} from "../../src/creator-adapters/index.js";
import type { ChatRunStatusResponse, Project, ProjectMetadata } from "@open-design/contracts";
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

  it("appends non-duplicate event-derived activity items after activity-derived items", () => {
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
    expect(result.activities.map((item) => item.title)).toEqual([
      "运行开始",
      "Activity title",
    ]);
    expect(result.activities[0]!.category).toBe("system");
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

    // Activities (2 from activities + 4 from events - 1 duplicate activity.recorded = 5)
    expect(result.activities).toHaveLength(5);
    // First activity from mockActivities[0] has triggerSource
    const sourceActivity = result.activities.find((item) => item.title === "选题讨论完成");
    expect(sourceActivity?.triggerSourceLabel).toBe("来源：manual / 会议");
    const eventActivity = result.activities.find((item) => item.title === "运行开始");
    if (!eventActivity) {
      throw new Error("expected 运行开始 activity to exist");
    }
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

  it("dedupes activity.recorded events when the same activity already exists in domain input", () => {
    const result = buildCreatorDashboardData({
      activities: creatorMockData.activities,
      events: creatorMockData.events,
    });

    const matching = result.activities.filter((item) => item.title === "选题讨论完成");
    expect(matching).toHaveLength(1);
  });
});

describe("buildCreatorDashboardDataFromOpenDesign", () => {
  it("maps open design projects into task and activity view-models", () => {
    const project: Project = {
      id: "project-1",
      name: "校园黄昏短片",
      skillId: null,
      designSystemId: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      pendingPrompt: "整理素材并推进剪辑节奏",
      metadata: { kind: "video" satisfies ProjectMetadata["kind"] },
      status: { value: "running" },
    };

    const result = buildCreatorDashboardDataFromOpenDesign({
      projects: [project],
      runs: [],
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.activities).toHaveLength(1);
    expect(result.workflows).toHaveLength(1);

    const firstTask = result.tasks[0]!;
    expect(firstTask.projectId).toBe("project-1");
    expect(firstTask.title).toBe("校园黄昏短片");
    expect(firstTask.stage).toBe("editing");
    expect(firstTask.stageLabel).toBe("剪辑");
    expect(firstTask.status).toBe("ready");
    expect(firstTask.sourceLabel).toBe("video");

    const firstActivity = result.activities[0]!;
    expect(firstActivity.projectId).toBe("project-1");
    expect(firstActivity.title).toBe("校园黄昏短片");
    expect(firstActivity.summary).toBe("整理素材并推进剪辑节奏");
    expect(firstActivity.categoryLabel).toBe("剪辑");
    expect(firstActivity.triggerSourceLabel).toBe("来源：video");

    const workflow = result.workflows[0]!;
    expect(workflow.name).toBe("Media production pipeline");
    expect(workflow.defaultStage).toBe("editing");
    expect(result.focus).toEqual({
      projectId: "project-1",
      conversationId: null,
      assistantMessageId: null,
      title: "校园黄昏短片",
      description: "整理素材并推进剪辑节奏",
      stageLabel: "剪辑",
      statusLabel: "就绪",
      sourceLabel: "video",
      reason: "Ready brief, no run yet",
      recommendedAction: "Start first run",
    });
  });

  it("sorts tasks by urgency and newest activity first", () => {
    const projects: Project[] = [
      {
        id: "project-low",
        name: "已完成项目",
        skillId: null,
        designSystemId: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_010_000,
        metadata: { kind: "prototype" satisfies ProjectMetadata["kind"] },
        status: { value: "succeeded" },
      },
      {
        id: "project-high",
        name: "待处理剪辑",
        skillId: null,
        designSystemId: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_020_000,
        metadata: { kind: "video" satisfies ProjectMetadata["kind"] },
        status: { value: "failed" },
      },
    ];

    const runs: ChatRunStatusResponse[] = [
      {
        id: "run-late",
        projectId: "project-high",
        conversationId: "conv-1",
        assistantMessageId: "msg-1",
        agentId: "codex",
        status: "failed",
        createdAt: 1_700_000_030_000,
        updatedAt: 1_700_000_040_000,
      },
    ];

    const result = buildCreatorDashboardDataFromOpenDesign({ projects, runs });
    expect(result.tasks[0]!.title).toBe("待处理剪辑");
    expect(result.activities.map((item) => item.title)).toEqual([
      "待处理剪辑",
      "运行完成",
      "运行开始",
      "已完成项目",
    ]);
    expect(result.focus?.title).toBe("待处理剪辑");
    expect(result.focus?.conversationId).toBe("conv-1");
    expect(result.focus?.assistantMessageId).toBe("msg-1");
    expect(result.focus?.reason).toBe("Latest run failed");
    expect(result.focus?.recommendedAction).toBe("Retry run");
  });

  it("derives run events and runback rows from succeeded runs", () => {
    const project: Project = {
      id: "project-2",
      name: "相机样片整理",
      skillId: null,
      designSystemId: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      metadata: { kind: "image" satisfies ProjectMetadata["kind"] },
    };

    const run: ChatRunStatusResponse = {
      id: "run-1",
      projectId: "project-2",
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
      agentId: "codex",
      status: "succeeded",
      createdAt: 1_700_000_050_000,
      updatedAt: 1_700_000_120_000,
    };

    const result = buildCreatorDashboardDataFromOpenDesign({
      projects: [project],
      runs: [run],
    });

    expect(result.activities.every((item) => item.projectId === "project-2")).toBe(true);
    expect(result.activities.map((item) => item.title)).toContain("运行开始");
    expect(result.activities.map((item) => item.title)).toContain("运行完成");
    expect(result.activities.map((item) => item.title)).toContain("Run output · 相机样片整理");
  });

  it("does not add duplicate project summary activity when runs already exist", () => {
    const project: Project = {
      id: "project-4",
      name: "有运行记录的项目",
      skillId: null,
      designSystemId: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      metadata: { kind: "video" satisfies ProjectMetadata["kind"] },
      status: { value: "running" },
    };

    const run: ChatRunStatusResponse = {
      id: "run-4",
      projectId: "project-4",
      conversationId: "conv-4",
      assistantMessageId: "msg-4",
      agentId: "codex",
      status: "running",
      createdAt: 1_700_000_050_000,
      updatedAt: 1_700_000_120_000,
    };

    const result = buildCreatorDashboardDataFromOpenDesign({
      projects: [project],
      runs: [run],
    });

    expect(result.activities.map((item) => item.title)).toEqual(["运行开始"]);
    expect(result.focus?.conversationId).toBe("conv-4");
    expect(result.focus?.assistantMessageId).toBe("msg-4");
    expect(result.focus?.reason).toBe("Run in progress");
    expect(result.focus?.recommendedAction).toBe("Monitor run");
  });

  it("skips runback activity for non-succeeded runs", () => {
    const project: Project = {
      id: "project-3",
      name: "失败样例",
      skillId: null,
      designSystemId: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      metadata: { kind: "prototype" satisfies ProjectMetadata["kind"] },
    };

    const run: ChatRunStatusResponse = {
      id: "run-2",
      projectId: "project-3",
      conversationId: "conv-2",
      assistantMessageId: "msg-2",
      agentId: "codex",
      status: "failed",
      createdAt: 1_700_000_050_000,
      updatedAt: 1_700_000_120_000,
      error: "boom",
    };

    const result = buildCreatorDashboardDataFromOpenDesign({
      projects: [project],
      runs: [run],
    });

    expect(result.activities.map((item) => item.title)).toContain("运行开始");
    expect(result.activities.map((item) => item.title)).toContain("运行完成");
    expect(result.activities.map((item) => item.title)).not.toContain("Run output · 失败样例");
  });

  it("splits workflows into media and general lanes when both kinds exist", () => {
    const projects: Project[] = [
      {
        id: "project-media",
        name: "视频项目",
        skillId: null,
        designSystemId: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_100_000,
        metadata: { kind: "video" satisfies ProjectMetadata["kind"] },
      },
      {
        id: "project-general",
        name: "原型项目",
        skillId: null,
        designSystemId: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_110_000,
        metadata: { kind: "prototype" satisfies ProjectMetadata["kind"] },
      },
    ];

    const result = buildCreatorDashboardDataFromOpenDesign({
      projects,
      runs: [],
    });

    expect(result.workflows).toHaveLength(2);
    expect(result.workflows.map((item) => item.name)).toEqual([
      "Creator workbench",
      "Media production pipeline",
    ]);
  });

  it("prioritizes ready brief with no run over generic task ordering", () => {
    const projects: Project[] = [
      {
        id: "project-brief",
        name: "有明确 brief 的项目",
        skillId: null,
        designSystemId: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_200_000,
        pendingPrompt: "准备一条完整的校园摄影工作流",
        metadata: { kind: "prototype" satisfies ProjectMetadata["kind"] },
        status: { value: "not_started" },
      },
      {
        id: "project-normal",
        name: "普通项目",
        skillId: null,
        designSystemId: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_100_000,
        metadata: { kind: "video" satisfies ProjectMetadata["kind"] },
        status: { value: "queued" },
      },
    ];

    const result = buildCreatorDashboardDataFromOpenDesign({
      projects,
      runs: [],
    });

    expect(result.focus?.title).toBe("有明确 brief 的项目");
    expect(result.focus?.reason).toBe("Ready brief, no run yet");
    expect(result.focus?.recommendedAction).toBe("Start first run");
  });

  it("keeps focus mapped by projectId when multiple projects share the same name", () => {
    const projects: Project[] = [
      {
        id: "project-a",
        name: "重复名称项目",
        skillId: null,
        designSystemId: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_020_000,
        pendingPrompt: "A 项目 prompt",
        metadata: { kind: "video" satisfies ProjectMetadata["kind"] },
        status: { value: "running" },
      },
      {
        id: "project-b",
        name: "重复名称项目",
        skillId: null,
        designSystemId: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_030_000,
        pendingPrompt: "B 项目 prompt",
        metadata: { kind: "image" satisfies ProjectMetadata["kind"] },
        status: { value: "queued" },
      },
    ];

    const result = buildCreatorDashboardDataFromOpenDesign({
      projects,
      runs: [
        {
          id: "run-a",
          projectId: "project-a",
          conversationId: "conv-a",
          assistantMessageId: "msg-a",
          agentId: "codex",
          status: "running",
          createdAt: 1_700_000_040_000,
          updatedAt: 1_700_000_050_000,
        },
      ],
    });

    expect(result.focus?.projectId).toBe("project-a");
    expect(result.focus?.conversationId).toBe("conv-a");
    expect(result.focus?.assistantMessageId).toBe("msg-a");
    expect(result.focus?.reason).toBe("Run in progress");
    expect(result.focus?.recommendedAction).toBe("Monitor run");
  });
});
