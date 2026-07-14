// Feature-local hook for the composer's staged run-context chips: the
// skills/MCP-servers/connectors the user has @-mentioned or applied for this
// turn, plus their bound remove callbacks. Genuinely cross-cutting state
// (read/written by the design-toolbox-apply functions, the mention-insert
// family, `handleEditorChange`, `reset`, and each remove handler) that
// previously sat bare in the orchestrator with no owning hook — the exact
// situation `stagedWorkspaceContexts` was in before it got
// `useWorkspaceContextLinking`. Pure UI/list state — no port, no transport.
//
// Owns its own deps-bag callbacks (Phase 6 "a hook should own its own
// deps-bag callbacks" pattern, same shape as `useMentionPopover`): each
// remove function is too entangled with the draft/editor/analytics cluster
// to be a pure rule, but this hook is its one natural owner, so it takes
// those cross-cluster pieces as params and returns the bound callbacks ready
// to wire directly into JSX.
import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ConnectorDetail, McpServerConfig } from '@open-design/contracts';
import type { ComposerBarClickProps } from '@open-design/contracts/analytics';
import type { SkillSummary } from '../../../types';
import {
  removeStagedConnector as removeStagedConnectorImpl,
  removeStagedMcpServer as removeStagedMcpServerImpl,
  removeStagedSkill as removeStagedSkillImpl,
  type StagedRemovalDeps,
} from '../actions';

export interface StagedRunContextParams {
  draft: string;
  replaceEditorDraft: (text: string) => void;
  trackComposerBar: (fields: Omit<ComposerBarClickProps, 'page_name' | 'area' | 'project_id'>) => void;
}

export interface StagedRunContextController {
  stagedSkills: SkillSummary[];
  setStagedSkills: Dispatch<SetStateAction<SkillSummary[]>>;
  stagedMcpServers: McpServerConfig[];
  setStagedMcpServers: Dispatch<SetStateAction<McpServerConfig[]>>;
  stagedConnectors: ConnectorDetail[];
  setStagedConnectors: Dispatch<SetStateAction<ConnectorDetail[]>>;
  removeStagedSkill: (id: string) => void;
  removeStagedMcpServer: (id: string) => void;
  removeStagedConnector: (id: string) => void;
}

export function useStagedRunContext({
  draft,
  replaceEditorDraft,
  trackComposerBar,
}: StagedRunContextParams): StagedRunContextController {
  const [stagedSkills, setStagedSkills] = useState<SkillSummary[]>([]);
  const [stagedMcpServers, setStagedMcpServers] = useState<McpServerConfig[]>([]);
  const [stagedConnectors, setStagedConnectors] = useState<ConnectorDetail[]>([]);

  // Recreated each render so it always closes over the latest draft — matches
  // the orchestrator's existing deps-bag convention (see `uploadActionDeps`).
  const stagedRemovalDeps: StagedRemovalDeps = { draft, replaceEditorDraft, trackComposerBar };

  const removeStagedSkill = useCallback((id: string) => {
    removeStagedSkillImpl(id, stagedSkills, setStagedSkills, stagedRemovalDeps);
  }, [stagedSkills, stagedRemovalDeps]);

  const removeStagedMcpServer = useCallback((id: string) => {
    removeStagedMcpServerImpl(id, stagedMcpServers, setStagedMcpServers, stagedRemovalDeps);
  }, [stagedMcpServers, stagedRemovalDeps]);

  const removeStagedConnector = useCallback((id: string) => {
    removeStagedConnectorImpl(id, stagedConnectors, setStagedConnectors, stagedRemovalDeps);
  }, [stagedConnectors, stagedRemovalDeps]);

  return {
    stagedSkills,
    setStagedSkills,
    stagedMcpServers,
    setStagedMcpServers,
    stagedConnectors,
    setStagedConnectors,
    removeStagedSkill,
    removeStagedMcpServer,
    removeStagedConnector,
  };
}
