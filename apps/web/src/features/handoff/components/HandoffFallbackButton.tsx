// Zero-editors single-button fallback: the daemon reported no installed
// editors (or the probe failed), so this is the only affordance — open the
// project folder in the OS file manager. Wrapped so a daemon spawn failure
// can surface an inline error next to it, since `ProjectView`'s
// `<HandoffButton projectId={…} />` (no reveal callback) would otherwise turn
// a rejected launch into a silent no-op.
import type { HostEditorId } from '@open-design/contracts';
import { useT } from '../../../i18n';
import { EditorIcon } from './EditorIcon';

interface Props {
  fallbackId: HostEditorId;
  fallbackLabel: string;
  busy: HostEditorId | null;
  error: string | null;
  onLaunch: () => void;
}

export function HandoffFallbackButton({ fallbackId, fallbackLabel, busy, error, onLaunch }: Props) {
  const t = useT();
  const title = t('handoff.fallbackTitle', { target: fallbackLabel });

  return (
    <div className="handoff-wrap handoff-wrap--solo" data-testid="handoff-wrap">
      <button
        type="button"
        className="handoff-trigger handoff-trigger--solo od-tooltip"
        title={title}
        data-tooltip={title}
        data-tooltip-placement="bottom"
        disabled={busy === fallbackId}
        onClick={onLaunch}
      >
        <EditorIcon editorId={fallbackId} size={20} />
        <span className="handoff-trigger-label">{fallbackLabel}</span>
      </button>
      {error ? (
        <div className="handoff-menu-error" role="alert" data-testid="handoff-fallback-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}
