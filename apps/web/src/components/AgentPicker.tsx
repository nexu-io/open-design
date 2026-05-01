import { useT } from '../i18n';
import type { AgentInfo, ExecMode } from '../types';

interface Props {
  mode: ExecMode;
  agents: AgentInfo[];
  agentId: string | null;
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onRefresh: () => void;
}

export function AgentPicker({
  mode,
  agents,
  agentId,
  daemonLive,
  onModeChange,
  onAgentChange,
  onRefresh,
}: Props) {
  const t = useT();
  const available = agents.filter((a) => a.available);
  const currentAgent = agents.find((a) => a.id === agentId);

  return (
    <div className="picker agent-picker">
      <span className="picker-label">{t('agentPicker.label')}</span>
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as ExecMode)}
        title={t('agentPicker.modeChoose')}
      >
        <option value="daemon" disabled={!daemonLive}>
          {t('agentPicker.localCli')} {daemonLive ? '' : `· ${t('agentPicker.daemonOff')}`}
        </option>
        <option value="api">{t('agentPicker.byok')}</option>
      </select>
      {mode === 'daemon' ? (
        <>
          <select
            value={agentId ?? ''}
            onChange={(e) => onAgentChange(e.target.value)}
            disabled={available.length === 0}
            title={
              currentAgent?.version
                ? `${currentAgent.name} · ${currentAgent.version}`
                : t('agentPicker.selectAgent')
            }
          >
            {available.length === 0 ? (
              <option value="">{t('agentPicker.noAgents')}</option>
            ) : null}
            {agents.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.available}>
                {a.name}
                {a.available ? '' : ` · ${t('agentPicker.notInstalled')}`}
              </option>
            ))}
          </select>
          <button
            onClick={onRefresh}
            title={t('agentPicker.rescan')}
            className="icon-btn"
          >
            ↻
          </button>
        </>
      ) : null}
    </div>
  );
}
