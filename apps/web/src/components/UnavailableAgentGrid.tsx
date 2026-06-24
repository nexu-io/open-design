import { useT } from '../i18n';
import type { AgentInfo } from '../types';
import { AgentIcon } from './AgentIcon';
import { AgentDiagnosticRow } from './AgentDiagnosticRow';
import { Icon } from './Icon';

// Short, vendor-neutral one-liners shown under each unavailable agent's name.
// Duplicated (rather than imported) from SettingsDialog to keep this shared
// grid self-contained; the map is tiny and the host file follows the same
// "local copy" convention for these labels.
const AGENT_SHORT_DESCRIPTIONS: Record<string, string> = {
  claude: 'Anthropic official CLI',
  codex: 'OpenAI official CLI',
  'cursor-agent': 'Cursor command line',
  gemini: 'Google official CLI',
  opencode: 'Open-source agent CLI',
  qwen: 'Qwen coding CLI',
  copilot: 'GitHub coding CLI',
  devin: 'Cognition terminal CLI',
  kimi: 'Moonshot Kimi CLI',
  qoder: 'Alibaba coding CLI',
  pi: 'Inflection chat CLI',
  kiro: 'Kiro agent CLI',
  kilo: 'Kilo Code CLI',
  vibe: 'Mistral open-source CLI',
  deepseek: 'DeepSeek terminal UI',
  hermes: 'ACP agent CLI',
  'grok-build': 'xAI coding CLI',
  reasonix: 'DeepSeek native coding CLI',
};

function sanitizeHttpsUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function displayAgentName(agent: Pick<AgentInfo, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'Open Design AMR' : agent.name;
}

export interface UnavailableAgentGridProps {
  /** The unavailable agents to render as install cards. */
  agents: AgentInfo[];
  /**
   * Called whenever the user clicks an Install/Docs affordance (inline link or
   * diagnostic fix button). The Settings host uses this to arm a rescan for
   * when the user returns to the app after installing; onboarding may pass a
   * no-op.
   */
  onInstallIntent: () => void;
  /** Re-run agent detection (the "Rescan" affordance in the card footer). */
  onRescan: () => void;
  /**
   * Open a fix URL (docs or install) instead of letting the anchor navigate.
   * Onboarding wires this to `openExternalUrl` so links leave the packaged
   * app's window; Settings omits it and keeps plain `target="_blank"` anchors.
   */
  onOpenFixUrl?: (url: string, agent: AgentInfo, kind: 'docs' | 'install') => void;
  /**
   * Rewrite the inline Install anchor's href for the AMR agent so the handoff
   * carries Settings attribution. Only the Settings host passes this; onboarding
   * never renders AMR here, so it can omit it.
   */
  attributeAmrInstallUrl?: (url: string) => string;
}

/**
 * The inner grid of "not installed" agent cards (icon + name + short
 * description + Docs/Install links + per-diagnostic fix rows). Extracted from
 * SettingsDialog so the onboarding empty-state can surface the same install
 * affordances instead of a bare "no agents detected" sentence (issue #4662).
 *
 * Renders only the grid — callers wrap it (e.g. Settings keeps its
 * `<details>` collapse) however they like.
 */
export function UnavailableAgentGrid({
  agents,
  onInstallIntent,
  onRescan,
  onOpenFixUrl,
  attributeAmrInstallUrl,
}: UnavailableAgentGridProps) {
  const t = useT();
  return (
    <div className="agent-grid agent-grid-unavailable">
      {agents.map((a) => {
        const installUrl = sanitizeHttpsUrl(a.installUrl);
        const docsUrl = sanitizeHttpsUrl(a.docsUrl);
        const description = AGENT_SHORT_DESCRIPTIONS[a.id];
        const agentName = displayAgentName(a);
        const cardLabel = `${agentName} · ${t('common.notInstalled')}`;
        return (
          <div
            key={a.id}
            className="agent-card disabled agent-card-unavailable"
            role="group"
            aria-label={cardLabel}
          >
            <div className="agent-card-unavailable-row">
              <AgentIcon id={a.id} size={30} />
              <div className="agent-card-body">
                <div className="agent-card-name">{agentName}</div>
                {description ? (
                  <div className="agent-card-description">{description}</div>
                ) : null}
              </div>
            </div>
            {/* Why is it unavailable? not-on-path vs a broken shim vs a bad
                *_BIN override each get a distinct, actionable line, full-width
                below the logo/name. Rendered message-only: the fix actions are
                hoisted into the shared footer bar so every control lives on one
                row. */}
            {(a.diagnostics ?? []).map((diagnostic, i) => (
              <AgentDiagnosticRow
                key={`${diagnostic.reason}-${i}`}
                diagnostic={diagnostic}
              />
            ))}
            {/* Every action for the card collapses into one horizontal bar at
                the foot, fenced from the content above by a hair divider: Docs
                + Rescan as quiet icon buttons, Install as the primary labelled
                CTA holding the right edge. */}
            <div className="agent-card-footer">
              {docsUrl ? (
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="agent-card-link agent-card-link--muted agent-card-link--icon"
                  onClick={(event) => {
                    onInstallIntent();
                    if (onOpenFixUrl) {
                      event.preventDefault();
                      onOpenFixUrl(docsUrl, a, 'docs');
                    }
                  }}
                  title={t('settings.agentInstall.docs')}
                  aria-label={t('settings.agentInstall.docs')}
                >
                  <Icon name="file" size={15} />
                </a>
              ) : null}
              <button
                type="button"
                className="agent-card-link agent-card-link--muted agent-card-link--icon"
                onClick={() => onRescan()}
                title={t('settings.rescan')}
                aria-label={t('settings.rescan')}
              >
                <Icon name="reload" size={15} />
              </button>
              {installUrl ? (
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="agent-card-link agent-card-link--ghost"
                  onClick={(event) => {
                    onInstallIntent();
                    const target =
                      a.id === 'amr' && attributeAmrInstallUrl
                        ? attributeAmrInstallUrl(installUrl)
                        : installUrl;
                    if (onOpenFixUrl) {
                      event.preventDefault();
                      onOpenFixUrl(target, a, 'install');
                    } else if (target !== installUrl) {
                      event.currentTarget.href = target;
                    }
                  }}
                >
                  {t('settings.agentInstall.install')}
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
