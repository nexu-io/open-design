import type { ProjectEventPayload } from './project-events.js';

export type LiveArtifactAction = 'created' | 'updated' | 'deleted';

export interface LiveArtifactGrant {
  runId?: string;
  projectId?: string;
}

export interface LiveArtifactSummary {
  id: string;
  projectId?: string;
  title?: string;
  refreshStatus?: string;
}

export interface LiveArtifactRefreshPayload extends Record<string, unknown> {
  artifactId: string;
}

export interface ChatRunArtifactHandle {
  noteArtifactRegistered?: () => void;
}

export interface LiveArtifactEventEmitterDeps {
  emitProjectEvent: (projectId: string | undefined, payload: ProjectEventPayload) => boolean;
  emitChatAgentEvent: (runId: string, payload: ProjectEventPayload) => boolean;
  chatRunHandles: Map<string, ChatRunArtifactHandle>;
}

export interface LiveArtifactEventEmitter {
  emitLiveArtifactEvent(
    grant: LiveArtifactGrant,
    action: LiveArtifactAction,
    artifact: LiveArtifactSummary,
  ): boolean;
  emitLiveArtifactRefreshEvent(
    grant: LiveArtifactGrant,
    payload: LiveArtifactRefreshPayload,
  ): boolean;
}

export function createLiveArtifactEventEmitter(
  deps: LiveArtifactEventEmitterDeps,
): LiveArtifactEventEmitter {
  return {
    emitLiveArtifactEvent(grant, action, artifact) {
      if (!artifact?.id) return false;
      const payload: ProjectEventPayload = {
        type: 'live_artifact',
        action,
        projectId: artifact.projectId ?? grant.projectId,
        artifactId: artifact.id,
        title: artifact.title ?? artifact.id,
        refreshStatus: artifact.refreshStatus,
      };
      let emitted = deps.emitProjectEvent(payload.projectId, payload);
      if (grant?.runId) emitted = deps.emitChatAgentEvent(grant.runId, payload) || emitted;
      if (action === 'created' && grant?.runId) {
        const handle = deps.chatRunHandles.get(grant.runId);
        if (handle?.noteArtifactRegistered) {
          try {
            handle.noteArtifactRegistered();
          } catch {
            // The artifact already exists; a broken watchdog hook must not
            // turn a successful artifact write into an HTTP failure.
          }
        }
      }
      return emitted;
    },

    emitLiveArtifactRefreshEvent(grant, payload) {
      if (!payload?.artifactId) return false;
      const event: ProjectEventPayload = {
        type: 'live_artifact_refresh',
        projectId: grant.projectId,
        ...payload,
      };
      let emitted = deps.emitProjectEvent(grant.projectId, event);
      if (grant?.runId) emitted = deps.emitChatAgentEvent(grant.runId, event) || emitted;
      return emitted;
    },
  };
}
