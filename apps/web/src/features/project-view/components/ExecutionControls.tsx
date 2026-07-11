// Dumb component for the chat composer's execution-controls bar (the
// agent/model picker avatar menu). Props in, JSX out — analytics tracking is
// the only "logic," and it's a thin call to the already-pure
// `trackComposerBarClick` wrapper, not owned state.
import { AvatarMenu } from '../../../components/AvatarMenu';
import { trackComposerBarClick } from '../../../analytics/events';
import type { useAnalytics } from '../../../analytics/provider';
import type { AgentInfo, AppConfig } from '../../../types';
import type { SettingsSection } from '../../../components/SettingsDialog';

export interface ExecutionControlsProps {
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  projectId: string | undefined;
  track: ReturnType<typeof useAnalytics>['track'];
  onModeChange: (mode: AppConfig['mode']) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (id: string, choice: { model?: string; reasoning?: string }) => void;
  onApiModelChange?: (model: string) => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onRefreshAgents: () => void;
}

export function ExecutionControls({
  config,
  agents,
  daemonLive,
  projectId,
  track,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiModelChange,
  onOpenSettings,
  onRefreshAgents,
}: ExecutionControlsProps) {
  return (
    <AvatarMenu
      config={config}
      agents={agents}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onOpen={() => {
        trackComposerBarClick(track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_selector_open',
          ...(projectId ? { project_id: projectId } : {}),
        });
      }}
      onAgentChange={(id) => {
        trackComposerBarClick(track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_select',
          agent_id: id,
          ...(projectId ? { project_id: projectId } : {}),
        });
        onAgentChange(id);
      }}
      onAgentModelChange={(agentId, choice) => {
        trackComposerBarClick(track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_model_select',
          agent_id: agentId,
          ...(choice?.model ? { model_id: choice.model } : {}),
          ...(projectId ? { project_id: projectId } : {}),
        });
        onAgentModelChange(agentId, choice);
      }}
      onApiModelChange={(model) => {
        trackComposerBarClick(track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_model_select',
          model_id: model,
          ...(projectId ? { project_id: projectId } : {}),
        });
        onApiModelChange?.(model);
      }}
      onOpenSettings={onOpenSettings}
      onRefreshAgents={onRefreshAgents}
      placement="up"
    />
  );
}
