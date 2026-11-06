import { useI18n } from '../i18n/I18n';
import { useEffect, useRef } from 'react';
import { mountConnection } from '../../../web/connect';
import connectionPage from '../../../web/connect.html?raw';
import { MotionIcon } from './icons';
import '../../../web/design-system/controls.css';
import '../../../web/connect.css';
import '../../../web/template-gallery.css';

type Props = { open: boolean; section?: 'setup' | 'templates'; busy: boolean; error: string; onClose: () => void; onOpen: (id: string) => void };

/** The original integration page lives inside one modal; Studio stays mounted beneath it. */
export function ConnectionDialog(props: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null), root = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountConnection> | null>(null);
  const callbacks = useRef(props); callbacks.current = props;
  useEffect(() => {
    // Own this static fragment once. Workspace polling must not replace its live gallery DOM.
    root.current!.innerHTML = connectionPage;
    const mounted = mountConnection(root.current!, {
      initialHost: new URLSearchParams(location.search).get('host'),
      close: () => { if (!callbacks.current.busy) callbacks.current.onClose(); },
      useTemplate: id => { if (!callbacks.current.busy) callbacks.current.onOpen(id); },
    });
    controller.current = mounted;
    return () => { mounted.destroy(); controller.current = null; };
  }, []);
  useEffect(() => {
    if (!props.open) { controller.current?.suspend(); dialog.current?.close(); return; }
    dialog.current?.showModal(); controller.current?.resume();
    if (props.section === 'templates') controller.current?.showTemplates();
    return () => { controller.current?.suspend(); dialog.current?.close(); };
  }, [props.open, props.section]);
  return <dialog ref={dialog} className="connection-dialog" aria-labelledby="connection-dialog-title"
    onKeyDown={event => event.stopPropagation()}
    onCancel={event => { if (event.target !== dialog.current) return; event.preventDefault(); if (!props.busy) props.onClose(); }}>
    <div className="connection-dialog-bar">
      <h2 id="connection-dialog-title">{t("MCP connection · Templates")}</h2>
      <div className="connection-dialog-tools">
        <input id="template-search" className="ui-input connection-search" type="search" maxLength={200} placeholder={t("Search templates, creators, styles…")} aria-label={t("Search templates")} />
        <button id="connection-templates" className="ui-button ui-button--ghost ui-button--sm" onClick={() => controller.current?.showTemplates()}>{t("View all templates")}</button>
      </div>
      <button id="close-connections" className="ui-button ui-button--ghost ui-button--icon" aria-label={t("Close MCP connection")} disabled={props.busy} onClick={props.onClose}><MotionIcon name="close" /></button>
    </div>
    {(props.error || props.busy) && <p className="connect-error" role="status">{props.error || t('Preparing editable project…')}</p>}
    <div id="connection-root" ref={root} />
  </dialog>;
}
