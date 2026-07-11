export type CreatorTaskStage = "topic" | "material" | "editing" | "release" | "review";
export type CreatorTaskStatus = "todo" | "ready" | "blocked" | "done";
export type CreatorTaskPriority = "low" | "medium" | "high";

export interface CreatorTaskRecord {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  stage: CreatorTaskStage;
  status: CreatorTaskStatus;
  priority: CreatorTaskPriority;
  sourceType?: string;
  blockerNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorActivityRecord {
  id: string;
  projectId: string;
  taskId?: string;
  category: CreatorTaskStage;
  title: string;
  summary?: string;
  createdAt: string;
}

export interface CreatorWorkbenchProjectData {
  tasks: CreatorTaskRecord[];
  activities: CreatorActivityRecord[];
}

export interface CreateCreatorTaskRequest {
  title: string;
  description?: string;
  stage?: CreatorTaskStage;
  status?: CreatorTaskStatus;
  priority?: CreatorTaskPriority;
  sourceType?: string;
  blockerNote?: string;
}

export interface UpdateCreatorTaskRequest {
  title?: string;
  description?: string;
  stage?: CreatorTaskStage;
  status?: CreatorTaskStatus;
  priority?: CreatorTaskPriority;
  blockerNote?: string;
}

export interface CreateCreatorActivityRequest {
  taskId?: string;
  category: CreatorTaskStage;
  title: string;
  summary?: string;
}
