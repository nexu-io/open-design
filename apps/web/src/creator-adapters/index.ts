/**
 * Creator Dashboard Adapter — minimal page wiring layer.
 *
 * Connects @open-design/creator-domain / creator-events / creator-workflows /
 * creator-ui into a single pure function that produces dashboard-ready view-models.
 */

import type { ChatRunStatusResponse, Project as OpenDesignProject } from "@open-design/contracts";
import {
  createActivityEvent,
  createRunback,
  createRunSession,
  createTask,
} from "@open-design/creator-domain";
import type {
  ActivityCategory,
  Task,
  TaskStage,
  TaskStatus,
} from "@open-design/creator-domain";
import type { CreatorEvent } from "@open-design/creator-events";
import {
  createRunFinishedEvent,
  createRunStartedEvent,
  createRunbackRecordedEvent,
} from "@open-design/creator-events";
import { createWorkflowDefinition } from "@open-design/creator-workflows";
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
import { creatorMockData } from "./mock-data";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface CreatorDashboardData {
  focus: CreatorFocusCard | null;
  tasks: TaskCardViewModel[];
  activities: ActivityItemViewModel[];
  workflows: WorkflowSummaryViewModel[];
}

export const CREATOR_FOCUS_REASONS = {
  latestRunFailed: "latest_run_failed",
  runQueued: "run_queued",
  runInProgress: "run_in_progress",
  freshResultToReview: "fresh_result_to_review",
  readyBriefNoRunYet: "ready_brief_no_run_yet",
  needsIntervention: "needs_intervention",
  activePriority: "active_priority",
  nextBestTask: "next_best_task",
} as const;

export const CREATOR_FOCUS_ACTIONS = {
  retryRun: "retry_run",
  monitorRun: "monitor_run",
  reviewOutput: "review_output",
  startFirstRun: "start_first_run",
  unblockProject: "unblock_project",
  continueEditing: "continue_editing",
  continueTask: "continue_task",
} as const;

export const CREATOR_FOCUS_REASON_LABELS = {
  [CREATOR_FOCUS_REASONS.latestRunFailed]: "Latest run failed",
  [CREATOR_FOCUS_REASONS.runQueued]: "Run queued",
  [CREATOR_FOCUS_REASONS.runInProgress]: "Run in progress",
  [CREATOR_FOCUS_REASONS.freshResultToReview]: "Fresh result to review",
  [CREATOR_FOCUS_REASONS.readyBriefNoRunYet]: "Ready brief, no run yet",
  [CREATOR_FOCUS_REASONS.needsIntervention]: "Needs intervention",
  [CREATOR_FOCUS_REASONS.activePriority]: "Active priority",
  [CREATOR_FOCUS_REASONS.nextBestTask]: "Next best task",
} as const satisfies Record<
  (typeof CREATOR_FOCUS_REASONS)[keyof typeof CREATOR_FOCUS_REASONS],
  string
>;

export const CREATOR_FOCUS_ACTION_LABELS = {
  [CREATOR_FOCUS_ACTIONS.retryRun]: "Retry run",
  [CREATOR_FOCUS_ACTIONS.monitorRun]: "Monitor run",
  [CREATOR_FOCUS_ACTIONS.reviewOutput]: "Review output",
  [CREATOR_FOCUS_ACTIONS.startFirstRun]: "Start first run",
  [CREATOR_FOCUS_ACTIONS.unblockProject]: "Unblock project",
  [CREATOR_FOCUS_ACTIONS.continueEditing]: "Continue editing",
  [CREATOR_FOCUS_ACTIONS.continueTask]: "Continue task",
} as const satisfies Record<
  (typeof CREATOR_FOCUS_ACTIONS)[keyof typeof CREATOR_FOCUS_ACTIONS],
  string
>;

export type CreatorFocusReasonKey =
  (typeof CREATOR_FOCUS_REASONS)[keyof typeof CREATOR_FOCUS_REASONS];
