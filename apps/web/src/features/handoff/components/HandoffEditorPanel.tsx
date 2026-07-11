// The Editor tab of the dropdown: installed editors first, then anything the
// daemon's PATH/bundle probe didn't detect (still clickable — the daemon
// re-probes on launch and returns 409 only if it genuinely can't find it).
import type { HostEditor, HostEditorId } from '@open-design/contracts';
import { useT } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { EditorIcon } from './EditorIcon';

interface Props {
  available: HostEditor[];
  unavailable: HostEditor[];
  busy: HostEditorId | null;
  onLaunch: (editor: HostEditor) => void;
}

export function HandoffEditorPanel({ available, unavailable, busy, onLaunch }: Props) {
  const t = useT();

  return (
    <section className="handoff-menu-block" role="tabpanel">
      <div className="handoff-target-group">
        <div className="handoff-target-group-title">{t('common.installed')}</div>
        <div className="handoff-target-rail handoff-editor-rail">
          {available.map((editor) => (
            <button
              key={editor.id}
              type="button"
              className="handoff-menu-item handoff-target-card"
              data-testid={`handoff-menu-item-${editor.id}`}
              onClick={() => onLaunch(editor)}
              disabled={busy === editor.id}
              title={t('handoff.openInTarget', { target: editor.label })}
            >
              <EditorIcon editorId={editor.id} size={24} />
              <span className="handoff-target-label">{editor.label}</span>
              <Icon className="handoff-target-arrow" name="chevron-right" size={12} />
            </button>
          ))}
        </div>
      </div>
      {unavailable.length > 0 ? (
        <div className="handoff-target-group">
          <div className="handoff-target-group-title">{t('handoff.notInstalled')}</div>
          <div className="handoff-target-rail handoff-editor-rail handoff-target-rail--unavailable">
            {unavailable.map((editor) => (
              <button
                key={editor.id}
                type="button"
                className="handoff-menu-item handoff-target-card dim"
                data-testid={`handoff-menu-item-${editor.id}`}
                onClick={() => onLaunch(editor)}
                disabled={busy === editor.id}
                title={t('handoff.notDetectedTitle', { target: editor.label })}
              >
                <EditorIcon editorId={editor.id} size={24} />
                <span className="handoff-target-label">{editor.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
