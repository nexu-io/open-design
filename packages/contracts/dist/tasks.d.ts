export declare const TASK_STATES: readonly ["queued", "starting", "running", "succeeded", "failed", "cancelled"];
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
//# sourceMappingURL=tasks.d.ts.map