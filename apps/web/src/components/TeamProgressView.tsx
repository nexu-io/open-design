import { memo } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export interface TeamAgentState {
  agentId: string;
  agentType?: string;
  agentName: string;
  role: string;
  status: "pending" | "running" | "completed" | "failed";
  duration?: string;
  error?: string;
}

interface Props {
  teamName?: string;
  mode?: string;
  agents: TeamAgentState[];
  allDone?: boolean;
  /** Callback when user clicks skip/continue during parallel execution.
   *  Only rendered when not allDone and at least one agent has completed. */
  onSkip?: () => void;
  /** True while the skip request is in flight. Disables the button. */
  skipBusy?: boolean;
}

const MODE_ICON_MAP: Record<string, IconName> = {
  parallel: "grid",
  serial: "chevron-right",
  inheritance: "layers-filled",
  debate: "sparkles",
  review: "eye",
  specialist: "puzzle",
  cycle: "refresh",
};

const AGENT_TOOL_LABELS: Record<string, string> = {
  codebuddy: "CodeBuddy",
  claude: "Claude",
  amr: "AMR",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "OpenCode",
  deepseek: "DeepSeek",
  copilot: "Copilot",
  kimi: "Kimi",
  qwen: "Qwen",
  "cursor-agent": "Cursor",
  hermes: "Hermes",
};

function toolLabel(t: string): string {
  return AGENT_TOOL_LABELS[t] ?? t;
}

const ROLE_LABELS: Record<string, string> = {
  designer: "设计师",
  developer: "开发者",
  writer: "文案",
  researcher: "研究员",
  reviewer: "审核",
  planner: "策划",
  analyst: "分析",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function statusIcon(status: TeamAgentState["status"]): IconName {
  switch (status) {
    case "running":
      return "spinner";
    case "completed":
      return "check";
    case "failed":
      return "alert-triangle";
    default:
      return "minus";
  }
}

function statusClass(status: TeamAgentState["status"]): string {
  switch (status) {
    case "running":
      return "team-agent-running";
    case "completed":
      return "team-agent-done";
    case "failed":
      return "team-agent-failed";
    default:
      return "team-agent-pending";
  }
}

export const TeamProgressView = memo(function TeamProgressView({
  teamName,
  mode,
  agents,
  allDone,
  onSkip,
  skipBusy,
}: Props) {
  if (agents.length === 0) return null;

  const runningCount = agents.filter((a) => a.status === "running").length;
  const doneCount = agents.filter((a) => a.status === "completed").length;
  const failedCount = agents.filter((a) => a.status === "failed").length;
  const totalCount = agents.length;
  const progress =
    totalCount > 0 ? Math.round(((doneCount + failedCount) / totalCount) * 100) : 0;
  const modeIcon: IconName = (mode && MODE_ICON_MAP[mode]) ? MODE_ICON_MAP[mode] : "grid";

  // Show skip/continue when: not all done, some agents are running, and
  // at least one agent has already completed (we have partial results).
  // In parallel mode especially, this prevents the user from being stuck
  // waiting for all agents when a collective intent is already available.
  const skipAvailable =
    !allDone &&
    onSkip &&
    runningCount > 0 &&
    doneCount > 0;

  return (
    <div className={`team-progress-panel${allDone ? " team-progress-done" : ""}`}>
      {/* Header */}
      <div className="team-progress-header">
        <div className="team-progress-header-left">
          <Icon name={modeIcon} size={16} className="team-progress-mode-icon" />
          <span className="team-progress-title">
            {teamName ?? "团队"}
            {mode && <span className="team-progress-mode-label">{mode}</span>}
          </span>
        </div>
        <div className="team-progress-header-right">
          <span className="team-progress-count">
            {doneCount + failedCount}/{totalCount}
          </span>
          {!allDone && runningCount > 0 && (
            <span className="team-progress-working">执行中…</span>
          )}
          {allDone && failedCount > 0 && (
            <span className="team-progress-failed-summary">
              {doneCount} 完成, {failedCount} 失败
            </span>
          )}
          {allDone && failedCount === 0 && (
            <span className="team-progress-all-done">全部完成</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="team-progress-bar-track">
        <div
          className="team-progress-bar-fill"
          style={{
            width: `${progress}%`,
            background:
              failedCount > 0 && allDone
                ? "var(--od-color-warning, #f59e0b)"
                : undefined,
          }}
        />
      </div>

      {/* Skip / Continue action — shown when some agents are done but others
          are still running. Lets the user proceed with partial results. */}
      {skipAvailable && (
        <div className="team-progress-skip-row">
          <button
            type="button"
            className="team-progress-skip-btn"
            onClick={onSkip}
            disabled={skipBusy}
          >
            {skipBusy ? (
              <Icon name="spinner" size={14} className="team-icon-spin" />
            ) : (
              <Icon name="chevron-right" size={14} />
            )}
            <span>
              {skipBusy ? "正在继续…" : `跳过等待 · 以 ${doneCount} 个结果继续`}
            </span>
          </button>
        </div>
      )}

      {/* Agent pipeline */}
      <div className="team-progress-agents">
        {agents.map((agent, idx) => {
          const isCurrentWorker = agent.status === "running";
          const prevAgent = idx > 0 ? agents[idx - 1] : undefined;
          const showHandoff =
            prevAgent &&
            prevAgent.status === "completed" &&
            agent.status === "running";

          return (
            <div key={agent.agentId}>
              {/* Handoff connector */}
              {showHandoff && (
                <div className="team-progress-handoff">
                  <div className="team-progress-handoff-line" />
                  <div className="team-progress-handoff-badge">
                    <Icon name="chevron-down" size={10} />
                    <span>交给下一个</span>
                  </div>
                  <div className="team-progress-handoff-line" />
                </div>
              )}

              <div
                className={`team-progress-agent ${statusClass(agent.status)}${isCurrentWorker ? " team-progress-agent-current" : ""}`}
              >
                <div className="team-progress-agent-icon">
                  <Icon
                    name={statusIcon(agent.status)}
                    size={14}
                    className={agent.status === "running" ? "team-icon-spin" : undefined}
                  />
                </div>
                <div className="team-progress-agent-info">
                  <span className="team-progress-agent-name">{agent.agentName}</span>
                  <span className="team-progress-agent-role">{roleLabel(agent.role)}</span>
                  {agent.agentType && (
                    <span className="team-progress-agent-tool" title={`运行于 ${toolLabel(agent.agentType)}`}>
                      {toolLabel(agent.agentType)}
                    </span>
                  )}
                </div>
                <div className="team-progress-agent-meta">
                  {agent.status === "pending" && (
                    <span className="team-progress-agent-status-text">等待中</span>
                  )}
                  {agent.status === "running" && (
                    <span className="team-progress-agent-status-badge">正在处理</span>
                  )}
                  {agent.status === "completed" && agent.duration && (
                    <span className="team-progress-agent-duration">{agent.duration}</span>
                  )}
                  {agent.status === "failed" && agent.error && (
                    <span className="team-progress-agent-error" title={agent.error}>
                      {agent.error.length > 30
                        ? agent.error.slice(0, 30) + "…"
                        : agent.error}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
