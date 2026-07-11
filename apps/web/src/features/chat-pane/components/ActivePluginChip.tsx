import type { AppliedPluginSnapshot } from '@open-design/contracts';
import type { Dict } from '../../../i18n/types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

// Context chip rendered above a user message when the project pinned a
// plugin at create time (PluginLoopHome on Home). Replaces the noisy
// in-composer plugin rail so the user is not re-prompted to pick
// something they already chose; instead the active plugin lives inside
// the run message it kicked off.
export function ActivePluginChip({
  snapshot,
  t: _t,
  onOpenDetails,
}: {
  snapshot: AppliedPluginSnapshot;
  t: TranslateFn;
  onOpenDetails?: (pluginId: string) => void;
}) {
  const title = snapshot.pluginTitle ?? snapshot.pluginId;
  const version = snapshot.pluginVersion;
  const taskKind = snapshot.taskKind;
  const content = (
    <>
      <span className="msg-plugin-chip__dot" aria-hidden />
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">Plugin</span>
        <span className="msg-plugin-chip__title">{title}</span>
        {version ? (
          <span className="msg-plugin-chip__version">@{version}</span>
        ) : null}
      </span>
      {taskKind ? (
        <span className="msg-plugin-chip__task">{taskKind}</span>
      ) : null}
    </>
  );
  // One clean chip per message — the plugin's full resolved context still
  // rides the run via the persisted snapshot; we no longer fan it out into
  // per-category (design-system / asset / skill) chips here.
  return (
    <div className="msg-plugin-context" data-testid="msg-plugin-context">
      {onOpenDetails ? (
        <button
          type="button"
          className="msg-plugin-chip msg-plugin-chip--action"
          data-testid="msg-plugin-chip"
          title={title}
          onClick={() => onOpenDetails(snapshot.pluginId)}
        >
          {content}
        </button>
      ) : (
        <div className="msg-plugin-chip" data-testid="msg-plugin-chip">
          {content}
        </div>
      )}
    </div>
  );
}
