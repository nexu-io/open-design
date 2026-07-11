// The split control in the ChatPane header: the labeled left side launches
// the preferred editor, the right caret opens the picker. Sibling buttons
// (instead of a nested caret) so the caret has its own real tap target and so
// we don't render an invalid button-in-button.
import type { HostEditor, HostEditorId } from '@open-design/contracts';
import { useT } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { EditorIcon } from './EditorIcon';

interface Props {
  primary: HostEditor | null;
  primaryTitle: string;
  busy: HostEditorId | null;
  onTriggerClick: () => void;
  onCaretClick: () => void;
}

export function HandoffTrigger({ primary, primaryTitle, busy, onTriggerClick, onCaretClick }: Props) {
  const t = useT();
  const chooseTargetAria = t('handoff.chooseTargetAria');

  return (
    <div className="handoff-split">
      <button
        type="button"
        className="handoff-trigger od-tooltip"
        data-testid="handoff-trigger"
        title={primaryTitle}
        data-tooltip={primaryTitle}
        data-tooltip-placement="bottom"
        aria-label={primaryTitle}
        onClick={onTriggerClick}
        disabled={busy !== null}
      >
        {primary ? (
          <>
            <EditorIcon editorId={primary.id} size={20} />
            <span className="handoff-trigger-label sr-only">
              {primaryTitle}
            </span>
          </>
        ) : (
          <>
            <EditorIcon editorId="finder" size={20} />
            <span className="handoff-trigger-label sr-only">{primaryTitle}</span>
          </>
        )}
      </button>
      <button
        type="button"
        className="handoff-caret od-tooltip"
        aria-label={chooseTargetAria}
        title={chooseTargetAria}
        data-tooltip={chooseTargetAria}
        data-tooltip-placement="bottom"
        data-testid="handoff-caret"
        onClick={onCaretClick}
        disabled={busy !== null}
      >
        <Icon name="chevron-down" size={14} />
      </button>
    </div>
  );
}
