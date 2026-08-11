import { createContext, useContext, type ReactNode } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { AnchorWriteBack } from '../comments';
import type { ProjectCollab } from './useProjectCollab';

// Shares the project's collab state (from useProjectCollab in ProjectView) down
// to deep descendants (FileViewer's comment overlay) without prop-threading
// through the big intermediate components, and without a second collab client.

export type ProjectResourceAuthority = 'pending' | 'denied' | 'local' | 'workspace';

export interface CollabContextValue extends ProjectCollab {
  /** Exact persisted scope of the project being rendered. Never shell navigation state. */
  workspaceContext: WorkspaceCollabContext | null;
  workspaceContextLoading: boolean;
  /** Whether project-owned resources may use local or exact Workspace reads.
   * Optional only for standalone consumers; ProjectView always supplies it. */
  projectResourceAuthority?: ProjectResourceAuthority;
  /** Persist a drifted-to-`lost` comment's last-good position (needs the active
   * conversation id, which only ProjectView has). Absent when unavailable. */
  onLostAnchors?: (writeBacks: AnchorWriteBack[]) => void;
}

const DISABLED: CollabContextValue = {
  workspaceContext: null,
  workspaceContextLoading: false,
  projectResourceAuthority: 'local',
  enabled: false,
  member: null,
  present: [],
  publishedVersion: null,
  syncState: null,
  viewerOnly: false,
  writerAuthority: 'pending',
  isOwner: false,
  isEffectiveOwner: false,
  isSharedNonOwner: false,
  ownerDisplayName: null,
  ownerRole: null,
  downloadPending: false,
  reportChange: () => {},
  requestPublish: () => {},
  refreshPresence: () => {},
  checkStatusNow: () => {},
};

const CollabContext = createContext<CollabContextValue>(DISABLED);

export function CollabProvider({ value, children }: { value: CollabContextValue; children: ReactNode }) {
  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}

/** The current project's collab state; disabled default outside a provider. */
export function useProjectCollabContext(): CollabContextValue {
  return useContext(CollabContext);
}
