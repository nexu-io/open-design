export interface ProjectEventPayload {
  type?: string;
  [key: string]: unknown;
}

export type ProjectEventSink = (payload: ProjectEventPayload) => void;

export interface ProjectEventRegistry {
  sinks: Map<string, Set<ProjectEventSink>>;
  emit(projectId: string | undefined, payload: ProjectEventPayload): boolean;
}

export function createProjectEventRegistry(): ProjectEventRegistry {
  const sinks = new Map<string, Set<ProjectEventSink>>();

  return {
    sinks,
    emit(projectId, payload) {
      if (!projectId) return false;
      const projectSinks = sinks.get(projectId);
      if (!projectSinks || projectSinks.size === 0) return false;

      for (const sink of Array.from(projectSinks)) {
        try {
          sink(payload);
        } catch {
          projectSinks.delete(sink);
        }
      }
      if (projectSinks.size === 0) sinks.delete(projectId);
      return true;
    },
  };
}
