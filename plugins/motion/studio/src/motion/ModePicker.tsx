import { creationModes, type CreationMode } from '../../../shared/session';
import { useI18n } from '../i18n/I18n';
import { MotionIcon } from './icons';

export function ModePicker({ value = 'motion', onChange }: { value?: CreationMode; onChange?: (mode: CreationMode) => void }) {
  const { t } = useI18n();
  return <label className="motion-mode-picker"><MotionIcon name="film" size={14} /><select aria-label={t('Creation mode')} value={value} onChange={event => onChange?.(event.target.value as CreationMode)}>{creationModes.map(mode => <option key={mode.id} value={mode.id}>{mode.title}</option>)}</select></label>;
}
