import { useT } from '../i18n';
import type { AgentDiagnostic, AgentFixIntent } from '../types';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import styles from './AgentDiagnosticRow.module.css';

// Handlers the host wires per fix intent. Each is optional: a button is only
// rendered when both the diagnostic carries the intent AND the host provides
// a handler for it, so the same row works in the Settings grid, the
// connection-test failure surface, and (PR-B) the health-check panel without
// any of them having to know which intents the others support.
export interface AgentFixHandlers {
  onRescan?: () => void;
  onOpenInstall?: () => void;
  onOpenDocs?: () => void;
  onSetEnv?: (envKey: string) => void;
  onClearEnv?: (envKey: string) => void;
}

interface Props {
  diagnostic: AgentDiagnostic;
  handlers?: AgentFixHandlers;
  className?: string;
}

type ResolvedAction = {
  key: string;
  label: string;
  icon: IconName;
  onClick: () => void;
};

// Map one typed fix intent to a concrete icon button, reusing translation keys
// that already exist so this component adds no new locale strings. The label
// is surfaced as a tooltip + accessible name; the glyph keeps the action quiet
// so it never competes with the diagnostic message. Intents without a wired
// handler (or, for setEnv/clearEnv, without dedicated UI yet) resolve to null
// and simply aren't rendered — the diagnostic message still names the env var
// so the user isn't left without guidance.
function useResolveAction() {
  const t = useT();
  return (intent: AgentFixIntent, handlers: AgentFixHandlers): ResolvedAction | null => {
    switch (intent.kind) {
      case 'openInstall':
        return handlers.onOpenInstall
          ? {
              key: 'openInstall',
              label: t('settings.agentInstall.install'),
              icon: 'download',
              onClick: handlers.onOpenInstall,
            }
          : null;
      case 'openDocs':
        return handlers.onOpenDocs
          ? {
              key: 'openDocs',
              label: t('settings.agentInstall.docs'),
              icon: 'file',
              onClick: handlers.onOpenDocs,
            }
          : null;
      case 'rescan':
        return handlers.onRescan
          ? {
              key: 'rescan',
              label: t('settings.rescan'),
              icon: 'reload',
              onClick: handlers.onRescan,
            }
          : null;
      // setEnv / clearEnv carry a typed envKey and are part of the contract,
      // but their input-driven UI ships in a follow-up. launchOAuth is also
      // reserved for a future daemon-side auth producer; the chat auth banner
      // keeps its separate Antigravity terminal action.
      case 'setEnv':
      case 'clearEnv':
      case 'launchOAuth':
        return null;
      default:
        return null;
    }
  };
}

// Presents a single agent diagnostic as "one-line reason + fix button(s)".
// The reason text is the daemon-authored message (already English, like the
// existing auth banner), and tooltips expose the probe detail + the exact
// directories PATH detection searched.
export function AgentDiagnosticRow({ diagnostic, handlers = {}, className }: Props) {
  const resolveAction = useResolveAction();
  const actions = (diagnostic.fixActions ?? [])
    .map((intent) => resolveAction(intent, handlers))
    .filter((action): action is ResolvedAction => action !== null);

  const tooltip = [
    diagnostic.detail,
    ...(diagnostic.searchedDirs && diagnostic.searchedDirs.length > 0
      ? diagnostic.searchedDirs
      : []),
  ]
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .join('\n');

  return (
    <div
      className={[styles.root, styles[diagnostic.severity], className]
        .filter(Boolean)
        .join(' ')}
      role="group"
      data-reason={diagnostic.reason}
    >
      <span className={styles.message} title={tooltip || undefined}>
        {diagnostic.message}
      </span>
      {actions.length > 0 ? (
        <div className={styles.actions}>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={styles.action}
              onClick={action.onClick}
              title={action.label}
              aria-label={action.label}
            >
              <Icon name={action.icon} size={15} strokeWidth={1.9} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
