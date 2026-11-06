import { useI18n } from "../i18n/I18n";
import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator } from '../components/ui';
import { useDockLayoutStore } from '../components/dock/dockLayoutStore';
import { PANEL_DEFINITIONS } from '../components/dock/panelRegistry';
import { MotionIcon } from './icons';


export function MotionPreviewButton() {
  const { t } = useI18n();
  const visible = useDockLayoutStore(state => state.visiblePanels.has('preview'));
  const activate = useDockLayoutStore(state => state.activatePanel);
  return <button type="button" className={`motion-button motion-preview-button${visible ? ' is-active' : ''}`}
    aria-label={visible ? t("Preview") : t("Open preview")} aria-pressed={visible}
    onClick={() => activate('preview')}>
    <MotionIcon name="monitor" size={14} />{visible ? t("Preview") : t("Open preview")}
  </button>;
}

export function applyMotionLayout(preset: 'edit' | 'code' | 'preview') {
  const store = useDockLayoutStore.getState();
  store.resetLayout();
  if (preset === 'edit') return;
  for (const id of useDockLayoutStore.getState().openPanels) {
    const keep = id === 'preview' || (preset === 'code' && (id === 'code' || id === 'timeline'));
    if (!keep) store.closePanel(id);
  }
  store.activatePanel(preset === 'code' ? 'code' : 'preview');
}

export function MotionLayoutMenu() {
  const { t } = useI18n();
  const panels = useDockLayoutStore(state => state.panels);
  const visiblePanels = useDockLayoutStore(state => state.visiblePanels);
  const activate = useDockLayoutStore(state => state.activatePanel);
  const close = useDockLayoutStore(state => state.closePanel);
  return <Menu aria-label={t("Panels and layout")} align="end" className="motion-layout-menu"
    trigger={<button type="button" className="motion-button motion-button-quiet"><MotionIcon name="grid" size={14} />{t("Layout")}</button>}>
    <div className="motion-menu-label">{t("Show panels")}</div>
    {panels.map(id => <MenuCheckboxItem key={id} checked={visiblePanels.has(id)}
      onCheckedChange={checked => checked ? activate(id) : close(id)}>{t(PANEL_DEFINITIONS[id].title)}</MenuCheckboxItem>)}
    <MenuSeparator />
    <div className="motion-menu-label">{t("Layout presets")}</div>
    <MenuItem onClick={() => applyMotionLayout('code')}>{t("Code workspace")}</MenuItem>
    <MenuItem onClick={() => applyMotionLayout('preview')}>{t("Focus preview")}</MenuItem>
    <MenuItem onClick={() => applyMotionLayout('edit')}>{t("Restore default layout")}</MenuItem>
    <div className="motion-menu-hint">{t("Drag panel tabs to rearrange. Your layout is saved automatically.")}</div>
  </Menu>;
}