export type CreatorFocusActionKey =
  (typeof CREATOR_FOCUS_ACTIONS)[keyof typeof CREATOR_FOCUS_ACTIONS];

export interface CreatorFocusCard {
  projectId?: string;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  title: string;
  description?: string;
  stageLabel?: string;
  statusLabel?: string;
  sourceLabel?: string;
  reasonKey: CreatorFocusReasonKey;
  reasonLabel: string;
  recommendedActionKey: CreatorFocusActionKey;
  recommendedActionLabel: string;
}

export interface BuildCreatorDashboardDataOptions {
  tasks?: Task[];
  activities?: ActivityEvent[];
  events?: CreatorEvent[];
  workflows?: WorkflowDefinition[];
}

export interface BuildOpenDesignCreatorDashboardOptions {
  projects?: OpenDesignProject[];
  runs?: ChatRunStatusResponse[];
}

interface FocusCandidate {
  projectId?: string;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  title: string;
  description?: string;
  stageLabel?: string;
  statusLabel?: string;
  sourceLabel?: string;
  reasonKey: CreatorFocusReasonKey;
  recommendedActionKey: CreatorFocusActionKey;
  rank: number;
  moment: number;
}

function getCreatorFocusReasonLabel(reasonKey: CreatorFocusReasonKey): string {
  return CREATOR_FOCUS_REASON_LABELS[reasonKey];
}

function getCreatorFocusActionLabel(actionKey: CreatorFocusActionKey): string {
  return CREATOR_FOCUS_ACTION_LABELS[actionKey];
}

// ---------------------------------------------------------------------------
// Pure function
// ---------------------------------------------------------------------------

export function buildCreatorDashboardData(
  input: BuildCreatorDashboardDataOptions = {},
): CreatorDashboardData {
  const taskVms = [...(input.tasks ?? [])]
    .sort(compareCreatorTasks)
    .map(toTaskCardViewModel);

  const activityVms: ActivityItemViewModel[] = [];
  const activityIdsFromDomain = new Set<string>();
  for (const activity of input.activities ?? []) {
    activityIdsFromDomain.add(activity.id);
    activityVms.push(toActivityItemViewModelFromActivity(activity));
  }
  for (const event of input.events ?? []) {
    if (
      event.type === "activity.recorded" &&
      activityIdsFromDomain.has(event.payload.activity.id)
    ) {
      continue;
    }
    const vm = toActivityItemViewModelFromEvent(event);
    if (vm !== null) {
      activityVms.push({
        ...vm,
        id: `${event.type}:${event.id}:${vm.id}`,
      });
    }
  }
  activityVms.sort(compareActivityViewModelsNewestFirst);

  const workflowVms = [...(input.workflows ?? [])]
    .sort(compareWorkflowDefinitions)
    .map(toWorkflowSummaryViewModel);

  return {
    focus: buildFocusCard(taskVms, activityVms, undefined, undefined),
    tasks: taskVms,
    activities: activityVms,
    workflows: workflowVms,
  };
}

