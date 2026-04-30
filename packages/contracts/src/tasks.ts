export const TASK_STATES = [
  'queued',
  'starting',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export interface TaskStatus {
  id: string;
  state: TaskState;
  label?: string;
  detail?: string;
  startedAt?: number;
  updatedAt?: number;
  endedAt?: number;
}
