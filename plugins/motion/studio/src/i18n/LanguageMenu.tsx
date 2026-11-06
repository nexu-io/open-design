import { Menu, MenuRadioGroup, MenuRadioItem } from '../components/ui';
import { MotionIcon } from '../motion/icons';
import { useI18n, type Locale } from './I18n';

export function LanguageMenu() {
  const { t, locale, setLocale } = useI18n();
  return <Menu aria-label={t('Language')} align="end" trigger={
    <button type="button" className="motion-button motion-button-quiet motion-language-button" aria-label={t('Language')}>
      <MotionIcon name="globe" size={14} /><span>{locale === 'zh-CN' ? '中文' : 'EN'}</span>
    </button>
  }>
    <MenuRadioGroup value={locale} onValueChange={value => setLocale(value as Locale)}>
      <MenuRadioItem closeOnClick value="zh-CN">简体中文</MenuRadioItem>
      <MenuRadioItem closeOnClick value="en">English</MenuRadioItem>
    </MenuRadioGroup>
  </Menu>;
}