export function buildCreatorDashboardDataFromOpenDesign(
  input: BuildOpenDesignCreatorDashboardOptions = {},
): CreatorDashboardData {
  const projects = [...(input.projects ?? [])].sort((left, right) => right.updatedAt - left.updatedAt);
  const runs = [...(input.runs ?? [])].sort((left, right) => right.createdAt - left.createdAt);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const runCountsByProject = new Map<string, number>();
  for (const run of runs) {
    if (!run.projectId) continue;
    runCountsByProject.set(run.projectId, (runCountsByProject.get(run.projectId) ?? 0) + 1);
  }

  const tasks = projects.map((project) =>
    createTask({
      id: `project:${project.id}`,
      projectId: project.id,
      title: project.name,
      description: summarizeProject(project),
      stage: inferTaskStage(project),
      status: inferTaskStatus(project),
      priority: inferTaskPriority(project),
      sourceType: project.metadata?.kind,
      createdAt: toIsoString(project.createdAt),
      updatedAt: toIsoString(latestProjectMoment(project, runs)),
    }),
  );

  const activities = projects
    .filter((project) => shouldCreateProjectActivity(project, runCountsByProject.get(project.id) ?? 0))
    .map((project) =>
      createActivityEvent({
        id: `project-update:${project.id}`,
        projectId: project.id,
        category: stageToCategory(inferTaskStage(project)),
        title: project.name,
        summary: summarizeProject(project),
        createdAt: toIsoString(latestProjectMoment(project, runs)),
        triggerSource: buildTriggerSource(project),
      }),
    );

  const events: CreatorEvent[] = [];
  for (const run of runs) {
    const project = run.projectId ? projectById.get(run.projectId) : undefined;
    const session = createRunSession({
      id: `run-session:${run.id}`,
      projectId: run.projectId ?? "unknown-project",
      workflowId: inferWorkflowId(project),
      prompt: inferRunPrompt(project, run),
      startedAt: toIsoString(run.createdAt),
      finishedAt: isTerminalRunStatus(run.status) ? toIsoString(run.updatedAt) : undefined,
      status: inferRunSessionStatus(run.status),
    });

    events.push(
      createRunStartedEvent({
        id: `run-started:${run.id}`,
        projectId: session.projectId,
        session,
        occurredAt: session.startedAt,
      }),
    );

    if (!isTerminalRunStatus(run.status)) continue;

    events.push(
      createRunFinishedEvent({
        id: `run-finished:${run.id}`,
        projectId: session.projectId,
        session,
        occurredAt: session.finishedAt ?? toIsoString(run.updatedAt),
      }),
    );

    if (run.status !== "succeeded") continue;

    const runback = createRunback({
      id: `runback:${run.id}`,
      projectId: session.projectId,
      runSessionId: session.id,
      title: buildRunbackTitle(project),
      summary: run.error ?? undefined,
      createdAt: toIsoString(run.updatedAt),
      triggerSource: buildTriggerSource(project),
    });
    events.push(
      createRunbackRecordedEvent({
        id: `runback-recorded:${run.id}`,
        projectId: runback.projectId,
        runback,
        occurredAt: runback.createdAt,
      }),
    );
  }

  const workflows = buildWorkflowDefinitions(projects, runs);

  const dashboard = buildCreatorDashboardData({
    tasks,
    activities,
    events,
    workflows,
  });
  return {
    ...dashboard,
    focus: buildFocusCard(dashboard.tasks, dashboard.activities, projects, runs),
  };
}

function summarizeProject(project: OpenDesignProject): string | undefined {
  const prompt = project.pendingPrompt?.trim();
  if (prompt) return truncate(prompt, 140);

  const customInstructions = project.customInstructions?.trim();
  if (customInstructions) return truncate(customInstructions, 140);

  const promptTemplateTitle = project.metadata?.promptTemplate?.title?.trim();
  if (promptTemplateTitle) return promptTemplateTitle;

  const templateLabel = project.metadata?.templateLabel?.trim();
  if (templateLabel) return templateLabel;

  const kind = project.metadata?.kind;
  if (kind) return `Kind: ${kind}`;

  return undefined;
}

function inferTaskStage(project: OpenDesignProject): TaskStage {
  const displayStatus = project.status?.value;
  if (displayStatus === "succeeded" || displayStatus === "awaiting_input") return "review";
  if (displayStatus === "running" || displayStatus === "failed") return "editing";
  if (displayStatus === "queued") return "material";

  switch (project.metadata?.kind) {
    case "image":
      return "material";
    case "video":
    case "audio":
    case "deck":
      return "editing";
    case "prototype":
    case "template":
    case "brand":
    case "other":
    default:
      return "topic";
  }
}

function inferTaskStatus(project: OpenDesignProject): TaskStatus {
  switch (project.status?.value) {
    case "running":
    case "queued":
      return "ready";
    case "awaiting_input":
    case "failed":
      return "blocked";
    case "succeeded":
    case "canceled":
      return "done";
    case "not_started":
    default:
      return "todo";
  }
}

