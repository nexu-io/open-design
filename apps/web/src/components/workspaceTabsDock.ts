/**
 * Dock registry for the workspace tab strip.
 *
 * On the project route the tab strip leaves the full-width chrome row and
 * docks at the top of the chat column, directly above the chat card
 * (ProjectView renders the dock element and registers it here); the freed
 * chrome row collapses so the workspace column rises to the window top.
 * WorkspaceTabsBar subscribes and portals its strip into whichever dock is
 * registered, falling back to the classic full-width chrome row whenever no
 * dock exists (home / marketplace routes, workspace-focused mode, tests).
 *
 * A module registry + window event keeps the two sibling React trees
 * decoupled, mirroring the entryRailBridge / openWorkspaceTab patterns.
 */
import { useCallback, useRef } from 'react';

const WORKSPACE_TABS_DOCK_EVENT = 'open-design:workspace-tabs:dock-changed';

let currentDock: HTMLElement | null = null;

export function setWorkspaceTabsDock(element: HTMLElement | null): void {
  if (currentDock === element) return;
  currentDock = element;
  window.dispatchEvent(new CustomEvent(WORKSPACE_TABS_DOCK_EVENT));
}

/** Clear the registry only if `element` still owns it — two dock hosts hand
 *  off within one React commit (chat dock ↔ focus-mode dock), and commit
 *  order does not guarantee the old host detaches before the new one
 *  attaches, so an unconditional null on detach could clobber the fresh
 *  registration. */
function clearWorkspaceTabsDock(element: HTMLElement): void {
  if (currentDock !== element) return;
  currentDock = null;
  window.dispatchEvent(new CustomEvent(WORKSPACE_TABS_DOCK_EVENT));
}

/** Ref callback for a dock host element: registers on attach, releases on
 *  detach (ownership-checked — see clearWorkspaceTabsDock). */
export function useWorkspaceTabsDockRef(): (element: HTMLElement | null) => void {
  const ownElementRef = useRef<HTMLElement | null>(null);
  return useCallback((element: HTMLElement | null) => {
    if (element) {
      ownElementRef.current = element;
      setWorkspaceTabsDock(element);
      return;
    }
    if (ownElementRef.current) {
      clearWorkspaceTabsDock(ownElementRef.current);
      ownElementRef.current = null;
    }
  }, []);
}

export function getWorkspaceTabsDock(): HTMLElement | null {
  return currentDock;
}

export function subscribeWorkspaceTabsDock(listener: () => void): () => void {
  window.addEventListener(WORKSPACE_TABS_DOCK_EVENT, listener);
  return () => window.removeEventListener(WORKSPACE_TABS_DOCK_EVENT, listener);
}
