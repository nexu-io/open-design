import {
  getStudioSaveErrorMessage,
  getStudioSaveStatusCode,
  StudioFileConflictError,
  type StudioSaveDrainResult,
} from "./studioSaveDiagnostics";

interface DomEditSaveQueueOpenEvent {
  consecutiveFailures: number;
  errorMessage: string;
  statusCode: number | null;
}

interface DomEditSaveQueueOptions {
  failureThreshold?: number;
  onOpen?: (event: DomEditSaveQueueOpenEvent) => void;
  onReset?: () => void;
}

export interface DomEditSaveQueue {
  enqueue: <T>(save: () => Promise<T>) => Promise<T>;
  waitForIdle: () => Promise<DomEditSaveDrainResult>;
  isIdle: () => boolean;
  reset: () => void;
  destroy: () => void;
}

export type DomEditSaveDrainResult = StudioSaveDrainResult;

const DEFAULT_FAILURE_THRESHOLD = 5;

export class DomEditSaveQueueOpenError extends Error {
  constructor() {
    super("Auto-save is paused. Dismiss the warning to retry DOM edits.");
    this.name = "DomEditSaveQueueOpenError";
  }
}

export function createDomEditSaveQueue(options: DomEditSaveQueueOptions = {}): DomEditSaveQueue {
  const failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;

  let tail = Promise.resolve();
  let queuedCount = 0;
  let consecutiveFailures = 0;
  let breakerOpen = false;
  let drainError: unknown = null;

  const reset = (notify = true) => {
    const wasOpen = breakerOpen;
    consecutiveFailures = 0;
    breakerOpen = false;
    drainError = null;
    if (notify && wasOpen) options.onReset?.();
  };

  const open = (error: unknown) => {
    if (breakerOpen) return;
    breakerOpen = true;
    options.onOpen?.({
      consecutiveFailures,
      errorMessage: getStudioSaveErrorMessage(error),
      statusCode: getStudioSaveStatusCode(error) ?? null,
    });
  };

  const run = async <T>(save: () => Promise<T>): Promise<T> => {
    try {
      const result = await save();
      if (!breakerOpen) {
        consecutiveFailures = 0;
        drainError = null;
      }
      return result;
    } catch (error) {
      drainError = error;
      consecutiveFailures += 1;
      if (getStudioSaveStatusCode(error) === 409 || consecutiveFailures >= failureThreshold)
        open(error);
      throw error;
    }
  };

  return {
    enqueue(save) {
      if (breakerOpen) return Promise.reject(new DomEditSaveQueueOpenError());
      queuedCount += 1;
      const queued = tail
        .catch(() => undefined)
        .then(() => {
          if (breakerOpen) throw new DomEditSaveQueueOpenError();
          return run(save);
        });
      tail = queued.then(
        () => void (queuedCount -= 1),
        () => void (queuedCount -= 1),
      );
      return queued;
    },

    async waitForIdle(): Promise<DomEditSaveDrainResult> {
      await tail.catch(() => undefined);
      if (drainError instanceof StudioFileConflictError) {
        return { status: "conflict", error: drainError };
      }
      if (drainError != null) return { status: "failed", error: drainError };
      return { status: "clean" };
    },

    isIdle: () => queuedCount === 0,

    reset,

    destroy() {
      reset(false);
    },
  };
}