function inferTaskPriority(project: OpenDesignProject): "low" | "medium" | "high" {
  switch (project.status?.value) {
    case "running":
    case "failed":
    case "awaiting_input":
      return "high";
    case "queued":
    case "not_started":
      return "medium";
    case "succeeded":
    case "canceled":
    default:
      return "low";
  }
}

function stageToCategory(stage: TaskStage): ActivityCategory {
  return stage;
}

function buildTriggerSource(project: OpenDesignProject | undefined) {
  const kind = project?.metadata?.kind;
  if (!kind) return undefined;
  return {
    sourceBlock: kind,
    sourceTitle:
      project.metadata?.templateLabel?.trim() ||
      project.metadata?.promptTemplate?.title?.trim() ||
      undefined,
  };
}

function inferWorkflowId(project: OpenDesignProject | undefined): string {
  if (!project?.metadata?.kind) return "workflow:general";
  if (project.metadata.kind === "image" || project.metadata.kind === "video" || project.metadata.kind === "audio") {
    return "workflow:media";
  }
  return `workflow:${project.metadata.kind}`;
}

function inferRunPrompt(project: OpenDesignProject | undefined, run: ChatRunStatusResponse): string {
  return (
    project?.pendingPrompt?.trim() ||
    project?.customInstructions?.trim() ||
    project?.name ||
    run.assistantMessageId ||
    run.id
  );
}

function inferRunSessionStatus(
  status: ChatRunStatusResponse["status"],
): "running" | "succeeded" | "failed" {
  if (status === "succeeded") return "succeeded";
  if (status === "running" || status === "queued") return "running";
  return "failed";
}

