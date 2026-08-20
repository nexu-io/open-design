import type { LandingLocaleCode } from '../i18n';

export interface HomeCampaignContent {
  title: string;
  detail: string;
}

export const HOME_CAMPAIGN_CONTENT_BY_LOCALE = {
  en: { title: 'Put top-tier intelligence to work—without limits.', detail: 'DeepSeek V4 Pro, V4 Flash and more — unlimited' },
  zh: { title: '这次，顶级智能无限用。', detail: 'DeepSeek V4 Pro 与 V4 Flash 等模型无限用' },
  'zh-tw': { title: '這次，頂級智能無限用。', detail: 'DeepSeek V4 Pro 與 V4 Flash 等模型無限用' },
  ja: { title: '最高峰の知性を、制限なく。', detail: 'DeepSeek V4 Pro・V4 Flash などのモデルが無制限' },
  ko: { title: '최고 수준의 지능, 제한 없이.', detail: 'DeepSeek V4 Pro·V4 Flash 등 모델 무제한' },
  de: { title: 'Spitzenintelligenz – ohne Zurückhaltung.', detail: 'DeepSeek V4 Pro, V4 Flash und weitere Modelle – unbegrenzt' },
  fr: { title: 'Libérez une intelligence de premier plan.', detail: 'DeepSeek V4 Pro, V4 Flash et d\'autres modèles — en illimité' },
  ru: { title: 'Используйте интеллект высшего уровня без ограничений.', detail: 'DeepSeek V4 Pro, V4 Flash и другие модели — без лимита' },
  es: { title: 'Inteligencia de primer nivel, sin límites.', detail: 'DeepSeek V4 Pro, V4 Flash y más modelos, sin límites' },
  'pt-br': { title: 'Inteligência de ponta, sem limites.', detail: 'DeepSeek V4 Pro, V4 Flash e outros modelos — sem limites' },
  it: { title: 'Intelligenza di alto livello, senza limiti.', detail: 'DeepSeek V4 Pro, V4 Flash e altri modelli — senza limiti' },
  tr: { title: 'Üst düzey zekâyı sınırsızca kullanın.', detail: 'DeepSeek V4 Pro, V4 Flash ve diğer modeller — sınırsız' },
} satisfies Partial<Record<LandingLocaleCode, HomeCampaignContent>>;

export function getHomeCampaignContent(locale: LandingLocaleCode): HomeCampaignContent {
  return HOME_CAMPAIGN_CONTENT_BY_LOCALE[locale as keyof typeof HOME_CAMPAIGN_CONTENT_BY_LOCALE]
    ?? HOME_CAMPAIGN_CONTENT_BY_LOCALE.en;
}
