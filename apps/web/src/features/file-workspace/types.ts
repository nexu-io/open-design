// UI-local types for the file-workspace slice. Not wire DTOs — those stay in
// `packages/contracts`. Moved out of `components/FileWorkspace.tsx` as part of
// the ADR-0002 vertical-slice decomposition; the orchestrator imports these
// back through the slice barrel instead of redeclaring them.
import type { ProjectBrowserWorkspaceTab } from '../../types';

export type TabDropEdge = 'before' | 'after';

export type BrowserWorkspaceTab = ProjectBrowserWorkspaceTab;

export type WorkspaceOrderedTab =
  | { id: string; kind: 'browser'; browserTab: BrowserWorkspaceTab }
  | { id: string; kind: 'file'; name: string };