function isTerminalRunStatus(status: ChatRunStatusResponse["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function buildRunbackTitle(project: OpenDesignProject | undefined): string {
  if (!project) return "Run output";
  return `Run output · ${project.name}`;
}

function inferWorkflowCatalogId(projects: OpenDesignProject[]): string {
  return projects.some(
    (project) =>
      project.metadata?.kind === "image" ||
      project.metadata?.kind === "video" ||
      project.metadata?.kind === "audio",
  )
    ? "workflow:media-production"
    : "workflow:creator-workbench";
}

function inferWorkflowName(projects: OpenDesignProject[]): string {
  return projects.some(
    (project) =>
      project.metadata?.kind === "image" ||
      project.metadata?.kind === "video" ||
      project.metadata?.kind === "audio",
  )
    ? "Media production pipeline"
    : "Creator workbench";
}

function inferDefaultStage(projects: OpenDesignProject[]): TaskStage {
  const counts = new Map<TaskStage, number>();
  for (const project of projects) {
    const stage = inferTaskStage(project);
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }

  let selected: TaskStage = "topic";
  let maxCount = -1;
  for (const stage of ["topic", "material", "editing", "release", "review"] as const) {
    const count = counts.get(stage) ?? 0;
    if (count > maxCount) {
      selected = stage;
      maxCount = count;
    }
  }
  return selected;
}

function latestProjectMoment(
  project: OpenDesignProject,
  runs: ChatRunStatusResponse[],
): number {
  let latest = project.updatedAt;
  for (const run of runs) {
    if (run.projectId !== project.id) continue;
    latest = Math.max(latest, run.updatedAt, run.createdAt);
  }
  return latest;
}

function shouldCreateProjectActivity(project: OpenDesignProject, runCount: number): boolean {
  if (runCount === 0) return true;
  const status = inferTaskStatus(project);
  return status === "blocked";
}

function buildWorkflowDefinitions(
  projects: OpenDesignProject[],
  runs: ChatRunStatusResponse[],
): WorkflowDefinition[] {
  const mediaProjects = projects.filter(isMediaProject);
  const generalProjects = projects.filter((project) => !isMediaProject(project));
  const definitions: WorkflowDefinition[] = [];

  if (mediaProjects.length > 0) {
    definitions.push(
      createWorkflowDefinition({
        id: inferWorkflowCatalogId(mediaProjects),
        name: inferWorkflowName(mediaProjects),
        description: summarizeWorkflowLane(mediaProjects, runs),
        stages: ["topic", "material", "editing", "release", "review"],
        defaultStage: inferDefaultStage(mediaProjects),
        active: mediaProjects.some(isActiveProject),
      }),
    );
  }

  if (generalProjects.length > 0) {
    definitions.push(
      createWorkflowDefinition({
        id: inferWorkflowCatalogId(generalProjects),
        name: inferWorkflowName(generalProjects),
        description: summarizeWorkflowLane(generalProjects, runs),
        stages: ["topic", "material", "editing", "release", "review"],
        defaultStage: inferDefaultStage(generalProjects),
        active: generalProjects.some(isActiveProject),
      }),
    );
  }

  return definitions;
}

function summarizeWorkflowLane(
  projects: OpenDesignProject[],
  runs: ChatRunStatusResponse[],
): string {
  const projectIds = new Set(projects.map((project) => project.id));
  const runCount = runs.filter((run) => run.projectId && projectIds.has(run.projectId)).length;
  return `${projects.length} projects · ${runCount} runs`;
}

function isMediaProject(project: OpenDesignProject): boolean {
  return (
    project.metadata?.kind === "image" ||
    project.metadata?.kind === "video" ||
    project.metadata?.kind === "audio"
  );
}

function isActiveProject(project: OpenDesignProject): boolean {
  return inferTaskStatus(project) !== "done";
}

function compareCreatorTasks(left: Task, right: Task): number {
  const priorityScore = comparePriority(right.priority, left.priority);
  if (priorityScore !== 0) return priorityScore;

  const statusScore = compareTaskStatusRank(right.status, left.status);
  if (statusScore !== 0) return statusScore;

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function comparePriority(
  left: Task["priority"],
  right: Task["priority"],
): number {
  return priorityRank(left) - priorityRank(right);
}

function priorityRank(priority: Task["priority"]): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function compareTaskStatusRank(
  left: TaskStatus,
  right: TaskStatus,
): number {
  return taskStatusRank(left) - taskStatusRank(right);
}

function taskStatusRank(status: TaskStatus): number {
  if (status === "blocked") return 4;
  if (status === "ready") return 3;
  if (status === "todo") return 2;
  return 1;
}

function compareActivityViewModelsNewestFirst(
  left: ActivityItemViewModel,
  right: ActivityItemViewModel,
): number {
  return Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
}

function compareWorkflowDefinitions(
  left: WorkflowDefinition,
  right: WorkflowDefinition,
): number {
  if (left.template.active !== right.template.active) {
    return left.template.active ? -1 : 1;
  }
  return left.template.name.localeCompare(right.template.name);
}

function buildFocusCard(
  tasks: TaskCardViewModel[],
  activities: ActivityItemViewModel[],
  projects?: OpenDesignProject[],
  runs?: ChatRunStatusResponse[],
): CreatorFocusCard | null {
  const candidates = buildFocusCandidates(tasks, activities, projects, runs);
  if (candidates.length === 0) return null;
  const best = candidates.sort(compareFocusCandidates)[0]!;
  return {
    projectId: best.projectId,
    conversationId: best.conversationId,
    assistantMessageId: best.assistantMessageId,
    title: best.title,
    description: best.description,
    stageLabel: best.stageLabel,
    statusLabel: best.statusLabel,
    sourceLabel: best.sourceLabel,
    reasonKey: best.reasonKey,
    reasonLabel: getCreatorFocusReasonLabel(best.reasonKey),
    recommendedActionKey: best.recommendedActionKey,
    recommendedActionLabel: getCreatorFocusActionLabel(best.recommendedActionKey),
  };
}

function buildFocusCandidates(
  tasks: TaskCardViewModel[],
  activities: ActivityItemViewModel[],
  projects?: OpenDesignProject[],
  runs?: ChatRunStatusResponse[],
): FocusCandidate[] {
  const candidates: FocusCandidate[] = [];
  const taskByProjectId = new Map(tasks.map((task) => [task.projectId, task]));
  const activityByProjectId = new Map<string, ActivityItemViewModel>();
  for (const activity of activities) {
    if (!activityByProjectId.has(activity.projectId)) {
      activityByProjectId.set(activity.projectId, activity);
    }
  }

  for (const task of tasks) {
    const relatedActivity = activityByProjectId.get(task.projectId);
    const fallbackMoment = resolveTaskMoment(task, relatedActivity);
    candidates.push({
      projectId: task.projectId,
      conversationId: undefined,
      assistantMessageId: undefined,
      title: task.title,
      description: task.description,
      stageLabel: task.stageLabel,
      statusLabel: task.statusLabel,
      sourceLabel: task.sourceLabel,
      reasonKey: resolveTaskFocusReason(task, relatedActivity),
      recommendedActionKey: resolveTaskRecommendedAction(task, relatedActivity),
      rank: resolveTaskFocusRank(task, relatedActivity),
      moment: fallbackMoment,
    });
  }

  if (projects && runs) {
    const projectById = new Map(projects.map((project) => [project.id, project]));
    for (const run of runs) {
      if (!run.projectId) continue;
      const project = projectById.get(run.projectId);
      if (!project) continue;
      const task = taskByProjectId.get(project.id);
      if (!task) continue;
      const focusFromRun = buildRunFocusCandidate(project, task, run);
      if (focusFromRun) {
        candidates.push(focusFromRun);
      }
    }

    for (const project of projects) {
      const task = taskByProjectId.get(project.id);
      if (!task) continue;
      const projectRuns = runs.filter((run) => run.projectId === project.id);
      if (projectRuns.length > 0) continue;
      const promptCandidate = buildPromptFocusCandidate(project, task);
      if (promptCandidate) {
        candidates.push(promptCandidate);
      }
    }
  }

  return candidates;
}

function buildRunFocusCandidate(
  project: OpenDesignProject,
  task: TaskCardViewModel,
  run: ChatRunStatusResponse,
): FocusCandidate | null {
  if (run.status === "failed") {
    return {
      projectId: project.id,
      conversationId: run.conversationId ?? null,
      assistantMessageId: run.assistantMessageId ?? null,
      title: project.name,
      description: task.description,
      stageLabel: task.stageLabel,
      statusLabel: task.statusLabel,
      sourceLabel: task.sourceLabel,
      reasonKey: CREATOR_FOCUS_REASONS.latestRunFailed,
      recommendedActionKey: CREATOR_FOCUS_ACTIONS.retryRun,
      rank: 100,
      moment: Math.max(run.updatedAt, run.createdAt),
    };
  }
  if (run.status === "queued") {
    return {
      projectId: project.id,
      conversationId: run.conversationId ?? null,
      assistantMessageId: run.assistantMessageId ?? null,
      title: project.name,
      description: task.description,
      stageLabel: task.stageLabel,
      statusLabel: task.statusLabel,
      sourceLabel: task.sourceLabel,
      reasonKey: CREATOR_FOCUS_REASONS.runQueued,
      recommendedActionKey: CREATOR_FOCUS_ACTIONS.monitorRun,
      rank: 90,
      moment: Math.max(run.updatedAt, run.createdAt),
    };
  }
  if (run.status === "running") {
    return {
      projectId: project.id,
      conversationId: run.conversationId ?? null,
      assistantMessageId: run.assistantMessageId ?? null,
      title: project.name,
      description: task.description,
      stageLabel: task.stageLabel,
      statusLabel: task.statusLabel,
      sourceLabel: task.sourceLabel,
      reasonKey: CREATOR_FOCUS_REASONS.runInProgress,
      recommendedActionKey: CREATOR_FOCUS_ACTIONS.monitorRun,
      rank: 90,
      moment: Math.max(run.updatedAt, run.createdAt),
    };
  }
  if (run.status === "succeeded") {
    return {
      projectId: project.id,
      conversationId: run.conversationId ?? null,
      assistantMessageId: run.assistantMessageId ?? null,
      title: project.name,
      description: task.description,
      stageLabel: task.stageLabel,
      statusLabel: task.statusLabel,
      sourceLabel: task.sourceLabel,
      reasonKey: CREATOR_FOCUS_REASONS.freshResultToReview,
      recommendedActionKey: CREATOR_FOCUS_ACTIONS.reviewOutput,
      rank: 70,
      moment: Math.max(run.updatedAt, run.createdAt),
    };
  }
  return null;
}

function buildPromptFocusCandidate(
  project: OpenDesignProject,
  task: TaskCardViewModel,
): FocusCandidate | null {
  const prompt = project.pendingPrompt?.trim();
  if (!prompt) return null;
  return {
    projectId: project.id,
    conversationId: null,
    assistantMessageId: null,
    title: project.name,
    description: task.description,
    stageLabel: task.stageLabel,
    statusLabel: task.statusLabel,
    sourceLabel: task.sourceLabel,
    reasonKey: CREATOR_FOCUS_REASONS.readyBriefNoRunYet,
    recommendedActionKey: CREATOR_FOCUS_ACTIONS.startFirstRun,
    rank: 80,
    moment: project.updatedAt,
  };
}

function resolveTaskFocusReason(
  task: TaskCardViewModel,
  activity: ActivityItemViewModel | undefined,
): CreatorFocusReasonKey {
  if (task.status === "blocked") {
    return CREATOR_FOCUS_REASONS.needsIntervention;
  }
  if (task.status === "ready" && task.priority === "high") {
    return CREATOR_FOCUS_REASONS.activePriority;
  }
  if (activity?.eventType === "run.finished") {
    return CREATOR_FOCUS_REASONS.freshResultToReview;
  }
  if (activity?.eventType === "run.started") {
    return CREATOR_FOCUS_REASONS.runInProgress;
  }
  return CREATOR_FOCUS_REASONS.nextBestTask;
}

function resolveTaskRecommendedAction(
  task: TaskCardViewModel,
  activity: ActivityItemViewModel | undefined,
): CreatorFocusActionKey {
  if (task.status === "blocked") {
    return CREATOR_FOCUS_ACTIONS.unblockProject;
  }
  if (task.status === "ready" && task.priority === "high") {
    return CREATOR_FOCUS_ACTIONS.continueEditing;
  }
  if (activity?.eventType === "run.finished") {
    return CREATOR_FOCUS_ACTIONS.reviewOutput;
  }
  if (activity?.eventType === "run.started") {
    return CREATOR_FOCUS_ACTIONS.monitorRun;
  }
  return CREATOR_FOCUS_ACTIONS.continueTask;
}

function resolveTaskFocusRank(
  task: TaskCardViewModel,
  activity: ActivityItemViewModel | undefined,
): number {
  if (task.status === "blocked") return 60;
  if (task.status === "ready" && task.priority === "high") return 50;
  if (activity?.eventType === "run.finished") return 40;
  if (activity?.eventType === "run.started") return 30;
  return 10;
}

function resolveTaskMoment(
  task: TaskCardViewModel,
  activity: ActivityItemViewModel | undefined,
): number {
  if (activity) return Date.parse(activity.occurredAt);
  return Date.parse(task.updatedAt);
}

function compareFocusCandidates(left: FocusCandidate, right: FocusCandidate): number {
  if (left.rank !== right.rank) return right.rank - left.rank;
  return right.moment - left.moment;
}

function toIsoString(value: number | string): string {
  return typeof value === "string" ? value : new Date(value).toISOString();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

// ---------------------------------------------------------------------------
// Mock data export
// ---------------------------------------------------------------------------

export { creatorMockData };
